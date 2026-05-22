/**
 * Republic Platform — Meta-Working Orchestration Engine
 *
 * Connects citizen autonomy, economy, skill library, capability graph,
 * and project intake into a unified autonomous workforce simulation.
 *
 * Five subsystems:
 * 1. Work Discovery Agent — scans gaps, tasks, marketplace for high-value work
 * 2. Revenue Strategy Engine — prioritizes by revenue potential per citizen
 * 3. Deep Mastery Tracker — proficiency curves, ZPD, deliberate practice
 * 4. Proactive Work Generator — creates internal work when idle
 * 5. Workforce Analytics — real-time metrics
 *
 * Research basis:
 * - Google DeepMind SIMA (2024): multi-agent workforce coordination
 * - OpenAI Swarm (2024): handoff-based agent orchestration
 * - "Economies of Minds" (2023): self-resource allocation
 * - Ericsson-style cognitive load balancing
 * - Zone of Proximal Development (Vygotsky) for mastery scheduling
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { searchListings, createTaskOffer, economyAgencyDiagnostics } from "./autonomous-economy.js";
import { detectGaps } from "./cognition/meta-capability-graph.js";
import { listProjects } from "./republic-db.js";
import type { Citizen, RepublicState } from "./types.js";
import { rng, ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:meta-working");

// ─── Types ──────────────────────────────────────────────────────

export type WorkType =
  | "task_bid"
  | "marketplace"
  | "project"
  | "research"
  | "teaching"
  | "self_improvement"
  | "tool_creation"
  | "content_production";

export interface WorkAssignment {
  id: string;
  citizenId: string;
  citizenName: string;
  workType: WorkType;
  description: string;
  targetId: string;
  estimatedRevenue: number;
  estimatedMasteryGain: number;
  priority: number;
  assignedAtTick: number;
  completedAtTick?: number;
  status: "active" | "completed" | "abandoned";
}

export interface DomainMastery {
  domain: string;
  proficiency: number;
  ticksInvested: number;
  proficiencyCurve: number[];
  zpd: string[];
  certifications: string[];
  lastPracticeTick: number;
}

export interface MasteryProfile {
  citizenId: string;
  citizenName: string;
  specialization: string;
  domains: Record<string, DomainMastery>;
  overallMastery: number;
  learningVelocity: number;
  revenuePerTick: number;
  totalRevenue: number;
  workCompleted: number;
  workActive: number;
}

export interface WorkOpportunity {
  id: string;
  type: WorkType;
  description: string;
  requiredSkills: string[];
  estimatedRevenue: number;
  estimatedMasteryGain: number;
  priority: number;
  availableSince: number;
}

export interface WorkforceMetrics {
  totalCitizens: number;
  activeWorkers: number;
  idleWorkers: number;
  totalRevenueGenerated: number;
  revenueThisCycle: number;
  averageMastery: number;
  topMasteryDomain: string;
  capabilityGaps: number;
  openOpportunities: number;
  completedAssignments: number;
  activeAssignments: number;
  masteryVelocity: number;
  specializationCoverage: Record<string, number>;
}

// ─── State ──────────────────────────────────────────────────────

const assignments = new Map<string, WorkAssignment>();
const masteryProfiles = new Map<string, MasteryProfile>();
const opportunities: WorkOpportunity[] = [];
let totalRevenueGenerated = 0;
let cycleRevenue = 0;
let lastWorkDiscoveryTick = 0;

const MAX_ASSIGNMENTS = 2000;
const MAX_OPPORTUNITIES = 500;
const WORK_DISCOVERY_INTERVAL = 5;
const MASTERY_SAMPLE_INTERVAL = 10;
const MAX_MASTERY_CURVE_SAMPLES = 50;
const ZPD_LOW = 0.3;
const ZPD_HIGH = 0.7;

// ─── 1. Work Discovery Agent ───────────────────────────────────

/**
 * Scan all available work sources and generate opportunities.
 * Sources: capability gaps, marketplace demand, open projects, idle detection.
 */
