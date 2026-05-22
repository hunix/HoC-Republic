/**
 * Republic Platform — Prompt Queue
 *
 * Centralized priority queue for all LLM inference requests.
 * ClawRouter enqueues prompts here; the queue scheduler dispatches them
 * to the appropriate model tier based on citizen access level.
 *
 * Features:
 *   - Priority levels: critical > high > normal > low
 *   - Per-citizen queuing with position tracking
 *   - Concurrency control per tier
 *   - Daily cost budget enforcement
 *   - Deduplication within a time window
 *   - Backpressure for lower-tier citizens when queue is full
 *   - Metrics and diagnostics
 */

import { uid } from "./utils.js";
import { toToon, wrapPromptData } from "./toon-serializer.js";

export { toToon, wrapPromptData };

// ─── Types ──────────────────────────────────────────────────────

export type PromptPriority = "critical" | "high" | "normal" | "low";

export type CitizenAccessTier = "basic" | "skilled" | "expert" | "orchestrator";

export interface QueuedPrompt {
  /** Unique ID */
  id: string;
  /** Citizen who submitted this prompt */
  citizenId: string;
  /** Citizen's access tier (determines priority and model access) */
  accessTier: CitizenAccessTier;
  /** Queue priority derived from access tier */
  priority: PromptPriority;
  /** The prompt text */
  prompt: string;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Target model tier */
  targetTier: "bitnet" | "local" | "cheap" | "standard" | "premium";
  /** Max output tokens */
  maxTokens: number;
  /** When this was enqueued */
  enqueuedAt: number;
  /** Estimated cost in credits */
  costEstimate: number;
  /** Tool/action name for context */
  toolName?: string;
  /** Specialization of the citizen */
  specialization?: string;
}

export interface QueueResult {
  /** The response text */
  response: string;
  /** Which model handled the request */
  modelId: string;
  /** Actual cost in credits */
  actualCost: number;
  /** Time in queue before processing started (ms) */
  queueWaitMs: number;
  /** Total processing time (ms) */
  processingMs: number;
  /** Whether this was a cached/deduped result */
  cached: boolean;
}

export interface QueueStats {
  /** Current queue depth per priority */
  depthByPriority: Record<PromptPriority, number>;
  /** Active inferences per tier */
  activeByTier: Record<string, number>;
  /** Total prompts processed today */
  processedToday: number;
  /** Total cost today */
  costToday: number;
  /** Daily budget remaining */
  budgetRemaining: number;
  /** Average wait time (ms) */
  avgWaitMs: number;
  /** Deduplication hits */
  dedupHits: number;
  /** Rejected (over budget) */
  rejected: number;
}

// ─── Configuration ──────────────────────────────────────────────

/** Max concurrent inferences per tier */
const MAX_CONCURRENT: Record<string, number> = {
  bitnet: 32,    // 1-bit models are ultra-fast, highly parallelizable
  local: 16,     // Ollama/LM Studio — limited by GPU memory
  cheap: 8,      // Cheap cloud models
  standard: 4,   // Standard cloud models
  premium: 2,    // Premium cloud models — expensive, limited
};

/** Daily cost budget in credits (default $5 equivalent) */
let dailyBudget = parseFloat(process.env.DAILY_CLOUD_BUDGET ?? "500");

/** Dedup window in milliseconds */
const DEDUP_WINDOW_MS = 60_000;

/** Max queue depth before rejecting low-priority requests */
const MAX_QUEUE_DEPTH = 200;

/** Maximum prompts per citizen to prevent monopolization */
const MAX_PER_CITIZEN = 3;

/** Stale prompt timeout — reject prompts waiting longer than this (ms) */
const STALE_PROMPT_TIMEOUT_MS = 60_000;

/** Max entries in the dedup LRU cache before eviction */
const MAX_DEDUP_ENTRIES = 500;

// ─── State ──────────────────────────────────────────────────────

/** Priority queue — sorted by priority then enqueue time */
const queue: QueuedPrompt[] = [];

/** Currently active inferences per tier */
const activeByTier: Record<string, number> = {};

/** Recent prompt hashes for deduplication */
const recentPrompts = new Map<string, { result: QueueResult; expiresAt: number }>();

/** Daily stats — reset at midnight */
let todayStats = {
  processedCount: 0,
  totalCost: 0,
  totalWaitMs: 0,
  dedupHits: 0,
  rejected: 0,
  date: new Date().toDateString(),
};

/** Pending resolvers for queued prompts */
const pendingResolvers = new Map<string, {
  resolve: (result: QueueResult) => void;
  reject: (err: Error) => void;
}>();

