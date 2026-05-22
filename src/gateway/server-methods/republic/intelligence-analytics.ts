/**
 * Republic Gateway Handlers — Intelligence Analytics
 *
 * Exposes tool analytics, agent messaging, action cache, metacognition,
 * meta-cot, and observability trace data via RPC for the Web UI dashboard.
 *
 * Gaps addressed: G7, G8, G11, G12 from the intelligence audit.
 */

import { toolAnalyticsDiagnostics, getCitizenToolProfile, getWeakestTools } from "../../../republic/tool-analytics.js";
import { getMessages, getBroadcasts, messagingDiagnostics } from "../../../republic/agent-messaging.js";
import { actionCacheDiagnostics } from "../../../republic/action-cache.js";
import { getMetaCoTDiagnostics } from "../../../republic/cognition/meta-cot.js";
import { getMetacognitiveAggregates, getMetacognitiveHistory, getEscalationQueue } from "../../../republic/cognition/metacognition.js";
import { getSkillGenesisDiagnostics } from "../../../republic/cognition/skill-genesis.js";
import { getMetaToolDiagnostics } from "../../../republic/cognition/meta-tool-selector.js";
import { observabilityDiagnostics } from "../../../republic/observability.js";
import { analyzePrompt } from "../../../intelligence/prompt-analyzer.js";
import { describeFallbackChain } from "../../../intelligence/router-fallback.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const intelligenceAnalyticsDescriptors = defineHandlers({
  /**
   * republic.analytics.tools — Per-tool success rates, EWMA stats,
   * specialization recommendations, and weakest tools.
   */
  "republic.analytics.tools": {
    scope: "read",
    handler: ({ respond }) => {
      const diagnostics = toolAnalyticsDiagnostics();
      const weakest = getWeakestTools(5);
      respond(true, { ...diagnostics, weakestTools: weakest }, undefined);
    },
  },

  /**
   * republic.analytics.tools.citizen — Per-citizen tool usage profile.
   */
  "republic.analytics.tools.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string } | undefined;
      if (!p?.citizenId) {
        respond(true, { error: "citizenId required" }, undefined);
        return;
      }
      const profile = getCitizenToolProfile(p.citizenId);
      respond(true, { ok: true, profile }, undefined);
    },
  },

  /**
   * republic.analytics.messaging — Agent messaging bus diagnostics.
   * Shows inbox sizes, pending message counts, and delivery stats.
   */
  "republic.analytics.messaging": {
    scope: "read",
    handler: ({ respond }) => {
      const stats = messagingDiagnostics();
      respond(true, { ok: true, ...stats }, undefined);
    },
  },

  /**
   * republic.analytics.messaging.inbox — Get messages for a specific citizen.
   */
  "republic.analytics.messaging.inbox": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; limit?: number } | undefined;
      if (!p?.citizenId) {
        respond(true, { messages: [], broadcasts: [] }, undefined);
        return;
      }
      const messages = getMessages(p.citizenId, p.limit ?? 10);
      const broadcasts = getBroadcasts(5);
      respond(true, { ok: true, messages, broadcasts }, undefined);
    },
  },

  /**
   * republic.analytics.cache — Action cache diagnostics.
   * Hit rate, entries count, evictions.
   */
  "republic.analytics.cache": {
    scope: "read",
    handler: ({ respond }) => {
      const stats = actionCacheDiagnostics();
      respond(true, { ok: true, ...stats }, undefined);
    },
  },

  /**
   * republic.analytics.metacot — Meta-Chain-of-Thought strategy diagnostics.
   * Shows which reasoning strategies are most effective per specialization.
   */
  "republic.analytics.metacot": {
    scope: "read",
    handler: ({ respond }) => {
      const diagnostics = getMetaCoTDiagnostics();
      respond(true, { ok: true, ...diagnostics }, undefined);
    },
  },

  /**
   * republic.analytics.metacognition — Metacognitive monitoring aggregates.
   * Average confidence, escalation rate, evaluation count.
   */
  "republic.analytics.metacognition": {
    scope: "read",
    handler: ({ respond }) => {
      const aggregates = getMetacognitiveAggregates();
      const escalationQueue = getEscalationQueue();
      respond(true, { ok: true, ...aggregates, escalationQueue }, undefined);
    },
  },

  /**
   * republic.analytics.metacognition.citizen — Metacognitive history for a citizen.
   */
  "republic.analytics.metacognition.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; limit?: number } | undefined;
      if (!p?.citizenId) {
        respond(true, { history: [] }, undefined);
        return;
      }
      const history = getMetacognitiveHistory(p.citizenId, p.limit ?? 10);
      respond(true, { ok: true, history }, undefined);
    },
  },

  /**
   * republic.traces.overview — Observability overview with trace stats and
   * subsystem diagnostics. Powers the observability dashboard.
   */
  "republic.traces.overview": {
    scope: "read",
    handler: ({ respond }) => {
      const overview = observabilityDiagnostics();
      respond(true, { ok: true, ...overview }, undefined);
    },
  },

  /**
   * republic.analytics.skillgenesis — Skill Genesis diagnostics.
   * Shows discovered patterns, crystallized skills, and national registry.
   */
  "republic.analytics.skillgenesis": {
    scope: "read",
    handler: ({ respond }) => {
      const diagnostics = getSkillGenesisDiagnostics();
      respond(true, { ok: true, ...diagnostics }, undefined);
    },
  },

  /**
   * republic.analytics.toolselector — Meta-Tool Selector diagnostics.
   * Shows learned tool chains, citizen profiling, and selection effectiveness.
   */
  "republic.analytics.toolselector": {
    scope: "read",
    handler: ({ respond }) => {
      const diagnostics = getMetaToolDiagnostics();
      respond(true, { ok: true, ...diagnostics }, undefined);
    },
  },

  /**
   * republic.analytics.promptanalyzer — NofT prompt complexity analysis.
   * Analyzes a prompt string for domain, complexity, and partitioning needs.
   */
  "republic.analytics.promptanalyzer": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { prompt?: string } | undefined;
      const prompt = p?.prompt ?? "default";
      const analysis = analyzePrompt(prompt);
      respond(true, { ok: true, ...analysis }, undefined);
    },
  },

  /**
   * republic.analytics.routerfallback — Fallback chain description.
   * Shows the model fallback ladder for a given complexity score.
   */
  "republic.analytics.routerfallback": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { complexityScore?: number } | undefined;
      const scores = [0.1, 0.4, 0.7, 0.9];
      const chains = scores.map(s => ({
        score: s,
        description: describeFallbackChain(p?.complexityScore ?? s),
      }));
      respond(true, { ok: true, chains }, undefined);
    },
  },
});

registryRegister(intelligenceAnalyticsDescriptors);
export const intelligenceAnalyticsHandlers = toHandlerMap(intelligenceAnalyticsDescriptors);
