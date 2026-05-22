/**
 * Republic Platform — LM Studio Strategy Module
 *
 * Implements the "Load Once, Infer Forever" pattern for stable inference.
 *
 * Instead of randomly picking models per citizen per tick (causing
 * concurrent cold-load stampedes that crash LM Studio over TB3 eGPU),
 * this module:
 *
 *   1. Selects ONE preferred model at boot
 *   2. Loads it via the v1 API with optimal GPU config
 *   3. Keeps it loaded (exempt from auto-unload)
 *   4. All citizens infer against this single loaded model
 *   5. Serializes all model operations via a mutex
 *
 * Configuration:
 *   LMSTUDIO_MODEL — override the default preferred model
 *   LMSTUDIO_CONTEXT — override context window (default: auto-detect from VRAM)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { emitNationalEvent } from "./event-sourcing.js";
import { getLatestSurvey } from "./hardware-manager.js";
import {
  listModels,
  loadModel,
  getLoadedModels,
  type LMStudioModelInfo,
  type LMStudioLoadedModel,
} from "./lmstudio-driver.js";

const logger = createSubsystemLogger("lmstudio-strategy");

// ─── Configuration ──────────────────────────────────────────────

/**
 * Preferred model for citizen inference.
 * Set LMSTUDIO_MODEL to override (e.g., "meta-llama/llama-3.2-1b-instruct").
 */
const PREFERRED_MODEL = process.env.LMSTUDIO_MODEL ?? "";

/**
 * Fallback model priority list — tried in order if LMSTUDIO_MODEL is unset
 * or unavailable. Ordered by reliability × capability for citizen inference.
 */
const FALLBACK_MODELS = [
  // Prefer 4B+ models for adequate context windows and quality
  "nvidia/nemotron-3-nano-4b",
  "nvidia/nemotron-3-nano",
  "qwen/qwen3-vl-4b",
  "openai/gpt-oss-20b",
  // 3B models — good balance of speed and capability
  "meta-llama/llama-3.2-3b-instruct",
  "llama-3.2-3b-instruct-abliterated",
  "lmstudio-community/llama-3.2-3b-instruct",
  "mistralai/ministral-3-3b",
  "ibm/granite-4-micro",
  "ibm/granite-4-h-tiny",
  // 1B models — last resort only (too small, context overflows common)
  "meta-llama/llama-3.2-1b-instruct",
  "lmstudio-community/llama-3.2-1b-instruct",
  "liquid/lfm2.5-1.2b",
  "essentialai/rnj-1",
];

/**
 * Maximum model size in bytes that we'll attempt to load.
 * Models larger than this are likely too big for reliable inference
 * over TB3 eGPU and on limited VRAM.  Default: 10 GB.
 */
const MAX_MODEL_SIZE_BYTES = parseInt(
  process.env.LMSTUDIO_MAX_MODEL_SIZE ?? String(10 * 1024 * 1024 * 1024),
  10,
);

// ─── State ──────────────────────────────────────────────────────

interface StrategyState {
  /** The model key that is (or should be) loaded */
  activeModel: string | null;
  /** True once the preferred model is confirmed loaded in VRAM */
  ready: boolean;
  /** Timestamp of last successful load */
  loadedAt: number;
  /** True if a load operation is in progress */
  loading: boolean;
  /** Number of consecutive load failures */
  loadFailures: number;
}

const state: StrategyState = {
  activeModel: null,
  ready: false,
  loadedAt: 0,
  loading: false,
  loadFailures: 0,
};

// ─── Mutex for serializing model operations ─────────────────────

let _mutexPromise: Promise<void> = Promise.resolve();

/**
 * Serialize model operations — only one load/unload at a time.
 * This prevents the concurrent cold-load stampede that crashes LM Studio.
 */
async function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const acquired = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = _mutexPromise;
  _mutexPromise = acquired;

  await prev; // Wait for previous operation to complete
  try {
    return await fn();
  } finally {
    release!();
  }
}

// ─── Context Window Auto-Detection ──────────────────────────────

/**
 * Determine optimal context window based on available VRAM.
 * Smaller context = less VRAM, more headroom for model weights.
 *
 * NOTE: Citizen system prompts need ~2200 tokens minimum.
 * Context=2048 always overflows → use 4096 as the floor.
 *
 *   ≤ 8 GB VRAM  → 4096 tokens (floor — system prompts need ~2200)
 *   ≤ 24 GB VRAM → 4096 tokens (conservative for eGPU stability)
 *   > 24 GB VRAM → 8192 tokens
 */
