/**
 * Superpowers Plugin — Adapter: HoC Integration Bridge
 *
 * Bridges the pure Superpowers skill engine into HoC's Republic system:
 * - Exports a prompt enhancer function that citizen-prompt.ts can call
 * - Provides a global skill registry accessible from any HoC module
 * - Manages the skill cache for fast lookup during tick processing
 */

import {
    buildSkillInjection,
    buildSkillSummary, matchSkillsToTask
} from "../application/skill-engine.ts";
import type {
    SkillCategory, SkillLibraryStatus, SkillMatch, SuperpowersSkill
} from "../domain/types.ts";

// ─── Global Skill Registry ──────────────────────────────────────

/** Cached skills loaded from disk */
let skillCache: SuperpowersSkill[] = [];
let repoPath: string | null = null;
let lastCacheTime = 0;

/**
 * Initialize the adapter with loaded skills.
 */
export function initAdapter(skills: SuperpowersSkill[], repo: string): void {
  skillCache = skills;
  repoPath = repo;
  lastCacheTime = Date.now();
}

/**
 * Get all loaded skills.
 */
export function getAllSkills(): SuperpowersSkill[] {
  return skillCache;
}

/**
 * Get a specific skill by ID.
 */
export function getSkillById(id: string): SuperpowersSkill | undefined {
  return skillCache.find((s) => s.id === id);
}

/**
 * Refresh the skill cache.
 */
export function refreshCache(skills: SuperpowersSkill[]): void {
  skillCache = skills;
  lastCacheTime = Date.now();
}

// ─── Citizen Prompt Integration ─────────────────────────────────

/**
 * Generate a Superpowers methodology injection for a citizen.
 *
 * This is the main export used by citizen-prompt.ts.
 * Call this from buildSystemPrompt() to give citizens access
 * to structured cognitive workflows.
 *
 * @param activity - The citizen's current activity
 * @param specialization - The citizen's specialization
 * @param taskDescription - Optional description of what they're working on
 * @param compact - If true, returns a summary instead of full injection
 * @returns A prompt section string to append to the system prompt
 */
export function getSuperpowersPromptInjection(
  activity: string,
  specialization: string,
  taskDescription?: string,
  compact = false,
): string {
  if (skillCache.length === 0) {
    return "";
  }

  const matches = matchSkillsToTask(skillCache, {
    activity,
    specialization,
    taskDescription,
  });

  if (matches.length === 0) {
    return "";
  }

  return compact ? buildSkillSummary(matches) : buildSkillInjection(matches);
}

/**
 * Get skill matches for a citizen context (for tools/gateway).
 */
export function getSkillMatches(
  activity: string,
  specialization: string,
  taskDescription?: string,
): SkillMatch[] {
  if (skillCache.length === 0) {
    return [];
  }

  return matchSkillsToTask(skillCache, {
    activity,
    specialization,
    taskDescription,
  });
}

/**
 * Get the status of the Superpowers skill library.
 */
export function getLibraryStatus(): SkillLibraryStatus {
  const categories: Record<SkillCategory, number> = {
    testing: 0,
    debugging: 0,
    collaboration: 0,
    meta: 0,
    workflow: 0,
  };

  for (const skill of skillCache) {
    categories[skill.category]++;
  }

  return {
    installed: repoPath !== null && skillCache.length > 0,
    repoPath,
    skillCount: skillCache.length,
    lastUpdated: lastCacheTime || null,
    version: null, // Set by the entry point after checking git
    categories,
  };
}
