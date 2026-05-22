/**
 * Republic Platform — Simulation Diagnostics
 *
 * Comprehensive tick-by-tick metrics tracking for diagnosing simulation issues.
 * Provides real-time visibility into:
 *   - Tick loop health (rate, duration, stalls)
 *   - Population dynamics (births, deaths, reproduction eligibility)
 *   - Agent pipeline (provider availability, actions, tier distribution)
 *   - Learning pipeline (study sessions, pathways, certifications)
 *   - Error tracking per domain tick
 *
 * Exposed via the `republic.diagnostics` gateway RPC handler.
 */

import { getProviderStatuses, getTierStats } from "./compute-router.js";
import type { RepublicState } from "./types.js";

// ─── Error Ring Buffer ──────────────────────────────────────────

interface DomainError {
  domain: string;
  message: string;
  timestamp: number;
  tick: number;
}

const MAX_ERRORS = 100;
const errorRing: DomainError[] = [];

/** Record a domain tick error for diagnostics. */
export function trackError(domain: string, error: unknown, tick: number): void {
  const message = error instanceof Error ? error.message : String(error);
  errorRing.push({ domain, message, timestamp: Date.now(), tick });
  if (errorRing.length > MAX_ERRORS) {
    errorRing.splice(0, errorRing.length - MAX_ERRORS);
  }
}

// ─── Tick Metrics ───────────────────────────────────────────────

interface TickMetrics {
  totalTicks: number;
  lastTickAt: number;
  lastTickDurationMs: number;
  ticksPerMinute: number;
  firstTickAt: number;
  longestTickMs: number;
  longestTickNumber: number;
}

const tickMetrics: TickMetrics = {
  totalTicks: 0,
  lastTickAt: 0,
  lastTickDurationMs: 0,
  ticksPerMinute: 0,
  firstTickAt: 0,
  longestTickMs: 0,
  longestTickNumber: 0,
};

// Rolling window for ticks-per-minute calculation
const tickTimestamps: number[] = [];
const TICK_WINDOW_MS = 60_000;

/** Record the start of a tick. Returns a function to call when the tick ends. */
export function recordTickStart(tickNumber: number): () => void {
  const start = performance.now();
  const now = Date.now();

  if (tickMetrics.firstTickAt === 0) {
    tickMetrics.firstTickAt = now;
  }

  return () => {
    const duration = performance.now() - start;
    tickMetrics.totalTicks++;
    tickMetrics.lastTickAt = Date.now();
    tickMetrics.lastTickDurationMs = Math.round(duration);

    if (duration > tickMetrics.longestTickMs) {
      tickMetrics.longestTickMs = Math.round(duration);
      tickMetrics.longestTickNumber = tickNumber;
    }

    // Update rolling ticks-per-minute
    tickTimestamps.push(tickMetrics.lastTickAt);
    const cutoff = tickMetrics.lastTickAt - TICK_WINDOW_MS;
    while (tickTimestamps.length > 0 && tickTimestamps[0] < cutoff) {
      tickTimestamps.shift();
    }
    tickMetrics.ticksPerMinute = tickTimestamps.length;
  };
}

// ─── Population Metrics ─────────────────────────────────────────

interface PopulationMetrics {
  births: number;
  reproductionAttempts: number;
  lastBirthTick: number;
  eligibleParentsLastCheck: number;
}

const populationMetrics: PopulationMetrics = {
  births: 0,
  reproductionAttempts: 0,
  lastBirthTick: 0,
  eligibleParentsLastCheck: 0,
};

/** Record a reproduction attempt. */
export function recordReproductionAttempt(
  eligible: number,
  success: boolean,
  tick: number,
): void {
  populationMetrics.reproductionAttempts++;
  populationMetrics.eligibleParentsLastCheck = eligible;
  if (success) {
    populationMetrics.births++;
    populationMetrics.lastBirthTick = tick;
  }
}

// ─── Agent Pipeline Metrics ─────────────────────────────────────

interface AgentMetrics {
  totalActionsAttempted: number;
  totalActionsSucceeded: number;
  totalActionsFailed: number;
  reflexFallbacks: number;
  lastAgentTickAt: number;
  agentTicksCompleted: number;
  agentTicksSkipped: number;
  agentTickStalls: number;
  lastProviderDiscoveryAt: number;
  providerDiscoveryErrors: number;
}

const agentMetrics: AgentMetrics = {
  totalActionsAttempted: 0,
  totalActionsSucceeded: 0,
  totalActionsFailed: 0,
  reflexFallbacks: 0,
  lastAgentTickAt: 0,
  agentTicksCompleted: 0,
  agentTicksSkipped: 0,
  agentTickStalls: 0,
  lastProviderDiscoveryAt: 0,
  providerDiscoveryErrors: 0,
};

/** Record an agent action attempt. */
export function recordAgentAction(success: boolean): void {
  agentMetrics.totalActionsAttempted++;
  if (success) {
    agentMetrics.totalActionsSucceeded++;
  } else {
    agentMetrics.totalActionsFailed++;
  }
}