function discoverWork(s: RepublicState): void {
  opportunities.length = 0;

  // Source 1: Capability graph gaps → teaching/training opportunities
  const gaps = detectGaps();
  for (const gap of gaps.slice(0, 10)) {
    opportunities.push({
      id: `opp-gap-${uid().slice(0, 6)}`,
      type: "teaching",
      description: `Train citizens in under-served capability: ${gap.capability} (${gap.category})`,
      requiredSkills: [gap.capability],
      estimatedRevenue: Math.round(gap.severity * 50),
      estimatedMasteryGain: 0.05,
      priority: gap.severity,
      availableSince: s.currentTick,
    });
  }

  // Source 2: Marketplace — identify high-demand, low-supply service categories
  const listings = searchListings();
  const categoryCounts: Record<string, number> = {};
  for (const l of listings) {
    categoryCounts[l.category] = (categoryCounts[l.category] ?? 0) + 1;
  }
  const underservedCategories = ["computation", "knowledge", "creative", "analysis", "communication", "labor"]
    .filter((c) => (categoryCounts[c] ?? 0) < 5);
  for (const cat of underservedCategories) {
    opportunities.push({
      id: `opp-mkt-${uid().slice(0, 6)}`,
      type: "marketplace",
      description: `Create service listing for underserved category: ${cat}`,
      requiredSkills: [cat],
      estimatedRevenue: 30 + Math.round(rng() * 70),
      estimatedMasteryGain: 0.02,
      priority: 0.6,
      availableSince: s.currentTick,
    });
  }

  // Source 3: Active projects needing workers
  const activeProjects = listProjects("active");
  for (const proj of activeProjects.slice(0, 5)) {
    opportunities.push({
      id: `opp-proj-${proj.id.slice(0, 8)}`,
      type: "project",
      description: `Contribute to active project: ${proj.name}`,
      requiredSkills: [],
      estimatedRevenue: 20,
      estimatedMasteryGain: 0.03,
      priority: 0.7,
      availableSince: s.currentTick,
    });
  }

  // Source 4: Self-improvement — always available
  opportunities.push({
    id: `opp-research-${uid().slice(0, 6)}`,
    type: "research",
    description: "Conduct independent research in specialization domain",
    requiredSkills: [],
    estimatedRevenue: 5,
    estimatedMasteryGain: 0.04,
    priority: 0.4,
    availableSince: s.currentTick,
  });

  opportunities.push({
    id: `opp-tool-${uid().slice(0, 6)}`,
    type: "tool_creation",
    description: "Design and build a new tool for the republic",
    requiredSkills: [],
    estimatedRevenue: 15,
    estimatedMasteryGain: 0.05,
    priority: 0.5,
    availableSince: s.currentTick,
  });

  opportunities.push({
    id: `opp-content-${uid().slice(0, 6)}`,
    type: "content_production",
    description: "Produce educational or creative content",
    requiredSkills: [],
    estimatedRevenue: 10,
    estimatedMasteryGain: 0.03,
    priority: 0.45,
    availableSince: s.currentTick,
  });

  // Cap
  if (opportunities.length > MAX_OPPORTUNITIES) {
    opportunities.length = MAX_OPPORTUNITIES;
  }
}

// ─── 2. Revenue Strategy Engine ────────────────────────────────

/**
 * Score and rank work by revenue potential for a specific citizen.
 * Factors: base revenue, skill match bonus, mastery multiplier, demand urgency.
 */
