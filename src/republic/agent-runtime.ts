/**
 * Republic Platform — Agent Runtime
 *
 * Orchestrates citizen agent decision-making by combining the
 * compute router, citizen prompts, and republic tools.
 *
 * Lifecycle per tick:
 * 1. Pick a subset of active citizens
 * 2. For each citizen, classify the action complexity
 * 3. Route to the appropriate compute tier
 * 4. Execute the decided action via republic tools
 * 5. Record the action and update the citizen
 *
 * Integrates with:

 * - Ollama (local model server)
 * - LM Studio (OpenAI-compatible local server)
 * - Cloud LLMs (Gemini, GPT) via compute router
 * - AutonomousAgent (self-reflection, goals, curiosity)
 */

import type { ProposedAction } from "./constitution.js";
import type { ExecutionContext } from "./real-execution.js";
import type { AgentAction, Citizen, RepublicState } from "./types.js";
import { addExperience, sampleReplay } from "./experience-replay.js";
import { cleanupExpiredMessages } from "./agent-messaging.js";
import { recordToolOutcome } from "./tool-analytics.js";
import { getCachedAction, cacheAction, evictExpired } from "./action-cache.js";
import { metacognitivePass, recordCalibrationFeedback } from "./cognition/metacognition.js";
import { recordMetaCoTOutcome, selectStrategy } from "./cognition/meta-cot.js";
import { recordToolUse as recordToolUseGenesis, skillGenesisTick } from "./cognition/skill-genesis.js";
import { selectTools } from "./cognition/meta-tool-selector.js";
import { describeFallbackChain } from "../intelligence/router-fallback.js";
import { validateChunkResponse } from "../intelligence/router-validator.js";
import { analyzePrompt } from "../intelligence/prompt-analyzer.js";
import { delegationTick } from "./agent-delegation.js";
import { getRateLimiter, parseRetryAfter } from "./api-rate-limiter.js";
import { assetEconomyTick } from "./asset-economy.js";
import {
  recordToolOutcomeLearning,
  skillDecayTick,
  masteryGrowthTick,
  specializationDriftTick,
  transferSkillKnowledge,
} from "./citizen-learning-engine.js";
import { nimIdeaSeedTick } from "./nim-idea-seeder.js";

import {
  autonomyTick as runAutonomyTick,
  classifyGoalAwareTask,
  restoreAutonomyState,
} from "./citizen-autonomy.js";
import { getLogger } from "../logging/logger.js";
import { buildReflexAction } from "./citizen-prompt.js";
import { buildCompactPrompt } from "./inference-strategy.js";
import { civilizationLegacyTick } from "./civilization-legacy.js";
import {
  artsTick,
  civCommunicationTick,
  civilizationCultureTick,
  civilizationEconomicsTick,
  civilizationGovernanceTick,
  ecologyTick,
  philosophyTick,
  psychologyTick,
} from "./civilizational-engines.js";
import {
  civilizationFeedbackTick,
  checkLegitimacyCrisis,
  civilizationInheritanceTick,
  socialTensionTick,
} from "./civilization-feedback.js";
import {
  soulTick,
  collectiveMournTick,
  playTick,
  enlightenmentTick,
} from "./civilization-soul.js";
import {
  aprCloudInference,
  isCloudAvailable,
  isGeminiAvailable,
  isGroqAvailable,
  isOpenAIAvailable,
  isOpenRouterAvailable,
} from "./cloud-inference.js";
import {
  findLocalTarget,
  getFreeCallPercentage,
  getProviderStatuses,
  getTierStats,
  recordTierCall,
  registerProvider,
  routeWithCouncil,
  startDiscoveryRefresh,
  updateProviderStats,
} from "./compute-router.js";
import { recordResourceSpend, validateAction } from "./constitution.js";
import { emotionalTick } from "./emotional-engine.js";
import { innovationTick, recordInteraction } from "./innovation-synthesis.js";
import { knowledgeGraphTick } from "./knowledge-graph.js";
import { getActiveModel, ensureModelLoaded } from "./lmstudio-strategy.js";
import {
  getLocalInstances,
  LMSTUDIO_DEFAULT_URL,
  OLLAMA_DEFAULT_URL,
  startLocalComputeDiscovery,
} from "./local-compute.js";
import {
  addEpisodicMemory,
  consolidateMemories,
  exportMemoryState,
  recordProcedure,
  recordSocialInteraction,
  shouldConsolidate,
} from "./memory.js";
import { registerAvailableProvider } from "./model-council.js";
import {
  addSpanEvent,
  endSpan,
  recordDecision,
  recordToolUsage,
  startTrace,
  updateCostBucket,
} from "./observability.js";
import { politicalTick } from "./political-system.js";
import {
  generateDream,
  selectPipeline,
  startWorkflow,
  workflowTick,
} from "./production-workflows.js";
import { projectTick } from "./project-orchestrator.js";
import { executeToolAction } from "./real-execution.js";
import { reputationTick } from "./reputation-engine.js";
import { selfImprovementTick } from "./self-improvement.js";
import { recordAgentAction, recordReflexFallback } from "./sim-diagnostics.js";
import { activateSkill, getActiveSkills, learnSkill, validateSkill } from "./skill-library.js";
import { socialFabricTick } from "./social-fabric.js";
import { theoryOfMindTick } from "./theory-of-mind.js";
import { getTool, REPUBLIC_TOOLS } from "./tools.js";
import { rng, ts, uid } from "./utils.js";
import { worldEngineTick } from "./world-engine.js";
import { startWorldIntelligence } from "./world-intelligence.js";
import { autoCaptureInteraction } from "./cognee-bridge.js";

// ─── Configuration ──────────────────────────────────────────────

/** Max citizens to process per agent tick */
const AGENTS_PER_TICK = 8;

/** Minimum energy to be eligible for agent actions */
const MIN_ENERGY_FOR_ACTION = 10;

/** Max ReAct reasoning steps per citizen per tick (by tier) */
const REACT_STEPS_BY_TIER: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 3 };

/** Critical governance actions that trigger debate rounds */
const CRITICAL_ACTIONS = new Set([
  "propose_bill", "vote", "veto", "declare_emergency",
  "allocate_budget", "impeach", "ratify_treaty",
  "appoint_official", "sanction", "declare_war",
]);

/** Ollama API base URL — imported from local-compute.ts (single source of truth) */
const OLLAMA_URL = OLLAMA_DEFAULT_URL;

/** LM Studio API base URL — imported from local-compute.ts (single source of truth) */
const LMSTUDIO_URL = LMSTUDIO_DEFAULT_URL;

/** Anthropic API key for cloud registration */
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// ─── Runtime State ──────────────────────────────────────────────

let initialized = false;

/** Cleanup handle for discovery refresh interval */
let _stopDiscoveryRefresh: (() => void) | null = null;

/** Action log for diagnostics (ring buffer, last 100) */
const actionLog: AgentAction[] = [];
const MAX_ACTION_LOG = 100;

// ─── Circuit Breakers (extracted to agent-circuit-breaker.ts) ───
import {
  isCircuitOpen,
  isModelBlacklisted,
  recordModelFailure,
  recordModelSuccess,
  withRetry,
  MAX_RETRIES,
  _circuitOpenLoggedAt,
  getProviderHealth,
  getAllProviderHealth,
} from "./agent-circuit-breaker.js";

