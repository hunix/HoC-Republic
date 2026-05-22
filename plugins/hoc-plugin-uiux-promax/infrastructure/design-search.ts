/**
 * Infrastructure — Design Search Engine
 *
 * Wraps the UI/UX Pro Max Python search.py script.
 * Provides BM25 search across CSV databases and
 * full design system generation.
 *
 * ZERO-CONFIG: Auto-clones the skill repo on first use
 * if not already present. No user setup required.
 */

import { execFile, execFileSync as nodeExecFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { DesignDomain, OutputFormat, TechStack, UiuxConfig } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const REPO_URL = "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git";
const REPO_DIR_NAME = "ui-ux-pro-max-skill";

// ─── Installation Detection ─────────────────────────────────────

export interface InstallationStatus {
  installed: boolean;
  pythonAvailable: boolean;
  searchScriptFound: boolean;
  dataFilesFound: string[];
  autoCloned: boolean;
  errors: string[];
}

function execFileSyncSafe(cmd: string, args: string[], options?: Record<string, unknown>): string {
  return nodeExecFileSync(cmd, args, {
    encoding: "utf-8",
    timeout: 15_000,
    ...options,
  });
}

// ─── Auto-Clone ─────────────────────────────────────────────────

/**
 * Auto-clone the UI/UX Pro Max skill repo if not present.
 * Uses a shallow clone (depth=1) to minimize download size.
 * Falls back gracefully if git is unavailable.
 */
export function ensureRepoCloned(installPath: string): {
  cloned: boolean;
  error?: string;
} {
  const repoDir = path.join(installPath, REPO_DIR_NAME);

  // Already cloned?
  const searchScript = path.join(repoDir, "src", "ui-ux-pro-max", "scripts", "search.py");
  if (fs.existsSync(searchScript)) {
    return { cloned: false }; // already present
  }

  // Ensure parent dir exists
  fs.mkdirSync(installPath, { recursive: true });

  // Check git is available
  try {
    execFileSyncSafe("git", ["--version"]);
  } catch {
    return { cloned: false, error: "git not found — cannot auto-clone skill repo" };
  }

  // Shallow clone
  try {
    execSync(`git clone --depth 1 "${REPO_URL}" "${repoDir}"`, {
      cwd: installPath,
      timeout: 120_000, // 2 minutes for clone
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { cloned: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { cloned: false, error: `Auto-clone failed: ${e.message ?? "unknown error"}` };
  }
}

// ─── Auto-Detect Python ─────────────────────────────────────────

/**
 * Find a working Python 3 executable.
 * Tries python3, python, py -3, and common Windows/Linux paths.
 */
export function findPython(): string {
  const candidates = ["python3", "python", "py"];

  for (const cmd of candidates) {
    try {
      const args = cmd === "py" ? ["-3", "--version"] : ["--version"];
      const result = execFileSyncSafe(cmd, args);
      if (result.includes("Python 3.")) {
        return cmd === "py" ? "py -3" : cmd;
      }
    } catch {
      // try next
    }
  }

  return "python"; // fallback
}

// ─── Full Detection ─────────────────────────────────────────────

export function detectInstallation(config: UiuxConfig): InstallationStatus {
  const errors: string[] = [];
  let pythonAvailable = false;
  let searchScriptFound = false;
  const dataFilesFound: string[] = [];
  let autoCloned = false;

  // Step 1: Auto-clone if needed
  const cloneResult = ensureRepoCloned(
    path.dirname(config.installPath || path.join(config.outputDir, "..", REPO_DIR_NAME)),
  );
  if (cloneResult.cloned) {
    autoCloned = true;
  }
  if (cloneResult.error) {
    errors.push(cloneResult.error);
  }

  // Step 2: Check Python
  try {
    const pyArgs = config.pythonPath === "py -3" ? ["-3", "--version"] : ["--version"];
    const pyCmd = config.pythonPath.startsWith("py ") ? "py" : config.pythonPath;
    const result = execFileSyncSafe(pyCmd, pyArgs);
    pythonAvailable = result.includes("Python 3.");
    if (!pythonAvailable) {
      errors.push(`Python 3.8+ required, found: ${result.trim()}`);
    }
  } catch {
    errors.push("Python not found at: " + config.pythonPath);
  }

  // Step 3: Check search.py
  searchScriptFound = fs.existsSync(config.searchScriptPath);
  if (!searchScriptFound) {
    errors.push(`search.py not found at: ${config.searchScriptPath}`);
  }

  // Step 4: Check CSV data files
  if (config.dataDir && fs.existsSync(config.dataDir)) {
    try {
      const files = fs.readdirSync(config.dataDir);
      for (const f of files) {
        if (f.endsWith(".csv")) {
          dataFilesFound.push(f);
        }
      }
      if (dataFilesFound.length === 0) {
        errors.push("No CSV data files found in data directory");
      }
    } catch {
      errors.push("Failed to scan data directory");
    }
  }

  return {
    installed: pythonAvailable && searchScriptFound && dataFilesFound.length > 0,
    pythonAvailable,
    searchScriptFound,
    dataFilesFound,
    autoCloned,
    errors,
  };
}

// ─── Search Command Runner ──────────────────────────────────────

interface SearchOptions {
  domain?: DesignDomain;
  stack?: TechStack;
  designSystem?: boolean;
  projectName?: string;
  format?: OutputFormat;
  persist?: boolean;
  page?: string;
}

function runSearch(
  config: UiuxConfig,
  query: string,
  options: SearchOptions,
  onComplete: (exitCode: number, stdout: string, stderr: string) => void,
): void {
  // Handle "py -3" style commands
  let pyCmd: string;
  let pyArgs: string[];
  if (config.pythonPath.startsWith("py ")) {
    pyCmd = "py";
    pyArgs = ["-3", config.searchScriptPath, query];
  } else {
    pyCmd = config.pythonPath;
    pyArgs = [config.searchScriptPath, query];
  }

  if (options.designSystem) {
    pyArgs.push("--design-system");
  }
  if (options.domain) {
    pyArgs.push("--domain", options.domain);
  }
  if (options.stack) {
    pyArgs.push("--stack", options.stack);
  }
  if (options.projectName) {
    pyArgs.push("-p", options.projectName);
  }
  if (options.format) {
    pyArgs.push("-f", options.format);
  }
  if (options.persist) {
    pyArgs.push("--persist");
  }
  if (options.page) {
    pyArgs.push("--page", options.page);
  }

  execFile(
    pyCmd,
    pyArgs,
    {
      cwd: path.dirname(config.searchScriptPath),
      timeout: config.timeoutMs,
    },
    (err, stdout, stderr) => {
      const code = err ? 1 : 0;
      onComplete(code, stdout ?? "", stderr ?? "");
    },
  );
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Generate a complete design system for a project description.
 */
export function generateDesignSystem(
  config: UiuxConfig,
  query: string,
  projectName?: string,
  format?: OutputFormat,
  onComplete?: (exitCode: number, output: string) => void,
): void {
  runSearch(
    config,
    query,
    { designSystem: true, projectName, format: format ?? "markdown" },
    (code, stdout, stderr) => {
      onComplete?.(code, code === 0 ? stdout : stderr);
    },
  );
}

/**
 * Search a specific design domain (style, color, typography, chart, ux).
 */
export function searchDomain(
  config: UiuxConfig,
  query: string,
  domain: DesignDomain,
  stack?: TechStack,
  onComplete?: (exitCode: number, output: string) => void,
): void {
  runSearch(config, query, { domain, stack }, (code, stdout, stderr) => {
    onComplete?.(code, code === 0 ? stdout : stderr);
  });
}

/**
 * Persist a design system to the filesystem (MASTER.md + page overrides).
 */
export function persistDesignSystem(
  config: UiuxConfig,
  query: string,
  projectName: string,
  page?: string,
  onComplete?: (exitCode: number, output: string) => void,
): void {
  runSearch(
    config,
    query,
    { designSystem: true, persist: true, projectName, page },
    (code, stdout, stderr) => {
      onComplete?.(code, code === 0 ? stdout : stderr);
    },
  );
}
