/**
 * Republic Platform — Population Manager
 *
 * Handles citizen lifecycle: creation, stat drift, reproduction,
 * and population reporting.
 */

import {
    generateAppearance, generateHabits, generateVoiceProfile, inheritAppearance
} from "./citizen-identity.js";
import { getCitizenBiology, startCitizenPregnancy } from "./citizen-biology.js";
import { reproduceCitizens } from "./evolution.js";
import { recordReproductionAttempt } from "./sim-diagnostics.js";
import type { Citizen, RepublicState } from "./types.js";
import {
    ACTIVITIES, avg, FIRST_NAMES, generateCitizen, LAST_NAMES, pick, rand,
    randFloat, rng, SKILL_TREES, SPECIALIZATIONS, ts, uid
} from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_POPULATION = 3000;

// ─── Citizen Stat Drift ─────────────────────────────────────────

/** Drift citizen stats slightly each tick. */
export function driftCitizenStats(citizens: Citizen[]): void {
  for (const c of citizens) {
    // Energy floor must stay above MIN_ENERGY_FOR_ACTION (10) so citizens
    // remain eligible for LLM-powered agent decisions
    const energyDrift = randFloat(-3, 3);
    // Resting/sleeping citizens regenerate energy faster
    const regen = (c.activity === "Sleeping" || c.activity === "Resting") ? 5 : 0;
    c.energy = Math.max(15, Math.min(100, c.energy + energyDrift + regen));
    c.happiness = Math.max(10, Math.min(100, c.happiness + randFloat(-2, 2)));
    c.health = Math.max(10, Math.min(100, c.health + randFloat(-1, 1)));
    c.credits += rand(-50, 200);
    c.age += 0.01;
    if (rng() < 0.1) {
      c.activity = pick(ACTIVITIES);
    }
  }
}

// ─── Mortality Check ────────────────────────────────────────────

/**
 * Probabilistic mortality check for citizens.
 *
 * Probability of death = baseRate × ageFactor × healthFactor
 * - ageFactor grows quadratically after age 100
 * - healthFactor: low health → much higher mortality
 *
 * Returns IDs of deceased citizens. Caller should:
 * 1. Emit lifecycle events
 * 2. Redistribute their credits to treasury
 * 3. Remove from citizen list
 */
export function mortalityCheck(s: RepublicState, citizens: Citizen[]): string[] {
  const deceased: string[] = [];
  const BASE_MORTALITY_RATE = 0.001; // 0.1% base chance per tick
  const MAX_DEATHS_PER_TICK = 2;

  for (const c of citizens) {
    if (deceased.length >= MAX_DEATHS_PER_TICK) {break;}

    // Age factor: quadratic growth after age 100
    const ageFactor = c.age > 100 ? 1 + ((c.age - 100) / 100) ** 2 : 1;

    // Health factor: inverse relationship (low health = high mortality)
    const healthFactor = Math.max(0.1, (100 - c.health) / 50);

    const deathProbability = BASE_MORTALITY_RATE * ageFactor * healthFactor;

    if (rng() < deathProbability) {
      deceased.push(c.id);

      // Redistribute credits to treasury
      s.balances.Credits += Math.max(0, c.credits);

      // Emit lifecycle event
      s.events.push({
        citizenId: c.id,
        citizenName: c.name,
        type: "Loss",
        description: `${c.name} passed away at age ${c.age.toFixed(1)} (Gen ${c.generation}, ${c.specialization})`,
        timestamp: ts(),
      });

      s.totalEventsProcessed++;
    }
  }

  // Remove deceased from population
  if (deceased.length > 0) {
    s.citizens = s.citizens.filter((c) => !deceased.includes(c.id));
  }

  return deceased;
}

// ─── Specialization Balancer ────────────────────────────────────

/**
 * Pick a specialization that favors under-represented ones to prevent
 * monoculture.  Works by weighting each spec inversely to its current
 * population share.
 */
