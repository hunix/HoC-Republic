/**
 * registry-seeder.ts — Dynamic Registry Seed Orchestrator
 *
 * Seeds all 4 registry domains from the existing static data sources
 * at startup. Uses `registrySeedIfEmpty` so repeated calls are harmless
 * — data is only inserted if the domain has zero entries.
 *
 * Called once from state.ts → initState() after state is available.
 */

import type { RepublicState } from "../types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { seedKnowledgeArticles, seedCurriculumNodes } from "./knowledge-registry.js";
import { seedPromptDefaults, seedBudgetMarkers } from "./prompt-registry.js";
import { seedSandboxTools } from "./tool-def-registry.js";

const logger = createSubsystemLogger("registry-seeder");

/**
 * Seed all dynamic registry domains from static source files.
 *
 * Order:
 *   1. Prompts — citizen-prompt.ts default templates + budget markers
 *   2. Sandbox Tools — sandbox-tool-defs.ts TOOLS array
 *   3. Knowledge Articles — seed-knowledge.ts ARTICLE_SEEDS
 *   4. Curriculum Nodes — seed-knowledge.ts FRONTIER_DOMAINS
 *
 * Each domain uses registrySeedIfEmpty internally, so this is safe
 * to call on every startup — existing registry data is never overwritten.
 */
export async function seedAllRegistries(_state: RepublicState): Promise<void> {
  const results = {
    prompts: 0,
    budgetMarkers: 0,
    sandboxTools: 0,
    articles: 0,
    curriculum: 0,
  };

  // ── 1. Prompt Template Defaults ────────────────────────────────
  try {
    results.prompts = await seedPromptDefaults();
    results.budgetMarkers = await seedBudgetMarkers();
    logger.info("Prompt registry seeded", {
      templates: results.prompts,
      budgetMarkers: results.budgetMarkers,
    });
  } catch (err) {
    logger.warn("Prompt registry seeding failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 2. Sandbox Tool Definitions ────────────────────────────────
  try {
    const { TOOLS } = await import("../sandbox-tool-defs.js");
    results.sandboxTools = await seedSandboxTools(TOOLS);
    logger.info("Sandbox tool registry seeded", { tools: results.sandboxTools });
  } catch (err) {
    logger.warn("Sandbox tool registry seeding failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 3. Knowledge Articles ──────────────────────────────────────
  try {
    const { ARTICLE_SEEDS } = await import("../seed-knowledge.js");
    results.articles = await seedKnowledgeArticles(ARTICLE_SEEDS);
    logger.info("Knowledge article registry seeded", { articles: results.articles });
  } catch (err) {
    logger.warn("Knowledge article registry seeding failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 4. Curriculum Frontier Nodes ───────────────────────────────
  try {
    const { FRONTIER_DOMAINS } = await import("../seed-knowledge.js");
    const nodes = FRONTIER_DOMAINS.map((fd) => ({
      domainPath: fd.path,
      title: fd.name,
      difficulty: 0.5,
      topics: [fd.name],
    }));
    results.curriculum = await seedCurriculumNodes(nodes);
    logger.info("Curriculum registry seeded", { nodes: results.curriculum });
  } catch (err) {
    logger.warn("Curriculum registry seeding failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Summary ────────────────────────────────────────────────────
  const totalSeeded =
    results.prompts +
    results.budgetMarkers +
    results.sandboxTools +
    results.articles +
    results.curriculum;

  if (totalSeeded > 0) {
    logger.info("Dynamic registries seeded from static sources", {
      total: totalSeeded,
      ...results,
    });
  } else {
    logger.info("Dynamic registries already populated — no seeding needed");
  }
}
