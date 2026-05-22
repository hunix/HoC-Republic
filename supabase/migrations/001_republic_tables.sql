-- ============================================================
-- HoC — Supabase Migration 001: Republic Tables
-- ============================================================
-- Phase 32A: Core republic persistence tables.
-- Maps 1:1 from republic-db.ts in-memory Map schemas.
--
-- Tables:
--   1. republic_projects   — Project records (planning → delivered)
--   2. republic_tasks      — Tasks within projects
--   3. republic_model_decisions — Model selection audit trail
--   4. republic_citizen_skills  — Citizen skill proficiency
--   5. republic_education       — Education/course history
-- ============================================================

-- ─── Enable extensions ──────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── 1. Projects ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS republic_projects (
  id            TEXT PRIMARY KEY DEFAULT ('prj_' || uuid_generate_v4()::text),
  name          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'planning'
                  CHECK (status IN ('planning', 'active', 'review', 'delivered', 'archived')),
  objective     TEXT NOT NULL DEFAULT '',
  project_type  TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT '',
  user_id       TEXT NOT NULL DEFAULT '',
  pm_citizen_id TEXT,
  file_count    INTEGER NOT NULL DEFAULT 0,
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON republic_projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_user   ON republic_projects(user_id);

-- ─── 2. Tasks ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS republic_tasks (
  id            TEXT PRIMARY KEY DEFAULT ('tsk_' || uuid_generate_v4()::text),
  project_id    TEXT NOT NULL REFERENCES republic_projects(id) ON DELETE CASCADE,
  citizen_id    TEXT,
  title         TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'completed', 'failed', 'blocked')),
  model_used    TEXT,
  model_tier    TEXT,
  estimated_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_ms   INTEGER NOT NULL DEFAULT 0,
  quality_score DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON republic_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON republic_tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_citizen ON republic_tasks(citizen_id);

-- ─── 3. Model Decisions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS republic_model_decisions (
  id                    TEXT PRIMARY KEY DEFAULT ('mdec_' || uuid_generate_v4()::text),
  task_type             TEXT NOT NULL,
  tool_name             TEXT NOT NULL,
  model_id              TEXT NOT NULL,
  model_tier            TEXT NOT NULL,
  quality_score         DOUBLE PRECISION NOT NULL DEFAULT 0,
  latency_ms            INTEGER NOT NULL DEFAULT 0,
  estimated_cost        DOUBLE PRECISION NOT NULL DEFAULT 0,
  citizen_specialization TEXT NOT NULL DEFAULT '',
  citizen_skill_level   DOUBLE PRECISION NOT NULL DEFAULT 0,
  was_council_vote      BOOLEAN NOT NULL DEFAULT FALSE,
  timestamp             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mdec_model    ON republic_model_decisions(model_id);
CREATE INDEX IF NOT EXISTS idx_mdec_tool     ON republic_model_decisions(tool_name);
CREATE INDEX IF NOT EXISTS idx_mdec_tier     ON republic_model_decisions(model_tier);

-- ─── 4. Citizen Skills ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS republic_citizen_skills (
  id           TEXT PRIMARY KEY DEFAULT ('cskl_' || uuid_generate_v4()::text),
  citizen_id   TEXT NOT NULL,
  skill        TEXT NOT NULL,
  proficiency  DOUBLE PRECISION NOT NULL DEFAULT 0
                 CHECK (proficiency >= 0 AND proficiency <= 1),
  source       TEXT NOT NULL DEFAULT 'project'
                 CHECK (source IN ('education', 'project', 'collaboration', 'self-study')),
  learned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  use_count    INTEGER NOT NULL DEFAULT 0,

  UNIQUE (citizen_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_cskills_citizen ON republic_citizen_skills(citizen_id);

-- ─── 5. Education History ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS republic_education (
  id             TEXT PRIMARY KEY DEFAULT ('edu_' || uuid_generate_v4()::text),
  citizen_id     TEXT NOT NULL,
  course_id      TEXT NOT NULL,
  course_name    TEXT NOT NULL,
  graduated      BOOLEAN NOT NULL DEFAULT FALSE,
  knowledge_gain DOUBLE PRECISION NOT NULL DEFAULT 0,
  enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  graduated_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_edu_citizen ON republic_education(citizen_id);

-- ─── Row-Level Security ─────────────────────────────────────────
-- Enable RLS on all tables. Policies will be added in Phase 32D
-- when Supabase Auth is integrated.

ALTER TABLE republic_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE republic_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE republic_model_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE republic_citizen_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE republic_education ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for server-side operations)
CREATE POLICY "Service role full access on republic_projects"
  ON republic_projects FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on republic_tasks"
  ON republic_tasks FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on republic_model_decisions"
  ON republic_model_decisions FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on republic_citizen_skills"
  ON republic_citizen_skills FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on republic_education"
  ON republic_education FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Auto-update timestamp trigger ─────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON republic_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
