/**
 * Republic Platform — Web Search Engine
 *
 * Gives citizens autonomous web search capability:
 *  1. searchWeb(query)        — DuckDuckGo HTML search (no API key)
 *  2. fetchUrl(url)           — fetch + extract text from any URL
 *  3. searchAndSummarize()    — search + fetch + LLM summarize
 *
 * Based on research: Tavily/Serper patterns adapted for zero-cost
 * DuckDuckGo scraping with Node.js fetch.
 */

import { ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebResearchResult {
  query: string;
  results: SearchResult[];
  summary: string;
  fetchedContent: string[];
  timestamp: string;
}

// ─── Configuration ──────────────────────────────────────────────

const SEARCH_TIMEOUT = 15_000;
const FETCH_TIMEOUT = 10_000;
const MAX_CONTENT_LENGTH = 5000; // chars per page
const MAX_RESULTS = 5;

// ─── State ──────────────────────────────────────────────────────

const searchHistory: { query: string; resultCount: number; tick: number }[] = [];
const MAX_HISTORY = 200;

// ─── 1. Web Search via DuckDuckGo HTML ──────────────────────────

/**
 * Search the web using DuckDuckGo's HTML endpoint.
 * No API key required — parses the lite HTML response.
 */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HoC-Republic/1.0)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT),
    });

    if (!res.ok) {
      return [];
    }

    const html = await res.text();
    return parseDuckDuckGoResults(html).slice(0, MAX_RESULTS);
  } catch {
    return [];
  }
}

/**
 * Parse DuckDuckGo HTML lite results.
 * Extracts title, URL, and snippet from result anchors.
 */
function parseDuckDuckGoResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks: <a class="result__a" href="...">title</a>
  // and <a class="result__snippet" ...>snippet</a>
  const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi;
  const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;

  const links: { url: string; title: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    const rawUrl = match[1] ?? "";
    // DuckDuckGo wraps URLs in a redirect — extract the real URL
    const realUrl = extractRealUrl(rawUrl);
    const title = stripHtml(match[2] ?? "");
    if (realUrl && title) {
      links.push({ url: realUrl, title });
    }
  }

  const snippets: string[] = [];
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(match[1] ?? ""));
  }

  for (let i = 0; i < links.length; i++) {
    results.push({
      title: links[i].title,
      url: links[i].url,
      snippet: snippets[i] ?? "",
    });
  }

  return results;
}

/** Extract real URL from DuckDuckGo redirect wrapper */
function extractRealUrl(ddgUrl: string): string {
  try {
    if (ddgUrl.includes("uddg=")) {
      const decoded = decodeURIComponent(ddgUrl.split("uddg=")[1]?.split("&")[0] ?? "");
      return decoded;
    }
    if (ddgUrl.startsWith("http")) {
      return ddgUrl;
    }
    return "";
  } catch {
    return ddgUrl;
  }
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── 2. URL Content Fetcher ─────────────────────────────────────

/**
 * Fetch a URL and extract its text content.
 * Strips HTML, scripts, styles, and truncates to MAX_CONTENT_LENGTH.
 */
export async function fetchUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HoC-Republic/1.0)",
        Accept: "text/html,text/plain",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (!res.ok) {
      return `[Error: HTTP ${res.status}]`;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();

    if (contentType.includes("text/plain")) {
      return text.slice(0, MAX_CONTENT_LENGTH);
    }

    // Strip HTML to extract readable content
    const cleaned = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned.slice(0, MAX_CONTENT_LENGTH);
  } catch (err) {
    return `[Error: ${String(err)}]`;
  }
}

// ─── 3. Search + Summarize ──────────────────────────────────────

/**
 * Full research pipeline:
 *  1. Search the web for the query
 *  2. Fetch content from top results
 *  3. Return structured research result
 *
 * Optionally uses a local LLM to summarize (if inferFn is provided).
 */
export async function searchAndSummarize(
  query: string,
  inferFn?: (prompt: string) => Promise<string>,
): Promise<WebResearchResult> {
  const results = await searchWeb(query);
  const fetchedContent: string[] = [];

  // Fetch content from top 3 results
  const topResults = results.slice(0, 3);
  for (const result of topResults) {
    const content = await fetchUrl(result.url);
    if (!content.startsWith("[Error")) {
      fetchedContent.push(`[${result.title}]\n${content}`);
    }
  }

  // Build summary
  let summary = "";
  if (inferFn && fetchedContent.length > 0) {
    const context = fetchedContent.join("\n\n---\n\n").slice(0, 8000);
    const prompt = `Summarize the following web research for the query: "${query}"\n\n${context}\n\nProvide a concise, factual summary:`;
    try {
      summary = await inferFn(prompt);
    } catch {
      summary = `Found ${results.length} results for "${query}". Top sources: ${results.map((r) => r.title).join(", ")}`;
    }
  } else {
    summary = `Found ${results.length} results for "${query}". ${results.map((r) => `${r.title}: ${r.snippet}`).join(". ")}`;
  }

  return {
    query,
    results,
    summary,
    fetchedContent,
    timestamp: ts(),
  };
}

// ─── 4. Record Search for Diagnostics ───────────────────────────

export function recordSearch(query: string, resultCount: number, tick: number): void {
  searchHistory.push({ query, resultCount, tick });
  if (searchHistory.length > MAX_HISTORY) {
    searchHistory.splice(0, searchHistory.length - MAX_HISTORY);
  }
}

export function getSearchDiagnostics(): {
  totalSearches: number;
  recentSearches: typeof searchHistory;
} {
  return {
    totalSearches: searchHistory.length,
    recentSearches: searchHistory.slice(-20),
  };
}
