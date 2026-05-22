/**
 * Republic Platform — Workflow Orchestrator
 *
 * Decomposes high-level user requests into coordinated multi-citizen
 * workflows with ordered phases. Each phase contains one or more
 * processes assigned to the best-suited citizens. Phases can declare
 * dependencies on other phases, enabling sequential and parallel
 * execution patterns.
 *
 * Example workflow: "Build a full-stack product" →
 *   Phase 1 (Development): 3 processes → Developer, Architect, Engineer
 *   Phase 2 (Testing): 2 processes → Developer, Analyst
 *   Phase 3 (Screenshots): 1 process → Artist
 *   Phase 4 (Documentation): 1 process → Writer
 *   Phase 5 (Marketing): 2 processes → Strategist, Artist
 *   Phase 6 (Deployment): 1 process → Engineer
 */

import { cancelProcess, createProcess, pauseProcess, startProcess } from "./process-manager.js";
import { getReputationProfile, isTrusted } from "./trust-reputation.js";
import type {
    ManagedProcess,
    RepublicState,
    Specialization,
    Workflow,
    WorkflowPhase,
    WorkflowStatus
} from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_WORKFLOWS = 100;
const _MAX_PHASES_PER_WORKFLOW = 20;

// ─── Workflow Templates ─────────────────────────────────────────
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./workflow-templates.js";

// ─── Workflow CRUD ───────────────────────────────────────────────

/**
 * Create a new workflow.
 */
export function createWorkflow(s: RepublicState, title: string, description: string): Workflow {
  if (!s.workflows) {
    s.workflows = [];
  }

  if (s.workflows.length >= MAX_WORKFLOWS) {
    throw new Error(`Workflow limit reached (${MAX_WORKFLOWS})`);
  }

  const workflow: Workflow = {
    id: uid(),
    title,
    description,
    status: "draft",
    phases: [],
    assignedCitizens: [],
    createdAt: ts(),
    userDirectives: [],
  };

  s.workflows.push(workflow);

  s.events.push({
    citizenId: "system",
    citizenName: "System",
    type: "WorkflowCreated",
    description: `Workflow created: ${title}`,
    timestamp: ts(),
  });

  return workflow;
}

/**
 * Decompose a workflow into phases using templates or heuristics.
 * Analyzes the workflow title/description to pick the best template.
 */
export function decomposeWorkflow(s: RepublicState, workflowId: string): WorkflowPhase[] {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  // Match description to template
  const template = matchTemplate(workflow.title, workflow.description);

  if (workflow.phases.length > 0) {
    // Already decomposed — return existing
    return workflow.phases;
  }

  const phases: WorkflowPhase[] = [];
  const phaseIdMap = new Map<number, string>();

  for (let i = 0; i < template.phases.length; i++) {
    const tp = template.phases[i];
    const phaseId = uid();
    phaseIdMap.set(i, phaseId);

    phases.push({
      id: phaseId,
      name: tp.name,
      order: i,
      processIds: [],
      status: "queued",
      dependsOnPhases: tp.dependsOnPhaseIndices
        .map((idx) => phaseIdMap.get(idx) ?? "")
        .filter(Boolean),
    });
  }

  workflow.phases = phases;
  return phases;
}

/**
 * Assign the best-suited citizens to each phase of a workflow.
 * Creates processes for each phase.
 */
export function assignCitizensToWorkflow(s: RepublicState, workflowId: string): string[] {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow) {
    throw new Error(`Workflow ${workflowId} not found`);
  }

  const template = matchTemplate(workflow.title, workflow.description);
  const assignedCitizens: string[] = [];
  const usedCitizens = new Set<string>();

  for (let i = 0; i < workflow.phases.length; i++) {
    const phase = workflow.phases[i];
    const phaseTemplate = template.phases[i];
    if (!phaseTemplate) {
      continue;
    }

    // Pick the best citizen for this phase
    const citizen = pickBestCitizen(s, phaseTemplate.preferredSpecializations, usedCitizens);

    if (citizen) {
      usedCitizens.add(citizen.id);
      assignedCitizens.push(citizen.id);

      // Create a process for this phase
      const process = createProcess(
        s,
        citizen.id,
        `${workflow.title} — ${phase.name}`,
        `Phase ${phase.order + 1} of workflow "${workflow.title}"`,
        phaseTemplate.steps,
        "normal",
      );

      // Link dependencies
      const depPhaseIds = phase.dependsOnPhases;
      for (const depPhaseId of depPhaseIds) {
        const depPhase = workflow.phases.find((p) => p.id === depPhaseId);
        if (depPhase) {
          for (const depProcessId of depPhase.processIds) {
            process.dependencies.push(depProcessId);
          }
        }
      }

      phase.processIds.push(process.id);
    }
  }

  workflow.assignedCitizens = [...new Set(assignedCitizens)];
  return workflow.assignedCitizens;
}

