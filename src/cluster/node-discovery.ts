/**
 * Node Discovery and Auto-Reconnection
 * Enables nodes to discover gateways and automatically reconnect on failover
 *
 * Fixes applied:
 * - Replaced fake cryptographic signature with HMAC-SHA256
 * - Added try/catch around addMembership for Windows multi-NIC compatibility
 * - Changed single-callback pattern to array-based listeners
 * - announceGateway now accepts current role instead of hardcoding "standby"
 * - NodeAutoReconnect retries reconnection on failure (3 attempts, exponential backoff)
 * - Config is refreshed when start() is called
 */

import crypto from "node:crypto";
import dgram from "node:dgram";
import os from "node:os";
import { ErrorCategory, ErrorSeverity, handleError } from "../infra/error-handler.js";
import { createSubsystemLogger } from "../logging.js";
import { loadClusterConfig, type ClusterConfig } from "./cluster-config.js";

const logger = createSubsystemLogger("cluster:discovery");

/** Check if an error is a transient network issue that shouldn't be shown to end users */
function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {return false;}
  const code = (err as NodeJS.ErrnoException).code;
  const transientCodes = [
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ECONNRESET",
    "EADDRINUSE",
    "ENETUNREACH",
    "EHOSTUNREACH",
    "EADDRNOTAVAIL",
  ];
  if (code && transientCodes.includes(code)) {return true;}
  return /network|timeout|refused|unreachable/i.test(err.message);
}

export interface GatewayAnnouncement {
  gatewayId: string;
  host: string;
  port: number;
  role: "primary" | "standby";
  timestamp: number;
  signature: string;
}

export interface DiscoveredGateway {
  gatewayId: string;
  url: string;
  role: "primary" | "standby";
  priority: number;
  lastSeen: number;
}

export class NodeDiscovery {
  private config: ClusterConfig;
  private socket: dgram.Socket | null = null;
  private announceTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private tailscaleProbeTimer: NodeJS.Timeout | null = null;
  private discoveredGateways: Map<string, DiscoveredGateway> = new Map();
  private isGateway: boolean;
  private gatewayId: string;
  private gatewayPort: number;
  private running = false;

  /** Array-based listeners (fixes single-callback overwrite issue) */
  private discoveryListeners: Array<(gateway: DiscoveredGateway) => void> = [];
  private primaryChangeListeners: Array<(gateway: DiscoveredGateway) => void> = [];

  /** Current role getter — allows cluster manager to update the announced role */
  private roleGetter: () => "primary" | "standby";

  constructor(
    isGateway: boolean,
    gatewayId?: string,
    gatewayPort?: number,
    roleGetter?: () => "primary" | "standby",
  ) {
    this.config = loadClusterConfig();
    this.isGateway = isGateway;
    this.gatewayId = gatewayId || "";
    this.gatewayPort = gatewayPort || 18789;
    this.roleGetter = roleGetter || (() => "standby");
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn("Discovery already running");
      return;
    }

    // Refresh config from env
    this.config = loadClusterConfig();

    const mode = this.config.discovery.mode;
    logger.info("Starting node discovery", {
      isGateway: this.isGateway,
      mode,
      multicast: `${this.config.discovery.multicastAddress}:${this.config.discovery.multicastPort}`,
      tailscalePeers: this.config.discovery.tailscalePeers,
    });

    // Start multicast discovery (LAN)
    if (mode === "multicast" || mode === "both") {
      await this.startMulticastDiscovery();
    }

    // Start Tailscale HTTP discovery
    if (mode === "tailscale" || mode === "both") {
      this.startTailscaleDiscovery();
    }

    // Start cleanup timer
    this.startCleanup();

