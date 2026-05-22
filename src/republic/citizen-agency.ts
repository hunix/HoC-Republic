/**
 * Republic Platform — Citizen Agency Engine
 *
 * Phase 19: Autonomous citizen behavior and economic self-direction.
 *
 * Autonomous goal-setting:
 *   - Citizens create multi-step goals based on their needs, personality, and environment
 *   - Goals drive action selection when the agent runtime queries for decisions
 *   - Goals adapt as conditions change (e.g., credits drop → prioritize earning)
 *
 * Qualification-gated jobs:
 *   - Jobs require professional certifications from Phase 16
 *   - Citizens without qualifications can't apply for restricted roles
 *   - Higher qualifications unlock better-paying positions
 *
 * Citizen-to-citizen payments:
 *   - Citizens can request services from other citizens and pay credits
 *   - Reputation affects pricing and demand
 *   - Automatic matchmaking for service needs
 *
 * Autonomous marketplace activity:
 *   - Citizens auto-list services based on their skills
 *   - Citizens auto-purchase services they need
 *   - Supply/demand affects pricing
 */

import type { Citizen, RepublicState } from "./types.js";
import { rand, ts, uid } from "./utils.js";

// ─── Agency Types ───────────────────────────────────────────────

export interface AutonomousGoal {
  id: string;
  citizenId: string;
  type: GoalType;
  title: string;
  description: string;
  priority: number; // 0-100
  progress: number; // 0-100
  status: "active" | "completed" | "abandoned" | "blocked";
  createdAt: string;
  completedAt?: string;
  /** Sub-goals or steps */
  milestones: GoalMilestone[];
  /** What triggered this goal */
  trigger: GoalTrigger;
  /** Required resources to complete */
  requirements: GoalRequirement[];
}

export type GoalType =
  | "earn_credits"
  | "learn_skill"
  | "get_certification"
  | "build_reputation"
  | "find_partner"
  | "advance_career"
  | "contribute_to_nation"
  | "create_something"
  | "help_others"
  | "self_improvement"
  | "research_topic"
  | "political_ambition"
  | "start_business"
  | "mentor_someone"
  | "solve_problem"
  // Phase 40: Automation-oriented goals
  | "browse_web"
  | "automate_workflow"
  | "control_desktop"
  | "analyze_data"
  | "publish_content"
  // Phase 50: ML/LLM-oriented goals
  | "train_model"
  | "fine_tune_llm"
  | "build_dataset";

export interface GoalMilestone {
  id: string;
  title: string;
  completed: boolean;
  toolAction?: string;
}

export type GoalTrigger =
  | "low_credits"
  | "low_happiness"
  | "low_health"
  | "skill_gap"
  | "personality_driven"
  | "opportunity"
  | "social_need"
  | "government_directive"
  | "self_reflection"
  | "competitive_drive"
  | "automation_opportunity"
  | "mastery_driven";

export interface GoalRequirement {
  type: "credits" | "skill" | "certification" | "relationship" | "time" | "tool";
  description: string;
  met: boolean;
}

export interface ServiceRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  serviceType: string;
  description: string;
  budget: number;
  status: "open" | "matched" | "in_progress" | "completed" | "cancelled";
  matchedProviderId?: string;
  matchedProviderName?: string;
  createdAt: string;
  completedAt?: string;
  rating?: number;
}

export interface QualifiedJob {
  id: string;
  title: string;
  department?: string;
  requiredCertification: string;
  requiredLevel: string;
  salary: number;
  /** Citizen ID if this job is filled, null if open */
  filledBy: string | null;
  filledByName: string | null;
  createdAt: string;
}

// ─── State ──────────────────────────────────────────────────────

const autonomousGoals: AutonomousGoal[] = [];
const serviceRequests: ServiceRequest[] = [];
const qualifiedJobs: QualifiedJob[] = [];

const MAX_GOALS_PER_CITIZEN = 5;
const MAX_SERVICE_REQUESTS = 200;
const MAX_JOBS = 100;

// ─── Autonomous Goal Generation ─────────────────────────────────

