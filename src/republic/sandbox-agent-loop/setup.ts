/**
 * Sandbox Agent Loop — Session setup and initialization.
 *
 * Handles provider resolution, tool loading, strategy planning,
 * intelligence creation, and all pre-loop initialization.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";
import { createLoopIntelligence, type LoopIntelligenceEngine } from "../agent-loop-intelligence.js";
import { CostOracle } from "../agent-loop/cost-oracle.js";
import {
  buildPhaseRoutes,
  estimateRoutingSavings,
  type PhaseRoute,
} from "../agent-loop/model-router.js";
import { analyzeParallelEligibility, type ParallelPlan } from "../agent-loop/parallel-dispatch.js";
import { resetReflectionState } from "../agent-loop/reflexion.js";
import { canResume, loadCheckpoint, buildResumeContext } from "../agent-loop/session-resume.js";
import { SpeculativeEngine } from "../agent-loop/speculative-engine.js";
import { TaskMemory } from "../agent-loop/task-memory.js";
import { TaskTracker } from "../agent-loop/task-tracker.js";
import { providerLabel, type AgentBroadcaster } from "../agent-providers/index.js";
import { isContainerRunning } from "../agent-sandbox.js";
import { planExecution, recordPlan, type TaskPlan } from "../agent-strategy-planner.js";
import { startSession } from "../agent-telemetry.js";
import { MAX_ITERATIONS, incrementActiveLoops, type SandboxAgentLoopOpts } from "./config.js";
import {
  initMessageHistories,
  preWarmTls,
  type AnthropicMessage,
  type OpenAiMessage,
  type GeminiContent,
  createBoundToolRunner,
  type LoopState,
} from "./iteration.js";
import {
  resolveProvider,
  resolveModelId,
  loadToolsAndMcp,
  applyDualModePrefix,
  parseDualModelConfig,
  loadKnowledgeContext,
  buildSystemPrompt,
} from "./provider-setup.js";

const logger = createSubsystemLogger("sandbox-agent");

export interface SetupResult {
  state: LoopState;
  plan: TaskPlan;
  intelligence: LoopIntelligenceEngine;
  effectiveMaxIter: number;
  systemPrompt: string;
  anthropicMessages: AnthropicMessage[];
  openaiMessages: OpenAiMessage[];
  geminiContents: GeminiContent[];
  parallelPlan: ParallelPlan;
  phaseRoutes: PhaseRoute[];
  costOracle: CostOracle;
  specEngine: SpeculativeEngine;
  taskMemory: TaskMemory;
  tracker: TaskTracker;
  telemetrySessionId: string;
  loopStartMs: number;
  skippedProviders: Set<import("../agent-providers/index.js").AgentProvider>;
  toolRunner: ReturnType<typeof createBoundToolRunner>;
  userMessage: string;
}

/**
 * Initialize everything needed for the agent loop.
 * Returns null with a broadcast error if setup fails (no API key, no container).
 */
