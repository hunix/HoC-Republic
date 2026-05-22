/**
 * Deep Research Intent Classification — Route detection for the Deep Research Orchestrator.
 *
 * Determines whether a user message should be handled by the Deep Research
 * pipeline (multi-source web research → document generation) instead of the
 * general-purpose Sandbox Agent Loop.
 *
 * Key differentiator: The user wants a RESEARCH DOCUMENT produced from web
 * sources, not a CODE PROJECT. Messages like "research AI trends and make a
 * presentation" should route here, not to the Sandbox Agent Loop.
 *
 * Priority: This runs AFTER isSecurityIntent but BEFORE isProjectBuildIntent.
 */

import type { ResearchDepth, ResearchRequest } from "./deep-research-orchestrator.js";

export interface DeepResearchIntentResult {
  isDeepResearch: boolean;
  /** Extracted research query (cleaned of format/depth modifiers). */
  query: string;
  /** Inferred output format. */
  format: ResearchRequest["format"];
  /** Inferred research depth. */
  depth: ResearchDepth;
  /** Why it was/wasn't classified as deep research. */
  reason: string;
}

// ─── Research trigger keywords ──────────────────────────────────

/** Strong indicators: message is PRIMARILY about research + document output */
const RESEARCH_TRIGGERS: string[] = [
  "deep research",
  "in-depth research",
  "in depth research",
  "comprehensive research",
  "thorough research",
  "detailed research",
  "research report",
  "investigate and report",
  "investigative report",
  "market research",
  "market analysis",
  "competitive analysis",
  "industry analysis",
  "academic paper",
  "white paper",
  "whitepaper",
  "literature review",
  "systematic review",
  "research paper",
  "research study",
  "case study on",
  "feasibility study",
  "trend analysis",
  "state of the art",
  "state-of-the-art",
];

/** Compound: research verb + document format noun */
const RESEARCH_VERBS: string[] = [
  "research",
  "investigate",
  "study",
  "analyze",
  "analyse",
  "review",
  "survey",
  "explore",
  "examine",
  "assess",
  "evaluate",
  "compare",
  "benchmark",
];

/** Document output format nouns */
const FORMAT_NOUNS: string[] = [
  "report",
  "presentation",
  "powerpoint",
  "pptx",
  "slides",
  "deck",
  "pdf",
  "document",
  "paper",
  "brief",
  "memo",
  "summary",
  "overview",
  "analysis",
  "executive summary",
  "docx",
  "word document",
  "spreadsheet",
  "xlsx",
  "excel",
];

// ─── Format inference ───────────────────────────────────────────

function inferFormat(message: string): ResearchRequest["format"] {
  const lower = message.toLowerCase();

  if (/\b(powerpoint|pptx|presentation|slides|deck|slide deck)\b/.test(lower)) {
    return "pptx";
  }
  if (/\b(pdf)\b/.test(lower)) {
    return "pdf";
  }
  if (/\b(docx|word\s*document)\b/.test(lower)) {
    return "docx";
  }
  if (/\b(excel|xlsx|spreadsheet|csv)\b/.test(lower)) {
    return "xlsx";
  }
  if (/\b(html|web\s*page|webpage)\b/.test(lower)) {
    return "html";
  }

  // Default to pdf for research reports
  return "pdf";
}

// ─── Depth inference ────────────────────────────────────────────

function inferDepth(message: string): ResearchDepth {
  const lower = message.toLowerCase();

  if (/\b(quick|brief|short|fast|overview|summary|high-level|high level)\b/.test(lower)) {
    return "quick";
  }
  if (
    /\b(deep|in-depth|in depth|comprehensive|thorough|detailed|exhaustive|extensive|full|complete)\b/.test(
      lower,
    )
  ) {
    return "deep";
  }

  return "standard";
}

// ─── Query extraction ───────────────────────────────────────────

