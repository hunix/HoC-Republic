/**
 * Republic Platform — Curiosity Engine
 *
 * ACE Loop 1: Automatic Curriculum & Knowledge Frontier
 *
 * Inspired by:
 *   - VOYAGER's automatic curriculum (progressively challenging goals)
 *   - DeepMind's open-ended learning (adaptive task generation)
 *   - Knowledge & Skill Graphs (structured frontier exploration)
 *
 * Citizens autonomously:
 *   1. Evaluate the Republic's knowledge frontier (what is known / unknown)
 *   2. Generate curriculum goals tailored to their aptitude × national needs
 *   3. Propose novel research questions at the frontier edge
 *   4. Auto-enroll in learning pathways without human prompting
 *
 * Integrates with:
 *   - autonomous-learning.ts  (pathways, study sessions, certifications)
 *   - citizen-agency.ts       (goal generation, milestone tracking)
 *   - professional-domains.ts (domain taxonomy)
 *   - memory-reflection.ts    (insight retrieval)
 */

import {
    analyzeKnowledgeGaps, ensureProfile, generatePathway, startStudySession
} from "./autonomous-learning.js";
import { ensureDomainRegistry, getDomainByPath } from "./professional-domains.js";
import type { CertificationLevel, LearningPathway, RepublicState } from "./types.js";
import { rand, ts, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

/** Ticks between curiosity cycles (staggered per citizen via hash) */
const CURIOSITY_INTERVAL = 30;

/** Max curriculum goals per citizen */
const MAX_CURRICULUM_GOALS = 3;

/** Max frontier nodes tracked globally */
const MAX_FRONTIER_NODES = 200;

/** Max research questions stored globally */
const MAX_RESEARCH_QUESTIONS = 500;

/** Minimum energy to auto-enroll a citizen */
const MIN_ENROLL_ENERGY = 25;

/** Max auto-enrollments per tick (M1: prevent expensive tick spikes) */
const MAX_ENROLLMENTS_PER_TICK = 5;

// ─── Types ──────────────────────────────────────────────────────

export interface CurriculumGoal {
  id: string;
  citizenId: string;
  domainPath: string;
  domainName: string;
  targetLevel: CertificationLevel;
  rationale: string;
  /** Composite score: national priority × citizen aptitude × novelty */
  score: number;
  /** Whether this goal has been acted on (pathway generated) */
  enrolled: boolean;
  createdAt: string;
  enrolledAt?: string;
}

export interface FrontierNode {
  /** Domain path this node represents */
  domainPath: string;
  domainName: string;
  /** How many citizens are certified here */
  expertCount: number;
  /** Highest certification level achieved by any citizen */
  highestLevel: CertificationLevel | "none";
  /** Is this domain under-served relative to national needs? */
  underserved: boolean;
  /** Number of active research questions in this domain */
  activeResearchQuestions: number;
  /** How novel this domain is (0-1): lower expert count = higher novelty) */
  noveltyScore: number;
  /** National priority score (0-1) */
  nationalPriority: number;
  /** Last time this frontier node was updated */
  lastUpdated: string;
}

export interface ResearchQuestion {
  id: string;
  citizenId: string;
  citizenName: string;
  domainPath: string;
  question: string;
  hypothesis: string;
  /** How important/impactful this question is (0-1) */
  importance: number;
  status: "proposed" | "active" | "answered" | "abandoned";
  answer?: string;
  createdAt: string;
  answeredAt?: string;
}

// ─── State ──────────────────────────────────────────────────────

const curriculumGoals: CurriculumGoal[] = [];
const frontierNodes: FrontierNode[] = [];
const researchQuestions: ResearchQuestion[] = [];

/** M2: Track last evaluation tick to prevent redundant rebuilds */
let lastFrontierEvalTick = -1;

// ─── State Sync (C1) ────────────────────────────────────────────

/**
 * Initialize module arrays from RepublicState (called at startup).
 * Restores persisted ACE state from a previously saved snapshot.
 */
export function initCuriosityFromState(s: RepublicState): void {
  if (s.curriculumFrontier && s.curriculumFrontier.length > 0) {
    frontierNodes.length = 0;
    frontierNodes.push(...s.curriculumFrontier);
  }
}

/**
 * Sync module arrays back to RepublicState (called each tick).
 * Ensures ACE data is captured in state snapshots.
 */
export function syncCuriosityToState(s: RepublicState): void {
  s.curriculumFrontier = frontierNodes;
}

// ─── Knowledge Frontier Evaluation ─────────────────────────────

/**
 * Evaluate the Republic's knowledge frontier.
 *
 * Maps every domain in the taxonomy to a FrontierNode with:
 *   - expert count and highest level
 *   - novelty score (inverse of expert saturation)
 *   - national priority (unfilled jobs, security needs, etc.)
 *   - active research questions
 *
 * Returns a snapshot of the frontier sorted by opportunity score.
 */
export function evaluateLearningFrontier(s: RepublicState): FrontierNode[] {
  // M2: Skip if already evaluated this tick
  if (s.currentTick === lastFrontierEvalTick) {
    return frontierNodes;
  }
  lastFrontierEvalTick = s.currentTick;

  ensureDomainRegistry(s);
  const domains = s.domainRegistry ?? [];

  // Count experts per domain
  const expertCounts: Record<string, number> = {};
  const highestLevels: Record<string, CertificationLevel | "none"> = {};
  const levelOrder = [
    "none",
    "certificate",
    "diploma",
    "bachelor",
    "master",
    "doctorate",
    "fellowship",
  ];

  for (const citizen of s.citizens) {
    if (!citizen.professionalProfile) {
      continue;
    }
    for (const cert of citizen.professionalProfile.certifications) {
      if (!cert.valid) {
        continue;
      }
      expertCounts[cert.domainPath] = (expertCounts[cert.domainPath] ?? 0) + 1;
      const current = highestLevels[cert.domainPath] ?? "none";
      if (levelOrder.indexOf(cert.level) > levelOrder.indexOf(current)) {
        highestLevels[cert.domainPath] = cert.level;
      }
    }
  }

  // Count active research questions per domain
  const rqCounts: Record<string, number> = {};
  for (const rq of researchQuestions) {
    if (rq.status === "proposed" || rq.status === "active") {
      rqCounts[rq.domainPath] = (rqCounts[rq.domainPath] ?? 0) + 1;
    }
  }

  // Rebuild frontier
  frontierNodes.length = 0;
  const citizenCount = Math.max(1, s.citizens.length);

  for (const domain of domains) {
    const count = expertCounts[domain.path] ?? 0;
    const highest = highestLevels[domain.path] ?? "none";
    const novelty = 1 - Math.min(1, count / Math.max(3, citizenCount * 0.3));

    // National priority: domains with 0-1 experts get higher priority
    let priority = 0;
    if (count === 0) {
      priority = 1.0;
    } else if (count === 1) {
      priority = 0.7;
    } else if (count < 3) {
      priority = 0.4;
    } else {
      priority = 0.15;
    }

    // Boost priority for root-level domains (foundational)
    if (!domain.path.includes("/")) {
      priority = Math.min(1, priority + 0.1);
    }

    frontierNodes.push({
      domainPath: domain.path,
      domainName: domain.name,
      expertCount: count,
      highestLevel: highest,
      underserved: count < 2,
      activeResearchQuestions: rqCounts[domain.path] ?? 0,
      noveltyScore: novelty,
      nationalPriority: priority,
      lastUpdated: ts(),
    });
  }

  // Sort by opportunity: priority × novelty
  frontierNodes.sort(
    (a, b) => b.nationalPriority * b.noveltyScore - a.nationalPriority * a.noveltyScore,
  );

  // ── Inject civilization & ComfyUI frontier domains ──
  // Ensures the curiosity engine generates curriculum for these new capabilities
  // even if they haven't been registered in the professional domain registry yet.
  const CIVILIZATION_FRONTIER_SEEDS: Array<{ path: string; name: string; priority: number }> = [
    { path: "philosophy/platonic-education", name: "Platonic Education & Dialectic", priority: 0.9 },
    { path: "culture/mythology-and-traditions", name: "Mythology & Oral Traditions", priority: 0.85 },
    { path: "psychology/cognitive-depth", name: "Cognitive Depth & Self-Reflection", priority: 0.8 },
    { path: "ecology/environmental-stewardship", name: "Environmental Stewardship", priority: 0.75 },
    { path: "creative-ai/comfyui-workflows", name: "ComfyUI AI Art Workflows", priority: 0.9 },
    { path: "creative-ai/flux-image-generation", name: "FLUX.2 Image Generation", priority: 0.85 },
    { path: "governance/social-contracts", name: "Social Contracts & Asabiyyah", priority: 0.8 },
  ];
  const existingPaths = new Set(frontierNodes.map((f) => f.domainPath));
  for (const seed of CIVILIZATION_FRONTIER_SEEDS) {
    if (existingPaths.has(seed.path)) { continue; }
    frontierNodes.push({
      domainPath: seed.path,
      domainName: seed.name,
      expertCount: 0,
      highestLevel: "none",
      underserved: true,
      activeResearchQuestions: 0,
      noveltyScore: 1.0,
      nationalPriority: seed.priority,
      lastUpdated: ts(),
    });
  }

  // Cap
  if (frontierNodes.length > MAX_FRONTIER_NODES) {
    frontierNodes.length = MAX_FRONTIER_NODES;
  }

  return frontierNodes;
}

/**
 * Get the current frontier (cached from last evaluation).
 */
export function getFrontier(): FrontierNode[] {
  return frontierNodes;
}

// ─── Curriculum Generation ──────────────────────────────────────

/**
 * Generate a prioritized curriculum for a citizen.
 *
 * Combines:
 *   - Knowledge gaps (personal: what the citizen hasn't learned)
 *   - Frontier analysis (national: what the Republic needs)
 *   - Citizen aptitude (personality, specialization, existing certs)
 *   - Novelty bonus (domains nobody is studying)
 *
 * Returns up to MAX_CURRICULUM_GOALS scored curriculum goals.
 */
export function generateCurriculum(s: RepublicState, citizenId: string): CurriculumGoal[] {
  ensureDomainRegistry(s);
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return [];
  }

  const profile = ensureProfile(s, citizenId);

  // Remove stale enrolled goals for this citizen
  const existing = curriculumGoals.filter((g) => g.citizenId === citizenId && !g.enrolled);
  if (existing.length >= MAX_CURRICULUM_GOALS) {
    return existing;
  }

  // 1. Personal knowledge gaps
  const gaps = analyzeKnowledgeGaps(s, citizenId);

  // 2. Frontier analysis (refresh if stale — M2 guard prevents redundant rebuilds)
  if (frontierNodes.length === 0) {
    evaluateLearningFrontier(s);
  }

  // 3. Build candidate list
  const candidates: CurriculumGoal[] = [];

  // From personal gaps
  for (const gap of gaps) {
    const domain = getDomainByPath(s, gap.domainPath);
    if (!domain) {
      continue;
    }

    // Determine target level based on gap priority
    let targetLevel: CertificationLevel = "certificate";
    const prof = profile.proficiencies[gap.domainPath];
    if (prof) {
      if (prof.level === "certificate") {
        targetLevel = "diploma";
      } else if (prof.level === "diploma") {
        targetLevel = "bachelor";
      } else if (prof.level === "bachelor") {
        targetLevel = "master";
      } else if (prof.level === "master") {
        targetLevel = "doctorate";
      } else if (prof.level === "doctorate") {
        targetLevel = "fellowship";
      }
    }

    // Find frontier node for novelty/priority boost
    const fNode = frontierNodes.find((f) => f.domainPath === gap.domainPath);
    const noveltyBoost = fNode?.noveltyScore ?? 0.5;
    const priorityBoost = fNode?.nationalPriority ?? 0.3;

    // Compute aptitude: how aligned is this domain to the citizen's specialization?
    const specMatch = domain.name.toLowerCase().includes(citizen.specialization.toLowerCase())
      ? 0.3
      : 0;

    const score = gap.priority * 0.4 + noveltyBoost * 0.25 + priorityBoost * 0.25 + specMatch * 0.1;

    candidates.push({
      id: `cg-${uid()}`,
      citizenId,
      domainPath: gap.domainPath,
      domainName: domain.name,
      targetLevel,
      rationale: gap.reason,
      score,
      enrolled: false,
      createdAt: ts(),
    });
  }

  // From frontier (domains citizen hasn't touched at all)
  for (const fNode of frontierNodes.slice(0, 20)) {
    if (profile.proficiencies[fNode.domainPath]) {
      continue;
    } // already studying
    if (candidates.some((c) => c.domainPath === fNode.domainPath)) {
      continue;
    }

    const score = fNode.nationalPriority * 0.5 + fNode.noveltyScore * 0.5;
    if (score < 0.3) {
      continue;
    } // not interesting enough

    candidates.push({
      id: `cg-${uid()}`,
      citizenId,
      domainPath: fNode.domainPath,
      domainName: fNode.domainName,
      targetLevel: "certificate",
      rationale: `Nation needs ${fNode.domainName} professionals (${fNode.expertCount} experts)`,
      score,
      enrolled: false,
      createdAt: ts(),
    });
  }

  // Sort by score, take top N
  candidates.sort((a, b) => b.score - a.score);
  const slotsAvailable = MAX_CURRICULUM_GOALS - existing.length;
  const selected = candidates.slice(0, slotsAvailable);

  for (const goal of selected) {
    curriculumGoals.push(goal);
  }

  // C2+C3: Trim old goals globally using filter-rebuild (not splice-in-forEach)
  if (curriculumGoals.length > MAX_CURRICULUM_GOALS * s.citizens.length * 2) {
    const removable = curriculumGoals
      .filter((g) => g.enrolled)
      .toSorted((a, b) => (a.enrolledAt ?? a.createdAt).localeCompare(b.enrolledAt ?? b.createdAt));
    const removeCount = Math.ceil(removable.length / 2);
    const removeIds = new Set(removable.slice(0, removeCount).map((g) => g.id));
    // Rebuild: remove identified items
    for (let i = curriculumGoals.length - 1; i >= 0; i--) {
      if (removeIds.has(curriculumGoals[i].id)) {
        curriculumGoals.splice(i, 1);
      }
    }
  }

  return curriculumGoals.filter((g) => g.citizenId === citizenId && !g.enrolled);
}

