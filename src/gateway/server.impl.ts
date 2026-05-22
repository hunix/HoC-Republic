import path from "node:path";
import type { CanvasHostServer } from "../canvas-host/server.js";
import type { PluginServicesHandle } from "../plugins/services.js";
import type { RuntimeEnv } from "../runtime.js";
import type { ControlUiRootState } from "./control-ui.js";
import type { startBrowserControlServerIfEnabled } from "./server-browser.js";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { registerSkillsChangeListener } from "../agents/skills/refresh.js";
import { initSubagentRegistry } from "../agents/subagent-registry.js";
import { listChannelPlugins, type ChannelId } from "../channels/plugins/index.js";
import { formatCliCommand } from "../cli/command-format.js";
import { createDefaultDeps } from "../cli/deps.js";
import {
  CONFIG_PATH,
  isNixMode,
  loadConfig,
  migrateLegacyConfig,
  readConfigFileSnapshot,
  writeConfigFile,
} from "../config/config.js";
import { applyPluginAutoEnable } from "../config/plugin-auto-enable.js";
import { clearAgentRunContext, onAgentEvent } from "../infra/agent-events.js";
import { CapabilityGraph } from "../infra/capability-graph.js";
import {
  ensureControlUiAssetsBuilt,
  resolveControlUiRootOverrideSync,
  resolveControlUiRootSync,
} from "../infra/control-ui-assets.js";
import { isDiagnosticsEnabled } from "../infra/diagnostic-events.js";
import { isTruthyEnvValue, logAcceptedEnvOption } from "../infra/env.js";
import { createExecApprovalForwarder } from "../infra/exec-approval-forwarder.js";
import { onHeartbeatEvent } from "../infra/heartbeat-events.js";
import { startHeartbeatRunner } from "../infra/heartbeat-runner.js";
import { getMachineDisplayName } from "../infra/machine-name.js";
import { ensureOpenClawCliOnPath } from "../infra/path-env.js";
import { setGatewaySigusr1RestartPolicy } from "../infra/restart.js";
import {
  primeRemoteSkillsCache,
  refreshRemoteBinsForConnectedNodes,
  setSkillsRemoteRegistry,
} from "../infra/skills-remote.js";
import { shutdownSupabase } from "../infra/supabase-client.js";
import { scheduleGatewayUpdateCheck } from "../infra/update-startup.js";
import { startDiagnosticHeartbeat, stopDiagnosticHeartbeat } from "../logging/diagnostic.js";
import { createSubsystemLogger, runtimeForLogger } from "../logging/subsystem.js";
import { gracefulShutdown as republicShutdown } from "../republic/state.js";
import { runOnboardingWizard } from "../wizard/onboarding.js";
import { registerAllBootItems, type BootContext } from "./boot-items.js";
import { getBootOrchestrator } from "./boot-orchestrator.js";
import { startGatewayConfigReloader } from "./config-reload.js";
import { ExecApprovalManager } from "./exec-approval-manager.js";
import { NodeRegistry } from "./node-registry.js";
import { createChannelManager } from "./server-channels.js";
import { createAgentEventHandler } from "./server-chat.js";
import { createGatewayCloseHandler } from "./server-close.js";
import {
  initializeClusterServices,
  shutdownClusterServices,
  type ClusterServices,
} from "./server-cluster.js";
import { buildGatewayCronService } from "./server-cron.js";
import { startGatewayDiscovery } from "./server-discovery-runtime.js";
import { applyGatewayLaneConcurrency } from "./server-lanes.js";
import { startGatewayMaintenanceTimers } from "./server-maintenance.js";
import { GATEWAY_EVENTS, listGatewayMethods } from "./server-methods-list.js";
import { coreGatewayHandlers } from "./server-methods.js";
import { createExecApprovalHandlers } from "./server-methods/exec-approval.js";
import { modelsManagerHandlers } from "./server-methods/models-manager.js";
import { safeParseJson } from "./server-methods/nodes.helpers.js";
import { hasConnectedMobileNode } from "./server-mobile-nodes.js";
import { loadGatewayModelCatalog } from "./server-model-catalog.js";
import { createNodeSubscriptionManager } from "./server-node-subscriptions.js";
import { loadGatewayPlugins } from "./server-plugins.js";
import { createGatewayReloadHandlers } from "./server-reload-handlers.js";
import { resolveGatewayRuntimeConfig } from "./server-runtime-config.js";
import { createGatewayRuntimeState } from "./server-runtime-state.js";
import { resolveSessionKeyForRun } from "./server-session-key.js";
import { logGatewayStartup } from "./server-startup-log.js";
import { startGatewaySidecars, _gatewayKeepalive as _existingKeepalive } from "./server-startup.js";
import { startGatewayTailscaleExposure } from "./server-tailscale.js";
import { createWizardSessionTracker } from "./server-wizard-sessions.js";
import { attachGatewayWsHandlers } from "./server-ws-runtime.js";
import {
  getHealthCache,
  getHealthVersion,
  getPresenceVersion,
  incrementPresenceVersion,
  refreshGatewayHealthSnapshot,
} from "./server/health-state.js";
import { loadGatewayTlsRuntime } from "./server/tls.js";

