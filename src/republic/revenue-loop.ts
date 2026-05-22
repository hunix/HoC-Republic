/**
 * Republic Platform — Revenue Loop Orchestrator
 *
 * The autonomous revenue generation master loop.
 * Ties together all revenue-related subsystems into a coherent pipeline:
 *
 *   Market Intelligence → Research → Product Development →
 *   Revenue Harvesting → Payment Collection → Treasury
 *
 * Runs at different cadences:
 *   - Every 500 ticks: Market intelligence scan
 *   - Every 200 ticks: Research assignment and project creation
 *   - Every 100 ticks: Harvester execution
 *   - Every 50 ticks: Payment status checks
 *   - Every 10 ticks: Trading operations
 *   - Every tick: Activity logging
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

// Subsystem imports
import {
    browserAgentTick,
    getBrowserAgentDiagnostics
} from "./browser-agent.js";
import { citizenN8nTick, ensureN8nRunning, getCitizenN8nDiagnostics } from "./citizen-n8n.js";
import {
    conductMarketResearch, getMarketIntelligenceDiagnostics, getTopOpportunities, marketIntelligenceTick
} from "./market-intelligence.js";
import { checkAllPendingInvoices, getPayPalDiagnostics } from "./paypal-connector.js";
import { getPremiumAIDiagnostics } from "./premium-ai-controller.js";
import { getHarvesterDiagnostics, harvesterTick } from "./revenue-harvesters.js";
import { getScreenQueueDiagnostics, screenQueueTick } from "./screen-queue.js";
import { getVaultDiagnostics } from "./secrets-vault.js";
import { getFinancialReport, type FinancialReport } from "./treasury-manager.js";
import { checkVisionAvailability, getVisionDiagnostics } from "./vision-analyzer.js";

const logger = createSubsystemLogger("republic:revenue-loop");

// ─── Types ──────────────────────────────────────────────────────

export type RevenueMode = "simulated" | "live";

export type RevenueStreamType =
  | "trading"
  | "freelance"
  | "content"
  | "affiliate"
  | "saas"
  | "marketplace"
  | "product_sales";

export interface RevenueConfig {
  mode: RevenueMode;
  enabledStreams: Set<RevenueStreamType>;
  maxUsdPerTrade: number;
  maxUsdPerProject: number;
  requireApprovalAbove: number; // USD threshold for manual approval
  autoResearchEnabled: boolean;
  autoProjectsEnabled: boolean;
  autoTradingEnabled: boolean;
}

export interface RevenueActivity {
  id: string;
  type: "scan" | "research" | "project" | "harvest" | "payment" | "trade" | "error";
  description: string;
  amount?: number;
  currency?: string;
  citizenId?: string;
  timestamp: string;
}

export interface RevenueLoopDiagnostics {
  mode: RevenueMode;
  enabledStreams: string[];
  totalActivities: number;
  activitiesByType: Record<string, number>;
  uptime: number;           // Ticks since start
  marketIntelligence: ReturnType<typeof getMarketIntelligenceDiagnostics>;
  browserAgent: ReturnType<typeof getBrowserAgentDiagnostics>;
  harvesters: ReturnType<typeof getHarvesterDiagnostics>;
  paypal: ReturnType<typeof getPayPalDiagnostics>;
  vault: ReturnType<typeof getVaultDiagnostics>;
  financialReport: FinancialReport | null;
  screenQueue: ReturnType<typeof getScreenQueueDiagnostics>;
  citizenN8n: ReturnType<typeof getCitizenN8nDiagnostics>;
  vision: ReturnType<typeof getVisionDiagnostics>;
  premiumAI: ReturnType<typeof getPremiumAIDiagnostics>;
}

// ─── State ──────────────────────────────────────────────────────

const config: RevenueConfig = {
  mode: "simulated",
  enabledStreams: new Set([
    "freelance",
    "content",
    "affiliate",
    "saas",
    "marketplace",
  ]),
  maxUsdPerTrade: 100,
  maxUsdPerProject: 500,
  requireApprovalAbove: 50,
  autoResearchEnabled: true,
  autoProjectsEnabled: true,
  autoTradingEnabled: false, // Disabled by default for safety
};

const activities: RevenueActivity[] = [];
const MAX_ACTIVITIES = 500;
let startTick = -1;

// ─── Configuration ──────────────────────────────────────────────

/**
 * Get the current revenue configuration.
 */
