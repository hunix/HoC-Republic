/**
 * Tests for the Docker Orchestrator — reconcileManagedContainers, scheduleDockerReaper,
 * and the port-safe supabase preset.
 *
 * We mock child_process.execFileSync so no real Docker daemon is needed.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// ─── Mock child_process ──────────────────────────────────────────
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  exec: vi.fn(),
}));

// Mock event sourcing so reconcile doesn't blow up on emitNationalEvent
vi.mock("./event-sourcing.js", () => ({
  emitNationalEvent: vi.fn(),
}));

// Mock infra-control-plane.js (used by initResourceBudget)
vi.mock("./infra-control-plane.js", () => ({
  probeSystemResources: vi.fn().mockResolvedValue({ cpuCores: 8, ramTotalGB: 16 }),
}));

import { execFileSync } from "node:child_process";

let mockExecFileSync: Mock;

// Lazy-import after vi.mock is hoisted
async function importOrch() {
  return import("./docker-orchestrator.js");
}

// ─── Helpers ────────────────────────────────────────────────────

function makePsLine(
  id: string,
  name: string,
  image: string,
  status: string,
  ports = "",
  createdAt = "2026-03-08T10:00:00Z",
) {
  return `${id}|${name}|${image}|${status}|${ports}|${createdAt}`;
}

// ─── Tests ──────────────────────────────────────────────────────

describe("CONTAINER_PRESETS.supabase — port safety", () => {
  it("supabase preset uses dynamic host ports (0:N) to avoid collisions", async () => {
    const { CONTAINER_PRESETS } = await importOrch();
    const supabase = CONTAINER_PRESETS.supabase;
    expect(supabase).toBeDefined();
    for (const p of supabase.ports ?? []) {
      // Every port mapping must start with "0:" (dynamic host port)
      expect(p).toMatch(/^0:/);
    }
    // Specifically no fixed 5432:5432 or 8000:8000
    expect(supabase.ports).not.toContain("5432:5432");
    expect(supabase.ports).not.toContain("8000:8000");
  });
});

describe("reconcileManagedContainers", () => {
  beforeEach(() => {
    mockExecFileSync = execFileSync as Mock;
    vi.clearAllMocks();
  });

  it("returns zero when Docker returns empty output", async () => {
    // docker --version → available
    // docker info → version
    // docker ps → empty
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (args[0] === "--version") { return "Docker version 24.0.0"; }
      if (args[0] === "info") { return "24.0.0"; }
      if (args[0] === "ps") { return ""; }
      return "";
    });

    const { reconcileManagedContainers } = await importOrch();
    const result = await reconcileManagedContainers();

    expect(result.reconciled).toBe(0);
    expect(result.budget.activeContainers).toBe(0);
    expect(result.budget.allocatedCpuCores).toBe(0);
    expect(result.budget.allocatedMemoryGB).toBe(0);
  });

  it("rebuilds map and budget from two running managed containers", async () => {
    const lines = [
      makePsLine("abc123456789", "hoc-supabase-a1b2c3", "supabase/postgres:15", "Up 2 hours"),
      makePsLine("def987654321", "hoc-redis-x9y8z7", "redis:7-alpine", "Up 30 minutes"),
    ].join("\n");

    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "--version") { return "Docker version 24.0.0"; }
      if (args[0] === "info") { return "24.0.0"; }
      if (args[0] === "ps") { return lines; }
      if (args[0] === "inspect" && args[1] === "--format" && args[2]?.includes("CpuQuota")) {
        // Return 200000 microseconds = 2 cores
        return "200000";
      }
      if (args[0] === "inspect" && args[1] === "--format" && args[2]?.includes("Memory")) {
        // Return 2 GB in bytes
        return String(2 * 1024 * 1024 * 1024);
      }
      if (args[0] === "inspect" && args[1] === "--format" && args[2]?.includes("Labels")) {
        // Return hoc label lines
        return "hoc.managed=true\nhoc.requested-by=citizen-007\nhoc.service=supabase\n";
      }
      return "";
    });

    const { reconcileManagedContainers } = await importOrch();
    const result = await reconcileManagedContainers();

    expect(result.reconciled).toBe(2);
    expect(result.budget.activeContainers).toBe(2);
    // Each container has 2.0 CPU → total 4.0
    expect(result.budget.allocatedCpuCores).toBeCloseTo(4.0, 1);
    // Each container has 2 GB RAM → total 4 GB
    expect(result.budget.allocatedMemoryGB).toBeCloseTo(4.0, 1);
  });

  it("does not count stopped containers towards budget", async () => {
    const lines = [
      makePsLine("aaa111222333", "hoc-postgres-stopped", "postgres:16", "Exited (0) 3 hours ago"),
    ].join("\n");

    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "--version") { return "Docker version 24.0.0"; }
      if (args[0] === "info") { return "24.0.0"; }
      if (args[0] === "ps") { return lines; }
      return "";
    });

    const { reconcileManagedContainers } = await importOrch();
    const result = await reconcileManagedContainers();

    expect(result.reconciled).toBe(1); // Map has 1 entry
    expect(result.budget.activeContainers).toBe(0); // But it's not running
    expect(result.budget.allocatedCpuCores).toBe(0);
  });
});

describe("scheduleDockerReaper", () => {
  beforeEach(() => {
    mockExecFileSync = execFileSync as Mock;
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a handle with a stop() method", async () => {
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) => {
      if (args[0] === "--version") { return "Docker version 24.0.0"; }
      if (args[0] === "info") { return "24.0.0"; }
      return "";
    });

    const { scheduleDockerReaper } = await importOrch();
    const handle = scheduleDockerReaper({ intervalMs: 1000, maxAgeHours: 0 });

    expect(handle).toHaveProperty("stop");
    expect(typeof handle.stop).toBe("function");

    handle.stop(); // should not throw
  });
});
