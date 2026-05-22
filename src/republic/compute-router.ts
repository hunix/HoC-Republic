/**
 * Republic Platform — Compute Router
 *
 * 4-Tier heterogeneous compute routing for citizen agent inference.
 *
 * Tier 0 — Rule-based reflex (free, no LLM)
 * Tier 1 — Local inference: BitNet 1-bit / Ollama / LM Studio (free)
 * Tier 2 — Cluster inference: remote Ollama/BitNet via NodeDiscovery (free)
 * Tier 3 — Cloud LLMs: Gemini, GPT (paid, used sparingly)
 *
 * Goal: >90% of inference should stay at Tier 0–1 (free).
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { isCircuitOpen } from "./agent-circuit-breaker.js";
import { getRateLimiter, resolveProvider } from "./api-rate-limiter.js";
import { getLocalInstances } from "./local-compute.js";
import type { ModelDecision } from "./model-council.js";
import { decisionToInferenceTarget, selectModel } from "./model-council.js";
import type { AgentTask, ComputeTier, InferenceTarget, Specialization } from "./types.js";

const routerLogger = createSubsystemLogger("compute-router");

/** Throttle map for council-switch log messages (engine pair → last log timestamp) */
const _councilSwitchLogThrottle = new Map<string, number>();

// ─── Circuit Breaker ────────────────────────────────────────────

export enum CircuitBreakerState {
  /** Normal operation — requests flow through */
  CLOSED = "CLOSED",
  /** Provider is failing — all requests are rejected */
  OPEN = "OPEN",
  /** Cooldown expired — allowing test requests to probe recovery */
  HALF_OPEN = "HALF_OPEN",
}

const BREAKER_FAILURE_THRESHOLD_CLOUD = 5;
const BREAKER_FAILURE_THRESHOLD_LOCAL = 8; // local models can have transient startup failures
const BREAKER_COOLDOWN_CLOUD_MS = 30_000; // 30 seconds for cloud APIs
const BREAKER_COOLDOWN_LOCAL_MS = 15_000; // 15 seconds for local models (faster recovery)
const BREAKER_HALF_OPEN_MAX = 2; // test requests in half-open
const HEALTH_EWMA_ALPHA = 0.3; // smoothing factor for health score

/** Get the appropriate failure threshold for a provider */
function getBreakerThreshold(providerName: string): number {
  return providerName.startsWith("local-") ? BREAKER_FAILURE_THRESHOLD_LOCAL : BREAKER_FAILURE_THRESHOLD_CLOUD;
}

/** Get the appropriate cooldown duration for a provider */
function getCooldownMs(providerName: string): number {
  return providerName.startsWith("local-") ? BREAKER_COOLDOWN_LOCAL_MS : BREAKER_COOLDOWN_CLOUD_MS;
}
const HEALTH_DECAY_AFTER_MS = 5 * 60_000; // decay health after 5 min idle
const HEALTH_DECAY_RATE_PER_MIN = 0.1; // 10% per minute

// ─── Provider Status Tracking ───────────────────────────────────

export interface ProviderStatus {
  available: boolean;
  lastChecked: number;
  /** Measured tokens/sec for this provider */
  throughput: number;
  /** Running average latency in ms */
  avgLatencyMs: number;
  /** Error count since last reset */
  errors: number;
  /** Model IDs available on this provider */
  models: string[];
  // ── Circuit Breaker Fields ──
  /** Current circuit breaker state */
  circuitState: CircuitBreakerState;
  /** Consecutive failures (reset on success) */
  consecutiveFailures: number;
  /** Timestamp when the breaker was last opened */
  openedAt: number;
  /** Number of test requests allowed through in HALF_OPEN */
  halfOpenAttempts: number;
  /** Successes in current HALF_OPEN probe window */
  halfOpenSuccesses: number;
  // ── Health Scoring ──
  /** Composite health score 0–100, EWMA-smoothed */
  healthScore: number;
  /** Total successful calls for throughput/error-rate calculation */
  totalCalls: number;
  /** Total successful calls */
  successCalls: number;
}

/** Registry of all known compute providers and their statuses */
const providers: Record<string, ProviderStatus> = {};

