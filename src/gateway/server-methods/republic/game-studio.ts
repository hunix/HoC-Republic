/**
 * Game Studio — Gateway RPC Handlers
 *
 * Handles citizen-driven 3D React game generation via the scaffold system.
 *
 * Games are stored FLAT: republic-output/games/{gameSlug}/
 * NOT nested under citizenId — citizenId is stored in package.json metadata.
 *
 * Methods:
 *   republic.game.archetypes  — list available game archetypes + metadata
 *   republic.game.scaffold    — generate a game project scaffold
 *   republic.game.list        — list citizen-generated game projects
 *   republic.game.read-file   — read a specific file from a game project
 *   republic.game.delete      — delete a game project
 */

import * as path from "node:path";
import * as fs from "node:fs";
import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  generateGameScaffold,
  ARCHETYPE_META,
  detectArchetype,
  type GameArchetype,
} from "../../../republic/game-scaffold-generator.js";

// All games stored flat here — NO citizenId nesting
const GAMES_OUTPUT_ROOT = path.join(process.cwd(), "republic-output", "games");

/** A valid game dir must have package.json at its root */
function isGameDir(dirPath: string): boolean {
  try { return fs.existsSync(path.join(dirPath, "package.json")); } catch { return false; }
}

/** Extract archetype from game's package.json */
function readArchetype(gamePath: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(gamePath, "package.json"), "utf8")) as {
      description?: string;
      keywords?: string[];
      hoc?: { archetype?: string };
    };
    if (pkg.hoc?.archetype) { return pkg.hoc.archetype; }
    const match = pkg.description?.match(/(\w[\w -]+?) game built with/i);
    if (match?.[1]) { return match[1].trim(); }
    const archetypeKeywords = new Set(["platformer", "space-shooter", "physics-puzzle", "rpg", "racing"]);
    const found = pkg.keywords?.find((k) => archetypeKeywords.has(k.toLowerCase()));
    if (found) { return found; }
  } catch { /* no-op */ }
  return "unknown archetype";
}

/** Extract citizenId from game's package.json */
function readCitizenId(gamePath: string): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(gamePath, "package.json"), "utf8")) as {
      hoc?: { citizenId?: string; citizenName?: string };
      author?: string;
    };
    return pkg.hoc?.citizenId ?? pkg.hoc?.citizenName ?? pkg.author ?? "unknown";
  } catch { return "unknown"; }
}