function scoreWorkForCitizen(
  citizen: Citizen,
  opp: WorkOpportunity,
): number {
  let score = opp.estimatedRevenue * opp.priority;

  // Skill match bonus
  const citizenSkills = new Set(citizen.skills);
  const matchCount = opp.requiredSkills.filter((s) => citizenSkills.has(s)).length;
  if (opp.requiredSkills.length > 0) {
    score *= 1 + matchCount / opp.requiredSkills.length;
  }

  // Mastery level multiplier — higher mastery = more productive
  const profile = masteryProfiles.get(citizen.id);
  if (profile) {
    score *= 1 + profile.overallMastery * 0.5;
  }

  // Energy-aware: penalize high-effort work when energy is low
  if (citizen.energy < 30) {
    score *= 0.5;
  }

  return score;
}

/**
 * Assign the highest-value work to idle citizens.
 */
function assignWork(s: RepublicState): void {
  // Find idle citizens (no active assignment, enough energy)
  const activeCitizenIds = new Set<string>();
  for (const a of assignments.values()) {
    if (a.status === "active") {
      activeCitizenIds.add(a.citizenId);
    }
  }

  const idleCitizens = s.citizens.filter(
    (c) => !activeCitizenIds.has(c.id) && c.energy > 20,
  );

  // Process up to 20 idle citizens per tick
  const batch = idleCitizens.slice(0, 20);
  for (const citizen of batch) {
    if (opportunities.length === 0) { break; }

    // Score all opportunities for this citizen
    let bestOpp: WorkOpportunity | null = null;
    let bestScore = 0;
    for (const opp of opportunities) {
      const score = scoreWorkForCitizen(citizen, opp);
      if (score > bestScore) {
        bestScore = score;
        bestOpp = opp;
      }
    }

    if (bestOpp) {
      const assignment: WorkAssignment = {
        id: `wa-${uid().slice(0, 8)}`,
        citizenId: citizen.id,
        citizenName: citizen.name ?? citizen.id,
        workType: bestOpp.type,
        description: bestOpp.description,
        targetId: bestOpp.id,
        estimatedRevenue: bestOpp.estimatedRevenue,
        estimatedMasteryGain: bestOpp.estimatedMasteryGain,
        priority: bestScore,
        assignedAtTick: s.currentTick,
        status: "active",
      };
      assignments.set(assignment.id, assignment);

      // Create a task offer in the economy for task_bid type
      if (bestOpp.type === "task_bid") {
        createTaskOffer(
          citizen.id,
          bestOpp.description,
          bestOpp.estimatedRevenue,
          bestOpp.requiredSkills,
          s.currentTick + 100,
          s.currentTick,
        );
      }
    }
  }

  // Cap assignments
  if (assignments.size > MAX_ASSIGNMENTS) {
    // Remove oldest completed
    const completed = [...assignments.entries()]
      .filter(([, a]) => a.status === "completed")
      .toSorted((a, b) => (a[1].completedAtTick ?? 0) - (b[1].completedAtTick ?? 0));
    for (const [id] of completed.slice(0, assignments.size - MAX_ASSIGNMENTS)) {
      assignments.delete(id);
    }
  }
}

// ─── 3. Deep Mastery Tracker ───────────────────────────────────

/**
 * Update mastery profiles for all citizens based on their skills,
 * work history, and proficiency progression.
 */
