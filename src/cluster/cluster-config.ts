/**
 * Cluster configuration manager
 * Loads and validates cluster configuration from environment and config files
 *
 * Fixes applied:
 * - Added `autoDetectRedis()` for probing localhost:6379
 * - Changed enabled default to "auto" — auto-detect Redis availability
 * - Cached config in module-level variable (isClusterEnabled no longer re-parses every call)
 * - `generateNodeId()` is stable per process (cached)
 * - Added `ensureRedisViaDocker()` for auto-starting a Redis container on gateway boot
 *   when Redis was previously connected but is currently down
 */

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { createSubsystemLogger } from "../logging.js";
import { resilienceEngine } from "./resilience-engine.js";

// ─── Redis State File ───────────────────────────────────────────

/** Persisted state that tracks whether the gateway was last connected to Redis via Docker */
interface RedisState {
  /** Epoch ms of last successful Redis connection */
  lastConnectedAt: number;
  /** Redis host that was connected to */
  host: string;
  /** Redis port that was connected to */
  port: number;
  /** Whether the Redis instance was provisioned by Docker auto-start */
  dockerManaged: boolean;
}

const REDIS_STATE_FILENAME = ".hoc-redis-state.json";

function getRedisStatePath(): string {
  const configDir = process.env.OPENCLAW_CONFIG_DIR || path.join(process.cwd(), "config");
  return path.join(configDir, REDIS_STATE_FILENAME);
}

export function readRedisState(): RedisState | null {
  try {
    const raw = fs.readFileSync(getRedisStatePath(), "utf-8");
    return JSON.parse(raw) as RedisState;
  } catch {
    return null;
  }
}

