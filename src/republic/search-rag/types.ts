/**
 * Search + RAG — Types
 *
 * Types for the search-retrieve-augment-generate pipeline.
 */

// ─── Search ──────────────────────────────────────────────────────

export interface SearchQuery {
  /** Natural language query */
  query: string;
  /** Maximum number of search results to retrieve */
  maxResults?: number;
  /** Whether to scrape and chunk results for RAG */
  deepScrape?: boolean;
  /** Content age preference */
  recency?: "any" | "day" | "week" | "month" | "year";
  /** Specific domains to prefer */
  domains?: string[];
}

export interface SearchResult {
  /** Result title */
  title: string;
  /** Source URL */
  url: string;
  /** Brief snippet/description */
  snippet: string;
  /** Full scraped content (if deepScrape enabled) */
  content?: string;
  /** Relevance score (0-1) */
  relevance: number;
  /** Publication date (if available) */
  date?: string;
}

// ─── RAG ─────────────────────────────────────────────────────────

export interface RAGChunk {
  /** Chunk text */
  text: string;
  /** Source URL */
  sourceUrl: string;
  /** Source title */
  sourceTitle: string;
  /** Chunk index within the source */
  chunkIndex: number;
  /** Relevance to the query (0-1) */
  similarity: number;
}

export interface GroundedAnswer {
  /** The synthesized answer */
  answer: string;
  /** Citations used in the answer */
  citations: Citation[];
  /** Whether the answer required web search */
  wasGrounded: boolean;
  /** Search query used (if any) */
  searchQuery?: string;
  /** Total sources consulted */
  sourcesConsulted: number;
  /** Processing time in ms */
  latencyMs: number;
}

// ─── Citations ───────────────────────────────────────────────────

export interface Citation {
  /** Citation index (for [1], [2] markers) */
  index: number;
  /** Source URL */
  url: string;
  /** Source title */
  title: string;
  /** Relevant excerpt from the source */
  excerpt: string;
}

// ─── Grounding ───────────────────────────────────────────────────

export type GroundingDecision = "needs_search" | "model_knowledge" | "uncertain";

export interface GroundingSignals {
  /** Whether the query asks about recent events */
  isRecent: boolean;
  /** Whether the query asks for factual data */
  isFactual: boolean;
  /** Whether the query references specific entities */
  hasNamedEntities: boolean;
  /** Confidence in grounding decision */
  confidence: number;
  /** Final decision */
  decision: GroundingDecision;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface SearchRAGDiagnostics {
  totalQueries: number;
  groundedQueries: number;
  avgLatencyMs: number;
  avgSourcesPerQuery: number;
  cacheHitRate: number;
}
