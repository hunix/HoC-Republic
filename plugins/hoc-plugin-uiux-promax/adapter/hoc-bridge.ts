/**
 * Adapter — HoC Bridge
 *
 * Manages global state, installation status, and exposes
 * UI/UX Pro Max capabilities to the HoC runtime.
 *
 * ZERO-CONFIG: On init, automatically:
 *   1. Auto-detects Python 3 (python3, python, py -3)
 *   2. Auto-clones the skill repo if not present (shallow, ~2MB)
 *   3. Resolves search.py and CSV data paths
 * No user installation or configuration required.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
    getJob, getQueueStatus, listJobs, requestDesignSystem, requestPersist, requestSearch
} from "../application/design-advisor.ts";
import { composeDesignPrompt } from "../application/prompt-composer.ts";
import type {
    DesignDomain, DesignJob,
    DesignJobStatus, OutputFormat, TechStack, UiuxConfig, UiuxQueueStatus
} from "../domain/types.ts";
import { DEFAULT_CONFIG, DESIGN_DOMAINS, SUPPORTED_STACKS } from "../domain/types.ts";
import {
    detectInstallation,
    findPython,
    type InstallationStatus
} from "../infrastructure/design-search.ts";

// ─── Global State ───────────────────────────────────────────────

let config: UiuxConfig = { ...DEFAULT_CONFIG };
let installStatus: InstallationStatus | null = null;
let initialized = false;

// ─── Lifecycle ──────────────────────────────────────────────────

export function initBridge(dataDir: string): InstallationStatus {
  const outputDir = path.join(dataDir, "design-output");
  fs.mkdirSync(outputDir, { recursive: true });

  // Step 1: Auto-detect Python 3
  const pythonPath = DEFAULT_CONFIG.pythonPath || findPython();

  // Step 2: Resolve skill repo location
  // The repo will be auto-cloned here if not present (inside detectInstallation)
  const installPath = DEFAULT_CONFIG.installPath || path.join(dataDir, "ui-ux-pro-max-skill");
  const repoRoot = path.join(installPath);
  const searchScriptPath = path.join(repoRoot, "src", "ui-ux-pro-max", "scripts", "search.py");
  const dataDirPath = path.join(repoRoot, "src", "ui-ux-pro-max", "data");

  config = {
    ...DEFAULT_CONFIG,
    pythonPath,
    installPath: dataDir, // parent dir for auto-clone target
    searchScriptPath,
    dataDir: dataDirPath,
    outputDir,
  };

  // Step 3: Detect (auto-clones if needed) + validate
  installStatus = detectInstallation(config);
  initialized = true;
  return installStatus;
}

export function isInstalled(): boolean {
  return installStatus?.installed ?? false;
}

export function getConfig(): UiuxConfig {
  return config;
}

// ─── Design Operations ──────────────────────────────────────────

export function submitDesignSystem(
  citizenId: string,
  query: string,
  projectName?: string,
  format?: OutputFormat,
): DesignJob {
  if (!initialized || !installStatus?.installed) {
    throw new Error("UI/UX Pro Max not installed or bridge not initialized");
  }
  return requestDesignSystem(config, citizenId, query, projectName, format);
}

export function submitSearch(
  citizenId: string,
  query: string,
  domain: DesignDomain,
  stack?: TechStack,
): DesignJob {
  if (!initialized || !installStatus?.installed) {
    throw new Error("UI/UX Pro Max not installed or bridge not initialized");
  }
  return requestSearch(config, citizenId, query, domain, stack);
}

export function submitPersist(
  citizenId: string,
  query: string,
  projectName: string,
  page?: string,
): DesignJob {
  if (!initialized || !installStatus?.installed) {
    throw new Error("UI/UX Pro Max not installed or bridge not initialized");
  }
  return requestPersist(config, citizenId, query, projectName, page);
}

export function getDesignJobStatus(jobId: string): DesignJob | undefined {
  return getJob(jobId);
}

export function listDesignJobs(status?: DesignJobStatus): DesignJob[] {
  return listJobs(status);
}

export function getDesignQueueStatus(): UiuxQueueStatus {
  const q = getQueueStatus();
  return {
    totalJobs: q.total,
    completedJobs: q.completed,
    failedJobs: q.failed,
    installed: installStatus?.installed ?? false,
  };
}

export function getAvailableDomains(): typeof DESIGN_DOMAINS {
  return DESIGN_DOMAINS;
}

export function getAvailableStacks(): typeof SUPPORTED_STACKS {
  return SUPPORTED_STACKS;
}

// ─── Prompt Injection ───────────────────────────────────────────

export function getDesignPromptInjection(specialization?: string): string {
  if (!installStatus?.installed) {
    return "";
  }
  return composeDesignPrompt(specialization);
}