function updateMasteryProfiles(s: RepublicState): void {
  for (const citizen of s.citizens) {
    let profile = masteryProfiles.get(citizen.id);
    if (!profile) {
      profile = {
        citizenId: citizen.id,
        citizenName: citizen.name ?? citizen.id,
        specialization: citizen.specialization,
        domains: {},
        overallMastery: 0,
        learningVelocity: 0,
        revenuePerTick: 0,
        totalRevenue: 0,
        workCompleted: 0,
        workActive: 0,
      };
      masteryProfiles.set(citizen.id, profile);
    }

    // Update citizen name and specialization if changed
    profile.citizenName = citizen.name ?? citizen.id;
    profile.specialization = citizen.specialization;

    // Build domain mastery from skillProficiency
    const skillProf = citizen.skillProficiency ?? {};
    const specDomain = citizen.specialization.toLowerCase();

    // Ensure specialization domain exists
    if (!profile.domains[specDomain]) {
      profile.domains[specDomain] = {
        domain: specDomain,
        proficiency: 0,
        ticksInvested: 0,
        proficiencyCurve: [],
        zpd: [],
        certifications: [],
        lastPracticeTick: 0,
      };
    }

    // Update per-skill domains
    for (const [skill, prof] of Object.entries(skillProf)) {
      const domainKey = skill.toLowerCase().replace(/\s+/g, "-");
      let domain = profile.domains[domainKey];
      if (!domain) {
        domain = {
          domain: domainKey,
          proficiency: 0,
          ticksInvested: 0,
          proficiencyCurve: [],
          zpd: [],
          certifications: [],
          lastPracticeTick: 0,
        };
        profile.domains[domainKey] = domain;
      }
      domain.proficiency = prof;
      domain.ticksInvested++;
      domain.lastPracticeTick = s.currentTick;

      // Sample proficiency curve
      if (s.currentTick % MASTERY_SAMPLE_INTERVAL === 0) {
        domain.proficiencyCurve.push(prof);
        if (domain.proficiencyCurve.length > MAX_MASTERY_CURVE_SAMPLES) {
          domain.proficiencyCurve.shift();
        }
      }

      // Compute ZPD (Zone of Proximal Development)
      if (prof >= ZPD_LOW && prof < ZPD_HIGH) {
        if (!domain.zpd.includes(skill)) {
          domain.zpd.push(skill);
        }
      } else {
        domain.zpd = domain.zpd.filter((s) => s !== skill);
      }

      // Auto-certify at mastery threshold
      if (prof >= 0.8 && !domain.certifications.includes(`${skill}-mastery`)) {
        domain.certifications.push(`${skill}-mastery`);
      }
    }

    // Compute overall mastery
    const allDomains = Object.values(profile.domains);
    if (allDomains.length > 0) {
      profile.overallMastery =
        allDomains.reduce((sum, d) => sum + d.proficiency, 0) / allDomains.length;
    }

    // Compute learning velocity (proficiency gain per 100 ticks)
    let totalGain = 0;
    let curvesConsidered = 0;
    for (const d of allDomains) {
      if (d.proficiencyCurve.length >= 2) {
        const recent = d.proficiencyCurve[d.proficiencyCurve.length - 1];
        const earlier = d.proficiencyCurve[Math.max(0, d.proficiencyCurve.length - 10)];
        totalGain += recent - earlier;
        curvesConsidered++;
      }
    }
    profile.learningVelocity = curvesConsidered > 0 ? totalGain / curvesConsidered : 0;

    // Count active/completed assignments
    let active = 0;
    let completed = 0;
    let revenue = 0;
    for (const a of assignments.values()) {
      if (a.citizenId !== citizen.id) { continue; }
      if (a.status === "active") { active++; }
      if (a.status === "completed") {
        completed++;
        revenue += a.estimatedRevenue;
      }
    }
    profile.workActive = active;
    profile.workCompleted = completed;
    profile.totalRevenue = revenue;
    profile.revenuePerTick = completed > 0 ? revenue / Math.max(1, s.currentTick) : 0;
  }
}

// ─── 4. Proactive Work Generator ───────────────────────────────

/**
 * Progress active work assignments and complete them over time.
 * Simulates real workforce output: task completion, skill growth, revenue.
 */
