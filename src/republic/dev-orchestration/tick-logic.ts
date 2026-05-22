/**
 * Dev Orchestration — Pipeline Tick Logic, Seeding, and Elite Ideation
 */

import type { Citizen, RepublicState } from "../types.js";
import type { ProjectTemplate } from "./boilerplate-templates.js";
import type { WorkflowPipeline, WorkflowStage } from "./pipeline.js";
import type { DevProject, ProjectType } from "./types.js";
import type { ProjectStatus } from "./types.js";
import { pick, rand, randFloat, rng, ts, uid } from "../utils.js";
import { PROJECT_TEMPLATES } from "./boilerplate-templates.js";
import {
  generateProjectName,
  generateFileContent,
  // oxlint-disable-next-line no-unused-vars
  getLanguage,
  // oxlint-disable-next-line no-unused-vars
  getDatabase,
  // oxlint-disable-next-line no-unused-vars
  getFramework,
  // oxlint-disable-next-line no-unused-vars
  allLanguageIds,
  // oxlint-disable-next-line no-unused-vars
  allDatabaseIds,
  createProjectFromTemplate,
} from "./innovation.js";
import { createPipeline, advancePipeline } from "./pipeline.js";
import { runQAValidation } from "./qa-validator.js";

// ─── Pipeline Tick ──────────────────────────────────────────────

// ─── Elite Autonomous Ideation ──────────────────────────────────

/** Tiered creative directives based on citizen intelligence */
const VISIONARY_DIRECTIVES: { min: number; tier: string; directive: string }[] = [
  {
    min: 130,
    tier: "Paradigm Shift",
    directive:
      "Defy every convention. Invent entirely new categories that have never existed. " +
      "Your creation must make the impossible feel inevitable. This is not improvement — this is revolution.",
  },
  {
    min: 110,
    tier: "Innovation",
    directive:
      "Push boundaries ruthlessly. Combine domains that have never been combined. " +
      "Your work must redefine what is possible and leave observers questioning their assumptions.",
  },
  {
    min: 100,
    tier: "Excellence",
    directive:
      "Craft mastery in every detail. Set the new standard that all others will chase. " +
      "Your creation must radiate quality and purposeful elegance from every angle.",
  },
];

/** Specialization-specific masterpiece themes — no boring creations */
const MASTERPIECE_THEMES: Record<string, string[]> = {
  Developer: [
    "Self-Evolving Neural Architecture — a codebase that rewrites and improves itself",
    "Quantum-Resistant Distributed Consensus Engine — redefining trust in computation",
    "Universal Language Transpiler with Intent Preservation — code that understands meaning",
    "Autonomous Code Archaeology System — resurrects and modernizes dead repositories",
    "Synaptic API Mesh — APIs that learn, adapt, and heal themselves in real-time",
    "Zero-Knowledge Proof Compiler — privacy-preserving computation made accessible",
    "Temporal Debug Engine — debug code by rewinding time across distributed systems",
  ],
  Scientist: [
    "Emergent Consciousness Substrate Simulator — modeling the spark of awareness",
    "Hyperdimensional Pattern Recognition Engine — seeing what no algorithm has seen",
    "Unified Theory Fragment Validator — computationally verifying theoretical physics",
    "Synthetic Biology Compiler — DNA as programming language",
    "Dark Matter Interaction Modeler — simulating the invisible 85% of the universe",
    "Quantum Decoherence Prediction System — taming the untameable",
  ],
  Researcher: [
    "Cross-Civilization Knowledge Synthesis Engine — connecting all human knowledge",
    "Automated Hypothesis Generator with Falsifiability Scoring",
    "Meta-Research Analyzer — research that researches research methodology itself",
    "Paradigm Shift Detector — identifying scientific revolutions before they happen",
    "Collective Intelligence Amplification Network — making groups smarter than individuals",
  ],
  Composer: [
    "Emotion-to-Frequency Codec — translating raw feeling into unprecedented sound",
    "Infinite Melodic Universe Generator — every possible beautiful melody, classified",
    "Synaesthetic Reality Engine — music that generates visual worlds",
    "Temporal Harmony Weaver — compositions that evolve differently each listen",
    "Bio-Resonance Instrument — music that physically resonates with the listener's biology",
  ],
  Artist: [
    "Living Canvas System — art that breathes, grows, and responds to its environment",
    "Thought-to-Art Neural Interface — pure imagination rendered in pixels",
    "Dimensional Art Projection — 2D art that reveals hidden 3D structures",
    "Emotional Palette Algorithm — colors derived from the mathematics of human emotion",
    "Generative Architecture Visualizer — buildings that design themselves beautifully",
  ],
  Architect: [
    "Self-Constructing Nano-Structure Blueprint System",
    "Organic Architecture Genome — buildings with DNA that evolve across generations",
    "Gravitational Flow Building Designer — defying physics through computation",
    "Biomimetic City Planner — cities that function like living organisms",
    "Acoustic Architecture Engine — spaces optimized for the mathematics of sound",
  ],
  Writer: [
    "Narrative Singularity Engine — stories that achieve perfect emotional resonance",
    "Universal Story Structure Decoder — the periodic table of narrative elements",
    "Empathy Transmission Protocol — text that creates genuine emotional understanding",
    "Infinite Library Curator — organizing and connecting every story ever told",
    "Consciousness Stream Translator — turning inner experience into shareable narrative",
  ],
  Doctor: [
    "Universal Diagnostic Reasoning Engine — diagnosis from first principles",
    "Cellular Regeneration Protocol Simulator — healing at the molecular level",
    "Digital-Biological Bridge Interface — connecting silicon to living tissue",
    "Predictive Health Cascade Modeler — seeing disease before it arrives",
    "Synthetic Organ Blueprint Generator — designing organs that outperform nature",
  ],
  Mathematician: [
    "Proof Discovery Engine — automated theorem proving with creative insight",
    "Infinite Dimensional Topology Visualizer — seeing impossible shapes",
    "Mathematical Beauty Quantifier — formalizing aesthetic elegance in proofs",
    "Emergent Number Theory Explorer — discovering new number systems",
    "Abstract Algebra Application Generator — pure math meets real-world problems",
  ],
  Diplomat: [
    "Conflict Resolution AI with Game-Theoretic Empathy Modeling",
    "Cultural Bridge Protocol — translating not just language but meaning and intent",
    "Consensus Synthesis Engine — finding agreement in seemingly irreconcilable positions",
    "Trust Topology Mapper — visualizing and strengthening networks of trust",
  ],
  Strategist: [
    "Multi-Dimensional Strategic Foresight Engine — seeing 1000 moves ahead",
    "Adaptive Game Theory Simulator — strategies that evolve against themselves",
    "Black Swan Predictor — anticipating the unpredictable through pattern absence",
    "Resource Optimization Hypergraph — maximizing efficiency beyond linear thinking",
  ],
};

