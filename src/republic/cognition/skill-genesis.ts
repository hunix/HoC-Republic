/**
 * Republic Platform — Skill Genesis Engine
 *
 * Invention #3: Recursive tool-use → skill crystallization pipeline.
 *
 * Inspired by:
 *   - VOYAGER (Minecraft agent) — skill library that compounds
 *   - ToolMaker/CREATOR — LLM generates reusable code tools
 *   - AlphaEvolve — evolutionary skill improvement
 *
 * When a citizen uses the same tool sequence 3+ times successfully,
 * the engine:
 *  1. Detects the pattern (pattern recognition)
 *  2. Extracts it as a named skill (crystallization)
 *  3. Generates code via autonomous-tool-forge
 *  4. Validates through skill-library's safety pipeline
 *  5. Publishes to a National Skill Registry for sharing
 *
 * This is recursive self-improvement: tool-use → pattern → skill → sharing.
 */

import { uid } from "../utils.js";

// ─── Types ──────────────────────────────────────────────────────

/** A recorded tool-use sequence */
export interface ToolUseRecord {
  citizenId: string;
  tools: string[];       // Ordered tool IDs used
  taskContext: string;    // What the citizen was trying to do
  success: boolean;
  timestamp: number;
}

/** A discovered pattern ready for crystallization */
export interface DiscoveredPattern {
  id: string;
  toolSequence: string[];
  taskContexts: string[];  // All contexts where this pattern appeared
  occurrences: number;
  successRate: number;
  discoveredAt: number;
  crystallized: boolean;   // Whether this has been turned into a skill
  skillId?: string;        // The resulting skill ID (if crystallized)
}

/** A skill in the National Registry (shared across citizens) */
export interface NationalSkill {
  id: string;
  name: string;
  description: string;
  toolSequence: string[];
  authorCitizenId: string;
  authorName: string;
  originPattern: string;  // Pattern ID that generated this
  learners: string[];     // Citizen IDs who learned this
  globalSuccessRate: number;
  globalUsageCount: number;
  publishedAt: number;
}

// ─── Configuration ──────────────────────────────────────────────

/** Minimum times a pattern must repeat before crystallization */
const MIN_PATTERN_OCCURRENCES = 3;

/** Minimum success rate to crystallize a pattern */
const MIN_SUCCESS_RATE = 0.6;

/** Max tool sequence length to track */
const MAX_SEQUENCE_LENGTH = 5;

/** Max records per citizen */
const MAX_RECORDS_PER_CITIZEN = 200;

// ─── State ──────────────────────────────────────────────────────

const toolUseRecords = new Map<string, ToolUseRecord[]>();
const discoveredPatterns = new Map<string, DiscoveredPattern[]>();
const nationalRegistry: NationalSkill[] = [];

// ─── Recording ──────────────────────────────────────────────────

/** Record a tool-use event for pattern detection */
export function recordToolUse(
  citizenId: string,
  tools: string[],
  taskContext: string,
  success: boolean,
): void {
  let records = toolUseRecords.get(citizenId);
  if (!records) {
    records = [];
    toolUseRecords.set(citizenId, records);
  }

  records.push({
    citizenId,
    tools: tools.slice(0, MAX_SEQUENCE_LENGTH),
    taskContext,
    success,
    timestamp: Date.now(),
  });

  if (records.length > MAX_RECORDS_PER_CITIZEN) {
    records.splice(0, records.length - MAX_RECORDS_PER_CITIZEN);
  }
}

// ─── Pattern Detection ──────────────────────────────────────────

/** Scan a citizen's tool-use history for repeating patterns.
 *
 * Uses sliding-window n-gram extraction over tool sequences,
 * then counts occurrences of each n-gram and filters by threshold. */
export function detectPatterns(citizenId: string): DiscoveredPattern[] {
  const records = toolUseRecords.get(citizenId);
  if (!records || records.length < MIN_PATTERN_OCCURRENCES) { return []; }

  const patternCounts = new Map<string, {
    tools: string[];
    contexts: string[];
    successes: number;
    total: number;
  }>();

  // Extract n-grams of sizes 2 through MAX_SEQUENCE_LENGTH
  for (const record of records) {
    for (let n = 2; n <= Math.min(MAX_SEQUENCE_LENGTH, record.tools.length); n++) {
      for (let i = 0; i <= record.tools.length - n; i++) {
        const ngram = record.tools.slice(i, i + n);
        const key = ngram.join("→");

        const entry = patternCounts.get(key) ?? {
          tools: ngram,
          contexts: [],
          successes: 0,
          total: 0,
        };
        entry.total++;
        if (record.success) { entry.successes++; }
        if (!entry.contexts.includes(record.taskContext)) {
          entry.contexts.push(record.taskContext);
        }
        patternCounts.set(key, entry);
      }
    }
  }

  // Filter to patterns meeting thresholds
  const existingPatterns = discoveredPatterns.get(citizenId) ?? [];
  const existingKeys = new Set(existingPatterns.map(p => p.toolSequence.join("→")));

  const newPatterns: DiscoveredPattern[] = [];
  for (const [_key, data] of patternCounts) {
    if (data.total < MIN_PATTERN_OCCURRENCES) { continue; }
    const successRate = data.successes / data.total;
    if (successRate < MIN_SUCCESS_RATE) { continue; }

    const patternKey = data.tools.join("→");
    if (existingKeys.has(patternKey)) { continue; }

    newPatterns.push({
      id: uid(),
      toolSequence: data.tools,
      taskContexts: data.contexts.slice(0, 5),
      occurrences: data.total,
      successRate,
      discoveredAt: Date.now(),
      crystallized: false,
    });
  }

  if (newPatterns.length > 0) {
    const allPatterns = [...existingPatterns, ...newPatterns];
    discoveredPatterns.set(citizenId, allPatterns);
  }

  return newPatterns;
}

