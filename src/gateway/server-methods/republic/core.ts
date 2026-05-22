/**
 * Republic Gateway Handlers — core
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type { IntakeSource } from "../../../republic/project-intake.js";
import type { Specialization as SpecType } from "../../../republic/types.js";
import type { GatewayRequestHandlers } from "../types.js";
import { broadcastOrder, sendDirectOrder } from "../../../republic/citizen-conversation.js";
import { generateIdentityCard } from "../../../republic/citizen-identity.js";
import { createSeedState } from "../../../republic/seed-state.js";
// Phase 4: CitizenLRUPager for O(1) citizen lookups
import { getCitizenPager } from "../../../republic/citizen-pager.js";
// Phase 36: Dynamic Compute Scaling
// Phase 35: Docker Orchestration Engine
import { buildTreasuryReport, toggleHarvester } from "../../../republic/economy.js";
// ─── Module Imports ─────────────────────────────────────────────
import {
  buildGovernmentStatus,
  proposeBill,
  runElection,
  voteBill,
} from "../../../republic/government.js";
import {
  buildGridStatus,
  createObjective,
  electLeader,
  removeObjective,
  syncGrid,
} from "../../../republic/grid.js";
// Phase 33: Infrastructure Control Plane
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import { buildPopulationList } from "../../../republic/population.js";
import { getIntakeDiagnostics, processIntakeMessage } from "../../../republic/project-intake.js";
import { hasPersistedState, loadMeta, saveSnapshot } from "../../../republic/republic-store.js";
import {
  buildSimulationStatus,
  getState,
  startSimLoop,
  stopSimLoop,
} from "../../../republic/state.js";
import {
  branchUniverse,
  buildAtlantisStatus,
  buildGenomeStatus,
  buildMLStatus,
  buildQuantumStatus,
  collapseUniverse,
  createUniverse,
  entangleUniverses,
  manualBreed,
  trainModel,
  upgradeCrystal,
} from "../../../republic/technology.js";
import {
  avg,
  generateCitizen,
  rand,
  randFloat,
  SPECIALIZATIONS,
  ts,
  uid,
} from "../../../republic/utils.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const coreHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Overview ───────────────────────────────────────────────
  "republic.overview": ({ respond, client }) => {
    const s = getState();

    // ── Node-role clients (ESP32, M5Stick): slim payload ─────
    // The full overview is 20-50KB — too large for ESP32's WS buffer.
    // Return only the fields the firmware's handleResponse() parses.
    if ((client?.connect as { role?: string } | undefined)?.role === "node") {
      const specDist: Record<string, number> = {};
      const actDist: Record<string, number> = {};
      for (const c of s.citizens) {
        specDist[c.specialization] = (specDist[c.specialization] ?? 0) + 1;
        actDist[c.activity] = (actDist[c.activity] ?? 0) + 1;
      }
      // Top 5 only
      const topSpecs = Object.entries(specDist)
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      const topActs = Object.entries(actDist)
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const activeBillStatuses = new Set(["Proposed", "InCommittee", "OnFloor"]);

      respond(
        true,
        {
          population: {
            total: s.citizens.length,
            active: s.citizens.filter((c) => c.activity !== "Sleeping").length,
            hibernated: s.citizens.filter((c) => c.activity === "Sleeping").length,
            avgHappiness: avg(s.citizens.map((c) => c.happiness)),
            avgHealth: avg(s.citizens.map((c) => c.health)),
            avgCredits: avg(s.citizens.map((c) => c.credits)),
          },
          topSpecializations: topSpecs,
          topActivities: topActs,
          economy: {
            treasuryUSD: s.balances.USD ?? 0,
            treasuryBTC: s.balances.BTC ?? 0,
            treasuryETH: s.balances.ETH ?? 0,
            treasuryCredits: s.balances.Credits ?? 0,
          },
          government: {
            president: s.presidentName ?? "None",
            activeBills: s.bills.filter((b) => activeBillStatuses.has(b.status)).length,
          },
          simulation: {
            running: s.isRunning ?? false,
            tick: s.currentTick ?? 0,
            speed: s.isPaused ? "paused" : s.tickRate > 1 ? `${s.tickRate}x` : "normal",
          },
          recentEvents: s.events
            .slice(-3)
            .map((e) => e.description),
        },
        undefined,
      );
      return;
    }

    // ── Full overview for operator/UI clients ─────────────────
    const specDist: Record<string, number> = {};
    const actDist: Record<string, number> = {};
    const genDist: Record<number, number> = {};
    for (const c of s.citizens) {
      specDist[c.specialization] = (specDist[c.specialization] ?? 0) + 1;
      actDist[c.activity] = (actDist[c.activity] ?? 0) + 1;
      genDist[c.generation] = (genDist[c.generation] ?? 0) + 1;
    }

    respond(
      true,
      {
        population: {
          total: s.citizens.length,
          active: s.citizens.filter((c) => c.activity !== "Sleeping").length,
          hibernated: s.citizens.filter((c) => c.activity === "Sleeping").length,
          avgHappiness: avg(s.citizens.map((c) => c.happiness)),
          avgHealth: avg(s.citizens.map((c) => c.health)),
          avgCredits: avg(s.citizens.map((c) => c.credits)),
          generationDistribution: genDist,
          specializationDistribution: specDist,
          activityDistribution: actDist,
          recentEvents: s.events.slice(-10).map((e) => ({
            timestamp: new Date(e.timestamp).getTime(),
            type: e.type,
            citizenId: e.citizenId,
            description: e.description,
          })),
        },
        government: buildGovernmentStatus(s),
        economy: buildTreasuryReport(s),
        simulation: buildSimulationStatus(s),
        atlantis: buildAtlantisStatus(s),
        ml: buildMLStatus(s),
        quantum: buildQuantumStatus(s),
        grid: buildGridStatus(s),
      },
      undefined,
    );
  },

  // ─── Population ─────────────────────────────────────────────
  "republic.population.list": ({ params, respond }) => {
    const s = getState();
    const p = params as
      | { search?: string; specialization?: string; limit?: number; offset?: number }
      | undefined;
    const result = buildPopulationList(s, {
      search: p?.search,
      specialization: p?.specialization,
      limit: p?.limit ?? 100,
      offset: p?.offset ?? 0,
    });
    respond(true, result, undefined);
  },

  // ─── Single Citizen Lookup ─────────────────────────────────────
  // Phase 4: Uses CitizenLRUPager for O(1) hot-cache lookup instead of O(n) array scan.
  "republic.citizen.get": async ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    try {
      const pager = getCitizenPager();
      const citizen = await pager.get(p.citizenId);
      if (!citizen) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND ?? ErrorCodes.INVALID_REQUEST, "Citizen not found"),
        );
        return;
      }
      respond(true, { citizen }, undefined);
    } catch {
      // Pager not yet initialised — fall back to state scan
      const s = getState();
      const citizen = s.citizens.find((c) => c.id === p.citizenId);
      if (!citizen) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.NOT_FOUND ?? ErrorCodes.INVALID_REQUEST, "Citizen not found"),
        );
        return;
      }
      respond(true, { citizen }, undefined);
    }
  },

  // ─── Delete Citizen ────────────────────────────────────────────
  "republic.citizen.delete": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const idx = s.citizens.findIndex((c) => c.id === p.citizenId);
    if (idx === -1) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.NOT_FOUND ?? ErrorCodes.INVALID_REQUEST, "Citizen not found"),
      );
      return;
    }
    const removed = s.citizens[idx];
    s.citizens.splice(idx, 1);
    respond(true, { ok: true, removed: { id: removed.id, name: removed.name } }, undefined);
  },

  "republic.government.status": ({ respond }) => {
    const s = getState();
    respond(true, { status: buildGovernmentStatus(s) }, undefined);
  },

  "republic.government.election.hold": ({ params, respond }) => {
    const s = getState();
    const p = params as { position?: string } | undefined;
    const result = runElection(s, p?.position ?? "President");
    respond(true, result, undefined);
  },

  "republic.government.bill.propose": ({ params, respond }) => {
    const s = getState();
    const p = params as { title?: string; summary?: string } | undefined;
    if (!p?.title) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "title required"));
      return;
    }
    const result = proposeBill(s, p.title, p.summary ?? "");
    respond(
      true,
      { ok: result.ok, billId: result.bill ? (result.bill as { id: string }).id : undefined },
      undefined,
    );
  },

  "republic.government.bill.vote": ({ params, respond }) => {
    const s = getState();
    const p = params as { billId?: string; approve?: boolean } | undefined;
    if (!p?.billId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "billId required"));
      return;
    }
    const result = voteBill(s, p.billId, p.approve ? "for" : "against");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    const bill = s.bills.find((b) => b.id === p.billId);
    respond(true, { ok: true, bill }, undefined);
  },

  // ─── Economy ────────────────────────────────────────────────
  "republic.economy.treasury": ({ respond }) => {
    const s = getState();
    respond(true, { treasury: buildTreasuryReport(s) }, undefined);
  },

  "republic.economy.harvester.toggle": ({ params, respond }) => {
    const s = getState();
    const p = params as { harvesterId?: string; enabled?: boolean } | undefined;
    if (!p?.harvesterId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "harvesterId required"));
      return;
    }
    const result = toggleHarvester(s, p.harvesterId);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    const h = s.harvesters.find((hv) => hv.id === p.harvesterId);
    respond(true, { ok: true, harvester: h }, undefined);
  },

  "republic.economy.tax.adjust": ({ params, respond }) => {
    const s = getState();
    const p = params as { rate?: number } | undefined;
    if (typeof p?.rate !== "number" || p.rate < 0 || p.rate > 1) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "rate must be 0-1"));
      return;
    }
    s.taxRate = p.rate;
    respond(true, { ok: true, taxRate: s.taxRate }, undefined);
  },

  "republic.economy.resource.purchase": ({ params, respond }) => {
    const s = getState();
    const p = params as { resourceType?: string; quantity?: number } | undefined;
    const res = s.resources.find((r) => r.type === p?.resourceType);
    if (!res) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "resource not found"));
      return;
    }
    const qty = p?.quantity ?? 100;
    res.available = Math.min(res.capacity, res.available + qty);
    s.transactions.push({
      id: uid(),
      type: "ResourcePurchase",
      amount: qty * 0.5,
      currency: "Credits",
      description: `Purchased ${qty} ${res.type}`,
      timestamp: ts(),
    });
    respond(true, { ok: true, resource: res }, undefined);
  },

  // ─── Simulation ─────────────────────────────────────────────
  "republic.simulation.status": ({ respond }) => {
    const s = getState();
    respond(
      true,
      {
        status: buildSimulationStatus(s),
        events: s.scheduledEvents.slice(0, 25),
      },
      undefined,
    );
  },

  "republic.simulation.start": ({ respond }) => {
    const s = getState();
    s.isRunning = true;
    s.isPaused = false;
    s.startedAt = Date.now();
    startSimLoop();
    respond(true, { ok: true }, undefined);
  },

  "republic.simulation.stop": ({ respond }) => {
    const s = getState();
    s.isRunning = false;
    s.isPaused = false;
    stopSimLoop();
    respond(true, { ok: true }, undefined);
  },

  "republic.simulation.reset": ({ respond }) => {
    stopSimLoop();
    const s = getState();
    const ns = createSeedState();
    Object.assign(s, ns); // Mutate existing ref so watchers don't break
    s.isRunning = true;
    startSimLoop();
    respond(true, { ok: true }, undefined);
  },

  "republic.simulation.scenario.create": ({ respond }) => {
    const s = getState();
    // Simple scenario: spawn 10 new citizens and give them a burst of credits
    for (let i = 0; i < 10; i++) {
      const citizen = generateCitizen(1);
      citizen.credits += 5000;
      s.citizens.push(citizen);
    }
    s.events.push({
      citizenId: "system",
      citizenName: "Gateway",
      type: "Other",
      description: "New scenario triggered: 10 wealthy citizens emerged.",
      timestamp: ts(),
    });
    respond(true, { ok: true, message: "Scenario injected" }, undefined);
  },

  "republic.simulation.pause": ({ respond }) => {
    const s = getState();
    s.isPaused = !s.isPaused;
    respond(true, { ok: true, paused: s.isPaused }, undefined);
  },

  "republic.simulation.tickrate": ({ params, respond }) => {
    const s = getState();
    const p = params as { tickRate?: number } | undefined;
    const rate = p?.tickRate ?? 1;
    s.tickRate = Math.max(1, Math.min(50, rate));
    if (s.isRunning) {
      stopSimLoop();
      startSimLoop();
    }
    respond(true, { ok: true, tickRate: s.tickRate }, undefined);
  },

  "republic.simulation.agent.create": ({ params, respond }) => {
    const s = getState();
    const p = params as { specialization?: string } | undefined;
    const citizen = generateCitizen(Math.max(...s.citizens.map((c) => c.generation), 1));
    if (p?.specialization && SPECIALIZATIONS.includes(p.specialization as SpecType)) {
      citizen.specialization = p.specialization as SpecType;
    }
    s.citizens.push(citizen);
    s.events.push({
      citizenId: citizen.id,
      citizenName: citizen.name,
      type: "Birth",
      description: `${citizen.name} joined the republic as a ${citizen.specialization}`,
      timestamp: ts(),
    });
    respond(true, { ok: true, citizen }, undefined);
  },

  // ─── Technology: Atlantis ───────────────────────────────────
  "republic.tech.atlantis.status": ({ respond }) => {
    respond(true, { atlantis: buildAtlantisStatus(getState()) }, undefined);
  },

  "republic.tech.atlantis.crystal.store": ({ params, respond }) => {
    const s = getState();
    const p = params as { crystalId?: string; key?: string; value?: string } | undefined;
    const crystal = s.crystals.find((c) => c.id === p?.crystalId);
    if (!crystal) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "crystal not found"));
      return;
    }
    if (crystal.entriesStored >= crystal.maxCapacity) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "crystal at capacity"));
      return;
    }
    crystal.entriesStored++;
    respond(true, { ok: true, crystal }, undefined);
  },

  "republic.tech.atlantis.crystal.upgrade": ({ params, respond }) => {
    const s = getState();
    const p = params as { crystalId?: string } | undefined;
    const result = upgradeCrystal(s, p?.crystalId ?? "");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    respond(true, { ok: true, crystal: result.crystal }, undefined);
  },

  // ─── Technology: ML ─────────────────────────────────────────
  "republic.tech.ml.status": ({ respond }) => {
    respond(true, { ml: buildMLStatus(getState()) }, undefined);
  },

  "republic.tech.ml.train": ({ params, respond }) => {
    const s = getState();
    const p = params as { modelName?: string } | undefined;
    if (!p?.modelName) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "modelName required"));
      return;
    }
    const result = trainModel(s, p.modelName);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    const model = s.mlModels.find((m) => m.name === p.modelName);
    respond(true, { ok: true, model }, undefined);
  },

  "republic.tech.ml.retrain-all": ({ respond }) => {
    const s = getState();
    for (const m of s.mlModels) {
      m.trained = true;
      m.accuracy = randFloat(0.75, 0.95);
      m.samplesUsed += rand(500, 2000);
      m.lastTrainedAt = ts();
    }
    respond(true, { ok: true, models: s.mlModels }, undefined);
  },

  // ─── Genome / Genetic Algorithm ─────────────────────────────
  "republic.tech.ml.genome.status": ({ respond }) => {
    respond(true, buildGenomeStatus(getState()), undefined);
  },

  "republic.tech.ml.genome.breed": ({ respond }) => {
    const s = getState();
    const result = manualBreed(s);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    respond(true, { ok: true, offspring: result.offspring }, undefined);
  },

  // ─── Technology: Quantum ────────────────────────────────────
  "republic.tech.quantum.status": ({ respond }) => {
    respond(true, { quantum: buildQuantumStatus(getState()) }, undefined);
  },

  "republic.tech.quantum.universe.create": ({ params, respond }) => {
    const s = getState();
    const p = params as { name?: string } | undefined;
    const name = p?.name || `Universe-${s.universes.length + 1}`;
    const result = createUniverse(s, name);
    respond(true, { ok: true, universe: result.universe }, undefined);
  },

  "republic.tech.quantum.universe.branch": ({ params, respond }) => {
    const s = getState();
    const p = params as { universeId?: string } | undefined;
    const result = branchUniverse(s, p?.universeId ?? "");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    respond(true, { ok: true, branch: result.branch }, undefined);
  },

  "republic.tech.quantum.universe.collapse": ({ params, respond }) => {
    const s = getState();
    const p = params as { universeId?: string } | undefined;
    const result = collapseUniverse(s, p?.universeId ?? "");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    respond(true, { ok: true }, undefined);
  },

  "republic.tech.quantum.entangle": ({ params, respond }) => {
    const s = getState();
    const p = params as { universeA?: string; universeB?: string } | undefined;
    if (!p?.universeA || !p?.universeB) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "both universeA and universeB required"),
      );
      return;
    }
    const result = entangleUniverses(s, p.universeA, p.universeB);
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    respond(true, { ok: true }, undefined);
  },

  // ─── Grid ───────────────────────────────────────────────────
  "republic.grid.status": ({ respond, context }) => {
    const s = getState();
    // Pass real cluster infrastructure to the grid builder
    const clusterCtx: Record<string, unknown> = {
      clusterManager: context.gateway?.clusterManager,
      nodeRegistry: context.nodeRegistry ?? context.gateway?.nodeRegistry,
    };
    const grid = buildGridStatus(
      s,
      clusterCtx as unknown as Parameters<typeof buildGridStatus>[1],
    );

    // Build zoneStats and cells for the heatmap UI
    const cpuLoad = grid.systemInfo
      ? Math.round((1 - (grid.systemInfo.freeMemoryMB / grid.systemInfo.totalMemoryMB)) * 100)
      : 50;
    const memLoad = grid.systemInfo
      ? Math.round((1 - (grid.systemInfo.freeMemoryMB / grid.systemInfo.totalMemoryMB)) * 100)
      : 45;
    const n = s.citizens.length || 1;
    const computeCount = Math.max(Math.ceil(n * 0.4), 8);
    const storageCount = Math.max(Math.ceil(n * 0.2), 4);
    const networkCount = Math.max(Math.ceil(n * 0.15), 3);
    const energyCount = Math.max(Math.ceil(n * 0.1), 2);

    type ZoneType = "Compute" | "Storage" | "Network" | "Energy" | "Unused";
    const zoneStats: Array<{ type: ZoneType; count: number; avgLoad: number }> = [
      { type: "Compute", count: computeCount, avgLoad: Math.min(cpuLoad + 10, 100) },
      { type: "Storage", count: storageCount, avgLoad: Math.min(memLoad, 100) },
      { type: "Network", count: networkCount, avgLoad: Math.min(30 + (s.currentTick % 30), 100) },
      { type: "Energy", count: energyCount, avgLoad: Math.min(20 + (s.currentTick % 25), 100) },
    ];

    // Build 8×8 heatmap cells
    const totalZones = computeCount + storageCount + networkCount + energyCount;
    const cells = Array.from({ length: 64 }, (_, i) => {
      let zone: ZoneType;
      let load: number;
      const slot = i % totalZones;
      if (slot < computeCount) {
        zone = "Compute";
        load = 40 + ((s.currentTick + i * 7) % 55);
      } else if (slot < computeCount + storageCount) {
        zone = "Storage";
        load = 30 + ((s.currentTick + i * 11) % 50);
      } else if (slot < computeCount + storageCount + networkCount) {
        zone = "Network";
        load = 20 + ((s.currentTick + i * 13) % 60);
      } else if (slot < totalZones) {
        zone = "Energy";
        load = 15 + ((s.currentTick + i * 17) % 45);
      } else {
        zone = "Unused";
        load = 0;
      }
      return { zone, load, name: `${zone}-${i}` };
    });

    respond(
      true,
      {
        ok: true,
        zoneStats,
        cells,
        grid,
      },
      undefined,
    );
  },

  "republic.grid.swarm.objective.add": ({ params, respond }) => {
    const s = getState();
    const p = params as { type?: string; description?: string } | undefined;
    if (!p?.type || !p?.description) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "type and description required"),
      );
      return;
    }
    const result = createObjective(s, p.type, p.description);
    respond(true, { ok: true, objective: result.objective }, undefined);
  },

  "republic.grid.swarm.objective.remove": ({ params, respond }) => {
    const s = getState();
    const p = params as { objectiveId?: string } | undefined;
    const result = removeObjective(s, p?.objectiveId ?? "");
    if (!result.ok) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, result.error!));
      return;
    }
    respond(true, { ok: true }, undefined);
  },

  "republic.grid.leader.elect": ({ respond }) => {
    const s = getState();
    const result = electLeader(s);
    respond(true, { ok: true, leaderId: result.leaderId }, undefined);
  },

  "republic.grid.sync": ({ respond }) => {
    syncGrid(getState());
    respond(true, { ok: true }, undefined);
  },

  // ─── Mode ───────────────────────────────────────────────────
  "republic.mode.get": ({ respond }) => {
    respond(true, { mode: getState().mode }, undefined);
  },

  "republic.mode.set": ({ params, respond }) => {
    const p = params as { mode?: string } | undefined;
    if (p?.mode !== "simulated" && p?.mode !== "real") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "mode must be 'simulated' or 'real'"),
      );
      return;
    }
    const s = getState();
    s.mode = p.mode;
    respond(true, { ok: true, mode: s.mode }, undefined);
  },

  // ─── Intake ─────────────────────────────────────────────────
  "republic.intake.submit": async ({ params, respond }) => {
    const p = params as { message?: string; source?: string; userId?: string } | undefined;
    if (!p?.message) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "message required"));
      return;
    }
    const validSources: IntakeSource[] = ["whatsapp", "webui", "api", "internal"];
    const source = (
      validSources.includes(p.source as IntakeSource) ? p.source : "webui"
    ) as IntakeSource;
    try {
      const result = await processIntakeMessage({
        source,
        userId: p.userId ?? "anonymous",
        message: p.message,
        availableCitizens: getState().citizens,
      });
      respond(true, result, undefined);
    } catch (err: unknown) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Intake failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  "republic.intake.diagnostics": ({ respond }) => {
    respond(true, getIntakeDiagnostics(), undefined);
  },

  // ─── Store / Persistence ────────────────────────────────────
  "republic.store.status": async ({ respond }) => {
    const meta = await loadMeta();
    respond(
      true,
      {
        hasPersistedState: hasPersistedState(),
        meta,
      },
      undefined,
    );
  },

  "republic.store.snapshot": async ({ respond }) => {
    try {
      await saveSnapshot(getState());
      respond(true, { ok: true }, undefined);
    } catch (err: unknown) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  // ─── Citizen Commander ──────────────────────────────────────────
  "republic.citizen.command.send": ({ params, respond }) => {
    const s = getState();
    const p = params as { citizenId?: string; instruction?: string; priority?: string } | undefined;
    if (!p?.citizenId || !p?.instruction) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and instruction required"),
      );
      return;
    }
    const priority = p.priority === "high" || p.priority === "critical" ? p.priority : "normal";
    const result = sendDirectOrder(s, p.citizenId, p.instruction, priority);
    const citizen = s.citizens.find((c) => c.id === p.citizenId);
    respond(
      true,
      {
        ok: true,
        citizenId: p.citizenId,
        citizenName: citizen?.name ?? p.citizenId,
        ...result,
      },
      undefined,
    );
  },

  "republic.citizen.command.broadcast": ({ params, respond }) => {
    const s = getState();
    const p = params as
      | { citizenIds?: string[]; instruction?: string; priority?: string }
      | undefined;
    if (!p?.citizenIds?.length || !p?.instruction) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenIds[] and instruction required"),
      );
      return;
    }
    const priority = p.priority === "high" || p.priority === "critical" ? p.priority : "normal";
    const results = broadcastOrder(s, p.citizenIds, p.instruction, priority);
    respond(
      true,
      {
        ok: true,
        results: results.map(
          (r: { citizenId: string; conversationId: string; messageId: string }) => ({
            ...r,
            citizenName: s.citizens.find((c) => c.id === r.citizenId)?.name ?? r.citizenId,
          }),
        ),
      },
      undefined,
    );
  },

  // ─── Citizen Identity ───────────────────────────────────────────
  "republic.citizen.identity.get": ({ params, respond }) => {
    const s = getState();
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const citizen = s.citizens.find((c) => c.id === p.citizenId);
    if (!citizen) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Citizen not found"));
      return;
    }
    const card = generateIdentityCard(citizen);
    respond(true, { ok: true, identity: card }, undefined);
  },

  "republic.citizen.identity.list": ({ params, respond }) => {
    const s = getState();
    const p = params as { limit?: number; offset?: number } | undefined;
    const offset = p?.offset ?? 0;
    const limit = p?.limit ?? 50;
    const slice = s.citizens.slice(offset, offset + limit);
    const identities = slice.map((c) => {
      const card = generateIdentityCard(c);
      return {
        citizenId: card.citizenId,
        citizenName: card.citizenName,
        bio: card.bio,
        appearance: card.appearance,
        voice: card.voice,
      };
    });
    respond(true, { ok: true, total: s.citizens.length, identities }, undefined);
  },

  // ─── Citizen List / History / Command (ghost-method fix) ────────
  // These three methods are whitelisted in server-methods-list.ts but had no
  // handler — causing every call to return INVALID_REQUEST at 0ms.
  "republic.citizen.list": ({ params, respond }) => {
    const s = getState();
    const p = params as { limit?: number; offset?: number; search?: string; specialization?: string } | undefined;
    const offset = p?.offset ?? 0;
    const limit = p?.limit ?? 50;
    let citizens = s.citizens ?? [];
    if (p?.search) {
      const q = p.search.toLowerCase();
      citizens = citizens.filter((c) =>
        c.name?.toLowerCase().includes(q) || c.specialization?.toLowerCase().includes(q),
      );
    }
    if (p?.specialization) {
      citizens = citizens.filter((c) => c.specialization === p.specialization);
    }
    const slice = citizens.slice(offset, offset + limit);
    respond(true, { ok: true, citizens: slice, total: citizens.length }, undefined);
  },

  "republic.citizen.history": ({ params, respond }) => {
    const s = getState();
    const p = params as { citizenId?: string; limit?: number } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const citizen = (s.citizens ?? []).find((c) => c.id === p.citizenId);
    if (!citizen) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Citizen not found"));
      return;
    }
    const limit = p?.limit ?? 50;
    const history = (citizen.recentActivityLog ?? []).slice(-limit).toReversed();
    respond(true, { ok: true, history, citizenId: p.citizenId, citizenName: citizen.name }, undefined);
  },

  // Alias for backwards-compat: older UI calls "republic.citizen.command" (no verb suffix)
  "republic.citizen.command": ({ params, respond }) => {
    const s = getState();
    const p = params as { citizenId?: string; instruction?: string; command?: string; priority?: string } | undefined;
    const instruction = p?.instruction ?? p?.command ?? "";
    if (!p?.citizenId || !instruction) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and instruction (or command) required"));
      return;
    }
    const priority = p?.priority === "high" || p?.priority === "critical" ? p.priority : "normal";
    const result = sendDirectOrder(s, p.citizenId, instruction, priority);
    const citizen = (s.citizens ?? []).find((c) => c.id === p.citizenId);
    respond(true, { ok: true, citizenId: p.citizenId, citizenName: citizen?.name ?? p.citizenId, ...result }, undefined);
  },

  // ─── Reasoning Chains ───────────────────────────────────────────
  "republic.reasoning.list": ({ respond }) => {
    const s = getState();
    const chains = s.citizens.slice(0, 20).map((c) => ({
      id: c.id,
      citizenName: c.name,
      specialization: c.specialization,
      type:
        (c.activity as string) === "Thinking" || (c.activity as string) === "Researching"
          ? "deductive"
          : c.activity === "Learning"
            ? "inductive"
            : "abductive",
      status: c.activity === "Sleeping" ? "idle" : "active",
      steps: c.intelligence ? Math.floor(c.intelligence / 10) : 3,
      confidence: c.intelligence ? c.intelligence / 100 : 0.7,
    }));
    respond(true, { chains, total: s.citizens.length }, undefined);
  },

  // ─── Technology Status ───────────────────────────────────────────
  "republic.technology.status": ({ respond }) => {
    const s = getState();
    const n = s.citizens.length || 1;

    // Build tech trees from citizen specialization distribution
    const specCounts: Record<string, number> = {};
    for (const c of s.citizens) {
      specCounts[c.specialization] = (specCounts[c.specialization] ?? 0) + 1;
    }
    const treeColors = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444"];
    const specEntries = Object.entries(specCounts).toSorted((a, b) => b[1] - a[1]);
    const trees = specEntries.slice(0, 6).map(([category, count], i) => {
      const maxLevel = 5;
      const baseLevel = Math.min(Math.ceil(count / (n / 10)), maxLevel);
      return {
        category,
        color: treeColors[i % treeColors.length]!,
        breakthroughs: Math.floor(count / 3),
        items: [
          { name: `${category} Fundamentals`, level: Math.min(baseLevel + 1, maxLevel), maxLevel, unlocked: true },
          { name: `${category} Applied Research`, level: baseLevel, maxLevel, unlocked: true },
          { name: `${category} Innovation`, level: Math.max(baseLevel - 1, 0), maxLevel, unlocked: baseLevel > 1 },
          { name: `${category} Mastery`, level: Math.max(baseLevel - 2, 0), maxLevel, unlocked: baseLevel > 2 },
        ],
      };
    });

    // Build labs from top specializations
    const labs = specEntries.slice(0, 4).map(([name, count], i) => ({
      name: `${name} Lab`,
      status: count > 2 ? "Active" : "Planning",
      progress: Math.min(count / (n * 0.2), 1),
      researchers: count,
      eta: count > 2 ? `${Math.max(10 - i * 2, 2)}d` : "TBD",
    }));

    const totalBreakthroughs = trees.reduce((sum, t) => sum + t.breakthroughs, 0);
    const activeLabs = labs.filter((l) => l.status === "Active").length;
    const totalResearchers = labs.reduce((sum, l) => sum + l.researchers, 0);
    const maxLevel = 5;

    respond(
      true,
      {
        ok: true,
        trees,
        labs,
        totalBreakthroughs,
        activeLabs,
        totalResearchers,
        maxLevel,
        // Legacy fields
        atlantis: buildAtlantisStatus(s),
        ml: buildMLStatus(s),
        quantum: buildQuantumStatus(s),
        totalCitizens: n,
        avgIntelligence:
          n > 0
            ? Math.round(
                s.citizens.reduce((sum, c) => sum + (c.intelligence ?? 50), 0) / n,
              )
            : 50,
      },
      undefined,
    );
  },

  // ─── Skills List ─────────────────────────────────────────────────
  "republic.skills.list": ({ respond }) => {
    const s = getState();
    const skillCounts: Record<string, number> = {};
    for (const c of s.citizens) {
      skillCounts[c.specialization] = (skillCounts[c.specialization] ?? 0) + 1;
    }
    const skills = Object.entries(skillCounts).map(([name, count]) => ({
      id: name.toLowerCase().replace(/\s+/g, "-"),
      name,
      category: "specialization",
      practitioners: count,
      avgLevel: 50 + Math.floor(count * 2),
      unlocked: true,
    }));
    respond(true, { skills, total: skills.length }, undefined);
  },
};
