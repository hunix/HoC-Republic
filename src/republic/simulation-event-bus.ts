/**
 * Republic Platform — Simulation Event Bus
 *
 * Typed, priority-ordered event bus for decoupling the simulation tick.
 * Domain modules register handlers with a priority; the bus dispatches
 * events in priority order with per-handler error isolation and timing
 * telemetry.
 *
 * Usage:
 *   bus.on("tick", { priority: 10, name: "population", handler: (s) => ... });
 *   bus.emit("tick", state);   // dispatches to all handlers in priority order
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";

const logger = createSubsystemLogger("republic:event-bus");

// ─── Types ──────────────────────────────────────────────────────

export type SimulationEventType =
  | "tick"
  | "tick:pre"
  | "tick:post"
  | "tick:persist";

export type TickHandler = (state: RepublicState) => void | Promise<void>;
export type IndexedTickHandler = (tick: number) => void | Promise<void>;
export type CitizenTickHandler = (citizenIds: string[], tick: number) => void | Promise<void>;

export type AnyHandler = TickHandler | IndexedTickHandler | CitizenTickHandler;

export interface HandlerRegistration {
  /** Human-readable name for logging and diagnostics */
  name: string;
  /** Lower priority = runs first (0 = most critical) */
  priority: number;
  /** The handler function */
  handler: AnyHandler;
  /** Whether this handler receives state vs tick-index vs citizen-ids */
  signature?: "state" | "tick-index" | "citizen-ids";
  /** Orchestrator metadata for the advanced tick engine */
  orchestrator?: HandlerOrchestratorMeta;
}

/** Metadata for the advanced tick orchestrator (optional — backward compatible) */
export interface HandlerOrchestratorMeta {
  /** Dependencies: names of handlers that must complete before this one */
  after?: string[];
  /** Cadence: how often this handler should run (ticks) */
  cadence?: { min?: number; max?: number; initial?: number };
  /** Max execution time budget (ms) */
  budgetMs?: number;
  /** Whether this handler is safe to run concurrently with others in its tier */
  concurrent?: boolean;
  /** Handler group for dashboard categorization */
  group?: string;
}

export interface HandlerTiming {
  name: string;
  durationMs: number;
  error: string | null;
}

// ─── Event Bus ──────────────────────────────────────────────────

export class SimulationEventBus {
  private handlers: Map<SimulationEventType, HandlerRegistration[]> = new Map();
  private lastTickTimings: HandlerTiming[] = [];

  /**
   * Register a handler for an event type.
   * Handlers are sorted by priority (ascending) on registration.
   */
  on(event: SimulationEventType, registration: HandlerRegistration): void {
    const list = this.handlers.get(event) ?? [];
    list.push(registration);
    list.sort((a, b) => a.priority - b.priority);
    this.handlers.set(event, list);
  }

  /**
   * Remove a handler by name.
   */
  off(event: SimulationEventType, name: string): void {
    const list = this.handlers.get(event);
    if (!list) {return;}
    this.handlers.set(
      event,
      list.filter((h) => h.name !== name),
    );
  }

  /**
   * Dispatch an event to all registered handlers.
   * Returns timing telemetry for the dispatched handlers.
   *
   * Error isolation: each handler is wrapped in try/catch.
   * A single handler failure does NOT prevent subsequent handlers from running.
   */
  dispatch(
    event: SimulationEventType,
    state: RepublicState,
    extra?: { citizenIds?: string[]; tick?: number },
  ): HandlerTiming[] {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) {return [];}

    // Collect promises from async handlers so errors are never silenced.

    const timings: HandlerTiming[] = [];
    // Track async handler promises so rejections are never silently swallowed.
    const asyncPromises: Array<{ name: string; promise: Promise<unknown> }> = [];

    for (const reg of list) {
      const start = performance.now();
      let error: string | null = null;

      try {
        const sig = reg.signature ?? "state";
        let result: unknown;
        if (sig === "state") {
          result = (reg.handler as TickHandler)(state);
        } else if (sig === "tick-index") {
          result = (reg.handler as IndexedTickHandler)(extra?.tick ?? state.currentTick);
        } else if (sig === "citizen-ids") {
          result = (reg.handler as CitizenTickHandler)(
            extra?.citizenIds ?? [],
            extra?.tick ?? state.currentTick,
          );
        }
        // If handler returned a Promise, collect it for error tracking.
        if (result instanceof Promise) {
          asyncPromises.push({ name: reg.name, promise: result });
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        logger.warn(`Handler "${reg.name}" failed during "${event}"`, { error });
      }

      timings.push({
        name: reg.name,
        durationMs: Math.round((performance.now() - start) * 100) / 100,
        error,
      });
    }

    // Settle all async handlers in the background, logging any failures.
    if (asyncPromises.length > 0) {
      Promise.allSettled(asyncPromises.map((h) => h.promise)).then((results) => {
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (r.status === "rejected") {
            const name = asyncPromises[i].name;
            const error = r.reason instanceof Error ? r.reason.message : String(r.reason);
            logger.warn(`Async handler "${name}" rejected during "${event}"`, { error });
          }
        }
      }).catch(() => {});
    }


    if (event === "tick") {
      this.lastTickTimings = timings;
    }

    return timings;
  }

  /**
   * Get timing telemetry from the most recent tick dispatch.
   */
  getLastTickTimings(): HandlerTiming[] {
    return [...this.lastTickTimings];
  }

  /**
   * Get the number of registered handlers per event type.
   */
  getHandlerCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [event, list] of this.handlers.entries()) {
      counts[event] = list.length;
    }
    return counts;
  }

  /**
   * Get the list of registered handler names (sorted by priority).
   */
  getRegisteredHandlers(event: SimulationEventType): string[] {
    return (this.handlers.get(event) ?? []).map((h) => h.name);
  }
}

// ─── Singleton ──────────────────────────────────────────────────

/** The global simulation event bus. Exported for module registration. */
export const simulationBus = new SimulationEventBus();
