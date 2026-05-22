/**
 * Republic Platform — Phase 22: Temporal Simulation Engine
 *
 * Time management and temporal mechanics for the republic simulation:
 * - Simulation clock with configurable speed
 * - Era management (founding, growth, golden age, etc.)
 * - Scheduled event system
 * - Historical record keeping
 * - Time-based decay and growth functions
 */

import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type Era =
  | "founding"
  | "expansion"
  | "growth"
  | "golden-age"
  | "stagnation"
  | "crisis"
  | "renaissance"
  | "transcendence";

export interface SimulationClock {
  tickCount: number;
  era: Era;
  eraStartedAtTick: number;
  speedMultiplier: number; // 0.1 = slow, 1 = real, 10 = fast
  isPaused: boolean;
  startedAt: string;
  lastTickAt: string;
}

export interface ScheduledEvent {
  id: string;
  name: string;
  scheduledTick: number;
  recurring: boolean;
  intervalTicks?: number;
  callback: string; // Serializable identifier for the handler
  payload: Record<string, unknown>;
  createdAt: string;
  lastFiredAt?: string;
  fireCount: number;
}

export interface HistoricalRecord {
  id: string;
  tick: number;
  era: Era;
  category: "political" | "economic" | "social" | "technological" | "military" | "cultural";
  title: string;
  description: string;
  significance: number; // 0–1
  citizenIds: string[];
  timestamp: string;
}

export interface TemporalDiagnostics {
  tickCount: number;
  era: Era;
  eraAge: number;
  speedMultiplier: number;
  isPaused: boolean;
  scheduledEventCount: number;
  historicalRecordCount: number;
  nextScheduledTick: number | null;
}

// ─── State ──────────────────────────────────────────────────────

const clock: SimulationClock = {
  tickCount: 0,
  era: "founding",
  eraStartedAtTick: 0,
  speedMultiplier: 1,
  isPaused: false,
  startedAt: ts(),
  lastTickAt: ts(),
};

const scheduledEvents: ScheduledEvent[] = [];
const history: HistoricalRecord[] = [];
const MAX_HISTORY = 1000;
const eraCallbacks: Array<(oldEra: Era, newEra: Era, tick: number) => void> = [];

// ─── Clock Operations ────────────────────────────────────────────

/** Advance the simulation clock by one tick. Returns events that fired. */
export function advanceTick(): ScheduledEvent[] {
  if (clock.isPaused) {return [];}

  clock.tickCount++;
  clock.lastTickAt = ts();

  // Fire scheduled events
  const fired: ScheduledEvent[] = [];
  for (const event of scheduledEvents) {
    if (event.scheduledTick <= clock.tickCount) {
      fired.push(event);
      event.lastFiredAt = ts();
      event.fireCount++;

      if (event.recurring && event.intervalTicks) {
        event.scheduledTick = clock.tickCount + event.intervalTicks;
      }
    }
  }

  // Remove non-recurring fired events
  const toRemove = fired.filter((e) => !e.recurring).map((e) => e.id);
  for (const id of toRemove) {
    const idx = scheduledEvents.findIndex((e) => e.id === id);
    if (idx >= 0) {scheduledEvents.splice(idx, 1);}
  }

  return fired;
}

/** Get the current simulation clock state. */
export function getClock(): Readonly<SimulationClock> {
  return { ...clock };
}

/** Pause the simulation. */
export function pauseSimulation(): void {
  clock.isPaused = true;
}

/** Resume the simulation. */
export function resumeSimulation(): void {
  clock.isPaused = false;
}

/** Set the simulation speed multiplier. */
export function setSimulationSpeed(multiplier: number): void {
  clock.speedMultiplier = Math.max(0.1, Math.min(100, multiplier));
}

// ─── Era Management ──────────────────────────────────────────────

/** Transition to a new era. */
export function transitionEra(newEra: Era): Era {
  const oldEra = clock.era;
  if (oldEra === newEra) {return oldEra;}

  clock.era = newEra;
  clock.eraStartedAtTick = clock.tickCount;

  recordHistory(
    "political",
    `Era Transition: ${oldEra} → ${newEra}`,
    `The republic transitioned from the ${oldEra} era to the ${newEra} era.`,
    1.0,
  );

  for (const cb of eraCallbacks) {
    try {
      cb(oldEra, newEra, clock.tickCount);
    } catch {
      // Swallow callback errors
    }
  }

  return oldEra;
}

/** Register a callback for era transitions. */
export function onEraTransition(callback: (oldEra: Era, newEra: Era, tick: number) => void): void {
  eraCallbacks.push(callback);
}

/** Get the current era and how long it has lasted. */
export function getEraInfo(): { era: Era; ageTicks: number; ageLabel: string } {
  const ageTicks = clock.tickCount - clock.eraStartedAtTick;
  const ageLabel =
    ageTicks < 100 ? "early" : ageTicks < 500 ? "mid" : ageTicks < 1000 ? "late" : "ancient";
  return { era: clock.era, ageTicks, ageLabel };
}

