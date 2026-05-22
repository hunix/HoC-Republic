/**
 * Knowledge Base — Types
 *
 * Persistent cross-session memory: facts, preferences, decisions.
 */

// ─── Knowledge Entry ─────────────────────────────────────────────

export type KnowledgeCategory =
  | "fact"
  | "preference"
  | "decision"
  | "instruction"
  | "context"
  | "skill"
  | "entity"
  | "relationship";

export interface KnowledgeEntry {
  id: string;
  /** Short summary / title */
  title: string;
  /** Full content */
  content: string;
  /** Category for filtering */
  category: KnowledgeCategory;
  /** Tags for search */
  tags: string[];
  /** Source (conversation ID, document, manual) */
  source: string;
  /** Confidence in this knowledge (0-1) */
  confidence: number;
  /** How many times this was retrieved */
  retrievalCount: number;
  /** When this knowledge was created */
  createdAt: string;
  /** When this knowledge was last accessed */
  lastAccessedAt: string;
  /** When this knowledge was last updated */
  updatedAt: string;
  /** Whether this has been verified by the user */
  verified: boolean;
}

// ─── Operations ──────────────────────────────────────────────────

export interface KnowledgeAddRequest {
  title: string;
  content: string;
  category?: KnowledgeCategory;
  tags?: string[];
  source?: string;
  confidence?: number;
}

export interface KnowledgeQueryRequest {
  /** Natural language query */
  query: string;
  /** Filter by category */
  category?: KnowledgeCategory;
  /** Filter by tags */
  tags?: string[];
  /** Maximum results */
  topK?: number;
  /** Minimum confidence threshold */
  minConfidence?: number;
}

export interface KnowledgeQueryResult {
  entries: Array<KnowledgeEntry & { similarity: number }>;
  totalEntries: number;
  queryTimeMs: number;
}

// ─── Extraction ──────────────────────────────────────────────────

export interface ExtractionResult {
  /** Facts extracted from the conversation */
  facts: Array<{ title: string; content: string; category: KnowledgeCategory }>;
  /** Number of conversation turns analyzed */
  turnsAnalyzed: number;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface KnowledgeBaseDiagnostics {
  totalEntries: number;
  categoryBreakdown: Record<string, number>;
  totalRetrievals: number;
  avgConfidence: number;
  oldestEntry?: string;
  newestEntry?: string;
}