// ─── Priority Ordering ──────────────────────────────────────────

const PRIORITY_ORDER: Record<PromptPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Map citizen access tier to default priority */
export function accessTierToPriority(tier: CitizenAccessTier): PromptPriority {
  switch (tier) {
    case "orchestrator": return "critical";
    case "expert": return "high";
    case "skilled": return "normal";
    case "basic": return "low";
  }
}

// ─── Core Queue API ─────────────────────────────────────────────

/**
 * Enqueue a prompt for processing.
 * Returns a promise that resolves when the prompt has been processed.
 */
export function enqueuePrompt(req: Omit<QueuedPrompt, "id" | "enqueuedAt">): Promise<QueueResult> {
  // Reset daily stats if new day
  checkDayRollover();

  const prompt: QueuedPrompt = {
    ...req,
    id: uid(),
    enqueuedAt: Date.now(),
  };

  // Check dedup
  const dedupKey = hashPrompt(prompt.prompt, prompt.systemPrompt);
  const cached = recentPrompts.get(dedupKey);
  if (cached && cached.expiresAt > Date.now()) {
    todayStats.dedupHits++;
    return Promise.resolve({ ...cached.result, cached: true, queueWaitMs: 0 });
  }

  // Check budget (only for cloud tiers)
  const isCloud = prompt.targetTier === "cheap" || prompt.targetTier === "standard" || prompt.targetTier === "premium";
  if (isCloud && todayStats.totalCost >= dailyBudget && prompt.priority !== "critical") {
    todayStats.rejected++;
    return Promise.reject(new Error(
      `Daily cloud budget exhausted ($${dailyBudget}). ` +
      `${todayStats.totalCost.toFixed(2)} spent today. ` +
      `Queue rejected non-critical prompt from ${prompt.citizenId}.`,
    ));
  }

  // Check queue depth — reject low priority if full
  if (queue.length >= MAX_QUEUE_DEPTH && (prompt.priority === "low" || prompt.priority === "normal")) {
    todayStats.rejected++;
    return Promise.reject(new Error(
      `Queue full (${queue.length}/${MAX_QUEUE_DEPTH}). Low-priority prompt rejected.`,
    ));
  }

  // Check per-citizen cap — prevent one citizen from monopolizing the queue
  const citizenQueued = queue.filter((p) => p.citizenId === prompt.citizenId).length;
  if (citizenQueued >= MAX_PER_CITIZEN) {
    todayStats.rejected++;
    return Promise.reject(new Error(
      `Citizen "${prompt.citizenId}" already has ${citizenQueued} prompts queued (max ${MAX_PER_CITIZEN}). ` +
      `Wait for current prompts to complete.`,
    ));
  }

  // Insert into priority queue (sorted position)
  insertSorted(prompt);

  // Return a promise that resolves when the prompt is processed
  return new Promise<QueueResult>((resolve, reject) => {
    pendingResolvers.set(prompt.id, { resolve, reject });
    // Kick the scheduler
    scheduleNext();
  });
}

/**
 * Insert a prompt into the queue in sorted order.
 */
function insertSorted(prompt: QueuedPrompt): void {
  const prio = PRIORITY_ORDER[prompt.priority];
  let insertIdx = queue.length;

  for (let i = 0; i < queue.length; i++) {
    const existingPrio = PRIORITY_ORDER[queue[i].priority];
    if (prio < existingPrio || (prio === existingPrio && prompt.enqueuedAt < queue[i].enqueuedAt)) {
      insertIdx = i;
      break;
    }
  }

  queue.splice(insertIdx, 0, prompt);
}

// ─── Scheduler ──────────────────────────────────────────────────

/** Dispatch callback — set by ClawRouter bridge to handle actual inference */
let dispatchFn: ((prompt: QueuedPrompt) => Promise<QueueResult>) | null = null;

/**
 * Register the dispatch function that handles actual inference.
 * Called by the ClawRouter bridge during initialization.
 */
export function registerDispatcher(fn: (prompt: QueuedPrompt) => Promise<QueueResult>): void {
  dispatchFn = fn;
}

/**
 * Try to dispatch the next prompt(s) from the queue.
 */
