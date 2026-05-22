/**
 * Republic Platform — LM Link Cluster Manager
 *
 * Manages a registry of LM Studio instances connected via LM Link
 * (Tailscale-backed encrypted mesh, lmstudio.ai/link).
 *
 * LM Link makes remote models accessible as if they were local —
 * each connected LM Studio instance (or llmster daemon) appears at
 * its configured host:port via the standard v1 REST API.
 *
 * Features:
 *  - Node registry: add/remove/list LM Studio nodes
 *  - Health probing: periodic GET /api/v1/models on each node
 *  - CLI bridge: lms login / lms link enable|disable / lms link list
 *  - RTX 6000 Pro 96 GB Blackwell preset (flash_attention, 65k ctx)
 *  - Best-node selection: lowest latency, required capabilities
 *  - Auto-initialise: localhost:1234 + optional RTX env-var node
 */

import { exec } from "child_process";
import { emitNationalEvent } from "./event-sourcing.js";

// ─── Hardware Profiles ──────────────────────────────────────────

export const LM_LINK_GPU_PROFILES = {
  "rtx-6000-pro-96gb": {
    label: "RTX 6000 Pro 96 GB (Blackwell)",
    vramGb: 96,
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 65536,
    evalBatchSize: 4096,
    tier: "blackwell-pro" as const,
  },
  "rtx-titan-24gb": {
    label: "RTX Titan 24 GB",
    vramGb: 24,
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
    tier: "enthusiast" as const,
  },
  "rtx-4090-24gb": {
    label: "RTX 4090 24 GB",
    vramGb: 24,
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
    tier: "enthusiast" as const,
  },
  "rtx-3090-24gb": {
    label: "RTX 3090 24 GB",
    vramGb: 24,
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
    tier: "enthusiast" as const,
  },
  "rtx-3090ti-24gb": {
    label: "RTX 3090 Ti 24 GB",
    vramGb: 24,
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 16384,
    evalBatchSize: 1024,
    tier: "enthusiast" as const,
  },
  "rtx-5070-8gb": {
    label: "RTX 5070 8 GB",
    vramGb: 8,
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 4096,
    evalBatchSize: 512,
    tier: "gaming" as const,
  },
  "intel-arc-a770": {
    label: "Intel Arc A-Series",
    vramGb: 16,
    flashAttention: false,
    offloadKvCacheToGpu: true,
    contextLength: 8192,
    evalBatchSize: 512,
    tier: "gaming" as const,
  },
  default: {
    label: "Unknown GPU",
    vramGb: 0,
    flashAttention: true,
    offloadKvCacheToGpu: true,
    contextLength: 8192,
    evalBatchSize: 512,
    tier: "default" as const,
  },
} as const;

export type GpuProfileKey = keyof typeof LM_LINK_GPU_PROFILES;

// ─── Types ──────────────────────────────────────────────────────

export interface LMLinkNodeModel {
  key: string;
  displayName: string;
  type: "llm" | "embedding";
  sizeBytes: number;
  loaded: boolean;
  vision: boolean;
  toolUse: boolean;
  contextLength: number;
  architecture: string | null;
  quantization: string | null;
}

export interface LMLinkNode {
  id: string;
  label: string;
  host: string;
  port: number;
  apiToken: string | undefined;
  gpuProfile: GpuProfileKey;
  status: "online" | "offline" | "unknown";
  lastProbeMs: number;
  latencyMs: number | null;
  models: LMLinkNodeModel[];
  /** Is this node the local machine? */
  isLocal: boolean;
  /** Is this the designated RTX 6000 Pro Blackwell power node? */
  isPowerNode: boolean;
  addedAt: number;
  /** Remote Docker Daemon URL (e.g., tcp://100.x.y.z:2375) */
  dockerHostUrl?: string;
}

export interface LMLinkRoutingConfig {
  /** Preferred node id for inference. null = auto (lowest latency). */
  preferredNodeId: string | null;
  /** Strategy: auto picks lowest-latency online node; manual pins to preferred */
  strategy: "auto" | "manual";
  /** Fallback to localhost if preferred is offline */
  fallbackToLocal: boolean;
}

// ─── State ──────────────────────────────────────────────────────

const nodes = new Map<string, LMLinkNode>();

