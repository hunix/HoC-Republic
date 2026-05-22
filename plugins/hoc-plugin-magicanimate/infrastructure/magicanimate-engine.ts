/**
 * Infrastructure — MagicAnimate Engine
 *
 * Manages MagicAnimate lifecycle:
 *   1. Auto-detect Python 3 with CUDA support
 *   2. Auto-clone the repository
 *   3. Install pip requirements
 *   4. Download HuggingFace model checkpoints
 *   5. Spawn Python subprocess for animation generation
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AnimationRequest, MagicAnimateConfig } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/magic-research/magic-animate.git";
const MODEL_REPO = "zcxu-eric/MagicAnimate";

// ─── Python Detection ───────────────────────────────────────────

export function detectPython(): string | null {
  const candidates = ["python3", "python", "py -3"];
  for (const cmd of candidates) {
    try {
      const ver = execSync(`${cmd} --version`, {
        timeout: 10_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (ver.includes("Python 3")) {
        return cmd.split(" ")[0];
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

// ─── Repository Management ──────────────────────────────────────

export function ensureRepoCloned(repoDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  error?: string;
} {
  if (fs.existsSync(path.join(repoDir, "magicanimate"))) {
    return { cloned: true, autoCloned: false };
  }
  try {
    fs.mkdirSync(repoDir, { recursive: true });
    execSync(`git clone --depth 1 "${REPO_URL}" "${repoDir}"`, {
      timeout: 300_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { cloned: true, autoCloned: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { cloned: false, autoCloned: false, error: `Clone failed: ${e.message ?? "unknown"}` };
  }
}

export function installDependencies(
  pythonPath: string,
  repoDir: string,
): {
  installed: boolean;
  error?: string;
} {
  const reqFile = path.join(repoDir, "requirements.txt");
  if (!fs.existsSync(reqFile)) {
    return { installed: false, error: "requirements.txt not found" };
  }
  try {
    execSync(`${pythonPath} -m pip install -r "${reqFile}"`, {
      timeout: 600_000,
      encoding: "utf-8",
      cwd: repoDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { installed: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { installed: false, error: `pip install failed: ${e.message ?? "unknown"}` };
  }
}

// ─── Model Download ─────────────────────────────────────────────

export function ensureModelsDownloaded(modelsDir: string): {
  ready: boolean;
  error?: string;
} {
  const checkpointDir = path.join(modelsDir, "MagicAnimate");
  if (fs.existsSync(path.join(checkpointDir, "appearance_encoder"))) {
    return { ready: true };
  }
  try {
    fs.mkdirSync(modelsDir, { recursive: true });
    execSync(`git clone --depth 1 "https://huggingface.co/${MODEL_REPO}" "${checkpointDir}"`, {
      timeout: 600_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { ready: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { ready: false, error: `Model download failed: ${e.message ?? "unknown"}` };
  }
}

// ─── Installation Status ────────────────────────────────────────

export interface MagicAnimateInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  modelsReady: boolean;
  errors: string[];
}

export function detectInstallation(config: MagicAnimateConfig): MagicAnimateInstallStatus {
  const errors: string[] = [];

  // 1. Python
  const python = detectPython();
  if (!python) {
    errors.push("Python 3 not found");
  }

  // 2. Repo
  const repoResult = ensureRepoCloned(config.repoDir);
  if (!repoResult.cloned && repoResult.error) {
    errors.push(repoResult.error);
  }

  // 3. Dependencies
  let depsInstalled = false;
  if (python && repoResult.cloned) {
    const depResult = installDependencies(python, config.repoDir);
    depsInstalled = depResult.installed;
    if (!depResult.installed && depResult.error) {
      errors.push(depResult.error);
    }
  }

  // 4. Models
  const modelResult = ensureModelsDownloaded(config.modelsDir);
  if (!modelResult.ready && modelResult.error) {
    errors.push(modelResult.error);
  }

  const ready = !!python && repoResult.cloned && depsInstalled && modelResult.ready;

  return {
    ready,
    pythonFound: !!python,
    pythonPath: python ?? "python",
    repoCloned: repoResult.cloned,
    autoClonedRepo: repoResult.autoCloned,
    depsInstalled,
    modelsReady: modelResult.ready,
    errors,
  };
}

// ─── Animation Generation ───────────────────────────────────────

export function generateAnimation(
  config: MagicAnimateConfig,
  request: AnimationRequest,
  onProgress?: (pct: number) => void,
  onComplete?: (outputPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  const outputPath = path.join(config.outputDir, `magicanimate_${Date.now()}.mp4`);
  fs.mkdirSync(config.outputDir, { recursive: true });

  const script = `
import sys, json
sys.path.insert(0, "${config.repoDir.replace(/\\/g, "/")}")
from magicanimate.pipelines.animation import MagicAnimatePipeline

config_path = "${config.repoDir.replace(/\\/g, "/")}/configs/prompts/animation.yaml"
pipeline = MagicAnimatePipeline(config_path)
result = pipeline(
    reference_image="${request.referenceImagePath.replace(/\\/g, "/")}",
    motion_sequence="${request.motionSource.replace(/\\/g, "/")}",
    seed=${request.seed},
    steps=${request.numInferenceSteps},
    guidance_scale=${request.guidanceScale},
)
# Save output
result.save("${outputPath.replace(/\\/g, "/")}")
print(json.dumps({"status": "complete", "output": "${outputPath.replace(/\\/g, "/")}"}))
`;

  const proc = execFile(
    config.pythonPath,
    ["-c", script],
    { timeout: config.timeoutMs, cwd: config.repoDir },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
        if (result.status === "complete") {
          onComplete?.(result.output ?? outputPath);
        }
      } catch {
        onComplete?.(outputPath);
      }
    },
  );

  return proc;
}
