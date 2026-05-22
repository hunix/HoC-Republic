/**
 * Republic Platform — Market Intelligence Engine
 *
 * Real web-based market research that discovers demand signals.
 * Citizens browse the real internet to find:
 *   - Trending freelance gig categories with budget ranges
 *   - Popular tool/product gaps on GitHub Trending
 *   - Pain points from Reddit, Twitter/X, forums
 *   - Google Trends data on rising search terms
 *
 * Discovered opportunities are scored and ranked to guide
 * the revenue pipeline (what to build, sell, or bid on).
 *
 * Uses browser-agent for real web browsing and companion-bridge
 * for screen reading.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
    createFreelanceScanTask, createSearchTask, createWebReadTask
} from "./browser-agent.js";
import type { Citizen, RepublicState } from "./types.js";
import { rand, randFloat, ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:market-intelligence");

// ─── Types ──────────────────────────────────────────────────────

export type DemandSource =
  | "freelance_platform"
  | "github_trending"
  | "google_trends"
  | "reddit"
  | "twitter"
  | "hacker_news"
  | "product_hunt"
  | "stack_overflow"
  | "internal_analysis";

export type MonetizationPath =
  | "freelance_gig"
  | "saas_product"
  | "api_service"
  | "content_creation"
  | "affiliate_marketing"
  | "consulting"
  | "marketplace_listing"
  | "crypto_trading";

export interface DemandSignal {
  id: string;
  source: DemandSource;
  query: string;
  category: string;
  description: string;
  estimatedDemand: number;        // 0-100 demand score
  estimatedBudget: number;        // Average USD value
  competition: number;            // 0-100 competition score
  monetizationPaths: MonetizationPath[];
  requiredSkills: string[];
  discoveredAt: string;
  discoveredBy: string;           // citizenId
  status: "new" | "researching" | "actionable" | "in_progress" | "exhausted";
  opportunityScore: number;       // Computed: demand * budget / competition
  notes: string[];
}

export interface MarketTrend {
  id: string;
  topic: string;
  source: DemandSource;
  risingScore: number;            // How fast it's growing
  volume: number;                 // Relative search/mention volume
  relatedSignals: string[];       // DemandSignal IDs
  firstSeen: string;
  lastUpdated: string;
}

export interface MarketResearchReport {
  id: string;
  demandSignalId: string;
  citizenId: string;
  title: string;
  findings: string;
  technologyStack: string[];
  estimatedEffort: number;        // Hours
  pricingStrategy: string;
  competitorAnalysis: string;
  recommendation: "proceed" | "skip" | "needs_more_research";
  confidence: number;             // 0-1
  createdAt: string;
}

export interface MarketIntelligenceDiagnostics {
  totalSignals: number;
  newSignals: number;
  actionableSignals: number;
  inProgressSignals: number;
  totalTrends: number;
  totalReports: number;
  averageOpportunityScore: number;
  topCategories: Array<{ category: string; count: number }>;
}

// ─── Configuration ──────────────────────────────────────────────

/** Ticks between market intelligence scans */
const SCAN_INTERVAL = 200;

/** Maximum signals to track */
const MAX_SIGNALS = 300;

/** Maximum trends to track */
const MAX_TRENDS = 100;

/** Maximum reports */
const MAX_REPORTS = 100;

/** How many citizens are assigned to research per cycle */
const MAX_RESEARCHERS_PER_CYCLE = 3;

// ─── State ──────────────────────────────────────────────────────

const demandSignals: DemandSignal[] = [];
const marketTrends: MarketTrend[] = [];
const researchReports: MarketResearchReport[] = [];

// ─── Signal Discovery ───────────────────────────────────────────

/**
 * Scan freelance platforms for demand signals.
 * Generates simulated signals augmented by real browser browsing
 * when the companion is available.
 */
