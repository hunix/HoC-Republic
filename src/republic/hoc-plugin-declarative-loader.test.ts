/**
 * Tests for the declarative plugin loader.
 *
 * Verifies: manifest detection, tool registration, gateway RPC wiring,
 * job queue auto-tools, health checks, and plugin shutdown.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { HoCPluginManifest, HoCPluginRecord, HoCPluginContext } from "./hoc-plugin-types.js";
import {
  isDeclarativePlugin,
  loadDeclarativePlugin,
  shutdownDeclarativePlugin,
  healthCheckDeclarativePlugin,
} from "./hoc-plugin-declarative-loader.js";

// ─── Mock Dependencies ──────────────────────────────────────────

// Mock the backends module
vi.mock("./hoc-plugin-backends.js", () => ({
  resolveBackend: vi.fn(() => ({
    detect: vi.fn().mockResolvedValue({ ready: true, installed: true, errors: [] }),
    install: vi.fn().mockResolvedValue({ ready: true, installed: true, errors: [] }),
    execute: vi.fn().mockResolvedValue({ status: "ok" }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true, message: "Backend ok" }),
  })),
}));

// Mock the subsystem logger
vi.mock("../logging/subsystem.js", () => ({
  createSubsystemLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────

function createTestManifest(overrides?: Partial<HoCPluginManifest>): HoCPluginManifest {
  return {
    id: "hoc-plugin-test",
    name: "Test Plugin",
    version: "1.0.0",
    description: "A test plugin",
    backend: {
      type: "python-cli",
      repo: "https://github.com/test/repo.git",
      deps: ["test-dep"],
      verifyImport: "import test_module",
    },
    ...overrides,
  };
}

function createTestRecord(manifest?: HoCPluginManifest): HoCPluginRecord {
  const m = manifest ?? createTestManifest();
  return {
    id: m.id,
    manifest: m,
    pluginDir: "/tmp/plugins/hoc-plugin-test",
    dataDir: "/tmp/plugins/.data/hoc-plugin-test",
    status: "initializing",
    loadedAt: Date.now(),
  };
}

function createMockContext(): HoCPluginContext {
  return {
    dataDir: "/tmp/data",
    pluginDir: "/tmp/plugins/hoc-plugin-test",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    registerProvider: vi.fn(),
    registerTools: vi.fn(),
    registerTool: vi.fn(),
    on: vi.fn(),
    emit: vi.fn(),
    registerGateway: vi.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe("isDeclarativePlugin", () => {
  it("returns true when manifest has backend", () => {
    const manifest = createTestManifest();

    expect(isDeclarativePlugin(manifest)).toBe(true);
  });

  it("returns false when manifest has no backend", () => {
    const manifest = createTestManifest({ backend: undefined });

    expect(isDeclarativePlugin(manifest)).toBe(false);
  });
});

describe("loadDeclarativePlugin", () => {
  let ctx: HoCPluginContext;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  it("registers tools from toolDefinitions", async () => {
    const manifest = createTestManifest({
      toolDefinitions: [
        {
          name: "test_tool",
          description: "A test tool",
          params: {
            input: { type: "string", description: "Input text", required: true },
          },
          command: "test_command",
        },
      ],
    });
    const record = createTestRecord(manifest);

    await loadDeclarativePlugin(record, ctx);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(ctx.registerTool)).toHaveBeenCalledWith(
      "test_tool",
      "A test tool",
      expect.objectContaining({
        type: "object",
        properties: {
          input: { type: "string", description: "Input text" },
        },
        required: ["input"],
      }),
      expect.any(Function),
    );
  });

  it("registers gateway RPCs from gatewayDefinitions", async () => {
    const manifest = createTestManifest({
      gatewayDefinitions: [{ method: "test.execute", delegateTo: "test_command" }],
    });
    const record = createTestRecord(manifest);

    await loadDeclarativePlugin(record, ctx);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(ctx.registerGateway)).toHaveBeenCalledWith("test.execute", expect.any(Function));
  });

  it("creates job queue tools when jobQueue is enabled", async () => {
    const manifest = createTestManifest({
      id: "hoc-plugin-bark",
      jobQueue: { maxConcurrent: 1, timeoutMs: 300000 },
    });
    const record = createTestRecord(manifest);

    await loadDeclarativePlugin(record, ctx);

    // Should register 3 auto-generated queue tools
    const toolCalls = (ctx.registerTool as ReturnType<typeof vi.fn>).mock.calls;
    const toolNames = toolCalls.map((c: unknown[]) => c[0]);

    expect(toolNames).toContain("bark_job_status");
    expect(toolNames).toContain("bark_cancel");
    expect(toolNames).toContain("bark_queue_status");
  });

  it("subscribes to tick:before when jobQueue is enabled", async () => {
    const manifest = createTestManifest({
      jobQueue: true,
    });
    const record = createTestRecord(manifest);

    await loadDeclarativePlugin(record, ctx);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(ctx.on)).toHaveBeenCalledWith("tick:before", expect.any(Function));
  });

  it("handles gateway _job_status delegation", async () => {
    const manifest = createTestManifest({
      jobQueue: true,
      gatewayDefinitions: [{ method: "test.job-status", delegateTo: "_job_status" }],
    });
    const record = createTestRecord(manifest);

    await loadDeclarativePlugin(record, ctx);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(ctx.registerGateway)).toHaveBeenCalledWith("test.job-status", expect.any(Function));
  });

  it("handles gateway _cancel delegation", async () => {
    const manifest = createTestManifest({
      jobQueue: true,
      gatewayDefinitions: [{ method: "test.cancel", delegateTo: "_cancel" }],
    });
    const record = createTestRecord(manifest);

    await loadDeclarativePlugin(record, ctx);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(ctx.registerGateway)).toHaveBeenCalledWith("test.cancel", expect.any(Function));
  });

  it("handles gateway _queue_status delegation", async () => {
    const manifest = createTestManifest({
      jobQueue: true,
      gatewayDefinitions: [{ method: "test.queue-status", delegateTo: "_queue_status" }],
    });
    const record = createTestRecord(manifest);

    await loadDeclarativePlugin(record, ctx);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(vi.mocked(ctx.registerGateway)).toHaveBeenCalledWith("test.queue-status", expect.any(Function));
  });

  it("works with manifest that has no tools or gateway", async () => {
    const manifest = createTestManifest({
      toolDefinitions: undefined,
      gatewayDefinitions: undefined,
      jobQueue: undefined,
    });
    const record = createTestRecord(manifest);

    // Should not throw
    await expect(loadDeclarativePlugin(record, ctx)).resolves.not.toThrow();
  });
});

describe("shutdownDeclarativePlugin", () => {
  it("does not throw for unknown plugin", async () => {
    await expect(shutdownDeclarativePlugin("nonexistent")).resolves.not.toThrow();
  });
});

describe("healthCheckDeclarativePlugin", () => {
  it("returns unhealthy for unknown plugin", async () => {
    const result = await healthCheckDeclarativePlugin("nonexistent");

    expect(result.healthy).toBe(false);
    expect(result.message).toBe("Plugin not loaded");
  });
});
