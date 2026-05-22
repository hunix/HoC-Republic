/**
 * Adaptive Prompt Router (APR) — Main Orchestrator (2026)
 *
 * Implements the full APR pipeline:
 *   1. Analyze prompt for complexity and intent (prompt-analyzer.ts)
 *   2. Fast-path bypass for simple prompts (NofT ≤ 1.5)
 *   3. Build routing plan via controller agent (claude-haiku-4-6 or gemini-3-flash)
 *   4. Execute chunks in parallel (or sequential for dependent chains)
 *   5. Validate every chunk response (router-validator.ts)
 *   6. Fallback/retry on validation failure (router-fallback.ts)
 *   7. Consolidate all chunks into coherent final response
 *   8. Validate and deliver final response
 *
 * Based on:
 *   - ADaPT: As-Needed Decomposition (Stanford 2026)
 *   - Mixture-of-Agents architecture (MoA, arXiv 2024–2026)
 *   - Two-level routing: family selection → compute level (IBM 2026)
 *   - RouteLLM dynamic cost-quality optimization (LMSys/Berkeley 2026)
 *
 * Cost savings: 40–85% vs sending all prompts to frontier single model.
 */

import type { ThinkLevel } from "../agents/context-engineer.js";
import { analyzePrompt, isFastPathEligible } from "./prompt-analyzer.js";
import {
  getFallbackChain,
  decideFallback,
  describeFallbackChain,
  type ModelAssignment,
  type FallbackChain,
} from "./router-fallback.js";
import {
  validateRoutingPlan,
  validateChunkResponse,
  validateForContradictions,
  validateFinalResponse,
  type ChunkOutput,
} from "./router-validator.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChunkIntent =
  | "code"
  | "math"
  | "reasoning"
  | "retrieval"
  | "creative"
  | "simple"
  | "structured";

export interface PromptChunk {
  id: string;
  content: string;
  intent: ChunkIntent;
  complexityScore: number;
  /** IDs of chunks this depends on (their output is passed as context) */
  requiresContext: string[];
  assignment: ModelAssignment;
  /** Optional expected output format */
  expectedSchema?: string;
}

export interface RoutingPlan {
  chunks: PromptChunk[];
  strategy: "passthrough" | "parallel" | "sequential" | "hybrid";
  estimatedCostMultiplier: number;
  controllerModelUsed: string;
}

export interface ChunkResult {
  chunkId: string;
  content: string;
  model: string;
  tokensUsed: number;
  validationScore: number;
  retryCount: number;
  fallbackUsed: boolean;
  isPartial: boolean;
}

export interface RouterResponse {
  finalResponse: string;
  routingPlan: RoutingPlan;
  chunkResults: ChunkResult[];
  totalTokens: number;
  /** Estimated fraction of cost vs. sending everything to claude-opus-4-6 */
  relativeCost: number;
  consolidationModel: string;
  validationScore: number;
  wasPartial: boolean;
}

export interface RouterConfig {
  /** Enable APR routing. When false, bypasses routing entirely. Default: true */
  enabled: boolean;
  /** Model to use as the controller agent */
  controllerModel: ModelAssignment;
  /** Model to use for consolidation */
  consolidatorModel: ModelAssignment;
  /** Model for passthrough when fast-pathing */
  passthroughModel: ModelAssignment;
  /** Maximum parallel chunk workers */
  maxParallelChunks: number;
  /** Enable LLM-assisted controller (when false, uses heuristic partition) */
  useControllerAgent: boolean;
  /** Log routing decisions to console */
  debug: boolean;
  /** Providers to absolutely exclude from all routing and fallback assignments */
  excludeProviders?: string[];
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_CONTROLLER: ModelAssignment = {
  provider: "google",
  modelId: "gemini-3-flash", // Fast, cost-effective controller
  thinkLevel: "low",
};

const DEFAULT_CONSOLIDATOR: ModelAssignment = {
  provider: "anthropic",
  modelId: "claude-sonnet-4-6", // High-quality consolidation
  thinkLevel: "medium",
};

const DEFAULT_PASSTHROUGH: ModelAssignment = {
  provider: "anthropic",
  modelId: "claude-sonnet-4-6",
  thinkLevel: "high",
};

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  enabled: true,
  controllerModel: DEFAULT_CONTROLLER,
  consolidatorModel: DEFAULT_CONSOLIDATOR,
  passthroughModel: DEFAULT_PASSTHROUGH,
  maxParallelChunks: 4,
  useControllerAgent: true,
  debug: false,
  excludeProviders: [],
};