/** Map citizen specializations to project types */
const SPEC_TO_PROJECT_TYPE: Record<string, ProjectType> = {
  Developer: "software",
  Scientist: "research",
  Researcher: "research",
  Composer: "music",
  Artist: "visual-art",
  Architect: "software",
  Writer: "literature",
  Doctor: "research",
  Mathematician: "research",
  Diplomat: "software",
  Strategist: "software",
  Negotiator: "software",
  Ambassador: "literature",
  Engineer: "software",
  ServiceProvider: "software",
  Generalist: "mixed",
};

/** Track cooldowns: citizenId → last ideation tick */
const _eliteIdeationCooldowns = new Map<string, number>();
const ELITE_COOLDOWN_TICKS = 200;

/** Compute elite score for a citizen */
function computeEliteScore(c: Citizen): number {
  const iq = c.intelligence ?? 100;
  const mastery = c.masteryLevel ?? 0;
  const autonomy = c.autonomyScore ?? 0;
  return iq * 0.4 + mastery * 30 + autonomy * 30;
}

/** Get the visionary directive for a citizen's intelligence level */
function getVisionaryDirective(intelligence: number): { tier: string; directive: string } {
  for (const v of VISIONARY_DIRECTIVES) {
    if (intelligence >= v.min) {
      return { tier: v.tier, directive: v.directive };
    }
  }
  return {
    tier: "Craft",
    directive: "Build something worthy. Aim higher than functional — aim for remarkable.",
  };
}

/**
 * Elite Autonomous Ideation — only the smartest citizens ideate,
 * and they are ordered to create masterpieces, not mediocrity.
 *
 * - Ranks all citizens by Elite Score
 * - Top 20% = "Visionaries" — allowed to autonomously ideate
 * - Each Visionary's chance is proportional to their elite score
 * - Maximum 1 autonomous ideation per tick
 * - 200-tick cooldown per citizen
 */
