# Implementing Data Interchange in Kernels

## Quick Start

The data interchange layer provides automatic serialization/deserialization between languages. Here's how to use it in your kernels.

## For Kernel Developers

### 1. Import Helper Functions

```typescript
import {
  exportValue,
  importValue,
  autoExport,
  createInputProxy
} from '../kernels/kernel-helpers.js';
```

### 2. Export Data (in `exec()`)

**Option A: Automatic** (Recommended)

```typescript
async exec(request: ExecRequest): Promise<ExecResponse> {
  // Your execution code...
  const result = someComputation();

  // Automatically serialize and store
  const { handle, descriptor } = await exportValue('result', result);

  return {
    outputs: {
      result: handle  // Just return the handle!
    },
    outputDescriptors: {
      result: descriptor  // And the descriptor
    }
  };
}
```

**Option B: Auto-Export from Namespace**

```typescript
// In JavaScript kernel
const globals = { data, model, predictions };
const exports = await autoExport(globals);

return {
  outputs: Object.fromEntries(
    Object.entries(exports).map(([k, v]) => [k, v.handle])
  ),
  outputDescriptors: Object.fromEntries(
    Object.entries(exports).map(([k, v]) => [k, v.descriptor])
  )
};
```

### 3. Import Data (in `exec()`)

**Option A: Manual**

```typescript
async exec(request: ExecRequest): Promise<ExecResponse> {
  // Load inputs
  if (request.inputs && request.inputDescriptors) {
    for (const [name, handle] of Object.entries(request.inputs)) {
      const descriptor = request.inputDescriptors[name];
      const value = await importValue(handle, descriptor);

      // Make available in execution context
      this.globals[name] = value;
    }
  }

  // Now 'this.globals.data' etc. are available
}
```

**Option B: Lazy Loading Proxy**

```typescript
// Create a proxy that loads on access
const inputs = createInputProxy(request.inputDescriptors);

// User code can now do:
// const data = await inputs.data;  // Loads automatically
```

### 4. Update Types

Add descriptor support to your types:

```typescript
// In types/kernel.ts
export interface ExecRequest {
  code: string;
  inputs?: Record<string, Handle>;
  inputDescriptors?: Record<string, TypeDescriptor>;  // Add this
  args?: Record<string, unknown>;
  cellId?: CellId;
}

export interface ExecResponse {
  outputs?: Record<string, Handle>;
  outputDescriptors?: Record<string, TypeDescriptor>;  // Add this
  display?: MimeBundle[];
  logs?: string[];
  error?: { name: string; message: string; stack?: string };
  stateHint?: Handle | null;
  metadata?: { executionTime?: number; memoryUsed?: number };
}
```

## Example: Enhanced JavaScript Kernel

```typescript
import { autoExport, importValue } from './kernel-helpers.js';

async exec(request: ExecRequest): Promise<ExecResponse> {
  // 1. Load inputs
  if (request.inputs && request.inputDescriptors) {
    for (const [name, handle] of Object.entries(request.inputs)) {
      const descriptor = request.inputDescriptors[name];
      const value = await importValue(handle, descriptor);
      this.globals[name] = value;  // Make available
    }
  }

  // 2. Execute code (with globals available)
  const func = new Function(
    ...Object.keys(this.globals),
    `"use strict";\n${request.code}`
  );
  const result = await func(...Object.values(this.globals));

  // 3. Update globals with result
  if (result !== undefined) {
    this.globals['_'] = result;
  }

  // 4. Auto-export all globals
  const exports = await autoExport(this.globals);

  return {
    outputs: Object.fromEntries(
      Object.entries(exports).map(([k, v]) => [k, v.handle])
    ),
    outputDescriptors: Object.fromEntries(
      Object.entries(exports).map(([k, v]) => [k, v.descriptor])
    ),
    display: result ? [this.toMimeBundle(result)] : []
  };
}
```

## Example: Python Kernel with NumPy

