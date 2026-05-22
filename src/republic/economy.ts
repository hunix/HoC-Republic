/**
 * Republic Platform — Economy Engine
 *
 * Treasury, harvesters, resources, transactions, and economy
 * tick drift.
 */

import type { RepublicState } from "./types.js";
import { rand, randFloat, uid } from "./utils.js";

// ─── Supply/Demand Price Discovery ──────────────────────────────

/**
 * Compute market price using supply/demand elasticity.
 * Price = baseCost × e^(2 × (utilization - 0.5))
 *
 * - At 50% utilization → price = baseCost
 * - At high utilization → price rises exponentially (scarcity premium)
 * - At low utilization → price drops (surplus discount)
 */
const BASE_RESOURCE_COST = 1.0;

function marketPrice(consumption: number, capacity: number): number {
  if (capacity <= 0) {return BASE_RESOURCE_COST;}
  const utilization = Math.max(0, Math.min(1, consumption / capacity));
  return BASE_RESOURCE_COST * Math.exp(2 * (utilization - 0.5));
}

// ─── Economy Tick Drift ─────────────────────────────────────────

/** Advance economy state by one tick. */
export function economyTick(s: RepublicState): void {
  // ── Simulated mode: synthetic drift (harvesters, resources, prices) ──
  if (s.mode === "simulated") {
    // Harvester earnings
    const activeHarvesters = s.harvesters.filter((h) => h.enabled);
    for (const h of activeHarvesters) {
      const earn = h.hourlyRate / 3600;
      h.totalEarned += earn;
      const taskDone = rand(0, 99) < 30;
      if (taskDone) {h.completedTasks++;}
      h.lastHarvest = Date.now();
      // Drift success rate slightly
      h.successRate = Math.max(0.5, Math.min(1, h.successRate + randFloat(-0.002, 0.003)));
      s.balances.Credits += earn * 100;
    }

    // Resource consumption drift
    for (const r of s.resources) {
      r.consumption = Math.max(0, Math.min(r.capacity, r.consumption + rand(-10, 15)));
      r.available = r.capacity - r.consumption;
    }

    // Market price drift
    s.priceIndex.BTC = Math.max(10000, s.priceIndex.BTC + randFloat(-200, 250));
    s.priceIndex.ETH = Math.max(500, s.priceIndex.ETH + randFloat(-30, 40));
  }
  // In "real" mode: no synthetic drift. Balances only change via explicit
  // transactions (purchaseResource, tax collection, etc.).

  // ── Balance snapshots (both modes) ──
  // Record a snapshot every 100 ticks to enable real change24h computation.
  if (s.currentTick > 0 && s.currentTick % 100 === 0) {
    if (!s.balanceSnapshots) {s.balanceSnapshots = [];}
    s.balanceSnapshots.push({
      tick: s.currentTick,
      ts: Date.now(),
      balances: { ...s.balances },
    });
    // Cap snapshots to prevent unbounded growth (keep last 500)
    if (s.balanceSnapshots.length > 500) {
      s.balanceSnapshots = s.balanceSnapshots.slice(-400);
    }
  }

  // Cap transactions to prevent unbounded growth
  if (s.transactions.length > 200) {
    s.transactions = s.transactions.slice(-150);
  }
}

// ─── Harvester Operations ───────────────────────────────────────

/** Toggle a harvester on/off. */
export function toggleHarvester(
  s: RepublicState,
  harvesterId: string,
): { ok: boolean; error?: string } {
  const h = s.harvesters.find((x) => x.id === harvesterId);
  if (!h) {return { ok: false, error: "harvester not found" };}
  h.enabled = !h.enabled;
  return { ok: true };
}

/** Set the tax rate. */
export function setTaxRate(s: RepublicState, rate: number): { ok: boolean; error?: string } {
  if (rate < 0 || rate > 1) {return { ok: false, error: "rate must be 0-1" };}
  s.taxRate = rate;
  return { ok: true };
}

