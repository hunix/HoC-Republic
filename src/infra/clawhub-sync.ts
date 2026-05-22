/**
 * clawhub-sync.ts — Background service that paginates the ClawHub skill registry,
 * caches all ~24k skills in memory for fast UI queries, AND persists them to disk
 * in republic-output/skills/ organized by category.
 *
 * API: GET https://clawhub.ai/api/v1/skills?limit=100&cursor=<opaque>
 *      → { items: ClawHubSkill[], nextCursor: string | null }
 *
 * Refreshes on gateway boot and every 30 minutes.
 */

import fs from "node:fs";
import path from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("clawhub-sync");

// ─── Types ────────────────────────────────────────────────────────

export interface ClawHubSkillStats {
  comments: number;
  downloads: number;
  installsAllTime: number;
  installsCurrent: number;
  stars: number;
  versions: number;
}

export interface ClawHubSkillVersion {
  version: string;
  createdAt: number;
  changelog: string | null;
  license: string | null;
}

export interface ClawHubSkill {
  slug: string;
  displayName: string;
  summary: string;
  tags: Record<string, string>;
  stats: ClawHubSkillStats;
  createdAt: number;
  updatedAt: number;
  latestVersion: ClawHubSkillVersion | null;
  metadata: { os: string[] | null; systems: string[] | null } | null;
}

// ─── Category taxonomy for folder organization ────────────────────

const TAG_TO_CATEGORY: Record<string, string> = {
  // Development
  "coding": "development", "code": "development", "developer": "development",
  "programming": "development", "debug": "development", "debugging": "development",
  "engineering": "development", "software": "development", "devtools": "development",
  "git": "development", "github": "development", "vscode": "development",
  "typescript": "development", "javascript": "development", "python": "development",
  "rust": "development", "go": "development", "java": "development",
  // AI & ML
  "ai": "ai-ml", "ml": "ai-ml", "machine-learning": "ai-ml",
  "llm": "ai-ml", "gpt": "ai-ml", "claude": "ai-ml",
  "openai": "ai-ml", "anthropic": "ai-ml", "agents": "ai-ml",
  "reasoning": "ai-ml", "prompt": "ai-ml", "prompting": "ai-ml",
  // Data & Analytics
  "data": "data-analytics", "analytics": "data-analytics", "database": "data-analytics",
  "sql": "data-analytics", "csv": "data-analytics", "json": "data-analytics",
  "visualization": "data-analytics", "charts": "data-analytics",
  // Security
  "security": "security", "cybersecurity": "security", "hacking": "security",
  "pentest": "security", "encryption": "security", "privacy": "security",
  "auth": "security", "authentication": "security",
  // Productivity
  "productivity": "productivity", "automation": "productivity", "workflow": "productivity",
  "task": "productivity", "project": "productivity", "management": "productivity",
  "calendar": "productivity", "email": "productivity", "notes": "productivity",
  // Communication
  "communication": "communication", "chat": "communication", "messaging": "communication",
  "social": "communication", "twitter": "communication", "slack": "communication",
  "discord": "communication", "telegram": "communication",
  // Content & Creative
  "writing": "content-creative", "content": "content-creative", "blog": "content-creative",
  "seo": "content-creative", "marketing": "content-creative", "design": "content-creative",
  "image": "content-creative", "video": "content-creative", "audio": "content-creative",
  "music": "content-creative", "art": "content-creative",
  // Research & Education
  "research": "research-education", "education": "research-education",
  "learning": "research-education", "study": "research-education",
  "science": "research-education", "math": "research-education",
  "academic": "research-education", "teaching": "research-education",
  // DevOps & Infrastructure
  "devops": "devops-infra", "docker": "devops-infra", "kubernetes": "devops-infra",
  "cloud": "devops-infra", "aws": "devops-infra", "azure": "devops-infra",
  "infrastructure": "devops-infra", "ci-cd": "devops-infra", "monitoring": "devops-infra",
  // Finance & Business
  "finance": "finance-business", "business": "finance-business", "trading": "finance-business",
  "crypto": "finance-business", "accounting": "finance-business", "investment": "finance-business",
  // Health & Wellness
  "health": "health-wellness", "medical": "health-wellness", "fitness": "health-wellness",
  "mental-health": "health-wellness", "wellness": "health-wellness",
  // Coaching & Self-Improvement
  "coaching": "self-improvement", "self-improvement": "self-improvement",
  "personality": "self-improvement", "mbti": "self-improvement",
  // Testing & QA
  "testing": "testing-qa", "qa": "testing-qa", "test": "testing-qa",
  "quality": "testing-qa", "e2e": "testing-qa",
  // Web & API
  "web": "web-api", "api": "web-api", "rest": "web-api", "graphql": "web-api",
  "scraping": "web-api", "browser": "web-api", "html": "web-api", "css": "web-api",
  // Gaming
  "game": "gaming", "gaming": "gaming", "gamedev": "gaming",
};