export { __resetModelCatalogCacheForTest } from "./server-model-catalog.js";

ensureOpenClawCliOnPath();

const _bootDiag = isTruthyEnvValue(process.env.OPENCLAW_BOOT_DIAG);

const log = createSubsystemLogger("gateway");
const logCanvas = log.child("canvas");
const logDiscovery = log.child("discovery");
const logTailscale = log.child("tailscale");
const logChannels = log.child("channels");
const logBrowser = log.child("browser");
const logHealth = log.child("health");
const logCron = log.child("cron");
const logReload = log.child("reload");
const logHooks = log.child("hooks");
const logPlugins = log.child("plugins");
const logWsControl = log.child("ws");
const gatewayRuntime = runtimeForLogger(log);
const canvasRuntime = runtimeForLogger(logCanvas);

export type GatewayServer = {
  close: (opts?: { reason?: string; restartExpectedMs?: number | null }) => Promise<void>;
};

export type GatewayServerOptions = {
  /**
   * Bind address policy for the Gateway WebSocket/HTTP server.
   * - loopback: 127.0.0.1
   * - lan: 0.0.0.0
   * - tailnet: bind only to the Tailscale IPv4 address (100.64.0.0/10)
   * - auto: prefer loopback, else LAN
   */
  bind?: import("../config/config.js").GatewayBindMode;
  /**
   * Advanced override for the bind host, bypassing bind resolution.
   * Prefer `bind` unless you really need a specific address.
   */
  host?: string;
  /**
   * If false, do not serve the browser Control UI.
   * Default: config `gateway.controlUi.enabled` (or true when absent).
   */
  controlUiEnabled?: boolean;
  /**
   * If false, do not serve `POST /v1/chat/completions`.
   * Default: config `gateway.http.endpoints.chatCompletions.enabled` (or false when absent).
   */
  openAiChatCompletionsEnabled?: boolean;
  /**
   * If false, do not serve `POST /v1/responses` (OpenResponses API).
   * Default: config `gateway.http.endpoints.responses.enabled` (or false when absent).
   */
  openResponsesEnabled?: boolean;
  /**
   * Override gateway auth configuration (merges with config).
   */
  auth?: import("../config/config.js").GatewayAuthConfig;
  /**
   * Override gateway Tailscale exposure configuration (merges with config).
   */
  tailscale?: import("../config/config.js").GatewayTailscaleConfig;
  /**
   * Test-only: allow canvas host startup even when NODE_ENV/VITEST would disable it.
   */
  allowCanvasHostInTests?: boolean;
  /**
   * Test-only: override the onboarding wizard runner.
   */
  wizardRunner?: (
    opts: import("../commands/onboard-types.js").OnboardOptions,
    runtime: import("../runtime.js").RuntimeEnv,
    prompter: import("../wizard/prompts.js").WizardPrompter,
  ) => Promise<void>;
};

