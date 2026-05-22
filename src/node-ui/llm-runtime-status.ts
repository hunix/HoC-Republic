/**
 * LLM Runtime Status
 *
 * Probes local LLM runtimes (Ollama, LM Studio, BitNet) to report
 * which models are loaded, their VRAM usage, and which consumers
 * (plugins/citizens) are actively using them.
 */

import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("node-ui:llm-status");

// ─── Types ───────────────────────────────────────────────────────

export interface LlmRuntime {
  name: "ollama" | "lm-studio" | "bitnet" | "custom";
  running: boolean;
  url: string;
  version?: string;
  models: LlmModel[];
  error?: string;
}

export interface LlmModel {
  name: string;
  /** Size on disk (human-readable) */
  size?: string;
  /** Parameter count (human-readable, e.g. "7B") */
  parameters?: string;
  /** Quantization level (e.g. "Q4_K_M") */
  quantization?: string;
  /** Whether the model is currently loaded in memory */
  loaded: boolean;
  /** VRAM usage in MB (if known) */
  vramMb?: number;
}

export interface LlmStatusReport {
  runtimes: LlmRuntime[];
  totalModels: number;
  totalLoadedModels: number;
  detectedAt: string;
}

// ─── Probe Functions ────────────────────────────────────────────

/**
 * Probe Ollama at localhost:11434.
 */
async function probeOllama(): Promise<LlmRuntime> {
  const url = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const runtime: LlmRuntime = {
    name: "ollama",
    running: false,
    url,
    models: [],
  };

  try {
    // Check if Ollama is running
    const versionRes = await fetch(`${url}/api/version`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!versionRes.ok) {
      return runtime;
    }

    const versionData = (await versionRes.json()) as { version?: string };
    runtime.running = true;
    runtime.version = versionData.version;

    // Get available models
    const tagsRes = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (tagsRes.ok) {
      const tagsData = (await tagsRes.json()) as {
        models?: Array<{
          name: string;
          size?: number;
          details?: { parameter_size?: string; quantization_level?: string };
        }>;
      };

      if (tagsData.models) {
        runtime.models = tagsData.models.map((m) => ({
          name: m.name,
          size: m.size ? formatBytes(m.size) : undefined,
          parameters: m.details?.parameter_size,
          quantization: m.details?.quantization_level,
          loaded: false, // Will be updated by running models check
        }));
      }
    }

    // Check running models (Ollama /api/ps)
    try {
      const psRes = await fetch(`${url}/api/ps`, {
        signal: AbortSignal.timeout(3000),
      });
      if (psRes.ok) {
        const psData = (await psRes.json()) as {
          models?: Array<{
            name: string;
            size?: number;
            size_vram?: number;
          }>;
        };
        if (psData.models) {
          for (const running of psData.models) {
            const model = runtime.models.find((m) => m.name === running.name);
            if (model) {
              model.loaded = true;
              model.vramMb = running.size_vram
                ? Math.round(running.size_vram / (1024 * 1024))
                : undefined;
            }
          }
        }
      }
    } catch {
      // /api/ps is optional
    }

    logger.info(`Ollama detected: ${runtime.models.length} models`, { version: runtime.version });
  } catch {
    // Ollama not running
  }

  return runtime;
}

/**
 * Probe LM Studio at localhost:1234.
 */
async function probeLmStudio(): Promise<LlmRuntime> {
  const url = process.env.LM_STUDIO_URL ?? "http://localhost:1234";
  const runtime: LlmRuntime = {
    name: "lm-studio",
    running: false,
    url,
    models: [],
  };

  try {
    const modelsRes = await fetch(`${url}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!modelsRes.ok) {
      return runtime;
    }

    runtime.running = true;

    const modelsData = (await modelsRes.json()) as {
      data?: Array<{ id: string; object?: string }>;
    };

    if (modelsData.data) {
      runtime.models = modelsData.data.map((m) => ({
        name: m.id,
        loaded: true, // LM Studio models are loaded when listed
      }));
    }

    logger.info(`LM Studio detected: ${runtime.models.length} models`);
  } catch {
    // LM Studio not running
  }

  return runtime;
}

/**
 * Probe BitNet (custom local runtime).
 */
async function probeBitNet(): Promise<LlmRuntime> {
  const url = process.env.BITNET_URL ?? "http://localhost:8080";
  const runtime: LlmRuntime = {
    name: "bitnet",
    running: false,
    url,
    models: [],
  };

  try {
    const healthRes = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!healthRes.ok) {
      return runtime;
    }

    runtime.running = true;

    // BitNet typically runs a single model
    const healthData = (await healthRes.json()) as {
      model?: string;
      status?: string;
    };

    if (healthData.model) {
      runtime.models = [
        {
          name: healthData.model,
          loaded: healthData.status === "ok",
          quantization: "1-bit",
        },
      ];
    }

    logger.info("BitNet detected", { model: healthData.model });
  } catch {
    // BitNet not running
  }

  return runtime;
}

// ─── Main Entry ─────────────────────────────────────────────────

/**
 * Probe all known LLM runtimes and return a consolidated status report.
 */
export async function getLlmRuntimeStatus(): Promise<LlmStatusReport> {
  const [ollama, lmStudio, bitnet] = await Promise.all([
    probeOllama(),
    probeLmStudio(),
    probeBitNet(),
  ]);

  const runtimes = [ollama, lmStudio, bitnet];
  const totalModels = runtimes.reduce((sum, r) => sum + r.models.length, 0);
  const totalLoadedModels = runtimes.reduce(
    (sum, r) => sum + r.models.filter((m) => m.loaded).length,
    0,
  );

  return {
    runtimes,
    totalModels,
    totalLoadedModels,
    detectedAt: new Date().toISOString(),
  };
}

// ─── Utility ────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}
