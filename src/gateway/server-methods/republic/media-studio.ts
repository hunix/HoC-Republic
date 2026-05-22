/**
 * Republic Gateway Handlers — Media Studio
 *
 * RPC handlers for the Media Studio UI.
 * Routes generation requests through the media-router pipeline,
 * exposing GPU plugin capabilities to the web interface.
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  getMediaRouterDiagnostics,
  routeImageGeneration,
  routeVideoGeneration,
  routeAudioGeneration,
} from "../../../republic/media-router.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─── In-Memory Generation History ────────────────────────────────

interface GenerationEntry {
  id: string;
  type: string;
  prompt: string;
  status: "pending" | "complete" | "error";
  result: unknown;
  createdAt: number;
  completedAt: number | null;
  error: string | null;
}

const generationHistory: GenerationEntry[] = [];
const MAX_HISTORY = 50;
let idCounter = 0;

function addHistoryEntry(entry: GenerationEntry): void {
  generationHistory.unshift(entry);
  if (generationHistory.length > MAX_HISTORY) {
    generationHistory.length = MAX_HISTORY;
  }
}

// ─── Handlers ───────────────────────────────────────────────────

export const mediaStudioHandlers: Partial<GatewayRequestHandlers> = {
  /**
   * Get media generation capabilities — which plugin tools are available.
   */
  "republic.mediastudio.capabilities": ({ respond }) => {
    try {
      const diagnostics = getMediaRouterDiagnostics();
      respond(true, { ok: true, ...diagnostics }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get capabilities: ${String(err)}`),
      );
    }
  },

  /**
   * Generate media content via GPU plugins.
   * Params: { type: "image"|"video"|"audio"|"music"|"voice"|"3d", prompt: string, options?: {...} }
   */
  "republic.mediastudio.generate": async ({ params, respond }) => {
    try {
      const p = params as
        | {
            type?: string;
            prompt?: string;
            options?: Record<string, unknown>;
          }
        | undefined;

      if (!p?.type || !p?.prompt) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "type and prompt are required"),
        );
        return;
      }

      const entryId = `media-${++idCounter}-${Date.now()}`;
      const entry: GenerationEntry = {
        id: entryId,
        type: p.type,
        prompt: p.prompt,
        status: "pending",
        result: null,
        createdAt: Date.now(),
        completedAt: null,
        error: null,
      };
      addHistoryEntry(entry);

      let result: unknown;

      switch (p.type) {
        case "image": {
          const opts = p.options ?? {};
          const res = await routeImageGeneration(p.prompt, {
            width: (opts.width as number) ?? 1024,
            height: (opts.height as number) ?? 1024,
            seed: opts.seed as number | undefined,
            steps: opts.steps as number | undefined,
            guidanceScale: opts.guidanceScale as number | undefined,
          });
          result = res;
          break;
        }
        case "video": {
          const opts = p.options ?? {};
          const res = await routeVideoGeneration(p.prompt, {
            inputImage: opts.inputImage as string | undefined,
          });
          result = res;
          break;
        }
        case "audio":
        case "music":
        case "voice": {
          const audioType = p.type === "music" ? "music" : p.type === "voice" ? "speech" : "sound";
          const opts = p.options ?? {};
          const res = await routeAudioGeneration(p.prompt, {
            type: audioType,
            referenceAudio: opts.referenceAudio as string | undefined,
          });
          result = res;
          break;
        }
        case "3d": {
          // 3D uses the image generation router with sparc3d capability
          const res = await routeImageGeneration(p.prompt, {
            width: 512,
            height: 512,
          });
          result = res;
          break;
        }
        default:
          respond(
            false,
            undefined,
            errorShape(
              ErrorCodes.INVALID_REQUEST,
              `Unknown type: ${p.type}. Use image, video, audio, music, voice, or 3d`,
            ),
          );
          return;
      }

      if (result && (result as Record<string, unknown>).success) {
        entry.status = "complete";
        entry.result = result;
        entry.completedAt = Date.now();
        respond(true, { ok: true, generation: entry }, undefined);
      } else {
        entry.status = "error";
        entry.error =
          ((result as Record<string, unknown>)?.error as string) ??
          "No plugin available for this capability";
        entry.completedAt = Date.now();
        respond(true, { ok: true, generation: entry }, undefined);
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, `Generation failed: ${err}`));
    }
  },

  /**
   * Get generation history.
   * Params: { limit?: number }
   */
  "republic.mediastudio.history": ({ params, respond }) => {
    try {
      const p = params as { limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 20, MAX_HISTORY);
      const history = generationHistory.slice(0, limit);

      // Compute derived stats the UI reads
      const byType: Record<string, number> = {};
      for (const h of generationHistory) {byType[h.type] = (byType[h.type] ?? 0) + 1;}
      const totalGenerated = generationHistory.filter(h => h.status === "complete").length;
      const queue = generationHistory
        .filter(h => h.status === "pending")
        .map(h => ({
          id: h.id,
          type: h.type,
          prompt: h.prompt,
          status: "processing",
          progress: Math.min(90, Math.round((Date.now() - h.createdAt) / 1000)),
        }));

      respond(true, { ok: true, history, totalGenerated, byType, queue, total: generationHistory.length }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, `Failed to get history: ${String(err)}`),
      );
    }
  },

  "republic.mediastudio.delete": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, { code: "INVALID_REQUEST", message: "Missing media ID" });
      return;
    }
    // Dummy successful response since generated media objects are ephemeral for now
    respond(true, { ok: true, id: p.id }, undefined);
  },
};
