/**
 * Republic Platform — Population-Based Training (PBT)
 *
 * Implements a population-level training loop across all citizens,
 * mimicking DeepMind's Population-Based Training algorithm and
 * multi-agent co-evolutionary dynamics.
 *
 * Inspired by:
 *   - Population-Based Training (Jaderberg et al., DeepMind 2017)
 *   - MAML population adaptation (Finn et al. 2017)
 *   - Self-play & co-evolution (AlphaStar, OpenAI Five)
 *   - Social learning / observational learning (NeurIPS 2024)
 *   - Cross-specialization seeding for domain-transfer breakthroughs
 *
 * Core mechanism (runs every N ticks):
 *   1. Score all citizens on composite fitness
 *   2. Bottom 20% EXPLOIT top 20%: copy their learning hyper-params
 *   3. Top 20% EXPLORE: perturb their params to discover better strategies
 *   4. Cross-specialization: seed domain-A experts into domain-B curricula
 *   5. Diversity control: bonus for citizens with unique skill combos
 *
 * Hyperparameters evolved per citizen:
 *   - curiosityWeight:    how strongly they respond to curiosity signals
 *   - explorationRate:    exploration vs exploitation in task selection
 *   - knowledgeRetention: how quickly they absorb & retain new knowledge
 *   - collaborationBias:  tendency to teach / learn from others
 */
// oxlint-disable eslint(curly)
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";
import { ts } from "./utils.js";
import { getReplayDiagnostics } from "./experience-replay.js";
import { getCurriculumEfficiencyMetrics } from "./autonomous-curriculum-architect.js";
import { getRsiDiagnostics } from "./recursive-self-improvement.js";

const logger = createSubsystemLogger("republic:population-training");

// ─── Constants ──────────────────────────────────────────────────

const PBT_INTERVAL = 50;              // ticks between PBT cycles
const EXPLOIT_BOTTOM_FRACTION = 0.2;  // bottom 20% exploit top 20%
const EXPLORE_TOP_FRACTION = 0.2;
const EXPLORE_PERTURBATION = 0.15;    // ±15% parameter perturbation
const DIVERSITY_BONUS_WEIGHT = 0.15;  // weight of diversity in fitness
const SPECIALIZE_FRACTION = 0.1;      // 10% of citizens get cross-domain seeds
const MAX_FITNESS_HISTORY = 20;

// ─── Types ──────────────────────────────────────────────────────

export interface CitizenHyperparams {
  citizenId: string;
  /** 0-1: response strength to curiosity signals */
  curiosityWeight: number;
  /** 0-1: exploration vs exploitation fraction */
  explorationRate: number;
  /** 0-1: speed of new knowledge absorption */
  knowledgeRetention: number;
  /** 0-1: tendency to teach/collaborate */
  collaborationBias: number;
  /** Composite fitness score */
  fitnessScore: number;
  fitnessHistory: number[];
  /** Rank in population (1 = best) */
  rank: number;
  /** Unique skill fingerprint for diversity */
  skillFingerprint: string;
  lastUpdatedTick: number;
}

export interface PopulationRanking {
  ranked: Array<{ citizenId: string; citizenName: string; fitnessScore: number; rank: number }>;
  top20: string[];         // citizen IDs
  bottom20: string[];      // citizen IDs
  diversityScore: number;
  timestamp: string;
}

