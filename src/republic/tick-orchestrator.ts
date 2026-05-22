/**
 * Republic Platform — Advanced Tick Orchestrator
 *
 * Production-grade tick lifecycle engine with 5 subsystems:
 *
 *   1. Handler DAG    — dependency graph with topological sort + concurrency tiers
 *   2. Circuit Breaker — per-handler failure isolation (CLOSED → OPEN → HALF_OPEN)
 *   3. Adaptive Scheduler — ML-informed per-handler cadence (auto-downsample)
 *   4. Tick Lifecycle Manager — phase tracking with deadline budgets
 *   5. Tick Profiler — rolling p50/p95/p99 latency + heat maps + trend detection
 *
 * Replaces the flat `simulationBus.dispatch()` with an intelligent orchestrator
 * that gives full real-time control over every handler's lifecycle.
 *
 * Inspired by:
 *   - Kubernetes scheduler (DAG-based pod scheduling)
 *   - Netflix Hystrix (circuit breaker pattern)
 *   - RL-based autoscalers (adaptive cadence)
 *   - OpenTelemetry (structured observability)
 */

import * as os from "node:os";
import type { RepublicState } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

// ─── Extracted submodules ──────────────────────────────────────────
export type {
  TickPhase,
  CircuitState,
  BackpressureSeverity,
  HandlerFn,
  OrchestratedHandler,
  CadenceConfig,
  HandlerExecution,
  TickReport,
  HandlerProfile,
  OrchestratorStats,
} from "./tick-orchestrator/types.js";
import type {
  TickPhase,
  CircuitState,
  BackpressureSeverity,
  HandlerFn,
  OrchestratedHandler,
  CadenceConfig,
  HandlerExecution,
  TickReport,
  HandlerProfile,
  OrchestratorStats,
} from "./tick-orchestrator/types.js";
import {
  DEFAULT_TICK_BUDGET_MS,
  MAX_LATENCY_SAMPLES,
  LATENCY_EMA_ALPHA,
  ERROR_EMA_ALPHA,
  CIRCUIT_FAILURE_THRESHOLD,
  CIRCUIT_COOLDOWN_TICKS,
  MAX_TICK_REPORTS,
  CADENCE_ADJUSTMENT_RATE,
  HEAVY_HANDLER_THRESHOLD_MS,
  HIGH_ERROR_RATE_THRESHOLD,
  CPU_SAMPLE_INTERVAL_MS,
  CPU_PRESSURE_THRESHOLD,
  DEFAULT_GROUP_BUDGETS,
} from "./tick-orchestrator/config.js";

// ─── Zero-Allocation Array Helpers ─────────────────────────────────

/**
 * Trim an array to `cap` most-recent elements without creating
 * a temporary splice result. Uses copyWithin + length reassignment.
 */
function trimArray(arr: unknown[], cap: number): boolean {
  if (arr.length <= cap) {
    return false;
  }
  const excess = arr.length - cap;
  arr.copyWithin(0, excess);
  arr.length = cap;
  return true;
}

/**
 * Binary-insert `value` into a sorted (ascending) number array,
 * maintaining sort order. O(log n) search + O(n) shift.
 * If the array exceeds `maxLen`, the oldest (smallest) element is evicted.
 */
function sortedInsert(arr: number[], value: number, maxLen: number): void {
  // Binary search for insertion point
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  arr.splice(lo, 0, value);
  // Evict smallest (index 0) if over capacity
  if (arr.length > maxLen) {
    arr.shift();
  }
}

const logger = createSubsystemLogger("republic:tick-orchestrator");

/** Per-handler runtime state managed by the orchestrator */
interface HandlerRuntimeState {
  /** Circuit breaker state */
  circuit: CircuitState;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Tick at which circuit was opened */
  circuitOpenedAtTick: number;
  /** Last tick this handler was executed */
  lastExecutedTick: number;
  /** Rolling latency samples (ms) */
  latencies: number[];
  /** Total execution count */
  totalExecutions: number;
  /** Total error count */
  totalErrors: number;
  /** Exponential moving average of latency (ms) */
  emaLatencyMs: number;
  /** Exponential moving average of error rate */
  emaErrorRate: number;
  /** Whether this handler was deferred (budget exceeded mid-tick) */
  deferred: boolean;
  /** Adaptive cadence: current computed cadence */
  adaptiveCadence: number;
}

// Types (155 lines) and config (67 lines) extracted to tick-orchestrator/ submodules

// ═══════════════════════════════════════════════════════════════════
//  1. HANDLER DAG — Dependency Graph with Concurrency Tiers
// ═══════════════════════════════════════════════════════════════════

/** A tier of handlers that can potentially run concurrently */
interface ExecutionTier {
  tierIndex: number;
  /** Handlers in this tier */
  handlers: OrchestratedHandler[];
  /** Whether all handlers in this tier declared concurrent=true */
  canRunConcurrently: boolean;
}

/**
 * Build execution tiers from handler registrations using topological sort.
 *
 * Handlers with no dependencies form tier 0.
 * Handlers whose deps are all in tier N go into tier N+1.
 * Within a tier, handlers with `concurrent: true` run via Promise.allSettled().
 */
