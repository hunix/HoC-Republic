/**
 * Republic Platform — Resilience & Self-Healing Tests
 *
 * Tests for: CircuitBreaker state machine, WatchdogTimer,
 * and system health probes.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { CircuitBreaker, WatchdogTimer, checkSystemHealth } from "./resilience.js";

// ─── CircuitBreaker ─────────────────────────────────────────────

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: "test",
      failureThreshold: 3,
      resetTimeoutMs: 100,
      halfOpenProbes: 2,
    });
  });

  it("starts in closed state", () => {
    expect(breaker.state).toBe("closed");
  });

  it("stays closed on successful calls", async () => {
    for (let i = 0; i < 5; i++) {
      await breaker.execute(async () => "ok");
    }
    expect(breaker.state).toBe("closed");
  });

  it("transitions to open after exceeding failure threshold", async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
    }
    expect(breaker.state).toBe("open");
  });

  it("rejects calls when open", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
    }

    await expect(breaker.execute(async () => "ok")).rejects.toThrow("OPEN");
  });

  it("transitions from open to half_open after timeout", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
    }
    expect(breaker.state).toBe("open");

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(breaker.state).toBe("half_open");
  });

  it("transitions from half_open to closed after successful probes", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(breaker.state).toBe("half_open");

    // Successful probes
    await breaker.execute(async () => "ok");
    await breaker.execute(async () => "ok");

    expect(breaker.state).toBe("closed");
  });

  it("transitions from half_open back to open on failure", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
    }

    // Wait for reset timeout
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(breaker.state).toBe("half_open");

    // Fail in half_open → back to open
    try {
      await breaker.execute(async () => {
        throw new Error("fail again");
      });
    } catch {}

    expect(breaker.state).toBe("open");
  });

  it("executeWithFallback uses fallback when open", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
    }

    const result = await breaker.executeWithFallback(
      async () => "primary",
      () => "fallback",
    );
    expect(result).toBe("fallback");
  });

  it("executeWithFallback uses primary when closed", async () => {
    const result = await breaker.executeWithFallback(
      async () => "primary",
      () => "fallback",
    );
    expect(result).toBe("primary");
  });

  it("reset() force-resets to closed state", async () => {
    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {}
    }
    expect(breaker.state).toBe("open");

    breaker.reset();
    expect(breaker.state).toBe("closed");
  });

  it("tracks diagnostics correctly", async () => {
    await breaker.execute(async () => "ok");
    try {
      await breaker.execute(async () => {
        throw new Error("fail");
      });
    } catch {}

    const diag = breaker.diagnostics;
    expect(diag.name).toBe("test");
    expect(diag.totalCalls).toBe(2);
    expect(diag.totalSuccesses).toBe(1);
    expect(diag.totalFailures).toBe(1);
  });
});

// ─── WatchdogTimer ──────────────────────────────────────────────

describe("WatchdogTimer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes with default values", () => {
    const wd = new WatchdogTimer();
    const diag = wd.diagnostics;
    expect(diag.running).toBe(false);
    expect(diag.maxTickGapMs).toBe(30_000);
    expect(diag.totalTriggers).toBe(0);
  });

  it("kick() resets the timer", () => {
    const wd = new WatchdogTimer();
    wd.kick();
    const diag = wd.diagnostics;
    expect(diag.timeSinceLastTick).toBeLessThan(100);
  });

  it("stop() clears the interval", () => {
    const wd = new WatchdogTimer();
    wd.start(100);
    expect(wd.diagnostics.running).toBe(true);
    wd.stop();
    expect(wd.diagnostics.running).toBe(false);
  });

  it("triggers callback when tick gap exceeded", async () => {
    let triggered = false;
    const wd = new WatchdogTimer({
      maxTickGapMs: 50,
      onTrigger: () => {
        triggered = true;
      },
    });
    wd.start(20);
    // Wait for the gap to exceed
    await new Promise((resolve) => setTimeout(resolve, 150));
    wd.stop();
    expect(triggered).toBe(true);
    expect(wd.diagnostics.totalTriggers).toBeGreaterThanOrEqual(1);
  });
});

// ─── System Health ──────────────────────────────────────────────

describe("checkSystemHealth", () => {
  it("returns a health status", () => {
    const health = checkSystemHealth();
    expect(["healthy", "degraded", "unhealthy"]).toContain(health.overall);
    expect(Array.isArray(health.probes)).toBe(true);
    expect(health.checkedAt).toBeTruthy();
    expect(Array.isArray(health.recoveryActions)).toBe(true);
  });

  it("includes probe results with name and status", () => {
    const health = checkSystemHealth();
    for (const probe of health.probes) {
      expect(probe.name).toBeTruthy();
      expect(["healthy", "degraded", "unhealthy"]).toContain(probe.status);
    }
  });
});
