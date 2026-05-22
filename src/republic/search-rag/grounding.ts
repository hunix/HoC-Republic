/**
 * Search + RAG — Grounding Classifier
 *
 * Determines whether a user query needs live web search or can be
 * answered from model knowledge alone. Uses lightweight keyword
 * heuristics and temporal signals — no LLM call required.
 */

import type { GroundingSignals, GroundingDecision } from "./types.js";

// ─── Temporal Signals ────────────────────────────────────────────

const RECENCY_PATTERNS = [
  /\b(today|yesterday|this\s+week|this\s+month|latest|recent|current|now)\b/i,
  /\b(2026|2025|breaking|just|new)\b/i,
  /\b(what\s+happened|what's\s+new|any\s+updates?|latest\s+news)\b/i,
  /\b(stock\s+price|weather|score|election|release\s+date)\b/i,
];

// ─── Factual Signals ─────────────────────────────────────────────

const FACTUAL_PATTERNS = [
  /\b(how\s+much|how\s+many|what\s+is\s+the|who\s+is|where\s+is)\b/i,
  /\b(population|price|gdp|revenue|statistics?|data|numbers?)\b/i,
  /\b(compare|vs\.?|versus|difference\s+between)\b/i,
  /\b(official|documentation|api|specs?|specification)\b/i,
];

// ─── Named Entity Signals ────────────────────────────────────────

const ENTITY_PATTERNS = [
  /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/, // Capitalized multi-word names
  /\b(?:Google|Apple|Microsoft|Amazon|Meta|OpenAI|Tesla|Nvidia)\b/i,
  /\b(?:Biden|Trump|Putin|Modi|congress|parliament|senate)\b/i,
  /\b(?:iPhone|Android|Windows|Linux|macOS|Chrome|Firefox)\b/i,
];

// ─── Knowledge-Safe Signals ──────────────────────────────────────

const MODEL_KNOWLEDGE_PATTERNS = [
  /\b(explain|how\s+does?|what\s+are|concept|theory|principle)\b/i,
  /\b(write|create|generate|compose|draft|build)\b/i,
  /\b(code|function|algorithm|implement|program)\b/i,
  /\b(translate|summarize|rewrite|paraphrase)\b/i,
  /\b(history\s+of|origin\s+of|meaning\s+of)\b/i,
  /\b(help\s+me|can\s+you|please)\b/i,
];

// ─── Grounding Classifier ────────────────────────────────────────

/**
 * Classify whether a query needs web search grounding.
 * Pure heuristic — no LLM call, sub-millisecond.
 */
export function classifyGrounding(query: string): GroundingSignals {
  const isRecent = RECENCY_PATTERNS.some((p) => p.test(query));
  const isFactual = FACTUAL_PATTERNS.some((p) => p.test(query));
  const hasNamedEntities = ENTITY_PATTERNS.some((p) => p.test(query));
  const isModelKnowledge = MODEL_KNOWLEDGE_PATTERNS.some((p) => p.test(query));

  // Scoring
  let searchScore = 0;
  if (isRecent) {
    searchScore += 0.4;
  }
  if (isFactual) {
    searchScore += 0.25;
  }
  if (hasNamedEntities) {
    searchScore += 0.2;
  }
  if (isModelKnowledge) {
    searchScore -= 0.35;
  }

  // Short queries with question marks lean toward search
  if (query.includes("?") && query.split(" ").length < 10) {
    searchScore += 0.1;
  }

  // URLs in query = definitely needs web
  if (/https?:\/\//.test(query)) {
    searchScore += 0.5;
  }

  let decision: GroundingDecision;
  let confidence: number;

  if (searchScore >= 0.4) {
    decision = "needs_search";
    confidence = Math.min(searchScore, 1);
  } else if (searchScore <= 0.1) {
    decision = "model_knowledge";
    confidence = 1 - searchScore;
  } else {
    decision = "uncertain";
    confidence = 0.5;
  }

  return {
    isRecent,
    isFactual,
    hasNamedEntities,
    confidence: Math.max(0, Math.min(1, confidence)),
    decision,
  };
}

/**
 * Quick check: does this query need web search?
 */
export function needsSearch(query: string): boolean {
  const signals = classifyGrounding(query);
  return signals.decision === "needs_search";
}
