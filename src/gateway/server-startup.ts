import type { CliDeps } from "../cli/deps.js";
import type { loadConfig } from "../config/config.js";
import type { loadOpenClawPlugins } from "../plugins/loader.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import {
  getModelRefStatus,
  resolveConfiguredModelRef,
  resolveHooksGmailModel,
} from "../agents/model-selection.js";
import { writeConfigFile } from "../config/config.js";
import { startGmailWatcher } from "../hooks/gmail-watcher.js";
import {
  clearInternalHooks,
  createInternalHookEvent,
  triggerInternalHook,
} from "../hooks/internal-hooks.js";
import { loadInternalHooks } from "../hooks/loader.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { startPluginServices, type PluginServicesHandle } from "../plugins/services.js";
// n8n bridge is dynamically imported below, only if N8N_API_URL is set.
// Phase 27 fix: autoStartSimulation is called explicitly here in the boot
// sequence, NOT at module import time in the handler barrel (republic.ts).
import { autoStartSimulation } from "../republic/state.js";
import { loadWorkspacesFromDisk } from "../republic/workspace-manager.js";
import { startMissionControl, type MissionControlHandle } from "./mission-control-lifecycle.js";
import { startBrowserControlServerIfEnabled } from "./server-browser.js";
import {
  scheduleRestartSentinelWake,
  shouldWakeFromRestartSentinel,
} from "./server-restart-sentinel.js";
export let _gatewayKeepalive: ReturnType<typeof setInterval> | null = null;

