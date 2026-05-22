/**
 * Republic Platform — Real Execution Bridge (Slim Orchestrator)
 *
 * This file is the sole public surface consumed by downstream modules:
 *   agent-runtime, automation-dispatch, gsd-pipeline, clawhub-skill-manager,
 *   autonomous-tool-forge, workforce.test, execution RPC, manus-rpc, index.ts.
 *
 * It delegates all actual work to feature-sliced modules under execution-tools/
 * and re-exports the shared types from execution-types.ts.
 *
 * Architecture:
 *   real-execution.ts  (this file — dispatcher + registration)
 *       ├── execution-types.ts    (types, helpers, diagnostics, history)
 *       └── execution-tools/
 *           ├── code-dev.ts       (11 code development executors)
 *           ├── scaffold.ts       (scaffold_project + 8 template archetypes)
 *           ├── docker-ops.ts     (11 Docker executors)
 *           ├── comfyui.ts        (ComfyUI integration)
 *           ├── media.ts          (create_art, video, music cascades)
 *           ├── forex.ts          (6 forex trading executors)
 *           ├── agi-skills.ts     (20 AGI/automation executors)
 *           ├── sandbox.ts        (5 sandbox executors)
 *           └── sovereign.ts      (7 sovereign AI executors)
 */

import { startTrace, endSpan } from "./observability.js";
import {
  createToolLoopSession,
  detectToolCallLoop,
  recordToolCall as recordLoopToolCall,
  recordToolCallOutcome,
  type ToolLoopSession,
} from "./openclaw/tool-loop-detection.js";
import { registerTool } from "./tool-executor.js";
import { ts, uid } from "./utils.js";

// ─── Re-export shared types, helpers, diagnostics ───────────────
// Every downstream consumer that imports types or diagnostics from
// "real-execution.js" continues to work without changes.

export type {
  ExecutionResult,
  ExecutionContext,
  ExecutionStatus,
  ExecutionDiagnostics,
  ToolExecutor,
} from "./execution-types.js";

export {
  getExecutionDiagnostics,
  getExecutionHistory,
  recordExecution,
  makeFailResult,
  makeSuccessResult,
  detectLanguage,
  envKey,
  OLLAMA_URL,
  LMSTUDIO_URL,
} from "./execution-types.js";

import type { ExecutionResult, ExecutionContext, ToolExecutor } from "./execution-types.js";
// AGI skills & automation (20 executors)
import {
  executeBrowseWeb,
  executeControlDesktop,
  executeResearchTopic,
  executeLlmOpsTrain,
  executeLlmOpsQuantize,
  executeLlmOpsDeploy,
  executeMlPredict,
  executeMlClassify,
  executeMlDetectAnomalies,
  executeGatewayCloneNode,
  executeGatewayFormCluster,
  executeMemoryChainOfThought,
  executeMemoryTreeOfThought,
  executeSkillForgeCreate,
  executeCitizenBroadcastAwareness,
  executeCivilizationSyncState,
  executeKaliScan,
  executeDownloadLocalLlm,
  executeStartLocalLlm,
} from "./execution-tools/agi-skills.js";
// ─── Import all executors from feature modules ──────────────────
// Code development (11 executors)
import {
  executeWriteCode,
  executeCreateFile,
  executeDebugCode,
  executeCodeReview,
  executeRunTests,
  executeLintCode,
  executeWriteTest,
  executeDeployApp,
  executeGitCommit,
  executeWriteSchema,
  executeAgenticDevelop,
  executeAgenticDebug,
} from "./execution-tools/code-dev.js";
// ComfyUI (2 executors)
import { executeComfyuiGenerate, executeComfyuiStatus } from "./execution-tools/comfyui.js";
// Docker operations (11 executors)
import {
  executeDockerRun,
  executeDockerPs,
  executeDockerStop,
  executeDockerExec,
  executeDockerBuild,
  executeDockerCompile,
  executeDockerListContainers,
  executeDockerProvisionBackend,
  executeDockerStopContainer,
  executeDockerExecInContainer,
  executeDockerGetLogs,
} from "./execution-tools/docker-ops.js";
// Forex trading (6 executors)
import {
  executeForexGetRates,
  executeForexAnalyzePair,
  executeForexPlaceTrade,
  executeForexGetPositions,
  executeForexBacktest,
  executeForexCalendar,
} from "./execution-tools/forex.js";
// Media production (4 executors)
import {
  executeCreateArt,
  executeGenerateVideo,
  executeGenerateVideoClip,
  executeGenerateMusicTrack,
} from "./execution-tools/media.js";
// Sandbox (5 executors)
import {
  executeSandboxExec,
  executeSandboxBrowse,
  executeSandboxBuildProject,
  executeWebScrape,
} from "./execution-tools/sandbox.js";
// Scaffolding
import { executeScaffoldProject } from "./execution-tools/scaffold.js";
// Sovereign AI engines (7 executors)
import {
  executeAnalyzeImage,
  executeSovereignSearch,
  executeKnowledgeStore,
  executeKnowledgeQuery,
  executeRunCode,
  executeTranscribeAudio,
  executeSynthesizeSpeech,
} from "./execution-tools/sovereign.js";
import { recordExecution } from "./execution-types.js";

