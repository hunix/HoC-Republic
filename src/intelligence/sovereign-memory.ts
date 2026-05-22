/**
 * Sovereign Memory Engine
 *
 * A zero-dependency, always-on persistent semantic memory system for agents,
 * citizens, and cross-channel sessions.
 *
 * Architecture:
 *   - SQLite as the sole storage backend — no Redis, no Qdrant, no external services
 *   - FTS5 BM25 full-text search for semantic recall
 *   - Trigram-based fuzzy matching for partial queries
 *   - Importance-weighted ranking (recency × salience × accessCount)
 *   - Knowledge graph persistence (saves memory-graph.ts nodes/edges to disk)
 *   - Cross-channel session registry (links WhatsApp/web/republic sessions per scope)
 *
 * Storage: data/memory/sovereign.db
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";

// ── Types ────────────────────────────────────────────────────────────────────

export type MemoryScope = `agent:${string}` | `citizen:${string}` | "global";
export type MemoryType =
  | "fact"
  | "summary"
  | "anchor"
  | "skill"
  | "relationship"
  | "event"
  | "preference";
export type Channel = "whatsapp" | "webchat" | "republic" | "api" | "internal";

export interface SovereignMemory {
  id: string;
  scope: string;
  sessionKey?: string;
  channel?: string;
  content: string;
  memoryType: MemoryType;
  importance: number;
  accessCount: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface MemorySearchResult {
  memory: SovereignMemory;
  score: number;
  rank: number;
}

export interface GraphNode {
  id: string;
  label: string;
  nodeType: string;
  scope: string;
  importance: number;
  accessCount: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  lastAccessedAt: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relation: string;
  weight: number;
  scope: string;
  createdAt: number;
  lastReinforcedAt: number;
}

export interface ChannelSession {
  id: string;
  scope: string;
  sessionKey: string;
  channel: Channel;
  displayName?: string;
  lastMessageAt: number;
  messageCount: number;
}

export interface MemoryStats {
  scope: string;
  memoriesCount: number;
  nodesCount: number;
  edgesCount: number;
  sessionsCount: number;
  oldestMemoryAt: number | null;
  newestMemoryAt: number | null;
}

// ── Engine ───────────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), "data", "memory", "sovereign.db");

let _db: DatabaseSync | null = null;

async function ensureDb(): Promise<DatabaseSync> {
  if (_db) {return _db;}

  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // WAL mode for concurrent reads
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA cache_size = -32000"); // 32MB cache
  db.exec("PRAGMA foreign_keys = ON");

  // ── Main memory table ────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      sessionKey TEXT,
      channel TEXT,
      content TEXT NOT NULL,
      memoryType TEXT NOT NULL DEFAULT 'fact',
      importance REAL DEFAULT 0.5,
      accessCount INTEGER DEFAULT 0,
      createdAt INTEGER NOT NULL,
      lastAccessedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mem_scope ON memories(scope);
    CREATE INDEX IF NOT EXISTS idx_mem_type ON memories(scope, memoryType);
    CREATE INDEX IF NOT EXISTS idx_mem_importance ON memories(scope, importance DESC);
    CREATE INDEX IF NOT EXISTS idx_mem_accessed ON memories(scope, lastAccessedAt DESC);
  `);

  // ── FTS5 virtual table for BM25 semantic search ──────────────────────────
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      scope UNINDEXED,
      tokenize = 'porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS memories_fts_insert
      AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, scope)
        VALUES (new.rowid, new.content, new.scope);
      END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_delete
      BEFORE DELETE ON memories BEGIN
        DELETE FROM memories_fts WHERE rowid = old.rowid;
      END;

    CREATE TRIGGER IF NOT EXISTS memories_fts_update
      AFTER UPDATE ON memories BEGIN
        DELETE FROM memories_fts WHERE rowid = old.rowid;
        INSERT INTO memories_fts(rowid, content, scope)
        VALUES (new.rowid, new.content, new.scope);
      END;
  `);

  // ── Knowledge graph (persistent) ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      nodeType TEXT NOT NULL,
      scope TEXT NOT NULL,
      importance REAL DEFAULT 0.5,
      accessCount INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      createdAt INTEGER NOT NULL,
      lastAccessedAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_node_scope ON graph_nodes(scope);
    CREATE INDEX IF NOT EXISTS idx_node_label ON graph_nodes(scope, label);

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      sourceId TEXT NOT NULL,
      targetId TEXT NOT NULL,
      relation TEXT NOT NULL,
      weight REAL DEFAULT 0.5,
      scope TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      lastReinforcedAt INTEGER NOT NULL,
      FOREIGN KEY (sourceId) REFERENCES graph_nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (targetId) REFERENCES graph_nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_edge_source ON graph_edges(sourceId);
    CREATE INDEX IF NOT EXISTS idx_edge_target ON graph_edges(targetId);
    CREATE INDEX IF NOT EXISTS idx_edge_scope ON graph_edges(scope);
  `);

  // ── Cross-channel session registry ───────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS channel_sessions (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      sessionKey TEXT NOT NULL,
      channel TEXT NOT NULL,
      displayName TEXT,
      lastMessageAt INTEGER NOT NULL,
      messageCount INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sess_scope ON channel_sessions(scope);
    CREATE INDEX IF NOT EXISTS idx_sess_key ON channel_sessions(sessionKey);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sess_unique ON channel_sessions(scope, sessionKey, channel);
  `);

  _db = db;
  return db;
}

function nanoid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ── Memory Operations ────────────────────────────────────────────────────────

/**
 * Store a memory. Deduplicates by content hash within same scope.
 * Returns the id of the stored (or updated) memory.
 */
