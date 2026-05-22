/**
 * Republic Platform — State Replication
 *
 * Synchronizes Republic simulation state between primary and standby gateways
 * via Redis pub/sub. The primary gateway publishes state snapshots and deltas,
 * and standby gateways consume them to maintain hot-standby readiness.
 *
 * Replication modes:
 * - Full snapshot: sent on primary promotion and every N ticks
 * - Delta: sent on each tick with only changed keys
 * - On-demand: standby can request a full snapshot
 *
 * Integrates with:
 * - gateway-cluster-manager.ts (leader election events)
 * - redis-state-store.ts (pub/sub transport)
 * - republic-store.ts (local persistence)
 * - state.ts (Republic state singleton)
 */

import { createSubsystemLogger } from "../logging.js";
import { estimateObjectBytes } from "../republic/byte-estimator.js";
import { getStateStore } from "./redis-state-store.js";

const logger = createSubsystemLogger("cluster:replication");

// ─── Configuration ──────────────────────────────────────────────

const CHANNEL_SNAPSHOT = "republic:state:snapshot";
const CHANNEL_DELTA = "republic:state:delta";
const CHANNEL_REQUEST = "republic:state:request";

/** Full snapshot every N ticks */
const SNAPSHOT_INTERVAL = 100;

/** Max delta payload size (bytes). If exceeded, send full snapshot instead */
const MAX_DELTA_SIZE = 512_000;

// ─── Types ──────────────────────────────────────────────────────

interface ReplicationSnapshot {
  type: "snapshot";
  senderId: string;
  tick: number;
  timestamp: number;
  state: string; // JSON-serialized RepublicState
}

interface ReplicationDelta {
  type: "delta";
  senderId: string;
  tick: number;
  timestamp: number;
  changedKeys: string[];
  patches: Record<string, unknown>;
}

interface ReplicationRequest {
  type: "request";
  requesterId: string;
  reason: string;
}

type ReplicationMessage = ReplicationSnapshot | ReplicationDelta | ReplicationRequest;

// ─── State Replicator ───────────────────────────────────────────

export class StateReplicator {
  private gatewayId: string;
  private role: "primary" | "standby" = "standby";
  private subscribed = false;
  private lastReplicatedTick = 0;
  private onSnapshotReceived: ((state: unknown) => void) | null = null;
  private onDeltaReceived: ((patches: Record<string, unknown>) => void) | null = null;

  constructor(gatewayId: string) {
    this.gatewayId = gatewayId;
  }

  /** Start replication as primary or standby */
  async start(role: "primary" | "standby"): Promise<void> {
    this.role = role;
    const store = getStateStore();

    if (role === "standby") {
      // Subscribe to snapshot + delta channels
      await store.subscribe(CHANNEL_SNAPSHOT, (msg) => this.handleMessage(msg));
      await store.subscribe(CHANNEL_DELTA, (msg) => this.handleMessage(msg));
      this.subscribed = true;

      // Request initial snapshot from primary
      await store.publish(CHANNEL_REQUEST, {
        type: "request",
        requesterId: this.gatewayId,
        reason: "standby-startup",
      } satisfies ReplicationRequest);

      logger.info("Replication started as standby", { gatewayId: this.gatewayId });
    } else {
      // Primary subscribes to requests
      await store.subscribe(CHANNEL_REQUEST, (msg) => this.handleMessage(msg));
      this.subscribed = true;
      logger.info("Replication started as primary", { gatewayId: this.gatewayId });
    }
  }

  /** Stop replication */
  async stop(): Promise<void> {
    if (!this.subscribed) {
      return;
    }
    const store = getStateStore();
    try {
      await store.unsubscribe(CHANNEL_SNAPSHOT);
      await store.unsubscribe(CHANNEL_DELTA);
      await store.unsubscribe(CHANNEL_REQUEST);
    } catch {
      // Ignore unsubscribe errors during shutdown
    }
    this.subscribed = false;
    logger.info("Replication stopped", { gatewayId: this.gatewayId });
  }

  /** Switch roles (e.g., after failover) */
  async switchRole(newRole: "primary" | "standby"): Promise<void> {
    await this.stop();
    await this.start(newRole);
  }

  /** Register callback for full snapshot received (standby) */
  onSnapshot(handler: (state: unknown) => void): void {
    this.onSnapshotReceived = handler;
  }

  /** Register callback for delta received (standby) */
  onDelta(handler: (patches: Record<string, unknown>) => void): void {
    this.onDeltaReceived = handler;
  }