function categorizeSkill(skill: ClawHubSkill): string {
  const tagKeys = Object.keys(skill.tags).map((t) => t.toLowerCase());
  for (const tag of tagKeys) {
    if (tag === "latest") { continue; }
    const cat = TAG_TO_CATEGORY[tag];
    if (cat) { return cat; }
  }
  // Fallback: try matching summary keywords
  const summaryLower = skill.summary.toLowerCase();
  for (const [keyword, cat] of Object.entries(TAG_TO_CATEGORY)) {
    if (summaryLower.includes(keyword)) { return cat; }
  }
  return "general";
}

// ─── In-memory cache ──────────────────────────────────────────────

const skillCache = new Map<string, ClawHubSkill>();
const searchIndex = new Map<string, Set<string>>(); // token → set of slugs
let lastSyncAt = 0;
let syncing = false;
let syncError: string | null = null;

// ─── Tokenizer for search ─────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

// ─── Fetch one page ───────────────────────────────────────────────

const BASE_URL = "https://clawhub.ai/api/v1/skills";
const PAGE_SIZE = 100;

interface ApiResponse {
  items: ClawHubSkill[];
  nextCursor: string | null;
}

async function fetchPage(cursor?: string): Promise<ApiResponse> {
  const url = new URL(BASE_URL);
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`ClawHub API ${res.status}: ${res.statusText}`);
  }
  return (await res.json()) as ApiResponse;
}

// ─── Disk persistence ─────────────────────────────────────────────

