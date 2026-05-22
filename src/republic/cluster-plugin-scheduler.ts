/**
 * Cluster Plugin Scheduler
 *
 * Sits between hoc-plugin-manager.ts and plugin-bus.ts.
 * When activatePlugin() is called, this scheduler decides which cluster node
 * should host the plugin worker based on:
 *   1. Hardware requirements (VRAM, RAM, CPU, tags)
 *   2. Node health metrics (CPU%, memory%)
 *   3. Soft/hard affinity to specific nodes
 *   4. Load balancing across eligible nodes
 *
 * If the best node is the local node → normal local spawn.
 * If the best node is remote → delegates via RemotePluginWorker (Phase 4).
 */

import type { GatewayInfo } from "../cluster/redis-state-store.js";
import type { HoCPluginManifest } from "./hoc-plugin-types.js";
import {
  capabilitiesSatisfy,
  scoreNode,
  type NodeCapabilities,
} from "../cluster/node-capabilities.js";
import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("cluster:scheduler");

// ─── Types ───────────────────────────────────────────────────────

export interface SchedulerNodeInfo {
  /** Cluster node/gateway ID */
  nodeId: string;
  /** Hostname */
  host: string;
  /** Node capabilities (GPUs, RAM, CPU, tags) */
  capabilities: NodeCapabilities;
  /** Live health metrics */
  health: { cpu: number; memory: number };
  /** Plugin IDs currently running on this node */
  activePlugins: string[];
}

export interface PlacementDecision {
  /** Selected node ID */
  nodeId: string;
  /** Whether this is the local node */
  isLocal: boolean;
  /** Node hostname (for logging/display) */
  host: string;
  /** Score that won the placement (0–1) */
  score: number;
  /** Reason for placement */
  reason: string;
}

export interface SchedulerOptions {
  /** The local node's gateway ID */
  localNodeId: string;
}

// ─── Scheduler Class ────────────────────────────────────────────

export class ClusterPluginScheduler {
  private localNodeId: string;

  constructor(opts: SchedulerOptions) {
    this.localNodeId = opts.localNodeId;
  }

  /**
   * Select the best node for a plugin based on its manifest requirements
   * and the current state of all cluster nodes.
   *
   * @param manifest — Plugin manifest with optional nodeRequirements
   * @param clusterNodes — All gateway infos from Redis (with capabilities)
   * @returns PlacementDecision or null if no suitable node exists
   */
  selectNode(manifest: HoCPluginManifest, clusterNodes: GatewayInfo[]): PlacementDecision | null {
    const reqs = manifest.nodeRequirements;

    // Convert GatewayInfo[] to SchedulerNodeInfo[] (filter out nodes without capabilities)
    const candidates: SchedulerNodeInfo[] = clusterNodes
      .filter((gw) => gw.capabilities != null)
      .map((gw) => ({
        nodeId: gw.id,
        host: gw.host,
        capabilities: gw.capabilities!,
        health: gw.health,
        activePlugins: gw.activePlugins ?? [],
      }));

    if (candidates.length === 0) {
      logger.warn(`No nodes with capabilities detected for plugin ${manifest.id}`);
      return this.fallbackToLocal(manifest, clusterNodes);
    }

    // ── Step 1: Filter by hard requirements ──
    let eligible = candidates;

    if (reqs) {
      eligible = candidates.filter((node) =>
        capabilitiesSatisfy(node.capabilities, reqs, node.nodeId),
      );

      if (eligible.length === 0) {
        logger.warn(
          `No eligible nodes for plugin ${manifest.id} (requirements: ${JSON.stringify(reqs)}). ` +
            `Falling back to local node.`,
        );
        return this.fallbackToLocal(manifest, clusterNodes);
      }
    }

    // ── Step 2: Check maxInstances cluster-wide ──
    if (manifest.maxInstances != null) {
      const currentInstances = candidates.filter((n) =>
        n.activePlugins.includes(manifest.id),
      ).length;

      if (currentInstances >= manifest.maxInstances) {
        logger.info(
          `Plugin ${manifest.id} already has ${currentInstances}/${manifest.maxInstances} instances. Skipping spawn.`,
        );
        return null;
      }
    }

    // ── Step 3: Score eligible nodes ──
    const scored = eligible.map((node) => ({
      node,
      score: scoreNode(node.capabilities, node.health, manifest.id),
    }));

    // ── Step 4: Apply soft affinity bonus (preferred node) ──
    if (reqs?.preferredNodeId) {
      for (const entry of scored) {
        if (entry.node.nodeId === reqs.preferredNodeId) {
          // Significant boost (0.25) but not override if node is heavily loaded
          entry.score += 0.25;
        }
      }
    }

    // ── Step 5: Prefer nodes that don't already run this plugin (spread) ──
    for (const entry of scored) {
      if (entry.node.activePlugins.includes(manifest.id)) {
        // Penalty for running this plugin already (unless redundancy mode)
        if (!manifest.redundancy || manifest.redundancy <= 1) {
          entry.score -= 0.3;
        }
      }
    }

    // ── Step 6: Sort by score (descending) and pick the best ──
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    const isLocal = best.node.nodeId === this.localNodeId;
    const reason = this.buildReason(best.node, manifest, best.score, isLocal);

    logger.info(`Plugin ${manifest.id} → ${best.node.nodeId} (${best.node.host})`, {
      score: best.score.toFixed(3),
      isLocal,
      reason,
      allScores: scored.map((s) => `${s.node.nodeId}:${s.score.toFixed(3)}`),
    });

    return {
      nodeId: best.node.nodeId,
      isLocal,
      host: best.node.host,
      score: best.score,
      reason,
    };
  }

