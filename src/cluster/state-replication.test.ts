/**
 * State Replication – Test Suite
 *
 * Tests:
 * - Replicator singleton management
 * - Default status values
 * - Callback registration
 * - handleMessage dispatching (snapshot/delta via private method)
 *
 * Note: ReplicationSnapshot/Delta/Request types are NOT exported,
 * so we construct plain objects matching the expected shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  _StateReplicator,
  getReplicator,
  resetReplicator,
} from "./state-replication.js";

describe("StateReplicator", () => {
  beforeEach(() => {
    resetReplicator();
  });

  afterEach(() => {
    resetReplicator();
  });

  // ─── Singleton ──────────────────────────────────────────────

  it("getReplicator() returns a singleton", () => {
    const r1 = getReplicator("gw-1");
    const r2 = getReplicator("gw-1");
    expect(r1).toBe(r2);
  });

  it("resetReplicator() clears the singleton", () => {
    const r1 = getReplicator("gw-1");
    resetReplicator();
    const r2 = getReplicator("gw-2");
    expect(r1).not.toBe(r2);
  });

  it("throws when gatewayId is missing on first call", () => {
    expect(() => getReplicator()).toThrow("gatewayId required");
  });

  // ─── Status ─────────────────────────────────────────────────

  it("getStatus() returns default standby status", () => {
    const replicator = getReplicator("gw-1");
    const status = replicator.getStatus();
    expect(status.role).toBe("standby");
    expect(status.subscribed).toBe(false);
    expect(status.lastReplicatedTick).toBe(0);
  });

  // ─── Callbacks ──────────────────────────────────────────────

  it("onSnapshot() registers snapshot callback", () => {
    const replicator = getReplicator("gw-1");
    const handler = vi.fn();
    replicator.onSnapshot(handler);
    // Verify internal state
    expect((replicator as string).onSnapshotReceived).toBe(handler);
  });

  it("onDelta() registers delta callback", () => {
    const replicator = getReplicator("gw-1");
    const handler = vi.fn();
    replicator.onDelta(handler);
    expect((replicator as string).onDeltaReceived).toBe(handler);
  });

  // ─── handleMessage dispatching (private) ────────────────────

  it("handleMessage dispatches snapshot to onSnapshotReceived", () => {
    const replicator = getReplicator("gw-standby");
    const snapshotHandler = vi.fn();
    replicator.onSnapshot(snapshotHandler);

    // handleMessage expects a raw object, not a JSON string
    const msg = {
      type: "snapshot",
      senderId: "gw-primary", // different from ours
      tick: 100,
      timestamp: Date.now(),
      state: JSON.stringify({ citizens: [], tick: 100 }),
    };
    (replicator as string).handleMessage(msg);

    expect(snapshotHandler).toHaveBeenCalledTimes(1);
    expect(snapshotHandler).toHaveBeenCalledWith({ citizens: [], tick: 100 });
  });

  it("handleMessage dispatches delta to onDeltaReceived", () => {
    const replicator = getReplicator("gw-standby");
    const deltaHandler = vi.fn();
    replicator.onDelta(deltaHandler);

    const msg = {
      type: "delta",
      senderId: "gw-primary",
      tick: 1, // first tick after 0
      timestamp: Date.now(),
      changedKeys: ["citizens"],
      patches: { citizens: [{ id: "c-1" }] },
    };
    (replicator as string).handleMessage(msg);

    expect(deltaHandler).toHaveBeenCalledTimes(1);
    expect(deltaHandler).toHaveBeenCalledWith({ citizens: [{ id: "c-1" }] });
  });

  it("handleMessage ignores own messages", () => {
    const replicator = getReplicator("gw-self");
    const snapshotHandler = vi.fn();
    replicator.onSnapshot(snapshotHandler);

    const msg = {
      type: "snapshot",
      senderId: "gw-self", // same as our ID — should be ignored
      tick: 50,
      timestamp: Date.now(),
      state: "{}",
    };
    (replicator as string).handleMessage(msg);

    expect(snapshotHandler).not.toHaveBeenCalled();
  });

  it("handleSnapshot updates lastReplicatedTick", () => {
    const replicator = getReplicator("gw-tick");
    replicator.onSnapshot(vi.fn());

    const msg = {
      type: "snapshot",
      senderId: "gw-primary",
      tick: 250,
      timestamp: Date.now(),
      state: JSON.stringify({ tick: 250 }),
    };
    (replicator as string).handleMessage(msg);

    expect(replicator.getStatus().lastReplicatedTick).toBe(250);
  });

  it("handleDelta updates lastReplicatedTick", () => {
    const replicator = getReplicator("gw-delta-tick");
    replicator.onDelta(vi.fn());

    const msg = {
      type: "delta",
      senderId: "gw-primary",
      tick: 1,
      timestamp: Date.now(),
      changedKeys: ["economy"],
      patches: { economy: { credits: 100 } },
    };
    (replicator as string).handleMessage(msg);

    expect(replicator.getStatus().lastReplicatedTick).toBe(1);
  });
});
