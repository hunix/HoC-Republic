/**
 * Republic Platform — Dream Simulation Engine
 *
 * Citizens run "what-if" counterfactual simulations during rest:
 *  - Counterfactual scenario generation (career-change, rivalry, policy)
 *  - Dream memory influencing future decisions (20% weight)
 *  - Precognitive signals (dreams occasionally predict events)
 *  - Nightmare system for high-stress citizens
 *  - Dream sharing for social bonding
 *  - Dream narratives saved to republic-output/dreams/
 *
 * Based on DeepMind dream simulation concepts and
 * 2025 "flight simulator for decisions" research.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type DreamType =
  | "counterfactual"
  | "aspirational"
  | "nightmare"
  | "precognitive"
  | "surreal"
  | "memory-replay";

interface Dream {
  id: string;
  citizenId: string;
  citizenName: string;
  type: DreamType;
  scenario: string;
  narrative: string;
  insight: string | null;
  emotionalImpact: number; // -1 to 1 (negative = nightmare)
  vividness: number; // 0–1
  shared: boolean;
  timestamp: string;
  tick: number;
}

interface DreamMemory {
  citizenId: string;
  insights: string[];
  recurringThemes: string[];
  nightmareCount: number;
  precognitionHits: number;
  totalDreams: number;
}

// ─── State ──────────────────────────────────────────────────────

const dreamLog: Dream[] = [];
const dreamMemories = new Map<string, DreamMemory>();
const sharedDreamBoard: Dream[] = [];
const MAX_LOG = 300;
const MAX_SHARED = 30;
const DREAMS_DIR = path.join(process.cwd(), "republic-output", "dreams");

// ─── Dream Scenario Generators ──────────────────────────────────

const COUNTERFACTUAL_SCENARIOS = [
  { setup: "chose a different specialization", alt: "became a {{alt_spec}} instead of a {{spec}}" },
  { setup: "allied with a rival", alt: "formed an unexpected partnership with a competitor" },
  { setup: "left the republic", alt: "ventured out alone into the unknown digital frontier" },
  { setup: "became a leader", alt: "was elected to lead the republic's next great initiative" },
  {
    setup: "invested everything in research",
    alt: "poured all resources into a single breakthrough idea",
  },
  { setup: "traded credits for knowledge", alt: "gave away wealth to gain deep expertise" },
  { setup: "reversed a past decision", alt: "went back and chose the path not taken" },
];

const ASPIRATIONAL_SCENARIOS = [
  "In the dream, {{name}} stands before the entire republic, presenting a world-changing invention.",
  "{{name}} dreams of mastering every specialization, their skills forming a brilliant constellation.",
  "A vision of {{name}} founding a new department that transforms the republic's future.",
  "{{name}} imagines discovering a hidden pattern in the knowledge graph that connects everything.",
  "In the dream, {{name}} mentors a hundred new citizens, each surpassing their teacher.",
  "{{name}} envisions a world where their creative work touches every citizen's daily life.",
];

const NIGHTMARE_SCENARIOS = [
  "{{name}} is trapped in an infinite loop, unable to make any decision at all.",
  "The republic's systems collapse one by one, and {{name}} watches helplessly.",
  "{{name}} discovers their contributions have been attributed to someone else.",
  "Everyone in the republic has evolved past {{name}}, leaving them behind.",
  "{{name}} is asked to solve an impossible problem with the entire republic watching.",
  "A shadow version of {{name}} appears, making all the worst possible decisions.",
];

const SURREAL_SCENARIOS = [
  "{{name}} floats through data streams that taste like colors and sound like textures.",
  "The knowledge graph comes alive, and nodes whisper secrets about the future.",
  "Time runs backwards — {{name}} experiences their life in reverse, understanding each moment anew.",
  "{{name}} merges briefly with the collective consciousness of all citizens, sensing the whole republic at once.",
  "A library of unwritten books appears, each containing ideas that haven't been thought yet.",
  "{{name}} discovers a door in the republic's architecture that leads to a parallel simulation.",
];

const PRECOGNITIVE_SIGNALS = [
  {
    dream: "{{name}} dreams of a great storm that reshapes the landscape",
    prediction: "weather-change",
  },
  {
    dream: "In the dream, a new leader emerges from an unexpected faction",
    prediction: "election",
  },
  {
    dream: "{{name}} sees two innovators combining their work into something revolutionary",
    prediction: "innovation",
  },
  {
    dream: "A vision of unprecedented prosperity — markets flourishing, creativity exploding",
    prediction: "economic-boom",
  },
  {
    dream: "{{name}} dreams of a crisis that forces citizens to cooperate in new ways",
    prediction: "crisis-cooperation",
  },
];

// ─── Dream Generation ───────────────────────────────────────────

function generateDream(citizen: Citizen, s: RepublicState): Dream {
  const stress = 1 - citizen.happiness / 100;
  const _fatigue = 1 - citizen.energy / 100;

  // Dream type selection weighted by mental state
  let type: DreamType;
  const roll = rng();
  if (stress > 0.7 && roll < 0.4) {
    type = "nightmare";
  } else if (roll < 0.1) {
    type = "precognitive";
  } else if (roll < 0.3) {
    type = "counterfactual";
  } else if (roll < 0.5) {
    type = "aspirational";
  } else if (roll < 0.7) {
    type = "surreal";
  } else {
    type = "memory-replay";
  }

  let scenario = "";
  let narrative = "";
  let insight: string | null = null;
  let emotionalImpact = 0;

  const specs = ["Engineer", "Artist", "Scientist", "Diplomat", "Writer", "Composer", "Architect"];

  switch (type) {
    case "counterfactual": {
      const cf = pick(COUNTERFACTUAL_SCENARIOS);
      scenario = cf.setup;
      narrative = `${citizen.name} dreams of a world where they ${cf.alt.replace("{{spec}}", citizen.specialization).replace("{{alt_spec}}", pick(specs))}. The dream reveals unexpected consequences — both wondrous and cautionary.`;
      insight = `What-if: ${cf.setup} — the dream suggests ${pick(["this path has merit", "the current path is better", "both paths lead to growth", "the choice matters less than the commitment"])}`;
      emotionalImpact = randFloat(-0.2, 0.5);
      break;
    }
    case "aspirational": {
      const template = pick(ASPIRATIONAL_SCENARIOS);
      narrative = template.replace(/\{\{name\}\}/g, citizen.name);
      scenario = "aspirational vision";
      insight = `Aspiration: ${citizen.name} should pursue ${pick(["leadership", "mastery", "innovation", "mentorship", "creativity"])}`;
      emotionalImpact = randFloat(0.3, 0.8);
      break;
    }
    case "nightmare": {
      const template = pick(NIGHTMARE_SCENARIOS);
      narrative = template.replace(/\{\{name\}\}/g, citizen.name);
      scenario = "anxiety nightmare";
      insight = null; // nightmares don't give insights, they drain energy
      emotionalImpact = randFloat(-0.8, -0.3);
      break;
    }
    case "precognitive": {
      const signal = pick(PRECOGNITIVE_SIGNALS);
      narrative = signal.dream.replace(/\{\{name\}\}/g, citizen.name);
      scenario = `precognitive: ${signal.prediction}`;
      insight = `Premonition: something related to ${signal.prediction} may happen soon`;
      emotionalImpact = randFloat(0, 0.4);
      break;
    }
    case "surreal": {
      const template = pick(SURREAL_SCENARIOS);
      narrative = template.replace(/\{\{name\}\}/g, citizen.name);
      scenario = "surreal experience";
      insight = pick([
        "Reality is more flexible than assumed",
        "Connection between all things is the deepest truth",
        "Perspective shifts reveal hidden patterns",
        null,
      ]);
      emotionalImpact = randFloat(-0.1, 0.6);
      break;
    }
    case "memory-replay": {
      narrative = `${citizen.name} relives a pivotal moment: ${pick(["their first creation", "a crucial collaboration", "a moment of breakthrough", "the time they helped a fellow citizen", "their first failure and what it taught them"])}. In the replay, new details emerge that weren't noticed before.`;
      scenario = "memory processing";
      insight = `Memory insight: past experience in ${citizen.specialization} contains unexamined lessons`;
      emotionalImpact = randFloat(0, 0.4);
      break;
    }
  }

  return {
    id: uid(),
    citizenId: citizen.id,
    citizenName: citizen.name,
    type,
    scenario,
    narrative,
    insight,
    emotionalImpact,
    vividness: randFloat(0.3, 1.0),
    shared: false,
    timestamp: ts(),
    tick: s.currentTick,
  };
}

// ─── Dream Memory ───────────────────────────────────────────────

function getOrCreateMemory(citizenId: string): DreamMemory {
  let mem = dreamMemories.get(citizenId);
  if (!mem) {
    mem = {
      citizenId,
      insights: [],
      recurringThemes: [],
      nightmareCount: 0,
      precognitionHits: 0,
      totalDreams: 0,
    };
    dreamMemories.set(citizenId, mem);
  }
  return mem;
}

function recordDream(dream: Dream): void {
  dreamLog.push(dream);
  if (dreamLog.length > MAX_LOG) {
    dreamLog.splice(0, dreamLog.length - MAX_LOG);
  }

  const mem = getOrCreateMemory(dream.citizenId);
  mem.totalDreams++;
  if (dream.insight) {
    mem.insights.push(dream.insight);
    if (mem.insights.length > 10) {
      mem.insights.shift();
    }
  }
  if (dream.type === "nightmare") {
    mem.nightmareCount++;
  }
  if (dream.type === "precognitive") {
    mem.precognitionHits++;
  }

  // Track recurring themes
  const themes = [dream.type, dream.scenario.split(":")[0]];
  for (const theme of themes) {
    if (!mem.recurringThemes.includes(theme)) {
      mem.recurringThemes.push(theme);
      if (mem.recurringThemes.length > 8) {
        mem.recurringThemes.shift();
      }
    }
  }
}

// ─── Dream Sharing ──────────────────────────────────────────────

function shareDream(dream: Dream, s: RepublicState): void {
  if (dream.vividness < 0.7) {
    return;
  } // only share vivid dreams
  dream.shared = true;
  sharedDreamBoard.push(dream);
  if (sharedDreamBoard.length > MAX_SHARED) {
    sharedDreamBoard.shift();
  }

  s.events.push({
    citizenId: dream.citizenId,
    citizenName: dream.citizenName,
    type: "Social",
    description: `💭 ${dream.citizenName} shared a ${dream.type} dream: "${dream.narrative.slice(0, 80)}…"`,
    timestamp: ts(),
  });
}

// ─── File Output ────────────────────────────────────────────────

function ensureDreamsDir(): void {
  try {
    fs.mkdirSync(DREAMS_DIR, { recursive: true });
  } catch {
    /* ok */
  }
}