export async function startGatewayServer(
  port = 18789,
  opts: GatewayServerOptions = {},
): Promise<GatewayServer> {
  // Ensure all default port derivations (browser/canvas) see the actual runtime port.
  process.env.OPENCLAW_GATEWAY_PORT = String(port);
  logAcceptedEnvOption({
    key: "OPENCLAW_RAW_STREAM",
    description: "raw stream logging enabled",
  });
  logAcceptedEnvOption({
    key: "OPENCLAW_RAW_STREAM_PATH",
    description: "raw stream log path override",
  });

  let configSnapshot = await readConfigFileSnapshot();
  if (configSnapshot.legacyIssues.length > 0) {
    if (isNixMode) {
      throw new Error(
        "Legacy config entries detected while running in Nix mode. Update your Nix config to the latest schema and restart.",
      );
    }
    const { config: migrated, changes } = migrateLegacyConfig(configSnapshot.parsed);
    if (!migrated) {
      throw new Error(
        `Legacy config entries detected but auto-migration failed. Run "${formatCliCommand("openclaw doctor")}" to migrate.`,
      );
    }
    await writeConfigFile(migrated);
    if (changes.length > 0) {
      log.info(
        `gateway: migrated legacy config entries:\n${changes
          .map((entry) => `- ${entry}`)
          .join("\n")}`,
      );
    }
  }

  configSnapshot = await readConfigFileSnapshot();
  if (configSnapshot.exists && !configSnapshot.valid) {
    const issues =
      configSnapshot.issues.length > 0
        ? configSnapshot.issues
            .map((issue) => `${issue.path || "<root>"}: ${issue.message}`)
            .join("\n")
        : "Unknown validation issue.";
    throw new Error(
      `Invalid config at ${configSnapshot.path}.\n${issues}\nRun "${formatCliCommand("openclaw doctor")}" to repair, then retry.`,
    );
  }

  const autoEnable = applyPluginAutoEnable({ config: configSnapshot.config, env: process.env });
  if (autoEnable.changes.length > 0) {
    try {
      await writeConfigFile(autoEnable.config);
      log.info(
        `gateway: auto-enabled plugins:\n${autoEnable.changes
          .map((entry) => `- ${entry}`)
          .join("\n")}`,
      );
    } catch (err) {
      log.warn(`gateway: failed to persist plugin auto-enable changes: ${String(err)}`);
    }
  }

  const cfgAtStart = loadConfig();
  const diagnosticsEnabled = isDiagnosticsEnabled(cfgAtStart);
  if (diagnosticsEnabled) {
    startDiagnosticHeartbeat();
  }
  setGatewaySigusr1RestartPolicy({ allowExternal: cfgAtStart.commands?.restart === true });
  initSubagentRegistry();
  const defaultAgentId = resolveDefaultAgentId(cfgAtStart);
  const defaultWorkspaceDir = resolveAgentWorkspaceDir(cfgAtStart, defaultAgentId);
  const baseMethods = listGatewayMethods();
  const { pluginRegistry, gatewayMethods: baseGatewayMethods } = loadGatewayPlugins({
    cfg: cfgAtStart,
    workspaceDir: defaultWorkspaceDir,
    log,
    coreGatewayHandlers,
    baseMethods,
  });
  const channelLogs = Object.fromEntries(
    listChannelPlugins().map((plugin) => [plugin.id, logChannels.child(plugin.id)]),
  ) as Record<ChannelId, ReturnType<typeof createSubsystemLogger>>;
  const channelRuntimeEnvs = Object.fromEntries(
    Object.entries(channelLogs).map(([id, logger]) => [id, runtimeForLogger(logger)]),
  ) as Record<ChannelId, RuntimeEnv>;
  const channelMethods = listChannelPlugins().flatMap((plugin) => plugin.gatewayMethods ?? []);
  const gatewayMethods = Array.from(new Set([...baseGatewayMethods, ...channelMethods]));

  // -- Capability Graph Integration --
  const capabilityGraph = new CapabilityGraph();
  capabilityGraph.ingestPlugins(pluginRegistry);
  log.info(`gateway: capability graph initialized with ${capabilityGraph.nodes.size} nodes.`);

  // Register Windows Companion gateway methods — deferred to avoid blocking boot.
  // QuantumIntelligence discovers these lazily; no consumer needs them synchronously.
  setImmediate(async () => {
    try {
      const { windowsControlHandlers } = await import("./server-methods/windows-control.js");
      const { getWindowsCapabilities } = await import("./windows-capabilities.js");
      const capDescriptions = Object.fromEntries(
        getWindowsCapabilities().capabilities.map((c) => [c.method, c.description]),
      );
      capabilityGraph.ingestGatewayMethods(Object.keys(windowsControlHandlers), capDescriptions);
    } catch (err) {
      log.warn(`gateway: deferred windows capability registration failed: ${String(err)}`);
    }
  });

  // -- Quantum Intelligence --
  // Deferred initialization: MemorySystem and QuantumGatewayBridge pull in
  // the ~1.5 MB intelligence module tree. They're created lazily on first
  // agent event or chat request that needs them.
  //
  // Thread-safe: concurrent callers coalesce onto a single init cycle.
  // No hardcoded timeouts — init completes when the modules are loaded.
  let _quantumBridgePromise: Promise<
    import("../intelligence/quantum-gateway-bridge.js").QuantumGatewayBridge
  > | null = null;
  let _quantumBridge:
    | import("../intelligence/quantum-gateway-bridge.js").QuantumGatewayBridge
    | null = null;

  const getQuantumBridge = (): Promise<
    import("../intelligence/quantum-gateway-bridge.js").QuantumGatewayBridge
  > => {
    if (_quantumBridgePromise) {
      return _quantumBridgePromise;
    }

    _quantumBridgePromise = (async () => {
      const [{ MemorySystem }, { QuantumGatewayBridge }] = await Promise.all([
        import("../intelligence/memory-system.js"),
        import("../intelligence/quantum-gateway-bridge.js"),
      ]);
      const memorySystem = new MemorySystem();
      memorySystem.initialize().catch((err) => {
        log.warn(`gateway: failed to initialize memory system: ${err}`);
      });
      _quantumBridge = new QuantumGatewayBridge(memorySystem, capabilityGraph);
      return _quantumBridge;
    })();

    return _quantumBridgePromise;
  };

  // Quantum Intelligence is fully lazy — getQuantumBridge() is called
  // on-demand by the first agent event or chat request. No pre-warm
  // needed: saves ~300ms + ~20MB RAM on every cold boot.
  // ----------------------------------

  let pluginServices: PluginServicesHandle | null = null;
  const runtimeConfig = await resolveGatewayRuntimeConfig({
    cfg: cfgAtStart,
    port,
    bind: opts.bind,
    host: opts.host,
    controlUiEnabled: opts.controlUiEnabled,
    openAiChatCompletionsEnabled: opts.openAiChatCompletionsEnabled,
    openResponsesEnabled: opts.openResponsesEnabled,
    auth: opts.auth,
    tailscale: opts.tailscale,
  });
  const {
    bindHost,
    controlUiEnabled,
    openAiChatCompletionsEnabled,
    openResponsesEnabled,
    openResponsesConfig,
    controlUiBasePath,
    controlUiRoot: controlUiRootOverride,
    resolvedAuth,
    tailscaleConfig,
    tailscaleMode,
  } = runtimeConfig;
  let hooksConfig = runtimeConfig.hooksConfig;
  const canvasHostEnabled = runtimeConfig.canvasHostEnabled;

  let controlUiRootState: ControlUiRootState | undefined;
  if (controlUiRootOverride) {
    const resolvedOverride = resolveControlUiRootOverrideSync(controlUiRootOverride);
    const resolvedOverridePath = path.resolve(controlUiRootOverride);
    controlUiRootState = resolvedOverride
      ? { kind: "resolved", path: resolvedOverride }
      : { kind: "invalid", path: resolvedOverridePath };
    if (!resolvedOverride) {
      log.warn(`gateway: controlUi.root not found at ${resolvedOverridePath}`);
    }
  } else if (controlUiEnabled) {
    let resolvedRoot = resolveControlUiRootSync({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
      cwd: process.cwd(),
    });
    if (!resolvedRoot) {
      const ensureResult = await ensureControlUiAssetsBuilt(gatewayRuntime);
      if (!ensureResult.ok && ensureResult.message) {
        log.warn(`gateway: ${ensureResult.message}`);
      }
      resolvedRoot = resolveControlUiRootSync({
        moduleUrl: import.meta.url,
        argv1: process.argv[1],
        cwd: process.cwd(),
      });
    }
    controlUiRootState = resolvedRoot
      ? { kind: "resolved", path: resolvedRoot }
      : { kind: "missing" };
  }

  const wizardRunner = opts.wizardRunner ?? runOnboardingWizard;
  const { wizardSessions, findRunningWizard, purgeWizardSession } = createWizardSessionTracker();

  const deps = createDefaultDeps();
  let canvasHostServer: CanvasHostServer | null = null;
  const gatewayTls = await loadGatewayTlsRuntime(cfgAtStart.gateway?.tls, log.child("tls"));
  if (cfgAtStart.gateway?.tls?.enabled && !gatewayTls.enabled) {
    throw new Error(gatewayTls.error ?? "gateway tls: failed to enable");
  }
  const {
    canvasHost,
    httpServer,
    httpServers,
    httpBindHosts,
    wss,
    clients,
    broadcast,
    broadcastToConnIds,
    agentRunSeq,
    dedupe,
    chatRunState,
    chatRunBuffers,
    chatDeltaSentAt,
    addChatRun,
    removeChatRun,
    chatAbortControllers,
    toolEventRecipients,
  } = await createGatewayRuntimeState({
    cfg: cfgAtStart,
    bindHost,
    port,
    controlUiEnabled,
    controlUiBasePath,
    controlUiRoot: controlUiRootState,
    openAiChatCompletionsEnabled,
    openResponsesEnabled,
    openResponsesConfig,
    resolvedAuth,
    gatewayTls,
    hooksConfig: () => hooksConfig,
    pluginRegistry,
    deps,
    canvasRuntime,
    canvasHostEnabled,
    allowCanvasHostInTests: opts.allowCanvasHostInTests,
    logCanvas,
    log,
    logHooks,
    logPlugins,
  });
  let bonjourStop: (() => Promise<void>) | null = null;
  const nodeRegistry = new NodeRegistry();
  const nodePresenceTimers = new Map<string, ReturnType<typeof setInterval>>();
  const nodeSubscriptions = createNodeSubscriptionManager();
  const nodeSendEvent = (opts: { nodeId: string; event: string; payloadJSON?: string | null }) => {
    const payload = safeParseJson(opts.payloadJSON ?? null);
    nodeRegistry.sendEvent(opts.nodeId, opts.event, payload);
  };
  const nodeSendToSession = (sessionKey: string, event: string, payload: unknown) =>
    nodeSubscriptions.sendToSession(sessionKey, event, payload, nodeSendEvent);
  const nodeSendToAllSubscribed = (event: string, payload: unknown) =>
    nodeSubscriptions.sendToAllSubscribed(event, payload, nodeSendEvent);
  const nodeSubscribe = nodeSubscriptions.subscribe;
  const nodeUnsubscribe = nodeSubscriptions.unsubscribe;
  const nodeUnsubscribeAll = nodeSubscriptions.unsubscribeAll;
  const broadcastVoiceWakeChanged = (triggers: string[]) => {
    broadcast("voicewake.changed", { triggers }, { dropIfSlow: true });
  };
  const hasMobileNodeConnected = () => hasConnectedMobileNode(nodeRegistry);
  applyGatewayLaneConcurrency(cfgAtStart);

  let cronState = buildGatewayCronService({
    cfg: cfgAtStart,
    deps,
    broadcast,
  });
  let { cron, storePath: cronStorePath } = cronState;

  const channelManager = createChannelManager({
    loadConfig,
    channelLogs,
    channelRuntimeEnvs,
  });
  const { getRuntimeSnapshot, startChannels, startChannel, stopChannel, markChannelLoggedOut } =
    channelManager;

  const machineDisplayName = await getMachineDisplayName();
  const discovery = await startGatewayDiscovery({
    machineDisplayName,
    port,
    gatewayTls: gatewayTls.enabled
      ? { enabled: true, fingerprintSha256: gatewayTls.fingerprintSha256 }
      : undefined,
    wideAreaDiscoveryEnabled: cfgAtStart.discovery?.wideArea?.enabled === true,
    wideAreaDiscoveryDomain: cfgAtStart.discovery?.wideArea?.domain,
    tailscaleMode,
    mdnsMode: cfgAtStart.discovery?.mdns?.mode,
    logDiscovery,
  });
  bonjourStop = discovery.bonjourStop;

  // ── Early process keepalive — anchors the event loop before async cluster init ──────────────
  // All 3 maintenance timers (tickInterval, healthInterval, dedupeCleanup) call .unref(),
  // which means they don't prevent the process from exiting. We set a ref'd keepalive here,
  // BEFORE the cluster services start (and their async becomePrimary fires), to ensure
  // the event loop stays alive even if every other ref'd resource is temporarily closed.
  // The _gatewayKeepalive in server-startup.ts has an !_gatewayKeepalive guard,
  // so this is safe to duplicate — the first set wins.
  let _earlyKeepalive: ReturnType<typeof setInterval> | null = null;
  if (!_existingKeepalive) {
    _earlyKeepalive = setInterval(() => {
      /* keep event loop alive */
    }, 30_000);
    // Explicitly do NOT unref() — this is the safety net.
  }

  // ── Drain/exit diagnostics — synchronous registration so they always fire ──
  // IMPORTANT: do NOT use import("node:fs").then() here — if the event loop
  // drains before the microtask resolves the handlers are never registered.
  process.on("beforeExit", (code) => {
    process.stdout.write(
      `[drain] beforeExit code=${code} earlyKeepalive=${_earlyKeepalive !== null}\n`,
    );
  });
  process.on("exit", (code) => {
    process.stdout.write(`[drain] exit code=${code} earlyKeepalive=${_earlyKeepalive !== null}\n`);
  });
  // ────────────────────────────────────────────────────────────────────

  // Initialize cluster services only if explicitly enabled in config.
  // Single-node deployments (99% of boots) skip the ~500ms cluster init.
  let clusterServices: ClusterServices;
  const clusterExplicitlyEnabled = isTruthyEnvValue(process.env.OPENCLAW_CLUSTER_ENABLED);
  if (clusterExplicitlyEnabled) {
    try {
      if (_bootDiag) {
        process.stdout.write("[diag] cluster init start\n");
      }
      clusterServices = await initializeClusterServices();
      if (clusterServices.isEnabled) {
        log.info("Cluster services initialized successfully");
      }
      if (_bootDiag) {
        process.stdout.write("[diag] cluster init done\n");
      }
    } catch (error) {
      log.error("Failed to initialize cluster services, continuing without cluster support", {
        error,
      });
      clusterServices = { isEnabled: false };
    }
  } else {
    clusterServices = { isEnabled: false };
  }

  setSkillsRemoteRegistry(nodeRegistry);
  // Defer remote skills cache prime — no remote nodes exist on cold boot.
  setImmediate(() => void primeRemoteSkillsCache());
  // Debounce skills-triggered node probes to avoid feedback loops and rapid-fire invokes.
  // Skills changes can happen in bursts (e.g., file watcher events), and each probe
  // takes time to complete. A 30-second delay ensures we batch changes together.
  let skillsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  const skillsRefreshDelayMs = 30_000;
  const skillsChangeUnsub = registerSkillsChangeListener((event) => {
    if (event.reason === "remote-node") {
      return;
    }
    if (skillsRefreshTimer) {
      clearTimeout(skillsRefreshTimer);
    }
    skillsRefreshTimer = setTimeout(() => {
      skillsRefreshTimer = null;
      const latest = loadConfig();
      void refreshRemoteBinsForConnectedNodes(latest);
    }, skillsRefreshDelayMs);
  });

  const { tickInterval, healthInterval, dedupeCleanup } = startGatewayMaintenanceTimers({
    broadcast,
    nodeSendToAllSubscribed,
    getPresenceVersion,
    getHealthVersion,
    refreshGatewayHealthSnapshot,
    logHealth,
    dedupe,
    chatAbortControllers,
    chatRunState,
    chatRunBuffers,
    chatDeltaSentAt,
    removeChatRun,
    agentRunSeq,
    nodeSendToSession,
  });

  const agentUnsub = onAgentEvent(
    createAgentEventHandler({
      broadcast,
      broadcastToConnIds,
      nodeSendToSession,
      agentRunSeq,
      chatRunState,
      resolveSessionKeyForRun,
      clearAgentRunContext,
      toolEventRecipients,
      // Lazy bridge: fires init on first access (coalesced-safe).
      // Returns the bridge synchronously if already initialized, or
      // undefined on first call while the promise resolves.
      get quantumBridge() {
        if (!_quantumBridge) {
          void getQuantumBridge();
        }
        return _quantumBridge ?? undefined;
      },
    }),
  );

  const heartbeatUnsub = onHeartbeatEvent((evt) => {
    broadcast("heartbeat", evt, { dropIfSlow: true });
  });

  let heartbeatRunner = startHeartbeatRunner({ cfg: cfgAtStart });

  void cron.start().catch((err) => logCron.error(`failed to start: ${String(err)}`));

  const execApprovalManager = new ExecApprovalManager();
  const execApprovalForwarder = createExecApprovalForwarder();
  const execApprovalHandlers = createExecApprovalHandlers(execApprovalManager, {
    forwarder: execApprovalForwarder,
  });

  const canvasHostServerPort = (canvasHostServer as CanvasHostServer | null)?.port;

  attachGatewayWsHandlers({
    wss,
    clients,
    port,
    gatewayHost: bindHost ?? undefined,
    canvasHostEnabled: Boolean(canvasHost),
    canvasHostServerPort,
    resolvedAuth,
    gatewayMethods,
    events: GATEWAY_EVENTS,
    logGateway: log,
    logHealth,
    logWsControl,
    extraHandlers: {
      ...pluginRegistry.gatewayHandlers,
      ...execApprovalHandlers,
      ...modelsManagerHandlers,
    },
    broadcast,
    context: {
      deps,
      // Lazy getter: triggers init on first access, returns bridge if ready.
      get quantumBridge() {
        if (!_quantumBridge) {
          void getQuantumBridge();
        }
        return _quantumBridge ?? undefined;
      },
      cron,
      cronStorePath,
      loadGatewayModelCatalog,
      getHealthCache,
      refreshHealthSnapshot: refreshGatewayHealthSnapshot,
      logHealth,
      logGateway: log,
      incrementPresenceVersion,
      getHealthVersion,
      broadcast,
      broadcastToConnIds,
      nodeSendToSession,
      nodeSendToAllSubscribed,
      nodeSubscribe,
      nodeUnsubscribe,
      nodeUnsubscribeAll,
      hasConnectedMobileNode: hasMobileNodeConnected,
      nodeRegistry,
      agentRunSeq,
      chatAbortControllers,
      chatAbortedRuns: chatRunState.abortedRuns,
      chatRunBuffers: chatRunState.buffers,
      chatDeltaSentAt: chatRunState.deltaSentAt,
      addChatRun,
      removeChatRun,
      registerToolEventRecipient: toolEventRecipients.add,
      dedupe,
      wizardSessions,
      findRunningWizard,
      purgeWizardSession,
      getRuntimeSnapshot,
      startChannel,
      stopChannel,
      markChannelLoggedOut,
      wizardRunner,
      broadcastVoiceWakeChanged,
    },
  });
  logGatewayStartup({
    cfg: cfgAtStart,
    bindHost,
    bindHosts: httpBindHosts,
    port,
    tlsEnabled: gatewayTls.enabled,
    log,
    isNixMode,
  });
  scheduleGatewayUpdateCheck({ cfg: cfgAtStart, log, isNixMode });
  const tailscaleCleanup = await startGatewayTailscaleExposure({
    tailscaleMode,
    resetOnExit: tailscaleConfig.resetOnExit,
    port,
    controlUiBasePath,
    logTailscale,
  });

  let browserControl: Awaited<ReturnType<typeof startBrowserControlServerIfEnabled>> = null;
  let missionControl: { stop: () => Promise<void> } | null = null;
  try {
    ({ browserControl, pluginServices, missionControl } = await startGatewaySidecars({
      cfg: cfgAtStart,
      pluginRegistry,
      defaultWorkspaceDir,
      deps,
      startChannels,
      log,
      logHooks,
      logChannels,
      logBrowser,
    }));
  } catch (sidecarErr) {
    // startGatewaySidecars failed — log and continue without sidecars.
    // This must NOT propagate up or it will silently kill the gateway.
    log.error(`[gateway] startGatewaySidecars failed: ${String(sidecarErr)}`);
  }

  // Release the early keepalive only if _gatewayKeepalive (from startGatewaySidecars)
  // is confirmed to be set. If sidecars threw and _gatewayKeepalive was never created,
  // we keep _earlyKeepalive alive as the last safety net.
  if (_existingKeepalive && _earlyKeepalive) {
    clearInterval(_earlyKeepalive);
    _earlyKeepalive = null;
  }

  // ── Last-resort keepalive ─────────────────────────────────────────────────
  // If both keepalives are null at this point (sidecar failure path), create a
  // final ref'd interval to prevent the event loop from draining immediately.
  if (!_existingKeepalive && !_earlyKeepalive) {
    _earlyKeepalive = setInterval(() => {
      /* last-resort keepalive */
    }, 60_000);
    if (_bootDiag) {
      process.stdout.write("[diag] startGatewayServer: last-resort keepalive created\n");
    }
  }

  // ── Boot Orchestrator: DAG-driven post-sidecar initialization ──────────
  // Replaces the sequential imperative init blocks with the parallel,
  // dependency-aware boot engine. Provides telemetry via republic.boot.* RPCs.
  const bootOrchestrator = getBootOrchestrator();
  const bootContext: BootContext = {
    cfg: cfgAtStart,
    port,
    deps,
    pluginRegistry,
    defaultWorkspaceDir,
    startChannels,
    log: { info: (m) => log.info(m), warn: (m) => log.warn(m), error: (m) => log.error(m) },
    logHooks: {
      info: (m) => logHooks.info(m),
      warn: (m) => logHooks.warn(m),
      error: (m) => logHooks.error(m),
    },
    logChannels: { info: (m) => logChannels.info(m), error: (m) => logChannels.error(m) },
    logBrowser: { error: (m) => logBrowser.error(m) },
  };
  registerAllBootItems(bootOrchestrator, bootContext);
  try {
    await bootOrchestrator.boot();
    log.info("[boot-orchestrator] completed successfully");
  } catch (bootErr) {
    log.error(`[boot-orchestrator] ${String(bootErr)}`);
  }

  // ─── Republic: Auto-start simulation ──────────────────────────────────
  // NOTE: autoStartSimulation() is called inside startGatewaySidecars()
  // above, which sequences it after workspace restore and before mission
  // control. The call here was a duplicate (would double-register all 70+
  // orchestrator handlers). autoStartSimulation() is now idempotent, but
  // the extra call is removed for clarity.

  const { applyHotReload, requestGatewayRestart } = createGatewayReloadHandlers({
    deps,
    broadcast,
    getState: () => ({
      hooksConfig,
      heartbeatRunner,
      cronState,
      browserControl,
    }),
    setState: (nextState) => {
      hooksConfig = nextState.hooksConfig;
      heartbeatRunner = nextState.heartbeatRunner;
      cronState = nextState.cronState;
      cron = cronState.cron;
      cronStorePath = cronState.storePath;
      browserControl = nextState.browserControl;
    },
    startChannel,
    stopChannel,
    logHooks,
    logBrowser,
    logChannels,
    logCron,
    logReload,
  });

  const configReloader = startGatewayConfigReloader({
    initialConfig: cfgAtStart,
    readSnapshot: readConfigFileSnapshot,
    onHotReload: applyHotReload,
    onRestart: requestGatewayRestart,
    log: {
      info: (msg) => logReload.info(msg),
      warn: (msg) => logReload.warn(msg),
      error: (msg) => logReload.error(msg),
    },
    watchPath: CONFIG_PATH,
  });

  const close = createGatewayCloseHandler({
    bonjourStop,
    tailscaleCleanup,
    canvasHost,
    canvasHostServer,
    stopChannel,
    pluginServices,
    cron,
    heartbeatRunner,
    nodePresenceTimers,
    broadcast,
    tickInterval,
    healthInterval,
    dedupeCleanup,
    agentUnsub,
    heartbeatUnsub,
    chatRunState,
    clients,
    configReloader,
    browserControl,
    missionControl,
    wss,
    httpServer,
    httpServers,
  });

  return {
    close: async (opts) => {
      if (diagnosticsEnabled) {
        stopDiagnosticHeartbeat();
      }
      if (skillsRefreshTimer) {
        clearTimeout(skillsRefreshTimer);
        skillsRefreshTimer = null;
      }
      skillsChangeUnsub();
      // Disconnect Supabase
      await shutdownSupabase();
      // Save republic state before shutdown
      await republicShutdown();
      // Shutdown inference gateway
      const { shutdownInferenceGateway } = await import("../republic/inference-gateway.js");
      await shutdownInferenceGateway();
      // Shutdown cluster services
      await shutdownClusterServices(clusterServices);
      await close(opts);
    },
  };
}
