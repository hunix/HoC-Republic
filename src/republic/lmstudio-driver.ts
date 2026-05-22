/**
 * Republic Platform — LM Studio v1 API Driver
 *
 * Unified adapter wrapping all LM Studio v1 REST API endpoints.
 * Transforms LM Studio from a passive inference endpoint into an actively
 * managed compute node controlled by ClawRouter.
 *
 * Capabilities:
 *   - Model lifecycle: list, load (flash_attention, KV cache), unload, download
 *   - Native v1 chat with MCP integrations, reasoning levels, vision
 *   - Stateful chat sessions (previous_response_id chaining)
 *   - Multi-instance support (multiple gateway devices)
 *   - Hardware-aware configuration (auto-detect GPU profile)
 *   - Capability detection (vision, tool_use)
 *   - Rich per-response telemetry (tokens/sec, TTFT, load time)
 */

import { emitNationalEvent } from "./event-sourcing.js";
import { getLatestSurvey } from "./hardware-manager.js";

// ─── Types ──────────────────────────────────────────────────────

export interface LMStudioInstance {
  id: string;
  host: string;
  port: number;
  baseUrl: string;
  apiToken?: string;
  status: "online" | "offline" | "unknown";
  lastSeen: number;
  loadedModels: LMStudioLoadedModel[];
  availableModels: LMStudioModelInfo[];
}

export interface LMStudioModelInfo {
  type: "llm" | "embedding";
  publisher: string;
  key: string;
  displayName: string;
  architecture: string | null;
  quantization: { name: string | null; bitsPerWeight: number | null } | null;
  sizeBytes: number;
  paramsString: string | null;
  maxContextLength: number;
  format: "gguf" | "mlx" | null;
  capabilities: { vision: boolean; trainedForToolUse: boolean } | null;
  description: string | null;
  loadedInstances: Array<{
    id: string;
    config: {
      contextLength: number;
      evalBatchSize?: number;
      flashAttention?: boolean;
      numExperts?: number;
      offloadKvCacheToGpu?: boolean;
    };
  }>;
}

export interface LMStudioLoadedModel {
  instanceId: string;
  key: string;
  displayName: string;
  contextLength: number;
  flashAttention: boolean;
  vision: boolean;
  toolUse: boolean;
}

export interface LMStudioChatRequest {
  model: string;
  input: string | Array<{ type: "message"; content: string } | { type: "image"; data_url: string }>;
  systemPrompt?: string;
  integrations?: LMStudioIntegration[];
  stream?: boolean;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repeatPenalty?: number;
  maxOutputTokens?: number;
  reasoning?: "off" | "low" | "medium" | "high" | "on";
  contextLength?: number;
  store?: boolean;
  previousResponseId?: string;
}

export type LMStudioIntegration =
  | string // Plugin shorthand (e.g., "mcp/playwright")
  | { type: "plugin"; id: string; allowed_tools?: string[] }
  | {
      type: "ephemeral_mcp";
      server_label: string;
      server_url: string;
      allowed_tools?: string[];
      headers?: Record<string, string>;
    };

export interface LMStudioChatResponse {
  modelInstanceId: string;
  output: Array<
    | { type: "message"; content: string }
    | { type: "reasoning"; content: string }
    | {
        type: "tool_call";
        tool: string;
        arguments: Record<string, unknown>;
        output: string;
        provider_info: { type: string; plugin_id?: string; server_label?: string };
      }
    | {
        type: "invalid_tool_call";
        reason: string;
        metadata: { type: string; tool_name: string; arguments?: Record<string, unknown> };
      }
  >;
  stats: LMStudioStats;
  responseId?: string;
}

export interface LMStudioStats {
  inputTokens: number;
  totalOutputTokens: number;
  reasoningOutputTokens: number;
  tokensPerSecond: number;
  timeToFirstTokenSeconds: number;
  modelLoadTimeSeconds?: number;
}

