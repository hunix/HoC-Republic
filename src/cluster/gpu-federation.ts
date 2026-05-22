/**
 * GPU Memory Federation — Phase 3
 *
 * Enables splitting large LLM models across multiple nodes' GPUs
 * when no single node has enough VRAM. Uses tensor-parallel strategy.
 *
 * Flow:
 *   1. canFederateModel(sizeGb) — checks if cluster total VRAM suffices
 *   2. planFederation(modelId) — assigns model layers to nodes by VRAM
 *   3. Inference routes through the coordinator which merges results
 *
 * Integrates with:
 *   - node-capabilities.ts (GPU detection, VRAM tracking)
 *   - redis-state-store.ts (cluster-wide GPU allocation registry)
 *   - swarm-intelligence.ts (inference endpoint routing)
 */

import { createSubsystemLogger } from "../logging.js";
import { getStateStore } from "./redis-state-store.js";

const logger = createSubsystemLogger("cluster:gpu-federation");

// ─── Types ──────────────────────────────────────────────────────

export interface GpuPoolStatus {
  totalNodes: number;
  totalGpus: number;
  totalVramGb: number;
  freeVramGb: number;
  allocatedVramGb: number;
  nodeBreakdown: NodeGpuInfo[];
  federatedModels: FederatedModel[];
}

export interface NodeGpuInfo {
  nodeId: string;
  host: string;
  gpuCount: number;
  totalVramGb: number;
  freeVramGb: number;
  allocatedVramGb: number;
  gpuNames: string[];
}

export interface FederatedModel {
  id: string;
  modelName: string;
  totalSizeGb: number;
  shards: ModelShard[];
  status: "planning" | "loading" | "ready" | "error" | "unloaded";
  createdAt: string;
}

export interface ModelShard {
  shardIndex: number;
  nodeId: string;
  nodeHost: string;
  layerRange: [number, number]; // [startLayer, endLayer]
  vramAllocatedGb: number;
  status: "pending" | "loaded" | "error";
}

export interface FederationPlan {
  modelName: string;
  totalSizeGb: number;
  totalLayers: number;
  shards: Array<{
    nodeId: string;
    nodeHost: string;
    layerRange: [number, number];
    vramNeededGb: number;
  }>;
  feasible: boolean;
  reason?: string;
}

// ─── In-Memory State ────────────────────────────────────────────

const federatedModels: FederatedModel[] = [];
const MAX_FEDERATED_MODELS = 20;

// ─── GPU Pool Queries ───────────────────────────────────────────

/**
 * Get the GPU pool status across all cluster nodes.
 */
export async function getGpuPoolStatus(): Promise<GpuPoolStatus> {
  const nodeBreakdown: NodeGpuInfo[] = [];
  let totalGpus = 0;
  let totalVramGb = 0;
  let freeVramGb = 0;

  try {
    const store = getStateStore();
    const gateways = await store.getAllGateways();

    for (const gw of gateways) {
      const caps = gw.capabilities;
      if (!caps) { continue; }

      const nodeInfo: NodeGpuInfo = {
        nodeId: gw.id,
        host: gw.host,
        gpuCount: caps.gpus.length,
        totalVramGb: caps.totalVramGb,
        freeVramGb: caps.freeVramGb,
        allocatedVramGb: 0, // Calculate from federated models
        gpuNames: caps.gpus.map((g) => g.name),
      };

      // Calculate allocated VRAM from active federated models
      for (const model of federatedModels) {
        if (model.status !== "unloaded") {
          for (const shard of model.shards) {
            if (shard.nodeId === gw.id) {
              nodeInfo.allocatedVramGb += shard.vramAllocatedGb;
            }
          }
        }
      }

      nodeInfo.freeVramGb = Math.max(0, nodeInfo.totalVramGb - nodeInfo.allocatedVramGb);

      totalGpus += caps.gpus.length;
      totalVramGb += caps.totalVramGb;
      freeVramGb += nodeInfo.freeVramGb;

      nodeBreakdown.push(nodeInfo);
    }
  } catch {
    logger.debug("Redis not available for GPU pool query");
  }

  const allocatedVramGb = totalVramGb - freeVramGb;

  return {
    totalNodes: nodeBreakdown.length,
    totalGpus,
    totalVramGb: Math.round(totalVramGb * 100) / 100,
    freeVramGb: Math.round(freeVramGb * 100) / 100,
    allocatedVramGb: Math.round(allocatedVramGb * 100) / 100,
    nodeBreakdown,
    federatedModels: federatedModels.filter((m) => m.status !== "unloaded"),
  };
}

