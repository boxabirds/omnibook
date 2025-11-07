# OmniBook

A WebAssembly-based multi-language Jupyter notebook runtime that runs entirely in your browser.

## Features

- **Multi-Language Support**: Execute Python, JavaScript, Rust, SQL, and more - all in one notebook
- **Zero-Copy Data Exchange**: Efficient data sharing between languages via SharedArrayBuffer
- **Reproducible State**: Save and restore kernel state for reproducible notebooks
- **Browser-Native**: No server required, runs entirely in the browser using WebAssembly
- **Jupyter-Compatible**: Familiar cell-based interface with rich MIME output
- **Content-Addressed Storage**: Efficient, persistent object storage using IndexedDB
- **Dependency Tracking**: Automatic execution ordering based on cell dependencies

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

Visit `http://localhost:5173` to start creating notebooks.

## Architecture

OmniBook implements Jupyter's kernel model using WebAssembly:

### Core Components

1. **Notebook Host** (Main Thread)
   - Orchestrates cells, dependencies, and persistence
   - Manages the execution DAG
   - Handles UI rendering

2. **Cell Runtime** (Web Workers)
   - One Worker per kernel type
   - Isolated execution environment
   - Message-based communication with host

3. **Language Adapters** (Kernels)
   - Wasm-based kernels for each language
   - Uniform ABI: `exec`, `complete`, `inspect`, `saveState`, `loadState`
   - Language-specific services (e.g., package management)

4. **Object Store** (IndexedDB)
   - Content-addressed storage using SHA-256
   - Reference counting and garbage collection
   - Persistent across sessions

5. **Memory Pool** (SharedArrayBuffer)
   - Zero-copy data exchange between kernels
   - Falls back to ArrayBuffer when cross-origin isolation unavailable

### Data Flow

```
┌─────────────┐
│   Browser   │
├─────────────┤
│             │
│  ┌───────┐  │
│  │  UI   │  │
│  └───┬───┘  │
│      │      │
│  ┌───┴──────┴───┐
│  │   Notebook   │
│  │ Orchestrator │
│  └───┬──────────┘
│      │
│  ┌───┴────────┐
│  │  Cell DAG  │
│  └───┬────────┘
│      │
│  ┌───┴─────────┐
│  │ Object Store│
│  │  (IndexedDB)│
│  └─────────────┘
│      │
├─────────────────
│ Web Workers    │
├─────────────────
│                │
│  ┌──────────┐  │
│  │  Python  │  │
│  │  Kernel  │  │
│  └──────────┘  │
│                │
│  ┌──────────┐  │
│  │JavaScript│  │
│  │  Kernel  │  │
│  └──────────┘  │
│                │
└────────────────┘
```

## Project Structure

```
omnibook/
├── src/
│   ├── core/              # Core runtime infrastructure
│   │   ├── object-store.ts    # Content-addressed storage (IndexedDB)
│   │   ├── memory-pool.ts     # SharedArrayBuffer pool
│   │   └── cell-dag.ts        # Dependency graph
│   │
│   ├── kernels/           # Language kernel adapters
│   │   ├── python-kernel.ts           # Pyodide-based Python kernel
│   │   ├── python-kernel.worker.ts
│   │   ├── javascript-kernel.ts       # Native JS kernel
│   │   └── javascript-kernel.worker.ts
│   │
│   ├── runtime/           # Worker runtime and orchestration
│   │   ├── worker-protocol.ts   # Message protocol
│   │   ├── kernel-client.ts     # Main thread kernel client
│   │   ├── kernel-worker.ts     # Worker-side kernel wrapper
│   │   └── notebook.ts          # Notebook orchestrator
│   │
│   ├── types/             # TypeScript type definitions
│   │   ├── kernel.ts      # Kernel ABI types
│   │   └── notebook.ts    # Notebook document types
│   │
│   └── ui/                # UI components
│       ├── components/
│       │   ├── Cell.tsx
│       │   ├── CellOutput.tsx
│       │   └── NotebookView.tsx
│       └── App.tsx
│
├── public/                # Static assets
├── examples/              # Example notebooks
└── package.json
```

## Usage Examples

### JavaScript Cell

```javascript
// Define a function
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Calculate and display
const result = fibonacci(10);
console.log(`Fibonacci(10) = ${result}`);
result  // Last expression is displayed
```

### Python Cell (requires Pyodide)

```python
import numpy as np
import matplotlib.pyplot as plt

# Generate data
x = np.linspace(0, 2*np.pi, 100)
y = np.sin(x)

# Create plot
plt.figure(figsize=(10, 6))
plt.plot(x, y)
plt.title('Sine Wave')
plt.xlabel('x')
plt.ylabel('sin(x)')

# Display (automatically shows as image)
plt.gcf()
```

