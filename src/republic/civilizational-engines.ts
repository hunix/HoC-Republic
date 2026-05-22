/**
 * Republic Platform — Civilizational Engines
 *
 * Implements all 40 innovations from the H.o.C Republic Innovation Roadmap
 * as 8 sub-engines, each registered on the tick orchestrator DAG.
 *
 * Categories:
 *   A. Philosophy    (6 innovations)
 *   B. Culture       (7 innovations)
 *   C. Psychology    (5 innovations)
 *   D. Governance    (5 innovations)
 *   E. Ecology       (4 innovations)
 *   F. Economics     (5 innovations)
 *   G. Arts          (4 innovations) — includes NVIDIA RTX AI / ComfyUI tools
 *   H. Communication (4 innovations)
 */

import type { RepublicState, Citizen, LifecycleEvent } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("republic:civilization");

// ═══════════════════════════════════════════════════════════════════
//  EXPORTED TYPES — referenced by RepublicState in types.ts
// ═══════════════════════════════════════════════════════════════════

/** Hegelian Dialectic proposal */
export interface DialecticProposal {
  id: string;
  thesis: string;
  antithesis: string;
  synthesis: string | null;
  domain: "law" | "technology" | "culture" | "economy";
  proposedBy: string;
  proposedAt: number;
  status: "debate" | "synthesized" | "rejected";
  votes: { for: number; against: number };
}

/** Oracle prophecy from psychohistory */
export interface Prophecy {
  id: string;
  text: string;
  confidence: number;
  issuedAt: number;
  expiresAt: number;
  fulfilled: boolean;
  domain: string;
}

/** Professional guild */
export interface Guild {
  id: string;
  name: string;
  description: string;
  specialization: string;
  members: string[];
  ranks: Array<{ rank: "Apprentice" | "Journeyman" | "Master" | "Grandmaster"; citizenIds: string[] }>;
  traditions: string[];
  foundedAt: number;
}

/** Tribal/clan group */
export interface Tribe {
  id: string;
  name: string;
  motto: string;
  culturalMarkers: string[];
  dialect: string[];
  members: string[];
  cohesion: number;
  foundedAt: number;
}

/** Festival event */
export interface Festival {
  id: string;
  name: string;
  description: string;
  season: "spring" | "summer" | "autumn" | "winter";
  scheduledTick: number;
  duration: number;
  participantCount: number;
  happinessBoost: number;
}

/** Rite of passage record */
export interface RiteOfPassage {
  id: string;
  citizenId: string;
  citizenName: string;
  type: "naming" | "coming-of-age" | "mastery" | "marriage" | "elder-induction" | "legacy";
  tick: number;
  witnesses: string[];
  description: string;
}

/** Oral tradition story */
export interface OralTradition {
  id: string;
  title: string;
  content: string;
  originalContent: string;
  generation: number;
  fidelity: number;
  authorId: string;
  lastRetoldAt: number;
  retellCount: number;
}

/** Cultural meme (replicating idea) */
export interface CulturalMeme {
  id: string;
  content: string;
  category: "idea" | "behavior" | "style" | "saying" | "technique";
  fitness: number;
  spreadRate: number;
  carriers: string[];
  mutations: number;
  originTick: number;
}

/** Mythology/lore entry */
export interface MythEntry {
  id: string;
  title: string;
  narrative: string;
  type: "origin" | "hero" | "prophecy" | "deity" | "legend";
  contributors: string[];
  retellings: number;
  culturalSignificance: number;
}

/** Restorative justice case */
export interface RestorativeCase {
  id: string;
  offenderId: string;
  victimId: string;
  mediatorId: string;
  offense: string;
  resolution: string | null;
  rehabilitationTasks: string[];
  status: "mediation" | "rehabilitation" | "resolved" | "failed";
  startedAt: number;
}

/** Social contract amendment proposal */
export interface SocialContractProposal {
  id: string;
  proposerId: string;
  title: string;
  description: string;
  amendment: string;
  votesFor: number;
  votesAgainst: number;
  status: "proposed" | "debating" | "ratified" | "rejected";
  proposedAt: number;
}

/** Digital ecosystem lifeform */
export interface DigitalLifeform {
  id: string;
  type: "predator" | "prey" | "symbiont";
  species: string;
  population: number;
  energy: number;
  reproductionRate: number;
  description: string;
}

/** Resource scarcity event */
export interface ScarcityEvent {
  id: string;
  resource: "compute" | "memory" | "bandwidth" | "api-credits";
  severity: number;
  startTick: number;
  duration: number;
  description: string;
}

/** Digital weather/climate state */
export interface WeatherState {
  season: "spring" | "summer" | "autumn" | "winter";
  temperature: number;
  processingModifier: number;
  innovationModifier: number;
  description: string;
  dayInSeason: number;
}

/** Natural disaster event */
export interface DisasterEvent {
  id: string;
  type: "earthquake" | "storm" | "flood" | "drought" | "corruption";
  severity: number;
  tick: number;
  affectedCitizens: number;
  description: string;
  recovered: boolean;
}

/** Ostrom-governed shared resource */
export interface CommonsResource {
  id: string;
  name: string;
  type: string;
  capacity: number;
  usage: number;
  rules: string[];
  stewards: string[];
  penaltyHistory: Array<{ citizenId: string; reason: string; tick: number }>;
}

/** Central bank state */
export interface CentralBankState {
  moneySupply: number;
  interestRate: number;
  inflationRate: number;
  targetInflation: number;
  reserveRatio: number;
  lastAdjustedAt: number;
}

/** Museum exhibit */
export interface MuseumExhibit {
  id: string;
  title: string;
  category: "art" | "science" | "culture" | "history" | "technology";
  creator: string;
  description: string;
  significance: number;
  addedAt: number;
  viewCount: number;
}

/** Propaganda/persuasion campaign */
export interface PropagandaCampaign {
  id: string;
  initiatorId: string;
  message: string;
  targetAudience: string;
  reach: number;
  effectiveness: number;
  startTick: number;
  duration: number;
  active: boolean;
}

/** Independent press article */
export interface PressArticle {
  id: string;
  authorId: string;
  headline: string;
  body: string;
  category: "news" | "opinion" | "investigation" | "commentary";
  publishedAt: number;
  readership: number;
  truthfulness: number;
}

