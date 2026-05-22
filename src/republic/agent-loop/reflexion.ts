/**
 * Reflexion — Mid-execution self-reflection checkpoints.
 *
 * Implements the Manus-style periodic Reflect→Revise loop where the agent
 * pauses to evaluate its own progress at ~33% and ~66% of the iteration budget.
 *
 * Unlike stall detection (which catches lack of progress), reflexion is an
 * active quality assessment: "Am I on the right track? Are there risks?"
 *
 * The reflection prompt is injected as a system message. The agent's response
 * is captured and can trigger plan revision.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ReflectionTrigger {
  shouldReflect: boolean;
  checkpoint: "early" | "mid" | "final" | null;
  progressPct: number;
}

export interface ReflectionPrompt {
  content: string;
  checkpoint: "early" | "mid" | "final";
}

// ─── Checkpoint Thresholds ──────────────────────────────────────

/** Reflection fires at these budget fractions (only if budget >= 6 iters) */
const CHECKPOINTS = [
  { fraction: 0.33, label: "early" as const },
  { fraction: 0.66, label: "mid" as const },
];

/** Minimum iteration budget to trigger reflections (skip for trivial tasks) */
const MIN_BUDGET_FOR_REFLECTION = 6;

// ─── Track which checkpoints have fired ─────────────────────────

const firedCheckpoints = new Set<string>();

/** Reset checkpoint tracking (call at loop start) */
export function resetReflectionState(): void {
  firedCheckpoints.clear();
}

// ─── Should Reflect? ────────────────────────────────────────────

/**
 * Determine if a reflection checkpoint should trigger at this iteration.
 * Only fires once per checkpoint per session.
 */
export function shouldReflect(
  currentIteration: number,
  maxIterations: number,
  strategy: string,
): ReflectionTrigger {
  // Skip for trivial tasks
  if (maxIterations < MIN_BUDGET_FOR_REFLECTION || strategy === "DIRECT") {
    return { shouldReflect: false, checkpoint: null, progressPct: 0 };
  }

  const progressPct = Math.round((currentIteration / maxIterations) * 100);

  for (const cp of CHECKPOINTS) {
    const threshold = Math.round(maxIterations * cp.fraction);
    const key = `${cp.label}-${threshold}`;

    if (currentIteration === threshold && !firedCheckpoints.has(key)) {
      firedCheckpoints.add(key);
      return { shouldReflect: true, checkpoint: cp.label, progressPct };
    }
  }

  return { shouldReflect: false, checkpoint: null, progressPct };
}

// ─── Build Reflection Prompt ────────────────────────────────────

/**
 * Generate a structured self-reflection prompt for the agent.
 * This is injected as a system-level message to trigger metacognition.
 */
export function buildReflectionPrompt(
  checkpoint: "early" | "mid" | "final",
  plan: {
    strategy: string;
    decomposition: Array<{ phase: string; description: string }>;
    estimatedIterations: number;
  },
  currentIteration: number,
  maxIterations: number,
  toolsUsed: string[],
  hadErrors: boolean,
): ReflectionPrompt {
  const remainingBudget = maxIterations - currentIteration;
  const uniqueTools = [...new Set(toolsUsed)];
  const phases = plan.decomposition.map((d) => d.phase).join(", ");

  const severityPrefix =
    checkpoint === "early" ? "Quick progress check" : "Critical mid-point review";

  const content = [
    `[REFLECTION CHECKPOINT — ${severityPrefix}]`,
    ``,
    `You are at iteration ${currentIteration}/${maxIterations} (${Math.round((currentIteration / maxIterations) * 100)}% of budget consumed).`,
    `Remaining budget: ${remainingBudget} iterations.`,
    `Strategy: ${plan.strategy} | Phases: ${phases}`,
    `Tools used so far: ${uniqueTools.length > 0 ? uniqueTools.join(", ") : "none"}`,
    hadErrors ? `⚠️ There have been tool errors in this session.` : "",
    ``,
    `Before continuing, briefly assess:`,
    `1. **Progress**: What have you accomplished so far? Is it on track with the plan?`,
    `2. **Quality**: Is the work so far high quality, or are there shortcuts that need revisiting?`,
    `3. **Risks**: What could prevent successful completion within the remaining budget?`,
    `4. **Plan adjustment**: Should you change your approach for the remaining work?`,
    ``,
    checkpoint === "mid"
      ? `This is your mid-point check. If you're behind, FOCUS on the most essential deliverables and skip nice-to-haves.`
      : `This is an early check. If you're off-track, now is the time to correct course.`,
    ``,
    `After reflecting, continue executing. Do NOT produce a final answer yet — keep working.`,
  ]
    .filter(Boolean)
    .join("\n");

  return { content, checkpoint };
}