export async function setupAgentLoop(
  userMessage: string,
  broadcaster: AgentBroadcaster,
  opts?: SandboxAgentLoopOpts,
): Promise<SetupResult | null> {
  // ── Provider selection ──────────────────────────────────────────
  const initialProvider = resolveProvider(opts);
  if (!initialProvider) {
    return null; // caller handles failResult
  }
  if (!isContainerRunning()) {
    return null;
  }

  const initialModelId = resolveModelId(initialProvider, opts);

  // ── Load tools & MCP ────────────────────────────────────────────
  const { compiledTools } = await loadToolsAndMcp();

  // ── Handle [THINK]/[EXEC] prefix routing ────────────────────────
  const prefixResult = applyDualModePrefix(
    userMessage,
    initialProvider,
    initialModelId,
    compiledTools,
    broadcaster,
  );

  // ── Parse dual-model config ─────────────────────────────────────
  const dualModelConfig = parseDualModelConfig(opts, prefixResult.dualModePrefix);
  if (dualModelConfig.hasDualModels && !prefixResult.dualModePrefix) {
    const thinkLabel =
      dualModelConfig.thinkProvider && dualModelConfig.thinkModel
        ? providerLabel(dualModelConfig.thinkProvider, dualModelConfig.thinkModel)
        : prefixResult.label;
    const execLabel =
      dualModelConfig.execProvider && dualModelConfig.execModel
        ? providerLabel(dualModelConfig.execProvider, dualModelConfig.execModel)
        : prefixResult.label;
    broadcaster.send(`🧠⚡ Dual-model: THINK=${thinkLabel} | EXEC=${execLabel}\n`);
  }

  // ── Adaptive Strategy Planning ──────────────────────────────────
  const plan = planExecution(prefixResult.userMessage);
  recordPlan(prefixResult.userMessage, plan);

  // ── Create Loop Intelligence (closed-loop controller) ───────────
  const intelligence = createLoopIntelligence(plan, MAX_ITERATIONS);
  const effectiveMaxIter = intelligence.effectiveMaxIterations;

  if (!prefixResult.dualModePrefix) {
    logger.info(
      `[AgentLoop] Provider: ${prefixResult.provider}, Model: ${prefixResult.modelId}, ` +
        `Tools: ${compiledTools.length}, MaxIter: ${effectiveMaxIter} ` +
        `(strategy: ${plan.strategy}, confidence: ${plan.confidence.toFixed(2)})`,
    );
    broadcaster.send(
      `📋 **${prefixResult.label}** | ${compiledTools.length} tools | ` +
        `${plan.strategy} strategy (${effectiveMaxIter} max iterations)\n`,
    );
  }

  if (plan.strategy !== "DIRECT") {
    const phases = plan.decomposition.map((s) => s.phase).join(" → ");
    broadcaster.send(
      `🎯 **${plan.strategy}** · confidence ${Math.round(plan.confidence * 100)}% · ` +
        `est. ${plan.estimatedIterations} iters · phases: ${phases}\n`,
    );
    logger.info(`[AgentLoop] Phases: ${phases}`);
  }

  // ── Apply tool filtering from strategy ──────────────────────────
  const strategyTools = intelligence.filterTools(prefixResult.effectiveTools);
  const excludedCount = prefixResult.effectiveTools.length - strategyTools.length;
  if (excludedCount > 0) {
    logger.info(
      `[AgentLoop] Excluded ${excludedCount} tools for ${plan.strategy}: ` +
        `${[...intelligence.filteredToolNames].join(", ")}`,
    );
    broadcaster.send(
      `🔧 Optimized tool set: ${strategyTools.length} active (${excludedCount} excluded)\n`,
    );
  }

  // ── Parallel dispatch eligibility (Manus Wide Mode) ─────────────
  const parallelPlan = analyzeParallelEligibility(
    plan.strategy,
    plan.confidence,
    plan.decomposition,
  );
  if (parallelPlan.eligible) {
    broadcaster.send(`⚡ **Parallel dispatch available** — ${parallelPlan.reason}\n`);
    logger.info(`[AgentLoop] ${parallelPlan.reason}`);
  }

  // ── Adaptive Model Router (per-phase provider switching) ────────
  const availableProviders = [prefixResult.provider];
  const phaseRoutes = buildPhaseRoutes(plan.decomposition, {
    availableProviders,
    baseProvider: prefixResult.provider,
    baseModelId: prefixResult.modelId,
    enabled: plan.strategy !== "DIRECT" && plan.decomposition.length > 1,
  });
  const routingSavings = estimateRoutingSavings(phaseRoutes);
  if (routingSavings.routedPhases > 0 && routingSavings.savedPct > 10) {
    broadcaster.send(
      `🧠 **Model routing**: ${routingSavings.routedPhases}/${routingSavings.totalPhases} phases ` +
        `use optimized models (~${routingSavings.savedPct}% cost reduction)\n`,
    );
  }

  // ── Cost Oracle / Speculative / Memory / Tracker ────────────────
  const costOracle = new CostOracle();
  const specEngine = await SpeculativeEngine.load();
  const taskMemory = await TaskMemory.load();
  const tracker = new TaskTracker(
    prefixResult.userMessage,
    plan.strategy,
    plan.decomposition,
    broadcaster,
  );
  await tracker.init();
  resetReflectionState();

  // ── Knowledge recall + strategy-enriched prompt ─────────────────
  const knowledgeContext = await loadKnowledgeContext(prefixResult.userMessage, broadcaster);
  const strategyEnrichedPrompt = plan.promptModifier ? `${plan.promptModifier}\n\n` : "";
  let systemPrompt =
    buildSystemPrompt(knowledgeContext) +
    (strategyEnrichedPrompt ? `\n\n## Execution Strategy\n${strategyEnrichedPrompt}` : "") +
    `\n\n## Workspace Files\nA task plan has been written to \`/workspace/.agent-plan.md\` and a live checklist to \`/workspace/.agent-todo.md\`. Reference these files for your task structure. Update the plan if your approach changes.`;

  // ── Inject cross-session knowledge ──────────────────────────────
  const memoryInjection = taskMemory.buildKnowledgeInjection(
    plan.strategy,
    prefixResult.userMessage,
  );
  if (memoryInjection) {
    systemPrompt += `\n\n${memoryInjection}`;
    broadcaster.send(
      `📚 **${taskMemory.totalSessions} prior sessions** loaded for knowledge transfer\n`,
    );
  }

  // ── Init message histories ──────────────────────────────────────
  const { anthropicMessages, openaiMessages, geminiContents } = initMessageHistories(
    systemPrompt,
    prefixResult.userMessage,
    opts?.history,
  );

  // ── Telemetry session ──────────────────────────────────────────
  const telemetrySessionId = startSession(
    prefixResult.provider,
    prefixResult.modelId,
    prefixResult.userMessage,
  );

  // ── Loop state ──────────────────────────────────────────────────
  const state: LoopState = {
    provider: prefixResult.provider,
    modelId: prefixResult.modelId,
    label: prefixResult.label,
    baseProvider: prefixResult.provider,
    baseModelId: prefixResult.modelId,
    dualModePrefix: prefixResult.dualModePrefix,
    dualModelConfig,
    systemPrompt,
    effectiveTools: strategyTools,
    broadcaster,
    abortSignal: opts?.abortSignal,
    iterations: 0,
    totalTokens: 0,
    finalResponse: "",
    previewUrl: null,
    consecutiveApiErrors: 0,
    totalToolErrors: 0,
    approxHistoryBytes: 0,
    toolsUsedInLoop: [],
  };

  const skippedProviders = new Set<import("../agent-providers/index.js").AgentProvider>();
  const toolRunner = createBoundToolRunner(state, {
    getToolTimeoutMs: intelligence.getToolTimeoutMs,
  });
  const loopStartMs = Date.now();
  incrementActiveLoops();
  broadcaster.send("🤖 Analyzing your request...\n");

  // ── Write plan file to sandbox (Manus-style) ────────────────────
  try {
    const planMd = [
      `# Agent Execution Plan`,
      ``,
      `**Strategy:** ${plan.strategy}`,
      `**Confidence:** ${Math.round(plan.confidence * 100)}%`,
      `**Max Iterations:** ${effectiveMaxIter}`,
      `**Estimated Iterations:** ${plan.estimatedIterations}`,
      ``,
      `## Phases`,
      ...plan.decomposition.map(
        (d, i) =>
          `${i + 1}. **${d.phase}** — ${d.description} (budget: ${d.iterationBudget} iters, tools: ${d.tools.join(", ") || "any"})`,
      ),
      ``,
      `## Strategy Directive`,
      plan.promptModifier || "(no special directive)",
    ].join("\n");
    await import("../agent-sandbox.js").then((m) =>
      m.sandboxWriteFile("/workspace/.agent-plan.md", planMd),
    );
  } catch {
    // Non-critical
  }

  preWarmTls(state.provider);

  // ── Session Resume: check for existing checkpoint ──────────────
  try {
    if (await canResume()) {
      const checkpoint = await loadCheckpoint();
      if (checkpoint) {
        const resumeCtx = buildResumeContext(checkpoint);
        anthropicMessages.push({ role: "user", content: resumeCtx });
        openaiMessages.push({ role: "system", content: resumeCtx });
        geminiContents.push({ role: "user", parts: [{ text: resumeCtx }] });
        state.approxHistoryBytes += resumeCtx.length + 50;
        broadcaster.send(
          `\n🔄 **Resuming previous session** — ${checkpoint.iteration} iterations completed, ` +
            `strategy: ${checkpoint.strategy}\n`,
        );
        logger.info(
          `[AgentLoop] Resuming from checkpoint: iter=${checkpoint.iteration}, strategy=${checkpoint.strategy}`,
        );
      }
    }
  } catch {
    // Non-critical — continue fresh if resume fails
  }

  return {
    state,
    plan,
    intelligence,
    effectiveMaxIter,
    systemPrompt,
    anthropicMessages,
    openaiMessages,
    geminiContents,
    parallelPlan,
    phaseRoutes,
    costOracle,
    specEngine,
    taskMemory,
    tracker,
    telemetrySessionId,
    loopStartMs,
    skippedProviders,
    toolRunner,
    userMessage: prefixResult.userMessage,
  };
}
