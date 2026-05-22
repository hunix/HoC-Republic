/**
 * HPICS — Enhanced Gateway Bridge Handlers
 *
 * Exposes all 407 tools from the HPICS Personal Intelligence Control System
 * to HoC agents via standard RPC methods. Adds dedicated pipeline handlers
 * for voice analysis, deepfake detection, digital twin generation, and
 * cross-system intelligence pipelines with HoC's ComfyUI / AudioStudio /
 * VideoStudio generation tools.
 *
 * Architecture:
 *   HoC generation (ComfyUI / AudioStudio / VideoStudio)
 *     ↓ generated media / data
 *   hpics.pipeline.* handlers (this file)
 *     ↓ routed to HPICS domain routers
 *   HPICS intelligence analysis (voice / biometric / media / fusion)
 *     ↓ structured intelligence report
 *   HoC agent context / republic knowledge base
 *
 * Configuration (env vars):
 *   HPICS_GATEWAY_URL  — https://<project>.supabase.co/functions/v1/hoc-gateway
 *   HPICS_API_KEY      — shared Bearer token matching HOC_API_KEY on HPICS side
 *
 * HPICS API shape:
 *   POST { tool, params }              → { success, data, meta }
 *   POST { action: "list-tools" }      → { success, data: { categories, totalTools } }
 *   POST { action: "list-categories" } → { success, data }
 *   POST { action: "health" }          → { success, data }
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

// ─── Config ─────────────────────────────────────────────────────────────────

/** AGIS / large-pipeline tools may take 20–60s */
const HPICS_TIMEOUT_MS = 30_000;

export function getHpicsConfig(): { url: string; key: string } | null {
  const url = process.env.HPICS_GATEWAY_URL?.trim();
  const key = process.env.HPICS_API_KEY?.trim();
  if (!url || !key) {
    return null;
  }
  return { url, key };
}

// ─── HTTP Helper ─────────────────────────────────────────────────────────────

