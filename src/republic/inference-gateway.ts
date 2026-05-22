/**
 * Republic Inference Gateway
 *
 * Unified entry point for all LLM inference across the Republic.
 *
 *   Citizen → Prompt Queue → Access Tier → Model Select → Route (LM Studio | Ollama) → Response
 *
 * BitNet and ClawRouter have been removed. Local inference only via LM Studio and Ollama.
 */

import type { AgentTask, Specialization } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { updateProviderTelemetry } from "./compute-router.js";
import { selectBestLMLinkNode } from "./lmlink-cluster.js";
import {
  chatStateful,
  extractMessageContent,
  findLoadedModel,
  getLMStudioDiagnostics,
  getLoadedModels,
  listModels,
  registerLMStudioInstance,
  type LMStudioIntegration,
  type LMStudioStats,
} from "./lmstudio-driver.js";
import { ensureModelLoaded } from "./lmstudio-strategy.js";
import {
  awaitLocalReadiness,
  getLocalInstances,
  startLocalComputeDiscovery,
  warmLocalModels,
} from "./local-compute.js";
import { resolveCitizenAccessTier, selectModel, type ModelBudgetTier } from "./model-council.js";
import {
  getPoolStats,
  initModelPool,
  recordModelDemand,
  shutdownModelPool,
} from "./model-pool-manager.js";
import {
  accessTierToPriority,
  enqueuePrompt,
  getQueueStats,
  registerDispatcher,
  type QueuedPrompt,
  type QueueResult,
} from "./prompt-queue.js";
import { getToonStats, TOON_SYSTEM_PREFIX, wrapPromptData } from "./toon-serializer.js";

// ─── Reasoning Level Mapping ────────────────────────────────────

type ReasoningLevel = "off" | "low" | "medium" | "high" | "on";

const ACCESS_TIER_REASONING: Record<string, ReasoningLevel> = {
  basic: "off",
  skilled: "low",
  expert: "medium",
  orchestrator: "high",
};

const logger = createSubsystemLogger("inference-gateway");

/** Throttle: only log LM Studio compat fallback once per 60 seconds */
let _lastLmsCompatLogAt = 0;

// ─── State ──────────────────────────────────────────────────────

let bridgeInitialized = false;

/** Per-citizen cost tracking (in-memory) */
const citizenCosts = new Map<string, { today: number; total: number; lastReset: string }>();

// ─── Lifecycle ──────────────────────────────────────────────────

/**
 * Initialize the unified inference gateway.
 * Sets up local providers (LM Studio, Ollama), model pool, and prompt queue dispatcher.
 */
