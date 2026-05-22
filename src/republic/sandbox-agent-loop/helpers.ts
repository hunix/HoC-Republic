/**
 * Helpers extracted from sandbox-agent-loop.ts
 * Pure utility functions used during agent loop execution.
 */

// ── Stop-word set for keyword extraction ──────────────────────────
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "shall",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "and",
  "or",
  "but",
  "if",
  "for",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "up",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "please",
  "make",
  "create",
  "build",
  "write",
  "help",
  "want",
  "need",
]);

/** Extract significant keywords from a user message for task memory indexing */
export function extractKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 8);
}
