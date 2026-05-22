/**
 * Boot Orchestrator — DAG-based gateway startup engine.
 *
 * Replaces the ad-hoc sequential boot in server.impl.ts with a proper
 * dependency graph that:
 *   1. Declares all items with explicit dependencies
 *   2. Computes execution levels via topological sort
 *   3. Runs independent items in parallel (Promise.allSettled per level)
 *   4. Records per-item timing telemetry for diagnostics
 *   5. Exposes live status via RPC for the UI boot dashboard
 *
 * Tier system:
 *   critical (100) — blocks boot; failure aborts
 *   core     (75)  — runs after HTTP bind; failure = warn
 *   enhance  (50)  — parallel, non-blocking
 *   optional (25)  — gated by env/config, deferred
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("boot");

// ── Types ────────────────────────────────────────────────────────

export type BootTier = "critical" | "core" | "enhance" | "optional";

const TIER_WEIGHT: Record<BootTier, number> = {
  critical: 100,
  core: 75,
  enhance: 50,
  optional: 25,
};

export type BootItemStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface BootItemDef {
  /** Unique identifier, e.g. "inference-gateway" */
  id: string;
  /** Short human label, e.g. "Inference Gateway" */
  label: string;
  /** Importance tier */
  tier: BootTier;
  /** IDs of items that must complete before this one starts */
  deps: string[];
  /** Env var or config path that gates this item. If falsy at boot, item is skipped. */
  gate?: () => boolean;
  /** The initialization function */
  init: () => Promise<void>;
  /** Optional shutdown cleanup */
  shutdown?: () => Promise<void>;
}

export interface BootItemState {
  id: string;
  label: string;
  tier: BootTier;
  weight: number;
  deps: string[];
  status: BootItemStatus;
  level: number;
  startedAt: number | null;
  finishedAt: number | null;
  durationMs: number | null;
  error: string | null;
}

export interface BootStatus {
  phase: "idle" | "booting" | "done" | "failed";
  totalItems: number;
  completed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number | null;
  items: BootItemState[];
  levels: number;
}

// ── Orchestrator ─────────────────────────────────────────────────

export class BootOrchestrator {
  private items = new Map<string, BootItemDef>();
  private state = new Map<string, BootItemState>();
  private levels: string[][] = [];
  private phase: "idle" | "booting" | "done" | "failed" = "idle";
  private bootStart = 0;
  private bootEnd = 0;

  /** Register a boot item. Call before boot(). */
  register(item: BootItemDef): void {
    if (this.phase !== "idle") {
      throw new Error(`Cannot register "${item.id}" after boot has started`);
    }
    if (this.items.has(item.id)) {
      throw new Error(`Duplicate boot item: "${item.id}"`);
    }
    this.items.set(item.id, item);
    this.state.set(item.id, {
      id: item.id,
      label: item.label,
      tier: item.tier,
      weight: TIER_WEIGHT[item.tier],
      deps: item.deps,
      status: "pending",
      level: -1,
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      error: null,
    });
  }

  /** Compute execution levels via topological sort. */
  private resolve(): void {
    // Validate all deps exist
    for (const [id, item] of this.items) {
      for (const dep of item.deps) {
        if (!this.items.has(dep)) {
          throw new Error(`Boot item "${id}" depends on unknown item "${dep}"`);
        }
      }
    }

    // Kahn's algorithm for topological sort with level tracking
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const id of this.items.keys()) {
      inDegree.set(id, 0);
      adjList.set(id, []);
    }
    for (const [id, item] of this.items) {
      for (const dep of item.deps) {
        adjList.get(dep)!.push(id);
        inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
      }
    }

    // BFS by levels — items at the same level can run in parallel
    const levels: string[][] = [];
    let queue = [...this.items.keys()].filter((id) => inDegree.get(id) === 0);

    while (queue.length > 0) {
      levels.push(queue);
      const nextQueue: string[] = [];
      for (const id of queue) {
        for (const child of adjList.get(id) ?? []) {
          const newDeg = (inDegree.get(child) ?? 1) - 1;
          inDegree.set(child, newDeg);
          if (newDeg === 0) {
            nextQueue.push(child);
          }
        }
      }
      queue = nextQueue;
    }

    // Cycle detection
    const scheduled = levels.flat().length;
    if (scheduled !== this.items.size) {
      const missing = [...this.items.keys()].filter((id) => !levels.flat().includes(id));
      throw new Error(`Dependency cycle detected involving: ${missing.join(", ")}`);
    }

    // Assign level numbers to state
    for (let i = 0; i < levels.length; i++) {
      for (const id of levels[i]!) {
        const s = this.state.get(id);
        if (s) {
          s.level = i;
        }
      }
    }

