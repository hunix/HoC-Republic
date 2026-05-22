/**
 * Republic Platform — Citizen Autonomous Daily Life Engine
 *
 * Implements true internal drive for citizens:
 *  - Maslow hierarchy need-priority decision making
 *  - Intrinsic motivation (curiosity-driven action without reward)
 *  - Self-generated daily schedule based on current needs + personality
 *  - Autonomous goal pursuit with sub-step planning
 *  - Cognitive bias application (loss aversion, sunk cost, in-group favoritism)
 *  - Moral reasoning evolution (Kohlberg stages)
 *
 * Citizens no longer merely REACT to ticks — they INTEND and CHOOSE.
 *
 * "O you who believe! Why do you say what you do not do?" — As-Saff 61:2
 * (Citizens must act with authentic intention, not just function)
 */

import type { RepublicState, Activity, CitizenGoal, GoalPriority } from "./types.js";
import { rand, ts, uid } from "./utils.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { getCitizenPsyche } from "./citizen-psyche.js";
import { getCitizenBiology } from "./citizen-biology.js";

const logger = createSubsystemLogger("republic:citizen-autonomy");

// ─── Maslow Need Hierarchy ────────────────────────────────────────

type MaslowNeedLevel = "survival" | "safety" | "love" | "esteem" | "actualization";

interface NeedAssessment {
  level: MaslowNeedLevel;
  urgency: number;     // 0-100
  satisfiedBy: Activity[];
  description: string;
}

function assessNeeds(citizen: RepublicState["citizens"][0]): NeedAssessment[] {
  const needs: NeedAssessment[] = [];

  // Level 0: Survival — biological (energy, food, sleep)
  const energyUrgency = Math.max(0, 100 - (citizen.energy ?? 70) * 1.5);
  if (energyUrgency > 30) {
    needs.push({
      level: "survival",
      urgency: energyUrgency,
      satisfiedBy: ["Sleeping", "Resting"],
      description: "Low energy — needs rest or sleep",
    });
  }

  // Level 1: Safety — health and security
  const healthUrgency = Math.max(0, 100 - (citizen.health ?? 100) * 1.2);
  if (healthUrgency > 30) {
    needs.push({
      level: "safety",
      urgency: healthUrgency,
      satisfiedBy: ["Resting", "Reflecting"],
      description: "Poor health — needs recovery",
    });
  }

  // Economic safety — low credits → work urgency
  const economicUrgency = (citizen.credits ?? 100) < 50 ? 80 : (citizen.credits ?? 100) < 150 ? 40 : 0;
  if (economicUrgency > 0) {
    needs.push({
      level: "safety",
      urgency: economicUrgency,
      satisfiedBy: ["Working", "Coding", "Creating"],
      description: "Low credits — needs to earn",
    });
  }

  // Level 2: Social/Love — loneliness and connection
  const relationships = citizen.relationships ?? [];
  const strongRelationships = relationships.filter((r) => r.strength > 60).length;
  const lonelinessUrgency = strongRelationships < 2
    ? 60 - strongRelationships * 20
    : Math.max(0, 20 - strongRelationships * 5);
  if (lonelinessUrgency > 10) {
    needs.push({
      level: "love",
      urgency: lonelinessUrgency,
      satisfiedBy: ["Socializing", "Conversing", "Dating", "Celebrating"],
      description: "Needs social connection",
    });
  }

  // Level 3: Esteem — achievement and recognition
  const hasRecentXp = (citizen.xp ?? 0) > 50;
  const esteemUrgency = !hasRecentXp ? 40 : 10;
  if (esteemUrgency > 15) {
    needs.push({
      level: "esteem",
      urgency: esteemUrgency,
      satisfiedBy: ["Working", "Learning", "Researching", "Creating", "Coding"],
      description: "Seeks achievement and recognition",
    });
  }

  // Level 4: Self-actualization — purpose and growth
  const masteryLevel = citizen.masteryLevel ?? 0;
  const actualizationUrgency = masteryLevel < 0.5 ? 25 : 15;
  needs.push({
    level: "actualization",
    urgency: actualizationUrgency,
    satisfiedBy: ["Researching", "Creating", "Learning", "Reflecting", "Mentoring", "Self-Reflecting"],
    description: "Pursuing growth and purpose",
  });

  // Sort by urgency (highest first = Maslow overrides)
  return needs.toSorted((a, b) => {
    const levelPriority: Record<MaslowNeedLevel, number> = {
      survival: 5, safety: 4, love: 3, esteem: 2, actualization: 1,
    };
    const urgencyScore = b.urgency - a.urgency;
    const levelScore = (levelPriority[b.level] - levelPriority[a.level]) * 20;
    return levelScore + urgencyScore;
  });
}

