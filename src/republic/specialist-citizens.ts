/**
 * Republic Platform — Specialist Citizen Archetypes
 *
 * Defines three expert citizen roles that operate autonomously:
 *
 * 1. IntelligenceAnalyst — monitors world-intel, detects convergences,
 *    files IntelReports every 30 minutes for the highest-CII countries.
 *
 * 2. DataScientistCitizen — runs ML-style forecasting on CII history
 *    and news trends, produces 7-day CII outlook + risk forecasts.
 *
 * 3. PoliticianCitizen — synthesizes reports from Analysts and
 *    Data Scientists, produces policy recommendations and daily briefs.
 *
 * Every citizen in the republic can have a `specialistRole` field set
 * to one of these archetypes. The autonomous loops run on gateway boot.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  generateWorldBrief,
  getCIIScores,
  getEscalationVelocities,
  getIntelReports,
  getNewsFeed,
  getWarRisks,
  getWarSignals,
  submitIntelReport,
} from "./world-intelligence.js";

const logger = createSubsystemLogger("republic:specialists");

// ─── Types ────────────────────────────────────────────────────────

export type SpecialistRole = "IntelligenceAnalyst" | "DataScientistCitizen" | "PoliticianCitizen";

export interface ForecastReport {
  id: string;
  citizenId: string;
  country: string;
  countryName: string;
  /** 7-day CII forecast (day 1..7) */
  ciiTrajectory: number[];
  /** Forecast confidence 0-1 */
  confidence: number;
  riskOutlook: "escalating" | "stable" | "de-escalating";
  narrative: string;
  recommendations: string[];
  generatedAt: number;
}

export interface PolicyBrief {
  id: string;
  citizenId: string;
  title: string;
  executiveSummary: string;
  keyRisks: string[];
  recommendations: string[];
  priorityCountries: string[];
  generatedAt: number;
}

// ─── In-memory stores ─────────────────────────────────────────────

const forecasts: ForecastReport[] = [];
const policyBriefs: PolicyBrief[] = [];
let briefIdCounter = 0;
let forecastIdCounter = 0;

// ─── Analyst Functions ────────────────────────────────────────────

/**
 * IntelligenceAnalyst autonomous action:
 * Generates an IntelReport for the highest-CII country.
 */
export function analystAutoReport(citizenId: string, citizenName: string): void {
  try {
    const scores = getCIIScores();
    // oxlint-disable-next-line curly
    if (scores.length === 0) return;

    const hotspot = scores[0];
    const risks = getWarRisks(hotspot.code);
    const risk = risks[0];
    const news = getNewsFeed({ country: hotspot.code, limit: 5 });
    const escalations = getEscalationVelocities().filter((v) => v.country === hotspot.code);
    const signals = getWarSignals().filter((s) => s.country === hotspot.code);

    const findings: string[] = [
      `CII Score: ${hotspot.ciiScore}/100 (floor: ${hotspot.floor}) — trend: ${hotspot.trend}`,
      risk
        ? `War Risk Score: ${risk.score}/100 — escalating: ${risk.escalating}`
        : "War risk: no data",
      escalations.length > 0
        ? `6h CII velocity: ${escalations[0].delta6h > 0 ? "+" : ""}${escalations[0].delta6h.toFixed(1)}`
        : "Escalation velocity: stable",
      signals.length > 0
        ? `Active war signals (${signals[0].factorCount}/5): ${signals[0].activeFactors.join(", ")}`
        : "No active war signal detection",
      `Recent news: ${news.length} items in feed`,
      risk?.summary ?? "",
    ].filter(Boolean);

    const severity =
      hotspot.ciiScore >= 70 ? "critical" : hotspot.ciiScore >= 50 ? "high" : "medium";
    const summary = [
      `[AUTO ANALYSIS] ${hotspot.name} remains the highest-instability monitored country.`,
      `CII: ${hotspot.ciiScore}/100. ${risk ? `War risk at ${risk.score}/100.` : ""}`,
      risk?.escalating ? "⚡ ESCALATING — accelerating risk trajectory." : "",
    ]
      .filter(Boolean)
      .join(" ");

    submitIntelReport({
      citizenId,
      target: hotspot.code,
      summary,
      findings,
      warRiskEstimate: risk?.score ?? null,
      sources: ["WorldIntel Engine", "CII Model", "RSS Feeds", citizenName],
    });

    logger.info(`IntelAnalyst:${citizenName} filed auto-report: ${hotspot.name} (CII ${hotspot.ciiScore}, severity: ${severity})`);
  } catch (err) {
    logger.warn(`IntelAnalyst auto-report error: ${String(err)}`);
  }
}

