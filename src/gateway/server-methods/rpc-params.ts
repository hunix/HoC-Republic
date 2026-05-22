/**
 * rpc-params.ts
 *
 * Centralized TypeScript interfaces for all gateway RPC method parameters.
 *
 * ## Design Intent for AI Reasoning
 * Each interface documents **exactly** what a caller must supply for a method.
 * Field-level JSDoc describes validation rules, defaults, and units so a
 * language model can generate correct call-sites without guessing.
 *
 * Convention:
 *  - Optional fields are always marked `?`.
 *  - Units and ranges are documented inline (e.g. `0–1000` for timeoutMs).
 *  - Unknown / flexible user payloads use `Record<string, unknown>` explicitly.
 */

// ─── Config ────────────────────────────────────────────────────────────────────

/**
 * Identifies the currently loaded config version by hash.
 * Required by `config.set` / `config.patch` / `config.apply` to
 * detect concurrent edits and prevent overwriting unseen changes.
 */
export interface ConfigUpdateBaseHashParams {
  /** SHA-256 hex string returned by the last `config.get` call. */
  baseHash?: string;
}

/**
 * Write one or more key=value pairs to the gateway's `.env` file
 * and apply them to `process.env` immediately (no restart needed
 * for most keys; gateway restart required for API keys / URLs).
 */
export interface ConfigSetEnvParams {
  /**
   * Map of environment variable names → new string values.
   * @example { "SUPABASE_URL": "https://xxx.supabase.co", "OPENAI_API_KEY": "sk-..." }
   */
  env: Record<string, string>;
}

/**
 * Shared tail of params accepted by `config.apply` / `update.run`
 * that controls optional restart behaviour and audit notes.
 */
export interface ConfigRestartParams {
  /**
   * Session key to attribute the restart to (for audit logs).
   * If omitted, restart is attributed to the system.
   */
  sessionKey?: string;
  /**
   * Milliseconds to delay the SIGUSR1 restart signal.
   * Range: 0 – 60 000. Default: 1 500 ms.
   */
  restartDelayMs?: number;
  /**
   * Human-readable note stored in the restart sentinel file.
   * Shown in the gateway boot log and health UI.
   */
  note?: string;
}

export interface ConfigRawSaveParams {
  /** Raw JSON5 string to write to the config file verbatim. */
  raw: string;
  /** Optional audit note. */
  note?: string;
}

export interface ConfigFormSaveParams {
  /** JSON Merge Patch (RFC 7396) object to apply over the current config. */
  patch: Record<string, unknown>;
  /** Optional audit note. */
  note?: string;
}

// ─── Chat ──────────────────────────────────────────────────────────────────────

/**
 * Paginated history fetch for a conversation session.
 * Returns messages in descending chronological order.
 */
export interface ChatHistoryParams {
  /** Unique session identifier (e.g. `"global"` or `"agent:<id>"`). */
  sessionKey: string;
  /** Maximum number of messages to return. Default: 200, max: 1000. */
  limit?: number;
}

/**
 * Abort one or all in-flight runs in a session.
 * If `runId` is omitted, all active runs for the session are cancelled.
 */
export interface ChatAbortParams {
  /** Session to abort runs in. */
  sessionKey: string;
  /** Specific run UUID to cancel. Omit to cancel all. */
  runId?: string;
}

/**
 * Send a new user message and begin an AI inference run.
 * Returns a stream of `chat.delta` events followed by `chat.done`.
 */
export interface ChatSendParams {
  /** Target session. */
  sessionKey: string;
  /** User message text. Must be non-empty. */
  message: string;
  /** Client-assigned run id for deduplication. Auto-generated if absent. */
  runId?: string;
  /** Base64-encoded or URL file attachments. */
  attachments?: unknown[];
  /** Override the session's configured model (e.g. `"claude-sonnet-4-5"`). */
  model?: string;
  /**
   * Thinking level: `"none"` | `"low"` | `"medium"` | `"high"`.
   * Maps to token budget for extended thinking on supported models.
   */
  thinkingLevel?: "none" | "low" | "medium" | "high";
}

// ─── Nodes ─────────────────────────────────────────────────────────────────────

/**
 * Register an HoC node (satellite gateway) and initiate pairing.
 * The gateway responds with a pending pairing request that must be
 * approved via `node.pair.approve` before the node can invoke commands.
 */
