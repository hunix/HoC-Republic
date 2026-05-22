/**
 * Republic Platform — Local Compute Manager
 *
 * Phase 36: Dedicated subsystem for discovering, tracking, and polling
 * local and lightweight LLM runtimes (Ollama, LM Studio, BitNet).
 *
 * Auto-registers discovered local models with the Universal Model Engine
 * so citizens and agents can route workloads cheaply.
 */

import { emitNationalEvent } from "./event-sourcing.js";
import { getLatestSurvey } from "./hardware-manager.js";
import { markProviderUnavailable, registerAvailableProvider } from "./model-council.js";
import { getModel, registerModel } from "./universal-model-engine.js";

// ─── Interfaces ──────────────────────────────────────────────────

export interface LocalInstance {
  id: string;
  type: "ollama" | "lmstudio";
  status: "online" | "offline" | "warming";
  url: string;
  lastSeen: number;
  models: string[];
  pid?: number;
}

// ─── BitNet stub types (BitNet engine removed; stubs preserve compute.ts contract) ─
export interface BitNetInstance {
  id: string; url: string; port: number; model: string; source: string; pid?: number;
}
export interface DownloadedBitnetModel {
  file: string; path: string; repo: string; sizeBytes?: number;
}
const _bitnetInstances = new Map<string, BitNetInstance>();
/** @deprecated BitNet engine removed — always returns [] */
export function getDownloadedBitnetModels(): DownloadedBitnetModel[] { return []; }
/** @deprecated BitNet engine removed — no-op */
export function registerBitNetInstance(_host: string, _port: number, _model: string, _source: string, _pid?: number): void {}
/** @deprecated BitNet engine removed — no-op */
export function deregisterInstance(instanceId: string): void { _bitnetInstances.delete(instanceId); }
/** @deprecated BitNet engine removed — always returns undefined */
export function getInstance(_instanceId: string): BitNetInstance | undefined { return undefined; }

const instances = new Map<string, LocalInstance>();

// Configuration default ports
const DEFAULT_PORTS = {
  ollama: 11434,
  lmstudio: 1234,
};

/** Canonical default URLs for local LLM providers */
export const OLLAMA_DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PORTS.ollama}`;
export const LMSTUDIO_DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PORTS.lmstudio}`;

/**
 * Additional LM Studio instances on remote machines.
 * Set LMSTUDIO_REMOTE_URLS to a comma-separated list of URLs, e.g.:
 *   LMSTUDIO_REMOTE_URLS=http://100.76.143.45:1234,http://192.168.1.50:1234
 */
const REMOTE_LMSTUDIO_ENDPOINTS: Array<{ host: string; port: number }> = (() => {
  const raw = process.env.LMSTUDIO_REMOTE_URLS ?? "";
  if (!raw.trim()) {return [];}
  return raw.split(",").map((url) => {
    const trimmed = url.trim().replace(/\/+$/, "");
    try {
      const parsed = new URL(trimmed);
      return {
        host: `${parsed.protocol}//${parsed.hostname}`,
        port: parseInt(parsed.port || "1234", 10),
      };
    } catch {
      // Bare host:port format (e.g. 100.76.143.45:1234)
      const [h, p] = trimmed.split(":");
      return { host: `http://${h}`, port: parseInt(p || "1234", 10) };
    }
  });
})();

/**
 * Maximum context window to request from local LLM runtimes.
 * Auto-scales based on detected VRAM:
 *   ≤ 12 GB → 4096,  ≤ 24 GB → 8192,  > 24 GB → 16384
 * Override via LOCAL_MAX_CONTEXT env var.
 */
function getEffectiveContextWindow(): number {
  if (process.env.LOCAL_MAX_CONTEXT) {
    return parseInt(process.env.LOCAL_MAX_CONTEXT, 10);
  }
  const survey = getLatestSurvey();
  const vram = survey?.vramGB ?? 0;
  if (vram <= 12) {return 4096;}
  if (vram <= 24) {return 8192;}
  return 16384;
}

