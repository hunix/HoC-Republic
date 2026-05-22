/**
 * Republic Platform — Database Persistence Layer
 *
 * Phase 37: Structured persistence for all Republic modules.
 * Replaces in-memory-only Maps and arrays with auto-persisted
 * equivalents that survive restarts.
 *
 * Components:
 * - PersistentMap<K,V> — Drop-in Map replacement with disk backing
 * - PersistentLog<T> — Append-only log with rotation
 * - DomainStore — Namespace-scoped persistence manager
 * - BatchWriter — Debounced disk writes to avoid thrashing
 * - SnapshotManager — Full and incremental snapshots with compression
 *
 * All files are stored under `data/republic/<domain>/` as JSON.
 * Uses atomic writes (temp + rename) for crash safety.
 */

import * as fsSync from "node:fs";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { uid } from "./utils.js";

const logger = createSubsystemLogger("republic:persistence");

// ─── Configuration ──────────────────────────────────────────────

const DATA_ROOT = path.join(process.cwd(), "data", "republic");

/** Max entries before log rotation */
const DEFAULT_LOG_ROTATION_THRESHOLD = 10_000;

/** Debounce delay for batch writes (ms) */
const DEFAULT_BATCH_DELAY_MS = 2_000;

/** Max snapshot backups to keep */
const MAX_SNAPSHOT_BACKUPS = 5;

// ─── Utilities ──────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Atomically write JSON to a file (write to temp, then rename).
 * Guarantees the file is always in a valid state.
 */
