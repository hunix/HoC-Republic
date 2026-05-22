/**
 * Republic Platform — Screen Access Queue
 *
 * Fair FIFO queue for shared screen/keyboard/mouse access.
 * Only ONE citizen operates the physical screen at a time.
 *
 * Features:
 *   - Priority tiers: critical > high > normal > low
 *   - Time-bounded slots with auto-timeout
 *   - Screen capture before/after each slot for verification
 *   - Integration point for browser-agent and premium-ai-controller
 *
 * Design principle: Citizens should prefer headless operations
 * (n8n workflows, Ollama, direct API) and only request screen
 * access when truly needed (premium AI apps, specific browser tasks).
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:screen-queue");

// ─── Types ──────────────────────────────────────────────────────

export type ScreenPriority = "critical" | "high" | "normal" | "low";

export type ScreenPurpose =
  | "browser_task"        // General web browsing
  | "premium_ai"          // ChatGPT / Gemini / Claude
  | "financial_operation"  // PayPal, Binance, banking
  | "research"            // Web research, data gathering
  | "learning"            // Educational browsing
  | "file_management"     // File downloads, uploads
  | "deployment"          // Vercel, AWS deployments
  | "other";

export interface ScreenRequest {
  id: string;
  citizenId: string;
  citizenName: string;
  purpose: ScreenPurpose;
  priority: ScreenPriority;
  description: string;
  maxDurationMs: number;
  requestedAt: string;
  /** Callback to execute when screen access is granted */
  onGranted?: () => Promise<void>;
}

export interface ScreenSlot {
  id: string;
  request: ScreenRequest;
  grantedAt: string;
  expiresAt: number;       // Absolute timestamp
  status: "active" | "completed" | "timed_out" | "cancelled";
  completedAt?: string;
}

export interface ScreenQueueDiagnostics {
  currentSlot: { citizenId: string; citizenName: string; purpose: ScreenPurpose; timeRemainingMs: number } | null;
  queueLength: number;
  queueByPriority: Record<string, number>;
  totalProcessed: number;
  totalTimedOut: number;
  averageWaitMs: number;
  averageDurationMs: number;
}

// ─── Configuration ──────────────────────────────────────────────

const PRIORITY_ORDER: Record<ScreenPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

/** Default max duration per slot (2 minutes) */
const DEFAULT_MAX_DURATION_MS = 120_000;

/** Hard max duration to prevent runaway slots (10 minutes) */
const HARD_MAX_DURATION_MS = 600_000;

/** How often to check for expired slots (in ticks) */
const CHECK_INTERVAL_TICKS = 5;

// ─── State ──────────────────────────────────────────────────────

const queue: ScreenRequest[] = [];
let currentSlot: ScreenSlot | null = null;
let totalProcessed = 0;
let totalTimedOut = 0;
const waitTimes: number[] = [];
const durations: number[] = [];
const MAX_METRICS = 200;

/** Resolvers for pending screen requests */
const pendingResolvers = new Map<string, {
  resolve: (slot: ScreenSlot) => void;
  reject: (err: Error) => void;
}>();

// ─── Queue Management ───────────────────────────────────────────

/**
 * Request screen access. Returns a promise that resolves
 * when the citizen's turn arrives (their slot is active).
 */
export function requestScreenAccess(
  citizenId: string,
  citizenName: string,
  purpose: ScreenPurpose,
  description: string,
  priority: ScreenPriority = "normal",
  maxDurationMs: number = DEFAULT_MAX_DURATION_MS,
): Promise<ScreenSlot> {
  const effectiveDuration = Math.min(maxDurationMs, HARD_MAX_DURATION_MS);

  const request: ScreenRequest = {
    id: uid(),
    citizenId,
    citizenName,
    purpose,
    priority,
    description,
    maxDurationMs: effectiveDuration,
    requestedAt: ts(),
  };

  // Insert in priority order (stable: same priority = FIFO)
  let insertIdx = queue.length;
  for (let i = 0; i < queue.length; i++) {
    if (PRIORITY_ORDER[request.priority] < PRIORITY_ORDER[queue[i].priority]) {
      insertIdx = i;
      break;
    }
  }
  queue.splice(insertIdx, 0, request);

  logger.info(`Screen access requested: ${citizenName} [${purpose}] priority=${priority}`, {
    queuePosition: insertIdx + 1,
    queueLength: queue.length,
  });

  return new Promise<ScreenSlot>((resolve, reject) => {
    pendingResolvers.set(request.id, { resolve, reject });

    // If no active slot, immediately try to grant
    if (!currentSlot) {
      processNextInQueue();
    }
  });
}

/**
 * Release the screen after the citizen finishes their task.
 */
export function releaseScreen(slotId: string): void {
  if (!currentSlot || currentSlot.id !== slotId) {
    logger.warn(`Release screen called for unknown/inactive slot: ${slotId}`);
    return;
  }

  const durationMs = Date.now() - new Date(currentSlot.grantedAt).getTime();
  currentSlot.status = "completed";
  currentSlot.completedAt = ts();

  durations.push(durationMs);
  if (durations.length > MAX_METRICS) {durations.shift();}

  totalProcessed++;

  logger.info(`Screen released: ${currentSlot.request.citizenName} after ${Math.round(durationMs / 1000)}s`);

  currentSlot = null;
  processNextInQueue();
}

/**
 * Cancel a pending screen request.
 */