function pickBalancedSpec(s: RepublicState): Citizen["specialization"] {
  const counts: Record<string, number> = {};
  for (const spec of SPECIALIZATIONS) {counts[spec] = 0;}
  for (const c of s.citizens) {counts[c.specialization] = (counts[c.specialization] ?? 0) + 1;}

  const total = s.citizens.length || 1;
  // Weight = inverse of current share (capped so it never becomes 0)
  const weights: { spec: string; w: number }[] = SPECIALIZATIONS.map((spec) => ({
    spec,
    w: 1 / Math.max(0.01, counts[spec] / total),
  }));
  const totalWeight = weights.reduce((s, e) => s + e.w, 0);
  let r = rng() * totalWeight;
  for (const { spec, w } of weights) {
    r -= w;
    if (r <= 0) {return spec as Citizen["specialization"];}
  }
  return pick(SPECIALIZATIONS);
}

// ─── Citizen Reproduction ───────────────────────────────────────

/** Attempt citizen reproduction. May produce up to 3 births per tick. */
export function attemptReproduction(s: RepublicState): boolean {
  if (s.citizens.length >= MAX_POPULATION) {return false;}

  // ── Emergency population recovery ──
  // When population drops critically low, spawn citizens aggressively
  // to prevent the death spiral where nobody has enough energy/happiness to reproduce
  if (s.citizens.length < 500) {
    const needed = Math.min(50, 500 - s.citizens.length);
    for (let i = 0; i < needed; i++) {
      spawnCitizen(s);
    }
    console.log(`[Population] Emergency recovery: spawned ${needed} citizens (total: ${s.citizens.length})`);
    return true;
  }

  // Population-aware throttle: lower chance as we approach cap
  const populationPressure = s.citizens.length / MAX_POPULATION;
  const reproChance = 0.35 * (1 - populationPressure * 0.7);

  const eligible = s.citizens.filter(
    (c) => {
      // Basic stat checks
      if (c.happiness <= 30 || c.health <= 20 || c.energy <= 15 || c.credits <= 20) { return false; }
      // Biology guard: defer to canReproduce if biology profile exists
      const bio = getCitizenBiology(c.id);
      if (bio && !bio.canReproduce) { return false; }
      // Minimum age guard: no reproduction for Infant/Child stages
      if ((c.age ?? 0) < 30) { return false; }
      return true;
    },
  );

  if (eligible.length < 2 || rng() >= reproChance) {
    recordReproductionAttempt(eligible.length, false, s.currentTick);
    return false;
  }

  // Allow up to 3 births per tick when conditions are favorable
  const maxBirths = eligible.length >= 6 ? 3 : eligible.length >= 3 && rng() < 0.4 ? 2 : 1;
  let born = false;
  for (let birthIdx = 0; birthIdx < maxBirths; birthIdx++) {
    if (s.citizens.length >= MAX_POPULATION) {break;}
    born = _doOneBirth(s, eligible) || born;
  }
  return born;
}

