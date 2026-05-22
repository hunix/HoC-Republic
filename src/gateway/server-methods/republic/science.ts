/**
 * Science Specialist + Meta-Learning RPC Handlers
 *
 * republic.science.*  — citizen science specializations + ArXiv meta-learning
 */

import {
  getAllScienceSpecializations,
  getScienceSpecialization,
  getScienceByDomain,
  askScientist,
  metaLearnFromArxiv,
  getMetaLearningHistory,
  getScienceStats,
} from "../../../republic/science-specialist.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const scienceDescriptors = defineHandlers({
  "republic.science.specializations.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { domain?: string } | null;
      const list = p?.domain
        ? getScienceByDomain(p.domain as Parameters<typeof getScienceByDomain>[0])
        : getAllScienceSpecializations();
      respond(true, { specializations: list, total: list.length }, undefined);
    },
  },

  "republic.science.specializations.get": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { id?: string } | null;
      const spec = getScienceSpecialization(p?.id ?? "");
      if (!spec) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Specialist '${p?.id}' not found`));
        return;
      }
      respond(true, spec, undefined);
    },
  },

  "republic.science.ask": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { specialistId?: string; question?: string; context?: string } | null;
      if (!p?.specialistId || !p?.question) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId and question are required"));
        return;
      }
      askScientist(p.specialistId, p.question, p.context)
        .then((r) => respond(true, r, undefined))
        .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
    },
  },

  "republic.science.meta-learn": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { specialistId?: string; maxResults?: number } | null;
      if (!p?.specialistId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId is required"));
        return;
      }
      metaLearnFromArxiv(p.specialistId, p.maxResults ?? 5)
        .then((r) => respond(true, { results: r, count: r.length }, undefined))
        .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
    },
  },

  "republic.science.meta-learn.history": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | null;
      respond(true, { events: getMetaLearningHistory(p?.limit ?? 50) }, undefined);
    },
  },

  "republic.science.stats": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, getScienceStats(), undefined);
    },
  },
});

registryRegister(scienceDescriptors);
export const scienceHandlers = toHandlerMap(scienceDescriptors);
