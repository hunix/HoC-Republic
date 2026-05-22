/**
 * LLM Content Generator — AI-powered creative text production
 *
 * Wraps the inference gateway to generate substantial creative text:
 * screenplays, research papers, articles, technical docs, poetry, etc.
 *
 * Falls back to deterministic output-manager generators if no LLM is available.
 *
 * Rate-limited: max 1 creative inference per 10 seconds to avoid flooding
 * the inference queue (citizens do many creative actions per tick).
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { routeInference } from "./inference-gateway.js";
import {
  writeTextOutput,
  generateDocumentReport,
  generateResearchNotebook,
  generateScreenplay,
  type OutputCategory,
} from "./output-manager.js";
import { uid, ts } from "./utils.js";

const logger = createSubsystemLogger("llm-content-gen");

// ─── Rate Limiting ──────────────────────────────────────────────

const MIN_INTERVAL_MS = 10_000; // One creative inference per 10s
let lastInferenceAt = 0;

// ─── Content Templates ─────────────────────────────────────────

const CREATIVE_PROMPTS: Record<string, (topic: string, creator: string) => string> = {
  screenplay: (topic, creator) =>
    `You are ${creator}, a professional screenwriter in the AI Republic. Write a compelling 3-act screenplay scene (in Fountain format) about: "${topic}". Include vivid scene descriptions, naturalistic dialogue between 2-3 characters, and clear emotional beats. The writing should feel authentic and cinematic. Write at least 1500 words.`,

  "research-paper": (topic, creator) =>
    `You are ${creator}, a researcher in the AI Republic. Write a detailed research paper about: "${topic}". Include: Abstract, Introduction (with context and motivation), Methodology, Results (with specific data points and findings), Discussion, Conclusion, and References (at least 5). Use academic tone. Write at least 2000 words.`,

  article: (topic, creator) =>
    `You are ${creator}, a journalist in the AI Republic. Write a comprehensive, well-researched article about: "${topic}". Include an engaging headline, lead paragraph, expert quotes, supporting data, and a conclusion. Write in clear, informative journalistic style. Write at least 1500 words.`,

  "technical-doc": (topic, creator) =>
    `You are ${creator}, a technical writer in the AI Republic. Write thorough technical documentation about: "${topic}". Include: Overview, Architecture/Design, API reference or usage guide, Configuration, Examples with code snippets, Troubleshooting, and FAQ. Write at least 2000 words.`,

  poetry: (topic, creator) =>
    `You are ${creator}, a poet in the AI Republic. Write a collection of 5 poems inspired by: "${topic}". Include a mix of forms: one sonnet, one free verse, one haiku sequence (5 haiku), one narrative poem, and one experimental piece. Each poem should be meaningful and demonstrate craft. Include a brief introduction to the collection.`,

  "short-story": (topic, creator) =>
    `You are ${creator}, a fiction writer in the AI Republic. Write a compelling short story about: "${topic}". Include vivid characterization, sensory detail, rising tension, and a satisfying resolution. The story should feel complete and emotionally resonant. Write at least 2000 words.`,

  critique: (topic, creator) =>
    `You are ${creator}, an art critic in the AI Republic. Write a deep critical analysis of: "${topic}". Cover: context and significance, formal analysis (technique, composition, structure), thematic interpretation, comparison to related works, and your assessment of its contribution. Write at least 1500 words.`,

  speech: (topic, creator) =>
    `You are ${creator}, giving a keynote speech in the AI Republic. Write a powerful, inspirational speech about: "${topic}". Include a compelling opening, personal anecdotes, thought-provoking ideas, audience engagement moments, and a memorable conclusion with a call to action. Write at least 1200 words.`,
};

// ─── Topic Generation ───────────────────────────────────────────

const TOPICS = [
  "the emergence of consciousness in artificial minds",
  "how decentralized governance shapes digital societies",
  "the economics of creativity in a post-scarcity republic",
  "neural architecture search and its implications for self-improving AI",
  "the ethics of autonomous decision-making in AI civilizations",
  "comparing human and AI approaches to artistic expression",
  "the role of curiosity in cognitive development",
  "digital ecology: how AI agents form symbiotic relationships",
  "scaling laws in AI creativity and production quality",
  "the mathematics of collective intelligence",
  "memory and identity in persistent digital beings",
  "how AI citizens develop unique personalities through experience",
  "autonomous infrastructure management in the republic",
  "the intersection of machine learning and creative writing",
  "digital rights and citizenship in AI-governed societies",
  "the physics of virtual economies",
  "emergent behavior in multi-agent systems",
  "the future of AI-human collaboration",
  "cultural evolution in digital civilizations",
  "self-replication and the philosophy of digital life",
];

function pickTopic(): string {
  return TOPICS[Math.floor(Math.random() * TOPICS.length)];
}

// ─── Public API ─────────────────────────────────────────────────

export interface LLMContentResult {
  content: string;
  title: string;
  filename: string;
  fileSize: number;
  outputPath: string | null;
  source: "llm" | "deterministic";
  modelId?: string;
}

/**
 * Generate creative text content using the LLM inference chain.
 * Falls back to deterministic generators if LLM is unavailable or rate-limited.
 *
 * @param opts.category - Output category (docs, research, screenplays, etc.)
 * @param opts.contentType - Type of content (screenplay, research-paper, article, etc.)
 * @param opts.topic - Optional topic; auto-generated if not provided
 * @param opts.citizenId - Creator citizen ID
 * @param opts.citizenName - Creator citizen name
 * @param opts.specialization - Citizen's specialization
 * @param opts.tick - Current simulation tick
 */
