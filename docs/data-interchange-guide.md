## Data Interchange Guide

### How Data Flows Between Languages

OmniBook provides **automatic data serialization** between languages using multiple formats:

| Format | Use Case | Languages |
|--------|----------|-----------|
| **Arrow IPC** | Tabular/columnar data | Python ↔ Rust ↔ JS |
| **NumPy** | N-dimensional arrays | Python ↔ Rust |
| **JSON** | Simple objects | All |
| **Binary** | Raw bytes | All |

### Architecture

```
┌─────────────┐
│ Python Cell │
│   (NumPy)   │
└──────┬──────┘
       │ serialize
       ↓
┌─────────────────┐
│  Object Store   │
│ Handle: abc123  │
│ Format: NumPy   │
└──────┬──────────┘
       │ deserialize
       ↓
┌─────────────┐
│  Rust Cell  │
│  (ndarray)  │
└─────────────┘
```

### Example 1: JavaScript → Python

**Cell 1 (JavaScript)** - Generate data
```javascript
// Create a dataset
const data = Array.from({length: 100}, (_, i) => ({
  x: i,
  y: Math.sin(i / 10) * 50 + 50,
  category: i % 2 === 0 ? 'even' : 'odd'
}));

// Automatically exported as Arrow table
display({ message: `Generated ${data.length} points`, preview: data.slice(0, 3) });
data; // Return value is automatically serialized
```

**Cell 2 (Python)** - Process data
```python
import numpy as np

# Input 'data' is automatically available from previous cell
# It's deserialized from Arrow format to Python

print(f"Received {len(data)} points")
print(f"First point: {data[0]}")

# Extract y values
y_values = np.array([point['y'] for point in data])

# Compute statistics
stats = {
    'mean': float(np.mean(y_values)),
    'std': float(np.std(y_values)),
    'min': float(np.min(y_values)),
    'max': float(np.max(y_values))
}

print(f"Statistics: {stats}")
stats  # Automatically exported as JSON
```

### Example 2: Python → Rust (Zero-Copy)

**Cell 1 (Python)** - Create NumPy array
```python
import numpy as np

# Create a large array
matrix = np.random.rand(1000, 1000)

print(f"Created {matrix.shape} matrix")
print(f"Memory: {matrix.nbytes / 1024 / 1024:.2f} MB")

matrix  # Exported as NumPy format
```

**Cell 2 (Rust)** - Process with zero-copy
```rust
// DEMO: matrix_ops
// Receives 'matrix' as ndarray
// Zero-copy via SharedArrayBuffer (when available)

// fn process_matrix(matrix: &Array2<f64>) -> f64 {
//     matrix.iter().sum::<f64>() / (matrix.nrows() * matrix.ncols()) as f64
// }
//
// let mean = process_matrix(&matrix);
// println!("Matrix mean: {}", mean);
```

### Example 3: Multi-Stage Pipeline

**Cell 1 (JavaScript)** - Load/generate data
```javascript
const rawData = {
  timestamps: Array.from({length: 1000}, (_, i) => Date.now() + i * 1000),
  values: Array.from({length: 1000}, () => Math.random() * 100),
  labels: Array.from({length: 1000}, (_, i) => `sample_${i}`)
};

rawData;  // Export as JSON
```

**Cell 2 (Python)** - Clean and analyze
```python
import numpy as np

# Input 'rawData' auto-loaded
values = np.array(rawData['values'])

# Clean outliers
mean = np.mean(values)
std = np.std(values)
cleaned = values[(values > mean - 2*std) & (values < mean + 2*std)]

print(f"Removed {len(values) - len(cleaned)} outliers")

cleaned.tolist()  # Export as array
```

**Cell 3 (JavaScript)** - Visualize
```javascript
// Input 'cleaned' auto-loaded

const histogram = {};
for (const value of cleaned) {
  const bucket = Math.floor(value / 10) * 10;
  histogram[bucket] = (histogram[bucket] || 0) + 1;
}

console.log("Histogram:", histogram);
display(histogram);
```

### How It Works Under the Hood

#### Automatic Export

When a cell returns a value:

```javascript
// In JavaScript kernel
const result = [1, 2, 3, 4, 5];
return result;  // ← This triggers auto-export
```

