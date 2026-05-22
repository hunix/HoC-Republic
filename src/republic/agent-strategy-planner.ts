/**
 * Adaptive Strategy Planner — Pre-Execution Task Analysis
 *
 * Before the agent loop starts, this module analyzes the user's prompt
 * and selects the optimal execution strategy:
 *
 * Strategies:
 *   - DIRECT       — Simple Q&A, no tools needed (1-2 iterations)
 *   - RESEARCH     — Web search + RAG + synthesis (3-5 iterations)
 *   - BUILD        — Code generation with sandbox (5-15 iterations)
 *   - CREATIVE     — Image/video/audio generation (3-8 iterations)
 *   - ANALYSIS     — Data analysis with code interpreter (3-10 iterations)
 *   - FULL_STACK   — Complex multi-phase project (10-30 iterations)
 *   - DEEP_THINK   — Reasoning-heavy, minimal tools (2-5 iterations)
 *
 * The planner adjusts iteration limits, tool sets, and system prompt
 * modifiers to optimize for each strategy class.
 */

// ─── Types ──────────────────────────────────────────────────────

export type StrategyType =
  | "DIRECT"
  | "RESEARCH"
  | "BUILD"
  | "CREATIVE"
  | "ANALYSIS"
  | "FULL_STACK"
  | "DEEP_THINK";

export interface TaskPlan {
  strategy: StrategyType;
  confidence: number;
  estimatedIterations: number;
  maxIterationsOverride: number;
  suggestedTools: string[];
  excludedTools: string[];
  promptModifier: string;
  decomposition: TaskStep[];
  reasoning: string;
}

export interface TaskStep {
  phase: string;
  description: string;
  tools: string[];
  iterationBudget: number;
}

// ─── Signal Patterns ────────────────────────────────────────────

interface SignalPattern {
  patterns: RegExp[];
  weight: number;
}

const STRATEGY_SIGNALS: Record<StrategyType, SignalPattern[]> = {
  DIRECT: [
    { patterns: [/^(what|who|when|where|why|how)\s/i], weight: 0.3 },
    { patterns: [/^(explain|describe|define|tell me)\s/i], weight: 0.4 },
    { patterns: [/^(yes|no|ok|sure|thanks|thank)/i], weight: 0.8 },
  ],
  RESEARCH: [
    { patterns: [/\b(research|investigate|find out|look up|search for)\b/i], weight: 0.7 },
    { patterns: [/\b(latest|recent|current|today|2026|2025)\b/i], weight: 0.5 },
    { patterns: [/\b(compare|versus|vs\.?|difference between)\b/i], weight: 0.4 },
    { patterns: [/\b(news|article|paper|study|report)\b/i], weight: 0.6 },
  ],
  BUILD: [
    { patterns: [/\b(build|create|make|develop|implement|code)\b/i], weight: 0.5 },
    { patterns: [/\b(app|website|page|api|server|bot|script)\b/i], weight: 0.6 },
    { patterns: [/\b(react|vue|next|node|python|typescript)\b/i], weight: 0.7 },
    { patterns: [/\b(component|function|class|module|package)\b/i], weight: 0.5 },
    { patterns: [/\b(deploy|host|docker|container)\b/i], weight: 0.6 },
  ],
  CREATIVE: [
    { patterns: [/\b(generate|create)\s+(image|picture|photo|art|logo)\b/i], weight: 0.9 },
    { patterns: [/\b(video|animation|music|song|audio|voice)\b/i], weight: 0.7 },
    { patterns: [/\b(design|illustration|poster|banner|thumbnail)\b/i], weight: 0.6 },
    { patterns: [/\b(presentation|pptx|slides|deck)\b/i], weight: 0.7 },
  ],
  ANALYSIS: [
    { patterns: [/\b(analyze|analyse|chart|graph|plot|visualize)\b/i], weight: 0.7 },
    { patterns: [/\b(data|csv|excel|dataset|statistics|regression)\b/i], weight: 0.6 },
    { patterns: [/\b(calculate|compute|forecast|predict|model)\b/i], weight: 0.5 },
    { patterns: [/\b(pandas|numpy|matplotlib|scipy|sklearn)\b/i], weight: 0.8 },
  ],
  FULL_STACK: [
    { patterns: [/\b(full.?stack|end.?to.?end|complete|entire|whole)\b/i], weight: 0.5 },
    { patterns: [/\b(database|auth|payment|email|notification)\b/i], weight: 0.4 },
    { patterns: [/\b(frontend|backend|api|microservice)\b.*\b(and|with|plus)\b/i], weight: 0.7 },
    { patterns: [/\b(deploy|production|staging|ci.?cd)\b/i], weight: 0.4 },
  ],
  DEEP_THINK: [
    {
      patterns: [
        /\b(think|reason|analyze|consider|evaluate)\b.*\b(deeply|carefully|thoroughly)\b/i,
      ],
      weight: 0.7,
    },
    { patterns: [/\b(strategy|architecture|design|plan|approach)\b/i], weight: 0.5 },
    { patterns: [/\b(pros? and cons?|trade.?offs?|implications)\b/i], weight: 0.6 },
    { patterns: [/\b(review|audit|assess|critique)\b/i], weight: 0.4 },
  ],
};

