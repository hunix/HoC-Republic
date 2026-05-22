/**
 * Infrastructure — AI Scientist Engine
 *
 * Manages AI Scientist lifecycle:
 *   1. Auto-clone repo
 *   2. Install via pip
 *   3. Run experiments and paper generation via subprocess
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AIScientistConfig, ResearchRequest } from "../domain/types.ts";

const REPO_URL = "https://github.com/SakanaAI/AI-Scientist.git";

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
  if (fs.existsSync(path.join(repoDir, "launch_scientist.py"))) {
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

export interface AIScientistInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: AIScientistConfig): AIScientistInstallStatus {
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

// ─── Research Execution ─────────────────────────────────────────

export function runResearch(
  config: AIScientistConfig,
  request: ResearchRequest,
  onComplete?: (paperPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const args: string[] = [
    path.join(config.repoDir, "launch_scientist.py"),
    `--experiment=${request.template}`,
    `--model=${request.model}`,
    `--num-ideas=${request.numIdeas}`,
  ];
  if (request.skipWriteup) {
    args.push("--skip-writeup");
  }
  if (request.topic) {
    args.push(`--topic=${request.topic}`);
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
      // Find generated paper PDF
      const papers = fs
        .readdirSync(config.outputDir)
        .filter((f) => f.endsWith(".pdf"))
        .map((f) => path.join(config.outputDir, f));
      const latestPaper = papers[papers.length - 1];
      if (latestPaper) {
        onComplete?.(latestPaper);
      } else {
        onComplete?.("");
      }
    },
  );
  return proc;
}

export function runReview(
  config: AIScientistConfig,
  paperPath: string,
  model: string,
  onComplete?: (review: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  const proc = execFile(
    config.pythonPath,
    [
      path.join(config.repoDir, "review_iclr_bench", "iclr_analysis.py"),
      `--paper=${paperPath}`,
      `--model=${model}`,
    ],
    { timeout: config.timeoutMs, cwd: config.repoDir },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      onComplete?.(stdout.trim());
    },
  );
  return proc;
}