export interface LMStudioLoadConfig {
  model: string;
  contextLength?: number;
  evalBatchSize?: number;
  flashAttention?: boolean;
  numExperts?: number;
  offloadKvCacheToGpu?: boolean;
  echoLoadConfig?: boolean;
}

export interface LMStudioLoadResult {
  type: "llm" | "embedding";
  instanceId: string;
  loadTimeSeconds: number;
  status: "loaded";
  loadConfig?: Record<string, unknown>;
}

export interface LMStudioDownloadResult {
  jobId?: string;
  status: "downloading" | "paused" | "completed" | "failed" | "already_downloaded";
  totalSizeBytes?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface LMStudioDownloadStatus {
  jobId: string;
  status: "downloading" | "paused" | "completed" | "failed";
  bytesPerSecond?: number;
  estimatedCompletion?: string;
  completedAt?: string;
  totalSizeBytes?: number;
  downloadedBytes?: number;
  startedAt?: string;
}

// ─── State ──────────────────────────────────────────────────────

const instances = new Map<string, LMStudioInstance>();
let defaultInstance: LMStudioInstance | null = null;

// ─── Circuit Breaker ────────────────────────────────────────────

import { isLoadShedding } from "../infra/heap-monitor.js";

type CircuitState = "closed" | "open" | "half-open";

const _circuit = {
  state: "closed" as CircuitState,
  failures: 0,
  lastFailure: 0,
  lastSuccess: 0,
  threshold: 3,       // consecutive failures to trip
  resetMs: 60_000,    // how long to stay open before half-open probe
};

function circuitAllow(): boolean {
  if (_circuit.state === "closed") { return true; }
  if (_circuit.state === "open") {
    // Check if enough time passed → transition to half-open
    if (Date.now() - _circuit.lastFailure >= _circuit.resetMs) {
      _circuit.state = "half-open";
      return true; // Allow one probe
    }
    return false;
  }
  // half-open — allow the probe request
  return true;
}

function circuitSuccess(): void {
  if (_circuit.state !== "closed") {
    console.log(`[lmstudio-cb] Circuit CLOSED (recovered)`);
  }
  _circuit.state = "closed";
  _circuit.failures = 0;
  _circuit.lastSuccess = Date.now();
}

function circuitFailure(err: Error): void {
  _circuit.failures++;
  _circuit.lastFailure = Date.now();
  if (_circuit.state === "half-open") {
    _circuit.state = "open";
    console.warn(`[lmstudio-cb] Half-open probe failed → OPEN (${err.message})`);
  } else if (_circuit.failures >= _circuit.threshold) {
    _circuit.state = "open";
    console.warn(`[lmstudio-cb] Circuit OPEN after ${_circuit.failures} failures (${err.message})`);
  }
}

/** Check circuit breaker state — exported for monitoring */
export function getLMStudioCircuitState(): { state: CircuitState; failures: number } {
  return { state: _circuit.state, failures: _circuit.failures };
}

// ─── Safe Fetch ─────────────────────────────────────────────────

export class LMStudioError extends Error {
  constructor(
    message: string,
    public readonly code: "circuit_open" | "timeout" | "connection_refused" | "http_error" | "parse_error" | "load_shedding" | "unknown",
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LMStudioError";
  }
}

/**
 * Fault-isolated fetch wrapper for all LM Studio API calls.
 * - Checks circuit breaker before sending
 * - Catches native socket errors (connection reset, refused)
 * - Normalizes all errors into typed LMStudioError
 * - Skips requests during load shedding
 */
async function safeFetch(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  label: string,
): Promise<Response> {
  // Check load shedding (memory pressure)
  if (isLoadShedding()) {
    throw new LMStudioError(
      `Skipping ${label}: load shedding active`,
      "load_shedding",
    );
  }

  // Check circuit breaker
  if (!circuitAllow()) {
    throw new LMStudioError(
      `Skipping ${label}: circuit breaker OPEN (${_circuit.failures} failures, resets in ` +
      `${Math.max(0, Math.round((_circuit.resetMs - (Date.now() - _circuit.lastFailure)) / 1000))}s)`,
      "circuit_open",
    );
  }

  try {
    const res = await fetch(url, init);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const err = new LMStudioError(
        `${label}: HTTP ${res.status} ${errText.slice(0, 200)}`,
        "http_error",
        res.status,
      );
      // HTTP errors count as failures for the circuit
      if (res.status >= 500) { circuitFailure(err); }
      throw err;
    }

    circuitSuccess();
    return res;
  } catch (err) {
    // Already an LMStudioError — re-throw
    if (err instanceof LMStudioError) { throw err; }

    const msg = err instanceof Error ? err.message : String(err);

    // Classify the error
    if (msg.includes("abort") || msg.includes("AbortError") || msg.includes("timeout")) {
      const e = new LMStudioError(`${label}: request timed out`, "timeout");
      circuitFailure(e);
      throw e;
    }
    if (msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("EPIPE") ||
        msg.includes("fetch failed") || msg.includes("UND_ERR")) {
      const e = new LMStudioError(`${label}: connection failed (${msg.slice(0, 100)})`, "connection_refused");
      circuitFailure(e);
      throw e;
    }

    // Unknown error — still track for circuit
    const e = new LMStudioError(`${label}: ${msg.slice(0, 200)}`, "unknown");
    circuitFailure(e);
    throw e;
  }
}

