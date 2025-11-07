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

  const handleCreateInteropDemo = () => {
    // Clear existing cells first
    const existingCells = notebook.getCells();
    existingCells.forEach(cell => notebook.deleteCell(cell.id));

    // Cell 1: JavaScript - Generate data
    notebook.createCell('javascript', `// 🎯 Cross-Language Interoperability Demo
// Cell 1: Generate Data in JavaScript

// Create sample dataset - temperature readings over time
const temperatureData = Array.from({length: 50}, (_, i) => ({
  timestamp: Date.now() + i * 1000,
  temperature: 20 + Math.sin(i / 5) * 3 + Math.random() * 2,
  location: \`Sensor_\${i % 3}\`
}));

console.log(\`✓ Generated \${temperatureData.length} temperature readings\`);
console.log('Sample:', temperatureData.slice(0, 3));

// This data will automatically be available in the next cell!
// No manual serialization needed - OmniBook handles it.
temperatureData;`);

    // Cell 2: Python - Analyze data
    notebook.createCell('python', `# 🐍 Cell 2: Analyze Data in Python
# The 'temperatureData' variable is automatically available!

import numpy as np

# Access data from JavaScript (automatic deserialization)
print(f"✓ Received {len(temperatureData)} data points from JavaScript")
print(f"First item: {temperatureData[0]}")

# Extract temperatures into NumPy array
temps = np.array([reading['temperature'] for reading in temperatureData])

# Compute statistics
stats = {
    'mean': float(np.mean(temps)),
    'std': float(np.std(temps)),
    'min': float(np.min(temps)),
    'max': float(np.max(temps))
}

print(f"\\nTemperature Statistics:")
print(f"  Mean: {stats['mean']:.2f}°C")
print(f"  Std:  {stats['std']:.2f}°C")
print(f"  Min:  {stats['min']:.2f}°C")
print(f"  Max:  {stats['max']:.2f}°C")

# Return stats (will be available in next cell)
stats`);

    // Cell 3: Python - Clean and transform
    notebook.createCell('python', `# 🔬 Cell 3: Data Cleaning in Python

import numpy as np

# Remove outliers using 2-sigma rule
temps_array = np.array([r['temperature'] for r in temperatureData])
mean = np.mean(temps_array)
std = np.std(temps_array)

# Filter data
clean_data = [
    reading for reading in temperatureData
    if abs(reading['temperature'] - mean) <= 2 * std
]

print(f"✓ Original: {len(temperatureData)} readings")
print(f"✓ Cleaned:  {len(clean_data)} readings")
print(f"✓ Removed:  {len(temperatureData) - len(clean_data)} outliers")

# Extract just temperatures for next cell
clean_temps = [r['temperature'] for r in clean_data]

print(f"\\nClean temperature range: {min(clean_temps):.2f}°C - {max(clean_temps):.2f}°C")

# Export for Rust processing
clean_temps`);

    // Cell 4: Rust - High-performance computation
    notebook.createCell('rust', `// DEMO: temperature_analysis
// 🦀 Cell 4: High-Performance Computation in Rust
// The 'clean_temps' array is automatically available!
//
// Note: This is simulated. Full Rust would receive:
// let temps: Vec<f64> = clean_temps;
//
// Real Rust code:
// fn compute_moving_average(data: &[f64], window: usize) -> Vec<f64> {
//     data.windows(window)
//         .map(|w| w.iter().sum::<f64>() / window as f64)
//         .collect()
// }
//
// fn detect_anomalies(data: &[f64], threshold: f64) -> Vec<usize> {
//     let mean = data.iter().sum::<f64>() / data.len() as f64;
//     data.iter()
//         .enumerate()
//         .filter(|(_, &temp)| (temp - mean).abs() > threshold)
//         .map(|(i, _)| i)
//         .collect()
// }
//
// fn main() {
//     println!("Received {} temperature values", temps.len());
//
//     // 5-point moving average for smoothing
//     let smoothed = compute_moving_average(&temps, 5);
//     println!("Smoothed to {} points", smoothed.len());
//
//     // Find anomalies (> 1.5 std from mean)
//     let anomalies = detect_anomalies(&temps, 1.5);
//     println!("Found {} anomalies", anomalies.len());
//
//     (smoothed, anomalies)
// }
//
// With zero-copy via SharedArrayBuffer:
// - No data copying between Python and Rust!
// - Both languages access the same memory
// - Instant data transfer`);

    // Cell 5: JavaScript - Visualize results
    notebook.createCell('javascript', `// 📊 Cell 5: Visualize Results in JavaScript
// All previous results are automatically available!

console.log('\\n📊 CROSS-LANGUAGE DATA FLOW SUMMARY');
console.log('═'.repeat(50));

// Data from Cell 1 (JavaScript)
console.log(\`\\n1️⃣  JavaScript Generated:\`);
console.log(\`    • \${temperatureData.length} sensor readings\`);
console.log(\`    • Format: Array of objects\`);

// Data from Cell 2 (Python)
console.log(\`\\n2️⃣  Python Analyzed:\`);
console.log(\`    • Mean temperature: \${stats.mean.toFixed(2)}°C\`);
console.log(\`    • Std deviation: \${stats.std.toFixed(2)}°C\`);
console.log(\`    • Format: JSON object\`);

// Data from Cell 3 (Python)
console.log(\`\\n3️⃣  Python Cleaned:\`);
console.log(\`    • Clean readings: \${clean_temps.length}\`);
console.log(\`    • Outliers removed: \${temperatureData.length - clean_temps.length}\`);
console.log(\`    • Format: NumPy array → JS array\`);

// Create simple visualization
const histogram = {};
for (const temp of clean_temps) {
  const bucket = Math.floor(temp);
  histogram[bucket] = (histogram[bucket] || 0) + 1;
}

console.log(\`\\n📈 Temperature Distribution:\`);
Object.entries(histogram)
  .sort(([a], [b]) => Number(a) - Number(b))
  .forEach(([temp, count]) => {
    const bar = '█'.repeat(count);
    console.log(\`    \${temp}°C: \${bar} (\${count})\`);
  });

console.log(\`\\n✨ MAGIC: All data transfer was AUTOMATIC!\`);
console.log(\`   • No manual serialization\`);
console.log(\`   • No format conversion code\`);
console.log(\`   • No copying (with SharedArrayBuffer)\`);
console.log(\`   • Just return values and they flow!\`);

display({
  title: '🎉 Cross-Language Demo Complete!',
  dataFlow: 'JS → Python → Python → Rust → JS',
  formats: ['JSON', 'Arrow', 'NumPy'],
  totalReadings: temperatureData.length,
  cleanedReadings: clean_temps.length,
  stats: stats
});`);

    setCells([...notebook.getCells()]);
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
          onClick={handleCreateInteropDemo}
          style={{
            padding: '0.5rem 1rem',
            background: '#ec4899',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          🔗 Interop Demo
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
          <p style={{ marginBottom: '0.5rem' }}>
            Click <strong>"🔗 Interop Demo"</strong> to see cross-language data flow,
          </p>
          <p>
            <strong>"📚 Load Demos"</strong> for language-specific examples, or <strong>"+ Add Cell"</strong> to start from scratch.
          </p>
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