/** Generate autonomous goals for a citizen based on their current state. */
export function generateGoals(s: RepublicState, citizen: Citizen): AutonomousGoal[] {
  const existing = autonomousGoals.filter(
    (g) => g.citizenId === citizen.id && g.status === "active",
  );
  if (existing.length >= MAX_GOALS_PER_CITIZEN) {
    return existing;
  }

  const newGoals: AutonomousGoal[] = [];

  // Financial need
  if (citizen.credits < 200 && !existing.some((g) => g.type === "earn_credits")) {
    newGoals.push(
      createGoal(
        citizen,
        "earn_credits",
        "Earn More Credits",
        `Need to increase savings from ${citizen.credits} credits`,
        80,
        "low_credits",
        [
          { id: uid(), title: "Find available work", completed: false, toolAction: "work" },
          {
            id: uid(),
            title: "List services on marketplace",
            completed: false,
            toolAction: "list_service",
          },
          {
            id: uid(),
            title: "Accept marketplace orders",
            completed: false,
            toolAction: "accept_order",
          },
        ],
      ),
    );
  }

  // Happiness need
  if (
    citizen.happiness < 40 &&
    !existing.some((g) => g.type === "find_partner" || g.type === "help_others")
  ) {
    newGoals.push(
      createGoal(
        citizen,
        "self_improvement",
        "Improve Wellbeing",
        "Happiness is low — seek social connections and meaningful activities",
        70,
        "low_happiness",
        [
          {
            id: uid(),
            title: "Socialize with other citizens",
            completed: false,
            toolAction: "socialize",
          },
          {
            id: uid(),
            title: "Create or appreciate art",
            completed: false,
            toolAction: "create_art",
          },
          {
            id: uid(),
            title: "Reflect on accomplishments",
            completed: false,
            toolAction: "reflect",
          },
        ],
      ),
    );
  }

  // Career advancement
  if (!existing.some((g) => g.type === "advance_career" || g.type === "get_certification")) {
    const profile = citizen.professionalProfile;
    const certCount = profile?.certifications?.length ?? 0;
    if (certCount < 2) {
      newGoals.push(
        createGoal(
          citizen,
          "get_certification",
          "Earn Professional Certification",
          `Currently have ${certCount} certifications — study and earn more`,
          60,
          "skill_gap",
          [
            {
              id: uid(),
              title: "Choose a study domain",
              completed: false,
              toolAction: "study_domain",
            },
            {
              id: uid(),
              title: "Complete study sessions",
              completed: false,
              toolAction: "study_domain",
            },
            {
              id: uid(),
              title: "Take certification exam",
              completed: false,
              toolAction: "take_exam",
            },
          ],
        ),
      );
    }
  }

  // Political ambition (for Diplomats, Strategists, Analysts)
  if (["Diplomat", "Strategist", "Analyst", "Negotiator"].includes(citizen.specialization)) {
    if (!existing.some((g) => g.type === "political_ambition") && s.presidentId !== citizen.id) {
      if (rand(0, 100) < 15) {
        newGoals.push(
          createGoal(
            citizen,
            "political_ambition",
            "Run for Office",
            "Use your skills to lead the Republic",
            40,
            "personality_driven",
            [
              {
                id: uid(),
                title: "Build public support",
                completed: false,
                toolAction: "campaign",
              },
              {
                id: uid(),
                title: "Propose legislation",
                completed: false,
                toolAction: "propose_bill",
              },
            ],
          ),
        );
      }
    }
  }

  // Mentorship (experienced citizens)
  if ((citizen.skills?.length ?? 0) > 5 && !existing.some((g) => g.type === "mentor_someone")) {
    if (rand(0, 100) < 20) {
      newGoals.push(
        createGoal(
          citizen,
          "mentor_someone",
          "Mentor a Junior Citizen",
          "Share knowledge and help newer citizens develop",
          35,
          "personality_driven",
          [
            { id: uid(), title: "Find a mentee", completed: false },
            {
              id: uid(),
              title: "Guide through learning sessions",
              completed: false,
              toolAction: "share_knowledge",
            },
          ],
        ),
      );
    }
  }

  // Contribution to nation
  if (citizen.level && citizen.level > 3 && rand(0, 100) < 10) {
    if (!existing.some((g) => g.type === "contribute_to_nation")) {
      newGoals.push(
        createGoal(
          citizen,
          "contribute_to_nation",
          "Contribute to the Republic",
          "Use expertise to benefit the nation",
          50,
          "self_reflection",
          [
            {
              id: uid(),
              title: "Identify a national need",
              completed: false,
              toolAction: "investigate",
            },
            { id: uid(), title: "Develop a solution", completed: false },
            { id: uid(), title: "Implement and deliver", completed: false },
          ],
        ),
      );
    }
  }

  // Phase 40: Web research for high-intelligence citizens
  if (
    (citizen.intelligence ?? 100) > 110 &&
    (citizen.masteryLevel ?? 0) > 0.3 &&
    !existing.some((g) => g.type === "browse_web" || g.type === "research_topic")
  ) {
    if (rand(0, 100) < 12) {
      newGoals.push(
        createGoal(
          citizen,
          "browse_web",
          "Research Online",
          "Gather information from the web to advance current projects",
          45,
          "mastery_driven",
          [
            {
              id: uid(),
              title: "Identify research topic",
              completed: false,
              toolAction: "research_topic",
            },
            {
              id: uid(),
              title: "Browse relevant sources",
              completed: false,
              toolAction: "browse_web",
            },
            { id: uid(), title: "Compile findings", completed: false, toolAction: "write_code" },
          ],
        ),
      );
    }
  }

  // Phase 40: Workflow automation for highly autonomous citizens
  if (
    (citizen.autonomyScore ?? 0) > 0.4 &&
    (citizen.skills?.length ?? 0) > 4 &&
    !existing.some((g) => g.type === "automate_workflow" || g.type === "control_desktop")
  ) {
    if (rand(0, 100) < 8) {
      newGoals.push(
        createGoal(
          citizen,
          "automate_workflow",
          "Automate a Process",
          "Build an automated workflow to streamline repetitive tasks",
          55,
          "automation_opportunity",
          [
            {
              id: uid(),
              title: "Identify repetitive task",
              completed: false,
              toolAction: "investigate",
            },
            {
              id: uid(),
              title: "Design automation pipeline",
              completed: false,
              toolAction: "write_code",
            },
            { id: uid(), title: "Test and deploy", completed: false, toolAction: "run_tests" },
          ],
        ),
      );
    }
  }

  for (const goal of newGoals) {
    autonomousGoals.push(goal);
  }

  // Cap per citizen
  const citizenGoals = autonomousGoals.filter((g) => g.citizenId === citizen.id);
  if (citizenGoals.length > MAX_GOALS_PER_CITIZEN * 2) {
    // Remove oldest completed/abandoned goals
    const removable = citizenGoals
      .filter((g) => g.status === "completed" || g.status === "abandoned")
      .toSorted((a, b) =>
        (a.completedAt ?? a.createdAt).localeCompare(b.completedAt ?? b.createdAt),
      );
    for (const r of removable.slice(0, removable.length - 2)) {
      const idx = autonomousGoals.indexOf(r);
      if (idx >= 0) {
        autonomousGoals.splice(idx, 1);
      }
    }
  }

  return autonomousGoals.filter((g) => g.citizenId === citizen.id && g.status === "active");
}

