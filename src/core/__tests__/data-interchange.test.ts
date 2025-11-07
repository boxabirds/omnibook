/**
 * Data interchange integration tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DataInterchange,
  JSONSerializer,
  ArrowSerializer,
  NumPySerializer,
  BinarySerializer,
} from '../data-interchange.js';
import { DataFormat } from '../../types/index.js';
import { getObjectStore } from '../object-store.js';

describe('DataInterchange', () => {
  let interchange: DataInterchange;

  beforeEach(() => {
    interchange = new DataInterchange();
  });

  afterEach(async () => {
    // Clean up object store
    const store = await getObjectStore();
    await store.clear();
  });

  describe('JSONSerializer', () => {
    it('should serialize and deserialize simple objects', async () => {
      const original = { foo: 'bar', count: 42, nested: { value: true } };
      const { handle, descriptor } = await interchange.serialize(original);

      expect(descriptor.format).toBe(DataFormat.JSON);
      expect(handle).toBeDefined();

      const deserialized = await interchange.deserialize(handle, descriptor);
      expect(deserialized).toEqual(original);
    });

    it('should serialize and deserialize arrays', async () => {
      // JSON serializer should handle heterogeneous arrays
      const original = [1, 2, 3, 'four', { five: 5 }];

      // Force JSON serialization by using JSONSerializer directly
      const jsonSerializer = new JSONSerializer();
      const { data, descriptor } = await jsonSerializer.serialize(original);

      const store = await getObjectStore();
      const handle = await store.put(data);

      const retrieved = await store.get(handle);
      const deserialized = await jsonSerializer.deserialize(retrieved!, descriptor);
      expect(deserialized).toEqual(original);
    });

    it('should serialize and deserialize numbers and strings', async () => {
      const testCases = [42, 'hello', true, false];

      for (const original of testCases) {
        const { handle, descriptor } = await interchange.serialize(original);
        const deserialized = await interchange.deserialize(handle, descriptor);
        expect(deserialized).toBe(original);
      }
    });
  });

  describe('ArrowSerializer', () => {
    it('should serialize and deserialize array of primitives', async () => {
      const original = [1, 2, 3, 4, 5];
      const { handle, descriptor } = await interchange.serialize(original);

      expect(descriptor.format).toBe(DataFormat.Arrow);
      expect(descriptor.schema).toBeDefined();

      const deserialized = await interchange.deserialize(handle, descriptor);
      // Arrow returns typed arrays, so convert for comparison
      expect(Array.from(deserialized as any)).toEqual(original);
    });

    it('should serialize and deserialize array of objects', async () => {
      const original = [
        { name: 'Alice', age: 30, score: 95.5 },
        { name: 'Bob', age: 25, score: 87.3 },
        { name: 'Charlie', age: 35, score: 92.1 },
      ];

      const { handle, descriptor } = await interchange.serialize(original);

      expect(descriptor.format).toBe(DataFormat.Arrow);
      expect(descriptor.schema?.fields).toHaveLength(3);

      const deserialized = await interchange.deserialize(handle, descriptor);
      // Arrow may return row objects, compare the data
      expect(deserialized).toHaveLength(original.length);
      expect(deserialized[0]).toMatchObject({ name: 'Alice', age: 30 });
    });
  });

  describe('NumPySerializer', () => {
    it('should serialize and deserialize ndarray-like objects', async () => {
      const original = {
        shape: [2, 3],
        dtype: 'float64',
        data: [1.1, 2.2, 3.3, 4.4, 5.5, 6.6],
      };

      const { handle, descriptor } = await interchange.serialize(original);

      expect(descriptor.format).toBe(DataFormat.NumPy);
      expect(descriptor.schema).toEqual({ shape: [2, 3], dtype: 'float64' });

      const deserialized = await interchange.deserialize(handle, descriptor);
      expect(deserialized.shape).toEqual(original.shape);
      expect(deserialized.dtype).toBe(original.dtype);
      expect(deserialized.data).toEqual(original.data);
    });
  });

  describe('BinarySerializer', () => {
    it('should serialize and deserialize Uint8Array', async () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const { handle, descriptor } = await interchange.serialize(original);

      expect(descriptor.format).toBe(DataFormat.Binary);
      expect(descriptor.byteLength).toBe(5);

      const deserialized = await interchange.deserialize(handle, descriptor) as Uint8Array;
      expect(Array.from(deserialized)).toEqual(Array.from(original));
    });

    it('should serialize and deserialize ArrayBuffer', async () => {
      const original = new ArrayBuffer(10);
      const view = new Uint8Array(original);
      view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const { handle, descriptor } = await interchange.serialize(original);

      const deserialized = await interchange.deserialize(handle, descriptor);
      expect(new Uint8Array(deserialized)).toEqual(view);
    });
  });

  describe('Cross-language data flow simulation', () => {
    it('should handle JavaScript → Python data flow', async () => {
      // JavaScript exports an array
      const jsData = [10, 20, 30, 40, 50];
      const { handle: jsHandle, descriptor: jsDescriptor } = await interchange.serialize(jsData);

      // Python receives it (simulated) - Arrow returns typed array
      const pythonInput = await interchange.deserialize(jsHandle, jsDescriptor);
      const pythonArray = Array.from(pythonInput as any);
      expect(pythonArray).toEqual(jsData);

      // Python processes and exports a result
      const pythonResult = {
        sum: pythonArray.reduce((a: number, b: number) => a + b, 0),
        mean: pythonArray.reduce((a: number, b: number) => a + b, 0) / pythonArray.length,
        count: pythonArray.length,
      };

      const { handle: pyHandle, descriptor: pyDescriptor } = await interchange.serialize(pythonResult);

      // JavaScript receives Python's result
      const jsResult = await interchange.deserialize(pyHandle, pyDescriptor);
      expect(jsResult).toEqual({
        sum: 150,
        mean: 30,
        count: 5,
      });
    });

    it('should handle multiple format conversions', async () => {
      // Start with JSON
      const data = { values: [1, 2, 3] };
      const { handle: h1, descriptor: d1 } = await interchange.serialize(data);
      expect(d1.format).toBe(DataFormat.JSON);

      // Convert to Arrow
      const arrayData = [1, 2, 3];
      const { handle: h2, descriptor: d2 } = await interchange.serialize(arrayData);
      expect(d2.format).toBe(DataFormat.Arrow);

      // Verify both can be deserialized
      const result1 = await interchange.deserialize(h1, d1);
      const result2 = await interchange.deserialize(h2, d2);

      expect(result1).toEqual(data);
      // Arrow returns typed array
      expect(Array.from(result2 as any)).toEqual(arrayData);
    });
  });

  describe('Error handling', () => {
    it('should throw error for unsupported types', async () => {
      const unsupported = Symbol('test');
      await expect(interchange.serialize(unsupported)).rejects.toThrow();
    });

    it('should throw error for invalid handle', async () => {
      const fakeDescriptor = { format: DataFormat.JSON, byteLength: 0 };
      await expect(interchange.deserialize('invalid-handle', fakeDescriptor)).rejects.toThrow();
    });
  });
});
