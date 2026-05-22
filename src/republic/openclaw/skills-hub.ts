/**
 * OpenClaw — Skills Hub (ClawHub-style Marketplace)
 *
 * Adapted from upstream OpenClaw `agents/skills-clawhub.ts`.
 *
 * Provides a marketplace-style skill discovery and management system:
 *  - Remote skill catalog with search, filtering, and pagination
 *  - User rating and review system (bounded per-skill)
 *  - Installation tracking and version management
 *  - Featured/trending skill promotion
 *  - Skill capability matching for agent task requirements
 *
 * This operates as an in-memory registry seeded at boot from local skills
 * and optionally synced with remote registries.
 *
 * Memory Safety:
 *  - MAX_CATALOG_ENTRIES caps the catalog at 500 entries
 *  - MAX_RATINGS_PER_SKILL caps ratings at 100 per skill
 *  - MAX_INSTALL_HISTORY caps install history at 200 entries
 *  - Eviction: oldest entries are removed when caps are hit
 */

// ─── Types ──────────────────────────────────────────────────────

export interface SkillCatalogEntry {
  /** Unique identifier (e.g., "code-review", "web-scraping") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the skill does */
  description: string;
  /** Semantic version */
  version: string;
  /** Author or publisher */
  author: string;
  /** Skill category */
  category: SkillCategory;
  /** Tags for search */
  tags: string[];
  /** Capabilities this skill provides */
  capabilities: string[];
  /** Dependencies on other skills */
  dependencies: string[];
  /** Required binaries or toolchains */
  requiredBins: string[];
  /** Whether this is a featured/promoted skill */
  featured: boolean;
  /** Download/install count */
  installCount: number;
  /** Average rating (1–5) */
  averageRating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Source origin: local, remote, or built-in */
  source: "local" | "remote" | "builtin";
  /** Remote URL for download (if remote) */
  remoteUrl?: string;
  /** When the entry was added to the catalog */
  addedAtMs: number;
  /** When the entry was last updated */
  updatedAtMs: number;
}

export type SkillCategory =
  | "development"
  | "automation"
  | "ai-ml"
  | "media"
  | "security"
  | "infrastructure"
  | "data"
  | "communication"
  | "science"
  | "finance"
  | "other";

export interface SkillRating {
  skillId: string;
  userId: string;
  rating: number; // 1–5
  review?: string;
  createdAtMs: number;
}

export interface SkillInstallRecord {
  skillId: string;
  version: string;
  installedBy: string;
  installedAtMs: number;
  status: "installed" | "failed" | "uninstalled";
  error?: string;
}

export interface SkillSearchParams {
  query?: string;
  category?: SkillCategory;
  tags?: string[];
  capabilities?: string[];
  source?: "local" | "remote" | "builtin";
  featured?: boolean;
  minRating?: number;
  sortBy?: "name" | "rating" | "installs" | "newest";
  limit?: number;
  offset?: number;
}

export interface SkillSearchResult {
  skills: SkillCatalogEntry[];
  total: number;
  offset: number;
  limit: number;
}

export interface SkillMatch {
  skill: SkillCatalogEntry;
  /** How well this skill matches the requested capabilities (0–1) */
  relevance: number;
}

// ─── Constants ──────────────────────────────────────────────────

const MAX_CATALOG_ENTRIES = 500;
const MAX_RATINGS_PER_SKILL = 100;
const MAX_INSTALL_HISTORY = 200;

// ─── Registry ───────────────────────────────────────────────────

/** Main catalog: skillId → entry */
const catalog = new Map<string, SkillCatalogEntry>();
/** Ratings: skillId → array of ratings (capped per skill) */
const ratings = new Map<string, SkillRating[]>();
/** Install history (circular buffer) */
const installHistory: SkillInstallRecord[] = [];

// ─── Catalog Management ─────────────────────────────────────────

function evictOldestCatalogEntries(targetFree: number): void {
  if (catalog.size + targetFree <= MAX_CATALOG_ENTRIES) {
    return;
  }

  // Sort by addedAtMs ascending → evict oldest non-featured
  const entries = [...catalog.entries()]
    .filter(([, e]) => !e.featured)
    .toSorted(([, a], [, b]) => a.addedAtMs - b.addedAtMs);

  let toRemove = catalog.size + targetFree - MAX_CATALOG_ENTRIES;
  for (const [id] of entries) {
    if (toRemove <= 0) {
      break;
    }
    catalog.delete(id);
    ratings.delete(id); // also clean up orphaned ratings
    toRemove--;
  }
}

function registerSkill(entry: SkillCatalogEntry): void {
  if (catalog.has(entry.id)) {
    // Update existing
    const existing = catalog.get(entry.id)!;
    catalog.set(entry.id, { ...existing, ...entry, updatedAtMs: Date.now() });
    return;
  }

  // Evict if at capacity
  evictOldestCatalogEntries(1);
  catalog.set(entry.id, entry);
}

