/**
 * dynamic-registry.ts — Universal Dynamic Registry Engine
 *
 * A generic, SQLite-backed registry that stores typed entries with:
 * - Domain partitioning (prompts, tools, knowledge, workflows, pipelines)
 * - Full CRUD with auto-versioning
 * - Full-text search via SQLite FTS5
 * - Lazy-loaded in-memory cache per domain
 * - Change event bus (emits to Intelligence Bus)
 * - Idempotent seeding for built-in data
 * - Import / export as JSON bundles
 *
 * All domain-specific registries (prompt-registry, tool-def-registry, etc.)
 * are thin wrappers around this engine.
 */

import { getRepublicDb } from "./republic-sqlite.js";

// ─── Types ──────────────────────────────────────────────────────

export interface RegistryEntryMetadata {
  createdAt: string;
  updatedAt: string;
  createdBy: string; // "system" | citizen ID | "ui"
  tags: string[]; // free-form searchable tags
  description: string; // human summary
  source: "builtin" | "user" | "plugin" | "citizen";
}

export interface RegistryEntry<T = unknown> {
  id: string; // unique slug (e.g., "sandbox_exec")
  domain: string; // partition key (e.g., "sandbox-tools", "knowledge")
  category: string; // sub-category for filtering
  version: number; // auto-incremented revision
  enabled: boolean; // soft-disable without deletion
  priority: number; // ordering within domain (0 = highest)
  data: T; // the actual payload
  metadata: RegistryEntryMetadata;
}

export interface RegistryChangeEvent<T = unknown> {
  type: "created" | "updated" | "deleted" | "enabled" | "disabled";
  entry: RegistryEntry<T>;
  previousVersion?: number;
  timestamp: string;
}

export interface RegistryListOptions {
  domain?: string;
  category?: string;
  enabled?: boolean;
  tags?: string[];
  source?: RegistryEntryMetadata["source"];
  limit?: number;
  offset?: number;
  orderBy?: "priority" | "updatedAt" | "id";
  orderDir?: "asc" | "desc";
}

export interface RegistryStats {
  totalEntries: number;
  enabledEntries: number;
  domains: Record<string, number>;
  sources: Record<string, number>;
}

// ─── Schema Migration ───────────────────────────────────────────

let _schemaInitialized = false;

async function ensureRegistrySchema(): Promise<void> {
  if (_schemaInitialized) {
    return;
  }
  const db = await getRepublicDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS registry_entries (
      id TEXT NOT NULL,
      domain TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 100,
      data_json TEXT NOT NULL DEFAULT '{}',
      meta_created_at TEXT NOT NULL,
      meta_updated_at TEXT NOT NULL,
      meta_created_by TEXT NOT NULL DEFAULT 'system',
      meta_tags TEXT NOT NULL DEFAULT '[]',
      meta_description TEXT NOT NULL DEFAULT '',
      meta_source TEXT NOT NULL DEFAULT 'builtin',
      PRIMARY KEY (id, domain)
    );
    CREATE INDEX IF NOT EXISTS idx_reg_domain ON registry_entries(domain);
    CREATE INDEX IF NOT EXISTS idx_reg_domain_cat ON registry_entries(domain, category);
    CREATE INDEX IF NOT EXISTS idx_reg_domain_enabled ON registry_entries(domain, enabled);
    CREATE INDEX IF NOT EXISTS idx_reg_domain_priority ON registry_entries(domain, priority);
  `);

  // History table for versioning
  db.exec(`
    CREATE TABLE IF NOT EXISTS registry_history (
      history_id INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL,
      domain TEXT NOT NULL,
      version INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      meta_json TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      changed_by TEXT NOT NULL DEFAULT 'system'
    );
    CREATE INDEX IF NOT EXISTS idx_reghist_id ON registry_history(id, domain);
  `);

  // FTS5 for full-text search (if not already created)
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS registry_fts USING fts5(
        id, domain, category, meta_description, meta_tags,
        content='registry_entries',
        content_rowid='rowid'
      );
    `);
  } catch {
    // FTS5 may not be available in all SQLite builds — degrade gracefully
  }

  _schemaInitialized = true;
}

// ─── In-Memory Cache ────────────────────────────────────────────

/** Per-domain cache; lazily loaded on first access */
const domainCaches = new Map<string, Map<string, RegistryEntry>>();

