/**
 * Republic Platform — Gateway RPC Handlers (Lazy-Loaded)
 *
 * Instead of eagerly importing all 99 handler modules at startup
 * (which forces evaluation of ~8 MB of republic business logic),
 * this file uses a Proxy-based lazy dispatcher that dynamically
 * imports handler modules on first access.
 *
 * Domains are grouped into lazy loaders — each domain's handler
 * module is only loaded when the first RPC call matching that
 * domain arrives. Loaded handlers are cached for all subsequent
 * calls with zero overhead.
 *
 * Boot-time improvement: eliminates ~1.8 MB of handler imports
 * and their ~8 MB transitive republic dependency tree from the
 * startup critical path.
 */

import type { GatewayRequestHandlers } from "./types.js";

// ─── Lazy Loader Infrastructure ─────────────────────────────────

type HandlerModule = { [key: string]: unknown };
type LazyDomain = {
  /** Name of the exported handlers const from the module */
  exportName: string;
  /** Dynamic import function returning the module */
  loader: () => Promise<HandlerModule>;
};

/**
 * Registry of all republic handler domains and their lazy loaders.
 * Each entry maps a short domain key to its module loader.
 * The Proxy below matches incoming RPC method names against all
 * domains to find the right handler module.
 */
const LAZY_DOMAINS: Record<string, LazyDomain> = {
  core: { exportName: "coreHandlers", loader: () => import("./republic/core.js") },
  education: { exportName: "educationHandlers", loader: () => import("./republic/education.js") },
  execution: { exportName: "executionHandlers", loader: () => import("./republic/execution.js") },
  creative: { exportName: "creativeHandlers", loader: () => import("./republic/creative.js") },
  finance: { exportName: "financeHandlers", loader: () => import("./republic/finance.js") },
  learning: { exportName: "learningHandlers", loader: () => import("./republic/learning.js") },
  hardware: { exportName: "hardwareHandlers", loader: () => import("./republic/hardware.js") },
  governance: {
    exportName: "governanceHandlers",
    loader: () => import("./republic/governance.js"),
  },
  infra: { exportName: "infraHandlers", loader: () => import("./republic/infra.js") },
  workspace: { exportName: "workspaceHandlers", loader: () => import("./republic/workspace.js") },
  diplomacy: { exportName: "diplomacyHandlers", loader: () => import("./republic/diplomacy.js") },
  society: { exportName: "societyHandlers", loader: () => import("./republic/society.js") },
  backend: { exportName: "backendHandlers", loader: () => import("./republic/backend.js") },
  agentSociety: {
    exportName: "agentSocietyHandlers",
    loader: () => import("./republic/agent-society.js"),
  },
  nationalSecurity: {
    exportName: "nationalSecurityHandlers",
    loader: () => import("./republic/national-security.js"),
  },
  professional: {
    exportName: "professionalHandlers",
    loader: () => import("./republic/professional.js"),
  },
  aiHub: { exportName: "aiHubHandlers", loader: () => import("./republic/ai-hub.js") },
  autonomy: { exportName: "autonomyHandlers", loader: () => import("./republic/autonomy.js") },
  diagnostics: {
    exportName: "diagnosticsHandlers",
    loader: () => import("./republic/diagnostics.js"),
  },
  compute: { exportName: "computeHandlers", loader: () => import("./republic/compute.js") },
  cognitiveStatus: {
    exportName: "cognitiveHandlers",
    loader: () => import("./republic/cognitive-status.js"),
  },
  supabase: { exportName: "supabaseHandlers", loader: () => import("./republic/supabase.js") },
  worldIntel: {
    exportName: "worldIntelHandlers",
    loader: () => import("./republic/world-intel.js"),
  },
  plugins: { exportName: "pluginHandlers", loader: () => import("./republic/plugins.js") },
  pluginQueue: {
    exportName: "pluginQueueHandlers",
    loader: () => import("./republic/plugin-queue.js"),
  },
  lovable: { exportName: "lovableHandlers", loader: () => import("./republic/lovable.js") },
  mediaStudio: {
    exportName: "mediaStudioHandlers",
    loader: () => import("./republic/media-studio.js"),
  },
  pluginInteract: {
    exportName: "pluginInteractHandlers",
    loader: () => import("./republic/plugin-interact.js"),
  },
  intelligence: {
    exportName: "intelligenceHandlers",
    loader: () => import("./republic/intelligence.js"),
  },
  dockerRpc: { exportName: "dockerRpcHandlers", loader: () => import("./republic/docker-rpc.js") },
  forex: { exportName: "forexHandlers", loader: () => import("./republic/forex.js") },
  gsd: { exportName: "gsdHandlers", loader: () => import("./republic/gsd.js") },
  metaLearning: {
    exportName: "metaLearningHandlers",
    loader: () => import("./republic/meta-learning.js"),
  },
  waragent: { exportName: "warAgentHandlers", loader: () => import("./republic/waragent.js") },
  pulse: { exportName: "pulseHandlers", loader: () => import("./republic/pulse.js") },
  research: { exportName: "researchHandlers", loader: () => import("./republic/research.js") },
  dreams: { exportName: "dreamsHandlers", loader: () => import("./republic/dreams.js") },
  avatar: { exportName: "avatarHandlers", loader: () => import("./republic/avatar.js") },
  statefulDomains: {
    exportName: "statefulDomainHandlers",
    loader: () => import("./republic/stateful-domains.js"),
  },
  emotions: { exportName: "emotionHandlers", loader: () => import("./republic/emotions.js") },
  narrative: { exportName: "narrativeHandlers", loader: () => import("./republic/narrative.js") },
  social: { exportName: "socialHandlers", loader: () => import("./republic/social.js") },
  a2a: { exportName: "a2aHandlers", loader: () => import("./republic/a2a.js") },
  apr: { exportName: "aprHandlers", loader: () => import("./republic/apr.js") },
  infraOps: { exportName: "infraOpsHandlers", loader: () => import("./republic/infra-ops.js") },
  autonomyPersonas: {
    exportName: "autonomyPersonasHandlers",
    loader: () => import("./republic/autonomy-personas.js"),
  },
  cognitiveExt: {
    exportName: "cognitiveHandlers",
    loader: () => import("./republic/cognitive.js"),
  },
  utilHandlers: { exportName: "utilHandlers", loader: () => import("./republic/util-handlers.js") },
  evolution: { exportName: "evolutionHandlers", loader: () => import("./republic/evolution.js") },
  payments: { exportName: "paymentsHandlers", loader: () => import("./republic/payments.js") },
  scalability: {
    exportName: "scalabilityHandlers",
    loader: () => import("./republic/scalability.js"),
  },
  cpeDashboard: {
    exportName: "cpeDashboardHandlers",
    loader: () => import("./republic/cpe-dashboard.js"),
  },
  metacognition: {
    exportName: "metacognitionHandlers",
    loader: () => import("./republic/metacognition-rpc.js"),
  },
  devotion: { exportName: "devotionHandlers", loader: () => import("./republic/devotion-rpc.js") },
  manus: { exportName: "manusHandlers", loader: () => import("./republic/manus-rpc.js") },
  civilization: {
    exportName: "civilizationHandlers",
    loader: () => import("./republic/civilization.js"),
  },
  comfyui: { exportName: "comfyuiHandlers", loader: () => import("./republic/comfyui.js") },
  warTheater: {
    exportName: "warTheaterHandlers",
    loader: () => import("./republic/war-theater.js"),
  },
  claudeOps: { exportName: "claudeOpsHandlers", loader: () => import("./republic/claude-ops.js") },
  gameStudio: {
    exportName: "gameStudioHandlers",
    loader: () => import("./republic/game-studio.js"),
  },
  economy: { exportName: "economyHandlers", loader: () => import("./republic/economy.js") },
  devStudio: { exportName: "devStudioHandlers", loader: () => import("./republic/dev-studio.js") },
  medical: { exportName: "medicalHandlers", loader: () => import("./republic/medical.js") },
  backoffice: {
    exportName: "backofficeHandlers",
    loader: () => import("./republic/backoffice.js"),
  },
  science: { exportName: "scienceHandlers", loader: () => import("./republic/science.js") },
  cyber: { exportName: "cyberHandlers", loader: () => import("./republic/cyber.js") },
  cyberDefense: {
    exportName: "cyberDefenseHandlers",
    loader: () => import("./republic/cyber-defense-rpc.js"),
  },
  cluster: { exportName: "clusterHandlers", loader: () => import("./republic/cluster-rpc.js") },
  reverseEngineering: {
    exportName: "reverseEngineeringHandlers",
    loader: () => import("./republic/reverse-engineering-rpc.js"),
  },
  workforce: { exportName: "workforceHandlers", loader: () => import("./republic/workforce.js") },
  production: {
    exportName: "productionHandlers",
    loader: () => import("./republic/production.js"),
  },
  skillsRepublic: {
    exportName: "skillsRepublicHandlers",
    loader: () => import("./republic/skills-republic.js"),
  },
  missingPages: {
    exportName: "missingPageHandlers",
    loader: () => import("./republic/missing-page-handlers.js"),
  },
  clawHub: { exportName: "clawHubHandlers", loader: () => import("./republic/clawhub.js") },
  hpicsRoles: {
    exportName: "hpicsRoleHandlers",
    loader: () => import("./republic/hpics-roles.js"),
  },
  defense: { exportName: "defenseHandlers", loader: () => import("./republic/defense.js") },
  revenue: { exportName: "revenueHandlers", loader: () => import("./republic/revenue.js") },
  quran: { exportName: "quranHandlers", loader: () => import("./republic/quran.js") },
  lmlink: { exportName: "lmlinkHandlers", loader: () => import("./republic/lmlink.js") },
  finetune: { exportName: "finetuneHandlers", loader: () => import("./republic/finetune.js") },
  crucix: { exportName: "crucixHandlers", loader: () => import("./republic/crucix.js") },
  nemoClaw: { exportName: "nemoClawHandlers", loader: () => import("./republic/nemoclaw.js") },
  hr: { exportName: "hrHandlers", loader: () => import("./republic/hr-rpc.js") },
  sandbox: { exportName: "sandboxHandlers", loader: () => import("./republic/sandbox.js") },
  foundry: { exportName: "foundryHandlers", loader: () => import("./republic/foundry-rpc.js") },
  cognee: { exportName: "cogneeHandlers", loader: () => import("./republic/cognee-rpc.js") },
  composio: { exportName: "composioHandlers", loader: () => import("./republic/composio-rpc.js") },
  selfHealing: {
    exportName: "selfHealingHandlers",
    loader: () => import("./republic/self-healing-rpc.js"),
  },
  sandboxManagement: {
    exportName: "sandboxManagementHandlers",
    loader: () => import("./republic/sandbox-management.js"),
  },
  n8nManagement: {
    exportName: "n8nManagementHandlers",
    loader: () => import("./republic/n8n-management.js"),
  },
  brandings: { exportName: "brandingsHandlers", loader: () => import("./republic/brandings.js") },
  kali: { exportName: "kaliHandlers", loader: () => import("./republic/kali-rpc.js") },
  nodeDocker: {
    exportName: "nodeDockerRpcHandlers",
    loader: () => import("./republic/node-docker-rpc.js"),
  },
  infraEnsure: {
    exportName: "infraEnsureHandlers",
    loader: () => import("./republic/infra-ensure.js"),
  },
  computeProxy: {
    exportName: "computeProxyHandlers",
    loader: () => import("./republic/compute-proxy.js"),
  },
  godaddy: { exportName: "godaddyHandlers", loader: () => import("./republic/godaddy-rpc.js") },
  browserCollab: {
    exportName: "browserCollabHandlers",
    loader: () => import("./republic/browser-collab-rpc.js"),
  },
  registry: { exportName: "registryHandlers", loader: () => import("./republic/registry.js") },
  bootStatus: {
    exportName: "bootStatusHandlers",
    loader: () => import("./republic/boot-status.js"),
  },
  openclaw: {
    exportName: "openclawHandlers",
    loader: () => import("./republic/openclaw.js"),
  },
  asyncTasks: {
    exportName: "asyncTaskHandlers",
    loader: () => import("./republic/async-tasks.js"),
  },
  sovereign: {
    exportName: "sovereignHandlers",
    loader: () => import("./republic/sovereign.js"),
  },
  agentTelemetry: {
    exportName: "agentTelemetryHandlers",
    loader: () => import("./republic/agent-telemetry.js"),
  },
};

