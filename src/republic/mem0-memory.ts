/**
 * mem0-Memory: Unlimited Long-Term Memory for HoC Citizens
 *
 * Implements the core mem0 (mem0ai/mem0) two-phase pipeline in TypeScript:
 *
 *   Phase 1 — EXTRACT: LLM reads a citizen's interaction and distills
 *             salient facts into atomic memory statements.
 *
 *   Phase 2 — UPDATE:  Each new fact is compared against existing facts.
 *             LLM decides: ADD (new), UPDATE (existing changed), DELETE
 *             (contradicted), or NONE (already known).
 *
 * Key benefits over the old 200-entry LRU episodic store:
 *   - No hard cap: facts accumulate forever (compressed, not evicted)
 *   - Semantic retrieval: cosine similarity over embeddings (not keyword match)
 *   - Deduplication: LLM merges similar facts instead of duplicating them
 *   - Offline mode: falls back to regex extraction if no LLM available
 *
 * Architecture:
 *   - In-memory store: Map<citizenId, Mem0Fact[]>
 *   - Embeddings: naive TF-IDF bag-of-words when embedding provider absent,
 *     real embeddings when src/memory/embeddings.ts provider is configured
 *   - Persistence: exported via exportMem0State/importMem0State for
 *     integration with the republic-state snapshot system
 *   - All extraction/update operations are fire-and-forget async — they
 *     NEVER block the citizen loop tick
 *
 * @see https://github.com/mem0ai/mem0 (MIT)
 */

import { uid } from "./utils.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:mem0-memory");

// ─── Types ────────────────────────────────────────────────────────────────────

/** Categories mem0 assigns to facts */
export type Mem0Category =
  | "personal_info"
  | "skills"
  | "relationships"
  | "preferences"
  | "goals"
  | "achievements"
  | "beliefs"
  | "experiences"
  | "knowledge"
  | "emotional_state"
  | "work"
  | "general";

/** A single extracted and deduplicated memory fact */
export interface Mem0Fact {
  id: string;
  citizenId: string;
  /** The atomic fact statement, e.g. "Excels at music composition" */
  memory: string;
  categories: Mem0Category[];
  /** Importance score 0.0–1.0 (LLM-assigned or heuristic) */
  importance: number;
  /** Text embedding vector (normalized) for semantic search */
  embedding: number[];
  createdAt: string;
  updatedAt: string;
  /** How many times this fact was accessed (reinforcement) */
  accessCount: number;
  /** How many times this fact was reinforced (re-extracted) */
  reinforcements: number;
  /** Where the fact came from */
  source: "interaction" | "reflection" | "consolidation" | "manual";
}

/** Result of a mem0 search */
export interface Mem0SearchResult {
  fact: Mem0Fact;
  /** Cosine similarity score [0, 1] */
  score: number;
}

/** mem0 system-wide statistics */
export interface Mem0Stats {
  totalFacts: number;
  totalCitizens: number;
  factsPerCitizen: Record<string, number>;
  deduplicationsPerformed: number;
  additionsPerformed: number;
  updatesPerformed: number;
  deletionsPerformed: number;
  offlineExtractions: number;
  llmExtractions: number;
  avgFactsPerCitizen: number;
}

// ─── Global State ─────────────────────────────────────────────────────────────

/** The primary unlimited fact store: citizenId → facts[] */
const factStore = new Map<string, Mem0Fact[]>();

/** Running statistics */
const stats = {
  deduplicationsPerformed: 0,
  additionsPerformed: 0,
  updatesPerformed: 0,
  deletionsPerformed: 0,
  offlineExtractions: 0,
  llmExtractions: 0,
};

// ─── Embedding Utilities ──────────────────────────────────────────────────────

/**
 * Naive TF-IDF bag-of-words embedding (64-dim).
 * Used when no proper embedding provider is available (offline mode).
 * Good enough for approximate cosine similarity between short fact strings.
 */
