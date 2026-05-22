/**
 * Republic Platform — Project Orchestrator
 *
 * Phase 4: Receives a project request from chat (WebUI, WhatsApp, etc.)
 * and orchestrates autonomous citizen team formation and execution.
 *
 * Flow:
 * 1. Parse user request into a structured project spec
 * 2. Select best citizens by specialization + skill proficiency
 * 3. Form a team, assign roles and goals via citizen-autonomy engine
 * 4. Track progress across simulation ticks
 * 5. Report status/completion via event system
 */

import { addEpisodicMemory, addSemanticMemory, getMemory } from "./memory.js";
import type { Citizen, RepublicState } from "./types.js";
import { rng, SKILL_TREES, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type ProjectType =
  | "software"
  | "website"
  | "game"
  | "art"
  | "music"
  | "research"
  | "document"
  | "education"
  | "mixed";

interface ProjectSpec {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  requirements: string[];
  requestedAt: number;
  requestedBy: string; // "chat" | "whatsapp" | "telegram" | etc.
}

interface TeamMember {
  citizenId: string;
  citizenName: string;
  role: string;
  specialization: string;
  assignedGoal: string;
}

interface ProjectStatus {
  id: string;
  spec: ProjectSpec;
  team: TeamMember[];
  phase: "forming" | "planning" | "executing" | "reviewing" | "completed" | "failed";
  progress: number; // 0.0 – 1.0
  startedAt: number;
  completedAt?: number;
  deliverables: string[];
  events: string[];
}

// ─── Project Registry ───────────────────────────────────────────

const activeProjects = new Map<string, ProjectStatus>();

// ─── Specialization → Project Type Mapping ──────────────────────

const PROJECT_SPECIALIZATION_MAP: Record<ProjectType, string[]> = {
  software: ["Developer", "WebDeveloper", "DevOpsEngineer", "Architect", "DataScientist"],
  website: ["WebDeveloper", "Designer", "Developer", "ContentCreator"],
  game: ["GameDeveloper", "Designer", "Artist", "Composer", "Developer"],
  art: ["Artist", "Designer", "Filmmaker", "ContentCreator"],
  music: ["Composer", "Artist", "ContentCreator", "Entertainer"],
  research: ["Researcher", "Analyst", "Scientist", "DataScientist", "Historian"],
  document: ["Writer", "Researcher", "Educator", "Linguist"],
  education: ["Educator", "Researcher", "Writer", "Analyst"],
  mixed: ["Innovator", "Strategist", "Developer", "Designer", "Researcher"],
};

const ROLE_TEMPLATES: Record<ProjectType, string[]> = {
  software: ["Lead Developer", "Backend Engineer", "Frontend Engineer", "QA Engineer", "DevOps"],
  website: ["Frontend Lead", "UI Designer", "Content Writer", "SEO Specialist"],
  game: ["Game Director", "Programmer", "Artist", "Sound Designer", "Level Designer"],
  art: ["Creative Director", "Lead Artist", "Digital Painter", "Concept Artist"],
  music: ["Producer", "Composer", "Sound Engineer", "Arranger"],
  research: ["Principal Researcher", "Data Analyst", "Literature Reviewer", "Statistician"],
  document: ["Lead Author", "Editor", "Researcher", "Proofreader"],
  education: ["Curriculum Designer", "Content Developer", "Assessment Creator", "Reviewer"],
  mixed: ["Project Lead", "Technical Specialist", "Creative Specialist", "Coordinator"],
};

// ─── 1. Parse Project Request ───────────────────────────────────

function parseProjectRequest(prompt: string, source: string): ProjectSpec {
  const promptLower = prompt.toLowerCase();

  // Detect project type from keywords
  let type: ProjectType = "mixed";
  if (promptLower.match(/\b(app|software|api|backend|server|cli|tool|library)\b/)) {
    type = "software";
  } else if (promptLower.match(/\b(website|webpage|landing|portfolio|blog|web app)\b/)) {
    type = "website";
  } else if (promptLower.match(/\b(game|gameplay|level|player|rpg|fps|puzzle)\b/)) {
    type = "game";
  } else if (promptLower.match(/\b(art|painting|illustration|visual|design|logo|graphic)\b/)) {
    type = "art";
  } else if (promptLower.match(/\b(music|song|album|beat|track|melody|compose)\b/)) {
    type = "music";
  } else if (promptLower.match(/\b(research|study|analysis|paper|thesis|investigate)\b/)) {
    type = "research";
  } else if (promptLower.match(/\b(document|report|manual|guide|documentation|write)\b/)) {
    type = "document";
  } else if (promptLower.match(/\b(course|curriculum|lesson|teach|training|tutorial)\b/)) {
    type = "education";
  }

  // Extract project name from prompt (first meaningful phrase)
  const nameMatch = prompt.match(
    /(?:build|create|make|develop|design|compose|write|launch)\s+(?:a|an|the|me\s+a)?\s*(.+?)(?:\.|$|,|\s+that|\s+with|\s+using|\s+for)/i,
  );
  const name = nameMatch?.[1]?.trim().slice(0, 80) || `${type}-project-${uid().slice(0, 6)}`;

  // Extract requirements (sentences after the main request)
  const requirements: string[] = [];
  const sentences = prompt
    .split(/[.!]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
  for (const sentence of sentences.slice(1)) {
    requirements.push(sentence);
  }

  return {
    id: uid(),
    name,
    description: prompt,
    type,
    requirements,
    requestedAt: Date.now(),
    requestedBy: source,
  };
}

// ─── 2. Select Team ─────────────────────────────────────────────

function selectTeam(spec: ProjectSpec, citizens: Citizen[], maxTeamSize = 6): TeamMember[] {
  const preferredSpecs = PROJECT_SPECIALIZATION_MAP[spec.type] ?? PROJECT_SPECIALIZATION_MAP.mixed;
  const roles = ROLE_TEMPLATES[spec.type] ?? ROLE_TEMPLATES.mixed;

  // Score citizens by fit
  interface ScoredCitizen {
    citizen: Citizen;
    score: number;
  }

  const scored: ScoredCitizen[] = citizens
    .filter((c) => c.energy >= 20 && c.health >= 30 && c.activity !== "Sleeping")
    .map((c) => {
      let score = 0;

      // Specialization match
      const specIndex = preferredSpecs.indexOf(c.specialization);
      if (specIndex >= 0) {
        score += (preferredSpecs.length - specIndex) * 3; // Earlier = higher fit
      }

      // Skill proficiency bonus
      const memory = getMemory(c.id);
      const skills = SKILL_TREES[c.specialization] ?? [];
      const masteredCount = memory.procedural.filter(
        (p) => skills.includes(p.skill) && p.proficiency >= 0.6,
      ).length;
      score += masteredCount * 2;

      // Generation bonus (experienced citizens)
      score += c.generation * 0.5;

      // Energy/happiness bonus
      score += (c.energy + c.happiness) * 0.02;

      // Skill count bonus
      score += c.skillCount * 0.3;

      return { citizen: c, score };
    })
    .toSorted((a, b) => b.score - a.score);

  // Pick top citizens, ensuring specialization diversity
  const team: TeamMember[] = [];
  const usedSpecs = new Set<string>();
  const usedIds = new Set<string>();

  // First pass: one citizen per preferred specialization
  for (const spec2 of preferredSpecs) {
    if (team.length >= maxTeamSize) {
      break;
    }
    const candidate = scored.find(
      (s) => s.citizen.specialization === spec2 && !usedIds.has(s.citizen.id),
    );
    if (candidate) {
      const roleIndex = Math.min(team.length, roles.length - 1);
      team.push({
        citizenId: candidate.citizen.id,
        citizenName: candidate.citizen.name ?? candidate.citizen.id,
        role: roles[roleIndex],
        specialization: candidate.citizen.specialization,
        assignedGoal: "",
      });
      usedIds.add(candidate.citizen.id);
      usedSpecs.add(candidate.citizen.specialization);
    }
  }

  // Second pass: fill remaining slots with best remaining candidates
  for (const s of scored) {
    if (team.length >= maxTeamSize) {
      break;
    }
    if (usedIds.has(s.citizen.id)) {
      continue;
    }
    const roleIndex = Math.min(team.length, roles.length - 1);
    team.push({
      citizenId: s.citizen.id,
      citizenName: s.citizen.name ?? s.citizen.id,
      role: roles[roleIndex],
      specialization: s.citizen.specialization,
      assignedGoal: "",
    });
    usedIds.add(s.citizen.id);
  }

  return team;
}

// ─── 3. Assign Goals to Team Members ────────────────────────────

function assignTeamGoals(project: ProjectStatus, s: RepublicState): void {
  const { spec, team } = project;

  // Generate goal descriptions based on project type and role
  for (const member of team) {
    const goalDesc = generateGoalForRole(spec, member);
    member.assignedGoal = goalDesc;

    // Record in citizen memory
    const citizen = s.citizens.find((c) => c.id === member.citizenId);
    if (citizen) {
      addEpisodicMemory(citizen.id, {
        tick: s.currentTick,
        timestamp: ts(),
        description: `Assigned to project "${spec.name}" as ${member.role}. Goal: ${goalDesc}`,
        valence: 0.7,
        importance: 0.9,
        involvedCitizenIds: team.map((t) => t.citizenId).filter((id) => id !== citizen.id),
        tags: ["project-assigned", spec.type, member.role.toLowerCase().replace(/\s+/g, "-")],
      });

      addSemanticMemory(citizen.id, {
        content: `Working on project "${spec.name}" (${spec.type}): ${spec.description}. My role: ${member.role}`,
        domain: citizen.specialization.toLowerCase(),
        source: "experience",
        confidence: 0.9,
        learnedAt: s.currentTick,
      });
    }
  }

  project.events.push(`Team of ${team.length} formed and goals assigned at tick ${s.currentTick}`);
}

function generateGoalForRole(spec: ProjectSpec, member: TeamMember): string {
  const roleGoals: Record<string, string[]> = {
    "Lead Developer": [
      `Architect and implement the core logic for "${spec.name}"`,
      `Design the system architecture and implement key modules for "${spec.name}"`,
    ],
    "Backend Engineer": [
      `Build the API and data layer for "${spec.name}"`,
      `Implement server-side logic and database integration for "${spec.name}"`,
    ],
    "Frontend Engineer": [
      `Create the user interface for "${spec.name}"`,
      `Build responsive UI components for "${spec.name}"`,
    ],
    "Frontend Lead": [`Design and implement the web frontend for "${spec.name}"`],
    "UI Designer": [`Create the visual design system and UI mockups for "${spec.name}"`],
    "Game Director": [`Design game mechanics, story, and oversee development of "${spec.name}"`],
    "Creative Director": [`Define the artistic vision and style guide for "${spec.name}"`],
    Producer: [`Produce and arrange the audio tracks for "${spec.name}"`],
    Composer: [`Compose original music and melodies for "${spec.name}"`],
    "Principal Researcher": [
      `Lead the research investigation and write findings for "${spec.name}"`,
    ],
    "Lead Author": [`Write and structure the primary content for "${spec.name}"`],
    "Project Lead": [`Coordinate the team and deliver "${spec.name}" on schedule`],
    "Curriculum Designer": [`Design the learning structure and modules for "${spec.name}"`],
  };

  const options = roleGoals[member.role];
  if (options && options.length > 0) {
    return options[Math.floor(rng() * options.length)];
  }

  // Fallback: generic goal based on specialization
  return `Contribute ${member.specialization.toLowerCase()} expertise to project "${spec.name}"`;
}

// ─── 4. Main Entry Point ────────────────────────────────────────

/**
 * Launch a project from a chat/WhatsApp/Telegram prompt.
 *
 * This is the main entry point called by the gateway or RPC handler.
 * It parses the request, forms a team, assigns goals, and starts tracking.
 */
export function launchProject(prompt: string, source: string, s: RepublicState): ProjectStatus {
  // 1. Parse
  const spec = parseProjectRequest(prompt, source);

  // 2. Select team
  const team = selectTeam(spec, s.citizens);

  // 3. Create project
  const project: ProjectStatus = {
    id: spec.id,
    spec,
    team,
    phase: "forming",
    progress: 0,
    startedAt: s.currentTick,
    deliverables: [],
    events: [`Project "${spec.name}" (${spec.type}) created from ${source}`],
  };

  // 4. Assign goals
  assignTeamGoals(project, s);
  project.phase = "planning";
  project.progress = 0.05;

  // 5. Register
  activeProjects.set(project.id, project);

  // 6. Emit event
  s.events.push({
    citizenId: team[0]?.citizenId ?? "system",
    citizenName: "Republic",
    type: "ProjectCreated",
    description: `Project "${spec.name}" launched with ${team.length} citizens: ${team.map((t) => `${t.citizenName} (${t.role})`).join(", ")}`,
    timestamp: ts(),
  });

  return project;
}

// ─── 5. Project Tick (called from autonomy tick) ────────────────

/**
 * Advance all active projects. Called periodically from the simulation loop.
 */
export function projectTick(s: RepublicState): void {
  for (const [_id, project] of activeProjects) {
    if (project.phase === "completed" || project.phase === "failed") {
      continue;
    }

    // Check team member activity
    let activeMembers = 0;
    let _totalActivity = 0;

    for (const member of project.team) {
      const citizen = s.citizens.find((c) => c.id === member.citizenId);
      if (!citizen) {
        continue;
      }

      if (
        citizen.activity === "Creating" ||
        citizen.activity === "Coding" ||
        citizen.activity === "Working"
      ) {
        activeMembers++;
        _totalActivity += citizen.energy * 0.01;
      }
    }

    // Progress based on active members
    const progressRate = (activeMembers / Math.max(1, project.team.length)) * 0.03;
    project.progress = Math.min(0.99, project.progress + progressRate + rng() * 0.01);

    // Phase transitions
    if (project.progress >= 0.15 && project.phase === "planning") {
      project.phase = "executing";
      project.events.push(`Entered execution phase at tick ${s.currentTick}`);
    }
    if (project.progress >= 0.8 && project.phase === "executing") {
      project.phase = "reviewing";
      project.events.push(`Entered review phase at tick ${s.currentTick}`);
    }
    if (project.progress >= 0.99) {
      project.phase = "completed";
      project.completedAt = s.currentTick;
      project.progress = 1.0;
      project.deliverables.push(
        `${project.spec.name} — completed by ${project.team.length} citizens`,
      );
      project.events.push(`Project completed at tick ${s.currentTick}!`);

      // Record completion in team memory
      for (const member of project.team) {
        addEpisodicMemory(member.citizenId, {
          tick: s.currentTick,
          timestamp: ts(),
          description: `Completed project "${project.spec.name}" as ${member.role}. Team delivered successfully.`,
          valence: 0.9,
          importance: 0.85,
          involvedCitizenIds: project.team
            .map((t) => t.citizenId)
            .filter((id) => id !== member.citizenId),
          tags: ["project-completed", project.spec.type],
        });
      }

      s.events.push({
        citizenId: project.team[0]?.citizenId ?? "system",
        citizenName: "Republic",
        type: "ProjectCreated",
        description: `Project "${project.spec.name}" COMPLETED by team: ${project.team.map((t) => t.citizenName).join(", ")}`,
        timestamp: ts(),
      });
    }
  }
}

// ─── 6. Query Functions ─────────────────────────────────────────

export function getProjectStatus(projectId: string): ProjectStatus | undefined {
  return activeProjects.get(projectId);
}

export function getAllProjects(): ProjectStatus[] {
  return [...activeProjects.values()];
}

export function getActiveProjectCount(): number {
  return [...activeProjects.values()].filter((p) => p.phase !== "completed" && p.phase !== "failed")
    .length;
}

export function getProjectDiagnostics(): {
  total: number;
  active: number;
  completed: number;
  teamSizes: number[];
  typeDistribution: Record<string, number>;
} {
  const all = [...activeProjects.values()];
  const types: Record<string, number> = {};
  for (const p of all) {
    types[p.spec.type] = (types[p.spec.type] ?? 0) + 1;
  }
  return {
    total: all.length,
    active: all.filter((p) => p.phase !== "completed" && p.phase !== "failed").length,
    completed: all.filter((p) => p.phase === "completed").length,
    teamSizes: all.map((p) => p.team.length),
    typeDistribution: types,
  };
}