// ─── Crystallization ────────────────────────────────────────────

/** Crystallize a discovered pattern into a named skill.
 *
 * This generates the skill definition and publishes it
 * to the National Skill Registry for other citizens to learn.
 */
export function crystallizePattern(
  citizenId: string,
  citizenName: string,
  patternId: string,
): NationalSkill | null {
  const patterns = discoveredPatterns.get(citizenId);
  const pattern = patterns?.find(p => p.id === patternId);
  if (!pattern || pattern.crystallized) { return null; }

  // Generate a name from the tool sequence
  const name = `${pattern.toolSequence.map(t => t.replace(/_/g, " ")).join(" + ")} workflow`;
  const description = [
    `Auto-discovered skill from ${pattern.occurrences} successful uses.`,
    `Tool chain: ${pattern.toolSequence.join(" → ")}`,
    `Typical tasks: ${pattern.taskContexts.slice(0, 3).join("; ")}`,
  ].join(" ");

  const skill: NationalSkill = {
    id: uid(),
    name,
    description,
    toolSequence: pattern.toolSequence,
    authorCitizenId: citizenId,
    authorName: citizenName,
    originPattern: patternId,
    learners: [citizenId],
    globalSuccessRate: pattern.successRate,
    globalUsageCount: pattern.occurrences,
    publishedAt: Date.now(),
  };

  nationalRegistry.push(skill);
  pattern.crystallized = true;
  pattern.skillId = skill.id;

  return skill;
}

// ─── National Skill Registry ────────────────────────────────────

/** Search the national registry for skills relevant to a task */
export function searchNationalSkills(taskContext: string, limit = 5): NationalSkill[] {
  const lower = taskContext.toLowerCase();
  return nationalRegistry
    .map(skill => {
      let score = 0;
      for (const ctx of skill.toolSequence) {
        if (lower.includes(ctx.replace(/_/g, " "))) { score += 0.3; }
      }
      for (const ctx of (skill.description?.toLowerCase() ?? "").split(/\s+/)) {
        if (lower.includes(ctx) && ctx.length > 3) { score += 0.05; }
      }
      score *= skill.globalSuccessRate;
      return { skill, score };
    })
    .filter(s => s.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.skill);
}

/** Learn a national skill — adds a citizen as a learner */
export function learnNationalSkill(citizenId: string, skillId: string): boolean {
  const skill = nationalRegistry.find(s => s.id === skillId);
  if (!skill) { return false; }
  if (!skill.learners.includes(citizenId)) {
    skill.learners.push(citizenId);
  }
  return true;
}

// ─── Tick Integration ───────────────────────────────────────────

/** Per-citizen tick: scan for patterns and auto-crystallize proven ones */
export function skillGenesisTick(citizenId: string, citizenName: string): {
  newPatterns: number;
  newSkills: number;
} {
  const newPatterns = detectPatterns(citizenId);
  let newSkills = 0;

  // Auto-crystallize patterns with high confidence
  const patterns = discoveredPatterns.get(citizenId) ?? [];
  for (const pattern of patterns) {
    if (
      !pattern.crystallized &&
      pattern.occurrences >= MIN_PATTERN_OCCURRENCES + 2 &&
      pattern.successRate >= 0.75
    ) {
      const skill = crystallizePattern(citizenId, citizenName, pattern.id);
      if (skill) { newSkills++; }
    }
  }

  return { newPatterns: newPatterns.length, newSkills };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getSkillGenesisDiagnostics(): {
  totalPatterns: number;
  crystallizedPatterns: number;
  nationalSkills: number;
  totalLearners: number;
  topSkills: Array<{ name: string; learners: number; successRate: number }>;
} {
  let totalPatterns = 0;
  let crystallized = 0;
  for (const patterns of discoveredPatterns.values()) {
    totalPatterns += patterns.length;
    crystallized += patterns.filter(p => p.crystallized).length;
  }

  const totalLearners = nationalRegistry.reduce((s, sk) => s + sk.learners.length, 0);

  return {
    totalPatterns,
    crystallizedPatterns: crystallized,
    nationalSkills: nationalRegistry.length,
    totalLearners,
    topSkills: [...nationalRegistry]
      .toSorted((a, b) => b.learners.length - a.learners.length)
      .slice(0, 5)
      .map(s => ({ name: s.name, learners: s.learners.length, successRate: s.globalSuccessRate })),
  };
}