    this.running = true;
    logger.info("Node discovery started", { mode });
  }

  /**
   * Start multicast-based discovery (works on LAN, not through Tailscale).
   */
  private async startMulticastDiscovery(): Promise<void> {
    try {
      // Create UDP socket
      this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
      this.socket.on("error", (err) => {
        logger.error("UDP multicast socket error:", { error: err });
      });

      // Bind to multicast port
      this.socket.bind(this.config.discovery.multicastPort, () => {
        if (!this.socket) {
          return;
        }

        // Join multicast group — wrapped in try/catch for Windows multi-NIC compatibility
        try {
          this.socket.addMembership(this.config.discovery.multicastAddress);
          logger.info("Joined multicast group", {
            address: this.config.discovery.multicastAddress,
            port: this.config.discovery.multicastPort,
          });
        } catch (membershipErr) {
          // On Windows with multiple NICs, addMembership can fail.
          // Try binding to all available interfaces as fallback.
          logger.warn(
            `Failed to join multicast group on default interface: ${String(membershipErr)}`,
          );
          let joinedCount = 0;
          const ips = this.getAllLocalIPs();
          for (const ip of ips) {
            try {
              this.socket.addMembership(this.config.discovery.multicastAddress, ip);
              logger.info(`Joined multicast group on interface ${ip}`);
              joinedCount++;
            } catch (fallbackErr) {
              logger.debug(`Could not join multicast on interface ${ip}: ${String(fallbackErr)}`);
            }
          }
          if (joinedCount === 0) {
            logger.warn("Multicast unavailable completely, discovery will be limited");
          }
        }
      });

      // Handle incoming messages
      this.socket.on("message", (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      // Handle errors — transient socket issues are non-fatal, log as warnings
      this.socket.on("error", (err) => {
        handleError(err, {
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.WARNING,
          component: "node-discovery",
          operation: "socket",
          silent: isTransientNetworkError(err),
        });
      });

      // If this is a gateway, start announcing
      if (this.isGateway) {
        this.startAnnouncing();
      }
    } catch (error) {
      // Gracefully fall back to standalone mode instead of crashing
      handleError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.WARNING,
        component: "node-discovery",
        operation: "start-multicast",
      });
      logger.warn("Multicast discovery unavailable, relying on Tailscale discovery");
    }
  }

  /**
   * Start Tailscale-based HTTP unicast discovery.
   * Probes each configured peer IP via HTTP GET to /cluster/announce.
   * This works through Tailscale / WireGuard where multicast cannot.
   */
  private startTailscaleDiscovery(): void {
    const peers = this.config.discovery.tailscalePeers;
    if (peers.length === 0) {
      logger.info("No Tailscale peers configured, skipping HTTP discovery");
      return;
    }

    logger.info("Starting Tailscale HTTP discovery", { peers });

    // Initial probe after short delay
    setTimeout(() => {
      this.probeTailscalePeers().catch(() => {});
    }, 3000);

    // Periodic probing
    const interval = this.config.discovery.announceInterval * 1000;
    this.tailscaleProbeTimer = setInterval(() => {
      this.probeTailscalePeers().catch(() => {});
    }, interval);
  }

  /**
   * Probe all Tailscale peers for gateway announcements.
   */
  private async probeTailscalePeers(): Promise<void> {
    const peers = this.config.discovery.tailscalePeers;
    await Promise.allSettled(peers.map((peerIp) => this.probeTailscalePeer(peerIp)));
  }

  /**
   * Probe a single Tailscale peer via HTTP.
   */
  private async probeTailscalePeer(peerIp: string): Promise<void> {
    try {
      const port = this.gatewayPort;
      const url = `http://${peerIp}:${port}/cluster/announce`;

      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "X-Gateway-Id": this.gatewayId,
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (!resp.ok) {
        return;
      }

      const announcement = (await resp.json()) as GatewayAnnouncement;

      // Ignore our own announcements
      if (this.isGateway && announcement.gatewayId === this.gatewayId) {
        return;
      }

      // Verify signature
      if (!this.verifyAnnouncement(announcement)) {
        logger.warn("Invalid Tailscale peer announcement signature", {
          gatewayId: announcement.gatewayId,
          from: peerIp,
        });
        return;
      }

      // Register the discovered gateway
      const existing = this.discoveredGateways.get(announcement.gatewayId);
      const wasPrimary = existing?.role === "primary";

      const gateway: DiscoveredGateway = {
        gatewayId: announcement.gatewayId,
        url: `http://${peerIp}:${announcement.port}`,
        role: announcement.role,
        priority: announcement.role === "primary" ? 1 : 2,
        lastSeen: Date.now(),
      };

      this.discoveredGateways.set(announcement.gatewayId, gateway);

      logger.info("Tailscale peer discovered", {
        gatewayId: gateway.gatewayId,
        url: gateway.url,
        role: gateway.role,
        via: "tailscale-http",
      });

      // Notify listeners
      for (const listener of this.discoveryListeners) {
        try {
          listener(gateway);
        } catch {
          /* non-fatal */
        }
      }

      if (gateway.role === "primary" && !wasPrimary) {
        for (const listener of this.primaryChangeListeners) {
          try {
            listener(gateway);
          } catch {
            /* non-fatal */
          }
        }
      }
    } catch {
      // Peer offline or unreachable — expected for Tailscale nodes that are sleeping
      logger.debug(`Tailscale peer ${peerIp} unreachable`);
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    logger.info("Stopping node discovery");

    // Stop timers
    if (this.announceTimer) {
      clearInterval(this.announceTimer);
      this.announceTimer = null;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.tailscaleProbeTimer) {
      clearInterval(this.tailscaleProbeTimer);
      this.tailscaleProbeTimer = null;
    }

    // Close socket
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        /* socket may already be closed */
      }
      this.socket = null;
    }

    this.running = false;
    logger.info("Node discovery stopped");
  }

  getDiscoveredGateways(): DiscoveredGateway[] {
    return Array.from(this.discoveredGateways.values()).toSorted((a, b) => a.priority - b.priority);
  }

  getPrimaryGateway(): DiscoveredGateway | null {
    const gateways = this.getDiscoveredGateways();
    return gateways.find((g) => g.role === "primary") || null;
  }

  /** Register a listener for gateway discovery events (supports multiple listeners) */
  onDiscovered(callback: (gateway: DiscoveredGateway) => void): void {
    this.discoveryListeners.push(callback);
  }

  /** Register a listener for primary change events (supports multiple listeners) */
  onPrimaryChange(callback: (gateway: DiscoveredGateway) => void): void {
    this.primaryChangeListeners.push(callback);
  }

  private startAnnouncing(): void {
    const interval = this.config.discovery.announceInterval * 1000;

    // Announce immediately
    void this.announceGateway();

    // Then announce periodically
    this.announceTimer = setInterval(() => {
      void this.announceGateway();
    }, interval);
  }

  private async announceGateway(): Promise<void> {
    if (!this.socket) {
      return;
    }

    try {
      // Get current role from cluster manager instead of hardcoding "standby"
      const currentRole = this.roleGetter();

      const announcement: GatewayAnnouncement = {
        gatewayId: this.gatewayId,
        host: this.getLocalIP(),
        port: this.gatewayPort,
        role: currentRole,
        timestamp: Date.now(),
        signature: this.signAnnouncement(this.gatewayId, currentRole),
      };

      const message = JSON.stringify(announcement);
      const buffer = Buffer.from(message);

      this.socket.send(
        buffer,
        0,
        buffer.length,
        this.config.discovery.multicastPort,
        this.config.discovery.multicastAddress,
        (err) => {
          if (err) {
            handleError(err, {
              category: ErrorCategory.NETWORK,
              severity: ErrorSeverity.WARNING,
              component: "node-discovery",
              operation: "announce",
              silent: isTransientNetworkError(err),
            });
          }
        },
      );

      logger.debug("Gateway announced", { gatewayId: this.gatewayId, role: currentRole });
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.WARNING,
        component: "node-discovery",
        operation: "announce",
        silent: isTransientNetworkError(error),
      });
    }
  }

  private handleMessage(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    try {
      const announcement = JSON.parse(msg.toString()) as GatewayAnnouncement;

      // Ignore our own announcements
      if (this.isGateway && announcement.gatewayId === this.gatewayId) {
        return;
      }

      // Verify HMAC-SHA256 signature
      if (!this.verifyAnnouncement(announcement)) {
        logger.warn("Invalid announcement signature", {
          gatewayId: announcement.gatewayId,
          from: rinfo.address,
        });
        return;
      }

      // Add or update discovered gateway
      const existing = this.discoveredGateways.get(announcement.gatewayId);
      const wasPrimary = existing?.role === "primary";

      const gateway: DiscoveredGateway = {
        gatewayId: announcement.gatewayId,
        url: `http://${announcement.host}:${announcement.port}`,
        role: announcement.role,
        priority: announcement.role === "primary" ? 1 : 2,
        lastSeen: Date.now(),
      };

      this.discoveredGateways.set(announcement.gatewayId, gateway);

      logger.debug("Gateway discovered", {
        gatewayId: gateway.gatewayId,
        url: gateway.url,
        role: gateway.role,
      });

      // Notify all discovery listeners
      for (const listener of this.discoveryListeners) {
        try {
          listener(gateway);
        } catch {
          /* individual listener failure is non-fatal */
        }
      }

      // Check if primary changed
      const isPrimary = gateway.role === "primary";
      if (isPrimary && !wasPrimary) {
        logger.info("Primary gateway changed", {
          newPrimary: gateway.gatewayId,
          url: gateway.url,
        });
        for (const listener of this.primaryChangeListeners) {
          try {
            listener(gateway);
          } catch {
            /* individual listener failure is non-fatal */
          }
        }
      }
    } catch (error) {
      logger.warn("Failed to parse announcement", { error, from: rinfo.address });
    }
  }

  private startCleanup(): void {
    const interval = 30 * 1000; // 30 seconds

    this.cleanupTimer = setInterval(() => {
      this.cleanupStaleGateways();
    }, interval);
  }

  private cleanupStaleGateways(): void {
    const now = Date.now();
    const timeout = this.config.discovery.announceInterval * 3 * 1000; // 3x announce interval

    for (const [gatewayId, gateway] of this.discoveredGateways.entries()) {
      const age = now - gateway.lastSeen;

      if (age > timeout) {
        logger.info("Removing stale gateway", {
          gatewayId,
          age,
          timeout,
        });
        this.discoveredGateways.delete(gatewayId);
      }
    }
  }

  /**
   * Sign an announcement using HMAC-SHA256 with the cluster secret.
   * Replaces the old insecure "first 16 chars of secret" approach.
   */
  private signAnnouncement(gatewayId: string, role: string): string {
    const secret = this.config.encryption.clusterSecret;
    if (!secret) {
      return "";
    }

    const payload = `${gatewayId}:${role}`;
    return crypto.createHmac("sha256", secret).update(payload).digest("hex");
  }

  /**
   * Verify an announcement signature using HMAC-SHA256.
   */
  private verifyAnnouncement(announcement: GatewayAnnouncement): boolean {
    const secret = this.config.encryption.clusterSecret;
    if (!secret) {
      return true;
    } // If no secret configured, accept all

    const expected = this.signAnnouncement(announcement.gatewayId, announcement.role);
    if (!expected || !announcement.signature) {
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(announcement.signature, "hex"),
      );
    } catch {
      return false;
    }
  }

  private getAllLocalIPs(): string[] {
    const ips: string[] = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] ?? []) {
        if (iface.family === "IPv4" && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return ips.length > 0 ? ips : ["127.0.0.1"];
  }

  private getLocalIP(): string {
    return this.getAllLocalIPs()[0];
  }
}