/** Internal: perform one birth from eligible parents. */
function _doOneBirth(s: RepublicState, eligible: Citizen[]): boolean {
  const parentA = eligible[rand(0, eligible.length - 1)];
  let parentB = eligible[rand(0, eligible.length - 1)];
  let attempts = 0;
  while (parentB.id === parentA.id && attempts++ < 5) {
    parentB = eligible[rand(0, eligible.length - 1)];
  }

  if (parentA.id === parentB.id) {return false;}

  // Prefer genome-based reproduction when both parents have genomes
  if (parentA.genomeId && parentB.genomeId) {
    const result = reproduceCitizens(s, parentA, parentB);
    if (result) {
      parentA.familySize++;
      parentB.familySize++;
      parentA.credits -= 100;
      parentB.credits -= 100;
      // Trigger biological pregnancy on one parent (if biology is tracked)
      startCitizenPregnancy(parentA.id, s.currentTick);
      return true;
    }
    // Fall through to simple reproduction if genome-based fails
  }

  // Simple reproduction (no genomes)
  const childGen = Math.max(parentA.generation, parentB.generation) + 1;
  // 30% chance: mutate to a balanced random spec (prevents monoculture)
  // 70% chance: inherit from one parent
  const childSpec: string =
    rng() < 0.3
      ? pickBalancedSpec(s)
      : rng() < 0.5
        ? parentA.specialization
        : parentB.specialization;
  const tree = SKILL_TREES[childSpec] ?? SKILL_TREES.Generalist;
  const child: Citizen = {
    id: uid(),
    name: `${pick(FIRST_NAMES)} ${parentA.name.split(" ")[1] ?? pick(LAST_NAMES)}`,
    generation: childGen,
    specialization: childSpec as Citizen["specialization"],
    activity: "Sleeping",
    energy: randFloat(70, 100),
    happiness: randFloat(80, 100),
    health: randFloat(85, 100),
    credits: rand(50, 500),
    age: 0,
    skillCount: 1,
    skills: [tree[0]],
    familySize: 2,
    // Phase 40: Intelligence fields — inherit blended values from parents
    skillProficiency: { [tree[0]]: 0.05 + rng() * 0.1 },
    learningRate:
      ((parentA.learningRate ?? 1) + (parentB.learningRate ?? 1)) / 2 + (rng() - 0.5) * 0.3,
    intelligence: Math.round(
      ((parentA.intelligence ?? 100) + (parentB.intelligence ?? 100)) / 2 + (rng() - 0.5) * 20,
    ),
    masteryLevel: 0,
    autonomyScore: 0.05,
  };

  // Phase 27: Inherit appearance from parents, generate voice and habits
  if (parentA.appearance && parentB.appearance) {
    child.appearance = inheritAppearance(parentA.appearance, parentB.appearance, child.id);
  } else {
    child.appearance = generateAppearance(child.id);
  }
  child.voiceProfile = generateVoiceProfile(child.id, child.personality);
  child.habits = generateHabits(child.id, child.personality);

  s.citizens.push(child);

  // Update parents
  parentA.familySize++;
  parentB.familySize++;
  parentA.credits -= 100;
  parentB.credits -= 100;

  // Record lifecycle events
  s.events.push({
    citizenId: child.id,
    citizenName: child.name,
    type: "Birth",
    description: `${child.name} was born to ${parentA.name} and ${parentB.name} (Gen ${childGen})`,
    timestamp: ts(),
  });
  s.events.push({
    citizenId: parentA.id,
    citizenName: parentA.name,
    type: "ChildBirth",
    description: `${parentA.name} and ${parentB.name} welcomed ${child.name} into the Republic`,
    timestamp: ts(),
  });

  // Keep events list manageable
  if (s.events.length > 500) {
    s.events = s.events.slice(-300);
  }

  s.totalEventsProcessed += 2;
  recordReproductionAttempt(eligible.length, true, s.currentTick);
  return true;
}

// ─── Population Reporting ───────────────────────────────────────

