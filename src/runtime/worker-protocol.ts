/**
 * Message protocol for kernel worker communication
 */

import type {
  ExecRequest,
  ExecResponse,
  CompleteRequest,
  CompleteResponse,
  InspectRequest,
  InspectResponse,
  Handle,
  KernelCapabilities,
} from '../types/index.js';

/**
 * Message types
 */
export enum MessageType {
  // Lifecycle
  Init = 'init',
  InitComplete = 'init_complete',
  Shutdown = 'shutdown',

  // Execution
  Exec = 'exec',
  ExecResponse = 'exec_response',

  // Code intelligence
  Complete = 'complete',
  CompleteResponse = 'complete_response',
  Inspect = 'inspect',
  InspectResponse = 'inspect_response',

  // State management
  SaveState = 'save_state',
  SaveStateResponse = 'save_state_response',
  LoadState = 'load_state',
  LoadStateComplete = 'load_state_complete',

  // Capabilities
  GetCapabilities = 'get_capabilities',
  GetCapabilitiesResponse = 'get_capabilities_response',

  // Streaming output
  StreamOutput = 'stream_output',

  // Error
  Error = 'error',
}

/**
 * Base message structure
 */
export interface BaseMessage {
  type: MessageType;
  id: string; // Request/response correlation ID
}

/**
 * Init message - initialize kernel
 */
export interface InitMessage extends BaseMessage {
  type: MessageType.Init;
  kernelType: string;
  config?: Record<string, unknown>;
}

/**
 * Init complete message
 */
export interface InitCompleteMessage extends BaseMessage {
  type: MessageType.InitComplete;
  capabilities: KernelCapabilities;
}

/**
 * Exec message
 */
export interface ExecMessage extends BaseMessage {
  type: MessageType.Exec;
  request: ExecRequest;
}

/**
 * Exec response message
 */
export interface ExecResponseMessage extends BaseMessage {
  type: MessageType.ExecResponse;
  response: ExecResponse;
}

/**
 * Complete message
 */
export interface CompleteMessage extends BaseMessage {
  type: MessageType.Complete;
  request: CompleteRequest;
}

/**
 * Complete response message
 */
export interface CompleteResponseMessage extends BaseMessage {
  type: MessageType.CompleteResponse;
  response: CompleteResponse;
}

/**
 * Inspect message
 */
export interface InspectMessage extends BaseMessage {
  type: MessageType.Inspect;
  request: InspectRequest;
}

/**
 * Inspect response message
 */
export interface InspectResponseMessage extends BaseMessage {
  type: MessageType.InspectResponse;
  response: InspectResponse;
}

/**
 * Save state message
 */
export interface SaveStateMessage extends BaseMessage {
  type: MessageType.SaveState;
}

/**
 * Save state response message
 */
export interface SaveStateResponseMessage extends BaseMessage {
  type: MessageType.SaveStateResponse;
  handle: Handle;
}

/**
 * Load state message
 */
export interface LoadStateMessage extends BaseMessage {
  type: MessageType.LoadState;
  handle: Handle;
}

/**
 * Load state complete message
 */
export interface LoadStateCompleteMessage extends BaseMessage {
  type: MessageType.LoadStateComplete;
}

/**
 * Get capabilities message
 */
export interface GetCapabilitiesMessage extends BaseMessage {
  type: MessageType.GetCapabilities;
}

/**
 * Get capabilities response message
 */
export interface GetCapabilitiesResponseMessage extends BaseMessage {
  type: MessageType.GetCapabilitiesResponse;
  capabilities: KernelCapabilities;
}

/**
 * Stream output message (kernel -> host)
 */
export interface StreamOutputMessage extends BaseMessage {
  type: MessageType.StreamOutput;
  streamName: 'stdout' | 'stderr';
  text: string;
}

/**
 * Shutdown message
 */
export interface ShutdownMessage extends BaseMessage {
  type: MessageType.Shutdown;
}

/**
 * Error message
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.Error;
  error: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Union of all message types
 */
export type WorkerMessage =
  | InitMessage
  | InitCompleteMessage
  | ExecMessage
  | ExecResponseMessage
  | CompleteMessage
  | CompleteResponseMessage
  | InspectMessage
  | InspectResponseMessage
  | SaveStateMessage
  | SaveStateResponseMessage
  | LoadStateMessage
  | LoadStateCompleteMessage
  | GetCapabilitiesMessage
  | GetCapabilitiesResponseMessage
  | StreamOutputMessage
  | ShutdownMessage
  | ErrorMessage;

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
