/**
 * Application — Prompt Composer
 *
 * Transforms matched resources into concise, token-efficient prompt text
 * for injection into citizen system prompts.
 */

import type { ResourceCategory, ResourceMatch } from "../domain/types.ts";

// ─── Category Emojis ────────────────────────────────────────────

const CATEGORY_EMOJI: Record<ResourceCategory, string> = {
  "Agent Skills": "🤖",
  "Workflows & Knowledge Guides": "🧠",
  Tooling: "🧰",
  "Status Lines": "📊",
  Hooks: "🪝",
  "Slash-Commands": "🔪",
  "CLAUDE.md Files": "📂",
  "Alternative Clients": "📱",
  "Official Documentation": "🏛️",
  unknown: "❓",
};

// ─── Category Usage Hints ───────────────────────────────────────

const CATEGORY_USAGE: Record<ResourceCategory, string> = {
  "Agent Skills": "Install as .claude/skills/ to gain specialized capabilities",
  "Workflows & Knowledge Guides": "Follow as structured methodology for your current task",
  Tooling: "External tool that extends agent capabilities — install/configure separately",
  "Status Lines": "Terminal status line integration — enhances development visibility",
  Hooks: "Hook into agent lifecycle events (pre/post tool use, etc.)",
  "Slash-Commands": "Use as /command in Claude Code for quick, focused actions",
  "CLAUDE.md Files": "Add to project root as CLAUDE.md for project-specific guidance",
  "Alternative Clients": "Alternative interface for Claude Code — install separately",
  "Official Documentation": "Reference documentation from Anthropic",
  unknown: "Community resource",
};

// ─── Prompt Composition ─────────────────────────────────────────

/**
 * Compose a prompt injection section from matched resources.
 * Keeps token count low: max 5 resources, concise descriptions.
 */
export function composePromptSection(matches: ResourceMatch[], maxResources = 5): string {
  if (matches.length === 0) {
    return "";
  }

  const top = matches.slice(0, maxResources);

  // Group by category
  const grouped = new Map<ResourceCategory, ResourceMatch[]>();
  for (const m of top) {
    const cat = m.resource.category;
    if (!grouped.has(cat)) {
      grouped.set(cat, []);
    }
    grouped.get(cat)!.push(m);
  }

  const lines: string[] = [
    "## Agentic Toolkit Recommendations",
    "Community-built tools that match your current specialization and task:",
    "",
  ];

  for (const [category, categoryMatches] of grouped) {
    const emoji = CATEGORY_EMOJI[category] || "•";
    const usage = CATEGORY_USAGE[category] || "";
    lines.push(`### ${emoji} ${category}`);
    if (usage) {
      lines.push(`_${usage}_`);
    }
    lines.push("");

    for (const m of categoryMatches) {
      const r = m.resource;
      const version = r.releaseVersion ? ` (${r.releaseVersion})` : "";
      const by = r.authorName ? ` by ${r.authorName}` : "";
      // Truncate description to ~120 chars for token efficiency
      const desc =
        r.description.length > 120 ? r.description.substring(0, 117) + "..." : r.description;
      lines.push(`- **${r.displayName}**${version}${by}`);
      lines.push(`  ${desc}`);
      lines.push(`  Link: ${r.primaryLink}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Create a compact resource summary for tool responses.
 */
export function summarizeResource(match: ResourceMatch): Record<string, unknown> {
  const r = match.resource;
  return {
    id: r.id,
    name: r.displayName,
    category: r.category,
    subCategory: r.subCategory,
    author: r.authorName,
    description: r.description,
    link: r.primaryLink,
    version: r.releaseVersion || null,
    license: r.license,
    relevance: Math.round(match.relevanceScore * 100),
    reason: match.reason,
  };
}
