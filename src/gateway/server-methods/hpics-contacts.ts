/**
 * Gateway Handler — hpics.contacts.*
 *
 * Bridges HoC gateway to HPICS contact intelligence.
 * Contacts live in HPICS Supabase; all read/write goes through HPICS gateway.
 *
 * Methods:
 *   hpics.contacts.list          — paginated contact list (with optional search/filter)
 *   hpics.contacts.get           — single contact with all enrichment data
 *   hpics.contacts.assets.list   — media assets for a contact (audio/images/video/docs)
 *   hpics.contacts.enrich        — run HPICS enrichment on a contact
 *   hpics.contacts.dossier       — generate full HPICS intelligence dossier
 *   hpics.contacts.analyze.voice — run voice analysis on a contact's audio asset
 *   hpics.contacts.analyze.face  — run facial/deepfake analysis on a contact's image/video
 *   hpics.contacts.aggregate     — aggregate all contact intelligence (mosaic view)
 *   hpics.contacts.network       — social network analysis for a contact
 *   hpics.contacts.predict       — behavioral prediction for a contact
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

// Re-export the callHpics helper — hpics.ts exports getHpicsConfig; we build our own caller here
// to avoid circular import, but we share the same env config.

async function callHpics(
  body: Record<string, unknown>,
  timeoutMs = 30_000,
): Promise<{ ok: boolean; data?: unknown; error?: string; meta?: unknown }> {
  const url = process.env.HPICS_GATEWAY_URL?.trim();
  const key = process.env.HPICS_API_KEY?.trim();
  if (!url || !key) {
    return { ok: false, error: "HPICS not configured — set HPICS_GATEWAY_URL and HPICS_API_KEY" };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => { ctrl.abort(); }, timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const payload = (await res.json()) as { success?: boolean; data?: unknown; meta?: unknown; error?: string; message?: string };
    if (!res.ok || payload.success === false) {
      return { ok: false, error: payload.error ?? payload.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: payload.data, meta: payload.meta };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: `HPICS timed out after ${timeoutMs / 1000}s` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function requireString(v: unknown, field: string): { value: string } | { error: string } {
  if (typeof v === "string" && v.trim()) {
    return { value: v.trim() };
  }
  return { error: `${field} (string) is required` };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export const hpicsContactHandlers: Partial<GatewayRequestHandlers> = {

  /**
   * hpics.contacts.list
   * Params: { search?, limit?, offset?, tag?, enriched? }
   * Returns: { contacts: Contact[], total, hasMore }
   *
   * A contact object has: id, name, email?, phone?, avatar?, tags[], hasAudio, hasImages, hasVideos
   */
  "hpics.contacts.list": async ({ params, respond }) => {
    const p = params as {
      search?: string;
      limit?: number;
      offset?: number;
      tag?: string;
      enriched?: boolean;
    };

    const result = await callHpics({
      tool: "aggregate-contact-intelligence",
      params: {
        action: "list",
        search: p.search,
        limit: Math.min(p.limit ?? 50, 200),
        offset: p.offset ?? 0,
        tag: p.tag,
        enriched: p.enriched,
      },
    });

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to list contacts"));
      return;
    }
    respond(true, { ok: true, ...(result.data as Record<string, unknown>) }, undefined);
  },

  /**
   * hpics.contacts.get
   * Params: { contactId }
   * Returns: full contact object with enrichment, social data, and asset counts
   */
  "hpics.contacts.get": async ({ params, respond }) => {
    const p = params as { contactId?: unknown };
    const r = requireString(p.contactId, "contactId");
    if ("error" in r) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.error));
      return;
    }

    const result = await callHpics({
      tool: "aggregate-contact-intelligence",
      params: { action: "get", contactId: r.value },
    });

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to get contact"));
      return;
    }
    respond(true, { ok: true, ...(result.data as Record<string, unknown>) }, undefined);
  },

  /**
   * hpics.contacts.assets.list
   * Params: { contactId, type?: "audio"|"image"|"video"|"document"|"all" }
   * Returns: { assets: Asset[] } where Asset has { id, url, type, name, size, createdAt, mime }
   *
   * Assets are fetched from HPICS Supabase Storage. Audio files can be used for voice analysis,
   * images/video for facial/deepfake analysis.
   */
  "hpics.contacts.assets.list": async ({ params, respond }) => {
    const p = params as { contactId?: unknown; type?: string };
    const r = requireString(p.contactId, "contactId");
    if ("error" in r) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.error));
      return;
    }

    const result = await callHpics({
      tool: "aggregate-media-intelligence",
      params: {
        action: "list-assets",
        contactId: r.value,
        type: p.type ?? "all",
      },
    });

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to list contact assets"));
      return;
    }
    respond(true, { ok: true, contactId: r.value, ...(result.data as Record<string, unknown>) }, undefined);
  },

  /**
   * hpics.contacts.enrich
   * Params: { contactId, depth?: "basic"|"deep" }
   * Runs HPICS enrichment pipeline: auto-enrich → OSINT → digital footprint
   */
  "hpics.contacts.enrich": async ({ params, respond }) => {
    const p = params as { contactId?: unknown; depth?: string };
    const r = requireString(p.contactId, "contactId");
    if ("error" in r) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.error));
      return;
    }

    const tool = p.depth === "deep" ? "deep-osint-scan" : "auto-enrich-contact";
    const result = await callHpics({ tool, params: { contactId: r.value } }, 60_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Contact enrichment failed"));
      return;
    }
    respond(true, { ok: true, contactId: r.value, tool, data: result.data }, undefined);
  },

  /**
   * hpics.contacts.dossier
   * Params: { contactId, depth?: "standard"|"deep"|"agis" }
   * Generates a full intelligence dossier for the contact.
   *  - standard: generate-intelligence-dossier
   *  - deep:     generate-dossier (enhanced)
   *  - agis:     agis-cascade-orchestrator (full pipeline)
   */
  "hpics.contacts.dossier": async ({ params, respond }) => {
    const p = params as { contactId?: unknown; depth?: string };
    const r = requireString(p.contactId, "contactId");
    if ("error" in r) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.error));
      return;
    }

    const toolMap: Record<string, string> = {
      standard: "generate-intelligence-dossier",
      deep: "generate-dossier",
      agis: "agis-cascade-orchestrator",
    };
    const tool = toolMap[p.depth ?? "standard"] ?? "generate-intelligence-dossier";
    const result = await callHpics({ tool, params: { contactId: r.value } }, 120_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Dossier generation failed"));
      return;
    }
    respond(true, { ok: true, contactId: r.value, tool, dossier: result.data }, undefined);
  },

  /**
   * hpics.contacts.analyze.voice
   * Params: { contactId, assetId, assetUrl, analysisType?: "comprehensive"|"deception"|"stress"|"stylometric" }
   * Runs voice analysis on a selected audio asset.
   */
  "hpics.contacts.analyze.voice": async ({ params, respond }) => {
    const p = params as {
      contactId?: unknown;
      assetId?: string;
      assetUrl?: unknown;
      analysisType?: string;
    };

    const cr = requireString(p.contactId, "contactId");
    if ("error" in cr) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, cr.error)); return; }

    const ur = requireString(p.assetUrl, "assetUrl");
    if ("error" in ur) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, ur.error)); return; }

    const toolMap: Record<string, string> = {
      comprehensive: "analyze-voice-comprehensive",
      deception: "linguistic-deception-analyzer",
      stress: "voice-stress-correlator",
      stylometric: "stylometric-fingerprinter",
    };
    const tool = toolMap[p.analysisType ?? "comprehensive"] ?? "analyze-voice-comprehensive";

    const result = await callHpics({
      tool,
      params: { contactId: cr.value, audioUrl: ur.value, assetId: p.assetId },
    });

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Voice analysis failed"));
      return;
    }
    respond(true, {
      ok: true,
      contactId: cr.value,
      assetUrl: ur.value,
      analysisType: p.analysisType ?? "comprehensive",
      tool,
      data: result.data,
    }, undefined);
  },

  /**
   * hpics.contacts.analyze.face
   * Params: { contactId, assetUrl, analysisType?: "biometrics"|"deepfake"|"microexpression"|"emotion" }
   * Runs facial / deepfake analysis on a selected image or video asset.
   */
  "hpics.contacts.analyze.face": async ({ params, respond }) => {
    const p = params as {
      contactId?: unknown;
      assetUrl?: unknown;
      assetId?: string;
      analysisType?: string;
      mediaType?: string;
    };

    const cr = requireString(p.contactId, "contactId");
    if ("error" in cr) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, cr.error)); return; }

    const ur = requireString(p.assetUrl, "assetUrl");
    if ("error" in ur) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, ur.error)); return; }

    const toolMap: Record<string, string> = {
      biometrics: "extract-facial-biometrics",
      deepfake: "deepfake-analyzer",
      microexpression: "microexpression-analyzer",
      emotion: "analyze-facial",
    };
    const tool = toolMap[p.analysisType ?? "biometrics"] ?? "extract-facial-biometrics";

    const result = await callHpics({
      tool,
      params: {
        contactId: cr.value,
        imageUrl: ur.value,
        mediaUrl: ur.value,
        mediaType: p.mediaType ?? "image",
        assetId: p.assetId,
      },
    });

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Face analysis failed"));
      return;
    }
    respond(true, {
      ok: true,
      contactId: cr.value,
      assetUrl: ur.value,
      analysisType: p.analysisType ?? "biometrics",
      tool,
      data: result.data,
    }, undefined);
  },

  /**
   * hpics.contacts.aggregate
   * Params: { contactId }
   * Aggregates all available intelligence: voice + media + social into a mosaic view.
   * Uses: aggregate-voice-intelligence, aggregate-media-intelligence, aggregate-social-intelligence
   */
  "hpics.contacts.aggregate": async ({ params, respond }) => {
    const p = params as { contactId?: unknown };
    const r = requireString(p.contactId, "contactId");
    if ("error" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.error)); return; }

    const [voiceResult, mediaResult, socialResult] = await Promise.allSettled([
      callHpics({ tool: "aggregate-voice-intelligence", params: { contactId: r.value } }),
      callHpics({ tool: "aggregate-media-intelligence", params: { contactId: r.value } }),
      callHpics({ tool: "aggregate-social-intelligence", params: { contactId: r.value } }),
    ]);

    respond(true, {
      ok: true,
      contactId: r.value,
      voice: voiceResult.status === "fulfilled" ? voiceResult.value.data : null,
      media: mediaResult.status === "fulfilled" ? mediaResult.value.data : null,
      social: socialResult.status === "fulfilled" ? socialResult.value.data : null,
    }, undefined);
  },

  /**
   * hpics.contacts.network
   * Params: { contactId, depth?: number }
   * Social network analysis — who they're connected to, power nodes, influence paths.
   */
  "hpics.contacts.network": async ({ params, respond }) => {
    const p = params as { contactId?: unknown; depth?: number };
    const r = requireString(p.contactId, "contactId");
    if ("error" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.error)); return; }

    const result = await callHpics({
      tool: "analyze-network-graph",
      params: { contactId: r.value, depth: p.depth ?? 2 },
    });

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Network analysis failed"));
      return;
    }
    respond(true, { ok: true, contactId: r.value, data: result.data }, undefined);
  },

  /**
   * hpics.contacts.predict
   * Params: { contactId, scenario? }
   * Behavioral prediction: likely next actions, trajectory, breaking points.
   */
  "hpics.contacts.predict": async ({ params, respond }) => {
    const p = params as { contactId?: unknown; scenario?: string };
    const r = requireString(p.contactId, "contactId");
    if ("error" in r) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, r.error)); return; }

    const result = await callHpics({
      tool: "predict-behavioral-scenarios",
      params: { contactId: r.value, scenario: p.scenario },
    }, 60_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Behavioral prediction failed"));
      return;
    }
    respond(true, { ok: true, contactId: r.value, data: result.data }, undefined);
  },
};
