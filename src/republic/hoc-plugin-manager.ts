/**
 * HoC Plugin Manager
 *
 * Scans, validates, initializes, and manages the lifecycle of HoC plugins.
 * Each plugin is a DDD-bounded context in its own directory under plugins/.
 *
 * Boot integration:
 *   Gateway Start → loadHoCPlugins() → initInferenceGateway() → autoStartSimulation()
 *
 * Plugin directory structure:
 *   plugins/
 *   ├── hoc-plugin-foo/
 *   │   ├── hoc.plugin.json       ← Manifest (required)
 *   │   ├── index.ts               ← Entry point (exports init/shutdown/healthCheck)
 *   │   ├── domain/                 ← Pure types
 *   │   ├── application/            ← Use cases
 *   │   ├── infrastructure/         ← External API clients
 *   │   └── adapter/                ← HoC integration bridges
 *   └── hoc-plugin-bar/
 *       └── ...
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  HoCHealthStatus,
  HoCPluginManifest,
  HoCPluginRecord,
  HoCPluginContext,
  HoCPluginLogger,
  HoCPluginModule,
} from "./hoc-plugin-types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { registerProvider } from "./compute-router.js";
import { isDeclarativePlugin, loadDeclarativePlugin } from "./hoc-plugin-declarative-loader.js";
import {
  killPluginWorker,
  busCallTool,
  busCallGateway,
  busHasTool,
  busHasGatewayMethod,
  busGetToolOwner,
  busGetAllTools,
  fanOutEvent,
  busHealthCheckAll,
  shutdownAllWorkers,
} from "./plugin-bus.js";

const logger = createSubsystemLogger("hoc-plugin-manager");

// ─── State ──────────────────────────────────────────────────────

const PLUGIN_MANIFEST_FILE = "hoc.plugin.json";

/** All discovered / active plugins keyed by ID */
const plugins = new Map<string, HoCPluginRecord>();

let pluginsDir = "";

/** In-process tool registry (legacy plugins that run on main thread) */
const pluginTools = new Map<
  string,
  { pluginId: string; handler: (args: Record<string, unknown>) => unknown }
>();

/** In-process gateway method registry (legacy plugins that run on main thread) */
const pluginGatewayMethods = new Map<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { pluginId: string; handler: (...args: any[]) => unknown }
>();

/** In-process event handler registry (legacy plugins that run on main thread) */
const eventHandlers = new Map<string, Array<(...args: unknown[]) => void>>();

// ─── Plugin Discovery ───────────────────────────────────────────

/**
 * Resolve the plugins directory. Defaults to `plugins/` at the project root.
 * Can be overridden via HoC_PLUGINS_DIR env var.
 */
function resolvePluginsDir(): string {
  if (process.env.HOC_PLUGINS_DIR) {
    return path.resolve(process.env.HOC_PLUGINS_DIR);
  }
  // ESM-compatible __dirname shim
  let thisDir: string;
  try {
    thisDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    thisDir = process.cwd();
  }
  // Walk up from this file's location to find the project root
  let dir = path.resolve(thisDir);
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      return path.join(dir, "plugins");
    }
    dir = path.dirname(dir);
  }
  return path.join(process.cwd(), "plugins");
}

/**
 * Normalize old-format manifests (autoBootstrap, array capabilities, entry)
 * into the new object-format. Does not modify files on disk.
 */
