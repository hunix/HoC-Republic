/**
 * Republic Gateway — Meta-Learning RPC Handlers
 *
 * 13 `republic.meta.*` endpoints covering all 6 meta-learning subsystems.
 * Follows exact pattern from server-methods/republic/gsd.ts:
 *   - GatewayRequestHandlers from "../types.js"
 *   - Republic modules from "../../../republic/*.js"
 */
import type { GatewayRequestHandlers } from "../types.js";
import { getState } from "../../../republic/state.js";
import {
  getMetaConvergenceStatus,
  getConvergenceHistory,
  getFullMetaDiagnostics,
} from "../../../republic/meta-convergence.js";
import { curiosityDiagnostics } from "../../../republic/curiosity-engine.js";
import { getReplayDiagnostics } from "../../../republic/experience-replay.js";
import {
  getRsiDiagnostics,
  getCitizenProposals,
  getImprovementGenealogy,
} from "../../../republic/recursive-self-improvement.js";
import {
  getPopulationDiagnostics,
  computePopulationFitness,
  getCitizenHyperparams,
} from "../../../republic/population-training.js";
import {
  getDistillationDiagnostics,
  getRepublicTruths,
} from "../../../republic/knowledge-distillation.js";
import {
  getCurriculumEfficiencyMetrics,
  getZoneOfProximalDevelopment,
} from "../../../republic/autonomous-curriculum-architect.js";

export const metaLearningHandlers: GatewayRequestHandlers = {
  // ─── Convergence Orchestrator ─────────────────────────────────────
  "republic.meta.convergence.status": async ({ respond }) => {
    const diag = getFullMetaDiagnostics();
    const latest = getMetaConvergenceStatus();
    respond(true, { ...diag, latest });
  },

  "republic.meta.convergence.history": async ({ params, respond }) => {
    const { limit = 10 } = params as { limit?: number };
    respond(true, { history: getConvergenceHistory(limit) });
  },

  // ─── Curiosity Engine ─────────────────────────────────────────────
  "republic.meta.curiosity.diagnostics": async ({ respond }) => {
    respond(true, { ...curiosityDiagnostics() });
  },

  // ─── Experience Replay ────────────────────────────────────────────
  "republic.meta.replay.diagnostics": async ({ respond }) => {
    respond(true, { ...getReplayDiagnostics() });
  },

  // ─── RSI Engine ───────────────────────────────────────────────────
  "republic.meta.rsi.diagnostics": async ({ respond }) => {
    respond(true, { ...getRsiDiagnostics() });
  },

  "republic.meta.rsi.proposals": async ({ params, respond }) => {
    const { citizenId, limit = 20 } = params as { citizenId?: string; limit?: number };
    const proposals = citizenId ? getCitizenProposals(citizenId, limit) : [];
    respond(true, { proposals, genealogy: getImprovementGenealogy().slice(0, 20) });
  },

  // ─── Population-Based Training ────────────────────────────────────
  "republic.meta.population.diagnostics": async ({ respond }) => {
    respond(true, { ...getPopulationDiagnostics() });
  },

  "republic.meta.population.rankings": async ({ params, respond }) => {
    const { limit = 20 } = params as { limit?: number };
    const s = getState();
    const ranking = computePopulationFitness(s);
    respond(true, {
      ranked: ranking.ranked.slice(0, limit),
      diversityScore: ranking.diversityScore,
      top20: ranking.top20,
      bottom20: ranking.bottom20,
    });
  },

  "republic.meta.citizen.hyperparams": async ({ params, respond }) => {
    const { citizenId } = params as { citizenId?: string };
    // oxlint-disable-next-line curly
    if (!citizenId) throw new Error("citizenId is required");
    const hp = getCitizenHyperparams(citizenId);
    // oxlint-disable-next-line curly
    if (!hp) throw new Error(`No hyperparams found for citizen ${citizenId}`);
    respond(true, { hyperparams: hp });
  },

  // ─── Knowledge Distillation ──────────────────────────────────────
  "republic.meta.distillation.diagnostics": async ({ respond }) => {
    respond(true, { ...getDistillationDiagnostics() });
  },

  "republic.meta.truths.list": async ({ params, respond }) => {
    const { domain, limit = 50 } = params as { domain?: string; limit?: number };
    const truths = getRepublicTruths(domain, limit);
    respond(true, { truths, total: truths.length });
  },

  // ─── Autonomous Curriculum Architect ─────────────────────────────
  "republic.meta.curriculum.diagnostics": async ({ respond }) => {
    respond(true, { ...getCurriculumEfficiencyMetrics() });
  },

  "republic.meta.curriculum.zpd": async ({ params, respond }) => {
    const { citizenId } = params as { citizenId?: string };
    // oxlint-disable-next-line curly
    if (!citizenId) throw new Error("citizenId is required");
    const challenges = getZoneOfProximalDevelopment(citizenId);
    respond(true, { challenges, total: challenges.length });
  },
};

