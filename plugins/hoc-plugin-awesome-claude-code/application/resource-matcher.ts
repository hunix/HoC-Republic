/**
 * Application — Resource Matcher
 *
 * Maps citizen specialization / activity / task context
 * to the most relevant resources in the awesome-claude-code catalog.
 */

import type { AccResource, ResourceCategory, ResourceMatch } from "../domain/types.ts";

// ─── Specialization → Keyword Maps ─────────────────────────────

/**
 * Maps citizen specializations to keywords that appear in resource descriptions.
 * This is the primary matching mechanism — a citizen with specialization "security-analyst"
 * will match resources whose descriptions mention "security", "audit", "vulnerability", etc.
 */
const SPECIALIZATION_KEYWORDS: Record<string, readonly string[]> = {
  // Engineering roles
  "software-engineer": [
    "development",
    "engineering",
    "code",
    "software",
    "fullstack",
    "full-stack",
    "plugin",
    "framework",
  ],
  "frontend-developer": [
    "frontend",
    "ui",
    "react",
    "vue",
    "css",
    "web",
    "browser",
    "html",
    "component",
  ],
  "backend-developer": [
    "backend",
    "api",
    "server",
    "database",
    "postgres",
    "node",
    "python",
    "rest",
  ],
  "devops-engineer": [
    "devops",
    "deploy",
    "ci/cd",
    "infrastructure",
    "docker",
    "kubernetes",
    "iac",
    "terraform",
    "aws",
    "cloud",
  ],
  "security-analyst": [
    "security",
    "audit",
    "vulnerability",
    "codeql",
    "semgrep",
    "exploit",
    "trail of bits",
    "penetration",
  ],
  "data-scientist": ["data", "analytics", "machine learning", "ml", "model", "dataset", "analysis"],
  "qa-engineer": [
    "test",
    "testing",
    "qa",
    "quality",
    "e2e",
    "regression",
    "validation",
    "tdd",
    "bdd",
  ],

  // Creative roles
  designer: ["design", "ui", "ux", "visual", "style", "assets", "favicon", "icon", "image"],
  writer: [
    "writing",
    "documentation",
    "book",
    "content",
    "blog",
    "publishing",
    "changelog",
    "docs",
  ],
  "project-manager": [
    "project",
    "management",
    "task",
    "jira",
    "confluence",
    "planning",
    "prd",
    "workflow",
    "agile",
  ],

  // Specialized
  researcher: ["research", "analysis", "context", "knowledge", "learning", "guide"],
  architect: ["architecture", "system", "design", "pattern", "infrastructure", "scaffolding"],
  "mobile-developer": ["mobile", "ios", "android", "kotlin", "swift", "react native"],
};

/**
 * Maps current activities to relevant resource categories and keywords.
 */
const ACTIVITY_MAPPINGS: Record<string, { categories: ResourceCategory[]; keywords: string[] }> = {
  coding: {
    categories: ["Agent Skills", "Tooling"],
    keywords: ["development", "code", "engineering", "plugin", "skill"],
  },
  debugging: {
    categories: ["Agent Skills", "Hooks", "Tooling"],
    keywords: ["debug", "fix", "issue", "error", "trace", "diagnose"],
  },
  reviewing: {
    categories: ["Agent Skills", "Hooks", "Slash-Commands"],
    keywords: ["review", "audit", "analysis", "quality", "pr", "pull request"],
  },
  deploying: {
    categories: ["Slash-Commands", "Tooling", "Hooks"],
    keywords: ["deploy", "ci", "cd", "release", "build", "production"],
  },
  planning: {
    categories: ["Workflows & Knowledge Guides", "Slash-Commands"],
    keywords: ["plan", "design", "prd", "architecture", "requirement", "spec"],
  },
  testing: {
    categories: ["Agent Skills", "Slash-Commands", "Hooks"],
    keywords: ["test", "tdd", "bdd", "e2e", "coverage", "assertion"],
  },
  documenting: {
    categories: ["Slash-Commands", "CLAUDE.md Files"],
    keywords: ["doc", "documentation", "changelog", "readme", "guide"],
  },
  researching: {
    categories: ["Workflows & Knowledge Guides", "Tooling"],
    keywords: ["research", "context", "learn", "explore", "knowledge"],
  },
  configuring: {
    categories: ["CLAUDE.md Files", "Tooling", "Hooks"],
    keywords: ["config", "settings", "setup", "environment", "hook"],
  },
  managing: {
    categories: ["Slash-Commands", "Workflows & Knowledge Guides", "Tooling"],
    keywords: ["project", "task", "manage", "workflow", "jira", "git"],
  },
};

