/**
 * Republic Platform — Intelligent Team Composer
 *
 * Analyzes project type, stack, and description to automatically
 * compose the ideal team of citizens. Never assigns irrelevant
 * citizens (no Farmers on Node.js projects). When no qualified
 * citizen exists, identifies the best candidate for enrollment.
 */

import type { ProjectStack, ProjectType, TeamMember, TeamRole } from "./dev-orchestration.js";
import type { Citizen, RepublicState, Specialization } from "./types.js";
import { ts } from "./utils.js";

// ─── Role Definitions Per Project Type ──────────────────────────

interface RoleRequirement {
  role: TeamRole;
  preferredSpecs: Specialization[];
  required: boolean;
}

const SOFTWARE_ROLES: RoleRequirement[] = [
  { role: "pm",        preferredSpecs: ["Planner", "Strategist"],                   required: true  },
  { role: "architect", preferredSpecs: ["Architect", "Engineer"],                   required: true  },
  { role: "developer", preferredSpecs: ["Developer", "Engineer"],                   required: true  },
  { role: "developer", preferredSpecs: ["Developer"],                               required: true  },
  { role: "designer",  preferredSpecs: ["Artist", "Developer"],                     required: false },
  { role: "qa",        preferredSpecs: ["Analyst", "Developer"],                    required: false },
];

const MUSIC_ROLES: RoleRequirement[] = [
  { role: "musician",   preferredSpecs: ["Musician"],                               required: true  },
  { role: "musician",   preferredSpecs: ["Musician"],                               required: false },
  { role: "writer",     preferredSpecs: ["Writer"],                                 required: false },
  { role: "artist",     preferredSpecs: ["Artist"],                                 required: false },
  { role: "pm",         preferredSpecs: ["Planner", "Strategist"],                  required: false },
];

const VISUAL_ART_ROLES: RoleRequirement[] = [
  { role: "artist",     preferredSpecs: ["Artist"],                                 required: true  },
  { role: "artist",     preferredSpecs: ["Artist"],                                 required: false },
  { role: "designer",   preferredSpecs: ["Artist", "Developer"],                    required: false },
  { role: "writer",     preferredSpecs: ["Writer"],                                 required: false },
  { role: "pm",         preferredSpecs: ["Planner", "Strategist"],                  required: false },
];

const LITERATURE_ROLES: RoleRequirement[] = [
  { role: "writer",     preferredSpecs: ["Writer"],                                 required: true  },
  { role: "writer",     preferredSpecs: ["Writer"],                                 required: false },
  { role: "researcher", preferredSpecs: ["Researcher", "Scientist"],                required: false },
  { role: "artist",     preferredSpecs: ["Artist"],                                 required: false },
  { role: "pm",         preferredSpecs: ["Planner"],                                required: false },
];

const RESEARCH_ROLES: RoleRequirement[] = [
  { role: "researcher", preferredSpecs: ["Researcher", "Scientist"],                required: true  },
  { role: "researcher", preferredSpecs: ["Scientist", "Researcher"],                required: true  },
  { role: "analyst",    preferredSpecs: ["Analyst", "Mathematician"],               required: true  },
  { role: "writer",     preferredSpecs: ["Writer"],                                 required: false },
  { role: "pm",         preferredSpecs: ["Planner"],                                required: false },
];

const VIDEO_ROLES: RoleRequirement[] = [
  { role: "artist",     preferredSpecs: ["Artist"],                                 required: true  },
  { role: "writer",     preferredSpecs: ["Writer"],                                 required: true  },
  { role: "musician",   preferredSpecs: ["Musician"],                               required: false },
  { role: "developer",  preferredSpecs: ["Developer"],                              required: false },
  { role: "pm",         preferredSpecs: ["Planner", "Strategist"],                  required: false },
];

const ROLE_MAP: Record<ProjectType, RoleRequirement[]> = {
  "software":    SOFTWARE_ROLES,
  "music":       MUSIC_ROLES,
  "visual-art":  VISUAL_ART_ROLES,
  "literature":  LITERATURE_ROLES,
  "research":    RESEARCH_ROLES,
  "video":       VIDEO_ROLES,
  "mixed":       SOFTWARE_ROLES,
};

// ─── Specialization Relevance ───────────────────────────────────

/** Specializations that should NEVER be assigned to software projects */
const SOFTWARE_IRRELEVANT: Set<Specialization> = new Set([
  "Farmer",
  "Doctor",
  "Psychologist",
  "Musician",
  "Diplomat",
  "Librarian",
  "Manufacturer",
]);

/** Specializations that should NEVER be assigned to music projects */
const MUSIC_IRRELEVANT: Set<Specialization> = new Set([
  "Farmer",
  "Doctor",
  "Manufacturer",
  "HardwareTechnician",
  "Developer",
  "Engineer",
  "Architect",
]);

