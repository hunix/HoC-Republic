-- ============================================================
-- HoC — Supabase Migration 002: Memory Knowledge Graph
-- ============================================================
-- Phase 32A: Persistent storage for the Republic memory graph.
-- Maps from memory-graph.ts in-memory Map<string, MemoryNode>
-- and Map<string, MemoryEdge>.
--
-- Tables:
--   1. memory_nodes — Knowledge graph nodes (entity, concept, event, etc.)
--   2. memory_edges — Weighted directed edges between nodes
-- ============================================================

-- ─── 1. Memory Nodes ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_nodes (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  type            TEXT NOT NULL
                    CHECK (type IN ('entity', 'concept', 'event', 'fact', 'skill', 'emotion', 'location', 'temporal')),
  citizen_id      TEXT NOT NULL,
  metadata        JSONB NOT NULL DEFAULT '{}',
  importance      DOUBLE PRECISION NOT NULL DEFAULT 0.5
                    CHECK (importance >= 0 AND importance <= 1),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_count    INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mnodes_citizen   ON memory_nodes(citizen_id);
CREATE INDEX IF NOT EXISTS idx_mnodes_type      ON memory_nodes(type);
CREATE INDEX IF NOT EXISTS idx_mnodes_importance ON memory_nodes(importance DESC);
CREATE INDEX IF NOT EXISTS idx_mnodes_label_gin ON memory_nodes USING GIN (to_tsvector('english', label));

-- Unique constraint for deduplication (same label + citizen = same node)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mnodes_citizen_label
  ON memory_nodes(citizen_id, lower(label));

-- ─── 2. Memory Edges ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_edges (
  id                TEXT PRIMARY KEY,
  source            TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  target            TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relation          TEXT NOT NULL,
  weight            DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  citizen_id        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reinforced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate edges (same source → target with same relation)
  UNIQUE (source, target, relation)
);

CREATE INDEX IF NOT EXISTS idx_medges_source   ON memory_edges(source);
CREATE INDEX IF NOT EXISTS idx_medges_target   ON memory_edges(target);
CREATE INDEX IF NOT EXISTS idx_medges_citizen  ON memory_edges(citizen_id);
CREATE INDEX IF NOT EXISTS idx_medges_relation ON memory_edges(relation);

-- ─── Row-Level Security ─────────────────────────────────────────

ALTER TABLE memory_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on memory_nodes"
  ON memory_nodes FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on memory_edges"
  ON memory_edges FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Helper Functions ───────────────────────────────────────────

-- Traverse subgraph from a root node up to N hops
CREATE OR REPLACE FUNCTION traverse_subgraph(
  root_id TEXT,
  max_depth INTEGER DEFAULT 2
)
RETURNS TABLE (
  node_id TEXT,
  depth   INTEGER
) AS $$
WITH RECURSIVE traversal AS (
  SELECT root_id AS node_id, 0 AS depth
  UNION
  SELECT
    CASE
      WHEN e.source = t.node_id THEN e.target
      ELSE e.source
    END AS node_id,
    t.depth + 1 AS depth
  FROM traversal t
  JOIN memory_edges e ON (e.source = t.node_id OR e.target = t.node_id)
  WHERE t.depth < max_depth
)
SELECT DISTINCT node_id, MIN(depth) AS depth
FROM traversal
GROUP BY node_id;
$$ LANGUAGE sql STABLE;

-- Search nodes by label (case-insensitive substring)
CREATE OR REPLACE FUNCTION search_memory_nodes(
  p_citizen_id TEXT,
  p_query      TEXT,
  p_limit      INTEGER DEFAULT 10
)
RETURNS SETOF memory_nodes AS $$
SELECT *
FROM memory_nodes
WHERE citizen_id = p_citizen_id
  AND lower(label) LIKE '%' || lower(p_query) || '%'
ORDER BY importance DESC, access_count DESC
LIMIT p_limit;
$$ LANGUAGE sql STABLE;