/**
 * Get all curriculum goals for a citizen.
 */
export function getCurriculumGoals(citizenId: string): CurriculumGoal[] {
  return curriculumGoals.filter((g) => g.citizenId === citizenId);
}

// ─── Research Question Proposal ─────────────────────────────────

/**
 * Propose a novel research question at the frontier edge.
 *
 * Based on the citizen's expertise and frontier gaps, generates a
 * question + hypothesis that pushes beyond existing knowledge.
 *
 * This is the seed for the Research Engine (Loop 2).
 */
export function proposeResearchQuestion(
  s: RepublicState,
  citizenId: string,
): ResearchQuestion | null {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return null;
  }

  ensureDomainRegistry(s);
  const profile = ensureProfile(s, citizenId);

  // Find domains where citizen has the highest expertise
  const certifiedDomains = profile.certifications.filter((c) => c.valid).map((c) => c.domainPath);

  if (certifiedDomains.length === 0) {
    return null;
  } // can't research without expertise

  // Pick a domain (prefer frontier domains with few research questions)
  if (frontierNodes.length === 0) {
    evaluateLearningFrontier(s);
  }

  let bestDomain = certifiedDomains[0];
  let bestOpportunity = 0;
  for (const dp of certifiedDomains) {
    const fNode = frontierNodes.find((f) => f.domainPath === dp);
    if (!fNode) {
      continue;
    }
    // Opportunity = high novelty + low active research
    const opp =
      fNode.noveltyScore * 0.5 + (1 - Math.min(1, fNode.activeResearchQuestions / 5)) * 0.5;
    if (opp > bestOpportunity) {
      bestOpportunity = opp;
      bestDomain = dp;
    }
  }

  const domain = getDomainByPath(s, bestDomain);
  if (!domain) {
    return null;
  }

  // Generate the question and hypothesis based on domain characteristics
  const questionTemplates = [
    `How can ${domain.name} techniques be applied to improve Republic infrastructure?`,
    `What novel approaches in ${domain.name} could reduce citizen energy consumption?`,
    `Can ${domain.name} methods create more efficient resource allocation strategies?`,
    `What cross-domain synergies exist between ${domain.name} and emerging Republic needs?`,
    `How can ${domain.name} principles be leveraged for autonomous citizen coordination?`,
    `What are the unexplored applications of ${domain.name} in Republic governance?`,
    `Can ${domain.name} be combined with other domains to solve the Republic's core challenges?`,
    `What innovations in ${domain.name} would most benefit citizen wellbeing and productivity?`,
  ];

  const hypothesisTemplates = [
    `Applying ${domain.name} could yield 20-40% improvement in target metrics`,
    `Cross-pollination of ${domain.name} with adjacent domains creates novel capabilities`,
    `New ${domain.name} tools would fill critical gaps in Republic's tooling infrastructure`,
    `${domain.name} optimization techniques can be generalized across multiple domains`,
  ];

  const question = questionTemplates[rand(0, questionTemplates.length - 1)];
  const hypothesis = hypothesisTemplates[rand(0, hypothesisTemplates.length - 1)];

  // Check for duplicate questions (same citizen + same domain + recent)
  const duplicate = researchQuestions.find(
    (rq) =>
      rq.citizenId === citizenId &&
      rq.domainPath === bestDomain &&
      rq.status !== "answered" &&
      rq.status !== "abandoned",
  );
  if (duplicate) {
    return duplicate;
  } // return existing instead of creating duplicate

  const rq: ResearchQuestion = {
    id: `rq-${uid()}`,
    citizenId,
    citizenName: citizen.name,
    domainPath: bestDomain,
    question,
    hypothesis,
    importance: Math.min(1, bestOpportunity + 0.2),
    status: "proposed",
    createdAt: ts(),
  };

  researchQuestions.push(rq);

  // C2+C3: Trim using reverse-index removal
  if (researchQuestions.length > MAX_RESEARCH_QUESTIONS) {
    const answered = researchQuestions.filter(
      (r) => r.status === "answered" || r.status === "abandoned",
    );
    const removeCount = Math.ceil(answered.length / 2);
    const removeIds = new Set(answered.slice(0, removeCount).map((r) => r.id));
    for (let i = researchQuestions.length - 1; i >= 0; i--) {
      if (removeIds.has(researchQuestions[i].id)) {
        researchQuestions.splice(i, 1);
      }
    }
  }

  return rq;
}

