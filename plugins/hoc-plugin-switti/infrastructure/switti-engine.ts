/**
 * Infrastructure — Switti Engine
 *
 * Manages Switti lifecycle:
 *   1. Auto-detect Python 3 with PyTorch/CUDA
 *   2. Auto-clone the repository
 *   3. Install pip requirements
 *   4. Spawn Python subprocess for image generation via SwittiPipeline
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { GenerationRequest, SwittiConfig } from "../domain/types.ts";
import { MODEL_HF_PATHS } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/yandex-research/switti.git";

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
  if (fs.existsSync(path.join(repoDir, "models"))) {
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
    execSync(
      `${pythonPath} -m pip install torch torchvision transformers accelerate huggingface_hub`,
      { timeout: 600_000, encoding: "utf-8", cwd: repoDir, stdio: ["pipe", "pipe", "pipe"] },
    );
    return { installed: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { installed: false, error: `pip install failed: ${e.message ?? "unknown"}` };
  }
}

// ─── Installation Status ────────────────────────────────────────

export interface SwittiInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: SwittiConfig): SwittiInstallStatus {
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

  const ready = !!python && repoResult.cloned && depsInstalled;

  return {
    ready,
    pythonFound: !!python,
    pythonPath: python ?? "python",
    repoCloned: repoResult.cloned,
    autoClonedRepo: repoResult.autoCloned,
    depsInstalled,
    errors,
  };
}

// ─── Image Generation ───────────────────────────────────────────

export function generateImage(
  config: SwittiConfig,
  request: GenerationRequest,
  onComplete?: (outputPath: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  const outputPath = path.join(config.outputDir, `switti_${Date.now()}.png`);
  fs.mkdirSync(config.outputDir, { recursive: true });

  const modelPath = MODEL_HF_PATHS[request.model];

  const script = `
import sys, json, torch
sys.path.insert(0, "${config.repoDir.replace(/\\/g, "/")}")
from models import SwittiPipeline

device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
pipe = SwittiPipeline.from_pretrained("${modelPath}", device=device, torch_dtype=torch.bfloat16)

images = pipe(
    ["${request.prompt.replace(/"/g, '\\"').replace(/\n/g, " ")}"],
    cfg=${request.cfg},
    top_k=${request.topK},
    top_p=${request.topP},
    more_smooth=${request.moreSmooth ? "True" : "False"},
    return_pil=True,
    smooth_start_si=${request.smoothStartSi},
    turn_on_cfg_start_si=${request.turnOnCfgStartSi},
    turn_off_cfg_start_si=${request.turnOffCfgStartSi},
    last_scale_temp=${request.lastScaleTemp},
    seed=${request.seed},
)

images[0].save("${outputPath.replace(/\\/g, "/")}")
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
