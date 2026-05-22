/**
 * Infrastructure — OmniGen Engine
 *
 * Manages the OmniGen Python environment:
 *   1. Auto-detects Python 3
 *   2. Auto-clones VectorSpaceLab/OmniGen from GitHub
 *   3. Auto-installs via pip install -e .
 *   4. Auto-downloads model weights (Shitao/OmniGen-v1)
 *   5. Spawns Python subprocess for image generation
 *
 * Uses OmniGenPipeline from the cloned package.
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { OmniGenConfig, OmniGenMode } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/VectorSpaceLab/OmniGen.git";
const REPO_DIR_NAME = "OmniGen";

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
  return "python";
}

// ─── Installation Status ────────────────────────────────────────

export interface OmniGenInstallStatus {
  ready: boolean;
  pythonAvailable: boolean;
  repoCloned: boolean;
  depsInstalled: boolean;
  modelDownloaded: boolean;
  autoCloned: boolean;
  autoInstalledDeps: boolean;
  autoDownloadedModel: boolean;
  detectedPython: string;
  errors: string[];
}

/**
 * Auto-clone the OmniGen repo if not present.
 */
function ensureRepoCloned(parentDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  repoDir: string;
  error?: string;
} {
  const repoDir = path.join(parentDir, REPO_DIR_NAME);

  // Already cloned?
  if (
    fs.existsSync(path.join(repoDir, "setup.py")) ||
    fs.existsSync(path.join(repoDir, "pyproject.toml"))
  ) {
    return { cloned: true, autoCloned: false, repoDir };
  }

  // Auto-clone
  try {
    fs.mkdirSync(parentDir, { recursive: true });
    execSync(`git clone --depth 1 "${REPO_URL}" "${repoDir}"`, {
      timeout: 120_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { cloned: true, autoCloned: true, repoDir };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      cloned: false,
      autoCloned: false,
      repoDir,
      error: `Auto-clone failed: ${e.message ?? "unknown"}`,
    };
  }
}

/**
 * Check if OmniGen is importable.
 */
function checkDeps(pythonCmd: string): boolean {
  try {
    const args =
      pythonCmd === "py"
        ? ["-3", "-c", "from OmniGen import OmniGenPipeline"]
        : ["-c", "from OmniGen import OmniGenPipeline"];
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
 * Install OmniGen in editable mode from cloned repo.
 */
function ensureDepsInstalled(
  pythonCmd: string,
  repoDir: string,
): {
  installed: boolean;
  autoInstalled: boolean;
  error?: string;
} {
  if (checkDeps(pythonCmd)) {
    return { installed: true, autoInstalled: false };
  }

  try {
    const pip = pythonCmd === "py" ? `${pythonCmd} -3 -m pip` : `${pythonCmd} -m pip`;
    execSync(`${pip} install -e "${repoDir}"`, {
      cwd: repoDir,
      timeout: 300_000, // 5 minutes
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { installed: true, autoInstalled: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      installed: false,
      autoInstalled: false,
      error: `Auto-install failed: ${e.message ?? "unknown"}`,
    };
  }
}

/**
 * Check if model weights are cached.
 */
function isModelCached(modelId: string, cacheDir: string): boolean {
  const safeName = modelId.replace("/", "--");
  const hfCachePath = path.join(cacheDir, `models--${safeName}`);
  return fs.existsSync(hfCachePath);
}

/**
 * Auto-download model weights.
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
    execSync(`${envPrefix} ${pip} huggingface_hub.cli download "${modelId}"`, {
      timeout: 1800_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
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
export function detectInstallation(config: OmniGenConfig): OmniGenInstallStatus {
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
      repoCloned: false,
      depsInstalled: false,
      modelDownloaded: false,
      autoCloned: false,
      autoInstalledDeps: false,
      autoDownloadedModel: false,
      detectedPython: config.pythonPath,
      errors,
    };
  }

  // 2. Auto-clone repo
  const repoResult = ensureRepoCloned(path.dirname(config.installPath));
  if (!repoResult.cloned && repoResult.error) {
    errors.push(repoResult.error);
  }

  // 3. Auto-install deps
  let depsResult: {
    installed: boolean;
    autoInstalled: boolean;
    error?: string;
  } = {
    installed: false,
    autoInstalled: false,
  };
  if (repoResult.cloned) {
    depsResult = ensureDepsInstalled(config.pythonPath, repoResult.repoDir);
    if (!depsResult.installed && depsResult.error) {
      errors.push(depsResult.error);
    }
  }

  // 4. Auto-download model
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
    ready: pythonAvailable && repoResult.cloned && depsResult.installed && modelResult.downloaded,
    pythonAvailable,
    repoCloned: repoResult.cloned,
    depsInstalled: depsResult.installed,
    modelDownloaded: modelResult.downloaded,
    autoCloned: repoResult.autoCloned,
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
 * Spawn a Python subprocess to generate an image using OmniGenPipeline.
 *
 * OmniGen uses <img><|image_N|></img> placeholders in the prompt
 * to reference input images. This function auto-maps input_images
 * array indices to the placeholder format.
 */
export function generateImage(
  config: OmniGenConfig,
  opts: {
    mode: OmniGenMode;
    prompt: string;
    inputImages?: string[];
    width: number;
    height: number;
    seed: number;
    guidanceScale: number;
    imgGuidanceScale: number;
    offloadModel: boolean;
    outputPath: string;
  },
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): GenerationResult {
  const hasImages = opts.inputImages && opts.inputImages.length > 0;
  const imageListStr = hasImages
    ? `[${opts.inputImages!.map((p) => `"${p.replace(/\\/g, "/")}"`).join(", ")}]`
    : "None";

  const script = `
from OmniGen import OmniGenPipeline

pipe = OmniGenPipeline.from_pretrained(
    "${config.modelId}",
    cache_dir="${config.modelCacheDir.replace(/\\/g, "/")}"
)

images = pipe(
    prompt="${opts.prompt.replace(/"/g, '\\"')}",
    ${hasImages ? `input_images=${imageListStr},` : ""}
    height=${opts.height},
    width=${opts.width},
    guidance_scale=${opts.guidanceScale},
    ${hasImages ? `img_guidance_scale=${opts.imgGuidanceScale},` : ""}
    seed=${opts.seed},
    ${opts.offloadModel ? "offload_model=True," : ""}
)
images[0].save("${opts.outputPath.replace(/\\/g, "/")}")
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
