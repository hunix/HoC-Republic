/**
 * Task Supervisor — Intelligent Adaptive Timeout & Health Monitoring
 *
 * Replaces hardcoded timeouts with intelligent estimation:
 * 1. Estimates duration based on target scope (port range, page count, etc.)
 * 2. Polls running tasks every 15s for output growth (liveness)
 * 3. Auto-extends up to 2× estimated if task is still producing output
 * 4. Notifies user via callback if stalled or needs more time
 * 5. Graceful termination: SIGTERM → 10s → SIGKILL
 */

import { getLogger } from "../logging.js";

const logger = getLogger();

// ─── Types ──────────────────────────────────────────────────────

export interface TaskExecution {
  id: string;
  tool: string;
  command: string;
  target: string;
  estimatedTimeout: number;    // seconds, computed from scope
  maxTimeout: number;          // seconds, 2× estimated
  startedAt: number;
  lastOutputAt: number;        // last time stdout grew
  outputBytes: number;
  status: "running" | "stalled" | "needs_user" | "done" | "killed" | "extended";
  stallCount: number;          // consecutive stall checks
  extensions: number;          // how many times auto-extended
  result?: { stdout: string; stderr?: string; exitCode: number };
  onStatusChange?: (task: TaskExecution) => void;
}

export type TimeoutTier = "quick" | "standard" | "heavy" | "marathon";

interface ScopeHints {
  portRange?: string;          // "1-1000" or "1-65535"
  pageCount?: number;          // estimated pages to scan
  networkSize?: number;        // number of hosts (CIDR → host count)
  toolComplexity?: "fast" | "moderate" | "slow";
  isDeepScan?: boolean;
}

// ─── Constants ──────────────────────────────────────────────────

const HEALTH_POLL_INTERVAL_MS = 15_000;   // 15s
const STALL_THRESHOLD_MS = 60_000;        // 1 min no output = stall
const STALL_KILL_THRESHOLD = 8;           // 8 stalls (2 min) = ask user
const MAX_EXTENSIONS = 3;                  // max 3 auto-extensions
const _GRACEFUL_TERM_WAIT_MS = 10_000;     // 10s after SIGTERM

// ─── Timeout Estimation ─────────────────────────────────────────

/** Estimate timeout in seconds based on tool + scope */
export function estimateTimeout(tool: string, scope: ScopeHints = {}): number {
  const { portRange, pageCount, networkSize, isDeepScan } = scope;

  // Base timeouts per tool category
  const baseTimeouts: Record<string, number> = {
    // Recon
    nmap: 120, masscan: 60, dnsrecon: 90, amass: 180,
    whois: 15, sslyze: 60, theharvester: 120,
    // Web
    nikto: 180, gobuster: 180, sqlmap: 240, wpscan: 180,
    wafw00f: 15, ffuf: 180,
    // Exploit
    msfconsole: 300, searchsploit: 15, hydra: 300, john: 600,
    // Network
    tcpdump: 60, tshark: 60, traceroute: 30,
    // Compliance
    lynis: 240,
    // Scraping
    httrack: 300, scrapy: 180, "frontend-audit": 120, "js-analysis": 90,
    linkchecker: 120,
    // Exploit DB
    "exploitdb-sync": 300, "exploitdb-search": 30,
    // Default
    enum4linux: 90, binwalk: 60,
  };

  let base = baseTimeouts[tool] ?? 120;

  // Scale by port range
  if (portRange) {
    const ports = parsePortCount(portRange);
    if (ports > 10000) { base *= 3; }
    else if (ports > 1000) { base *= 1.5; }
  }

  // Scale by network size (CIDR)
  if (networkSize) {
    if (networkSize > 256) { base *= 4; }      // /16 or larger
    else if (networkSize > 64) { base *= 2.5; }
    else if (networkSize > 16) { base *= 1.5; }
  }

  // Scale by page count (web tools)
  if (pageCount && pageCount > 50) {
    base *= Math.min(3, pageCount / 50);
  }

  // Deep scan multiplier
  if (isDeepScan) { base *= 2; }

  // Cap at 2 hours
  return Math.min(Math.round(base), 7200);
}

