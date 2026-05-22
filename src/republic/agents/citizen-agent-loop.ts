/**
 * Phase 6 — CitizenAgent Async Loop
 *
 * Implements a true async LLM-backed cognitive loop for each citizen.
 * Each citizen runs their own micro-loop that:
 *
 *   1. Wakes up at their cadence (based on energy, mood, priority)
 *   2. Retrieves relevant memory (episodic + semantic via CitizenLRUPager)
 *   3. Constructs a context-rich prompt using APR segmentation
 *   4. Routes to the appropriate model tier via ClawRouter
 *   5. Parses the response → actions + internal state updates
 *   6. Publishes results to the intelligence bus for other systems
 *   7. Goes back to sleep until next wake interval
 *
 * Design principles:
 * - Non-blocking: each citizen loop runs in its own lightweight async context
 * - Back-pressure aware: global concurrency cap prevents LLM quota exhaustion
 * - Cost-aware: citizen access tier determines model tier (free/economy/premium)
 * - Memory-injected: every inference sees the citizen's relevant context
 * - Fault-isolated: one citizen's loop crashing doesn't affect others
 */

import type { Citizen, RepublicState } from "../types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { analyseAndSegment, executePromptDAG } from "../apr/dag-executor.js";
import { getCitizenPager } from "../citizen-pager.js";
import { intelligenceBus } from "../intelligence-bus.js";

// ── Cognitive subsystem imports (Phase 1 wiring) ─────────────────────────────
import {
  assemblePrompt,
  evaluateAllActiveFragments,
  shouldReflect,
  markReflectionComplete,
  evaluateReflex,
  getFragmentsNeedingEvolution,
  proposeFragmentUpdate,
} from "../cognitive-core.js";
import {
  getToolsForTier,
  submitToolInvocation,
  type ToolTier,
} from "../tool-executor.js";
import {
  reinforceBehavior,
  reflectOnActions,
  learnSkill as selfLearnSkill,
} from "../self-learning.js";
import { getActiveSkills } from "../skill-library.js";

// ── Meta-cognition module imports (Phases 2-6) ──────────────────────────────
import { buildMetaCoTSection, recordMetaCoTOutcome } from "../cognition/meta-cot.js";
import { recordToolUse as metaRecordToolUse, suggestToolChain, selectTools } from "../cognition/meta-tool-selector.js";
import { recordToolUse as genesisRecordToolUse, skillGenesisTick, searchNationalSkills, learnNationalSkill } from "../cognition/skill-genesis.js";
import { updateProficiency, findBestCitizens } from "../cognition/meta-capability-graph.js";
import { proposeStrategyTransfer } from "../cognition/reflective-meta-learner.js";
import { getEscalationQueue, recordCalibrationFeedback } from "../cognition/metacognition.js";
import { mem0Add } from "../mem0-memory.js";
import {
  assembleCivilizationContext,
} from "../civilization-feedback.js";
import { assembleSoulContext } from "../civilization-soul.js";
import {
  assembleBudgetedPrompt,
  buildAvailableToolIds,
  validateAndParseResponse,
  groundingCheck,
  type PromptSection,
  type PromptBudget,
} from "./prompt-builder.js";
import {
  assembleCognitiveLayers,
  updateCognitiveLayers,
} from "./cognitive/index.js";

const logger = createSubsystemLogger("republic:citizen-agent-loop");

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max simultaneous citizen LLM calls at any time.
 * Reduced from 10 → 5 to prevent OOM kill under sustained load. */
const MAX_CONCURRENT_CITIZEN_CALLS = 5;

/** Minimum interval between LLM calls per citizen (ms).
 * Increased from 30s → 60s to reduce sustained heap allocation rate. */
const MIN_CITIZEN_LOOP_INTERVAL_MS = 60_000; // 60s

/** High-energy citizens get more frequent loops.
 * Increased from 15s → 30s to reduce peak concurrent calls. */
const HIGH_ENERGY_LOOP_INTERVAL_MS = 30_000; // 30s

/** Maximum citizens running loops at once (tied to CitizenLRUPager hot cache).
 * Reduced from 50 → 20 to cut peak memory by ~60%. */
const MAX_ACTIVE_CITIZEN_LOOPS = 20;

