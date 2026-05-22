/**
 * UI/UX Pro Max Plugin — Entry Point
 *
 * Registers 7 tools and 6 gateway RPC methods to expose
 * design intelligence capabilities to HoC citizens.
 *
 * Capabilities:
 *   • Design system generation (67 styles, 96 palettes, 57 fonts)
 *   • Domain-specific search (style, color, typography, chart, UX)
 *   • Industry reasoning rules (100 categories)
 *   • Persistent design systems (MASTER.md + page overrides)
 */

import type { HocPlugin, PluginContext, PluginTool } from "../../src/types/hoc-plugin-types.ts";
import {
  initBridge,
  submitDesignSystem,
  submitSearch,
  submitPersist,
  getDesignJobStatus,
  getDesignQueueStatus,
  getAvailableDomains,
  getAvailableStacks,
  getConfig,
  getDesignPromptInjection,
} from "./adapter/hoc-bridge.ts";

// ─── Tools ──────────────────────────────────────────────────────

const tools: PluginTool[] = [
  {
    name: "uiux_design_system",
    description:
      "Generate a complete design system for a project. Describe the project naturally (e.g., 'fintech banking app', 'beauty spa landing page'). Returns pattern, colors, typography, effects, anti-patterns, and a pre-delivery checklist.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Project description (e.g., 'healthcare analytics dashboard')",
      },
      projectName: {
        type: "string",
        required: false,
        description: "Project name for the generated design system",
      },
      format: {
        type: "string",
        required: false,
        description: "Output format: 'markdown' (default) or 'ascii'",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitDesignSystem(
        ctx.citizenId ?? "system",
        args.query as string,
        args.projectName as string | undefined,
        (args.format as "markdown" | "ascii" | undefined) ?? "markdown",
      );
      return { jobId: job.id, status: job.status, query: job.query };
    },
  },
  {
    name: "uiux_search_styles",
    description:
      "Search 67 UI styles (Glassmorphism, Neumorphism, Brutalism, Bento Grid, Dark Mode, Claymorphism, etc.) best matching a project type.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Style query (e.g., 'modern SaaS', 'luxury branding')",
      },
      stack: {
        type: "string",
        required: false,
        description: "Tech stack for framework-specific guidance",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitSearch(
        ctx.citizenId ?? "system",
        args.query as string,
        "style",
        args.stack as string | undefined as undefined,
      );
      return { jobId: job.id, status: job.status };
    },
  },
  {
    name: "uiux_search_colors",
    description:
      "Search 96 industry-specific color palettes (SaaS, E-commerce, Healthcare, Fintech, Beauty, etc.).",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Color query (e.g., 'calming wellness', 'professional banking')",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitSearch(ctx.citizenId ?? "system", args.query as string, "color");
      return { jobId: job.id, status: job.status };
    },
  },
  {
    name: "uiux_search_fonts",
    description:
      "Search 57 curated font pairings with mood descriptions and Google Fonts import URLs.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Typography query (e.g., 'elegant serif', 'modern sans')",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitSearch(ctx.citizenId ?? "system", args.query as string, "typography");
      return { jobId: job.id, status: job.status };
    },
  },
  {
    name: "uiux_search_charts",
    description:
      "Get chart type recommendations for dashboards and analytics. Searches 25 chart types.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Chart query (e.g., 'financial data', 'user analytics')",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitSearch(ctx.citizenId ?? "system", args.query as string, "chart");
      return { jobId: job.id, status: job.status };
    },
  },
  {
    name: "uiux_ux_guidelines",
    description:
      "Look up UX best practices, accessibility rules, and anti-patterns from 99 curated guidelines.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "UX topic (e.g., 'form validation', 'responsive layout', 'accessibility')",
      },
      stack: {
        type: "string",
        required: false,
        description: "Tech stack for framework-specific advice",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitSearch(
        ctx.citizenId ?? "system",
        args.query as string,
        "ux",
        args.stack as string | undefined as undefined,
      );
      return { jobId: job.id, status: job.status };
    },
  },
  {
    name: "uiux_persist_system",
    description:
      "Save a generated design system to design-system/MASTER.md for cross-session retrieval. Optionally create page-specific overrides.",
    parameters: {
      query: {
        type: "string",
        required: true,
        description: "Project description for design system",
      },
      projectName: { type: "string", required: true, description: "Project name" },
      page: {
        type: "string",
        required: false,
        description: "Page name for a page-specific override file (e.g., 'dashboard', 'checkout')",
      },
    },
    handler: async (args: Record<string, unknown>, ctx: PluginContext) => {
      const job = submitPersist(
        ctx.citizenId ?? "system",
        args.query as string,
        args.projectName as string,
        args.page as string | undefined,
      );
      return { jobId: job.id, status: job.status };
    },
  },
];

// ─── Plugin Definition ──────────────────────────────────────────

const plugin: HocPlugin = {
  id: "hoc-plugin-uiux-promax",
  name: "UI/UX Pro Max — Design Intelligence Engine",

  init: async (ctx: PluginContext) => {
    const status = initBridge(ctx.dataDir);
    if (status.installed) {
      const cloneMsg = status.autoCloned ? " (auto-cloned from GitHub)" : "";
      ctx.log(
        `UI/UX Pro Max ready${cloneMsg} — ${status.dataFilesFound.length} CSV databases loaded`,
      );
    } else {
      ctx.log(`UI/UX Pro Max not available: ${status.errors.join("; ")}`);
    }
  },

  shutdown: async () => {
    // No persistent processes to clean up
  },

  healthCheck: async () => {
    const q = getDesignQueueStatus();
    return {
      healthy: q.installed,
      details: `${q.completedJobs} designs generated`,
    };
  },

  tools,

  gateway: {
    "uiux.designSystem": async (params: Record<string, unknown>, ctx: PluginContext) => {
      return submitDesignSystem(
        ctx.citizenId ?? "system",
        params.query as string,
        params.projectName as string | undefined,
        (params.format as "markdown" | undefined) ?? "markdown",
      );
    },

    "uiux.search": async (params: Record<string, unknown>, ctx: PluginContext) => {
      return submitSearch(
        ctx.citizenId ?? "system",
        params.query as string,
        (params.domain as string | undefined as undefined) ?? "style",
        params.stack as string | undefined as undefined,
      );
    },

    "uiux.persist": async (params: Record<string, unknown>, ctx: PluginContext) => {
      return submitPersist(
        ctx.citizenId ?? "system",
        params.query as string,
        params.projectName as string,
        params.page as string | undefined,
      );
    },

    "uiux.stacks": async () => {
      return { stacks: getAvailableStacks(), domains: getAvailableDomains() };
    },

    "uiux.status": async (params: Record<string, unknown>) => {
      return getDesignJobStatus(params.jobId as string) ?? { error: "not found" };
    },

    "uiux.config": async () => {
      const c = getConfig();
      return {
        installPath: c.installPath,
        dataDir: c.dataDir,
        timeoutMs: c.timeoutMs,
      };
    },
  },

  events: {
    "citizen:task_assigned": async (_payload: unknown, ctx: PluginContext) => {
      const injection = getDesignPromptInjection(ctx.specialization);
      if (injection) {
        ctx.log(`[UIUX] Injected design intelligence for citizen ${ctx.citizenId}`);
      }
    },
  },
};

export default plugin;
