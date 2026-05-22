/**
 * Plugin Manager — Gateway RPC Handlers
 *
 * Exposes the HoC plugin registry to the UI, allowing visibility
 * into all 28+ installed plugins, their status, capabilities, and
 * registered gateway methods. Supports on-demand activate/deactivate.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getHocPython } from "../../../republic/hoc-python.js";
import {
  activatePlugin,
  deactivatePlugin,
  getPlugin,
  getPluginsDir,
  getPluginStatuses,
  rescanPlugins,
} from "../../../republic/hoc-plugin-manager.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const pluginHandlers: Partial<GatewayRequestHandlers> = {
  /**
   * List all loaded plugins with their manifest data and runtime status.
   */
  "republic.plugins.list": ({ respond }) => {
    const plugins = getPluginStatuses();
    const items = plugins.map((p) => ({
      id: p.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description ?? "",
      status: p.status,
      error: p.error ?? null,
      loadedAt: p.loadedAt,
      capabilities: p.manifest.capabilities ?? {},
      requirements: p.manifest.requirements ?? {},
      bootPriority: p.manifest.bootPriority ?? 50,
      sourceRepo: p.manifest.sourceRepo ?? null,
    }));
    respond(true, { ok: true, plugins: items, pluginsDir: getPluginsDir() }, undefined);
  },

  /**
   * Get detailed information about a specific plugin.
   */
  "republic.plugins.get": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "plugin id required"));
      return;
    }
    const plugin = getPlugin(p.id);
    if (!plugin) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `plugin ${p.id} not found`));
      return;
    }

    respond(
      true,
      {
        ok: true,
        plugin: {
          id: plugin.id,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          description: plugin.manifest.description ?? "",
          status: plugin.status,
          error: plugin.error ?? null,
          loadedAt: plugin.loadedAt,
          pluginDir: plugin.pluginDir,
          dataDir: plugin.dataDir,
          capabilities: plugin.manifest.capabilities ?? {},
          requirements: plugin.manifest.requirements ?? {},
          bootPriority: plugin.manifest.bootPriority ?? 50,
          sourceRepo: plugin.manifest.sourceRepo ?? null,
          lifecycle: plugin.manifest.lifecycle ?? {},
        },
      },
      undefined,
    );
  },

  /**
   * Plugin system diagnostics.
   */
  "republic.plugins.diagnostics": ({ respond }) => {
    const plugins = getPluginStatuses();
    const ready = plugins.filter((p) => p.status === "ready").length;
    const errored = plugins.filter((p) => p.status === "error").length;
    const stopped = plugins.filter((p) => p.status === "stopped").length;
    const discovered = plugins.filter((p) => p.status === "discovered").length;
    respond(
      true,
      {
        totalPlugins: plugins.length,
        ready,
        errored,
        stopped,
        discovered,
        pluginsDir: getPluginsDir(),
        pluginIds: plugins.map((p) => p.id),
      },
      undefined,
    );
  },

  /**
   * Activate (load + initialize) a single plugin on demand.
   */
  "republic.plugins.activate": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "plugin id required"));
      return;
    }
    const result = await activatePlugin(p.id);
    respond(true, result, undefined);
  },

  /**
   * Deactivate (shut down) a single plugin.
   */
  "republic.plugins.deactivate": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "plugin id required"));
      return;
    }
    const result = await deactivatePlugin(p.id);
    respond(true, result, undefined);
  },

  /**
   * Re-scan the plugins directory for newly added plugins.
   */
  "republic.plugins.scan": ({ respond }) => {
    const newCount = rescanPlugins();
    const plugins = getPluginStatuses();
    const items = plugins.map((p) => ({
      id: p.id,
      name: p.manifest.name,
      version: p.manifest.version,
      description: p.manifest.description ?? "",
      status: p.status,
      error: p.error ?? null,
      loadedAt: p.loadedAt,
      capabilities: p.manifest.capabilities ?? {},
      requirements: p.manifest.requirements ?? {},
      bootPriority: p.manifest.bootPriority ?? 50,
      sourceRepo: p.manifest.sourceRepo ?? null,
    }));
    respond(true, { ok: true, newCount, plugins: items, pluginsDir: getPluginsDir() }, undefined);
  },

  /**
   * Check system requirements for a specific plugin.
   * Returns readiness status for binaries, Python deps, GPU VRAM, etc.
   */
  "republic.plugins.check-requirements": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "plugin id required"));
      return;
    }
    const plugin = getPlugin(p.id);
    if (!plugin) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `plugin ${p.id} not found`));
      return;
    }

    const requirements = plugin.manifest.requirements ?? {};
    const backend = plugin.manifest.backend ?? {};
    const checks: {
      binaries: { name: string; available: boolean; path?: string }[];
      pythonDeps: { name: string; importable: boolean }[];
      gpuVram: { required: number; available: number; sufficient: boolean } | null;
      overallReady: boolean;
    } = {
      binaries: [],
      pythonDeps: [],
      gpuVram: null,
      overallReady: true,
    };

    // Check binaries (python3, ffmpeg, etc.)
    const binaries = (requirements as Record<string, unknown>).binaries as string[] | undefined;
    if (binaries?.length) {
      const { execSync } = await import("node:child_process");
      for (const bin of binaries) {
        try {
          const cmd = process.platform === "win32" ? `where ${bin}` : `which ${bin}`;
          const result = execSync(cmd, { encoding: "utf8", timeout: 5000 }).trim();
          checks.binaries.push({ name: bin, available: true, path: result.split("\n")[0] });
        } catch {
          checks.binaries.push({ name: bin, available: false });
          checks.overallReady = false;
        }
      }
    }

    // Check Python dependencies
    const deps = (backend as Record<string, unknown>).deps as string[] | undefined;
    if (deps?.length) {
      const { execSync } = await import("node:child_process");
      const pyBin = getHocPython();
      for (const dep of deps) {
        try {
          const safeModule = dep.replace(/[^a-zA-Z0-9_-]/g, "");
          execSync(`"${pyBin}" -c "import ${safeModule}"`, { encoding: "utf8", timeout: 10000 });
          checks.pythonDeps.push({ name: dep, importable: true });
        } catch {
          checks.pythonDeps.push({ name: dep, importable: false });
          checks.overallReady = false;
        }
      }
    }

    // Check GPU VRAM
    const gpuRequired = (requirements as Record<string, unknown>).gpu_vram_gb as number | undefined;
    if (gpuRequired) {
      // Try to detect GPU VRAM from nvidia-smi
      let availableGb = 0;
      try {
        const { execSync } = await import("node:child_process");
        const output = execSync(
          "nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits",
          { encoding: "utf8", timeout: 5000 },
        ).trim();
        const totalMb = parseInt(output.split("\n")[0], 10);
        if (!isNaN(totalMb)) {
          availableGb = Math.round((totalMb / 1024) * 10) / 10;
        }
      } catch {
        // No nvidia-smi — GPU not available
      }
      const sufficient = availableGb >= gpuRequired;
      checks.gpuVram = { required: gpuRequired, available: availableGb, sufficient };
      if (!sufficient) {
        checks.overallReady = false;
      }
    }

    respond(true, {
      ok: true,
      pluginId: p.id,
      requirements: {
        binaries: binaries ?? [],
        pythonDeps: deps ?? [],
        gpuVramGb: gpuRequired ?? null,
        backendType: (backend as Record<string, unknown>).type ?? null,
        sourceRepo: plugin.manifest.sourceRepo ?? null,
      },
      checks,
    }, undefined);
  },

  /**
   * Save plugin-specific configuration.
   */
  "republic.plugins.configure": async ({ params, respond }) => {
    const p = params as { id?: string; config?: Record<string, unknown> } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "plugin id required"));
      return;
    }
    const plugin = getPlugin(p.id);
    if (!plugin) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `plugin ${p.id} not found`));
      return;
    }

    // Write config to plugin data directory
    const fs = await import("node:fs");
    const path = await import("node:path");
    const configDir = plugin.dataDir ?? path.join(process.cwd(), "plugin-data", p.id);
    fs.mkdirSync(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.json");

    // Merge with existing config
    let existing: Record<string, unknown> = {};
    try {
      const raw = fs.readFileSync(configPath, "utf8");
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // No existing config
    }
    const merged = { ...existing, ...p.config };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));

    respond(true, { ok: true, pluginId: p.id, config: merged, configPath }, undefined);
  },
};