The kernel:
1. Detects the return value
2. Chooses best serialization format (Arrow for arrays)
3. Serializes to bytes
4. Stores in Object Store → gets handle `"abc123"`
5. Records in cell outputs: `{ result: "abc123" }`

#### Automatic Import

When next cell runs:

```python
# In Python kernel - 'result' is automatically available
print(result)  # [1, 2, 3, 4, 5]
```

The kernel:
1. Receives inputs from DAG: `{ result: "abc123" }`
2. Loads from Object Store
3. Deserializes from Arrow → Python list
4. Injects into namespace

#### Format Negotiation

The system automatically picks the best format:

| Source | Target | Format | Reason |
|--------|--------|--------|--------|
| JS Array | Python | Arrow | Efficient columnar |
| Python NumPy | Rust | NumPy | Native array format |
| JS Object | Python | JSON | Universal compatibility |
| Rust Vec | Python | Arrow | Type-safe transfer |

### Explicit Data Control

If you want explicit control:

```javascript
// JavaScript - manual export
import { exportValue } from '@omnibook/kernel-helpers';

const data = [1, 2, 3];
const { handle, descriptor } = await exportValue('myData', data);

console.log(`Exported to handle: ${handle}`);
console.log(`Format: ${descriptor.format}`);
```

```python
# Python - manual import
from omnibook import import_value

data = import_value(handle, descriptor)
print(f"Imported: {data}")
```

### Performance Considerations

#### Zero-Copy (with SharedArrayBuffer)

When cross-origin isolated:
- Data stored in SharedArrayBuffer
- Both kernels access same memory
- **No copying** = instant transfer

#### With Copy (fallback)

Without cross-origin isolation:
- Data serialized to bytes
- Stored in IndexedDB
- Deserialized on access
- ~10-50 MB/s throughput

### Type Mappings

#### JavaScript ↔ Python

| JavaScript | Python | Format |
|------------|--------|--------|
| Array | list | Arrow/JSON |
| Object | dict | JSON |
| TypedArray | numpy.ndarray | NumPy |
| Map | dict | JSON |
| Set | set | JSON |

#### Python ↔ Rust

| Python | Rust | Format |
|--------|------|--------|
| numpy.ndarray | ndarray::Array | NumPy |
| list | Vec<T> | Arrow |
| dict | HashMap | JSON |
| pandas.DataFrame | Arrow Table | Arrow |

### Best Practices

1. **Return values for auto-export**
   ```javascript
   const data = compute();
   return data;  // ✓ Auto-exported
   ```

2. **Use descriptive variable names**
   ```python
   model_predictions = train(data)  # ✓ Clear name
   return model_predictions
   ```

3. **Check data types**
   ```javascript
   console.log(typeof data);  // Check before using
   ```

4. **Handle large data carefully**
   ```python
   # For very large datasets, consider chunking
   if data.nbytes > 100_000_000:  # > 100MB
       print("Warning: Large dataset")
   ```

5. **Use appropriate formats**
   - Tabular data → Arrow
   - Arrays/matrices → NumPy
   - Simple objects → JSON
   - Raw binary → Binary

### Debugging Data Flow

Check what data is available:

```javascript
// In any cell
console.log("Available inputs:", Object.keys(inputs));
```

Check data format:

```python
# In Python
import sys
print(f"Type: {type(data)}")
print(f"Size: {sys.getsizeof(data)} bytes")
```

### Common Issues

**Issue**: Data not available in next cell
- **Solution**: Make sure previous cell returned a value or used explicit export

**Issue**: Type conversion error
- **Solution**: Check format compatibility in type mappings table

**Issue**: Large data is slow
- **Solution**: Enable cross-origin isolation for zero-copy mode

**Issue**: Data shape mismatch
- **Solution**: Verify shapes match between languages (e.g., row-major vs column-major)

### Advanced: Custom Serializers

You can register custom serializers:

```typescript
class CustomSerializer implements DataSerializer {
  format = 'custom' as DataFormat;

  canSerialize(value: any): boolean {
    return value instanceof MyCustomClass;
  }

  async serialize(value: any) {
    // Your serialization logic
  }

  async deserialize(data: Uint8Array) {
    // Your deserialization logic
  }
}

// Register it
const interchange = getDataInterchange();
interchange.registerSerializer(new CustomSerializer());
```

---

**Next**: See [examples/cross-language-demo.md](../examples/cross-language-demo.md) for complete working examples.