// Default hardware profiles for optimal loading
const HARDWARE_PROFILES: Record<string, {
  flashAttention: boolean;
  offloadKvCacheToGpu: boolean;
  contextLength: number;
  evalBatchSize: number;
}> = {
  // ── RTX Pro 6000 Blackwell (96 GB VRAM) ─────────────────────────────
  // 96 GB easily fits 65k context with KV cache. evalBatchSize=4096 for
  // high-throughput multi-slot serving (200B models at 65k context).
  "rtx-6000-pro-96gb": {
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 65536,
    evalBatchSize: 4096,
  },
  // ── RTX 4090 / RTX Titan (24 GB VRAM) ───────────────────────────────
  // 24 GB supports 16k context with a medium model (Qwen3-30B IQ4).
  "rtx-4090-24gb": {
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
  },
  // RTX 3090 / 3090 Ti — identical VRAM to 4090, same config.
  "rtx-3090-24gb": {
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
  },
  "rtx-3090ti-24gb": {
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
  },
  // RTX Titan (Turing-era 24 GB) — same spec as modern 24 GB cards.
  "titan-rtx-24gb": {
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
  },
  "rtx-5070-8gb": {
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 2048,
    evalBatchSize: 512,
  },
  default: {
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 2048,
    evalBatchSize: 512,
  },
};

/**
 * Auto-detect GPU profile from hardware survey's gpuName field.
 * Falls back to env var GPU_PROFILE, then "default".
 */
function detectGpuProfile(): string {
  if (process.env.GPU_PROFILE) {return process.env.GPU_PROFILE;}
  const survey = getLatestSurvey();
  const name = (survey?.gpuName ?? "").toLowerCase();
  // Order matters: match more specific strings first
  if (name.includes("6000") && name.includes("pro")) {return "rtx-6000-pro-96gb";}
  if (name.includes("4090")) {return "rtx-4090-24gb";}
  // RTX 3090 Ti check must come before the plain 3090 check
  if (name.includes("3090") && (name.includes("ti") || name.includes("titan"))) {return "rtx-3090ti-24gb";}
  if (name.includes("3090")) {return "rtx-3090-24gb";}
  // RTX Titan (full product name) vs 3090 Ti (which also contains "titan" via driver name)
  if (name.includes("rtx titan") || name.includes("titan rtx")) {return "titan-rtx-24gb";}
  if (name.includes("5070")) {return "rtx-5070-8gb";}
  return "default";
}

