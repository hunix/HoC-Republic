/**
 * Production Scheduler — Multi-tier priority queue with fair-share scheduling
 *
 * The heart of the Citizen Production Engine (CPE).
 *
 * Architecture:
 *   Submit → tier assignment → fair-share check → plugin concurrency check
 *         → (if plugin warm) dispatch immediately
 *         → (if plugin cold) ensureWarm() then dispatch
 *         → on completion, release slot → drain next job
 *
 * Tiers (derived from job priority):
 *   CRITICAL  (priority 5)  — senior citizens, founders; 2× concurrency slots
 *   HIGH      (priority 3-4)— specialization matching; normal slots
 *   NORMAL    (priority 1-2)— everyone else; normal slots
 *
 * Per-plugin slot limits mirror PLUGIN_COSTS resource estimates.
 * Fair-share: one citizen cannot hold >FAIR_SHARE_FRACTION of a tier's queue.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  tryConsume,
  releaseJob,
  getBudgetStats,
} from "./citizen-token-budget.js";
import {
  ensureWarm,
  onJobStart,
  onJobEnd,
  considerPreWarm,
  getPluginStatus,
  getAllPluginStatuses,
} from "./plugin-lifecycle-manager.js";

const logger = createSubsystemLogger("production-scheduler");

// ─── Config ────────────────────────────────────────────────────────────────

const SCHEDULER_TICK_MS = 2_000;

/** Max fraction of a tier's queue that a single citizen can occupy (20%). */
const FAIR_SHARE_FRACTION = 0.20;

/** Backpressure threshold: when queue exceeds this fraction of capacity, defer new submissions. */
const BACKPRESSURE_FRACTION = 0.80;

/** Max concurrent jobs per plugin. Maps pluginId → concurrency limit. */
const PLUGIN_CONCURRENCY: Record<string, number> = {
  "hoc-plugin-bark":           3,
  "hoc-plugin-chatterbox":     3,
  "hoc-plugin-qwen3-tts":      4,
  "hoc-plugin-mmaudio":        2,
  "hoc-plugin-funmusic":       2,
  "hoc-plugin-switti":         2,
  "hoc-plugin-omnigen":        2,
  "hoc-plugin-glm-image":      1,
  "hoc-plugin-deforum":        1,
  "hoc-plugin-storydiffusion": 1,
  "hoc-plugin-magicanimate":   1,
  "hoc-plugin-sparc3d":        1,
  "hoc-plugin-easyvolcap":     1,
  "hoc-plugin-deepfacelab":    1,
  "hoc-plugin-facefusion":     2,
  "hoc-plugin-kv-edit":        2,
  "hoc-plugin-stable-avatar":  1,
  "hoc-plugin-dgm":            1,
  "hoc-plugin-autogpt":        2,
  "hoc-plugin-magentic-one":   1,
  "hoc-plugin-ai-scientist":   1,
  "hoc-plugin-open-lovable":   3,
  "hoc-plugin-uiux-promax":    3,
  "hoc-plugin-superpowers":    4,
  "hoc-plugin-a2a":            4,
  "hoc-plugin-lingbot-world":  1,
};
const DEFAULT_CONCURRENCY = 2;

/** Max queue depth per tier. */
const TIER_MAX_QUEUE: Record<string, number> = {
  CRITICAL: 30,
  HIGH: 100,
  NORMAL: 200,
};

// ─── Types ─────────────────────────────────────────────────────────────────

export type JobTier = "CRITICAL" | "HIGH" | "NORMAL";
export type ScheduledJobStatus = "queued" | "warming" | "running" | "completed" | "failed" | "deferred" | "cancelled";

export interface ScheduledJob {
  id: string;
  citizenId: string;
  citizenName: string;
  specialization?: string;
  pluginId: string;
  method: string;
  jobParams: Record<string, unknown>;
  tier: JobTier;
  priority: number;
  contentType: string;
  prompt: string;
  status: ScheduledJobStatus;
  submittedAt: number;
  startedAt?: number;
  completedAt?: number;
  outputPath?: string;
  error?: string;
  /** Gateway call function — injected at scheduler init. */
  _callGateway?: GatewayCallFn;
}

