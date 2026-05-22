/**
 * Search + RAG — Grounding Classifier Tests
 *
 * Validates the heuristic grounding classifier that determines
 * whether a query needs web search or can use model knowledge.
 */

import { describe, it, expect } from "vitest";
import { classifyGrounding, needsSearch } from "./grounding.js";

describe("Grounding Classifier", () => {
  // ─── Needs Search (temporal / factual) ──────────────────────────

  describe("needs_search classification", () => {
    it("flags recency queries", () => {
      const result = classifyGrounding("What happened today in the stock market?");
      expect(result.decision).toBe("needs_search");
      expect(result.isRecent).toBe(true);
    });

    it("flags year-specific queries", () => {
      const result = classifyGrounding("Who won the 2026 Super Bowl?");
      expect(result.decision).toBe("needs_search");
      expect(result.isRecent).toBe(true);
    });

    it("flags latest news queries", () => {
      const result = classifyGrounding("What's new with OpenAI this week?");
      expect(result.decision).toBe("needs_search");
      expect(result.isRecent).toBe(true);
    });

    it("flags URLs as needing web access", () => {
      const result = classifyGrounding("Check this page https://example.com/article for me");
      expect(result.decision).toBe("needs_search");
    });

    it("flags stock price queries", () => {
      const result = classifyGrounding("What is the current stock price of Apple?");
      expect(result.decision).toBe("needs_search");
    });
  });

  // ─── Model Knowledge (creative / coding) ────────────────────────

  describe("model_knowledge classification", () => {
    it("classifies code generation as model knowledge", () => {
      const result = classifyGrounding("Write a Python function to sort a list");
      expect(result.decision).toBe("model_knowledge");
    });

    it("classifies explanation queries as model knowledge", () => {
      const result = classifyGrounding("Explain how binary search works");
      expect(result.decision).toBe("model_knowledge");
    });

    it("classifies translation as model knowledge", () => {
      const result = classifyGrounding("Translate this paragraph to Arabic");
      expect(result.decision).toBe("model_knowledge");
    });

    it("classifies creative writing as model knowledge", () => {
      const result = classifyGrounding("Write a poem about the ocean");
      expect(result.decision).toBe("model_knowledge");
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles empty query", () => {
      const result = classifyGrounding("");
      expect(result).toHaveProperty("decision");
      expect(result).toHaveProperty("confidence");
    });

    it("returns confidence between 0 and 1", () => {
      const cases = [
        "What is the weather today?",
        "Write a Python script",
        "Tell me about cats",
        "Latest news on AI",
      ];
      for (const q of cases) {
        const result = classifyGrounding(q);
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(1);
      }
    });

    it("has all required signal flags", () => {
      const result = classifyGrounding("Test query");
      expect(result).toHaveProperty("isRecent");
      expect(result).toHaveProperty("isFactual");
      expect(result).toHaveProperty("hasNamedEntities");
      expect(typeof result.isRecent).toBe("boolean");
      expect(typeof result.isFactual).toBe("boolean");
      expect(typeof result.hasNamedEntities).toBe("boolean");
    });
  });

  // ─── needsSearch Helper ─────────────────────────────────────────

  describe("needsSearch() convenience function", () => {
    it("returns true for search-worthy queries", () => {
      expect(needsSearch("What happened in the news today?")).toBe(true);
    });

    it("returns false for model-knowledge queries", () => {
      expect(needsSearch("Write a function to reverse a string")).toBe(false);
    });
  });
});
