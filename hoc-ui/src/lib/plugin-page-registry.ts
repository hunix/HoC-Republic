/**
 * Plugin → Page Registry
 *
 * Centralized mapping that declares which plugins power which pages.
 * Used by PluginBadge and the sidebar to show plugin context inline.
 *
 * Add entries here when:
 *  1. A page depends on a plugin for its core functionality
 *  2. A studio page wraps one or more plugins
 */

export interface PluginPageEntry {
  /** The page route (as shown in sidebar / used by router) */
  route: string;
  /** Human-readable page title */
  pageTitle: string;
  /** Plugin IDs this page depends on */
  pluginIds: string[];
  /** Optional: studio route to link from PluginBadge */
  studioPath?: string;
}

/**
 * Master registry — sorted by page route for easy lookup.
 *
 * Categories:
 *   /plugins/video    → Video generation plugins
 *   /plugins/audio    → Audio/TTS plugins
 *   /plugins/image    → Image generation plugins
 *   /plugins/avatar   → Face/avatar plugins
 *   /plugins/dev      → Developer tools
 *   /plugins/music    → Music generation
 *   /plugins/security → Security/pentest tools
 *   /plugins/ops      → Infrastructure/ops
 *   /plugins/agents   → AI agent frameworks
 */
export const PLUGIN_PAGE_REGISTRY: PluginPageEntry[] = [
  // ── Video Studio ──────────────────────────────────────────
  {
    route: "/plugins/video",
    pageTitle: "Video Studio",
    pluginIds: [
      "hoc-plugin-deforum",
      "hoc-plugin-lingbot-world",
      "hoc-plugin-easyvolcap",
      "hoc-plugin-sparc3d",
      "hoc-plugin-cogvideox",
      "hoc-plugin-hunyuan-video",
      "hoc-plugin-ltx-video",
      "hoc-plugin-skyreels",
      "hoc-plugin-wan-video",
    ],
  },

  // ── Audio Studio ──────────────────────────────────────────
  {
    route: "/plugins/audio",
    pageTitle: "Audio Studio",
    pluginIds: [
      "hoc-plugin-bark",
      "hoc-plugin-chatterbox",
      "hoc-plugin-qwen3-tts",
      "hoc-plugin-mmaudio",
    ],
  },

  // ── Image Studio ──────────────────────────────────────────
  {
    route: "/plugins/image",
    pageTitle: "Image Studio",
    pluginIds: [
      "hoc-plugin-omnigen",
      "hoc-plugin-glm-image",
      "hoc-plugin-switti",
      "hoc-plugin-kv-edit",
      "hoc-plugin-storydiffusion",
    ],
  },

  // ── Avatar Studio ─────────────────────────────────────────
  {
    route: "/plugins/avatar",
    pageTitle: "Avatar Studio",
    pluginIds: [
      "hoc-plugin-deepfacelab",
      "hoc-plugin-facefusion",
      "hoc-plugin-dgm",
      "hoc-plugin-stable-avatar",
      "hoc-plugin-magicanimate",
    ],
  },

  // ── Music Studio ──────────────────────────────────────────
  {
    route: "/plugins/music",
    pageTitle: "Music Studio",
    pluginIds: ["hoc-plugin-funmusic"],
  },

  // ── Dev Studio ────────────────────────────────────────────
  {
    route: "/plugins/dev",
    pageTitle: "Dev Studio",
    pluginIds: [
      "hoc-plugin-open-lovable",
      "hoc-plugin-uiux-promax",
      "hoc-plugin-awesome-claude-code",
      "hoc-plugin-superpowers",
    ],
  },

  // ── Agent Studio ──────────────────────────────────────────
  {
    route: "/plugins/agents",
    pageTitle: "Agent Studio",
    pluginIds: [
      "hoc-plugin-a2a",
      "hoc-plugin-autogpt",
      "hoc-plugin-magentic-one",
      "hoc-plugin-openmanus-rl",
      "hoc-plugin-ai-scientist",
      "hoc-plugin-agenthub",
    ],
  },

  // ── Security Studio ───────────────────────────────────────
  {
    route: "/plugins/security",
    pageTitle: "Security Studio",
    pluginIds: ["hoc-plugin-blackeye", "hoc-plugin-pentagi"],
  },

  // ── Ops Studio ────────────────────────────────────────────
  {
    route: "/plugins/ops",
    pageTitle: "Ops Studio",
    pluginIds: ["hoc-plugin-paperclip", "hoc-plugin-echo"],
  },
];

// ─── Lookup Helpers ──────────────────────────────────────────────

/** Get plugin IDs for a given page route */
export function getPluginsForRoute(route: string): string[] {
  const entry = PLUGIN_PAGE_REGISTRY.find((e) => e.route === route);
  return entry?.pluginIds ?? [];
}

/** Get the page route(s) where a plugin appears */
export function getRoutesForPlugin(pluginId: string): string[] {
  return PLUGIN_PAGE_REGISTRY.filter((e) => e.pluginIds.includes(pluginId)).map((e) => e.route);
}

/** Get the full entry for a route */
export function getPageEntry(route: string): PluginPageEntry | undefined {
  return PLUGIN_PAGE_REGISTRY.find((e) => e.route === route);
}
