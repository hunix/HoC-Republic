/**
 * Gateway Cluster Manager
 * Handles leader election, health monitoring, and automatic failover
 *
 * Fixes applied:
 * - `stop()` now disconnects Redis state store
 * - CPU measurement uses delta snapshots (not cumulative totals)
 * - Failover delay has random jitter (0–2s) to prevent thundering herd
 * - `autoFailover` flag is tracked locally instead of mutating config
 * - `emit()` publishes to Redis with `.catch()` to prevent unhandled rejection
 * - Removed duplicate process signal handlers (cleanup handled by caller)
 * - Added `resetClusterManager()` for clean shutdown
 */

import os from "node:os";
import { ErrorCategory, ErrorSeverity, handleError } from "../infra/error-handler.js";
import { createSubsystemLogger } from "../logging.js";
import { loadClusterConfig, type ClusterConfig } from "./cluster-config.js";
import { detectNodeCapabilities, type NodeCapabilities } from "./node-capabilities.js";
import { getStateStore, type GatewayInfo } from "./redis-state-store.js";

const logger = createSubsystemLogger("cluster:manager");

export type GatewayRole = "primary" | "standby";
export type ClusterEvent =
  | "primary-elected"
  | "primary-lost"
  | "failover"
  | "gateway-joined"
  | "gateway-left";

export interface ClusterEventData {
  event: ClusterEvent;
  gatewayId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export class GatewayClusterManager {
  private config: ClusterConfig;
  private gatewayId: string;
  private role: GatewayRole = "standby";
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private leaderElectionTimer: NodeJS.Timeout | null = null;
  private running = false;
  private eventHandlers: Map<ClusterEvent, Array<(data: ClusterEventData) => void>> = new Map();
  /** Track failover throttle locally (not on the config object) */
  private autoFailoverDisabled = false;
  private failoverCount = 0;
  private lastFailoverTime = 0;

  /** Previous CPU snapshot for delta-based CPU usage calculation */
  private prevCpuIdle = 0;
  private prevCpuTotal = 0;

  /** Cached hardware capabilities for this node */
  private capabilities: NodeCapabilities | null = null;
  /** Boot timestamp for startup grace period on health checks */
  private startedAtMs = Date.now();

  constructor() {
    this.config = loadClusterConfig();
    this.gatewayId = this.config.nodeId;
    this.takeCpuSnapshot(); // Prime the initial snapshot
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Cluster manager already running");
      return;
    }

    logger.info("Starting cluster manager", {
      gatewayId: this.gatewayId,
      role: this.config.role,
    });

    try {
      // Connect to Redis
      const stateStore = getStateStore({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db,
        tls: this.config.redis.tls,
      });

      await stateStore.connect();

      // Detect hardware capabilities
      this.capabilities = await detectNodeCapabilities();

      // Register this gateway (with capabilities)
      await this.registerGateway();

      // Subscribe to cluster events
      await this.subscribeToClusterEvents();

      // Start health monitoring
      this.startHealthMonitoring();

      // Start leader election if role is auto
      if (this.config.role === "auto") {
        this.startLeaderElection();
      } else if (this.config.role === "primary") {
        await this.becomePrimary();
      } else {
        this.role = "standby";
        logger.info("Starting as standby gateway");
      }

      this.running = true;
      logger.info("Cluster manager started successfully");
    } catch (error) {
      // Redis connection failure is non-fatal: log a warning and run standalone.
      // Previously this was ErrorSeverity.FATAL which rethrew and crashed the gateway
      // whenever Redis was unavailable or being used by another process (e.g. OpenClawCompanion).
      handleError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.WARNING,
        component: "cluster-manager",
        operation: "start",
      });
      logger.warn(
        "Cluster manager failed to connect to Redis — running in standalone mode. " +
        "To disable clustering entirely: set OPENCLAW_CLUSTER_ENABLED=false",
      );
      // Don't throw — gateway continues running without cluster coordination
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info("Stopping cluster manager");