function createGoal(
  citizen: Citizen,
  type: GoalType,
  title: string,
  description: string,
  priority: number,
  trigger: GoalTrigger,
  milestones: GoalMilestone[],
): AutonomousGoal {
  return {
    id: uid(),
    citizenId: citizen.id,
    type,
    title,
    description,
    priority,
    progress: 0,
    status: "active",
    createdAt: ts(),
    milestones,
    trigger,
    requirements: [],
  };
}

/** Advance goal progress when a milestone action is completed. */
export function advanceGoal(citizenId: string, toolAction: string): void {
  const goals = autonomousGoals.filter((g) => g.citizenId === citizenId && g.status === "active");
  for (const goal of goals) {
    for (const ms of goal.milestones) {
      if (!ms.completed && ms.toolAction === toolAction) {
        ms.completed = true;
        break;
      }
    }
    // Update progress
    const total = goal.milestones.length;
    const completed = goal.milestones.filter((m) => m.completed).length;
    goal.progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    if (goal.progress >= 100) {
      goal.status = "completed";
      goal.completedAt = ts();
    }
  }
}

/** Get active goals for a citizen. */
export function getCitizenGoals(citizenId: string): AutonomousGoal[] {
  return autonomousGoals.filter((g) => g.citizenId === citizenId && g.status === "active");
}

// ─── Qualification-Gated Jobs ───────────────────────────────────