/** Default model to auto-pull into Ollama when it has no models loaded. */
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_DEFAULT_MODEL ?? "llama3.2";

// ─── Auto-provisioning guards (fire-once flags) ─────────────────

let _ollamaAutoPullTriggered = false;
let _lmstudioWarningShown = false;

// ─── Discovery polling ──────────────────────────────────────────

import { isLoadShedding } from "../infra/heap-monitor.js";

let pollInterval: NodeJS.Timeout | null = null;

/** Per-endpoint failure tracking for exponential backoff */
const _pollFailures = new Map<string, number>();
const _pollTimers = new Map<string, NodeJS.Timeout>();
const BACKOFF_INTERVALS = [30_000, 60_000, 120_000, 300_000]; // 30s → 5min

function getBackoffMs(endpoint: string): number {
  const failures = _pollFailures.get(endpoint) ?? 0;
  const idx = Math.min(failures, BACKOFF_INTERVALS.length - 1);
  return BACKOFF_INTERVALS[idx];
}

function recordPollSuccess(endpoint: string): void {
  if ((_pollFailures.get(endpoint) ?? 0) > 0) {
    console.log(`[local-compute] ${endpoint} recovered after ${_pollFailures.get(endpoint)} failures → reset to 30s polling`);
  }
  _pollFailures.set(endpoint, 0);
}

function recordPollFailure(endpoint: string): void {
  const prev = _pollFailures.get(endpoint) ?? 0;
  _pollFailures.set(endpoint, prev + 1);
  const nextMs = getBackoffMs(endpoint);
  if (prev + 1 >= 3) {
    console.warn(`[local-compute] ${endpoint}: ${prev + 1} consecutive failures → backing off to ${nextMs / 1000}s`);
  }
}

export function startLocalComputeDiscovery(intervalMs = 30000) {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  // Clear all per-endpoint timers
  for (const [, timer] of _pollTimers) { clearTimeout(timer); }
  _pollTimers.clear();

  // Initial sweep — local + remote
  void pollOllama();
  void pollLMStudio();
  for (const remote of REMOTE_LMSTUDIO_ENDPOINTS) {
    void pollLMStudio(remote.host, remote.port);
  }

  // Main poll loop — unref so timer doesn't prevent clean exit
  pollInterval = setInterval(() => {
    // Skip under memory pressure
    if (isLoadShedding()) { return; }

    void pollOllama();
    void pollLMStudio();
    for (const remote of REMOTE_LMSTUDIO_ENDPOINTS) {
      void pollLMStudio(remote.host, remote.port);
    }
    // Sync LM Link cluster nodes so compute-router can see them
    syncLMLinkNodesToLocalCompute();
  }, intervalMs);
  pollInterval.unref();
}

export function stopLocalComputeDiscovery() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

/**
 void void * Wait until at least one local inference provider is online,
 void * or until the timeout expires. Used by the boot sequence to
 * guarantee intelligence readiness before the simulation starts.
 */
export async function awaitLocalReadiness(timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now();
  const checkInterval = 1_000; // Check every 1s

  while (Date.now() - start < timeoutMs) {
    const onlineInstances = Array.from(instances.values()).filter(
      (i) => i.status === "online" && i.models.length > 0,
    );
    if (onlineInstances.length > 0) {
      emitNationalEvent("infrastructure", "local_readiness_achieved", "local-compute", {
        provider: onlineInstances[0].type,
        models: onlineInstances[0].models,
        waitMs: Date.now() - start,
      });
      return true;
    }
    await new Promise((r) => setTimeout(r, checkInterval));
  }

  // Timeout reached — log warning but don't block boot
  emitNationalEvent("infrastructure", "local_readiness_timeout", "local-compute", {
    timeoutMs,
    message:
      "No local inference providers came online within timeout. Citizens will use reflex fallback until a provider is available.",
  });
  return false;
}

