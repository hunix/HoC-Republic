-- ============================================================
-- HoC — Supabase Migration 003: Observability Tables
-- ============================================================
-- Phase 32A: Persistent storage for agent observability data.
-- Maps from observability.ts in-memory arrays (TraceSpan[],
-- DecisionRecord[], CostBucket).
--
-- Tables:
--   1. trace_spans     — Distributed tracing spans
--   2. decision_records — Agent decision audit log
--   3. cost_buckets    — Per-citizen cost tracking
--   4. behavior_anomalies — Anomaly detection results
-- ============================================================

-- ─── 1. Trace Spans ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trace_spans (
  trace_id       TEXT NOT NULL,
  span_id        TEXT PRIMARY KEY,
  parent_span_id TEXT,
  citizen_id     TEXT NOT NULL,
  operation      TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ok'
                   CHECK (status IN ('ok', 'error', 'timeout')),
  start_tick     INTEGER NOT NULL,
  end_tick       INTEGER,
  duration_ticks INTEGER NOT NULL DEFAULT 0,
  attributes     JSONB NOT NULL DEFAULT '{}',
  events         JSONB NOT NULL DEFAULT '[]',
  tokens_used    INTEGER NOT NULL DEFAULT 0,
  credits_spent  DOUBLE PRECISION NOT NULL DEFAULT 0,
  model_id       TEXT,
  tool_ids       TEXT[] NOT NULL DEFAULT '{}',
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spans_trace    ON trace_spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_citizen  ON trace_spans(citizen_id);
CREATE INDEX IF NOT EXISTS idx_spans_op       ON trace_spans(operation);
CREATE INDEX IF NOT EXISTS idx_spans_status   ON trace_spans(status);
CREATE INDEX IF NOT EXISTS idx_spans_ts       ON trace_spans(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_spans_parent   ON trace_spans(parent_span_id) WHERE parent_span_id IS NOT NULL;

-- ─── 2. Decision Records ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS decision_records (
  id          TEXT PRIMARY KEY,
  citizen_id  TEXT NOT NULL,
  decision    TEXT NOT NULL,
  reasoning   TEXT NOT NULL DEFAULT '',
  inputs      TEXT[] NOT NULL DEFAULT '{}',
  confidence  DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  outcome     TEXT CHECK (outcome IN ('success', 'failure', 'pending')),
  trace_id    TEXT,
  tick        INTEGER NOT NULL DEFAULT 0,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_citizen ON decision_records(citizen_id);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON decision_records(outcome);
CREATE INDEX IF NOT EXISTS idx_decisions_trace   ON decision_records(trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_decisions_ts      ON decision_records(timestamp DESC);

-- ─── 3. Cost Buckets ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_buckets (
  citizen_id       TEXT PRIMARY KEY,
  total_tokens     BIGINT NOT NULL DEFAULT 0,
  total_credits    DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_compute_ms BIGINT NOT NULL DEFAULT 0,
  token_history    INTEGER[] NOT NULL DEFAULT '{}',
  credit_history   DOUBLE PRECISION[] NOT NULL DEFAULT '{}',
  avg_tokens_per_tick DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Behavior Anomalies ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS behavior_anomalies (
  id            TEXT PRIMARY KEY,
  citizen_id    TEXT NOT NULL,
  type          TEXT NOT NULL
                  CHECK (type IN ('token_spike', 'unusual_operation', 'high_error_rate', 'cost_spike', 'frequency_anomaly')),
  severity      TEXT NOT NULL DEFAULT 'low'
                  CHECK (severity IN ('low', 'medium', 'high')),
  description   TEXT NOT NULL DEFAULT '',
  observed_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  expected_value DOUBLE PRECISION NOT NULL DEFAULT 0,
  z_score       DOUBLE PRECISION NOT NULL DEFAULT 0,
  tick          INTEGER NOT NULL DEFAULT 0,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomalies_citizen  ON behavior_anomalies(citizen_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_type     ON behavior_anomalies(type);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity ON behavior_anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_ts       ON behavior_anomalies(timestamp DESC);

-- ─── Row-Level Security ─────────────────────────────────────────

ALTER TABLE trace_spans ENABLE ROW LEVEL SECURITY;
ALTER TABLE decision_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavior_anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on trace_spans"
  ON trace_spans FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on decision_records"
  ON decision_records FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on cost_buckets"
  ON cost_buckets FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on behavior_anomalies"
  ON behavior_anomalies FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Analytics Views ────────────────────────────────────────────

-- Materialized view for quick cost summaries
CREATE OR REPLACE VIEW citizen_cost_summary AS
SELECT
  citizen_id,
  total_tokens,
  total_credits,
  total_compute_ms,
  avg_tokens_per_tick,
  updated_at
FROM cost_buckets
ORDER BY total_credits DESC;

-- Recent anomalies dashboard view
CREATE OR REPLACE VIEW recent_anomalies AS
SELECT
  a.id,
  a.citizen_id,
  a.type,
  a.severity,
  a.description,
  a.z_score,
  a.timestamp
FROM behavior_anomalies a
WHERE a.timestamp > NOW() - INTERVAL '24 hours'
ORDER BY a.severity DESC, a.timestamp DESC;
