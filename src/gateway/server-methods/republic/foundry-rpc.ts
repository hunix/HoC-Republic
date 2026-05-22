/**
 * Republic Platform — Foundry RPC Handlers
 *
 * Gateway API for the Foundry self-evolution engine.
 * Provides read/write access to workflows, patterns, skills, learnings,
 * and Overseer reports.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  getFoundryStatus,
  getWorkflows,
  getPatterns,
  getCrystallizedSkills,
  getLearnings,
  crystallizePattern,
  pruneStalePatterns,
  getFoundryConfig,
  setFoundryConfig,
  searchBrain,
  getCrystallizationCandidates,
  type FoundryConfig,
} from "../../../republic/foundry-engine.js";
import {
  getOverseerReports,
  getLastOverseerReport,
} from "../../../republic/foundry-overseer.js";

export const foundryHandlers: Partial<GatewayRequestHandlers> = {
  // ── Status ────────────────────────────────────────────────────

  "republic.foundry.status": ({ respond }) => {
    const status = getFoundryStatus();
    const lastReport = getLastOverseerReport();
    respond(true, {
      ok: true,
      ...status,
      overseerLastReport: lastReport
        ? {
            tick: lastReport.tick,
            skillsGenerated: lastReport.skillsGenerated,
            patternsPruned: lastReport.patternsPruned,
            durationMs: lastReport.duration,
          }
        : null,
    }, undefined);
  },

  // ── Workflows ─────────────────────────────────────────────────

  "republic.foundry.workflows": ({ params, respond }) => {
    const { limit = 50 } = params as { limit?: number };
    const workflows = getWorkflows(Math.min(limit, 200));
    respond(true, { ok: true, workflows, count: workflows.length }, undefined);
  },

  // ── Patterns ──────────────────────────────────────────────────

  "republic.foundry.patterns": ({ respond }) => {
    const patterns = getPatterns();
    const candidates = getCrystallizationCandidates();
    respond(true, {
      ok: true,
      patterns,
      count: patterns.length,
      crystallizationCandidates: candidates.length,
    }, undefined);
  },

  // ── Generated Skills ──────────────────────────────────────────

  "republic.foundry.skills": ({ respond }) => {
    const skills = getCrystallizedSkills();
    respond(true, { ok: true, skills, count: skills.length }, undefined);
  },

  // ── Learnings ─────────────────────────────────────────────────

  "republic.foundry.learnings": ({ params, respond }) => {
    const { limit = 50 } = params as { limit?: number };
    const items = getLearnings(Math.min(limit, 200));
    respond(true, { ok: true, learnings: items, count: items.length }, undefined);
  },

  // ── Crystallize Pattern ───────────────────────────────────────

  "republic.foundry.crystallize": ({ params, respond }) => {
    const { patternId } = params as { patternId: string };
    if (!patternId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "patternId is required"));
      return;
    }
    const result = crystallizePattern(patternId);
    respond(true, { ok: result.ok, skillId: result.skillId, error: result.error }, undefined);
  },

  // ── Prune Stale Patterns ──────────────────────────────────────

  "republic.foundry.prune": ({ respond }) => {
    const pruned = pruneStalePatterns(Date.now());
    respond(true, { ok: true, prunedCount: pruned }, undefined);
  },

  // ── Config ────────────────────────────────────────────────────

  "republic.foundry.config": ({ params, respond }) => {
    const { update } = params as { update?: Partial<FoundryConfig> };
    if (update) {
      const newConfig = setFoundryConfig(update);
      respond(true, { ok: true, config: newConfig }, undefined);
      return;
    }
    respond(true, { ok: true, config: getFoundryConfig() }, undefined);
  },

  // ── Brain Search ──────────────────────────────────────────────

  "republic.foundry.brain.search": ({ params, respond }) => {
    const { query, limit = 10 } = params as { query: string; limit?: number };
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query is required"));
      return;
    }
    const results = searchBrain(query, Math.min(limit, 50));
    respond(true, { ok: true, results, count: results.length }, undefined);
  },

  // ── Overseer Reports ──────────────────────────────────────────

  "republic.foundry.overseer": ({ params, respond }) => {
    const { limit = 10 } = params as { limit?: number };
    const reports = getOverseerReports(Math.min(limit, 50));
    respond(true, { ok: true, reports, count: reports.length }, undefined);
  },
};