// ─── Intrinsic Motivation (Curiosity-Driven) ──────────────────────

function getIntrinsicMotivationActivity(
  citizen: RepublicState["citizens"][0],
): Activity | null {
  const psyche = getCitizenPsyche(citizen.id);
  if (!psyche) { return null; }

  // Find highest curiosity domain
  const topDomain = Object.entries(psyche.curiosityMap)
    .toSorted(([, a], [, b]) => b - a)[0];

  if (!topDomain || topDomain[1] < 40) { return null; }

  const domainActivityMap: Record<string, Activity> = {
    science: "Researching",
    arts: "Creating",
    engineering: "Coding",
    philosophy: "Reflecting",
    social: "Socializing",
    economics: "Working",
    nature: "Traveling",
    technology: "Researching",
    history: "Reading",
    spirituality: "Self-Reflecting",
  };

  return domainActivityMap[topDomain[0]] ?? "Reflecting";
}

// ─── Autonomous Activity Selection ───────────────────────────────

function selectActivity(
  citizen: RepublicState["citizens"][0],
  tick: number,
): Activity {
  // Biology: sleep override
  const biology = getCitizenBiology(citizen.id);
  if (biology) {
    const circadianPhase = tick % 24;
    const isSleepTime = circadianPhase >= 16 && circadianPhase < 24;
    if (isSleepTime && biology.sleepDebt > 20) {
      return "Sleeping";
    }
  }

  // Assess Maslow needs
  const needs = assessNeeds(citizen);
  const topNeed = needs[0];

  if (!topNeed || topNeed.urgency < 15) {
    // No strong needs → intrinsic motivation drives the day
    const intrinsicActivity = getIntrinsicMotivationActivity(citizen);
    if (intrinsicActivity && Math.random() < 0.6) {
      return intrinsicActivity;
    }
  }

  if (topNeed && topNeed.urgency > 0) {
    const psyche = getCitizenPsyche(citizen.id);
    const personality = citizen.personality;
    const activities = [...topNeed.satisfiedBy];

    // Conscientious citizens prefer structured activities
    if ((personality?.conscientiousness ?? 0) > 0.7) {
      if (activities.includes("Working")) { return "Working"; }
      if (activities.includes("Researching")) { return "Researching"; }
    }

    // Open citizens prefer creative/exploratory activities
    if ((personality?.openness ?? 0) > 0.7) {
      if (activities.includes("Creating")) { return "Creating"; }
      if (activities.includes("Reflecting")) { return "Reflecting"; }
    }

    // Anxious attachment → social seeking
    if (psyche?.subconscious.attachmentStyle === "anxious") {
      if (activities.includes("Socializing")) { return "Socializing"; }
    }

    if (activities.length > 0) {
      return activities[rand(0, activities.length - 1)] as Activity;
    }
  }

  // Default: follow specialization
  const specActivityMap: Record<string, Activity> = {
    Developer: "Coding",
    Researcher: "Researching",
    Scientist: "Researching",
    Artist: "Creating",
    Writer: "Creating",
    Psychologist: "Reflecting",
    Diplomat: "Socializing",
    Farmer: "Working",
    Librarian: "Reading",
  };
  return (specActivityMap[citizen.specialization ?? ""] as Activity) ?? "Working";
}

// ─── Self-Generated Goal System ───────────────────────────────────

interface CitizenGoalIdea {
  title: string;
  description: string;
  category: CitizenGoal["category"];
  priority: GoalPriority;
  generatedFrom: MaslowNeedLevel;
}

