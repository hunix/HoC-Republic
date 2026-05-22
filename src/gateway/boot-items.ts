/**
 * Boot Items Registry — all gateway startup items declared as data.
 *
 * Each item has explicit dependencies, tier classification, and optional
 * environment gates. The BootOrchestrator resolves these into a DAG and
 * executes them with maximum parallelism per level.
 *
 * Call `registerAllBootItems(orchestrator, ctx)` from server.impl.ts.
 */

import type { CliDeps } from "../cli/deps.js";
import type { loadConfig } from "../config/config.js";
import type { loadOpenClawPlugins } from "../plugins/loader.js";
import type { BootOrchestrator } from "./boot-orchestrator.js";
import { isTruthyEnvValue } from "../infra/env.js";

// ── Context passed from server.impl.ts ───────────────────────────

export interface BootContext {
  cfg: ReturnType<typeof loadConfig>;
  port: number;
  deps: CliDeps;
  pluginRegistry: ReturnType<typeof loadOpenClawPlugins>;
  defaultWorkspaceDir: string;
  startChannels: () => Promise<void>;
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  logHooks: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  logChannels: { info: (msg: string) => void; error: (msg: string) => void };
  logBrowser: { error: (msg: string) => void };
}

// ── Registration ─────────────────────────────────────────────────

