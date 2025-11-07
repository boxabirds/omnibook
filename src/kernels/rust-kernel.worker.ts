/**
 * Rust kernel worker script
 */

import { initKernelWorker, registerKernel, streamOutput } from '../runtime/kernel-worker.js';
import { RustKernel, type RustKernelConfig } from './rust-kernel.js';

// Register Rust kernel factory
registerKernel('rust', async (config?: Record<string, unknown>) => {
  const rustConfig: RustKernelConfig = {
    ...config,
    onStreamOutput: (stream, text) => {
      streamOutput(stream, text);
    },
  };

  return new RustKernel(rustConfig);
});

// Initialize worker
initKernelWorker();
