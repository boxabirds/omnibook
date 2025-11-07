/**
 * Kernel helper utilities for data interchange
 */

import { getDataInterchange } from '../core/data-interchange.js';
import { getObjectStore } from '../core/object-store.js';
import type { Handle, TypeDescriptor } from '../types/index.js';

/**
 * Export a value from a kernel with automatic serialization
 */
export async function exportValue(
  name: string,
  value: any
): Promise<{ handle: Handle; descriptor: TypeDescriptor }> {
  const interchange = getDataInterchange();
  const { handle, descriptor } = await interchange.serialize(value);

  return { handle, descriptor };
}

/**
 * Import a value into a kernel with automatic deserialization
 */
export async function importValue(
  handle: Handle,
  descriptor: TypeDescriptor
): Promise<any> {
  const interchange = getDataInterchange();
  return await interchange.deserialize(handle, descriptor);
}

/**
 * Export multiple values as a record
 */
export async function exportValues(
  values: Record<string, any>
): Promise<Record<string, { handle: Handle; descriptor: TypeDescriptor }>> {
  const result: Record<string, { handle: Handle; descriptor: TypeDescriptor }> = {};

  for (const [name, value] of Object.entries(values)) {
    result[name] = await exportValue(name, value);
  }

  return result;
}

/**
 * Import multiple values from handles
 */
export async function importValues(
  handles: Record<string, { handle: Handle; descriptor: TypeDescriptor }>
): Promise<Record<string, any>> {
  const result: Record<string, any> = {};

  for (const [name, { handle, descriptor }] of Object.entries(handles)) {
    result[name] = await importValue(handle, descriptor);
  }

  return result;
}

/**
 * Auto-export: scan an object for exportable values
 *
 * Usage in kernel:
 *   const exports = await autoExport({ data, result, model });
 */
export async function autoExport(
  namespace: Record<string, any>,
  exclude: string[] = ['_', '__']
): Promise<Record<string, { handle: Handle; descriptor: TypeDescriptor }>> {
  const interchange = getDataInterchange();
  const exports: Record<string, { handle: Handle; descriptor: TypeDescriptor }> = {};

  for (const [name, value] of Object.entries(namespace)) {
    // Skip excluded names
    if (exclude.some(pattern => name.startsWith(pattern))) {
      continue;
    }

    // Skip functions
    if (typeof value === 'function') {
      continue;
    }

    // Skip undefined/null
    if (value === undefined || value === null) {
      continue;
    }

    // Try to serialize
    try {
      const { handle, descriptor } = await interchange.serialize(value);
      exports[name] = { handle, descriptor };
    } catch (e) {
      // Skip values that can't be serialized
      console.warn(`Could not export ${name}:`, e);
    }
  }

  return exports;
}

/**
 * Create a proxy for automatic data loading
 *
 * Usage:
 *   const inputs = createInputProxy(inputHandles);
 *   const data = await inputs.data; // Automatically loads on access
 */
export function createInputProxy(
  handles: Record<string, { handle: Handle; descriptor: TypeDescriptor }>
): Record<string, Promise<any>> {
  const cache = new Map<string, any>();
  const loading = new Map<string, Promise<any>>();

  return new Proxy({}, {
    get(target, prop: string) {
      // Check cache
      if (cache.has(prop)) {
        return Promise.resolve(cache.get(prop));
      }

      // Check if already loading
      if (loading.has(prop)) {
        return loading.get(prop);
      }

      // Load value
      const handleInfo = handles[prop];
      if (!handleInfo) {
        return Promise.reject(new Error(`Input '${prop}' not found`));
      }

      const loadPromise = (async () => {
        const value = await importValue(handleInfo.handle, handleInfo.descriptor);
        cache.set(prop, value);
        loading.delete(prop);
        return value;
      })();

      loading.set(prop, loadPromise);
      return loadPromise;
    },

    has(target, prop: string) {
      return prop in handles;
    },

    ownKeys(target) {
      return Object.keys(handles);
    },

    getOwnPropertyDescriptor(target, prop) {
      if (prop in handles) {
        return {
          enumerable: true,
          configurable: true,
        };
      }
      return undefined;
    },
  }) as Record<string, Promise<any>>;
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Get type information for a value
 */
export function getValueTypeInfo(value: any): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  const type = typeof value;
  if (type !== 'object') return type;

  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }

  if (ArrayBuffer.isView(value)) {
    return `${value.constructor.name}(${value.byteLength} bytes)`;
  }

  if (value.constructor && value.constructor.name !== 'Object') {
    return value.constructor.name;
  }

  return 'Object';
}
