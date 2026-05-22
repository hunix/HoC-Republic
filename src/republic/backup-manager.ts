/**
 * Republic Backup Manager
 *
 * Automated snapshot export/import for republic state.
 * - Configurable retention (default: 7 daily snapshots)
 * - JSON + gzip compressed exports
 * - List, prune, import, and verify backups
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createSubsystemLogger } from "../logging.js";
import { safeStringify } from "./republic-store.js";

const logger = createSubsystemLogger("republic:backup");

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_BACKUP_DIR = path.join(os.homedir(), ".openclaw", "backups");
const DEFAULT_RETENTION_DAYS = 7;
const BACKUP_PREFIX = "republic-state-";
const BACKUP_EXT = ".json.gz";

export interface BackupOptions {
  /** Directory to store backups (default: ~/.openclaw/backups/) */
  backupDir?: string;
  /** Number of days to retain backups (default: 7) */
  retentionDays?: number;
}

export interface BackupMetadata {
  filename: string;
  filepath: string;
  createdAt: Date;
  sizeBytes: number;
  tick?: number;
}

// ─── Core Functions ─────────────────────────────────────────────

/**
 * Ensure the backup directory exists.
 */
function ensureBackupDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info("Created backup directory", { dir });
  }
}

/**
 * Export a republic state snapshot to a compressed backup file.
 * Returns the path to the created backup.
 */
export async function exportBackup(
  state: unknown,
  opts?: BackupOptions & { tick?: number },
): Promise<string> {
  const dir = opts?.backupDir ?? DEFAULT_BACKUP_DIR;
  ensureBackupDir(dir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const tickSuffix = opts?.tick != null ? `-tick${opts.tick}` : "";
  const filename = `${BACKUP_PREFIX}${timestamp}${tickSuffix}${BACKUP_EXT}`;
  const filepath = path.join(dir, filename);

  const json = safeStringify(state); // chunked to avoid V8 stack overflow (0xC0000409)
  const compressed = await new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(Buffer.from(json, "utf-8"), (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf);
      }
    });
  });

  fs.writeFileSync(filepath, compressed);

  logger.info("Backup exported", {
    filepath,
    originalSize: json.length,
    compressedSize: compressed.length,
    compressionRatio: ((1 - compressed.length / json.length) * 100).toFixed(1) + "%",
  });

  return filepath;
}

/**
 * Import a republic state from a backup file.
 * Returns the deserialized state object.
 */
export async function importBackup(filepath: string): Promise<unknown> {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Backup file not found: ${filepath}`);
  }

  const compressed = fs.readFileSync(filepath);
  const json = await new Promise<string>((resolve, reject) => {
    zlib.gunzip(compressed, (err, buf) => {
      if (err) {
        reject(err);
      } else {
        resolve(buf.toString("utf-8"));
      }
    });
  });

  const state = JSON.parse(json);
  logger.info("Backup imported", { filepath, sizeBytes: compressed.length });
  return state;
}

/**
 * List all available backups, sorted by creation date (newest first).
 */
export function listBackups(opts?: BackupOptions): BackupMetadata[] {
  const dir = opts?.backupDir ?? DEFAULT_BACKUP_DIR;
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_EXT));

  return files
    .map((filename) => {
      const filepath = path.join(dir, filename);
      const stat = fs.statSync(filepath);

      // Try to extract tick from filename
      const tickMatch = filename.match(/-tick(\d+)/);
      const tick = tickMatch ? parseInt(tickMatch[1], 10) : undefined;

      return {
        filename,
        filepath,
        createdAt: stat.birthtime,
        sizeBytes: stat.size,
        tick,
      };
    })
    .toSorted((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Prune old backups beyond the retention period.
 * Returns the number of backups pruned.
 */
export function pruneOldBackups(opts?: BackupOptions): number {
  const dir = opts?.backupDir ?? DEFAULT_BACKUP_DIR;
  const retentionDays = opts?.retentionDays ?? DEFAULT_RETENTION_DAYS;

  const backups = listBackups({ backupDir: dir });
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let pruned = 0;
  for (const backup of backups) {
    if (backup.createdAt.getTime() < cutoff) {
      try {
        fs.unlinkSync(backup.filepath);
        pruned++;
        logger.info("Pruned old backup", { filepath: backup.filepath });
      } catch (err) {
        logger.warn("Failed to prune backup", {
          filepath: backup.filepath,
          error: String(err),
        });
      }
    }
  }

  if (pruned > 0) {
    logger.info(`Pruned ${pruned} old backup(s)`, { retentionDays });
  }

  return pruned;
}

/**
 * Verify that a backup file can be decompressed and parsed as valid JSON.
 */
export async function verifyBackup(filepath: string): Promise<boolean> {
  try {
    const state = await importBackup(filepath);
    return state != null && typeof state === "object";
  } catch {
    return false;
  }
}
