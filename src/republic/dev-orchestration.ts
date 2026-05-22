/**
 * Republic Platform — Dev Orchestration Engine
 *
 * BARREL RE-EXPORT — all logic has been modularized into:
 *   ./dev-orchestration/registries.ts          — Language, Database, Framework registries
 *   ./dev-orchestration/types.ts               — Project types and interfaces
 *   ./dev-orchestration/pipeline.ts            — Workflow pipeline engine
 *   ./dev-orchestration/qa-validator.ts        — QA validation and auto-fixer
 *   ./dev-orchestration/boilerplate-templates.ts — Project templates + file content generation
 *   ./dev-orchestration/innovation.ts          — Innovation engine, project factory, helpers
 *   ./dev-orchestration/tick-logic.ts          — Pipeline tick, seeding, elite ideation
 *
 * This file re-exports everything so existing imports remain valid.
 */

// ─── Registries ─────────────────────────────────────────────────
export { DEV_LANGUAGES, DEV_DATABASES, DEV_FRAMEWORKS } from "./dev-orchestration/registries.js";

export type { LanguageSpec, DatabaseSpec, FrameworkSpec } from "./dev-orchestration/registries.js";

// ─── Project Types ──────────────────────────────────────────────
export type {
  ProjectType,
  TeamRole,
  TeamMember,
  DevProject,
  ProjectStatus,
  ProjectStack,
  ProjectFile,
  TestSuite,
  Deployment,
} from "./dev-orchestration/types.js";

// ─── Pipeline ───────────────────────────────────────────────────
export { createPipeline, advancePipeline } from "./dev-orchestration/pipeline.js";

export type {
  WorkflowStage,
  WorkflowPipeline,
  WorkflowStageStatus,
} from "./dev-orchestration/pipeline.js";

// ─── QA Validator & Auto-Fixer ──────────────────────────────────
export { runQAValidation, autoFixIssues } from "./dev-orchestration/qa-validator.js";

export type { QAResult, QAIssue, AutoFixResult } from "./dev-orchestration/qa-validator.js";

// ─── Boilerplate Templates ─────────────────────────────────────
export { PROJECT_TEMPLATES } from "./dev-orchestration/boilerplate-templates.js";

export type { ProjectTemplate } from "./dev-orchestration/boilerplate-templates.js";

// ─── Innovation, Factory & Helpers ──────────────────────────────
export {
  proposeInnovation,
  generateFileContent,
  generateProjectName,
  createProjectFromTemplate,
  createBlankProject,
  getLanguage,
  getDatabase,
  getFramework,
  allLanguageIds,
  allDatabaseIds,
} from "./dev-orchestration/innovation.js";

export type { Innovation } from "./dev-orchestration/innovation.js";

// ─── Tick Logic & Seeding ───────────────────────────────────────
export {
  devPipelineTick,
  seedStarterProjects,
  forceIdeateProject,
  clearActivePipelines,
} from "./dev-orchestration/tick-logic.js";
