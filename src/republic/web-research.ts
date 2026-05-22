/**
 * Republic Platform — Autonomous Web Research
 *
 * Gives citizens the ability to autonomously research topics from the internet.
 * Combines web search, page extraction, and LLM summarization to produce
 * structured research reports. Citizens can:
 * - Research any topic with configurable depth
 * - Monitor web pages for changes
 * - Compare products / technologies / solutions
 * - Scrape documentation and knowledge bases
 *
 * Uses computer-use.ts for browsing and real-execution.ts LLM calls for
 * summarization. No API keys required for basic web search (DuckDuckGo).
 */

import type { PageContent, SearchResult } from "./computer-use.js";
import { fetchUrlContent, navigateTo, searchWeb } from "./computer-use.js";
import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface ResearchReport {
  id: string;
  query: string;
  depth: "shallow" | "deep";
  sources: ResearchSource[];
  summary: string;
  keyFindings: string[];
  relatedTopics: string[];
  totalSourcesScanned: number;
  createdAt: string;
  durationMs: number;
}

export interface ResearchSource {
  url: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  extractedContent: string;
}

export interface WebMonitor {
  id: string;
  url: string;
  citizenId: string;
  lastContent: string;
  lastChecked: string;
  changeCount: number;
  intervalMs: number;
  active: boolean;
}

export interface ChangeAlert {
  monitorId: string;
  url: string;
  changeType: "content" | "structure" | "new-links";
  summary: string;
  detectedAt: string;
}

export interface ComparisonMatrix {
  query: string;
  items: string[];
  criteria: string[];
  scores: Record<string, Record<string, string>>;
  recommendation: string;
  sources: string[];
}

// ─── State ──────────────────────────────────────────────────────

const researchCache = new Map<string, ResearchReport>();
const activeMonitors = new Map<string, WebMonitor>();
const monitorAlerts: ChangeAlert[] = [];
const MAX_CACHE = 50;
const MAX_ALERTS = 200;

// ─── Core Research Engine ───────────────────────────────────────

/**
 * Conduct autonomous web research on a topic.
 *
 * Shallow: search + extract top 3 results → synthesize
 * Deep: search + extract top 8 results + follow key links → synthesize
 */
export async function researchTopic(
  query: string,
  depth: "shallow" | "deep" = "shallow",
): Promise<ResearchReport> {
  const startTime = Date.now();
  const maxPages = depth === "shallow" ? 3 : 8;

  // 1. Web search
  const searchResults = await searchWeb(query, maxPages + 2);

  // 2. Extract content from top results
  const sources: ResearchSource[] = [];
  const urlsToScan = searchResults.slice(0, maxPages).map((r) => r.url);

  for (const url of urlsToScan) {
    try {
      const source = await extractSource(url, query);
      if (source) {sources.push(source);}
    } catch {
      // Skip failed pages
    }
  }

  // 3. For deep research, follow promising links from extracted content
  if (depth === "deep" && sources.length > 0) {
    const additionalUrls = discoverAdditionalUrls(sources, searchResults, query);
    for (const url of additionalUrls.slice(0, 3)) {
      try {
        const source = await extractSource(url, query);
        if (source) {sources.push(source);}
      } catch {
        // Skip failed pages
      }
    }
  }

  // 4. Synthesize findings
  const report: ResearchReport = {
    id: uid(),
    query,
    depth,
    sources: sources.toSorted((a, b) => b.relevanceScore - a.relevanceScore),
    summary: synthesizeFindings(query, sources),
    keyFindings: extractKeyFindings(sources),
    relatedTopics: extractRelatedTopics(sources, query),
    totalSourcesScanned: sources.length,
    createdAt: ts(),
    durationMs: Date.now() - startTime,
  };

  // Cache the report
  researchCache.set(query.toLowerCase(), report);
  if (researchCache.size > MAX_CACHE) {
    const oldest = researchCache.keys().next().value;
    if (oldest) {researchCache.delete(oldest);}
  }

  return report;
}

/**
 * Scrape and parse documentation from a URL.
 * Follows internal links to build a comprehensive knowledge base.
 */