export function getRevenueConfig(): RevenueConfig & { enabledStreams: string[] } {
  return {
    ...config,
    enabledStreams: Array.from(config.enabledStreams) as unknown as string[],
  } as RevenueConfig & { enabledStreams: string[] };
}

/**
 * Update the revenue configuration.
 */
export function setRevenueConfig(updates: Partial<{
  mode: RevenueMode;
  enabledStreams: RevenueStreamType[];
  maxUsdPerTrade: number;
  maxUsdPerProject: number;
  requireApprovalAbove: number;
  autoResearchEnabled: boolean;
  autoProjectsEnabled: boolean;
  autoTradingEnabled: boolean;
}>): void {
  if (updates.mode) {config.mode = updates.mode;}
  if (updates.enabledStreams) {
    config.enabledStreams = new Set(updates.enabledStreams);
  }
  if (updates.maxUsdPerTrade !== undefined) {config.maxUsdPerTrade = updates.maxUsdPerTrade;}
  if (updates.maxUsdPerProject !== undefined) {config.maxUsdPerProject = updates.maxUsdPerProject;}
  if (updates.requireApprovalAbove !== undefined) {config.requireApprovalAbove = updates.requireApprovalAbove;}
  if (updates.autoResearchEnabled !== undefined) {config.autoResearchEnabled = updates.autoResearchEnabled;}
  if (updates.autoProjectsEnabled !== undefined) {config.autoProjectsEnabled = updates.autoProjectsEnabled;}
  if (updates.autoTradingEnabled !== undefined) {config.autoTradingEnabled = updates.autoTradingEnabled;}

  logger.info("Revenue config updated", { mode: config.mode, streams: Array.from(config.enabledStreams) });
}

/**
 * Switch between simulated and live mode.
 */
export function setRevenueMode(mode: RevenueMode): void {
  const prev = config.mode;
  config.mode = mode;
  logActivity("scan", `Revenue mode changed: ${prev} → ${mode}`);
  logger.info(`Revenue mode: ${mode}`);
}

// ─── Activity Logging ───────────────────────────────────────────

function logActivity(
  type: RevenueActivity["type"],
  description: string,
  amount?: number,
  currency?: string,
  citizenId?: string,
): void {
  activities.push({
    id: uid(),
    type,
    description,
    amount,
    currency,
    citizenId,
    timestamp: ts(),
  });

  if (activities.length > MAX_ACTIVITIES) {
    activities.splice(0, activities.length - MAX_ACTIVITIES);
  }
}

// ─── Revenue Loop Phases ────────────────────────────────────────

/**
 * Phase 1: Market Intelligence (every ~500 ticks)
 * Discover demand signals and trending opportunities.
 */
