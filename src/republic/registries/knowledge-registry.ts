/**
 * knowledge-registry.ts — Dynamic Knowledge Base Registry
 *
 * Converts the static ARTICLE_SEEDS, TOOL_SEEDS, and CURRICULUM_SEEDS
 * from seed-knowledge.ts into a dynamic, searchable, UI-editable registry.
 *
 * Domain: "knowledge"
 * Categories: "article", "tool", "curriculum", "skill"
 */

import {
  registryGet,
  registryList,
  registryUpsert,
  registryRemove,
  registrySearch,
  registrySeedIfEmpty,
  REGISTRY_DOMAINS,
  type RegistryEntry,
  type RegistryListOptions,
} from "../dynamic-registry.js";

// ─── Knowledge Entry Types ──────────────────────────────────────

export interface KnowledgeArticle {
  title: string;
  domainPath: string;
  abstract: string;
  findings: string[];
  methodology: string;
  conclusions: string;
  isNovel: boolean;
  keywords?: string[];
  peerReviewScore?: number;
}

export interface KnowledgeTool {
  name: string;
  description: string;
  domain: string;
  category: string;
  parameters?: Array<{ name: string; type: string; description: string }>;
}

export interface KnowledgeCurriculum {
  domainPath: string;
  title: string;
  difficulty: number; // 0-1
  prerequisites?: string[];
  topics: string[];
}

export type KnowledgeData = KnowledgeArticle | KnowledgeTool | KnowledgeCurriculum;

const DOMAIN = REGISTRY_DOMAINS.KNOWLEDGE;

// ─── Typed Accessors ────────────────────────────────────────────

/**
 * Get a single knowledge entry by ID.
 */
export async function getKnowledgeEntry(id: string): Promise<RegistryEntry<KnowledgeData> | null> {
  return registryGet<KnowledgeData>(id, DOMAIN);
}

/**
 * List knowledge entries with filtering.
 */
export async function listKnowledgeEntries(
  opts?: Omit<RegistryListOptions, "domain"> & {
    category?: "article" | "tool" | "curriculum" | "skill";
  },
): Promise<RegistryEntry<KnowledgeData>[]> {
  return registryList<KnowledgeData>({ ...opts, domain: DOMAIN });
}

/**
 * Create or update a knowledge entry.
 */
export async function upsertKnowledgeEntry(entry: {
  id: string;
  category: "article" | "tool" | "curriculum" | "skill";
  data: KnowledgeData;
  priority?: number;
  tags?: string[];
  description?: string;
  createdBy?: string;
}): Promise<RegistryEntry<KnowledgeData>> {
  return registryUpsert<KnowledgeData>({
    id: entry.id,
    domain: DOMAIN,
    category: entry.category,
    priority: entry.priority,
    data: entry.data,
    metadata: {
      tags: entry.tags ?? extractKnowledgeTags(entry.data),
      description: entry.description ?? extractKnowledgeDescription(entry.data),
      createdBy: entry.createdBy ?? "system",
    },
  });
}

/**
 * Remove a knowledge entry.
 */
export async function removeKnowledgeEntry(id: string): Promise<boolean> {
  return registryRemove(id, DOMAIN);
}

/**
 * Search knowledge entries by text query.
 */
export async function searchKnowledge(
  query: string,
  limit = 20,
): Promise<RegistryEntry<KnowledgeData>[]> {
  return registrySearch<KnowledgeData>(query, { domain: DOMAIN, limit });
}

/**
 * List articles by domain path prefix (e.g., "Engineering.Software.React").
 */
export async function listArticlesByDomain(
  domainPath: string,
): Promise<RegistryEntry<KnowledgeArticle>[]> {
  const all = await registryList<KnowledgeArticle>({
    domain: DOMAIN,
    category: "article",
    enabled: true,
  });
  return all.filter((e) => {
    const data = e.data as KnowledgeArticle;
    return data.domainPath?.startsWith(domainPath);
  });
}

// ─── Seeding ────────────────────────────────────────────────────

/**
 * Seed the knowledge registry with built-in article data.
 * Called from the state initialization path.
 * Accepts the same format as the old ARTICLE_SEEDS array.
 */
export async function seedKnowledgeArticles(
  articles: Array<{
    title: string;
    domainPath: string;
    abstract: string;
    findings: string[];
    methodology: string;
    conclusions: string;
    isNovel: boolean;
    keywords?: string[];
    peerReviewScore?: number;
  }>,
): Promise<number> {
  const seeds = articles.map((a, i) => ({
    id: slugify(a.title),
    category: "article" as const,
    priority: i * 10,
    data: a satisfies KnowledgeArticle,
    tags: a.keywords ?? [a.domainPath],
    description: a.abstract.slice(0, 200),
  }));

  return registrySeedIfEmpty<KnowledgeArticle>(DOMAIN, seeds);
}

/**
 * Seed curriculum frontier nodes.
 */
export async function seedCurriculumNodes(
  nodes: Array<{
    domainPath: string;
    title: string;
    difficulty: number;
    prerequisites?: string[];
    topics: string[];
  }>,
): Promise<number> {
  const seeds = nodes.map((n, i) => ({
    id: `curriculum-${slugify(n.domainPath)}`,
    category: "curriculum" as const,
    priority: i * 10,
    data: n satisfies KnowledgeCurriculum,
    tags: [n.domainPath, ...n.topics.slice(0, 3)],
    description: n.title,
  }));

  return registrySeedIfEmpty<KnowledgeCurriculum>(DOMAIN, seeds);
}

// ─── Helpers ────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function extractKnowledgeTags(data: KnowledgeData): string[] {
  if ("keywords" in data && data.keywords) {
    return data.keywords;
  }
  if ("domainPath" in data) {
    return [data.domainPath];
  }
  if ("domain" in data) {
    return [data.domain];
  }
  return [];
}

function extractKnowledgeDescription(data: KnowledgeData): string {
  if ("abstract" in data) {
    return data.abstract.slice(0, 200);
  }
  if ("description" in data) {
    return data.description.slice(0, 200);
  }
  if ("title" in data) {
    return data.title;
  }
  return "";
}
