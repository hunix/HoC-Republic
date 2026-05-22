/**
 * Output Manager — Barrel re-export
 *
 * The original 3,140-line monolith has been decomposed into focused modules
 * under `output-manager/`. This barrel ensures zero-breaking-change backward
 * compatibility for all existing imports.
 *
 * Modules:
 *   types.ts            — OutputCategory, OutputEntry, result types, constants
 *   core.ts             — Dir management, file I/O, logging, query API, evolution
 *   gen-music-art.ts    — Music scores, artwork, animations
 *   gen-media.ts        — Screenplays, podcasts, video, advertisements
 *   gen-code-projects.ts — Code projects, games, websites, design systems
 *   gen-research-docs.ts — Research papers, 3D models, documents, inventions
 *   gen-ml.ts           — ML pipelines, LLM projects, datasets
 *   tick.ts             — Generator registry, outputManagerTick dispatch
 */

// ── Types & Constants ───────────────────────────────────────────
export type {
  OutputCategory,
  OutputEntry,
  SingleFileResult,
  ProjectFile,
  ProjectResult,
  GeneratorResult,
  GeneratorFn,
  CreativeEvolution,
} from "./output-manager/types.js";

export { ALL_CATEGORIES, isProjectResult } from "./output-manager/types.js";

// ── Core (file I/O, logging, query, evolution) ──────────────────
export {
  ensureAllOutputDirs,
  ensureDir,
  writeTextOutput,
  writeBinaryOutput,
  writeProjectOutput,
  logOutput,
  evolution,
  evolveCreativity,
  recordCreation,
  getCreativeEvolution,
  getOutputLog,
  getOutputStats,
  getOutputDiagnostics,
} from "./output-manager/core.js";

// ── Content Generators ──────────────────────────────────────────
export {
  generateMusicScore,
  generateArtwork,
  generateAnimation,
} from "./output-manager/gen-music-art.js";
export {
  generateScreenplay,
  generatePodcast,
  generateVideoStoryboard,
  generateRealVideoHTML,
  generateAdvertisement,
} from "./output-manager/gen-media.js";
export {
  generateCodeProject,
  generateGameProject,
  generateWebsite,
  generateDesignSystem,
} from "./output-manager/gen-code-projects.js";
export {
  generateResearchNotebook,
  generate3DModel,
  generateInvention,
  generateDocumentReport,
  generatePresentationDeck,
  generateSpreadsheetData,
} from "./output-manager/gen-research-docs.js";
export {
  generateMLPipeline,
  generateLLMProject,
  generateDataset,
} from "./output-manager/gen-ml.js";

// ── Tick Orchestrator ───────────────────────────────────────────
export { outputManagerTick } from "./output-manager/tick.js";