export async function startGatewaySidecars(params: {
  cfg: ReturnType<typeof loadConfig>;
  pluginRegistry: ReturnType<typeof loadOpenClawPlugins>;
  defaultWorkspaceDir: string;
  deps: CliDeps;
  startChannels: () => Promise<void>;
  log: { warn: (msg: string) => void };
  logHooks: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };
  logChannels: { info: (msg: string) => void; error: (msg: string) => void };
  logBrowser: { error: (msg: string) => void };
}) {
  const _bootDiag = isTruthyEnvValue(process.env.OPENCLAW_BOOT_DIAG);
  const agentMode = isTruthyEnvValue(process.env.HOC_AGENT_MODE);
  // ── Keepalive interval — prevents event loop drain ───────────────────────
  // The codebase has 30+ timers that call .unref(), which can collectively
  // drain the event loop and cause the process to exit silently with code 0.
  // This single ref'd interval keeps the process alive indefinitely.
  if (!_gatewayKeepalive) {
    _gatewayKeepalive = setInterval(() => {
      // no-op: sole purpose is to keep the event loop alive
    }, 30_000);
    // Explicitly do NOT unref — this is the safety net.
  }

  // ── Restore workspace manifests from disk ─────────────────────────────────
  try {
    await loadWorkspacesFromDisk();
  } catch {
    /* non-critical — fresh state if disk load fails */
  }

  // ── Boot the Republic simulation loop ─────────────────────────────────────
  // Deferred to post-bind: the simulation tick loop and its 70+ handler
  // registrations don't need to block the HTTP server from accepting
  // connections. The health check below awaits this before running its audit.
  // In agent mode, we skip the entire Republic simulation for faster boot.
  const simulationReady = agentMode
    ? Promise.resolve()
    : autoStartSimulation().catch((err) => {
        params.log.warn(`[republic] autoStartSimulation failed: ${String(err)}`);
      });
  if (agentMode) {
    console.info("[agent-mode] Republic simulation skipped");
  }

  // ── Phase 5.3: Gateway startup health self-check ──────────────────────────
  // In agent mode, skip the full Republic handler audit and shard router —
  // they're heavyweight and not needed for the chat-only experience.
  if (!agentMode) {
    // Logs a structured summary for every boot so misconfigured scopes or missing
    // handler descriptors are caught early and surfaced in the launch log.
    try {
      const { coreGatewayHandlers, checkHandlerWhitelistDrift, loadLazyTopHandlers } =
        await import("./server-methods.js");
      const { loadAllRepublicHandlers } = await import("./server-methods/republic.js");
      const { registrySnapshot } = await import("./server-methods/handler-registry.js");
      const { initShardRouter } = await import("../republic/federation/shard-router.js");

      // Wait for the simulation to finish starting before enumerating handlers.
      await simulationReady;

      // Eagerly load all lazy handlers for health check enumeration.
      await Promise.all([loadAllRepublicHandlers(), loadLazyTopHandlers()]);

      const registry = registrySnapshot();
      const totalHandlers = Object.keys(coreGatewayHandlers).length;
      const registeredDescriptors = registry.size;
      const unregistered = Object.keys(coreGatewayHandlers).filter((m) => !registry.has(m));

      params.log.warn(
        `[gateway:startup] handlers=${totalHandlers} descriptor-scoped=${registeredDescriptors} legacy-fallback=${unregistered.length}`,
      );

      if (unregistered.length > 0 && unregistered.length <= 20) {
        params.log.warn(
          `[gateway:startup] methods without scope descriptor: ${unregistered.join(", ")}`,
        );
      }
      checkHandlerWhitelistDrift();

      setImmediate(() => {
        try {
          initShardRouter({
            nodeId: `gateway-${Date.now()}`,
            shards: Array.from({ length: 256 }, (_, i) => i),
          });
          console.info("[gateway:startup] ✅ ShardRouter initialized (single-node, 256 shards)");
        } catch (shardErr) {
          params.log.warn(`[gateway:startup] ShardRouter init skipped: ${String(shardErr)}`);
        }
      });
    } catch {
      /* non-critical — startup summary is best-effort */
    }
  } else {
    // Agent mode: wait for (no-op) simulation ready, no handler audit needed.
    await simulationReady;
    console.info("[agent-mode] Handler audit and shard router skipped");
  }

  // ── Phase 6: Supabase Command Center Connector ────────────────────────────
  // Skipped in agent mode — the connector is for Republic-level orchestration.
  if (!agentMode) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && supabaseKey) {
      setImmediate(async () => {
        try {
          const { startSupabaseConnector } = await import("../supabase/index.js");
          await startSupabaseConnector({
            supabaseUrl,
            supabaseKey,
            instanceId: process.env.HOC_INSTANCE_ID,
            registerSecret: process.env.HOC_REGISTER_SECRET,
            instanceName:
              process.env.HOC_INSTANCE_NAME ?? `hoc-gateway-${process.env.COMPUTERNAME ?? "node"}`,
            log: (level, msg) => {
              if (level === "error") {
                params.log.warn(`[supabase] ${msg}`);
              } else if (level === "warn") {
                params.log.warn(`[supabase] ${msg}`);
              } else {
                console.log(`[supabase] ${msg}`);
              }
            },
          });
        } catch (err) {
          params.log.warn(`[gateway:startup] Supabase connector failed: ${String(err)}`);
        }
      });
    } else {
      console.info(
        "[gateway:startup] Supabase connector skipped (SUPABASE_URL / SUPABASE_SERVICE_KEY not set)",
      );
    }
  } else {
    console.info("[agent-mode] Supabase connector skipped");
  }

  // Start OpenClaw browser control server — deferred to avoid blocking boot.
  // Browser automation is rarely used immediately after startup.
  let browserControl: Awaited<ReturnType<typeof startBrowserControlServerIfEnabled>> = null;
  if (_bootDiag) {
    process.stdout.write(`[diag] step: deferring browser control start\n`);
  }
  setImmediate(async () => {
    try {
      browserControl = await startBrowserControlServerIfEnabled();
    } catch (err) {
      params.logBrowser.error(`server failed to start: ${String(err)}`);
    }
    if (_bootDiag) {
      process.stdout.write("[diag] step: past browser control\n");
    }
  });

  // Start Gmail watcher if configured — deferred to avoid blocking boot.
  // Most dev boots never use email; production boots get it within one tick.
  if (!isTruthyEnvValue(process.env.OPENCLAW_SKIP_GMAIL_WATCHER)) {
    setImmediate(async () => {
      try {
        const gmailResult = await startGmailWatcher(params.cfg);
        if (gmailResult.started) {
          params.logHooks.info("gmail watcher started");
        } else if (
          gmailResult.reason &&
          gmailResult.reason !== "hooks not enabled" &&
          gmailResult.reason !== "no gmail account configured"
        ) {
          params.logHooks.warn(`gmail watcher not started: ${gmailResult.reason}`);
        }
      } catch (err) {
        params.logHooks.error(`gmail watcher failed to start: ${String(err)}`);
      }
    });
  }

  // Validate hooks.gmail.model — deferred, non-critical.
  if (params.cfg.hooks?.gmail?.model) {
    setImmediate(async () => {
      const hooksModelRef = resolveHooksGmailModel({
        cfg: params.cfg,
        defaultProvider: DEFAULT_PROVIDER,
      });
      if (hooksModelRef) {
        const { provider: defaultProvider, model: defaultModel } = resolveConfiguredModelRef({
          cfg: params.cfg,
          defaultProvider: DEFAULT_PROVIDER,
          defaultModel: DEFAULT_MODEL,
        });
        const catalog = await loadModelCatalog({ config: params.cfg });
        const status = getModelRefStatus({
          cfg: params.cfg,
          catalog,
          ref: hooksModelRef,
          defaultProvider,
          defaultModel,
        });
        if (!status.allowed) {
          params.logHooks.warn(
            `hooks.gmail.model "${status.key}" not in agents.defaults.models allowlist (will use primary instead)`,
          );
        }
        if (!status.inCatalog) {
          params.logHooks.warn(
            `hooks.gmail.model "${status.key}" not in the model catalog (may fail at runtime)`,
          );
        }
      }
    });
  }

  // Load internal hook handlers from configuration and directory discovery.
  try {
    // Clear any previously registered hooks to ensure fresh loading
    clearInternalHooks();
    const loadedCount = await loadInternalHooks(params.cfg, params.defaultWorkspaceDir);
    if (loadedCount > 0) {
      params.logHooks.info(
        `loaded ${loadedCount} internal hook handler${loadedCount > 1 ? "s" : ""}`,
      );
    }
  } catch (err) {
    params.logHooks.error(`failed to load hooks: ${String(err)}`);
  }
  if (_bootDiag) {
    process.stdout.write("[diag] step: past internal hooks\n");
  }

  // Launch configured channels so gateway replies via the surface the message came from.
  // Tests can opt out via OPENCLAW_SKIP_CHANNELS (or legacy OPENCLAW_SKIP_PROVIDERS).
  const skipChannels =
    isTruthyEnvValue(process.env.OPENCLAW_SKIP_CHANNELS) ||
    isTruthyEnvValue(process.env.OPENCLAW_SKIP_PROVIDERS);
  if (_bootDiag) {
    process.stdout.write(`[diag] step: startChannels (skip=${String(skipChannels)})\n`);
  }

  if (!skipChannels) {
    try {
      await params.startChannels();
    } catch (err) {
      params.logChannels.error(`channel startup failed: ${String(err)}`);
    }
  } else {
    params.logChannels.info(
      "skipping channel start (OPENCLAW_SKIP_CHANNELS=1 or OPENCLAW_SKIP_PROVIDERS=1)",
    );
  }
  if (_bootDiag) {
    process.stdout.write("[diag] step: past startChannels\n");
  }

  if (params.cfg.hooks?.internal?.enabled) {
    // Fire the startup hook after the current tick completes (channels are ready).
    // No arbitrary delay — setImmediate defers past the current synchronous block.
    setImmediate(() => {
      const hookEvent = createInternalHookEvent("gateway", "startup", "gateway:startup", {
        cfg: params.cfg,
        deps: params.deps,
        workspaceDir: params.defaultWorkspaceDir,
      });
      void triggerInternalHook(hookEvent);
    });
  }

  let pluginServices: PluginServicesHandle | null = null;
  if (_bootDiag) {
    process.stdout.write("[diag] step: startPluginServices\n");
  }
  try {
    pluginServices = await startPluginServices({
      registry: params.pluginRegistry,
      config: params.cfg,
      workspaceDir: params.defaultWorkspaceDir,
    });
  } catch (err) {
    params.log.warn(`plugin services failed to start: ${String(err)}`);
  }
  if (_bootDiag) {
    process.stdout.write("[diag] step: past startPluginServices\n");
  }

  if (shouldWakeFromRestartSentinel()) {
    // Schedule restart sentinel wake after the current tick — no arbitrary delay.
    setImmediate(() => {
      void scheduleRestartSentinelWake({ deps: params.deps });
    });
  }

  // Initialize the n8n workflow automation bridge.
  // Skipped in agent mode — n8n is for Republic-level orchestration.
  let n8nBridge: unknown = null;
  if (!agentMode && process.env.N8N_API_URL) {
    try {
      const { getN8nBridge } = await import("../republic/n8n-bridge.js");
      n8nBridge = getN8nBridge();
      void (n8nBridge as { probe: () => Promise<void> }).probe();
    } catch (err) {
      params.log.warn(`n8n bridge failed to initialize: ${String(err)}`);
    }
  }

  // ── Mission Control lifecycle ─────────────────────────────────────
  // Skipped in agent mode — MC is for Republic-level orchestration.
  let missionControl: MissionControlHandle | null = null;
  if (!agentMode) {
    const mcConfig = params.cfg.gateway?.missionControl;
    if (mcConfig?.enabled) {
      try {
        missionControl = await startMissionControl({
          cfg: params.cfg,
          mcConfig,
          gatewayPort: params.cfg.gateway?.port ?? 18789,
          defaultWorkspaceDir: params.defaultWorkspaceDir,
          persistAuthToken: async (token: string) => {
            const updatedCfg = { ...params.cfg };
            updatedCfg.gateway = {
              ...updatedCfg.gateway,
              auth: { ...updatedCfg.gateway?.auth, token },
            };
            await writeConfigFile(updatedCfg);
          },
          log: {
            info: (msg) => params.log.warn(msg),
            warn: (msg) => params.log.warn(msg),
            error: (msg) => params.log.warn(msg),
          },
        });
      } catch (err) {
        params.log.warn(`mission-control: failed to start: ${String(err)}`);
      }
    }
  }

  if (_bootDiag) {
    process.stdout.write("[diag] step: returning from startGatewaySidecars\n");
  }
  return { browserControl, pluginServices, n8nBridge, missionControl };
}
