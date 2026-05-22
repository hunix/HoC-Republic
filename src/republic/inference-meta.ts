/**
 * Inference Metadata Sidecar
 *
 * Writes/reads a <filename>.meta.json file alongside every production output.
 * Tracks: which model generated the content, token counts, and estimated cost.
 *
 * Format: <republic-output>/art/painting_123.svg → painting_123.svg.meta.json
 *         <republic-output>/art/project-dir/ → project-dir/.meta.json
 *
 * This is a best-effort system — metadata is never required for a file to
 * appear in the Productions page. If the sidecar is missing, the file still
 * appears with no metadata shown.
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ─── Cost tables (USD per 1K tokens, approximate) ────────────────

const COST_PER_1K_INPUT: Record<string, number> = {
  // Local — free
  lmstudio:            0,
  ollama:              0,
  // Cloud free tiers (treat as $0 for accounting)
  "gemini_flash":      0,
  "groq":              0,
  "nvidia-nim":        0,
  // Cloud paid
  "gemini_pro":        0.00125,   // Gemini 2.5 Pro
  "openai_mini":       0.00015,   // GPT-4o-mini
  "openai_o3":         0.01,      // o3-mini
  "anthropic":         0.00025,   // Haiku 3.5
  "deepseek":          0.00014,   // DeepSeek V3
};

const COST_PER_1K_OUTPUT: Record<string, number> = {
  lmstudio:            0,
  ollama:              0,
  "gemini_flash":      0,
  "groq":              0,
  "nvidia-nim":        0,
  "gemini_pro":        0.01,
  "openai_mini":       0.0006,
  "openai_o3":         0.04,
  "anthropic":         0.00125,
  "deepseek":          0.00028,
};

// ─── Types ───────────────────────────────────────────────────────

export interface InferenceMeta {
  /** Provider used (lmstudio, gemini, openai, groq, etc.) */
  provider: string;
  /** Model identifier */
  model: string;
  /** Input tokens consumed */
  tokensIn: number;
  /** Output tokens consumed */
  tokensOut: number;
  /** Estimated cost in USD (0 for free/local) */
  estimatedCostUsd: number;
  /** ISO timestamp when metadata was written */
  generatedAt: string;
  /** Citizen who generated this (optional) */
  citizenName?: string;
  /** Vision quality score (0-1) if VLM reviewed this output */
  visionScore?: number;
  /** VLM description of this output */
  visionDescription?: string;
}

// ─── Sidecar path resolution ─────────────────────────────────────

function sidecarPath(outputPath: string): string {
  // For directories, write inside as .meta.json
  // For files, write alongside as <file>.meta.json
  try {
    const stat = fs.statSync(outputPath);
    if (stat.isDirectory()) {
      return path.join(outputPath, ".meta.json");
    }
  } catch { /* file not yet written */ }
  return outputPath + ".meta.json";
}

// ─── Cost calculator ─────────────────────────────────────────────

export function estimateCost(
  provider: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const inRate = COST_PER_1K_INPUT[provider] ?? 0;
  const outRate = COST_PER_1K_OUTPUT[provider] ?? 0;
  return (tokensIn / 1000) * inRate + (tokensOut / 1000) * outRate;
}

// ─── Write sidecar ───────────────────────────────────────────────

export function writeInferenceMeta(
  outputPath: string,
  opts: {
    provider: string;
    model: string;
    tokensIn?: number;
    tokensOut?: number;
    citizenName?: string;
  },
): void {
  const tokensIn = opts.tokensIn ?? 0;
  const tokensOut = opts.tokensOut ?? 0;
  const meta: InferenceMeta = {
    provider: opts.provider,
    model: opts.model,
    tokensIn,
    tokensOut,
    estimatedCostUsd: estimateCost(opts.provider, tokensIn, tokensOut),
    generatedAt: new Date().toISOString(),
    citizenName: opts.citizenName,
  };
  try {
    fs.writeFileSync(sidecarPath(outputPath), JSON.stringify(meta, null, 2), "utf-8");
  } catch {
    /* best-effort — never block production output */
  }
}

/**
 * Add VLM review results to an existing sidecar (or create one).
 */
export function updateVisionMeta(
  outputPath: string,
  visionScore: number,
  visionDescription: string,
): void {
  const sp = sidecarPath(outputPath);
  let existing: Partial<InferenceMeta> = {};
  try {
    existing = JSON.parse(fs.readFileSync(sp, "utf-8")) as Partial<InferenceMeta>;
  } catch { /* no sidecar yet */ }
  try {
    fs.writeFileSync(
      sp,
      JSON.stringify({ ...existing, visionScore, visionDescription }, null, 2),
      "utf-8",
    );
  } catch { /* best-effort */ }
}

// ─── Read sidecar ────────────────────────────────────────────────

/**
 * Read inference metadata for a given production file or directory.
 * Returns null if no sidecar exists.
 */
export function readInferenceMeta(outputPath: string): InferenceMeta | null {
  const sp = sidecarPath(outputPath);
  try {
    if (!fs.existsSync(sp)) {return null;}
    const raw = fs.readFileSync(sp, "utf-8");
    return JSON.parse(raw) as InferenceMeta;
  } catch {
    return null;
  }
}

/**
 * Read inference metadata from a relative republic-output path (as stored in files[].path).
 * e.g. "republic-output/art/painting_xyz.svg"
 */
export function readInferenceMetaByRelPath(relPath: string): InferenceMeta | null {
  const abs = path.resolve(process.cwd(), relPath.replace(/\/$/, ""));
  return readInferenceMeta(abs);
}
