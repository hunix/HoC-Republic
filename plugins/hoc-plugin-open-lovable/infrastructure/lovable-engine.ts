/**
 * Infrastructure — Open Lovable Engine
 *
 * Manages Open Lovable lifecycle:
 *   1. Auto-clone repo
 *   2. Install via pnpm/npm
 *   3. Scrape URLs via Firecrawl
 *   4. Generate React apps via AI chat
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { LovableConfig } from "../domain/types.ts";

const REPO_URL = "https://github.com/firecrawl/open-lovable.git";

// ─── Repo Management ────────────────────────────────────────────

export function ensureRepoCloned(repoDir: string): {
  cloned: boolean;
  autoCloned: boolean;
  error?: string;
} {
  if (fs.existsSync(path.join(repoDir, "package.json"))) {
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

export function installDependencies(repoDir: string): {
  installed: boolean;
  error?: string;
} {
  try {
    // Try pnpm first, fall back to npm
    try {
      execSync("pnpm install", {
        timeout: 300_000,
        cwd: repoDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      execSync("npm install", {
        timeout: 300_000,
        cwd: repoDir,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }
    return { installed: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { installed: false, error: `Install failed: ${e.message ?? "unknown"}` };
  }
}

// ─── Installation Status ────────────────────────────────────────

export interface LovableInstallStatus {
  ready: boolean;
  repoCloned: boolean;
  autoClonedRepo: boolean;
  depsInstalled: boolean;
  errors: string[];
}

export function detectInstallation(config: LovableConfig): LovableInstallStatus {
  const errors: string[] = [];

  const repoResult = ensureRepoCloned(config.repoDir);
  if (!repoResult.cloned && repoResult.error) {
    errors.push(repoResult.error);
  }

  let depsInstalled = false;
  if (repoResult.cloned) {
    const nodeModules = path.join(config.repoDir, "node_modules");
    if (fs.existsSync(nodeModules)) {
      depsInstalled = true;
    } else {
      const depResult = installDependencies(config.repoDir);
      depsInstalled = depResult.installed;
      if (!depResult.installed && depResult.error) {
        errors.push(depResult.error);
      }
    }
  }

  if (!config.firecrawlApiKey) {
    errors.push("FIRECRAWL_API_KEY not set");
  }

  return {
    ready: repoResult.cloned && depsInstalled && !!config.firecrawlApiKey,
    repoCloned: repoResult.cloned,
    autoClonedRepo: repoResult.autoCloned,
    depsInstalled,
    errors,
  };
}

// ─── Website Cloning ────────────────────────────────────────────

export function cloneWebsite(
  config: LovableConfig,
  url: string,
  instructions: string | undefined,
  onComplete?: (deployUrl: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });

  // Start the dev server and pass the clone command via API
  const proc = execFile(
    "node",
    [
      "-e",
      `
const fetch = globalThis.fetch ?? require('node-fetch');
async function main() {
  try {
    const res = await fetch('http://localhost:3000/api/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: ${JSON.stringify(url)},
        instructions: ${JSON.stringify(instructions ?? "")},
      }),
    });
    const data = await res.json();
    console.log(JSON.stringify({ status: 'complete', deployUrl: data.url ?? '', code: data.code ?? '' }));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
main();
`,
    ],
    { timeout: config.timeoutMs, cwd: config.repoDir },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      try {
        const result = JSON.parse(stdout.trim());
        onComplete?.(result.deployUrl ?? "");
      } catch {
        onComplete?.("");
      }
    },
  );
  return proc;
}
