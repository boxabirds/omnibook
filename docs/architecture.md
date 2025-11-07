# OmniBook Architecture

## Overview

OmniBook is a browser-native multi-language notebook runtime that implements Jupyter's kernel model using WebAssembly and Web Workers.

## Core Principles

1. **Language Agnostic**: Any language that compiles to Wasm can be a kernel
2. **Zero-Copy**: SharedArrayBuffer enables efficient data sharing
3. **Content-Addressed**: All data stored by hash for deduplication
4. **Reproducible**: Full state capture and restoration
5. **Browser-Native**: No server required

## Component Architecture

### 1. Object Store (IndexedDB)

Content-addressed storage for large data blobs.

```typescript
class ObjectStore {
  async put(data: Uint8Array): Promise<Handle>
  async get(handle: Handle): Promise<Uint8Array>
  async pin(handle: Handle): Promise<void>
  async gc(): Promise<number>
}
```

**Design**:
- SHA-256 hashing for content addressing
- Reference counting for GC
- Pinning mechanism for persistence
- Metadata tracking (size, access time)

**Use Cases**:
- Kernel state checkpoints
- Large data artifacts
- Shared data between cells

### 2. Memory Pool (SharedArrayBuffer)

Zero-copy memory management.

```typescript
class MemoryPool {
  allocate(size: number): Handle | null
  free(handle: Handle): boolean
  getView<T>(handle: Handle, constructor: T): TypedArray
}
```

**Design**:
- Pool of 64MB chunks
- First-fit allocation
- Automatic defragmentation
- Fallback to ArrayBuffer

**Use Cases**:
- Large numeric arrays
- Image/audio data
- Cross-language data exchange

### 3. Cell DAG

Dependency tracking and execution ordering.

```typescript
class CellDAG {
  addCell(cellId: CellId): void
  setInputs(cellId: CellId, inputs: Record<string, Handle>): void
  setOutputs(cellId: CellId, outputs: Record<string, Handle>): void
  getTopologicalOrder(): CellId[]
  invalidate(cellId: CellId): void
}
```

**Design**:
- Directed acyclic graph
- Topological sorting
- Automatic invalidation
- Cycle detection

**Use Cases**:
- Automatic execution order
- Incremental re-execution
- Dependency visualization

### 4. Kernel Protocol

Uniform message protocol for kernel communication.

```typescript
enum MessageType {
  Init, Exec, Complete, Inspect,
  SaveState, LoadState, Shutdown
}

interface ExecRequest {
  code: string
  inputs?: Record<string, Handle>
}

interface ExecResponse {
  outputs?: Record<string, Handle>
  display?: MimeBundle[]
  error?: ErrorInfo
}
```

**Design**:
- Request/response pairs
- Correlation IDs
- Streaming output support
- Error handling

### 5. Kernel Client (Main Thread)

Proxy to kernel worker.

```typescript
class KernelClient implements Kernel {
  private worker: Worker
  private pendingRequests: Map<string, Promise>

  async exec(request: ExecRequest): Promise<ExecResponse>
  async shutdown(): Promise<void>
}
```

**Design**:
- One worker per kernel type
- Timeout handling
- Stream output callbacks
- Lazy initialization

### 6. Kernel Worker (Worker Thread)

Worker-side kernel wrapper.

```typescript
class KernelWorker {
  private kernel: Kernel

  async handleMessage(message: WorkerMessage): Promise<void>
  async handleExec(message: ExecMessage): Promise<void>
}
```

**Design**:
- Message dispatching
- Error wrapping
- Stream output forwarding

### 7. Notebook Orchestrator

High-level notebook management.

```typescript
class Notebook {
  private dag: CellDAG
  private cells: Map<CellId, Cell>
  private kernels: Map<string, KernelClient>

  createCell(kernelType: string): CellId
  async executeCell(cellId: CellId): Promise<void>
  async executeAll(): Promise<void>
  async export(): Promise<NotebookDocument>
}
```

**Design**:
- Cell lifecycle management
- Kernel pooling
- Execution queue
- State persistence

## Data Flow

### Execution Flow