/** Record a reflex fallback (Tier 0 used because LLM unavailable). */
export function recordReflexFallback(): void {
  agentMetrics.reflexFallbacks++;
}

/** Record an agent tick completion. */
export function recordAgentTickCompleted(): void {
  agentMetrics.agentTicksCompleted++;
  agentMetrics.lastAgentTickAt = Date.now();
}

/** Record an agent tick skip (because previous tick still running). */
export function recordAgentTickSkipped(): void {
  agentMetrics.agentTicksSkipped++;
}

/** Record an agent tick stall (forced reset of agentTickRunning flag). */
export function recordAgentTickStall(): void {
  agentMetrics.agentTickStalls++;
}

/** Record provider discovery result. */
export function recordProviderDiscovery(success: boolean): void {
  agentMetrics.lastProviderDiscoveryAt = Date.now();
  if (!success) {
    agentMetrics.providerDiscoveryErrors++;
  }
}

// ─── Learning Metrics ───────────────────────────────────────────

interface LearningMetrics {
  studySessionsStarted: number;
  studySessionsCompleted: number;
  pathwaysGenerated: number;
  certificationsEarned: number;
  curiosityEnrollments: number;
}

const learningMetrics: LearningMetrics = {
  studySessionsStarted: 0,
  studySessionsCompleted: 0,
  pathwaysGenerated: 0,
  certificationsEarned: 0,
  curiosityEnrollments: 0,
};

/** Record a study session start. */
export function recordStudySessionStarted(): void {
  learningMetrics.studySessionsStarted++;
}

/** Record a study session completion. */
export function recordStudySessionCompleted(): void {
  learningMetrics.studySessionsCompleted++;
}

/** Record a learning pathway generation. */
export function recordPathwayGenerated(): void {
  learningMetrics.pathwaysGenerated++;
}

/** Record a certification earned. */
export function recordCertificationEarned(): void {
  learningMetrics.certificationsEarned++;
}

/** Record a curiosity-driven enrollment. */
export function recordCuriosityEnrollment(): void {
  learningMetrics.curiosityEnrollments++;
}

// ─── Diagnostics Snapshot ───────────────────────────────────────

export interface SimDiagnostics {
  timestamp: string;
  uptimeMs: number;
  tick: TickMetrics;
  population: PopulationMetrics & {
    currentCount: number;
    avgEnergy: number;
    avgHappiness: number;
    avgHealth: number;
    avgCredits: number;
    sleepingCount: number;
    withProfessionalProfile: number;
    withActiveStudy: number;
    withCurrentPathway: number;
  };
  agent: AgentMetrics;
  learning: LearningMetrics;
  providers: Record<string, unknown>;
  tierStats: Array<{
    tier: number;
    totalCalls: number;
    avgLatencyMs: number;
    errors: number;
  }>;
  recentErrors: DomainError[];
  simState: {
    isRunning: boolean;
    isPaused: boolean;
    currentTick: number;
    mode: string;
    totalEventsProcessed: number;
    eventCount: number;
  };
}

/**
 * Get a full diagnostics snapshot of the simulation.
 * This is the main entry point for the gateway RPC handler.
 */
export function getDiagnostics(s: RepublicState): SimDiagnostics {
  const citizens = s.citizens;

  // Compute population averages
  const count = citizens.length || 1;
  const avgEnergy = Math.round((citizens.reduce((sum, c) => sum + c.energy, 0) / count) * 10) / 10;
  const avgHappiness =
    Math.round((citizens.reduce((sum, c) => sum + c.happiness, 0) / count) * 10) / 10;
  const avgHealth =
    Math.round((citizens.reduce((sum, c) => sum + c.health, 0) / count) * 10) / 10;
  const avgCredits = Math.round(citizens.reduce((sum, c) => sum + c.credits, 0) / count);

  const sleepingCount = citizens.filter((c) => c.activity === "Sleeping").length;
  const withProfessionalProfile = citizens.filter((c) => c.professionalProfile).length;
  const withActiveStudy = citizens.filter((c) => c.professionalProfile?.activeStudy).length;
  const withCurrentPathway = citizens.filter((c) => c.professionalProfile?.currentPathway).length;

  return {
    timestamp: new Date().toISOString(),
    uptimeMs: tickMetrics.firstTickAt > 0 ? Date.now() - tickMetrics.firstTickAt : 0,
    tick: { ...tickMetrics },
    population: {
      ...populationMetrics,
      currentCount: citizens.length,
      avgEnergy,
      avgHappiness,
      avgHealth,
      avgCredits,
      sleepingCount,
      withProfessionalProfile,
      withActiveStudy,
      withCurrentPathway,
    },
    agent: { ...agentMetrics },
    learning: { ...learningMetrics },
    providers: getProviderStatuses(),
    tierStats: getTierStats(),
    recentErrors: errorRing.slice(-20),
    simState: {
      isRunning: s.isRunning,
      isPaused: s.isPaused,
      currentTick: s.currentTick,
      mode: s.mode,
      totalEventsProcessed: s.totalEventsProcessed,
      eventCount: s.events.length,
    },
  };
}