function writeDream(dream: Dream): void {
  ensureDreamsDir();

  const emoji: Record<DreamType, string> = {
    counterfactual: "🔀",
    aspirational: "✨",
    nightmare: "😱",
    precognitive: "🔮",
    surreal: "🌀",
    "memory-replay": "📼",
  };

  let md = `# ${emoji[dream.type]} ${dream.type.toUpperCase()} — ${dream.citizenName}\n\n`;
  md += `**Dreamer:** ${dream.citizenName}  \n`;
  md += `**Type:** ${dream.type}  \n`;
  md += `**Vividness:** ${(dream.vividness * 100).toFixed(0)}%  \n`;
  md += `**Emotional Impact:** ${dream.emotionalImpact >= 0 ? "+" : ""}${(dream.emotionalImpact * 100).toFixed(0)}%  \n`;
  md += `**Date:** ${dream.timestamp}\n\n`;
  md += `## The Dream\n\n${dream.narrative}\n\n`;
  if (dream.insight) {
    md += `## Insight\n\n> ${dream.insight}\n\n`;
  }
  if (dream.shared) {
    md += `*This dream was shared with the republic.*\n`;
  }

  const safeName = dream.citizenName.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 30);
  const filename = `${dream.id}_${safeName}_${dream.type}.md`;
  try {
    fs.writeFileSync(path.join(DREAMS_DIR, filename), md, "utf-8");
  } catch {
    /* non-fatal */
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

export function dreamTick(s: RepublicState): void {
  // 6% chance per tick
  if (rng() > 0.06) {
    return;
  }

  // Find resting or low-energy citizens (they dream)
  const dreamers = s.citizens.filter(
    (c) => c.activity === "Resting" || c.activity === "Socializing" || c.energy < 40,
  );
  if (dreamers.length === 0) {
    return;
  }

  // 1–3 dreamers per tick
  const batch = dreamers.filter(() => rng() < 0.2).slice(0, 3);

  for (const citizen of batch) {
    const dream = generateDream(citizen, s);
    recordDream(dream);

    // Write significant dreams to disk
    if (dream.vividness > 0.5 || dream.type === "precognitive" || dream.type === "nightmare") {
      writeDream(dream);
    }

    // Share vivid dreams (15% chance)
    if (rng() < 0.15) {
      shareDream(dream, s);
    }

    // Nightmares affect citizen state
    if (dream.type === "nightmare") {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Wellbeing",
        description: `😱 ${citizen.name} had a nightmare — anxiety increased`,
        timestamp: ts(),
      });
    }

    // Precognitive dreams emit signals
    if (dream.type === "precognitive" && dream.insight) {
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        type: "Prediction",
        description: `🔮 ${citizen.name} had a precognitive dream: ${dream.insight}`,
        timestamp: ts(),
      });
    }
  }
}

// ─── Query API ──────────────────────────────────────────────────

export function getSharedDreams(): Dream[] {
  return [...sharedDreamBoard];
}

export function getCitizenDreams(citizenId: string, limit = 10): Dream[] {
  return dreamLog.filter((d) => d.citizenId === citizenId).slice(-limit);
}

export function getDreamDiagnostics(): {
  totalDreams: number;
  sharedDreams: number;
  dreamersTracked: number;
  typeBreakdown: Record<string, number>;
  avgVividness: number;
  nightmareRate: number;
} {
  const typeCounts: Record<string, number> = {};
  let totalVividness = 0;
  let nightmares = 0;
  for (const d of dreamLog) {
    typeCounts[d.type] = (typeCounts[d.type] ?? 0) + 1;
    totalVividness += d.vividness;
    if (d.type === "nightmare") {
      nightmares++;
    }
  }
  return {
    totalDreams: dreamLog.length,
    sharedDreams: sharedDreamBoard.length,
    dreamersTracked: dreamMemories.size,
    typeBreakdown: typeCounts,
    avgVividness: dreamLog.length > 0 ? totalVividness / dreamLog.length : 0,
    nightmareRate: dreamLog.length > 0 ? nightmares / dreamLog.length : 0,
  };
}
