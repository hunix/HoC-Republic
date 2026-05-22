/**
 * Republic Platform — Automation Dispatch Layer
 *
 * Phase 40: Unified dispatch layer that bridges high-level citizen intents
 * to the correct low-level automation subsystem.
 *
 * Subsystems:
 *   - real-execution.ts  → code/project tool execution (write_code, run_tests, etc.)
 *   - browser-agent.ts   → browser tab automation (navigate, click, type, scrape)
 *   - screen-queue.ts    → physical screen/keyboard/mouse access queue
 *   - citizen-n8n.ts     → n8n workflow orchestration
 *
 * Dispatch flow:
 *   1. Citizen goal milestone triggers a toolAction string
 *   2. automationDispatch maps toolAction → subsystem
 *   3. Subsystem executes the action (real or simulated)
 *   4. Result is returned to advance the citizen's goal
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { createBrowserTask, stepNavigate, stepScreenshot } from "./browser-agent.js";
import { advanceGoal } from "./citizen-agency.js";
import type { ExecutionContext, ExecutionResult } from "./real-execution.js";
import { executeToolAction } from "./real-execution.js";
import { releaseScreen, requestScreenAccess } from "./screen-queue.js";
import { getTool } from "./tool-executor.js";
import type { Citizen, RepublicState } from "./types.js";
import { ts } from "./utils.js";

const logger = createSubsystemLogger("republic:automation-dispatch");

// ─── Intent Categories ──────────────────────────────────────────

/** High-level intent categories that map tool actions to subsystems */
export type AutomationCategory =
  | "code"        // real-execution: write_code, debug_code, run_tests, etc.
  | "browser"     // browser-agent: navigate, click, type, scrape
  | "desktop"     // screen-queue: keyboard, mouse, window management
  | "workflow"    // citizen-n8n: multi-step orchestration
  | "research"    // LLM-powered research (real-execution)
  | "creative";   // content/art generation (real-execution)

/** Maps toolAction strings to their automation category */
const ACTION_CATEGORY_MAP: Record<string, AutomationCategory> = {
  // Code tools
  write_code: "code",
  create_file: "code",
  debug_code: "code",
  code_review: "code",
  run_tests: "code",
  lint_code: "code",
  write_test: "code",
  scaffold_project: "code",
  deploy_app: "code",
  git_commit: "code",
  write_schema: "code",
  // Browser tools
  browse_web: "browser",
  navigate: "browser",
  click: "browser",
  type_text: "browser",
  screenshot: "browser",
  scrape: "browser",
  // Desktop tools
  control_desktop: "desktop",
  move_mouse: "desktop",
  press_key: "desktop",
  window_manage: "desktop",
  // Workflow tools
  automate_workflow: "workflow",
  run_workflow: "workflow",
  trigger_n8n: "workflow",
  // Research tools
  research_topic: "research",
  investigate: "research",
  // Creative tools
  create_art: "creative",
  compose_music: "creative",
  generate_content: "creative",
};

// ─── Dispatch Result ────────────────────────────────────────────

export interface DispatchResult {
  ok: boolean;
  category: AutomationCategory;
  toolAction: string;
  citizenId: string;
  output: string;
  error?: string;
  durationMs: number;
  timestamp: string;
}

// ─── Dispatch History ───────────────────────────────────────────

const dispatchHistory: DispatchResult[] = [];
const MAX_DISPATCH_HISTORY = 300;

function recordDispatch(result: DispatchResult): void {
  dispatchHistory.push(result);
  if (dispatchHistory.length > MAX_DISPATCH_HISTORY) {
    dispatchHistory.splice(0, dispatchHistory.length - MAX_DISPATCH_HISTORY);
  }
}

// ─── Main Dispatch ──────────────────────────────────────────────

/**
 * Dispatch an automation action for a citizen.
 *
 * This is the unified entry point that routes to the correct subsystem
 * based on the toolAction string. After execution, it advances the
 * citizen's goal if applicable.
 */