export const gameStudioHandlers: Partial<GatewayRequestHandlers> = {

  /** List all available game archetypes with metadata for the UI */
  "republic.game.archetypes": ({ respond }) => {
    const archetypes = Object.entries(ARCHETYPE_META).map(([id, meta]) => ({ id, ...meta }));
    respond(true, { ok: true, archetypes }, undefined);
  },

  /**
   * Generate a 3D React game scaffold.
   * Output path: GAMES_OUTPUT_ROOT/{slug}/  (flat — no citizenId nesting)
   */
  "republic.game.scaffold": async ({ params, respond }) => {
    const p = params as {
      citizenId?: string;
      citizenName?: string;
      specialization?: string;
      gameName?: string;
      archetype?: string;
      prompt?: string;
    } | undefined;

    if (!p?.citizenName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenName required"));
      return;
    }

    const gameName = p.gameName ?? `${p.citizenName}s-game-${Date.now()}`;
    const prompt = p.prompt ?? `Create a 3D ${p.archetype ?? "platformer"} game`;
    const archetype = (p.archetype && p.archetype in ARCHETYPE_META
      ? p.archetype
      : detectArchetype(prompt, p.specialization)) as GameArchetype;

    // Flat: games/{slug}/ — citizenId goes in package.json only
    const slug = gameName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "").slice(0, 60);
    const outputDir = path.join(GAMES_OUTPUT_ROOT, slug);

    try {
      const result = await generateGameScaffold({ archetype, gameName, citizenName: p.citizenName, prompt, outputDir });

      if (!result.ok) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, result.error ?? "Scaffold failed"));
        return;
      }

      // Inject HoC metadata into package.json for retrieval later
      try {
        const pkgPath = path.join(outputDir, "package.json");
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
          pkg["hoc"] = { citizenId: p.citizenId ?? "unknown", citizenName: p.citizenName, archetype };
          fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        }
      } catch { /* non-fatal */ }

      respond(true, {
        ok: true,
        archetype,
        gameName,
        slug,
        outputDir,
        fileCount: result.files.length,
        files: result.files.map(f => f.relativePath),
        instructions: result.instructions,
        archetypeMeta: ARCHETYPE_META[archetype],
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /**
   * List all generated game projects.
   * Scans GAMES_OUTPUT_ROOT directly — any directory with a package.json is a game.
   */
  "republic.game.list": ({ params, respond }) => {
    const p = params as { citizenId?: string; limit?: number } | undefined;
    const limit = p?.limit ?? 200;

    try {
      fs.mkdirSync(GAMES_OUTPUT_ROOT, { recursive: true });

      const games: Array<{
        gameName: string;
        archetype: string;
        citizenId: string;
        path: string;
        fileCount: number;
        createdAt: number;
        sizeBytes: number;
      }> = [];

      for (const entry of fs.readdirSync(GAMES_OUTPUT_ROOT)) {
        const gamePath = path.join(GAMES_OUTPUT_ROOT, entry);
        try {
          if (!fs.statSync(gamePath).isDirectory()) { continue; }
          if (!isGameDir(gamePath)) { continue; } // must have package.json

          const archetype = readArchetype(gamePath);
          const citizenId = readCitizenId(gamePath);

          if (p?.citizenId && citizenId !== p.citizenId) { continue; }

          let fileCount = 0;
          let sizeBytes = 0;
          const walk = (dir: string) => {
            for (const f of fs.readdirSync(dir)) {
              if (f === "node_modules") { continue; }
              const fp = path.join(dir, f);
              const stat = fs.statSync(fp);
              if (stat.isDirectory()) { walk(fp); } else { fileCount++; sizeBytes += stat.size; }
            }
          };
          walk(gamePath);

          const stat = fs.statSync(gamePath);
          games.push({ gameName: entry, archetype, citizenId, path: gamePath, fileCount, createdAt: stat.birthtimeMs, sizeBytes });
        } catch { /* skip unreadable dirs */ }
      }

      games.sort((a, b) => b.createdAt - a.createdAt);
      respond(true, { ok: true, games: games.slice(0, limit), total: games.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /** Read a specific file from a game project */
  "republic.game.read-file": ({ params, respond }) => {
    const p = params as { gameName?: string; filePath?: string } | undefined;
    if (!p?.gameName || !p?.filePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "gameName and filePath required"));
      return;
    }
    const safe = path.normalize(p.filePath).replace(/^(\.\.[\\/])+/, "");
    const fullPath = path.join(GAMES_OUTPUT_ROOT, p.gameName, safe);
    if (!fullPath.startsWith(GAMES_OUTPUT_ROOT)) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, "Path traversal denied"));
      return;
    }
    try {
      respond(true, { ok: true, content: fs.readFileSync(fullPath, "utf8"), path: safe }, undefined);
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `File not found: ${safe}`));
    }
  },

  /** Delete a game project directory */
  "republic.game.delete": ({ params, respond }) => {
    const p = params as { gameName?: string } | undefined;
    if (!p?.gameName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "gameName required"));
      return;
    }
    const gamePath = path.join(GAMES_OUTPUT_ROOT, p.gameName);
    if (!gamePath.startsWith(GAMES_OUTPUT_ROOT)) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, "Path traversal denied"));
      return;
    }
    try {
      if (fs.existsSync(gamePath)) { fs.rmSync(gamePath, { recursive: true, force: true }); }
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
