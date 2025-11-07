/**
 * Data interchange utilities for cross-language data exchange
 *
 * Supports:
 * - Arrow IPC format (columnar data)
 * - NumPy format (ndarrays)
 * - JSON (simple objects)
 * - Raw binary
 */

import { tableToIPC, tableFromIPC, Table, vectorFromArray, type Vector } from 'apache-arrow';
import type { Handle, TypeDescriptor } from '../types/index.js';
import { DataFormat } from '../types/index.js';
import { getObjectStore } from '../core/object-store.js';
import { getMemoryPool } from '../core/memory-pool.js';

/**
 * Serializer interface
 */
export interface DataSerializer {
  format: DataFormat;
  canSerialize(value: any): boolean;
  serialize(value: any): Promise<{ data: Uint8Array; descriptor: TypeDescriptor }>;
  deserialize(data: Uint8Array, descriptor: TypeDescriptor): Promise<any>;
}

/**
 * JSON Serializer - for simple objects
 */
export class JSONSerializer implements DataSerializer {
  format = DataFormat.JSON;

  canSerialize(value: any): boolean {
    if (value === null || value === undefined) return false;
    const type = typeof value;
    return type === 'object' || type === 'number' || type === 'string' || type === 'boolean';
  }

  async serialize(value: any): Promise<{ data: Uint8Array; descriptor: TypeDescriptor }> {
    const json = JSON.stringify(value);
    const data = new TextEncoder().encode(json);
    return {
      data,
      descriptor: {
        format: DataFormat.JSON,
        byteLength: data.byteLength,
      },
    };
  }

  async deserialize(data: Uint8Array): Promise<any> {
    const json = new TextDecoder().decode(data);
    return JSON.parse(json);
  }
}

/**
 * Arrow Serializer - for tabular/columnar data
 */
export class ArrowSerializer implements DataSerializer {
  format = DataFormat.Arrow;

  canSerialize(value: any): boolean {
    // Check if it's an Arrow Table or Vector
    if (value instanceof Table) return true;

    // Check if it's array-like data that can be converted
    if (Array.isArray(value) && value.length > 0) {
      // Array of objects (records)
      if (typeof value[0] === 'object' && value[0] !== null) {
        return true;
      }
      // Array of primitives
      if (['number', 'string', 'boolean'].includes(typeof value[0])) {
        return true;
      }
    }

    return false;
  }

  async serialize(value: any): Promise<{ data: Uint8Array; descriptor: TypeDescriptor }> {
    let table: Table;

    if (value instanceof Table) {
      table = value;
    } else if (Array.isArray(value)) {
      // Convert array to Arrow table
      if (typeof value[0] === 'object') {
        // Array of records
        table = Table.from(value);
      } else {
        // Array of primitives - create single column
        const vector = vectorFromArray(value);
        table = Table.new([vector], ['value']);
      }
    } else {
      throw new Error('Unsupported value type for Arrow serialization');
    }

    // Serialize to Arrow IPC format
    const ipcData = tableToIPC(table);

    return {
      data: ipcData,
      descriptor: {
        format: DataFormat.Arrow,
        byteLength: ipcData.byteLength,
        schema: {
          fields: table.schema.fields.map(f => ({
            name: f.name,
            type: f.type.toString(),
          })),
        },
      },
    };
  }

  async deserialize(data: Uint8Array, descriptor: TypeDescriptor): Promise<any> {
    const table = tableFromIPC(data);

    // Convert to JavaScript objects
    // For single column, return array of values
    if (table.schema.fields.length === 1 && table.schema.fields[0].name === 'value') {
      return table.getChild('value')?.toArray();
    }

    // For multiple columns, return array of objects
    return table.toArray();
  }
}

/**
 * NumPy Serializer - for ndarrays
 */
export class NumPySerializer implements DataSerializer {
  format = DataFormat.NumPy;

  canSerialize(value: any): boolean {
    // Check for NumPy-like array structure
    return value &&
           typeof value === 'object' &&
           'shape' in value &&
           'dtype' in value &&
           'data' in value;
  }

  async serialize(value: any): Promise<{ data: Uint8Array; descriptor: TypeDescriptor }> {
    // Simplified NumPy .npy format
    // Real implementation would use full NPY header format

    const shape = value.shape as number[];
    const dtype = value.dtype as string;
    const arrayData = value.data as Uint8Array | number[];

    // Create header
    const header = {
      shape,
      dtype,
    };
    const headerJson = JSON.stringify(header);
    const headerBytes = new TextEncoder().encode(headerJson);
    const headerLength = new Uint32Array([headerBytes.byteLength]);

    // Ensure data is Uint8Array
    let dataBytes: Uint8Array;
    if (arrayData instanceof Uint8Array) {
      dataBytes = arrayData;
    } else {
      // Convert number array to Float64Array bytes
      const float64 = new Float64Array(arrayData);
      dataBytes = new Uint8Array(float64.buffer);
    }

    // Combine: [header_length][header][data]
    const total = new Uint8Array(4 + headerBytes.byteLength + dataBytes.byteLength);
    total.set(new Uint8Array(headerLength.buffer), 0);
    total.set(headerBytes, 4);
    total.set(dataBytes, 4 + headerBytes.byteLength);

    return {
      data: total,
      descriptor: {
        format: DataFormat.NumPy,
        byteLength: total.byteLength,
        schema: { shape, dtype },
      },
    };
  }