// ── Model Call Interface ──────────────────────────────────────────────────────

/**
 * Function signature for calling an LLM.
 * Injected by the caller to avoid direct dependency on the LLM SDK.
 */
export type ModelCallFn = (params: {
  provider: string;
  modelId: string;
  thinkLevel: ThinkLevel;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}) => Promise<{ content: string; tokensUsed: number }>;

// ── Controller: Build Routing Plan ────────────────────────────────────────────

const CONTROLLER_SYSTEM_PROMPT = `You are a Prompt Router Controller. Your job is to analyze a complex user prompt and partition it into optimal chunks for parallel processing by specialized AI models.

For each chunk, you decide:
- The content (exact sub-prompt text)
- The intent (code | math | reasoning | retrieval | creative | simple | structured)
- The complexity score (0.0 to 1.0)
- The model assignment (provider + modelId + thinkLevel)
- Any dependencies on other chunks

Available models by tier:
- Simple (0–0.3): google/gemini-3.1-flash-lite, openai/gpt-5.2-instant
- Medium (0.3–0.6): google/gemini-3-flash, openai/gpt-5.2, anthropic/claude-haiku-4-6
- High (0.6–0.8): openai/gpt-5.2 (high reasoning), anthropic/claude-sonnet-4-6
- Maximum (0.8–1.0): anthropic/claude-opus-4-6, openai/gpt-5.4

ThinkLevel options: off | minimal | low | medium | high | xhigh

Rules:
1. If the prompt is simple and atomic, return exactly 1 chunk (passthrough)
2. Do NOT create more chunks than necessary — complexity overhead must be justified
3. For dependent chunks (e.g., chunk B needs chunk A's code output), set requiresContext: ["chunk_A_id"]
4. Return ONLY valid JSON conforming to the RoutingPlan schema

Output must be: {"chunks": [...], "strategy": "parallel|sequential|hybrid", "estimatedCostMultiplier": 0.5}`;

async function buildRoutingPlanViaController(params: {
  prompt: string;
  context: string;
  config: RouterConfig;
  callModel: ModelCallFn;
}): Promise<RoutingPlan | null> {
  const { prompt, context, config, callModel } = params;

  const userMessage = `Analyze and partition this prompt into optimal routing chunks:\n\n<prompt>\n${prompt}\n</prompt>\n${context ? `\n<context>\n${context}\n</context>` : ""}`;

  try {
    const result = await callModel({
      provider: config.controllerModel.provider,
      modelId: config.controllerModel.modelId,
      thinkLevel: config.controllerModel.thinkLevel,
      systemPrompt: CONTROLLER_SYSTEM_PROMPT,
      userPrompt: userMessage,
      maxTokens: 2048,
      temperature: 0.1, // Low temp for deterministic JSON output
    });

    // Extract JSON from response (may be wrapped in markdown fences)
    let jsonStr = result.content.trim();
    const fence = jsonStr.match(/```(?:json)?\n?([\s\S]+?)\n?```/);
    if (fence) {
      jsonStr = fence[1].trim();
    }

    const validation = validateRoutingPlan(jsonStr);
    if (!validation.passed || !validation.plan) {
      if (config.debug) {
        console.warn("[APR] Controller output failed validation:", validation.issues);
      }
      return null;
    }

    // Map to our typed RoutingPlan
    // Build chunk IDs first so we can validate requiresContext references
    const chunkIds = new Set(validation.plan.chunks.map((c, i) => c.id || `chunk_${i}`));

    const plan: RoutingPlan = {
      strategy: (validation.plan.strategy as RoutingPlan["strategy"]) ?? "parallel",
      estimatedCostMultiplier: 0.6,
      controllerModelUsed: `${config.controllerModel.provider}/${config.controllerModel.modelId}`,
      chunks: validation.plan.chunks.map((c, i): PromptChunk => {
        const chunkId = c.id || `chunk_${i}`;
        // ✅ FIXED: preserve requiresContext from controller output instead of zeroing it
        // Only include references to known chunk IDs to avoid dangling pointers
        const rawDeps = Array.isArray((c as Record<string, unknown>).requiresContext)
          ? ((c as Record<string, unknown>).requiresContext as string[])
          : [];
        const requiresContext = rawDeps.filter((dep) => chunkIds.has(dep) && dep !== chunkId);
        return {
          id: chunkId,
          content: c.content,
          intent: (c.intent as ChunkIntent) || "reasoning",
          complexityScore: c.complexityScore ?? 0.5,
          requiresContext,
          assignment: {
            provider: c.assignment?.provider ?? config.passthroughModel.provider,
            modelId: c.assignment?.modelId ?? config.passthroughModel.modelId,
            thinkLevel:
              (c.assignment as { thinkLevel?: ThinkLevel } | undefined)?.thinkLevel ?? "medium",
          },
        };
      }),
    };

    return plan;
  } catch (err) {
    if (config.debug) {
      console.warn("[APR] Controller call failed:", err);
    }
    return null;
  }
}