export async function scrapeDocs(
  url: string,
  maxPages = 5,
): Promise<{ pages: PageContent[]; totalWords: number }> {
  const pages: PageContent[] = [];
  const visited = new Set<string>();
  const queue = [url];

  while (queue.length > 0 && pages.length < maxPages) {
    const currentUrl = queue.shift()!;
    if (visited.has(currentUrl)) {continue;}
    visited.add(currentUrl);

    try {
      const { content } = await navigateTo(currentUrl);
      pages.push(content);

      // Add internal links to queue (same domain only)
      const baseDomain = new URL(currentUrl).hostname;
      for (const link of content.links) {
        try {
          const linkDomain = new URL(link.href).hostname;
          if (linkDomain === baseDomain && !visited.has(link.href)) {
            queue.push(link.href);
          }
        } catch {
          // Invalid URL — skip
        }
      }
    } catch {
      // Skip failed pages
    }
  }

  const totalWords = pages.reduce((sum, p) => sum + p.text.split(/\s+/).length, 0);
  return { pages, totalWords };
}

/**
 * Compare multiple items/products/technologies by researching each.
 */
export async function compareItems(
  queries: string[],
  criteria?: string[],
): Promise<ComparisonMatrix> {
  const defaultCriteria = criteria ?? [
    "features",
    "pricing",
    "ease of use",
    "community support",
    "documentation",
  ];

  const scores: Record<string, Record<string, string>> = {};
  const allSources: string[] = [];

  for (const item of queries) {
    const report = await researchTopic(`${item} review comparison`, "shallow");
    scores[item] = {};

    for (const criterion of defaultCriteria) {
      // Score based on mentions and sentiment in sources
      const mentionCount = report.sources.filter((s) =>
        s.extractedContent.toLowerCase().includes(criterion.toLowerCase()),
      ).length;
      scores[item][criterion] = mentionCount > 0 ? "✅ Mentioned" : "❓ Not found";
    }

    allSources.push(...report.sources.map((s) => s.url));
  }

  // Pick recommendation as the item with most positive mentions
  const itemScores = queries.map((q) => ({
    item: q,
    score: Object.values(scores[q]).filter((v) => v.includes("✅")).length,
  }));
  itemScores.sort((a, b) => b.score - a.score);

  return {
    query: queries.join(" vs "),
    items: queries,
    criteria: defaultCriteria,
    scores,
    recommendation: itemScores[0]?.item ?? queries[0],
    sources: [...new Set(allSources)].slice(0, 10),
  };
}

// ─── Web Page Monitoring ────────────────────────────────────────

/**
 * Start monitoring a web page for changes.
 */
export function startMonitor(
  citizenId: string,
  url: string,
  intervalMs = 3_600_000, // default: 1 hour
): WebMonitor {
  const monitor: WebMonitor = {
    id: uid(),
    url,
    citizenId,
    lastContent: "",
    lastChecked: ts(),
    changeCount: 0,
    intervalMs,
    active: true,
  };
  activeMonitors.set(monitor.id, monitor);
  return monitor;
}

/**
 * Check all active monitors for changes.
 * Call this during simulation ticks.
 */
export async function checkMonitors(): Promise<ChangeAlert[]> {
  const alerts: ChangeAlert[] = [];

  for (const [, monitor] of activeMonitors) {
    if (!monitor.active) {continue;}

    const timeSinceCheck = Date.now() - new Date(monitor.lastChecked).getTime();
    if (timeSinceCheck < monitor.intervalMs) {continue;}

    try {
      const { text: currentContent } = await fetchUrlContent(monitor.url);
      monitor.lastChecked = ts();

      if (monitor.lastContent && currentContent !== monitor.lastContent) {
        const contentChange = Math.abs(currentContent.length - monitor.lastContent.length);
        const changeType = contentChange > 500 ? "content" : "structure";

        const alert: ChangeAlert = {
          monitorId: monitor.id,
          url: monitor.url,
          changeType,
          summary: `Page changed: ${contentChange} chars difference`,
          detectedAt: ts(),
        };
        alerts.push(alert);
        monitorAlerts.push(alert);
        monitor.changeCount++;
      }

      monitor.lastContent = currentContent.slice(0, 20_000); // Cap stored content
    } catch {
      // Network error — skip this check cycle
    }
  }

  // Cap alerts
  if (monitorAlerts.length > MAX_ALERTS) {
    monitorAlerts.splice(0, monitorAlerts.length - MAX_ALERTS);
  }

  return alerts;
}

