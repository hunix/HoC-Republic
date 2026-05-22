/**
 * Brandings Engine
 *
 * Manages brand profiles for document generation. Each brand stores:
 * - Visual identity (logo, colors, fonts)
 * - Company info (name, tagline, description)
 * - Social links and assets
 *
 * Brand assets are stored on disk at data/brandings/<brand-id>/
 * Supports manual creation or auto-crawl from website URL.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Brand {
  id: string;
  name: string;
  website?: string;
  logo?: string;
  favicon?: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  fonts: {
    heading: string;
    body: string;
  };
  tagline?: string;
  description?: string;
  socialLinks?: Record<string, string>;
  assets: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const BRANDS_DIR = join(process.cwd(), "data", "brandings");

function ensureDir(dir: string): void {
  if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); }
}

function brandDir(id: string): string {
  return join(BRANDS_DIR, id);
}

function brandMetaPath(id: string): string {
  return join(brandDir(id), "brand.json");
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export function listBrands(): Brand[] {
  ensureDir(BRANDS_DIR);
  const dirs = readdirSync(BRANDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  const brands: Brand[] = [];
  for (const d of dirs) {
    const metaPath = join(BRANDS_DIR, d.name, "brand.json");
    if (existsSync(metaPath)) {
      try {
        const raw = readFileSync(metaPath, "utf-8");
        brands.push(JSON.parse(raw) as Brand);
      } catch { /* skip corrupt entries */ }
    }
  }
  return brands.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getBrand(id: string): Brand | null {
  const metaPath = brandMetaPath(id);
  if (!existsSync(metaPath)) { return null; }
  try {
    return JSON.parse(readFileSync(metaPath, "utf-8")) as Brand;
  } catch { return null; }
}

export function createBrand(data: Partial<Brand> & { name: string }): Brand {
  const id = `brand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = brandDir(id);
  ensureDir(dir);
  ensureDir(join(dir, "assets"));

  const brand: Brand = {
    id,
    name: data.name,
    website: data.website,
    logo: data.logo,
    favicon: data.favicon,
    colors: data.colors ?? { primary: "#6366f1", secondary: "#8b5cf6", accent: "#06b6d4", background: "#0f0f23" },
    fonts: data.fonts ?? { heading: "Inter", body: "Inter" },
    tagline: data.tagline,
    description: data.description,
    socialLinks: data.socialLinks,
    assets: data.assets ?? [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(brandMetaPath(id), JSON.stringify(brand, null, 2));
  return brand;
}

export function updateBrand(id: string, data: Partial<Brand>): Brand | null {
  const brand = getBrand(id);
  if (!brand) { return null; }

  const updated: Brand = {
    ...brand,
    ...data,
    id, // never change ID
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(brandMetaPath(id), JSON.stringify(updated, null, 2));
  return updated;
}

export function deleteBrand(id: string): boolean {
  const dir = brandDir(id);
  if (!existsSync(dir)) { return false; }
  rmSync(dir, { recursive: true, force: true });
  return true;
}

// ─── Website Crawl ───────────────────────────────────────────────────────────

export async function crawlBrandFromUrl(url: string): Promise<Brand> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (HoC BrandCrawler)" },
      signal: AbortSignal.timeout(15_000),
    });
    html = await res.text();
  } catch (e) {
    throw new Error(`Failed to fetch ${url}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }

  // Extract title
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  const name = titleMatch?.[1]?.trim() ?? new URL(url).hostname;

  // Extract meta description
  const descMatch = /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i.exec(html);
  const description = descMatch?.[1]?.trim();

  // Extract tagline (og:description or first h1)
  const ogDescMatch = /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i.exec(html);
  const h1Match = /<h1[^>]*>([^<]+)<\/h1>/i.exec(html);
  const tagline = ogDescMatch?.[1]?.trim() ?? h1Match?.[1]?.trim();

  // Extract favicon
  const faviconMatch = /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i.exec(html);
  let favicon = faviconMatch?.[1];
  if (favicon && !favicon.startsWith("http")) {
    favicon = new URL(favicon, url).href;
  }

  // Extract logo (og:image or first large image)
  const ogImageMatch = /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i.exec(html);
  let logo = ogImageMatch?.[1];
  if (logo && !logo.startsWith("http")) {
    logo = new URL(logo, url).href;
  }

  // Extract colors from CSS (look for most common hex colors)
  const colorMatches = html.match(/#[0-9a-fA-F]{6}/g) ?? [];
  const colorFreq = new Map<string, number>();
  for (const c of colorMatches) {
    const lower = c.toLowerCase();
    if (lower === "#ffffff" || lower === "#000000") { continue; } // skip B/W
    colorFreq.set(lower, (colorFreq.get(lower) ?? 0) + 1);
  }
  const sortedColors = [...colorFreq.entries()].toSorted((a, b) => b[1] - a[1]).map(([c]) => c);

  // Extract font families from CSS
  const fontMatches = html.match(/font-family:\s*['"]?([^;'"]+)/gi) ?? [];
  const fonts = fontMatches
    .map((f) => f.replace(/font-family:\s*['"]?/i, "").split(",")[0]?.trim() ?? "")
    .filter((f) => f && !f.includes("inherit") && !f.includes("system"));

  // Extract social links
  const socialPatterns: Record<string, RegExp> = {
    twitter: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/\w+/i,
    linkedin: /https?:\/\/(?:www\.)?linkedin\.com\/\w+\/[^"'\s]+/i,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/\w+/i,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/\w+/i,
    github: /https?:\/\/(?:www\.)?github\.com\/\w+/i,
  };
  const socialLinks: Record<string, string> = {};
  for (const [platform, re] of Object.entries(socialPatterns)) {
    const match = re.exec(html);
    if (match) { socialLinks[platform] = match[0]; }
  }

  // Download logo and favicon to disk
  const id = `brand-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = brandDir(id);
  ensureDir(dir);
  ensureDir(join(dir, "assets"));

  const assets: string[] = [];

  if (logo) {
    try {
      const res = await fetch(logo, { signal: AbortSignal.timeout(10_000) });
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = logo.split(".").pop()?.split("?")[0] ?? "png";
      const localPath = join(dir, `logo.${ext}`);
      writeFileSync(localPath, buf);
      assets.push(localPath);
      logo = localPath;
    } catch { /* logo download failed, keep URL */ }
  }

  if (favicon) {
    try {
      const res = await fetch(favicon, { signal: AbortSignal.timeout(10_000) });
      const buf = Buffer.from(await res.arrayBuffer());
      const localPath = join(dir, "favicon.ico");
      writeFileSync(localPath, buf);
      assets.push(localPath);
      favicon = localPath;
    } catch { /* favicon download failed */ }
  }

  const brand: Brand = {
    id,
    name,
    website: url,
    logo,
    favicon,
    colors: {
      primary: sortedColors[0] ?? "#6366f1",
      secondary: sortedColors[1] ?? "#8b5cf6",
      accent: sortedColors[2] ?? "#06b6d4",
      background: sortedColors[3] ?? "#0f0f23",
    },
    fonts: {
      heading: fonts[0] ?? "Inter",
      body: fonts[1] ?? fonts[0] ?? "Inter",
    },
    tagline,
    description,
    socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
    assets,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(brandMetaPath(id), JSON.stringify(brand, null, 2));
  return brand;
}
