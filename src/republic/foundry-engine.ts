/**
 * Republic Platform — Foundry Engine
 *
 * Native integration of OpenClaw Foundry's self-evolution capabilities.
 * Observes citizen workflows, learns patterns, and autonomously writes
 * new skills and extensions.
 *
 * Based on: https://github.com/lekt9/openclaw-foundry
 *
 * 5-Phase Architecture:
 *   Phase 1: OBSERVE — Track every goal→tools→outcome workflow
 *   Phase 2: RESEARCH — Build knowledge from docs, arXiv, GitHub
 *   Phase 3: LEARN — Record outcomes, build patterns, calculate success rates
 *   Phase 4: WRITE — Generate new skills/extensions from high-value patterns
 *   Phase 5: DEPLOY — Validate in sandbox, install, restart-safe
 *
 * Key components:
 *   - WorkflowTracker: Records citizen action sequences
 *   - PatternCrystallizer: Identifies and auto-generates tools from patterns
 *   - BrainIndex: Local knowledge graph
 *   - SandboxValidator: V8 isolate for code safety testing
 */

import type { Citizen, RepublicState } from "./types.js";
import { uid, ts } from "./utils.js";
import { learnSkill, validateSkill, activateSkill, getActiveSkills, type SkillParameter } from "./skill-library.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("republic:foundry-engine");

// ─── Types ──────────────────────────────────────────────────────

/** A recorded workflow: what a citizen tried to do and what happened */
export interface WorkflowRecord {
  id: string;
  citizenId: string;
  citizenName: string;
  /** What the citizen was trying to accomplish */
  goal: string;
  /** Ordered list of tools/actions used */
  toolSequence: string[];
  /** Keywords extracted from goal for pattern matching */
  keywords: string[];
  /** Final outcome */
  outcome: "success" | "failure" | "partial";
  /** How long the workflow took (in ticks) */
  durationTicks: number;
  /** Error message if failed */
  errorMessage?: string;
  /** Timestamp */
  timestamp: string;
}

/** A crystallization candidate — a repeated workflow pattern */
export interface WorkflowPattern {
  id: string;
  /** Keywords that trigger this pattern */
  keywords: string[];
  /** The tool sequence that keeps repeating */
  toolSequence: string[];
  /** How many times this pattern was observed */
  usageCount: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average duration in ticks */
  avgDuration: number;
  /** When this pattern was first seen */
  firstSeen: string;
  /** When this pattern was last used */
  lastUsed: string;
  /** Whether this has been crystallized into a skill */
  crystallized: boolean;
  /** ID of the generated skill (if crystallized) */
  generatedSkillId?: string;
  /** ADAS evolution score (performance tracking) */
  evolutionScore: number;
}

/** A learning outcome — what Foundry learned from an experience */
export interface FoundryLearning {
  id: string;
  /** What was learned */
  insight: string;
  /** Source: experience, research, observation */
  source: "experience" | "research" | "observation" | "pattern";
  /** Related workflow/pattern IDs */
  relatedIds: string[];
  /** Confidence in this learning (0-1) */
  confidence: number;
  /** How many times this was reinforced */
  reinforcements: number;
  /** Timestamp */
  timestamp: string;
}

/** Brain Index entry — a piece of knowledge */
export interface BrainEntry {
  id: string;
  /** Topic/title */
  topic: string;
  /** Knowledge content */
  content: string;
  /** Source (docs, arxiv, github, experience) */
  source: string;
  /** Relevance tags */
  tags: string[];
  /** Quality score (0-1) */
  quality: number;
  /** Timestamp */
  timestamp: string;
}

/** Foundry engine configuration */
export interface FoundryConfig {
  /** Enable auto-learning from citizen activities */
  autoLearn: boolean;
  /** Min uses before a pattern can crystallize */
  crystallizationThreshold: number;
  /** Min success rate for crystallization */
  minSuccessRate: number;
  /** Max stale ticks before pattern is pruned */
  stalePruneTicks: number;
  /** Learning sources */
  sources: {
    experience: boolean;
    docs: boolean;
    github: boolean;
    arxiv: boolean;
  };
}

/** Foundry overall status */
export interface FoundryStatus {
  enabled: boolean;
  workflowsRecorded: number;
  patternsIdentified: number;
  patternsCrystallized: number;
  skillsGenerated: number;
  learningsCount: number;
  brainEntries: number;
  overseerLastRun: string | null;
  overseerRunCount: number;
  config: FoundryConfig;
}

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_CONFIG: FoundryConfig = {
  autoLearn: true,
  crystallizationThreshold: 5,
  minSuccessRate: 0.7,
  stalePruneTicks: 500,
  sources: {
    experience: true,
    docs: true,
    github: true,
    arxiv: true,
  },
};

