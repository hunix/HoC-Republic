/**
 * Republic Platform — Computer Use Engine
 *
 * Provides citizens with real browser automation and GUI interaction
 * capabilities using Playwright. Citizens can:
 * - Navigate to URLs and extract content
 * - Fill forms, click buttons, type text
 * - Take screenshots and perceive visual state
 * - Download files from the web
 * - Search the internet for information
 *
 * Uses headless Chromium by default. Falls back gracefully if Playwright
 * is not installed — capabilities degrade but never crash.
 */

import { ts, uid } from "./utils.js";

// ─── Playwright Type Stubs (avoids compile-time dependency) ─────
// These minimal interfaces describe only the Playwright API surface
// we actually use. The real module is loaded dynamically at runtime.

interface PwPage {
  goto(url: string, opts?: Record<string, unknown>): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForSelector(sel: string, opts?: Record<string, unknown>): Promise<unknown>;
  waitForLoadState(state: string): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  screenshot(opts?: Record<string, unknown>): Promise<Buffer>;
  url(): string;
  evaluate<R>(fn: (arg: number) => R, arg: number): Promise<R>;
  evaluate<R>(fn: () => R): Promise<R>;
}

interface PwBrowserContext {
  newPage(): Promise<PwPage>;
}

interface PwBrowser {
  newContext(opts?: Record<string, unknown>): Promise<PwBrowserContext>;
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}

interface PwChromium {
  launch(opts?: Record<string, unknown>): Promise<PwBrowser>;
}

interface PwModule {
  chromium: PwChromium;
}

// ─── Types ──────────────────────────────────────────────────────

export interface BrowserSession {
  id: string;
  citizenId: string;
  startedAt: string;
  pageTitle: string;
  currentUrl: string;
  screenshotCount: number;
}

export interface Screenshot {
  id: string;
  base64: string;
  width: number;
  height: number;
  url: string;
  timestamp: string;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  links: { href: string; text: string }[];
  forms: FormField[];
  headings: string[];
  meta: Record<string, string>;
}

export interface FormField {
  name: string;
  type: string;
  label: string;
  selector: string;
  required: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface DownloadResult {
  filePath: string;
  sizeBytes: number;
  mimeType: string;
  downloadedAt: string;
}

export interface BrowserAction {
  type: "navigate" | "click" | "type" | "screenshot" | "extract" | "scroll" | "wait";
  selector?: string;
  value?: string;
  description: string;
}

export interface BrowserActionResult {
  action: BrowserAction;
  success: boolean;
  error?: string;
  screenshot?: Screenshot;
  content?: PageContent;
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const activeSessions = new Map<string, BrowserSession>();
const sessionHistory: BrowserSession[] = [];
const MAX_SESSION_HISTORY = 100;

/** Lazy-loaded playwright module reference */
let playwrightModule: PwModule | null = null;
let playwrightAvailable: boolean | null = null;

// ─── Playwright Loader ──────────────────────────────────────────

/**
 * Attempt to load Playwright dynamically. Returns null if not installed.
 * This allows the republic to operate without playwright as a hard dependency.
 */
async function loadPlaywright(): Promise<PwModule | null> {
  if (playwrightAvailable === false) {
    return null;
  }
  if (playwrightModule) {
    return playwrightModule;
  }

  try {
    // Use variable to prevent TypeScript from resolving the module at compile time
    const moduleName = "playwright";
    playwrightModule = (await import(/* webpackIgnore: true */ moduleName)) as unknown as PwModule;
    playwrightAvailable = true;
    return playwrightModule;
  } catch {
    playwrightAvailable = false;
    return null;
  }
}

/**
 * Check if browser automation is available.
 */
export async function isBrowserAvailable(): Promise<boolean> {
  const pw = await loadPlaywright();
  return pw !== null;
}

// ─── Browser Session Management ─────────────────────────────────

/**
 * Create a new browser session for a citizen.
 * Returns a session ID that can be used for subsequent operations.
 */
export function createSession(citizenId: string): BrowserSession {
  const session: BrowserSession = {
    id: uid(),
    citizenId,
    startedAt: ts(),
    pageTitle: "",
    currentUrl: "about:blank",
    screenshotCount: 0,
  };
  activeSessions.set(session.id, session);
  return session;
}

/**
 * End a browser session and archive it.
 */
export function endSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    activeSessions.delete(sessionId);
    sessionHistory.push(session);
    if (sessionHistory.length > MAX_SESSION_HISTORY) {
      sessionHistory.splice(0, sessionHistory.length - MAX_SESSION_HISTORY);
    }
  }
}

export function getActiveSessions(): BrowserSession[] {
  return Array.from(activeSessions.values());
}

export function getSessionHistory(): BrowserSession[] {
  return [...sessionHistory];
}

// ─── Core Browser Operations ────────────────────────────────────

/**
 * Navigate to a URL and extract page content.
 * This is the primary entry point for web browsing.
 */
