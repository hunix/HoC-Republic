/**
 * Republic Platform — Self-Healing RPC Handlers
 *
 * Gateway API for the 5-tier autonomous crash recovery system:
 *   - Status: current tier, uptime, incident metrics
 *   - History: recovery timeline
 *   - Config: tier toggles, alert webhooks
 *   - Test: simulate failures
 *   - Metrics: MTTR, success rate
 *   - Learnings: AI-generated recovery knowledge
 *   - Alerts: notification channel config
 *   - Manual recovery: trigger Tier 3 manually
 */

import type { GatewayRequestHandlers } from "../types.js";
import {
  getHealingStatus,
  getHealingHistory,
  getHealingLearnings,
  getHealingConfig,
  updateHealingConfig,
  simulateFailure,
  triggerManualRecovery,
  runPreflight,
} from "../../../republic/self-healing-engine.js";

export const selfHealingHandlers: Partial<GatewayRequestHandlers> = {
  /** republic.healing.status — Current tier, uptime, incident count, recovery stats */
  "republic.healing.status": ({ respond }) => {
    const { status, tiers, preflightPassed } = getHealingStatus();
    const preflight = runPreflight();
    respond(true, { ok: true, ...status, tiers, preflightPassed, preflightChecks: preflight.checks }, undefined);
  },

  /** republic.healing.history — Recovery timeline (symptoms, causes, outcomes) */
  "republic.healing.history": ({ params, respond }) => {
    const { limit = 50 } = (params ?? {}) as { limit?: number };
    respond(true, { ok: true, incidents: getHealingHistory(limit) }, undefined);
  },

  /** republic.healing.config — Get/update healing configuration */
  "republic.healing.config": ({ params, respond }) => {
    const updates = (params ?? {}) as {
      enabled?: boolean;
      tiers?: Record<string, boolean>;
      discordWebhookUrl?: string;
      telegramBotToken?: string;
      telegramChatId?: string;
    };

    if (
      updates.enabled !== undefined ||
      updates.tiers !== undefined ||
      updates.discordWebhookUrl !== undefined ||
      updates.telegramBotToken !== undefined ||
      updates.telegramChatId !== undefined
    ) {
      updateHealingConfig(updates);
      respond(true, { ok: true, config: getHealingConfig(), updated: true }, undefined);
      return;
    }

    respond(true, { ok: true, config: getHealingConfig() }, undefined);
  },

  /** republic.healing.test — Simulate a failure to test the recovery pipeline */
  "republic.healing.test": ({ params, respond }) => {
    const { type = "ECONNREFUSED" } = (params ?? {}) as { type?: string };
    const incident = simulateFailure(type);
    respond(true, { ok: true, incident }, undefined);
  },

  /** republic.healing.metrics — Prometheus-style metrics (MTTR, success rate, etc.) */
  "republic.healing.metrics": ({ respond }) => {
    const { status } = getHealingStatus();
    const total = status.totalIncidents || 1;
    respond(true, {
      ok: true,
      uptimeMs: Date.now() - status.upSince,
      mttrMs: status.avgRecoveryTimeMs,
      successRate: Math.round((status.resolvedAutonomously / total) * 100),
      totalIncidents: status.totalIncidents,
      resolvedAutonomously: status.resolvedAutonomously,
      escalatedToHuman: status.escalatedToHuman,
      currentTier: status.currentTier,
    }, undefined);
  },

  /** republic.healing.learnings — Browse persistent recovery learnings */
  "republic.healing.learnings": ({ params, respond }) => {
    const { limit = 50 } = (params ?? {}) as { limit?: number };
    respond(true, { ok: true, learnings: getHealingLearnings(limit) }, undefined);
  },

  /** republic.healing.alerts — Alert channel configuration */
  "republic.healing.alerts": ({ params, respond }) => {
    const updates = (params ?? {}) as {
      discordWebhookUrl?: string;
      telegramBotToken?: string;
      telegramChatId?: string;
    };

    if (updates.discordWebhookUrl !== undefined || updates.telegramBotToken !== undefined) {
      updateHealingConfig(updates);
      respond(true, { ok: true, config: getHealingConfig(), updated: true }, undefined);
      return;
    }

    const config = getHealingConfig();
    respond(true, { ok: true, alerts: config.alerts }, undefined);
  },

  /** republic.healing.manual-recover — Trigger manual Tier 3 recovery */
  "republic.healing.manual-recover": async ({ respond }) => {
    const result = await triggerManualRecovery();
    respond(true, { ok: result.ok, incident: result.incident }, undefined);
  },
};