/** Counter for how many routes fell back to rules due to no available providers */
let degradedFallbackCount = 0;

/** Timer handle for periodic provider discovery */
let discoveryTimer: ReturnType<typeof setInterval> | null = null;

/** Tier complexity thresholds — tasks below get routed to cheaper tiers */
const TIER_THRESHOLDS = {
  /** Tasks below this complexity use Tier 0 (rules, no LLM) */
  reflex: 0.1,
  /** Tasks below this complexity use Tier 1 (local inference) */
  local: 0.5,
  /** Tasks below this complexity use Tier 2 (cluster inference) */
  cluster: 0.8,
  /** Above this threshold → Tier 3 (cloud LLMs) */
} as const;

// ─── Provider Registration ──────────────────────────────────────

/**
 * Register a compute provider with the router.
 * Called during startup as providers are discovered.
 */
export function registerProvider(name: string, status: Partial<ProviderStatus> = {}): void {
  providers[name] = {
    available: true,
    lastChecked: Date.now(),
    throughput: 0,
    avgLatencyMs: 0,
    errors: 0,
    models: [],
    circuitState: CircuitBreakerState.CLOSED,
    consecutiveFailures: 0,
    openedAt: 0,
    halfOpenAttempts: 0,
    halfOpenSuccesses: 0,
    healthScore: 100,
    totalCalls: 0,
    successCalls: 0,
    ...status,
  };
}

/**
 * Update a provider's status after an inference call.
 * Drives the circuit breaker state machine and updates health score.
 */
export function updateProviderStats(name: string, latencyMs: number, success: boolean): void {
  const p = providers[name];
  if (!p) {return;}

  p.lastChecked = Date.now();
  p.totalCalls++;

  if (success) {
    p.successCalls++;
    p.consecutiveFailures = 0;

    // Exponential moving average for latency
    p.avgLatencyMs = p.avgLatencyMs === 0 ? latencyMs : p.avgLatencyMs * 0.8 + latencyMs * 0.2;

    // Circuit breaker: half-open success tracking
    if (p.circuitState === CircuitBreakerState.HALF_OPEN) {
      p.halfOpenSuccesses++;
      if (p.halfOpenSuccesses >= BREAKER_HALF_OPEN_MAX) {
        // Enough successful probes — close the breaker
        p.circuitState = CircuitBreakerState.CLOSED;
        p.available = true;
        p.halfOpenAttempts = 0;
        p.halfOpenSuccesses = 0;
        p.errors = 0;
      }
    }
  } else {
    p.errors++;
    p.consecutiveFailures++;

    if (p.circuitState === CircuitBreakerState.HALF_OPEN) {
      // Probe failed in half-open — re-open the breaker
      p.circuitState = CircuitBreakerState.OPEN;
      p.openedAt = Date.now();
      p.available = false;
      p.halfOpenAttempts = 0;
      p.halfOpenSuccesses = 0;
    } else if (p.consecutiveFailures >= getBreakerThreshold(name)) {
      // Threshold breached — trip the breaker
      p.circuitState = CircuitBreakerState.OPEN;
      p.openedAt = Date.now();
      p.available = false;
    }
  }

  // ── Recalculate EWMA-smoothed health score ──
  updateHealthScore(p);
}

/**
 * Update a provider with rich telemetry from LM Studio's per-response stats.
 * Feeds tokens_per_second, time_to_first_token, and reasoning metrics
 * into the health scoring system.
 */