function normalizeManifest(raw: Record<string, unknown>, dirName: string): HoCPluginManifest {
  const manifest = raw as unknown as HoCPluginManifest;

  // Auto-derive id from directory name or 'name' field
  if (!manifest.id) {
    manifest.id = (raw.name as string) ?? dirName;
  }

  // Normalize old array capabilities → object form
  if (Array.isArray(manifest.capabilities)) {
    const arr = manifest.capabilities as unknown as string[];
    manifest.capabilities = {
      tools: arr.filter(
        (c) => !["inference", "agent-communication", "agent-discovery"].includes(c),
      ),
      inference: arr.includes("inference"),
    };
  }

  // Normalize old entry field → lifecycle.init
  if (!manifest.lifecycle && (raw).entry) {
    const entry = (raw).entry as string;
    const initFile = entry.replace(/^\.\//, "").replace(/\.js$/, ".ts");
    manifest.lifecycle = { init: `${initFile}#default` };
  }

  // Default bootPriority
  if (manifest.bootPriority == null) {
    manifest.bootPriority = 50;
  }

  // Normalize old requires → requirements
  if (!manifest.requirements && (raw).requires) {
    const req = (raw).requires as Record<string, unknown>;
    manifest.requirements = {
      binaries: Object.keys(req).filter((k) => !["pip", "gpu_vram_gb", "network"].includes(k)),
    };
  }

  return manifest;
}

/**
 * Scan the plugins directory for valid plugin manifests.
 */
function scanPlugins(dir: string): HoCPluginManifest[] {
  if (!fs.existsSync(dir)) {
    logger.info(`Plugins directory does not exist: ${dir}. Skipping plugin scan.`);
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const manifests: HoCPluginManifest[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(dir, entry.name, PLUGIN_MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) {
      logger.debug?.(`Skipping ${entry.name}: no ${PLUGIN_MANIFEST_FILE}`);
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const manifest = normalizeManifest(parsed, entry.name);

      if (!manifest.name || !manifest.version) {
        logger.warn(`Invalid manifest in ${entry.name}: missing name/version`);
        continue;
      }

      manifests.push(manifest);
      logger.info(`Discovered plugin: ${manifest.name} v${manifest.version} (${manifest.id})`);
    } catch (err) {
      logger.warn(
        `Failed to parse ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Sort by boot priority (lower = earlier)
  manifests.sort((a, b) => (a.bootPriority ?? 50) - (b.bootPriority ?? 50));

  return manifests;
}

// ─── Plugin Context Factory ─────────────────────────────────────

/**
 * Create the context object passed to a plugin's init() function.
 * This is the plugin's API surface for interacting with HoC.
 */
function createPluginContext(record: HoCPluginRecord): HoCPluginContext {
  const pluginLogger: HoCPluginLogger = {
    info: (msg: string) => logger.info(`[${record.id}] ${msg}`),
    warn: (msg: string) => logger.warn(`[${record.id}] ${msg}`),
    error: (msg: string) => logger.error(`[${record.id}] ${msg}`),
    debug: (msg: string) => logger.debug?.(`[${record.id}] ${msg}`),
  };

  return {
    dataDir: record.dataDir,
    pluginDir: record.pluginDir,
    logger: pluginLogger,
    // Compatibility alias — many plugins destructure `log` instead of `logger`
    log: pluginLogger,

    registerProvider(name: string, config) {
      registerProvider(`plugin-${record.id}-${name}`, {
        available: config.available,
        models: config.models,
        throughput: config.throughput,
      });
      pluginLogger.info(`Registered provider: ${name} (${config.models.length} models)`);
    },

    registerTools(tools) {
      for (const tool of tools) {
        pluginTools.set(tool.name, {
          pluginId: record.id,
          handler: tool.handler as (args: Record<string, unknown>) => unknown,
        });
        pluginLogger.info(`Registered tool: ${tool.name}`);
      }
    },

    // Compatibility alias — plugins use singular registerTool(name, desc, schema, handler)
    registerTool(
      name: string,
      _description: string,
      _schema: unknown,
      handler: (args: Record<string, unknown>) => unknown,
    ) {
      pluginTools.set(name, { pluginId: record.id, handler });
      pluginLogger.info(`Registered tool: ${name}`);
    },

    on(event: string, handler: (...args: unknown[]) => void) {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
      pluginLogger.debug?.(`Subscribed to event: ${event}`);
    },

    emit(event: string, data: unknown) {
      const handlers = eventHandlers.get(event) ?? [];
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (err) {
          pluginLogger.error(
            `Event handler error for "${event}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    },

    registerGateway(method: string, handler) {
      const fullMethod = `plugin.${record.id}.${method}`;
      pluginGatewayMethods.set(fullMethod, { pluginId: record.id, handler });
      // Also register under the un-prefixed method name (e.g. "magicanimate.queue-status")
      pluginGatewayMethods.set(method, { pluginId: record.id, handler });
      // Also register under "${pluginId}.${method}" — PluginShell uses this convention:
      // it calls `republic.plugins.call-gateway` with method = `${pluginId}.${shortMethod}`,
      // e.g. "hoc-plugin-magicanimate.queue-status"
      const pluginIdPrefixedMethod = `${record.id}.${method}`;
      pluginGatewayMethods.set(pluginIdPrefixedMethod, { pluginId: record.id, handler });
      // Also register ${id}.${shortMethod} — when method is "chatterbox.speak"
      // and id is "hoc-plugin-chatterbox", register "hoc-plugin-chatterbox.speak"
      // so the PluginShell UI can call it without double-prefixing.
      const dotIdx = method.indexOf(".");
      if (dotIdx > 0) {
        const shortMethod = method.slice(dotIdx + 1);
        const shortKey = `${record.id}.${shortMethod}`;
        if (shortKey !== pluginIdPrefixedMethod) {
          pluginGatewayMethods.set(shortKey, { pluginId: record.id, handler });
        }
      }
      pluginLogger.info(`Registered gateway: ${method} (also ${pluginIdPrefixedMethod})`);
    },
  };
}

// ─── Plugin Loading & Initialization ────────────────────────────

/**
 * Load a single plugin module from its directory.
 * Expects an index.ts/index.js entry point with optional init/shutdown/healthCheck exports.
 */
async function loadPluginModule(
  pluginDir: string,
  manifest: HoCPluginManifest,
): Promise<HoCPluginModule | null> {
  // Try multiple entry point patterns
  const entryPoints = [
    path.join(pluginDir, "index.ts"),
    path.join(pluginDir, "index.js"),
    path.join(pluginDir, "index.mts"),
    path.join(pluginDir, "index.mjs"),
  ];

  // If manifest specifies a custom init path, resolve it
  if (manifest.lifecycle?.init) {
    const [file] = manifest.lifecycle.init.split("#");
    if (file) {
      entryPoints.unshift(path.join(pluginDir, file));
    }
  }

  for (const entry of entryPoints) {
    if (fs.existsSync(entry)) {
      try {
        // Dynamic import for ESM compatibility — Windows needs file:// URLs
        const entryUrl = pathToFileURL(entry).href;
        const mod = (await import(entryUrl)) as HoCPluginModule;
        return mod;
      } catch (err) {
        logger.warn(
          `Failed to load plugin module ${entry}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  // Plugin without code is valid — it may be data-only or declare capabilities
  // that are fulfilled by conventions (e.g., provider registration via manifest)
  return null;
}

// ─── Model ID → HuggingFace Repo Mapping ───────────────────────
// Covers all models used by PluginShell across all plugins.
const MODEL_HF_REPOS: Record<string, string> = {
  // MagicAnimate
  "magicanimate-main": "zcxu-eric/MagicAnimate",
  "controlnet-pose": "lllyasviel/ControlNet",
  "stable-diffusion-1.5": "runwayml/stable-diffusion-v1-5",
  // FaceFusion
  inswapper_128: "netrunner-xyz/inswapper",
  "gfpgan_1.4": "camenduru/GFPGANv1.4",
  realesrgan_x2plus: "ai-forever/Real-ESRGAN",
  face_colorizer: "dpaul4/face-colorizer",
  expression_restorer: "facefusion/expression-restorer",
  // DeepFaceLab
  "dfl-saehd": "deepfacelab/SAEHD",
  "dfl-amp": "deepfacelab/AMP",
  "dfl-quick96": "deepfacelab/Quick96",
  // DGM
  "dgm-main": "dgm-project/DGM",
  // StableAvatar
  "stable-avatar-main": "fightflyheight/StableAvatar",
  // Switti
  "switti-512": "yandex-research/switti",
  // Sparc3D
  "sparc3d-main": "VAST-AI-Research/Sparc3D",
  // EasyVolcap
  "easyvolcap-main": "zju3dv/EasyVolcap",
  // MMAudio
  "mmaudio-small-44k": "hkchengrex/MMAudio",
  "mmaudio-medium-44k": "hkchengrex/MMAudio",
  // KV-Edit
  "flux-kv": "black-forest-labs/FLUX.1-dev",
  // OmniGen
  "omnigen-v1": "Shitao/OmniGen-v1",
  // GLM Image
  "glm-image": "THUDM/CogView4-6B",
};

/**
 * Auto-register `{pluginId}.model-download` and `{pluginId}.model-delete` for every plugin.
 * The PluginShell calls these via `republic.plugins.call-gateway`.
 */
function _registerAutoModelHandlers(
  pluginId: string,
  dataDir: string,
  ctx: HoCPluginContext,
): void {
  // model-download: resolve HF repo from model ID and run huggingface-cli download
  ctx.registerGateway(`${pluginId}.model-download`, ((rawParams: unknown) => {
    const params = (rawParams ?? {}) as Record<string, unknown>;
    const modelId = params.modelId as string | undefined;
    if (!modelId) {
      return { ok: false, error: "modelId is required" };
    }

    const hfRepo = MODEL_HF_REPOS[modelId];
    if (!hfRepo) {
      // Attempt to treat modelId directly as a HF repo ID
      ctx.logger.warn(
        `[model-download] Unknown modelId="${modelId}", treating as HF repo directly`,
      );
    }

    const targetRepo = hfRepo ?? modelId;
    const localDir = path.join(dataDir, modelId.replace(/\//g, "-"));

    // Already downloaded?
    if (fs.existsSync(localDir) && fs.readdirSync(localDir).length > 2) {
      return { ok: true, cached: true, localDir };
    }

    fs.mkdirSync(localDir, { recursive: true });

    // Non-blocking spawn — returns immediately with job info, download runs in background
    const proc = spawn("huggingface-cli", ["download", targetRepo, "--local-dir", localDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (d: Buffer) =>
      ctx.logger.info(`[model-download/${modelId}] ${d.toString().trim()}`),
    );
    proc.stderr?.on("data", (d: Buffer) =>
      ctx.logger.info(`[model-download/${modelId}] ${d.toString().trim()}`),
    );
    proc.on("exit", (code: number | null) => {
      if (code === 0) {
        ctx.logger.info(`[model-download] ${modelId} downloaded successfully to ${localDir}`);
      } else {
        ctx.logger.warn(`[model-download] ${modelId} download exited with code ${code}`);
      }
    });

    return { ok: true, started: true, modelId, targetRepo, localDir };
  }) as unknown as Parameters<typeof ctx.registerGateway>[1]);

  // model-delete: remove the local model directory
  ctx.registerGateway(`${pluginId}.model-delete`, ((rawParams: unknown) => {
    const params = (rawParams ?? {}) as Record<string, unknown>;
    const modelId = params.modelId as string | undefined;
    if (!modelId) {
      return { ok: false, error: "modelId is required" };
    }
    const localDir = path.join(dataDir, modelId.replace(/\//g, "-"));
    try {
      if (fs.existsSync(localDir)) {
        fs.rmSync(localDir, { recursive: true, force: true });
        ctx.logger.info(`[model-delete] Removed ${localDir}`);
        return { ok: true, deleted: true, localDir };
      }
      return { ok: true, deleted: false, message: "Model directory not found" };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }) as unknown as Parameters<typeof ctx.registerGateway>[1]);
}

/**
 * Initialize a single plugin.
 */
async function initPlugin(manifest: HoCPluginManifest, dir: string): Promise<HoCPluginRecord> {
  const pluginDir = path.join(dir, manifest.id);

  // ── Data directory resolution ──────────────────────────────────
  // Priority 1: HOC_PLUGIN_DATA_DIR env var lets users point plugins at a custom location
  // Priority 2: Standard <pluginsDir>/.data/<pluginId>
  // Priority 3: Legacy short name (strip "hoc-plugin-" prefix) — models downloaded by older
  //             code that used the manifest id before it was normalised to "hoc-plugin-<name>"
  const shortId = manifest.id.replace(/^hoc-plugin-/, "");
  const standardDataDir = process.env.HOC_PLUGIN_DATA_DIR
    ? path.join(path.resolve(process.env.HOC_PLUGIN_DATA_DIR), manifest.id)
    : path.join(dir, ".data", manifest.id);
  const legacyDataDir = path.join(dir, ".data", shortId);

  // Pick the dir that already has content, preferring standard over legacy
  function dirFileCount(d: string): number {
    try {
      const items = fs.readdirSync(d, { recursive: true });
      return Array.isArray(items) ? items.length : 0;
    } catch {
      return 0;
    }
  }

  const useData = (() => {
    const stdCount = dirFileCount(standardDataDir);
    const legCount = shortId !== manifest.id ? dirFileCount(legacyDataDir) : 0;
    // Prefer legacy if it has significantly more content (models were downloaded there)
    if (legCount > stdCount + 5 && legCount > 0) {
      logger.info(`[${manifest.id}] Using legacy data dir (${legCount} items): ${legacyDataDir}`);
      return legacyDataDir;
    }
    return standardDataDir;
  })();

  const dataDir = useData;

  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const record: HoCPluginRecord = {
    id: manifest.id,
    manifest,
    pluginDir,
    dataDir,
    status: "initializing",
    loadedAt: Date.now(),
  };

  try {
    // Check requirements
    if (manifest.requirements?.env) {
      const missingEnv = manifest.requirements.env.filter((v) => !process.env[v]);
      if (missingEnv.length > 0) {
        logger.warn(
          `Plugin ${manifest.id}: missing env vars: ${missingEnv.join(", ")} — skipping init()`,
        );
        record.status = "loaded";
        record.error = `Missing env: ${missingEnv.join(", ")}`;
        return record;
      }
    }

    // ── Declarative path: manifest has `backend` → use declarative loader ──
    if (isDeclarativePlugin(manifest)) {
      const ctx = createPluginContext(record);
      await loadDeclarativePlugin(record, ctx);
      record.status = "ready";
      logger.info(`Plugin initialized (declarative): ${manifest.name} v${manifest.version}`);
      return record;
    }

    // ── Legacy path: hand-coded plugin with index.ts ──
    const mod = await loadPluginModule(pluginDir, manifest);
    record.module = mod ?? undefined;

    const ctx = createPluginContext(record);

    if (mod) {
      // Case 1: module exports `init` function directly
      if (typeof mod.init === "function") {
        await mod.init(ctx);
      }
      // Case 2: module has a HocPlugin object as default export
      else if (mod.default && typeof mod.default === "object" && mod.default !== null) {
        const plugin = mod.default as {
          init?: (ctx: HoCPluginContext) => Promise<void> | void;
          shutdown?: () => Promise<void> | void;
          tools?: Array<{
            name: string;
            handler: (args: Record<string, unknown>, c?: unknown) => unknown;
          }>;
          gateway?: Record<string, (params: Record<string, unknown>, c?: unknown) => unknown>;
          events?: Record<string, (payload: unknown, c?: unknown) => unknown>;
        };
        // Call plugin.init() if present
        if (typeof plugin.init === "function") {
          await plugin.init(ctx);
        }
        // Register tools declared in plugin.tools[]
        if (Array.isArray(plugin.tools)) {
          for (const tool of plugin.tools) {
            if (tool?.name && typeof tool.handler === "function") {
              ctx.registerTool(
                tool.name,
                (tool as { description?: string }).description ?? "",
                (tool as { parameters?: unknown }).parameters ?? {},
                (args) => tool.handler(args, ctx),
              );
            }
          }
        }
        // Register gateway methods declared in plugin.gateway{}
        if (plugin.gateway && typeof plugin.gateway === "object") {
          for (const [method, fn] of Object.entries(plugin.gateway)) {
            if (typeof fn === "function") {
              ctx.registerGateway(method, ((params: unknown) =>
                fn(params as Record<string, unknown>, ctx)) as unknown as Parameters<
                typeof ctx.registerGateway
              >[1]);
            }
          }
        }
        // Register event handlers declared in plugin.events{}
        if (plugin.events && typeof plugin.events === "object") {
          for (const [event, fn] of Object.entries(plugin.events)) {
            if (typeof fn === "function") {
              ctx.on(event, (payload) => fn(payload, ctx));
            }
          }
        }
        logger.info(
          `[${manifest.id}] Auto-registered ${Object.keys(plugin.gateway ?? {}).length} gateway methods, ${(plugin.tools ?? []).length} tools from HocPlugin object`,
        );
      }
      // Case 3: default export is a register() function (very old plugins)
      else if (typeof mod.default === "function") {
        await Promise.resolve(mod.default(ctx));
      }
    }

    // Auto-register providers declared in manifest
    if (manifest.capabilities?.providers) {
      for (const providerName of manifest.capabilities.providers) {
        registerProvider(`plugin-${manifest.id}-${providerName}`, {
          available: true,
          models: [],
        });
      }
    }

    // ── Auto-register universal model-download / model-delete methods ──
    // The PluginShell UI calls {pluginId}.model-download and {pluginId}.model-delete.
    // Plugins don't need to implement these manually — we provide them here.
    // Download uses huggingface-cli; delete removes the local directory.
    _registerAutoModelHandlers(record.id, dataDir, ctx);

    record.status = "ready";
    logger.info(`Plugin initialized: ${manifest.name} v${manifest.version}`);
  } catch (err) {
    record.status = "error";
    record.error = err instanceof Error ? err.message : String(err);
    logger.error(`Plugin ${manifest.id} init failed: ${record.error}`);
  }

  return record;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Create a discovered (not yet initialized) plugin record from a manifest.
 */
function createDiscoveredRecord(manifest: HoCPluginManifest, dir: string): HoCPluginRecord {
  const pluginDir = path.join(dir, manifest.id);
  const dataDir = path.join(dir, ".data", manifest.id);
  return {
    id: manifest.id,
    manifest,
    pluginDir,
    dataDir,
    status: "discovered",
    loadedAt: 0,
  };
}

/**
 * Scan and discover all HoC plugins without initializing them.
 * Called during gateway boot — plugins start as "discovered" and
 * must be activated on demand via activatePlugin().
 *
 * Returns the number of discovered plugins.
 */
export async function loadHoCPlugins(): Promise<number> {
  pluginsDir = resolvePluginsDir();
  logger.info(`Scanning for plugins in: ${pluginsDir}`);

  const manifests = scanPlugins(pluginsDir);
  if (manifests.length === 0) {
    logger.info("No HoC plugins found.");
    return 0;
  }

  logger.info(`Found ${manifests.length} plugin(s). Initializing in boot priority order...`);

  for (const manifest of manifests) {
    const record = createDiscoveredRecord(manifest, pluginsDir);
    plugins.set(record.id, record);
  }

  logger.info(`Discovered ${manifests.length} plugin(s). None auto-initialized — activate via UI.`);
  return manifests.length;
}

/**
 * Activate (load + initialize) a single plugin by ID.
 * Called on demand from the UI.
 */
export async function activatePlugin(id: string): Promise<{ ok: boolean; error?: string }> {
  const existing = plugins.get(id);
  if (!existing) {
    return { ok: false, error: `Plugin "${id}" not found` };
  }
  if (existing.status === "ready") {
    return { ok: true }; // already active
  }

  logger.info(`Activating plugin: ${existing.manifest.name} (${id})...`);
  try {
    const record = await initPlugin(existing.manifest, pluginsDir);
    plugins.set(record.id, record);
    if (record.status === "ready" || record.status === "loaded") {
      logger.info(`Plugin activated: ${record.manifest.name}`);
      return { ok: true };
    }
    return { ok: false, error: record.error ?? "Unknown init error" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to activate plugin ${id}: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Deactivate (shut down) a single plugin by ID.
 * Cleans up tools, event handlers, and gateway methods registered by the plugin.
 */
export async function deactivatePlugin(id: string): Promise<{ ok: boolean; error?: string }> {
  const record = plugins.get(id);
  if (!record) {
    return { ok: false, error: `Plugin "${id}" not found` };
  }
  if (record.status === "discovered" || record.status === "stopped") {
    return { ok: true }; // already inactive
  }

  logger.info(`Deactivating plugin (out-of-process): ${record.manifest.name} (${id})...`);
  try {
    await killPluginWorker(id);
    record.status = "stopped";
    record.module = undefined;
    logger.info(`Plugin deactivated: ${record.manifest.name}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to deactivate plugin ${id}: ${msg}`);
    return { ok: false, error: msg };
  }
}

/**
 * Re-scan the plugins directory for new plugins.
 * Existing plugins are not re-scanned; only new directories are added.
 */
export function rescanPlugins(): number {
  pluginsDir = pluginsDir || resolvePluginsDir();
  const manifests = scanPlugins(pluginsDir);
  let newCount = 0;
  for (const manifest of manifests) {
    if (!plugins.has(manifest.id)) {
      const record = createDiscoveredRecord(manifest, pluginsDir);
      plugins.set(record.id, record);
      newCount++;
    }
  }
  if (newCount > 0) {
    logger.info(`Discovered ${newCount} new plugin(s) during rescan.`);
  }
  return newCount;
}

/**
 * Shut down all loaded plugins gracefully.
 * Called during gateway shutdown.
 */
export async function shutdownHoCPlugins(): Promise<void> {
  logger.info("Shutting down HoC plugins...");
  await shutdownAllWorkers();
  plugins.clear();
  logger.info("All plugins shut down.");
}

/**
 * Run health checks on all loaded plugins via their worker processes.
 */
export async function healthCheckPlugins(): Promise<Record<string, HoCHealthStatus>> {
  // For plugins with active workers, ask the worker
  const workerResults = await busHealthCheckAll();

  // For plugins that are discovered/stopped (no worker), synthesise a result
  const results: Record<string, HoCHealthStatus> = { ...workerResults };
  for (const [id, record] of plugins) {
    if (!(id in results)) {
      results[id] = {
        healthy: false,
        message:
          record.status === "discovered" ? "Not yet activated" : (record.error ?? record.status),
      };
    }
  }
  return results;
}

/**
 * Get status of all loaded plugins.
 */
export function getPluginStatuses(): HoCPluginRecord[] {
  return Array.from(plugins.values());
}

/**
 * Get a specific plugin by ID.
 */
export function getPlugin(id: string): HoCPluginRecord | undefined {
  return plugins.get(id);
}

/**
 * Emit an event to all plugin workers that have subscribed to it.
 */
export function emitPluginEvent(event: string, data: unknown): void {
  fanOutEvent(event, data);
}

/**
 * Get a callable wrapper for a registered plugin gateway method.
 * Returns an async function that routes the call through the plugin bus.
 */
export function getPluginGatewayMethod(
  method: string,
): ((...args: unknown[]) => Promise<unknown>) | undefined {
  // 1. Check worker-process bus (out-of-process plugins)
  if (busHasGatewayMethod(method)) {
    return (params?: unknown) => busCallGateway(method, params);
  }
  // 2. Fall back to in-process registry (plugins that ran init() on main thread)
  const inProc = pluginGatewayMethods.get(method);
  if (inProc) {
    return (params?: unknown) => Promise.resolve(inProc.handler(params));
  }
  return undefined;
}

/**
 * Get the plugins directory path.
 */
export function getPluginsDir(): string {
  return pluginsDir || resolvePluginsDir();
}

// ─── Plugin Tool Registry ───────────────────────────────────────

/**
 * Get a callable wrapper for a registered plugin tool.
 * Returns an async function that routes the call through the plugin bus.
 */
export function getPluginTool(
  name: string,
): ((args: Record<string, unknown>) => Promise<unknown>) | undefined {
  if (!busHasTool(name)) {
    return undefined;
  }
  return (args: Record<string, unknown>) => busCallTool(name, args);
}

/**
 * Get the plugin ID that registered a given tool.
 */
export function getPluginToolOwner(name: string): string | undefined {
  return busGetToolOwner(name);
}

/**
 * Get all registered plugin tool names.
 */
export function getAllPluginTools(): string[] {
  return busGetAllTools();
}

/**
 * Find all ready plugins whose manifest capabilities include a given string.
 * Handles both array-form (["text-to-image", ...]) and object-form ({ tools: [...] })
 * capabilities in the manifest.
 */
export function getPluginsByCapability(capability: string): HoCPluginRecord[] {
  const results: HoCPluginRecord[] = [];
  for (const record of plugins.values()) {
    if (record.status !== "ready") {
      continue;
    }
    const caps = record.manifest.capabilities;
    if (!caps) {
      continue;
    }
    // Array form: ["text-to-image", "image-to-image", ...]
    if (Array.isArray(caps)) {
      if ((caps as string[]).includes(capability)) {
        results.push(record);
      }
    } else if (typeof caps === "object") {
      // Object form: { tools: [...], providers: [...] } — check all string arrays
      for (const val of Object.values(caps)) {
        if (Array.isArray(val) && (val).includes(capability)) {
          results.push(record);
          break;
        }
        if (typeof val === "string" && val === capability) {
          results.push(record);
          break;
        }
      }
    }
  }
  return results;
}

// ─── Plugin Prompt Injection Registry ────────────────────────────

/**
 * Cache of loaded bridge modules per plugin ID.
 * Lazily populated when getActivePluginPromptSections() is called.
 */
const bridgeModuleCache = new Map<string, Record<string, unknown> | null>();

/**
 * Dynamically collect prompt injection sections from all activated plugins.
 * Each plugin's adapter/hoc-bridge.ts may export a `get*PromptInjection` function.
 * Only activated (ready/loaded) plugins are queried — discovered/stopped plugins are skipped.
 *
 * @param specialization The citizen's specialization (passed to each injection function)
 * @param activity The citizen's current activity
 * @returns Array of prompt section strings (non-empty only)
 */
export async function getActivePluginPromptSections(
  specialization: string,
  activity?: string,
): Promise<string[]> {
  const sections: string[] = [];

  for (const record of plugins.values()) {
    if (record.status !== "ready" && record.status !== "loaded") {
      continue;
    }

    try {
      // Try to get cached bridge module
      let bridgeMod = bridgeModuleCache.get(record.id);
      if (bridgeMod === undefined) {
        // Lazily load the bridge module
        const bridgePath = path.join(record.pluginDir, "adapter", "hoc-bridge.ts");
        const bridgePathJs = path.join(record.pluginDir, "adapter", "hoc-bridge.js");
        const actualPath = fs.existsSync(bridgePath)
          ? bridgePath
          : fs.existsSync(bridgePathJs)
            ? bridgePathJs
            : null;
        if (actualPath) {
          try {
            const url = pathToFileURL(actualPath).href;
            bridgeMod = (await import(url)) as Record<string, unknown>;
          } catch {
            bridgeMod = null;
          }
        } else {
          bridgeMod = null;
        }
        bridgeModuleCache.set(record.id, bridgeMod);
      }

      if (!bridgeMod) {
        continue;
      }

      // Find any export matching *PromptInjection pattern
      for (const [key, fn] of Object.entries(bridgeMod)) {
        if (key.endsWith("PromptInjection") && typeof fn === "function") {
          try {
            // Most functions: (specialization?: string) => string
            // Superpowers variant: (activity, specialization, taskDescription?, compact?) => string
            let result: string;
            if (key === "getSuperpowersPromptInjection") {
              result = (fn as (a: string, s: string, t?: string) => string)(
                activity ?? "",
                specialization,
                activity,
              );
            } else if (key === "getAccPromptInjection") {
              result = (fn as (s?: string, a?: string, t?: string) => string)(
                specialization,
                activity,
                activity,
              );
            } else {
              result = (fn as (s?: string) => string)(specialization);
            }
            if (result) {
              sections.push(result);
            }
          } catch {
            // Individual plugin prompt injection failure is non-fatal
          }
          break; // One injection function per plugin
        }
      }
    } catch {
      // Plugin bridge load failure is non-fatal
    }
  }

  return sections;
}