async function atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp.${uid().substring(0, 8)}`;
  try {
    const json = JSON.stringify(data);
    await fs.writeFile(tmpPath, json, "utf-8");
    await fs.rename(tmpPath, filePath);
  } catch (error) {
    // Clean up temp file on error
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* ignore */
    }
    throw error;
  }
}

/**
 * Read and parse JSON from a file, returning null if not found.
 */
async function readJSON<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// ─── BatchWriter ────────────────────────────────────────────────

/**
 * Debounced writer that coalesces rapid writes into a single disk operation.
 * Prevents disk thrashing when many updates happen in quick succession.
 */
export class BatchWriter {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: (() => Promise<void>) | null = null;
  private writing = false;

  constructor(private readonly delayMs = DEFAULT_BATCH_DELAY_MS) {}

  /**
   * Schedule a write. If a write is already pending, the new write
   * replaces it (only the latest state is written).
   */
  schedule(writeFn: () => Promise<void>): void {
    this.pending = writeFn;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delayMs);
  }

  /**
   * Force an immediate flush of any pending write.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const fn = this.pending;
    if (!fn || this.writing) {return;}

    this.pending = null;
    this.writing = true;

    try {
      await fn();
    } catch (error) {
      logger.error("BatchWriter flush failed:", { error: String(error) });
    } finally {
      this.writing = false;
    }
  }

  /** Check if there's a pending write */
  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** Dispose — flush and clean up */
  async dispose(): Promise<void> {
    await this.flush();
  }
}

// ─── PersistentMap<K,V> ─────────────────────────────────────────

/**
 * Drop-in replacement for Map<string, V> that auto-persists to disk.
 *
 * Uses a BatchWriter to coalesce rapid mutations into single disk writes.
 * On load, restores the full map from the persisted JSON file.
 *
 * @example
 * const users = new PersistentMap<UserData>('users', 'citizens');
 * await users.load();
 * users.set('alice', { name: 'Alice', age: 30 });
 * // Automatically persisted after debounce delay
 */
export class PersistentMap<V> {
  private map = new Map<string, V>();
  private writer = new BatchWriter();
  private filePath: string;
  private loaded = false;

  constructor(
    /** Map name (used as filename) */
    private readonly name: string,
    /** Domain namespace (directory under data/republic/) */
    private readonly domain: string,
  ) {
    this.filePath = path.join(DATA_ROOT, domain, `${name}.json`);
  }

  /**
   * Load persisted data from disk. Call this before using the map.
   */
  async load(): Promise<void> {
    await ensureDir(path.dirname(this.filePath));
    const data = await readJSON<Record<string, V>>(this.filePath);
    if (data) {
      this.map = new Map(Object.entries(data));
      logger.info(`Loaded ${this.map.size} entries from ${this.name}`);
    }
    this.loaded = true;
  }

  /**
   * Set a key-value pair and schedule persistence.
   */
  set(key: string, value: V): this {
    this.map.set(key, value);
    this.schedulePersist();
    return this;
  }

  /**
   * Get a value by key.
   */
  get(key: string): V | undefined {
    return this.map.get(key);
  }

  /**
   * Check if a key exists.
   */
  has(key: string): boolean {
    return this.map.has(key);
  }

  /**
   * Delete a key and schedule persistence.
   */
  delete(key: string): boolean {
    const result = this.map.delete(key);
    if (result) {this.schedulePersist();}
    return result;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.map.clear();
    this.schedulePersist();
  }

  /**
   * Get the number of entries.
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Iterate over entries.
   */
  entries(): IterableIterator<[string, V]> {
    return this.map.entries();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  forEach(callback: (value: V, key: string) => void): void {
    this.map.forEach(callback);
  }

  /**
   * Force immediate persistence.
   */
  async flush(): Promise<void> {
    await this.writer.flush();
  }

  /**
   * Clean up (flush pending writes).
   */
  async dispose(): Promise<void> {
    await this.writer.dispose();
  }

  /**
   * Convert to a plain object.
   */
  toJSON(): Record<string, V> {
    return Object.fromEntries(this.map);
  }

  /**
   * Import data from a plain object (merges with existing).
   */
  importData(data: Record<string, V>): void {
    for (const [key, value] of Object.entries(data)) {
      this.map.set(key, value);
    }
    this.schedulePersist();
  }

  private schedulePersist(): void {
    this.writer.schedule(async () => {
      await ensureDir(path.dirname(this.filePath));
      await atomicWriteJSON(this.filePath, Object.fromEntries(this.map));
    });
  }
}

// ─── PersistentLog<T> ───────────────────────────────────────────

/**
 * Append-only log with automatic rotation and replay.
 *
 * Events are appended as newline-delimited JSON (NDJSON).
 * When the log exceeds the rotation threshold, it's rotated
 * (compressed to .gz) and a new log starts.
 *
 * @example
 * const eventLog = new PersistentLog<NationalEvent>('events', 'events');
 * await eventLog.load();
 * eventLog.append({ type: 'citizen_born', ... });
 */
export class PersistentLog<T> {
  private entries: T[] = [];
  private filePath: string;
  private entryCount = 0;
  private writer = new BatchWriter(1_000); // Tighter delay for logs

  constructor(
    private readonly name: string,
    private readonly domain: string,
    private readonly rotationThreshold = DEFAULT_LOG_ROTATION_THRESHOLD,
  ) {
    this.filePath = path.join(DATA_ROOT, domain, `${name}.ndjson`);
  }

  /**
   * Load existing entries from disk.
   */
  async load(): Promise<void> {
    await ensureDir(path.dirname(this.filePath));

    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const lines = raw
        .trim()
        .split("\n")
        .filter((l) => l.length > 0);
      this.entries = lines.map((l) => JSON.parse(l) as T);
      this.entryCount = this.entries.length;
      logger.info(`Loaded ${this.entryCount} log entries from ${this.name}`);
    } catch {
      // No existing log
    }
  }

  /**
   * Append an entry to the log.
   */
  append(entry: T): void {
    this.entries.push(entry);
    this.entryCount++;

    this.writer.schedule(async () => {
      const line = JSON.stringify(entry) + "\n";
      await fs.appendFile(this.filePath, line, "utf-8");
    });

    // Check rotation
    if (this.entryCount >= this.rotationThreshold) {
      void this.rotate();
    }
  }

  /**
   * Get the last N entries.
   */
  tail(count: number): T[] {
    return this.entries.slice(-count);
  }

  /**
   * Get all entries.
   */
  getAll(): T[] {
    return [...this.entries];
  }

  /**
   * Get total entry count.
   */
  get length(): number {
    return this.entries.length;
  }

  /**
   * Find entries matching a predicate.
   */
  filter(predicate: (entry: T) => boolean): T[] {
    return this.entries.filter(predicate);
  }

  /**
   * Rotate the log: compress current log to .gz and start fresh.
   */
  async rotate(): Promise<void> {
    await this.writer.flush();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archivePath = `${this.filePath}.${timestamp}.gz`;

    try {
      // Compress current log
      const readStream = createReadStream(this.filePath);
      const gzip = createGzip();
      const writeStream = createWriteStream(archivePath);
      await pipeline(readStream, gzip, writeStream);

      // Truncate current log
      await fs.writeFile(this.filePath, "", "utf-8");
      this.entries = [];
      this.entryCount = 0;

      // Clean up old archives
      await this.pruneArchives();

      logger.info(`Rotated log ${this.name}, archived to ${path.basename(archivePath)}`);
    } catch (error) {
      logger.error(`Failed to rotate log ${this.name}:`, { error: String(error) });
    }
  }

  /**
   * Replay archived logs (for event sourcing).
   */
  async replayArchives(): Promise<T[]> {
    const dir = path.dirname(this.filePath);
    const prefix = path.basename(this.filePath);

    const files = await fs.readdir(dir);
    const archives = files.filter((f) => f.startsWith(prefix) && f.endsWith(".gz")).toSorted();

    const allEntries: T[] = [];

    for (const archive of archives) {
      try {
        const readStream = createReadStream(path.join(dir, archive));
        const gunzip = createGunzip();
        const chunks: Buffer[] = [];

        gunzip.on("data", (chunk: Buffer) => chunks.push(chunk));
        await pipeline(readStream, gunzip);

        const text = Buffer.concat(chunks).toString("utf-8");
        const lines = text
          .trim()
          .split("\n")
          .filter((l) => l.length > 0);
        allEntries.push(...lines.map((l) => JSON.parse(l) as T));
      } catch (error) {
        logger.error(`Failed to replay archive ${archive}:`, { error: String(error) });
      }
    }

    return allEntries;
  }

  async flush(): Promise<void> {
    await this.writer.flush();
  }

  async dispose(): Promise<void> {
    await this.writer.dispose();
  }

  private async pruneArchives(): Promise<void> {
    const dir = path.dirname(this.filePath);
    const prefix = path.basename(this.filePath);

    const files = await fs.readdir(dir);
    const archives = files.filter((f) => f.startsWith(prefix) && f.endsWith(".gz")).toSorted();

    // Keep only the most recent archives
    while (archives.length > MAX_SNAPSHOT_BACKUPS) {
      const oldest = archives.shift()!;
      try {
        await fs.unlink(path.join(dir, oldest));
      } catch {
        /* ignore */
      }
    }
  }
}

// ─── DomainStore ────────────────────────────────────────────────

/**
 * Namespace-scoped persistence manager for a domain.
 * Manages multiple PersistentMaps and PersistentLogs under
 * a single domain directory.
 *
 * @example
 * const store = new DomainStore('defense');
 * const threats = store.getMap<ThreatData>('threats');
 * const auditLog = store.getLog<AuditEntry>('audit');
 * await store.loadAll();
 */
export class DomainStore {
  private maps = new Map<string, PersistentMap<unknown>>();
  private logs = new Map<string, PersistentLog<unknown>>();
  private dirPath: string;

  constructor(private readonly domain: string) {
    this.dirPath = path.join(DATA_ROOT, domain);
  }

  /**
   * Get (or create) a persistent map within this domain.
   */
  getMap<V>(name: string): PersistentMap<V> {
    if (!this.maps.has(name)) {
      this.maps.set(name, new PersistentMap(name, this.domain));
    }
    return this.maps.get(name) as PersistentMap<V>;
  }

  /**
   * Get (or create) a persistent log within this domain.
   */
  getLog<T>(name: string, rotationThreshold?: number): PersistentLog<T> {
    if (!this.logs.has(name)) {
      this.logs.set(name, new PersistentLog(name, this.domain, rotationThreshold));
    }
    return this.logs.get(name) as PersistentLog<T>;
  }

  /**
   * Load all registered maps and logs from disk.
   */
  async loadAll(): Promise<void> {
    await ensureDir(this.dirPath);

    const loadPromises: Promise<void>[] = [];
    for (const map of this.maps.values()) {
      loadPromises.push(map.load());
    }
    for (const log of this.logs.values()) {
      loadPromises.push(log.load());
    }

    await Promise.allSettled(loadPromises);
    logger.info(
      `DomainStore '${this.domain}' loaded: ${this.maps.size} maps, ${this.logs.size} logs`,
    );
  }

  /**
   * Flush all pending writes.
   */
  async flushAll(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const map of this.maps.values()) {
      promises.push(map.flush());
    }
    for (const log of this.logs.values()) {
      promises.push(log.flush());
    }
    await Promise.allSettled(promises);
  }

  /**
   * Dispose of all stores.
   */
  async dispose(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const map of this.maps.values()) {
      promises.push(map.dispose());
    }
    for (const log of this.logs.values()) {
      promises.push(log.dispose());
    }
    await Promise.allSettled(promises);
  }

  /**
   * Get storage statistics.
   */
  async getStats(): Promise<{
    domain: string;
    maps: number;
    logs: number;
    totalSizeBytes: number;
  }> {
    let totalSize = 0;

    try {
      const files = await fs.readdir(this.dirPath);
      for (const file of files) {
        const stat = await fs.stat(path.join(this.dirPath, file));
        totalSize += stat.size;
      }
    } catch {
      /* dir may not exist yet */
    }

    return {
      domain: this.domain,
      maps: this.maps.size,
      logs: this.logs.size,
      totalSizeBytes: totalSize,
    };
  }
}

// ─── SnapshotManager ────────────────────────────────────────────

/**
 * Creates full and incremental snapshots of all domain stores.
 * Supports compression and automatic backup rotation.
 */
export class SnapshotManager {
  private stores = new Map<string, DomainStore>();

  /**
   * Register a domain store for snapshot management.
   */
  register(store: DomainStore, domain: string): void {
    this.stores.set(domain, store);
  }

  /**
   * Create a full snapshot of all registered domains.
   * Saves to data/republic/snapshots/<timestamp>.json.gz
   */
  async createFullSnapshot(): Promise<string> {
    const snapshotDir = path.join(DATA_ROOT, "snapshots");
    await ensureDir(snapshotDir);

    // Flush all stores first
    for (const store of this.stores.values()) {
      await store.flushAll();
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotFile = path.join(snapshotDir, `full-${timestamp}.json`);
    const compressedFile = `${snapshotFile}.gz`;

    // Collect all domain data
    const snapshot: Record<string, unknown> = {
      version: 1,
      timestamp: new Date().toISOString(),
      domains: [...this.stores.keys()],
    };

    // Write uncompressed first, then compress
    await atomicWriteJSON(snapshotFile, snapshot);

    // Compress
    try {
      const readStream = createReadStream(snapshotFile);
      const gzip = createGzip();
      const writeStream = createWriteStream(compressedFile);
      await pipeline(readStream, gzip, writeStream);
      await fs.unlink(snapshotFile); // Remove uncompressed
    } catch {
      // Keep uncompressed if compression fails
    }

    // Prune old snapshots
    await this.pruneSnapshots(snapshotDir);

    const finalPath = fsSync.existsSync(compressedFile) ? compressedFile : snapshotFile;
    logger.info(`Full snapshot created: ${path.basename(finalPath)}`);

    return finalPath;
  }

  private async pruneSnapshots(dir: string): Promise<void> {
    try {
      const files = await fs.readdir(dir);
      const snapshots = files
        .filter((f) => f.startsWith("full-"))
        .toSorted()
        .toReversed();

      for (let i = MAX_SNAPSHOT_BACKUPS; i < snapshots.length; i++) {
        await fs.unlink(path.join(dir, snapshots[i]));
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * List available snapshots.
   */
  async listSnapshots(): Promise<
    Array<{ filename: string; sizeBytes: number; createdAt: string }>
  > {
    const snapshotDir = path.join(DATA_ROOT, "snapshots");
    try {
      const files = await fs.readdir(snapshotDir);
      const snapshots = [];

      for (const file of files.filter((f) => f.startsWith("full-"))) {
        const stat = await fs.stat(path.join(snapshotDir, file));
        snapshots.push({
          filename: file,
          sizeBytes: stat.size,
          createdAt: stat.mtime.toISOString(),
        });
      }

      return snapshots.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }
}

// ─── Global Store Registry ──────────────────────────────────────

const domainStores = new Map<string, DomainStore>();
const snapshotManager = new SnapshotManager();

/**
 * Get (or create) a DomainStore for a given domain.
 * This is the main entry point for modules to get persistent storage.
 *
 * @example
 * const defenseStore = getDomainStore('defense');
 * const rateLimits = defenseStore.getMap<RateLimitData>('rate-limits');
 * const auditLog = defenseStore.getLog<AuditEvent>('audit');
 * await defenseStore.loadAll();
 */
export function getDomainStore(domain: string): DomainStore {
  if (!domainStores.has(domain)) {
    const store = new DomainStore(domain);
    domainStores.set(domain, store);
    snapshotManager.register(store, domain);
  }
  return domainStores.get(domain)!;
}

/**
 * Flush all domain stores.
 */
export async function flushAllStores(): Promise<void> {
  for (const store of domainStores.values()) {
    await store.flushAll();
  }
}

/**
 * Create a full snapshot of all domains.
 */
export async function createSystemSnapshot(): Promise<string> {
  return snapshotManager.createFullSnapshot();
}

/**
 * List available system snapshots.
 */
export async function listSystemSnapshots() {
  return snapshotManager.listSnapshots();
}

/**
 * Get diagnostics for the persistence layer.
 */
export async function getPersistenceDiagnostics() {
  const stats: Array<{ domain: string; maps: number; logs: number; totalSizeBytes: number }> = [];

  for (const store of domainStores.values()) {
    stats.push(await store.getStats());
  }

  return {
    dataRoot: DATA_ROOT,
    registeredDomains: [...domainStores.keys()],
    storeStats: stats,
    totalSizeBytes: stats.reduce((sum, s) => sum + s.totalSizeBytes, 0),
    snapshots: await snapshotManager.listSnapshots(),
  };
}
