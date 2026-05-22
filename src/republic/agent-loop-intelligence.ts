/**
 * Adaptive Loop Intelligence — Closed-Loop Feedback System
 *
 * Unlike the basic telemetry (passive recording) and strategy planner
 * (one-shot classification), this module provides REAL-TIME decision-making
 * during agent execution:
 *
 * 1. Dynamic iteration budgeting from strategy planner output
 * 2. Tool set filtering (exclude irrelevant tools, boosting context efficiency)
 * 3. Stall detection (consecutive no-progress iterations)
 * 4. Phase-aware progress injection (tells the LLM what phase it's in)
 * 5. Telemetry-informed timeout adjustment based on historical tool latency
 * 6. Early termination when the agent achieves the goal with budget remaining
 *
 * This is the "brain" that makes the agent loop smarter — it sits between
 * the orchestrator and the components, observing and directing.
 */

import type { TaskPlan, TaskStep } from "./agent-strategy-planner.js";

// ─── Types ──────────────────────────────────────────────────────

export interface LoopIntelligence {
  /** Effective max iterations (clamped by strategy + confidence) */
  effectiveMaxIterations: number;
  /** Tool names to exclude from the tool set */
  filteredToolNames: Set<string>;
  /** Whether the loop should continue (stall detection) */
  shouldContinue: boolean;
  /** Reason if the loop is stopping early */
  stopReason: string | null;
  /** System prompt addendum for the current phase */
  phaseDirective: string;
  /** Current phase name for broadcasting */
  currentPhase: string;
  /** Phase index (0-based) */
  phaseIndex: number;
  /** Estimated iterations remaining */
  iterationsRemaining: number;
  /** Progress percentage (0-100) */
  progressPct: number;
  /** Whether the agent is stalling (repeating without progress) */
  isStalling: boolean;
  /** Consecutive no-progress iteration count */
  stallCount: number;
  /** Corrective injection text (nudge when stalling) */
  correctiveInjection: string | null;
  /** Token budget consumption ratio (0.0-1.0), -1 if not tracked */
  tokenBudgetRatio: number;
  /** Token budget warning message when approaching limit */
  tokenBudgetWarning: string | null;
  /** Suggestion to switch providers when cost is accumulating too fast */
  providerSwitchHint: string | null;
  /** Progress velocity (0-1 scale, rolling average of meaningful-iteration ratio) */
  velocity: number;
}

export interface IterationSignals {
  /** Number of tool calls this iteration */
  toolCallCount: number;
  /** Number of text blocks with content */
  textBlockCount: number;
  /** Total bytes of tool output */
  toolOutputBytes: number;
  /** Whether any tool errored */
  hadToolErrors: boolean;
  /** List of tool names called */
  toolsUsed: string[];
  /** Whether the LLM signaled completion */
  llmDone: boolean;
  /** Cumulative tokens used so far (for budget tracking) */
  totalTokensSoFar?: number;
  /** Current provider (for cost-aware hints) */
  currentProvider?: string;
}

// ─── Stall Detection Config ────────────────────────────────────

/** An iteration is considered "no progress" if: */
const PROGRESS_THRESHOLDS = {
  /** Minimum tool calls to count as progress */
  minToolCalls: 0,
  /** Minimum bytes of meaningful content to count as progress */
  minContentBytes: 50,
  /** Number of consecutive no-progress iterations before stall alarm */
  stallThreshold: 3,
  /** After this many stalls, force-stop */
  hardStallLimit: 5,
};

// ─── Loop Intelligence Factory ──────────────────────────────────

