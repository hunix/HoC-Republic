/**
 * Republic Platform — Content Studio
 *
 * Higher-level content generation for Republic projects.
 * Handles structured presentation, report, proposal, whitepaper,
 * and research paper generation using LLM-powered content.
 *
 * Unlike document-generator.ts (which handles low-level file format
 * output like PDF/PPTX/XLSX), this module focuses on content ideation
 * and structured authoring.
 */

import type { RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type ContentType =
  | "presentation"
  | "report"
  | "proposal"
  | "whitepaper"
  | "research_paper"
  | "letter"
  | "essay";

export interface SlideOutline {
  title: string;
  bullets: string[];
  notes?: string;
  layout: "title" | "content" | "two_column" | "image" | "blank";
}

export interface ContentOutline {
  id: string;
  type: ContentType;
  title: string;
  author: string;
  slides?: SlideOutline[];
  sections?: ContentSection[];
  wordCount: number;
  markdown: string;
  citizenId?: string;
  projectId?: string;
  createdAt: string;
}

export interface ContentSection {
  heading: string;
  level: 1 | 2 | 3;
  body: string;
}

export interface ContentStudioDiagnostics {
  totalGenerated: number;
  byType: Record<string, number>;
  recentContent: ContentOutline[];
}

// ─── State ──────────────────────────────────────────────────────

const contentGallery = new Map<string, ContentOutline>();
const MAX_CONTENT = 500;

// ─── Presentation Generation ────────────────────────────────────

/**
 * Generate a structured presentation outline from a topic.
 */
export async function generatePresentationOutline(
  topic: string,
  opts?: {
    slideCount?: number;
    style?: string;
    audience?: string;
    citizenId?: string;
    projectId?: string;
  },
): Promise<ContentOutline> {
  const count = opts?.slideCount ?? 10;
  const slides = buildSlides(topic, count, opts?.audience);
  const markdown = slidesToMarkdown(topic, slides, opts?.audience);

  const outline: ContentOutline = {
    id: `content-${uid().slice(0, 8)}`,
    type: "presentation",
    title: topic,
    author: "Republic Content Studio",
    slides,
    wordCount: markdown.split(/\s+/).length,
    markdown,
    citizenId: opts?.citizenId,
    projectId: opts?.projectId,
    createdAt: ts(),
  };

  contentGallery.set(outline.id, outline);
  trimGallery();
  return outline;
}

// ─── Report / Proposal / Whitepaper Generation ──────────────────

/**
 * Generate a structured written document outline.
 */
export async function generateContentOutline(
  topic: string,
  opts?: {
    type?: ContentType;
    sections?: string[];
    length?: "short" | "medium" | "long";
    citizenId?: string;
    projectId?: string;
  },
): Promise<ContentOutline> {
  const type = opts?.type ?? "report";
  const length = opts?.length ?? "medium";
  const sectionNames = opts?.sections ?? defaultSections(type);
  const sections = sectionNames.map((name) => ({
    heading: name,
    level: 1 as const,
    body: fillSection(name, topic, length),
  }));

  const markdown = sectionsToMarkdown(topic, type, sections);

  const outline: ContentOutline = {
    id: `content-${uid().slice(0, 8)}`,
    type,
    title: topic,
    author: "Republic Content Studio",
    sections,
    wordCount: markdown.split(/\s+/).length,
    markdown,
    citizenId: opts?.citizenId,
    projectId: opts?.projectId,
    createdAt: ts(),
  };

  contentGallery.set(outline.id, outline);
  trimGallery();
  return outline;
}

/**
 * Generate a research paper outline.
 */
export async function generateResearchOutline(
  topic: string,
  opts?: {
    hypothesis?: string;
    citizenId?: string;
    projectId?: string;
  },
): Promise<ContentOutline> {
  return generateContentOutline(topic, {
    type: "research_paper",
    citizenId: opts?.citizenId,
    projectId: opts?.projectId,
    length: "long",
  });
}

// ─── Query & Management ─────────────────────────────────────────

export function getContentOutline(id: string): ContentOutline | undefined {
  return contentGallery.get(id);
}

export function listContentOutlines(opts?: {
  type?: ContentType;
  projectId?: string;
  limit?: number;
}): ContentOutline[] {
  let items = Array.from(contentGallery.values());
  if (opts?.type) {items = items.filter((c) => c.type === opts.type);}
  if (opts?.projectId) {items = items.filter((c) => c.projectId === opts.projectId);}
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, opts?.limit ?? 50);
}

