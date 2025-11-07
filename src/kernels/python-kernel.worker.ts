/**
 * Python kernel worker script
 */

import { initKernelWorker, registerKernel, streamOutput } from '../runtime/kernel-worker.js';
import { PythonKernel, type PythonKernelConfig } from './python-kernel.js';

// Load Pyodide script dynamically
const PYODIDE_VERSION = 'v0.25.0';
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

// Load Pyodide by injecting script into worker
let pyodideLoaded = false;

async function loadPyodideScript() {
  if (pyodideLoaded) return;

  // Fetch and eval the Pyodide loader script
  const response = await fetch(`${PYODIDE_CDN}pyodide.js`);
  const script = await response.text();

  // Execute the script in the worker context
  // This will make loadPyodide available globally
  (0, eval)(script);

  pyodideLoaded = true;
}

// Register Python kernel factory
registerKernel('python', async (config?: Record<string, unknown>) => {
  // Load Pyodide script first
  await loadPyodideScript();

  const pythonConfig: PythonKernelConfig = {
    indexURL: PYODIDE_CDN,
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
