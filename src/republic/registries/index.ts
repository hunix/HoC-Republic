/**
 * registries/index.ts — Barrel export for all domain registries
 */

// Core engine
export {
  type RegistryEntry,
  type RegistryEntryMetadata,
  type RegistryChangeEvent,
  type RegistryListOptions,
  type RegistryStats,
  type RegistryDomain,
  REGISTRY_DOMAINS,
  registryGet,
  registryList,
  registryUpsert,
  registryRemove,
  registrySetEnabled,
  registrySearch,
  registryGetHistory,
  registryExport,
  registryImport,
  registrySeedIfEmpty,
  registryGetStats,
  onRegistryChange,
} from "../dynamic-registry.js";

// Knowledge
export {
  type KnowledgeArticle,
  type KnowledgeTool,
  type KnowledgeCurriculum,
  type KnowledgeData,
  getKnowledgeEntry,
  listKnowledgeEntries,
  upsertKnowledgeEntry,
  removeKnowledgeEntry,
  searchKnowledge,
  listArticlesByDomain,
  seedKnowledgeArticles,
  seedCurriculumNodes,
} from "./knowledge-registry.js";

// Tool Definitions
export {
  type SandboxToolSchema,
  type RepublicToolDef,
  getSandboxTools,
  getSandboxTool,
  listSandboxTools,
  upsertSandboxTool,
  seedSandboxTools,
  getRepublicTools,
  getRepublicTool,
  listRepublicTools,
  upsertRepublicTool,
  removeRepublicTool,
  searchTools,
  seedRepublicTools,
} from "./tool-def-registry.js";

// Prompt Templates
export {
  type PromptTemplate,
  type ReflexRule,
  type BudgetMarker,
  getPromptTemplates,
  getPromptTemplate,
  upsertPromptTemplate,
  removePromptTemplate,
  listPromptTemplates,
  getReflexRules,
  upsertReflexRule,
  getBudgetMarkers,
  seedPromptDefaults,
  seedBudgetMarkers,
} from "./prompt-registry.js";

// Registry Seeder
export { seedAllRegistries } from "./registry-seeder.js";
