/**
 * Citizen Learning Engine — Full Autonomous Reinforcement Loop
 *
 * Closes every feedback gap in the citizen learning pipeline:
 *
 * 1. SKILL PROFICIENCY WRITE-BACK
 *    recordToolSuccess/Failure() → updates CitizenSkillRecord proficiency
 *    directly from tool execution outcomes (not just education)
 *
 * 2. XP FROM TOOL USE
 *    Every successful tool call awards XP to the citizen with a
 *    learningRate multiplier. At XP thresholds, citizens level up.
 *
 * 3. MASTERY / INTELLIGENCE GROWTH
 *    computeMasteryLevel() derives masteryLevel from the average
 *    weighted skill proficiency across all of the citizen's skills.
 *    growIntelligence() slowly ratchets intelligence as mastery accumulates.
 *
 * 4. SKILL DECAY
 *    Skills not practiced in N ticks lose proficiency at a configurable
 *    rate (use-it-or-lose-it), preventing "free" accumulation from past runs.
 *
 * 5. CURIOSITY → TASK SELECTION
 *    The most recent cognitive cycle's exploration suggestions are converted
 *    into a prompt section that biases what the citizen chooses to work on
 *    next, closing the curiosity → action loop.
 *
 * 6. SPECIALIZATION DRIFT
 *    If a citizen's dominant skill domain consistently differs from their
 *    nominal specialization for 100+ ticks, checkSpecializationDrift()
 *    triggers a drift event and updates the citizen's specialization to
 *    match their actual behavior.
 *
 * 7. CROSS-CITIZEN SKILL TRANSFER
 *    transferSkillKnowledge() is called by the delegation engine when
 *    a mentor/teach action occurs — directly writes proficiency to the
 *    learner's skill record.
 *
 * 8. PROJECT-SEED BIAS FROM SKILL PROFICIENCY
 *    getSkillBiasedProjectWeights() reads a citizen's skillProficiency
 *    map and returns weight multipliers to apply to SPECIALIZATION_PROJECTS
 *    seeds, so citizens who've built many 3D games weight those higher in
 *    future project selection.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import type { Citizen, RepublicState } from "./types.js";
import { addCitizenSkill, getCitizenSkills } from "./republic-db.js";
import { addExperience } from "./experience-replay.js";
import { getCognitiveHistory } from "./republic-db.js";
import { ts } from "./utils.js";

const logger = createSubsystemLogger("republic:learning-engine");

// ─── Configuration ──────────────────────────────────────────────

/** XP thresholds for each level. Level = index+1 when xp >= value. */
const LEVEL_THRESHOLDS = [
  0,     // L1
  100,   // L2
  250,   // L3
  500,   // L4
  900,   // L5
  1400,  // L6
  2100,  // L7
  3000,  // L8
  4200,  // L9
  6000,  // L10 (mastery)
];

/** Base XP per successful tool use (before learningRate multiplier) */
const BASE_XP_SUCCESS = 8;
/** XP for partial success */
const BASE_XP_PARTIAL = 3;
/** XP penalty for failure (negative) */
const BASE_XP_FAILURE = -2;

/** Proficiency gain per successful tool execution */
const PROF_GAIN_SUCCESS = 0.018;
/** Proficiency gain for partial success */
const PROF_GAIN_PARTIAL = 0.007;
/** Proficiency loss for failure */
const PROF_LOSS_FAILURE = 0.005;

/** Ticks of inactivity before skill decay kicks in */
const DECAY_GRACE_TICKS = 50;
/** Proficiency lost per decay tick (applied every 50 ticks) */
const DECAY_RATE_PER_PASS = 0.008;
/** Minimum proficiency a skill can decay to */
const DECAY_FLOOR = 0.05;

/** Ticks of behavioral mismatch before specialization drifts */
const DRIFT_THRESHOLD_TICKS = 100;

/** Intelligence growth per mastery point gained */
const INTELLIGENCE_GROWTH_RATE = 0.12;
/** Maximum intelligence achievable through self-improvement */
const MAX_SELF_INTELLIGENCE = 145;

// ─── Tool → Skill Domain Map ────────────────────────────────────

/**
 * Maps tool names to the skill domain they exercise.
 * Used to determine which skill to credit/debit when a tool runs.
 */