export function updateProviderTelemetry(
  name: string,
  telemetry: {
    tokensPerSecond?: number;
    timeToFirstTokenMs?: number;
    reasoningTokens?: number;
    modelLoadTimeMs?: number;
  },
): void {
  let p = providers[name];
  if (!p) {
    // Auto-register the provider if it's not known yet
    registerProvider(name, { available: true });
    p = providers[name];
    if (!p) {return;}
  }

  p.lastChecked = Date.now();

  // Feed tokens/sec into throughput (used in health scoring)
  if (telemetry.tokensPerSecond !== undefined && telemetry.tokensPerSecond > 0) {
    p.throughput = p.throughput === 0
      ? telemetry.tokensPerSecond
      : p.throughput * 0.7 + telemetry.tokensPerSecond * 0.3;
  }

  // Feed TTFT into latency (used in health scoring)
  if (telemetry.timeToFirstTokenMs !== undefined) {
    p.avgLatencyMs = p.avgLatencyMs === 0
      ? telemetry.timeToFirstTokenMs
      : p.avgLatencyMs * 0.7 + telemetry.timeToFirstTokenMs * 0.3;
  }

  // Count as a successful call
  p.totalCalls++;
  p.successCalls++;
  p.consecutiveFailures = 0;

  // Reset circuit breaker if it was open
  if (p.circuitState === CircuitBreakerState.OPEN || p.circuitState === CircuitBreakerState.HALF_OPEN) {
    p.circuitState = CircuitBreakerState.CLOSED;
    p.available = true;
    p.halfOpenAttempts = 0;
    p.halfOpenSuccesses = 0;
  }

  updateHealthScore(p);
}

/**
 * Mark a provider as available or unavailable.
 * When manually set to available, also resets the circuit breaker.
 */
export function setProviderAvailability(name: string, available: boolean): void {
  const p = providers[name];
  if (p) {
    p.available = available;
    if (available) {
      p.errors = 0;
      p.consecutiveFailures = 0;
      p.circuitState = CircuitBreakerState.CLOSED;
      p.halfOpenAttempts = 0;
      p.halfOpenSuccesses = 0;
    }
  }
}

/**
 * Get status of all registered providers.
 */
export function getProviderStatuses(): Record<string, ProviderStatus> {
  return { ...providers };
}

// ─── Health Score Calculation ───────────────────────────────────

/**
 * Recalculate a provider's composite health score (0–100).
 * Formula: 40% * (1 - errorRate) + 30% * (1 - latencyNorm) + 30% * throughputNorm
 * EWMA-smoothed with α = 0.3 to avoid oscillation.
 */
function updateHealthScore(p: ProviderStatus): void {
  const errorRate = p.totalCalls > 0 ? (p.totalCalls - p.successCalls) / p.totalCalls : 0;
  // Normalize latency: 0ms → 1.0, 5000ms+ → 0.0
  const latencyNorm = Math.min(p.avgLatencyMs / 5000, 1);
  // Normalize throughput: 0 → 0.0, 100+ tok/s → 1.0
  const throughputNorm = Math.min(p.throughput / 100, 1);

  const rawScore = 40 * (1 - errorRate) + 30 * (1 - latencyNorm) + 30 * throughputNorm;

  // EWMA smoothing
  p.healthScore =
    p.healthScore === 100 && p.totalCalls <= 1
      ? rawScore
      : p.healthScore * (1 - HEALTH_EWMA_ALPHA) + rawScore * HEALTH_EWMA_ALPHA;
}

// ─── Routing Logic ──────────────────────────────────────────────

/**
 * Classify a task and determine the optimal compute tier.
 *
 * Routing priorities:
 * 1. Reflex actions (sleeping, eating) → Tier 0 (rule-based, no LLM)
 * 2. Routine decisions → Tier 1 (local BitNet/Ollama/LM Studio)
 * 3. Complex collaboration → Tier 2 (cluster nodes)
 * 4. High-level strategy → Tier 3 (cloud LLMs)
 *
 * Falls back to a lower tier if the target tier is unavailable.
 */
export function routeTask(task: AgentTask): InferenceTarget {
  const tier = classifyTier(task);
  return selectTarget(tier, task);
}

/**
 * Classify the compute tier for a task based on type and complexity.
 */
function classifyTier(task: AgentTask): ComputeTier {
  // Explicit reflex actions — no LLM needed
  if (task.type === "reflex") {return 0;}

  // Route by complexity score
  if (task.complexity < TIER_THRESHOLDS.reflex) {return 0;}
  if (task.complexity < TIER_THRESHOLDS.local) {return 1;}
  if (task.complexity < TIER_THRESHOLDS.cluster) {return 2;}
  return 3;
}

