/**
 * Republic Platform — Hardware Resource Manager
 *
 * Intelligent admission controller and lifecycle manager for all
 * resource-intensive features: local LLM engines (BitNet, Ollama, LM Studio),
 * plugins, and citizen-driven compute.
 *
 * Core capabilities:
 *   1. Hardware Survey    — Boot-time CPU/RAM/VRAM probe + live refresh
 *   2. Resource Registry  — Each feature declares its RAM/VRAM/CPU profile
 *   3. Admission Control  — Grant / deny / queue allocation requests
 *   4. Lifecycle Manager  — Start / stop / preempt features automatically
 *   5. Priority Queue     — Citizens < Plugins < System < Critical tiers
 *   6. Live Dashboard     — Real-time resource accounting for the UI
 *
 * Integration:
 *   - Consumes: infra-control-plane.ts (probeSystemResources, GPUDevice)
 *   - Consumed by: hoc-plugin-manager.ts (activation check), bitnet-engine.ts,
 *                  agent-runtime.ts, gateway routes (republic.hardware.*)
 */

import { EventEmitter } from "node:events";
import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  type GPUDevice,
  type SystemResources,
  probeSystemResources,
} from "./infra-control-plane.js";

const logger = createSubsystemLogger("hardware-manager");

// ═══════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════

/** Resource priority tier — higher = more important */
export type ResourcePriority = "background" | "citizen" | "plugin" | "system" | "critical";

const PRIORITY_RANK: Record<ResourcePriority, number> = {
  background: 0,
  citizen: 1,
  plugin: 2,
  system: 3,
  critical: 4,
};

/** Resource profile declared by a feature at registration time */
export interface ResourceProfile {
  /** Display name for dashboards */
  name: string;
  /** Category for grouping */
  category: "llm" | "plugin" | "agent" | "infra" | "other";
  /** RAM needed while active (GB) */
  ramGB: number;
  /** VRAM needed while active (GB, 0 = CPU-only) */
  vramGB: number;
  /** Fraction of logical CPU cores consumed (0–1) */
  cpuFraction: number;
  /** Priority for preemption decisions */
  priority: ResourcePriority;
  /** If true, resource manager can stop this feature when memory is low */
  preemptible: boolean;
  /** Optional: function to call when the manager needs to free resources */
  onEvict?: () => Promise<void> | void;
  /** Optional: minimum required RAM — if even this can't be met, deny */
  minRamGB?: number;
  /** Optional: minimum required VRAM */
  minVramGB?: number;
}

/** State of a registered resource slot */
export type AllocationStatus =
  | "queued" // waiting for enough resources
  | "granted" // resources reserved and active
  | "denied" // couldn't fit even at minimum requirements
  | "evicted" // was running, forced to stop
  | "released"; // voluntarily released

/** A resource allocation slot */
export interface ResourceAllocation {
  id: string;
  featureId: string;
  profile: ResourceProfile;
  status: AllocationStatus;
  /** When the slot entered its current status */
  statusAt: number;
  /** Actually reserved RAM (GB) — may be lower than profile.ramGB */
  reservedRamGB: number;
  reservedVramGB: number;
  reservedCpuFraction: number;
  /** Position in queue (only relevant when status = 'queued') */
  queuePosition?: number;
  /** Reason for denial or eviction */
  reason?: string;
}

/** Snapshot of current hardware utilisation */
export interface HardwareSnapshot {
  survey: SystemResources | null;
  surveyedAt: number;
  /** Capacity from OS probe */
  capacity: {
    ramTotalGB: number;
    ramFreeGB: number;
    vramTotalGB: number;
    cpuCores: number;
    gpus: GPUDevice[];
  };
  /** How much is actually allocated to active features */
  allocated: {
    ramGB: number;
    vramGB: number;
    cpuFraction: number;
  };
  /** What's actually available to new allocations */
  available: {
    ramGB: number;
    vramGB: number;
    cpuFraction: number;
  };
  /** All current allocations (granted + queued) */
  allocations: ResourceAllocation[];
  /** Number queued waiting for resources */
  queueDepth: number;
  /** Overall pressure level */
  pressure: "low" | "moderate" | "high" | "critical";
}