export interface NodeRegisterParams {
  /** Stable, unique node identifier (UUID or machine ID). */
  nodeId: string;
  /** Human-readable label shown in the Nodes UI. */
  displayName?: string;
  /** OS platform string (e.g. `"win32"`, `"linux"`, `"darwin"`). */
  platform?: string;
  /** Semver version of the node software. */
  version?: string;
  /** Optional JSON payload sent with the initial pair.request. */
  payloadJSON?: string | null;
}

/**
 * Approve or reject a pending node pairing request by its request id.
 * Returned by `node.pair.list` entries as `requestId`.
 */
export interface NodePairApproveParams {
  /** UUID of the pending pairing request. */
  requestId: string;
}

/** Generic single-node selector used by workload control methods. */
export interface NodeIdParams {
  /** UUID or stable node identifier. */
  id: string;
}

export interface NodeWorkloadParams {
  nodeId: string;
  workloadId?: string;
}

export interface NodeDispatchParams {
  nodeId: string;
  command: string;
  params?: Record<string, unknown>;
}

// ─── Cron ──────────────────────────────────────────────────────────────────────

/**
 * Trigger a wake / heartbeat event on the cron scheduler.
 * Used to force immediate job evaluation without waiting for the next tick.
 *
 * @example { mode: "now", text: "manual trigger from UI" }
 */
export interface CronRunParams {
  /**
   * `"now"` — evaluate all due jobs immediately.
   * `"next-heartbeat"` — evaluate at the next scheduled heartbeat interval.
   */
  mode: "now" | "next-heartbeat";
  /** Descriptive label stored in the run log. */
  text: string;
  /** Optional cron expression override (ISO 8601 interval or cron string). */
  cron?: string;
  /** IANA timezone name (e.g. `"America/New_York"`). Default: `"UTC"`. */
  timezone?: string;
}

/** Filter options for `cron.list`. */
export interface CronListParams {
  /** Include disabled jobs in the result. Default: `false`. */
  includeDisabled?: boolean;
}

export interface CronJobPatchParams {
  id: string;
  patch: Record<string, unknown>;
}

export interface CronJobDeleteParams {
  id: string;
}

export interface CronJobCreateParams {
  text: string;
  cron: string;
  timezone?: string;
  enabled?: boolean;
  agentId?: string;
}

export interface CronJobToggleParams {
  id: string;
  enabled: boolean;
}

// ─── Update ────────────────────────────────────────────────────────────────────

/**
 * Run `npm update` / `git pull` on the gateway package and optionally
 * restart the process afterwards with a configurable delay.
 *
 * On success the gateway will restart automatically (`SIGUSR1`).
 */
export interface UpdateInstallParams {
  /** Session key for audit attribution. */
  sessionKey?: string;
  /** Audit note written to the restart sentinel file. */
  note?: string;
  /**
   * Milliseconds to wait before sending SIGUSR1 after the update.
   * Range: 0 – 60 000. Default: 1 500 ms.
   */
  restartDelayMs?: number;
  /**
   * Hard timeout for the npm/git subprocess in milliseconds.
   * Default: 300 000 (5 min). Min: 1 000.
   */
  timeoutMs?: number;
  /** Account ID for licensing / telemetry (optional). */
  accountId?: string;
}

// ─── Models Manager ────────────────────────────────────────────────────────────

/**
 * Start a background HuggingFace download for a model from the built-in registry.
 * Poll progress via `models.manager.progress`.
 */
export interface ModelDownloadParams {
  /**
   * Model ID from `models.manager.catalog` (e.g. `"llama-3.2-3b-q5km"`).
   * Required.
   */
  id?: string;
  /**
   * HuggingFace API token for gated models.
   * Falls back to `process.env.HF_TOKEN` if omitted.
   */
  hfToken?: string;
}

/** Identifies a model by its registry ID for delete/cancel operations. */
export interface ModelDeleteParams {
  /** Model ID from the registry (e.g. `"bitnet-large-iq3m"`). Required. */
  id: string;
}

export interface ModelLoadParams {
  id: string;
}

// ─── Channels ──────────────────────────────────────────────────────────────────

/**
 * Fetch the live status snapshot for all configured messaging channels.
 * When `probe` is `true`, the gateway performs an outbound connectivity check
 * for each channel (e.g. WebSocket test for Nostr, API ping for Telegram).
 */
