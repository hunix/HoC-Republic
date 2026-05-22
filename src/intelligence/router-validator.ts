/**
 * Router Validator — Per-Gate Response Validation (2026)
 *
 * Validates responses at every transition in the APR pipeline:
 *   1. Controller output → RoutingPlan schema validation
 *   2. Each chunk response → completeness + format + length sanity
 *   3. Consolidation input → contradiction detection between parts
 *   4. Final response → coherence + full coverage check
 *
 * Validation is fast (~1ms heuristic) and does not require an LLM call
 * for most cases. LLM-assisted validation is optional for high-stakes chunks.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ValidationGate =
  | "routing_plan" // Validate controller JSON output
  | "chunk_response" // Validate individual model response
  | "consolidation" // Validate consolidated response coherence
  | "final_response"; // Validate complete deliverable

export type ValidationIssueType =
  | "incomplete" // Response doesn't address the prompt
  | "off_topic" // Response drifts from the chunk intent
  | "contradiction" // Contradicts another chunk's output
  | "format_mismatch" // Doesn't match expected output schema
  | "too_short" // Suspiciously brief (likely truncated)
  | "too_long" // Padding or runaway generation
  | "json_invalid" // RoutingPlan or structured output is not valid JSON
  | "missing_coverage" // Final response doesn't cover original prompt intent
  | "seam_quality"; // Consolidation stitching is rough/noticeable

export interface ValidationIssue {
  type: ValidationIssueType;
  severity: "low" | "medium" | "high" | "critical";
  detail: string;
  /** Character offset in the response where the issue was detected (optional) */
  location?: number;
}

export type ValidationRecommendation =
  | "accept" // Pass — use this response
  | "retry" // Retry the same model (transient issue likely)
  | "fallback" // Use the next fallback model
  | "escalate" // Send to max-capability model in the chain
  | "partial"; // Accept partial result, flag gaps explicitly

export interface ValidationResult {
  gate: ValidationGate;
  passed: boolean;
  score: number; // 0–1, where 1.0 = perfect
  issues: ValidationIssue[];
  recommendation: ValidationRecommendation;
  /** For chunk_response: estimated coverage of the chunk prompt (0-1) */
  coverageEstimate?: number;
  /** For contradiction checks: which chunk IDs it contradicts */
  contradicts?: string[];
}

// ── RoutingPlan Validation ────────────────────────────────────────────────────

export interface RoutingPlanShape {
  chunks: Array<{
    id: string;
    content: string;
    intent?: string;
    complexityScore?: number;
    /** IDs of other chunks whose output this chunk needs — preserved from controller output */
    requiresContext?: string[];
    assignment?: {
      provider: string;
      modelId: string;
      thinkLevel?: string;
    };
  }>;
  strategy?: string;
}

/**
 * Validate the controller agent's RoutingPlan JSON output.
 */
export function validateRoutingPlan(rawOutput: string): ValidationResult & {
  plan?: RoutingPlanShape;
} {
  const issues: ValidationIssue[] = [];

  // Parse JSON
  let plan: RoutingPlanShape | undefined;
  try {
    plan = JSON.parse(rawOutput) as RoutingPlanShape;
  } catch {
    return {
      gate: "routing_plan",
      passed: false,
      score: 0,
      issues: [
        {
          type: "json_invalid",
          severity: "critical",
          detail: `Controller output is not valid JSON. First 100 chars: ${rawOutput.slice(0, 100)}`,
        },
      ],
      recommendation: "retry",
    };
  }

  // Validate structure
  if (!Array.isArray(plan.chunks)) {
    issues.push({
      type: "json_invalid",
      severity: "critical",
      detail: "RoutingPlan missing 'chunks' array",
    });
  } else {
    if (plan.chunks.length === 0) {
      issues.push({ type: "incomplete", severity: "high", detail: "RoutingPlan has 0 chunks" });
    }
    for (const [i, chunk] of plan.chunks.entries()) {
      if (!chunk.id) {
        issues.push({
          type: "json_invalid",
          severity: "medium",
          detail: `Chunk ${i} missing 'id'`,
        });
      }
      if (!chunk.content || chunk.content.trim().length < 5) {
        issues.push({
          type: "incomplete",
          severity: "high",
          detail: `Chunk ${i} has empty content`,
        });
      }
      if (!chunk.assignment?.provider || !chunk.assignment?.modelId) {
        issues.push({
          type: "json_invalid",
          severity: "medium",
          detail: `Chunk ${i} missing model assignment`,
        });
      }
    }
  }

  const criticals = issues.filter((i) => i.severity === "critical").length;
  const highs = issues.filter((i) => i.severity === "high").length;

  const score = Math.max(0, 1 - (criticals * 0.5 + highs * 0.2 + issues.length * 0.05));
  const passed = criticals === 0 && highs === 0;
  const recommendation = criticals > 0 ? "retry" : highs > 0 ? "retry" : "accept";

  return { gate: "routing_plan", passed, score, issues, recommendation, plan };
}
/**
 * Validate the dependency graph of a routing plan.
 *
 * Checks:
 * - No self-loops (chunk depends on itself)
 * - No orphaned dependency references (dep ID doesn't exist in plan)
 * - No cyclic dependencies (chunk A → B → A)
 *
 * Returns a ValidationResult. Callers should fail-fast or strip bad deps on failure.
 */
