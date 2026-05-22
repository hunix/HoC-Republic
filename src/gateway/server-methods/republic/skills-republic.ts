/**
 * republic.skills.* — Real citizen skill analytics
 *
 * Reads live citizen data from RepublicState to provide:
 *   - Per-specialization skill trees with aggregate proficiency from real citizens
 *   - Domain groupings (Science, Tech, Arts, Governance, etc.)
 *   - Top skilled citizens ranked by mastery
 *   - Skill gap analysis (skills nobody has learned yet)
 *   - Individual citizen skill profiles
 */

import type { GatewayRequestHandlers } from "../types.js";
import { getState } from "../../../republic/state.js";
import { SKILL_TREES, SPECIALIZATIONS } from "../../../republic/utils.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─── Taxonomy ────────────────────────────────────────────────────────────────
// Group the 48+ specializations into logical super-domains for the UI

const DOMAIN_MAP: Record<string, string[]> = {
  "🔬 Science & Research": ["Scientist", "Researcher", "Mathematician", "DataScientist", "HyperdimensionalDataScientist"],
  "⚕️ Medicine & Health": ["Doctor", "Psychologist", "Medic", "AIAssistedHealthcareTechnician", "BCISpecialist", "NeuroinformaticsEngineer"],
  "💻 Technology & Engineering": ["Engineer", "Developer", "Architect", "HardwareTechnician", "DevOpsEngineer", "WebDeveloper", "AutonomousSystemsArchitect"],
  "🔒 Security & Cyber": ["SecurityExpert"],
  "🎮 Game Development": ["GameDeveloper", "3DArtist", "2DArtist", "VFXArtist", "LevelDesigner", "SoundDesigner", "CinematicDirector"],
  "🎬 Cinematic & Creative": ["Filmmaker", "Composer", "Artist", "Musician", "Writer", "Designer", "ContentCreator", "Colorist", "ProductionDesigner", "CastingDirector", "StuntCoordinator"],
  "⚛️ Quantum & Advanced Physics": ["QuantumAlgorithmDesigner", "QuantumHardwareEngineer", "PostQuantumCryptographer"],
  "🧬 Bio & Space Science": ["SynbioEngineer", "Astrobotanist", "AstrobiologicalEngineer", "Nanotechnologist", "SentientMaterialsEngineer"],
  "🚀 Space & Orbital": ["OrbitalTrafficController", "ExtraterrestrialHabitatDesigner", "SpaceResourceExtractionSpecialist"],
  "🤖 AI & Cognitive": ["GenerativeAIArchitect", "AIEthicist", "BCISpecialist"],
  "🏛️ Governance & Society": ["Diplomat", "Negotiator", "Ambassador", "Strategist", "Analyst", "Planner", "ProductManager"],
  "🌾 Production & Services": ["Farmer", "Manufacturer", "ServiceProvider", "Librarian", "Generalist"],
};

// Emoji icon per specialization for the UI
const SPEC_ICONS: Record<string, string> = {
  Scientist: "🔭", Researcher: "📊", Mathematician: "∑", Engineer: "⚙️",
  Developer: "💻", Architect: "🏗️", Doctor: "🩺", Psychologist: "🧠",
  Medic: "💊", Artist: "🎨", Musician: "🎵", Writer: "✍️",
  Diplomat: "🤝", Negotiator: "📋", Ambassador: "🌐", Strategist: "♟️",
  Analyst: "📈", Planner: "📅", Librarian: "📚", Farmer: "🌾",
  Manufacturer: "🏭", ServiceProvider: "🛎️", Generalist: "⭐",
  HardwareTechnician: "🔌", Filmmaker: "🎬", Composer: "🎼",
  WebDeveloper: "🌐", GameDeveloper: "🕹️", DataScientist: "📉",
  Designer: "🖌️", DevOpsEngineer: "🚀", SecurityExpert: "🔒",
  ProductManager: "📦", ContentCreator: "📹",
  "3DArtist": "🗿", "2DArtist": "🖼️", VFXArtist: "✨", LevelDesigner: "🗺️",
  SoundDesigner: "🎙️", CinematicDirector: "🎥", Colorist: "🎨",
  ProductionDesigner: "🏛️", CastingDirector: "🎭", StuntCoordinator: "🤸",
  QuantumAlgorithmDesigner: "⚛️", QuantumHardwareEngineer: "🌀",
  PostQuantumCryptographer: "🔐", AIEthicist: "⚖️",
  NeuroinformaticsEngineer: "🧬", SynbioEngineer: "🧪",
  Astrobotanist: "🌱", OrbitalTrafficController: "🛸",
  ExtraterrestrialHabitatDesigner: "🪐", HyperdimensionalDataScientist: "🌌",
  SentientMaterialsEngineer: "🧲", GenerativeAIArchitect: "🤖",
  BCISpecialist: "🔮", AIAssistedHealthcareTechnician: "🏥",
  AutonomousSystemsArchitect: "🤖", Nanotechnologist: "🔬",
  AstrobiologicalEngineer: "👽", SpaceResourceExtractionSpecialist: "⛏️",
};

