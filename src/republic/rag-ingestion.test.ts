/**
 * Agentic RAG + Document Ingestion — Combined Test Suite
 *
 * Phase 15: query decomposition, retrieval grading, response evaluation, metrics
 * Phase 16: format detection, text extraction, chunking, search
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  decomposeQuery,
  gradeRetrieval,
  agenticSearch,
  evaluateResponseQuality,
  trackEvalMetrics,
  getEvalTrend,
  registerSearchProvider,
  ragDiagnostics,
  resetRAGState,
} from "../republic/agentic-rag.js";
import {
  detectFormat,
  chunkText,
  ingestDocument,
  searchIngested,
  getIngestedDocument,
  listIngestedDocuments,
  deleteIngestedDocument,
  registerExtractor,
  ingestionDiagnostics,
  resetIngestionState,
} from "../republic/document-ingestion.js";

// ─── Phase 15: Agentic RAG ──────────────────────────────────────

describe("Agentic RAG", () => {
  beforeEach(() => {
    resetRAGState();
  });

  describe("decomposeQuery", () => {
    it("returns original query in results", () => {
      const result = decomposeQuery("What is TypeScript?");
      expect(result).toContain("What is TypeScript?");
    });

    it("splits on conjunctions", () => {
      const result = decomposeQuery("explain TypeScript and also describe Python");
      expect(result.length).toBeGreaterThan(1);
    });
  });

  describe("gradeRetrieval", () => {
    it("scores empty results as needing re-retrieval", () => {
      const grade = gradeRetrieval("TypeScript generics", []);
      expect(grade.relevance).toBe(0);
      expect(grade.needsReRetrieval).toBe(true);
    });

    it("scores matching results higher", () => {
      const grade = gradeRetrieval("TypeScript generics", [
        { id: "1", source: "memory", content: "TypeScript generics allow type parameterization", score: 0.9 },
        { id: "2", source: "memory", content: "Generics in TypeScript provide flexibility", score: 0.8 },
      ]);
      expect(grade.relevance).toBeGreaterThan(0.5);
      expect(grade.confidence).toBeGreaterThan(0);
    });
  });

  describe("agenticSearch", () => {
    it("works with no providers", () => {
      const result = agenticSearch("test query");
      expect(result.results.length).toBe(0);
      expect(result.rounds).toBeGreaterThan(0);
    });

    it("uses registered providers", () => {
      registerSearchProvider("memory", (query, _topK) => [
        { id: "1", source: "memory", content: `Result for ${query}`, score: 0.8 },
      ]);
      const result = agenticSearch("TypeScript");
      expect(result.results.length).toBeGreaterThan(0);
    });
  });

  describe("evaluateResponseQuality", () => {
    it("scores faithful answers higher", () => {
      const eval1 = evaluateResponseQuality(
        "What is TypeScript?",
        "TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.",
        ["TypeScript is a typed superset of JavaScript. It compiles to plain JavaScript."],
      );
      expect(eval1.faithfulness).toBeGreaterThan(0.3);
      expect(eval1.relevance).toBeGreaterThan(0.3);
    });

    it("detects hallucination risk", () => {
      const eval1 = evaluateResponseQuality(
        "What is TypeScript?",
        "TypeScript was invented in 2035 by aliens from Mars who wanted better web development tools.",
        ["TypeScript was created by Microsoft."],
      );
      expect(eval1.faithfulness).toBeLessThan(0.5);
    });

    it("scores completeness based on length", () => {
      const short = evaluateResponseQuality("Explain generics", "Generics.", []);
      const long = evaluateResponseQuality(
        "Explain generics",
        "Generics allow you to write reusable components that work with multiple types. They provide type safety while maintaining flexibility. In TypeScript, you can use angle brackets to define type parameters.",
        [],
      );
      expect(long.completeness).toBeGreaterThan(short.completeness);
    });
  });

  describe("Eval metrics tracking", () => {
    it("tracks and retrieves trends", () => {
      const eval1 = evaluateResponseQuality("q", "answer with some detail included", ["answer with some detail"]);
      trackEvalMetrics("cit-1", 100, eval1);
      trackEvalMetrics("cit-1", 101, eval1);
      trackEvalMetrics("cit-1", 102, eval1);

      const trend = getEvalTrend("cit-1");
      expect(trend.dataPoints).toBe(3);
      expect(trend.avgFaithfulness).toBeGreaterThan(0);
    });

    it("returns stable trend for same metrics", () => {
      const eval1 = evaluateResponseQuality("q", "answer", []);
      for (let i = 0; i < 6; i++) {
        trackEvalMetrics("cit-1", 100 + i, eval1);
      }
      const trend = getEvalTrend("cit-1");
      expect(trend.trend).toBe("stable");
    });
  });

  describe("diagnostics", () => {
    it("returns diagnostic info", () => {
      const diag = ragDiagnostics();
      expect(diag.totalSearches).toBe(0);
      expect(diag.totalEvals).toBe(0);
    });
  });
});

// ─── Phase 16: Document Ingestion ────────────────────────────────

describe("Document Ingestion", () => {
  beforeEach(() => {
    resetIngestionState();
  });

  describe("detectFormat", () => {
    it("detects JSON", () => {
      expect(detectFormat('{"key": "value"}')).toBe("json");
      expect(detectFormat('[]')).toBe("json");
    });

    it("detects HTML", () => {
      expect(detectFormat("<html><body>Hello</body></html>")).toBe("html");
    });

    it("detects Markdown", () => {
      expect(detectFormat("# Title\nSome content")).toBe("markdown");
    });

    it("detects URL", () => {
      expect(detectFormat("https://example.com")).toBe("url");
    });

    it("detects by extension", () => {
      expect(detectFormat("", "file.csv")).toBe("csv");
      expect(detectFormat("", "doc.pdf")).toBe("pdf");
      expect(detectFormat("", "audio.mp3")).toBe("audio");
    });
  });

  describe("chunkText", () => {
    it("creates chunks from text", () => {
      const text = Array(10).fill("This is a paragraph with some content.").join("\n\n");
      const chunks = chunkText(text, "doc-1");
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].documentId).toBe("doc-1");
      expect(chunks[0].tokenEstimate).toBeGreaterThan(0);
    });

    it("handles short text as single chunk", () => {
      const chunks = chunkText("Hello, world!", "doc-1");
      expect(chunks.length).toBe(1);
    });
  });

  describe("ingestDocument", () => {
    it("ingests plain text", () => {
      const result = ingestDocument("Hello, this is a test document.", "cit-1", { title: "Test" });
      expect(result.documentId).toBeDefined();
      expect(result.format).toBe("text");
      expect(result.chunksCreated).toBeGreaterThan(0);
    });

    it("ingests HTML with tag stripping", () => {
      const html = "<html><body><h1>Title</h1><p>Content here</p></body></html>";
      const result = ingestDocument(html, "cit-1", { filename: "page.html" });
      expect(result.format).toBe("html");

      const doc = getIngestedDocument(result.documentId);
      expect(doc).toBeDefined();
      expect(doc!.chunks[0].content).not.toContain("<h1>");
    });

    it("ingests JSON", () => {
      const json = JSON.stringify({ name: "Test", items: [1, 2, 3] });
      const result = ingestDocument(json, "cit-1");
      expect(result.format).toBe("json");
    });

    it("ingests CSV", () => {
      const csv = "Name,Age,City\nAlice,30,NYC\nBob,25,LA";
      const result = ingestDocument(csv, "cit-1", { filename: "data.csv" });
      expect(result.format).toBe("csv");
    });

    it("ingests Markdown", () => {
      const md = "# Welcome\nThis is **bold** and *italic* and `code`.";
      const result = ingestDocument(md, "cit-1");
      expect(result.format).toBe("markdown");
    });
  });

  describe("searchIngested", () => {
    it("finds matching chunks", () => {
      ingestDocument(
        "TypeScript is a programming language developed by Microsoft. It adds type safety to JavaScript.",
        "cit-1",
        { title: "TypeScript Intro" },
      );
      ingestDocument("Python is great for data science.", "cit-1", { title: "Python" });

      const results = searchIngested("TypeScript programming");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].documentTitle).toBe("TypeScript Intro");
    });

    it("filters by citizen", () => {
      ingestDocument("Content A", "cit-1");
      ingestDocument("Content A", "cit-2");

      const results = searchIngested("Content", { citizenId: "cit-1" });
      expect(results.length).toBe(1);
    });
  });

  describe("Document management", () => {
    it("lists documents", () => {
      ingestDocument("Doc A", "cit-1");
      ingestDocument("Doc B", "cit-1");
      ingestDocument("Doc C", "cit-2");

      expect(listIngestedDocuments().length).toBe(3);
      expect(listIngestedDocuments("cit-1").length).toBe(2);
    });

    it("deletes documents", () => {
      const result = ingestDocument("Delete me", "cit-1");
      expect(deleteIngestedDocument(result.documentId)).toBe(true);
      expect(getIngestedDocument(result.documentId)).toBeUndefined();
    });
  });

  describe("custom extractors", () => {
    it("uses registered extractors", () => {
      registerExtractor("pdf", (content) => ({
        text: `PDF extracted: ${content.slice(0, 20)}`,
        metadata: { pages: 1 },
      }));
      const result = ingestDocument("binary pdf content", "cit-1", { filename: "test.pdf" });
      expect(result.format).toBe("pdf");
      const doc = getIngestedDocument(result.documentId);
      expect(doc!.chunks[0].content).toContain("PDF extracted");
    });
  });

  describe("diagnostics", () => {
    it("returns format breakdown", () => {
      ingestDocument("text1", "cit-1");
      ingestDocument('{"json": true}', "cit-1");
      ingestDocument('{"json2": true}', "cit-1");

      const diag = ingestionDiagnostics();
      expect(diag.totalDocuments).toBe(3);
      expect(diag.formatBreakdown["json"]).toBe(2);
      expect(diag.formatBreakdown["text"]).toBe(1);
    });
  });
});