```typescript
async exec(request: ExecRequest): Promise<ExecResponse> {
  // 1. Load inputs into Python namespace
  if (request.inputs && request.inputDescriptors) {
    for (const [name, handle] of Object.entries(request.inputs)) {
      const descriptor = request.inputDescriptors[name];
      const value = await importValue(handle, descriptor);

      // Convert JavaScript value to Python
      if (descriptor.format === DataFormat.NumPy) {
        // It's already in NumPy-compatible format
        await this.pyodide.runPythonAsync(`
          import numpy as np
          ${name} = np.array(${JSON.stringify(value.data)}).reshape(${JSON.stringify(value.shape)})
        `);
      } else if (descriptor.format === DataFormat.Arrow) {
        // Convert Arrow to NumPy/Pandas
        await this.pyodide.runPythonAsync(`
          ${name} = ${JSON.stringify(value)}
        `);
      } else {
        // JSON format
        this.pyodide.globals.set(name, value);
      }
    }
  }

  // 2. Execute Python code
  const result = await this.pyodide.runPythonAsync(request.code);

  // 3. Export outputs
  const outputs: Record<string, Handle> = {};
  const outputDescriptors: Record<string, TypeDescriptor> = {};

  // If result is NumPy array, export as NumPy format
  if (result && typeof result === 'object' && result.constructor?.name === 'ndarray') {
    const shape = result.shape;
    const dtype = result.dtype.name;
    const data = Array.from(result.flat());

    const { handle, descriptor } = await exportValue('result', {
      shape: Array.from(shape),
      dtype,
      data
    });

    outputs['result'] = handle;
    outputDescriptors['result'] = descriptor;
  }

  return {
    outputs,
    outputDescriptors,
    display: result ? [this.toMimeBundle(result)] : []
  };
}
```

## Testing Data Interchange

Create a simple test:

```typescript
// Test notebook
const notebook = new Notebook(config);

// Cell 1: Generate data
const cell1 = notebook.createCell('javascript', `
  const data = [1, 2, 3, 4, 5];
  data;
`);

// Cell 2: Process data
const cell2 = notebook.createCell('python', `
  import numpy as np
  result = np.array(data) * 2
  result.tolist()
`);

// Cell 3: Verify
const cell3 = notebook.createCell('javascript', `
  console.log(result);  // Should be [2, 4, 6, 8, 10]
  result;
`);

// Execute all
await notebook.executeAll();

// Check outputs
const outputs = notebook.getCell(cell3).cellOutputs;
// Should show [2, 4, 6, 8, 10]
```

## Performance Tips

1. **Use appropriate formats**:
   - Small objects (< 1KB): JSON
   - Tabular data: Arrow
   - Numeric arrays: NumPy
   - Binary data: Binary

2. **Enable SharedArrayBuffer**:
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```

3. **Lazy loading**:
   - Don't load all inputs upfront
   - Load only when accessed
   - Use `createInputProxy()` for this

4. **Memory management**:
   - Clean up large objects after use
   - Use `store.unpin()` when done
   - Monitor with `store.getSize()`

## Common Patterns

### Pattern 1: Chained Processing

```javascript
// Cell 1
const data = loadData();
data;  // Auto-exported
```

```python
# Cell 2
processed = process(data)  # Auto-loaded
processed  # Auto-exported
```

```javascript
// Cell 3
visualize(processed);  // Auto-loaded
```

### Pattern 2: Multiple Outputs

```python
# Export multiple values
results = {
    'predictions': model.predict(X),
    'confidence': model.confidence_,
    'features': feature_names
}
results
```

```javascript
// All available in next cell
console.log(predictions, confidence, features);
```

### Pattern 3: Incremental Updates

```javascript
let accumulator = [];

for (let i = 0; i < 10; i++) {
  const batch = await processBatch(i);
  accumulator.push(...batch);
}

accumulator;  // Export final result
```

## Debugging

Enable verbose logging:

```typescript
// In kernel
console.log('Inputs:', Object.keys(request.inputs || {}));
console.log('Input descriptors:', request.inputDescriptors);

// After execution
console.log('Outputs:', Object.keys(outputs));
console.log('Output descriptors:', outputDescriptors);
```

Check format:

```python
# In Python cell
import sys
print(f"Type: {type(data)}")
print(f"Format: {data.__class__.__name__}")
if hasattr(data, 'shape'):
    print(f"Shape: {data.shape}")
```

## Next Steps

1. Implement in your kernel following the patterns above
2. Test with simple values first (numbers, arrays)
3. Test with complex values (objects, tables)
4. Verify format selection is optimal
5. Add error handling for unsupported types

See `examples/cross-language-pipeline.json` for a complete working example.
