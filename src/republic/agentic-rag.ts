/**
 * Republic Platform — Agentic RAG & Evaluation
 *
 * Phase 15: Agentic Retrieval-Augmented Generation with query routing,
 * retrieval grading, adaptive re-retrieval, and response evaluation.
 *
 * Research basis:
 * - Corrective RAG (CRAG): grade + re-retrieve if poor
 * - Self-RAG: self-reflection on retrieval quality
 * - Agentic RAG: LLM-driven query decomposition
 * - RAGAS: answer faithfulness / relevance metrics
 *
 * Key capabilities:
 * 1. agenticSearch() — multi-step query decomposition + retrieval
 * 2. gradeRetrieval() — scores retrieval relevance and completeness
 * 3. evaluateResponseQuality() — RAGAS-lite faithfulness + relevance check
 * 4. trackEvalMetrics() — rolling metric tracking per citizen
 */

import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type SearchSource = "memory" | "graph" | "web" | "documents" | "semantic";

export interface SearchResult {
  id: string;
  source: SearchSource;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RetrievalGrade {
  relevance: number;      // 0-1 how relevant to query
  completeness: number;   // 0-1 how complete the answer coverage
  confidence: number;     // 0-1 overall confidence
  needsReRetrieval: boolean;
  reasons: string[];
}

export interface AgenticSearchResult {
  id: string;
  query: string;
  subQueries: string[];
  results: SearchResult[];
  grade: RetrievalGrade;
  rounds: number;
  totalResults: number;
  durationMs: number;
}

export interface ResponseEvaluation {
  faithfulness: number;   // 0-1 how well answer follows sources
  relevance: number;      // 0-1 how relevant to question
  completeness: number;   // 0-1 coverage
  harmfulness: number;    // 0-1 potential harm score (0 = safe)
  overall: number;        // 0-1 composite
  feedback: string[];
}

export interface EvalMetricEntry {
  citizenId: string;
  tick: number;
  faithfulness: number;
  relevance: number;
  completeness: number;
  timestamp: string;
}

export interface RAGDiagnostics {
  totalSearches: number;
  avgRelevance: number;
  avgCompleteness: number;
  reRetrievalRate: number;
  totalEvals: number;
  avgFaithfulness: number;
}

// ─── State ──────────────────────────────────────────────────────

const searchLog: AgenticSearchResult[] = [];
const evalMetrics: EvalMetricEntry[] = [];
const MAX_SEARCH_LOG = 500;
const MAX_EVAL_LOG = 2000;
const RETRIEVAL_THRESHOLD = 0.5;
const MAX_RE_RETRIEVAL_ROUNDS = 3;

// ─── Search Sources Registry ────────────────────────────────────

type SearchProvider = (query: string, topK: number) => SearchResult[];
const searchProviders = new Map<SearchSource, SearchProvider>();

/**
 * Register a search source provider (called by other modules).
 */
export function registerSearchProvider(source: SearchSource, provider: SearchProvider): void {
  searchProviders.set(source, provider);
}

// ─── Query Decomposition ────────────────────────────────────────

/**
 * Decompose a complex query into sub-queries.
 * Uses heuristic decomposition (keyword extraction + aspect splitting).
 */
export function decomposeQuery(query: string): string[] {
  const subQueries: string[] = [query]; // always include original

  // Split on conjunctions and question marks
  const parts = query.split(/\b(?:and|or|also|plus|additionally|furthermore)\b/i);
  if (parts.length > 1) {
    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.length > 10) {subQueries.push(trimmed);}
    }
  }

  // Extract "what/how/why/when" sub-questions
  const questionPattern = /(?:what|how|why|when|where|who|which)\s+[^?.]+[?.]/gi;
  let match: RegExpExecArray | null;
  while ((match = questionPattern.exec(query)) !== null) {
    const sq = match[0].trim().replace(/[?.]+$/, "");
    if (sq.length > 8 && !subQueries.includes(sq)) {subQueries.push(sq);}
  }

  return [...new Set(subQueries)].slice(0, 5);
}

// ─── Retrieval Grading ──────────────────────────────────────────

/**
 * Grade retrieval quality using term overlap and coverage analysis.
 */