export async function initInferenceGateway(_opts?: {
  walletKey?: string;
  port?: number;
}): Promise<void> {
  if (bridgeInitialized) {
    return;
  }

  process.stdout.write("[diag] inference-gw: step 1 — LM Studio\n");
  // ── Initialize LM Studio driver (local + remote instances) ──
  try {
    const lmsHost = process.env.LMSTUDIO_HOST ?? "127.0.0.1";
    const lmsPort = parseInt(process.env.LMSTUDIO_PORT ?? "1234", 10);
    const lmsToken = process.env.LMSTUDIO_API_TOKEN;
    registerLMStudioInstance(lmsHost, lmsPort, lmsToken);
    const models = await listModels().catch(() => []);
    logger.info(`LM Studio connected: ${models.length} models available`);
  } catch (err) {
    logger.warn(`LM Studio init: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Register remote LM Studio instances ──
  const remoteUrls = process.env.LMSTUDIO_REMOTE_URLS ?? "";
  if (remoteUrls.trim()) {
    for (const url of remoteUrls.split(",")) {
      try {
        const trimmed = url.trim().replace(/\/+$/, "");
        const parsed = new URL(trimmed.startsWith("http") ? trimmed : `http://${trimmed}`);
        const host = parsed.hostname;
        const port = parseInt(parsed.port || "1234", 10);
        registerLMStudioInstance(host, port);
        const models = await listModels(`lmstudio-${host}:${port}`).catch(() => []);
        logger.info(
          `LM Studio remote ${host}:${port} connected: ${models.length} models available`,
        );
      } catch (err) {
        logger.warn(
          `LM Studio remote "${url.trim()}" init: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  process.stdout.write("[diag] inference-gw: step 2 — local compute discovery\n");
  // ── Start local-compute discovery (Ollama, LM Studio) ──
  startLocalComputeDiscovery();

  process.stdout.write("[diag] inference-gw: step 3 — awaitLocalReadiness\n");
  // ── Wait up to 1s for at least 1 local provider ──
  // Reduced from 5s: citizens have reflex fallback, no need to block boot.
  const ready = await awaitLocalReadiness(1_000);
  if (ready) {
    logger.info("Local inference ready — at least 1 model online");
    warmLocalModels().catch((err) =>
      logger.warn(`Model pre-warming failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  } else {
    logger.warn(
      "No local inference providers online after 5s — citizens will use reflex fallback until a provider appears",
    );
  }

  process.stdout.write("[diag] inference-gw: step 4 — ensureModelLoaded\n");
  // ── Load the preferred LM Studio model ("Load Once, Infer Forever") ──
  ensureModelLoaded()
    .then((ok) => {
      if (ok) {
        logger.info("LM Studio strategy: preferred model loaded and ready");
      } else {
        logger.warn("LM Studio strategy: no model loaded — will retry on first inference");
      }
    })
    .catch((err) =>
      logger.warn(`LM Studio strategy init: ${err instanceof Error ? err.message : String(err)}`),
    );

  process.stdout.write("[diag] inference-gw: step 5 — model pool\n");
  // ── Initialize model pool manager ──
  try {
    await initModelPool();
    logger.info("Model pool manager initialized");
  } catch (err) {
    logger.warn(`Model pool init: ${err instanceof Error ? err.message : String(err)}`);
  }

  process.stdout.write("[diag] inference-gw: step 6 — registerDispatcher\n");
  // ── Register the prompt queue dispatcher ──
  registerDispatcher(dispatchInference);

  bridgeInitialized = true;
  logger.info("Unified inference gateway ready (LM Studio + Ollama)");
  process.stdout.write("[diag] inference-gw: complete\n");
}

/**
 * Shut down the unified inference gateway.
 */
export async function shutdownInferenceGateway(): Promise<void> {
  if (!bridgeInitialized) {
    return;
  }
  shutdownModelPool();
  bridgeInitialized = false;
  logger.info("Gateway shut down");
}

// ─── Unified Routing API ────────────────────────────────────────

/**
 * Route a citizen's inference request through the unified gateway.
 */
export async function routeInference(params: {
  citizenId: string;
  prompt: string;
  systemPrompt?: string;
  toolName: string;
  task: AgentTask;
  specialization: Specialization;
  skillLevel: number;
  contextData?: unknown;
  maxTokens?: number;
}): Promise<{
  response: string;
  modelId: string;
  tier: ModelBudgetTier;
  cost: number;
  toonSaved: boolean;
  queueWaitMs: number;
}> {
  const { citizenId, toolName, task, specialization, skillLevel, contextData, maxTokens } = params;

  // 1. Resolve citizen access tier
  const accessTier = resolveCitizenAccessTier(String(specialization), skillLevel);

  // 2. Select model (tier-gated)
  const decision = selectModel({
    toolName,
    task,
    specialization,
    skillLevel,
    citizenAccessTier: accessTier,
  });

  // 3. Prepare prompt with TOON-serialized context
  let prompt = params.prompt;
  let systemPrompt = params.systemPrompt ?? "";
  let toonSaved = false;

  if (contextData) {
    const toonContext = wrapPromptData("context", contextData);
    prompt = `${toonContext}\n\n${prompt}`;
    if (!systemPrompt.includes("TOON")) {
      systemPrompt = `${TOON_SYSTEM_PREFIX}\n\n${systemPrompt}`;
    }
    toonSaved = true;
  }

  // 4. Estimate cost
  const estimatedTokens = Math.ceil(prompt.length / 4);
  const costEstimate = (estimatedTokens / 1_000_000) * decision.model.costPer1MTokens;

  // 5. Enqueue for processing
  const result = await enqueuePrompt({
    citizenId,
    accessTier,
    priority: accessTierToPriority(accessTier),
    prompt,
    systemPrompt: systemPrompt || undefined,
    targetTier: decision.requestedTier,
    maxTokens: maxTokens ?? decision.config.maxTokens,
    costEstimate,
    toolName,
    specialization: String(specialization),
  });

  // 6. Track citizen cost
  trackCitizenCost(citizenId, result.actualCost);

  return {
    response: result.response,
    modelId: result.modelId,
    tier: decision.requestedTier,
    cost: result.actualCost,
    toonSaved,
    queueWaitMs: result.queueWaitMs,
  };
}

// ─── Dispatch Engine ────────────────────────────────────────────

/**
 * The actual inference dispatcher — called by the prompt queue scheduler.
 * Routes to LM Studio or Ollama based on what's available.
 */
async function dispatchInference(queued: QueuedPrompt): Promise<QueueResult> {
  const startTime = Date.now();

  try {
    return await dispatchLocal(queued, startTime);
  } catch (err) {
    throw new Error(
      `Inference dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

async function dispatchLocal(queued: QueuedPrompt, startTime: number): Promise<QueueResult> {
  // Resolve reasoning level from citizen access tier
  const reasoningLevel = ACCESS_TIER_REASONING[queued.accessTier] ?? "off";

  // ── Try LM Studio v1 native API (preferred) ──
  try {
    const loaded = getLoadedModels();
    if (loaded.length > 0) {
      const target =
        queued.accessTier !== "basic"
          ? (findLoadedModel({ toolUse: true }) ?? loaded[0])
          : loaded[0];

      recordModelDemand(target.key);

      const integrations: LMStudioIntegration[] = [];
      if (queued.accessTier !== "basic" && target.toolUse) {
        const republicMcpPort = process.env.REPUBLIC_MCP_PORT ?? "3010";
        integrations.push({
          type: "ephemeral_mcp",
          server_label: "republic-tools",
          server_url: `http://localhost:${republicMcpPort}/mcp`,
          allowed_tools: getToolsForAccessTier(queued.accessTier),
        });
      }

      const response = await chatStateful(queued.citizenId, {
        model: target.key,
        input: queued.prompt,
        systemPrompt: queued.systemPrompt,
        reasoning: reasoningLevel,
        maxOutputTokens: queued.maxTokens,
        temperature: 0.7,
        integrations: integrations.length > 0 ? integrations : undefined,
        contextLength: target.contextLength,
      });

      feedTelemetry("lmstudio", response.stats);

      return {
        response: extractMessageContent(response),
        modelId: `lmstudio/${target.key}`,
        actualCost: 0,
        queueWaitMs: 0,
        processingMs: Date.now() - startTime,
        cached: false,
      };
    }
  } catch {
    // LM Studio native API not available, fall through
  }

  // ── Fallback: LM Studio via OpenAI-compat endpoint ──
  try {
    const lmsInstance = getLocalInstances().find(
      (i) => i.type === "lmstudio" && i.status === "online" && i.models.length > 0,
    );
    if (lmsInstance) {
      const chatModels = lmsInstance.models.filter((m) => {
        const lower = m.toLowerCase();
        return !lower.includes("embed") && !lower.includes("text-embedding");
      });
      const model = chatModels[0];
      if (!model) {
        throw new Error("LM Studio has only embedding models loaded");
      }
      const now = Date.now();
      if (now - _lastLmsCompatLogAt > 60_000) {
        logger.info(
          `[lmstudio-compat] No loaded models, using OpenAI-compat fallback with "${model}"`,
        );
        _lastLmsCompatLogAt = now;
      }

      const resp = await fetch(`${lmsInstance.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            ...(queued.systemPrompt ? [{ role: "system", content: queued.systemPrompt }] : []),
            { role: "user", content: queued.prompt },
          ],
          max_tokens: queued.maxTokens,
          temperature: 0.7,
          stream: false,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (resp.ok) {
        const data = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (text) {
          return {
            response: text,
            modelId: `lmstudio-compat/${model}`,
            actualCost: 0,
            queueWaitMs: 0,
            processingMs: Date.now() - startTime,
            cached: false,
          };
        }
      }
    }
  } catch {
    // LM Studio OpenAI-compat not available, fall through
  }

  // ── Fallback: LM Link cluster (remote LM Studio via Tailscale mesh) ──
  try {
    const remoteNode = selectBestLMLinkNode();
    if (remoteNode && remoteNode.status === "online" && !remoteNode.isLocal) {
      const nodeUrl = `http://${remoteNode.host}:${remoteNode.port}`;
      const authHdr: Record<string, string> = { "Content-Type": "application/json" };
      if (remoteNode.apiToken) {
        authHdr["Authorization"] = `Bearer ${remoteNode.apiToken}`;
      }

      const remoteModel = remoteNode.models.find((m) => m.loaded)?.key ?? remoteNode.models[0]?.key;

      if (remoteModel) {
        const resp = await fetch(`${nodeUrl}/v1/chat/completions`, {
          method: "POST",
          headers: authHdr,
          body: JSON.stringify({
            model: remoteModel,
            messages: [
              ...(queued.systemPrompt ? [{ role: "system", content: queued.systemPrompt }] : []),
              { role: "user", content: queued.prompt },
            ],
            max_tokens: queued.maxTokens,
            stream: false,
          }),
          signal: AbortSignal.timeout(120_000),
        });

        if (resp.ok) {
          const data = (await resp.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const text = data.choices?.[0]?.message?.content ?? "";
          if (text) {
            logger.info(`[lmlink] Routed via ${remoteNode.label} (${remoteNode.gpuProfile})`);
            return {
              response: text,
              modelId: `lmlink/${remoteNode.id}/${remoteModel}`,
              actualCost: 0,
              queueWaitMs: 0,
              processingMs: Date.now() - startTime,
              cached: false,
            };
          }
        }
      }
    }
  } catch {
    // LM Link cluster not available, fall through to Ollama
  }

  // ── Fallback: Ollama ──
  try {
    const tagsResp = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!tagsResp.ok) {
      throw new Error(`Ollama tags: HTTP ${tagsResp.status}`);
    }
    const tagsData = (await tagsResp.json()) as { models?: { name: string }[] };
    if (!tagsData.models || tagsData.models.length === 0) {
      throw new Error("Ollama has no models loaded");
    }
    const ollamaModel = tagsData.models[0].name;

    const resp = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [
          ...(queued.systemPrompt ? [{ role: "system", content: queued.systemPrompt }] : []),
          { role: "user", content: queued.prompt },
        ],
        stream: false,
        options: { num_predict: queued.maxTokens },
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (resp.ok) {
      const data = (await resp.json()) as { message?: { content?: string } };
      return {
        response: data.message?.content ?? "",
        modelId: `ollama/${ollamaModel}`,
        actualCost: 0,
        queueWaitMs: 0,
        processingMs: Date.now() - startTime,
        cached: false,
      };
    }
  } catch {
    // Ollama not available
  }

  throw new Error("No local inference providers available");
}

