/**
 * HoC Awesome Claude Code Plugin — Entry Point
 *
 * Integrates hesreallyhim/awesome-claude-code curated catalog of 100+
 * agentic resources into the Republic citizen intelligence layer.
 *
 * On init:
 * 1. Fetches THE_RESOURCES_TABLE.csv (or loads snapshot)
 * 2. Parses into searchable catalog
 * 3. Registers tools & gateway methods
 * 4. Subscribes to events for dynamic resource injection
 *
 * DDD Structure:
 *   domain/         — Pure types (resources, matches, status)
 *   application/    — Resource matcher & prompt composer
 *   infrastructure/ — CSV fetcher, parser, snapshot manager
 *   adapter/        — HoC integration bridge
 */

import type {
  HoCPluginContext,
  HoCPluginModule,
  HoCHealthStatus,
} from "../../src/republic/hoc-plugin-types.ts";
import type { ResourceCategory } from "./domain/types.ts";
import {
  initAdapter,
  getAllResources,
  getResourceById,
  getResourcesByCategory,
  searchResources,
  getMatchedResources,
  getCatalogStatus,
  refreshCache,
} from "./adapter/hoc-bridge.ts";
import { summarizeResource } from "./application/prompt-composer.ts";
import { loadCatalog, refreshCatalog } from "./infrastructure/catalog-loader.ts";

// ─── Plugin State ───────────────────────────────────────────────

let ctx: HoCPluginContext | null = null;
let initialized = false;
let resourceCount = 0;

// ─── Lifecycle ──────────────────────────────────────────────────