/** Function to invoke a plugin gateway method. Injected at init time. */
export type GatewayCallFn = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

interface PluginSlots {
  running: number;
  max: number;
}

// ─── State ─────────────────────────────────────────────────────────────────

const queue: ScheduledJob[] = []; // pending + warming jobs
const history: ScheduledJob[] = []; // completed / failed (last 500)
const pluginSlots = new Map<string, PluginSlots>();

let _idSeq = 0;
let _tickTimer: ReturnType<typeof setInterval> | null = null;
let _callGateway: GatewayCallFn | null = null;

const MAX_HISTORY = 500;

// ─── Internal helpers ─────────────────────────────────────────────────────

function newId(): string {
  return `cpe-${Date.now()}-${++_idSeq}`;
}

function getSlots(pluginId: string): PluginSlots {
  let s = pluginSlots.get(pluginId);
  if (!s) {
    s = { running: 0, max: PLUGIN_CONCURRENCY[pluginId] ?? DEFAULT_CONCURRENCY };
    pluginSlots.set(pluginId, s);
  }
  return s;
}

function tierOf(priority: number): JobTier {
  if (priority >= 5) { return "CRITICAL"; }
  if (priority >= 3) { return "HIGH"; }
  return "NORMAL";
}

function queueDepthForTier(tier: JobTier): number {
  return queue.filter((j) => j.tier === tier && (j.status === "queued" || j.status === "warming")).length;
}

function citizenDepthInTier(citizenId: string, tier: JobTier): number {
  return queue.filter(
    (j) => j.citizenId === citizenId && j.tier === tier && j.status !== "running",
  ).length;
}

function archiveJob(job: ScheduledJob): void {
  history.push(job);
  if (history.length > MAX_HISTORY) { history.splice(0, history.length - MAX_HISTORY); }
  const idx = queue.indexOf(job);
  if (idx !== -1) { queue.splice(idx, 1); }
}

async function executeJob(job: ScheduledJob): Promise<void> {
  const slots = getSlots(job.pluginId);
  slot: {
    slots.running += 1;
    job.status = "running";
    job.startedAt = Date.now();
    onJobStart(job.pluginId);

    const gw = job._callGateway ?? _callGateway;
    if (!gw) {
      job.status = "failed";
      job.error = "No gateway call function registered";
      job.completedAt = Date.now();
      slots.running -= 1;
      onJobEnd(job.pluginId);
      releaseJob(job.citizenId);
      archiveJob(job);
      break slot;
    }

    try {
      logger.info(`[Scheduler] Executing ${job.pluginId}.${job.method} for ${job.citizenName} [${job.id}]`);
      const result = await gw(job.method, job.jobParams);
      const r = result as { outputPath?: string; error?: string } | undefined;

      job.status = r?.error ? "failed" : "completed";
      job.error = r?.error;
      job.outputPath = r?.outputPath;
    } catch (err) {
      job.status = "failed";
      job.error = String(err);
    }

    job.completedAt = Date.now();
    const durationSec = ((job.completedAt - (job.startedAt ?? job.completedAt)) / 1000).toFixed(1);
    logger.info(
      `[Scheduler] ${job.id} ${job.status} in ${durationSec}s — ${job.pluginId}`,
    );

    slots.running -= 1;
    onJobEnd(job.pluginId);
    releaseJob(job.citizenId);
    archiveJob(job);
  }

  // After this job finishes, immediately try to drain next
  void drainNext();
}

