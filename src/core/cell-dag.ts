/**
 * Cell Dependency Graph (DAG) for tracking execution order and invalidation
 *
 * Manages dependencies between cells based on their input/output handles,
 * provides topological sorting, and handles cache invalidation.
 */

import type { CellId, Handle } from '../types/index.js';

/**
 * Cell node in the dependency graph
 */
interface CellNode {
  id: CellId;
  inputs: Set<Handle>;
  outputs: Set<Handle>;
  dependencies: Set<CellId>; // Cells this cell depends on
  dependents: Set<CellId>;   // Cells that depend on this cell
  dirty: boolean;            // Needs re-execution
  executionCount: number;
}

/**
 * Cell DAG implementation
 */
export class CellDAG {
  private nodes = new Map<CellId, CellNode>();
  private handleProducers = new Map<Handle, CellId>(); // Which cell produces each handle
  private handleConsumers = new Map<Handle, Set<CellId>>(); // Which cells consume each handle

  /**
   * Add or update a cell in the graph
   */
  addCell(cellId: CellId): void {
    if (!this.nodes.has(cellId)) {
      this.nodes.set(cellId, {
        id: cellId,
        inputs: new Set(),
        outputs: new Set(),
        dependencies: new Set(),
        dependents: new Set(),
        dirty: true,
        executionCount: 0,
      });
    }
  }

  /**
   * Remove a cell from the graph
   */
  removeCell(cellId: CellId): void {
    const node = this.nodes.get(cellId);
    if (!node) return;

    // Clean up handle mappings
    for (const handle of node.outputs) {
      this.handleProducers.delete(handle);
    }

    for (const handle of node.inputs) {
      const consumers = this.handleConsumers.get(handle);
      if (consumers) {
        consumers.delete(cellId);
        if (consumers.size === 0) {
          this.handleConsumers.delete(handle);
        }
      }
    }

    // Remove from dependents
    for (const depId of node.dependencies) {
      const dep = this.nodes.get(depId);
      if (dep) {
        dep.dependents.delete(cellId);
      }
    }

    // Remove from dependencies
    for (const depId of node.dependents) {
      const dep = this.nodes.get(depId);
      if (dep) {
        dep.dependencies.delete(cellId);
      }
    }

    this.nodes.delete(cellId);
  }

  /**
   * Set inputs for a cell
   */
  setInputs(cellId: CellId, inputs: Record<string, Handle>): void {
    const node = this.nodes.get(cellId);
    if (!node) {
      throw new Error(`Cell not found: ${cellId}`);
    }

    // Clear old inputs
    for (const handle of node.inputs) {
      const consumers = this.handleConsumers.get(handle);
      if (consumers) {
        consumers.delete(cellId);
      }
    }
    node.inputs.clear();

    // Set new inputs and update dependencies
    const newDependencies = new Set<CellId>();

    for (const handle of Object.values(inputs)) {
      node.inputs.add(handle);

      // Track consumer
      if (!this.handleConsumers.has(handle)) {
        this.handleConsumers.set(handle, new Set());
      }
      this.handleConsumers.get(handle)!.add(cellId);

      // Find producer
      const producer = this.handleProducers.get(handle);
      if (producer && producer !== cellId) {
        newDependencies.add(producer);
      }
    }

    // Update dependency edges
    this.updateDependencies(cellId, newDependencies);
  }

  /**
   * Set outputs for a cell
   */
  setOutputs(cellId: CellId, outputs: Record<string, Handle>): void {
    const node = this.nodes.get(cellId);
    if (!node) {
      throw new Error(`Cell not found: ${cellId}`);
    }

    // Clear old outputs
    for (const handle of node.outputs) {
      const producer = this.handleProducers.get(handle);
      if (producer === cellId) {
        this.handleProducers.delete(handle);
      }
    }
    node.outputs.clear();

    // Set new outputs
    for (const handle of Object.values(outputs)) {
      node.outputs.add(handle);
      this.handleProducers.set(handle, cellId);
    }

    // Mark downstream cells as dirty
    this.invalidateDownstream(cellId);
  }

  /**
   * Update dependencies for a cell
   */
  private updateDependencies(cellId: CellId, newDeps: Set<CellId>): void {
    const node = this.nodes.get(cellId);
    if (!node) return;

    // Remove old edges
    for (const depId of node.dependencies) {
      if (!newDeps.has(depId)) {
        const dep = this.nodes.get(depId);
        if (dep) {
          dep.dependents.delete(cellId);
        }
      }
    }

    // Add new edges
    for (const depId of newDeps) {
      if (!node.dependencies.has(depId)) {
        const dep = this.nodes.get(depId);
        if (dep) {
          dep.dependents.add(cellId);
        }
      }
    }

    node.dependencies = newDeps;
  }