function getGpuConfig() {
  const profile = detectGpuProfile();
  return HARDWARE_PROFILES[profile] ?? HARDWARE_PROFILES.default;
}

// ─── Instance Management ────────────────────────────────────────

/**
 * Register an LM Studio instance (gateway device).
 */
export function registerLMStudioInstance(
  host: string,
  port: number = 1234,
  apiToken?: string,
): LMStudioInstance {
  const id = `lmstudio-${host}:${port}`;
  const instance: LMStudioInstance = {
    id,
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    apiToken,
    status: "unknown",
    lastSeen: 0,
    loadedModels: [],
    availableModels: [],
  };
  instances.set(id, instance);
  if (!defaultInstance) {defaultInstance = instance;}
  return instance;
}

/**
 * Get the default (or specified) instance for API calls.
 */
function resolveInstance(instanceId?: string): LMStudioInstance {
  if (instanceId) {
    const inst = instances.get(instanceId);
    if (inst) {return inst;}
  }
  if (defaultInstance) {return defaultInstance;}

  // Auto-register localhost
  return registerLMStudioInstance("127.0.0.1", 1234);
}

function authHeaders(inst: LMStudioInstance): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (inst.apiToken) {headers["Authorization"] = `Bearer ${inst.apiToken}`;}
  return headers;
}

// ─── Model Discovery ────────────────────────────────────────────

/**
 * List all models available on an LM Studio instance.
 * Returns both downloaded (not loaded) and loaded models with full metadata.
 */
export async function listModels(
  instanceId?: string,
): Promise<LMStudioModelInfo[]> {
  const inst = resolveInstance(instanceId);

  try {
    const res = await safeFetch(`${inst.baseUrl}/api/v1/models`, {
      headers: authHeaders(inst),
      signal: AbortSignal.timeout(5000),
    }, "listModels");

    const data = (await res.json()) as { models: unknown[] };
    inst.status = "online";
    inst.lastSeen = Date.now();

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const models: LMStudioModelInfo[] = data.models.map((m: any) => ({
      type: m.type,
      publisher: m.publisher,
      key: m.key,
      displayName: m.display_name,
      architecture: m.architecture ?? null,
      quantization: m.quantization
        ? { name: m.quantization.name, bitsPerWeight: m.quantization.bits_per_weight }
        : null,
      sizeBytes: m.size_bytes,
      paramsString: m.params_string,
      maxContextLength: m.max_context_length,
      format: m.format,
      capabilities: m.capabilities
        ? { vision: m.capabilities.vision, trainedForToolUse: m.capabilities.trained_for_tool_use }
        : null,
      description: m.description,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      loadedInstances: (m.loaded_instances ?? []).map((li: any) => ({
        id: li.id,
        config: {
          contextLength: li.config.context_length,
          evalBatchSize: li.config.eval_batch_size,
          flashAttention: li.config.flash_attention,
          numExperts: li.config.num_experts,
          offloadKvCacheToGpu: li.config.offload_kv_cache_to_gpu,
        },
      })),
    }));

    inst.availableModels = models;

    // Track loaded models
    inst.loadedModels = models
      .filter((m) => m.loadedInstances.length > 0)
      .map((m) => ({
        instanceId: m.loadedInstances[0].id,
        key: m.key,
        displayName: m.displayName,
        contextLength: m.loadedInstances[0].config.contextLength,
        flashAttention: m.loadedInstances[0].config.flashAttention ?? false,
        vision: m.capabilities?.vision ?? false,
        toolUse: m.capabilities?.trainedForToolUse ?? false,
      }));

    return models;
  } catch (err) {
    inst.status = "offline";
    throw err;
  }
}

/**
 * Get currently loaded models on an instance.
 */
export function getLoadedModels(instanceId?: string): LMStudioLoadedModel[] {
  return resolveInstance(instanceId).loadedModels;
}

