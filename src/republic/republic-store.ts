/**
 * Republic Platform — Persistent State Store
 *
 * Provides crash-safe persistence for the entire RepublicState using atomic
 * JSON writes (temp-file + rename).
 *
 * Persistence strategy:
 * 1. **Full snapshot** — Written on shutdown, every N ticks, and on demand.
 *    Uses atomic write: serialize → write to `.tmp` → rename over real file.
 *    This guarantees the snapshot is always valid (rename is atomic on all OS).
 *
 * 2. **Write-ahead journal (WAL)** — Append-only journal of per-tick deltas.
 *    On crash recovery, the journal replays on top of the last snapshot.
 *    Journal is truncated after each successful full snapshot.
 *
 * 3. **Metadata** — Stores `wasRunning`, `lastTick`, `savedAt` so the system
 *    knows whether to auto-resume simulation on restart.
 *
 * Data directory: `<cwd>/data/republic/`
 * Files:
 *   - `state.json`    — Latest full snapshot
 *   - `state.json.tmp` — In-progress write (deleted after rename)
 *   - `journal.ndjson`  — Append-only WAL (newline-delimited JSON)
 *   - `meta.json`      — Simulation metadata (wasRunning, lastTick, etc.)
 */

import * as fsSync from "node:fs";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { RepublicState } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:store");

// ─── Configuration ──────────────────────────────────────────────

/** Directory for persistence files, relative to cwd */
const DATA_DIR = path.join(process.cwd(), "data", "republic");

const SNAPSHOT_FILE = "state.json";
const SNAPSHOT_TMP = "state.json.tmp";
const JOURNAL_FILE = "journal.ndjson";
const META_FILE = "meta.json";

/** How often to write a full snapshot (in ticks) */
const SNAPSHOT_INTERVAL_TICKS = 100;

/** Maximum journal entries before forcing a snapshot */
const MAX_JOURNAL_ENTRIES = 500;

// ─── Types ──────────────────────────────────────────────────────

export interface StoreMeta {
  wasRunning: boolean;
  lastTick: number;
  savedAt: number;
  version: number;
}

interface JournalEntry {
  tick: number;
  ts: number;
  /** JSON patch — stores changed top-level keys only */
  changes: Record<string, unknown>;
}

// ─── State ──────────────────────────────────────────────────────

let journalCount = 0;
let lastSnapshotTick = 0;

// ─── Directory Setup ────────────────────────────────────────────

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function filePath(name: string): string {
  return path.join(DATA_DIR, name);
}

// ─── Atomic Write ───────────────────────────────────────────────

/**
 * Atomically write a file by writing to a temp path then renaming.
 * This guarantees the file is always in a valid state, even on crash.
 */
async function atomicWriteJSON(filename: string, data: unknown): Promise<void> {
  const target = filePath(filename);
  const tmp = filePath(filename + ".tmp");
  // Use a chunked approach: stringify at the top level to avoid
  // blowing V8's native stack on deeply nested 100MB+ state objects.
  const json = safeStringify(data);
  await fs.writeFile(tmp, json, "utf-8");
  await fs.rename(tmp, target);
}

/**
 * JSON.stringify replacement that serializes keys individually up to 2 levels
 * to avoid blowing V8's native stack on deeply nested / very large objects.
 *
 * The root cause: `memoryState.citizens` is 83+ MB. A single JSON.stringify
 * on the full state allocates massive intermediate strings that overflow the
 * native C++ stack on Windows (STATUS_STACK_BUFFER_OVERRUN / 0xC0000409).
 *
 * Strategy: for plain objects at depth 0 and 1, serialize each key separately
 * and join manually. At depth 2+, fall back to regular JSON.stringify (which
 * is fine for individual citizen memory entries, ~30 KB each).
 */