export async function navigateTo(
  url: string,
  opts?: { waitForSelector?: string; timeout?: number },
): Promise<{ content: PageContent; screenshot: Screenshot }> {
  const pw = await loadPlaywright();
  if (!pw) {
    return {
      content: createFallbackContent(url),
      screenshot: createEmptyScreenshot(url),
    };
  }

  const browser = await pw.chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: "HoC-Republic-Agent/1.0 (+https://github.com/hunix/HoC)",
    });
    const page = await context.newPage();

    await page.goto(url, {
      timeout: opts?.timeout ?? 15_000,
      waitUntil: "domcontentloaded",
    });

    if (opts?.waitForSelector) {
      await page.waitForSelector(opts.waitForSelector, { timeout: 5_000 }).catch(() => {});
    }

    const content = await extractPageContent(page);
    const screenshot = await captureScreenshot(page, url);

    return { content, screenshot };
  } finally {
    await browser.close();
  }
}

/**
 * Search the web using DuckDuckGo Lite (no API key required).
 */
export async function searchWeb(query: string, maxResults = 10): Promise<SearchResult[]> {
  // Use DuckDuckGo HTML API — works without authentication
  const encodedQuery = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "HoC-Republic-Agent/1.0",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!resp.ok) {
      return [];
    }

    const html = await resp.text();
    return parseSearchResults(html, maxResults);
  } catch {
    return [];
  }
}

/**
 * Fill and submit a web form.
 */
export async function fillForm(
  url: string,
  fields: Record<string, string>,
  submitSelector?: string,
): Promise<BrowserActionResult> {
  const pw = await loadPlaywright();
  if (!pw) {
    return {
      action: { type: "type", description: `Fill form at ${url}` },
      success: false,
      error: "Playwright not available",
      timestamp: ts(),
    };
  }

  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { timeout: 15_000, waitUntil: "domcontentloaded" });

    // Fill each field
    for (const [selector, value] of Object.entries(fields)) {
      try {
        await page.fill(selector, value);
      } catch {
        // Try by name / id / placeholder as fallbacks
        try {
          await page.fill(`[name="${selector}"]`, value);
        } catch {
          try {
            await page.fill(`#${selector}`, value);
          } catch {
            // Skip this field if we can't find it
          }
        }
      }
    }

    // Submit if a submit selector is provided
    if (submitSelector) {
      await page.click(submitSelector);
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }

    const screenshot = await captureScreenshot(page, page.url());

    return {
      action: {
        type: "type",
        description: `Filled ${Object.keys(fields).length} fields at ${url}`,
      },
      success: true,
      screenshot,
      timestamp: ts(),
    };
  } catch (err) {
    return {
      action: { type: "type", description: `Fill form at ${url}` },
      success: false,
      error: err instanceof Error ? err.message : String(err),
      timestamp: ts(),
    };
  } finally {
    await browser.close();
  }
}

/**
 * Download a file from a URL.
 */