/**
 * Node Auto-Reconnection Manager
 * Handles automatic reconnection to gateways on failover
 *
 * Fixes applied:
 * - Retries reconnection on failure (3 attempts, exponential backoff)
 */
export class NodeAutoReconnect {
  private discovery: NodeDiscovery;
  private currentGateway: DiscoveredGateway | null = null;
  private reconnectCallback?: (gateway: DiscoveredGateway) => Promise<void>;
  private reconnecting = false;

  private static readonly MAX_RECONNECT_ATTEMPTS = 3;
  private static readonly BASE_RECONNECT_DELAY_MS = 1000;

  constructor() {
    this.discovery = new NodeDiscovery(false);
  }

  async start(onReconnect: (gateway: DiscoveredGateway) => Promise<void>): Promise<void> {
    this.reconnectCallback = onReconnect;

    // Start discovery
    await this.discovery.start();

    // Handle primary changes
    this.discovery.onPrimaryChange(async (gateway) => {
      await this.handlePrimaryChange(gateway);
    });

    logger.info("Node auto-reconnect started");
  }

  async stop(): Promise<void> {
    await this.discovery.stop();
    logger.info("Node auto-reconnect stopped");
  }

  getCurrentGateway(): DiscoveredGateway | null {
    return this.currentGateway;
  }