export function safeStringify(data: unknown, depth = 0): string {
  if (data === null || data === undefined || typeof data !== "object") {
    return JSON.stringify(data);
  }

  // Arrays: stringify each element individually at depth 0-1
  if (Array.isArray(data)) {
    if (depth >= 2) {
      return JSON.stringify(data);
    }
    const items: string[] = [];
    for (const item of data) {
      try {
        items.push(safeStringify(item, depth + 1));
      } catch {
        items.push("null");
      }
    }
    return `[${items.join(",")}]`;
  }

  // Plain objects: stringify each key individually at depth 0-1
  if (depth >= 2) {
    return JSON.stringify(data);
  }
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  const parts: string[] = [];
  for (const key of keys) {
    try {
      parts.push(`${JSON.stringify(key)}:${safeStringify(obj[key], depth + 1)}`);
    } catch {
      // Skip keys that fail to serialize (circular refs, etc.)
      logger.warn(`Snapshot: skipping unserializable key "${key}"`);
    }
  }
  return `{${parts.join(",")}}`;
}

// ─── Snapshot Operations ────────────────────────────────────────

/**
 * Save a full state snapshot atomically.
 * Also saves metadata and truncates the journal.
 */
export async function saveSnapshot(state: RepublicState): Promise<void> {
  await ensureDataDir();

  const meta: StoreMeta = {
    wasRunning: state.isRunning,
    lastTick: state.currentTick,
    savedAt: Date.now(),
    version: 1,
  };

  // Write snapshot + meta atomically (separate files, both use atomic write)
  await atomicWriteJSON(SNAPSHOT_FILE, state);
  await atomicWriteJSON(META_FILE, meta);

  // Truncate journal — snapshot is now the source of truth
  try {
    await fs.writeFile(filePath(JOURNAL_FILE), "", "utf-8");
  } catch {
    /* journal may not exist yet */
  }

  journalCount = 0;
  lastSnapshotTick = state.currentTick;

  logger.info("Full snapshot saved", {
    tick: state.currentTick,
    citizens: state.citizens.length,
  });

  // Hint V8 to collect the large serialization garbage from safeStringify.
  // safeStringify creates 100MB+ of intermediate string fragments — letting
  // them accumulate until the next automatic GC cycle wastes RSS and causes
  // fragmentation that can trigger the memory pressure manager unnecessarily.
  if (typeof globalThis.gc === "function") {
    setImmediate(() => globalThis.gc!());
  }
}

/**
 * Load the persisted state (snapshot + journal replay).
 * Returns null if no snapshot exists (fresh start).
 */
export async function loadSnapshot(): Promise<{ state: RepublicState; meta: StoreMeta } | null> {
  await ensureDataDir();

  const snapshotPath = filePath(SNAPSHOT_FILE);

  // Check if snapshot exists
  try {
    await fs.access(snapshotPath);
  } catch {
    logger.info("No persisted state found — will create fresh seed state");
    return null;
  }

  // Load snapshot
  let state: RepublicState;
  try {
    const raw = await fs.readFile(snapshotPath, "utf-8");
    state = JSON.parse(raw) as RepublicState;
  } catch (err) {
    logger.error("Failed to parse snapshot, starting fresh", { error: String(err) });
    return null;
  }

  // Load metadata
  let meta: StoreMeta = {
    wasRunning: false,
    lastTick: state.currentTick,
    savedAt: Date.now(),
    version: 1,
  };
  try {
    const metaRaw = await fs.readFile(filePath(META_FILE), "utf-8");
    meta = JSON.parse(metaRaw) as StoreMeta;
  } catch {
    /* metadata missing — use defaults */
  }

  // Replay journal on top of snapshot
  let journalReplayed = 0;
  try {
    const journalRaw = await fs.readFile(filePath(JOURNAL_FILE), "utf-8");
    const lines = journalRaw.split("\n").filter((l) => l.trim().length > 0);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as JournalEntry;
        if (entry.tick > state.currentTick) {
          // Apply changes — merge top-level keys
          for (const [key, value] of Object.entries(entry.changes)) {
            (state as unknown as Record<string, unknown>)[key] = value;
          }
          state.currentTick = entry.tick;
          journalReplayed++;
        }
      } catch {
        // Skip malformed journal lines
      }
    }
  } catch {
    /* journal may not exist */
  }

  lastSnapshotTick = meta.lastTick;

  logger.info("State restored from disk", {
    tick: state.currentTick,
    citizens: state.citizens.length,
    journalReplayed,
    wasRunning: meta.wasRunning,
  });

  return { state, meta };
}