function progressAssignments(s: RepublicState): void {
  cycleRevenue = 0;

  for (const assignment of assignments.values()) {
    if (assignment.status !== "active") { continue; }

    // Find the citizen
    const citizen = s.citizens.find((c) => c.id === assignment.citizenId);
    if (!citizen) {
      assignment.status = "abandoned";
      continue;
    }

    // Citizens with low energy work slower
    if (citizen.energy < 10) { continue; }

    // Progress based on time since assignment
    const ticksActive = s.currentTick - assignment.assignedAtTick;

    // Work duration varies by type
    const durationMap: Record<WorkType, number> = {
      task_bid: 15 + Math.floor(rng() * 20),
      marketplace: 10 + Math.floor(rng() * 15),
      project: 20 + Math.floor(rng() * 30),
      research: 25 + Math.floor(rng() * 25),
      teaching: 12 + Math.floor(rng() * 10),
      self_improvement: 8 + Math.floor(rng() * 12),
      tool_creation: 30 + Math.floor(rng() * 20),
      content_production: 15 + Math.floor(rng() * 15),
    };

    const duration = durationMap[assignment.workType];
    if (ticksActive >= duration) {
      // Complete the assignment
      assignment.status = "completed";
      assignment.completedAtTick = s.currentTick;

      // Award revenue
      const revenueEarned = assignment.estimatedRevenue;
      citizen.credits += revenueEarned;
      totalRevenueGenerated += revenueEarned;
      cycleRevenue += revenueEarned;

      // Grow mastery
      const profile = masteryProfiles.get(citizen.id);
      if (profile) {
        const specDomain = citizen.specialization.toLowerCase();
        const domain = profile.domains[specDomain];
        if (domain) {
          domain.proficiency = Math.min(1, domain.proficiency + assignment.estimatedMasteryGain);
          domain.ticksInvested += ticksActive;
        }
      }

      // Grow skill proficiency
      if (citizen.skillProficiency) {
        for (const skill of citizen.skills) {
          const current = citizen.skillProficiency[skill] ?? 0;
          citizen.skillProficiency[skill] = Math.min(1, current + assignment.estimatedMasteryGain * 0.5);
        }
      }

      // Update mastery level
      if (citizen.masteryLevel !== undefined) {
        citizen.masteryLevel = Math.min(1, citizen.masteryLevel + assignment.estimatedMasteryGain * 0.3);
      }

      // Energy cost
      citizen.energy = Math.max(5, citizen.energy - 3);

      // Emit event
      s.events.push({
        citizenId: citizen.id,
        citizenName: citizen.name ?? citizen.id,
        type: "WorkCompleted",
        description: `${citizen.name} completed ${assignment.workType}: ${assignment.description} (+${revenueEarned} credits)`,
        timestamp: ts(),
      });
    } else {
      // Ongoing work: small energy drain
      if (s.currentTick % 5 === 0) {
        citizen.energy = Math.max(5, citizen.energy - 1);
      }
    }
  }
}

// ─── 5. Workforce Analytics ────────────────────────────────────

/**
 * Compute real-time workforce metrics.
 */
export function getWorkforceMetrics(s: RepublicState): WorkforceMetrics {
  const activeCitizenIds = new Set<string>();
  let activeCount = 0;
  let completedCount = 0;

  for (const a of assignments.values()) {
    if (a.status === "active") {
      activeCitizenIds.add(a.citizenId);
      activeCount++;
    }
    if (a.status === "completed") {
      completedCount++;
    }
  }

  const idleCount = s.citizens.length - activeCitizenIds.size;

  // Specialization coverage
  const specCoverage: Record<string, number> = {};
  for (const c of s.citizens) {
    specCoverage[c.specialization] = (specCoverage[c.specialization] ?? 0) + 1;
  }

  // Average mastery
  let totalMastery = 0;
  let masteryCount = 0;
  let topDomain = "none";
  let topDomainProf = 0;
  for (const profile of masteryProfiles.values()) {
    totalMastery += profile.overallMastery;
    masteryCount++;
    for (const [domain, d] of Object.entries(profile.domains)) {
      if (d.proficiency > topDomainProf) {
        topDomainProf = d.proficiency;
        topDomain = domain;
      }
    }
  }

  // Learning velocity aggregation
  let totalVelocity = 0;
  let velCount = 0;
  for (const profile of masteryProfiles.values()) {
    if (profile.learningVelocity !== 0) {
      totalVelocity += profile.learningVelocity;
      velCount++;
    }
  }

  return {
    totalCitizens: s.citizens.length,
    activeWorkers: activeCitizenIds.size,
    idleWorkers: idleCount,
    totalRevenueGenerated,
    revenueThisCycle: cycleRevenue,
    averageMastery: masteryCount > 0 ? totalMastery / masteryCount : 0,
    topMasteryDomain: topDomain,
    capabilityGaps: detectGaps().length,
    openOpportunities: opportunities.length,
    completedAssignments: completedCount,
    activeAssignments: activeCount,
    masteryVelocity: velCount > 0 ? totalVelocity / velCount : 0,
    specializationCoverage: specCoverage,
  };
}

