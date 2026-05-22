/**
 * Republic Gateway Handlers â€” governance
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

import type { ModalCapability, TaskComplexity } from "../../../republic/ai-fusion.js";
import {
    cascadeInference, createInferenceTask, executeEnsembleInference, executeInference, getAIFusionDiagnostics, getConsciousness,
    getModelRegistry, getModelsByCapability, getModelsByProvider, routeTask as routeAITask, setModelAvailability, updateConsciousness
} from "../../../republic/ai-fusion.js";
import {
    acceptServiceRequest, advanceGoal, applyForJob, autoMatchServices, completeServiceRequest, createQualifiedJob, generateGoals, getAgencyDiagnostics, getCitizenGoals, getOpenJobs,
    requestService
} from "../../../republic/citizen-agency.js";
import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
// Phase 35: Docker Orchestration Engine
import {
    adjudicateReview, allocateDepartmentBudget, appointMinister, declareEmergency, dismissMinister, fileConstitutionalChallenge, getActiveLawEffects, getCabinet, getExecutiveDiagnostics, getPendingReviews, issueDirective, registerLawEffect, vetoBill
} from "../../../republic/executive-authority.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import {
    getState
} from "../../../republic/state.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const governanceHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Phase 18: Executive Authority ──────────────────────────

  "republic.executive.directive.issue": ({ params, respond }) => {
    const p = params as
      | {
          citizenId?: string;
          type?: string;
          title?: string;
          description?: string;
          scope?: string[];
          priority?: string;
          durationTicks?: number;
        }
      | undefined;
    if (!p?.citizenId || !p?.type || !p?.title || !p?.description) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId, type, title, description required"),
      );
      return;
    }
    const s = getState();
    const result = issueDirective(
      s,
      p.citizenId,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      p.type as any,
      p.title,
      p.description,
      p.scope,
      [],
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      (p.priority as any) ?? "normal",
      p.durationTicks,
    );
    respond(
      result.ok,
      result.ok ? { ok: true, directive: result.directive } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.directive.list": ({ respond }) => {
    respond(true, { ok: true }, undefined);
  },

  "republic.executive.emergency.declare": ({ params, respond }) => {
    const p = params as { citizenId?: string; reason?: string } | undefined;
    if (!p?.citizenId || !p?.reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and reason required"),
      );
      return;
    }
    const s = getState();
    const result = declareEmergency(s, p.citizenId, p.reason);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.veto": ({ params, respond }) => {
    const p = params as { citizenId?: string; billId?: string; reason?: string } | undefined;
    if (!p?.citizenId || !p?.billId || !p?.reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId, billId, reason required"),
      );
      return;
    }
    const s = getState();
    const result = vetoBill(s, p.citizenId, p.billId, p.reason);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.cabinet.appoint": ({ params, respond }) => {
    const p = params as
      | { presidentId?: string; citizenId?: string; department?: string }
      | undefined;
    if (!p?.presidentId || !p?.citizenId || !p?.department) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "presidentId, citizenId, department required"),
      );
      return;
    }
    const s = getState();
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const result = appointMinister(s, p.presidentId, p.citizenId, p.department as any);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.cabinet.dismiss": ({ params, respond }) => {
    const p = params as { presidentId?: string; department?: string; reason?: string } | undefined;
    if (!p?.presidentId || !p?.department || !p?.reason) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "presidentId, department, reason required"),
      );
      return;
    }
    const s = getState();
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const result = dismissMinister(s, p.presidentId, p.department as any, p.reason);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.cabinet.list": ({ respond }) => {
    respond(true, { ok: true, cabinet: getCabinet() }, undefined);
  },

  "republic.executive.budget.allocate": ({ params, respond }) => {
    const p = params as { presidentId?: string; department?: string; amount?: number } | undefined;
    if (!p?.presidentId || !p?.department || !p?.amount) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "presidentId, department, amount required"),
      );
      return;
    }
    const s = getState();
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const result = allocateDepartmentBudget(s, p.presidentId, p.department as any, p.amount);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.law.register": ({ params, respond }) => {
    const p = params as
      | {
          lawId?: string;
          lawTitle?: string;
          effectType?: string;
          target?: string;
          modifier?: string;
          value?: number | string;
          targetValue?: string;
        }
      | undefined;
    if (
      !p?.lawId ||
      !p?.lawTitle ||
      !p?.effectType ||
      !p?.target ||
      !p?.modifier ||
      p?.value === undefined
    ) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "lawId, lawTitle, effectType, target, modifier, value required",
        ),
      );
      return;
    }
    const s = getState();
    registerLawEffect(
      s,
      p.lawId,
      p.lawTitle,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      p.effectType as any,
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      p.target as any,
      p.modifier,
      p.value,
      p.targetValue,
    );
    respond(true, { ok: true }, undefined);
  },

  "republic.executive.law.list": ({ respond }) => {
    respond(true, { ok: true, effects: getActiveLawEffects() }, undefined);
  },

  "republic.executive.court.challenge": ({ params, respond }) => {
    const p = params as
      | { challengedBy?: string; challengedAction?: string; articleViolated?: number }
      | undefined;
    if (!p?.challengedBy || !p?.challengedAction || !p?.articleViolated) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "challengedBy, challengedAction, articleViolated required",
        ),
      );
      return;
    }
    const s = getState();
    const result = fileConstitutionalChallenge(
      s,
      p.challengedBy,
      p.challengedAction,
      p.articleViolated,
    );
    respond(
      result.ok,
      result.ok ? { ok: true, reviewId: result.reviewId } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.court.adjudicate": ({ params, respond }) => {
    const p = params as { reviewId?: string; ruling?: string; explanation?: string } | undefined;
    if (!p?.reviewId || !p?.ruling || !p?.explanation) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "reviewId, ruling, explanation required"),
      );
      return;
    }
    const s = getState();
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const result = adjudicateReview(s, p.reviewId, p.ruling as any, p.explanation);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.executive.court.pending": ({ respond }) => {
    respond(true, { ok: true, reviews: getPendingReviews() }, undefined);
  },

  "republic.executive.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getExecutiveDiagnostics(s), undefined);
  },

  // ─── Phase 19: Citizen Agency ───────────────────────────────

  "republic.agency.goals.generate": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const citizen = s.citizens.find((c) => c.id === p.citizenId);
    if (!citizen) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Citizen not found"));
      return;
    }
    generateGoals(s, citizen);
    respond(true, { ok: true, goals: getCitizenGoals(p.citizenId) }, undefined);
  },

  "republic.agency.goals.advance": ({ params, respond }) => {
    const p = params as { citizenId?: string; goalId?: string } | undefined;
    if (!p?.citizenId || !p?.goalId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and goalId required"),
      );
      return;
    }
    advanceGoal(p.citizenId, p.goalId);
    respond(true, { ok: true }, undefined);
  },

  "republic.agency.goals.list": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    respond(true, { ok: true, goals: getCitizenGoals(p.citizenId) }, undefined);
  },

  "republic.agency.jobs.create": ({ params, respond }) => {
    const p = params as
      | {
          title?: string;
          department?: string;
          salary?: number;
          requiredCertifications?: string[];
          requiredLevel?: string;
          description?: string;
        }
      | undefined;
    if (!p?.title || !p?.department || !p?.salary) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "title, department, salary required"),
      );
      return;
    }
    const job = createQualifiedJob(
      p.title,
      p.requiredCertifications?.[0] ?? "",
      p.requiredLevel ?? "apprentice",
      p.salary,
      p.department,
    );
    respond(true, { ok: true, job }, undefined);
  },

  "republic.agency.jobs.apply": ({ params, respond }) => {
    const p = params as { citizenId?: string; jobId?: string } | undefined;
    if (!p?.citizenId || !p?.jobId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and jobId required"),
      );
      return;
    }
    const s = getState();
    const result = applyForJob(s, p.citizenId, p.jobId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.agency.jobs.list": ({ respond }) => {
    respond(true, { ok: true, jobs: getOpenJobs() }, undefined);
  },

  "republic.agency.service.request": ({ params, respond }) => {
    const p = params as
      | {
          requesterId?: string;
          serviceType?: string;
          budget?: number;
          description?: string;
        }
      | undefined;
    if (!p?.requesterId || !p?.serviceType || !p?.budget) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "requesterId, serviceType, budget required"),
      );
      return;
    }
    const s = getState();
    const request = requestService(s, p.requesterId, p.serviceType, p.description ?? "", p.budget);
    respond(true, { ok: true, request: request.ok ? request.request : undefined }, undefined);
  },

  "republic.agency.service.accept": ({ params, respond }) => {
    const p = params as { providerId?: string; requestId?: string } | undefined;
    if (!p?.providerId || !p?.requestId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "providerId and requestId required"),
      );
      return;
    }
    const s = getState();
    const result = acceptServiceRequest(s, p.providerId, p.requestId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.agency.service.complete": ({ params, respond }) => {
    const p = params as { providerId?: string; requestId?: string } | undefined;
    if (!p?.providerId || !p?.requestId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "providerId and requestId required"),
      );
      return;
    }
    const s = getState();
    const result = completeServiceRequest(s, p.requestId);
    respond(
      result.ok,
      result.ok ? { ok: true } : undefined,
      result.ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, result.error!),
    );
  },

  "republic.agency.service.match": ({ respond }) => {
    const s = getState();
    autoMatchServices(s);
    respond(true, { ok: true }, undefined);
  },

  "republic.agency.diagnostics": ({ respond }) => {
    const s = getState();
    respond(true, getAgencyDiagnostics(s), undefined);
  },

  // ─── Phase 20: AI Fusion ────────────────────────────────────

  "republic.ai.route": ({ params, respond }) => {
    const p = params as
      | {
          taskType?: string;
          complexity?: string;
          maxCostPerCall?: number;
        }
      | undefined;
    if (!p?.taskType) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskType required"));
      return;
    }
    const task = createInferenceTask(
      "system",
      p.taskType as ModalCapability,
      `Route request: ${p.taskType}`,
      { complexity: (p.complexity as TaskComplexity) ?? "moderate", maxCost: p.maxCostPerCall },
    );
    const model = routeAITask(task);
    if (!model) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "No suitable model found"));
      return;
    }
    respond(
      true,
      { ok: true, model: model.name, provider: model.provider, tier: model.tier },
      undefined,
    );
  },

  "republic.ai.infer": ({ params, respond }) => {
    const p = params as
      | {
          taskType?: string;
          complexity?: string;
          prompt?: string;
          maxCostPerCall?: number;
        }
      | undefined;
    if (!p?.taskType || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "taskType and prompt required"),
      );
      return;
    }
    const task = createInferenceTask("system", p.taskType as ModalCapability, p.prompt, {
      complexity: (p.complexity as TaskComplexity) ?? "moderate",
      maxCost: p.maxCostPerCall,
    });
    const result = executeInference(task);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.ai.ensemble": ({ params, respond }) => {
    const p = params as
      | {
          taskType?: string;
          complexity?: string;
          prompt?: string;
        }
      | undefined;
    if (!p?.taskType || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "taskType and prompt required"),
      );
      return;
    }
    const task = createInferenceTask("system", p.taskType as ModalCapability, p.prompt, {
      complexity: (p.complexity as TaskComplexity) ?? "complex",
      ensemble: true,
    });
    const result = executeEnsembleInference(task);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.ai.cascade": ({ params, respond }) => {
    const p = params as
      | {
          taskType?: string;
          prompt?: string;
        }
      | undefined;
    if (!p?.taskType || !p?.prompt) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "taskType and prompt required"),
      );
      return;
    }
    const result = cascadeInference("system", p.prompt, p.taskType as ModalCapability);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.ai.consciousness.get": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const consciousness = getConsciousness(p.citizenId);
    respond(true, { ok: true, consciousness }, undefined);
  },

  "republic.ai.consciousness.update": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const citizen = s.citizens.find((c) => c.id === p.citizenId);
    if (!citizen) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Citizen not found"));
      return;
    }
    updateConsciousness(s, citizen);
    respond(true, { ok: true, consciousness: getConsciousness(p.citizenId) }, undefined);
  },

  "republic.ai.models.list": ({ params, respond }) => {
    const p = params as { provider?: string; capability?: string } | undefined;
    if (p?.provider) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      respond(true, { ok: true, models: getModelsByProvider(p.provider as any) }, undefined);
    } else if (p?.capability) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      respond(true, { ok: true, models: getModelsByCapability(p.capability as any) }, undefined);
    } else {
      respond(true, { ok: true, models: getModelRegistry() }, undefined);
    }
  },

  "republic.ai.models.availability": ({ params, respond }) => {
    const p = params as { modelName?: string; available?: boolean } | undefined;
    if (!p?.modelName || p?.available === undefined) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "modelName and available required"),
      );
      return;
    }
    setModelAvailability(p.modelName, p.available);
    respond(true, { ok: true }, undefined);
  },

  "republic.ai.diagnostics": ({ respond }) => {
    respond(true, getAIFusionDiagnostics(), undefined);
  },

};