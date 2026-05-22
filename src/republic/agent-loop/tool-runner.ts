/**
 * Tool Runner — per-tool timeout, transient retry, caching, loop detection, and parallel execution.
 *
 * Provides a factory function that creates a `executeOneToolWithRetry` bound to
 * the current agent loop's state (broadcaster, cache, loop session, etc.).
 */

import type { AgentBroadcaster } from "../agent-providers/index.js";
import type { ToolInput } from "../sandbox-tool-defs.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  detectToolCallLoop,
  recordToolCall,
  recordToolCallOutcome,
  type ToolLoopSession,
} from "../openclaw/tool-loop-detection.js";
import { formatToolSummary, maybeBrowserObserve, autoRagIngest } from "./helpers.js";
import { executeTool } from "./tool-executor.js";

const logger = createSubsystemLogger("sandbox-agent");

// ─── Per-Tool Timeout Map ───────────────────────────────────────

export const TOOL_TIMEOUTS: Record<string, number> = {
  bash_exec: 120_000,
  create_document: 90_000,
  web_search: 30_000,
  deerflow_research: 120_000,
  claude_code: 300_000,
  web_app_bridge: 120_000,
  supabase_project: 60_000,
  default: 60_000,
};

// ─── Cacheable Read-Only Tools ──────────────────────────────────

export const CACHEABLE_TOOLS = new Set([
  "read_file",
  "sandbox_read_file",
  "list_files",
  "sandbox_list_files",
  "web_search",
  "knowledge_graph_query",
  "rag_knowledge",
]);

// ─── Transient Error Detection ──────────────────────────────────

const TRANSIENT_RE =
  /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|503|429|fetch failed|container.*not running/i;

// ─── Smart Result Compression ───────────────────────────────────

export function compressToolResult(toolName: string, result: string): string {
  // File listings: keep first 50 lines + summary
  if (toolName === "bash_exec" && result.split("\n").length > 60) {
    const lines = result.split("\n");
    return lines.slice(0, 50).join("\n") + `\n... (${lines.length - 50} more lines omitted)`;
  }
  // File reads: keep head + tail for very large files
  if (toolName === "read_file" && result.length > 8000) {
    return (
      result.slice(0, 4000) +
      "\n\n...[middle omitted — showing head + tail]...\n\n" +
      result.slice(-3000)
    );
  }
  return result;
}

// ─── Tool Result Type ───────────────────────────────────────────

export interface ToolResult {
  id: string;
  name: string;
  content: string;
  isError: boolean;
}

// ─── Tool Runner Context ────────────────────────────────────────

export interface ToolRunnerContext {
  broadcaster: AgentBroadcaster;
  toolLoopSession: ToolLoopSession;
  toolResultCache: Map<string, string>;
  toolsUsedInLoop: string[];
  abortSignal?: AbortSignal;
  /** Current iteration number (mutable ref) */
  getIterations: () => number;
  /** Mutable ref to set previewUrl */
  setPreviewUrl: (url: string) => void;
  /** Optional adaptive timeout resolver from intelligence engine */
  getToolTimeoutMs?: (toolName: string, defaultMs: number) => number;
}

// ─── Factory: Create Tool Runner ────────────────────────────────

/**
 * Creates a `runToolsInParallel` function bound to the current loop's state.
 */
