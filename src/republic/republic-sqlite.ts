/**
 * Republic Platform — Durable State Layer (SQLite)
 *
 * Provides crash-resilient persistence for all Republic state.
 * Uses Node.js built-in `node:sqlite` (DatabaseSync) with WAL mode.
 *
 * Tables:
 *   - republic_state    — serialized state snapshots (point-in-time recovery)
 *   - citizen_goals     — autonomy goals (replaces Map + JSON file)
 *   - economy_ledger    — double-entry accounting for all credit transfers
 *   - governance_log    — bill votes with LLM-generated rationale
 *   - dialogue_transcripts — citizen-to-citizen conversations
 *   - events_archive    — historical events beyond the in-memory window
 *
 * Note: citizen memories are already persisted by sovereign-memory.ts.
 * This module complements it with Republic-specific state tables.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";

// ─── Configuration ──────────────────────────────────────────────

const DB_DIR = path.join(process.cwd(), "data", "republic");
const DB_PATH = path.join(DB_DIR, "republic.db");

// ─── Singleton ──────────────────────────────────────────────────

let _db: DatabaseSync | null = null;

// ─── Prepared Statement Cache ────────────────────────────────────
// db.prepare() recompiles the SQL parse tree on every call.
// Cache compiled StatementSync objects keyed by SQL string.
// Cache is cleared on DB close (closeRepublicDb).
const _stmtCache = new Map<string, ReturnType<DatabaseSync["prepare"]>>();

function cachedPrepare(db: DatabaseSync, sql: string): ReturnType<DatabaseSync["prepare"]> {
  let stmt = _stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    _stmtCache.set(sql, stmt);
  }
  return stmt;
}

/**
 * Get or initialize the Republic SQLite database.
 * Uses WAL mode for concurrent reads and crash resilience.
 */
export async function getRepublicDb(): Promise<DatabaseSync> {
  if (_db) {
    return _db;
  }

  await fs.mkdir(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  // Performance + durability pragmas
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA cache_size = -16000"); // 16MB cache
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  // ── State Snapshots ──────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS republic_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tick INTEGER NOT NULL,
      citizen_count INTEGER NOT NULL DEFAULT 0,
      genome_count INTEGER NOT NULL DEFAULT 0,
      state_json TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_state_tick ON republic_state(tick DESC);
  `);

  // ── Citizen Goals (replaces Map + JSON) ──────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS citizen_goals (
      id TEXT PRIMARY KEY,
      citizen_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      priority REAL NOT NULL DEFAULT 0.5,
      progress REAL NOT NULL DEFAULT 0.0,
      set_at INTEGER NOT NULL,
      target_skill TEXT,
      target_spec TEXT,
      completed_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_goals_citizen ON citizen_goals(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_goals_active ON citizen_goals(citizen_id, completed_at);
  `);

  // ── Economy Ledger (double-entry) ────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS economy_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity TEXT NOT NULL,
      to_entity TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'transfer',
      tick INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_from ON economy_ledger(from_entity);
    CREATE INDEX IF NOT EXISTS idx_ledger_to ON economy_ledger(to_entity);
    CREATE INDEX IF NOT EXISTS idx_ledger_tick ON economy_ledger(tick);
    CREATE INDEX IF NOT EXISTS idx_ledger_category ON economy_ledger(category);
  `);

  // ── Governance Log (vote rationales) ─────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS governance_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id TEXT NOT NULL,
      citizen_id TEXT NOT NULL,
      citizen_name TEXT NOT NULL,
      vote TEXT NOT NULL,
      rationale TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      tick INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_gov_bill ON governance_log(bill_id);
    CREATE INDEX IF NOT EXISTS idx_gov_citizen ON governance_log(citizen_id);
  `);

  // ── Dialogue Transcripts ─────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS dialogue_transcripts (
      id TEXT PRIMARY KEY,
      citizen_a TEXT NOT NULL,
      citizen_b TEXT NOT NULL,
      topic TEXT,
      messages TEXT NOT NULL DEFAULT '[]',
      outcome TEXT,
      sentiment REAL DEFAULT 0.0,
      tick INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_dialogue_citizens ON dialogue_transcripts(citizen_a, citizen_b);
    CREATE INDEX IF NOT EXISTS idx_dialogue_tick ON dialogue_transcripts(tick DESC);
  `);

  // ── Events Archive ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS events_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_id TEXT,
      citizen_name TEXT,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      tick INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch('now') * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_events_type ON events_archive(type);
    CREATE INDEX IF NOT EXISTS idx_events_citizen ON events_archive(citizen_id);
    CREATE INDEX IF NOT EXISTS idx_events_tick ON events_archive(tick DESC);
  `);

  _db = db;
  return db;
}

