/**
 * Notebook orchestrator - manages cells, execution, and state
 */

import { CellDAG } from '../core/cell-dag.js';
import { getObjectStore } from '../core/object-store.js';
import { KernelClient, type KernelClientConfig } from './kernel-client.js';
import {
  CellState,
  type CellId,
  type Handle,
  type NotebookDocument,
  type NotebookCell,
  type CellOutput,
  type ExecRequest,
  type KernelMetadata,
} from '../types/index.js';

/**
 * Kernel registry entry
 */
interface KernelEntry {
  client: KernelClient;
  metadata: KernelMetadata;
}

/**
 * Notebook configuration
 */
export interface NotebookConfig {
  /** Notebook title */
  title?: string;

  /** Available kernel configurations */
  kernels?: Record<string, KernelClientConfig>;
}

/**
 * Notebook orchestrator
 */
export class Notebook {
  private dag = new CellDAG();
  private cells = new Map<CellId, NotebookCell>();
  private kernels = new Map<string, KernelEntry>();
  private executionQueue: CellId[] = [];
  private executing = false;
  private outputCounter = 0;

  private config: NotebookConfig;
  private metadata: NotebookDocument['metadata'];

  constructor(config: NotebookConfig = {}) {
    this.config = config;
    this.metadata = {
      title: config.title || 'Untitled Notebook',
      created: Date.now(),
      modified: Date.now(),
      kernels: {},
    };
  }

