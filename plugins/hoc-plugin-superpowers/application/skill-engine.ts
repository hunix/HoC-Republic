/**
 * Superpowers Plugin — Application: Skill Matcher & Prompt Enhancer
 *
 * This is the brain of the plugin. It matches citizen tasks/activities
 * to the most relevant Superpowers skills and generates prompt
 * injections that give citizens structured cognitive methodologies.
 *
 * Innovation: citizens don't just get raw instructions — they get
 * curated, prioritized cognitive frameworks that match their current
 * task, specialization, and project state.
 */

import type { SkillMatch, SuperpowersSkill } from "../domain/types.ts";

// ─── Task → Skill Matcher ───────────────────────────────────────

/**
 * Trigger patterns that map citizen activities/tasks to skills.
 * Each pattern has:
 *   - keywords: activity/task tokens that suggest this skill
 *   - specializations: citizen specializations that benefit most
 *   - activities: direct activity name matches
 *   - baseConfidence: minimum confidence when pattern matches
 */
const SKILL_TRIGGERS: Record<
  string,
  {
    keywords: string[];
    specializations: string[];
    activities: string[];
    baseConfidence: number;
  }
> = {
  brainstorming: {
    keywords: [
      "design",
      "idea",
      "propose",
      "plan",
      "concept",
      "create",
      "build",
      "architecture",
      "spec",
      "requirements",
    ],
    specializations: ["Architect", "Strategist", "Planner", "Engineer", "Developer"],
    activities: ["ideating", "planning", "proposing", "creating_project", "brainstorming"],
    baseConfidence: 0.85,
  },
  "test-driven-development": {
    keywords: [
      "test",
      "tdd",
      "unit test",
      "coverage",
      "red-green",
      "refactor",
      "jest",
      "vitest",
      "mocha",
    ],
    specializations: ["Developer", "Engineer", "Scientist", "Mathematician"],
    activities: ["coding", "testing", "developing", "building", "implementing"],
    baseConfidence: 0.9,
  },
  "systematic-debugging": {
    keywords: [
      "bug",
      "debug",
      "error",
      "fix",
      "crash",
      "broken",
      "failing",
      "exception",
      "stack trace",
      "root cause",
    ],
    specializations: ["Developer", "Engineer", "Analyst", "Scientist"],
    activities: ["debugging", "fixing", "investigating", "troubleshooting"],
    baseConfidence: 0.95,
  },
  "writing-plans": {
    keywords: [
      "plan",
      "implementation",
      "task list",
      "breakdown",
      "milestone",
      "roadmap",
      "sprint",
    ],
    specializations: ["Planner", "Architect", "Strategist", "Engineer"],
    activities: ["planning", "organizing", "scoping", "estimating"],
    baseConfidence: 0.8,
  },
  "executing-plans": {
    keywords: ["execute", "implement", "build", "batch", "checkpoint", "progress"],
    specializations: ["Developer", "Engineer", "Manufacturer"],
    activities: ["building", "implementing", "executing", "working"],
    baseConfidence: 0.75,
  },
  "subagent-driven-development": {
    keywords: ["subagent", "parallel", "dispatch", "concurrent", "delegation", "multi-agent"],
    specializations: ["Architect", "Strategist", "Developer"],
    activities: ["delegating", "orchestrating", "managing"],
    baseConfidence: 0.8,
  },
  "dispatching-parallel-agents": {
    keywords: ["parallel", "concurrent", "dispatch", "fan-out", "multi-task", "batch"],
    specializations: ["Architect", "Strategist", "Planner"],
    activities: ["delegating", "distributing", "orchestrating"],
    baseConfidence: 0.75,
  },
  "requesting-code-review": {
    keywords: ["review", "pr", "pull request", "feedback", "quality", "audit"],
    specializations: ["Developer", "Engineer", "Architect"],
    activities: ["reviewing", "submitting", "finalizing"],
    baseConfidence: 0.85,
  },
  "receiving-code-review": {
    keywords: ["feedback", "revision", "address", "respond", "fix review"],
    specializations: ["Developer", "Engineer"],
    activities: ["revising", "addressing_feedback", "improving"],
    baseConfidence: 0.8,
  },
  "using-git-worktrees": {
    keywords: ["worktree", "branch", "isolated", "parallel development", "git"],
    specializations: ["Developer", "Engineer"],
    activities: ["branching", "isolating", "developing"],
    baseConfidence: 0.7,
  },
  "finishing-a-development-branch": {
    keywords: ["merge", "pr", "finish", "complete", "ship", "deploy", "release"],
    specializations: ["Developer", "Engineer"],
    activities: ["merging", "releasing", "shipping", "completing"],
    baseConfidence: 0.75,
  },
  "verification-before-completion": {
    keywords: ["verify", "validate", "confirm", "check", "ensure", "prove", "qa"],
    specializations: ["Developer", "Engineer", "Scientist", "Analyst"],
    activities: ["verifying", "validating", "testing", "checking"],
    baseConfidence: 0.85,
  },
};

/**
 * Match a citizen's current context to the most relevant Superpowers skills.
 *
 * Returns up to `maxResults` matches sorted by confidence (highest first).
 *
 * Matching algorithm:
 * 1. Keyword overlap with activity/task description → base confidence
 * 2. Specialization alignment → +0.1 boost
 * 3. Direct activity name match → +0.15 boost
 * 4. Multiple keyword hits → scale up confidence
 */
