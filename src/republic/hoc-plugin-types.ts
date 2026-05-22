/**
 * HoC Plugin System — Manifest Types
 *
 * Each HoC plugin lives in its own directory under plugins/ and is
 * described by a `hoc.plugin.json` manifest. This module defines the
 * shape of that manifest and the lifecycle contracts plugins must follow.
 *
 * Architecture: DDD-aligned bounded contexts
 *   domain/        — Pure types, no I/O
 *   application/   — Use cases, orchestrators
 *   infrastructure/ — External API clients, child processes
 *   adapter/       — Bridges plugin → HoC (providers, hooks, gateway)
 */

import type { GatewayRequestHandler } from "../gateway/server-methods/types.js";

// ─── Plugin Manifest (hoc.plugin.json) ──────────────────────────

export interface HoCPluginManifest {
  /** Unique plugin ID (kebab-case, e.g. "hoc-plugin-whisper") */
  id: string;
  /** Human-readable name */
  name: string;
  /** SemVer version */
  version: string;
  /** Short description */
  description?: string;
  /** Source GitHub repo URL */
  sourceRepo?: string;

  /** What this plugin provides to HoC */
  capabilities?: {
    /** Registers as an inference provider */
    inference?: boolean;
    /** Tool names available to citizens */
    tools?: string[];
    /** Compute provider names to register */
    providers?: string[];
    /** Republic events this plugin hooks into */
    hooks?: string[];
    /** Gateway RPC method names */
    gateway?: string[];
    /** UI panel IDs */
    ui?: string[];
  };

  /** Entry points for lifecycle management */
  lifecycle?: {
    /** Path to init function (e.g. "application/service.ts#init") */
    init?: string;
    /** Path to shutdown function */
    shutdown?: string;
    /** Path to health check function */
    healthCheck?: string;
  };

  /** Runtime requirements */
  requirements?: {
    /** External binaries needed on PATH */
    binaries?: string[];
    /** Required environment variables */
    env?: string[];
    /** Minimum memory in MB */
    minMemoryMb?: number;
  };

  /**
   * Boot priority (0-100). Lower = boots earlier.
   * Infrastructure plugins should be 0-30, inference 30-60, tools 60-100.
   * Default: 50.
   */
  bootPriority?: number;

  // ─── Declarative plugin fields (opt-in) ─────────────────────
  // If `backend` is present, the plugin is loaded via the declarative loader
  // instead of requiring hand-coded TypeScript. All fields below are optional.

  /**
   * Declarative backend definition.
   * If present, the plugin is loaded via the declarative loader.
   * Plugins without this field continue using the existing hand-coded path.
   */
  backend?: {
    /** Backend type */
    type: "python-cli" | "rest-api" | "docker-compose" | "node-cli" | "git-repo";
    /** GitHub repo to clone (for python-cli, node-cli, git-repo) */
    repo?: string;
    /** Python pip dependencies (for python-cli) */
    deps?: string[];
    /** Python import to verify installation (for python-cli) */
    verifyImport?: string;
    /** API base URL (for rest-api, docker-compose) */
    apiUrl?: string;
    /** API health endpoint path (for rest-api) */
    healthEndpoint?: string;
    /** Docker Compose service name (for docker-compose) */
    serviceName?: string;
    /** Docker Compose file path relative to plugins dir (for docker-compose) */
    composeFile?: string;
    /** Environment variable name containing an API key (for rest-api) */
    apiKeyEnv?: string;
  };

  /**
   * Declarative tool definitions — auto-registered by the declarative loader.
   * Each tool is wired to the backend adapter's execute() method.
   */
  toolDefinitions?: Array<{
    /** Tool name (used by agents and gateway) */
    name: string;
    /** Human-readable description */
    description: string;
    /** Tool parameters */
    params?: Record<
      string,
      {
        type: string;
        description?: string;
        required?: boolean;
        enum?: string[];
      }
    >;
    /** Command name passed to backend.execute() */
    command: string;
  }>;

  /**
   * Declarative gateway RPC definitions.
   * Each entry maps a gateway method name to an underlying tool command.
   */
  gatewayDefinitions?: Array<{
    /** Gateway method name (e.g., "bark.generate") */
    method: string;
    /** Delegate to this command (or "_job_status" / "_cancel" / "_queue_status" for queue ops) */
    delegateTo: string;
  }>;