// ─── Strategy Configs ───────────────────────────────────────────

interface StrategyConfig {
  estimatedIterations: number;
  maxIterations: number;
  coreTools: string[];
  excludeTools: string[];
  promptModifier: string;
}

const STRATEGY_CONFIGS: Record<StrategyType, StrategyConfig> = {
  DIRECT: {
    estimatedIterations: 1,
    maxIterations: 3,
    coreTools: ["knowledge_query", "knowledge_store"],
    excludeTools: [],
    promptModifier: "Answer concisely and directly. No need for tools unless necessary.",
  },
  RESEARCH: {
    estimatedIterations: 4,
    maxIterations: 10,
    coreTools: [
      "web_search",
      "browse_web",
      "sovereign_search",
      "knowledge_query",
      "knowledge_store",
    ],
    excludeTools: ["generate_image", "generate_video", "gpu_compute"],
    promptModifier:
      "Research thoroughly. Search multiple sources, cross-reference findings, and cite sources. Store key findings in the knowledge base.",
  },
  BUILD: {
    estimatedIterations: 10,
    maxIterations: 50,
    coreTools: [
      "write_file",
      "read_file",
      "execute_command",
      "install_packages",
      "web_search",
      "browse_web",
    ],
    excludeTools: ["generate_video", "text_to_speech"],
    promptModifier:
      "Build step-by-step: plan → scaffold → implement → test → verify. Write comprehensive code, handle edge cases, and run tests.",
  },
  CREATIVE: {
    estimatedIterations: 5,
    maxIterations: 15,
    coreTools: [
      "generate_image",
      "generate_video",
      "synthesize_speech",
      "create_document",
      "write_file",
    ],
    excludeTools: [],
    promptModifier:
      "Focus on creative quality. Generate high-fidelity assets, iterate on design, and ensure professional output.",
  },
  ANALYSIS: {
    estimatedIterations: 6,
    maxIterations: 20,
    coreTools: [
      "run_code",
      "write_file",
      "read_file",
      "execute_command",
      "web_search",
      "knowledge_store",
    ],
    excludeTools: ["generate_video"],
    promptModifier:
      "Analyze data rigorously. Write Python code for analysis, generate charts and visualizations, and provide clear interpretations.",
  },
  FULL_STACK: {
    estimatedIterations: 20,
    maxIterations: 100,
    coreTools: [], // All tools enabled
    excludeTools: [],
    promptModifier:
      "This is a complex multi-phase project. Plan carefully before coding. Build in phases: backend → frontend → integration → testing → deployment. Verify each phase.",
  },
  DEEP_THINK: {
    estimatedIterations: 3,
    maxIterations: 8,
    coreTools: ["web_search", "knowledge_query", "knowledge_store", "agent_memory"],
    excludeTools: ["execute_command", "generate_image", "generate_video"],
    promptModifier:
      "Think deeply and systematically. Consider multiple perspectives, analyze trade-offs, and provide well-reasoned conclusions.",
  },
};

// ─── Historical Learning ────────────────────────────────────────

interface StrategyOutcome {
  strategy: StrategyType;
  actualIterations: number;
  success: boolean;
  durationMs: number;
  toolsUsed?: string[];
  toolErrors?: string[];
}

const strategyOutcomes: StrategyOutcome[] = [];
const MAX_OUTCOMES = 200;

/** Record how a strategy actually performed (called from loop completion) */
export function recordStrategyOutcome(
  strategy: StrategyType,
  actualIterations: number,
  success: boolean,
  durationMs: number,
  toolsUsed?: string[],
  toolErrors?: string[],
): void {
  strategyOutcomes.push({ strategy, actualIterations, success, durationMs, toolsUsed, toolErrors });
  if (strategyOutcomes.length > MAX_OUTCOMES) {
    strategyOutcomes.splice(0, strategyOutcomes.length - MAX_OUTCOMES);
  }
}