export interface ChannelsProbeParams {
  /**
   * If `true`, perform live connectivity checks.
   * Adds latency proportional to the number of channels.
   * Default: `false`.
   */
  probe?: boolean;
  /**
   * Per-channel probe timeout in milliseconds.
   * Min: 1 000. Default: 10 000.
   */
  timeoutMs?: number;
}

/** Selects a specific account within a multi-account channel plugin. */
export interface ChannelAccountParams {
  /**
   * Account ID as returned by `channels.status → accountId`.
   * Omit to target the channel's default account.
   */
  accountId?: string;
}

export interface ChannelNostrProfileParams {
  accountId: string;
  profile: Record<string, unknown>;
}

export interface ChannelWhatsAppParams {
  accountId: string;
  timeoutMs?: number;
}

// ─── Web ──────────────────────────────────────────────────────────────────────

/**
 * Log in to a web-based channel (e.g. WhatsApp Web, Instagram).
 * Typically launches a headless browser and returns a QR code or status.
 */
export interface WebLoginParams {
  /** Channel account ID to log in to. */
  accountId?: string;
  /** Browser operation timeout in ms. Default: 60 000. */
  timeoutMs?: number;
  /** Enable verbose browser console output in logs. Default: `false`. */
  verbose?: boolean;
  /** Force a fresh QR code even if already connected. Default: `false`. */
  force?: boolean;
}

export interface WebBrowseParams {
  url: string;
  timeoutMs?: number;
  selector?: string;
}

export interface WebScrapeParams {
  url: string;
  /** Output format. Default: `"markdown"`. */
  format?: "markdown" | "text" | "html";
  timeoutMs?: number;
}

export interface WebSearchParams {
  query: string;
  /** Max results. Default: 10, max: 50. */
  limit?: number;
  timeoutMs?: number;
}

// ─── Skills ────────────────────────────────────────────────────────────────────

/**
 * List available skills (tools) for an agent.
 * Skills are discoverable units of capability exposed as callable functions.
 */
export interface SkillsListParams {
  /** Filter to skills registered for a specific agent. Omit for global skills. */
  agentId?: string;
  /** Include disabled / draft skills. Default: `false`. */
  includeDisabled?: boolean;
}

/**
 * Execute a named skill with arguments.
 * Returns the skill's structured result payload.
 */
export interface SkillsExecuteParams {
  /** Skill key (e.g. `"web.search"`, `"memory.recall"`). */
  skillKey: string;
  /** Agent context for the skill execution. */
  agentId?: string;
  /** Skill-specific input arguments (schema defined per skill). */
  args?: Record<string, unknown>;
}