// ─── Data Scientist Functions ────────────────────────────────────

/**
 * DataScientistCitizen autonomous action:
 * Runs a simplified linear regression on CII trend to produce a 7-day outlook.
 */
export function dataSciAutoForecast(citizenId: string): void {
  try {
    const scores = getCIIScores();
    const velocities = getEscalationVelocities();
    const velMap = new Map(velocities.map((v) => [v.country, v]));

    // Pick top 5 most volatile countries
    const targets = scores
      .filter((c) => c.ciiScore > 20)
      .toSorted(
        (a, b) =>
          Math.abs(velMap.get(b.code)?.delta6h ?? 0) - Math.abs(velMap.get(a.code)?.delta6h ?? 0),
      )
      .slice(0, 5);

    for (const country of targets) {
      const vel = velMap.get(country.code);
      // oxlint-disable-next-line curly
      if (!vel) continue;

      // Simple linear extrapolation using 6h velocity, decaying to zero
      const dailyDelta = vel.delta24h;
      const trajectory: number[] = [];
      let current = country.ciiScore;

      for (let day = 1; day <= 7; day++) {
        // Apply decaying velocity (halves every 2 days)
        const decay = Math.pow(0.75, day - 1);
        current = Math.max(country.floor, Math.min(100, current + dailyDelta * decay));
        trajectory.push(Math.round(current * 10) / 10);
      }

      const finalDay7 = trajectory[6] ?? current;
      const outlook: ForecastReport["riskOutlook"] =
        finalDay7 > country.ciiScore + 5
          ? "escalating"
          : finalDay7 < country.ciiScore - 5
            ? "de-escalating"
            : "stable";

      const confidence = Math.min(0.9, 0.4 + country.ciiScore / 200);

      const recommendations: string[] = [];
      if (outlook === "escalating" && finalDay7 >= 70) {
        recommendations.push(`ALERT: ${country.name} trending toward CRITICAL within 7 days.`);
        recommendations.push("Recommend: Intelligence Analyst deep-dive, diplomatic monitoring.");
      } else if (outlook === "escalating") {
        recommendations.push(`${country.name} instability increasing — watch trajectory.`);
      } else if (outlook === "de-escalating") {
        recommendations.push(`${country.name} showing signs of stabilization.`);
      } else {
        recommendations.push(`${country.name} remains stable. Continue monitoring.`);
      }

      const forecast: ForecastReport = {
        id: `fc-${++forecastIdCounter}`,
        citizenId,
        country: country.code,
        countryName: country.name,
        ciiTrajectory: trajectory,
        confidence,
        riskOutlook: outlook,
        narrative: [
          `7-day CII forecast for ${country.name}:`,
          `Current: ${country.ciiScore}/100 → Day 7 projection: ${finalDay7.toFixed(1)}/100`,
          `Outlook: ${outlook.toUpperCase()} (confidence: ${(confidence * 100).toFixed(0)}%)`,
          `Velocity: 1h ${vel.delta1h > 0 ? "+" : ""}${vel.delta1h.toFixed(1)}, 6h ${vel.delta6h > 0 ? "+" : ""}${vel.delta6h.toFixed(1)}, 24h ${vel.delta24h > 0 ? "+" : ""}${vel.delta24h.toFixed(1)}`,
        ].join("\n"),
        recommendations,
        generatedAt: Date.now(),
      };

      forecasts.unshift(forecast);
    }

    // oxlint-disable-next-line curly
    if (forecasts.length > 500) forecasts.length = 500;

    logger.info(`DataScientist generated ${targets.length} CII forecasts`);
  } catch (err) {
    logger.warn(`DataScientist forecast error: ${String(err)}`);
  }
}

// ─── Politician Functions ─────────────────────────────────────────

/**
 * PoliticianCitizen autonomous action:
 * Synthesizes recent intel reports + forecasts into a policy brief.
 */