function getOptimalContextLength(): number {
  if (process.env.LMSTUDIO_CONTEXT) {
    return parseInt(process.env.LMSTUDIO_CONTEXT, 10);
  }
  const survey = getLatestSurvey();
  const vram = survey?.vramGB ?? 0;
  if (vram <= 24) {
    return 4096;
  }
  return 8192;
}

// ─── Core Strategy Functions ────────────────────────────────────

/**
 * Select the preferred model from available models.
 * Uses the v1 API `type` field to filter out embedding models.
 *
 * Priority:
 *   1. LMSTUDIO_MODEL env var (exact match)
 *   2. Already-loaded LLM (avoid unnecessary unload/reload)
 *   3. First match from FALLBACK_MODELS that's available locally
 *   4. Any LLM available under MAX_MODEL_SIZE_BYTES
 */
async function selectPreferredModel(): Promise<string | null> {
  try {
    const allModels = await listModels();

    // Filter to LLMs only, under size limit
    const llms = allModels.filter(
      (m: LMStudioModelInfo) => m.type === "llm" && m.sizeBytes <= MAX_MODEL_SIZE_BYTES,
    );

    if (llms.length === 0) {
      logger.warn("No LLM models available in LM Studio");
      return null;
    }

    // 1. Explicit preference via env var
    if (PREFERRED_MODEL) {
      const found = llms.find(
        (m: LMStudioModelInfo) => m.key === PREFERRED_MODEL || m.key.includes(PREFERRED_MODEL),
      );
      if (found) {
        return found.key;
      }
      logger.warn(`Preferred model "${PREFERRED_MODEL}" not found — trying fallbacks`);
    }

    // 2. Already-loaded LLM — avoid churn, BUT only if it's a good model
    //    Don't keep a loaded 1B model if better 4B+ options are available
    const loaded = llms.filter((m: LMStudioModelInfo) => m.loadedInstances.length > 0);
    if (loaded.length > 0) {
      // Check if the loaded model is in the top half of fallback priority
      const topHalf = FALLBACK_MODELS.slice(0, Math.ceil(FALLBACK_MODELS.length / 2));
      const loadedKey = loaded[0].key;
      const isGoodModel = topHalf.some(
        (fb) => loadedKey === fb || loadedKey.toLowerCase().includes(fb.toLowerCase()),
      );
      if (isGoodModel) {
        logger.info(`Using already-loaded model: "${loadedKey}"`);
        return loadedKey;
      }
      logger.info(`Already-loaded model "${loadedKey}" is low-priority — selecting a better one`);
    }

    // 3. Match from fallback priority list
    for (const fallback of FALLBACK_MODELS) {
      const found = llms.find(
        (m: LMStudioModelInfo) =>
          m.key === fallback || m.key.toLowerCase().includes(fallback.toLowerCase()),
      );
      if (found) {
        return found.key;
      }
    }

    // 4. Any LLM under size limit — pick smallest for fastest loading
    const sorted = llms.toSorted(
      (a: LMStudioModelInfo, b: LMStudioModelInfo) => a.sizeBytes - b.sizeBytes,
    );
    return sorted[0]?.key ?? null;
  } catch (err) {
    logger.warn(`Model selection failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Ensure the preferred model is loaded in LM Studio VRAM.
 *
 * This is the main entry point — call at boot and periodically.
 * Thread-safe via mutex serialization.
 * Retries up to 3 times with exponential backoff on transient failures.
 */
export async function ensureModelLoaded(): Promise<boolean> {
  return withMutex(async () => {
    // Already loaded and ready
    if (state.ready && state.activeModel) {
      // Verify it's still actually loaded
      const loaded = getLoadedModels();
      if (loaded.some((m: LMStudioLoadedModel) => m.key === state.activeModel)) {
        return true;
      }
      // Model was ejected externally (e.g., user unloaded in UI)
      logger.warn(`Active model "${state.activeModel}" was unloaded externally — reloading`);
      state.ready = false;
    }

    if (state.loading) {
      return false; // Another load is in progress
    }

    state.loading = true;

    try {
      // Retry model selection with backoff (handles transient 500s during boot)
      let modelKey: string | null = null;
      const maxRetries = 3;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        modelKey = await selectPreferredModel();
        if (modelKey) {
          break;
        }
        // Wait before retry — longer each time (2s, 4s, 8s)
        const delayMs = 2000 * Math.pow(2, attempt);
        logger.info(
          `Model selection attempt ${attempt + 1}/${maxRetries} failed — retrying in ${delayMs / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }

      if (!modelKey) {
        logger.warn(
          "No suitable LLM found in LM Studio after retries — scheduling background retry",
        );
        scheduleBackgroundRetry();
        return false;
      }

      // Check if it's already loaded
      const loaded = getLoadedModels();
      if (loaded.some((m: LMStudioLoadedModel) => m.key === modelKey)) {
        state.activeModel = modelKey;
        state.ready = true;
        state.loadedAt = Date.now();
        state.loadFailures = 0;
        logger.info(`Model "${modelKey}" already loaded — strategy ready`);
        emitNationalEvent("infrastructure", "strategy_model_ready", "lmstudio-strategy", {
          model: modelKey,
          action: "already_loaded",
        });
        cancelBackgroundRetry();
        return true;
      }

      // Load it with optimal config
      const contextLength = getOptimalContextLength();
      logger.info(`Loading model "${modelKey}" with context=${contextLength}...`);

      const result = await loadModel({
        model: modelKey,
        contextLength,
        flashAttention: true,
        offloadKvCacheToGpu: true,
        evalBatchSize: 512,
        echoLoadConfig: true,
      });

      state.activeModel = modelKey;
      state.ready = true;
      state.loadedAt = Date.now();
      state.loadFailures = 0;

      logger.info(
        `Model "${modelKey}" loaded in ${result.loadTimeSeconds.toFixed(1)}s — strategy ready`,
      );
      emitNationalEvent("infrastructure", "strategy_model_loaded", "lmstudio-strategy", {
        model: modelKey,
        loadTimeSeconds: result.loadTimeSeconds,
        contextLength,
      });

      cancelBackgroundRetry();
      return true;
    } catch (err) {
      state.loadFailures++;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`Failed to load model (attempt #${state.loadFailures}): ${msg}`);
      emitNationalEvent("infrastructure", "strategy_load_failed", "lmstudio-strategy", {
        model: state.activeModel,
        error: msg,
        attempt: state.loadFailures,
      });
      scheduleBackgroundRetry();
      return false;
    } finally {
      state.loading = false;
    }
  });
}

