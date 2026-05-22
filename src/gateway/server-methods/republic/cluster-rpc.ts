/**
 * Cluster RPC Handlers — Phase 3
 * republic.cluster.*
 *
 * Distributed Docker, mTLS, GPU federation, citizen migration.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { listAllContainersAcrossCluster, execRemoteCommand, launchRemotePreset, removeRemoteContainer } from "../../../cluster/remote-docker.js";
import { getTLSStatus, ensureCA, ensureNodeCert } from "../../../cluster/cluster-tls.js";
import { getGpuPoolStatus, canFederateModel, startFederation, getFederatedModels, unloadFederatedModel } from "../../../cluster/gpu-federation.js";
import { migrateCitizen, getMigrations, getMigration, getActiveMigrations, rollbackMigration } from "../../../cluster/citizen-migration.js";
import { loadClusterConfig } from "../../../cluster/cluster-config.js";

export const clusterHandlers: Partial<GatewayRequestHandlers> = {

  /** List all cluster nodes with capabilities */
  "republic.cluster.nodes": async ({ respond }) => {
    try {
      const { getStateStore } = await import("../../../cluster/redis-state-store.js");
      const store = getStateStore();
      const gateways = await store.getAllGateways();
      respond(true, { nodes: gateways }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** List all containers across all cluster nodes */
  "republic.cluster.containers": async ({ respond }) => {
    try {
      const containers = await listAllContainersAcrossCluster();
      respond(true, { containers, total: containers.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Execute command on a remote container */
  "republic.cluster.docker.exec": async ({ params, respond }) => {
    const p = params as { nodeHost?: string; nodePort?: number; containerId?: string; command?: string } | null;
    if (!p?.nodeHost || !p?.containerId || !p?.command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeHost, containerId, command required"));
      return;
    }
    try {
      const output = await execRemoteCommand(p.nodeHost, p.nodePort ?? 18789, p.containerId, p.command);
      respond(true, { output }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Launch a Docker preset on a specific node */
  "republic.cluster.docker.launch": async ({ params, respond }) => {
    const p = params as { nodeHost?: string; nodePort?: number; preset?: string; purpose?: string } | null;
    if (!p?.nodeHost || !p?.preset || !p?.purpose) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeHost, preset, purpose required"));
      return;
    }
    try {
      const container = await launchRemotePreset(p.nodeHost, p.nodePort ?? 18789, p.preset, p.purpose);
      respond(true, { container }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Remove a container on a remote node */
  "republic.cluster.docker.remove": async ({ params, respond }) => {
    const p = params as { nodeHost?: string; nodePort?: number; containerId?: string } | null;
    if (!p?.nodeHost || !p?.containerId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "nodeHost, containerId required"));
      return;
    }
    try {
      const ok = await removeRemoteContainer(p.nodeHost, p.nodePort ?? 18789, p.containerId);
      respond(true, { ok }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** mTLS certificate status */
  "republic.cluster.tls.status": ({ respond }) => {
    try {
      const config = loadClusterConfig();
      const status = getTLSStatus(config.nodeId);
      respond(true, status, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Generate/rotate cluster TLS certificates */
  "republic.cluster.tls.generate": ({ respond }) => {
    try {
      const config = loadClusterConfig();
      const ca = ensureCA();
      const node = ensureNodeCert(config.nodeId);
      respond(true, {
        caGenerated: !!ca.certPem,
        nodeCertGenerated: !!node.certPem,
        nodeId: config.nodeId,
      }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** GPU federation pool status */
  "republic.cluster.gpu.pool": async ({ respond }) => {
    try {
      const pool = await getGpuPoolStatus();
      respond(true, pool, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Check if a model can be federated */
  "republic.cluster.gpu.check": async ({ params, respond }) => {
    const p = params as { modelSizeGb?: number } | null;
    if (!p?.modelSizeGb) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelSizeGb required"));
      return;
    }
    try {
      const result = await canFederateModel(p.modelSizeGb);
      respond(true, result, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Start model federation across cluster GPUs */
  "republic.cluster.gpu.federate": async ({ params, respond }) => {
    const p = params as { modelName?: string; totalSizeGb?: number; totalLayers?: number } | null;
    if (!p?.modelName || !p?.totalSizeGb) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelName and totalSizeGb required"));
      return;
    }
    try {
      const model = await startFederation(p.modelName, p.totalSizeGb, p.totalLayers);
      respond(true, model, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** List federated models */
  "republic.cluster.gpu.models": ({ respond }) => {
    respond(true, { models: getFederatedModels() }, undefined);
  },

  /** Unload a federated model */
  "republic.cluster.gpu.unload": ({ params, respond }) => {
    const p = params as { modelId?: string } | null;
    if (!p?.modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId required"));
      return;
    }
    const ok = unloadFederatedModel(p.modelId);
    respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Model not found"));
  },

  /** Initiate citizen migration */
  "republic.cluster.migrate": async ({ params, respond }) => {
    const p = params as { citizenId?: string; fromNode?: string; toNode?: string; citizenState?: unknown } | null;
    if (!p?.citizenId || !p?.fromNode || !p?.toNode) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId, fromNode, toNode required"));
      return;
    }
    try {
      const record = await migrateCitizen(p.citizenId, p.fromNode, p.toNode, p.citizenState ?? {});
      respond(true, record, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },

  /** Get migration status */
  "republic.cluster.migrate.status": ({ params, respond }) => {
    const p = params as { migrationId?: string } | null;
    if (p?.migrationId) {
      const record = getMigration(p.migrationId);
      if (!record) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Migration not found"));
        return;
      }
      respond(true, record, undefined);
    } else {
      respond(true, {
        active: getActiveMigrations(),
        history: getMigrations(50),
      }, undefined);
    }
  },

  /** Rollback a migration */
  "republic.cluster.migrate.rollback": async ({ params, respond }) => {
    const p = params as { migrationId?: string } | null;
    if (!p?.migrationId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "migrationId required"));
      return;
    }
    try {
      const ok = await rollbackMigration(p.migrationId);
      respond(ok, ok ? { ok: true } : undefined, ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Migration not found or already completed"));
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)));
    }
  },
};