  /**
   * Publish a full state snapshot (called by primary).
   * Used on promotion, periodically, and on-demand requests.
   */
  async publishSnapshot(state: unknown, tick: number): Promise<void> {
    if (this.role !== "primary") {
      return;
    }

    const store = getStateStore();
    const msg: ReplicationSnapshot = {
      type: "snapshot",
      senderId: this.gatewayId,
      tick,
      timestamp: Date.now(),
      state: JSON.stringify(state),
    };

    await store.publish(CHANNEL_SNAPSHOT, msg);
    this.lastReplicatedTick = tick;
    logger.debug("Published snapshot", { tick, sizeBytes: msg.state.length });
  }

  /**
   * Publish a delta update (called by primary on each tick).
   * Falls back to full snapshot if delta is too large.
   */
  async publishDelta(
    state: unknown,
    tick: number,
    changedKeys: string[],
    patches: Record<string, unknown>,
  ): Promise<void> {
    if (this.role !== "primary") {
      return;
    }

    // Periodic full snapshot
    if (tick % SNAPSHOT_INTERVAL === 0) {
      await this.publishSnapshot(state, tick);
      return;
    }

    const store = getStateStore();
    const msg: ReplicationDelta = {
      type: "delta",
      senderId: this.gatewayId,
      tick,
      timestamp: Date.now(),
      changedKeys,
      patches,
    };

    const estimatedSize = estimateObjectBytes(patches);

    // If delta is too large, send full snapshot instead
    if (estimatedSize > MAX_DELTA_SIZE) {
      await this.publishSnapshot(state, tick);
      return;
    }

    await store.publish(CHANNEL_DELTA, msg);
    this.lastReplicatedTick = tick;
  }

  /** Handle incoming replication messages */
  private handleMessage(raw: unknown): void {
    try {
      const msg = raw as ReplicationMessage;

      // Ignore our own messages
      if ("senderId" in msg && msg.senderId === this.gatewayId) {
        return;
      }

      switch (msg.type) {
        case "snapshot":
          this.handleSnapshot(msg);
          break;
        case "delta":
          this.handleDelta(msg);
          break;
        case "request":
          this.handleRequest(msg);
          break;
      }
    } catch (e) {
      logger.warn("Failed to parse replication message", { error: String(e) });
    }
  }

  private handleSnapshot(msg: ReplicationSnapshot): void {
    if (this.role !== "standby") {
      return;
    }

    try {
      const state = JSON.parse(msg.state);
      this.lastReplicatedTick = msg.tick;
      this.onSnapshotReceived?.(state);
      logger.info("Applied replication snapshot", {
        tick: msg.tick,
        from: msg.senderId,
        sizeBytes: msg.state.length,
      });
    } catch (e) {
      logger.error("Failed to apply replication snapshot", { error: String(e) });
    }
  }

  private handleDelta(msg: ReplicationDelta): void {
    if (this.role !== "standby") {
      return;
    }

    // Skip deltas if we've missed ticks (need full snapshot)
    if (msg.tick > this.lastReplicatedTick + 1 && this.lastReplicatedTick > 0) {
      logger.warn("Missed ticks, requesting full snapshot", {
        lastTick: this.lastReplicatedTick,
        receivedTick: msg.tick,
      });
      void this.requestSnapshot("missed-ticks");
      return;
    }

    this.lastReplicatedTick = msg.tick;
    this.onDeltaReceived?.(msg.patches);
  }

  private handleRequest(msg: ReplicationRequest): void {
    if (this.role !== "primary") {
      return;
    }

    logger.info("Snapshot requested", {
      requester: msg.requesterId,
      reason: msg.reason,
    });

    // The primary should publish a snapshot — caller must wire this
    // to actually call publishSnapshot with current state
  }

  /** Request a full snapshot from primary (standby utility) */
  private async requestSnapshot(reason: string): Promise<void> {
    const store = getStateStore();
    await store.publish(CHANNEL_REQUEST, {
      type: "request",
      requesterId: this.gatewayId,
      reason,
    } satisfies ReplicationRequest);
  }

  /** Get replication status */
  getStatus(): {
    role: string;
    subscribed: boolean;
    lastReplicatedTick: number;
  } {
    return {
      role: this.role,
      subscribed: this.subscribed,
      lastReplicatedTick: this.lastReplicatedTick,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let replicator: StateReplicator | null = null;

export function getReplicator(gatewayId?: string): StateReplicator {
  if (!replicator) {
    if (!gatewayId) {
      throw new Error("gatewayId required for first getReplicator() call");
    }
    replicator = new StateReplicator(gatewayId);
  }
  return replicator;
}

export function resetReplicator(): void {
  replicator = null;
}
