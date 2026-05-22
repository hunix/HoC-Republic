/**
 * Infrastructure — KV-Edit Engine
 *
 * Manages KV-Edit lifecycle:
 *   1. Auto-detect Python 3.10+
 *   2. Auto-clone the repository
 *   3. Install requirements.txt
 *   4. Run editing via Python subprocess
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EditRequest, KVEditConfig } from "../domain/types.ts";

const REPO_URL = "https://github.com/Xilluill/KV-Edit.git";

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
  if (fs.existsSync(path.join(repoDir, "requirements.txt"))) {
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
    execSync(`${pythonPath} -m pip install -r requirements.txt`, {
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

export interface KVEditInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: KVEditConfig): KVEditInstallStatus {
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

// ─── Image Editing ──────────────────────────────────────────────

export function editImage(
  config: KVEditConfig,
  request: EditRequest,
  onComplete?: (outputPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });
  const outputPath = path.join(config.outputDir, `kvedit_${Date.now()}.png`);

  const script = `
import json, sys, os
sys.path.insert(0, "${config.repoDir.replace(/\\/g, "/")}")
os.chdir("${config.repoDir.replace(/\\/g, "/")}")

from kv_edit import edit_image

result = edit_image(
    image_path="${request.imagePath.replace(/\\/g, "/")}",
    ${request.maskPath ? `mask_path="${request.maskPath.replace(/\\/g, "/")}",` : ""}
    source_prompt="${request.sourcePrompt.replace(/"/g, '\\"')}",
    target_prompt="${request.targetPrompt.replace(/"/g, '\\"')}",
    skip_steps=${request.skipSteps},
    attn_scale=${request.attnScale},
    re_init=${request.reInit ? "True" : "False"},
    attn_mask=${request.attnMask ? "True" : "False"},
    ${request.seed >= 0 ? `seed=${request.seed},` : ""}
    output_path="${outputPath.replace(/\\/g, "/")}",
)

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
        } else {
          onError?.(result.error ?? "Edit failed");
        }
      } catch {
        onComplete?.(outputPath);
      }
    },
  );
  return proc;
}
