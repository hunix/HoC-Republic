/**
 * Plugin Pipeline Orchestrator (Phase 6)
 *
 * Enables multi-plugin pipelines where each stage can run on a different
 * cluster node, with the output of one stage flowing as input to the next.
 *
 * Example pipeline:
 *   1. whisper  → transcribe video    (CPU node)
 *   2. facefusion → enhance faces     (GPU node, needs VRAM)
 *   3. bark     → generate voice-over (GPU node)
 *   4. ffmpeg   → mux audio + video   (CPU node)
 *
 * Each stage is a tool call that receives:
 *   - Its own args (from the pipeline definition)
 *   - The result of the previous stage(s) injected via {{stageN}} placeholders
 */

import { createSubsystemLogger } from "../logging.js";
import { busCallTool, busHasTool } from "./plugin-bus.js";

const logger = createSubsystemLogger("republic:pipeline");

// ─── Types ───────────────────────────────────────────────────────

export interface PipelineStage {
  /** Unique name for this stage (used in template references) */
  name: string;
  /** Plugin tool name to invoke */
  toolName: string;
  /** Arguments to pass to the tool. Use {{stageN}} or {{stageName}} to reference previous outputs */
  args: Record<string, unknown>;
  /** Optional: only run if this condition is met (receives previous stage outputs) */
  condition?: (previousResults: Map<string, unknown>) => boolean;
  /** Optional: timeout override for this specific stage (ms) */
  timeoutMs?: number;
  /** Optional: retry count for this stage (default: 0 = no retry) */
  retries?: number;
}

export interface PipelineResult {
  /** Whether all stages completed successfully */
  success: boolean;
  /** Results from each stage, keyed by stage name */
  stageResults: Map<string, unknown>;
  /** Errors from failed stages */
  errors: Array<{ stage: string; error: string }>;
  /** Total pipeline duration (ms) */
  durationMs: number;
  /** Per-stage durations (ms) */
  stageDurations: Map<string, number>;
}

export interface PipelineOptions {
  /** If true, pipeline stops at the first failed stage. Default: true */
  stopOnError?: boolean;
  /** Global timeout for the entire pipeline (ms). Default: no limit */
  timeoutMs?: number;
  /** Callback invoked when each stage starts */
  onStageStart?: (stageName: string, stageIndex: number) => void;
  /** Callback invoked when each stage completes */
  onStageComplete?: (stageName: string, stageIndex: number, result: unknown) => void;
  /** Callback invoked when a stage fails */
  onStageError?: (stageName: string, stageIndex: number, error: string) => void;
}

// ─── Template Substitution ──────────────────────────────────────

/**
 * Recursively substitute {{stageN}} and {{stageName}} references in args
 * with actual results from previous stages.
 */
function substituteTemplates(
  args: Record<string, unknown>,
  stageResults: Map<string, unknown>,
  stageNames: string[],
): Record<string, unknown> {
  const substituted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string") {
      substituted[key] = substituteString(value, stageResults, stageNames);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      substituted[key] = substituteTemplates(
        value as Record<string, unknown>,
        stageResults,
        stageNames,
      );
    } else if (Array.isArray(value)) {
      substituted[key] = value.map((item) => {
        if (typeof item === "string") {
          return substituteString(item, stageResults, stageNames);
        }
        if (item && typeof item === "object") {
          return substituteTemplates(item as Record<string, unknown>, stageResults, stageNames);
        }
        return item;
      });
    } else {
      substituted[key] = value;
    }
  }

  return substituted;
}

function substituteString(
  template: string,
  stageResults: Map<string, unknown>,
  stageNames: string[],
): unknown {
  // Exact match: "{{stage0}}" or "{{stageName}}" → return the raw result object
  const exactMatch = template.match(/^\{\{(stage\d+|[a-zA-Z_][\w-]*)\}\}$/);
  if (exactMatch) {
    const ref = exactMatch[1];
    if (ref.startsWith("stage")) {
      const idx = parseInt(ref.slice(5), 10);
      if (idx < stageNames.length) {
        return stageResults.get(stageNames[idx]);
      }
    }
    return stageResults.get(ref) ?? template;
  }

  // "{{all}}" → merge all previous results into one object
  if (template === "{{all}}") {
    const merged: Record<string, unknown> = {};
    for (const [name, result] of stageResults) {
      merged[name] = result;
    }
    return merged;
  }

  // Partial match: "prefix {{stage0}} suffix" → stringify embedded values
  return template.replace(/\{\{(stage\d+|[a-zA-Z_][\w-]*)\}\}/g, (_, ref: string) => {
    if (ref.startsWith("stage")) {
      const idx = parseInt(ref.slice(5), 10);
      if (idx < stageNames.length) {
        const val = stageResults.get(stageNames[idx]);
        return typeof val === "string" ? val : JSON.stringify(val);
      }
    }
    const val = stageResults.get(ref);
    if (val === undefined) {
      return `{{${ref}}}`;
    }
    return typeof val === "string" ? val : JSON.stringify(val);
  });
}