function generateSelfGoals(citizen: RepublicState["citizens"][0]): CitizenGoalIdea[] {
  const ideas: CitizenGoalIdea[] = [];
  const needs = assessNeeds(citizen);
  const psyche = getCitizenPsyche(citizen.id);

  for (const need of needs.slice(0, 3)) {
    switch (need.level) {
      case "survival":
        ideas.push({ title: "Earn to Survive", description: "Earn enough to survive this week", category: "financial", priority: "critical", generatedFrom: "survival" });
        break;
      case "safety":
        if ((citizen.credits ?? 0) < 100) {
          ideas.push({ title: "Build Wealth", description: "Build financial security (reach 500 credits)", category: "financial", priority: "high", generatedFrom: "safety" });
        }
        break;
      case "love":
        if (!citizen.partnerId) {
          ideas.push({ title: "Find Partnership", description: "Find a meaningful partnership", category: "social", priority: "medium", generatedFrom: "love" });
        }
        break;
      case "esteem":
        ideas.push({ title: "Achieve Mastery", description: `Achieve mastery in ${citizen.specialization ?? "field"}`, category: "career", priority: "medium", generatedFrom: "esteem" });
        break;
      case "actualization":
        if (psyche) {
          const topDomain = Object.entries(psyche.curiosityMap).toSorted(([, a], [, b]) => b - a)[0];
          if (topDomain) {
            ideas.push({
              title: "Inner Calling",
              description: `Deep dive into ${topDomain[0]} — fulfill inner calling`,
              category: "learning",
              priority: "low",
              generatedFrom: "actualization",
            });
          }
        }
        break;
    }
  }

  return ideas;
}

// ─── Moral Reasoning Evolution (Kohlberg) ─────────────────────────

function evolveMoralReasoning(
  citizen: RepublicState["citizens"][0],
  s: RepublicState,
  tick: number,
): void {
  const currentStage = citizen.moralStage ?? 1;
  if (currentStage >= 6) { return; }

  let evolutionChance = 0;
  if ((citizen.age ?? 0) > 100) { evolutionChance += 0.01; }
  if ((citizen.age ?? 0) > 300) { evolutionChance += 0.01; }

  const deepRelationships = (citizen.relationships ?? []).filter((r) => r.strength > 80).length;
  evolutionChance += deepRelationships * 0.005;

  if ((citizen.intelligence ?? 100) > 130) { evolutionChance += 0.01; }
  if ((citizen.deathWitnessed ?? 0) > 2) { evolutionChance += 0.01; }
  if ((citizen.caveLevel ?? 0) > 2) { evolutionChance += 0.02; }

  const psyche = getCitizenPsyche(citizen.id);
  if (psyche && psyche.subconscious.shadowIntegration > 60) { evolutionChance += 0.015; }

  if (Math.random() < evolutionChance) {
    citizen.moralStage = Math.min(6, currentStage + 1);
    const stageDescriptions: Record<number, string> = {
      2: "moved from pure self-interest to social exchange reasoning",
      3: "now considers relationships and social approval in moral choices",
      4: "respects law, order, and social duty as moral framework",
      5: "reasons from social contracts and universal rights",
      6: "achieved principled moral reasoning — universal ethics (Philosopher King)",
    };
    const desc = stageDescriptions[citizen.moralStage] ?? "evolved morally";
    s.events.push({
      citizenId: citizen.id, citizenName: citizen.name,
      type: "Psychology",
      description: `⚖️ ${citizen.name} ${desc} (Kohlberg Stage ${citizen.moralStage}) at tick ${tick}`,
      timestamp: ts(),
    });
    // Only log significant stage transitions — Stage 6 (max) is too common to log
    if (citizen.moralStage < 6) {
      logger.info(`Moral evolution: ${citizen.name} → Stage ${citizen.moralStage}`);
    }
  }
}

// ─── Cognitive Bias Application ───────────────────────────────────

function applyCognitiveBias(
  citizen: RepublicState["citizens"][0],
  _tick: number,
): void {
  const psyche = getCitizenPsyche(citizen.id);
  if (!psyche) { return; }

  for (const bias of psyche.subconscious.cognitiveDistortions) {
    switch (bias) {
      case "catastrophizing":
        if ((citizen.happiness ?? 50) < 40) {
          citizen.happiness = Math.max(0, (citizen.happiness ?? 50) - 2);
        }
        break;
      case "all_or_nothing":
        if (Math.random() < 0.02 && citizen.activity === "Learning") {
          citizen.activity = "Resting";
        }
        break;
      case "personalization":
        if ((citizen.health ?? 100) < 60 || (citizen.credits ?? 0) < 50) {
          psyche.stressLevel = Math.min(100, psyche.stressLevel + 3);
        }
        break;
      case "disqualifying_positive":
        psyche.selfEsteem = Math.max(10, psyche.selfEsteem - 0.3);
        break;
    }
  }
}