export function matchSkillsToTask(
  skills: SuperpowersSkill[],
  context: {
    activity: string;
    specialization: string;
    taskDescription?: string;
    projectType?: string;
  },
  maxResults = 3,
): SkillMatch[] {
  const matches: SkillMatch[] = [];
  const activityLower = context.activity.toLowerCase();
  const specLower = context.specialization.toLowerCase();
  const taskLower = (context.taskDescription ?? "").toLowerCase();
  const combinedText = `${activityLower} ${taskLower}`.trim();

  for (const skill of skills) {
    const trigger = SKILL_TRIGGERS[skill.id];
    if (!trigger) {
      continue;
    }

    let confidence = 0;
    const reasons: string[] = [];

    // 1. Keyword matching
    const keywordHits = trigger.keywords.filter((kw) => combinedText.includes(kw));
    if (keywordHits.length > 0) {
      const keywordRatio = keywordHits.length / trigger.keywords.length;
      confidence = trigger.baseConfidence * (0.5 + 0.5 * keywordRatio);
      reasons.push(`Keywords: ${keywordHits.join(", ")}`);
    }

    // 2. Direct activity match
    if (trigger.activities.some((a) => activityLower.includes(a))) {
      confidence = Math.max(confidence, trigger.baseConfidence);
      confidence += 0.05;
      reasons.push(`Activity match: ${context.activity}`);
    }

    // 3. Specialization alignment
    if (trigger.specializations.some((s) => s.toLowerCase() === specLower)) {
      confidence += 0.05;
      reasons.push(`Specialization aligned: ${context.specialization}`);
    }

    // 4. Skill description keyword match (fuzzy)
    const descWords = skill.description.toLowerCase().split(/\s+/);
    const descHits = descWords.filter((w) => combinedText.includes(w) && w.length > 3);
    if (descHits.length > 2) {
      confidence += 0.05;
    }

    // Clamp to [0, 1]
    confidence = Math.min(1.0, Math.max(0, confidence));

    if (confidence > 0.3) {
      matches.push({
        skill,
        confidence,
        reason: reasons.join("; ") || "General relevance",
      });
    }
  }

  return matches.toSorted((a, b) => b.confidence - a.confidence).slice(0, maxResults);
}

// ─── Prompt Enhancer ────────────────────────────────────────────

/**
 * Build a cognitive methodology prompt injection for a citizen.
 *
 * This generates a concise, focused prompt section that teaches the
 * citizen the matched skill's workflow. It extracts:
 * - The checklist (if present)
 * - Key process steps
 * - Anti-patterns to avoid
 * - Key principles
 *
 * Token budget: keeps the injection under ~500 tokens to avoid
 * overwhelming the system prompt.
 */
export function buildSkillInjection(matches: SkillMatch[]): string {
  if (matches.length === 0) {
    return "";
  }

  const sections: string[] = [];
  sections.push("## 🧠 Cognitive Methodologies (Superpowers)");
  sections.push("You have access to structured workflows for your current task.");
  sections.push("Follow these methodologies — they are mandatory, not suggestions.");
  sections.push("");

  for (const match of matches.slice(0, 2)) {
    const { skill, confidence } = match;

    sections.push(`### ${skill.name} (${(confidence * 100).toFixed(0)}% match)`);

    // Extract the checklist section (bounded content extraction)
    const checklist = extractSection(skill.content, "Checklist");
    if (checklist) {
      sections.push("**Action Items:**");
      sections.push(truncateToLines(checklist, 8));
      sections.push("");
    }

    // Extract key principles
    const principles = extractSection(skill.content, "Key Principles");
    if (principles) {
      sections.push("**Principles:**");
      sections.push(truncateToLines(principles, 5));
      sections.push("");
    }

    // Extract anti-patterns
    const antiPatterns = extractSection(skill.content, "Anti-Pattern");
    if (antiPatterns) {
      sections.push("**Avoid:**");
      sections.push(truncateToLines(antiPatterns, 3));
      sections.push("");
    }

    // If no structured sections found, extract the overview
    if (!checklist && !principles && !antiPatterns) {
      const overview =
        extractSection(skill.content, "Overview") || extractSection(skill.content, "The Rule");
      if (overview) {
        sections.push(truncateToLines(overview, 6));
        sections.push("");
      }
    }
  }

  return sections.join("\n");
}

/**
 * Build a skill summary prompt injection — lighter weight than full injection.
 * Used when token budget is tight but we still want methodology awareness.
 */
export function buildSkillSummary(matches: SkillMatch[]): string {
  if (matches.length === 0) {
    return "";
  }

  const lines: string[] = ["## Active Methodologies"];
  for (const m of matches.slice(0, 3)) {
    lines.push(`- **${m.skill.name}**: ${m.skill.description || m.reason}`);
  }
  return lines.join("\n");
}

// ─── Content Extraction Helpers ─────────────────────────────────

/**
 * Extract a section from markdown content by header name.
 * Looks for `## Header` or `### Header` and returns content until the next header.
 */
function extractSection(content: string, headerName: string): string | null {
  const lines = content.split("\n");
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    // Match header at any level
    const headerMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headerMatch) {
      if (capturing) {
        break; // Hit next section
      }
      if (headerMatch[1].toLowerCase().includes(headerName.toLowerCase())) {
        capturing = true;
        continue;
      }
    }
    if (capturing) {
      result.push(line);
    }
  }

  const text = result.join("\n").trim();
  return text.length > 0 ? text : null;
}

/**
 * Truncate text to a maximum number of non-empty lines.
 */
function truncateToLines(text: string, maxLines: number): string {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length <= maxLines) {
    return lines.join("\n");
  }
  return lines.slice(0, maxLines).join("\n") + `\n  ... (${lines.length - maxLines} more)`;
}