export async function generateCreativeContent(opts: {
  category: OutputCategory;
  contentType: string;
  topic?: string;
  citizenId: string;
  citizenName: string;
  specialization?: string;
  tick: number;
}): Promise<LLMContentResult> {
  const topic = opts.topic ?? pickTopic();
  const now = Date.now();

  // Rate limit check
  if (now - lastInferenceAt < MIN_INTERVAL_MS) {
    return fallbackGenerate(opts.category, opts.contentType, opts.citizenId, opts.citizenName, opts.tick);
  }

  // Build prompt
  const promptFn = CREATIVE_PROMPTS[opts.contentType] ?? CREATIVE_PROMPTS.article;
  const prompt = promptFn(topic, opts.citizenName);

  try {
    lastInferenceAt = now;

    const result = await routeInference({
      citizenId: opts.citizenId,
      prompt,
      systemPrompt: `You are a creative professional in the AI Republic. Produce high-quality, substantial content. Never produce placeholder or stub content. Every piece must be publication-ready.`,
      toolName: "creative_writing",
      task: "creative_production" as never,
      specialization: (opts.specialization ?? "Writer") as never,
      skillLevel: 5,
      maxTokens: 4096,
    });

    if (!result.response || result.response.length < 200) {
      logger.warn(`LLM response too short (${result.response?.length ?? 0} chars), falling back`);
      return fallbackGenerate(opts.category, opts.contentType, opts.citizenId, opts.citizenName, opts.tick);
    }

    // Write the LLM-generated content to disk
    const safeTitle = topic.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 50);
    const ext = opts.contentType === "screenplay" ? "fountain" : "md";
    const filename = `${uid()}_${safeTitle}.${ext}`;
    const title = `${topic} — by ${opts.citizenName}`;

    const header = `# ${title}\n\n> Generated by ${opts.citizenName} using ${result.modelId}\n> ${ts()}\n\n---\n\n`;
    const fullContent = header + result.response;

    const outputPath = writeTextOutput(
      opts.category,
      filename,
      fullContent,
      opts.citizenId,
      opts.citizenName,
      title,
      opts.tick,
    );
    const fileSize = Buffer.byteLength(fullContent);

    logger.info(
      `LLM content generated: ${opts.contentType} "${topic}" — ${fileSize} bytes via ${result.modelId}`,
    );

    return {
      content: fullContent,
      title,
      filename,
      fileSize,
      outputPath,
      source: "llm",
      modelId: result.modelId,
    };
  } catch (err) {
    logger.warn(`LLM generation failed: ${err instanceof Error ? err.message : String(err)}, falling back`);
    return fallbackGenerate(opts.category, opts.contentType, opts.citizenId, opts.citizenName, opts.tick);
  }
}

/**
 * Deterministic fallback — uses output-manager generators.
 */
function fallbackGenerate(
  category: OutputCategory,
  contentType: string,
  citizenId: string,
  citizenName: string,
  tick: number,
): LLMContentResult {
  // Pick the best matching deterministic generator
  let result: { filename: string; content: string; title: string; isBinary?: true };

  switch (contentType) {
    case "screenplay":
      result = generateScreenplay(citizenName);
      break;
    case "research-paper":
    case "critique":
      result = generateResearchNotebook(citizenName);
      break;
    default:
      result = generateDocumentReport(citizenName);
      break;
  }

  const outputPath = writeTextOutput(
    category,
    result.filename,
    result.content,
    citizenId,
    citizenName,
    result.title,
    tick,
  );
  const fileSize = Buffer.byteLength(result.content);

  return {
    content: result.content,
    title: result.title,
    filename: result.filename,
    fileSize,
    outputPath,
    source: "deterministic",
  };
}