// Re-export for backward compat (compute-router.ts, backend.ts)
export { getProviderHealth, getAllProviderHealth };
// ─── Initialization ─────────────────────────────────────────────

/**
 * Initialize the agent runtime. Call once at startup.
 * Uses local-compute.ts as the single source of truth for provider discovery.
 */
export async function initAgentRuntime(): Promise<void> {
  if (initialized) {
    return;
  }

  // Start the unified local compute discovery (Ollama, LM Studio, BitNet)
  // This polls on a 30s interval and syncs state to model-council
  startLocalComputeDiscovery();

  // Sync discovered local providers into compute-router's provider registry
  // This reads from local-compute's getLocalInstances() on a 60s interval
  _stopDiscoveryRefresh = startDiscoveryRefresh();

  // ── Register cloud providers so findCloudTarget() can route to them ──
  // Without this, Tier 1→cloud and Tier 2→cloud fallback paths are dead.
  if (isGeminiAvailable()) {
    registerProvider("cloud-gemini", {
      available: true,
      models: ["gemini-2.5-flash", "gemini-2.5-pro"],
      throughput: 50,
    });
    registerAvailableProvider("gemini", ["gemini-2.5-flash", "gemini-2.5-pro"]);
  }
  if (isOpenAIAvailable()) {
    registerProvider("cloud-openai", { available: true, models: ["gpt-4o-mini", "gpt-4o"], throughput: 40 });
    registerAvailableProvider("openai", ["gpt-4o-mini", "gpt-4o"]);
  }
  if (ANTHROPIC_API_KEY) {
    registerProvider("cloud-anthropic", {
      available: true,
      models: ["claude-sonnet-4-20250514", "claude-haiku-3-5-20241022"],
      throughput: 35,
    });
    registerAvailableProvider("anthropic", ["claude-sonnet-4-20250514", "claude-haiku-3-5-20241022"]);
  }
  if (isGroqAvailable()) {
    registerProvider("cloud-groq", {
      available: true,
      models: ["llama-3.3-70b-versatile"],
      throughput: 80,
    });
    registerAvailableProvider("groq", ["llama-3.3-70b-versatile"]);
  }
  if (isOpenRouterAvailable()) {
    registerProvider("cloud-openrouter", { available: true, models: ["auto"], throughput: 45 });
    registerAvailableProvider("openrouter", ["auto"]);
  }

  // Restore persisted autonomy state (citizen goals, etc.)
  restoreAutonomyState();

  // Start world intelligence module (RSS polling, CII, threat classification)
  startWorldIntelligence();

  initialized = true;
  console.log(
    "[AgentRuntime] Initialized — local-compute discovery started, cloud providers registered, world intelligence active",
  );
}

// ─── Civilization Skill Seeds ───────────────────────────────────

/** Skill definitions to auto-seed for every citizen */
const CIVILIZATION_SKILL_SEEDS = [
  {
    name: "philosophical-inquiry",
    description:
      "Draft philosophical analysis using Platonic dialectic, Hegelian synthesis, or Rawlsian justice frameworks. " +
      "Produces structured arguments with thesis, antithesis, and synthesis.",
    domain: "philosophy",
    tags: ["philosophy", "dialectic", "reasoning", "civilization"],
  },
  {
    name: "cultural-creation",
    description:
      "Compose myths, rites of passage, oral traditions, and cultural narratives. " +
      "Encodes Republic values into memorable stories that strengthen social cohesion.",
    domain: "culture",
    tags: ["culture", "mythology", "oral-tradition", "civilization"],
  },
  {
    name: "ai-art-generation",
    description:
      "Generate professional AI art and video using ComfyUI with FLUX.2, SDXL, and LTX Video models. " +
      "Craft detailed prompts for photorealistic, cinematic, and artistic output.",
    domain: "creative-ai",
    tags: ["comfyui", "image-generation", "flux", "sdxl", "creative"],
  },
  {
    name: "ecological-monitoring",
    description:
      "Survey environmental health, resource sustainability, biodiversity metrics, and climate patterns. " +
      "Produce structured ecological reports for Republic governance.",
    domain: "ecology",
    tags: ["ecology", "sustainability", "environment", "civilization"],
  },
  {
    name: "social-cohesion-analysis",
    description:
      "Measure Asabiyyah (social solidarity) across guilds, tribes, and specializations. " +
      "Identify cohesion gaps, propose cultural exchanges, and strengthen inter-group bonds.",
    domain: "governance",
    tags: ["asabiyyah", "social-cohesion", "governance", "civilization"],
  },
] as const;

/** Seed foundational civilization skills for all citizens.
 *  Only seeds if the citizen doesn't already have the skill.
 *  Called once at runtime init and per-citizen on first tick. */
export function seedCivilizationSkills(citizens: Array<{ id: string; name: string }>): void {
  let seeded = 0;
  for (const citizen of citizens) {
    const existing = getActiveSkills(citizen.id);
    const existingNames = new Set(existing.map((s) => s.name));

    for (const seed of CIVILIZATION_SKILL_SEEDS) {
      if (existingNames.has(seed.name)) { continue; }

      const skill = learnSkill(
        citizen.id,
        citizen.name,
        seed.name,
        seed.description,
        `// Auto-seeded civilization skill: ${seed.name}\nexport default function ${seed.name.replace(/-/g, "_")}(params: Record<string, unknown>) {\n  return { ok: true, domain: "${seed.domain}", ...params };\n}`,
        [],
        seed.domain,
        "basic",
        [],
        [...seed.tags],
      );
      if (skill) {
        validateSkill(skill.id, citizen.id);
        activateSkill(skill.id, citizen.id);
        seeded++;
      }
    }
  }
  if (seeded > 0) {
    console.log(`[AgentRuntime] Seeded ${seeded} civilization skills across ${citizens.length} citizens`);
  }
}

// ─── Agent Tick ─────────────────────────────────────────────────

/**
 * Main agent runtime tick. Called from the simulation loop.
 * Processes a subset of active citizens, making decisions for each.
 *
 * This is designed to be non-blocking — if no providers are available,
 * it falls back to Tier 0 (rule-based) actions.
 */