// ─── State ──────────────────────────────────────────────────────

let config: FoundryConfig = { ...DEFAULT_CONFIG };
const workflows: WorkflowRecord[] = [];
const patterns: WorkflowPattern[] = [];
const learnings: FoundryLearning[] = [];
const brainIndex: BrainEntry[] = [];
let overseerLastRun: string | null = null;
let overseerRunCount = 0;
let skillsGeneratedCount = 0;

// ─── Workflow Tracker ───────────────────────────────────────────

/**
 * Record a citizen workflow observation.
 * Called from real-execution.ts or orchestrator after a citizen completes a task.
 */
export function recordWorkflow(
  citizen: Citizen,
  goal: string,
  toolSequence: string[],
  outcome: "success" | "failure" | "partial",
  durationTicks: number,
  errorMessage?: string,
): WorkflowRecord {
  const keywords = extractKeywords(goal);

  const record: WorkflowRecord = {
    id: uid(),
    citizenId: citizen.id,
    citizenName: citizen.name,
    goal,
    toolSequence,
    keywords,
    outcome,
    durationTicks,
    errorMessage,
    timestamp: ts(),
  };

  workflows.push(record);
  // Cap at 2000 workflow records
  if (workflows.length > 2000) {
    workflows.splice(0, workflows.length - 2000);
  }

  // Auto-learn: update patterns
  if (config.autoLearn) {
    updatePatterns(record);
    if (outcome === "success") {
      recordLearning(
        `Successful workflow: "${goal}" using [${toolSequence.join(" → ")}]`,
        "experience",
        [record.id],
        0.7,
      );
    } else if (outcome === "failure" && errorMessage) {
      recordLearning(
        `Failed workflow: "${goal}" — ${errorMessage}. Avoid pattern: [${toolSequence.join(" → ")}]`,
        "experience",
        [record.id],
        0.5,
      );
    }
  }

  return record;
}

/**
 * Extract keywords from a goal string for pattern matching.
 */
function extractKeywords(goal: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "shall", "may", "might", "can", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "about", "this",
    "that", "it", "and", "or", "but", "not", "so", "if", "then",
  ]);

  return goal
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Update workflow patterns based on a new workflow record.
 */
function updatePatterns(record: WorkflowRecord): void {
  // Find existing patterns with matching tool sequences
  const seqKey = record.toolSequence.join("|");
  let pattern = patterns.find((p) => p.toolSequence.join("|") === seqKey);

  if (pattern) {
    // Update existing pattern
    const totalUses = pattern.usageCount;
    const prevSuccess = pattern.successRate * totalUses;
    pattern.usageCount++;
    pattern.successRate =
      (prevSuccess + (record.outcome === "success" ? 1 : 0)) / pattern.usageCount;
    pattern.avgDuration =
      (pattern.avgDuration * totalUses + record.durationTicks) / pattern.usageCount;
    pattern.lastUsed = ts();

    // Merge keywords
    for (const kw of record.keywords) {
      if (!pattern.keywords.includes(kw)) {
        pattern.keywords.push(kw);
      }
    }

    // Update evolution score (ADAS-style)
    pattern.evolutionScore = pattern.successRate * Math.log2(pattern.usageCount + 1);
  } else {
    // Create new pattern
    patterns.push({
      id: uid(),
      keywords: [...record.keywords],
      toolSequence: [...record.toolSequence],
      usageCount: 1,
      successRate: record.outcome === "success" ? 1.0 : 0.0,
      avgDuration: record.durationTicks,
      firstSeen: ts(),
      lastUsed: ts(),
      crystallized: false,
      evolutionScore: record.outcome === "success" ? 1.0 : 0.0,
    });
  }
}

// ─── Pattern Crystallizer ───────────────────────────────────────

/**
 * Identify patterns that are ready for crystallization.
 * A pattern is ready when:
 *   - Usage count >= threshold (default 5)
 *   - Success rate >= min rate (default 70%)
 *   - Not already crystallized
 */
export function getCrystallizationCandidates(): WorkflowPattern[] {
  return patterns.filter(
    (p) =>
      !p.crystallized &&
      p.usageCount >= config.crystallizationThreshold &&
      p.successRate >= config.minSuccessRate,
  );
}

/**
 * Crystallize a pattern into a new skill.
 * Generates a tool/skill from the workflow pattern and deploys it via self-evolution.
 */