    // Sort each level: critical first, then core, then enhance, then optional
    for (const level of levels) {
      level.sort((a, b) => {
        const wa = TIER_WEIGHT[this.items.get(a)!.tier];
        const wb = TIER_WEIGHT[this.items.get(b)!.tier];
        return wb - wa; // Higher weight first (for logging clarity)
      });
    }

    this.levels = levels;
  }

  /** Execute the boot sequence. Returns when all items are done or a critical item fails. */
  async boot(): Promise<void> {
    this.resolve();
    this.phase = "booting";
    this.bootStart = Date.now();

    log.info(`Boot orchestrator: ${this.items.size} items across ${this.levels.length} levels`);

    for (let lvl = 0; lvl < this.levels.length; lvl++) {
      const levelItems = this.levels[lvl]!;
      const levelLabel = levelItems.map((id) => id).join(", ");
      log.info(`Level ${lvl}: [${levelLabel}]`);

      const promises = levelItems.map(async (id) => {
        const def = this.items.get(id)!;
        const st = this.state.get(id)!;

        // Gate check
        if (def.gate && !def.gate()) {
          st.status = "skipped";
          log.info(`  ⊘ ${def.label} — skipped (gate closed)`);
          return;
        }

        st.status = "running";
        st.startedAt = Date.now();

        try {
          await def.init();
          st.status = "done";
          st.finishedAt = Date.now();
          st.durationMs = st.finishedAt - st.startedAt;
          log.info(`  ✓ ${def.label} — ${st.durationMs}ms`);
        } catch (err) {
          st.status = "failed";
          st.finishedAt = Date.now();
          st.durationMs = st.finishedAt - st.startedAt;
          st.error = err instanceof Error ? err.message : String(err);

          if (def.tier === "critical") {
            log.error(`  ✗ ${def.label} [CRITICAL] — ${st.error}`);
            this.phase = "failed";
            throw err; // Abort boot
          }
          log.warn(`  ✗ ${def.label} — ${st.error} (non-critical, continuing)`);
        }
      });

      // Run level in parallel. If a critical item throws, it propagates.
      try {
        await Promise.allSettled(promises);
      } catch {
        // Already handled above
      }

      // Check if a critical failure aborted boot
      // Phase can change inside async closures — use string comparison
      if ((this.phase as string) === "failed") {
        this.bootEnd = Date.now();
        const critFail = [...this.state.values()].find(
          (s) => s.status === "failed" && s.tier === "critical",
        );
        throw new Error(`Boot aborted: critical item "${critFail?.id}" failed: ${critFail?.error}`);
      }
    }

    this.bootEnd = Date.now();
    this.phase = "done";

    const totalMs = this.bootEnd - this.bootStart;
    const done = [...this.state.values()].filter((s) => s.status === "done").length;
    const failed = [...this.state.values()].filter((s) => s.status === "failed").length;
    const skipped = [...this.state.values()].filter((s) => s.status === "skipped").length;

    log.info(
      `Boot complete: ${done} done, ${failed} failed, ${skipped} skipped — ${totalMs}ms total`,
    );
  }

  /** Graceful shutdown — call shutdown() on all items in reverse level order. */
  async shutdown(): Promise<void> {
    for (let lvl = this.levels.length - 1; lvl >= 0; lvl--) {
      const levelItems = this.levels[lvl]!;
      const promises = levelItems.map(async (id) => {
        const def = this.items.get(id)!;
        const st = this.state.get(id)!;
        if (st.status !== "done" || !def.shutdown) {
          return;
        }
        try {
          await def.shutdown();
        } catch (err) {
          log.warn(`Shutdown "${id}" failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      await Promise.allSettled(promises);
    }
  }

  /** Get live boot status for RPC / UI. */
  getStatus(): BootStatus {
    const items = [...this.state.values()];
    return {
      phase: this.phase,
      totalItems: items.length,
      completed: items.filter((s) => s.status === "done").length,
      failed: items.filter((s) => s.status === "failed").length,
      skipped: items.filter((s) => s.status === "skipped").length,
      totalDurationMs: this.bootEnd > 0 ? this.bootEnd - this.bootStart : null,
      items,
      levels: this.levels.length,
    };
  }

  /** Get a specific item's state. */
  getItemState(id: string): BootItemState | undefined {
    return this.state.get(id);
  }

  /** Get the shutdown function for a specific item. */
  getShutdown(id: string): (() => Promise<void>) | undefined {
    return this.items.get(id)?.shutdown;
  }
}

// ── Singleton ────────────────────────────────────────────────────

let _instance: BootOrchestrator | null = null;

export function getBootOrchestrator(): BootOrchestrator {
  if (!_instance) {
    _instance = new BootOrchestrator();
  }
  return _instance;
}

/** Reset for testing. */
export function resetBootOrchestrator(): void {
  _instance = null;
}
