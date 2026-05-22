/**
 * Superpowers Plugin — Domain Types
 *
 * Pure value objects representing skills, skill metadata,
 * and matching results. No I/O dependencies.
 */

/** A parsed Superpowers skill */
export interface SuperpowersSkill {
  /** Skill identifier (e.g. "brainstorming", "test-driven-development") */
  id: string;
  /** Human-readable name from YAML frontmatter */
  name: string;
  /** Description/trigger condition from YAML frontmatter */
  description: string;
  /** The full SKILL.md content (sans frontmatter) */
  content: string;
  /** Skill directory path on disk */
  dirPath: string;
  /** Companion files in the skill directory */
  companionFiles: string[];
  /** Category derived from skill content analysis */
  category: SkillCategory;
}

export type SkillCategory = "testing" | "debugging" | "collaboration" | "meta" | "workflow";

/** A match result from the task-to-skill matcher */
export interface SkillMatch {
  skill: SuperpowersSkill;
  /** Match confidence 0.0–1.0 */
  confidence: number;
  /** Why this skill was matched */
  reason: string;
}

/** Skill library status */
export interface SkillLibraryStatus {
  installed: boolean;
  repoPath: string | null;
  skillCount: number;
  lastUpdated: number | null;
  version: string | null;
  categories: Record<SkillCategory, number>;
}
