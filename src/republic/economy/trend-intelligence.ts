/**
 * Trend Intelligence Engine
 *
 * Autonomous market research system that runs on a daily cron and scans:
 *   - GitHub Trending (hot repos, languages, topics)
 *   - Product Hunt (top launches)
 *   - Hacker News (Show HN, Ask HN, top posts)
 *   - arXiv (new AI/CS/physics submissions)
 *   - Reddit r/startups, r/SideProject (hot posts)
 *   - Google Trends RSS (rising search topics)
 *
 * Outputs:
 *   - TrendSignal[] — ranked opportunities with monetization viability
 *   - Strategy items auto-injected into citizen backlog
 *   - Optional: assigns citizen teams to high-priority trends
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { uid, ts } from "../utils.js";

const logger = createSubsystemLogger("republic:trend-intelligence");

// ─── Types ──────────────────────────────────────────────────────────────────

export type TrendAudience =
  | "developers" | "gamers" | "kids" | "students" | "researchers"
  | "entrepreneurs" | "creatives" | "general" | "enterprise";

export type TrendSource =
  | "github-trending" | "producthunt" | "hackernews" | "arxiv"
  | "reddit-startups" | "reddit-sideproject" | "google-trends" | "manual";

export interface TrendSignal {
  id: string;
  topic: string;
  headline: string;
  summary: string;
  source: TrendSource;
  sourceUrl: string;
  momentumScore: number;       // 1-10: how fast it's growing
  audienceSize: number;        // estimated daily reach
  audience: TrendAudience;
  monetizationViability: number; // 1-10
  competitionLevel: "low" | "medium" | "high";
  suggestedProductType: string; // ProductCategory from ai-store-pipeline
  suggestedTitle: string;
  suggestedDescription: string;
  estimatedRevenueRange: { min: number; max: number }; // USD/month
  tags: string[];
  assignedCitizenIds: string[];
  strategyStatus: "new" | "assigned" | "in-progress" | "shipped";
  detectedAt: string;
  updatedAt: string;
}

export interface TrendStrategy {
  id: string;
  signalId: string;
  productPlan: string;        // LLM-generated plan
  marketingAngle: string;
  platformTargets: string[];  // which platforms to publish to
  timeToMarket: string;       // "2 hours" | "1 day" | "1 week"
  citizenRoles: Record<string, string>; // role → citizenId
  generatedAt: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

const signals = new Map<string, TrendSignal>();
const strategies = new Map<string, TrendStrategy>();
const MAX_SIGNALS = 500;

// ─── Feed Parsers ────────────────────────────────────────────────────────────

async function fetchGithubTrending(): Promise<Partial<TrendSignal>[]> {
  try {
    const url = "https://api.github.com/search/repositories?q=created:>2026-03-01&sort=stars&order=desc&per_page=10";
    const res = await fetch(url, {
      headers: { "User-Agent": "HoC-TrendBot/1.0", "Accept": "application/vnd.github+json" },
    });
    if (!res.ok) { return []; }
    const data = await res.json() as { items?: Array<{ name: string; description: string; html_url: string; stargazers_count: number; topics?: string[] }> };
    return (data.items ?? []).map((repo) => ({
      topic: repo.name,
      headline: `⭐ ${repo.stargazers_count} stars — ${repo.name}`,
      summary: repo.description ?? "",
      source: "github-trending" as TrendSource,
      sourceUrl: repo.html_url,
      momentumScore: Math.min(10, Math.round(repo.stargazers_count / 500)),
      audience: "developers" as TrendAudience,
      tags: repo.topics ?? [],
    }));
  } catch (err) {
    logger.warn(`[TrendIntel] GitHub fetch failed: ${String(err)}`);
    return [];
  }
}

async function fetchHackerNews(): Promise<Partial<TrendSignal>[]> {
  try {
    const res = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
    if (!res.ok) { return []; }
    const ids = await res.json() as number[];
    const top10 = ids.slice(0, 10);

    const stories = await Promise.all(
      top10.map(async (id) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
          return r.ok ? await r.json() as { title?: string; url?: string; score?: number; type?: string } : null;
        } catch { return null; }
      }),
    );

    return stories
      .filter((s): s is { title: string; url: string; score: number; type: string } =>
        !!s && typeof s.title === "string" && s.type === "story",
      )
      .map((s) => ({
        topic: s.title.slice(0, 60),
        headline: s.title,
        summary: `HN Score: ${s.score}`,
        source: "hackernews" as TrendSource,
        sourceUrl: s.url ?? `https://news.ycombinator.com`,
        momentumScore: Math.min(10, Math.round((s.score ?? 0) / 100)),
        audience: "developers" as TrendAudience,
        tags: [],
      }));
  } catch (err) {
    logger.warn(`[TrendIntel] HN fetch failed: ${String(err)}`);
    return [];
  }
}

async function fetchArxiv(): Promise<Partial<TrendSignal>[]> {
  try {
    const url = "https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=8";
    const res = await fetch(url, { headers: { "User-Agent": "HoC-TrendBot/1.0" } });
    if (!res.ok) { return []; }
    const xml = await res.text();
    // Simple regex parse — avoid XML parser dependency
    const titles = [...xml.matchAll(/<title>([^<]{10,200})<\/title>/g)].map(m => m[1].trim()).slice(1, 9);
    const links  = [...xml.matchAll(/<id>(https:\/\/arxiv\.org\/abs\/[^<]+)<\/id>/g)].map(m => m[1].trim());
    return titles.map((title, i) => ({
      topic: title.slice(0, 60),
      headline: title,
      summary: "New arXiv AI/ML submission",
      source: "arxiv" as TrendSource,
      sourceUrl: links[i] ?? "https://arxiv.org",
      momentumScore: 6,
      audience: "researchers" as TrendAudience,
      tags: ["AI", "research", "paper"],
    }));
  } catch (err) {
    logger.warn(`[TrendIntel] arXiv fetch failed: ${String(err)}`);
    return [];
  }
}

// ─── Viability Classifier ────────────────────────────────────────────────────

function classifyTrend(partial: Partial<TrendSignal>): TrendSignal {
  const topic = (partial.topic ?? "").toLowerCase();
  const tags  = partial.tags ?? [];
  const tagsLower = tags.map(t => t.toLowerCase());
  const all = `${topic} ${tagsLower.join(" ")}`;

  // Infer product type
  let productType = "code";
  let audience: TrendAudience = partial.audience ?? "developers";
  let monetization = 5;

  if (/game|gaming|unity|unreal|godot|roblox/.test(all)) { productType = "game"; audience = "gamers"; monetization = 8; }
  else if (/music|audio|sound|song|beat|melody/.test(all)) { productType = "music"; audience = "creatives"; monetization = 7; }
  else if (/animation|cartoon|anime|pixar|kids/.test(all)) { productType = "cartoon"; audience = "kids"; monetization = 9; }
  else if (/movie|film|cinema|video/.test(all)) { productType = "short-film"; audience = "general"; monetization = 7; }
  else if (/research|paper|survey|dataset|model/.test(all)) { productType = "research"; audience = "researchers"; monetization = 5; }
  else if (/saas|startup|product|launch|ship/.test(all)) { productType = "saas"; audience = "entrepreneurs"; monetization = 9; }
  else if (/art|design|visual|image|generate/.test(all)) { productType = "art"; audience = "creatives"; monetization = 6; }
  else if (/course|tutorial|learn|education/.test(all)) { productType = "course"; audience = "students"; monetization = 8; }

  const momentum = partial.momentumScore ?? 5;
  const competition = momentum > 7 ? "high" : momentum > 4 ? "medium" : "low";
  const revenueMultiplier = monetization * momentum;

  return {
    id: uid(),
    topic: partial.topic ?? "Unknown",
    headline: partial.headline ?? partial.topic ?? "Unknown",
    summary: partial.summary ?? "",
    source: partial.source ?? "manual",
    sourceUrl: partial.sourceUrl ?? "",
    momentumScore: momentum,
    audienceSize: momentum * 10_000,
    audience,
    monetizationViability: monetization,
    competitionLevel: competition,
    suggestedProductType: productType,
    suggestedTitle: `${partial.topic ?? "AI"} ${productType === "saas" ? "Platform" : productType === "game" ? "Game" : "Product"}`,
    suggestedDescription: partial.summary?.slice(0, 200) ?? `A ${productType} inspired by ${partial.topic}`,
    estimatedRevenueRange: {
      min: revenueMultiplier * 50,
      max: revenueMultiplier * 500,
    },
    tags: partial.tags ?? [],
    assignedCitizenIds: [],
    strategyStatus: "new",
    detectedAt: ts(),
    updatedAt: ts(),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Run a full trend scan across all sources.
 * Called by the daily cron or manually via RPC.
 */
