/**
 * Search + RAG — Barrel Re-export
 */
export type {
  SearchQuery,
  SearchResult,
  RAGChunk,
  GroundedAnswer,
  Citation,
  GroundingSignals,
  GroundingDecision,
  SearchRAGDiagnostics,
} from "./search-rag/types.js";

export {
  groundedSearch,
  chunkContent,
  rankChunks,
  getSearchRAGDiagnostics,
  classifyGrounding,
  needsSearch,
  buildCitations,
  formatCitationsMarkdown,
} from "./search-rag/core.js";