// ─── Matching Engine ────────────────────────────────────────────

/**
 * Compute relevance score for a resource against given context.
 */
function scoreResource(
  resource: AccResource,
  specialization: string,
  activity: string,
  taskDescription?: string,
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];
  const descLower = resource.description.toLowerCase();
  const nameLower = resource.displayName.toLowerCase();

  // 1) Specialization keyword match (0..0.4)
  const specKeywords = SPECIALIZATION_KEYWORDS[specialization] ?? [];
  let specHits = 0;
  for (const kw of specKeywords) {
    if (descLower.includes(kw) || nameLower.includes(kw)) {
      specHits++;
    }
  }
  if (specKeywords.length > 0) {
    const specScore = Math.min(specHits / Math.max(specKeywords.length * 0.3, 1), 1) * 0.4;
    score += specScore;
    if (specHits > 0) {
      reasons.push(`matches ${specialization} specialization (${specHits} keywords)`);
    }
  }

  // 2) Activity category + keyword match (0..0.35)
  const actMapping = ACTIVITY_MAPPINGS[activity];
  if (actMapping) {
    // Category bonus
    if (actMapping.categories.includes(resource.category)) {
      score += 0.15;
      reasons.push(`${resource.category} relevant to ${activity}`);
    }
    // Activity keyword match
    let actHits = 0;
    for (const kw of actMapping.keywords) {
      if (descLower.includes(kw) || nameLower.includes(kw)) {
        actHits++;
      }
    }
    if (actHits > 0) {
      score += Math.min(actHits / actMapping.keywords.length, 1) * 0.2;
      reasons.push(`${actHits} activity keywords matched`);
    }
  }

  // 3) Task description keyword overlap (0..0.25)
  if (taskDescription) {
    const taskWords = taskDescription
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    let taskHits = 0;
    for (const word of taskWords) {
      if (descLower.includes(word) || nameLower.includes(word)) {
        taskHits++;
      }
    }
    if (taskWords.length > 0 && taskHits > 0) {
      score += Math.min(taskHits / Math.max(taskWords.length * 0.3, 1), 1) * 0.25;
      reasons.push(`${taskHits} task keywords matched`);
    }
  }

  return { score: Math.min(score, 1), reason: reasons.join("; ") || "general relevance" };
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Find the most relevant resources for a citizen's context.
 * Returns top matches sorted by relevance score.
 */
export function matchResources(
  catalog: readonly AccResource[],
  specialization: string,
  activity: string,
  taskDescription?: string,
  maxResults = 8,
): ResourceMatch[] {
  const activeResources = catalog.filter((r) => r.active);

  const scored = activeResources.map((resource) => {
    const { score, reason } = scoreResource(resource, specialization, activity, taskDescription);
    return { resource, relevanceScore: score, reason } as ResourceMatch;
  });

  return scored
    .filter((m) => m.relevanceScore > 0.1)
    .toSorted((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);
}

/**
 * Search resources by freetext query across name + description.
 */
export function searchResources(catalog: readonly AccResource[], query: string): AccResource[] {
  const terms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);
  if (terms.length === 0) {
    return [];
  }

  return catalog
    .filter((r) => {
      const text = `${r.displayName} ${r.description} ${r.category} ${r.authorName}`.toLowerCase();
      return terms.some((t) => text.includes(t));
    })
    .slice(0, 20);
}

/**
 * Get resources by category.
 */
export function getByCategory(
  catalog: readonly AccResource[],
  category: ResourceCategory,
): AccResource[] {
  return catalog.filter((r) => r.category === category && r.active);
}