  /**
   * Create a new cell
   */
  createCell(kernelType: string, code: string = ''): CellId {
    const cellId = `cell-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const cell: NotebookCell = {
      id: cellId,
      kernelType,
      code,
      state: CellState.Idle,
      cellOutputs: [],
      executionCount: null,
    };

    this.cells.set(cellId, cell);
    this.dag.addCell(cellId);
    this.metadata.modified = Date.now();

    return cellId;
  }

  /**
   * Update cell code
   */
  updateCell(cellId: CellId, code: string): void {
    const cell = this.cells.get(cellId);
    if (!cell) {
      throw new Error(`Cell not found: ${cellId}`);
    }

    cell.code = code;
    cell.state = CellState.Idle;
    this.dag.invalidate(cellId);
    this.metadata.modified = Date.now();
  }

  /**
   * Delete a cell
   */
  deleteCell(cellId: CellId): void {
    this.cells.delete(cellId);
    this.dag.removeCell(cellId);
    this.metadata.modified = Date.now();
  }

  /**
   * Get a cell
   */
  getCell(cellId: CellId): NotebookCell | undefined {
    return this.cells.get(cellId);
  }

  /**
   * Get all cells
   */
  getCells(): NotebookCell[] {
    return Array.from(this.cells.values());
  }

  /**
   * Generate unique output ID
   */
  private generateOutputId(): string {
    return `output-${Date.now()}-${++this.outputCounter}`;
  }

  /**
   * Get or create kernel client for a kernel type
   */
  private async getKernel(kernelType: string): Promise<KernelClient> {
    let entry = this.kernels.get(kernelType);

    if (!entry) {
      // Get kernel config
      const kernelConfig = this.config.kernels?.[kernelType];
      if (!kernelConfig) {
        throw new Error(`No configuration for kernel type: ${kernelType}`);
      }

      // Create kernel client
      const client = new KernelClient(kernelConfig);
      await client.init();

      entry = {
        client,
        metadata: {
          type: kernelType,
          name: kernelType,
          version: '1.0.0',
          supportedMimeTypes: ['text/plain', 'text/html', 'application/json'],
          fileExtensions: [],
          language: {
            name: kernelType,
            version: '1.0.0',
          },
        },
      };

      this.kernels.set(kernelType, entry);
      this.metadata.kernels[kernelType] = '1.0.0';
    }

    return entry.client;
  }

  /**
   * Execute a cell
   */
  async executeCell(cellId: CellId): Promise<void> {
    const cell = this.cells.get(cellId);
    if (!cell) {
      throw new Error(`Cell not found: ${cellId}`);
    }

    // Mark as running
    cell.state = CellState.Running;
    cell.cellOutputs = [];

    const startTime = Date.now();

    try {
      // Get kernel
      const kernel = await this.getKernel(cell.kernelType);

      // Set up stream output handler
      kernel.onStreamOutput = (stream, text) => {
        const output: CellOutput = {
          id: this.generateOutputId(),
          type: 'stream',
          name: stream,
          text,
          timestamp: Date.now(),
        };
        cell.cellOutputs.push(output);
      };

      // Auto-populate inputs from all previous cells (Jupyter-like behavior)
      // This makes variables from previous cells automatically available
      const inputs: Record<string, Handle> = {};
      const inputDescriptors: Record<string, import('../types/kernel.js').TypeDescriptor> = {};

      const cellOrder = Array.from(this.cells.keys());
      const currentIndex = cellOrder.indexOf(cellId);

      for (let i = 0; i < currentIndex; i++) {
        const prevCellId = cellOrder[i];
        const prevCell = this.cells.get(prevCellId);

        if (prevCell?.outputs && prevCell?.outputDescriptors) {
          // Make all outputs from previous cells available
          for (const [varName, handle] of Object.entries(prevCell.outputs)) {
            const descriptor = prevCell.outputDescriptors[varName];
            if (descriptor) {
              inputs[varName] = handle;
              inputDescriptors[varName] = descriptor;
            }
          }
        }
      }

      // Store the computed inputs on the cell
      cell.inputs = Object.keys(inputs).length > 0 ? inputs : undefined;
      cell.inputDescriptors = Object.keys(inputDescriptors).length > 0 ? inputDescriptors : undefined;

      // Prepare execution request
      const request: ExecRequest = {
        code: cell.code,
        inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
        inputDescriptors: Object.keys(inputDescriptors).length > 0 ? inputDescriptors : undefined,
        cellId,
      };

      // Execute
      const response = await kernel.exec(request);

      // Update cell with results
      if (response.outputs) {
        cell.outputs = response.outputs;
        cell.outputDescriptors = response.outputDescriptors;
        this.dag.setOutputs(cellId, response.outputs);
      }

      // Add display outputs
      if (response.display) {
        for (const mimeBundle of response.display) {
          const output: CellOutput = {
            id: this.generateOutputId(),
            type: 'display',
            data: mimeBundle,
            timestamp: Date.now(),
          };
          cell.cellOutputs.push(output);
        }
      }

      // Add logs
      if (response.logs) {
        for (const log of response.logs) {
          const output: CellOutput = {
            id: this.generateOutputId(),
            type: 'stream',
            name: 'stdout',
            text: log,
            timestamp: Date.now(),
          };
          cell.cellOutputs.push(output);
        }
      }

      // Handle errors
      if (response.error) {
        const output: CellOutput = {
          id: this.generateOutputId(),
          type: 'error',
          error: response.error,
          timestamp: Date.now(),
        };
        cell.cellOutputs.push(output);
        cell.state = CellState.Error;
      } else {
        cell.state = CellState.Completed;
        this.dag.markExecuted(cellId);
      }

      // Update execution metadata
      cell.executionTime = Date.now() - startTime;
      cell.executionCount = (cell.executionCount || 0) + 1;
      cell.stateCheckpoint = response.stateHint || undefined;

      this.metadata.modified = Date.now();
    } catch (error: any) {
      // Execution error
      const output: CellOutput = {
        id: this.generateOutputId(),
        type: 'error',
        error: {
          name: error.name || 'Error',
          message: error.message || String(error),
          stack: error.stack,
        },
        timestamp: Date.now(),
      };
      cell.cellOutputs.push(output);
      cell.state = CellState.Error;
      cell.executionTime = Date.now() - startTime;
    }
  }

  /**
   * Execute all dirty cells in dependency order
   */
  async executeAll(): Promise<void> {
    if (this.executing) {
      throw new Error('Already executing');
    }

    this.executing = true;

    try {
      const order = this.dag.getDirtyExecutionOrder();

      for (const cellId of order) {
        await this.executeCell(cellId);
      }
    } finally {
      this.executing = false;
    }
  }

  /**
   * Save notebook checkpoint
   */
  async checkpoint(): Promise<void> {
    for (const cellId of this.dag.getAllCells()) {
      const cell = this.cells.get(cellId);
      if (!cell) continue;

      const kernel = await this.getKernel(cell.kernelType);
      const capabilities = kernel.getCapabilities();

      if (capabilities.supportsStateManagement) {
        try {
          const handle = await kernel.saveState();
          cell.stateCheckpoint = handle;
        } catch (error) {
          console.error(`Failed to checkpoint cell ${cellId}:`, error);
        }
      }
    }

    this.metadata.modified = Date.now();
  }

  /**
   * Restore notebook from checkpoint
   */
  async restore(): Promise<void> {
    for (const cellId of this.dag.getTopologicalOrder()) {
      const cell = this.cells.get(cellId);
      if (!cell || !cell.stateCheckpoint) continue;

      const kernel = await this.getKernel(cell.kernelType);
      const capabilities = kernel.getCapabilities();

      if (capabilities.supportsStateManagement) {
        try {
          await kernel.loadState(cell.stateCheckpoint);
        } catch (error) {
          console.error(`Failed to restore cell ${cellId}:`, error);
        }
      }
    }
  }

  /**
   * Export notebook to JSON
   */
  async export(): Promise<NotebookDocument> {
    return {
      metadata: { ...this.metadata },
      cells: Array.from(this.cells.values()),
    };
  }

  /**
   * Import notebook from JSON
   */
  async import(doc: NotebookDocument): Promise<void> {
    this.metadata = { ...doc.metadata };

    // Clear existing cells
    this.cells.clear();
    this.dag.clear();

    // Import cells
    for (const cellData of doc.cells) {
      this.cells.set(cellData.id, { ...cellData });
      this.dag.addCell(cellData.id);

      if (cellData.inputs) {
        this.dag.setInputs(cellData.id, cellData.inputs);
      }
      if (cellData.outputs) {
        this.dag.setOutputs(cellData.id, cellData.outputs);
      }
    }
  }

  /**
   * Shutdown all kernels
   */
  async shutdown(): Promise<void> {
    for (const entry of this.kernels.values()) {
      await entry.client.shutdown();
    }
    this.kernels.clear();
  }

  /**
   * Get notebook statistics
   */
  getStats() {
    return {
      cellCount: this.cells.size,
      kernelCount: this.kernels.size,
      dag: this.dag.getStats(),
      metadata: this.metadata,
    };
  }
}