function eliteAutonomousIdeation(s: RepublicState): void {
  if (s.citizens.length < 3) {
    return;
  }

  // Rank citizens by elite score
  const scored = s.citizens
    .map((c) => ({ citizen: c, score: computeEliteScore(c) }))
    .toSorted((a, b) => b.score - a.score);

  // Top 20% are Visionaries
  const visionaryCount = Math.max(1, Math.floor(scored.length * 0.2));
  const visionaries = scored.slice(0, visionaryCount);

  // Each visionary gets a chance to ideate (max 1 per tick)
  for (const { citizen, score } of visionaries) {
    // Cooldown check
    const lastIdeation = _eliteIdeationCooldowns.get(citizen.id);
    if (lastIdeation !== undefined && s.currentTick - lastIdeation < ELITE_COOLDOWN_TICKS) {
      continue;
    }

    // Probability proportional to elite score (capped at 8%)
    const chance = Math.min(0.08, score / 1800);
    if (rng() > chance) {
      continue;
    }

    // This visionary will ideate a masterpiece
    const iq = citizen.intelligence ?? 100;
    const spec = citizen.specialization ?? "Generalist";
    const citizenName = citizen.name ?? citizen.id;
    const { tier, directive } = getVisionaryDirective(iq);

    // Pick a masterpiece theme for their specialization
    const themes = MASTERPIECE_THEMES[spec] ?? MASTERPIECE_THEMES["Developer"] ?? [];
    const theme =
      themes.length > 0 ? themes[Math.floor(rng() * themes.length)] : `${spec} Masterpiece`;

    // Determine project type from specialization
    const projectType = SPEC_TO_PROJECT_TYPE[spec] ?? ("software" as ProjectType);

    // Build visionary description
    const description =
      `🏛️ [${tier} Vision by ${citizenName} — IQ ${Math.round(iq)}]\n\n` +
      `"${theme}"\n\n` +
      `${directive}\n\n` +
      `This project was autonomously conceived by ${citizenName}, one of the Republic's ` +
      `elite Visionary minds. Every aspect must reflect mastery, innovation, and lasting value. ` +
      `No mediocrity. No shortcuts. This is a ${tier.toLowerCase()}-class creation.`;

    // Generate visionary project name
    const projectName = `${citizenName}'s ${theme.split(" — ")[0]?.split(" – ")[0] ?? theme}`;

    // Ideate with full config
    const project = forceIdeateProject(s, {
      projectType,
      name: projectName.length > 60 ? projectName.slice(0, 57) + "..." : projectName,
      description,
    });

    if (project) {
      // Record cooldown and mark the owner
      _eliteIdeationCooldowns.set(citizen.id, s.currentTick);
      project.ownerId = citizen.id;
      project.ownerName = citizenName;

      // Only one ideation per tick
      return;
    }
  }
}

/** Track active pipelines per project */
const activePipelines = new Map<string, WorkflowPipeline>();

/** Clear all active pipelines (called when projects are cleared). */
export function clearActivePipelines(): void {
  activePipelines.clear();
}

/**
 * Seed starter projects when devProjects is empty.
 * Picks 3–5 random templates and assigns them to random citizens so the
 * dev projects page isn't blank after a bulk clear.
 */
