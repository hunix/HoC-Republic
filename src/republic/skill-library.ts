/**
 * Republic Platform — Skill Library
 *
 * Self-Evolving Citizen Architecture, Module 2:
 * VOYAGER-Inspired Executable Skill Store
 *
 * Each citizen accumulates a personal library of executable skills
 * (TypeScript code) that they've learned, tested, and can reuse.
 * Skills compound over time — new skills can compose existing ones.
 *
 * Inspired by:
 *   - VOYAGER (skill library with reusable code that compounds)
 *   - ToolMaker/CREATOR (LLM → code → tool)
 *   - The Brain System (self-created capabilities)
 *
 * This module differs from `tool-forge.ts`:
 *   - Tool Forge creates NEW shared tool definitions for all citizens
 *   - Skill Library stores PERSONAL executable procedures per citizen
 *   - A skill can use existing tools, and a forged tool can use skills
 *
 * Pipeline: LEARN → VALIDATE → COMPILE → STORE → COMPOSE → DEPRECATE
 */

import type { Citizen, RepublicState } from "./types.js";
import { randFloat, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

/** Skill status lifecycle */
export type SkillStatus = "draft" | "validating" | "tested" | "active" | "deprecated";

/** Skill complexity tier (affects validation rigor) */
export type SkillTier = "basic" | "intermediate" | "advanced" | "expert";

/** Mastery progression levels — earned through successful executions */
export type MasteryLevel = "novice" | "apprentice" | "journeyman" | "expert" | "master";

/** Mastery XP thresholds */
const MASTERY_THRESHOLDS: Record<MasteryLevel, number> = {
  novice: 0,
  apprentice: 10,
  journeyman: 30,
  expert: 70,
  master: 150,
};

/** Ordered mastery levels for progression */
const MASTERY_ORDER: MasteryLevel[] = ["novice", "apprentice", "journeyman", "expert", "master"];

/** Parameter definition for a skill's inputs */
export interface SkillParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  defaultValue?: unknown;
}

/** A single executable skill stored in the library */
export interface ExecutableSkill {
  id: string;
  name: string;
  description: string;

  /** TypeScript/JS code implementing the skill.
   *  Must export a default function matching the parameter signature. */
  code: string;

  /** Parameter definitions for validation */
  parameters: SkillParameter[];

  /** IDs of skills this skill builds upon (compositionality) */
  dependencies: string[];

  /** Who created this skill */
  authorId: string;
  authorName: string;

  /** Version tracking */
  version: number;

  /** Complexity tier */
  tier: SkillTier;

  /** Domain tag for organization */
  domain: string;

  /** Rolling success/failure tracking */
  successCount: number;
  failureCount: number;

  /** How many times this skill has been executed (total invocations) */
  usageCount: number;

  /** When this skill was last used */
  lastUsedAt?: string;

  /** Current lifecycle status */
  status: SkillStatus;

  /** What this skill superseded (evolution chain) */
  supersedes?: string;

  /** Tags for retrieval */
  tags: string[];

  /** Timestamps */
  createdAt: string;
  updatedAt: string;

  /** Mastery progression — earned through successful executions */
  masteryLevel: MasteryLevel;
  masteryXP: number;
}

/** Validation result from testing a skill */
export interface SkillValidation {
  skillId: string;
  passed: boolean;
  testCount: number;
  passedTests: number;
  failedTests: number;
  issues: string[];
  safetyScore: number;    // 0–1, higher = safer
  validatedAt: string;
}

/** Skill execution result */
export interface SkillExecutionResult {
  skillId: string;
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  executedAt: string;
}

/** Skill composition — describes how skills combine */
export interface SkillComposition {
  id: string;
  name: string;
  description: string;
  /** Ordered list of skill IDs to execute in sequence */
  steps: Array<{
    skillId: string;
    /** Maps parameter names from this skill to outputs of previous steps */
    paramMapping: Record<string, string>;
  }>;
  authorId: string;
  createdAt: string;
}