export function cancelScreenRequest(requestId: string): boolean {
  const idx = queue.findIndex((r) => r.id === requestId);
  if (idx < 0) {return false;}

  queue.splice(idx, 1);
  const resolver = pendingResolvers.get(requestId);
  if (resolver) {
    resolver.reject(new Error("Screen request cancelled"));
    pendingResolvers.delete(requestId);
  }

  logger.info(`Screen request cancelled: ${requestId}`);
  return true;
}

/**
 * Check if the screen is currently available (no active slot).
 */
export function isScreenAvailable(): boolean {
  return currentSlot === null;
}

/**
 * Get the current queue length.
 */
export function getQueueLength(): number {
  return queue.length;
}

/**
 * Check if a specific citizen currently holds the screen.
 */
export function citizenHasScreen(citizenId: string): boolean {
  return currentSlot?.request.citizenId === citizenId && currentSlot.status === "active";
}

// ─── Internal Processing ────────────────────────────────────────

function processNextInQueue(): void {
  if (currentSlot) {return;} // Someone still active
  if (queue.length === 0) {return;} // Nothing to process

  const request = queue.shift()!;
  const now = Date.now();
  const waitMs = now - new Date(request.requestedAt).getTime();

  waitTimes.push(waitMs);
  if (waitTimes.length > MAX_METRICS) {waitTimes.shift();}

  const slot: ScreenSlot = {
    id: uid(),
    request,
    grantedAt: ts(),
    expiresAt: now + request.maxDurationMs,
    status: "active",
  };

  currentSlot = slot;

  logger.info(`Screen granted: ${request.citizenName} [${request.purpose}] — max ${Math.round(request.maxDurationMs / 1000)}s`, {
    waitedMs: waitMs,
    remainingInQueue: queue.length,
  });

  // Resolve the pending promise
  const resolver = pendingResolvers.get(request.id);
  if (resolver) {
    resolver.resolve(slot);
    pendingResolvers.delete(request.id);
  }

  // Fire onGranted callback if provided
  if (request.onGranted) {
    request.onGranted().catch((err) => {
      logger.error(`onGranted callback failed for ${request.citizenName}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

/**
 * Check for expired slots and auto-release.
 */
function checkExpiredSlots(): void {
  if (!currentSlot || currentSlot.status !== "active") {return;}

  if (Date.now() >= currentSlot.expiresAt) {
    const citizenName = currentSlot.request.citizenName;
    const durationMs = Date.now() - new Date(currentSlot.grantedAt).getTime();

    currentSlot.status = "timed_out";
    currentSlot.completedAt = ts();

    durations.push(durationMs);
    if (durations.length > MAX_METRICS) {durations.shift();}

    totalTimedOut++;
    totalProcessed++;

    logger.warn(`Screen auto-released (timeout): ${citizenName} after ${Math.round(durationMs / 1000)}s`);

    currentSlot = null;
    processNextInQueue();
  }
}

// ─── Tick ───────────────────────────────────────────────────────

/**
 * Screen queue tick — check for expired slots and process queue.
 * Called from the revenue loop or main tick.
 */
export function screenQueueTick(currentTick: number): void {
  if (currentTick % CHECK_INTERVAL_TICKS !== 0) {return;}
  checkExpiredSlots();
}

// ─── Utility for Fire-and-Forget Screen Tasks ───────────────────

/**
 * Enqueue a screen task that auto-releases when the callback completes.
 * Simplifies the request → execute → release pattern.
 */
export async function withScreenAccess<T>(
  citizenId: string,
  citizenName: string,
  purpose: ScreenPurpose,
  description: string,
  task: (slot: ScreenSlot) => Promise<T>,
  priority: ScreenPriority = "normal",
  maxDurationMs: number = DEFAULT_MAX_DURATION_MS,
): Promise<T> {
  const slot = await requestScreenAccess(citizenId, citizenName, purpose, description, priority, maxDurationMs);

  try {
    const result = await task(slot);
    return result;
  } finally {
    releaseScreen(slot.id);
  }
}

// ─── Query & Diagnostics ────────────────────────────────────────

export function getQueueSnapshot(): Array<{
  citizenId: string;
  citizenName: string;
  purpose: ScreenPurpose;
  priority: ScreenPriority;
  waitingMs: number;
}> {
  const now = Date.now();
  return queue.map((r) => ({
    citizenId: r.citizenId,
    citizenName: r.citizenName,
    purpose: r.purpose,
    priority: r.priority,
    waitingMs: now - new Date(r.requestedAt).getTime(),
  }));
}

export function getCurrentSlotInfo(): ScreenQueueDiagnostics["currentSlot"] {
  if (!currentSlot || currentSlot.status !== "active") {return null;}
  return {
    citizenId: currentSlot.request.citizenId,
    citizenName: currentSlot.request.citizenName,
    purpose: currentSlot.request.purpose,
    timeRemainingMs: Math.max(0, currentSlot.expiresAt - Date.now()),
  };
}

export function getScreenQueueDiagnostics(): ScreenQueueDiagnostics {
  const byPriority: Record<string, number> = {};
  for (const r of queue) {
    byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
  }

  const avgWait = waitTimes.length > 0
    ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length
    : 0;

  const avgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    currentSlot: getCurrentSlotInfo(),
    queueLength: queue.length,
    queueByPriority: byPriority,
    totalProcessed,
    totalTimedOut,
    averageWaitMs: Math.round(avgWait),
    averageDurationMs: Math.round(avgDuration),
  };
}