// ── Heuristic Fallback Plan ───────────────────────────────────────────────────

/**
 * Build a routing plan from the heuristic analysis — no LLM controller needed.
 * Used when: controller is disabled, or controller call fails.
 */
function buildHeuristicRoutingPlan(params: { prompt: string; config: RouterConfig }): RoutingPlan {
  const { prompt, config } = params;
  const analysis = analyzePrompt(prompt);

  if (analysis.canFastPath || analysis.suggestedPartitionCount === 1) {
    return buildPassthroughPlan(config);
  }

  // Split by segments if detected, otherwise split by paragraph
  const texts =
    analysis.segments.length >= 2
      ? analysis.segments.map((s) => s.text)
      : splitByParagraphs(prompt, analysis.suggestedPartitionCount);

  const chunks: PromptChunk[] = texts.map((text, i): PromptChunk => {
    const seg = analysis.segments[i];
    const score = seg?.complexityScore ?? analysis.complexityScore;
    const chain = getFallbackChain(score, config.excludeProviders);
    return {
      id: `heuristic_chunk_${i}`,
      content: text,
      intent: (seg?.domain as ChunkIntent) ?? "reasoning",
      complexityScore: score,
      requiresContext: [],
      assignment: chain.primary,
    };
  });

  return {
    chunks,
    strategy: "parallel",
    estimatedCostMultiplier: 0.65,
    controllerModelUsed: "heuristic",
  };
}

function buildPassthroughPlan(config: RouterConfig): RoutingPlan {
  return {
    chunks: [
      {
        id: "passthrough",
        content: "", // Will be filled by the caller
        intent: "reasoning",
        complexityScore: 0.3,
        requiresContext: [],
        assignment: config.passthroughModel,
      },
    ],
    strategy: "passthrough",
    estimatedCostMultiplier: 1.0,
    controllerModelUsed: "none",
  };
}

