/**
 * Republic Platform — Screenshot Service
 *
 * Captures screenshots of the tactical map / world monitor pages
 * using Puppeteer-core with a bundled Chromium binary.
 *
 * Usage:
 *   const png = await captureMapScreenshot({ country: "IR", zoom: 4 });
 *   // Returns base64-encoded PNG
 *
 * Called by:
 *   - gateway RPC: republic.intel.screenshot
 *   - WhatsApp bridge: when citizen uses request_map_screenshot tool
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

// ─── Types ───────────────────────────────────────────────────────

export interface ScreenshotOptions {
  /** ISO-2 country code to focus on (optional for full world view) */
  country?: string;
  /** Map zoom level 2-8 */
  zoom?: number;
  /** Page to capture: "tactical" | "world" */
  page?: "tactical" | "world";
  /** Width in px */
  width?: number;
  /** Height in px */
  height?: number;
}

export interface ScreenshotResult {
  ok: boolean;
  base64?: string;
  dataUri?: string;
  filePath?: string;
  error?: string;
  /** Width x height */
  dimensions?: { w: number; h: number };
}

// ─── Country coordinates ─────────────────────────────────────────

const COUNTRY_CENTERS: Record<string, [number, number]> = {
  US: [38, -97],
  RU: [61, 105],
  CN: [35, 105],
  UA: [48, 31],
  IR: [32, 53],
  IL: [31, 35],
  TW: [23, 121],
  KP: [40, 127],
  SA: [24, 45],
  TR: [39, 35],
  PL: [52, 20],
  DE: [51, 10],
  FR: [46, 2],
  GB: [54, -2],
  IN: [20, 77],
  PK: [30, 70],
  SY: [35, 38],
  YE: [15, 48],
  MM: [17, 96],
  VE: [8, -66],
  BR: [-14, -51],
  AE: [24, 54],
  EG: [27, 30],
  IQ: [33, 44],
  KW: [29, 47],
  QA: [25, 51],
  JO: [31, 36],
  LB: [34, 36],
  AF: [33, 65],
  SD: [15, 30],
  SO: [6, 46],
  ET: [8, 38],
  NG: [9, 8],
  ZA: [-29, 25],
};

// ─── Gateway base URL resolver ────────────────────────────────────

function getGatewayBaseUrl(): string {
  // Check for PORT env variable (same as gateway startup)
  const port = process.env.PORT ?? process.env.GATEWAY_PORT ?? "18785";
  return `http://127.0.0.1:${port}`;
}

// ─── Core screenshot function ─────────────────────────────────────

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
let browserInstance: any = null;
let browserLaunchError: string | null = null;

// oxlint-disable-next-line @typescript-eslint/no-explicit-any
async function getBrowser(): Promise<any> {
  // oxlint-disable-next-line curly
  if (browserInstance) return browserInstance;
  // oxlint-disable-next-line curly
  if (browserLaunchError) return null;

  try {
    // Dynamic import via Function() — prevents tsc from requiring puppeteer-core types at compile time.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const puppeteer = await (
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      new Function("m", "return import(m)") as (m: string) => Promise<unknown>
    )("puppeteer-core").catch(() => null);
    if (!puppeteer) {
      browserLaunchError = "puppeteer-core not installed. Run: pnpm add puppeteer-core";
      console.warn(`[Screenshot] ${browserLaunchError}`);
      return null;
    }
    const pptr = puppeteer as { launch: (opts: Record<string, unknown>) => Promise<unknown> };

    // Try to find a local Chromium/Chrome installation
    const chromePaths = [
      // Windows
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
      // Linux
      "/usr/bin/google-chrome",
      "/usr/bin/chromium-browser",
      "/usr/bin/chromium",
      // macOS
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];

    let executablePath: string | undefined;
    for (const p of chromePaths) {
      try {
        await fs.access(p);
        executablePath = p;
        break;
      } catch {
        /* not found */
      }
    }

    if (!executablePath) {
      browserLaunchError =
        "No Chrome/Chromium found. Install Google Chrome or run: npx puppeteer browsers install chrome";
      console.warn(`[Screenshot] ${browserLaunchError}`);
      return null;
    }

    browserInstance = await pptr.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1400,800",
      ],
    });

    console.log(`[Screenshot] Browser launched: ${executablePath}`);
    return browserInstance;
  } catch (err) {
    browserLaunchError = String(err);
    console.warn(`[Screenshot] Browser launch failed: ${String(err)}`);
    return null;
  }
}

/**
 * Capture a screenshot of the tactical map or world monitor.
 * Returns base64 PNG on success, or descriptive error on failure.
 */
export async function captureMapScreenshot(
  opts: ScreenshotOptions = {},
): Promise<ScreenshotResult> {
  const { country, zoom = country ? 4 : 2.5, page = "tactical", width = 1200, height = 700 } = opts;

  // Build URL
  const base = getGatewayBaseUrl();
  const routeMap: Record<string, string> = {
    tactical: "/intel/tactical-map",
    world: "/intel/world-monitor",
  };
  const pagePath = routeMap[page] ?? routeMap.tactical;
  const url = `${base}${pagePath}`;

  // Build URL fragment for country focus
  const center = country ? COUNTRY_CENTERS[country.toUpperCase()] : null;
  const fragment = center ? `#${center[0]},${center[1]},${zoom}` : `#20,15,${zoom}`;
  const fullUrl = `${url}${fragment}`;

  const browser = await getBrowser();
  if (!browser) {
    // Return a graceful text-only fallback
    return {
      ok: false,
      error: browserLaunchError ?? "Screenshot service unavailable",
    };
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any
  let browserPage: any = null;
  try {
    browserPage = await browser.newPage();
    await browserPage.setViewport({ width, height });

    // Navigate and wait for map to render
    await browserPage.goto(fullUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for Leaflet tiles to load
    await new Promise((r) => setTimeout(r, 3000));

    // Focus country if specified
    if (center) {
      await browserPage
        .evaluate(
          (lat: number, lng: number, z: number) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const w = window as any;
            if (w.__leafletMap) {
              w.__leafletMap.setView([lat, lng], z);
            }
          },
          center[0],
          center[1],
          zoom,
        )
        .catch(() => {
          /* map API may not be exposed */
        });
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Capture screenshot
    const pngBuffer = await browserPage.screenshot({ type: "png", fullPage: false });
    const base64 = Buffer.from(pngBuffer).toString("base64");
    const dataUri = `data:image/png;base64,${base64}`;

    // Also save to /tmp for WhatsApp media sending
    const tmpFile = path.join(os.tmpdir(), `hoc-map-${Date.now()}.png`);
    await fs.writeFile(tmpFile, pngBuffer);

    return { ok: true, base64, dataUri, filePath: tmpFile, dimensions: { w: width, h: height } };
  } catch (err) {
    // If browser crashed, reset for next call
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch {
        /* ignore */
      }
      browserInstance = null;
      browserLaunchError = null;
    }
    return { ok: false, error: `Screenshot failed: ${String(err)}` };
  } finally {
    if (browserPage) {
      try {
        await browserPage.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Close the browser instance (call on gateway shutdown) */
export async function closeScreenshotService(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {
      /* ignore */
    }
    browserInstance = null;
  }
}

/** Quick health check */
export function isScreenshotServiceAvailable(): boolean {
  return browserInstance !== null || browserLaunchError === null;
}
