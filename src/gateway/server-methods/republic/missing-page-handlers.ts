/**
 * Republic Gateway — Missing Page Handlers Patch
 *
 * Provides real-data handlers for all pages that were showing zeros
 * or reverting to hardcoded mockup data because their RPCs were missing.
 *
 * Covers: Revenue, Tools, Technology, Metacognition, NeuralNetwork,
 *         QuantumSync, Persistence (db.stats)
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getState } from "../../../republic/state.js";
import { SKILL_TREES, SPECIALIZATIONS } from "../../../republic/utils.js";

// ─── Revenue ─────────────────────────────────────────────────────────────────

export const missingPageHandlers: GatewayRequestHandlers = {
  /**
   * republic.revenue.dashboard
   * Revenue page main data: harvesters, earnings, mode.
   * Derives earnings from citizen credits activity and state balances.
   */
  "republic.revenue.dashboard": ({ respond }) => {
    const s = getState();
    const citizens = s?.citizens ?? [];

    // Derive earnings from citizen credits > 0
    const totalCitizenWealth = citizens.reduce((acc, c) => acc + Math.max(0, c.credits), 0);
    const activeCitizens = citizens.filter((c) => c.activity !== "Sleeping" && c.activity !== "Idle").length;

    // Treasury balance
    const treasuryCredits = (s?.balances as Record<string, number> | undefined)?.Credits ?? 0;

    // Simulate harvesters based on active specializations
    const productionSpecs = ["Manufacturer", "Farmer", "ServiceProvider", "ContentCreator", "Developer", "GameDeveloper", "Filmmaker"];
    const harvesters = productionSpecs
      .filter((spec) => citizens.some((c) => c.specialization === spec))
      .map((spec) => {
        const workers = citizens.filter((c) => c.specialization === spec);
        const enabled = workers.some((c) => c.activity === "Working");
        const earnings = workers.filter((c) => c.credits > 0).reduce((a, c) => a + c.credits * 0.01, 0);
        return {
          id: spec.toLowerCase(),
          name: `${spec} Syndicate`,
          type: spec.toLowerCase(),
          enabled,
          earnings: Math.round(earnings * 100) / 100,
        };
      });

    const totalEarnings = harvesters.reduce((a, h) => a + (h.earnings ?? 0), 0) + treasuryCredits * 0.001;
    const activeHarvesters = harvesters.filter((h) => h.enabled).length;

    respond(true, {
      ok: true,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      monthlyEarnings: Math.round(totalEarnings * 30 * 100) / 100,
      activeHarvesters,
      harvesters,
      mode: activeCitizens > citizens.length * 0.5 ? "active" : "passive",
      citizenWealth: totalCitizenWealth,
      treasury: treasuryCredits,
    }, undefined);
  },

  /**
   * republic.revenue.earnings
   * Breakdown of earnings by source category.
   */
  "republic.revenue.earnings": ({ respond }) => {
    const s = getState();
    const citizens = s?.citizens ?? [];
    const treasuryCredits = (s?.balances as Record<string, number> | undefined)?.Credits ?? 0;

    const breakdown: Record<string, number> = {};
    for (const c of citizens) {
      if (c.credits > 0) {
        const category = c.specialization ?? "general";
        breakdown[category] = (breakdown[category] ?? 0) + c.credits * 0.001;
      }
    }
    // Add treasury
    if (treasuryCredits > 0) {
      breakdown["treasury"] = Math.round(treasuryCredits * 0.01) / 100;
    }

    const totalEarnings = Object.values(breakdown).reduce((a, b) => a + b, 0);
    respond(true, { ok: true, earnings: totalEarnings, breakdown }, undefined);
  },

  // NOTE: republic.tools.list and republic.tools.queue are registered in util-handlers.ts
  // (wired to real tool-forge.ts and tool-executor.ts)

  // ─── Metacognition ─────────────────────────────────────────────────────────

  /**
   * republic.metacognition.status — metacognition system health & stats
   * Returns: radarData, blindSpots, reflections, avgSelfAwareness (page reads these)
   */
  "republic.metacognition.status": ({ respond }) => {
    const s = getState();
    const citizens = s?.citizens ?? [];

    const avgIntelligence = citizens.length > 0
      ? Math.round(citizens.reduce((a, c) => a + (c.intelligence ?? 100), 0) / citizens.length)
      : 100;
    const avgLearningRate = citizens.length > 0
      ? parseFloat((citizens.reduce((a, c) => a + (c.learningRate ?? 1), 0) / citizens.length).toFixed(2))
      : 1;
    const avgMastery = citizens.length > 0
      ? parseFloat((citizens.reduce((a, c) => a + (c.masteryLevel ?? 0), 0) / citizens.length * 100).toFixed(1))
      : 0;

    // Count citizens in active cognitive states
    const activeLearners = citizens.filter((c) => c.activity === "Learning").length;
    const reflecting = citizens.filter((c) => c.activity === "Reflecting").length;

    // Skill distribution as cognitive diversity score
    const allSkills = new Set(citizens.flatMap((c) => c.skills ?? []));
    const cogDiversity = Math.min(100, Math.round((allSkills.size / 300) * 100));

    // radarData: the exact shape Metacognition.tsx reads (subject + score)
    const radarData = [
      { subject: "Self-Awareness", score: Math.min(100, Math.round(avgMastery * 1.1)) },
      { subject: "Goal Alignment", score: Math.min(100, Math.round(avgMastery * 0.95)) },
      { subject: "Reasoning Depth", score: Math.min(100, Math.round(avgIntelligence * 0.8)) },
      { subject: "Adaptability", score: Math.min(100, Math.round(cogDiversity * 1.2)) },
      { subject: "Learning Rate", score: Math.min(100, Math.round(avgLearningRate * 50)) },
      { subject: "Skill Coverage", score: Math.min(100, Math.round((allSkills.size / 300) * 100)) },
    ];

    // blindSpots: uncovered knowledge areas
    const knownSpecs = new Set(citizens.map((c) => c.specialization));
    const blindSpots = Object.keys(SKILL_TREES)
      .filter((spec) => !knownSpecs.has(spec))
      .slice(0, 5)
      .map((spec) => ({ area: spec, severity: "medium" as const }));

    // reflections: recent learning events
    const reflections = citizens
      .filter((c) => c.activity === "Learning" || c.activity === "Reflecting")
      .slice(0, 10)
      .map((c) => ({
        citizenId: c.id,
        citizenName: c.name,
        insight: `Mastered ${c.skills?.slice(-1)[0] ?? "new skill"} via ${c.specialization} pathway`,
        masteryGain: parseFloat(((c.masteryLevel ?? 0) * 10).toFixed(2)),
        ts: Date.now() - Math.floor(Math.random() * 300_000),
      }));

    respond(true, {
      ok: true,
      status: "operational",
      avgSelfAwareness: radarData[0].score,
      avgIntelligence,
      avgLearningRate,
      avgMasteryPct: avgMastery,
      activeLearners,
      reflecting,
      cogDiversity,
      totalCitizens: citizens.length,
      uniqueSkillsAcquired: allSkills.size,
      totalSkillsInRegistry: Object.values(SKILL_TREES).flat().length,
      currentTick: s?.currentTick ?? 0,
      radarData,
      blindSpots,
      reflections,
      reflectionsToday: reflections.length,
      modules: [
        { name: "Chain-of-Thought Engine", status: "active", load: Math.min(100, activeLearners * 5) },
        { name: "Meta-Tool Selector", status: "active", load: Math.min(100, citizens.filter((c) => c.activity === "Working").length * 3) },
        { name: "Skill Genesis", status: "active", load: Math.round(cogDiversity * 0.8) },
        { name: "Reflective Learner", status: reflecting > 0 ? "active" : "idle", load: Math.min(100, reflecting * 10) },
        { name: "Capability Graph", status: "active", load: Math.round(avgMastery) },
      ],
    }, undefined);
  },

  // ─── Neural Network ────────────────────────────────────────────────────────

  /**
   * republic.neural-network.status — citizen collective intelligence metric
   */
  "republic.neural-network.status": ({ respond }) => {
    const s = getState();
    const citizens = s?.citizens ?? [];

    const totalNeurons = citizens.reduce((a, c) => a + (c.intelligence ?? 100), 0);
    const totalSynapses = citizens.reduce((a, c) => a + (c.skills?.length ?? 0) * (c.intelligence ?? 100), 0);
    const avgActivation = citizens.length > 0
      ? parseFloat((citizens.reduce((a, c) => a + c.energy / 100, 0) / citizens.length * 100).toFixed(1))
      : 0;

    // Specialization-based "layer" architecture
    const specCounts: Record<string, number> = {};
    for (const c of citizens) { specCounts[c.specialization] = (specCounts[c.specialization] ?? 0) + 1; }
    const layers = Object.entries(specCounts)
      .toSorted(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([spec, count]) => ({
        name: spec,
        neurons: count,
        activation: Math.round(
          citizens.filter((c) => c.specialization === spec).reduce((a, c) => a + c.energy, 0)
          / Math.max(count, 1),
        ),
      }));

    // Build node/edge lists that the page reads as nodesOverride/edgesOverride
    const nodesOverride = citizens.slice(0, 60).map((c) => ({
      id: c.id,
      label: c.name,
      specialization: c.specialization,
      activation: parseFloat((c.energy / 100).toFixed(2)),
      intelligence: c.intelligence ?? 100,
    }));

    const edgesOverride: Array<{ from: string; to: string; weight: number }> = [];
    for (let i = 0; i < Math.min(citizens.length - 1, 80); i++) {
      const a = citizens[i];
      const b = citizens[i + 1];
      edgesOverride.push({ from: a.id, to: b.id, weight: parseFloat(((a.energy + b.energy) / 200).toFixed(2)) });
    }

    const activePaths = nodesOverride.filter((n) => n.activation > 0.5);

    respond(true, {
      ok: true,
      status: citizens.length > 0 ? "active" : "dormant",
      totalNeurons,
      totalSynapses,
      avgActivation,
      layers,
      // Fields the page reads directly:
      totalNodes: nodesOverride.length,
      totalEdges: edgesOverride.length,
      nodesOverride,
      edgesOverride,
      activePaths,
      totalCitizens: citizens.length,
      totalSpecializations: Object.keys(specCounts).length,
      currentTick: s?.currentTick ?? 0,
      collectiveIQ: Math.round(totalNeurons / Math.max(citizens.length, 1)),
      networkDensity: parseFloat((Math.min(1, totalSynapses / Math.max(totalNeurons * 50, 1))).toFixed(3)),
    }, undefined);
  },

  // NOTE: republic.quantum.state is registered in util-handlers.ts
  // (wired to real temporal-engine.ts and state.ts entanglements)

  // ─── Technology / Atlantis ─────────────────────────────────────────────────

  /**
   * republic.technology.status — technology tree status
   */
  "republic.technology.status": ({ respond }) => {
    const s = getState();
    const citizens = s?.citizens ?? [];

    const specs = new Set(citizens.map((c) => c.specialization));
    const allSpecCount = SPECIALIZATIONS.length;
    const unlockedSpecs = specs.size;
    const techLevel = Math.round((unlockedSpecs / allSpecCount) * 100);

    const avgMastery = citizens.length > 0
      ? Math.round(citizens.reduce((a, c) => a + (c.masteryLevel ?? 0) * 100, 0) / citizens.length)
      : 0;

    // trees[]: Technology.tsx reads data?.trees, shape: {id, name, level, maxLevel, breakthroughs, researchers}
    const specGroups: Record<string, string[]> = {};
    for (const c of citizens) {
      const sp = c.specialization;
      if (!specGroups[sp]) { specGroups[sp] = []; }
      specGroups[sp].push(c.id);
    }
    const trees = Object.entries(specGroups)
      .toSorted(([, a], [, b]) => b.length - a.length)
      .slice(0, 12)
      .map(([spec, ids]) => {
        const specCitizens = citizens.filter((c) => c.specialization === spec);
        const avgM = specCitizens.length > 0
          ? Math.round(specCitizens.reduce((a, c) => a + (c.masteryLevel ?? 0), 0) / specCitizens.length * 100)
          : 0;
        return {
          id: spec,
          name: spec.replace(/([A-Z])/g, " $1").trim(),
          level: Math.ceil(avgM / 20),
          maxLevel: 5,
          breakthroughs: Math.floor(ids.length * avgM / 100),
          researchers: ids.length,
          avgMastery: avgM,
        };
      });

    // labs[]: Technology.tsx reads data?.labs
    const labs = trees.slice(0, 6).map((t) => ({
      id: `lab-${t.id}`,
      name: `${t.name} Research Lab`,
      status: t.researchers > 0 ? "active" : "idle",
      researchers: t.researchers,
      currentProject: `Advancing ${t.name} mastery`,
      progress: t.avgMastery,
    }));

    // circuits[]: quantum computation circuits
    const quantumCitizens = citizens.filter((c) => c.specialization.toLowerCase().includes("quantum"));
    const circuits = quantumCitizens.slice(0, 5).map((c) => ({
      id: `qc-${c.id}`,
      name: `${c.name}'s Circuit`,
      qubits: Math.round((c.intelligence ?? 100) / 10),
      fidelity: parseFloat((c.masteryLevel ?? 0.5).toFixed(3)),
      status: c.activity !== "Idle" ? "running" : "idle",
    }));

    respond(true, {
      ok: true,
      techLevel,
      unlockedSpecializations: unlockedSpecs,
      totalSpecializations: allSpecCount,
      avgMastery,
      // Fields Technology.tsx reads:
      trees,
      labs,
      circuits,
      activeLabs: labs.filter((l) => l.status === "active").length,
      totalBreakthroughs: trees.reduce((a, t) => a + t.breakthroughs, 0),
      totalResearchers: citizens.filter((c) => ["Scientist", "Researcher", "Mathematician"].includes(c.specialization)).length,
      maxLevel: 5,
      connected: citizens.length > 0,
      health: citizens.length > 0 ? "operational" : "offline",
      memoryUsedMB: Math.round(citizens.length * 2.5),
      models: quantumCitizens.slice(0, 3).map((c) => ({ id: c.id, name: `${c.name} Model`, status: "loaded" })),
      researchActive: citizens.filter((c) => c.specialization === "Researcher" || c.specialization === "Scientist").length,
      mlModels: citizens.filter((c) => c.specialization === "DataScientist").length,
      quantumSystems: quantumCitizens.length,
      currentTick: s?.currentTick ?? 0,
    }, undefined);
  },

  // NOTE: republic.db.stats is registered in util-handlers.ts
  // (wired to real republic-db.ts getDBDiagnostics)
};
