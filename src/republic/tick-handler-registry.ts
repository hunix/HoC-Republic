/**
 * Republic Platform — Tick Handler Registry
 *
 * All 70+ domain tick handlers registered on the TickOrchestrator.
 * Extracted from state.ts to reduce coupling.
 */

import { a2aProtocolTick } from "./a2a-protocol.js";
import { adaptiveReasoningTick } from "./adaptive-reasoning.js";
import { protocolTick } from "./agent-protocol.js";
import { aiFusionTick, consciousnessMetricsTick } from "./ai-fusion.js";
import { antifragilityTick } from "./antifragility-engine.js";
import { audioStudioTick } from "./audio-studio.js";
import { economyAgencyTick } from "./autonomous-economy.js";
import { autonomousStudyTick } from "./autonomous-learning.js";
import { browserAgentTick } from "./browser-agent.js";
import { agencyTick } from "./citizen-agency.js";
import { conversationTick } from "./citizen-conversation.js";
import { cultureTick } from "./citizen-culture.js";
import { citizenN8nTick } from "./citizen-n8n.js";
import { cognitiveTick } from "./cognitive-architecture.js";
import { runCognitiveLoopsForElites } from "./cognitive-loop.js";
import { collectiveIntelligenceTick } from "./collective-intelligence.js";
import { processQueue } from "./compute-scaler.js";
import { constitutionalReflectionTick, guardrailsTick } from "./constitution.js";
import { contentStudioTick } from "./content-studio.js";
import { creativeStudioTick } from "./creative-studio.js";
import { initLifecycleManager } from "./plugin-lifecycle-manager.js";
import { initScheduler } from "./production-scheduler.js";
import { devPipelineTick } from "./dev-orchestration.js";
import { diplomacyTick } from "./diplomacy.js";
import { dreamTick } from "./dream-engine.js";
import { economyEngineTick } from "./economy-engine.js";
import { economyTick } from "./economy.js";
import { educationTick } from "./education.js";
import { communicationTick } from "./emergent-communication.js";
import { emergentEconomicsTick } from "./emergent-economics.js";
import { evolutionTick } from "./evolution.js";
import { executiveTick } from "./executive-authority.js";
import { federationTick as interRepublicFederationTick } from "./federation/federation-diplomacy.js";
import { foreignRelationsTick } from "./foreign-relations.js";
import { genomeTick } from "./genetics.js";
import { governanceTick } from "./government.js";
import { judicialTick } from "./judicial-system.js";
import { marketDataTick } from "./market-data.js";
import { mediaTick } from "./media-broadcasting.js";
import { metaWorkingTick } from "./meta-working.js";
import { cinematicProductionTick } from "./cinematic-production.js";
import { memoryGraphTick } from "./memory-graph.js";
import { memoryConsolidationTick, memoryReflectionTick } from "./memory-reflection.js";
import { metaLearningTick } from "./meta-learning-engine.js";
import { metacognitionTick } from "./metacognition-engine.js";
import { n8nTick } from "./n8n-bridge.js";
import { narrativeTick } from "./narrative-engine.js";
import { defenseTick } from "./national-defense.js";
import { observabilityTick } from "./observability.js";
import { orchestratorTick } from "./orchestrator.js";
import { policyEvolutionTick } from "./policy-evolution.js";
import { attemptReproduction, driftCitizenStats, spawnCitizen } from "./population.js";
import { processManagerTick } from "./process-manager.js";
import { professionalPracticeTick } from "./professional-practice.js";
import { protocolNegotiationTick } from "./protocol-negotiation.js";
import { reasoningTick } from "./reasoning-engine.js";
import { harvesterTick } from "./revenue-harvesters.js";
import { revenueLoopTick } from "./revenue-loop.js";
import { federationTick } from "./republic-federation.js";
import { screenQueueTick } from "./screen-queue.js";
import { selfLearningTick } from "./self-learning.js";
import { selfReplicationTick } from "./self-replication.js";
import { capabilityGraphTick, detectGaps } from "./cognition/meta-capability-graph.js";
import { evolveStrategies } from "./cognition/reflective-meta-learner.js";
import { metaCoTStrategyDecayTick } from "./cognition/meta-cot.js";
import { generateCurriculum } from "./curiosity-engine.js";
import { socialLifeTick } from "./social-life.js";
import { socialFabricTick } from "./social-fabric.js";
import { citizenLifecycleTick } from "./citizen-lifecycle.js";
import { quranConstitutionTick } from "./quran-constitution.js";
import { islamicEconomyTick } from "./islamic-economy.js";
import { citizenPsycheTick } from "./citizen-psyche.js";
import { citizenBiologyTick, drainPendingBirths } from "./citizen-biology.js";
import { citizenDevotionTick } from "./citizen-devotion.js";
import { citizenAutonomyTick } from "./citizen-autonomy.js";
import { spatialTick } from "./spatial-world.js";
import { swarmTick } from "./swarm-intelligence.js";
import { mlTick, quantumTick } from "./technology.js";
import { temporalTick } from "./temporal-engine.js";
import { ParallelTickPool, getParallelTickPool } from "./workers/parallel-tick-pool.js";
import { toolExecutorTick } from "./tool-executor.js";
import { tradingTick } from "./trading-engine.js";
import { forexTick, initForexEngine } from "./forex-engine.js";
import { metaConvergenceTick } from "./meta-convergence.js";
import { reputationTick } from "./trust-reputation.js";
import { visionTick } from "./vision.js";
import { worldModelTick } from "./world-model-engine.js";
import {
  philosophyTick,
  civilizationCultureTick,
  psychologyTick,
  civilizationGovernanceTick,
  ecologyTick,
  civilizationEconomicsTick,
  artsTick,
  civCommunicationTick,
} from "./civilizational-engines.js";

