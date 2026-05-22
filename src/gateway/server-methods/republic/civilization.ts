/**
 * Republic Platform — Civilization RPC Handlers
 *
 * Gateway endpoints for the Innovation Roadmap civilizational engines.
 * Exposes status, dialectics, guilds, tribes, festivals, ecology,
 * prophecies, memes, museum, press, weather, and creative tools.
 */

import { getState } from "../../../republic/state.js";
import {
  getCivilizationStatus,
  getCreativeTools,
} from "../../../republic/civilizational-engines.js";
import { defineHandlers, toHandlerMap } from "../types.js";
import { registryRegister } from "../handler-registry.js";

const civilizationDescriptors = defineHandlers({
  "republic.civilization.status": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(true, { ok: true, ...getCivilizationStatus(s) }, undefined);
    },
  },
  "republic.civilization.dialectic.list": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().dialecticProposals ?? [] }, undefined);
    },
  },
  "republic.civilization.guilds.list": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().guilds ?? [] }, undefined);
    },
  },
  "republic.civilization.tribes.list": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().tribes ?? [] }, undefined);
    },
  },
  "republic.civilization.prophecies": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().prophecies ?? [] }, undefined);
    },
  },
  "republic.civilization.festivals": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().festivals ?? [] }, undefined);
    },
  },
  "republic.civilization.ecology.status": {
    scope: "read",
    handler: ({ respond }) => {
      const s = getState();
      respond(true, {
        ok: true,
        lifeforms: s.digitalEcology ?? [],
        scarcityEvents: s.scarcityEvents ?? [],
        weather: s.weatherState ?? null,
        disasters: s.disasterLog ?? [],
      }, undefined);
    },
  },
  "republic.civilization.memes.trending": {
    scope: "read",
    handler: ({ respond }) => {
      const sorted = [...(getState().memes ?? [])].toSorted((a, b) => b.fitness - a.fitness);
      respond(true, { ok: true, items: sorted.slice(0, 20) }, undefined);
    },
  },
  "republic.civilization.museum.exhibits": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().museumExhibits ?? [] }, undefined);
    },
  },
  "republic.civilization.press.articles": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().pressArticles ?? [] }, undefined);
    },
  },
  "republic.civilization.weather": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, weather: getState().weatherState ?? null }, undefined);
    },
  },
  "republic.civilization.creative-tools": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getCreativeTools() }, undefined);
    },
  },
  "republic.civilization.commons": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().commonsResources ?? [] }, undefined);
    },
  },
  "republic.civilization.central-bank": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, state: getState().centralBankState ?? null }, undefined);
    },
  },
  "republic.civilization.mutual-aid": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().mutualAidSocieties ?? [] }, undefined);
    },
  },
  "republic.civilization.mythology": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().mythology ?? [] }, undefined);
    },
  },
  "republic.civilization.rites": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().ritesLog ?? [] }, undefined);
    },
  },
  "republic.civilization.oral-traditions": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().oralTraditions ?? [] }, undefined);
    },
  },
  "republic.civilization.social-contracts": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, items: getState().socialContracts ?? [] }, undefined);
    },
  },
  "republic.civilization.asabiyyah": {
    scope: "read",
    handler: ({ respond }) => {
      respond(true, { ok: true, cycle: getState().asabiyyahCycle ?? null }, undefined);
    },
  },
});

registryRegister(civilizationDescriptors);
export const civilizationHandlers = toHandlerMap(civilizationDescriptors);
