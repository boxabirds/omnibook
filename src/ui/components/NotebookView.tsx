import React, { useState, useEffect } from 'react';
import { Notebook, type NotebookConfig } from '../../runtime/notebook.js';
import type { NotebookCell as NotebookCellType } from '../../types/index.js';
import { Cell } from './Cell.js';

interface NotebookViewProps {
  config: NotebookConfig;
}

// Demo code snippets for each kernel
const DEMO_SNIPPETS: Record<string, string[]> = {
  javascript: [
    `// JavaScript Demo: Fibonacci Sequence
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Calculate first 10 Fibonacci numbers
const fibs = Array.from({length: 10}, (_, i) => fibonacci(i));
console.log('Fibonacci sequence:', fibs);

// Display result
fibs`,
    `// JavaScript Demo: Async/Await & Promises
async function fetchData() {
  // Simulate API call
  await new Promise(resolve => setTimeout(resolve, 1000));
  return {
    message: 'Data loaded!',
    timestamp: new Date().toISOString(),
    random: Math.random()
  };
}

const result = await fetchData();
console.log('Fetched:', result);
result`,
    `// JavaScript Demo: Array Manipulation
const data = [
  { name: 'Alice', score: 85 },
  { name: 'Bob', score: 92 },
  { name: 'Charlie', score: 78 },
  { name: 'Diana', score: 95 }
];

// Filter, map, and reduce
const highScorers = data
  .filter(student => student.score > 80)
  .map(student => student.name);

const avgScore = data.reduce((sum, s) => sum + s.score, 0) / data.length;

console.log('High scorers:', highScorers);
console.log('Average score:', avgScore);

{ highScorers, avgScore }`,
  ],
  python: [
    `# Python Demo: NumPy Arrays
import numpy as np

# Create arrays
arr = np.array([1, 2, 3, 4, 5])
matrix = np.array([[1, 2, 3], [4, 5, 6], [7, 8, 9]])

print("Array:", arr)
print("Matrix:")
print(matrix)

# Operations
print("\\nArray * 2:", arr * 2)
print("Sum:", arr.sum())
print("Mean:", arr.mean())

# Display result
{'array': arr.tolist(), 'matrix': matrix.tolist()}`,
    `# Python Demo: Data Analysis
import numpy as np

# Generate sample data
np.random.seed(42)
data = np.random.normal(100, 15, 1000)

# Calculate statistics
stats = {
    'mean': np.mean(data),
    'median': np.median(data),
    'std': np.std(data),
    'min': np.min(data),
    'max': np.max(data)
}

print("Statistics for 1000 random samples:")
for key, value in stats.items():
    print(f"  {key}: {value:.2f}")

stats`,
    `# Python Demo: Matplotlib Visualization
import numpy as np
import matplotlib.pyplot as plt
import base64
from io import BytesIO

# Generate data
x = np.linspace(0, 10, 100)
y1 = np.sin(x)
y2 = np.cos(x)

# Create plot
fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(x, y1, 'b-', label='sin(x)', linewidth=2)
ax.plot(x, y2, 'r--', label='cos(x)', linewidth=2)
ax.set_xlabel('x')
ax.set_ylabel('y')
ax.set_title('Trigonometric Functions')
ax.legend()
ax.grid(True, alpha=0.3)

# Manually save and display
buf = BytesIO()
fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
buf.seek(0)
img_data = base64.b64encode(buf.read()).decode('ascii')

# Print with special prefix (will be captured and converted to image)
print(f'IMAGE_DATA:{img_data}')`,
  ],
  rust: [
    `// DEMO: fibonacci
// Rust Demo: Fibonacci Sequence
//
// Note: This is a simulated demo showing Rust-style output.
// Full Rust compilation coming soon!
//
// This would compile from:
// fn fibonacci(n: u32) -> u32 {
//     match n {
//         0 => 0,
//         1 => 1,
//         _ => fibonacci(n - 1) + fibonacci(n - 2),
//     }
// }
//
// fn main() {
//     for i in 0..10 {
//         println!("fib({}) = {}", i, fibonacci(i));
//     }
// }`,
    `// DEMO: vectors
// Rust Demo: Vector Operations
//
// Note: This is a simulated demo showing Rust-style output.
// Full Rust compilation coming soon!
//
// This would compile from:
// fn main() {
//     let numbers = vec![1, 2, 3, 4, 5];
//     println!("Created vector: {:?}", numbers);
//     println!("Length: {}", numbers.len());
//     println!("First element: {}", numbers[0]);
//     println!("Last element: {}", numbers[numbers.len() - 1]);
//
//     let sum: i32 = numbers.iter().sum();
//     println!("Sum: {}", sum);
//
//     let doubled: Vec<i32> = numbers.iter().map(|x| x * 2).collect();
//     println!("Doubled: {:?}", doubled);
// }`,
    `// DEMO: structs
// Rust Demo: Structs and Methods
//
// Note: This is a simulated demo showing Rust-style output.
// Full Rust compilation coming soon!
//
// This would compile from:
// struct Person {
//     name: String,
//     age: u32,
// }
//
// impl Person {
//     fn new(name: &str, age: u32) -> Self {
//         Person {
//             name: name.to_string(),
//             age,
//         }
//     }
// }
//
// fn main() {
//     let alice = Person::new("Alice", 30);
//     let bob = Person::new("Bob", 25);
//
//     println!("Person {{ name: {:?}, age: {} }}", alice.name, alice.age);
//     println!("Person {{ name: {:?}, age: {} }}", bob.name, bob.age);
//
//     let avg_age = (alice.age + bob.age) as f32 / 2.0;
//     println!("\\nAverage age: {}", avg_age);
// }`,
  ],
};

