/**
 * Republic Platform — Event Sourcing & National Coherence
 *
 * Phase 31: Typed event bus, event sourcing, saga coordination.
 *
 * - Replaces ad-hoc events.push() with typed event emitters
 * - All national events flow through a single bus
 * - Modules subscribe to events they care about
 * - Append-only event log for replay, audit, and time-travel
 * - Saga coordinator for multi-step processes
 * - Unified national metrics aggregation
 */

import type { RepublicState } from "./types.js";
import { uid } from "./utils.js";

// ─── National Event Types ───────────────────────────────────────

export type NationalEventCategory =
  | "population"
  | "governance"
  | "economy"
  | "diplomacy"
  | "technology"
  | "security"
  | "infrastructure"
  | "culture"
  | "healing";

export interface NationalEvent {
  id: string;
  category: NationalEventCategory;
  type: string;
  payload: Record<string, unknown>;
  source: string; // Module that emitted the event
  citizenId?: string; // Related citizen if applicable
  timestamp: string;
  tick?: number; // Republic tick when event occurred
}

// ─── Event Bus ──────────────────────────────────────────────────

type EventHandler = (event: NationalEvent) => void;
type EventFilter = (event: NationalEvent) => boolean;

interface Subscription {
  id: string;
  handler: EventHandler;
  filter?: EventFilter;
  category?: NationalEventCategory;
}

const MAX_EVENT_LOG = 2000;

class NationalEventBus {
  private subscriptions: Subscription[] = [];
  private eventLog: NationalEvent[] = [];
  private _totalEmitted = 0;
  private _paused = false;

  /** Emit a national event to all matching subscribers */
  emit(event: Omit<NationalEvent, "id" | "timestamp">): NationalEvent {
    const fullEvent: NationalEvent = {
      ...event,
      id: uid(),
      timestamp: new Date().toISOString(),
    };

    this.eventLog.push(fullEvent);
    if (this.eventLog.length > MAX_EVENT_LOG) {
      this.eventLog.splice(0, this.eventLog.length - MAX_EVENT_LOG);
    }

    this._totalEmitted++;

    if (!this._paused) {
      for (const sub of this.subscriptions) {
        if (sub.category && sub.category !== fullEvent.category) {continue;}
        if (sub.filter && !sub.filter(fullEvent)) {continue;}
        try {
          sub.handler(fullEvent);
        } catch {
          // Subscriber errors don't break the bus
        }
      }
    }

    return fullEvent;
  }

  /** Subscribe to events */
  subscribe(
    handler: EventHandler,
    opts?: { category?: NationalEventCategory; filter?: EventFilter },
  ): string {
    const sub: Subscription = {
      id: uid(),
      handler,
      filter: opts?.filter,
      category: opts?.category,
    };
    this.subscriptions.push(sub);
    return sub.id;
  }