// ─── Journal (WAL) Operations ───────────────────────────────────

/**
 * Append a delta entry to the journal.
 * Called after each simulation tick with changed top-level keys.
 *
 * @param tick Current tick number
 * @param changes Object containing only the changed top-level state keys
 */
export async function appendJournal(tick: number, changes: Record<string, unknown>): Promise<void> {
  const entry: JournalEntry = {
    tick,
    ts: Date.now(),
    changes,
  };

  try {
    const line = safeStringify(entry) + "\n";
    await fs.appendFile(filePath(JOURNAL_FILE), line, "utf-8");
    journalCount++;
  } catch (err) {
    logger.warn("Failed to append journal entry", { tick, error: String(err) });
  }
}

// ─── Tick Hook ──────────────────────────────────────────────────

/**
 * Called after each simulation tick. Decides whether to write a journal
 * entry or a full snapshot based on interval thresholds.
 *
 * @param state The current republic state after the tick
 * @param changedKeys Top-level state keys that changed this tick
 */
export async function onTick(state: RepublicState, changedKeys: string[]): Promise<void> {
  const ticksSinceSnapshot = state.currentTick - lastSnapshotTick;

  // Full snapshot at regular intervals or when journal is too large
  if (ticksSinceSnapshot >= SNAPSHOT_INTERVAL_TICKS || journalCount >= MAX_JOURNAL_ENTRIES) {
    await saveSnapshot(state);
    return;
  }

  // Otherwise, journal the delta
  if (changedKeys.length > 0) {
    const changes: Record<string, unknown> = {};
    for (const key of changedKeys) {
      // Skip large arrays/objects from WAL — they're persisted via the full
      // snapshot every 100 ticks. Journaling them every tick creates excessive
      // serialization pressure that starves the event loop and blocks RPC responses.
      if (
        key === "memoryState" ||
        key === "citizens" ||
        key === "genomePool" ||
        key === "transactions" ||
        key === "events" ||
        key === "actionLog" ||
        key === "swarmTasks" ||
        key === "gossipLog" ||
        key === "harvesters"
      ) {
        continue;
      }
      changes[key] = (state as unknown as Record<string, unknown>)[key];
    }
    if (Object.keys(changes).length > 0) {
      await appendJournal(state.currentTick, changes);
    }
  }
}

// ─── Metadata Operations ────────────────────────────────────────

/**
 * Load only the metadata (used to check wasRunning without loading full state).
 */
export async function loadMeta(): Promise<StoreMeta | null> {
  try {
    const raw = await fs.readFile(filePath(META_FILE), "utf-8");
    return JSON.parse(raw) as StoreMeta;
  } catch {
    return null;
  }
}

/**
 * Check if a persisted snapshot exists.
 */
export function hasPersistedState(): boolean {
  try {
    fsSync.accessSync(filePath(SNAPSHOT_FILE));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete all persisted state (for testing or reset).
 */
export async function clearPersistedState(): Promise<void> {
  for (const file of [SNAPSHOT_FILE, SNAPSHOT_TMP, JOURNAL_FILE, META_FILE]) {
    try {
      await fs.unlink(filePath(file));
    } catch {
      /* file may not exist */
    }
  }
  journalCount = 0;
  lastSnapshotTick = 0;
  logger.info("Persisted state cleared");
}
