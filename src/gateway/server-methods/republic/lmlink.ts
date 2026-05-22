/**
 * Republic Gateway Handlers — LM Link Cluster
 *
 * RPC surface for managing the LM Link cluster of LM Studio instances.
 * LM Link connects remote LM Studio machines (or llmster headless daemons)
 * via an end-to-end encrypted Tailscale mesh, making remote models appear
 * as if they are loaded locally.
 *
 * Handlers:
 *   republic.lmlink.status          — overall status + CLI-linked devices
 *   republic.lmlink.nodes.list      — all registered nodes with health
 *   republic.lmlink.nodes.add       — register a new remote node
 *   republic.lmlink.nodes.remove    — remove a node
 *   republic.lmlink.nodes.probe     — force health probe on a node
 *   republic.lmlink.models.list     — aggregated model list from all nodes
 *   republic.lmlink.models.load     — load model on a specific node
 *   republic.lmlink.models.unload   — unload model from a node
 *   republic.lmlink.link.enable     — run `lms link enable`
 *   republic.lmlink.link.disable    — run `lms link disable`
 *   republic.lmlink.link.login      — run `lms login`
 *   republic.lmlink.routing.status  — current routing table + selected node
 *   republic.lmlink.routing.set     — update routing config
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  addLMLinkNode,
  removeLMLinkNode,
  getLMLinkNodes,
  getLMLinkNode,
  probeAllNodes,
  probeLMLinkNode,
  getLMLinkCLIStatus,
  enableLMLink,
  disableLMLink,
  loginLMLink,
  getAggregatedModels,
  loadModelOnNode,
  unloadModelFromNode,
  getLMLinkDiagnostics,
  getLMLinkRoutingConfig,
  setLMLinkRoutingConfig,
  selectBestLMLinkNode,
  LM_LINK_GPU_PROFILES,
  type GpuProfileKey,
} from "../../../republic/lmlink-cluster.js";

export const lmlinkHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Status ─────────────────────────────────────────────────

  /**
   * Overall LM Link status: diagnostics + CLI-linked devices.
   */
  "republic.lmlink.status": async ({ respond }) => {
    try {
      const [diag, cliStatus] = await Promise.all([
        Promise.resolve(getLMLinkDiagnostics()),
        getLMLinkCLIStatus(),
      ]);

      respond(
        true,
        {
          ok: true,
          ...diag,
          cli: {
            available: cliStatus.cliAvailable,
            lmLinkEnabled: cliStatus.lmLinkEnabled,
            linkedDevices: cliStatus.linkedDevices,
          },
          profileCatalog: Object.entries(LM_LINK_GPU_PROFILES).map(([key, p]) => ({
            key,
            label: p.label,
            vramGb: p.vramGb,
            tier: p.tier,
          })),
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ─── Nodes ──────────────────────────────────────────────────

  /** List all registered LM Link nodes with current health and model counts. */
  "republic.lmlink.nodes.list": ({ respond }) => {
    const nodes = getLMLinkNodes();

    respond(
      true,
      {
        ok: true,
        nodes: nodes.map((n) => ({
          id: n.id,
          label: n.label,
          host: n.host,
          port: n.port,
          status: n.status,
          latencyMs: n.latencyMs,
          dockerHostUrl: n.dockerHostUrl,
          gpuProfile: n.gpuProfile,
          gpuProfileLabel: LM_LINK_GPU_PROFILES[n.gpuProfile]?.label ?? n.gpuProfile,
          isLocal: n.isLocal,
          isPowerNode: n.isPowerNode,
          modelCount: n.models.length,
          loadedModelCount: n.models.filter((m) => m.loaded).length,
          lastProbeMs: n.lastProbeMs,
          addedAt: n.addedAt,
        })),
        totalCount: nodes.length,
        onlineCount: nodes.filter((n) => n.status === "online").length,
      },
      undefined,
    );
  },

  /** Add a new remote LM Studio node to the cluster. */
  "republic.lmlink.nodes.add": async ({ params, respond }) => {
    const p = params as {
      host?: string;
      port?: number;
      label?: string;
      apiToken?: string;
      dockerHostUrl?: string;
      gpuProfile?: string;
      isPowerNode?: boolean;
    } | undefined;

    if (!p?.host) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "host is required"));
      return;
    }

    const host = String(p.host).trim();
    if (!host) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "host must be a non-empty string"));
      return;
    }

    const port = typeof p.port === "number" ? p.port : 1234;
    const label = p.label?.trim() || `LM Studio @ ${host}:${port}`;
    const gpuProfile = (p.gpuProfile ?? "default") as GpuProfileKey;

    const node = addLMLinkNode({
      label,
      host,
      port,
      apiToken: p.apiToken?.trim() || undefined,
      dockerHostUrl: p.dockerHostUrl?.trim() || undefined,
      gpuProfile: gpuProfile in LM_LINK_GPU_PROFILES ? gpuProfile : "default",
      isPowerNode: p.isPowerNode ?? false,
    });

    // Immediately probe the new node
    const probed = await probeLMLinkNode(node.id);

    respond(
      true,
      {
        ok: true,
        id: node.id,
        label: node.label,
        host: node.host,
        port: node.port,
        status: probed?.status ?? "unknown",
        gpuProfile: node.gpuProfile,
      },
      undefined,
    );
  },

  /** Remove a node from the cluster (cannot remove the local node). */
  "republic.lmlink.nodes.remove": ({ params, respond }) => {
    const { nodeId } = params as { nodeId?: string } | Record<string, unknown>;

    if (!nodeId || typeof nodeId !== "string") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId required"));
      return;
    }

    const node = getLMLinkNode(nodeId);
    if (!node) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "node not found"));
      return;
    }
    if (node.isLocal) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "cannot remove local node"));
      return;
    }

    const removed = removeLMLinkNode(nodeId);
    respond(true, { ok: true, removed, nodeId }, undefined);
  },

  /** Force health probe on a specific node. */
  "republic.lmlink.nodes.probe": async ({ params, respond }) => {
    const { nodeId } = params as { nodeId?: string } | Record<string, unknown>;

    if (nodeId && typeof nodeId === "string") {
      const node = await probeLMLinkNode(nodeId);
      if (!node) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "node not found"));
        return;
      }
      respond(
        true,
        {
          ok: true,
          id: node.id,
          status: node.status,
          latencyMs: node.latencyMs,
          modelCount: node.models.length,
          loadedModelCount: node.models.filter((m) => m.loaded).length,
        },
        undefined,
      );
    } else {
      // Probe all
      await probeAllNodes();
      respond(
        true,
        {
          ok: true,
          message: "All nodes probed",
          nodes: getLMLinkNodes().map((n) => ({
            id: n.id,
            label: n.label,
            status: n.status,
            latencyMs: n.latencyMs,
          })),
        },
        undefined,
      );
    }
  },

  // ─── Models ─────────────────────────────────────────────────

  /** Aggregated model list from all online LM Link nodes. */
  "republic.lmlink.models.list": ({ respond }) => {
    const models = getAggregatedModels();
    const loaded = models.filter((m) => m.loaded);

    respond(
      true,
      {
        ok: true,
        models,
        totalCount: models.length,
        loadedCount: loaded.length,
        byNode: getLMLinkNodes().map((n) => ({
          nodeId: n.id,
          nodeLabel: n.label,
          status: n.status,
          modelCount: n.models.length,
          loadedCount: n.models.filter((m) => m.loaded).length,
        })),
      },
      undefined,
    );
  },

  /** Load a model on a specific LM Link node. */
  "republic.lmlink.models.load": async ({ params, respond }) => {
    const p = params as {
      nodeId?: string;
      modelKey?: string;
      contextLength?: number;
      flashAttention?: boolean;
      offloadKvCacheToGpu?: boolean;
      evalBatchSize?: number;
    } | undefined;

    if (!p?.nodeId || !p?.modelKey) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeId and modelKey are required"));
      return;
    }

    const result = await loadModelOnNode(p.nodeId, p.modelKey, {
      contextLength: p.contextLength,
      flashAttention: p.flashAttention,
      offloadKvCacheToGpu: p.offloadKvCacheToGpu,
      evalBatchSize: p.evalBatchSize,
    });

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "load failed"));
      return;
    }

    respond(
      true,
      {
        ok: true,
        nodeId: p.nodeId,
        modelKey: p.modelKey,
        instanceId: result.instanceId,
        loadTimeSeconds: result.loadTimeSeconds,
      },
      undefined,
    );
  },

  /** Unload a model from a specific LM Link node. */
  "republic.lmlink.models.unload": async ({ params, respond }) => {
    const p = params as { nodeId?: string; modelInstanceId?: string } | undefined;

    if (!p?.nodeId || !p?.modelInstanceId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "nodeId and modelInstanceId are required"),
      );
      return;
    }

    const result = await unloadModelFromNode(p.nodeId, p.modelInstanceId);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "unload failed"));
      return;
    }

    respond(true, { ok: true, nodeId: p.nodeId, modelInstanceId: p.modelInstanceId }, undefined);
  },

  // ─── LM Link CLI ────────────────────────────────────────────

  /** Enable LM Link via `lms link enable`. */
  "republic.lmlink.link.enable": async ({ respond }) => {
    const result = await enableLMLink();
    respond(
      result.ok,
      result.ok ? { ok: true, output: result.output } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.output || "lms CLI not found"),
    );
  },

  /** Disable LM Link via `lms link disable`. */
  "republic.lmlink.link.disable": async ({ respond }) => {
    const result = await disableLMLink();
    respond(
      result.ok,
      result.ok ? { ok: true, output: result.output } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.output || "lms CLI not found"),
    );
  },

  /**
   * Initiate LM Studio login via `lms login`.
   * Opens browser for LM Studio account authentication on the host machine.
   */
  "republic.lmlink.link.login": async ({ respond }) => {
    const result = await loginLMLink();
    respond(
      result.ok,
      result.ok
        ? { ok: true, output: result.output, message: "LM Studio login initiated — check browser on host machine" }
        : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.UNAVAILABLE, result.output || "lms CLI not found"),
    );
  },

  // ─── Routing ────────────────────────────────────────────────

  /** Current routing config and selected node. */
  "republic.lmlink.routing.status": ({ respond }) => {
    const config = getLMLinkRoutingConfig();
    const selected = selectBestLMLinkNode();
    const nodes = getLMLinkNodes();

    respond(
      true,
      {
        ok: true,
        routingConfig: config,
        selectedNode: selected
          ? {
              id: selected.id,
              label: selected.label,
              host: selected.host,
              port: selected.port,
              status: selected.status,
              latencyMs: selected.latencyMs,
              gpuProfile: selected.gpuProfile,
              isPowerNode: selected.isPowerNode,
            }
          : null,
        onlineNodes: nodes
          .filter((n) => n.status === "online")
          .map((n) => ({
            id: n.id,
            label: n.label,
            latencyMs: n.latencyMs,
            isPowerNode: n.isPowerNode,
            loadedModelCount: n.models.filter((m) => m.loaded).length,
          })),
      },
      undefined,
    );
  },

  /**
   * Update routing configuration.
   * Set preferredNodeId (or null for auto), strategy, fallbackToLocal.
   */
  "republic.lmlink.routing.set": ({ params, respond }) => {
    const p = params as {
      preferredNodeId?: string | null;
      strategy?: "auto" | "manual";
      fallbackToLocal?: boolean;
    } | undefined;

    if (!p) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "routing config params required"));
      return;
    }

    // Validate preferredNodeId if provided
    if (p.preferredNodeId !== undefined && p.preferredNodeId !== null) {
      const node = getLMLinkNode(p.preferredNodeId);
      if (!node) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `node '${p.preferredNodeId}' not found`));
        return;
      }
    }

    const updated = setLMLinkRoutingConfig({
      ...(p.preferredNodeId !== undefined ? { preferredNodeId: p.preferredNodeId } : {}),
      ...(p.strategy !== undefined ? { strategy: p.strategy } : {}),
      ...(p.fallbackToLocal !== undefined ? { fallbackToLocal: p.fallbackToLocal } : {}),
    });

    const selected = selectBestLMLinkNode();

    respond(
      true,
      {
        ok: true,
        routingConfig: updated,
        selectedNode: selected
          ? { id: selected.id, label: selected.label, status: selected.status }
          : null,
      },
      undefined,
    );
  },
};