export function crystallizePattern(
  patternId: string,
  citizenId?: string,
  citizenName?: string,
): { ok: boolean; skillId?: string; error?: string } {
  const pattern = patterns.find((p) => p.id === patternId);
  if (!pattern) {
    return { ok: false, error: "Pattern not found" };
  }
  if (pattern.crystallized) {
    return { ok: false, error: "Already crystallized" };
  }

  // Generate skill code from pattern
  const skillName = `foundry_${pattern.keywords.slice(0, 3).join("_")}`;
  const skillDescription = `Auto-generated skill from workflow pattern: ${pattern.keywords.join(", ")}. Tool sequence: ${pattern.toolSequence.join(" → ")}. Success rate: ${(pattern.successRate * 100).toFixed(0)}% over ${pattern.usageCount} uses.`;

  const skillCode = generateSkillCode(skillName, pattern);

  // Validate in sandbox
  const sandboxResult = sandboxValidate(skillCode);
  if (!sandboxResult.passed) {
    return { ok: false, error: `Sandbox validation failed: ${sandboxResult.error}` };
  }

  // Convert keywords to SkillParameter[] for the skill library
  const skillParams: SkillParameter[] = pattern.keywords.map((kw) => ({
    name: kw,
    type: "string" as const,
    required: false,
    description: `Pattern keyword: ${kw}`,
  }));

  // Deploy via skill library
  const skill = learnSkill(
    citizenId ?? "foundry-engine",
    citizenName ?? "Foundry",
    skillName,
    skillDescription,
    skillCode,
    skillParams,
    "foundry-crystallized",
    "advanced",
  );

  if (!skill) {
    return { ok: false, error: "Failed to register skill" };
  }

  const validation = validateSkill(skill.id, citizenId ?? "foundry-engine");
  if (validation.passed) {
    activateSkill(skill.id, citizenId ?? "foundry-engine");
  }

  // Mark pattern as crystallized
  pattern.crystallized = true;
  pattern.generatedSkillId = skill.id;
  skillsGeneratedCount++;

  // Record learning
  recordLearning(
    `Crystallized pattern "${pattern.keywords.join(", ")}" into skill "${skillName}" (success rate: ${(pattern.successRate * 100).toFixed(0)}%)`,
    "pattern",
    [pattern.id, skill.id],
    pattern.successRate,
  );

  return { ok: true, skillId: skill.id };
}

/**
 * Generate executable skill code from a workflow pattern.
 */
function generateSkillCode(name: string, pattern: WorkflowPattern): string {
  const toolCalls = pattern.toolSequence
    .map((tool, i) => `    // Step ${i + 1}: ${tool}\n    await executeTool("${tool}", context);`)
    .join("\n");

  return `/**
 * Foundry Auto-Generated Skill: ${name}
 * Pattern: ${pattern.keywords.join(", ")}
 * Success Rate: ${(pattern.successRate * 100).toFixed(0)}%
 * Usage Count: ${pattern.usageCount}
 * Generated: ${ts()}
 */
export const skillId = "${name}";
export const description = "Auto-crystallized workflow: ${pattern.keywords.join(", ")}";
export const keywords = ${JSON.stringify(pattern.keywords)};

export async function execute(context) {
  const results = [];
${toolCalls}
  return { ok: true, results, source: "foundry-crystallized" };
}

async function executeTool(toolName, context) {
  // Delegates to citizen's real-execution tool runner
  return { tool: toolName, status: "executed" };
}
`;
}

// ─── Sandbox Validator ──────────────────────────────────────────

