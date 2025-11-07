/**
 * Core type definitions for the kernel ABI
 */

/**
 * Content-addressed handle to data in the Object Store
 */
export type Handle = string;

/**
 * Cell ID - unique identifier for a cell
 */
export type CellId = string;

/**
 * MIME type string (e.g., 'text/plain', 'application/json', 'image/png')
 */
export type MimeType = string;

/**
 * MIME bundle - rich display data like Jupyter's display_data
 */
export interface MimeBundle {
  [mimeType: MimeType]: unknown;
}

/**
 * Request to execute code in a kernel
 */
export interface ExecRequest {
  /** The code to execute */
  code: string;

  /** Input handles from other cells */
  inputs?: Record<string, Handle>;

  /** Language-specific execution flags/options */
  args?: Record<string, unknown>;

  /** Cell ID for tracking */
  cellId?: CellId;
}

/**
 * Response from kernel execution
 */
export interface ExecResponse {
  /** Output handles produced by this execution */
  outputs?: Record<string, Handle>;

  /** Rich display data (text, HTML, images, etc.) */
  display?: MimeBundle[];

  /** Console/log output */
  logs?: string[];

  /** Errors if execution failed */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };

  /** Optional state checkpoint handle */
  stateHint?: Handle | null;

  /** Execution metadata */
  metadata?: {
    executionTime?: number;
    memoryUsed?: number;
  };
}

/**
 * Request for code completion
 */
export interface CompleteRequest {
  code: string;
  cursor: number;
}

/**
 * Response with completion suggestions
 */
export interface CompleteResponse {
  completions: string[];
  start: number;
  end: number;
}

/**
 * Request to inspect a symbol
 */
export interface InspectRequest {
  symbol: string;
  code?: string;
}

/**
 * Response with symbol documentation
 */
export interface InspectResponse {
  documentation: string;
  signature?: string;
}

/**
 * Kernel capability manifest
 */
export interface KernelCapabilities {
  /** Can save and restore state */
  supportsStateManagement: boolean;

  /** Can provide code completions */
  supportsCompletion: boolean;

  /** Can provide symbol inspection */
  supportsInspection: boolean;

  /** Supports streaming output */
  supportsStreaming: boolean;

  /** Allowed syscalls (WASI subset) */
  allowedSyscalls?: string[];

  /** Network access allowed */
  allowNetwork: boolean;

  /** File system access */
  allowFileSystem: boolean;
}

/**
 * Uniform kernel interface that all language adapters implement
 */
export interface Kernel {
  /** Execute code */
  exec(request: ExecRequest): Promise<ExecResponse>;

  /** Code completion */
  complete?(request: CompleteRequest): Promise<CompleteResponse>;

  /** Symbol inspection */
  inspect?(request: InspectRequest): Promise<InspectResponse>;

  /** Save kernel state to a handle */
  saveState?(): Promise<Handle>;

  /** Restore kernel state from a handle */
  loadState?(handle: Handle): Promise<void>;

  /** Shutdown and cleanup */
  shutdown(): Promise<void>;

  /** Get kernel capabilities */
  getCapabilities(): KernelCapabilities;
}

/**
 * Kernel metadata
 */
export interface KernelMetadata {
  /** Unique kernel type identifier (e.g., 'python', 'rust', 'javascript') */
  type: string;

  /** Display name */
  name: string;

  /** Kernel version */
  version: string;

  /** Supported MIME types for output */
  supportedMimeTypes: MimeType[];

  /** File extensions for syntax highlighting */
  fileExtensions: string[];

  /** Language metadata */
  language: {
    name: string;
    version: string;
  };
}

/**
 * Data format for cross-language interchange
 */
export enum DataFormat {
  Arrow = 'arrow',
  NumPy = 'numpy',
  JSON = 'json',
  Binary = 'binary',
  Text = 'text',
}

/**
 * Type registry entry for format conversion
 */
export interface TypeDescriptor {
  /** Format identifier */
  format: DataFormat;

  /** Optional schema (e.g., Arrow schema) */
  schema?: unknown;

  /** Byte length if known */
  byteLength?: number;
}
