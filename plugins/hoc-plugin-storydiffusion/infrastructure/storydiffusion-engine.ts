/**
 * Infrastructure — StoryDiffusion Engine
 *
 * Manages StoryDiffusion lifecycle:
 *   1. Auto-detect Python 3 with PyTorch/CUDA
 *   2. Auto-clone the repository
 *   3. Install pip requirements
 *   4. Spawn Python subprocess for story generation
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { StoryDiffusionConfig, StoryRequest } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/HVision-NKU/StoryDiffusion.git";

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
  if (fs.existsSync(path.join(repoDir, "utils"))) {
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

// ─── Installation Status ────────────────────────────────────────

export interface StoryDiffusionInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: StoryDiffusionConfig): StoryDiffusionInstallStatus {
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

// ─── Story Generation ───────────────────────────────────────────

export function generateStory(
  config: StoryDiffusionConfig,
  request: StoryRequest,
  onComplete?: (outputPaths: string[], videoPath?: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  const outputDir = path.join(config.outputDir, `story_${Date.now()}`);
  fs.mkdirSync(outputDir, { recursive: true });

  const scenesJson = JSON.stringify(
    request.scenes.map((s) => ({
      prompt: s.prompt,
      negative_prompt: s.negativePrompt ?? "",
    })),
  );

  const script = `
import sys, json, os
sys.path.insert(0, "${config.repoDir.replace(/\\/g, "/")}")

# Import StoryDiffusion pipeline
from utils.utils import get_comic
from utils.gradio_utils import (
    cal_attn_mask_xl,
    is_torch2_available,
    get_ref_character,
)
import torch
from diffusers import StableDiffusionXLPipeline

scenes = json.loads('${scenesJson.replace(/'/g, "\\'")}')
output_dir = "${outputDir.replace(/\\/g, "/")}"

# Load model
pipe = StableDiffusionXLPipeline.from_pretrained(
    "stabilityai/stable-diffusion-xl-base-1.0",
    torch_dtype=torch.float16,
).to("cuda")

prompts = [s["prompt"] for s in scenes]
negative_prompts = [s["negative_prompt"] for s in scenes]

# Generate consistent story images
images = get_comic(
    pipe,
    prompts,
    negative_prompts,
    width=${request.width},
    height=${request.height},
    seed=${request.seed},
    guidance_scale=${request.guidanceScale},
    num_inference_steps=${request.numInferenceSteps},
)

output_paths = []
for i, img in enumerate(images):
    p = os.path.join(output_dir, f"scene_{i:03d}.png")
    img.save(p)
    output_paths.append(p)

print(json.dumps({"status": "complete", "outputs": output_paths}))
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
          onComplete?.(result.outputs ?? [], result.video);
        }
      } catch {
        onComplete?.([]);
      }
    },
  );

  return proc;
}
