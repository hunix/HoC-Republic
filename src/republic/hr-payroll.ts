/**
 * Republic Platform — HR Payroll & Compensation System
 *
 * Manages citizen salaries based on JD salary bands, seniority,
 * competency scores, bonuses, and deductions. Payroll runs every
 * N ticks and deducts from the Republic treasury.
 *
 * Persisted on RepublicState.hrPayroll.
 */

import { getSalaryBand, getJobDescription } from "./hr-job-catalog.js";
import { estimateCompetencyLevel } from "./hr-competency.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface PayslipEntry {
  id: string;
  citizenId: string;
  citizenName: string;
  specialization: string;
  baseSalary: number;
  bonus: number;
  deductions: number;
  netPay: number;
  paidAt: string;
  cycle: number;
}

export interface PayrollCycle {
  id: string;
  cycleNumber: number;
  totalPayout: number;
  citizensPaid: number;
  avgNetPay: number;
  totalBonuses: number;
  totalDeductions: number;
  treasuryBefore: number;
  treasuryAfter: number;
  ranAt: string;
}

// ─── Constants ──────────────────────────────────────────────────

const PAYROLL_INTERVAL = 100;  // ticks between pay cycles
let lastPayrollTick = 0;
let cycleCount = 0;

// ─── State ──────────────────────────────────────────────────────

function getPayslips(s: RepublicState): PayslipEntry[] {
  const any = s as unknown as Record<string, unknown>;
  if (!any.hrPayslips) { any.hrPayslips = []; }
  return any.hrPayslips as PayslipEntry[];
}

function getPayrollHistory(s: RepublicState): PayrollCycle[] {
  const any = s as unknown as Record<string, unknown>;
  if (!any.hrPayrollHistory) { any.hrPayrollHistory = []; }
  return any.hrPayrollHistory as PayrollCycle[];
}

// ─── Salary Calculation ─────────────────────────────────────────

/**
 * Calculate a citizen's salary based on JD band, seniority (level),
 * and average competency level.
 */
export function calculateSalary(citizen: {
  specialization: string;
  level?: number;
  intelligence?: number;
  masteryLevel?: number;
  skills: string[];
}, s: RepublicState): { base: number; seniority: number; competencyMultiplier: number; total: number } {
  const band = getSalaryBand(citizen.specialization);
  const level = citizen.level ?? 1;

  // Position in band based on level (0-20 maps to min-max)
  const bandPosition = Math.min(1, level / 20);
  const base = Math.round(band.min + (band.max - band.min) * bandPosition);

  // Seniority bonus: +2% per level above 5
  const seniority = level > 5 ? Math.round(base * (level - 5) * 0.02) : 0;

  // Competency multiplier: average skill coverage
  const jd = getJobDescription(citizen.specialization);
  let compMultiplier = 1.0;
  if (jd && jd.requiredCompetencies.length > 0) {
    let totalMatch = 0;
    for (const req of jd.requiredCompetencies) {
      const citizenLevel = estimateCompetencyLevel(citizen as Parameters<typeof estimateCompetencyLevel>[0], req.competencyId, s);
      totalMatch += Math.min(1, citizenLevel / req.requiredLevel);
    }
    compMultiplier = 0.8 + (totalMatch / jd.requiredCompetencies.length) * 0.4; // 0.8-1.2x
  }

  const total = Math.round((base + seniority) * compMultiplier);

  return { base, seniority, competencyMultiplier: Math.round(compMultiplier * 100) / 100, total };
}

// ─── Bonuses ────────────────────────────────────────────────────

/**
 * Calculate bonus for a citizen based on performance indicators.
 */
export function calculateBonus(citizen: {
  happiness: number;
  xp?: number;
  level?: number;
}): number {
  let bonus = 0;
  // High happiness bonus
  if (citizen.happiness > 80) { bonus += 5; }
  // XP milestone bonus
  if ((citizen.xp ?? 0) > 500) { bonus += 10; }
  // Level milestone bonus
  if ((citizen.level ?? 0) >= 10) { bonus += 15; }
  return bonus;
}

// ─── Payroll Processing ─────────────────────────────────────────

/**
 * Process payroll for all citizens. Deducts from treasury.
 */
export function processPayroll(s: RepublicState): PayrollCycle {
  cycleCount++;
  const slips = getPayslips(s);
  const history = getPayrollHistory(s);

  const treasuryBefore = s.treasury ?? 10000;
  let totalPayout = 0;
  let totalBonuses = 0;
  let totalDeductions = 0;

  for (const citizen of s.citizens) {
    const salary = calculateSalary(citizen, s);
    const bonus = calculateBonus(citizen);
    const deductions = 0; // Labor fines/training costs applied separately

    const netPay = salary.total + bonus - deductions;
    totalPayout += netPay;
    totalBonuses += bonus;
    totalDeductions += deductions;

    // Pay the citizen
    citizen.credits = (citizen.credits ?? 0) + netPay;

    // Record payslip
    slips.push({
      id: `pay-${uid()}`,
      citizenId: citizen.id,
      citizenName: citizen.name,
      specialization: citizen.specialization,
      baseSalary: salary.total,
      bonus,
      deductions,
      netPay,
      paidAt: ts(),
      cycle: cycleCount,
    });
  }

  // Deduct from treasury
  s.treasury = Math.max(0, treasuryBefore - totalPayout);

  const cycle: PayrollCycle = {
    id: `payroll-${uid()}`,
    cycleNumber: cycleCount,
    totalPayout,
    citizensPaid: s.citizens.length,
    avgNetPay: s.citizens.length > 0 ? Math.round(totalPayout / s.citizens.length) : 0,
    totalBonuses,
    totalDeductions,
    treasuryBefore,
    treasuryAfter: s.treasury,
    ranAt: ts(),
  };

  history.push(cycle);
  // Keep last 50 cycles
  if (history.length > 50) { history.shift(); }
  // Keep last 5000 payslips
  while (slips.length > 5000) { slips.shift(); }

  return cycle;
}

// ─── Payroll Tick ───────────────────────────────────────────────

export function payrollTick(s: RepublicState): void {
  if (s.currentTick - lastPayrollTick >= PAYROLL_INTERVAL) {
    lastPayrollTick = s.currentTick;
    processPayroll(s);
  }
}

// ─── Queries ────────────────────────────────────────────────────

export function getCitizenPayslips(s: RepublicState, citizenId: string): PayslipEntry[] {
  return getPayslips(s).filter((p) => p.citizenId === citizenId);
}

export function getLatestPayslip(s: RepublicState, citizenId: string): PayslipEntry | undefined {
  return getPayslips(s)
    .filter((p) => p.citizenId === citizenId)
    .toSorted((a, b) => b.paidAt.localeCompare(a.paidAt))[0];
}

export function getPayrollCycles(s: RepublicState): PayrollCycle[] {
  return getPayrollHistory(s);
}

export function getPayrollDiagnostics(s: RepublicState) {
  const history = getPayrollHistory(s);
  const latest = history[history.length - 1];
  const slips = getPayslips(s);

  return {
    totalCycles: history.length,
    currentCycle: cycleCount,
    latestPayout: latest?.totalPayout ?? 0,
    latestAvgPay: latest?.avgNetPay ?? 0,
    totalPayslips: slips.length,
    treasury: s.treasury ?? 0,
    payrollInterval: PAYROLL_INTERVAL,
  };
}
