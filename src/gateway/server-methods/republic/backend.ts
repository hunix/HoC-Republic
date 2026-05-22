/**
 * Republic Gateway Handlers â€” backend
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  getCircuitBreakerDiagnostics,
  getFreeCallPercentage,
  getProviderHealthReport,
  getProviderStatuses,
  getTierStats,
} from "../../../republic/compute-router.js";
// Phase 36: Dynamic Compute Scaling
import {
  getAllUsageRecords,
  getScalerDiagnostics,
  getUsageForCitizen,
  processQueue,
  recordUsage,
  requestCompute,
} from "../../../republic/compute-scaler.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
import { probeSystemResources } from "../../../republic/infra-control-plane.js";
// Phase 34: HuggingFace Model Provisioner
import {
  autoSelectModel,
  downloadGGUF,
  getDownloadProgress,
  getInstalledModels,
  getProvisionerDiagnostics,
  GGUF_MODEL_REGISTRY,
  loadIntoLMStudio,
  loadIntoOllama,
  provisionModel,
  searchHuggingFaceModels,
} from "../../../republic/model-provisioner.js";
// Phase 37: Database Persistence Layer
import {
  createSystemSnapshot,
  flushAllStores,
  getDomainStore,
  getPersistenceDiagnostics,
  listSystemSnapshots,
} from "../../../republic/persistence-layer.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const backendHandlers: Partial<GatewayRequestHandlers> = {
  "republic.models.registry": ({ respond }) => {
    respond(true, { ok: true, models: GGUF_MODEL_REGISTRY }, undefined);
  },

  "republic.models.installed": async ({ respond }) => {
    const models = await getInstalledModels();
    respond(true, { ok: true, models }, undefined);
  },

  "republic.models.search": async ({ params, respond }) => {
    const p = params as { query: string; limit?: number } | undefined;
    if (!p?.query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    const results = await searchHuggingFaceModels(p.query, p.limit);
    respond(true, { ok: true, results }, undefined);
  },

  "republic.models.download": async ({ params, respond }) => {
    const p = params as { repoId: string; filename: string; destDir?: string } | undefined;
    if (!p?.repoId || !p?.filename) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "repoId and filename required"),
      );
      return;
    }
    const filePath = await downloadGGUF(p.repoId, p.filename, p.destDir);
    respond(true, { ok: true, filePath }, undefined);
  },

  "republic.models.download.progress": ({ respond }) => {
    const progress = getDownloadProgress();
    respond(true, { ok: true, progress }, undefined);
  },

  "republic.models.provision": async ({ params, respond }) => {
    const p = params as { capabilities?: string[]; preference?: string } | undefined;
    const result = await provisionModel(
      (p?.capabilities ?? ["chat"]) as never,
      (p?.preference ?? "balanced") as "quality" | "speed" | "balanced",
    );
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.models.load.ollama": async ({ params, respond }) => {
    const p = params as { modelPath: string; name?: string } | undefined;
    if (!p?.modelPath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelPath required"));
      return;
    }
    const modelName =
      p.name ??
      p.modelPath
        .split(/[/\\]/)
        .pop()
        ?.replace(/\.gguf$/i, "") ??
      "model";
    const ok = await loadIntoOllama(p.modelPath, modelName);
    respond(true, { ok }, undefined);
  },

  "republic.models.load.lmstudio": async ({ params, respond }) => {
    const p = params as { modelPath: string } | undefined;
    if (!p?.modelPath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelPath required"));
      return;
    }
    const ok = await loadIntoLMStudio(p.modelPath);
    respond(true, { ok }, undefined);
  },

  "republic.models.select": async ({ params, respond }) => {
    const p = params as { capabilities?: string[]; preference?: string } | undefined;
    const resources = await probeSystemResources();
    const selection = autoSelectModel(
      (p?.capabilities ?? ["chat"]) as never,
      resources,
      (p?.preference ?? "balanced") as "quality" | "speed" | "balanced",
    );
    respond(true, { ok: true, selection }, undefined);
  },

  "republic.models.diagnostics": ({ respond }) => {
    const diag = getProvisionerDiagnostics();
    respond(true, { ok: true, ...diag }, undefined);
  },

  // ─── Phase 36: Compute Scaler ────────────────────────────────

  "republic.compute.request": async ({ params, respond }) => {
    const p = params as
      | {
          citizenId: string;
          task: { type: string; description: string; complexity: number };
          preferredModel?: string;
          preference?: string;
          priority?: number;
        }
      | undefined;
    if (!p?.citizenId || !p?.task) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and task required"),
      );
      return;
    }
    const result = await requestCompute(p.citizenId, {
      task: p.task as never,
      preferredModel: p.preferredModel,
      preference: (p.preference ?? "balanced") as "quality" | "speed" | "balanced",
      priority: p.priority,
    });
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.compute.usage": ({ params, respond }) => {
    const p = params as { citizenId: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const usage = getUsageForCitizen(p.citizenId);
    respond(true, { ok: true, usage }, undefined);
  },

  "republic.compute.usage.all": ({ respond }) => {
    const records = getAllUsageRecords();
    respond(true, { ok: true, records }, undefined);
  },

  "republic.compute.record": ({ params, respond }) => {
    const p = params as { requestId: string; tokensUsed: number; latencyMs: number } | undefined;
    if (!p?.requestId || p.tokensUsed == null || p.latencyMs == null) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "requestId, tokensUsed, latencyMs required"),
      );
      return;
    }
    recordUsage(p.requestId, p.tokensUsed, p.latencyMs);
    respond(true, { ok: true }, undefined);
  },

  "republic.compute.queue.process": async ({ respond }) => {
    const processed = await processQueue();
    respond(true, { ok: true, processed }, undefined);
  },

  "republic.compute.diagnostics": ({ respond }) => {
    const diag = getScalerDiagnostics();
    respond(true, { ok: true, ...diag }, undefined);
  },

  "republic.system.pulse": ({ respond }) => {
    const providerHealth = getProviderHealthReport();
    const circuitBreakers = getCircuitBreakerDiagnostics();
    const tierStats = getTierStats();
    const freeCallPct = getFreeCallPercentage();
    const providerStatuses = getProviderStatuses();
    const totalProviders = Object.keys(providerStatuses).length;
    const healthyProviders = Object.values(providerStatuses).filter((p) => p.available).length;
    const degradedMode = totalProviders > 0 && healthyProviders === 0;
    respond(
      true,
      {
        ok: true,
        providerHealth,
        circuitBreakers,
        tierStats,
        freeCallPct,
        totalProviders,
        healthyProviders,
        degradedMode,
      },
      undefined,
    );
  },

  // ─── Phase 37: Persistence Layer ─────────────────────────────

  "republic.persistence.flush": async ({ respond }) => {
    await flushAllStores();
    respond(true, { ok: true }, undefined);
  },

  "republic.persistence.snapshot.create": async ({ respond }) => {
    const path = await createSystemSnapshot();
    respond(true, { ok: true, path }, undefined);
  },

  "republic.persistence.snapshot.list": async ({ respond }) => {
    const snapshots = await listSystemSnapshots();
    respond(true, { ok: true, snapshots }, undefined);
  },

  "republic.persistence.diagnostics": async ({ respond }) => {
    const diag = await getPersistenceDiagnostics();
    respond(true, { ok: true, ...diag }, undefined);
  },

  "republic.persistence.store.stats": async ({ params, respond }) => {
    const p = params as { domain: string } | undefined;
    if (!p?.domain) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "domain required"));
      return;
    }
    const store = getDomainStore(p.domain);
    const stats = await store.getStats();

    respond(true, { ok: true, stats }, undefined);
  },
};