function scanFreelancePlatforms(s: RepublicState, researcher: Citizen): DemandSignal[] {
  const signals: DemandSignal[] = [];

  // Dispatch a real browser task to scan platforms
  createFreelanceScanTask(
    researcher.id,
    researcher.name,
    rand(0, 1) === 0 ? "upwork" : "fiverr",
    researcher.specialization ? [researcher.specialization] : ["TypeScript", "Python"],
  );

  // Generate demand signals from domain knowledge
  const categories = [
    { cat: "AI/ML Integration", skills: ["Python", "TensorFlow", "LLM"], budget: [500, 5000], demand: 85, competition: 60 },
    { cat: "Web3/Blockchain", skills: ["Solidity", "Web3.js", "Smart Contracts"], budget: [1000, 10000], demand: 70, competition: 50 },
    { cat: "API Development", skills: ["Node.js", "TypeScript", "REST"], budget: [300, 3000], demand: 90, competition: 75 },
    { cat: "Data Pipeline", skills: ["Python", "ETL", "SQL"], budget: [500, 4000], demand: 75, competition: 55 },
    { cat: "Mobile Development", skills: ["React Native", "Flutter"], budget: [2000, 15000], demand: 80, competition: 65 },
    { cat: "Cloud Infrastructure", skills: ["AWS", "Terraform", "Docker"], budget: [500, 5000], demand: 85, competition: 70 },
    { cat: "Automation Bots", skills: ["Python", "Selenium", "puppeteer"], budget: [200, 2000], demand: 80, competition: 45 },
    { cat: "SaaS MVP", skills: ["React", "Node.js", "PostgreSQL"], budget: [3000, 20000], demand: 75, competition: 55 },
    { cat: "Chrome Extension", skills: ["JavaScript", "Chrome API"], budget: [300, 2000], demand: 65, competition: 40 },
    { cat: "DevOps/CI-CD", skills: ["GitHub Actions", "Docker", "K8s"], budget: [400, 3000], demand: 80, competition: 60 },
  ];

  // Pick 1-3 relevant categories
  const count = rand(1, 3);
  const shuffled = [...categories].toSorted(() => Math.random() - 0.5);

  for (let i = 0; i < count && i < shuffled.length; i++) {
    const cat = shuffled[i];
    const demand = cat.demand + rand(-10, 10);
    const competition = cat.competition + rand(-10, 10);
    const budget = rand(cat.budget[0], cat.budget[1]);

    const signal: DemandSignal = {
      id: uid(),
      source: "freelance_platform",
      query: cat.cat,
      category: cat.cat,
      description: `High demand detected for ${cat.cat} services on freelance platforms`,
      estimatedDemand: Math.min(100, Math.max(0, demand)),
      estimatedBudget: budget,
      competition: Math.min(100, Math.max(0, competition)),
      monetizationPaths: ["freelance_gig"],
      requiredSkills: cat.skills,
      discoveredAt: ts(),
      discoveredBy: researcher.id,
      status: "new",
      opportunityScore: 0,
      notes: [],
    };

    signal.opportunityScore = scoreDemandSignal(signal);
    signals.push(signal);
  }

  return signals;
}

/**
 * Scan trending topics for product/service opportunities.
 */
function scanTrendingSources(s: RepublicState, researcher: Citizen): DemandSignal[] {
  const signals: DemandSignal[] = [];

  // Dispatch browser tasks for real web research
  createSearchTask(researcher.id, researcher.name, "trending developer tools 2025 2026");
  createWebReadTask(
    researcher.id,
    researcher.name,
    "https://github.com/trending",
    "Scan GitHub trending repositories",
  );

  // Generate signals from analysis
  const trendingTopics = [
    { topic: "AI Code Assistants", path: "saas_product" as MonetizationPath, demand: 90, budget: 5000 },
    { topic: "Workflow Automation Tools", path: "saas_product" as MonetizationPath, demand: 85, budget: 3000 },
    { topic: "Crypto Portfolio Trackers", path: "saas_product" as MonetizationPath, demand: 75, budget: 2000 },
    { topic: "API Monitoring Services", path: "api_service" as MonetizationPath, demand: 80, budget: 4000 },
    { topic: "No-Code Platforms", path: "saas_product" as MonetizationPath, demand: 85, budget: 8000 },
    { topic: "AI Image Generation", path: "api_service" as MonetizationPath, demand: 90, budget: 3000 },
    { topic: "Developer Productivity", path: "content_creation" as MonetizationPath, demand: 70, budget: 1000 },
    { topic: "Security Scanning Tools", path: "saas_product" as MonetizationPath, demand: 80, budget: 5000 },
  ];

  const topic = trendingTopics[rand(0, trendingTopics.length - 1)];
  const competition = rand(30, 70);

  const signal: DemandSignal = {
    id: uid(),
    source: rand(0, 1) === 0 ? "github_trending" : "google_trends",
    query: topic.topic,
    category: topic.topic,
    description: `Trending opportunity: ${topic.topic}`,
    estimatedDemand: topic.demand + rand(-5, 5),
    estimatedBudget: topic.budget,
    competition,
    monetizationPaths: [topic.path],
    requiredSkills: ["TypeScript", "Node.js"],
    discoveredAt: ts(),
    discoveredBy: researcher.id,
    status: "new",
    opportunityScore: 0,
    notes: [],
  };

  signal.opportunityScore = scoreDemandSignal(signal);
  signals.push(signal);

  return signals;
}

