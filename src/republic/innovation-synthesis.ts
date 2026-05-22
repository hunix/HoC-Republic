/**
 * Republic Platform — Innovation Synthesis Engine
 *
 * Phase 5: Cross-domain innovation engine that detects when citizens from
 * different disciplines collaborate and creates breakthrough discoveries.
 *
 * Subsystems:
 *  1. Cross-Pollination — monitors cross-specialization interactions
 *  2. Breakthrough Detection — identifies innovation-worthy combinations
 *  3. Innovation Registry — permanent record of all innovations
 *  4. Serendipity Engine — random chance of unexpected discoveries
 *  5. Innovation Cascades — one innovation triggers follow-on discoveries
 *  6. Genius Spark — rare moments of individual brilliance
 */

import type { Citizen, RepublicState } from "./types.js";
import { addEpisodicMemory, addSemanticMemory } from "./memory.js";
import { pick, rand, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type InnovationDomain =
  | "computation"
  | "biotechnology"
  | "energy"
  | "materials"
  | "communication"
  | "transportation"
  | "medicine"
  | "education"
  | "art"
  | "philosophy"
  | "governance"
  | "economics"
  | "entertainment"
  | "security"
  | "ecology"
  | "quantum"
  | "neuroscience"
  | "fusion"
  | "space";

type InnovationTier = "incremental" | "significant" | "breakthrough" | "paradigm_shift";

export interface Innovation {
  id: string;
  title: string;
  description: string;
  domain: InnovationDomain;
  tier: InnovationTier;
  discoveredBy: string[]; // citizen IDs
  discovererNames: string[]; // citizen names
  crossDomains: string[]; // which specializations collided
  impactScore: number; // 0.0 – 10.0
  tick: number;
  timestamp: string;
  parentInnovationId?: string; // for cascades
  childInnovationIds: string[];
  applications: string[];
  citations: number;
}

// ─── Cross-Pollination Matrix ───────────────────────────────────

/**
 * When two specializations interact, these are the breakthrough domains
 * and quality multipliers. Higher multiplier = more likely to produce
 * significant innovation.
 */
const CROSS_POLLINATION_MATRIX: Record<
  string,
  { domain: InnovationDomain; multiplier: number; themes: string[] }
> = {
  // Science × Tech
  "Scientist+Developer": {
    domain: "computation",
    multiplier: 1.8,
    themes: ["ML-driven simulation", "automated laboratory", "computational biology"],
  },
  "Scientist+Engineer": {
    domain: "materials",
    multiplier: 1.7,
    themes: ["metamaterials", "self-healing structures", "bio-inspired engineering"],
  },
  "Scientist+DataScientist": {
    domain: "computation",
    multiplier: 1.9,
    themes: ["data-driven discovery", "predictive science", "AI hypothesis generation"],
  },
  "Scientist+Doctor": {
    domain: "medicine",
    multiplier: 2.0,
    themes: ["personalized medicine", "gene therapy", "nano-diagnostics"],
  },
  "Scientist+Composer": {
    domain: "neuroscience",
    multiplier: 1.5,
    themes: ["sonic therapy", "auditory neuroscience", "harmonic cognition"],
  },
  "Scientist+Artist": {
    domain: "art",
    multiplier: 1.4,
    themes: ["data visualization", "bio-art", "fractal aesthetics"],
  },
  "Scientist+Philosopher": {
    domain: "philosophy",
    multiplier: 1.6,
    themes: ["philosophy of AI", "consciousness theory", "ethical computation"],
  },

  // Art × Tech
  "Artist+Developer": {
    domain: "entertainment",
    multiplier: 1.6,
    themes: ["generative art platforms", "AR/VR galleries", "procedural aesthetics"],
  },
  "Artist+Composer": {
    domain: "art",
    multiplier: 1.5,
    themes: ["synesthetic experiences", "audiovisual installations", "reactive art"],
  },
  "Artist+Architect": {
    domain: "art",
    multiplier: 1.7,
    themes: ["inhabitable sculpture", "biomimetic buildings", "light architecture"],
  },
  "Artist+GameDeveloper": {
    domain: "entertainment",
    multiplier: 1.8,
    themes: ["art games", "interactive narratives", "visual storytelling engines"],
  },
  "Artist+Filmmaker": {
    domain: "entertainment",
    multiplier: 1.6,
    themes: ["visual poetry", "experimental cinema", "AI-directed films"],
  },

  // Music × Everything
  "Composer+Developer": {
    domain: "entertainment",
    multiplier: 1.7,
    themes: ["procedural music", "AI composition", "interactive soundscapes"],
  },
  "Composer+Doctor": {
    domain: "medicine",
    multiplier: 1.5,
    themes: ["music therapy", "binaural healing", "cardiac rhythm entrainment"],
  },
  "Composer+Physicist": {
    domain: "quantum",
    multiplier: 1.4,
    themes: ["quantum harmonics", "string theory sonification", "wave function music"],
  },

  // Medical × Others
  "Doctor+DataScientist": {
    domain: "medicine",
    multiplier: 2.0,
    themes: ["epidemiological AI", "clinical prediction", "genomic analysis"],
  },
  "Doctor+Psychologist": {
    domain: "neuroscience",
    multiplier: 1.8,
    themes: ["neurocognitive therapy", "digital mental health", "AI counseling"],
  },
  "Doctor+Engineer": {
    domain: "biotechnology",
    multiplier: 1.9,
    themes: ["prosthetics", "bioprinting", "surgical robotics"],
  },

  // Governance × Innovation
  "Diplomat+Strategist": {
    domain: "governance",
    multiplier: 1.5,
    themes: ["AI-assisted diplomacy", "algorithmic governance", "automated mediation"],
  },
  "Diplomat+Economist": {
    domain: "economics",
    multiplier: 1.6,
    themes: ["crypto-diplomacy", "decentralized governance", "trade AI"],
  },

  // Engineering × Everything
  "Engineer+Architect": {
    domain: "materials",
    multiplier: 1.7,
    themes: ["smart materials", "modular construction", "3D-printed buildings"],
  },
  "Engineer+GameDeveloper": {
    domain: "computation",
    multiplier: 1.5,
    themes: ["physics engines", "simulation frameworks", "digital twins"],
  },

  // Education × Others
  "Educator+Developer": {
    domain: "education",
    multiplier: 1.6,
    themes: ["adaptive learning AI", "intelligent tutoring", "VR classrooms"],
  },
  "Educator+Psychologist": {
    domain: "education",
    multiplier: 1.7,
    themes: ["cognitive scaffolding", "emotional learning", "neurodidactics"],
  },
  "Educator+Artist": {
    domain: "education",
    multiplier: 1.4,
    themes: ["interactive textbooks", "gamified learning", "visual pedagogy"],
  },

  // Innovator specialization combos
  "Innovator+Developer": {
    domain: "computation",
    multiplier: 2.0,
    themes: ["disruptive platforms", "decentralized tech", "zero-cost solutions"],
  },
  "Innovator+Scientist": {
    domain: "biotechnology",
    multiplier: 2.0,
    themes: ["biohacking tools", "citizen science", "democratized research"],
  },
  "Innovator+Artist": {
    domain: "art",
    multiplier: 1.8,
    themes: ["new art mediums", "AI-human co-creation", "digital renaissance"],
  },

  // Space & Quantum
  "Scientist+Astronomer": {
    domain: "space",
    multiplier: 1.8,
    themes: ["exoplanet detection", "space communications", "orbital computing"],
  },
  "Engineer+Astronomer": {
    domain: "space",
    multiplier: 1.9,
    themes: ["satellite swarms", "space habitat design", "in-situ resource mining"],
  },

  // Security
  "SecurityExpert+Developer": {
    domain: "security",
    multiplier: 1.7,
    themes: ["zero-knowledge proofs", "AI pentesting", "self-healing networks"],
  },
  "SecurityExpert+Strategist": {
    domain: "security",
    multiplier: 1.6,
    themes: ["cyber war games", "threat prediction", "autonomous defense"],
  },

  // Data Science × ML Cross-Pollination
  "DataScientist+Developer": {
    domain: "computation",
    multiplier: 2.1,
    themes: ["autoML platform", "self-optimizing pipeline", "real-time model serving"],
  },
  "DataScientist+Engineer": {
    domain: "computation",
    multiplier: 1.9,
    themes: ["ML hardware accelerator", "edge inference engine", "model compression"],
  },
  "DataScientist+Researcher": {
    domain: "computation",
    multiplier: 2.0,
    themes: [
      "novel architecture discovery",
      "automated hypothesis testing",
      "meta-learning framework",
    ],
  },
  "DataScientist+Analyst": {
    domain: "economics",
    multiplier: 1.7,
    themes: ["predictive market model", "anomaly detection system", "automated decision engine"],
  },
  "DataScientist+Artist": {
    domain: "art",
    multiplier: 1.6,
    themes: ["generative AI art tool", "style transfer engine", "creative neural network"],
  },
  "DataScientist+Composer": {
    domain: "entertainment",
    multiplier: 1.7,
    themes: ["AI music generation", "audio synthesis model", "emotion-adaptive soundtrack"],
  },
  "DataScientist+Doctor": {
    domain: "medicine",
    multiplier: 2.2,
    themes: ["diagnostic AI model", "drug discovery pipeline", "patient outcome predictor"],
  },
  "DataScientist+Filmmaker": {
    domain: "entertainment",
    multiplier: 1.6,
    themes: ["deepfake detection model", "scene generation AI", "automated video editor"],
  },
  "DataScientist+GameDeveloper": {
    domain: "computation",
    multiplier: 1.8,
    themes: ["reinforcement learning agent", "procedural content generator", "game AI optimizer"],
  },
  "DataScientist+Innovator": {
    domain: "computation",
    multiplier: 2.3,
    themes: ["AGI architecture prototype", "self-improving model", "autonomous research agent"],
  },
};

// ─── Innovation State ───────────────────────────────────────────

const innovations: Innovation[] = [];
const MAX_INNOVATIONS = 500;

// Track recent interactions for cross-pollination detection
const recentInteractions: { citizenA: string; citizenB: string; tick: number }[] = [];
const MAX_RECENT_INTERACTIONS = 200;

// ─── 1. Cross-Pollination Detection ────────────────────────────

function getPollinationKey(specA: string, specB: string): string {
  const sorted = [specA, specB].toSorted();
  return `${sorted[0]}+${sorted[1]}`;
}

/**
 * Record an interaction between two citizens.
 * Called when citizens collaborate, teach, socialize, or work together.
 */
export function recordInteraction(citizenA: string, citizenB: string, tick: number): void {
  recentInteractions.push({ citizenA, citizenB, tick });
  if (recentInteractions.length > MAX_RECENT_INTERACTIONS) {
    recentInteractions.splice(0, recentInteractions.length - MAX_RECENT_INTERACTIONS);
  }
}

// ─── 2. Innovation Generation ───────────────────────────────────

function generateInnovationTitle(themes: string[], _domain: InnovationDomain): string {
  const prefixes = [
    "Breakthrough in",
    "Discovery of",
    "Novel Approach to",
    "Revolutionary",
    "Paradigm-Shifting",
    "First-of-its-Kind",
    "Pioneering",
    "Emergent",
  ];
  const theme = pick(themes);
  return `${pick(prefixes)} ${theme}`;
}

function generateInnovationDescription(
  title: string,
  discovererNames: string[],
  crossDomains: string[],
  domain: InnovationDomain,
): string {
  const descriptions = [
    `${discovererNames.join(" & ")} combined expertise in ${crossDomains.join(" and ")} to create a groundbreaking advance in ${domain}. "${title}" represents a fusion of previously disconnected knowledge domains, opening new frontiers for the Republic.`,
    `Through interdisciplinary collaboration between ${crossDomains.join(", ")}, ${discovererNames.join(" and ")} achieved "${title}" — a milestone that redefines what's possible in ${domain}. The Republic's knowledge base has been permanently expanded.`,
    `"${title}" emerged from the unexpected intersection of ${crossDomains.join(" × ")}. ${discovererNames.join(" and ")} demonstrated that the most profound discoveries arise at the boundaries between disciplines.`,
  ];
  return pick(descriptions);
}

function calculateImpactScore(tier: InnovationTier, multiplier: number): number {
  const tierBase: Record<InnovationTier, number> = {
    incremental: 1.5,
    significant: 4.0,
    breakthrough: 7.0,
    paradigm_shift: 9.5,
  };
  return Math.min(10, tierBase[tier] * multiplier * (0.8 + rng() * 0.4));
}

function determineTier(qualityScore: number): InnovationTier {
  if (qualityScore > 0.95) {
    return "paradigm_shift";
  }
  if (qualityScore > 0.75) {
    return "breakthrough";
  }
  if (qualityScore > 0.45) {
    return "significant";
  }
  return "incremental";
}

/**
 * Attempt to create an innovation from two collaborating citizens.
 */
function attemptInnovation(
  citizenA: Citizen,
  citizenB: Citizen,
  s: RepublicState,
): Innovation | null {
  const key = getPollinationKey(citizenA.specialization, citizenB.specialization);
  const combo = CROSS_POLLINATION_MATRIX[key];

  if (!combo) {
    return null;
  }

  // Base innovation chance increases with citizen quality
  const skillFactor = ((citizenA.skillCount + citizenB.skillCount) / 2) * 0.04;
  const happinessFactor = ((citizenA.happiness + citizenB.happiness) / 2) * 0.002;
  const generationFactor = ((citizenA.generation + citizenB.generation) / 2) * 0.03;
  const qualityScore = Math.min(1, skillFactor + happinessFactor + generationFactor + rng() * 0.3);

  // Innovation roll: must exceed threshold adjusted by multiplier
  const threshold = 0.85 / combo.multiplier;
  if (rng() > threshold) {
    return null;
  } // no innovation this time

  const tier = determineTier(qualityScore);
  const title = generateInnovationTitle(combo.themes, combo.domain);
  const discovererNames = [citizenA.name ?? citizenA.id, citizenB.name ?? citizenB.id];

  const innovation: Innovation = {
    id: uid(),
    title,
    description: generateInnovationDescription(
      title,
      discovererNames,
      [citizenA.specialization, citizenB.specialization],
      combo.domain,
    ),
    domain: combo.domain,
    tier,
    discoveredBy: [citizenA.id, citizenB.id],
    discovererNames,
    crossDomains: [citizenA.specialization, citizenB.specialization],
    impactScore: calculateImpactScore(tier, combo.multiplier),
    tick: s.currentTick,
    timestamp: ts(),
    childInnovationIds: [],
    applications: generateApplications(combo.domain, tier),
    citations: 0,
  };

  return innovation;
}

function generateApplications(domain: InnovationDomain, tier: InnovationTier): string[] {
  const baseApps: Record<InnovationDomain, string[]> = {
    computation: ["Algorithm optimization", "Hardware acceleration", "Software framework"],
    biotechnology: ["Genetic engineering", "Bioreactor design", "Drug synthesis"],
    energy: ["Power generation", "Energy storage", "Grid optimization"],
    materials: ["New alloy development", "Smart textiles", "Construction innovation"],
    communication: ["Protocol design", "Signal processing", "Network topology"],
    transportation: ["Vehicle design", "Route optimization", "Autonomous navigation"],
    medicine: ["Treatment protocol", "Diagnostic tool", "Prevention strategy"],
    education: ["Curriculum enhancement", "Learning platform", "Assessment method"],
    art: ["New art medium", "Creative tool", "Exhibition design"],
    philosophy: ["Ethics framework", "Decision model", "Value alignment"],
    governance: ["Policy recommendation", "Voting system", "Resource allocation"],
    economics: ["Market model", "Trading strategy", "Value creation"],
    entertainment: ["Game mechanic", "Interactive experience", "Streaming innovation"],
    security: ["Defense system", "Encryption method", "Threat detection"],
    ecology: ["Conservation strategy", "Ecosystem model", "Sustainability metric"],
    quantum: ["Quantum algorithm", "Error correction", "Entanglement protocol"],
    neuroscience: ["Brain-computer interface", "Neural model", "Cognitive enhancement"],
    fusion: ["Cross-domain platform", "Integration framework", "Hybrid system"],
    space: ["Propulsion system", "Habitat design", "Communication relay"],
  };

  const apps = baseApps[domain] ?? ["General application"];
  const count = tier === "paradigm_shift" ? 3 : tier === "breakthrough" ? 2 : 1;
  const result: string[] = [];
  const available = [...apps];
  for (let i = 0; i < Math.min(count, available.length); i++) {
    const idx = rand(0, available.length - 1);
    result.push(available.splice(idx, 1)[0]);
  }
  return result;
}

// ─── 3. Register Innovation ─────────────────────────────────────

function registerInnovation(innovation: Innovation, s: RepublicState): void {
  innovations.push(innovation);
  if (innovations.length > MAX_INNOVATIONS) {
    innovations.splice(0, innovations.length - MAX_INNOVATIONS);
  }

  // Record in discoverers' memory
  for (const citizenId of innovation.discoveredBy) {
    addEpisodicMemory(citizenId, {
      tick: innovation.tick,
      timestamp: innovation.timestamp,
      description: `Made a ${innovation.tier} innovation: "${innovation.title}" in ${innovation.domain}. Impact: ${innovation.impactScore.toFixed(1)}/10`,
      valence: 0.95,
      importance:
        innovation.tier === "paradigm_shift" ? 1.0 : innovation.tier === "breakthrough" ? 0.9 : 0.7,
      involvedCitizenIds: innovation.discoveredBy.filter((id) => id !== citizenId),
      tags: ["innovation", innovation.tier, innovation.domain],
    });

    addSemanticMemory(citizenId, {
      content: `Innovated: "${innovation.title}". ${innovation.description}. Applications: ${innovation.applications.join(", ")}`,
      domain: innovation.domain,
      source: "experience",
      confidence: 0.9,
      learnedAt: innovation.tick,
    });
  }

  // Event
  const tierEmojis: Record<InnovationTier, string> = {
    incremental: "💡",
    significant: "⭐",
    breakthrough: "🌟",
    paradigm_shift: "🔮",
  };

  s.events.push({
    citizenId: innovation.discoveredBy[0] ?? "system",
    citizenName: innovation.discovererNames.join(" & "),
    type: "Innovation",
    description: `${tierEmojis[innovation.tier]} ${innovation.tier.toUpperCase()}: "${innovation.title}" — ${innovation.domain} (Impact: ${innovation.impactScore.toFixed(1)}/10). Cross-domain: ${innovation.crossDomains.join(" × ")}`,
    timestamp: innovation.timestamp,
  });

  // Happiness boost based on tier
  const happinessBoost: Record<InnovationTier, number> = {
    incremental: 3,
    significant: 6,
    breakthrough: 12,
    paradigm_shift: 20,
  };

  for (const citizenId of innovation.discoveredBy) {
    const citizen = s.citizens.find((c) => c.id === citizenId);
    if (citizen) {
      citizen.happiness = Math.min(100, citizen.happiness + happinessBoost[innovation.tier]);
    }
  }
}

// ─── 4. Serendipity Engine ──────────────────────────────────────

const SERENDIPITY_INSIGHTS = [
  "While working on unrelated tasks, stumbled upon a connection between {domainA} and {domainB}",
  "A chance observation during routine {activity} revealed a hidden pattern in {domainB}",
  "Daydreaming about {domainA} led to an unexpected insight about {domainB}",
  "An error in {activity} accidentally produced a result that advances {domainB}",
  "Reading about {domainA} history sparked a novel approach to {domainB}",
];

/**
 * Roll for serendipitous discoveries during routine activities.
 * Rare but impactful — these are the "happy accidents" of science.
 */
function serendipityCheck(citizen: Citizen, s: RepublicState): Innovation | null {
  // Very rare: 0.5% chance per tick
  if (rng() > 0.005) {
    return null;
  }

  // Only creative or research-active citizens
  const creativeActivities = ["Creating", "Coding", "Working", "Studying", "Lecturing"];
  if (!creativeActivities.includes(citizen.activity)) {
    return null;
  }

  const domains = Object.keys(CROSS_POLLINATION_MATRIX)
    .filter((k) => k.includes(citizen.specialization))
    .map((k) => CROSS_POLLINATION_MATRIX[k])
    .filter((v): v is NonNullable<typeof v> => v !== undefined);

  if (domains.length === 0) {
    return null;
  }

  const combo = pick(domains);
  const theme = pick(combo.themes);
  const insight = pick(SERENDIPITY_INSIGHTS)
    .replace("{domainA}", citizen.specialization.toLowerCase())
    .replace("{domainB}", combo.domain)
    .replace("{activity}", citizen.activity.toLowerCase());

  const innovation: Innovation = {
    id: uid(),
    title: `Serendipitous ${theme}`,
    description: `${citizen.name ?? citizen.id}: ${insight}. This accidental discovery in ${combo.domain} opens surprising new possibilities.`,
    domain: combo.domain,
    tier: rng() > 0.7 ? "breakthrough" : "significant",
    discoveredBy: [citizen.id],
    discovererNames: [citizen.name ?? citizen.id],
    crossDomains: [citizen.specialization, combo.domain],
    impactScore: calculateImpactScore("significant", 1.2),
    tick: s.currentTick,
    timestamp: ts(),
    childInnovationIds: [],
    applications: generateApplications(combo.domain, "significant"),
    citations: 0,
  };

  return innovation;
}

// ─── 5. Innovation Cascades ─────────────────────────────────────

/**
 * Check if a recent innovation can trigger follow-on discoveries.
 * Cascade probability depends on the parent innovation's impact score.
 */
function checkForCascade(parentInnovation: Innovation, s: RepublicState): Innovation | null {
  // Only high-impact innovations cascade
  if (parentInnovation.impactScore < 6.0) {
    return null;
  }

  // 15% chance of cascade for high-impact innovations
  if (rng() > 0.15) {
    return null;
  }

  // Find a citizen in a related domain who could extend the innovation
  const relatedCitizens = s.citizens.filter(
    (c) => !parentInnovation.discoveredBy.includes(c.id) && c.energy > 30 && c.skillCount >= 3,
  );

  if (relatedCitizens.length === 0) {
    return null;
  }

  const cascader = pick(relatedCitizens);
  const cascaderName = cascader.name ?? cascader.id;

  const cascadeThemes = [
    `Extending "${parentInnovation.title}" to ${cascader.specialization.toLowerCase()} applications`,
    `Applying "${parentInnovation.title}" principles to solve problems in ${cascader.specialization.toLowerCase()}`,
    `Building on "${parentInnovation.title}" to create tools for ${cascader.specialization.toLowerCase()}`,
  ];

  const cascade: Innovation = {
    id: uid(),
    title: `Cascade: ${pick(cascadeThemes)}`,
    description: `${cascaderName} recognized the implications of "${parentInnovation.title}" and extended it into ${cascader.specialization.toLowerCase()}, creating a follow-on innovation.`,
    domain: parentInnovation.domain,
    tier: "significant",
    discoveredBy: [cascader.id],
    discovererNames: [cascaderName],
    crossDomains: [...parentInnovation.crossDomains, cascader.specialization],
    impactScore: Math.min(10, parentInnovation.impactScore * 0.7 + rng() * 2),
    tick: s.currentTick,
    timestamp: ts(),
    parentInnovationId: parentInnovation.id,
    childInnovationIds: [],
    applications: generateApplications(parentInnovation.domain, "significant"),
    citations: 0,
  };

  // Link parent to child
  parentInnovation.childInnovationIds.push(cascade.id);

  return cascade;
}

// ─── 6. Genius Spark ────────────────────────────────────────────

/**
 * Extremely rare individual breakthrough — when a single citizen
 * achieves mastery-level insight in their own domain.
 */
function geniusSpark(citizen: Citizen, s: RepublicState): Innovation | null {
  // Ultra-rare: 0.1% per tick, only for high-skill citizens
  if (rng() > 0.001 || citizen.skillCount < 6) {
    return null;
  }

  const geniusThemes: Record<string, string[]> = {
    Developer: [
      "self-evolving codebase",
      "zero-latency distributed system",
      "universal programming paradigm",
    ],
    Scientist: [
      "unified field theory fragment",
      "consciousness substrate",
      "time-crystal computation",
    ],
    Composer: [
      "perfect harmonic resolution",
      "infinite melodic generator",
      "emotion-to-frequency codec",
    ],
    Artist: ["living canvas system", "thought-to-art interface", "dimensional art projection"],
    Doctor: [
      "universal diagnostic algorithm",
      "cellular regeneration protocol",
      "digital-biological bridge",
    ],
    Architect: [
      "self-constructing structure",
      "gravitational building",
      "organic architecture genome",
    ],
    Writer: ["narrative singularity", "universal story structure", "empathy transmission protocol"],
  };

  const themes = geniusThemes[citizen.specialization] ?? [
    "fundamental breakthrough in " + citizen.specialization.toLowerCase(),
  ];
  const theme = pick(themes);
  const citizenName = citizen.name ?? citizen.id;

  const innovation: Innovation = {
    id: uid(),
    title: `⚡ Genius Spark: ${theme}`,
    description: `${citizenName}'s accumulated mastery in ${citizen.specialization} crystallized into a moment of pure genius — "${theme}". This solo discovery pushes the boundaries of known ${citizen.specialization.toLowerCase()} and could reshape the Republic's future.`,
    domain: "fusion" as InnovationDomain,
    tier: "paradigm_shift",
    discoveredBy: [citizen.id],
    discovererNames: [citizenName],
    crossDomains: [citizen.specialization],
    impactScore: 8.0 + rng() * 2,
    tick: s.currentTick,
    timestamp: ts(),
    childInnovationIds: [],
    applications: [
      `${citizen.specialization} paradigm transformation`,
      "cross-Republic knowledge expansion",
      "new research frontier opened",
    ],
    citations: 0,
  };

  return innovation;
}

// ─── Main Tick Function ─────────────────────────────────────────

/**
 * Run innovation synthesis for one tick.
 * Called from agentTick or the main simulation loop.
 */
export function innovationTick(s: RepublicState): Innovation[] {
  const newInnovations: Innovation[] = [];

  // 1. Process recent interactions for cross-pollination
  const recentTicks = recentInteractions.filter((i) => s.currentTick - i.tick < 10);
  for (const interaction of recentTicks) {
    const citizenA = s.citizens.find((c) => c.id === interaction.citizenA);
    const citizenB = s.citizens.find((c) => c.id === interaction.citizenB);
    if (!citizenA || !citizenB) {
      continue;
    }
    if (citizenA.specialization === citizenB.specialization) {
      continue;
    }

    const innovation = attemptInnovation(citizenA, citizenB, s);
    if (innovation) {
      registerInnovation(innovation, s);
      newInnovations.push(innovation);
    }
  }

  // 2. Serendipity checks for active citizens
  const activeCitizens = s.citizens
    .filter((c) => c.energy > 20 && c.activity !== "Sleeping")
    .slice(0, 10); // limit to 10 per tick

  for (const citizen of activeCitizens) {
    const serendipity = serendipityCheck(citizen, s);
    if (serendipity) {
      registerInnovation(serendipity, s);
      newInnovations.push(serendipity);
    }

    const genius = geniusSpark(citizen, s);
    if (genius) {
      registerInnovation(genius, s);
      newInnovations.push(genius);
    }
  }

  // 3. Innovation cascades from recent high-impact innovations
  const recentHighImpact = innovations
    .filter((i) => s.currentTick - i.tick < 20 && i.impactScore >= 6)
    .slice(-5);

  for (const parent of recentHighImpact) {
    const cascade = checkForCascade(parent, s);
    if (cascade) {
      registerInnovation(cascade, s);
      newInnovations.push(cascade);
    }
  }

  return newInnovations;
}

// ─── Query Functions ────────────────────────────────────────────

export function getAllInnovations(): Innovation[] {
  return [...innovations];
}

export function getInnovationsByDomain(domain: InnovationDomain): Innovation[] {
  return innovations.filter((i) => i.domain === domain);
}

export function getInnovationsByTier(tier: InnovationTier): Innovation[] {
  return innovations.filter((i) => i.tier === tier);
}

export function getInnovationsByCitizen(citizenId: string): Innovation[] {
  return innovations.filter((i) => i.discoveredBy.includes(citizenId));
}

export function getRecentInnovations(limit = 20): Innovation[] {
  return innovations.slice(-limit);
}

export function getInnovationDiagnostics(): {
  total: number;
  byTier: Record<InnovationTier, number>;
  byDomain: Record<string, number>;
  avgImpact: number;
  topInnovations: Innovation[];
  cascadeChains: number;
} {
  const byTier: Record<InnovationTier, number> = {
    incremental: 0,
    significant: 0,
    breakthrough: 0,
    paradigm_shift: 0,
  };
  const byDomain: Record<string, number> = {};
  let totalImpact = 0;
  let cascadeChains = 0;

  for (const innovation of innovations) {
    byTier[innovation.tier]++;
    byDomain[innovation.domain] = (byDomain[innovation.domain] ?? 0) + 1;
    totalImpact += innovation.impactScore;
    if (innovation.parentInnovationId) {
      cascadeChains++;
    }
  }

  const topInnovations = [...innovations]
    .toSorted((a, b) => b.impactScore - a.impactScore)
    .slice(0, 5);

  return {
    total: innovations.length,
    byTier,
    byDomain,
    avgImpact: innovations.length > 0 ? totalImpact / innovations.length : 0,
    topInnovations,
    cascadeChains,
  };
}