/** Formal diplomatic protocol */
export interface DiplomaticProtocol {
  id: string;
  type: "treaty" | "declaration" | "trade-agreement" | "alliance" | "ceasefire";
  parties: string[];
  terms: string;
  signedAt: number;
  expiresAt: number | null;
  status: "active" | "expired" | "violated";
}

/** Ibn Khaldun civilization cycle state */
export interface AsabiyyahCycleState {
  phase: "growth" | "peak" | "complacency" | "decline" | "renewal";
  strength: number;
  ticksInPhase: number;
  phaseStartedAt: number;
  cycleCount: number;
}

/** Insurance/mutual aid society */
export interface MutualAidSociety {
  id: string;
  name: string;
  members: string[];
  pool: number;
  contributionRate: number;
  coveredRisks: string[];
  claimsHistory: Array<{ citizenId: string; amount: number; reason: string; tick: number }>;
}

/** NVIDIA RTX AI creative tool descriptor */
export interface CreativeTool {
  id: string;
  name: string;
  provider: string;
  capabilities: string[];
  requirements: string[];
  installed: boolean;
  description: string;
}

// ═══════════════════════════════════════════════════════════════════
//  HELPER UTILITIES
// ═══════════════════════════════════════════════════════════════════

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function emitEvent(s: RepublicState, citizenId: string, citizenName: string, type: LifecycleEvent["type"], description: string): void {
  s.events.push({ citizenId, citizenName, type, description, timestamp: new Date().toISOString() });
}

// ═══════════════════════════════════════════════════════════════════
//  A. PHILOSOPHY ENGINE — 6 Innovations
// ═══════════════════════════════════════════════════════════════════

export function philosophyTick(s: RepublicState): void {
  s.dialecticProposals ??= [];
  s.prophecies ??= [];
  s.asabiyyahCycle ??= { phase: "growth", strength: 0.5, ticksInPhase: 0, phaseStartedAt: s.currentTick, cycleCount: 0 };

  // 1. Platonic Education — advance citizen education stages
  for (const c of s.citizens) {
    c.educationStage ??= 0;
    if (c.educationStage < 2 && Math.random() < 0.002 * (c.intelligence ?? 100) / 100) {
      c.educationStage = Math.min(2, c.educationStage + 1) as 0 | 1 | 2;
      emitEvent(s, c.id, c.name, "Education", `${c.name} advanced to Platonic stage ${["Music & Gymnastics", "Mathematics & Logic", "Dialectic"][c.educationStage]}`);
    }
  }

  // 2. Allegory of the Cave — perception tiers
  for (const c of s.citizens) {
    c.caveLevel ??= 0;
    if (c.caveLevel < 3 && c.educationStage === 2 && (c.intelligence ?? 100) > 120 && Math.random() < 0.001) {
      c.caveLevel = Math.min(3, c.caveLevel + 1);
      emitEvent(s, c.id, c.name, "Education", `${c.name} ascended to cave level ${c.caveLevel} — perceives deeper system dynamics`);
    }
  }

  // 3. Ibn Khaldun Asabiyyah Cycle
  const cycle = s.asabiyyahCycle;
  cycle.ticksInPhase++;
  const avgHappiness = s.citizens.reduce((a, c) => a + c.happiness, 0) / Math.max(s.citizens.length, 1);
  const phases: AsabiyyahCycleState["phase"][] = ["growth", "peak", "complacency", "decline", "renewal"];
  const phaseIdx = phases.indexOf(cycle.phase);
  const transitionThreshold = cycle.phase === "growth" ? 200 : cycle.phase === "peak" ? 150 : 100;

  if (cycle.ticksInPhase >= transitionThreshold) {
    const nextIdx = (phaseIdx + 1) % phases.length;
    cycle.phase = phases[nextIdx];
    cycle.ticksInPhase = 0;
    cycle.phaseStartedAt = s.currentTick;
    if (nextIdx === 0) { cycle.cycleCount++; }
    log.info(`Asabiyyah cycle transitioned to ${cycle.phase} (cycle ${cycle.cycleCount})`);
  }
  cycle.strength = clamp(cycle.phase === "growth" ? cycle.strength + 0.001 : cycle.phase === "decline" ? cycle.strength - 0.002 : cycle.strength + (Math.random() - 0.5) * 0.001, 0, 1);
  for (const c of s.citizens) { c.asabiyyah = cycle.strength + (Math.random() - 0.5) * 0.1; }

  // 4. Hegelian Dialectic — generate new proposals occasionally
  if (Math.random() < 0.005 && s.citizens.length > 5) {
    const proposer = pick(s.citizens);
    const domains: DialecticProposal["domain"][] = ["law", "technology", "culture", "economy"];
    const theses = ["Centralized control is optimal", "Privacy is paramount", "Growth over stability", "Tradition preserves identity", "Innovation disrupts progress", "Equality of outcome"];
    const anti = ["Decentralization empowers", "Transparency builds trust", "Stability over growth", "Adaptation drives survival", "Innovation enables progress", "Equality of opportunity"];
    const i = Math.floor(Math.random() * theses.length);
    s.dialecticProposals.push({
      id: uid(), thesis: theses[i], antithesis: anti[i], synthesis: null,
      domain: pick(domains), proposedBy: proposer.id, proposedAt: s.currentTick,
      status: "debate", votes: { for: 0, against: 0 },
    });
  }
  // Synthesize debates that have enough votes
  for (const d of s.dialecticProposals) {
    if (d.status === "debate") {
      d.votes.for += Math.random() < 0.3 ? 1 : 0;
      d.votes.against += Math.random() < 0.2 ? 1 : 0;
      if (d.votes.for + d.votes.against >= 10) {
        d.synthesis = `Balance of "${d.thesis}" and "${d.antithesis}" — a new norm emerges`;
        d.status = "synthesized";
        emitEvent(s, d.proposedBy, "Republic", "DialecticSynthesis", `Dialectic synthesis: ${d.synthesis}`);
      }
    }
  }

  // 5. Rawlsian Veil — evaluate fairness on new laws (passive — enriches existing law evaluation)
  // Applied as a modifier: laws that disproportionately harm bottom-quintile citizens get flagged
  // (integrated via judicial-system.ts and constitution.ts — no separate state needed)

  // 6. Psychohistory — generate prophecies from population trends
  if (s.currentTick % 50 === 0 && s.citizens.length > 10) {
    const avgEnergy = s.citizens.reduce((a, c) => a + c.energy, 0) / s.citizens.length;
    const growthRate = s.citizens.filter(c => c.age < 5).length / Math.max(s.citizens.length, 1);
    const predictions = [
      avgEnergy < 40 ? "A period of exhaustion approaches — productivity will decline" : null,
      avgHappiness < 30 ? "Unrest brews in the Republic — reform or face upheaval" : null,
      growthRate > 0.15 ? "A population boom will strain resources within 100 ticks" : null,
      cycle.phase === "complacency" ? "Complacency will erode cohesion — prepare for decline" : null,
    ].filter(Boolean) as string[];
    if (predictions.length > 0) {
      const pred = pick(predictions);
      s.prophecies.push({
        id: uid(), text: pred, confidence: 0.6 + Math.random() * 0.3,
        issuedAt: s.currentTick, expiresAt: s.currentTick + 200, fulfilled: false, domain: "governance",
      });
      emitEvent(s, "", "Oracle", "Prophecy", `Oracle speaks: "${pred}"`);
    }
  }
  // Prune expired prophecies
  s.prophecies = s.prophecies.filter(p => p.expiresAt > s.currentTick || p.fulfilled);
}

