/**
 * Republic Platform — Living Economy Ledger
 *
 * Double-entry accounting system that gives Republic credits real meaning.
 * Every credit transfer is recorded with category, reason, and tick.
 *
 * Features:
 *   - Real LLM cost tracking: every inference call debits citizen credits
 *   - Artifact rewards: produced code/research/art earns credits
 *   - GDP calculation: total production value per epoch
 *   - Inflation tracking: credit supply growth rate
 *   - Treasury management: collective republic wealth
 *   - Per-citizen balance sheets
 */

import type { Citizen, RepublicState } from "./types.js";
import {
  recordTransaction,
  getBalance,
  getGDP,
  getLLMCosts,
  getTransactions,
} from "./republic-sqlite.js";

// ─── Configuration ──────────────────────────────────────────────

/** Credits earned per unit of artifact quality */
const ARTIFACT_REWARD_RATE = 10;

/** Cost per 1000 tokens of LLM inference */
const TOKEN_COST_PER_1K: Record<string, number> = {
  gemini: 0.5,
  openai: 2.0,
  anthropic: 3.0,
  groq: 0.3,
  openrouter: 1.5,
  ollama: 0.0,
  lmstudio: 0.0,
};

/** Starting credits for new citizens */
export const INITIAL_CITIZEN_CREDITS = 1000;

/** Treasury entity ID */
const TREASURY = "republic:treasury";

/** Salary per tick for working citizens */
const BASE_SALARY_PER_TICK = 5;

// ─── LLM Cost Tracking ─────────────────────────────────────────

/**
 * Debit a citizen for an LLM inference call.
 * Called after every cloud LLM call in the agent runtime.
 */
export async function debitLLMCost(
  citizenId: string,
  provider: string,
  tokensUsed: number,
  tick: number,
): Promise<number> {
  const costPer1k = TOKEN_COST_PER_1K[provider.toLowerCase()] ?? 1.0;
  const cost = (tokensUsed / 1000) * costPer1k;

  if (cost > 0) {
    await recordTransaction({
      from_entity: citizenId,
      to_entity: TREASURY,
      amount: cost,
      reason: `LLM inference: ${provider} (${tokensUsed} tokens)`,
      category: "llm_cost",
      tick,
    });
  }

  return cost;
}

// ─── Artifact Rewards ───────────────────────────────────────────

/**
 * Credit a citizen for producing a real artifact.
 * Called after successful tool execution (code, research, art).
 */
export async function creditArtifactReward(
  citizenId: string,
  artifactType: string,
  qualityScore: number,
  tick: number,
): Promise<number> {
  const reward = ARTIFACT_REWARD_RATE * qualityScore;

  await recordTransaction({
    from_entity: TREASURY,
    to_entity: citizenId,
    amount: reward,
    reason: `Artifact produced: ${artifactType} (quality: ${(qualityScore * 100).toFixed(0)}%)`,
    category: "artifact_reward",
    tick,
  });

  return reward;
}

// ─── Salary System ──────────────────────────────────────────────

/**
 * Pay salary to all active citizens.
 * Called once per tick from the economy engine.
 */
export async function paySalaries(s: RepublicState): Promise<number> {
  let totalPaid = 0;

  for (const citizen of s.citizens) {
    if (citizen.energy <= 0) {continue;} // Only pay active citizens

    const salary = BASE_SALARY_PER_TICK * (1 + (citizen.skills?.length ?? 0) * 0.1);
    await recordTransaction({
      from_entity: TREASURY,
      to_entity: citizen.id,
      amount: salary,
      reason: "Tick salary",
      category: "salary",
      tick: s.currentTick,
    });

    citizen.credits += salary;
    totalPaid += salary;
  }

  return totalPaid;
}

// ─── Trading ────────────────────────────────────────────────────

/**
 * Execute a trade between two citizens.
 */
export async function executeTrade(
  fromCitizen: Citizen,
  toCitizen: Citizen,
  amount: number,
  reason: string,
  tick: number,
): Promise<{ ok: boolean; error?: string }> {
  if (amount <= 0) {return { ok: false, error: "Amount must be positive" };}
  if (fromCitizen.credits < amount) {return { ok: false, error: "Insufficient credits" };}

  await recordTransaction({
    from_entity: fromCitizen.id,
    to_entity: toCitizen.id,
    amount,
    reason,
    category: "trade",
    tick,
  });

  fromCitizen.credits -= amount;
  toCitizen.credits += amount;

  return { ok: true };
}

// ─── Economic Indicators ────────────────────────────────────────

export interface EconomicReport {
  gdp: number;
  llmCosts: number;
  netProduction: number;
  treasuryBalance: number;
  totalCitizenWealth: number;
  avgCitizenWealth: number;
  giniCoefficient: number;
  inflationRate: number;
}

/**
 * Generate an economic report for the Republic.
 */
export async function generateEconomicReport(
  s: RepublicState,
  epochTicks: number = 100,
): Promise<EconomicReport> {
  const fromTick = Math.max(0, s.currentTick - epochTicks);
  const toTick = s.currentTick;

  const gdp = await getGDP(fromTick, toTick);
  const llmCosts = await getLLMCosts(fromTick, toTick);
  const treasuryBalance = await getBalance(TREASURY);

  // Citizen wealth distribution
  const wealths = s.citizens.map((c) => c.credits);
  const totalWealth = wealths.reduce((a, b) => a + b, 0);
  const avgWealth = s.citizens.length > 0 ? totalWealth / s.citizens.length : 0;

  // Gini coefficient (inequality measure)
  let gini = 0;
  if (s.citizens.length > 1 && totalWealth > 0) {
    const sorted = [...wealths].toSorted((a, b) => a - b);
    let sumDiff = 0;
    for (let i = 0; i < sorted.length; i++) {
      for (let j = 0; j < sorted.length; j++) {
        sumDiff += Math.abs(sorted[i] - sorted[j]);
      }
    }
    gini = sumDiff / (2 * sorted.length * totalWealth);
  }

  // Inflation: compare credit supply vs previous epoch
  const prevGDP = fromTick >= epochTicks ? await getGDP(fromTick - epochTicks, fromTick) : gdp;
  const inflationRate = prevGDP > 0 ? (gdp - prevGDP) / prevGDP : 0;

  return {
    gdp,
    llmCosts,
    netProduction: gdp - llmCosts,
    treasuryBalance,
    totalCitizenWealth: totalWealth,
    avgCitizenWealth: avgWealth,
    giniCoefficient: parseFloat(gini.toFixed(4)),
    inflationRate: parseFloat(inflationRate.toFixed(4)),
  };
}

/**
 * Get per-citizen balance from ledger.
 */
export async function getCitizenBalance(citizenId: string): Promise<number> {
  return getBalance(citizenId);
}

/**
 * Get transaction history for a citizen.
 */
export async function getCitizenTransactions(citizenId: string, limit = 20) {
  return getTransactions(citizenId, limit);
}

/**
 * Economy tick: periodic economic updates.
 * Called from the tick orchestrator.
 */
export async function economyLedgerTick(s: RepublicState): Promise<void> {
  // Pay salaries every 10 ticks
  if (s.currentTick % 10 === 0) {
    await paySalaries(s);
  }
}