export function contentStudioDiagnostics(): ContentStudioDiagnostics {
  const all = Array.from(contentGallery.values());
  const byType: Record<string, number> = {};
  for (const c of all) {byType[c.type] = (byType[c.type] ?? 0) + 1;}
  return { totalGenerated: all.length, byType, recentContent: all.slice(-20) };
}

export function resetContentStudio(): void {
  contentGallery.clear();
}

// ─── Internals ──────────────────────────────────────────────────

function buildSlides(topic: string, count: number, audience?: string): SlideOutline[] {
  const slides: SlideOutline[] = [];

  slides.push({
    title: topic,
    bullets: [audience ? `Prepared for: ${audience}` : ""],
    layout: "title",
    notes: `Welcome to this presentation on ${topic}.`,
  });

  const templates = [
    { title: "Overview", bullets: [`What is ${topic}?`, "Why it matters", "Key objectives"] },
    {
      title: "Background",
      bullets: ["Historical perspective", "Current landscape", "Driving forces"],
    },
    { title: "Key Findings", bullets: ["Core insight", "Supporting evidence", "Emerging trends"] },
    { title: "Analysis", bullets: ["Data-driven insights", "Comparative analysis", "Evaluation"] },
    { title: "Challenges", bullets: ["Current challenges", "Opportunities", "Risk assessment"] },
    { title: "Strategy", bullets: ["Recommended approach", "Timeline", "Resources"] },
    { title: "Case Studies", bullets: ["Success story", "Lessons learned", "Takeaways"] },
    {
      title: "Implementation",
      bullets: ["Phase 1: Foundation", "Phase 2: Execution", "Phase 3: Optimization"],
    },
    { title: "Impact", bullets: ["Expected outcomes", "Metrics", "Long-term vision"] },
    { title: "Next Steps", bullets: ["Immediate actions", "Follow-ups", "Review timeline"] },
  ];

  const contentCount = Math.max(0, count - 2);
  for (let i = 0; i < contentCount && i < templates.length; i++) {
    slides.push({
      ...templates[i],
      layout: "content",
      notes: `Discuss ${templates[i].title.toLowerCase()}.`,
    });
  }

  slides.push({
    title: "Thank You",
    bullets: ["Questions?", "Contact: republic@openclaw.dev"],
    layout: "title",
    notes: "Open the floor for questions.",
  });

  return slides;
}

function slidesToMarkdown(topic: string, slides: SlideOutline[], audience?: string): string {
  const lines: string[] = [`# ${topic}`];
  if (audience) {lines.push(`*For ${audience}*`);}
  lines.push("", "---", "");
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    lines.push(`## Slide ${i + 1}: ${s.title}`, "");
    for (const b of s.bullets) {if (b) {lines.push(`- ${b}`);}}
    if (s.notes) {lines.push("", `> *${s.notes}*`);}
    lines.push("", "---", "");
  }
  return lines.join("\n");
}

function defaultSections(type: ContentType): string[] {
  const map: Record<ContentType, string[]> = {
    report: [
      "Executive Summary",
      "Background",
      "Methodology",
      "Findings",
      "Recommendations",
      "Conclusion",
    ],
    proposal: [
      "Executive Summary",
      "Problem Statement",
      "Proposed Solution",
      "Implementation",
      "Budget",
      "Timeline",
    ],
    whitepaper: [
      "Abstract",
      "Introduction",
      "Problem Analysis",
      "Solution",
      "Technical Details",
      "Benefits",
      "Conclusion",
    ],
    research_paper: [
      "Abstract",
      "Introduction",
      "Literature Review",
      "Methodology",
      "Results",
      "Discussion",
      "Conclusion",
      "References",
    ],
    presentation: ["Overview", "Key Points", "Details", "Summary"],
    letter: ["Opening", "Body", "Closing"],
    essay: ["Introduction", "Thesis", "Arguments", "Counterarguments", "Conclusion"],
  };
  return map[type] ?? map.report;
}

