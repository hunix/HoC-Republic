/**
 * Infrastructure — FaceFusion CLI Wrapper
 *
 * Wraps FaceFusion's Python CLI in a TypeScript interface.
 * All commands spawned via child_process with timeout/kill safety.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3 (python3 / python / py -3)
 *   2. Auto-clones facefusion/facefusion from GitHub
 *   3. Auto-installs requirements.txt via pip
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { FaceFusionConfig, FaceProcessor } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/facefusion/facefusion.git";
const REPO_DIR_NAME = "facefusion";

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

/**
 * Auto-clone the FaceFusion repo if not present.
 */
export function ensureRepoCloned(parentDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  repoDir: string;
  error?: string;
} {
  const repoDir = path.join(parentDir, REPO_DIR_NAME);

  // Already cloned?
  if (fs.existsSync(path.join(repoDir, "facefusion.py"))) {
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
 * Auto-install Python dependencies from requirements.txt.
 */
function ensureDepsInstalled(
  pythonCmd: string,
  repoDir: string,
): {
  installed: boolean;
  autoInstalled: boolean;
  error?: string;
} {
  // Check if already installed — try importing facefusion module
  try {
    const pipArgs =
      pythonCmd === "py" ? ["-3", "-c", "import onnxruntime"] : ["-c", "import onnxruntime"];
    execSync(`${pythonCmd} ${pipArgs.join(" ")}`, {
      timeout: 10_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { installed: true, autoInstalled: false };
  } catch {
    // Not installed — continue to auto-install
  }

  // pip install -r requirements.txt
  const reqFile = path.join(repoDir, "requirements.txt");
  if (!fs.existsSync(reqFile)) {
    return { installed: false, autoInstalled: false, error: "requirements.txt not found" };
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
  facefusionFound: boolean;
  autoCloned: boolean;
  autoInstalledDeps: boolean;
  detectedPython: string;
  version?: string;
  errors: string[];
}

/**
 * Detect and auto-bootstrap FaceFusion installation.
 */
export function detectInstallation(config: FaceFusionConfig): InstallationStatus {
  const errors: string[] = [];
  let pythonAvailable = false;
  let ffmpegAvailable = false;
  let facefusionFound = false;
  let autoCloned = false;
  let autoInstalledDeps = false;
  const detectedPython = config.pythonPath;

  // 1. Check Python
  try {
    const result = execFileSyncSafe(config.pythonPath, ["--version"]);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.10+ required, found: ${result.trim()}`);
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

  // 4. Check facefusion.py
  const ffScript = path.join(config.installPath, "facefusion.py");
  facefusionFound = fs.existsSync(ffScript);
  if (!facefusionFound) {
    errors.push(`facefusion.py not found at: ${ffScript}`);
  }

  // 5. Auto-install deps if Python and repo are available
  if (pythonAvailable && facefusionFound) {
    const depsResult = ensureDepsInstalled(config.pythonPath, config.installPath);
    autoInstalledDeps = depsResult.autoInstalled;
    if (!depsResult.installed && depsResult.error) {
      errors.push(depsResult.error);
    }
  }

  return {
    installed: pythonAvailable && ffmpegAvailable && facefusionFound,
    pythonAvailable,
    ffmpegAvailable,
    facefusionFound,
    autoCloned,
    autoInstalledDeps,
    detectedPython,
    errors,
  };
}

// ─── CLI Command Execution ──────────────────────────────────────

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute a FaceFusion CLI command synchronously.
 * For short-lived management commands (create, submit, list, delete).
 */
function runFfCommand(config: FaceFusionConfig, args: string[], timeoutMs = 15_000): CliResult {
  try {
    const stdout = execFileSync(
      config.pythonPath,
      [path.join(config.installPath, "facefusion.py"), ...args],
      {
        cwd: config.installPath,
        timeout: timeoutMs,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return { exitCode: 0, stdout: stdout ?? "", stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "Unknown error",
    };
  }
}

/**
 * Synchronous execFile wrapper.
 */
function execFileSync(cmd: string, args: string[], options?: Record<string, unknown>): string {
  const { execFileSync: efs } = require("node:child_process");
  return efs(cmd, args, { encoding: "utf-8", timeout: 10_000, ...options }) as string;
}

// ─── Job Management Commands ────────────────────────────────────

/**
 * Create a new drafted job.
 */
export function createJob(config: FaceFusionConfig, jobId: string): boolean {
  const result = runFfCommand(config, ["job-create", "--job-id", jobId]);
  return result.exitCode === 0;
}

/**
 * Add a processing step to a drafted job.
 */
export function addStep(
  config: FaceFusionConfig,
  jobId: string,
  processor: FaceProcessor,
  sourcePath: string,
  outputPath: string,
  targetPath?: string,
  options?: Record<string, unknown>,
): boolean {
  const args = [
    "job-add-step",
    "--job-id",
    jobId,
    "--processors",
    processor,
    "--source-path",
    sourcePath,
    "--output-path",
    outputPath,
    "--execution-providers",
    config.executionProvider,
    "--execution-thread-count",
    String(config.executionThreads),
    "--video-memory-strategy",
    config.videoMemoryStrategy,
  ];

  if (targetPath) {
    args.push("--target-path", targetPath);
  }

  if (config.systemMemoryLimit > 0) {
    args.push("--system-memory-limit", String(config.systemMemoryLimit));
  }

  // Add extra options
  if (options) {
    for (const [key, value] of Object.entries(options)) {
      args.push(`--${key}`, String(value));
    }
  }

  const result = runFfCommand(config, args);
  return result.exitCode === 0;
}

/**
 * Submit a drafted job to the queue.
 */
export function submitJob(config: FaceFusionConfig, jobId: string): boolean {
  const result = runFfCommand(config, ["job-submit", "--job-id", jobId]);
  return result.exitCode === 0;
}

/**
 * Delete a job.
 */
export function deleteJob(config: FaceFusionConfig, jobId: string): boolean {
  const result = runFfCommand(config, ["job-delete", "--job-id", jobId]);
  return result.exitCode === 0;
}

/**
 * List jobs by status (returns raw CLI output).
 */
export function listJobs(config: FaceFusionConfig, status: string): string {
  const result = runFfCommand(config, ["job-list", "--job-status", status]);
  return result.stdout;
}

// ─── Job Execution (Async) ──────────────────────────────────────

export interface RunningJob {
  process: ChildProcess;
  jobId: string;
  startedAt: number;
}

/**
 * Run a queued job asynchronously. Returns the child process for monitoring.
 * Uses `job-run` command which processes a single queued job.
 */
export function runJobAsync(
  config: FaceFusionConfig,
  jobId: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): RunningJob {
  const cp = execFile(
    config.pythonPath,
    [path.join(config.installPath, "facefusion.py"), "job-run", "--job-id", jobId],
    {
      cwd: config.installPath,
      timeout: config.jobTimeoutMs,
    },
    (err) => {
      const code = err ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0;
      onComplete?.(typeof code === "number" ? code : 1);
    },
  );

  if (cp.stdout && onProgress) {
    cp.stdout.on("data", (data: Buffer) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((l) => l.trim());
      for (const line of lines) {
        onProgress(line);
      }
    });
  }

  if (cp.stderr && onProgress) {
    cp.stderr.on("data", (data: Buffer) => {
      onProgress(`[stderr] ${data.toString().trim()}`);
    });
  }

  return { process: cp, jobId, startedAt: Date.now() };
}

/**
 * Run headless mode for quick one-shot processing (no job queue).
 */
export function runHeadlessAsync(
  config: FaceFusionConfig,
  processor: FaceProcessor,
  sourcePath: string,
  outputPath: string,
  targetPath?: string,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number) => void,
): ChildProcess {
  const args = [
    path.join(config.installPath, "facefusion.py"),
    "headless-run",
    "--processors",
    processor,
    "--source-path",
    sourcePath,
    "--output-path",
    outputPath,
    "--execution-providers",
    config.executionProvider,
    "--execution-thread-count",
    String(config.executionThreads),
    "--video-memory-strategy",
    config.videoMemoryStrategy,
  ];

  if (targetPath) {
    args.push("--target-path", targetPath);
  }

  const cp = execFile(
    config.pythonPath,
    args,
    { cwd: config.installPath, timeout: config.jobTimeoutMs },
    (err) => {
      const code = err ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1) : 0;
      onComplete?.(typeof code === "number" ? code : 1);
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

  return cp;
}

/**
 * Kill a running job process.
 */
export function killJob(running: RunningJob): boolean {
  try {
    running.process.kill("SIGTERM");
    // Give it 5s then force kill
    setTimeout(() => {
      try {
        running.process.kill("SIGKILL");
      } catch {
        // Already dead
      }
    }, 5000);
    return true;
  } catch {
    return false;
  }
}