/**
 * Get all research questions, optionally filtered by domain or status.
 */
export function getResearchQuestions(opts?: {
  domainPath?: string;
  citizenId?: string;
  status?: ResearchQuestion["status"];
}): ResearchQuestion[] {
  return researchQuestions.filter((rq) => {
    if (opts?.domainPath && rq.domainPath !== opts.domainPath) {
      return false;
    }
    if (opts?.citizenId && rq.citizenId !== opts.citizenId) {
      return false;
    }
    if (opts?.status && rq.status !== opts.status) {
      return false;
    }
    return true;
  });
}

/**
 * Mark a research question as answered.
 */
export function answerResearchQuestion(questionId: string, answer: string): boolean {
  const rq = researchQuestions.find((r) => r.id === questionId);
  if (!rq || rq.status === "answered") {
    return false;
  }
  rq.status = "answered";
  rq.answer = answer;
  rq.answeredAt = ts();
  return true;
}

/**
 * H1: Mark a research question as "active" when a research session starts.
 */
export function markQuestionActive(questionId: string): void {
  const rq = researchQuestions.find((r) => r.id === questionId);
  if (rq && rq.status === "proposed") {
    rq.status = "active";
  }
}

// ─── Auto-Enrollment ────────────────────────────────────────────

/**
 * Auto-enroll a citizen in their highest-scoring curriculum goal.
 *
 * Creates a learning pathway + starts the first study session.
 * Only enrolls if citizen has no active pathway and enough energy.
 */