const TOOL_DOMAIN_MAP: Record<string, string> = {
  // Dev tools
  scaffold_project:    "software-engineering",
  write_code:          "software-engineering",
  debug_code:          "software-engineering",
  run_tests:           "software-engineering",
  code_review:         "software-engineering",
  deploy_app:          "software-engineering",
  git_commit:          "software-engineering",
  write_schema:        "database-design",
  agentic_develop:     "software-engineering",
  // Research & knowledge
  research_topic:      "research",
  browse_web:          "research",
  analyze_data:        "data-analysis",
  // Creative
  create_art:          "generative-art",
  generate_music:      "music-composition",
  write_story:         "creative-writing",
  compose_document:    "technical-writing",
  // Science
  run_simulation:      "scientific-modeling",
  analyze_molecule:    "chemistry",
  run_experiment:      "scientific-method",
  // Governance
  propose_bill:        "governance",
  vote:                "governance",
  veto:                "governance",
  negotiate:           "diplomacy",
  // Social
  teach:               "pedagogy",
  mentor:              "pedagogy",
  socialize:           "social-skills",
  collaborate:         "collaboration",
  // Infrastructure
  deploy_container:    "devops",
  configure_service:   "devops",
  monitor_system:      "systems-admin",
  // Finance
  trade:               "finance",
  invest:              "finance",
  audit:               "accounting",
  // Default fallback
  _default:            "general",
};

function getDomain(toolName: string): string {
  return TOOL_DOMAIN_MAP[toolName] ?? TOOL_DOMAIN_MAP._default!;
}

// ─── Per-citizen drift tracker ───────────────────────────────────

/** Tracks consecutive ticks where dominant domain ≠ specialization */
const driftCounter = new Map<string, { domain: string; ticks: number }>();

/** Ring buffer of per-citizen skill last-use ticks for decay */
const skillLastUsedTick = new Map<string, Map<string, number>>();

function markSkillUsed(citizenId: string, domain: string, tick: number): void {
  if (!skillLastUsedTick.has(citizenId)) {
    skillLastUsedTick.set(citizenId, new Map());
  }
  skillLastUsedTick.get(citizenId)!.set(domain, tick);
}

// ─── Core API ───────────────────────────────────────────────────

export type ToolOutcome = "success" | "partial" | "failure";

/**
 * Called after EVERY tool execution from agent-runtime.ts.
 * Updates: skill proficiency, XP, mastery, experience replay.
 */
export function recordToolOutcomeLearning(
  citizen: Citizen,
  toolName: string,
  outcome: ToolOutcome,
  currentTick: number,
  qualityHint = 0.7, // 0-1 quality signal from the action result
): void {
  const domain = getDomain(toolName);

  // ── 1. Update skill proficiency in republic-db ──────────────
  const profDelta =
    outcome === "success" ? PROF_GAIN_SUCCESS * (0.5 + qualityHint * 0.5)
    : outcome === "partial" ? PROF_GAIN_PARTIAL
    : -PROF_LOSS_FAILURE;

  addCitizenSkill({
    citizenId: citizen.id,
    skill: domain,
    proficiency: Math.max(0, profDelta),   // addCitizenSkill handles the update logic
    source: "project",
    learnedAt: ts(),
    lastUsedAt: ts(),
    useCount: 1,
  });

  // ── 2. Mirror into citizen.skillProficiency (in-memory) ─────
  if (!citizen.skillProficiency) {citizen.skillProficiency = {};}
  const current = citizen.skillProficiency[domain] ?? 0;
  citizen.skillProficiency[domain] = Math.max(0, Math.min(1, current + profDelta));

  // Track last used tick for decay
  markSkillUsed(citizen.id, domain, currentTick);

  // ── 3. Award XP with learningRate multiplier ─────────────────
  const rate = citizen.learningRate ?? 1.0;
  const baseXP =
    outcome === "success" ? BASE_XP_SUCCESS
    : outcome === "partial" ? BASE_XP_PARTIAL
    : BASE_XP_FAILURE;
  const xpGain = Math.round(baseXP * rate * (0.8 + qualityHint * 0.4));

  citizen.xp = Math.max(0, (citizen.xp ?? 0) + xpGain);

  // ── 4. Check level-up milestone ──────────────────────────────
  checkLevelUp(citizen, currentTick);

  // ── 5. Feed into experience replay ──────────────────────────
  const replayReward = outcome === "success" ? 0.6 + qualityHint * 0.4
    : outcome === "partial" ? 0.2
    : -0.5;
  addExperience(
    citizen.id,
    toolName,
    domain,
    `tick${currentTick}:${toolName}:${outcome}`,
    outcome === "success" ? "success" : outcome === "partial" ? "partial" : "failure",
    replayReward,
    outcome === "failure" ? 0.85 : 0.4, // failures are more surprising
    currentTick,
  );
}

