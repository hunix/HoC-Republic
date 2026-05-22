/**
 * Search + RAG — Citation Tracker Tests
 *
 * Tests citation building, markdown formatting,
 * and inline citation marker insertion.
 */

import { describe, it, expect } from "vitest";
import type { SearchResult } from "./types.js";
import { buildCitations, formatCitationsMarkdown, insertCitationMarkers } from "./citations.js";

const MOCK_SOURCES: SearchResult[] = [
  {
    url: "https://example.com/article-1",
    title: "TypeScript Best Practices 2026",
    snippet:
      "TypeScript continues to dominate the enterprise landscape with its powerful type system and developer tooling.",
    content:
      "TypeScript best practices include strict mode, proper type narrowing, and avoiding any types.",
    rank: 1,
  },
  {
    url: "https://example.com/article-2",
    title: "Node.js Performance Guide",
    snippet:
      "Node.js performance can be improved through worker threads, caching, and connection pooling.",
    content:
      "Optimize Node.js applications with profiling, memory management, and event loop monitoring.",
    rank: 2,
  },
  {
    url: "https://example.com/article-3",
    title: "React Server Components Deep Dive",
    snippet:
      "React Server Components enable streaming HTML rendering and reduced client-side JavaScript.",
    content: "Server components split rendering between server and client for optimal performance.",
    rank: 3,
  },
];

describe("Citation Tracker", () => {
  describe("buildCitations", () => {
    it("builds citations from search results", () => {
      const citations = buildCitations(MOCK_SOURCES);
      expect(citations.length).toBe(3);
      expect(citations[0].index).toBe(1);
      expect(citations[0].url).toBe("https://example.com/article-1");
      expect(citations[0].title).toBe("TypeScript Best Practices 2026");
    });

    it("respects maxCitations limit", () => {
      const citations = buildCitations(MOCK_SOURCES, 2);
      expect(citations.length).toBe(2);
    });

    it("deduplicates by URL", () => {
      const duplicated = [...MOCK_SOURCES, MOCK_SOURCES[0]];
      const citations = buildCitations(duplicated);
      expect(citations.length).toBe(3); // not 4
    });

    it("returns sequential indices", () => {
      const citations = buildCitations(MOCK_SOURCES);
      expect(citations.map((c) => c.index)).toEqual([1, 2, 3]);
    });

    it("handles empty sources", () => {
      const citations = buildCitations([]);
      expect(citations.length).toBe(0);
    });

    it("truncates excerpt to 200 chars", () => {
      const longSource: SearchResult[] = [
        {
          url: "https://example.com/long",
          title: "Long Article",
          snippet: "x".repeat(300),
          rank: 1,
        },
      ];
      const citations = buildCitations(longSource);
      expect(citations[0].excerpt.length).toBeLessThanOrEqual(200);
    });
  });

  describe("formatCitationsMarkdown", () => {
    it("formats citations as markdown", () => {
      const citations = buildCitations(MOCK_SOURCES);
      const md = formatCitationsMarkdown(citations);
      expect(md).toContain("**Sources:**");
      expect(md).toContain("[1]");
      expect(md).toContain("[TypeScript Best Practices 2026]");
      expect(md).toContain("https://example.com/article-1");
    });

    it("returns empty string for no citations", () => {
      expect(formatCitationsMarkdown([])).toBe("");
    });
  });

  describe("insertCitationMarkers", () => {
    it("inserts markers into relevant paragraphs", () => {
      const citations = buildCitations(MOCK_SOURCES);
      const answer =
        "TypeScript is a powerful language with a type system.\n\n" +
        "Node.js performance is crucial for enterprise applications.";

      const annotated = insertCitationMarkers(answer, MOCK_SOURCES, citations);
      expect(annotated).toContain("[");
    });

    it("preserves answer when no citations", () => {
      const answer = "Some text without citations.";
      const result = insertCitationMarkers(answer, MOCK_SOURCES, []);
      expect(result).toBe(answer);
    });
  });
});
