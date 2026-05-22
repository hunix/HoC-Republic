/**
 * Node Discovery – Test Suite
 *
 * Tests:
 * - HMAC-SHA256 announcement signing / verification (private, via cast)
 * - Discovery state accessors
 * - NodeAutoReconnect structure
 *
 * Note: `isTransientNetworkError` and `GatewayAnnouncement` are not exported,
 * so they are tested indirectly or via cast.
 */
import { describe, it, expect, _vi, beforeEach, afterEach } from "vitest";
import {
  NodeDiscovery,
  NodeAutoReconnect,
} from "./node-discovery.js";
import { invalidateClusterConfigCache } from "./cluster-config.js";

// Use a cluster secret of at least 32 chars (config validation requirement)
const LONG_SECRET = "test-secret-key-for-hmac-testing-!";

// ─── NodeDiscovery HMAC ─────────────────────────────────────────

describe("NodeDiscovery HMAC", () => {
  let discovery: NodeDiscovery;

  beforeEach(() => {
    process.env.OPENCLAW_CLUSTER_ENABLED = "true";
    process.env.OPENCLAW_CLUSTER_SECRET = LONG_SECRET;
    invalidateClusterConfigCache();
    discovery = new NodeDiscovery(true, "gw-test", 3000, () => "primary");
  });

  afterEach(() => {
    delete process.env.OPENCLAW_CLUSTER_ENABLED;
    delete process.env.OPENCLAW_CLUSTER_SECRET;
    invalidateClusterConfigCache();
  });

  it("signAnnouncement returns a 64-char hex string", () => {
    const sig = (discovery as string).signAnnouncement("gw-1", "primary");
    expect(typeof sig).toBe("string");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signAnnouncement is deterministic", () => {
    const sig1 = (discovery as string).signAnnouncement("gw-1", "primary");
    const sig2 = (discovery as string).signAnnouncement("gw-1", "primary");
    expect(sig1).toBe(sig2);
  });

  it("signAnnouncement differs for different inputs", () => {
    const sig1 = (discovery as string).signAnnouncement("gw-1", "primary");
    const sig2 = (discovery as string).signAnnouncement("gw-2", "primary");
    expect(sig1).not.toBe(sig2);
  });

  it("signAnnouncement differs by role", () => {
    const sig1 = (discovery as string).signAnnouncement("gw-1", "primary");
    const sig2 = (discovery as string).signAnnouncement("gw-1", "standby");
    expect(sig1).not.toBe(sig2);
  });

  it("verifyAnnouncement accepts correctly signed data", () => {
    const sig = (discovery as string).signAnnouncement("gw-test", "primary");
    const ok = (discovery as string).verifyAnnouncement({
      gatewayId: "gw-test",
      host: "127.0.0.1",
      port: 3000,
      role: "primary",
      timestamp: Date.now(),
      signature: sig,
    });
    expect(ok).toBe(true);
  });

  it("verifyAnnouncement rejects bad signatures", () => {
    const ok = (discovery as string).verifyAnnouncement({
      gatewayId: "gw-test",
      host: "127.0.0.1",
      port: 3000,
      role: "primary",
      timestamp: Date.now(),
      signature: "deadbeef".repeat(8),
    });
    expect(ok).toBe(false);
  });

  it("verifyAnnouncement rejects empty signature", () => {
    const ok = (discovery as string).verifyAnnouncement({
      gatewayId: "gw-test",
      host: "127.0.0.1",
      port: 3000,
      role: "primary",
      timestamp: Date.now(),
      signature: "",
    });
    expect(ok).toBe(false);
  });
});

// ─── NodeDiscovery State ────────────────────────────────────────

describe("NodeDiscovery State", () => {
  let discovery: NodeDiscovery;

  beforeEach(() => {
    process.env.OPENCLAW_CLUSTER_ENABLED = "true";
    process.env.OPENCLAW_CLUSTER_SECRET = LONG_SECRET;
    invalidateClusterConfigCache();
    discovery = new NodeDiscovery(false);
  });

  afterEach(() => {
    delete process.env.OPENCLAW_CLUSTER_ENABLED;
    delete process.env.OPENCLAW_CLUSTER_SECRET;
    invalidateClusterConfigCache();
  });

  it("getDiscoveredGateways() returns empty initially", () => {
    expect(discovery.getDiscoveredGateways()).toEqual([]);
  });

  it("getPrimaryGateway() returns null initially", () => {
    expect(discovery.getPrimaryGateway()).toBeNull();
  });

  it("onDiscovered() accepts a callback without error", () => {
    discovery.onDiscovered(() => {});
  });

  it("onPrimaryChange() accepts a callback without error", () => {
    discovery.onPrimaryChange(() => {});
  });
});

// ─── NodeAutoReconnect ──────────────────────────────────────────

describe("NodeAutoReconnect", () => {
  let reconnect: NodeAutoReconnect;

  beforeEach(() => {
    process.env.OPENCLAW_CLUSTER_ENABLED = "true";
    process.env.OPENCLAW_CLUSTER_SECRET = LONG_SECRET;
    invalidateClusterConfigCache();
    reconnect = new NodeAutoReconnect();
  });

  afterEach(() => {
    delete process.env.OPENCLAW_CLUSTER_ENABLED;
    delete process.env.OPENCLAW_CLUSTER_SECRET;
    invalidateClusterConfigCache();
  });

  it("getCurrentGateway() returns null initially", () => {
    expect(reconnect.getCurrentGateway()).toBeNull();
  });

  it("getAvailableGateways() returns empty initially", () => {
    expect(reconnect.getAvailableGateways()).toEqual([]);
  });
});