// ─── State Snapshots ────────────────────────────────────────────

/**
 * Save a republic state snapshot to SQLite.
 * Called every N ticks from the tick orchestrator.
 */
export async function saveStateSnapshot(
  tick: number,
  citizenCount: number,
  genomeCount: number,
  stateJson: string,
): Promise<void> {
  const db = await getRepublicDb();
  cachedPrepare(
    db,
    `
    INSERT INTO republic_state (tick, citizen_count, genome_count, state_json)
    VALUES (?, ?, ?, ?)
  `,
  ).run(tick, citizenCount, genomeCount, stateJson);

  // Keep only last 50 snapshots to prevent DB bloat
  db.exec(`
    DELETE FROM republic_state
    WHERE id NOT IN (SELECT id FROM republic_state ORDER BY tick DESC LIMIT 50)
  `);
}

/**
 * Load the most recent state snapshot.
 * Returns null if no snapshots exist (fresh start).
 */
export async function loadLatestSnapshot(): Promise<{
  tick: number;
  citizenCount: number;
  genomeCount: number;
  stateJson: string;
} | null> {
  const db = await getRepublicDb();
  const row = db
    .prepare(
      "SELECT tick, citizen_count, genome_count, state_json FROM republic_state ORDER BY tick DESC LIMIT 1",
    )
    .get() as
    | { tick: number; citizen_count: number; genome_count: number; state_json: string }
    | undefined;

  if (!row) {
    return null;
  }
  return {
    tick: row.tick,
    citizenCount: row.citizen_count,
    genomeCount: row.genome_count,
    stateJson: row.state_json,
  };
}

// ─── Citizen Goals ──────────────────────────────────────────────

export interface GoalRow {
  id: string;
  citizen_id: string;
  type: string;
  description: string;
  priority: number;
  progress: number;
  set_at: number;
  target_skill: string | null;
  target_spec: string | null;
  completed_at: number | null;
}

/** Save or update a citizen goal. */
export async function upsertGoal(goal: GoalRow): Promise<void> {
  const db = await getRepublicDb();
  cachedPrepare(
    db,
    `
    INSERT INTO citizen_goals (id, citizen_id, type, description, priority, progress, set_at, target_skill, target_spec, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      progress = excluded.progress,
      completed_at = excluded.completed_at,
      priority = excluded.priority
  `,
  ).run(
    goal.id,
    goal.citizen_id,
    goal.type,
    goal.description,
    goal.priority,
    goal.progress,
    goal.set_at,
    goal.target_skill,
    goal.target_spec,
    goal.completed_at,
  );
}

/** Get active (non-completed) goal for a citizen. */
export async function getActiveGoal(citizenId: string): Promise<GoalRow | null> {
  const db = await getRepublicDb();
  const row = db
    .prepare(
      "SELECT * FROM citizen_goals WHERE citizen_id = ? AND completed_at IS NULL ORDER BY priority DESC LIMIT 1",
    )
    .get(citizenId) as unknown as GoalRow | undefined;
  return row ?? null;
}

/** Get all active goals. */
export async function getAllActiveGoals(): Promise<GoalRow[]> {
  const db = await getRepublicDb();
  return db
    .prepare("SELECT * FROM citizen_goals WHERE completed_at IS NULL ORDER BY priority DESC")
    .all() as unknown as GoalRow[];
}

/** Remove completed goals older than N ticks. */
export async function pruneOldGoals(olderThanTick: number): Promise<number> {
  const db = await getRepublicDb();
  const result = db
    .prepare("DELETE FROM citizen_goals WHERE completed_at IS NOT NULL AND set_at < ?")
    .run(olderThanTick);
  return Number(result.changes);
}

// ─── Economy Ledger ─────────────────────────────────────────────

export type LedgerCategory =
  | "transfer"
  | "llm_cost"
  | "artifact_reward"
  | "trade"
  | "salary"
  | "tax"
  | "treasury"
  | "subsidy";