function naiveBagOfWordsEmbedding(text: string): number[] {
  const DIM = 64;
  const vec = Array.from<number>({ length: DIM }).fill(0);
  const words = text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);

  for (const word of words) {
    // Deterministic hash → bucket
    let h = 5381;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) + h + word.charCodeAt(i)) | 0;
    }
    const bucket = Math.abs(h) % DIM;
    vec[bucket] += 1;
  }

  // L2 normalize
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag > 1e-10) {
    for (let i = 0; i < vec.length; i++) { vec[i] /= mag; }
  }
  return vec;
}

/** Cosine similarity between two L2-normalized vectors */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) { return 0; }
  let dot = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; }
  return Math.max(0, Math.min(1, dot));
}

/** Get or compute embedding for a text.
 *  Falls back to naive BoW if global embedding provider not set. */
let _embeddingProvider: ((text: string) => Promise<number[]>) | null = null;

export function setMem0EmbeddingProvider(fn: (text: string) => Promise<number[]>): void {
  _embeddingProvider = fn;
  logger.info("mem0: Embedding provider configured");
}

async function embed(text: string): Promise<number[]> {
  if (_embeddingProvider) {
    try {
      return await _embeddingProvider(text);
    } catch (err) {
      logger.warn("mem0: Embedding provider failed, falling back to BoW", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return naiveBagOfWordsEmbedding(text);
}

// ─── LLM Integration ──────────────────────────────────────────────────────────

/** Optional LLM provider: (prompt: string) → string */
let _llmProvider: ((prompt: string) => Promise<string>) | null = null;

export function setMem0LlmProvider(fn: (prompt: string) => Promise<string>): void {
  _llmProvider = fn;
  logger.info("mem0: LLM provider configured");
}

// ─── Phase 1: Fact Extraction ─────────────────────────────────────────────────

/** A message pair fed to the extractor */
export interface Mem0Message {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * PHASE 1 — Extract salient facts from a conversation turn.
 *
 * With LLM: structured prompt → JSON array of facts.
 * Without LLM (offline): regex heuristics extract patterns like
 *  "I love X", "I learned Y", "I am a Z", "I don't like W".
 */
async function extractFacts(
  citizenId: string,
  citizenName: string,
  messages: Mem0Message[],
  context?: string,
): Promise<Array<{ memory: string; categories: Mem0Category[]; importance: number }>> {
  const text = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role === "user" ? citizenName : "World"}: ${m.content}`)
    .join("\n");

  if (!text.trim()) { return []; }

  if (_llmProvider) {
    try {
      const prompt = `You are a memory extractor for an AI citizen named "${citizenName}" in a simulated republic.

Extract salient, atomic memory facts from this interaction. A fact is:
- A preference ("Loves music composition")
- A skill ("Proficient in Python programming")
- A relationship ("Trusts citizen Aria")  
- A life event ("Completed research project on fusion energy")
- A belief ("Believes education is the path to prosperity")
- A goal ("Wants to become the chief scientist")

Exclude trivial facts, greetings, or filler. Each fact should be self-contained and specific.
${context ? `\nContext about this citizen: ${context}` : ""}

Interaction:
${text}

Respond ONLY with a JSON array, no markdown, no explanation:
[
  {"memory": "fact statement", "categories": ["skills"], "importance": 0.8},
  ...
]

Categories (pick 1-3): personal_info, skills, relationships, preferences, goals, achievements, beliefs, experiences, knowledge, emotional_state, work, general
Importance: 0.0 (trivial) to 1.0 (life-defining)`;

      const response = await _llmProvider(prompt);

      // Parse JSON (strip markdown fences if present)
      const jsonStr = response.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
      const parsed = JSON.parse(jsonStr) as Array<{
        memory: string;
        categories: string[];
        importance: number;
      }>;

      stats.llmExtractions++;
      return parsed
        .filter((f) => f.memory && typeof f.memory === "string" && f.memory.length > 5)
        .map((f) => ({
          memory: f.memory.trim(),
          categories: (f.categories ?? ["general"]).filter(isValidCategory) as Mem0Category[],
          importance: Math.max(0, Math.min(1, Number(f.importance) || 0.5)),
        }));
    } catch (err) {
      logger.warn("mem0: LLM extraction failed, using offline extractor", {
        citizenId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Offline extractor: regex patterns ──
  stats.offlineExtractions++;
  return offlineExtractFacts(citizenId, citizenName, text);
}

/** Category type guard */
function isValidCategory(s: string): s is Mem0Category {
  return [
    "personal_info",
    "skills",
    "relationships",
    "preferences",
    "goals",
    "achievements",
    "beliefs",
    "experiences",
    "knowledge",
    "emotional_state",
    "work",
    "general",
  ].includes(s);
}

/** Offline fact extractor: regex patterns for common fact types */
function offlineExtractFacts(
  _citizenId: string,
  citizenName: string,
  text: string,
): Array<{ memory: string; categories: Mem0Category[]; importance: number }> {
  const facts: Array<{ memory: string; categories: Mem0Category[]; importance: number }> = [];
  const lines = text.split(/[.!?]+/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Skill patterns
    if (/\b(learned|studying|skilled in|expert in|mastered|proficient in)\b/.test(lower)) {
      facts.push({ memory: `${citizenName} ${line.trim()}`, categories: ["skills"], importance: 0.7 });
    }
    // Preference patterns
    else if (/\b(loves?|enjoys?|likes?|prefers?|hates?|dislikes?|avoids?)\b/.test(lower)) {
      facts.push({
        memory: `${citizenName} ${line.trim()}`,
        categories: ["preferences"],
        importance: 0.6,
      });
    }
    // Goal patterns
    else if (/\b(wants? to|plans? to|goal is|aims? to|intends? to|will become)\b/.test(lower)) {
      facts.push({ memory: `${citizenName} ${line.trim()}`, categories: ["goals"], importance: 0.8 });
    }
    // Achievement patterns
    else if (/\b(completed|finished|achieved|accomplished|built|created|invented)\b/.test(lower)) {
      facts.push({
        memory: `${citizenName} ${line.trim()}`,
        categories: ["achievements"],
        importance: 0.75,
      });
    }
    // Relationship patterns
    else if (/\b(trusts?|friends? with|collaborated? with|mentored|mentoring)\b/.test(lower)) {
      facts.push({
        memory: `${citizenName} ${line.trim()}`,
        categories: ["relationships"],
        importance: 0.65,
      });
    }
  }

  return facts.slice(0, 8); // Cap offline extraction at 8 facts per turn
}

// ─── Phase 2: Deduplication ───────────────────────────────────────────────────

type DeduplicateDecision = "ADD" | "UPDATE" | "DELETE" | "NONE";
interface DeduplicateResult {
  decision: DeduplicateDecision;
  targetId?: string; // existing fact ID to update/delete
  mergedMemory?: string; // updated text if decision is UPDATE
}

/**
 * PHASE 2 — Deduplicate a candidate fact against existing facts.
 *
 * With LLM: structured comparison → ADD/UPDATE/DELETE/NONE decision.
 * Without LLM: cosine similarity threshold (>0.92 → NONE, >0.75 → UPDATE).
 */
async function deduplicateFact(
  candidate: string,
  candidateEmbedding: number[],
  existingFacts: Mem0Fact[],
): Promise<DeduplicateResult> {
  if (existingFacts.length === 0) {
    return { decision: "ADD" };
  }

  // First pass: find similar facts by cosine similarity (fast path)
  const similar = existingFacts
    .map((f) => ({ fact: f, score: cosineSimilarity(candidateEmbedding, f.embedding) }))
    .filter((r) => r.score > 0.60)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 5);

  if (similar.length === 0) {
    return { decision: "ADD" };
  }

  // Very high similarity without LLM → NONE (already known)
  if (!_llmProvider && similar[0].score > 0.92) {
    stats.deduplicationsPerformed++;
    return { decision: "NONE" };
  }

  // Moderate similarity without LLM → UPDATE if clearly same topic
  if (!_llmProvider && similar[0].score > 0.78) {
    stats.deduplicationsPerformed++;
    return { decision: "UPDATE", targetId: similar[0].fact.id };
  }

  if (!_llmProvider) {
    return { decision: "ADD" };
  }

  // With LLM: structured deduplication decision
  try {
    const existingList = similar
      .map((r, i) => `${i + 1}. [id:${r.fact.id}] "${r.fact.memory}" (similarity: ${(r.score * 100).toFixed(0)}%)`)
      .join("\n");

    const prompt = `You are a memory deduplication system. Determine how to handle a new memory fact.

Existing similar memories:
${existingList}

New candidate fact: "${candidate}"

Choose ONE action:
- ADD: The new fact is genuinely different and adds new information
- UPDATE id:<existing_id> new:"<updated merged text>": Merge into an existing entry because they express the same fact (possibly with new details)
- DELETE id:<existing_id>: The existing entry is contradicted by the new fact
- NONE: The new fact is already fully captured by an existing entry

Respond with ONLY the action line. Example: ADD | UPDATE id:abc123 new:"Loves music and chess" | DELETE id:abc123 | NONE`;

    const response = (await _llmProvider(prompt)).trim();
    stats.deduplicationsPerformed++;

    if (response.startsWith("NONE")) {
      return { decision: "NONE" };
    }
    if (response.startsWith("ADD")) {
      return { decision: "ADD" };
    }
    if (response.startsWith("DELETE")) {
      const idMatch = response.match(/id:(\S+)/);
      return { decision: "DELETE", targetId: idMatch?.[1] };
    }
    if (response.startsWith("UPDATE")) {
      const idMatch = response.match(/id:(\S+)/);
      const newMatch = response.match(/new:"([^"]+)"/);
      return {
        decision: "UPDATE",
        targetId: idMatch?.[1],
        mergedMemory: newMatch?.[1] ?? candidate,
      };
    }

    // Parsing failed → default ADD
    return { decision: "ADD" };
  } catch (err) {
    logger.warn("mem0: LLM deduplication failed, using cosine threshold", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Fallback: if high similarity, skip
    if (similar[0].score > 0.88) {
      return { decision: "NONE" };
    }
    return { decision: "ADD" };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Ensure fact store entry for citizen */
function getFactList(citizenId: string): Mem0Fact[] {
  let list = factStore.get(citizenId);
  if (!list) {
    list = [];
    factStore.set(citizenId, list);
  }
  return list;
}

/**
 * Add memories from a conversation turn (fire-and-forget safe).
 *
 * Runs the full two-phase mem0 pipeline:
 *   1. Extract atomic facts from messages
 *   2. Deduplicate each fact against existing store
 *   3. ADD/UPDATE/DELETE/NONE each fact accordingly
 *
 * @param citizenId  The citizen whose memory to update
 * @param citizenName  Citizen's display name (used in fact phrasing)
 * @param messages   The interaction messages (user + assistant)
 * @param context    Optional brief context about the citizen (for LLM prompting)
 */
export async function mem0Add(
  citizenId: string,
  citizenName: string,
  messages: Mem0Message[],
  context?: string,
): Promise<{ added: number; updated: number; deleted: number; skipped: number }> {
  const result = { added: 0, updated: 0, deleted: 0, skipped: 0 };

  try {
    const candidateFacts = await extractFacts(citizenId, citizenName, messages, context);
    if (candidateFacts.length === 0) { return result; }

    const existingFacts = getFactList(citizenId);
    const now = new Date().toISOString();

    for (const candidate of candidateFacts) {
      try {
        const embedding = await embed(candidate.memory);
        const dedup = await deduplicateFact(candidate.memory, embedding, existingFacts);

        switch (dedup.decision) {
          case "ADD": {
            const fact: Mem0Fact = {
              id: `m0-${uid()}`,
              citizenId,
              memory: candidate.memory,
              categories: candidate.categories,
              importance: candidate.importance,
              embedding,
              createdAt: now,
              updatedAt: now,
              accessCount: 0,
              reinforcements: 0,
              source: "interaction",
            };
            existingFacts.push(fact);
            stats.additionsPerformed++;
            result.added++;
            break;
          }

          case "UPDATE": {
            const target = dedup.targetId
              ? existingFacts.find((f) => f.id === dedup.targetId)
              : existingFacts.find(
                  (f, i) =>
                    i === 0 ||
                    cosineSimilarity(embedding, f.embedding) > 0.78,
                );
            if (target) {
              if (dedup.mergedMemory) {
                target.memory = dedup.mergedMemory;
                target.embedding = await embed(dedup.mergedMemory);
              }
              target.updatedAt = now;
              target.reinforcements++;
              target.importance = Math.min(1.0, target.importance + 0.05);
              stats.updatesPerformed++;
              result.updated++;
            } else {
              // Target not found → just add
              const fact: Mem0Fact = {
                id: `m0-${uid()}`,
                citizenId,
                memory: candidate.memory,
                categories: candidate.categories,
                importance: candidate.importance,
                embedding,
                createdAt: now,
                updatedAt: now,
                accessCount: 0,
                reinforcements: 0,
                source: "interaction",
              };
              existingFacts.push(fact);
              stats.additionsPerformed++;
              result.added++;
            }
            break;
          }

          case "DELETE": {
            if (dedup.targetId) {
              const idx = existingFacts.findIndex((f) => f.id === dedup.targetId);
              if (idx !== -1) {
                existingFacts.splice(idx, 1);
                stats.deletionsPerformed++;
                result.deleted++;
              }
            }
            break;
          }

          case "NONE":
          default: {
            // Already known — just reinforce access count
            const existing = dedup.targetId
              ? existingFacts.find((f) => f.id === dedup.targetId)
              : undefined;
            if (existing) {
              existing.reinforcements++;
            }
            result.skipped++;
            break;
          }
        }
      } catch (factErr) {
        logger.warn("mem0: Error processing individual fact", {
          citizenId,
          fact: candidate.memory,
          error: factErr instanceof Error ? factErr.message : String(factErr),
        });
        result.skipped++;
      }
    }
  } catch (err) {
    logger.error("mem0: mem0Add failed", {
      citizenId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

/**
 * Semantic search over a citizen's memory facts.
 *
 * @param citizenId  Target citizen
 * @param query      Natural language query (e.g. "what skills does this citizen have?")
 * @param topK       Max results to return (default 10)
 * @param minScore   Minimum cosine similarity threshold (default 0.0)
 * @returns Facts sorted by relevance, most relevant first
 */
export async function mem0Search(
  citizenId: string,
  query: string,
  topK = 10,
  minScore = 0.0,
): Promise<Mem0SearchResult[]> {
  const facts = factStore.get(citizenId);
  if (!facts || facts.length === 0) { return []; }

  const queryEmbedding = await embed(query);

  const results = facts
    .map((fact) => {
      const score = cosineSimilarity(queryEmbedding, fact.embedding);
      return { fact, score };
    })
    .filter((r) => r.score >= minScore)
    .toSorted((a, b) => {
      // Rank by blended score: cosine + recency bonus + importance
      const aBlend = a.score * 0.7 + a.fact.importance * 0.2 + (a.fact.reinforcements > 0 ? 0.1 : 0);
      const bBlend = b.score * 0.7 + b.fact.importance * 0.2 + (b.fact.reinforcements > 0 ? 0.1 : 0);
      return bBlend - aBlend;
    })
    .slice(0, topK);

  // Update access counters
  const now = new Date().toISOString();
  for (const r of results) {
    r.fact.accessCount++;
    r.fact.updatedAt = now;
  }

  return results;
}

/**
 * Get all facts for a citizen (full export, sorted by importance descending).
 */
export function mem0GetAll(citizenId: string): Mem0Fact[] {
  return (factStore.get(citizenId) ?? []).toSorted(
    (a, b) => b.importance - a.importance,
  );
}

/**
 * Delete a specific fact by ID.
 */
export function mem0Delete(citizenId: string, factId: string): boolean {
  const facts = factStore.get(citizenId);
  if (!facts) { return false; }
  const idx = facts.findIndex((f) => f.id === factId);
  if (idx === -1) { return false; }
  facts.splice(idx, 1);
  stats.deletionsPerformed++;
  return true;
}

/**
 * Delete ALL facts for a citizen (e.g., on citizen death/reset).
 */
export function mem0Clear(citizenId: string): void {
  factStore.delete(citizenId);
}

/**
 * Manually inject a fact (admin operation, bypasses extraction pipeline).
 */
export async function mem0Inject(
  citizenId: string,
  memory: string,
  categories: Mem0Category[] = ["general"],
  importance = 0.7,
  source: Mem0Fact["source"] = "manual",
): Promise<Mem0Fact> {
  const embedding = await embed(memory);
  const now = new Date().toISOString();
  const fact: Mem0Fact = {
    id: `m0-${uid()}`,
    citizenId,
    memory,
    categories,
    importance,
    embedding,
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    reinforcements: 0,
    source,
  };
  getFactList(citizenId).push(fact);
  stats.additionsPerformed++;
  return fact;
}

/**
 * Format a citizen's top memories as a prompt-injectable context block.
 * Drop-in replacement / augmentation for queryRelevantMemories().
 *
 * @param citizenId  The citizen to build context for
 * @param query      Activity/topic query for semantic retrieval
 * @param topK       How many facts to include (default 8)
 */
export async function mem0BuildContext(
  citizenId: string,
  query: string,
  topK = 8,
): Promise<string> {
  const results = await mem0Search(citizenId, query, topK, 0.0);
  if (results.length === 0) { return ""; }

  const lines = results.map((r) => {
    const cats = r.fact.categories.join(", ");
    const stars = "★".repeat(Math.min(5, Math.round(r.fact.importance * 5)));
    return `  ${stars} ${r.fact.memory} [${cats}]`;
  });

  return `LONG-TERM MEMORY (${results.length} facts):\n${lines.join("\n")}`;
}

// ─── Global Statistics ────────────────────────────────────────────────────────

/** Get system-wide mem0 statistics */
export function mem0Stats(): Mem0Stats {
  const perCitizen: Record<string, number> = {};
  let total = 0;
  for (const [id, facts] of factStore) {
    perCitizen[id] = facts.length;
    total += facts.length;
  }
  const citizens = factStore.size;

  return {
    totalFacts: total,
    totalCitizens: citizens,
    factsPerCitizen: perCitizen,
    deduplicationsPerformed: stats.deduplicationsPerformed,
    additionsPerformed: stats.additionsPerformed,
    updatesPerformed: stats.updatesPerformed,
    deletionsPerformed: stats.deletionsPerformed,
    offlineExtractions: stats.offlineExtractions,
    llmExtractions: stats.llmExtractions,
    avgFactsPerCitizen: citizens > 0 ? total / citizens : 0,
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/** Export state for snapshot persistence */
export function exportMem0State(): {
  facts: Record<string, Mem0Fact[]>;
  stats: typeof stats;
} {
  const facts: Record<string, Mem0Fact[]> = {};
  for (const [id, list] of factStore) {
    facts[id] = list;
  }
  return { facts, stats: { ...stats } };
}

/** Import state from snapshot */
export function importMem0State(data: {
  facts: Record<string, Mem0Fact[]>;
  stats?: Partial<typeof stats>;
}): void {
  factStore.clear();
  for (const [id, list] of Object.entries(data.facts)) {
    // Re-compute missing embeddings (naive BoW) for any facts that lost their vectors
    const restored = list.map((f) => ({
      ...f,
      embedding:
        Array.isArray(f.embedding) && f.embedding.length > 0
          ? f.embedding
          : naiveBagOfWordsEmbedding(f.memory),
    }));
    factStore.set(id, restored);
  }
  if (data.stats) {
    Object.assign(stats, data.stats);
  }
  logger.info("mem0: State imported", {
    citizens: factStore.size,
    totalFacts: [...factStore.values()].reduce((s, l) => s + l.length, 0),
  });
}

/** Reset all mem0 state (testing only) */
export function resetMem0(): void {
  factStore.clear();
  Object.assign(stats, {
    deduplicationsPerformed: 0,
    additionsPerformed: 0,
    updatesPerformed: 0,
    deletionsPerformed: 0,
    offlineExtractions: 0,
    llmExtractions: 0,
  });
}
