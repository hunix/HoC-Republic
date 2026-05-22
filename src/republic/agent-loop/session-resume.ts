/**
 * Session Resume — Checkpoint/restore for agent loop continuity.
 *
 * Enables Manus-style session continuity where the agent can be
 * interrupted (browser close, abort, timeout) and later resumed
 * from a saved checkpoint.
 *
 * Checkpoints are saved to the sandbox filesystem so they survive
 * gateway restarts (the sandbox container is persistent).
 *
 * Design:
 *   - Checkpoints are written every N iterations (configurable)
 *   - Contains minimal state: iteration count, tokens used, tools
 *     used, phase progress, and the last few messages
 *   - Does NOT contain full message history (too large) — instead
 *     stores a summary that can be injected as context on resume
 *   - Session ID is used as the checkpoint key
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { sandboxWriteFile, sandboxReadFile } from "../agent-sandbox.js";

const logger = createSubsystemLogger("session-resume");

// ─── Types ──────────────────────────────────────────────────────

export interface SessionCheckpoint {
  sessionId: string;
  createdAt: string;
  iteration: number;
  totalTokens: number;
  provider: string;
  modelId: string;
  strategy: string;
  phasesCompleted: string[];
  toolsUsed: string[];
  taskDescription: string;
  progressSummary: string;
  finalResponseSoFar: string;
}

// ─── Constants ──────────────────────────────────────────────────

const CHECKPOINT_PATH = "/workspace/.agent-checkpoint.json";
const CHECKPOINT_INTERVAL = 5; // Save every N iterations

// ─── Save ───────────────────────────────────────────────────────

/** Check if we should save a checkpoint at this iteration */
export function shouldCheckpoint(iteration: number): boolean {
  return iteration > 0 && iteration % CHECKPOINT_INTERVAL === 0;
}

/** Save a checkpoint to the sandbox filesystem */
export async function saveCheckpoint(checkpoint: SessionCheckpoint): Promise<void> {
  try {
    const data = JSON.stringify(checkpoint, null, 2);
    await sandboxWriteFile(CHECKPOINT_PATH, data);
    logger.info(`[SessionResume] Checkpoint saved at iteration ${checkpoint.iteration}`);
  } catch (err) {
    logger.warn(
      `[SessionResume] Failed to save checkpoint: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Build a checkpoint from current loop state */
export function buildCheckpoint(
  sessionId: string,
  iteration: number,
  totalTokens: number,
  provider: string,
  modelId: string,
  strategy: string,
  phasesCompleted: string[],
  toolsUsed: string[],
  taskDescription: string,
  finalResponseSoFar: string,
): SessionCheckpoint {
  // Truncate the response to last 2000 chars for a manageable checkpoint
  const truncatedResponse =
    finalResponseSoFar.length > 2000
      ? `... (truncated) ...\n${finalResponseSoFar.slice(-2000)}`
      : finalResponseSoFar;

  return {
    sessionId,
    createdAt: new Date().toISOString(),
    iteration,
    totalTokens,
    provider,
    modelId,
    strategy,
    phasesCompleted,
    toolsUsed: [...new Set(toolsUsed)],
    taskDescription: taskDescription.slice(0, 300),
    progressSummary: `Completed ${iteration} iterations using ${strategy} strategy. Phases: ${phasesCompleted.join(", ") || "none"}. Tools: ${new Set(toolsUsed).size} unique.`,
    finalResponseSoFar: truncatedResponse,
  };
}

// ─── Load ───────────────────────────────────────────────────────

/** Check if a resumable checkpoint exists */
export async function canResume(): Promise<boolean> {
  try {
    const data = await sandboxReadFile(CHECKPOINT_PATH);
    if (!data || data.length < 10) {
      return false;
    }
    const parsed = JSON.parse(data) as SessionCheckpoint;
    // Only resume if checkpoint is less than 1 hour old
    const age = Date.now() - new Date(parsed.createdAt).getTime();
    return age < 3600_000;
  } catch {
    return false;
  }
}

/** Load checkpoint from sandbox */
export async function loadCheckpoint(): Promise<SessionCheckpoint | null> {
  try {
    const data = await sandboxReadFile(CHECKPOINT_PATH);
    if (!data || data.length < 10) {
      return null;
    }
    const parsed = JSON.parse(data) as SessionCheckpoint;
    logger.info(
      `[SessionResume] Loaded checkpoint: iteration ${parsed.iteration}, strategy ${parsed.strategy}`,
    );
    return parsed;
  } catch (err) {
    logger.warn(
      `[SessionResume] Failed to load checkpoint: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** Build a context injection message from a checkpoint for resume */
export function buildResumeContext(checkpoint: SessionCheckpoint): string {
  return [
    `[RESUMING PREVIOUS SESSION]`,
    ``,
    `You are resuming work on a task that was interrupted.`,
    `Previous session context:`,
    `- Task: ${checkpoint.taskDescription}`,
    `- Strategy: ${checkpoint.strategy}`,
    `- Progress: ${checkpoint.iteration} iterations completed`,
    `- Phases completed: ${checkpoint.phasesCompleted.join(", ") || "none"}`,
    `- Tools used: ${checkpoint.toolsUsed.join(", ") || "none"}`,
    ``,
    `Previous progress summary:`,
    `${checkpoint.progressSummary}`,
    ``,
    `Continue from where you left off. Check the files in /workspace/ for any work already completed.`,
    `The plan file is at /workspace/.agent-plan.md and the todo is at /workspace/.agent-todo.md.`,
  ].join("\n");
}

/** Clear checkpoint after successful completion */
export async function clearCheckpoint(): Promise<void> {
  try {
    await sandboxWriteFile(CHECKPOINT_PATH, "");
  } catch {
    // Non-critical
  }
}