function scheduleNext(): void {
  if (!dispatchFn) {return;}

  while (queue.length > 0) {
    const next = queue[0];
    const tier = next.targetTier;
    const active = activeByTier[tier] ?? 0;
    const maxConc = MAX_CONCURRENT[tier] ?? 4;

    if (active >= maxConc) {break;} // Tier is at capacity

    // Remove from queue and dispatch
    queue.shift();

    const startTime = Date.now();
    const queueWaitMs = startTime - next.enqueuedAt;

    // Stale prompt rejection — don't waste inference on long-stale requests
    if (queueWaitMs > STALE_PROMPT_TIMEOUT_MS) {
      const resolver = pendingResolvers.get(next.id);
      if (resolver) {
        resolver.reject(new Error(
          `Prompt stale: waited ${Math.round(queueWaitMs / 1000)}s (max ${STALE_PROMPT_TIMEOUT_MS / 1000}s)`,
        ));
        pendingResolvers.delete(next.id);
      }
      todayStats.rejected++;
      continue; // Skip dispatch, try next prompt
    }

    activeByTier[tier] = active + 1;

    dispatchFn(next)
      .then((result) => {
        // Update stats
        result.queueWaitMs = queueWaitMs;
        todayStats.processedCount++;
        todayStats.totalCost += result.actualCost;
        todayStats.totalWaitMs += queueWaitMs;

        // Cache for dedup
        const dedupKey = hashPrompt(next.prompt, next.systemPrompt);
        recentPrompts.set(dedupKey, {
          result,
          expiresAt: Date.now() + DEDUP_WINDOW_MS,
        });

        // Resolve the promise
        const resolver = pendingResolvers.get(next.id);
        if (resolver) {
          resolver.resolve(result);
          pendingResolvers.delete(next.id);
        }
      })
      .catch((err) => {
        const resolver = pendingResolvers.get(next.id);
        if (resolver) {
          resolver.reject(err instanceof Error ? err : new Error(String(err)));
          pendingResolvers.delete(next.id);
        }
      })
      .finally(() => {
        activeByTier[tier] = Math.max(0, (activeByTier[tier] ?? 1) - 1);
        // Try to dispatch more
        scheduleNext();
      });
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function hashPrompt(prompt: string, systemPrompt?: string): string {
  // Simple hash for dedup (first 200 chars + system prompt hash)
  const input = `${systemPrompt ?? ""}::${prompt.slice(0, 200)}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return `p:${hash.toString(36)}`;
}

function checkDayRollover(): void {
  const today = new Date().toDateString();
  if (todayStats.date !== today) {
    todayStats = {
      processedCount: 0,
      totalCost: 0,
      totalWaitMs: 0,
      dedupHits: 0,
      rejected: 0,
      date: today,
    };
  }

  // Clean expired dedup entries
  const now = Date.now();
  for (const [key, entry] of recentPrompts) {
    if (entry.expiresAt < now) {recentPrompts.delete(key);}
  }

  // LRU eviction: if dedup map exceeds cap, remove oldest entries
  if (recentPrompts.size > MAX_DEDUP_ENTRIES) {
    const excess = recentPrompts.size - MAX_DEDUP_ENTRIES;
    const iter = recentPrompts.keys();
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value;
      if (key !== undefined) {recentPrompts.delete(key);}
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get current queue position for a citizen.
 */
export function getCitizenQueuePosition(citizenId: string): number {
  return queue.findIndex((p) => p.citizenId === citizenId);
}

/**
 * Get the number of prompts queued for a citizen.
 */
export function getCitizenQueuedCount(citizenId: string): number {
  return queue.filter((p) => p.citizenId === citizenId).length;
}

/**
 * Set daily cloud budget.
 */
export function setDailyBudget(budget: number): void {
  dailyBudget = budget;
}

/**
 * Get queue statistics.
 */
export function getQueueStats(): QueueStats {
  checkDayRollover();

  const depthByPriority: Record<PromptPriority, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };

  for (const p of queue) {
    depthByPriority[p.priority]++;
  }

  return {
    depthByPriority,
    activeByTier: { ...activeByTier },
    processedToday: todayStats.processedCount,
    costToday: todayStats.totalCost,
    budgetRemaining: Math.max(0, dailyBudget - todayStats.totalCost),
    avgWaitMs: todayStats.processedCount > 0
      ? Math.round(todayStats.totalWaitMs / todayStats.processedCount)
      : 0,
    dedupHits: todayStats.dedupHits,
    rejected: todayStats.rejected,
  };
}

/**
 * Get queue depth (total items waiting).
 */
export function getQueueDepth(): number {
  return queue.length;
}

/**
 * Drain the queue — reject all pending prompts.
 * Used during shutdown.
 */
export function drainQueue(): void {
  for (const p of queue) {
    const resolver = pendingResolvers.get(p.id);
    if (resolver) {
      resolver.reject(new Error("Queue drained during shutdown"));
      pendingResolvers.delete(p.id);
    }
  }
  queue.length = 0;
}
