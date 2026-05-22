/**
 * Production Bridge — Connects creative tool output to:
 *   1. Production Dispatcher (media plugins: Bark, SD, etc.)
 *   2. AI Store Pipeline (auto-list products for sale)
 *
 * Called by creative-production.ts after a tool produces a file.
 * This module never blocks the tool — dispatch and store listing
 * happen asynchronously in the background.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { dispatch, getPipelineStatus } from "./production-dispatcher.js";
import {
  createProduct,
  completeGeneration,
  queueGeneration,
  type ProductCategory,
} from "./economy/ai-store-pipeline.js";
import { ts } from "./utils.js";
import type { OutputCategory } from "./output-manager.js";
import { writeInferenceMeta, updateVisionMeta } from "./inference-meta.js";
import { visionAnalyze } from "./vision-inference.js";
import * as fs from "node:fs";
import * as path from "node:path";

const logger = createSubsystemLogger("production-bridge");

// ─── Category Mapping ───────────────────────────────────────────

/** Map output-manager categories to AI Store product categories */
const OUTPUT_TO_STORE: Partial<Record<OutputCategory, ProductCategory>> = {
  music: "music",
  art: "art",
  code: "code",
  research: "research",
  games: "game",
  websites: "website",
  screenplays: "other",
  video: "video",
  "3d-models": "other",
  podcasts: "podcast",
  docs: "other",
  designs: "brand-kit",
  "ml-models": "model",
  datasets: "dataset",
  inventions: "other",
};

/** Map output-manager categories to dispatcher content types */
const OUTPUT_TO_DISPATCH: Partial<Record<OutputCategory, string>> = {
  music: "audio",
  art: "image",
  video: "video",
  "3d-models": "3d",
};

// ─── Loaded Plugins Tracker ─────────────────────────────────────

let loadedPluginsRef: Set<string> = new Set();

/**
 * Update the loaded plugins set (called by plugin manager on load/unload).
 */
export function updateLoadedPlugins(plugins: Set<string>): void {
  loadedPluginsRef = plugins;
}

/**
 * Get current loaded plugins (for external status checks).
 */
export function getLoadedPlugins(): Set<string> {
  return loadedPluginsRef;
}

// ─── Media Dispatch (Phase 3) ───────────────────────────────────

/**
 * Attempt to dispatch media generation to a Docker plugin.
 * Returns true if a plugin was found and the job was dispatched.
 * Returns false if no plugin is available (deterministic fallback should be used).
 *
 * This is called BEFORE the deterministic generator — if a plugin is available,
 * it takes priority and produces higher-quality media output.
 */
