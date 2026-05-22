/**
 * Republic Platform — ComfyUI RPC Handlers
 *
 * Gateway endpoints for ComfyUI management: status, launch, model
 * downloads (with queue, pause/resume, progress), GPU info, and model listing.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  checkCUDAAvailability,
  ensureComfyUI,
  getComfyUIStatus,
  getModelRegistry,
  listInstalledModels,
} from "../../../republic/comfyui-manager.js";
import {
  enqueueDownload,
  pauseDownload,
  resumeDownload,
  cancelDownload,
  getAllDownloads,
  clearCompletedDownloads,
} from "../../../republic/comfyui-download-manager.js";

export const comfyuiHandlers: Partial<GatewayRequestHandlers> = {
  "republic.comfyui.status": async ({ respond }) => {
    const status = await getComfyUIStatus();
    respond(true, { ok: true, ...status }, undefined);
  },

  "republic.comfyui.launch": async ({ respond }) => {
    const result = await ensureComfyUI();
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.comfyui.models.list": async ({ respond }) => {
    const installed = await listInstalledModels();
    const available = getModelRegistry();
    respond(true, { ok: true, installed, available }, undefined);
  },

  // Legacy: synchronous download (kept for agent tool compatibility)
  "republic.comfyui.models.download": async ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    if (!p?.modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId required"));
      return;
    }
    // Now enqueues to the download manager instead of blocking
    const result = enqueueDownload(p.modelId);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "Download failed"));
      return;
    }
    respond(true, { ok: true, downloadId: result.downloadId }, undefined);
  },

  "republic.comfyui.gpu.status": async ({ respond }) => {
    const gpu = await checkCUDAAvailability();
    respond(true, { ok: true, gpu }, undefined);
  },

  // ─── Download Manager RPCs ──────────────────────────────────────

  /** Start a download (enqueue) */
  "republic.comfyui.downloads.start": async ({ params, respond }) => {
    const p = params as { modelId?: string } | undefined;
    if (!p?.modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelId required"));
      return;
    }
    const result = enqueueDownload(p.modelId);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "Failed to start download"));
      return;
    }
    respond(true, { ok: true, downloadId: result.downloadId }, undefined);
  },

  /** Pause an active download */
  "republic.comfyui.downloads.pause": async ({ params, respond }) => {
    const p = params as { downloadId?: string } | undefined;
    if (!p?.downloadId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "downloadId required"));
      return;
    }
    const result = pauseDownload(p.downloadId);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "Failed to pause"));
      return;
    }
    respond(true, { ok: true }, undefined);
  },

  /** Resume a paused download */
  "republic.comfyui.downloads.resume": async ({ params, respond }) => {
    const p = params as { downloadId?: string } | undefined;
    if (!p?.downloadId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "downloadId required"));
      return;
    }
    const result = resumeDownload(p.downloadId);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "Failed to resume"));
      return;
    }
    respond(true, { ok: true }, undefined);
  },

  /** Cancel a download */
  "republic.comfyui.downloads.cancel": async ({ params, respond }) => {
    const p = params as { downloadId?: string } | undefined;
    if (!p?.downloadId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "downloadId required"));
      return;
    }
    const result = cancelDownload(p.downloadId);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error ?? "Failed to cancel"));
      return;
    }
    respond(true, { ok: true }, undefined);
  },

  /** Get all download statuses (active, queued, completed) */
  "republic.comfyui.downloads.status": async ({ respond }) => {
    const downloads = getAllDownloads();
    respond(true, { ok: true, ...downloads }, undefined);
  },

  /** Clear completed download history */
  "republic.comfyui.downloads.clear": async ({ respond }) => {
    clearCompletedDownloads();
    respond(true, { ok: true }, undefined);
  },
};
