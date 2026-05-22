/**
 * Infrastructure — HunyuanVideo Engine
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { HunyuanConfig } from "../domain/types.ts";

export interface HunyuanInstallStatus { ready: boolean; pythonPath: string; errors: string[]; }

export function detectInstallation(config: HunyuanConfig): HunyuanInstallStatus {
  const errors: string[] = [];
  let pythonPath = config.pythonPath;
  try { execSync(`${pythonPath} --version`, { stdio: "pipe" }); } catch {
    try { pythonPath = "python3"; execSync(`${pythonPath} --version`, { stdio: "pipe" }); } catch {
      errors.push("Python not found.");
    }
  }
  if (!existsSync(config.repoDir)) {errors.push(`HunyuanVideo repo not found at ${config.repoDir}. Will clone on first run.`);}
  return { ready: errors.length === 0, pythonPath, errors };
}