const SKILLS_DIR = path.resolve("republic-output", "skills");

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeSkillToDisk(skill: ClawHubSkill, category: string) {
  const categoryDir = path.join(SKILLS_DIR, category);
  const skillDir = path.join(categoryDir, skill.slug);
  ensureDirSync(skillDir);

  // Write manifest
  const manifest = {
    slug: skill.slug,
    displayName: skill.displayName,
    summary: skill.summary,
    tags: skill.tags,
    stats: skill.stats,
    category,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
    latestVersion: skill.latestVersion,
    metadata: skill.metadata,
    source: "clawhub.ai",
    installedAt: Date.now(),
  };
  fs.writeFileSync(
    path.join(skillDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );

  // Write SKILL.md with frontmatter + summary (the standard skill format)
  const tagList = Object.keys(skill.tags).filter((t) => t !== "latest");
  const os = skill.metadata?.os?.join(", ") ?? "any";
  const version = skill.latestVersion?.version ?? "unknown";
  const license = skill.latestVersion?.license ?? "unknown";

  const skillMd = `---
name: "${skill.displayName}"
slug: "${skill.slug}"
version: "${version}"
license: "${license}"
os: [${os}]
tags: [${tagList.join(", ")}]
source: "https://clawhub.ai/skills/${skill.slug}"
downloads: ${skill.stats.downloads}
stars: ${skill.stats.stars}
---

# ${skill.displayName}

${skill.summary}

## Source

- **Registry**: [ClawHub](https://clawhub.ai/skills/${skill.slug})
- **Version**: ${version}
- **Downloads**: ${skill.stats.downloads.toLocaleString()}
- **Category**: ${category}
${skill.latestVersion?.changelog ? `\n## Changelog\n\n${skill.latestVersion.changelog}\n` : ""}
`;
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, "utf-8");
}

function writeCategoryIndex(category: string, skills: ClawHubSkill[]) {
  const categoryDir = path.join(SKILLS_DIR, category);
  ensureDirSync(categoryDir);

  const index = {
    category,
    skillCount: skills.length,
    updatedAt: Date.now(),
    skills: skills.map((s) => ({
      slug: s.slug,
      displayName: s.displayName,
      summary: s.summary.slice(0, 200),
      downloads: s.stats.downloads,
    })),
  };
  fs.writeFileSync(
    path.join(categoryDir, "_index.json"),
    JSON.stringify(index, null, 2),
    "utf-8",
  );
}

function writeMasterIndex(categoryMap: Map<string, ClawHubSkill[]>) {
  ensureDirSync(SKILLS_DIR);
  const index = {
    totalSkills: skillCache.size,
    categories: [...categoryMap.entries()].map(([cat, skills]) => ({
      name: cat,
      skillCount: skills.length,
      topSkills: skills
        .toSorted((a, b) => b.stats.downloads - a.stats.downloads)
        .slice(0, 5)
        .map((s) => s.slug),
    })),
    syncedAt: Date.now(),
    source: "https://clawhub.ai",
  };
  fs.writeFileSync(
    path.join(SKILLS_DIR, "_master_index.json"),
    JSON.stringify(index, null, 2),
    "utf-8",
  );
}

function persistAllToDisk() {
  const t0 = Date.now();
  const categoryMap = new Map<string, ClawHubSkill[]>();

  for (const skill of skillCache.values()) {
    const category = categorizeSkill(skill);
    let list = categoryMap.get(category);
    if (!list) {
      list = [];
      categoryMap.set(category, list);
    }
    list.push(skill);
  }

  // Write individual skills and category indexes
  for (const [category, skills] of categoryMap) {
    for (const skill of skills) {
      writeSkillToDisk(skill, category);
    }
    writeCategoryIndex(category, skills);
  }

  // Write master index
  writeMasterIndex(categoryMap);

  log.info(
    `Persisted ${skillCache.size} skills to disk across ${categoryMap.size} categories in ${Date.now() - t0}ms`,
  );
}

// ─── Full sync ────────────────────────────────────────────────────

async function syncAll() {
  if (syncing) {
    return;
  }
  syncing = true;
  syncError = null;
  const t0 = Date.now();
  let count = 0;
  let cursor: string | undefined;

  // Build into temp maps so we can swap atomically
  const tempCache = new Map<string, ClawHubSkill>();
  const tempIndex = new Map<string, Set<string>>();

  try {
    log.info("Starting ClawHub catalog sync...");
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page = await fetchPage(cursor);
      for (const skill of page.items) {
        tempCache.set(skill.slug, skill);
        // inline index build into temp
        const tokens = new Set([
          ...tokenize(skill.slug),
          ...tokenize(skill.displayName),
          ...tokenize(skill.summary),
          ...Object.keys(skill.tags).flatMap((t) => tokenize(t)),
        ]);
        for (const token of tokens) {
          let set = tempIndex.get(token);
          if (!set) {
            set = new Set();
            tempIndex.set(token, set);
          }
          set.add(skill.slug);
        }
        count++;
      }
      if (!page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    // Atomic swap
    skillCache.clear();
    searchIndex.clear();
    for (const [k, v] of tempCache) {
      skillCache.set(k, v);
    }
    for (const [k, v] of tempIndex) {
      searchIndex.set(k, v);
    }
    lastSyncAt = Date.now();
    log.info(`ClawHub sync complete: ${count} skills cached in ${Date.now() - t0}ms`);

    // Persist to disk
    try {
      persistAllToDisk();
    } catch (diskErr) {
      log.warn(`Disk persistence failed: ${diskErr instanceof Error ? diskErr.message : String(diskErr)}`);
    }
  } catch (err) {
    syncError = err instanceof Error ? err.message : String(err);
    log.warn(`ClawHub sync failed: ${syncError}`);
  } finally {
    syncing = false;
  }
}

// ─── Public API ───────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;
const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function startClawHubSync() {
  // Fire-and-forget initial sync
  void syncAll();
  // Periodic refresh
  if (!syncInterval) {
    syncInterval = setInterval(() => void syncAll(), SYNC_INTERVAL_MS);
  }
}

export function stopClawHubSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export function getClawHubSyncStatus() {
  return {
    totalSkills: skillCache.size,
    lastSyncAt,
    syncing,
    syncError,
    searchIndexSize: searchIndex.size,
    diskPath: SKILLS_DIR,
  };
}

export function getClawHubSkills(opts: {
  offset?: number;
  limit?: number;
  sort?: "downloads" | "newest" | "stars" | "name";
  tag?: string;
  category?: string;
}): { items: ClawHubSkill[]; total: number } {
  let skills = [...skillCache.values()];

  // Filter by tag
  if (opts.tag) {
    const tagLower = opts.tag.toLowerCase();
    skills = skills.filter((s) =>
      Object.keys(s.tags).some((t) => t.toLowerCase() === tagLower),
    );
  }

  // Filter by category
  if (opts.category) {
    const cat = opts.category.toLowerCase();
    skills = skills.filter((s) => categorizeSkill(s) === cat);
  }

  // Sort
  switch (opts.sort) {
    case "downloads":
      skills = skills.toSorted((a, b) => b.stats.downloads - a.stats.downloads);
      break;
    case "newest":
      skills = skills.toSorted((a, b) => b.createdAt - a.createdAt);
      break;
    case "stars":
      skills = skills.toSorted((a, b) => b.stats.stars - a.stats.stars);
      break;
    case "name":
      skills = skills.toSorted((a, b) => a.displayName.localeCompare(b.displayName));
      break;
    default:
      skills = skills.toSorted((a, b) => b.stats.downloads - a.stats.downloads);
  }

  const total = skills.length;
  const offset = opts.offset ?? 0;
  const limit = Math.min(opts.limit ?? 50, 200);
  return {
    items: skills.slice(offset, offset + limit),
    total,
  };
}

export function searchClawHubSkills(query: string, opts: {
  offset?: number;
  limit?: number;
}): { items: ClawHubSkill[]; total: number } {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return getClawHubSkills({ offset: opts.offset, limit: opts.limit });
  }

  // Intersection of slug sets for all query tokens
  let matchingSlugs: Set<string> | null = null;
  for (const token of tokens) {
    const tokenMatches = new Set<string>();
    for (const [key, slugs] of searchIndex) {
      if (key.startsWith(token) || token.startsWith(key)) {
        for (const slug of slugs) {
          tokenMatches.add(slug);
        }
      }
    }
    if (matchingSlugs === null) {
      matchingSlugs = tokenMatches;
    } else {
      const prev: Set<string> = matchingSlugs;
      matchingSlugs = new Set([...prev].filter((s: string) => tokenMatches.has(s)));
    }
  }

  const slugs = matchingSlugs ?? new Set<string>();
  const skills = [...slugs]
    .map((slug) => skillCache.get(slug))
    .filter((s): s is ClawHubSkill => s !== undefined)
    .toSorted((a, b) => b.stats.downloads - a.stats.downloads);

  const total = skills.length;
  const offset = opts.offset ?? 0;
  const limit = Math.min(opts.limit ?? 50, 200);
  return {
    items: skills.slice(offset, offset + limit),
    total,
  };
}

export function getClawHubSkill(slug: string): ClawHubSkill | undefined {
  return skillCache.get(slug);
}

export function getClawHubTopTags(limit = 30): { tag: string; count: number }[] {
  const tagCounts = new Map<string, number>();
  for (const skill of skillCache.values()) {
    for (const tag of Object.keys(skill.tags)) {
      if (tag === "latest") { continue; }
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  return [...tagCounts.entries()]
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

export function getClawHubCategories(): { name: string; count: number }[] {
  const cats = new Map<string, number>();
  for (const skill of skillCache.values()) {
    const cat = categorizeSkill(skill);
    cats.set(cat, (cats.get(cat) ?? 0) + 1);
  }
  return [...cats.entries()]
    .toSorted(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));
}

// ─── Convenience wrappers for citizen tools ───────────────────────

/** Search skills by query with optional category and limit. */
export function searchSkills(
  query: string,
  opts?: { category?: string; limit?: number },
): Array<{ name: string; summary: string; category?: string; tags?: string[]; downloads?: number }> {
  const results = opts?.category
    ? getClawHubSkills({ limit: opts?.limit ?? 10, sort: "downloads" })
    : searchClawHubSkills(query, { limit: opts?.limit ?? 10 });

  // If category filter was set, also do the search within that category
  let items = results.items;
  if (opts?.category) {
    const cat = opts.category.toLowerCase();
    const searchResults = searchClawHubSkills(query, { limit: 200 });
    items = searchResults.items.filter((s) => categorizeSkill(s) === cat).slice(0, opts?.limit ?? 10);
  }

  return items.map((s) => ({
    name: s.displayName,
    summary: s.summary,
    category: categorizeSkill(s),
    tags: Object.keys(s.tags).filter((t) => t !== "latest"),
    downloads: s.stats.downloads,
  }));
}

/** Get registry statistics for the browse tool. */
export function getRegistryStats(): { totalSkills: number; categories: Array<{ name: string; count: number }> } {
  return {
    totalSkills: skillCache.size,
    categories: getClawHubCategories(),
  };
}

/** Look up a skill by display name (case-insensitive). */
export function getSkillByName(name: string): { name: string; category?: string } | null {
  const lower = name.toLowerCase();
  for (const skill of skillCache.values()) {
    if (skill.displayName.toLowerCase() === lower || skill.slug.toLowerCase() === lower) {
      return { name: skill.displayName, category: categorizeSkill(skill) };
    }
  }
  return null;
}