// Domain color classes for the UI
const DOMAIN_COLORS = [
  "from-blue-500/20 to-blue-600/10 border-blue-500/30",
  "from-green-500/20 to-green-600/10 border-green-500/30",
  "from-purple-500/20 to-purple-600/10 border-purple-500/30",
  "from-red-500/20 to-red-600/10 border-red-500/30",
  "from-amber-500/20 to-amber-600/10 border-amber-500/30",
  "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30",
  "from-rose-500/20 to-rose-600/10 border-rose-500/30",
  "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
  "from-indigo-500/20 to-indigo-600/10 border-indigo-500/30",
  "from-orange-500/20 to-orange-600/10 border-orange-500/30",
  "from-violet-500/20 to-violet-600/10 border-violet-500/30",
  "from-teal-500/20 to-teal-600/10 border-teal-500/30",
];

// ─── Handlers ────────────────────────────────────────────────────────────────

export const skillsRepublicHandlers: GatewayRequestHandlers = {
  /**
   * republic.skills.list — Main skills catalog
   * Returns all specializations with their skill trees and live citizen proficiency
   */
  "republic.skills.list": ({ params, respond }) => {
    const p = (params ?? {}) as { domain?: string; search?: string; limit?: number };
    const s = getState();
    const citizens = s?.citizens ?? [];

    // Aggregate: for each skill, collect all citizen proficiency values
    const skillAggregates: Record<string, number[]> = {};
    const specCitizenCount: Record<string, number> = {};
    const specMasterySum: Record<string, number> = {};

    for (const c of citizens) {
      const spec = c.specialization;
      specCitizenCount[spec] = (specCitizenCount[spec] ?? 0) + 1;
      specMasterySum[spec] = (specMasterySum[spec] ?? 0) + (c.masteryLevel ?? 0);

      if (c.skillProficiency) {
        for (const [skill, prof] of Object.entries(c.skillProficiency)) {
          const normalized = Math.min(100, Math.round((prof as number) * 100));
          if (!skillAggregates[skill]) { skillAggregates[skill] = []; }
          skillAggregates[skill].push(normalized);
        }
      } else {
        // Older citizens without proficiency map — estimate from masteryLevel
        for (const skill of (c.skills ?? [])) {
          if (!skillAggregates[skill]) { skillAggregates[skill] = []; }
          skillAggregates[skill].push(Math.min(100, Math.round((c.masteryLevel ?? 0.3) * 100)));
        }
      }
    }

    function avgProf(skill: string): number {
      const vals = skillAggregates[skill];
      if (!vals?.length) { return 0; }
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    // Build domain list
    type SkillEntry = { name: string; proficiency: number; citizensWithSkill: number };
    type SpecEntry = { id: string; name: string; icon: string; citizenCount: number; avgMastery: number; skills: SkillEntry[] };
    type DomainEntry = { name: string; color: string; specializations: SpecEntry[] };

    const domainEntries: DomainEntry[] = Object.entries(DOMAIN_MAP).map(([domainName, specs], idx) => {
      const filteredSpecs = specs
        .filter((spec) => {
          if (p.domain && p.domain !== domainName) { return false; }
          if (p.search) {
            const q = p.search.toLowerCase();
            return spec.toLowerCase().includes(q) ||
              (SKILL_TREES[spec] ?? []).some((sk) => sk.toLowerCase().includes(q));
          }
          return true;
        });

      return {
        name: domainName,
        color: DOMAIN_COLORS[idx % DOMAIN_COLORS.length],
        specializations: filteredSpecs.map((spec): SpecEntry => {
          const tree = SKILL_TREES[spec] ?? [];
          const count = specCitizenCount[spec] ?? 0;
          const mastery = count > 0
            ? Math.round(((specMasterySum[spec] ?? 0) / count) * 100)
            : 0;

          return {
            id: spec,
            name: spec.replace(/([A-Z])/g, " $1").trim(),
            icon: SPEC_ICONS[spec] ?? "⚡",
            citizenCount: count,
            avgMastery: mastery,
            skills: tree.map((skillName): SkillEntry => ({
              name: skillName,
              proficiency: avgProf(skillName),
              citizensWithSkill: skillAggregates[skillName]?.length ?? 0,
            })),
          };
        }),
      };
    });

    // Global stats
    const allProfValues = Object.values(skillAggregates).flat();
    const globalAvgProficiency = allProfValues.length > 0
      ? Math.round(allProfValues.reduce((a, b) => a + b, 0) / allProfValues.length)
      : 0;
    const totalUniqueSkills = Object.keys(SKILL_TREES).reduce((s, k) => s + SKILL_TREES[k].length, 0);
    const learnedSkills = Object.keys(skillAggregates).length;
    const masteredSkills = Object.entries(skillAggregates)
      .filter(([, vals]) => vals.some((v) => v >= 90)).length;

    // Top citizens by mastery
    const topCitizens = citizens
      .filter((c) => c.skills?.length > 0)
      .toSorted((a, b) => (b.masteryLevel ?? 0) - (a.masteryLevel ?? 0))
      .slice(0, p.limit ?? 15)
      .map((c) => ({
        id: c.id,
        name: c.name,
        specialization: c.specialization,
        icon: SPEC_ICONS[c.specialization] ?? "⭐",
        mastery: Math.round((c.masteryLevel ?? 0) * 100),
        skillCount: c.skills?.length ?? 0,
        topSkills: (c.skills ?? []).slice(0, 3),
        intelligence: c.intelligence ?? 100,
        learningRate: parseFloat((c.learningRate ?? 1).toFixed(2)),
      }));

    // Skill gaps: skills that exist in SKILL_TREES but no citizen has learned
    const learnedSet = new Set(Object.keys(skillAggregates));
    const skillGaps: { spec: string; skill: string }[] = [];
    for (const [spec, skills] of Object.entries(SKILL_TREES)) {
      for (const skill of skills) {
        if (!learnedSet.has(skill)) {
          skillGaps.push({ spec, skill });
        }
      }
    }

    // Most learned skills across all citizens
    const hotSkills = Object.entries(skillAggregates)
      .toSorted(([, a], [, b]) => b.length - a.length)
      .slice(0, 20)
      .map(([skill, vals]) => ({
        skill,
        citizenCount: vals.length,
        avgProficiency: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
      }));

    respond(true, {
      domains: domainEntries,
      stats: {
        totalSpecializations: SPECIALIZATIONS.length,
        totalSkillsInRegistry: totalUniqueSkills,
        learnedSkills,
        masteredSkills,
        globalAvgProficiency,
        citizensWithSkills: citizens.filter((c) => c.skills?.length > 0).length,
        skillGapCount: skillGaps.length,
      },
      topCitizens,
      hotSkills,
      skillGaps: skillGaps.slice(0, 50),
    }, undefined);
  },

  /**
   * republic.skills.citizen — Detailed skill profile for one citizen
   */
  "republic.skills.citizen": ({ params, respond }) => {
    const p = (params ?? {}) as { citizenId?: string };
    if (!p.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const s = getState();
    const citizen = s?.citizens.find((c) => c.id === p.citizenId);
    if (!citizen) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Citizen not found"));
      return;
    }
    const tree = SKILL_TREES[citizen.specialization] ?? [];
    respond(true, {
      citizenId: citizen.id,
      name: citizen.name,
      specialization: citizen.specialization,
      icon: SPEC_ICONS[citizen.specialization] ?? "⭐",
      skills: citizen.skills ?? [],
      skillProficiency: citizen.skillProficiency ?? {},
      masteryLevel: citizen.masteryLevel ?? 0,
      learningRate: citizen.learningRate ?? 1,
      intelligence: citizen.intelligence ?? 100,
      nextSkillsToLearn: tree.filter((sk) => !(citizen.skills ?? []).includes(sk)).slice(0, 5),
      age: citizen.age,
    }, undefined);
  },
};