let routingConfig: LMLinkRoutingConfig = {
  preferredNodeId: null,
  strategy: "auto",
  fallbackToLocal: true,
};

let probeIntervalHandle: ReturnType<typeof setInterval> | null = null;
const PROBE_INTERVAL_MS = 30_000;

// ─── Initialization ─────────────────────────────────────────────

function detectGpuProfileFromHost(host: string): GpuProfileKey {
  // Check env var overrides first
  const envProfile = process.env.LMLINK_GPU_PROFILE?.toLowerCase();
  if (envProfile && envProfile in LM_LINK_GPU_PROFILES) {
    return envProfile as GpuProfileKey;
  }
  // Heuristic: power node env var host matches
  const rtxHost = (process.env.LMLINK_RTX6000_HOST ?? "").toLowerCase();
  if (rtxHost && host.toLowerCase() === rtxHost) {
    return "rtx-6000-pro-96gb";
  }
  return "default";
}

/**
 * Register or update a node. Returns the node.
 */
export function addLMLinkNode(opts: {
  label: string;
  host: string;
  port?: number;
  apiToken?: string;
  gpuProfile?: GpuProfileKey;
  isLocal?: boolean;
  isPowerNode?: boolean;
  dockerHostUrl?: string;
}): LMLinkNode {
  const port = opts.port ?? 1234;
  const id = `lmlink-${opts.host}:${port}`;

  const existing = nodes.get(id);
  if (existing) {
    // Update mutable fields
    existing.label = opts.label;
    existing.apiToken = opts.apiToken ?? existing.apiToken;
    if (opts.gpuProfile) { existing.gpuProfile = opts.gpuProfile; }
    if (opts.isPowerNode !== undefined) { existing.isPowerNode = opts.isPowerNode; }
    if (opts.dockerHostUrl !== undefined) { existing.dockerHostUrl = opts.dockerHostUrl; }
    return existing;
  }

  const node: LMLinkNode = {
    id,
    label: opts.label,
    host: opts.host,
    port,
    apiToken: opts.apiToken,
    gpuProfile: opts.gpuProfile ?? detectGpuProfileFromHost(opts.host),
    status: "unknown",
    lastProbeMs: 0,
    latencyMs: null,
    models: [],
    isLocal: opts.isLocal ?? false,
    isPowerNode: opts.isPowerNode ?? false,
    addedAt: Date.now(),
    dockerHostUrl: opts.dockerHostUrl,
  };

  nodes.set(id, node);
  return node;
}

export function removeLMLinkNode(id: string): boolean {
  const node = nodes.get(id);
  if (!node || node.isLocal) { return false; } // Can't remove local node
  return nodes.delete(id);
}

export function getLMLinkNodes(): LMLinkNode[] {
  return [...nodes.values()];
}

export function getLMLinkNode(id: string): LMLinkNode | undefined {
  return nodes.get(id);
}

// ─── Health Probing ─────────────────────────────────────────────

function authHeaders(node: LMLinkNode): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (node.apiToken) { h["Authorization"] = `Bearer ${node.apiToken}`; }
  return h;
}

/**
 * Probe a single node: GET /api/v1/models to check status + refresh model list.
 */