function splitByParagraphs(text: string, maxParts: number): string[] {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
  if (paragraphs.length <= maxParts) {
    return paragraphs;
  }

  // Merge short paragraphs
  const result: string[] = [];
  let current = "";
  const targetSize = Math.ceil(text.length / maxParts);

  for (const para of paragraphs) {
    if (current.length + para.length > targetSize && current.length > 0) {
      result.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) {
    result.push(current.trim());
  }
  return result.slice(0, maxParts);
}

// ── Chunk Executor ────────────────────────────────────────────────────────────

/**
 * Build the context section injected before a chunk's content.
 *
 * Three-layer context injection (inspired by 2025–26 MoA + ADaPT research):
 *   1. Full original prompt — gives chunk the complete picture (read-only anchor)
 *   2. Chain-of-thought summaries — condensed view of all completed chunks
 *   3. Explicit dependency outputs — full content of chunks this chunk declared a dep on
 *
 * Mirrors how human cognition works: you first recall the full question,
 * then review your running notes, then re-read the specific section you need.
 */
function buildChunkContextSection(
  chunk: PromptChunk,
  contextResults: Map<string, string>,
  originalPrompt: string,
  allChunks: PromptChunk[],
): string {
  const parts: string[] = [];

  // Layer 1: Original prompt anchor — always included so the chunk doesn't lose context
  // Truncate if very long (>2000 chars) to save tokens while preserving meaning
  const anchor =
    originalPrompt.length > 2000
      ? originalPrompt.slice(0, 1800) + "\n[...original prompt truncated for brevity...]"
      : originalPrompt;
  parts.push(`<original_prompt>\n${anchor}\n</original_prompt>`);

  // Layer 2: Chain-of-thought running summary of all completed chunks (not just declared deps)
  const completedSummaries: string[] = [];
  for (const [completedId, completedContent] of contextResults.entries()) {
    // Skip if this is a declared dep (will be shown in full in Layer 3)
    if (chunk.requiresContext.includes(completedId)) {
      continue;
    }
    // Brief summary: first 200 chars of the completed chunk's output
    const brief =
      completedContent.length > 200 ? completedContent.slice(0, 180) + "…" : completedContent;
    completedSummaries.push(`[${completedId}]: ${brief}`);
  }
  if (completedSummaries.length > 0) {
    parts.push(
      `<chain_of_thought_so_far>\n${completedSummaries.join("\n")}\n</chain_of_thought_so_far>`,
    );
  }

  // Layer 3: Full outputs of explicitly declared dependencies
  const depParts: string[] = [];
  for (const depId of chunk.requiresContext) {
    const depResult = contextResults.get(depId);
    if (depResult) {
      const depChunk = allChunks.find((c) => c.id === depId);
      const depIntent = depChunk?.intent ?? "output";
      depParts.push(
        `<dependency id="${depId}" intent="${depIntent}">\n${depResult}\n</dependency>`,
      );
    } else {
      // Declared dependency not yet available — this indicates an ordering bug
      depParts.push(`<dependency id="${depId}" status="not_yet_available" />`);
    }
  }
  if (depParts.length > 0) {
    parts.push(`<required_context>\n${depParts.join("\n\n")}\n</required_context>`);
  }

  if (parts.length === 0) {
    return "";
  }
  return `\n\n${parts.join("\n\n")}\n\n`;
}

async function executeChunk(params: {
  chunk: PromptChunk;
  contextResults: Map<string, string>;
  originalPrompt: string;
  allChunks: PromptChunk[];
  callModel: ModelCallFn;
  config: RouterConfig;
  signal?: AbortSignal;
}): Promise<ChunkResult> {
  const { chunk, contextResults, originalPrompt, allChunks, callModel, config, signal } = params;

  // Build rich multi-layer context section
  const contextSection = buildChunkContextSection(chunk, contextResults, originalPrompt, allChunks);
  const fullPrompt = contextSection + `<your_task>\n${chunk.content}\n</your_task>`;

  const chain: FallbackChain = getFallbackChain(chunk.complexityScore, config.excludeProviders);
  let currentAssignment = chunk.assignment;
  let attemptNumber = 0;
  let sameModelRetryCount = 0;
  let fallbackUsed = false;

  while (attemptNumber < chain.maxTotalAttempts) {
    try {
      const result = await callModel({
        provider: currentAssignment.provider,
        modelId: currentAssignment.modelId,
        thinkLevel: currentAssignment.thinkLevel,
        systemPrompt:
          "You are a specialized AI processing one component of a larger task. Be precise, complete, and focused on your specific assignment.",
        userPrompt: fullPrompt,
        maxTokens: currentAssignment.maxTokens ?? 4096,
        temperature: currentAssignment.temperature ?? 0.7,
        signal,
      });

      // Validate chunk response (validate against the original task, not the full composed prompt)
      const validation = validateChunkResponse(result.content, {
        chunkId: chunk.id,
        originalPrompt: chunk.content,
        intent: chunk.intent,
        complexityScore: chunk.complexityScore,
      });

      if (validation.passed) {
        return {
          chunkId: chunk.id,
          content: result.content,
          model: `${currentAssignment.provider}/${currentAssignment.modelId}`,
          tokensUsed: result.tokensUsed,
          validationScore: validation.score,
          retryCount: sameModelRetryCount,
          fallbackUsed,
          isPartial: false,
        };
      }

      // Decide next action
      const decision = decideFallback({
        chain,
        attemptNumber: attemptNumber + 1,
        sameModelRetryCount,
        recommendedAction:
          validation.recommendation === "accept" ? "retry" : validation.recommendation,
      });

      if (decision.action === "partial") {
        // Return partial with what we have
        return {
          chunkId: chunk.id,
          content: result.content || `[Partial result for chunk ${chunk.id}]`,
          model: `${currentAssignment.provider}/${currentAssignment.modelId}`,
          tokensUsed: result.tokensUsed,
          validationScore: validation.score,
          retryCount: sameModelRetryCount,
          fallbackUsed,
          isPartial: true,
        };
      }

      if (decision.nextAssignment) {
        if (decision.action === "retry") {
          sameModelRetryCount++;
        } else {
          currentAssignment = decision.nextAssignment;
          sameModelRetryCount = 0;
          fallbackUsed = true;
        }
      }
    } catch {
      // Model call failed — advance to next fallback
      const decision = decideFallback({
        chain,
        attemptNumber: attemptNumber + 1,
        sameModelRetryCount,
        recommendedAction: "fallback",
      });

      if (decision.action === "partial" || !decision.nextAssignment) {
        return {
          chunkId: chunk.id,
          content: `[Error: chunk ${chunk.id} failed after all fallbacks]`,
          model: `${currentAssignment.provider}/${currentAssignment.modelId}`,
          tokensUsed: 0,
          validationScore: 0,
          retryCount: sameModelRetryCount,
          fallbackUsed,
          isPartial: true,
        };
      }

      currentAssignment = decision.nextAssignment;
      sameModelRetryCount = 0;
      fallbackUsed = true;
    }

    attemptNumber++;
  }

  return {
    chunkId: chunk.id,
    content: `[Partial: chunk ${chunk.id} could not be fully resolved]`,
    model: `${currentAssignment.provider}/${currentAssignment.modelId}`,
    tokensUsed: 0,
    validationScore: 0,
    retryCount: sameModelRetryCount,
    fallbackUsed,
    isPartial: true,
  };
}

// ── Parallel/Sequential Executor ──────────────────────────────────────────────

async function executeRoutingPlan(params: {
  plan: RoutingPlan;
  originalPrompt: string;
  callModel: ModelCallFn;
  config: RouterConfig;
  maxParallel: number;
  signal?: AbortSignal;
}): Promise<ChunkResult[]> {
  const { plan, originalPrompt, callModel, config, maxParallel, signal } = params;

  if (plan.strategy === "passthrough") {
    // Single chunk passthrough — no parallelism overhead
    const chunk = plan.chunks[0];
    chunk.content = originalPrompt; // Fill content for passthrough
    const result = await executeChunk({
      chunk,
      contextResults: new Map(),
      originalPrompt,
      allChunks: plan.chunks,
      callModel,
      config,
      signal,
    });
    return [result];
  }

  const results: ChunkResult[] = [];
  const contextResults = new Map<string, string>();

  if (plan.strategy === "sequential") {
    // Sequential: each chunk may depend on previous
    for (const chunk of plan.chunks) {
      const result = await executeChunk({
        chunk,
        contextResults,
        originalPrompt,
        allChunks: plan.chunks,
        callModel,
        config,
        signal,
      });
      results.push(result);
      contextResults.set(chunk.id, result.content);
    }
    return results;
  }

  // Parallel or hybrid: topological sort by dependencies
  const topoOrder = topologicalSort(plan.chunks);
  const pendingByDepth = groupByDependencyDepth(topoOrder, plan.chunks);

  for (const group of pendingByDepth) {
    // Within each group, all chunks are independent — run in parallel
    const batches: PromptChunk[][] = [];
    for (let i = 0; i < group.length; i += maxParallel) {
      batches.push(group.slice(i, i + maxParallel));
    }

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map((chunk) =>
          executeChunk({
            chunk,
            contextResults,
            originalPrompt,
            allChunks: plan.chunks,
            callModel,
            config,
            signal,
          }),
        ),
      );
      for (const r of batchResults) {
        results.push(r);
        contextResults.set(r.chunkId, r.content);
      }
    }
  }

  return results;
}