export async function init(pluginCtx: HoCPluginContext): Promise<void> {
  ctx = pluginCtx;
  ctx.logger.info("Awesome Claude Code plugin initializing...");

  // Step 1: Load the catalog
  try {
    ctx.logger.info("Loading awesome-claude-code resource catalog...");
    const resources = loadCatalog(pluginCtx.dataDir);
    resourceCount = resources.length;
    initAdapter(resources);
    ctx.logger.info(`Loaded ${resourceCount} resources from catalog`);

    // Log category breakdown
    const byCategory = new Map<string, number>();
    for (const r of resources) {
      byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
    }
    for (const [cat, count] of byCategory) {
      ctx.logger.info(`  ${cat}: ${count} resource(s)`);
    }
  } catch (err) {
    ctx.logger.warn(`Catalog load failed: ${err instanceof Error ? err.message : String(err)}`);
    ctx.logger.info("Awesome Claude Code will run in degraded mode (no resources loaded).");
    initialized = true;
    return;
  }

  // Step 2: Register tools
  ctx.registerTools([
    {
      name: "acc_list_resources",
      description:
        "List all resources in the awesome-claude-code catalog, optionally filtered by category",
      parameters: {
        category: {
          type: "string",
          description: "Optional category filter (e.g. 'Agent Skills', 'Tooling', 'Hooks')",
        },
      },
      handler: async (params) => {
        const category = params.category as string | undefined;
        const resources = category
          ? getResourcesByCategory(category as ResourceCategory)
          : getAllResources();
        return resources.map((r) => ({
          id: r.id,
          name: r.displayName,
          category: r.category,
          subCategory: r.subCategory,
          author: r.authorName,
          link: r.primaryLink,
        }));
      },
    },
    {
      name: "acc_search",
      description: "Search the awesome-claude-code catalog by freetext query",
      parameters: {
        query: {
          type: "string",
          description: "Search query (matches against name, description, author)",
        },
      },
      handler: async (params) => {
        const query = params.query as string;
        if (!query) {
          return { error: "Query parameter required" };
        }
        const results = searchResources(query);
        return results.map((r) => ({
          id: r.id,
          name: r.displayName,
          category: r.category,
          author: r.authorName,
          description: r.description.substring(0, 200),
          link: r.primaryLink,
        }));
      },
    },
    {
      name: "acc_get_resource",
      description: "Get full details of a specific resource by ID",
      parameters: {
        resourceId: { type: "string", description: "Resource ID (e.g. 'skill-294cc93f')" },
      },
      handler: async (params) => {
        const id = params.resourceId as string;
        const resource = getResourceById(id);
        if (!resource) {
          return { error: `Resource not found: ${id}` };
        }
        return {
          id: resource.id,
          name: resource.displayName,
          category: resource.category,
          subCategory: resource.subCategory,
          author: resource.authorName,
          authorLink: resource.authorLink,
          description: resource.description,
          primaryLink: resource.primaryLink,
          secondaryLink: resource.secondaryLink,
          license: resource.license,
          version: resource.releaseVersion,
          active: resource.active,
        };
      },
    },
    {
      name: "acc_match_resources",
      description: "Match catalog resources to a citizen's specialization and current activity",
      parameters: {
        specialization: {
          type: "string",
          description: "Citizen specialization (e.g. 'devops-engineer')",
        },
        activity: { type: "string", description: "Current activity (e.g. 'deploying')" },
        taskDescription: { type: "string", description: "Optional task description for context" },
      },
      handler: async (params) => {
        const matches = getMatchedResources(
          params.specialization as string,
          params.activity as string,
          params.taskDescription as string | undefined,
        );
        return matches.map((m) => summarizeResource(m));
      },
    },
    {
      name: "acc_refresh",
      description: "Refresh the resource catalog from GitHub",
      handler: async () => {
        if (!ctx) {
          return { error: "Plugin not initialized" };
        }
        try {
          const result = refreshCatalog(ctx.dataDir);
          if (result.updated) {
            const resources = loadCatalog(ctx.dataDir);
            resourceCount = resources.length;
            refreshCache(resources);
          }
          return { ...result, resourceCount };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    },
  ]);

  // Step 3: Register gateway RPC methods
  // The plugin manager stores handlers as `unknown` internally (hoc-plugin-manager.ts:49).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registerGw = ctx.registerGateway as (method: string, handler: unknown) => void;

  registerGw("acc.listResources", async () => {
    const resources = getAllResources();
    return {
      resources: resources.map((r) => ({
        id: r.id,
        name: r.displayName,
        category: r.category,
        author: r.authorName,
      })),
    };
  });

  registerGw("acc.search", async () => {
    return { message: "Use acc_search tool with query parameter" };
  });

  registerGw("acc.byCategory", async () => {
    const status = getCatalogStatus();
    const categories: Record<string, number> = {};
    for (const [cat, count] of status.byCategory) {
      categories[cat] = count;
    }
    return { categories };
  });

  registerGw("acc.status", async () => {
    const status = getCatalogStatus();
    const categories: Record<string, number> = {};
    for (const [cat, count] of status.byCategory) {
      categories[cat] = count;
    }
    return {
      totalResources: status.totalResources,
      activeResources: status.activeResources,
      categories,
      lastLoadedAt: status.lastLoadedAt,
      sourceUrl: status.sourceUrl,
    };
  });

  registerGw("acc.refresh", async () => {
    if (!ctx) {
      return { error: "Plugin not initialized" };
    }
    try {
      const result = refreshCatalog(ctx.dataDir);
      if (result.updated) {
        const resources = loadCatalog(ctx.dataDir);
        resourceCount = resources.length;
        refreshCache(resources);
      }
      return { ...result, resourceCount };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Step 4: Subscribe to events
  ctx.on("tick:before", () => {
    // Resources are injected via the prompt builder integration
    // This hook is for future enhancements (usage tracking, etc.)
  });

  ctx.on("citizen:task_assigned", (data) => {
    const d = data as { citizenName?: string; task?: string };
    if (d.citizenName && d.task) {
      ctx?.logger.debug?.(`Task assigned to ${d.citizenName}: ${d.task}`);
    }
  });

  initialized = true;
  ctx.logger.info(`Awesome Claude Code plugin ready! ${resourceCount} resources loaded.`);
}

export async function shutdown(): Promise<void> {
  ctx?.logger.info("Awesome Claude Code plugin shutting down.");
  initialized = false;
  ctx = null;
}

export async function healthCheck(): Promise<HoCHealthStatus> {
  return {
    healthy: initialized,
    message: initialized
      ? `${resourceCount} resources loaded from awesome-claude-code catalog`
      : "Not initialized",
    details: {
      resourceCount,
      catalogLoaded: resourceCount > 0,
    },
  };
}

const awesomeClaudeCodePlugin: HoCPluginModule = { init, shutdown, healthCheck };
export default awesomeClaudeCodePlugin;