export function createToolRunner(ctx: ToolRunnerContext) {
  const { broadcaster, toolLoopSession, toolResultCache, toolsUsedInLoop, abortSignal } = ctx;

  async function executeOneToolWithRetry(
    tc: { id: string; name: string; input: unknown },
    tcIdx: number,
    totalToolsThisIter: number,
  ): Promise<ToolResult> {
    const iterations = ctx.getIterations();

    // ── Abort check ──
    if (abortSignal?.aborted) {
      logger.info(`[AgentLoop] Aborted before tool ${tc.name} at iteration ${iterations}`);
      broadcaster.send(`\n⏹️ Aborted before executing ${tc.name}\n`);
      return { id: tc.id, name: tc.name, content: "Aborted by user", isError: true };
    }

    // ── Tool-loop detection (synchronous — shared session) ──
    const loopCheck = detectToolCallLoop(
      toolLoopSession,
      tc.name,
      tc.input as Record<string, unknown>,
    );
    if (loopCheck.stuck && loopCheck.level === "critical") {
      logger.warn(`[AgentLoop] Tool loop BLOCKED: ${loopCheck.message}`);
      broadcaster.send(`\n🔄 **Loop detected**: ${loopCheck.message}\n`);
      return {
        id: tc.id,
        name: tc.name,
        content: `BLOCKED: ${loopCheck.message}. Try a different approach or report the task as complete/failed.`,
        isError: true,
      };
    }
    if (loopCheck.stuck && loopCheck.level === "warning") {
      broadcaster.send(`\n⚠️ Possible loop: ${loopCheck.message}\n`);
    }
    recordToolCall(toolLoopSession, tc.name, tc.input as Record<string, unknown>, tc.id);
    toolsUsedInLoop.push(tc.name);

    // ── Tool Result Cache Check ──
    const cacheKey = `${tc.name}:${JSON.stringify(tc.input)}`;
    if (CACHEABLE_TOOLS.has(tc.name) && toolResultCache.has(cacheKey)) {
      return {
        id: tc.id,
        name: tc.name,
        content: toolResultCache.get(cacheKey)!,
        isError: false,
      };
    }

    const toolDesc = formatToolSummary(tc.name, tc.input as ToolInput);
    broadcaster.send(`\n🔧 **${tc.name}** ${toolDesc} _(iter ${iterations})_\n`);

    // ── Emit structured tool start event ──
    broadcaster.toolEvent?.({
      toolName: tc.name,
      status: "start",
      description: toolDesc,
      stepIndex: tcIdx,
      totalSteps: totalToolsThisIter,
    });

    const toolStartMs = Date.now();
    const staticTimeout = TOOL_TIMEOUTS[tc.name] ?? TOOL_TIMEOUTS.default!;
    const toolTimeoutMs = ctx.getToolTimeoutMs
      ? ctx.getToolTimeoutMs(tc.name, staticTimeout)
      : staticTimeout;

    // Attempt execution with per-tool timeout + 1 transient retry
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await Promise.race([
          executeTool(tc.name, tc.input as ToolInput),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Tool ${tc.name} timed out after ${toolTimeoutMs / 1000}s`)),
              toolTimeoutMs,
            ),
          ),
        ]);
        const toolDurationMs = Date.now() - toolStartMs;

        if (result.startsWith("PREVIEW_READY|")) {
          ctx.setPreviewUrl("/sandbox/");
          broadcaster.send(`\n🖼️ Preview ready\n`);
        } else {
          const abbrev =
            result.length > 200 ? result.slice(0, 200) + `… (${result.length} chars)` : result;
          broadcaster.send(`📎 ${abbrev.split("\n").slice(0, 3).join(" | ")}\n`);
        }

        // Compress → then truncate
        const compressed = compressToolResult(tc.name, result);
        const MAX_TOOL_RESULT = 16_000;
        const truncatedResult =
          compressed.length > MAX_TOOL_RESULT
            ? compressed.slice(0, MAX_TOOL_RESULT) +
              `\n... [truncated: ${result.length} chars total, showing first ${MAX_TOOL_RESULT}]`
            : compressed;

        // Cache result if cacheable
        if (CACHEABLE_TOOLS.has(tc.name)) {
          toolResultCache.set(cacheKey, truncatedResult);
        }

        // ── Emit structured tool done event ──
        broadcaster.toolEvent?.({
          toolName: tc.name,
          status: "done",
          description: toolDesc,
          stepIndex: tcIdx,
          totalSteps: totalToolsThisIter,
          durationMs: toolDurationMs,
        });

        // Record successful outcome for loop detection
        recordToolCallOutcome(toolLoopSession, {
          toolName: tc.name,
          toolParams: tc.input as Record<string, unknown>,
          toolCallId: tc.id,
          result: truncatedResult,
        });

        // ── Auto-RAG: keep vector DB in sync with workspace ──
        autoRagIngest(tc.name, tc.input as Record<string, unknown>);

        // ── Browser Observation Loop ──
        const browserObs = await maybeBrowserObserve(tc.name, broadcaster);
        const finalContent = browserObs
          ? `${truncatedResult}\n\n[Browser Observation] ${browserObs}`
          : truncatedResult;

        return { id: tc.id, name: tc.name, content: finalContent, isError: false };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);

        // ── Transient retry (1 attempt with 2s backoff) ──
        if (attempt === 0 && TRANSIENT_RE.test(errMsg)) {
          broadcaster.send(`\n⏳ Transient error on ${tc.name}, retrying in 2s...\n`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }

        const toolDurationMs = Date.now() - toolStartMs;
        broadcaster.send(`\n❌ Tool error: ${errMsg.slice(0, 500)}\n`);

        const MAX_TOOL_ERROR = 16_000;
        const truncatedErr =
          errMsg.length > MAX_TOOL_ERROR
            ? errMsg.slice(0, MAX_TOOL_ERROR) +
              `\n... [error truncated: ${errMsg.length} chars total]`
            : errMsg;

        // ── Emit structured tool error event ──
        broadcaster.toolEvent?.({
          toolName: tc.name,
          status: "error",
          description: errMsg,
          stepIndex: tcIdx,
          totalSteps: totalToolsThisIter,
          durationMs: toolDurationMs,
        });

        // Record error outcome for loop detection
        recordToolCallOutcome(toolLoopSession, {
          toolName: tc.name,
          toolParams: tc.input as Record<string, unknown>,
          toolCallId: tc.id,
          error: errMsg,
        });

        return { id: tc.id, name: tc.name, content: `Error: ${truncatedErr}`, isError: true };
      }
    }
    // Unreachable, but TypeScript needs this
    return {
      id: tc.id,
      name: tc.name,
      content: "Error: unexpected execution path",
      isError: true,
    };
  }

  /** Execute all tool calls in parallel with retry, caching, and loop detection. */
  async function runToolsInParallel(
    toolCalls: Array<{ id: string; name: string; input: unknown }>,
  ): Promise<ToolResult[]> {
    const total = toolCalls.length;
    const promises = toolCalls.map((tc, idx) => executeOneToolWithRetry(tc, idx, total));
    return Promise.all(promises);
  }

  return { runToolsInParallel };
}