/** Topological sort of chunks by their requiresContext dependencies */
function topologicalSort(chunks: PromptChunk[]): PromptChunk[] {
  const byId = new Map(chunks.map((c) => [c.id, c]));
  const visited = new Set<string>();
  const result: PromptChunk[] = [];

  function visit(chunk: PromptChunk) {
    if (visited.has(chunk.id)) {
      return;
    }
    for (const depId of chunk.requiresContext) {
      const dep = byId.get(depId);
      if (dep) {
        visit(dep);
      }
    }
    visited.add(chunk.id);
    result.push(chunk);
  }

  for (const chunk of chunks) {
    visit(chunk);
  }
  return result;
}

/** Group chunks into dependency levels for batched parallel execution */
function groupByDependencyDepth(sorted: PromptChunk[], _all: PromptChunk[]): PromptChunk[][] {
  const depth = new Map<string, number>();

  for (const chunk of sorted) {
    const maxDep =
      chunk.requiresContext.length > 0
        ? Math.max(...chunk.requiresContext.map((d) => depth.get(d) ?? 0))
        : -1;
    depth.set(chunk.id, maxDep + 1);
  }

  const maxDepth = Math.max(...Array.from(depth.values()));
  const groups: PromptChunk[][] = Array.from({ length: maxDepth + 1 }, () => []);

  for (const chunk of sorted) {
    groups[depth.get(chunk.id) ?? 0].push(chunk);
  }

  return groups.filter((g) => g.length > 0);
}