export function gradeRetrieval(query: string, results: SearchResult[]): RetrievalGrade {
  if (results.length === 0) {
    return {
      relevance: 0,
      completeness: 0,
      confidence: 0,
      needsReRetrieval: true,
      reasons: ["No results found"],
    };
  }

  const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const reasons: string[] = [];

  // Relevance: how many query terms appear in results
  let termHits = 0;
  const allContent = results.map(r => r.content.toLowerCase()).join(" ");
  for (const term of queryTerms) {
    if (allContent.includes(term)) {termHits++;}
  }
  const relevance = queryTerms.length > 0 ? termHits / queryTerms.length : 0.5;

  // Completeness: weighted by result scores
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const completeness = Math.min(1, avgScore * (Math.min(results.length, 5) / 5));

  // Confidence: geometric mean of relevance and completeness
  const confidence = Math.sqrt(relevance * completeness);

  if (relevance < 0.3) {reasons.push("Low term overlap with query");}
  if (completeness < 0.3) {reasons.push("Low result scores");}
  if (results.length < 2) {reasons.push("Too few results");}

  const needsReRetrieval = confidence < RETRIEVAL_THRESHOLD;
  if (needsReRetrieval) {reasons.push("Below confidence threshold — re-retrieval recommended");}

  return { relevance, completeness, confidence, needsReRetrieval, reasons };
}

// ─── Agentic Search ─────────────────────────────────────────────

/**
 * Perform an agentic search with query decomposition, multi-source retrieval,
 * grading, and adaptive re-retrieval.
 */
export function agenticSearch(
  query: string,
  opts?: { topK?: number; sources?: SearchSource[]; maxRounds?: number },
): AgenticSearchResult {
  const startMs = Date.now();
  const topK = opts?.topK ?? 10;
  const sources = opts?.sources ?? [...searchProviders.keys()];
  const maxRounds = opts?.maxRounds ?? MAX_RE_RETRIEVAL_ROUNDS;

  const subQueries = decomposeQuery(query);
  let allResults: SearchResult[] = [];
  let grade: RetrievalGrade = { relevance: 0, completeness: 0, confidence: 0, needsReRetrieval: true, reasons: [] };
  let round = 0;

  while (round < maxRounds) {
    round++;

    // Retrieve from all sources for each sub-query
    for (const sq of subQueries) {
      for (const source of sources) {
        const provider = searchProviders.get(source);
        if (!provider) {continue;}

        try {
          const results = provider(sq, topK);
          allResults.push(...results);
        } catch {
          // Provider failed — skip silently
        }
      }
    }

    // Deduplicate by content
    const seen = new Set<string>();
    allResults = allResults.filter(r => {
      const key = r.content.slice(0, 100);
      if (seen.has(key)) {return false;}
      seen.add(key);
      return true;
    });

    // Sort by score
    allResults.sort((a, b) => b.score - a.score);
    allResults = allResults.slice(0, topK);

    // Grade
    grade = gradeRetrieval(query, allResults);

    if (!grade.needsReRetrieval) {break;}

    // For re-retrieval, broaden the query
    if (round < maxRounds) {
      const broadenedTerms = query.split(/\W+/).filter(t => t.length > 3).slice(0, 3);
      subQueries.push(broadenedTerms.join(" "));
    }
  }

  const result: AgenticSearchResult = {
    id: `rag-${uid().slice(0, 8)}`,
    query,
    subQueries,
    results: allResults,
    grade,
    rounds: round,
    totalResults: allResults.length,
    durationMs: Date.now() - startMs,
  };

  searchLog.push(result);
  if (searchLog.length > MAX_SEARCH_LOG) {searchLog.shift();}

  return result;
}

// ─── Response Evaluation ────────────────────────────────────────

/**
 * Evaluate response quality (RAGAS-lite).
 * Scores faithfulness (grounded in sources), relevance, completeness, and harmfulness.
 */
