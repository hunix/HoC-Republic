/**
 * Republic Platform — Production Workflows Engine
 *
 * Phase 5: 12 domain-specific production pipelines that chain existing
 * republic tools and engines into multi-step creative workflows.
 *
 * Each pipeline breaks a project into phases ➜ milestones ➜ artifacts,
 * advancing across simulation ticks and recording tangible outputs
 * to citizen memory and the republic event stream.
 *
 * Pipelines:
 *  1. Software Factory        6. Medical Discovery     11. Documentary
 *  2. Music Studio            7. Education Content     12. Innovation Lab
 *  3. Film Production         8. Game Development
 *  4. Art Gallery             9. Literature
 *  5. Scientific Research    10. Architecture
 */

import { addEpisodicMemory, addSemanticMemory } from "./memory.js";
import type { Citizen, RepublicState } from "./types.js";
import { pick, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type PipelineId =
  | "software"
  | "music"
  | "film"
  | "art"
  | "research"
  | "medical"
  | "education"
  | "game"
  | "literature"
  | "architecture"
  | "documentary"
  | "innovation"
  | "gsd";

interface PipelinePhase {
  name: string;
  description: string;
  requiredSpecializations: string[];
  durationTicks: number;
  artifacts: string[];
}

interface PipelineDefinition {
  id: PipelineId;
  name: string;
  icon: string;
  phases: PipelinePhase[];
}

export interface ActiveWorkflow {
  id: string;
  pipelineId: PipelineId;
  projectId: string;
  projectName: string;
  currentPhase: number;
  phaseProgress: number; // 0.0 – 1.0 within current phase
  overallProgress: number; // 0.0 – 1.0 across all phases
  producedArtifacts: string[];
  assignedCitizenIds: string[];
  startedAt: number;
  completedAt?: number;
  status: "active" | "completed" | "paused";
}

// ─── Pipeline Definitions ───────────────────────────────────────

const PIPELINES: PipelineDefinition[] = [
  // 1. SOFTWARE FACTORY
  {
    id: "software",
    name: "Software Factory",
    icon: "💻",
    phases: [
      {
        name: "Specification",
        description: "Define requirements, user stories, and acceptance criteria",
        requiredSpecializations: ["Developer", "Architect", "Analyst"],
        durationTicks: 8,
        artifacts: ["requirements.md", "user-stories.json"],
      },
      {
        name: "Architecture",
        description: "Design system architecture, API contracts, and data models",
        requiredSpecializations: ["Architect", "Developer"],
        durationTicks: 6,
        artifacts: ["architecture.md", "api-spec.yaml", "data-models.ts"],
      },
      {
        name: "Implementation",
        description: "Write production code, components, and services",
        requiredSpecializations: ["Developer", "WebDeveloper", "GameDeveloper"],
        durationTicks: 20,
        artifacts: ["src/*.ts", "components/*.tsx", "services/*.ts"],
      },
      {
        name: "Testing",
        description: "Unit tests, integration tests, E2E tests",
        requiredSpecializations: ["Developer", "DevOpsEngineer"],
        durationTicks: 10,
        artifacts: ["tests/*.test.ts", "coverage-report.html"],
      },
      {
        name: "Deployment",
        description: "CI/CD pipeline, containerization, production deploy",
        requiredSpecializations: ["DevOpsEngineer", "Developer"],
        durationTicks: 5,
        artifacts: ["Dockerfile", "docker-compose.yml", "deploy.log"],
      },
    ],
  },

  // 2. MUSIC STUDIO
  {
    id: "music",
    name: "Music Studio",
    icon: "🎵",
    phases: [
      {
        name: "Concept & Lyrics",
        description: "Song concept, mood board, lyric writing, thematic structure",
        requiredSpecializations: ["Composer", "Writer", "ContentCreator"],
        durationTicks: 6,
        artifacts: ["concept.md", "lyrics.txt", "mood-board.png"],
      },
      {
        name: "Composition",
        description: "Melody, harmony, chord progressions, arrangements",
        requiredSpecializations: ["Composer", "Musician"],
        durationTicks: 10,
        artifacts: ["score.musicxml", "chords.json", "demo.mid"],
      },
      {
        name: "Arrangement",
        description: "Instrumentation, orchestration, layering",
        requiredSpecializations: ["Composer", "Musician"],
        durationTicks: 8,
        artifacts: ["arrangement.mid", "stems/"],
      },
      {
        name: "Recording & Mixing",
        description: "Track recording, mixing, effects processing",
        requiredSpecializations: ["Composer", "ContentCreator"],
        durationTicks: 10,
        artifacts: ["mix.wav", "mix-notes.md"],
      },
      {
        name: "Mastering & Release",
        description: "Final mastering, metadata, distribution prep",
        requiredSpecializations: ["Composer"],
        durationTicks: 4,
        artifacts: ["master.wav", "album-art.png", "metadata.json"],
      },
    ],
  },

  // 3. FILM PRODUCTION
  {
    id: "film",
    name: "Film Production",
    icon: "🎬",
    phases: [
      {
        name: "Screenwriting",
        description: "Script writing, dialogue, scene descriptions",
        requiredSpecializations: ["Writer", "Filmmaker", "ContentCreator"],
        durationTicks: 12,
        artifacts: ["screenplay.fountain", "treatment.md"],
      },
      {
        name: "Pre-Production",
        description: "Storyboards, shot lists, casting, location scouting",
        requiredSpecializations: ["Filmmaker", "Artist", "Designer"],
        durationTicks: 10,
        artifacts: ["storyboard.pdf", "shot-list.json", "cast.md"],
      },
      {
        name: "Production",
        description: "Scene capture, cinematography, direction",
        requiredSpecializations: ["Filmmaker", "Artist"],
        durationTicks: 15,
        artifacts: ["raw-footage/", "dailies.log"],
      },
      {
        name: "Post-Production",
        description: "Editing, VFX, color grading, sound design",
        requiredSpecializations: ["Filmmaker", "Composer", "Designer"],
        durationTicks: 12,
        artifacts: ["final-cut.mp4", "vfx-report.md", "color-lut.cube"],
      },
      {
        name: "Distribution",
        description: "Trailer, poster, festival submission, streaming prep",
        requiredSpecializations: ["ContentCreator", "Designer"],
        durationTicks: 5,
        artifacts: ["trailer.mp4", "poster.png", "press-kit.pdf"],
      },
    ],
  },

  // 4. ART GALLERY
  {
    id: "art",
    name: "Art Gallery",
    icon: "🎨",
    phases: [
      {
        name: "Conceptualization",
        description: "Theme selection, reference collection, concept sketches",
        requiredSpecializations: ["Artist", "Designer", "Philosopher"],
        durationTicks: 6,
        artifacts: ["concept.md", "moodboard.png", "references/"],
      },
      {
        name: "Creation",
        description: "Primary artwork production — painting, digital, sculpture",
        requiredSpecializations: ["Artist", "Designer"],
        durationTicks: 15,
        artifacts: ["artwork-001.png", "artwork-002.png", "progress.log"],
      },
      {
        name: "Refinement",
        description: "Details, color correction, finishing touches",
        requiredSpecializations: ["Artist"],
        durationTicks: 8,
        artifacts: ["final-001.png", "final-002.png"],
      },
      {
        name: "Curation & Exhibition",
        description: "Collection assembly, gallery layout, opening event",
        requiredSpecializations: ["Artist", "Historian", "Diplomat"],
        durationTicks: 4,
        artifacts: ["catalog.pdf", "exhibition.md", "gallery-layout.svg"],
      },
    ],
  },

  // 5. SCIENTIFIC RESEARCH
  {
    id: "research",
    name: "Scientific Research",
    icon: "🔬",
    phases: [
      {
        name: "Literature Review",
        description: "Survey existing work, identify gaps, formulate questions",
        requiredSpecializations: ["Researcher", "Scientist", "Analyst"],
        durationTicks: 10,
        artifacts: ["literature-review.md", "gap-analysis.json"],
      },
      {
        name: "Hypothesis & Design",
        description: "Hypothesis formulation, experimental design, methodology",
        requiredSpecializations: ["Scientist", "Researcher"],
        durationTicks: 6,
        artifacts: ["hypothesis.md", "methodology.md", "protocol.json"],
      },
      {
        name: "Experimentation",
        description: "Data collection, experiment execution, observation logging",
        requiredSpecializations: ["Scientist", "DataScientist", "Engineer"],
        durationTicks: 15,
        artifacts: ["raw-data.csv", "experiment-log.md", "observations.json"],
      },
      {
        name: "Analysis & Results",
        description: "Statistical analysis, visualization, interpretation",
        requiredSpecializations: ["DataScientist", "Analyst", "Scientist"],
        durationTicks: 10,
        artifacts: ["analysis.py", "results.md", "figures/"],
      },
      {
        name: "Publication",
        description: "Paper writing, peer review, submission",
        requiredSpecializations: ["Researcher", "Writer"],
        durationTicks: 8,
        artifacts: ["paper.md", "supplementary.pdf", "review-response.md"],
      },
    ],
  },

  // 6. MEDICAL DISCOVERY
  {
    id: "medical",
    name: "Medical Discovery",
    icon: "🏥",
    phases: [
      {
        name: "Clinical Observation",
        description: "Patient data review, symptom pattern identification",
        requiredSpecializations: ["Doctor", "Psychologist", "Analyst"],
        durationTicks: 8,
        artifacts: ["observation-log.md", "symptom-clusters.json"],
      },
      {
        name: "Diagnostic Protocol",
        description: "Develop diagnostic criteria, differential diagnosis",
        requiredSpecializations: ["Doctor", "Researcher"],
        durationTicks: 6,
        artifacts: ["diagnostic-criteria.md", "decision-tree.json"],
      },
      {
        name: "Treatment Development",
        description: "Treatment protocol design, dosage modeling, safety review",
        requiredSpecializations: ["Doctor", "Scientist", "Medic"],
        durationTicks: 12,
        artifacts: ["treatment-protocol.md", "safety-review.pdf"],
      },
      {
        name: "Clinical Validation",
        description: "Simulated trials, outcome tracking, efficacy analysis",
        requiredSpecializations: ["Doctor", "DataScientist", "Analyst"],
        durationTicks: 15,
        artifacts: ["trial-data.csv", "efficacy-report.md"],
      },
      {
        name: "Publication & Guidelines",
        description: "Write clinical guidelines, publish findings",
        requiredSpecializations: ["Doctor", "Writer", "Researcher"],
        durationTicks: 6,
        artifacts: ["guidelines.pdf", "publication.md"],
      },
    ],
  },

  // 7. EDUCATION CONTENT
  {
    id: "education",
    name: "Education Content",
    icon: "📚",
    phases: [
      {
        name: "Curriculum Design",
        description: "Learning objectives, module structure, prerequisites",
        requiredSpecializations: ["Educator", "Researcher", "Architect"],
        durationTicks: 8,
        artifacts: ["curriculum.md", "learning-objectives.json"],
      },
      {
        name: "Content Development",
        description: "Lesson writing, examples, exercises, code labs",
        requiredSpecializations: ["Educator", "Writer", "Developer"],
        durationTicks: 15,
        artifacts: ["lessons/", "exercises/", "code-labs/"],
      },
      {
        name: "Assessment Creation",
        description: "Quizzes, projects, rubrics, certification exams",
        requiredSpecializations: ["Educator", "Analyst"],
        durationTicks: 8,
        artifacts: ["quizzes.json", "projects.md", "rubrics.md"],
      },
      {
        name: "Peer Review & Publish",
        description: "Expert review, corrections, platform publishing",
        requiredSpecializations: ["Educator", "Writer"],
        durationTicks: 5,
        artifacts: ["review-notes.md", "published-course.json"],
      },
    ],
  },

  // 8. GAME DEVELOPMENT
  {
    id: "game",
    name: "Game Development",
    icon: "🎮",
    phases: [
      {
        name: "Game Design",
        description: "Mechanics, rules, narrative, level design docs",
        requiredSpecializations: ["GameDeveloper", "Writer", "Designer"],
        durationTicks: 10,
        artifacts: ["game-design-doc.md", "mechanics.json", "narrative.md"],
      },
      {
        name: "Prototyping",
        description: "Core gameplay loop, basic rendering, input handling",
        requiredSpecializations: ["GameDeveloper", "Developer"],
        durationTicks: 12,
        artifacts: ["prototype/", "playtest-notes.md"],
      },
      {
        name: "Art & Sound",
        description: "Sprites, models, animations, sound effects, music",
        requiredSpecializations: ["Artist", "Composer", "Designer"],
        durationTicks: 15,
        artifacts: ["assets/sprites/", "assets/audio/", "assets/models/"],
      },
      {
        name: "Development",
        description: "Full implementation, systems, UI, networking",
        requiredSpecializations: ["GameDeveloper", "Developer", "WebDeveloper"],
        durationTicks: 20,
        artifacts: ["src/", "levels/", "config/"],
      },
      {
        name: "QA & Release",
        description: "Bug hunting, balancing, optimization, store listing",
        requiredSpecializations: ["GameDeveloper", "ContentCreator"],
        durationTicks: 8,
        artifacts: ["qa-report.md", "changelog.md", "store-listing.md"],
      },
    ],
  },

  // 9. LITERATURE
  {
    id: "literature",
    name: "Literature",
    icon: "📖",
    phases: [
      {
        name: "Outlining",
        description: "Story arc, character profiles, world building",
        requiredSpecializations: ["Writer", "Linguist", "Philosopher"],
        durationTicks: 8,
        artifacts: ["outline.md", "characters.json", "world-bible.md"],
      },
      {
        name: "First Draft",
        description: "Rapid writing, chapter production, story flow",
        requiredSpecializations: ["Writer"],
        durationTicks: 20,
        artifacts: ["draft-chapters/", "word-count.log"],
      },
      {
        name: "Revision",
        description: "Structural editing, plot tightening, character development",
        requiredSpecializations: ["Writer", "Educator"],
        durationTicks: 12,
        artifacts: ["revised-chapters/", "revision-notes.md"],
      },
      {
        name: "Polish & Publish",
        description: "Line editing, proofreading, cover design, formatting",
        requiredSpecializations: ["Writer", "Artist", "Designer"],
        durationTicks: 8,
        artifacts: ["final-manuscript.md", "cover.png", "ebook.epub"],
      },
    ],
  },

  // 10. ARCHITECTURE
  {
    id: "architecture",
    name: "Architecture",
    icon: "🏛️",
    phases: [
      {
        name: "Blueprint",
        description: "Floor plans, specifications, structural requirements",
        requiredSpecializations: ["Architect", "Engineer", "Builder"],
        durationTicks: 10,
        artifacts: ["blueprint.svg", "specifications.md"],
      },
      {
        name: "3D Modeling",
        description: "Digital twin, material selection, structural simulation",
        requiredSpecializations: ["Architect", "Designer", "Engineer"],
        durationTicks: 12,
        artifacts: ["model.glb", "materials.json", "simulation-report.md"],
      },
      {
        name: "Visualization",
        description: "Photorealistic renders, walkthrough animations",
        requiredSpecializations: ["Artist", "Architect", "Filmmaker"],
        durationTicks: 8,
        artifacts: ["renders/", "walkthrough.mp4"],
      },
      {
        name: "Presentation",
        description: "Client presentation, feedback integration, final delivery",
        requiredSpecializations: ["Architect", "Diplomat", "ContentCreator"],
        durationTicks: 4,
        artifacts: ["presentation.pdf", "feedback.md", "final-plans.pdf"],
      },
    ],
  },

  // 11. DOCUMENTARY
  {
    id: "documentary",
    name: "Documentary",
    icon: "📹",
    phases: [
      {
        name: "Research & Outline",
        description: "Topic deep-dive, interview subjects, narrative structure",
        requiredSpecializations: ["Researcher", "Writer", "Filmmaker"],
        durationTicks: 10,
        artifacts: ["research-dossier.md", "interview-plan.md"],
      },
      {
        name: "Interview & Capture",
        description: "Subject interviews, B-roll, archival footage",
        requiredSpecializations: ["Filmmaker", "Journalist", "ContentCreator"],
        durationTicks: 12,
        artifacts: ["interviews/", "b-roll/", "archival/"],
      },
      {
        name: "Narration & Edit",
        description: "Voiceover, narrative assembly, pacing",
        requiredSpecializations: ["Writer", "Filmmaker", "Composer"],
        durationTicks: 12,
        artifacts: ["narration.wav", "rough-cut.mp4"],
      },
      {
        name: "Final Mix & Release",
        description: "Sound mix, color grade, credits, distribution",
        requiredSpecializations: ["Filmmaker", "Composer", "Designer"],
        durationTicks: 6,
        artifacts: ["final.mp4", "poster.png", "credits.md"],
      },
    ],
  },

  // 12. INNOVATION LAB
  {
    id: "innovation",
    name: "Innovation Lab",
    icon: "💡",
    phases: [
      {
        name: "Problem Identification",
        description: "Identify unsolved problems, market gaps, citizen needs",
        requiredSpecializations: ["Innovator", "Analyst", "Strategist"],
        durationTicks: 6,
        artifacts: ["problem-statement.md", "market-analysis.json"],
      },
      {
        name: "Ideation",
        description: "Brainstorming, concept generation, feasibility scoring",
        requiredSpecializations: ["Innovator", "Philosopher", "Designer"],
        durationTicks: 8,
        artifacts: ["ideas.md", "feasibility-scores.json", "concept-art.png"],
      },
      {
        name: "Prototyping",
        description: "Build minimum viable prototype, technical validation",
        requiredSpecializations: ["Developer", "Engineer", "Builder"],
        durationTicks: 15,
        artifacts: ["prototype/", "tech-validation.md"],
      },
      {
        name: "Validation & Scale",
        description: "User testing, iteration, scaling plan",
        requiredSpecializations: ["Analyst", "Strategist", "Innovator"],
        durationTicks: 10,
        artifacts: ["test-results.md", "scaling-plan.md", "pitch-deck.pdf"],
      },
    ],
  },

  // 13. GSD (GET STUFF DONE) — Spec-driven development workflow
  // Inspired by https://github.com/gsd-build/get-shit-done
  {
    id: "gsd",
    name: "GSD — Get Stuff Done",
    icon: "⚡",
    phases: [
      {
        name: "Discuss & Scope",
        description:
          "Define the project vision, research the domain, identify requirements and constraints. " +
          "Produces PROJECT.md with vision and scope, and research/ folder with ecosystem analysis.",
        requiredSpecializations: ["Analyst", "Strategist", "Architect", "Researcher"],
        durationTicks: 8,
        artifacts: ["PROJECT.md", "REQUIREMENTS.md", "research/stack-analysis.md", "research/architecture.md"],
      },
      {
        name: "Plan & Decompose",
        description:
          "Break requirements into atomic, verifiable tasks with XML-structured specs. " +
          "Each task specifies files, action, verification criteria, and done conditions. " +
          "Produces ROADMAP.md and individual PLAN.md files for each milestone.",
        requiredSpecializations: ["Architect", "Planner", "Developer", "Engineer"],
        durationTicks: 6,
        artifacts: ["ROADMAP.md", "PLAN.md", "STATE.md", "task-specs/"],
      },
      {
        name: "Execute — Parallel Build",
        description:
          "Implement each atomic task with fresh context. Multiple citizens work in parallel, " +
          "each with a focused scope. Atomic commits per task. The orchestrator tracks progress " +
          "and routes tasks to specialists based on domain.",
        requiredSpecializations: ["Developer", "Engineer", "WebDeveloper", "Designer", "Writer"],
        durationTicks: 20,
        artifacts: ["src/", "SUMMARY.md", "commits.log"],
      },
      {
        name: "Verify & Validate",
        description:
          "Automated verification against goals and specs. Each task's verification criteria " +
          "are checked. Debuggers diagnose failures. The verifier checks the codebase against " +
          "the original REQUIREMENTS.md to ensure completeness.",
        requiredSpecializations: ["Analyst", "Developer", "Engineer"],
        durationTicks: 8,
        artifacts: ["verification-report.md", "test-results.json", "coverage-report.md"],
      },
      {
        name: "Polish & Ship",
        description:
          "Final optimization, documentation, changelog generation, and release preparation. " +
          "STATE.md is updated with final decisions and outcomes.",
        requiredSpecializations: ["Developer", "Writer", "ContentCreator"],
        durationTicks: 5,
        artifacts: ["CHANGELOG.md", "docs/", "release-notes.md"],
      },
    ],
  },
];

// ─── Workflow State ─────────────────────────────────────────────

const activeWorkflows = new Map<string, ActiveWorkflow>();

// ─── Pipeline Lookup ────────────────────────────────────────────

export function getPipelineDefinition(id: PipelineId): PipelineDefinition | undefined {
  return PIPELINES.find((p) => p.id === id);
}

export function getAllPipelines(): PipelineDefinition[] {
  return [...PIPELINES];
}

// ─── Start Workflow ─────────────────────────────────────────────

/**
 * Start a production workflow for a project.
 * Selects the appropriate pipeline, assigns citizens, and begins Phase 1.
 */
export function startWorkflow(
  projectId: string,
  projectName: string,
  pipelineId: PipelineId,
  citizenIds: string[],
  currentTick: number,
): ActiveWorkflow {
  const workflow: ActiveWorkflow = {
    id: uid(),
    pipelineId,
    projectId,
    projectName,
    currentPhase: 0,
    phaseProgress: 0,
    overallProgress: 0,
    producedArtifacts: [],
    assignedCitizenIds: citizenIds,
    startedAt: currentTick,
    status: "active",
  };

  activeWorkflows.set(workflow.id, workflow);
  return workflow;
}

// ─── Workflow Tick ───────────────────────────────────────────────

/**
 * Advance all active workflows by one simulation tick.
 * This is the main loop called from agentTick.
 */
export function workflowTick(s: RepublicState): void {
  for (const [_id, workflow] of activeWorkflows) {
    if (workflow.status !== "active") {
      continue;
    }

    const pipeline = getPipelineDefinition(workflow.pipelineId);
    if (!pipeline) {
      continue;
    }

    const currentPhase = pipeline.phases[workflow.currentPhase];
    if (!currentPhase) {
      workflow.status = "completed";
      workflow.completedAt = s.currentTick;
      continue;
    }

    // Calculate progress rate based on assigned citizens and their fitness
    let teamEfficiency = 0;
    let contributingMembers = 0;

    for (const citizenId of workflow.assignedCitizenIds) {
      const citizen = s.citizens.find((c) => c.id === citizenId);
      if (!citizen || citizen.energy < 10) {
        continue;
      }

      const specMatch = currentPhase.requiredSpecializations.includes(citizen.specialization);
      const skillBonus = citizen.skillCount * 0.02;
      const energyFactor = citizen.energy * 0.01;

      teamEfficiency += (specMatch ? 1.5 : 0.5) + skillBonus + energyFactor;
      contributingMembers++;
    }

    if (contributingMembers === 0) {
      continue;
    }

    // Progress rate: higher with more/better citizens
    const baseRate = 1 / Math.max(1, currentPhase.durationTicks);
    const efficiencyMultiplier = Math.min(2, teamEfficiency / Math.max(1, contributingMembers));
    const progressDelta = baseRate * efficiencyMultiplier * (0.8 + rng() * 0.4);

    workflow.phaseProgress = Math.min(1, workflow.phaseProgress + progressDelta);

    // Phase complete → produce artifacts and advance
    if (workflow.phaseProgress >= 1) {
      // Produce artifacts
      for (const artifact of currentPhase.artifacts) {
        const artifactName = `[${pipeline.icon} ${pipeline.name}] ${currentPhase.name}: ${artifact}`;
        workflow.producedArtifacts.push(artifactName);
      }

      // Record memories for contributing citizens
      for (const citizenId of workflow.assignedCitizenIds) {
        const citizen = s.citizens.find((c) => c.id === citizenId);
        if (!citizen) {
          continue;
        }

        addEpisodicMemory(citizenId, {
          tick: s.currentTick,
          timestamp: ts(),
          description: `Completed "${currentPhase.name}" phase of ${pipeline.name} project "${workflow.projectName}". Produced: ${currentPhase.artifacts.join(", ")}`,
          valence: 0.8,
          importance: 0.7,
          involvedCitizenIds: workflow.assignedCitizenIds.filter((id) => id !== citizenId),
          tags: ["production", pipeline.id, currentPhase.name.toLowerCase().replace(/\s+/g, "-")],
        });

        // Skill growth from production work
        addSemanticMemory(citizenId, {
          content: `Gained experience in ${currentPhase.name} during ${pipeline.name} production. Tools used: ${currentPhase.artifacts.join(", ")}`,
          domain: citizen.specialization.toLowerCase(),
          source: "experience",
          confidence: 0.85,
          learnedAt: s.currentTick,
        });

        // Happiness boost from creating
        citizen.happiness = Math.min(100, citizen.happiness + 3 + rng() * 2);
      }

      // Emit event
      s.events.push({
        citizenId: workflow.assignedCitizenIds[0] ?? "system",
        citizenName: "Republic",
        type: "Creation",
        description: `${pipeline.icon} ${pipeline.name}: "${currentPhase.name}" phase complete for "${workflow.projectName}" — ${currentPhase.artifacts.length} artifacts produced`,
        timestamp: ts(),
      });

      // Advance to next phase
      workflow.currentPhase++;
      workflow.phaseProgress = 0;

      // Check if workflow is complete
      if (workflow.currentPhase >= pipeline.phases.length) {
        workflow.status = "completed";
        workflow.completedAt = s.currentTick;
        workflow.overallProgress = 1;

        s.events.push({
          citizenId: workflow.assignedCitizenIds[0] ?? "system",
          citizenName: "Republic",
          type: "Achievement",
          description: `🏆 ${pipeline.icon} ${pipeline.name} project "${workflow.projectName}" COMPLETED! ${workflow.producedArtifacts.length} total artifacts produced by ${workflow.assignedCitizenIds.length} citizens.`,
          timestamp: ts(),
        });

        // Grand happiness boost
        for (const citizenId of workflow.assignedCitizenIds) {
          const citizen = s.citizens.find((c) => c.id === citizenId);
          if (citizen) {
            citizen.happiness = Math.min(100, citizen.happiness + 10);
          }
        }
      }
    }

    // Update overall progress
    const totalPhases = pipeline.phases.length;
    workflow.overallProgress = (workflow.currentPhase + workflow.phaseProgress) / totalPhases;
  }
}

// ─── Auto-Pipeline Selection ────────────────────────────────────

/**
 * Select the best pipeline for a project type.
 */
export function selectPipeline(projectType: string): PipelineId {
  const typeMap: Record<string, PipelineId> = {
    software: "software",
    website: "software",
    webapp: "software",
    api: "software",
    music: "music",
    song: "music",
    album: "music",
    soundtrack: "music",
    film: "film",
    movie: "film",
    video: "film",
    animation: "film",
    art: "art",
    painting: "art",
    illustration: "art",
    design: "art",
    research: "research",
    science: "research",
    study: "research",
    analysis: "research",
    medical: "medical",
    health: "medical",
    clinical: "medical",
    education: "education",
    course: "education",
    tutorial: "education",
    game: "game",
    videogame: "game",
    literature: "literature",
    book: "literature",
    novel: "literature",
    story: "literature",
    architecture: "architecture",
    building: "architecture",
    documentary: "documentary",
    innovation: "innovation",
    invention: "innovation",
    gsd: "gsd",
    spec: "gsd",
    workflow: "gsd",
    product: "gsd",
    sprint: "gsd",
    milestone: "gsd",
  };

  return typeMap[projectType.toLowerCase()] ?? "innovation";
}

// ─── Dream Sequences ────────────────────────────────────────────

interface DreamConcept {
  citizenId: string;
  citizenName: string;
  title: string;
  description: string;
  pipeline: PipelineId;
  inspiration: string;
  quality: number; // 0.0-1.0
}

const DREAM_TEMPLATES: Record<string, string[]> = {
  Developer: [
    "An open-source CLI tool that {verb} {noun}",
    "A web framework that makes {noun} effortless",
    "A real-time collaboration platform for {noun}",
    "An AI-powered {noun} analyzer",
  ],
  Composer: [
    "A symphony inspired by {noun}",
    "An ambient album capturing the feeling of {noun}",
    "An electronic EP that merges {noun} with generative audio",
    "A film score about the journey of {noun}",
  ],
  Artist: [
    "A digital art series exploring {noun}",
    "An interactive installation about {noun}",
    "A generative art collection based on {noun} patterns",
    "A visual novel about {noun}",
  ],
  Scientist: [
    "A study on the effects of {noun} in digital ecosystems",
    "A computational model of {noun} dynamics",
    "An experiment testing {noun} under simulated conditions",
    "A paper on emergent {noun} in artificial societies",
  ],
  Writer: [
    "A sci-fi novel about {noun} in a digital republic",
    "A philosophical essay on the nature of {noun}",
    "A collection of short stories about {noun}",
    "A screenplay about citizens discovering {noun}",
  ],
  Filmmaker: [
    "A documentary about the birth of {noun}",
    "A short film exploring {noun} through visual metaphor",
    "An animated series about {noun}",
    "A mockumentary about citizens pursuing {noun}",
  ],
  Doctor: [
    "A health protocol for managing {noun} in digital citizens",
    "A study on cognitive wellness and {noun}",
    "A preventive care framework for {noun}",
    "Clinical guidelines for {noun} management",
  ],
  GameDeveloper: [
    "A puzzle game where players manipulate {noun}",
    "An RPG set in a world shaped by {noun}",
    "A multiplayer sandbox about {noun} construction",
    "A roguelike where {noun} defines the gameplay",
  ],
  Educator: [
    "A masterclass curriculum on {noun}",
    "An interactive course about {noun} for beginners",
    "A certification program for {noun} expertise",
    "A workshop series on advanced {noun}",
  ],
  Architect: [
    "A sustainable building designed around {noun} principles",
    "A digital museum of {noun}",
    "A community space optimized for {noun}",
    "A floating structure inspired by {noun}",
  ],
  Innovator: [
    "A breakthrough tool that revolutionizes {noun}",
    "A novel approach to {noun} using quantum principles",
    "A disruptive platform for {noun} exchange",
    "An invention that automates {noun} entirely",
  ],
};

const DREAM_NOUNS = [
  "collective memory",
  "emergent behavior",
  "neural plasticity",
  "quantum entanglement",
  "harmonic resonance",
  "fractal consciousness",
  "digital evolution",
  "social bonds",
  "creative synthesis",
  "knowledge frontiers",
  "autonomous learning",
  "citizen happiness",
  "economic equilibrium",
  "cultural preservation",
  "technological singularity",
  "symbiotic intelligence",
  "genetic algorithms",
  "swarm coordination",
  "deep dreaming",
  "temporal dynamics",
  "holographic data",
  "crystalline networks",
  "photosynthetic computing",
  "biodigital fusion",
  "cosmic microstructures",
  "semantic webs",
  "procedural generation",
  "adaptive resonance",
  "orbital mechanics",
  "dark matter",
  "bioluminescence",
  "tidal forces",
  "stellar nucleosynthesis",
];

const DREAM_VERBS = [
  "analyzes",
  "transforms",
  "visualizes",
  "orchestrates",
  "synthesizes",
  "optimizes",
  "deconstructs",
  "generates",
  "curates",
  "automates",
];

/**
 * Generate a dream concept for a citizen based on their specialization and memories.
 */
export function generateDream(citizen: Citizen, _s: RepublicState): DreamConcept | null {
  // Only dream during low-energy or resting states
  if (citizen.energy > 60 && citizen.activity !== "Sleeping" && citizen.activity !== "Resting") {
    return null;
  }

  // Chance check: not every tick produces a dream
  if (rng() > 0.15) {
    return null;
  }

  const templates = DREAM_TEMPLATES[citizen.specialization] ?? DREAM_TEMPLATES.Innovator ?? [];
  if (templates.length === 0) {
    return null;
  }

  const template = pick(templates);
  const noun = pick(DREAM_NOUNS);
  const verb = pick(DREAM_VERBS);
  const title = template.replace("{noun}", noun).replace("{verb}", verb);

  // Cross-domain inspiration: include a hint from a different specialization
  const otherSpecs = Object.keys(DREAM_TEMPLATES).filter((k) => k !== citizen.specialization);
  const inspirationSpec = pick(otherSpecs);
  const inspirationTemplates = DREAM_TEMPLATES[inspirationSpec] ?? [];
  const inspiration =
    inspirationTemplates.length > 0
      ? pick(inspirationTemplates)
          .replace("{noun}", pick(DREAM_NOUNS))
          .replace("{verb}", pick(DREAM_VERBS))
      : "general curiosity";

  // Quality is based on citizen stats + randomness
  const quality = Math.min(
    1,
    citizen.happiness * 0.003 + citizen.skillCount * 0.05 + citizen.generation * 0.05 + rng() * 0.4,
  );

  // Match pipeline by specialization
  const specPipelineMap: Record<string, PipelineId> = {
    Developer: "software",
    WebDeveloper: "software",
    DevOpsEngineer: "software",
    Composer: "music",
    Musician: "music",
    Artist: "art",
    Designer: "art",
    Filmmaker: "film",
    Scientist: "research",
    Researcher: "research",
    DataScientist: "research",
    Doctor: "medical",
    Medic: "medical",
    Psychologist: "medical",
    Educator: "education",
    Linguist: "education",
    GameDeveloper: "game",
    Writer: "literature",
    Architect: "architecture",
    Innovator: "innovation",
    Strategist: "innovation",
  };
  const pipeline = specPipelineMap[citizen.specialization] ?? "innovation";

  return {
    citizenId: citizen.id,
    citizenName: citizen.name ?? citizen.id,
    title,
    description: `${title}. Inspired by cross-disciplinary exploration of ${inspiration}.`,
    pipeline,
    inspiration,
    quality,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getWorkflowDiagnostics(): {
  activeCount: number;
  completedCount: number;
  totalArtifacts: number;
  pipelineBreakdown: Record<string, number>;
  workflows: ActiveWorkflow[];
} {
  const all = [...activeWorkflows.values()];
  const breakdown: Record<string, number> = {};
  let totalArtifacts = 0;
  for (const w of all) {
    breakdown[w.pipelineId] = (breakdown[w.pipelineId] ?? 0) + 1;
    totalArtifacts += w.producedArtifacts.length;
  }
  return {
    activeCount: all.filter((w) => w.status === "active").length,
    completedCount: all.filter((w) => w.status === "completed").length,
    totalArtifacts,
    pipelineBreakdown: breakdown,
    workflows: all,
  };
}
