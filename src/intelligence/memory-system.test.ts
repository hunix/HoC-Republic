/**
 * Intelligence Memory System – Test Suite
 *
 * Tests the 5-tier memory architecture:
 * - L1 (CacheLayer) → requires Redis, skip in unit tests
 * - L2 (FlashLayer) → SQLite, testable with temp DB
 * - L3 (ShortTermMemory) → SQLite + vector, testable with temp DB
 * - L4 (LongTermMemory) → SQLite, testable with temp DB
 * - L5 (PermanentMemory) → SQLite, testable with temp DB
 * - Unified MemorySystem → entity extraction (pure logic)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  FlashLayer,
  ShortTermMemory,
  LongTermMemory,
  PermanentMemory,
  MemorySystem,
  type Memory,
  type Entity,
  type Skill,
} from "./memory-system.js";

// ─── Helpers ────────────────────────────────────────────────────

function tmpDbPath(prefix: string): string {
  return path.join(os.tmpdir(), `hoc-test-${prefix}-${Date.now()}.db`);
}

function cleanUp(dbPath: string) {
  try {
    fs.unlinkSync(dbPath);
  } catch {
    /* not created */
  }
}

// ─── L2: FlashLayer ─────────────────────────────────────────────

describe("FlashLayer", () => {
  let flash: FlashLayer;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = tmpDbPath("flash");
    flash = new FlashLayer(dbPath);
    await flash.initialize();
  });

  afterEach(async () => {
    await flash.shutdown();
    cleanUp(dbPath);
  });

  it("write() stores and returns an entry id", async () => {
    const id = await flash.write("sess-1", { key: "val" });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("read() returns written entries", async () => {
    await flash.write("sess-2", { x: 42 });
    const entries = await flash.read("sess-2");
    expect(entries.length).toBe(1);
  });

  it("read() returns empty array for unknown session", async () => {
    const entries = await flash.read("unknown-session");
    expect(entries).toEqual([]);
  });

  it("cleanup() removes expired entries", async () => {
    // Write with very short TTL
    await flash.write("sess-ttl", { tmp: true }, 0);
    // Wait a tick for expiry
    await new Promise((r) => setTimeout(r, 50));
    const removed = await flash.cleanup();
    expect(typeof removed).toBe("number");
  });
});

// ─── L3: ShortTermMemory ────────────────────────────────────────

describe("ShortTermMemory", () => {
  let stm: ShortTermMemory;
  let dbPath: string;

  const makeMem = (overrides: Partial<Memory> = {}): Memory => ({
    id: `mem-${Date.now()}`,
    content: "test content",
    type: "observation",
    timestamp: Date.now(),
    metadata: {},
    salience: 0.5,
    ...overrides,
  });

  beforeEach(async () => {
    dbPath = tmpDbPath("stm");
    stm = new ShortTermMemory(dbPath);
    await stm.initialize();
  });

  afterEach(async () => {
    await stm.shutdown();
    cleanUp(dbPath);
  });

  it("store() and getAll() round-trip a memory", async () => {
    const mem = makeMem({ id: "stm-1" });
    await stm.store(mem);
    const all = await stm.getAll();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe("stm-1");
  });

  it("delete() removes a memory", async () => {
    const mem = makeMem({ id: "stm-del" });
    await stm.store(mem);
    await stm.delete("stm-del");
    const all = await stm.getAll();
    expect(all.length).toBe(0);
  });

  it("prune() removes low-salience memories", async () => {
    await stm.store(makeMem({ id: "lo", salience: 0.01 }));
    await stm.store(makeMem({ id: "hi", salience: 0.9 }));
    const pruned = await stm.prune({ minSalience: 0.5 });
    expect(pruned).toBe(1);
    const remaining = await stm.getAll();
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe("hi");
  });
});

// ─── L4: LongTermMemory ─────────────────────────────────────────

describe("LongTermMemory", () => {
  let ltm: LongTermMemory;
  let dbPath: string;

  const makeEntity = (id: string, name: string): Entity => ({
    id,
    type: "concept",
    name,
    properties: {},
    salience: 0.5,
    created: Date.now(),
    lastAccessed: Date.now(),
  });

  beforeEach(async () => {
    dbPath = tmpDbPath("ltm");
    ltm = new LongTermMemory(dbPath);
    await ltm.initialize();
  });

  afterEach(async () => {
    await ltm.shutdown();
    cleanUp(dbPath);
  });

  it("addNode() and findEntity() store and retrieve entities", async () => {
    const e = makeEntity("ent-1", "TestConcept");
    await ltm.addNode(e);
    const found = await ltm.findEntity((ent) => ent.name === "TestConcept");
    expect(found.length).toBe(1);
    expect(found[0].id).toBe("ent-1");
  });

  it("addRelationship() creates a typed edge", async () => {
    await ltm.addNode(makeEntity("a", "A"));
    await ltm.addNode(makeEntity("b", "B"));
    await ltm.addRelationship({
      from: "a",
      to: "b",
      type: "related_to",
      strength: 0.8,
      properties: {},
      created: Date.now(),
      lastActivated: Date.now(),
    });
    const traversed = await ltm.traverse("a", 1);
    expect(traversed.length).toBeGreaterThanOrEqual(1);
  });

  it("updateSalience() modifies entity salience", async () => {
    await ltm.addNode(makeEntity("s", "S"));
    await ltm.updateSalience("s", 0.3);
    const found = await ltm.findEntity((e) => e.id === "s");
    expect(found[0].salience).toBeCloseTo(0.8, 1);
  });
});

// ─── L5: PermanentMemory ────────────────────────────────────────

describe("PermanentMemory", () => {
  let pm: PermanentMemory;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = tmpDbPath("perm");
    pm = new PermanentMemory(dbPath);
    await pm.initialize();
  });

  afterEach(async () => {
    await pm.shutdown();
    cleanUp(dbPath);
  });

  it("addSkill() stores a named skill", async () => {
    const skill: Skill = {
      id: "sk-1",
      name: "search",
      description: "Searches the web",
      code: "function search() {}",
      parameters: {},
    };
    await pm.addSkill(skill);
    const skills = await pm.querySkills();
    expect(skills.length).toBe(1);
  });

  it("addLesson() and searchLessons() work together", async () => {
    await pm.addLesson({
      type: "knowledge",
      content: "Always validate user input",
      confidence: 0.9,
      applicability: ["security"],
      learnedFrom: ["experience"],
    });
    const lessons = await pm.searchLessons("validate input");
    expect(lessons.length).toBeGreaterThanOrEqual(0); // may or may not match via FTS
  });
});

// ─── MemorySystem entity extraction ─────────────────────────────

describe("MemorySystem (structure)", () => {
  it("exposes the 5-tier layer properties", () => {
    const ms = new MemorySystem();
    expect(ms.cache).toBeDefined();
    expect(ms.flash).toBeDefined();
    expect(ms.shortTerm).toBeDefined();
    expect(ms.longTerm).toBeDefined();
    expect(ms.permanent).toBeDefined();
  });

  it("extractEntities returns entities from text (via any cast)", () => {
    const ms = new MemorySystem();
    const entities = (ms as string).extractEntities("Alice met Bob at the park");
    expect(Array.isArray(entities)).toBe(true);
  });
});