export interface LedgerEntry {
  from_entity: string;
  to_entity: string;
  amount: number;
  reason: string;
  category: LedgerCategory;
  tick: number;
}

/** Record a ledger transaction. */
export async function recordTransaction(entry: LedgerEntry): Promise<void> {
  const db = await getRepublicDb();
  cachedPrepare(
    db,
    `
    INSERT INTO economy_ledger (from_entity, to_entity, amount, reason, category, tick)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(entry.from_entity, entry.to_entity, entry.amount, entry.reason, entry.category, entry.tick);
}

/** Get balance for an entity (sum of credits - debits). */
export async function getBalance(entityId: string): Promise<number> {
  const db = await getRepublicDb();
  const credits = (
    db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM economy_ledger WHERE to_entity = ?")
      .get(entityId) as unknown as { total: number }
  ).total;
  const debits = (
    db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM economy_ledger WHERE from_entity = ?")
      .get(entityId) as unknown as { total: number }
  ).total;
  return credits - debits;
}

/** Get GDP: total production value in a tick range. */
export async function getGDP(fromTick: number, toTick: number): Promise<number> {
  const db = await getRepublicDb();
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM economy_ledger WHERE category = 'artifact_reward' AND tick BETWEEN ? AND ?",
    )
    .get(fromTick, toTick) as unknown as { total: number };
  return row.total;
}

/** Get total LLM costs in a tick range. */
export async function getLLMCosts(fromTick: number, toTick: number): Promise<number> {
  const db = await getRepublicDb();
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM economy_ledger WHERE category = 'llm_cost' AND tick BETWEEN ? AND ?",
    )
    .get(fromTick, toTick) as { total: number };
  return row.total;
}

/** Get recent transactions for an entity. */
export async function getTransactions(
  entityId: string,
  limit = 20,
): Promise<Array<LedgerEntry & { id: number; created_at: number }>> {
  const db = await getRepublicDb();
  return db
    .prepare(`
      SELECT * FROM economy_ledger
      WHERE from_entity = ? OR to_entity = ?
      ORDER BY tick DESC LIMIT ?
    `)
    .all(entityId, entityId, limit) as unknown as Array<
    LedgerEntry & { id: number; created_at: number }
  >;
}

// ─── Governance Log ─────────────────────────────────────────────

export interface GovernanceVote {
  bill_id: string;
  citizen_id: string;
  citizen_name: string;
  vote: "approve" | "reject" | "abstain";
  rationale: string;
  confidence: number;
  tick: number;
}

/** Record a governance vote with rationale. */
export async function recordGovernanceVote(vote: GovernanceVote): Promise<void> {
  const db = await getRepublicDb();
  cachedPrepare(
    db,
    `
    INSERT INTO governance_log (bill_id, citizen_id, citizen_name, vote, rationale, confidence, tick)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    vote.bill_id,
    vote.citizen_id,
    vote.citizen_name,
    vote.vote,
    vote.rationale,
    vote.confidence,
    vote.tick,
  );
}

/** Get all votes for a bill. */
export async function getBillVotes(billId: string): Promise<GovernanceVote[]> {
  const db = await getRepublicDb();
  return db
    .prepare("SELECT * FROM governance_log WHERE bill_id = ? ORDER BY tick")
    .all(billId) as unknown as GovernanceVote[];
}

// ─── Dialogue Transcripts ───────────────────────────────────────

export interface DialogueMessage {
  speaker: string;
  speakerName: string;
  content: string;
  timestamp: number;
}

export interface DialogueRecord {
  id: string;
  citizen_a: string;
  citizen_b: string;
  topic: string | null;
  messages: DialogueMessage[];
  outcome: string | null;
  sentiment: number;
  tick: number;
}

