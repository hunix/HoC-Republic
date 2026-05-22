/**
 * Republic Platform — 6-Type Memory System Tests
 *
 * Tests for: episodic, semantic, procedural, working, social,
 * collective memory stores, consolidation, and serialization.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createEmptyMemory,
  getMemory,
  addEpisodicMemory,
  getRecentEpisodic,
  addSemanticMemory,
  getSemanticByDomain,
  getAllSemantic,
  recordProcedure,
  getTopSkills,
  setGoal,
  completeGoal,
  getActiveGoals,
  recordSocialInteraction,
  getRelationships,
  getRelationshipWith,
  addCollectiveMemory,
  getCollectiveByType,
  getCollectiveMemory,
  consolidateMemories,
  shouldConsolidate,
  exportMemoryState,
  importMemoryState,
  resetAllMemory,
} from "./memory.js";

// ─── Setup ──────────────────────────────────────────────────────

beforeEach(() => {
  resetAllMemory();
});

// ─── Initialization ─────────────────────────────────────────────

describe("Memory Initialization", () => {
  it("createEmptyMemory returns 6 empty stores", () => {
    const mem = createEmptyMemory();
    expect(mem.episodic).toEqual([]);
    expect(mem.semantic).toEqual([]);
    expect(mem.procedural).toEqual([]);
    expect(mem.working).toEqual([]);
    expect(mem.social).toEqual([]);
  });

  it("getMemory creates memory on first access", () => {
    const mem = getMemory("citizen-1");
    expect(mem).toBeDefined();
    expect(mem.episodic).toEqual([]);
  });

  it("getMemory returns same reference on subsequent access", () => {
    const mem1 = getMemory("citizen-1");
    const mem2 = getMemory("citizen-1");
    expect(mem1).toBe(mem2);
  });
});

// ─── Episodic Memory ────────────────────────────────────────────

describe("Episodic Memory", () => {
  it("adds a memory with generated id", () => {
    addEpisodicMemory("c1", {
      tick: 1,
      timestamp: "2025-01-01",
      description: "Discovered a new algorithm",
      valence: 0.8,
      importance: 0.9,
      involvedCitizenIds: [],
      tags: ["discovery"],
    });
    const memories = getRecentEpisodic("c1");
    expect(memories.length).toBe(1);
    expect(memories[0].description).toContain("algorithm");
    expect(memories[0].id).toBeTruthy();
  });

  it("returns most recent first", () => {
    for (let i = 0; i < 5; i++) {
      addEpisodicMemory("c1", {
        tick: i,
        timestamp: `2025-01-0${i + 1}`,
        description: `Event ${i}`,
        valence: 0.5,
        importance: 0.5,
        involvedCitizenIds: [],
        tags: [],
      });
    }
    const recent = getRecentEpisodic("c1", 3);
    expect(recent.length).toBe(3);
    // Most recent tick should be first
    expect(recent[0].tick).toBeGreaterThanOrEqual(recent[1].tick);
  });

  it("caps at MAX_EPISODIC (200)", () => {
    for (let i = 0; i < 210; i++) {
      addEpisodicMemory("c1", {
        tick: i,
        timestamp: new Date().toISOString(),
        description: `Event ${i}`,
        valence: 0.5,
        importance: 0.5,
        involvedCitizenIds: [],
        tags: [],
      });
    }
    const all = getRecentEpisodic("c1", 300);
    expect(all.length).toBeLessThanOrEqual(200);
  });
});

// ─── Semantic Memory ────────────────────────────────────────────

describe("Semantic Memory", () => {
  it("adds a piece of knowledge", () => {
    addSemanticMemory("c1", {
      content: "TypeScript is a typed superset of JavaScript",
      domain: "programming",
      source: "education",
      confidence: 0.9,
      learnedAt: 100,
    });
    const all = getAllSemantic("c1");
    expect(all.length).toBe(1);
    expect(all[0].content).toContain("TypeScript");
    expect(all[0].reinforcements).toBe(0);
  });

  it("reinforces duplicate knowledge", () => {
    addSemanticMemory("c1", {
      content: "Water boils at 100°C",
      domain: "science",
      source: "education",
      confidence: 0.7,
      learnedAt: 100,
    });
    addSemanticMemory("c1", {
      content: "Water boils at 100°C",
      domain: "science",
      source: "experience",
      confidence: 0.8,
      learnedAt: 200,
    });
    const all = getAllSemantic("c1");
    expect(all.length).toBe(1); // Same content → reinforced, not duplicated
    expect(all[0].reinforcements).toBeGreaterThan(0);
  });

  it("filters by domain", () => {
    addSemanticMemory("c1", {
      content: "Fact A",
      domain: "science",
      source: "education",
      confidence: 0.9,
      learnedAt: 100,
    });
    addSemanticMemory("c1", {
      content: "Fact B",
      domain: "programming",
      source: "education",
      confidence: 0.9,
      learnedAt: 100,
    });
    expect(getSemanticByDomain("c1", "science").length).toBe(1);
    expect(getSemanticByDomain("c1", "programming").length).toBe(1);
  });
});

// ─── Procedural Memory ──────────────────────────────────────────

describe("Procedural Memory", () => {
  it("records a tool/skill usage", () => {
    recordProcedure("c1", "debugging", "Use console.log to trace values", true, 100);
    const skills = getTopSkills("c1");
    expect(skills.length).toBe(1);
    expect(skills[0].skill).toBe("debugging");
    expect(skills[0].successCount).toBe(1);
  });

  it("tracks success and failure counts", () => {
    recordProcedure("c1", "testing", "Write unit tests", true, 1);
    recordProcedure("c1", "testing", "Write unit tests", true, 2);
    recordProcedure("c1", "testing", "Write unit tests", false, 3);
    const skills = getTopSkills("c1");
    const testing = skills.find((s) => s.skill === "testing");
    expect(testing).toBeDefined();
    expect(testing!.successCount).toBe(2);
    expect(testing!.failureCount).toBe(1);
  });

  it("getTopSkills returns sorted by proficiency", () => {
    for (let i = 0; i < 5; i++) {
      recordProcedure("c1", "skill-A", "Do A", true, i);
    }
    recordProcedure("c1", "skill-B", "Do B", true, 10);
    const top = getTopSkills("c1", 2);
    expect(top.length).toBe(2);
    expect(top[0].proficiency).toBeGreaterThanOrEqual(top[1].proficiency);
  });
});

// ─── Working Memory ─────────────────────────────────────────────

describe("Working Memory", () => {
  it("sets a goal", () => {
    setGoal("c1", {
      id: "goal-1",
      goal: "Fix the bug",
      priority: 8,
      setAt: 100,
      context: "Production issue",
      completed: false,
    });
    const goals = getActiveGoals("c1");
    expect(goals.length).toBe(1);
    expect(goals[0].goal).toBe("Fix the bug");
  });

  it("completes a goal", () => {
    setGoal("c1", {
      id: "goal-1",
      goal: "Deploy feature",
      priority: 5,
      setAt: 100,
      context: "",
      completed: false,
    });
    completeGoal("c1", "goal-1");
    expect(getActiveGoals("c1").length).toBe(0);
  });

  it("getActiveGoals returns only uncompleted", () => {
    setGoal("c1", {
      id: "g1",
      goal: "A",
      priority: 5,
      setAt: 1,
      context: "",
      completed: false,
    });
    setGoal("c1", {
      id: "g2",
      goal: "B",
      priority: 5,
      setAt: 2,
      context: "",
      completed: false,
    });
    completeGoal("c1", "g1");
    const active = getActiveGoals("c1");
    expect(active.length).toBe(1);
    expect(active[0].id).toBe("g2");
  });
});

// ─── Social Memory ──────────────────────────────────────────────

describe("Social Memory", () => {
  it("records a positive interaction", () => {
    recordSocialInteraction("c1", "c2", "Nova", true, 100);
    const rel = getRelationshipWith("c1", "c2");
    expect(rel).toBeDefined();
    expect(rel!.positiveInteractions).toBe(1);
    expect(rel!.trust).toBeGreaterThan(0);
  });

  it("records a negative interaction", () => {
    recordSocialInteraction("c1", "c3", "Shade", false, 100);
    const rel = getRelationshipWith("c1", "c3");
    expect(rel).toBeDefined();
    expect(rel!.negativeInteractions).toBe(1);
  });

  it("getRelationships returns sorted by trust", () => {
    recordSocialInteraction("c1", "c2", "Good Friend", true, 1);
    recordSocialInteraction("c1", "c2", "Good Friend", true, 2);
    recordSocialInteraction("c1", "c3", "Rival", false, 1);
    const rels = getRelationships("c1");
    expect(rels.length).toBe(2);
    expect(rels[0].trust).toBeGreaterThanOrEqual(rels[1].trust);
  });
});

// ─── Collective Memory ─────────────────────────────────────────

describe("Collective Memory", () => {
  it("adds a collective memory entry", () => {
    addCollectiveMemory({
      type: "law",
      content: "All citizens must contribute to the treasury",
      contributorId: "c1",
      addedAt: 100,
      importance: 0.8,
    });
    const all = getCollectiveMemory();
    expect(all.length).toBe(1);
    expect(all[0].type).toBe("law");
  });

  it("getCollectiveByType filters correctly", () => {
    addCollectiveMemory({ type: "law", content: "Law 1", contributorId: "c1", addedAt: 1, importance: 0.5 });
    addCollectiveMemory({ type: "discovery", content: "Discovery 1", contributorId: "c2", addedAt: 2, importance: 0.7 });
    addCollectiveMemory({ type: "law", content: "Law 2", contributorId: "c1", addedAt: 3, importance: 0.6 });

    expect(getCollectiveByType("law").length).toBe(2);
    expect(getCollectiveByType("discovery").length).toBe(1);
  });
});

// ─── Memory Consolidation ───────────────────────────────────────

describe("Memory Consolidation", () => {
  it("shouldConsolidate returns true at correct intervals", () => {
    expect(shouldConsolidate(50)).toBe(true);
    expect(shouldConsolidate(100)).toBe(true);
    // Tick 0 is excluded (guard: currentTick > 0)
    expect(shouldConsolidate(0)).toBe(false);
  });

  it("shouldConsolidate returns false between intervals", () => {
    expect(shouldConsolidate(1)).toBe(false);
    expect(shouldConsolidate(25)).toBe(false);
    expect(shouldConsolidate(49)).toBe(false);
  });

  it("consolidateMemories runs without error", () => {
    // Add some episodic memories to consolidate
    for (let i = 0; i < 10; i++) {
      addEpisodicMemory("c1", {
        tick: i,
        timestamp: new Date().toISOString(),
        description: `Programming event ${i}`,
        valence: 0.7,
        importance: 0.8,
        involvedCitizenIds: [],
        tags: ["programming"],
      });
    }
    expect(() => consolidateMemories("c1", 50)).not.toThrow();
  });
});

// ─── State Serialization ────────────────────────────────────────

describe("Memory State Serialization", () => {
  it("exportMemoryState returns valid structure", () => {
    addEpisodicMemory("c1", {
      tick: 1,
      timestamp: "2025-01-01",
      description: "Test",
      valence: 0.5,
      importance: 0.5,
      involvedCitizenIds: [],
      tags: [],
    });
    const state = exportMemoryState();
    expect(state.citizens).toBeDefined();
    expect(state.collective).toBeDefined();
    expect(state.citizens["c1"]).toBeDefined();
  });

  it("importMemoryState restores state", () => {
    addEpisodicMemory("c1", {
      tick: 1,
      timestamp: "2025-01-01",
      description: "Before export",
      valence: 0.5,
      importance: 0.5,
      involvedCitizenIds: [],
      tags: [],
    });
    const exported = exportMemoryState();

    resetAllMemory();
    expect(getRecentEpisodic("c1").length).toBe(0);

    importMemoryState(exported);
    expect(getRecentEpisodic("c1").length).toBe(1);
    expect(getRecentEpisodic("c1")[0].description).toBe("Before export");
  });

  it("round-trips episodic, semantic, and collective memories", () => {
    addEpisodicMemory("c1", {
      tick: 1,
      timestamp: "2025-01-01",
      description: "Episodic",
      valence: 0.5,
      importance: 0.5,
      involvedCitizenIds: [],
      tags: [],
    });
    addSemanticMemory("c1", {
      content: "Semantic fact",
      domain: "test",
      source: "education",
      confidence: 0.9,
      learnedAt: 1,
    });
    addCollectiveMemory({
      type: "achievement",
      content: "First test passed",
      contributorId: "c1",
      addedAt: 1,
      importance: 0.9,
    });

    const exported = exportMemoryState();
    resetAllMemory();
    importMemoryState(exported);

    expect(getRecentEpisodic("c1").length).toBe(1);
    expect(getAllSemantic("c1").length).toBe(1);
    expect(getCollectiveMemory().length).toBe(1);
  });
});