/**
 * Check XP thresholds and level-up the citizen if needed.
 * Triggers bonuses: learningRate boost, intelligence micro-gain, event.
 */
function checkLevelUp(citizen: Citizen, _tick: number): void {
  const xp = citizen.xp ?? 0;
  let level = 1;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]!) {
      level = i + 1;
      break;
    }
  }

  if (level > (citizen.level ?? 1)) {
    citizen.level = level;
    // At each level: tiny learningRate boost (from 1.0 up to 2.0 at L10)
    citizen.learningRate = Math.min(2.0, 1.0 + (level - 1) * 0.11);
    // Mild intelligence boost from reaching level 5 / 10
    if (level === 5 && (citizen.intelligence ?? 100) < 120) {
      citizen.intelligence = (citizen.intelligence ?? 100) + 3;
    }
    if (level === 10 && (citizen.intelligence ?? 100) < MAX_SELF_INTELLIGENCE) {
      citizen.intelligence = Math.min(MAX_SELF_INTELLIGENCE, (citizen.intelligence ?? 100) + 5);
    }
    logger.info(`[LearningEngine] ${citizen.name} levelled up to L${level}! learningRate=${citizen.learningRate?.toFixed(2)}`);
  }
}

// ─── Mastery & Intelligence Growth ──────────────────────────────

/**
 * Derive and update citizen.masteryLevel from their skillProficiency map.
 * Also triggers slow intelligence growth proportional to mastery gains.
 * Call every 25 ticks per citizen.
 */
export function updateMasteryAndIntelligence(citizen: Citizen): void {
  const profs = citizen.skillProficiency;
  if (!profs || Object.keys(profs).length === 0) {
    // Fall back to republic-db skills if in-memory map is empty
    const dbSkills = getCitizenSkills(citizen.id);
    if (dbSkills.length > 0) {
      const avg = dbSkills.reduce((s, sk) => s + sk.proficiency, 0) / dbSkills.length;
      citizen.masteryLevel = Math.min(1, avg);
    }
    return;
  }

  const values = Object.values(profs);
  // Weighted average: top 3 skills get 2× weight (specialist bonus)
  const sorted = [...values].toSorted((a, b) => b - a);
  const top3Sum = sorted.slice(0, 3).reduce((s, v) => s + v * 2, 0);
  const restSum = sorted.slice(3).reduce((s, v) => s + v, 0);
  const totalWeight = Math.min(3, values.length) * 2 + Math.max(0, values.length - 3);
  const weightedAvg = totalWeight > 0 ? (top3Sum + restSum) / totalWeight : 0;

  const prevMastery = citizen.masteryLevel ?? 0;
  citizen.masteryLevel = Math.min(1, weightedAvg);

  // Intelligence grows slowly when mastery increases
  const masteryGain = Math.max(0, citizen.masteryLevel - prevMastery);
  if (masteryGain > 0) {
    const intel = citizen.intelligence ?? 100;
    if (intel < MAX_SELF_INTELLIGENCE) {
      citizen.intelligence = Math.min(
        MAX_SELF_INTELLIGENCE,
        intel + masteryGain * INTELLIGENCE_GROWTH_RATE,
      );
    }
  }
}

// ─── Skill Decay ────────────────────────────────────────────────

/**
 * Apply use-it-or-lose-it skill decay.
 * Called every 50 ticks. Skills not used for DECAY_GRACE_TICKS lose proficiency.
 */
export function applySkillDecay(citizen: Citizen, currentTick: number): void {
  if (!citizen.skillProficiency) {return;}

  const usageMap = skillLastUsedTick.get(citizen.id);
  for (const [domain, prof] of Object.entries(citizen.skillProficiency)) {
    const lastUsed = usageMap?.get(domain) ?? 0;
    const idleTicks = currentTick - lastUsed;
    if (idleTicks > DECAY_GRACE_TICKS && prof > DECAY_FLOOR) {
      citizen.skillProficiency[domain] = Math.max(DECAY_FLOOR, prof - DECAY_RATE_PER_PASS);
    }
  }
}

// ─── Specialization Drift ────────────────────────────────────────

/**
 * Check if the citizen's actual behavior (dominant skill domain) diverges
 * significantly from their declared specialization. If the mismatch persists
 * for DRIFT_THRESHOLD_TICKS, emit a SpecializationDrift event and update.
 *
 * Returns the new specialization string if drift occurred, else null.
 */