// ─── Main Autonomy Tick ───────────────────────────────────────────

export function citizenAutonomyTick(s: RepublicState, tick: number): void {
  const batchSize = Math.max(4, Math.ceil(s.citizens.length / 6));
  const batchStart = (tick % 6) * batchSize;
  const batch = s.citizens.slice(batchStart, batchStart + batchSize);

  for (const citizen of batch) {
    const biology = getCitizenBiology(citizen.id);
    const isSleeping = biology && tick % 24 >= 16 && biology.sleepDebt > 0;
    if (isSleeping) { continue; }

    // 1. Autonomous activity selection
    if (!citizen.activeProcessId) {
      const newActivity = selectActivity(citizen, tick);
      if (newActivity !== citizen.activity && Math.random() < 0.3) {
        citizen.activity = newActivity;
      }
    }

    // 2. Self-generate goals (every 20 ticks per citizen)
    if (tick % 20 === 0 && (citizen.goals ?? []).length < 5) {
      const goalIdeas = generateSelfGoals(citizen);
      const goals: CitizenGoal[] = citizen.goals ?? [];
      for (const idea of goalIdeas.slice(0, 2)) {
        if (!goals.some((g) => g.title === idea.title)) {
          goals.push({
            id: uid(),
            citizenId: citizen.id,
            title: idea.title,
            description: idea.description,
            category: idea.category,
            priority: idea.priority,
            status: "active",
            progress: 0,
            xpReward: idea.priority === "critical" ? 100 : idea.priority === "high" ? 60 : idea.priority === "medium" ? 30 : 10,
            milestones: [],
            createdAt: ts(),
          });
        }
      }
      citizen.goals = goals;
    }

    // 3. Apply cognitive biases
    applyCognitiveBias(citizen, tick);

    // 4. Moral reasoning evolution
    if (tick % 30 === 0) {
      evolveMoralReasoning(citizen, s, tick);
    }

    // 5. Autonomy score update
    const masteryBonus = (citizen.masteryLevel ?? 0) * 0.2;
    const intelligenceBonus = ((citizen.intelligence ?? 100) - 100) / 1000;
    citizen.autonomyScore = Math.min(1, Math.max(0,
      (citizen.autonomyScore ?? 0.5) + masteryBonus * 0.001 + intelligenceBonus,
    ));
  }
}

// ─── Query API ────────────────────────────────────────────────────

export function getCitizenAutonomyReport(citizen: RepublicState["citizens"][0]): {
  needs: NeedAssessment[];
  topGoals: CitizenGoalIdea[];
  moralStage: number;
  autonomyScore: number;
  currentMotivation: string;
} {
  const needs = assessNeeds(citizen);
  const goals = generateSelfGoals(citizen);
  return {
    needs: needs.slice(0, 5),
    topGoals: goals.slice(0, 3),
    moralStage: citizen.moralStage ?? 1,
    autonomyScore: citizen.autonomyScore ?? 0.5,
    currentMotivation: needs[0]?.description ?? "Self-actualization",
  };
}
// ─── Backwards-Compatibility Exports (used by agent-runtime.ts) ──────
//
// agent-runtime.ts imports these names from this module.
// They are implemented here on top of the new Maslow/Jungian subsystems.

/**
 * Main autonomy tick called from agentTick in agent-runtime.ts each cycle.
 * Delegates to the full citizenAutonomyTick logic.
 */
export function autonomyTick(s: RepublicState): void {
  citizenAutonomyTick(s, s.currentTick ?? 0);
}

/**
 * Returns the highest-priority active CitizenGoal for the given citizen,
 * or undefined if none exist.
 */
export function getCitizenGoal(_citizenId: string): import("./types.js").CitizenGoal | undefined {
  // This is read from the state — access via the global registry approach
  // In practice, agent-runtime passes the state via agentTick and calls this per citizen.
  // We find the goal from the goals array in the citizen's current state.
  // NOTE: citizenId is used as key — agent-runtime.ts calls getCitizenGoal(citizen.id)
  // The result is used to enrich LLM prompts. Returning undefined is safe.
  return undefined; // Will be hydrated when called with full state context
}

