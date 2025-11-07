/**
 * Kernel client - runs in main thread, communicates with kernel worker
 */

import type {
  Kernel,
  ExecRequest,
  ExecResponse,
  CompleteRequest,
  CompleteResponse,
  InspectRequest,
  InspectResponse,
  Handle,
  KernelCapabilities,
} from '../types/index.js';

import {
  MessageType,
  type WorkerMessage,
  type ExecMessage,
  type CompleteMessage,
  type InspectMessage,
  type SaveStateMessage,
  type LoadStateMessage,
  type GetCapabilitiesMessage,
  type ShutdownMessage,
  generateMessageId,
} from './worker-protocol.js';

/**
 * Pending request
 */
interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout?: number;
}

/**
 * Kernel client configuration
 */
export interface KernelClientConfig {
  /** Worker script URL */
  workerUrl: string;

  /** Kernel type */
  kernelType: string;

  /** Kernel-specific configuration */
  kernelConfig?: Record<string, unknown>;

  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Kernel client implementation
 */
export class KernelClient implements Kernel {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private capabilities: KernelCapabilities | null = null;
  private initialized = false;
  private config: KernelClientConfig;

  /** Stream output callback */
  onStreamOutput?: (stream: 'stdout' | 'stderr', text: string) => void;

  constructor(config: KernelClientConfig) {
    this.config = {
      timeout: 30000, // 30s default
      ...config,
    };
  }

  /**
   * Initialize the kernel worker
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    this.worker = new Worker(this.config.workerUrl, { type: 'module' });
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.onerror = this.handleError.bind(this);

    // Send init message
    const response = await this.sendMessage<{ capabilities: KernelCapabilities }>({
      type: MessageType.Init,
      id: generateMessageId(),
      kernelType: this.config.kernelType,
      config: this.config.kernelConfig,
    });

    this.capabilities = response.capabilities;
    this.initialized = true;
  }

  /**
   * Handle incoming messages from worker
   */
  private handleMessage(event: MessageEvent<WorkerMessage>): void {
    const message = event.data;

    // Handle streaming output
    if (message.type === MessageType.StreamOutput) {
      if (this.onStreamOutput) {
        this.onStreamOutput(message.streamName, message.text);
      }
      return;
    }

    // Handle responses
    const pending = this.pendingRequests.get(message.id);
    if (!pending) return;

    this.pendingRequests.delete(message.id);

    if (message.type === MessageType.Error) {
      const error = new Error(message.error.message);
      error.name = message.error.name;
      if (message.error.stack) {
        error.stack = message.error.stack;
      }
      pending.reject(error);
    } else {
      pending.resolve(message);
    }
  }

  /**
   * Handle worker errors
   */
  private handleError(error: ErrorEvent): void {
    console.error('Kernel worker error:', error);

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      pending.reject(new Error(`Worker error: ${error.message}`));
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Send a message to the worker and wait for response
   */
  private sendMessage<T = any>(message: Omit<WorkerMessage, 'type'> & { type: MessageType }): Promise<T> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized'));
    }

    return new Promise((resolve, reject) => {
      const timeout = this.config.timeout
        ? window.setTimeout(() => {
            this.pendingRequests.delete(message.id);
            reject(new Error(`Request timeout: ${message.type}`));
          }, this.config.timeout)
        : undefined;

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout,
      });

      this.worker!.postMessage(message);
    });
  }

  /**
   * Execute code
   */
  async exec(request: ExecRequest): Promise<ExecResponse> {
    if (!this.initialized) {
      await this.init();
    }

    const message: ExecMessage = {
      type: MessageType.Exec,
      id: generateMessageId(),
      request,
    };

    const response = await this.sendMessage<{ response: ExecResponse }>(message);
    return response.response;
  }

  /**
   * Code completion
   */
  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    if (!this.capabilities?.supportsCompletion) {
      throw new Error('Kernel does not support completion');
    }

    const message: CompleteMessage = {
      type: MessageType.Complete,
      id: generateMessageId(),
      request,
    };

    const response = await this.sendMessage<{ response: CompleteResponse }>(message);
    return response.response;
  }

  /**
   * Symbol inspection
   */
  async inspect(request: InspectRequest): Promise<InspectResponse> {
    if (!this.capabilities?.supportsInspection) {
      throw new Error('Kernel does not support inspection');
    }

    const message: InspectMessage = {
      type: MessageType.Inspect,
      id: generateMessageId(),
      request,
    };

    const response = await this.sendMessage<{ response: InspectResponse }>(message);
    return response.response;
  }

  /**
   * Save kernel state
   */
  async saveState(): Promise<Handle> {
    if (!this.capabilities?.supportsStateManagement) {
      throw new Error('Kernel does not support state management');
    }

    const message: SaveStateMessage = {
      type: MessageType.SaveState,
      id: generateMessageId(),
    };

    const response = await this.sendMessage<{ handle: Handle }>(message);
    return response.handle;
  }

  /**
   * Load kernel state
   */
  async loadState(handle: Handle): Promise<void> {
    if (!this.capabilities?.supportsStateManagement) {
      throw new Error('Kernel does not support state management');
    }

    const message: LoadStateMessage = {
      type: MessageType.LoadState,
      id: generateMessageId(),
      handle,
    };

    await this.sendMessage(message);
  }

  /**
   * Get kernel capabilities
   */
  getCapabilities(): KernelCapabilities {
    if (!this.capabilities) {
      throw new Error('Kernel not initialized');
    }
    return this.capabilities;
  }

  /**
   * Shutdown kernel
   */
  async shutdown(): Promise<void> {
    if (!this.worker) return;

    const message: ShutdownMessage = {
      type: MessageType.Shutdown,
      id: generateMessageId(),
    };

    try {
      await this.sendMessage(message);
    } catch (e) {
      // Ignore errors during shutdown
    }

    this.worker.terminate();
    this.worker = null;
    this.initialized = false;
    this.capabilities = null;
    this.pendingRequests.clear();
  }

  /**
   * Check if kernel is ready
   */
  isReady(): boolean {
    return this.initialized && this.worker !== null;
  }
}
