/**
 * rpc-registry.ts
 *
 * Machine-readable catalog of every HoC gateway RPC method.
 *
 * ## Purpose for AI Reasoning
 * When Claude Sonnet (thinking mode) generates or reviews gateway code it
 * reads this file to understand:
 *
 *  1. **What each method does** (`description`)
 *  2. **What params it expects** (`params` — references a named type in rpc-params.ts)
 *  3. **What a success response looks like** (`returns` — concrete example shape)
 *  4. **Whether it is read-only** (`readonly` — safe to call without side-effects)
 *
 * This eliminates the need to grep handler implementations just to understand
 * the contract of a method.
 *
 * ## Usage in handler files
 * ```ts
 * import { respondOk, respondErr } from "./rpc-registry.js";
 * // replaces: respond(true, { ... }, undefined)
 * respondOk(respond, { sessions: [...] });
 * ```
 */

import type {
  ChatSendParams,
  ChatHistoryParams,
  ChatAbortParams,
  ConfigSetEnvParams,
  ConfigRestartParams,
  ConfigFormSaveParams,
  CronRunParams,
  CronListParams,
  CronJobCreateParams,
  CronJobPatchParams,
  CronJobDeleteParams,
  NodeRegisterParams,
  NodePairApproveParams,
  NodeIdParams,
  NodeDispatchParams,
  UpdateInstallParams,
  ModelDownloadParams,
  ModelDeleteParams,
  ChannelsProbeParams,
  ChannelAccountParams,
  SessionsListParams,
  SessionPatchParams,
  AgentsListParams,
  SkillsListParams,
  SkillsExecuteParams,
  SupabaseConnectParams,
  EmptyParams,
} from "./rpc-params.js";
import type { RespondFn } from "./types.js";

// ─── Typed respond helpers ────────────────────────────────────────────────────

/**
 * Strongly-typed success response helper.
 * Replaces the ubiquitous `respond(true, { ... }, undefined)` pattern.
 *
 * @example
 * respondOk(respond, { sessions: [], total: 0 });
 */
export function respondOk<T>(respond: RespondFn, payload: T): void {
  respond(true, payload, undefined);
}

/**
 * Strongly-typed error response helper.
 * Replaces `respond(false, undefined, errorShape(...))`.
 *
 * @example
 * respondErr(respond, ErrorCodes.INVALID_REQUEST, "sessionKey required");
 */
export function respondErr(respond: RespondFn, code: string, message: string): void {
  respond(false, undefined, { code, message });
}

// ─── Method descriptor type ───────────────────────────────────────────────────

/**
 * Describes one RPC method's interface contract.
 * The `params` and `returns` fields are TypeScript type references (strings)
 * used purely as documentation anchors for the thinking model.
 */
