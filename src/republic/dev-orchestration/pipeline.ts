/**
 * Dev Orchestration — Workflow Pipeline Engine
 */

import { ts, uid } from "../utils.js";

// ─── Project Workflow Engine ────────────────────────────────────

export type WorkflowStage =
  | "plan"
  | "scaffold"
  | "develop"
  | "test"
  | "review"
  | "fix"
  | "deploy"
  | "monitor"
  | "evolve";

export interface WorkflowPipeline {
  id: string;
  projectId: string;
  stages: WorkflowStageStatus[];
  currentStage: WorkflowStage;
  startedAt: string;
  completedAt: string | null;
  autoFix: boolean;
  /** How many pipeline-ticks the current stage has been active */
  stageTicksElapsed: number;
}

export interface WorkflowStageStatus {
  stage: WorkflowStage;
  status: "pending" | "in-progress" | "passed" | "failed" | "skipped";
  startedAt: string | null;
  completedAt: string | null;
  output: string | null;
}

/** Create a new workflow pipeline for a project */
export function createPipeline(projectId: string, autoFix = true): WorkflowPipeline {
  const stages: WorkflowStage[] = [
    "plan",
    "scaffold",
    "develop",
    "test",
    "review",
    "fix",
    "deploy",
    "monitor",
    "evolve",
  ];
  return {
    id: uid(),
    projectId,
    stages: stages.map((stage) => ({
      stage,
      status: "pending" as const,
      startedAt: null,
      completedAt: null,
      output: null,
    })),
    currentStage: "plan",
    startedAt: ts(),
    completedAt: null,
    autoFix,
    stageTicksElapsed: 0,
  };
}

/** Minimum ticks each pipeline stage must run before advancing */
const STAGE_DURATIONS: Record<WorkflowStage, number> = {
  plan: 20,
  scaffold: 15,
  develop: 60,
  test: 30,
  review: 20,
  fix: 15,
  deploy: 10,
  monitor: 10,
  evolve: 999_999, // effectively infinite — projects stay in evolve
};

/** Advance the pipeline to the next stage (only if min duration elapsed) */
export function advancePipeline(pipeline: WorkflowPipeline): WorkflowStage | null {
  const stages: WorkflowStage[] = [
    "plan",
    "scaffold",
    "develop",
    "test",
    "review",
    "fix",
    "deploy",
    "monitor",
    "evolve",
  ];

  // Check minimum duration
  const minDuration = STAGE_DURATIONS[pipeline.currentStage] ?? 10;
  if (pipeline.stageTicksElapsed < minDuration) {
    pipeline.stageTicksElapsed++;
    return null; // not ready to advance
  }

  const idx = stages.indexOf(pipeline.currentStage);
  const currentStatus = pipeline.stages[idx];
  if (currentStatus) {
    currentStatus.status = "passed";
    currentStatus.completedAt = ts();
  }
  if (idx + 1 < stages.length) {
    const nextStage = stages[idx + 1];
    pipeline.currentStage = nextStage;
    pipeline.stageTicksElapsed = 0; // reset for new stage
    const nextStatus = pipeline.stages[idx + 1];
    if (nextStatus) {
      nextStatus.status = "in-progress";
      nextStatus.startedAt = ts();
    }
    return nextStage;
  }
  pipeline.completedAt = ts();
  return null;
}
