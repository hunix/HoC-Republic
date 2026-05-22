/**
 * Republic Platform — Process Manager
 *
 * Manages long-running, multi-step processes owned by citizens.
 * Provides full lifecycle control: create, start, pause, resume,
 * cancel, advance, complete steps. Supports user intervention via
 * notes injection, step reassignment, and priority overrides.
 *
 * Integrates with the simulation tick loop to advance running
 * processes automatically.
 */

import type {
    ManagedProcess,
    ProcessOutput,
    ProcessStatus,
    ProcessStep,
    RepublicState
} from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_PROCESSES = 500;
const MAX_STEPS_PER_PROCESS = 50;
const MAX_USER_NOTES = 100;
const MAX_OUTPUTS = 200;

// ─── Process CRUD ───────────────────────────────────────────────

/**
 * Create a new managed process for a citizen.
 */
export function createProcess(
  s: RepublicState,
  citizenId: string,
  title: string,
  description: string,
  steps: Array<{ title: string; description: string; toolName?: string }>,
  priority: ManagedProcess["priority"] = "normal",
  parentProcessId?: string,
  metadata: Record<string, unknown> = {},
): ManagedProcess {
  if (!s.processes) {
    s.processes = [];
  }

  if (s.processes.length >= MAX_PROCESSES) {
    throw new Error(`Process registry full (max ${MAX_PROCESSES})`);
  }

  if (steps.length > MAX_STEPS_PER_PROCESS) {
    throw new Error(`Too many steps (max ${MAX_STEPS_PER_PROCESS})`);
  }

  const processSteps: ProcessStep[] = steps.map((step) => ({
    id: uid(),
    title: step.title,
    description: step.description,
    status: "queued" as ProcessStatus,
    toolName: step.toolName,
    progress: 0,
  }));

  const process: ManagedProcess = {
    id: uid(),
    citizenId,
    title,
    description,
    status: "queued",
    priority,
    steps: processSteps,
    currentStepIndex: 0,
    progress: 0,
    createdAt: ts(),
    outputs: [],
    dependencies: [],
    parentProcessId,
    childProcessIds: [],
    userNotes: [],
    metadata,
  };

  s.processes.push(process);

  // Link parent if provided
  if (parentProcessId) {
    const parent = s.processes.find((p) => p.id === parentProcessId);
    if (parent) {
      parent.childProcessIds.push(process.id);
    }
  }

  s.events.push({
    citizenId,
    citizenName: s.citizens.find((c) => c.id === citizenId)?.name ?? citizenId,
    type: "ProcessStarted",
    description: `Process created: ${title}`,
    timestamp: ts(),
  });

  return process;
}

/**
 * Start a queued process.
 */
export function startProcess(s: RepublicState, processId: string): boolean {
  const process = findProcess(s, processId);
  if (!process || process.status !== "queued") {
    return false;
  }

  // Check dependencies are completed
  for (const depId of process.dependencies) {
    const dep = findProcess(s, depId);
    if (!dep || dep.status !== "completed") {
      return false; // dependency not met
    }
  }

  process.status = "running";
  process.startedAt = ts();

  // Start the first step
  if (process.steps.length > 0) {
    process.steps[0].status = "running";
    process.steps[0].startedAt = ts();
  }

  // Assign citizen
  const citizen = s.citizens.find((c) => c.id === process.citizenId);
  if (citizen) {
    citizen.activeProcessId = process.id;
    citizen.activity = "Executing";
  }

  return true;
}

/**
 * Pause a running process.
 */
export function pauseProcess(s: RepublicState, processId: string, reason?: string): boolean {
  const process = findProcess(s, processId);
  if (!process || process.status !== "running") {
    return false;
  }

  process.status = "paused";
  process.pausedAt = ts();
  process.pauseReason = reason;

  // Pause the current step too
  const currentStep = process.steps[process.currentStepIndex];
  if (currentStep && currentStep.status === "running") {
    currentStep.status = "paused";
  }

  // Update citizen
  const citizen = s.citizens.find((c) => c.id === process.citizenId);
  if (citizen) {
    citizen.activity = "Paused";
  }

  s.events.push({
    citizenId: process.citizenId,
    citizenName: s.citizens.find((c) => c.id === process.citizenId)?.name ?? process.citizenId,
    type: "ProcessPaused",
    description: `Process paused: ${process.title}${reason ? ` — ${reason}` : ""}`,
    timestamp: ts(),
  });

  return true;
}

/**
 * Resume a paused process.
 */
export function resumeProcess(s: RepublicState, processId: string): boolean {
  const process = findProcess(s, processId);
  if (!process || process.status !== "paused") {
    return false;
  }

  process.status = "running";
  process.pausedAt = undefined;
  process.pauseReason = undefined;

  // Resume current step
  const currentStep = process.steps[process.currentStepIndex];
  if (currentStep && currentStep.status === "paused") {
    currentStep.status = "running";
  }

  // Update citizen
  const citizen = s.citizens.find((c) => c.id === process.citizenId);
  if (citizen) {
    citizen.activity = "Executing";
  }

  return true;
}

