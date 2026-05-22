/**
 * Republic Platform — FireCrawl Client
 *
 * Wraps the FireCrawl API (firecrawl.dev) for high-quality web search
 * and scraping. Falls back to computer-use.ts (DuckDuckGo + HTTP)
 * automatically when FIRECRAWL_API_KEY is not configured.
 *
 * Set env var: FIRECRAWL_API_KEY=fc-xxxxxxxx
 */

import type { SearchResult } from "./computer-use.js";
import { fetchUrlContent, searchWeb as ddgSearch } from "./computer-use.js";

// ─── Types ───────────────────────────────────────────────────────

export interface FireCrawlSearchResult {
  url: string;
  title: string;
  description: string;
  markdown?: string;
}

export interface FireCrawlScrapeResult {
  url: string;
  markdown: string;
  title: string;
  wordCount: number;
  success: boolean;
}

// ─── Rate Limiter ─────────────────────────────────────────────────

const LAST_REQUEST_TIMES: number[] = [];
const MAX_RPS = 8; // FireCrawl free tier: 10 req/s, leaving headroom

function canRequest(): boolean {
  const now = Date.now();
  // Remove timestamps older than 1s
  while (LAST_REQUEST_TIMES.length > 0 && now - LAST_REQUEST_TIMES[0] > 1000) {
    LAST_REQUEST_TIMES.shift();
  }
  return LAST_REQUEST_TIMES.length < MAX_RPS;
}

async function waitForSlot(): Promise<void> {
  while (!canRequest()) {
    await new Promise((r) => setTimeout(r, 100));
  }
  LAST_REQUEST_TIMES.push(Date.now());
}

// ─── FireCrawl API ────────────────────────────────────────────────

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

function getApiKey(): string | null {
  return process.env.FIRECRAWL_API_KEY ?? null;
}

async function firecrawlFetch(
  endpoint: string,
  body: Record<string, unknown>,
  retries = 3,
): Promise<unknown> {
  const key = getApiKey();
  // oxlint-disable-next-line curly
  if (!key) throw new Error("FIRECRAWL_API_KEY not set");

  await waitForSlot();

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(`${FIRECRAWL_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      if (resp.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }

      if (!resp.ok) {
        throw new Error(`FireCrawl HTTP ${resp.status}: ${await resp.text()}`);
      }

      return await resp.json();
    } catch (err) {
      // oxlint-disable-next-line curly
      if (attempt === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500));
    }
  }
  throw new Error("FireCrawl: max retries exceeded");
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Search the web via FireCrawl. Falls back to DuckDuckGo if no API key.
 * Returns results with clean markdown content when available.
 */
export async function firecrawlSearch(query: string, limit = 10): Promise<FireCrawlSearchResult[]> {
  const key = getApiKey();

  if (!key) {
    // Fallback: DuckDuckGo + plain HTTP extraction
    const results: SearchResult[] = await ddgSearch(query, limit).catch(() => []);
    return results.map((r) => ({
      url: r.url,
      title: r.title,
      description: r.snippet,
      markdown: undefined,
    }));
  }

  try {
    const data = (await firecrawlFetch("/search", {
      query,
      limit,
      scrapeOptions: { formats: ["markdown"] },
    })) as { data?: { url: string; title?: string; description?: string; markdown?: string }[] };

    return (data?.data ?? []).map((item) => ({
      url: item.url,
      title: item.title ?? item.url,
      description: item.description ?? "",
      markdown: item.markdown,
    }));
  } catch (err) {
    console.warn(`[FireCrawl] Search failed, falling back to DDG: ${String(err)}`);
    const results = await ddgSearch(query, limit).catch(() => [] as SearchResult[]);
    return results.map((r) => ({
      url: r.url,
      title: r.title,
      description: r.snippet,
    }));
  }
}

/**
 * Scrape a URL and return clean markdown content.
 * Falls back to plain HTTP extraction when FireCrawl is unavailable.
 */
export async function firecrawlScrape(url: string): Promise<FireCrawlScrapeResult> {
  const key = getApiKey();

  if (!key) {
    // Fallback: plain HTTP
    try {
      const { text, status } = await fetchUrlContent(url, { timeout: 15_000 });
      if (status !== 200) {
        return { url, markdown: "", title: url, wordCount: 0, success: false };
      }
      const clean = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 30_000);
      return {
        url,
        markdown: clean,
        title: url,
        wordCount: clean.split(/\s+/).length,
        success: true,
      };
    } catch {
      return { url, markdown: "", title: url, wordCount: 0, success: false };
    }
  }

  try {
    const data = (await firecrawlFetch("/scrape", {
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    })) as { data?: { markdown?: string; metadata?: { title?: string } } };

    const markdown = data?.data?.markdown ?? "";
    return {
      url,
      markdown: markdown.slice(0, 50_000),
      title: data?.data?.metadata?.title ?? url,
      wordCount: markdown.split(/\s+/).length,
      success: true,
    };
  } catch (err) {
    console.warn(`[FireCrawl] Scrape failed for ${url}: ${String(err)}`);
    const { text } = await fetchUrlContent(url, { timeout: 10_000 }).catch(() => ({
      text: "",
      status: 0,
    }));
    const clean = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 30_000);
    return {
      url,
      markdown: clean,
      title: url,
      wordCount: clean.split(/\s+/).length,
      success: clean.length > 100,
    };
  }
}

/**
 * Scrape multiple URLs in parallel (max concurrency: 4).
 */
export async function firecrawlScrapeMany(
  urls: string[],
  opts: { maxConcurrency?: number; minWordCount?: number } = {},
): Promise<FireCrawlScrapeResult[]> {
  const { maxConcurrency = 4, minWordCount = 100 } = opts;
  const results: FireCrawlScrapeResult[] = [];
  const chunks: string[][] = [];

  for (let i = 0; i < urls.length; i += maxConcurrency) {
    chunks.push(urls.slice(i, i + maxConcurrency));
  }

  for (const chunk of chunks) {
    const batch = await Promise.all(
      chunk.map((url) =>
        firecrawlScrape(url).catch(() => ({
          url,
          markdown: "",
          title: url,
          wordCount: 0,
          success: false,
        })),
      ),
    );
    results.push(...batch.filter((r) => r.success && r.wordCount >= minWordCount));
  }

  return results;
}

/** Check if FireCrawl API key is configured */
export function isFirecrawlConfigured(): boolean {
  return Boolean(getApiKey());
}