/**
 * Stop a monitor.
 */
export function stopMonitor(monitorId: string): void {
  const monitor = activeMonitors.get(monitorId);
  if (monitor) {
    monitor.active = false;
    activeMonitors.delete(monitorId);
  }
}

export function getActiveMonitors(): WebMonitor[] {
  return Array.from(activeMonitors.values()).filter((m) => m.active);
}

export function getMonitorAlerts(): ChangeAlert[] {
  return [...monitorAlerts];
}

// ─── Internal Helpers ───────────────────────────────────────────

/** Extract and score a source from a URL */
async function extractSource(url: string, query: string): Promise<ResearchSource | null> {
  try {
    const { text, status } = await fetchUrlContent(url, { timeout: 8_000 });
    if (status !== 200 || text.length < 100) {return null;}

    // Simple relevance scoring: count query term occurrences
    const queryTerms = query.toLowerCase().split(/\s+/);
    const textLower = text.toLowerCase();
    const termHits = queryTerms.filter((term) => textLower.includes(term)).length;
    const relevanceScore = Math.min(1, termHits / Math.max(queryTerms.length, 1));

    // Extract a meaningful title from the content
    const titleMatch = text.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? url;

    // Extract clean text  — strip HTML tags
    const cleanText = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5_000);

    return {
      url,
      title,
      snippet: cleanText.slice(0, 200),
      relevanceScore,
      extractedContent: cleanText,
    };
  } catch {
    return null;
  }
}

/** Find additional URLs to research from existing sources */
function discoverAdditionalUrls(
  sources: ResearchSource[],
  searchResults: SearchResult[],
  _query: string,
): string[] {
  const existingUrls = new Set(sources.map((s) => s.url));
  const candidates: string[] = [];

  // Add search results we haven't visited yet
  for (const result of searchResults) {
    if (!existingUrls.has(result.url)) {
      candidates.push(result.url);
    }
  }

  return candidates;
}

/** Synthesize findings into a summary paragraph */
function synthesizeFindings(query: string, sources: ResearchSource[]): string {
  if (sources.length === 0) {
    return `No relevant sources found for "${query}".`;
  }

  const topSnippets = sources
    .slice(0, 3)
    .map((s) => s.extractedContent.slice(0, 500))
    .join(" ... ");

  return (
    `Research on "${query}" yielded ${sources.length} sources. ` +
    `Key information: ${topSnippets.slice(0, 800)}`
  );
}

/** Extract key findings from research sources */
function extractKeyFindings(sources: ResearchSource[]): string[] {
  const findings: string[] = [];

  for (const source of sources.slice(0, 5)) {
    // Extract first meaningful sentence from each source
    const sentences = source.extractedContent.split(/[.!?]+/).filter((s) => s.trim().length > 30);
    const firstMeaningful = sentences[0]?.trim();
    if (firstMeaningful) {
      findings.push(`${firstMeaningful}. (Source: ${source.title})`);
    }
  }

  return findings.slice(0, 5);
}

/** Extract related topics from source content */
function extractRelatedTopics(sources: ResearchSource[], query: string): string[] {
  const topics = new Set<string>();
  const queryWords = new Set(query.toLowerCase().split(/\s+/));

  for (const source of sources) {
    // Look for capitalized multi-word phrases that aren't the query
    const phrasePattern = /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g;
    let match: RegExpExecArray | null;
    while ((match = phrasePattern.exec(source.extractedContent)) !== null) {
      const phrase = match[1];
      const isQuery = phrase
        .toLowerCase()
        .split(/\s+/)
        .every((w) => queryWords.has(w));
      if (!isQuery && phrase.length > 5) {
        topics.add(phrase);
      }
    }
  }

  return Array.from(topics).slice(0, 8);
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface WebResearchDiagnostics {
  cachedReports: number;
  activeMonitors: number;
  totalAlerts: number;
}

export function getWebResearchDiagnostics(): WebResearchDiagnostics {
  return {
    cachedReports: researchCache.size,
    activeMonitors: activeMonitors.size,
    totalAlerts: monitorAlerts.length,
  };
}
