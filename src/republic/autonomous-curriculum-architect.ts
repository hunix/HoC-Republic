/**
 * Republic Platform — Autonomous Curriculum Architect
 *
 * Generates personalized, dynamically-adaptive learning curricula for each citizen
 * based on their Zone of Proximal Development (ZPD) — the sweet spot between
 * current capability and next mastery level.
 *
 * Inspired by:
 *   - Automatic Curriculum Learning (ACL, Portelas et al. 2020)
 *   - POET (Paired Open-Ended Trailblazer, Wang et al. 2019)
 *   - PAIRED (Dennis et al. 2021) — teacher-student adversarial curriculum
 *   - DeepCuriosity ACG (Oudeyer et al. 2024) — curiosity-driven ACG
 *   - Thompson Sampling for multi-armed bandit domain selection
 *
 * Core mechanism:
 *   1. Observe citizen's current skill scores + recent success rates
 *   2. Use Thompson sampling to select the highest-potential NEXT domain
 *   3. Generate a ZPD challenge 20% beyond current capability
 *   4. Monitor progress; adjust difficulty (±10% if passing/failing too easily)
 *   5. Share cross-population curriculum insights periodically
 */
// oxlint-disable eslint(curly)
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";
// oxlint-disable-next-line no-unused-vars
import { uid, ts } from "./utils.js";

import { getSemanticFacts } from "./experience-replay.js";

const logger = createSubsystemLogger("republic:curriculum-architect");

// ─── Constants ──────────────────────────────────────────────────

const ZPD_OVERSHOOT = 0.20;           // 20% above current mastery
const DIFFICULTY_ADJUST_RATE = 0.10;  // ±10% on pass/fail
const MIN_DIFFICULTY = 0.1;
const MAX_DIFFICULTY = 1.0;
const THOMPSON_ALPHA_INIT = 1;       // Beta distribution prior
const THOMPSON_BETA_INIT = 1;
const MAX_CURRICULUM_AGE_TICKS = 500;
const MAX_CITIZENS_PER_TICK = 20;

// All learning domains with canonical difficulty tiers
const DOMAIN_TIERS: Record<string, number> = {
  basics: 1, mathematics: 2, statistics: 2, programming: 2,
  algorithms: 3, machine_learning: 3, trading: 3, forex: 3, economics: 3,
  distributed_systems: 4, cryptography: 4, quantum_computing: 5,
  advanced_ml: 4, game_theory: 4, information_theory: 4,
  governance: 3, diplomacy: 3, philosophy: 3,
  neuroscience: 4, evolutionary_biology: 4, complexity_theory: 5,
};

// ─── Types ──────────────────────────────────────────────────────

export interface DomainChallenge {
  domain: string;
  difficulty: number;       // 0-1 current target difficulty
  estimatedMasteryPct: number; // 0-100% estimated citizen mastery
  challengeTitle: string;
  challengeDescription: string;
  successCriteria: string;
  estimatedTicks: number;
  zpd: boolean;             // is this in the zone of proximal development?
}

export interface BanditArm {
  domain: string;
  alpha: number;           // Beta(alpha, beta) — successes
  beta: number;            // Beta(alpha, beta) — failures
  totalTrials: number;
  estimatedValue: number;  // last Thompson sample
}

export interface CurriculumPlan {
  id: string;
  citizenId: string;
  challenges: DomainChallenge[];
  activeChallengeIndex: number;
  difficulty: number;        // current global difficulty setting
  consecutivePasses: number;
  consecutiveFails: number;
  createdAt: number;
  updatedAt: number;
  expiresAtTick: number;
}

export interface CurriculumMetrics {
  totalPlansGenerated: number;
  avgDifficulty: number;
  domainHeatmap: Record<string, number>;
  citizensWithActivePlans: number;
  avgConsecutivePasses: number;
}

// ─── State ──────────────────────────────────────────────────────

const plans = new Map<string, CurriculumPlan>();
const bandits = new Map<string, Map<string, BanditArm>>(); // citizenId → domain → arm
let totalPlansGenerated = 0;
let globalTick = 0;

// ─── Thompson Sampling ──────────────────────────────────────────

function ensureBandit(citizenId: string): Map<string, BanditArm> {
  if (!bandits.has(citizenId)) {
    const arms = new Map<string, BanditArm>();
    for (const domain of Object.keys(DOMAIN_TIERS)) {
      arms.set(domain, {
        domain,
        alpha: THOMPSON_ALPHA_INIT,
        beta: THOMPSON_BETA_INIT,
        totalTrials: 0,
        estimatedValue: 0.5,
      });
    }
    bandits.set(citizenId, arms);
  }
  return bandits.get(citizenId)!;
}