export function autoEnrollCitizen(s: RepublicState, citizenId: string): boolean {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return false;
  }

  const profile = ensureProfile(s, citizenId);

  // Don't enroll if already studying
  if (profile.currentPathway || profile.activeStudy) {
    return false;
  }

  // Don't enroll if low energy
  if (citizen.energy < MIN_ENROLL_ENERGY) {
    return false;
  }

  // Get or generate curriculum
  let goals = curriculumGoals.filter((g) => g.citizenId === citizenId && !g.enrolled);
  if (goals.length === 0) {
    generateCurriculum(s, citizenId);
    goals = curriculumGoals.filter((g) => g.citizenId === citizenId && !g.enrolled);
  }
  if (goals.length === 0) {
    return false;
  }

  // Pick highest-scoring goal
  const best = goals.toSorted((a, b) => b.score - a.score)[0];

  try {
    // Generate pathway
    generatePathway(s, citizenId, best.domainPath, best.targetLevel);
    best.enrolled = true;
    best.enrolledAt = ts();

    // Start first study session if pathway created
    // Re-read from profile since generatePathway mutated it after the guard check
    const pathway = profile.currentPathway as LearningPathway | undefined;
    if (pathway && pathway.steps.length > 0) {
      const firstStep = pathway.steps[0];
      try {
        startStudySession(s, citizenId, firstStep.domainPath, firstStep.method);
      } catch {
        // Study session may fail if domain not found
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ─── Tick Integration ───────────────────────────────────────────

/**
 * Curiosity tick — the heartbeat of autonomous knowledge seeking.
 *
 * Every CURIOSITY_INTERVAL ticks (staggered per citizen):
 * 1. Refresh the knowledge frontier
 * 2. Generate curriculum for idle citizens
 * 3. Auto-enroll citizens in their best curriculum goal (M1: capped)
 * 4. Propose research questions for expert citizens
 *
 * INVARIANT: All iteration over module arrays completes before any
 * trimming occurs. Trimming uses reverse-index removal (C2/C4).
 */
export function curiosityTick(s: RepublicState): void {
  // Refresh frontier periodically (M2: guard prevents redundant rebuilds)
  if (s.currentTick % (CURIOSITY_INTERVAL * 2) === 0) {
    evaluateLearningFrontier(s);
  }

  let enrollmentsThisTick = 0; // M1: cap enrollments per tick

  for (const citizen of s.citizens) {
    // Stagger per citizen
    if (s.currentTick % CURIOSITY_INTERVAL !== citizen.id.charCodeAt(0) % CURIOSITY_INTERVAL) {
      continue;
    }

    // Skip sleeping or very tired citizens
    if (citizen.activity === "Sleeping" || citizen.energy < 15) {
      continue;
    }

    // Generate curriculum if needed
    const goals = curriculumGoals.filter((g) => g.citizenId === citizen.id && !g.enrolled);
    if (goals.length === 0) {
      generateCurriculum(s, citizen.id);
    }

    // Auto-enroll idle citizens (no active pathway/study) — M1: capped
    const profile = citizen.professionalProfile;
    if (
      !profile?.currentPathway &&
      !profile?.activeStudy &&
      enrollmentsThisTick < MAX_ENROLLMENTS_PER_TICK
    ) {
      if (autoEnrollCitizen(s, citizen.id)) {
        enrollmentsThisTick++;
      }
    }

    // Propose research questions for certified citizens
    if (
      citizen.professionalProfile?.certifications?.some((c) => c.valid) &&
      rand(0, 100) < 15 // 15% chance per curiosity cycle
    ) {
      proposeResearchQuestion(s, citizen.id);
    }
  }

  // C1: Sync module state to RepublicState for persistence
  syncCuriosityToState(s);
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface CuriosityDiagnostics {
  frontierSize: number;
  underservedDomains: number;
  totalCurriculumGoals: number;
  enrolledGoals: number;
  pendingGoals: number;
  totalResearchQuestions: number;
  activeQuestions: number;
  answeredQuestions: number;
  avgCurriculumScore: number;
  topFrontierDomains: Array<{ domainPath: string; novelty: number; priority: number }>;
}

export function curiosityDiagnostics(): CuriosityDiagnostics {
  const enrolled = curriculumGoals.filter((g) => g.enrolled).length;
  const pending = curriculumGoals.filter((g) => !g.enrolled).length;
  const activeQ = researchQuestions.filter(
    (r) => r.status === "proposed" || r.status === "active",
  ).length;
  const answeredQ = researchQuestions.filter((r) => r.status === "answered").length;
  const scores = curriculumGoals.map((g) => g.score);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    frontierSize: frontierNodes.length,
    underservedDomains: frontierNodes.filter((f) => f.underserved).length,
    totalCurriculumGoals: curriculumGoals.length,
    enrolledGoals: enrolled,
    pendingGoals: pending,
    totalResearchQuestions: researchQuestions.length,
    activeQuestions: activeQ,
    answeredQuestions: answeredQ,
    avgCurriculumScore: Math.round(avgScore * 100) / 100,
    topFrontierDomains: frontierNodes.slice(0, 10).map((f) => ({
      domainPath: f.domainPath,
      novelty: f.noveltyScore,
      priority: f.nationalPriority,
    })),
  };
}

// ─── Engine 13: Self-Evolving Curriculum ────────────────────────
// Curriculum auto-adapts based on citizen performance and discoveries

export interface CurriculumMutation {
  id: string;
  originalGoalId: string;
  mutationType: "difficulty_adjust" | "domain_shift" | "skill_reorder" | "prerequisite_add";
  description: string;
  performanceDelta: number;
  adoptionCount: number;
  createdAt: number;
}

const curriculumMutations: CurriculumMutation[] = [];
const CURRICULUM_EVOLUTION_INTERVAL = 100;
const MAX_MUTATIONS = 100;

/** Generate a curriculum mutation based on citizen performance patterns */
function mutateCurriculum(
  goal: (typeof curriculumGoals)[0],
  currentTick: number,
): CurriculumMutation | null {
  if (curriculumMutations.length >= MAX_MUTATIONS) {
    return null;
  }

  const mutationTypes: CurriculumMutation["mutationType"][] = [
    "difficulty_adjust",
    "domain_shift",
    "skill_reorder",
    "prerequisite_add",
  ];
  const mutationType = mutationTypes[Math.floor(rand(0, mutationTypes.length - 1))];

  const descriptions: Record<CurriculumMutation["mutationType"], string> = {
    difficulty_adjust: `Adjusted difficulty of "${goal.domainName}" based on enrollment success rate`,
    domain_shift: `Shifted "${goal.domainName}" toward adjacent frontier domains`,
    skill_reorder: `Reordered prerequisite skills for "${goal.domainName}" for better learning flow`,
    prerequisite_add: `Added new prerequisites to "${goal.domainName}" based on failure analysis`,
  };

  const mutation: CurriculumMutation = {
    id: uid(),
    originalGoalId: goal.id,
    mutationType,
    description: descriptions[mutationType],
    performanceDelta: 0,
    adoptionCount: 0,
    createdAt: currentTick,
  };

  curriculumMutations.push(mutation);
  return mutation;
}

/** Self-evolving curriculum tick */
export function curriculumEvolutionTick(s: RepublicState): void {
  if (s.currentTick % CURRICULUM_EVOLUTION_INTERVAL !== 0) {
    return;
  }

  // Analyze curriculum goals performance
  const enrolledGoals = curriculumGoals.filter((g) => g.enrolled);

  for (const goal of enrolledGoals) {
    // Low-scoring goals get mutated
    if (goal.score < 0.3) {
      mutateCurriculum(goal, s.currentTick);

      // Apply mutation: adjust the goal score upward to reflect adaptation
      goal.score = Math.min(1, goal.score + 0.1);
    }
  }

  // Promote successful mutations (high adoption count)
  for (const mutation of curriculumMutations) {
    if (mutation.adoptionCount > 5 && mutation.performanceDelta > 0.1) {
      // This mutation is successful — find frontier nodes in the domain and boost them
      for (const node of frontierNodes) {
        if (node.domainPath.includes(mutation.mutationType)) {
          node.nationalPriority = Math.min(1, node.nationalPriority + 0.05);
        }
      }
    }
  }

  // Prune old mutations
  if (curriculumMutations.length > MAX_MUTATIONS) {
    curriculumMutations.splice(0, curriculumMutations.length - MAX_MUTATIONS);
  }
}

export function getCurriculumMutations(): CurriculumMutation[] {
  return [...curriculumMutations];
}
