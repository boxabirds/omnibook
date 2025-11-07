/**
 * JavaScript kernel worker script
 */

import { initKernelWorker, registerKernel, streamOutput } from '../runtime/kernel-worker.js';
import { JavaScriptKernel, type JavaScriptKernelConfig } from './javascript-kernel.js';

// Register JavaScript kernel factory
registerKernel('javascript', async (config?: Record<string, unknown>) => {
  const jsConfig: JavaScriptKernelConfig = {
    ...config,
    onStreamOutput: (stream, text) => {
      streamOutput(stream, text);
    },
  };

  return new JavaScriptKernel(jsConfig);
});

// Initialize worker
initKernelWorker();