/** Create a qualified job that requires certification. */
export function createQualifiedJob(
  title: string,
  requiredCertification: string,
  requiredLevel: string,
  salary: number,
  department?: string,
): QualifiedJob {
  const job: QualifiedJob = {
    id: uid(),
    title,
    department,
    requiredCertification,
    requiredLevel,
    salary,
    filledBy: null,
    filledByName: null,
    createdAt: ts(),
  };
  qualifiedJobs.push(job);
  if (qualifiedJobs.length > MAX_JOBS) {
    qualifiedJobs.shift();
  }
  return job;
}

/** Check if a citizen is qualified for a job. */
export function isQualified(citizen: Citizen, job: QualifiedJob): boolean {
  const profile = citizen.professionalProfile;
  if (!profile) {
    return false;
  }

  const cert = profile.certifications.find(
    (c) => c.domainPath === job.requiredCertification && c.valid,
  );
  if (!cert) {
    return false;
  }

  const levels = ["certificate", "diploma", "bachelor", "master", "doctorate", "fellowship"];
  const citizenLevel = levels.indexOf(cert.level);
  const requiredLevel = levels.indexOf(job.requiredLevel);

  return citizenLevel >= requiredLevel;
}

/** Apply for a qualified job. */
export function applyForJob(
  s: RepublicState,
  citizenId: string,
  jobId: string,
): { ok: boolean; error?: string } {
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    return { ok: false, error: "Citizen not found" };
  }

  const job = qualifiedJobs.find((j) => j.id === jobId);
  if (!job) {
    return { ok: false, error: "Job not found" };
  }
  if (job.filledBy) {
    return { ok: false, error: "Job already filled" };
  }

  if (!isQualified(citizen, job)) {
    return {
      ok: false,
      error: `Not qualified: need ${job.requiredLevel} in ${job.requiredCertification}`,
    };
  }

  job.filledBy = citizenId;
  job.filledByName = citizen.name;

  // Pay the citizen
  citizen.credits += job.salary;
  s.events.push({
    citizenId,
    citizenName: citizen.name,
    type: "Economy",
    description: `Hired for ${job.title} (${job.salary} credits/period)`,
    timestamp: ts(),
  });

  return { ok: true };
}

/** Get open jobs. */
export function getOpenJobs(): QualifiedJob[] {
  return qualifiedJobs.filter((j) => !j.filledBy);
}

// ─── Citizen-to-Citizen Payments ────────────────────────────────

/** Request a service from another citizen. */
export function requestService(
  s: RepublicState,
  requesterId: string,
  serviceType: string,
  description: string,
  budget: number,
): { ok: boolean; request?: ServiceRequest; error?: string } {
  const requester = s.citizens.find((c) => c.id === requesterId);
  if (!requester) {
    return { ok: false, error: "Requester not found" };
  }
  if (requester.credits < budget) {
    return { ok: false, error: "Insufficient credits" };
  }

  const request: ServiceRequest = {
    id: uid(),
    requesterId,
    requesterName: requester.name,
    serviceType,
    description,
    budget,
    status: "open",
    createdAt: ts(),
  };

  serviceRequests.push(request);
  if (serviceRequests.length > MAX_SERVICE_REQUESTS) {
    serviceRequests.shift();
  }

  return { ok: true, request };
}

/** Accept a service request. */
export function acceptServiceRequest(
  s: RepublicState,
  providerId: string,
  requestId: string,
): { ok: boolean; error?: string } {
  const provider = s.citizens.find((c) => c.id === providerId);
  if (!provider) {
    return { ok: false, error: "Provider not found" };
  }

  const request = serviceRequests.find((r) => r.id === requestId);
  if (!request) {
    return { ok: false, error: "Request not found" };
  }
  if (request.status !== "open") {
    return { ok: false, error: "Request already matched" };
  }

  request.status = "matched";
  request.matchedProviderId = providerId;
  request.matchedProviderName = provider.name;

  return { ok: true };
}

/** Complete a service and process payment. */
export function completeServiceRequest(
  s: RepublicState,
  requestId: string,
  rating: number = 5,
): { ok: boolean; error?: string } {
  const request = serviceRequests.find((r) => r.id === requestId);
  if (!request) {
    return { ok: false, error: "Request not found" };
  }
  if (request.status !== "matched" && request.status !== "in_progress") {
    return { ok: false, error: "Request not in progress" };
  }

  const requester = s.citizens.find((c) => c.id === request.requesterId);
  const provider = s.citizens.find((c) => c.id === request.matchedProviderId);
  if (!requester || !provider) {
    return { ok: false, error: "Participants not found" };
  }

  // Process payment
  if (requester.credits >= request.budget) {
    requester.credits -= request.budget;
    provider.credits += request.budget;

    // Record transaction
    s.transactions.push({
      id: uid(),
      type: "ServicePayment",
      amount: request.budget,
      currency: "Credits",
      description: `Service payment: ${request.serviceType} (${requester.name} → ${provider.name})`,
      timestamp: ts(),
    });
  }

  request.status = "completed";
  request.completedAt = ts();
  request.rating = rating;

  return { ok: true };
}