  getAvailableGateways(): DiscoveredGateway[] {
    return this.discovery.getDiscoveredGateways();
  }

  private async handlePrimaryChange(newPrimary: DiscoveredGateway): Promise<void> {
    if (this.reconnecting) {
      logger.info("Already reconnecting, skipping");
      return;
    }

    if (this.currentGateway?.gatewayId === newPrimary.gatewayId) {
      logger.info("Already connected to new primary");
      return;
    }

    logger.info("Primary gateway changed, reconnecting", {
      oldGateway: this.currentGateway?.gatewayId,
      newGateway: newPrimary.gatewayId,
    });

    this.reconnecting = true;

    try {
      if (this.reconnectCallback) {
        await this.reconnectWithRetry(newPrimary);
      }
    } finally {
      this.reconnecting = false;
    }
  }

  /**
   * Reconnect with exponential backoff retry logic.
   * Prevents permanent disconnect when a single reconnect attempt fails.
   */
  private async reconnectWithRetry(gateway: DiscoveredGateway): Promise<void> {
    for (let attempt = 1; attempt <= NodeAutoReconnect.MAX_RECONNECT_ATTEMPTS; attempt++) {
      try {
        await this.reconnectCallback!(gateway);
        this.currentGateway = gateway;
        logger.info("Successfully reconnected to new primary", { attempt });
        return;
      } catch (error) {
        const isLastAttempt = attempt === NodeAutoReconnect.MAX_RECONNECT_ATTEMPTS;
        const delayMs = NodeAutoReconnect.BASE_RECONNECT_DELAY_MS * Math.pow(2, attempt - 1);

        if (isLastAttempt) {
          handleError(error, {
            category: ErrorCategory.NETWORK,
            severity: ErrorSeverity.WARNING,
            component: "node-auto-reconnect",
            operation: "reconnect",
            metadata: { gateway, attempts: attempt },
          });
          logger.warn("All reconnect attempts exhausted, will retry on next primary change");
        } else {
          logger.warn(
            `Reconnect attempt ${attempt} failed, retrying in ${delayMs}ms: ${String(error)}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  }
}
