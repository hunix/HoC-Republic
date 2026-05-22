/**
 * Sandbox Tools — Barrel Index
 *
 * All tool handler modules are registered here and merged into
 * a single handler map for O(1) dispatch by sandbox-agent-loop.ts.
 *
 * 16 domain modules, ~113 handlers total.
 * Legacy switch only handles LLM provider aliases (ollama, deepseek, etc.)
 * which delegate to ai_inference with a provider param.
 */

export type {
  ToolInput,
  ToolHandler,
  ToolSummaryFn,
  ToolHandlerMap,
  ToolSummaryMap,
  SandboxContext,
} from "./types.js";

import type { SandboxContext, ToolHandlerMap, ToolSummaryMap } from "./types.js";
import { createAiToolsHandlers, aiToolsSummary } from "./ai-tools.js";
import { createAuditToolsHandlers, auditToolsSummary } from "./audit-tools.js";
import { createAutomationToolsHandlers, automationToolsSummary } from "./automation-tools.js";
import { createBuildToolsHandlers, buildToolsSummary } from "./build-tools.js";
import { createCodeToolsHandlers, codeToolsSummary } from "./code-tools.js";
import {
  createCommunicationToolsHandlers,
  communicationToolsSummary,
} from "./communication-tools.js";
import { createDesignToolsHandlers, designToolsSummary } from "./design-tools.js";
import { createDevopsToolsHandlers, devopsToolsSummary } from "./devops-tools.js";
import { createDocumentToolsHandlers, documentToolsSummary } from "./document-tools.js";
import { createExtendedToolsHandlers, extendedToolsSummary } from "./extended-tools.js";
import { createIntegrationToolsHandlers, integrationToolsSummary } from "./integration-tools.js";
import { createIntelligenceToolsHandlers, intelligenceToolsSummary } from "./intelligence-tools.js";
import { createPlatformToolsHandlers, platformToolsSummary } from "./platform-tools.js";
import { createSandboxCoreHandlers, sandboxCoreSummary } from "./sandbox-core.js";
import { createSupabaseToolsHandlers, supabaseToolsSummary } from "./supabase-tools.js";
import { createWebToolHandlers, webToolSummary } from "./web-tools.js";

/**
 * Create all tool handlers — call once with the sandbox context,
 * then use the returned map for O(1) tool dispatch.
 */
export function createAllHandlers(ctx: SandboxContext): ToolHandlerMap {
  return {
    ...createSandboxCoreHandlers(ctx),
    ...createWebToolHandlers(ctx),
    ...createDocumentToolsHandlers(ctx),
    ...createCommunicationToolsHandlers(ctx),
    ...createDevopsToolsHandlers(ctx),
    ...createAiToolsHandlers(ctx),
    ...createBuildToolsHandlers(ctx),
    ...createCodeToolsHandlers(ctx),
    ...createSupabaseToolsHandlers(ctx),
    ...createDesignToolsHandlers(ctx),
    ...createPlatformToolsHandlers(ctx),
    ...createAuditToolsHandlers(ctx),
    ...createIntegrationToolsHandlers(ctx),
    ...createAutomationToolsHandlers(ctx),
    ...createIntelligenceToolsHandlers(ctx),
    ...createExtendedToolsHandlers(ctx),
  };
}

/** Merge all summary formatters into a single map */
export const allSummaries: ToolSummaryMap = {
  ...sandboxCoreSummary,
  ...webToolSummary,
  ...documentToolsSummary,
  ...communicationToolsSummary,
  ...devopsToolsSummary,
  ...aiToolsSummary,
  ...buildToolsSummary,
  ...codeToolsSummary,
  ...supabaseToolsSummary,
  ...designToolsSummary,
  ...platformToolsSummary,
  ...auditToolsSummary,
  ...integrationToolsSummary,
  ...automationToolsSummary,
  ...intelligenceToolsSummary,
  ...extendedToolsSummary,
};
