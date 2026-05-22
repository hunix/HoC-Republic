/**
 * Infrastructure — EasyVolcap Engine
 *
 * Manages EasyVolcap lifecycle:
 *   1. Auto-clone repo
 *   2. pip install easyvolcap
 *   3. Train/render via evc CLI
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EasyVolcapConfig, RenderRequest } from "../domain/types.ts";

const REPO_URL = "https://github.com/zju3dv/EasyVolcap.git";

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
    fs.existsSync(path.join(repoDir, "setup.py")) ||
    fs.existsSync(path.join(repoDir, "pyproject.toml"))
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

export interface EasyVolcapInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: EasyVolcapConfig): EasyVolcapInstallStatus {
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

// ─── EVC CLI Execution ──────────────────────────────────────────

function methodToConfig(method: string): string {
  switch (method) {
    case "enerfi":
      return "configs/exps/enerfi/enerfi_dtu.yaml";
    case "instant-ngp-t":
      return "configs/exps/ngpt/ngpt_dtu.yaml";
    case "3dgs-t":
      return "configs/exps/3dgst/3dgst_dtu.yaml";
    default:
      return "configs/exps/3dgst/3dgst_dtu.yaml";
  }
}

export function runEVC(
  config: EasyVolcapConfig,
  request: RenderRequest,
  onComplete?: (outputDir: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const evcCmd = request.taskType === "train" ? "evc_train" : "evc_test";
  const args: string[] = [
    "-m",
    evcCmd,
    "-c",
    methodToConfig(request.method),
    `dataloader_cfg.dataset_cfg.data_root=${request.dataRoot}`,
    `exp_name=${request.expName}`,
  ];
  if (request.epochs) {
    args.push(`runner_cfg.epochs=${request.epochs}`);
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
      onComplete?.(config.outputDir);
    },
  );
  return proc;
}