function phaseMarketIntelligence(s: RepublicState): void {
  if (!config.autoResearchEnabled) {return;}

  try {
    marketIntelligenceTick(s);
    logActivity("scan", "Market intelligence scan completed");
  } catch (err) {
    logActivity("error", `Market intelligence error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Phase 2: Research Assignment (every ~200 ticks)
 * Assign citizens to research top opportunities.
 */
function phaseResearchAssignment(s: RepublicState): void {
  if (!config.autoResearchEnabled) {return;}

  const opportunities = getTopOpportunities(5);
  const newSignals = opportunities.filter((o) => o.status === "new");

  if (newSignals.length === 0) {return;}

  // Assign a researcher to the top unresearched signal
  const signal = newSignals[0];
  const researcher = s.citizens.find(
    (c) => c.health > 0 && c.energy > 40 && (c.specialization === "research" || c.specialization === "engineering"),
  );

  if (researcher) {
    const report = conductMarketResearch(s, researcher.id, signal);
    logActivity(
      "research",
      `Research completed: ${signal.category} — ${report.recommendation}`,
      undefined,
      undefined,
      researcher.id,
    );

    if (report.recommendation === "proceed") {
      signal.status = "actionable";
      logActivity("project", `Opportunity actionable: ${signal.category} (score: ${signal.opportunityScore})`);
    }
  }
}

/**
 * Phase 3: Revenue Harvesting (every ~50 ticks)
 * Run all enabled harvesters.
 */
function phaseHarvesting(s: RepublicState): void {
  try {
    harvesterTick(s);
  } catch (err) {
    logActivity("error", `Harvester error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Phase 4: Payment Collection (every ~100 ticks)
 * Check outstanding invoices for payment.
 */
function phasePaymentCollection(s: RepublicState): void {
  if (config.mode !== "live") {return;}

  checkAllPendingInvoices(s)
    .then((paid) => {
      if (paid > 0) {
        logActivity("payment", `${paid} invoice(s) paid`);
      }
    })
    .catch((err) => {
      logActivity("error", `Payment check error: ${err instanceof Error ? err.message : String(err)}`);
    });
}

/**
 * Phase 5: Browser Agent (every 5 ticks)
 * Process browser automation task queue.
 */
function phaseBrowserAgent(s: RepublicState): void {
  try {
    browserAgentTick(s);
  } catch (err) {
    logActivity("error", `Browser agent error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Master Tick ────────────────────────────────────────────────

/**
 * Revenue loop tick — the master orchestrator.
 * Calls subsystems at their respective cadences.
 */
export function revenueLoopTick(s: RepublicState): void {
  const t = s.currentTick;

  if (startTick < 0) {
    startTick = t;
    logActivity("scan", "Revenue loop started");
    logger.info("Revenue loop initialized", { mode: config.mode });

    // Infrastructure initialization: ensure n8n + vision are available
    ensureN8nRunning().catch(() => { /* swallow */ });
    checkVisionAvailability().catch(() => { /* swallow */ });
  }

  // Screen queue: check for expired slots — every 10 ticks (was 5, reduced to cut hot-path overhead)
  if (t % 10 === 0) {
    // Defer off sync tick so it doesn't inflate the tick budget measurement
    setImmediate(() => screenQueueTick(t));
  }

  // Phase 5: Browser Agent — every 5 ticks (most frequent)
  // Deferred: browser I/O work must not block the synchronous citizen-tick pipeline
  if (t % 5 === 0) {
    setImmediate(() => phaseBrowserAgent(s));
  }

  // Phase 3: Revenue Harvesting — every 50 ticks
  // Deferred: harvester can involve async I/O; keep it off the tick budget
  if (t % 50 === 0) {
    setImmediate(() => phaseHarvesting(s));
  }

  // Phase 4: Payment Collection — every 100 ticks
  if (t % 100 === 0) {
    phasePaymentCollection(s); // already async (promise-based), safe to call sync
  }

  // Phase 2: Research Assignment — every 200 ticks
  if (t % 200 === 0) {
    phaseResearchAssignment(s);
  }

  // Citizen n8n health check — every 500 ticks
  if (t % 500 === 0) {
    citizenN8nTick(s);
  }

  // Phase 1: Market Intelligence — every 500 ticks
  if (t % 500 === 0) {
    phaseMarketIntelligence(s);
  }
}

// ─── Query Functions ────────────────────────────────────────────

export function getRevenueActivities(limit = 50, type?: RevenueActivity["type"]): RevenueActivity[] {
  let filtered = activities;
  if (type) {filtered = activities.filter((a) => a.type === type);}
  return filtered.slice(-limit);
}

export function getRecentEarnings(hours = 24): number {
  const cutoff = Date.now() - hours * 3600000;
  return activities
    .filter((a) => a.type === "payment" && a.amount && new Date(a.timestamp).getTime() > cutoff)
    .reduce((sum, a) => sum + (a.amount ?? 0), 0);
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getRevenueLoopDiagnostics(s?: RepublicState): RevenueLoopDiagnostics {
  const byType: Record<string, number> = {};
  for (const a of activities) {
    byType[a.type] = (byType[a.type] ?? 0) + 1;
  }

  let financialReport: FinancialReport | null = null;
  try {
    financialReport = getFinancialReport(s);
  } catch { /* may fail if state not available */ }

  return {
    mode: config.mode,
    enabledStreams: Array.from(config.enabledStreams),
    totalActivities: activities.length,
    activitiesByType: byType,
    uptime: startTick >= 0 ? (s?.currentTick ?? 0) - startTick : 0,
    marketIntelligence: getMarketIntelligenceDiagnostics(),
    browserAgent: getBrowserAgentDiagnostics(),
    harvesters: getHarvesterDiagnostics(),
    paypal: getPayPalDiagnostics(),
    vault: getVaultDiagnostics(),
    financialReport,
    screenQueue: getScreenQueueDiagnostics(),
    citizenN8n: getCitizenN8nDiagnostics(),
    vision: getVisionDiagnostics(),
    premiumAI: getPremiumAIDiagnostics(),
  };
}
