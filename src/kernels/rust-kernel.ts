/**
 * Rust kernel - executes Rust via WebAssembly
 *
 * Note: Full Rust compilation in the browser requires a large toolchain (~100MB+).
 * This implementation uses a hybrid approach:
 * - Pre-compiled WASM modules for demos
 * - Server-side compilation for custom code (future)
 * - Direct WASM execution for .wasm files
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
} from '../types/index.js';

import { getObjectStore } from '../core/object-store.js';

/**
 * Rust kernel configuration
 */
export interface RustKernelConfig {
  /** Stream output callback */
  onStreamOutput?: (stream: 'stdout' | 'stderr', text: string) => void;

  /** Compilation service URL (optional, for server-side compilation) */
  compileServiceUrl?: string;
}

/**
 * Rust kernel implementation
 */
export class RustKernel implements Kernel {
  private config: RustKernelConfig;
  private executionCount = 0;
  private wasmInstances = new Map<string, WebAssembly.Instance>();

  // Console output buffers
  private stdoutBuffer: string[] = [];
  private stderrBuffer: string[] = [];

  constructor(config: RustKernelConfig = {}) {
    this.config = config;
  }

  /**
   * Execute Rust code or WASM
   */
  async exec(request: ExecRequest): Promise<ExecResponse> {
    const startTime = Date.now();

    // Clear output buffers
    this.stdoutBuffer = [];
    this.stderrBuffer = [];

    const display: MimeBundle[] = [];
    const logs: string[] = [];

    try {
      const code = request.code.trim();

      // Check if this is a pre-compiled demo
      if (code.startsWith('// DEMO:')) {
        return await this.executeDemo(code);
      }

      // Check if this is WebAssembly binary (base64 or hex)
      if (code.startsWith('WASM:') || code.startsWith('0x') || code.startsWith('data:')) {
        return await this.executeWasm(code);
      }

      // Otherwise, show compilation needed message
      const message = `# Rust Compilation

Rust code needs to be compiled to WebAssembly before execution.

## Options:

1. **Use Pre-compiled Demos**: Load demos with the "📚 Load Demos" button
2. **Compile Externally**:
   - Use https://play.rust-lang.org to compile
   - Download the WASM file
   - Load it here with: WASM:<base64-encoded-wasm>

## Example Rust Code:

\`\`\`rust
${code}
\`\`\`

## Future Enhancement:

Server-side compilation service coming soon! This will allow:
- Automatic Rust → WASM compilation
- Dependency management with Cargo
- Full Rust standard library support
`;

      display.push({
        'text/plain': 'Rust compilation not available in browser',
        'text/html': `<div style="padding: 1rem; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 4px;">
          <h3 style="margin-top: 0; color: #f59e0b;">⚠️ Rust Compilation Required</h3>
          <p>Rust code needs to be compiled to WebAssembly. Use the pre-compiled demos or compile externally.</p>
          <pre style="background: #fff; padding: 0.5rem; border-radius: 4px; overflow: auto;">${this.escapeHtml(code)}</pre>
        </div>`,
      });

      return {
        display,
        logs,
        metadata: {
          executionTime: Date.now() - startTime,
        },
      };
    } catch (error: any) {
      return {
        display,
        logs,
        error: {
          name: error.name || 'RustError',
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
   * Execute a pre-compiled demo
   */
  private async executeDemo(code: string): Promise<ExecResponse> {
    const startTime = Date.now();
    const display: MimeBundle[] = [];

    // Extract demo name
    const match = code.match(/\/\/ DEMO: (.*)/);
    const demoName = match ? match[1].trim() : 'unknown';

    // Simulate Rust execution with demo output
    let output = '';

    switch (demoName) {
      case 'fibonacci':
        output = this.demoFibonacci();
        break;
      case 'vectors':
        output = this.demoVectors();
        break;
      case 'structs':
        output = this.demoStructs();
        break;
      default:
        output = `Demo "${demoName}" not found`;
    }

    this.stdoutBuffer.push(output);

    display.push({
      'text/plain': output,
    });

    return {
      display,
      logs: this.stdoutBuffer,
      metadata: {
        executionTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Execute WebAssembly binary
   */
  private async executeWasm(code: string): Promise<ExecResponse> {
    const startTime = Date.now();

    // Parse WASM (simplified - would need proper parsing)
    const wasmBytes = this.parseWasmInput(code);

    // Create imports for WASM
    const imports = {
      env: {
        // Memory
        memory: new WebAssembly.Memory({ initial: 1 }),

        // Console functions
        print: (ptr: number, len: number) => {
          const view = new Uint8Array((imports.env.memory as any).buffer, ptr, len);
          const text = new TextDecoder().decode(view);
          this.stdoutBuffer.push(text);
          if (this.config.onStreamOutput) {
            this.config.onStreamOutput('stdout', text);
          }
        },
      },
    };

    // Compile and instantiate
    const module = await WebAssembly.compile(wasmBytes);
    const instance = await WebAssembly.instantiate(module, imports);

    // Execute main function if available
    if (typeof (instance.exports as any).main === 'function') {
      (instance.exports as any).main();
    }

    return {
      display: [{
        'text/plain': this.stdoutBuffer.join('\n'),
      }],
      logs: this.stdoutBuffer,
      metadata: {
        executionTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Parse WASM input (base64, hex, etc.)
   */
  private parseWasmInput(input: string): Uint8Array {
    if (input.startsWith('WASM:')) {
      const base64 = input.slice(5);
      const binary = atob(base64);
      return Uint8Array.from(binary, c => c.charCodeAt(0));
    }

    // Default: assume it's already binary
    throw new Error('Invalid WASM input format');
  }

  /**
   * Demo implementations (simulated Rust output)
   */
  private demoFibonacci(): string {
    // Simulate Rust fibonacci output
    const fibs = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34];
    return `Fibonacci sequence (first 10 numbers):
${fibs.map((n, i) => `  fib(${i}) = ${n}`).join('\n')}

Note: This is a simulated demo. Full Rust compilation coming soon!`;
  }

  private demoVectors(): string {
    return `Vector operations:
  Created vector: [1, 2, 3, 4, 5]
  Length: 5
  First element: 1
  Last element: 5
  Sum: 15
  Doubled: [2, 4, 6, 8, 10]

Note: This is a simulated demo. Full Rust compilation coming soon!`;
  }

  private demoStructs(): string {
    return `Struct demonstration:
  Person { name: "Alice", age: 30 }
  Person { name: "Bob", age: 25 }

  Average age: 27.5

Note: This is a simulated demo. Full Rust compilation coming soon!`;
  }

  /**
   * HTML escape
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Code completion (basic)
   */
  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const keywords = [
      'fn', 'let', 'mut', 'const', 'static',
      'if', 'else', 'match', 'loop', 'while', 'for',
      'struct', 'enum', 'trait', 'impl',
      'pub', 'use', 'mod',
      'Vec', 'String', 'Option', 'Result',
      'println!', 'format!', 'vec!',
    ];

    const beforeCursor = request.code.slice(0, request.cursor);
    const match = beforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);

    if (!match) {
      return { completions: [], start: request.cursor, end: request.cursor };
    }

    const prefix = match[0];
    const start = request.cursor - prefix.length;

    const completions = keywords.filter(kw => kw.startsWith(prefix));

    return {
      completions,
      start,
      end: request.cursor,
    };
  }

  /**
   * Symbol inspection
   */
  async inspect(request: InspectRequest): Promise<InspectResponse> {
    const docs: Record<string, string> = {
      'Vec': 'A contiguous growable array type. Vec<T> owns its data.',
      'String': 'A UTF-8 encoded, growable string.',
      'println!': 'Macro for printing to stdout with a newline.',
      'fn': 'Function declaration keyword.',
    };

    return {
      documentation: docs[request.symbol] || 'No documentation available',
    };
  }

  /**
   * Save kernel state
   */
  async saveState(): Promise<Handle> {
    const state = JSON.stringify({
      executionCount: this.executionCount,
    });

    const store = await getObjectStore();
    const bytes = new TextEncoder().encode(state);
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
    this.executionCount = state.executionCount || 0;
  }

  /**
   * Get kernel capabilities
   */
  getCapabilities(): KernelCapabilities {
    return {
      supportsStateManagement: true,
      supportsCompletion: true,
      supportsInspection: true,
      supportsStreaming: false,
      allowNetwork: false,
      allowFileSystem: false,
    };
  }

  /**
   * Shutdown kernel
   */
  async shutdown(): Promise<void> {
    this.wasmInstances.clear();
  }
}
