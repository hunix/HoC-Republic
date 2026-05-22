/**
 * Republic Gateway Handlers â€” creative
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
import {
  compositeImages,
  editImage,
  generateImage,
  generateVariations,
  getCreativeStudioDiagnostics,
  getGallery,
  getImageById,
  upscaleImage,
} from "../../../republic/creative-studio.js";
// Phase 35: Docker Orchestration Engine
import {
  generateHTML,
  generateInvoice,
  generateMarkdown,
  generatePDF,
  generatePresentation,
  generateSpreadsheet,
  getDocumentById,
  getDocumentGeneratorDiagnostics,
  getDocumentHistory,
} from "../../../republic/document-generator.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
import { autoPopulateMarketplace, getPublicListings } from "../../../republic/marketplace.js";
// Phase 34: HuggingFace Model Provisioner
import {
  getOutputDiagnostics,
  getOutputLog,
  getOutputStats,
} from "../../../republic/output-manager.js";
// Phase 37: Database Persistence Layer
import {
  getConfig,
  getConfigDiagnostics,
  updateConfig,
} from "../../../republic/republic-config.js";
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const creativeHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 10: Creative Studio ────────────────────────────────

  "republic.creative.generateImage": async ({ params, respond }) => {
    const p = params as { prompt?: string; style?: string; size?: string } | undefined;
    if (!p?.prompt) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "prompt required"));
      return;
    }
    try {
      const img = await generateImage(p.prompt, { style: p.style as never, size: p.size as never });
      respond(true, { ok: true, image: img }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.creative.editImage": async ({ params, respond }) => {
    const p = params as { source?: string; prompt?: string; style?: string } | undefined;
    if (!p?.source || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "source and prompt required"),
      );
      return;
    }
    try {
      const result = await editImage({
        sourceBase64: p.source,
        prompt: p.prompt,
        style: p.style as never,
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.creative.variations": async ({ params, respond }) => {
    const p = params as { source?: string; count?: number } | undefined;
    if (!p?.source) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "source base64 required"));
      return;
    }
    const result = await generateVariations(p.source, p.count);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.creative.upscale": async ({ params, respond }) => {
    const p = params as { source?: string; scaleFactor?: number } | undefined;
    if (!p?.source) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "source base64 required"));
      return;
    }
    const result = await upscaleImage(p.source, p.scaleFactor);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.creative.composite": async ({ params, respond }) => {
    const p = params as { layers?: unknown[]; width?: number; height?: number } | undefined;
    if (!p?.layers?.length) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "layers required"));
      return;
    }
    const result = compositeImages(p.layers as never, p.width, p.height);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.creative.gallery": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    respond(true, { ok: true, images: getGallery(p?.limit) }, undefined);
  },

  "republic.creative.getImage": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "image id required"));
      return;
    }
    const image = getImageById(p.id);
    respond(true, { ok: true, image: image ?? null }, undefined);
  },

  "republic.creative.diagnostics": ({ respond }) => {
    respond(true, getCreativeStudioDiagnostics(), undefined);
  },

  // ─── Phase 10: Document Generator ─────────────────────────────

  "republic.docs.generatePDF": async ({ params, respond }) => {
    const p = params as { spec?: unknown; savePath?: string } | undefined;
    if (!p?.spec || !p?.savePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "spec and savePath required"),
      );
      return;
    }
    try {
      const doc = await generatePDF(p.spec as never, p.savePath);
      respond(true, { ok: true, document: doc }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.docs.generateInvoice": async ({ params, respond }) => {
    const p = params as { invoice?: unknown; savePath?: string } | undefined;
    if (!p?.invoice || !p?.savePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invoice spec and savePath required"),
      );
      return;
    }
    try {
      const doc = await generateInvoice(p.invoice as never, p.savePath);
      respond(true, { ok: true, document: doc }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.docs.generatePresentation": async ({ params, respond }) => {
    const p = params as { spec?: unknown; savePath?: string } | undefined;
    if (!p?.spec || !p?.savePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "spec and savePath required"),
      );
      return;
    }
    try {
      const doc = await generatePresentation(p.spec as never, p.savePath);
      respond(true, { ok: true, document: doc }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.docs.generateSpreadsheet": async ({ params, respond }) => {
    const p = params as { spec?: unknown; savePath?: string } | undefined;
    if (!p?.spec || !p?.savePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "spec and savePath required"),
      );
      return;
    }
    try {
      const doc = await generateSpreadsheet(p.spec as never, p.savePath);
      respond(true, { ok: true, document: doc }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.docs.generateMarkdown": async ({ params, respond }) => {
    const p = params as { spec?: unknown; savePath?: string } | undefined;
    if (!p?.spec || !p?.savePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "spec and savePath required"),
      );
      return;
    }
    try {
      const doc = await generateMarkdown(p.spec as never, p.savePath);
      respond(true, { ok: true, document: doc }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.docs.generateHTML": async ({ params, respond }) => {
    const p = params as { spec?: unknown; savePath?: string } | undefined;
    if (!p?.spec || !p?.savePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "spec and savePath required"),
      );
      return;
    }
    try {
      const doc = await generateHTML(p.spec as never, p.savePath);
      respond(true, { ok: true, document: doc }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.docs.history": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    respond(true, { ok: true, documents: getDocumentHistory(p?.limit) }, undefined);
  },

  "republic.docs.getDocument": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "document id required"));
      return;
    }
    const doc = getDocumentById(p.id);
    respond(true, { ok: true, document: doc ?? null }, undefined);
  },

  "republic.docs.diagnostics": ({ respond }) => {
    respond(true, getDocumentGeneratorDiagnostics(), undefined);
  },

  // ─── Phase 11: Republic Config ──────────────────────────────────

  "republic.config.get": ({ respond }) => {
    respond(true, { ok: true, config: getConfig() }, undefined);
  },

  "republic.config.update": ({ params, respond }) => {
    const p = params as { updates?: Partial<ReturnType<typeof getConfig>> } | undefined;
    if (!p?.updates) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "updates object required"));
      return;
    }
    try {
      updateConfig(p.updates as Parameters<typeof updateConfig>[0]);
      respond(true, { ok: true, config: getConfig() }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.config.diagnostics": ({ respond }) => {
    respond(true, getConfigDiagnostics(), undefined);
  },

  // ─── Productions Browser ──────────────────────────────────────

  "republic.productions.list": ({ params, respond }) => {
    const p = params as { category?: string; limit?: number } | undefined;
    const log = getOutputLog(p?.category as never, p?.limit ?? 100);
    respond(true, { ok: true, items: log }, undefined);
  },

  "republic.productions.stats": ({ respond }) => {
    respond(true, { ok: true, stats: getOutputStats() }, undefined);
  },

  "republic.productions.diagnostics": ({ respond }) => {
    respond(true, getOutputDiagnostics(), undefined);
  },

  "republic.productions.files": async ({ params, respond }) => {
    /**
     * Quality gate for citizen productions.
     *
     * A file only shows up on the Productions page if it passes ALL of:
     *   1. Belongs to a public production category (not citizen-internal)
     *   2. Has an allowed file extension for that category
     *   3. Meets the minimum size threshold (filters out stubs/snippets)
     *
     * Citizen-internal categories excluded:
     *   dreams, chronicles, journals, evolution, ads — these are internal
     *   citizen cognitive state and should never appear as productions.
     *
     * Raw source files (.ts, .js, .py, .json, .md) are EXCLUDED from all
     * categories UNLESS they are inside a project directory. Individual
     * source code snippets are not productions.
     */

    // ─── Extension allowlists per category ────────────────────────────────────
    // Only these extensions count as real deliverable productions.
    const ALLOWED_EXT: Record<string, Set<string>> = {
      music:      new Set(["wav", "mp3", "flac", "ogg", "m4a", "aac"]),
      podcasts:   new Set(["wav", "mp3", "flac", "ogg", "m4a", "aac"]),
      video:      new Set(["mp4", "webm", "mov", "avi", "mkv", "ogv"]),
      art:        new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "tiff", "bmp", "svg", "psd"]),
      designs:    new Set(["png", "jpg", "jpeg", "webp", "svg", "pdf", "psd", "ai", "sketch", "fig"]),
      "3d-models":new Set(["obj", "fbx", "glb", "gltf", "blend", "stl", "ply", "dae"]),
      "ml-models":new Set(["gguf", "pt", "pth", "safetensors", "bin", "onnx", "pkl", "h5"]),
      datasets:   new Set(["csv", "jsonl", "parquet", "feather", "arrow", "tsv", "ndjson", "xlsx"]),
      // For these, only proper document/output formats count — not raw source snippets
      research:   new Set(["pdf", "docx", "html", "txt", "epub", "latex", "tex"]),
      screenplays:new Set(["pdf", "fountain", "fdx", "txt", "docx"]),
      docs:       new Set(["pdf", "docx", "html", "epub", "txt"]),
      inventions: new Set(["pdf", "docx", "html", "txt", "png", "svg"]),
      // Code/games/websites: must be project directories (directories pass by default)
      // or specific bundled output formats — no raw source files
      code:       new Set(["zip", "tar", "gz", "tgz", "7z", "jar", "wasm", "exe", "dmg", "deb", "AppImage", "msi"]),
      games:      new Set(["zip", "tar", "gz", "tgz", "7z", "exe", "wasm", "apk", "ipa", "dmg"]),
      websites:   new Set(["zip", "tar", "gz", "tgz"]),
    };

    // ─── Minimum sizes (bytes) ─────────────────────────────────────────────────
    const MIN_SIZE: Record<string, number> = {
      video:       2 * 1024 * 1024,  // 2MB  — real video files
      music:         200 * 1024,     // 200KB — real audio WAV/MP3
      podcasts:      200 * 1024,     // 200KB
      art:            20 * 1024,     // 20KB  — real images
      designs:        20 * 1024,     // 20KB
      "3d-models":    50 * 1024,     // 50KB
      "ml-models": 10 * 1024 * 1024, // 10MB  — real model weights
      datasets:       50 * 1024,     // 50KB
      games:         100 * 1024,     // 100KB — game bundles
      websites:       10 * 1024,     // 10KB
      code:           10 * 1024,     // 10KB
      research:        5 * 1024,     // 5KB   — real research papers
      screenplays:     5 * 1024,     // 5KB
      docs:            5 * 1024,     // 5KB
      inventions:      5 * 1024,     // 5KB
    };

    // ─── Public-facing categories only ────────────────────────────────────────
    // Excluded: dreams, chronicles, journals, evolution, ads, inventions-internal
    const PUBLIC_CATEGORIES = [
      "art",
      "music",
      "video",
      "podcasts",
      "games",
      "websites",
      "code",
      "research",
      "screenplays",
      "docs",
      "3d-models",
      "designs",
      "ml-models",
      "datasets",
      "inventions",
    ];

    const p = params as { category?: string; limit?: number } | undefined;
    const baseDir = path.join(process.cwd(), "republic-output");
    const categories = p?.category
      ? PUBLIC_CATEGORIES.includes(p.category) ? [p.category] : []
      : PUBLIC_CATEGORIES;

    const files: {
      name: string;
      category: string;
      size: number;
      path: string;
      publishedAt: string;
    }[] = [];

    for (const cat of categories) {
      const allowedExts = ALLOWED_EXT[cat];
      const minBytes = MIN_SIZE[cat] ?? 5 * 1024; // 5KB default
      const catDir = path.join(baseDir, cat);
      if (!fs.existsSync(catDir)) { continue; }

      try {
        const entries = fs.readdirSync(catDir, { withFileTypes: true }) as {
          isFile: () => boolean;
          isDirectory: () => boolean;
          name: string;
        }[];

        for (const entry of entries) {
          if (entry.isFile()) {
            // Check extension allowlist
            const ext = (entry.name.split(".").pop() ?? "").toLowerCase();
            if (allowedExts && !allowedExts.has(ext)) { continue; } // Wrong file type
            const stat = fs.statSync(path.join(catDir, entry.name));
            if (stat.size < minBytes) { continue; } // Too small — stub/snippet
            files.push({
              name: entry.name,
              category: cat,
              size: stat.size,
              path: `republic-output/${cat}/${entry.name}`,
              publishedAt: stat.mtime.toISOString(),
            });
          } else if (entry.isDirectory()) {
            // Project directories: aggregate total size, apply min threshold
            const projDir = path.join(catDir, entry.name);
            let totalSize = 0;
            let latestMtime = new Date(0);
            try {
              for (const f of fs.readdirSync(projDir)) {
                try {
                  const fstat = fs.statSync(path.join(projDir, f));
                  totalSize += fstat.size;
                  if (fstat.mtime > latestMtime) { latestMtime = fstat.mtime; }
                } catch { /* skip inaccessible */ }
              }
            } catch { /* skip if dir unreadable */ }
            if (totalSize < minBytes) { continue; } // Too small — incomplete project
            files.push({
              name: entry.name + "/",
              category: cat,
              size: totalSize,
              path: `republic-output/${cat}/${entry.name}/`,
              publishedAt: latestMtime.toISOString(),
            });
          }
        }
      } catch { /* directory inaccessible */ }
    }

    // Sort newest first
    files.toSorted((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const limit = Math.min(typeof p?.limit === "number" ? p.limit : 500, 500);
    files.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    // Enrich with .meta.json sidecar data (model, tokens, cost)
    const { readInferenceMetaByRelPath } = await import("../../../republic/inference-meta.js");
    const enriched = files.slice(0, limit).map((f) => {
      const meta = readInferenceMetaByRelPath(f.path);
      return {
        ...f,
        model: meta?.model,
        provider: meta?.provider,
        tokensIn: meta?.tokensIn,
        tokensOut: meta?.tokensOut,
        estimatedCostUsd: meta?.estimatedCostUsd,
        visionScore: meta?.visionScore,
        visionDescription: meta?.visionDescription,
        citizenName: meta?.citizenName,
      };
    });

    respond(true, { ok: true, files: enriched, totalOnDisk: files.length }, undefined);
  },


  /**
   * Read full file content from a production.
   * Returns text content for text files, base64 for binary.
   */
  "republic.productions.read-file": ({ params, respond }) => {
    const p = params as { filePath?: string } | undefined;
    if (!p?.filePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePath required"));
      return;
    }
    const baseDir = path.resolve(process.cwd(), "republic-output");
    const resolved = path.resolve(process.cwd(), p.filePath);
    if (!resolved.startsWith(baseDir)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "path outside republic-output"),
      );
      return;
    }
    if (!fs.existsSync(resolved)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file not found"));
      return;
    }
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      // List all files in the directory recursively
      const projectFiles: { path: string; content: string; size: number }[] = [];
      const walk = (dir: string, prefix: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isFile()) {
            const fstat = fs.statSync(fullPath);
            const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
            const binaryExts = [
              "wav",
              "mp3",
              "ogg",
              "png",
              "jpg",
              "gif",
              "pdf",
              "gguf",
              "safetensors",
              "obj",
            ];
            let content: string;
            if (binaryExts.includes(ext)) {
              content = `[Binary file: ${fstat.size} bytes]`;
            } else {
              try {
                content = fs.readFileSync(fullPath, "utf-8");
              } catch {
                content = "[unreadable]";
              }
            }
            projectFiles.push({ path: relPath, content, size: fstat.size });
          } else if (entry.isDirectory()) {
            walk(fullPath, relPath);
          }
        }
      };
      walk(resolved, "");
      respond(true, { ok: true, isDirectory: true, files: projectFiles }, undefined);
      return;
    }
    // Single file
    const ext = path.extname(resolved).slice(1).toLowerCase();
    const binaryExts = ["wav", "mp3", "ogg", "png", "jpg", "gif", "pdf", "gguf", "safetensors"];
    if (binaryExts.includes(ext)) {
      const data = fs.readFileSync(resolved);
      respond(
        true,
        {
          ok: true,
          isDirectory: false,
          content: data.toString("base64"),
          encoding: "base64",
          size: stat.size,
        },
        undefined,
      );
    } else {
      const content = fs.readFileSync(resolved, "utf-8");
      respond(
        true,
        { ok: true, isDirectory: false, content, encoding: "utf-8", size: stat.size },
        undefined,
      );
    }
  },

  /**
   * Write/overwrite a file in a production.
   */
  "republic.productions.write-file": ({ params, respond }) => {
    const p = params as { filePath?: string; content?: string } | undefined;
    if (!p?.filePath || p.content === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "filePath and content required"),
      );
      return;
    }
    const baseDir = path.resolve(process.cwd(), "republic-output");
    const resolved = path.resolve(process.cwd(), p.filePath);
    if (!resolved.startsWith(baseDir)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "path outside republic-output"),
      );
      return;
    }
    try {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, p.content, "utf-8");
      const stat = fs.statSync(resolved);
      respond(true, { ok: true, size: stat.size }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  /**
   * Delete a production file or project directory.
   */
  "republic.productions.delete": ({ params, respond }) => {
    const p = params as { filePath?: string } | undefined;
    if (!p?.filePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePath required"));
      return;
    }
    const baseDir = path.resolve(process.cwd(), "republic-output");
    const resolved = path.resolve(process.cwd(), p.filePath);
    if (!resolved.startsWith(baseDir)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "path outside republic-output"),
      );
      return;
    }
    if (!fs.existsSync(resolved)) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "not found"));
      return;
    }
    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        fs.rmSync(resolved, { recursive: true, force: true });
      } else {
        fs.unlinkSync(resolved);
      }
      respond(true, { ok: true, deleted: p.filePath }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  // ─── Production Pipeline ───────────────────────────────────────

  "republic.productions.pipeline-status": ({ respond }) => {
    // Report which content types have registered pipeline backends.
    // Note: we report registry info statically — plugin availability
    // depends on whether the python backend is actually installed.
    const { getPipelineStatus, getSupportedTypes } = require("../../../republic/production-dispatcher.js") as typeof import("../../../republic/production-dispatcher.js");

    // Best effort: check which plugin dirs exist on disk
    const pluginDir = path.join(process.cwd(), "plugins");
    const loadedPlugins = new Set<string>();
    try {
      for (const entry of fs.readdirSync(pluginDir)) {
        loadedPlugins.add(entry);
      }
    } catch { /* no plugins dir */ }

    const status = getPipelineStatus(loadedPlugins);
    respond(true, { ok: true, types: getSupportedTypes(), pipelines: status }, undefined);
  },

  "republic.productions.generate": async ({ params, respond }) => {
    const p = params as {
      contentType?: string;
      prompt?: string;
      citizenId?: string;
      citizenName?: string;
    } | undefined;

    if (!p?.contentType || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "contentType and prompt required"),
      );
      return;
    }

    const { dispatch } = require("../../../republic/production-dispatcher.js") as typeof import("../../../republic/production-dispatcher.js");

    // Detect loaded plugins from disk
    const pluginDir = path.join(process.cwd(), "plugins");
    const loadedPlugins = new Set<string>();
    try {
      for (const entry of fs.readdirSync(pluginDir)) {
        loadedPlugins.add(entry);
      }
    } catch { /* no plugins dir */ }

    // Wire callGateway to the real gateway handler registry
    const callGateway = async (method: string, gParams: Record<string, unknown>) => {
      try {
        const { coreGatewayHandlers } = await import("../../server-methods.js");
        const handler = coreGatewayHandlers[method];
        if (handler) {
          return await new Promise<unknown>((resolve, reject) => {
            const respond = (ok: boolean, result: unknown, error: unknown) => {
              if (ok) { resolve(result); }
              else { reject(error ?? new Error(`Gateway call failed: ${method}`)); }
            };
            handler({
              req: { method, params: gParams } as never,
              params: gParams,
              client: null,
              isWebchatConnect: () => false,
              respond,
              context: {} as never,
            });
          });
        }
        return {
          jobId: `job-${Date.now()}`, method, status: "failed",
          error: `No handler registered for ${method}. Is the plugin backend running?`,
        };
      } catch (err) {
        return {
          jobId: `job-${Date.now()}`, method, status: "failed",
          error: `Plugin handler error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    };

    try {
      const job = await dispatch(
        p.contentType,
        p.prompt,
        callGateway,
        loadedPlugins,
        { citizenId: p.citizenId, citizenName: p.citizenName },
      );
      respond(true, { ok: true, job }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.productions.jobs": ({ respond }) => {
    const { listJobs } = require("../../../republic/production-dispatcher.js") as typeof import("../../../republic/production-dispatcher.js");
    respond(true, { ok: true, jobs: listJobs() }, undefined);
  },

  // ─── Marketplace Browser ──────────────────────────────────────

  "republic.marketplace.list": ({ params, respond }) => {
    const p = params as { type?: string; limit?: number } | undefined;
    const state = getState();
    // Auto-populate from citizen productions before querying
    const fullLog = getOutputLog(undefined, 500);
    autoPopulateMarketplace(
      state,
      fullLog as {
        id: string;
        category: string;
        creatorId: string;
        creatorName: string;
        title: string;
        fileSize: number;
        filename?: string;
      }[],
    );
    const listings = getPublicListings(state, p?.limit ?? 200);
    respond(true, { ok: true, listings }, undefined);
  },
  // Note: republic.marketplace.diagnostics is handled by financeHandlers (spreads last → wins)
};
