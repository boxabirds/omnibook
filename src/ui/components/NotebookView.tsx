import React, { useState, useEffect } from 'react';
import { Notebook, type NotebookConfig } from '../../runtime/notebook.js';
import type { NotebookCell as NotebookCellType } from '../../types/index.js';
import { Cell } from './Cell.js';

interface NotebookViewProps {
  config: NotebookConfig;
}

export function NotebookView({ config }: NotebookViewProps) {
  const [notebook] = useState(() => new Notebook(config));
  const [cells, setCells] = useState<NotebookCellType[]>([]);
  const [selectedKernel, setSelectedKernel] = useState('javascript');

  // Refresh cells periodically while executing
  useEffect(() => {
    const interval = setInterval(() => {
      setCells([...notebook.getCells()]);
    }, 100);

    return () => clearInterval(interval);
  }, [notebook]);

  const handleAddCell = () => {
    notebook.createCell(selectedKernel);
    setCells([...notebook.getCells()]);
  };

  const handleExecuteCell = async (cellId: string) => {
    try {
      await notebook.executeCell(cellId);
    } catch (error) {
      console.error('Execution error:', error);
    }
    setCells([...notebook.getCells()]);
  };

  const handleUpdateCell = (cellId: string, code: string) => {
    notebook.updateCell(cellId, code);
    setCells([...notebook.getCells()]);
  };

  const handleDeleteCell = (cellId: string) => {
    notebook.deleteCell(cellId);
    setCells([...notebook.getCells()]);
  };

  const handleExecuteAll = async () => {
    try {
      await notebook.executeAll();
    } catch (error) {
      console.error('Execution error:', error);
    }
    setCells([...notebook.getCells()]);
  };

  const handleExport = async () => {
    const doc = await notebook.export();
    const json = JSON.stringify(doc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.metadata.title}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const kernelOptions = Object.keys(config.kernels || {});

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '2rem',
        padding: '1rem',
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
          OmniBook
        </h1>
        <div style={{ flex: 1 }} />
        <select
          value={selectedKernel}
          onChange={(e) => setSelectedKernel(e.target.value)}
          style={{
            padding: '0.5rem',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
          }}
        >
          {kernelOptions.map((kernel) => (
            <option key={kernel} value={kernel}>
              {kernel}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddCell}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          + Add Cell
        </button>
        <button
          onClick={handleExecuteAll}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-success)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Run All
        </button>
        <button
          onClick={handleExport}
          style={{
            padding: '0.5rem 1rem',
            background: '#666',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Export
        </button>
      </div>

      {/* Cells */}
      {cells.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#999',
          border: '2px dashed var(--color-border)',
          borderRadius: '8px',
        }}>
          <p>No cells yet. Click "Add Cell" to get started.</p>
        </div>
      ) : (
        cells.map((cell) => (
          <Cell
            key={cell.id}
            cell={cell}
            onExecute={() => handleExecuteCell(cell.id)}
            onUpdate={(code) => handleUpdateCell(cell.id, code)}
            onDelete={() => handleDeleteCell(cell.id)}
          />
        ))
      )}

      {/* Stats */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        background: '#f9f9f9',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#666',
      }}>
        <div>Cells: {cells.length}</div>
        <div>Cross-Origin Isolated: {crossOriginIsolated ? 'Yes' : 'No'}</div>
        {!crossOriginIsolated && (
          <div style={{ color: 'var(--color-warning)', marginTop: '0.5rem' }}>
            SharedArrayBuffer not available. Zero-copy data sharing disabled.
          </div>
        )}
      </div>
    </div>
  );
}
