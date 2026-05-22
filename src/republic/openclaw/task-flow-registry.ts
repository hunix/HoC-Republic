/**
 * OpenClaw Task Flow Registry — Adapted for HoC Republic
 *
 * Manages multi-step task flows (DAGs of tasks):
 *   - Flow lifecycle: active → completed | failed
 *   - Child task tracking with ordered references
 *   - Owner-scoped access control
 *   - Flow statistics and event timeline
 *
 * A "flow" is a named group of related tasks that execute as a unit.
 * E.g., a GSD session becomes a flow with code-write, test, deploy tasks.
 *
 * Ported from upstream openclaw/src/tasks/ flow management patterns.
 */

import { uid, ts } from "../utils.js";

// ─── Flow Types ──────────────────────────────────────────────────

export type FlowState = "active" | "completed" | "failed";

export interface TaskFlow {
  id: string;
  name: string;
  ownerId: string;
  state: FlowState;
  /** Ordered list of child task IDs */
  childTaskIds: string[];
  /** Optional parent flow ID for nested flows */
  parentFlowId: string | null;
  /** Flow-level metadata */
  metadata: Record<string, unknown>;
  /** Error message if failed */
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateFlowOptions {
  name: string;
  ownerId: string;
  parentFlowId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Registry Implementation ─────────────────────────────────────

class TaskFlowRegistry {
  private readonly flows = new Map<string, TaskFlow>();
  private readonly byOwner = new Map<string, Set<string>>();
  private readonly MAX_FLOWS = 2_000;

  /**
   * Create a new task flow.
   */
  create(opts: CreateFlowOptions): TaskFlow {
    if (this.flows.size >= this.MAX_FLOWS) {
      this.evictCompleted();
    }

    const flow: TaskFlow = {
      id: `flow-${uid()}`,
      name: opts.name,
      ownerId: opts.ownerId,
      state: "active",
      childTaskIds: [],
      parentFlowId: opts.parentFlowId ?? null,
      metadata: opts.metadata ?? {},
      error: null,
      createdAt: ts(),
      completedAt: null,
    };

    this.flows.set(flow.id, flow);
    if (!this.byOwner.has(opts.ownerId)) {
      this.byOwner.set(opts.ownerId, new Set());
    }
    this.byOwner.get(opts.ownerId)!.add(flow.id);

    return flow;
  }

  /**
   * Add a child task to a flow.
   */
  addChild(flowId: string, taskId: string): boolean {
    const flow = this.flows.get(flowId);
    if (!flow || flow.state !== "active") {
      return false;
    }
    flow.childTaskIds.push(taskId);
    return true;
  }

  /**
   * Mark a flow as completed.
   */
  complete(flowId: string): TaskFlow | null {
    const flow = this.flows.get(flowId);
    if (!flow || flow.state !== "active") {
      return null;
    }
    flow.state = "completed";
    flow.completedAt = ts();
    return flow;
  }

  /**
   * Mark a flow as failed.
   */
  fail(flowId: string, error: string): TaskFlow | null {
    const flow = this.flows.get(flowId);
    if (!flow || flow.state !== "active") {
      return null;
    }
    flow.state = "failed";
    flow.error = error;
    flow.completedAt = ts();
    return flow;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  get(flowId: string): TaskFlow | null {
    return this.flows.get(flowId) ?? null;
  }

  getByOwner(ownerId: string): TaskFlow[] {
    const ids = this.byOwner.get(ownerId);
    if (!ids) {
      return [];
    }
    return [...ids].map((id) => this.flows.get(id)!).filter(Boolean);
  }

  listActive(limit = 50): TaskFlow[] {
    const active: TaskFlow[] = [];
    for (const flow of this.flows.values()) {
      if (flow.state === "active") {
        active.push(flow);
        if (active.length >= limit) {
          break;
        }
      }
    }
    return active;
  }

  listAll(opts?: { state?: FlowState; limit?: number }): TaskFlow[] {
    let flows = [...this.flows.values()];
    if (opts?.state) {
      flows = flows.filter((f) => f.state === opts.state);
    }
    return flows.slice(0, opts?.limit ?? 100);
  }

  getStats(): { total: number; active: number; completed: number; failed: number } {
    let active = 0,
      completed = 0,
      failed = 0;
    for (const flow of this.flows.values()) {
      switch (flow.state) {
        case "active":
          active++;
          break;
        case "completed":
          completed++;
          break;
        case "failed":
          failed++;
          break;
      }
    }
    return { total: this.flows.size, active, completed, failed };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private evictCompleted(): void {
    const completedIds: string[] = [];
    for (const [id, flow] of this.flows) {
      if (flow.state === "completed" || flow.state === "failed") {
        completedIds.push(id);
      }
    }
    const toRemove = completedIds.slice(0, Math.floor(this.MAX_FLOWS * 0.2));
    for (const id of toRemove) {
      const flow = this.flows.get(id)!;
      this.flows.delete(id);
      this.byOwner.get(flow.ownerId)?.delete(id);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const taskFlowRegistry = new TaskFlowRegistry();