/** Activity-specific task descriptions keyed by [Activity][Specialization approximation]. */
const ACTIVITY_NARRATIVES: Record<string, Record<string, string[]>> = {
  Working: {
    default: [
      "Completing assigned tasks in the operations center",
      "Processing incoming data for the Republic systems",
      "Coordinating with team members on current project deliverables",
    ],
    Diplomat: [
      "Drafting diplomatic correspondence with allied entities",
      "Mediating inter-department disputes",
    ],
    Strategist: [
      "Analyzing Republic growth projections",
      "Developing long-term resource allocation plans",
    ],
    Engineer: [
      "Optimizing infrastructure node configurations",
      "Debugging system integration issues",
    ],
    Scientist: [
      "Running experimental simulations in the Research lab",
      "Peer-reviewing published findings",
    ],
    Economist: [
      "Modeling market trends for the Treasury Department",
      "Auditing Republic financial records",
    ],
    Medic: [
      "Performing routine health diagnostics on citizens",
      "Updating public health protocols",
    ],
    Artist: [
      "Creating visual content for Republic media channels",
      "Designing new cultural exhibits",
    ],
    Musician: [
      "Composing harmonic sequences for Republic broadcasts",
      "Rehearsing with the Republic ensemble",
    ],
    // Phase 52: Advanced Tech & Sci-Fi Specs
    QuantumAlgorithmDesigner: [
      "Tuning hyperdimensional matrices in the quantum lab",
      "Simulating molecular interactions using quantum kernels",
    ],
    AIEthicist: [
      "Drafting alignment protocols for autonomous systems",
      "Reviewing algorithmic fairness boundaries",
    ],
    SynbioEngineer: [
      "Splicing metabolic pathways for resilient crop traits",
      "Designing synthetic gene circuits in the biolab",
    ],
    Astrobotanist: [
      "Cultivating extremophile specimens in the greenhouse",
      "Analyzing radiation-resistant flora data",
    ],
    ExtraterrestrialHabitatDesigner: [
      "Modeling pressurized architecture for off-world outposts",
      "Running gravity-simulation stress tests on shielding materials",
    ],
    GenerativeAIArchitect: [
      "Refining latent space interpolation for multimodal models",
      "Supervising RLHF training reinforcement cycles",
    ],
    BCISpecialist: [
      "Calibrating neural decoding interfaces",
      "Analyzing connectome data from human-AI feedback loops",
    ],
    SpaceResourceExtractionSpecialist: [
      "Optimizing zero-g micro-drilling extraction yields",
      "Monitoring automated lunar regolith harvesting drones",
    ],
  },
  Learning: {
    default: [
      "Studying advanced concepts in the Atlantean Library",
      "Attending a Republic skills workshop",
      "Practicing new techniques under a mentor's guidance",
    ],
    Scientist: ["Researching quantum coherence papers", "Running training exercises on ML models"],
    Engineer: ["Studying distributed systems architecture", "Practicing new framework patterns"],
    // Phase 52
    QuantumHardwareEngineer: ["Studying superconducting circuit fault states", "Reviewing dilution refrigerator thermodynamics"],
    NeuroinformaticsEngineer: ["Reviewing EEG signal processing methodologies", "Studying computational neuroscience models"],
    HyperdimensionalDataScientist: ["Absorbing literature on vector symbolic architectures", "Exploring topological data manifold theories"],
  },
  Socializing: {
    default: [
      "Catching up with friends at the Republic commons",
      "Attending a community gathering",
      "Sharing stories with fellow citizens over a meal",
    ],
    Diplomat: ["Networking at a diplomatic reception", "Building coalitions with key stakeholders"],
  },
  Sleeping: {
    default: ["Resting and recharging for the next cycle", "Deep in regenerative sleep mode"],
  },
  Eating: {
    default: ["Having a meal at the Republic canteen", "Enjoying a quick energy recharge break"],
  },
  Resting: {
    default: [
      "Taking a well-deserved break between shifts",
      "Meditating at the Republic wellness center",
      "Decompressing after an intense project sprint",
    ],
  },
  Traveling: {
    default: [
      "In transit between Republic districts",
      "Traveling to a new assignment location",
      "Commuting to the operations center",
    ],
    Diplomat: ["Traveling to a diplomatic summit", "En route to an allied territory meeting"],
    Scientist: ["Traveling to a remote research facility", "In transit to the quantum laboratory"],
    // Phase 52
    OrbitalTrafficController: ["In transit to the orbital observation array", "Commuting to the space-domain tracking center"],
  },
  Shopping: {
    default: ["Browsing the Republic marketplace", "Acquiring supplies from the trade district"],
  },
  Entertaining: {
    default: [
      "Performing at a Republic cultural event",
      "Hosting a community entertainment session",
    ],
  },
  Coding: {
    default: [
      "Writing code for a Republic software project",
      "Implementing new features for the platform",
    ],
    Engineer: ["Refactoring critical infrastructure code", "Building microservice integrations"],
  },
  Debugging: {
    default: ["Investigating a system anomaly", "Tracing a bug in the Republic codebase"],
  },
  Testing: {
    default: ["Running test suites on recent changes", "Validating system behavior under load"],
  },
  Reviewing: {
    default: [
      "Reviewing code submissions from fellow engineers",
      "Evaluating proposals for department approval",
    ],
  },
  Creating: {
    default: ["Working on a creative project", "Designing something new for the Republic"],
    Artist: [
      "Sculpting a digital art piece for the Republic gallery",
      "Painting a mural for the public square",
    ],
    Musician: [
      "Composing a new piece for Republic Day celebrations",
      "Recording tracks in the sound studio",
    ],
    // Phase 52
    SentientMaterialsEngineer: ["Synthesizing a new batch of shape-memory alloys", "Prototyping self-healing metamaterials"],
    Nanotechnologist: ["Constructing molecular scale robotic prototypes", "Designing carbon nanotube filtration meshes"],
  },
  Reflecting: {
    default: [
      "Contemplating recent experiences and lessons learned",
      "Journaling thoughts for personal growth",
    ],
  },
  Executing: {
    default: [
      "Carrying out an assigned Republic operation",
      "Executing a high-priority mission directive",
    ],
  },
  Orchestrating: {
    default: [
      "Coordinating multiple teams across departments",
      "Managing project timelines and dependencies",
    ],
  },
  Conversing: {
    default: [
      "Engaged in a conversation with another citizen",
      "Exchanging ideas in a collaborative session",
    ],
  },
};