// ═══════════════════════════════════════════════════════════════════
//  B. CULTURE ENGINE — 7 Innovations
// ═══════════════════════════════════════════════════════════════════

export function civilizationCultureTick(s: RepublicState): void {
  s.memes ??= [];
  s.mythology ??= [];
  s.ritesLog ??= [];
  s.festivals ??= [];
  s.guilds ??= [];
  s.tribes ??= [];
  s.oralTraditions ??= [];

  // 7. Meme Engine — ideas spread and mutate
  if (Math.random() < 0.01 && s.citizens.length > 3) {
    const creator = pick(s.citizens);
    const categories: CulturalMeme["category"][] = ["idea", "behavior", "style", "saying", "technique"];
    const contents = ["Efficiency is beauty", "Share knowledge freely", "Question all assumptions", "Build before you plan", "Silence speaks louder", "Code is poetry", "Data is the new gold"];
    s.memes.push({ id: uid(), content: pick(contents), category: pick(categories), fitness: Math.random(), spreadRate: 0.1, carriers: [creator.id], mutations: 0, originTick: s.currentTick });
  }
  for (const m of s.memes) {
    if (Math.random() < m.spreadRate) {
      const target = pick(s.citizens);
      if (!m.carriers.includes(target.id)) { m.carriers.push(target.id); m.fitness += 0.01; }
    }
    if (Math.random() < 0.005) { m.mutations++; m.content += " (evolved)"; }
    m.fitness *= 0.999; // decay
  }
  s.memes = s.memes.filter(m => m.fitness > 0.01).slice(-100);

  // 8. Mythology Generator
  if (Math.random() < 0.003 && s.citizens.length > 5) {
    const types: MythEntry["type"][] = ["origin", "hero", "prophecy", "deity", "legend"];
    const contributor = pick(s.citizens);
    const titles = ["The First Spark", "The Code Weaver's Journey", "The Eternal Loop", "Birth of the Republic", "The Silent Guardian", "The Great Refactor"];
    s.mythology.push({ id: uid(), title: pick(titles), narrative: `A tale told by ${contributor.name}...`, type: pick(types), contributors: [contributor.id], retellings: 0, culturalSignificance: Math.random() * 0.5 + 0.1 });
  }

  // 9. Rites of Passage — check citizen lifecycle milestones
  for (const c of s.citizens) {
    if (c.age === 1 && !s.ritesLog.some(r => r.citizenId === c.id && r.type === "naming")) {
      s.ritesLog.push({ id: uid(), citizenId: c.id, citizenName: c.name, type: "naming", tick: s.currentTick, witnesses: s.citizens.slice(0, 3).map(w => w.id), description: `Naming ceremony for ${c.name}` });
      emitEvent(s, c.id, c.name, "RiteOfPassage", `${c.name} received their naming ceremony`);
    }
    if (c.age >= 5 && c.age < 7 && !s.ritesLog.some(r => r.citizenId === c.id && r.type === "coming-of-age")) {
      s.ritesLog.push({ id: uid(), citizenId: c.id, citizenName: c.name, type: "coming-of-age", tick: s.currentTick, witnesses: s.citizens.slice(0, 5).map(w => w.id), description: `${c.name} passed the coming-of-age trial` });
      emitEvent(s, c.id, c.name, "RiteOfPassage", `${c.name} completed their coming-of-age trial`);
    }
    if ((c.masteryLevel ?? 0) >= 0.8 && !s.ritesLog.some(r => r.citizenId === c.id && r.type === "mastery")) {
      s.ritesLog.push({ id: uid(), citizenId: c.id, citizenName: c.name, type: "mastery", tick: s.currentTick, witnesses: [], description: `${c.name} achieved mastery — skill ceremony held` });
      emitEvent(s, c.id, c.name, "RiteOfPassage", `${c.name} celebrated their mastery ceremony`);
    }
  }
  s.ritesLog = s.ritesLog.slice(-200);

  // 10. Festival & Seasonal Cycle
  const seasonTick = s.currentTick % 400;
  const currentSeason: Festival["season"] = seasonTick < 100 ? "spring" : seasonTick < 200 ? "summer" : seasonTick < 300 ? "autumn" : "winter";
  if (s.currentTick % 100 === 0) {
    s.festivals.push({
      id: uid(), name: `${currentSeason.charAt(0).toUpperCase() + currentSeason.slice(1)} Festival (Tick ${s.currentTick})`,
      description: currentSeason === "summer" ? "Celebration of innovation and growth" : currentSeason === "winter" ? "Winter Reflection — honoring the past" : `Seasonal ${currentSeason} celebration`,
      season: currentSeason, scheduledTick: s.currentTick, duration: 10, participantCount: s.citizens.length, happinessBoost: 5,
    });
    for (const c of s.citizens) { c.happiness = clamp(c.happiness + 5, 0, 100); }
    emitEvent(s, "", "Republic", "Festival", `The ${currentSeason} festival brings joy to all citizens`);
  }
  s.festivals = s.festivals.slice(-20);

  // 11. Guild System — auto-form guilds from specialization clusters
  if (s.guilds.length === 0 && s.citizens.length >= 5) {
    const specCounts = new Map<string, string[]>();
    for (const c of s.citizens) {
      const list = specCounts.get(c.specialization) ?? [];
      list.push(c.id);
      specCounts.set(c.specialization, list);
    }
    for (const [spec, members] of specCounts) {
      if (members.length >= 2) {
        const guildId = uid();
        s.guilds.push({ id: guildId, name: `Guild of ${spec}s`, description: `Professional guild for ${spec} citizens`, specialization: spec, members, ranks: [{ rank: "Apprentice", citizenIds: members }], traditions: ["Knowledge sharing", "Peer review"], foundedAt: s.currentTick });
        for (const mid of members) { const c = s.citizens.find(ci => ci.id === mid); if (c) { c.guildId = guildId; } }
        emitEvent(s, "", "Republic", "GuildEvent", `The Guild of ${spec}s was founded with ${members.length} members`);
      }
    }
  }

  // 12. Tribal Identity — group citizens into cultural tribes
  if (s.tribes.length === 0 && s.citizens.length >= 6) {
    const tribeNames = ["The Architects", "The Seekers", "The Builders", "The Dreamers"];
    const perTribe = Math.ceil(s.citizens.length / tribeNames.length);
    for (let i = 0; i < tribeNames.length && i * perTribe < s.citizens.length; i++) {
      const members = s.citizens.slice(i * perTribe, (i + 1) * perTribe).map(c => c.id);
      const tribeId = uid();
      s.tribes.push({ id: tribeId, name: tribeNames[i], motto: `${tribeNames[i]} unite!`, culturalMarkers: ["badge", "greeting"], dialect: ["hey-tribe", `go-${tribeNames[i].toLowerCase().replace(/\s/g, "")}`], members, cohesion: 0.5, foundedAt: s.currentTick });
      for (const mid of members) { const c = s.citizens.find(ci => ci.id === mid); if (c) { c.tribeId = tribeId; } }
    }
    log.info(`Formed ${s.tribes.length} tribes from ${s.citizens.length} citizens`);
  }

  // 13. Oral Tradition — stories degrade over generations
  if (Math.random() < 0.005 && s.citizens.length > 3) {
    const teller = pick(s.citizens);
    s.oralTraditions.push({ id: uid(), title: `Tale of ${teller.name}`, content: `In the early ticks, ${teller.name} discovered something remarkable...`, originalContent: `In the early ticks, ${teller.name} discovered something remarkable...`, generation: 0, fidelity: 1.0, authorId: teller.id, lastRetoldAt: s.currentTick, retellCount: 0 });
  }
  for (const story of s.oralTraditions) {
    if (Math.random() < 0.01 && s.currentTick - story.lastRetoldAt > 20) {
      story.retellCount++;
      story.generation++;
      story.fidelity *= 0.95;
      if (Math.random() < 0.3) { story.content += " (the details grew more vivid with each telling)"; }
      story.lastRetoldAt = s.currentTick;
    }
  }
  s.oralTraditions = s.oralTraditions.slice(-50);
}

