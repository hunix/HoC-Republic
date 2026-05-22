/**
 * Republic Platform — Deep Research Orchestrator
 *
 * Manus-style autonomous research pipeline:
 *   1. PLAN    — LLM decomposes the query into sub-topics + assigns citizen roles
 *   2. SEARCH  — FireCrawl (or DuckDuckGo fallback) finds 10-30 sources per topic
 *   3. EXTRACT — Scrape each source for clean markdown content
 *   4. SYNTH   — LLM synthesises all content into structured sections
 *   5. WRITE   — document-generator produces the requested output format
 *
 * Triggered by:
 *   - citizen tool: deep_research
 *   - gateway RPC:  republic.research.start
 *   - React UI:     ResearchStudio page
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  generateHTML,
  generateMarkdown,
  generatePDF,
  generatePresentation,
  generateSpreadsheet,
  type DocumentFormat,
  type DocumentSection,
  type DocumentSpec,
  type PresentationSpec,
  type SpreadsheetSpec,
} from "./document-generator.js";
import { firecrawlSearch, firecrawlScrapeMany, isFirecrawlConfigured } from "./firecrawl-client.js";
import { uid, ts } from "./utils.js";

// ─── Types ───────────────────────────────────────────────────────

export type ResearchDepth = "quick" | "standard" | "deep";
export type ResearchStatus =
  | "queued"
  | "planning"
  | "searching"
  | "extracting"
  | "synthesizing"
  | "writing"
  | "done"
  | "failed";

export interface ResearchRequest {
  query: string;
  /** Output format */
  format: DocumentFormat | "docx";
  depth: ResearchDepth;
  /** Requesting citizen / user ID */
  requestedBy?: string;
  /** Extra context / requirements (e.g. "focus on commercial applications") */
  context?: string;
  /** If true, also produce a markdown version alongside the main format */
  alsoMarkdown?: boolean;
}

export interface ResearchPlan {
  title: string;
  executiveSummary: string;
  subTopics: string[];
  keyQuestions: string[];
  researchStrategy: string;
}

export interface ResearchJob {
  id: string;
  request: ResearchRequest;
  status: ResearchStatus;
  plan?: ResearchPlan;
  progress: {
    phase: ResearchStatus;
    phasePct: number; // 0-100
    totalSources: number;
    extractedSources: number;
    sectionsWritten: number;
  };
  /** Final generated document info */
  result?: {
    filePath: string;
    downloadUrl: string;
    format: string;
    sizeKb: number;
    pageCount: number;
    markdownPath?: string;
  };
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Brief log of pipeline steps */
  log: string[];
}

// ─── Constants ────────────────────────────────────────────────────

const DEPTH_CONFIG: Record<
  ResearchDepth,
  { topics: number; sourcesPerTopic: number; maxSections: number }
> = {
  quick: { topics: 2, sourcesPerTopic: 5, maxSections: 4 },
  standard: { topics: 4, sourcesPerTopic: 8, maxSections: 8 },
  deep: { topics: 6, sourcesPerTopic: 12, maxSections: 12 },
};

const OUTPUT_DIR = path.join(process.cwd(), "republic-output", "research");

// ─── Job Store ────────────────────────────────────────────────────

const jobs = new Map<string, ResearchJob>();
const MAX_JOBS = 200;

function saveJob(job: ResearchJob): void {
  job.updatedAt = ts();
  jobs.set(job.id, job);

  // Persist to disk for durability
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, `job-${job.id}.json`), JSON.stringify(job, null, 2));
  } catch {
    /* non-critical */
  }

  // Trim oldest
  if (jobs.size > MAX_JOBS) {
    const oldest = jobs.keys().next().value;
    if (oldest) {
      jobs.delete(oldest);
    }
  }
}

function jobLog(job: ResearchJob, msg: string): void {
  const entry = `[${new Date().toISOString()}] ${msg}`;
  job.log.push(entry);
  console.log(`[DeepResearch:${job.id}] ${msg}`);
  saveJob(job);
}

// ─── LLM Helper ──────────────────────────────────────────────────

const GEMINI_KEY = () => process.env.GEMINI_API_KEY ?? "";
const OPENAI_KEY = () => process.env.OPENAI_API_KEY ?? "";
const ANTHROPIC_KEY = () => process.env.ANTHROPIC_API_KEY ?? "";
const OLLAMA_URL = () => process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";