export async function runTrendScan(): Promise<{ scanned: number; newSignals: number }> {
  logger.info("[TrendIntel] Starting trend scan");

  const [ghItems, hnItems, arXivItems] = await Promise.all([
    fetchGithubTrending(),
    fetchHackerNews(),
    fetchArxiv(),
  ]);

  const allPartials = [...ghItems, ...hnItems, ...arXivItems];
  let newSignals = 0;

  for (const partial of allPartials) {
    if (!partial.topic) { continue; }
    // Deduplicate by topic (fuzzy)
    const exists = [...signals.values()].some(
      s => s.topic.toLowerCase() === partial.topic?.toLowerCase(),
    );
    if (!exists) {
      const signal = classifyTrend(partial);
      signals.set(signal.id, signal);
      newSignals++;
    }
  }

  // Trim to max
  if (signals.size > MAX_SIGNALS) {
    const oldest = [...signals.entries()]
      .toSorted((a, b) => a[1].detectedAt.localeCompare(b[1].detectedAt))
      .slice(0, signals.size - MAX_SIGNALS);
    for (const [id] of oldest) { signals.delete(id); }
  }

  logger.info(`[TrendIntel] Scan complete: ${newSignals} new signals, ${signals.size} total`);
  return { scanned: allPartials.length, newSignals };
}