// ═══════════════════════════════════════════════════════════════════
//  HARDWARE SURVEY
// ═══════════════════════════════════════════════════════════════════

/**
 * Configurable headroom: always keep this much RAM free for the OS
 * and gateway itself, preventing swap thrashing.
 */
const OS_RAM_HEADROOM_GB = 1.5;
const OS_VRAM_HEADROOM_GB = 0.5;
const MAX_CPU_FRACTION = 0.85; // Keep 15% for OS + gateway

let latestSurvey: SystemResources | null = null;
let surveyedAt = 0;
/** Last free RAM value that was logged — only re-log when delta ≥ 1 GB */
let lastLoggedFreeRam = -1;

// RAM pressure alert thresholds
const RAM_WARN_THRESHOLD_GB = 20; // Warn when free RAM < 20 GB
const RAM_CRITICAL_THRESHOLD_GB = 8; // Block new model admits when free RAM < 8 GB
const RAM_HYSTERESIS_GB = 2; // Threshold + 2 GB headroom before clearing alert

/** Tracks which alert tiers are currently active (edge-triggered, non-repeating) */
const _activeRamAlerts = new Set<"warn" | "critical">();

/** Force a hardware re-survey. Called at boot and on demand. */
export async function surveyHardware(): Promise<SystemResources> {
  try {
    const resources = await probeSystemResources(true);
    latestSurvey = resources;
    surveyedAt = Date.now();
    // Only log when free RAM changes by ≥1 GB (or on first boot)
    const freeRamDelta = Math.abs(resources.ramFreeGB - lastLoggedFreeRam);
    if (lastLoggedFreeRam < 0 || freeRamDelta >= 1) {
      lastLoggedFreeRam = resources.ramFreeGB;
      logger.info(
        `Hardware survey: ${resources.cpuCores} cores, ` +
          `${resources.ramTotalGB} GB RAM (${resources.ramFreeGB} GB free), ` +
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-template-expression
          `${resources.vramGB > 0 ? `${resources.vramGB} GB VRAM, ` : "no GPU, "}` +
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-template-expression
          `${resources.gpuName ?? "CPU-only"}`,
      );
    }
    emitEvent("surveyed", { resources });
    return resources;
  } catch (err) {
    logger.warn(`Hardware survey failed: ${err instanceof Error ? err.message : String(err)}`);
    // Return a safe fallback
    return (
      latestSurvey ?? {
        cpuCores: 4,
        cpuModel: "Unknown CPU",
        ramTotalGB: 8,
        ramFreeGB: 4,
        vramGB: 0,
        diskFreeGB: 50,
        os: "windows",
        arch: "x64",
        gpuName: null,
        gpuDriver: null,
        gpuComputeAvailable: false,
        gpus: [],
        probedAt: new Date().toISOString(),
      }
    );
  }
}

/** Get latest survey (may be stale — use surveyHardware() for fresh data) */
export function getLatestSurvey(): SystemResources | null {
  return latestSurvey;
}

/** Get detected VRAM in GB (convenience helper for other modules). Returns 0 if unknown. */
export function getDetectedVramGB(): number {
  return latestSurvey?.vramGB ?? 0;
}

// ═══════════════════════════════════════════════════════════════════
//  RESOURCE REGISTRY
// ═══════════════════════════════════════════════════════════════════

/** Registered feature profiles */
const featureRegistry = new Map<string, ResourceProfile>();

/** Active allocation slots */
const allocations = new Map<string, ResourceAllocation>();

/** Waiting queue (ordered by priority then arrival time) */
const waitQueue: string[] = []; // allocation IDs, ordered

let nextAllocId = 1;

/**
 * Register a feature's resource profile.
 * Must be called before requestResources().
 */
