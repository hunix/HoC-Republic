import { exec, spawn } from "child_process";
import { promises as fsPromises } from "fs";
import * as path from "path";
import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { getDockerDiagnostics } from "../../../republic/docker-orchestrator.js";
import { getHocPython } from "../../../republic/hoc-python.js";
import {
  deregisterInstance,
  getDownloadedBitnetModels,
  getInstance,
  getLocalInstances,
  registerBitNetInstance,
} from "../../../republic/local-compute.js";

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Check if an Ollama-compatible server is alive.
 * Ollama does NOT expose /health — use /api/tags instead.
 */
async function isOllamaAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check if an LM-Studio/OpenAI-compatible server is alive.
 * Uses the standard /v1/models endpoint.
 */
async function isLMStudioAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check if a generic llama-server is alive (BitNet servers expose /health).
 */
async function isServerAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Re-export for use elsewhere
export { isOllamaAlive, isLMStudioAlive, isServerAlive };

/** Resolve the absolute path for a model by name or explicit path. */
function resolveModelPath(model?: string, explicitPath?: string): string | undefined {
  if (explicitPath) {
    return explicitPath;
  }
  const downloaded = getDownloadedBitnetModels();
  if (!model) {
    return downloaded[0]?.path;
  }
  // Match by filename or repo name
  const match = downloaded.find(
    (d: { file: string; path: string; repo: string }) =>
      d.file === model ||
      d.path === model ||
      d.repo.toLowerCase().includes(model.toLowerCase()) ||
      d.file.toLowerCase().includes(model.toLowerCase()),
  );
  return match?.path ?? downloaded[0]?.path;
}

/** Find the llama-server binary, checking multiple locations. */
async function findServerBinary(): Promise<string | undefined> {
  const isWin = process.platform === "win32";
  const ext = isWin ? ".exe" : "";
  const candidates = [
    // Prefer models/bitnet/llama-cpp/ (pre-built binaries)
    path.join(process.cwd(), "models", "bitnet", "llama-cpp", `llama-server${ext}`),
    // Classic cmake build output
    path.join(process.cwd(), "bitnet", "build", "bin", "Release", `llama-server${ext}`),
    path.join(process.cwd(), "bitnet", "build", "bin", `llama-server${ext}`),
  ];

  for (const bin of candidates) {
    try {
      await fsPromises.access(bin);
      return bin;
    } catch {
      // continue
    }
  }
  return undefined;
}

// ─── Handlers ───────────────────────────────────────────────────

