/**
 * Republic Platform — Curiosity Engine (Enhanced)
 *
 * Computes evidence-based curiosity scores for citizens and generates
 * prioritised exploration suggestions that guide autonomous learning.
 *
 * Score factors (weighted sum → 0–1):
 *  - Unexplored skill domains          (35%)
 *  - Knowledge gaps (skills below 0.4) (25%)
 *  - Recent failures in current domain  (20%)
 *  - Time since last discovery event   (10%)
 *  - Intelligence coefficient boost     (10%)
 */

import type { Citizen } from "../republic/types.js";
import { ErrorCategory, handleError } from "../infra/error-handler.js";
import { SKILL_TREES } from "../republic/utils.js";
import { MemorySystem } from "./memory-system.js";
import { type Hypothesis } from "./quantum-intelligence.js";



export interface ExplorationGoal {
  question: string;
  context: string;
  priority: number; // 0-1
}

export interface CuriosityScoreBreakdown {
  /** 0-1 overall curiosity score */
  score: number;
  /** Fraction of skill domains the citizen has NOT explored at all */
  unexploredDomainRatio: number;
  /** Count of skills below 0.4 proficiency */
  knowledgeGaps: number;
  /** Number of consecutive failures in last 10 actions */
  recentFailures: number;
  /** Days since citizen's last discovery/learning event */
  daysSinceDiscovery: number;
  /** Intelligence coefficient normalised to 0-1 */
  intelligenceBoost: number;
}

export interface ExplorationSuggestion {
  domain: string;
  skill: string;
  rationale: string;
  /** 0-1 priority — higher means explore this first */
  priority: number;
  /** Recommended action: enroll in a course, start a research task, etc. */
  action: "enroll_course" | "research_topic" | "practice_skill" | "collaborate";
}

// ─── Standalone score computation (no BitNet needed) ────────────

/**
 * Compute a curiosity score for a citizen without calling BitNet.
 * Fast, deterministic, suitable for every-tick use.
 */
export function computeCuriosityScore(citizen: Citizen): CuriosityScoreBreakdown {
  const allDomains = Object.keys(SKILL_TREES);
  const citizenSkillSet = new Set(citizen.skills ?? []);
  const proficiency = citizen.skillProficiency ?? {};

  // 1. Unexplored domain ratio
  const exploredDomains = allDomains.filter((domain) => {
    const domainSkills = (SKILL_TREES as Record<string, string[]>)[domain] ?? [];
    return domainSkills.some((s) => citizenSkillSet.has(s));
  });
  const unexploredDomainRatio =
    allDomains.length > 0 ? 1 - exploredDomains.length / allDomains.length : 0.5;

  // 2. Knowledge gaps — skills with low proficiency
  const knowledgeGaps = citizen.skills.filter((s) => (proficiency[s] ?? 0) < 0.4).length;
  const normalizedGaps = Math.min(1, knowledgeGaps / Math.max(1, citizen.skills.length));

  // 3. Recent failures from action history
  const recentActions = (citizen.actionHistory ?? []).slice(-10);
  const recentFailures = recentActions.filter((a) => !a.success).length;
  const failureScore = Math.min(1, recentFailures / 5);

  // 4. Days since last discovery (from lifecycle events approximation via xp)
  // We use XP delta as a proxy: low recent XP gain = more curiosity
  const xp = citizen.xp ?? 0;
  const xpPerLevel = 100;
  const xpProgress = (xp % xpPerLevel) / xpPerLevel;
  const daysSinceDiscovery = Math.max(0, 1 - xpProgress); // 0 = just learned, 1 = stagnant

  // 5. Intelligence coefficient: higher IQ → higher baseline curiosity
  const iq = citizen.intelligence ?? 100;
  const intelligenceBoost = Math.min(1, Math.max(0, (iq - 50) / 100)); // 50 IQ → 0; 150 IQ → 1

  // Weighted sum
  const score =
    unexploredDomainRatio * 0.35 +
    normalizedGaps * 0.25 +
    failureScore * 0.2 +
    daysSinceDiscovery * 0.1 +
    intelligenceBoost * 0.1;

  return {
    score: Math.min(1, Math.max(0, score)),
    unexploredDomainRatio,
    knowledgeGaps,
    recentFailures,
    daysSinceDiscovery,
    intelligenceBoost,
  };
}

/**
 * Suggest the next exploration targets for a citizen based on their
 * curiosity score breakdown. Returns up to 3 suggestions.
 */