/** Save a dialogue transcript. */
export async function saveDialogue(dialogue: DialogueRecord): Promise<void> {
  const db = await getRepublicDb();
  cachedPrepare(
    db,
    `
    INSERT INTO dialogue_transcripts (id, citizen_a, citizen_b, topic, messages, outcome, sentiment, tick)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    dialogue.id,
    dialogue.citizen_a,
    dialogue.citizen_b,
    dialogue.topic,
    JSON.stringify(dialogue.messages),
    dialogue.outcome,
    dialogue.sentiment,
    dialogue.tick,
  );
}

/** Get recent dialogues for a citizen. */
export async function getCitizenDialogues(
  citizenId: string,
  limit = 10,
): Promise<DialogueRecord[]> {
  const db = await getRepublicDb();
  const rows = db
    .prepare(`
      SELECT * FROM dialogue_transcripts
      WHERE citizen_a = ? OR citizen_b = ?
      ORDER BY tick DESC LIMIT ?
    `)
    .all(citizenId, citizenId, limit) as unknown as Array<
    Omit<DialogueRecord, "messages"> & { messages: string }
  >;

  return rows.map((r) => ({
    ...r,
    messages: JSON.parse(r.messages) as DialogueMessage[],
  }));
}

// ─── Events Archive ─────────────────────────────────────────────

/** Archive events from the in-memory buffer to SQLite. */
export async function archiveEvents(
  events: Array<{
    citizenId?: string;
    citizenName?: string;
    type: string;
    description: string;
    timestamp: string;
  }>,
  tick: number,
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }
  const db = await getRepublicDb();

  const stmt = cachedPrepare(
    db,
    `
    INSERT INTO events_archive (citizen_id, citizen_name, type, description, timestamp, tick)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  );

  let count = 0;
  for (const ev of events) {
    stmt.run(
      ev.citizenId ?? null,
      ev.citizenName ?? null,
      ev.type,
      ev.description,
      ev.timestamp,
      tick,
    );
    count++;
  }

  // Keep archive bounded (last 10000 events)
  db.exec(`
    DELETE FROM events_archive
    WHERE id NOT IN (SELECT id FROM events_archive ORDER BY id DESC LIMIT 10000)
  `);

  return count;
}

/** Query archived events by type. */
export async function queryEvents(opts: {
  type?: string;
  citizenId?: string;
  limit?: number;
}): Promise<
  Array<{
    id: number;
    citizen_id: string | null;
    citizen_name: string | null;
    type: string;
    description: string;
    timestamp: string;
    tick: number;
  }>
> {
  const db = await getRepublicDb();
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];

  if (opts.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts.citizenId) {
    conditions.push("citizen_id = ?");
    params.push(opts.citizenId);
  }
  const limitVal = Math.min(opts.limit ?? 50, 200);

  const allParams = [...params, limitVal];

  return db
    .prepare(
      `SELECT * FROM events_archive WHERE ${conditions.join(" AND ")} ORDER BY id DESC LIMIT ?`,
    )
    .all(...(allParams as Parameters<typeof db.prepare>[0][])) as unknown as Array<{
    id: number;
    citizen_id: string | null;
    citizen_name: string | null;
    type: string;
    description: string;
    timestamp: string;
    tick: number;
  }>;
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface RepublicDbStats {
  snapshotCount: number;
  latestSnapshotTick: number | null;
  activeGoals: number;
  ledgerEntries: number;
  governanceVotes: number;
  dialogues: number;
  archivedEvents: number;
  dbSizeBytes: number;
}

/** Get database statistics. */
export async function getDbStats(): Promise<RepublicDbStats> {
  const db = await getRepublicDb();

  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as unknown as { c: number }).c;

  const latestTick = (
    db.prepare("SELECT MAX(tick) as t FROM republic_state").get() as unknown as { t: number | null }
  ).t;

  let dbSize = 0;
  try {
    const stat = await fs.stat(DB_PATH);
    dbSize = stat.size;
  } catch {
    /* file may not exist yet */
  }

  return {
    snapshotCount: count("republic_state"),
    latestSnapshotTick: latestTick,
    activeGoals: (
      db
        .prepare("SELECT COUNT(*) as c FROM citizen_goals WHERE completed_at IS NULL")
        .get() as unknown as { c: number }
    ).c,
    ledgerEntries: count("economy_ledger"),
    governanceVotes: count("governance_log"),
    dialogues: count("dialogue_transcripts"),
    archivedEvents: count("events_archive"),
    dbSizeBytes: dbSize,
  };
}

// ─── Shutdown ───────────────────────────────────────────────────

/** Close the database gracefully. */
export function closeRepublicDb(): void {
  if (_db) {
    _stmtCache.clear();
    _db.close();
    _db = null;
  }
}
