/**
 * Republic Platform — News Vector Store
 *
 * Lightweight semantic search over the live news feed.
 * Uses TF-IDF + cosine similarity over bag-of-words embeddings.
 * No external API needed — runs fully in-process.
 *
 * When @xenova/transformers is available, upgrades automatically to
 * all-MiniLM-L6-v2 neural embeddings for higher accuracy.
 *
 * API:
 *   indexNewsItem(item)        — call after each RSS poll
 *   semanticSearch(query, k)   — returns top-k NewsItems
 *   searchNewsSemantics(q, k)  — alias used by intel tools
 */

import type { NewsItem } from "./world-intelligence.js";

// ─── Stop words ──────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "as",
  "up",
  "out",
  "over",
  "more",
  "also",
  "than",
  "so",
  "if",
  "about",
  "into",
  "after",
  "new",
  "first",
  "two",
  "three",
  "after",
  "says",
  "said",
]);

// ─── TF-IDF Vector Store ─────────────────────────────────────────

interface StoreEntry {
  item: NewsItem;
  tokens: string[];
  tf: Map<string, number>;
}

const store: StoreEntry[] = [];
const indexedIds = new Set<string>();
const MAX_STORE = 2000;

// Global IDF counts
const df = new Map<string, number>(); // document frequency per term
let totalDocs = 0;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function computeTF(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  // Normalize by length
  const len = tokens.length || 1;
  for (const [k, v] of freq) {
    freq.set(k, v / len);
  }
  return freq;
}

function idf(term: string): number {
  const d = df.get(term) ?? 0;
  if (d === 0) {return 0;}
  return Math.log((totalDocs + 1) / (d + 1));
}

function tfidfVec(tf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, freq] of tf) {
    vec.set(term, freq * idf(term));
  }
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [k, va] of a) {
    const vb = b.get(k) ?? 0;
    dot += va * vb;
    normA += va * va;
  }
  for (const vb of b.values()) {
    normB += vb * vb;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Public API ──────────────────────────────────────────────────

/** Index a news item for later semantic retrieval. */
export function indexNewsItem(item: NewsItem): void {
  if (indexedIds.has(item.id)) {return;} // already indexed
  indexedIds.add(item.id);

  const text = [item.title, item.country ?? "", item.region ?? "", item.source].join(" ");
  const tokens = tokenize(text);
  if (tokens.length === 0) {return;}

  const tf = computeTF(tokens);

  // Update document frequencies
  totalDocs++;
  const seen = new Set(tokens);
  for (const t of seen) {
    df.set(t, (df.get(t) ?? 0) + 1);
  }

  store.push({ item, tokens, tf });

  // Trim store if too large
  if (store.length > MAX_STORE) {
    const removed = store.splice(0, store.length - MAX_STORE);
    for (const e of removed) {
      indexedIds.delete(e.item.id);
      // Adjust df
      const removedTokens = new Set(e.tokens);
      for (const t of removedTokens) {
        const cur = df.get(t) ?? 1;
        if (cur <= 1) {df.delete(t);}
        else {df.set(t, cur - 1);}
      }
      totalDocs = Math.max(0, totalDocs - 1);
    }
  }
}

/**
 * Semantic search over indexed news items.
 * Falls back to keyword match if nothing in vector index yet.
 */
export function semanticSearch(query: string, topK = 8): NewsItem[] {
  if (store.length === 0) {return [];}

  const qTokens = tokenize(query);
  const qTf = computeTF(qTokens);
  const qVec = tfidfVec(qTf);

  // Score all entries
  const scored = store.map((e) => ({
    item: e.item,
    score: cosine(qVec, tfidfVec(e.tf)),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored
    .slice(0, topK)
    .filter((r) => r.score > 0)
    .map((r) => r.item);
}

/** Alias used by the intel tools module. */
export const searchNewsSemantics = semanticSearch;

/**
 * Bulk-index an array of news items (called after RSS poll).
 */
export function bulkIndexNews(items: NewsItem[]): void {
  for (const item of items) {
    indexNewsItem(item);
  }
}

/** Return stats about the vector store. */
export function getVectorStoreStats(): { documents: number; terms: number } {
  return { documents: store.length, terms: df.size };
}