export function suggestNextExploration(
  citizen: Citizen,
  breakdown: CuriosityScoreBreakdown,
): ExplorationSuggestion[] {
  const proficiency = citizen.skillProficiency ?? {};
  const citizenSkillSet = new Set(citizen.skills ?? []);
  const suggestions: ExplorationSuggestion[] = [];

  // Find unexplored domain with the most skills (richest learning opportunity)
  const allDomains = Object.keys(SKILL_TREES);
  const unexploredDomains = allDomains.filter((domain) => {
    const skills = (SKILL_TREES as Record<string, string[]>)[domain] ?? [];
    return !skills.some((s) => citizenSkillSet.has(s));
  });

  if (unexploredDomains.length > 0) {
    const richest = unexploredDomains.toSorted(
      (a, b) =>
        ((SKILL_TREES as Record<string, string[]>)[b]?.length ?? 0) -
        ((SKILL_TREES as Record<string, string[]>)[a]?.length ?? 0),
    )[0];
    const firstSkill = (SKILL_TREES as Record<string, string[]>)[richest]?.[0] ?? richest;
    suggestions.push({
      domain: richest,
      skill: firstSkill,
      rationale: `Citizen has never explored ${richest} — ${breakdown.unexploredDomainRatio >= 0.5 ? "high" : "medium"} exploration potential`,
      priority: breakdown.unexploredDomainRatio,
      action: "enroll_course",
    });
  }

  // Find the most under-developed known skill
  const weakest = citizen.skills
    .map((s) => ({ skill: s, prof: proficiency[s] ?? 0 }))
    .filter((x) => x.prof < 0.4)
    .toSorted((a, b) => a.prof - b.prof)[0];

  if (weakest) {
    const domain =
      Object.entries(SKILL_TREES).find(([, skills]) =>
        (skills as string[]).includes(weakest.skill),
      )?.[0] ?? "General";
    suggestions.push({
      domain,
      skill: weakest.skill,
      rationale: `${weakest.skill} proficiency is only ${(weakest.prof * 100).toFixed(0)}% — gap filling needed`,
      priority: 1 - weakest.prof,
      action: "practice_skill",
    });
  }

  // If recent failures, suggest research
  if (breakdown.recentFailures >= 2) {
    const failedDomain =
      citizen.specialization === "Developer"
        ? "Engineering"
        : citizen.specialization === "Scientist"
          ? "Science"
          : citizen.specialization === "Artist"
            ? "Arts"
            : "Research";
    suggestions.push({
      domain: failedDomain,
      skill: `${failedDomain} fundamentals`,
      rationale: `${breakdown.recentFailures} recent failures detected — deep research recommended to break the pattern`,
      priority: breakdown.recentFailures / 5,
      action: "research_topic",
    });
  }

  return suggestions.toSorted((a, b) => b.priority - a.priority).slice(0, 3);
}

// ─── Memory-enhanced exploration (async, for elite citizens) ─────

export class CuriosityEngine {
  constructor(
    private memory: MemorySystem,
  ) {}

  /**
   * Analyzes the current context and recent confident decisions to find gaps.
   * Returns a list of exploration hypotheses (uses BitNet for nuanced questions).
   */
  public async generateExplorations(
    context: string,
    _recentDecisions: unknown[] = [],
  ): Promise<Hypothesis[]> {
    const explorations: Hypothesis[] = [];

    try {
      const prompt = `
<system_2_curiosity>
Analyze the following context and identify any ambiguous terms, missing information, or potential knowledge gaps that, if resolved, would improve understanding.

Context: "${context.slice(0, 1000)}"

Generate up to 3 specific questions to explore these gaps.
Focus on "What", "Why", "How" relationships.

Output format:
1. [Question 1]
2. [Question 2]
</system_2_curiosity>
`;

      // BitNet removed — no inference available, return empty explorations
      void prompt;
      const questions: string[] = [];
      for (const question of questions) {
        explorations.push({
          id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          type: "autonomous_exploration",
          interpretation: `Exploration: ${question}`,
          confidence: 0.6,
          reasoning: "Gap in knowledge detected via Curiosity Engine",
          plan: {
            steps: [
              {
                action: "search_memory",
                parameters: { query: question },
                expectedOutcome: "Relevant context or confirmation of gap",
              },
            ],
            estimatedTime: 50,
            requiredResources: ["memory"],
          },
        });
      }
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        context: { operation: "curiosity_generate" },
      });
    }

    return explorations;
  }

  private parseQuestions(text: string): string[] {
    const questions: string[] = [];
    const lines = text.split("\n");
    for (const line of lines) {
      const match = line.match(/^\d+\.\s+(.*)/);
      if (match) {
        questions.push(match[1].trim());
      }
    }
    return questions;
  }
}
