/**
 * Infrastructure — GLM-Image Engine
 *
 * Manages the GLM-Image Python environment:
 *   1. Auto-detects Python 3
 *   2. Auto-installs transformers + diffusers from git source
 *   3. Auto-downloads model weights via huggingface-cli
 *   4. Spawns Python subprocess for image generation
 *
 * Uses diffusers GlmImagePipeline under the hood.
 * Requires 80GB+ VRAM (single GPU) or multi-GPU setup.
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GenerationMode, GlmImageConfig } from "../domain/types.ts";

// ─── Auto-Detection Helpers ─────────────────────────────────────

function execFileSyncSafe(cmd: string, args: string[]): string {
  const { execFileSync: efs } = require("node:child_process");
  return efs(cmd, args, {
    encoding: "utf-8",
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
  }) as string;
}

/**
 * Auto-detect a working Python 3 executable.
 */
export function findPython(): string {
  const candidates = [
    { cmd: "python3", args: ["--version"] },
    { cmd: "python", args: ["--version"] },
    { cmd: "py", args: ["-3", "--version"] },
  ];

  for (const { cmd, args } of candidates) {
    try {
      const result = execFileSyncSafe(cmd, args);
      if (result.includes("Python 3.")) {
        return cmd === "py" ? "py" : cmd;
      }
    } catch {
      // try next
    }
  }
  return "python"; // fallback
}

// ─── Installation Status ────────────────────────────────────────

export interface GlmInstallStatus {
  ready: boolean;
  pythonAvailable: boolean;
  depsInstalled: boolean;
  modelDownloaded: boolean;
  autoInstalledDeps: boolean;
  autoDownloadedModel: boolean;
  detectedPython: string;
  errors: string[];
}

/**
 * Check if diffusers is installed with GLM-Image support.
 */