/**
 * Find a loaded model that has specific capabilities.
 */
export function findLoadedModel(opts: {
  vision?: boolean;
  toolUse?: boolean;
  instanceId?: string;
}): LMStudioLoadedModel | undefined {
  const loaded = getLoadedModels(opts.instanceId);
  return loaded.find((m) => {
    if (opts.vision && !m.vision) {return false;}
    if (opts.toolUse && !m.toolUse) {return false;}
    return true;
  });
}

// ─── Model Lifecycle ────────────────────────────────────────────

/**
 * Load a model into LM Studio with hardware-optimized configuration.
 */
export async function loadModel(
  config: LMStudioLoadConfig,
  instanceId?: string,
): Promise<LMStudioLoadResult> {
  const inst = resolveInstance(instanceId);

  const body: Record<string, unknown> = {
    model: config.model,
    context_length: config.contextLength ?? getGpuConfig().contextLength,
    flash_attention: config.flashAttention ?? getGpuConfig().flashAttention,
    eval_batch_size: config.evalBatchSize ?? getGpuConfig().evalBatchSize,
    offload_kv_cache_to_gpu: config.offloadKvCacheToGpu ?? getGpuConfig().offloadKvCacheToGpu,
    echo_load_config: config.echoLoadConfig ?? true,
  };

  if (config.numExperts !== undefined) {body.num_experts = config.numExperts;}

  const res = await safeFetch(`${inst.baseUrl}/api/v1/models/load`, {
    method: "POST",
    headers: authHeaders(inst),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000), // Models can take 2 min to load
  }, `loadModel(${config.model})`);

  const data = (await res.json());

  emitNationalEvent("infrastructure", "lmstudio_model_loaded", "lmstudio-driver", {
    model: config.model,
    instanceId: data.instance_id,
    loadTimeSeconds: data.load_time_seconds,
    host: inst.host,
  });

  // Refresh loaded models list
  listModels(instanceId).catch(() => {});

  return {
    type: data.type,
    instanceId: data.instance_id,
    loadTimeSeconds: data.load_time_seconds,
    status: data.status,
    loadConfig: data.load_config,
  };
}

/**
 * Unload a model from LM Studio to free VRAM.
 */
export async function unloadModel(
  modelInstanceId: string,
  instanceId?: string,
): Promise<void> {
  const inst = resolveInstance(instanceId);

  await safeFetch(`${inst.baseUrl}/api/v1/models/unload`, {
    method: "POST",
    headers: authHeaders(inst),
    body: JSON.stringify({ instance_id: modelInstanceId }),
    signal: AbortSignal.timeout(30_000),
  }, `unloadModel(${modelInstanceId})`);

  emitNationalEvent("infrastructure", "lmstudio_model_unloaded", "lmstudio-driver", {
    instanceId: modelInstanceId,
    host: inst.host,
  });

  // Remove from loaded list
  inst.loadedModels = inst.loadedModels.filter((m) => m.instanceId !== modelInstanceId);
}

/**
 * Download a model via LM Studio's catalog or HuggingFace URL.
 */
export async function downloadModel(
  model: string,
  quantization?: string,
  instanceId?: string,
): Promise<LMStudioDownloadResult> {
  const inst = resolveInstance(instanceId);

  const body: Record<string, unknown> = { model };
  if (quantization) {body.quantization = quantization;}

  const res = await safeFetch(`${inst.baseUrl}/api/v1/models/download`, {
    method: "POST",
    headers: authHeaders(inst),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }, `downloadModel(${model})`);

  const data = (await res.json());

  if (data.status === "downloading") {
    emitNationalEvent("infrastructure", "lmstudio_model_downloading", "lmstudio-driver", {
      model,
      jobId: data.job_id,
      totalSizeBytes: data.total_size_bytes,
    });
  }

  return {
    jobId: data.job_id,
    status: data.status,
    totalSizeBytes: data.total_size_bytes,
    startedAt: data.started_at,
    completedAt: data.completed_at,
  };
}

