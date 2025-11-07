/**
 * Python kernel worker script
 */

import { initKernelWorker, registerKernel, streamOutput } from '../runtime/kernel-worker.js';
import { PythonKernel, type PythonKernelConfig } from './python-kernel.js';

// Register Python kernel factory
registerKernel('python', async (config?: Record<string, unknown>) => {
  const pythonConfig: PythonKernelConfig = {
    ...config,
    onStreamOutput: (stream, text) => {
      streamOutput(stream, text);
    },
  };

  const kernel = new PythonKernel(pythonConfig);
  await kernel.init();
  return kernel;
});

// Initialize worker
initKernelWorker();