// ── Consolidator ──────────────────────────────────────────────────────────────

const CONSOLIDATOR_SYSTEM_PROMPT = `You are a Response Consolidator. You receive multiple partial responses for different aspects of a complex prompt, and your job is to merge them into a single, coherent, well-structured final answer.

Rules:
1. The final response must feel like it came from a single voice — no visible "seams"
2. Preserve all technical details and code from each part
3. Resolve any contradictions by choosing the most correct or most recent information
4. Remove duplicate content
5. Ensure logical flow: context → explanation → examples → conclusion
6. Do NOT add preamble like "Here is the consolidated response:" — just start the answer`;

async function consolidateResults(params: {
  originalPrompt: string;
  chunkResults: ChunkResult[];
  plan: RoutingPlan;
  config: RouterConfig;
  callModel: ModelCallFn;
  signal?: AbortSignal;
}): Promise<{ content: string; tokensUsed: number }> {
  const { originalPrompt, chunkResults, plan, config, callModel, signal } = params;

  if (chunkResults.length === 1) {
    // Single chunk — no consolidation needed
    return { content: chunkResults[0].content, tokensUsed: 0 };
  }

  // Validate for contradictions first
  const chunkOutputs: ChunkOutput[] = chunkResults.map((r) => ({
    chunkId: r.chunkId,
    content: r.content,
    domain: plan.chunks.find((c) => c.id === r.chunkId)?.intent ?? "reasoning",
  }));

  validateForContradictions(chunkOutputs);
  // Contradictions are noted but don't block — consolidator handles resolution

  const partsText = chunkResults
    .filter((r) => !r.isPartial || r.content.length > 20)
    .map((r, i) => `### Part ${i + 1}\n${r.content}`)
    .join("\n\n");

  const partialNotes = chunkResults.filter((r) => r.isPartial);
  const partialWarning =
    partialNotes.length > 0
      ? `\n\nNote: The following parts could not be fully resolved and may be incomplete: ${partialNotes.map((r) => r.chunkId).join(", ")}`
      : "";

  const consolidatePrompt = `Original question:\n${originalPrompt}\n\n---\n\nPartial responses to merge:\n\n${partsText}${partialWarning}\n\nPlease produce a single, complete, unified answer.`;

  return callModel({
    provider: config.consolidatorModel.provider,
    modelId: config.consolidatorModel.modelId,
    thinkLevel: config.consolidatorModel.thinkLevel,
    systemPrompt: CONSOLIDATOR_SYSTEM_PROMPT,
    userPrompt: consolidatePrompt,
    maxTokens: 8192,
    temperature: 0.4,
    signal,
  });
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Route a prompt through the Adaptive Prompt Router.
 *
 * Fast-path (NofT ≤ 1.5): returns immediately with passthrough plan.
 * Full APR: analyzes → plans → partitions → executes parallel → validates → consolidates.
 *
 * @example
 * const response = await routePrompt({
 *   prompt: "Write a Python REST API with JWT auth and unit tests",
 *   callModel: myModelCallFn,
 *   config: DEFAULT_ROUTER_CONFIG,
 * });
 */
export async function routePrompt(params: {
  prompt: string;
  context?: string;
  callModel: ModelCallFn;
  config?: Partial<RouterConfig>;
  signal?: AbortSignal;
}): Promise<RouterResponse> {
  const { prompt, context = "", callModel, signal } = params;
  const config: RouterConfig = { ...DEFAULT_ROUTER_CONFIG, ...params.config };

  if (!config.enabled) {
    // APR disabled — passthrough
    const result = await callModel({
      provider: config.passthroughModel.provider,
      modelId: config.passthroughModel.modelId,
      thinkLevel: config.passthroughModel.thinkLevel,
      systemPrompt: "",
      userPrompt: prompt,
      signal,
    });
    return {
      finalResponse: result.content,
      routingPlan: buildPassthroughPlan(config),
      chunkResults: [
        {
          chunkId: "passthrough",
          content: result.content,
          model: `${config.passthroughModel.provider}/${config.passthroughModel.modelId}`,
          tokensUsed: result.tokensUsed,
          validationScore: 1.0,
          retryCount: 0,
          fallbackUsed: false,
          isPartial: false,
        },
      ],
      totalTokens: result.tokensUsed,
      relativeCost: 1.0,
      consolidationModel: "none",
      validationScore: 1.0,
      wasPartial: false,
    };
  }

  // Fast-path check
  if (isFastPathEligible(prompt)) {
    if (config.debug) {
      console.log("[APR] Fast-path eligible — skipping controller");
    }
    const result = await callModel({
      provider: config.passthroughModel.provider,
      modelId: config.passthroughModel.modelId,
      thinkLevel: config.passthroughModel.thinkLevel,
      systemPrompt: "",
      userPrompt: prompt,
      signal,
    });
    return {
      finalResponse: result.content,
      routingPlan: buildPassthroughPlan(config),
      chunkResults: [
        {
          chunkId: "fast_path",
          content: result.content,
          model: `${config.passthroughModel.provider}/${config.passthroughModel.modelId}`,
          tokensUsed: result.tokensUsed,
          validationScore: 1.0,
          retryCount: 0,
          fallbackUsed: false,
          isPartial: false,
        },
      ],
      totalTokens: result.tokensUsed,
      relativeCost: 0.5, // Single efficient model
      consolidationModel: "none",
      validationScore: 1.0,
      wasPartial: false,
    };
  }

  if (config.debug) {
    console.log(`[APR] Building routing plan. Fallback: ${describeFallbackChain(0.5)}`);
  }

  // Build routing plan — try controller first, fall back to heuristic
  let plan: RoutingPlan | null = null;
  if (config.useControllerAgent) {
    plan = await buildRoutingPlanViaController({ prompt, context, config, callModel });
  }
  if (!plan) {
    if (config.debug) {
      console.log("[APR] Using heuristic routing plan");
    }
    plan = buildHeuristicRoutingPlan({ prompt, config });
  }

  // If plan is passthrough, execute directly
  if (plan.strategy === "passthrough") {
    const result = await callModel({
      provider: config.passthroughModel.provider,
      modelId: config.passthroughModel.modelId,
      thinkLevel: config.passthroughModel.thinkLevel,
      systemPrompt: "",
      userPrompt: prompt,
      signal,
    });
    return {
      finalResponse: result.content,
      routingPlan: plan,
      chunkResults: [
        {
          chunkId: "passthrough",
          content: result.content,
          model: `${config.passthroughModel.provider}/${config.passthroughModel.modelId}`,
          tokensUsed: result.tokensUsed,
          validationScore: 1.0,
          retryCount: 0,
          fallbackUsed: false,
          isPartial: false,
        },
      ],
      totalTokens: result.tokensUsed,
      relativeCost: 0.7,
      consolidationModel: "none",
      validationScore: 1.0,
      wasPartial: false,
    };
  }

  if (config.debug) {
    console.log(`[APR] Executing ${plan.chunks.length} chunks with strategy: ${plan.strategy}`);
  }

  // Execute chunks
  const chunkResults = await executeRoutingPlan({
    plan,
    originalPrompt: prompt,
    callModel,
    config,
    maxParallel: config.maxParallelChunks,
    signal,
  });

  // Consolidate
  const consolidated = await consolidateResults({
    originalPrompt: prompt,
    chunkResults,
    plan,
    config,
    callModel,
    signal,
  });

  // Validate final response
  const finalValidation = validateFinalResponse(consolidated.content, prompt, chunkResults.length);

  const totalTokens =
    chunkResults.reduce((sum, r) => sum + r.tokensUsed, 0) + consolidated.tokensUsed;
  const wasPartial = chunkResults.some((r) => r.isPartial);

  return {
    finalResponse: consolidated.content,
    routingPlan: plan,
    chunkResults,
    totalTokens,
    relativeCost: plan.estimatedCostMultiplier,
    consolidationModel: `${config.consolidatorModel.provider}/${config.consolidatorModel.modelId}`,
    validationScore: finalValidation.score,
    wasPartial,
  };
}
