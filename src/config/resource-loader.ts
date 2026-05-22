/**
 * Resource Loader — loads config/prompts/branding from editable resource files.
 *
 * Precedence:
 *   1. User override: ~/.openclaw/resources/<name>
 *   2. Project default: <project-root>/resources/<name>
 *
 * This enables editing all configs, prompts, and settings without
 * touching source code or redeploying.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "./paths.js";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
const RESOURCES_DIR = path.join(PROJECT_ROOT, "resources");

function getUserResourcesDir(): string {
  return path.join(resolveStateDir(), "resources");
}

/**
 * Load a resource file by relative name (e.g. "hoc.defaults.json").
 * User overrides in ~/.openclaw/resources/ take precedence.
 */
export function loadResource(name: string): string | null {
  // 1. Check user override
  const userPath = path.join(getUserResourcesDir(), name);
  if (fs.existsSync(userPath)) {
    return fs.readFileSync(userPath, "utf-8");
  }

  // 2. Check project default
  const defaultPath = path.join(RESOURCES_DIR, name);
  if (fs.existsSync(defaultPath)) {
    return fs.readFileSync(defaultPath, "utf-8");
  }

  return null;
}

/**
 * Load a JSON resource and parse it.
 */
export function loadJsonResource<T = Record<string, unknown>>(name: string): T | null {
  const raw = loadResource(name);
  if (!raw) {return null;}
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Load a prompt template and substitute {{variables}}.
 */
export function getPromptTemplate(
  name: string,
  variables: Record<string, string> = {},
): string | null {
  const template = loadResource(`prompts/${name}`);
  if (!template) {return null;}

  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/**
 * Load vision config with sensible defaults.
 */
export function getVisionConfig(): {
  enabled: boolean;
  ollamaEndpoint: string;
  model: string;
  temperature: number;
  requestTimeoutSeconds: number;
  captureFormat: string;
  prompts: Record<string, string>;
} {
  const defaults = {
    enabled: false,
    ollamaEndpoint: "http://localhost:11434",
    model: "qwen3-vl:4b",
    temperature: 0.1,
    requestTimeoutSeconds: 120,
    captureFormat: "png",
    prompts: {} as Record<string, string>,
  };

  const loaded = loadJsonResource<typeof defaults>("vision.config.json");
  return { ...defaults, ...loaded };
}

/**
 * Load HoC system defaults.
 */
export function getSystemDefaults(): Record<string, unknown> {
  return loadJsonResource("hoc.defaults.json") ?? {};
}

/**
 * Load companion service config with sensible defaults.
 */
export function getCompanionConfig(): {
  pipeName: string;
  healthCheckIntervalMs: number;
  clusterHeartbeatIntervalMs: number;
  requestTimeoutMs: number;
  maxConcurrentClients: number;
} {
  const defaults = {
    pipeName: "OpenClawCompanion",
    healthCheckIntervalMs: 30000,
    clusterHeartbeatIntervalMs: 30000,
    requestTimeoutMs: 30000,
    maxConcurrentClients: 10,
  };

  const loaded = loadJsonResource<typeof defaults>("companion.config.json");
  return { ...defaults, ...loaded };
}

/**
 * Save a resource file to the user override directory.
 */
export function saveUserResource(name: string, content: string): void {
  const userPath = path.join(getUserResourcesDir(), name);
  const dir = path.dirname(userPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(userPath, content, "utf-8");
}

/**
 * List all available resource files (both default and user overrides).
 */
export function listResources(): Array<{
  name: string;
  source: "default" | "user-override";
  path: string;
}> {
  const resources: Array<{ name: string; source: "default" | "user-override"; path: string }> = [];
  const seen = new Set<string>();

  // User overrides first
  const userDir = getUserResourcesDir();
  if (fs.existsSync(userDir)) {
    for (const entry of walkDir(userDir)) {
      const relative = path.relative(userDir, entry);
      seen.add(relative);
      resources.push({ name: relative, source: "user-override", path: entry });
    }
  }

  // Project defaults (not overridden)
  if (fs.existsSync(RESOURCES_DIR)) {
    for (const entry of walkDir(RESOURCES_DIR)) {
      const relative = path.relative(RESOURCES_DIR, entry);
      if (!seen.has(relative)) {
        resources.push({ name: relative, source: "default", path: entry });
      }
    }
  }

  return resources;
}

function* walkDir(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}
