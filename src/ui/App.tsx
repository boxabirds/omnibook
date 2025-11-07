import React from 'react';
import { NotebookView } from './components/NotebookView';
import type { NotebookConfig } from '../runtime/notebook';

function App() {
  const config: NotebookConfig = {
    title: 'OmniBook Notebook',
    kernels: {
      javascript: {
        workerUrl: new URL('../kernels/javascript-kernel.worker.ts', import.meta.url).href,
        kernelType: 'javascript',
      },
      python: {
        workerUrl: new URL('../kernels/python-kernel.worker.ts', import.meta.url).href,
        kernelType: 'python',
      },
      rust: {
        workerUrl: new URL('../kernels/rust-kernel.worker.ts', import.meta.url).href,
        kernelType: 'rust',
      },
    },
  };

  return <NotebookView config={config} />;
}

export default App;