/** Get historical stats for a strategy to refine estimates */
function getHistoricalStats(strategy: StrategyType): {
  avgIterations: number;
  successRate: number;
  sampleCount: number;
  commonFailingTools: string[];
} | null {
  const matching = strategyOutcomes.filter((o) => o.strategy === strategy);
  if (matching.length < 3) {
    return null;
  } // Need at least 3 samples

  const avgIter = Math.round(
    matching.reduce((s, o) => s + o.actualIterations, 0) / matching.length,
  );
  const successRate = matching.filter((o) => o.success).length / matching.length;

  // Identify tools that frequently cause failures
  const toolErrorCounts = new Map<string, number>();
  for (const o of matching) {
    if (!o.success && o.toolErrors) {
      for (const t of o.toolErrors) {
        toolErrorCounts.set(t, (toolErrorCounts.get(t) ?? 0) + 1);
      }
    }
  }
  const commonFailingTools = [...toolErrorCounts.entries()]
    .filter(([, count]) => count >= 2) // Failed in at least 2 sessions
    .toSorted((a, b) => b[1] - a[1])
    .map(([name]) => name);

  return { avgIterations: avgIter, successRate, sampleCount: matching.length, commonFailingTools };
}

/** Get aggregated outcome stats for dashboard analytics */
export function getOutcomeStats(): {
  totalOutcomes: number;
  byStrategy: Record<
    string,
    {
      count: number;
      avgIterations: number;
      successRate: number;
      avgDurationMs: number;
    }
  >;
} {
  const byStrategy: Record<
    string,
    {
      count: number;
      totalIter: number;
      totalSuccess: number;
      totalDurationMs: number;
    }
  > = {};

  for (const o of strategyOutcomes) {
    const s = (byStrategy[o.strategy] ??= {
      count: 0,
      totalIter: 0,
      totalSuccess: 0,
      totalDurationMs: 0,
    });
    s.count++;
    s.totalIter += o.actualIterations;
    s.totalSuccess += o.success ? 1 : 0;
    s.totalDurationMs += o.durationMs;
  }

  const result: Record<
    string,
    { count: number; avgIterations: number; successRate: number; avgDurationMs: number }
  > = {};
  for (const [key, val] of Object.entries(byStrategy)) {
    result[key] = {
      count: val.count,
      avgIterations: Math.round((val.totalIter / val.count) * 10) / 10,
      successRate: Math.round((val.totalSuccess / val.count) * 100) / 100,
      avgDurationMs: Math.round(val.totalDurationMs / val.count),
    };
  }
  return { totalOutcomes: strategyOutcomes.length, byStrategy: result };
}

// ─── Planner ────────────────────────────────────────────────────

