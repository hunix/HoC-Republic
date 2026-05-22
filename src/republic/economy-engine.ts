/**
 * Republic Platform — Economy Engine
 *
 * Manages the economic lifecycle of citizens:
 * - Job market: citizens can seek and hold jobs
 * - Employers (buildings/institutions) generate positions
 * - Wages, taxes, and trade flow through the system
 * - Economic indicators drive citizen behavior
 *
 * The economy runs autonomously — citizens work, earn, spend, and
 * the system adjusts based on supply/demand dynamics.
 */

import { addCollectiveMemory, addEpisodicMemory } from "./memory.js";
import type { RepublicState } from "./types.js";
import { rand, rng, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface Job {
  id: string;
  title: string;
  /** Required specialization (or "any") */
  requiredSpec: string;
  /** Worker citizen ID (null if vacant) */
  workerId: string | null;
  /** Base wage per tick */
  wage: number;
  /** Minimum skill count required */
  minSkills: number;
  /** Ticks this job has been active */
  ticksActive: number;
}

export interface EconomicIndicators {
  /** Average citizen credits */
  avgCredits: number;
  /** Employment rate (0.0–1.0) */
  employmentRate: number;
  /** Total GDP (sum of wages paid) */
  gdp: number;
  /** Gini coefficient (0=equal, 1=max inequality) */
  giniCoefficient: number;
  /** Inflation rate */
  inflationRate: number;
}

/** Active job market */
let jobMarket: Job[] = [];
/** Economic history (last 100 indicators) */
let economicHistory: EconomicIndicators[] = [];
let gdpAccumulator = 0;

// ─── Configuration ──────────────────────────────────────────────

const MAX_JOBS = 50;
const BASE_WAGE = 10;
const TAX_RATE = 0.1;
const JOB_CREATION_CHANCE = 0.15;

/** Specializations and their wage multipliers */
const WAGE_MULTIPLIERS: Record<string, number> = {
  Scientist: 1.5,
  Researcher: 1.4,
  Engineer: 1.6,
  Developer: 1.5,
  Architect: 1.7,
  Doctor: 1.8,
  Psychologist: 1.3,
  Mathematician: 1.4,
  Strategist: 1.5,
  Analyst: 1.3,
  Artist: 1.0,
  Musician: 0.9,
  Writer: 1.1,
  Diplomat: 1.4,
  Planner: 1.2,
  Librarian: 1.0,
  Farmer: 0.8,
  Manufacturer: 1.1,
  ServiceProvider: 0.9,
  Generalist: 1.0,
};

// ─── Economy Tick ───────────────────────────────────────────────

/**
 * Main economy tick. Called from the simulation loop.
 *
 * 1. Create new jobs based on demand
 * 2. Assign unemployed citizens to open jobs
 * 3. Pay wages to employed citizens
 * 4. Collect taxes
 * 5. Update economic indicators
 */
export function economyEngineTick(s: RepublicState): void {
  // 1. Create jobs if below capacity
  if (jobMarket.length < MAX_JOBS && rand(0, 99) < JOB_CREATION_CHANCE * 100) {
    const specs = Object.keys(WAGE_MULTIPLIERS);
    const spec = specs[rand(0, specs.length - 1)];
    const multiplier = WAGE_MULTIPLIERS[spec] ?? 1.0;

    jobMarket.push({
      id: `job-${Date.now()}-${uid()}`,
      title: `${spec} Position`,
      requiredSpec: spec,
      workerId: null,
      wage: Math.round(BASE_WAGE * multiplier * (1 + rng() * 0.5)),
      minSkills: rand(0, 2),
      ticksActive: 0,
    });
  }

  // 2. Match unemployed citizens to open jobs
  const openJobs = jobMarket.filter((j) => j.workerId === null);
  for (const job of openJobs) {
    const candidate = s.citizens.find(
      (c) =>
        c.activity !== "Sleeping" &&
        c.energy > 20 &&
        (job.requiredSpec === "any" || c.specialization === job.requiredSpec) &&
        c.skillCount >= job.minSkills &&
        !jobMarket.some((j) => j.workerId === c.id), // Not already employed
    );

    if (candidate) {
      job.workerId = candidate.id;
      addEpisodicMemory(candidate.id, {
        tick: s.currentTick,
        timestamp: new Date().toISOString(),
        description: `Got hired as ${job.title} (wage: ${job.wage}/tick)`,
        valence: 0.6,
        importance: 0.7,
        involvedCitizenIds: [],
        tags: ["economy", "hired", candidate.specialization.toLowerCase()],
      });
    }
  }

  // 3. Pay wages + collect taxes
  let tickGdp = 0;
  for (const job of jobMarket) {
    if (!job.workerId) {
      continue;
    }
    job.ticksActive++;

    const worker = s.citizens.find((c) => c.id === job.workerId);
    if (!worker) {
      job.workerId = null; // Worker disappeared
      continue;
    }

    // If worker is too tired, skip pay but keep job
    if (worker.energy < 10) {
      continue;
    }

    const netWage = Math.round(job.wage * (1 - TAX_RATE));
    const tax = job.wage - netWage;
    worker.credits += netWage;
    s.balances.Credits += tax; // Treasury collects tax
    tickGdp += job.wage;

    // Workers lose some energy from working
    worker.energy = Math.max(0, worker.energy - 3);
  }

  gdpAccumulator += tickGdp;

  // 4. Remove stale vacant jobs (unfilled for 50+ ticks)
  jobMarket = jobMarket.filter((j) => j.workerId !== null || j.ticksActive < 50);

  // 5. Update indicators every 10 ticks
  if (s.currentTick % 10 === 0) {
    const indicators = calculateIndicators(s);
    economicHistory.push(indicators);
    if (economicHistory.length > 100) {
      economicHistory = economicHistory.slice(-100);
    }

    // Collective memory for major economic events
    if (indicators.employmentRate < 0.3) {
      addCollectiveMemory({
        type: "historical_event",
        content: `Economic crisis: unemployment at ${(indicators.employmentRate * 100).toFixed(0)}% (tick ${s.currentTick})`,
        contributorId: "system",
        addedAt: s.currentTick,
        importance: 0.9,
      });
    }
  }
}

// ─── Indicators ─────────────────────────────────────────────────

function calculateIndicators(s: RepublicState): EconomicIndicators {
  const credits = s.citizens.map((c) => c.credits);
  const avgCredits = credits.reduce((a, b) => a + b, 0) / (credits.length || 1);

  const employed = jobMarket.filter((j) => j.workerId !== null).length;
  const employmentRate = s.citizens.length > 0 ? employed / s.citizens.length : 0;

  // Gini coefficient calculation
  const sorted = credits.toSorted((a, b) => a - b);
  const n = sorted.length;
  let gini = 0;
  if (n > 0 && avgCredits > 0) {
    let sumOfDifferences = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        sumOfDifferences += Math.abs(sorted[i] - sorted[j]);
      }
    }
    gini = sumOfDifferences / (2 * n * n * avgCredits);
  }

  // Simple inflation (GDP growth rate)
  const prevGdp =
    economicHistory.length > 0 ? economicHistory[economicHistory.length - 1].gdp : gdpAccumulator;
  const inflationRate = prevGdp > 0 ? (gdpAccumulator - prevGdp) / prevGdp : 0;
  const gdp = gdpAccumulator;
  gdpAccumulator = 0;

  return { avgCredits, employmentRate, gdp, giniCoefficient: gini, inflationRate };
}

// ─── Queries ────────────────────────────────────────────────────

export function getJobMarket(): Job[] {
  return jobMarket;
}

export function getCitizenJob(citizenId: string): Job | undefined {
  return jobMarket.find((j) => j.workerId === citizenId);
}

export function getEconomicIndicators(): EconomicIndicators | null {
  return economicHistory.length > 0 ? economicHistory[economicHistory.length - 1] : null;
}

export function getEconomicHistory(): EconomicIndicators[] {
  return economicHistory;
}

/** Export for persistence */
export function exportEconomyState(): { jobs: Job[]; history: EconomicIndicators[] } {
  return { jobs: jobMarket, history: economicHistory };
}

/** Import from persistence */
export function importEconomyState(data: { jobs: Job[]; history: EconomicIndicators[] }): void {
  jobMarket = data.jobs;
  economicHistory = data.history;
}

/** Reset (testing) */
export function resetEconomy(): void {
  jobMarket = [];
  economicHistory = [];
  gdpAccumulator = 0;
}
