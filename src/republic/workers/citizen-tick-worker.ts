/**
 * Republic Platform — Citizen Tick Worker (Node.js Worker Thread)
 *
 * This file is loaded as a Worker Thread entrypoint by ParallelTickPool.
 * It receives a batch of serialized citizens, runs their tick logic in a
 * CPU-isolated thread, and posts results back to the main thread.
 *
 * Message protocol (main → worker):
 *   { type: "tick", batch: SerializedCitizen[], tick: number, config: TickWorkerConfig }
 *   { type: "shutdown" }
 *
 * Message protocol (worker → main):
 *   { type: "result", results: CitizenTickResult[], workerMs: number }
 *   { type: "error",  error: string, batch: string[] }
 *   { type: "ready" }
 *
 * Each worker thread is stateless — state is serialized in/out each tick.
 * This prevents cross-thread memory corruption and enables safe hot-restart.
 *
 * Cognitive pipeline per citizen (configurable subset):
 *   evaluate fitness → elect action → apply trait mutations → record outcome
 */

import { parentPort, workerData } from "node:worker_threads";

// ─── Types ──────────────────────────────────────────────────────

export interface TickWorkerConfig {
  enableMutation: boolean;
  enableCognition: boolean;
  mutationRate: number; // 0–1
  maxActionsPerCitizen: number;
  budgetMsPerCitizen: number; // hard timeout per citizen (ms)
}

export interface SerializedCitizen {
  id: string;
  name: string;
  tier: "elite" | "active" | "dormant";
  fitness: number;
  energy: number;
  credits: number;
  skills: Record<string, number>;
  traits: Record<string, number>;
  memory: Record<string, unknown>;
  lastTick: number;
  tick: number;
}

export interface CitizenTickResult {
  id: string;
  fitness: number;
  energy: number;
  credits: number;
  traits: Record<string, number>;
  memory: Record<string, unknown>;
  actionsPerformed: string[];
  fitnessChange: number;
  errorOccurred: boolean;
  processingMs: number;
}

// ─── Citizen Tick Logic ──────────────────────────────────────────

/**
 * Run a single citizen's tick entirely within the worker thread.
 * Returns a delta/result — no external I/O, no shared state.
 */
function processCitizen(
  citizen: SerializedCitizen,
  tick: number,
  config: TickWorkerConfig,
): CitizenTickResult {
  const start = performance.now();
  const actionsPerformed: string[] = [];
  let fitnessChange = 0;

  try {
    // ── Energy decay (0–100 scale, matching main state)
    const energyDecay =
      citizen.tier === "dormant" ? 0.5 : citizen.tier === "active" ? 2 : 4;
    let energy = citizen.energy - energyDecay;
    energy = Math.max(20, Math.min(100, energy));

    // ── Fitness evaluation (weighted sum of skills + trait modifiers)
    const skillSum = Object.values(citizen.skills).reduce((a, v) => a + v, 0);
    const traitModifier =
      (citizen.traits.creativity ?? 0.5) * 0.3 + (citizen.traits.diligence ?? 0.5) * 0.4;
    const newFitness = Math.min(
      1,
      (skillSum / Math.max(1, Object.keys(citizen.skills).length)) * 0.5 + traitModifier * 0.5,
    );
    fitnessChange = newFitness - citizen.fitness;

    // ── Action election (deterministic from tick seed for reproducibility)
    const seed = (tick * 2654435761 + parseInt(citizen.id.slice(-4), 16)) >>> 0;
    const rng = () => ((seed ^ (seed << 13)) >>> 0) / 0xffffffff;

    const traits = citizen.traits;
    const actions: string[] = [];

    if (energy > 30 && rng() < (traits.diligence ?? 0.5)) {
      actions.push("work");
    }
    if (energy > 50 && rng() < (traits.creativity ?? 0.5) * 0.8) {
      actions.push("create");
    }
    if (energy > 25 && rng() < (traits.sociability ?? 0.5) * 0.6) {
      actions.push("socialize");
    }
    if (energy > 60 && rng() < (traits.ambition ?? 0.5)) {
      actions.push("upskill");
    }
    if (energy < 25) {
      actions.push("rest");
    }

    actionsPerformed.push(...actions.slice(0, config.maxActionsPerCitizen));

    // ── Credit economy
    let credits = citizen.credits;
    if (actionsPerformed.includes("work")) {
      credits += (citizen.fitness * 2 + 0.5) * (energy > 0.5 ? 1.2 : 0.8);
    }
    if (actionsPerformed.includes("create")) {
      credits += citizen.fitness * 1.5 * (traits.creativity ?? 0.5);
    }
    credits = Math.max(0, credits);

    // ── Trait mutations (very slow drift, ~0.001 per tick)
    const newTraits = { ...citizen.traits };
    if (config.enableMutation) {
      for (const traitKey of Object.keys(newTraits)) {
        const base = config.mutationRate * 0.1;
        const drift = (Math.random() - 0.5) * base;
        newTraits[traitKey] = Math.min(1, Math.max(0, (newTraits[traitKey] ?? 0.5) + drift));
      }
    }

    // ── Memory update
    const memory = {
      ...citizen.memory,
      lastActions: actionsPerformed,
      lastFitness: newFitness,
      lastTick: tick,
    };

    return {
      id: citizen.id,
      fitness: parseFloat(newFitness.toFixed(4)),
      energy: parseFloat(energy.toFixed(4)),
      credits: parseFloat(credits.toFixed(2)),
      traits: newTraits,
      memory,
      actionsPerformed,
      fitnessChange: parseFloat(fitnessChange.toFixed(4)),
      errorOccurred: false,
      processingMs: parseFloat((performance.now() - start).toFixed(2)),
    };
  } catch {
    return {
      id: citizen.id,
      fitness: citizen.fitness,
      energy: citizen.energy,
      credits: citizen.credits,
      traits: citizen.traits,
      memory: citizen.memory,
      actionsPerformed,
      fitnessChange: 0,
      errorOccurred: true,
      processingMs: parseFloat((performance.now() - start).toFixed(2)),
    };
  }
}

// ─── Worker Thread Message Loop ──────────────────────────────────

if (parentPort) {
  // Signal ready
  parentPort.postMessage({ type: "ready", workerId: workerData?.workerId });

  parentPort.on(
    "message",
    (msg: {
      type: string;
      batch?: SerializedCitizen[];
      tick?: number;
      config?: TickWorkerConfig;
    }) => {
      if (msg.type === "shutdown") {
        process.exit(0);
      }

      if (msg.type === "tick" && msg.batch && msg.tick !== undefined && msg.config) {
        const workerStart = performance.now();
        const results: CitizenTickResult[] = [];

        for (const citizen of msg.batch) {
          const result = processCitizen(citizen, msg.tick, msg.config);
          results.push(result);
        }

        parentPort!.postMessage({
          type: "result",
          results,
          workerMs: parseFloat((performance.now() - workerStart).toFixed(2)),
        });
      }
    },
  );
}