async function llmGenerate(system: string, prompt: string, maxTokens = 4096): Promise<string> {
  // Try each provider in cascade: Gemini → OpenAI → Anthropic → Ollama
  const errors: string[] = [];

  if (GEMINI_KEY()) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY()}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
          }),
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (resp.ok) {
        const data = (await resp.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
      }
      errors.push(`Gemini ${resp.status}`);
    } catch (e) {
      errors.push(`Gemini: ${String(e)}`);
    }
  }

  if (OPENAI_KEY()) {
    try {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY()}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          return text;
        }
      }
      errors.push(`OpenAI ${resp.status}`);
    } catch (e) {
      errors.push(`OpenAI: ${String(e)}`);
    }
  }

  if (ANTHROPIC_KEY()) {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-3-5-20241022",
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { content?: Array<{ text?: string }> };
        const text = data.content?.[0]?.text;
        if (text) {
          return text;
        }
      }
      errors.push(`Anthropic ${resp.status}`);
    } catch (e) {
      errors.push(`Anthropic: ${String(e)}`);
    }
  }

  // Ollama fallback (local)
   try {
    const resp = await fetch(`${OLLAMA_URL()}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.2", prompt: `${system}\n\n${prompt}`, stream: false }),
      signal: AbortSignal.timeout(120_000),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { response?: string };
      if (data.response) {
           return data.response;
      }
    }
    errors.push(`Ollama ${resp.status}`);
  } catch (e) {
    errors.push(`Ollama: ${String(e)}`);
  }

  // Hard fallback: template-based output (always works)
  return `Research synthesis for the requested topic. LLM providers unavailable (${errors.join(", ")}). Please configure GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or ensure Ollama is running.`;
}

// ─── Phase 1: Planning ────────────────────────────────────────────

async function planResearch(job: ResearchJob): Promise<ResearchPlan> {
  const { query, depth, context } = job.request;
  const cfg = DEPTH_CONFIG[depth];

  jobLog(job, `Planning research: "${query}" (depth: ${depth}, ${cfg.topics} sub-topics)`);

  const systemPrompt = `You are a world-class research director. Given a research request, decompose it into sub-topics and questions. Respond in JSON only.`;

  const userPrompt = `Research request: "${query}"
${context ? `Additional context: ${context}` : ""}
Depth: ${depth} (${cfg.topics} sub-topics, ${cfg.sourcesPerTopic} sources each)

Respond with valid JSON in this exact schema:
{
  "title": "Full research title",
  "executiveSummary": "2-3 sentence summary of what we will research",
  "subTopics": ["sub-topic 1", "sub-topic 2", ...],
  "keyQuestions": ["Question 1?", "Question 2?", ...],
  "researchStrategy": "Brief description of the research approach"
}

Generate exactly ${cfg.topics} sub-topics and ${cfg.topics * 2} key questions.`;

  const raw = await llmGenerate(systemPrompt, userPrompt, 2048);

  // Parse JSON safely
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as ResearchPlan;
      if (parsed.title && Array.isArray(parsed.subTopics)) {
        parsed.subTopics = parsed.subTopics.slice(0, cfg.topics);
        parsed.keyQuestions = (parsed.keyQuestions ?? []).slice(0, cfg.topics * 2);
        return parsed;
      }
    }
  } catch {
    /* fall through to default */
  }

  // Fallback plan
  return {
    title: `Research: ${query}`,
    executiveSummary: `Comprehensive research on "${query}" across ${cfg.topics} key dimensions.`,
    subTopics: Array.from({ length: cfg.topics }, (_, i) => `${query} — Aspect ${i + 1}`),
    keyQuestions: [
      `What is ${query}?`,
      `Latest developments in ${query}?`,
      `Future of ${query}?`,
      `Key challenges in ${query}?`,
    ],
    researchStrategy: `Systematic web research using ${isFirecrawlConfigured() ? "FireCrawl" : "DuckDuckGo"} + LLM synthesis`,
  };
}

// ─── Phase 2 & 3: Search + Extract ───────────────────────────────

interface ExtractedSource {
  url: string;
  title: string;
  topic: string;
  content: string;
  wordCount: number;
}

async function searchAndExtract(job: ResearchJob, plan: ResearchPlan): Promise<ExtractedSource[]> {
  const cfg = DEPTH_CONFIG[job.request.depth];
  const allSources: ExtractedSource[] = [];

  job.progress.phase = "searching";
  saveJob(job);

  // Search for each sub-topic
  const searchResults: Array<{ url: string; title: string; topic: string }> = [];

  for (const topic of plan.subTopics) {
    jobLog(job, `Searching: "${topic}"`);
    const results = await firecrawlSearch(
      `${job.request.query} ${topic}`,
      cfg.sourcesPerTopic,
    ).catch(() => []);

    // If FireCrawl already returned markdown content, use it directly
    for (const r of results) {
      searchResults.push({ url: r.url, title: r.title, topic });
      if (r.markdown && r.markdown.length > 200) {
        allSources.push({
          url: r.url,
          title: r.title,
          topic,
          content: r.markdown.slice(0, 8_000),
          wordCount: r.markdown.split(/\s+/).length,
        });
        job.progress.extractedSources++;
      }
    }

    job.progress.totalSources += results.length;
    saveJob(job);
  }

  // Extract remaining URLs (those without inline markdown)
  job.progress.phase = "extracting";
  saveJob(job);

  const urlsToScrape = searchResults
    .filter((r) => !allSources.find((s) => s.url === r.url))
    .map((r) => r.url);

  if (urlsToScrape.length > 0) {
    jobLog(job, `Scraping ${urlsToScrape.length} pages...`);
    const scraped = await firecrawlScrapeMany(urlsToScrape, {
      minWordCount: 150,
      maxConcurrency: 5,
    });

    for (const s of scraped) {
      const meta = searchResults.find((r) => r.url === s.url);
      allSources.push({
        url: s.url,
        title: s.title,
        topic: meta?.topic ?? plan.subTopics[0],
        content: s.markdown.slice(0, 8_000),
        wordCount: s.wordCount,
      });
      job.progress.extractedSources++;
    }
    saveJob(job);
  }

  jobLog(job, `Extraction complete: ${allSources.length} usable sources`);
  return allSources;
}

// ─── Phase 4: Synthesis ───────────────────────────────────────────

interface SynthesisSection {
  heading: string;
  content: string;
  sources: string[];
}

async function synthesizeResearch(
  job: ResearchJob,
  plan: ResearchPlan,
  sources: ExtractedSource[],
): Promise<SynthesisSection[]> {
  const cfg = DEPTH_CONFIG[job.request.depth];
  job.progress.phase = "synthesizing";
  saveJob(job);

  jobLog(job, `Synthesizing ${sources.length} sources into ${cfg.maxSections} sections...`);

  const sections: SynthesisSection[] = [];

  // Group sources by topic
  const byTopic = new Map<string, ExtractedSource[]>();
  for (const src of sources) {
    const group = byTopic.get(src.topic) ?? [];
    group.push(src);
    byTopic.set(src.topic, group);
  }

  // Executive summary always first
  const allContent = sources
    .slice(0, 8)
    .map((s) => `[${s.title}]\n${s.content.slice(0, 1500)}`)
    .join("\n\n---\n\n");

  const execSummaryText = await llmGenerate(
    `You are an expert research writer. Synthesize source material into clear, professional prose. Be specific and data-driven.`,
    `Write a comprehensive executive summary (300-500 words) for this research:
Topic: ${job.request.query}
Plan: ${plan.executiveSummary}

Sources:
${allContent.slice(0, 8000)}

Write only the section content, no headings. Use markdown formatting for emphasis.`,
    1500,
  );

  sections.push({
    heading: "Executive Summary",
    content: execSummaryText,
    sources: sources.slice(0, 3).map((s) => s.url),
  });
  job.progress.sectionsWritten++;

  // One section per sub-topic
  for (const [topic, topicSources] of byTopic) {
    if (sections.length >= cfg.maxSections) {
      break;
    }

    const topicContent = topicSources
      .slice(0, 4)
      .map((s) => `Source: ${s.title}\n${s.content.slice(0, 2000)}`)
      .join("\n\n---\n\n");

    const sectionText = await llmGenerate(
      `You are an expert research writer. Write clear, analytical, factual content. Use markdown for structure.`,
      `Write a detailed research section (200-400 words) about: "${topic}"
This is part of a larger research report about: "${job.request.query}"

Source material:
${topicContent.slice(0, 6000)}

Key questions to address: ${plan.keyQuestions.slice(0, 2).join(" | ")}

Write the section content only, no heading. Use bullet points, bold text, and clear paragraphs.`,
      1200,
    );

    sections.push({
      heading: topic,
      content: sectionText,
      sources: topicSources.map((s) => s.url),
    });
    job.progress.sectionsWritten++;
    saveJob(job);
  }

  // Conclusions + recommendations
  if (sections.length < cfg.maxSections) {
    const conclusionText = await llmGenerate(
      `You are an expert research analyst. Write actionable, specific conclusions.`,
      `Based on this research about "${job.request.query}", write conclusions and recommendations (200-300 words).
Key findings from ${sources.length} sources covering: ${plan.subTopics.join(", ")}.
Focus on: actionable insights, future outlook, and key takeaways.`,
      1000,
    );

    sections.push({
      heading: "Conclusions & Recommendations",
      content: conclusionText,
      sources: [],
    });
    job.progress.sectionsWritten++;
  }

  // References section
  const uniqueUrls = [...new Set(sources.map((s) => s.url))].slice(0, 20);
  sections.push({
    heading: "References & Sources",
    content: uniqueUrls
      .map((url, i) => {
        const src = sources.find((s) => s.url === url);
        return `${i + 1}. [${src?.title ?? url}](${url})`;
      })
      .join("\n"),
    sources: uniqueUrls,
  });

  jobLog(job, `Synthesis complete: ${sections.length} sections`);
  return sections;
}

// ─── Phase 5: Document Writing ────────────────────────────────────

async function writeDocument(
  job: ResearchJob,
  plan: ResearchPlan,
  sections: SynthesisSection[],
): Promise<{ filePath: string; sizeKb: number; pageCount: number; markdownPath?: string }> {
  job.progress.phase = "writing";
  saveJob(job);

  const { format, alsoMarkdown } = job.request;
  const outputDir = path.join(OUTPUT_DIR, job.id);
  fs.mkdirSync(outputDir, { recursive: true });

  const safeTitle = plan.title
    .replace(/[^a-z0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);
  const docSections: DocumentSection[] = sections.map((s) => ({
    heading: s.heading,
    content: s.content,
    type: "text" as const,
  }));

  const docSpec: DocumentSpec = {
    title: plan.title,
    format: (format === "docx" ? "md" : format),
    author: "HoC Republic Research Team",
    sections: docSections,
    metadata: {
      query: job.request.query,
      depth: job.request.depth,
      sources: String(sections.at(-1)?.sources.length ?? 0),
    },
  };

  let filePath: string;
  let pageCount = docSections.length;

  jobLog(job, `Writing ${format} document: "${plan.title}"`);

  switch (format) {
    case "pdf": {
      filePath = path.join(outputDir, `${safeTitle}.pdf`);
      const pdfDoc = await generatePDF(docSpec, filePath, job.request.requestedBy ?? "research");
      pageCount = pdfDoc.pageCount;
      break;
    }

    case "pptx": {
      // Build presentation format
      const pptSpec: PresentationSpec = {
        title: plan.title,
        subtitle: job.request.query,
        author: "HoC Republic Research Team",
        theme: "dark",
        slides: [
          {
            title: plan.title,
            bullets: plan.keyQuestions.slice(0, 4),
            notes: plan.executiveSummary,
            layout: "title",
          },
          ...sections.slice(0, -1).map((s) => ({
            title: s.heading,
            bullets: s.content
              .split("\n")
              .filter((l) => l.startsWith("- ") || l.startsWith("• ") || l.match(/^\d+\./))
              .map((l) => l.replace(/^[-•\d.]\s*/, "").slice(0, 120))
              .filter(Boolean)
              .slice(0, 6),
            notes: s.content.slice(0, 300),
            layout: "content" as const,
          })),
          {
            title: "Summary & Next Steps",
            bullets: (sections.find((s) => s.heading.includes("Conclusion"))?.content ?? "")
              .split("\n")
              .filter((l) => l.trim().length > 20)
              .slice(0, 5)
              .map((l) => l.slice(0, 120)),
            layout: "content",
          },
        ],
      };
      filePath = path.join(outputDir, `${safeTitle}.pptx`);
      void (await generatePresentation(pptSpec, filePath, job.request.requestedBy ?? "research"));
      pageCount = pptSpec.slides.length;
      break;
    }

    case "xlsx": {
      // Structured spreadsheet
      const xlsxSpec: SpreadsheetSpec = {
        title: plan.title,
        sheets: [
          {
            name: "Research Summary",
            headers: ["Section", "Content Summary", "Source Count"],
            rows: sections.map((s) => [
              s.heading,
              s.content.slice(0, 200).replace(/\n/g, " "),
              s.sources.length,
            ]),
          },
          {
            name: "All Sources",
            headers: ["#", "URL", "Topic", "Title"],
            rows: [...new Set(sections.flatMap((s) => s.sources))].map((url, i) => {
              const src = sections.find((s) => s.sources.includes(url));
              return [i + 1, url, src?.heading ?? "General", url.split("/").slice(-1)[0] ?? url];
            }),
          },
          {
            name: "Key Questions",
            headers: ["#", "Question", "Status"],
            rows: plan.keyQuestions.map((q, i) => [i + 1, q, "Researched ✓"]),
          },
        ],
      };
      filePath = path.join(outputDir, `${safeTitle}.xlsx`);
      void (await generateSpreadsheet(xlsxSpec, filePath, job.request.requestedBy ?? "research"));
      pageCount = xlsxSpec.sheets.length;
      break;
    }

    case "html": {
      filePath = path.join(outputDir, `${safeTitle}.html`);
      const htmlDoc = await generateHTML(
        { ...docSpec, format: "html" },
        filePath,
        job.request.requestedBy ?? "research",
      );
      pageCount = htmlDoc.pageCount;
      break;
    }

    case "docx": {
      // Try docx package, fallback to markdown with .docx extension
      filePath = path.join(outputDir, `${safeTitle}.docx`);
      try {
        const docxContent = await generateDOCX(docSpec, filePath);
        pageCount = docxContent;
      } catch {
        // Fallback: save as markdown
        filePath = path.join(outputDir, `${safeTitle}.md`);
        await generateMarkdown(
          { ...docSpec, format: "md" },
          filePath,
          job.request.requestedBy ?? "research",
        );
      }
      break;
    }

    case "md":
    default: {
      filePath = path.join(outputDir, `${safeTitle}.md`);
      const mdDoc = await generateMarkdown(
        { ...docSpec, format: "md" },
        filePath,
        job.request.requestedBy ?? "research",
      );
      pageCount = mdDoc.pageCount;
      break;
    }
  }

  // Also save markdown if requested and format is not already markdown
  let markdownPath: string | undefined;
  if (alsoMarkdown && format !== "md") {
    const mdPath = path.join(outputDir, `${safeTitle}.md`);
    await generateMarkdown(
      { ...docSpec, format: "md" },
      mdPath,
      job.request.requestedBy ?? "research",
    ).catch(() => {});
    markdownPath = mdPath;
  }

  const stat = fs.statSync(filePath);
  jobLog(
    job,
    `Document written: ${path.basename(filePath)} (${Math.round(stat.size / 1024)} KB, ${pageCount} pages)`,
  );

  return {
    filePath,
    sizeKb: Math.round(stat.size / 1024),
    pageCount,
    markdownPath,
  };
}

// ─── DOCX Generation ──────────────────────────────────────────────

async function generateDOCX(spec: DocumentSpec, savePath: string): Promise<number> {
  const { writeFile } = await import("node:fs/promises");

  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const docxMod = await (
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function("m", "return import(m)") as (m: string) => Promise<unknown>
    )("docx");
    const { Document, Paragraph, TextRun, HeadingLevel, Packer } = docxMod as {
      Document: new (opts: unknown) => unknown;
      Paragraph: new (opts: unknown) => unknown;
      TextRun: new (opts: unknown) => unknown;
      HeadingLevel: Record<string, unknown>;
      Packer: { toBuffer: (doc: unknown) => Promise<Buffer> };
    };

    const paragraphs: unknown[] = [
      new Paragraph({ text: spec.title, heading: HeadingLevel.TITLE }),
      new Paragraph({ text: `By ${spec.author ?? "HoC Research Team"}`, spacing: { after: 400 } }),
    ];

    for (const section of spec.sections) {
      if (section.heading) {
        paragraphs.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
      }
      // Split content into paragraphs
      for (const line of section.content.split("\n").filter((l) => l.trim())) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.replace(/\*\*(.+?)\*\*/g, "$1"),
                bold: line.startsWith("**"),
              }),
            ],
            spacing: { after: 120 },
          }),
        );
      }
    }

    const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
    const buffer = await Packer.toBuffer(doc);
    await writeFile(savePath, buffer);
    return spec.sections.length;
  } catch {
    // Fallback: save as markdown with docx extension
    const mdContent = `# ${spec.title}\n\n${spec.sections.map((s) => `## ${s.heading ?? ""}\n\n${s.content}`).join("\n\n")}`;
    await writeFile(savePath, mdContent, "utf-8");
    return spec.sections.length;
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Start a new research job. Returns immediately with a job ID.
 * The pipeline runs in the background.
 */
export function startResearchJob(request: ResearchRequest): ResearchJob {
  const job: ResearchJob = {
    id: uid(),
    request,
    status: "queued",
    progress: {
      phase: "queued",
      phasePct: 0,
      totalSources: 0,
      extractedSources: 0,
      sectionsWritten: 0,
    },
    createdAt: ts(),
    updatedAt: ts(),
    log: [`Research job created: "${request.query}" → ${request.format} (${request.depth})`],
  };

  saveJob(job);

  // Run pipeline asynchronously
  runResearchPipeline(job).catch((err) => {
    job.status = "failed";
    job.error = String(err);
    jobLog(job, `Pipeline FAILED: ${err}`);
  });

  return job;
}

/** The main async pipeline — runs in background */
async function runResearchPipeline(job: ResearchJob): Promise<void> {
  try {
    // Phase 1: Planning
    job.status = "planning";
    saveJob(job);
    const plan = await planResearch(job);
    job.plan = plan;
    job.progress.phasePct = 20;

    // Phase 2 & 3: Search + Extract
    job.status = "searching";
    saveJob(job);
    const sources = await searchAndExtract(job, plan);
    job.progress.phasePct = 60;

    // Phase 4: Synthesis
    job.status = "synthesizing";
    saveJob(job);
    const sections = await synthesizeResearch(job, plan, sources);
    job.progress.phasePct = 80;

    // Phase 5: Write Document
    job.status = "writing";
    saveJob(job);
    const { filePath, sizeKb, pageCount, markdownPath } = await writeDocument(job, plan, sections);
    job.progress.phasePct = 100;

    // Build download URL (served by gateway static /research endpoint)
    const fileName = path.basename(filePath);
    const downloadUrl = `/research/${job.id}/${encodeURIComponent(fileName)}`;

    job.status = "done";
    job.completedAt = ts();
    job.result = {
      filePath,
      downloadUrl,
      format: job.request.format,
      sizeKb,
      pageCount,
      markdownPath,
    };

    jobLog(job, `Research complete! ${fileName} (${sizeKb} KB, ${pageCount} sections)`);
  } catch (err) {
    job.status = "failed";
    job.error = String(err);
    jobLog(job, `FAILED: ${String(err)}`);
  }
}

/**
 * Get a job by ID.
 */
export function getResearchJob(id: string): ResearchJob | undefined {
  return jobs.get(id);
}

/**
 * List recent research jobs, newest first.
 */
export function listResearchJobs(limit = 20): ResearchJob[] {
  return [...jobs.values()]
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/**
 * Load jobs from disk on startup.
 */
export function loadResearchJobsFromDisk(): void {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return;
    }
    const files = fs
      .readdirSync(OUTPUT_DIR)
      .filter((f) => f.startsWith("job-") && f.endsWith(".json"));
    for (const file of files.slice(-MAX_JOBS)) {
      try {
        const raw = fs.readFileSync(path.join(OUTPUT_DIR, file), "utf-8");
        const job = JSON.parse(raw) as ResearchJob;
        if (job.id) {
          jobs.set(job.id, job);
        }
      } catch {
        /* corrupt file */
      }
    }
    console.log(`[DeepResearch] Loaded ${jobs.size} jobs from disk`);
  } catch {
    /* non-critical */
  }
}