/**
 * Start a workflow — begins the first phase(s) with no dependencies.
 */
export function startWorkflow(s: RepublicState, workflowId: string): boolean {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow || workflow.status !== "draft") {
    return false;
  }

  workflow.status = "running";

  // Start phases with no dependencies
  for (const phase of workflow.phases) {
    if (phase.dependsOnPhases.length === 0) {
      phase.status = "running";
      for (const processId of phase.processIds) {
        startProcess(s, processId);
      }
    }
  }

  return true;
}

/**
 * Pause all active processes in a workflow.
 */
export function pauseWorkflow(s: RepublicState, workflowId: string): boolean {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow || workflow.status !== "running") {
    return false;
  }

  workflow.status = "paused";

  for (const phase of workflow.phases) {
    if (phase.status === "running") {
      phase.status = "paused";
      for (const processId of phase.processIds) {
        pauseProcess(s, processId);
      }
    }
  }

  return true;
}

/**
 * Resume a paused workflow.
 */
export function resumeWorkflow(s: RepublicState, workflowId: string): boolean {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow || workflow.status !== "paused") {
    return false;
  }

  workflow.status = "running";

  // Resume phases that were paused
  for (const phase of workflow.phases) {
    if (phase.status === "paused") {
      phase.status = "running";
      // Processes will be resumed by processManagerTick checking deps
    }
  }

  return true;
}

/**
 * Cancel a workflow and all its processes.
 */
export function cancelWorkflow(s: RepublicState, workflowId: string): boolean {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow || workflow.status === "completed" || workflow.status === "cancelled") {
    return false;
  }

  workflow.status = "cancelled";

  for (const phase of workflow.phases) {
    if (phase.status !== "completed") {
      phase.status = "cancelled";
      for (const processId of phase.processIds) {
        cancelProcess(s, processId);
      }
    }
  }

  return true;
}

/**
 * Apply a user directive to a workflow.
 * Stores for context — citizens processing this workflow
 * will see the directive in their prompts.
 */
export function applyUserDirective(
  s: RepublicState,
  workflowId: string,
  directive: string,
): boolean {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow) {
    return false;
  }

  workflow.userDirectives.push(`[${ts()}] ${directive}`);

  s.events.push({
    citizenId: "system",
    citizenName: "System",
    type: "UserIntervention",
    description: `Directive on "${workflow.title}": ${directive.slice(0, 100)}`,
    timestamp: ts(),
  });

  return true;
}

// ─── Queries ────────────────────────────────────────────────────

/**
 * Get all workflows, optionally filtered by status.
 */
export function getWorkflows(s: RepublicState, statusFilter?: WorkflowStatus): Workflow[] {
  const all = s.workflows ?? [];
  if (!statusFilter) {
    return [...all];
  }
  return all.filter((w) => w.status === statusFilter);
}

/**
 * Get a workflow by ID.
 */
export function getWorkflowById(s: RepublicState, workflowId: string): Workflow | undefined {
  return findWorkflow(s, workflowId);
}

/**
 * Get detailed workflow status including all phase and process states.
 */
export function getWorkflowStatus(
  s: RepublicState,
  workflowId: string,
): {
  workflow: Workflow;
  phaseDetails: Array<{
    phase: WorkflowPhase;
    processes: ManagedProcess[];
    progress: number;
  }>;
  overallProgress: number;
} | null {
  const workflow = findWorkflow(s, workflowId);
  if (!workflow) {
    return null;
  }

  const phaseDetails = workflow.phases.map((phase) => {
    const processes = phase.processIds
      .map((pid) => (s.processes ?? []).find((p) => p.id === pid))
      .filter((p): p is ManagedProcess => p !== undefined);

    const progress =
      processes.length > 0
        ? Math.round(processes.reduce((sum, p) => sum + p.progress, 0) / processes.length)
        : 0;

    return { phase, processes, progress };
  });

  const overallProgress =
    phaseDetails.length > 0
      ? Math.round(phaseDetails.reduce((sum, pd) => sum + pd.progress, 0) / phaseDetails.length)
      : 0;

  return { workflow, phaseDetails, overallProgress };
}

// ─── Orchestrator Tick ──────────────────────────────────────────

/**
 * Orchestrator tick — called from the simulation loop.
 * Advances workflows by starting next phases when dependency
 * phases complete.
 */
