/**
 * SharedArrayBuffer pool for zero-copy data exchange between kernels
 *
 * Manages a pool of SharedArrayBuffer chunks that can be accessed by
 * multiple Web Workers without copying data. Falls back to ArrayBuffer
 * in non-cross-origin-isolated contexts.
 */

import type { Handle } from '../types/index.js';

/**
 * Memory allocation metadata
 */
interface Allocation {
  handle: Handle;
  buffer: SharedArrayBuffer | ArrayBuffer;
  offset: number;
  length: number;
  allocated: number;
  accessed: number;
}

/**
 * Memory chunk in the pool
 */
interface MemoryChunk {
  buffer: SharedArrayBuffer | ArrayBuffer;
  size: number;
  allocated: number;
  freeRanges: Array<{ offset: number; length: number }>;
}

/**
 * Configuration for memory pool
 */
export interface MemoryPoolConfig {
  /** Size of each chunk in bytes (default: 64MB) */
  chunkSize?: number;

  /** Maximum total memory in bytes (default: 1GB) */
  maxMemory?: number;

  /** Use SharedArrayBuffer if available */
  useSharedMemory?: boolean;
}

const DEFAULT_CHUNK_SIZE = 64 * 1024 * 1024; // 64 MB
const DEFAULT_MAX_MEMORY = 1024 * 1024 * 1024; // 1 GB

/**
 * Memory pool implementation
 */
export class MemoryPool {
  private chunks: MemoryChunk[] = [];
  private allocations = new Map<Handle, Allocation>();
  private config: Required<MemoryPoolConfig>;
  private supportsSharedMemory: boolean;
  private handleCounter = 0;

  constructor(config: MemoryPoolConfig = {}) {
    this.config = {
      chunkSize: config.chunkSize ?? DEFAULT_CHUNK_SIZE,
      maxMemory: config.maxMemory ?? DEFAULT_MAX_MEMORY,
      useSharedMemory: config.useSharedMemory ?? true,
    };

    // Check if SharedArrayBuffer is available (requires cross-origin isolation)
    this.supportsSharedMemory =
      this.config.useSharedMemory &&
      typeof SharedArrayBuffer !== 'undefined' &&
      crossOriginIsolated;

    if (!this.supportsSharedMemory) {
      console.warn(
        'SharedArrayBuffer not available. Using ArrayBuffer fallback. ' +
        'Enable cross-origin isolation (COOP/COEP headers) for zero-copy data sharing.'
      );
    }
  }

  /**
   * Generate a unique handle for an allocation
   */
  private generateHandle(): Handle {
    return `mem:${++this.handleCounter}:${Date.now()}`;
  }

  /**
   * Create a new memory chunk
   */
  private createChunk(): MemoryChunk {
    const BufferConstructor = this.supportsSharedMemory ? SharedArrayBuffer : ArrayBuffer;
    const buffer = new BufferConstructor(this.config.chunkSize);

    return {
      buffer,
      size: this.config.chunkSize,
      allocated: 0,
      freeRanges: [{ offset: 0, length: this.config.chunkSize }],
    };
  }

  /**
   * Find a suitable chunk and offset for an allocation
   */
  private findSpace(size: number): { chunk: MemoryChunk; offset: number } | null {
    // Try to find space in existing chunks
    for (const chunk of this.chunks) {
      for (let i = 0; i < chunk.freeRanges.length; i++) {
        const range = chunk.freeRanges[i];
        if (range.length >= size) {
          const offset = range.offset;

          // Update free range
          if (range.length === size) {
            chunk.freeRanges.splice(i, 1);
          } else {
            range.offset += size;
            range.length -= size;
          }

          chunk.allocated += size;
          return { chunk, offset };
        }
      }
    }

    // Need a new chunk
    const totalMemory = this.chunks.reduce((sum, c) => sum + c.size, 0);
    if (totalMemory + this.config.chunkSize <= this.config.maxMemory) {
      const chunk = this.createChunk();
      this.chunks.push(chunk);
      return this.findSpace(size);
    }

    return null;
  }

  /**
   * Allocate memory and return a handle
   */
  allocate(size: number): Handle | null {
    if (size <= 0 || size > this.config.chunkSize) {
      throw new Error(`Invalid allocation size: ${size}`);
    }

    const space = this.findSpace(size);
    if (!space) {
      return null; // Out of memory
    }

    const handle = this.generateHandle();
    const allocation: Allocation = {
      handle,
      buffer: space.chunk.buffer,
      offset: space.offset,
      length: size,
      allocated: Date.now(),
      accessed: Date.now(),
    };

    this.allocations.set(handle, allocation);
    return handle;
  }

