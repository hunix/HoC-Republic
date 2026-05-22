/**
 * Republic Gateway Handlers â€” learning
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
// Phase 35: Docker Orchestration Engine
import {
    cancelDelivery, executeDelivery, fireWebhook, getDeliveryQueue, getEmailHistory, getExternalCommsDiagnostics, getNotifications, listWebhooks, markNotificationRead, queueNotification, registerWebhook, removeWebhook, scheduleDelivery, sendBulkEmail, sendEmail
} from "../../../republic/external-comms.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import {
    abandonGoal, completeGoal as completeGoalLearning, completeMilestone, decayBehavior, evaluateGoalProgress, generateCurriculum, getCitizenLevel, getCitizenSkills as getCitizenSkillsLearning, getCurriculum, getGoals, getSelfLearningDiagnostics, getSkillTree, learnSkill, reflectOnActions, reinforceBehavior, setGoal, shareKnowledge
} from "../../../republic/self-learning.js";
import {
    getState
} from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const learningHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 12: Self-Learning ──────────────────────────────────

  "republic.learning.setGoal": ({ params, respond }) => {
    const p = params as
      | {
          citizenId?: string;
          title?: string;
          description?: string;
          category?: string;
          priority?: string;
          milestones?: string[];
        }
      | undefined;
    if (!p?.citizenId || !p?.title) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and title required"),
      );
      return;
    }
    try {
      const s = getState();
      const goal = setGoal(
        s,
        p.citizenId,
        p.title,
        p.description ?? "",
        (p.category ?? "career") as
          | "career"
          | "social"
          | "health"
          | "financial"
          | "creative"
          | "learning",
        (p.priority ?? "medium") as "low" | "medium" | "high" | "critical",
        p.milestones ?? [],
      );
      respond(true, { ok: true, goal }, undefined);
    } catch (err: unknown) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.learning.evaluateProgress": ({ params, respond }) => {
    const p = params as { goalId?: string } | undefined;
    if (!p?.goalId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "goalId required"));
      return;
    }
    const s = getState();
    const result = evaluateGoalProgress(s, p.goalId);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.learning.completeMilestone": ({ params, respond }) => {
    const p = params as { goalId?: string; milestoneId?: string } | undefined;
    if (!p?.goalId || !p?.milestoneId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "goalId and milestoneId required"),
      );
      return;
    }
    const s = getState();
    const ok = completeMilestone(s, p.goalId, p.milestoneId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok
        ? undefined
        : errorShape(ErrorCodes.INVALID_REQUEST, "Milestone not found or already complete"),
    );
  },

  "republic.learning.completeGoal": ({ params, respond }) => {
    const p = params as { goalId?: string } | undefined;
    if (!p?.goalId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "goalId required"));
      return;
    }
    const s = getState();
    const result = completeGoalLearning(s, p.goalId);
    respond(
      result.ok,
      result.ok ? { ok: true, xpAwarded: result.xpAwarded } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Goal not active"),
    );
  },

  "republic.learning.abandonGoal": ({ params, respond }) => {
    const p = params as { goalId?: string } | undefined;
    if (!p?.goalId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "goalId required"));
      return;
    }
    const s = getState();
    const result = abandonGoal(s, p.goalId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Goal not active"),
    );
  },

  "republic.learning.getGoals": ({ params, respond }) => {
    const p = params as { citizenId?: string; statusFilter?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const goals = getGoals(
      s,
      p.citizenId,
      p.statusFilter as "active" | "completed" | "failed" | "abandoned" | undefined,
    );
    respond(true, { ok: true, goals }, undefined);
  },

  "republic.learning.learnSkill": ({ params, respond }) => {
    const p = params as { citizenId?: string; skillName?: string; xpAmount?: number } | undefined;
    if (!p?.citizenId || !p?.skillName) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and skillName required"),
      );
      return;
    }
    const s = getState();
    const result = learnSkill(s, p.citizenId, p.skillName, p.xpAmount ?? 10);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.learning.getSkillTree": ({ respond }) => {
    respond(true, { ok: true, skills: getSkillTree() }, undefined);
  },

  "republic.learning.getCitizenSkills": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    respond(true, { ok: true, skills: getCitizenSkillsLearning(s, p.citizenId) }, undefined);
  },

  "republic.learning.reinforce": ({ params, respond }) => {
    const p = params as
      | { citizenId?: string; action?: string; reward?: number; context?: string }
      | undefined;
    if (!p?.citizenId || !p?.action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and action required"),
      );
      return;
    }
    const signal = reinforceBehavior(p.citizenId, p.action, p.reward ?? 0.5, p.context ?? "");
    respond(true, { ok: true, signal }, undefined);
  },

  "republic.learning.decay": ({ params, respond }) => {
    const p = params as
      | { citizenId?: string; action?: string; penalty?: number; context?: string }
      | undefined;
    if (!p?.citizenId || !p?.action) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and action required"),
      );
      return;
    }
    const signal = decayBehavior(p.citizenId, p.action, p.penalty ?? -0.5, p.context ?? "");
    respond(true, { ok: true, signal }, undefined);
  },

  "republic.learning.reflect": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const result = reflectOnActions(s, p.citizenId);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.learning.shareKnowledge": ({ params, respond }) => {
    const p = params as
      | { fromCitizenId?: string; toCitizenId?: string; skillName?: string }
      | undefined;
    if (!p?.fromCitizenId || !p?.toCitizenId || !p?.skillName) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "fromCitizenId, toCitizenId, and skillName required",
        ),
      );
      return;
    }
    const s = getState();
    const result = shareKnowledge(s, p.fromCitizenId, p.toCitizenId, p.skillName);
    respond(
      result.ok,
      result.ok ? { ok: true, xpTransferred: result.xpTransferred } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Knowledge transfer failed"),
    );
  },

  "republic.learning.generateCurriculum": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const curriculum = generateCurriculum(s, p.citizenId);
    respond(true, { ok: true, curriculum }, undefined);
  },

  "republic.learning.getCurriculum": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const curriculum = getCurriculum(p.citizenId);
    respond(true, { ok: true, curriculum: curriculum ?? null }, undefined);
  },

  "republic.learning.getCitizenLevel": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    respond(true, { ok: true, ...getCitizenLevel(s, p.citizenId) }, undefined);
  },

  "republic.learning.diagnostics": ({ respond }) => {
    respond(true, getSelfLearningDiagnostics(), undefined);
  },

  // ─── Phase 13: External Communication ─────────────────────────

  "republic.comms.sendEmail": ({ params, respond }) => {
    const p = params as { to?: string; subject?: string; body?: string; from?: string } | undefined;
    if (!p?.to || !p?.subject) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "to and subject required"));
      return;
    }
    const s = getState();
    sendEmail(s, p.to, p.subject, p.body ?? "", p.from)
      .then((record) => {
        respond(true, { ok: true, email: record }, undefined);
      })
      .catch((err: unknown) => {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      });
  },

  "republic.comms.sendBulkEmail": ({ params, respond }) => {
    const p = params as { recipients?: string[]; subject?: string; body?: string } | undefined;
    if (!p?.recipients || !p?.subject) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "recipients and subject required"),
      );
      return;
    }
    const s = getState();
    sendBulkEmail(s, p.recipients, p.subject, p.body ?? "")
      .then((records) => {
        respond(true, { ok: true, emails: records }, undefined);
      })
      .catch((err: unknown) => {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      });
  },

  "republic.comms.getEmailHistory": ({ params, respond }) => {
    const p = params as { limit?: number; statusFilter?: string } | undefined;
    const s = getState();
    respond(
      true,
      {
        ok: true,
        emails: getEmailHistory(
          s,
          p?.limit ?? 50,
          p?.statusFilter as "sent" | "failed" | "bounced" | undefined,
        ),
      },
      undefined,
    );
  },

  "republic.comms.registerWebhook": ({ params, respond }) => {
    const p = params as
      | { name?: string; url?: string; events?: string[]; secret?: string }
      | undefined;
    if (!p?.name || !p?.url || !p?.events) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "name, url, and events required"),
      );
      return;
    }
    const s = getState();
    const webhook = registerWebhook(s, p.name, p.url, p.events, p.secret);
    respond(true, { ok: true, webhook }, undefined);
  },

  "republic.comms.fireWebhook": ({ params, respond }) => {
    const p = params as { event?: string; payload?: Record<string, unknown> } | undefined;
    if (!p?.event) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "event required"));
      return;
    }
    const s = getState();
    fireWebhook(s, p.event, p.payload ?? {})
      .then((results) => {
        respond(true, { ok: true, results }, undefined);
      })
      .catch((err: unknown) => {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      });
  },

  "republic.comms.listWebhooks": ({ respond }) => {
    const s = getState();
    respond(true, { ok: true, webhooks: listWebhooks(s) }, undefined);
  },

  "republic.comms.removeWebhook": ({ params, respond }) => {
    const p = params as { webhookId?: string } | undefined;
    if (!p?.webhookId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "webhookId required"));
      return;
    }
    const s = getState();
    const ok = removeWebhook(s, p.webhookId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Webhook not found"),
    );
  },

  "republic.comms.queueNotification": ({ params, respond }) => {
    const p = params as
      | { type?: string; title?: string; message?: string; citizenId?: string; actionUrl?: string }
      | undefined;
    if (!p?.type || !p?.title || !p?.message) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "type, title, and message required"),
      );
      return;
    }
    const s = getState();
    const notification = queueNotification(
      s,
      p.type as "info" | "warning" | "error" | "success" | "financial" | "social" | "iot",
      p.title,
      p.message,
      p.citizenId,
      p.actionUrl,
    );
    respond(true, { ok: true, notification }, undefined);
  },

  "republic.comms.getNotifications": ({ params, respond }) => {
    const p = params as { limit?: number; unreadOnly?: boolean; citizenId?: string } | undefined;
    const s = getState();
    respond(
      true,
      {
        ok: true,
        notifications: getNotifications(s, p?.limit ?? 50, p?.unreadOnly ?? false, p?.citizenId),
      },
      undefined,
    );
  },

  "republic.comms.markNotificationRead": ({ params, respond }) => {
    const p = params as { notificationId?: string } | undefined;
    if (!p?.notificationId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "notificationId required"));
      return;
    }
    const s = getState();
    const ok = markNotificationRead(s, p.notificationId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok
        ? undefined
        : errorShape(ErrorCodes.INVALID_REQUEST, "Notification not found or already read"),
    );
  },

  "republic.comms.scheduleDelivery": ({ params, respond }) => {
    const p = params as
      | {
          type?: string;
          payload?: Record<string, unknown>;
          scheduledAt?: string;
          recipientEmail?: string;
          webhookId?: string;
        }
      | undefined;
    if (!p?.type) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "type required"));
      return;
    }
    const s = getState();
    const delivery = scheduleDelivery(
      s,
      p.type as "email" | "invoice" | "report" | "artifact" | "webhook",
      p.payload ?? {},
      p.scheduledAt,
      p.recipientEmail,
      p.webhookId,
    );
    respond(true, { ok: true, delivery }, undefined);
  },

  "republic.comms.getDeliveryQueue": ({ params, respond }) => {
    const p = params as { statusFilter?: string } | undefined;
    const s = getState();
    respond(
      true,
      {
        ok: true,
        deliveries: getDeliveryQueue(
          s,
          p?.statusFilter as "pending" | "executed" | "failed" | "cancelled" | undefined,
        ),
      },
      undefined,
    );
  },

  "republic.comms.executeDelivery": ({ params, respond }) => {
    const p = params as { deliveryId?: string } | undefined;
    if (!p?.deliveryId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deliveryId required"));
      return;
    }
    const s = getState();
    executeDelivery(s, p.deliveryId)
      .then((result) => {
        respond(
          result.ok,
          result.ok ? { ok: true } : undefined,
          result.ok
            ? undefined
            : errorShape(ErrorCodes.UNAVAILABLE, result.error ?? "Delivery failed"),
        );
      })
      .catch((err: unknown) => {
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
      });
  },

  "republic.comms.cancelDelivery": ({ params, respond }) => {
    const p = params as { deliveryId?: string } | undefined;
    if (!p?.deliveryId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "deliveryId required"));
      return;
    }
    const s = getState();
    const ok = cancelDelivery(s, p.deliveryId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Delivery not pending"),
    );
  },

  "republic.comms.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getExternalCommsDiagnostics(s), undefined);
  },

};