/**
 * Map citizen access tier to allowed MCP tools.
 */
function getToolsForAccessTier(tier: string): string[] {
  switch (tier) {
    case "orchestrator":
      return [];
    case "expert":
      return ["query_database", "search_files", "run_code", "analyze_data"];
    case "skilled":
      return ["search_files", "query_database"];
    default:
      return [];
  }
}

/**
 * Feed LM Studio per-response stats into the compute router's health scoring.
 */
function feedTelemetry(provider: string, stats: LMStudioStats): void {
  try {
    updateProviderTelemetry(provider, {
      tokensPerSecond: stats.tokensPerSecond,
      timeToFirstTokenMs: stats.timeToFirstTokenSeconds * 1000,
      reasoningTokens: stats.reasoningOutputTokens,
      modelLoadTimeMs: stats.modelLoadTimeSeconds ? stats.modelLoadTimeSeconds * 1000 : undefined,
    });
  } catch {
    // Non-fatal
  }
}

// ─── Citizen Cost Tracking ──────────────────────────────────────

function trackCitizenCost(citizenId: string, cost: number): void {
  const today = new Date().toDateString();
  let record = citizenCosts.get(citizenId);

  if (!record || record.lastReset !== today) {
    record = { today: 0, total: record?.total ?? 0, lastReset: today };
  }

  record.today += cost;
  record.total += cost;
  citizenCosts.set(citizenId, record);
}