/** Analyze a user prompt and create an optimal execution plan */
export function planExecution(prompt: string): TaskPlan {
  const scores: Record<StrategyType, number> = {
    DIRECT: 0,
    RESEARCH: 0,
    BUILD: 0,
    CREATIVE: 0,
    ANALYSIS: 0,
    FULL_STACK: 0,
    DEEP_THINK: 0,
  };

  // Score each strategy
  for (const [strategy, signals] of Object.entries(STRATEGY_SIGNALS) as Array<
    [StrategyType, SignalPattern[]]
  >) {
    for (const signal of signals) {
      for (const pattern of signal.patterns) {
        if (pattern.test(prompt)) {
          scores[strategy] += signal.weight;
        }
      }
    }
  }

  // Length heuristic: longer prompts → more complex tasks
  if (prompt.length > 500) {
    scores.FULL_STACK += 0.3;
    scores.BUILD += 0.2;
  } else if (prompt.length < 50) {
    scores.DIRECT += 0.5;
  }

  // Multi-step indicator: numbered lists or "then" chains
  if (/\b(then|next|after that|finally|step \d)\b/i.test(prompt)) {
    scores.FULL_STACK += 0.3;
    scores.BUILD += 0.2;
  }

  // Select the highest scoring strategy
  const ranked = (Object.entries(scores) as Array<[StrategyType, number]>).toSorted(
    (a, b) => b[1] - a[1],
  );
  let bestStrategy = ranked[0][0];
  let bestScore = ranked[0][1];

  // Default to DIRECT if no strong signal
  if (bestScore < 0.3) {
    bestStrategy = "DIRECT";
    bestScore = 0.5;
  }

  const config = STRATEGY_CONFIGS[bestStrategy];
  let confidence = Math.min(1, bestScore);

  // ── Confidence Decay for Ambiguous Intent ────────────────────
  // When the #2 strategy scores within 0.15 of #1, we have signal ambiguity.
  // Reduce confidence proportional to the overlap to avoid overcommitting.
  if (ranked.length >= 2) {
    const runnerUpScore = ranked[1][1];
    const gap = bestScore - runnerUpScore;
    if (gap < 0.15 && bestScore > 0.3) {
      // Linear decay: gap=0 → -0.20 confidence, gap=0.15 → -0.0
      const decay = 0.2 * (1 - gap / 0.15);
      confidence = Math.max(0.2, confidence - decay);
    }
  }

  // ── Historical Learning ─────────────────────────────────────
  // Adjust estimates based on how this strategy performed in the past
  const history = getHistoricalStats(bestStrategy);
  let estimatedIterations = config.estimatedIterations;
  let maxIterations = config.maxIterations;

  if (history) {
    // Blend static estimate with historical average (70% history, 30% static)
    estimatedIterations = Math.round(
      history.avgIterations * 0.7 + config.estimatedIterations * 0.3,
    );

    // If historical success rate is low, increase budget by 30%
    if (history.successRate < 0.7) {
      maxIterations = Math.round(maxIterations * 1.3);
    }

    // Auto-exclude tools that consistently cause failures for this strategy
    if (history.commonFailingTools.length > 0) {
      config.excludeTools = [...new Set([...config.excludeTools, ...history.commonFailingTools])];
    }

    // Boost confidence if we have good historical data
    if (history.sampleCount >= 10) {
      confidence = Math.min(1, confidence + 0.1);
    }
  }

  // Build task decomposition
  const decomposition = decomposeTask(bestStrategy, prompt);

  // ── Rebalance Phase Budgets ──────────────────────────────────
  // When historical learning adjusts maxIterations, scale phase budgets proportionally
  const staticBudgetTotal = decomposition.reduce((s, p) => s + p.iterationBudget, 0);
  if (staticBudgetTotal > 0 && maxIterations !== config.maxIterations) {
    const scale = maxIterations / config.maxIterations;
    let assigned = 0;
    for (let i = 0; i < decomposition.length; i++) {
      if (i === decomposition.length - 1) {
        // Assign remaining budget to avoid rounding errors
        decomposition[i].iterationBudget = Math.max(1, maxIterations - assigned);
      } else {
        decomposition[i].iterationBudget = Math.max(
          1,
          Math.round(decomposition[i].iterationBudget * scale),
        );
        assigned += decomposition[i].iterationBudget;
      }
    }
  }

  // ── Dynamic Prompt Augmentation from Historical Learning ──────
  // When we have enough historical data, enrich the strategy directive
  // with learned pacing guidance and failure awareness.
  let promptModifier = config.promptModifier;
  if (history && history.sampleCount >= 3) {
    const pacing =
      `\n\nHistorical insight: Past ${bestStrategy} sessions average ${history.avgIterations} iterations ` +
      `with a ${Math.round(history.successRate * 100)}% success rate. ` +
      (history.successRate >= 0.8
        ? `Pace accordingly — you typically succeed within budget.`
        : history.successRate >= 0.5
          ? `Success rate is moderate — focus on essential steps and avoid tangents.`
          : `Low historical success rate — be methodical, verify each step, and prioritize completing over perfecting.`);
    promptModifier += pacing;

    if (history.commonFailingTools.length > 0) {
      promptModifier +=
        `\nNote: The following tools have historically caused failures for this task type: ` +
        `${history.commonFailingTools.join(", ")}. Prefer alternatives when possible.`;
    }
  }

  return {
    strategy: bestStrategy,
    confidence,
    estimatedIterations,
    maxIterationsOverride: maxIterations,
    suggestedTools: config.coreTools,
    excludedTools: config.excludeTools,
    promptModifier,
    decomposition,
    reasoning: buildReasoning(scores, bestStrategy),
  };
}

// ─── Task Decomposition ─────────────────────────────────────────

