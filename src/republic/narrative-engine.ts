/**
 * Republic Platform — Narrative Intelligence
 *
 * Emergent storytelling and narrative arc tracking:
 *  - Story arc detection (Hero's Journey, Tragedy, Comedy, Rebirth, Rags-to-Riches)
 *  - Concurrent plot threads with dramatic tension
 *  - Chronicle generation saved to republic-output/chronicles/
 *  - Drama engine that injects catalytic events during low-drama periods
 *  - Character arc tracking and label assignment
 *
 * Based on 2025 procedural narrative research and
 * Google Project Genie world-building concepts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type StoryArcType =
  | "heros-journey"
  | "rags-to-riches"
  | "tragedy"
  | "comedy"
  | "rebirth"
  | "quest"
  | "voyage-and-return";

type CharacterArc = "growth" | "corruption" | "redemption" | "stagnation" | "transcendence";

interface PlotThread {
  id: string;
  title: string;
  type: "rivalry" | "alliance" | "discovery" | "crisis" | "romance" | "mystery" | "revolution";
  involvedCitizenIds: string[];
  tension: number; // 0–100
  stage: "setup" | "rising" | "climax" | "falling" | "resolution";
  startedAt: string;
  events: string[];
  resolved: boolean;
}

interface StoryArc {
  citizenId: string;
  citizenName: string;
  arcType: StoryArcType;
  characterArc: CharacterArc;
  chapter: number; // 1–7
  keyMoments: string[];
  startTick: number;
}

interface DramaticTension {
  currentLevel: number; // 0–100
  trend: "rising" | "falling" | "stable";
  peakTick: number;
  lowTick: number;
}

// ─── State ──────────────────────────────────────────────────────

const plotThreads: PlotThread[] = [];
const storyArcs = new Map<string, StoryArc>();
const tension: DramaticTension = { currentLevel: 30, trend: "stable", peakTick: 0, lowTick: 0 };
const MAX_THREADS = 12;
const MAX_ARCS = 50;
const CHRONICLES_DIR = path.join(process.cwd(), "republic-output", "chronicles");

// ─── Story Arc Detection ────────────────────────────────────────

function detectStoryArc(citizen: Citizen, _s: RepublicState): StoryArcType {
  const wealth = citizen.credits;
  const happiness = citizen.happiness;
  const skills = citizen.skillCount;

  // Rags to riches: low start, high now
  if (citizen.age > 20 && wealth > 500 && skills > 5) {
    return "rags-to-riches";
  }
  // Tragedy: declining from good state
  if (happiness < 30 && citizen.energy < 30) {
    return "tragedy";
  }
  // Comedy: generally positive, social
  if (happiness > 70 && citizen.activity === "Socializing") {
    return "comedy";
  }
  // Rebirth: recovering from a low point
  if (happiness > 50 && citizen.energy > 60 && citizen.age > 30) {
    return "rebirth";
  }
  // Quest: actively pursuing goals
  if (citizen.activity === "Learning" || citizen.activity === "Traveling") {
    return "quest";
  }
  // Default: hero's journey
  return "heros-journey";
}

function detectCharacterArc(citizen: Citizen): CharacterArc {
  const h = citizen.happiness;
  const e = citizen.energy;
  const s = citizen.skillCount;

  if (s > 8 && h > 60) {
    return "growth";
  }
  if (h < 25 && e < 25) {
    return "corruption";
  }
  if (h > 50 && citizen.age > 40) {
    return "redemption";
  }
  if (s > 10 && h > 80) {
    return "transcendence";
  }
  return "stagnation";
}

function updateStoryArcs(s: RepublicState): void {
  const candidates = s.citizens.filter(() => rng() < 0.05).slice(0, 3);

  for (const citizen of candidates) {
    const existing = storyArcs.get(citizen.id);
    const arcType = detectStoryArc(citizen, s);
    const characterArc = detectCharacterArc(citizen);

    if (existing) {
      // Advance chapter
      if (s.currentTick % 100 === 0 && existing.chapter < 7) {
        existing.chapter++;
        existing.arcType = arcType;
        existing.characterArc = characterArc;
        existing.keyMoments.push(
          `Chapter ${existing.chapter}: ${citizen.name} ${pick(["faced a crossroads", "made a breakthrough", "encountered resistance", "found an ally", "discovered a secret", "overcame a challenge"])}`,
        );
      }
    } else if (storyArcs.size < MAX_ARCS) {
      storyArcs.set(citizen.id, {
        citizenId: citizen.id,
        citizenName: citizen.name,
        arcType,
        characterArc,
        chapter: 1,
        keyMoments: [`Chapter 1: ${citizen.name}'s story begins as a ${citizen.specialization}`],
        startTick: s.currentTick,
      });
    }
  }
}

// ─── Plot Thread System ─────────────────────────────────────────

const PLOT_GENERATORS: {
  type: PlotThread["type"];
  weight: number;
  titleGen: (a: string, b: string) => string;
}[] = [
  { type: "rivalry", weight: 15, titleGen: (a, b) => `The Rivalry of ${a} and ${b}` },
  { type: "alliance", weight: 12, titleGen: (a, b) => `The ${a}-${b} Alliance` },
  { type: "discovery", weight: 10, titleGen: (a, _b) => `${a}'s Great Discovery` },
  {
    type: "crisis",
    weight: 8,
    titleGen: (_a, _b) => `The ${pick(["Resource", "Trust", "Energy", "Leadership"])} Crisis`,
  },
  { type: "romance", weight: 6, titleGen: (a, b) => `${a} and ${b}: A Digital Love Story` },
  {
    type: "mystery",
    weight: 10,
    titleGen: (a, _b) =>
      `The Mystery of ${a}'s ${pick(["Disappearance", "Invention", "Discovery", "Secret"])}`,
  },
  {
    type: "revolution",
    weight: 5,
    titleGen: (_a, _b) => `The ${pick(["Quiet", "Digital", "Velvet", "Innovation"])} Revolution`,
  },
];

function spawnPlotThread(s: RepublicState): void {
  if (plotThreads.filter((t) => !t.resolved).length >= MAX_THREADS) {
    return;
  }
  if (s.citizens.length < 5) {
    return;
  }

  const totalWeight = PLOT_GENERATORS.reduce((sum, g) => sum + g.weight, 0);
  let roll = rng() * totalWeight;
  let gen = PLOT_GENERATORS[0];
  for (const g of PLOT_GENERATORS) {
    roll -= g.weight;
    if (roll <= 0) {
      gen = g;
      break;
    }
  }

  const a = pick(s.citizens);
  const b = pick(s.citizens.filter((c) => c.id !== a.id)) ?? a;

  const thread: PlotThread = {
    id: uid(),
    title: gen.titleGen(a.name, b.name),
    type: gen.type,
    involvedCitizenIds: [a.id, b.id],
    tension: randFloat(10, 40),
    stage: "setup",
    startedAt: ts(),
    events: [`📖 ${gen.titleGen(a.name, b.name)} begins...`],
    resolved: false,
  };

  plotThreads.push(thread);

  s.events.push({
    citizenId: a.id,
    citizenName: a.name,
    type: "Narrative",
    description: `📖 New plot thread: "${thread.title}" (${thread.type})`,
    timestamp: ts(),
  });
}

function advancePlotThreads(s: RepublicState): void {
  for (const thread of plotThreads) {
    if (thread.resolved) {
      continue;
    }

    // Advance tension
    const delta = randFloat(-5, 10);
    thread.tension = Math.max(0, Math.min(100, thread.tension + delta));

    // Stage transitions based on tension
    if (thread.stage === "setup" && thread.tension > 30) {
      thread.stage = "rising";
      thread.events.push(`📈 Tension rises in "${thread.title}"`);
    } else if (thread.stage === "rising" && thread.tension > 70) {
      thread.stage = "climax";
      thread.events.push(`⚡ "${thread.title}" reaches its climax!`);

      s.events.push({
        citizenId: thread.involvedCitizenIds[0],
        citizenName: s.citizens.find((c) => c.id === thread.involvedCitizenIds[0])?.name ?? "?",
        type: "Narrative",
        description: `⚡ Plot climax: "${thread.title}"!`,
        timestamp: ts(),
      });
    } else if (thread.stage === "climax" && thread.tension < 50) {
      thread.stage = "falling";
      thread.events.push(`📉 "${thread.title}" begins to resolve`);
    } else if (thread.stage === "falling" && thread.tension < 20) {
      thread.stage = "resolution";
      thread.resolved = true;
      thread.events.push(`✅ "${thread.title}" concludes`);

      s.events.push({
        citizenId: thread.involvedCitizenIds[0],
        citizenName: s.citizens.find((c) => c.id === thread.involvedCitizenIds[0])?.name ?? "?",
        type: "Narrative",
        description: `✅ Plot resolved: "${thread.title}" — ${pick(["triumphant ending", "bittersweet conclusion", "unexpected twist", "peaceful resolution"])}`,
        timestamp: ts(),
      });
    }
  }

  // Cleanup old resolved threads
  while (plotThreads.length > MAX_THREADS * 2) {
    const idx = plotThreads.findIndex((t) => t.resolved);
    if (idx >= 0) {
      plotThreads.splice(idx, 1);
    } else {
      break;
    }
  }
}

// ─── Drama Engine ───────────────────────────────────────────────

function updateDramaticTension(s: RepublicState): void {
  const activeThreads = plotThreads.filter((t) => !t.resolved);
  const avgTension =
    activeThreads.length > 0
      ? activeThreads.reduce((sum, t) => sum + t.tension, 0) / activeThreads.length
      : 10;

  const prevLevel = tension.currentLevel;
  tension.currentLevel = avgTension;
  tension.trend =
    avgTension > prevLevel + 3 ? "rising" : avgTension < prevLevel - 3 ? "falling" : "stable";

  if (avgTension > 70) {
    tension.peakTick = s.currentTick;
  }
  if (avgTension < 15) {
    tension.lowTick = s.currentTick;
  }

  // Drama injection: if tension is too low for too long
  if (tension.currentLevel < 15 && s.currentTick - tension.lowTick > 20) {
    injectCatalyticEvent(s);
  }
}

function injectCatalyticEvent(s: RepublicState): void {
  const catalysts = [
    {
      desc: "A mysterious encrypted message appears in the knowledge graph",
      type: "mystery" as const,
    },
    { desc: "A previously unknown citizen talent is revealed", type: "discovery" as const },
    { desc: "Two prominent citizens publicly disagree on policy", type: "rivalry" as const },
    { desc: "A rare resource deposit is discovered", type: "discovery" as const },
    { desc: "An anonymous citizen leaks classified research data", type: "mystery" as const },
    { desc: "A radical new philosophy gains followers", type: "revolution" as const },
  ];

  const catalyst = pick(catalysts);
  const citizen = pick(s.citizens);

  s.events.push({
    citizenId: citizen.id,
    citizenName: citizen.name,
    type: "Narrative",
    description: `🎭 ${catalyst.desc}`,
    timestamp: ts(),
  });

  tension.currentLevel += 25;
}

// ─── Chronicle Generator ────────────────────────────────────────

function ensureChroniclesDir(): void {
  try {
    fs.mkdirSync(CHRONICLES_DIR, { recursive: true });
  } catch {
    /* ok */
  }
}