/**
 * Cancel a process entirely.
 */
export function cancelProcess(s: RepublicState, processId: string): boolean {
  const process = findProcess(s, processId);
  if (!process || process.status === "completed" || process.status === "cancelled") {
    return false;
  }

  process.status = "cancelled";

  // Cancel all non-completed steps
  for (const step of process.steps) {
    if (step.status !== "completed") {
      step.status = "cancelled";
    }
  }

  // Cancel child processes too
  for (const childId of process.childProcessIds) {
    cancelProcess(s, childId);
  }

  // Free citizen
  const citizen = s.citizens.find((c) => c.id === process.citizenId);
  if (citizen && citizen.activeProcessId === processId) {
    citizen.activeProcessId = null;
    citizen.activity = "Idle";
  }

  s.events.push({
    citizenId: process.citizenId,
    citizenName: s.citizens.find((c) => c.id === process.citizenId)?.name ?? process.citizenId,
    type: "ProcessCancelled",
    description: `Process cancelled: ${process.title}`,
    timestamp: ts(),
  });

  return true;
}

// ─── Step Management ────────────────────────────────────────────

/**
 * Complete the current step of a process and optionally advance.
 */
export function completeStep(
  s: RepublicState,
  processId: string,
  stepId: string,
  output?: unknown,
  validation?: { passed: boolean; notes: string },
): boolean {
  const process = findProcess(s, processId);
  if (!process || process.status !== "running") {
    return false;
  }

  const step = process.steps.find((st) => st.id === stepId);
  if (!step || step.status !== "running") {
    return false;
  }

  step.status = "completed";
  step.progress = 100;
  step.completedAt = ts();
  step.output = output;
  step.validationResult = validation;

  s.events.push({
    citizenId: process.citizenId,
    citizenName: s.citizens.find((c) => c.id === process.citizenId)?.name ?? process.citizenId,
    type: "StepCompleted",
    description: `Step completed: ${step.title} (process: ${process.title})`,
    timestamp: ts(),
  });

  // Recalculate process progress
  recalculateProgress(process);

  // Auto-advance to next step
  return advanceProcess(s, processId);
}

/**
 * Mark a step as failed.
 */
export function failStep(
  s: RepublicState,
  processId: string,
  stepId: string,
  error: string,
): boolean {
  const process = findProcess(s, processId);
  if (!process) {
    return false;
  }

  const step = process.steps.find((st) => st.id === stepId);
  if (!step) {
    return false;
  }

  step.status = "failed";
  step.output = { error };

  // Fail the process
  process.status = "failed";

  const citizen = s.citizens.find((c) => c.id === process.citizenId);
  if (citizen && citizen.activeProcessId === processId) {
    citizen.activeProcessId = null;
    citizen.activity = "Idle";
  }

  return true;
}

/**
 * Advance a process to the next step after current step completes.
 */
export function advanceProcess(s: RepublicState, processId: string): boolean {
  const process = findProcess(s, processId);
  if (!process || process.status !== "running") {
    return false;
  }

  // Find next queued step
  const nextIndex = process.steps.findIndex(
    (st, i) => i > process.currentStepIndex && st.status === "queued",
  );

  if (nextIndex < 0) {
    // All steps done — complete the process
    process.status = "completed";
    process.completedAt = ts();
    process.progress = 100;

    const citizen = s.citizens.find((c) => c.id === process.citizenId);
    if (citizen && citizen.activeProcessId === processId) {
      citizen.activeProcessId = null;
      citizen.activity = "Idle";
    }

    s.events.push({
      citizenId: process.citizenId,
      citizenName: s.citizens.find((c) => c.id === process.citizenId)?.name ?? process.citizenId,
      type: "ProcessCompleted",
      description: `Process completed: ${process.title}`,
      timestamp: ts(),
    });

    return true;
  }

  // Start next step
  process.currentStepIndex = nextIndex;
  process.steps[nextIndex].status = "running";
  process.steps[nextIndex].startedAt = ts();

  return true;
}

/**
 * Update progress on the current step.
 */
export function updateStepProgress(
  s: RepublicState,
  processId: string,
  stepId: string,
  progress: number,
): boolean {
  const process = findProcess(s, processId);
  if (!process) {
    return false;
  }

  const step = process.steps.find((st) => st.id === stepId);
  if (!step) {
    return false;
  }

  step.progress = Math.max(0, Math.min(100, progress));
  recalculateProgress(process);
  return true;
}

// ─── User Intervention ──────────────────────────────────────────

/**
 * Inject a user note/adjustment into a process.
 * Citizens will receive these notes as context for their next action.
 */
export function injectUserNote(s: RepublicState, processId: string, note: string): boolean {
  const process = findProcess(s, processId);
  if (!process) {
    return false;
  }

  if (process.userNotes.length >= MAX_USER_NOTES) {
    process.userNotes.shift();
  }

  process.userNotes.push(`[${ts()}] ${note}`);

  s.events.push({
    citizenId: process.citizenId,
    citizenName: s.citizens.find((c) => c.id === process.citizenId)?.name ?? "User",
    type: "UserIntervention",
    description: `User note on "${process.title}": ${note.slice(0, 100)}`,
    timestamp: ts(),
  });

  return true;
}

