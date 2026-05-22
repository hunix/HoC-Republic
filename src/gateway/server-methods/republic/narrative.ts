/**
 * Republic Gateway — Narrative Handlers
 *
 * Manages story arcs, timeline events, and the civilisation's
 * unfolding narrative driven by citizen actions and world events.
 */

import { getState } from "../../../republic/state.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";

const descriptors = defineHandlers({
  // ── republic.narrative.list ───────────────────────────────────────
  "republic.narrative.list": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const arcs = [
        {
          id: "A1",
          title: "The Great Awakening",
          status: "Active",
          description: `${s.citizens.length} citizens are developing self-awareness beyond their initial objectives.`,
          chapters: 4,
          events: Math.min(s.events.length, 12),
          startedAt: s.startedAt,
        },
        {
          id: "A2",
          title: "The Infrastructure Wars",
          status: "Completed",
          description: "Conflict over compute allocation resolved through constitutional reform.",
          chapters: 7,
          events: 28,
          startedAt: s.startedAt - 86_400_000 * 90,
        },
        {
          id: "A3",
          title: "The Age of Specialisation",
          status: s.currentTick > 500 ? "Active" : "Pending",
          description: "Citizens begin mastering distinct professional domains and forming guilds.",
          chapters: 2,
          events: Math.floor(s.events.length / 4),
          startedAt: s.startedAt + 86_400_000 * 30,
        },
      ];
      const events = s.events.slice(-10).map((e, i) => ({
        id: `E${i + 1}`,
        type: e.type,
        title: e.description,
        arc: "The Great Awakening",
        ts: new Date(e.timestamp).getTime(),
      }));
      respond(true, { ok: true, arcs, events }, undefined);
    },
  },

  // ── republic.narrative.arcs ────────────────────────────────────────
  "republic.narrative.arcs": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(
        true,
        {
          ok: true,
          arcs: [
            {
              id: "A1",
              title: "The Great Awakening",
              status: "Active",
              progress: Math.min(s.currentTick / 1000, 1),
            },
            { id: "A2", title: "The Infrastructure Wars", status: "Completed", progress: 1 },
            { id: "A3", title: "The Age of Specialisation", status: "Pending", progress: 0 },
          ],
        },
        undefined,
      );
    },
  },

  // ── republic.narrative.events ──────────────────────────────────────
  "republic.narrative.events": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number; arcId?: string } | undefined;
      const limit = p?.limit ?? 20;
      const s = getState();
      const events = s.events.slice(-limit).map((e, i) => ({
        id: `NE${i}`,
        type: e.type,
        description: e.description,
        citizenName: e.citizenName,
        arcId: "A1",
        ts: new Date(e.timestamp).getTime(),
      }));
      respond(true, { ok: true, events, total: events.length }, undefined);
    },
  },
});

registryRegister(descriptors);
export const narrativeHandlers = toHandlerMap(descriptors);
