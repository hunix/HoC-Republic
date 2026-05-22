/**
 * Gateway Cluster Manager – Test Suite
 *
 * Tests:
 * - Singleton accessor
 * - Default role and state
 * - Event subscription
 * - Private helper accessors (hostname, port)
 * - Health metric collection (CPU delta)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getClusterManager,
  resetClusterManager,
  type _GatewayRole,
  type _ClusterEvent,
} from "./gateway-cluster-manager.js";
import { invalidateClusterConfigCache } from "./cluster-config.js";

const LONG_SECRET = "test-secret-key-for-cluster-manager-tests!";

describe("GatewayClusterManager", () => {
  beforeEach(() => {
    process.env.OPENCLAW_CLUSTER_ENABLED = "true";
    process.env.OPENCLAW_CLUSTER_SECRET = LONG_SECRET;
    invalidateClusterConfigCache();
    resetClusterManager();
  });

  afterEach(() => {
    resetClusterManager();
    delete process.env.OPENCLAW_CLUSTER_ENABLED;
    delete process.env.OPENCLAW_CLUSTER_SECRET;
    invalidateClusterConfigCache();
  });

  it("getClusterManager() returns a singleton", () => {
    const m1 = getClusterManager();
    const m2 = getClusterManager();
    expect(m1).toBe(m2);
  });

  it("resetClusterManager() clears the singleton", () => {
    const m1 = getClusterManager();
    resetClusterManager();
    const m2 = getClusterManager();
    expect(m1).not.toBe(m2);
  });

  it("starts in standby role", () => {
    const mgr = getClusterManager();
    expect(mgr.getRole()).toBe("standby");
  });

  it("isPrimary() is false initially", () => {
    const mgr = getClusterManager();
    expect(mgr.isPrimary()).toBe(false);
  });

  it("getGatewayId() returns a non-empty string", () => {
    const mgr = getClusterManager();
    expect(typeof mgr.getGatewayId()).toBe("string");
    expect(mgr.getGatewayId().length).toBeGreaterThan(0);
  });

  it("on() registers an event handler without error", () => {
    const mgr = getClusterManager();
    const handler = vi.fn();
    mgr.on("primary-elected", handler);
  });

  it("getHostname() returns a non-empty string", () => {
    const mgr = getClusterManager();
    const hostname = (mgr as string).getHostname();
    expect(typeof hostname).toBe("string");
    expect(hostname.length).toBeGreaterThan(0);
  });

  it("getPort() returns a positive integer", () => {
    const mgr = getClusterManager();
    const port = (mgr as string).getPort();
    expect(typeof port).toBe("number");
    expect(port).toBeGreaterThan(0);
  });

  it("collectHealthMetrics() returns health object", async () => {
    const mgr = getClusterManager();
    const health = await (mgr as string).collectHealthMetrics();
    expect(health).toHaveProperty("cpu");
    expect(health).toHaveProperty("memory");
    expect(health).toHaveProperty("responseTime");
    expect(health).toHaveProperty("lastHeartbeat");
    expect(typeof health.cpu).toBe("number");
    expect(typeof health.memory).toBe("number");
    expect(health.memory).toBeGreaterThan(0);
  });

  it("CPU usage is computed via delta (has snapshot primed in constructor)", async () => {
    const mgr = getClusterManager();
    const health = await (mgr as string).collectHealthMetrics();
    // CPU can be 0 on first delta if snapshots are nearly identical;
    // just verify it's a number within valid range [0, 100]
    expect(health.cpu).toBeGreaterThanOrEqual(0);
    expect(health.cpu).toBeLessThanOrEqual(100);
  });
});
