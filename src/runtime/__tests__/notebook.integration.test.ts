/**
 * Notebook integration tests - cross-language execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Notebook } from '../notebook.js';
import { JavaScriptKernel } from '../../kernels/javascript-kernel.js';
import { CellState } from '../../types/index.js';
import { getObjectStore } from '../../core/object-store.js';

// Mock Python kernel for testing (don't load heavy Pyodide)
class MockPythonKernel {
      async init() {}

      async exec(request: any) {
        // Simulate Python processing
        const interchange = await import('../../core/data-interchange.js').then(m => m.getDataInterchange());
        const code = request.code;

        // Check if it's trying to access _ variable
        if (code.includes('_') && request.inputs?.['_']) {
          // Deserialize input (simulate Python receiving JS data)
          const inputValue = await interchange.deserialize(
            request.inputs['_'],
            request.inputDescriptors!['_']
          );

          // Simulate Python processing - return a mock result
          const result = { processed: true, input: inputValue };

          // Serialize output
          const { handle, descriptor } = await interchange.serialize(result);

          return {
            outputs: {
              '_': handle,
            },
            outputDescriptors: {
              '_': descriptor,
            },
            display: [{
              'text/plain': 'Mock Python result',
            }],
            logs: ['Python executed'],
          };
        }

        return {
          outputs: {},
          display: [],
          logs: ['Python executed'],
        };
      }

      async complete() {
        return { completions: [], start: 0, end: 0 };
      }

      async inspect() {
        return { documentation: 'Mock' };
      }

      async saveState() {
        return 'mock-state-handle';
      }

      async loadState() {}

      getCapabilities() {
        return {
          supportsStateManagement: true,
          supportsCompletion: true,
          supportsInspection: true,
          supportsStreaming: true,
          allowNetwork: false,
          allowFileSystem: false,
        };
      }

      async shutdown() {}
}

describe('Notebook Cross-Language Integration', () => {
  let notebook: Notebook;

  beforeEach(() => {
    // For testing, we'll use kernels directly without workers
    notebook = new Notebook({
      title: 'Test Notebook',
      kernels: {
        javascript: {
          type: 'javascript',
          // Return the kernel directly without worker wrapping
          kernel: new JavaScriptKernel(),
        } as any,
        python: {
          type: 'python',
          // Use mocked PythonKernel
          kernel: new MockPythonKernel() as any,
        } as any,
      },
    });
  });

  afterEach(async () => {
    await notebook.shutdown();

    // Clean up object store
    const store = await getObjectStore();
    await store.clear();
  });

  describe('JavaScript kernel', () => {
    it('should execute simple JavaScript code', async () => {
      const cellId = notebook.createCell('javascript', 'const x = 42; return x;');
      await notebook.executeCell(cellId);

      const cell = notebook.getCell(cellId);
      if (cell?.state !== CellState.Completed) {
        console.error('Cell error:', cell?.cellOutputs.find(o => o.type === 'error'));
      }
      expect(cell?.state).toBe(CellState.Completed);
      expect(cell?.outputs?.['_']).toBeDefined();
    });

    it('should export last expression as _', async () => {
      const cellId = notebook.createCell('javascript', 'return [1, 2, 3, 4, 5];');
      await notebook.executeCell(cellId);

      const cell = notebook.getCell(cellId);
      expect(cell?.state).toBe(CellState.Completed);
      expect(cell?.outputs?.['_']).toBeDefined();
      expect(cell?.outputDescriptors?.['_']).toBeDefined();
    });

    it('should access previous cell output via _', async () => {
      // Cell 1: Create data
      const cell1 = notebook.createCell('javascript', 'return [10, 20, 30];');
      await notebook.executeCell(cell1);

      // Cell 2: Access previous output
      const cell2 = notebook.createCell('javascript', 'return _.map(x => x * 2);');
      await notebook.executeCell(cell2);

      const result = notebook.getCell(cell2);
      expect(result?.state).toBe(CellState.Completed);
      expect(result?.outputs?.['_']).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      const cellId = notebook.createCell('javascript', 'throw new Error("Test error");');
      await notebook.executeCell(cellId);

      const cell = notebook.getCell(cellId);
      expect(cell?.state).toBe(CellState.Error);
      expect(cell?.cellOutputs.some(o => o.type === 'error')).toBe(true);
    });

    it('should capture console.log output', async () => {
      const cellId = notebook.createCell('javascript', 'console.log("Hello from JS"); return 42;');
      await notebook.executeCell(cellId);

      const cell = notebook.getCell(cellId);
      expect(cell?.cellOutputs.some(o => o.type === 'stream' && o.text?.includes('Hello from JS'))).toBe(true);
    });
  });

  describe('Cross-language data flow', () => {
    it('should pass data from JavaScript to Python', async () => {
      // Cell 1: JavaScript generates data
      const jsCell = notebook.createCell('javascript', 'return [1, 2, 3, 4, 5];');
      await notebook.executeCell(jsCell);

      const jsResult = notebook.getCell(jsCell);
      expect(jsResult?.state).toBe(CellState.Completed);
      expect(jsResult?.outputs?.['_']).toBeDefined();

      // Cell 2: Python receives data (mocked)
      const pyCell = notebook.createCell('python', 'result = _; result');
      await notebook.executeCell(pyCell);

      const pyResult = notebook.getCell(pyCell);
      expect(pyResult?.state).toBe(CellState.Completed);

      // Verify Python cell received the input
      expect(pyResult?.inputs?.['_']).toBe(jsResult?.outputs?.['_']);
      expect(pyResult?.inputDescriptors?.['_']).toEqual(jsResult?.outputDescriptors?.['_']);
    });

    it('should handle three-cell pipeline: JS → Python → JS', async () => {
      // Cell 1: JS generates array
      const cell1 = notebook.createCell('javascript', 'return Array.from({length: 10}, (_, i) => i * 2);');
      await notebook.executeCell(cell1);

      // Cell 2: Python processes (mocked to return processed result)
      const cell2 = notebook.createCell('python', `
        data = _;
        result = {'processed': True};
        result
      `);
      await notebook.executeCell(cell2);

      // Cell 3: JS displays
      const cell3 = notebook.createCell('javascript', 'return _;');
      await notebook.executeCell(cell3);

      // Debug: Check cell states and outputs
      const c1 = notebook.getCell(cell1);
      const c2 = notebook.getCell(cell2);
      const c3 = notebook.getCell(cell3);

      if (c3?.state !== CellState.Completed) {
        console.error('Cell 3 error:', c3?.cellOutputs.find(o => o.type === 'error'));
        console.error('Cell 3 inputs:', c3?.inputs);
        console.error('Cell 2 outputs:', c2?.outputs);
      }

      // Verify all cells completed
      expect(notebook.getCell(cell1)?.state).toBe(CellState.Completed);
      expect(notebook.getCell(cell2)?.state).toBe(CellState.Completed);
      expect(notebook.getCell(cell3)?.state).toBe(CellState.Completed);

      // Verify data flow
      const result1 = notebook.getCell(cell1);
      const result2 = notebook.getCell(cell2);
      const result3 = notebook.getCell(cell3);

      expect(result2?.inputs?.['_']).toBe(result1?.outputs?.['_']);
      expect(result3?.inputs?.['_']).toBe(result2?.outputs?.['_']);
    });
  });

  describe('Notebook operations', () => {
    it('should create and retrieve cells', () => {
      const cellId = notebook.createCell('javascript', 'const x = 1;');
      const cell = notebook.getCell(cellId);

      expect(cell).toBeDefined();
      expect(cell?.kernelType).toBe('javascript');
      expect(cell?.code).toBe('const x = 1;');
      expect(cell?.state).toBe(CellState.Idle);
    });

    it('should update cell code and invalidate', () => {
      const cellId = notebook.createCell('javascript', 'const x = 1;');
      notebook.updateCell(cellId, 'const x = 2;');

      const cell = notebook.getCell(cellId);
      expect(cell?.code).toBe('const x = 2;');
      expect(cell?.state).toBe(CellState.Idle);
    });

    it('should delete cells', () => {
      const cellId = notebook.createCell('javascript', 'const x = 1;');
      notebook.deleteCell(cellId);

      const cell = notebook.getCell(cellId);
      expect(cell).toBeUndefined();
    });

    it('should export and import notebook', async () => {
      // Create some cells
      const cell1 = notebook.createCell('javascript', 'const x = 1;');
      const cell2 = notebook.createCell('python', 'y = 2');

      // Export
      const exported = await notebook.export();
      expect(exported.cells).toHaveLength(2);
      expect(exported.metadata.title).toBe('Test Notebook');

      // Create new notebook and import
      const notebook2 = new Notebook();
      await notebook2.import(exported);

      expect(notebook2.getCells()).toHaveLength(2);
      expect(notebook2.getCell(cell1)?.code).toBe('const x = 1;');
      expect(notebook2.getCell(cell2)?.code).toBe('y = 2');

      await notebook2.shutdown();
    });
  });

  describe('Error scenarios that caused issues', () => {
    it('should not fail when accessing _ in first cell (regression test)', async () => {
      // This was causing NameError in Python
      const cellId = notebook.createCell('javascript', 'const x = _; x;');
      await notebook.executeCell(cellId);

      const cell = notebook.getCell(cellId);
      // Should error because _ doesn't exist in first cell
      expect(cell?.state).toBe(CellState.Error);
    });

    it('should make previous cell output available as _ (regression test)', async () => {
      // This test verifies the fix for the "temperatureData is not defined" error
      const cell1 = notebook.createCell('javascript', 'return [20, 21, 22];');
      await notebook.executeCell(cell1);

      const cell2 = notebook.createCell('javascript', 'return _.length;');
      await notebook.executeCell(cell2);

      const result2 = notebook.getCell(cell2);
      expect(result2?.state).toBe(CellState.Completed);
      expect(result2?.inputs?.['_']).toBeDefined();
    });

    it('should not expose Cell 1 outputs to Cell 3 (only Cell 2) (current limitation)', async () => {
      // This test documents the current limitation
      const cell1 = notebook.createCell('javascript', 'return 100;');
      await notebook.executeCell(cell1);

      const cell2 = notebook.createCell('javascript', 'return 200;');
      await notebook.executeCell(cell2);

      const cell3 = notebook.createCell('javascript', 'return _; // This is cell2 output, not cell1');
      await notebook.executeCell(cell3);

      const result3 = notebook.getCell(cell3);
      // Cell 3 only sees Cell 2's output
      expect(result3?.inputs?.['_']).toBe(notebook.getCell(cell2)?.outputs?.['_']);
      // NOT Cell 1's output
      expect(result3?.inputs?.['_']).not.toBe(notebook.getCell(cell1)?.outputs?.['_']);
    });
  });
});
