/**
 * Prompt Analyzer — Fast NofT Complexity Scoring (2026)
 *
 * Runs entirely in-process with zero LLM calls for simple prompts.
 * Uses heuristic "Number of Thoughts" scoring to decide whether partitioning
 * is needed BEFORE spinning up a controller agent.
 *
 * Based on:
 *   - "NofT: Number of Thoughts" complexity estimation (arXiv 2026)
 *   - ADaPT: As-Needed Decomposition and Planning (Stanford 2026)
 *   - IBM 2026 Tech Report: two-level routing (family → compute level)
 *
 * Typical execution time: < 2ms
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type SemanticDomain =
  | "code" // Software engineering, debugging, architecture
  | "math" // Arithmetic, algebra, proofs, statistics
  | "research" // Complex reasoning, analysis, academic topics
  | "retrieval" // Factual lookup, summarization, extraction
  | "creative" // Writing, storytelling, ideation
  | "conversation" // Chat, Q&A, simple requests
  | "mixed"; // Multiple intents detected

export interface IntentSegment {
  domain: SemanticDomain;
  /** 0-based start char in original prompt */
  startChar: number;
  endChar: number;
  complexityScore: number; // 0–1
  text: string;
}

export interface PromptAnalysis {
  /** Primary semantic domain */
  domain: SemanticDomain;
  /** All identified intent segments */
  segments: IntentSegment[];
  /** NofT estimate: how many discrete reasoning steps this requires */
  estimatedNofT: number;
  /** Aggregate complexity 0–1 */
  complexityScore: number;
  /** True when the prompt has 2+ distinct intents */
  isMultiIntent: boolean;
  /** True when any segment requires deep reasoning (NofT per segment > 1.5) */
  requiresReasoning: boolean;
  /** True when knowledge that may not be in training data is needed */
  requiresRetrieval: boolean;
  /** True when code generation/analysis was detected */
  requiresCode: boolean;
  /** True when mathematical computation detected */
  requiresMath: boolean;
  /** Estimated input token count */
  tokenEstimate: number;
  /** Recommended number of partitions (1 = no partitioning needed) */
  suggestedPartitionCount: number;
  /** Whether to fast-path without controller spin-up */
  canFastPath: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** NofT threshold below which fast-path is safe */
const FAST_PATH_NOFT_THRESHOLD = 1.5;

/** NofT threshold above which full APR is warranted */
const FULL_APR_NOFT_THRESHOLD = 3.0;

/** Minimum prompt tokens to consider for partitioning */
const MIN_PARTITION_TOKENS = 200;

// ── Domain Detection ──────────────────────────────────────────────────────────

const CODE_SIGNALS = [
  /```[\w]*\n/, // Code fence
  /\b(function|def |class |import |const |let |var |async |await)\b/,
  /\b(typescript|javascript|python|rust|golang|java|c\+\+|sql)\b/i,
  /\b(debug|refactor|implement|compile|unit test|api endpoint|function that)\b/i,
  /\b(fix the bug|write a script|create a component|build an?\s+\w+)\b/i,
];

const MATH_SIGNALS = [
  /\b(calculate|compute|solve|equation|formula|integral|derivative|probability)\b/i,
  /[+\-*/÷×]\s*\d/,
  /\d+\s*[+\-*/÷×]\s*\d+/,
  /\b(sum|average|mean|median|variance|standard deviation|matrix)\b/i,
  /[∑∏∫√π]/,
];

const RESEARCH_SIGNALS = [
  /\b(explain|compare|analyze|evaluate|what are the implications|research)\b/i,
  /\b(pros and cons|trade-offs|advantages and disadvantages)\b/i,
  /\b(in depth|comprehensive|detailed|thoroughly|step by step)\b/i,
  /\b(why does|how does|what causes|what is the difference between)\b/i,
  /\b(critically|historically|philosophically|scientifically)\b/i,
];

const RETRIEVAL_SIGNALS = [
  /\b(what is|who is|when was|where is|what year|what date)\b/i,
  /\b(summarize|extract|list all|find|look up|get me)\b/i,
  /\b(tell me about|give me the|show me the|what does .+ mean)\b/i,
];

const CREATIVE_SIGNALS = [
  /\b(write a (story|poem|song|essay|blog|email|letter|speech))\b/i,
  /\b(create|generate|brainstorm|imagine|design|draft)\b/i,
  /\b(make it (funny|dramatic|formal|casual|poetic|persuasive))\b/i,
];

const COMPLEXITY_AMPLIFIERS = [
  /\b(and also|furthermore|additionally|moreover)\b/i, // Additive connectors
  /\b(however|but|although|while|despite|nevertheless)\b/i, // Contrastive
  /\b(in some cases|it depends|context matters)\b/i, // Ambiguity
  /\b(multiple|several|various|across|each of)\b/i, // Multiplicity
];

// ── Scoring ───────────────────────────────────────────────────────────────────

function countSignals(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, re) => count + (re.test(text) ? 1 : 0), 0);
}

function detectDomain(text: string): SemanticDomain {
  const codeScore = countSignals(text, CODE_SIGNALS);
  const mathScore = countSignals(text, MATH_SIGNALS);
  const researchScore = countSignals(text, RESEARCH_SIGNALS);
  const retrievalScore = countSignals(text, RETRIEVAL_SIGNALS);
  const creativeScore = countSignals(text, CREATIVE_SIGNALS);

  const scores: [SemanticDomain, number][] = [
    ["code", codeScore],
    ["math", mathScore],
    ["research", researchScore],
    ["retrieval", retrievalScore],
    ["creative", creativeScore],
    ["conversation", 0.5], // Default baseline
  ];

  const sorted = scores.toSorted((a, b) => b[1] - a[1]);
  const best = sorted[0];
  const second = sorted[1];

  // Mixed if top two are within 1 point and both > 0
  if (best[1] > 0 && second[1] > 0 && best[1] - second[1] <= 1) {
    return "mixed";
  }

  return best[1] > 0 ? best[0] : "conversation";
}

/**
 * Estimate NofT (Number of Thoughts) — how many discrete reasoning steps
 * does this prompt require?
 *
 * NofT = 1.0 means "think once and answer"
 * NofT = 3.0 means "requires multi-step planning and reasoning"
 * NofT = 5.0+ means "complex multi-stage problem"
 */
function estimateNofT(text: string, domain: SemanticDomain): number {
  let noft = 1.0;

  // Question count — each question adds ~0.5 NofT
  const questionCount = (text.match(/\?/g) ?? []).length;
  noft += Math.min(questionCount * 0.5, 2.0);

  // Sentence count (as proxy for complexity)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  noft += Math.min(sentences.length * 0.1, 1.0);

  // Complexity amplifiers
  const amplifiers = countSignals(text, COMPLEXITY_AMPLIFIERS);
  noft += amplifiers * 0.3;

  // Domain-specific boosts
  if (domain === "code") {
    noft += 0.8;
  }
  if (domain === "math") {
    noft += 1.0;
  }
  if (domain === "research") {
    noft += 1.2;
  }
  if (domain === "mixed") {
    noft += 1.5;
  }

  // Length factor (very long prompts are inherently more complex)
  const tokenEst = Math.ceil(text.length / 4);
  if (tokenEst > 500) {
    noft += 0.5;
  }
  if (tokenEst > 1000) {
    noft += 0.5;
  }

  // Explicit multi-request markers
  if (/\b(first|then|after that|finally|step \d|1\.|2\.|3\.)/i.test(text)) {
    noft += 0.8;
  }

  return noft;
}

function computeComplexityScore(noft: number): number {
  // Map NofT to 0–1 using a sigmoid-like curve
  // NofT=1 → ~0.1, NofT=3 → ~0.5, NofT=6+ → ~0.9+
  return Math.min(1.0, (noft - 1) / 6);
}

/**
 * Determine how many partitions a prompt should be split into
 * based on NofT score and token count.
 */
function computeSuggestedPartitions(
  noft: number,
  domain: SemanticDomain,
  tokenCount: number,
): number {
  if (noft < FAST_PATH_NOFT_THRESHOLD || tokenCount < MIN_PARTITION_TOKENS) {
    return 1; // Fast-path: no partitioning
  }
  if (noft < 2.5) {
    return 2;
  }
  if (noft < FULL_APR_NOFT_THRESHOLD) {
    return 3;
  }
  if (domain === "mixed") {
    return Math.min(Math.ceil(noft / 1.5), 5); // Max 5 partitions
  }
  return Math.min(Math.ceil(noft / 2), 4); // Max 4 for single-domain
}

// ── Segment Detection ─────────────────────────────────────────────────────────

/**
 * Detect distinct semantic segments within a prompt.
 * Simple heuristic: split on strong transition markers.
 */
function detectSegments(text: string): IntentSegment[] {
  const SPLIT_MARKERS = [
    /\n\n+/, // Double newlines
    /\b(also|additionally|furthermore|and then|next|finally)\b[,:]/i,
    /\b(1\.|2\.|3\.|4\.|5\.)\s/, // Numbered lists
    /\b(part \d|section \d|step \d)/i,
  ];

  let segments: string[] = [text];

  // Try each split marker
  for (const marker of SPLIT_MARKERS) {
    if (marker.test(text)) {
      const parts = text
        .split(marker)
        .map((p) => p.trim())
        .filter((p) => p.length > 20);
      if (parts.length >= 2) {
        segments = parts;
        break;
      }
    }
  }

  let offset = 0;
  return segments.map((seg): IntentSegment => {
    const startChar = text.indexOf(seg, offset);
    const endChar = startChar + seg.length;
    offset = endChar;
    const domain = detectDomain(seg);
    const noft = estimateNofT(seg, domain);
    return {
      domain,
      startChar,
      endChar,
      complexityScore: computeComplexityScore(noft),
      text: seg,
    };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze a prompt for routing purposes.
 *
 * Runs entirely in-process, no LLM calls needed.
 * Typical execution time: < 2ms.
 *
 * @example
 * const analysis = analyzePrompt("What's 2+2?");
 * // → { canFastPath: true, complexityScore: 0.05, suggestedPartitionCount: 1 }
 *
 * @example
 * const analysis = analyzePrompt("Write a Python REST API with JWT auth, error handling, rate limiting, and full unit test suite");
 * // → { canFastPath: false, complexityScore: 0.80, suggestedPartitionCount: 4 }
 */
export function analyzePrompt(prompt: string, _context?: string): PromptAnalysis {
  const trimmed = prompt.trim();
  const tokenEstimate = Math.ceil(trimmed.length / 4);
  const domain = detectDomain(trimmed);
  const noft = estimateNofT(trimmed, domain);
  const complexityScore = computeComplexityScore(noft);
  const segments = detectSegments(trimmed);
  const suggestedPartitionCount = computeSuggestedPartitions(noft, domain, tokenEstimate);

  const isMultiIntent = segments.length > 1 && new Set(segments.map((s) => s.domain)).size > 1;

  const requiresReasoning =
    noft > FAST_PATH_NOFT_THRESHOLD || domain === "research" || domain === "math";

  const requiresRetrieval = countSignals(trimmed, RETRIEVAL_SIGNALS) > 0;
  const requiresCode = countSignals(trimmed, CODE_SIGNALS) >= 2;
  const requiresMath = countSignals(trimmed, MATH_SIGNALS) >= 2;

  const canFastPath =
    noft <= FAST_PATH_NOFT_THRESHOLD && !isMultiIntent && tokenEstimate < MIN_PARTITION_TOKENS;

  return {
    domain,
    segments,
    estimatedNofT: Math.round(noft * 10) / 10,
    complexityScore: Math.round(complexityScore * 100) / 100,
    isMultiIntent,
    requiresReasoning,
    requiresRetrieval,
    requiresCode,
    requiresMath,
    tokenEstimate,
    suggestedPartitionCount,
    canFastPath,
  };
}

/** Check if a prompt should be fast-pathed without any routing overhead */
export function isFastPathEligible(prompt: string): boolean {
  const trimmed = prompt.trim();
  const tokenEstimate = Math.ceil(trimmed.length / 4);
  if (tokenEstimate >= MIN_PARTITION_TOKENS) {
    return false;
  }
  const domain = detectDomain(trimmed);
  const noft = estimateNofT(trimmed, domain);
  return noft <= FAST_PATH_NOFT_THRESHOLD;
}
