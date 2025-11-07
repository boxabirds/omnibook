/**
 * Kernel worker wrapper - runs inside Web Worker
 *
 * Handles messages from the main thread and delegates to the kernel implementation
 */

import type { Kernel } from '../types/index.js';
import {
  MessageType,
  type WorkerMessage,
  type InitMessage,
  type ExecMessage,
  type CompleteMessage,
  type InspectMessage,
  type SaveStateMessage,
  type LoadStateMessage,
  type GetCapabilitiesMessage,
  type ShutdownMessage,
} from './worker-protocol.js';

/**
 * Kernel factory function type
 */
export type KernelFactory = (config?: Record<string, unknown>) => Promise<Kernel> | Kernel;

/**
 * Register kernel factories
 */
const kernelFactories = new Map<string, KernelFactory>();

/**
 * Register a kernel factory
 */
export function registerKernel(type: string, factory: KernelFactory): void {
  kernelFactories.set(type, factory);
}

/**
 * Kernel worker class
 */
class KernelWorker {
  private kernel: Kernel | null = null;

  /**
   * Handle incoming messages
   */
  async handleMessage(event: MessageEvent<WorkerMessage>): Promise<void> {
    const message = event.data;

    try {
      switch (message.type) {
        case MessageType.Init:
          await this.handleInit(message);
          break;

        case MessageType.Exec:
          await this.handleExec(message);
          break;

        case MessageType.Complete:
          await this.handleComplete(message);
          break;

        case MessageType.Inspect:
          await this.handleInspect(message);
          break;

        case MessageType.SaveState:
          await this.handleSaveState(message);
          break;

        case MessageType.LoadState:
          await this.handleLoadState(message);
          break;

        case MessageType.GetCapabilities:
          await this.handleGetCapabilities(message);
          break;

        case MessageType.Shutdown:
          await this.handleShutdown(message);
          break;

        default:
          this.sendError(message.id, new Error(`Unknown message type: ${(message as any).type}`));
      }
    } catch (error) {
      this.sendError(message.id, error as Error);
    }
  }

  /**
   * Handle init message
   */
  private async handleInit(message: InitMessage): Promise<void> {
    const factory = kernelFactories.get(message.kernelType);
    if (!factory) {
      throw new Error(`Unknown kernel type: ${message.kernelType}`);
    }

    this.kernel = await factory(message.config);
    const capabilities = this.kernel.getCapabilities();

    self.postMessage({
      type: MessageType.InitComplete,
      id: message.id,
      capabilities,
    });
  }

  /**
   * Handle exec message
   */
  private async handleExec(message: ExecMessage): Promise<void> {
    if (!this.kernel) {
      throw new Error('Kernel not initialized');
    }

    const response = await this.kernel.exec(message.request);

    self.postMessage({
      type: MessageType.ExecResponse,
      id: message.id,
      response,
    });
  }

  /**
   * Handle complete message
   */
  private async handleComplete(message: CompleteMessage): Promise<void> {
    if (!this.kernel?.complete) {
      throw new Error('Kernel does not support completion');
    }

    const response = await this.kernel.complete(message.request);

    self.postMessage({
      type: MessageType.CompleteResponse,
      id: message.id,
      response,
    });
  }

  /**
   * Handle inspect message
   */
  private async handleInspect(message: InspectMessage): Promise<void> {
    if (!this.kernel?.inspect) {
      throw new Error('Kernel does not support inspection');
    }

    const response = await this.kernel.inspect(message.request);

    self.postMessage({
      type: MessageType.InspectResponse,
      id: message.id,
      response,
    });
  }

  /**
   * Handle save state message
   */
  private async handleSaveState(message: SaveStateMessage): Promise<void> {
    if (!this.kernel?.saveState) {
      throw new Error('Kernel does not support state management');
    }

    const handle = await this.kernel.saveState();

    self.postMessage({
      type: MessageType.SaveStateResponse,
      id: message.id,
      handle,
    });
  }

  /**
   * Handle load state message
   */
  private async handleLoadState(message: LoadStateMessage): Promise<void> {
    if (!this.kernel?.loadState) {
      throw new Error('Kernel does not support state management');
    }

    await this.kernel.loadState(message.handle);

    self.postMessage({
      type: MessageType.LoadStateComplete,
      id: message.id,
    });
  }

  /**
   * Handle get capabilities message
   */
  private async handleGetCapabilities(message: GetCapabilitiesMessage): Promise<void> {
    if (!this.kernel) {
      throw new Error('Kernel not initialized');
    }

    const capabilities = this.kernel.getCapabilities();

    self.postMessage({
      type: MessageType.GetCapabilitiesResponse,
      id: message.id,
      capabilities,
    });
  }

  /**
   * Handle shutdown message
   */
  private async handleShutdown(message: ShutdownMessage): Promise<void> {
    if (this.kernel) {
      await this.kernel.shutdown();
      this.kernel = null;
    }

    self.postMessage({
      type: MessageType.Shutdown,
      id: message.id,
    });
  }

  /**
   * Send error message
   */
  private sendError(id: string, error: Error): void {
    self.postMessage({
      type: MessageType.Error,
      id,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    });
  }

  /**
   * Send stream output
   */
  sendStreamOutput(streamName: 'stdout' | 'stderr', text: string): void {
    self.postMessage({
      type: MessageType.StreamOutput,
      id: 'stream',
      streamName,
      text,
    });
  }
}

/**
 * Initialize kernel worker
 */
export function initKernelWorker(): void {
  const worker = new KernelWorker();
  self.onmessage = (event) => worker.handleMessage(event);
}

/**
 * Export stream output function for kernels to use
 */
export function streamOutput(streamName: 'stdout' | 'stderr', text: string): void {
  self.postMessage({
    type: MessageType.StreamOutput,
    id: 'stream',
    streamName,
    text,
  });
}
