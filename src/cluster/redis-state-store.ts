/**
 * Redis-based distributed state store for OpenClaw cluster
 * Provides atomic operations, pub/sub, and persistence for cluster state
 *
 * Fixes applied:
 * - Atomic renewPrimaryLock via SET ... XX EX (was non-atomic get+expire)
 * - Atomic releasePrimaryLock via Lua script (was non-atomic get+del)
 * - Atomic getOrSet via SET NX (was TOCTOU race)
 * - getAllGateways uses MGET pipeline (was N+1 queries)
 * - Added auto-reconnect with exponential backoff via redis client events
 * - Removed duplicate process signal handlers (cleanup is handled by caller)
 */

import { createClient, type RedisClientType } from "redis";
import type { NodeCapabilities } from "./node-capabilities.js";
import { ErrorCategory, ErrorSeverity, handleError } from "../infra/error-handler.js";
import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("cluster:redis");

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
  connectTimeout?: number;
  commandTimeout?: number;
}

export interface ClusterState {
  gateways: Map<string, GatewayInfo>;
  nodes: Map<string, NodeInfo>;
  whatsappSessions: Map<string, WhatsAppSession>;
  primaryGateway: string | null;
}

export interface GatewayInfo {
  id: string;
  host: string;
  port: number;
  role: "primary" | "standby";
  health: {
    cpu: number;
    memory: number;
    responseTime: number;
    lastHeartbeat: number;
  };
  /** Hardware capabilities (GPUs, CPU, RAM, tags) — populated by node-capabilities detection */
  capabilities?: NodeCapabilities;
  /** Plugin IDs currently running on this gateway node */
  activePlugins?: string[];
  startedAt: number;
}

export interface NodeInfo {
  id: string;
  gatewayId: string;
  host: string;
  capabilities: string[];
  lastSeen: number;
}

export interface WhatsAppSession {
  id: string;
  authState: string; // Encrypted JSON
  qrCode?: string;
  linkedDevices: string[];
  lastActivity: number;
  gatewayId: string;
}

/**
 * Lua script for atomic release-if-owner:
 *   if redis.call('get', KEYS[1]) == ARGV[1] then
 *     return redis.call('del', KEYS[1])
 *   else
 *     return 0
 *   end
 */