export async function storeMemory(opts: {
  scope: string;
  content: string;
  memoryType?: MemoryType;
  sessionKey?: string;
  channel?: string;
  importance?: number;
}): Promise<string> {
  const db = await ensureDb();
  const now = Date.now();
  const id = `mem_${nanoid()}`;

  // Upsert: if same scope+content exists, boost importance instead of duplicate
  const existing = db
    .prepare(`
    SELECT id, importance, accessCount FROM memories
    WHERE scope = ? AND content = ? LIMIT 1
  `)
    .get(opts.scope, opts.content) as
    | { id: string; importance: number; accessCount: number }
    | undefined;

  if (existing) {
    const boostedImportance = Math.min(1.0, existing.importance + 0.05);
    db.prepare(`
      UPDATE memories SET importance = ?, accessCount = accessCount + 1, lastAccessedAt = ?
      WHERE id = ?
    `).run(boostedImportance, now, existing.id);
    return existing.id;
  }

  db.prepare(`
    INSERT INTO memories (id, scope, sessionKey, channel, content, memoryType, importance, accessCount, createdAt, lastAccessedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    id,
    opts.scope,
    opts.sessionKey ?? null,
    opts.channel ?? null,
    opts.content,
    opts.memoryType ?? "fact",
    opts.importance ?? 0.5,
    now,
    now,
  );

  return id;
}

/**
 * Semantic search using FTS5 BM25 + importance weighting.
 * Falls back to LIKE search if query has no indexable tokens.
 */
export async function searchMemory(opts: {
  scope?: string;
  query: string;
  limit?: number;
  minImportance?: number;
  memoryType?: MemoryType;
}): Promise<MemorySearchResult[]> {
  const db = await ensureDb();
  const limit = Math.min(opts.limit ?? 10, 50);

  // Sanitize FTS5 query — escape special chars
  const ftsQuery = opts.query
    .replace(/['"*[\]{}()|^~?\\]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .join(" OR ");

  if (!ftsQuery) {return [];}

  try {
    const scopeFilter = opts.scope ? `AND m.scope LIKE ?` : "";
    const typeFilter = opts.memoryType ? `AND m.memoryType = ?` : "";
    const importanceFilter = opts.minImportance ? `AND m.importance >= ?` : "";

    const params: unknown[] = [ftsQuery];
    if (opts.scope) {params.push(`${opts.scope}%`);}
    if (opts.memoryType) {params.push(opts.memoryType);}
    if (opts.minImportance) {params.push(opts.minImportance);}
    params.push(limit);

    // BM25 score from FTS5, combined with importance and recency
    const rows = db
      .prepare(`
      SELECT
        m.id, m.scope, m.sessionKey, m.channel, m.content, m.memoryType,
        m.importance, m.accessCount, m.createdAt, m.lastAccessedAt,
        bm25(memories_fts) AS bm25score
      FROM memories_fts
      JOIN memories m ON memories_fts.rowid = m.rowid
      WHERE memories_fts MATCH ?
        ${scopeFilter} ${typeFilter} ${importanceFilter}
      ORDER BY
        (bm25(memories_fts) * -1) * 0.5
        + m.importance * 0.3
        + (CAST(m.lastAccessedAt AS REAL) / ${Date.now()}) * 0.2
        DESC
      LIMIT ?
    `)
      .all(...(params as Parameters<typeof db.prepare>[0][])) as unknown as (SovereignMemory & {
      bm25score: number;
    })[];

    // Bump access count for retrieved memories
    if (rows.length > 0) {
      const ids = rows.map((r) => `'${r.id}'`).join(",");
      db.exec(
        `UPDATE memories SET accessCount = accessCount + 1, lastAccessedAt = ${Date.now()} WHERE id IN (${ids})`,
      );
    }

    return rows.map((row, i) => ({
      memory: {
        id: row.id,
        scope: row.scope,
        sessionKey: row.sessionKey,
        channel: row.channel,
        content: row.content,
        memoryType: row.memoryType,
        importance: row.importance,
        accessCount: row.accessCount,
        createdAt: row.createdAt,
        lastAccessedAt: row.lastAccessedAt,
      },
      score: Math.max(0, Math.min(1, (row.bm25score * -1) / 10)),
      rank: i + 1,
    }));
  } catch {
    // FTS5 parse error — fall back to LIKE search
    return likeSearch(db, opts, limit);
  }
}

function likeSearch(
  db: DatabaseSync,
  opts: { scope?: string; query: string; memoryType?: MemoryType; minImportance?: number },
  limit: number,
): MemorySearchResult[] {
  const params: unknown[] = [`%${opts.query}%`];
  let where = "WHERE content LIKE ?";
  if (opts.scope) {
    where += " AND scope LIKE ?";
    params.push(`${opts.scope}%`);
  }
  if (opts.memoryType) {
    where += " AND memoryType = ?";
    params.push(opts.memoryType);
  }
  if (opts.minImportance) {
    where += " AND importance >= ?";
    params.push(opts.minImportance);
  }
  params.push(limit);

  const rows = db
    .prepare(`
    SELECT * FROM memories ${where} ORDER BY importance DESC, lastAccessedAt DESC LIMIT ?
  `)
    .all(...(params as Parameters<typeof db.prepare>[0][]), limit) as unknown as SovereignMemory[];

  return rows.map((row, i) => ({ memory: row, score: row.importance, rank: i + 1 }));
}

/**
 * Retrieve a formatted "context block" for prompt injection.
 * Queries the top-N most relevant memories, formats as markdown.
 */
export async function recallContext(opts: {
  scope: string;
  query: string;
  maxTokens?: number;
  limit?: number;
}): Promise<{ text: string; memoriesUsed: number }> {
  const results = await searchMemory({
    scope: opts.scope,
    query: opts.query,
    limit: opts.limit ?? 8,
    minImportance: 0.2,
  });

  if (results.length === 0) {return { text: "", memoriesUsed: 0 };}

  const maxTokens = opts.maxTokens ?? 1500;
  const parts: string[] = [];
  let estimatedTokens = 0;

  const typeEmoji: Record<string, string> = {
    fact: "📌",
    summary: "📋",
    anchor: "⚓",
    skill: "🔧",
    relationship: "🤝",
    event: "📅",
    preference: "💡",
  };

  for (const { memory } of results) {
    const line = `${typeEmoji[memory.memoryType] ?? "•"} ${memory.content}`;
    const tokens = Math.ceil(line.length / 4);
    if (estimatedTokens + tokens > maxTokens) {break;}
    parts.push(line);
    estimatedTokens += tokens;
  }

  const text = parts.length > 0 ? `### Recalled Memories\n${parts.join("\n")}` : "";

  return { text, memoriesUsed: parts.length };
}

/**
 * List memories for a scope, paginated.
 */
export async function listMemories(opts: {
  scope?: string;
  memoryType?: MemoryType;
  limit?: number;
  offset?: number;
}): Promise<{ memories: SovereignMemory[]; total: number }> {
  const db = await ensureDb();
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  const params: unknown[] = [];
  let where = "WHERE 1=1";
  if (opts.scope) {
    where += " AND scope LIKE ?";
    params.push(`${opts.scope}%`);
  }
  if (opts.memoryType) {
    where += " AND memoryType = ?";
    params.push(opts.memoryType);
  }

  const total = (
    db
      .prepare(`SELECT COUNT(*) as c FROM memories ${where}`)
      .get(...(params as Parameters<typeof db.prepare>[0][])) as unknown as { c: number }
  ).c;

  const memories = db
    .prepare(`
    SELECT * FROM memories ${where}
    ORDER BY importance DESC, lastAccessedAt DESC
    LIMIT ? OFFSET ?
  `)
    .all(
      ...(params as Parameters<typeof db.prepare>[0][]),
      limit,
      offset,
    ) as unknown as SovereignMemory[];

  return { memories, total };
}

/**
 * Delete a specific memory by id.
 */
export async function forgetMemory(id: string): Promise<boolean> {
  const db = await ensureDb();
  const result = db.prepare("DELETE FROM memories WHERE id = ?").run(id);
  return Number(result.changes) > 0;
}

// ── Knowledge Graph (Persistent) ─────────────────────────────────────────────

export async function storeGraphNode(
  node: Omit<GraphNode, "createdAt" | "lastAccessedAt"> & {
    createdAt?: number;
    lastAccessedAt?: number;
  },
): Promise<void> {
  const db = await ensureDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO graph_nodes (id, label, nodeType, scope, importance, accessCount, metadata, createdAt, lastAccessedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      importance = MAX(importance, excluded.importance),
      accessCount = accessCount + 1,
      lastAccessedAt = excluded.lastAccessedAt,
      metadata = excluded.metadata
  `).run(
    node.id,
    node.label,
    node.nodeType,
    node.scope,
    node.importance,
    node.accessCount,
    JSON.stringify(node.metadata ?? {}),
    node.createdAt ?? now,
    node.lastAccessedAt ?? now,
  );
}

export async function storeGraphEdge(
  edge: Omit<GraphEdge, "createdAt" | "lastReinforcedAt"> & {
    createdAt?: number;
    lastReinforcedAt?: number;
  },
): Promise<void> {
  const db = await ensureDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO graph_edges (id, sourceId, targetId, relation, weight, scope, createdAt, lastReinforcedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      weight = MIN(1.0, weight + 0.05),
      lastReinforcedAt = excluded.lastReinforcedAt
  `).run(
    edge.id,
    edge.sourceId,
    edge.targetId,
    edge.relation,
    edge.weight,
    edge.scope,
    edge.createdAt ?? now,
    edge.lastReinforcedAt ?? now,
  );
}

export async function getGraphNodes(scope: string): Promise<GraphNode[]> {
  const db = await ensureDb();
  const rows = db
    .prepare("SELECT * FROM graph_nodes WHERE scope LIKE ? ORDER BY importance DESC")
    .all(`${scope}%`) as (Omit<GraphNode, "metadata"> & { metadata: string })[];
  return rows.map((r) => ({ ...r, metadata: JSON.parse(r.metadata) as Record<string, unknown> }));
}

export async function getGraphEdges(scope: string): Promise<GraphEdge[]> {
  const db = await ensureDb();
  return db
    .prepare("SELECT * FROM graph_edges WHERE scope LIKE ? ORDER BY weight DESC")
    .all(`${scope}%`) as unknown as GraphEdge[];
}

// ── Cross-Channel Session Registry ──────────────────────────────────────────

export async function registerChannelSession(opts: {
  scope: string;
  sessionKey: string;
  channel: string;
  displayName?: string;
}): Promise<ChannelSession> {
  const db = await ensureDb();
  const now = Date.now();
  const id = `chs_${nanoid()}`;

  db.prepare(`
    INSERT INTO channel_sessions (id, scope, sessionKey, channel, displayName, lastMessageAt, messageCount)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(scope, sessionKey, channel) DO UPDATE SET
      lastMessageAt = excluded.lastMessageAt,
      messageCount = messageCount + 1,
      displayName = COALESCE(excluded.displayName, displayName)
  `).run(id, opts.scope, opts.sessionKey, opts.channel, opts.displayName ?? null, now);

  const row = db
    .prepare("SELECT * FROM channel_sessions WHERE scope = ? AND sessionKey = ? AND channel = ?")
    .get(opts.scope, opts.sessionKey, opts.channel);
  return row as unknown as ChannelSession;
}

export async function getSessionsByScope(scope: string): Promise<ChannelSession[]> {
  const db = await ensureDb();
  return db
    .prepare(`
    SELECT * FROM channel_sessions WHERE scope LIKE ?
    ORDER BY lastMessageAt DESC
  `)
    .all(`${scope}%`) as unknown as ChannelSession[];
}

export async function getAllSessions(): Promise<ChannelSession[]> {
  const db = await ensureDb();
  return db
    .prepare("SELECT * FROM channel_sessions ORDER BY lastMessageAt DESC LIMIT 500")
    .all() as unknown as ChannelSession[];
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getMemoryStats(scope?: string): Promise<MemoryStats[]> {
  const db = await ensureDb();

  if (scope) {
    const m = db
      .prepare(`
      SELECT
        scope,
        COUNT(*) as memoriesCount,
        MIN(createdAt) as oldest,
        MAX(createdAt) as newest
      FROM memories WHERE scope LIKE ? GROUP BY scope
    `)
      .get(`${scope}%`) as
      | { scope: string; memoriesCount: number; oldest: number; newest: number }
      | undefined;

    const nodes = (
      db.prepare("SELECT COUNT(*) as c FROM graph_nodes WHERE scope LIKE ?").get(`${scope}%`) as {
        c: number;
      }
    ).c;
    const edges = (
      db.prepare("SELECT COUNT(*) as c FROM graph_edges WHERE scope LIKE ?").get(`${scope}%`) as {
        c: number;
      }
    ).c;
    const sessions = (
      db
        .prepare("SELECT COUNT(*) as c FROM channel_sessions WHERE scope LIKE ?")
        .get(`${scope}%`) as { c: number }
    ).c;

    return [
      {
        scope: scope,
        memoriesCount: m?.memoriesCount ?? 0,
        nodesCount: nodes,
        edgesCount: edges,
        sessionsCount: sessions,
        oldestMemoryAt: m?.oldest ?? null,
        newestMemoryAt: m?.newest ?? null,
      },
    ];
  }

  // Aggregate across all scopes
  const scopes = db.prepare("SELECT DISTINCT scope FROM memories").all() as { scope: string }[];
  const results: MemoryStats[] = [];

  for (const { scope: s } of scopes) {
    const stats = await getMemoryStats(s);
    if (stats[0]) {results.push(stats[0]);}
  }

  return results;
}

/**
 * Close the database (for clean shutdown).
 */
export function closeSovereignMemory(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
