/**
 * seed-knowledge.ts — Deep Knowledge, Skills & Tools Seeding
 *
 * Bootstraps every citizen with professional profiles, seeds the
 * global knowledge base with peer-reviewed articles, populates the
 * tool library with forged instruments, and primes the curriculum
 * frontier so the curiosity engine thrives from tick 0.
 *
 * Called once from `seed-state.ts` during initial state construction.
 */

import type { FrontierNode } from "./curiosity-engine.js";
import type { KnowledgeArticle } from "./research-engine.js";
import type { ForgedTool } from "./tool-forge.js";
import type {
  Certification,
  Citizen,
  ProfessionalProfile,
  ProficiencyRecord,
  RepublicState,
} from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Static data (extracted to seed-knowledge/ submodules) ───────————
export type { ArticleSeed } from "./seed-knowledge/articles.js";
export { ARTICLE_SEEDS } from "./seed-knowledge/articles.js";
import type { ArticleSeed } from "./seed-knowledge/articles.js";
import { ARTICLE_SEEDS } from "./seed-knowledge/articles.js";

export type { ToolSeed } from "./seed-knowledge/tools.js";
export { TOOL_SEEDS } from "./seed-knowledge/tools.js";
import type { ToolSeed } from "./seed-knowledge/tools.js";
import { TOOL_SEEDS } from "./seed-knowledge/tools.js";

// ─── Specialization → Domain Path Mapping ───────────────────────

/**
 * Maps citizen specializations to their most relevant domain paths.
 * Each specialization gets a primary path and an optional secondary.
 */
const SPEC_DOMAIN_MAP: Record<string, { primary: string; secondary?: string }> = {
  Scientist: { primary: "Science", secondary: "Science.Physics" },
  Researcher: { primary: "Science.DataScience", secondary: "Science.Biology" },
  Mathematician: { primary: "Science.Physics", secondary: "Science.DataScience" },
  Engineer: { primary: "Engineering.Software", secondary: "Engineering" },
  Developer: {
    primary: "Engineering.Software.NodeJS",
    secondary: "Engineering.Software.TypeScript",
  },
  WebDeveloper: { primary: "Engineering.Software.React", secondary: "Engineering.Software.NodeJS" },
  GameDeveloper: {
    primary: "Engineering.Software.GameDev.R3F",
    secondary: "Engineering.Software.GameDev.Animation",
  },
  DevOpsEngineer: { primary: "Engineering.Software.NodeJS", secondary: "Cybersecurity" },
  Architect: { primary: "Design.Architecture", secondary: "Engineering.Software" },
  Doctor: { primary: "Medicine", secondary: "Medicine.InternalMedicine" },
  Psychologist: { primary: "Humanities.Psychology", secondary: "Humanities.Psychology.Clinical" },
  Artist: { primary: "Arts.VisualArts", secondary: "Arts" },
  Musician: { primary: "Arts.Music", secondary: "Arts.Music.Composition" },
  Writer: { primary: "Arts.CreativeWriting", secondary: "Humanities" },
  Diplomat: { primary: "Humanities.PoliticalScience", secondary: "Law.InternationalLaw" },
  Strategist: { primary: "Finance", secondary: "Humanities.PoliticalScience" },
  Analyst: { primary: "Science.DataScience", secondary: "Finance.Investment" },
  Planner: { primary: "Design.UrbanPlanning", secondary: "Humanities.Economics" },
  Librarian: { primary: "Humanities", secondary: "Humanities.History" },
  Farmer: { primary: "Agriculture", secondary: "Agriculture.AgriTech" },
  Manufacturer: { primary: "Engineering.Mechanical", secondary: "Engineering.Chemical" },
  ServiceProvider: { primary: "Humanities.Education", secondary: "Humanities.Psychology.IO" },
  Generalist: { primary: "Humanities", secondary: "Science" },
  HardwareTechnician: { primary: "Engineering.Electrical", secondary: "Cybersecurity" },
};

// ─── Certification Levels by XP ─────────────────────────────────

type CertLevel = "certificate" | "bachelor" | "master" | "doctorate";

const CERT_LEVELS: CertLevel[] = ["certificate", "bachelor", "master", "doctorate"];

