/**
 * Republic Platform — State Manager
 *
 * Manages the simulation state singleton with crash-safe persistence.
 * State is saved to disk as atomic JSON snapshots + a write-ahead journal.
 * On restart, state is restored from the last snapshot + journal replay.
 *
 * Also contains the simulation tick loop which orchestrates all
 * domain modules.
 */

import type { RepublicState } from "./types.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { agentTick } from "./agent-runtime.js";
// Phase 6: Citizen Agent async cognitive loops
import { startCitizenLoops, stopAllCitizenLoops } from "./agents/citizen-agent-loop.js";
// ─── Self-Evolving Citizen Architecture ─────────────────────────
import { restoreAnchoredMemoryState, serializeAnchoredMemoryState } from "./anchored-memory.js";
// Phase 33-37: Infrastructure modules
import { shutdownRateLimiter } from "./api-rate-limiter.js";
import { getCitizenPager } from "./citizen-pager.js";
import { restoreCognitiveState, serializeCognitiveState } from "./cognitive-core.js";
// ─── ACE: Autonomous Cognition Engine ───────────────────────────
import { initCuriosityFromState, syncCuriosityToState } from "./curiosity-engine.js";
// emergence-detector, infra-control-plane, republic-federation,
// resilience, memory-pressure → dynamically imported in deferred boot block + shutdown
import { recordAction } from "./evolution.js";
import { intelligenceBus } from "./intelligence-bus.js";
// memory-pressure → dynamically imported in deferred boot block + shutdown
import { exportMemoryState, importMemoryState } from "./memory.js";
import { AdaptiveTickController, createEventLoopMonitor } from "./perf-utils.js";
import { flushAllStores } from "./persistence-layer.js";
// federation → dynamically imported in deferred boot block + shutdown
import {
  loadSnapshot,
  onTick as persistTick,
  safeStringify,
  saveSnapshot,
} from "./republic-store.js";
import { initResearchFromState, syncResearchToState } from "./research-engine.js";
// resilience → dynamically imported in deferred boot block + shutdown
import { createSeedState } from "./seed-state.js";
import { restoreEvolutionState, serializeEvolutionState } from "./self-evolution.js";
// ─── Phase 7: Meta-Cognition Modules ────────────────────────────
import {
  getDiagnostics,
  recordAgentTickCompleted,
  recordAgentTickSkipped,
  recordAgentTickStall,
  recordTickStart,
  trackError,
} from "./sim-diagnostics.js";
import { simulationBus } from "./simulation-event-bus.js";
import { restoreSkillLibraryState, serializeSkillLibraryState } from "./skill-library.js";
import { startSpecialistCitizenLoops, stopSpecialistCitizenLoops } from "./specialist-citizens.js";
import {
  getOrchestrator,
  shutdownOrchestrator,
  type OrchestratorStats,
  type TickReport,
} from "./tick-orchestrator.js";
import { initForgeFromState, syncForgeToState } from "./tool-forge.js";
import { rand } from "./utils.js";
import { shutdownWorkerPool } from "./worker-pool.js";
import { stopWorldIntelligence } from "./world-intelligence.js";
// ─── AGI Engines (Phase AGI-1..13) ──────────────────────────────
// ─── Innovation Roadmap: Civilizational Engines ─────────────────

const logger = createSubsystemLogger("republic:state");

// ─── Event Loop Monitor ─────────────────────────────────────────
let eventLoopMonitor: { getLag: () => number; stop: () => void } | null = null;
// ─── Memory Pressure Manager reference from deferred boot ───────
// Stored here so the tick function can feed event loop lag without
// a dynamic import() on every tick. Set during deferred init.
let _memoryPressureRef: { setEventLoopLag: (ms: number) => void } | null = null;

// ─── Deferred Boot Tracking ─────────────────────────────────────
// Resolved once all deferred subsystems from initState() have completed
// their initialization. gracefulShutdown() awaits this before calling
// stop functions to prevent the init-vs-shutdown race.
let _deferredBootDone: Promise<void> = Promise.resolve();

// ─── Singleton State ────────────────────────────────────────────

let state: RepublicState | null = null;
let tickTimer: ReturnType<typeof setTimeout> | null = null;
let stateInitialized = false;
const tickController = new AdaptiveTickController();
let agentTickRunning = false;
let agentTickStartedAt = 0;
const AGENT_TICK_TIMEOUT_MS = 300_000; // 5 min: local model cold-loads can take 2-3 min
/** Dirty-tracking: fingerprints of persist keys to detect changes */
const prevKeyFingerprints = new Map<string, number>();

