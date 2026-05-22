/**
 * Workforce Domain — Gateway RPC Handlers
 *
 * Exposes the meta-working orchestration engine via RPC.
 */

import {
  getWorkforceMetrics,
  getWorkAssignments,
  getMasteryProfiles,
  getWorkOpportunities,
  getMasteryProfile,
  metaWorkingDiagnostics,
} from "../../../republic/meta-working.js";
import { getState } from "../../../republic/state.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const workforceDescriptors = defineHandlers({
  "republic.workforce.status": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      if (!s) {
        respond(true, { ok: true, metrics: null, running: false });
        return;
      }
      const metrics = getWorkforceMetrics(s);
      respond(true, { ok: true, metrics, running: true });
    },
  },

  "republic.workforce.assignments": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { status?: string; citizenId?: string; limit?: number };
      const assignments = getWorkAssignments({
        status: p.status as "active" | "completed" | "abandoned" | undefined,
        citizenId: p.citizenId,
        limit: p.limit,
      });
      respond(true, { ok: true, assignments, total: assignments.length });
    },
  },

  "republic.workforce.mastery": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number; sortBy?: string; citizenId?: string };
      if (p.citizenId) {
        const profile = getMasteryProfile(p.citizenId);
        respond(true, { ok: true, profile });
        return;
      }
      const profiles = getMasteryProfiles({
        limit: p.limit,
        sortBy: p.sortBy as "mastery" | "revenue" | "velocity" | undefined,
      });
      respond(true, { ok: true, profiles, total: profiles.length });
    },
  },

  "republic.workforce.discovery": {
    scope: "read",
    handler: ({ respond }) => {
      const opportunities = getWorkOpportunities();
      respond(true, { ok: true, opportunities, total: opportunities.length });
    },
  },

  "republic.workforce.diagnostics": {
    scope: "read",
    handler: ({ respond }) => {
      const diag = metaWorkingDiagnostics();
      respond(true, { ok: true, diagnostics: diag });
    },
  },
});

registryRegister(workforceDescriptors);
export const workforceHandlers = toHandlerMap(workforceDescriptors);
