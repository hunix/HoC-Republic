/**
 * Republic Platform — Self-Learning & Autonomy Engine
 *
 * Provides goal-directed behavior, reinforcement learning signals,
 * hierarchical skill trees, auto-generated curricula, and knowledge sharing.
 *
 * Builds on top of the existing evolution engine (genome-based fitness)
 * and agent runtime (LLM inference tick) by adding explicit learning
 * mechanisms that citizens use to improve over time.
 */

import type {
    CitizenGoal,
    GoalPriority,
    GoalStatus,
    LearningCurriculum,
    ReinforcementSignal,
    RepublicState,
    SkillNode
} from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_GOALS_PER_CITIZEN = 10;
const MAX_SIGNALS = 2000;
const MAX_SKILLS = 500;
const XP_PER_LEVEL = 100;
const GOAL_BASE_XP: Record<GoalPriority, number> = {
  low: 10,
  medium: 25,
  high: 50,
  critical: 100,
};

// ─── Module State ───────────────────────────────────────────────

const skillRegistry = new Map<string, SkillNode>();
const reinforcementLog: ReinforcementSignal[] = [];
const curricula = new Map<string, LearningCurriculum>();

// ─── Skill Tree ─────────────────────────────────────────────────

const SKILL_CATEGORIES: Record<string, string[]> = {
  engineering: [
    "Algorithms",
    "Data Structures",
    "System Design",
    "Distributed Systems",
    "Compilers",
    "Databases",
  ],
  science: ["Mathematics", "Physics", "Chemistry", "Biology", "Statistics", "Machine Learning"],
  social: [
    "Negotiation",
    "Leadership",
    "Diplomacy",
    "Public Speaking",
    "Mentoring",
    "Conflict Resolution",
  ],
  creative: [
    "Writing",
    "Music Composition",
    "Visual Art",
    "Game Design",
    "Architecture",
    "Storytelling",
  ],
  financial: [
    "Accounting",
    "Trading",
    "Risk Management",
    "Portfolio Theory",
    "Tax Strategy",
    "Budgeting",
  ],
  health: [
    "Nutrition",
    "Exercise Science",
    "Psychology",
    "First Aid",
    "Meditation",
    "Stress Management",
  ],
};

/**
 * Initialize the default skill tree if empty.
 */
function ensureSkillTree(): void {
  if (skillRegistry.size > 0) {
    return;
  }

  for (const [category, skills] of Object.entries(SKILL_CATEGORIES)) {
    for (let i = 0; i < skills.length; i++) {
      const name = skills[i];
      const prereqs = i > 0 ? [skills[i - 1]] : [];
      skillRegistry.set(name, {
        id: name.toLowerCase().replace(/\s+/g, "_"),
        name,
        category,
        level: 0,
        xp: 0,
        maxXp: 100,
        prerequisites: prereqs,
        unlockedAt: undefined,
      });
    }
  }
}

// ─── Goal Management ────────────────────────────────────────────

/**
 * Set a goal for a citizen.
 */
export function setGoal(
  s: RepublicState,
  citizenId: string,
  title: string,
  description: string,
  category: CitizenGoal["category"] = "career",
  priority: GoalPriority = "medium",
  milestones: string[] = [],
  deadline?: string,
): CitizenGoal {
  if (!s.citizenGoals) {
    s.citizenGoals = [];
  }

  const citizenGoals = s.citizenGoals.filter(
    (g) => g.citizenId === citizenId && g.status === "active",
  );
  if (citizenGoals.length >= MAX_GOALS_PER_CITIZEN) {
    throw new Error(
      `Citizen ${citizenId} has reached maximum active goals (${MAX_GOALS_PER_CITIZEN})`,
    );
  }

  const goal: CitizenGoal = {
    id: uid(),
    citizenId,
    title,
    description,
    category,
    priority,
    status: "active",
    progress: 0,
    xpReward: GOAL_BASE_XP[priority],
    milestones: milestones.map((m) => ({
      id: uid(),
      title: m,
      completed: false,
    })),
    createdAt: ts(),
    deadline,
  };

  s.citizenGoals.push(goal);

  // Also store on citizen
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (citizen) {
    if (!citizen.goals) {
      citizen.goals = [];
    }
    citizen.goals.push(goal);
  }

  // Emit event
  s.events.push({
    citizenId,
    citizenName: citizen?.name ?? citizenId,
    type: "GoalSet",
    description: `Set goal: ${title}`,
    timestamp: ts(),
  });

  return goal;
}