export function registerFeature(featureId: string, profile: ResourceProfile): void {
  featureRegistry.set(featureId, profile);
  logger.info(
    `Feature registered: ${featureId} (${profile.category}) ` +
      `RAM=${profile.ramGB}GB VRAM=${profile.vramGB}GB CPU=${(profile.cpuFraction * 100).toFixed(0)}% ` +
      `priority=${profile.priority} preemptible=${profile.preemptible}`,
  );
}

/**
 * Unregister a feature (also releases any active allocation).
 */
export async function unregisterFeature(featureId: string): Promise<void> {
  featureRegistry.delete(featureId);
  await releaseResources(featureId);
}

// ═══════════════════════════════════════════════════════════════════
//  RESOURCE ACCOUNTING
// ═══════════════════════════════════════════════════════════════════

/** Compute total currently allocated resources from granted slots */
function getGrantedTotals(): { ramGB: number; vramGB: number; cpuFraction: number } {
  let ramGB = 0;
  let vramGB = 0;
  let cpuFraction = 0;
  for (const alloc of allocations.values()) {
    if (alloc.status === "granted") {
      ramGB += alloc.reservedRamGB;
      vramGB += alloc.reservedVramGB;
      cpuFraction += alloc.reservedCpuFraction;
    }
  }
  return { ramGB, vramGB, cpuFraction };
}

/** Compute what's available given current survey + granted allocations */
function computeAvailable(): {
  ramGB: number;
  vramGB: number;
  cpuFraction: number;
} {
  const survey = latestSurvey;
  if (!survey) {
    return { ramGB: 2, vramGB: 0, cpuFraction: 0.5 };
  }
  const granted = getGrantedTotals();
  // Use free RAM from OS, minus OS headroom, minus what's already granted
  const ramAvailable = Math.max(0, survey.ramFreeGB - OS_RAM_HEADROOM_GB - granted.ramGB);
  const vramAvailable = Math.max(0, survey.vramGB - OS_VRAM_HEADROOM_GB - granted.vramGB);
  const cpuAvailable = Math.max(0, MAX_CPU_FRACTION - granted.cpuFraction);
  return {
    ramGB: parseFloat(ramAvailable.toFixed(2)),
    vramGB: parseFloat(vramAvailable.toFixed(2)),
    cpuFraction: parseFloat(cpuAvailable.toFixed(3)),
  };
}

/** Determine pressure level from available resources */
function computePressure(
  available: ReturnType<typeof computeAvailable>,
): HardwareSnapshot["pressure"] {
  const survey = latestSurvey;
  if (!survey) {
    return "moderate";
  }
  const ramPct = available.ramGB / (survey.ramFreeGB || 1);
  if (ramPct < 0.05) {
    return "critical";
  }
  if (ramPct < 0.2) {
    return "high";
  }
  if (ramPct < 0.4) {
    return "moderate";
  }
  return "low";
}

// ═══════════════════════════════════════════════════════════════════
//  ADMISSION CONTROL
// ═══════════════════════════════════════════════════════════════════

/**
 * Request resources for a feature.
 *
 * Returns immediately with one of:
 *   - status="granted"  → resources reserved, feature may start
 *   - status="queued"   → not enough resources now, will retry when freed
 *   - status="denied"   → even minimum requirements can't be met
 *
 * The manager may attempt preemption of lower-priority features before
 * returning "queued".
 */
