/**
 * Output Manager — Core (dir management, file I/O, logging, query, evolution state)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { OutputCategory, OutputEntry, ProjectFile, CreativeEvolution } from "./types.js";
import { uid, ts } from "../utils.js";
import { ALL_CATEGORIES } from "./types.js";

// ─── State ──────────────────────────────────────────────────────

const outputLog: OutputEntry[] = [];
const MAX_LOG = 500;
const BASE_DIR = path.join(process.cwd(), "republic-output");

/** Minimum output size to persist to disk (10 KB).
 *  Anything smaller is almost certainly a stub/placeholder. */
const MIN_OUTPUT_BYTES = 10 * 1024;

/** Categories exempt from the minimum size check (e.g. simulation state). */
const SIZE_EXEMPT_CATEGORIES = new Set<OutputCategory>(["state"]);

// ─── Directory Management ───────────────────────────────────────

/**
 * Ensure all output directories exist. Called once at startup
 * and lazily before any write.
 */
export function ensureAllOutputDirs(): void {
  for (const cat of ALL_CATEGORIES) {
    const dir = path.join(BASE_DIR, cat);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      /* already exists or no permissions */
    }
  }
}

export function ensureDir(category: OutputCategory): string {
  const dir = path.join(BASE_DIR, category);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* safe */
  }
  return dir;
}

// ─── File Writing ───────────────────────────────────────────────

/**
 * Write a text file to the specified output category.
 */
export function writeTextOutput(
  category: OutputCategory,
  filename: string,
  content: string,
  creatorId: string,
  creatorName: string,
  title: string,
  tick: number,
): string | null {
  const dir = ensureDir(category);
  const filepath = path.join(dir, filename);
  const byteLen = Buffer.byteLength(content);
  if (byteLen < MIN_OUTPUT_BYTES && !SIZE_EXEMPT_CATEGORIES.has(category)) {
    return null; // Too small — reject junk output
  }
  try {
    fs.writeFileSync(filepath, content, "utf-8");
    logOutput(category, filename, creatorId, creatorName, title, "", byteLen, tick);
    return filepath;
  } catch {
    return null;
  }
}

/**
 * Write a binary file (base64 encoded) to the specified category.
 */
export function writeBinaryOutput(
  category: OutputCategory,
  filename: string,
  base64Data: string,
  creatorId: string,
  creatorName: string,
  title: string,
  tick: number,
): string | null {
  const dir = ensureDir(category);
  const filepath = path.join(dir, filename);
  try {
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length < MIN_OUTPUT_BYTES && !SIZE_EXEMPT_CATEGORIES.has(category)) {
      return null; // Too small — reject junk output
    }
    fs.writeFileSync(filepath, buffer);
    logOutput(category, filename, creatorId, creatorName, title, "", buffer.length, tick);
    return filepath;
  } catch {
    return null;
  }
}

/**
 * Write a multi-file project to disk under its own named subfolder.
 * Creates: republic-output/{category}/{projectSlug}/{file.path} for each file.
 */
export function writeProjectOutput(
  category: OutputCategory,
  projectSlug: string,
  files: ProjectFile[],
  creatorId: string,
  creatorName: string,
  title: string,
  tick: number,
): string | null {
  const projectDir = path.join(ensureDir(category), projectSlug);
  try {
    fs.mkdirSync(projectDir, { recursive: true });
    let totalSize = 0;
    for (const file of files) {
      totalSize += Buffer.byteLength(file.content);
    }
    if (totalSize < MIN_OUTPUT_BYTES && !SIZE_EXEMPT_CATEGORIES.has(category)) {
      return null; // Project too small — reject junk output
    }
    for (const file of files) {
      const filePath = path.join(projectDir, file.path);
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, file.content, "utf-8");
    }
    logOutput(
      category,
      projectSlug,
      creatorId,
      creatorName,
      title,
      `${files.length} files`,
      totalSize,
      tick,
    );
    return projectDir;
  } catch {
    return null;
  }
}

export function logOutput(
  category: OutputCategory,
  filename: string,
  creatorId: string,
  creatorName: string,
  title: string,
  description: string,
  fileSize: number,
  tick: number,
): void {
  outputLog.push({
    id: uid(),
    category,
    filename,
    creatorId,
    creatorName,
    title,
    description,
    fileSize,
    createdAt: ts(),
    tick,
  });
  if (outputLog.length > MAX_LOG) {
    outputLog.splice(0, outputLog.length - MAX_LOG);
  }
}

// ─── Creative Evolution Tracker ─────────────────────────────────

export const evolution: CreativeEvolution = {
  totalOutputs: 0,
  ticksActive: 0,
  categoryExperience: {},
  complexityLevel: 1.0,
};

export function evolveCreativity(): void {
  evolution.ticksActive++;
  evolution.complexityLevel = Math.min(
    3.0,
    1.0 +
      Math.log10(1 + evolution.ticksActive) * 0.5 +
      Math.log10(1 + evolution.totalOutputs) * 0.3,
  );
}

export function recordCreation(category: string): void {
  evolution.totalOutputs++;
  evolution.categoryExperience[category] = (evolution.categoryExperience[category] ?? 0) + 1;
}

export function getCreativeEvolution(): CreativeEvolution {
  return { ...evolution };
}

// ─── Query API ──────────────────────────────────────────────────

export function getOutputLog(category?: OutputCategory, limit = 20): OutputEntry[] {
  const filtered = category ? outputLog.filter((e) => e.category === category) : outputLog;
  return filtered.slice(-limit);
}

export function getOutputStats(): Record<OutputCategory, number> {
  const stats: Record<string, number> = {};
  for (const cat of ALL_CATEGORIES) {
    stats[cat] = 0;
  }
  for (const entry of outputLog) {
    stats[entry.category] = (stats[entry.category] ?? 0) + 1;
  }
  return stats as Record<OutputCategory, number>;
}

export function getOutputDiagnostics(): {
  totalOutputs: number;
  byCategory: Record<string, number>;
  recentOutputs: { title: string; category: string; creator: string }[];
} {
  const stats = getOutputStats();
  const recent = outputLog.slice(-5).map((e) => ({
    title: e.title,
    category: e.category,
    creator: e.creatorName,
  }));
  return { totalOutputs: outputLog.length, byCategory: stats, recentOutputs: recent };
}
