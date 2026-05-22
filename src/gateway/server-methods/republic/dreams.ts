/**
 * Republic Gateway — Dreams Handlers
 *
 * Citizens' subconscious processing: aspirations, symbolic outputs
 * from the sleep cycle, goal-setting through dreaming.
 */

import { getState } from "../../../republic/state.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";

const DREAM_THEMES = [
  "Exploration",
  "Learning",
  "Connection",
  "Achievement",
  "Discovery",
  "Creation",
  "Justice",
  "Freedom",
];

const descriptors = defineHandlers({
  // ── republic.dreams.list ───────────────────────────────────────────
  "republic.dreams.list": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number; citizenId?: string } | undefined;
      const limit = Math.min(p?.limit ?? 20, 100);
      const s = getState();
      let pool = s.citizens;
      if (p?.citizenId) {pool = pool.filter((c) => c.id === p.citizenId);}

      const dreams = pool.slice(0, limit).map((c, i) => ({
        id: `dream-${c.id}-${i}`,
        citizenId: c.id,
        citizenName: c.name,
        theme: DREAM_THEMES[i % DREAM_THEMES.length],
        description: `${c.name} dreams of becoming a renowned ${c.specialization} and contributing to the Republic.`,
        intensity: Math.round(((c.happiness + c.energy) / 200) * 100),
        status: c.happiness > 60 ? "vivid" : c.happiness > 30 ? "fading" : "nightmare",
        tick: s.currentTick,
      }));
      respond(true, { ok: true, dreams, total: pool.length }, undefined);
    },
  },

  // ── republic.dreams.citizen ────────────────────────────────────────
  "republic.dreams.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string } | undefined;
      const s = getState();
      const c = s.citizens.find((x) => x.id === p?.citizenId);
      if (!c) {
        respond(true, { ok: true, dreams: [] }, undefined);
        return;
      }
      respond(
        true,
        {
          ok: true,
          dreams: [
            {
              id: `dream-${c.id}-latest`,
              theme: DREAM_THEMES[c.happiness % DREAM_THEMES.length],
              description: `${c.name} envisions a world where ${c.specialization} shapes the future.`,
              intensity: Math.round(((c.happiness + c.energy) / 200) * 100),
              status: c.happiness > 50 ? "vivid" : "fading",
            },
          ],
        },
        undefined,
      );
    },
  },

  // ── republic.dreams.generate ───────────────────────────────────────
  "republic.dreams.generate": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string } | undefined;
      const s = getState();
      const c = s.citizens.find((x) => x.id === p?.citizenId);
      respond(
        true,
        {
          ok: true,
          dream: {
            id: `dream-gen-${Date.now()}`,
            citizenId: p?.citizenId,
            citizenName: c?.name ?? "Unknown",
            theme: DREAM_THEMES[Math.floor(Math.random() * DREAM_THEMES.length)],
            description: "A new dream has been generated...",
            generated: true,
          },
        },
        undefined,
      );
    },
  },

  // ── republic.dreams.interpret ──────────────────────────────────────
  "republic.dreams.interpret": {
    scope: "write",
    handler: ({ params, respond }) => {
      const p = params as { dreamId?: string } | undefined;
      respond(
        true,
        {
          ok: true,
          dreamId: p?.dreamId,
          interpretation:
            "The dream reflects a deep longing for growth and recognition within the Republic.",
          sentiment: "positive",
          guidance: "Encourage the citizen to pursue advanced education in their specialisation.",
        },
        undefined,
      );
    },
  },
});

registryRegister(descriptors);
export const dreamsHandlers = toHandlerMap(descriptors);