export interface SkillsSetKeyParams {
  skillKey: string;
  key: string;
  value: string;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface SessionsListParams {
  /** Filter to only active sessions ("true" string). */
  active?: string;
  /** Max sessions to return. Default: 200. */
  limit?: number;
  includeGlobal?: boolean;
  includeUnknown?: boolean;
}

export interface SessionPatchParams {
  sessionKey: string;
  patch: Record<string, unknown>;
}

export interface SessionDeleteParams {
  sessionKey: string;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface AgentsListParams {
  /** Pagination: max agents to return. Default: 200. */
  limit?: number;
  /** Pagination offset. Default: 0. */
  offset?: number;
}

export interface AgentFileParams {
  agentId: string;
  filePath?: string;
}

export interface AgentFileWriteParams {
  agentId: string;
  filePath: string;
  content: string;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

/**
 * Start the outbound Supabase connector and subscribe to Realtime.
 * Persists credentials to `.env` so the connector auto-starts on next boot.
 */
export interface SupabaseConnectParams {
  /** Full Supabase project URL (e.g. `"https://xyz.supabase.co"`). */
  supabaseUrl: string;
  /**
   * `service_role` key — grants full DB access.
   * Never expose this in browser code; gateway-side only.
   */
  supabaseKey: string;
  /**
   * UUID of this HoC instance in the `hoc_instances` table.
   * Auto-assigned on first connect if omitted.
   */
  instanceId?: string;
  /**
   * Secret for the `hoc-register` Supabase Edge Function.
   * Enables automatic instance self-registration.
   */
  registerSecret?: string;
}

// ─── Generic utility ──────────────────────────────────────────────────────────

/** Use when a method accepts no params (or all params are ignored). */
export type EmptyParams = Record<string, never>;

/** Use for methods that accept an arbitrary user-provided object. */
export type FlexParams = Record<string, unknown>;

// ─── Devices ──────────────────────────────────────────────────────────────────

/** Approve or reject a pending device pairing request. */
export interface DevicePairApproveParams {
  /** UUID of the pending pairing request. */
  requestId: string;
}

/** Rotate or revoke a device auth token. */
export interface DeviceTokenParams {
  /** Device identifier (stable UUID or machine ID). */
  deviceId: string;
  /** Token role (e.g. `"gateway"`, `"node"`). */
  role: string;
  /** Optional scope list to restrict the rotated token. */
  scopes?: string[];
}

// ─── Exec Approvals ──────────────────────────────────────────────────────────

/** Set exec approvals for the local gateway. */
export interface ExecApprovalsSetParams {
  /** The approvals file object to persist. */
  file?: unknown;
  /** Base hash from the last `exec.approvals.get` call (required if file exists). */
  baseHash?: string;
}

/** Proxy exec approvals get/set to a connected node. */
export interface ExecApprovalsNodeSetParams {
  /** Target node ID. */
  nodeId: string;
  /** Approvals file to push to the node. */
  file: unknown;
  /** Base hash from the node's last get call. */
  baseHash?: string;
}

/** Request a terminal command be approved before execution. */
export interface ExecApprovalRequestParams {
  /** Optional explicit approval request ID (auto-generated if omitted). */
  id?: string;
  /** The exact shell command string awaiting approval. */
  command: string;
  /** Working directory the command will run in. */
  cwd?: string;
  /** Host the command will run on. */
  host?: string;
  /** Security classification (e.g. `"safe"`, `"destructive"`). */
  security?: string;
  /** Human-readable explanation of why the command is needed. */
  ask?: string;
  /** Agent that is requesting execution. */
  agentId?: string;
  /** Resolved absolute path of the executable. */
  resolvedPath?: string;
  /** Session key for context. */
  sessionKey?: string;
  /** Approval wait timeout in ms. Default: 120 000. */
  timeoutMs?: number;
}

/** Resolve (approve or deny) a pending exec approval request. */
export interface ExecApprovalResolveParams {
  /** Approval request ID to resolve. */
  id: string;
  /** Resolution decision: `"allow-once"` | `"allow-always"` | `"deny"`. */
  decision: "allow-once" | "allow-always" | "deny";
}

// ─── Memory ───────────────────────────────────────────────────────────────────

/** Persist a new memory item in the Sovereign Memory Engine. */
export interface MemoryStoreParams {
  /** Memory scope (e.g. citizen name, agent ID). Required. */
  scope?: string;
  /** Text content to store. Max 8 000 chars. Required. */
  content?: string;
  /** Memory classification (e.g. `"fact"`, `"event"`, `"preference"`). */
  memoryType?: string;
  /** Session context for the memory. */
  sessionKey?: string;
  /** Channel the memory was captured from. */
  channel?: string;
  /** Importance score 0–1. Default: 0.5. */
  importance?: number;
}

/** BM25 semantic search over stored memories. */
export interface MemorySearchParams {
  /** Search query string. Required. */
  query?: string;
  /** Limit search to this scope. Omit for global search. */
  scope?: string;
  /** Max results. Default: 10, max: 50. */
  limit?: number;
  /** Minimum importance threshold (0–1). */
  minImportance?: number;
  /** Filter by memory type. */
  memoryType?: string;
}

/** Retrieve formatted memory context for prompt injection. */
export interface MemoryRecallParams {
  /** Memory scope to recall from. Required. */
  scope?: string;
  /** Recall query for relevance ranking. Required. */
  query?: string;
  /** Max tokens to include in recalled context. Default: 1 500. */
  maxTokens?: number;
  /** Max memories to include. Default: 8. */
  limit?: number;
}

/** List paginated memories for a scope. */
export interface MemoryListParams {
  /** Scope filter. Omit for all scopes. */
  scope?: string;
  /** Memory type filter. */
  memoryType?: string;
  /** Page size. Default: 20. */
  limit?: number;
  /** Page offset. Default: 0. */
  offset?: number;
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

/** Tail the gateway log file with optional cursor-based pagination. */
export interface LogsTailParams {
  /** Byte offset from the last poll (use returned `cursor` to continue). */
  cursor?: number;
  /** Max log lines to return. Default: 500, max: 5 000. */
  limit?: number;
  /** Max bytes to read per request. Default: 250 000, max: 1 000 000. */
  maxBytes?: number;
}

// ─── Models ───────────────────────────────────────────────────────────────────

/** Switch the active AI model for a session. */
export interface ModelSwitchParams {
  /** Session to apply the override to. Default: `"default"`. */
  sessionKey?: string;
  /** Provider identifier (e.g. `"anthropic"`, `"openai"`, `"ollama"`). Required. */
  provider?: string;
  /** Model ID within the provider (e.g. `"claude-sonnet-4-5"`). Required. */
  modelId?: string;
}

/** Get the currently active model for a session. */
export interface ModelActiveParams {
  /** Session key. Default: `"default"`. */
  sessionKey?: string;
}

// ─── Skills ───────────────────────────────────────────────────────────────────

/** Install a skill from the remote registry into an agent's workspace. */
export interface SkillInstallParams {
  /** Human-readable skill name (e.g. `"web-search"`). */
  name: string;
  /** Registry install ID. */
  installId: string;
  /** Installation timeout in ms. Default: 120 000. */
  timeoutMs?: number;
}

/** Update a skill's enabled state, API key, or env vars. */
export interface SkillUpdateParams {
  /** Skill key identifying the skill to update (e.g. `"web.search"`). */
  skillKey: string;
  /** Enable or disable the skill. */
  enabled?: boolean;
  /** API key to persist for the skill. */
  apiKey?: string;
  /** Environment variable overrides for the skill. */
  env?: Record<string, string>;
}

// ─── Talk ─────────────────────────────────────────────────────────────────────

/** Toggle push-to-talk voice mode on connected iOS/Android nodes. */
export interface TalkModeParams {
  /** `true` to enable voice mode, `false` to disable. */
  enabled: boolean;
  /** Optional phase hint (`"idle"` | `"listening"` | `"speaking"`). */
  phase?: string;
}

// ─── Chat (extended) ──────────────────────────────────────────────────────────

/** params for chat.send — full shape including attachments and gateway options. */
export interface ChatSendFullParams {
  sessionKey: string;
  message: string;
  thinking?: string;
  deliver?: boolean;
  /** Override the session's configured model (e.g. `"google/gemini-2.5-pro"` or `"anthropic/claude-sonnet-4-6"`). */
  model?: string;
  attachments?: Array<{
    type?: string;
    mimeType?: string;
    fileName?: string;
    content?: unknown;
  }>;
  timeoutMs?: number;
  idempotencyKey: string;
  /** Dual-model routing: Think model ID (format: "provider/modelId"). */
  thinkModelId?: string;
  /** Dual-model routing: Exec model ID (format: "provider/modelId"). */
  execModelId?: string;
}

/** Inject a message into the transcript without triggering AI inference. */
export interface ChatInjectParams {
  sessionKey: string;
  role?: "user" | "assistant" | "system";
  /** Text content to inject. */
  message: string;
  label?: string;
  createIfMissing?: boolean;
}

// ─── Cluster ─────────────────────────────────────────────────────────────────

/** Docker container operations (start / stop / remove). */
export interface ClusterDockerContainerParams {
  /** Docker container ID or name. */
  containerId: string;
}

/** Deploy a Docker preset from the built-in catalog. */
export interface ClusterDockerDeployParams {
  /** Preset name (e.g. `"ollama"`, `"n8n"`, `"redis"`). */
  preset: string;
}

/** Toggle or trigger an n8n workflow. */
export interface ClusterN8nWorkflowParams {
  /** n8n workflow UUID. */
  workflowId: string;
  /** For toggle: `true` = activate, `false` = deactivate. */
  active?: boolean;
  /** For trigger: optional payload to inject into the workflow. */
  payload?: Record<string, unknown>;
}

/** Set Tailscale peer IPs for cluster federation. */
export interface ClusterFederationPeersParams {
  /** Array of Tailscale or LAN IP addresses. */
  peers: string[];
}

/** Remove a specific peer IP from the cluster federation. */
export interface ClusterFederationRemovePeerParams {
  /** IP address to remove. */
  ip: string;
}
