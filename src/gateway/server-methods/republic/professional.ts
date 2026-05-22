/**
 * Republic Gateway Handlers — Professional Development
 *
 * RPC handlers for:
 *  - Professional Domains (knowledge taxonomy, toolkits)
 *  - Professional Practice (case-based learning, peer review)
 *  - Dev Orchestration (pipelines, QA, innovation)
 *  - Memory Reflection (cognitive insights, diagnostics)
 */

import type { GatewayRequestHandlers } from "../types.js";
// ─── Dev Orchestration ──────────────────────────────────────────
import {
    allDatabaseIds, allLanguageIds, createPipeline, getDatabase,
    getFramework, getLanguage
} from "../../../republic/dev-orchestration.js";
// ─── Memory Reflection ─────────────────────────────────────────
import { getRecentInsights, reflectionDiagnostics } from "../../../republic/memory-reflection.js";
// ─── Professional Domains ───────────────────────────────────────
import {
    getDomainDiagnostics, getDomains, getRootDomains,
    getToolkits,
    getToolkitsForDomain, searchDomains
} from "../../../republic/professional-domains.js";
// ─── Professional Practice ──────────────────────────────────────
import {
    getCaseById, getCases, getCitizenCases,
    getEscalatedCases, getPracticeDiagnostics, getPracticeMetrics
} from "../../../republic/professional-practice.js";
// ─── State ──────────────────────────────────────────────────────
import { getState } from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─────────────────────────────────────────────────────────────────

export const professionalHandlers: Partial<GatewayRequestHandlers> = {
  // ═══ Professional Domains ══════════════════════════════════════

  "republic.domain.list": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, domains: getDomains(s) }, undefined);
  },

  "republic.domain.roots": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, domains: getRootDomains(s) }, undefined);
  },

  "republic.domain.search": ({ params, respond }) => {
    const p = params as { query?: string } | undefined;
    if (!p?.query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    const s = getState();
    respond(true, { ok: true, domains: searchDomains(s, p.query) }, undefined);
  },

  "republic.domain.toolkits": ({ params, respond }) => {
    const p = params as { domainPath?: string } | undefined;
    if (p?.domainPath) {
      respond(true, { ok: true, toolkits: getToolkitsForDomain(p.domainPath) }, undefined);
    } else {
      respond(true, { ok: true, toolkits: getToolkits() }, undefined);
    }
  },

  "republic.domain.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getDomainDiagnostics(s), undefined);
  },

  // ═══ Professional Practice ═════════════════════════════════════

  "republic.practice.cases": ({ params, respond }) => {
    const p = params as { status?: string } | undefined;
    const s = getState();
    respond(
      true,
      {
        ok: true,
        cases: getCases(
          s,
          p?.status as "open" | "in-progress" | "completed" | "reviewed" | "escalated" | undefined,
        ),
      },
      undefined,
    );
  },

  "republic.practice.case": ({ params, respond }) => {
    const p = params as { caseId?: string } | undefined;
    if (!p?.caseId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "caseId required"));
      return;
    }
    const s = getState();
    const c = getCaseById(s, p.caseId);
    if (!c) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Case not found"));
      return;
    }
    respond(true, { ok: true, case: c }, undefined);
  },

  "republic.practice.citizen": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    respond(true, { ok: true, cases: getCitizenCases(s, p.citizenId) }, undefined);
  },

  "republic.practice.escalated": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, cases: getEscalatedCases(s) }, undefined);
  },

  "republic.practice.metrics": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    respond(true, { ok: true, metrics: getPracticeMetrics(s, p.citizenId) }, undefined);
  },

  "republic.practice.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getPracticeDiagnostics(s), undefined);
  },

  // ═══ Dev Orchestration ═════════════════════════════════════════

  "republic.devops.pipeline.create": ({ params, respond }) => {
    const p = params as { projectId?: string; autoFix?: boolean } | undefined;
    if (!p?.projectId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "projectId required"));
      return;
    }
    try {
      const pipeline = createPipeline(p.projectId, p.autoFix ?? true);
      respond(true, { ok: true, pipeline }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : String(err)),
      );
    }
  },

  "republic.devops.languages": ({ respond }) => {
    respond(true, { ok: true, languages: allLanguageIds() }, undefined);
  },

  "republic.devops.databases": ({ respond }) => {
    respond(true, { ok: true, databases: allDatabaseIds() }, undefined);
  },

  "republic.devops.language": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const lang = getLanguage(p.id);
    if (!lang) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Language not found"));
      return;
    }
    respond(true, { ok: true, language: lang }, undefined);
  },

  "republic.devops.database": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const db = getDatabase(p.id);
    if (!db) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Database not found"));
      return;
    }
    respond(true, { ok: true, database: db }, undefined);
  },

  "republic.devops.framework": ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const fw = getFramework(p.id);
    if (!fw) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Framework not found"));
      return;
    }
    respond(true, { ok: true, framework: fw }, undefined);
  },

  // ═══ Memory Reflection ═════════════════════════════════════════

  "republic.reflection.insights": ({ params, respond }) => {
    const p = params as { count?: number } | undefined;
    respond(true, { ok: true, insights: getRecentInsights(p?.count ?? 20) }, undefined);
  },

  "republic.reflection.diagnostics": ({ respond }) => {
    respond(true, reflectionDiagnostics(), undefined);
  },
};