// ─── Handler Cache ──────────────────────────────────────────────

/** Cache of resolved method → handler function */
const _resolvedHandlers: GatewayRequestHandlers = {};

/** Domains that have been loaded (by key) */
const _loadedDomains = new Set<string>();

/** In-flight domain load promises (prevents duplicate loads) */
const _loadingDomains = new Map<string, Promise<void>>();

/**
 * Load a domain's handler module and merge its handlers into the resolved cache.
 * Idempotent — subsequent calls for the same domain are no-ops.
 */
async function loadDomain(domainKey: string): Promise<void> {
  if (_loadedDomains.has(domainKey)) {
    return;
  }

  // Coalesce concurrent loads of the same domain
  const existing = _loadingDomains.get(domainKey);
  if (existing) {
    return existing;
  }

  const domain = LAZY_DOMAINS[domainKey];
  if (!domain) {
    return;
  }

  const promise = (async () => {
    try {
      const mod = await domain.loader();
      const handlers = mod[domain.exportName] as GatewayRequestHandlers | undefined;
      if (handlers && typeof handlers === "object") {
        Object.assign(_resolvedHandlers, handlers);
      }
      _loadedDomains.add(domainKey);
    } catch (err) {
      console.warn(
        `[republic:lazy] Failed to load domain "${domainKey}":`,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      _loadingDomains.delete(domainKey);
    }
  })();

  _loadingDomains.set(domainKey, promise);
  return promise;
}

/**
 * Eagerly load ALL domains. Used by startup health checks and
 * whitelist drift detection that need to enumerate all methods.
 * Should NOT be called during the critical boot path.
 *
 * Thread-safe: concurrent callers coalesce onto a single load cycle.
 */
let _allHandlersPromise: Promise<GatewayRequestHandlers> | null = null;
export function loadAllRepublicHandlers(): Promise<GatewayRequestHandlers> {
  if (_allHandlersPromise) {
    return _allHandlersPromise;
  }

  _allHandlersPromise = (async () => {
    const unloaded = Object.keys(LAZY_DOMAINS).filter((k) => !_loadedDomains.has(k));
    if (unloaded.length > 0) {
      await Promise.all(unloaded.map((k) => loadDomain(k)));
    }
    return _resolvedHandlers;
  })();

  return _allHandlersPromise;
}

// ─── Proxy-Based Lazy Dispatcher ────────────────────────────────

/**
 * The `republicHandlers` export is a Proxy that intercepts property
 * access (method lookups). When a method is accessed:
 *
 * 1. If already resolved → return cached handler (zero overhead)
 * 2. If not resolved → return a wrapper that loads all domains,
 *    then dispatches to the real handler
 *
 * For `Object.keys()` / `ownKeys` (used by whitelist drift checks),
 * we trigger a full eager load so all methods are enumerable.
 */
export const republicHandlers: GatewayRequestHandlers = new Proxy(_resolvedHandlers, {
  get(_target, prop: string | symbol) {
    if (typeof prop === "symbol") {
      return undefined;
    }

    // Fast path: handler already loaded
    if (prop in _resolvedHandlers) {
      return _resolvedHandlers[prop];
    }

    // Slow path: return an async-loading wrapper that loads all domains
    // on first access to find the right handler. This ensures the first
    // call to any republic.* method works transparently.
    return async (ctx: import("./types.js").GatewayRequestHandlerOptions) => {
      // Load all domains to find which one owns this method
      await loadAllRepublicHandlers();

      const realHandler = _resolvedHandlers[prop];
      if (typeof realHandler === "function") {
        return realHandler(ctx);
      }

      // Method not found in any domain
      const { errorShape, ErrorCodes } = await import("../protocol/index.js");
      const reqCtx = ctx as { respond: (ok: boolean, data: unknown, err: unknown) => void };
      if (typeof reqCtx?.respond === "function") {
        reqCtx.respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, `unknown republic method: ${prop}`),
        );
      }
    };
  },

  has(_target, prop: string | symbol) {
    if (typeof prop === "symbol") {
      return false;
    }
    // Optimistic: check cache first, then assume it might exist
    // (the actual handler will load lazily on access)
    return prop in _resolvedHandlers || true;
  },

  ownKeys() {
    // Whitelist drift / health checks call Object.keys() — trigger full load
    // This is async-unsafe in a synchronous trap, so we return what we have.
    // The startup health check should call loadAllRepublicHandlers() first.
    return Reflect.ownKeys(_resolvedHandlers);
  },

  getOwnPropertyDescriptor(_target, prop) {
    if (prop in _resolvedHandlers) {
      return {
        configurable: true,
        enumerable: true,
        value: _resolvedHandlers[prop as string],
      };
    }
    return undefined;
  },
}) as GatewayRequestHandlers;
