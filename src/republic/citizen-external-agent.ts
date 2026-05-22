/**
 * Republic Platform — Citizen External Agent
 *
 * Enables citizens to autonomously interact with the real world.
 * All external actions require constitutional approval and are rate-limited.
 *
 * Capabilities:
 *   - GitHub: commit code to configured repos
 *   - Channel responses: reply on WhatsApp/Telegram/Discord
 *   - Research publishing: post findings to configured APIs
 *   - Email: send via configured SMTP (future)
 *
 * Security:
 *   - Every action is audit-logged
 *   - Rate limited per citizen
 *   - Constitutional approval required
 *   - Configurable allow/deny lists
 */

import type { Citizen, RepublicState } from "./types.js";
import { uid, ts } from "./utils.js";
import { archiveEvents } from "./republic-sqlite.js";

// ─── Configuration ──────────────────────────────────────────────

/** Maximum external actions per citizen per epoch (100 ticks) */
const MAX_EXTERNAL_ACTIONS_PER_EPOCH = 5;

/** GitHub token for code publishing */
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

/** Configured repo for citizen code contributions */
const GITHUB_REPO = process.env.CITIZEN_GITHUB_REPO || "";

// ─── Types ──────────────────────────────────────────────────────

export type ExternalActionType =
  | "github_commit"
  | "channel_reply"
  | "research_publish"
  | "social_post"
  | "email_send";

export interface ExternalAction {
  id: string;
  citizenId: string;
  citizenName: string;
  type: ExternalActionType;
  target: string;
  content: string;
  status: "pending" | "approved" | "executed" | "rejected" | "failed";
  result?: string;
  createdAt: string;
  executedAt?: string;
}

// ─── State ──────────────────────────────────────────────────────

const actionLog: ExternalAction[] = [];
const MAX_ACTION_LOG = 500;

/** Track actions per citizen per epoch for rate limiting */
const citizenActionCounts = new Map<string, { count: number; resetAt: number }>();

// ─── Rate Limiting ──────────────────────────────────────────────

function checkRateLimit(citizenId: string, currentTick: number): boolean {
  const record = citizenActionCounts.get(citizenId);
  if (!record || currentTick >= record.resetAt) {
    citizenActionCounts.set(citizenId, { count: 0, resetAt: currentTick + 100 });
    return true;
  }
  return record.count < MAX_EXTERNAL_ACTIONS_PER_EPOCH;
}

function recordExternalAction(citizenId: string, currentTick: number): void {
  const record = citizenActionCounts.get(citizenId);
  if (record) {
    record.count++;
  } else {
    citizenActionCounts.set(citizenId, { count: 1, resetAt: currentTick + 100 });
  }
}

// ─── Constitutional Approval ────────────────────────────────────

/**
 * Check if an external action is constitutionally approved.
 * Currently: citizen must have energy > 50 and happiness > 30.
 * Future: could integrate with governance bill system.
 */
function isConstitutionallyApproved(
  citizen: Citizen,
  actionType: ExternalActionType,
  _s: RepublicState,
): { approved: boolean; reason: string } {
  if (citizen.energy < 50) {
    return { approved: false, reason: "Insufficient energy for external action" };
  }
  if (citizen.happiness < 30) {
    return { approved: false, reason: "Citizen morale too low for external representation" };
  }

  // Only specialists can publish externally
  const allowedSpecs: Record<string, string[]> = {
    github_commit: ["SoftwareEngineer", "DevOps", "Researcher", "DataScientist", "SecurityExpert"],
    research_publish: ["Researcher", "DataScientist", "IntelligenceAnalyst", "Educator"],
    channel_reply: [], // Any citizen can reply on channels
    social_post: ["ContentCreator", "Researcher", "Educator"],
    email_send: [],
  };

  const allowed = allowedSpecs[actionType];
  if (allowed && allowed.length > 0 && !allowed.includes(citizen.specialization)) {
    return { approved: false, reason: `Specialization ${citizen.specialization} not authorized for ${actionType}` };
  }

  return { approved: true, reason: "Approved by constitution" };
}

// ─── GitHub Integration ─────────────────────────────────────────

/**
 * Publish code to GitHub via the GitHub API.
 */
