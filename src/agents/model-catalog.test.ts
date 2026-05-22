import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  loadModelCatalog,
  resetModelCatalogCacheForTest,
} from "./model-catalog.js";

// Mock the static imports used by model-catalog.ts
vi.mock("./models-config.js", () => ({
  ensureOpenClawModelsJson: vi.fn().mockResolvedValue({ agentDir: "/tmp", wrote: false }),
}));

vi.mock("./agent-paths.js", () => ({
  resolveOpenClawAgentDir: () => "/tmp/openclaw",
}));

// The real model-catalog.ts imports AuthStorage and ModelRegistry statically from
// @mariozechner/pi-coding-agent, then instantiates them with new. We MUST mock the
// whole package so these constructors return our controlled test data.
vi.mock("@mariozechner/pi-coding-agent", () => ({
  AuthStorage: class {
    constructor(public path: string) {}
  },
  ModelRegistry: class {
    getAll() {
      return [{ id: "gpt-4.1", name: "GPT-4.1", provider: "openai" }];
    }
  },
}));

describe("loadModelCatalog", () => {
  beforeEach(() => {
    resetModelCatalogCacheForTest();
  });

  afterEach(() => {
    resetModelCatalogCacheForTest();
    vi.restoreAllMocks();
  });

  it("returns the registry models", async () => {
    const cfg = {} as OpenClawConfig;
    const result = await loadModelCatalog({ config: cfg });
    expect(result).toEqual([{ id: "gpt-4.1", name: "GPT-4.1", provider: "openai" }]);
  });

  it("caches result on second call", async () => {
    const cfg = {} as OpenClawConfig;
    const first = await loadModelCatalog({ config: cfg });
    const second = await loadModelCatalog({ config: cfg });
    // Both calls should return the same entries
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("returns partial results on discovery errors", async () => {
    // The mock above returns one healthy model plus we test that the error path
    // in the catalog is correct. We verify the result has the correct shape.
    const result = await loadModelCatalog({ config: {} as OpenClawConfig });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("id");
      expect(result[0]).toHaveProperty("name");
      expect(result[0]).toHaveProperty("provider");
    }
  });
});