async function callHpics(
  body: Record<string, unknown>,
  timeoutMs = HPICS_TIMEOUT_MS,
): Promise<{ ok: boolean; data?: unknown; error?: string; meta?: unknown }> {
  const cfg = getHpicsConfig();
  if (!cfg) {
    return { ok: false, error: "HPICS not configured — set HPICS_GATEWAY_URL and HPICS_API_KEY" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, timeoutMs);

  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = (await res.json()) as {
      success?: boolean;
      data?: unknown;
      meta?: unknown;
      error?: string;
      message?: string;
    };

    if (!res.ok || payload.success === false) {
      return {
        ok: false,
        error: payload.error ?? payload.message ?? `HPICS gateway returned HTTP ${res.status}`,
      };
    }

    return { ok: true, data: payload.data, meta: payload.meta };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: `HPICS request timed out after ${timeoutMs / 1000}s` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Domain runner ───────────────────────────────────────────────────────────

async function runDomainTool(
  _router: string,
  tool: unknown,
  params: unknown,
  timeoutMs?: number,
): Promise<{ ok: boolean; data?: unknown; error?: string; meta?: unknown }> {
  if (typeof tool !== "string" || !tool.trim()) {
    return { ok: false, error: "tool name is required" };
  }
  return callHpics({ tool: tool.trim(), params: params ?? {} }, timeoutMs);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function requireString(v: unknown, _name: string): string | null {
  if (typeof v === "string" && v.trim()) {
    return v.trim();
  }
  return null;
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export const hpicsHandlers: Partial<GatewayRequestHandlers> = {

  // ══════════════════════════════════════════════════════════════════
  // META / DISCOVERY
  // ══════════════════════════════════════════════════════════════════

  /**
   * hpics.health — Check HPICS gateway health; returns status + config state.
   */
  "hpics.health": async ({ respond }) => {
    const configured = getHpicsConfig() !== null;
    if (!configured) {
      respond(true, {
        ok: true,
        configured: false,
        status: "unconfigured",
        message: "Set HPICS_GATEWAY_URL and HPICS_API_KEY in your .env to connect",
      }, undefined);
      return;
    }
    const result = await callHpics({ action: "health" });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS health check failed"));
      return;
    }
    respond(true, { ok: true, configured: true, ...result.data as Record<string, unknown> }, undefined);
  },

  /** hpics.tools.list — Full 407-tool catalog organised by category. */
  "hpics.tools.list": async ({ respond }) => {
    const result = await callHpics({ action: "list-tools" });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to list HPICS tools"));
      return;
    }
    respond(true, { ok: true, ...(result.data as Record<string, unknown>) }, undefined);
  },

  /** hpics.categories.list — 15 HPICS domain categories. */
  "hpics.categories.list": async ({ respond }) => {
    const result = await callHpics({ action: "list-categories" });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to list HPICS categories"));
      return;
    }
    respond(true, { ok: true, ...(result.data as Record<string, unknown>) }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // GENERIC EXECUTOR
  // ══════════════════════════════════════════════════════════════════

  /**
   * hpics.tool.run { tool, params } — Execute any of the 407 HPICS tools.
   *
   * Example: { tool: "mice-recruitment-analyzer", params: { ... } }
   */
  "hpics.tool.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    if (typeof p.tool !== "string" || !p.tool.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "tool (string) is required"));
      return;
    }
    const result = await callHpics({ tool: p.tool.trim(), params: p.params ?? {} }, 120_000);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? `HPICS tool '${p.tool}' failed`));
      return;
    }
    respond(true, { ok: true, tool: p.tool, data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // DOMAIN SHORTHANDS
  // ══════════════════════════════════════════════════════════════════

  /** hpics.analysis.run { tool, params } — 50+ behavioral / psychological analysis tools. */
  "hpics.analysis.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("analysis-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS analysis failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.intelligence.run { tool, params } — 55+ intelligence, dossier, orchestration tools. */
  "hpics.intelligence.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("intelligence-router", p.tool, p.params, 120_000);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS intelligence failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.prediction.run { tool, params } — 27+ behavioral prediction tools. */
  "hpics.prediction.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("prediction-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS prediction failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.warfare.run { tool, params } — 30+ cognitive / narrative warfare tools. */
  "hpics.warfare.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("warfare-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS warfare failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.biometric.run { tool, params } — 31+ biometric analysis tools. */
  "hpics.biometric.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("biometric-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS biometric failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.network.run { tool, params } — 20+ social graph / network analysis tools. */
  "hpics.network.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("network-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS network analysis failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.enrichment.run { tool, params } — 15+ contact enrichment / OSINT tools. */
  "hpics.enrichment.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("enrichment-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS enrichment failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.agis.run { tool, params } — AGIS 22-phase pipeline (highest-level orchestration). */
  "hpics.agis.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("agis-router", p.tool, p.params, 120_000);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS AGIS pipeline failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.fusion.run { tool, params } — Multi-source intelligence fusion tools. */
  "hpics.fusion.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("fusion-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS fusion failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.voice.run { tool, params } — Voice analysis, transcription, stress, deception tools. */
  "hpics.voice.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("voice-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS voice failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.document.run { tool, params } — Document intelligence, embedding, RAG tools. */
  "hpics.document.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("document-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS document failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.media.run { tool, params } — Media metadata, triangulation, affective analysis. */
  "hpics.media.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("media-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS media failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.utility.run { tool, params } — Utility, alerting, sync, reporting tools. */
  "hpics.utility.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("utility-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS utility failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.hardware.run { tool, params } — Drone, SDR, sensor, NFC, thermal, TSCM tools. */
  "hpics.hardware.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("hardware-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS hardware failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.security.run { tool, params } — Threat assessment, red team, OPSEC, crisis tools. */
  "hpics.security.run": async ({ params, respond }) => {
    const p = params as { tool?: unknown; params?: unknown };
    const result = await runDomainTool("security-router", p.tool, p.params);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "HPICS security failed"));
      return;
    }
    respond(true, { ok: true, data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 2 — v3.8.0 Agentic RAG, Graph-of-Thought, Verification
  // ══════════════════════════════════════════════════════════════════

  /**
   * hpics.rag.run — Agentic RAG Engine (Stanford/Google 2026)
   *
   * Multi-step iterative retrieval-augmented generation:
   *   Decompose → Retrieve parallel → Self-critique → Refine → Synthesize
   *
   * Params: { query, profileId?, userId?, maxIterations?, confidenceThreshold?, sourceTypes? }
   */
  "hpics.rag.run": async ({ params, respond }) => {
    const p = params as {
      query?: unknown;
      profileId?: string;
      userId?: string;
      maxIterations?: number;
      confidenceThreshold?: number;
      sourceTypes?: string[];
    };

    const query = requireString(p.query, "query");
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query (string) is required"));
      return;
    }

    const result = await callHpics({
      tool: "agentic-rag",
      params: {
        query,
        profileId: p.profileId,
        userId: p.userId,
        maxIterations: p.maxIterations ?? 3,
        confidenceThreshold: p.confidenceThreshold ?? 0.7,
        sourceTypes: p.sourceTypes,
      },
    }, 60_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Agentic RAG failed"));
      return;
    }
    respond(true, { ok: true, engine: "agentic-rag", data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.reasoning.graph — Graph-of-Thought Reasoning (MIT 2026 GoT)
   *
   * Directed graph reasoning with N competing hypotheses:
   *   Hypotheses → Evidence → Cross-Critique → Weighted Synthesis
   *
   * Modes: hypothesis-exploration, dossier-reasoning, threat-assessment, relationship-mapping
   * Params: { query, profileId?, userId?, mode?, numHypotheses? }
   */
  "hpics.reasoning.graph": async ({ params, respond }) => {
    const p = params as {
      query?: unknown;
      profileId?: string;
      userId?: string;
      mode?: string;
      numHypotheses?: number;
    };

    const query = requireString(p.query, "query");
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query (string) is required"));
      return;
    }

    const validModes = ["hypothesis-exploration", "dossier-reasoning", "threat-assessment", "relationship-mapping"];
    const mode = validModes.includes(p.mode ?? "") ? p.mode : "hypothesis-exploration";

    const result = await callHpics({
      tool: "graph-reasoning",
      params: {
        query,
        profileId: p.profileId,
        userId: p.userId,
        mode,
        numHypotheses: p.numHypotheses ?? 4,
      },
    }, 60_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Graph reasoning failed"));
      return;
    }
    respond(true, { ok: true, engine: "graph-of-thought", mode, data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.reasoning.modes — List available Graph-of-Thought reasoning modes.
   */
  "hpics.reasoning.modes": async ({ respond }) => {
    respond(true, {
      ok: true,
      modes: [
        { id: "hypothesis-exploration", description: "N competing hypotheses with evidence evaluation" },
        { id: "dossier-reasoning", description: "Multi-source dossier compilation with cross-referencing" },
        { id: "threat-assessment", description: "Threat modeling with attack vector analysis" },
        { id: "relationship-mapping", description: "Social/organizational relationship graph analysis" },
      ],
    }, undefined);
  },

  /**
   * hpics.verification.run — Intelligence Verification Pipeline (5-layer)
   *
   * Layers (all parallel via Promise.allSettled):
   *   1. Quick safety check (pattern-based)
   *   2. Constitutional AI rule evaluation
   *   3. Red Team adversarial check
   *   4. Cross-source consistency
   *   5. Confidence calibration
   *
   * Params: { content, contentType?, profileId?, userId? }
   */
  "hpics.verification.run": async ({ params, respond }) => {
    const p = params as {
      content?: unknown;
      contentType?: string;
      profileId?: string;
      userId?: string;
    };

    const content = requireString(p.content, "content");
    if (!content) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "content (string) is required"));
      return;
    }

    const result = await callHpics({
      tool: "intelligence-verification",
      params: {
        content,
        contentType: p.contentType ?? "intelligence-report",
        profileId: p.profileId,
        userId: p.userId,
      },
    }, 60_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Verification pipeline failed"));
      return;
    }
    respond(true, { ok: true, engine: "verification-pipeline", data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.workflow.run — Generic workflow executor
   *
   * Bridges to HPICS `run-workflow` action for any predefined workflow.
   * Params: { command, contact?, userId?, options? }
   */
  "hpics.workflow.run": async ({ params, respond }) => {
    const p = params as {
      command?: unknown;
      contact?: string;
      userId?: string;
      options?: Record<string, unknown>;
    };

    const command = requireString(p.command, "command");
    if (!command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "command (string) is required — e.g. verified-dossier, deep-research, adversarial-assessment"));
      return;
    }

    const result = await callHpics({
      action: "run-workflow",
      command,
      contact: p.contact,
      userId: p.userId,
      ...p.options,
    }, 120_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? `Workflow '${command}' failed`));
      return;
    }
    respond(true, { ok: true, workflow: command, data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.workflows.list — List all available HPICS workflows.
   */
  "hpics.workflows.list": async ({ respond }) => {
    const result = await callHpics({ action: "list-workflows" });
    if (!result.ok) {
      // Fallback: return the known v3.8.0 workflows
      respond(true, {
        ok: true,
        source: "static",
        workflows: [
          { id: "full-intelligence", description: "Full intelligence pipeline" },
          { id: "generate-dossier", description: "Generate intelligence dossier" },
          { id: "track-contact", description: "Track contact activity" },
          { id: "counter-intel-scan", description: "Counter-intelligence scan" },
          { id: "quick-profile", description: "Quick profile generation" },
          { id: "verified-dossier", description: "Enrich → Behavioral/Psych → Graph reasoning → Dossier → Verification" },
          { id: "deep-research", description: "Enrich → Agentic RAG (3 iterations) → Graph reasoning → Summary → Verification" },
          { id: "adversarial-assessment", description: "OPSEC + Threat + Deception (parallel) → Graph reasoning → Red team → Verification" },
          { id: "vulnerability-defense", description: "Vuln scan + Device scan → Threat assessment → Red team → OPSEC check → Verification" },
        ],
      }, undefined);
      return;
    }
    respond(true, { ok: true, source: "live", ...(result.data as Record<string, unknown>) }, undefined);
  },

  /** hpics.workflow.verified-dossier — Convenience: run verified-dossier workflow */
  "hpics.workflow.verified-dossier": async ({ params, respond }) => {
    const p = params as { contact?: unknown; userId?: string };
    const contact = requireString(p.contact, "contact");
    if (!contact) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "contact (string) is required"));
      return;
    }
    const result = await callHpics({ action: "run-workflow", command: "verified-dossier", contact, userId: p.userId }, 120_000);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Verified dossier workflow failed"));
      return;
    }
    respond(true, { ok: true, workflow: "verified-dossier", contact, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.workflow.deep-research — Convenience: run deep-research workflow */
  "hpics.workflow.deep-research": async ({ params, respond }) => {
    const p = params as { contact?: unknown; userId?: string };
    const contact = requireString(p.contact, "contact");
    if (!contact) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "contact (string) is required"));
      return;
    }
    const result = await callHpics({ action: "run-workflow", command: "deep-research", contact, userId: p.userId }, 120_000);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Deep research workflow failed"));
      return;
    }
    respond(true, { ok: true, workflow: "deep-research", contact, data: result.data, meta: result.meta }, undefined);
  },

  /** hpics.workflow.adversarial — Convenience: run adversarial-assessment workflow */
  "hpics.workflow.adversarial": async ({ params, respond }) => {
    const p = params as { contact?: unknown; userId?: string };
    const contact = requireString(p.contact, "contact");
    if (!contact) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "contact (string) is required"));
      return;
    }
    const result = await callHpics({ action: "run-workflow", command: "adversarial-assessment", contact, userId: p.userId }, 120_000);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Adversarial assessment workflow failed"));
      return;
    }
    respond(true, { ok: true, workflow: "adversarial-assessment", contact, data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 3 — v3.8.0 Autonomous Vulnerability Defense System
  // ══════════════════════════════════════════════════════════════════

  /**
   * hpics.vulnerability.scan — Real CVE/Exploit Feed Aggregator
   *
   * Queries NVD API v2.0 + CISA KEV in parallel.
   * Features: CVSS severity filtering, exploitation-in-wild status,
   * dedup, 24h cache in vulnerability_intel table.
   *
   * Params: { platforms, userId?, severity?, limit? }
   *   platforms: string[] — e.g. ["whatsapp", "instagram", "chrome", "ios"]
   */
  "hpics.vulnerability.scan": async ({ params, respond }) => {
    const p = params as {
      platforms?: unknown;
      userId?: string;
      severity?: string;
      limit?: number;
    };

    if (!Array.isArray(p.platforms) || p.platforms.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "platforms (string[]) is required — e.g. [\"whatsapp\", \"chrome\"]"));
      return;
    }

    const result = await callHpics({
      tool: "vulnerability-scan",
      params: {
        platforms: p.platforms,
        userId: p.userId,
        severity: p.severity,
        limit: p.limit ?? 50,
      },
    }, 30_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Vulnerability scan failed"));
      return;
    }
    respond(true, { ok: true, engine: "vulnerability-intelligence", data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.vulnerability.redteam — AI Red Team Scenario Builder
   *
   * Fetches real CVE details from NVD, then generates via Gemini 2.5 Flash:
   *   - Attack scenario (entry vector, MITRE ATT&CK steps, persistence, exfil, IOCs)
   *   - Defense plan (patches, config changes, monitoring rules)
   *   - Exploit chain (kill chain phases with detectability)
   *   - Patch checklist
   *
   * Params: { cveId, targetPlatform, userId? }
   */
  "hpics.vulnerability.redteam": async ({ params, respond }) => {
    const p = params as {
      cveId?: unknown;
      targetPlatform?: unknown;
      userId?: string;
    };

    const cveId = requireString(p.cveId, "cveId");
    if (!cveId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "cveId (string) is required — e.g. CVE-2025-55177"));
      return;
    }

    const targetPlatform = requireString(p.targetPlatform, "targetPlatform");
    if (!targetPlatform) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "targetPlatform (string) is required — e.g. \"WhatsApp iOS\""));
      return;
    }

    const result = await callHpics({
      tool: "red-team-scenario",
      params: {
        cveId,
        targetPlatform,
        userId: p.userId,
      },
    }, 60_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Red team scenario generation failed"));
      return;
    }
    respond(true, { ok: true, engine: "red-team-executor", cveId, targetPlatform, data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.vulnerability.device — Device/Account Security Scanner
   *
   * Generates CPE keywords from device specs, queries NVD (rate-limited 1.5s),
   * cross-references CISA KEV, runs AI security assessment.
   *
   * Params: { device: { osName, osVersion?, manufacturer?, model?, installedApps?: [{name}] }, userId? }
   */
  "hpics.vulnerability.device": async ({ params, respond }) => {
    const p = params as {
      device?: unknown;
      userId?: string;
    };

    if (!p.device || typeof p.device !== "object") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "device (object with osName) is required"));
      return;
    }

    const device = p.device as {
      osName?: string;
      osVersion?: string;
      manufacturer?: string;
      model?: string;
      installedApps?: Array<{ name: string }>;
    };

    if (!device.osName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "device.osName is required"));
      return;
    }

    const result = await callHpics({
      tool: "device-security-scan",
      params: { device, userId: p.userId },
    }, 60_000); // NVD rate limiting may cause longer response times

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Device security scan failed"));
      return;
    }
    respond(true, { ok: true, engine: "device-security-scanner", data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.vulnerability.opsec — 6-Category OPSEC Vulnerability Analysis
   *
   * Reads real profile data and calculates actual vulnerabilities across:
   *   1. Contact exposure
   *   2. Social correlation
   *   3. Identity exposure
   *   4. Domain exposure
   *   5. Communication surface
   *   6. Data exposure + surveillance indicators
   *
   * Params: { profileId, userId? }
   */
  "hpics.vulnerability.opsec": async ({ params, respond }) => {
    const p = params as {
      profileId?: unknown;
      userId?: string;
    };

    const profileId = requireString(p.profileId, "profileId");
    if (!profileId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "profileId (string) is required"));
      return;
    }

    const result = await callHpics({
      tool: "opsec-vulnerability-analyzer",
      params: { profileId, userId: p.userId },
    }, 60_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "OPSEC analysis failed"));
      return;
    }
    respond(true, { ok: true, engine: "opsec-vulnerability-analyzer", data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.workflow.vulnerability-defense — Full Vulnerability Defense DAG
   *
   * DAG: vuln-scan ─┬→ threat-assessment → red-team → verification
   *      device-scan┘   opsec-check (optional)
   *
   * Params: { platforms, device?, userId? }
   */
  "hpics.workflow.vulnerability-defense": async ({ params, respond }) => {
    const p = params as {
      platforms?: unknown;
      device?: unknown;
      userId?: string;
    };

    if (!Array.isArray(p.platforms) || p.platforms.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "platforms (string[]) is required"));
      return;
    }

    const result = await callHpics({
      action: "run-workflow",
      command: "vulnerability-defense",
      params: {
        platforms: p.platforms,
        device: p.device,
      },
      userId: p.userId,
    }, 120_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Vulnerability defense workflow failed"));
      return;
    }
    respond(true, { ok: true, workflow: "vulnerability-defense", data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // PIPELINE BRIDGES  —  HoC ↔ HPICS cross-system intelligence
  // ══════════════════════════════════════════════════════════════════

  /**
   * hpics.pipeline.voice.analyze
   *
   * Pipeline: HoC AudioStudio / voice recording → HPICS voice-router analysis.
   * Params: { audioUrl?, transcript?, tool?, config? }
   *   - audioUrl: public URL to WAV/MP3 generated by HoC AudioStudio plugin
   *   - transcript: pre-transcribed text to skip transcription step
   *   - tool: specific voice tool (default: analyze-voice-comprehensive)
   *   - config: additional tool-specific options
   *
   * Returns: { deception_score, stress_markers, stylometric_fingerprint, ... }
   */
  "hpics.pipeline.voice.analyze": async ({ params, respond }) => {
    const p = params as {
      audioUrl?: string;
      transcript?: string;
      tool?: string;
      config?: unknown;
    };

    const tool = p.tool ?? "analyze-voice-comprehensive";
    const toolParams: Record<string, unknown> = { ...(p.config as Record<string, unknown>) };

    if (p.audioUrl) { toolParams.audioUrl = p.audioUrl; }
    if (p.transcript) { toolParams.transcript = p.transcript; }

    if (!toolParams.audioUrl && !toolParams.transcript) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "audioUrl or transcript required"));
      return;
    }

    const result = await callHpics({ tool, params: toolParams });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Voice analysis pipeline failed"));
      return;
    }
    respond(true, { ok: true, pipeline: "hoc-audio→hpics-voice", tool, data: result.data, meta: result.meta }, undefined);
  },

  /**
   * hpics.pipeline.deepfake.analyze
   *
   * Pipeline: HoC ComfyUI / VideoStudio → HPICS biometric deepfake detector.
   * Params: { mediaUrl, mediaType?: "image"|"video", config? }
   *   - mediaUrl: URL to image or video generated by / processed through HoC
   *   - mediaType: hint to HPICS about media format
   *   - config: additional parameters for deepfake-analyzer
   *
   * Returns: { is_deepfake, confidence, artifacts_detected, regions, ... }
   */
  "hpics.pipeline.deepfake.analyze": async ({ params, respond }) => {
    const p = params as { mediaUrl?: string; mediaType?: string; config?: unknown };

    const mediaUrl = requireString(p.mediaUrl, "mediaUrl");
    if (!mediaUrl) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "mediaUrl (string) is required"));
      return;
    }

    const toolParams: Record<string, unknown> = {
      ...(p.config as Record<string, unknown> ?? undefined),
      mediaUrl,
      mediaType: p.mediaType ?? "image",
    };

    const result = await callHpics({ tool: "deepfake-analyzer", params: toolParams });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Deepfake analysis failed"));
      return;
    }
    respond(true, {
      ok: true,
      pipeline: "hoc-media→hpics-biometric",
      tool: "deepfake-analyzer",
      data: result.data,
      meta: result.meta,
    }, undefined);
  },

  /**
   * hpics.pipeline.biometric.face
   *
   * Pipeline: Any image source (HoC ComfyUI / captured) → HPICS facial biometrics.
   * Params: { imageUrl, tool?: string, config? }
   *   - imageUrl: URL to image to analyze (face photo / screenshot)
   *   - tool: facial tool (default: extract-facial-biometrics)
   *
   * Returns: { face_vectors, age_estimate, emotion_map, microexpressions, ... }
   */
  "hpics.pipeline.biometric.face": async ({ params, respond }) => {
    const p = params as { imageUrl?: string; tool?: string; config?: unknown };

    const imageUrl = requireString(p.imageUrl, "imageUrl");
    if (!imageUrl) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "imageUrl (string) is required"));
      return;
    }

    const tool = p.tool ?? "extract-facial-biometrics";
    const result = await callHpics({
      tool,
      params: { ...(p.config as Record<string, unknown>), imageUrl },
    });
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Facial biometric analysis failed"));
      return;
    }
    respond(true, {
      ok: true,
      pipeline: "hoc-image→hpics-biometric",
      tool,
      data: result.data,
      meta: result.meta,
    }, undefined);
  },

  /**
   * hpics.pipeline.digital.twin
   *
   * Pipeline: HPICS fusion-router digital twin generation → behavioral simulation.
   * Params: { profileData, tool?: string, simulate?: boolean, config? }
   *   - profileData: contact/person data object to build the twin from
   *   - tool: fusion tool (default: digital-twin-generator)
   *   - simulate: if true, also runs digital-twin-simulator after generation
   *
   * Returns: { twin_id, behavioral_model, simulation_results?, ... }
   */
  "hpics.pipeline.digital.twin": async ({ params, respond }) => {
    const p = params as {
      profileData?: unknown;
      tool?: string;
      simulate?: boolean;
      config?: unknown;
    };

    if (!p.profileData || typeof p.profileData !== "object") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "profileData (object) is required"));
      return;
    }

    const tool = p.tool ?? "digital-twin-generator";
    const twinResult = await callHpics({
      tool,
      params: { ...(p.config as Record<string, unknown>), profile: p.profileData },
    });

    if (!twinResult.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, twinResult.error ?? "Digital twin generation failed"));
      return;
    }

    let simResult: { ok: boolean; data?: unknown; error?: string } | null = null;
    if (p.simulate) {
      simResult = await callHpics({
        tool: "digital-twin-simulator",
        params: { twin: twinResult.data },
      });
    }

    respond(true, {
      ok: true,
      pipeline: "hpics-fusion-digital-twin",
      twin: twinResult.data,
      simulation: simResult?.data ?? null,
      meta: twinResult.meta,
    }, undefined);
  },

  /**
   * hpics.pipeline.media.intelligence
   *
   * Full media intelligence pipeline: analyze media metadata + triangulate
   * communication patterns + detect affective manipulation in a single call.
   * Params: { mediaUrls: string[], context? }
   *
   * Runs: generate-media-metadata → analyze-communication-triangulation →
   *        affective-manipulation-detector (parallel last two)
   */
  "hpics.pipeline.media.intelligence": async ({ params, respond }) => {
    const p = params as { mediaUrls?: unknown; context?: unknown };

    if (!Array.isArray(p.mediaUrls) || p.mediaUrls.length === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "mediaUrls (string[]) is required"));
      return;
    }

    const metaResult = await callHpics({
      tool: "generate-media-metadata-mosaic",
      params: { urls: p.mediaUrls, context: p.context },
    });

    const [triangResult, affectResult] = await Promise.allSettled([
      callHpics({ tool: "analyze-communication-triangulation", params: { metadata: metaResult.data, urls: p.mediaUrls } }),
      callHpics({ tool: "affective-manipulation-detector", params: { metadata: metaResult.data, urls: p.mediaUrls } }),
    ]);

    respond(true, {
      ok: true,
      pipeline: "hpics-media-intelligence",
      metadata: metaResult.data,
      triangulation: triangResult.status === "fulfilled" ? triangResult.value.data : null,
      affective: affectResult.status === "fulfilled" ? affectResult.value.data : null,
    }, undefined);
  },

  /**
   * hpics.pipeline.osint.full
   *
   * Full OSINT pipeline: HPICS enrichment → network analysis → intelligence dossier.
   * Params: { target, targetType?: "person"|"company"|"email"|"phone", depth?: "basic"|"deep" }
   */
  "hpics.pipeline.osint.full": async ({ params, respond }) => {
    const p = params as {
      target?: unknown;
      targetType?: string;
      depth?: string;
    };

    const target = requireString(p.target, "target");
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target (string) is required"));
      return;
    }

    const isDeep = p.depth === "deep";
    const enrichTool = isDeep ? "deep-osint-scan" : "osint-scan";

    // Step 1: OSINT enrichment
    const enrichResult = await callHpics({
      tool: enrichTool,
      params: { target, targetType: p.targetType ?? "person" },
    });

    // Step 2: Network analysis (parallel with digital footprint)
    const [networkResult, footprintResult] = await Promise.allSettled([
      callHpics({ tool: "analyze-network-graph", params: { subject: target, data: enrichResult.data } }),
      callHpics({ tool: "digital-footprint-scanner", params: { target } }),
    ]);

    // Step 3: Intelligence dossier generation
    const dossierResult = await callHpics({
      tool: "generate-intelligence-dossier",
      params: {
        subject: target,
        enrichment: enrichResult.data,
        network: networkResult.status === "fulfilled" ? networkResult.value.data : null,
        footprint: footprintResult.status === "fulfilled" ? footprintResult.value.data : null,
      },
    }, 120_000);

    respond(true, {
      ok: true,
      pipeline: "hpics-osint-full",
      target,
      enrichment: enrichResult.data,
      network: networkResult.status === "fulfilled" ? networkResult.value.data : null,
      footprint: footprintResult.status === "fulfilled" ? footprintResult.value.data : null,
      dossier: dossierResult.data,
    }, undefined);
  },

  /**
   * hpics.pipeline.agis.full
   *
   * Full AGIS autonomous intelligence pipeline.
   * Params: { objective, subject?, depth?: "standard"|"deep" }
   *   - objective: intelligence objective (string)
   *   - subject: person/entity being analyzed
   *   - depth: "standard" (cascade) or "deep" (omniscient orchestrator)
   */
  "hpics.pipeline.agis.full": async ({ params, respond }) => {
    const p = params as { objective?: unknown; subject?: unknown; depth?: string };

    const objective = requireString(p.objective, "objective");
    if (!objective) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "objective (string) is required"));
      return;
    }

    const tool = p.depth === "deep" ? "omniscient-orchestrator" : "agis-cascade-orchestrator";
    const result = await callHpics({
      tool,
      params: {
        objective,
        subject: p.subject,
      },
    }, 120_000);

    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "AGIS pipeline failed"));
      return;
    }

    respond(true, {
      ok: true,
      pipeline: "hpics-agis-full",
      tool,
      objective,
      data: result.data,
      meta: result.meta,
    }, undefined);
  },

  /**
   * hpics.config.status
   * Returns current HPICS configuration status (url set, key set — never reveals values).
   */
  "hpics.config.status": async ({ respond }) => {
    const url = process.env.HPICS_GATEWAY_URL?.trim() ?? "";
    const key = process.env.HPICS_API_KEY?.trim() ?? "";
    respond(true, {
      ok: true,
      configured: Boolean(url && key),
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
      gatewayHost: url ? new URL(url).hostname : null,
    }, undefined);
  },
};