export async function requestResources(
  featureId: string,
  overrideProfile?: Partial<ResourceProfile>,
): Promise<ResourceAllocation> {
  const baseProfile = featureRegistry.get(featureId);
  if (!baseProfile) {
    throw new Error(`Feature "${featureId}" is not registered. Call registerFeature() first.`);
  }

  const profile: ResourceProfile = { ...baseProfile, ...overrideProfile };

  // Ensure we have a fresh-enough survey (max 10s old for admission)
  if (!latestSurvey || Date.now() - surveyedAt > 10_000) {
    await surveyHardware();
  }

  // Check if feature already has a slot
  const existing = findAllocation(featureId);
  if (existing && existing.status === "granted") {
    return existing; // already running
  }

  const id = `alloc-${nextAllocId++}`;
  const available = computeAvailable();

  const minRam = profile.minRamGB ?? profile.ramGB * 0.7;
  const minVram = profile.minVramGB ?? profile.vramGB;

  // Hard deny: even minimum requirements can't be met
  if (available.ramGB < minRam) {
    const alloc: ResourceAllocation = {
      id,
      featureId,
      profile,
      status: "denied",
      statusAt: Date.now(),
      reservedRamGB: 0,
      reservedVramGB: 0,
      reservedCpuFraction: 0,
      reason: `Insufficient RAM: need ${minRam.toFixed(1)} GB, only ${available.ramGB.toFixed(1)} GB available`,
    };
    allocations.set(id, alloc);
    logger.warn(`[DENIED] ${featureId}: ${alloc.reason}`);
    emitEvent("denied", { featureId, alloc });
    return alloc;
  }

  if (profile.vramGB > 0 && minVram > 0 && available.vramGB < minVram) {
    // VRAM needed but not available — try preemption first
    const preempted = await tryPreempt(profile);
    if (!preempted) {
      const alloc: ResourceAllocation = {
        id,
        featureId,
        profile,
        status: "denied",
        statusAt: Date.now(),
        reservedRamGB: 0,
        reservedVramGB: 0,
        reservedCpuFraction: 0,
        reason: `Insufficient VRAM: need ${minVram.toFixed(1)} GB, only ${available.vramGB.toFixed(1)} GB available`,
      };
      allocations.set(id, alloc);
      logger.warn(`[DENIED] ${featureId}: ${alloc.reason}`);
      emitEvent("denied", { featureId, alloc });
      return alloc;
    }
  }

  // Check if we can grant right now
  const canGrant =
    available.ramGB >= profile.ramGB &&
    (profile.vramGB === 0 || computeAvailable().vramGB >= profile.vramGB);

  if (!canGrant) {
    // Try preemption before queuing
    const preempted = await tryPreempt(profile);
    if (!preempted) {
      // Queue it
      const queuePos = waitQueue.length + 1;
      const alloc: ResourceAllocation = {
        id,
        featureId,
        profile,
        status: "queued",
        statusAt: Date.now(),
        reservedRamGB: 0,
        reservedVramGB: 0,
        reservedCpuFraction: 0,
        queuePosition: queuePos,
        reason: `Waiting for ${(profile.ramGB - available.ramGB).toFixed(1)} GB more RAM`,
      };
      allocations.set(id, alloc);
      // Insert into queue in priority order
      insertIntoQueue(id, profile.priority);
      logger.info(`[QUEUED] ${featureId} (pos=${queuePos}): ${alloc.reason}`);
      emitEvent("queued", { featureId, alloc });
      return alloc;
    }
  }

  // Grant!
  const avail = computeAvailable();
  const alloc: ResourceAllocation = {
    id,
    featureId,
    profile,
    status: "granted",
    statusAt: Date.now(),
    reservedRamGB: Math.min(profile.ramGB, avail.ramGB),
    reservedVramGB: Math.min(profile.vramGB, avail.vramGB),
    reservedCpuFraction: Math.min(profile.cpuFraction, avail.cpuFraction),
  };
  allocations.set(id, alloc);
  logger.info(
    `[GRANTED] ${featureId}: RAM=${alloc.reservedRamGB}GB VRAM=${alloc.reservedVramGB}GB ` +
      `CPU=${(alloc.reservedCpuFraction * 100).toFixed(0)}%`,
  );
  emitEvent("granted", { featureId, alloc });
  return alloc;
}

