/**
 * Fine-Tune Pipeline — Dataset Builder Tests
 *
 * Tests Chat→ShareGPT, Document→Alpaca, Q&A, format conversion,
 * dataset validation, and JSONL export.
 */

import { describe, it, expect } from "vitest";
import {
  chatToShareGPT,
  documentToAlpaca,
  qaPairsToAlpaca,
  convertFormat,
  validateDataset,
  toJSONL,
} from "./dataset-builder.js";

describe("Dataset Builder", () => {
  // ─── Chat → ShareGPT ──────────────────────────────────────────

  describe("chatToShareGPT", () => {
    it("converts chat turns to ShareGPT format", () => {
      const convos = [
        [
          { role: "user" as const, content: "Hello, how are you?" },
          { role: "assistant" as const, content: "I'm doing great!" },
        ],
      ];
      const result = chatToShareGPT(convos);
      expect(result.length).toBe(1);
      expect(result[0].conversations).toEqual([
        { from: "human", value: "Hello, how are you?" },
        { from: "gpt", value: "I'm doing great!" },
      ]);
    });

    it("handles system messages", () => {
      const convos = [
        [
          { role: "system" as const, content: "You are helpful" },
          { role: "user" as const, content: "Hi" },
          { role: "assistant" as const, content: "Hello!" },
        ],
      ];
      const result = chatToShareGPT(convos);
      expect(result[0].conversations[0].from).toBe("system");
    });

    it("filters out empty turns", () => {
      const convos = [
        [
          { role: "user" as const, content: "Hello" },
          { role: "assistant" as const, content: "" },
          { role: "assistant" as const, content: "Response" },
        ],
      ];
      const result = chatToShareGPT(convos);
      expect(result[0].conversations.length).toBe(2);
    });

    it("handles multiple conversations", () => {
      const convos = [
        [
          { role: "user" as const, content: "Q1" },
          { role: "assistant" as const, content: "A1" },
        ],
        [
          { role: "user" as const, content: "Q2" },
          { role: "assistant" as const, content: "A2" },
        ],
      ];
      const result = chatToShareGPT(convos);
      expect(result.length).toBe(2);
    });
  });

  // ─── Document → Alpaca ─────────────────────────────────────────

  describe("documentToAlpaca", () => {
    it("chunks a document into instruction-output pairs", () => {
      const doc = [
        "This is the first paragraph about TypeScript and its type system. It provides static type checking and interfaces for better code quality.",
        "",
        "This is the second paragraph about Node.js runtime. It uses V8 engine and provides non-blocking I/O for high-performance applications.",
      ].join("\n");

      const result = documentToAlpaca(doc);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].instruction).toContain("Explain the following:");
      expect(result[0].output).toBeTruthy();
    });

    it("skips short paragraphs under 50 chars", () => {
      const doc =
        "Short.\n\nAlso short.\n\nThis paragraph is long enough to be included in the dataset as a meaningful training sample for fine-tuning.";
      const result = documentToAlpaca(doc);
      // Only the long paragraph should produce an entry
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });

  // ─── Q&A Pairs ─────────────────────────────────────────────────

  describe("qaPairsToAlpaca", () => {
    it("converts Q&A pairs to Alpaca format", () => {
      const pairs = [
        { question: "What is TypeScript?", answer: "A typed superset of JavaScript" },
        {
          question: "What is Deno?",
          answer: "A JavaScript/TypeScript runtime",
          context: "Node alternative",
        },
      ];
      const result = qaPairsToAlpaca(pairs);
      expect(result.length).toBe(2);
      expect(result[0].instruction).toBe("What is TypeScript?");
      expect(result[0].output).toBe("A typed superset of JavaScript");
      expect(result[1].input).toBe("Node alternative");
    });
  });

  // ─── Format Conversion ─────────────────────────────────────────

  describe("convertFormat", () => {
    it("converts ShareGPT → Alpaca", () => {
      const entries = [
        {
          conversations: [
            { from: "human" as const, value: "What is AI?" },
            { from: "gpt" as const, value: "Artificial Intelligence" },
          ],
        },
      ];
      const result = convertFormat(entries, "sharegpt", "alpaca");
      expect(result[0].instruction).toBe("What is AI?");
      expect(result[0].output).toBe("Artificial Intelligence");
    });

    it("converts Alpaca → ShareGPT", () => {
      const entries = [
        { instruction: "What is AI?", input: "", output: "Artificial Intelligence" },
      ];
      const result = convertFormat(entries, "alpaca", "sharegpt");
      expect(result[0].conversations).toBeDefined();
      expect(result[0].conversations!.length).toBe(2); // human + gpt
    });

    it("returns same when formats match", () => {
      const entries = [{ instruction: "X", input: "", output: "Y" }];
      const result = convertFormat(entries, "alpaca", "alpaca");
      expect(result).toBe(entries);
    });
  });

  // ─── Validation ────────────────────────────────────────────────

  describe("validateDataset", () => {
    it("validates Alpaca dataset", () => {
      const entries = [
        { instruction: "What is TypeScript?", input: "", output: "A typed superset" },
        { instruction: "What is Deno?", input: "", output: "A runtime" },
      ];
      const stats = validateDataset(entries, "alpaca");
      expect(stats.totalSamples).toBe(2);
      expect(stats.avgTokenEstimate).toBeGreaterThan(0);
      expect(stats.emptyOutputs).toBe(0);
      expect(stats.format).toBe("alpaca");
    });

    it("detects empty outputs", () => {
      const entries = [
        { instruction: "Q", input: "", output: "" },
        { instruction: "Q2", input: "", output: "A2" },
      ];
      const stats = validateDataset(entries, "alpaca");
      expect(stats.emptyOutputs).toBe(1);
    });

    it("handles empty dataset", () => {
      const stats = validateDataset([], "alpaca");
      expect(stats.totalSamples).toBe(0);
      expect(stats.avgTokenEstimate).toBe(0);
    });
  });

  // ─── JSONL Export ──────────────────────────────────────────────

  describe("toJSONL", () => {
    it("exports entries as newline-delimited JSON", () => {
      const entries = [
        { instruction: "Q1", input: "", output: "A1" },
        { instruction: "Q2", input: "", output: "A2" },
      ];
      const jsonl = toJSONL(entries);
      const lines = jsonl.split("\n");
      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0]).instruction).toBe("Q1");
      expect(JSON.parse(lines[1]).instruction).toBe("Q2");
    });
  });
});