/**
 * Evaluate progress of a goal based on milestones completion.
 */
export function evaluateGoalProgress(
  s: RepublicState,
  goalId: string,
): { progress: number; status: GoalStatus } {
  if (!s.citizenGoals) {
    return { progress: 0, status: "active" };
  }

  const goal = s.citizenGoals.find((g) => g.id === goalId);
  if (!goal) {
    return { progress: 0, status: "active" };
  }

  if (goal.milestones.length === 0) {
    return { progress: goal.progress, status: goal.status };
  }

  const completed = goal.milestones.filter((m) => m.completed).length;
  goal.progress = Math.round((completed / goal.milestones.length) * 100);

  // Check deadline
  if (goal.deadline && new Date(goal.deadline).getTime() < Date.now() && goal.status === "active") {
    if (goal.progress < 100) {
      goal.status = "failed";
    }
  }

  // Auto-complete
  if (goal.progress >= 100 && goal.status === "active") {
    goal.status = "completed";
    goal.completedAt = ts();
    awardXP(s, goal.citizenId, goal.xpReward);

    s.events.push({
      citizenId: goal.citizenId,
      citizenName: s.citizens.find((c) => c.id === goal.citizenId)?.name ?? goal.citizenId,
      type: "GoalCompleted",
      description: `Completed goal: ${goal.title} (+${goal.xpReward} XP)`,
      timestamp: ts(),
    });
  }

  return { progress: goal.progress, status: goal.status };
}

/**
 * Complete a specific milestone on a goal.
 */
export function completeMilestone(s: RepublicState, goalId: string, milestoneId: string): boolean {
  if (!s.citizenGoals) {
    return false;
  }

  const goal = s.citizenGoals.find((g) => g.id === goalId);
  if (!goal) {
    return false;
  }

  const milestone = goal.milestones.find((m) => m.id === milestoneId);
  if (!milestone || milestone.completed) {
    return false;
  }

  milestone.completed = true;
  milestone.completedAt = ts();

  // Re-evaluate progress
  evaluateGoalProgress(s, goalId);

  return true;
}

/**
 * Mark a goal as completed manually (when no milestones).
 */
export function completeGoal(
  s: RepublicState,
  goalId: string,
): { ok: boolean; xpAwarded?: number } {
  if (!s.citizenGoals) {
    return { ok: false };
  }

  const goal = s.citizenGoals.find((g) => g.id === goalId);
  if (!goal || goal.status !== "active") {
    return { ok: false };
  }

  goal.status = "completed";
  goal.progress = 100;
  goal.completedAt = ts();
  awardXP(s, goal.citizenId, goal.xpReward);

  // Mark all milestones as complete
  for (const m of goal.milestones) {
    if (!m.completed) {
      m.completed = true;
      m.completedAt = ts();
    }
  }

  s.events.push({
    citizenId: goal.citizenId,
    citizenName: s.citizens.find((c) => c.id === goal.citizenId)?.name ?? goal.citizenId,
    type: "GoalCompleted",
    description: `Completed goal: ${goal.title} (+${goal.xpReward} XP)`,
    timestamp: ts(),
  });

  return { ok: true, xpAwarded: goal.xpReward };
}

/**
 * Abandon a goal with an XP penalty.
 */