export async function probeLMLinkNode(id: string): Promise<LMLinkNode | null> {
  const node = nodes.get(id);
  if (!node) { return null; }

  const baseUrl = `http://${node.host}:${node.port}`;
  const t0 = Date.now();

  const prevStatus = node.status;

  try {
    const res = await fetch(`${baseUrl}/api/v1/models`, {
      headers: authHeaders(node),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      node.status = "offline";
      node.latencyMs = null;
      // Emit event when a node transitions offline
      if (prevStatus !== "offline") {
        emitNationalEvent("infrastructure", "lmlink_node_offline", "lmlink-cluster", {
          nodeId: node.id,
          label: node.label,
          host: node.host,
          port: node.port,
          gpuProfile: node.gpuProfile,
        });
      }
      return node;
    }

    node.latencyMs = Date.now() - t0;
    node.status = "online";
    node.lastProbeMs = Date.now();

    // Emit event when a node comes online or re-connects
    if (prevStatus !== "online") {
      emitNationalEvent("infrastructure", "lmlink_node_online", "lmlink-cluster", {
        nodeId: node.id,
        label: node.label,
        host: node.host,
        port: node.port,
        latencyMs: node.latencyMs,
        gpuProfile: node.gpuProfile,
        vramGb: LM_LINK_GPU_PROFILES[node.gpuProfile]?.vramGb ?? 0,
      });
    }

    const data = (await res.json()) as { models?: unknown[] };
    const raw = data.models ?? [];

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    node.models = raw.map((m: any): LMLinkNodeModel => ({
      key: m.key ?? m.id ?? "",
      displayName: m.display_name ?? m.key ?? "",
      type: m.type ?? "llm",
      sizeBytes: m.size_bytes ?? 0,
      loaded: (m.loaded_instances ?? []).length > 0,
      vision: m.capabilities?.vision ?? false,
      toolUse: m.capabilities?.trained_for_tool_use ?? false,
      contextLength: m.max_context_length ?? 8192,
      architecture: m.architecture ?? null,
      quantization: m.quantization?.name ?? null,
    }));
  } catch {
    node.status = "offline";
    node.latencyMs = null;
    if (prevStatus !== "offline") {
      emitNationalEvent("infrastructure", "lmlink_node_offline", "lmlink-cluster", {
        nodeId: node.id,
        label: node.label,
        host: node.host,
        port: node.port,
        gpuProfile: node.gpuProfile,
      });
    }
  }

  return node;
}

/**
 * Probe all registered nodes in parallel.
 */
export async function probeAllNodes(): Promise<void> {
  const ids = [...nodes.keys()];
  await Promise.allSettled(ids.map((id) => probeLMLinkNode(id)));
}

// ─── CLI Bridge ─────────────────────────────────────────────────

function runLMSCommand(args: string, timeoutMs = 10_000): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    exec(`lms ${args}`, { timeout: timeoutMs }, (err, stdout, stderr) => {
      if (err) {
        resolve({ ok: false, output: stderr || err.message });
      } else {
        resolve({ ok: true, output: stdout.trim() });
      }
    });
  });
}

/**
 * Get LM Link status from CLI: `lms status --json` (or fallback text parse)
 */
export async function getLMLinkCLIStatus(): Promise<{
  cliAvailable: boolean;
  lmLinkEnabled: boolean | null;
  linkedDevices: string[];
  rawOutput: string;
}> {
  // Try JSON status
  const statusResult = await runLMSCommand("status --json");
  if (statusResult.ok) {
    try {
      const parsed = JSON.parse(statusResult.output) as Record<string, unknown>;
      return {
        cliAvailable: true,
        lmLinkEnabled: (parsed.lmLink as Record<string, unknown> | undefined)?.enabled as boolean | null ?? null,
        linkedDevices: ((parsed.lmLink as Record<string, unknown> | undefined)?.devices as string[] | undefined) ?? [],
        rawOutput: statusResult.output,
      };
    } catch {
      // JSON parse failed, attempt link list
    }
  }

  // Fallback: `lms link list`
  const linkResult = await runLMSCommand("link list");
  return {
    cliAvailable: linkResult.ok,
    lmLinkEnabled: linkResult.ok ? true : null,
    linkedDevices: linkResult.ok
      ? linkResult.output
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
      : [],
    rawOutput: linkResult.output,
  };
}

/**
 * Enable LM Link via CLI: `lms link enable`
 */
export async function enableLMLink(): Promise<{ ok: boolean; output: string }> {
  const result = await runLMSCommand("link enable", 15_000);
  if (result.ok) {
    emitNationalEvent("infrastructure", "lmlink_enabled", "lmlink-cluster", {});
  }
  return result;
}

/**
 * Disable LM Link via CLI: `lms link disable`
 */
export async function disableLMLink(): Promise<{ ok: boolean; output: string }> {
  const result = await runLMSCommand("link disable", 15_000);
  if (result.ok) {
    emitNationalEvent("infrastructure", "lmlink_disabled", "lmlink-cluster", {});
  }
  return result;
}

/**
 * Initiate LM Link login via CLI: `lms login`
 * This opens a browser window on the host machine for LM Studio account auth.
 */
export async function loginLMLink(): Promise<{ ok: boolean; output: string }> {
  return runLMSCommand("login", 30_000);
}

// ─── Routing ────────────────────────────────────────────────────