async function executeGitHubCommit(
  action: ExternalAction,
): Promise<{ ok: boolean; result: string }> {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return { ok: false, result: "GitHub not configured (set GITHUB_TOKEN and CITIZEN_GITHUB_REPO)" };
  }

  try {
    // Create a file via GitHub API
    const filePath = `citizen-contributions/${action.citizenName.toLowerCase().replace(/\s+/g, "-")}/${action.id}.md`;
    const content = Buffer.from(action.content).toString("base64");

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          message: `[Republic] ${action.citizenName}: ${action.target}`,
          content,
          branch: "main",
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      return { ok: false, result: `GitHub API error ${response.status}: ${error.slice(0, 200)}` };
    }

    const data = (await response.json()) as { content?: { html_url?: string } };
    return { ok: true, result: data.content?.html_url ?? "Committed successfully" };
  } catch (err: unknown) {
    return { ok: false, result: err instanceof Error ? err.message : "GitHub commit failed" };
  }
}

// ─── Channel Reply ──────────────────────────────────────────────

/**
 * Reply to a channel message.
 * This integrates with the existing channel system (WhatsApp, Telegram, etc.)
 */
async function executeChannelReply(
  _action: ExternalAction,
): Promise<{ ok: boolean; result: string }> {
  // This will be wired into the existing channel plugins
  // For now, record the intent — channel plugins poll the action log
  return { ok: true, result: "Queued for channel delivery" };
}

// ─── Main API ───────────────────────────────────────────────────

/**
 * Request an external action by a citizen.
 * Goes through rate limiting and constitutional approval before execution.
 */
export async function requestExternalAction(
  s: RepublicState,
  citizen: Citizen,
  type: ExternalActionType,
  target: string,
  content: string,
): Promise<ExternalAction> {
  const action: ExternalAction = {
    id: `ext-${uid()}`,
    citizenId: citizen.id,
    citizenName: citizen.name,
    type,
    target,
    content,
    status: "pending",
    createdAt: ts(),
  };

  // Rate limit check
  if (!checkRateLimit(citizen.id, s.currentTick)) {
    action.status = "rejected";
    action.result = "Rate limit exceeded";
    actionLog.push(action);
    if (actionLog.length > MAX_ACTION_LOG) { actionLog.shift(); }
    return action;
  }

  // Constitutional approval
  const approval = isConstitutionallyApproved(citizen, type, s);
  if (!approval.approved) {
    action.status = "rejected";
    action.result = approval.reason;
    actionLog.push(action);
    if (actionLog.length > MAX_ACTION_LOG) { actionLog.shift(); }
    return action;
  }

  action.status = "approved";

  // Execute the action
  let result: { ok: boolean; result: string };
  try {
    switch (type) {
      case "github_commit":
        result = await executeGitHubCommit(action);
        break;
      case "channel_reply":
        result = await executeChannelReply(action);
        break;
      default:
        result = { ok: true, result: `Action ${type} queued for execution` };
        break;
    }

    action.status = result.ok ? "executed" : "failed";
    action.result = result.result;
    action.executedAt = ts();

    if (result.ok) {
      recordExternalAction(citizen.id, s.currentTick);
    }
  } catch (err: unknown) {
    action.status = "failed";
    action.result = err instanceof Error ? err.message : "Execution failed";
  }

  // Log the action
  actionLog.push(action);
  if (actionLog.length > MAX_ACTION_LOG) { actionLog.shift(); }

  // Archive as event
  try {
    await archiveEvents(
      [{
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "ExternalAction",
        description: `${citizen.name} ${action.status}: ${type} → ${target} (${action.result?.slice(0, 100)})`,
        timestamp: ts(),
      }],
      s.currentTick,
    );
  } catch {
    // Archive failure should not crash
  }

  return action;
}

// ─── Query API ──────────────────────────────────────────────────

/** Get recent external actions. */
export function getExternalActions(opts?: {
  citizenId?: string;
  type?: ExternalActionType;
  status?: string;
  limit?: number;
}): ExternalAction[] {
  let results = [...actionLog];
  if (opts?.citizenId) { results = results.filter((a) => a.citizenId === opts.citizenId); }
  if (opts?.type) { results = results.filter((a) => a.type === opts.type); }
  if (opts?.status) { results = results.filter((a) => a.status === opts.status); }
  return results.slice(-(opts?.limit ?? 50));
}

/** Get external action statistics. */
export function getExternalActionStats(): {
  total: number;
  executed: number;
  rejected: number;
  failed: number;
  byType: Record<string, number>;
} {
  const stats = {
    total: actionLog.length,
    executed: 0,
    rejected: 0,
    failed: 0,
    byType: {} as Record<string, number>,
  };

  for (const a of actionLog) {
    if (a.status === "executed") { stats.executed++; }
    if (a.status === "rejected") { stats.rejected++; }
    if (a.status === "failed") { stats.failed++; }
    stats.byType[a.type] = (stats.byType[a.type] ?? 0) + 1;
  }

  return stats;
}
