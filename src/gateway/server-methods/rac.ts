/**
 * rac.ts — Gateway RPC Handlers for RAC (Retrieval-Augmented Conversation)
 *
 *   rac.session.create    - Create a new stateful RAC session
 *   rac.session.list      - List sessions (with filter)
 *   rac.session.get       - Get session detail + full turn history
 *   rac.session.delete    - Delete a session
 *   rac.turn.user         - Submit a user turn (extracts facts, retrieves context)
 *   rac.turn.citizen      - Log a citizen agent response turn
 *   rac.milestone.reach   - Mark a milestone as reached
 *   rac.facts.get         - Get extracted facts for a session
 *   rac.stats             - System-wide RAC statistics
 */

import { ErrorCodes, errorShape } from "../protocol/index.js";
import {
  addCitizenTurn,
  addUserTurn,
  createSession,
  deleteSession,
  getFacts,
  getRacStats,
  getSession,
  listSessions,
  reachMilestone,
} from "../../republic/rac-engine.js";
import { defineHandlers, toHandlerMap } from "./types.js";
import { registryRegister } from "./handler-registry.js";

const racDescriptors = defineHandlers({
  // ── Sessions ─────────────────────────────────────────────────────────────
  "rac.session.create": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const p = params as {
        name?: string;
        citizenId?: string;
        goal?: string;
        context?: string;
        milestones?: string[];
        targetMetric?: string;
        targetValue?: number;
      };
      if (!p.goal?.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "goal is required"));
        return;
      }
      try {
        const session = createSession({
          name: p.name ?? `RAC Session ${new Date().toLocaleDateString()}`,
          citizenId: p.citizenId ?? "operator",
          goal: p.goal,
          context: p.context ?? "general",
          milestones: p.milestones ?? [],
          targetMetric: p.targetMetric,
          targetValue: p.targetValue,
        });
        respond(true, { ok: true, session }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "rac.session.list": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { citizenId, status, limit = 50 } = params as { citizenId?: string; status?: string; limit?: number };
      try {
        const sessions = listSessions({ citizenId, status, limit: Number(limit) });
        respond(true, { ok: true, sessions }, undefined);
      } catch {
        respond(true, { ok: true, sessions: [] }, undefined);
      }
    },
  },

  "rac.session.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const session = getSession(id);
      if (!session) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
        return;
      }
      respond(true, { ok: true, session }, undefined);
    },
  },

  "rac.session.delete": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { id } = params as { id: string };
      if (!id) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
        return;
      }
      const deleted = deleteSession(id);
      respond(true, { ok: true, deleted }, undefined);
    },
  },

  // ── Turns ─────────────────────────────────────────────────────────────────
  "rac.turn.user": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { sessionId, content } = params as { sessionId: string; content: string };
      if (!sessionId || !content?.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and content required"));
        return;
      }
      try {
        const result = addUserTurn(sessionId, content);
        if (!result) {
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found or not active"));
          return;
        }
        respond(true, { ok: true, ...result }, undefined);
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
      }
    },
  },

  "rac.turn.citizen": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { sessionId, content, outcomeProgress } = params as { sessionId: string; content: string; outcomeProgress?: number };
      if (!sessionId || !content?.trim()) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and content required"));
        return;
      }
      const turn = addCitizenTurn(sessionId, content, outcomeProgress);
      if (!turn) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
        return;
      }
      respond(true, { ok: true, turn }, undefined);
    },
  },

  // ── Milestones ────────────────────────────────────────────────────────────
  "rac.milestone.reach": {
    scope: "write",
    handler: async ({ params, respond }) => {
      const { sessionId, milestoneIndex } = params as { sessionId: string; milestoneIndex: number };
      if (!sessionId || milestoneIndex === undefined) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and milestoneIndex required"));
        return;
      }
      const reached = reachMilestone(sessionId, Number(milestoneIndex));
      respond(true, { ok: true, reached }, undefined);
    },
  },

  // ── Facts ─────────────────────────────────────────────────────────────────
  "rac.facts.get": {
    scope: "read",
    handler: async ({ params, respond }) => {
      const { sessionId } = params as { sessionId?: string };
      try {
        const facts = getFacts(sessionId);
        respond(true, { ok: true, facts }, undefined);
      } catch {
        respond(true, { ok: true, facts: [] }, undefined);
      }
    },
  },

  // ── Stats ─────────────────────────────────────────────────────────────────
  "rac.stats": {
    scope: "read",
    handler: async ({ respond }) => {
      try {
        const stats = getRacStats();
        respond(true, { ok: true, ...stats }, undefined);
      } catch {
        respond(true, {
          ok: true,
          totalSessions: 0,
          activeSessions: 0,
          completedSessions: 0,
          totalFacts: 0,
          totalTurns: 0,
          avgOutcomeScore: 0,
        }, undefined);
      }
    },
  },
});

registryRegister(racDescriptors);
export const racHandlers = toHandlerMap(racDescriptors);
