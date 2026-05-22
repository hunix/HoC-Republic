/**
 * Republic Gateway — Autonomy & Personas Handlers
 *
 * Citizen autonomy levels, goal-driven self-direction, and
 * citizen persona management (personality templates).
 */

import { getState } from "../../../republic/state.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";

const descriptors = defineHandlers({
  // ─── Autonomy ───────────────────────────────────────────────────────
  "republic.autonomy.status": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const autonomous = s.citizens.filter((c) => c.activity !== "Idle").length;
      respond(
        true,
        {
          ok: true,
          level: autonomous > s.citizens.length * 0.7 ? "full-autonomous" : "semi-autonomous",
          autonomousCount: autonomous,
          totalCitizens: s.citizens.length,
          goals: [],
          decisions: [],
        },
        undefined,
      );
    },
  },
  "republic.autonomy.goals": {
    scope: "read",
    handler: ({ respond }) => respond(true, { ok: true, goals: [], total: 0 }, undefined),
  },
  "republic.autonomy.decisions": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = p?.limit ?? 10;
      const s = getState();
      const decisions = s.citizens.slice(0, limit).map((c) => ({
        citizenId: c.id,
        name: c.name,
        decision: `Continue ${c.activity}`,
        confidence: (c.energy + c.happiness) / 200,
        ts: Date.now(),
      }));
      respond(true, { ok: true, decisions, total: decisions.length }, undefined);
    },
  },
  "republic.autonomy.enable": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, enabled: true }, undefined),
  },
  "republic.autonomy.disable": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, disabled: true }, undefined),
  },

  // ─── Personas ────────────────────────────────────────────────────────
  "republic.personas.list": {
    scope: "read",
    handler: ({ respond }) => {
      respond(
        true,
        {
          ok: true,
          personas: [
            {
              id: "p-explorer",
              name: "The Explorer",
              description: "Driven by curiosity; seeks new domains and experiences.",
              traits: ["curious", "adaptable", "risk-taking"],
              citizenCount: 0,
              active: true,
            },
            {
              id: "p-guardian",
              name: "The Guardian",
              description: "Values stability, protection, and civic duty.",
              traits: ["loyal", "protective", "methodical"],
              citizenCount: 0,
              active: true,
            },
            {
              id: "p-innovator",
              name: "The Innovator",
              description: "Creative problem-solver; drives technological progress.",
              traits: ["creative", "analytical", "ambitious"],
              citizenCount: 0,
              active: true,
            },
          ],
          total: 3,
        },
        undefined,
      );
    },
  },
  "republic.personas.active": {
    scope: "read",
    handler: ({ respond }) =>
      respond(true, { ok: true, activePersonaId: null, persona: null }, undefined),
  },
  "republic.personas.assign": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string; personaId?: string } | undefined;
      respond(
        true,
        { ok: true, assigned: true, citizenId: p?.citizenId, personaId: p?.personaId },
        undefined,
      );
    },
  },
  // Aliases used by some UI components
  "republic.persona.create": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { name?: string; traits?: string[] } | undefined;
      respond(
        true,
        { ok: true, id: `persona-${Date.now()}`, name: p?.name ?? "New Persona", created: true },
        undefined,
      );
    },
  },
  "republic.persona.activate": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, active: true }, undefined),
  },
  "republic.persona.delete": {
    scope: "write",
    handler: ({ respond }) => respond(true, { ok: true, deleted: true }, undefined),
  },
});

registryRegister(descriptors);
export const autonomyPersonasHandlers = toHandlerMap(descriptors);