// ─── Ollama ─────────────────────────────────────────────────────

async function pollOllama(host = "http://127.0.0.1", port = DEFAULT_PORTS.ollama) {
  const url = `${host}:${port}`;
  const id = `ollama-${host}:${port}`;

  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      throw new Error("not ok");
    }
    const data = (await res.json()) as {
      models: { name: string; size: number; details: unknown }[];
    };

    const isNew = !instances.has(id);
    const instance: LocalInstance = {
      id,
      type: "ollama",
      status: "online",
      url,
      lastSeen: Date.now(),
      models: data.models.map((m) => m.name),
    };
    instances.set(id, instance);

    if (isNew) {
      emitNationalEvent("infrastructure", "local_compute_discovered", "local-compute", {
        type: "ollama",
        url,
        models: instance.models.length,
      });
    }

    // ── Auto-pull default model when Ollama has 0 models ──
    if (instance.models.length === 0 && !_ollamaAutoPullTriggered) {
      _ollamaAutoPullTriggered = true;
      autoProvisionOllama(url).catch(() => {});
    }

    // ── Sync provider availability with Model Council ──
    registerAvailableProvider("ollama", instance.models);

    // Sync UMIE
    for (const m of data.models) {
      const umieId = `local-ollama-${m.name}`;
      if (!getModel(umieId)) {
        registerModel({
          id: umieId,
          name: m.name,
          paradigm: "slm",
          provider: "ollama",
          capabilities: ["completion", "chat"],
          inputModalities: ["text"],
          outputModalities: ["text"],
          latencyProfile: "fast",
          status: "online",
          costPer1kTokens: { input: 0, output: 0 },
          contextWindow: getEffectiveContextWindow(),
          metadata: {
            size: m.size,
            details: m.details,
            url,
            maxContextWindow: getEffectiveContextWindow(),
          },
        });
      }
    }
  } catch {
    if (instances.has(id)) {
      const inv = instances.get(id)!;
      if (inv.status !== "offline") {
        inv.status = "offline";
        markProviderUnavailable("ollama");
        emitNationalEvent("infrastructure", "local_compute_offline", "local-compute", {
          type: "ollama",
          url,
        });
      }
    }
  }
}

/**
 * Auto-pull the default model into Ollama.
 * Uses the streaming /api/pull endpoint and waits for completion.
 */
async function autoProvisionOllama(baseUrl: string): Promise<void> {
  emitNationalEvent("infrastructure", "ollama_auto_pull_started", "local-compute", {
    model: OLLAMA_DEFAULT_MODEL,
  });

  try {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: OLLAMA_DEFAULT_MODEL, stream: false }),
      signal: AbortSignal.timeout(600_000), // 10 min timeout for download
    });

    if (!res.ok) {
      throw new Error(`Ollama pull failed: HTTP ${res.status}`);
    }

    // When stream:false, Ollama returns a single JSON response on completion
    await res.json();

    emitNationalEvent("infrastructure", "ollama_auto_pull_completed", "local-compute", {
      model: OLLAMA_DEFAULT_MODEL,
    });

    // Re-poll to discover the newly pulled model
    await pollOllama();
  } catch (err: unknown) {
    emitNationalEvent("infrastructure", "ollama_auto_pull_failed", "local-compute", {
      model: OLLAMA_DEFAULT_MODEL,
      error: err instanceof Error ? err.message : String(err),
    });
    // Reset flag so next poll cycle retries
    _ollamaAutoPullTriggered = false;
  }
}

// ─── LM Studio ──────────────────────────────────────────────────