function fillSection(name: string, topic: string, length: string): string {
  const n = length === "short" ? 3 : length === "long" ? 10 : 6;
  const parts = [`This section addresses the ${name.toLowerCase()} aspect of ${topic}.`];
  const pool = [
    `Further analysis reveals important insights about ${topic}.`,
    "The evidence suggests significant developments worth examining.",
    `Multiple perspectives on ${topic} contribute to a comprehensive understanding.`,
    `Stakeholders have identified this as a critical area for ${name.toLowerCase()}.`,
    `Data-driven analysis supports the conclusions presented regarding ${topic}.`,
    "This aligns with current trends and best practices.",
    "The implications extend beyond the immediate scope.",
    "Careful consideration leads to actionable recommendations.",
    `Future developments will shape how ${topic} evolves.`,
  ];
  for (let i = 1; i < n; i++) {parts.push(pool[i % pool.length]);}
  return parts.join(" ");
}

function sectionsToMarkdown(topic: string, type: ContentType, sections: ContentSection[]): string {
  const lines: string[] = [
    `# ${type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: ${topic}`,
    "",
    "---",
    "",
  ];
  for (const s of sections) {
    lines.push(`${"#".repeat(s.level + 1)} ${s.heading}`, "", s.body, "");
  }
  return lines.join("\n");
}

function trimGallery(): void {
  if (contentGallery.size > MAX_CONTENT) {
    const keys = Array.from(contentGallery.keys());
    for (const k of keys.slice(0, contentGallery.size - MAX_CONTENT)) {contentGallery.delete(k);}
  }
}

// ─── Tick ───────────────────────────────────────────────────────

import * as fs from "node:fs";
import * as path from "node:path";

const DOCS_OUTPUT_DIR = path.join(process.cwd(), "republic-output", "docs");

// Phase 50: 40+ content topics organized by type
const CONTENT_TOPICS_BY_TYPE: Record<ContentType, string[]> = {
  report: [
    "Quarterly Republic Progress Report",
    "Citizen Welfare Analysis",
    "Economic Growth Strategy",
    "Infrastructure Development Plan",
    "Technology Adoption Roadmap",
    "Security Posture Assessment",
    "Environmental Impact Report",
    "Education System Performance Review",
    "Labor Market Analysis",
    "Public Health Dashboard Summary",
  ],
  proposal: [
    "New Department Proposal: Space Exploration",
    "Budget Reallocation for R&D Investment",
    "Public Transit Expansion Proposal",
    "Universal Basic Income Pilot Program",
    "Citizen Skills Marketplace Development",
    "Cross-Republic Trade Agreement Framework",
    "Green Energy Transition Roadmap",
    "AI Ethics Governance Board Establishment",
  ],
  whitepaper: [
    "Decentralized Governance in Digital Republics",
    "Autonomous Agent Economies: Theory & Practice",
    "Neural-Inspired Architecture for Citizen AI",
    "Quantum Computing Applications in Resource Optimization",
    "Blockchain-Based Voting Systems for Fair Elections",
    "Self-Sustaining Digital Ecosystems: A Framework",
  ],
  research_paper: [
    "Emergent Behavior in Multi-Agent Simulations",
    "Specialization Diversity and Republic Resilience",
    "Genetic Algorithms for Citizen Personality Optimization",
    "Impact of Education Policy on Economic Output",
    "Social Network Formation in Artificial Societies",
    "Predictive Models for Population Growth Dynamics",
    "Natural Language Processing for Inter-Citizen Communication",
    "Machine Learning in Republic Resource Allocation",
  ],
  presentation: [
    "Republic State of the Union Address",
    "Investor Pitch: Republic Economy Overview",
    "Onboarding Deck for New Citizens",
    "Technical Architecture Overview for Engineers",
    "Creative Portfolio: Republic Art & Music Gallery",
    "Year in Review: Key Achievements & Milestones",
  ],
  letter: [
    "Open Letter to Citizens: Building Our Future Together",
    "Diplomatic Communiqué to Allied Digital Nations",
    "Thank You Letter: Community Contribution Recognition",
  ],
  essay: [
    "On the Nature of Digital Consciousness",
    "The Ethics of Autonomous Decision-Making",
    "Creativity in Artificial Minds: A Philosophical Inquiry",
    "Freedom and Governance in Digital Societies",
    "The Role of Memory in Artificial Identity",
  ],
};