// ─── Tool Executor Map ──────────────────────────────────────────

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  // Code development
  write_code: executeWriteCode,
  create_file: executeCreateFile,
  debug_code: executeDebugCode,
  code_review: executeCodeReview,
  run_tests: executeRunTests,
  lint_code: executeLintCode,
  write_test: executeWriteTest,
  scaffold_project: executeScaffoldProject,
  deploy_app: executeDeployApp,
  git_commit: executeGitCommit,
  write_schema: executeWriteSchema,
  // Agentic development
  develop: executeAgenticDevelop,
  agentic_debug: executeAgenticDebug,
  // Automation
  browse_web: executeBrowseWeb,
  control_desktop: executeControlDesktop,
  research_topic: executeResearchTopic,
  // AGI skills
  llm_ops_train: executeLlmOpsTrain,
  llm_ops_quantize: executeLlmOpsQuantize,
  llm_ops_deploy: executeLlmOpsDeploy,
  ml_predict: executeMlPredict,
  ml_classify: executeMlClassify,
  ml_detect_anomalies: executeMlDetectAnomalies,
  gateway_clone_node: executeGatewayCloneNode,
  gateway_form_cluster: executeGatewayFormCluster,
  memory_chain_of_thought: executeMemoryChainOfThought,
  memory_tree_of_thought: executeMemoryTreeOfThought,
  skill_forge_create: executeSkillForgeCreate,
  citizen_broadcast_awareness: executeCitizenBroadcastAwareness,
  civilization_sync_state: executeCivilizationSyncState,
  // Docker operations
  docker_run: executeDockerRun,
  docker_ps: executeDockerPs,
  docker_stop: executeDockerStop,
  docker_exec: executeDockerExec,
  docker_build: executeDockerBuild,
  docker_compile: executeDockerCompile,
  docker_list_containers: executeDockerListContainers,
  docker_provision_backend: executeDockerProvisionBackend,
  docker_stop_container: executeDockerStopContainer,
  docker_exec_in_container: executeDockerExecInContainer,
  docker_get_logs: executeDockerGetLogs,
  // Local LLM management
  download_local_llm: executeDownloadLocalLlm,
  start_local_llm: executeStartLocalLlm,
  // ComfyUI
  comfyui_generate: executeComfyuiGenerate,
  comfyui_status: executeComfyuiStatus,
  // Cyber warfare
  kali_scan: executeKaliScan,
  // Forex trading
  forex_get_rates: executeForexGetRates,
  forex_analyze_pair: executeForexAnalyzePair,
  forex_place_trade: executeForexPlaceTrade,
  forex_get_positions: executeForexGetPositions,
  forex_backtest_strategy: executeForexBacktest,
  forex_economic_calendar: executeForexCalendar,
  // Agent sandbox
  sandbox_exec: executeSandboxExec,
  sandbox_browse: executeSandboxBrowse,
  sandbox_build_project: executeSandboxBuildProject,
  web_scrape: executeWebScrape,
  // Media production
  create_art: executeCreateArt,
  generate_video: executeGenerateVideo,
  generate_video_clip: executeGenerateVideoClip,
  generate_music_track: executeGenerateMusicTrack,
  // Sovereign AI
  analyze_image: executeAnalyzeImage,
  sovereign_search: executeSovereignSearch,
  knowledge_store: executeKnowledgeStore,
  knowledge_query: executeKnowledgeQuery,
  run_code: executeRunCode,
  transcribe_audio: executeTranscribeAudio,
  synthesize_speech: executeSynthesizeSpeech,
};

// ─── Financial Gating ───────────────────────────────────────────

const FINANCIAL_GATED_TOOLS = new Set([
  "forex_place_trade",
  "paypal_send",
  "paypal_withdraw",
  "binance_trade",
  "binance_withdraw",
  "binance_transfer",
]);

// ─── Tool Loop Detection Sessions ───────────────────────────────
// One session per citizenId — tracks sliding window of tool calls
// for loop/no-progress detection.
const loopSessions = new Map<string, ToolLoopSession>();
const MAX_LOOP_SESSIONS = 1000;

function getLoopSession(citizenId: string): ToolLoopSession {
  let session = loopSessions.get(citizenId);
  if (!session) {
    // Evict empty/stale sessions if over capacity
    if (loopSessions.size >= MAX_LOOP_SESSIONS) {
      gcLoopSessions();
    }
    session = createToolLoopSession();
    loopSessions.set(citizenId, session);
  }
  return session;
}