// ─── Scheduling ──────────────────────────────────────────────────

/** Schedule an event at a specific tick. */
export function scheduleEvent(
  name: string,
  scheduledTick: number,
  callback: string,
  payload: Record<string, unknown> = {},
  opts?: { recurring?: boolean; intervalTicks?: number },
): ScheduledEvent {
  const event: ScheduledEvent = {
    id: uid(),
    name,
    scheduledTick,
    recurring: opts?.recurring ?? false,
    intervalTicks: opts?.intervalTicks,
    callback,
    payload,
    createdAt: ts(),
    fireCount: 0,
  };
  scheduledEvents.push(event);
  return event;
}

/** Cancel a scheduled event. */
export function cancelScheduledEvent(eventId: string): boolean {
  const idx = scheduledEvents.findIndex((e) => e.id === eventId);
  if (idx < 0) {return false;}
  scheduledEvents.splice(idx, 1);
  return true;
}

/** Get upcoming scheduled events. */
export function getScheduledEvents(limit = 20): ScheduledEvent[] {
  return [...scheduledEvents]
    .toSorted((a, b) => a.scheduledTick - b.scheduledTick)
    .slice(0, limit);
}

// ─── Historical Records ──────────────────────────────────────────

/** Record a historical event. */
export function recordHistory(
  category: HistoricalRecord["category"],
  title: string,
  description: string,
  significance = 0.5,
  citizenIds: string[] = [],
): HistoricalRecord {
  const record: HistoricalRecord = {
    id: uid(),
    tick: clock.tickCount,
    era: clock.era,
    category,
    title,
    description,
    significance: Math.max(0, Math.min(1, significance)),
    citizenIds,
    timestamp: ts(),
  };
  history.push(record);
  if (history.length > MAX_HISTORY) {history.shift();}
  return record;
}

/** Query historical records. */
export function getHistory(opts?: {
  category?: HistoricalRecord["category"];
  era?: Era;
  minSignificance?: number;
  limit?: number;
}): HistoricalRecord[] {
  let result = [...history];
  if (opts?.category) {result = result.filter((r) => r.category === opts.category);}
  if (opts?.era) {result = result.filter((r) => r.era === opts.era);}
  if (opts?.minSignificance) {result = result.filter((r) => r.significance >= opts.minSignificance!);}
  return result.slice(-(opts?.limit ?? 50));
}

// ─── Temporal Utilities ──────────────────────────────────────────

/** Calculate exponential decay over ticks. */
export function temporalDecay(value: number, ticksElapsed: number, halfLife: number): number {
  return value * Math.pow(0.5, ticksElapsed / halfLife);
}

/** Calculate logarithmic growth over ticks. */
export function temporalGrowth(value: number, ticksElapsed: number, growthRate: number): number {
  return value * (1 + growthRate * Math.log1p(ticksElapsed));
}

// ─── Diagnostics ─────────────────────────────────────────────────

/** Get temporal engine diagnostics. */
export function getTemporalDiagnostics(): TemporalDiagnostics {
  const nextEvent = scheduledEvents
    .filter((e) => e.scheduledTick > clock.tickCount)
    .toSorted((a, b) => a.scheduledTick - b.scheduledTick)[0];

  return {
    tickCount: clock.tickCount,
    era: clock.era,
    eraAge: clock.tickCount - clock.eraStartedAtTick,
    speedMultiplier: clock.speedMultiplier,
    isPaused: clock.isPaused,
    scheduledEventCount: scheduledEvents.length,
    historicalRecordCount: history.length,
    nextScheduledTick: nextEvent?.scheduledTick ?? null,
  };
}

// ─── Simulation Tick ─────────────────────────────────────────────

const ERA_THRESHOLDS: Record<Era, number> = {
  founding: 200,
  expansion: 500,
  growth: 1000,
  "golden-age": 2000,
  stagnation: 3000,
  crisis: 3500,
  renaissance: 5000,
  transcendence: Infinity,
};

/** Temporal tick — advance clock, fire events, evaluate era transitions. */
export function temporalTick(_s: RepublicState): void {
  // Advance the internal clock
  advanceTick();

  // Evaluate automatic era transitions based on tick count
  const eraAge = clock.tickCount - clock.eraStartedAtTick;
  const threshold = ERA_THRESHOLDS[clock.era];
  if (eraAge >= threshold) {
    const eraOrder: Era[] = [
      "founding", "expansion", "growth", "golden-age",
      "stagnation", "crisis", "renaissance", "transcendence",
    ];
    const currentIdx = eraOrder.indexOf(clock.era);
    if (currentIdx < eraOrder.length - 1) {
      transitionEra(eraOrder[currentIdx + 1]);
    }
  }
}
