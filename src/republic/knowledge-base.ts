/**
 * Knowledge Base — Barrel Re-export
 */
export type {
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeAddRequest,
  KnowledgeQueryRequest,
  KnowledgeQueryResult,
  ExtractionResult,
  KnowledgeBaseDiagnostics,
} from "./knowledge-base/types.js";

export {
  addKnowledge,
  updateKnowledge,
  deleteKnowledge,
  getKnowledge,
  queryKnowledge,
  listKnowledge,
  addBulkKnowledge,
  exportKnowledge,
  importKnowledge,
  getKnowledgeBaseDiagnostics,
  resetKnowledgeBase,
} from "./knowledge-base/core.js";

export { extractKnowledge, extractFromMessage } from "./knowledge-base/extraction.js";