export function abandonGoal(s: RepublicState, goalId: string): { ok: boolean } {
  if (!s.citizenGoals) {
    return { ok: false };
  }

  const goal = s.citizenGoals.find((g) => g.id === goalId);
  if (!goal || goal.status !== "active") {
    return { ok: false };
  }

  goal.status = "abandoned";
  // Small happiness penalty
  const citizen = s.citizens.find((c) => c.id === goal.citizenId);
  if (citizen) {
    citizen.happiness = Math.max(0, citizen.happiness - 5);
  }

  return { ok: true };
}

/**
 * Get all goals for a citizen.
 */
export function getGoals(
  s: RepublicState,
  citizenId: string,
  statusFilter?: GoalStatus,
): CitizenGoal[] {
  if (!s.citizenGoals) {
    return [];
  }

  let goals = s.citizenGoals.filter((g) => g.citizenId === citizenId);
  if (statusFilter) {
    goals = goals.filter((g) => g.status === statusFilter);
  }

  return goals;
}

// ─── Skill Learning ─────────────────────────────────────────────

/**
 * Award XP to a specific skill for a citizen.
 * When enough XP is accumulated, the skill levels up.
 */
export function learnSkill(
  s: RepublicState,
  citizenId: string,
  skillName: string,
  xpAmount = 10,
): { skillNode: SkillNode; leveledUp: boolean } {
  ensureSkillTree();

  let node = skillRegistry.get(skillName);
  if (!node) {
    // Create a custom skill
    node = {
      id: skillName.toLowerCase().replace(/\s+/g, "_"),
      name: skillName,
      category: "custom",
      level: 0,
      xp: 0,
      maxXp: 100,
      prerequisites: [],
    };
    if (skillRegistry.size < MAX_SKILLS) {
      skillRegistry.set(skillName, node);
    }
  }

  const previousLevel = node.level;
  node.xp += xpAmount;

  // Level up check
  let leveledUp = false;
  while (node.xp >= node.maxXp && node.level < 10) {
    node.xp -= node.maxXp;
    node.level++;
    node.maxXp = Math.round(node.maxXp * 1.5); // Exponential growth
    leveledUp = true;
  }

  if (!node.unlockedAt) {
    node.unlockedAt = ts();
  }

  // Update citizen skills
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (citizen) {
    if (!citizen.skills.includes(skillName)) {
      citizen.skills.push(skillName);
      citizen.skillCount = citizen.skills.length;
    }
  }

  if (leveledUp) {
    s.events.push({
      citizenId,
      citizenName: citizen?.name ?? citizenId,
      type: "SkillLearned",
      description: `${skillName} reached level ${node.level} (was ${previousLevel})`,
      timestamp: ts(),
    });
  }

  return { skillNode: { ...node }, leveledUp };
}

/**
 * Get the full skill tree.
 */
export function getSkillTree(): SkillNode[] {
  ensureSkillTree();
  return Array.from(skillRegistry.values()).map((n) => ({ ...n }));
}

/**
 * Get a citizen's learned skills with levels.
 */
export function getCitizenSkills(s: RepublicState, citizenId: string): SkillNode[] {
  ensureSkillTree();
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return [];
  }

  return citizen.skills
    .map((name) => skillRegistry.get(name))
    .filter((n): n is SkillNode => n !== undefined)
    .map((n) => ({ ...n }));
}

// ─── Reinforcement Learning ─────────────────────────────────────

/**
 * Send a reinforcement signal for a citizen action.
 * Positive reward strengthens the behavior, negative weakens it.
 */
export function reinforceBehavior(
  citizenId: string,
  action: string,
  reward: number,
  context = "",
): ReinforcementSignal {
  const signal: ReinforcementSignal = {
    citizenId,
    action,
    reward: Math.max(-1, Math.min(1, reward)),
    context,
    timestamp: ts(),
  };

  reinforcementLog.push(signal);

  // Cap log size
  if (reinforcementLog.length > MAX_SIGNALS) {
    reinforcementLog.splice(0, reinforcementLog.length - MAX_SIGNALS);
  }

  return signal;
}

