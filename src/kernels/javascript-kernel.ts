/**
 * JavaScript/TypeScript kernel
 *
 * Executes JavaScript code directly in the worker context
 * @version 1.1.0 - Fixed template literal escaping in eval mode
 */

import type {
  Kernel,
  ExecRequest,
  ExecResponse,
  CompleteRequest,
  CompleteResponse,
  InspectRequest,
  InspectResponse,
  Handle,
  KernelCapabilities,
  MimeBundle,
  TypeDescriptor,
} from '../types/index.js';

import { getObjectStore } from '../core/object-store.js';
import { getDataInterchange } from '../core/data-interchange.js';

/**
 * JavaScript kernel configuration
 */
export interface JavaScriptKernelConfig {
  /** Stream output callback */
  onStreamOutput?: (stream: 'stdout' | 'stderr', text: string) => void;
}

/**
 * JavaScript kernel implementation
 */
export class JavaScriptKernel implements Kernel {
  private globals: Record<string, any> = {};
  private config: JavaScriptKernelConfig;
  private executionCount = 0;

  // Captured console output
  private stdoutBuffer: string[] = [];
  private stderrBuffer: string[] = [];

  constructor(config: JavaScriptKernelConfig = {}) {
    this.config = config;
    this.setupConsoleCapture();
  }

  /**
   * Initialize kernel (no-op for JavaScript)
   */
  async init(): Promise<void> {
    // JavaScript kernel doesn't require initialization
  }

  /**
   * Set up console output capture
   */
  private setupConsoleCapture(): void {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: any[]) => {
      const text = args.map(a => this.formatValue(a)).join(' ') + '\n';
      this.stdoutBuffer.push(text);
      if (this.config.onStreamOutput) {
        this.config.onStreamOutput('stdout', text);
      }
      originalLog.apply(console, args);
    };