export function getLMLinkRoutingConfig(): LMLinkRoutingConfig {
  return { ...routingConfig };
}

export function setLMLinkRoutingConfig(updates: Partial<LMLinkRoutingConfig>): LMLinkRoutingConfig {
  routingConfig = { ...routingConfig, ...updates };
  return { ...routingConfig };
}

export function getComfyUITargetNode(): LMLinkNode | null {
  const onlineNodes = [...nodes.values()].filter((n) => n.status === "online");
  if (onlineNodes.length === 0) { return null; }

  // 1. If there's an explicit Power Node with a Docker URL, use it
  const powerNode = onlineNodes.find((n) => n.isPowerNode && n.dockerHostUrl);
  if (powerNode) { return powerNode; }

  // 2. Fall back to any node with a Docker URL that has the most VRAM
  const dockerNodes = onlineNodes.filter((n) => n.dockerHostUrl);
  if (dockerNodes.length > 0) {
    return dockerNodes.toSorted((a, b) => {
      const vramA = LM_LINK_GPU_PROFILES[a.gpuProfile]?.vramGb ?? 0;
      const vramB = LM_LINK_GPU_PROFILES[b.gpuProfile]?.vramGb ?? 0;
      return vramB - vramA; // highest vram first
    })[0] ?? null;
  }

  // 3. Fallback to local node (assuming Gateway runs local docker socket)
  const localNode = onlineNodes.find((n) => n.isLocal);
  return localNode ?? null;
}

/**
 * Select the best node for inference given optional capability requirements.
 * Returns null if no online node is available.
 */
export function selectBestLMLinkNode(opts?: {
  requireVision?: boolean;
  requireToolUse?: boolean;
  requireLoadedModel?: boolean;
  /** Minimum VRAM required in GB (e.g. 48 to force Blackwell for large models) */
  requireMinVramGb?: number;
  /** Minimum context window required in tokens */
  requireMinContextLength?: number;
  /**
   * Prefer large model routing:
   *   - "power"   → prefer highest-VRAM node (Blackwell 96GB)
   *   - "medium"  → prefer enthusiast nodes (24GB Titan / 3090Ti)
   *   - "fast"    → prefer lowest-latency regardless of VRAM
   */
  preferTier?: "power" | "medium" | "fast";
}): LMLinkNode | null {
  const onlineNodes = [...nodes.values()].filter((n) => n.status === "online");

  if (onlineNodes.length === 0) { return null; }

  // Manual pinning
  if (routingConfig.strategy === "manual" && routingConfig.preferredNodeId) {
    const pinned = nodes.get(routingConfig.preferredNodeId);
    if (pinned?.status === "online") { return pinned; }
    // Fallback to auto if pinned node is offline
    if (!routingConfig.fallbackToLocal) { return null; }
  }

  // Preferred node first (auto strategy)
  if (routingConfig.strategy === "auto" && routingConfig.preferredNodeId) {
    const preferred = nodes.get(routingConfig.preferredNodeId);
    if (preferred?.status === "online") {
      return preferred;
    }
  }

  // Filter by hardware capabilities
  let candidates = onlineNodes;
  if (opts?.requireMinVramGb) {
    const minVram = opts.requireMinVramGb;
    candidates = candidates.filter((n) => {
      const profile = LM_LINK_GPU_PROFILES[n.gpuProfile];
      return (profile?.vramGb ?? 0) >= minVram;
    });
  }
  if (opts?.requireMinContextLength) {
    const minCtx = opts.requireMinContextLength;
    candidates = candidates.filter((n) => {
      const profile = LM_LINK_GPU_PROFILES[n.gpuProfile];
      return (profile?.contextLength ?? 0) >= minCtx;
    });
  }

  // Filter by model capabilities
  if (opts?.requireVision) {
    candidates = candidates.filter((n) => n.models.some((m) => m.vision && m.loaded));
  }
  if (opts?.requireToolUse) {
    candidates = candidates.filter((n) => n.models.some((m) => m.toolUse && m.loaded));
  }
  if (opts?.requireLoadedModel) {
    candidates = candidates.filter((n) => n.models.some((m) => m.loaded));
  }

  // Relax constraints if nothing matches
  if (candidates.length === 0) {
    candidates = onlineNodes;
  }

  // Sort by tier preference + latency
  return candidates.toSorted((a, b) => {
    const aProfile = LM_LINK_GPU_PROFILES[a.gpuProfile];
    const bProfile = LM_LINK_GPU_PROFILES[b.gpuProfile];
    const aVram = aProfile?.vramGb ?? 0;
    const bVram = bProfile?.vramGb ?? 0;

    // Tier-aware routing
    if (opts?.preferTier === "power") {
      // High-VRAM nodes first; break ties by latency
      if (aVram !== bVram) { return bVram - aVram; } // higher VRAM wins
    } else if (opts?.preferTier === "medium") {
      // Prefer 24GB enthusiast nodes; deprioritize both low-VRAM and very-high-VRAM
      const aScore = Math.abs(aVram - 24);
      const bScore = Math.abs(bVram - 24);
      if (aScore !== bScore) { return aScore - bScore; }
    }
    // Default / "fast": latency-first with power-node bonus
    const aLat = (a.latencyMs ?? 9999) - (a.isPowerNode ? 20 : 0);
    const bLat = (b.latencyMs ?? 9999) - (b.isPowerNode ? 20 : 0);
    return aLat - bLat;
  })[0] ?? null;
}