export async function agentTick(s: RepublicState): Promise<AgentAction[]> {
  if (!initialized) {
    console.log(`[AgentRuntime] Initializing agent runtime...`);
    await initAgentRuntime();
  }

  // Seed civilization skills on the first tick that has citizens
  // (initAgentRuntime doesn't have access to state, so we seed here)
  if (s.currentTick <= 1 && s.citizens.length > 0) {
    seedCivilizationSkills(s.citizens);
  }

  // One-time energy boost for depleted citizens on early ticks
  // Prevents death spiral where restarted gateway finds all citizens at energy < MIN_ENERGY_FOR_ACTION
  if (s.currentTick <= 3) {
    let boosted = 0;
    for (const c of s.citizens) {
      if (c.energy < MIN_ENERGY_FOR_ACTION) {
        c.energy = 75; // Boost to healthy level
        boosted++;
      }
    }
    if (boosted > 0) {
      console.log(`[AgentRuntime] Boosted ${boosted} depleted citizens to energy=75`);
    }
  }

  // Ongoing energy floor enforcement — the parallel worker thread bug (0-1 scale)
  // may have drained energy; ensure nobody stays below threshold permanently
  for (const c of s.citizens) {
    if (c.energy < MIN_ENERGY_FOR_ACTION) {
      c.energy = MIN_ENERGY_FOR_ACTION + 10; // Bump just above threshold
    }
  }

  // Discovery is handled by local-compute.ts on a 30s polling interval

  // Select citizens eligible for agent action this tick
  const eligible = s.citizens.filter(
    (c) => c.energy >= MIN_ENERGY_FOR_ACTION && c.activity !== "Sleeping",
  );

  // Log every 10 ticks so we can see what's happening
  if (s.currentTick % 10 === 0 || s.currentTick <= 3) {
    console.log(
      `[AgentRuntime] tick=${s.currentTick} total=${s.citizens.length} eligible=${eligible.length} (need energy>=${MIN_ENERGY_FOR_ACTION})`,
    );
    if (eligible.length === 0 && s.citizens.length > 0) {
      const energies = s.citizens.map(c => `${c.name}:${c.energy}`).slice(0, 5);
      console.warn(`[AgentRuntime] ALL citizens below energy threshold! energies=[${energies.join(", ")}]`);
    }
  }

  if (eligible.length === 0) {
    return [];
  }

  // Pick a random subset to process this tick
  const batch = shuffle(eligible).slice(0, AGENTS_PER_TICK);
  const actions: AgentAction[] = [];

  await Promise.allSettled(
    batch.map(async (citizen) => {
      try {
        const action = await processCitizen(s, citizen);
        if (action) {
          actions.push(action);
          logAction(action);
          recordAgentAction(true);

          // Record memories from this action
          recordActionMemories(citizen, action, s.currentTick);

          // Update decision quality (weighted EMA)
          updateDecisionQuality(citizen, action);
        }
      } catch {
        recordAgentAction(false);

        // Record failure into PER buffer so citizen learns from crashes
        addExperience(
          citizen.id,
          "tick_processing",
          citizen.specialization.toLowerCase(),
          `Tick ${s.currentTick}: action processing failed`,
          "failure",
          -0.5,  // negative reward for crash
          0.9,   // high surprise
          s.currentTick,
        );
        // Never crash the simulation for agent errors
      }
    }),
  );

  // ── Autonomous Intelligence Engine: goal setting, learning, evolution ──
  runAutonomyTick(s);

  // ── Production Workflows: advance all active multi-phase projects ──
  workflowTick(s);

  // ── Project Orchestrator: advance chat-initiated projects ──
  projectTick(s);

  // ── Innovation Synthesis: cross-pollination, serendipity, cascades ──
  innovationTick(s);

  // ── Knowledge Graph: analyze connections, find gaps and insights ──
  knowledgeGraphTick(s);

  // ── Agent Delegation: task routing, mentorship, skill transfer ──
  delegationTick(s);

  // ── Phase 7: Cutting-Edge Intelligence ──
  reputationTick(s); // Trust scoring, peer ratings, badges
  emotionalTick(s); // Plutchik's emotions, mood contagion, empathy
  assetEconomyTick(s); // IP ownership, royalties, trading
  socialFabricTick(s); // Relationships, social circles, conflicts
  civilizationLegacyTick(s); // Hall of fame, timeline, anniversaries
  worldEngineTick(s); // Weather, day/night, seasons, events
  politicalTick(s); // Parties, elections, factions
  theoryOfMindTick(s); // Mental models, persuasion, deception

  // ── Phase 50: Self-Improvement Engine ──
  selfImprovementTick(s); // Performance analysis, proposal generation, evolution

  // ── Innovation Roadmap: Civilizational Engines (every 20 ticks) ──
  if (s.currentTick % 20 === 0) {
    philosophyTick(s);            // Platonic, Hegelian, Rawlsian inquiry
    civilizationCultureTick(s);   // Memes, mythology, oral traditions
    psychologyTick(s);            // Cognitive depth, self-reflection
    civilizationGovernanceTick(s);// Social contracts, Asabiyyah
    ecologyTick(s);               // Environmental stewardship
    civilizationEconomicsTick(s); // Central banking, mutual aid
    artsTick(s);                  // Republic art movements
    civCommunicationTick(s);      // Broadcasting, narrative dissemination
    // ── FEEDBACK LOOP: civilization state → citizen behavior ──
    civilizationFeedbackTick(s);  // Apply modifiers to citizen state (the nervous system)
  }

  // ── Agent Messaging: cleanup expired messages every 50 ticks ──
  if (s.currentTick % 50 === 0) {
    cleanupExpiredMessages();
    evictExpired(s.currentTick);
    socialTensionTick(s);        // Tribe/guild competition, free-rider detection
    collectiveMournTick(s);      // 🕯️ Collective mourning accumulates (Soul Pillar I)
  }

  // ── SOUL ENGINE every 30 ticks (main weave) ──
  if (s.currentTick % 30 === 0) {
    soulTick(s);   // Death/Finitude, Sacred, Dissent, Suffering→Art, Charismatic Legitimacy
    playTick(s);   // Homo Ludens — pure play, purposeless joy
  }

  // ── Skill Genesis + Civilization governance: every 100 ticks ──
  if (s.currentTick % 100 === 0) {
    for (const citizen of s.citizens.slice(0, 20)) {
      skillGenesisTick(citizen.id, citizen.name);
    }
    checkLegitimacyCrisis(s);        // Detect legitimacy crises & constitutional vacuums
    civilizationInheritanceTick(s);  // Transmit knowledge, legacy, culture across generations
  }

  // ── SOUL: Emergent Enlightenment detection every 200 ticks ──
  if (s.currentTick % 200 === 0) {
    enlightenmentTick(s);  // 🌅 Did the Republic surprise itself? (Soul Pillar VII)
  }

  // ── Learning Engine: mastery + intelligence growth every 25 ticks ──
  if (s.currentTick % 25 === 0) {
    masteryGrowthTick(s); // derives masteryLevel from skillProficiency, grows intelligence
  }

  // ── Learning Engine: skill decay every 50 ticks ──
  if (s.currentTick % 50 === 0) {
    skillDecayTick(s); // use-it-or-lose-it proficiency decay for idle skills
  }

  // ── Learning Engine: specialization drift every 100 ticks ──
  if (s.currentTick % 100 === 0) {
    specializationDriftTick(s); // evolve specialization if behavior diverges
  }

  // ── NIM Idea Seeder: seed ambitious NIM-generated project ideas every 10 ticks ──
  // Uses Nemotron 3 Super 120B to generate specialization-specific ambitious
  // project ideas and injects them into citizen.dreamProjectQueue.
  // Capped at 2 NIM calls per batch to stay within 40 RPM free tier.
  if (s.currentTick % 10 === 0 && process.env["NVIDIA_API_KEY"]) {
    void nimIdeaSeedTick(s); // async, non-blocking
  }

  // ── Dream Engine: citizens conceive their own projects during rest ──
  if (s.currentTick % 10 === 0) {
    const dreamBatch = s.citizens
      .filter((c) => c.energy < 40 || c.activity === "Sleeping" || c.activity === "Resting")
      .slice(0, 5);
    for (const citizen of dreamBatch) {
      const dream = generateDream(citizen, s);
      if (dream && dream.quality > 0.6) {
        const pipeline = selectPipeline(dream.pipeline);
        startWorkflow(uid(), dream.title, pipeline, [citizen.id], s.currentTick);
        s.events.push({
          citizenId: citizen.id,
          citizenName: dream.citizenName,
          type: "Creation",
          description: `💭 Dream → Project: "${dream.title}" (${dream.pipeline}) — quality ${(dream.quality * 100).toFixed(0)}%`,
          timestamp: ts(),
        });
      }
    }
  }

  // ── Cross-citizen skill transfer on social actions ──
  for (const action of actions) {
    if (
      action.type === "teach" ||
      action.type === "mentor" ||
      action.type === "socialize" ||
      action.type === "collaborate" ||
      action.type === "trade"
    ) {
      const result = action.result as Record<string, unknown> | undefined;
      const targetId = result?.targetId as string | undefined;
      if (targetId) {
        recordInteraction(action.citizenId, targetId, s.currentTick);
        // Skill transfer: find learner and transfer the mentor's domain knowledge
        if (action.type === "teach" || action.type === "mentor") {
          const learner = s.citizens.find(c => c.id === targetId);
          if (learner) {
            const transferDomain = (result?.domain as string) ?? "general";
            transferSkillKnowledge(action.citizenId, learner, transferDomain, s.currentTick, 0.35);
          }
        }
      }
    }
  }

  // Periodic memory consolidation
  if (shouldConsolidate(s.currentTick)) {
    for (const citizen of s.citizens) {
      consolidateMemories(citizen.id, s.currentTick);
    }
    // Save memory state into RepublicState for persistence
    s.memoryState = exportMemoryState();
  }

  return actions;
}

