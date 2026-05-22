/**
 * Infrastructure — InspireMusic Engine
 *
 * Manages the InspireMusic Python environment:
 *   1. Auto-detects Python 3
 *   2. Auto-clones FunAudioLLM/InspireMusic (with submodules)
 *   3. Auto-installs via setup.py + flash-attn
 *   4. Auto-downloads model weights from HuggingFace
 *   5. Spawns Python subprocess for music generation
 *
 * Uses inspiremusic.cli.inference.InspireMusicModel.
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChorusMode, InspireMusicConfig, MusicTask, OutputFormat } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/FunAudioLLM/InspireMusic.git";
const REPO_DIR_NAME = "InspireMusic";

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
    { cmd: "py", args: ["-3", "----version"] },
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

export interface InspireMusicInstallStatus {
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
 * Auto-clone InspireMusic with submodules.
 */
function ensureRepoCloned(parentDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  repoDir: string;
  error?: string;
} {
  const repoDir = path.join(parentDir, REPO_DIR_NAME);

  if (
    fs.existsSync(path.join(repoDir, "setup.py")) ||
    fs.existsSync(path.join(repoDir, "inspiremusic"))
  ) {
    return { cloned: true, autoCloned: false, repoDir };
  }

  try {
    fs.mkdirSync(parentDir, { recursive: true });
    execSync(`git clone --recursive --depth 1 "${REPO_URL}" "${repoDir}"`, {
      timeout: 180_000,
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
 * Check if inspiremusic is importable.
 */
function checkDeps(pythonCmd: string): boolean {
  try {
    const args =
      pythonCmd === "py"
        ? ["-3", "-c", "from inspiremusic.cli.inference import InspireMusicModel"]
        : ["-c", "from inspiremusic.cli.inference import InspireMusicModel"];
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
 * Install InspireMusic via setup.py + requirements.
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
    // Install requirements
    const reqFile = path.join(repoDir, "requirements.txt");
    if (fs.existsSync(reqFile)) {
      execSync(`${pip} install -r "${reqFile}"`, {
        cwd: repoDir,
        timeout: 300_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
    // Install the package itself
    const setupCmd = pythonCmd === "py" ? `${pythonCmd} -3` : pythonCmd;
    execSync(`${setupCmd} setup.py install`, {
      cwd: repoDir,
      timeout: 300_000,
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
 * Check if model weights are present.
 */
function isModelPresent(modelDir: string, modelName: string): boolean {
  const modelPath = path.join(modelDir, modelName);
  // Check for the LLM checkpoint directory or model files
  return (
    fs.existsSync(path.join(modelPath, "llm.pt")) ||
    fs.existsSync(path.join(modelPath, "flow.pt")) ||
    fs.existsSync(path.join(modelPath, "config.json"))
  );
}

/**
 * Auto-download model weights from HuggingFace via git clone.
 */
function ensureModelDownloaded(
  modelDir: string,
  modelName: string,
): {
  downloaded: boolean;
  autoDownloaded: boolean;
  error?: string;
} {
  if (isModelPresent(modelDir, modelName)) {
    return { downloaded: true, autoDownloaded: false };
  }

  try {
    fs.mkdirSync(modelDir, { recursive: true });
    const modelUrl = `https://huggingface.co/FunAudioLLM/${modelName}`;
    const modelPath = path.join(modelDir, modelName);
    execSync(`git clone "${modelUrl}" "${modelPath}"`, {
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
export function detectInstallation(config: InspireMusicConfig): InspireMusicInstallStatus {
  const errors: string[] = [];
  let pythonAvailable = false;

  // 1. Check Python
  try {
    const result = execFileSyncSafe(config.pythonPath, ["--version"]);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.8+ required, found: ${result.trim()}`);
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

  // 2. Auto-clone repo (with submodules)
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
    modelResult = ensureModelDownloaded(config.modelDir, config.modelName);
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

// ─── Music Generation ───────────────────────────────────────────

export interface GenerationResult {
  process: ChildProcess;
  outputPath: string;
}

/**
 * Spawn a Python subprocess to generate music using InspireMusicModel.
 */
export function generateMusic(
  config: InspireMusicConfig,
  opts: {
    task: MusicTask;
    prompt: string;
    audioPromptPath?: string;
    chorusMode: ChorusMode;
    startTime: number;
    endTime: number;
    fast: boolean;
    outputFormat: OutputFormat;
    outputPath: string;
  },
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): GenerationResult {
  const modelDir = path.join(config.modelDir, config.modelName).replace(/\\/g, "/");

  const audioLine = opts.audioPromptPath
    ? `model.inference("${opts.task}", "${opts.prompt.replace(/"/g, '\\"')}", "${opts.audioPromptPath.replace(/\\/g, "/")}")`
    : `model.inference("${opts.task}", "${opts.prompt.replace(/"/g, '\\"')}")`;

  const script = `
import sys, os
sys.path.insert(0, "${config.installPath.replace(/\\/g, "/")}")
os.environ["INSPIREMUSIC_MODEL_DIR"] = "${modelDir}"

from inspiremusic.cli.inference import InspireMusicModel, env_variables
env_variables()

model = InspireMusicModel(model_name="${config.modelName}")
${audioLine}
print("GENERATION_COMPLETE")
`.trim();

  const pyArgs = config.pythonPath === "py" ? ["-3", "-c", script] : ["-c", script];

  const cp = execFile(
    config.pythonPath,
    pyArgs,
    {
      timeout: config.timeoutMs,
      cwd: config.installPath,
      env: { ...process.env },
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
