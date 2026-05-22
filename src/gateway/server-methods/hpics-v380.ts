/**
 * HPICS v3.8.0 — Tier 2/3 Advanced Intelligence Handlers
 *
 * Exposes the latest HPICS capabilities to HoC agents:
 *
 * ── Tier 2 (2026 Research Techniques) ──────────────────────────────
 *   - Agentic RAG Engine (Stanford/Google 2026 iterative retrieval)
 *   - Graph-of-Thought Reasoning (MIT 2026 GoT)
 *   - Intelligence Verification Pipeline (Constitutional AI + GARD)
 *   - Advanced Workflows (verified-dossier, deep-research, adversarial-assessment)
 *
 * ── Tier 3 (Autonomous Vulnerability Defense) ──────────────────────
 *   - Vulnerability Intelligence (NVD API v2.0 + CISA KEV)
 *   - Red Team Executor (AI-powered scenario builder using real CVEs)
 *   - Device Security Scanner (CPE-based vulnerability mapping)
 *   - OPSEC Analyzer (6-category operational security assessment)
 *
 * Architecture:
 *   HoC defense engines / republic agents
 *     ↓ request via hpics.v380.*
 *   This file (RPC handlers)
 *     ↓ HTTP POST to HPICS gateway
 *   HPICS Supabase edge functions (real NVD/CISA APIs + AI analysis)
 *     ↓ structured intelligence
 *   Republic defense system / agent context
 */

import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

// ─── HPICS HTTP helper (standalone) ──────────────────────────────────────────