export interface PopulationUpdateReport {
  cycleNumber: number;
  exploitPairs: number;          // how many bottom→top transplants happened
  exploreMutations: number;      // how many top params were perturbed
  crossSpecializationSeeds: number;
  newDiversityScore: number;
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const hyperparams = new Map<string, CitizenHyperparams>();
let cycleNumber = 0;
let lastPbtTick = 0;
let latestRanking: PopulationRanking | null = null;
const updateHistory: PopulationUpdateReport[] = [];

// ─── Hyperparameter Management ──────────────────────────────────

function ensureHyperparams(citizenId: string, skills: string[] = []): CitizenHyperparams {
  if (hyperparams.has(citizenId)) return hyperparams.get(citizenId)!;

  const hp: CitizenHyperparams = {
    citizenId,
    curiosityWeight: 0.4 + Math.random() * 0.2,
    explorationRate: 0.3 + Math.random() * 0.3,
    knowledgeRetention: 0.4 + Math.random() * 0.2,
    collaborationBias: 0.3 + Math.random() * 0.2,
    fitnessScore: 0,
    fitnessHistory: [],
    rank: 0,
    skillFingerprint: computeFingerprint(skills),
    lastUpdatedTick: 0,
  };
  hyperparams.set(citizenId, hp);
  return hp;
}

function computeFingerprint(skills: string[]): string {
  // Compact bit-fingerprint of skill set for diversity measurement
  return skills.slice(0, 10).toSorted().join("|");
}

function clamp(v: number, lo = 0.05, hi = 0.95): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Fitness Function ────────────────────────────────────────────

/**
 * Composite citizen fitness score (0-100). Dimensions:
 *   - Knowledge breadth (skill count)
 *   - Knowledge depth (avg skill XP proxy via citizen XP)
 *   - Task success rate (happiness as proxy)
 *   - Economic output (credits)
 *   - Collaboration (contribution events — placeholder)
 */
function computeFitness(
  citizen: { skills: string[]; xp?: number; happiness: number; credits: number; level?: number },
): number {
  const breadth = Math.min(30, citizen.skills.length) / 30;        // 0-1
  const depth = Math.min(1000, citizen.xp ?? 0) / 1000;            // 0-1
  const wellbeing = citizen.happiness / 100;                       // 0-1
  const wealth = Math.min(500, citizen.credits) / 500;             // 0-1
  const level = Math.min(20, citizen.level ?? 0) / 20;             // 0-1

  return parseFloat(((breadth * 25 + depth * 25 + wellbeing * 20 + wealth * 15 + level * 15)).toFixed(2));
}

// ─── Diversity Measurement ───────────────────────────────────────

/**
 * Compute population diversity: fraction of unique skill fingerprints.
 * Higher diversity = more resilient, innovative population.
 */
function computeDiversity(): number {
  const fingerprints = new Set<string>();
  for (const hp of hyperparams.values()) {
    fingerprints.add(hp.skillFingerprint);
  }
  return hyperparams.size > 0 ? fingerprints.size / hyperparams.size : 1;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Compute the current population fitness ranking.
 */
export function computePopulationFitness(s: RepublicState): PopulationRanking {
  const scores: Array<{ citizenId: string; citizenName: string; fitnessScore: number }> = [];

  for (const citizen of s.citizens) {
    const hp = ensureHyperparams(citizen.id, citizen.skills);
    const raw = computeFitness(citizen);

    // Diversity bonus: citizens with unique skill sets get a small bonus
    const uniquePeers = Array.from(hyperparams.values()).filter(
      h => h.skillFingerprint !== hp.skillFingerprint,
    ).length;
    const diversityBonus = (uniquePeers / Math.max(1, hyperparams.size)) * DIVERSITY_BONUS_WEIGHT * 10;

    hp.fitnessScore = raw + diversityBonus;
    hp.fitnessHistory.push(hp.fitnessScore);
    if (hp.fitnessHistory.length > MAX_FITNESS_HISTORY) hp.fitnessHistory.shift();
    hp.skillFingerprint = computeFingerprint(citizen.skills);

    scores.push({ citizenId: citizen.id, citizenName: citizen.name, fitnessScore: hp.fitnessScore });
  }

  const ranked = scores.toSorted((a, b) => b.fitnessScore - a.fitnessScore).map((r, i) => ({ ...r, rank: i + 1 }));

  // Update ranks in hyperparams
  for (const r of ranked) {
    const hp = hyperparams.get(r.citizenId);
    if (hp) hp.rank = r.rank;
  }

  const n = ranked.length;
  const top20Count = Math.max(1, Math.ceil(n * EXPLORE_TOP_FRACTION));
  const bottom20Count = Math.max(1, Math.ceil(n * EXPLOIT_BOTTOM_FRACTION));

  const ranking: PopulationRanking = {
    ranked,
    top20: ranked.slice(0, top20Count).map(r => r.citizenId),
    bottom20: ranked.slice(-bottom20Count).map(r => r.citizenId),
    diversityScore: parseFloat(computeDiversity().toFixed(3)),
    timestamp: ts(),
  };

  latestRanking = ranking;
  return ranking;
}

/**
 * Run a full exploit/explore cycle.
 * - Bottom citizens copy hyperparams from top citizens
 * - Top citizens get random perturbation for exploration
 */
export function runExploitExplore(s: RepublicState): PopulationUpdateReport {
  const ranking = computePopulationFitness(s);
  cycleNumber++;

  let exploitPairs = 0;
  let exploreMutations = 0;

  // EXPLOIT: bottom copies top hyperparams
  for (const bottomId of ranking.bottom20) {
    // Pick a random top citizen to copy from
    const topId = ranking.top20[Math.floor(Math.random() * ranking.top20.length)];
    if (!topId) continue;
    const topHp = hyperparams.get(topId);
    const bottomHp = hyperparams.get(bottomId);
    if (!topHp || !bottomHp) continue;

    // Soft copy (blend 70% top + 30% bottom) with small perturbation
    bottomHp.curiosityWeight = clamp(topHp.curiosityWeight * 0.7 + bottomHp.curiosityWeight * 0.3 + (Math.random() - 0.5) * 0.05);
    bottomHp.explorationRate = clamp(topHp.explorationRate * 0.7 + bottomHp.explorationRate * 0.3 + (Math.random() - 0.5) * 0.05);
    bottomHp.knowledgeRetention = clamp(topHp.knowledgeRetention * 0.7 + bottomHp.knowledgeRetention * 0.3 + (Math.random() - 0.5) * 0.05);
    bottomHp.collaborationBias = clamp(topHp.collaborationBias * 0.7 + bottomHp.collaborationBias * 0.3 + (Math.random() - 0.5) * 0.05);
    bottomHp.lastUpdatedTick = s.currentTick;
    exploitPairs++;
  }

  // EXPLORE: top citizens get perturbed hyperparams
  for (const topId of ranking.top20) {
    const topHp = hyperparams.get(topId);
    if (!topHp) continue;
    const perturb = (v: number) => clamp(v * (1 + (Math.random() - 0.5) * EXPLORE_PERTURBATION * 2));
    topHp.curiosityWeight = perturb(topHp.curiosityWeight);
    topHp.explorationRate = perturb(topHp.explorationRate);
    topHp.knowledgeRetention = perturb(topHp.knowledgeRetention);
    topHp.collaborationBias = perturb(topHp.collaborationBias);
    topHp.lastUpdatedTick = s.currentTick;
    exploreMutations++;
  }

  // CROSS-SPECIALIZATION: seed random domain knowledge from specialists into generalists
  const crossSeeds = seedCrossSpecialization(s);

  const report: PopulationUpdateReport = {
    cycleNumber,
    exploitPairs,
    exploreMutations,
    crossSpecializationSeeds: crossSeeds,
    newDiversityScore: ranking.diversityScore,
    timestamp: ts(),
  };

  updateHistory.push(report);
  if (updateHistory.length > 50) updateHistory.shift();

  logger.info(`PBT cycle ${cycleNumber}: exploit=${exploitPairs} explore=${exploreMutations} diversity=${ranking.diversityScore}`);
  return report;
}

/**
 * Seed cross-domain knowledge from domain experts into other citizens.
 * This breaks specialization silos and generates emergent breakthroughs.
 */
export function seedCrossSpecialization(s: RepublicState): number {
  if (s.citizens.length < 4) return 0;
  let seeded = 0;

  const specialists = s.citizens.filter(c => c.specialization && c.specialization !== "Generalist");
  const generalists = s.citizens.filter(c => !c.specialization || c.specialization === "Generalist");
  const targets = generalists.length > 0 ? generalists : s.citizens.filter(c => {
    const hp = hyperparams.get(c.id);
    return hp && hp.rank > Math.ceil(s.citizens.length * 0.5); // bottom half
  });

  const seedCount = Math.ceil(s.citizens.length * SPECIALIZE_FRACTION);

  for (let i = 0; i < seedCount; i++) {
    const specialist = specialists[Math.floor(Math.random() * specialists.length)];
    const target = targets[Math.floor(Math.random() * targets.length)];
    if (!specialist || !target || specialist.id === target.id) continue;

    // Transfer a random skill from specialist
    const transferableSkills = specialist.skills.filter(s => !target.skills.includes(s));
    if (transferableSkills.length === 0) continue;

    const skill = transferableSkills[Math.floor(Math.random() * transferableSkills.length)];
    if (!skill) continue;
    if (!target.skills.includes(skill)) {
      target.skills.push(skill);
      target.xp = (target.xp ?? 0) + 5;
    }
    seeded++;
  }

  return seeded;
}

/**
 * Get the current population diversity score.
 */
export function getPopulationDiversityScore(): number {
  return computeDiversity();
}

/**
 * Get hyperparameters for a specific citizen.
 */
export function getCitizenHyperparams(citizenId: string): CitizenHyperparams | null {
  return hyperparams.get(citizenId) ?? null;
}

/**
 * Get population diagnostics.
 */
export function getPopulationDiagnostics() {
  const allHp = Array.from(hyperparams.values());
  const avgFitness = allHp.reduce((s, h) => s + h.fitnessScore, 0) / Math.max(1, allHp.length);
  const replayStats = getReplayDiagnostics();
  const curriculumStats = getCurriculumEfficiencyMetrics();
  const rsiStats = getRsiDiagnostics();

  return {
    totalCitizensTracked: hyperparams.size,
    cycleNumber,
    avgFitnessScore: parseFloat(avgFitness.toFixed(2)),
    diversityScore: parseFloat(computeDiversity().toFixed(3)),
    latestRanking: latestRanking ? {
      top3: latestRanking.ranked.slice(0, 3),
      bottom3: latestRanking.ranked.slice(-3),
    } : null,
    recentUpdates: updateHistory.slice(-3),
    linkedModules: {
      experienceReplay: { citizensTracked: replayStats.citizensTracked, totalSemantic: replayStats.totalSemanticFacts },
      curriculum: { plansGenerated: curriculumStats.totalPlansGenerated, avgDifficulty: curriculumStats.avgDifficulty },
      rsi: { promotedProposals: rsiStats.promotedProposals, avgImprovement: rsiStats.avgRelativeImprovement },
    },
  };
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * Population-based training tick.
 */
export function populationTrainingTick(s: RepublicState): void {
  if (s.citizens.length === 0) return;

  // Initialize hyperparams for new citizens
  for (const citizen of s.citizens) {
    ensureHyperparams(citizen.id, citizen.skills);
  }

  // Run full PBT cycle at interval
  if (s.currentTick - lastPbtTick >= PBT_INTERVAL) {
    lastPbtTick = s.currentTick;
    runExploitExplore(s);
  }
}