export async function automationDispatch(
  s: RepublicState,
  citizen: Citizen,
  toolAction: string,
  args: Record<string, unknown> = {},
): Promise<DispatchResult> {
  const start = Date.now();
  const category = ACTION_CATEGORY_MAP[toolAction] ?? inferCategory(toolAction);

  logger.info(`[dispatch] citizen=${citizen.name} action=${toolAction} category=${category}`);

  let output = "";
  let error: string | undefined;
  let ok = false;

  try {
    switch (category) {
      case "code":
      case "research":
      case "creative": {
        // Route through real-execution
        const ctx: ExecutionContext = {
          citizenId: citizen.id,
          citizenName: citizen.name,
          specialization: citizen.specialization,
          skillLevel: citizen.skills?.length ?? 1,
          projectId: (args.projectId as string) ?? "default",
          mode: s.mode,
        };
        const result: ExecutionResult = await executeToolAction(toolAction, args, ctx);
        ok = result.status === "success";
        output = result.output;
        error = result.error;
        break;
      }

      case "browser": {
        // Route through browser-agent
        const url = (args.url as string) ?? "";
        const objective = (args.objective as string) ?? `Browse: ${toolAction}`;
        const task = createBrowserTask(
          citizen.id,
          citizen.name,
          objective,
          "general",
          [
            ...(url ? [stepNavigate(url)] : []),
            stepScreenshot(`Result of ${toolAction}`),
          ],
        );
        ok = task.status === "queued";
        output = ok ? `Browser task ${task.id} created: ${objective}` : "Failed to create browser task";
        break;
      }

      case "desktop": {
        // Route through screen-queue
        const description = (args.description as string) ?? `Desktop: ${toolAction}`;
        try {
          const slot = await requestScreenAccess(
            citizen.id,
            citizen.name,
            "other",
            description,
            "normal",
            10_000,
          );
          ok = true;
          output = `Screen access granted: slot ${slot.id}`;
          // Auto-release after a short delay to not block the queue
          setTimeout(() => releaseScreen(slot.id), 5000);
        } catch (err) {
          ok = false;
          error = err instanceof Error ? err.message : String(err);
          output = `Screen access denied: ${error}`;
        }
        break;
      }

      case "workflow": {
        // Workflow actions are routed through n8n or simulated
        output = `Workflow action '${toolAction}' queued for citizen ${citizen.name}`;
        ok = true;
        break;
      }

      default: {
        output = `Unknown automation category for action: ${toolAction}`;
        ok = false;
        error = output;
      }
    }
  } catch (err) {
    ok = false;
    error = err instanceof Error ? err.message : String(err);
    output = `Dispatch error: ${error}`;
  }

  // Advance the citizen's goal milestone
  if (ok) {
    advanceGoal(citizen.id, toolAction);
  }

  const result: DispatchResult = {
    ok,
    category,
    toolAction,
    citizenId: citizen.id,
    output,
    error,
    durationMs: Date.now() - start,
    timestamp: ts(),
  };

  recordDispatch(result);
  return result;
}

// ─── Category Inference ─────────────────────────────────────────

/** Infer the category from a toolAction string that isn't in the map */
function inferCategory(toolAction: string): AutomationCategory {
  if (toolAction.includes("browse") || toolAction.includes("web") || toolAction.includes("navigate")) {
    return "browser";
  }
  if (toolAction.includes("desktop") || toolAction.includes("mouse") || toolAction.includes("key")) {
    return "desktop";
  }
  if (toolAction.includes("workflow") || toolAction.includes("n8n") || toolAction.includes("automate")) {
    return "workflow";
  }
  if (toolAction.includes("research") || toolAction.includes("investigate") || toolAction.includes("analyze")) {
    return "research";
  }
  if (toolAction.includes("art") || toolAction.includes("music") || toolAction.includes("content")) {
    return "creative";
  }

  // Phase 11: Dynamic fallback — if it's a known tool in the global registry (e.g., auto-registered from a plugin), route to code execution
  if (getTool(toolAction)) {
    return "code";
  }

  // Default to code — the most common action
  return "code";
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface DispatchDiagnostics {
  totalDispatches: number;
  successRate: number;
  byCategory: Record<string, number>;
  averageDurationMs: number;
  recentErrors: string[];
}

export function getDispatchDiagnostics(): DispatchDiagnostics {
  const total = dispatchHistory.length || 1;
  const successes = dispatchHistory.filter((d) => d.ok).length;
  const byCategory: Record<string, number> = {};
  let totalDuration = 0;

  for (const d of dispatchHistory) {
    byCategory[d.category] = (byCategory[d.category] ?? 0) + 1;
    totalDuration += d.durationMs;
  }

  const recentErrors = dispatchHistory
    .filter((d) => !d.ok && d.error)
    .slice(-5)
    .map((d) => `${d.toolAction}: ${d.error}`);

  return {
    totalDispatches: dispatchHistory.length,
    successRate: successes / total,
    byCategory,
    averageDurationMs: Math.round(totalDuration / total),
    recentErrors,
  };
}

/** Get recent dispatch history */
export function getDispatchHistory(limit = 20): DispatchResult[] {
  return dispatchHistory.slice(-limit);
}
