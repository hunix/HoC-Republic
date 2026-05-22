/**
 * Infrastructure — Deforum Engine
 *
 * Manages Deforum Stable Diffusion lifecycle:
 *   1. Auto-clone repo
 *   2. Install dependencies
 *   3. Run animation generation via subprocess
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AnimationRequest, DeforumConfig } from "../domain/types.ts";

const REPO_URL = "https://github.com/deforum/deforum-stable-diffusion.git";

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

export function ensureRepoCloned(repoDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  error?: string;
} {
  if (
    fs.existsSync(path.join(repoDir, "Deforum_Stable_Diffusion.py")) ||
    fs.existsSync(path.join(repoDir, "requirements.txt"))
  ) {
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
  try {
    const reqFile = path.join(repoDir, "requirements.txt");
    if (fs.existsSync(reqFile)) {
      execSync(`${pythonPath} -m pip install -r requirements.txt`, {
        timeout: 600_000,
        encoding: "utf-8",
        cwd: repoDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      execSync(`${pythonPath} -m pip install -e "${repoDir}"`, {
        timeout: 600_000,
        encoding: "utf-8",
        cwd: repoDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
    return { installed: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { installed: false, error: `pip install failed: ${e.message ?? "unknown"}` };
  }
}

export interface DeforumInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: DeforumConfig): DeforumInstallStatus {
  const errors: string[] = [];
  const python = detectPython();
  if (!python) {
    errors.push("Python 3 not found");
  }

  const repoResult = ensureRepoCloned(config.repoDir);
  if (!repoResult.cloned && repoResult.error) {
    errors.push(repoResult.error);
  }

  let depsInstalled = false;
  if (python && repoResult.cloned) {
    const depResult = installDependencies(python, config.repoDir);
    depsInstalled = depResult.installed;
    if (!depResult.installed && depResult.error) {
      errors.push(depResult.error);
    }
  }

  return {
    ready: !!python && repoResult.cloned && depsInstalled,
    pythonFound: !!python,
    pythonPath: python ?? "python",
    repoCloned: repoResult.cloned,
    autoClonedRepo: repoResult.autoCloned,
    depsInstalled,
    errors,
  };
}

// ─── Animation Generation ───────────────────────────────────────

export function generateAnimation(
  config: DeforumConfig,
  request: AnimationRequest,
  onComplete?: (videoPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const settingsJson = JSON.stringify({
    prompts: { "0": request.prompt },
    neg_prompt: request.negativePrompt ?? "",
    animation_mode:
      request.animationMode === "2d"
        ? "2D"
        : request.animationMode === "3d"
          ? "3D"
          : request.animationMode,
    max_frames: request.maxFrames,
    W: request.width,
    H: request.height,
    steps: request.steps,
    scale: request.cfgScale,
    seed: request.seed,
    fps: request.fps,
    use_clip_guided: request.clipGuidance,
    outdir: config.outputDir,
  });

  const settingsPath = path.join(config.outputDir, `settings_${Date.now()}.json`);
  fs.writeFileSync(settingsPath, settingsJson, "utf-8");

  const proc = execFile(
    config.pythonPath,
    [
      "-c",
      `
import json, sys, os
sys.path.insert(0, "${config.repoDir.replace(/\\/g, "/")}")
os.chdir("${config.repoDir.replace(/\\/g, "/")}")
settings = json.load(open("${settingsPath.replace(/\\/g, "/")}"))
# Import and run deforum
try:
    from deforum import run_deforum
    result = run_deforum(settings)
    print(json.dumps({"status": "complete", "output": settings.get("outdir", "")}))
except Exception as e:
    print(json.dumps({"status": "error", "error": str(e)}))
    sys.exit(1)
`,
    ],
    { timeout: config.timeoutMs, cwd: config.repoDir },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      // Find generated video
      const videos = fs
        .readdirSync(config.outputDir)
        .filter((f) => f.endsWith(".mp4"))
        .map((f) => path.join(config.outputDir, f));
      const latest = videos[videos.length - 1];
      if (latest) {
        onComplete?.(latest);
      } else {
        onComplete?.(config.outputDir);
      }
    },
  );
  return proc;
}
