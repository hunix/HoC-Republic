/**
 * Knowledge Base — Auto-Extraction
 *
 * Extracts key facts, preferences, and decisions from conversation
 * transcripts to build persistent knowledge automatically.
 */

import type { ExtractionResult, KnowledgeCategory } from "./types.js";

// ─── Pattern-Based Extraction ────────────────────────────────────

interface ExtractorRule {
  category: KnowledgeCategory;
  patterns: RegExp[];
  titlePrefix: string;
}

const EXTRACTOR_RULES: ExtractorRule[] = [
  {
    category: "preference",
    patterns: [
      /(?:i\s+(?:prefer|like|want|love|hate|dislike|always|never))\s+(.{10,100})/gi,
      /(?:my\s+(?:favorite|preferred|go-to))\s+(?:is|are)\s+(.{5,80})/gi,
      /(?:don't|do\s+not)\s+(?:use|want|like)\s+(.{5,80})/gi,
    ],
    titlePrefix: "Preference",
  },
  {
    category: "instruction",
    patterns: [
      /(?:always|never|make\s+sure\s+to|remember\s+to)\s+(.{10,120})/gi,
      /(?:the\s+rule\s+is|the\s+convention\s+is)\s+(.{10,120})/gi,
    ],
    titlePrefix: "Rule",
  },
  {
    category: "fact",
    patterns: [
      /(?:my\s+(?:name|email|company|role|title|team)\s+is)\s+(.{3,80})/gi,
      /(?:we\s+use|our\s+stack\s+is|our\s+(?:database|framework)\s+is)\s+(.{5,80})/gi,
      /(?:the\s+(?:api|endpoint|url|key)\s+is)\s+(.{5,120})/gi,
    ],
    titlePrefix: "Fact",
  },
  {
    category: "decision",
    patterns: [
      /(?:we\s+(?:decided|agreed|chose)\s+to)\s+(.{10,120})/gi,
      /(?:let's\s+(?:go\s+with|use|pick|choose))\s+(.{5,80})/gi,
    ],
    titlePrefix: "Decision",
  },
  {
    category: "context",
    patterns: [
      /(?:i'm\s+working\s+on|the\s+project\s+is|this\s+is\s+for)\s+(.{10,120})/gi,
      /(?:the\s+goal\s+is|we\s+need\s+to|the\s+deadline\s+is)\s+(.{10,100})/gi,
    ],
    titlePrefix: "Context",
  },
];

// ─── Extraction ──────────────────────────────────────────────────

/**
 * Extract knowledge entries from conversation text.
 * Uses pure regex rules — no LLM required, instant.
 */
export function extractKnowledge(conversationText: string): ExtractionResult {
  const lines = conversationText.split("\n").filter(Boolean);
  const facts: ExtractionResult["facts"] = [];
  const seen = new Set<string>();

  for (const rule of EXTRACTOR_RULES) {
    for (const pattern of rule.patterns) {
      // Reset regex state
      pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.exec(conversationText)) !== null) {
        const extracted = match[1]?.trim();
        if (!extracted || extracted.length < 5) {
          continue;
        }

        // Deduplicate by content fingerprint
        const fingerprint = extracted.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
        if (seen.has(fingerprint)) {
          continue;
        }
        seen.add(fingerprint);

        // Build a clean title
        const title = `${rule.titlePrefix}: ${extracted.slice(0, 60)}${extracted.length > 60 ? "…" : ""}`;

        facts.push({
          title,
          content: extracted,
          category: rule.category,
        });

        // Cap per rule to prevent flooding
        if (facts.filter((f) => f.category === rule.category).length >= 10) {
          break;
        }
      }
    }
  }

  return {
    facts: facts.slice(0, 50),
    turnsAnalyzed: lines.length,
  };
}

/**
 * Extract knowledge from a user message (single turn).
 * Lighter weight than full conversation extraction.
 */
export function extractFromMessage(message: string): ExtractionResult {
  return extractKnowledge(message);
}