/**
 * Check download progress.
 */
export async function getDownloadStatus(
  jobId: string,
  instanceId?: string,
): Promise<LMStudioDownloadStatus> {
  const inst = resolveInstance(instanceId);

  const res = await safeFetch(
    `${inst.baseUrl}/api/v1/models/download/status/${jobId}`,
    {
      headers: authHeaders(inst),
      signal: AbortSignal.timeout(5000),
    },
    `downloadStatus(${jobId})`,
  );

  const data = (await res.json());
  return {
    jobId: data.job_id,
    status: data.status,
    bytesPerSecond: data.bytes_per_second,
    estimatedCompletion: data.estimated_completion,
    completedAt: data.completed_at,
    totalSizeBytes: data.total_size_bytes,
    downloadedBytes: data.downloaded_bytes,
    startedAt: data.started_at,
  };
}

// ─── Native v1 Chat ─────────────────────────────────────────────

/**
 * Send a chat message using LM Studio's native v1 API.
 *
 * Supports: MCP integrations, reasoning levels, vision, stateful sessions.
 * This is the preferred endpoint over OpenAI-compat for LM Studio features.
 */
export async function chat(
  request: LMStudioChatRequest,
  instanceId?: string,
): Promise<LMStudioChatResponse> {
  const inst = resolveInstance(instanceId);

  const body: Record<string, unknown> = {
    model: request.model,
    input: request.input,
  };

  if (request.systemPrompt) {body.system_prompt = request.systemPrompt;}
  if (request.integrations?.length) {body.integrations = request.integrations;}
  if (request.stream !== undefined) {body.stream = request.stream;}
  if (request.temperature !== undefined) {body.temperature = request.temperature;}
  if (request.topP !== undefined) {body.top_p = request.topP;}
  if (request.topK !== undefined) {body.top_k = request.topK;}
  if (request.minP !== undefined) {body.min_p = request.minP;}
  if (request.repeatPenalty !== undefined) {body.repeat_penalty = request.repeatPenalty;}
  if (request.maxOutputTokens !== undefined) {body.max_output_tokens = request.maxOutputTokens;}
  if (request.reasoning !== undefined) {body.reasoning = request.reasoning;}
  if (request.contextLength !== undefined) {body.context_length = request.contextLength;}
  if (request.store !== undefined) {body.store = request.store;}
  if (request.previousResponseId) {body.previous_response_id = request.previousResponseId;}

  const res = await safeFetch(`${inst.baseUrl}/api/v1/chat`, {
    method: "POST",
    headers: authHeaders(inst),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000), // 3 min for MCP tool calls
  }, `chat(${request.model})`);

  const data = (await res.json());

  return {
    modelInstanceId: data.model_instance_id,
    output: data.output,
    stats: {
      inputTokens: data.stats.input_tokens,
      totalOutputTokens: data.stats.total_output_tokens,
      reasoningOutputTokens: data.stats.reasoning_output_tokens,
      tokensPerSecond: data.stats.tokens_per_second,
      timeToFirstTokenSeconds: data.stats.time_to_first_token_seconds,
      modelLoadTimeSeconds: data.stats.model_load_time_seconds,
    },
    responseId: data.response_id,
  };
}

/**
 * Extract the text message content from a chat response.
 */
export function extractMessageContent(response: LMStudioChatResponse): string {
  return response.output
    .filter((o): o is { type: "message"; content: string } => o.type === "message")
    .map((o) => o.content)
    .join("\n");
}

/**
 * Extract reasoning content from a chat response.
 */
export function extractReasoningContent(response: LMStudioChatResponse): string {
  return response.output
    .filter((o): o is { type: "reasoning"; content: string } => o.type === "reasoning")
    .map((o) => o.content)
    .join("\n");
}

/**
 * Extract tool calls from a chat response.
 */
