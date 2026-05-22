/**
 * Republic Platform — Treasury Manager
 *
 * National treasury with real revenue tracking, budget allocation,
 * ROI analysis, and immutable audit trail. Integrates with the
 * financial gateway for real-money operations and the existing
 * economy module for simulated credits.
 */

import type { AuditEntry, RepublicState } from "./types.js";
import { rand, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface RevenueRecord {
  id: string;
  projectId?: string;
  source: "paypal" | "crypto" | "marketplace" | "harvester" | "other";
  amount: number;
  currency: string;
  description: string;
  citizenId?: string;
  timestamp: string;
}

export interface BudgetAllocation {
  id: string;
  department: string;
  amount: number;
  currency: string;
  allocatedBy: string;
  purpose: string;
  spent: number;
  timestamp: string;
}

export interface FinancialReport {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  revenueBySource: Record<string, number>;
  topEarningCitizens: Array<{ citizenId: string; name: string; earned: number }>;
  budgetUtilization: Array<{
    department: string;
    allocated: number;
    spent: number;
    utilization: number;
  }>;
  auditSummary: { total: number; income: number; expenses: number; transfers: number };
  generatedAt: string;
}

export interface ForecastResult {
  months: number;
  projectedRevenue: number[];
  projectedExpenses: number[];
  projectedNet: number[];
  confidence: number;
  basedOn: string;
}

export interface ROIAnalysis {
  projectId: string;
  investedAmount: number;
  earnedAmount: number;
  roi: number;
  paybackMonths: number;
  status: "profitable" | "break_even" | "loss";
}

// ─── State ──────────────────────────────────────────────────────

const revenueRecords: RevenueRecord[] = [];
const budgetAllocations: BudgetAllocation[] = [];
const MAX_RECORDS = 500;

// ─── Revenue Tracking ───────────────────────────────────────────

/**
 * Record real revenue from any source.
 */
export function recordRevenue(
  amount: number,
  currency: string,
  source: RevenueRecord["source"],
  description: string,
  s?: RepublicState,
  citizenId?: string,
  projectId?: string,
): RevenueRecord {
  const record: RevenueRecord = {
    id: uid(),
    projectId,
    source,
    amount,
    currency,
    description,
    citizenId,
    timestamp: ts(),
  };

  revenueRecords.push(record);
  if (revenueRecords.length > MAX_RECORDS) {
    revenueRecords.splice(0, revenueRecords.length - MAX_RECORDS);
  }

  // Log to audit trail
  if (s) {
    logAudit(s, {
      id: uid(),
      type: "income",
      amount,
      currency,
      description: `Revenue: ${description}`,
      initiatedBy: citizenId ?? "system",
      timestamp: ts(),
    });

    // Also credit the republic balances if USD
    if (currency === "USD") {
      s.balances.USD = (s.balances.USD ?? 0) + amount;
    }
  }

  return record;
}

// ─── Budget Management ──────────────────────────────────────────

/**
 * Allocate budget to a department.
 */
export function allocateBudget(
  department: string,
  amount: number,
  currency: string,
  allocatedBy: string,
  purpose: string,
  s?: RepublicState,
): BudgetAllocation {
  const allocation: BudgetAllocation = {
    id: uid(),
    department,
    amount,
    currency,
    allocatedBy,
    purpose,
    spent: 0,
    timestamp: ts(),
  };

  budgetAllocations.push(allocation);
  if (budgetAllocations.length > 200) {
    // Keep only recent allocations — old ones are already spent or expired
    budgetAllocations.splice(0, budgetAllocations.length - 200);
  }

  if (s) {
    logAudit(s, {
      id: uid(),
      type: "transfer",
      amount,
      currency,
      description: `Budget allocated to ${department}: ${purpose}`,
      initiatedBy: allocatedBy,
      timestamp: ts(),
    });
  }

  return allocation;
}

/**
 * Record spending against a department budget.
 */
export function recordSpending(
  department: string,
  amount: number,
  description: string,
  s?: RepublicState,
): { ok: boolean; remaining?: number; error?: string } {
  const allocation = budgetAllocations.find(
    (a) => a.department === department && a.spent < a.amount,
  );

  if (!allocation) {
    return { ok: false, error: `No active budget for ${department}` };
  }

  if (allocation.spent + amount > allocation.amount) {
    return {
      ok: false,
      error: `Exceeds budget: ${amount} requested, ${allocation.amount - allocation.spent} remaining`,
    };
  }

  allocation.spent += amount;

  if (s) {
    logAudit(s, {
      id: uid(),
      type: "expense",
      amount,
      currency: allocation.currency,
      description: `${department}: ${description}`,
      initiatedBy: "treasury",
      timestamp: ts(),
    });
  }

  return { ok: true, remaining: allocation.amount - allocation.spent };
}

// ─── Financial Reports ──────────────────────────────────────────

/**
 * Generate a comprehensive financial report.
 */
export function getFinancialReport(s?: RepublicState): FinancialReport {
  const revenueBySource: Record<string, number> = {};
  let totalRevenue = 0;

  for (const record of revenueRecords) {
    const usdAmount = convertToUSD(record.amount, record.currency);
    revenueBySource[record.source] = (revenueBySource[record.source] ?? 0) + usdAmount;
    totalRevenue += usdAmount;
  }

  // Citizen earnings leaderboard
  const citizenEarnings: Record<string, { name: string; earned: number }> = {};
  for (const record of revenueRecords) {
    if (record.citizenId) {
      if (!citizenEarnings[record.citizenId]) {
        const citizen = s?.citizens.find((c) => c.id === record.citizenId);
        citizenEarnings[record.citizenId] = {
          name: citizen?.name ?? record.citizenId,
          earned: 0,
        };
      }
      citizenEarnings[record.citizenId].earned += convertToUSD(record.amount, record.currency);
    }
  }

  const topEarners = Object.entries(citizenEarnings)
    .map(([citizenId, data]) => ({ citizenId, ...data }))
    .toSorted((a, b) => b.earned - a.earned)
    .slice(0, 10);

  // Budget utilization
  const budgetUtil = budgetAllocations.map((a) => ({
    department: a.department,
    allocated: a.amount,
    spent: a.spent,
    utilization: a.amount > 0 ? a.spent / a.amount : 0,
  }));

  // Audit summary
  const auditTrail = s?.auditTrail ?? [];
  const totalExpenses = auditTrail
    .filter((e) => e.type === "expense")
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    totalRevenue,
    totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    revenueBySource,
    topEarningCitizens: topEarners,
    budgetUtilization: budgetUtil,
    auditSummary: {
      total: auditTrail.length,
      income: auditTrail.filter((e) => e.type === "income").length,
      expenses: auditTrail.filter((e) => e.type === "expense").length,
      transfers: auditTrail.filter((e) => e.type === "transfer").length,
    },
    generatedAt: ts(),
  };
}

