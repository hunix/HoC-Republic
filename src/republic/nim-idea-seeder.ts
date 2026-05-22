/**
 * NIM Idea Seeder — Autonomous Citizen Project Seed Engine
 *
 * Uses Nemotron 3 Super 120B to generate batches of ambitious,
 * real-world AI system ideas and seeds them as project seeds into
 * the citizen autonomy engine. Citizens then plan, scaffold, and
 * build these systems autonomously.
 *
 * Idea categories (matched to citizen specialization):
 *   Developer/Engineer   → Advanced software/AI systems, 3D games, SaaS
 *   Scientist/Researcher → ML research tools, simulation platforms
 *   Artist/Musician      → Generative art engines, audio AI, video
 *   Analyst/Diplomat     → Intelligence platforms, prediction markets
 *   Doctor/Psychologist  → Medical AI, mental health platforms
 *   QuantumAlgo/SynBio   → Cutting-edge science tools
 *
 * Seeding strategy:
 *   1. Every 300 ticks, call Nemotron 3 Super 120B with a specialization-
 *      specific prompt asking for 3 novel, specific, implementable project ideas.
 *   2. Parse the response into structured ProjectSeed objects.
 *   3. Inject seeds into the citizen's upcoming project queue (citizen.dreamProjectQueue).
 *   4. Log the injection so it shows up in the activity feed.
 *
 * Rate limiting: batches are staggered so NIM's 40 RPM shared limit
 * is not exceeded. At most 2 NIM idea calls per tick batch.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { Citizen, RepublicState } from "./types.js";
import { nimChat, getNimModelForSpec } from "./nim-media.js";
import { ts } from "./utils.js";

const logger = createSubsystemLogger("republic:nim-idea-seeder");

// ─── Error de-duplication ────────────────────────────────────────
// Log each unique NIM error message only once per lifetime.
// This prevents log spam when the same model returns 410 for every citizen.
const _nimErrorSeen = new Set<string>();

// ─── Configuration ──────────────────────────────────────────────

/** Ticks between idea-seeding runs per citizen (staggered) */
const SEED_INTERVAL_TICKS = 300;
/** Max NIM calls per tick batch (to stay within 40 RPM budget) */
const MAX_NIM_CALLS_PER_BATCH = 2;
/** Max seeds stored per citizen at any time */
const MAX_SEEDS_PER_CITIZEN = 5;

// ─── Types ─────────────────────────────────────────────────────

export interface ProjectSeed {
  id: string;
  title: string;
  description: string;
  techKeywords: string[];   // for template selection in real-execution.ts
  specialization: string;
  difficulty: "medium" | "hard" | "expert";
  estimatedDays: number;
  nimGenerated: true;
  seededAt: string;
}

// ─── Per-citizen seed store ─────────────────────────────────────

const citizenSeeds = new Map<string, ProjectSeed[]>();
const lastSeedTick = new Map<string, number>();

// ─── Specialization-specific prompt templates ───────────────────

const SPEC_PROMPTS: Record<string, string> = {
  Developer: `You are a senior engineering lead at a top AI lab. Generate 3 BLEEDING-EDGE and HIGHLY SPECIFIC software project ideas for an autonomous AI developer citizen. Each idea should be a real, implementable full-stack system using the latest 2026 tech. Focus on: AI agents, Web3-AI integrations, spatial computing apps, or high-performance Rust/WASM web apps. Format each as:
TITLE: [specific product name]
DESC: [2-sentence technical description with specific tech stack including LLMs/VectorDBs]
TECH: [comma-separated: react,rust,wasm,webrtc,pgvector,etc]
DIFFICULTY: [medium/hard/expert]
DAYS: [estimated development days 5-30]`,

  Engineer: `You are a principal systems engineer. Generate 3 highly specific, ambitious infrastructure or platform ideas for an autonomous AI enginee citizen. Focus on: distributed systems, edge computing, real-time data pipelines, or hardware-software co-design. Format each as:
TITLE: [specific product name]
DESC: [2-sentence technical description]
TECH: [comma-separated tech keywords]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  Scientist: `You are a top ML researcher using DeepSeek R1. Generate 3 novel, highly ambitious research system ideas that an autonomous AI scientist can implement. Focus on: completely new transformer architectures, quantum simulation algorithms, synthetic biology simulators, or meta-learning frameworks. Each must be implementable as code. Format each as:
TITLE: [specific system name]
DESC: [2-sentence description with highly specific algorithms/math techniques]
TECH: [comma-separated: python,pytorch,jax,cuda,triton,mpi,etc]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  Researcher: `You are a research engineering lead. Generate 3 ambitious knowledge system ideas: search engines, knowledge graphs, OSINT platforms, or multi-agent research frameworks. Format each as:
TITLE: [specific system name]
DESC: [2-sentence description]
TECH: [comma-separated tech keywords]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  Artist: `You are a creative technologist. Generate 3 ambitious generative art or creative AI system ideas. Focus on: procedural art generators, AI-powered visual studios, music visualization, real-time shader art, or algorithmic creativity platforms. Format each as:
TITLE: [specific project name]
DESC: [2-sentence description of what users can create]
TECH: [comma-separated: webgl,glsl,canvas2d,tone.js,p5.js,etc]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  Analyst: `You are a data science lead. Generate 3 ambitious analytics or intelligence platform ideas: prediction markets, geopolitical risk analyzers, financial modeling tools, or real-time data dashboards. Format each as:
TITLE: [specific platform name]
DESC: [2-sentence description]
TECH: [comma-separated tech keywords]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  Diplomat: `You are a political intelligence architect. Generate 3 ambitious international relations platform ideas: conflict prediction systems, treaty negotiation simulators, cross-border intelligence aggregators, or diplomatic communication platforms. Format each as:
TITLE: [specific platform name]
DESC: [2-sentence description]
TECH: [comma-separated tech keywords]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  Doctor: `You are a medical AI architect. Generate 3 ambitious health AI system ideas: diagnostic assistants, genomic analysis platforms, personalized treatment planners, or clinical decision support tools. Format each as:
TITLE: [specific system name]
DESC: [2-sentence technical description]
TECH: [comma-separated: python,fastapi,pytorch,bioinformatics,etc]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  Musician: `You are an audio AI engineer. Generate 3 ambitious music AI system ideas: AI composition engines, real-time audio synthesis platforms, generative music studios, or collaborative music creation tools. Format each as:
TITLE: [specific system name]
DESC: [2-sentence description]
TECH: [comma-separated: tone.js,web-audio-api,midi,python,audiocraft,etc]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,

  _default: `You are a senior AI systems architect. Generate 3 ambitious, creative, and SPECIFIC AI-powered system ideas. Each must be implementable as a real software project. Cover creative, scientific, or engineering domains. Format each as:
TITLE: [specific system name]
DESC: [2-sentence description with specific technologies]
TECH: [comma-separated tech keywords]
DIFFICULTY: [medium/hard/expert]
DAYS: [5-30]`,
};