/** Remove format/depth modifiers from the message to extract the pure research query. */
function extractQuery(message: string): string {
  let query = message.trim();

  // Remove common prefixes
  query = query.replace(
    /^(please\s+|can you\s+|could you\s+|i want you to\s+|i need\s+|i'd like\s+|help me\s+)/i,
    "",
  );

  // Remove format requests
  query = query.replace(
    /\b(and\s+)?(make|create|generate|produce|write|give me|send me|export)\s+(a\s+|an\s+|me\s+|it\s+(as|to|in)\s+)?(comprehensive\s+|detailed\s+|thorough\s+|in-depth\s+)?(report|presentation|powerpoint|pptx|pdf|document|docx|slides|deck|paper|brief|memo|summary|spreadsheet|xlsx|excel|word document)\b/gi,
    "",
  );

  // Remove depth modifiers
  query = query.replace(
    /\b(deep|in-depth|in depth|comprehensive|thorough|detailed|exhaustive|extensive|quick|brief)\s+(research|analysis|study|review|investigation)\b/gi,
    "research",
  );

  // Remove leading research verb
  query = query.replace(
    /^(research|investigate|study|analyze|analyse|review|survey|explore|examine|assess|evaluate)\s+(on\s+|about\s+|into\s+|regarding\s+)?/i,
    "",
  );

  // Clean up
  query = query.replace(/\s+/g, " ").trim();

  // If cleaning removed too much, fall back to original
  if (query.length < 5) {
    return message.trim();
  }

  return query;
}

// ─── Guard: things that look like research but are actually code ─

const CODE_SIGNALS: RegExp[] = [
  /\b(build|code|develop|implement|scaffold|deploy|setup|set up|install|configure)\s+(a |an |the |me )/i,
  /\b(react|vue|angular|next\.?js|express|flask|django|fastapi|python\s+script|node\s+app)\b/i,
  /\b(database|schema|migration|api\s+endpoint|backend|frontend|fullstack|full-stack)\b/i,
  /\b(docker|container|kubernetes|ci\/cd)\b/i,
  /\b(git\s+clone|npm\s+install|pip\s+install)\b/i,
];

function looksLikeCode(message: string): boolean {
  return CODE_SIGNALS.some((p) => p.test(message));
}

// ─── Main Classifier ────────────────────────────────────────────

/**
 * Classify whether a chat message is a deep research request that should
 * be routed to the Deep Research Orchestrator.
 */
export function classifyDeepResearchIntent(message: string): DeepResearchIntentResult {
  const lower = message.toLowerCase().trim();
  const notResearch: DeepResearchIntentResult = {
    isDeepResearch: false,
    query: "",
    format: "pdf",
    depth: "standard",
    reason: "Not a deep research request",
  };

  // Too short
  if (lower.length < 12) {
    return notResearch;
  }

  // Guard: if it looks like a code project, don't intercept
  if (looksLikeCode(message)) {
    return { ...notResearch, reason: "Looks like a code project, not research" };
  }

  // ── Strong trigger match ───────────────────────────────────────
  for (const trigger of RESEARCH_TRIGGERS) {
    if (lower.includes(trigger)) {
      return {
        isDeepResearch: true,
        query: extractQuery(message),
        format: inferFormat(message),
        depth: inferDepth(message),
        reason: `Matched research trigger: "${trigger}"`,
      };
    }
  }

  // ── Compound: research verb + format noun ──────────────────────
  const hasResearchVerb = RESEARCH_VERBS.some((v) => {
    const re = new RegExp(`\\b${v}\\b`, "i");
    return re.test(lower);
  });
  const hasFormatNoun = FORMAT_NOUNS.some((n) => lower.includes(n));

  if (hasResearchVerb && hasFormatNoun) {
    return {
      isDeepResearch: true,
      query: extractQuery(message),
      format: inferFormat(message),
      depth: inferDepth(message),
      reason: "Matched research verb + document format noun",
    };
  }

  // ── "research X" at the start of the message ───────────────────
  // Only if combined with a clear output format request
  if (/^(research|investigate|study|analyze)\s+/i.test(lower) && hasFormatNoun) {
    return {
      isDeepResearch: true,
      query: extractQuery(message),
      format: inferFormat(message),
      depth: inferDepth(message),
      reason: "Starts with research verb + has format noun",
    };
  }

  return notResearch;
}