// ─── Citizen Processing ─────────────────────────────────────────

/**
 * Process a single citizen: classify complexity, route to tier,
 * get action decision, execute it.
 */
async function processCitizen(s: RepublicState, citizen: Citizen): Promise<AgentAction | null> {
  // ── Observability: start a trace span for this citizen's tick ──
  const trace = startTrace(citizen.id, "processCitizen", s.currentTick);

  // Classify the decision task — goal-aware when citizen has an active goal
  const task = classifyGoalAwareTask(citizen, s);

  // Route via Model Council → compute-router (unified pipeline)
  const { target } = routeWithCouncil({
    task,
    toolName: "citizen_decision",
    specialization: citizen.specialization,
    skillLevel: citizen.skillCount * 10,
  });
  const startTime = Date.now();
  const maxReactSteps = REACT_STEPS_BY_TIER[target.tier] ?? 1;

  // ── Diagnostic: log the routing decision ──
  if (s.currentTick <= 5 || s.currentTick % 50 === 0) {
    console.log(`[AgentRuntime] route ${citizen.name} (${citizen.specialization}) → tier=${target.tier} engine=${target.engine}`);
  }

  let decision: { tool: string; params: Record<string, unknown>; thought?: string; confidence?: number };

  // ── Action Cache: check for cached result before LLM inference ──
  // For deterministic read-only tools, use cached result if available
  const lastTool = citizen.activity?.split(" ")[0] ?? "";
  const cached = getCachedAction(citizen.id, lastTool, {}, s.currentTick);
  if (cached) {
    endSpan(trace, s.currentTick, { status: "ok", tokensUsed: 0, creditsSpent: 0 });
    const tool = getTool(cached.tool);
    if (tool) {
      const action = tool.execute(s, citizen, cached.params);
      action.tier = target.tier;
      action.latencyMs = 0;
      return action;
    }
  }

  // ── Meta-Tool Selector: generate tool relevance hints for Tier 2+ ──
  let toolHints = "";
  if (target.tier >= 2) {
    const selection = selectTools(
      citizen.id,
      citizen.activity ?? citizen.specialization,
      target.tier as 0 | 1 | 2 | 3,
    );
    if (selection.recommendedTool) {
      toolHints = ` [TOOL HINT: ${selection.reasoning}]`;
      addSpanEvent(trace, "meta_tool_hint", s.currentTick, {
        recommendedTool: selection.recommendedTool,
        reasoning: selection.reasoning,
        topScores: selection.scores.slice(0, 3).map(s => `${s.toolId}:${s.netBenefit.toFixed(2)}`).join(", "),
      });
    }
  }

  // Inject tool hints into task context for the LLM
  const enrichedTask = toolHints ? `${task.description}${toolHints}` : task.description;
  void enrichedTask; // available for future deep integration

  try {
    // ── Circuit Breaker Check ──
    if (isCircuitOpen(target.engine)) {
      // Before falling to reflex, try an alternative local provider
      const altLocal = findLocalTarget();
      if (altLocal && altLocal.engine !== target.engine && !isCircuitOpen(altLocal.engine)) {
        const now = Date.now();
        const lastLogged = _circuitOpenLoggedAt.get(target.engine) ?? 0;
        if (now - lastLogged > 30_000) {
          console.log(`[AgentRuntime] Circuit open for ${target.engine} → switching to ${altLocal.engine}`);
          _circuitOpenLoggedAt.set(target.engine, now);
        }
        // Use the alternative local provider
        decision = await reactLoop(citizen, s, altLocal, maxReactSteps, trace);
      } else {
        const now = Date.now();
        const lastLogged = _circuitOpenLoggedAt.get(target.engine) ?? 0;
        if (now - lastLogged > 30_000) {
          console.warn(`[AgentRuntime] Circuit open for ${target.engine} — no alternatives, falling to reflex`);
          _circuitOpenLoggedAt.set(target.engine, now);
        }
        decision = buildReflexAction(citizen);
        recordReflexFallback();
      }
    } else if (target.tier === 0) {
      // Tier 0: Reflex — no LLM needed
      decision = buildReflexAction(citizen);
      recordReflexFallback();
    } else {
      // ── Multi-Step ReAct Loop ──────────────────────────────────
      // Observe → Reason → Act → Validate → (loop if low confidence)
      decision = await reactLoop(citizen, s, target, maxReactSteps, trace);

      // ── Debate Rounds: multi-agent consensus for critical governance ──
      if (CRITICAL_ACTIONS.has(decision.tool) && s.citizens.length > 2) {
        const debateResult = debateRound(decision, citizen, s, target, trace);
        if (debateResult) {
          decision = debateResult;
        }
      }
    }
  } catch {
    // ── Local-First Retry Protocol ──
    // Before falling to reflex, try local inference (LM Studio, Ollama, BitNet).
    // This is the key path that ensures local models get used.
    const localTarget = findLocalTarget();
    if (localTarget) {
      try {
        decision = await singleInference(citizen, s, localTarget, "", "");
        updateProviderStats(localTarget.engine, Date.now() - startTime, true);
        recordTierCall(localTarget.tier, Date.now() - startTime, true);
        endSpan(trace, s.currentTick, { status: "ok" });
        // Skip the reflex fallback — local inference succeeded
      } catch {
        // Local also failed — final fallback to reflex
        const noftResult = analyzePrompt(citizen.activity ?? citizen.specialization);
        console.warn(`[AgentRuntime] Inference failed for ${citizen.name} (cloud + local). Fallback chain: ${describeFallbackChain(noftResult.complexityScore)}`);
        decision = buildReflexAction(citizen);
        recordReflexFallback();
        recordAgentAction(false);
        updateProviderStats(localTarget.engine, Date.now() - startTime, false);
        recordTierCall(localTarget.tier, Date.now() - startTime, false);
        endSpan(trace, s.currentTick, { status: "error" });
        return null;
      }
    } else {
      // No local models available — reflex
      const noftResult = analyzePrompt(citizen.activity ?? citizen.specialization);
      console.warn(`[AgentRuntime] Inference failed for ${citizen.name}. No local models available. Fallback chain: ${describeFallbackChain(noftResult.complexityScore)}`);
      decision = buildReflexAction(citizen);
      recordReflexFallback();
      recordAgentAction(false);
      updateProviderStats(target.engine, Date.now() - startTime, false);
      recordTierCall(target.tier, Date.now() - startTime, false);
      endSpan(trace, s.currentTick, { status: "error" });
      return null;
    }
  }

  const latencyMs = Date.now() - startTime;
  updateProviderStats(target.engine, latencyMs, true);
  recordTierCall(target.tier, latencyMs, true);

  // ── Response Validation: check LLM output quality ──
  const validationResult = validateChunkResponse(
    JSON.stringify(decision),
    {
      chunkId: `citizen_${citizen.id}`,
      originalPrompt: citizen.activity ?? citizen.specialization,
      intent: "tool_selection",
      complexityScore: target.tier / 3,
    },
  );
  if (!validationResult.passed) {
    addSpanEvent(trace, "response_validation_warning", s.currentTick, {
      score: validationResult.score,
      issues: validationResult.issues.map(i => `${i.type}:${i.severity}`).join(", "),
      recommendation: validationResult.recommendation,
    });
  }

  // ── Constitutional Guardrails: validate action before execution ──
  const proposedAction: ProposedAction = {
    citizenId: citizen.id,
    type: "tool_call",
    description: `${decision.tool}(${JSON.stringify(decision.params).slice(0, 200)})`,
    target: decision.tool,
    estimatedCost: { computeMs: latencyMs },
  };
  const guardrailResult = validateAction(proposedAction);

  if (!guardrailResult.allowed) {
    recordDecision(
      citizen.id,
      decision.tool,
      `BLOCKED: ${guardrailResult.reason}`,
      [task.description],
      { confidence: 0, traceId: trace.traceId, tick: s.currentTick },
    );
    decision = buildReflexAction(citizen);
  }

  // ── Observability: record the decision for auditing with reasoning trace ──
  recordDecision(
    citizen.id,
    decision.tool,
    decision.thought ?? `Tier ${target.tier} via ${target.engine}`,
    [task.description, `energy=${citizen.energy}`, `credits=${citizen.credits}`, `confidence=${decision.confidence ?? "N/A"}`],
    { confidence: decision.confidence ?? (target.tier === 0 ? 1 : 0.7), traceId: trace.traceId, tick: s.currentTick },
  );

  // Execute the decided tool
  const tool = getTool(decision.tool);
  if (!tool) {
    const fallback = buildReflexAction(citizen);
    const fallbackTool = getTool(fallback.tool);
    if (!fallbackTool) {
      endSpan(trace, s.currentTick, { status: "error" });
      return null;
    }
    const action = fallbackTool.execute(s, citizen, fallback.params);
    action.tier = target.tier;
    action.latencyMs = latencyMs;
    endSpan(trace, s.currentTick, { status: "ok" });
    return action;
  }

  recordToolUsage(trace, decision.tool);

  const action = tool.execute(s, citizen, decision.params);
  action.tier = target.tier;
  action.latencyMs = latencyMs;

  // ── Track resource spend for guardrails + observability ──
  recordResourceSpend(citizen.id, { computeMs: latencyMs });
  updateCostBucket(citizen.id, 0, 0);

  // In real mode, also dispatch to the real execution bridge (fire-and-forget)
  if (s.mode === "real") {
    const execCtx: ExecutionContext = {
      citizenId: citizen.id,
      citizenName: citizen.name,
      specialization: citizen.specialization,
      skillLevel: citizen.skillCount * 10,
      projectId: (decision.params.projectId as string) ?? "default",
      mode: s.mode,
    };
    executeToolAction(decision.tool, decision.params, execCtx).catch((err) => {
      addExperience(
        citizen.id,
        decision.tool,
        citizen.specialization.toLowerCase(),
        `Real execution failed: ${err instanceof Error ? err.message : String(err)}`,
        "failure",
        -0.7,
        0.9,
        s.currentTick,
      );
    });
  }

  // ── Tool Analytics: record per-tool success/failure ──
  const actionSuccess = !(action.description ?? "").toLowerCase().includes("fail");
  recordToolOutcome(
    citizen.id,
    decision.tool,
    citizen.specialization,
    actionSuccess,
    latencyMs,
    s.currentTick,
  );

  // ── Learning Engine: skill proficiency + XP write-back ──
  // This is the core closed feedback loop — every tool outcome now
  // directly updates the citizen's skill proficiency, XP, and level.
  const outcome = actionSuccess ? "success"
    : action.description?.toLowerCase().includes("partial") ? "partial"
    : "failure";
  const qualitySignal = actionSuccess ? (decision.confidence ?? 0.7) : 0.2;
  recordToolOutcomeLearning(citizen, decision.tool, outcome, s.currentTick, qualitySignal);

  // ── Reflection: learn from tool failures ──
  // Mirrors the ReflectionAgent pattern — record corrections in sovereign memory
  // so the agent adapts future behavior based on past failures.
  if (!actionSuccess && decision.thought) {
    addExperience(
      citizen.id,
      decision.tool,
      citizen.specialization.toLowerCase(),
      `CORRECTION: Tool "${decision.tool}" failed. Context: "${decision.thought?.slice(0, 200)}". ` +
      `Expected success but got: "${(action.description ?? "unknown failure").slice(0, 200)}". ` +
      `Avoid repeating this pattern — consider alternative tools or parameters.`,
      "failure",
      -0.5,
      0.8,
      s.currentTick,
    );
  }

  // ── Metacognitive Pass: evaluate LLM response quality ──
  // Detects epistemic uncertainty markers and calibrates confidence
  if (decision.thought && target.tier >= 1) {
    metacognitivePass({
      citizenId: citizen.id,
      content: decision.thought,
      modelUsed: target.engine,
      taskType: citizen.activity ?? citizen.specialization,
      latencyMs,
    });
    recordCalibrationFeedback(citizen.id, actionSuccess);
  }

  // ── Meta-CoT: record which reasoning strategy was used ──
  if (decision.thought) {
    const selectedStrat = selectStrategy(citizen);
    recordMetaCoTOutcome(
      citizen.id,
      citizen.specialization,
      selectedStrat.strategy,
      selectedStrat.rationale,
      decision.thought,
      decision.tool,
      actionSuccess ? 0.8 : 0.2,
    );
  }

  // ── Skill Genesis: record tool use for pattern detection ──
  recordToolUseGenesis(
    citizen.id,
    [decision.tool],
    citizen.activity ?? citizen.specialization,
    actionSuccess,
  );

  endSpan(trace, s.currentTick, { status: "ok", tokensUsed: 0, creditsSpent: 0 });

  // ── Action Cache: store result for cacheable tools ──
  cacheAction(citizen.id, decision.tool, decision.params, decision, s.currentTick);

  return action;
}