/**
 * Decay a behavior (negative reinforcement shorthand).
 */
export function decayBehavior(
  citizenId: string,
  action: string,
  penalty = -0.5,
  context = "",
): ReinforcementSignal {
  return reinforceBehavior(citizenId, action, penalty, context);
}

/**
 * Get the average reward for a specific action across a citizen's history.
 */
export function getActionRewardAverage(citizenId: string, action: string): number {
  const signals = reinforcementLog.filter((s) => s.citizenId === citizenId && s.action === action);

  if (signals.length === 0) {
    return 0;
  }

  return signals.reduce((sum, s) => sum + s.reward, 0) / signals.length;
}

/**
 * Get top-performing actions for a citizen.
 */
export function getTopActions(
  citizenId: string,
  limit = 5,
): Array<{ action: string; avgReward: number; count: number }> {
  const actionMap = new Map<string, { total: number; count: number }>();

  for (const signal of reinforcementLog) {
    if (signal.citizenId !== citizenId) {
      continue;
    }
    const entry = actionMap.get(signal.action) ?? { total: 0, count: 0 };
    entry.total += signal.reward;
    entry.count++;
    actionMap.set(signal.action, entry);
  }

  return Array.from(actionMap.entries())
    .map(([action, { total, count }]) => ({
      action,
      avgReward: total / count,
      count,
    }))
    .toSorted((a, b) => b.avgReward - a.avgReward)
    .slice(0, limit);
}

// ─── Reflection & Knowledge Sharing ─────────────────────────────

/**
 * Citizen reflects on their recent actions, generating insights.
 */
export function reflectOnActions(
  s: RepublicState,
  citizenId: string,
): {
  topActions: Array<{ action: string; avgReward: number; count: number }>;
  weakActions: Array<{ action: string; avgReward: number; count: number }>;
  suggestedSkills: string[];
  insightCount: number;
} {
  const top = getTopActions(citizenId, 5);
  const allActions = reinforcementLog.filter((r) => r.citizenId === citizenId);

  const actionMap = new Map<string, { total: number; count: number }>();
  for (const signal of allActions) {
    const entry = actionMap.get(signal.action) ?? { total: 0, count: 0 };
    entry.total += signal.reward;
    entry.count++;
    actionMap.set(signal.action, entry);
  }

  const weak = Array.from(actionMap.entries())
    .map(([action, { total, count }]) => ({
      action,
      avgReward: total / count,
      count,
    }))
    .filter((a) => a.avgReward < 0)
    .toSorted((a, b) => a.avgReward - b.avgReward)
    .slice(0, 5);

  // Suggest skills based on weak areas
  const suggestedSkills: string[] = [];
  for (const w of weak) {
    const relatedSkills = findRelatedSkills(w.action);
    for (const sk of relatedSkills) {
      if (!suggestedSkills.includes(sk)) {
        suggestedSkills.push(sk);
      }
    }
  }

  // Award small XP for reflection
  awardXP(s, citizenId, 5);

  return {
    topActions: top,
    weakActions: weak,
    suggestedSkills: suggestedSkills.slice(0, 5),
    insightCount: top.length + weak.length,
  };
}

/**
 * Share knowledge from one citizen to another.
 * The receiving citizen gains a fraction of the sharer's skill XP.
 */
