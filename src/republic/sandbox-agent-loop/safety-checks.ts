/**
 * Sandbox Agent Loop — Safety Checks
 *
 * Contains all safety/budget checks for the agent loop:
 * - Abort signal check
 * - Wall-clock timeout
 * - Container health check
 * - Token/cost budget enforcement
 *
 * Extracted from iteration.ts per DDD file limits (400L max for gateway logic).
 */

import type { AgentBroadcaster, AgentProvider } from "../agent-providers/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { sandboxExec } from "../agent-sandbox.js";
import {
  MAX_TOTAL_TOKENS,
  MAX_COST_USD,
  MAX_WALL_CLOCK_MS,
  TOKEN_BUDGET_WARNING_THRESHOLD,
  PROVIDER_COST_PER_M,
} from "./config.js";

const logger = createSubsystemLogger("sandbox-agent");

// ─── Abort Check ────────────────────────────────────────────────

export function checkAbort(
  abortSignal: AbortSignal | undefined,
  iterations: number,
  broadcaster: AgentBroadcaster,
): string | null {
  if (!abortSignal?.aborted) {
    return null;
  }
  logger.info(`[AgentLoop] Aborted at iteration ${iterations}`);
  broadcaster.send("\n⏹️ Agent loop aborted by user.\n");
  return "\nAgent stopped: aborted by user.";
}

// ─── Wall-Clock Timeout ─────────────────────────────────────────

export function checkWallClock(loopStartMs: number, broadcaster: AgentBroadcaster): string | null {
  const elapsedMs = Date.now() - loopStartMs;
  if (elapsedMs <= MAX_WALL_CLOCK_MS) {
    return null;
  }
  const elapsedMin = Math.round(elapsedMs / 60_000);
  logger.warn(
    `[AgentLoop] Wall-clock timeout: ${elapsedMin} min > ${MAX_WALL_CLOCK_MS / 60_000} min`,
  );
  broadcaster.send(`\n⚠️ Wall-clock timeout (${elapsedMin} min). Stopping agent.\n`);
  return `\nAgent stopped: wall-clock timeout after ${elapsedMin} minutes.`;
}

// ─── Container Health Check ─────────────────────────────────────

export async function checkContainerHealth(
  iterationIndex: number,
  totalToolErrors: number,
  broadcaster: AgentBroadcaster,
): Promise<string | null> {
  const cadence = totalToolErrors > 3 ? 3 : 5;
  if (iterationIndex === 0 || iterationIndex % cadence !== 0) {
    return null;
  }

  try {
    const healthCheck = await sandboxExec("echo OK", "/workspace", 5);
    if (healthCheck.exitCode !== 0) {
      throw new Error("health check failed");
    }
  } catch {
    logger.warn(`[AgentLoop] Container health check failed at iteration ${iterationIndex + 1}`);
    broadcaster.send("\n⚠️ Sandbox container appears unhealthy. Attempting restart...\n");
    try {
      const { ensureContainerRunning } = await import("../agent-sandbox.js");
      const restartResult = await Promise.race([
        ensureContainerRunning(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error("Container restart timed out after 30s")), 30_000),
        ),
      ]);
      if (!restartResult) {
        throw new Error("restart returned false");
      }
      const recheck = await sandboxExec("echo OK", "/workspace", 10);
      if (recheck.exitCode !== 0) {
        throw new Error("restart failed");
      }
      broadcaster.send("✅ Container restarted successfully. Continuing...\n");
    } catch (restartErr) {
      logger.error(`[AgentLoop] Container restart failed: ${restartErr}`);
      broadcaster.send("\n❌ Container could not be restarted. Stopping agent.\n");
      return "\nAgent stopped: sandbox container crashed and could not be restarted.";
    }
  }
  return null;
}

// ─── Token / Cost Budget Check ──────────────────────────────────

export function checkTokenBudget(
  totalTokens: number,
  iterations: number,
  provider: AgentProvider | null,
  broadcaster: AgentBroadcaster,
): string | null {
  // Proactive warning
  if (totalTokens > MAX_TOTAL_TOKENS * TOKEN_BUDGET_WARNING_THRESHOLD && iterations > 2) {
    const pct = Math.round((totalTokens / MAX_TOTAL_TOKENS) * 100);
    broadcaster.send(`\n⚠️ Context budget at ${pct}% — prioritize completing the task.\n`);
  }

  // Hard limit
  if (totalTokens > MAX_TOTAL_TOKENS) {
    logger.warn(`[AgentLoop] Token budget exceeded: ${totalTokens} > ${MAX_TOTAL_TOKENS}`);
    broadcaster.send(
      `\n⚠️ Token budget exceeded (${totalTokens.toLocaleString()} tokens). Stopping agent.\n`,
    );
    return `\nAgent stopped: token budget exceeded (${totalTokens.toLocaleString()} / ${MAX_TOTAL_TOKENS.toLocaleString()} tokens).`;
  }

  // Cost limit
  const costPerM = PROVIDER_COST_PER_M[provider ?? ""] ?? 2.0;
  const estimatedCostUsd = (totalTokens / 1_000_000) * costPerM;
  if (estimatedCostUsd > MAX_COST_USD) {
    logger.warn(
      `[AgentLoop] Cost budget exceeded: ~$${estimatedCostUsd.toFixed(2)} > $${MAX_COST_USD}`,
    );
    broadcaster.send(
      `\n⚠️ Cost budget exceeded (~$${estimatedCostUsd.toFixed(2)}). Stopping agent.\n`,
    );
    return `\nAgent stopped: cost budget exceeded (~$${estimatedCostUsd.toFixed(2)} / $${MAX_COST_USD}).`;
  }
  return null;
}