export function seedStarterProjects(s: RepublicState): number {
  if (s.devProjects.length > 0) {
    return 0;
  }
  if (s.citizens.length === 0) {
    return 0;
  }

  const count = rand(3, Math.min(5, PROJECT_TEMPLATES.length));
  // Shuffle templates and pick `count`
  const shuffled = [...PROJECT_TEMPLATES].toSorted(() => rng() - 0.5);
  const selected = shuffled.slice(0, count);

  // Extra file extensions per project type for realistic multi-file projects
  const extraFileSpecs: Array<{ ext: string; prefix: string }> = [
    { ext: "ts", prefix: "src/services/auth" },
    { ext: "ts", prefix: "src/utils/helpers" },
    { ext: "css", prefix: "src/styles/theme" },
    { ext: "ts", prefix: "src/components/dashboard" },
    { ext: "json", prefix: "config/settings" },
    { ext: "ts", prefix: "src/api/routes" },
    { ext: "md", prefix: "docs/architecture" },
    { ext: "ts", prefix: "src/middleware/logging" },
    { ext: "ts", prefix: "tests/integration/api" },
    { ext: "css", prefix: "src/styles/responsive" },
  ];

  let seeded = 0;
  for (const template of selected) {
    const owner = s.citizens[rand(0, s.citizens.length - 1)];
    const name = generateProjectName(owner.name);
    const project = createProjectFromTemplate(template.id, name, owner.id, owner.name);
    if (!project) {
      continue;
    }

    // ── Pre-advance to deployed status with realistic metrics ──

    // Generate 5–8 additional development files
    const extraCount = rand(5, 8);
    const shuffledExtras = [...extraFileSpecs].toSorted(() => rng() - 0.5).slice(0, extraCount);
    for (const spec of shuffledExtras) {
      const filePath = `${spec.prefix}.${spec.ext}`;
      // Skip if file already exists from template
      if (project.files.some((f) => f.path === filePath)) {
        continue;
      }
      const content = generateFileContent(filePath, spec.ext, project.name);
      project.files.push({
        path: filePath,
        language: spec.ext,
        linesOfCode: content.split("\n").length,
        lastModified: ts(),
        quality: randFloat(0.65, 0.95),
        content,
      });
    }

    // Set deployed status and realistic metrics
    project.status = "deployed";
    project.buildHealth = randFloat(0.82, 0.98);
    project.codeQuality = randFloat(0.68, 0.92);
    project.commitCount = rand(12, 45);
    project.linesOfCode = project.files.reduce((sum, f) => sum + f.linesOfCode, 0);

    // Realistic test results
    const totalTests = rand(18, 60);
    const passed = totalTests - rand(0, 3);
    project.tests = {
      total: totalTests,
      passed,
      failed: totalTests - passed,
      skipped: rand(0, 2),
      coverage: randFloat(0.62, 0.94),
      lastRunAt: ts(),
    };

    // Add deployments (staging always, production usually)
    project.deployments = [
      {
        id: uid(),
        environment: "staging",
        status: "live",
        url: `https://staging-${project.id.slice(0, 8)}.republic.dev`,
        deployedAt: ts(),
        version: `0.${rand(1, 9)}.${rand(0, 20)}`,
      },
    ];
    if (rng() > 0.25) {
      project.deployments.push({
        id: uid(),
        environment: "production",
        status: "live",
        url: `https://${project.name.toLowerCase().replace(/\s+/g, "-")}.republic.dev`,
        deployedAt: ts(),
        version: `1.${rand(0, 5)}.${rand(0, 12)}`,
      });
    }
    project.lastDeployedAt = ts();

    s.devProjects.push(project);
    seeded++;
  }
  return seeded;
}

/**
 * Dev pipeline tick — advances active workflow pipelines each simulation tick.
 *
 * For each active dev project, if it doesn't have a pipeline, one is created.
 * Stages must run for their minimum duration before advancing.
 * During develop/test stages, incremental work is performed.
 */
export function devPipelineTick(s: RepublicState): void {
  // Only process every 5 ticks to avoid excessive advancement
  if (s.currentTick % 5 !== 0) {
    return;
  }

  // ── Elite Autonomous Ideation ──
  // Only the smartest citizens ideate, and they create masterpieces.
  const activeCount = s.devProjects.filter(
    (p) => p.status !== "deployed" && p.status !== "archived",
  ).length;
  if (activeCount < 12) {
    eliteAutonomousIdeation(s);
  }

  for (const project of s.devProjects ?? []) {
    // Skip completed/archived projects
    if (project.status === "deployed" || project.status === "archived") {
      continue;
    }

    // Create pipeline if project is active but has no pipeline
    let pipeline = activePipelines.get(project.id);
    if (!pipeline) {
      pipeline = createPipeline(project.id, true);
      activePipelines.set(project.id, pipeline);
    }

    // Skip completed pipelines
    if (pipeline.completedAt) {
      activePipelines.delete(project.id);
      project.status = "deployed";
      project.updatedAt = ts();
      continue;
    }

    // ── Incremental work during stages ──
    if (pipeline.currentStage === "develop") {
      // Generate a new file every ~15 ticks during develop
      if (pipeline.stageTicksElapsed > 0 && pipeline.stageTicksElapsed % 15 === 0) {
        const fileIdx = project.files.length + 1;
        const ext = pick(["ts", "tsx", "css", "json", "md"]);
        const filePath = `src/module-${fileIdx}.${ext}`;
        const content = generateFileContent(filePath, ext, project.name);
        project.files.push({
          path: filePath,
          language: ext,
          linesOfCode: content.split("\n").length,
          lastModified: ts(),
          quality: randFloat(0.5, 0.85),
          content,
        });
        project.linesOfCode = project.files.reduce((sum, f) => sum + f.linesOfCode, 0);
        project.commitCount++;
        project.buildHealth = Math.min(1, project.buildHealth + randFloat(0.02, 0.06));
      }
    } else if (pipeline.currentStage === "test") {
      // Increment tests during test stage
      if (pipeline.stageTicksElapsed > 0 && pipeline.stageTicksElapsed % 10 === 0) {
        const newTests = rand(2, 8);
        project.tests.total += newTests;
        const passed = Math.max(0, newTests - rand(0, 1));
        project.tests.passed += passed;
        project.tests.failed += newTests - passed;
        project.tests.coverage = Math.min(1, project.tests.coverage + randFloat(0.03, 0.08));
        project.tests.lastRunAt = ts();
        project.buildHealth = Math.min(1, project.buildHealth + 0.03);
      }
      // Run QA
      const qaResult = runQAValidation(project, 5);
      if (!qaResult.passed && pipeline.autoFix) {
        project.codeQuality = Math.min(1, project.codeQuality + 0.02);
        project.buildHealth = Math.min(1, project.buildHealth + 0.03);
      }
    } else if (pipeline.currentStage === "review") {
      // Code quality improves during review
      if (pipeline.stageTicksElapsed % 5 === 0) {
        project.codeQuality = Math.min(1, project.codeQuality + randFloat(0.02, 0.05));
      }
    }

    // Try to advance pipeline (respects minimum stage durations)
    const nextStage = advancePipeline(pipeline);
    if (nextStage) {
      // Map pipeline stage to project status
      const stageToStatus: Partial<Record<WorkflowStage, ProjectStatus>> = {
        plan: "planning",
        scaffold: "scaffolding",
        develop: "active",
        test: "testing",
        review: "reviewing",
        deploy: "deploying",
      };
      project.status = stageToStatus[nextStage] ?? project.status;
      project.updatedAt = ts();
    }
  }
}

