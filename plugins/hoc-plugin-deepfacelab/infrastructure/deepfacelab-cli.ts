/**
 * Infrastructure — DeepFaceLab CLI Wrapper
 *
 * Wraps DFL's Python CLI (main.py) in a TypeScript interface.
 * Each pipeline stage maps to a specific CLI sub-command.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3 (python3 / python / py -3)
 *   2. Auto-clones iperov/DeepFaceLab from GitHub
 *   3. Auto-installs requirements via pip (CUDA-aware)
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DetectorType, DflConfig, FaceType, SortMethod } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/iperov/DeepFaceLab.git";
const REPO_DIR_NAME = "DeepFaceLab";

// ─── Auto-Detection Helpers ─────────────────────────────────────

function execFileSyncSafe(cmd: string, args: string[], options?: Record<string, unknown>): string {
  const { execFileSync: efs } = require("node:child_process");
  return efs(cmd, args, {
    encoding: "utf-8",
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
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

/**
 * Detect if CUDA is available.
 */
function hasCuda(): boolean {
  try {
    execSync("nvidia-smi", {
      timeout: 5_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Auto-clone the DeepFaceLab repo if not present.
 */
export function ensureRepoCloned(parentDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  repoDir: string;
  error?: string;
} {
  const repoDir = path.join(parentDir, REPO_DIR_NAME);

  // Already cloned?
  if (fs.existsSync(path.join(repoDir, "main.py"))) {
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
 * Auto-install Python dependencies.
 * Tries CUDA requirements first if nvidia-smi is available.
 */
function ensureDepsInstalled(
  pythonCmd: string,
  repoDir: string,
): {
  installed: boolean;
  autoInstalled: boolean;
  error?: string;
} {
  // Check if already installed
  try {
    const pipArgs =
      pythonCmd === "py"
        ? ["-3", "-c", "import numpy; import cv2"]
        : ["-c", "import numpy; import cv2"];
    execSync(`${pythonCmd} ${pipArgs.join(" ")}`, {
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { installed: true, autoInstalled: false };
  } catch {
    // Not installed — continue
  }

  // Pick requirements file — CUDA-aware
  const cudaReq = path.join(repoDir, "requirements-cuda.txt");
  const plainReq = path.join(repoDir, "requirements.txt");
  let reqFile = plainReq;
  if (hasCuda() && fs.existsSync(cudaReq)) {
    reqFile = cudaReq;
  } else if (!fs.existsSync(plainReq)) {
    return { installed: false, autoInstalled: false, error: "No requirements file found" };
  }

  try {
    const pipArgs =
      pythonCmd === "py" ? `-3 -m pip install -r "${reqFile}"` : `-m pip install -r "${reqFile}"`;
    execSync(`${pythonCmd} ${pipArgs}`, {
      cwd: repoDir,
      timeout: 600_000, // 10 minutes
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
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

// ─── Installation Detection ─────────────────────────────────────

export interface InstallationStatus {
  installed: boolean;
  pythonAvailable: boolean;
  ffmpegAvailable: boolean;
  mainPyFound: boolean;
  autoCloned: boolean;
  autoInstalledDeps: boolean;
  detectedPython: string;
  cudaAvailable: boolean;
  modelsFound: string[];
  errors: string[];
}

/**
 * Detect and auto-bootstrap DeepFaceLab installation.
 */
export function detectInstallation(config: DflConfig): InstallationStatus {
  const errors: string[] = [];
  let pythonAvailable = false;
  let ffmpegAvailable = false;
  let mainPyFound = false;
  let autoCloned = false;
  let autoInstalledDeps = false;
  const detectedPython = config.pythonPath;
  const cudaAvailable = hasCuda();
  const modelsFound: string[] = [];

  // 1. Check Python
  try {
    const result = execFileSyncSafe(config.pythonPath, ["--version"]);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.6+ required, found: ${result.trim()}`);
    }
  } catch {
    errors.push("Python not found at: " + config.pythonPath);
  }

  // 2. Check ffmpeg
  try {
    execFileSyncSafe("ffmpeg", ["-version"]);
    ffmpegAvailable = true;
  } catch {
    errors.push("ffmpeg not installed or not in PATH");
  }

  // 3. Auto-clone repo if missing
  const repoResult = ensureRepoCloned(path.dirname(config.installPath));
  autoCloned = repoResult.autoCloned;
  if (!repoResult.cloned) {
    if (repoResult.error) {
      errors.push(repoResult.error);
    }
  }

  // 4. Check main.py
  const mainPy = path.join(config.installPath, "main.py");
  mainPyFound = fs.existsSync(mainPy);
  if (!mainPyFound) {
    errors.push(`main.py not found at: ${mainPy}`);
  }

  // 5. Auto-install deps
  if (pythonAvailable && mainPyFound) {
    const depsResult = ensureDepsInstalled(config.pythonPath, config.installPath);
    autoInstalledDeps = depsResult.autoInstalled;
    if (!depsResult.installed && depsResult.error) {
      errors.push(depsResult.error);
    }
  }

  // 6. Discover model architectures
  const modelsDir = path.join(config.installPath, "models");
  if (fs.existsSync(modelsDir)) {
    try {
      const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("Model_")) {
          modelsFound.push(entry.name);
        }
      }
    } catch {
      errors.push("Failed to scan models directory");
    }
  }

  return {
    installed: pythonAvailable && ffmpegAvailable && mainPyFound,
    pythonAvailable,
    ffmpegAvailable,
    mainPyFound,
    autoCloned,
    autoInstalledDeps,
    detectedPython,
    cudaAvailable,
    modelsFound,
    errors,
  };
}

// ─── Async Command Runner ───────────────────────────────────────

export interface RunningProcess {
  process: ChildProcess;
  stage: string;
  startedAt: number;
}

function spawnDfl(
  config: DflConfig,
  args: string[],
  timeoutMs: number,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const cp = execFile(
    config.pythonPath,
    [path.join(config.installPath, "main.py"), ...args],
    { cwd: config.installPath, timeout: timeoutMs },
    (err) => {
      const code = err ? 1 : 0;
      onComplete?.(code);
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

  return { process: cp, stage: args[0] ?? "unknown", startedAt: Date.now() };
}

function addGpuArgs(args: string[], config: DflConfig): void {
  if (config.cpuOnly) {
    args.push("--cpu-only");
  }
  if (config.forceGpuIdxs) {
    args.push("--force-gpu-idxs", config.forceGpuIdxs);
  }
}

// ─── Pipeline Stage Commands ────────────────────────────────────

/**
 * Extract frames from a video file.
 * `python main.py videoed extract-video --input-file <video> --output-dir <dir>`
 */
export function extractVideo(
  config: DflConfig,
  inputFile: string,
  outputDir: string,
  fps?: number,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = ["videoed", "extract-video", "--input-file", inputFile, "--output-dir", outputDir];
  if (fps && fps > 0) {
    args.push("--fps", String(fps));
  }
  return spawnDfl(config, args, config.stageTimeoutMs, onProgress, onComplete);
}

/**
 * Extract faces from image frames.
 * `python main.py extract --input-dir <frames> --output-dir <aligned>`
 */
export function extractFaces(
  config: DflConfig,
  inputDir: string,
  outputDir: string,
  opts?: {
    detector?: DetectorType;
    faceType?: FaceType;
    imageSize?: number;
    jpegQuality?: number;
    maxFaces?: number;
  },
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = ["extract", "--input-dir", inputDir, "--output-dir", outputDir];

  if (opts?.detector) {
    args.push("--detector", opts.detector);
  }
  if (opts?.faceType) {
    args.push("--face-type", opts.faceType);
  }
  if (opts?.imageSize) {
    args.push("--image-size", String(opts.imageSize));
  }
  if (opts?.jpegQuality) {
    args.push("--jpeg-quality", String(opts.jpegQuality));
  }
  if (opts?.maxFaces) {
    args.push("--max-faces-from-image", String(opts.maxFaces));
  }

  addGpuArgs(args, config);
  return spawnDfl(config, args, config.stageTimeoutMs, onProgress, onComplete);
}

/**
 * Sort faces by quality/similarity.
 * `python main.py sort --input-dir <aligned> --by <method>`
 */
export function sortFaces(
  config: DflConfig,
  inputDir: string,
  sortMethod?: SortMethod,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = ["sort", "--input-dir", inputDir];
  if (sortMethod) {
    args.push("--by", sortMethod);
  }
  return spawnDfl(config, args, config.stageTimeoutMs, onProgress, onComplete);
}

/**
 * Train a deepfake model.
 * `python main.py train --training-data-src-dir <src> --training-data-dst-dir <dst> --model-dir <model> --model <name>`
 */
export function trainModel(
  config: DflConfig,
  srcDir: string,
  dstDir: string,
  modelDir: string,
  modelName: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = [
    "train",
    "--training-data-src-dir",
    srcDir,
    "--training-data-dst-dir",
    dstDir,
    "--model-dir",
    modelDir,
    "--model",
    modelName,
  ];

  if (config.trainingNoPreview) {
    args.push("--no-preview");
  }
  if (config.silentStart) {
    args.push("--silent-start");
  }

  addGpuArgs(args, config);
  return spawnDfl(config, args, config.trainTimeoutMs, onProgress, onComplete);
}

/**
 * Merge trained model onto destination frames.
 * `python main.py merge --input-dir <dst_frames> --output-dir <merged> --output-mask-dir <masks> --model-dir <model> --model <name>`
 */
export function mergeFaces(
  config: DflConfig,
  inputDir: string,
  outputDir: string,
  outputMaskDir: string,
  modelDir: string,
  modelName: string,
  alignedDir?: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = [
    "merge",
    "--input-dir",
    inputDir,
    "--output-dir",
    outputDir,
    "--output-mask-dir",
    outputMaskDir,
    "--model-dir",
    modelDir,
    "--model",
    modelName,
  ];

  if (alignedDir) {
    args.push("--aligned-dir", alignedDir);
  }

  addGpuArgs(args, config);
  return spawnDfl(config, args, config.stageTimeoutMs, onProgress, onComplete);
}

/**
 * Compose merged frames back into a video.
 * `python main.py videoed video-from-sequence --input-dir <merged> --output-file <video>`
 */
export function videoFromSequence(
  config: DflConfig,
  inputDir: string,
  outputFile: string,
  referenceFile?: string,
  opts?: { fps?: number; bitrate?: number; includeAudio?: boolean; lossless?: boolean },
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = [
    "videoed",
    "video-from-sequence",
    "--input-dir",
    inputDir,
    "--output-file",
    outputFile,
  ];

  if (referenceFile) {
    args.push("--reference-file", referenceFile);
  }
  if (opts?.fps) {
    args.push("--fps", String(opts.fps));
  }
  if (opts?.bitrate) {
    args.push("--bitrate", String(opts.bitrate));
  }
  if (opts?.includeAudio) {
    args.push("--include-audio");
  }
  if (opts?.lossless) {
    args.push("--lossless");
  }

  return spawnDfl(config, args, config.stageTimeoutMs, onProgress, onComplete);
}

/**
 * Enhance faceset quality.
 * `python main.py facesettool enhance --input-dir <aligned>`
 */
export function enhanceFaceset(
  config: DflConfig,
  inputDir: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = ["facesettool", "enhance", "--input-dir", inputDir];
  addGpuArgs(args, config);
  return spawnDfl(config, args, config.stageTimeoutMs, onProgress, onComplete);
}

/**
 * Apply XSeg mask to extracted faces.
 * `python main.py xseg apply --input-dir <aligned> --model-dir <model>`
 */
export function applyXSeg(
  config: DflConfig,
  inputDir: string,
  modelDir: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningProcess {
  const args = ["xseg", "apply", "--input-dir", inputDir, "--model-dir", modelDir];
  return spawnDfl(config, args, config.stageTimeoutMs, onProgress, onComplete);
}

/**
 * Kill a running process.
 */
export function killProcess(running: RunningProcess): boolean {
  try {
    running.process.kill("SIGTERM");
    setTimeout(() => {
      try {
        running.process.kill("SIGKILL");
      } catch {
        /* dead */
      }
    }, 5000);
    return true;
  } catch {
    return false;
  }
}
