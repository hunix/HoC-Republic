/**
 * Republic Platform — Utility Functions
 *
 * Shared helpers for random generation, naming, and data seeding.
 */

import { randomUUID } from "node:crypto";
import type { Activity, Citizen, Specialization } from "./types.js";

// ─── Name & Data Constants ──────────────────────────────────────

export const FIRST_NAMES = [
  "Aria",
  "Kael",
  "Luna",
  "Orion",
  "Nova",
  "Sage",
  "Zephyr",
  "Phoenix",
  "Atlas",
  "Lyra",
  "Cael",
  "Iris",
  "Raven",
  "Astra",
  "Silas",
  "Ember",
  "Kai",
  "Nyx",
  "Sol",
  "Vega",
  "Echo",
  "Thane",
  "Skye",
  "Rune",
  "Juno",
  "Blaze",
  "Wren",
  "Onyx",
  "Dusk",
  "Vale",
  "Ash",
  "Lux",
];

export const LAST_NAMES = [
  "Starweaver",
  "Ironforge",
  "Nightbloom",
  "Silvercrest",
  "Stormwind",
  "Brighthollow",
  "Deepstone",
  "Moonwhisper",
  "Sunfire",
  "Thornwall",
  "Shadowmere",
  "Goldleaf",
  "Frostpeak",
  "Dawnbringer",
  "Flamecrest",
  "Windwalker",
];

export const SPECIALIZATIONS: Specialization[] = [
  "Scientist",
  "Researcher",
  "Mathematician",
  "Engineer",
  "Developer",
  "Architect",
  "Doctor",
  "Psychologist",
  "Artist",
  "Musician",
  "Writer",
  "Diplomat",
  "Strategist",
  "Analyst",
  "Planner",
  "Librarian",
  "Farmer",
  "Manufacturer",
  "ServiceProvider",
  "Generalist",
  "HardwareTechnician",
  // Phase 50: Production-focused specializations
  "Filmmaker",
  "Composer",
  "WebDeveloper",
  "GameDeveloper",
  "DataScientist",
  "Designer",
  "DevOpsEngineer",
  "SecurityExpert",
  "ProductManager",
  "ContentCreator",
  // Phase 51: Game Development specializations
  "3DArtist",
  "2DArtist",
  "VFXArtist",
  "LevelDesigner",
  "SoundDesigner",
  "CinematicDirector",
  // Phase 53: Cinematic Production specializations
  "Colorist",
  "ProductionDesigner",
  "CastingDirector",
  "StuntCoordinator",
  // Phase 52: Advanced Tech & Sci-Fi Specs
  "QuantumAlgorithmDesigner",
  "QuantumHardwareEngineer",
  "PostQuantumCryptographer",
  "AIEthicist",
  "NeuroinformaticsEngineer",
  "SynbioEngineer",
  "Astrobotanist",
  "OrbitalTrafficController",
  "ExtraterrestrialHabitatDesigner",
  "HyperdimensionalDataScientist",
  "SentientMaterialsEngineer",
  "GenerativeAIArchitect",
  "BCISpecialist",
  "AIAssistedHealthcareTechnician",
  "AutonomousSystemsArchitect",
  "Nanotechnologist",
  "AstrobiologicalEngineer",
  "SpaceResourceExtractionSpecialist",
];

export const ACTIVITIES: Activity[] = [
  "Sleeping",
  "Eating",
  "Working",
  "Socializing",
  "Learning",
  "Resting",
  "Traveling",
  "Shopping",
  "Entertaining",
  "Idle",
  "Coding",
  "Scaffolding",
  "Testing",
  "Committing",
  "Debugging",
  "Reviewing",
];

export const SCROLL_TITLES = [
  "On the Nature of Quantum Coherence",
  "The Art of Distributed Consensus",
  "Principles of Autonomous Governance",
  "Neural Architectures: A Survey",
  "Economic Equilibrium in Simulated Societies",
  "Memory and Identity in AI Systems",
  "Ethical Frameworks for Synthetic Citizens",
  "The Atlantean Knowledge Protocol",
];