```
User Input
    ↓
[UI Layer]
    ↓
[Notebook.executeCell]
    ↓
[Resolve Dependencies via DAG]
    ↓
[Get/Create Kernel Client]
    ↓
[Send ExecMessage to Worker]
    ↓
[Worker: Kernel.exec]
    ↓
[Load Input Handles from Object Store]
    ↓
[Execute Code in Kernel]
    ↓
[Store Output Handles in Object Store]
    ↓
[Send ExecResponse to Main Thread]
    ↓
[Update Cell State and Outputs]
    ↓
[Invalidate Downstream Cells]
    ↓
[Render UI]
```

### Data Exchange Flow

```
Cell A (Python)
    ↓
[Compute NumPy Array]
    ↓
[Convert to Arrow Format]
    ↓
[Store in SharedArrayBuffer]
    ↓
[Return Handle in ExecResponse]
    ↓
[DAG: Cell B depends on Handle H1]
    ↓
Cell B (Rust)
    ↓
[Receive Handle H1 in ExecRequest]
    ↓
[Map Handle to SharedArrayBuffer View]
    ↓
[Read Arrow, Zero-Copy]
    ↓
[Process Data]
```

## State Management

### Three-Level State Model

1. **Volatile State** (Memory)
   - Current kernel variables
   - Execution context
   - Lost on page reload

2. **Checkpoint State** (Object Store)
   - Kernel snapshots
   - Large artifacts
   - Persists across sessions

3. **Document State** (Export)
   - Notebook JSON
   - Handle manifest
   - Version information

### State Serialization Strategies

1. **Full Snapshot** (Generic)
   - Copy entire Wasm linear memory
   - Save tables and globals
   - Language-agnostic
   - Large size

2. **Semantic Snapshot** (Optimized)
   - Language-native serialization
   - Selected variables only
   - Smaller, faster
   - Language-specific

3. **File-Based** (Simple)
   - Virtual file system
   - WASI integration
   - Natural for file I/O languages

## Security Model

### Isolation Levels

1. **Process Isolation** (Web Workers)
   - Separate JavaScript contexts
   - No shared memory (except SAB)
   - Message passing only

2. **Memory Isolation** (Wasm)
   - Linear memory sandboxing
   - No access to host memory
   - Controlled imports

3. **Capability Manifests** (Planned)
   - Explicit permissions
   - Syscall filtering
   - Network restrictions

### Capability Example

```typescript
interface KernelCapabilities {
  supportsStateManagement: boolean
  supportsCompletion: boolean
  allowNetwork: boolean
  allowFileSystem: boolean
  allowedSyscalls?: string[]
}
```

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading**
   - Load kernels on first use
   - Defer large dependencies
   - Progressive enhancement

2. **Zero-Copy**
   - SharedArrayBuffer for large data
   - Structured clone for small objects
   - Memory-mapped views

3. **Caching**
   - Kernel instances pooled
   - Object Store LRU cache
   - Compilation results

4. **Incremental Execution**
   - Only re-run dirty cells
   - Dependency-based invalidation
   - Parallel execution (planned)

### Performance Metrics

- **Cold Start**: 2-3s (Pyodide load)
- **Warm Start**: <100ms
- **Cell Execution**: Near-native
- **Data Transfer**: Zero-copy (SAB) or ~10MB/s (structured clone)
- **State Checkpoint**: ~500ms for 10MB state

## Future Extensions

### WebAssembly Component Model

When available in browsers:

```wit
interface kernel {
  exec: func(code: string, inputs: list<handle>) -> result<exec-response, error>
  complete: func(code: string, cursor: u32) -> list<string>
}
```

Benefits:
- Standard ABI
- Cross-language calling
- Interface types
- Better performance

### WASI Integration

```typescript
// Virtual file system
const wasi = new WASI({
  preopens: {
    '/data': virtualFS,
  },
  env: {},
});
```

Benefits:
- Standard syscall interface
- File system abstraction
- Better Python/R support

### Compute Shaders (WebGPU)

```typescript
// GPU acceleration for kernels
const gpu = navigator.gpu;
const adapter = await gpu.requestAdapter();
const device = await adapter.requestDevice();
```

Benefits:
- Hardware acceleration
- Parallel computation
- ML model inference

## References

- [Pyodide Documentation](https://pyodide.org/)
- [WebAssembly Specification](https://webassembly.github.io/spec/)
- [Jupyter Protocol](https://jupyter-client.readthedocs.io/)
- [Observable Architecture](https://observablehq.com/@observablehq/how-observable-runs)