export async function tryMediaDispatch(opts: {
  category: OutputCategory;
  prompt: string;
  citizenId: string;
  citizenName: string;
  callGateway?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
}): Promise<{
  dispatched: boolean;
  jobId?: string;
  outputPath?: string;
  error?: string;
}> {
  const dispatchType = OUTPUT_TO_DISPATCH[opts.category];
  if (!dispatchType) {
    return { dispatched: false };
  }

  // Check if any plugin is available for this content type
  const status = getPipelineStatus(loadedPluginsRef);
  if (!status[dispatchType]?.available) {
    return { dispatched: false };
  }

  // Need a callGateway function to dispatch
  if (!opts.callGateway) {
    logger.warn(`No callGateway provided for ${dispatchType} dispatch — falling back to deterministic`);
    return { dispatched: false };
  }

  try {
    const job = await dispatch(
      dispatchType,
      opts.prompt,
      opts.callGateway,
      loadedPluginsRef,
      {
        citizenId: opts.citizenId,
        citizenName: opts.citizenName,
      },
    );

    logger.info(
      `Dispatched ${dispatchType} job ${job.id} to ${job.pipeline.displayName} — status: ${job.status}`,
    );

    return {
      dispatched: true,
      jobId: job.id,
      outputPath: job.outputPath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Media dispatch failed for ${dispatchType}: ${msg}`);
    return { dispatched: false, error: msg };
  }
}

// ─── AI Store Listing (Phase 4) ─────────────────────────────────

/**
 * Auto-create an AI Store product for a creative production.
 * Called after a creative tool writes a real file to republic-output/.
 *
 * Products are created as "listed" with a content URL, ready for purchase.
 * Only a fraction of productions get listed (quality gate + randomness).
 */
export function maybeListInStore(opts: {
  category: OutputCategory;
  title: string;
  outputPath: string | null;
  fileSize: number;
  quality: number;
  citizenId: string;
  citizenName: string;
}): {
  listed: boolean;
  productId?: string;
  priceUsd?: number;
} {
  // Only list productions that have an actual file
  if (!opts.outputPath) {
    return { listed: false };
  }

  // Quality gate: only list quality ≥ 0.6 productions
  if (opts.quality < 0.6) {
    return { listed: false };
  }

  // Size gate: reject unrealistically small files (< 10KB)
  // Real music, art, code modules, etc. are never just a few KB
  const MIN_LISTING_SIZE = 10_240; // 10 KB
  if (opts.fileSize < MIN_LISTING_SIZE) {
    return { listed: false };
  }

  // Probability gate: ~30% of qualifying productions get listed
  // This prevents flooding the store with every single output
  if (Math.random() > 0.3) {
    return { listed: false };
  }

  const storeCategory = OUTPUT_TO_STORE[opts.category] ?? "other";

  // Price based on file size + quality (larger/higher-quality = more expensive)
  const basePrice = Math.max(0.99, opts.fileSize / 10_000);
  const qualityMultiplier = 0.5 + opts.quality * 1.5;
  const priceUsd = parseFloat(Math.min(49.99, basePrice * qualityMultiplier).toFixed(2));

  // Create and immediately list the product
  const product = createProduct(
    opts.title,
    `AI-generated ${opts.category} by ${opts.citizenName}. Real content produced by the HoC Republic creative pipeline.`,
    storeCategory,
    [opts.citizenId],
    [opts.citizenName],
    priceUsd,
    {
      tags: [opts.category, "ai-generated", "republic-production"],
      metadata: {
        fileSize: opts.fileSize,
        outputPath: opts.outputPath,
        generatedAt: ts(),
        source: "creative-tool",
      },
    },
  );

  // Queue and immediately complete generation (content already exists)
  const genReq = queueGeneration(product.id, `Pre-generated ${opts.category}`, opts.citizenId);
  if ("id" in genReq) {
    completeGeneration(genReq.id, opts.outputPath, {
      providerUsed: "output-manager",
    });
  }

  logger.info(
    `Listed in AI Store: "${opts.title}" — $${priceUsd} (${opts.category}, ${(opts.fileSize / 1024).toFixed(0)}KB)`,
  );

  // Write inference metadata sidecar for the Productions admin view
  if (opts.outputPath) {
    writeInferenceMeta(opts.outputPath, {
      provider: "output-manager",
      model: "deterministic-generator",
      tokensIn: 0,
      tokensOut: 0,
      citizenName: opts.citizenName,
    });
  }

  // ─── Async vision review (fire-and-forget) ───────────────────────────────
  // Only for visual categories. Deferred off the citizen tick via setImmediate
  // so the production tools stay non-blocking.
  const VISUAL_CATEGORIES: Set<string> = new Set(["art", "designs", "video", "websites"]);
  if (opts.outputPath && VISUAL_CATEGORIES.has(opts.category)) {
    const outputPath = opts.outputPath;
    setImmediate(() => {
      findFirstImage(outputPath).then((imagePath) => {
        if (!imagePath) {return;}
        return visionAnalyze(imagePath, "quality_review").then((result) => {
          if (result.provider === "none") {return;} // No VLM available — skip
          updateVisionMeta(outputPath, result.score, result.description);
          logger.info(
            `Vision review for "${opts.title}": score=${result.score.toFixed(2)} via ${result.provider}`,
          );
        });
      }).catch((err: unknown) => {
        logger.warn(`Vision review failed for "${opts.title}": ${String(err)}`);
      });
    });
  }

  return {
    listed: true,
    productId: product.id,
    priceUsd,
  };
}

// ─── Image Finder ────────────────────────────────────────────────

/** Image extensions the VLM can process */
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);

/**
 * Find the first image file inside an output path.
 * - If outputPath is a file → return it if it's an image
 * - If outputPath is a directory → scan recursively for first image
 */
async function findFirstImage(outputPath: string): Promise<string | null> {
  try {
    const stat = fs.statSync(outputPath);
    if (!stat.isDirectory()) {
      const ext = path.extname(outputPath).slice(1).toLowerCase();
      return IMAGE_EXTS.has(ext) ? outputPath : null;
    }
    // Scan directory (non-recursive first level, then recurse)
    return scanDirForImage(outputPath);
  } catch {
    return null;
  }
}

function scanDirForImage(dir: string, depth = 0): string | null {
  if (depth > 3) {return null;} // Guard against deep trees
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    // Files first — grab an image at this level before going deeper
    for (const e of entries) {
      if (e.isFile()) {
        const ext = path.extname(e.name).slice(1).toLowerCase();
        if (IMAGE_EXTS.has(ext)) {return path.join(dir, e.name);}
      }
    }
    // Then recurse into subdirs
    for (const e of entries) {
      if (e.isDirectory()) {
        const found = scanDirForImage(path.join(dir, e.name), depth + 1);
        if (found) {return found;}
      }
    }
  } catch { /* unreadable dir */ }
  return null;
}


/**
 * Get a summary of production bridge status.
 */
export function getBridgeStatus(): {
  loadedPlugins: number;
  mediaDispatchAvailable: Record<string, boolean>;
  storeCategories: string[];
} {
  const status = getPipelineStatus(loadedPluginsRef);
  const mediaDispatchAvailable: Record<string, boolean> = {};
  for (const [type, info] of Object.entries(status)) {
    mediaDispatchAvailable[type] = info.available;
  }

  return {
    loadedPlugins: loadedPluginsRef.size,
    mediaDispatchAvailable,
    storeCategories: Object.keys(OUTPUT_TO_STORE),
  };
}