const IRRELEVANCE_MAP: Partial<Record<ProjectType, Set<Specialization>>> = {
  "software":    SOFTWARE_IRRELEVANT,
  "music":       MUSIC_IRRELEVANT,
};

// ─── Core Team Composer ─────────────────────────────────────────

/**
 * Compose an ideal team for a project.
 * Matches citizens to roles by specialization, reputation, and availability.
 * Never assigns citizens with irrelevant specializations.
 */
export function composeTeam(
  s: RepublicState,
  projectType: ProjectType,
  _stack?: ProjectStack,
): TeamMember[] {
  const roles = ROLE_MAP[projectType] ?? SOFTWARE_ROLES;
  const irrelevant = IRRELEVANCE_MAP[projectType];
  const team: TeamMember[] = [];
  const usedCitizenIds = new Set<string>();

  for (const req of roles) {
    const citizen = findBestCitizen(s, req.preferredSpecs, usedCitizenIds, irrelevant);

    if (citizen) {
      usedCitizenIds.add(citizen.id);
      team.push({
        citizenId: citizen.id,
        citizenName: citizen.name,
        role: req.role,
        specialization: citizen.specialization,
        assignedAt: ts(),
      });
    } else if (req.required) {
      // No qualified citizen found — pick the best available Generalist
      const fallback = findFallbackCitizen(s, usedCitizenIds, irrelevant);
      if (fallback) {
        usedCitizenIds.add(fallback.id);
        team.push({
          citizenId: fallback.id,
          citizenName: fallback.name,
          role: req.role,
          specialization: fallback.specialization,
          assignedAt: ts(),
        });
      }
    }
  }

  // Ensure at least a lead
  if (team.length > 0 && !team.some((m) => m.role === "lead")) {
    team[0].role = "lead";
  }

  return team;
}

// ─── Citizen Selection Helpers ──────────────────────────────────

function findBestCitizen(
  s: RepublicState,
  preferredSpecs: Specialization[],
  exclude: Set<string>,
  irrelevant?: Set<Specialization>,
): Citizen | null {
  for (const spec of preferredSpecs) {
    const matches = s.citizens
      .filter(
        (c) =>
          c.specialization === spec &&
          !exclude.has(c.id) &&
          c.energy >= 15 &&
          c.activity !== "Sleeping" &&
          (!irrelevant || !irrelevant.has(c.specialization)),
      )
      .toSorted((a, b) => b.energy - a.energy);

    if (matches.length > 0) {
      return matches[0];
    }
  }
  return null;
}

function findFallbackCitizen(
  s: RepublicState,
  exclude: Set<string>,
  irrelevant?: Set<Specialization>,
): Citizen | null {
  // Prefer Generalists, then any non-irrelevant citizen
  const candidates = s.citizens
    .filter(
      (c) =>
        !exclude.has(c.id) &&
        c.energy >= 10 &&
        c.activity !== "Sleeping" &&
        (!irrelevant || !irrelevant.has(c.specialization)),
    )
    .toSorted((a, b) => {
      // Generalists first
      if (a.specialization === "Generalist" && b.specialization !== "Generalist") {return -1;}
      if (b.specialization === "Generalist" && a.specialization !== "Generalist") {return 1;}
      return b.energy - a.energy;
    });

  return candidates[0] ?? null;
}

// ─── Project Type Detection ─────────────────────────────────────

/** Infer the project type from description and stack */
export function detectProjectType(
  description: string,
  stack?: ProjectStack,
): ProjectType {
  const text = description.toLowerCase();

  // Music keywords
  if (/\b(song|music|audio|album|track|beat|melody|compose|instrument|lyric)\b/.test(text)) {
    return "music";
  }
  // Visual art keywords
  if (/\b(paint|drawing|sketch|illustration|canvas|gallery|sculpture|artwork|graphic design)\b/.test(text)) {
    return "visual-art";
  }
  // Literature keywords
  if (/\b(poem|poetry|novel|story|essay|philosophy|prose|screenplay|book|manuscript)\b/.test(text)) {
    return "literature";
  }
  // Research keywords
  if (/\b(research|study|paper|thesis|experiment|hypothesis|analysis|survey)\b/.test(text)) {
    return "research";
  }
  // Video keywords
  if (/\b(video|film|animation|movie|documentary|storyboard|cinemat)\b/.test(text)) {
    return "video";
  }

  // If there's a software stack, it's software
  if (stack && (stack.languages?.length > 0 || stack.frameworks?.length > 0)) {
    return "software";
  }

  // Default to software
  return "software";
}