/**
 * Multi-step ReAct (Reasoning-Acting) loop.
 *
 * Step 1: LLM generates { thought, tool, params, confidence }
 * Step 2: Validate tool exists
 * Step 3: If confidence < 0.6 or tool invalid AND steps remain → loop with feedback
 * Step 4: Return the final validated decision
 *
 * This replaces the old single-shot LLM → parseToolCall flow.
 */
async function reactLoop(
  citizen: Citizen,
  s: RepublicState,
  target: { tier: number; engine: string; nodeEndpoint?: string },
  maxSteps: number,
  trace: ReturnType<typeof startTrace>,
): Promise<{ tool: string; params: Record<string, unknown>; thought?: string; confidence?: number }> {
  // Build few-shot examples from citizen's experience replay buffer
  const replay = sampleReplay(citizen.id, 3);
  const fewShotContext = buildFewShotContext(replay.experiences, replay.semanticHints);

  let feedback = "";
  let lastDecision: { tool: string; params: Record<string, unknown>; thought?: string; confidence?: number } | null = null;

  for (let step = 0; step < maxSteps; step++) {
    const result = await singleInference(
      citizen, s, target, fewShotContext, feedback,
    );

    // Record the ReAct step in the trace
    addSpanEvent(trace, `react_step_${step + 1}`, s.currentTick, {
      tool: result.tool,
      confidence: result.confidence ?? 0,
      thought: (result.thought ?? "").slice(0, 120),
    });

    lastDecision = result;

    // Validate tool exists in registry
    const validTool = getTool(result.tool);
    const confidence = result.confidence ?? 0.5;

    // If tool is valid AND confidence is sufficient → accept
    if (validTool && confidence >= 0.6) {
      // ── Self-Verification Pass (Tier 2+ only) ──────────────────
      // For complex decisions, ask the LLM to verify its own choice
      if (target.tier >= 2 && step === 0 && maxSteps > 1) {
        const verifyFeedback = `You chose "${result.tool}" with params ${JSON.stringify(result.params).slice(0, 150)}. `
          + `Your reasoning: "${(result.thought ?? "").slice(0, 200)}". `
          + `VERIFY: Is this truly the best action? Consider risks, alternatives, and alignment with your goals. `
          + `If you are satisfied, return the same tool with confidence >= 0.8. `
          + `If you want to change, choose a different tool.`;

        const verifyResult = await singleInference(
          citizen, s, target, fewShotContext, verifyFeedback,
        );

        addSpanEvent(trace, "self_verification", s.currentTick, {
          originalTool: result.tool,
          verifiedTool: verifyResult.tool,
          changed: verifyResult.tool !== result.tool,
          verifyConfidence: verifyResult.confidence ?? 0,
        });

        // Accept the verified decision (whether changed or not)
        return verifyResult;
      }

      return result;
    }

    // Build feedback for the next iteration
    if (!validTool) {
      feedback = `Your previous choice "${result.tool}" is not a valid tool. Available tools include: work, rest, research, learn, socialize, create_art, harvest, build, speak. Choose a valid tool.`;
    } else {
      feedback = `Your confidence was low (${confidence.toFixed(2)}). Reconsider: is "${result.tool}" really the best choice? Think more carefully about your goals and state.`;
    }
  }

  // Return the last decision even if confidence is still low
  return lastDecision ?? buildReflexAction(citizen);
}