/**
 * Select the best available target for the requested tier.
 * Falls UP to higher tiers (local→cloud) before falling to rules.
 * This ensures inference always reaches a provider when one is available.
 */
function selectTarget(requested: ComputeTier, _task: AgentTask): InferenceTarget {
  // Tier 0: Always available (rule-based)
  if (requested === 0) {
    return { tier: 0, engine: "rules" };
  }

  // Tier 1: Try local → cloud → rules
  if (requested <= 1) {
    const localTarget = findLocalTarget(_task.complexity);
    if (localTarget) {return localTarget;}
    // Local unavailable — escalate to cloud instead of falling to rules
    const cloudTarget = findCloudTarget();
    if (cloudTarget) {
      routerLogger.info(`Tier 1 → escalated to cloud (all local providers unavailable)`);
      return cloudTarget;
    }
    degradedFallbackCount++;
    routerLogger.warn(`Tier 1 → fallback to rules (local + cloud unavailable)`);
    return { tier: 0, engine: "rules" };
  }

  // Tier 2: Try cluster → local → cloud → rules
  if (requested <= 2) {
    const clusterTarget = findClusterTarget();
    if (clusterTarget) {return clusterTarget;}
    const localTarget = findLocalTarget(_task.complexity);
    if (localTarget) {
      routerLogger.info(`Tier 2 → degraded to local (no cluster nodes)`);
      return localTarget;
    }
    const cloudTarget = findCloudTarget();
    if (cloudTarget) {
      routerLogger.info(`Tier 2 → escalated to cloud (cluster + local unavailable)`);
      return cloudTarget;
    }
    degradedFallbackCount++;
    routerLogger.warn(`Tier 2 → fallback to rules (all tiers unavailable)`);
    return { tier: 0, engine: "rules" };
  }

  // Tier 3: Try cloud → cluster → local → rules
  const cloudTarget = findCloudTarget();
  if (cloudTarget) {return cloudTarget;}
  routerLogger.info(`Tier 3 → cloud unavailable, trying cluster`);
  const clusterTarget = findClusterTarget();
  if (clusterTarget) {return clusterTarget;}
  const localTarget = findLocalTarget(_task.complexity);
  if (localTarget) {
    routerLogger.info(`Tier 3 → degraded to local (cloud + cluster unavailable)`);
    return localTarget;
  }
  degradedFallbackCount++;
  routerLogger.warn(`Tier 3 → fallback to rules (all tiers unavailable)`);
  return { tier: 0, engine: "rules" };
}

// ─── Target Finders ─────────────────────────────────────────────

/**
 * Build an InferenceTarget for a local provider instance.
 */
function makeLocalTarget(
  inst: { type: string; models: string[] },
): InferenceTarget {
  return {
    tier: 1,
    engine: inst.type as InferenceTarget["engine"],
    provider: inst.type,
    modelId: inst.models[0],
  };
}

/**
 * Score a provider by its current load from the rate limiter.
 * Lower score = less busy = better candidate.
 * Paused providers get Infinity (= never picked).
 */
function providerLoad(providerName: string): number {
  try {
    const limiter = getRateLimiter();
    const stats = limiter.getStats();
    const pName = resolveProvider(providerName);
    const bucket = stats.providers[pName];
    if (!bucket) { return 0; } // Unknown provider — assume idle
    if (bucket.paused) { return Infinity; } // Paused = skip
    // Load score: in-flight × 2 + queue depth (in-flight matters more)
    return bucket.inFlight * 2 + bucket.queueDepth;
  } catch {
    return 0; // Rate limiter not initialized yet
  }
}

/**
 * Find the best local target using **least-loaded routing**.
 *
 * Strategy:
 *   1. Build the preferred provider order based on task complexity.
 *   2. Among the providers that are online, pick the one with the
 *      lowest load score (in-flight + queue depth from the rate limiter).
 *   3. If two providers have equal load, prefer the complexity-natural one.
 *
 * This ensures thousands of citizens get distributed across ALL local
 * providers simultaneously, not funneled into one.
 */