export interface RpcMethodDescriptor<TParams = unknown, TReturn = unknown> {
  /** Human-readable explanation of what the method does. */
  description: string;
  /** True if the method never mutates state (safe for polling). */
  readonly?: boolean;
  /** Example of a valid params object for this method. */
  paramsExample?: TParams;
  /** Shape of a successful response payload. */
  returns?: TReturn;
  /** Tags for grouping / filtering (e.g. "chat", "config", "admin"). */
  tags?: string[];
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Complete catalog of HoC gateway RPC methods.
 *
 * Key  = exact method name string (must match `defineHandlers` key exactly).
 * Value = `RpcMethodDescriptor` documenting the contract.
 */
export const RPC_REGISTRY: Record<string, RpcMethodDescriptor> = {
  // ── System ─────────────────────────────────────────────────────────────────

  "system.status": {
    description:
      "Return gateway health summary: uptime, model, memory, connected nodes, and active sessions.",
    readonly: true,
    tags: ["system"],
    returns: { ok: true, version: "2026.x.x", uptime: 12345, sessions: 0, nodes: 0 },
  },

  "system.models": {
    description: "List all models available to the gateway (local GGUF, Ollama, cloud APIs).",
    readonly: true,
    tags: ["system", "models"],
    returns: { models: [{ id: "claude-sonnet-4-5", provider: "anthropic", available: true }] },
  },

  "system.health": {
    description:
      "Run a full health check including hardware, disk, model connectivity, and channels.",
    readonly: true,
    tags: ["system"],
    returns: { ok: true, checks: [], score: 100 },
  },

  // ── Config ─────────────────────────────────────────────────────────────────

  "config.get": {
    description:
      "Return the current gateway config as a redacted JSON object with a content hash. Use the hash as `baseHash` in subsequent write calls.",
    readonly: true,
    tags: ["config"],
    returns: { ok: true, config: {}, hash: "sha256hex", exists: true },
  },

  "config.env.get": {
    description: "Return selected environment variable values visible to the gateway process.",
    readonly: true,
    tags: ["config"],
    returns: { env: { SUPABASE_URL: "", HOC_INSTANCE_ID: "" } },
  },

  "config.env.set": {
    description:
      "Write key=value pairs to the global .env file and apply immediately to process.env. No restart needed for most keys.",
    paramsExample: {
      env: { SUPABASE_URL: "https://xxx.supabase.co" },
    } satisfies ConfigSetEnvParams,
    tags: ["config"],
    returns: { ok: true, written: ["SUPABASE_URL"] },
  },

  "config.apply": {
    description:
      "Validate and apply a pending config change, then schedule a process restart via SIGUSR1.",
    paramsExample: { note: "enable WhatsApp", restartDelayMs: 2000 } satisfies ConfigRestartParams,
    tags: ["config", "admin"],
    returns: { ok: true, restart: { scheduledAt: 1234, delayMs: 2000 } },
  },

  "config.patch": {
    description:
      "Apply a JSON Merge Patch (RFC 7396) to the live config and write the result to disk.",
    paramsExample: {
      patch: { llm: { model: "claude-sonnet-4-5" } },
    } satisfies ConfigFormSaveParams,
    tags: ["config"],
    returns: { ok: true, hash: "sha256hex" },
  },

  // ── Chat ───────────────────────────────────────────────────────────────────

  "chat.send": {
    description:
      "Send a user message and start an AI inference run. Emits `chat.delta` events on the WebSocket then `chat.done`.",
    paramsExample: {
      sessionKey: "global",
      message: "What is the capital of France?",
      thinkingLevel: "medium",
    } satisfies ChatSendParams,
    tags: ["chat"],
    returns: { ok: true, runId: "uuid", sessionKey: "global" },
  },

  "chat.history": {
    description: "Fetch recent messages for a session in descending order (newest first).",
    readonly: true,
    paramsExample: { sessionKey: "global", limit: 50 } satisfies ChatHistoryParams,
    tags: ["chat"],
    returns: { messages: [{ role: "user", content: "Hello", ts: 1234 }] },
  },

  "chat.abort": {
    description: "Cancel one or all active inference runs in a session.",
    paramsExample: { sessionKey: "global" } satisfies ChatAbortParams,
    tags: ["chat"],
    returns: { ok: true, aborted: 1 },
  },

  // ── Cron ───────────────────────────────────────────────────────────────────

  wake: {
    description:
      "Trigger the cron scheduler heartbeat manually, forcing immediate evaluation of due jobs.",
    paramsExample: { mode: "now", text: "manual trigger" } satisfies CronRunParams,
    tags: ["cron"],
    returns: { ok: true, evaluated: 3, triggered: 1 },
  },

  "cron.list": {
    description: "List all scheduled cron jobs with their next run time and status.",
    readonly: true,
    paramsExample: { includeDisabled: false } satisfies CronListParams,
    tags: ["cron"],
    returns: { jobs: [{ id: "uuid", text: "Daily backup", enabled: true, nextAt: 1234 }] },
  },

  "cron.add": {
    description:
      "Create a new cron job. `text` is an English task description; `cron` is a cron expression or ISO duration.",
    paramsExample: {
      text: "send daily digest",
      cron: "0 9 * * *",
      timezone: "Asia/Riyadh",
    } satisfies CronJobCreateParams,
    tags: ["cron"],
    returns: { id: "uuid", text: "send daily digest", cron: "0 9 * * *" },
  },

  "cron.update": {
    description: "Patch fields of an existing cron job by ID.",
    paramsExample: { id: "uuid", patch: { enabled: false } } satisfies CronJobPatchParams,
    tags: ["cron"],
    returns: { ok: true, job: {} },
  },

  "cron.remove": {
    description: "Delete a cron job permanently.",
    paramsExample: { id: "uuid" } satisfies CronJobDeleteParams,
    tags: ["cron"],
    returns: { ok: true, deleted: "uuid" },
  },

  // ── Nodes ──────────────────────────────────────────────────────────────────

  "node.pair.request": {
    description:
      "Register a new HoC satellite node and request a pairing approval from the gateway admin.",
    paramsExample: {
      nodeId: "machine-uuid",
      displayName: "Lab PC",
      platform: "linux",
    } satisfies NodeRegisterParams,
    tags: ["nodes"],
    returns: { status: "pending", requestId: "uuid" },
  },

  "node.pair.approve": {
    description:
      "Approve a pending node pairing request. The node is granted access after approval.",
    paramsExample: { requestId: "uuid" } satisfies NodePairApproveParams,
    tags: ["nodes", "admin"],
    returns: { ok: true, nodeId: "machine-uuid" },
  },

  "node.pair.reject": {
    description: "Reject a pending node pairing request.",
    paramsExample: { requestId: "uuid" } satisfies NodePairApproveParams,
    tags: ["nodes", "admin"],
    returns: { ok: true, requestId: "uuid" },
  },

  "node.list": {
    description: "List all known nodes (both paired and currently connected).",
    readonly: true,
    tags: ["nodes"],
    returns: {
      nodes: [{ nodeId: "uuid", displayName: "Lab PC", connected: true, paired: true }],
      ts: 1234,
    },
  },

  "node.invoke": {
    description:
      "Dispatch a command to a connected node and await its result within a timeout window.",
    paramsExample: {
      nodeId: "uuid",
      command: "shell.run",
      params: { cmd: "df -h" },
    } satisfies NodeDispatchParams,
    tags: ["nodes"],
    returns: { ok: true, nodeId: "uuid", command: "shell.run", payload: {} },
  },

  "node.workloads.pause": {
    description: "Pause a running workload on any node.",
    paramsExample: { id: "wl-uuid" } satisfies NodeIdParams,
    tags: ["nodes"],
    returns: { ok: true, id: "wl-uuid", status: "paused" },
  },

  "node.workloads.resume": {
    description: "Resume a paused workload on any node.",
    paramsExample: { id: "wl-uuid" } satisfies NodeIdParams,
    tags: ["nodes"],
    returns: { ok: true, id: "wl-uuid", status: "running" },
  },

  // ── Update ─────────────────────────────────────────────────────────────────

  "update.run": {
    description:
      "Pull the latest gateway code (npm update / git pull) and restart the process. Returns update steps and result status.",
    paramsExample: { note: "scheduled update", restartDelayMs: 3000 } satisfies UpdateInstallParams,
    tags: ["admin", "system"],
    returns: {
      ok: true,
      result: { status: "updated", before: "2026.2.0", after: "2026.3.0" },
      restart: {},
    },
  },

  // ── Models Manager ─────────────────────────────────────────────────────────

  "models.manager.catalog": {
    description:
      "Return the full local model catalog with download status, disk size, and RAM requirements.",
    readonly: true,
    tags: ["models"],
    returns: {
      models: [{ id: "llama-3.2-3b-q5km", status: "downloaded", sizeBytes: 2200000000 }],
      freeRamGB: 16,
    },
  },

  "models.manager.download": {
    description:
      "Start a background HuggingFace download for a model. Poll progress via `models.manager.progress`.",
    paramsExample: { id: "llama-3.2-3b-q5km", hfToken: "hf_..." } satisfies ModelDownloadParams,
    tags: ["models"],
    returns: { started: true, modelId: "llama-3.2-3b-q5km" },
  },

  "models.manager.delete": {
    description: "Delete a downloaded model file from disk.",
    paramsExample: { id: "llama-3.2-3b-q5km" } satisfies ModelDeleteParams,
    tags: ["models", "admin"],
    returns: { deleted: true, path: "/models/gguf/llama-3.2-3b-q5km/..." },
  },

  "models.manager.progress": {
    description: "Get current download progress for all active model downloads.",
    readonly: true,
    tags: ["models"],
    returns: {
      progress: { "llama-3.2-3b-q5km": { progress: 42, speed: 12.5, totalBytes: 2200000000 } },
    },
  },

  "models.manager.cancel": {
    description: "Cancel an active model download.",
    tags: ["models"],
    returns: { cancelled: true, modelId: "llama-3.2-3b-q5km" },
  },

  "models.manager.pause": {
    description: "Pause an active model download. The partial file is preserved for resume.",
    tags: ["models"],
    returns: { paused: true, modelId: "llama-3.2-3b-q5km", downloadedBytes: 1100000000 },
  },

  "models.manager.resume": {
    description: "Resume a paused model download from where it left off.",
    tags: ["models"],
    returns: { resumed: true, modelId: "llama-3.2-3b-q5km" },
  },

  "models.manager.prerequisites": {
    description:
      "Check system prerequisites for model execution: Python, PyTorch, CUDA, git, huggingface-cli, Ollama, HF token.",
    readonly: true,
    tags: ["models", "system"],
    returns: {
      prerequisites: {
        python: { available: true, version: "Python 3.11.2" },
        cuda: { available: true, version: "PyTorch 2.3 CUDA=True" },
        git: { available: true, version: "git version 2.43.0" },
      },
    },
  },

  "models.manager.lmstudio.list": {
    description: "List GGUF model files found in the LM Studio models directory.",
    readonly: true,
    tags: ["models"],
    returns: { models: [{ name: "llama-3.2-3b.Q5_K_M.gguf", path: "...", sizeBytes: 2200000000 }], lmStudioDir: "..." },
  },

  "models.manager.restore": {
    description: "Restore paused downloads from persisted state on gateway boot.",
    tags: ["models"],
    returns: { restored: 2 },
  },

  "models.manager.disk": {
    description: "Get disk usage summary for model storage directories.",
    readonly: true,
    tags: ["models"],
    returns: { totalGB: 42.5, bitnetGB: 2.1, ggufGB: 18.0, pluginGB: 22.4, dataDir: "..." },
  },

  "models.manager.resolve": {
    description: "Resolve a model's local path and download status by model id or pluginId. Returns path, exists flag, and status for each matching model.",
    readonly: true,
    tags: ["models"],
    returns: { models: [{ id: "bark-tts", name: "Bark TTS", localPath: "...", exists: true, status: "downloaded", sizeBytes: 22000000000 }] },
  },

  "models.manager.ensure": {
    description: "Ensure a model is available locally. If downloaded, returns path immediately. If not, starts a queued download and returns downloading status. Plugins should call this before inference.",
    tags: ["models"],
    returns: { ready: true, localPath: "~/.cache/huggingface/hub/models--suno--bark/snapshots/main/text.pt", status: "downloaded" },
  },

  "models.manager.config": {
    description: "Configure download manager settings: max concurrent downloads (1-10) and bandwidth limit in MB/s (0 = unlimited).",
    tags: ["models", "admin"],
    returns: { maxConcurrent: 3, bandwidthLimitMBps: 0, activeDownloads: 1, queuedDownloads: 2 },
  },

  "models.manager.plugin.requirements": {
    description: "List all models required by a specific plugin, including their download status and local paths.",
    readonly: true,
    tags: ["models", "plugins"],
    returns: { pluginId: "bark", models: [{ id: "bark-tts", exists: true, status: "downloaded", localPath: "..." }] },
  },

  "models.manager.plugin.status": {
    description: "Get readiness summary for a plugin — how many required models are downloaded vs downloading vs available.",
    readonly: true,
    tags: ["models", "plugins"],
    returns: { pluginId: "bark", total: 1, ready: 1, downloading: 0, paused: 0, allReady: true, models: [] },
  },

  // ── Channels ───────────────────────────────────────────────────────────────

  "channels.status": {
    description:
      "Return status snapshot for all configured messaging channels (Nostr, WhatsApp, Telegram, etc.). Set `probe: true` to run live connectivity checks.",
    readonly: true,
    paramsExample: { probe: false, timeoutMs: 10000 } satisfies ChannelsProbeParams,
    tags: ["channels"],
    returns: { channels: {}, channelAccounts: {}, ts: 1234 },
  },

  "channels.logout": {
    description: "Log out and clear credentials for a specific channel account.",
    paramsExample: { accountId: "default" } satisfies ChannelAccountParams,
    tags: ["channels"],
    returns: { channel: "whatsapp", accountId: "default", cleared: true },
  },

  // ── Sessions ───────────────────────────────────────────────────────────────

  "sessions.list": {
    description: "List all chat sessions with metadata (title, last message, agent, model).",
    readonly: true,
    paramsExample: { limit: 100, active: "true" } satisfies SessionsListParams,
    tags: ["sessions"],
    returns: { sessions: [{ sessionKey: "global", title: "Main chat" }], total: 1 },
  },

  "sessions.patch": {
    description:
      "Update metadata on an existing session (e.g. rename, change model or system prompt).",
    paramsExample: {
      sessionKey: "global",
      patch: { title: "HoC Debug" },
    } satisfies SessionPatchParams,
    tags: ["sessions"],
    returns: { ok: true },
  },

  // ── Agents ─────────────────────────────────────────────────────────────────

  "agents.list": {
    description: "List all citizen agents with their configuration and last-active timestamps.",
    readonly: true,
    paramsExample: { limit: 200, offset: 0 } satisfies AgentsListParams,
    tags: ["agents"],
    returns: { agents: [{ agentId: "uuid", name: "Alpha", status: "idle" }], total: 1 },
  },

  // ── Skills ─────────────────────────────────────────────────────────────────

  "skills.list": {
    description: "Enumerate available skills (callable tools) for the given agent or globally.",
    readonly: true,
    paramsExample: { includeDisabled: false } satisfies SkillsListParams,
    tags: ["skills"],
    returns: { skills: [{ skillKey: "web.search", description: "Search the web" }] },
  },

  "skills.execute": {
    description: "Execute a named skill synchronously and return the result payload.",
    paramsExample: {
      skillKey: "web.search",
      args: { query: "HoC gateway" },
    } satisfies SkillsExecuteParams,
    tags: ["skills"],
    returns: { ok: true, skillKey: "web.search", result: {} },
  },

  // ── Supabase Command Center ─────────────────────────────────────────────────

  "supabase.status": {
    description:
      "Return current status of the Supabase connector: connected, instance ID, heartbeat time, and recent command activity.",
    readonly: true,
    tags: ["supabase"],
    returns: {
      ok: true,
      status: { connected: false, instanceId: null, commandsProcessed: 0, error: null },
      activity: [],
    },
  },

  "supabase.connect": {
    description:
      "Start the outbound Supabase connector using the supplied credentials. Subscribes to Realtime Broadcast and Postgres Changes.",
    paramsExample: {
      supabaseUrl: "https://xyz.supabase.co",
      supabaseKey: "eyJ...",
    } satisfies SupabaseConnectParams,
    tags: ["supabase"],
    returns: { ok: true },
  },

  "supabase.disconnect": {
    description: "Stop the Supabase connector and unsubscribe from all Realtime channels.",
    paramsExample: {} as EmptyParams,
    tags: ["supabase"],
    returns: { ok: true },
  },

  "supabase.test": {
    description: "Verify the Supabase connection is alive by checking heartbeat latency.",
    readonly: true,
    tags: ["supabase"],
    returns: { ok: true, connected: true, latencyMs: 45 },
  },
};

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Look up a method descriptor by name.
 * Returns `undefined` if the method is not registered.
 *
 * @example
 * const desc = lookupMethod("chat.send");
 * console.log(desc?.description);
 */
export function lookupMethod(method: string): RpcMethodDescriptor | undefined {
  return RPC_REGISTRY[method];
}

/**
 * Return all registered method names matching one or more tags.
 *
 * @example
 * const chatMethods = methodsByTag("chat"); // ["chat.send", "chat.history", "chat.abort"]
 */
export function methodsByTag(...tags: string[]): string[] {
  return Object.entries(RPC_REGISTRY)
    .filter(([, d]) => d.tags?.some((t) => tags.includes(t)))
    .map(([method]) => method);
}

/**
 * Return a compact markdown summary of all registered methods.
 * Useful as a system prompt injection for a thinking model.
 *
 * @example
 * const prompt = buildRpcManifest();
 * // "## HoC Gateway RPC Methods\n\n**chat.send** — Send a user message...\n..."
 */
export function buildRpcManifest(): string {
  const lines = ["## HoC Gateway RPC Methods\n"];
  for (const [method, desc] of Object.entries(RPC_REGISTRY)) {
    lines.push(`**${method}**${desc.readonly ? " _(read-only)_" : ""} — ${desc.description}`);
    if (desc.paramsExample) {
      lines.push(`  Params: \`${JSON.stringify(desc.paramsExample)}\``);
    }
    if (desc.tags?.length) {
      lines.push(`  Tags: ${desc.tags.join(", ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