// ─── Background Retry Timer ─────────────────────────────────────

let _retryInterval: NodeJS.Timeout | null = null;

/**
 * Schedule a background retry every 15s until the strategy is ready.
 * Non-blocking — citizens fall to reflex/cloud while waiting.
 */
function scheduleBackgroundRetry(): void {
  if (_retryInterval) {
    return;
  } // Already scheduled
  // Escalate interval based on consecutive failures: 15s -> 30s -> 60s -> 120s -> 300s max
  const intervalMs = Math.min(300_000, 15_000 * Math.pow(2, Math.min(state.loadFailures - 1, 4)));
  if (state.loadFailures <= 1) {
    logger.info(`Background retry scheduled — will retry every ${Math.round(intervalMs / 1000)}s`);
  }
  _retryInterval = setInterval(() => {
    if (state.ready) {
      cancelBackgroundRetry();
      return;
    }
    ensureModelLoaded().catch(() => {});
  }, intervalMs);
  // Non-critical retry — must not prevent graceful shutdown
  _retryInterval.unref();
}

function cancelBackgroundRetry(): void {
  if (_retryInterval) {
    clearInterval(_retryInterval);
    _retryInterval = null;
  }
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Get the model key to use for inference.
 * Returns `null` if no model is loaded (callers should fall to reflex).
 */
export function getActiveModel(): string | null {
  return state.ready ? state.activeModel : null;
}

/**
 * True when the preferred model is confirmed loaded and ready for inference.
 */
export function isStrategyReady(): boolean {
  return state.ready && state.activeModel !== null;
}

/**
 * Get strategy diagnostics for the UI.
 */
export function getStrategyDiagnostics(): {
  activeModel: string | null;
  ready: boolean;
  loadedAt: number;
  loadFailures: number;
  preferredModel: string;
  contextLength: number;
} {
  return {
    activeModel: state.activeModel,
    ready: state.ready,
    loadedAt: state.loadedAt,
    loadFailures: state.loadFailures,
    preferredModel: PREFERRED_MODEL || "(auto-select)",
    contextLength: getOptimalContextLength(),
  };
}

/**
 * Get the list of available LLM models (excluding embeddings).
 * Uses the v1 API `type` field for reliable filtering.
 */
export async function getAvailableLLMs(): Promise<LMStudioModelInfo[]> {
  try {
    const allModels = await listModels();
    return allModels.filter(
      (m: LMStudioModelInfo) => m.type === "llm" && m.sizeBytes <= MAX_MODEL_SIZE_BYTES,
    );
  } catch {
    return [];
  }
}

/**
 * Force re-selection and reload of the active model.
 * Used when the user changes LMSTUDIO_MODEL or wants to switch.
 */
export async function reloadModel(): Promise<boolean> {
  state.ready = false;
  state.activeModel = null;
  state.loadFailures = 0;
  return ensureModelLoaded();
}