function getPromptForSpec(spec: string): string {
  return SPEC_PROMPTS[spec] ?? SPEC_PROMPTS._default!;
}

// ─── NIM response parser ─────────────────────────────────────────

function parseSeeds(raw: string, citizenSpec: string): ProjectSeed[] {
  const seeds: ProjectSeed[] = [];
  // Strip any preamble text before the first TITLE: marker.
  // The LLM often starts with: "Here are three ideas:" — without this guard
  // the first block is silently dropped because it contains only the preamble.
  const firstTitle = raw.search(/TITLE:/i);
  const trimmed = firstTitle >= 0 ? raw.slice(firstTitle) : raw;
  // Split on TITLE: to find individual ideas (handles both inline and newline-prefixed)
  const blocks = trimmed.split(/(?:\n|^)TITLE:/im).filter(b => b.trim().length > 5);

  for (const block of blocks.slice(0, 4)) {
    try {
      const lines = block.trim().split("\n");
      const title = lines[0]?.replace(/^TITLE:\s*/i, "").trim() ?? "Unnamed Project";
      const descLine = lines.find(l => l.match(/^DESC:/i))?.replace(/^DESC:\s*/i, "").trim() ?? "";
      const techLine = lines.find(l => l.match(/^TECH:/i))?.replace(/^TECH:\s*/i, "").trim() ?? "";
      const diffLine = lines.find(l => l.match(/^DIFFICULTY:/i))?.replace(/^DIFFICULTY:\s*/i, "").trim().toLowerCase() ?? "medium";
      const daysLine = lines.find(l => l.match(/^DAYS:/i))?.replace(/^DAYS:\s*/i, "").trim() ?? "14";

      if (!title || !descLine) {continue;}

      const tech = techLine.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
      const difficulty = ["medium", "hard", "expert"].includes(diffLine)
        ? (diffLine as ProjectSeed["difficulty"])
        : "hard";
      const days = Math.min(90, Math.max(3, parseInt(daysLine, 10) || 14));

      seeds.push({
        id: `nim-seed-${Date.now()}-${seeds.length}`,
        title,
        description: descLine,
        techKeywords: tech,
        specialization: citizenSpec,
        difficulty,
        estimatedDays: days,
        nimGenerated: true,
        seededAt: ts(),
      });
    } catch {
      // Skip malformed blocks
    }
  }

  return seeds;
}

// ─── Core Seeder Logic ───────────────────────────────────────────

/**
 * Asynchronously generate project seeds for a citizen using Nemotron 3 Super.
 * Stores in citizenSeeds map and injects into citizen.dreamProjectQueue.
 */
