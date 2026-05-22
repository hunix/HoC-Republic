/**
 * Web Tools — Web scraping, search, clone, browser interaction
 * Handles: web_scrape, web_search, clone_website, browser_interact
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

// Track whether Playwright has been verified in this session to avoid repeated checks
let playwrightVerified = false;

export function createWebToolHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  /**
   * Ensure Playwright + Chromium are installed in the sandbox.
   * Only checks once per session — subsequent calls are no-ops.
   */
  async function ensurePlaywright(): Promise<boolean> {
    if (playwrightVerified) {
      return true;
    }

    const check = await sandboxExec(
      "python3 -c 'from playwright.sync_api import sync_playwright; print(\"ok\")'",
      "/workspace",
      10,
    );
    if (check.exitCode === 0) {
      playwrightVerified = true;
      return true;
    }

    // Auto-install: pip + browser binary
    const install = await sandboxExec(
      "pip install --quiet playwright 2>&1 && python3 -m playwright install --with-deps chromium 2>&1 | tail -5",
      "/workspace",
      180,
    );
    if (install.exitCode === 0) {
      playwrightVerified = true;
      return true;
    }
    return false;
  }

  /**
   * Curl-based fallback for extracting page text when Playwright isn't available.
   * Returns raw HTML → stripped text via Python html.parser.
   */
  async function curlFallbackExtract(url: string): Promise<string> {
    const extractScript = `
import sys
from html.parser import HTMLParser

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text = []
        self.skip = False
        self.skip_tags = {'script', 'style', 'noscript', 'svg', 'head'}

    def handle_starttag(self, tag, attrs):
        if tag in self.skip_tags:
            self.skip = True

    def handle_endtag(self, tag):
        if tag in self.skip_tags:
            self.skip = False
        if tag in ('p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'li', 'tr'):
            self.text.append('\\n')

    def handle_data(self, data):
        if not self.skip:
            stripped = data.strip()
            if stripped:
                self.text.append(stripped)

html = sys.stdin.read()
parser = TextExtractor()
parser.feed(html)
result = ' '.join(parser.text)
# Collapse whitespace
import re
result = re.sub(r'\\n{3,}', '\\n\\n', result)
print(result[:8000])
`;
    await sandboxWriteFile("/tmp/_curl_extract.py", extractScript);
    const result = await sandboxExec(
      `curl -sL -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' --max-time 15 "${url}" | python3 /tmp/_curl_extract.py`,
      "/workspace",
      30,
    );
    if (result.exitCode === 0 && result.stdout.trim()) {
      return result.stdout.slice(0, 16000);
    }
    return `Failed to extract content from ${url}: ${result.stderr.slice(0, 500)}`;
  }

  return {
    web_scrape: async (input: ToolInput) => {
      const { url = "", selectors = "", mode = "scrape" } = input;

      // Try scrapling first (pre-installed in sandbox image)
      const cmd = [
        "python3", "/sandbox-api/scrapling-tools.py",
        mode, `"${url}"`,
        ...(selectors ? ["--selectors", `"${selectors}"`] : []),
      ].join(" ");
      const result = await sandboxExec(cmd, "/workspace", 90);
      if (result.exitCode === 0 && result.stdout.trim()) {
        return result.stdout.slice(0, 16000);
      }

      // Fallback 1: Try Playwright for JS-heavy sites (auto-installs if needed)
      if (mode === "dynamic" || mode === "stealth") {
        const pwReady = await ensurePlaywright();
        if (pwReady) {
          const pwScript = `
import json
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("${url}", timeout=30000)
    page.wait_for_load_state("networkidle", timeout=15000)
    title = page.title()
    text = page.inner_text("body")[:8000]
    links = page.eval_on_selector_all("a[href]", "els => els.map(e => ({text: e.textContent?.trim()?.slice(0,80), href: e.href})).filter(l => l.text).slice(0,30)")
    imgs = page.eval_on_selector_all("img[src]", "els => els.map(e => ({src: e.src, alt: e.alt})).slice(0,20)")
    print(json.dumps({"title": title, "url": page.url, "text": text, "links": links, "images": imgs}, indent=2))
    browser.close()
`;
          await sandboxWriteFile("/workspace/.scrape-pw.py", pwScript);
          const pwResult = await sandboxExec("python3 /workspace/.scrape-pw.py", "/workspace", 60);
          if (pwResult.exitCode === 0) {
            return pwResult.stdout.slice(0, 16000);
          }
        }
      }

      // Fallback 2: curl + text extraction (always works, no deps required)
      const fallback = await curlFallbackExtract(url);
      if (fallback.length > 100) {
        return `⚠️ Scrapling unavailable — used curl fallback.\n\n${fallback}`;
      }

      return `Scrape failed for ${url}.\n\nScrapling error: ${result.stderr.slice(0, 1000)}\n\nUse sandbox_exec with 'curl -sL "${url}" | head -500' or install beautifulsoup4 with 'pip install beautifulsoup4 requests' and write a custom scraper.`;
    },

    clone_website: async (input: ToolInput) => {
      const { url = "", output_dir = "", depth = 3, include_assets = true } = input;
      let domain = "site";
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch { /* ignore */ }
      const outDir = output_dir || `/workspace/cloned-sites/${domain}`;

      const httrackCheck = await sandboxExec("which httrack", "/workspace", 5);
      if (httrackCheck.exitCode !== 0) {
        const wgetCmd = [
          "mkdir -p", `"${outDir}"`, "&&",
          "wget", "--mirror", "--convert-links", "--adjust-extension",
          "--page-requisites", "--no-parent",
          `-P "${outDir}"`,
          `--max-redirect=5`,
          `-l ${Math.min(depth, 10)}`,
          include_assets ? "" : "--no-images --no-css --no-js",
          `"${url}"`,
          "2>&1 | tail -20",
        ].filter(Boolean).join(" ");

        const result = await sandboxExec(wgetCmd, "/workspace", 180);
        const listResult = await sandboxExec(`find "${outDir}" -type f | head -50 | sort`, "/workspace", 10);
        return `Website cloned to ${outDir}\n\nFiles:\n${listResult.stdout.slice(0, 4000)}\n\n${result.exitCode === 0 ? "✅ Clone complete" : "⚠️ Partial clone (some assets may have failed)"}`;
      }

      const httrackCmd = `httrack "${url}" -O "${outDir}" -r${Math.min(depth, 10)} ${include_assets ? "+*.css +*.js +*.png +*.jpg +*.gif +*.svg +*.woff +*.woff2 +*.ttf" : ""} -v 2>&1 | tail -10`;
      const result = await sandboxExec(httrackCmd, "/workspace", 180);
      const listResult = await sandboxExec(`find "${outDir}" -type f | head -50 | sort`, "/workspace", 10);
      return `Website cloned to ${outDir}\n\nFiles:\n${listResult.stdout.slice(0, 4000)}\n\n${result.exitCode === 0 ? "✅ Clone complete" : "⚠️ Partial clone"}\n${result.stdout}`;
    },

    browser_interact: async (input: ToolInput) => {
      const { action, url, selector, value, output_path } = input;

      // For simple text extraction actions, try curl fallback first if Playwright isn't verified
      if (!playwrightVerified && (action === "get_text" || action === "navigate") && url) {
        const curlText = await curlFallbackExtract(url);
        if (curlText.length > 200) {
          // Try installing Playwright in background for future calls, but don't block
          void ensurePlaywright();
          return action === "get_text"
            ? curlText
            : `Title: (extracted via curl)\nURL: ${url}\n\n${curlText.slice(0, 3000)}`;
        }
      }

      // Ensure Playwright is installed before attempting browser actions
      const pwReady = await ensurePlaywright();
      if (!pwReady) {
        return `❌ Playwright could not be installed in the sandbox. Try using web_scrape or sandbox_exec with curl instead.\n\nExample: sandbox_exec with command 'curl -sL "${url ?? "https://example.com"}" | head -500'`;
      }

      let script = `
import sys
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1920, "height": 1080})
`;
      switch (action) {
        case "navigate":
          script += `    page.goto("${url ?? "about:blank"}", timeout=30000)\n`;
          script += `    page.wait_for_load_state("networkidle", timeout=10000)\n`;
          script += `    print(f"Title: {page.title()}")\n`;
          script += `    print(f"URL: {page.url}")\n`;
          break;
        case "click":
          if (url) { script += `    page.goto("${url}", timeout=30000)\n`; }
          script += `    page.click("${selector ?? "body"}", timeout=10000)\n`;
          script += `    page.wait_for_timeout(1000)\n`;
          script += `    print("Clicked element")\n`;
          break;
        case "fill":
          if (url) { script += `    page.goto("${url}", timeout=30000)\n`; }
          script += `    page.fill("${selector ?? "input"}", "${(value ?? "").replace(/"/g, '\\"')}")\n`;
          script += `    print("Filled form field")\n`;
          break;
        case "screenshot":
          script += `    page.goto("${url ?? "about:blank"}", timeout=30000)\n`;
          script += `    page.wait_for_load_state("networkidle", timeout=10000)\n`;
          script += `    page.screenshot(path="${output_path ?? "/workspace/screenshot.png"}", full_page=True)\n`;
          script += `    print(f"Screenshot saved to ${output_path ?? "/workspace/screenshot.png"}")\n`;
          break;
        case "evaluate":
          if (url) { script += `    page.goto("${url}", timeout=30000)\n`; }
          script += `    result = page.evaluate("""${(value ?? "document.title").replace(/"""/g, '\\"\\"\\""')}
""")\n`;
          script += `    print(f"Result: {result}")\n`;
          break;
        case "get_text":
          if (url) { script += `    page.goto("${url}", timeout=30000)\n`; }
          script += `    text = page.inner_text("${selector ?? "body"}")\n`;
          script += `    print(text[:5000])\n`;
          break;
        case "get_links":
          script += `    page.goto("${url ?? "about:blank"}", timeout=30000)\n`;
          script += `    links = page.eval_on_selector_all("a[href]", "els => els.map(e => ({text: e.textContent?.trim(), href: e.href}))")\n`;
          script += `    for link in links[:50]:\n`;
          script += `        print(f"{link.get('text', '')} -> {link.get('href', '')}")\n`;
          break;
        case "pdf":
          script += `    page.goto("${url ?? "about:blank"}", timeout=30000)\n`;
          script += `    page.wait_for_load_state("networkidle", timeout=10000)\n`;
          script += `    page.pdf(path="${output_path ?? "/workspace/output.pdf"}", format="A4", print_background=True)\n`;
          script += `    print(f"PDF saved to ${output_path ?? "/workspace/output.pdf"}")\n`;
          break;
        case "wait":
          if (url) { script += `    page.goto("${url}", timeout=30000)\n`; }
          script += `    page.wait_for_selector("${selector ?? "body"}", timeout=15000)\n`;
          script += `    print(f"Element found: ${selector ?? "body"}")\n`;
          break;
        case "scroll":
          if (url) { script += `    page.goto("${url}", timeout=30000)\n`; }
          script += `    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")\n`;
          script += `    page.wait_for_timeout(2000)\n`;
          script += `    print("Scrolled to bottom")\n`;
          break;
        default:
          return `Unknown browser action: ${action}`;
      }
      script += `    browser.close()\n`;

      await sandboxWriteFile("/workspace/.browser-action.py", script);
      const result = await sandboxExec("python3 /workspace/.browser-action.py", "/workspace", 60);
      return result.exitCode === 0
        ? result.stdout || "Browser action completed"
        : `Browser error: ${result.stderr || result.stdout}`;
    },

    web_search: async (input: ToolInput) => {
      const query = (input.query as string) || "";
      const numResults = Math.min((input.num_results as number) || 10, 20);
      if (!query) { return "Error: query is required"; }

      const parserScript = `
import sys, json, re
from html.parser import HTMLParser
from urllib.parse import unquote

class DDGParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.results = []
        self.in_result = False
        self.in_title = False
        self.in_snippet = False
        self.current = {}
        self.text_buf = []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        cls = d.get("class", "")
        if tag == "div" and "result__body" in cls:
            self.in_result = True
            self.current = {}
        if self.in_result:
            if tag == "a" and "result__a" in cls:
                self.in_title = True
                href = d.get("href", "")
                m = re.search(r"uddg=([^&]+)", href)
                self.current["url"] = unquote(m.group(1)) if m else href
            if tag == "a" and "result__snippet" in cls:
                self.in_snippet = True

    def handle_endtag(self, tag):
        if self.in_title and tag == "a":
            self.current["title"] = "".join(self.text_buf).strip()
            self.text_buf = []
            self.in_title = False
        if self.in_snippet and tag == "a":
            self.current["snippet"] = "".join(self.text_buf).strip()
            self.text_buf = []
            self.in_snippet = False
        if tag == "div" and self.in_result and self.current.get("title"):
            self.results.append(self.current)
            self.current = {}
            self.in_result = False

    def handle_data(self, data):
        if self.in_title or self.in_snippet:
            self.text_buf.append(data)

html = sys.stdin.read()
parser = DDGParser()
parser.feed(html)
n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
print(json.dumps(parser.results[:n], indent=2))
`;
      await sandboxWriteFile("/tmp/ddg_parse.py", parserScript);
      const encodedQuery = encodeURIComponent(query);
      const result = await sandboxExec(
        `curl -sL -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' 'https://html.duckduckgo.com/html/?q=${encodedQuery}' | python3 /tmp/ddg_parse.py ${numResults}`,
        "/workspace",
        30,
      );
      if (result.exitCode !== 0) {
        return `Search failed: ${result.stderr.slice(0, 500)}`;
      }
      return result.stdout.trim() || "No results found";
    },
  };
}

export const webToolSummary: ToolSummaryMap = {
  web_scrape: (input) => `🔍 ${input.url ?? ""}`,
  clone_website: (input) => `🌐 ${input.url ?? ""} → ${input.output_dir ?? "auto"}`,
  browser_interact: (input) => `🌐 ${input.action ?? "navigate"}: ${input.url ?? ""}`,
  web_search: (input) => `🔍 Search: "${input.query ?? ""}"`,
};
