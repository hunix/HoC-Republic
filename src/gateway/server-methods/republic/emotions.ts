/**
 * Republic Gateway — Emotion Intelligence Handlers
 *
 * Covers both republican emotion aggregate stats (republic.emotions.*)
 * and per-citizen emotion engine (republic.emotion.*).
 */

import { getState } from "../../../republic/state.js";
import { registryRegister } from "../handler-registry.js";
import { defineHandlers, toHandlerMap } from "../types.js";

const descriptors = defineHandlers({
  // ── republic.emotions.status ─────────────────────────────────────
  "republic.emotions.status": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const n = s.citizens.length || 1;
      const avgHappiness = Math.round(s.citizens.reduce((a, c) => a + c.happiness, 0) / n);
      const avgEnergy = Math.round(s.citizens.reduce((a, c) => a + c.energy, 0) / n);
      const moods: Record<string, number> = {};
      for (const c of s.citizens) {
        const m = c.mood ?? "neutral";
        moods[m] = (moods[m] ?? 0) + 1;
      }
      respond(
        true,
        { ok: true, avgHappiness, avgEnergy, moods, total: s.citizens.length },
        undefined,
      );
    },
  },

  // ── republic.emotions.history ─────────────────────────────────────
  "republic.emotions.history": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = p?.limit ?? 20;
      const s = getState();
      const history = s.events
        .filter((e) =>
          ["married", "divorced", "birth", "death", "party", "mood-shift"].includes(e.type),
        )
        .slice(-limit)
        .map((e) => ({
          type: e.type,
          description: e.description,
          citizenName: e.citizenName,
          ts: new Date(e.timestamp).getTime(),
        }));
      respond(true, { ok: true, history, total: history.length }, undefined);
    },
  },

  // ── republic.emotions.citizen ─────────────────────────────────────
  "republic.emotions.citizen": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { citizenId?: string } | undefined;
      const s = getState();
      const c = s.citizens.find((x) => x.id === p?.citizenId);
      if (!c) {
        respond(true, { ok: true, emotion: null }, undefined);
        return;
      }
      respond(
        true,
        {
          ok: true,
          emotion: {
            citizenId: c.id,
            name: c.name,
            mood: c.mood ?? "neutral",
            happiness: c.happiness,
            energy: c.energy,
            health: c.health,
          },
        },
        undefined,
      );
    },
  },

  // ── republic.emotion.stats ────────────────────────────────────────
  // Used by Emotions.tsx UI (no trailing 's')
  "republic.emotion.stats": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const moods: Record<string, number> = {};
      for (const c of s.citizens) {
        const m = c.mood ?? "neutral";
        moods[m] = (moods[m] ?? 0) + 1;
      }
      const n = s.citizens.length || 1;
      const avgJoy = s.citizens.reduce((a, c) => a + c.happiness / 100, 0) / n;
      const avgSadness = s.citizens.reduce((a, c) => a + (100 - c.happiness) / 200, 0) / n;
      const avgAnger = s.citizens.reduce((a, c) => a + (100 - c.energy) / 300, 0) / n;
      const avgFear = s.citizens.reduce((a, c) => a + (100 - c.health) / 300, 0) / n;
      const avgTrust = s.citizens.reduce((a, c) => a + c.energy / 100, 0) / n;
      const mostCommon = Object.entries(moods).toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";
      respond(
        true,
        {
          ok: true,
          avgJoy,
          avgSadness,
          avgAnger,
          avgFear,
          avgTrust,
          mostCommon,
          volatilityIndex: Math.abs(avgJoy - avgSadness),
          moodDistribution: moods,
        },
        undefined,
      );
    },
  },

  // ── republic.emotion.states ───────────────────────────────────────
  "republic.emotion.states": {
    scope: "read",
    handler: ({ params, respond }) => {
      const p = params as { limit?: number } | undefined;
      const limit = Math.min(p?.limit ?? 20, 100);
      const s = getState();
      const states = s.citizens.slice(0, limit).map((c) => ({
        citizenId: c.id,
        name: c.name,
        mood: c.mood ?? "neutral",
        dominant: c.happiness > 60 ? "joy" : c.happiness > 40 ? "trust" : "sadness",
        joy: c.happiness / 100,
        sadness: (100 - c.happiness) / 200,
        anger: (100 - c.energy) / 300,
        fear: (100 - c.health) / 300,
        trust: c.energy / 100,
        anticipation: (c.happiness + c.energy) / 200,
      }));
      respond(true, { ok: true, states }, undefined);
    },
  },

  // ── republic.emotion.volatile ─────────────────────────────────────
  "republic.emotion.volatile": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      const citizens = s.citizens
        .filter((c) => c.happiness < 30 || c.energy < 25)
        .slice(0, 10)
        .map((c) => ({
          citizenId: c.id,
          name: c.name,
          mood: c.mood ?? "distressed",
          dominant: "anger",
          happiness: c.happiness,
          energy: c.energy,
        }));
      respond(true, { ok: true, citizens }, undefined);
    },
  },
});

registryRegister(descriptors);
export const emotionHandlers = toHandlerMap(descriptors);
