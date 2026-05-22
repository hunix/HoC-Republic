/**
 * Quantum Intelligence – Test Suite
 *
 * Tests the quantum-inspired reasoning modules.
 * Constructors after BitNet removal:
 *   QuantumSuperposition(memory)
 *   QuantumEntanglement(memory)
 *   QuantumInterference(memory)
 *   QuantumTunneling(memory, capabilityGraph?)
 *   QuantumIntelligence(memory, capabilityGraph)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  QuantumSuperposition,
  QuantumEntanglement,
  QuantumInterference,
  QuantumTunneling,
  QuantumIntelligence,
  type Hypothesis,
} from "./quantum-intelligence.js";
import type { Memory } from "./memory-system.js";
import type { MemorySystem } from "./memory-system.js";
import type { CapabilityGraph } from "../infra/capability-graph.js";

// ─── Mock factories ─────────────────────────────────────────────

function mockMemory(): MemorySystem {
  return {
    store: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    remember: vi.fn().mockResolvedValue(undefined),
    recall: vi.fn().mockResolvedValue([]),
    shortTerm: {
      store: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockResolvedValue([]),
    },
    longTerm: {
      addNode: vi.fn().mockResolvedValue(undefined),
      addRelationship: vi.fn().mockResolvedValue(undefined),
      traverse: vi.fn().mockResolvedValue([]),
      findEntity: vi.fn().mockResolvedValue([]),
    },
    permanent: {
      searchLessons: vi.fn().mockResolvedValue([]),
    },
    storeReflection: vi.fn().mockResolvedValue(undefined),
    extractEntities: vi.fn().mockReturnValue([]),
  } as unknown as MemorySystem;
}

function mockCapabilityGraph(): CapabilityGraph {
  return {
    findNodes: vi.fn().mockReturnValue([]),
    findCapabilities: vi.fn().mockReturnValue([]),
    query: vi.fn().mockReturnValue([]),
  } as unknown as CapabilityGraph;
}

function makeMem(overrides: Partial<Memory> = {}): Memory {
  return {
    id: `mem-${Date.now()}`,
    content: "test",
    type: "observation",
    timestamp: Date.now(),
    metadata: {},
    salience: 0.5,
    ...overrides,
  } as Memory;
}

// ─── QuantumSuperposition ───────────────────────────────────────

describe("QuantumSuperposition", () => {
  let sup: QuantumSuperposition;
  let memory: MemorySystem;

  beforeEach(() => {
    memory = mockMemory();
    // Constructor: (memory) — bitnet was removed
    sup = new QuantumSuperposition(memory);
  });

  it("generate() returns an array of hypotheses", async () => {
    const hyps = await sup.generate("test context");
    expect(Array.isArray(hyps)).toBe(true);
    for (const h of hyps) {
      expect(h).toHaveProperty("id");
      expect(h).toHaveProperty("type");
      expect(h).toHaveProperty("confidence");
    }
  });

  it("collapse() returns a Decision with required fields", async () => {
    const hyps: Hypothesis[] = [
      { id: "h1", type: "task_execution", interpretation: "Do something", confidence: 0.8, reasoning: "Because" },
      { id: "h2", type: "clarification_needed", interpretation: "Ask user", confidence: 0.3, reasoning: "Unclear" },
    ];
    const decision = await sup.collapse(hyps);
    expect(decision).toHaveProperty("id");
    expect(decision).toHaveProperty("hypothesis");
    expect(decision).toHaveProperty("confidence");
    expect(decision).toHaveProperty("alternatives");
    expect(decision.hypothesis.id).toBe("h1");
  });

  it("collapse() with empty hypotheses returns a fallback Decision", async () => {
    const decision = await sup.collapse([]);
    expect(decision).toHaveProperty("id");
    expect(decision.hypothesis.type).toBe("clarification_needed");
    expect(decision.confidence).toBeLessThan(0.5);
  });
});

// ─── QuantumEntanglement ────────────────────────────────────────

describe("QuantumEntanglement", () => {
  let ent: QuantumEntanglement;
  let memory: MemorySystem;

  beforeEach(() => {
    memory = mockMemory();
    ent = new QuantumEntanglement(memory);
  });

  it("retrieve() returns an EntangledMemories object", async () => {
    const result = await ent.retrieve("test query");
    expect(result).toHaveProperty("primary");
    expect(result).toHaveProperty("related");
    expect(result).toHaveProperty("strength");
  });

  it("calculateEntanglementStrength returns 0 for empty arrays", () => {
    // Access private method via unknown cast
    const strength = (ent as unknown as { calculateEntanglementStrength: (a: Memory[], b: Memory[]) => number }).calculateEntanglementStrength([], []);
    expect(strength).toBe(0);
  });

  it("calculateEntanglementStrength averages salience", () => {
    const primary = [makeMem({ salience: 0.8 }), makeMem({ salience: 0.6 })];
    const related = [makeMem({ salience: 0.4 })];
    const strength = (ent as unknown as { calculateEntanglementStrength: (a: Memory[], b: Memory[]) => number }).calculateEntanglementStrength(primary, related);
    // avg primary = 0.7, avg related = 0.4, overall = (0.7+0.4)/2 = 0.55
    expect(strength).toBeCloseTo(0.55, 1);
  });
});

// ─── QuantumInterference ────────────────────────────────────────

describe("QuantumInterference", () => {
  let qi: QuantumInterference;
  let memory: MemorySystem;

  beforeEach(() => {
    memory = mockMemory();
    // Constructor: (memory) — bitnet arg was removed
    qi = new QuantumInterference(memory);
  });

  it("consolidate() processes a new memory without errors", async () => {
    const mem = makeMem({ content: "important discovery" });
    await qi.consolidate(mem);
    // recall returns [] → no similar memories → stores to shortTerm
    expect((memory.shortTerm as { store: ReturnType<typeof vi.fn> }).store).toHaveBeenCalledWith(mem);
  });

  it("reinforce() increases salience", async () => {
    const mem = makeMem({ salience: 0.5 });
    await (qi as unknown as { reinforce: (m: Memory) => Promise<void> }).reinforce(mem);
    expect((memory.shortTerm as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalled();
  });
});

// ─── QuantumTunneling ───────────────────────────────────────────

describe("QuantumTunneling", () => {
  let qt: QuantumTunneling;

  beforeEach(() => {
    // Constructor: (memory, capabilityGraph?) — no bitnet arg
    qt = new QuantumTunneling(mockMemory(), mockCapabilityGraph());
  });

  it("findToolShortcuts() returns capability nodes", async () => {
    const result = await qt.findToolShortcuts("search for files");
    expect(Array.isArray(result)).toBe(true);
  });

  it("findAnalogy() returns analogy array", async () => {
    const analogies = await qt.findAnalogy("debugging a memory leak");
    expect(Array.isArray(analogies)).toBe(true);
  });
});

// ─── QuantumIntelligence (unified) ──────────────────────────────

describe("QuantumIntelligence", () => {
  let qi: QuantumIntelligence;

  beforeEach(() => {
    // Constructor: (memory, capabilityGraph) — no bitnet arg
    qi = new QuantumIntelligence(mockMemory(), mockCapabilityGraph());
  });

  it("exposes sub-modules", () => {
    expect(qi.superposition).toBeDefined();
    expect(qi.entanglement).toBeDefined();
    expect(qi.interference).toBeDefined();
    expect(qi.tunneling).toBeDefined();
  });

  it("think() returns a Decision", async () => {
    const decision = await qi.think("What should I do next?");
    expect(decision).toHaveProperty("id");
    expect(decision).toHaveProperty("hypothesis");
    expect(decision).toHaveProperty("confidence");
    expect(decision).toHaveProperty("alternatives");
  });

  it("learn() processes a memory without error", async () => {
    const mem = makeMem({ content: "learned something" });
    await qi.learn(mem);
    // Should not throw
  });
});