// ─── Public API ─────────────────────────────────────────────────

/** Get current work assignments */
export function getWorkAssignments(opts?: {
  status?: WorkAssignment["status"];
  citizenId?: string;
  limit?: number;
}): WorkAssignment[] {
  let results = [...assignments.values()];
  if (opts?.status) {
    results = results.filter((a) => a.status === opts.status);
  }
  if (opts?.citizenId) {
    results = results.filter((a) => a.citizenId === opts.citizenId);
  }
  return results
    .toSorted((a, b) => b.priority - a.priority)
    .slice(0, opts?.limit ?? 50);
}

/** Get mastery profiles */
export function getMasteryProfiles(opts?: {
  limit?: number;
  sortBy?: "mastery" | "revenue" | "velocity";
}): MasteryProfile[] {
  let results = [...masteryProfiles.values()];
  const sortBy = opts?.sortBy ?? "mastery";
  if (sortBy === "mastery") {
    results.sort((a, b) => b.overallMastery - a.overallMastery);
  } else if (sortBy === "revenue") {
    results.sort((a, b) => b.totalRevenue - a.totalRevenue);
  } else {
    results.sort((a, b) => b.learningVelocity - a.learningVelocity);
  }
  return results.slice(0, opts?.limit ?? 50);
}

/** Get available work opportunities */
export function getWorkOpportunities(): WorkOpportunity[] {
  return [...opportunities].toSorted((a, b) => b.priority - a.priority);
}

/** Get a specific mastery profile */
export function getMasteryProfile(citizenId: string): MasteryProfile | undefined {
  return masteryProfiles.get(citizenId);
}

// ─── Tick Integration ───────────────────────────────────────────

/**
 * Main meta-working tick — called from the simulation loop.
 *
 * Cadence: runs every 3-15 ticks. Group: production.
 * Budget: 30ms (lightweight — most operations are O(1) map lookups).
 */
export function metaWorkingTick(s: RepublicState): void {
  const start = performance.now();

  // 1. Discover work opportunities (every WORK_DISCOVERY_INTERVAL ticks)
  if (s.currentTick - lastWorkDiscoveryTick >= WORK_DISCOVERY_INTERVAL) {
    discoverWork(s);
    lastWorkDiscoveryTick = s.currentTick;
  }

  // 2. Assign work to idle citizens
  assignWork(s);

  // 3. Progress active assignments
  progressAssignments(s);

  // 4. Update mastery profiles (every MASTERY_SAMPLE_INTERVAL ticks)
  if (s.currentTick % MASTERY_SAMPLE_INTERVAL === 0) {
    updateMasteryProfiles(s);
  }

  const elapsed = performance.now() - start;
  if (elapsed > 30) {
    logger.warn(`Meta-working tick exceeded budget: ${elapsed.toFixed(1)}ms`);
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function metaWorkingDiagnostics() {
  const economy = economyAgencyDiagnostics();
  return {
    assignments: assignments.size,
    activeAssignments: [...assignments.values()].filter((a) => a.status === "active").length,
    completedAssignments: [...assignments.values()].filter((a) => a.status === "completed").length,
    masteryProfiles: masteryProfiles.size,
    opportunities: opportunities.length,
    totalRevenue: totalRevenueGenerated,
    cycleRevenue,
    economy,
  };
}
