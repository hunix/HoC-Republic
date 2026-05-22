/**
 * Infrastructure — World Engine
 *
 * Wraps the LingBot-World generate.py script via torchrun.
 * Auto-clones the repo, auto-installs dependencies, and
 * auto-downloads the model from HuggingFace.
 *
 * ZERO-CONFIG: Everything bootstraps on first init.
 */

import { execFile, execFileSync as nodeExecFileSync, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { CameraAction, SampleSolver, WorldConfig, WorldResolution } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/Robbyant/lingbot-world.git";
const REPO_DIR_NAME = "lingbot-world";
const MODEL_REPO_ID = "robbyant/lingbot-world-base-cam";
const MODEL_DIR_NAME = "lingbot-world-base-cam";
const QUANTIZED_REPO_ID = "cahlen/lingbot-world-base-cam-nf4";
const QUANTIZED_DIR_NAME = "lingbot-world-base-cam-nf4";

// ─── Installation Detection ─────────────────────────────────────

export interface InstallationStatus {
  installed: boolean;
  pythonAvailable: boolean;
  repoCloned: boolean;
  depsInstalled: boolean;
  modelDownloaded: boolean;
  gpuCount: number;
  autoCloned: boolean;
  autoInstalledDeps: boolean;
  autoDownloadedModel: boolean;
  detectedPython: string;
  errors: string[];
}

function execSyncSafe(cmd: string, args: string[], options?: Record<string, unknown>): string {
  return nodeExecFileSync(cmd, args, {
    encoding: "utf-8",
    timeout: 15_000,
    ...options,
  });
}

// ─── Auto-Detect Python ─────────────────────────────────────────

export function findPython(): string {
  const candidates = [
    { cmd: "python3", args: ["--version"] },
    { cmd: "python", args: ["--version"] },
    { cmd: "py", args: ["-3", "--version"] },
  ];

  for (const { cmd, args } of candidates) {
    try {
      const result = execSyncSafe(cmd, args);
      if (result.includes("Python 3.")) {
        return cmd === "py" ? "py" : cmd;
      }
    } catch {
      // try next
    }
  }
  return "python";
}

// ─── Auto-Detect GPU Count ──────────────────────────────────────

export function detectGpuCount(): number {
  try {
    const result = execSyncSafe("nvidia-smi", ["--query-gpu=gpu_name", "--format=csv,noheader"]);
    const lines = result
      .trim()
      .split("\n")
      .filter((l) => l.trim());
    return Math.max(1, lines.length);
  } catch {
    return 1; // fallback
  }
}

// ─── Auto-Clone Repo ────────────────────────────────────────────

export function ensureRepoCloned(parentDir: string): {
  cloned: boolean;
  error?: string;
} {
  const repoDir = path.join(parentDir, REPO_DIR_NAME);
  const generatePy = path.join(repoDir, "generate.py");

  if (fs.existsSync(generatePy)) {
    return { cloned: false }; // already present
  }

  fs.mkdirSync(parentDir, { recursive: true });

  try {
    execSyncSafe("git", ["--version"]);
  } catch {
    return { cloned: false, error: "git not found — cannot auto-clone" };
  }

  try {
    execSync(`git clone --depth 1 "${REPO_URL}" "${repoDir}"`, {
      cwd: parentDir,
      timeout: 120_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { cloned: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { cloned: false, error: `Auto-clone failed: ${e.message ?? "unknown"}` };
  }
}

// ─── Auto-Install Dependencies ──────────────────────────────────

export function ensureDepsInstalled(
  pythonCmd: string,
  repoDir: string,
): {
  installed: boolean;
  autoInstalled: boolean;
  error?: string;
} {
  const reqFile = path.join(repoDir, "requirements.txt");
  if (!fs.existsSync(reqFile)) {
    return { installed: false, autoInstalled: false, error: "requirements.txt not found" };
  }

  // Check if wan module is importable (key dependency)
  const checkArgs =
    pythonCmd === "py"
      ? ["-3", "-c", "import wan; print('ok')"]
      : ["-c", "import wan; print('ok')"];

  try {
    execSyncSafe(pythonCmd, checkArgs, { cwd: repoDir });
    return { installed: true, autoInstalled: false };
  } catch {
    // Not installed — auto-install
  }

  // pip install -r requirements.txt (skip flash_attn — often fails, optional)
  try {
    const pipArgs =
      pythonCmd === "py"
        ? "-3 -m pip install -r requirements.txt"
        : "-m pip install -r requirements.txt";

    execSync(`${pythonCmd} ${pipArgs}`, {
      cwd: repoDir,
      timeout: 600_000, // 10 minutes for heavy torch deps
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Also pip install the repo itself (for wan module)
    const installArgs = pythonCmd === "py" ? "-3 -m pip install -e ." : "-m pip install -e .";

    try {
      execSync(`${pythonCmd} ${installArgs}`, {
        cwd: repoDir,
        timeout: 120_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      // editable install may fail if no setup.py — fall back to PYTHONPATH
    }

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

// ─── Auto-Download Model ────────────────────────────────────────

export function ensureModelDownloaded(
  pythonCmd: string,
  parentDir: string,
  useQuantized: boolean,
): {
  downloaded: boolean;
  autoDownloaded: boolean;
  modelDir: string;
  error?: string;
} {
  const dirName = useQuantized ? QUANTIZED_DIR_NAME : MODEL_DIR_NAME;
  const repoId = useQuantized ? QUANTIZED_REPO_ID : MODEL_REPO_ID;
  const modelDir = path.join(parentDir, dirName);

  // Check if model already exists (look for config.json)
  if (fs.existsSync(path.join(modelDir, "config.json"))) {
    return { downloaded: true, autoDownloaded: false, modelDir };
  }

  // Auto-download via huggingface-cli
  try {
    // Ensure huggingface_hub is installed
    const pipArgs =
      pythonCmd === "py"
        ? `-3 -m pip install "huggingface_hub[cli]"`
        : `-m pip install "huggingface_hub[cli]"`;

    execSync(`${pythonCmd} ${pipArgs}`, {
      timeout: 120_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Download model
    execSync(
      `huggingface-cli download ${repoId} --local-dir "${modelDir}"`,
      { timeout: 1_800_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }, // 30 min
    );

    if (fs.existsSync(path.join(modelDir, "config.json"))) {
      return { downloaded: true, autoDownloaded: true, modelDir };
    }

    return {
      downloaded: false,
      autoDownloaded: false,
      modelDir,
      error: "Model download completed but config.json not found",
    };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return {
      downloaded: false,
      autoDownloaded: false,
      modelDir,
      error: `Model download failed: ${e.message ?? "unknown"}. Run manually: huggingface-cli download ${repoId} --local-dir ${modelDir}`,
    };
  }
}

// ─── Full Detection ─────────────────────────────────────────────

export function detectInstallation(config: WorldConfig): InstallationStatus {
  const errors: string[] = [];
  let pythonAvailable = false;
  let repoCloned = false;
  let depsInstalled = false;
  let modelDownloaded = false;
  let autoCloned = false;
  let autoInstalledDeps = false;
  let autoDownloadedModel = false;
  const detectedPython = config.pythonPath;
  let gpuCount = 1;

  // Step 1: Check Python
  const versionArgs = detectedPython === "py" ? ["-3", "--version"] : ["--version"];
  try {
    const result = execSyncSafe(detectedPython, versionArgs);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.10+ required, found: ${result.trim()}`);
    }
  } catch {
    errors.push("Python not found at: " + detectedPython);
  }

  // Step 2: Auto-clone repo
  const parentDir = path.dirname(
    config.generateScriptPath ? path.dirname(config.generateScriptPath) : config.installPath,
  );
  const cloneResult = ensureRepoCloned(parentDir);
  autoCloned = cloneResult.cloned;
  if (cloneResult.error) {
    errors.push(cloneResult.error);
  }
  repoCloned = fs.existsSync(config.generateScriptPath);

  // Step 3: Auto-install dependencies
  if (pythonAvailable && repoCloned) {
    const repoDir = path.dirname(config.generateScriptPath);
    const depsResult = ensureDepsInstalled(detectedPython, repoDir);
    depsInstalled = depsResult.installed;
    autoInstalledDeps = depsResult.autoInstalled;
    if (depsResult.error) {
      errors.push(depsResult.error);
    }
  }

  // Step 4: Detect GPUs
  gpuCount = detectGpuCount();

  // Step 5: Auto-download model (skip if no Python or deps)
  if (pythonAvailable && depsInstalled) {
    const modelResult = ensureModelDownloaded(detectedPython, parentDir, config.useQuantized);
    modelDownloaded = modelResult.downloaded;
    autoDownloadedModel = modelResult.autoDownloaded;
    if (modelResult.error) {
      errors.push(modelResult.error);
    }
  }

  return {
    installed: pythonAvailable && repoCloned && depsInstalled,
    pythonAvailable,
    repoCloned,
    depsInstalled,
    modelDownloaded,
    gpuCount,
    autoCloned,
    autoInstalledDeps,
    autoDownloadedModel,
    detectedPython,
    errors,
  };
}

// ─── Video Generation ───────────────────────────────────────────

export interface RunningWorldProcess {
  process: ChildProcess;
  outputPath: string;
  startedAt: number;
}

export function generateWorldVideo(
  config: WorldConfig,
  prompt: string,
  imagePath: string,
  resolution: WorldResolution,
  frameNum: number,
  seed: number,
  solver: SampleSolver,
  cameraAction?: CameraAction,
  onProgress?: (line: string) => void,
  onComplete?: (exitCode: number, outputFile: string | null) => void,
): RunningWorldProcess {
  const outputFile = path.join(config.outputDir, `world_${Date.now()}_${seed}.mp4`);

  // Build torchrun command args
  const args: string[] = [
    "-m",
    "torch.distributed.run",
    `--nproc_per_node=${config.gpuCount}`,
    config.generateScriptPath,
    "--task",
    "i2v-A14B",
    "--size",
    resolution,
    "--ckpt_dir",
    config.modelDir,
    "--image",
    imagePath,
    "--frame_num",
    String(frameNum),
    "--base_seed",
    String(seed),
    "--sample_solver",
    solver,
    "--save_file",
    outputFile,
    "--prompt",
    prompt,
  ];

  if (config.useFsdp && config.gpuCount > 1) {
    args.push("--dit_fsdp", "--t5_fsdp");
    args.push("--ulysses_size", String(config.gpuCount));
  }

  if (config.useT5Cpu) {
    args.push("--t5_cpu");
  }

  if (cameraAction) {
    args.push("--action_path", cameraAction.actionPath);
  }

  // Handle py launcher
  const pyCmd = config.pythonPath === "py" ? "py" : config.pythonPath;
  const pyArgs = config.pythonPath === "py" ? ["-3", ...args] : args;

  const cp = execFile(
    pyCmd,
    pyArgs,
    {
      cwd: path.dirname(config.generateScriptPath),
      timeout: config.jobTimeoutMs,
      env: {
        ...process.env,
        PYTHONPATH: path.dirname(config.generateScriptPath),
      },
    },
    (err) => {
      if (err) {
        onComplete?.(1, null);
      } else {
        onComplete?.(0, fs.existsSync(outputFile) ? outputFile : null);
      }
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

  return { process: cp, outputPath: outputFile, startedAt: Date.now() };
}

/**
 * Kill a running world generation process.
 */
export function killWorldProcess(running: RunningWorldProcess): boolean {
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