export function validateDependencyGraph(
  chunks: Array<{ id: string; requiresContext: string[] }>,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const chunkIds = new Set(chunks.map((c) => c.id));

  // Check for self-loops and orphaned references
  for (const chunk of chunks) {
    for (const dep of chunk.requiresContext) {
      if (dep === chunk.id) {
        issues.push({
          type: "json_invalid",
          severity: "critical",
          detail: `Chunk "${chunk.id}" has a self-loop dependency`,
        });
      } else if (!chunkIds.has(dep)) {
        issues.push({
          type: "json_invalid",
          severity: "high",
          detail: `Chunk "${chunk.id}" references unknown dependency "${dep}"`,
        });
      }
    }
  }

  // Cycle detection via DFS coloring (white=0, grey=1, black=2)
  const color = new Map(chunks.map((c) => [c.id, 0]));
  const byId = new Map(chunks.map((c) => [c.id, c]));
  let hasCycle = false;

  function dfs(id: string) {
    if (color.get(id) === 2) {
      return;
    } // already fully processed
    if (color.get(id) === 1) {
      // Back edge — cycle detected
      hasCycle = true;
      issues.push({
        type: "json_invalid",
        severity: "critical",
        detail: `Cyclic dependency detected involving chunk "${id}"`,
      });
      return;
    }
    color.set(id, 1); // grey: in progress
    for (const dep of byId.get(id)?.requiresContext ?? []) {
      dfs(dep);
    }
    color.set(id, 2); // black: done
  }

  for (const chunk of chunks) {
    dfs(chunk.id);
  }

  const criticals = issues.filter((i) => i.severity === "critical").length;
  const score = Math.max(
    0,
    1 - criticals * 0.5 - issues.filter((i) => i.severity === "high").length * 0.2,
  );

  return {
    gate: "routing_plan",
    passed: !hasCycle && criticals === 0,
    score,
    issues,
    recommendation: hasCycle || criticals > 0 ? "retry" : "accept",
  };
}

export interface ChunkValidationContext {
  chunkId: string;
  originalPrompt: string;
  intent: string;
  complexityScore: number;
  /** Expected JSON schema (when structuredOutput was requested) */
  expectedSchema?: string;
  /** Minimum acceptable response length in tokens */
  minTokens?: number;
  /** Maximum acceptable response length in tokens */
  maxTokens?: number;
}

/**
 * Validate an individual chunk response from a model.
 */
