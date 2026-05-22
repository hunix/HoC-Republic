import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveOpenClawPackageRoot } from "../infra/openclaw-root.js";

const FALLBACK_TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/reference/templates",
);

let cachedTemplateDir: string | undefined;
let resolvingTemplateDir: Promise<string> | undefined;

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function resolveWorkspaceTemplateDir(opts?: {
  cwd?: string;
  argv1?: string;
  moduleUrl?: string;
}): Promise<string> {
  if (cachedTemplateDir) {
    return cachedTemplateDir;
  }
  if (resolvingTemplateDir) {
    return resolvingTemplateDir;
  }

  resolvingTemplateDir = (async () => {
    const moduleUrl = opts?.moduleUrl ?? import.meta.url;
    const argv1 = opts?.argv1 ?? process.argv[1];
    const cwd = opts?.cwd ?? process.cwd();

    const packageRoot = await resolveOpenClawPackageRoot({ moduleUrl, argv1, cwd });

    // Build candidates list — try multiple strategies to find templates.
    // The template dir lives at <packageRoot>/docs/reference/templates.
    const candidates: string[] = [];

    // 1. Best case: packageRoot resolved successfully
    if (packageRoot) {
      candidates.push(path.join(packageRoot, "docs", "reference", "templates"));
    }

    // 2. Walk up from module URL (handles src/agents/ and dist/agents/ layouts)
    const moduleDir = path.dirname(fileURLToPath(moduleUrl));
    for (let depth = 1; depth <= 4; depth++) {
      const ancestor = path.resolve(moduleDir, ...Array(depth).fill(".."));
      candidates.push(path.join(ancestor, "docs", "reference", "templates"));
    }

    // 3. Try resolving symlinks (npm global installs often use symlinked bins)
    try {
      const realModuleDir = await fs.realpath(moduleDir);
      if (realModuleDir !== moduleDir) {
        for (let depth = 1; depth <= 4; depth++) {
          const ancestor = path.resolve(realModuleDir, ...Array(depth).fill(".."));
          candidates.push(path.join(ancestor, "docs", "reference", "templates"));
        }
      }
    } catch {
      // realpath failure is non-fatal
    }

    // 4. cwd-relative (last resort for dev/monorepo setups)
    if (cwd) {
      candidates.push(path.resolve(cwd, "docs", "reference", "templates"));
    }

    // 5. Static fallback computed at module load time
    candidates.push(FALLBACK_TEMPLATE_DIR);

    // Deduplicate
    const seen = new Set<string>();
    const uniqueCandidates = candidates.filter((c) => {
      if (seen.has(c)) {return false;}
      seen.add(c);
      return true;
    });

    for (const candidate of uniqueCandidates) {
      if (await pathExists(candidate)) {
        cachedTemplateDir = candidate;
        return candidate;
      }
    }

    cachedTemplateDir = uniqueCandidates[0] ?? FALLBACK_TEMPLATE_DIR;
    return cachedTemplateDir;
  })();

  try {
    return await resolvingTemplateDir;
  } finally {
    resolvingTemplateDir = undefined;
  }
}

export function resetWorkspaceTemplateDirCache() {
  cachedTemplateDir = undefined;
  resolvingTemplateDir = undefined;
}