function buildExecutionTiers(handlers: OrchestratedHandler[]): ExecutionTier[] {
  const handlerMap = new Map<string, OrchestratedHandler>();
  for (const h of handlers) {
    handlerMap.set(h.name, h);
  }

  // Topological sort via Kahn's algorithm
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>(); // dep → [dependents]
  const tierAssignment = new Map<string, number>();

  for (const h of handlers) {
    inDegree.set(h.name, 0);
    adjList.set(h.name, []);
  }

  // Build edges: for each handler, an edge from each dep → handler
  for (const h of handlers) {
    let validDeps = 0;
    for (const dep of h.after) {
      if (handlerMap.has(dep)) {
        adjList.get(dep)!.push(h.name);
        validDeps++;
      }
      // Silently ignore deps that don't exist (handler may not be registered)
    }
    inDegree.set(h.name, validDeps);
  }

  // BFS: start with nodes that have in-degree 0
  let currentTier: string[] = [];
  for (const [name, deg] of inDegree) {
    if (deg === 0) {
      currentTier.push(name);
      tierAssignment.set(name, 0);
    }
  }

  let tierIdx = 0;
  const tiers: ExecutionTier[] = [];

  while (currentTier.length > 0) {
    const tierHandlers = currentTier.map((n) => handlerMap.get(n)!).filter(Boolean);

    const allConcurrent = tierHandlers.every((h) => h.concurrent);

    tiers.push({
      tierIndex: tierIdx,
      handlers: tierHandlers,
      canRunConcurrently: allConcurrent && tierHandlers.length > 1,
    });

    const nextTier: string[] = [];
    for (const name of currentTier) {
      for (const dependent of adjList.get(name) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) {
          nextTier.push(dependent);
          tierAssignment.set(dependent, tierIdx + 1);
        }
      }
    }

    currentTier = nextTier;
    tierIdx++;
  }

  // Handle any cycles (shouldn't happen but defensive)
  const unassigned = handlers.filter((h) => !tierAssignment.has(h.name));
  if (unassigned.length > 0) {
    logger.warn(
      `DAG cycle detected: ${unassigned.map((h) => h.name).join(", ")} — appended to last tier`,
    );
    tiers.push({
      tierIndex: tierIdx,
      handlers: unassigned,
      canRunConcurrently: false,
    });
  }

  return tiers;
}

// ═══════════════════════════════════════════════════════════════════
//  2. CIRCUIT BREAKER — Per-Handler Failure Isolation
// ═══════════════════════════════════════════════════════════════════

/** Check if a handler's circuit breaker allows execution */
function isCircuitAllowed(runtime: HandlerRuntimeState, currentTick: number): boolean {
  switch (runtime.circuit) {
    case "closed":
      return true;
    case "open":
      // Check if cooldown has elapsed → transition to half_open
      if (currentTick - runtime.circuitOpenedAtTick >= CIRCUIT_COOLDOWN_TICKS) {
        runtime.circuit = "half_open";
        return true;
      }
      return false;
    case "half_open":
      return true; // Allow one probe attempt
  }
}