export function createLoopIntelligence(plan: TaskPlan, baseMaxIterations: number) {
  // Clamp max iterations based on strategy confidence
  // Low confidence → use plan conservatively; high → trust override fully
  const strategyMax = plan.maxIterationsOverride;
  const effectiveMax =
    plan.confidence >= 0.5 ? Math.min(strategyMax, baseMaxIterations) : baseMaxIterations;

  // Build excluded tool set (strategy-level exclusions)
  const filteredToolNames = new Set(plan.excludedTools);

  // Dynamically exclude tools with high error rates from recent telemetry
  try {
    const { getMostErrorProneTools } = require("./agent-telemetry.js") as {
      getMostErrorProneTools: (
        n: number,
      ) => Array<{ name: string; errorRate: number; errors: number }>;
    };
    const errorProne = getMostErrorProneTools(20);
    for (const tool of errorProne) {
      // Only auto-exclude tools with >50% error rate AND at least 3 errors
      if (tool.errorRate > 50 && tool.errors >= 3) {
        filteredToolNames.add(tool.name);
      }
    }
  } catch {
    // Telemetry not available yet — skip dynamic exclusion
  }

  // Phase tracking state
  let currentPhaseIdx = 0;
  let iterationsInCurrentPhase = 0;
  let totalIterations = 0;
  let consecutiveNoProgress = 0;

  // Velocity tracking: rolling window of progress/no-progress outcomes
  const velocityWindow: boolean[] = [];
  const VELOCITY_WINDOW_SIZE = 8;

  function computeVelocity(): number {
    if (velocityWindow.length === 0) {
      return 1;
    }
    const progressCount = velocityWindow.filter(Boolean).length;
    return progressCount / velocityWindow.length;
  }

  function trackVelocity(madeProgress: boolean): void {
    velocityWindow.push(madeProgress);
    if (velocityWindow.length > VELOCITY_WINDOW_SIZE) {
      velocityWindow.shift();
    }
  }

  // Track recent content for repetition detection
  const recentOutputHashes = new Set<number>();

  function simpleHash(s: string): number {
    let h = 0;
    for (let i = 0; i < Math.min(s.length, 200); i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return h;
  }

  /** Determine which phase the agent should be in based on iteration budget */
  function resolvePhase(): TaskStep {
    let iterBudgetConsumed = 0;

    for (let i = 0; i < plan.decomposition.length; i++) {
      iterBudgetConsumed += plan.decomposition[i].iterationBudget;
      if (totalIterations < iterBudgetConsumed) {
        currentPhaseIdx = i;
        iterationsInCurrentPhase =
          totalIterations - (iterBudgetConsumed - plan.decomposition[i].iterationBudget);
        return plan.decomposition[i];
      }
    }

    // Past all phases — use the last one
    currentPhaseIdx = plan.decomposition.length - 1;
    return plan.decomposition[currentPhaseIdx];
  }

  /** Evaluate whether a single iteration made meaningful progress */
  function evaluateProgress(signals: IterationSignals, responseText: string): boolean {
    // Tool calls = progress
    if (signals.toolCallCount > PROGRESS_THRESHOLDS.minToolCalls) {
      return true;
    }

    // Meaningful text output = progress (unless it's a repeat)
    if (responseText.length > PROGRESS_THRESHOLDS.minContentBytes) {
      const hash = simpleHash(responseText);
      if (!recentOutputHashes.has(hash)) {
        recentOutputHashes.add(hash);
        // Keep the set small
        if (recentOutputHashes.size > 20) {
          const first = recentOutputHashes.values().next().value;
          if (first !== undefined) {
            recentOutputHashes.delete(first);
          }
        }
        return true;
      }
      // Repeated content = no progress
      return false;
    }

    return false;
  }

  /** Core intelligence: assess the loop and produce directives */
  function assess(
    iteration: number,
    signals: IterationSignals,
    responseText: string,
  ): LoopIntelligence {
    totalIterations = iteration;

    const phase = resolvePhase();
    const madeProgress = evaluateProgress(signals, responseText);

    if (madeProgress) {
      consecutiveNoProgress = 0;
    } else {
      consecutiveNoProgress++;
    }

    trackVelocity(madeProgress);
    const velocity = computeVelocity();

    const isStalling = consecutiveNoProgress >= PROGRESS_THRESHOLDS.stallThreshold;
    const hardStop = consecutiveNoProgress >= PROGRESS_THRESHOLDS.hardStallLimit;
    const iterationsRemaining = Math.max(0, effectiveMax - iteration);
    const progressPct = Math.min(100, Math.round((iteration / effectiveMax) * 100));

    // ── Token budget awareness ────────────────────────────────
    const tokenBudgetMax = 500_000; // mirrors MAX_TOTAL_TOKENS from config
    const totalTokens = signals.totalTokensSoFar ?? -1;
    const tokenBudgetRatio = totalTokens >= 0 ? totalTokens / tokenBudgetMax : -1;
    let tokenBudgetWarning: string | null = null;
    if (tokenBudgetRatio >= 0.85) {
      tokenBudgetWarning =
        `⚠️ TOKEN BUDGET CRITICAL: ${Math.round(tokenBudgetRatio * 100)}% consumed. ` +
        `You MUST produce a final answer NOW. Do not start new tool calls.`;
    } else if (tokenBudgetRatio >= 0.65) {
      tokenBudgetWarning =
        `📊 Token budget: ${Math.round(tokenBudgetRatio * 100)}% consumed. ` +
        `Focus on finishing efficiently — avoid unnecessary exploration.`;
    }

    // ── Cost-aware provider switch hint ───────────────────────
    let providerSwitchHint: string | null = null;
    const provider = signals.currentProvider;
    if (provider && totalTokens > 0 && iterationsRemaining > 5) {
      const costPerM: Record<string, number> = {
        anthropic: 6.0,
        openai: 5.0,
        openrouter: 2.0,
        gemini: 0.3,
        deepseek: 0.55,
        groq: 0.05,
        ollama: 0,
        lmstudio: 0,
      };
      const currentCostPer = costPerM[provider] ?? 1;
      if (currentCostPer >= 5.0 && tokenBudgetRatio > 0.5) {
        // Expensive provider + over 50% budget → suggest switching
        const cheaper = Object.entries(costPerM)
          .filter(([p, c]) => c < currentCostPer && p !== provider && c > 0)
          .toSorted((a, b) => a[1] - b[1]);
        if (cheaper.length > 0) {
          providerSwitchHint =
            `💡 High cost accumulation on ${provider} ($${currentCostPer}/M tokens). ` +
            `Consider switching to ${cheaper[0][0]} ($${cheaper[0][1]}/M) for remaining iterations.`;
        }
      }
    }

    // Build phase directive
    let phaseDirective = "";
    if (plan.decomposition.length > 1) {
      phaseDirective =
        `[Phase ${currentPhaseIdx + 1}/${plan.decomposition.length}: ${phase.phase}] ` +
        `${phase.description}. ` +
        `Budget: ${phase.iterationBudget - iterationsInCurrentPhase} iterations remaining for this phase. ` +
        `Overall: ${iterationsRemaining} iterations remaining.`;
    }

    // Append velocity warning if progressing too slowly
    if (velocity < 0.4 && velocity > 0 && !isStalling && iteration > 3) {
      phaseDirective +=
        ` ⚡ Low velocity (${Math.round(velocity * 100)}% useful iterations). ` +
        `Prioritize high-impact actions — avoid exploratory calls.`;
    }

    // ── Escalating corrective injection for stalling ─────────
    let correctiveInjection: string | null = null;
    if (isStalling && !hardStop) {
      if (consecutiveNoProgress === PROGRESS_THRESHOLDS.stallThreshold) {
        // Level 1: Gentle nudge
        correctiveInjection =
          `⚠️ You've had ${consecutiveNoProgress} iterations without progress. ` +
          `Try a different approach — call a tool, write code, or provide your answer. ` +
          `Budget remaining: ${iterationsRemaining} iterations.`;
      } else if (consecutiveNoProgress === PROGRESS_THRESHOLDS.stallThreshold + 1) {
        // Level 2: Aggressive redirect
        correctiveInjection =
          `🚨 STALL WARNING (${consecutiveNoProgress} iterations stuck): ` +
          `You are WASTING your iteration budget. IMMEDIATELY do one of:\n` +
          `1. Execute a specific tool with concrete parameters\n` +
          `2. Write your final answer based on what you already know\n` +
          `3. If blocked, explain the specific blocker in 1 sentence\n\n` +
          `DO NOT repeat any previous content. ${iterationsRemaining} iterations left.`;
      } else {
        // Level 3: Final answer command
        correctiveInjection =
          `🛑 FINAL WARNING (${consecutiveNoProgress} consecutive stalls): ` +
          `You MUST provide your complete final answer RIGHT NOW. ` +
          `No more tool calls. No more exploration. ` +
          `Synthesize everything you have and respond to the user. ` +
          `This is iteration ${iteration}/${effectiveMax}.`;
      }
    }

    let shouldContinue = true;
    let stopReason: string | null = null;

    if (hardStop) {
      shouldContinue = false;
      stopReason = `Stall limit exceeded (${consecutiveNoProgress} consecutive no-progress iterations)`;
    } else if (iteration >= effectiveMax) {
      shouldContinue = false;
      stopReason = `Strategy budget exhausted (${effectiveMax} iterations for ${plan.strategy})`;
    }

    return {
      effectiveMaxIterations: effectiveMax,
      filteredToolNames,
      shouldContinue,
      stopReason,
      phaseDirective,
      currentPhase: phase.phase,
      phaseIndex: currentPhaseIdx,
      iterationsRemaining,
      progressPct,
      isStalling,
      stallCount: consecutiveNoProgress,
      correctiveInjection,
      tokenBudgetRatio,
      tokenBudgetWarning,
      providerSwitchHint,
      velocity,
    };
  }

  /** Filter a tool array based on strategy-excluded tools */
  function filterTools<T extends { name: string }>(tools: T[]): T[] {
    if (filteredToolNames.size === 0) {
      return tools;
    }
    return tools.filter((t) => !filteredToolNames.has(t.name));
  }

  /** Get tool timeout override based on historical telemetry p95 latency */
  function getToolTimeoutMs(toolName: string, defaultMs: number): number {
    // Lazy import to avoid circular deps — sync check only
    try {
      const { getSlowestTools } = require("./agent-telemetry.js") as {
        getSlowestTools: (n: number) => Array<{ name: string; avgMs: number; p95Ms?: number }>;
      };
      const slowest = getSlowestTools(50);
      const found = slowest.find((t) => t.name === toolName);
      if (found && found.p95Ms && found.p95Ms > 0) {
        // Use p95 × 1.5 as the timeout, clamped to [defaultMs..10min]
        return Math.min(600_000, Math.max(defaultMs, Math.round(found.p95Ms * 1.5)));
      }
    } catch {
      // No telemetry available yet — use default
    }
    return defaultMs;
  }

  /**
   * Read-only phase resolver — determines current phase, progress, and directive
   * WITHOUT mutating the stall detection state. Use this for pre-dispatch announcements.
   */
  function resolvePhaseInfo(iteration: number): {
    phase: string;
    index: number;
    progressPct: number;
    directive: string;
  } {
    let phaseIdx = 0;
    let iterBudgetConsumed = 0;
    let phaseIterations = 0;

    for (let i = 0; i < plan.decomposition.length; i++) {
      iterBudgetConsumed += plan.decomposition[i].iterationBudget;
      if (iteration < iterBudgetConsumed) {
        phaseIdx = i;
        phaseIterations = iteration - (iterBudgetConsumed - plan.decomposition[i].iterationBudget);
        break;
      }
      phaseIdx = i;
    }

    const phase = plan.decomposition[phaseIdx] ?? {
      phase: "Execute",
      description: "Processing",
      tools: [],
      iterationBudget: effectiveMax,
    };

    const progressPct = Math.min(100, Math.round((iteration / effectiveMax) * 100));
    const remaining = Math.max(0, effectiveMax - iteration);

    let directive = "";
    if (plan.decomposition.length > 1) {
      directive =
        `[Phase ${phaseIdx + 1}/${plan.decomposition.length}: ${phase.phase}] ` +
        `${phase.description}. ` +
        `Budget: ${phase.iterationBudget - phaseIterations} iterations remaining for this phase. ` +
        `Overall: ${remaining} iterations remaining.`;
    }

    return { phase: phase.phase, index: phaseIdx, progressPct, directive };
  }

  return {
    effectiveMaxIterations: effectiveMax,
    filteredToolNames,
    assess,
    filterTools,
    getToolTimeoutMs,
    resolvePhaseInfo,
    /** Get initial intelligence state (before first iteration) */
    initial(): LoopIntelligence {
      const phase = plan.decomposition[0] ?? {
        phase: "Execute",
        description: "Processing",
        tools: [],
        iterationBudget: effectiveMax,
      };
      return {
        effectiveMaxIterations: effectiveMax,
        filteredToolNames,
        shouldContinue: true,
        stopReason: null,
        phaseDirective: "",
        currentPhase: phase.phase,
        phaseIndex: 0,
        iterationsRemaining: effectiveMax,
        progressPct: 0,
        isStalling: false,
        stallCount: 0,
        correctiveInjection: null,
        tokenBudgetRatio: -1,
        tokenBudgetWarning: null,
        providerSwitchHint: null,
        velocity: 1,
      };
    },
  };
}

export type LoopIntelligenceEngine = ReturnType<typeof createLoopIntelligence>;
