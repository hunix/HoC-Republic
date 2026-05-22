/**
 * Cybersecurity Army RPC Handlers
 * republic.cyber.*
 */

import {
  getAllCyberSpecializations,
  getCyberSpecialization,
  getCyberByTeam,
  conductSecurityAssessment,
  askCyberExpert,
  getAssessmentHistory,
  getCyberStats,
} from "../../../republic/cyber-army.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const cyberDescriptors = defineHandlers({
  "republic.cyber.specialists.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { team?: string } | null;
      const list = p?.team
        ? getCyberByTeam(p.team as Parameters<typeof getCyberByTeam>[0])
        : getAllCyberSpecializations();
      respond(true, { specialists: list, total: list.length }, undefined);
    },
  },

  "republic.cyber.specialists.get": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { id?: string } | null;
      const spec = getCyberSpecialization(p?.id ?? "");
      if (!spec) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Specialist '${p?.id}' not found`));
        return;
      }
      respond(true, spec, undefined);
    },
  },

  "republic.cyber.assess": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { specialistId?: string; subject?: string; type?: string; details?: string } | null;
      if (!p?.specialistId || !p?.subject || !p?.type || !p?.details) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId, subject, type, and details are required"));
        return;
      }
      conductSecurityAssessment(
        p.specialistId,
        p.subject,
        p.type as Parameters<typeof conductSecurityAssessment>[2],
        p.details,
      )
        .then((r) => respond(true, r, undefined))
        .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
    },
  },

  "republic.cyber.ask": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { specialistId?: string; question?: string } | null;
      if (!p?.specialistId || !p?.question) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "specialistId and question are required"));
        return;
      }
      askCyberExpert(p.specialistId, p.question)
        .then((r) => respond(true, r, undefined))
        .catch((err: unknown) => respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err))));
    },
  },

  "republic.cyber.history": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | null;
      respond(true, { assessments: getAssessmentHistory(p?.limit ?? 20) }, undefined);
    },
  },

  "republic.cyber.stats": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, getCyberStats(), undefined);
    },
  },
});

registryRegister(cyberDescriptors);
export const cyberHandlers = toHandlerMap(cyberDescriptors);