function checkDeps(pythonCmd: string): boolean {
  try {
    const args =
      pythonCmd === "py"
        ? ["-3", "-c", "from diffusers.pipelines.glm_image import GlmImagePipeline"]
        : ["-c", "from diffusers.pipelines.glm_image import GlmImagePipeline"];
    execSync(`${pythonCmd} ${args.join(" ")}`, {
      timeout: 15_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-install transformers and diffusers from git source.
 * GLM-Image requires bleeding-edge versions.
 */
function ensureDepsInstalled(pythonCmd: string): {
  installed: boolean;
  autoInstalled: boolean;
  error?: string;
} {
  if (checkDeps(pythonCmd)) {
    return { installed: true, autoInstalled: false };
  }

  try {
    const pip = pythonCmd === "py" ? `${pythonCmd} -3 -m pip` : `${pythonCmd} -m pip`;
    // Install from git source (required for GLM-Image support)
    execSync(
      `${pip} install "git+https://github.com/huggingface/transformers.git" "git+https://github.com/huggingface/diffusers.git"`,
      { timeout: 300_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return { installed: true, autoInstalled: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      installed: false,
      autoInstalled: false,
      error: `Auto-install deps failed: ${e.message ?? "unknown"}`,
    };
  }
}

/**
 * Check if model weights are cached locally.
 */
function isModelCached(modelId: string, cacheDir: string): boolean {
  // huggingface_hub caches in models--<org>--<name> format
  const safeName = modelId.replace("/", "--");
  const hfCachePath = path.join(cacheDir, `models--${safeName}`);
  return fs.existsSync(hfCachePath);
}

/**
 * Auto-download model weights via huggingface-cli.
 */
function ensureModelDownloaded(
  pythonCmd: string,
  modelId: string,
  cacheDir: string,
): {
  downloaded: boolean;
  autoDownloaded: boolean;
  error?: string;
} {
  if (isModelCached(modelId, cacheDir)) {
    return { downloaded: true, autoDownloaded: false };
  }

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const envPrefix = `HF_HOME="${cacheDir}"`;
    const pip = pythonCmd === "py" ? `${pythonCmd} -3 -m` : `${pythonCmd} -m`;
    execSync(
      `${envPrefix} ${pip} huggingface_hub.cli download "${modelId}"`,
      { timeout: 1800_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }, // 30 min
    );
    return { downloaded: true, autoDownloaded: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      downloaded: false,
      autoDownloaded: false,
      error: `Model download failed: ${e.message ?? "unknown"}`,
    };
  }
}

/**
 * Full detection + auto-bootstrap.
 */
export function detectInstallation(config: GlmImageConfig): GlmInstallStatus {
  const errors: string[] = [];
  let pythonAvailable = false;

  // 1. Check Python
  try {
    const result = execFileSyncSafe(config.pythonPath, ["--version"]);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.10+ required, found: ${result.trim()}`);
    }
  } catch {
    errors.push("Python not found: " + config.pythonPath);
  }

  if (!pythonAvailable) {
    return {
      ready: false,
      pythonAvailable: false,
      depsInstalled: false,
      modelDownloaded: false,
      autoInstalledDeps: false,
      autoDownloadedModel: false,
      detectedPython: config.pythonPath,
      errors,
    };
  }

  // 2. Auto-install deps
  const depsResult = ensureDepsInstalled(config.pythonPath);
  if (!depsResult.installed && depsResult.error) {
    errors.push(depsResult.error);
  }

  // 3. Auto-download model
  let modelResult: {
    downloaded: boolean;
    autoDownloaded: boolean;
    error?: string;
  } = {
    downloaded: false,
    autoDownloaded: false,
  };
  if (depsResult.installed) {
    modelResult = ensureModelDownloaded(config.pythonPath, config.modelId, config.modelCacheDir);
    if (!modelResult.downloaded && modelResult.error) {
      errors.push(modelResult.error);
    }
  }

  return {
    ready: pythonAvailable && depsResult.installed && modelResult.downloaded,
    pythonAvailable,
    depsInstalled: depsResult.installed,
    modelDownloaded: modelResult.downloaded,
    autoInstalledDeps: depsResult.autoInstalled,
    autoDownloadedModel: modelResult.autoDownloaded,
    detectedPython: config.pythonPath,
    errors,
  };
}

// ─── Image Generation ───────────────────────────────────────────

export interface GenerationResult {
  process: ChildProcess;
  outputPath: string;
}

/**
 * Spawn a Python subprocess to generate an image using GlmImagePipeline.
 */
export function generateImage(
  config: GlmImageConfig,
  opts: {
    mode: GenerationMode;
    prompt: string;
    inputImages?: string[];
    width: number;
    height: number;
    seed: number;
    steps: number;
    guidanceScale: number;
    outputPath: string;
  },
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): GenerationResult {
  // Build the Python script inline
  const imageListStr =
    opts.inputImages && opts.inputImages.length > 0
      ? `[${opts.inputImages.map((p) => `"${p.replace(/\\/g, "/")}"`).join(", ")}]`
      : "None";

  const script = `
import torch
from diffusers.pipelines.glm_image import GlmImagePipeline
${opts.mode === "image2image" ? "from PIL import Image" : ""}

pipe = GlmImagePipeline.from_pretrained(
    "${config.modelId}",
    torch_dtype=torch.bfloat16,
    device_map="cuda",
    cache_dir="${config.modelCacheDir.replace(/\\/g, "/")}"
)

${
  opts.mode === "image2image"
    ? `
input_images = [Image.open(p).convert("RGB") for p in ${imageListStr}]
image = pipe(
    prompt="${opts.prompt.replace(/"/g, '\\"')}",
    image=input_images,
    height=${opts.height},
    width=${opts.width},
    num_inference_steps=${opts.steps},
    guidance_scale=${opts.guidanceScale},
    generator=torch.Generator(device="cuda").manual_seed(${opts.seed}),
).images[0]
`
    : `
image = pipe(
    prompt="${opts.prompt.replace(/"/g, '\\"')}",
    height=${opts.height},
    width=${opts.width},
    num_inference_steps=${opts.steps},
    guidance_scale=${opts.guidanceScale},
    generator=torch.Generator(device="cuda").manual_seed(${opts.seed}),
).images[0]
`
}

image.save("${opts.outputPath.replace(/\\/g, "/")}")
print("GENERATION_COMPLETE")
`.trim();

  const pyArgs = config.pythonPath === "py" ? ["-3", "-c", script] : ["-c", script];

  const cp = execFile(
    config.pythonPath,
    pyArgs,
    {
      timeout: config.timeoutMs,
      env: { ...process.env, HF_HOME: config.modelCacheDir },
    },
    (err) => {
      onComplete?.(err ? 1 : 0);
    },
  );

  if (cp.stdout && onProgress) {
    cp.stdout.on("data", (data: Buffer) => {
      for (const line of data
        .toString()
        .split("\n")
        .filter((l) => l.trim())) {
        onProgress(line);
      }
    });
  }
  if (cp.stderr && onProgress) {
    cp.stderr.on("data", (data: Buffer) => {
      onProgress(`[stderr] ${data.toString().trim()}`);
    });
  }

  return { process: cp, outputPath: opts.outputPath };
}

/**
 * Kill a running generation process.
 */
export function killProcess(result: GenerationResult): boolean {
  try {
    result.process.kill("SIGTERM");
    setTimeout(() => {
      try {
        result.process.kill("SIGKILL");
      } catch {
        /* dead */
      }
    }, 5000);
    return true;
  } catch {
    return false;
  }
}