  /**
   * Enable the shared job queue for this plugin.
   * If true, uses defaults. If object, configures concurrency and timeout.
   * When enabled, auto-registers {prefix}_job_status, {prefix}_cancel, {prefix}_queue_status tools.
   */
  jobQueue?:
    | boolean
    | {
        /** Max concurrent jobs (default: 1) */
        maxConcurrent?: number;
        /** Job timeout in milliseconds (default: 300000) */
        timeoutMs?: number;
      };

  // ─── Cluster Node Requirements (Phase 2) ────────────────────

  /**
   * Declare hardware/node requirements for cluster-aware placement.
   * The ClusterPluginScheduler uses these to select the optimal node
   * when spawning this plugin's worker process.
   */
  nodeRequirements?: {
    /** Minimum total VRAM (GiB) across all GPUs on the node. */
    minVramGb?: number;
    /** Minimum system RAM (GiB). */
    minRamGb?: number;
    /** Minimum number of logical CPU cores. */
    minCpuCores?: number;
    /** Node must have ALL of these tags (AND). Tags are set via HOC_NODE_TAGS env var. */
    tags?: string[];
    /** Node must have at least ONE of these tags (OR). */
    anyTags?: string[];
    /** Soft affinity — prefer this node ID if it satisfies all other requirements. */
    preferredNodeId?: string;
    /** Hard pin — ONLY run on this exact node ID. */
    requiredNodeId?: string;
  };

  /**
   * Run this plugin on N nodes simultaneously for hot-standby fault tolerance.
   * Default: 1 (single instance).
   */
  redundancy?: number;

  /**
   * Maximum concurrent worker instances of this plugin across the entire cluster.
   * Prevents runaway fan-out. Default: unlimited.
   */
  maxInstances?: number;

  /** Maximum RSS memory (MB) before the bus triggers a restart. */
  maxMemoryMb?: number;
}

// ─── Plugin Lifecycle Contracts ─────────────────────────────────

/** Context passed to plugins during initialization */
export interface HoCPluginContext {
  /** Plugin's own data directory for persistent storage */
  dataDir: string;
  /** Plugin's root directory (where hoc.plugin.json lives) */
  pluginDir: string;
  /** Logger scoped to this plugin */
  logger: HoCPluginLogger;
  /** Alias for logger — plugins may use `log` instead of `logger` */
  log: HoCPluginLogger;
  /** Register as a compute/inference provider */
  registerProvider(name: string, config: HoCProviderConfig): void;
  /** Register tools available to citizen agents */
  registerTools(tools: HoCToolDefinition[]): void;
  /** Register a single tool — compatibility alias for registerTools */
  registerTool(
    name: string,
    description: string,
    schema: unknown,
    handler: (args: Record<string, unknown>) => unknown,
  ): void;
  /** Subscribe to Republic events */
  on(event: string, handler: (...args: unknown[]) => void): void;
  /** Emit events into the Republic event bus */
  emit(event: string, data: unknown): void;
  /** Register gateway RPC methods */
  registerGateway(method: string, handler: GatewayRequestHandler): void;
}

export interface HoCPluginLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

export interface HoCProviderConfig {
  available: boolean;
  models: string[];
  throughput?: number;
}

export interface HoCToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/** Health check result */
export interface HoCHealthStatus {
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

// ─── Loaded Plugin Record ───────────────────────────────────────

export interface HoCPluginRecord {
  id: string;
  manifest: HoCPluginManifest;
  pluginDir: string;
  dataDir: string;
  status: "discovered" | "loaded" | "initializing" | "ready" | "error" | "stopped";
  error?: string;
  loadedAt: number;
  /** Plugin module exports */
  module?: HoCPluginModule;
}

/** What a plugin's entry point must export */
export interface HoCPluginModule {
  init?(ctx: HoCPluginContext): Promise<void> | void;
  shutdown?(): Promise<void>;
  healthCheck?(): Promise<HoCHealthStatus>;
  /** Plugins may export default function register(ctx) instead of init() */
  default?: ((ctx: HoCPluginContext) => void) | { (ctx: HoCPluginContext): void };
}