export function checkSpecializationDrift(
  citizen: Citizen,
  state: RepublicState,
): string | null {
  const profs = citizen.skillProficiency;
  if (!profs || Object.keys(profs).length < 3) {return null;}

  // Find dominant domain
  let topDomain = "";
  let topProf = 0;
  for (const [domain, prof] of Object.entries(profs)) {
    if (prof > topProf) { topProf = prof; topDomain = domain; }
  }
  if (!topDomain || topProf < 0.35) {return null;}

  // Map domain → specialization label
  const domainToSpec: Record<string, string> = {
    "software-engineering":  "Developer",
    "data-analysis":         "Analyst",
    "research":              "Researcher",
    "scientific-modeling":   "Scientist",
    "generative-art":        "Artist",
    "music-composition":     "Musician",
    "creative-writing":      "Writer",
    "governance":            "Planner",
    "diplomacy":             "Diplomat",
    "devops":                "Engineer",
    "finance":               "Analyst",
    "pedagogy":              "Researcher",
    "database-design":       "Developer",
    "systems-admin":         "Engineer",
    "chemistry":             "Scientist",
    "scientific-method":     "Scientist",
  };

  const impliedSpec = domainToSpec[topDomain];
  if (!impliedSpec || impliedSpec === citizen.specialization) {
    // No mismatch — reset drift counter
    driftCounter.delete(citizen.id);
    return null;
  }

  // Increment drift counter
  const entry = driftCounter.get(citizen.id);
  if (!entry || entry.domain !== impliedSpec) {
    driftCounter.set(citizen.id, { domain: impliedSpec, ticks: 1 });
    return null;
  }
  entry.ticks++;

  if (entry.ticks >= DRIFT_THRESHOLD_TICKS) {
    const oldSpec = citizen.specialization;
    citizen.specialization = impliedSpec as typeof citizen.specialization;
    driftCounter.delete(citizen.id);

    // Emit event
    state.events.push({
      citizenId: citizen.id,
      citizenName: citizen.name,
      type: "SpecializationDrift",
      description: `🌀 ${citizen.name} shifted from ${oldSpec} → ${impliedSpec} (dominant skill: ${topDomain} at ${(topProf * 100).toFixed(0)}% proficiency)`,
      timestamp: ts(),
    });

    logger.info(`[LearningEngine] Specialization drift: ${citizen.name} ${oldSpec} → ${impliedSpec}`);
    return impliedSpec;
  }

  return null;
}

// ─── Cross-Citizen Skill Transfer ───────────────────────────────

/**
 * Transfer skill knowledge from mentor to learner.
 * Called when a teach/mentor action succeeds.
 * The learner gains (fidelity × mentor's proficiency delta) for the domain.
 */
export function transferSkillKnowledge(
  mentoringCitizenId: string,
  learnerCitizen: Citizen,
  domain: string,
  currentTick: number,
  fidelity = 0.4, // 0-1, how much of the gap closes per session
): void {
  // Get mentor's proficiency
  const mentorSkills = getCitizenSkills(mentoringCitizenId);
  const mentorSkill = mentorSkills.find(s => s.skill === domain);
  const mentorProf = mentorSkill?.proficiency ?? 0.3;

  // Get learner's current proficiency
  const learnerProf = learnerCitizen.skillProficiency?.[domain] ?? 0;
  const gap = mentorProf - learnerProf;
  if (gap <= 0) {return;} // learner already ahead — nothing to transfer

  const gain = gap * fidelity;
  if (gain < 0.001) {return;}

  if (!learnerCitizen.skillProficiency) {learnerCitizen.skillProficiency = {};}
  learnerCitizen.skillProficiency[domain] = Math.min(1, learnerProf + gain);
  markSkillUsed(learnerCitizen.id, domain, currentTick);

  // Also update republic-db skill record
  addCitizenSkill({
    citizenId: learnerCitizen.id,
    skill: domain,
    proficiency: gain,
    source: "collaboration",
    learnedAt: ts(),
    lastUsedAt: ts(),
    useCount: 1,
  });

  // Small XP award for learning from a mentor
  learnerCitizen.xp = (learnerCitizen.xp ?? 0) + Math.round(5 * (learnerCitizen.learningRate ?? 1.0));
  checkLevelUp(learnerCitizen, currentTick);
}

// ─── Curiosity → Task Bias ───────────────────────────────────────

/**
 * Converts the citizen's most recent cognitive cycle exploration suggestions
 * into a prompt section that steers them toward unexplored domains.
 * Only injected when the citizen is in an autonomous working state.
 */
