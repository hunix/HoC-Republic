/**
 * Node Config Store
 *
 * Persistent configuration for a HoC compute node.
 * Reads/writes `node-config.json` in the HoC state directory.
 * Uses atomic writes (write-to-tmp then rename) for safety.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("node-ui:config");

// ─── Types ───────────────────────────────────────────────────────

export interface NodeConfig {
  /** Human-readable display name for this node */
  displayName: string;
  /** Unique stable node ID */
  nodeId: string;
  /** Gateway connection */
  gateway: {
    /** Gateway URL (e.g. "http://192.168.1.100:3000") */
    url: string;
    /** Auth token received from pairing or manually entered */
    token: string;
    /** Whether to auto-connect on startup */
    autoConnect: boolean;
    /** Pairing state */
    pairingState: "unpaired" | "pending" | "paired" | "rejected";
    /** When pairing was last attempted */
    lastPairingAttempt?: string;
  };
  /** Node tags (for scheduler placement) */
  tags: string[];
  /** Plugin affinities */
  pluginAffinities: string[];
  /** Enabled plugin IDs */
  enabledPlugins: string[];
  /** Node UI settings */
  ui: {
    port: number;
    /** Bind address (default "0.0.0.0") */
    bindAddress: string;
  };
  /** Cluster settings */
  cluster: {
    /** Redis URL (optional — for nodes that also connect to cluster Redis) */
    redisUrl?: string;
  };
  /** Windows companion service */
  windows: {
    /** Companion service enabled */
    enabled: boolean;
    /** Companion service URL */
    serviceUrl: string;
  };
  /** First setup timestamp */
  createdAt: string;
  /** Last modified timestamp */
  updatedAt: string;
}

// ─── Defaults ────────────────────────────────────────────────────

function generateNodeId(): string {
  const hostname = os.hostname();
  const rand = crypto.randomBytes(4).toString("hex");
  return `node-${hostname}-${rand}`;
}

function defaultConfig(): NodeConfig {
  const now = new Date().toISOString();
  return {
    displayName: `${os.hostname()} Node`,
    nodeId: generateNodeId(),
    gateway: {
      url: "",
      token: "",
      autoConnect: true,
      pairingState: "unpaired",
    },
    tags: [],
    pluginAffinities: [],
    enabledPlugins: [],
    ui: {
      port: parseInt(process.env.HOC_NODE_UI_PORT ?? "3001", 10),
      bindAddress: "0.0.0.0",
    },
    cluster: {},
    windows: {
      enabled: process.platform === "win32",
      serviceUrl: "http://localhost:9182",
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Store ───────────────────────────────────────────────────────

function resolveConfigDir(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".config", "openclaw");
  return path.join(stateDir, "node");
}

function resolveConfigPath(): string {
  return path.join(resolveConfigDir(), "node-config.json");
}

let cached: NodeConfig | null = null;

export function loadNodeConfig(): NodeConfig {
  if (cached) {
    return cached;
  }

  const configPath = resolveConfigPath();

  if (!fs.existsSync(configPath)) {
    logger.info("No node config found, creating defaults", { path: configPath });
    const config = defaultConfig();
    saveNodeConfig(config);
    return config;
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<NodeConfig>;
    // Merge with defaults to fill any missing fields
    const config = { ...defaultConfig(), ...parsed };
    cached = config;
    logger.info("Node config loaded", { nodeId: config.nodeId, displayName: config.displayName });
    return config;
  } catch (err) {
    logger.error("Failed to read node config, using defaults", { error: String(err) });
    const config = defaultConfig();
    saveNodeConfig(config);
    return config;
  }
}

export function saveNodeConfig(config: NodeConfig): void {
  config.updatedAt = new Date().toISOString();

  const dir = resolveConfigDir();
  fs.mkdirSync(dir, { recursive: true });

  const configPath = resolveConfigPath();
  const tmpPath = `${configPath}.${process.pid}.tmp`;
  const json = JSON.stringify(config, null, 2) + "\n";

  fs.writeFileSync(tmpPath, json, "utf-8");

  try {
    fs.renameSync(tmpPath, configPath);
  } catch {
    // Windows fallback
    fs.copyFileSync(tmpPath, configPath);
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* best-effort */
    }
  }

  cached = config;
  logger.info("Node config saved", { nodeId: config.nodeId });
}

export function updateNodeConfig(patch: Partial<NodeConfig>): NodeConfig {
  const current = loadNodeConfig();
  const updated = { ...current, ...patch };

  // Deep merge nested objects
  if (patch.gateway) {
    updated.gateway = { ...current.gateway, ...patch.gateway };
  }
  if (patch.ui) {
    updated.ui = { ...current.ui, ...patch.ui };
  }
  if (patch.cluster) {
    updated.cluster = { ...current.cluster, ...patch.cluster };
  }
  if (patch.windows) {
    updated.windows = { ...current.windows, ...patch.windows };
  }

  saveNodeConfig(updated);
  return updated;
}

export function clearConfigCache(): void {
  cached = null;
}