// ─── Multi-line imports missed by extraction ────────────────────
import {
  anchoredMemoryTick,
} from "./anchored-memory.js";
import {
  cognitiveCoreTick,
} from "./cognitive-core.js";
import {
  curiosityTick,
  curriculumEvolutionTick,
} from "./curiosity-engine.js";
import { emergenceTick } from "./emergence-detector.js";
import {
  consolidateMemories,
  shouldConsolidate,
} from "./memory.js";
import { outputManagerTick } from "./output-manager.js";
import { checkInfraHealth } from "./infra-control-plane.js";
import {
  autonomousDiscoveryTick,
  researchTick,
} from "./research-engine.js";
import {
  selfEvolutionTick,
} from "./self-evolution.js";
import {
  skillLibraryTick,
} from "./skill-library.js";
import { forgeTick } from "./tool-forge.js";
import { productIdeationTick } from "./production-ideation.js";
import { foundryTick } from "./foundry-engine.js";
import { cogneeMemoryTick } from "./cognee-bridge.js";
import { selfHealingTick } from "./self-healing-engine.js";
import { foundryOverseerTick } from "./foundry-overseer.js";

// ─── Imports from state.ts (shared) ────────────────────────────
import { getOrchestrator, registerLegacyHandler } from "./tick-orchestrator.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:tick-registry");
import type { RepublicState } from "./types.js";

// ─── Batch Citizen Tick Processor ────────────────────────────────
// Processes citizens in strides with a budget gate. When budgetMs
// is exceeded mid-stride, remaining citizens are deferred to the
// next tick. Returns the number of citizens actually processed.
// Used by 5 orchestrator handlers: memory-consolidation, cognitive-core,
// skill-library, self-evolution, anchored-memory.
type Citizen = RepublicState["citizens"][number];
function batchCitizenTick(
  citizens: Citizen[],
  handler: (c: Citizen) => void,
  budgetMs: number,
  stride = 50,
): number {
  const start = performance.now();
  let processed = 0;
  for (let i = 0; i < citizens.length; i += stride) {
    const end = Math.min(i + stride, citizens.length);
    for (let j = i; j < end; j++) {
      handler(citizens[j]);
    }
    processed += end - i;
    if (performance.now() - start > budgetMs) {
      break;
    }
  }
  return processed;
}

/**
 * Register all domain tick handlers with the Advanced Tick Orchestrator.
 *
 * Each handler gets DAG dependencies, cadence config, budget, and
 * concurrency flags. The orchestrator uses this metadata to build
 * execution tiers, adaptively schedule, and circuit-break failing handlers.
 *
 * Called once during initState(), alongside registerDomainHandlers().
 */