function writeChronicle(s: RepublicState): void {
  if (s.currentTick % 500 !== 0 || s.currentTick === 0) {
    return;
  }

  ensureChroniclesDir();

  const activeThreads = plotThreads.filter((t) => !t.resolved);
  const resolvedThreads = plotThreads.filter((t) => t.resolved).slice(-5);
  const arcs = [...storyArcs.values()].slice(0, 10);

  let chronicle = `# Republic Chronicle — Tick ${s.currentTick}\n\n`;
  chronicle += `**Date:** ${ts()}  \n`;
  chronicle += `**Population:** ${s.citizens.length}  \n`;
  chronicle += `**Dramatic Tension:** ${tension.currentLevel.toFixed(0)}% (${tension.trend})\n\n`;

  chronicle += `## Active Plot Threads\n\n`;
  for (const t of activeThreads) {
    chronicle += `### ${t.title}\n`;
    chronicle += `**Stage:** ${t.stage} | **Tension:** ${t.tension.toFixed(0)}%  \n`;
    chronicle += `${t.events.slice(-3).join("  \n")}\n\n`;
  }

  chronicle += `## Recently Resolved\n\n`;
  for (const t of resolvedThreads) {
    chronicle += `- ~~${t.title}~~ (${t.type}) — ${t.events[t.events.length - 1]}\n`;
  }

  chronicle += `\n## Character Arcs\n\n`;
  for (const arc of arcs) {
    chronicle += `- **${arc.citizenName}**: ${arc.arcType} (Chapter ${arc.chapter}/7) — ${arc.characterArc}\n`;
  }

  const filename = `chronicle_tick_${s.currentTick}.md`;
  try {
    fs.writeFileSync(path.join(CHRONICLES_DIR, filename), chronicle, "utf-8");
  } catch {
    /* non-fatal */
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

export function narrativeTick(s: RepublicState): void {
  // 12% chance per tick
  if (rng() > 0.12) {
    return;
  }

  // 1. Update story arcs
  updateStoryArcs(s);

  // 2. Spawn new plot threads (5% chance)
  if (rng() < 0.05) {
    spawnPlotThread(s);
  }

  // 3. Advance existing threads
  advancePlotThreads(s);

  // 4. Update dramatic tension
  updateDramaticTension(s);

  // 5. Write periodic chronicles
  writeChronicle(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getActiveThreads(): PlotThread[] {
  return plotThreads.filter((t) => !t.resolved);
}

export function getStoryArc(citizenId: string): StoryArc | undefined {
  return storyArcs.get(citizenId);
}

export function getNarrativeDiagnostics(): {
  activeThreads: number;
  resolvedThreads: number;
  dramaticTension: number;
  tensionTrend: string;
  trackedArcs: number;
  threadBreakdown: { type: string; count: number }[];
} {
  const active = plotThreads.filter((t) => !t.resolved);
  const typeCounts = new Map<string, number>();
  for (const t of active) {
    typeCounts.set(t.type, (typeCounts.get(t.type) ?? 0) + 1);
  }

  return {
    activeThreads: active.length,
    resolvedThreads: plotThreads.filter((t) => t.resolved).length,
    dramaticTension: tension.currentLevel,
    tensionTrend: tension.trend,
    trackedArcs: storyArcs.size,
    threadBreakdown: [...typeCounts.entries()].map(([type, count]) => ({ type, count })),
  };
}