export const computeHandlers: GatewayRequestHandlers = {
  // ─── Ollama live status ─────────────────────────────────────────
  "llm.ollama.list": async ({ respond }) => {
    try {
      const alive = await isOllamaAlive("http://127.0.0.1:11434").catch(() => false);
      if (!alive) {
        respond(true, { online: false, models: [] }, undefined);
        return;
      }
      const res = await fetch("http://127.0.0.1:11434/api/tags", {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        respond(true, { online: true, models: [] }, undefined);
        return;
      }
      const data = (await res.json()) as {
        models?: {
          name: string;
          size?: number;
          details?: { parameter_size?: string; quantization_level?: string; family?: string };
        }[];
      };
      const models = (data.models ?? []).map((m) => ({
        name: m.name,
        size: m.size ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB` : "?",
        quantization: m.details?.quantization_level ?? "?",
        params: m.details?.parameter_size ?? "?",
        contextLen: 4096,
        status: "available" as const,
      }));
      respond(true, { online: true, models }, undefined);
    } catch {
      respond(true, { online: false, models: [] }, undefined);
    }
  },

  // ─── BitNet local status ────────────────────────────────────────
  "republic.compute.local.status": async ({ respond }) => {
    const instances = getLocalInstances();
    const downloadedBitnetModels = getDownloadedBitnetModels();

    // Probe Ollama (127.0.0.1:11434) and LM Studio (127.0.0.1:1234) in parallel
    const [ollamaResult, lmstudioResult] = await Promise.allSettled([
      // Ollama probe
      (async () => {
        const alive = await isOllamaAlive("http://127.0.0.1:11434").catch(() => false);
        if (!alive) { return { running: false, models: [] as Array<{ name: string; size?: string; quantization?: string; params?: string; status?: string }> }; }
        const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(5000) });
        if (!res.ok) { return { running: true, models: [] as Array<{ name: string; size?: string; quantization?: string; params?: string; status?: string }> }; }
        const data = (await res.json()) as { models?: { name: string; size?: number; details?: { parameter_size?: string; quantization_level?: string } }[] };
        return {
          running: true,
          models: (data.models ?? []).map((m) => ({
            name: m.name,
            size: m.size ? `${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB` : "?",
            quantization: m.details?.quantization_level ?? "?",
            params: m.details?.parameter_size ?? "?",
            status: "available" as const,
          })),
        };
      })(),
      // LM Studio probe
      (async () => {
        const res = await fetch("http://127.0.0.1:1234/v1/models", { signal: AbortSignal.timeout(3000) });
        if (!res.ok) { return { online: false, models: [] as string[] }; }
        const data = (await res.json()) as { data?: { id: string }[] };
        return { online: true, models: (data.data ?? []).map((m) => m.id) };
      })().catch(() => ({ online: false as const, models: [] as string[] })),
    ]);

    const ollama = ollamaResult.status === "fulfilled" ? ollamaResult.value : { running: false, models: [] };
    const lmstudio = lmstudioResult.status === "fulfilled" ? lmstudioResult.value : { online: false, models: [] };

    respond(true, { instances, downloadedBitnetModels, ollama, lmstudio }, undefined);
  },

  "republic.compute.local.download": async ({ params, respond }) => {
    const { type, repoOrTag } = params as { type: string; repoOrTag: string };

    if (type === "ollama") {
      try {
        const res = await fetch(`http://127.0.0.1:11434/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: repoOrTag }),
        });
        if (res.ok) {
          return respond(true, { success: true }, undefined);
        }
        return respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Failed to pull ollama model"));
      } catch (err) {
        return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    }

    if (type === "bitnet" || type === "huggingface") {
      // Pure HTTP download from HuggingFace — no Python dependency required.
      try {
        const modelsDir = path.join(process.cwd(), "models", "bitnet");
        await fsPromises.mkdir(modelsDir, { recursive: true });

        const repo = repoOrTag.trim();
        const safeRepoName = repo.replace(/\//g, "--");
        const localDir = path.join(modelsDir, safeRepoName);

        // Check if already downloaded
        try {
          const existing = await fsPromises.readdir(localDir);
          if (existing.some((f: string) => f.endsWith(".gguf"))) {
            return respond(
              true,
              { success: true, message: "Model already downloaded", path: localDir },
              undefined,
            );
          }
        } catch {
          // Directory doesn't exist yet — proceed
        }

        // Step 1: Query HuggingFace API
        const apiUrl = `https://huggingface.co/api/models/${repo}`;
        const apiRes = await fetch(apiUrl, {
          headers: { Accept: "application/json" },
        });

        if (!apiRes.ok) {
          return respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `HuggingFace API returned ${apiRes.status} for ${repo}. Check the repo name.`));
        }

        const repoInfo = (await apiRes.json()) as {
          siblings?: { rfilename: string }[];
        };

        // Step 2: Find GGUF files
        const allFiles = repoInfo.siblings ?? [];
        const ggufFiles = allFiles.map((s) => s.rfilename).filter((name) => name.endsWith(".gguf"));

        if (ggufFiles.length === 0) {
          return respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `No .gguf files found in ${repo}. This repo may not contain pre-converted GGUF models.`));
        }

        const targetFile = ggufFiles[0];

        // Step 3: Stream-download the file
        await fsPromises.mkdir(localDir, { recursive: true });
        const downloadUrl = `https://huggingface.co/${repo}/resolve/main/${targetFile}`;
        const destPath = path.join(localDir, path.basename(targetFile));

        console.log(`[BitNet] Downloading ${downloadUrl} → ${destPath}`);

        const dlRes = await fetch(downloadUrl, { redirect: "follow" });
        if (!dlRes.ok || !dlRes.body) {
          return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to download ${targetFile}: HTTP ${dlRes.status}`));
        }

        const { Readable } = await import("stream");
        const { pipeline } = await import("stream/promises");
        const fileStream = (await import("fs")).createWriteStream(destPath);
        const nodeReadable = Readable.fromWeb(dlRes.body as import("stream/web").ReadableStream);
        await pipeline(nodeReadable, fileStream);

        console.log(`[BitNet] Download complete: ${destPath}`);
        return respond(
          true,
          { success: true, path: destPath, file: targetFile, repo, allGgufFiles: ggufFiles },
          undefined,
        );
      } catch (httpErr) {
        console.warn(`[BitNet] HTTP download failed: ${String(httpErr)}. Falling back to CLI...`);

        return new Promise<void>((resolve) => {
          exec(`huggingface-cli download ${repoOrTag}`, { timeout: 300_000 }, (err1) => {
            if (!err1) {
              respond(true, { success: true, method: "huggingface-cli" }, undefined);
              return resolve();
            }
            exec(
              `"${getHocPython()}" -m huggingface_hub download ${repoOrTag}`,
              { timeout: 300_000 },
              (err2) => {
                if (!err2) {
                  respond(true, { success: true, method: "python-module" }, undefined);
                } else {
                  respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `All download methods failed. HTTP error: ${httpErr}. CLI error: ${err2.message}`));
                }
                resolve();
              },
            );
          });
        });
      }
    }

    if (type === "lmstudio") {
      try {
        const res = await fetch(`http://127.0.0.1:1234/api/v1/models/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: repoOrTag }),
        });
        if (res.ok) {
          return respond(true, { success: true }, undefined);
        }
      } catch {
        // REST API not available — fall back to CLI
      }
      return new Promise<void>((resolve) => {
        exec(`lms get "${repoOrTag}"`, { timeout: 600_000 }, (error) => {
          if (!error) {
            respond(true, { success: true }, undefined);
          } else {
            respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "LM Studio CLI not found. Ensure lms is in PATH or LM Studio is running on port 1234."));
          }
          resolve();
        });
      });
    }

    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Download unsupported for " + type));
  },

  "republic.compute.local.remove": async ({ params, respond }) => {
    const { instanceId, model, type, name } = params as {
      instanceId?: string; model?: string; type?: string; name?: string;
    };

    // Support both {type, name} params from Ollama UI and legacy {instanceId, model}
    const isOllama = type === "ollama" || instanceId?.startsWith("ollama");
    const isBitnet = type === "bitnet" || instanceId?.startsWith("bitnet");
    const modelName = name ?? model ?? "";

    if (isOllama) {
      try {
        const res = await fetch("http://127.0.0.1:11434/api/delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: modelName }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          return respond(true, { success: true }, undefined);
        }
        return respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Ollama delete failed: HTTP ${res.status}`));
      } catch (err) {
        return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    }

    // For BitNet: delete the GGUF file from disk
    if (isBitnet) {
      try {
        const downloaded = getDownloadedBitnetModels();
        const match = downloaded.find(
          (d: { file: string; path: string }) =>
            d.file === modelName ||
            d.path === modelName ||
            d.file.toLowerCase().includes(modelName.toLowerCase()),
        );
        if (match) {
          await fsPromises.unlink(match.path);
          console.log(`[BitNet] Deleted model file: ${match.path}`);

          // Check if the repo directory is now empty and clean it up
          const repoDir = path.dirname(match.path);
          const remaining = await fsPromises.readdir(repoDir);
          if (remaining.length === 0) {
            await fsPromises.rmdir(repoDir);
          }
        }
        return respond(true, { success: true, deleted: match?.path }, undefined);
      } catch (err) {
        return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    }

    respond(true, { success: true }, undefined);
  },

  "republic.compute.local.start": async ({ params, respond }) => {
    const {
      instanceId,
      model,
      modelPath: explicitPath,
    } = params as {
      instanceId?: string;
      model?: string;
      modelPath?: string;
    };

    // For BitNet, spawn the llama-server inference process
    if ((instanceId && instanceId.startsWith("bitnet")) || explicitPath) {
      const resolvedModelPath = resolveModelPath(model, explicitPath);

      if (!resolvedModelPath) {
        return respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "No BitNet model found. Download one first."));
      }

      console.log(`[BitNet] Starting inference with model: ${resolvedModelPath}`);

      const port = 8080;
      const serverUrl = `http://127.0.0.1:${port}`;

      // Check if server is already running on this port
      if (await isServerAlive(serverUrl)) {
        // Server is already up — just ensure it's registered
        registerBitNetInstance("http://127.0.0.1", port, path.basename(resolvedModelPath), "user");
        return respond(
          true,
          {
            success: true,
            modelPath: resolvedModelPath,
            port,
            message: "Server already running on this port.",
          },
          undefined,
        );
      }

      // Find the llama-server binary
      const binPath = await findServerBinary();

      if (!binPath) {
        // No compiled binary — register the model and inform user
        registerBitNetInstance("http://127.0.0.1", port, path.basename(resolvedModelPath), "user");
        return respond(
          true,
          {
            success: true,
            modelPath: resolvedModelPath,
            message:
              "Model registered. BitNet binary not found — run setup_env.py in the bitnet/ directory to compile llama-server, or use the model via the BitNet engine.",
          },
          undefined,
        );
      }

      // Spawn the server detached so it survives independently
      const threads = Math.max(2, Math.floor((await import("os")).cpus().length * 0.5));
      const args = [
        "-m",
        resolvedModelPath,
        "--port",
        String(port),
        "-ngl",
        "0",
        "-t",
        String(threads),
        "-c",
        "2048",
      ];

      console.log(`[BitNet] Spawning: ${binPath} ${args.join(" ")}`);

      try {
        const child = spawn(binPath, args, {
          detached: true,
          stdio: "ignore",
        });
        child.unref();

        const pid = child.pid;

        // Handle spawn errors
        child.on("error", (err) => {
          console.error(`[BitNet] Failed to spawn server: ${err.message}`);
        });

        // Register the instance with PID tracking
        registerBitNetInstance(
          "http://127.0.0.1",
          port,
          path.basename(resolvedModelPath),
          "user",
          pid,
        );

        return respond(
          true,
          { success: true, modelPath: resolvedModelPath, port, binary: binPath, pid },
          undefined,
        );
      } catch (err) {
        return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to spawn llama-server: ${String(err)}`));
      }
    }

    respond(true, { success: true }, undefined);
  },

  "republic.compute.local.stop": async ({ params, respond }) => {
    const { instanceId } = params as { instanceId: string; model?: string };

    if (instanceId.startsWith("bitnet")) {
      const inst = getInstance(instanceId);

      // Try to kill by tracked PID first (targeted)
      if (inst?.pid) {
        try {
          process.kill(inst.pid);
          console.log(`[BitNet] Killed server process PID ${inst.pid}`);
        } catch (err) {
          console.warn(`[BitNet] Could not kill PID ${inst.pid}: ${String(err)}`);
        }
      }

      // Fallback: kill by process name in case PID tracking failed
      return new Promise<void>((resolve) => {
        const killCmd =
          process.platform === "win32"
            ? 'taskkill /IM "llama-server.exe" /F 2>nul'
            : "pkill -f llama-server 2>/dev/null || true";

        exec(killCmd, { timeout: 5000 }, () => {
          console.log("[BitNet] Inference process stopped");
          // Deregister the instance so it disappears from the dashboard
          deregisterInstance(instanceId);
          respond(true, { success: true }, undefined);
          resolve();
        });
      });
    }

    respond(true, { success: true }, undefined);
  },

  "republic.docker.status": ({ respond }) => {
    const diagnostics = getDockerDiagnostics();
    respond(true, { diagnostics, containers: diagnostics.allContainers ?? [] }, undefined);
  },

  "republic.lmstudio.health": async ({ respond }) => {
    try {
      const modelsRes = await fetch("http://127.0.0.1:1234/v1/models", {
        signal: AbortSignal.timeout(3000),
      });
      if (!modelsRes.ok) {
        return respond(true, { online: false, error: `HTTP ${modelsRes.status}` }, undefined);
      }
      const modelsData = (await modelsRes.json()) as {
        data?: { id: string; object: string; owned_by?: string }[];
      };
      const models = modelsData.data ?? [];
      const loadedModel = models.length > 0 ? models[0].id : null;

      let serverInfo: Record<string, unknown> = {};
      try {
        const infoRes = await fetch("http://127.0.0.1:1234/api/v1/status", {
          signal: AbortSignal.timeout(2000),
        });
        if (infoRes.ok) {
          serverInfo = (await infoRes.json()) as Record<string, unknown>;
        }
      } catch {
        // Native API may not be available
      }

      return respond(
        true,
        {
          online: true,
          loadedModel,
          modelCount: models.length,
          models: models.map((m) => m.id),
          serverInfo,
        },
        undefined,
      );
    } catch {
      return respond(true, { online: false, error: "Connection refused" }, undefined);
    }
  },

  "republic.lmstudio.logs": async ({ respond }) => {
    return new Promise<void>((resolve) => {
      exec("lms log stream --json --source server", { timeout: 3000 }, (_error, stdout) => {
        const lines = (stdout ?? "").trim().split("\n").filter(Boolean);
        const entries = lines.slice(-50).map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return { raw: line };
          }
        });
        respond(true, { entries, count: entries.length }, undefined);
        resolve();
      });
    });
  },

  // ─── Ollama model management ──────────────────────────────────

  /** Load a model into Ollama VRAM via /api/generate with keep_alive */
  "republic.compute.ollama.load": async ({ params, respond }) => {
    const { name } = params as { name: string };
    if (!name) {
      return respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Model name required"));
    }
    try {
      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, prompt: "", keep_alive: "5m" }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        // Drain the NDJSON stream so the connection closes cleanly
        await res.text();
        return respond(true, { success: true, model: name, action: "loaded" }, undefined);
      }
      return respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Ollama load failed: HTTP ${res.status}`));
    } catch (err) {
      return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /** Unload a model from Ollama VRAM via /api/generate with keep_alive=0 */
  "republic.compute.ollama.unload": async ({ params, respond }) => {
    const { name } = params as { name: string };
    if (!name) {
      return respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Model name required"));
    }
    try {
      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, prompt: "", keep_alive: 0 }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        await res.text();
        return respond(true, { success: true, model: name, action: "unloaded" }, undefined);
      }
      return respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Ollama unload failed: HTTP ${res.status}`));
    } catch (err) {
      return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /** Delete an Ollama model entirely */
  "republic.compute.ollama.delete": async ({ params, respond }) => {
    const { name } = params as { name: string };
    if (!name) {
      return respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Model name required"));
    }
    try {
      const res = await fetch("http://127.0.0.1:11434/api/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.ok) {
        return respond(true, { success: true, model: name, action: "deleted" }, undefined);
      }
      const errText = await res.text().catch(() => "");
      return respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Ollama delete failed: HTTP ${res.status} — ${errText}`));
    } catch (err) {
      return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  /** Run inference via Ollama /api/generate — used by the test chat */
  "republic.compute.ollama.generate": async ({ params, respond }) => {
    const { name, prompt } = params as { name: string; prompt: string };
    if (!name || !prompt) {
      return respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Model name and prompt required"));
    }
    try {
      const res = await fetch("http://127.0.0.1:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name, prompt, stream: false }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        return respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `Ollama generate failed: HTTP ${res.status}`));
      }
      const data = (await res.json()) as {
        response?: string;
        total_duration?: number;
        eval_count?: number;
        eval_duration?: number;
      };
      const tokensPerSec = data.eval_count && data.eval_duration
        ? Math.round((data.eval_count / (data.eval_duration / 1e9)) * 100) / 100
        : undefined;
      return respond(true, {
        response: data.response ?? "",
        model: name,
        tokensPerSec,
        totalDurationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : undefined,
      }, undefined);
    } catch (err) {
      return respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },
};