export function findLocalTarget(complexity?: number): InferenceTarget | null {
  const locals = getLocalInstances().filter((i) => i.status === "online" && i.models.length > 0);

  // ── Gap 5: LM Link cluster-aware routing ──────────────────────────────
  // For medium-high complexity tasks, probe the LM Link cluster.
  // The cluster may have remote power nodes (Blackwell 96GB) or the
  // H-Office 3090Ti that outperform the local Titan for complex work.
  if (complexity !== undefined && complexity >= 0.3) {
    try {
      // Lazy import to avoid circular deps
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { selectBestLMLinkNode } = require("./lmlink-cluster.js") as {
        selectBestLMLinkNode: (opts?: {
          preferTier?: "power" | "medium" | "fast";
          requireMinVramGb?: number;
        }) => { host: string; port: number; label: string; apiToken?: string; models: { type: string; key: string }[] } | null;
      };
      // Route high-complexity (≥ 0.7) to power nodes (Blackwell 96GB)
      // Route medium-complexity (0.3–0.7) to enthusiast nodes (24GB 3090Ti / Titan)
      const tierPref: "power" | "medium" | "fast" = complexity >= 0.7 ? "power" : "medium";
      const minVram: number | undefined = complexity >= 0.7 ? 48 : undefined;
      const bestNode = selectBestLMLinkNode({ preferTier: tierPref, requireMinVramGb: minVram });

      if (bestNode) {
        const chatModels = bestNode.models.filter((m) => m.type === "llm").map((m) => m.key);
        if (chatModels.length > 0) {
          return {
            tier: 1,
            engine: "lmstudio",
            provider: "lmstudio",
            modelId: chatModels[0],
            // Stash the cluster endpoint so the caller can override LMSTUDIO_HOST/PORT
            nodeEndpoint: `http://${bestNode.host}:${bestNode.port}`,
          };
        }
      }
    } catch {
      // lmlink-cluster not loaded yet — fall through to local discovery
    }
  }

  if (locals.length === 0) { return null; }

  // Filter out providers whose circuit breakers are tripped
  const lmstudio = locals.find((i) => i.type === "lmstudio" && !isCircuitOpen("lmstudio"));
  const ollama   = locals.find((i) => i.type === "ollama"   && !isCircuitOpen("ollama"));

  // Build preferred order based on complexity (primary preference)
  type Candidate = { inst: typeof lmstudio; weight: number };
  const candidates: Candidate[] = [];

  if (complexity !== undefined) {
    if (complexity < 0.2) {
      // Simple tasks: prefer Ollama, then LM Studio
      if (ollama)   { candidates.push({ inst: ollama,   weight: 0 }); }
      if (lmstudio) { candidates.push({ inst: lmstudio, weight: 1 }); }
    } else if (complexity < 0.5) {
      // Medium tasks: prefer LM Studio (GPU), then Ollama
      if (lmstudio) { candidates.push({ inst: lmstudio, weight: 0 }); }
      if (ollama)   { candidates.push({ inst: ollama,   weight: 1 }); }
    } else {
      // Complex tasks: prefer Ollama/Nemotron, then LM Studio
      if (ollama)   { candidates.push({ inst: ollama,   weight: 0 }); }
      if (lmstudio) { candidates.push({ inst: lmstudio, weight: 1 }); }
    }
  } else {
    // No complexity hint — all providers equal
    if (lmstudio) { candidates.push({ inst: lmstudio, weight: 0 }); }
    if (ollama)   { candidates.push({ inst: ollama,   weight: 0 }); }
  }

  if (candidates.length === 0) { return null; }

  // Sort by load, then by complexity-weight as tiebreaker
  const sorted = candidates.toSorted((a, b) => {
    const loadA = providerLoad(a.inst!.type);
    const loadB = providerLoad(b.inst!.type);
    // If either is paused (Infinity), deprioritize
    if (loadA !== loadB) { return loadA - loadB; }
    // Same load — prefer the complexity-natural provider
    return a.weight - b.weight;
  });

  const best = sorted[0];
  if (!best.inst) { return null; }
  return makeLocalTarget(best.inst);
}