/** Tick watchdog timeout — if executeTick hangs longer than this, force-continue */
const TICK_WATCHDOG_MS = 30_000;
/** Consecutive watchdog triggers before emergency circuit reset */
let consecutiveWatchdogTriggers = 0;
const WATCHDOG_CIRCUIT_RESET_THRESHOLD = 3;

/** Get the current state, creating seed state if needed. */
export function getState(): RepublicState {
  if (!state) {
    state = createSeedState();
  }
  return state;
}

// Expose to config loader synchronously to avoid circular ESM dependencies
(globalThis as Record<string, unknown>).__republic_getState = getState;

/**
 * Initialize state from persisted storage.
 * Must be called once at startup before any state access.
 * If persisted state exists, it is loaded; otherwise seed state is created.
 */
export async function initState(): Promise<void> {
  if (stateInitialized) {
    return;
  }
  stateInitialized = true;

  const restored = await loadSnapshot();
  if (restored) {
    state = restored.state;
    // Polyfill missing collections from older snapshots
    state.devProjects ??= [];
    state.genomePool ??= [];
    state.citizens ??= [];
    state.events ??= [];
    state.bills ??= [];
    state.cases ??= [];
    state.departments ??= [];
    state.electionHistory ??= [];
    state.laws ??= [];
    state.transactions ??= [];
    state.harvesters ??= [];
    state.resources ??= [];
    state.crystals ??= [];
    state.scrolls ??= [];
    state.mlModels ??= [];
    state.universes ??= [];
    state.entanglements ??= [];
    state.timelines ??= [];
    state.peers ??= [];
    state.objectives ??= [];
    state.gossipLog ??= [];
    state.actionLog ??= [];
    state.citizenAssignments ??= [];
    state.swarmTasks ??= [];
    state.constitutionArticles ??= [];
    // Innovation Roadmap: Civilizational engine collections
    state.dialecticProposals ??= [];
    state.prophecies ??= [];
    state.guilds ??= [];
    state.tribes ??= [];
    state.festivals ??= [];
    state.ritesLog ??= [];
    state.oralTraditions ??= [];
    state.memes ??= [];
    state.mythology ??= [];
    state.restorativeCases ??= [];
    state.socialContracts ??= [];
    state.digitalEcology ??= [];
    state.scarcityEvents ??= [];
    state.disasterLog ??= [];
    state.commonsResources ??= [];
    state.museumExhibits ??= [];
    state.propagandaCampaigns ??= [];
    state.pressArticles ??= [];
    state.diplomaticProtocols ??= [];
    state.mutualAidSocieties ??= [];

    // Restore memory state if persisted
    if (state.memoryState) {
      importMemoryState(state.memoryState);
    }
    // Restore self-evolving citizen architecture state
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    if ((state as any).cognitiveState) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      restoreCognitiveState((state as any).cognitiveState);
    }
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    if ((state as any).skillLibraryState) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      restoreSkillLibraryState((state as any).skillLibraryState);
    }
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    if ((state as any).evolutionState) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      restoreEvolutionState((state as any).evolutionState);
    }
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    if ((state as any).anchoredMemoryState) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      restoreAnchoredMemoryState((state as any).anchoredMemoryState);
    }
    logger.info("State restored from disk", {
      tick: state.currentTick,
      citizens: state.citizens.length,
      wasRunning: restored.meta.wasRunning,
    });
  } else {
    // JSON snapshot not found — try SQLite fallback
    let restoredFromSqlite = false;
    try {
      const { loadLatestSnapshot } = await import("./republic-sqlite.js");
      const snap = await loadLatestSnapshot();
      if (snap) {
        state = JSON.parse(snap.stateJson) as RepublicState;
        restoredFromSqlite = true;
        logger.info("State restored from SQLite snapshot", {
          tick: snap.tick,
          citizens: snap.citizenCount,
        });
      }
    } catch (sqliteErr) {
      logger.warn("SQLite snapshot restore failed", {
        error: sqliteErr instanceof Error ? sqliteErr.message : String(sqliteErr),
      });
    }
    if (!restoredFromSqlite) {
      state = createSeedState();
      logger.info("Fresh seed state created", { citizens: state.citizens.length });
    }
  }

  // State is guaranteed to be set by one of the three paths above
  // (JSON restore, SQLite fallback, or fresh seed state)
  const s = state!;

  // C1: Initialize ACE module arrays from persisted state
  initCuriosityFromState(s);
  initResearchFromState(s);
  initForgeFromState(s);

  // ── Dynamic Registry: Seed from static data ─────────────────────
  // Populate the SQLite-backed registry with data from sandbox-tool-defs.ts,
  // seed-knowledge.ts, and prompt templates so the RegistryExplorer UI has
  // content and agents can load definitions dynamically.
  try {
    const { seedAllRegistries } = await import("./registries/registry-seeder.js");
    await seedAllRegistries(s);
    logger.info("Dynamic registries seeded");
  } catch (err) {
    logger.warn("Dynamic registry seeding failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Phase 4: Warm CitizenLRUPager hot cache ────────────────────
  // Initialise the Tier-0 LRU pager so all subsequent citizen look-ups
  // hit the in-process hot cache rather than scanning the full array.
  try {
    const pager = getCitizenPager(() => s.citizens);
    void pager.warm(s.citizens);
    logger.info("CitizenLRUPager warmed", { hotCacheSize: Math.min(s.citizens.length, 200) });
  } catch (err) {
    logger.warn("CitizenLRUPager warm-up failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Deferred Boot: Non-Critical Subsystems ─────────────────────
  // These subsystems are important but don't need to block initState().
  // They run on the next event loop tick, freeing the boot critical path.
  //
  // The completion promise is tracked so gracefulShutdown() can await it
  // before calling stop functions — this eliminates the race where
  // shutdown fires before init finishes.
  _deferredBootDone = new Promise<void>((resolve) => {
    setImmediate(async () => {
      try {
        // Phase 38: Bootstrap infrastructure
        const { probeSystemResources, discoverRuntimes, startInfraMonitor } =
          await import("./infra-control-plane.js");
        await Promise.allSettled([
          probeSystemResources().then(
            (resources: { cpuModel: string; ramTotalGB: number; gpuComputeAvailable: boolean }) => {
              logger.info("System resources probed at startup", {
                cpu: resources.cpuModel,
                ramGB: resources.ramTotalGB,
                gpuAvailable: resources.gpuComputeAvailable,
              });
            },
          ),
          discoverRuntimes().then((runtimes: Record<string, { running: boolean }>) => {
            const entries = Object.entries(runtimes);
            const available = entries.filter(([, s]) => s.running);
            logger.info("Runtimes discovered at startup", {
              total: entries.length,
              available: available.length,
              names: available.map(([name]) => name).join(", "),
            });
          }),
        ]);

        startInfraMonitor();
        logger.info("Infrastructure monitor started");

        // Intelligence subsystems — only needed in real execution mode.
        // Reflex/dev boots skip these, saving ~300ms + background polling.
        const isRealMode = getState().mode === "real";

        if (isRealMode) {
          // Hardware Resource Manager — boot survey + built-in feature profiles
          try {
            const { registerBuiltinFeatures, startHardwareMonitor, onHardwareEvent } =
              await import("./hardware-manager.js");
            registerBuiltinFeatures();
            startHardwareMonitor();
            logger.info("Hardware resource manager started");

            // Bridge hardware RAM alerts → intelligence-bus
            onHardwareEvent("ram-critical", (payload) => {
              intelligenceBus.publish("hardware.alert", {
                metric: "ram",
                value: typeof payload.freeRamGB === "number" ? payload.freeRamGB : 0,
                threshold: 8,
                severity: "critical",
                hostname: typeof payload.hostname === "string" ? payload.hostname : "republic",
                timestamp: Date.now(),
              });
            });
            onHardwareEvent("ram-warn", (payload) => {
              intelligenceBus.publish("hardware.alert", {
                metric: "ram",
                value: typeof payload.freeRamGB === "number" ? payload.freeRamGB : 0,
                threshold: 20,
                severity: "warn",
                hostname: typeof payload.hostname === "string" ? payload.hostname : "republic",
                timestamp: Date.now(),
              });
            });
          } catch (err) {
            logger.warn("Failed to start hardware resource manager", {
              error: err instanceof Error ? err.message : String(err),
            });
          }

          // Wire event bus → emergence detector subscriptions
          try {
            const { initEmergenceSubscriptions } = await import("./emergence-detector.js");
            initEmergenceSubscriptions();
            logger.info("Emergence event subscriptions initialized");
          } catch (err) {
            logger.warn("Failed to initialize emergence subscriptions", {
              error: err instanceof Error ? err.message : String(err),
            });
          }

          // Start self-healing loop — monitors circuit breakers and auto-recovers
          try {
            const { startSelfHealingLoop } = await import("./resilience.js");
            startSelfHealingLoop();
            logger.info("Self-healing loop started");
          } catch (err) {
            logger.warn("Failed to start self-healing loop", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else {
          logger.info("Intelligence subsystems skipped (mode !== 'real')");
        }

        // ── Memory Pressure Manager ──
        try {
          const { getMemoryPressureManager } = await import("./memory-pressure.js");
          const mpm = getMemoryPressureManager();
          _memoryPressureRef = mpm;
          const orc = getOrchestrator();
          mpm.start({
            orchestratorShed: (groups: string[], enable: boolean) => {
              for (const name of orc.getHandlerNames()) {
                // Match handlers by group name prefix
                const profile = orc.getHandlerProfile(name);
                if (profile && groups.includes(profile.group)) {
                  orc.setEnabled(name, enable);
                }
              }
            },
            stateTrimmer: () => {
              // Aggressive trimming of state arrays under memory pressure
              const s = getState();
              const stateAny = s as unknown as Record<string, unknown>;
              const trimTargets: [string, number][] = [
                ["events", 1000],
                ["gossipLog", 200],
                ["actionLog", 400],
                ["transactions", 1000],
                ["swarmTasks", 500],
                ["dialecticProposals", 250],
                ["prophecies", 250],
                ["disasterLog", 250],
                ["pressArticles", 250],
                ["propagandaCampaigns", 250],
              ];
              for (const [key, cap] of trimTargets) {
                const arr = stateAny[key] as unknown[] | undefined;
                if (arr && arr.length > cap) {
                  arr.splice(0, arr.length - cap);
                }
              }
            },
          });
          logger.info("Memory pressure manager started");
        } catch (err) {
          logger.warn("Failed to start memory pressure manager", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // ── Event Loop Lag Monitor ──
        try {
          eventLoopMonitor = createEventLoopMonitor(2000);
          logger.info("Event loop lag monitor started");
        } catch (err) {
          logger.warn("Failed to start event loop monitor", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // ── Federation: initialize cross-gateway peer sync ──
        try {
          const tailscalePeers = (process.env.OPENCLAW_TAILSCALE_PEERS ?? "")
            .split(",")
            .map((ip) => ip.trim())
            .filter(Boolean);
          if (tailscalePeers.length > 0) {
            const nodeId =
              process.env.OPENCLAW_CLUSTER_NODE_ID ??
              `${process.platform}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            const { initFederation, startFederationSync } =
              await import("./republic-federation.js");
            initFederation({
              gatewayId: nodeId,
              host: process.env.OPENCLAW_HOST ?? "0.0.0.0",
              port: parseInt(process.env.OPENCLAW_PORT ?? "18789", 10),
              peers: tailscalePeers,
            });
            startFederationSync();
            logger.info("Federation layer started", { peers: tailscalePeers });
          }
        } catch (err) {
          logger.warn("Failed to start federation", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        resolve();
      }
    }); // end setImmediate
  });
}

/** Reset state (for testing). */
export function resetState(): void {
  state = null;
  stateInitialized = false;
  stopSimLoop();
}

// ─── Simulation Loop ────────────────────────────────────────────

/** The main simulation tick — orchestrates all domain modules via the tick orchestrator. */
async function tick(): Promise<void> {
  const s = getState();
  if (!s.isRunning || s.isPaused) {
    return;
  }

  s.currentTick++;
  s.totalEventsProcessed += rand(1, 5);

  // NOTE: Event/log trimming is consolidated in the TickOrchestrator settling
  // phase (tick-orchestrator.ts executeTick → SETTLING). Do NOT trim here to
  // avoid double-work and premature event loss before late-phase handlers add theirs.

  const endTickRecording = recordTickStart(s.currentTick);

  // ── Pre-tick phase (still via event bus — lightweight pre-hooks) ──
  simulationBus.dispatch("tick:pre", s, { tick: s.currentTick });

  // ── Main domain tick dispatch via Advanced Tick Orchestrator ──
  // The orchestrator manages: DAG ordering, circuit breakers, adaptive
  // cadence, deadline budgets, and per-handler profiling.
  // Now fully async — concurrent tiers execute in parallel.
  // Protected by a 30s watchdog to prevent infinite hangs.
  const orchestrator = getOrchestrator();
  try {
    lastTickReport = await Promise.race([
      orchestrator.executeTick(s, s.currentTick),
      new Promise<never>((_, reject) => {
        const t = setTimeout(
          () => reject(new Error(`Tick watchdog: executeTick hung for >${TICK_WATCHDOG_MS}ms`)),
          TICK_WATCHDOG_MS,
        );
        if (typeof t === "object" && "unref" in t) {
          t.unref();
        }
      }),
    ]);
    consecutiveWatchdogTriggers = 0; // Reset on success
  } catch (watchdogErr) {
    consecutiveWatchdogTriggers++;
    logger.error(
      `🚨 Tick watchdog triggered at tick ${s.currentTick} (${consecutiveWatchdogTriggers} consecutive)`,
      {
        error: watchdogErr instanceof Error ? watchdogErr.message : String(watchdogErr),
      },
    );
    // After N consecutive watchdog triggers, force-reset all circuit breakers
    if (consecutiveWatchdogTriggers >= WATCHDOG_CIRCUIT_RESET_THRESHOLD) {
      logger.error(
        `Emergency circuit reset: ${consecutiveWatchdogTriggers} consecutive watchdog triggers`,
      );
      for (const name of orchestrator.getHandlerNames()) {
        orchestrator.resetCircuit(name);
      }
      consecutiveWatchdogTriggers = 0;
    }
  }

  // ── Parallel Citizen Tick (Worker Threads) ──
  // NOTE: Handled by the "parallel-citizen-tick" orchestrator handler in
  // tick-handler-registry.ts (with circuit breaker + adaptive cadence).
  // Previously also ran here, causing **double serialization** of all
  // citizens each tick — contributing to the V8 structured-clone stack
  // overflow crash (0xC0000409). Removed to single-path execution.

  // ── Feed event loop lag into memory pressure manager ──
  if (eventLoopMonitor && _memoryPressureRef) {
    _memoryPressureRef.setEventLoopLag(eventLoopMonitor.getLag());
  }

  // Agent runtime tick (async — guarded against overlapping execution)
  // Actions feed back into evolution fitness via recordAction
  // Safety: force-reset the flag if it's been stuck for > 30 seconds
  if (agentTickRunning && agentTickStartedAt > 0) {
    const stuckMs = Date.now() - agentTickStartedAt;
    if (stuckMs > AGENT_TICK_TIMEOUT_MS) {
      logger.warn(
        `agentTick stuck for ${Math.round(stuckMs / 1000)}s — force-resetting at tick ${s.currentTick}`,
      );
      agentTickRunning = false;
      recordAgentTickStall();
    }
  }

  if (!agentTickRunning) {
    agentTickRunning = true;
    agentTickStartedAt = Date.now();

    agentTick(s)
      .then((actions) => {
        recordAgentTickCompleted();
        for (const action of actions) {
          const citizen = s.citizens.find((c) => c.id === action.citizenId);
          if (citizen) {
            const discoveryMade =
              action.description.includes("scroll") || action.description.includes("discover");
            recordAction(
              s,
              citizen,
              action,
              citizen.credits,
              citizen.energy,
              citizen.happiness,
              discoveryMade,
            );
          }
        }
      })
      .catch((err) => {
        logger.warn(`agentTick failed at tick ${s.currentTick}`, {
          error: err instanceof Error ? err.message : String(err),
        });
        trackError("agentTick", err, s.currentTick);
      })
      .finally(() => {
        agentTickRunning = false;
        agentTickStartedAt = 0;
      });
  } else {
    recordAgentTickSkipped();
  }

  // ── Post-tick phase (persistence, compute queue, infra) ──
  simulationBus.dispatch("tick:post", s, { tick: s.currentTick });

  // Persist state after each tick (journal or snapshot)
  // Dirty-track: only persist keys that actually changed
  const PERSIST_KEYS = [
    "citizens",
    "events",
    "currentTick",
    "totalEventsProcessed",
    "bills",
    "cases",
    "departments",
    "balances",
    "transactions",
    "harvesters",
    "resources",
    "crystals",
    "scrolls",
    "akashicRecords",
    "mlModels",
    "totalPredictions",
    "universes",
    "entanglements",
    "timelines",
    "peers",
    "objectives",
    "gossipLog",
    "genomePool",
    "actionLog",
    "citizenAssignments",
    "swarmTasks",
    "laws",
    "constitutionAmendments",
    "constitutionArticles",
    "priceIndex",
    "devProjects",
    "innovations",
    "scheduledEvents",
    "memoryState",
    "domainRegistry",
    "activeCases",
    "managedProcesses",
    // Phase 25: Previously missing persistence keys
    "electionHistory",
    "energyNodes",
    "mode",
    "messages",
    "republicConfig",
    "auditTrail",
    "serviceListings",
    "marketOrders",
    "citizenGoals",
    "emailLog",
    "webhooks",
    "notifications",
    "deliveryQueue",
    "iotDevices",
    "sensorReadings",
    "automationRules",
    "processes",
    "citizenConversations",
    "workflows",
    // Phase ACE: Autonomous Cognition Engine state
    "knowledgeBase",
    "toolLibrary",
    "researchJournal",
    "curriculumFrontier",
  ] as const;

  // Dirty tracking — only send truly changed keys to the WAL
  const dirtyKeys: string[] = [];
  const stateRec = s as unknown as Record<string, unknown>;
  for (const key of PERSIST_KEYS) {
    const val = stateRec[key];
    // Fingerprint: for arrays use length, for objects use key count, else stringify length
    let fp: number;
    if (Array.isArray(val)) {
      fp = val.length;
    } else if (val && typeof val === "object") {
      fp = Object.keys(val).length;
    } else {
      fp = typeof val === "number" ? val : 0;
    }
    const prev = prevKeyFingerprints.get(key);
    if (prev !== fp) {
      dirtyKeys.push(key);
      prevKeyFingerprints.set(key, fp);
    }
  }
  // currentTick always changes
  if (!dirtyKeys.includes("currentTick")) {
    dirtyKeys.push("currentTick");
  }

  persistTick(s, dirtyKeys).catch((err) => {
    logger.warn(`Persistence failed at tick ${s.currentTick}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    trackError("persistence", err, s.currentTick);
  });

  // ── SQLite snapshot persistence (secondary, every 100 ticks) ──
  // SAFETY: We serialize a slimmed state that excludes `memoryState` (83+ MB)
  // to avoid blowing V8's native stack limit during JSON.stringify.
  // The memory system persists separately via the main snapshot file.
  if (s.currentTick % 100 === 50) {
    // Staggered: JSON snapshot fires at %100===0, SQLite at %100===50
    import("./republic-sqlite.js")
      .then(({ saveStateSnapshot }) => {
        // Exclude memoryState and cognitiveState to keep serialization safe
        const { memoryState: _m, ...slimState } = s as unknown as Record<string, unknown>;
        const stateJson = safeStringify(slimState);
        return saveStateSnapshot(
          s.currentTick,
          s.citizens.length,
          s.genomePool?.length ?? 0,
          stateJson,
        );
      })
      .catch((err) => {
        logger.warn(`SQLite snapshot failed at tick ${s.currentTick}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }

  // ── Diagnostics: record tick end ──
  endTickRecording();

  // ── Milestone logging every 100 ticks ──
  if (s.currentTick % 100 === 0) {
    const diag = getDiagnostics(s);
    logger.info(
      `[Tick ${s.currentTick}] citizens=${diag.population.currentCount} births=${diag.population.births} avgEnergy=${diag.population.avgEnergy} avgHappiness=${diag.population.avgHappiness} agentActions=${diag.agent.totalActionsSucceeded}/${diag.agent.totalActionsAttempted} reflexFallbacks=${diag.agent.reflexFallbacks} stalls=${diag.agent.agentTickStalls} errors=${diag.recentErrors.length} providers=${JSON.stringify(Object.keys(diag.providers))} ticks/min=${diag.tick.ticksPerMinute}`,
    );
  }
}

// ── Handler Registration ────────────────────────────────────────
// All 70+ domain tick handlers are registered in tick-handler-registry.ts
// which was extracted from this file to reduce coupling.
import { registerOrchestratorHandlers } from "./tick-handler-registry.js";
export { registerOrchestratorHandlers };
let lastTickReport: TickReport | null = null;
export function startSimLoop(): void {
  if (tickTimer) {
    return;
  }

  /** Drift-free scheduling: track expected next tick time to self-correct */
  let expectedNextTickAt = performance.now();
  /** Consecutive tick backlog counter for alerting */
  let tickBacklogCount = 0;
  const BACKLOG_WARN_THRESHOLD = 5;
  const BACKLOG_CRITICAL_THRESHOLD = 15;

  async function scheduleNext(): Promise<void> {
    const s = getState();
    if (!s.isRunning) {
      tickTimer = null;
      return;
    }

    const start = performance.now();
    try {
      await tick();
    } catch (err) {
      // Never crash the sim loop
      console.error("[SimLoop] Tick error:", err instanceof Error ? err.message : String(err));
    }
    const duration = performance.now() - start;
    const interval = tickController.recordTick(s.currentTick, duration);

    // ── Drift-free scheduling ──
    // Instead of naive setTimeout(interval), compute how much drift
    // has accumulated and self-correct the next scheduled time.
    expectedNextTickAt += interval;
    const now = performance.now();
    const drift = now - expectedNextTickAt;
    const correctedInterval = Math.max(0, interval - drift);

    // ── Tick backlog detection ──
    if (drift > interval) {
      tickBacklogCount++;
      if (tickBacklogCount === BACKLOG_WARN_THRESHOLD) {
        logger.warn(
          `⚠️ Tick backlog detected: ${tickBacklogCount} consecutive ticks behind schedule (drift: ${drift.toFixed(1)}ms)`,
        );
      } else if (tickBacklogCount === BACKLOG_CRITICAL_THRESHOLD) {
        logger.error(
          `🚨 Critical tick backlog: ${tickBacklogCount} ticks behind, auto-shedding low-priority handlers`,
        );
        // Auto-shed: temporarily increase cadence of agi/self-evolving groups
        const orc = getOrchestrator();
        orc.setTickBudget(Math.max(100, orc.getStats().avgTickDurationMs * 0.8));
      }
    } else {
      if (tickBacklogCount >= BACKLOG_WARN_THRESHOLD) {
        logger.info(`✅ Tick backlog cleared after ${tickBacklogCount} ticks`);
      }
      tickBacklogCount = 0;
    }

    tickTimer = setTimeout(() => {
      scheduleNext().catch(() => {});
    }, correctedInterval);
    // NOTE: do NOT call tickTimer.unref() here — the sim loop must keep
    // the process alive as a safety net alongside the HTTP server.
  }

  scheduleNext().catch(() => {});
}

/** Stop the simulation loop and save a final snapshot. */
export function stopSimLoop(): void {
  if (tickTimer) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
}

/** Get adaptive tick controller stats. */
export function getTickControllerStats() {
  return tickController.stats;
}

/** Get the advanced tick orchestrator stats (DAG, circuit breakers, profiler). */
export function getOrchestratorStats(): OrchestratorStats {
  return getOrchestrator().getStats();
}

/** Get the last tick report from the orchestrator. */
export function getLastTickReport(): TickReport | null {
  return lastTickReport;
}

// Guard: track whether the handlers have been registered already
let _simAutoStarted = false;

/**
 * Auto-start simulation on gateway boot.
 * Always starts the simulation loop so Republic pages have live data.
 * If persisted state exists and was running, resumes from that tick.
 *
 * Idempotent — safe to call multiple times; subsequent calls are no-ops.
 */
export async function autoStartSimulation(): Promise<void> {
  if (_simAutoStarted) {
    // Already started — startSimLoop() has its own guard too, but
    // registerOrchestratorHandlers() does NOT, so we must gate here.
    return;
  }
  _simAutoStarted = true;

  await initState();
  const s = getState();

  // Auto-detect LLM API keys and switch to real execution mode
  const hasLlmKeys = !!(
    process.env.GEMINI_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY
  );
  if (hasLlmKeys && s.mode !== "real") {
    s.mode = "real";
    logger.info("Auto-switched to real execution mode (LLM API keys detected)");
  }

  // Always start the simulation on gateway boot
  s.isRunning = true;
  s.isPaused = false;
  s.startedAt = Date.now();
  registerOrchestratorHandlers();
  startSimLoop();

  // NOTE: Citizen cognitive loops are NOT started here. They require the
  // inference gateway to be ready first, which initializes AFTER sidecars.
  // Call `startCitizenCognitiveLoops()` from server.impl.ts after
  // `initInferenceGateway()` completes.

  logger.info("Simulation auto-started", { tick: s.currentTick, wasRunning: !!state });
}

/**
 * Start citizen cognitive loops and specialist autonomous loops.
 * Must be called AFTER `initInferenceGateway()` to avoid LLM call failures.
 * Extracted from `autoStartSimulation()` to fix the boot-order race condition.
 */
export function startCitizenCognitiveLoops(): void {
  const s = getState();

  // Citizen cognitive loops (top-50 by activity)
  try {
    startCitizenLoops(s.citizens);
    logger.info("Citizen cognitive loops started", { citizens: s.citizens.length });
  } catch (err) {
    logger.warn("Citizen cognitive loops failed to start (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Specialist autonomous loops (analyst, data-scientist, politician)
  try {
    const specialists = s.citizens
      .filter((c) => (c as unknown as Record<string, unknown>).specialistRole)
      .map((c) => ({
        citizenId: c.id,
        citizenName: c.name,
        role: (c as unknown as Record<string, unknown>).specialistRole as
          | "IntelligenceAnalyst"
          | "DataScientistCitizen"
          | "PoliticianCitizen",
      }));
    if (specialists.length > 0) {
      startSpecialistCitizenLoops(specialists);
    }
  } catch {
    // Non-fatal — specialist loops are supplementary
  }
}

/**
 * Graceful shutdown — save final snapshot before exit.
 * Registered as a SIGINT/SIGTERM handler.
 */
export async function gracefulShutdown(): Promise<void> {
  logger.info("Graceful shutdown initiated — waiting for deferred boot to complete...");
  // Ensure all deferred subsystems finished initializing before calling
  // their stop functions. No hardcoded timeout — the promise resolves
  // when all subsystem inits complete (typically <2s).
  await _deferredBootDone;
  logger.info("Deferred boot complete — tearing down...");
  // Phase 6: Stop all citizen cognitive loops before shutdown
  try {
    stopAllCitizenLoops();
  } catch {
    // Non-fatal — continue shutdown
  }
  try {
    stopSpecialistCitizenLoops();
  } catch {
    // Non-fatal — continue shutdown
  }
  stopSimLoop();
  shutdownOrchestrator();
  shutdownRateLimiter();
  // Dynamic-import shutdown functions — Node.js returns cached modules (no-op if already loaded)
  const [
    { shutdownMemoryPressure },
    { stopInfraMonitor },
    { stopSelfHealingLoop },
    { stopFederationSync },
  ] = await Promise.all([
    import("./memory-pressure.js"),
    import("./infra-control-plane.js"),
    import("./resilience.js"),
    import("./republic-federation.js"),
  ]);
  shutdownMemoryPressure();
  if (eventLoopMonitor) {
    eventLoopMonitor.stop();
    eventLoopMonitor = null;
  }
  stopInfraMonitor();
  stopSelfHealingLoop();
  stopFederationSync();
  stopWorldIntelligence();
  const s = state;
  if (s) {
    // Export memory state so it persists
    s.memoryState = exportMemoryState();
    // Export self-evolving citizen architecture state
    // These are runtime extensions not in the RepublicState type — persisted via snapshot
    const ext = s as unknown as Record<string, unknown>;
    ext.cognitiveState = serializeCognitiveState();
    ext.skillLibraryState = serializeSkillLibraryState();
    ext.evolutionState = serializeEvolutionState();
    ext.anchoredMemoryState = serializeAnchoredMemoryState();
    // Ensure ACE module state is synced to RepublicState before save
    // (tick-level sync already does this, but shutdown may happen mid-tick)
    syncCuriosityToState(s);
    syncResearchToState(s);
    syncForgeToState(s);
    await saveSnapshot(s);
    // Flush all persistent stores
    await flushAllStores().catch(() => {
      /* flush errors non-fatal at shutdown */
    });
    // Shutdown worker pool
    await shutdownWorkerPool().catch(() => {
      /* worker shutdown errors non-fatal */
    });
    logger.info("State saved successfully", { tick: s.currentTick, citizens: s.citizens.length });
  }
}

// ─── Simulation Control ─────────────────────────────────────────

/** Build the simulation status response. */
export function buildSimulationStatus(s: RepublicState) {
  const uptime = s.isRunning ? (Date.now() - s.startedAt) / 1000 : 0;
  const eventsPerSecond = uptime > 0 ? parseFloat((s.totalEventsProcessed / uptime).toFixed(1)) : 0;
  return {
    running: s.isRunning,
    tickRate: s.tickRate,
    currentTick: s.currentTick,
    totalEventsProcessed: s.totalEventsProcessed,
    activeAgents: s.citizens.filter((c) => c.activity !== "Sleeping").length,
    hibernatedAgents: s.citizens.filter((c) => c.activity === "Sleeping").length,
    memoryUsageMB: parseFloat((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)),
    uptime: parseFloat(uptime.toFixed(0)),
    eventsPerSecond,
  };
}