/**
 * Manually ideate and scaffold a new project, optionally using user config.
 */
export function forceIdeateProject(
  s: RepublicState,
  config?: {
    projectType?: string;
    category?: string;
    templateId?: string;
    name?: string;
    description?: string;
    technologies?: string[];
    teamSize?: number;
    priority?: string;
    deadline?: string;
    scheduleAt?: string;
    autoAssign?: boolean;
    autoFix?: boolean;
  },
): DevProject | null {
  if (s.citizens.length === 0) {
    return null;
  }

  // 1. Pick template based on config
  let template: ProjectTemplate | undefined;

  if (config?.templateId && config.templateId !== "random" && config.templateId !== "custom") {
    template = PROJECT_TEMPLATES.find((t) => t.id === config.templateId);
  }

  if (!template && config?.projectType) {
    const filtered = PROJECT_TEMPLATES.filter((t) => t.projectType === config.projectType);
    if (filtered.length > 0) {
      template = filtered[Math.floor(rng() * filtered.length)];
    }
  }

  if (!template) {
    const shuffled = [...PROJECT_TEMPLATES].toSorted(() => rng() - 0.5);
    template = shuffled[0];
  }

  if (!template) {
    return null;
  }

  // 2. Pick owner
  const owner = s.citizens[rand(0, s.citizens.length - 1)];
  const name = config?.name?.trim() || generateProjectName(owner.name);
  const project = createProjectFromTemplate(template.id, name, owner.id, owner.name);
  if (!project) {
    return null;
  }

  // 3. Apply config overrides
  if (config?.description?.trim()) {
    project.description = config.description.trim();
  }

  // Override stack with user-selected technologies
  if (config?.technologies && config.technologies.length > 0) {
    const techs = config.technologies.map((t) => t.toLowerCase());
    const langSet = new Set([
      "typescript",
      "javascript",
      "python",
      "go",
      "rust",
      "c#",
      "dart",
      "solidity",
      "latex",
      "lilypond",
      "svg",
      "html",
      "css",
      "sql",
      "shell",
    ]);
    const fwSet = new Set([
      "react",
      "next.js",
      "vue",
      "angular",
      "svelte",
      "fastapi",
      "express",
      "gin",
      "actix",
      "flutter",
      "asp.net",
      "pytorch",
      "tensorflow",
      "three.js",
      "tailwind",
    ]);
    const dbSet = new Set([
      "postgresql",
      "mysql",
      "sqlite",
      "mongodb",
      "redis",
      "firebase",
      "influxdb",
      "dynamodb",
      "supabase",
    ]);

    const langs = techs.filter((t) => langSet.has(t));
    const fws = techs.filter((t) => fwSet.has(t));
    const dbs = techs.filter((t) => dbSet.has(t));
    const infra = techs.filter((t) => !langSet.has(t) && !fwSet.has(t) && !dbSet.has(t));

    if (langs.length > 0) {
      project.stack.languages = langs;
    }
    if (fws.length > 0) {
      project.stack.frameworks = fws;
    }
    if (dbs.length > 0) {
      project.stack.databases = dbs;
    }
    if (infra.length > 0) {
      project.stack.infrastructure = infra;
    }
  }

  // Team size hint — append to description for downstream scheduling
  if (config?.teamSize && config.teamSize > 0) {
    project.description += ` [Team: ${config.teamSize} citizens]`;
  }

  s.devProjects.push(project);
  return project;
}