export function NotebookView({ config }: NotebookViewProps) {
  const [notebook] = useState(() => new Notebook(config));
  const [cells, setCells] = useState<NotebookCellType[]>([]);
  const [selectedKernel, setSelectedKernel] = useState('javascript');

  // Refresh cells periodically while executing
  useEffect(() => {
    const interval = setInterval(() => {
      setCells([...notebook.getCells()]);
    }, 100);

    return () => clearInterval(interval);
  }, [notebook]);

  const handleAddCell = () => {
    notebook.createCell(selectedKernel);
    setCells([...notebook.getCells()]);
  };

  const handleExecuteCell = async (cellId: string) => {
    try {
      await notebook.executeCell(cellId);
    } catch (error) {
      console.error('Execution error:', error);
    }
    setCells([...notebook.getCells()]);
  };

  const handleUpdateCell = (cellId: string, code: string) => {
    notebook.updateCell(cellId, code);
    setCells([...notebook.getCells()]);
  };

  const handleDeleteCell = (cellId: string) => {
    notebook.deleteCell(cellId);
    setCells([...notebook.getCells()]);
  };

  const handleExecuteAll = async () => {
    try {
      await notebook.executeAll();
    } catch (error) {
      console.error('Execution error:', error);
    }
    setCells([...notebook.getCells()]);
  };

  const handleExport = async () => {
    const doc = await notebook.export();
    const json = JSON.stringify(doc, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.metadata.title}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadDemos = () => {
    const demos = DEMO_SNIPPETS[selectedKernel];
    if (demos) {
      demos.forEach(code => {
        const cellId = notebook.createCell(selectedKernel, code);
      });
      setCells([...notebook.getCells()]);
    }
  };

  const kernelOptions = Object.keys(config.kernels || {});

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '2rem',
        padding: '1rem',
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
          OmniBook
        </h1>
        <div style={{ flex: 1 }} />
        <select
          value={selectedKernel}
          onChange={(e) => setSelectedKernel(e.target.value)}
          style={{
            padding: '0.5rem',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
          }}
        >
          {kernelOptions.map((kernel) => (
            <option key={kernel} value={kernel}>
              {kernel}
            </option>
          ))}
        </select>
        <button
          onClick={handleAddCell}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          + Add Cell
        </button>
        <button
          onClick={handleLoadDemos}
          style={{
            padding: '0.5rem 1rem',
            background: '#8b5cf6',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          📚 Load Demos
        </button>
        <button
          onClick={handleExecuteAll}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--color-success)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Run All
        </button>
        <button
          onClick={handleExport}
          style={{
            padding: '0.5rem 1rem',
            background: '#666',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Export
        </button>
      </div>

      {/* Cells */}
      {cells.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#999',
          border: '2px dashed var(--color-border)',
          borderRadius: '8px',
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>No cells yet.</p>
          <p>Click <strong>"📚 Load Demos"</strong> to see examples, or <strong>"+ Add Cell"</strong> to start from scratch.</p>
        </div>
      ) : (
        cells.map((cell) => (
          <Cell
            key={cell.id}
            cell={cell}
            onExecute={() => handleExecuteCell(cell.id)}
            onUpdate={(code) => handleUpdateCell(cell.id, code)}
            onDelete={() => handleDeleteCell(cell.id)}
          />
        ))
      )}

      {/* Stats */}
      <div style={{
        marginTop: '2rem',
        padding: '1rem',
        background: '#f9f9f9',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#666',
      }}>
        <div>Cells: {cells.length}</div>
        <div>Cross-Origin Isolated: {crossOriginIsolated ? 'Yes' : 'No'}</div>
        {!crossOriginIsolated && (
          <div style={{ color: 'var(--color-warning)', marginTop: '0.5rem' }}>
            SharedArrayBuffer not available. Zero-copy data sharing disabled.
          </div>
        )}
      </div>
    </div>
  );
}