/** Record a handler execution result for circuit breaker logic */
function recordCircuitResult(
  runtime: HandlerRuntimeState,
  success: boolean,
  currentTick: number,
): void {
  if (success) {
    runtime.consecutiveFailures = 0;
    if (runtime.circuit === "half_open") {
      runtime.circuit = "closed";
    }
  } else {
    runtime.consecutiveFailures++;
    if (runtime.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD) {
      runtime.circuit = "open";
      runtime.circuitOpenedAtTick = currentTick;
      logger.warn(`Circuit OPENED for handler (${runtime.consecutiveFailures} failures)`);
    } else if (runtime.circuit === "half_open") {
      // Half-open probe failed — reopen
      runtime.circuit = "open";
      runtime.circuitOpenedAtTick = currentTick;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  3. ADAPTIVE SCHEDULER — ML-Informed Cadence
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute the adaptive cadence for a handler based on its runtime behavior.
 *
 * Uses a simple reinforcement-inspired policy:
 *   - Heavy handlers (high avg latency) → increase cadence (run less often)
 *   - High error rate → increase cadence
 *   - System CPU pressure → increase all cadences
 *   - Light, reliable handlers → decrease cadence (run more often)
 */
function computeAdaptiveCadence(
  handler: OrchestratedHandler,
  runtime: HandlerRuntimeState,
  cpuPercent: number,
): number {
  let targetCadence = handler.cadence.current;

  // Factor 1: Latency pressure
  if (runtime.emaLatencyMs > HEAVY_HANDLER_THRESHOLD_MS) {
    const pressure = Math.min(2.0, runtime.emaLatencyMs / HEAVY_HANDLER_THRESHOLD_MS);
    targetCadence += CADENCE_ADJUSTMENT_RATE * pressure;
  } else if (
    runtime.emaLatencyMs < HEAVY_HANDLER_THRESHOLD_MS * 0.3 &&
    targetCadence > handler.cadence.min
  ) {
    // Light handler — try to run more often
    targetCadence -= CADENCE_ADJUSTMENT_RATE * 0.5;
  }

  // Factor 2: Error rate pressure
  if (runtime.emaErrorRate > HIGH_ERROR_RATE_THRESHOLD) {
    targetCadence += CADENCE_ADJUSTMENT_RATE * 2;
  }

  // Factor 3: CPU system pressure
  if (cpuPercent > CPU_PRESSURE_THRESHOLD) {
    const cpuPressure = (cpuPercent - CPU_PRESSURE_THRESHOLD) / (100 - CPU_PRESSURE_THRESHOLD);
    targetCadence += CADENCE_ADJUSTMENT_RATE * cpuPressure * 3;
  }

  // Clamp to configured bounds
  return Math.max(handler.cadence.min, Math.min(handler.cadence.max, Math.round(targetCadence)));
}

/** Check whether a handler should execute this tick based on its cadence */
function shouldExecuteThisTick(runtime: HandlerRuntimeState, currentTick: number): boolean {
  if (runtime.lastExecutedTick === 0) {
    return true;
  } // First execution
  const ticksSinceLastExec = currentTick - runtime.lastExecutedTick;
  return ticksSinceLastExec >= runtime.adaptiveCadence;
}

// ═══════════════════════════════════════════════════════════════════
//  4. TICK LIFECYCLE MANAGER — Phase Tracking + Deadline Budgets
// ═══════════════════════════════════════════════════════════════════

/** Manages the lifecycle of a single tick execution */
class TickLifecycle {
  readonly tickNumber: number;
  readonly budgetMs: number;
  private readonly startedAt: number;
  phase: TickPhase = "idle";

  constructor(tickNumber: number, budgetMs: number) {
    this.tickNumber = tickNumber;
    this.budgetMs = budgetMs;
    this.startedAt = performance.now();
  }

  /** Elapsed ms since tick started */
  get elapsed(): number {
    return performance.now() - this.startedAt;
  }

  /** Remaining budget (ms) */
  get remaining(): number {
    return Math.max(0, this.budgetMs - this.elapsed);
  }

  /** Whether the budget has been exceeded */
  get overBudget(): boolean {
    return this.elapsed > this.budgetMs;
  }

  /** Budget utilization as a fraction 0-1 */
  get utilization(): number {
    return this.budgetMs > 0 ? this.elapsed / this.budgetMs : 0;
  }

  transition(phase: TickPhase): void {
    this.phase = phase;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  5. TICK PROFILER — Rolling Stats + Heat Maps + Trend Detection
// ═══════════════════════════════════════════════════════════════════

/** Compute percentile from sorted array */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Compute trend: linear regression slope on recent latency samples */
function computeTrend(samples: number[]): number {
  const n = Math.min(20, samples.length);
  if (n < 5) {
    return 0;
  }
  const recent = samples.slice(-n);
  const xMean = (n - 1) / 2;
  const yMean = recent.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (recent[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  return den > 0 ? num / den : 0;
}

/** Build a handler profile from its runtime state */
function buildHandlerProfile(
  handler: OrchestratedHandler,
  runtime: HandlerRuntimeState,
): HandlerProfile {
  // Latencies are maintained in sorted order via sortedInsert —
  // percentile extraction is O(1) indexed lookup, no clone+sort needed.
  const sorted = runtime.latencies;
  const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;

  return {
    name: handler.name,
    group: handler.group,
    totalExecutions: runtime.totalExecutions,
    totalErrors: runtime.totalErrors,
    errorRate:
      runtime.totalExecutions > 0
        ? parseFloat((runtime.totalErrors / runtime.totalExecutions).toFixed(4))
        : 0,
    cadence: runtime.adaptiveCadence,
    circuitState: runtime.circuit,
    latency: {
      p50: parseFloat(percentile(sorted, 50).toFixed(2)),
      p95: parseFloat(percentile(sorted, 95).toFixed(2)),
      p99: parseFloat(percentile(sorted, 99).toFixed(2)),
      avg: parseFloat(avg.toFixed(2)),
      max: sorted.length > 0 ? parseFloat(Math.max(...sorted).toFixed(2)) : 0,
      ema: parseFloat(runtime.emaLatencyMs.toFixed(2)),
    },
    trend: parseFloat(computeTrend(runtime.latencies).toFixed(4)),
    budgetMs: handler.budgetMs,
    budgetUtilization:
      handler.budgetMs > 0 ? parseFloat((runtime.emaLatencyMs / handler.budgetMs).toFixed(3)) : 0,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  TICK ORCHESTRATOR — The Main Engine
// ═══════════════════════════════════════════════════════════════════

export class TickOrchestrator {
  private handlers: OrchestratedHandler[] = [];
  private runtimeStates = new Map<string, HandlerRuntimeState>();
  private tiers: ExecutionTier[] = [];
  private tiersStale = true;
  private tickReports: TickReport[] = [];
  private currentPhase: TickPhase = "idle";
  private tickBudgetMs: number;
  private totalTicks = 0;
  private tickDurations: number[] = [];

  // CPU monitoring
  private cpuPercent = 0;
  private prevCpuTimes = { idle: 0, total: 0 };
  private cpuTimer?: ReturnType<typeof setInterval>;
  /** Configurable group budgets */
  private groupBudgets: Record<string, number> = { ...DEFAULT_GROUP_BUDGETS };
  /** Track cumulative group time per tick */
  private currentTickGroupTime = new Map<string, number>();
  /** Consecutive deferred tick counter for backpressure */
  private consecutiveDeferredTicks = 0;
  /** Consecutive over-budget tick counter for log throttling */
  private consecutiveOverBudgetTicks = 0;

  constructor(opts?: { tickBudgetMs?: number }) {
    this.tickBudgetMs = opts?.tickBudgetMs ?? DEFAULT_TICK_BUDGET_MS;
    this.initCpuSampling();
  }

  // ── CPU Monitoring ──────────────────────────────────────────────

  private initCpuSampling(): void {
    const cpuInfo = os.cpus();
    let idle = 0,
      total = 0;
    for (const cpu of cpuInfo) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }
    this.prevCpuTimes = { idle, total };

    this.cpuTimer = setInterval(() => this.sampleCpu(), CPU_SAMPLE_INTERVAL_MS);
    if (this.cpuTimer.unref) {
      this.cpuTimer.unref();
    }
  }

  private sampleCpu(): void {
    const cpuInfo = os.cpus();
    let idle = 0,
      total = 0;
    for (const cpu of cpuInfo) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }
    const idleDelta = idle - this.prevCpuTimes.idle;
    const totalDelta = total - this.prevCpuTimes.total;
    this.cpuPercent = totalDelta > 0 ? Math.round((1 - idleDelta / totalDelta) * 100) : 0;
    this.prevCpuTimes = { idle, total };
  }

  // ── Handler Registration ────────────────────────────────────────

  /**
   * Register a handler with the orchestrator.
   * Automatically invalidates the tier cache so the DAG is rebuilt on next tick.
   */
  register(handler: OrchestratedHandler): void {
    // Remove any existing handler with the same name
    this.handlers = this.handlers.filter((h) => h.name !== handler.name);
    this.handlers.push(handler);
    this.tiersStale = true;

    // Initialize runtime state
    if (!this.runtimeStates.has(handler.name)) {
      this.runtimeStates.set(handler.name, {
        circuit: "closed",
        consecutiveFailures: 0,
        circuitOpenedAtTick: 0,
        lastExecutedTick: 0,
        latencies: [],
        totalExecutions: 0,
        totalErrors: 0,
        emaLatencyMs: 0,
        emaErrorRate: 0,
        deferred: false,
        adaptiveCadence: handler.cadence.current,
      });
    }
  }

  /** Unregister a handler by name */
  unregister(name: string): void {
    this.handlers = this.handlers.filter((h) => h.name !== name);
    this.runtimeStates.delete(name);
    this.tiersStale = true;
  }

  /** Enable/disable a handler dynamically */
  setEnabled(name: string, enabled: boolean): void {
    const handler = this.handlers.find((h) => h.name === name);
    if (handler) {
      handler.enabled = enabled;
    }
  }

  // ── DAG Rebuild ─────────────────────────────────────────────────

  /** Rebuild execution tiers if stale */
  private ensureTiers(): void {
    if (!this.tiersStale) {
      return;
    }
    const enabled = this.handlers.filter((h) => h.enabled);
    this.tiers = buildExecutionTiers(enabled);
    this.tiersStale = false;
    logger.info(`DAG rebuilt: ${this.tiers.length} tiers, ${enabled.length} handlers`, {
      tiers: this.tiers.map((t) => ({
        tier: t.tierIndex,
        handlers: t.handlers.map((h) => h.name),
        concurrent: t.canRunConcurrently,
      })),
    });
  }

  // ── Main Tick Execution ─────────────────────────────────────────

  /**
   * Execute a full orchestrated tick.
   *
   * Phases:
   *   1. PREPARING  — rebuild DAG if stale, update adaptive cadences
   *   2. EXECUTING  — run tiers in order, respecting budget + circuit breakers
   *   3. SETTLING   — collect results, update profiler
   *   4. COMPLETE   — emit tick report
   *
   * @returns Full tick execution report
   */
  async executeTick(state: RepublicState, tickNumber: number): Promise<TickReport> {
    try {
      return await this._executeTickImpl(state, tickNumber);
    } catch (err) {
      logger.error(`CRITICAL: TickOrchestrator internal crash during tick ${tickNumber}:`, {
        error: err,
      });
      this.currentPhase = "idle";
      return {
        tickNumber,
        phase: "complete",
        totalDurationMs: 0,
        budgetMs: this.tickBudgetMs,
        budgetUsedPct: 0,
        handlersExecuted: 0,
        handlersSkipped: 0,
        handlersErrored: 0,
        handlersDeferred: 0,
        tierCount: this.tiers.length,
        executions: [],
        timestamp: performance.now(),
        backpressure: "critical",
        deferredHandlers: [],
      };
    }
  }

  private async _executeTickImpl(state: RepublicState, tickNumber: number): Promise<TickReport> {
    const lifecycle = new TickLifecycle(tickNumber, this.tickBudgetMs);
    this.totalTicks++;

    // ── Phase 1: PREPARING
    lifecycle.transition("preparing");
    this.currentPhase = "preparing";
    this.ensureTiers();
    this.updateAdaptiveCadences();

    // ── Phase 2: EXECUTING
    lifecycle.transition("executing");
    this.currentPhase = "executing";

    const executions: HandlerExecution[] = [];
    let handlersExecuted = 0;
    let handlersSkipped = 0;
    let handlersErrored = 0;
    let handlersDeferred = 0;
    const deferredHandlers: string[] = [];

    // Reset per-tick group time tracking
    this.currentTickGroupTime.clear();

    for (const tier of this.tiers) {
      // Check budget before starting tier
      if (lifecycle.overBudget) {
        // Defer remaining handlers
        for (const handler of tier.handlers) {
          const runtime = this.runtimeStates.get(handler.name)!;
          runtime.deferred = true;
          handlersDeferred++;
          deferredHandlers.push(handler.name);
          executions.push({
            name: handler.name,
            durationMs: 0,
            error: null,
            skipped: true,
            skipReason: "deferred",
            tier: tier.tierIndex,
          });
        }
        continue;
      }

      if (tier.canRunConcurrently) {
        // Execute concurrently via Promise.allSettled (true async parallelism)
        const results = await this.executeTierConcurrent(tier, state, tickNumber, lifecycle);
        for (const result of results) {
          executions.push(result);
          if (result.skipped) {
            handlersSkipped++;
          } else if (result.error) {
            handlersErrored++;
          } else {
            handlersExecuted++;
          }
        }
      } else {
        // Execute sequentially (await each handler)
        for (const handler of tier.handlers) {
          const result = await this.executeHandler(
            handler,
            state,
            tickNumber,
            lifecycle,
            tier.tierIndex,
          );
          executions.push(result);
          if (result.skipped) {
            handlersSkipped++;
          } else if (result.error) {
            handlersErrored++;
          } else {
            handlersExecuted++;
          }
        }
      }
    }

    // ── Phase 3: SETTLING
    lifecycle.transition("settling");
    this.currentPhase = "settling";

    // Cap unbounded state arrays to prevent OOM.
    // Consolidated here as the single trim point (previously also in tick() start).
    const MAX_EVENTS = 2000;
    let trimmedArrays = 0;
    if (state.events && state.events.length > MAX_EVENTS * 1.5) {
      trimArray(state.events, MAX_EVENTS);
      trimmedArrays++;
    }
    const stateAny = state as unknown as Record<string, unknown>;

    // Comprehensive state array capping — all unbounded collections
    const arrayCaps: [string, number][] = [
      ["gossipLog", 400],
      ["actionLog", 800],
      ["transactions", 2000],
      ["harvesters", 500],
      ["swarmTasks", 1000],
      ["dialecticProposals", 500],
      ["prophecies", 500],
      ["disasterLog", 500],
      ["pressArticles", 500],
      ["propagandaCampaigns", 500],
      ["restorativeCases", 500],
      ["digitalEcology", 500],
      ["scarcityEvents", 500],
      ["commonsResources", 500],
      ["museumExhibits", 500],
      ["diplomaticProtocols", 500],
      ["mutualAidSocieties", 500],
      ["ritesLog", 500],
      ["oralTraditions", 500],
      ["memes", 500],
    ];

    for (const [key, cap] of arrayCaps) {
      const arr = stateAny[key] as unknown[] | undefined;
      if (arr && trimArray(arr, cap)) {
        trimmedArrays++;
      }
    }

    // Hint GC after significant trimming to reclaim freed memory
    if (trimmedArrays > 3) {
      const gc = (globalThis as unknown as Record<string, unknown>).gc;
      if (typeof gc === "function") {
        try {
          (gc as () => void)();
        } catch {
          // GC hint failed — non-fatal
        }
      }
    }

    // Record tick duration
    const totalDuration = lifecycle.elapsed;
    this.tickDurations.push(totalDuration);
    trimArray(this.tickDurations, MAX_TICK_REPORTS);

    // ── Phase 4: COMPLETE
    lifecycle.transition("complete");
    this.currentPhase = "complete";

    const report: TickReport = {
      tickNumber,
      phase: "complete",
      totalDurationMs: parseFloat(totalDuration.toFixed(2)),
      budgetMs: this.tickBudgetMs,
      budgetUsedPct: parseFloat((lifecycle.utilization * 100).toFixed(1)),
      handlersExecuted,
      handlersSkipped,
      handlersErrored,
      handlersDeferred,
      tierCount: this.tiers.length,
      executions,
      timestamp: performance.now(),
      backpressure: this.computeBackpressure(handlersDeferred, this.handlers.length),
      deferredHandlers,
    };

    this.tickReports.push(report);
    trimArray(this.tickReports as unknown as unknown[], MAX_TICK_REPORTS);

    if (lifecycle.overBudget) {
      this.consecutiveOverBudgetTicks++;
      // Suppress budget warnings during warm-up (first 5 ticks) and
      // throttle to every 10th consecutive over-budget tick after that
      // to avoid log spam during sustained heavy load.
      const pastWarmup = this.totalTicks > 5;
      const shouldLog = pastWarmup && this.consecutiveOverBudgetTicks % 10 === 1;
      if (shouldLog) {
        const slowExecs = executions
          .filter((e) => e.durationMs > 50)
          .toSorted((a, b) => b.durationMs - a.durationMs);
        const slowStr = slowExecs.map((e) => `${e.name}=${e.durationMs.toFixed(1)}ms`).join(", ");
        logger.warn(
          `Tick ${tickNumber} exceeded budget: ${totalDuration.toFixed(1)}ms / ${this.tickBudgetMs}ms (deferred ${handlersDeferred}). Slow handlers: ${slowStr}`,
        );
      }
    } else {
      this.consecutiveOverBudgetTicks = 0;
    }

    this.currentPhase = "idle";
    return report;
  }

  // ── Single Handler Execution ────────────────────────────────────

  private async executeHandler(
    handler: OrchestratedHandler,
    state: RepublicState,
    tickNumber: number,
    lifecycle: TickLifecycle,
    tierIndex: number,
  ): Promise<HandlerExecution> {
    const runtime = this.runtimeStates.get(handler.name)!;
    runtime.deferred = false;

    // Gate 1: Enabled check
    if (!handler.enabled) {
      return {
        name: handler.name,
        durationMs: 0,
        error: null,
        skipped: true,
        skipReason: "disabled",
        tier: tierIndex,
      };
    }

    // Gate 2: Circuit breaker
    if (!isCircuitAllowed(runtime, tickNumber)) {
      return {
        name: handler.name,
        durationMs: 0,
        error: null,
        skipped: true,
        skipReason: "circuit_open",
        tier: tierIndex,
      };
    }

    // Gate 3: Cadence check
    if (!shouldExecuteThisTick(runtime, tickNumber)) {
      return {
        name: handler.name,
        durationMs: 0,
        error: null,
        skipped: true,
        skipReason: "cadence",
        tier: tierIndex,
      };
    }

    // Gate 4: Budget check (only if we're close to the limit)
    if (lifecycle.remaining < runtime.emaLatencyMs * 0.5 && lifecycle.utilization > 0.8) {
      runtime.deferred = true;
      return {
        name: handler.name,
        durationMs: 0,
        error: null,
        skipped: true,
        skipReason: "budget_exceeded",
        tier: tierIndex,
      };
    }

    // Gate 5: Group budget check — prevent one handler group from starving others
    if (this.isGroupBudgetExceeded(handler)) {
      runtime.deferred = true;
      return {
        name: handler.name,
        durationMs: 0,
        error: null,
        skipped: true,
        skipReason: "budget_exceeded",
        tier: tierIndex,
      };
    }

    // Execute — properly await async handlers
    const start = performance.now();
    let error: string | null = null;
    const handlerTimeoutMs = (handler.budgetMs ?? 50) * 3; // 3× budget as hard timeout

    try {
      const result = handler.handler(state, tickNumber);

      // If handler returns a promise, await it with a timeout
      if (result && typeof (result as Promise<unknown>).then === "function") {
        await Promise.race([
          result as Promise<unknown>,
          new Promise<never>((_, reject) => {
            const t = setTimeout(
              () =>
                reject(new Error(`Handler "${handler.name}" timed out (${handlerTimeoutMs}ms)`)),
              handlerTimeoutMs,
            );
            if (typeof t === "object" && "unref" in t) {
              t.unref();
            }
          }),
        ]);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.warn(`Handler "${handler.name}" failed at tick ${tickNumber}`, { error });
    }

    const durationMs = performance.now() - start;
    const success = error === null;

    // Update runtime state
    runtime.lastExecutedTick = tickNumber;
    runtime.totalExecutions++;
    sortedInsert(runtime.latencies, durationMs, MAX_LATENCY_SAMPLES);
    runtime.emaLatencyMs =
      LATENCY_EMA_ALPHA * durationMs + (1 - LATENCY_EMA_ALPHA) * runtime.emaLatencyMs;

    if (!success) {
      runtime.totalErrors++;
      runtime.emaErrorRate = ERROR_EMA_ALPHA * 1 + (1 - ERROR_EMA_ALPHA) * runtime.emaErrorRate;
    } else {
      runtime.emaErrorRate = (1 - ERROR_EMA_ALPHA) * runtime.emaErrorRate;
    }

    recordCircuitResult(runtime, success, tickNumber);

    // Record execution time for group budget tracking
    this.recordGroupTime(handler, durationMs);

    return {
      name: handler.name,
      durationMs: parseFloat(durationMs.toFixed(2)),
      error,
      skipped: false,
      tier: tierIndex,
    };
  }

  // ── Concurrent Tier Execution ───────────────────────────────────

  private async executeTierConcurrent(
    tier: ExecutionTier,
    state: RepublicState,
    tickNumber: number,
    lifecycle: TickLifecycle,
  ): Promise<HandlerExecution[]> {
    // True concurrent execution via Promise.allSettled.
    // All handlers in this tier start simultaneously and we await
    // all of them. This gives genuine parallelism for async handlers
    // (API calls, I/O) while sync handlers complete immediately.

    const promises = tier.handlers.map((handler) =>
      this.executeHandler(handler, state, tickNumber, lifecycle, tier.tierIndex),
    );

    const settled = await Promise.allSettled(promises);
    const results: HandlerExecution[] = [];

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      if (outcome.status === "fulfilled") {
        results.push(outcome.value);
      } else {
        // Promise.allSettled rejection — shouldn't happen since executeHandler catches,
        // but handle defensively
        results.push({
          name: tier.handlers[i].name,
          durationMs: 0,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
          skipped: false,
          tier: tier.tierIndex,
        });
      }
    }
    return results;
  }

  // ── Adaptive Cadence Update ─────────────────────────────────────

  private updateAdaptiveCadences(): void {
    for (const handler of this.handlers) {
      const runtime = this.runtimeStates.get(handler.name);
      if (!runtime) {
        continue;
      }
      runtime.adaptiveCadence = computeAdaptiveCadence(handler, runtime, this.cpuPercent);
    }
  }

  // ── Query API ───────────────────────────────────────────────────

  /** Get comprehensive orchestrator stats */
  getStats(): OrchestratorStats {
    this.ensureTiers();

    const handlerProfiles = this.handlers
      .map((h) => {
        const runtime = this.runtimeStates.get(h.name);
        if (!runtime) {
          return null;
        }
        return buildHandlerProfile(h, runtime);
      })
      .filter(Boolean) as HandlerProfile[];

    const tierBreakdown = this.tiers.map((t) => ({
      tier: t.tierIndex,
      handlers: t.handlers.map((h) => h.name),
      concurrent: t.canRunConcurrently,
    }));

    const recentDurations = this.tickDurations.slice(-50);
    const avgTickMs =
      recentDurations.length > 0
        ? recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length
        : 0;

    const sortedDurations = [...recentDurations].toSorted((a, b) => a - b);
    const p95TickMs = percentile(sortedDurations, 95);

    const circuitOpenCount = [...this.runtimeStates.values()].filter(
      (r) => r.circuit === "open",
    ).length;

    const mem = process.memoryUsage();

    return {
      totalTicks: this.totalTicks,
      totalHandlers: this.handlers.length,
      activeHandlers: this.handlers.filter((h) => h.enabled).length,
      circuitOpenCount,
      avgTickDurationMs: parseFloat(avgTickMs.toFixed(2)),
      p95TickDurationMs: parseFloat(p95TickMs.toFixed(2)),
      handlerProfiles,
      tierBreakdown,
      systemLoad: {
        cpuPercent: this.cpuPercent,
        heapUsedMB: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(1)),
        rssUsedMB: parseFloat((mem.rss / 1024 / 1024).toFixed(1)),
      },
      ticksPerMinute: avgTickMs > 0 ? Math.round(60000 / avgTickMs) : 0,
      currentPhase: this.currentPhase,
      healthScore: this.getHealthScore(),
      backpressure:
        this.tickReports.length > 0
          ? this.tickReports[this.tickReports.length - 1].backpressure
          : ("none" as BackpressureSeverity),
      groupBudgets: Object.fromEntries(
        Object.entries(this.groupBudgets).map(([group, budget]) => [
          group,
          {
            budgetMs: budget,
            usedMs: parseFloat((this.currentTickGroupTime.get(group) ?? 0).toFixed(2)),
            utilization:
              budget > 0
                ? parseFloat(((this.currentTickGroupTime.get(group) ?? 0) / budget).toFixed(3))
                : 0,
          },
        ]),
      ),
    };
  }

  /** Get the N most recent tick reports */
  getRecentReports(n = 10): TickReport[] {
    return this.tickReports.slice(-n);
  }

  /** Get the last tick report */
  getLastReport(): TickReport | null {
    return this.tickReports.length > 0 ? this.tickReports[this.tickReports.length - 1] : null;
  }

  /** Get a specific handler's profile */
  getHandlerProfile(name: string): HandlerProfile | null {
    const handler = this.handlers.find((h) => h.name === name);
    const runtime = this.runtimeStates.get(name);
    if (!handler || !runtime) {
      return null;
    }
    return buildHandlerProfile(handler, runtime);
  }

  /** Get the execution tiers (for visualization) */
  getTiers(): ExecutionTier[] {
    this.ensureTiers();
    return this.tiers;
  }

  /** Get registered handler names */
  getHandlerNames(): string[] {
    return this.handlers.map((h) => h.name);
  }

  /** Dynamically adjust the tick budget */
  setTickBudget(ms: number): void {
    this.tickBudgetMs = Math.max(500, Math.min(15000, ms));
  }

  /** Force-reset a circuit breaker */
  resetCircuit(name: string): void {
    const runtime = this.runtimeStates.get(name);
    if (runtime) {
      runtime.circuit = "closed";
      runtime.consecutiveFailures = 0;
    }
  }

  /** Shutdown — clean up timers and call handler shutdown hooks */
  shutdown(): void {
    // Call onShutdown lifecycle hooks
    for (const handler of this.handlers) {
      if (handler.onShutdown) {
        try {
          handler.onShutdown();
        } catch (err) {
          logger.warn(`Handler "${handler.name}" onShutdown failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    if (this.cpuTimer) {
      clearInterval(this.cpuTimer);
      this.cpuTimer = undefined;
    }
  }

  /** Pause all handlers — calls onPause lifecycle hooks */
  pauseAll(): void {
    for (const handler of this.handlers) {
      if (handler.onPause) {
        try {
          handler.onPause();
        } catch (err) {
          logger.warn(`Handler "${handler.name}" onPause failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  /** Resume all handlers — calls onResume lifecycle hooks */
  resumeAll(): void {
    for (const handler of this.handlers) {
      if (handler.onResume) {
        try {
          handler.onResume();
        } catch (err) {
          logger.warn(`Handler "${handler.name}" onResume failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  /** Set a custom group budget */
  setGroupBudget(group: string, budgetMs: number): void {
    this.groupBudgets[group] = Math.max(10, budgetMs);
  }

  /** Check if a handler's group has exceeded its budget for this tick */
  private isGroupBudgetExceeded(handler: OrchestratedHandler): boolean {
    const groupTime = this.currentTickGroupTime.get(handler.group) ?? 0;
    const groupBudget = this.groupBudgets[handler.group] ?? this.groupBudgets["default"] ?? 50;
    return groupTime >= groupBudget;
  }

  /** Record handler execution time for its group */
  private recordGroupTime(handler: OrchestratedHandler, durationMs: number): void {
    const current = this.currentTickGroupTime.get(handler.group) ?? 0;
    this.currentTickGroupTime.set(handler.group, current + durationMs);
  }

  /** Compute backpressure severity */
  private computeBackpressure(deferred: number, total: number): BackpressureSeverity {
    if (deferred === 0) {
      this.consecutiveDeferredTicks = 0;
      return "none";
    }
    this.consecutiveDeferredTicks++;
    const ratio = deferred / Math.max(1, total);
    if (ratio > 0.5 || this.consecutiveDeferredTicks > 10) {
      return "critical";
    }
    if (ratio > 0.25 || this.consecutiveDeferredTicks > 5) {
      return "heavy";
    }
    return "mild";
  }

  /**
   * Compute a system health score (0-100).
   *
   * Weighted composite:
   *   - Budget utilization (30%): lower is better
   *   - Circuit health (25%): fewer open circuits = healthier
   *   - Error rate (20%): lower is better
   *   - Cadence drift (15%): handlers running at min cadence = healthy
   *   - CPU pressure (10%): lower is better
   */
  getHealthScore(): number {
    if (this.handlers.length === 0) {
      return 100;
    }

    // Budget utilization score (0-100, 100 = under budget)
    const recentReports = this.tickReports.slice(-20);
    const avgBudgetPct =
      recentReports.length > 0
        ? recentReports.reduce((sum, r) => sum + r.budgetUsedPct, 0) / recentReports.length
        : 0;
    const budgetScore = Math.max(0, 100 - avgBudgetPct);

    // Circuit health score (0-100, 100 = all closed)
    const openCircuits = [...this.runtimeStates.values()].filter(
      (r) => r.circuit !== "closed",
    ).length;
    const circuitScore =
      this.runtimeStates.size > 0 ? 100 * (1 - openCircuits / this.runtimeStates.size) : 100;

    // Error rate score (0-100, 100 = no errors)
    const avgErrorRate =
      [...this.runtimeStates.values()].reduce((sum, r) => sum + r.emaErrorRate, 0) /
      Math.max(1, this.runtimeStates.size);
    const errorScore = Math.max(0, 100 * (1 - avgErrorRate * 5)); // 20% error rate = score 0

    // Cadence drift score (0-100, 100 = all at min cadence)
    let cadenceDriftSum = 0;
    for (const h of this.handlers) {
      const runtime = this.runtimeStates.get(h.name);
      if (runtime && h.cadence.max > h.cadence.min) {
        const normalized =
          (runtime.adaptiveCadence - h.cadence.min) / (h.cadence.max - h.cadence.min);
        cadenceDriftSum += normalized;
      }
    }
    const cadenceScore =
      this.handlers.length > 0
        ? Math.max(0, 100 * (1 - cadenceDriftSum / this.handlers.length))
        : 100;

    // CPU score (0-100, 100 = idle)
    const cpuScore = Math.max(0, 100 - this.cpuPercent);

    // Weighted composite
    const score =
      budgetScore * 0.3 +
      circuitScore * 0.25 +
      errorScore * 0.2 +
      cadenceScore * 0.15 +
      cpuScore * 0.1;

    return parseFloat(Math.min(100, Math.max(0, score)).toFixed(1));
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SINGLETON + HELPER
// ═══════════════════════════════════════════════════════════════════

/** Global orchestrator instance */
let orchestratorInstance: TickOrchestrator | null = null;

/** Get or create the global orchestrator */
export function getOrchestrator(opts?: { tickBudgetMs?: number }): TickOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new TickOrchestrator(opts);
  }
  return orchestratorInstance;
}

/** Shutdown the global orchestrator */
export function shutdownOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.shutdown();
    orchestratorInstance = null;
  }
}

/**
 * Helper: register a handler from the existing simulationBus format.
 *
 * Bridges the old `{ name, priority, handler, signature }` format
 * into the new `OrchestratedHandler` format with sensible defaults.
 */
export function registerLegacyHandler(
  orchestrator: TickOrchestrator,
  name: string,
  handler: (state: RepublicState) => void,
  opts?: {
    after?: string[];
    cadence?: Partial<CadenceConfig>;
    budgetMs?: number;
    concurrent?: boolean;
    group?: string;
  },
): void {
  orchestrator.register({
    name,
    handler: (state: RepublicState, _tick: number) => handler(state),
    after: opts?.after ?? [],
    cadence: {
      min: opts?.cadence?.min ?? 1,
      max: opts?.cadence?.max ?? 20,
      current: opts?.cadence?.current ?? 1,
    },
    budgetMs: opts?.budgetMs ?? 50,
    concurrent: opts?.concurrent ?? false,
    group: opts?.group ?? "default",
    enabled: true,
  });
}