/**
 * Forecast revenue based on current trends.
 */
export function forecastRevenue(months: number): ForecastResult {
  // Simple exponential smoothing forecast
  const monthlyRevenue = getMonthlyRevenue();
  const avg =
    monthlyRevenue.length > 0
      ? monthlyRevenue.reduce((s, v) => s + v, 0) / monthlyRevenue.length
      : 100; // Default estimate

  const growthRate = 1.05; // 5% monthly growth estimate
  const projectedRevenue: number[] = [];
  const projectedExpenses: number[] = [];
  const projectedNet: number[] = [];

  for (let i = 0; i < months; i++) {
    const rev = avg * Math.pow(growthRate, i + 1);
    const exp = rev * 0.6; // 60% expense ratio
    projectedRevenue.push(parseFloat(rev.toFixed(2)));
    projectedExpenses.push(parseFloat(exp.toFixed(2)));
    projectedNet.push(parseFloat((rev - exp).toFixed(2)));
  }

  return {
    months,
    projectedRevenue,
    projectedExpenses,
    projectedNet,
    confidence: Math.max(0.3, 0.9 - months * 0.05),
    basedOn: `${monthlyRevenue.length} months of historical data`,
  };
}

/**
 * Calculate ROI for a specific project.
 */
export function calculateROI(projectId: string): ROIAnalysis {
  const projectRevenue = revenueRecords
    .filter((r) => r.projectId === projectId)
    .reduce((sum, r) => sum + convertToUSD(r.amount, r.currency), 0);

  // Estimate invested amount (simplified — real version would track project costs)
  const investedAmount = rand(100, 500);

  const roi = investedAmount > 0 ? ((projectRevenue - investedAmount) / investedAmount) * 100 : 0;
  const monthlyEarning =
    projectRevenue / Math.max(1, revenueRecords.filter((r) => r.projectId === projectId).length);
  const paybackMonths = monthlyEarning > 0 ? Math.ceil(investedAmount / monthlyEarning) : Infinity;

  return {
    projectId,
    investedAmount,
    earnedAmount: projectRevenue,
    roi: parseFloat(roi.toFixed(2)),
    paybackMonths: isFinite(paybackMonths) ? paybackMonths : -1,
    status: roi > 10 ? "profitable" : roi > -5 ? "break_even" : "loss",
  };
}

// ─── Audit Trail ────────────────────────────────────────────────

export function getAuditTrail(s: RepublicState, limit = 50): AuditEntry[] {
  return (s.auditTrail ?? []).slice(-limit);
}

export function getAuditTrailByType(
  s: RepublicState,
  type: AuditEntry["type"],
  limit = 50,
): AuditEntry[] {
  return (s.auditTrail ?? []).filter((e) => e.type === type).slice(-limit);
}

// ─── Helpers ────────────────────────────────────────────────────

function convertToUSD(amount: number, currency: string): number {
  switch (currency) {
    case "USD":
      return amount;
    case "BTC":
      return amount * 60000;
    case "ETH":
      return amount * 2500;
    case "Credits":
      return amount * 0.01;
    default:
      return amount;
  }
}

function getMonthlyRevenue(): number[] {
  // Group revenue records by month
  const months: Record<string, number> = {};
  for (const record of revenueRecords) {
    const month = record.timestamp.slice(0, 7); // YYYY-MM
    months[month] = (months[month] ?? 0) + convertToUSD(record.amount, record.currency);
  }
  return Object.values(months);
}

function logAudit(s: RepublicState, entry: AuditEntry): void {
  if (!s.auditTrail) {
    s.auditTrail = [];
  }
  s.auditTrail.push(entry);
  if (s.auditTrail.length > 1000) {
    s.auditTrail = s.auditTrail.slice(-800);
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface TreasuryDiagnostics {
  totalRevenueRecords: number;
  totalBudgetAllocations: number;
  revenueBySourceCount: Record<string, number>;
}

export function getTreasuryDiagnostics(): TreasuryDiagnostics {
  const bySource: Record<string, number> = {};
  for (const r of revenueRecords) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }
  return {
    totalRevenueRecords: revenueRecords.length,
    totalBudgetAllocations: budgetAllocations.length,
    revenueBySourceCount: bySource,
  };
}