export function extractToolCalls(
  response: LMStudioChatResponse,
): Array<{ tool: string; arguments: Record<string, unknown>; output: string }> {
  return response.output
    .filter((o): o is Extract<LMStudioChatResponse["output"][number], { type: "tool_call" }> =>
      o.type === "tool_call",
    )
    .map((o) => ({ tool: o.tool, arguments: o.arguments, output: o.output }));
}

// ─── Stateful Session Management ────────────────────────────────

/** Per-citizen session state: maps citizenId → last response_id */
const citizenSessions = new Map<string, { responseId: string; model: string; lastUsed: number }>();

/**
 * Send a chat message with automatic stateful session continuation.
 * If the citizen has an active session, uses previous_response_id
 * to avoid re-sending the entire conversation history.
 */
export async function chatStateful(
  citizenId: string,
  request: Omit<LMStudioChatRequest, "previousResponseId" | "store">,
  instanceId?: string,
): Promise<LMStudioChatResponse> {
  const session = citizenSessions.get(citizenId);

  const fullRequest: LMStudioChatRequest = {
    ...request,
    store: true,
    // Only chain if same model and session isn't stale (30 min)
    previousResponseId:
      session && session.model === request.model && Date.now() - session.lastUsed < 30 * 60 * 1000
        ? session.responseId
        : undefined,
  };

  const response = await chat(fullRequest, instanceId);

  // Update session
  if (response.responseId) {
    citizenSessions.set(citizenId, {
      responseId: response.responseId,
      model: request.model,
      lastUsed: Date.now(),
    });
  }

  return response;
}

/**
 * Clear a citizen's chat session.
 */
export function clearCitizenSession(citizenId: string): void {
  citizenSessions.delete(citizenId);
}

/**
 * Clean up stale sessions (called periodically).
 */
export function cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): number {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of citizenSessions) {
    if (now - session.lastUsed > maxAgeMs) {
      citizenSessions.delete(id);
      cleaned++;
    }
  }
  return cleaned;
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getLMStudioInstances(): LMStudioInstance[] {
  return [...instances.values()];
}

export function getActiveSessions(): number {
  return citizenSessions.size;
}

export interface LMStudioDiagnostics {
  instanceCount: number;
  onlineCount: number;
  totalLoadedModels: number;
  totalAvailableModels: number;
  activeSessions: number;
  instances: Array<{
    id: string;
    host: string;
    status: string;
    loadedCount: number;
    availableCount: number;
  }>;
  gpuProfile: string;
}

export function getLMStudioDiagnostics(): LMStudioDiagnostics {
  const insts = [...instances.values()];
  return {
    instanceCount: insts.length,
    onlineCount: insts.filter((i) => i.status === "online").length,
    totalLoadedModels: insts.reduce((sum, i) => sum + i.loadedModels.length, 0),
    totalAvailableModels: insts.reduce((sum, i) => sum + i.availableModels.length, 0),
    activeSessions: citizenSessions.size,
    instances: insts.map((i) => ({
      id: i.id,
      host: `${i.host}:${i.port}`,
      status: i.status,
      loadedCount: i.loadedModels.length,
      availableCount: i.availableModels.length,
    })),
    gpuProfile: detectGpuProfile(),
  };
}

// ─── LM Link Cluster Bridge ─────────────────────────────────────

/**
 * Re-export GPU profiles from the LM Link cluster for callers that only
 * import lmstudio-driver (backward-compat, avoids a second import path).
 */
export { LM_LINK_GPU_PROFILES, type GpuProfileKey } from "./lmlink-cluster.js";

/**
 * Probe all registered LM Link cluster nodes in parallel.
 * Thin wrapper over the cluster's own `probeAllNodes()` so callers that
 * only hold a reference to lmstudio-driver don't need a second import.
 */
export async function probeAllInstances(): Promise<void> {
  const { probeAllNodes } = await import("./lmlink-cluster.js");
  await probeAllNodes();
}