async function callHpics(
  body: Record<string, unknown>,
  timeoutMs = 45_000,
): Promise<{ ok: boolean; data?: unknown; error?: string; meta?: unknown }> {
  const url = process.env.HPICS_GATEWAY_URL?.trim();
  const key = process.env.HPICS_API_KEY?.trim();
  if (!url || !key) {
    return { ok: false, error: "HPICS_GATEWAY_URL and HPICS_API_KEY must be set" };
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
    const payload = (await res.json()) as {
      success?: boolean; data?: unknown; meta?: unknown;
      error?: string; message?: string;
    };
    if (!res.ok || payload.success === false) {
      return { ok: false, error: payload.error ?? payload.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, data: payload.data, meta: payload.meta };
  } catch (err) {
    if ((err as { name?: string }).name === "AbortError") {
      return { ok: false, error: `Timeout after ${timeoutMs / 1000}s` };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Param helpers ───────────────────────────────────────────────────────────

function reqStr(p: Record<string, unknown>, field: string): { v: string } | { err: string } {
  const v = p[field];
  if (typeof v === "string" && v.trim()) {
    return { v: v.trim() };
  }
  return { err: `${field} (string) is required` };
}



// ─── Workflow runner ─────────────────────────────────────────────────────────

function makeWorkflowHandler(
  workflowName: string,
  timeoutMs = 120_000,
): GatewayRequestHandlers[string] {
  return async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    // Workflows accept contact (name/email/phone) + userId
    const contact = typeof p.contact === "string" ? p.contact.trim() : undefined;
    const userId = typeof p.userId === "string" ? p.userId.trim() : undefined;
    if (!contact) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "contact (string) is required"));
      return;
    }
    const result = await callHpics({
      action: "run-workflow",
      command: workflowName,
      contact,
      userId: userId ?? "system",
      ...p,
    }, timeoutMs);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? `Workflow '${workflowName}' failed`));
      return;
    }
    respond(true, { ok: true, workflow: workflowName, data: result.data, meta: result.meta }, undefined);
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export const hpicsV380Handlers: Partial<GatewayRequestHandlers> = {

  // ══════════════════════════════════════════════════════════════════
  // TIER 2: AGENTIC RAG ENGINE
  //
  // Stanford/Google 2026 iterative retrieval-augmented generation.
  // Decompose → Retrieve (parallel) → Self-critique → Refine → Synthesize
  // Max 3 iterations, confidence threshold 0.7
  // ══════════════════════════════════════════════════════════════════

  /** Run agentic RAG query — multi-step iterative retrieval + synthesis */
  "hpics.rag.run": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const q = reqStr(p, "query");
    if ("err" in q) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, q.err)); return; }

    const result = await callHpics({
      tool: "agentic-rag",
      params: {
        query: q.v,
        userId: p.userId ?? "system",
        profileId: p.profileId,
        maxIterations: p.maxIterations ?? 3,
        maxSubQuestions: p.maxSubQuestions ?? 5,
        confidenceThreshold: p.confidenceThreshold ?? 0.7,
        sourceTypes: p.sourceTypes ?? ["contacts", "intelligence", "osint"],
      },
    }, 90_000);

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Agentic RAG failed")); return; }
    respond(true, { ok: true, engine: "agentic-rag", data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 2: GRAPH-OF-THOUGHT REASONING
  //
  // MIT 2026 GoT — directed graph reasoning with competing hypotheses.
  // Modes: hypothesis-exploration, dossier-reasoning, threat-assessment,
  //        relationship-mapping
  // ══════════════════════════════════════════════════════════════════

  /** Graph-of-Thought reasoning — structured multi-hypothesis analysis */
  "hpics.reasoning.graph": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const q = reqStr(p, "query");
    if ("err" in q) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, q.err)); return; }

    const validModes = ["hypothesis-exploration", "dossier-reasoning", "threat-assessment", "relationship-mapping"];
    const mode = typeof p.mode === "string" && validModes.includes(p.mode) ? p.mode : "hypothesis-exploration";

    const result = await callHpics({
      tool: "graph-reasoning",
      params: {
        query: q.v,
        mode,
        userId: p.userId ?? "system",
        profileId: p.profileId,
        maxHypotheses: p.maxHypotheses ?? 4,
        maxEvidencePerHypothesis: p.maxEvidencePerHypothesis ?? 3,
      },
    }, 90_000);

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Graph reasoning failed")); return; }
    respond(true, { ok: true, engine: "graph-reasoning", mode, data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 2: INTELLIGENCE VERIFICATION PIPELINE
  //
  // 5-layer verification (Anthropic/DARPA Constitutional AI + GARD):
  //   1. Quick safety check (pattern-based)
  //   2. Constitutional AI rule evaluation
  //   3. Red Team adversarial check
  //   4. Cross-source consistency
  //   5. Confidence calibration
  // ══════════════════════════════════════════════════════════════════

  /** Verify intelligence — 5-layer verification pipeline */
  "hpics.verification.run": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const content = reqStr(p, "content");
    if ("err" in content) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, content.err)); return; }

    const result = await callHpics({
      tool: "intelligence-verification",
      params: {
        content: content.v,
        userId: p.userId ?? "system",
        profileId: p.profileId,
        layers: p.layers ?? ["safety", "constitutional", "red-team", "cross-source", "confidence"],
      },
    }, 60_000);

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Verification failed")); return; }
    respond(true, { ok: true, engine: "verification", data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 2: ADVANCED WORKFLOWS
  //
  // Three composite intelligence workflows:
  //   - verified-dossier: enrich → behavioral+psych → graph-reasoning → dossier → verify
  //   - deep-research: enrich → agentic-rag (3 iterations) → graph → summary → verify
  //   - adversarial-assessment: opsec+threat+deception → graph → red-team → verify
  // ══════════════════════════════════════════════════════════════════

  /** Verified Dossier — enrichment + behavioral + graph reasoning + dossier + verification */
  "hpics.workflow.verified_dossier": makeWorkflowHandler("verified-dossier", 180_000),

  /** Deep Research — enrichment + agentic RAG (3 iterations) + graph reasoning + summary */
  "hpics.workflow.deep_research": makeWorkflowHandler("deep-research", 180_000),

  /** Adversarial Assessment — opsec + threat + deception → graph → red-team → verify */
  "hpics.workflow.adversarial_assessment": makeWorkflowHandler("adversarial-assessment", 180_000),

  /** List available workflows */
  "hpics.workflow.list": async ({ respond }) => {
    const result = await callHpics({ action: "list-workflows" });
    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Failed to list workflows")); return; }
    respond(true, { ok: true, data: result.data }, undefined);
  },

  /** Get workflow status / result */
  "hpics.workflow.status": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const runId = reqStr(p, "runId");
    if ("err" in runId) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, runId.err)); return; }

    const result = await callHpics({
      action: "workflow-status",
      runId: runId.v,
    });
    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Workflow status unavailable")); return; }
    respond(true, { ok: true, data: result.data }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 3: VULNERABILITY INTELLIGENCE
  //
  // Real CVE/exploit feed from NVD API v2.0 + CISA KEV.
  // Supports platform-specific keyword search.
  // 24h cache in vulnerability_intel table.
  // ══════════════════════════════════════════════════════════════════

  /** Scan vulnerabilities for a platform — NVD + CISA KEV real API data */
  "hpics.vulnerability.scan": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const platform = typeof p.platform === "string" ? p.platform.trim() : undefined;
    if (!platform) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "platform (string) is required"));
      return;
    }

    const validPlatforms = [
      "whatsapp", "facebook", "instagram", "chrome", "ios", "android",
      "macos", "windows", "telegram", "signal", "safari", "firefox", "linux",
    ];
    if (!validPlatforms.includes(platform.toLowerCase())) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST,
        `platform must be one of: ${validPlatforms.join(", ")}`));
      return;
    }

    const result = await callHpics({
      tool: "vulnerability-intelligence",
      params: {
        platform: platform.toLowerCase(),
        userId: p.userId ?? "system",
        severity: p.severity ?? "all",
        limit: p.limit ?? 20,
      },
    }, 30_000);

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Vulnerability scan failed")); return; }
    respond(true, { ok: true, platform, data: result.data, meta: result.meta }, undefined);
  },

  /** Scan device-specific vulnerabilities — CPE-based NVD search for a specific device */
  "hpics.vulnerability.device": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const device = typeof p.device === "string" ? p.device.trim() : undefined;
    if (!device) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "device (string, e.g. 'iPhone 15 Pro') is required"));
      return;
    }

    const result = await callHpics({
      tool: "device-security-scanner",
      params: {
        device,
        userId: p.userId ?? "system",
        osVersion: p.osVersion,
        installedApps: p.installedApps,
      },
    }, 30_000);

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Device scan failed")); return; }
    respond(true, { ok: true, device, data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 3: RED TEAM EXECUTOR
  //
  // AI-powered red team scenario builder.
  // Fetches real CVE details from NVD before generating attack scenarios.
  // Uses MITRE ATT&CK framework for kill chain mapping.
  // ══════════════════════════════════════════════════════════════════

  /** Generate red team scenarios — AI attack scenario builder using real CVE data */
  "hpics.vulnerability.redteam": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const platform = typeof p.platform === "string" ? p.platform.trim() : undefined;

    const result = await callHpics({
      tool: "red-team-executor",
      params: {
        platform: platform ?? "general",
        userId: p.userId ?? "system",
        cveId: p.cveId,
        scenarioType: p.scenarioType ?? "full-chain",
        targetProfile: p.targetProfile,
      },
    }, 60_000);

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Red team execution failed")); return; }
    respond(true, { ok: true, engine: "red-team-executor", data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 3: OPSEC ANALYZER
  //
  // 6-category operational security assessment:
  //   Digital Footprint, Social Engineering Vectors, Physical Security,
  //   Communication Hygiene, Travel & Location, Financial Exposure
  // ══════════════════════════════════════════════════════════════════

  /** OPSEC analysis — 6-category operational security assessment */
  "hpics.vulnerability.opsec": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const contactId = reqStr(p, "contactId");
    if ("err" in contactId) { respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, contactId.err)); return; }

    const result = await callHpics({
      tool: "opsec-vulnerability-analyzer",
      params: {
        contactId: contactId.v,
        userId: p.userId ?? "system",
        categories: p.categories ?? ["digital", "social", "physical", "comms", "travel", "financial"],
      },
    }, 60_000);

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "OPSEC analysis failed")); return; }
    respond(true, { ok: true, engine: "opsec-analyzer", data: result.data, meta: result.meta }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // TIER 3: DEFENSE BRIDGE
  //
  // Connects HPICS vulnerability intelligence to Republic defense engines.
  // Ingests HPICS scan results into the Republic's threat fusion center.
  // ══════════════════════════════════════════════════════════════════

  /** Multi-platform vulnerability sweep — scans all platforms, feeds results to defense system */
  "hpics.defense.sweep": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const platforms = Array.isArray(p.platforms)
      ? (p.platforms as string[])
      : ["whatsapp", "chrome", "ios", "android", "telegram", "signal"];

    const results = await Promise.allSettled(
      platforms.map(platform =>
        callHpics({
          tool: "vulnerability-intelligence",
          params: { platform, userId: p.userId ?? "system", severity: "all", limit: 10 },
        }, 30_000),
      ),
    );

    const sweep: Record<string, unknown> = {};
    let totalVulns = 0;
    let totalCritical = 0;

    platforms.forEach((platform, i) => {
      const r = results[i];
      if (r.status === "fulfilled" && r.value.ok) {
        const data = r.value.data as { vulnerabilities?: Array<{ severity?: string }> } | undefined;
        const vulns = data?.vulnerabilities ?? [];
        sweep[platform] = {
          count: vulns.length,
          critical: vulns.filter(v => v.severity === "critical").length,
          data: r.value.data,
        };
        totalVulns += vulns.length;
        totalCritical += vulns.filter(v => v.severity === "critical").length;
      } else {
        sweep[platform] = { count: 0, error: r.status === "rejected" ? "Failed" : (r.value as { error?: string }).error };
      }
    });

    respond(true, {
      ok: true,
      engine: "defense-sweep",
      totalPlatforms: platforms.length,
      totalVulnerabilities: totalVulns,
      totalCritical,
      platforms: sweep,
    }, undefined);
  },

  /** Full defense intelligence cycle — CVE scan → red team → OPSEC → verification */
  "hpics.defense.full_cycle": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const platform = typeof p.platform === "string" ? p.platform.trim() : "general";

    // Stage 1: Vulnerability scan
    const vulnScan = await callHpics({
      tool: "vulnerability-intelligence",
      params: { platform, userId: p.userId ?? "system" },
    }, 30_000);

    // Stage 2: Red team based on findings
    const redTeam = await callHpics({
      tool: "red-team-executor",
      params: { platform, userId: p.userId ?? "system" },
    }, 60_000);

    // Stage 3: OPSEC assessment if contactId provided
    let opsec = null;
    if (typeof p.contactId === "string") {
      const opsecResult = await callHpics({
        tool: "opsec-vulnerability-analyzer",
        params: { contactId: p.contactId, userId: p.userId ?? "system" },
      }, 60_000);
      opsec = opsecResult.ok ? opsecResult.data : null;
    }

    // Stage 4: Verify intelligence
    const verification = await callHpics({
      tool: "intelligence-verification",
      params: {
        content: JSON.stringify({ vulnScan: vulnScan.data, redTeam: redTeam.data }),
        userId: p.userId ?? "system",
      },
    }, 60_000);

    respond(true, {
      ok: true,
      pipeline: "defense-full-cycle",
      platform,
      stages: {
        vulnerability_scan: vulnScan.ok ? vulnScan.data : null,
        red_team_scenarios: redTeam.ok ? redTeam.data : null,
        opsec_assessment: opsec,
        verification: verification.ok ? verification.data : null,
      },
    }, undefined);
  },

  // ══════════════════════════════════════════════════════════════════
  // CONTACT RESOLUTION
  // ══════════════════════════════════════════════════════════════════

  /** Resolve a contact by name, email, or phone — returns contactId */
  "hpics.contact.resolve": async ({ params, respond }) => {
    const p = params as Record<string, unknown>;
    const contact = typeof p.contact === "string" ? p.contact.trim() : undefined;
    if (!contact) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "contact (name/email/phone) is required"));
      return;
    }

    const result = await callHpics({
      action: "resolve-contact",
      contact,
      userId: p.userId ?? "system",
    });

    if (!result.ok) { respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Contact resolution failed")); return; }
    respond(true, { ok: true, data: result.data }, undefined);
  },
};