// ─── Pipeline Execution ─────────────────────────────────────────

/**
 * Run a sequential pipeline of tool calls, where each stage can reference
 * the output of previous stages.
 *
 * Stages execute in order. Each stage's result is stored and can be
 * referenced by subsequent stages via {{stageN}} or {{stageName}} templates.
 */
export async function runPipeline(
  stages: PipelineStage[],
  opts: PipelineOptions = {},
): Promise<PipelineResult> {
  const stopOnError = opts.stopOnError ?? true;
  const stageResults = new Map<string, unknown>();
  const stageDurations = new Map<string, number>();
  const errors: Array<{ stage: string; error: string }> = [];
  const stageNames = stages.map((s) => s.name);
  const pipelineStart = Date.now();

  logger.info(`Pipeline starting with ${stages.length} stages`, {
    stages: stageNames,
  });

  // Optional global timeout
  let globalTimeout: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  if (opts.timeoutMs) {
    globalTimeout = setTimeout(() => {
      timedOut = true;
    }, opts.timeoutMs);
  }

  try {
    for (let i = 0; i < stages.length; i++) {
      if (timedOut) {
        const msg = `Pipeline timed out at stage ${i} (${stages[i].name})`;
        logger.error(msg);
        errors.push({ stage: stages[i].name, error: msg });
        break;
      }

      const stage = stages[i];
      const stageName = stage.name;

      // Check condition
      if (stage.condition && !stage.condition(stageResults)) {
        logger.info(`Pipeline stage "${stageName}" skipped (condition not met)`);
        stageResults.set(stageName, undefined);
        continue;
      }

      // Check tool exists
      if (!busHasTool(stage.toolName)) {
        const msg = `Tool "${stage.toolName}" not available for pipeline stage "${stageName}"`;
        logger.error(msg);
        errors.push({ stage: stageName, error: msg });
        if (stopOnError) {
          break;
        }
        continue;
      }

      opts.onStageStart?.(stageName, i);

      // Substitute templates in args
      const resolvedArgs = substituteTemplates(stage.args, stageResults, stageNames);

      // Execute with retries
      const maxAttempts = (stage.retries ?? 0) + 1;
      let lastError: string | undefined;
      let stageResult: unknown;

      const stageStart = Date.now();

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          stageResult = await busCallTool(stage.toolName, resolvedArgs);
          lastError = undefined;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < maxAttempts) {
            logger.warn(
              `Pipeline stage "${stageName}" attempt ${attempt}/${maxAttempts} failed: ${lastError}`,
            );
            // Brief backoff between retries
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }
        }
      }

      const stageDuration = Date.now() - stageStart;
      stageDurations.set(stageName, stageDuration);

      if (lastError) {
        logger.error(
          `Pipeline stage "${stageName}" failed after ${maxAttempts} attempts: ${lastError}`,
        );
        errors.push({ stage: stageName, error: lastError });
        opts.onStageError?.(stageName, i, lastError);
        if (stopOnError) {
          break;
        }
      } else {
        stageResults.set(stageName, stageResult);
        opts.onStageComplete?.(stageName, i, stageResult);
        logger.info(`Pipeline stage "${stageName}" completed in ${stageDuration}ms`);
      }
    }
  } finally {
    if (globalTimeout) {
      clearTimeout(globalTimeout);
    }
  }

  const totalDuration = Date.now() - pipelineStart;
  const success = errors.length === 0;

  logger.info(`Pipeline ${success ? "completed" : "failed"} in ${totalDuration}ms`, {
    stages: stageNames,
    succeeded: stages.length - errors.length,
    failed: errors.length,
  });

  return {
    success,
    stageResults,
    errors,
    durationMs: totalDuration,
    stageDurations,
  };
}

/**
 * Convenience: build a pipeline from a simple array of
 * { pluginTool, input } entries.
 */
export function buildLinearPipeline(
  steps: Array<{
    name: string;
    toolName: string;
    args?: Record<string, unknown>;
  }>,
): PipelineStage[] {
  return steps.map((step, idx) => ({
    name: step.name,
    toolName: step.toolName,
    args: {
      // Auto-wire: each stage receives the previous stage's output as "input"
      input: idx > 0 ? `{{stage${idx - 1}}}` : undefined,
      ...step.args,
    },
  }));
}