function unregisterSkill(id: string): boolean {
  ratings.delete(id);
  return catalog.delete(id);
}

function getSkill(id: string): SkillCatalogEntry | null {
  return catalog.get(id) ?? null;
}

// ─── Search ─────────────────────────────────────────────────────

function searchSkills(params: SkillSearchParams): SkillSearchResult {
  const {
    query,
    category,
    tags,
    capabilities,
    source,
    featured,
    minRating,
    sortBy = "name",
    limit = 20,
    offset = 0,
  } = params;

  let results = [...catalog.values()];

  // Filter by query (name, description, tags)
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  if (category) {
    results = results.filter((s) => s.category === category);
  }

  if (tags && tags.length > 0) {
    const tagSet = new Set(tags.map((t) => t.toLowerCase()));
    results = results.filter((s) => s.tags.some((t) => tagSet.has(t.toLowerCase())));
  }

  if (capabilities && capabilities.length > 0) {
    const capSet = new Set(capabilities.map((c) => c.toLowerCase()));
    results = results.filter((s) => s.capabilities.some((c) => capSet.has(c.toLowerCase())));
  }

  if (source) {
    results = results.filter((s) => s.source === source);
  }

  if (featured !== undefined) {
    results = results.filter((s) => s.featured === featured);
  }

  if (minRating !== undefined) {
    results = results.filter((s) => s.averageRating >= minRating);
  }

  // Sort
  switch (sortBy) {
    case "rating":
      results.sort((a, b) => b.averageRating - a.averageRating);
      break;
    case "installs":
      results.sort((a, b) => b.installCount - a.installCount);
      break;
    case "newest":
      results.sort((a, b) => b.addedAtMs - a.addedAtMs);
      break;
    case "name":
    default:
      results.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }

  const total = results.length;
  const clampedLimit = Math.min(Math.max(limit, 1), 100);
  const clampedOffset = Math.max(offset, 0);
  const paged = results.slice(clampedOffset, clampedOffset + clampedLimit);

  return { skills: paged, total, offset: clampedOffset, limit: clampedLimit };
}

// ─── Capability Matching ────────────────────────────────────────

/**
 * Find skills that match the requested capabilities, ranked by relevance.
 * Uses Jaccard similarity between requested and offered capabilities.
 */
function matchSkills(requestedCapabilities: string[], topN = 10): SkillMatch[] {
  const reqSet = new Set(requestedCapabilities.map((c) => c.toLowerCase()));
  if (reqSet.size === 0) {
    return [];
  }

  const matches: SkillMatch[] = [];

  for (const skill of catalog.values()) {
    const skillCaps = new Set(skill.capabilities.map((c) => c.toLowerCase()));
    const intersection = [...reqSet].filter((c) => skillCaps.has(c)).length;

    if (intersection === 0) {
      continue;
    }

    const union = new Set([...reqSet, ...skillCaps]).size;
    const relevance = intersection / union;

    matches.push({ skill, relevance });
  }

  matches.sort((a, b) => b.relevance - a.relevance);
  return matches.slice(0, topN);
}

// ─── Ratings ────────────────────────────────────────────────────

function addRating(rating: SkillRating): boolean {
  const skill = catalog.get(rating.skillId);
  if (!skill) {
    return false;
  }

  if (!ratings.has(rating.skillId)) {
    ratings.set(rating.skillId, []);
  }

  const skillRatings = ratings.get(rating.skillId)!;

  // Replace existing rating from same user
  const existingIdx = skillRatings.findIndex((r) => r.userId === rating.userId);
  if (existingIdx >= 0) {
    skillRatings[existingIdx] = rating;
  } else {
    // Evict oldest if at capacity
    if (skillRatings.length >= MAX_RATINGS_PER_SKILL) {
      skillRatings.sort((a, b) => a.createdAtMs - b.createdAtMs);
      skillRatings.shift();
    }
    skillRatings.push(rating);
  }

  // Recalculate average
  const total = skillRatings.reduce((sum, r) => sum + r.rating, 0);
  skill.averageRating = Math.round((total / skillRatings.length) * 100) / 100;
  skill.ratingCount = skillRatings.length;
  skill.updatedAtMs = Date.now();

  return true;
}

function getRatings(skillId: string): SkillRating[] {
  return ratings.get(skillId) ?? [];
}

// ─── Install Tracking ───────────────────────────────────────────

function recordInstall(record: SkillInstallRecord): void {
  // Evict oldest if at capacity
  if (installHistory.length >= MAX_INSTALL_HISTORY) {
    installHistory.shift();
  }
  installHistory.push(record);

  // Bump install count on the skill
  const skill = catalog.get(record.skillId);
  if (skill && record.status === "installed") {
    skill.installCount++;
    skill.updatedAtMs = Date.now();
  }
}

