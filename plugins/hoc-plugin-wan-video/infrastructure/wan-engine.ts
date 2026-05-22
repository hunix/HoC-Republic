/**
 * Infrastructure — Wan 2.2 Engine
 *
 * Detects local Wan installation, manages model weights,
 * and executes video generation via CLI.
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { WanConfig } from "../domain/types.ts";

export interface WanInstallStatus {
  ready: boolean;
  pythonPath: string;
  modelPath?: string;
  errors: string[];
}

export function detectInstallation(config: WanConfig): WanInstallStatus {
  const errors: string[] = [];
  let pythonPath = config.pythonPath;

  // Check Python availability
  try {
    execSync(`${pythonPath} --version`, { stdio: "pipe" });
  } catch {
    try {
      pythonPath = "python3";
      execSync(`${pythonPath} --version`, { stdio: "pipe" });
    } catch {
      errors.push("Python not found. Install Python >= 3.10.");
    }
  }

  // Check repository
  if (!existsSync(config.repoDir)) {
    errors.push(`Wan repo not found at ${config.repoDir}. Will clone on first run.`);
  }

  // Check for model weights
  const modelDir = join(config.repoDir, "models");
  let modelPath: string | undefined;
  if (existsSync(modelDir)) {
    const variantMap: Record<string, string> = {
      "1.3B": "wan2.2-t2v-1.3B",
      "5B": "wan2.2-t2v-5B",
      "14B": "wan2.2-t2v-14B",
    };
    const expected = join(modelDir, variantMap[config.modelVariant] ?? "wan2.2-t2v-5B");
    if (existsSync(expected)) {
      modelPath = expected;
    } else {
      errors.push(`Model weights not found. Download ${config.modelVariant} variant.`);
    }
  }

  return {
    ready: errors.length === 0,
    pythonPath,
    modelPath,
    errors,
  };
}

export function buildGenerateCommand(
  config: WanConfig,
  prompt: string,
  options: {
    resolution?: string;
    durationSec?: number;
    fps?: number;
    style?: string;
    cameraMotion?: string;
    seed?: number;
    outputPath: string;
  },
): string {
  const args = [
    config.pythonPath,
    join(config.repoDir, "generate.py"),
    "--task", "t2v-5B",
    "--prompt", JSON.stringify(prompt),
    "--size", options.resolution === "480p" ? "832*480" : "1280*720",
    "--frame_num", String(Math.round((options.durationSec ?? 5) * (options.fps ?? 24))),
    "--save_file", options.outputPath,
  ];
  if (options.seed && options.seed > 0) {args.push("--seed", String(options.seed));}
  return args.join(" ");
}