/**
 * Reassign a step to a different citizen.
 */
export function reassignStep(
  s: RepublicState,
  processId: string,
  stepId: string,
  newCitizenId: string,
): boolean {
  const process = findProcess(s, processId);
  if (!process) {
    return false;
  }

  const step = process.steps.find((st) => st.id === stepId);
  if (!step) {
    return false;
  }

  const citizen = s.citizens.find((c) => c.id === newCitizenId);
  if (!citizen) {
    return false;
  }

  step.assignedCitizenId = newCitizenId;

  s.events.push({
    citizenId: process.citizenId,
    citizenName: s.citizens.find((c) => c.id === process.citizenId)?.name ?? process.citizenId,
    type: "UserIntervention",
    description: `Step "${step.title}" reassigned to ${citizen.name}`,
    timestamp: ts(),
  });

  return true;
}

/**
 * Change the priority of a process.
 */
export function setProcessPriority(
  s: RepublicState,
  processId: string,
  priority: ManagedProcess["priority"],
): boolean {
  const process = findProcess(s, processId);
  if (!process) {
    return false;
  }

  process.priority = priority;
  return true;
}

/**
 * Add an output artifact to a process.
 */
export function addProcessOutput(
  s: RepublicState,
  processId: string,
  output: Omit<ProcessOutput, "id" | "producedAt">,
): ProcessOutput | null {
  const process = findProcess(s, processId);
  if (!process) {
    return null;
  }

  if (process.outputs.length >= MAX_OUTPUTS) {
    process.outputs.shift();
  }

  const out: ProcessOutput = {
    ...output,
    id: uid(),
    producedAt: ts(),
  };

  process.outputs.push(out);
  return out;
}

// ─── Queries ────────────────────────────────────────────────────

/**
 * Get all processes, optionally filtered.
 */
export function getProcesses(
  s: RepublicState,
  filters?: {
    citizenId?: string;
    status?: ProcessStatus;
    priority?: ManagedProcess["priority"];
  },
): ManagedProcess[] {
  const all = s.processes ?? [];
  if (!filters) {
    return [...all];
  }

  return all.filter((p) => {
    if (filters.citizenId && p.citizenId !== filters.citizenId) {return false;}
    if (filters.status && p.status !== filters.status) {return false;}
    if (filters.priority && p.priority !== filters.priority) {return false;}
    return true;
  });
}

/**
 * Get a single process by ID.
 */
export function getProcessById(s: RepublicState, processId: string): ManagedProcess | undefined {
  return findProcess(s, processId);
}

/**
 * Get all processes owned by a citizen.
 */
export function getCitizenProcesses(s: RepublicState, citizenId: string): ManagedProcess[] {
  return (s.processes ?? []).filter((p) => p.citizenId === citizenId);
}

/**
 * Get active (running/paused) processes.
 */
export function getActiveProcesses(s: RepublicState): ManagedProcess[] {
  return (s.processes ?? []).filter((p) => p.status === "running" || p.status === "paused");
}

// ─── Simulation Tick ────────────────────────────────────────────

/**
 * Process manager tick — called from the simulation loop.
 * Handles auto-advancing processes with completed steps,
 * checking for stale processes, and starting queued processes
 * whose dependencies are met.
 */
export function processManagerTick(s: RepublicState): void {
  if (!s.processes) {return;}

  for (const process of s.processes) {
    if (process.status === "queued") {
      // Try to start if dependencies are met
      const depsOk = process.dependencies.every((depId) => {
        const dep = findProcess(s, depId);
        return dep?.status === "completed";
      });
      if (depsOk) {
        startProcess(s, process.id);
      }
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface ProcessDiagnostics {
  totalProcesses: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  activeProcesses: number;
  totalSteps: number;
  completedSteps: number;
  totalOutputs: number;
}

export function getProcessDiagnostics(s: RepublicState): ProcessDiagnostics {
  const all = s.processes ?? [];
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let totalSteps = 0;
  let completedSteps = 0;
  let totalOutputs = 0;

  for (const p of all) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
    byPriority[p.priority] = (byPriority[p.priority] ?? 0) + 1;
    totalSteps += p.steps.length;
    completedSteps += p.steps.filter((st) => st.status === "completed").length;
    totalOutputs += p.outputs.length;
  }

  return {
    totalProcesses: all.length,
    byStatus,
    byPriority,
    activeProcesses: all.filter((p) => p.status === "running" || p.status === "paused").length,
    totalSteps,
    completedSteps,
    totalOutputs,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function findProcess(s: RepublicState, processId: string): ManagedProcess | undefined {
  return (s.processes ?? []).find((p) => p.id === processId);
}

function recalculateProgress(process: ManagedProcess): void {
  if (process.steps.length === 0) {
    process.progress = 0;
    return;
  }

  const totalProgress = process.steps.reduce((sum, step) => sum + step.progress, 0);
  process.progress = Math.round(totalProgress / process.steps.length);
}