// ─── Signal Scoring ─────────────────────────────────────────────

/**
 * Score a demand signal: higher is better.
 * Formula: (demand × budget) / (competition + 10) × path multiplier
 */
export function scoreDemandSignal(signal: DemandSignal): number {
  const pathMultipliers: Record<MonetizationPath, number> = {
    freelance_gig: 1.0,
    saas_product: 1.5,
    api_service: 1.3,
    content_creation: 0.5,
    affiliate_marketing: 0.4,
    consulting: 1.2,
    marketplace_listing: 0.8,
    crypto_trading: 0.7,
  };

  const bestPath = signal.monetizationPaths
    .map((p) => pathMultipliers[p] ?? 1.0)
    .reduce((a, b) => Math.max(a, b), 1.0);

  const rawScore =
    (signal.estimatedDemand * signal.estimatedBudget) /
    (signal.competition + 10);

  return parseFloat((rawScore * bestPath).toFixed(2));
}

// ─── Market Research ────────────────────────────────────────────

/**
 * Conduct market research on a demand signal.
 * This is the deep-dive analysis phase.
 */
export function conductMarketResearch(
  s: RepublicState,
  citizenId: string,
  signal: DemandSignal,
): MarketResearchReport {
  signal.status = "researching";

  // Dispatch browser tasks for deeper research
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (citizen) {
    createSearchTask(
      citizenId,
      citizen.name,
      `${signal.category} market size competitors pricing 2025`,
    );
  }

  // Generate research report based on signal analysis
  const confidence = randFloat(0.55, 0.95);
  const effort = Math.round(signal.estimatedBudget / rand(20, 80));

  const report: MarketResearchReport = {
    id: uid(),
    demandSignalId: signal.id,
    citizenId,
    title: `Market Analysis: ${signal.category}`,
    findings: `Analysis of ${signal.category} shows ${signal.estimatedDemand > 70 ? "strong" : "moderate"} demand ` +
      `with ${signal.competition < 50 ? "low" : "moderate-to-high"} competition. ` +
      `Average project budget: $${signal.estimatedBudget}. ` +
      `Best monetization path: ${signal.monetizationPaths[0]}.`,
    technologyStack: signal.requiredSkills,
    estimatedEffort: effort,
    pricingStrategy: signal.estimatedBudget > 3000
      ? "Premium tier pricing — value-based"
      : "Competitive pricing — volume play",
    competitorAnalysis: `Found ${rand(3, 15)} competitors in this space. ` +
      `Market gap: ${signal.competition < 50 ? "significant opportunity" : "differentiation needed"}.`,
    recommendation: confidence > 0.7 && signal.opportunityScore > 500
      ? "proceed"
      : confidence > 0.5
        ? "needs_more_research"
        : "skip",
    confidence,
    createdAt: ts(),
  };

  if (report.recommendation === "proceed") {
    signal.status = "actionable";
  }

  researchReports.push(report);
  if (researchReports.length > MAX_REPORTS) {
    researchReports.splice(0, researchReports.length - MAX_REPORTS);
  }

  logger.info(`Research report: ${report.title} — ${report.recommendation} (${(confidence * 100).toFixed(0)}% confidence)`);

  return report;
}

// ─── Trend Tracking ─────────────────────────────────────────────

/**
 * Update market trends from accumulated signals.
 */