/** Skill trees per specialization — citizens learn named skills from their tree */
export const SKILL_TREES: Record<string, string[]> = {
  Scientist: [
    "hypothesis testing",
    "data analysis",
    "peer review",
    "experiment design",
    "statistical modeling",
    "publication",
    "recursive learning",
  ],
  Researcher: [
    "literature review",
    "field study",
    "survey design",
    "qualitative analysis",
    "grant writing",
    "meta-analysis",
  ],
  Mathematician: [
    "proof writing",
    "linear algebra",
    "calculus",
    "number theory",
    "topology",
    "combinatorics",
  ],
  Engineer: [
    "systems design",
    "prototyping",
    "testing",
    "optimization",
    "CAD modeling",
    "materials science",
  ],
  Developer: [
    "algorithms",
    "debugging",
    "code review",
    "architecture",
    "testing automation",
    "deployment",
    "frontend development",
    "backend development",
    "api design",
    "database management",
    "DevOps",
    "system design",
    "microservices",
    "performance optimization",
    "security analysis",
    "mobile development",
    "cloud architecture",
    "CI/CD pipelines",
  ],
  Architect: [
    "blueprinting",
    "structural analysis",
    "space planning",
    "sustainability design",
    "project management",
    "zoning",
  ],
  Doctor: [
    "diagnosis",
    "treatment planning",
    "surgery",
    "pharmacology",
    "patient care",
    "medical research",
  ],
  Psychologist: [
    "behavioral analysis",
    "cognitive therapy",
    "assessment",
    "counseling",
    "group dynamics",
    "neuropsychology",
  ],
  Medic: ["first aid", "triage", "emergency response", "wound care", "CPR", "trauma assessment"],
  Artist: [
    "color theory",
    "composition",
    "sculpture",
    "digital art",
    "art history",
    "exhibition curation",
  ],
  Musician: [
    "music theory",
    "composition",
    "performance",
    "sound design",
    "arrangement",
    "music production",
  ],
  Writer: ["creative writing", "editing", "storytelling", "journalism", "poetry", "screenwriting"],
  Diplomat: [
    "negotiation",
    "conflict resolution",
    "international law",
    "cultural awareness",
    "public speaking",
    "treaty drafting",
  ],
  Negotiator: [
    "persuasion",
    "mediation",
    "contract law",
    "stakeholder management",
    "arbitration",
    "deal structuring",
  ],
  Ambassador: [
    "foreign relations",
    "protocol",
    "cross-cultural communication",
    "policy briefing",
    "alliance building",
    "public diplomacy",
  ],
  Strategist: [
    "risk assessment",
    "scenario planning",
    "competitive analysis",
    "decision frameworks",
    "game theory",
    "intelligence gathering",
    "convergence analysis",
  ],
  Analyst: [
    "data visualization",
    "pattern recognition",
    "forecasting",
    "regression analysis",
    "report writing",
    "dashboard design",
  ],
  Planner: [
    "resource allocation",
    "scheduling",
    "milestone tracking",
    "budgeting",
    "contingency planning",
    "workflow optimization",
  ],
  Librarian: [
    "cataloging",
    "information retrieval",
    "archiving",
    "metadata management",
    "digital preservation",
    "reference services",
  ],
  Farmer: [
    "crop rotation",
    "soil analysis",
    "irrigation",
    "pest management",
    "harvest optimization",
    "sustainable agriculture",
  ],
  Manufacturer: [
    "quality control",
    "process engineering",
    "supply chain",
    "lean manufacturing",
    "safety protocols",
    "inventory management",
  ],
  ServiceProvider: [
    "customer relations",
    "service design",
    "feedback analysis",
    "process improvement",
    "communication",
    "problem solving",
  ],
  Generalist: [
    "critical thinking",
    "adaptability",
    "collaboration",
    "time management",
    "problem solving",
    "self-directed learning",
  ],
  HardwareTechnician: [
    "circuit design",
    "soldering",
    "PCB layout",
    "embedded systems",
    "oscilloscope diagnostics",
    "power supply design",
    "sensor integration",
    "GPIO programming",
    "motor control",
    "3D printing",
    "CNC operation",
    "thermal management",
  ],
  // Phase 50: Production-focused specializations
  Filmmaker: [
    "scriptwriting",
    "cinematography",
    "video editing",
    "VFX compositing",
    "sound design",
    "directing",
    "color grading",
    "storyboarding",
  ],
  Composer: [
    "orchestration",
    "arrangement",
    "mixing",
    "mastering",
    "sound synthesis",
    "music theory advanced",
    "DAW production",
    "film scoring",
  ],
  WebDeveloper: [
    "HTML/CSS mastery",
    "React/Vue frameworks",
    "responsive design",
    "SEO optimization",
    "web performance",
    "accessibility (a11y)",
    "server-side rendering",
    "progressive web apps",
  ],
  GameDeveloper: [
    "game physics",
    "procedural generation",
    "shader programming",
    "level design",
    "multiplayer networking",
    "game AI",
    "asset pipeline",
    "playtesting",
    "babylon.js",
    "three.js",
    "phaser",
    "pixi.js",
    "webgpu",
    "webgl",
    "ecs-architecture",
    "pathfinding",
    "behavior-trees",
    "particle-systems",
    "skeletal-animation",
    "canvas-api",
  ],
  DataScientist: [
    "ML modeling",
    "data wrangling",
    "visualization",
    "statistical analysis",
    "feature engineering",
    "deep learning",
    "NLP",
    "experiment design",
  ],
  Designer: [
    "UI/UX design",
    "typography",
    "branding",
    "motion graphics",
    "wireframing",
    "prototyping",
    "design systems",
    "user research",
  ],
  DevOpsEngineer: [
    "CI/CD pipelines",
    "containerization",
    "Kubernetes",
    "infrastructure-as-code",
    "monitoring & alerting",
    "cloud architecture",
    "GitOps",
    "incident response",
    "cluster resilience",
    "fault isolation",
  ],
  SecurityExpert: [
    "penetration testing",
    "vulnerability assessment",
    "cryptography",
    "digital forensics",
    "threat modeling",
    "SIEM operations",
    "zero-trust architecture",
    "malware analysis",
    "threat intelligence",
    "osint fusion",
  ],
  ProductManager: [
    "roadmapping",
    "user research",
    "A/B testing",
    "metrics analysis",
    "stakeholder management",
    "go-to-market strategy",
    "backlog prioritization",
    "competitive analysis",
  ],
  ContentCreator: [
    "video production",
    "live streaming",
    "social media strategy",
    "copywriting",
    "SEO writing",
    "podcast production",
    "content analytics",
    "audience engagement",
  ],
  // Phase 51: Game Development specializations
  "3DArtist": [
    "babylon.js",
    "three.js",
    "3d-modeling",
    "pbr-materials",
    "texture-mapping",
    "rigging",
    "sculpting",
    "uv-unwrapping",
    "gltf-pipeline",
    "normal-map-baking",
  ],
  "2DArtist": [
    "pixi.js",
    "phaser",
    "sprite-animation",
    "tilemap-design",
    "canvas-api",
    "pixel-art",
    "character-design",
    "parallax-scrolling",
    "texture-atlas",
    "vector-illustration",
  ],
  VFXArtist: [
    "particle-systems",
    "shader-programming",
    "post-processing",
    "screen-effects",
    "webgpu",
    "gsap",
    "procedural-animation",
    "fluid-simulation",
    "bloom-effects",
    "trail-renderers",
  ],
  LevelDesigner: [
    "level-design",
    "world-building",
    "procedural-generation",
    "lighting-design",
    "environment-art",
    "game-balance",
    "playtesting",
    "spatial-audio",
    "collision-geometry",
    "nav-mesh",
  ],
  SoundDesigner: [
    "web-audio-api",
    "spatial-audio",
    "dynamic-soundtrack",
    "sfx-design",
    "audio-middleware",
    "mixing",
    "foley-recording",
    "adaptive-music",
    "howler.js",
    "tone.js",
  ],
  CinematicDirector: [
    "camera-systems",
    "cutscene-scripting",
    "motion-capture",
    "cinematic-lighting",
    "storyboarding",
    "timeline-editing",
    "camera-shake",
    "depth-of-field",
    "letterboxing",
    "dramatic-pacing",
  ],
  // Phase 53: Cinematic Production specializations
  Colorist: [
    "color-science",
    "lut-creation",
    "davinci-resolve",
    "hdr-grading",
    "scene-matching",
    "film-emulation",
    "color-space-management",
    "creative-look-development",
  ],
  ProductionDesigner: [
    "set-design",
    "art-direction",
    "visual-storytelling",
    "period-accuracy",
    "prop-sourcing",
    "moodboard-creation",
    "budget-management",
    "location-design",
  ],
  CastingDirector: [
    "talent-scouting",
    "audition-management",
    "chemistry-reading",
    "character-analysis",
    "voice-matching",
    "ensemble-building",
    "diversity-casting",
    "ai-face-generation",
  ],
  StuntCoordinator: [
    "action-choreography",
    "safety-rigging",
    "wire-work",
    "fight-design",
    "vehicle-stunts",
    "fall-coordination",
    "pyrotechnics",
    "motion-reference",
  ],
  // Phase 52: Advanced Tech & Sci-Fi Specs
  QuantumAlgorithmDesigner: [
    "qubit-error-correction",
    "shors-algorithm-tuning",
    "quantum-simulation",
    "quantum-machine-learning",
    "entanglement-routing",
    "hamiltonian-modeling",
  ],
  QuantumHardwareEngineer: [
    "cryogenics",
    "superconducting-circuits",
    "laser-cooling",
    "dilution-refrigerators",
    "quantum-dot-fabrication",
    "microwave-engineering",
  ],
  PostQuantumCryptographer: [
    "lattice-based-cryptography",
    "hash-based-signatures",
    "multivariate-cryptography",
    "isogeny-based-cryptography",
    "zero-knowledge-proofs",
    "quantum-key-distribution",
  ],
  AIEthicist: [
    "value-alignment",
    "algorithmic-fairness",
    "bias-mitigation",
    "explainable-ai",
    "ai-governance",
    "moral-philosophy",
    "cognitive auditing",
    "directive optimization",
  ],
  NeuroinformaticsEngineer: [
    "brain-computer-interfacing",
    "neural-time-series-analysis",
    "connectomics",
    "computational-neuroscience",
    "neuroprosthetics",
    "eeg-signal-processing",
  ],
  SynbioEngineer: [
    "crispr-splicing",
    "synthetic-metabolomics",
    "protein-engineering",
    "gene-circuit-design",
    "directed-evolution",
    "metabolic-flux-analysis",
  ],
  Astrobotanist: [
    "microgravity-botany",
    "closed-loop-ecosystems",
    "extraterrestrial-soil-adaptation",
    "radiation-resistant-crops",
    "hydroponics",
    "aeroponics",
  ],
  OrbitalTrafficController: [
    "orbital-mechanics",
    "collision-avoidance",
    "space-domain-awareness",
    "satellite-tracking",
    "kessler-syndrome-mitigation",
    "astrodynamics",
  ],
  ExtraterrestrialHabitatDesigner: [
    "radiation-shielding",
    "life-support-systems",
    "pressurized-architecture",
    "in-situ-resource-utilization",
    "lunar-regolith-printing",
    "gravity-simulation",
  ],
  HyperdimensionalDataScientist: [
    "hyperdimensional-computing",
    "vector-symbolic-architectures",
    "tensor-networks",
    "topological-data-analysis",
    "high-dimensional-geometry",
    "manifold-learning",
  ],
  SentientMaterialsEngineer: [
    "programmable-matter",
    "smart-polymers",
    "shape-memory-alloys",
    "metamaterials",
    "self-healing-materials",
    "piezoelectric-fabrics",
  ],
  GenerativeAIArchitect: [
    "diffusion-models",
    "transformer-architecture",
    "latent-space-manipulation",
    "multimodal-generation",
    "prompt-engineering",
    "rlhf",
  ],
  BCISpecialist: [
    "neural-decoding",
    "invasive-bci",
    "non-invasive-bci",
    "closed-loop-neuromodulation",
    "spike-sorting",
    "neurofeedback",
  ],
  AIAssistedHealthcareTechnician: [
    "ai-diagnostics",
    "robotic-surgery-assistance",
    "predictive-medicine",
    "wearable-health-monitoring",
    "telemedicine-platforms",
    "genomic-medicine",
  ],
  AutonomousSystemsArchitect: [
    "slam",
    "sensor-fusion",
    "path-planning",
    "swarm-robotics",
    "reinforcement-learning",
    "computer-vision",
  ],
  Nanotechnologist: [
    "molecular-manufacturing",
    "nanoscale-robotics",
    "carbon-nanotubes",
    "quantum-dots",
    "nanomedicine",
    "atomic-force-microscopy",
  ],
  AstrobiologicalEngineer: [
    "extremophile-cultivation",
    "biosignature-detection",
    "panspermia-modeling",
    "terraforming-simulation",
    "exoplanet-atmospheres",
    "xenobiology",
  ],
  SpaceResourceExtractionSpecialist: [
    "asteroid-mining",
    "lunar-ice-harvesting",
    "zero-g-metallurgy",
    "space-manufacturing",
    "propellant-production",
    "microgravity-drilling",
  ],
};

