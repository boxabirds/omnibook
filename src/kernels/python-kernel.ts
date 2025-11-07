/**
 * Python kernel using Pyodide
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
 * Pyodide API types (minimal)
 */
interface PyodideInterface {
  runPythonAsync(code: string): Promise<any>;
  runPython(code: string): any;
  loadPackage(packages: string | string[]): Promise<void>;
  loadPackagesFromImports(code: string): Promise<void>;
  globals: {
    get(key: string): any;
    set(key: string, value: any): void;
    has(key: string): boolean;
    delete(key: string): boolean;
    toJs(options?: { depth?: number }): any;
  };
  FS: any;
  toPy(obj: any): any;
}

declare global {
  function loadPyodide(config?: {
    indexURL?: string;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
  }): Promise<PyodideInterface>;
}

/**
 * Python kernel configuration
 */
export interface PythonKernelConfig {
  /** Pyodide index URL */
  indexURL?: string;

  /** Packages to preload */
  packages?: string[];

  /** Stream output callback */
  onStreamOutput?: (stream: 'stdout' | 'stderr', text: string) => void;
}

/**
 * Python kernel implementation
 */
export class PythonKernel implements Kernel {
  private pyodide: PyodideInterface | null = null;
  private config: PythonKernelConfig;
  private initialized = false;
  private executionCount = 0;

  constructor(config: PythonKernelConfig = {}) {
    this.config = config;
  }

  /**
   * Initialize Pyodide
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Load Pyodide
    this.pyodide = await loadPyodide({
      indexURL: this.config.indexURL || 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/',
      stdout: (text: string) => {
        if (this.config.onStreamOutput) {
          this.config.onStreamOutput('stdout', text);
        }
      },
      stderr: (text: string) => {
        if (this.config.onStreamOutput) {
          this.config.onStreamOutput('stderr', text);
        }
      },
    });

    // Load common packages
    const packages = this.config.packages || ['numpy', 'micropip'];
    if (packages.length > 0) {
      await this.pyodide.loadPackage(packages);
    }

    // Set up display handling
    await this.setupDisplayHandling();

    this.initialized = true;
  }

  /**
   * Set up Jupyter-style display handling
   */
  private async setupDisplayHandling(): Promise<void> {
    if (!this.pyodide) return;

    await this.pyodide.runPythonAsync(`
import sys
import json
from io import StringIO

# Display buffer for rich outputs
_display_buffer = []

class DisplayHandler:
    def __init__(self):
        self.outputs = []

    def display(self, obj, **kwargs):
        """Display an object with optional metadata"""
        mime_bundle = self._to_mime_bundle(obj)
        self.outputs.append({
            'type': 'display',
            'data': mime_bundle,
            'metadata': kwargs
        })

    def _to_mime_bundle(self, obj):
        """Convert Python object to MIME bundle"""
        bundle = {}

        # Try repr first
        try:
            bundle['text/plain'] = repr(obj)
        except:
            bundle['text/plain'] = str(obj)

        # Check for _repr_html_
        if hasattr(obj, '_repr_html_'):
            try:
                bundle['text/html'] = obj._repr_html_()
            except:
                pass

        # Check for _repr_json_
        if hasattr(obj, '_repr_json_'):
            try:
                bundle['application/json'] = obj._repr_json_()
            except:
                pass

        # Check for _repr_png_
        if hasattr(obj, '_repr_png_'):
            try:
                import base64
                png_data = obj._repr_png_()
                if isinstance(png_data, bytes):
                    bundle['image/png'] = base64.b64encode(png_data).decode('ascii')
            except:
                pass

        # Check for matplotlib figures
        try:
            import matplotlib.pyplot as plt
            if hasattr(obj, 'savefig'):  # matplotlib figure
                import base64
                from io import BytesIO
                buf = BytesIO()
                obj.savefig(buf, format='png', bbox_inches='tight')
                buf.seek(0)
                bundle['image/png'] = base64.b64encode(buf.read()).decode('ascii')
        except:
            pass

        return bundle

    def clear(self):
        self.outputs = []

# Global display handler
_display_handler = DisplayHandler()

def display(obj, **kwargs):
    """Display an object"""
    _display_handler.display(obj, **kwargs)

def get_displays():
    """Get and clear display outputs"""
    outputs = _display_handler.outputs[:]
    _display_handler.clear()
    return outputs

# Make display available globally
__builtins__['display'] = display
`);
  }

  /**
   * Execute Python code
   */
  async exec(request: ExecRequest): Promise<ExecResponse> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    const startTime = Date.now();
    const logs: string[] = [];
    const display: MimeBundle[] = [];