function findClusterTarget(): InferenceTarget | null {
  for (const [name, status] of Object.entries(providers)) {
    if (!name.startsWith("cluster-") || !status.available) { continue; }
    // Remove the "cluster-" prefix to get the full URL (e.g. http://192.168.1.100:18789)
    const endpoint = name.replace("cluster-", "");
    return {
      tier: 2,
      engine: "cluster-proxy",
      nodeEndpoint: endpoint,
    };
  }
  return null;
}

/**
 * Find the best cloud target using **least-loaded routing**.
 *
 * Instead of always preferring Gemini (which would hit rate limits
 * with hundreds of citizens), we sort ALL registered cloud providers
 * by their current load and pick the least busy one.
 */
function findCloudTarget(): InferenceTarget | null {
  interface CloudCandidate {
    registryName: string;
    provider: string;
    modelId: string;
    isPaid: boolean;
  }

  const cloudProviders: CloudCandidate[] = [
    { registryName: "cloud-gemini",     provider: "google",     modelId: "gemini-2.0-flash", isPaid: true },
    { registryName: "cloud-openai",     provider: "openai",     modelId: "gpt-4o-mini",      isPaid: true },
    { registryName: "cloud-anthropic",  provider: "anthropic",  modelId: "claude-sonnet-4",  isPaid: true },
    { registryName: "cloud-groq",       provider: "groq",       modelId: "llama-3.3-70b-versatile", isPaid: false },
    { registryName: "cloud-nvidia",     provider: "nvidia",     modelId: "nvidia/nemotron-3-super-120b-a12b", isPaid: false },
    { registryName: "cloud-openrouter", provider: "openrouter", modelId: "auto", isPaid: false }, // Assumes OpenRouter is configured for free models
  ];

  // Strictly filter out paid models unless explicitly allowed
  const allowPaid = process.env.OPENCLAW_ALLOW_PAID_MODELS === "true";

  // Filter to only registered + available providers, score by load
  const available = cloudProviders
    .filter((cp) => allowPaid || !cp.isPaid)
    .filter((cp) => isAvailable(cp.registryName))
    .map((cp) => ({ ...cp, load: providerLoad(cp.provider) }))
    .filter((cp) => cp.load < Infinity) // Exclude paused
    .toSorted((a, b) => a.load - b.load);   // Least loaded first

  if (available.length === 0) { return null; }

  const best = available[0];
  return { tier: 3, engine: "cloud", provider: best.provider, modelId: best.modelId };
}

function isAvailable(name: string): boolean {
  const p = providers[name];
  if (p == null) {return false;}

  // Health Score Decay: if a provider hasn't been checked for >5 min,
  // decay its health score by 10% per minute of staleness.
  // This prevents stale providers from keeping artificially high scores.
  const staleness = Date.now() - p.lastChecked;
  if (staleness > HEALTH_DECAY_AFTER_MS && p.healthScore > 0) {
    const decayMinutes = (staleness - HEALTH_DECAY_AFTER_MS) / 60_000;
    const decayFactor = Math.max(0, 1 - HEALTH_DECAY_RATE_PER_MIN * decayMinutes);
    p.healthScore = Math.max(0, p.healthScore * decayFactor);
  }

  // Circuit breaker auto-recovery: transition OPEN → HALF_OPEN after cooldown
  if (p.circuitState === CircuitBreakerState.OPEN) {
    const elapsed = Date.now() - p.openedAt;
    if (elapsed >= getCooldownMs(name)) {
      p.circuitState = CircuitBreakerState.HALF_OPEN;
      p.halfOpenAttempts = 0;
      p.halfOpenSuccesses = 0;
      p.available = true; // allow probe requests
      return true;
    }
    return false; // still in cooldown
  }

  // HALF_OPEN: allow limited test requests
  if (p.circuitState === CircuitBreakerState.HALF_OPEN) {
    p.halfOpenAttempts++;
    return p.halfOpenAttempts <= BREAKER_HALF_OPEN_MAX;
  }

  return p.available;
}

// ─── Model Council Integration ──────────────────────────────────

/**
 * Route a task using the Model Council for intelligent model selection.
 * Falls back to the standard complexity-based routing if council is unavailable.
 *
 * This is the recommended entry point for the agent runtime.
 */
