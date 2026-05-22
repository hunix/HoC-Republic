/**
 * Infrastructure — Sparc3D Engine
 *
 * Manages Sparc3D lifecycle:
 *   1. Auto-detect Python 3 + PyTorch
 *   2. Auto-clone the repository
 *   3. Install dependencies
 *   4. Run generation via subprocess
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GenerationRequest, Sparc3DConfig } from "../domain/types.ts";

const REPO_URL = "https://github.com/lizhihao6/Sparc3D.git";

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

export interface Sparc3DInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: Sparc3DConfig): Sparc3DInstallStatus {
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

// ─── 3D Generation ──────────────────────────────────────────────

export function generate3D(
  config: Sparc3DConfig,
  request: GenerationRequest,
  onComplete?: (outputPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });
  const outputPath = path.join(config.outputDir, `sparc3d_${Date.now()}.${request.outputFormat}`);

  const script = `
import json, sys
sys.path.insert(0, "${config.repoDir.replace(/\\/g, "/")}")

# Import Sparc3D and run generation
try:
    ${
      request.mode === "image-to-3d"
        ? `
    from sparc3d import generate_from_image
    result = generate_from_image(
        "${(request.imagePath ?? "").replace(/\\/g, "/")}",
        resolution=${request.resolution},
        output_path="${outputPath.replace(/\\/g, "/")}",
    )
    `
        : `
    from sparc3d import reconstruct_mesh
    result = reconstruct_mesh(
        "${(request.meshPath ?? "").replace(/\\/g, "/")}",
        resolution=${request.resolution},
        output_path="${outputPath.replace(/\\/g, "/")}",
    )
    `
    }
    print(json.dumps({"status": "complete", "output": "${outputPath.replace(/\\/g, "/")}"}))
except Exception as e:
    print(json.dumps({"status": "error", "error": str(e)}))
    sys.exit(1)
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
          onError?.(result.error ?? "Generation failed");
        }
      } catch {
        onComplete?.(outputPath);
      }
    },
  );
  return proc;
}