export function validateChunkResponse(
  response: string,
  ctx: ChunkValidationContext,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const responseTokens = Math.ceil(response.trim().length / 4);

  const minTokens = ctx.minTokens ?? 20;
  const maxTokens = ctx.maxTokens ?? 8000;

  // Length checks
  if (responseTokens < minTokens) {
    issues.push({
      type: "too_short",
      severity: "high",
      detail: `Response is ${responseTokens} tokens, minimum expected ${minTokens}. Likely truncated or empty.`,
    });
  }
  if (responseTokens > maxTokens) {
    issues.push({
      type: "too_long",
      severity: "low",
      detail: `Response is ${responseTokens} tokens, above ${maxTokens} maximum. Check for padding.`,
    });
  }

  // Off-topic detection: check if response mentions key terms from the prompt
  const promptKeywords = extractKeywords(ctx.originalPrompt);
  const responseText = response.toLowerCase();
  const coveredKeywords = promptKeywords.filter((kw) => responseText.includes(kw));
  const coverageEstimate =
    promptKeywords.length > 0 ? coveredKeywords.length / promptKeywords.length : 1.0;

  if (coverageEstimate < 0.2 && promptKeywords.length >= 3) {
    issues.push({
      type: "off_topic",
      severity: "medium",
      detail: `Response covers only ${Math.round(coverageEstimate * 100)}% of prompt keywords. Possible hallucination or topic drift.`,
    });
  }

  // JSON schema validation (when structured output was requested)
  if (ctx.expectedSchema && ctx.intent === "structured") {
    try {
      JSON.parse(response.trim());
    } catch {
      // Check if it's wrapped in code fences
      const fenceMatch = response.match(/```(?:json)?\n?([\s\S]+?)\n?```/);
      if (fenceMatch) {
        try {
          JSON.parse(fenceMatch[1].trim());
        } catch {
          issues.push({
            type: "format_mismatch",
            severity: "high",
            detail: "Structured output request but response is not valid JSON",
          });
        }
      } else {
        issues.push({
          type: "format_mismatch",
          severity: "medium",
          detail: "Structured output requested but response not in JSON format",
        });
      }
    }
  }

  // Incompleteness heuristics
  const endsAbruptly =
    response.trim().endsWith("...") ||
    response.trim().endsWith(",") ||
    response.trim().endsWith("and ");
  if (endsAbruptly) {
    issues.push({
      type: "incomplete",
      severity: "medium",
      detail: "Response ends abruptly — possible generation cutoff",
    });
  }

  const score = computeValidationScore(issues, coverageEstimate);
  const passed = !issues.some((i) => i.severity === "critical" || i.severity === "high");
  const recommendation = deriveRecommendation(issues, "chunk_response");

  return {
    gate: "chunk_response",
    passed,
    score,
    issues,
    recommendation,
    coverageEstimate,
  };
}

// ── Contradiction Detection ───────────────────────────────────────────────────

export interface ChunkOutput {
  chunkId: string;
  content: string;
  domain: string;
}

/**
 * Detect contradictions between chunk outputs before consolidation.
 * Returns issues with which chunk IDs contradict each other.
 */
export function validateForContradictions(chunks: ChunkOutput[]): ValidationResult {
  const issues: ValidationIssue[] = [];
  const contradictsMap: Map<string, Set<string>> = new Map();

  // Simple heuristic: look for assertion pairs that directly negate each other
  const NEGATION_PATTERNS = [
    [/\bshould\b/, /\bshould not\b/],
    [/\bis (a|an|the)\b/, /\bis not (a|an|the)\b/],
    [/\bwill\b/, /\bwill not\b/],
    [/\bmust\b/, /\bmust not\b/],
    [/\bcan\b/, /\bcannot\b/],
    [/\brecommend\b/, /\bnot recommend\b/],
  ];

  for (let i = 0; i < chunks.length - 1; i++) {
    for (let j = i + 1; j < chunks.length; j++) {
      const a = chunks[i];
      const b = chunks[j];

      for (const [pos, neg] of NEGATION_PATTERNS) {
        const aHasPos = pos.test(a.content);
        const bHasNeg = neg.test(b.content);
        const aHasNeg = neg.test(a.content);
        const bHasPos = pos.test(b.content);

        if ((aHasPos && bHasNeg) || (aHasNeg && bHasPos)) {
          issues.push({
            type: "contradiction",
            severity: "medium",
            detail: `Possible contradiction between chunk ${a.chunkId} and ${b.chunkId}`,
          });

          if (!contradictsMap.has(a.chunkId)) {
            contradictsMap.set(a.chunkId, new Set());
          }
          if (!contradictsMap.has(b.chunkId)) {
            contradictsMap.set(b.chunkId, new Set());
          }
          contradictsMap.get(a.chunkId)!.add(b.chunkId);
          contradictsMap.get(b.chunkId)!.add(a.chunkId);
        }
      }
    }
  }

  const contradicts = Array.from(contradictsMap.keys());
  const score = Math.max(0, 1 - issues.length * 0.15);
  const passed =
    issues.filter((i) => i.severity === "high" || i.severity === "critical").length === 0;

  return {
    gate: "consolidation",
    passed,
    score,
    issues,
    recommendation: issues.length > 2 ? "escalate" : "accept",
    contradicts: contradicts.length > 0 ? contradicts : undefined,
  };
}