export async function downloadFile(url: string, savePath: string): Promise<DownloadResult> {
  const { writeFile } = await import("node:fs/promises");

  const resp = await fetch(url, {
    headers: { "User-Agent": "HoC-Republic-Agent/1.0" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  }

  const buffer = Buffer.from(await resp.arrayBuffer());
  await writeFile(savePath, buffer);

  return {
    filePath: savePath,
    sizeBytes: buffer.length,
    mimeType: resp.headers.get("content-type") ?? "application/octet-stream",
    downloadedAt: ts(),
  };
}

/**
 * Execute a sequence of browser actions (composite operation).
 */
export async function executeBrowserActions(
  url: string,
  actions: BrowserAction[],
): Promise<BrowserActionResult[]> {
  const pw = await loadPlaywright();
  if (!pw) {
    return actions.map((action) => ({
      action,
      success: false,
      error: "Playwright not available",
      timestamp: ts(),
    }));
  }

  const results: BrowserActionResult[] = [];
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { timeout: 15_000, waitUntil: "domcontentloaded" });

    for (const action of actions) {
      try {
        const result = await executeSingleAction(page, action);
        results.push(result);
      } catch (err) {
        results.push({
          action,
          success: false,
          error: err instanceof Error ? err.message : String(err),
          timestamp: ts(),
        });
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}

// ─── Internal Helpers ───────────────────────────────────────────

/** Execute a single browser action on a Playwright page */
async function executeSingleAction(
  page: PwPage,
  action: BrowserAction,
): Promise<BrowserActionResult> {
  const startTs = ts();

  switch (action.type) {
    case "navigate":
      if (action.value) {
        await page.goto(action.value, { timeout: 15_000, waitUntil: "domcontentloaded" });
      }
      break;

    case "click":
      if (action.selector) {
        await page.click(action.selector);
        await page.waitForLoadState("domcontentloaded").catch(() => {});
      }
      break;

    case "type":
      if (action.selector && action.value) {
        await page.fill(action.selector, action.value);
      }
      break;

    case "screenshot":
      // Just captures — handled below by default
      break;

    case "extract": {
      const content = await extractPageContent(page);
      return { action, success: true, content, timestamp: startTs };
    }

    case "scroll":
      await page.evaluate(
        (distance: number) => {
          window.scrollBy(0, distance);
        },
        parseInt(action.value ?? "500", 10),
      );
      break;

    case "wait":
      await page.waitForTimeout(parseInt(action.value ?? "1000", 10));
      break;
  }

  const screenshot = await captureScreenshot(page, page.url());
  return { action, success: true, screenshot, timestamp: startTs };
}

/** Extract structured content from a Playwright page */
async function extractPageContent(page: PwPage): Promise<PageContent> {
  return page.evaluate(() => {
    const links = Array.from(document.querySelectorAll("a[href]"))
      .slice(0, 50)
      .map((a) => ({
        href: (a as HTMLAnchorElement).href,
        text: (a as HTMLAnchorElement).textContent?.trim().slice(0, 100) ?? "",
      }));

    const forms = Array.from(document.querySelectorAll("input, textarea, select"))
      .slice(0, 30)
      .map((el) => {
        const input = el as HTMLInputElement;
        return {
          name: input.name || input.id || "",
          type: input.type || el.tagName.toLowerCase(),
          label: input.labels?.[0]?.textContent?.trim() ?? input.placeholder ?? "",
          selector: input.id ? `#${input.id}` : input.name ? `[name="${input.name}"]` : "",
          required: input.required ?? false,
        };
      })
      .filter((f) => f.selector !== "");

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .slice(0, 20)
      .map((h) => h.textContent?.trim().slice(0, 200) ?? "");

    const metaTags: Record<string, string> = {};
    document.querySelectorAll("meta[name], meta[property]").forEach((m) => {
      const key = m.getAttribute("name") || m.getAttribute("property") || "";
      const val = m.getAttribute("content") || "";
      if (key && val) {
        metaTags[key] = val.slice(0, 300);
      }
    });

    return {
      url: window.location.href,
      title: document.title,
      text: document.body?.innerText?.slice(0, 10_000) ?? "",
      links,
      forms,
      headings,
      meta: metaTags,
    };
  });
}

/** Capture a screenshot from a Playwright page */
async function captureScreenshot(page: PwPage, url: string): Promise<Screenshot> {
  const buffer = await page.screenshot({ type: "png", fullPage: false });
  return {
    id: uid(),
    base64: buffer.toString("base64"),
    width: 1280,
    height: 720,
    url,
    timestamp: ts(),
  };
}

/** Fallback content when Playwright is not available */
function createFallbackContent(url: string): PageContent {
  return {
    url,
    title: "(Playwright not installed — fallback mode)",
    text: "",
    links: [],
    forms: [],
    headings: [],
    meta: {},
  };
}

/** Empty screenshot placeholder */
function createEmptyScreenshot(url: string): Screenshot {
  return {
    id: uid(),
    base64: "",
    width: 0,
    height: 0,
    url,
    timestamp: ts(),
  };
}

/** Parse DuckDuckGo HTML search results */
function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks — DuckDuckGo Lite uses <a class="result__a"> and snippets
  const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
  const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

  const urls: string[] = [];
  const titles: string[] = [];
  const snippets: string[] = [];

  let match: RegExpExecArray | null;

  while ((match = resultPattern.exec(html)) !== null && urls.length < maxResults) {
    const rawUrl = match[1];
    const actualUrl = decodeURIComponent(rawUrl.replace(/.*uddg=/, "").replace(/&.*/, ""));
    urls.push(actualUrl || rawUrl);
    titles.push(match[2].trim());
  }

  while ((match = snippetPattern.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(match[1].replace(/<[^>]*>/g, "").trim());
  }

  for (let i = 0; i < urls.length; i++) {
    results.push({
      title: titles[i] ?? "",
      url: urls[i],
      snippet: snippets[i] ?? "",
      position: i + 1,
    });
  }

  return results;
}

// ─── Fetch-Based Web Content (No Playwright Needed) ─────────────

/**
 * Lightweight URL fetch that doesn't require Playwright.
 * Used for API calls, RSS feeds, and simple page grabs.
 */
export async function fetchUrlContent(
  url: string,
  opts?: { timeout?: number; headers?: Record<string, string> },
): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "HoC-Republic-Agent/1.0",
      ...opts?.headers,
    },
    signal: AbortSignal.timeout(opts?.timeout ?? 10_000),
  });

  const text = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => {
    headers[k] = v;
  });

  return { status: resp.status, text: text.slice(0, 50_000), headers };
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface ComputerUseDiagnostics {
  playwrightAvailable: boolean;
  activeSessions: number;
  totalSessionsRun: number;
}

export function getComputerUseDiagnostics(): ComputerUseDiagnostics {
  return {
    playwrightAvailable: playwrightAvailable ?? false,
    activeSessions: activeSessions.size,
    totalSessionsRun: sessionHistory.length + activeSessions.size,
  };
}