/** Pick the next job to run from the queue, respecting tier, concurrency, and fairness. */
async function drainNext(): Promise<void> {
  // Try tiers highest-first
  const tierOrder: JobTier[] = ["CRITICAL", "HIGH", "NORMAL"];

  for (const tier of tierOrder) {
    const candidates = queue.filter(
      (j) => j.tier === tier && j.status === "queued",
    );
    if (candidates.length === 0) { continue; }

    // Sort by priority desc, then FIFO
    candidates.sort((a, b) => b.priority - a.priority || a.submittedAt - b.submittedAt);

    for (const job of candidates) {
      const slots = getSlots(job.pluginId);
      if (slots.running >= slots.max) { continue; } // plugin at capacity

      // Trigger warm-up if needed
      const pluginState = getPluginStatus(job.pluginId).state;
      if (pluginState !== "warm" && pluginState !== "busy") {
        job.status = "warming";
        try {
          await ensureWarm(job.pluginId);
          job.status = "queued";
        } catch {
          job.status = "failed";
          job.error = `Plugin ${job.pluginId} failed to warm`;
          job.completedAt = Date.now();
          releaseJob(job.citizenId);
          archiveJob(job);
          // eslint-disable-next-line no-continue
          continue; // try next candidate
        }
      }

      // Dispatch!
      void executeJob(job);
      return; // process one job per drain cycle to avoid starvation
    }
  }
}