// ── Final Response Validation ─────────────────────────────────────────────────

/**
 * Validate the final consolidated response against the original prompt.
 */
export function validateFinalResponse(
  finalResponse: string,
  originalPrompt: string,
  _chunkCount: number,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const responseTokens = Math.ceil(finalResponse.trim().length / 4);
  const promptTokens = Math.ceil(originalPrompt.trim().length / 4);

  // Coverage check
  const promptKeywords = extractKeywords(originalPrompt);
  const covered = promptKeywords.filter((kw) => finalResponse.toLowerCase().includes(kw));
  const coverage = promptKeywords.length > 0 ? covered.length / promptKeywords.length : 1.0;

  if (coverage < 0.4) {
    issues.push({
      type: "missing_coverage",
      severity: "high",
      detail: `Final response covers only ${Math.round(coverage * 100)}% of original prompt intent.`,
    });
  }

  // Length sanity: response should be proportional to prompt complexity
  const minExpected = Math.max(50, promptTokens * 0.5);
  if (responseTokens < minExpected) {
    issues.push({
      type: "too_short",
      severity: "medium",
      detail: `Final response (${responseTokens} tokens) may be too short for the prompt complexity.`,
    });
  }

  // Seam quality: look for obvious stitching artifacts
  const SEAM_ARTIFACTS = [
    /\[Part \d\]/i,
    /\[Chunk \d\]/i,
    /--- (Part|Section) ---/i,
    /\n\n\n\n/, // Triple blank lines = bad stitching
  ];
  for (const artifact of SEAM_ARTIFACTS) {
    if (artifact.test(finalResponse)) {
      issues.push({
        type: "seam_quality",
        severity: "low",
        detail: "Consolidation seams are visible in the final response",
      });
      break;
    }
  }

  const score = computeValidationScore(issues, coverage);
  const passed = !issues.some((i) => i.severity === "critical" || i.severity === "high");

  return {
    gate: "final_response",
    passed,
    score: Math.max(score, coverage * 0.8),
    issues,
    recommendation: deriveRecommendation(issues, "final_response"),
    coverageEstimate: coverage,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "to",
    "of",
    "and",
    "or",
    "in",
    "on",
    "at",
    "for",
    "with",
    "this",
    "that",
    "it",
    "i",
    "you",
    "we",
    "they",
    "what",
    "how",
    "why",
    "when",
    "where",
    "who",
    "which",
    "can",
    "will",
    "should",
    "would",
    "please",
    "help",
    "me",
    "my",
    "your",
    "our",
    "their",
    "its",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w))
    .slice(0, 20); // Top 20 keywords
}

function computeValidationScore(issues: ValidationIssue[], coverage: number): number {
  const criticals = issues.filter((i) => i.severity === "critical").length;
  const highs = issues.filter((i) => i.severity === "high").length;
  const mediums = issues.filter((i) => i.severity === "medium").length;
  const base = Math.max(0, 1 - (criticals * 0.4 + highs * 0.2 + mediums * 0.1));
  return Math.min(1, base * 0.6 + coverage * 0.4);
}

function deriveRecommendation(
  issues: ValidationIssue[],
  _gate: ValidationGate,
): ValidationRecommendation {
  if (issues.some((i) => i.severity === "critical")) {
    return "fallback";
  }
  if (issues.some((i) => i.severity === "high")) {
    return "retry";
  }
  if (issues.filter((i) => i.severity === "medium").length >= 3) {
    return "retry";
  }
  return "accept";
}
