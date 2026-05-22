/**
 * APR — Adaptive Prompt Router: DAG-based Segment Executor
 *
 * Handles the critical problem of multi-segment prompts that depend on
 * each other's outputs, ensuring chain-of-thought continuity is preserved
 * even when different segments route to different models/providers.
 *
 * Key design decisions:
 * - Segments form a directed acyclic graph (DAG) of dependencies
 * - Independent segments execute in parallel (same "level" of the DAG)
 * - Dependent segments receive the outputs of their dependencies as injected context
 * - Memory (episodic/semantic) is injected per-segment based on relevance
 * - No segment executes until ALL its dependencies have resolved
 *
 * @see implementation_plan.md — Phase 4: APR Dependency Graph
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModelTier = "fast" | "balanced" | "reasoning" | "local";

export interface MemoryRef {
  type: "episodic" | "semantic" | "working";
  content: string;
  relevanceScore: number;
  sourceId?: string;
}

export interface PromptSegment {
  /** Unique ID for this segment within the prompt */
  id: string;
  /** The actual prompt text for this segment */
  content: string;
  /** IDs of segments whose output this segment depends on */
  dependsOn: string[];
  /** Preferred model tier for this segment */
  tier: ModelTier;
  /** Prior segment IDs whose outputs should be injected as context */
  contextWindow: string[];
  /** Memory references to inject before routing */
  memoryRefs: MemoryRef[];
  /** Metadata */
  meta?: Record<string, unknown>;
}

export interface SegmentResult {
  segmentId: string;
  output: string;
  model: string;
  tier: ModelTier;
  latencyMs: number;
  tokensUsed?: number;
}

export interface DagExecutionResult {
  outputs: Record<string, SegmentResult>;
  totalLatencyMs: number;
  segments: number;
  parallelBatches: number;
}

// ── DAG Builder ───────────────────────────────────────────────────────────────

/**
 * Topological sort of segments into execution batches.
 * Each batch can execute in parallel since its members have no inter-dependencies.
 *
 * @throws Error if a cycle is detected in the dependency graph
 */
export function buildExecutionBatches(segments: PromptSegment[]): PromptSegment[][] {
  const byId = new Map(segments.map((s) => [s.id, s]));
  const inDegree = new Map(segments.map((s) => [s.id, 0]));

  // Count in-degrees
  for (const seg of segments) {
    for (const dep of seg.dependsOn) {
      if (!byId.has(dep)) {
        throw new Error(`APR: segment "${seg.id}" depends on unknown segment "${dep}"`);
      }
      inDegree.set(seg.id, (inDegree.get(seg.id) ?? 0) + 1);
    }
  }

  const batches: PromptSegment[][] = [];
  const resolved = new Set<string>();
  const remaining = new Set(segments.map((s) => s.id));

  let safety = 0;
  while (remaining.size > 0) {
    if (safety++ > 1000) {throw new Error("APR: cycle detected in segment dependency graph");}

    const batch = segments.filter(
      (s) => remaining.has(s.id) && s.dependsOn.every((dep) => resolved.has(dep)),
    );

    if (batch.length === 0) {
      throw new Error(
        `APR: deadlock — segments with unresolvable dependencies: ${[...remaining].join(", ")}`,
      );
    }

    batches.push(batch);
    for (const seg of batch) {
      resolved.add(seg.id);
      remaining.delete(seg.id);
    }
  }

  return batches;
}

// ── Context Injector ──────────────────────────────────────────────────────────

/**
 * Build the context-aware prompt for a segment.
 * Prepends: relevant memory + outputs of contextWindow dependencies.
 */