/** Generate a plausible certification level based on citizen age and skill count */
function levelForCitizen(citizen: Citizen): CertLevel {
  const score = Math.min(citizen.age * 0.5 + citizen.skillCount * 15, 100);
  if (score > 85) {
    return "doctorate";
  }
  if (score > 60) {
    return "master";
  }
  if (score > 35) {
    return "bachelor";
  }
  return "certificate";
}

/** XP thresholds per level */
const XP_BY_LEVEL: Record<CertLevel, [number, number]> = {
  certificate: [100, 299],
  bachelor: [300, 599],
  master: [600, 999],
  doctorate: [1000, 2000],
};

// ─── Phase 2: Seed Professional Profiles ────────────────────────

/**
 * Bootstrap every citizen with a professional profile including
 * certifications and proficiency records aligned to their specialization.
 */
export function seedProfessionalProfiles(citizens: Citizen[]): void {
  for (const citizen of citizens) {
    if (citizen.professionalProfile) {
      continue;
    }

    const mapping = SPEC_DOMAIN_MAP[citizen.specialization] ?? SPEC_DOMAIN_MAP.Generalist;
    const level = levelForCitizen(citizen);
    const levelIdx = CERT_LEVELS.indexOf(level);
    const xpRange = XP_BY_LEVEL[level];
    const baseXP = xpRange[0] + Math.floor((xpRange[1] - xpRange[0]) * (citizen.age / 120));

    // Build primary certification
    const primaryCert: Certification = {
      id: `cert-${uid()}`,
      domainPath: mapping.primary,
      level,
      earnedAt: ts(),
      valid: true,
    };

    // Build secondary certification (one level lower, if applicable)
    const certs: Certification[] = [primaryCert];
    if (mapping.secondary && levelIdx > 0) {
      certs.push({
        id: `cert-${uid()}`,
        domainPath: mapping.secondary,
        level: CERT_LEVELS[levelIdx - 1],
        earnedAt: ts(),
        valid: true,
      });
    }

    // Build proficiency records
    const proficiencies: Record<string, ProficiencyRecord> = {};

    proficiencies[mapping.primary] = {
      domainPath: mapping.primary,
      level,
      xp: baseXP,
      casesCompleted: Math.floor(baseXP / 25),
      practiceHours: Math.floor(baseXP * 1.5),
      peerRating: 3.0 + levelIdx * 0.5,
      toolProficiencies: citizen.skills.slice(0, 3),
      lastStudied: ts(),
    };

    if (mapping.secondary) {
      const secLevel = levelIdx > 0 ? CERT_LEVELS[levelIdx - 1] : CERT_LEVELS[0];
      const secXP = Math.floor(baseXP * 0.6);
      proficiencies[mapping.secondary] = {
        domainPath: mapping.secondary,
        level: secLevel,
        xp: secXP,
        casesCompleted: Math.floor(secXP / 30),
        practiceHours: Math.floor(secXP * 1.2),
        peerRating: 2.5 + levelIdx * 0.4,
        toolProficiencies: citizen.skills.slice(0, 2),
        lastStudied: ts(),
      };
    }

    const profile: ProfessionalProfile = {
      certifications: certs,
      proficiencies,
      totalCasesCompleted: Object.values(proficiencies).reduce(
        (sum, p) => sum + p.casesCompleted,
        0,
      ),
      peerReviewAverage:
        Object.values(proficiencies).reduce((sum, p) => sum + p.peerRating, 0) /
        Object.values(proficiencies).length,
    };

    citizen.professionalProfile = profile;
  }
}

// ARTICLE_SEEDS: 1,108 lines of static article data now in seed-knowledge/articles.ts