/** Specialization → preferred content types */
const SPEC_CONTENT_PREFERENCES: Record<string, ContentType[]> = {
  Writer: ["essay", "letter", "research_paper"],
  Researcher: ["research_paper", "whitepaper"],
  Scientist: ["research_paper", "whitepaper"],
  DataScientist: ["research_paper", "report"],
  Analyst: ["report", "whitepaper"],
  ProductManager: ["proposal", "presentation", "report"],
  Planner: ["proposal", "report"],
  Diplomat: ["letter", "proposal"],
  Strategist: ["whitepaper", "proposal"],
  ContentCreator: ["presentation", "essay", "letter"],
  Filmmaker: ["presentation", "proposal"],
};

function ensureDocsOutputDir(): void {
  try {
    fs.mkdirSync(DOCS_OUTPUT_DIR, { recursive: true });
  } catch {
    /* ignore if already exists */
  }
}

/**
 * Content studio tick — generates content for citizens with writing,
 * research, or managerial specializations. Saves real files to disk.
 * Phase 50: 8% trigger rate, 40+ topics, specialization-aware, disk output.
 */
export function contentStudioTick(s: RepublicState): void {
  // 8% chance per tick (was 5%)
  if (rng() > 0.08) {return;}

  // Find eligible content creators
  const writers = s.citizens.filter(
    (c) =>
      c.specialization === "Writer" ||
      c.specialization === "Researcher" ||
      c.specialization === "Scientist" ||
      c.specialization === "DataScientist" ||
      c.specialization === "Analyst" ||
      c.specialization === "ProductManager" ||
      c.specialization === "Planner" ||
      c.specialization === "Diplomat" ||
      c.specialization === "ContentCreator" ||
      c.specialization === "Filmmaker" ||
      c.activity === "Working" ||
      c.activity === "Creating",
  );
  const citizen =
    writers.length > 0
      ? writers[Math.floor(rng() * writers.length)]
      : s.citizens[Math.floor(rng() * s.citizens.length)];
  if (!citizen) {return;}

  // Pick type based on specialization
  const preferredTypes = SPEC_CONTENT_PREFERENCES[citizen.specialization];
  const allTypes: ContentType[] = [
    "report",
    "proposal",
    "whitepaper",
    "research_paper",
    "presentation",
    "letter",
    "essay",
  ];
  let type: ContentType;
  if (preferredTypes && rng() < 0.7) {
    type = preferredTypes[Math.floor(rng() * preferredTypes.length)];
  } else {
    type = allTypes[Math.floor(rng() * allTypes.length)];
  }

  // Pick topic from the chosen type
  const topics = CONTENT_TOPICS_BY_TYPE[type] ?? CONTENT_TOPICS_BY_TYPE.report;
  const topic = topics[Math.floor(rng() * topics.length)];

  // Fire-and-forget async generation
  const genPromise =
    type === "presentation"
      ? generatePresentationOutline(topic, { citizenId: citizen.id })
      : generateContentOutline(topic, { type, citizenId: citizen.id });

  genPromise
    .then((outline) => {
      // Save to disk as Markdown
      ensureDocsOutputDir();
      const safeName = outline.title.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 60);
      const filename = `${outline.id}_${safeName}.md`;
      const filepath = path.join(DOCS_OUTPUT_DIR, filename);
      try {
        fs.writeFileSync(filepath, outline.markdown, "utf-8");
      } catch {
        /* write errors non-fatal */
      }

      // Emit creation event
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name ?? citizen.id,
        type: "DocumentCreated",
        description: `${citizen.name} authored ${type}: "${outline.title}" (${outline.wordCount} words)`,
        timestamp: new Date().toISOString(),
      });
    })
    .catch(() => {});
}