export function buildContextualPrompt(
  segment: PromptSegment,
  priorOutputs: Record<string, SegmentResult>,
): string {
  const parts: string[] = [];

  // 1. Inject relevant memory refs (episodic first, then semantic)
  const episodic = segment.memoryRefs
    .filter((m) => m.type === "episodic")
    .toSorted((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 3);
  const semantic = segment.memoryRefs
    .filter((m) => m.type === "semantic")
    .toSorted((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 2);

  if (episodic.length > 0) {
    parts.push("## Relevant Memory (Episodic)");
    for (const m of episodic) {
      parts.push(m.content);
    }
  }
  if (semantic.length > 0) {
    parts.push("## Background Knowledge");
    for (const m of semantic) {
      parts.push(m.content);
    }
  }

  // 2. Inject outputs of context-window dependencies
  const ctxOutputs = segment.contextWindow.map((id) => priorOutputs[id]).filter(Boolean);

  if (ctxOutputs.length > 0) {
    parts.push("## Context from Prior Analysis");
    for (const output of ctxOutputs) {
      parts.push(`[${output.segmentId}]:\n${output.output}`);
    }
  }

  // 3. The actual segment content
  if (parts.length > 0) {
    parts.push("## Your Task");
  }
  parts.push(segment.content);

  return parts.join("\n\n");
}


/**
 * Route a single segment to the appropriate model via the real inference gateway.
 * Delegates to inference-gateway.ts routeInference() which handles:
 * model-council selection → prompt queue → rate limiter → provider dispatch.
 */
export async function routeSegment(
  segment: PromptSegment,
  contextualPrompt: string,
  _agentId?: string,
): Promise<SegmentResult> {
  const start = Date.now();

  // Try real inference gateway (lazy import to avoid circular deps)
  try {
    const { routeInference } = await import("../inference-gateway.js");

    const result = await routeInference({
      citizenId: _agentId ?? "anonymous",
      prompt: contextualPrompt,
      toolName: (segment.meta?.toolName as string) ?? "cognitive_cycle",
      task: {
        type: "decision" as const,
        citizenId: _agentId ?? "anonymous",
        description: `DAG segment ${segment.id}`,
        complexity: segment.tier === "reasoning" ? 0.9 : segment.tier === "balanced" ? 0.6 : 0.3,
      },
      specialization: ((segment.meta?.specialization as string) ?? "Worker") as import("../types.js").Specialization,
      skillLevel: (segment.meta?.skillLevel as number) ?? 50,
      maxTokens: 2048,
    });

    return {
      segmentId: segment.id,
      output: result.response,
      model: result.modelId,
      tier: segment.tier,
      latencyMs: Date.now() - start,
      tokensUsed: Math.ceil(contextualPrompt.length / 4),
    };
  } catch (err) {
    // Fallback: return a structured error message instead of silently failing
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      segmentId: segment.id,
      output: `[inference-error] Segment '${segment.id}' failed: ${errorMsg}`,
      model: "fallback",
      tier: segment.tier,
      latencyMs: Date.now() - start,
    };
  }
}


// ── Main Executor ─────────────────────────────────────────────────────────────

/**
 * Execute a multi-segment prompt with full dependency-aware routing.
 *
 * - Independent segments are executed in parallel
 * - Each segment receives outputs of its dependencies as context
 * - Memory is injected per-segment based on relevance
 * - Chain-of-thought continuity is preserved across model boundaries
 */
export async function executePromptDAG(
  segments: PromptSegment[],
  options: {
    agentId?: string;
    onProgress?: (completed: number, total: number, batchIndex: number) => void;
  } = {},
): Promise<DagExecutionResult> {
  const start = Date.now();
  const batches = buildExecutionBatches(segments);
  const priorOutputs: Record<string, SegmentResult> = {};
  let completed = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    // Execute all segments in this batch in parallel
    const results = await Promise.all(
      batch.map(async (segment) => {
        const contextualPrompt = buildContextualPrompt(segment, priorOutputs);
        return routeSegment(segment, contextualPrompt, options.agentId);
      }),
    );

    // Accumulate outputs for next batch's context injection
    for (const result of results) {
      priorOutputs[result.segmentId] = result;
    }

    completed += batch.length;
    options.onProgress?.(completed, segments.length, batchIdx);
  }

  return {
    outputs: priorOutputs,
    totalLatencyMs: Date.now() - start,
    segments: segments.length,
    parallelBatches: batches.length,
  };
}

// ── Complexity Analyser ────────────────────────────────────────────────────────

/**
 * Analyse a raw prompt and decide how to segment it.
 * Returns a list of segments with automatically assigned tiers and dependency chains.
 */
export function analyseAndSegment(prompt: string, agentId?: string): PromptSegment[] {
  const lines = prompt.split("\n").filter(Boolean);
  const complexity = Math.min(prompt.length / 500 + (prompt.match(/\?/g)?.length ?? 0) * 0.1, 1);

  // Short or simple prompts: single segment
  if (complexity < 0.4 || lines.length < 3) {
    return [
      {
        id: "S0",
        content: prompt,
        dependsOn: [],
        tier: complexity > 0.7 ? "reasoning" : "fast",
        contextWindow: [],
        memoryRefs: [],
        meta: { agentId },
      },
    ];
  }

  // Medium prompts: analysis + synthesis
  if (complexity < 0.7) {
    return [
      {
        id: "S0-analyze",
        content: `Analyze the following and extract key facts:\n\n${prompt}`,
        dependsOn: [],
        tier: "fast",
        contextWindow: [],
        memoryRefs: [],
      },
      {
        id: "S1-synthesize",
        content: "Based on the analysis above, provide a comprehensive response.",
        dependsOn: ["S0-analyze"],
        tier: "balanced",
        contextWindow: ["S0-analyze"],
        memoryRefs: [],
        meta: { agentId },
      },
    ];
  }

  // Complex: fact extraction → reasoning → synthesis
  return [
    {
      id: "S0-facts",
      content: `Extract all relevant facts, constraints, and requirements from:\n\n${prompt}`,
      dependsOn: [],
      tier: "fast",
      contextWindow: [],
      memoryRefs: [],
    },
    {
      id: "S1-reason",
      content:
        "Apply deep reasoning to the extracted facts. Consider all implications and edge cases.",
      dependsOn: ["S0-facts"],
      tier: "reasoning",
      contextWindow: ["S0-facts"],
      memoryRefs: [],
    },
    {
      id: "S2-synthesize",
      content: "Synthesise the reasoning into a final, actionable response.",
      dependsOn: ["S1-reason"],
      tier: "balanced",
      contextWindow: ["S0-facts", "S1-reason"],
      memoryRefs: [],
      meta: { agentId },
    },
  ];
}