  /**
   * Select nodes for redundant placement (N replicas across different nodes).
   */
  selectNodesForRedundancy(
    manifest: HoCPluginManifest,
    clusterNodes: GatewayInfo[],
    count: number,
  ): PlacementDecision[] {
    const decisions: PlacementDecision[] = [];
    const usedNodeIds = new Set<string>();

    for (let i = 0; i < count; i++) {
      // Filter out already-used nodes for each pass
      const availableNodes = clusterNodes.filter((gw) => !usedNodeIds.has(gw.id));

      if (availableNodes.length === 0) {
        logger.warn(`Only ${i} of ${count} redundancy replicas could be placed for ${manifest.id}`);
        break;
      }

      const decision = this.selectNode(manifest, availableNodes);
      if (decision) {
        decisions.push(decision);
        usedNodeIds.add(decision.nodeId);
      }
    }

    return decisions;
  }

  /**
   * Fallback: always use the local node if no proper placement is possible.
   */
  private fallbackToLocal(
    manifest: HoCPluginManifest,
    clusterNodes: GatewayInfo[],
  ): PlacementDecision {
    const local = clusterNodes.find((gw) => gw.id === this.localNodeId);
    return {
      nodeId: this.localNodeId,
      isLocal: true,
      host: local?.host ?? "localhost",
      score: 0,
      reason: `Fallback to local node (no suitable remote node for ${manifest.id})`,
    };
  }

  /**
   * Build a human-readable reason string for why a node was selected.
   */
  private buildReason(
    node: SchedulerNodeInfo,
    manifest: HoCPluginManifest,
    score: number,
    isLocal: boolean,
  ): string {
    const parts: string[] = [];

    if (isLocal) {
      parts.push("local node");
    } else {
      parts.push(`remote node ${node.host}`);
    }

    const caps = node.capabilities;
    if (caps.gpus.length > 0) {
      parts.push(`${caps.gpus.length} GPU(s), ${caps.freeVramGb}GB free VRAM`);
    }
    parts.push(`${caps.freeRamGb.toFixed(1)}GB free RAM`);
    parts.push(`CPU ${node.health.cpu.toFixed(0)}%`);
    parts.push(`score=${score.toFixed(3)}`);

    if (manifest.nodeRequirements?.preferredNodeId === node.nodeId) {
      parts.push("soft affinity match");
    }

    return parts.join(", ");
  }
}

// ─── Singleton ──────────────────────────────────────────────────

let scheduler: ClusterPluginScheduler | null = null;

export function getPluginScheduler(opts?: SchedulerOptions): ClusterPluginScheduler {
  if (!scheduler && opts) {
    scheduler = new ClusterPluginScheduler(opts);
  }
  if (!scheduler) {
    throw new Error(
      "Plugin scheduler not initialized. Call getPluginScheduler({ localNodeId }) first.",
    );
  }
  return scheduler;
}

export function resetPluginScheduler(): void {
  scheduler = null;
}