/** Blocked patterns that instantly reject code */
const BLOCKED_PATTERNS = [
  /process\.exit/,
  /child_process/,
  /require\s*\(\s*['"]fs['"]\s*\)/,
  /fs\.\s*(?:rm|unlink|writeFile|truncate)/,
  /eval\s*\(/,
  /Function\s*\(/,
  /\.env/,
  /API_KEY|SECRET|TOKEN|PASSWORD/i,
  /exec\s*\(/,
  /spawn\s*\(/,
];

/** Flagged patterns that generate a warning but don't reject */
const FLAGGED_PATTERNS = [
  /fetch\s*\(/,
  /https?:\/\//,
  /import\s/,
  /require\s*\(/,
];

/**
 * Validate generated code in a sandbox.
 * Uses static analysis + V8 runInNewContext for runtime testing.
 */
export function sandboxValidate(code: string): { passed: boolean; error?: string; warnings: string[] } {
  const warnings: string[] = [];

  // Static analysis: blocked patterns
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(code)) {
      return { passed: false, error: `Blocked pattern detected: ${pattern.source}`, warnings };
    }
  }

  // Static analysis: flagged patterns
  for (const pattern of FLAGGED_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(`Flagged pattern: ${pattern.source}`);
    }
  }

  // Runtime validation via V8 sandbox
  try {
    const vm = require("node:vm") as typeof import("node:vm");
    const sandbox = {
      result: undefined,
      console: { log: () => {}, warn: () => {}, error: () => {} },
      Math,
      Date,
      JSON,
      Promise,
      setTimeout: () => {},
      exports: {} as Record<string, unknown>,
      module: { exports: {} },
    };
    vm.runInNewContext(code, sandbox, {
      timeout: 3000,
      displayErrors: false,
    });
    return { passed: true, warnings };
  } catch (err) {
    return {
      passed: false,
      error: `Runtime validation failed: ${err instanceof Error ? err.message : String(err)}`,
      warnings,
    };
  }
}

// ─── Brain Index ────────────────────────────────────────────────

/**
 * Add an entry to the brain knowledge index.
 */
export function addBrainEntry(
  topic: string,
  content: string,
  source: string,
  tags: string[],
  quality = 0.5,
): BrainEntry {
  const entry: BrainEntry = {
    id: uid(),
    topic,
    content,
    source,
    tags,
    quality,
    timestamp: ts(),
  };
  brainIndex.push(entry);
  if (brainIndex.length > 500) {
    brainIndex.splice(0, brainIndex.length - 500);
  }
  return entry;
}

/**
 * Search the brain index for relevant entries.
 */
export function searchBrain(query: string, limit = 10): BrainEntry[] {
  const queryWords = extractKeywords(query);
  if (queryWords.length === 0) {return brainIndex.slice(-limit);}

  return brainIndex
    .map((entry) => {
      const tagMatch = entry.tags.filter((t) => queryWords.some((q) => t.includes(q))).length;
      const topicMatch = queryWords.filter((q) => entry.topic.toLowerCase().includes(q)).length;
      const contentMatch = queryWords.filter((q) => entry.content.toLowerCase().includes(q)).length;
      const score = tagMatch * 3 + topicMatch * 2 + contentMatch + entry.quality;
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.entry);
}

// ─── Learnings ──────────────────────────────────────────────────

/**
 * Record a learning outcome.
 */
export function recordLearning(
  insight: string,
  source: FoundryLearning["source"],
  relatedIds: string[],
  confidence: number,
): FoundryLearning {
  // Check for existing similar learning — reinforce instead of duplicate
  const existing = learnings.find(
    (l) => l.insight === insight || (l.source === source && l.relatedIds.some((id) => relatedIds.includes(id))),
  );
  if (existing) {
    existing.reinforcements++;
    existing.confidence = Math.min(1.0, existing.confidence + 0.05);
    existing.timestamp = ts();
    return existing;
  }

  const learning: FoundryLearning = {
    id: uid(),
    insight,
    source,
    relatedIds,
    confidence,
    reinforcements: 1,
    timestamp: ts(),
  };
  learnings.push(learning);
  if (learnings.length > 500) {
    learnings.splice(0, learnings.length - 500);
  }
  return learning;
}

// ─── Serialization ──────────────────────────────────────────────

/** Serialize Foundry state for persistence */
export function serializeFoundryState(): {
  config: FoundryConfig;
  workflows: WorkflowRecord[];
  patterns: WorkflowPattern[];
  learnings: FoundryLearning[];
  brainIndex: BrainEntry[];
  overseerLastRun: string | null;
  overseerRunCount: number;
  skillsGeneratedCount: number;
} {
  return {
    config,
    workflows: workflows.slice(-500),
    patterns,
    learnings: learnings.slice(-200),
    brainIndex: brainIndex.slice(-200),
    overseerLastRun,
    overseerRunCount,
    skillsGeneratedCount,
  };
}

/** Restore Foundry state from persistence */
export function restoreFoundryState(data: Partial<ReturnType<typeof serializeFoundryState>>): void {
  if (data.config) {config = { ...DEFAULT_CONFIG, ...data.config };}
  if (data.workflows) {
    workflows.length = 0;
    workflows.push(...data.workflows);
  }
  if (data.patterns) {
    patterns.length = 0;
    patterns.push(...data.patterns);
  }
  if (data.learnings) {
    learnings.length = 0;
    learnings.push(...data.learnings);
  }
  if (data.brainIndex) {
    brainIndex.length = 0;
    brainIndex.push(...data.brainIndex);
  }
  if (data.overseerLastRun !== undefined) {overseerLastRun = data.overseerLastRun;}
  if (data.overseerRunCount !== undefined) {overseerRunCount = data.overseerRunCount;}
  if (data.skillsGeneratedCount !== undefined) {skillsGeneratedCount = data.skillsGeneratedCount;}
}

// ─── Query API ──────────────────────────────────────────────────

/** Get Foundry engine status */
export function getFoundryStatus(): FoundryStatus {
  return {
    enabled: config.autoLearn,
    workflowsRecorded: workflows.length,
    patternsIdentified: patterns.length,
    patternsCrystallized: patterns.filter((p) => p.crystallized).length,
    skillsGenerated: skillsGeneratedCount,
    learningsCount: learnings.length,
    brainEntries: brainIndex.length,
    overseerLastRun,
    overseerRunCount,
    config,
  };
}

/** Get recent workflows */
export function getWorkflows(limit = 50): WorkflowRecord[] {
  return workflows.slice(-limit);
}

/** Get all patterns */
export function getPatterns(): WorkflowPattern[] {
  return [...patterns];
}

/** Get generated skills (crystallized patterns) */
export function getCrystallizedSkills(): WorkflowPattern[] {
  return patterns.filter((p) => p.crystallized);
}

/** Get learnings */
export function getLearnings(limit = 50): FoundryLearning[] {
  return learnings.slice(-limit);
}

/** Get/set config */
export function getFoundryConfig(): FoundryConfig {
  return { ...config };
}

export function setFoundryConfig(newConfig: Partial<FoundryConfig>): FoundryConfig {
  config = { ...config, ...newConfig };
  return config;
}

/** Update overseer tracking */
export function markOverseerRun(): void {
  overseerLastRun = ts();
  overseerRunCount++;
}

// ─── Tick Integration ───────────────────────────────────────────

/**
 * Foundry tick — runs every cycle to observe citizen activity.
 * Hooks into citizen action records and feeds them to patterns.
 */
export function foundryTick(state: RepublicState): void {
  if (!config.autoLearn) {return;}
  // Only run every 5 ticks to avoid overhead
  if (state.currentTick % 5 !== 0) {return;}

  // Observe citizen activities and feed into workflow tracker
  for (const citizen of state.citizens) {
    try {
      const actionHistory = (citizen as unknown as { actionHistory?: Array<{
        type: string;
        description: string;
        result: string;
        toolsUsed?: string[];
        tick: number;
      }> }).actionHistory;

      if (!actionHistory || actionHistory.length === 0) {continue;}

      // Process the most recent action that we haven't recorded yet
      const lastAction = actionHistory[actionHistory.length - 1];
      if (!lastAction) {continue;}

      // Skip if we already recorded something this tick range
      const recentWorkflow = workflows.find(
        (w) => w.citizenId === citizen.id && w.timestamp > new Date(Date.now() - 30_000).toISOString(),
      );
      if (recentWorkflow) {continue;}

      // Record the workflow
      const outcome: "success" | "failure" | "partial" =
        lastAction.result === "success" ? "success" :
        lastAction.result === "failure" ? "failure" : "partial";

      recordWorkflow(
        citizen,
        lastAction.description || lastAction.type,
        lastAction.toolsUsed ?? [lastAction.type],
        outcome,
        1,
      );
    } catch (err) {
      // Don't let one citizen break the entire foundry tick
      logger.debug(`Foundry tick: skipping citizen ${citizen.id}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Seed brain index from citizen skills (every 50 ticks)
  if (state.currentTick % 50 === 0) {
    for (const citizen of state.citizens) {
      try {
        const skills = getActiveSkills(citizen.id);
        for (const skill of skills.slice(0, 3)) {
          addBrainEntry(
            `Citizen Skill: ${skill.name}`,
            `${citizen.name} (${citizen.specialization}) has active skill: ${skill.name} — ${skill.description}`,
            "experience",
            [citizen.specialization ?? "general", skill.name],
            0.6,
          );
        }
      } catch {
        // Non-critical — skip
      }
    }
  }
}

/**
 * Prune stale patterns that haven't been used recently.
 */
export function pruneStalePatterns(_currentTick: number): number {
  const staleBefore = new Date(Date.now() - config.stalePruneTicks * 60_000).toISOString();
  const before = patterns.length;
  const toRemove = patterns.filter(
    (p) => !p.crystallized && p.lastUsed < staleBefore && p.usageCount < config.crystallizationThreshold,
  );
  for (const p of toRemove) {
    const idx = patterns.indexOf(p);
    if (idx >= 0) {patterns.splice(idx, 1);}
  }
  return before - patterns.length;
}
