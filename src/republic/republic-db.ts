/**
 * Republic Platform — Persistence Layer
 *
 * Dual-mode database: in-memory maps for instant access + optional
 * Supabase cloud persistence (fire-and-forget writes).
 *
 * When Supabase is configured (via gateway.supabase.* or env vars),
 * every mutation is written through to the cloud. Reads remain
 * in-memory for speed. If Supabase is not configured, the system
 * operates purely in-memory as before.
 */

import { getSupabaseClient } from "../infra/supabase-client.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic-db");

// ─── Table Schemas ──────────────────────────────────────────────

export interface ProjectRecord {
  id: string;
  name: string;
  status: "planning" | "active" | "review" | "delivered" | "archived";
  objective: string;
  projectType: string;
  source: string;
  userId: string;
  pmCitizenId: string | null;
  fileCount: number;
  totalSizeBytes: number;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
}

export interface TaskRecord {
  id: string;
  projectId: string;
  citizenId: string | null;
  title: string;
  type: string;
  status: "pending" | "active" | "completed" | "failed" | "blocked";
  modelUsed: string | null;
  modelTier: string | null;
  /** Estimated cost for this task's inference */
  estimatedCost: number;
  durationMs: number;
  qualityScore: number;
  createdAt: string;
  completedAt: string | null;
}

export interface ModelDecisionRecord {
  id: string;
  taskType: string;
  toolName: string;
  modelId: string;
  modelTier: string;
  qualityScore: number;
  latencyMs: number;
  estimatedCost: number;
  citizenSpecialization: string;
  citizenSkillLevel: number;
  wasCouncilVote: boolean;
  timestamp: string;
}

export interface CitizenSkillRecord {
  id: string;
  citizenId: string;
  skill: string;
  proficiency: number; // 0.0-1.0
  source: "education" | "project" | "collaboration" | "self-study";
  learnedAt: string;
  lastUsedAt: string;
  useCount: number;
}

export interface EducationRecord {
  id: string;
  citizenId: string;
  courseId: string;
  courseName: string;
  graduated: boolean;
  knowledgeGain: number;
  enrolledAt: string;
  graduatedAt: string | null;
}

export interface CognitiveEventRecord {
  id: string;
  citizenId: string;
  curiosityScore: number;
  reflectionSummary: string;
  explorationSuggestions: Array<{ domain: string; skill: string; action: string }>;
  newLessons: number;
  memoriesConsolidated: number;
  breakdown: {
    unexploredDomainRatio: number;
    knowledgeGaps: number;
    recentFailures: number;
    daysSinceDiscovery: number;
    intelligenceBoost: number;
  };
  timestamp: number;
}

// ─── In-Memory Tables ───────────────────────────────────────────

const projects: Map<string, ProjectRecord> = new Map();
const tasks: Map<string, TaskRecord> = new Map();
const modelDecisions: ModelDecisionRecord[] = [];
const citizenSkills: Map<string, CitizenSkillRecord[]> = new Map();
const educationHistory: EducationRecord[] = [];
const cognitiveEvents: Map<string, CognitiveEventRecord[]> = new Map();

const MAX_MODEL_DECISIONS = 1000;
const MAX_EDUCATION_HISTORY = 500;
const MAX_COGNITIVE_EVENTS_PER_CITIZEN = 50;

// ─── Supabase Helpers ───────────────────────────────────────────

/**
 * camelCase → snake_case converter for column mapping.
 */
function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Convert a record's keys from camelCase to snake_case for Supabase.
 */
function toSnakeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    out[toSnake(k)] = v;
  }
  return out;
}

/**
 * Fire-and-forget Supabase write. Logs errors but never throws.
 */