### Cross-Language Data Exchange

```javascript
// JavaScript cell - create data
const data = {
  values: [1, 2, 3, 4, 5],
  labels: ['A', 'B', 'C', 'D', 'E']
};

// Export for other cells
// (Future: automatic via Arrow/NumPy formats)
```

```python
# Python cell - access data
# (Future: automatic data loading from previous cells)
import json

# Process data
processed = [x * 2 for x in data['values']]
print(f"Processed: {processed}")
```

## Kernel ABI

All kernels implement a uniform interface:

```typescript
interface Kernel {
  // Execute code
  exec(request: ExecRequest): Promise<ExecResponse>;

  // Code completion (optional)
  complete?(request: CompleteRequest): Promise<CompleteResponse>;

  // Symbol inspection (optional)
  inspect?(request: InspectRequest): Promise<InspectResponse>;

  // Save kernel state (optional)
  saveState?(): Promise<Handle>;

  // Restore kernel state (optional)
  loadState?(handle: Handle): Promise<void>;

  // Shutdown and cleanup
  shutdown(): Promise<void>;

  // Get kernel capabilities
  getCapabilities(): KernelCapabilities;
}
```

## Supported Languages

### Currently Implemented

- **JavaScript**: Native execution in Web Worker
  - Full ES2022 support
  - Async/await
  - Console output capture

- **Python**: Pyodide (CPython compiled to Wasm)
  - NumPy, Pandas, Matplotlib
  - Package management via micropip
  - Jupyter-style display hooks

### Planned

- **Rust**: wasm32 target with wasm-bindgen
- **SQLite**: SQL queries on local database
- **R**: R compiled to Wasm
- **Ruby**: Ruby compiled to Wasm
- **Lua**: Lua compiled to Wasm

## Advanced Features

### State Management

Kernels can save and restore their state:

```typescript
// Save notebook state
await notebook.checkpoint();

// Restore from checkpoint
await notebook.restore();
```

### Dependency Tracking

The Cell DAG automatically tracks dependencies:

```javascript
// Cell A - produces output
const data = [1, 2, 3, 4, 5];
```

```javascript
// Cell B - depends on Cell A
const sum = data.reduce((a, b) => a + b, 0);
console.log(`Sum: ${sum}`);
```

When Cell A changes, Cell B is automatically marked for re-execution.

### Export/Import

Export notebooks as JSON:

```typescript
const doc = await notebook.export();
// Save to file, share, or version control
```

## Cross-Origin Isolation

For SharedArrayBuffer support (zero-copy data exchange), enable cross-origin isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Vite development server is configured with these headers. For production, ensure your web server sets them.

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

### Building

```bash
npm run build
```

## Browser Compatibility

- Chrome/Edge 89+
- Firefox 89+
- Safari 15.2+

Requires:
- WebAssembly
- Web Workers
- IndexedDB
- ES2022

SharedArrayBuffer (optional, for zero-copy):
- Cross-origin isolation
- Secure context (HTTPS)

## Performance

- **Cold start**: ~2-3s (Pyodide load time)
- **Cell execution**: Near-native (depends on kernel)
- **Data transfer**: Zero-copy with SharedArrayBuffer, otherwise structured clone
- **Storage**: Content-addressed, minimal duplication

## Security

- Each kernel runs in an isolated Web Worker
- Optional capability manifests (planned)
- WASI syscall filtering (planned)
- Network access control (planned)

## Roadmap

### Phase 1: Core Infrastructure ✅
- [x] Object Store
- [x] Memory Pool
- [x] Cell DAG
- [x] Worker Protocol
- [x] Notebook Orchestrator

### Phase 2: Kernels (In Progress)
- [x] JavaScript Kernel
- [x] Python Kernel (Pyodide)
- [ ] Rust Kernel
- [ ] SQLite Kernel

### Phase 3: Data Interchange
- [ ] Arrow IPC support
- [ ] NumPy format handlers
- [ ] Automatic type conversion

### Phase 4: UI Polish
- [ ] Code editor with syntax highlighting (CodeMirror)
- [ ] Keyboard shortcuts
- [ ] Cell drag-and-drop reordering
- [ ] Collapsible outputs
- [ ] Search and replace

### Phase 5: Advanced Features
- [ ] Collaborative editing
- [ ] Version control integration
- [ ] Remote kernel execution
- [ ] Plugin system

## Contributing

Contributions welcome! Please read our contributing guidelines.

## License

See LICENSE file for details.

## Acknowledgments

- Inspired by Jupyter Notebook
- Built with Pyodide, Vite, React, and TypeScript
- Architecture influenced by Observable and Starboard

---

**OmniBook** - A universal, browser-native notebook for polyglot data science.