export function routeWithCouncil(params: {
  task: AgentTask;
  toolName: string;
  specialization: Specialization;
  skillLevel: number;
}): { target: InferenceTarget; decision: ModelDecision | null } {
  try {
    const decision = selectModel({
      toolName: params.toolName,
      task: params.task,
      specialization: params.specialization,
      skillLevel: params.skillLevel,
    });
    let target = decisionToInferenceTarget(decision);

    // ── Reality Check: verify local engine against actual discovery ──
    // The MODEL_CATALOG has static entries (e.g., provider: "ollama") that may not
    // match what's actually running. If the council picked a local engine, verify
    // the specific provider is online. If not, substitute a real online provider.
    const isLocalEngine = ["ollama", "lmstudio"].includes(target.engine);
    if (isLocalEngine) {
      const realLocal = findLocalTarget(params.task.complexity);
      if (realLocal) {
        // Use real discovered provider instead of static catalog guess
        if (realLocal.engine !== target.engine) {
          // Throttle this log — once per 30s per engine to avoid flooding
          const logKey = `council-switch-${target.engine}-${realLocal.engine}`;
          const now = Date.now();
          if (!_councilSwitchLogThrottle.has(logKey) || now - _councilSwitchLogThrottle.get(logKey)! > 30_000) {
            routerLogger.info(
              `Council picked ${target.engine} but ${realLocal.engine} is actually online — switching`,
            );
            _councilSwitchLogThrottle.set(logKey, now);
          }
        }
        target = realLocal;
      } else {
        // No local providers online (or all circuit-broken) — escalate to cloud or rules
        routerLogger.warn(`Council picked ${target.engine} but no local providers are online`);
        return { target: routeTask(params.task), decision };
      }
    }

    return { target, decision };
  } catch {
    // Fallback to standard routing if council fails
    return { target: routeTask(params.task), decision: null };
  }
}

// ─── Tier Stats & Diagnostics ───────────────────────────────────

export interface TierStats {
  tier: ComputeTier;
  totalCalls: number;
  avgLatencyMs: number;
  errors: number;
}

const tierCallCounts: Record<ComputeTier, { calls: number; totalLatency: number; errors: number }> =
  {
    0: { calls: 0, totalLatency: 0, errors: 0 },
    1: { calls: 0, totalLatency: 0, errors: 0 },
    2: { calls: 0, totalLatency: 0, errors: 0 },
    3: { calls: 0, totalLatency: 0, errors: 0 },
  };

/** Record that an inference call was made on a tier. */
export function recordTierCall(tier: ComputeTier, latencyMs: number, success: boolean): void {
  const stats = tierCallCounts[tier];
  stats.calls++;
  stats.totalLatency += latencyMs;
  if (!success) {stats.errors++;}
}

/** Get aggregated stats for all tiers. */
export function getTierStats(): TierStats[] {
  return ([0, 1, 2, 3] as ComputeTier[]).map((tier) => {
    const s = tierCallCounts[tier];
    return {
      tier,
      totalCalls: s.calls,
      avgLatencyMs: s.calls > 0 ? Math.round(s.totalLatency / s.calls) : 0,
      errors: s.errors,
    };
  });
}

/** Get the percentage of calls that stayed free (Tier 0–2). */
export function getFreeCallPercentage(): number {
  const total =
    tierCallCounts[0].calls +
    tierCallCounts[1].calls +
    tierCallCounts[2].calls +
    tierCallCounts[3].calls;
  if (total === 0) {return 100;}
  const free = tierCallCounts[0].calls + tierCallCounts[1].calls + tierCallCounts[2].calls;
  return Math.round((free / total) * 100);
}

// ─── Circuit Breaker Diagnostics ────────────────────────────────

export interface CircuitBreakerDiagnostics {
  provider: string;
  state: CircuitBreakerState;
  consecutiveFailures: number;
  healthScore: number;
  openedAt: number | null;
  cooldownRemainingMs: number;
}

