/**
 * Search + RAG — Core Orchestrator
 *
 * Pipeline: Query → Grounding → Search → Scrape → Chunk → Rank → Synthesize
 *
 * Integrates with the existing sandbox web_search/web_scrape tools for
 * the actual web access, and the cloud inference layer for synthesis.
 */

import type {
  SearchQuery,
  SearchResult,
  RAGChunk,
  GroundedAnswer,
  SearchRAGDiagnostics,
} from "./types.js";
import { buildCitations, formatCitationsMarkdown, insertCitationMarkers } from "./citations.js";
import { classifyGrounding, needsSearch } from "./grounding.js";

// ─── Stats ───────────────────────────────────────────────────────

let totalQueries = 0;
let groundedQueries = 0;
let totalLatencyMs = 0;
let totalSources = 0;
let cacheHits = 0;

// ─── Result Cache ────────────────────────────────────────────────

const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE = 100;

function getCachedResults(query: string): SearchResult[] | null {
  const key = query.toLowerCase().trim();
  const cached = searchCache.get(key);
  if (!cached) {
    return null;
  }
  if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  cacheHits++;
  return cached.results;
}

function cacheResults(query: string, results: SearchResult[]): void {
  if (searchCache.size >= MAX_CACHE) {
    const oldest = searchCache.keys().next().value;
    if (oldest) {
      searchCache.delete(oldest);
    }
  }
  searchCache.set(query.toLowerCase().trim(), { results, timestamp: Date.now() });
}

// ─── Chunking ────────────────────────────────────────────────────

const CHUNK_SIZE = 500; // characters per chunk
const CHUNK_OVERLAP = 50;

/** Split scraped content into overlapping chunks */
export function chunkContent(content: string, sourceUrl: string, sourceTitle: string): RAGChunk[] {
  const text = content.replace(/\s+/g, " ").trim();
  if (text.length <= CHUNK_SIZE) {
    return [{ text, sourceUrl, sourceTitle, chunkIndex: 0, similarity: 0 }];
  }

  const chunks: RAGChunk[] = [];
  let offset = 0;
  let index = 0;

  while (offset < text.length) {
    const end = Math.min(offset + CHUNK_SIZE, text.length);
    // Try to break at sentence boundary
    let breakPoint = end;
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      if (lastPeriod > offset + CHUNK_SIZE * 0.5) {
        breakPoint = lastPeriod + 1;
      }
    }

    chunks.push({
      text: text.slice(offset, breakPoint).trim(),
      sourceUrl,
      sourceTitle,
      chunkIndex: index++,
      similarity: 0,
    });

    offset = breakPoint - CHUNK_OVERLAP;
    if (offset >= text.length) {
      break;
    }
  }

  return chunks;
}

/** Rank chunks by keyword relevance to query (lightweight, no embeddings) */
export function rankChunks(chunks: RAGChunk[], query: string, topK = 10): RAGChunk[] {
  const queryWords = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  );

  const scored = chunks.map((chunk) => {
    const words = chunk.text.toLowerCase().split(/\W+/);
    let matches = 0;
    for (const w of words) {
      if (queryWords.has(w)) {
        matches++;
      }
    }
    const similarity = queryWords.size > 0 ? matches / queryWords.size : 0;
    return { ...chunk, similarity };
  });

  return scored.toSorted((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// ─── Search Integration ──────────────────────────────────────────

type SearchFn = (query: string, maxResults: number) => Promise<SearchResult[]>;
type ScrapeFn = (url: string) => Promise<string>;

/**
 * Full Search + RAG pipeline.
 *
 * @param query - User's natural language question
 * @param searchFn - Function to perform web search (injected from sandbox tools)
 * @param scrapeFn - Function to scrape a URL (injected from sandbox tools)
 * @param synthesizeFn - Function to generate answer from context (injected from LLM)
 */
export async function groundedSearch(
  query: SearchQuery,
  searchFn: SearchFn,
  scrapeFn: ScrapeFn,
  synthesizeFn: (prompt: string) => Promise<string>,
): Promise<GroundedAnswer> {
  const start = performance.now();
  totalQueries++;

  // Step 1: Check grounding
  const signals = classifyGrounding(query.query);

  if (signals.decision === "model_knowledge" && !query.deepScrape) {
    // No search needed — let the model answer directly
    const answer = await synthesizeFn(query.query);
    return {
      answer,
      citations: [],
      wasGrounded: false,
      sourcesConsulted: 0,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  // Step 2: Search (with cache)
  groundedQueries++;
  const maxResults = query.maxResults ?? 5;
  let results = getCachedResults(query.query);

  if (!results) {
    results = await searchFn(query.query, maxResults);
    cacheResults(query.query, results);
  }

  if (results.length === 0) {
    const answer = await synthesizeFn(
      `I couldn't find recent search results for: "${query.query}". Please answer from your knowledge.`,
    );
    return {
      answer,
      citations: [],
      wasGrounded: false,
      searchQuery: query.query,
      sourcesConsulted: 0,
      latencyMs: Math.round(performance.now() - start),
    };
  }

  // Step 3: Deep scrape top results (if enabled)
  if (query.deepScrape) {
    const scrapePromises = results.slice(0, 3).map(async (r) => {
      try {
        r.content = await scrapeFn(r.url);
      } catch {
        // Scraping failed — use snippet
      }
    });
    await Promise.allSettled(scrapePromises);
  }

  // Step 4: Chunk and rank
  const allChunks: RAGChunk[] = [];
  for (const result of results) {
    const text = result.content ?? result.snippet;
    if (text) {
      allChunks.push(...chunkContent(text, result.url, result.title));
    }
  }

  const topChunks = rankChunks(allChunks, query.query, 8);
  totalSources += results.length;

  // Step 5: Build context and synthesize
  const context = topChunks
    .map((c, i) => `[Source ${i + 1}: ${c.sourceTitle}]\n${c.text}`)
    .join("\n\n");

  const synthesisPrompt = `Answer the following question using the provided sources. Cite sources using [1], [2], etc. Be accurate and comprehensive.

Question: ${query.query}

Sources:
${context}

Answer:`;

  const answer = await synthesizeFn(synthesisPrompt);

  // Step 6: Build citations
  const citations = buildCitations(results);
  const annotatedAnswer = insertCitationMarkers(answer, results, citations);
  const finalAnswer = annotatedAnswer + formatCitationsMarkdown(citations);

  return {
    answer: finalAnswer,
    citations,
    wasGrounded: true,
    searchQuery: query.query,
    sourcesConsulted: results.length,
    latencyMs: Math.round(performance.now() - start),
  };
}

// ─── Diagnostics ─────────────────────────────────────────────────

export function getSearchRAGDiagnostics(): SearchRAGDiagnostics {
  return {
    totalQueries,
    groundedQueries,
    avgLatencyMs: totalQueries > 0 ? Math.round(totalLatencyMs / totalQueries) : 0,
    avgSourcesPerQuery: groundedQueries > 0 ? totalSources / groundedQueries : 0,
    cacheHitRate: totalQueries > 0 ? cacheHits / totalQueries : 0,
  };
}

/** Export grounding utilities */
export { classifyGrounding, needsSearch } from "./grounding.js";
export { buildCitations, formatCitationsMarkdown } from "./citations.js";
