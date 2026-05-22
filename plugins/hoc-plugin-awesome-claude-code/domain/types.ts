/**
 * Domain Types — Awesome Claude Code Resource Catalog
 *
 * Pure value objects with no external dependencies.
 * Represents the curated catalog of agentic resources.
 */

// ─── Resource Categories ────────────────────────────────────────

export type ResourceCategory =
  | "Agent Skills"
  | "Workflows & Knowledge Guides"
  | "Tooling"
  | "Status Lines"
  | "Hooks"
  | "Slash-Commands"
  | "CLAUDE.md Files"
  | "Alternative Clients"
  | "Official Documentation"
  | "unknown";

export type ResourceSubCategory =
  | "General"
  | "Ralph Wiggum"
  | "IDE Integrations"
  | "Usage Monitors"
  | "Orchestrators"
  | "Config Managers"
  | "Version Control & Git"
  | "Code Analysis & Testing"
  | "Context Loading & Priming"
  | "Documentation & Changelogs"
  | "CI / Deployment"
  | "Project & Task Management"
  | "Miscellaneous"
  | "Language-Specific"
  | "Domain-Specific"
  | "Project Scaffolding & MCP";

// ─── Core Resource Type ─────────────────────────────────────────

export interface AccResource {
  readonly id: string;
  readonly displayName: string;
  readonly category: ResourceCategory;
  readonly subCategory: ResourceSubCategory;
  readonly primaryLink: string;
  readonly secondaryLink: string;
  readonly authorName: string;
  readonly authorLink: string;
  readonly active: boolean;
  readonly description: string;
  readonly license: string;
  readonly releaseVersion: string;
  readonly repoCreated: string;
  readonly latestRelease: string;
}

// ─── Match Result ───────────────────────────────────────────────

export interface ResourceMatch {
  readonly resource: AccResource;
  readonly relevanceScore: number; // 0..1
  readonly reason: string;
}

// ─── Catalog Status ─────────────────────────────────────────────

export interface CatalogStatus {
  readonly totalResources: number;
  readonly activeResources: number;
  readonly byCategory: ReadonlyMap<ResourceCategory, number>;
  readonly lastLoadedAt: number; // epoch ms
  readonly sourceUrl: string;
}
