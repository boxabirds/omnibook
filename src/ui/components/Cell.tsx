import React, { useState } from 'react';
import type { NotebookCell } from '../../types/index.js';
import { CellOutput } from './CellOutput.js';

interface CellProps {
  cell: NotebookCell;
  onExecute: () => void;
  onUpdate: (code: string) => void;
  onDelete: () => void;
}

export function Cell({ cell, onExecute, onUpdate, onDelete }: CellProps) {
  const [isEditing, setIsEditing] = useState(true);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Shift+Enter to execute
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      onExecute();
    }
  };

  const stateColors = {
    idle: '#999',
    queued: '#f90',
    running: '#2563eb',
    completed: '#16a34a',
    error: '#dc2626',
  };

  return (
    <div style={{
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      marginBottom: '1rem',
      overflow: 'hidden',
    }}>
      {/* Cell Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.5rem 1rem',
        background: '#f9f9f9',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 'bold',
          color: stateColors[cell.state],
        }}>
          {cell.executionCount !== null ? `[${cell.executionCount}]` : '[ ]'}
        </span>
        <span style={{
          fontSize: '0.75rem',
          color: '#666',
          textTransform: 'uppercase',
        }}>
          {cell.kernelType}
        </span>
        <div style={{ flex: 1 }} />
        {cell.executionTime && (
          <span style={{ fontSize: '0.75rem', color: '#999' }}>
            {cell.executionTime}ms
          </span>
        )}
        <button
          onClick={onExecute}
          disabled={cell.state === 'running'}
          style={{
            padding: '0.25rem 0.75rem',
            fontSize: '0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            background: cell.state === 'running' ? '#ddd' : '#fff',
            cursor: cell.state === 'running' ? 'not-allowed' : 'pointer',
          }}
        >
          {cell.state === 'running' ? 'Running...' : 'Run'}
        </button>
        <button
          onClick={onDelete}
          style={{
            padding: '0.25rem 0.75rem',
            fontSize: '0.75rem',
            border: '1px solid #fcc',
            borderRadius: '4px',
            background: '#fff',
            color: '#c00',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>

      {/* Cell Input */}
      <div style={{ padding: '1rem' }}>
        <textarea
          value={cell.code}
          onChange={(e) => onUpdate(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Enter ${cell.kernelType} code... (Shift+Enter to run)`}
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '0.75rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            resize: 'vertical',
            outline: 'none',
          }}
        />
      </div>

      {/* Cell Outputs */}
      {cell.cellOutputs.length > 0 && (
        <div style={{
          padding: '0 1rem 1rem',
          borderTop: '1px solid var(--color-border)',
          background: '#fafafa',
        }}>
          <div style={{ paddingTop: '1rem' }}>
            {cell.cellOutputs.map((output) => (
              <CellOutput key={output.id} output={output} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