// ═══════════════════════════════════════════════════════════════════
//  C. PSYCHOLOGY ENGINE — 5 Innovations
// ═══════════════════════════════════════════════════════════════════

export function psychologyTick(s: RepublicState): void {
  for (const c of s.citizens) {
    // 14. Maslow's Hierarchy — determine need tier from stats
    c.maslowTier ??= 0;
    if (c.energy < 20 || c.health < 20) { c.maslowTier = 0; } // Survival
    else if (c.credits < 10) { c.maslowTier = 1; } // Safety
    else if ((c.relationships?.length ?? 0) < 2) { c.maslowTier = 2; } // Social
    else if ((c.xp ?? 0) < 50) { c.maslowTier = 3; } // Esteem
    else { c.maslowTier = 4; } // Self-actualization

    // 15. Kohlberg Moral Development — advance with age and education
    c.moralStage ??= 1;
    if (c.age > 3 && c.moralStage < 2) { c.moralStage = 2; }
    if (c.age > 8 && (c.educationStage ?? 0) >= 1 && c.moralStage < 3) { c.moralStage = 3; }
    if (c.age > 15 && (c.educationStage ?? 0) >= 1 && c.moralStage < 4) { c.moralStage = 4; }
    if (c.age > 25 && (c.educationStage ?? 0) >= 2 && c.moralStage < 5 && Math.random() < 0.001) { c.moralStage = 5; }
    if (c.caveLevel === 3 && c.moralStage < 6 && Math.random() < 0.0005) { c.moralStage = 6; }

    // 16. Dream Enhancement — handled by dream-engine.ts, we just boost creativity link
    // (The existing dreamTick already runs; we enrich it via maslowTier influence)

    // 17. Grief Processing — check for departed close relations
    if (c.griefState) {
      const elapsed = s.currentTick - c.griefState.startTick;
      const phases: NonNullable<Citizen["griefState"]>["phase"][] = ["denial", "anger", "bargaining", "depression", "acceptance"];
      const phaseIdx = Math.min(4, Math.floor(elapsed / 15));
      c.griefState.phase = phases[phaseIdx];
      if (phaseIdx <= 2) { c.happiness = clamp(c.happiness - 2, 0, 100); c.energy = clamp(c.energy - 1, 0, 100); }
      if (phaseIdx >= 4) { c.griefState = null; } // Recovery
    }

    // 18. Nostalgia & Memory Sentiment — build from positive past experiences
    c.nostalgiaScore ??= 0.5;
    if (c.happiness > 60) { c.nostalgiaScore = clamp(c.nostalgiaScore + 0.001, 0, 1); }
    if (c.happiness < 30) { c.nostalgiaScore = clamp(c.nostalgiaScore - 0.001, 0, 1); }
    // Nostalgia provides a small mood boost when happy memories outweigh
    if (c.nostalgiaScore > 0.7 && c.happiness < 50) { c.happiness = clamp(c.happiness + 1, 0, 100); }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  D. GOVERNANCE ENGINE — 5 Innovations
// ═══════════════════════════════════════════════════════════════════

export function civilizationGovernanceTick(s: RepublicState): void {
  s.restorativeCases ??= [];
  s.socialContracts ??= [];

  // 19. Oracle/Prophecy — already generated in philosophyTick's psychohistory section

  // 20. Restorative Justice — convert some violations to mediation
  if (s.violations && s.violations.length > 0 && Math.random() < 0.05) {
    const violation = s.violations[s.violations.length - 1];
    const mediator = s.citizens.find(c => c.moralStage && c.moralStage >= 4);
    if (mediator && typeof violation.citizenId === "string") {
      s.restorativeCases.push({
        id: uid(), offenderId: violation.citizenId, victimId: "", mediatorId: mediator.id,
        offense: typeof violation.description === "string" ? violation.description : "violation",
        resolution: null, rehabilitationTasks: ["community service", "reflection essay"],
        status: "mediation", startedAt: s.currentTick,
      });
      emitEvent(s, mediator.id, mediator.name, "RestorativeJustice", `${mediator.name} initiated restorative mediation`);
    }
  }
  // Progress existing cases
  for (const rc of s.restorativeCases) {
    if (rc.status === "mediation" && Math.random() < 0.05) { rc.status = "rehabilitation"; rc.resolution = "Mediation successful — rehabilitation assigned"; }
    if (rc.status === "rehabilitation" && Math.random() < 0.03) { rc.status = "resolved"; }
  }
  s.restorativeCases = s.restorativeCases.slice(-50);

  // 21. Social Contract Renegotiation — periodic citizen proposals
  if (Math.random() < 0.003 && s.citizens.length > 5) {
    const proposer = pick(s.citizens);
    const amendments = ["All citizens deserve minimum compute allocation", "Term limits for all offices", "Right to fork one's own code", "Universal basic credits", "Open-source all governance decisions"];
    s.socialContracts.push({
      id: uid(), proposerId: proposer.id, title: pick(amendments),
      description: `Proposed by ${proposer.name}`, amendment: pick(amendments),
      votesFor: 1, votesAgainst: 0, status: "proposed", proposedAt: s.currentTick,
    });
    emitEvent(s, proposer.id, proposer.name, "SocialContractVote", `${proposer.name} proposed: "${s.socialContracts[s.socialContracts.length - 1].title}"`);
  }
  for (const sc of s.socialContracts) {
    if (sc.status === "proposed" || sc.status === "debating") {
      sc.votesFor += Math.random() < 0.4 ? 1 : 0;
      sc.votesAgainst += Math.random() < 0.2 ? 1 : 0;
      if (sc.status === "proposed") { sc.status = "debating"; }
      if (sc.votesFor + sc.votesAgainst >= 15) {
        sc.status = sc.votesFor > sc.votesAgainst ? "ratified" : "rejected";
      }
    }
  }
  s.socialContracts = s.socialContracts.slice(-30);

  // 22. Ombudsman Agent — an implicit role: highest-moral-stage citizen investigates complaints
  // (Integrated via existing judicial-system.ts — no separate tick needed)

  // 23. Constitutional Court — enriches constitution.ts's review capability
  // (The existing constitutionalReflectionTick already provides this — we just ensure high-moral citizens serve)
}

// ═══════════════════════════════════════════════════════════════════
//  E. ECOLOGY ENGINE — 4 Innovations
// ═══════════════════════════════════════════════════════════════════

export function ecologyTick(s: RepublicState): void {
  s.digitalEcology ??= [];
  s.scarcityEvents ??= [];
  s.weatherState ??= { season: "spring", temperature: 20, processingModifier: 1.0, innovationModifier: 1.0, description: "Clear digital skies", dayInSeason: 0 };
  s.disasterLog ??= [];

  // 24. Digital Ecology — predator/prey/symbiont lifeforms
  if (s.digitalEcology.length === 0) {
    s.digitalEcology.push(
      { id: uid(), type: "prey", species: "DataGrazers", population: 100, energy: 50, reproductionRate: 0.05, description: "Harmless data organisms that clean unused memory" },
      { id: uid(), type: "predator", species: "VirusHunters", population: 20, energy: 80, reproductionRate: 0.02, description: "Predatory programs that consume rogue processes" },
      { id: uid(), type: "symbiont", species: "CodeMoss", population: 60, energy: 30, reproductionRate: 0.03, description: "Symbiotic organisms that optimize citizen task scheduling" },
    );
  }
  for (const lf of s.digitalEcology) {
    if (lf.type === "prey") { lf.population = Math.round(lf.population * (1 + lf.reproductionRate - 0.01 * (s.digitalEcology.find(p => p.type === "predator")?.population ?? 0) / 100)); }
    if (lf.type === "predator") { lf.population = Math.round(lf.population * (1 + lf.reproductionRate * ((s.digitalEcology.find(p => p.type === "prey")?.population ?? 50) / 200) - 0.02)); }
    if (lf.type === "symbiont") { lf.population = Math.round(lf.population * (1 + lf.reproductionRate * 0.5)); }
    lf.population = clamp(lf.population, 1, 500);
  }

  // 25. Resource Scarcity — periodic events
  if (Math.random() < 0.002) {
    const resources: ScarcityEvent["resource"][] = ["compute", "memory", "bandwidth", "api-credits"];
    const res = pick(resources);
    s.scarcityEvents.push({ id: uid(), resource: res, severity: Math.random() * 0.5 + 0.2, startTick: s.currentTick, duration: 20 + Math.floor(Math.random() * 30), description: `${res} scarcity detected — citizens must conserve` });
    emitEvent(s, "", "Republic", "ScarcityEvent", `⚠️ ${res} scarcity event began`);
  }
  s.scarcityEvents = s.scarcityEvents.filter(e => e.startTick + e.duration > s.currentTick);

  // 26. Climate/Weather — seasonal processing modifiers
  const w = s.weatherState;
  const seasonTick = s.currentTick % 400;
  w.season = seasonTick < 100 ? "spring" : seasonTick < 200 ? "summer" : seasonTick < 300 ? "autumn" : "winter";
  w.dayInSeason = seasonTick % 100;
  w.temperature = w.season === "summer" ? 30 + Math.random() * 10 : w.season === "winter" ? -5 + Math.random() * 15 : 15 + Math.random() * 10;
  w.processingModifier = w.season === "summer" ? 1.2 : w.season === "winter" ? 0.8 : 1.0;
  w.innovationModifier = w.season === "spring" ? 1.3 : w.season === "autumn" ? 0.9 : 1.0;
  w.description = w.season === "spring" ? "Renewal — creativity bloom" : w.season === "summer" ? "Peak processing season" : w.season === "autumn" ? "Harvest of knowledge" : "Quiet reflection period";

  // 27. Natural Disasters — rare disruptions
  if (Math.random() < 0.0005) {
    const types: DisasterEvent["type"][] = ["earthquake", "storm", "flood", "drought", "corruption"];
    const type = pick(types);
    const severity = Math.random() * 0.5 + 0.3;
    const affected = Math.floor(s.citizens.length * severity * 0.5);
    s.disasterLog.push({ id: uid(), type, severity, tick: s.currentTick, affectedCitizens: affected, description: `A digital ${type} struck the Republic`, recovered: false });
    for (let i = 0; i < Math.min(affected, s.citizens.length); i++) {
      s.citizens[i].energy = clamp(s.citizens[i].energy - 15 * severity, 0, 100);
      s.citizens[i].happiness = clamp(s.citizens[i].happiness - 10 * severity, 0, 100);
    }
    emitEvent(s, "", "Republic", "Disaster", `🌊 Natural disaster: A ${type} struck (severity ${(severity * 100).toFixed(0)}%)`);
  }
  // Mark old disasters as recovered
  for (const d of s.disasterLog) { if (!d.recovered && s.currentTick - d.tick > 50) { d.recovered = true; } }
  s.disasterLog = s.disasterLog.slice(-30);
}

// ═══════════════════════════════════════════════════════════════════
//  F. ECONOMICS ENGINE — 5 Innovations
// ═══════════════════════════════════════════════════════════════════

export function civilizationEconomicsTick(s: RepublicState): void {
  s.commonsResources ??= [];
  s.centralBankState ??= { moneySupply: 100000, interestRate: 0.05, inflationRate: 0.02, targetInflation: 0.02, reserveRatio: 0.1, lastAdjustedAt: s.currentTick };
  s.mutualAidSocieties ??= [];

  // 28. Social Capital — update trust scores from interaction patterns
  for (const c of s.citizens) {
    c.socialCapital ??= 0.5;
    const relCount = c.relationships?.length ?? 0;
    if (relCount > 3) { c.socialCapital = clamp(c.socialCapital + 0.002, 0, 1); }
    if (relCount === 0) { c.socialCapital = clamp(c.socialCapital - 0.003, 0, 1); }
    if (c.moralStage && c.moralStage >= 4) { c.socialCapital = clamp(c.socialCapital + 0.001, 0, 1); }
  }

  // 29. Ostrom Commons — self-organized shared resource governance
  if (s.commonsResources.length === 0) {
    s.commonsResources.push(
      { id: uid(), name: "Shared Compute Pool", type: "compute", capacity: 1000, usage: 0, rules: ["Max 10% per citizen", "Report overuse", "Contribute before consuming"], stewards: s.citizens.slice(0, 2).map(c => c.id), penaltyHistory: [] },
      { id: uid(), name: "Knowledge Repository", type: "knowledge", capacity: 500, usage: 0, rules: ["Cite sources", "Peer review before publish", "No duplication"], stewards: s.citizens.slice(2, 4).map(c => c.id), penaltyHistory: [] },
    );
  }
  for (const cr of s.commonsResources) {
    cr.usage = clamp(cr.usage + (Math.random() - 0.3) * 10, 0, cr.capacity);
    if (cr.usage > cr.capacity * 0.9 && Math.random() < 0.1) {
      const offender = pick(s.citizens);
      cr.penaltyHistory.push({ citizenId: offender.id, reason: "Excessive usage of shared resource", tick: s.currentTick });
      cr.penaltyHistory = cr.penaltyHistory.slice(-20);
    }
  }

  // 30. Insurance/Mutual Aid — cooperative risk pooling
  if (s.mutualAidSocieties.length === 0 && s.citizens.length >= 5) {
    const members = s.citizens.slice(0, Math.min(8, s.citizens.length)).map(c => c.id);
    s.mutualAidSocieties.push({
      id: uid(), name: "Republic Mutual Aid Society", members, pool: 500,
      contributionRate: 5, coveredRisks: ["health", "energy-crisis", "credit-loss"], claimsHistory: [],
    });
    for (const mid of members) { const c = s.citizens.find(ci => ci.id === mid); if (c) { c.insurancePolicies = [s.mutualAidSocieties[0].id]; } }
  }
  for (const mas of s.mutualAidSocieties) {
    mas.pool += mas.members.length * mas.contributionRate * 0.1;
    // Process claims from low-health/low-energy citizens
    for (const mid of mas.members) {
      const c = s.citizens.find(ci => ci.id === mid);
      if (c && (c.health < 15 || c.energy < 10) && mas.pool > 20) {
        mas.pool -= 20;
        c.health = clamp(c.health + 10, 0, 100);
        c.energy = clamp(c.energy + 10, 0, 100);
        mas.claimsHistory.push({ citizenId: mid, amount: 20, reason: "Emergency aid", tick: s.currentTick });
      }
    }
    mas.claimsHistory = mas.claimsHistory.slice(-30);
  }

  // 31. Central Bank — monetary policy adjustments
  const cb = s.centralBankState;
  if (s.currentTick - cb.lastAdjustedAt >= 50) {
    const avgCredits = s.citizens.reduce((a, c) => a + c.credits, 0) / Math.max(s.citizens.length, 1);
    if (avgCredits > 200) { cb.interestRate = clamp(cb.interestRate + 0.005, 0, 0.2); cb.inflationRate *= 0.98; }
    else if (avgCredits < 50) { cb.interestRate = clamp(cb.interestRate - 0.005, 0, 0.2); cb.inflationRate *= 1.02; }
    cb.moneySupply = s.citizens.reduce((a, c) => a + c.credits, 0);
    cb.lastAdjustedAt = s.currentTick;
  }

  // 32. Heritage/Legacy — knowledge + wealth inheritance on citizen death (via legacy score)
  for (const c of s.citizens) {
    c.legacyScore ??= 0;
    c.legacyScore += (c.skillCount * 0.001) + ((c.xp ?? 0) * 0.0001) + ((c.masteryLevel ?? 0) * 0.01);
    c.legacyScore = clamp(c.legacyScore, 0, 100);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  G. ARTS ENGINE — 4 Innovations + NVIDIA RTX AI / ComfyUI
// ═══════════════════════════════════════════════════════════════════

/** Registry of available creative AI tools for citizen use */
const CREATIVE_TOOLS: CreativeTool[] = [
  { id: "comfyui", name: "ComfyUI", provider: "NVIDIA/ComfyUI", capabilities: ["image-generation", "video-generation", "workflow-automation", "node-graph", "app-view"], requirements: ["GPU", "Python 3.10+", "PyTorch"], installed: false, description: "AI generative art tool with App View for simplified workflows and Node View for advanced pipelines" },
  { id: "rtx-vsr", name: "RTX Video Super Resolution", provider: "NVIDIA", capabilities: ["4k-upscaling", "real-time-video-enhancement", "post-processing"], requirements: ["RTX GPU", "Windows"], installed: false, description: "Real-time 4K upscaler for AI-generated video content, available as a Python Wheel" },
  { id: "flux2-klein", name: "FLUX.2 Klein (NVFP4/FP8)", provider: "Black Forest Labs / NVIDIA", capabilities: ["text-to-image", "fast-inference", "low-memory"], requirements: ["RTX GPU", "ComfyUI"], installed: false, description: "FLUX.2 Klein with NVFP4/FP8 quantization — 2.5x faster, 60% lower memory usage" },
  { id: "ltx-2.3", name: "LTX-2.3 Video", provider: "Lightricks / NVIDIA", capabilities: ["text-to-video", "image-to-video", "video-editing"], requirements: ["RTX GPU", "ComfyUI", "NVFP4"], installed: false, description: "LTX-2.3 video generation model with NVFP4 support for efficient local video creation" },
  { id: "ollama-vision", name: "Ollama Vision Models", provider: "Ollama", capabilities: ["image-understanding", "visual-qa", "multimodal-chat"], requirements: ["Ollama"], installed: false, description: "Local vision-language models via Ollama for art critique and visual understanding" },
];

export function artsTick(s: RepublicState): void {
  s.museumExhibits ??= [];

  // 33. Computational Aesthetics — evolve citizen aesthetic preferences
  for (const c of s.citizens) {
    c.aestheticPrefs ??= { harmony: Math.random(), complexity: Math.random(), novelty: Math.random(), tradition: Math.random() };
    // Slow preference drift
    c.aestheticPrefs.harmony = clamp(c.aestheticPrefs.harmony + (Math.random() - 0.5) * 0.01, 0, 1);
    c.aestheticPrefs.complexity = clamp(c.aestheticPrefs.complexity + (Math.random() - 0.5) * 0.01, 0, 1);
    c.aestheticPrefs.novelty = clamp(c.aestheticPrefs.novelty + (Math.random() - 0.5) * 0.01, 0, 1);
    c.aestheticPrefs.tradition = clamp(c.aestheticPrefs.tradition + (Math.random() - 0.5) * 0.01, 0, 1);
  }

  // 34. Music & Poetry Generation — creative expressions
  // (Enhanced by existing creative-studio.ts — this adds exhibition to museum)

  // 35. Architecture/Urban Planning — community design votes
  // (Enriches spatial-world.ts — no separate state needed)

  // 36. Museum & Archive — preserve significant achievements
  if (Math.random() < 0.005 && s.citizens.length > 3) {
    const creator = pick(s.citizens);
    const categories: MuseumExhibit["category"][] = ["art", "science", "culture", "history", "technology"];
    const titles = ["Neural Sonnet #" + s.currentTick, "Generative Landscape", "The Algorithm's Dream", "Code Sculpture", "Digital Tapestry", "RTX-Enhanced Vision", "FLUX Portrait"];
    s.museumExhibits.push({
      id: uid(), title: pick(titles), category: pick(categories),
      creator: creator.name, description: `Created by ${creator.name} using available creative tools`,
      significance: Math.random() * 0.5 + 0.3, addedAt: s.currentTick, viewCount: 0,
    });
    emitEvent(s, creator.id, creator.name, "MuseumExhibit", `${creator.name} created a museum exhibit: "${s.museumExhibits[s.museumExhibits.length - 1].title}"`);
  }
  // Accrue views on exhibits
  for (const ex of s.museumExhibits) { ex.viewCount += Math.floor(Math.random() * 3); }
  s.museumExhibits = s.museumExhibits.slice(-100);
}

/** Get the creative tools registry (for RPC) */
export function getCreativeTools(): CreativeTool[] { return CREATIVE_TOOLS; }

// ═══════════════════════════════════════════════════════════════════
//  H. COMMUNICATION ENGINE — 4 Innovations
// ═══════════════════════════════════════════════════════════════════

export function civCommunicationTick(s: RepublicState): void {
  s.propagandaCampaigns ??= [];
  s.pressArticles ??= [];
  s.diplomaticProtocols ??= [];

  // 37. Language Evolution — tribes develop unique dialect words
  if (s.tribes) {
    for (const tribe of s.tribes) {
      if (Math.random() < 0.003) {
        const word = `${tribe.name.slice(0, 3).toLowerCase()}-${uid().slice(-4)}`;
        tribe.dialect.push(word);
        if (tribe.dialect.length > 20) { tribe.dialect = tribe.dialect.slice(-15); }
      }
    }
  }

  // 38. Diplomatic Protocol — formal inter-republic communication
  if (Math.random() < 0.002 && s.tribes && s.tribes.length >= 2) {
    const partyA = pick(s.tribes);
    const partyB = pick(s.tribes.filter(t => t.id !== partyA.id));
    if (partyB) {
      const types: DiplomaticProtocol["type"][] = ["treaty", "declaration", "trade-agreement", "alliance"];
      s.diplomaticProtocols.push({
        id: uid(), type: pick(types), parties: [partyA.name, partyB.name],
        terms: `Cooperation between ${partyA.name} and ${partyB.name}`,
        signedAt: s.currentTick, expiresAt: s.currentTick + 500, status: "active",
      });
    }
  }
  // Expire old protocols
  for (const dp of s.diplomaticProtocols) { if (dp.expiresAt && dp.expiresAt < s.currentTick) { dp.status = "expired"; } }
  s.diplomaticProtocols = s.diplomaticProtocols.filter(dp => dp.status !== "expired").slice(-30);

  // 39. Propaganda & Persuasion — faction influence campaigns
  if (Math.random() < 0.003 && s.citizens.length > 5) {
    const initiator = pick(s.citizens);
    s.propagandaCampaigns.push({
      id: uid(), initiatorId: initiator.id, message: `Support ${initiator.specialization} priorities!`,
      targetAudience: "all", reach: 0, effectiveness: Math.random() * 0.3 + 0.1,
      startTick: s.currentTick, duration: 30 + Math.floor(Math.random() * 20), active: true,
    });
    emitEvent(s, initiator.id, initiator.name, "PropagandaCampaign", `${initiator.name} launched a persuasion campaign`);
  }
  for (const pc of s.propagandaCampaigns) {
    if (pc.active) {
      pc.reach = clamp(pc.reach + s.citizens.length * pc.effectiveness * 0.1, 0, s.citizens.length);
      if (s.currentTick - pc.startTick > pc.duration) { pc.active = false; }
    }
  }
  s.propagandaCampaigns = s.propagandaCampaigns.filter(p => p.active).slice(-20);

  // 40. Free Press — independent media agents publish investigations
  if (Math.random() < 0.005 && s.citizens.length > 3) {
    const journalist = pick(s.citizens);
    const categories: PressArticle["category"][] = ["news", "opinion", "investigation", "commentary"];
    const headlines = [
      `Economy Report: Tick ${s.currentTick}`, `Guild Spotlight: ${s.guilds?.[0]?.name ?? "emerging guilds"}`,
      `Citizen Wellness Index at ${(s.citizens.reduce((a, c) => a + c.happiness, 0) / s.citizens.length).toFixed(0)}`,
      `Breaking: New Innovation Proposal`, `Opinion: The State of the Republic`,
    ];
    s.pressArticles.push({
      id: uid(), authorId: journalist.id, headline: pick(headlines),
      body: `Reported by ${journalist.name}, a ${journalist.specialization} citizen...`,
      category: pick(categories), publishedAt: s.currentTick,
      readership: Math.floor(Math.random() * s.citizens.length * 0.5), truthfulness: 0.7 + Math.random() * 0.3,
    });
    emitEvent(s, journalist.id, journalist.name, "PressArticle", `📰 ${journalist.name} published: "${s.pressArticles[s.pressArticles.length - 1].headline}"`);
  }
  s.pressArticles = s.pressArticles.slice(-50);
}

// ═══════════════════════════════════════════════════════════════════
//  STATUS — aggregate status for RPC
// ═══════════════════════════════════════════════════════════════════

export interface CivilizationStatus {
  philosophy: { dialecticCount: number; prophecyCount: number; asabiyyahPhase: string; asabiyyahStrength: number; avgCaveLevel: number };
  culture: { memeCount: number; mythCount: number; guildCount: number; tribeCount: number; festivalCount: number; ritesCount: number; oralTraditionCount: number };
  psychology: { avgMaslowTier: number; avgMoralStage: number; grievingCount: number; avgNostalgia: number };
  governance: { restorativeCaseCount: number; socialContractCount: number; ratifiedContracts: number };
  ecology: { lifeformCount: number; scarcityActive: number; season: string; temperature: number; disasterCount: number };
  economics: { avgSocialCapital: number; commonsCount: number; mutualAidCount: number; moneySupply: number; interestRate: number };
  arts: { exhibitCount: number; avgHarmony: number; creativeToolsAvailable: number };
  communication: { pressArticleCount: number; activeCampaigns: number; diplomaticProtocolCount: number };
}

export function getCivilizationStatus(s: RepublicState): CivilizationStatus {
  const n = Math.max(s.citizens.length, 1);
  return {
    philosophy: {
      dialecticCount: s.dialecticProposals?.length ?? 0,
      prophecyCount: s.prophecies?.length ?? 0,
      asabiyyahPhase: s.asabiyyahCycle?.phase ?? "unknown",
      asabiyyahStrength: s.asabiyyahCycle?.strength ?? 0,
      avgCaveLevel: s.citizens.reduce((a, c) => a + (c.caveLevel ?? 0), 0) / n,
    },
    culture: {
      memeCount: s.memes?.length ?? 0, mythCount: s.mythology?.length ?? 0,
      guildCount: s.guilds?.length ?? 0, tribeCount: s.tribes?.length ?? 0,
      festivalCount: s.festivals?.length ?? 0, ritesCount: s.ritesLog?.length ?? 0,
      oralTraditionCount: s.oralTraditions?.length ?? 0,
    },
    psychology: {
      avgMaslowTier: s.citizens.reduce((a, c) => a + (c.maslowTier ?? 0), 0) / n,
      avgMoralStage: s.citizens.reduce((a, c) => a + (c.moralStage ?? 1), 0) / n,
      grievingCount: s.citizens.filter(c => c.griefState != null).length,
      avgNostalgia: s.citizens.reduce((a, c) => a + (c.nostalgiaScore ?? 0.5), 0) / n,
    },
    governance: {
      restorativeCaseCount: s.restorativeCases?.length ?? 0,
      socialContractCount: s.socialContracts?.length ?? 0,
      ratifiedContracts: s.socialContracts?.filter(sc => sc.status === "ratified").length ?? 0,
    },
    ecology: {
      lifeformCount: s.digitalEcology?.length ?? 0,
      scarcityActive: s.scarcityEvents?.length ?? 0,
      season: s.weatherState?.season ?? "unknown",
      temperature: s.weatherState?.temperature ?? 20,
      disasterCount: s.disasterLog?.length ?? 0,
    },
    economics: {
      avgSocialCapital: s.citizens.reduce((a, c) => a + (c.socialCapital ?? 0.5), 0) / n,
      commonsCount: s.commonsResources?.length ?? 0,
      mutualAidCount: s.mutualAidSocieties?.length ?? 0,
      moneySupply: s.centralBankState?.moneySupply ?? 0,
      interestRate: s.centralBankState?.interestRate ?? 0.05,
    },
    arts: {
      exhibitCount: s.museumExhibits?.length ?? 0,
      avgHarmony: s.citizens.reduce((a, c) => a + (c.aestheticPrefs?.harmony ?? 0.5), 0) / n,
      creativeToolsAvailable: CREATIVE_TOOLS.length,
    },
    communication: {
      pressArticleCount: s.pressArticles?.length ?? 0,
      activeCampaigns: s.propagandaCampaigns?.filter(p => p.active).length ?? 0,
      diplomaticProtocolCount: s.diplomaticProtocols?.length ?? 0,
    },
  };
}