function writeRedisState(state: RedisState): void {
  try {
    const statePath = getRedisStatePath();
    const dir = path.dirname(statePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.warn("Failed to write Redis state file", { error: String(err) });
  }
}

// ─── Docker Redis Auto-Start ────────────────────────────────────

/** Stable container name for HoC-managed Redis (not randomised like launchPreset) */
const HOC_REDIS_CONTAINER_NAME = "hoc-redis-cluster";

/**
 * Attempt to ensure a Redis container is running via Docker.
 * 1. If a `hoc-redis-cluster` container exists and is stopped → restart it.
 * 2. If no such container exists → create one using the Redis preset config.
 * 3. Poll `autoDetectRedis()` until Redis is reachable (up to 10 s).
 *
 * Returns `true` if Redis became reachable, `false` otherwise.
 */
async function ensureRedisViaDocker(host: string, port: number): Promise<boolean> {
  let dockerOrch: typeof import("../republic/docker-orchestrator.js") | null = null;
  try {
    dockerOrch = await import("../republic/docker-orchestrator.js");
  } catch {
    logger.info("Docker orchestrator not available — skipping Redis auto-start");
    return false;
  }

  const docker = dockerOrch.ensureDocker();
  if (!docker.available) {
    logger.info(`Docker not available (${docker.error ?? "unknown"}) — skipping Redis auto-start`);
    return false;
  }

  logger.info("Redis not reachable — attempting Docker auto-start...");

  // Check for existing hoc-redis-cluster container (running or stopped)
  const allContainers = dockerOrch.listContainers(false);
  const existing = allContainers.find((c) => c.name === HOC_REDIS_CONTAINER_NAME);

  if (existing) {
    if (existing.status === "running") {
      // Container is already running — Redis may just be slow to respond
      logger.info("hoc-redis-cluster container is already running, waiting for readiness...");
    } else {
      // Container exists but is stopped — restart it
      logger.info(`Restarting stopped Redis container: ${HOC_REDIS_CONTAINER_NAME}`);
      const started = await dockerOrch.startContainer(HOC_REDIS_CONTAINER_NAME);
      if (!started) {
        logger.warn("Failed to restart stopped Redis container");
        return false;
      }
    }
  } else {
    // No existing container — create a fresh one
    logger.info("No existing Redis container found — creating hoc-redis-cluster...");

    // Ensure image exists locally
    const redisImage = "redis:7-alpine";
    if (!dockerOrch.imageExists(redisImage)) {
      logger.info(`Pulling Redis image: ${redisImage}...`);
      const pulled = await dockerOrch.pullImage(redisImage);
      if (!pulled) {
        logger.warn("Failed to pull Redis Docker image");
        return false;
      }
    }

    // Create the container using the preset config but with a stable name
    const preset = dockerOrch.CONTAINER_PRESETS.redis;

    // Ensure the resource budget is initialized — ensureRedisViaDocker runs
    // during early boot, before the main initResourceBudget() call.
    // Without this, maxCpuCores=0 and maxMemoryGB=0, silently denying all containers.
    await dockerOrch.initResourceBudget();

    const result = await dockerOrch.createContainer({
      ...preset,
      name: HOC_REDIS_CONTAINER_NAME,
      requestedBy: "gateway-autostart",
    });

    if (!result.container) {
      logger.warn(`Failed to create Redis Docker container: ${result.error}`);
      return false;
    }

    logger.info(`Redis container created: ${result.container.id}`);
  }

  // Poll for Redis readiness (up to 10 seconds, every 500 ms)
  const maxWaitMs = 10_000;
  const pollIntervalMs = 500;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const ready = await autoDetectRedis(host, port);
    if (ready) {
      logger.info("Redis Docker container is ready and accepting connections");
      return true;
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  logger.warn("Redis container started but did not become reachable within 10 seconds");
  return false;
}

const logger = createSubsystemLogger("cluster:config");

export interface ClusterConfig {
  enabled: boolean;
  nodeId: string;
  role: "primary" | "standby" | "auto";

  /** Clustering transport: redis (requires Redis), p2p (direct HTTP), auto (use Redis if available, else P2P) */
  clusterMode: "redis" | "p2p" | "auto";

  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    tls: boolean;
  };

  discovery: {
    /** Discovery protocol: multicast (LAN only), tailscale (HTTP unicast), both */
    mode: "multicast" | "tailscale" | "both";
    multicastAddress: string;
    multicastPort: number;
    announceInterval: number; // seconds
    /** Explicit list of Tailscale/LAN peer IPs to probe for gateway discovery */
    tailscalePeers: string[];
  };

  health: {
    heartbeatInterval: number; // seconds
    failureTimeout: number; // seconds
    checkInterval: number; // seconds
  };

  failover: {
    autoFailover: boolean;
    failoverDelay: number; // seconds
    maxFailovers: number; // per hour
  };

  encryption: {
    clusterSecret: string;
    encryptSessions: boolean;
  };

  monitoring: {
    enabled: boolean;
    metricsPort: number;
    dashboardEnabled: boolean;
  };
}

const DEFAULT_CONFIG: ClusterConfig = {
  enabled: false,
  nodeId: "",
  role: "auto",
  clusterMode: "auto",

  redis: {
    host: "localhost",
    port: 6379,
    db: 0,
    tls: false,
  },

  discovery: {
    mode: "both",
    multicastAddress: "239.255.0.1",
    multicastPort: 5353,
    announceInterval: 10,
    tailscalePeers: [],
  },

  health: {
    heartbeatInterval: 5,
    failureTimeout: 15,
    checkInterval: 3,
  },

  failover: {
    autoFailover: true,
    failoverDelay: 5,
    maxFailovers: 10,
  },

  encryption: {
    clusterSecret: "",
    encryptSessions: true,
  },

  monitoring: {
    enabled: true,
    metricsPort: 9090,
    dashboardEnabled: true,
  },
};

// ==================== Module-level caches ====================

/** Cached cluster config — loaded once per process unless invalidated */
let cachedConfig: ClusterConfig | null = null;

/** Stable node ID — generated once per process */
let cachedNodeId: string | null = null;

/**
 * Probe whether Redis is reachable at the given host:port.
 * Uses a raw TCP connect with a 2-second timeout — no auth or protocol.
 */
export function autoDetectRedis(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 2000;

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

export function loadClusterConfig(): ClusterConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const config: ClusterConfig = structuredClone(DEFAULT_CONFIG);

  // Load from environment variables
  loadFromEnvironment(config);

  // Load from config file if exists
  const configPath =
    process.env.OPENCLAW_CLUSTER_CONFIG || path.join(process.cwd(), "config", "cluster.yaml");
  if (fs.existsSync(configPath)) {
    loadFromFile(config, configPath);
  }

  // Validate configuration (only strict validation when explicitly enabled)
  if (config.enabled) {
    validateConfig(config);
  } else {
    // Generate cluster secret if not set even in standalone for UDP discovery signatures
    if (!config.encryption.clusterSecret) {
      config.encryption.clusterSecret = "hoc_default_cluster_secret_for_auto_discovery";
    }
  }

  // Generate stable node ID if not set
  if (!config.nodeId) {
    config.nodeId = getStableNodeId();
  }

  logger.info("Cluster configuration loaded", {
    enabled: config.enabled,
    nodeId: config.nodeId,
    role: config.role,
    redis: `${config.redis.host}:${config.redis.port}`,
  });

  cachedConfig = config;
  return config;
}

/**
 * Load config with auto-detection. If `OPENCLAW_CLUSTER_ENABLED` is not explicitly set,
 * this will probe Redis and auto-enable clustering if Redis is reachable.
 * This is the recommended entry point for gateway startup.
 */
export async function loadClusterConfigWithAutoDetect(): Promise<ClusterConfig> {
  const config = loadClusterConfig();

  // If explicitly disabled via env var, respect that
  const envEnabled = process.env.OPENCLAW_CLUSTER_ENABLED;
  if (envEnabled === "false") {
    logger.info("Clustering explicitly disabled via OPENCLAW_CLUSTER_ENABLED=false");
    return config;
  }

  // If already explicitly enabled, no need to auto-detect
  if (config.enabled) {
    // Persist state so future boots know Redis was used
    writeRedisState({
      lastConnectedAt: Date.now(),
      host: config.redis.host,
      port: config.redis.port,
      dockerManaged: false,
    });
    return config;
  }

  // Auto-detect: probe Redis
  logger.info(`Auto-detecting Redis at ${config.redis.host}:${config.redis.port}...`);
  let redisAvailable = await autoDetectRedis(config.redis.host, config.redis.port);

  // If Redis is not directly reachable, try to auto-start via Docker
  if (!redisAvailable) {
    const autoStartEnv = process.env.OPENCLAW_REDIS_AUTOSTART;
    // Auto-start is opt-IN: only start a Docker Redis if explicitly requested.
    // Previously defaulted to true, which conflicted with system Redis instances
    // (e.g. OpenClawCompanion also uses localhost:6379) and caused gateway crashes.
    const shouldAutoStart = autoStartEnv === "true";

    if (shouldAutoStart) {
      const dockerStarted = await ensureRedisViaDocker(
        config.redis.host,
        config.redis.port,
      );
      if (dockerStarted) {
        redisAvailable = true;
      }
    }
  }

  if (redisAvailable) {
    logger.info("Redis detected — enabling clustering automatically");
    config.enabled = true;
    config.clusterMode = "redis"; // explicitly lock to redis mode

    // Re-validate with clustering enabled
    validateConfig(config);

    // Update cache
    cachedConfig = config;

    // Persist state for future boots
    writeRedisState({
      lastConnectedAt: Date.now(),
      host: config.redis.host,
      port: config.redis.port,
      dockerManaged: true,
    });
  } else {
    // If Redis is not available, default to pure P2P mesh clustering over LAN
    // instead of entirely disabling the cluster.
    logger.info("Redis not available — falling back to P2P mesh clustering");
    config.enabled = true;
    config.clusterMode = "p2p";
    
    validateConfig(config);
    cachedConfig = config;
  }
  
  // Always start the resilience engine
  resilienceEngine.start();

  return config;
}

/**
 * Invalidate the cached config. Called when environment changes or for testing.
 */
export function invalidateClusterConfigCache(): void {
  cachedConfig = null;
}

function loadFromEnvironment(config: ClusterConfig): void {
  // Cluster settings
  if (process.env.OPENCLAW_CLUSTER_ENABLED !== undefined) {
    config.enabled = process.env.OPENCLAW_CLUSTER_ENABLED === "true";
  }

  if (process.env.OPENCLAW_CLUSTER_NODE_ID) {
    config.nodeId = process.env.OPENCLAW_CLUSTER_NODE_ID;
  }

  if (process.env.OPENCLAW_CLUSTER_ROLE) {
    const role = process.env.OPENCLAW_CLUSTER_ROLE.toLowerCase();
    if (role === "primary" || role === "standby" || role === "auto") {
      config.role = role;
    }
  }

  // Cluster mode (redis / p2p / auto)
  if (process.env.OPENCLAW_CLUSTER_MODE) {
    const mode = process.env.OPENCLAW_CLUSTER_MODE.toLowerCase();
    if (mode === "redis" || mode === "p2p" || mode === "auto") {
      config.clusterMode = mode;
    }
  }

  // Tailscale peer discovery
  if (process.env.OPENCLAW_TAILSCALE_PEERS) {
    config.discovery.tailscalePeers = process.env.OPENCLAW_TAILSCALE_PEERS.split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    // Auto-switch discovery mode when peers are configured
    if (config.discovery.tailscalePeers.length > 0 && config.discovery.mode === "multicast") {
      config.discovery.mode = "both";
    }
    // Auto-enable clustering when Tailscale peers are configured
    if (config.discovery.tailscalePeers.length > 0 && !config.enabled) {
      config.enabled = true;
      logger.info("Auto-enabling clustering: Tailscale peers configured", {
        peers: config.discovery.tailscalePeers,
      });
    }
  }

  if (process.env.OPENCLAW_DISCOVERY_MODE) {
    const dMode = process.env.OPENCLAW_DISCOVERY_MODE.toLowerCase();
    if (dMode === "multicast" || dMode === "tailscale" || dMode === "both") {
      config.discovery.mode = dMode;
    }
  }

  // Redis settings — URL takes precedence over individual fields
  if (process.env.OPENCLAW_REDIS_URL) {
    try {
      const parsed = new URL(process.env.OPENCLAW_REDIS_URL);
      config.redis.host = parsed.hostname || "localhost";
      config.redis.port = parsed.port ? parseInt(parsed.port, 10) : 6379;
      if (parsed.password) {
        config.redis.password = decodeURIComponent(parsed.password);
      }
      if (parsed.pathname && parsed.pathname.length > 1) {
        config.redis.db = parseInt(parsed.pathname.slice(1), 10) || 0;
      }
      config.redis.tls = parsed.protocol === "rediss:";
      logger.info("Redis configured from OPENCLAW_REDIS_URL", {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
        tls: config.redis.tls,
      });
    } catch (e) {
      logger.warn("Invalid OPENCLAW_REDIS_URL, falling back to individual env vars", {
        url: process.env.OPENCLAW_REDIS_URL,
        error: String(e),
      });
    }
  }

  if (process.env.OPENCLAW_REDIS_HOST) {
    config.redis.host = process.env.OPENCLAW_REDIS_HOST;
  }

  if (process.env.OPENCLAW_REDIS_PORT) {
    config.redis.port = parseInt(process.env.OPENCLAW_REDIS_PORT, 10);
  }

  if (process.env.OPENCLAW_REDIS_PASSWORD) {
    config.redis.password = process.env.OPENCLAW_REDIS_PASSWORD;
  }

  if (process.env.OPENCLAW_REDIS_DB) {
    config.redis.db = parseInt(process.env.OPENCLAW_REDIS_DB, 10);
  }

  if (process.env.OPENCLAW_REDIS_TLS !== undefined) {
    config.redis.tls = process.env.OPENCLAW_REDIS_TLS === "true";
  }

  // Cluster secret
  if (process.env.OPENCLAW_CLUSTER_SECRET) {
    config.encryption.clusterSecret = process.env.OPENCLAW_CLUSTER_SECRET;
  }

  // Auto-failover
  if (process.env.OPENCLAW_AUTO_FAILOVER !== undefined) {
    config.failover.autoFailover = process.env.OPENCLAW_AUTO_FAILOVER === "true";
  }
}

function loadFromFile(config: ClusterConfig, configPath: string): void {
  try {
    // For now, we'll just log that we would load from file
    // In a real implementation, we'd use a YAML parser
    logger.info("Config file support not yet implemented", { configPath });
  } catch (error) {
    logger.warn("Failed to load config file", { configPath, error });
  }
}

function validateConfig(config: ClusterConfig): void {
  if (config.enabled) {
    // In P2P mode, Redis is not required
    const needsRedis =
      config.clusterMode === "redis" ||
      (config.clusterMode === "auto" && config.discovery.tailscalePeers.length === 0);

    if (needsRedis) {
      if (!config.redis.host) {
        throw new Error("Redis host is required when cluster is enabled in redis mode");
      }
      if (config.redis.port < 1 || config.redis.port > 65535) {
        throw new Error("Invalid Redis port");
      }
    }

    // Validate cluster secret
    if (!config.encryption.clusterSecret) {
      logger.warn("Cluster secret not set. Using default stable secret.");
      config.encryption.clusterSecret = "hoc_default_cluster_secret_for_auto_discovery";
    }

    if (config.encryption.clusterSecret.length < 32) {
      if (config.encryption.clusterSecret !== "hoc_default_cluster_secret_for_auto_discovery") {
        throw new Error("Cluster secret must be at least 32 characters");
      }
    }

    // Validate intervals
    if (config.health.heartbeatInterval < 1) {
      throw new Error("Heartbeat interval must be at least 1 second");
    }

    if (config.health.failureTimeout < config.health.heartbeatInterval * 2) {
      throw new Error("Failure timeout must be at least 2x heartbeat interval");
    }
  }
}

/**
 * Generate a stable node ID per process — cached so it's the same on every call.
 */
export function getStableNodeId(): string {
  if (cachedNodeId) {
    return cachedNodeId;
  }
  cachedNodeId = generateNodeId();
  return cachedNodeId;
}

function generateNodeId(): string {
  const hostname = process.env.HOSTNAME || "unknown";
  const platform = process.platform;
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);

  return `${platform}-${hostname}-${timestamp}-${random}`;
}

/**
 * Check if clustering is enabled. Uses cached config — does NOT re-parse every call.
 */
export function isClusterEnabled(): boolean {
  const config = loadClusterConfig();
  return config.enabled;
}
