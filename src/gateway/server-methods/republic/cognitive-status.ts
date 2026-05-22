/**
 * Republic Gateway Handlers — Cognitive Frontier Status
 *
 * Exposes metacognition, narrative, dreams, reasoning, diplomacy,
 * and resilience diagnostics AND sub-collections via a single RPC
 * endpoint for the Web UI.
 */

import { getReasoningDiagnostics, getRecentChains } from "../../../republic/adaptive-reasoning.js";
import {
  getConflicts,
  getDiplomacyDiagnostics,
  getEvents as getDiplomacyEvents,
  getTreaties,
} from "../../../republic/diplomacy.js";
import { getDreamDiagnostics } from "../../../republic/dream-engine.js";
import {
  getCitizenMetacognition,
  getMetacognitionDiagnostics,
  getRecentIntrospections,
} from "../../../republic/metacognition-engine.js";
import { getActiveThreads, getNarrativeDiagnostics } from "../../../republic/narrative-engine.js";
import {
  getAllCircuitBreakerDiagnostics,
  getSelfHealingDiagnostics,
} from "../../../republic/resilience.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const cognitiveStatusDescriptors = defineHandlers({
  /**
   * republic.cognitive.status — All cognitive frontier diagnostics + sub-collections.
   * Each view picks its subset from the response.
   */
  "republic.cognitive.status": {
    scope: "read",
    handler: ({ respond }) => {
      const metacognition = getMetacognitionDiagnostics();
      const narrative = getNarrativeDiagnostics();
      const dreams = getDreamDiagnostics();
      const reasoning = getReasoningDiagnostics();
      const diplomacy = getDiplomacyDiagnostics();
      const resilience = {
        ...getSelfHealingDiagnostics(),
        circuitBreakers: getAllCircuitBreakerDiagnostics(),
      };

      const recentJournals = getRecentIntrospections(30);
      const recentChains = getRecentChains(30);
      const activeThreads = getActiveThreads();
      const storyArcs: unknown[] = [];
      const treaties = getTreaties({});
      const conflicts = getConflicts({});
      const diplomacyEvents = getDiplomacyEvents({ limit: 30 });

      respond(
        true,
        {
          metacognition,
          narrative,
          dreams,
          reasoning,
          diplomacy,
          resilience,
          recentJournals,
          recentChains,
          activeThreads,
          storyArcs,
          treaties,
          conflicts,
          diplomacyEvents,
        },
        undefined,
      );
    },
  },

  /**
   * republic.metacognition.citizen — Metacognition detail for a specific citizen.
   */
  "republic.metacognition.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string } | undefined;
      if (!p?.citizenId) {
        respond(
          true,
          { calibrationScore: 0, topUncertainties: [], recentReflections: [] },
          undefined,
        );
        return;
      }
      const detail = getCitizenMetacognition(p.citizenId);
      respond(true, { ok: true, detail }, undefined);
    },
  },
});

registryRegister(cognitiveStatusDescriptors);
export const cognitiveHandlers = toHandlerMap(cognitiveStatusDescriptors);