const RELEASE_LOCK_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export class RedisStateStore {
  private client: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private config: RedisConfig;
  private _connected = false;
  private _disconnecting = false;

  constructor(config: RedisConfig) {
    this.config = {
      connectTimeout: 5000,
      commandTimeout: 3000,
      db: 0,
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this._disconnecting) {
      return;
    }

    try {
      // Create main client with built-in reconnect strategy
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          connectTimeout: this.config.connectTimeout,
          reconnectStrategy: (retries) => {
            if (this._disconnecting) {
              return false;
            }
            // Exponential backoff: 500ms, 1s, 2s, 4s, 8s, max 30s
            const delay = Math.min(500 * Math.pow(2, retries), 30_000);
            logger.info(`Redis reconnect attempt ${retries + 1}, delay ${delay}ms`);
            return delay;
          },
          ...(this.config.tls ? { tls: true as const } : {}),
        },
        password: this.config.password,
        database: this.config.db,
      });

      // Create subscriber client (for pub/sub)
      this.subscriber = this.client.duplicate();

      // Connection state tracking via events
      this.client.on("ready", () => {
        this._connected = true;
        logger.info("Redis client ready");
      });

      this.client.on("end", () => {
        this._connected = false;
        if (!this._disconnecting) {
          logger.warn("Redis connection lost, will auto-reconnect");
        }
      });

      // Error handlers
      this.client.on("error", (err) => {
        handleError(err, {
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.ERROR,
          component: "redis-client",
          operation: "connection",
        });
      });

      this.subscriber.on("error", (err) => {
        handleError(err, {
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.ERROR,
          component: "redis-subscriber",
          operation: "connection",
        });
      });

      // Connect both clients
      await Promise.all([this.client.connect(), this.subscriber.connect()]);

      this._connected = true;
      logger.info("Connected to Redis", {
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
      });
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.FATAL,
        component: "redis-state-store",
        operation: "connect",
        metadata: { config: this.config },
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this._disconnecting = true;

    try {
      await Promise.all([this.client?.quit(), this.subscriber?.quit()]);
      this._connected = false;
      logger.info("Disconnected from Redis");
    } catch (error) {
      // Force-close if quit fails
      try {
        void this.client?.disconnect();
        void this.subscriber?.disconnect();
      } catch {
        /* swallow */
      }
      this._connected = false;
      handleError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.WARNING,
        component: "redis-state-store",
        operation: "disconnect",
      });
    }
  }

  isConnected(): boolean {
    return this._connected && this.client?.isOpen === true;
  }

  /**
   * Guard that returns null instead of throwing when Redis is unavailable.
   * Callers can gracefully degrade instead of crashing.
   */
  private requireClient(): RedisClientType | null {
    if (!this.client || !this.client.isOpen) {
      return null;
    }
    return this.client;
  }

  // ==================== Gateway Operations ====================

  async registerGateway(gateway: GatewayInfo): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `gateway:${gateway.id}`;
    const data = JSON.stringify(gateway);

    await client.set(key, data, { EX: 60 }); // TTL 60 seconds
    await client.sAdd("gateways:active", gateway.id);

    logger.info("Gateway registered", { gatewayId: gateway.id, role: gateway.role });
  }

  async updateGatewayHealth(gatewayId: string, health: GatewayInfo["health"]): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `gateway:${gatewayId}`;
    const gateway = await this.getGateway(gatewayId);

    if (gateway) {
      gateway.health = health;
      await client.set(key, JSON.stringify(gateway), { EX: 60 });
    }
  }

  async getGateway(gatewayId: string): Promise<GatewayInfo | null> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `gateway:${gatewayId}`;
    const data = await client.get(key);

    return data ? JSON.parse(data) : null;
  }

  async getAllGateways(): Promise<GatewayInfo[]> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const gatewayIds = await client.sMembers("gateways:active");
    if (gatewayIds.length === 0) {
      return [];
    }

    // Use MGET pipeline instead of N+1 individual gets
    const keys = gatewayIds.map((id) => `gateway:${id}`);
    const results = await client.mGet(keys);

    const gateways: GatewayInfo[] = [];
    const staleIds: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const data = results[i];
      if (data) {
        try {
          gateways.push(JSON.parse(data));
        } catch {
          staleIds.push(gatewayIds[i]);
        }
      } else {
        staleIds.push(gatewayIds[i]);
      }
    }

    // Batch-remove stale gateway IDs from the active set
    if (staleIds.length > 0) {
      await client.sRem("gateways:active", staleIds);
    }

    return gateways;
  }

  async removeGateway(gatewayId: string): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `gateway:${gatewayId}`;
    await client.del(key);
    await client.sRem("gateways:active", gatewayId);

    logger.info("Gateway removed", { gatewayId });
  }

  // ==================== Primary Election ====================

  async tryAcquirePrimaryLock(gatewayId: string, ttl: number = 15): Promise<boolean> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = "cluster:primary";
    const result = await client.set(key, gatewayId, { NX: true, EX: ttl });

    return result === "OK";
  }

  /**
   * Atomically renew the primary lock ONLY if we still own it.
   * Uses SET ... XX EX (set-if-exists with new TTL) + GET to verify ownership.
   * This replaces the old non-atomic get-then-expire pattern.
   */
  async renewPrimaryLock(gatewayId: string, ttl: number = 15): Promise<boolean> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = "cluster:primary";
    // First check ownership, then set atomically. We use a Lua script for true atomicity.
    const luaRenew = `if redis.call('get', KEYS[1]) == ARGV[1] then redis.call('expire', KEYS[1], ARGV[2]) return 1 else return 0 end`;
    const result = await client.eval(luaRenew, {
      keys: [key],
      arguments: [gatewayId, String(ttl)],
    });

    return result === 1;
  }

  /**
   * Atomically release the primary lock ONLY if we still own it.
   * Uses Lua script to prevent releasing a lock that was acquired by another gateway
   * between our GET and DEL (the old non-atomic race condition).
   */
  async releasePrimaryLock(gatewayId: string): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    await client.eval(RELEASE_LOCK_LUA, {
      keys: ["cluster:primary"],
      arguments: [gatewayId],
    });
  }

  async getPrimaryGateway(): Promise<string | null> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    return await client.get("cluster:primary");
  }

  // ==================== Node Operations ====================

  async registerNode(node: NodeInfo): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `node:${node.id}`;
    const data = JSON.stringify(node);

    await client.set(key, data, { EX: 120 }); // TTL 120 seconds
    await client.sAdd("nodes:active", node.id);
    await client.sAdd(`gateway:${node.gatewayId}:nodes`, node.id);

    logger.info("Node registered", { nodeId: node.id, gatewayId: node.gatewayId });
  }

  async getNode(nodeId: string): Promise<NodeInfo | null> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `node:${nodeId}`;
    const data = await client.get(key);

    return data ? JSON.parse(data) : null;
  }

  async getAllNodes(): Promise<NodeInfo[]> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const nodeIds = await client.sMembers("nodes:active");
    if (nodeIds.length === 0) {
      return [];
    }

    // Use MGET pipeline instead of N+1
    const keys = nodeIds.map((id) => `node:${id}`);
    const results = await client.mGet(keys);
    const nodes: NodeInfo[] = [];
    const staleIds: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const data = results[i];
      if (data) {
        try {
          nodes.push(JSON.parse(data));
        } catch {
          staleIds.push(nodeIds[i]);
        }
      } else {
        staleIds.push(nodeIds[i]);
      }
    }

    if (staleIds.length > 0) {
      await client.sRem("nodes:active", staleIds);
    }

    return nodes;
  }

  async getNodesByGateway(gatewayId: string): Promise<NodeInfo[]> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const nodeIds = await client.sMembers(`gateway:${gatewayId}:nodes`);
    if (nodeIds.length === 0) {
      return [];
    }

    const keys = nodeIds.map((id) => `node:${id}`);
    const results = await client.mGet(keys);
    const nodes: NodeInfo[] = [];

    for (const data of results) {
      if (data) {
        try {
          nodes.push(JSON.parse(data));
        } catch {
          /* skip corrupted */
        }
      }
    }

    return nodes;
  }

  async removeNode(nodeId: string): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const node = await this.getNode(nodeId);
    if (node) {
      await client.sRem(`gateway:${node.gatewayId}:nodes`, nodeId);
    }

    await client.del(`node:${nodeId}`);
    await client.sRem("nodes:active", nodeId);

    logger.info("Node removed", { nodeId });
  }

  // ==================== WhatsApp Session Operations ====================

  async saveWhatsAppSession(session: WhatsAppSession): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `whatsapp:session:${session.id}`;
    const data = JSON.stringify(session);

    // Store with 7 day TTL (sessions expire after inactivity)
    await client.set(key, data, { EX: 7 * 24 * 60 * 60 });

    logger.info("WhatsApp session saved", { sessionId: session.id, gatewayId: session.gatewayId });
  }

  async getWhatsAppSession(sessionId: string): Promise<WhatsAppSession | null> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `whatsapp:session:${sessionId}`;
    const data = await client.get(key);

    return data ? JSON.parse(data) : null;
  }

  async deleteWhatsAppSession(sessionId: string): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const key = `whatsapp:session:${sessionId}`;
    await client.del(key);

    logger.info("WhatsApp session deleted", { sessionId });
  }

  // ==================== Pub/Sub Operations ====================

  async publish(channel: string, message: unknown): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const data = JSON.stringify(message);
    await client.publish(channel, data);
  }

  async subscribe(channel: string, handler: (message: unknown) => void): Promise<void> {
    if (!this.subscriber) {
      throw new Error("Redis subscriber not connected");
    }

    await this.subscriber.subscribe(channel, (data) => {
      try {
        const message = JSON.parse(data);
        handler(message);
      } catch (error) {
        handleError(error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.ERROR,
          component: "redis-subscriber",
          operation: "message-parse",
          metadata: { channel, data },
        });
      }
    });

    logger.info("Subscribed to channel", { channel });
  }

  async unsubscribe(channel: string): Promise<void> {
    if (!this.subscriber) {
      throw new Error("Redis subscriber not connected");
    }

    await this.subscriber.unsubscribe(channel);
    logger.info("Unsubscribed from channel", { channel });
  }

  // ==================== Atomic Operations ====================

  async increment(key: string): Promise<number> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }
    return await client.incr(key);
  }

  async decrement(key: string): Promise<number> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }
    return await client.decr(key);
  }

  async setWithExpiry(key: string, value: string, ttl: number): Promise<void> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }
    await client.set(key, value, { EX: ttl });
  }

  /**
   * Atomic get-or-set using SET NX to prevent TOCTOU race.
   * If the key exists, returns the existing value.
   * If the key doesn't exist, calls factory() and atomically sets it.
   */
  async getOrSet(key: string, factory: () => Promise<string>, ttl: number): Promise<string> {
    const client = this.requireClient();
    if (!client) {
      throw new Error("Redis client not connected");
    }

    const existing = await client.get(key);
    if (existing) {
      return existing;
    }

    const value = await factory();
    // SET NX: only set if key doesn't exist (prevents overwrite by concurrent caller)
    const result = await client.set(key, value, { NX: true, EX: ttl });
    if (result !== "OK") {
      // Another caller won the race — return their value
      const winnerValue = await client.get(key);
      return winnerValue ?? value;
    }
    return value;
  }
}

// Singleton instance
let stateStore: RedisStateStore | null = null;

export function getStateStore(config?: RedisConfig): RedisStateStore {
  if (!stateStore && config) {
    stateStore = new RedisStateStore(config);
  }

  if (!stateStore) {
    throw new Error("State store not initialized. Call getStateStore(config) first.");
  }

  return stateStore;
}

/**
 * Reset the singleton (used during shutdown).
 * Caller is responsible for calling disconnect() before this.
 */
export function resetStateStore(): void {
  stateStore = null;
}