export function listSignals(opts: {
  source?: TrendSource;
  minMomentum?: number;
  minMonetization?: number;
  productType?: string;
  status?: TrendSignal["strategyStatus"];
  limit?: number;
} = {}): TrendSignal[] {
  let result = [...signals.values()];
  if (opts.source) { result = result.filter(s => s.source === opts.source); }
  if (opts.minMomentum != null) { result = result.filter(s => s.momentumScore >= opts.minMomentum!); }
  if (opts.minMonetization != null) { result = result.filter(s => s.monetizationViability >= opts.minMonetization!); }
  if (opts.productType) { result = result.filter(s => s.suggestedProductType === opts.productType); }
  if (opts.status) { result = result.filter(s => s.strategyStatus === opts.status); }
  result = result.toSorted((a, b) => (b.momentumScore * b.monetizationViability) - (a.momentumScore * a.monetizationViability));
  return result.slice(0, opts.limit ?? 50);
}

export function getSignal(id: string): TrendSignal | undefined {
  return signals.get(id);
}

export function assignSignal(signalId: string, citizenIds: string[]): boolean {
  const s = signals.get(signalId);
  if (!s) { return false; }
  s.assignedCitizenIds = citizenIds;
  s.strategyStatus = "assigned";
  s.updatedAt = ts();
  return true;
}

export function injectManualSignal(partial: Partial<TrendSignal>): TrendSignal {
  const signal = classifyTrend({ ...partial, source: "manual" });
  signals.set(signal.id, signal);
  return signal;
}

export function generateStrategy(signalId: string): TrendStrategy {
  const signal = signals.get(signalId);
  if (!signal) { throw new Error(`Signal ${signalId} not found`); }

  const strategy: TrendStrategy = {
    id: uid(),
    signalId,
    productPlan: `Build a ${signal.suggestedProductType} called "${signal.suggestedTitle}". Target audience: ${signal.audience}. Leverage the ${signal.topic} trend. Expected revenue: $${signal.estimatedRevenueRange.min}–$${signal.estimatedRevenueRange.max}/month.`,
    marketingAngle: `"${signal.headline}" is trending. Position this ${signal.suggestedProductType} as the first AI-native solution for ${signal.audience}.`,
    platformTargets: signal.suggestedProductType === "game" ? ["itch.io", "github", "twitter"]
      : signal.suggestedProductType === "music" ? ["spotify", "soundcloud", "youtube"]
      : signal.suggestedProductType === "research" ? ["arxiv", "github", "researchhub"]
      : signal.suggestedProductType === "cartoon" ? ["youtube", "tiktok", "twitter"]
      : ["gumroad", "github", "twitter"],
    timeToMarket: signal.momentumScore > 7 ? "2 hours" : signal.momentumScore > 4 ? "1 day" : "1 week",
    citizenRoles: {},
    generatedAt: ts(),
  };

  strategies.set(strategy.id, strategy);
  signals.get(signalId)!.strategyStatus = "assigned";
  return strategy;
}

export function getTrendStats(): {
  total: number;
  bySource: Record<string, number>;
  byStatus: Record<string, number>;
  byProductType: Record<string, number>;
  topOpportunities: TrendSignal[];
} {
  const bySource: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byProductType: Record<string, number> = {};

  for (const s of signals.values()) {
    bySource[s.source] = (bySource[s.source] ?? 0) + 1;
    byStatus[s.strategyStatus] = (byStatus[s.strategyStatus] ?? 0) + 1;
    byProductType[s.suggestedProductType] = (byProductType[s.suggestedProductType] ?? 0) + 1;
  }

  const topOpportunities = listSignals({ minMomentum: 6, minMonetization: 7, limit: 5 });

  return { total: signals.size, bySource, byStatus, byProductType, topOpportunities };
}
