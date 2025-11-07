import React from 'react';
import type { CellOutput as CellOutputType } from '../../types/index.js';

interface CellOutputProps {
  output: CellOutputType;
}

export function CellOutput({ output }: CellOutputProps) {
  if (output.type === 'stream') {
    return (
      <pre style={{
        margin: '0.5rem 0',
        padding: '0.5rem',
        background: output.name === 'stderr' ? '#fee' : '#f5f5f5',
        borderRadius: '4px',
        fontSize: '0.875rem',
        overflow: 'auto',
      }}>
        {output.text}
      </pre>
    );
  }

  if (output.type === 'error') {
    return (
      <div style={{
        margin: '0.5rem 0',
        padding: '0.75rem',
        background: '#fee',
        border: '1px solid #fcc',
        borderRadius: '4px',
        color: '#c00',
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {output.error?.name || 'Error'}
        </div>
        <div style={{ marginBottom: '0.5rem' }}>
          {output.error?.message}
        </div>
        {output.error?.stack && (
          <pre style={{
            fontSize: '0.75rem',
            overflow: 'auto',
            margin: 0,
          }}>
            {output.error.stack}
          </pre>
        )}
      </div>
    );
  }

  if (output.type === 'display' && output.data) {
    return <MimeDisplay data={output.data} />;
  }

  return null;
}

interface MimeDisplayProps {
  data: Record<string, any>;
}

function MimeDisplay({ data }: MimeDisplayProps) {
  // Preference order for MIME types
  const mimeOrder = [
    'text/html',
    'image/png',
    'image/jpeg',
    'application/json',
    'text/plain',
  ];

  for (const mimeType of mimeOrder) {
    if (data[mimeType]) {
      return <MimeRenderer mimeType={mimeType} content={data[mimeType]} />;
    }
  }

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}

interface MimeRendererProps {
  mimeType: string;
  content: any;
}

function MimeRenderer({ mimeType, content }: MimeRendererProps) {
  switch (mimeType) {
    case 'text/html':
      return (
        <div
          style={{ margin: '0.5rem 0' }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      );

    case 'image/png':
    case 'image/jpeg':
      return (
        <img
          src={`data:${mimeType};base64,${content}`}
          alt="Output"
          style={{ maxWidth: '100%', margin: '0.5rem 0' }}
        />
      );

    case 'application/json':
      return (
        <pre style={{
          margin: '0.5rem 0',
          padding: '0.75rem',
          background: '#f5f5f5',
          borderRadius: '4px',
          overflow: 'auto',
        }}>
          {JSON.stringify(content, null, 2)}
        </pre>
      );

    case 'text/plain':
    default:
      return (
        <pre style={{
          margin: '0.5rem 0',
          padding: '0.75rem',
          background: '#f5f5f5',
          borderRadius: '4px',
          overflow: 'auto',
        }}>
          {String(content)}
        </pre>
      );
  }
}