  async deserialize(data: Uint8Array, descriptor: TypeDescriptor): Promise<any> {
    // Read header length
    const headerLength = new Uint32Array(data.buffer, 0, 1)[0];

    // Read header
    const headerBytes = data.slice(4, 4 + headerLength);
    const headerJson = new TextDecoder().decode(headerBytes);
    const header = JSON.parse(headerJson);

    // Read data
    const dataBytes = data.slice(4 + headerLength);

    // Convert based on dtype
    let arrayData: number[];
    if (header.dtype === 'float64') {
      arrayData = Array.from(new Float64Array(dataBytes.buffer));
    } else if (header.dtype === 'int32') {
      arrayData = Array.from(new Int32Array(dataBytes.buffer));
    } else {
      // Default to float64
      arrayData = Array.from(new Float64Array(dataBytes.buffer));
    }

    return {
      shape: header.shape,
      dtype: header.dtype,
      data: arrayData,
    };
  }
}

/**
 * Binary Serializer - fallback for raw bytes
 */
export class BinarySerializer implements DataSerializer {
  format = DataFormat.Binary;

  canSerialize(value: any): boolean {
    return value instanceof Uint8Array ||
           value instanceof ArrayBuffer ||
           ArrayBuffer.isView(value);
  }

  async serialize(value: any): Promise<{ data: Uint8Array; descriptor: TypeDescriptor }> {
    let data: Uint8Array;

    if (value instanceof Uint8Array) {
      data = value;
    } else if (value instanceof ArrayBuffer) {
      data = new Uint8Array(value);
    } else if (ArrayBuffer.isView(value)) {
      data = new Uint8Array(value.buffer);
    } else {
      throw new Error('Unsupported binary type');
    }

    return {
      data,
      descriptor: {
        format: DataFormat.Binary,
        byteLength: data.byteLength,
      },
    };
  }

  async deserialize(data: Uint8Array): Promise<any> {
    return data;
  }
}

/**
 * Data Interchange Manager
 */
export class DataInterchange {
  private serializers: DataSerializer[] = [
    new ArrowSerializer(),
    new NumPySerializer(),
    new JSONSerializer(),
    new BinarySerializer(),
  ];

  /**
   * Serialize a value to the best format and store it
   */
  async serialize(value: any): Promise<{ handle: Handle; descriptor: TypeDescriptor }> {
    // Find appropriate serializer
    const serializer = this.serializers.find(s => s.canSerialize(value));

    if (!serializer) {
      throw new Error('No serializer found for value');
    }

    // Serialize
    const { data, descriptor } = await serializer.serialize(value);

    // Store in Object Store
    const store = await getObjectStore();
    const handle = await store.put(data);

    return { handle, descriptor };
  }

  /**
   * Deserialize a handle to a value
   */
  async deserialize(handle: Handle, descriptor: TypeDescriptor): Promise<any> {
    // Get data from Object Store
    const store = await getObjectStore();
    const data = await store.get(handle);

    if (!data) {
      throw new Error(`Handle not found: ${handle}`);
    }

    // Find appropriate serializer
    const serializer = this.serializers.find(s => s.format === descriptor.format);

    if (!serializer) {
      throw new Error(`No deserializer for format: ${descriptor.format}`);
    }

    // Deserialize
    return await serializer.deserialize(data, descriptor);
  }

  /**
   * Convert between formats
   */
  async convert(
    handle: Handle,
    fromDescriptor: TypeDescriptor,
    toFormat: DataFormat
  ): Promise<{ handle: Handle; descriptor: TypeDescriptor }> {
    // Deserialize from source format
    const value = await this.deserialize(handle, fromDescriptor);

    // Find target serializer
    const serializer = this.serializers.find(s => s.format === toFormat);
    if (!serializer) {
      throw new Error(`No serializer for format: ${toFormat}`);
    }

    // Serialize to target format
    const { data, descriptor } = await serializer.serialize(value);

    // Store
    const store = await getObjectStore();
    const newHandle = await store.put(data);

    return { handle: newHandle, descriptor };
  }
}

/**
 * Singleton instance
 */
let globalInterchange: DataInterchange | null = null;

/**
 * Get the global data interchange instance
 */
export function getDataInterchange(): DataInterchange {
  if (!globalInterchange) {
    globalInterchange = new DataInterchange();
  }
  return globalInterchange;
}
