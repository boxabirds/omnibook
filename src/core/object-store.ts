/**
 * Content-addressed object store backed by IndexedDB
 *
 * Provides persistent storage for large data blobs with:
 * - Content addressing via SHA-256 hashing
 * - Reference counting for garbage collection
 * - Efficient blob storage and retrieval
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Handle } from '../types/index.js';

const DB_NAME = 'omnibook-objects';
const DB_VERSION = 1;
const STORE_BLOBS = 'blobs';
const STORE_REFS = 'refs';

/**
 * Stored object metadata
 */
interface StoredObject {
  handle: Handle;
  data: Uint8Array;
  size: number;
  created: number;
  accessed: number;
}

/**
 * Reference count for a handle
 */
interface RefCount {
  handle: Handle;
  count: number;
  pinned: boolean;
}

/**
 * Object Store implementation
 */
export class ObjectStore {
  private db: IDBPDatabase | null = null;
  private textEncoder = new TextEncoder();

  /**
   * Initialize the object store
   */
  async init(): Promise<void> {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Blob storage
        if (!db.objectStoreNames.contains(STORE_BLOBS)) {
          const blobStore = db.createObjectStore(STORE_BLOBS, { keyPath: 'handle' });
          blobStore.createIndex('accessed', 'accessed');
          blobStore.createIndex('created', 'created');
        }

        // Reference counts
        if (!db.objectStoreNames.contains(STORE_REFS)) {
          db.createObjectStore(STORE_REFS, { keyPath: 'handle' });
        }
      },
    });
  }

  /**
   * Compute SHA-256 hash of data to create a content-addressed handle
   */
  private async computeHandle(data: Uint8Array): Promise<Handle> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Convert various data types to Uint8Array
   */
  private toUint8Array(data: Uint8Array | ArrayBuffer | string): Uint8Array {
    if (data instanceof Uint8Array) {
      return data;
    } else if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    } else if (ArrayBuffer.isView(data)) {
      // Handle any typed array view
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    } else if (typeof data === 'string') {
      return this.textEncoder.encode(data);
    }
    throw new Error(`Unsupported data type: ${typeof data} ${data?.constructor?.name || 'unknown'}`);
  }

  /**
   * Store data and return its content-addressed handle
   */
  async put(data: Uint8Array | ArrayBuffer | string): Promise<Handle> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const bytes = this.toUint8Array(data);
    const handle = await this.computeHandle(bytes);

    // Check if already exists
    const existing = await this.db.get(STORE_BLOBS, handle);
    if (existing) {
      // Update access time
      await this.db.put(STORE_BLOBS, {
        ...existing,
        accessed: Date.now(),
      });
      return handle;
    }

    // Store new object
    const obj: StoredObject = {
      handle,
      data: bytes,
      size: bytes.byteLength,
      created: Date.now(),
      accessed: Date.now(),
    };

    await this.db.put(STORE_BLOBS, obj);

    // Initialize ref count
    await this.db.put(STORE_REFS, {
      handle,
      count: 0,
      pinned: false,
    });

    return handle;
  }

  /**
   * Retrieve data by handle
   */
  async get(handle: Handle): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const obj = await this.db.get(STORE_BLOBS, handle);
    if (!obj) return null;

    // Update access time
    obj.accessed = Date.now();
    await this.db.put(STORE_BLOBS, obj);

    return obj.data;
  }

  /**
   * Check if handle exists
   */
  async has(handle: Handle): Promise<boolean> {
    if (!this.db) throw new Error('ObjectStore not initialized');
    const obj = await this.db.get(STORE_BLOBS, handle);
    return obj !== undefined;
  }

  /**
   * Delete an object by handle (if not referenced)
   */
  async delete(handle: Handle): Promise<boolean> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const ref = await this.db.get(STORE_REFS, handle);
    if (!ref) return false;

    // Don't delete if referenced or pinned
    if (ref.count > 0 || ref.pinned) {
      return false;
    }

    await this.db.delete(STORE_BLOBS, handle);
    await this.db.delete(STORE_REFS, handle);
    return true;
  }

  /**
   * Pin a handle to prevent garbage collection
   */
  async pin(handle: Handle): Promise<void> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const ref = await this.db.get(STORE_REFS, handle);
    if (!ref) {
      throw new Error(`Handle not found: ${handle}`);
    }

    ref.pinned = true;
    await this.db.put(STORE_REFS, ref);
  }

  /**
   * Unpin a handle
   */
  async unpin(handle: Handle): Promise<void> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const ref = await this.db.get(STORE_REFS, handle);
    if (!ref) return;

    ref.pinned = false;
    await this.db.put(STORE_REFS, ref);
  }

  /**
   * Increment reference count for a handle
   */
  async incRef(handle: Handle): Promise<void> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const ref = await this.db.get(STORE_REFS, handle);
    if (!ref) {
      throw new Error(`Handle not found: ${handle}`);
    }

    ref.count++;
    await this.db.put(STORE_REFS, ref);
  }

  /**
   * Decrement reference count for a handle
   */
  async decRef(handle: Handle): Promise<void> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const ref = await this.db.get(STORE_REFS, handle);
    if (!ref) return;

    ref.count = Math.max(0, ref.count - 1);
    await this.db.put(STORE_REFS, ref);
  }

  /**
   * Get reference count for a handle
   */
  async getRefCount(handle: Handle): Promise<number> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const ref = await this.db.get(STORE_REFS, handle);
    return ref?.count ?? 0;
  }

  /**
   * Garbage collect unreferenced objects
   */
  async gc(): Promise<number> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const refs = await this.db.getAll(STORE_REFS);
    let collected = 0;

    for (const ref of refs) {
      if (ref.count === 0 && !ref.pinned) {
        await this.db.delete(STORE_BLOBS, ref.handle);
        await this.db.delete(STORE_REFS, ref.handle);
        collected++;
      }
    }

    return collected;
  }

  /**
   * Get total storage size
   */
  async getSize(): Promise<number> {
    if (!this.db) throw new Error('ObjectStore not initialized');

    const objects = await this.db.getAll(STORE_BLOBS);
    return objects.reduce((sum, obj) => sum + obj.size, 0);
  }

  /**
   * Get number of stored objects
   */
  async getCount(): Promise<number> {
    if (!this.db) throw new Error('ObjectStore not initialized');
    return await this.db.count(STORE_BLOBS);
  }

  /**
   * List all handles
   */
  async listHandles(): Promise<Handle[]> {
    if (!this.db) throw new Error('ObjectStore not initialized');
    return await this.db.getAllKeys(STORE_BLOBS);
  }

  /**
   * Clear all data (dangerous!)
   */
  async clear(): Promise<void> {
    if (!this.db) throw new Error('ObjectStore not initialized');
    await this.db.clear(STORE_BLOBS);
    await this.db.clear(STORE_REFS);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Singleton instance
 */
let globalStore: ObjectStore | null = null;

/**
 * Get the global object store instance
 */
export async function getObjectStore(): Promise<ObjectStore> {
  if (!globalStore) {
    globalStore = new ObjectStore();
    await globalStore.init();
  }
  return globalStore;
}
