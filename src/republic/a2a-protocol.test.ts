/**
 * Republic Platform — A2A Protocol Tests
 *
 * Tests for: discovery, messaging, service requests,
 * protocol tick integration, diagnostics, and reputation.
 *
 * Note: registerCapabilities and processRequests are internal functions
 * invoked via a2aProtocolTick, so we test them through the tick interface.
 */

import { describe, it, expect } from "vitest";
import {
  discoverCapabilities,
  sendMessage,
  requestService,
  a2aProtocolTick,
  a2aDiagnostics,
  getReputation,
} from "./a2a-protocol.js";
import { createSeedState } from "./seed-state.js";

// ─── Discovery ──────────────────────────────────────────────────

describe("Capability Discovery", () => {
  it("returns an array of results", () => {
    // Run a tick first to populate capability registry
    const state = createSeedState();
    state.currentTick = 0; // Ensure A2A_TICK_INTERVAL (10) is hit
    a2aProtocolTick(state);

    const results = discoverCapabilities("technology");
    expect(Array.isArray(results)).toBe(true);
  });

  it("each result has citizenId and capability fields", () => {
    const state = createSeedState();
    state.currentTick = 0;
    a2aProtocolTick(state);

    const results = discoverCapabilities("Developer");
    for (const result of results) {
      expect(result.citizenId).toBeTruthy();
      expect(result.capability).toBeDefined();
      expect(result.capability.name).toBeTruthy();
      expect(typeof result.capability.qualityScore).toBe("number");
    }
  });

  it("returns empty array for unknown domain", () => {
    const results = discoverCapabilities("nonexistent-domain-xyz");
    expect(results).toEqual([]);
  });
});

// ─── Messaging ──────────────────────────────────────────────────

describe("A2A Messaging", () => {
  it("creates and queues a message", () => {
    const msg = sendMessage("from-1", "to-1", "request", { data: "test" });
    expect(msg.id).toBeTruthy();
    expect(msg.from).toBe("from-1");
    expect(msg.to).toBe("to-1");
    expect(msg.type).toBe("request");
    expect(msg.status).toBe("pending");
  });

  it("supports priority", () => {
    const msg = sendMessage("from-1", "to-1", "request", {}, undefined, 10);
    expect(msg.priority).toBe(10);
  });

  it("supports capability field", () => {
    const msg = sendMessage("from-1", "to-1", "request", {}, "coding");
    expect(msg.capability).toBe("coding");
  });

  it("defaults priority to 5", () => {
    const msg = sendMessage("from-1", "to-1", "broadcast", {});
    expect(msg.priority).toBe(5);
  });

  it("assigns a timestamp", () => {
    const before = Date.now();
    const msg = sendMessage("from-1", "to-1", "request", {});
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
    expect(msg.timestamp).toBeLessThanOrEqual(Date.now());
  });
});

// ─── Service Requests ───────────────────────────────────────────

describe("Service Requests", () => {
  it("creates a service request", () => {
    const req = requestService("requester-1", "provider-1", "coding", { task: "write tests" }, 100);
    expect(req.id).toBeTruthy();
    expect(req.requesterId).toBe("requester-1");
    expect(req.providerId).toBe("provider-1");
    expect(req.capability).toBe("coding");
    expect(req.status).toBe("pending");
    expect(req.createdAt).toBe(100);
    expect(req.quality).toBe(0);
  });

  it("also sends an A2A message", () => {
    const diagBefore = a2aDiagnostics();
    requestService("req-2", "prov-2", "testing", {}, 200);
    const diagAfter = a2aDiagnostics();
    expect(diagAfter.totalMessages).toBeGreaterThan(diagBefore.totalMessages);
  });
});

// ─── A2A Protocol Tick ──────────────────────────────────────────

describe("a2aProtocolTick", () => {
  it("runs without error on seed state", () => {
    const state = createSeedState();
    state.currentTick = 0;
    expect(() => a2aProtocolTick(state)).not.toThrow();
  });

  it("only executes at A2A_TICK_INTERVAL (every 10 ticks)", () => {
    const state = createSeedState();
    const diagBefore = a2aDiagnostics();

    // Non-interval ticks should be no-ops
    state.currentTick = 3;
    a2aProtocolTick(state);
    state.currentTick = 7;
    a2aProtocolTick(state);

    // This shouldn't significantly change diagnostics
    // (message count from previous tests may exist, but capabilities won't update)
    const diagAfter = a2aDiagnostics();
    // The key property is that no new service requests are created at non-interval ticks
    expect(diagAfter.pendingRequests).toBe(diagBefore.pendingRequests);
  });

  it("registers capabilities at interval ticks", () => {
    const state = createSeedState();
    state.currentTick = 20;
    a2aProtocolTick(state);
    const diag = a2aDiagnostics();
    expect(diag.registeredCapabilities).toBeGreaterThan(0);
  });
});

// ─── Diagnostics ────────────────────────────────────────────────

describe("A2A Diagnostics", () => {
  it("returns diagnostic data with expected shape", () => {
    const diag = a2aDiagnostics();
    expect(typeof diag.registeredCapabilities).toBe("number");
    expect(typeof diag.totalMessages).toBe("number");
    expect(typeof diag.pendingRequests).toBe("number");
    expect(typeof diag.completedRequests).toBe("number");
    expect(typeof diag.avgServiceQuality).toBe("number");
  });

  it("avgServiceQuality is between 0 and 1", () => {
    const diag = a2aDiagnostics();
    expect(diag.avgServiceQuality).toBeGreaterThanOrEqual(0);
    expect(diag.avgServiceQuality).toBeLessThanOrEqual(1);
  });
});

// ─── Reputation ─────────────────────────────────────────────────

describe("Reputation", () => {
  it("returns 0.5 default reputation for unknown citizens", () => {
    const rep = getReputation("unknown-citizen-xyz-123");
    expect(rep).toBe(0.5);
  });

  it("returns a number", () => {
    const rep = getReputation("any-citizen");
    expect(typeof rep).toBe("number");
    expect(rep).toBeGreaterThanOrEqual(0);
    expect(rep).toBeLessThanOrEqual(1);
  });
});