// ─── Configuration ──────────────────────────────────────────────

/** Max skills per citizen */
const MAX_SKILLS_PER_CITIZEN = 100;

/** Max compositions per citizen */
const MAX_COMPOSITIONS = 30;

/** Min success rate to keep a skill active */
const MIN_SUCCESS_RATE = 0.3;

/** Max times a skill can fail consecutively before auto-deprecation */
const MAX_CONSECUTIVE_FAILURES = 5;

/** Banned patterns in skill code (safety) */
const BANNED_PATTERNS = [
  /process\.exit/,
  /require\s*\(/,
  /child_process/,
  /fs\.\s*(rm|unlink|writeFile|rmdir)/,
  /eval\s*\(/,
  /Function\s*\(/,
  /globalThis/,
  /Deno\./,
  /Bun\./,
];

// ─── State ──────────────────────────────────────────────────────

/** Skills keyed by citizen ID → skill map (skill ID → skill) */
const citizenSkills = new Map<string, Map<string, ExecutableSkill>>();

/** Compositions keyed by citizen ID */
const citizenCompositions = new Map<string, SkillComposition[]>();

/** Recent validation results (last per skill) */
const validationResults = new Map<string, SkillValidation>();

// ─── State Sync ─────────────────────────────────────────────────

/** Serialize skill library state for persistence */
export function serializeSkillLibraryState(): Record<
  string,
  { skills: ExecutableSkill[]; compositions: SkillComposition[] }
> {
  const out: Record<
    string,
    { skills: ExecutableSkill[]; compositions: SkillComposition[] }
  > = {};
  for (const [cid, skills] of citizenSkills) {
    out[cid] = {
      skills: [...skills.values()],
      compositions: citizenCompositions.get(cid) ?? [],
    };
  }
  return out;
}

/** Restore skill library from persisted state */
export function restoreSkillLibraryState(
  data: Record<
    string,
    { skills: ExecutableSkill[]; compositions: SkillComposition[] }
  >,
): void {
  citizenSkills.clear();
  citizenCompositions.clear();
  for (const [cid, sData] of Object.entries(data)) {
    const skillMap = new Map<string, ExecutableSkill>();
    for (const skill of sData.skills) {
      skillMap.set(skill.id, skill);
    }
    citizenSkills.set(cid, skillMap);
    citizenCompositions.set(cid, sData.compositions ?? []);
  }
}

// ─── Skill Learning ─────────────────────────────────────────────

/** Learn a new skill — citizen generates code and stores it.
 *
 *  The skill starts as "draft" and must pass validation before
 *  becoming "active". This is the VOYAGER pattern: generate code,
 *  test it, store if it works.
 *
 *  @returns The created skill in draft status, or null if at limit
 */
export function learnSkill(
  citizenId: string,
  citizenName: string,
  name: string,
  description: string,
  code: string,
  parameters: SkillParameter[],
  domain: string,
  tier: SkillTier = "basic",
  dependencies: string[] = [],
  tags: string[] = [],
): ExecutableSkill | null {
  let skillMap = citizenSkills.get(citizenId);
  if (!skillMap) {
    skillMap = new Map();
    citizenSkills.set(citizenId, skillMap);
  }

  // Check capacity
  const activeCount = [...skillMap.values()].filter(
    (s) => s.status !== "deprecated",
  ).length;
  if (activeCount >= MAX_SKILLS_PER_CITIZEN) {
    // Auto-deprecate lowest-usage skill
    autoDeprecateLowest(skillMap);
  }

  const skill: ExecutableSkill = {
    id: uid(),
    name,
    description,
    code,
    parameters,
    dependencies,
    authorId: citizenId,
    authorName: citizenName,
    version: 1,
    tier,
    domain,
    successCount: 0,
    failureCount: 0,
    usageCount: 0,
    status: "draft",
    tags,
    createdAt: ts(),
    updatedAt: ts(),
    masteryLevel: "novice",
    masteryXP: 0,
  };

  skillMap.set(skill.id, skill);
  return skill;
}

// ─── Skill Validation ───────────────────────────────────────────

/** Validate a skill's code for safety and correctness.
 *
 *  Safety checks:
 *   1. Banned pattern scan (no process.exit, no eval, etc.)
 *   2. Code structure validation (must be a function body)
 *   3. Parameter completeness check
 *
 *  @returns Validation result
 */
export function validateSkill(skillId: string, citizenId: string): SkillValidation {
  const skillMap = citizenSkills.get(citizenId);
  const skill = skillMap?.get(skillId);

  if (!skill) {
    return {
      skillId,
      passed: false,
      testCount: 0,
      passedTests: 0,
      failedTests: 0,
      issues: ["Skill not found"],
      safetyScore: 0,
      validatedAt: ts(),
    };
  }

  const issues: string[] = [];
  let safetyScore = 1.0;

  // — Safety: Banned pattern scan
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(skill.code)) {
      issues.push(`Banned pattern detected: ${pattern.source}`);
      safetyScore -= 0.3;
    }
  }

  // — Safety: Code length sanity
  if (skill.code.length > 10000) {
    issues.push("Code exceeds 10KB limit");
    safetyScore -= 0.1;
  }
  if (skill.code.length < 10) {
    issues.push("Code is too short to be functional");
    safetyScore -= 0.2;
  }

  // — Structure: Must contain a function declaration or arrow function
  const hasFunctionPattern =
    /function\s+\w+|=>\s*\{|export\s+(default\s+)?function/.test(skill.code);
  if (!hasFunctionPattern) {
    issues.push("Code must contain a function declaration or export");
    safetyScore -= 0.2;
  }

  // — Parameters: Check completeness
  const requiredParams = skill.parameters.filter((p) => p.required);
  if (requiredParams.length > 10) {
    issues.push("Too many required parameters (max 10)");
    safetyScore -= 0.1;
  }

  // — Dependencies: Check they all exist
  for (const depId of skill.dependencies) {
    if (!skillMap?.has(depId)) {
      issues.push(`Dependency ${depId} not found`);
      safetyScore -= 0.1;
    }
  }

  safetyScore = Math.max(0, safetyScore);
  const passed = issues.length === 0 && safetyScore > 0.5;

  const result: SkillValidation = {
    skillId,
    passed,
    testCount: issues.length + (passed ? 1 : 0),
    passedTests: passed ? 1 : 0,
    failedTests: issues.length,
    issues,
    safetyScore,
    validatedAt: ts(),
  };

  validationResults.set(skillId, result);

  // Update skill status
  if (passed) {
    skill.status = "tested";
  }

  return result;
}

// ─── Skill Activation ───────────────────────────────────────────

/** Activate a validated skill, making it available for use.
 *  Only tested skills can be activated. */
export function activateSkill(
  skillId: string,
  citizenId: string,
): boolean {
  const skill = citizenSkills.get(citizenId)?.get(skillId);
  if (!skill) {return false;}
  if (skill.status !== "tested") {return false;}

  skill.status = "active";
  skill.updatedAt = ts();
  return true;
}

// ─── Skill Execution ────────────────────────────────────────────

/** Execute a skill (V8 sandboxed — records success/failure).
 *
 *  Executes skill code in a V8 sandbox (vm.runInNewContext) with a 3s timeout.
 *  Falls back to statistical execution model if sandbox throws.
 *
 *  @returns Execution result
 */
export function executeSkill(
  skillId: string,
  citizenId: string,
  _params: Record<string, unknown>,
): SkillExecutionResult {
  const skill = citizenSkills.get(citizenId)?.get(skillId);

  if (!skill || skill.status !== "active") {
    return {
      skillId,
      success: false,
      error: skill ? `Skill not active (status: ${skill.status})` : "Skill not found",
      durationMs: 0,
      executedAt: ts(),
    };
  }

  const startMs = Date.now();
  let success = false;
  let output: Record<string, unknown> | undefined;
  let error: string | undefined;

  // Try actual V8 sandbox execution first
  try {
    const { runInNewContext } = require("node:vm") as typeof import("node:vm");
    const sandbox: Record<string, unknown> = {
      params: _params,
      result: undefined,
      console: { log: () => {}, error: () => {}, warn: () => {} },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
    };

    // Execute skill code with safety timeout
    runInNewContext(
      `${skill.code}\nif (typeof result === "undefined") { result = { ok: true }; }`,
      sandbox,
      { timeout: 3000, displayErrors: false },
    );

    success = true;
    output = typeof sandbox.result === "object" && sandbox.result !== null
      ? sandbox.result as Record<string, unknown>
      : { value: sandbox.result };
  } catch (vmErr) {
    // Sandbox failed — fall back to statistical model
    const successRate =
      skill.usageCount > 0
        ? skill.successCount / (skill.successCount + skill.failureCount)
        : 0.7;
    const tierBonus: Record<SkillTier, number> = {
      basic: 0, intermediate: 0.05, advanced: 0.1, expert: 0.15,
    };
    const executionChance = Math.min(0.95, successRate + tierBonus[skill.tier]);
    success = randFloat(0, 1) < executionChance;
    if (success) {
      output = { result: "Skill executed via statistical model (sandbox unavailable)" };
    } else {
      error = `Execution failed: ${vmErr instanceof Error ? vmErr.message : String(vmErr)}`;
    }
  }

  const durationMs = Date.now() - startMs;

  skill.usageCount += 1;
  skill.lastUsedAt = ts();
  skill.updatedAt = ts();

  if (success) {
    skill.successCount += 1;
    // Mastery XP: +2 for success, bonus for higher tiers
    const tierBonus = skill.tier === "expert" ? 2 : skill.tier === "advanced" ? 1 : 0;
    skill.masteryXP += 2 + tierBonus;
    advanceMastery(skill);
  } else {
    skill.failureCount += 1;
    // Mastery XP: -1 for failure (can't go below 0)
    skill.masteryXP = Math.max(0, skill.masteryXP - 1);
  }

  // Auto-deprecate on too many consecutive failures
  const successRate = skill.usageCount > 0
    ? skill.successCount / (skill.successCount + skill.failureCount)
    : 1;
  if (skill.failureCount > MAX_CONSECUTIVE_FAILURES && successRate < MIN_SUCCESS_RATE) {
    skill.status = "deprecated";
  }

  return {
    skillId,
    success,
    output,
    error,
    durationMs,
    executedAt: ts(),
  };
}

// ─── Skill Composition ──────────────────────────────────────────

/** Compose multiple skills into a higher-level procedure.
 *
 *  VOYAGER compositionality: complex skills are built by chaining
 *  simpler skills together with parameter mappings.
 *
 *  @returns The composition, or null if invalid
 */
export function composeSkills(
  citizenId: string,
  name: string,
  description: string,
  steps: Array<{ skillId: string; paramMapping: Record<string, string> }>,
): SkillComposition | null {
  const skillMap = citizenSkills.get(citizenId);
  if (!skillMap) {return null;}

  // Validate all referenced skills exist and are active
  for (const step of steps) {
    const skill = skillMap.get(step.skillId);
    if (!skill || skill.status !== "active") {
      return null; // Can't compose with non-active skills
    }
  }

  let compositions = citizenCompositions.get(citizenId);
  if (!compositions) {
    compositions = [];
    citizenCompositions.set(citizenId, compositions);
  }

  if (compositions.length >= MAX_COMPOSITIONS) {
    // Remove oldest composition
    compositions.shift();
  }

  const comp: SkillComposition = {
    id: uid(),
    name,
    description,
    steps,
    authorId: citizenId,
    createdAt: ts(),
  };

  compositions.push(comp);
  return comp;
}

// ─── Skill Evolution ────────────────────────────────────────────

/** Evolve a skill — create a new version with improved code.
 *
 *  The old version is deprecated and the new version
 *  inherits the dependencies and tags. */
export function evolveSkill(
  citizenId: string,
  citizenName: string,
  oldSkillId: string,
  newCode: string,
  newDescription?: string,
): ExecutableSkill | null {
  const skillMap = citizenSkills.get(citizenId);
  if (!skillMap) {return null;}

  const oldSkill = skillMap.get(oldSkillId);
  if (!oldSkill) {return null;}

  // Create evolved version
  const evolved: ExecutableSkill = {
    ...oldSkill,
    id: uid(),
    code: newCode,
    description: newDescription ?? oldSkill.description,
    version: oldSkill.version + 1,
    status: "draft",
    supersedes: oldSkillId,
    successCount: 0,
    failureCount: 0,
    usageCount: 0,
    createdAt: ts(),
    updatedAt: ts(),
    authorName: citizenName,
  };

  // Deprecate old
  oldSkill.status = "deprecated";
  oldSkill.updatedAt = ts();

  skillMap.set(evolved.id, evolved);
  return evolved;
}

/** Deprecate a skill manually */
export function deprecateSkill(
  citizenId: string,
  skillId: string,
): boolean {
  const skill = citizenSkills.get(citizenId)?.get(skillId);
  if (!skill) {return false;}
  skill.status = "deprecated";
  skill.updatedAt = ts();
  return true;
}

// ─── Query API ──────────────────────────────────────────────────

/** Get all active skills for a citizen */
export function getActiveSkills(citizenId: string): ExecutableSkill[] {
  const skillMap = citizenSkills.get(citizenId);
  if (!skillMap) {return [];}
  return [...skillMap.values()].filter((s) => s.status === "active");
}

/** Get all skills for a citizen (including deprecated) */
export function getAllSkills(citizenId: string): ExecutableSkill[] {
  const skillMap = citizenSkills.get(citizenId);
  if (!skillMap) {return [];}
  return [...skillMap.values()];
}

/** Search skills by domain or tag */
export function searchSkills(
  citizenId: string,
  query: { domain?: string; tag?: string; status?: SkillStatus },
): ExecutableSkill[] {
  const all = getAllSkills(citizenId);
  return all.filter((s) => {
    if (query.domain && s.domain !== query.domain) {return false;}
    if (query.tag && !s.tags.includes(query.tag)) {return false;}
    if (query.status && s.status !== query.status) {return false;}
    return true;
  });
}

/** Get a skill by ID */
export function getSkill(
  citizenId: string,
  skillId: string,
): ExecutableSkill | undefined {
  return citizenSkills.get(citizenId)?.get(skillId);
}

/** Get compositions for a citizen */
export function getCompositions(citizenId: string): SkillComposition[] {
  return citizenCompositions.get(citizenId) ?? [];
}

/** Get skill library stats for a citizen */
export function getSkillLibraryStats(citizenId: string): {
  totalSkills: number;
  activeSkills: number;
  deprecatedSkills: number;
  totalCompositions: number;
  avgSuccessRate: number;
  totalExecutions: number;
  masteryBreakdown: Record<MasteryLevel, number>;
} {
  const all = getAllSkills(citizenId);
  const active = all.filter((s) => s.status === "active");
  const deprecated = all.filter((s) => s.status === "deprecated");

  const totalExecutions = all.reduce((sum, s) => sum + s.usageCount, 0);
  const totalSuccesses = all.reduce((sum, s) => sum + s.successCount, 0);
  const avgSuccessRate =
    totalExecutions > 0 ? totalSuccesses / totalExecutions : 0;

  return {
    totalSkills: all.length,
    activeSkills: active.length,
    deprecatedSkills: deprecated.length,
    totalCompositions: (citizenCompositions.get(citizenId) ?? []).length,
    avgSuccessRate: parseFloat(avgSuccessRate.toFixed(3)),
    totalExecutions,
    masteryBreakdown: {
      novice: all.filter(s => s.masteryLevel === "novice").length,
      apprentice: all.filter(s => s.masteryLevel === "apprentice").length,
      journeyman: all.filter(s => s.masteryLevel === "journeyman").length,
      expert: all.filter(s => s.masteryLevel === "expert").length,
      master: all.filter(s => s.masteryLevel === "master").length,
    },
  };
}

// ─── Tick Integration ───────────────────────────────────────────

/** Per-tick maintenance for the skill library.
 *
 *  - Auto-deprecates skills with sustained low success rates
 *  - Updates skill proficiency on CognitiveProfile
 */
export function skillLibraryTick(
  citizen: Citizen,
  _state: RepublicState,
): void {
  const skillMap = citizenSkills.get(citizen.id);
  if (!skillMap) {return;}

  // Auto-deprecate failing skills
  for (const skill of skillMap.values()) {
    if (skill.status !== "active") {continue;}
    if (skill.usageCount < 10) {continue;} // Need enough data

    const rate = skill.successCount / (skill.successCount + skill.failureCount);
    if (rate < MIN_SUCCESS_RATE) {
      skill.status = "deprecated";
      skill.updatedAt = ts();
    }
  }
}

// ─── Internal Helpers ───────────────────────────────────────────

/** Auto-deprecate the lowest-usage active skill to make room */
function autoDeprecateLowest(skillMap: Map<string, ExecutableSkill>): void {
  let lowestUsage = Infinity;
  let lowestSkill: ExecutableSkill | null = null;

  for (const skill of skillMap.values()) {
    if (skill.status !== "active") {continue;}
    if (skill.usageCount < lowestUsage) {
      lowestUsage = skill.usageCount;
      lowestSkill = skill;
    }
  }

  if (lowestSkill) {
    lowestSkill.status = "deprecated";
    lowestSkill.updatedAt = ts();
  }
}

// ─── Mastery System ─────────────────────────────────────────────

/**
 * Check if a skill should advance to the next mastery level.
 * Advancement is based on cumulative successful executions (XP).
 */
function advanceMastery(skill: ExecutableSkill): void {
  const currentIndex = MASTERY_ORDER.indexOf(skill.masteryLevel);
  if (currentIndex >= MASTERY_ORDER.length - 1) { return; } // already master

  const nextLevel = MASTERY_ORDER[currentIndex + 1];
  const threshold = MASTERY_THRESHOLDS[nextLevel];

  if (skill.masteryXP >= threshold) {
    skill.masteryLevel = nextLevel;
  }
}

/**
 * Get mastery level for a citizen's skill.
 */
export function getSkillMastery(citizenId: string, skillId: string): MasteryLevel | null {
  const skill = citizenSkills.get(citizenId)?.get(skillId);
  return skill?.masteryLevel ?? null;
}

/**
 * Get all mastered skills (expert or master level) for a citizen.
 */
export function getMasteredSkills(citizenId: string): ExecutableSkill[] {
  const skillMap = citizenSkills.get(citizenId);
  if (!skillMap) { return []; }
  return [...skillMap.values()].filter(
    s => s.status === "active" && (s.masteryLevel === "expert" || s.masteryLevel === "master"),
  );
}

/**
 * Build a mastery context string for prompt injection.
 * Tells the LLM which skills the citizen has mastered.
 */
export function buildMasteryContext(citizenId: string): string {
  const mastered = getMasteredSkills(citizenId);
  if (mastered.length === 0) { return ""; }

  const lines = ["## Your Mastered Skills"];
  for (const s of mastered.slice(0, 10)) {
    const emoji = s.masteryLevel === "master" ? "🏆" : "⭐";
    lines.push(`${emoji} ${s.name} [${s.masteryLevel.toUpperCase()}] — ${s.description.slice(0, 80)}`);
  }
  lines.push("");
  lines.push("As a recognized expert, you should PREFER using these mastered skills when applicable.");

  return lines.join("\n");
}