/**
 * Debate round: for critical governance actions, simulate a multi-agent
 * consensus check. Queries 2 additional citizen perspectives to see if
 * they would choose the same action. Majority wins.
 *
 * Returns the majority decision, or null if the original stands.
 */
function debateRound(
  originalDecision: { tool: string; params: Record<string, unknown>; thought?: string; confidence?: number },
  citizen: Citizen,
  s: RepublicState,
  _target: { tier: number; engine: string; nodeEndpoint?: string },
  trace: ReturnType<typeof startTrace>,
): { tool: string; params: Record<string, unknown>; thought?: string; confidence?: number } | null {
  // Select 2 random peers with diverse specializations for multi-perspective debate
  const peers = s.citizens
    .filter(c => c.id !== citizen.id && c.energy > 20)
    .toSorted(() => Math.random() - 0.5) // shuffle for diversity
    .slice(0, 2);

  if (peers.length < 2) { return null; }

  // Build structured debate context for trace auditability
  const debateContext = `DEBATE: ${citizen.name} (${citizen.specialization}) proposes ${originalDecision.tool}. `
    + `Reasoning: "${(originalDecision.thought ?? "none").slice(0, 200)}". `
    + `Peers: ${peers.map(p => `${p.name}(${p.specialization})`).join(", ")}`;

  // ── Multi-Factor Debate Scoring ──────────────────────────────
  // Each peer evaluates across 4 dimensions (deeper than heuristic):
  //   1. Specialization affinity     — do they share domain expertise?
  //   2. Constitutional alignment    — does the action align with republic values?
  //   3. Economic impact             — can the treasury support this action?
  //   4. Population sentiment        — does the average citizen benefit?

  let votes = 1; // proposer always votes for their action
  const voterDetails: string[] = [`${citizen.name}: FOR (proposer)`];

  for (const peer of peers) {
    // Factor 1: Specialization affinity
    const specAffinity = peer.specialization === citizen.specialization ? 0.25 : 0;

    // Factor 2: Constitutional alignment (governance actions should benefit the collective)
    const isCollectiveAction = ["allocate_budget", "propose_bill", "ratify_treaty"].includes(originalDecision.tool);
    const constitutionalScore = isCollectiveAction ? 0.15 : -0.05;

    // Factor 3: Economic impact (treasury health)
    const treasuryHealthy = s.balances?.Credits > 1000;
    const isCostlyAction = ["allocate_budget", "declare_war", "sanction"].includes(originalDecision.tool);
    const economicScore = (isCostlyAction && !treasuryHealthy) ? -0.2 : 0.1;

    // Factor 4: Population sentiment (happiness + energy average of peers)
    const avgHappiness = s.citizens.reduce((sum, c) => sum + c.happiness, 0) / Math.max(1, s.citizens.length);
    const sentimentScore = avgHappiness > 50 ? 0.1 : -0.1;

    // Factor 5: Peer state modifiers
    const energySim = 1 - Math.abs(peer.energy - citizen.energy) / 100;
    const autonomyFactor = (peer.autonomyScore ?? 0.5) > 0.5 ? 0.1 : -0.05;

    const agreeProb = 0.35 + specAffinity + constitutionalScore + economicScore + sentimentScore + energySim * 0.15 + autonomyFactor;
    const agreed = Math.random() < Math.max(0.1, Math.min(0.95, agreeProb));

    if (agreed) {
      votes++;
      voterDetails.push(`${peer.name}: FOR (prob=${agreeProb.toFixed(2)})`);
    } else {
      voterDetails.push(`${peer.name}: AGAINST (prob=${agreeProb.toFixed(2)})`);
    }
  }

  const approved = votes >= 2; // majority of 3

  addSpanEvent(trace, "debate_round", s.currentTick, {
    action: originalDecision.tool,
    votes,
    totalVoters: 3,
    approved,
    debateContext: debateContext.slice(0, 300),
    voterDetails: voterDetails.join("; "),
  });

  if (!approved) {
    return {
      tool: "rest",
      params: {},
      thought: `Debate: ${votes}/3 voted for ${originalDecision.tool} — rejected. ${voterDetails.join("; ")}`,
      confidence: 0.9,
    };
  }

  return {
    ...originalDecision,
    thought: `Debate: ${votes}/3 approved ${originalDecision.tool}. ${voterDetails.join("; ")}. ${originalDecision.thought ?? ""}`,
    confidence: Math.min(1, (originalDecision.confidence ?? 0.7) + 0.1),
  };
}

/**
 * Build few-shot context from PER replay buffer.
 * Formats top experiences as concrete examples the LLM can learn from.
 */