/** Release all allocations for a feature (call when feature stops). */
export async function releaseResources(featureId: string): Promise<void> {
  for (const [id, alloc] of allocations) {
    if (alloc.featureId === featureId) {
      const wasGranted = alloc.status === "granted";
      alloc.status = "released";
      alloc.statusAt = Date.now();
      allocations.set(id, alloc);
      // Remove from queue if queued
      const qi = waitQueue.indexOf(id);
      if (qi !== -1) {
        waitQueue.splice(qi, 1);
      }
      if (wasGranted) {
        logger.info(
          `[RELEASED] ${featureId} — freeing RAM=${alloc.reservedRamGB}GB VRAM=${alloc.reservedVramGB}GB`,
        );
        emitEvent("released", { featureId, alloc });
        // Promote next queued allocation
        await promoteFromQueue();
      }
      break;
    }
  }
}

/** Find the active allocation for a feature (granted or queued). */
export function findAllocation(featureId: string): ResourceAllocation | undefined {
  for (const alloc of allocations.values()) {
    if (
      alloc.featureId === featureId &&
      (alloc.status === "granted" || alloc.status === "queued")
    ) {
      return alloc;
    }
  }
}

/** Check if a feature currently has a granted allocation. */
export function isFeatureGranted(featureId: string): boolean {
  return findAllocation(featureId)?.status === "granted";
}

// ═══════════════════════════════════════════════════════════════════
//  PREEMPTION
// ═══════════════════════════════════════════════════════════════════

/**
 * Attempt to free resources by evicting lower-priority preemptible features.
 * Returns true if enough resources were freed to potentially satisfy the
 * requesting profile.
 */