async function pollLMStudio(host = "http://127.0.0.1", port = DEFAULT_PORTS.lmstudio) {
  const url = `${host}:${port}`;
  const id = `lmstudio-${host}:${port}`;

  try {
    // Use native v1 API — returns type field for reliable LLM vs embedding filtering
    const res = await fetch(`${url}/api/v1/models`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      throw new Error("not ok");
    }
    const data = (await res.json()) as {
      models: Array<{ type: "llm" | "embedding"; key: string; size_bytes: number }>;
    };

    const isNew = !instances.has(id);
    // Filter to LLM models only — embedding models can't do chat completions
    const chatModels = data.models
      .filter((m) => m.type === "llm")
      .map((m) => m.key);

    const instance: LocalInstance = {
      id,
      type: "lmstudio",
      status: "online",
      url,
      lastSeen: Date.now(),
      models: chatModels,
    };
    instances.set(id, instance);
    recordPollSuccess(url);

    if (isNew) {
      emitNationalEvent("infrastructure", "local_compute_discovered", "local-compute", {
        type: "lmstudio",
        url,
        models: instance.models.length,
      });
    }

    // ── Warn when LM Studio has no models loaded ──
    if (instance.models.length === 0 && !_lmstudioWarningShown) {
      _lmstudioWarningShown = true;
      emitNationalEvent("infrastructure", "lmstudio_no_models", "local-compute", {
        url,
        message:
          "LM Studio is running but has no models loaded. Open LM Studio and load a model to enable local inference.",
      });
    }

    // ── Sync provider availability with Model Council ──
    registerAvailableProvider("lmstudio", instance.models);

    // Sync UMIE (only chat-capable models, not embeddings)
    for (const modelId of chatModels) {
      const umieId = `local-lmstudio-${modelId}`;
      if (!getModel(umieId)) {
        registerModel({
          id: umieId,
          name: modelId,
          paradigm: "slm", // Mostly lightweight models loaded locally
          provider: "lmstudio",
          capabilities: ["completion", "chat"],
          inputModalities: ["text"],
          outputModalities: ["text"],
          latencyProfile: "fast",
          status: "online",
          costPer1kTokens: { input: 0, output: 0 },
          contextWindow: getEffectiveContextWindow(),
          metadata: { url, maxContextWindow: getEffectiveContextWindow() },
        });
      }
    }
  } catch {
    recordPollFailure(url);
    if (instances.has(id)) {
      const inv = instances.get(id)!;
      if (inv.status !== "offline") {
        inv.status = "offline";
        markProviderUnavailable("lmstudio");
        emitNationalEvent("infrastructure", "local_compute_offline", "local-compute", {
          type: "lmstudio",
          url,
        });
      }
    }
  }
}

// ─── Getters ────────────────────────────────────────────────────

export function getLocalInstances(): LocalInstance[] {
  return Array.from(instances.values());
}

export function getInstanceById(id: string): LocalInstance | undefined {
  return instances.get(id);
}

// ─── LM Link Cluster Sync ────────────────────────────────────────

/**
 * Sync online LM Link cluster nodes into the local instances Map.
 *
 * Each online LM Link node is upserted as a `lmstudio` instance so
 * `getLocalInstances()` and `findLocalTarget()` in compute-router can
 * see — and route to — the full multi-device fleet, not just localhost.
 *
 * Called every poll cycle from `startLocalComputeDiscovery()`.
 * Uses a lazy import to avoid circular dependencies.
 */