/** Main scheduler tick. */
function schedulerTick(): void {
  void drainNext();

  // Pre-warm plugins with deep pending queues
  const pluginIds = new Set(queue.map((j) => j.pluginId));
  for (const pluginId of pluginIds) {
    const depth = queue.filter((j) => j.pluginId === pluginId && j.status === "queued").length;
    considerPreWarm(pluginId, depth);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Initialize the scheduler with a gateway call function.
 * Call once at gateway startup.
 */
export function initScheduler(callGateway: GatewayCallFn): void {
  _callGateway = callGateway;
  if (_tickTimer) { clearInterval(_tickTimer); }
  _tickTimer = setInterval(schedulerTick, SCHEDULER_TICK_MS);
  logger.info("[Scheduler] Production scheduler started");
}

/**
 * Submit a citizen production request to the scheduler.
 *
 * Returns:
 *   - { accepted: true, job } if the job was queued
 *   - { accepted: false, reason } if deferred (backpressure) or denied (token budget)
 */
export function submitProduction(opts: {
  citizenId: string;
  citizenName: string;
  specialization?: string;
  pluginId: string;
  method: string;
  jobParams: Record<string, unknown>;
  priority?: number;
  contentType: string;
  prompt: string;
  callGateway?: GatewayCallFn;
}): { accepted: true; job: ScheduledJob } | { accepted: false; reason: string } {
  const priority = Math.max(1, Math.min(5, opts.priority ?? 3));
  const tier = tierOf(priority);

  // Token budget check
  if (!tryConsume(opts.citizenId, opts.specialization)) {
    return {
      accepted: false,
      reason: `Token budget exhausted for citizen ${opts.citizenId}. Try again later.`,
    };
  }

  // Backpressure check
  const tierDepth = queueDepthForTier(tier);
  const tierMax = TIER_MAX_QUEUE[tier] ?? 200;
  if (tierDepth >= tierMax * BACKPRESSURE_FRACTION) {
    // Immediately refund the token since we're deferring
    releaseJob(opts.citizenId);
    return {
      accepted: false,
      reason: `Queue pressure too high for tier ${tier} (${tierDepth}/${tierMax}). Try again in a moment.`,
    };
  }

  // Fair-share check
  const citizenDepth = citizenDepthInTier(opts.citizenId, tier);
  const fairShareMax = Math.max(1, Math.floor(tierMax * FAIR_SHARE_FRACTION));
  if (citizenDepth >= fairShareMax) {
    releaseJob(opts.citizenId);
    return {
      accepted: false,
      reason: `Fair-share limit reached for citizen ${opts.citizenId} in tier ${tier} (${citizenDepth}/${fairShareMax} slots).`,
    };
  }

  const job: ScheduledJob = {
    id: newId(),
    citizenId: opts.citizenId,
    citizenName: opts.citizenName,
    specialization: opts.specialization,
    pluginId: opts.pluginId,
    method: opts.method,
    jobParams: opts.jobParams,
    tier,
    priority,
    contentType: opts.contentType,
    prompt: opts.prompt,
    status: "queued",
    submittedAt: Date.now(),
    _callGateway: opts.callGateway,
  };

  queue.push(job);
  logger.info(
    `[Scheduler] Queued ${job.id} (${job.pluginId}.${job.method}) tier=${tier} for ${opts.citizenName}`,
  );

  // Proactively pre-warm if plugin is cold and queue growing
  const depth = queue.filter((j) => j.pluginId === opts.pluginId).length;
  considerPreWarm(opts.pluginId, depth);

  // Attempt immediate dispatch (if plugin warm and slot available)
  void drainNext();

  return { accepted: true, job };
}

/**
 * Cancel a queued or warming job.
 */
export function cancelJob(jobId: string): boolean {
  const job = queue.find((j) => j.id === jobId);
  if (!job || job.status === "running") { return false; }
  job.status = "cancelled";
  job.completedAt = Date.now();
  releaseJob(job.citizenId);
  archiveJob(job);
  return true;
}

/**
 * Get a specific job (from queue or recent history).
 */
export function getJob(jobId: string): ScheduledJob | undefined {
  return queue.find((j) => j.id === jobId) ?? history.find((j) => j.id === jobId);
}

/**
 * List all queued + warming jobs, optionally filtered.
 */
export function listQueuedJobs(opts?: {
  citizenId?: string;
  pluginId?: string;
  tier?: JobTier;
  limit?: number;
}): ScheduledJob[] {
  let result = [...queue];
  if (opts?.citizenId) { result = result.filter((j) => j.citizenId === opts.citizenId); }
  if (opts?.pluginId)  { result = result.filter((j) => j.pluginId  === opts.pluginId);  }
  if (opts?.tier)      { result = result.filter((j) => j.tier      === opts.tier);      }
  if (opts?.limit)     { result = result.slice(0, opts.limit); }
  return result;
}

/**
 * Recent completed/failed jobs.
 */
export function listHistory(limit = 50): ScheduledJob[] {
  return history.slice(-limit).toReversed();
}

/**
 * Full scheduler statistics.
 */
export function getSchedulerStats(): {
  queue: { total: number; CRITICAL: number; HIGH: number; NORMAL: number; warming: number };
  slots: Record<string, { running: number; max: number }>;
  plugins: ReturnType<typeof getAllPluginStatuses>;
  budget: ReturnType<typeof getBudgetStats>;
  historySize: number;
} {
  const pluginStatuses = getAllPluginStatuses();
  const slotsObj: Record<string, { running: number; max: number }> = {};
  for (const [pid, s] of pluginSlots.entries()) {
    slotsObj[pid] = { running: s.running, max: s.max };
  }
  return {
    queue: {
      total: queue.length,
      CRITICAL: queueDepthForTier("CRITICAL"),
      HIGH: queueDepthForTier("HIGH"),
      NORMAL: queueDepthForTier("NORMAL"),
      warming: queue.filter((j) => j.status === "warming").length,
    },
    slots: slotsObj,
    plugins: pluginStatuses,
    budget: getBudgetStats(),
    historySize: history.length,
  };
}

/**
 * Estimated wait time in seconds for a new job on a given plugin/tier.
 */
export function estimateWaitSec(pluginId: string, tier: JobTier): number {
  const depth = queue.filter(
    (j) => j.pluginId === pluginId && (j.tier === tier || tier === "CRITICAL"),
  ).length;
  const pStatus = getPluginStatus(pluginId);
  const coldStartPenalty = pStatus.state === "cold" || pStatus.state === "evicted" ? 60 : 0;
  // rough: assume average 30s per job, concurrency reduces wait
  const slots = PLUGIN_CONCURRENCY[pluginId] ?? DEFAULT_CONCURRENCY;
  return Math.max(0, Math.ceil((depth / slots) * 30) + coldStartPenalty);
}