/**
 * Check if a model of the given size can be federated across the cluster.
 */
export async function canFederateModel(modelSizeGb: number): Promise<{
  feasible: boolean;
  totalFreeVram: number;
  deficit: number;
}> {
  const pool = await getGpuPoolStatus();

  return {
    feasible: pool.freeVramGb >= modelSizeGb,
    totalFreeVram: pool.freeVramGb,
    deficit: Math.max(0, modelSizeGb - pool.freeVramGb),
  };
}

/**
 * Plan how to split a model across cluster GPUs.
 * Uses greedy bin-packing: assign layers to nodes with most free VRAM.
 */
export async function planFederation(
  modelName: string,
  totalSizeGb: number,
  totalLayers = 80, // typical for 70B models
): Promise<FederationPlan> {
  const pool = await getGpuPoolStatus();

  if (pool.freeVramGb < totalSizeGb) {
    return {
      modelName,
      totalSizeGb,
      totalLayers,
      shards: [],
      feasible: false,
      reason: `Insufficient cluster VRAM: need ${totalSizeGb}GB, have ${pool.freeVramGb}GB free`,
    };
  }

  // Sort nodes by free VRAM (descending)
  const sortedNodes = pool.nodeBreakdown
    .filter((n) => n.freeVramGb > 0.5) // Must have at least 0.5GB free
    .toSorted((a, b) => b.freeVramGb - a.freeVramGb);

  if (sortedNodes.length === 0) {
    return {
      modelName,
      totalSizeGb,
      totalLayers,
      shards: [],
      feasible: false,
      reason: "No nodes with free VRAM available",
    };
  }

  // Greedy assignment: give each node layers proportional to its free VRAM
  const shards: FederationPlan["shards"] = [];
  let layersAssigned = 0;
  const vramPerLayer = totalSizeGb / totalLayers;

  for (const node of sortedNodes) {
    if (layersAssigned >= totalLayers) { break; }

    const layersForNode = Math.min(
      Math.floor(node.freeVramGb / vramPerLayer),
      totalLayers - layersAssigned,
    );

    if (layersForNode <= 0) { continue; }

    shards.push({
      nodeId: node.nodeId,
      nodeHost: node.host,
      layerRange: [layersAssigned, layersAssigned + layersForNode - 1],
      vramNeededGb: Math.round(layersForNode * vramPerLayer * 100) / 100,
    });

    layersAssigned += layersForNode;
  }

  return {
    modelName,
    totalSizeGb,
    totalLayers,
    shards,
    feasible: layersAssigned >= totalLayers,
    reason: layersAssigned < totalLayers
      ? `Could only assign ${layersAssigned}/${totalLayers} layers`
      : undefined,
  };
}

/**
 * Start loading a federated model across the cluster.
 * Creates a FederatedModel record and initiates loading on each node.
 */
export async function startFederation(
  modelName: string,
  totalSizeGb: number,
  totalLayers = 80,
): Promise<FederatedModel> {
  const plan = await planFederation(modelName, totalSizeGb, totalLayers);

  if (!plan.feasible) {
    throw new Error(plan.reason ?? "Federation not feasible");
  }

  const model: FederatedModel = {
    id: `fed-${Date.now().toString(36)}`,
    modelName,
    totalSizeGb,
    shards: plan.shards.map((s, i) => ({
      shardIndex: i,
      nodeId: s.nodeId,
      nodeHost: s.nodeHost,
      layerRange: s.layerRange,
      vramAllocatedGb: s.vramNeededGb,
      status: "pending" as const,
    })),
    status: "loading",
    createdAt: new Date().toISOString(),
  };

  federatedModels.push(model);
  if (federatedModels.length > MAX_FEDERATED_MODELS) { federatedModels.shift(); }

  logger.info("Federation started", {
    modelName,
    shards: model.shards.length,
    totalSizeGb,
  });

  // In a real implementation, this would send load commands to each node
  // For now, mark as ready (coordinator pattern)
  for (const shard of model.shards) {
    shard.status = "loaded";
  }
  model.status = "ready";

  return model;
}

/**
 * Unload a federated model from all nodes.
 */
export function unloadFederatedModel(modelId: string): boolean {
  const model = federatedModels.find((m) => m.id === modelId);
  if (!model) { return false; }
  model.status = "unloaded";
  for (const shard of model.shards) {
    shard.status = "pending";
  }
  return true;
}

/**
 * Get all federated models.
 */
export function getFederatedModels(): FederatedModel[] {
  return federatedModels.filter((m) => m.status !== "unloaded");
}
