/**
 * Infrastructure — StableAvatar Engine
 *
 * Manages StableAvatar lifecycle:
 *   1. Auto-clone repo
 *   2. Install deps + download weights from HuggingFace
 *   3. Run inference via subprocess
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AvatarRequest, StableAvatarConfig } from "../domain/types.ts";

const REPO_URL = "https://github.com/Francis-Rings/StableAvatar.git";

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
  if (fs.existsSync(path.join(repoDir, "inference.py"))) {
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
    }
    return { installed: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { installed: false, error: `pip install failed: ${e.message ?? "unknown"}` };
  }
}

export interface StableAvatarInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: StableAvatarConfig): StableAvatarInstallStatus {
  const errors: string[] = [];
  const python = detectPython();
  if (!python) {
    errors.push("Python 3.10+ not found");
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

// ─── Avatar Generation ──────────────────────────────────────────

export function generateAvatar(
  config: StableAvatarConfig,
  request: AvatarRequest,
  onComplete?: (videoPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const args: string[] = [
    path.join(config.repoDir, "inference.py"),
    `--ref_image=${request.referenceImagePath}`,
    `--audio=${request.audioPath}`,
    `--output_dir=${config.outputDir}`,
    `--guidance_scale=${request.guidanceScale}`,
    `--fps=${request.fps}`,
  ];
  if (request.seed >= 0) {
    args.push(`--seed=${request.seed}`);
  }
  if (request.loraPath) {
    args.push(`--lora_path=${request.loraPath}`);
  }
  if (config.checkpointPath) {
    args.push(`--ckpt=${config.checkpointPath}`);
  }

  const proc = execFile(
    config.pythonPath,
    args,
    { timeout: config.timeoutMs, cwd: config.repoDir },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      const videos = fs
        .readdirSync(config.outputDir)
        .filter((f) => f.endsWith(".mp4"))
        .map((f) => path.join(config.outputDir, f));
      const latest = videos[videos.length - 1];
      if (latest) {
        onComplete?.(latest);
      } else {
        onError?.("No output video generated");
      }
    },
  );
  return proc;
}