  /**
   * Free an allocation
   */
  free(handle: Handle): boolean {
    const allocation = this.allocations.get(handle);
    if (!allocation) {
      return false;
    }

    // Find the chunk
    const chunk = this.chunks.find(c => c.buffer === allocation.buffer);
    if (!chunk) {
      return false;
    }

    // Add back to free ranges
    chunk.freeRanges.push({
      offset: allocation.offset,
      length: allocation.length,
    });

    // Sort and merge adjacent free ranges
    chunk.freeRanges.sort((a, b) => a.offset - b.offset);
    for (let i = 0; i < chunk.freeRanges.length - 1; i++) {
      const current = chunk.freeRanges[i];
      const next = chunk.freeRanges[i + 1];

      if (current.offset + current.length === next.offset) {
        current.length += next.length;
        chunk.freeRanges.splice(i + 1, 1);
        i--;
      }
    }

    chunk.allocated -= allocation.length;
    this.allocations.delete(handle);
    return true;
  }

  /**
   * Get a typed view of an allocation
   */
  getView<T extends TypedArrayConstructor>(
    handle: Handle,
    constructor: T
  ): InstanceType<T> | null {
    const allocation = this.allocations.get(handle);
    if (!allocation) {
      return null;
    }

    allocation.accessed = Date.now();

    const TypedArray = constructor as any;
    return new TypedArray(
      allocation.buffer,
      allocation.offset,
      allocation.length / TypedArray.BYTES_PER_ELEMENT
    ) as InstanceType<T>;
  }

  /**
   * Get raw buffer and offset for an allocation
   */
  getAllocation(handle: Handle): {
    buffer: SharedArrayBuffer | ArrayBuffer;
    offset: number;
    length: number;
  } | null {
    const allocation = this.allocations.get(handle);
    if (!allocation) {
      return null;
    }

    allocation.accessed = Date.now();

    return {
      buffer: allocation.buffer,
      offset: allocation.offset,
      length: allocation.length,
    };
  }

  /**
   * Copy data into an allocation
   */
  write(handle: Handle, data: Uint8Array): boolean {
    const view = this.getView(handle, Uint8Array);
    if (!view) {
      return false;
    }

    if (data.length > view.length) {
      throw new Error('Data too large for allocation');
    }

    view.set(data);
    return true;
  }

  /**
   * Read data from an allocation
   */
  read(handle: Handle): Uint8Array | null {
    const view = this.getView(handle, Uint8Array);
    if (!view) {
      return null;
    }

    return new Uint8Array(view);
  }

  /**
   * Get memory statistics
   */
  getStats() {
    const totalSize = this.chunks.reduce((sum, c) => sum + c.size, 0);
    const totalAllocated = this.chunks.reduce((sum, c) => sum + c.allocated, 0);
    const totalFree = totalSize - totalAllocated;

    return {
      totalSize,
      totalAllocated,
      totalFree,
      chunkCount: this.chunks.length,
      allocationCount: this.allocations.size,
      supportsSharedMemory: this.supportsSharedMemory,
      utilization: totalSize > 0 ? totalAllocated / totalSize : 0,
    };
  }

  /**
   * Clear all allocations and chunks
   */
  clear(): void {
    this.chunks = [];
    this.allocations.clear();
    this.handleCounter = 0;
  }

  /**
   * Check if using SharedArrayBuffer
   */
  isShared(): boolean {
    return this.supportsSharedMemory;
  }
}

/**
 * Type helper for TypedArray constructors
 */
type TypedArrayConstructor =
  | typeof Int8Array
  | typeof Uint8Array
  | typeof Uint8ClampedArray
  | typeof Int16Array
  | typeof Uint16Array
  | typeof Int32Array
  | typeof Uint32Array
  | typeof Float32Array
  | typeof Float64Array
  | typeof BigInt64Array
  | typeof BigUint64Array;

/**
 * Singleton instance
 */
let globalPool: MemoryPool | null = null;

/**
 * Get the global memory pool instance
 */
export function getMemoryPool(): MemoryPool {
  if (!globalPool) {
    globalPool = new MemoryPool();
  }
  return globalPool;
}