export function buildCuriosityTaskSection(citizen: Citizen): string {
  const history = getCognitiveHistory(citizen.id, 1);
  if (history.length === 0) {return "";}

  const latest = history[0]!;
  if (latest.explorationSuggestions.length === 0) {return "";}
  if (latest.curiosityScore < 0.3) {return "";} // not curious enough to redirect

  const suggestions = latest.explorationSuggestions.slice(0, 3);
  const lines = [
    `## 🧭 Curiosity Compass (score: ${(latest.curiosityScore * 100).toFixed(0)}%)`,
    ``,
    `Your cognitive reflection identified these unexplored areas as high-value:`,
    ...suggestions.map((s, i) =>
      `${i + 1}. **${s.domain}** — ${s.action} (skill gap: ${s.skill})`
    ),
    ``,
    `Consider working in one of these domains. Growth in unexplored areas accelerates mastery.`,
  ];

  return lines.join("\n");
}

// ─── Skill-Biased Project Weights ───────────────────────────────

/**
 * Returns a domain → weight multiplier map based on citizen's skill proficiency.
 * Used by the project seed picker to up-weight seeds in domains the citizen
 * already knows (reinforces existing strengths) and up-weight domains with
 * high curiosity gaps (promotes exploration).
 */
export function getSkillBiasedProjectWeights(citizen: Citizen): Record<string, number> {
  const weights: Record<string, number> = {};
  const profs = citizen.skillProficiency ?? {};

  for (const [domain, prof] of Object.entries(profs)) {
    // Moderate proficiency (0.3–0.7) = highest weight (sweet spot for learning)
    const sweetSpot = 1 - Math.abs(prof - 0.5) * 2; // peaks at 0.5
    weights[domain] = 0.5 + sweetSpot * 1.5;
  }

  return weights;
}

// ─── Batch Tick Functions ────────────────────────────────────────

/**
 * Apply skill decay to all citizens in the state.
 * Call every 50 ticks from agent-runtime.ts.
 */
export function skillDecayTick(state: RepublicState): void {
  const { currentTick } = state;
  for (const citizen of state.citizens) {
    applySkillDecay(citizen, currentTick);
  }
}

/**
 * Update mastery + intelligence for all citizens.
 * Call every 25 ticks from agent-runtime.ts.
 */
export function masteryGrowthTick(state: RepublicState): void {
  for (const citizen of state.citizens) {
    updateMasteryAndIntelligence(citizen);
  }
}

/**
 * Check specialization drift for all citizens.
 * Call every 100 ticks from agent-runtime.ts.
 */
export function specializationDriftTick(state: RepublicState): number {
  let drifts = 0;
  for (const citizen of state.citizens) {
    if (checkSpecializationDrift(citizen, state)) {drifts++;}
  }
  if (drifts > 0) {
    logger.info(`[LearningEngine] Specialization drift tick: ${drifts} citizens evolved`);
  }
  return drifts;
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface LearningDiagnostics {
  citizensWithProficiency: number;
  avgMasteryLevel: number;
  avgLevel: number;
  avgIntelligence: number;
  avgLearningRate: number;
  topSkillDomain: string;
  driftCounterSize: number;
}

export function getLearningDiagnostics(state: RepublicState): LearningDiagnostics {
  const cs = state.citizens;
  if (cs.length === 0) {
    return { citizensWithProficiency: 0, avgMasteryLevel: 0, avgLevel: 0, avgIntelligence: 0, avgLearningRate: 1, topSkillDomain: "none", driftCounterSize: 0 };
  }

  const domainCounts: Record<string, number> = {};
  let withProf = 0;
  let totalMastery = 0, totalLevel = 0, totalIntel = 0, totalRate = 0;

  for (const c of cs) {
    if (c.skillProficiency && Object.keys(c.skillProficiency).length > 0) {
      withProf++;
      for (const d of Object.keys(c.skillProficiency)) {
        domainCounts[d] = (domainCounts[d] ?? 0) + 1;
      }
    }
    totalMastery += c.masteryLevel ?? 0;
    totalLevel += c.level ?? 1;
    totalIntel += c.intelligence ?? 100;
    totalRate += c.learningRate ?? 1;
  }

  const topDomain = Object.entries(domainCounts).toSorted((a, b) => b[1] - a[1])[0]?.[0] ?? "none";

  return {
    citizensWithProficiency: withProf,
    avgMasteryLevel: totalMastery / cs.length,
    avgLevel: totalLevel / cs.length,
    avgIntelligence: totalIntel / cs.length,
    avgLearningRate: totalRate / cs.length,
    topSkillDomain: topDomain,
    driftCounterSize: driftCounter.size,
  };
}
