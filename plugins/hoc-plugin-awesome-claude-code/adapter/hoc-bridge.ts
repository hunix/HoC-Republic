/**
 * Adapter — HoC Bridge
 *
 * Bridges the awesome-claude-code catalog into HoC's Republic system.
 * Manages the global catalog cache and exposes the prompt injection API
 * that citizen-prompt.ts consumes.
 */

import { composePromptSection } from "../application/prompt-composer.ts";
import {
    getByCategory, matchResources,
    searchResources as searchResourcesEngine
} from "../application/resource-matcher.ts";
import type {
    AccResource, CatalogStatus, ResourceCategory,
    ResourceMatch
} from "../domain/types.ts";
import { getSourceUrl } from "../infrastructure/catalog-loader.ts";

// ─── Global Catalog Cache ───────────────────────────────────────

let catalogCache: AccResource[] = [];
let lastLoadedAt = 0;

// ─── Initialization ─────────────────────────────────────────────

export function initAdapter(resources: AccResource[]): void {
  catalogCache = [...resources];
  lastLoadedAt = Date.now();
}

export function refreshCache(resources: AccResource[]): void {
  catalogCache = [...resources];
  lastLoadedAt = Date.now();
}

// ─── Prompt Injection (consumed by citizen-prompt.ts) ───────────

/**
 * Get the prompt injection string for a citizen based on context.
 * This is the primary export for citizen-prompt.ts integration.
 *
 * @param specialization - The citizen's specialization (e.g. "devops-engineer")
 * @param activity - Current activity (e.g. "deploying")
 * @param taskDescription - Optional task description for additional context
 */
export function getAccPromptInjection(
  specialization?: string,
  activity?: string,
  taskDescription?: string,
): string {
  if (catalogCache.length === 0) {
    return "";
  }

  const spec = specialization || "software-engineer";
  const act = activity || "coding";

  const matches = matchResources(catalogCache, spec, act, taskDescription, 5);
  if (matches.length === 0) {
    return "";
  }

  return composePromptSection(matches, 5);
}

// ─── Resource Access (for tools / gateway) ──────────────────────

export function getAllResources(): AccResource[] {
  return [...catalogCache];
}

export function getResourceById(id: string): AccResource | null {
  return catalogCache.find((r) => r.id === id) ?? null;
}

export function getResourcesByCategory(category: ResourceCategory): AccResource[] {
  return getByCategory(catalogCache, category);
}

export function searchResources(query: string): AccResource[] {
  return searchResourcesEngine(catalogCache, query);
}

export function getMatchedResources(
  specialization: string,
  activity: string,
  taskDescription?: string,
): ResourceMatch[] {
  return matchResources(catalogCache, specialization, activity, taskDescription);
}

export function getCatalogStatus(): CatalogStatus {
  const byCategory = new Map<ResourceCategory, number>();
  let activeCount = 0;

  for (const r of catalogCache) {
    if (r.active) {
      activeCount++;
    }
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  }

  return {
    totalResources: catalogCache.length,
    activeResources: activeCount,
    byCategory,
    lastLoadedAt,
    sourceUrl: getSourceUrl(),
  };
}
