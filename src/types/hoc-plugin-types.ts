/**
 * Re-export shim for backward compatibility.
 *
 * Several plugins import from "../../src/types/hoc-plugin-types.ts".
 * The real file is at "src/republic/hoc-plugin-types.ts".
 * This shim keeps both import paths working without modifying every plugin.
 */

export type {
  HoCPluginManifest,
  HoCPluginContext,
  HoCPluginLogger,
  HoCProviderConfig,
  HoCToolDefinition,
  HoCHealthStatus,
  HoCPluginRecord,
  HoCPluginModule,
} from "../republic/hoc-plugin-types.js";

// ─── Plugin-side convenience types ──────────────────────────────
// Some plugins use these names directly (e.g. hoc-plugin-deepfacelab uses HocPlugin + PluginTool)

import type { HoCPluginContext, HoCPluginLogger } from "../republic/hoc-plugin-types.js";

/** Alias used by newer hand-coded plugins */
export type PluginContext = HoCPluginContext & {
  /** citizen ID if called from within a citizen context */
  citizenId?: string;
  /** citizen name */
  citizenName?: string;
  /** citizen specialization */
  specialization?: string;
};

export interface PluginTool {
  name: string;
  description: string;
  parameters?: Record<
    string,
    {
      type: string;
      required?: boolean;
      description?: string;
      enum?: string[];
    }
  >;
  handler: (args: Record<string, unknown>, ctx: PluginContext) => unknown;
}

export interface HocPlugin {
  id: string;
  name: string;
  init?: (ctx: PluginContext) => Promise<void> | void;
  shutdown?: () => Promise<void> | void;
  healthCheck?: () => Promise<{ healthy: boolean; details?: string }>;
  tools?: PluginTool[];
  gateway?: Record<string, (params: Record<string, unknown>, ctx?: PluginContext) => unknown>;
  events?: Record<string, (payload: unknown, ctx?: PluginContext) => unknown>;
}