export function getCitizenCost(citizenId: string): { today: number; total: number } {
  const record = citizenCosts.get(citizenId);
  return { today: record?.today ?? 0, total: record?.total ?? 0 };
}

// ─── Legacy re-exports (ClawRouter stubs — keep API surface, return not-running) ───

/** @deprecated ClawRouter removed. Returns null. */
export function routeCloudInference(): null {
  return null;
}

/** @deprecated ClawRouter removed. Returns false. */
export async function isClawRouterHealthy(): Promise<boolean> {
  return false;
}

/** @deprecated ClawRouter removed. No-op. */
export async function initClawRouterBridge(): Promise<void> {
  logger.warn("initClawRouterBridge: ClawRouter has been removed");
}

/** @deprecated ClawRouter removed. No-op. */
export async function shutdownClawRouterBridge(): Promise<void> {}

/** @deprecated ClawRouter removed. Returns stub diagnostics. */
export async function getClawRouterDiagnostics(): Promise<{
  running: boolean;
  version: string;
  proxyPort: number | null;
  proxyBaseUrl: string | null;
  walletAddress: string | null;
  lmstudio: ReturnType<typeof getLMStudioDiagnostics>;
  modelPool: Awaited<ReturnType<typeof getPoolStats>>;
  queue: ReturnType<typeof getQueueStats>;
  toon: ReturnType<typeof getToonStats>;
  citizenCount: number;
}> {
  return {
    running: bridgeInitialized,
    version: "removed",
    proxyPort: null,
    proxyBaseUrl: null,
    walletAddress: null,
    lmstudio: getLMStudioDiagnostics(),
    modelPool: await getPoolStats(),
    queue: getQueueStats(),
    toon: getToonStats(),
    citizenCount: citizenCosts.size,
  };
}

/** @deprecated ClawRouter removed. Returns empty stats. */
export async function getClawRouterCostStats(): Promise<{
  today: Record<string, number>;
  allTime: Record<string, number>;
}> {
  return { today: {}, allTime: {} };
}

/** @deprecated ClawRouter/APR dashboard removed \u2014 no-op stub to preserve existing imports. */
export function recordAprDecision(_decision: {
  ts: number;
  strategy: string;
  chunkCount: number;
  costMultiplier: number;
  validationScore: number;
  usedFallback: boolean;
}): void {
  // No-op: APR telemetry recording silently dropped after ClawRouter removal
}