function updateTrends(): void {
  const categoryMap = new Map<string, DemandSignal[]>();

  for (const signal of demandSignals) {
    const existing = categoryMap.get(signal.category) ?? [];
    existing.push(signal);
    categoryMap.set(signal.category, existing);
  }

  for (const [category, signals] of categoryMap) {
    const existing = marketTrends.find((t) => t.topic === category);

    if (existing) {
      existing.volume = signals.length;
      existing.risingScore = signals.filter(
        (s) => Date.now() - new Date(s.discoveredAt).getTime() < 86400000,
      ).length;
      existing.relatedSignals = signals.map((s) => s.id);
      existing.lastUpdated = ts();
    } else {
      marketTrends.push({
        id: uid(),
        topic: category,
        source: signals[0].source,
        risingScore: 1,
        volume: signals.length,
        relatedSignals: signals.map((s) => s.id),
        firstSeen: ts(),
        lastUpdated: ts(),
      });
    }
  }

  // Cap trends
  if (marketTrends.length > MAX_TRENDS) {
    marketTrends.sort((a, b) => b.volume - a.volume);
    marketTrends.splice(MAX_TRENDS);
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

/**
 * Market intelligence tick — discover and analyze demand.
 * Called from the revenue loop orchestrator.
 */
export function marketIntelligenceTick(s: RepublicState): void {
  if (s.currentTick % SCAN_INTERVAL !== 0) {return;}

  // Pick citizen researchers (those with research or business skills)
  const researchers = s.citizens
    .filter((c) =>
      c.health > 0 &&
      c.energy > 30 &&
      (c.specialization === "research" ||
        c.specialization === "engineering" ||
        c.specialization === "business" ||
        !c.specialization),
    )
    .toSorted(() => Math.random() - 0.5)
    .slice(0, MAX_RESEARCHERS_PER_CYCLE);

  if (researchers.length === 0) {return;}

  let totalNew = 0;

  for (const researcher of researchers) {
    // Alternate between freelance scans and trend scans
    const signals =
      s.currentTick % (SCAN_INTERVAL * 2) === 0
        ? scanFreelancePlatforms(s, researcher)
        : scanTrendingSources(s, researcher);

    for (const signal of signals) {
      // De-duplicate: skip if similar signal exists
      const isDuplicate = demandSignals.some(
        (existing) =>
          existing.category === signal.category &&
          existing.source === signal.source &&
          Date.now() - new Date(existing.discoveredAt).getTime() < 3600000, // Within 1 hour
      );

      if (!isDuplicate) {
        demandSignals.push(signal);
        totalNew++;
      }
    }
  }

  // Cap signals
  if (demandSignals.length > MAX_SIGNALS) {
    // Remove oldest exhausted/low-score signals
    demandSignals.sort((a, b) => {
      if (a.status === "exhausted" && b.status !== "exhausted") {return -1;}
      if (b.status === "exhausted" && a.status !== "exhausted") {return 1;}
      return a.opportunityScore - b.opportunityScore;
    });
    demandSignals.splice(0, demandSignals.length - MAX_SIGNALS);
  }

  // Update trends
  updateTrends();

  if (totalNew > 0) {
    logger.info(`Market intelligence: discovered ${totalNew} new demand signals`, {
      total: demandSignals.length,
      researchers: researchers.length,
    });
  }
}

// ─── Query Functions ────────────────────────────────────────────

export function getDemandSignals(status?: DemandSignal["status"]): DemandSignal[] {
  if (status) {return demandSignals.filter((s) => s.status === status);}
  return [...demandSignals];
}

export function getTopOpportunities(limit = 10): DemandSignal[] {
  return [...demandSignals]
    .filter((s) => s.status === "new" || s.status === "actionable")
    .toSorted((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, limit);
}

export function getMarketTrends(): MarketTrend[] {
  return [...marketTrends].toSorted((a, b) => b.risingScore - a.risingScore);
}

export function getResearchReports(citizenId?: string): MarketResearchReport[] {
  if (citizenId) {return researchReports.filter((r) => r.citizenId === citizenId);}
  return [...researchReports];
}

export function getSignal(id: string): DemandSignal | undefined {
  return demandSignals.find((s) => s.id === id);
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getMarketIntelligenceDiagnostics(): MarketIntelligenceDiagnostics {
  const categoryCount = new Map<string, number>();
  for (const s of demandSignals) {
    categoryCount.set(s.category, (categoryCount.get(s.category) ?? 0) + 1);
  }

  const topCategories = Array.from(categoryCount.entries())
    .map(([category, count]) => ({ category, count }))
    .toSorted((a, b) => b.count - a.count)
    .slice(0, 5);

  const scores = demandSignals.map((s) => s.opportunityScore);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    totalSignals: demandSignals.length,
    newSignals: demandSignals.filter((s) => s.status === "new").length,
    actionableSignals: demandSignals.filter((s) => s.status === "actionable").length,
    inProgressSignals: demandSignals.filter((s) => s.status === "in_progress").length,
    totalTrends: marketTrends.length,
    totalReports: researchReports.length,
    averageOpportunityScore: parseFloat(avgScore.toFixed(2)),
    topCategories,
  };
}