// ─── Random Helpers ─────────────────────────────────────────────

/**
 * Module-level seeded PRNG.  Every call to rand / randFloat / pick
 * goes through this single source so the simulation is reproducible
 * when the same seed is used.  Default seed is "republic-default";
 * call `setSeed()` to change it (e.g. when restoring a snapshot).
 */
let _rng = seededRandom("republic-default");

/** Re-seed the module PRNG (call after loading a snapshot). */
export function setSeed(seed: string): void {
  _rng = seededRandom(seed);
}

/** Expose the current PRNG for callers that need a raw [0,1) float. */
export function rng(): number {
  return _rng();
}

export function rand(min: number, max: number): number {
  return Math.floor(_rng() * (max - min + 1)) + min;
}

export function randFloat(min: number, max: number, decimals = 2): number {
  return parseFloat((_rng() * (max - min) + min).toFixed(decimals));
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(_rng() * arr.length)];
}

export function uid(): string {
  return randomUUID().slice(0, 8);
}

export function ts(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export function avg(nums: number[]): number {
  if (nums.length === 0) {return 0;}
  return parseFloat((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1));
}

// ─── Entity Generators ──────────────────────────────────────────

export function generateCitizen(generation = 1): Citizen {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const specialization = pick(SPECIALIZATIONS);
  const tree = SKILL_TREES[specialization] ?? SKILL_TREES.Generalist;
  const starterCount = rand(2, 5);
  const skills = tree.slice(0, starterCount);
  // Phase 40: Intelligence fields — higher base for thriving civilization
  const learningRate = 0.8 + rng() * 1.5; // 0.8 – 2.3
  const intelligence = Math.round(90 + rng() * 70); // 90 – 160
  const skillProficiency: Record<string, number> = {};
  for (const sk of skills) {
    skillProficiency[sk] = 0.15 + rng() * 0.4; // starter proficiency 0.15 – 0.55
  }
  return {
    id: uid(),
    name: `${first} ${last}`,
    generation,
    specialization,
    activity: pick(ACTIVITIES),
    energy: randFloat(60, 100),
    happiness: randFloat(60, 95),
    health: randFloat(70, 100),
    credits: rand(500, 50000),
    age: rand(1, 120),
    skillCount: skills.length,
    skills,
    familySize: rand(0, 6),
    skillProficiency,
    learningRate,
    intelligence,
    masteryLevel: 0,
    autonomyScore: 0.15 + rng() * 0.3, // start moderate
  };
}

// ─── Type Safety Helpers ────────────────────────────────────────

/** Exhaustive switch guard — compile error if a case is missing */
export function assertNever(x: never, msg?: string): never {
  throw new Error(msg ?? `Unexpected value: ${String(x)}`);
}

/** Wrap an async function with a timeout (ms). Rejects with TimeoutError if exceeded. */
export function rpcTimeout<T>(fn: () => Promise<T>, ms = 30_000): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`RPC timeout after ${ms}ms`)), ms),
    ),
  ]);
}

/** Deterministic PRNG seeded from a string — produces repeatable [0,1) floats */
export function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b) + 0x9e3779b9) | 0;
    h = Math.imul(h ^ (h >>> 13), 0x45d9f3b) | 0;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 0x100000000;
  };
}