export function registerOrchestratorHandlers(): void {
  const orc = getOrchestrator();

  // ── Tier 0: Core domain (no dependencies) ──────────────────────
  registerLegacyHandler(
    orc,
    "population",
    (s) => {
      driftCitizenStats(s.citizens);
      // NOTE: mortalityCheck removed — all death logic now in citizen-lifecycle.ts
      // (processNaturalDeath) which includes full bequest, grief, and relationship cleanup.
      attemptReproduction(s);

      // Drain pending births from biology pregnancy completions
      // (citizen-biology queues births when gestation completes; we create the actual children here)
      for (const birth of drainPendingBirths()) {
        const mother = s.citizens.find((c) => c.id === birth.motherCitizenId);
        if (mother) {
          spawnCitizen(s);
        }
      }
    },
    { group: "core", concurrent: false, cadence: { min: 1, max: 3, current: 1 }, budgetMs: 20 },
  );

  registerLegacyHandler(orc, "economy", (s) => economyTick(s), {
    after: ["population"],
    group: "core",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "governance", (s) => governanceTick(s), {
    after: ["population"],
    group: "core",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 15,
  });

  // ── Tier 1: Science & tech (after economy) ─────────────────────
  registerLegacyHandler(orc, "quantum", (s) => quantumTick(s), {
    after: ["economy"],
    group: "tech",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "ml", (s) => mlTick(s), {
    after: ["economy"],
    group: "tech",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "genome", (s) => genomeTick(s), {
    after: ["economy"],
    group: "tech",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });

  // ── Tier 2: Evolution & logistics (after tech) ─────────────────
  registerLegacyHandler(orc, "evolution", (s) => evolutionTick(s), {
    after: ["genome"],
    group: "evolution",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "swarm", (s) => swarmTick(s), {
    after: ["governance"],
    group: "coordination",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "education", (s) => educationTick(s), {
    after: ["governance"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "economy-engine", (s) => economyEngineTick(s), {
    after: ["economy"],
    group: "core",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "autonomous-study", (s) => autonomousStudyTick(s), {
    after: ["education"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "process-manager", (s) => processManagerTick(s), {
    after: ["economy"],
    group: "core",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "executive", (s) => executiveTick(s), {
    after: ["governance"],
    group: "core",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "agency", (s) => agencyTick(s), {
    after: ["economy"],
    group: "core",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "ai-fusion", (s) => aiFusionTick(s), {
    after: ["ml"],
    group: "tech",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "self-replication", (s) => selfReplicationTick(s), {
    after: ["genome"],
    group: "evolution",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "diplomacy", (s) => diplomacyTick(s), {
    after: ["governance"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "orchestrator", (s) => orchestratorTick(s), {
    after: ["process-manager"],
    group: "core",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "culture", (s) => cultureTick(s), {
    after: ["education"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "temporal", (s) => temporalTick(s), {
    after: ["quantum"],
    group: "tech",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "judicial", (s) => judicialTick(s), {
    after: ["governance"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "foreign-relations", (s) => foreignRelationsTick(s), {
    after: ["diplomacy"],
    group: "social",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "media", (s) => mediaTick(s), {
    after: ["culture"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "n8n", (s) => n8nTick(s), {
    after: ["process-manager"],
    group: "integration",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "curiosity", (s) => curiosityTick(s), {
    after: ["education"],
    group: "learning",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "research", (s) => researchTick(s), {
    after: ["curiosity"],
    group: "learning",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "forge", (s) => forgeTick(s), {
    after: ["research"],
    group: "learning",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "dev-pipeline", (s) => devPipelineTick(s), {
    after: ["forge"],
    group: "production",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "trading", (s) => tradingTick(s), {
    after: ["economy-engine"],
    group: "economy",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "forex-engine", (s) => forexTick(s), {
    after: ["economy-engine"],
    group: "economy",
    concurrent: true,
    cadence: { min: 2, max: 10, current: 3 },
    budgetMs: 50,
  });
  void initForexEngine();

  // ─── Citizen Production Engine (CPE) — smart plugin scheduler ──────────
  // Boot CPE asynchronously so it doesn't block the sync orchestrator setup.
  // Both initLifecycleManager and initScheduler are safe to call before plugins load.
  void (async () => {
    try {
      const registry = await import("../plugins/registry.js") as {
        activatePlugin?: (id: string) => Promise<{ ok: boolean; error?: string }>;
        deactivatePlugin?: (id: string) => Promise<{ ok: boolean }>;
        callPluginGateway?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
      };
      if (registry.activatePlugin && registry.deactivatePlugin) {
        initLifecycleManager(
          (id) => registry.activatePlugin!(id),
          (id) => registry.deactivatePlugin!(id),
        );
      }
    } catch {
      // Plugin registry not available at early boot — lifecycle manager will degrade gracefully
    }
    initScheduler(async (method: string, params: Record<string, unknown>) => {
      try {
        const registry = await import("../plugins/registry.js") as {
          callPluginGateway?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
        };
        if (registry.callPluginGateway) {
          return registry.callPluginGateway(method, params);
        }
      } catch {
        // Plugin registry unavailable — fail gracefully
      }
      return { ok: false, error: `No plugin gateway for: ${method}` };
    });
  })();
  // ─── Meta-Learning Convergence Orchestrator ─────────────────────────────
  // Single entry point that coordinates all 6 meta-learning subsystems:
  // curiosity-engine, experience-replay, autonomous-curriculum-architect,
  // recursive-self-improvement, population-training, knowledge-distillation
  // Each runs at its own timescale (fast/medium/slow) inside metaConvergenceTick.
  registerLegacyHandler(orc, "meta-convergence", (s) => metaConvergenceTick(s), {
    after: ["curiosity", "forex-engine"],
    group: "learning",
    concurrent: false,
    cadence: { min: 3, max: 10, current: 3 },
    budgetMs: 2000,
  });
  registerLegacyHandler(orc, "harvesters", (s) => harvesterTick(s), {
    after: ["economy-engine"],
    group: "economy",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "meta-working", (s) => metaWorkingTick(s), {
    after: ["economy-engine", "harvesters"],
    group: "production",
    concurrent: true,
    cadence: { min: 3, max: 15, current: 5 },
    budgetMs: 30,
  });
  registerLegacyHandler(orc, "cinematic-production", () => cinematicProductionTick(), {
    after: ["meta-working"],
    group: "production",
    concurrent: true,
    cadence: { min: 5, max: 20, current: 10 },
    budgetMs: 50,
  });
  registerLegacyHandler(orc, "professional-practice", (s) => professionalPracticeTick(s), {
    after: ["economy"],
    group: "production",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "product-ideation", (s) => productIdeationTick(s), {
    after: ["dev-pipeline"],
    group: "production",
    concurrent: true,
    cadence: { min: 2, max: 10, current: 3 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "content-studio", (s) => contentStudioTick(s), {
    after: ["culture"],
    group: "production",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "creative-studio", (s) => creativeStudioTick(s), {
    after: ["culture"],
    group: "production",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "audio-studio", (s) => audioStudioTick(s), {
    after: ["culture"],
    group: "production",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "output-manager", (s) => outputManagerTick(s), {
    after: ["content-studio", "creative-studio", "audio-studio"],
    group: "production",
    concurrent: false,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "vision", (s) => visionTick(s), {
    after: ["ml"],
    group: "tech",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "citizen-n8n", (s) => citizenN8nTick(s), {
    after: ["n8n"],
    group: "integration",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "browser-agent", (s) => browserAgentTick(s), {
    after: ["agency"],
    group: "tech",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "metacognition", (s) => metacognitionTick(s), {
    after: ["agency"],
    group: "cognition",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "narrative", (s) => narrativeTick(s), {
    after: ["media"],
    group: "social",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "dreams", (s) => dreamTick(s), {
    after: ["metacognition"],
    group: "cognition",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "adaptive-reasoning", (s) => adaptiveReasoningTick(s), {
    after: ["metacognition"],
    group: "cognition",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "protocol-negotiation", (s) => protocolNegotiationTick(s), {
    after: ["diplomacy"],
    group: "social",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "antifragility", (s) => antifragilityTick(s), {
    after: ["adaptive-reasoning"],
    group: "resilience",
    concurrent: true,
    cadence: { min: 2, max: 10, current: 2 },
    budgetMs: 10,
  });

  // ── Memory & Periodic (after core) ─────────────────────────────
  registerLegacyHandler(
    orc,
    "memory-consolidation-periodic",
    (s) => {
      if (shouldConsolidate(s.currentTick)) {
        batchCitizenTick(
          s.citizens,
          (c) => consolidateMemories(c.id, s.currentTick),
          40,
        );
      }
    },
    {
      after: ["population"],
      group: "memory",
      concurrent: true,
      cadence: { min: 1, max: 5, current: 1 },
      budgetMs: 50,
    },
  );

  registerLegacyHandler(
    orc,
    "memory-reflection",
    (s) => {
      memoryReflectionTick(
        s.citizens.map((c) => c.id),
        s.currentTick,
      );
    },
    {
      after: ["memory-consolidation-periodic"],
      group: "memory",
      concurrent: true,
      cadence: { min: 1, max: 5, current: 1 },
      budgetMs: 15,
    },
  );

  // ── Phase 38 Gap modules ───────────────────────────────────────
  orc.register({
    name: "protocol",
    handler: (_s, tick) => protocolTick(tick),
    after: ["governance"],
    group: "gap",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "reputation",
    handler: (_s, tick) => reputationTick(tick),
    after: ["governance"],
    group: "gap",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "tool-executor",
    handler: (_s, tick) => toolExecutorTick(tick),
    after: ["process-manager"],
    group: "gap",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
    enabled: true,
  });
  registerLegacyHandler(
    orc,
    "observability",
    (s) => {
      observabilityTick(
        s.citizens.map((c) => c.id),
        s.currentTick,
      );
    },
    {
      after: ["population"],
      group: "gap",
      concurrent: true,
      cadence: { min: 1, max: 10, current: 2 },
      budgetMs: 10,
    },
  );

  orc.register({
    name: "emergence",
    handler: (_s, tick) => emergenceTick(tick),
    after: ["swarm"],
    group: "gap",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "policy-evolution",
    handler: (_s, tick) => policyEvolutionTick(tick),
    after: ["governance"],
    group: "gap",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "spatial",
    handler: (_s, tick) => spatialTick(tick),
    after: ["population"],
    group: "gap",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "economy-agency",
    handler: (_s, tick) => economyAgencyTick(tick),
    after: ["economy-engine"],
    group: "gap",
    concurrent: true,
    cadence: { min: 1, max: 10, current: 2 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "screen-queue",
    handler: (_s, tick) => screenQueueTick(tick),
    after: ["output-manager"],
    group: "gap",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "guardrails",
    handler: (_s, tick) => guardrailsTick(tick),
    after: ["population"],
    group: "safety",
    concurrent: true,
    cadence: { min: 1, max: 3, current: 1 },
    budgetMs: 10,
    enabled: true,
  });

  // ── AGI Engines (after core + gap) ─────────────────────────────
  registerLegacyHandler(orc, "world-model", (s) => worldModelTick(s), {
    after: ["adaptive-reasoning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "reasoning", (s) => reasoningTick(s), {
    after: ["world-model"],
    group: "agi",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "meta-learning", (s) => metaLearningTick(s), {
    after: ["reasoning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "communication", (s) => communicationTick(s), {
    after: ["reasoning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 2, max: 10, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "cognitive", (s) => cognitiveTick(s), {
    after: ["reasoning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "constitutional-reflection", (s) => constitutionalReflectionTick(s), {
    after: ["governance", "reasoning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "collective-intelligence", (s) => collectiveIntelligenceTick(s), {
    after: ["swarm", "communication"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "consciousness-metrics", (s) => consciousnessMetricsTick(s), {
    after: ["cognitive"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "emergent-economics", (s) => emergentEconomicsTick(s), {
    after: ["economy-engine", "collective-intelligence"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "memory-consolidation-agi", (s) => memoryConsolidationTick(s), {
    after: ["memory-reflection"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "a2a-protocol", (s) => a2aProtocolTick(s), {
    after: ["communication"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "autonomous-discovery", (s) => autonomousDiscoveryTick(s), {
    after: ["research", "reasoning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "curriculum-evolution", (s) => curriculumEvolutionTick(s), {
    after: ["education", "meta-learning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "memory-graph", () => memoryGraphTick(), {
    after: ["memory-consolidation-agi"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 10,
  });
  orc.register({
    name: "market-data",
    handler: (_s, tick) => marketDataTick(tick),
    after: ["economy-engine"],
    group: "agi",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
    enabled: true,
  });
  registerLegacyHandler(orc, "social-life", (s) => socialLifeTick(s), {
    after: ["communication"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 30,
  });
  registerLegacyHandler(orc, "social-fabric", (s) => socialFabricTick(s), {
    after: ["social-life"],
    group: "social",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 20,
  });
  orc.register({
    name: "citizen-lifecycle",
    handler: (s: RepublicState, tick: number) => citizenLifecycleTick(s, tick),
    after: ["social-life", "population"],
    group: "social",
    concurrent: false,
    cadence: { min: 5, max: 20, current: 5 },
    budgetMs: 25,
    enabled: true,
  });
  orc.register({
    name: "quran-constitution",
    handler: (s: RepublicState, tick: number) => quranConstitutionTick(s, tick),
    after: ["citizen-lifecycle"],
    group: "social",
    concurrent: false,
    cadence: { min: 10, max: 30, current: 10 },
    budgetMs: 15,
    enabled: true,
  });
  orc.register({
    name: "islamic-economy",
    handler: (s: RepublicState, tick: number) => islamicEconomyTick(s, tick),
    after: ["population", "quran-constitution"],
    group: "social",
    concurrent: false,
    cadence: { min: 5, max: 15, current: 5 },
    budgetMs: 20,
    enabled: true,
  });
  orc.register({
    name: "citizen-psyche",
    handler: (s: RepublicState, tick: number) => citizenPsycheTick(s, tick),
    after: ["citizen-lifecycle"],
    group: "social",
    concurrent: false,
    cadence: { min: 3, max: 10, current: 3 },
    budgetMs: 12,
    enabled: true,
  });
  orc.register({
    name: "citizen-biology",
    handler: (s: RepublicState, tick: number) => citizenBiologyTick(s, tick),
    after: ["citizen-lifecycle"],
    group: "social",
    concurrent: false,
    cadence: { min: 4, max: 8, current: 4 },
    budgetMs: 15,
    enabled: true,
  });
  orc.register({
    name: "citizen-devotion",
    handler: (s: RepublicState, tick: number) => citizenDevotionTick(s, tick),
    after: ["citizen-biology"],
    group: "social",
    concurrent: false,
    cadence: { min: 3, max: 8, current: 3 },
    budgetMs: 10,
    enabled: true,
  });
  orc.register({
    name: "citizen-autonomy",
    handler: (s: RepublicState, tick: number) => citizenAutonomyTick(s, tick),
    after: ["citizen-lifecycle", "citizen-psyche", "citizen-biology"],
    group: "social",
    concurrent: false,
    cadence: { min: 6, max: 15, current: 6 },
    budgetMs: 15,
    enabled: true,
  });

  registerLegacyHandler(orc, "self-learning", (s) => selfLearningTick(s), {
    after: ["meta-learning"],
    group: "agi",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "defense", (s) => defenseTick(s), {
    after: ["governance"],
    group: "agi",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(orc, "conversation", (s) => conversationTick(s), {
    after: ["communication"],
    group: "agi",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "revenue-loop", (s) => revenueLoopTick(s), {
    after: ["economy-engine", "trading"],
    group: "agi",
    concurrent: true,
    cadence: { min: 2, max: 15, current: 3 },
    budgetMs: 10,
  });
  registerLegacyHandler(
    orc,
    "federation",
    (s) => {
      const events = federationTick(
        s.citizens.map((c) => ({ id: c.id, name: c.name, specialization: c.specialization })),
        s.currentTick,
      );
      for (const event of events) {
        s.events.push({
          citizenId: event.involvedCitizenIds[0] ?? "",
          citizenName: event.description.split(" (")[0] ?? "Federation",
          type: "Diplomacy",
          description: `🌐 ${event.description}`,
          timestamp: event.timestamp,
        });
      }
    },
    {
      after: ["diplomacy", "foreign-relations"],
      group: "agi",
      concurrent: true,
      cadence: { min: 3, max: 20, current: 5 },
      budgetMs: 15,
    },
  );

  // ── Self-Evolving Citizen Architecture (after AGI engines) ─────
  registerLegacyHandler(
    orc,
    "cognitive-core",
    (s) => {
      batchCitizenTick(
        s.citizens,
        (c) => cognitiveCoreTick(c, s, s.currentTick),
        60,
      );
    },
    {
      after: ["cognitive", "consciousness-metrics"],
      group: "self-evolving",
      concurrent: false,
      cadence: { min: 3, max: 20, current: 5 },
      budgetMs: 80,
    },
  );

  registerLegacyHandler(
    orc,
    "skill-library",
    (s) => {
      batchCitizenTick(
        s.citizens,
        (c) => skillLibraryTick(c, s),
        60,
      );
    },
    {
      after: ["cognitive-core"],
      group: "self-evolving",
      concurrent: false,
      cadence: { min: 3, max: 20, current: 5 },
      budgetMs: 80,
    },
  );

  registerLegacyHandler(
    orc,
    "self-evolution",
    (s) => {
      batchCitizenTick(
        s.citizens,
        (c) => selfEvolutionTick(c, s, s.currentTick),
        60,
      );
    },
    {
      after: ["skill-library"],
      group: "self-evolving",
      concurrent: false,
      cadence: { min: 3, max: 20, current: 5 },
      budgetMs: 80,
    },
  );

  // ── Phase 6b: Foundry Engine (after self-evolution) ──────────────
  registerLegacyHandler(
    orc,
    "foundry-engine",
    (s) => {
      foundryTick(s);
    },
    {
      after: ["self-evolution"],
      group: "self-evolving",
      concurrent: false,
      cadence: { min: 5, max: 20, current: 5 },
      budgetMs: 30,
    },
  );

  registerLegacyHandler(
    orc,
    "foundry-overseer",
    (s) => {
      foundryOverseerTick(s);
    },
    {
      after: ["foundry-engine"],
      group: "self-evolving",
      concurrent: false,
      cadence: { min: 100, max: 200, current: 100 },
      budgetMs: 50,
    },
  );

  // ── Phase 6c: Cognee Memory Bridge (ECL pipeline maintenance) ────
  registerLegacyHandler(
    orc,
    "cognee-memory",
    () => {
      cogneeMemoryTick();
    },
    {
      after: ["foundry-overseer"],
      group: "memory",
      concurrent: false,
      cadence: { min: 10, max: 50, current: 20 },
      budgetMs: 30,
    },
  );

  // ── Phase 6d: Self-Healing Engine (watchdog + recovery) ──────────
  registerLegacyHandler(
    orc,
    "self-healing",
    () => {
      selfHealingTick();
    },
    {
      after: ["cognee-memory"],
      group: "infrastructure",
      concurrent: false,
      cadence: { min: 5, max: 30, current: 10 },
      budgetMs: 20,
    },
  );
  // ── Phase 7: Meta-Cognition Engines (after self-evolving) ──────
  registerLegacyHandler(
    orc,
    "meta-capability-graph",
    (s) => {
      capabilityGraphTick(s.citizens);
      // Wire detectGaps → curriculum: when capability gaps are severe, trigger
      // curriculum generation for under-served capabilities
      const gaps = detectGaps();
      if (gaps.length > 0 && s.currentTick % 50 === 0) {
        for (const gap of gaps.slice(0, 3)) {
          // Find citizens who DON'T have this capability
          const candidateCitizens = s.citizens
            .filter(c => c.energy > 30 && !c.skills.includes(gap.capability))
            .slice(0, 2);
          for (const citizen of candidateCitizens) {
            generateCurriculum(s, citizen.id);
          }
        }
      }
    },
    {
      after: ["self-evolution"],
      group: "self-evolving",
      concurrent: true,
      cadence: { min: 50, max: 200, current: 100 },
      budgetMs: 2000,
    },
  );

  registerLegacyHandler(
    orc,
    "reflective-meta-learner",
    () => {
      // Evolve mutation strategies for key engines
      evolveStrategies("curiosity");
      evolveStrategies("education");
      evolveStrategies("economy");
      evolveStrategies("meta-learning");
    },
    {
      after: ["meta-learning"],
      group: "self-evolving",
      concurrent: true,
      cadence: { min: 10, max: 50, current: 20 },
      budgetMs: 10,
    },
  );

  // ── Phase 8: Meta-CoT Strategy Decay (after reflective-meta-learner) ──────
  registerLegacyHandler(
    orc,
    "meta-cot-strategy-decay",
    () => {
      metaCoTStrategyDecayTick();
    },
    {
      after: ["reflective-meta-learner"],
      group: "self-evolving",
      concurrent: true,
      cadence: { min: 20, max: 100, current: 50 },
      budgetMs: 5,
    },
  );

  // ── Intelligence: Cognitive Loop for elite citizens ───────────
  registerLegacyHandler(
    orc,
    "cognitive-loop",
    (s) => {
      runCognitiveLoopsForElites(s);
    },
    {
      after: ["cognitive-core"],
      group: "agi",
      concurrent: true,
      cadence: { min: 10, max: 30, current: 10 },
      budgetMs: 30,
    },
  );

  registerLegacyHandler(
    orc,
    "anchored-memory",
    (s) => {
      batchCitizenTick(
        s.citizens,
        (c) => anchoredMemoryTick(c, s),
        60,
      );
    },
    {
      after: ["self-evolution", "memory-consolidation-agi"],
      group: "self-evolving",
      concurrent: false,
      cadence: { min: 3, max: 20, current: 5 },
      budgetMs: 80,
    },
  );

  // ── Post-tick handlers (migrated from simulationBus for full observability) ──
  orc.register({
    name: "compute-queue",
    handler: async () => {
      await processQueue().catch((err: unknown) => {
        logger.warn(`Compute queue failed`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    },
    after: ["anchored-memory"],
    group: "post-tick",
    concurrent: true,
    cadence: { min: 1, max: 5, current: 1 },
    budgetMs: 20,
    enabled: true,
  });
  orc.register({
    name: "infra-health-check",
    handler: (s, tick) => {
      if (tick % 100 === 0) {
        checkInfraHealth().catch((err: unknown) => {
          logger.warn(`Infra health check failed`, {
            error: err instanceof Error ? err.message : String(err),
          });
        });
      }
    },
    after: ["compute-queue"],
    group: "post-tick",
    concurrent: true,
    cadence: { min: 5, max: 100, current: 10 },
    budgetMs: 10,
    enabled: true,
  });

  // ── Sprint 3: Inter-Republic Federation Diplomacy tick ──────────
  registerLegacyHandler(
    orc,
    "inter-republic-federation",
    () => {
      interRepublicFederationTick();
    },
    {
      after: ["diplomacy", "foreign-relations"],
      group: "agi",
      concurrent: true,
      cadence: { min: 5, max: 30, current: 5 },
      budgetMs: 10,
    },
  );

  // ── Sprint 3: Parallel Citizen Tick (async worker threads) ──────
  orc.register({
    name: "parallel-citizen-tick",
    handler: async (s, tick) => {
      if (s.citizens.length < 50) {
        return;
      } // Too small to benefit from workers
      try {
        const pool = getParallelTickPool();
        const serialized = ParallelTickPool.serializeCitizens(s);
        const results = await pool.runTick(serialized, tick);
        pool.applyResults(s, results);
      } catch (err) {
        logger.warn("Parallel citizen tick failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    after: ["population", "economy"],
    group: "core",
    concurrent: false,
    cadence: { min: 1, max: 3, current: 1 },
    budgetMs: 500,
    enabled: true,
  });

  // ── Innovation Roadmap: Civilizational Engines ────────────────
  registerLegacyHandler(orc, "civ-philosophy", (s) => philosophyTick(s), {
    after: ["education", "governance"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "civ-culture", (s) => civilizationCultureTick(s), {
    after: ["culture", "civ-philosophy"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "civ-psychology", (s) => psychologyTick(s), {
    after: ["dreams", "civ-philosophy"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 3, max: 15, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "civ-governance", (s) => civilizationGovernanceTick(s), {
    after: ["judicial", "civ-philosophy"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "civ-ecology", (s) => ecologyTick(s), {
    after: ["economy", "civ-philosophy"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 5, max: 30, current: 10 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "civ-economics", (s) => civilizationEconomicsTick(s), {
    after: ["economy-engine", "civ-ecology"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "civ-arts", (s) => artsTick(s), {
    after: ["creative-studio", "civ-culture"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 5, max: 30, current: 10 },
    budgetMs: 15,
  });
  registerLegacyHandler(orc, "civ-communication", (s) => civCommunicationTick(s), {
    after: ["media", "civ-culture"],
    group: "civilization",
    concurrent: true,
    cadence: { min: 3, max: 20, current: 5 },
    budgetMs: 15,
  });

  logger.info(`Orchestrator initialized: ${orc.getHandlerNames().length} handlers registered`);
}