export function registerAllBootItems(orc: BootOrchestrator, ctx: BootContext): void {
  // ═══════════════════════════════════════════════════════════════
  // LEVEL 0 — No dependencies (roots of the DAG)
  // ═══════════════════════════════════════════════════════════════

  orc.register({
    id: "workspace-restore",
    label: "Workspace Restore",
    tier: "core",
    deps: [],
    init: async () => {
      const { loadWorkspacesFromDisk } = await import("../republic/workspace-manager.js");
      await loadWorkspacesFromDisk();
    },
  });

  orc.register({
    id: "internal-hooks",
    label: "Internal Hooks",
    tier: "core",
    deps: [],
    init: async () => {
      const { clearInternalHooks } = await import("../hooks/internal-hooks.js");
      const { loadInternalHooks } = await import("../hooks/loader.js");
      clearInternalHooks();
      const count = await loadInternalHooks(ctx.cfg, ctx.defaultWorkspaceDir);
      if (count > 0) {
        ctx.logHooks.info(`loaded ${count} internal hook handler${count > 1 ? "s" : ""}`);
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 1 — Depends on workspace-restore
  // ═══════════════════════════════════════════════════════════════

  orc.register({
    id: "simulation",
    label: "Republic Simulation",
    tier: "core",
    deps: ["workspace-restore"],
    init: async () => {
      const { autoStartSimulation } = await import("../republic/state.js");
      await autoStartSimulation();
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 2 — Depends on simulation (handler enumeration)
  // ═══════════════════════════════════════════════════════════════

  orc.register({
    id: "handler-audit",
    label: "Handler Audit",
    tier: "core",
    deps: ["simulation"],
    init: async () => {
      const { coreGatewayHandlers, checkHandlerWhitelistDrift, loadLazyTopHandlers } =
        await import("./server-methods.js");
      const { loadAllRepublicHandlers } = await import("./server-methods/republic.js");
      const { registrySnapshot } = await import("./server-methods/handler-registry.js");

      await Promise.all([loadAllRepublicHandlers(), loadLazyTopHandlers()]);

      const registry = registrySnapshot();
      const totalHandlers = Object.keys(coreGatewayHandlers).length;
      const registeredDescriptors = registry.size;
      const unregistered = Object.keys(coreGatewayHandlers).filter((m) => !registry.has(m));

      ctx.log.info(
        `handlers=${totalHandlers} scoped=${registeredDescriptors} legacy=${unregistered.length}`,
      );
      if (unregistered.length > 0 && unregistered.length <= 20) {
        ctx.log.warn(`methods without scope: ${unregistered.join(", ")}`);
      }
      checkHandlerWhitelistDrift();
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 2 — Independent of simulation
  // ═══════════════════════════════════════════════════════════════

  orc.register({
    id: "channels",
    label: "Channels",
    tier: "core",
    deps: ["internal-hooks"],
    gate: () =>
      !isTruthyEnvValue(process.env.OPENCLAW_SKIP_CHANNELS) &&
      !isTruthyEnvValue(process.env.OPENCLAW_SKIP_PROVIDERS),
    init: async () => {
      await ctx.startChannels();
    },
  });

  orc.register({
    id: "plugin-services",
    label: "Plugin Services",
    tier: "core",
    deps: [],
    init: async () => {
      const { startPluginServices } = await import("../plugins/services.js");
      await startPluginServices({
        registry: ctx.pluginRegistry,
        config: ctx.cfg,
        workspaceDir: ctx.defaultWorkspaceDir,
      });
    },
  });

  orc.register({
    id: "supabase",
    label: "Supabase Persistence",
    tier: "core",
    deps: [],
    init: async () => {
      const { initSupabase, resolveSupabaseConfig } = await import("../infra/supabase-client.js");
      const sbConfig = resolveSupabaseConfig(
        ctx.cfg.gateway as Parameters<typeof resolveSupabaseConfig>[0],
      );
      const ok = await initSupabase(sbConfig);
      if (ok) {
        ctx.log.info("supabase: cloud persistence active");
      }
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 3 — Depends on simulation
  // ═══════════════════════════════════════════════════════════════

  orc.register({
    id: "hoc-plugins",
    label: "HoC Plugins",
    tier: "core",
    deps: ["simulation"],
    init: async () => {
      const { loadHoCPlugins } = await import("../republic/hoc-plugin-manager.js");
      const count = await loadHoCPlugins();
      if (count > 0) {
        ctx.log.info(`hoc-plugins: ${count} loaded`);
      }
    },
  });

  orc.register({
    id: "inference-gateway",
    label: "Inference Gateway",
    tier: "core",
    deps: ["simulation"],
    init: async () => {
      const { initInferenceGateway } = await import("../republic/inference-gateway.js");
      await initInferenceGateway();
    },
    shutdown: async () => {
      const { shutdownInferenceGateway } = await import("../republic/inference-gateway.js");
      await shutdownInferenceGateway();
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // LEVEL 4 — Depends on inference-gateway
  // ═══════════════════════════════════════════════════════════════

  orc.register({
    id: "cognitive-loops",
    label: "Citizen Cognitive Loops",
    tier: "enhance",
    deps: ["inference-gateway"],
    init: async () => {
      const { startCitizenCognitiveLoops } = await import("../republic/state.js");
      startCitizenCognitiveLoops();
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // ENHANCEMENT TIER — Parallel after core, mode-gated
  // ═══════════════════════════════════════════════════════════════

  orc.register({
    id: "shard-router",
    label: "Shard Router",
    tier: "optional",
    deps: ["handler-audit"],
    init: async () => {
      const { initShardRouter } = await import("../republic/federation/shard-router.js");
      initShardRouter({
        nodeId: `gateway-${Date.now()}`,
        shards: Array.from({ length: 256 }, (_, i) => i),
      });
    },
  });

  orc.register({
    id: "browser-control",
    label: "Browser Control",
    tier: "optional",
    deps: [],
    init: async () => {
      const { startBrowserControlServerIfEnabled } = await import("./server-browser.js");
      await startBrowserControlServerIfEnabled();
    },
  });

  orc.register({
    id: "gmail-watcher",
    label: "Gmail Watcher",
    tier: "optional",
    deps: ["internal-hooks"],
    gate: () => !isTruthyEnvValue(process.env.OPENCLAW_SKIP_GMAIL_WATCHER),
    init: async () => {
      const { startGmailWatcher } = await import("../hooks/gmail-watcher.js");
      const result = await startGmailWatcher(ctx.cfg);
      if (result.started) {
        ctx.logHooks.info("gmail watcher started");
      } else if (
        result.reason &&
        result.reason !== "hooks not enabled" &&
        result.reason !== "no gmail account configured"
      ) {
        ctx.logHooks.warn(`gmail watcher: ${result.reason}`);
      }
    },
  });

  orc.register({
    id: "gmail-model-validation",
    label: "Gmail Model Validation",
    tier: "optional",
    deps: ["gmail-watcher"],
    gate: () => Boolean(ctx.cfg.hooks?.gmail?.model),
    init: async () => {
      const { DEFAULT_MODEL, DEFAULT_PROVIDER } = await import("../agents/defaults.js");
      const { loadModelCatalog } = await import("../agents/model-catalog.js");
      const { getModelRefStatus, resolveConfiguredModelRef, resolveHooksGmailModel } =
        await import("../agents/model-selection.js");

      const ref = resolveHooksGmailModel({ cfg: ctx.cfg, defaultProvider: DEFAULT_PROVIDER });
      if (!ref) {
        return;
      }
      const { provider: defaultProvider, model: defaultModel } = resolveConfiguredModelRef({
        cfg: ctx.cfg,
        defaultProvider: DEFAULT_PROVIDER,
        defaultModel: DEFAULT_MODEL,
      });
      const catalog = await loadModelCatalog({ config: ctx.cfg });
      const status = getModelRefStatus({
        cfg: ctx.cfg,
        catalog,
        ref,
        defaultProvider,
        defaultModel,
      });
      if (!status.allowed) {
        ctx.logHooks.warn(`hooks.gmail.model "${status.key}" not in allowlist`);
      }
      if (!status.inCatalog) {
        ctx.logHooks.warn(`hooks.gmail.model "${status.key}" not in catalog`);
      }
    },
  });

  orc.register({
    id: "supabase-connector",
    label: "Supabase Realtime Connector",
    tier: "optional",
    deps: [],
    gate: () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY),
    init: async () => {
      const { startSupabaseConnector } = await import("../supabase/index.js");
      await startSupabaseConnector({
        supabaseUrl: process.env.SUPABASE_URL!,
        supabaseKey: process.env.SUPABASE_SERVICE_KEY!,
        instanceId: process.env.HOC_INSTANCE_ID,
        registerSecret: process.env.HOC_REGISTER_SECRET,
        instanceName:
          process.env.HOC_INSTANCE_NAME ?? `hoc-gateway-${process.env.COMPUTERNAME ?? "node"}`,
        log: (level, msg) => {
          if (level === "error" || level === "warn") {
            ctx.log.warn(`[supabase] ${msg}`);
          }
        },
      });
    },
  });

  orc.register({
    id: "n8n-bridge",
    label: "n8n Workflow Bridge",
    tier: "optional",
    deps: [],
    gate: () => Boolean(process.env.N8N_API_URL),
    init: async () => {
      const { getN8nBridge } = await import("../republic/n8n-bridge.js");
      const bridge = getN8nBridge();
      void (bridge as unknown as { probe: () => Promise<void> }).probe();
    },
  });

  orc.register({
    id: "mission-control",
    label: "Mission Control",
    tier: "optional",
    deps: ["channels"],
    gate: () => Boolean(ctx.cfg.gateway?.missionControl?.enabled),
    init: async () => {
      const { startMissionControl } = await import("./mission-control-lifecycle.js");
      const { writeConfigFile } = await import("../config/config.js");
      const mcConfig = ctx.cfg.gateway!.missionControl!;
      await startMissionControl({
        cfg: ctx.cfg,
        mcConfig,
        gatewayPort: ctx.cfg.gateway?.port ?? 18789,
        defaultWorkspaceDir: ctx.defaultWorkspaceDir,
        persistAuthToken: async (token: string) => {
          const updated = { ...ctx.cfg };
          updated.gateway = { ...updated.gateway, auth: { ...updated.gateway?.auth, token } };
          await writeConfigFile(updated);
        },
        log: {
          info: (msg) => ctx.log.info(msg),
          warn: (msg) => ctx.log.warn(msg),
          error: (msg) => ctx.log.error(msg),
        },
      });
    },
  });

  orc.register({
    id: "startup-hook",
    label: "Startup Hook",
    tier: "optional",
    deps: ["channels", "internal-hooks"],
    gate: () => Boolean(ctx.cfg.hooks?.internal?.enabled),
    init: async () => {
      const { createInternalHookEvent, triggerInternalHook } =
        await import("../hooks/internal-hooks.js");
      const hookEvent = createInternalHookEvent("gateway", "startup", "gateway:startup", {
        cfg: ctx.cfg,
        deps: ctx.deps,
        workspaceDir: ctx.defaultWorkspaceDir,
      });
      void triggerInternalHook(hookEvent);
    },
  });

  orc.register({
    id: "restart-sentinel",
    label: "Restart Sentinel",
    tier: "optional",
    deps: [],
    init: async () => {
      const { shouldWakeFromRestartSentinel, scheduleRestartSentinelWake } =
        await import("./server-restart-sentinel.js");
      if (shouldWakeFromRestartSentinel()) {
        void scheduleRestartSentinelWake({ deps: ctx.deps });
      }
    },
  });
}