function getInstallHistory(params?: { skillId?: string; limit?: number }): SkillInstallRecord[] {
  let records = [...installHistory];
  if (params?.skillId) {
    records = records.filter((r) => r.skillId === params.skillId);
  }
  records.reverse(); // newest first
  if (params?.limit) {
    records = records.slice(0, params.limit);
  }
  return records;
}

// ─── Trending / Featured ────────────────────────────────────────

function getTrending(limit = 10): SkillCatalogEntry[] {
  const lastWeekMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentInstalls = installHistory.filter(
    (r) => r.installedAtMs > lastWeekMs && r.status === "installed",
  );

  // Count installs per skill in the last week
  const counts = new Map<string, number>();
  for (const r of recentInstalls) {
    counts.set(r.skillId, (counts.get(r.skillId) ?? 0) + 1);
  }

  // Sort by recent install count, then by overall rating
  return [...catalog.values()]
    .map((s) => ({ skill: s, recentCount: counts.get(s.id) ?? 0 }))
    .toSorted(
      (a, b) => b.recentCount - a.recentCount || b.skill.averageRating - a.skill.averageRating,
    )
    .slice(0, limit)
    .map(({ skill }) => skill);
}

function getFeatured(): SkillCatalogEntry[] {
  return [...catalog.values()].filter((s) => s.featured);
}

// ─── Diagnostics ────────────────────────────────────────────────

function getStats() {
  return {
    catalogSize: catalog.size,
    maxCatalog: MAX_CATALOG_ENTRIES,
    totalRatings: [...ratings.values()].reduce((sum, r) => sum + r.length, 0),
    installHistorySize: installHistory.length,
    maxInstallHistory: MAX_INSTALL_HISTORY,
    byCategory: (() => {
      const counts: Record<string, number> = {};
      for (const s of catalog.values()) {
        counts[s.category] = (counts[s.category] ?? 0) + 1;
      }
      return counts;
    })(),
    bySource: (() => {
      const counts: Record<string, number> = {};
      for (const s of catalog.values()) {
        counts[s.source] = (counts[s.source] ?? 0) + 1;
      }
      return counts;
    })(),
  };
}

// ─── Seed from Local Skills ─────────────────────────────────────

/**
 * Seed the catalog from locally installed skills.
 * Called during boot after the skills system is initialized.
 */
function seedFromLocal(
  skills: Array<{
    name: string;
    description?: string;
    tags?: string[];
    bins?: string[];
    enabled?: boolean;
  }>,
): number {
  let seeded = 0;
  for (const skill of skills) {
    if (!skill.name) {
      continue;
    }
    const id = skill.name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-");

    registerSkill({
      id,
      name: skill.name,
      description: skill.description ?? "",
      version: "1.0.0",
      author: "local",
      category: inferCategory(skill.name, skill.tags),
      tags: skill.tags ?? [],
      capabilities: skill.tags ?? [],
      dependencies: [],
      requiredBins: skill.bins ?? [],
      featured: false,
      installCount: 0,
      averageRating: 0,
      ratingCount: 0,
      source: "local",
      addedAtMs: Date.now(),
      updatedAtMs: Date.now(),
    });
    seeded++;
  }
  return seeded;
}

function inferCategory(name: string, tags?: string[]): SkillCategory {
  const lower = (name + " " + (tags ?? []).join(" ")).toLowerCase();
  if (/code|dev|debug|test|build|scaffold/.test(lower)) {
    return "development";
  }
  if (/automat|cron|workflow|pipeline/.test(lower)) {
    return "automation";
  }
  if (/ai|ml|model|llm|train|predict/.test(lower)) {
    return "ai-ml";
  }
  if (/image|video|audio|media|music/.test(lower)) {
    return "media";
  }
  if (/secur|cyber|scan|pentest|kali/.test(lower)) {
    return "security";
  }
  if (/docker|deploy|infra|cloud|cluster/.test(lower)) {
    return "infrastructure";
  }
  if (/data|scrape|csv|sql|etl/.test(lower)) {
    return "data";
  }
  if (/chat|messag|email|slack/.test(lower)) {
    return "communication";
  }
  if (/science|research|paper/.test(lower)) {
    return "science";
  }
  if (/finance|trade|forex|crypto/.test(lower)) {
    return "finance";
  }
  return "other";
}

// ─── Exported Singleton ─────────────────────────────────────────

export const skillsHub = {
  register: registerSkill,
  unregister: unregisterSkill,
  get: getSkill,
  search: searchSkills,
  match: matchSkills,
  addRating,
  getRatings,
  recordInstall,
  getInstallHistory,
  getTrending,
  getFeatured,
  getStats,
  seedFromLocal,
} as const;
