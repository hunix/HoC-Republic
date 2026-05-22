/**
 * Republic Platform — Agent Delegation Engine
 *
 * Enables citizens to delegate tasks to other citizens based on
 * specialization matching, skill requirements, and availability.
 *
 * Features:
 *  - Task queue with priority scheduling
 *  - Specialization-based routing
 *  - Multi-hop delegation chains
 *  - Completion tracking and feedback
 *  - Mentorship pairing
 *  - Collaborative task splitting
 */

import { addEpisodicMemory } from "./memory.js";
import type { Citizen, RepublicState } from "./types.js";
import { pick, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type TaskPriority = "low" | "medium" | "high" | "critical";
type TaskStatus = "queued" | "assigned" | "in_progress" | "completed" | "failed";

interface DelegatedTask {
  id: string;
  title: string;
  description: string;
  delegatorId: string;
  delegatorName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  requiredSpecialization: string | null;
  requiredSkills: string[];
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  quality: number; // 0.0-1.0
  energyCost: number;
  creditReward: number;
  chainDepth: number; // how many times this was re-delegated
  parentTaskId: string | null; // for task splitting
}

interface MentorshipPair {
  mentorId: string;
  mentorName: string;
  menteeId: string;
  menteeName: string;
  domain: string;
  startedAt: string;
  sessionsCompleted: number;
  skillsTransferred: string[];
}

// ─── State ──────────────────────────────────────────────────────

const taskQueue: DelegatedTask[] = [];
const completedTasks: DelegatedTask[] = [];
const mentorships: MentorshipPair[] = [];
const MAX_QUEUE = 200;
const MAX_COMPLETED = 500;
const MAX_MENTORSHIPS = 50;

// ─── Task Delegation ────────────────────────────────────────────

/**
 * Create a delegated task and add it to the queue.
 */
export function delegateTask(
  delegator: Citizen,
  title: string,
  description: string,
  priority: TaskPriority = "medium",
  requiredSpec: string | null = null,
  requiredSkills: string[] = [],
): DelegatedTask {
  const task: DelegatedTask = {
    id: uid(),
    title,
    description,
    delegatorId: delegator.id,
    delegatorName: delegator.name,
    assigneeId: null,
    assigneeName: null,
    requiredSpecialization: requiredSpec,
    requiredSkills,
    priority,
    status: "queued",
    createdAt: ts(),
    startedAt: null,
    completedAt: null,
    quality: 0,
    energyCost:
      priority === "critical" ? 15 : priority === "high" ? 10 : priority === "medium" ? 7 : 4,
    creditReward:
      priority === "critical" ? 100 : priority === "high" ? 60 : priority === "medium" ? 35 : 15,
    chainDepth: 0,
    parentTaskId: null,
  };

  taskQueue.push(task);
  if (taskQueue.length > MAX_QUEUE) {
    taskQueue.splice(0, taskQueue.length - MAX_QUEUE);
  }

  return task;
}

/**
 * Find the best citizen to assign a task to.
 */
function findBestAssignee(task: DelegatedTask, s: RepublicState): Citizen | null {
  const candidates = s.citizens.filter(
    (c) =>
      c.id !== task.delegatorId &&
      c.energy >= task.energyCost + 10 &&
      c.activity !== "Sleeping" &&
      (task.requiredSpecialization === null || c.specialization === task.requiredSpecialization),
  );

  if (candidates.length === 0) {
    return null;
  }

  // Score candidates by skill match and availability
  const scored = candidates.map((c) => {
    let score = 0;

    // Skill match bonus
    const citizenSkills = new Set(c.skills ?? []);
    for (const skill of task.requiredSkills) {
      if (citizenSkills.has(skill)) {
        score += 0.2;
      }
    }

    // Energy/availability bonus
    score += c.energy / 200;

    // Skill count (general competence) bonus
    score += c.skillCount * 0.05;

    // Happiness bonus (happy workers do better)
    score += c.happiness / 300;

    return { citizen: c, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.citizen ?? null;
}

/**
 * Assign pending tasks to available citizens.
 */
function assignTasks(s: RepublicState): void {
  const pending = taskQueue
    .filter((t) => t.status === "queued")
    .toSorted((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  for (const task of pending.slice(0, 5)) {
    // process up to 5 per tick
    const assignee = findBestAssignee(task, s);
    if (assignee) {
      task.assigneeId = assignee.id;
      task.assigneeName = assignee.name;
      task.status = "assigned";
      task.startedAt = ts();

      // Event
      s.events.push({
        citizenId: assignee.id,
        citizenName: assignee.name,
        type: "Other",
        description: `📋 ${assignee.name} accepted delegated task: "${task.title}" (${task.priority}) from ${task.delegatorName}`,
        timestamp: ts(),
      });
    }
  }
}

/**
 * Process assigned tasks — simulate work and completion.
 */
function processTasks(s: RepublicState): void {
  const inProgress = taskQueue.filter((t) => t.status === "assigned" || t.status === "in_progress");

  for (const task of inProgress) {
    task.status = "in_progress";

    const assignee = s.citizens.find((c) => c.id === task.assigneeId);
    if (!assignee) {
      continue;
    }

    // Completion check — based on skill and energy
    const completionChance = 0.3 + assignee.skillCount * 0.05 + assignee.energy / 200;
    if (rng() < completionChance) {
      // Task completed
      const quality = Math.min(1, 0.4 + assignee.skillCount * 0.08 + rng() * 0.3);
      task.quality = quality;
      task.status = "completed";
      task.completedAt = ts();

      // Reward assignee
      assignee.credits += Math.floor(task.creditReward * quality);
      assignee.energy = Math.max(5, assignee.energy - task.energyCost);
      assignee.happiness = Math.min(100, assignee.happiness + 4);

      // Memory for both parties
      addEpisodicMemory(assignee.id, {
        tick: s.currentTick,
        timestamp: ts(),
        description: `Completed delegated task "${task.title}" for ${task.delegatorName} — quality ${(quality * 100).toFixed(0)}%`,
        valence: 0.8,
        importance: task.priority === "critical" ? 0.9 : 0.6,
        involvedCitizenIds: [task.delegatorId],
        tags: ["delegation", "completed", task.priority],
      });

      addEpisodicMemory(task.delegatorId, {
        tick: s.currentTick,
        timestamp: ts(),
        description: `${assignee.name} completed my delegated task "${task.title}" — quality ${(quality * 100).toFixed(0)}%`,
        valence: quality > 0.7 ? 0.8 : 0.5,
        importance: 0.6,
        involvedCitizenIds: [assignee.id],
        tags: ["delegation", "received"],
      });

      // Move to completed
      const idx = taskQueue.indexOf(task);
      if (idx !== -1) {
        taskQueue.splice(idx, 1);
      }
      completedTasks.push(task);
      if (completedTasks.length > MAX_COMPLETED) {
        completedTasks.splice(0, completedTasks.length - MAX_COMPLETED);
      }

      s.events.push({
        citizenId: assignee.id,
        citizenName: assignee.name,
        type: "Achievement",
        description: `✅ ${assignee.name} completed "${task.title}" for ${task.delegatorName} (quality: ${(quality * 100).toFixed(0)}%)`,
        timestamp: ts(),
      });
    } else {
      // Still working — consume some energy
      assignee.energy = Math.max(5, assignee.energy - 1);
      assignee.activity = "Working";
    }
  }
}

// ─── Mentorship System ──────────────────────────────────────────

/**
 * Auto-pair mentors with mentees based on skill gaps and expertise.
 */
function autoMentor(s: RepublicState): void {
  if (rng() > 0.05) {
    return;
  } // 5% chance per tick

  // Find a citizen with high skills (mentor candidate)
  const mentorCandidates = s.citizens.filter(
    (c) => c.skillCount >= 5 && c.energy >= 20 && c.activity !== "Sleeping",
  );
  if (mentorCandidates.length === 0) {
    return;
  }

  // Find a citizen with low skills in the same specialization
  const mentor = pick(mentorCandidates);
  const menteeCandidates = s.citizens.filter(
    (c) =>
      c.id !== mentor.id &&
      c.specialization === mentor.specialization &&
      c.skillCount < mentor.skillCount &&
      c.energy >= 15,
  );

  if (menteeCandidates.length === 0) {
    return;
  }
  const mentee = pick(menteeCandidates);

  // Check not already paired
  if (mentorships.some((m) => m.mentorId === mentor.id && m.menteeId === mentee.id)) {
    return;
  }

  const pair: MentorshipPair = {
    mentorId: mentor.id,
    mentorName: mentor.name,
    menteeId: mentee.id,
    menteeName: mentee.name,
    domain: mentor.specialization,
    startedAt: ts(),
    sessionsCompleted: 0,
    skillsTransferred: [],
  };

  mentorships.push(pair);
  if (mentorships.length > MAX_MENTORSHIPS) {
    mentorships.splice(0, mentorships.length - MAX_MENTORSHIPS);
  }

  s.events.push({
    citizenId: mentor.id,
    citizenName: mentor.name,
    type: "KnowledgeShared",
    description: `🎓 ${mentor.name} began mentoring ${mentee.name} in ${mentor.specialization}`,
    timestamp: ts(),
  });
}

/**
 * Progress mentorship sessions — transfer skills over time.
 */
function progressMentorships(s: RepublicState): void {
  for (const pair of mentorships) {
    if (rng() > 0.15) {
      continue;
    } // 15% chance per tick to have a session

    const mentor = s.citizens.find((c) => c.id === pair.mentorId);
    const mentee = s.citizens.find((c) => c.id === pair.menteeId);
    if (!mentor || !mentee) {
      continue;
    }
    if (mentor.energy < 10 || mentee.energy < 10) {
      continue;
    }

    pair.sessionsCompleted++;

    // Skill transfer
    const mentorSkills = new Set(mentor.skills ?? []);
    const menteeSkills = new Set(mentee.skills ?? []);
    const transferable = [...mentorSkills].filter((sk) => !menteeSkills.has(sk));

    if (transferable.length > 0 && rng() < 0.4) {
      const skill = transferable[0];
      mentee.skills = [...(mentee.skills ?? []), skill];
      mentee.skillCount = mentee.skills.length;
      pair.skillsTransferred.push(skill);

      // Energy cost
      mentor.energy = Math.max(5, mentor.energy - 5);
      mentee.energy = Math.max(5, mentee.energy - 3);

      // Both gain happiness
      mentor.happiness = Math.min(100, mentor.happiness + 3);
      mentee.happiness = Math.min(100, mentee.happiness + 5);
      mentor.credits += 15;
      mentee.credits += 5;

      s.events.push({
        citizenId: mentee.id,
        citizenName: mentee.name,
        type: "SkillLearned",
        description: `📖 ${mentee.name} learned "${skill}" from mentor ${mentor.name} (session ${pair.sessionsCompleted})`,
        timestamp: ts(),
      });
    }
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * Run the delegation engine for one tick.
 */
export function delegationTick(s: RepublicState): void {
  assignTasks(s);
  processTasks(s);
  autoMentor(s);
  progressMentorships(s);
}

// ─── Query Functions ────────────────────────────────────────────

export function getDelegationDiagnostics(): {
  queuedTasks: number;
  activeTasks: number;
  completedTotal: number;
  avgQuality: number;
  activeMentorships: number;
  totalSkillsTransferred: number;
} {
  const active = taskQueue.filter((t) => t.status === "in_progress").length;
  const queued = taskQueue.filter((t) => t.status === "queued").length;
  const avgQ =
    completedTasks.length > 0
      ? completedTasks.reduce((sum, t) => sum + t.quality, 0) / completedTasks.length
      : 0;
  const totalSkills = mentorships.reduce((sum, m) => sum + m.skillsTransferred.length, 0);

  return {
    queuedTasks: queued,
    activeTasks: active,
    completedTotal: completedTasks.length,
    avgQuality: avgQ,
    activeMentorships: mentorships.length,
    totalSkillsTransferred: totalSkills,
  };
}

export function getActiveMentorships(): MentorshipPair[] {
  return [...mentorships];
}

export function getRecentCompletedTasks(limit = 20): DelegatedTask[] {
  return completedTasks.slice(-limit);
}