export function orchestratorTick(s: RepublicState): void {
  if (!s.workflows) {
    return;
  }

  for (const workflow of s.workflows) {
    if (workflow.status !== "running") {
      continue;
    }

    let allPhasesComplete = true;
    let anyPhaseFailed = false;

    for (const phase of workflow.phases) {
      if (phase.status === "completed") {
        continue;
      }

      if (phase.status === "failed") {
        anyPhaseFailed = true;
        continue;
      }

      allPhasesComplete = false;

      if (phase.status === "queued") {
        // Check if all dependency phases are completed
        const depsOk = phase.dependsOnPhases.every((depId) => {
          const depPhase = workflow.phases.find((p) => p.id === depId);
          return depPhase?.status === "completed";
        });

        if (depsOk) {
          phase.status = "running";
          for (const processId of phase.processIds) {
            startProcess(s, processId);
          }
        }
      }

      if (phase.status === "running") {
        // Check if all processes in this phase are done
        const processes = phase.processIds
          .map((pid) => (s.processes ?? []).find((p) => p.id === pid))
          .filter((p): p is ManagedProcess => p !== undefined);

        const allDone = processes.every(
          (p) => p.status === "completed" || p.status === "cancelled" || p.status === "failed",
        );

        if (allDone) {
          const anyFailed = processes.some((p) => p.status === "failed");
          phase.status = anyFailed ? "failed" : "completed";
          if (anyFailed) {
            anyPhaseFailed = true;
          }
        }
      }
    }

    // Check workflow completion
    if (allPhasesComplete && !anyPhaseFailed) {
      workflow.status = "completed";
      workflow.completedAt = ts();
    } else if (anyPhaseFailed && allPhasesComplete) {
      workflow.status = "failed";
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface OrchestratorDiagnostics {
  totalWorkflows: number;
  byStatus: Record<string, number>;
  totalPhases: number;
  completedPhases: number;
  assignedCitizens: number;
}

export function getOrchestratorDiagnostics(s: RepublicState): OrchestratorDiagnostics {
  const all = s.workflows ?? [];
  const byStatus: Record<string, number> = {};
  let totalPhases = 0;
  let completedPhases = 0;
  const citizenSet = new Set<string>();

  for (const w of all) {
    byStatus[w.status] = (byStatus[w.status] ?? 0) + 1;
    totalPhases += w.phases.length;
    completedPhases += w.phases.filter((p) => p.status === "completed").length;
    for (const cid of w.assignedCitizens) {
      citizenSet.add(cid);
    }
  }

  return {
    totalWorkflows: all.length,
    byStatus,
    totalPhases,
    completedPhases,
    assignedCitizens: citizenSet.size,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function findWorkflow(s: RepublicState, workflowId: string): Workflow | undefined {
  return (s.workflows ?? []).find((w) => w.id === workflowId);
}

/**
 * Match a workflow title/description to the best template.
 */
function matchTemplate(title: string, description: string): WorkflowTemplate {
  const text = `${title} ${description}`.toLowerCase();

  if (
    text.includes("full-stack") ||
    text.includes("product") ||
    text.includes("application") ||
    text.includes("build")
  ) {
    return WORKFLOW_TEMPLATES["full-stack-product"];
  }
  if (text.includes("document") || text.includes("manual") || text.includes("guide")) {
    return WORKFLOW_TEMPLATES["documentation"];
  }
  if (text.includes("market") || text.includes("campaign") || text.includes("promot")) {
    return WORKFLOW_TEMPLATES["marketing-campaign"];
  }

  // Default to full-stack-product as the most comprehensive
  return WORKFLOW_TEMPLATES["full-stack-product"];
}

/**
 * Pick the best available citizen for a set of preferred specializations.
 */
function pickBestCitizen(
  s: RepublicState,
  preferredSpecs: Specialization[],
  exclude: Set<string>,
): { id: string; name: string; specialization: Specialization } | null {
  // First, try to find a citizen with a matching specialization, preferring trusted ones
  for (const spec of preferredSpecs) {
    const matches = s.citizens.filter(
      (c) =>
        c.specialization === spec &&
        !exclude.has(c.id) &&
        c.energy >= 20 &&
        c.activity !== "Sleeping",
    );
    // Sort by trust composite (higher = better)
    const sorted = matches.toSorted((a, b) => {
      const repA = getReputationProfile(a.id).composite;
      const repB = getReputationProfile(b.id).composite;
      return repB - repA;
    });
    if (sorted.length > 0) {
      const match = sorted[0];
      return { id: match.id, name: match.name, specialization: match.specialization };
    }
  }

  // Fallback: pick any available citizen, prefer trusted
  const available = s.citizens
    .filter((c) => !exclude.has(c.id) && c.energy >= 20 && c.activity !== "Sleeping")
    .toSorted((a, b) => {
      // Trusted citizens first, then by energy
      const aTrusted = isTrusted(a.id) ? 1 : 0;
      const bTrusted = isTrusted(b.id) ? 1 : 0;
      if (aTrusted !== bTrusted) {return bTrusted - aTrusted;}
      return b.energy - a.energy;
    });
  if (available.length > 0) {
    const fallback = available[0];
    return { id: fallback.id, name: fallback.name, specialization: fallback.specialization };
  }

  return null;
}
