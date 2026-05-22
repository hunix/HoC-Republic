/**
 * WarAgent Gateway RPC Handlers
 *
 * Implements gateway methods for the WarAgent multi-nation conflict
 * simulation (based on arXiv:2311.17227 "War and Peace (WarAgent)").
 *
 * Simulation state is now persistent via waragent-engine.ts (SQLite DAG).
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";
import {
  advanceSimulation,
  buildBoard,
  buildSticks,
  getSimulation,
  listSimulations,
  saveSimulation,
  SCENARIO_PRESETS,
  type ActionEvent,
  type ActionType,
  type CountryState,
  type SimulationState,
} from "../../../republic/waragent-engine.js";

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const warAgentHandlers: Partial<GatewayRequestHandlers> = {
  /** republic.waragent.status — overall waragent simulation status */
  "republic.waragent.status": async ({ respond }) => {
    const list = await listSimulations();
    const active = list.filter((s) => s.running && !s.ended);
    const ended = list.filter((s) => s.ended);
    respond(
      true,
      {
        ok: true,
        simulations: list,
        active: active.length,
        ended: ended.length,
        total: list.length,
        scenarios: Object.keys(SCENARIO_PRESETS),
      },
      undefined,
    );
  },

  "waragent.simulation.start": async ({ params, respond }) => {
    const p = params as
      | {
          scenario?: string;
          model?: string;
          trigger?: string;
          maxRounds?: number;
        }
      | undefined;

    const scenario = p?.scenario ?? "WWI";
    const countries: CountryState[] = (SCENARIO_PRESETS[scenario] ?? SCENARIO_PRESETS["WWI"]).map(
      (c) => ({ ...c }),
    );
    const id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sim: SimulationState = {
      id,
      scenario,
      model: p?.model ?? "gpt-4",
      trigger: p?.trigger ?? "Assassination of Archduke Franz Ferdinand",
      currentRound: 0,
      maxRounds: p?.maxRounds ?? 10,
      running: true,
      ended: false,
      countries,
      board: buildBoard(countries),
      sticks: buildSticks(countries),
      events: [],
      createdAt: new Date().toISOString(),
    };
    await saveSimulation(sim);
    respond(true, { ok: true, id, simulation: sim }, undefined);
  },

  "waragent.simulation.get": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    let sim: SimulationState | null = null;
    if (p?.id) {
      sim = await getSimulation(p.id);
    }

    // If no id given (or id not found), fall back to the most recent simulation
    if (!sim) {
      const all = await listSimulations();
      if (all.length > 0) {
        sim = await getSimulation(all[0].id!);
      }
    }

    // Auto-seed a default simulation if none exist yet
    if (!sim) {
      const scenario = "WWI";
      const countries: CountryState[] = (SCENARIO_PRESETS[scenario] ?? SCENARIO_PRESETS["WWI"]).map(
        (c) => ({ ...c }),
      );
      const id = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sim = {
        id,
        scenario,
        model: "auto",
        trigger: "Gateway boot — auto-seeded simulation",
        currentRound: 0,
        maxRounds: 10,
        running: true,
        ended: false,
        countries,
        board: buildBoard(countries),
        sticks: buildSticks(countries),
        events: [
          {
            id: `evt-${Date.now()}`,
            round: 0,
            actorId: "system",
            actorName: "Gateway",
            action: "Wait" as ActionType,
            targets: [],
            reasoning: "Simulation auto-started with gateway boot",
            timestamp: new Date().toISOString(),
            secretaryApproved: true,
          },
        ],
        createdAt: new Date().toISOString(),
      };
      await saveSimulation(sim);
    }
    respond(true, { ok: true, simulation: sim }, undefined);
  },

  "waragent.simulation.step": async ({ params, respond }) => {
    const p = params as { id?: string } | undefined;
    if (!p?.id) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id required"));
      return;
    }
    const sim = await getSimulation(p.id);
    if (!sim) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Simulation not found"));
      return;
    }
    if (sim.ended) {
      respond(true, { ok: true, simulation: sim }, undefined);
      return;
    }
    const updated = advanceSimulation(sim);
    await saveSimulation(updated);
    respond(true, { ok: true, simulation: updated }, undefined);
  },

  "waragent.simulation.manualAction": async ({ params, respond }) => {
    const p = params as
      | {
          id?: string;
          action?: string;
          actorId?: string;
          targets?: string[];
        }
      | undefined;

    if (!p?.id || !p?.action || !p?.actorId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "id, action, and actorId are required"),
      );
      return;
    }
    const sim = await getSimulation(p.id);
    if (!sim) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Simulation not found"));
      return;
    }
    const country = sim.countries.find((c) => c.id === p.actorId);
    const event: ActionEvent = {
      id: `manual-${Date.now()}`,
      round: sim.currentRound,
      actorId: p.actorId,
      actorName: country?.name ?? p.actorId,
      action: p.action as ActionType,
      targets: p.targets ?? [],
      reasoning: "Manual action issued by operator.",
      timestamp: new Date().toISOString(),
      secretaryApproved: true,
      secretaryNote: "Operator override — secretary check bypassed.",
    };
    const updated: SimulationState = { ...sim, events: [...sim.events, event] };
    await saveSimulation(updated);
    respond(true, { ok: true, simulation: updated }, undefined);
  },

  "waragent.simulation.list": async ({ respond }) => {
    const list = await listSimulations();
    respond(true, { ok: true, simulations: list }, undefined);
  },
};