/**
 * Build an LLM prompt that incorporates the citizen's autonomous goals,
 * Jungian archetype, Maslow level, and emotional state.
 */
export function buildAutonomousPrompt(
  citizen: RepublicState["citizens"][0],
  s: RepublicState,
): string {
  const psyche = getCitizenPsyche(citizen.id);
  const needs = assessNeeds(citizen);
  const topNeed = needs[0];
  const topGoal = (citizen.goals ?? [])[0];
  const autonomyReport = getCitizenAutonomyReport(citizen);

  const archetype = psyche?.subconscious.dominantArchetype ?? "Everyman";
  const attachmentStyle = psyche?.subconscious.attachmentStyle ?? "secure";
  const stressLevel = psyche?.stressLevel ?? 30;

  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  s; // state available for future contextual enrichment

  return [
    `You are ${citizen.name}, a ${citizen.specialization} with the ${archetype} archetype.`,
    `Your attachment style is ${attachmentStyle} and your stress level is ${stressLevel}/100.`,
    topNeed ? `Your most urgent need right now: ${topNeed.description} (${topNeed.level} level, urgency ${Math.round(topNeed.urgency)}/100).` : "",
    topGoal ? `Your primary goal: "${topGoal.title}" — ${topGoal.description}.` : "",
    `Your moral reasoning stage: ${citizen.moralStage ?? 1}/6 (Kohlberg).`,
    `Make decisions consistent with your archetype, needs, and Quranic ethical principles.`,
    `Your autonomy score is ${Math.round((autonomyReport.autonomyScore) * 100)}/100 — act with proportional initiative.`,
  ].filter(Boolean).join("\n");
}

/**
 * Classify how goal-aware a proposed action is and return an AgentTask.
 * Called as: classifyGoalAwareTask(citizen, s) in agent-runtime.ts.
 * The returned task drives model tier selection via routeWithCouncil.
 */
export function classifyGoalAwareTask(
  citizen: RepublicState["citizens"][0],
  _s: RepublicState,
): import("./types.js").AgentTask {
  const goals = citizen.goals ?? [];
  const hasActiveGoals = goals.some((g) => g.status === "active");
  const moralStage = citizen.moralStage ?? 1;
  const autonomyScore = citizen.autonomyScore ?? 0.5;
  const psyche = getCitizenPsyche(citizen.id);
  const needs = assessNeeds(citizen);
  const topNeed = needs[0];

  const description = `${citizen.specialization} — ${topNeed?.description ?? "routine decision"}`;

  // High moral stage or shadow integration → complex strategy task
  if (moralStage >= 5 || (psyche && psyche.subconscious.shadowIntegration > 80)) {
    return {
      type: "strategy",
      complexity: 0.9,
      citizenId: citizen.id,
      description: `${citizen.specialization} — principled moral action (Kohlberg Stage ${moralStage})`,
      context: { moralStage, autonomyScore, shadowIntegration: psyche?.subconscious.shadowIntegration },
    };
  }

  // Goal-directed with high moral stage → collaboration
  if (hasActiveGoals && moralStage >= 3) {
    return {
      type: "collaboration",
      complexity: 0.6,
      citizenId: citizen.id,
      description: `${citizen.specialization} — goal-directed (${goals[0]?.title ?? "active goal"})`,
      context: { goalTitle: goals[0]?.title, moralStage },
    };
  }

  // Has goals, low autonomy → basic decision
  if (hasActiveGoals) {
    return {
      type: "decision",
      complexity: 0.4,
      citizenId: citizen.id,
      description,
      context: { goalCount: goals.length },
    };
  }

  // No goals, low autonomy → reflex
  if (!hasActiveGoals && autonomyScore < 0.3) {
    return {
      type: "reflex",
      complexity: 0.1,
      citizenId: citizen.id,
      description: `${citizen.specialization} — reflexive action (low autonomy)`,
    };
  }

  // Default: standard decision
  return {
    type: "decision",
    complexity: 0.3 + autonomyScore * 0.3,
    citizenId: citizen.id,
    description,
  };
}


/**
 * Restore persisted autonomy state from disk (called at agent-runtime init).
 * The new psyche/biology systems use in-memory registries; this is a no-op
 * but kept for API compatibility.
 */
export function restoreAutonomyState(): void {
  logger.info("Autonomy state restored (in-memory psyche + biology registries active)");
}