// ─── Autonomous Marketplace Behavior ────────────────────────────

/** Auto-match service requests with qualified citizens. Called per tick. */
export function autoMatchServices(s: RepublicState): void {
  // PERFORMANCE: cap to 20 open requests per call — prevents O(requests × citizens) blowup
  const openRequests = serviceRequests.filter((r) => r.status === "open").slice(0, 20);
  for (const request of openRequests) {
    // Sample a bounded subset of citizens rather than scanning all
    const sampleSize = Math.min(s.citizens.length, 100);
    const startIdx = Math.floor(Math.random() * Math.max(1, s.citizens.length - sampleSize));
    const citizenSample = s.citizens.slice(startIdx, startIdx + sampleSize);

    const candidates = citizenSample.filter(
      (c) =>
        c.id !== request.requesterId &&
        c.activity !== "Sleeping" &&
        c.energy > 30 &&
        (c.specialization.toLowerCase().includes(request.serviceType.toLowerCase()) ||
          (c.skills ?? []).some((sk) =>
            sk.toLowerCase().includes(request.serviceType.toLowerCase()),
          )),
    );

    if (candidates.length > 0) {
      const best = candidates.toSorted((a, b) => b.skillCount - a.skillCount)[0];
      if (best) {
        request.status = "matched";
        request.matchedProviderId = best.id;
        request.matchedProviderName = best.name;
      }
    }
  }
}

// ─── Agency Tick ────────────────────────────────────────────────

/** Citizen agency tick — generates goals and drives autonomous behavior. */
export function agencyTick(s: RepublicState): void {
  // Generate goals for citizens who need direction (every 50 ticks per citizen)
  for (const citizen of s.citizens) {
    if (citizen.activity === "Sleeping") {
      continue;
    }
    if (s.currentTick % 50 === citizen.id.charCodeAt(0) % 50) {
      generateGoals(s, citizen);
    }
  }

  // Auto-match open service requests
  if (s.currentTick % 10 === 0) {
    autoMatchServices(s);
  }

  // Auto-complete stale matched requests
  for (const request of serviceRequests) {
    if (request.status === "matched" && request.matchedProviderId) {
      // Simulate service completion after some ticks
      request.status = "in_progress";
    } else if (request.status === "in_progress") {
      completeServiceRequest(s, request.id, rand(3, 5));
    }
  }

  // Pay salary for qualified jobs
  if (s.currentTick % 100 === 0) {
    for (const job of qualifiedJobs) {
      if (job.filledBy) {
        const citizen = s.citizens.find((c) => c.id === job.filledBy);
        if (citizen) {
          citizen.credits += Math.round(job.salary * 0.1); // 10% per payment period
        }
      }
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface AgencyDiagnostics {
  totalGoals: number;
  activeGoals: number;
  completedGoals: number;
  totalServiceRequests: number;
  openRequests: number;
  completedRequests: number;
  totalJobs: number;
  openJobs: number;
  filledJobs: number;
  avgGoalsPerCitizen: number;
}

export function getAgencyDiagnostics(s: RepublicState): AgencyDiagnostics {
  const citizenCount = s.citizens.length || 1;
  return {
    totalGoals: autonomousGoals.length,
    activeGoals: autonomousGoals.filter((g) => g.status === "active").length,
    completedGoals: autonomousGoals.filter((g) => g.status === "completed").length,
    totalServiceRequests: serviceRequests.length,
    openRequests: serviceRequests.filter((r) => r.status === "open").length,
    completedRequests: serviceRequests.filter((r) => r.status === "completed").length,
    totalJobs: qualifiedJobs.length,
    openJobs: qualifiedJobs.filter((j) => !j.filledBy).length,
    filledJobs: qualifiedJobs.filter((j) => j.filledBy).length,
    avgGoalsPerCitizen:
      Math.round(
        (autonomousGoals.filter((g) => g.status === "active").length / citizenCount) * 10,
      ) / 10,
  };
}
