/**
 * Republic Platform — Citizen Web Scraping via Scrapling
 *
 * Provides citizens with adaptive web scraping capabilities by invoking
 * Scrapling inside the Docker sandbox container.
 *
 * Scraping modes:
 *   - "fast"    → Fetcher (HTTP-only, TLS impersonation)
 *   - "stealth" → StealthyFetcher (Cloudflare/anti-bot bypass)
 *   - "dynamic" → DynamicFetcher (full Playwright browser render)
 *   - "crawl"   → Spider-based concurrent crawl with depth control
 *   - "media"   → Extract images/videos/audio links
 */

import { sandboxExec, isContainerRunning } from "./agent-sandbox.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:citizen-scraping");

// ─── Types ──────────────────────────────────────────────────────

export type ScrapeMode = "fast" | "stealth" | "dynamic" | "crawl" | "media";

export interface ScrapeRequest {
  citizenId: string;
  citizenName: string;
  url: string;
  mode: ScrapeMode;
  /** CSS/XPath selectors (comma-separated or array) */
  selectors?: string[] | string;
  /** Crawl depth (only for mode "crawl", default 2) */
  depth?: number;
}

export interface ScrapeResult {
  ok: boolean;
  mode: ScrapeMode;
  url: string;
  data: Record<string, unknown> | null;
  error?: string;
  durationMs: number;
}

// ─── Mode → scrapling-tools.py command mapping ──────────────────

const MODE_MAP: Record<ScrapeMode, string> = {
  fast: "scrape",
  stealth: "stealth",
  dynamic: "dynamic",
  crawl: "crawl",
  media: "media",
};

// Timeouts per mode (seconds) — stealth and dynamic need browser startup
const MODE_TIMEOUTS: Record<ScrapeMode, number> = {
  fast: 30,
  stealth: 60,
  dynamic: 60,
  crawl: 120,
  media: 30,
};

// ─── Main ───────────────────────────────────────────────────────

/**
 * Execute a web scrape using Scrapling inside the sandbox container.
 *
 * @returns Structured JSON result from the scraping command.
 */
export async function citizenScrape(request: ScrapeRequest): Promise<ScrapeResult> {
  const start = Date.now();

  // Pre-flight check
  if (!isContainerRunning()) {
    return {
      ok: false,
      mode: request.mode,
      url: request.url,
      data: null,
      error: "Sandbox container is not running. Start it from the Agent Desktop.",
      durationMs: Date.now() - start,
    };
  }

  const cmd = MODE_MAP[request.mode] ?? "scrape";
  const timeout = MODE_TIMEOUTS[request.mode] ?? 30;

  // Build the scrapling-tools.py command
  const parts: string[] = [
    "python3",
    "/sandbox-api/scrapling-tools.py",
    cmd,
    request.url,
  ];

  // Add selectors if provided
  const selectors = normalizeSelectors(request.selectors);
  if (selectors && request.mode !== "media") {
    parts.push("--selectors", selectors);
  }

  // Add depth for crawl mode
  if (request.mode === "crawl" && request.depth !== undefined) {
    parts.push("--depth", String(Math.min(request.depth, 5))); // cap depth at 5
  }

  const command = parts.join(" ");

  logger.info(`[CitizenScrape] ${request.citizenName} (${request.citizenId}): ${command.slice(0, 120)}`);

  try {
    const result = await sandboxExec(command, "/workspace", timeout);

    if (result.exitCode !== 0) {
      logger.warn(`[CitizenScrape] Exit ${result.exitCode}: ${result.stderr.slice(0, 200)}`);
      return {
        ok: false,
        mode: request.mode,
        url: request.url,
        data: null,
        error: result.stderr.trim() || `Exit code ${result.exitCode}`,
        durationMs: result.durationMs,
      };
    }

    // Parse JSON output
    const data = parseJsonOutput(result.stdout);

    logger.info(`[CitizenScrape] Success: ${request.url} (${result.durationMs}ms)`);

    return {
      ok: true,
      mode: request.mode,
      url: request.url,
      data,
      durationMs: result.durationMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[CitizenScrape] Error: ${msg}`);
    return {
      ok: false,
      mode: request.mode,
      url: request.url,
      data: null,
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function normalizeSelectors(selectors?: string[] | string): string {
  if (!selectors) { return ""; }
  if (Array.isArray(selectors)) { return selectors.join(","); }
  return selectors;
}

function parseJsonOutput(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (!trimmed) { return null; }

  // Find the last JSON object in stdout (skip any log noise)
  const jsonStart = trimmed.lastIndexOf("{");
  if (jsonStart === -1) { return null; }

  // Find matching closing brace
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < trimmed.length; i++) {
    if (trimmed[i] === "{") { depth++; }
    if (trimmed[i] === "}") { depth--; }
    if (depth === 0) { jsonEnd = i; break; }
  }

  if (jsonEnd === -1) { return null; }

  try {
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
  } catch {
    return { rawOutput: trimmed.slice(0, 2000) };
  }
}