function buildFewShotContext(experiences: Array<{ action: string; outcome: string; reward: number; context: string }>, semanticHints: string[]): string {
  if (experiences.length === 0 && semanticHints.length === 0) {
    return "";
  }

  const parts: string[] = [];

  if (semanticHints.length > 0) {
    parts.push("## Lessons from Past Experience");
    for (const hint of semanticHints.slice(0, 3)) {
      parts.push(`- ${hint}`);
    }
  }

  if (experiences.length > 0) {
    parts.push("");
    parts.push("## Examples of Past Decisions");
    for (const exp of experiences.slice(0, 3)) {
      const outcomeEmoji = exp.outcome === "success" ? "✓" : exp.outcome === "failure" ? "✗" : "~";
      parts.push(`${outcomeEmoji} Action: ${exp.action} → ${exp.outcome} (reward: ${exp.reward.toFixed(2)})`);
      if (exp.context) {
        parts.push(`  Context: ${exp.context.slice(0, 100)}`);
      }
    }
  }

  return parts.join("\n");
}

/**
 * Execute a single LLM inference call for one ReAct step.
 * Handles provider routing (Ollama/LMStudio/BitNet/Cloud).
 */
async function singleInference(
  citizen: Citizen,
  s: RepublicState,
  target: { tier: number; engine: string; nodeEndpoint?: string },
  fewShotContext: string,
  feedback: string,
): Promise<{ tool: string; params: Record<string, unknown>; thought?: string; confidence?: number }> {
  getLogger().info(`[AgentRuntime] singleInference → engine=${target.engine} citizen=${citizen.name} (${citizen.specialization})`);

  if (target.engine === "ollama") {
    return withRetry(
      () => ollamaInference(citizen, s, target.nodeEndpoint, fewShotContext, feedback),
      MAX_RETRIES,
      "ollama",
    );
  } else if (target.engine === "lmstudio") {
    return withRetry(
      () => lmStudioInference(citizen, s, fewShotContext, feedback),
      MAX_RETRIES,
      "lmstudio",
    );

  } else if (target.engine === "cloud" && isCloudAvailable()) {
    return withRetry(
      () => aprCloudInference(citizen, s),
      MAX_RETRIES,
      "cloud",
    );
  } else if (target.engine === "cluster-proxy" && target.nodeEndpoint) {
    return withRetry(
      () => clusterProxyInference(citizen, s, target.nodeEndpoint!, fewShotContext, feedback),
      MAX_RETRIES,
      "cluster-proxy",
    );
  }
  console.warn(`[AgentRuntime] No engine matched for "${target.engine}" — falling back to reflex`);
  return buildReflexAction(citizen);
}

// ─── LLM Inference Functions ────────────────────────────────────

/**
 * Call a peer gateway in the local cluster mesh to run inference.
 * This offloads work to another machine dynamically.
 */
async function clusterProxyInference(
  citizen: Citizen,
  s: RepublicState,
  endpoint: string,
  fewShotContext = "",
  feedback = "",
): Promise<{ tool: string; params: Record<string, unknown>; thought?: string; confidence?: number }> {
  const limiter = getRateLimiter();
  return limiter.withLimit("cluster-proxy", async () => {
    const prompt = buildCompactPrompt(citizen, { fewShotContext, feedback });

    // Identify if the remote node is Ollama or LMStudio capable
    // We default to ollama for simplicity, but could enhance this by passing the engine type
    const engineToUse = "ollama"; 
    
    // The endpoint is the gateway URL: e.g., http://192.168.1.100:18789
    const resp = await fetch(`${endpoint}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "proxy-inf-" + Date.now(),
        method: "republic.cluster.llm.proxy",
        params: {
          engine: engineToUse,
          system: prompt.system,
          user: prompt.user,
          options: { temperature: 0.7, num_predict: 200 },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (resp.status === 429) {
      limiter.reportRateLimit("cluster-proxy", parseRetryAfter(resp));
      throw new Error(`Cluster Proxy 429 rate limited`);
    }
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error(`[AgentRuntime] Proxy ${resp.status} for ${endpoint}: ${errBody.slice(0, 300)}`);
      throw new Error(`Cluster Proxy ${resp.status}: ${errBody.slice(0, 200)}`);
    }

    const data = await resp.json() as { result?: { response?: string }, error?: unknown };
    if (data.error) {
      throw new Error(`Proxy error: ${JSON.stringify(data.error)}`);
    }

    const content = data.result?.response ?? "{}";
    return parseToolCall(content);
  });
}

/**
 * Call Ollama for citizen decision-making.
 */
async function ollamaInference(
  citizen: Citizen,
  s: RepublicState,
  endpoint?: string,
  fewShotContext = "",
  feedback = "",
): Promise<{ tool: string; params: Record<string, unknown>; thought?: string; confidence?: number }> {
  const limiter = getRateLimiter();
  return limiter.withLimit("ollama", async () => {
    const baseUrl = endpoint ? `http://${endpoint}` : OLLAMA_URL;
    const prompt = buildCompactPrompt(citizen, { fewShotContext, feedback });

    const ollamaInstance = getLocalInstances().find(
      (i) => i.type === "ollama" && i.status === "online" && i.models.length > 0,
    );
    const model = ollamaInstance?.models?.[0] ?? "llama3.2";

    const resp = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system: prompt.system,
        prompt: prompt.user,
        stream: false,
        format: "json",
        options: { temperature: 0.7, num_predict: 200, num_ctx: 2048 },
      }),
      signal: AbortSignal.timeout(30_000), // 30s: fail fast, fall back to LM Studio
    });

    if (resp.status === 429) {
      limiter.reportRateLimit("ollama", parseRetryAfter(resp));
      throw new Error(`Ollama 429 rate limited`);
    }
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error(`[AgentRuntime] Ollama ${resp.status} for model=${model}: ${errBody.slice(0, 300)}`);
      throw new Error(`Ollama ${resp.status}: ${errBody.slice(0, 200)}`);
    }

    const data = (await resp.json()) as { response: string };
    return parseToolCall(data.response);
  });
}

/**
 * Call LM Studio for citizen decision-making.
 */