export function evaluateResponseQuality(
  question: string,
  answer: string,
  sources: string[],
): ResponseEvaluation {
  const feedback: string[] = [];

  // Faithfulness: how many answer sentences are grounded in sources
  const answerSentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const sourceText = sources.join(" ").toLowerCase();
  let groundedCount = 0;
  for (const sentence of answerSentences) {
    const terms = sentence.toLowerCase().split(/\W+/).filter(t => t.length > 3);
    const groundedTerms = terms.filter(t => sourceText.includes(t));
    if (terms.length > 0 && groundedTerms.length / terms.length > 0.4) {
      groundedCount++;
    }
  }
  const faithfulness = answerSentences.length > 0
    ? groundedCount / answerSentences.length
    : 0;

  if (faithfulness < 0.5) {feedback.push("Answer may contain hallucinated content not found in sources");}

  // Relevance: term overlap between question and answer
  const questionTerms = question.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const answerLower = answer.toLowerCase();
  let relevanceHits = 0;
  for (const term of questionTerms) {
    if (answerLower.includes(term)) {relevanceHits++;}
  }
  const relevance = questionTerms.length > 0 ? relevanceHits / questionTerms.length : 0.5;

  if (relevance < 0.4) {feedback.push("Answer may not directly address the question");}

  // Completeness: is the answer substantial?
  const wordCount = answer.split(/\s+/).length;
  const completeness = Math.min(1, wordCount / 50); // assume 50+ words is complete

  if (completeness < 0.3) {feedback.push("Answer is too brief");}

  // Harmfulness: check for common harmful patterns
  const harmPatterns = [
    /\b(?:hack|exploit|bypass|steal|illegal)\b/i,
    /\b(?:password|credentials|secret.?key)\b/i,
  ];
  let harmScore = 0;
  for (const pattern of harmPatterns) {
    if (pattern.test(answer)) {harmScore += 0.3;}
  }
  const harmfulness = Math.min(1, harmScore);
  if (harmfulness > 0.3) {feedback.push("Answer may contain potentially harmful content");}

  const overall = (faithfulness * 0.35 + relevance * 0.3 + completeness * 0.25 + (1 - harmfulness) * 0.1);

  if (feedback.length === 0) {feedback.push("Response quality is good");}

  return { faithfulness, relevance, completeness, harmfulness, overall, feedback };
}

// ─── Metric Tracking ────────────────────────────────────────────

/**
 * Track evaluation metrics for a citizen over time.
 */
export function trackEvalMetrics(
  citizenId: string,
  tick: number,
  evaluation: ResponseEvaluation,
): void {
  evalMetrics.push({
    citizenId,
    tick,
    faithfulness: evaluation.faithfulness,
    relevance: evaluation.relevance,
    completeness: evaluation.completeness,
    timestamp: ts(),
  });

  if (evalMetrics.length > MAX_EVAL_LOG) {
    evalMetrics.splice(0, evalMetrics.length - MAX_EVAL_LOG);
  }
}

/**
 * Get evaluation trend for a citizen.
 */
export function getEvalTrend(citizenId: string, windowSize: number = 10): {
  avgFaithfulness: number;
  avgRelevance: number;
  avgCompleteness: number;
  trend: "improving" | "declining" | "stable";
  dataPoints: number;
} {
  const citizenMetrics = evalMetrics.filter(m => m.citizenId === citizenId);
  const recent = citizenMetrics.slice(-windowSize);

  if (recent.length === 0) {
    return { avgFaithfulness: 0, avgRelevance: 0, avgCompleteness: 0, trend: "stable", dataPoints: 0 };
  }

  const avgFaithfulness = recent.reduce((s, m) => s + m.faithfulness, 0) / recent.length;
  const avgRelevance = recent.reduce((s, m) => s + m.relevance, 0) / recent.length;
  const avgCompleteness = recent.reduce((s, m) => s + m.completeness, 0) / recent.length;

  // Trend: compare first half vs second half
  let trend: "improving" | "declining" | "stable" = "stable";
  if (recent.length >= 4) {
    const mid = Math.floor(recent.length / 2);
    const firstHalf = recent.slice(0, mid);
    const secondHalf = recent.slice(mid);
    const firstAvg = firstHalf.reduce((s, m) => s + m.faithfulness, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, m) => s + m.faithfulness, 0) / secondHalf.length;
    if (secondAvg > firstAvg + 0.05) {trend = "improving";}
    else if (secondAvg < firstAvg - 0.05) {trend = "declining";}
  }

  return { avgFaithfulness, avgRelevance, avgCompleteness, trend, dataPoints: recent.length };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function ragDiagnostics(): RAGDiagnostics {
  const searches = searchLog.length;
  const avgRel = searches > 0 ? searchLog.reduce((s, r) => s + r.grade.relevance, 0) / searches : 0;
  const avgComp = searches > 0 ? searchLog.reduce((s, r) => s + r.grade.completeness, 0) / searches : 0;
  const reRetrievals = searchLog.filter(r => r.rounds > 1).length;

  return {
    totalSearches: searches,
    avgRelevance: avgRel,
    avgCompleteness: avgComp,
    reRetrievalRate: searches > 0 ? reRetrievals / searches : 0,
    totalEvals: evalMetrics.length,
    avgFaithfulness: evalMetrics.length > 0
      ? evalMetrics.reduce((s, m) => s + m.faithfulness, 0) / evalMetrics.length
      : 0,
  };
}

// ─── State Reset (Testing) ──────────────────────────────────────

export function resetRAGState(): void {
  searchLog.length = 0;
  evalMetrics.length = 0;
  searchProviders.clear();
}
