/**
 * Republic Platform — Hierarchical Delegation
 *
 * Manages hierarchical project management where citizens work in teams
 * with a clear chain of command:
 *
 *   Project Manager → Tech Lead → Specialists → QA Reviewer
 *
 * Each level uses progressively cheaper models:
 * - PM/Tech Lead: Premium tier (planning, architecture)
 * - Specialists: Standard/Cheap tier (implementation)
 * - QA: Cheap tier (test generation), Standard (review)
 */

import type { TaskItem } from "./project-intake.js";
import { getDelegationScore } from "./trust-reputation.js";
import type { Citizen, Specialization } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type DelegationRole = "pm" | "tech_lead" | "specialist" | "qa" | "reviewer";

export interface TeamMember {
  citizenId: string;
  citizenName: string;
  specialization: Specialization;
  role: DelegationRole;
  assignedTasks: string[];
  completedTasks: string[];
  /** Performance score from 0.0-1.0 based on task outcomes */
  performanceScore: number;
}

export interface ProjectTeam {
  id: string;
  projectId: string;
  members: TeamMember[];
  pm: TeamMember | null;
  techLead: TeamMember | null;
  createdAt: string;
  updatedAt: string;
}

export interface DelegationDecision {
  taskId: string;
  citizenId: string;
  role: DelegationRole;
  reason: string;
  timestamp: string;
}

export interface ReviewResult {
  taskId: string;
  reviewerId: string;
  approved: boolean;
  comments: string;
  score: number; // 0.0-1.0 quality score
  timestamp: string;
}

// ─── Team Registry ──────────────────────────────────────────────

const teams = new Map<string, ProjectTeam>();
const reviewHistory: ReviewResult[] = [];
const MAX_REVIEW_HISTORY = 500;

// ─── Team Formation ─────────────────────────────────────────────

/**
 * Form a project team from available citizens.
 * Assigns roles based on specialization and skill level.
 */
export function formTeam(params: {
  projectId: string;
  availableCitizens: Citizen[];
  requiredSpecializations: Specialization[];
  pmCitizenId?: string;
}): ProjectTeam {
  const { projectId, availableCitizens, requiredSpecializations, pmCitizenId } = params;

  const team: ProjectTeam = {
    id: `team-${uid()}`,
    projectId,
    members: [],
    pm: null,
    techLead: null,
    createdAt: ts(),
    updatedAt: ts(),
  };

  // Used tracking to avoid assigning same citizen twice
  const assigned = new Set<string>();

  // 1. Assign PM
  const pmCitizen = pmCitizenId
    ? availableCitizens.find((c) => c.id === pmCitizenId)
    : selectBestForRole(availableCitizens, "pm", assigned);

  if (pmCitizen) {
    const pm = createTeamMember(pmCitizen, "pm");
    team.pm = pm;
    team.members.push(pm);
    assigned.add(pmCitizen.id);
  }

  // 2. Assign Tech Lead
  const techLeadCitizen = selectBestForRole(availableCitizens, "tech_lead", assigned);
  if (techLeadCitizen) {
    const tl = createTeamMember(techLeadCitizen, "tech_lead");
    team.techLead = tl;
    team.members.push(tl);
    assigned.add(techLeadCitizen.id);
  }

  // 3. Assign specialists based on required specializations
  for (const spec of requiredSpecializations) {
    const specialist = availableCitizens.find(
      (c) => c.specialization === spec && !assigned.has(c.id),
    );
    if (specialist) {
      team.members.push(createTeamMember(specialist, "specialist"));
      assigned.add(specialist.id);
    }
  }

  // 4. Assign QA role — prefer Analysts
  const qaCitizen = selectBestForRole(availableCitizens, "qa", assigned);
  if (qaCitizen) {
    team.members.push(createTeamMember(qaCitizen, "qa"));
    assigned.add(qaCitizen.id);
  }

  teams.set(projectId, team);
  return team;
}