// ─── Aggregated Model List ───────────────────────────────────────

export interface AggregatedModel extends LMLinkNodeModel {
  nodeId: string;
  nodeLabel: string;
  nodeStatus: LMLinkNode["status"];
  gpuProfile: GpuProfileKey;
}

export function getAggregatedModels(): AggregatedModel[] {
  const result: AggregatedModel[] = [];
  for (const node of nodes.values()) {
    for (const model of node.models) {
      result.push({
        ...model,
        nodeId: node.id,
        nodeLabel: node.label,
        nodeStatus: node.status,
        gpuProfile: node.gpuProfile,
      });
    }
  }
  return result;
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface LMLinkDiagnostics {
  nodeCount: number;
  onlineCount: number;
  totalModels: number;
  loadedModels: number;
  routingConfig: LMLinkRoutingConfig;
  selectedNode: {
    id: string;
    label: string;
    gpuProfile: GpuProfileKey;
  } | null;
  nodes: Array<{
    id: string;
    label: string;
    host: string;
    port: number;
    status: LMLinkNode["status"];
    latencyMs: number | null;
    modelCount: number;
    loadedModelCount: number;
    gpuProfile: GpuProfileKey;
    isLocal: boolean;
    isPowerNode: boolean;
    lastProbeMs: number;
  }>;
}

export function getLMLinkDiagnostics(): LMLinkDiagnostics {
  const allNodes = [...nodes.values()];
  const onlineNodes = allNodes.filter((n) => n.status === "online");
  const selected = selectBestLMLinkNode();

  return {
    nodeCount: allNodes.length,
    onlineCount: onlineNodes.length,
    totalModels: allNodes.reduce((s, n) => s + n.models.length, 0),
    loadedModels: allNodes.reduce((s, n) => s + n.models.filter((m) => m.loaded).length, 0),
    routingConfig: { ...routingConfig },
    selectedNode: selected
      ? { id: selected.id, label: selected.label, gpuProfile: selected.gpuProfile }
      : null,
    nodes: allNodes.map((n) => ({
      id: n.id,
      label: n.label,
      host: n.host,
      port: n.port,
      status: n.status,
      latencyMs: n.latencyMs,
      modelCount: n.models.length,
      loadedModelCount: n.models.filter((m) => m.loaded).length,
      gpuProfile: n.gpuProfile,
      isLocal: n.isLocal,
      isPowerNode: n.isPowerNode,
      lastProbeMs: n.lastProbeMs,
    })),
  };
}

// ─── Load / Unload Model via Driver ─────────────────────────────

/**
 * Load a model on a specific LM Link node.
 */
export async function loadModelOnNode(
  nodeId: string,
  modelKey: string,
  opts?: {
    contextLength?: number;
    flashAttention?: boolean;
    offloadKvCacheToGpu?: boolean;
    evalBatchSize?: number;
  },
): Promise<{ ok: boolean; error?: string; instanceId?: string; loadTimeSeconds?: number }> {
  const node = nodes.get(nodeId);
  if (!node) { return { ok: false, error: "Node not found" }; }
  if (node.status === "offline") { return { ok: false, error: "Node is offline" }; }

  const profile = LM_LINK_GPU_PROFILES[node.gpuProfile] ?? LM_LINK_GPU_PROFILES.default;
  const baseUrl = `http://${node.host}:${node.port}`;

  const body = {
    model: modelKey,
    context_length: opts?.contextLength ?? profile.contextLength,
    flash_attention: opts?.flashAttention ?? profile.flashAttention,
    eval_batch_size: opts?.evalBatchSize ?? profile.evalBatchSize,
    offload_kv_cache_to_gpu: opts?.offloadKvCacheToGpu ?? profile.offloadKvCacheToGpu,
    echo_load_config: true,
  };

  try {
    const res = await fetch(`${baseUrl}/api/v1/models/load`, {
      method: "POST",
      headers: authHeaders(node),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${errText}` };
    }

    const data = (await res.json()) as Record<string, unknown>;
    // Refresh model list
    probeLMLinkNode(nodeId).catch(() => {});

    emitNationalEvent("infrastructure", "lmlink_model_loaded", "lmlink-cluster", {
      nodeId,
      model: modelKey,
    });

    return {
      ok: true,
      instanceId: data.instance_id as string | undefined,
      loadTimeSeconds: data.load_time_seconds as number | undefined,
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Unload a model from a specific LM Link node.
 */
export async function unloadModelFromNode(
  nodeId: string,
  modelInstanceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const node = nodes.get(nodeId);
  if (!node) { return { ok: false, error: "Node not found" }; }

  const baseUrl = `http://${node.host}:${node.port}`;

  try {
    const res = await fetch(`${baseUrl}/api/v1/models/unload`, {
      method: "POST",
      headers: authHeaders(node),
      body: JSON.stringify({ instance_id: modelInstanceId }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `${res.status} ${errText}` };
    }

    probeLMLinkNode(nodeId).catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ─── Module Boot ────────────────────────────────────────────────

/**
 * Boot the LM Link cluster manager:
 * 1. Register local LM Studio (localhost:1234)
 * 2. Register RTX 6000 Pro node from env vars (if configured)
 * 3. Probe all nodes immediately
 * 4. Start 30s polling interval
 */
export function bootLMLinkCluster(): void {
  if (probeIntervalHandle) { return; } // Already booted

  // ── 1. Local node — RTX Titan 24 GB (gateway host) ──────────────────
  addLMLinkNode({
    label: process.env.LMLINK_LOCAL_LABEL?.trim() ?? "RTX Titan 24 GB — Local",
    host: "127.0.0.1",
    port: parseInt(process.env.LMSTUDIO_PORT ?? "1234", 10),
    gpuProfile: "rtx-titan-24gb",
    isLocal: true,
    isPowerNode: false,
  });

  // ── 2. H-Office node — RTX 3090 Ti 24 GB (Core Ultra 9 285HX, 96 GB DDR5) ──
  //    Set LMLINK_H_OFFICE_HOST to the Tailscale IP or hostname of the H-Office machine.
  const hofficeHost = process.env.LMLINK_H_OFFICE_HOST?.trim();
  const hofficePort = parseInt(process.env.LMLINK_H_OFFICE_PORT ?? "1234", 10);
  const hofficeToken = process.env.LMLINK_H_OFFICE_TOKEN?.trim();
  const hofficeLabel = process.env.LMLINK_H_OFFICE_LABEL?.trim() ?? "H-Office RTX 3090 Ti 24 GB";
  const hofficeDockerUrl = process.env.LMLINK_H_OFFICE_DOCKER_URL?.trim();

  if (hofficeHost) {
    addLMLinkNode({
      label: hofficeLabel,
      host: hofficeHost,
      port: hofficePort,
      apiToken: hofficeToken || undefined,
      gpuProfile: "rtx-3090ti-24gb",
      isPowerNode: false,
      dockerHostUrl: hofficeDockerUrl,
    });
  }

  // ── 3. Blackwell Server — RTX Pro 6000 96 GB (flagship inference node) ──
  //    Set LMLINK_RTX6000_HOST to the Tailscale IP or hostname of the Blackwell server.
  const rtxHost = process.env.LMLINK_RTX6000_HOST?.trim();
  const rtxPort = parseInt(process.env.LMLINK_RTX6000_PORT ?? "1234", 10);
  const rtxToken = process.env.LMLINK_RTX6000_TOKEN?.trim();
  const rtxLabel = process.env.LMLINK_RTX6000_LABEL?.trim() ?? "Blackwell Server — RTX Pro 6000 96 GB";
  const rtxDockerUrl = process.env.LMLINK_RTX6000_DOCKER_URL?.trim();

  if (rtxHost) {
    addLMLinkNode({
      label: rtxLabel,
      host: rtxHost,
      port: rtxPort,
      apiToken: rtxToken || undefined,
      gpuProfile: "rtx-6000-pro-96gb",
      isPowerNode: true,
      dockerHostUrl: rtxDockerUrl,
    });
    // Auto-prefer the power node for complex inference
    routingConfig.preferredNodeId = `lmlink-${rtxHost}:${rtxPort}`;
    routingConfig.strategy = "auto";
  }

  // ── 4. Additional nodes from env: LMLINK_EXTRA_NODES=label@host:port:token:dockerUrl,... ──
  const extraNodes = process.env.LMLINK_EXTRA_NODES?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  for (const entry of extraNodes) {
    const [labelPart, rest] = entry.split("@");
    if (!rest) { continue; }
    const parts = rest.split(":");
    const host = parts[0];
    const port = parseInt(parts[1] ?? "1234", 10);
    const token = parts[2];
    const dockerUrl = parts[3];
    if (host) {
      addLMLinkNode({
        label: labelPart ?? host,
        host,
        port,
        apiToken: token || undefined,
        dockerHostUrl: dockerUrl || undefined,
      });
    }
  }

  // ── 5. Generic numbered nodes: LMLINK_NODE1_HOST, LMLINK_NODE1_PORT, etc. ──
  for (let i = 1; i <= 8; i++) {
    const nodeHost = process.env[`LMLINK_NODE${i}_HOST`]?.trim();
    if (!nodeHost) { continue; }
    const nodePort = parseInt(process.env[`LMLINK_NODE${i}_PORT`] ?? "1234", 10);
    const nodeToken = process.env[`LMLINK_NODE${i}_TOKEN`]?.trim();
    const nodeLabel = process.env[`LMLINK_NODE${i}_LABEL`]?.trim() ?? `LM Studio Node ${i}`;
    const nodeGpu = (process.env[`LMLINK_NODE${i}_GPU`]?.trim() ?? "default") as GpuProfileKey;
    const nodeIsPower = process.env[`LMLINK_NODE${i}_POWER`]?.trim() === "true";
    const nodeDockerUrl = process.env[`LMLINK_NODE${i}_DOCKER_URL`]?.trim();
    addLMLinkNode({
      label: nodeLabel,
      host: nodeHost,
      port: nodePort,
      apiToken: nodeToken || undefined,
      gpuProfile: nodeGpu in LM_LINK_GPU_PROFILES ? nodeGpu : "default",
      isPowerNode: nodeIsPower,
      dockerHostUrl: nodeDockerUrl,
    });
  }

  // Emit boot event summarising registered fleet
  const registeredNodes = [...nodes.values()];
  emitNationalEvent("infrastructure", "lmlink_fleet_booted", "lmlink-cluster", {
    nodeCount: registeredNodes.length,
    nodes: registeredNodes.map((n) => ({
      id: n.id,
      label: n.label,
      gpuProfile: n.gpuProfile,
      vramGb: LM_LINK_GPU_PROFILES[n.gpuProfile]?.vramGb ?? 0,
      isPowerNode: n.isPowerNode,
      isLocal: n.isLocal,
    })),
  });

  // Initial probe (fire and forget)
  probeAllNodes().catch(() => {});

  // Polling interval
  probeIntervalHandle = setInterval(() => {
    probeAllNodes().catch(() => {});
  }, PROBE_INTERVAL_MS);

  // Don't block process exit
  probeIntervalHandle.unref();
}

export function shutdownLMLinkCluster(): void {
  if (probeIntervalHandle) {
    clearInterval(probeIntervalHandle);
    probeIntervalHandle = null;
  }
}

// Auto-boot on import
bootLMLinkCluster();