async function tryPreempt(requestorProfile: ResourceProfile): Promise<boolean> {
  const requestorRank = PRIORITY_RANK[requestorProfile.priority];
  const available = computeAvailable();
  let freedRam = 0;
  let freedVram = 0;

  // Find evictable candidates: lower priority, preemptible, currently granted
  const candidates = Array.from(allocations.values())
    .filter(
      (a) =>
        a.status === "granted" &&
        a.profile.preemptible &&
        PRIORITY_RANK[a.profile.priority] < requestorRank,
    )
    .toSorted((a, b) => PRIORITY_RANK[a.profile.priority] - PRIORITY_RANK[b.profile.priority]);

  for (const victim of candidates) {
    if (
      available.ramGB + freedRam >= requestorProfile.ramGB &&
      (requestorProfile.vramGB === 0 || available.vramGB + freedVram >= requestorProfile.vramGB)
    ) {
      break; // Already have enough, stop evicting
    }

    // Evict the victim
    logger.warn(
      `[PREEMPT] Evicting "${victim.featureId}" (${victim.profile.priority}) ` +
        `to make room for "${requestorProfile.name}" (${requestorProfile.priority})`,
    );

    try {
      if (victim.profile.onEvict) {
        await Promise.race([
          Promise.resolve(victim.profile.onEvict()),
          new Promise<void>((_, rej) => setTimeout(() => rej(new Error("Evict timeout")), 10_000)),
        ]);
      }
    } catch (err) {
      logger.warn(
        `Eviction hook failed for ${victim.featureId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    freedRam += victim.reservedRamGB;
    freedVram += victim.reservedVramGB;

    victim.status = "evicted";
    victim.statusAt = Date.now();
    victim.reason = `Preempted by higher-priority feature: ${requestorProfile.name}`;
    emitEvent("evicted", { featureId: victim.featureId, alloc: victim });
  }

  return (
    available.ramGB + freedRam >= requestorProfile.ramGB &&
    (requestorProfile.vramGB === 0 || available.vramGB + freedVram >= requestorProfile.vramGB)
  );
}

// ═══════════════════════════════════════════════════════════════════
//  QUEUE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════

/** Insert allocation ID into queue maintaining priority order */
function insertIntoQueue(id: string, priority: ResourcePriority): void {
  const rank = PRIORITY_RANK[priority];
  let insertAt = waitQueue.length;
  for (let i = 0; i < waitQueue.length; i++) {
    const other = allocations.get(waitQueue[i]);
    if (other && PRIORITY_RANK[other.profile.priority] < rank) {
      insertAt = i;
      break;
    }
  }
  waitQueue.splice(insertAt, 0, id);
  // Update queue positions
  updateQueuePositions();
}

function updateQueuePositions(): void {
  for (let i = 0; i < waitQueue.length; i++) {
    const alloc = allocations.get(waitQueue[i]);
    if (alloc) {
      alloc.queuePosition = i + 1;
    }
  }
}

/** Attempt to promote the front of the queue whenever resources are freed */
async function promoteFromQueue(): Promise<void> {
  while (waitQueue.length > 0) {
    const id = waitQueue[0];
    const alloc = allocations.get(id);
    if (!alloc || alloc.status !== "queued") {
      waitQueue.shift();
      continue;
    }

    const available = computeAvailable();
    if (available.ramGB < alloc.profile.ramGB) {
      break; // First in queue can't be satisfied yet
    }
    if (alloc.profile.vramGB > 0 && available.vramGB < alloc.profile.vramGB) {
      break;
    }

    // Grant it
    waitQueue.shift();
    updateQueuePositions();
    alloc.status = "granted";
    alloc.statusAt = Date.now();
    alloc.reservedRamGB = Math.min(alloc.profile.ramGB, available.ramGB);
    alloc.reservedVramGB = Math.min(alloc.profile.vramGB, available.vramGB);
    alloc.reservedCpuFraction = Math.min(alloc.profile.cpuFraction, available.cpuFraction);
    delete alloc.queuePosition;
    delete alloc.reason;
    logger.info(
      `[PROMOTED] ${alloc.featureId} from queue → granted (RAM=${alloc.reservedRamGB}GB)`,
    );
    emitEvent("granted", { featureId: alloc.featureId, alloc });
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SNAPSHOT / DASHBOARD
// ═══════════════════════════════════════════════════════════════════

/** Get a full hardware + allocation snapshot for the UI */
export function getHardwareSnapshot(): HardwareSnapshot {
  const survey = latestSurvey;
  const granted = getGrantedTotals();
  const available = computeAvailable();
  const pressure = computePressure(available);

  const activeAllocs = Array.from(allocations.values())
    .filter((a) => a.status === "granted" || a.status === "queued")
    .toSorted((a, b) => {
      if (a.status === "granted" && b.status !== "granted") {
        return -1;
      }
      if (b.status === "granted" && a.status !== "granted") {
        return 1;
      }
      return PRIORITY_RANK[b.profile.priority] - PRIORITY_RANK[a.profile.priority];
    });

  return {
    survey,
    surveyedAt,
    capacity: {
      ramTotalGB: survey?.ramTotalGB ?? 0,
      ramFreeGB: survey?.ramFreeGB ?? 0,
      vramTotalGB: survey?.vramGB ?? 0,
      cpuCores: survey?.cpuCores ?? 0,
      gpus: survey?.gpus ?? [],
    },
    allocated: granted,
    available,
    allocations: activeAllocs,
    queueDepth: waitQueue.length,
    pressure,
  };
}

/**
 * Check if a given resource profile can be satisfied right now
 * without actually allocating.
 */
export async function canFit(
  ramGB: number,
  vramGB: number = 0,
): Promise<{ canFit: boolean; reason?: string }> {
  if (!latestSurvey || Date.now() - surveyedAt > 30_000) {
    await surveyHardware();
  }
  const available = computeAvailable();
  if (available.ramGB < ramGB) {
    return {
      canFit: false,
      reason: `Need ${ramGB}GB RAM but only ${available.ramGB.toFixed(1)}GB available`,
    };
  }
  if (vramGB > 0 && available.vramGB < vramGB) {
    return {
      canFit: false,
      reason: `Need ${vramGB}GB VRAM but only ${available.vramGB.toFixed(1)}GB available`,
    };
  }
  return { canFit: true };
}

// ═══════════════════════════════════════════════════════════════════
//  BACKGROUND MONITOR
// ═══════════════════════════════════════════════════════════════════

let monitorTimer: ReturnType<typeof setInterval> | null = null;

/** Start the background hardware monitor (re-surveys every 60s, re-evaluates queue) */
export function startHardwareMonitor(): void {
  if (monitorTimer) {
    return;
  }

  // Do an immediate boot survey
  surveyHardware()
    .then(async () => {
      // After boot survey, try to promote any pre-registered queued items
      await promoteFromQueue();
    })
    .catch(() => {
      /* non-fatal */
    });

  monitorTimer = setInterval(async () => {
    try {
      await surveyHardware();
      // Re-evaluate queue after fresh survey
      await promoteFromQueue();
      // Log pressure if elevated
      const snap = getHardwareSnapshot();
      if (snap.pressure === "high" || snap.pressure === "critical") {
        logger.warn(
          `Hardware pressure: ${snap.pressure.toUpperCase()} — ` +
            `RAM: ${snap.allocated.ramGB.toFixed(1)}/${snap.capacity.ramTotalGB}GB ` +
            `VRAM: ${snap.allocated.vramGB.toFixed(1)}/${snap.capacity.vramTotalGB}GB ` +
            `queue=${snap.queueDepth}`,
        );
      }
      // Fire threshold-based RAM pressure alerts (edge-triggered)
      checkRamPressureAlerts(snap);
    } catch {
      /* non-fatal */
    }
  }, 60_000);

  logger.info("Hardware monitor started (60s interval)");
}

/** Stop the background monitor */
export function stopHardwareMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    logger.info("Hardware monitor stopped");
  }
}

// ═══════════════════════════════════════════════════════════════════
//  RAM PRESSURE ALERT ENGINE
// ═══════════════════════════════════════════════════════════════════

/**
 * Edge-triggered RAM pressure alerts.
 * Only fires when crossing a threshold for the first time, silences until recovery.
 * Emits:
 *   "ram-warn"     — free RAM < 20 GB   (background model loads should pause)
 *   "ram-critical" — free RAM < 8 GB    (all new model admits blocked)
 *   "ram-recovered-warn"     — RAM recovered above threshold
 *   "ram-recovered-critical" — CRITICAL alert cleared
 */
function checkRamPressureAlerts(snap: HardwareSnapshot): void {
  const freeRam = snap.capacity.ramFreeGB;

  // CRITICAL: < 8 GB
  if (freeRam < RAM_CRITICAL_THRESHOLD_GB) {
    if (!_activeRamAlerts.has("critical")) {
      _activeRamAlerts.add("critical");
      logger.warn(
        `[RAM-CRITICAL] Free RAM ${freeRam.toFixed(1)} GB < ${RAM_CRITICAL_THRESHOLD_GB} GB — ` +
          `blocking new model admits. Total=${snap.capacity.ramTotalGB} GB`,
      );
      emitEvent("ram-critical", {
        freeRamGB: freeRam,
        totalRamGB: snap.capacity.ramTotalGB,
        pressure: snap.pressure,
        message: `Critical: only ${freeRam.toFixed(1)} GB RAM free — new model loads blocked`,
      });
    }
  } else if (
    freeRam >= RAM_CRITICAL_THRESHOLD_GB + RAM_HYSTERESIS_GB &&
    _activeRamAlerts.has("critical")
  ) {
    _activeRamAlerts.delete("critical");
    logger.info(`[RAM-CRITICAL] Cleared — free RAM recovered to ${freeRam.toFixed(1)} GB`);
    emitEvent("ram-recovered-critical", { freeRamGB: freeRam });
  }

  // WARNING: < 20 GB (only if not already in critical)
  if (freeRam < RAM_WARN_THRESHOLD_GB && freeRam >= RAM_CRITICAL_THRESHOLD_GB) {
    if (!_activeRamAlerts.has("warn")) {
      _activeRamAlerts.add("warn");
      logger.warn(
        `[RAM-WARN] Free RAM ${freeRam.toFixed(1)} GB < ${RAM_WARN_THRESHOLD_GB} GB — ` +
          `consider pausing background model loads`,
      );
      emitEvent("ram-warn", {
        freeRamGB: freeRam,
        totalRamGB: snap.capacity.ramTotalGB,
        pressure: snap.pressure,
        message: `Warning: ${freeRam.toFixed(1)} GB RAM free — pause non-critical model loads`,
      });
    }
  } else if (freeRam >= RAM_WARN_THRESHOLD_GB + RAM_HYSTERESIS_GB && _activeRamAlerts.has("warn")) {
    _activeRamAlerts.delete("warn");
    logger.info(`[RAM-WARN] Cleared — free RAM recovered to ${freeRam.toFixed(1)} GB`);
    emitEvent("ram-recovered-warn", { freeRamGB: freeRam });
  }
}

/**
 * Check if new model/plugin admits are blocked due to RAM pressure.
 * The admission controller calls this before granting new LLM slots.
 */
export function isRamCritical(): boolean {
  return _activeRamAlerts.has("critical");
}

/**
 * Current RAM alert state (for UI and health endpoints).
 */
export function getRamAlertState(): { warn: boolean; critical: boolean; freeRamGB: number } {
  return {
    warn: _activeRamAlerts.has("warn"),
    critical: _activeRamAlerts.has("critical"),
    freeRamGB: latestSurvey?.ramFreeGB ?? -1,
  };
}

// ═══════════════════════════════════════════════════════════════════
//  EVENT EMITTER
// ═══════════════════════════════════════════════════════════════════

const hwEmitter = new EventEmitter();

function emitEvent(event: string, payload: Record<string, unknown>): void {
  hwEmitter.emit(event, payload);
  hwEmitter.emit("*", { event, ...payload });
}

export function onHardwareEvent(
  event: string,
  listener: (payload: Record<string, unknown>) => void,
): void {
  hwEmitter.on(event, listener);
}

export function offHardwareEvent(
  event: string,
  listener: (payload: Record<string, unknown>) => void,
): void {
  hwEmitter.off(event, listener);
}

// ═══════════════════════════════════════════════════════════════════
//  BUILT-IN FEATURE PROFILES
// ═══════════════════════════════════════════════════════════════════

/**
 * Pre-register known system features with their resource profiles.
 * These can be overridden by the actual runtime on startup.
 */
export function registerBuiltinFeatures(): void {
  registerFeature("ollama", {
    name: "Ollama Local LLM",
    category: "llm",
    ramGB: 4,
    vramGB: 0,
    cpuFraction: 0.3,
    priority: "system",
    preemptible: false,
  });

  registerFeature("lmstudio", {
    name: "LM Studio",
    category: "llm",
    ramGB: 4,
    vramGB: 0,
    cpuFraction: 0.3,
    priority: "system",
    preemptible: false,
  });

  registerFeature("citizen-agents", {
    name: "Citizen Agent Runtime",
    category: "agent",
    ramGB: 0.5,
    vramGB: 0,
    cpuFraction: 0.1,
    priority: "citizen",
    preemptible: true,
  });

  registerFeature("world-intelligence", {
    name: "World Intelligence Module",
    category: "infra",
    ramGB: 0.3,
    vramGB: 0,
    cpuFraction: 0.05,
    priority: "system",
    preemptible: false,
  });
}

// ═══════════════════════════════════════════════════════════════════
//  PLUGIN INTEGRATION HELPER
// ═══════════════════════════════════════════════════════════════════

/**
 * Derive a resource profile for a plugin from its manifest metadata.
 * Plugins that don't declare resource hints get a default "small" profile.
 */
export function profileFromPluginManifest(
  pluginId: string,
  manifest: {
    name: string;
    resources?: {
      ramGB?: number;
      vramGB?: number;
      cpuFraction?: number;
      priority?: ResourcePriority;
    };
  },
): ResourceProfile {
  const res = manifest.resources ?? {};
  return {
    name: manifest.name,
    category: "plugin",
    ramGB: res.ramGB ?? 0.2,
    vramGB: res.vramGB ?? 0,
    cpuFraction: res.cpuFraction ?? 0.05,
    priority: res.priority ?? "plugin",
    preemptible: true,
  };
}