    // Stop all timers
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.leaderElectionTimer) {
      clearInterval(this.leaderElectionTimer);
      this.leaderElectionTimer = null;
    }

    try {
      const stateStore = getStateStore();

      // Release primary lock if we're primary
      if (this.role === "primary") {
        await stateStore.releasePrimaryLock(this.gatewayId);
      }

      // Unregister gateway
      await stateStore.removeGateway(this.gatewayId);

      // Disconnect Redis (fixes resource leak)
      await stateStore.disconnect();
    } catch (error) {
      logger.warn(`Error during cluster manager stop: ${String(error)}`);
    }

    this.running = false;
    logger.info("Cluster manager stopped");
  }

  getRole(): GatewayRole {
    return this.role;
  }

  getGatewayId(): string {
    return this.gatewayId;
  }

  isPrimary(): boolean {
    return this.role === "primary";
  }

  on(event: ClusterEvent, handler: (data: ClusterEventData) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: ClusterEvent, metadata?: Record<string, unknown>): void {
    const data: ClusterEventData = {
      event,
      gatewayId: this.gatewayId,
      timestamp: Date.now(),
      metadata,
    };

    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          handleError(error, {
            category: ErrorCategory.SYSTEM,
            severity: ErrorSeverity.ERROR,
            component: "cluster-manager",
            operation: "event-handler",
            metadata: { event, data },
          });
        }
      }
    }

    // Publish to Redis for other gateways (with .catch to prevent unhandled rejection)
    try {
      const stateStore = getStateStore();
      stateStore.publish("cluster:events", data).catch((err) => {
        logger.warn(`Failed to publish cluster event: ${String(err)}`);
      });
    } catch {
      // State store not initialized — skip publish
    }
  }

  private async registerGateway(): Promise<void> {
    const stateStore = getStateStore();

    const gateway: GatewayInfo = {
      id: this.gatewayId,
      host: this.getHostname(),
      port: this.getPort(),
      role: this.role,
      health: await this.collectHealthMetrics(),
      capabilities: this.capabilities ?? undefined,
      activePlugins: [],
      startedAt: Date.now(),
    };

    await stateStore.registerGateway(gateway);
    this.emit("gateway-joined");
  }

  private async subscribeToClusterEvents(): Promise<void> {
    const stateStore = getStateStore();

    await stateStore.subscribe("cluster:events", (message) => {
      const data = message as ClusterEventData;

      // Ignore our own events
      if (data.gatewayId === this.gatewayId) {
        return;
      }

      logger.info("Cluster event received", { ...data });

      // Handle primary election
      if (data.event === "primary-elected") {
        if (this.role === "primary" && data.gatewayId !== this.gatewayId) {
          // Another gateway became primary, step down
          logger.warn("Another gateway became primary, stepping down", {
            newPrimary: data.gatewayId,
          });
          this.role = "standby";
          this.emit("primary-lost");
        }
      }
    });
  }

  private startHealthMonitoring(): void {
    const interval = this.config.health.heartbeatInterval * 1000;

    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        handleError(error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.ERROR,
          component: "cluster-manager",
          operation: "heartbeat",
        });
      }
    }, interval);

    // Health check timer (check other gateways)
    const checkInterval = this.config.health.checkInterval * 1000;

    this.healthCheckTimer = setInterval(async () => {
      try {
        await this.checkGatewayHealth();
      } catch (error) {
        handleError(error, {
          category: ErrorCategory.SYSTEM,
          severity: ErrorSeverity.ERROR,
          component: "cluster-manager",
          operation: "health-check",
        });
      }
    }, checkInterval);
  }

  private async sendHeartbeat(): Promise<void> {
    const stateStore = getStateStore();
    const health = await this.collectHealthMetrics();

    await stateStore.updateGatewayHealth(this.gatewayId, health);

    // Renew primary lock if we're primary
    if (this.role === "primary") {
      const renewed = await stateStore.renewPrimaryLock(
        this.gatewayId,
        this.config.health.failureTimeout,
      );

      if (!renewed) {
        logger.error("Failed to renew primary lock, stepping down");
        this.role = "standby";
        this.emit("primary-lost");
      }
    }
  }

  private async checkGatewayHealth(): Promise<void> {
    const stateStore = getStateStore();
    const gateways = await stateStore.getAllGateways();
    const now = Date.now();
    const timeout = this.config.health.failureTimeout * 1000;

    // Grace period: don't flag failures during the first 15s after boot
    // (heartbeats haven't stabilized yet)
    const uptime = now - (this.startedAtMs ?? now);
    if (uptime < 15_000) {
      return;
    }

    for (const gateway of gateways) {
      // Never flag ourselves as failed (we just sent a heartbeat)
      if (gateway.id === this.gatewayId) {
        continue;
      }

      const timeSinceHeartbeat = now - gateway.health.lastHeartbeat;

      if (timeSinceHeartbeat > timeout) {
        logger.warn("Gateway failed health check", {
          gatewayId: gateway.id,
          timeSinceHeartbeat,
          timeout,
        });

        // Remove failed gateway
        await stateStore.removeGateway(gateway.id);
        this.emit("gateway-left", { failedGateway: gateway.id });

        // Trigger failover if it was primary
        if (gateway.role === "primary") {
          await this.handlePrimaryFailure();
        }
      }
    }
  }

  private async handlePrimaryFailure(): Promise<void> {
    if (!this.config.failover.autoFailover || this.autoFailoverDisabled) {
      logger.warn("Auto-failover disabled, waiting for manual intervention");
      return;
    }

    // Check failover rate limit
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;

    if (this.lastFailoverTime > hourAgo) {
      this.failoverCount++;

      if (this.failoverCount > this.config.failover.maxFailovers) {
        logger.error("Too many failovers in the last hour, disabling auto-failover");
        // Track locally — do NOT mutate this.config (that's a side effect)
        this.autoFailoverDisabled = true;
        return;
      }
    } else {
      this.failoverCount = 1;
    }

    this.lastFailoverTime = now;

    logger.warn("Primary gateway failed, initiating failover");

    // Wait for failover delay + random jitter (0–2s) to prevent thundering herd
    const jitterMs = Math.floor(Math.random() * 2000);
    const delayMs = this.config.failover.failoverDelay * 1000 + jitterMs;
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    // Try to become primary
    await this.tryBecomePrimary();
  }

  private startLeaderElection(): void {
    // Try to become primary immediately
    void this.tryBecomePrimary();

    // Retry every heartbeat interval
    const interval = this.config.health.heartbeatInterval * 1000;

    this.leaderElectionTimer = setInterval(async () => {
      if (this.role === "standby") {
        await this.tryBecomePrimary();
      }
    }, interval);
  }

  private async tryBecomePrimary(): Promise<void> {
    try {
      const stateStore = getStateStore();

      const acquired = await stateStore.tryAcquirePrimaryLock(
        this.gatewayId,
        this.config.health.failureTimeout,
      );

      if (acquired) {
        await this.becomePrimary();
      }
    } catch (error) {
      logger.warn(`Leader election attempt failed: ${String(error)}`);
    }
  }

  private async becomePrimary(): Promise<void> {
    logger.info("Becoming primary gateway");

    this.role = "primary";

    // Update gateway info
    try {
      const stateStore = getStateStore();
      const gateway = await stateStore.getGateway(this.gatewayId);

      if (gateway) {
        gateway.role = "primary";
        await stateStore.registerGateway(gateway);
      }
    } catch (error) {
      logger.warn(`Failed to update gateway role in Redis: ${String(error)}`);
    }

    this.emit("primary-elected");
    this.emit("failover", { previousRole: "standby", newRole: "primary" });
  }

  /**
   * Take a CPU snapshot for delta measurement.
   * Must be called before collectHealthMetrics() to get accurate deltas.
   */
  private takeCpuSnapshot(): void {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
      for (const type in cpu.times) {
        total += cpu.times[type as keyof typeof cpu.times];
      }
      idle += cpu.times.idle;
    }
    this.prevCpuIdle = idle;
    this.prevCpuTotal = total;
  }

  /**
   * Collect health metrics using delta-based CPU measurement.
   * The old implementation used cumulative totals since boot, which always
   * reported ~50%. This version computes the delta since the last snapshot.
   */
  private async collectHealthMetrics(): Promise<GatewayInfo["health"]> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // Delta-based CPU calculation
    let currentIdle = 0;
    let currentTotal = 0;
    for (const cpu of os.cpus()) {
      for (const type in cpu.times) {
        currentTotal += cpu.times[type as keyof typeof cpu.times];
      }
      currentIdle += cpu.times.idle;
    }

    const idleDelta = currentIdle - this.prevCpuIdle;
    const totalDelta = currentTotal - this.prevCpuTotal;
    const cpuUsage = totalDelta > 0 ? 100 - (100 * idleDelta) / totalDelta : 0;

    // Update snapshot for next call
    this.prevCpuIdle = currentIdle;
    this.prevCpuTotal = currentTotal;

    const memoryUsage = ((totalMem - freeMem) / totalMem) * 100;

    return {
      cpu: Math.round(cpuUsage * 100) / 100,
      memory: Math.round(memoryUsage * 100) / 100,
      responseTime: 0, // Will be measured by actual requests
      lastHeartbeat: Date.now(),
    };
  }

  private getHostname(): string {
    return os.hostname();
  }

  private getPort(): number {
    // Get from environment or default
    const port = process.env.OPENCLAW_PORT || process.env.PORT || "18789";
    return parseInt(port, 10);
  }
}

// Singleton instance
let clusterManager: GatewayClusterManager | null = null;

export function getClusterManager(): GatewayClusterManager {
  if (!clusterManager) {
    clusterManager = new GatewayClusterManager();
  }
  return clusterManager;
}

/**
 * Reset the singleton (used during shutdown).
 * Caller is responsible for calling stop() before this.
 */
export function resetClusterManager(): void {
  clusterManager = null;
}