function getCacheForDomain(domain: string): Map<string, RegistryEntry> {
  let cache = domainCaches.get(domain);
  if (!cache) {
    cache = new Map();
    domainCaches.set(domain, cache);
  }
  return cache;
}

export function invalidateCache(domain: string): void {
  domainCaches.delete(domain);
}

// Track which domains have been loaded from DB
const loadedDomains = new Set<string>();

// ─── Change Listeners ───────────────────────────────────────────

type ChangeCallback = (event: RegistryChangeEvent) => void;
const changeListeners: ChangeCallback[] = [];

function emitChange(event: RegistryChangeEvent): void {
  for (const cb of changeListeners) {
    try {
      cb(event);
    } catch {
      /* listener error — don't crash */
    }
  }
}

// ─── Row ↔ Entry Conversion ─────────────────────────────────────

interface DbRow {
  id: string;
  domain: string;
  category: string;
  version: number;
  enabled: number;
  priority: number;
  data_json: string;
  meta_created_at: string;
  meta_updated_at: string;
  meta_created_by: string;
  meta_tags: string;
  meta_description: string;
  meta_source: string;
}

function rowToEntry<T>(row: DbRow): RegistryEntry<T> {
  return {
    id: row.id,
    domain: row.domain,
    category: row.category,
    version: row.version,
    enabled: row.enabled === 1,
    priority: row.priority,
    data: JSON.parse(row.data_json) as T,
    metadata: {
      createdAt: row.meta_created_at,
      updatedAt: row.meta_updated_at,
      createdBy: row.meta_created_by,
      tags: JSON.parse(row.meta_tags) as string[],
      description: row.meta_description,
      source: row.meta_source as RegistryEntryMetadata["source"],
    },
  };
}

// ─── Core CRUD ──────────────────────────────────────────────────

/**
 * Load all entries for a domain from SQLite into the in-memory cache.
 * Called lazily on first access to a domain.
 */
async function loadDomain(domain: string): Promise<void> {
  if (loadedDomains.has(domain)) {
    return;
  }
  await ensureRegistrySchema();
  const db = await getRepublicDb();

  const rows = db
    .prepare("SELECT * FROM registry_entries WHERE domain = ? ORDER BY priority ASC")
    .all(domain) as unknown as DbRow[];

  const cache = getCacheForDomain(domain);
  for (const row of rows) {
    cache.set(row.id, rowToEntry(row));
  }
  loadedDomains.add(domain);
}

/**
 * Get a single entry by (id, domain).
 */
export async function registryGet<T = unknown>(
  id: string,
  domain: string,
): Promise<RegistryEntry<T> | null> {
  await loadDomain(domain);
  const cache = getCacheForDomain(domain);
  return (cache.get(id) as RegistryEntry<T>) ?? null;
}

/**
 * List entries with optional filtering.
 */
export async function registryList<T = unknown>(
  opts: RegistryListOptions = {},
): Promise<RegistryEntry<T>[]> {
  // If a specific domain is given, ensure it's loaded
  if (opts.domain) {
    await loadDomain(opts.domain);
  } else {
    await ensureRegistrySchema();
  }

  // Build query for flexibility
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];

  if (opts.domain) {
    conditions.push("domain = ?");
    params.push(opts.domain);
  }
  if (opts.category) {
    conditions.push("category = ?");
    params.push(opts.category);
  }
  if (opts.enabled !== undefined) {
    conditions.push("enabled = ?");
    params.push(opts.enabled ? 1 : 0);
  }
  if (opts.source) {
    conditions.push("meta_source = ?");
    params.push(opts.source);
  }

  const orderBy =
    opts.orderBy === "updatedAt" ? "meta_updated_at" : opts.orderBy === "id" ? "id" : "priority";
  const orderDir = opts.orderDir === "desc" ? "DESC" : "ASC";
  const limit = Math.min(opts.limit ?? 500, 2000);
  const offset = opts.offset ?? 0;

  const db = await getRepublicDb();
  const sql = `SELECT * FROM registry_entries WHERE ${conditions.join(" AND ")} ORDER BY ${orderBy} ${orderDir} LIMIT ? OFFSET ?`;
  const rows = db
    .prepare(sql)
    .all(...(params as (string | number | null)[]), limit, offset) as unknown as DbRow[];

  let entries = rows.map((r) => rowToEntry<T>(r));

  // Post-filter: tags (SQLite doesn't natively search JSON arrays well)
  if (opts.tags && opts.tags.length > 0) {
    const tagSet = new Set(opts.tags.map((t) => t.toLowerCase()));
    entries = entries.filter((e) => e.metadata.tags.some((t) => tagSet.has(t.toLowerCase())));
  }

  return entries;
}

