/**
 * Republic Platform — World Intelligence View
 *
 * Formats world intelligence data for the web UI.
 * Provides structured HTML/markdown rendering for:
 * - World intelligence dashboard
 * - CII heatmap table
 * - Threat feed view
 * - Signal convergence alerts
 * - Data freshness panel
 *
 * Access control is enforced at the rendering level:
 * - Government roles: Full CII + convergence + all signals
 * - Security citizens: Threat-classified feed + cyber IOCs
 * - Finance citizens: Economic signals + market data
 * - All citizens: World brief + news headlines
 */

import {
    detectConvergences, generateWorldBrief, getActiveSignals, getCIIScores, getDataFreshness,
    getMonitoredCountries, getNewsFeed, isWorldIntelRunning, type CountryProfile, type DataFreshness as DataFreshnessType, type NewsItem,
    type SignalConvergence, type ThreatSeverity, type WorldBrief
} from "./world-intelligence.js";

// ─── Access Roles ───────────────────────────────────────────────

export type WorldIntelAccessLevel = "government" | "security" | "finance" | "citizen";

const SECURITY_SPECIALIZATIONS = new Set([
  "Strategist",
  "Analyst",
  "Diplomat",
  "Negotiator",
  "Ambassador",
]);

const FINANCE_SPECIALIZATIONS = new Set([
  "Economist",
  "Banker",
  "Trader",
  "Accountant",
]);

/**
 * Determine a citizen's world intelligence access level.
 */
export function resolveAccessLevel(opts: {
  citizenId: string;
  specialization: string;
  isPresident: boolean;
  isDepartmentHead: boolean;
}): WorldIntelAccessLevel {
  if (opts.isPresident || opts.isDepartmentHead) {return "government";}
  if (SECURITY_SPECIALIZATIONS.has(opts.specialization)) {return "security";}
  if (FINANCE_SPECIALIZATIONS.has(opts.specialization)) {return "finance";}
  return "citizen";
}

// ─── Dashboard View ─────────────────────────────────────────────

export interface WorldIntelDashboard {
  running: boolean;
  accessLevel: WorldIntelAccessLevel;
  brief: WorldBrief | null;
  ciiScores: CountryProfile[] | null;
  news: NewsItem[];
  convergences: SignalConvergence[] | null;
  freshness: DataFreshnessType[];
  signalCount: number;
  monitoredCountries: number;
}

/**
 * Build the full dashboard payload for a given access level.
 * The web UI calls this via `republic.worldintel.dashboard` RPC.
 */
export function buildDashboard(accessLevel: WorldIntelAccessLevel): WorldIntelDashboard {
  if (!isWorldIntelRunning()) {
    return {
      running: false,
      accessLevel,
      brief: null,
      ciiScores: null,
      news: [],
      convergences: null,
      freshness: [],
      signalCount: 0,
      monitoredCountries: getMonitoredCountries().length,
    };
  }

  const brief = generateWorldBrief();
  const signals = getActiveSignals();
  const countries = getMonitoredCountries();

  // Access-controlled data
  let ciiScores: CountryProfile[] | null = null;
  let convergences: SignalConvergence[] | null = null;
  let news: NewsItem[] = [];

  switch (accessLevel) {
    case "government":
      // Full access
      ciiScores = getCIIScores();
      convergences = detectConvergences();
      news = getNewsFeed({ limit: 50 });
      break;

    case "security":
      // Threat-classified news + convergences (no CII)
      convergences = detectConvergences();
      news = getNewsFeed({ severity: "medium", limit: 30 });
      break;

    case "finance":
      // Economic news only
      news = getNewsFeed({ limit: 30 }).filter(
        (n) =>
          n.threat?.category === "economic" ||
          n.threat?.category === "infrastructure" ||
          !n.threat,
      );
      break;

    case "citizen":
      // Basic news feed
      news = getNewsFeed({ limit: 20 });
      break;
  }

  return {
    running: true,
    accessLevel,
    brief,
    ciiScores,
    news,
    convergences,
    freshness: getDataFreshness(),
    signalCount: signals.length,
    monitoredCountries: countries.length,
  };
}

// ─── Formatted Rendering ────────────────────────────────────────

/**
 * Render the world brief as a formatted text block.
 * Used for chat responses and text-mode views.
 */
export function renderBriefText(brief: WorldBrief): string {
  const lines: string[] = [];

  // Header
  const threatColor = getThreatColor(brief.threatLevel);
  lines.push(`🌍 **WORLD INTELLIGENCE BRIEF** — ${new Date(brief.generatedAt).toLocaleString()}`);
  lines.push(`**Global Threat Level: ${threatColor} ${brief.threatLevel.toUpperCase()}**`);
  lines.push("");

  // Top stories
  if (brief.topStories.length > 0) {
    lines.push("**Top Stories:**");
    for (const story of brief.topStories.slice(0, 5)) {
      const tag = story.threat
        ? `${getThreatEmoji(story.threat.severity)} [${story.threat.category.toUpperCase()}]`
        : "📰";
      lines.push(`  ${tag} ${story.title}`);
      lines.push(`     _${story.source}_ • ${timeAgo(story.publishedAt)}`);
    }
    lines.push("");
  }

  // Convergences
  if (brief.activeConvergences.length > 0) {
    lines.push("**⚠️ Active Signal Convergences:**");
    for (const conv of brief.activeConvergences.slice(0, 3)) {
      lines.push(`  • ${conv.description}`);
    }
  }

  return lines.join("\n");
}

/**
 * Render CII scores as a formatted table.
 * Government-only view.
 */
export function renderCIITable(scores: CountryProfile[]): string {
  const lines: string[] = [];
  lines.push("🏛️ **COUNTRY INSTABILITY INDEX**");
  lines.push("");
  lines.push("| Country | CII | Trend | Conflict | Protest | Economic | Military | Cyber |");
  lines.push("|---------|-----|-------|----------|---------|----------|----------|-------|");

  for (const c of scores) {
    const trend = c.trend === "rising" ? "📈" : c.trend === "falling" ? "📉" : "➡️";
    const bar = renderBar(c.ciiScore);
    lines.push(
      `| ${c.name} (${c.code}) | ${bar} ${c.ciiScore} | ${trend} | ${c.components.conflictSignals} | ${c.components.protestSignals} | ${c.components.economicStress} | ${c.components.militaryActivity} | ${c.components.cyberThreats} |`,
    );
  }

  return lines.join("\n");
}

// ─── Helpers ────────────────────────────────────────────────────

function getThreatColor(severity: ThreatSeverity): string {
  const map: Record<ThreatSeverity, string> = {
    critical: "🔴",
    high: "🟠",
    medium: "🟡",
    low: "🟢",
    info: "🔵",
  };
  return map[severity];
}

function getThreatEmoji(severity: ThreatSeverity): string {
  const map: Record<ThreatSeverity, string> = {
    critical: "🚨",
    high: "⚠️",
    medium: "🔔",
    low: "📋",
    info: "ℹ️",
  };
  return map[severity];
}

function renderBar(value: number): string {
  const filled = Math.round(value / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {return "just now";}
  if (minutes < 60) {return `${minutes}m ago`;}
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {return `${hours}h ago`;}
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