/** Purchase a resource. */
export function purchaseResource(
  s: RepublicState,
  resourceType: string,
  quantity: number,
): { ok: boolean; error?: string } {
  const res = s.resources.find((r) => r.type === resourceType);
  if (!res) {return { ok: false, error: "resource type not found" };}
  if (quantity <= 0) {return { ok: false, error: "quantity must be positive" };}

  const cost = quantity * marketPrice(res.consumption, res.capacity);
  if (s.balances.Credits < cost) {return { ok: false, error: "insufficient credits" };}

  s.balances.Credits -= cost;
  s.totalExpenses = (s.totalExpenses ?? 0) + cost;
  res.available += quantity;
  res.capacity = Math.max(res.capacity, res.available + res.consumption);
  s.transactions.push({
    id: uid(),
    type: "ResourcePurchase",
    amount: cost,
    currency: "Credits",
    description: `Purchased ${quantity} ${resourceType}`,
    timestamp: new Date().toISOString(),
  });

  return { ok: true };
}

// ─── Treasury Report Builder ────────────────────────────────────

/**
 * Compute the percentage change between current and historical balance.
 * Uses balance snapshots to find the closest snapshot to 24h ago.
 * Falls back to 0 if no snapshots exist.
 */
function computeChange24h(
  currency: string,
  currentBalance: number,
  snapshots: Array<{ tick: number; ts: number; balances: Record<string, number> }>,
): number {
  if (!snapshots || snapshots.length === 0) {return 0;}

  const oneDayAgo = Date.now() - 86400000;
  // Find the snapshot closest to 24h ago
  let bestSnapshot = snapshots[0];
  let bestDelta = Math.abs(bestSnapshot.ts - oneDayAgo);
  for (const snap of snapshots) {
    const delta = Math.abs(snap.ts - oneDayAgo);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSnapshot = snap;
    }
  }

  const oldBalance = bestSnapshot.balances[currency] ?? currentBalance;
  if (oldBalance === 0) {return currentBalance > 0 ? 100 : 0;}
  return ((currentBalance - oldBalance) / Math.abs(oldBalance)) * 100;
}

/** Build the treasury report matching the UI contract. */
export function buildTreasuryReport(s: RepublicState) {
  const enabledHarvesters = s.harvesters.filter((h) => h.enabled);
  const dailyRevenue =
    enabledHarvesters.reduce((sum, h) => sum + h.hourlyRate * 24, 0) +
    s.taxRate * s.citizens.length * 100;

  const snaps = s.balanceSnapshots ?? [];

  const balances = (Object.entries(s.balances)).map(
    ([currency, balance]) => ({
      currency,
      balance,
      change24h: parseFloat(computeChange24h(currency, balance, snaps).toFixed(2)),
    }),
  );

  const totalValueUSD =
    (s.balances.USD ?? 0) +
    (s.balances.BTC ?? 0) * s.priceIndex.BTC +
    (s.balances.ETH ?? 0) * s.priceIndex.ETH +
    (s.balances.Credits ?? 0) * 0.01;

  // Compute real daily expenses from accumulated tracker
  const realExpenses = s.totalExpenses ?? 0;

  return {
    balances,
    totalValueUSD: parseFloat(totalValueUSD.toFixed(2)),
    taxRate: s.taxRate,
    recentTransactions: s.transactions.slice(-20).map((t) => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      description: t.description,
      timestamp: new Date(t.timestamp).getTime(),
    })),
    harvesters: s.harvesters.map((h) => ({
      type: h.type,
      enabled: h.enabled,
      earning: h.hourlyRate,
      earningCurrency: "Credits" as const,
      tasksCompleted: h.completedTasks,
      successRate: h.successRate,
      lastHarvest: h.lastHarvest,
    })),
    resources: s.resources.map((r) => ({
      resource: r.type,
      unitCost: parseFloat(marketPrice(r.consumption, r.capacity).toFixed(4)),
      available: r.available,
      consumed: r.consumption,
    })),
    dailyRevenue: parseFloat(dailyRevenue.toFixed(2)),
    dailyExpenses: parseFloat(realExpenses.toFixed(2)),
  };
}