/**
 * Create or update an entry. Auto-increments version on updates.
 * Returns the final entry.
 */
export async function registryUpsert<T = unknown>(entry: {
  id: string;
  domain: string;
  data: T;
  category?: string;
  enabled?: boolean;
  priority?: number;
  metadata?: Partial<RegistryEntryMetadata>;
}): Promise<RegistryEntry<T>> {
  await ensureRegistrySchema();
  const db = await getRepublicDb();
  const now = new Date().toISOString();

  // Check if exists
  const existing = db
    .prepare("SELECT * FROM registry_entries WHERE id = ? AND domain = ?")
    .get(entry.id, entry.domain) as unknown as DbRow | undefined;

  if (existing) {
    // Update — increment version
    const newVersion = existing.version + 1;
    const tags = entry.metadata?.tags ?? JSON.parse(existing.meta_tags);
    const description = entry.metadata?.description ?? existing.meta_description;
    const source = entry.metadata?.source ?? existing.meta_source;

    // Save to history before updating
    db.prepare(`
      INSERT INTO registry_history (id, domain, version, data_json, meta_json, changed_at, changed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      existing.id,
      existing.domain,
      existing.version,
      existing.data_json,
      JSON.stringify({
        tags: JSON.parse(existing.meta_tags),
        description: existing.meta_description,
        source: existing.meta_source,
      }),
      now,
      entry.metadata?.createdBy ?? "system",
    );

    db.prepare(`
      UPDATE registry_entries SET
        category = ?, version = ?, enabled = ?, priority = ?,
        data_json = ?, meta_updated_at = ?, meta_tags = ?,
        meta_description = ?, meta_source = ?
      WHERE id = ? AND domain = ?
    `).run(
      entry.category ?? existing.category,
      newVersion,
      entry.enabled !== undefined ? (entry.enabled ? 1 : 0) : existing.enabled,
      entry.priority ?? existing.priority,
      JSON.stringify(entry.data),
      now,
      JSON.stringify(tags),
      description,
      source,
      entry.id,
      entry.domain,
    );

    const updated = rowToEntry<T>({
      ...existing,
      category: entry.category ?? existing.category,
      version: newVersion,
      enabled: entry.enabled !== undefined ? (entry.enabled ? 1 : 0) : existing.enabled,
      priority: entry.priority ?? existing.priority,
      data_json: JSON.stringify(entry.data),
      meta_updated_at: now,
      meta_tags: JSON.stringify(tags),
      meta_description: description,
      meta_source: source,
    });

    // Update cache
    const cache = getCacheForDomain(entry.domain);
    cache.set(entry.id, updated as RegistryEntry);

    emitChange({
      type: "updated",
      entry: updated as RegistryEntry,
      previousVersion: existing.version,
      timestamp: now,
    });

    return updated;
  }

  // Insert new entry
  const createdBy = entry.metadata?.createdBy ?? "system";
  const tags = entry.metadata?.tags ?? [];
  const description = entry.metadata?.description ?? "";
  const source = entry.metadata?.source ?? "builtin";

  db.prepare(`
    INSERT INTO registry_entries
      (id, domain, category, version, enabled, priority, data_json,
       meta_created_at, meta_updated_at, meta_created_by, meta_tags,
       meta_description, meta_source)
    VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.domain,
    entry.category ?? "",
    entry.enabled !== undefined ? (entry.enabled ? 1 : 0) : 1,
    entry.priority ?? 100,
    JSON.stringify(entry.data),
    now,
    now,
    createdBy,
    JSON.stringify(tags),
    description,
    source,
  );

  const created: RegistryEntry<T> = {
    id: entry.id,
    domain: entry.domain,
    category: entry.category ?? "",
    version: 1,
    enabled: entry.enabled ?? true,
    priority: entry.priority ?? 100,
    data: entry.data,
    metadata: {
      createdAt: now,
      updatedAt: now,
      createdBy,
      tags,
      description,
      source,
    },
  };

  // Update cache
  const cache = getCacheForDomain(entry.domain);
  cache.set(entry.id, created as RegistryEntry);

  emitChange({
    type: "created",
    entry: created as RegistryEntry,
    timestamp: now,
  });

  return created;
}

/**
 * Soft-delete an entry (removes from DB and cache).
 */
export async function registryRemove(id: string, domain: string): Promise<boolean> {
  await ensureRegistrySchema();
  const db = await getRepublicDb();

  const existing = db
    .prepare("SELECT * FROM registry_entries WHERE id = ? AND domain = ?")
    .get(id, domain) as unknown as DbRow | undefined;

  if (!existing) {
    return false;
  }

  // Save final version to history
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO registry_history (id, domain, version, data_json, meta_json, changed_at, changed_by)
    VALUES (?, ?, ?, ?, ?, ?, 'deleted')
  `).run(
    id,
    domain,
    existing.version,
    existing.data_json,
    JSON.stringify({
      tags: JSON.parse(existing.meta_tags),
      description: existing.meta_description,
    }),
    now,
  );

  db.prepare("DELETE FROM registry_entries WHERE id = ? AND domain = ?").run(id, domain);

  const cache = getCacheForDomain(domain);
  cache.delete(id);

  emitChange({
    type: "deleted",
    entry: rowToEntry(existing),
    timestamp: now,
  });

  return true;
}

/**
 * Enable/disable an entry.
 */
export async function registrySetEnabled(
  id: string,
  domain: string,
  enabled: boolean,
): Promise<boolean> {
  await ensureRegistrySchema();
  const db = await getRepublicDb();

  const result = db
    .prepare(
      "UPDATE registry_entries SET enabled = ?, meta_updated_at = ? WHERE id = ? AND domain = ?",
    )
    .run(enabled ? 1 : 0, new Date().toISOString(), id, domain);

  if (Number(result.changes) === 0) {
    return false;
  }

  // Update cache
  const cache = getCacheForDomain(domain);
  const cached = cache.get(id);
  if (cached) {
    cached.enabled = enabled;
    cached.metadata.updatedAt = new Date().toISOString();
  }

  emitChange({
    type: enabled ? "enabled" : "disabled",
    entry: cached ?? ({ id, domain, enabled } as unknown as RegistryEntry),
    timestamp: new Date().toISOString(),
  });

  return true;
}

// ─── Search ─────────────────────────────────────────────────────

/**
 * Full-text search across registries.
 * Falls back to LIKE if FTS5 is unavailable.
 */
export async function registrySearch<T = unknown>(
  query: string,
  opts?: { domain?: string; limit?: number },
): Promise<RegistryEntry<T>[]> {
  await ensureRegistrySchema();
  const db = await getRepublicDb();
  const limit = Math.min(opts?.limit ?? 50, 200);

  // Fallback to LIKE-based search (universal compatibility)
  const conditions: string[] = [
    "(id LIKE ? OR meta_description LIKE ? OR meta_tags LIKE ? OR category LIKE ?)",
  ];
  const likeParam = `%${query}%`;
  const params: unknown[] = [likeParam, likeParam, likeParam, likeParam];

  if (opts?.domain) {
    conditions.push("domain = ?");
    params.push(opts.domain);
  }

  const sql = `SELECT * FROM registry_entries WHERE ${conditions.join(" AND ")} ORDER BY priority ASC LIMIT ?`;
  const rows = db
    .prepare(sql)
    .all(...(params as (string | number | null)[]), limit) as unknown as DbRow[];

  return rows.map((r) => rowToEntry<T>(r));
}

// ─── Versioning ─────────────────────────────────────────────────

/**
 * Get version history for an entry.
 */
export async function registryGetHistory<T = unknown>(
  id: string,
  domain: string,
  limit = 20,
): Promise<Array<{ version: number; data: T; changedAt: string; changedBy: string }>> {
  await ensureRegistrySchema();
  const db = await getRepublicDb();

  const rows = db
    .prepare(
      "SELECT version, data_json, changed_at, changed_by FROM registry_history WHERE id = ? AND domain = ? ORDER BY version DESC LIMIT ?",
    )
    .all(id, domain, limit) as unknown as Array<{
    version: number;
    data_json: string;
    changed_at: string;
    changed_by: string;
  }>;

  return rows.map((r) => ({
    version: r.version,
    data: JSON.parse(r.data_json) as T,
    changedAt: r.changed_at,
    changedBy: r.changed_by,
  }));
}

// ─── Bulk Operations ────────────────────────────────────────────

/**
 * Export all entries for a domain as a JSON-serializable array.
 */
export async function registryExport<T = unknown>(domain?: string): Promise<RegistryEntry<T>[]> {
  return registryList<T>(domain ? { domain } : {});
}

/**
 * Import entries from a JSON array.
 * Uses upsert semantics — existing entries are updated, new ones created.
 */
export async function registryImport<T = unknown>(
  entries: Array<
    Omit<RegistryEntry<T>, "version" | "metadata"> & {
      metadata?: Partial<RegistryEntryMetadata>;
    }
  >,
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const entry of entries) {
    try {
      await registryUpsert({
        id: entry.id,
        domain: entry.domain,
        category: entry.category,
        enabled: entry.enabled,
        priority: entry.priority,
        data: entry.data,
        metadata: {
          ...entry.metadata,
          source: entry.metadata?.source ?? "user",
          createdBy: entry.metadata?.createdBy ?? "import",
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  return { imported, skipped };
}

// ─── Seeding ────────────────────────────────────────────────────

/**
 * Seed a domain with built-in entries IF the domain is empty.
 * Idempotent — calling multiple times only populates on the first run.
 * Returns the number of entries seeded.
 */
export async function registrySeedIfEmpty<T = unknown>(
  domain: string,
  seeds: Array<{
    id: string;
    category?: string;
    priority?: number;
    data: T;
    tags?: string[];
    description?: string;
  }>,
): Promise<number> {
  await ensureRegistrySchema();
  const db = await getRepublicDb();

  // Check if domain already has entries
  const count = (
    db
      .prepare("SELECT COUNT(*) as c FROM registry_entries WHERE domain = ?")
      .get(domain) as unknown as { c: number }
  ).c;

  if (count > 0) {
    return 0;
  }

  // Seed all entries
  let seeded = 0;
  for (const seed of seeds) {
    await registryUpsert({
      id: seed.id,
      domain,
      category: seed.category ?? "",
      priority: seed.priority ?? 100,
      data: seed.data,
      metadata: {
        tags: seed.tags ?? [],
        description: seed.description ?? "",
        source: "builtin" as const,
        createdBy: "system",
      },
    });
    seeded++;
  }

  return seeded;
}

// ─── Statistics ─────────────────────────────────────────────────

/**
 * Get aggregate statistics across all registry domains.
 */
export async function registryGetStats(): Promise<RegistryStats> {
  await ensureRegistrySchema();
  const db = await getRepublicDb();

  const total = (
    db.prepare("SELECT COUNT(*) as c FROM registry_entries").get() as unknown as { c: number }
  ).c;

  const enabled = (
    db.prepare("SELECT COUNT(*) as c FROM registry_entries WHERE enabled = 1").get() as unknown as {
      c: number;
    }
  ).c;

  const domainRows = db
    .prepare("SELECT domain, COUNT(*) as c FROM registry_entries GROUP BY domain")
    .all() as unknown as Array<{ domain: string; c: number }>;
  const domains: Record<string, number> = {};
  for (const r of domainRows) {
    domains[r.domain] = r.c;
  }

  const sourceRows = db
    .prepare("SELECT meta_source, COUNT(*) as c FROM registry_entries GROUP BY meta_source")
    .all() as unknown as Array<{ meta_source: string; c: number }>;
  const sources: Record<string, number> = {};
  for (const r of sourceRows) {
    sources[r.meta_source] = r.c;
  }

  return { totalEntries: total, enabledEntries: enabled, domains, sources };
}

// ─── Event Subscription ────────────────────────────────────────

/**
 * Subscribe to registry change events.
 * Returns an unsubscribe function.
 */
export function onRegistryChange(callback: ChangeCallback): () => void {
  changeListeners.push(callback);
  return () => {
    const idx = changeListeners.indexOf(callback);
    if (idx >= 0) {
      changeListeners.splice(idx, 1);
    }
  };
}

// ─── Domain Constants ───────────────────────────────────────────

export const REGISTRY_DOMAINS = {
  KNOWLEDGE: "knowledge",
  TOOLS_SANDBOX: "sandbox-tools",
  TOOLS_REPUBLIC: "republic-tools",
  PROMPTS: "prompts",
  WORKFLOWS: "workflows",
  PIPELINES: "pipelines",
} as const;

export type RegistryDomain = (typeof REGISTRY_DOMAINS)[keyof typeof REGISTRY_DOMAINS];