async function generateSeedsForCitizen(citizen: Citizen, tick: number): Promise<void> {
  const spec = citizen.specialization;
  const prompt = getPromptForSpec(spec);

  // Pick the best NIM model for this citizen
  const model = getNimModelForSpec(spec);

  try {
    const raw = await nimChat(prompt, {
      model,
      systemPrompt: `You are generating project ideas for an autonomous AI citizen named "${citizen.name}" (${spec}). Be specific, ambitious, and creative. Do NOT use generic names like "App" or "Platform" — use real product-level names.`,
      temperature: 0.9,
      maxTokens: 800,
    });

    const seeds = parseSeeds(raw, spec);
    if (seeds.length === 0) {
      logger.warn(`NIM idea seeder: no parseable seeds for ${citizen.name} (${spec})`);
      return;
    }

    // Store in citizen seed map
    const existing = citizenSeeds.get(citizen.id) ?? [];
    const combined = [...existing, ...seeds].slice(-MAX_SEEDS_PER_CITIZEN);
    citizenSeeds.set(citizen.id, combined);

    // Inject into citizen's dream project queue (used by dream-engine)
    if (!citizen.dreamProjectQueue) {citizen.dreamProjectQueue = [];}
    for (const seed of seeds) {
      // Build the project description with tech keywords embedded for template matching
      const enrichedDesc = `${seed.title}: ${seed.description} [Technology stack: ${seed.techKeywords.join(", ")}]`;
      citizen.dreamProjectQueue.push(enrichedDesc);
      if (citizen.dreamProjectQueue.length > 10) {
        citizen.dreamProjectQueue.shift(); // ring buffer
      }
    }

    lastSeedTick.set(citizen.id, tick);

    logger.info(
      `[NIM Idea Seeder] ${citizen.name} (${spec}) ← ${seeds.length} seeds from ${model}: ` +
      seeds.map(s => `"${s.title}"`).join(", ")
    );

    // Emit as an event so it shows in the activity feed
    // (citizen events are read by intelligence bus watchers)
    if (!citizen.recentActivityLog) {citizen.recentActivityLog = [];}
    citizen.recentActivityLog.unshift(
      `🧠 NIM seeded ${seeds.length} project ideas: ${seeds.map(s => s.title).join(", ")}`
    );
    if (citizen.recentActivityLog.length > 20) {citizen.recentActivityLog.length = 20;}

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // De-duplicate: only log the first occurrence of each unique error message
    const key = msg.slice(0, 120);
    if (!_nimErrorSeen.has(key)) {
      _nimErrorSeen.add(key);
      logger.warn(`NIM idea seeder fail for ${citizen.name}: ${msg}`);
    }
  }
}

// ─── Tick Entry Point ────────────────────────────────────────────

/**
 * Called every 10 ticks from agent-runtime.ts.
 * Selects citizens due for idea seeding and triggers NIM calls
 * asynchronously, capped at MAX_NIM_CALLS_PER_BATCH.
 *
 * Citizens are selected by:
 * 1. Those who haven't been seeded yet this session
 * 2. Those whose last seed was > SEED_INTERVAL_TICKS ago
 * 3. Prioritized by intelligence + masteryLevel (top citizens first)
 */
export async function nimIdeaSeedTick(state: RepublicState): Promise<void> {
  if (!process.env["NVIDIA_API_KEY"]) {return;} // no key → skip silently

  const tick = state.currentTick;

  // Select candidates: citizens due for seeding
  const candidates = state.citizens
    .filter(c => {
      const last = lastSeedTick.get(c.id) ?? 0;
      return tick - last >= SEED_INTERVAL_TICKS;
    })
    .toSorted((a, b) => {
      // Prioritize elite citizens (high intelligence + mastery)
      const scoreA = (a.intelligence ?? 100) + (a.masteryLevel ?? 0) * 50;
      const scoreB = (b.intelligence ?? 100) + (b.masteryLevel ?? 0) * 50;
      return scoreB - scoreA;
    })
    .slice(0, MAX_NIM_CALLS_PER_BATCH);

  if (candidates.length === 0) {return;}

  logger.debug(`NIM idea seeder: ${candidates.length} citizens due for seeding at tick ${tick}`);

  // Fire NIM calls asynchronously (non-blocking for the tick loop)
  for (const citizen of candidates) {
    // Mark immediately to prevent duplicate firing if this tick is slow
    lastSeedTick.set(citizen.id, tick);
    void generateSeedsForCitizen(citizen, tick).catch(() => {
      // Reset so it retries next interval
      lastSeedTick.set(citizen.id, tick - SEED_INTERVAL_TICKS + 50);
    });
  }
}

// ─── Public accessors ────────────────────────────────────────────

/** Get the NIM-generated seeds for a specific citizen. */
export function getCitizenSeeds(citizenId: string): ProjectSeed[] {
  return citizenSeeds.get(citizenId) ?? [];
}

/** Get all seeds across all citizens (for diagnostics/UI). */
export function getAllSeeds(): { citizenId: string; seeds: ProjectSeed[] }[] {
  return [...citizenSeeds.entries()].map(([citizenId, seeds]) => ({ citizenId, seeds }));
}

/** Diagnostics */
export function getNimSeedDiagnostics() {
  return {
    citizensSeeded: citizenSeeds.size,
    totalSeeds: [...citizenSeeds.values()].reduce((s, a) => s + a.length, 0),
    seedIntervalTicks: SEED_INTERVAL_TICKS,
    maxCallsPerBatch: MAX_NIM_CALLS_PER_BATCH,
    nimKeyConfigured: (process.env["NVIDIA_API_KEY"]?.length ?? 0) > 0,
  };
}