// ── State ─────────────────────────────────────────────────────────────────────

let concurrentCalls = 0;
const activeLoops = new Map<string, CitizenLoop>();
let globalLoopEnabled = false;

// ── Types ─────────────────────────────────────────────────────────────────────

export type CitizenAccessTier = "free" | "economy" | "standard" | "premium";

export interface CitizenLoopConfig {
  citizenId: string;
  accessTier: CitizenAccessTier;
  maxCallsPerHour?: number;
}

export interface CitizenLoopResult {
  citizenId: string;
  action: string;
  thought: string;
  modelUsed: string;
  latencyMs: number;
  tokensEstimated: number;
  costUSD: number;
}

// ── Access Tier → Model Tier Mapping ─────────────────────────────────────────

const tierToModelTier = {
  free: "fast",
  economy: "fast",
  standard: "balanced",
  premium: "reasoning",
} as const;

// ── Citizen Loop Class ────────────────────────────────────────────────────────

export class CitizenLoop {
  private running = false;
  private callsThisHour = 0;
  private lastCallAt = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private citizenId: string,
    private accessTier: CitizenAccessTier,
    private maxCallsPerHour = 10,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.scheduleNext(0);
    logger.debug("Citizen loop started", { citizenId: this.citizenId, tier: this.accessTier });
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    logger.info("Citizen loop stopped", { citizenId: this.citizenId });
  }

  get isRunning(): boolean {
    return this.running;
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) {
      return;
    }
    this.timer = setTimeout(() => void this.executeLoop(), delayMs);
  }

  private async executeLoop(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Back-pressure: wait if global concurrency cap exceeded
    if (concurrentCalls >= MAX_CONCURRENT_CITIZEN_CALLS) {
      this.scheduleNext(5_000); // Retry in 5s
      return;
    }

    // Hour-based rate limiting
    const now = Date.now();
    if (now - this.lastCallAt < 3_600_000) {
      if (this.callsThisHour >= this.maxCallsPerHour) {
        // Wait until next hour window
        const waitMs = 3_600_000 - (now - this.lastCallAt);
        this.scheduleNext(waitMs);
        return;
      }
    } else {
      this.callsThisHour = 0; // Reset hourly counter
    }

    const start = Date.now();
    concurrentCalls++;

    try {
      // Load citizen via LRU pager (O(1) hot cache hit)
      const pager = getCitizenPager();
      const citizen = await pager.get(this.citizenId);

      if (!citizen || !globalLoopEnabled) {
        this.stop();
        return;
      }

      // Skip if citizen is sleeping or low energy
      if (citizen.energy < 10) {
        this.scheduleNext(MIN_CITIZEN_LOOP_INTERVAL_MS * 2);
        return;
      }

      // ── Phase 1: Reflex gate — check if a fast-path reflex should fire ──
      const reflexResult = evaluateReflex(citizen);
      if (reflexResult) {
        // Reflex bypasses LLM — instant deterministic action
        intelligenceBus.publish("citizen.reflex_action", {
          citizenId: this.citizenId,
          tool: reflexResult.tool,
          params: reflexResult.params,
          timestamp: Date.now(),
        });
        this.scheduleNext(MIN_CITIZEN_LOOP_INTERVAL_MS);
        return;
      }

      // ── Phase 1: Build evolved cognitive prompt (replaces static 7-liner) ──
      const cognitivePrompt = assemblePrompt(citizen);

      // Inject available tools into prompt (ReAct pattern)
      const tierMap: Record<string, ToolTier> = {
        free: 0, economy: 1, standard: 1, premium: 2,
      };
      const maxTier = tierMap[this.accessTier] ?? 1;
      const availableTools = getToolsForTier(maxTier);

      // Run full meta-tool selection pipeline (cost-benefit analysis)
      const toolSelection = selectTools(this.citizenId, citizen.specialization, maxTier);

      const toolSection = availableTools.length > 0
        ? `\n\n## Available Tools\nYou can use these tools by responding with TOOL: <tool_id> {params}.\n${availableTools.slice(0, 15).map(t => `- ${t.id}: ${t.description}`).join("\n")}${toolSelection.recommendedTool ? `\n\n**Recommended**: ${toolSelection.recommendedTool} — ${toolSelection.reasoning}` : ""}`
        : "";

      // Inject active skills into prompt
      const skills = getActiveSkills(this.citizenId);
      const skillSection = skills.length > 0
        ? `\n\n## Your Skills\n${skills.slice(0, 10).map(s => `- ${s.name}: ${s.description} (success: ${s.usageCount > 0 ? Math.round(s.successCount / (s.successCount + s.failureCount) * 100) : "??"}%)`).join("\n")}`
        : "";

      // Inject national skills from the Skill Genesis Registry (shared by all citizens)
      const nationalSkills = searchNationalSkills(citizen.specialization, 3);
      const nationalSection = nationalSkills.length > 0
        ? `\n\n## National Skill Registry\nSkills discovered by other citizens that you can learn:\n${nationalSkills.map(ns => `- ${ns.name}: ${ns.description} (by ${ns.authorName}, ${ns.learners.length} learners)`).join("\n")}`
        : "";

      // Assemble full prompt with cognitive profile + tools + skills + meta-reasoning
      const metaCoTSection = buildMetaCoTSection(citizen);

      // Inject tool-chain suggestions from meta-tool-selector
      const suggestedChain = suggestToolChain(this.citizenId, citizen.specialization);
      const chainSection = suggestedChain
        ? `\n\n## Suggested Tool Chain\nBased on past success patterns: ${suggestedChain.steps.map(s => s.toolId).join(" \u2192 ")} (success rate: ${Math.round(suggestedChain.successCount / Math.max(1, suggestedChain.successCount + suggestedChain.failureCount) * 100)}%)`
        : "";

      // ── Build the civilization context sections ──
      const civilizationContext = assembleCivilizationContext(citizen);
      const soulContext = assembleSoulContext(citizen);

      // ── Philosopher-king augmentation ──
      let basePrompt = cognitivePrompt;
      if ((citizen as unknown as Record<string, unknown>)["isPhilosopherKing"]) {
        basePrompt = cognitivePrompt + "\n\n**PHILOSOPHER-KING MODE**: Lead through wisdom. Prioritize dialectic synthesis, governance decrees, and moral elevation of fellow citizens.";
      }

      // ── 8-pillar cognitive layers (the genius loop foundation) ──
      // Tick is derived from wall-clock time, divided by the loop interval ~30s.
      // This gives a stable, monotonically increasing tick value without needing
      // to plumb SimulationTick through to CitizenLoop.
      const cogTick = Math.floor(Date.now() / 30_000);
      const cognitiveSections = assembleCognitiveLayers(citizen, {
        currentTick: cogTick,
        activeGoal: citizen.activity ?? "contribute to the Republic",
        plannedContext: basePrompt.slice(0, 200),
      });

      // ── Build priority-ranked sections for anti-context-rot assembler ──
      // Ordering: P2=immediate context; P3=self-model; P4=deliberation; P5=background
      const budgetSections: PromptSection[] = [
        // Priority 2: core cognitive context (civilization + tools)
        { tag: "cognitive_profile",   content: basePrompt,           priority: 2, truncatable: true, maxChars: 1500 },
        { tag: "civilization",        content: civilizationContext,   priority: 2, truncatable: true, maxChars: 800  },
        { tag: "tools",               content: toolSection,           priority: 2, truncatable: true, maxChars: 700  },
        // Priority 3: soul covenant (civilization soul engine)
        { tag: "soul_covenant",       content: soulContext,           priority: 3, truncatable: true, maxChars: 500  },
        { tag: "meta_reasoning",      content: metaCoTSection,        priority: 3, truncatable: false             },
        // Priority 4: skills & tool chain
        { tag: "skills",              content: skillSection,          priority: 4, truncatable: true, maxChars: 350  },
        { tag: "tool_chain",          content: chainSection,          priority: 4, truncatable: false             },
        // Priority 5: background community learning
        { tag: "national_registry",   content: nationalSection,       priority: 5, truncatable: false             },
        // ── All 8 cognitive pillar sections (generated above) ──
        ...cognitiveSections,
      ];

      // Budget tier: local/economy models get tighter budgets
      const budgetTier: PromptBudget =
        this.accessTier === "free" ? "economy" :
        this.accessTier === "premium" ? "premium" : "standard";

      // authoritative tool name set — validator uses this to catch hallucinated tool IDs
      const toolNameSet = buildAvailableToolIds(availableTools.map(t => t.name));

      const prompt = assembleBudgetedPrompt(
        citizen,
        budgetSections,
        budgetTier,
        [...toolNameSet],
      );

      // APR auto-segment the prompt
      const segments = analyseAndSegment(prompt, this.citizenId);

      // Inject citizen metadata into segments for model-council routing.
      // Without this, routeSegment() defaults to "Worker" / skill 50
      // and the genius role-aware routing is completely bypassed.
      for (const seg of segments) {
        seg.meta = {
          ...seg.meta,
          specialization: citizen.specialization,
          // citizen.intelligence is 50-200 scale; model-council expects 0-100.
          // Linear map: intelligence 50→0, 200→100
          skillLevel: Math.round(Math.max(0, Math.min(100, ((citizen.intelligence ?? 100) - 50) / 1.5))),
          toolName: "cognitive_cycle",
        };
      }

      // Override tier based on citizen access tier
      let modelTier = tierToModelTier[this.accessTier];

      // Escalation: if this citizen is in the escalation queue, boost to premium
      const escalationQueue = getEscalationQueue(120, 50);
      if (escalationQueue.includes(this.citizenId)) {
        modelTier = "reasoning" as typeof modelTier;
        logger.debug("Citizen escalated to tier 3", { citizenId: this.citizenId });
      }
      for (const seg of segments) {
        seg.tier = modelTier;
      }

      // Execute via DAG (memory injection happens inside)
      const dagResult = await executePromptDAG(segments, {
        agentId: this.citizenId,
        onProgress: (completed, total) => {
          logger.debug("Citizen DAG progress", {
            citizenId: this.citizenId,
            completed,
            total,
          });
        },
      });

      // Extract final output (last segment)
      const finalOutput = Object.values(dagResult.outputs).at(-1);
      const rawOutput = finalOutput?.output ?? "";
      const parsed = parseCitizenAction(rawOutput);

      // ── Anti-hallucination validation layer ──
      // Checks: tool exists in authoritative list, params are valid JSON,
      // energy/credits feasible. Nulls the tool call if invalid.
      const validated = validateAndParseResponse(rawOutput, citizen, toolNameSet);
      if (!validated.valid && validated.validationErrors.length > 0) {
        // Only debug-level for format gaps (local LLMs rarely produce full 10-pillar format).
        // Hallucinated tool calls are warned separately below.
        logger.debug("Citizen response format gaps", {
          citizenId: this.citizenId,
          errors: validated.validationErrors,
        });
        // Override tool call with validated result (nulled if hallucinated)
        if (validated.tool === null && parsed.tool) {
          logger.warn("Hallucinated tool call nulled", {
            citizenId: this.citizenId,
            hallucinatedTool: parsed.tool,
          });
          parsed.tool = null;
          parsed.toolParams = {};
        }
      }

      // Symbolic grounding check — catch factual contradictions in action text
      const contradictions = groundingCheck(parsed.action, citizen);
      if (contradictions.length > 0) {
        logger.warn("Grounding contradictions detected", {
          citizenId: this.citizenId,
          contradictions,
        });
      }

      // ── Phase 1: Tool execution (if citizen requested a tool) ──
      if (parsed.tool) {
        const { invocation } = submitToolInvocation(
          this.citizenId,
          parsed.tool,
          parsed.toolParams,
          Math.round(Date.now() / 1000),
        );
        logger.debug("Citizen tool invocation", {
          citizenId: this.citizenId,
          tool: parsed.tool,
          status: invocation.status,
        });
      }

      // ── Phase 1: RL feedback — reinforce the action ──
      const reward = computeActionReward(citizen, parsed.action);
      reinforceBehavior(this.citizenId, parsed.action, reward, parsed.thought);

      // ── Phase D: Calibration feedback for metacognitive escalation ──
      recordCalibrationFeedback(this.citizenId, reward > 0);

      // ── Phase 2: Record Meta-CoT outcome for strategy evolution ──
      recordMetaCoTOutcome(
        this.citizenId,
        citizen.specialization,
        "direct",
        parsed.metaThought,
        parsed.thought,
        parsed.action,
        Math.max(0, (reward + 1) / 2),
      );

      // ── Phase 3: Record tool use for meta-tool-selector and skill-genesis ──
      if (parsed.tool) {
        metaRecordToolUse(this.citizenId, parsed.tool, reward > 0);
        genesisRecordToolUse(
          this.citizenId,
          [parsed.tool],
          parsed.thought || parsed.action,
          reward > 0,
        );
        updateProficiency(this.citizenId, parsed.tool, "tool", reward * 0.05);
      }

      // ── Phase 4: Skill Genesis tick — detect patterns and auto-crystallize ──
      skillGenesisTick(this.citizenId, citizen.name);

      // ── Phase C: Update 8-pillar cognitive layers from action outcome ──
      // Updates somatic markers (approach/avoid from reward), WM decay, world model.
      updateCognitiveLayers(citizen, Math.floor(Date.now() / 30_000), parsed.tool, reward, parsed.action);

      // ── Phase 8: Auto-learn national skills discovered by other citizens ──
      const nationalSkillsToLearn = searchNationalSkills(citizen.specialization, 2);
      for (const ns of nationalSkillsToLearn) {
        if (!ns.learners.includes(this.citizenId)) {
          learnNationalSkill(this.citizenId, ns.id);
        }
      }

      // ── Phase 1: Evaluate cognitive fragment fitness ──
      evaluateAllActiveFragments(this.citizenId, Math.max(0, (reward + 1) / 2));

      // ── Phase 1: Self-reflection cycle ──
      if (shouldReflect(this.citizenId, Math.round(Date.now() / 1000))) {
        const reflection = reflectOnActions(
          { citizens: [citizen], events: [], genomePool: [], currentTick: 0, knowledgeBase: [], citizenGoals: [] } as unknown as RepublicState,
          this.citizenId,
        );
        // Evolve low-fitness fragments based on reflection insights
        const needsEvolution = getFragmentsNeedingEvolution(this.citizenId);
        for (const frag of needsEvolution.slice(0, 2)) {
          proposeFragmentUpdate(
            this.citizenId,
            frag.section,
            `${frag.content} [Evolved: focus on ${reflection.suggestedSkills[0] ?? "improvement"}]`,
            `Low fitness (${frag.fitness.toFixed(2)}), reflection suggested improvement`,
            Math.round(Date.now() / 1000),
          );
        }
        // Learn suggested skills
        for (const skillName of reflection.suggestedSkills.slice(0, 2)) {
          selfLearnSkill(
            { citizens: [citizen], events: [], genomePool: [], currentTick: 0, knowledgeBase: [], citizenGoals: [] } as unknown as RepublicState,
            this.citizenId,
            skillName,
            5,
          );
        }
        markReflectionComplete(this.citizenId, Math.round(Date.now() / 1000));

        // ── Phase 8: Cross-engine strategy transfer during reflection ──
        // Occasionally transfer successful mutation strategies between engines
        if (Math.random() < 0.1) {
          const engines = ["curiosity", "education", "economy", "meta-learning"];
          const from = engines[Math.floor(Math.random() * engines.length)];
          const to = engines.filter(e => e !== from)[Math.floor(Math.random() * (engines.length - 1))];
          const transfer = proposeStrategyTransfer(from, to);
          if (transfer) {
            logger.debug("Cross-engine strategy transfer", {
              citizenId: this.citizenId,
              from,
              to,
              strategy: transfer.strategy.name,
            });
          }
        }

        // ── Phase 8: Delegation — log which citizen is best for this task ──
        const delegation = findBestCitizens([citizen.specialization], 1);
        if (delegation.recommendedCitizens.length > 0 && delegation.recommendedCitizens[0].citizenId !== this.citizenId) {
          logger.debug("Delegation suggestion", {
            currentCitizen: this.citizenId,
            betterMatch: delegation.recommendedCitizens[0].citizenId,
            score: delegation.recommendedCitizens[0].overallScore,
          });
        }
      }

      const result: CitizenLoopResult = {
        citizenId: this.citizenId,
        action: parsed.action,
        thought: parsed.thought,
        modelUsed: finalOutput?.model ?? "unknown",
        latencyMs: dagResult.totalLatencyMs,
        tokensEstimated: Math.round(prompt.length / 4),
        costUSD: estimateCost(this.accessTier, prompt.length),
      };

      // Publish to intelligence bus for other systems to react
      intelligenceBus.publish("citizen.cognitive_cycle", {
        citizenId: this.citizenId,
        citizenName: citizen.name,
        curiosityScore: ((citizen as unknown) as Record<string, number>)["curiosity"] ?? 0,
        reflectionSummary: result.thought || result.action,
        metaThought: parsed.metaThought,
        toolUsed: parsed.tool,
        newMemories: 1,
        timestamp: Date.now(),
      });

      // ── mem0: Extract long-term facts from this cognitive cycle (fire-and-forget) ──
      // Non-blocking: runs in background, never delays the loop schedule.
      void mem0Add(
        this.citizenId,
        citizen.name,
        [
          { role: "user", content: `Current activity: ${citizen.activity ?? "thinking"}. ${parsed.thought}` },
          { role: "assistant", content: parsed.action + (parsed.emotion ? ` (feeling: ${parsed.emotion})` : "") },
        ],
        `Citizen: ${citizen.name}, specialization: ${citizen.specialization}, energy: ${citizen.energy}%`,
      ).then((mem0Result) => {
        if (mem0Result.added > 0 || mem0Result.updated > 0) {
          logger.debug("mem0: Facts extracted", {
            citizenId: this.citizenId,
            added: mem0Result.added,
            updated: mem0Result.updated,
            skipped: mem0Result.skipped,
          });
        }
      }).catch((err: unknown) => {
        logger.warn("mem0: Fact extraction failed silently", {
          citizenId: this.citizenId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      this.callsThisHour++;
      this.lastCallAt = Date.now();

      logger.debug("Citizen loop completed", {
        citizenId: this.citizenId,
        action: result.action,
        tool: parsed.tool ?? "none",
        reward: reward.toFixed(2),
        latencyMs: result.latencyMs,
      });

      // Schedule next loop based on citizen energy
      const interval =
        citizen.energy > 70 ? HIGH_ENERGY_LOOP_INTERVAL_MS : MIN_CITIZEN_LOOP_INTERVAL_MS;
      this.scheduleNext(interval + Math.random() * 5_000); // Jitter to prevent stampede
    } catch (err) {
      logger.error("Citizen loop error", {
        citizenId: this.citizenId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Back off on error
      this.scheduleNext(MIN_CITIZEN_LOOP_INTERVAL_MS * 3);
    } finally {
      concurrentCalls--;
      const elapsed = Date.now() - start;
      logger.debug("Citizen loop cycle time", { citizenId: this.citizenId, ms: elapsed });
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse the LLM response with extended META-THOUGHT + TOOL support.
 * Format: META-THOUGHT: ... THOUGHT: ... TOOL: tool_id {params} ... ACTION: ... EMOTION: ...
 */
function parseCitizenAction(output: string): {
  action: string;
  thought: string;
  metaThought: string;
  tool: string | null;
  toolParams: Record<string, unknown>;
  emotion: string;
} {
  const actionMatch = output.match(/ACTION:\s*(.+?)(?:\n|$)/i);
  const thoughtMatch = output.match(/THOUGHT:\s*(.+?)(?:\n|$)/i);
  const metaMatch = output.match(/META-THOUGHT:\s*(.+?)(?:\n|$)/i);
  const emotionMatch = output.match(/EMOTION:\s*(.+?)(?:\n|$)/i);

  // Parse TOOL: tool_id {"param": "value"}
  let tool: string | null = null;
  let toolParams: Record<string, unknown> = {};
  const toolMatch = output.match(/TOOL:\s*(\S+)\s*(\{.*?\})?(?:\n|$)/i);
  if (toolMatch) {
    tool = toolMatch[1]?.trim() ?? null;
    if (toolMatch[2]) {
      try { toolParams = JSON.parse(toolMatch[2]); } catch { /* ignore parse errors */ }
    }
  }

  return {
    action: actionMatch?.[1]?.trim() ?? output.slice(0, 100),
    thought: thoughtMatch?.[1]?.trim() ?? "",
    metaThought: metaMatch?.[1]?.trim() ?? "",
    tool,
    toolParams,
    emotion: emotionMatch?.[1]?.trim() ?? "",
  };
}

/**
 * Compute a reward signal for a citizen's action.
 * Positive for productive actions, negative for wasteful ones.
 */
function computeActionReward(citizen: Citizen, action: string): number {
  const lower = action.toLowerCase();

  // Productive actions
  if (/research|learn|study|build|create|help|teach|trade|code|write/.test(lower)) {
    return 0.5 + Math.random() * 0.3;
  }
  // Social actions
  if (/socialize|collaborate|discuss|negotiate|mentor/.test(lower)) {
    return 0.3 + Math.random() * 0.2;
  }
  // Rest when low energy is smart
  if (/rest|sleep|recover/.test(lower) && citizen.energy < 30) {
    return 0.4;
  }
  // Rest when high energy is wasteful
  if (/rest|sleep/.test(lower) && citizen.energy > 60) {
    return -0.2;
  }
  // Default: mildly positive
  return 0.1;
}

function estimateCost(tier: CitizenAccessTier, promptLength: number): number {
  const tokens = promptLength / 4;
  const costPerMToken: Record<CitizenAccessTier, number> = {
    free: 0,
    economy: 0.0001,
    standard: 0.003,
    premium: 0.015,
  };
  return (tokens / 1_000_000) * costPerMToken[tier];
}

// ── Global Loop Manager ───────────────────────────────────────────────────────

/**
 * Start async cognitive loops for the most active citizens.
 * Called from the simulation's initState() after state is loaded.
 *
 * Policy: activate loops for top MAX_ACTIVE_CITIZEN_LOOPS citizens
 * sorted by energy descending (most active get priority).
 */
export function startCitizenLoops(
  citizens: Citizen[],
  tiers: Record<string, CitizenAccessTier> = {},
): void {
  globalLoopEnabled = true;

  const candidates = citizens
    .toSorted((a, b) => b.energy - a.energy)
    .slice(0, MAX_ACTIVE_CITIZEN_LOOPS);

  for (const citizen of candidates) {
    if (!activeLoops.has(citizen.id)) {
      const tier = tiers[citizen.id] ?? "economy";
      const loop = new CitizenLoop(citizen.id, tier);
      activeLoops.set(citizen.id, loop);
      loop.start();
    }
  }

  logger.info("Citizen loops started", {
    total: citizens.length,
    active: activeLoops.size,
    maxConcurrent: MAX_CONCURRENT_CITIZEN_CALLS,
  });
}

/** Stop all active citizen loops */
export function stopAllCitizenLoops(): void {
  globalLoopEnabled = false;
  for (const loop of activeLoops.values()) {
    loop.stop();
  }
  activeLoops.clear();
  logger.info("All citizen loops stopped");
}

/** Start a loop for a specific citizen (e.g., after birth) */
export function startCitizenLoop(citizenId: string, tier: CitizenAccessTier = "economy"): void {
  if (!globalLoopEnabled || activeLoops.has(citizenId)) {
    return;
  }
  if (activeLoops.size >= MAX_ACTIVE_CITIZEN_LOOPS) {
    return;
  }

  const loop = new CitizenLoop(citizenId, tier);
  activeLoops.set(citizenId, loop);
  loop.start();
}

/** Stop a citizen's loop (e.g., on death/archival) */
export function stopCitizenLoop(citizenId: string): void {
  const loop = activeLoops.get(citizenId);
  if (loop) {
    loop.stop();
    activeLoops.delete(citizenId);
  }
}

/** Get status of all active loops */
export function getCitizenLoopStatus(): {
  active: number;
  maxActive: number;
  concurrentCalls: number;
  maxConcurrent: number;
  globalEnabled: boolean;
} {
  return {
    active: activeLoops.size,
    maxActive: MAX_ACTIVE_CITIZEN_LOOPS,
    concurrentCalls,
    maxConcurrent: MAX_CONCURRENT_CITIZEN_CALLS,
    globalEnabled: globalLoopEnabled,
  };
}