/** Get circuit breaker diagnostics for all providers. */
export function getCircuitBreakerDiagnostics(): CircuitBreakerDiagnostics[] {
  const now = Date.now();
  return Object.entries(providers).map(([name, p]) => {
    const cooldownRemaining =
      p.circuitState === CircuitBreakerState.OPEN
        ? Math.max(0, getCooldownMs(name) - (now - p.openedAt))
        : 0;
    return {
      provider: name,
      state: p.circuitState,
      consecutiveFailures: p.consecutiveFailures,
      healthScore: Math.round(p.healthScore),
      openedAt: p.circuitState !== CircuitBreakerState.CLOSED ? p.openedAt : null,
      cooldownRemainingMs: cooldownRemaining,
    };
  });
}

/** Get ranked health report for all providers. */
export function getProviderHealthReport(): Array<{
  provider: string;
  healthScore: number;
  errorRate: number;
  avgLatencyMs: number;
  circuitState: CircuitBreakerState;
}> {
  return Object.entries(providers)
    .map(([name, p]) => ({
      provider: name,
      healthScore: Math.round(p.healthScore),
      errorRate:
        p.totalCalls > 0 ? Math.round(((p.totalCalls - p.successCalls) / p.totalCalls) * 100) : 0,
      avgLatencyMs: Math.round(p.avgLatencyMs),
      circuitState: p.circuitState,
    }))
    .toSorted((a, b) => b.healthScore - a.healthScore);
}

// ─── Degraded Mode Detection ────────────────────────────────────

/**
 * Check whether the system is in degraded mode.
 * Returns true if all registered providers are unavailable (circuit open)
 * and routes have been forced to Tier 0 rule-based fallback.
 */
export function isDegradedMode(): boolean {
  const allProviders = Object.values(providers);
  if (allProviders.length === 0) {
    return false;
  }
  return allProviders.every((p) => !p.available || p.circuitState === CircuitBreakerState.OPEN);
}

/** Get the count of degraded fallbacks since the last reset. */
export function getDegradedFallbackCount(): number {
  return degradedFallbackCount;
}

/** Reset the degraded fallback counter (e.g., after provider recovery). */
export function resetDegradedFallbackCount(): void {
  degradedFallbackCount = 0;
}

// ─── Periodic Provider Discovery ────────────────────────────────

const DISCOVERY_INTERVAL_MS = 60_000; // 60s default

/**
 * Refresh provider discovery by re-scanning for local compute instances.
 * Automatically registers newly-discovered Ollama, LM Studio, and BitNet
 * instances as providers if they aren't already registered.
 */
export function refreshProviderDiscovery(): {
  discovered: number;
  registered: string[];
} {
  const locals = getLocalInstances();
  const newRegistrations: string[] = [];

  for (const instance of locals) {
    const providerName = `local-${instance.type}`;
    const isOnline = instance.status === "online";

    if (!providers[providerName]) {
      // New provider discovered — register it
      if (isOnline && instance.models.length > 0) {
        registerProvider(providerName, {
          available: true,
          models: instance.models,
          throughput: 30,
        });
        newRegistrations.push(providerName);
      }
    } else {
      // Existing provider — update availability and models
      const existing = providers[providerName];
      existing.models = instance.models;
      if (isOnline && instance.models.length > 0 && !existing.available) {
        // Provider came back online — re-enable it
        setProviderAvailability(providerName, true);
      } else if (!isOnline && existing.available) {
        existing.available = false;
      }
    }
  }

  return { discovered: locals.length, registered: newRegistrations };
}

/**
 * Start periodic provider discovery refresh.
 * Runs `refreshProviderDiscovery()` every `intervalMs` milliseconds (default 60s).
 * Returns a function to stop the refresh.
 */
export function startDiscoveryRefresh(intervalMs = DISCOVERY_INTERVAL_MS): () => void {
  // Run immediately on start
  refreshProviderDiscovery();

  // Set up periodic refresh
  if (discoveryTimer) {
    clearInterval(discoveryTimer);
  }
  discoveryTimer = setInterval(() => {
    refreshProviderDiscovery();
  }, intervalMs);

  return () => {
    if (discoveryTimer) {
      clearInterval(discoveryTimer);
      discoveryTimer = null;
    }
  };
}