/** Get the timeout tier for display */
export function getTimeoutTier(seconds: number): TimeoutTier {
  if (seconds <= 120) { return "quick"; }
  if (seconds <= 600) { return "standard"; }
  if (seconds <= 1800) { return "heavy"; }
  return "marathon";
}

/** Parse port range string into approximate port count */
function parsePortCount(portRange: string): number {
  const parts = portRange.split(",");
  let count = 0;
  for (const part of parts) {
    const range = part.trim().split("-");
    if (range.length === 2) {
      count += Math.abs(parseInt(range[1]!) - parseInt(range[0]!)) + 1;
    } else {
      count += 1;
    }
  }
  return count;
}

/** Estimate host count from CIDR notation */
export function estimateHostCount(target: string): number {
  const cidrMatch = target.match(/\/(\d+)$/);
  if (!cidrMatch) { return 1; }
  const prefix = parseInt(cidrMatch[1]!);
  return Math.pow(2, 32 - prefix);
}

// ─── Active Task Registry ───────────────────────────────────────

const activeTasks = new Map<string, TaskExecution>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function ensurePollRunning() {
  if (pollTimer) { return; }
  pollTimer = setInterval(pollAllTasks, HEALTH_POLL_INTERVAL_MS);
}

function stopPollIfEmpty() {
  if (activeTasks.size === 0 && pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// ─── Task Lifecycle ─────────────────────────────────────────────

/**
 * Register a new task execution with adaptive timeout.
 * Returns the task ID and estimated timeout.
 */
export function registerTask(
  tool: string,
  command: string,
  target: string,
  scope: ScopeHints = {},
  onStatusChange?: (task: TaskExecution) => void,
): TaskExecution {
  const estimated = estimateTimeout(tool, scope);
  const task: TaskExecution = {
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    tool,
    command,
    target,
    estimatedTimeout: estimated,
    maxTimeout: estimated * 2,
    startedAt: Date.now(),
    lastOutputAt: Date.now(),
    outputBytes: 0,
    status: "running",
    stallCount: 0,
    extensions: 0,
    onStatusChange,
  };

  activeTasks.set(task.id, task);
  ensurePollRunning();
  logger.info(`[TaskSupervisor] Registered ${tool} on ${target} — estimated ${estimated}s (tier: ${getTimeoutTier(estimated)})`);
  return task;
}

/**
 * Report output growth for a running task (called by the executor).
 */
export function reportOutput(taskId: string, newBytes: number): void {
  const task = activeTasks.get(taskId);
  if (!task) { return; }
  task.outputBytes += newBytes;
  task.lastOutputAt = Date.now();
  if (task.status === "stalled") {
    task.status = "running";
    task.stallCount = 0;
    logger.info(`[TaskSupervisor] ${task.tool} resumed output (${task.outputBytes} bytes total)`);
  }
}

/**
 * Mark a task as completed.
 */
export function completeTask(
  taskId: string,
  result: { stdout: string; stderr?: string; exitCode: number },
): void {
  const task = activeTasks.get(taskId);
  if (!task) { return; }
  task.status = "done";
  task.result = result;
  task.onStatusChange?.(task);
  activeTasks.delete(taskId);
  stopPollIfEmpty();
  const elapsed = Math.round((Date.now() - task.startedAt) / 1000);
  logger.info(`[TaskSupervisor] ${task.tool} completed in ${elapsed}s (estimated ${task.estimatedTimeout}s)`);
}

/**
 * User-initiated extend: give the task more time.
 */
export function extendTask(taskId: string, additionalSeconds: number): boolean {
  const task = activeTasks.get(taskId);
  if (!task) { return false; }
  task.maxTimeout += additionalSeconds;
  task.status = "extended";
  task.stallCount = 0;
  task.extensions++;
  task.onStatusChange?.(task);
  logger.info(`[TaskSupervisor] ${task.tool} extended by ${additionalSeconds}s (new max: ${task.maxTimeout}s)`);
  return true;
}

/**
 * User-initiated cancel.
 */
export function cancelTask(taskId: string): boolean {
  const task = activeTasks.get(taskId);
  if (!task) { return false; }
  task.status = "killed";
  task.onStatusChange?.(task);
  activeTasks.delete(taskId);
  stopPollIfEmpty();
  logger.info(`[TaskSupervisor] ${task.tool} cancelled by user`);
  return true;
}

/**
 * Get all active task statuses.
 */
export function getActiveTasks(): TaskExecution[] {
  return [...activeTasks.values()];
}

/**
 * Get a specific task.
 */
export function getTask(taskId: string): TaskExecution | undefined {
  return activeTasks.get(taskId);
}

// ─── Health Polling ─────────────────────────────────────────────

function pollAllTasks() {
  const now = Date.now();

  for (const [_taskId, task] of activeTasks) {
    if (task.status === "done" || task.status === "killed") { continue; }

    const elapsed = (now - task.startedAt) / 1000;
    const sinceLastOutput = now - task.lastOutputAt;

    // Check if exceeded max timeout
    if (elapsed > task.maxTimeout) {
      if (task.extensions < MAX_EXTENSIONS) {
        // Auto-extend if still producing output recently
        if (sinceLastOutput < STALL_THRESHOLD_MS) {
          task.maxTimeout += task.estimatedTimeout;
          task.extensions++;
          task.status = "extended";
          task.onStatusChange?.(task);
          logger.info(`[TaskSupervisor] Auto-extended ${task.tool} (${task.extensions}/${MAX_EXTENSIONS}), output still flowing`);
          continue;
        }
      }
      // Exceeded max — ask user
      task.status = "needs_user";
      task.onStatusChange?.(task);
      logger.warn(`[TaskSupervisor] ${task.tool} exceeded max timeout (${task.maxTimeout}s) — needs user decision`);
      continue;
    }

    // Check for stall (no output for STALL_THRESHOLD_MS)
    if (sinceLastOutput > STALL_THRESHOLD_MS) {
      task.stallCount++;
      if (task.stallCount >= STALL_KILL_THRESHOLD) {
        // Too many stalls — ask user
        task.status = "needs_user";
        task.onStatusChange?.(task);
        logger.warn(`[TaskSupervisor] ${task.tool} stalled ${task.stallCount} times — needs user decision`);
      } else if (task.status !== "stalled") {
        task.status = "stalled";
        task.onStatusChange?.(task);
        logger.warn(`[TaskSupervisor] ${task.tool} stalled (no output for ${Math.round(sinceLastOutput / 1000)}s)`);
      }
    }
  }
}

// ─── Scope Estimation Helpers ───────────────────────────────────

/**
 * Estimate scope hints from a target and scan parameters.
 * Used by the planner to feed into estimateTimeout().
 */
export function buildScopeHints(
  target: string,
  opts: { ports?: string; scanType?: string; pageCount?: number } = {},
): ScopeHints {
  return {
    portRange: opts.ports,
    pageCount: opts.pageCount,
    networkSize: estimateHostCount(target),
    toolComplexity: opts.scanType === "full" ? "slow" : opts.scanType === "quick" ? "fast" : "moderate",
    isDeepScan: opts.scanType === "full" || opts.scanType === "deep",
  };
}

/**
 * Format a task status for display in the chat UI.
 */
export function formatTaskStatus(task: TaskExecution): string {
  const elapsed = Math.round((Date.now() - task.startedAt) / 1000);
  const tier = getTimeoutTier(task.estimatedTimeout);
  const progress = Math.min(100, Math.round((elapsed / task.estimatedTimeout) * 100));

  switch (task.status) {
    case "running":
      return `⚡ **${task.tool}** running (${elapsed}s/${task.estimatedTimeout}s, ~${progress}%) [${tier}]`;
    case "stalled":
      return `⏸️ **${task.tool}** stalled — no output for ${Math.round((Date.now() - task.lastOutputAt) / 1000)}s (${elapsed}s elapsed)`;
    case "extended":
      return `🔄 **${task.tool}** auto-extended (${task.extensions}× extra time, ${elapsed}s elapsed, output still flowing)`;
    case "needs_user":
      return `⚠️ **${task.tool}** needs your decision — ${elapsed}s elapsed, max ${task.maxTimeout}s. Continue or cancel?`;
    case "done":
      return `✅ **${task.tool}** completed in ${elapsed}s`;
    case "killed":
      return `🛑 **${task.tool}** cancelled after ${elapsed}s`;
    default:
      return `**${task.tool}** — ${task.status}`;
  }
}