export function syncLMLinkNodesToLocalCompute(): void {
  // Lazy import to avoid circular dependency at module load time
  let getLMLinkNodes: (() => import("./lmlink-cluster.js").LMLinkNode[]) | undefined;
  try {
    // Node/ESM: synchronous require for already-loaded modules
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    getLMLinkNodes = (require("./lmlink-cluster.js") as { getLMLinkNodes: () => import("./lmlink-cluster.js").LMLinkNode[] }).getLMLinkNodes;
  } catch {
    return; // lmlink-cluster not loaded yet
  }
  if (!getLMLinkNodes) { return; }

  const lmlinkNodes = getLMLinkNodes();

  for (const node of lmlinkNodes) {
    // Skip the local node — it's already registered by pollLMStudio()
    if (node.isLocal) { continue; }

    const instanceId = `lmstudio-http://${node.host}:${node.port}`;
    const existing = instances.get(instanceId);
    const chatModelKeys = node.models.filter((m) => m.type === "llm").map((m) => m.key);

    if (node.status === "online") {
      if (existing) {
        existing.status = "online";
        existing.lastSeen = Date.now();
        existing.models = chatModelKeys;
      } else {
        instances.set(instanceId, {
          id: instanceId,
          type: "lmstudio",
          status: "online",
          url: `http://${node.host}:${node.port}`,
          lastSeen: Date.now(),
          models: chatModelKeys,
        });
        emitNationalEvent("infrastructure", "local_compute_discovered", "local-compute", {
          type: "lmstudio",
          url: `http://${node.host}:${node.port}`,
          label: node.label,
          models: chatModelKeys.length,
          via: "lmlink",
        });
      }
      // Sync provider availability with Model Council
      if (chatModelKeys.length > 0) {
        registerAvailableProvider("lmstudio", chatModelKeys);
      }
    } else if (existing && existing.status !== "offline") {
      existing.status = "offline";
      emitNationalEvent("infrastructure", "local_compute_offline", "local-compute", {
        type: "lmstudio",
        url: `http://${node.host}:${node.port}`,
        label: node.label,
        via: "lmlink",
      });
    }
  }
}

// ─── Model Pre-Warming ─────────────────────────────────────────

const _warmLogger = {
  info: (msg: string) => emitNationalEvent("infrastructure", "local_compute_warm", "local-compute", { message: msg }),
};

/**
 * Pre-warm local models by sending a minimal inference request.
 *
 * Cold model loading (3-8 GB into VRAM) can take 15-30 seconds.
 * If citizens hit a cold model, the inference timeout trips the
 * circuit breaker and blocks ALL subsequent local inference.
 *
 * This function sends a tiny prompt to Ollama and LM Studio
 * right after boot so models are already loaded when citizens
 * start their first tick. Fire-and-forget, non-blocking.
 */
export async function warmLocalModels(): Promise<void> {
  const warmPromises: Promise<void>[] = [];

  // ── Warm Ollama ───────────────────────────────────────────────
  const ollamaInstance = Array.from(instances.values()).find(
    (i) => i.type === "ollama" && i.status === "online" && i.models.length > 0,
  );
  if (ollamaInstance) {
    const model = ollamaInstance.models[0];
    warmPromises.push(
      (async () => {
        try {
          _warmLogger.info(`Warming Ollama model "${model}"...`);
          const resp = await fetch(`${ollamaInstance.url}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              prompt: "hi",
              stream: false,
              options: { num_predict: 1 },
            }),
            signal: AbortSignal.timeout(60_000), // 60s for cold load
          });
          if (resp.ok) {
            await resp.json(); // consume body
            _warmLogger.info(`Ollama model "${model}" warmed successfully`);
          }
        } catch {
          // Non-fatal — model will warm on first real request
        }
      })(),
    );
  }

  // ── Warm LM Studio ───────────────────────────────────────────
  const lmsInstance = Array.from(instances.values()).find(
    (i) => i.type === "lmstudio" && i.status === "online" && i.models.length > 0,
  );
  if (lmsInstance) {
    const model = lmsInstance.models[0];
    warmPromises.push(
      (async () => {
        try {
          _warmLogger.info(`Warming LM Studio model "${model}"...`);
          const resp = await fetch(`${lmsInstance.url}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: "hi" }],
              max_tokens: 1,
            }),
            signal: AbortSignal.timeout(60_000), // 60s for cold load
          });
          if (resp.ok) {
            await resp.json(); // consume body
            _warmLogger.info(`LM Studio model "${model}" warmed successfully`);
          }
        } catch {
          // Non-fatal — model will warm on first real request
        }
      })(),
    );
  }

  // Run warmups in parallel, non-blocking
  await Promise.allSettled(warmPromises);
}