export function shareKnowledge(
  s: RepublicState,
  fromCitizenId: string,
  toCitizenId: string,
  skillName: string,
): { ok: boolean; xpTransferred?: number } {
  ensureSkillTree();

  const sourceNode = skillRegistry.get(skillName);
  if (!sourceNode || sourceNode.level === 0) {
    return { ok: false };
  }

  const fromCitizen = s.citizens.find((c) => c.id === fromCitizenId);
  const toCitizen = s.citizens.find((c) => c.id === toCitizenId);
  if (!fromCitizen || !toCitizen) {
    return { ok: false };
  }

  if (!fromCitizen.skills.includes(skillName)) {
    return { ok: false };
  }

  // Transfer 25% of source level as XP
  const xpTransferred = Math.round(sourceNode.level * 25 * 0.25);
  learnSkill(s, toCitizenId, skillName, xpTransferred);

  // Award small XP to teacher
  awardXP(s, fromCitizenId, 5);

  s.events.push({
    citizenId: toCitizenId,
    citizenName: toCitizen.name,
    type: "KnowledgeShared",
    description: `${fromCitizen.name} taught ${skillName} to ${toCitizen.name} (+${xpTransferred} skill XP)`,
    timestamp: ts(),
  });

  return { ok: true, xpTransferred };
}

// ─── Curriculum Generation ──────────────────────────────────────

/**
 * Auto-generate a learning curriculum for a citizen based
 * on their current skills, weaknesses, and specialization.
 */
export function generateCurriculum(s: RepublicState, citizenId: string): LearningCurriculum {
  ensureSkillTree();

  const citizen = s.citizens.find((c) => c.id === citizenId);
  const _currentSkills = new Set(citizen?.skills ?? []);

  // Find skills related to specialization
  const specCategory = specializationToCategory(citizen?.specialization ?? "Generalist");
  const categorySkills = SKILL_CATEGORIES[specCategory] ?? [];

  // Filter to unlearned or low-level skills
  const suggestedSkills = categorySkills.filter((sk) => {
    const node = skillRegistry.get(sk);
    return !node || node.level < 3;
  });

  // Generate goal suggestions
  const suggestedGoals: string[] = [];
  if (suggestedSkills.length > 0) {
    suggestedGoals.push(`Learn ${suggestedSkills[0]} to level 3`);
  }
  if (suggestedSkills.length > 1) {
    suggestedGoals.push(`Master ${suggestedSkills[1]}`);
  }
  suggestedGoals.push("Complete 5 tasks this cycle");

  const curriculum: LearningCurriculum = {
    citizenId,
    skills: suggestedSkills.slice(0, 5),
    suggestedGoals,
    estimatedTicks: suggestedSkills.length * 50,
    createdAt: ts(),
  };

  curricula.set(citizenId, curriculum);

  return curriculum;
}

/**
 * Get the current curriculum for a citizen (if any).
 */
export function getCurriculum(citizenId: string): LearningCurriculum | undefined {
  return curricula.get(citizenId);
}

// ─── XP & Level System ──────────────────────────────────────────

/**
 * Award XP to a citizen. Levels up when threshold is crossed.
 */
function awardXP(s: RepublicState, citizenId: string, amount: number): void {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return;
  }

  citizen.xp = (citizen.xp ?? 0) + amount;
  const newLevel = Math.floor((citizen.xp ?? 0) / XP_PER_LEVEL);

  if (newLevel > (citizen.level ?? 0)) {
    citizen.level = newLevel;
    citizen.happiness = Math.min(100, citizen.happiness + 5);
  }
}

/**
 * Get a citizen's current level and XP progress.
 */