export function politicianDailyBrief(citizenId: string, citizenName: string): void {
  try {
    const brief = generateWorldBrief();
    const recentReports = getIntelReports({ limit: 10 });
    const recentForecasts = forecasts.slice(0, 5);
    const warRisks = getWarRisks().slice(0, 5);
    const escalating = warRisks.filter((r) => r.escalating);

    const priorityCountries = [
      ...new Set([
        ...escalating.map((r) => r.countryName),
        ...recentForecasts.filter((f) => f.riskOutlook === "escalating").map((f) => f.countryName),
      ]),
    ].slice(0, 5);

    const keyRisks: string[] = [];
    for (const r of warRisks.slice(0, 3)) {
      keyRisks.push(
        `${r.countryName}: war risk ${r.score}/100${r.escalating ? " ⚡ ESCALATING" : ""}`,
      );
    }
    for (const f of recentForecasts.filter((f) => f.riskOutlook === "escalating").slice(0, 2)) {
      keyRisks.push(
        `${f.countryName}: 7-day CII trend → ${f.ciiTrajectory[6]?.toFixed(0) ?? "?"} (${f.riskOutlook})`,
      );
    }

    const recommendations: string[] = [
      escalating.length > 0
        ? `Immediate: Monitor ${escalating.map((r) => r.countryName).join(", ")} — war signals active.`
        : "No active escalations require immediate attention.",
      `Global threat level: ${brief.threatLevel.toUpperCase()}`,
      recentForecasts.length > 0
        ? `Data Science forecast: ${recentForecasts[0].countryName} ${recentForecasts[0].riskOutlook} over 7 days.`
        : "",
      recentReports.length > 0
        ? `${recentReports.length} intel reports filed since last brief — review critical findings.`
        : "No new intel reports.",
    ].filter(Boolean);

    const executiveSummary = [
      `Global Threat Level: **${brief.threatLevel.toUpperCase()}**`,
      brief.summary.split("\n")[0],
      priorityCountries.length > 0
        ? `Priority countries for monitoring: ${priorityCountries.join(", ")}.`
        : "",
      escalating.length > 0
        ? `⚡ ${escalating.length} country/ies escalating: ${escalating.map((r) => r.countryName).join(", ")}.`
        : "No active escalations.",
    ]
      .filter(Boolean)
      .join(" ");

    const policy: PolicyBrief = {
      id: `pb-${++briefIdCounter}`,
      citizenId,
      title: `Daily Policy Brief — ${new Date().toDateString()}`,
      executiveSummary,
      keyRisks,
      recommendations,
      priorityCountries,
      generatedAt: Date.now(),
    };

    policyBriefs.unshift(policy);
    // oxlint-disable-next-line curly
    if (policyBriefs.length > 200) policyBriefs.length = 200;

    logger.info(`Politician:${citizenName} filed daily policy brief — threat: ${brief.threatLevel}, priorities: ${priorityCountries.join(", ")}`);
  } catch (err) {
    logger.warn(`Politician daily brief error: ${String(err)}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────

/** Get recent forecasts (optionally filtered by country) */
export function getForecasts(params?: { country?: string; limit?: number }): ForecastReport[] {
  let items = [...forecasts];
  if (params?.country) {
    items = items.filter((f) => f.country === params.country!.toUpperCase());
  }
  return items.slice(0, params?.limit ?? 20);
}

/** Get recent policy briefs */
export function getPolicyBriefs(params?: { limit?: number }): PolicyBrief[] {
  return policyBriefs.slice(0, params?.limit ?? 10);
}

/**
 * Build specialist context injection for citizen prompts.
 * Returns extra system prompt lines based on citizen specialist role.
 */
export function buildSpecialistPromptContext(role: SpecialistRole): string {
  const lines: string[] = [];

  if (role === "IntelligenceAnalyst") {
    const scores = getCIIScores().slice(0, 5);
    const signals = getWarSignals().slice(0, 3);
    lines.push("=== INTELLIGENCE ANALYST BRIEFING ===");
    lines.push(
      "You are an expert Intelligence Analyst. Your mission: monitor world events, analyze threats, and file IntelReports.",
    );
    lines.push("Use query_world_intel and semantic_news_search to research countries.");
    lines.push("Use submit_intel_report to file your analysis for Politician citizens.");
    lines.push("");
    lines.push("TOP INSTABILITY HOT SPOTS:");
    for (const c of scores) {
      const vel = getEscalationVelocities().find((v) => v.country === c.code);
      lines.push(
        `  ${c.code}: CII=${c.ciiScore} trend=${c.trend}${vel ? ` vel6h=${vel.delta6h > 0 ? "+" : ""}${vel.delta6h.toFixed(1)}` : ""}`,
      );
    }
    if (signals.length > 0) {
      lines.push("ACTIVE WAR SIGNALS:");
      for (const s of signals) {
        lines.push(
          `  ${s.country}: ${s.riskLevel} (${s.factorCount}/5 factors) — ${s.activeFactors.slice(0, 2).join(", ")}`,
        );
      }
    }
    lines.push("===================");
  }

  if (role === "DataScientistCitizen") {
    const recent = forecasts.slice(0, 3);
    lines.push("=== DATA SCIENTIST BRIEFING ===");
    lines.push("You are an expert Data Scientist specializing in geopolitical risk modeling.");
    lines.push(
      "You analyze CII trends, escalation velocities, news sentiment, and produce probabilistic forecasts.",
    );
    lines.push(
      "Your outputs (ForecastReports) are read by Politician citizens for decision-making.",
    );
    lines.push("");
    if (recent.length > 0) {
      lines.push("RECENT FORECASTS:");
      for (const f of recent) {
        lines.push(
          `  ${f.countryName}: ${f.riskOutlook} (7d: ${f.ciiTrajectory[6]?.toFixed(0) ?? "?"}/100, conf: ${(f.confidence * 100).toFixed(0)}%)`,
        );
      }
    }
    lines.push("===================");
  }

  if (role === "PoliticianCitizen") {
    const briefs = policyBriefs.slice(0, 2);
    const latestReports = getIntelReports({ limit: 5 });
    const recentForecasts = forecasts.slice(0, 3);
    lines.push("=== POLITICIAN BRIEFING ===");
    lines.push("You are an expert Politician and strategic decision-maker in the Republic.");
    lines.push(
      "You receive intelligence from Analysts and Data Scientists and formulate policy recommendations.",
    );
    lines.push(
      "You field questions about geopolitical stability, war risk, and strategic posture.",
    );
    lines.push("");
    if (latestReports.length > 0) {
      lines.push("INTEL REPORTS INBOX:");
      for (const r of latestReports) {
        lines.push(
          `  [${r.id}] ${r.target}: ${r.summary.slice(0, 100)}... (risk: ${r.warRiskEstimate ?? "N/A"})`,
        );
      }
    }
    if (recentForecasts.length > 0) {
      lines.push("FORECAST INBOX:");
      for (const f of recentForecasts) {
        lines.push(
          `  ${f.countryName}: ${f.riskOutlook} 7-day outlook (${(f.confidence * 100).toFixed(0)}% conf)`,
        );
      }
    }
    if (briefs.length > 0) {
      lines.push("LAST POLICY BRIEF:");
      lines.push(`  "${briefs[0].executiveSummary.slice(0, 200)}"`);
    }
    lines.push("===================");
  }

  return lines.join("\n");
}

// ─── Autonomous timers ─────────────────────────────────────────────

interface SpecialistCitizenDef {
  citizenId: string;
  citizenName: string;
  role: SpecialistRole;
}

const activeTimers: NodeJS.Timer[] = [];
const ANALYST_INTERVAL_MS = 30 * 60_000; // 30 minutes
const FORECAST_INTERVAL_MS = 2 * 60 * 60_000; // 2 hours
const BRIEF_INTERVAL_MS = 6 * 60 * 60_000; // 6 hours

/**
 * Register specialist citizens and start their autonomous loops.
 * Call this once on gateway startup after world intelligence is running.
 */
export function startSpecialistCitizenLoops(Citizens: SpecialistCitizenDef[]): void {
  for (const c of Citizens) {
    if (c.role === "IntelligenceAnalyst") {
      const timer = setInterval(
        () => analystAutoReport(c.citizenId, c.citizenName),
        ANALYST_INTERVAL_MS,
      );
      activeTimers.push(timer);
      // Run immediately
      setTimeout(() => analystAutoReport(c.citizenId, c.citizenName), 5000);
    }
    if (c.role === "DataScientistCitizen") {
      const timer = setInterval(() => dataSciAutoForecast(c.citizenId), FORECAST_INTERVAL_MS);
      activeTimers.push(timer);
      setTimeout(() => dataSciAutoForecast(c.citizenId), 10000);
    }
    if (c.role === "PoliticianCitizen") {
      const timer = setInterval(
        () => politicianDailyBrief(c.citizenId, c.citizenName),
        BRIEF_INTERVAL_MS,
      );
      activeTimers.push(timer);
      setTimeout(() => politicianDailyBrief(c.citizenId, c.citizenName), 15000);
    }
  }
  logger.info(`${Citizens.length} specialist loops started`);
}

/** Stop all specialist loops (call on shutdown). */
export function stopSpecialistCitizenLoops(): void {
  // oxlint-disable-next-line curly
  for (const t of activeTimers) clearInterval(t as unknown as ReturnType<typeof setInterval>);
  activeTimers.length = 0;
  logger.info("All specialist loops stopped");
}