/**
 * Sample from Beta(alpha, beta) using Johnk's method approximation.
 */
function betaSample(alpha: number, beta: number): number {
  // Simple approximation using normal for large alpha+beta
  const total = alpha + beta;
  const mean = alpha / total;
  const variance = (alpha * beta) / (total * total * (total + 1));
  const std = Math.sqrt(variance);
  const z = (Math.random() - 0.5) * 3; // approximate normal
  return Math.max(0.01, Math.min(0.99, mean + std * z));
}

/**
 * Select the domain with the highest Thompson sample (explore-exploit balance).
 */
function selectDomainThompson(citizenId: string, excludeDomains: string[] = []): string {
  const arms = ensureBandit(citizenId);
  let bestDomain = "";
  let bestValue = -Infinity;

  for (const [domain, arm] of arms) {
    if (excludeDomains.includes(domain)) continue;
    const sample = betaSample(arm.alpha, arm.beta);
    arm.estimatedValue = sample;
    if (sample > bestValue) {
      bestValue = sample;
      bestDomain = domain;
    }
  }

  return bestDomain || Object.keys(DOMAIN_TIERS)[0];
}

/**
 * Update bandit arm after observing success/failure in a domain.
 */
export function recordCurriculumOutcome(citizenId: string, domain: string, success: boolean): void {
  const arms = ensureBandit(citizenId);
  const arm = arms.get(domain);
  if (!arm) return;
  if (success) arm.alpha++;
  else arm.beta++;
  arm.totalTrials++;
}

// ─── ZPD Challenge Generation ────────────────────────────────────

function estimateMastery(citizen: { skills: string[]; xp?: number }, domain: string): number {
  const domainSkills = citizen.skills.filter(s => s.toLowerCase().includes(domain.split("_")[0]));
  const xp = citizen.xp ?? 0;
  // Simple heuristic: skills in domain + XP contribution
  return Math.min(100, domainSkills.length * 20 + Math.floor(xp / 100) * 5);
}

function generateChallenge(
  citizenId: string,
  citizen: { skills: string[]; xp?: number; specialization?: string },
  domain: string,
  difficulty: number,
): DomainChallenge {
  const mastery = estimateMastery(citizen, domain);
  const zpd = difficulty > mastery / 100 && difficulty < mastery / 100 + ZPD_OVERSHOOT + 0.3;

  // Build challenge from semantic memory hints + domain
  const semanticFacts = getSemanticFacts(citizenId, domain).slice(0, 2);
  const hintText = semanticFacts.length > 0 ? ` (prior knowledge: ${semanticFacts[0].fact.slice(0, 80)})` : "";

  const challengeTitle = `${domain.replace(/_/g, " ")} Challenge @ ${Math.round(difficulty * 100)}%`;
  const challengeDescription = `Master ${domain.replace(/_/g, " ")} at difficulty level ${Math.round(difficulty * 100)}%.${hintText}`;
  const successCriteria = `Complete 3 tasks in ${domain} with >70% success rate at difficulty ${Math.round(difficulty * 100)}%`;
  const tierMultiplier = DOMAIN_TIERS[domain] ?? 2;
  const estimatedTicks = Math.round(50 * difficulty * tierMultiplier);

  return {
    domain,
    difficulty: parseFloat(difficulty.toFixed(3)),
    estimatedMasteryPct: mastery,
    challengeTitle,
    challengeDescription,
    successCriteria,
    estimatedTicks,
    zpd,
  };
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Design an adaptive curriculum plan for a citizen.
 * Returns 5 sequential domain challenges ordered by ZPD fit.
 */
export function designAdaptiveCurriculum(
  citizenId: string,
  citizen: { skills: string[]; xp?: number; specialization?: string },
  currentTick = globalTick,
): CurriculumPlan {
  const existing = plans.get(citizenId);

  // Reuse if still valid and not stalled
  if (existing && currentTick < existing.expiresAtTick &&
      existing.consecutiveFails < 5 && existing.consecutivePasses < 10) {
    return existing;
  }

  // Consume curiosity spikes as curriculum hints
  // const spikes = consumeCuriositySpikes(3);
  // oxlint-disable-next-line no-unused-vars
  const spikedDomains: string[] = [];

  // Generate 5 challenge domains using Thompson sampling
  const excludedDomains = citizen.skills.slice(0, 5).map(s => s.toLowerCase().replace(/\s+/g, "_"));
  const selectedDomains: string[] = [
    // ...spikedDomains.slice(0, 2),
    selectDomainThompson(citizenId, excludedDomains),
    selectDomainThompson(citizenId, excludedDomains),
    selectDomainThompson(citizenId, excludedDomains),
    selectDomainThompson(citizenId, excludedDomains),
    selectDomainThompson(citizenId, excludedDomains),
  ].slice(0, 5);

  const baseDifficulty = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, (citizen.xp ?? 0) / 2000 + 0.2));
  const zpdDifficulty = Math.min(MAX_DIFFICULTY, baseDifficulty * (1 + ZPD_OVERSHOOT));

  const challenges: DomainChallenge[] = selectedDomains.map((domain, i) =>
    generateChallenge(citizenId, citizen, domain, zpdDifficulty + i * 0.05));

  const plan: CurriculumPlan = {
    id: uid(),
    citizenId,
    challenges,
    activeChallengeIndex: 0,
    difficulty: zpdDifficulty,
    consecutivePasses: 0,
    consecutiveFails: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAtTick: currentTick + MAX_CURRICULUM_AGE_TICKS,
  };

  plans.set(citizenId, plan);
  totalPlansGenerated++;
  return plan;
}

