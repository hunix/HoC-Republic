/**
 * War Theater RPC Handlers
 *
 * Provides gateway methods for the War Theater visualization system:
 * - Military base queries
 * - Carrier group tracking
 * - Strike event recording & simulation
 * - Theater configuration
 */

import type { StrikeType, BaseType } from "../../../republic/war-theater-data.js";
import type { GatewayRequestHandlers } from "../types.js";
import {
  getBases,
  getCarriers,
  getStrikes,
  getTheaters,
  getTheaterStats,
  simulateStrike,
  recordStrikeEvent,
  getBaseTypeColor,
  getBaseTypeIcon,
  COUNTRY_COORDS,
} from "../../../republic/war-theater-data.js";
import {
  getActiveSignals,
  getCIIScores,
  getWarRisks,
  getWarSignals,
  getArsenal,
} from "../../../republic/world-intelligence.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const warTheaterHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Military Bases ──────────────────────────────────────────────

  "republic.wartheater.bases": ({ params, respond }) => {
    const p = params as { country?: string; hostCountry?: string; type?: BaseType; limit?: number };
    const bases = getBases(p);
    respond(true, { ok: true, bases, total: bases.length });
  },

  "republic.wartheater.bases.stats": ({ respond }) => {
    respond(true, { ok: true, ...getTheaterStats() });
  },

  // ─── Carrier Battle Groups ───────────────────────────────────────

  "republic.wartheater.carriers": ({ params, respond }) => {
    const p = params as { country?: string; status?: string };
    const carriers = getCarriers(
      p as { country?: string; status?: "deployed" | "port" | "transit" | "exercise" },
    );
    respond(true, {
      ok: true,
      carriers,
      total: carriers.length,
      deployed: carriers.filter((c) => c.status === "deployed").length,
    });
  },

  // ─── Strike Events ──────────────────────────────────────────────

  "republic.wartheater.strikes": ({ params, respond }) => {
    const p = params as {
      country?: string;
      targetCountry?: string;
      type?: StrikeType;
      since?: number;
      limit?: number;
    };
    const strikes = getStrikes(p);
    respond(true, { ok: true, strikes, total: strikes.length });
  },

  "republic.wartheater.strikes.record": ({ params, respond }) => {
    const p = params as {
      type: StrikeType;
      originCoords: [number, number];
      targetCoords: [number, number];
      targetDescription: string;
      weapon?: string;
      platform?: string;
      country: string;
      targetCountry: string;
      source: string;
      verified?: boolean;
      narrative?: string;
    };
    if (
      !p.type ||
      !p.originCoords ||
      !p.targetCoords ||
      !p.targetDescription ||
      !p.country ||
      !p.targetCountry
    ) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "Missing required fields: type, originCoords, targetCoords, targetDescription, country, targetCountry",
        ),
      );
      return;
    }
    const strike = recordStrikeEvent({
      ...p,
      timestamp: Date.now(),
      verified: p.verified ?? false,
    });
    respond(true, { ok: true, strike });
  },

  // ─── Strike Simulation ──────────────────────────────────────────

  "republic.wartheater.simulate": ({ params, respond }) => {
    const p = params as {
      type: StrikeType;
      originBaseId?: string;
      originCarrierId?: string;
      targetCoords: [number, number];
      targetDescription: string;
      weapon?: string;
      platform?: string;
      country: string;
      targetCountry: string;
    };
    if (!p.type || !p.targetCoords || !p.targetDescription || !p.country || !p.targetCountry) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "Missing required fields for simulation"),
      );
      return;
    }
    const strike = simulateStrike(p);
    respond(true, { ok: true, strike });
  },

  // ─── Theater Configuration ──────────────────────────────────────

  "republic.wartheater.theaters": ({ respond }) => {
    respond(true, { ok: true, theaters: getTheaters() });
  },

  // ─── Country Coordinates ─────────────────────────────────────────

  "republic.wartheater.countries": ({ respond }) => {
    respond(true, { ok: true, countries: COUNTRY_COORDS });
  },

  // ─── Map Legend ─────────────────────────────────────────────────

  "republic.wartheater.legend": ({ respond }) => {
    const types: BaseType[] = [
      "air",
      "naval",
      "army",
      "missile",
      "nuclear",
      "joint",
      "cyber",
      "space",
    ];
    respond(true, {
      ok: true,
      legend: types.map((t) => ({
        type: t,
        color: getBaseTypeColor(t),
        icon: getBaseTypeIcon(t),
        label: t.charAt(0).toUpperCase() + t.slice(1) + " Base",
      })),
    });
  },

  // ─── Combined Theater Overview ──────────────────────────────────

  "republic.wartheater.overview": ({ respond }) => {
    const stats = getTheaterStats();
    const ciiScores = getCIIScores().slice(0, 10);
    const warRisks = getWarRisks().slice(0, 10);
    const warSignals = getWarSignals();
    const activeSignals = getActiveSignals();
    const deployedCarriers = getCarriers({ status: "deployed" });

    respond(true, {
      ok: true,
      stats,
      ciiScores,
      warRisks,
      warSignals,
      activeSignalCount: activeSignals.length,
      deployedCarriers: deployedCarriers.map((c) => ({
        id: c.id,
        name: c.name,
        country: c.country,
        lat: c.lat,
        lng: c.lng,
        status: c.status,
      })),
    });
  },

  // ─── Arsenal Database (enriched with coords) ───────────────────

  "republic.wartheater.arsenal": ({ params, respond }) => {
    const p = params as { country?: string };
    const arsenals = getArsenal(p?.country);
    const enriched = arsenals.map((a) => ({
      ...a,
      coords: COUNTRY_COORDS[a.country] ?? null,
    }));
    respond(true, { ok: true, arsenals: enriched });
  },
};
