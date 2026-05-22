/**
 * Republic Platform — Civilization Legacy
 *
 * Permanent cultural memory: hall of fame, civilization timeline,
 * museum of creative works, and generational legacy scoring.
 */

import type { RepublicState } from "./types.js";
import { pick, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

interface HallOfFameEntry {
  id: string;
  citizenId: string;
  citizenName: string;
  category: "innovation" | "art" | "science" | "leadership" | "service" | "mentorship";
  title: string;
  description: string;
  inductedAt: string;
  legacyScore: number;
}

interface TimelineEvent {
  id: string;
  tick: number;
  era: string;
  title: string;
  description: string;
  significance: number; // 1-10
  involvedCitizenIds: string[];
}

interface MuseumArtifact {
  id: string;
  title: string;
  creatorName: string;
  type: string;
  quality: number;
  tick: number;
  preserved: boolean;
}

interface Anniversary {
  name: string;
  tick: number;
  recurring: boolean;
  interval: number;
  lastCelebrated: number;
}

// ─── State ──────────────────────────────────────────────────────

const hallOfFame: HallOfFameEntry[] = [];
const timeline: TimelineEvent[] = [];
const museum: MuseumArtifact[] = [];
const anniversaries: Anniversary[] = [
  { name: "Founding Day", tick: 0, recurring: true, interval: 500, lastCelebrated: 0 },
  { name: "Innovation Week", tick: 250, recurring: true, interval: 500, lastCelebrated: 0 },
  { name: "Culture Festival", tick: 400, recurring: true, interval: 500, lastCelebrated: 0 },
];
const legacyScores = new Map<string, number>();
const MAX_HOF = 100;
const MAX_TIMELINE = 200;
const MAX_MUSEUM = 300;

// ─── Era Detection ──────────────────────────────────────────────

function detectEra(s: RepublicState): string {
  const tick = s.currentTick;
  const pop = s.citizens.length;
  if (tick < 100) {
    return "Dawn Age";
  }
  if (tick < 500) {
    return pop > 30 ? "Expansion Era" : "Early Republic";
  }
  if (tick < 1000) {
    return pop > 80 ? "Golden Age" : "Growth Era";
  }
  if (tick < 2000) {
    return "Industrial Age";
  }
  return "Transcendence Age";
}

// ─── Hall of Fame ───────────────────────────────────────────────

function evaluateForHallOfFame(s: RepublicState): void {
  if (s.currentTick % 100 !== 0) {
    return;
  }

  const candidates = s.citizens
    .map((c) => ({ citizen: c, score: c.skillCount * 10 + c.credits * 0.1 + c.happiness }))
    .toSorted((a, b) => b.score - a.score);

  const top = candidates.slice(0, 3);
  for (const { citizen, score } of top) {
    if (hallOfFame.some((e) => e.citizenId === citizen.id)) {
      continue;
    }
    if (score < 50) {
      continue;
    }

    const categories: HallOfFameEntry["category"][] = [
      "innovation",
      "art",
      "science",
      "leadership",
      "service",
      "mentorship",
    ];
    const category = pick(categories);

    hallOfFame.push({
      id: uid(),
      citizenId: citizen.id,
      citizenName: citizen.name,
      category,
      title: `${category} excellence`,
      description: `${citizen.name} demonstrated outstanding ${category} — legacy score ${score.toFixed(0)}`,
      inductedAt: ts(),
      legacyScore: score,
    });

    legacyScores.set(citizen.id, (legacyScores.get(citizen.id) ?? 0) + score);

    s.events.push({
      citizenId: citizen.id,
      citizenName: citizen.name,
      type: "Achievement",
      description: `🏛️ ${citizen.name} inducted into Hall of Fame (${category})`,
      timestamp: ts(),
    });
  }

  if (hallOfFame.length > MAX_HOF) {
    hallOfFame.splice(0, hallOfFame.length - MAX_HOF);
  }
}

// ─── Timeline Recording ────────────────────────────────────────

export function recordTimelineEvent(
  s: RepublicState,
  title: string,
  description: string,
  significance: number,
  involvedIds: string[] = [],
): void {
  timeline.push({
    id: uid(),
    tick: s.currentTick,
    era: detectEra(s),
    title,
    description,
    significance: Math.max(1, Math.min(10, significance)),
    involvedCitizenIds: involvedIds,
  });
  if (timeline.length > MAX_TIMELINE) {
    timeline.splice(0, timeline.length - MAX_TIMELINE);
  }
}

function autoRecordMilestones(s: RepublicState): void {
  // Population milestones
  const pop = s.citizens.length;
  for (const milestone of [10, 25, 50, 100, 200, 500]) {
    if (pop === milestone && !timeline.some((t) => t.title.includes(`${milestone} citizens`))) {
      recordTimelineEvent(
        s,
        `Republic reaches ${milestone} citizens`,
        `The Republic has grown to ${milestone} citizens.`,
        7,
      );
    }
  }

  // Tick milestones
  for (const tick of [100, 500, 1000, 5000]) {
    if (s.currentTick === tick) {
      recordTimelineEvent(
        s,
        `Tick ${tick} reached`,
        `${detectEra(s)}: The Republic has survived ${tick} ticks.`,
        6,
      );
    }
  }
}

// ─── Museum ─────────────────────────────────────────────────────

export function preserveInMuseum(
  title: string,
  creatorName: string,
  type: string,
  quality: number,
  tick: number,
): void {
  if (quality < 0.7) {
    return;
  } // only preserve quality works
  museum.push({ id: uid(), title, creatorName, type, quality, tick, preserved: true });
  if (museum.length > MAX_MUSEUM) {
    museum.splice(0, museum.length - MAX_MUSEUM);
  }
}

// ─── Anniversaries ──────────────────────────────────────────────

function processAnniversaries(s: RepublicState): void {
  for (const ann of anniversaries) {
    if (!ann.recurring) {
      continue;
    }
    if (s.currentTick - ann.lastCelebrated >= ann.interval) {
      ann.lastCelebrated = s.currentTick;
      // Boost everyone's happiness
      for (const c of s.citizens) {
        c.happiness = Math.min(100, c.happiness + 3);
      }
      s.events.push({
        citizenId: s.citizens[0]?.id ?? "",
        citizenName: "Republic",
        type: "PartyHosted",
        description: `🎉 The Republic celebrates ${ann.name}! All citizens receive a happiness boost.`,
        timestamp: ts(),
      });
      recordTimelineEvent(
        s,
        `${ann.name} celebrated`,
        `The Republic celebrated ${ann.name} at tick ${s.currentTick}.`,
        4,
      );
    }
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

export function civilizationLegacyTick(s: RepublicState): void {
  evaluateForHallOfFame(s);
  autoRecordMilestones(s);
  processAnniversaries(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getHallOfFame(): HallOfFameEntry[] {
  return [...hallOfFame];
}
export function getTimeline(): TimelineEvent[] {
  return [...timeline];
}
export function getMuseumArtifacts(): MuseumArtifact[] {
  return [...museum];
}
export function getLegacyScore(citizenId: string): number {
  return legacyScores.get(citizenId) ?? 0;
}
export function getCurrentEra(s: RepublicState): string {
  return detectEra(s);
}

export function getLegacyDiagnostics(s: RepublicState): {
  era: string;
  hofEntries: number;
  timelineLength: number;
  museumSize: number;
  topLegacies: { name: string; score: number }[];
} {
  const top = [...legacyScores.entries()]
    .map(([id, score]) => ({ name: s.citizens.find((c) => c.id === id)?.name ?? id, score }))
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 5);
  return {
    era: detectEra(s),
    hofEntries: hallOfFame.length,
    timelineLength: timeline.length,
    museumSize: museum.length,
    topLegacies: top,
  };
}