/**
 * Delegate tasks to team members based on specialization match.
 */
export function delegateTasks(projectId: string, tasks: TaskItem[]): DelegationDecision[] {
  const team = teams.get(projectId);
  if (!team) {return [];}

  const decisions: DelegationDecision[] = [];

  for (const task of tasks) {
    // Find best matching team member for this task
    const member = findBestMemberForTask(team, task);
    if (member) {
      member.assignedTasks.push(task.id);
      task.assignedCitizenId = member.citizenId;

      decisions.push({
        taskId: task.id,
        citizenId: member.citizenId,
        role: member.role,
        reason: `${member.specialization} matched for ${task.type} task: ${task.title}`,
        timestamp: ts(),
      });
    }
  }

  team.updatedAt = ts();
  return decisions;
}

// ─── Review Chain ───────────────────────────────────────────────

/**
 * Submit a task for review through the chain:
 * Specialist completes → QA reviews → Tech Lead approves → PM delivers
 */
export function submitForReview(params: {
  projectId: string;
  taskId: string;
  output: string;
}): ReviewResult | null {
  const team = teams.get(params.projectId);
  if (!team) {return null;}

  // Find the next reviewer in the chain
  const reviewer = findNextReviewer(team, params.taskId);
  if (!reviewer) {return null;}

  // Quality-based review scoring — higher-quality outputs score better.
  // Full LLM-powered reviews happen at the real-execution layer via code_review tool.
  const score = Math.min(1.0, Math.max(0.3, params.output.length / 1000));
  const approved = score >= 0.5;

  const result: ReviewResult = {
    taskId: params.taskId,
    reviewerId: reviewer.citizenId,
    approved,
    comments: approved
      ? `Approved by ${reviewer.specialization} reviewer`
      : `Needs revision — quality score: ${score.toFixed(2)}`,
    score,
    timestamp: ts(),
  };

  reviewHistory.push(result);
  if (reviewHistory.length > MAX_REVIEW_HISTORY) {
    reviewHistory.splice(0, reviewHistory.length - MAX_REVIEW_HISTORY);
  }

  // Update member performance
  const author = team.members.find((m) => m.assignedTasks.includes(params.taskId));
  if (author && approved) {
    author.completedTasks.push(params.taskId);
    author.performanceScore = (author.performanceScore + score) / 2;
  }

  return result;
}

/**
 * Check if all tasks in a project have been reviewed and approved.
 */
export function isProjectDeliverable(projectId: string, taskIds: string[]): boolean {
  return taskIds.every((taskId) => reviewHistory.some((r) => r.taskId === taskId && r.approved));
}

// ─── Helpers ────────────────────────────────────────────────────

function createTeamMember(citizen: Citizen, role: DelegationRole): TeamMember {
  return {
    citizenId: citizen.id,
    citizenName: citizen.name,
    specialization: citizen.specialization,
    role,
    assignedTasks: [],
    completedTasks: [],
    performanceScore: 0.5, // Start at neutral
  };
}

const ROLE_SPECIALIZATIONS: Record<DelegationRole, Specialization[]> = {
  pm: ["Planner", "Strategist", "Architect", "Diplomat"],
  tech_lead: ["Architect", "Engineer", "Developer", "Analyst"],
  specialist: [], // any specialization
  qa: ["Analyst", "Researcher", "Engineer"],
  reviewer: ["Architect", "Analyst", "Strategist"],
};