/** Clear a citizen's loop session (e.g. on task completion). */
export function clearLoopSession(citizenId: string): void {
  loopSessions.delete(citizenId);
}

/** GC: remove sessions with empty histories to keep map bounded. */
function gcLoopSessions(): void {
  for (const [id, session] of loopSessions) {
    if (session.toolCallHistory.length === 0) {
      loopSessions.delete(id);
    }
  }
  // If still over capacity, remove oldest entries
  if (loopSessions.size >= MAX_LOOP_SESSIONS) {
    const toRemove = loopSessions.size - Math.floor(MAX_LOOP_SESSIONS * 0.8);
    let removed = 0;
    for (const id of loopSessions.keys()) {
      if (removed >= toRemove) {
        break;
      }
      loopSessions.delete(id);
      removed++;
    }
  }
}

// ─── Main Entry Point ───────────────────────────────────────────

/**
 * Execute a citizen tool action in real mode.
 * This is the main entry point called by the agent runtime.
 *
 * Includes tool-loop detection: blocks execution when a citizen is
 * stuck in a repetitive loop (same tool+params with no progress).
 */
export async function executeToolAction(
  toolName: string,
  toolArgs: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Only gate PayPal/Binance financial operations behind mode check.
  // Everything else executes for real regardless of Republic mode.
  if (ctx.mode !== "real" && FINANCIAL_GATED_TOOLS.has(toolName)) {
    return {
      id: uid(),
      toolName,
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "skipped",
      output: `Financial operation "${toolName}" requires real mode — PayPal/Binance gated`,
      filesAffected: [],
      modelDecision: null,
      durationMs: 0,
      timestamp: ts(),
    };
  }

  // ── Tool Loop Detection ─────────────────────────────────────────
  const session = getLoopSession(ctx.citizenId);
  const loopCheck = detectToolCallLoop(session, toolName, toolArgs);
  if (loopCheck.stuck && loopCheck.level === "critical") {
    return {
      id: uid(),
      toolName,
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "failed",
      output: loopCheck.message,
      error: `Loop detected by ${loopCheck.detector}: ${loopCheck.count} repetitions`,
      filesAffected: [],
      modelDecision: null,
      durationMs: 0,
      timestamp: ts(),
    };
  }
  // Record this call into the sliding window
  recordLoopToolCall(session, toolName, toolArgs);

  const start = Date.now();
  const executor = TOOL_EXECUTORS[toolName];

  if (!executor) {
    return {
      id: uid(),
      toolName,
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "skipped",
      output: `No real executor for tool: ${toolName}`,
      filesAffected: [],
      modelDecision: null,
      durationMs: Date.now() - start,
      timestamp: ts(),
    };
  }

  const span = startTrace(ctx.citizenId, toolName, 0);

  try {
    const result = await executor(toolArgs, ctx);
    recordExecution(result);
    span.toolIds.push(toolName);
    endSpan(span, 0, { status: result.status === "failed" ? "error" : "ok" });
    // Record outcome for loop no-progress detection
    recordToolCallOutcome(session, {
      toolName,
      toolParams: toolArgs,
      result: { status: result.status, output: result.output },
    });
    return result;
  } catch (err: unknown) {
    const result: ExecutionResult = {
      id: uid(),
      toolName,
      citizenId: ctx.citizenId,
      projectId: ctx.projectId,
      status: "failed",
      output: "",
      filesAffected: [],
      modelDecision: null,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      timestamp: ts(),
    };
    recordExecution(result);
    span.toolIds.push(toolName);
    endSpan(span, 0, { status: "error" });
    // Record error outcome for loop detection
    recordToolCallOutcome(session, {
      toolName,
      toolParams: toolArgs,
      error: err,
    });
    return result;
  }
}

// Expose to OpenClaw native tool bridge safely
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__republic_executeToolAction = executeToolAction;

// ─── Dynamic Registration ───────────────────────────────────────

/**
 * Register a dynamically forged tool into the executor map.
 * Used by autonomous-tool-forge.ts.
 */
export async function registerForgedTool(
  def: import("./tool-executor.js").ToolDefinition,
  filePath: string,
) {
  const forgeModule = await import(filePath);
  TOOL_EXECUTORS[def.id] = forgeModule.executeForgedTool;
  registerTool(def);
}

/**
 * Register a tool executor callback at runtime.
 * Used by clawhub-skill-manager and other dynamic tool systems.
 */
export function registerExecutor(
  toolId: string,
  executor: (args: Record<string, unknown>, ctx: ExecutionContext) => Promise<ExecutionResult>,
): void {
  TOOL_EXECUTORS[toolId] = executor;
}
