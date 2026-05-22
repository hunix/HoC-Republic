/**
 * Tests for the shared plugin job queue.
 *
 * Verifies: submit, status, cancel, tick processing,
 * priority ordering, concurrency limits, and timeout handling.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { BackendAdapter } from "./hoc-plugin-backends.js";
import type { HoCPluginLogger } from "./hoc-plugin-types.js";
import { PluginJobQueue } from "./hoc-plugin-job-queue.js";

// ─── Helpers ────────────────────────────────────────────────────

function createMockLogger(): HoCPluginLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function createMockBackend(executeResult: unknown = { status: "ok" }): BackendAdapter {
  return {
    detect: vi.fn().mockResolvedValue({ ready: true, installed: true, errors: [] }),
    install: vi.fn().mockResolvedValue({ ready: true, installed: true, errors: [] }),
    execute: vi.fn().mockResolvedValue(executeResult),
    shutdown: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, message: "ok" }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("PluginJobQueue", () => {
  let queue: PluginJobQueue;
  let backend: BackendAdapter;
  let log: HoCPluginLogger;

  beforeEach(() => {
    backend = createMockBackend();
    log = createMockLogger();
    queue = new PluginJobQueue("test-plugin", backend, log, {
      maxConcurrent: 2,
      timeoutMs: 5000,
    });
  });

  describe("submit", () => {
    it("creates a job with status=queued", () => {
      const job = queue.submit("generate", { text: "hello" });

      expect(job.id).toMatch(/^test-plugin-job-/);
      expect(job.status).toBe("queued");
      expect(job.progress).toBe(0);
      expect(job.command).toBe("generate");
      expect(job.input).toEqual({ text: "hello" });
      expect(job.pluginId).toBe("test-plugin");
      expect(job.createdAt).toBeGreaterThan(0);
    });

    it("assigns unique IDs to successive jobs", () => {
      const job1 = queue.submit("cmd1", {});
      const job2 = queue.submit("cmd2", {});

      expect(job1.id).not.toBe(job2.id);
    });

    it("respects priority parameter", () => {
      const job = queue.submit("generate", { text: "hi" }, "critical");

      expect(job.priority).toBe("critical");
    });

    it("defaults to normal priority", () => {
      const job = queue.submit("generate", {});

      expect(job.priority).toBe("normal");
    });
  });

  describe("getJob", () => {
    it("returns a submitted job by ID", () => {
      const submitted = queue.submit("cmd", {});
      const retrieved = queue.getJob(submitted.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(submitted.id);
    });

    it("returns undefined for unknown ID", () => {
      expect(queue.getJob("nonexistent")).toBeUndefined();
    });
  });

  describe("listJobs", () => {
    it("returns all jobs", () => {
      const job1 = queue.submit("a", {});
      const job2 = queue.submit("b", {});

      const list = queue.listJobs();

      expect(list).toHaveLength(2);
      const ids = list.map((j) => j.id);
      expect(ids).toContain(job1.id);
      expect(ids).toContain(job2.id);
    });

    it("returns empty array when no jobs", () => {
      expect(queue.listJobs()).toHaveLength(0);
    });
  });

  describe("cancel", () => {
    it("cancels a queued job", () => {
      const job = queue.submit("cmd", {});

      expect(queue.cancel(job.id)).toBe(true);
      expect(queue.getJob(job.id)!.status).toBe("cancelled");
      expect(queue.getJob(job.id)!.completedAt).toBeGreaterThan(0);
    });

    it("returns false for unknown job ID", () => {
      expect(queue.cancel("nonexistent")).toBe(false);
    });

    it("returns false for non-queued job", () => {
      const job = queue.submit("cmd", {});
      // Start it via tick
      queue.tick();
      // Now it's running — cannot cancel
      expect(queue.cancel(job.id)).toBe(false);
    });
  });

  describe("getStats", () => {
    it("returns correct counts", () => {
      queue.submit("a", {});
      queue.submit("b", {});
      queue.submit("c", {});

      const stats = queue.getStats();

      expect(stats.totalJobs).toBe(3);
      expect(stats.queuedJobs).toBe(3);
      expect(stats.runningJobs).toBe(0);
      expect(stats.maxConcurrent).toBe(2);
    });

    it("returns zero counts when empty", () => {
      const stats = queue.getStats();

      expect(stats.totalJobs).toBe(0);
      expect(stats.queuedJobs).toBe(0);
    });
  });

  describe("tick", () => {
    it("starts queued jobs up to concurrency limit", () => {
      queue.submit("a", {});
      queue.submit("b", {});
      queue.submit("c", {});

      queue.tick();

      const stats = queue.getStats();
      // With maxConcurrent=2, 2 should be running, 1 still queued
      expect(stats.runningJobs).toBe(2);
      expect(stats.queuedJobs).toBe(1);
    });

    it("processes higher priority jobs first", () => {
      queue.submit("low", {}, "low");
      queue.submit("critical", {}, "critical");
      queue.submit("normal", {}, "normal");

      // Only 2 slots — critical and normal should start, low stays queued
      queue.tick();

      const list = queue.listJobs();
      const running = list.filter((j) => j.status === "running");
      const queued = list.filter((j) => j.status === "queued");

      expect(running).toHaveLength(2);
      expect(running.map((j) => j.command)).toContain("critical");
      expect(running.map((j) => j.command)).toContain("normal");
      expect(queued).toHaveLength(1);
      expect(queued[0].command).toBe("low");
    });

    it("calls backend.execute for started jobs", () => {
      queue.submit("generate", { text: "test" });
      queue.tick();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(vi.mocked(backend.execute)).toHaveBeenCalledWith("generate", { text: "test" });
    });

    it("detects timed-out jobs", () => {
      const job = queue.submit("slow", {});
      // Manually set to running with an old startedAt
      job.status = "running";
      job.startedAt = Date.now() - 10_000; // 10s ago, timeout is 5s

      queue.tick();

      expect(job.status).toBe("failed");
      expect(job.error).toBe("Timed out");
    });
  });

  describe("cleanup", () => {
    it("removes old completed/failed/cancelled jobs", () => {
      const job = queue.submit("cmd", {});
      job.status = "completed";
      job.completedAt = Date.now() - 7200_000; // 2 hours ago

      const removed = queue.cleanup(3600_000); // 1 hour threshold

      expect(removed).toBe(1);
      expect(queue.getJob(job.id)).toBeUndefined();
    });

    it("preserves recent jobs", () => {
      const job = queue.submit("cmd", {});
      job.status = "completed";
      job.completedAt = Date.now() - 60_000; // 1 minute ago

      const removed = queue.cleanup(3600_000); // 1 hour threshold

      expect(removed).toBe(0);
      expect(queue.getJob(job.id)).toBeDefined();
    });

    it("preserves queued and running jobs", () => {
      queue.submit("queued-job", {});

      const removed = queue.cleanup(0); // 0 = remove all old ones

      expect(removed).toBe(0);
    });
  });
});