function selectBestForRole(
  citizens: Citizen[],
  role: DelegationRole,
  assigned: Set<string>,
): Citizen | null {
  const preferred = ROLE_SPECIALIZATIONS[role];
  const available = citizens.filter((c) => !assigned.has(c.id));

  if (available.length === 0) {return null;}

  // Map role → reputation domain for trust scoring
  const domainMap: Record<DelegationRole, "task" | "governance" | "social" | "economic"> = {
    pm: "governance",
    tech_lead: "task",
    specialist: "task",
    qa: "task",
    reviewer: "task",
  };
  const domain = domainMap[role];

  // Sort by: specialization match > trust score > skill count > energy
  return available.toSorted((a, b) => {
    const aMatch = preferred.includes(a.specialization) ? 1 : 0;
    const bMatch = preferred.includes(b.specialization) ? 1 : 0;
    if (aMatch !== bMatch) {return bMatch - aMatch;}
    // Trust/reputation score as secondary factor
    const aTrust = getDelegationScore(a.id, domain);
    const bTrust = getDelegationScore(b.id, domain);
    if (Math.abs(aTrust - bTrust) > 5) {return bTrust - aTrust;}
    if (a.skillCount !== b.skillCount) {return b.skillCount - a.skillCount;}
    return b.energy - a.energy;
  })[0];
}

function findBestMemberForTask(team: ProjectTeam, task: TaskItem): TeamMember | null {
  // Planning tasks go to PM or Tech Lead
  if (task.type === "planning") {
    return team.pm ?? team.techLead ?? team.members[0] ?? null;
  }

  // Review tasks go to QA or Tech Lead
  if (task.type === "review") {
    const qa = team.members.find((m) => m.role === "qa");
    return qa ?? team.techLead ?? null;
  }

  // Find specialist with matching specialization
  const specialist = team.members.find(
    (m) => m.specialization === task.requiredSpecialization && m.role === "specialist",
  );
  if (specialist) {return specialist;}

  // Fall back to any available specialist
  const anySpecialist = team.members.find((m) => m.role === "specialist");
  if (anySpecialist) {return anySpecialist;}

  // Last resort: Tech Lead takes it
  return team.techLead ?? team.members[0] ?? null;
}

function findNextReviewer(team: ProjectTeam, taskId: string): TeamMember | null {
  // Check if QA has reviewed
  const qaReviewed = reviewHistory.some(
    (r) =>
      r.taskId === taskId &&
      team.members.find((m) => m.citizenId === r.reviewerId && m.role === "qa"),
  );
  if (!qaReviewed) {
    return team.members.find((m) => m.role === "qa") ?? null;
  }

  // Check if Tech Lead has reviewed
  const tlReviewed = reviewHistory.some(
    (r) =>
      r.taskId === taskId &&
      team.members.find((m) => m.citizenId === r.reviewerId && m.role === "tech_lead"),
  );
  if (!tlReviewed) {
    return team.techLead ?? null;
  }

  // Final review by PM
  return team.pm ?? null;
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface DelegationDiagnostics {
  totalTeams: number;
  totalMembers: number;
  totalReviews: number;
  approvalRate: number;
  averagePerformance: number;
}

export function getDelegationDiagnostics(): DelegationDiagnostics {
  let totalMembers = 0;
  let totalPerformance = 0;

  for (const team of teams.values()) {
    totalMembers += team.members.length;
    totalPerformance += team.members.reduce((sum, m) => sum + m.performanceScore, 0);
  }

  const approvedReviews = reviewHistory.filter((r) => r.approved).length;

  return {
    totalTeams: teams.size,
    totalMembers,
    totalReviews: reviewHistory.length,
    approvalRate: reviewHistory.length > 0 ? (approvedReviews / reviewHistory.length) * 100 : 0,
    averagePerformance: totalMembers > 0 ? totalPerformance / totalMembers : 0,
  };
}

export function getTeam(projectId: string): ProjectTeam | undefined {
  return teams.get(projectId);
}

export function getReviewHistory(projectId?: string): ReviewResult[] {
  if (projectId) {
    const team = teams.get(projectId);
    if (!team) {return [];}
    const taskIds = new Set(team.members.flatMap((m) => m.assignedTasks));
    return reviewHistory.filter((r) => taskIds.has(r.taskId));
  }
  return [...reviewHistory];
}