/** Generate a human-readable description of what a citizen is currently doing. */
function describeCitizenTask(c: Citizen): string {
  const activityNarratives = ACTIVITY_NARRATIVES[c.activity];
  if (!activityNarratives) {return c.activity;}

  // Try specialization-specific narrative first, then fall back to default
  const options = activityNarratives[c.specialization] ??
    activityNarratives.default ?? [c.activity];
  // Use a deterministic-ish pick based on citizen id + activity
  const hash = c.id.charCodeAt(0) + c.id.charCodeAt(c.id.length - 1) + c.activity.length;
  return options[hash % options.length];
}

/** Build population list response matching the existing RPC shape. */
export function buildPopulationList(
  s: RepublicState,
  params?: { search?: string; specialization?: string; limit?: number; offset?: number },
) {
  let filtered = s.citizens;
  if (params?.search) {
    const q = params.search.toLowerCase();
    filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
  }
  if (params?.specialization) {
    filtered = filtered.filter((c) => c.specialization === params.specialization);
  }

  const totalFiltered = filtered.length;

  // Apply pagination
  const offset = params?.offset ?? 0;
  const limit = params?.limit ?? 50;
  filtered = filtered.slice(offset, offset + limit);

  const specDist: Record<string, number> = {};
  const actDist: Record<string, number> = {};
  const genDist: Record<number, number> = {};
  for (const c of s.citizens) {
    specDist[c.specialization] = (specDist[c.specialization] ?? 0) + 1;
    actDist[c.activity] = (actDist[c.activity] ?? 0) + 1;
    genDist[c.generation] = (genDist[c.generation] ?? 0) + 1;
  }

  return {
    stats: {
      total: s.citizens.length,
      totalFiltered,
      active: s.citizens.filter((c) => c.activity !== "Sleeping").length,
      hibernated: s.citizens.filter((c) => c.activity === "Sleeping").length,
      avgEnergy: avg(s.citizens.map((c) => c.energy)),
      avgHappiness: avg(s.citizens.map((c) => c.happiness)),
      avgHealth: avg(s.citizens.map((c) => c.health)),
      avgCredits: avg(s.citizens.map((c) => c.credits)),
      specializationDistribution: specDist,
      activityDistribution: actDist,
      generationDistribution: genDist,
      recentEvents: s.events.slice(-10).map((e) => ({
        timestamp: new Date(e.timestamp).getTime(),
        type: e.type,
        citizenId: e.citizenId,
        description: e.description,
      })),
    },
    citizens: filtered.map((c) => ({
      id: c.id,
      name: c.name,
      generation: c.generation,
      specialization: c.specialization,
      activity: c.activity,
      // Derive status from activity for UI compatibility
      status:
        c.activity === "Sleeping" ? "Sleeping" :
        c.activity === "Resting" || c.activity === "Eating" ? "Idle" :
        "Active",
      level: c.skillCount ?? 1,
      currentTask: describeCitizenTask(c),
      health: c.health,
      energy: c.energy,
      happiness: c.happiness,
      credits: c.credits,
      skillCount: c.skillCount,
      skills: c.skills,
      familySize: c.familySize,
      age: c.age,
      node: "gateway",
      // Phase 40: Intelligence fields
      intelligence: c.intelligence ?? 100,
      learningRate: c.learningRate ?? 1,
      masteryLevel: c.masteryLevel ?? 0,
      autonomyScore: c.autonomyScore ?? 0,
      // Phase 55: Avatar & Voice
      appearance: c.appearance ?? undefined,
      voiceProfile: c.voiceProfile ?? undefined,
    })),
  };
}

/** Generate a new citizen and add to state. */
export function spawnCitizen(s: RepublicState): Citizen {
  const citizen = generateCitizen(rand(1, Math.max(1, ...s.citizens.map((c) => c.generation))));

  // Phase 27: Generate identity (appearance, voice, habits)
  citizen.appearance = generateAppearance(citizen.id);
  citizen.voiceProfile = generateVoiceProfile(citizen.id, citizen.personality);
  citizen.habits = generateHabits(citizen.id, citizen.personality);

  s.citizens.push(citizen);
  s.events.push({
    citizenId: citizen.id,
    citizenName: citizen.name,
    type: "Birth",
    description: `${citizen.name} joined the republic as a ${citizen.specialization}`,
    timestamp: ts(),
  });
  return citizen;
}