function decomposeTask(strategy: StrategyType, _prompt: string): TaskStep[] {
  switch (strategy) {
    case "DIRECT":
      return [{ phase: "Answer", description: "Direct response", tools: [], iterationBudget: 1 }];

    case "RESEARCH":
      return [
        {
          phase: "Search",
          description: "Query web sources",
          tools: ["web_search", "sovereign_search"],
          iterationBudget: 2,
        },
        {
          phase: "Analyze",
          description: "Process and cross-reference findings",
          tools: ["browse_web"],
          iterationBudget: 2,
        },
        {
          phase: "Synthesize",
          description: "Compile final answer with citations",
          tools: ["knowledge_store"],
          iterationBudget: 1,
        },
      ];

    case "BUILD":
      return [
        {
          phase: "Plan",
          description: "Architecture and design",
          tools: ["web_search"],
          iterationBudget: 2,
        },
        {
          phase: "Scaffold",
          description: "Project structure and dependencies",
          tools: ["write_file", "execute_command", "install_packages"],
          iterationBudget: 3,
        },
        {
          phase: "Implement",
          description: "Core logic and features",
          tools: ["write_file", "read_file"],
          iterationBudget: 8,
        },
        {
          phase: "Test",
          description: "Verify and fix issues",
          tools: ["execute_command", "read_file"],
          iterationBudget: 3,
        },
        {
          phase: "Polish",
          description: "Final touches and documentation",
          tools: ["write_file"],
          iterationBudget: 2,
        },
      ];

    case "CREATIVE":
      return [
        {
          phase: "Concept",
          description: "Creative direction and parameters",
          tools: [],
          iterationBudget: 1,
        },
        {
          phase: "Generate",
          description: "Create primary assets",
          tools: ["generate_image", "generate_video", "synthesize_speech"],
          iterationBudget: 3,
        },
        {
          phase: "Refine",
          description: "Iterate on quality",
          tools: ["write_file", "analyze_image"],
          iterationBudget: 2,
        },
      ];

    case "ANALYSIS":
      return [
        {
          phase: "Ingest",
          description: "Load and inspect data",
          tools: ["read_file", "run_code"],
          iterationBudget: 2,
        },
        {
          phase: "Analyze",
          description: "Statistical analysis and modeling",
          tools: ["run_code"],
          iterationBudget: 4,
        },
        {
          phase: "Visualize",
          description: "Charts and visualizations",
          tools: ["run_code", "write_file"],
          iterationBudget: 3,
        },
        {
          phase: "Report",
          description: "Summary and insights",
          tools: ["write_file", "knowledge_store"],
          iterationBudget: 2,
        },
      ];

    case "FULL_STACK":
      return [
        {
          phase: "Architecture",
          description: "System design and planning",
          tools: ["web_search"],
          iterationBudget: 3,
        },
        {
          phase: "Backend",
          description: "API, database, business logic",
          tools: ["write_file", "execute_command", "install_packages"],
          iterationBudget: 10,
        },
        {
          phase: "Frontend",
          description: "UI components and pages",
          tools: ["write_file", "execute_command"],
          iterationBudget: 10,
        },
        {
          phase: "Integration",
          description: "Connect frontend to backend",
          tools: ["write_file", "execute_command"],
          iterationBudget: 5,
        },
        {
          phase: "Testing",
          description: "E2E tests and verification",
          tools: ["execute_command", "read_file"],
          iterationBudget: 5,
        },
        {
          phase: "Deploy",
          description: "Build and deployment",
          tools: ["execute_command", "write_file"],
          iterationBudget: 3,
        },
      ];

    case "DEEP_THINK":
      return [
        {
          phase: "Research",
          description: "Gather relevant context",
          tools: ["web_search", "knowledge_query"],
          iterationBudget: 2,
        },
        {
          phase: "Reason",
          description: "Deep analysis and evaluation",
          tools: ["agent_memory"],
          iterationBudget: 2,
        },
        {
          phase: "Conclude",
          description: "Structured recommendations",
          tools: ["knowledge_store"],
          iterationBudget: 1,
        },
      ];
  }
}

function buildReasoning(scores: Record<StrategyType, number>, selected: StrategyType): string {
  const ranked = (Object.entries(scores) as Array<[StrategyType, number]>)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([s, v]) => `${s}=${v.toFixed(2)}`)
    .join(", ");
  return `Strategy: ${selected} (scores: ${ranked})`;
}

// ─── Diagnostics ────────────────────────────────────────────────

const planHistory: Array<{ prompt: string; strategy: StrategyType; confidence: number }> = [];
const MAX_PLAN_HISTORY = 100;

/** Record a plan for analytics */
export function recordPlan(prompt: string, plan: TaskPlan): void {
  planHistory.push({
    prompt: prompt.slice(0, 100),
    strategy: plan.strategy,
    confidence: plan.confidence,
  });
  if (planHistory.length > MAX_PLAN_HISTORY) {
    planHistory.splice(0, planHistory.length - MAX_PLAN_HISTORY);
  }
}

/** Get strategy distribution stats */
export function getStrategyDistribution(): Record<StrategyType, number> {
  const dist: Record<string, number> = {};
  for (const entry of planHistory) {
    dist[entry.strategy] = (dist[entry.strategy] ?? 0) + 1;
  }
  return dist as Record<StrategyType, number>;
}