function sbWrite(
  table: string,
  op: "upsert" | "insert" | "update" | "delete",
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  match?: any,
): void {
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = getSupabaseClient() as any;
  if (!sb) {
    return;
  }

  const run = async () => {
    try {
      let query;
      switch (op) {
        case "upsert": {
          const rows = Array.isArray(data)
            ? data.map((r) => toSnakeRecord(r))
            : [toSnakeRecord(data)];
          query = sb.from(table).upsert(rows, { onConflict: "id" });
          break;
        }
        case "insert":
          query = sb.from(table).insert(toSnakeRecord(data as Record<string, unknown>));
          break;
        case "update": {
          if (!match) {
            return;
          }
          let q = sb.from(table).update(toSnakeRecord(data as Record<string, unknown>));
          for (const [k, v] of Object.entries((match || {}) as Record<string, unknown>)) {
            // oxlint-disable-next-line @typescript-eslint/no-explicit-any
            q = q.eq(toSnake(k), v as any);
          }
          query = q;
          break;
        }
        case "delete": {
          if (match) {
            let q = sb.from(table).delete();
            for (const [k, v] of Object.entries((match || {}) as Record<string, unknown>)) {
              // oxlint-disable-next-line @typescript-eslint/no-explicit-any
              q = q.eq(toSnake(k), v as any);
            }
            query = q;
          } else {
            // Delete all — use a truthy filter
            query = sb.from(table).delete().gte("id", "");
          }
          break;
        }
      }
      if (query) {
        const { error } = await query;
        if (error) {
          logger.warn(`Supabase ${op} on ${table} failed: ${error.message}`);
        }
      }
    } catch (err) {
      logger.warn(
        `Supabase ${op} on ${table} error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  void run();
}

// ─── Project CRUD ───────────────────────────────────────────────

export function insertProject(record: Omit<ProjectRecord, "id">): ProjectRecord {
  const id = `prj-${uid()}`;
  const full: ProjectRecord = { id, ...record };
  projects.set(id, full);
  sbWrite("republic_projects", "upsert", full as unknown as Record<string, unknown>);
  return full;
}

export function getProject(id: string): ProjectRecord | undefined {
  return projects.get(id);
}

export function updateProject(id: string, updates: Partial<ProjectRecord>): void {
  const existing = projects.get(id);
  if (existing) {
    Object.assign(existing, updates, { updatedAt: ts() });
    sbWrite(
      "republic_projects",
      "update",
      { ...updates, updatedAt: existing.updatedAt } as Record<string, unknown>,
      { id },
    );
  }
}

export function listProjects(status?: string): ProjectRecord[] {
  const all = [...projects.values()];
  if (status) {
    return all.filter((p) => p.status === status);
  }
  return all;
}

export function deleteProject(id: string): boolean {
  const deleted = projects.delete(id);
  if (deleted) {
    sbWrite("republic_projects", "delete", {}, { id });
  }
  return deleted;
}

// ─── Task CRUD ──────────────────────────────────────────────────

export function insertTask(record: Omit<TaskRecord, "id">): TaskRecord {
  const id = `task-${uid()}`;
  const full: TaskRecord = { id, ...record };
  tasks.set(id, full);
  sbWrite("republic_tasks", "upsert", full as unknown as Record<string, unknown>);
  return full;
}

export function getTask(id: string): TaskRecord | undefined {
  return tasks.get(id);
}

export function updateTask(id: string, updates: Partial<TaskRecord>): void {
  const existing = tasks.get(id);
  if (existing) {
    Object.assign(existing, updates);
    sbWrite("republic_tasks", "update", updates as Record<string, unknown>, { id });
  }
}

export function listTasks(projectId?: string): TaskRecord[] {
  const all = [...tasks.values()];
  if (projectId) {
    return all.filter((t) => t.projectId === projectId);
  }
  return all;
}

export function getTasksByStatus(status: TaskRecord["status"]): TaskRecord[] {
  return [...tasks.values()].filter((t) => t.status === status);
}

// ─── Model Decision Tracking ────────────────────────────────────

export function recordModelDecision(record: Omit<ModelDecisionRecord, "id">): ModelDecisionRecord {
  const id = `md-${uid()}`;
  const full: ModelDecisionRecord = { id, ...record };
  modelDecisions.push(full);
  if (modelDecisions.length > MAX_MODEL_DECISIONS) {
    modelDecisions.splice(0, modelDecisions.length - MAX_MODEL_DECISIONS);
  }
  sbWrite("republic_model_decisions", "insert", full as unknown as Record<string, unknown>);
  return full;
}

/**
 * Query model decisions for learning which models perform best.
 */
export function queryModelPerformance(params: {
  toolName?: string;
  modelTier?: string;
  limit?: number;
}): {
  averageQuality: number;
  averageLatency: number;
  averageCost: number;
  count: number;
  bestModel: string | null;
} {
  let filtered = modelDecisions;
  if (params.toolName) {
    filtered = filtered.filter((d) => d.toolName === params.toolName);
  }
  if (params.modelTier) {
    filtered = filtered.filter((d) => d.modelTier === params.modelTier);
  }

  const limited = filtered.slice(-(params.limit ?? 50));

  if (limited.length === 0) {
    return { averageQuality: 0, averageLatency: 0, averageCost: 0, count: 0, bestModel: null };
  }

  const totalQuality = limited.reduce((sum, d) => sum + d.qualityScore, 0);
  const totalLatency = limited.reduce((sum, d) => sum + d.latencyMs, 0);
  const totalCost = limited.reduce((sum, d) => sum + d.estimatedCost, 0);
  const count = limited.length;

  // Find best performing model
  const modelScores = new Map<string, { total: number; count: number }>();
  for (const d of limited) {
    const existing = modelScores.get(d.modelId) ?? { total: 0, count: 0 };
    existing.total += d.qualityScore;
    existing.count++;
    modelScores.set(d.modelId, existing);
  }

  let bestModel: string | null = null;
  let bestAvg = 0;
  for (const [modelId, scores] of modelScores) {
    const avg = scores.total / scores.count;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestModel = modelId;
    }
  }

  return {
    averageQuality: totalQuality / count,
    averageLatency: totalLatency / count,
    averageCost: totalCost / count,
    count,
    bestModel,
  };
}

// ─── Citizen Skills ─────────────────────────────────────────────

export function addCitizenSkill(record: Omit<CitizenSkillRecord, "id">): CitizenSkillRecord {
  const id = `skill-${uid()}`;
  const full: CitizenSkillRecord = { id, ...record };

  const existing = citizenSkills.get(record.citizenId) ?? [];
  // Check if already has this skill — if so, increase proficiency
  const existingSkill = existing.find((s) => s.skill === record.skill);
  if (existingSkill) {
    existingSkill.proficiency = Math.min(1.0, existingSkill.proficiency + record.proficiency * 0.1);
    existingSkill.lastUsedAt = ts();
    existingSkill.useCount++;
    sbWrite(
      "republic_citizen_skills",
      "upsert",
      existingSkill as unknown as Record<string, unknown>,
    );
    return existingSkill;
  }

  existing.push(full);
  citizenSkills.set(record.citizenId, existing);
  sbWrite("republic_citizen_skills", "upsert", full as unknown as Record<string, unknown>);
  return full;
}

export function getCitizenSkills(citizenId: string): CitizenSkillRecord[] {
  return citizenSkills.get(citizenId) ?? [];
}

/**
 * Decay skills not used recently (called periodically).
 */
export function decaySkills(decayRate = 0.01): number {
  let decayed = 0;
  for (const [, skills] of citizenSkills) {
    for (const skill of skills) {
      if (skill.proficiency > 0.1) {
        skill.proficiency = Math.max(0.1, skill.proficiency - decayRate);
        decayed++;
      }
    }
  }
  // Batch update to Supabase would be too noisy for decay — skip
  return decayed;
}

// ─── Education History ──────────────────────────────────────────

export function recordEducation(record: Omit<EducationRecord, "id">): EducationRecord {
  const id = `edu-${uid()}`;
  const full: EducationRecord = { id, ...record };
  educationHistory.push(full);
  if (educationHistory.length > MAX_EDUCATION_HISTORY) {
    educationHistory.splice(0, educationHistory.length - MAX_EDUCATION_HISTORY);
  }
  sbWrite("republic_education", "insert", full as unknown as Record<string, unknown>);
  return full;
}

export function getCitizenEducation(citizenId: string): EducationRecord[] {
  return educationHistory.filter((e) => e.citizenId === citizenId);
}

// ─── Full Database Export/Import ────────────────────────────────

export interface RepublicDBSnapshot {
  version: 1;
  projects: ProjectRecord[];
  tasks: TaskRecord[];
  modelDecisions: ModelDecisionRecord[];
  citizenSkills: Record<string, CitizenSkillRecord[]>;
  educationHistory: EducationRecord[];
  exportedAt: string;
}

export function exportDB(): RepublicDBSnapshot {
  return {
    version: 1,
    projects: [...projects.values()],
    tasks: [...tasks.values()],
    modelDecisions: [...modelDecisions],
    citizenSkills: Object.fromEntries(citizenSkills.entries()),
    educationHistory: [...educationHistory],
    exportedAt: ts(),
  };
}

export function importDB(snapshot: RepublicDBSnapshot): void {
  projects.clear();
  tasks.clear();
  modelDecisions.length = 0;
  citizenSkills.clear();
  educationHistory.length = 0;

  for (const p of snapshot.projects) {
    projects.set(p.id, p);
  }
  for (const t of snapshot.tasks) {
    tasks.set(t.id, t);
  }
  modelDecisions.push(...snapshot.modelDecisions);
  for (const [cid, skills] of Object.entries(snapshot.citizenSkills)) {
    citizenSkills.set(cid, skills);
  }
  educationHistory.push(...snapshot.educationHistory);

  // Sync to Supabase if connected
  if (getSupabaseClient()) {
    if (snapshot.projects.length > 0) {
      sbWrite(
        "republic_projects",
        "upsert",
        snapshot.projects as unknown as Record<string, unknown>[],
      );
    }
    if (snapshot.tasks.length > 0) {
      sbWrite("republic_tasks", "upsert", snapshot.tasks as unknown as Record<string, unknown>[]);
    }
    if (snapshot.modelDecisions.length > 0) {
      // Batch in chunks of 100
      for (let i = 0; i < snapshot.modelDecisions.length; i += 100) {
        const chunk = snapshot.modelDecisions.slice(i, i + 100);
        sbWrite(
          "republic_model_decisions",
          "upsert",
          chunk as unknown as Record<string, unknown>[],
        );
      }
    }
    const allSkills = Object.values(snapshot.citizenSkills).flat();
    if (allSkills.length > 0) {
      sbWrite(
        "republic_citizen_skills",
        "upsert",
        allSkills as unknown as Record<string, unknown>[],
      );
    }
    if (snapshot.educationHistory.length > 0) {
      sbWrite(
        "republic_education",
        "upsert",
        snapshot.educationHistory as unknown as Record<string, unknown>[],
      );
    }
  }
}

/**
 * Clear all data (for testing).
 */
export function clearDB(): void {
  projects.clear();
  tasks.clear();
  modelDecisions.length = 0;
  citizenSkills.clear();
  educationHistory.length = 0;

  // Clear Supabase tables too
  sbWrite("republic_education", "delete", {});
  sbWrite("republic_citizen_skills", "delete", {});
  sbWrite("republic_model_decisions", "delete", {});
  sbWrite("republic_tasks", "delete", {});
  sbWrite("republic_projects", "delete", {});
}

// ─── Cognitive Events ────────────────────────────────────────────

/**
 * Record a cognitive cycle result for a citizen.
 * Ring buffer — keeps the last MAX_COGNITIVE_EVENTS_PER_CITIZEN events per citizen.
 */
export function recordCognitiveEvent(citizenId: string, event: CognitiveEventRecord): void {
  const existing = cognitiveEvents.get(citizenId) ?? [];
  existing.unshift(event); // newest first
  if (existing.length > MAX_COGNITIVE_EVENTS_PER_CITIZEN) {
    existing.length = MAX_COGNITIVE_EVENTS_PER_CITIZEN;
  }
  cognitiveEvents.set(citizenId, existing);
}

/**
 * Get the cognitive event history for a citizen.
 */
export function getCognitiveHistory(citizenId: string, limit = 20): CognitiveEventRecord[] {
  return (cognitiveEvents.get(citizenId) ?? []).slice(0, limit);
}

/**
 * Get the latest curiosity score for a citizen (0 if no events recorded).
 */
export function getLatestCuriosityScore(citizenId: string): number {
  const events = cognitiveEvents.get(citizenId);
  return events?.[0]?.curiosityScore ?? 0;
}

/**
 * Aggregate stats across all citizens' cognitive histories.
 */
export function getCognitiveAggregates(): {
  totalCycles: number;
  averageCuriosityScore: number;
  totalLessonsDistilled: number;
  eliteCitizenCount: number;
} {
  let totalCycles = 0;
  let totalScore = 0;
  let totalLessons = 0;
  let eliteCount = 0;

  for (const events of cognitiveEvents.values()) {
    totalCycles += events.length;
    if (events.length > 0) {
      totalScore += events[0].curiosityScore;
      totalLessons += events.reduce((sum, e) => sum + e.newLessons, 0);
      if (events[0].curiosityScore > 0.7) {
        eliteCount++;
      }
    }
  }

  const citizenCount = cognitiveEvents.size;
  return {
    totalCycles,
    averageCuriosityScore: citizenCount > 0 ? totalScore / citizenCount : 0,
    totalLessonsDistilled: totalLessons,
    eliteCitizenCount: eliteCount,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface DBDiagnostics {
  projectCount: number;
  taskCount: number;
  modelDecisionCount: number;
  citizenSkillCount: number;
  educationRecordCount: number;
  cognitiveEventCount: number;
  /** Total estimated cost of all model decisions */
  totalInferenceCost: number;
}

export function getDBDiagnostics(): DBDiagnostics {
  const totalCost = modelDecisions.reduce((sum, d) => sum + d.estimatedCost, 0);
  const cognitiveEventCount = [...cognitiveEvents.values()].reduce((sum, e) => sum + e.length, 0);

  return {
    projectCount: projects.size,
    taskCount: tasks.size,
    modelDecisionCount: modelDecisions.length,
    citizenSkillCount: [...citizenSkills.values()].reduce((sum, s) => sum + s.length, 0),
    educationRecordCount: educationHistory.length,
    cognitiveEventCount,
    totalInferenceCost: totalCost,
  };
}