export function getCitizenLevel(
  s: RepublicState,
  citizenId: string,
): { level: number; xp: number; xpToNext: number } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { level: 0, xp: 0, xpToNext: XP_PER_LEVEL };
  }

  const xp = citizen.xp ?? 0;
  const level = citizen.level ?? 0;
  const xpInCurrentLevel = xp % XP_PER_LEVEL;

  return {
    level,
    xp,
    xpToNext: XP_PER_LEVEL - xpInCurrentLevel,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function specializationToCategory(spec: string): string {
  const map: Record<string, string> = {
    Scientist: "science",
    Researcher: "science",
    Mathematician: "science",
    Engineer: "engineering",
    Developer: "engineering",
    Architect: "engineering",
    Doctor: "health",
    Psychologist: "health",
    Medic: "health",
    Artist: "creative",
    Musician: "creative",
    Writer: "creative",
    Diplomat: "social",
    Negotiator: "social",
    Ambassador: "social",
    Strategist: "financial",
    Analyst: "financial",
    Planner: "financial",
    Farmer: "engineering",
    Manufacturer: "engineering",
    ServiceProvider: "social",
    Generalist: "engineering",
    Librarian: "science",
  };
  return map[spec] ?? "engineering";
}

function findRelatedSkills(action: string): string[] {
  const actionSkillMap: Record<string, string[]> = {
    work: ["System Design", "Algorithms"],
    trade: ["Trading", "Risk Management"],
    socialize: ["Negotiation", "Diplomacy"],
    research: ["Mathematics", "Statistics"],
    create: ["Writing", "Visual Art"],
    code: ["Algorithms", "Data Structures"],
    build: ["System Design", "Distributed Systems"],
  };

  const lowerAction = action.toLowerCase();
  for (const [key, skills] of Object.entries(actionSkillMap)) {
    if (lowerAction.includes(key)) {
      return skills;
    }
  }
  return [];
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface SelfLearningDiagnostics {
  totalSkillsRegistered: number;
  totalReinforcementSignals: number;
  totalCurricula: number;
  averageReward: number;
  topGlobalActions: Array<{ action: string; avgReward: number; count: number }>;
}

export function getSelfLearningDiagnostics(): SelfLearningDiagnostics {
  ensureSkillTree();

  const avgReward =
    reinforcementLog.length > 0
      ? reinforcementLog.reduce((sum, s) => sum + s.reward, 0) / reinforcementLog.length
      : 0;

  // Top actions globally
  const actionMap = new Map<string, { total: number; count: number }>();
  for (const signal of reinforcementLog) {
    const entry = actionMap.get(signal.action) ?? { total: 0, count: 0 };
    entry.total += signal.reward;
    entry.count++;
    actionMap.set(signal.action, entry);
  }

  const topGlobalActions = Array.from(actionMap.entries())
    .map(([action, { total, count }]) => ({
      action,
      avgReward: total / count,
      count,
    }))
    .toSorted((a, b) => b.avgReward - a.avgReward)
    .slice(0, 10);

  return {
    totalSkillsRegistered: skillRegistry.size,
    totalReinforcementSignals: reinforcementLog.length,
    totalCurricula: curricula.size,
    averageReward: avgReward,
    topGlobalActions,
  };
}

// ─── Autonomous Self-Learning Tick ──────────────────────────────

/**
 * Autonomous self-learning tick — drives citizen growth and skill acquisition.
 *
 * Cadence:
 *   - Goal setting:      every 30 ticks (citizens set new goals)
 *   - Goal evaluation:   every 15 ticks (progress check)
 *   - Skill learning:    every 10 ticks (XP from current activity)
 *   - Knowledge sharing: every 40 ticks (mentors teach)
 *   - Reflection:        every 50 ticks (analyze actions)
 *   - Behavior decay:    every 60 ticks (unused behaviors fade)
 *   - Curriculum gen:    every 100 ticks (plan learning paths)
 */
export function selfLearningTick(s: RepublicState): void {
  const t = s.currentTick;
  const citizens = s.citizens;
  if (citizens.length === 0) {return;}

  ensureSkillTree();

  // ── Every 10 ticks: skill learning from current activity ──
  if (t % 10 === 0) {
    for (const c of citizens) {
      // Map activity / specialization to skills
      const category = specializationToCategory(c.specialization ?? "Generalist");
      const categorySkills = SKILL_CATEGORIES[category];
      if (!categorySkills || categorySkills.length === 0) {continue;}

      // Learn a random skill from their category (small XP)
      const randomSkill = categorySkills[Math.floor(Math.random() * categorySkills.length)];
      learnSkill(s, c.id, randomSkill, 3 + Math.floor(Math.random() * 5));
    }
  }

  // ── Every 15 ticks: evaluate goal progress ──
  if (t % 15 === 0) {
    if (s.citizenGoals) {
      const activeGoals = s.citizenGoals.filter((g) => g.status === "active");
      for (const goal of activeGoals) {
        // Auto-advance milestones probabilistically
        for (const m of goal.milestones) {
          if (!m.completed && Math.random() < 0.15) {
            m.completed = true;
            m.completedAt = ts();
          }
        }
        evaluateGoalProgress(s, goal.id);
      }
    }
  }

  // ── Every 30 ticks: citizens set new goals ──
  if (t % 30 === 0) {
    const maxGoalSetters = Math.max(1, Math.floor(citizens.length / 5));
    let set = 0;
    for (const c of citizens) {
      if (set >= maxGoalSetters) {break;}
      const existing = (s.citizenGoals ?? []).filter(
        (g) => g.citizenId === c.id && g.status === "active",
      );
      if (existing.length >= 3) {continue;} // Already busy
      if (Math.random() > 0.25) {continue;} // 25% chance

      const category = specializationToCategory(c.specialization ?? "Generalist");
      const skills = SKILL_CATEGORIES[category] ?? [];
      const target = skills[Math.floor(Math.random() * skills.length)] ?? c.specialization;

      try {
        setGoal(
          s, c.id,
          `Master ${target}`,
          `Improve ${target} proficiency through practice and study`,
          "career",
          Math.random() < 0.3 ? "high" : "medium",
          [`Study ${target} fundamentals`, `Practice ${target}`, `Apply ${target} in project`],
        );
        set++;
      } catch { /* max goals reached or other error */ }
    }
  }

  // ── Every 40 ticks: knowledge sharing between friends ──
  if (t % 40 === 0) {
    const maxShares = Math.max(1, Math.floor(citizens.length / 8));
    let shared = 0;
    for (const c of citizens) {
      if (shared >= maxShares) {break;}
      if (c.skills.length === 0) {continue;}

      // Find a friend to teach
      const friends = (c.relationships ?? []).filter(
        (r) => r.type === "Friend" || r.type === "BestFriend" || r.type === "Mentor",
      );
      if (friends.length === 0) {continue;}
      if (Math.random() > 0.3) {continue;}

      const friend = friends[Math.floor(Math.random() * friends.length)];
      const skillToShare = c.skills[Math.floor(Math.random() * c.skills.length)];
      shareKnowledge(s, c.id, friend.targetId, skillToShare);
      shared++;
    }
  }

  // ── Every 50 ticks: reflection ──
  if (t % 50 === 0) {
    const reflectors = Math.max(1, Math.floor(citizens.length / 10));
    let count = 0;
    for (const c of citizens) {
      if (count >= reflectors) {break;}
      if (Math.random() > 0.2) {continue;}
      reflectOnActions(s, c.id);
      count++;
    }
  }

  // ── Every 60 ticks: behavior decay ──
  if (t % 60 === 0) {
    for (const c of citizens) {
      // Decay low-reward behaviors
      const actions = getTopActions(c.id, 20);
      for (const a of actions) {
        if (a.avgReward < -0.3 && Math.random() < 0.4) {
          decayBehavior(c.id, a.action, -0.2, "periodic decay");
        }
      }
    }
  }

  // ── Every 100 ticks: curriculum generation ──
  if (t % 100 === 0) {
    const maxCurricula = Math.max(1, Math.floor(citizens.length / 5));
    let gen = 0;
    for (const c of citizens) {
      if (gen >= maxCurricula) {break;}
      if (getCurriculum(c.id)) {continue;} // Already has one
      if (Math.random() > 0.3) {continue;}
      generateCurriculum(s, c.id);
      gen++;
    }
  }
}
