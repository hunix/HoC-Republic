/**
 * Tests — Gateway Lifecycle (Phase 27)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  executePhasedBoot,
  getBootPhase,
  registerLazyHandler,
  loadHandler,
  getHandlerStatus,
  listHandlers,
  createCircuitBreaker,
  recordSuccess,
  recordFailure,
  getCircuitBreaker,
  listCircuitBreakers,
  resetCircuitBreaker,
  configureResourceBudget,
  getResourceBudget,
  takeResourceSnapshot,
  getResourceHistory,
  shouldApplyBackpressure,
  trackConnectionOpen,
  trackConnectionClose,
  triggerGC,
  lifecycleDiagnostics,
  resetLifecycle,
} from "./gateway-lifecycle.js";

beforeEach(() => {
  resetLifecycle();
});

// ─── Phased Boot ────────────────────────────────────────────────

describe("Phased boot sequencer", () => {
  it("should start uninitialized", () => {
    expect(getBootPhase()).toBe("uninitialized");
  });

  it("should execute phased boot and reach ready state", () => {
    const metrics = executePhasedBoot();
    expect(getBootPhase()).toBe("ready");
    expect(metrics.phase).toBe("ready");
    expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(metrics.completedAt).toBeTruthy();
    expect(metrics.phases.length).toBeGreaterThan(0);
    expect(metrics.loadedModules).toBeGreaterThan(0);
  });

  it("should track phase durations", () => {
    const phases: string[] = [];
    executePhasedBoot({
      onPhaseComplete: (name) => phases.push(name),
    });
    expect(phases).toContain("core");
    expect(phases).toContain("gateway");
    expect(phases).toContain("republic-core");
    expect(phases).toContain("republic-autonomy");
  });

  it("should handle custom boot phases", () => {
    const metrics = executePhasedBoot({
      phases: [
        { name: "minimal", priority: 0, modules: ["health"], timeoutMs: 1000, critical: true },
      ],
    });
    expect(metrics.phase).toBe("ready");
    expect(metrics.phases).toHaveLength(1);
    expect(metrics.totalModules).toBe(1);
  });
});

// ─── Lazy Handler Registry ──────────────────────────────────────

describe("Lazy handler registry", () => {
  it("should register handlers for lazy loading", () => {
    registerLazyHandler("test-domain", "./handlers/test.js");
    const handler = getHandlerStatus("test-domain");
    expect(handler).toBeTruthy();
    expect(handler!.loaded).toBe(false);
    expect(handler!.domain).toBe("test-domain");
  });

  it("should load handlers on demand", () => {
    registerLazyHandler("lazy-mod", "./handlers/lazy.js");
    const entry = loadHandler("lazy-mod");
    expect(entry).toBeTruthy();
    expect(entry!.loaded).toBe(true);
    expect(entry!.loadTimeMs).toBeGreaterThan(0);
  });

  it("should return null for unregistered domains", () => {
    expect(loadHandler("nonexistent")).toBeNull();
  });

  it("should list all handlers after boot", () => {
    executePhasedBoot();
    const handlers = listHandlers();
    expect(handlers.length).toBeGreaterThan(0);
    expect(handlers.every((h) => typeof h.loaded === "boolean")).toBe(true);
  });
});

// ─── Circuit Breaker ────────────────────────────────────────────

describe("Circuit breakers", () => {
  it("should start in closed state", () => {
    const cb = createCircuitBreaker("test-cb");
    expect(cb.state).toBe("closed");
    expect(cb.failures).toBe(0);
  });

  it("should track successes", () => {
    createCircuitBreaker("success-cb");
    const updated = recordSuccess("success-cb");
    expect(updated!.successes).toBe(1);
    expect(updated!.totalRequests).toBe(1);
    expect(updated!.lastSuccess).toBeTruthy();
  });

  it("should open after reaching failure threshold", () => {
    createCircuitBreaker("fail-cb");
    for (let i = 0; i < 5; i++) {
      recordFailure("fail-cb");
    }
    const cb = getCircuitBreaker("fail-cb");
    expect(cb!.state).toBe("open");
    expect(cb!.failures).toBe(5);
  });

  it("should calculate error rate", () => {
    createCircuitBreaker("rate-cb");
    recordSuccess("rate-cb");
    recordSuccess("rate-cb");
    recordFailure("rate-cb");
    const cb = getCircuitBreaker("rate-cb");
    expect(cb!.errorRate).toBeCloseTo(1 / 3, 1);
  });

  it("should reset a circuit breaker", () => {
    createCircuitBreaker("reset-cb");
    for (let i = 0; i < 5; i++) {
      recordFailure("reset-cb");
    }
    expect(getCircuitBreaker("reset-cb")!.state).toBe("open");

    resetCircuitBreaker("reset-cb");
    expect(getCircuitBreaker("reset-cb")!.state).toBe("closed");
    expect(getCircuitBreaker("reset-cb")!.failures).toBe(0);
  });

  it("should list all circuit breakers", () => {
    createCircuitBreaker("cb-a");
    createCircuitBreaker("cb-b");
    const list = listCircuitBreakers();
    expect(list).toHaveLength(2);
    expect(list.map((x) => x.domain)).toContain("cb-a");
    expect(list.map((x) => x.domain)).toContain("cb-b");
  });

  it("should reject requests when circuit is open", () => {
    registerLazyHandler("broken-mod", "./handlers/broken.js");
    for (let i = 0; i < 5; i++) {
      recordFailure("broken-mod");
    }

    const entry = loadHandler("broken-mod");
    expect(entry!.error).toContain("Circuit breaker open");
  });
});

// ─── Resource Budget Manager ────────────────────────────────────

describe("Resource budget manager", () => {
  it("should configure resource budgets", () => {
    configureResourceBudget({ maxHeapMb: 1024, maxConnections: 20000 });
    const budget = getResourceBudget();
    expect(budget.maxHeapMb).toBe(1024);
    expect(budget.maxConnections).toBe(20000);
  });

  it("should take resource snapshots", () => {
    const snap = takeResourceSnapshot();
    expect(snap.heap.usedMb).toBeGreaterThan(0);
    expect(snap.eventLoop.lagMs).toBeGreaterThan(0);
    expect(snap.overallPressure).toBeTruthy();
    expect(snap.timestamp).toBeTruthy();
  });

  it("should track resource history", () => {
    takeResourceSnapshot();
    takeResourceSnapshot();
    takeResourceSnapshot();
    const history = getResourceHistory(3);
    expect(history).toHaveLength(3);
  });

  it("should track connections", () => {
    const _c1 = trackConnectionOpen();
    const c2 = trackConnectionOpen();
    expect(c2).toBe(2);
    const c3 = trackConnectionClose();
    expect(c3).toBe(1);
  });

  it("should simulate GC", () => {
    const gc = triggerGC();
    expect(gc.pauseMs).toBeGreaterThan(0);
    expect(gc.freedMb).toBeGreaterThan(0);
  });

  it("should check backpressure", () => {
    const result = shouldApplyBackpressure();
    expect(typeof result.apply).toBe("boolean");
    expect(result.reason).toBeTruthy();
  });

  it("should report no backpressure when disabled", () => {
    configureResourceBudget({ backpressureEnabled: false });
    const result = shouldApplyBackpressure();
    expect(result.apply).toBe(false);
    expect(result.reason).toContain("disabled");
  });
});

// ─── Diagnostics ────────────────────────────────────────────────

describe("Lifecycle diagnostics", () => {
  it("should provide comprehensive diagnostics", () => {
    executePhasedBoot();
    const diag = lifecycleDiagnostics();
    expect(diag.boot.phase).toBe("ready");
    expect(diag.resources.heap.usedMb).toBeGreaterThan(0);
    expect(diag.handlers.length).toBeGreaterThan(0);
    expect(diag.uptime).toBeGreaterThanOrEqual(0);
    expect(diag.startedAt).toBeTruthy();
  });
});