    console.error = (...args: any[]) => {
      const text = args.map(a => this.formatValue(a)).join(' ') + '\n';
      this.stderrBuffer.push(text);
      if (this.config.onStreamOutput) {
        this.config.onStreamOutput('stderr', text);
      }
      originalError.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const text = args.map(a => this.formatValue(a)).join(' ') + '\n';
      this.stderrBuffer.push(text);
      if (this.config.onStreamOutput) {
        this.config.onStreamOutput('stderr', text);
      }
      originalWarn.apply(console, args);
    };
  }

  /**
   * Format a value for display
   */
  private formatValue(value: any): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /**
   * Convert value to MIME bundle
   */
  private toMimeBundle(value: any): MimeBundle {
    const bundle: MimeBundle = {};

    // Text representation
    if (typeof value === 'string') {
      bundle['text/plain'] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      bundle['text/plain'] = String(value);
    } else if (value === null || value === undefined) {
      bundle['text/plain'] = String(value);
    } else {
      // Try JSON
      try {
        bundle['application/json'] = value;
        bundle['text/plain'] = JSON.stringify(value, null, 2);
      } catch {
        bundle['text/plain'] = String(value);
      }
    }

    // Check for HTML representation
    if (value && typeof value === 'object' && '_repr_html_' in value) {
      bundle['text/html'] = value._repr_html_();
    }

    return bundle;
  }

  /**
   * Execute JavaScript code
   */
  async exec(request: ExecRequest): Promise<ExecResponse> {
    const startTime = Date.now();

    // Clear output buffers
    this.stdoutBuffer = [];
    this.stderrBuffer = [];

    const display: MimeBundle[] = [];
    const logs: string[] = [];

    try {
      const interchange = getDataInterchange();

      // Load input handles using data interchange
      if (request.inputs && request.inputDescriptors) {
        for (const [name, handle] of Object.entries(request.inputs)) {
          const descriptor = request.inputDescriptors[name];
          if (descriptor) {
            const value = await interchange.deserialize(handle, descriptor);
            this.globals[name] = value;
          }
        }
      }

      // Create execution context
      const contextKeys = Object.keys(this.globals);
      const contextValues = Object.values(this.globals);

      // Add display function
      const displayFunc = (value: any) => {
        display.push(this.toMimeBundle(value));
      };

      // Execute code in context
      const contextObj = { ...this.globals, display: displayFunc };

      // Check if code contains explicit return statements
      const hasExplicitReturn = /\breturn\b/.test(request.code);

      let wrappedCode;
      if (hasExplicitReturn) {
        // Code with explicit return - wrap in async function
        wrappedCode = `
          with (this) {
            return (async function() {
              ${request.code}
            })();
          }
        `;
      } else {
        // Jupyter-style - execute and try to capture last expression
        // Use string escaping instead of template literal to avoid escaping hell
        const escapedCode = JSON.stringify(request.code);
        wrappedCode = `
          with (this) {
            return (async function() {
              return eval(${escapedCode});
            })();
          }
        `;
      }

      const func = new Function(wrappedCode);
      const result = await func.call(contextObj);

      // Update globals with any new variables defined in this execution
      // Note: variables defined with const/let in eval don't leak to context,
      // so we use a different approach - we'll evaluate in the global scope
      // For now, store result as _ for next cell
      if (result !== undefined) {
        this.globals['_'] = result;
      }

      // Collect console output
      const stdout = this.stdoutBuffer.join('');
      const stderr = this.stderrBuffer.join('');

      if (stdout) {
        logs.push(stdout);
      }

      // Prepare outputs using data interchange
      const outputs: Record<string, Handle> = {};
      const outputDescriptors: Record<string, TypeDescriptor> = {};

      // If there's a result, export it automatically
      if (result !== undefined) {
        this.globals['_'] = result;
        display.push(this.toMimeBundle(result));

        // Automatically serialize and export the result
        const { handle, descriptor } = await interchange.serialize(result);
        outputs['_'] = handle;
        outputDescriptors['_'] = descriptor;
      }

      this.executionCount++;

      return {
        outputs,
        outputDescriptors,
        display,
        logs,
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      const stderr = this.stderrBuffer.join('');

      return {
        display,
        logs: stderr ? [stderr] : [],
        error: {
          name: error.name || 'JavaScriptError',
          message: error.message || String(error),
          stack: error.stack,
        },
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Code completion
   */
  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    try {
      const beforeCursor = request.code.slice(0, request.cursor);
      const match = beforeCursor.match(/[a-zA-Z_$][a-zA-Z0-9_$]*$/);

      if (!match) {
        return { completions: [], start: request.cursor, end: request.cursor };
      }

      const prefix = match[0];
      const start = request.cursor - prefix.length;

      // Get completions from globals and built-ins
      const completions = new Set<string>();

      // Global scope
      for (const key of Object.keys(this.globals)) {
        if (key.startsWith(prefix) && !key.startsWith('_')) {
          completions.add(key);
        }
      }

      // Built-ins
      for (const key of Object.getOwnPropertyNames(globalThis)) {
        if (key.startsWith(prefix)) {
          completions.add(key);
        }
      }

      return {
        completions: Array.from(completions).slice(0, 50),
        start,
        end: request.cursor,
      };
    } catch (error) {
      return { completions: [], start: request.cursor, end: request.cursor };
    }
  }

  /**
   * Symbol inspection
   */
  async inspect(request: InspectRequest): Promise<InspectResponse> {
    try {
      let obj: any;

      // Try to resolve symbol
      if (request.symbol in this.globals) {
        obj = this.globals[request.symbol];
      } else if (request.symbol in globalThis) {
        obj = (globalThis as any)[request.symbol];
      }

      if (!obj) {
        return { documentation: 'Symbol not found' };
      }

      let documentation = `Type: ${typeof obj}\n\n`;

      if (typeof obj === 'function') {
        documentation += `Signature: ${obj.toString().split('\n')[0]}\n\n`;
      }

      if (obj.constructor && obj.constructor.name) {
        documentation += `Constructor: ${obj.constructor.name}\n\n`;
      }

      // List properties
      const props = Object.getOwnPropertyNames(obj).filter(p => !p.startsWith('_'));
      if (props.length > 0) {
        documentation += `Properties: ${props.slice(0, 20).join(', ')}`;
      }

      return {
        documentation,
        signature: typeof obj === 'function' ? obj.toString().split('\n')[0] : undefined,
      };
    } catch (error) {
      return { documentation: 'No information available' };
    }
  }

  /**
   * Save kernel state
   */
  async saveState(): Promise<Handle> {
    const state = JSON.stringify(this.globals);
    const bytes = new TextEncoder().encode(state);

    const store = await getObjectStore();
    return await store.put(bytes);
  }

  /**
   * Load kernel state
   */
  async loadState(handle: Handle): Promise<void> {
    const store = await getObjectStore();
    const bytes = await store.get(handle);
    if (!bytes) {
      throw new Error('State not found');
    }

    const state = JSON.parse(new TextDecoder().decode(bytes));
    this.globals = state;
  }

  /**
   * Get kernel capabilities
   */
  getCapabilities(): KernelCapabilities {
    return {
      supportsStateManagement: true,
      supportsCompletion: true,
      supportsInspection: true,
      supportsStreaming: true,
      allowNetwork: true,
      allowFileSystem: false,
    };
  }

  /**
   * Shutdown kernel
   */
  async shutdown(): Promise<void> {
    this.globals = {};
  }
}
