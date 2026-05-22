/**
 * Knowledge Base — Core CRUD Engine
 *
 * Persistent in-memory knowledge store with keyword-based search.
 * Persisted to SQLite via the republic snapshot system.
 *
 * Features:
 * - Add/update/delete knowledge entries
 * - Keyword + tag based retrieval
 * - Retrieval count tracking (LRU-like relevance)
 * - Category-based filtering
 * - Confidence-weighted results
 */

import type {
  KnowledgeEntry,
  KnowledgeAddRequest,
  KnowledgeQueryRequest,
  KnowledgeQueryResult,
  KnowledgeBaseDiagnostics,
  KnowledgeCategory,
} from "./types.js";

// ─── State ───────────────────────────────────────────────────────

const entries = new Map<string, KnowledgeEntry>();
let idCounter = 0;
const MAX_ENTRIES = 10_000;

function genId(): string {
  return `kb-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─── CRUD ────────────────────────────────────────────────────────

/** Add a new knowledge entry */
export function addKnowledge(req: KnowledgeAddRequest): KnowledgeEntry {
  const entry: KnowledgeEntry = {
    id: genId(),
    title: req.title.slice(0, 200),
    content: req.content.slice(0, 5000),
    category: req.category ?? "fact",
    tags: (req.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
    source: req.source ?? "manual",
    confidence: Math.max(0, Math.min(1, req.confidence ?? 0.8)),
    retrievalCount: 0,
    createdAt: now(),
    lastAccessedAt: now(),
    updatedAt: now(),
    verified: false,
  };

  // Evict oldest if at capacity
  if (entries.size >= MAX_ENTRIES) {
    evictOldest();
  }

  entries.set(entry.id, entry);
  return entry;
}

/** Update an existing knowledge entry */
export function updateKnowledge(
  id: string,
  updates: Partial<
    Pick<KnowledgeEntry, "title" | "content" | "category" | "tags" | "confidence" | "verified">
  >,
): KnowledgeEntry | null {
  const entry = entries.get(id);
  if (!entry) {
    return null;
  }

  if (updates.title !== undefined) {
    entry.title = updates.title.slice(0, 200);
  }
  if (updates.content !== undefined) {
    entry.content = updates.content.slice(0, 5000);
  }
  if (updates.category !== undefined) {
    entry.category = updates.category;
  }
  if (updates.tags !== undefined) {
    entry.tags = updates.tags.map((t) => t.toLowerCase().trim());
  }
  if (updates.confidence !== undefined) {
    entry.confidence = Math.max(0, Math.min(1, updates.confidence));
  }
  if (updates.verified !== undefined) {
    entry.verified = updates.verified;
  }
  entry.updatedAt = now();

  return entry;
}

/** Delete a knowledge entry */
export function deleteKnowledge(id: string): boolean {
  return entries.delete(id);
}

/** Get a knowledge entry by ID */
export function getKnowledge(id: string): KnowledgeEntry | null {
  const entry = entries.get(id);
  if (entry) {
    entry.retrievalCount++;
    entry.lastAccessedAt = now();
  }
  return entry ?? null;
}

// ─── Query / Search ──────────────────────────────────────────────

/** Search knowledge entries by query, category, and tags */
export function queryKnowledge(req: KnowledgeQueryRequest): KnowledgeQueryResult {
  const start = performance.now();
  const topK = req.topK ?? 10;
  const minConfidence = req.minConfidence ?? 0;

  // Build query word set
  const queryWords = new Set(
    req.query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2),
  );

  const results: Array<KnowledgeEntry & { similarity: number }> = [];

  for (const entry of entries.values()) {
    // Filter by category
    if (req.category && entry.category !== req.category) {
      continue;
    }

    // Filter by confidence
    if (entry.confidence < minConfidence) {
      continue;
    }

    // Filter by tags
    if (req.tags && req.tags.length > 0) {
      const entryTags = new Set(entry.tags);
      if (!req.tags.some((t) => entryTags.has(t.toLowerCase()))) {
        continue;
      }
    }

    // Compute keyword similarity
    const entryWords = new Set(
      `${entry.title} ${entry.content} ${entry.tags.join(" ")}`
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 2),
    );

    let overlap = 0;
    for (const w of queryWords) {
      if (entryWords.has(w)) {
        overlap++;
      }
    }

    const similarity = queryWords.size > 0 ? overlap / queryWords.size : 0;

    // Boost by confidence and retrieval count
    const boostedSimilarity = similarity * (0.7 + entry.confidence * 0.3);

    if (boostedSimilarity > 0.05 || queryWords.size === 0) {
      results.push({ ...entry, similarity: boostedSimilarity });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  // Track access
  for (const r of results.slice(0, topK)) {
    const entry = entries.get(r.id);
    if (entry) {
      entry.retrievalCount++;
      entry.lastAccessedAt = now();
    }
  }

  return {
    entries: results.slice(0, topK),
    totalEntries: entries.size,
    queryTimeMs: Math.round(performance.now() - start),
  };
}

/** List all knowledge entries (paginated) */
export function listKnowledge(
  offset = 0,
  limit = 50,
  category?: KnowledgeCategory,
): KnowledgeEntry[] {
  let all = [...entries.values()];
  if (category) {
    all = all.filter((e) => e.category === category);
  }
  all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return all.slice(offset, offset + limit);
}

// ─── Bulk Operations ─────────────────────────────────────────────

/** Add multiple knowledge entries at once */
export function addBulkKnowledge(items: KnowledgeAddRequest[]): number {
  let added = 0;
  for (const item of items.slice(0, 100)) {
    addKnowledge(item);
    added++;
  }
  return added;
}

/** Export all knowledge as JSON */
export function exportKnowledge(): KnowledgeEntry[] {
  return [...entries.values()];
}

/** Import knowledge from JSON (merges, not replaces) */
export function importKnowledge(data: KnowledgeEntry[]): number {
  let imported = 0;
  for (const entry of data.slice(0, MAX_ENTRIES)) {
    if (!entries.has(entry.id)) {
      entries.set(entry.id, entry);
      imported++;
    }
  }
  return imported;
}

// ─── Eviction ────────────────────────────────────────────────────

function evictOldest(): void {
  // Evict the entry with lowest (retrievalCount * confidence), oldest first
  let worst: { id: string; score: number } | null = null;
  for (const [id, entry] of entries) {
    const score = entry.retrievalCount * entry.confidence;
    if (!worst || score < worst.score) {
      worst = { id, score };
    }
  }
  if (worst) {
    entries.delete(worst.id);
  }
}

// ─── Diagnostics ─────────────────────────────────────────────────

export function getKnowledgeBaseDiagnostics(): KnowledgeBaseDiagnostics {
  const all = [...entries.values()];
  const categoryBreakdown: Record<string, number> = {};
  let totalRetrievals = 0;
  let totalConfidence = 0;

  for (const entry of all) {
    categoryBreakdown[entry.category] = (categoryBreakdown[entry.category] ?? 0) + 1;
    totalRetrievals += entry.retrievalCount;
    totalConfidence += entry.confidence;
  }

  const sorted = all.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    totalEntries: all.length,
    categoryBreakdown,
    totalRetrievals,
    avgConfidence: all.length > 0 ? totalConfidence / all.length : 0,
    oldestEntry: sorted[0]?.createdAt,
    newestEntry: sorted[sorted.length - 1]?.createdAt,
  };
}

/** Reset knowledge base (testing) */
export function resetKnowledgeBase(): void {
  entries.clear();
  idCounter = 0;
}