  /**
   * Mark a cell and all its dependents as dirty
   */
  invalidate(cellId: CellId): void {
    const node = this.nodes.get(cellId);
    if (!node) return;

    node.dirty = true;
    this.invalidateDownstream(cellId);
  }

  /**
   * Mark all downstream cells as dirty
   */
  private invalidateDownstream(cellId: CellId): void {
    const node = this.nodes.get(cellId);
    if (!node) return;

    const visited = new Set<CellId>();
    const queue = Array.from(node.dependents);

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;

      visited.add(id);
      const dep = this.nodes.get(id);
      if (dep) {
        dep.dirty = true;
        queue.push(...dep.dependents);
      }
    }
  }

  /**
   * Mark a cell as executed (clean)
   */
  markExecuted(cellId: CellId): void {
    const node = this.nodes.get(cellId);
    if (node) {
      node.dirty = false;
      node.executionCount++;
    }
  }

  /**
   * Check if a cell is dirty
   */
  isDirty(cellId: CellId): boolean {
    const node = this.nodes.get(cellId);
    return node?.dirty ?? true;
  }

  /**
   * Get cells in topological order
   */
  getTopologicalOrder(): CellId[] {
    const result: CellId[] = [];
    const visited = new Set<CellId>();
    const visiting = new Set<CellId>();

    const visit = (id: CellId): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Cycle detected in cell dependencies involving ${id}`);
      }

      visiting.add(id);
      const node = this.nodes.get(id);
      if (node) {
        for (const depId of node.dependencies) {
          visit(depId);
        }
      }
      visiting.delete(id);
      visited.add(id);
      result.push(id);
    };

    for (const id of this.nodes.keys()) {
      visit(id);
    }

    return result;
  }

  /**
   * Get cells that need execution in order
   */
  getDirtyExecutionOrder(): CellId[] {
    const allOrder = this.getTopologicalOrder();
    return allOrder.filter(id => this.isDirty(id));
  }

  /**
   * Get direct dependencies of a cell
   */
  getDependencies(cellId: CellId): CellId[] {
    const node = this.nodes.get(cellId);
    return node ? Array.from(node.dependencies) : [];
  }

  /**
   * Get direct dependents of a cell
   */
  getDependents(cellId: CellId): CellId[] {
    const node = this.nodes.get(cellId);
    return node ? Array.from(node.dependents) : [];
  }

  /**
   * Get all cells
   */
  getAllCells(): CellId[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get cell count
   */
  getCellCount(): number {
    return this.nodes.size;
  }

  /**
   * Check if graph has cycles
   */
  hasCycle(): boolean {
    try {
      this.getTopologicalOrder();
      return false;
    } catch (e) {
      return true;
    }
  }

  /**
   * Get producer of a handle
   */
  getHandleProducer(handle: Handle): CellId | null {
    return this.handleProducers.get(handle) ?? null;
  }

  /**
   * Get consumers of a handle
   */
  getHandleConsumers(handle: Handle): CellId[] {
    const consumers = this.handleConsumers.get(handle);
    return consumers ? Array.from(consumers) : [];
  }

  /**
   * Get graph statistics
   */
  getStats() {
    let totalDeps = 0;
    let dirtyCells = 0;

    for (const node of this.nodes.values()) {
      totalDeps += node.dependencies.size;
      if (node.dirty) dirtyCells++;
    }

    return {
      cellCount: this.nodes.size,
      totalDependencies: totalDeps,
      dirtyCells,
      cleanCells: this.nodes.size - dirtyCells,
      handleCount: this.handleProducers.size,
    };
  }

  /**
   * Clear the entire graph
   */
  clear(): void {
    this.nodes.clear();
    this.handleProducers.clear();
    this.handleConsumers.clear();
  }

  /**
   * Export graph to JSON for debugging/visualization
   */
  toJSON() {
    const cells = Array.from(this.nodes.entries()).map(([id, node]) => ({
      id,
      inputs: Array.from(node.inputs),
      outputs: Array.from(node.outputs),
      dependencies: Array.from(node.dependencies),
      dependents: Array.from(node.dependents),
      dirty: node.dirty,
      executionCount: node.executionCount,
    }));

    return {
      cells,
      handleProducers: Array.from(this.handleProducers.entries()),
      stats: this.getStats(),
    };
  }
}