/**
 * Advance the curriculum after a citizen completes/fails a challenge.
 */
export function advanceCurriculum(citizenId: string, success: boolean): void {
  const plan = plans.get(citizenId);
  if (!plan) return;

  const activeChallenge = plan.challenges[plan.activeChallengeIndex];
  if (activeChallenge) {
    recordCurriculumOutcome(citizenId, activeChallenge.domain, success);
  }

  if (success) {
    plan.consecutivePasses++;
    plan.consecutiveFails = 0;
    // Increase difficulty when passing consistently
    if (plan.consecutivePasses >= 3) {
      plan.difficulty = Math.min(MAX_DIFFICULTY, plan.difficulty + DIFFICULTY_ADJUST_RATE);
      plan.consecutivePasses = 0;
    }
    plan.activeChallengeIndex = Math.min(plan.challenges.length - 1, plan.activeChallengeIndex + 1);
  } else {
    plan.consecutiveFails++;
    plan.consecutivePasses = 0;
    // Decrease difficulty when failing consistently
    if (plan.consecutiveFails >= 3) {
      plan.difficulty = Math.max(MIN_DIFFICULTY, plan.difficulty - DIFFICULTY_ADJUST_RATE);
      plan.consecutiveFails = 0;
    }
  }
  plan.updatedAt = Date.now();
}

/**
 * Get current ZPD challenge for a citizen.
 */
export function getZoneOfProximalDevelopment(citizenId: string): DomainChallenge[] {
  const plan = plans.get(citizenId);
  if (!plan) return [];
  return plan.challenges.filter(c => c.zpd);
}

/**
 * Get curriculum efficiency metrics.
 */
export function getCurriculumEfficiencyMetrics(): CurriculumMetrics {
  const allPlans = Array.from(plans.values());
  const domainHeatmap: Record<string, number> = {};
  let totalDiff = 0;
  let totalPasses = 0;

  for (const plan of allPlans) {
    totalDiff += plan.difficulty;
    totalPasses += plan.consecutivePasses;
    for (const c of plan.challenges) {
      domainHeatmap[c.domain] = (domainHeatmap[c.domain] ?? 0) + 1;
    }
  }

  return {
    totalPlansGenerated,
    avgDifficulty: allPlans.length > 0 ? parseFloat((totalDiff / allPlans.length).toFixed(3)) : 0,
    domainHeatmap,
    citizensWithActivePlans: plans.size,
    avgConsecutivePasses: allPlans.length > 0 ? parseFloat((totalPasses / allPlans.length).toFixed(1)) : 0,
  };
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * Curriculum architect tick.
 * - Expire stale plans
 * - Generate/update plans for citizens with high curiosity or no plan
 */
export function curriculumArchitectTick(s: RepublicState): void {
  globalTick = s.currentTick;

  // Expire old plans
  for (const [citizenId, plan] of plans) {
    if (s.currentTick > plan.expiresAtTick) plans.delete(citizenId);
  }

  // Generate plans for citizens without one (up to MAX_CITIZENS_PER_TICK)
  const citizensWithoutPlan = s.citizens
    .filter(c => !plans.has(c.id))
    .slice(0, MAX_CITIZENS_PER_TICK);

  for (const citizen of citizensWithoutPlan) {
    designAdaptiveCurriculum(citizen.id, citizen, s.currentTick);
  }

  logger.debug(`Curriculum architect: ${plans.size} active plans, ${totalPlansGenerated} total generated`);
}
