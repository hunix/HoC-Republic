/**
 * Knowledge Base — Unit Tests
 *
 * Tests CRUD operations, keyword search, eviction,
 * auto-extraction, and diagnostics.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  addKnowledge,
  updateKnowledge,
  deleteKnowledge,
  getKnowledge,
  queryKnowledge,
  listKnowledge,
  getKnowledgeBaseDiagnostics,
  resetKnowledgeBase,
  addBulkKnowledge,
  exportKnowledge,
  importKnowledge,
} from "./core.js";
import { extractKnowledge } from "./extraction.js";

describe("Knowledge Base", () => {
  beforeEach(() => {
    resetKnowledgeBase();
  });

  // ─── CRUD ────────────────────────────────────────────────────────

  describe("CRUD operations", () => {
    it("adds and retrieves an entry", () => {
      const entry = addKnowledge({ title: "Test", content: "Test content" });

      expect(entry.id).toMatch(/^kb-/);
      expect(entry.title).toBe("Test");
      expect(entry.content).toBe("Test content");
      expect(entry.category).toBe("fact"); // default
      expect(entry.confidence).toBe(0.8); // default
      expect(entry.retrievalCount).toBe(0);

      const retrieved = getKnowledge(entry.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.retrievalCount).toBe(1); // incremented on get
    });

    it("updates an entry", () => {
      const entry = addKnowledge({ title: "Old", content: "Old content" });
      const updated = updateKnowledge(entry.id, { title: "New", category: "preference" });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe("New");
      expect(updated!.category).toBe("preference");
      expect(updated!.content).toBe("Old content"); // unchanged
    });

    it("returns null when updating nonexistent entry", () => {
      const result = updateKnowledge("nonexistent", { title: "x" });
      expect(result).toBeNull();
    });

    it("deletes an entry", () => {
      const entry = addKnowledge({ title: "Delete me", content: "Gone" });
      expect(deleteKnowledge(entry.id)).toBe(true);
      expect(getKnowledge(entry.id)).toBeNull();
    });

    it("returns false when deleting nonexistent entry", () => {
      expect(deleteKnowledge("nonexistent")).toBe(false);
    });

    it("truncates overly long title and content", () => {
      const entry = addKnowledge({
        title: "x".repeat(300),
        content: "y".repeat(6000),
      });
      expect(entry.title.length).toBeLessThanOrEqual(200);
      expect(entry.content.length).toBeLessThanOrEqual(5000);
    });

    it("clamps confidence to [0, 1]", () => {
      const hi = addKnowledge({ title: "Hi", content: "Hi", confidence: 5 });
      const lo = addKnowledge({ title: "Lo", content: "Lo", confidence: -1 });
      expect(hi.confidence).toBe(1);
      expect(lo.confidence).toBe(0);
    });
  });

  // ─── Search ──────────────────────────────────────────────────────

  describe("Search / Query", () => {
    it("finds entries by keyword overlap", () => {
      addKnowledge({ title: "TypeScript conventions", content: "Always use strict mode" });
      addKnowledge({ title: "Python style", content: "Use black formatter" });
      addKnowledge({ title: "Cooking recipe", content: "Mix flour with eggs" });

      const result = queryKnowledge({ query: "TypeScript coding conventions" });
      expect(result.entries.length).toBeGreaterThan(0);
      expect(result.entries[0].title).toContain("TypeScript");
    });

    it("filters by category", () => {
      addKnowledge({ title: "A fact", content: "Content A", category: "fact" });
      addKnowledge({ title: "A preference", content: "Content B", category: "preference" });

      const result = queryKnowledge({ query: "content", category: "preference" });
      expect(result.entries.every((e) => e.category === "preference")).toBe(true);
    });

    it("respects topK limit", () => {
      for (let i = 0; i < 20; i++) {
        addKnowledge({ title: `Item ${i}`, content: "data information results" });
      }
      const result = queryKnowledge({ query: "data information", topK: 5 });
      expect(result.entries.length).toBeLessThanOrEqual(5);
    });

    it("returns queryTimeMs as a number", () => {
      addKnowledge({ title: "Speed", content: "Fast lookup" });
      const result = queryKnowledge({ query: "speed" });
      expect(typeof result.queryTimeMs).toBe("number");
    });
  });

  // ─── List ────────────────────────────────────────────────────────

  describe("List", () => {
    it("lists all entries with pagination", () => {
      for (let i = 0; i < 10; i++) {
        addKnowledge({ title: `Entry ${i}`, content: "Content" });
      }
      const page1 = listKnowledge(0, 3);
      const page2 = listKnowledge(3, 3);
      expect(page1.length).toBe(3);
      expect(page2.length).toBe(3);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it("filters by category", () => {
      addKnowledge({ title: "F", content: "c", category: "fact" });
      addKnowledge({ title: "P", content: "c", category: "preference" });

      const facts = listKnowledge(0, 50, "fact");
      expect(facts.every((e) => e.category === "fact")).toBe(true);
    });
  });

  // ─── Bulk ────────────────────────────────────────────────────────

  describe("Bulk operations", () => {
    it("adds multiple entries at once", () => {
      const count = addBulkKnowledge([
        { title: "A", content: "a" },
        { title: "B", content: "b" },
        { title: "C", content: "c" },
      ]);
      expect(count).toBe(3);
      expect(exportKnowledge().length).toBe(3);
    });

    it("imports without overwriting existing", () => {
      const entry = addKnowledge({ title: "Existing", content: "x" });
      const imported = importKnowledge([
        { ...entry, title: "Overwritten" }, // same ID, should be skipped
        { ...entry, id: "new-id", title: "New" },
      ]);
      expect(imported).toBe(1); // only the new one
      expect(getKnowledge(entry.id)!.title).toBe("Existing"); // not overwritten
    });
  });

  // ─── Diagnostics ──────────────────────────────────────────────────

  describe("Diagnostics", () => {
    it("returns accurate category breakdown", () => {
      addKnowledge({ title: "F1", content: "c", category: "fact" });
      addKnowledge({ title: "F2", content: "c", category: "fact" });
      addKnowledge({ title: "P1", content: "c", category: "preference" });

      const diag = getKnowledgeBaseDiagnostics();
      expect(diag.totalEntries).toBe(3);
      expect(diag.categoryBreakdown["fact"]).toBe(2);
      expect(diag.categoryBreakdown["preference"]).toBe(1);
    });
  });
});

// ─── Extraction Tests ───────────────────────────────────────────────

describe("Knowledge Extraction", () => {
  it("extracts preferences", () => {
    const result = extractKnowledge("I prefer TypeScript over JavaScript for backend code");
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.facts[0].category).toBe("preference");
  });

  it("extracts facts about user identity", () => {
    const result = extractKnowledge("My name is Hani and my company is Hunix Labs");
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.facts.some((f) => f.category === "fact")).toBe(true);
  });

  it("extracts decisions", () => {
    const result = extractKnowledge("We decided to use PostgreSQL instead of MongoDB");
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.facts.some((f) => f.category === "decision")).toBe(true);
  });

  it("extracts instructions", () => {
    const result = extractKnowledge("Always use strict TypeScript mode with no any types");
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.facts.some((f) => f.category === "instruction")).toBe(true);
  });

  it("extracts context about projects", () => {
    const result = extractKnowledge("I'm working on an AI republic simulation called HoC");
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.facts.some((f) => f.category === "context")).toBe(true);
  });

  it("deduplicates identical extractions", () => {
    const result = extractKnowledge(
      "I prefer dark mode. I prefer dark mode again. I prefer dark mode once more.",
    );
    // Should not have 3 duplicates
    const prefs = result.facts.filter((f) => f.content.includes("dark mode"));
    expect(prefs.length).toBeLessThanOrEqual(1);
  });

  it("caps extractions per category", () => {
    // Generate many lines with preference patterns
    const lines = Array.from(
      { length: 30 },
      (_, i) => `I prefer option_${i} for my configuration`,
    ).join("\n");
    const result = extractKnowledge(lines);
    const prefs = result.facts.filter((f) => f.category === "preference");
    expect(prefs.length).toBeLessThanOrEqual(10);
  });
});