    try {
      // Load input handles into Python namespace
      if (request.inputs) {
        const store = await getObjectStore();
        for (const [name, handle] of Object.entries(request.inputs)) {
          const data = await store.get(handle);
          if (data) {
            // For now, just expose as bytes
            // TODO: Parse Arrow/NumPy formats
            this.pyodide.globals.set(name, data);
          }
        }
      }

      // Load packages from imports
      await this.pyodide.loadPackagesFromImports(request.code);

      // Execute code
      let result = await this.pyodide.runPythonAsync(request.code);

      // Get display outputs
      const displays = await this.pyodide.runPythonAsync('get_displays()');
      if (displays && displays.length > 0) {
        const displaysJs = displays.toJs();
        for (const disp of displaysJs) {
          if (disp.type === 'display' && disp.data) {
            display.push(disp.data);
          }
        }
      }

      // Convert result to MIME bundle if not None
      if (result !== undefined && result !== null) {
        const resultMime = await this.pyodide.runPythonAsync(`
_display_handler._to_mime_bundle(${JSON.stringify(result)})
`);
        display.push(resultMime.toJs());
      }

      // Extract outputs (variables marked for export)
      const outputs: Record<string, Handle> = {};
      if (request.args?.outputs && Array.isArray(request.args.outputs)) {
        const store = await getObjectStore();
        for (const varName of request.args.outputs as string[]) {
          if (this.pyodide.globals.has(varName)) {
            const value = this.pyodide.globals.get(varName);
            // TODO: Convert to Arrow/NumPy format
            const bytes = new TextEncoder().encode(JSON.stringify(value));
            const handle = await store.put(bytes);
            outputs[varName] = handle;
          }
        }
      }

      this.executionCount++;

      return {
        outputs,
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
          name: error.name || 'PythonError',
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
   * Code completion (basic implementation)
   */
  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    try {
      // Extract the symbol before cursor
      const beforeCursor = request.code.slice(0, request.cursor);
      const match = beforeCursor.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);

      if (!match) {
        return { completions: [], start: request.cursor, end: request.cursor };
      }

      const prefix = match[0];
      const start = request.cursor - prefix.length;

      // Get completions from Python namespace
      const result = await this.pyodide.runPythonAsync(`
import builtins
prefix = "${prefix}"
completions = []

# Builtins
completions.extend([name for name in dir(builtins) if name.startswith(prefix)])

# Globals
completions.extend([name for name in globals() if name.startswith(prefix) and not name.startswith('_')])

list(set(completions))[:50]  # Limit to 50 unique completions
`);

      const completions = result.toJs();

      return {
        completions,
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
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    try {
      const result = await this.pyodide.runPythonAsync(`
import inspect
symbol = "${request.symbol.replace(/"/g, '\\"')}"

try:
    obj = eval(symbol)
    doc = inspect.getdoc(obj) or "No documentation available"

    sig = None
    if callable(obj):
        try:
            sig = str(inspect.signature(obj))
        except:
            pass

    {"documentation": doc, "signature": sig}
except Exception as e:
    {"documentation": f"Error: {e}", "signature": None}
`);

      const info = result.toJs();
      return {
        documentation: info.documentation,
        signature: info.signature,
      };
    } catch (error) {
      return {
        documentation: 'No information available',
      };
    }
  }

  /**
   * Save kernel state
   */
  async saveState(): Promise<Handle> {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    // Save globals as JSON
    const state = await this.pyodide.runPythonAsync(`
import json
import base64

state = {}
for name, value in globals().items():
    if not name.startswith('_') and name not in ['display', 'get_displays']:
        try:
            # Try to serialize to JSON
            state[name] = value
        except:
            pass

json.dumps(state)
`);

    const store = await getObjectStore();
    const bytes = new TextEncoder().encode(state);
    return await store.put(bytes);
  }

  /**
   * Load kernel state
   */
  async loadState(handle: Handle): Promise<void> {
    if (!this.pyodide) {
      throw new Error('Pyodide not initialized');
    }

    const store = await getObjectStore();
    const bytes = await store.get(handle);
    if (!bytes) {
      throw new Error('State not found');
    }

    const stateJson = new TextDecoder().decode(bytes);

    await this.pyodide.runPythonAsync(`
import json
state = json.loads('''${stateJson.replace(/'/g, "\\'")}''')
for name, value in state.items():
    globals()[name] = value
`);
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
      allowFileSystem: true,
    };
  }

  /**
   * Shutdown kernel
   */
  async shutdown(): Promise<void> {
    // Pyodide doesn't have explicit cleanup
    this.pyodide = null;
    this.initialized = false;
  }
}