export function seedKnowledgeBase(s: RepublicState, citizens: Citizen[]): void {
  if (!s.knowledgeBase) {
    s.knowledgeBase = [];
  }

  for (const seed of ARTICLE_SEEDS) {
    // Find a citizen whose domain aligns with this article
    const author =
      citizens.find((c) => {
        const mapping = SPEC_DOMAIN_MAP[c.specialization];
        if (!mapping) {
          return false;
        }
        return seed.domainPath.startsWith(mapping.primary.split(".")[0]);
      }) ?? citizens[0];

    const article: KnowledgeArticle = {
      id: `ka-${uid()}`,
      title: seed.title,
      domainPath: seed.domainPath,
      abstract: seed.abstract,
      findings: seed.findings,
      methodology: seed.methodology,
      conclusions: seed.conclusions,
      authorId: author.id,
      authorName: author.name,
      researchSessionId: `rs-seed-${uid()}`,
      questionId: `rq-seed-${uid()}`,
      confidence: 0.75 + (seed.isNovel ? 0.1 : 0.15),
      peerReviewScore: 3.5 + (seed.isNovel ? 0.8 : 0.5),
      reviewCount: seed.isNovel ? 3 : 5,
      citedBy: [],
      references: [],
      isNovel: seed.isNovel,
      impactScore: seed.isNovel ? 0.7 + Math.random() * 0.25 : 0.4 + Math.random() * 0.3,
      publishedAt: ts(),
      lastUpdatedAt: ts(),
    };

    s.knowledgeBase.push(article);
  }

  // Wire up some cross-citations to build a citation network
  const articles = s.knowledgeBase;
  for (let i = 0; i < articles.length; i++) {
    // Each article cites 1-3 earlier articles in related domains
    for (let j = 0; j < i && articles[i].references.length < 3; j++) {
      const sameDomainRoot =
        articles[j].domainPath.split(".")[0] === articles[i].domainPath.split(".")[0];
      if (sameDomainRoot) {
        articles[i].references.push(articles[j].id);
        articles[j].citedBy.push(articles[i].id);
      }
    }
  }
}

// ─── Phase 4: Seed Forged Tools ─────────────────────────────────

// TOOL_SEEDS: 485 lines of static tool data now in seed-knowledge/tools.ts

export function seedToolLibrary(s: RepublicState, citizens: Citizen[]): void {
  if (!s.toolLibrary) {
    s.toolLibrary = [];
  }

  for (const seed of TOOL_SEEDS) {
    const author =
      citizens.find((c) => {
        const mapping = SPEC_DOMAIN_MAP[c.specialization];
        if (!mapping) {
          return false;
        }
        return seed.domainPath.startsWith(mapping.primary.split(".")[0]);
      }) ?? citizens[0];

    const tool: ForgedTool = {
      id: `ft-${uid()}`,
      toolDefinition: {
        id: `tool-${uid()}`,
        name: seed.name,
        description: seed.description,
        tier: seed.tier,
        category: seed.category,
        parameters: seed.params,
        enabled: true,
        timeoutMs: 5000,
        estimatedCost: { computeMs: 500 },
      },
      forgingSessionId: `fs-seed-${uid()}`,
      authorId: author.id,
      authorName: author.name,
      domainPath: seed.domainPath,
      code: seed.code,
      qualityScore: 0.7 + Math.random() * 0.25,
      qaIterations: 3,
      usageCount: Math.floor(Math.random() * 50) + 5,
      forgedAt: ts(),
      version: 1,
    };

    s.toolLibrary.push(tool);
  }
}

// ─── Phase 5: Seed Curriculum Frontier ──────────────────────────