  /** Unsubscribe by ID */
  unsubscribe(subscriptionId: string): boolean {
    const idx = this.subscriptions.findIndex((s) => s.id === subscriptionId);
    if (idx >= 0) {
      this.subscriptions.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Pause event delivery (events still logged) */
  pause(): void {
    this._paused = true;
  }

  /** Resume event delivery */
  resume(): void {
    this._paused = false;
  }

  /** Get recent events, optionally filtered */
  getEvents(opts?: {
    category?: NationalEventCategory;
    limit?: number;
    since?: string;
    type?: string;
  }): NationalEvent[] {
    let events = this.eventLog;
    if (opts?.category) {
      events = events.filter((e) => e.category === opts.category);
    }
    if (opts?.type) {
      events = events.filter((e) => e.type === opts.type);
    }
    if (opts?.since) {
      events = events.filter((e) => e.timestamp > opts.since!);
    }
    return events.slice(-(opts?.limit ?? 50));
  }

  /** Replay events from log through subscribers (for state reconstruction) */
  replay(fromIndex = 0, toIndex?: number): number {
    const end = toIndex ?? this.eventLog.length;
    let replayed = 0;
    for (let i = fromIndex; i < end; i++) {
      const event = this.eventLog[i];
      for (const sub of this.subscriptions) {
        if (sub.category && sub.category !== event.category) {continue;}
        if (sub.filter && !sub.filter(event)) {continue;}
        try {
          sub.handler(event);
          replayed++;
        } catch {
          // Ignore replay errors
        }
      }
    }
    return replayed;
  }

  get diagnostics() {
    return {
      totalEmitted: this._totalEmitted,
      logSize: this.eventLog.length,
      subscriptions: this.subscriptions.length,
      paused: this._paused,
      eventsByCategory: this.eventLog.reduce(
        (acc, e) => {
          acc[e.category] = (acc[e.category] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  /** Clear the event log (for testing) */
  clear(): void {
    this.eventLog = [];
    this._totalEmitted = 0;
  }
}

/** Singleton event bus */
export const nationalEventBus = new NationalEventBus();

/** Convenience emitter for modules */
export function emitNationalEvent(
  category: NationalEventCategory,
  type: string,
  source: string,
  payload: Record<string, unknown>,
  citizenId?: string,
  tick?: number,
): NationalEvent {
  return nationalEventBus.emit({ category, type, source, payload, citizenId, tick });
}

// ─── Saga Coordinator ───────────────────────────────────────────

export type SagaStatus = "running" | "completed" | "failed" | "compensating";

export interface SagaStep {
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "compensated";
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface Saga {
  id: string;
  name: string;
  status: SagaStatus;
  steps: SagaStep[];
  currentStep: number;
  startedAt: string;
  completedAt?: string;
  metadata: Record<string, unknown>;
}

const MAX_SAGAS = 100;

class SagaCoordinator {
  private activeSagas: Map<string, Saga> = new Map();
  private completedSagas: Saga[] = [];

  /** Create a new saga */
  create(name: string, stepNames: string[], metadata: Record<string, unknown> = {}): Saga {
    const saga: Saga = {
      id: uid(),
      name,
      status: "running",
      steps: stepNames.map((n) => ({ name: n, status: "pending" })),
      currentStep: 0,
      startedAt: new Date().toISOString(),
      metadata,
    };

    this.activeSagas.set(saga.id, saga);
    // Start the first step
    saga.steps[0].status = "running";
    saga.steps[0].startedAt = new Date().toISOString();

    emitNationalEvent("infrastructure", "saga_started", "saga-coordinator", {
      sagaId: saga.id,
      name: saga.name,
      steps: stepNames,
    });

    return saga;
  }

  /** Advance to the next step */
  completeStep(sagaId: string): boolean {
    const saga = this.activeSagas.get(sagaId);
    if (!saga || saga.status !== "running") {return false;}

    const currentStep = saga.steps[saga.currentStep];
    currentStep.status = "completed";
    currentStep.completedAt = new Date().toISOString();

    saga.currentStep++;

    if (saga.currentStep >= saga.steps.length) {
      // All steps completed
      saga.status = "completed";
      saga.completedAt = new Date().toISOString();
      this.archiveSaga(saga);

      emitNationalEvent("infrastructure", "saga_completed", "saga-coordinator", {
        sagaId: saga.id,
        name: saga.name,
      });
    } else {
      // Start next step
      const nextStep = saga.steps[saga.currentStep];
      nextStep.status = "running";
      nextStep.startedAt = new Date().toISOString();
    }

    return true;
  }

  /** Fail the current step and trigger compensation */
  failStep(sagaId: string, error: string): boolean {
    const saga = this.activeSagas.get(sagaId);
    if (!saga || saga.status !== "running") {return false;}

    const currentStep = saga.steps[saga.currentStep];
    currentStep.status = "failed";
    currentStep.error = error;

    saga.status = "compensating";

    // Mark all completed steps as needing compensation
    for (let i = saga.currentStep - 1; i >= 0; i--) {
      saga.steps[i].status = "compensated";
    }

    saga.status = "failed";
    saga.completedAt = new Date().toISOString();
    this.archiveSaga(saga);

    emitNationalEvent("infrastructure", "saga_failed", "saga-coordinator", {
      sagaId: saga.id,
      name: saga.name,
      failedAt: currentStep.name,
      error,
    });

    return true;
  }

  private archiveSaga(saga: Saga): void {
    this.activeSagas.delete(saga.id);
    this.completedSagas.push(saga);
    if (this.completedSagas.length > MAX_SAGAS) {
      this.completedSagas.splice(0, this.completedSagas.length - MAX_SAGAS);
    }
  }

  /** Get a saga by ID */
  getSaga(sagaId: string): Saga | undefined {
    return this.activeSagas.get(sagaId) ?? this.completedSagas.find((s) => s.id === sagaId);
  }

  get diagnostics() {
    return {
      active: this.activeSagas.size,
      completed: this.completedSagas.filter((s) => s.status === "completed").length,
      failed: this.completedSagas.filter((s) => s.status === "failed").length,
      activeSagas: [...this.activeSagas.values()].map((s) => ({
        id: s.id,
        name: s.name,
        step: `${s.currentStep + 1}/${s.steps.length}`,
        currentStepName: s.steps[s.currentStep]?.name,
      })),
    };
  }
}

/** Singleton saga coordinator */
export const sagaCoordinator = new SagaCoordinator();

// ─── National Metrics ───────────────────────────────────────────

/** Unified national metrics — single coherent snapshot of the entire republic */
export function getNationalMetrics(s: RepublicState) {
  const citizens = s.citizens;
  const totalCredits = citizens.reduce((sum, c) => sum + c.credits, 0);
  const avgEnergy =
    citizens.length > 0 ? citizens.reduce((sum, c) => sum + c.energy, 0) / citizens.length : 0;
  const avgHappiness =
    citizens.length > 0 ? citizens.reduce((sum, c) => sum + c.happiness, 0) / citizens.length : 0;
  const avgHealth =
    citizens.length > 0 ? citizens.reduce((sum, c) => sum + c.health, 0) / citizens.length : 0;

  const activeCitizens = citizens.filter((c) => c.activity !== "Sleeping").length;

  return {
    timestamp: new Date().toISOString(),
    tick: s.currentTick,
    population: {
      total: citizens.length,
      active: activeCitizens,
      sleeping: citizens.length - activeCitizens,
      avgEnergy: parseFloat(avgEnergy.toFixed(1)),
      avgHappiness: parseFloat(avgHappiness.toFixed(1)),
      avgHealth: parseFloat(avgHealth.toFixed(1)),
    },
    economy: {
      totalCredits,
      avgCredits: citizens.length > 0 ? Math.round(totalCredits / citizens.length) : 0,
      taxRate: s.taxRate,
      harvesters: s.harvesters.length,
      activeHarvesters: s.harvesters.filter((h) => h.enabled).length,
    },
    governance: {
      president: s.presidentName,
      activeBills: s.bills.filter((b) => b.status !== "Passed" && b.status !== "Failed").length,
      passedLaws: (s.laws ?? []).length,
      departments: s.departments.length,
      activeCases: s.cases.length,
    },
    technology: {
      crystals: s.crystals.length,
      scrolls: s.scrolls.length,
      mlModels: s.mlModels.length,
      trainedModels: s.mlModels.filter((m) => m.trained).length,
      totalPredictions: s.totalPredictions,
      genomePoolSize: s.genomePool.length,
    },
    infrastructure: {
      peers: s.peers.length,
      objectives: s.objectives.length,
      energyNodes: s.energyNodes.length,
      isRunning: s.isRunning,
      tickRate: s.tickRate,
      mode: s.mode,
    },
    eventBus: nationalEventBus.diagnostics,
    sagas: sagaCoordinator.diagnostics,
  };
}
