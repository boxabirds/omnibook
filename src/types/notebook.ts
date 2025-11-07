/**
 * Notebook document structure and cell definitions
 */

import type { CellId, Handle, MimeBundle } from './kernel.js';

/**
 * Cell execution state
 */
export enum CellState {
  Idle = 'idle',
  Queued = 'queued',
  Running = 'running',
  Completed = 'completed',
  Error = 'error',
}

/**
 * Cell output types
 */
export interface CellOutput {
  /** Output ID */
  id: string;

  /** Output type */
  type: 'display' | 'stream' | 'error';

  /** MIME bundle for display output */
  data?: MimeBundle;

  /** Stream name ('stdout' or 'stderr') */
  name?: 'stdout' | 'stderr';

  /** Text content for stream output */
  text?: string;

  /** Error information */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };

  /** Timestamp */
  timestamp: number;
}

/**
 * Notebook cell definition
 */
export interface NotebookCell {
  /** Unique cell ID */
  id: CellId;

  /** Kernel type (python, javascript, rust, etc.) */
  kernelType: string;

  /** Cell source code */
  code: string;

  /** Execution state */
  state: CellState;

  /** Input handles this cell depends on */
  inputs?: Record<string, Handle>;

  /** Output handles this cell produces */
  outputs?: Record<string, Handle>;

  /** Cell outputs (display, logs, errors) */
  cellOutputs: CellOutput[];

  /** State checkpoint handle */
  stateCheckpoint?: Handle;

  /** Execution count */
  executionCount: number | null;

  /** Last execution time in ms */
  executionTime?: number;

  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Notebook document
 */
export interface NotebookDocument {
  /** Notebook metadata */
  metadata: {
    /** Notebook title */
    title: string;

    /** Creation timestamp */
    created: number;

    /** Last modified timestamp */
    modified: number;

    /** Author information */
    author?: string;

    /** Kernel versions used */
    kernels: Record<string, string>;

    /** Custom metadata */
    [key: string]: unknown;
  };

  /** Ordered list of cells */
  cells: NotebookCell[];

  /** Notebook-level outputs/artifacts */
  artifacts?: Record<string, Handle>;
}

/**
 * Notebook export bundle (for persistence/sharing)
 */
export interface NotebookBundle {
  /** Notebook document */
  notebook: NotebookDocument;

  /** Handle manifest: handle -> blob data */
  handleManifest: Record<Handle, Uint8Array>;

  /** Version information for reproducibility */
  versions: {
    omnibookVersion: string;
    kernelVersions: Record<string, string>;
  };

  /** Export timestamp */
  exportedAt: number;
}