/** Core domain paths that should always have frontier nodes */
export const FRONTIER_DOMAINS = [
  { path: "Medicine", name: "Medicine" },
  { path: "Engineering.Software", name: "Software Engineering" },
  { path: "Engineering.AI", name: "AI Engineering" },
  { path: "Science.DataScience", name: "Data Science" },
  { path: "Science.QuantumComputing", name: "Quantum Computing" },
  { path: "Cybersecurity", name: "Cybersecurity" },
  { path: "Finance", name: "Finance" },
  { path: "Law", name: "Law" },
  { path: "Humanities.Psychology", name: "Psychology" },
  { path: "Humanities.Education", name: "Education" },
  { path: "Humanities.Philosophy", name: "Philosophy" },
  { path: "Science.Environmental", name: "Environmental Science" },
  { path: "Engineering.Robotics", name: "Robotics" },
  { path: "Engineering.Aerospace", name: "Aerospace Engineering" },
  { path: "Agriculture", name: "Agricultural Science" },
  { path: "Arts.Music", name: "Music" },
  { path: "Design.UrbanPlanning", name: "Urban Planning" },
  { path: "Science.Neuroscience", name: "Neuroscience" },
  { path: "Science.MaterialsScience", name: "Materials Science" },
  { path: "Humanities.Linguistics", name: "Linguistics" },
  { path: "Humanities.Economics", name: "Economics" },
  { path: "Humanities.History", name: "History" },
  { path: "Humanities.PoliticalScience", name: "Political Science" },
  { path: "Arts.VisualArts", name: "Visual Arts" },
  { path: "Arts.CreativeWriting", name: "Creative Writing" },
  // ── Web Development Curriculum Frontiers ──
  { path: "Engineering.Software.NodeJS", name: "Node.js Runtime & Architecture" },
  { path: "Engineering.Software.TypeScript", name: "TypeScript Type System & Tooling" },
  { path: "Engineering.Software.React", name: "React Architecture & Patterns" },
  { path: "Engineering.Software.FullStack", name: "Full-Stack Web Engineering" },
  // ── 3D Game Development Curriculum Frontiers ──
  { path: "Engineering.Software.GameDev.R3F", name: "React Three Fiber & 3D Game Engines" },
  { path: "Engineering.Software.GameDev.Physics", name: "Game Physics & RAPIER Simulation" },
  { path: "Engineering.Software.GameDev.Animation", name: "3D Animation & Motion Systems" },
  { path: "Engineering.Software.GameDev.Rendering", name: "PBR Rendering & Visual Effects" },
  { path: "Engineering.Software.GameDev.Shaders", name: "Custom Shaders & GPU Programming" },
  { path: "Engineering.Software.GameDev.Architecture", name: "ECS Game Architecture" },
  { path: "Engineering.Software.GameDev.Multiplayer", name: "Multiplayer Networking & Colyseus" },
  { path: "Engineering.Software.GameDev.WebGPU", name: "WebGPU Compute & Next-Gen Rendering" },
];

/**
 * Seed the curriculum frontier so the curiosity engine has
 * initial data to generate curriculum goals from.
 */
export function seedCurriculumFrontier(s: RepublicState): void {
  if (!s.curriculumFrontier) {
    s.curriculumFrontier = [];
  }

  for (const fd of FRONTIER_DOMAINS) {
    // Count how many citizens have certs in this domain
    const expertCount = s.citizens.filter((c) =>
      c.professionalProfile?.certifications.some(
        (cert) => cert.domainPath.startsWith(fd.path) && cert.valid,
      ),
    ).length;

    // Determine highest level
    let highestLevel: FrontierNode["highestLevel"] = "none";
    for (const c of s.citizens) {
      if (!c.professionalProfile) {
        continue;
      }
      for (const cert of c.professionalProfile.certifications) {
        if (cert.domainPath.startsWith(fd.path) && cert.valid) {
          const levels: FrontierNode["highestLevel"][] = [
            "none",
            "certificate",
            "bachelor",
            "master",
            "doctorate",
          ];
          if (levels.indexOf(cert.level) > levels.indexOf(highestLevel)) {
            highestLevel = cert.level;
          }
        }
      }
    }

    const node: FrontierNode = {
      domainPath: fd.path,
      domainName: fd.name,
      expertCount,
      highestLevel,
      underserved: expertCount < 3,
      activeResearchQuestions: expertCount > 0 ? Math.min(expertCount, 3) : 0,
      noveltyScore: expertCount === 0 ? 1.0 : Math.max(0.1, 1.0 - expertCount * 0.15),
      nationalPriority:
        fd.path.startsWith("Engineering") ||
        fd.path.startsWith("Medicine") ||
        fd.path.startsWith("Cyber")
          ? 0.8 + Math.random() * 0.2
          : 0.4 + Math.random() * 0.4,
      lastUpdated: ts(),
    };

    s.curriculumFrontier.push(node);
  }
}

// ─── Master Seeding Entrypoint ──────────────────────────────────

/**
 * Master function to seed all knowledge, skills, and tools.
 * Called once from seed-state.ts after citizens are created.
 */
export function seedAllKnowledge(s: RepublicState): void {
  seedProfessionalProfiles(s.citizens);
  seedKnowledgeBase(s, s.citizens);
  seedToolLibrary(s, s.citizens);
  seedCurriculumFrontier(s);
}
