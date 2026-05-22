/**
 * Application — Prompt Composer
 *
 * Generates UI/UX Pro Max capability descriptions for
 * injection into citizen system prompts.
 * Active for designer and frontend specializations.
 */

import type { DesignDomain } from "../domain/types.ts";
import { DESIGN_DOMAINS, DOMAIN_DESCRIPTIONS, SUPPORTED_STACKS } from "../domain/types.ts";
import { getQueueStatus } from "./design-advisor.ts";

const DESIGNER_SPECIALIZATIONS = new Set([
  "designer",
  "frontend",
  "ui-developer",
  "ux-designer",
  "creative-director",
  "web-developer",
  "fullstack",
  "mobile-developer",
  "product-designer",
  "visual-designer",
  "content-creator",
  "artist",
]);

export function composeDesignPrompt(specialization?: string): string {
  if (!specialization) {
    return "";
  }
  if (!DESIGNER_SPECIALIZATIONS.has(specialization.toLowerCase())) {
    return "";
  }

  const q = getQueueStatus();

  const domainList = DESIGN_DOMAINS.map(
    (d: DesignDomain) => `  • \`${d}\` — ${DOMAIN_DESCRIPTIONS[d]}`,
  ).join("\n");

  const stackList = SUPPORTED_STACKS.join(", ");

  const lines: string[] = [
    "## Design Intelligence Tools (UI/UX Pro Max)",
    "",
    "You have access to an AI design intelligence engine with industry-specific knowledge.",
    "",
    "### Search Domains",
    domainList,
    "",
    "### Key Tools",
    "  • `uiux_design_system` — Generate a complete design system (colors, typography, patterns, anti-patterns)",
    "  • `uiux_search_styles` — Find matching UI styles for a project type",
    "  • `uiux_search_colors` — Get industry-specific color palettes",
    "  • `uiux_search_fonts` — Find curated font pairings with Google Fonts imports",
    "  • `uiux_search_charts` — Get chart recommendations for dashboards",
    "  • `uiux_ux_guidelines` — Look up UX best practices and anti-patterns",
    "  • `uiux_persist_system` — Save design system to MASTER.md for cross-session use",
    "",
    "### Supported Stacks",
    `  ${stackList}`,
    "",
    "### Usage",
    `  Completed: ${q.completed} | Failed: ${q.failed}`,
    "",
    "### Tips",
    "  • Describe the project type naturally: 'fintech banking app', 'beauty spa landing page'",
    "  • Use domain-specific search for targeted results (e.g., domain=color for palettes only)",
    "  • Specify a tech stack for framework-specific guidelines",
  ];

  return lines.join("\n");
}
