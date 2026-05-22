/**
 * Infrastructure — MMAudio Engine
 *
 * Manages MMAudio lifecycle:
 *   1. Auto-detect Python 3 with PyTorch
 *   2. Auto-clone the repository
 *   3. Install via pip (pyproject.toml)
 *   4. Spawn demo.py subprocess for synthesis
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { MMAudioConfig, SynthesisRequest } from "../domain/types.ts";

const REPO_URL = "https://github.com/hkchengrex/MMAudio.git";

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
  if (fs.existsSync(path.join(repoDir, "mmaudio"))) {
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
    execSync(`${pythonPath} -m pip install -e "${repoDir}"`, {
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

export interface MMAudioInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: MMAudioConfig): MMAudioInstallStatus {
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

// ─── Audio Synthesis ────────────────────────────────────────────

export function synthesize(
  config: MMAudioConfig,
  request: SynthesisRequest,
  onComplete?: (audioPath: string, videoPath?: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });

  // Build demo.py command args
  const args: string[] = [path.join(config.repoDir, "demo.py"), `--duration=${request.duration}`];

  if (request.videoPath) {
    args.push(`--video=${request.videoPath}`);
  }
  if (request.prompt) {
    args.push("--prompt", request.prompt);
  }
  if (request.seed >= 0) {
    args.push(`--seed=${request.seed}`);
  }
  args.push(`--num_steps=${request.numSteps}`);
  args.push(`--cfg_strength=${request.cfgStrength}`);
  args.push(`--output=${config.outputDir}`);

  const proc = execFile(
    config.pythonPath,
    args,
    { timeout: config.timeoutMs, cwd: config.repoDir },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      // MMAudio outputs to ./output by default
      const audioFiles = fs
        .readdirSync(config.outputDir)
        .filter((f) => f.endsWith(".flac"))
        .map((f) => path.join(config.outputDir, f));
      const videoFiles = fs
        .readdirSync(config.outputDir)
        .filter((f) => f.endsWith(".mp4"))
        .map((f) => path.join(config.outputDir, f));

      const latestAudio = audioFiles[audioFiles.length - 1];
      const latestVideo = videoFiles[videoFiles.length - 1];

      if (latestAudio) {
        onComplete?.(latestAudio, latestVideo);
      } else {
        onError?.("No output audio file generated");
      }
    },
  );

  return proc;
}