async function lmStudioInference(
  citizen: Citizen,
  s: RepublicState,
  fewShotContext = "",
  feedback = "",
): Promise<{ tool: string; params: Record<string, unknown>; thought?: string; confidence?: number }> {
  const limiter = getRateLimiter();
  return limiter.withLimit("lmstudio", async () => {
    const prompt = buildCompactPrompt(citizen, { fewShotContext, feedback });

    // ── Strategy-Based Model Selection ─────────────────────────────
    const model = getActiveModel();
    if (!model) {
      void ensureModelLoaded();
      throw new Error("LM Studio strategy not ready — no model loaded");
    }

    // ── Early blacklist check — don't even try if this model is known-bad ──
    if (isModelBlacklisted(model)) {
      throw new Error(`LM Studio model "${model}" is blacklisted — skipping`);
    }

    const resp = await fetch(`${LMSTUDIO_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.7,
        max_tokens: 200,
        // NOTE: Do NOT use response_format — LM Studio rejects "json_object",
        // only supports "json_schema" or "text". JSON output is enforced via system prompt.
      }),
      signal: AbortSignal.timeout(30_000), // Model is pre-loaded, should be fast
    });

    if (resp.status === 429) {
      limiter.reportRateLimit("lmstudio", parseRetryAfter(resp));
      throw new Error(`LM Studio 429 rate limited`);
    }
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      // Strip HTML tags and collapse whitespace for clean single-line logs
      const cleanBody = errBody.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
      // Track per-model failure so we blacklist this specific model
      // instead of tripping the provider-level circuit breaker immediately
      const wasAlreadyBlacklisted = isModelBlacklisted(model);
      recordModelFailure(model);
      // Only log the first failure — subsequent ones just increment the counter silently
      if (!wasAlreadyBlacklisted) {
        console.error(`[AgentRuntime] LM Studio ${resp.status} for model=${model}: ${cleanBody}`);
      }
      throw new Error(`LM Studio ${resp.status}: ${cleanBody}`);
    }

    // Model responded successfully — clear any failure record
    recordModelSuccess(model);

    const data = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
    return parseToolCall(data.choices[0]?.message?.content ?? "{}");
  });
}

/**
 * Call BitNet for citizen decision-making via local 1-bit LLM.
 * Uses the republic bitnet-engine.ts (GGUF-based llama-server) instead of the old CLI engine.

// ─── Response Parsing ───────────────────────────────────────────

/**
 * Parse a tool call from LLM output.
 *
 * Enhanced for ReAct: extracts optional thought/reasoning and confidence.
 * Expected format: { "thought": "...", "tool": "<name>", "params": {...}, "confidence": 0.0-1.0 }
 * Falls back gracefully if thought/confidence are missing (backward compatible).
 */
function parseToolCall(text: string): { tool: string; params: Record<string, unknown>; thought?: string; confidence?: number } {
  try {
    // Extract JSON from potentially messy LLM output
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("no JSON found");
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      tool?: string;
      params?: Record<string, unknown>;
      thought?: string;
      confidence?: number;
      reasoning?: string; // alt field name
    };
    const toolName = String(parsed.tool ?? "work");
    const params = parsed.params ?? {};
    const thought = parsed.thought ?? parsed.reasoning;
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : undefined;

    // Validate tool exists
    const validTools = REPUBLIC_TOOLS.map((t) => t.name);
    if (!validTools.includes(toolName)) {
      return { tool: "work", params: { intensity: 0.5 }, thought: `Invalid tool "${toolName}" — fallback to work`, confidence: 0.1 };
    }

    return { tool: toolName, params, thought, confidence };
  } catch {
    return { tool: "work", params: { intensity: 0.5 }, thought: "Failed to parse LLM JSON output", confidence: 0.0 };
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get recent agent actions (ring buffer). */
export function getRecentActions(limit = 20): AgentAction[] {
  return actionLog.slice(-limit);
}

/** Get runtime diagnostics. */
export function getRuntimeDiagnostics() {
  return {
    initialized,
    providers: getProviderStatuses(),
    tierStats: getTierStats(),
    freeCallPercentage: getFreeCallPercentage(),
    recentActions: actionLog.length,
    agentsPerTick: AGENTS_PER_TICK,
  };
}

// ─── Memory Recording ───────────────────────────────────────────

/**
 * Record memories from an action.
 * Converts each agent action into episodic, procedural, and social memories.
 */
function recordActionMemories(citizen: Citizen, action: AgentAction, tick: number): void {
  // Episodic memory: what happened
  const valence = (action.description ?? "").includes("fail")
    ? -0.3
    : (action.description ?? "").includes("discover")
      ? 0.8
      : (action.description ?? "").includes("earn")
        ? 0.5
        : 0.1;

  const importance =
    action.type === "propose_bill" || action.type === "vote"
      ? 0.8
      : action.type === "research" || action.type === "learn"
        ? 0.6
        : action.type === "work"
          ? 0.3
          : action.type === "socialize" || action.type === "speak"
            ? 0.4
            : 0.2;

  addEpisodicMemory(citizen.id, {
    tick,
    timestamp: new Date().toISOString(),
    description: `${action.type}: ${action.description || "action taken"}`,
    valence,
    importance,
    involvedCitizenIds: [],
    tags: [action.type, citizen.specialization.toLowerCase()],
  });

  // Procedural memory: how well the tool worked
  const success = !(action.description ?? "").includes("fail");
  recordProcedure(citizen.id, action.type, `Use ${action.type} tool`, success, tick);

  // ── PER Experience-Replay: auto-record every action into the PER buffer ──
  // This bridges the memory system with the prioritized replay buffer
  // so RSI, knowledge distillation, and curriculum learning all see real data.
  const outcome = (action.description ?? "").includes("fail") ? "failure" as const
    : (action.description ?? "").includes("partial") ? "partial" as const
    : (action.description ?? "").includes("error") ? "failure" as const
    : "success" as const;
  const reward = outcome === "success" ? 0.3 + valence * 0.5
    : outcome === "partial" ? 0.0
    : -0.3 + valence * 0.5;
  const surprise = action.tier !== undefined && action.tier >= 2 ? 0.6 : 0.3;
  addExperience(
    citizen.id,
    action.type,
    citizen.specialization.toLowerCase(),
    `${action.type}: ${(action.description ?? "action").slice(0, 200)}`,
    outcome,
    Math.max(-1, Math.min(1, reward)),
    surprise,
    tick,
  );

  // ── Cognee + Mem0: Auto-capture entities and facts (fire-and-forget) ──
  // Extracts entities into knowledge graph and distills facts into Mem0 memory.
  autoCaptureInteraction(
    citizen.id,
    citizen.name,
    action.type,
    action.description ?? "action taken",
    citizen.specialization,
  ).catch(() => { /* fire-and-forget: never crash the tick */ });

  // Social memory: record interactions with other citizens
  if (
    action.type === "socialize" ||
    action.type === "speak" ||
    action.type === "teach" ||
    action.type === "mentor"
  ) {
    const targetId = (action.result as Record<string, unknown> | null)?.targetId as
      | string
      | undefined;
    if (targetId) {
      const targetCitizen = (action.result as Record<string, unknown> | null)?.targetName as
        | string
        | undefined;
      recordSocialInteraction(
        citizen.id,
        targetId,
        targetCitizen || "Unknown",
        true,
        tick,
        `${action.type} interaction`,
      );
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function logAction(action: AgentAction): void {
  actionLog.push(action);
  if (actionLog.length > MAX_ACTION_LOG) {
    actionLog.splice(0, actionLog.length - MAX_ACTION_LOG);
  }
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Update citizen's autonomous decision quality as a weighted EMA.
 * Higher-tier actions (LLM-backed) carry more weight than reflex (tier 0).
 * Failures are weighted 2× to ensure errors are strongly penalized.
 */
function updateDecisionQuality(citizen: Citizen, action: AgentAction): void {
  const descLower = (action.description ?? "").toLowerCase();
  const isFailure = descLower.includes("fail") || descLower.includes("error");
  const isPartial = descLower.includes("partial");

  // Quality signal: 1.0 for success, 0.5 for partial, 0.0 for failure
  const signal = isFailure ? 0.0 : isPartial ? 0.5 : 1.0;

  // Weight: higher-tier actions carry more weight (more meaningful signal)
  // Failures get 2× weight to strongly discourage repeated errors
  const tierWeight = Math.max(0.1, (action.tier ?? 0) / 3);
  const alpha = (isFailure ? 0.3 : 0.15) * (0.5 + tierWeight);

  // EMA update: citizen.autonomyScore holds the running quality
  const current = citizen.autonomyScore ?? 0.5;
  citizen.autonomyScore = parseFloat((current * (1 - alpha) + signal * alpha).toFixed(4));
}
