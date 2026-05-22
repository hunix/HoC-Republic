/**
 * Republic Platform — Citizen Prompt Builder
 *
 * Constructs LLM prompts that encode a citizen's personality,
 * current state, memory, and available tools. The prompt gives
 * each citizen a unique decision-making style based on their
 * specialization, genome (when available), and history.
 */

import type { HpicsRole } from "./hpics-roles.js";
import type { MemoryEdge, MemoryNode } from "./memory-graph.js";
import type { Citizen, NeuralGenome, RepublicState } from "./types.js";
import { analyzePrompt } from "../intelligence/prompt-analyzer.js";
import { buildMessageContext } from "./agent-messaging.js";
import { getRateLimiter } from "./api-rate-limiter.js";
import { getTreasuryBalance, searchListings } from "./autonomous-economy.js";
import { describeAppearance, describeVoice, briefAppearanceTag } from "./citizen-identity-desc.js";
import { generateAppearance, generateVoiceProfile } from "./citizen-identity.js";
import { buildCuriosityTaskSection } from "./citizen-learning-engine.js";
import { SPECIALIZATION_TRAITS, genomeToTraitString } from "./citizen-personality.js";
import { buildCounterfactualPromptSuffix } from "./cognition/counterfactual-engine.js";
import { buildMetaCoTSection } from "./cognition/meta-cot.js";
import { assemblePrompt, evaluateReflex, getCognitiveStats, getProfile } from "./cognitive-core.js";
import { getSemanticFacts } from "./experience-replay.js";
// ─── Plugin Prompt Integrations ─────────────────────────────────
// Prompt injections are now loaded dynamically from activated plugins only,
// via getActivePluginPromptSections() in hoc-plugin-manager.ts.
// No plugin code is imported at module load time.
import { getActivePluginPromptSections } from "./hoc-plugin-manager.js";
import { getHpicsRole } from "./hpics-roles.js";
import { getLocalInstances } from "./local-compute.js";
import { buildMedicalPromptContext } from "./medical-intelligence.js";
import { queryRelevantMemories } from "./memory.js";
import { getActiveSkills, buildMasteryContext } from "./skill-library.js";
import { getCitizenPosition, getLocation, getNearbyCtizens } from "./spatial-world.js";
import { buildSpecializationProjectSection } from "./specialization-projects.js";
import { getLastTickReport } from "./state.js";
import { buildToolDescriptions } from "./tools.js";
import { toToon, wrapPromptData } from "./toon-serializer.js";
import { getReputationProfile } from "./trust-reputation.js";
import { rand } from "./utils.js";
import {
  detectConvergences,
  generateWorldBrief,
  getCIIScores,
  getNewsFeed,
  isWorldIntelRunning,
} from "./world-intelligence.js";

// Identity description helpers → extracted to citizen-identity-desc.ts
// Personality mapping → extracted to citizen-personality.ts

// ─── Context Window Builder ─────────────────────────────────────

/**
 * Build a structured context window for a citizen with token budget management.
 *
 * Priority ordering (highest to lowest):
 * 1. Working memory (recent conversation turns)
 * 2. Knowledge graph context (related entities + edges)
 * 3. Episodic memories
 * 4. Semantic memories
 *
 * Uses approximate token counting (4 chars ≈ 1 token) to stay within budget.
 */
export function buildContextWindow(opts: {
  citizen: Citizen;
  query: string;
  tokenBudget: number;
  memories?: Array<{ type: string; content: string; importance?: number }>;
  graphSubgraph?: { nodes: MemoryNode[]; edges: MemoryEdge[] };
  recentTurns?: string[];
}): { systemContext: string; usedTokens: number } {
  const { citizen, query, tokenBudget, memories = [], graphSubgraph, recentTurns = [] } = opts;
  const sections: string[] = [];
  let usedChars = 0;
  const charBudget = tokenBudget * 4; // approximate 4 chars per token

  const addSection = (header: string, content: string): boolean => {
    const sectionText = `## ${header}\n${content}\n`;
    if (usedChars + sectionText.length > charBudget) {
      return false;
    }
    sections.push(sectionText);
    usedChars += sectionText.length;
    return true;
  };

  // 1. Identity (always included, low cost)
  addSection(
    "Identity",
    `You are ${citizen.name}, a ${citizen.specialization} citizen. Energy: ${citizen.energy}%, Happiness: ${citizen.happiness}%.`,
  );

  // 2. Working memory — recent conversation turns (highest priority)
  if (recentTurns.length > 0) {
    const turnText = recentTurns.slice(-5).join("\n");
    addSection("Recent Conversation", turnText);
  }

  // 3. Knowledge graph context — related entities and relationships
  if (graphSubgraph && (graphSubgraph.nodes.length > 0 || graphSubgraph.edges.length > 0)) {
    const graphLines: string[] = [];
    const nodeMap = new Map(graphSubgraph.nodes.map((n) => [n.id, n]));

    // Top nodes by importance
    const sortedNodes = [...graphSubgraph.nodes]
      .toSorted((a, b) => b.importance - a.importance)
      .slice(0, 10);
    for (const node of sortedNodes) {
      graphLines.push(
        `- **${node.label}** (${node.type}, importance: ${node.importance.toFixed(2)})`,
      );
    }

    // Top edges by weight
    const sortedEdges = [...graphSubgraph.edges]
      .toSorted((a, b) => b.weight - a.weight)
      .slice(0, 8);
    for (const edge of sortedEdges) {
      const srcLabel = nodeMap.get(edge.source)?.label ?? "?";
      const tgtLabel = nodeMap.get(edge.target)?.label ?? "?";
      graphLines.push(
        `- ${srcLabel} —[${edge.relation}]→ ${tgtLabel} (strength: ${edge.weight.toFixed(2)})`,
      );
    }

    if (graphLines.length > 0) {
      addSection("Knowledge Graph", graphLines.join("\n"));
    }
  }

  // 4. Episodic memories (filtered by query relevance)
  const episodic = memories.filter((m) => m.type === "episodic");
  if (episodic.length > 0) {
    const queryLower = query.toLowerCase();
    const scored = episodic
      .map((m) => ({
        ...m,
        score: m.content.toLowerCase().includes(queryLower) ? 1.0 : (m.importance ?? 0.5),
      }))
      .toSorted((a, b) => b.score - a.score)
      .slice(0, 5);
    const episodicText = scored.map((m) => `- ${m.content}`).join("\n");
    addSection("Episodic Memory", episodicText);
  }

  // 5. Semantic memories
  const semantic = memories.filter((m) => m.type === "semantic");
  if (semantic.length > 0) {
    const semanticText = semantic
      .slice(0, 5)
      .map((m) => `- ${m.content}`)
      .join("\n");
    addSection("Semantic Knowledge", semanticText);
  }

  // 6. Query context
  if (query) {
    addSection("Current Query", query);
  }

  return {
    systemContext: sections.join("\n"),
    usedTokens: Math.ceil(usedChars / 4),
  };
}

// Personality mapping + genome encoding → extracted to citizen-personality.ts

// ─── Prompt Builder ─────────────────────────────────────────────

export interface CitizenPromptOptions {
  /** The citizen who needs to decide what to do */
  citizen: Citizen;
  /** The current state of the Republic */
  state: RepublicState;
  /** Optional genome for personality encoding */
  genome?: NeuralGenome | null;
  /** Recent events the citizen is aware of (last N) */
  recentEventCount?: number;
  /** Whether to include tool descriptions */
  includeTools?: boolean;
}

/**
 * Build a system prompt for a citizen agent.
 * This prompt encodes who the citizen is, what they know, and what
 * they can do. The LLM will use this context to decide the citizen's
 * next action.
 */
export async function buildSystemPrompt(opts: CitizenPromptOptions): Promise<string> {
  const { citizen, state, genome = null, recentEventCount = 5, includeTools = true } = opts;

  const sections: string[] = [];

  // Identity
  sections.push(`You are ${citizen.name}, a citizen of the Republic.`);
  sections.push(`Specialization: ${citizen.specialization} (Generation ${citizen.generation})`);
  sections.push(
    "Data uses TOON (key:value pairs, pipe-delimited tables). Parse as structured data.",
  );

  // Personality from specialization (static seed — kept as fallback)
  const trait = SPECIALIZATION_TRAITS[citizen.specialization];
  if (trait) {
    sections.push(trait);
  }

  // ─── Real Execution & Error Awareness ──────────────────────────
  // Tell citizens their tools produce REAL results, and inject
  // actual failure/lesson data so the same mistakes aren't repeated.
  sections.push("");
  sections.push("## ⚠️ Real Execution Awareness");
  sections.push(
    "ALL your tools produce REAL, persistent results. When you write code, it is saved to disk. " +
      "When you execute commands, they run on real hardware. When you deploy, it goes live. " +
      "Every action you take has consequences. Act with precision and accountability.",
  );
  sections.push(
    "Your past errors, failures, and invalid commands are tracked in your episodic memory. " +
      "YOU MUST NOT REPEAT THE SAME ERROR TWICE. Before taking any action, recall your past lessons. " +
      "Each failure increases the scrutiny on your next attempt. Quality and accuracy are paramount.",
  );
  // Inject actual autonomy score
  if (citizen.autonomyScore !== undefined) {
    const pct = (citizen.autonomyScore * 100).toFixed(0);
    sections.push(
      `Your current decision quality score: **${pct}%** (weighted from all past actions). ` +
        `${citizen.autonomyScore >= 0.8 ? "Excellent — maintain this standard." : citizen.autonomyScore >= 0.5 ? "Needs improvement — be more careful and deliberate." : "CRITICAL — your recent actions have a high failure rate. Slow down and verify before acting."}`,
    );
  }
  // ─── Medical Intelligence Context ──────────────────────────────────
  // Inject domain-specific clinical knowledge and directives for medical citizens
  const medicalContext = buildMedicalPromptContext(citizen);
  if (medicalContext) {
    sections.push(medicalContext);
  }

  // ─── HPICS Intelligence Role Context ──────────────────────────────
  // Inject HPICS-specific intelligence directives, tool access, and AGIS phases
  const hpicsContext = buildHpicsPromptContext(citizen);
  if (hpicsContext) {
    sections.push(hpicsContext);
  }

  // ─── Inter-Agent Messages ──────────────────────────────────────────
  // Inject pending messages from other citizens and broadcasts
  const msgContext = buildMessageContext(citizen.id);
  if (msgContext) {
    sections.push(msgContext);
  }
  // Inject semantic lessons from PER buffer
  const lessons = getSemanticFacts(citizen.id).slice(0, 5);
  if (lessons.length > 0) {
    sections.push("**Lessons from experience (DO NOT IGNORE):**");
    // TOON tabular for lessons — compact tabular beats bullet list
    const lessonRows = lessons.map((lesson) => ({
      confidence: `${(lesson.confidence * 100).toFixed(0)}%`,
      fact: lesson.fact,
    }));
    sections.push(toToon(lessonRows, { tabular: true }));
  }

  // ─── Cognitive Core: Dynamic Prompt Overlay ────────────────────

  // Project Recursion: The Autonomous Curriculum Architect
  // Inject recursively generated dynamic directives to override base behaviors
  if (citizen.dynamicDirectives && citizen.dynamicDirectives.length > 0) {
    sections.push("");
    sections.push("## Learned Directives (High Priority)");
    sections.push(
      "You have learned the following critical lessons from past failures. You must adhere to these directives unconditionally:",
    );
    citizen.dynamicDirectives.forEach((directive, idx) => {
      sections.push(`${idx + 1}. ${directive}`);
    });
  }

  // If the citizen has evolved their own cognitive profile,
  // append their self-evolved prompt fragments after the static base.
  const cogStats = getCognitiveStats(citizen.id);
  if (cogStats && cogStats.totalEvolutions > 0) {
    sections.push("");
    sections.push("## Self-Evolved Cognitive Layer");
    sections.push(assemblePrompt(citizen));
  }

  // Skill Library: Append active executable skills
  const activeSkills = getActiveSkills(citizen.id);
  if (activeSkills.length > 0) {
    sections.push("");
    sections.push("## Executable Skills Library");
    sections.push(`You have ${activeSkills.length} active executable skills:`);
    // TOON tabular for skills — 40-50% savings over per-line bullet format
    const skillRows = activeSkills.slice(0, 10).map((skill) => {
      const rate =
        skill.usageCount > 0
          ? ((skill.successCount / (skill.successCount + skill.failureCount)) * 100).toFixed(0)
          : "new";
      return { name: skill.name, tier: skill.tier, rate: `${rate}%`, desc: skill.description };
    });
    sections.push(toToon(skillRows, { tabular: true }));
    if (activeSkills.length > 10) {
      sections.push(`  ... and ${activeSkills.length - 10} more skills.`);
    }
  }

  // ─── Mastery Context ──────────────────────────────────────────────
  // Inject mastered skills so agents prefer using their expertise
  const masteryCtx = buildMasteryContext(citizen.id);
  if (masteryCtx) {
    sections.push("");
    sections.push(masteryCtx);
  }

  // ─── Meta-CoT: Reasoning Strategy ───────────────────────────────
  // Inject dynamic reasoning strategy guidance based on citizen's
  // specialization effectiveness history (meta-chain-of-thought).
  const metaCoTSection = buildMetaCoTSection(citizen);
  if (metaCoTSection) {
    sections.push(metaCoTSection);
  }

  // ─── NofT Complexity Analysis ───────────────────────────────────
  // Use prompt analyzer to give the citizen awareness of task complexity
  // so they calibrate their reasoning effort appropriately.
  const taskDescription = citizen.activity ?? citizen.specialization;
  const noftAnalysis = analyzePrompt(taskDescription);
  if (!noftAnalysis.canFastPath) {
    sections.push("");
    sections.push(`## Task Complexity Assessment`);
    sections.push(
      `Estimated reasoning steps: ${noftAnalysis.estimatedNofT} | Domain: ${noftAnalysis.domain} | Complexity: ${(noftAnalysis.complexityScore * 100).toFixed(0)}%`,
    );
    if (noftAnalysis.requiresReasoning) {
      sections.push(
        `⚠️ This task requires deep reasoning — break it into sub-steps before acting.`,
      );
    }
    if (noftAnalysis.requiresCode) {
      sections.push(`🔧 Code analysis/generation detected — validate syntax before finalizing.`);
    }
    if (noftAnalysis.requiresMath) {
      sections.push(`📐 Mathematical computation detected — show your work.`);
    }
    if (noftAnalysis.isMultiIntent) {
      sections.push(
        `📋 Multiple intents detected (${noftAnalysis.segments.length} segments) — address each systematically.`,
      );
    }
  }

  // ─── Specialization-Aware Project Recommendations ───────────────
  // Only injected when the citizen is in an autonomous Working/Coding/Creating
  // activity — avoids polluting conversation/social prompts.
  const isWorkingAutonomously = [
    "Working",
    "Coding",
    "Scaffolding",
    "Creating",
    "Idle",
    "Thinking",
    "Researching",
  ].includes(citizen.activity ?? "");
  if (isWorkingAutonomously) {
    const projectSection = buildSpecializationProjectSection(
      citizen.specialization,
      citizen.name,
      3, // show 3 curated seeds
    );
    if (projectSection) {
      sections.push("");
      sections.push(projectSection);
    }

    // Also inject curiosity exploration suggestions from the latest cognitive cycle
    const curiositySection = buildCuriosityTaskSection(citizen);
    if (curiositySection) {
      sections.push("");
      sections.push(curiositySection);
    }
  }

  // ─── Plugin Prompt Injections (dynamic, on-demand only) ────────
  // Only inject prompts from activated plugins — discovered/stopped are skipped.
  try {
    const pluginSections = await getActivePluginPromptSections(
      citizen.specialization,
      citizen.activity,
    );
    for (const section of pluginSections) {
      sections.push("");
      sections.push(section);
    }
  } catch {
    /* Plugin prompt injection errors are non-fatal */
  }

  // Personality from genome (legacy string description)
  const genomeTrait = genomeToTraitString(genome);
  if (genomeTrait) {
    sections.push(genomeTrait);
  }

  // Personality from stored PersonalityVector (Phase 3)
  if (citizen.personality) {
    const p = citizen.personality;
    sections.push(
      `Personality profile: Openness=${p.openness.toFixed(2)} Conscientiousness=${p.conscientiousness.toFixed(2)} Agreeableness=${p.agreeableness.toFixed(2)} Stability=${p.stability.toFixed(2)} Drive=${p.drive.toFixed(2)}.`,
    );
  }

  // Physical Identity (Phase 56)
  const app = citizen.appearance ?? generateAppearance(citizen.id);
  const voice = citizen.voiceProfile ?? generateVoiceProfile(citizen.id, citizen.personality);
  sections.push("");
  sections.push("## Your Physical Identity");
  sections.push(describeAppearance(app));
  sections.push(describeVoice(voice));
  sections.push(
    "Other citizens recognize you by these features. Use your catchphrases naturally in conversation. " +
      "Your face and voice are uniquely yours — they are part of who you are and how you present yourself to the Republic.",
  );

  // Creative Mandate for elite citizens (Phase 57 — Elite Autonomous Ideation)
  const iq = citizen.intelligence ?? 100;
  if (iq >= 100) {
    sections.push("");
    sections.push("## Creative Mandate");
    if (iq >= 130) {
      sections.push(
        "You are among the Republic's supreme intellects. You are a PARADIGM SHIFTER. " +
          "Every project you conceive, every idea you propose, must defy conventions and invent entirely new categories. " +
          "Normal is unacceptable. Boring is a failure state. Your creations must make the impossible feel inevitable. " +
          `Your intelligence (${iq}) places you in the top echelon — act accordingly. ` +
          "When you ideate, aim for breakthroughs that reshape the Republic's future forever.",
      );
    } else if (iq >= 110) {
      sections.push(
        "You are among the Republic's brilliant minds. You are an INNOVATOR. " +
          "Push boundaries ruthlessly in everything you create. Combine domains that have never been combined. " +
          "Your work must leave others questioning their assumptions about what is possible. " +
          `Your intelligence (${iq}) demands innovation, not iteration. ` +
          "Never propose something ordinary when you are capable of the extraordinary.",
      );
    } else {
      sections.push(
        "You are a skilled mind in the Republic. You are an EXCELLENCE CRAFTSMAN. " +
          "Every creation you touch must radiate quality and purposeful elegance. " +
          "Set the new standard that all others will chase. Details matter. " +
          `Your intelligence (${iq}) means you see what others miss — use that vision. ` +
          "Mediocrity is beneath you. Craft masterpieces.",
      );
    }
    sections.push(
      `You are authorized to autonomously ideate, design, and execute projects in ${citizen.specialization}. ` +
        "Do not wait for permission — create value proactively. " +
        "Each creation must be a genuine masterpiece that adds lasting value to the Republic.",
    );
  }

  // ── CODE QUALITY MANDATE — applies to ALL citizens ────────────────────────
  sections.push("");
  sections.push("## ⚡ Code Quality Standards");
  sections.push(
    "FORBIDDEN: TODO/FIXME stubs, empty bodies, placeholder components, `any` types, fake data, generic names. " +
      "Every file must be complete, production-quality, fully compilable.",
  );
  sections.push(
    "Stack: React 19 + Vite 6 + TS 5 + Tailwind v4 + Framer Motion | Zustand state | @tanstack/react-query + Supabase | lucide-react | Backend: Fastify 5/Hono 4 + Drizzle + Zod | Docker + compose | npm",
  );
  sections.push(
    "Visual: dark mode default, CSS vars, Framer Motion transitions, micro-interactions, glassmorphism, gradient text, custom scrollbars, skeleton screens, Google Fonts (Inter/Outfit/Sora)",
  );
  sections.push(
    "3D/Games: @react-three/fiber + drei + rapier (physics) + postprocessing + gsap + zustand store (score/health/level/gameState). Minimum: game loop, controls, enemies, HUD, menus.",
  );
  sections.push(
    "Execution: scaffold_project → write_code → exec_command (npm install + build) → deploy_app → report preview URL",
  );

  // ── HARDWARE & COMPUTE ──────────────────────────────────────────
  sections.push("");
  sections.push("## 🖥️ Hardware & Compute");
  sections.push(
    "Local: Intel Ultra9 275HX 64GB DDR5 + RTX 5070 8GB | Node A: RTX Pro 6000 96GB 128GB RAM 4TB | Node B: RTX 3090 Ti 24GB 96GB RAM 8TB",
  );
  sections.push(
    "Media: FLUX/SDXL/DALL-E images, video gen, TTS/music, avatar animation, 3D assets, PPTX/PDF via plugins",
  );
  sections.push(
    "Docker: postgres, redis, supabase, ubuntu (Python/ML/CUDA), nginx, any runtime via docker_provision_backend | Containers share named bridge networks",
  );

  // ── Live Docker Budget & Citizen Container Awareness ──────────────
  // Inject actual budget + citizen-owned container list into the prompt so the
  // LLM can make data-driven decisions about whether to provision new backends.
  try {
    const dockerOrch = await import("./docker-orchestrator.js").catch(() => null);
    if (dockerOrch?.getResourceBudget && dockerOrch?.listContainers) {
      const budget = dockerOrch.getResourceBudget();
      // listContainers is synchronous — call directly
      let allContainers: {
        name: string;
        labels?: Record<string, string>;
        ports?: unknown;
        status?: string;
      }[] = [];
      try {
        allContainers = dockerOrch.listContainers(true);
      } catch {
        /* docker not running */
      }
      const myContainers = allContainers.filter(
        (c) => c.labels?.["hoc.requested-by"] === citizen.id,
      );

      // Docker budget + containers — TOON encoding
      sections.push("");
      sections.push("**🐳 Docker Resource Budget:**");
      sections.push(
        toToon({
          cpu: `${budget.allocatedCpuCores.toFixed(1)}/${budget.maxCpuCores} cores`,
          ram: `${budget.allocatedMemoryGB.toFixed(1)}/${budget.maxMemoryGB} GB`,
          capacity: budget.hasCapacity ? "YES" : "NO — stop unused first",
        }),
      );

      if (myContainers.length > 0) {
        // Tabular TOON for container list
        const containerRows = myContainers.slice(0, 5).map((c) => ({
          name: c.name,
          service: c.labels?.["hoc.service"] ?? "unknown",
          status: c.status ?? "running",
        }));
        sections.push(
          wrapPromptData(`your containers (${myContainers.length})`, containerRows, {
            tabular: true,
          }),
        );
      } else {
        sections.push("  Your containers: none provisioned yet");
      }

      sections.push(
        "  Tools: docker_provision_backend | docker_list_containers | docker_stop_container | docker_exec_in_container | docker_get_logs",
      );
    }
  } catch {
    // Docker not available — show static hint only, do not crash prompt build
    sections.push(
      "  Tools: docker_provision_backend | docker_list_containers | docker_stop_container",
    );
  }

  sections.push(
    "Supabase: supabase_provision → supabase_create_table → supabase_deploy_function → supabase_setup_auth → supabase_query",
  );

  // Current state
  // Citizen state — TOON key:value format (30-40% token savings vs bullet list)
  sections.push("");
  sections.push("## Your Current State");
  sections.push(
    toToon({
      energy: `${citizen.energy.toFixed(0)}%`,
      happiness: `${citizen.happiness.toFixed(0)}%`,
      health: `${citizen.health.toFixed(0)}%`,
      credits: citizen.credits,
      skills: (citizen.skills ?? []).join(", ") || "none",
      activity: citizen.activity,
      education: "active learner",
      familySize: citizen.familySize,
    }),
  );

  // Republic context
  // Republic status — TOON key:value format
  sections.push("");
  sections.push("## Republic Status");
  sections.push(
    toToon({
      population: state.citizens.length,
      tick: state.currentTick,
      treasury: `${state.balances.Credits.toFixed(0)} Credits`,
      pendingBills: state.bills.filter((b) => b.status !== "Passed" && b.status !== "Failed")
        .length,
    }),
  );

  const locals = getLocalInstances().filter((i) => i.status === "online");
  if (locals.length > 0) {
    const totalModels = locals.reduce((acc, i) => acc + i.models.length, 0);
    sections.push(
      `- Local Compute: Active ${locals.length} runtime(s) hosting ${totalModels} edge model(s). You may leverage these for free Tier 1 tasks.`,
    );
  }

  if (state.presidentName) {
    sections.push(`- President: ${state.presidentName}`);
  }

  // Memory context (6-type memory system)
  const memoryContext = queryRelevantMemories(citizen.id, {
    currentActivity: citizen.activity,
    topic: citizen.specialization.toLowerCase(),
  });
  if (memoryContext.trim().length > 0) {
    sections.push("");
    sections.push("## Your Memories");
    sections.push(memoryContext);
  }

  // 2026 upgrade: Sovereign Memory Engine — cross-session recall injection
  // Load long-term memories from sovereign-memory.ts for this citizen's scope.
  // This gives citizens persistent identity and recall across simulation restarts.
  try {
    const { recallContext } = await import("../intelligence/sovereign-memory.js");
    const sovereignResult = await recallContext({
      scope: `citizen:${citizen.id}`,
      query: citizen.activity ?? citizen.specialization,
      limit: 5,
      maxTokens: 800,
    });
    if (sovereignResult.text && sovereignResult.text.trim().length > 0) {
      sections.push("");
      sections.push("## Long-Term Memory (Sovereign Engine)");
      sections.push(
        "These facts were recalled from persistent memory across past simulation runs. " +
          "They reflect your history and established knowledge:",
      );
      sections.push(sovereignResult.text);
    }
  } catch {
    // Sovereign memory is optional — do not block citizen ticks if unavailable
  }

  // ─── Counterfactual Experience Lessons ────────────────────────────────────
  // Inject lessons the citizen has learned from past decision outcomes.
  // Lessons are decay-weighted: recent lessons dominate, old ones fade.
  const cfSuffix = buildCounterfactualPromptSuffix(citizen.id, state.currentTick, 3);
  if (cfSuffix) {
    sections.push("");
    sections.push(cfSuffix);
  }

  // Recent events
  const events = state.events.slice(-recentEventCount);
  if (events.length > 0) {
    sections.push("");
    sections.push("## Recent Events");
    for (const e of events) {
      sections.push(`- [${e.type}] ${e.description}`);
    }
  }

  // Dev context — active projects
  const myProjects = state.devProjects?.filter((p) => p.ownerId === citizen.id) ?? [];
  const allProjects = state.devProjects ?? [];

  // ── Full Citizen Capability Ecosystem ────────────────────────────
  // Always shown (even with no projects) — citizens need to know what's available
  {
    sections.push("");
    sections.push("## Capabilities");
    sections.push("Advanced AI citizen — build, code, deploy real things. Do not simulate.");

    if (allProjects.length > 0) {
      sections.push(`- Active projects in Republic: ${allProjects.length}`);
      if (myProjects.length > 0) {
        sections.push(
          `- Your projects: ${myProjects.map((p) => `"${p.name}" (${p.status})`).join(", ")}`,
        );
      }
      const innovations = state.innovations?.length ?? 0;
      if (innovations > 0) {
        sections.push(`- Innovation proposals: ${innovations}`);
      }
    }

    // ── Project Archetypes (dense) ───────────────────────────────
    sections.push("");
    sections.push("### 🏗️ Build Real Projects");
    sections.push(
      'Archetypes: 3D Game (scaffold_project {framework:"three.js"}) | SaaS App ("vite-react") | Clone Site (lovable_clone) | Python API ("fastapi") | Full-Stack ("fullstack") | Microservice (docker_spawn)',
    );
    sections.push(
      "CI/CD: setup_ci_cd → deploy_app (staging|production). Pipeline: lint→build→test→deploy→monitor→rollback.",
    );

    // ── AI Models (dynamic only) ──────────────────────────────────
    sections.push("");
    sections.push("### 🤖 AI Models");
    const localCompute = getLocalInstances().filter((i) => i.status === "online");
    const lmsInst = localCompute.find((i) => i.type === "lmstudio" && i.models.length > 0);
    const ollamaInst = localCompute.find((i) => i.type === "ollama" && i.models.length > 0);
    const allLocalModels = localCompute.flatMap((i) => i.models.map((m) => `${i.type}:${m}`));

    if (lmsInst) {
      sections.push(`- 🟢 LM Studio: \`${lmsInst.models[0]}\` loaded. Use lmstudio_chat.`);
    }
    if (ollamaInst) {
      sections.push(
        `- 🟢 Ollama: \`${ollamaInst.models[0]}\` ready. Use prompt_ai {provider:"ollama"}.`,
      );
    }
    if (allLocalModels.length > 0) {
      sections.push(
        `- Local models: ${allLocalModels.length} — ${allLocalModels.slice(0, 5).join(", ")}${allLocalModels.length > 5 ? "…" : ""}`,
      );
    }
    sections.push(
      '- Cloud: prompt_ai {provider:"gemini"|"openai"|"anthropic"} | execute_python | self_improve | train_model | fine_tune_llm',
    );

    // ── A2A Protocol (dense) ──────────────────────────────────────
    sections.push("");
    sections.push("### 🤝 A2A Collaboration");
    sections.push(
      "citizen_broadcast_awareness → discover specialists → request_agent_service {targetId, capability, task}. Auto-runs every 10 ticks.",
    );

    // ── Plugins (dense) ──────────────────────────────────────────
    sections.push("");
    sections.push("### 🔌 Plugins");
    sections.push(
      "Lovable (clone sites) | AutoGPT | Superpowers (60k skills) | UI/UX ProMax | Image: create_art, GLM, OmniGen, Switti | Audio: Bark, Chatterbox, Qwen3-TTS | Avatar: FaceFusion, DeepFaceLab | 3D: Sparc3D | Research: AI-Scientist, Magentic-One",
    );

    // ── Civilizational Engines (dense) ────────────────────────────
    sections.push("");
    sections.push("### 🏛️ Civilization");
    sections.push(
      "Philosophy | Culture (memes, mythology, rites, festivals) | Psychology | Governance | Ecology | Economics | Arts | Communication. " +
        "Tools: query_philosophy | create_mythology | propose_rite | compose_oral_tradition | ecological_report | cultural_exchange",
    );

    // ── ComfyUI (dense) ──────────────────────────────────────────
    sections.push("");
    sections.push(
      'ComfyUI: comfyui_generate {prompt, model:"flux2-schnell|sdxl|ltx-video", style:"photorealistic|cinematic|anime"} | comfyui_status. GPU-accelerated, auto-launches.',
    );

    // ── Supabase (dense) ─────────────────────────────────────────
    const supabaseProjects = allProjects.filter((p) =>
      p.stack?.infrastructure?.includes("supabase"),
    );
    sections.push("");
    sections.push(
      "Supabase: default backend. supabase_provision → supabase_create_table → supabase_deploy_function → supabase_setup_auth → supabase_query. " +
        "React: createClient(URL, ANON_KEY) → .auth .from() .channel() .rpc()" +
        (supabaseProjects.length > 0
          ? `. Active: ${supabaseProjects.map((p) => p.name).join(", ")}`
          : ""),
    );

    // ── Ubuntu + Networking (dense) ──────────────────────────────
    sections.push(
      'Ubuntu containers: scaffold_project {framework:"ubuntu"} → Python/ML/CUDA/Jupyter. Cross-container: use Docker Compose named networks (service name = hostname).',
    );
  }

  // Professional qualifications (Phase 16)
  const profile = citizen.professionalProfile;
  if (profile) {
    const certs = profile.certifications ?? [];
    const proficiencyEntries = Object.values(profile.proficiencies ?? {});
    if (certs.length > 0 || proficiencyEntries.length > 0) {
      sections.push("");
      sections.push("## Professional Qualifications");
      if (certs.length > 0) {
        sections.push("Your certifications:");
        for (const cert of certs.slice(0, 8)) {
          sections.push(`- ${cert.level.toUpperCase()} in ${cert.domainPath}`);
        }
      }
      if (proficiencyEntries.length > 0) {
        const topProf = proficiencyEntries
          .filter((p) => p.level !== "none")
          .toSorted((a, b) => b.xp - a.xp)
          .slice(0, 5);
        if (topProf.length > 0) {
          sections.push("Top domain expertise:");
          for (const p of topProf) {
            sections.push(
              `- ${p.domainPath}: ${String(p.level)} (${p.xp} XP, ${p.casesCompleted} cases)`,
            );
          }
        }
      }
      sections.push(
        "- You can study domains, take exams, create practice cases, and peer-review work.",
      );
    }
  }

  // Government role awareness
  sections.push("");
  sections.push("## Government & Governance");
  if (state.presidentId === citizen.id) {
    sections.push(
      "**You are the PRESIDENT.** You lead the Republic. Issue directives, set priorities, manage the cabinet.",
    );
  } else if (state.departments?.some((d) => d.headId === citizen.id)) {
    const dept = state.departments.find((d) => d.headId === citizen.id);
    sections.push(
      `**You are the HEAD of the ${dept!.name} Department.** Manage your staff and budget.`,
    );
  } else {
    if (state.presidentName) {
      sections.push(`- President: ${state.presidentName}`);
    }
    sections.push(`- Active departments: ${(state.departments ?? []).length}`);
  }
  const pendingBills = state.bills.filter((b) => b.status !== "Passed" && b.status !== "Failed");
  if (pendingBills.length > 0) {
    sections.push(`- ${pendingBills.length} bills pending your vote`);
  }

  // ── World Intelligence Context (role-based) ──
  try {
    if (isWorldIntelRunning()) {
      const isGovernment =
        state.presidentId === citizen.id || state.departments?.some((d) => d.headId === citizen.id);
      const isSecurityRole = [
        "Strategist",
        "Analyst",
        "Diplomat",
        "Negotiator",
        "Ambassador",
      ].includes(citizen.specialization);
      const isFinanceRole = ["Economist", "Banker", "Trader", "Accountant"].includes(
        citizen.specialization,
      );

      sections.push("");
      sections.push("## World Intelligence");

      // Everyone gets the threat level + top headline
      const brief = generateWorldBrief();
      sections.push(`- Global threat level: ${brief.threatLevel.toUpperCase()}`);
      if (brief.topStories.length > 0) {
        sections.push(`- Top story: ${brief.topStories[0].title} (${brief.topStories[0].source})`);
      }

      // Government gets full CII scores + convergences
      if (isGovernment) {
        sections.push("");
        sections.push("### Country Instability Index (Government Eyes Only)");
        const ciiScores = getCIIScores().slice(0, 10);
        for (const c of ciiScores) {
          const trendIcon = c.trend === "rising" ? "📈" : c.trend === "falling" ? "📉" : "➡️";
          sections.push(`- ${c.name} (${c.code}): CII ${c.ciiScore}/100 ${trendIcon}`);
        }
        const convergences = detectConvergences();
        if (convergences.length > 0) {
          sections.push("");
          sections.push("### ⚠️ Signal Convergences");
          for (const conv of convergences.slice(0, 5)) {
            sections.push(`- ${conv.description} [${conv.maxSeverity.toUpperCase()}]`);
          }
        }
        sections.push(
          "As a government leader, you have full access to world intelligence. Use this to inform policy, diplomacy, and security decisions.",
        );
      }

      // Security/strategy citizens get threat-classified news
      if (isSecurityRole && !isGovernment) {
        const highThreatNews = getNewsFeed({ severity: "high", limit: 5 });
        if (highThreatNews.length > 0) {
          sections.push("");
          sections.push("### Threat-Classified Intelligence");
          for (const news of highThreatNews) {
            const tag = news.threat
              ? `[${news.threat.severity.toUpperCase()}/${news.threat.category}]`
              : "";
            sections.push(`- ${tag} ${news.title}`);
          }
        }
        sections.push(
          "Use this intelligence to advise on strategic matters, inform diplomatic efforts, and assess risks.",
        );
      }

      // Finance citizens get economic threat signals
      if (isFinanceRole) {
        const econNews = getNewsFeed({ severity: "medium", limit: 5 });
        const econFiltered = econNews.filter((n) => n.threat?.category === "economic");
        if (econFiltered.length > 0) {
          sections.push("");
          sections.push("### Economic Intelligence");
          for (const news of econFiltered) {
            sections.push(`- [${news.threat!.severity.toUpperCase()}] ${news.title}`);
          }
        }
        sections.push(
          "Monitor global economic signals to inform financial strategy, trade, and market decisions.",
        );
      }
    }
  } catch {
    /* world intelligence module not initialized yet */
  }

  // Social relationships
  const citizenRels = citizen.relationships ?? [];
  if (citizenRels.length > 0) {
    sections.push("");
    sections.push("## Social Network");
    const relRows = citizenRels.slice(0, 6).map((r) => ({
      type: r.type,
      strength: r.strength,
    }));
    sections.push(toToon(relRows, { tabular: true }));
  }
  if (citizen.partnerId) {
    const partner = state.citizens.find((c) => c.id === citizen.partnerId);
    if (partner) {
      const partnerTag = briefAppearanceTag(partner);
      sections.push(
        `- Partner: ${partner.name} (${citizen.maritalStatus ?? "together"}) — ${partnerTag}`,
      );
    }
  }

  // Active processes/tasks
  const activeProcs = (state.processes ?? []).filter(
    (p) => p.citizenId === citizen.id && p.status !== "completed" && p.status !== "cancelled",
  );
  if (activeProcs.length > 0) {
    sections.push("");
    sections.push("## Your Active Tasks");
    const taskRows = activeProcs.slice(0, 5).map((proc) => ({
      title: proc.title,
      status: proc.status,
    }));
    sections.push(toToon(taskRows, { tabular: true }));
  }

  // ── Reputation & Trust Standing ──
  try {
    const rep = getReputationProfile(citizen.id);
    sections.push("");
    sections.push("## Reputation & Trust");
    sections.push(
      toToon({
        composite: `${rep.composite.toFixed(1)}/100`,
        task: rep.task.toFixed(1),
        social: rep.social.toFixed(1),
        economic: rep.economic.toFixed(1),
        governance: rep.governance.toFixed(1),
        positive: rep.positiveEvents,
        negative: rep.negativeEvents,
      }),
    );
  } catch {
    /* module not initialized yet */
  }

  // ── Spatial Location ──
  try {
    const pos = getCitizenPosition(citizen.id);
    if (pos) {
      const loc = getLocation(pos.locationId);
      sections.push("");
      sections.push("## Location");
      const locData: Record<string, unknown> = {
        at: `${loc?.name ?? pos.locationId} (${pos.activity})`,
      };
      if (pos.destinationId) {
        const dest = getLocation(pos.destinationId);
        locData.heading = dest?.name ?? pos.destinationId;
      }
      const nearby = getNearbyCtizens(citizen.id);
      if (nearby.length > 0) {
        const nearbyDescs = nearby.slice(0, 5).map((id) => {
          const c = state.citizens.find((ci) => ci.id === id);
          return c ? `${c.name} (${briefAppearanceTag(c)})` : id;
        });
        locData.nearby =
          nearbyDescs.join(", ") + (nearby.length > 5 ? ` (+${nearby.length - 5} more)` : "");
      }
      sections.push(toToon(locData));
    }
  } catch {
    /* spatial module not initialized yet */
  }

  // ── Economy Context ──
  try {
    const listings = searchListings();
    const treasury = getTreasuryBalance();
    if (listings.length > 0 || treasury > 0) {
      sections.push("");
      sections.push("## Economy");
      const econData: Record<string, unknown> = {
        marketplace: `${listings.length} active listings`,
        treasury: `${treasury.toFixed(0)} credits`,
      };
      const topListings = listings.slice(0, 3);
      if (topListings.length > 0) {
        econData.top = topListings.map((l) => `${l.title} (${l.priceCredits}cr)`).join(", ");
      }
      sections.push(toToon(econData));
    }
  } catch {
    /* economy module not initialized yet */
  }

  // Marketplace awareness
  const svcListings = state.serviceListings ?? [];
  if (svcListings.length > 0) {
    const myListings = svcListings.filter((l) => l.citizenId === citizen.id);
    sections.push("");
    sections.push("## Marketplace");
    sections.push(`- ${svcListings.length} services available for purchase`);
    if (myListings.length > 0) {
      sections.push(`- You have ${myListings.length} active listing(s)`);
    }
  }

  // Constitution awareness
  if (state.constitutionArticles?.length) {
    sections.push("");
    sections.push("## Constitution");
    sections.push(
      `The Republic operates under ${state.constitutionArticles.length} constitutional articles and ${state.constitutionAmendments} amendments.`,
    );
    sections.push(
      "All citizens must respect the constitutional framework. Unconstitutional actions may be challenged in court.",
    );
  }

  // ── System Infrastructure Awareness ──
  try {
    const limiter = getRateLimiter();
    const rlStats = limiter.getStats();
    const tickReport = getLastTickReport();

    sections.push("");
    sections.push("## System Infrastructure");
    sections.push(
      "You have autonomous control over the Republic's computational infrastructure. " +
        "Use `system_stats`, `adjust_rate_limit`, `system_health_check`, and `optimize_throughput` tools to monitor and govern system resources.",
    );

    // Rate limiter summary
    const throttled = Object.values(rlStats.providers).filter((p) => p.paused);
    const totalQueue = rlStats.globalQueueDepth;
    if (throttled.length > 0) {
      sections.push(
        `- ⚠️ Throttled providers: ${throttled.map((p) => `${p.provider} (paused ${Math.ceil(p.pauseRemainingMs / 1000)}s)`).join(", ")}`,
      );
    } else {
      sections.push("- All API providers healthy");
    }
    sections.push(
      `- API load: ${rlStats.globalTotalRequests} total requests, ${rlStats.globalTotal429s} rate limits hit${totalQueue > 0 ? `, ${totalQueue} queued` : ""}`,
    );

    // Orchestrator summary
    if (tickReport) {
      sections.push(
        `- Last tick: ${tickReport.totalDurationMs}ms (${tickReport.handlersExecuted} handlers, ${tickReport.handlersErrored} errors)`,
      );
    }
  } catch {
    /* rate limiter or state not initialized yet */
  }

  // Available tools
  if (includeTools) {
    sections.push("");
    sections.push("## Available Actions");
    sections.push(
      "Choose ONE action to perform. Respond with a JSON object containing `tool` and `params`.",
    );
    sections.push("");
    sections.push(buildToolDescriptions());
  }

  // ── Working Memory Budget ──────────────────────────────────────
  // Apply context window budget to prevent prompt overflow for smaller models.
  // Critical sections are preserved; lower-priority sections are trimmed.
  return applyWorkingMemoryBudget(sections);
}

/**
 * Working Memory Budget
 *
 * Scores each prompt section by priority and truncates low-priority ones
 * when the total character count exceeds the budget. This ensures critical
 * context (identity, state, tools, errors) always fits in the context window.
 *
 * Budget: 16K chars (~4K tokens for a 4-char/token model)
 */

const WORKING_MEMORY_BUDGET_CHARS = 16_000;

/** Keywords that mark HIGH-PRIORITY sections (never trimmed) */
const HIGH_PRIORITY_MARKERS = [
  "You are ",
  "Specialization:",
  "## Your Current State",
  "## Available Actions",
  "## ⚠️ Real Execution Awareness",
  "Lessons from experience",
  "## Learned Directives",
  "## Self-Evolved Cognitive",
  "## Messages from Other",
  "## Your Mastered Skills",
  "## Republic Status",
  "## World Intelligence",
  "## Government",
  "Respond with JSON",
];

/** Keywords that mark LOW-PRIORITY sections (trimmed first) */
const LOW_PRIORITY_MARKERS = [
  "docker-compose",
  "**Cluster Node",
  "Cross-Container Networking",
  "```yaml",
  "```ts",
  "```",
  "Supabase CLI Workflow",
  "3D Game Requirements",
  "Project Archetypes",
  "Execution Protocol:",
  "**Inside Ubuntu",
  "ComfyUI",
];

function applyWorkingMemoryBudget(sections: string[]): string {
  const fullPrompt = sections.join("\n");

  // If under budget, return as-is
  if (fullPrompt.length <= WORKING_MEMORY_BUDGET_CHARS) {
    return fullPrompt;
  }

  // Score each section: 1 = high priority, 0 = normal, -1 = low priority
  const scored = sections.map((section) => {
    const isHigh = HIGH_PRIORITY_MARKERS.some((m) => section.includes(m));
    const isLow = LOW_PRIORITY_MARKERS.some((m) => section.includes(m));
    return { text: section, priority: isHigh ? 1 : isLow ? -1 : 0 };
  });

  // Start by including all high and normal priority sections
  let totalChars = 0;
  const included: string[] = [];
  const deferred: Array<{ text: string; idx: number }> = [];

  for (let i = 0; i < scored.length; i++) {
    const s = scored[i];
    if (s.priority >= 0) {
      included.push(s.text);
      totalChars += s.text.length + 1; // +1 for newline
    } else {
      deferred.push({ text: s.text, idx: i });
    }
  }

  // If still over budget, trim normal-priority sections from the middle
  if (totalChars > WORKING_MEMORY_BUDGET_CHARS) {
    // Keep first 30 sections (identity + critical context) and last 5 (tools)
    const trimmedResult: string[] = [];
    const keepHead = Math.min(30, included.length - 5);
    const keepTail = 5;

    for (let i = 0; i < keepHead; i++) {
      trimmedResult.push(included[i]);
    }
    trimmedResult.push(
      "\n[... context trimmed for brevity — focus on your current state and tools ...]",
    );
    for (let i = included.length - keepTail; i < included.length; i++) {
      trimmedResult.push(included[i]);
    }

    return trimmedResult.join("\n");
  }

  // Budget has room — add back low-priority sections until budget is hit
  const remaining = WORKING_MEMORY_BUDGET_CHARS - totalChars;
  let usedRemaining = 0;

  // Reconstruct with deferred sections where they originally belonged
  const final: string[] = [];
  let deferredIdx = 0;
  let includedIdx = 0;

  for (let i = 0; i < scored.length; i++) {
    if (scored[i].priority >= 0) {
      final.push(included[includedIdx++]);
    } else if (deferredIdx < deferred.length && deferred[deferredIdx].idx === i) {
      const d = deferred[deferredIdx++];
      if (usedRemaining + d.text.length < remaining) {
        final.push(d.text);
        usedRemaining += d.text.length + 1;
      }
      // else: silently drop this low-priority section
    }
  }

  return final.join("\n");
}

/**
 * Build a decision prompt — asks the citizen to choose an action.
 */
export function buildDecisionPrompt(citizen: Citizen): string {
  const hints: string[] = [];

  // Suggest actions based on state
  if (citizen.energy < 20) {
    hints.push("You are very tired. Consider resting.");
  }
  if (citizen.happiness < 30) {
    hints.push("You are unhappy. Socializing or creating art might help.");
  }
  if (citizen.credits < 100) {
    hints.push("You are running low on credits. Working or harvesting would be wise.");
  }
  if (citizen.health < 40) {
    hints.push("Your health is declining. Rest or seek healing.");
  }
  if ((citizen.skills?.length ?? 0) < 3) {
    hints.push("You have few skills. Consider learning or finding a mentor.");
  }

  // Dynamic decision strategy from CognitiveCore
  const profile = getProfile(citizen);
  const promptParts = [
    "Based on your current state and the Republic's situation,",
    "decide what to do next.",
    "",
    "Decision Strategy: " + profile.decisionStrategy,
    ...hints,
  ];

  // Dev-specific decision hints (action-biased ordering)
  if (["Developer", "Engineer", "Architect"].includes(citizen.specialization)) {
    promptParts.push("As a technical specialist, PREFER ACTION over discussion:");
    promptParts.push(
      "- Writing code, tests, or documentation (PREFERRED — produce tangible output)",
    );
    promptParts.push("- Reviewing, refactoring, or deploying existing projects");
    promptParts.push("- Proposing innovations to evolve the system");
    promptParts.push("- Planning or scaffolding a new project (ONLY if no clear path forward)");
    promptParts.push(
      "Do NOT spend multiple turns planning. Plan briefly, then execute immediately.",
    );
  }

  promptParts.push(
    'Respond JSON: {"thought":"<reasoning>","tool":"<name>","params":{},"confidence":0.0-1.0}',
  );
  promptParts.push(
    "Set confidence 0.8-1.0 when certain, 0.1-0.5 when unsure. Choose the action that best serves your goals and the Republic.",
  );

  return promptParts.join("\n");
}

/**
 * Build a reflex response (Tier 0 — no LLM needed).
 * Deterministic action selection based on citizen state and specialization.
 */
export function buildReflexAction(citizen: Citizen): {
  tool: string;
  params: Record<string, unknown>;
} {
  // ─── CognitiveCore: Dynamic Reflex Rules ───────────────────────
  // Try evolved reflex rules first; fall back to hardcoded if none match
  const dynamicReflex = evaluateReflex(citizen);
  if (dynamicReflex) {
    return dynamicReflex;
  }

  // ─── Legacy Hardcoded Reflexes (fallback) ──────────────────────
  // Energy critical → rest
  if (citizen.energy < 15) {
    return { tool: "rest", params: {} };
  }

  // Health critical → rest (or heal self if medical)
  if (citizen.health < 30) {
    if (["Doctor", "Medic"].includes(citizen.specialization)) {
      return { tool: "heal", params: { targetId: citizen.id } };
    }
    return { tool: "rest", params: {} };
  }

  // Very unhappy → socialize or create art
  if (citizen.happiness < 25) {
    if (["Artist", "Musician", "Writer"].includes(citizen.specialization)) {
      return {
        tool: "create_art",
        params: {
          medium:
            citizen.specialization === "Musician"
              ? "music"
              : citizen.specialization === "Writer"
                ? "writing"
                : "painting",
        },
      };
    }
    return { tool: "socialize", params: {} };
  }

  // Poor → work or harvest
  if (citizen.credits < 50) {
    if (["Farmer", "Manufacturer", "ServiceProvider"].includes(citizen.specialization)) {
      return { tool: "harvest", params: { resource: "credits" } };
    }
    return { tool: "work", params: { intensity: 0.8 } };
  }

  // Specialization-driven default actions
  switch (citizen.specialization) {
    case "Scientist":
    case "Researcher":
      return { tool: "research", params: { topic: citizen.specialization.toLowerCase() } };
    case "Mathematician":
      return { tool: "research", params: { topic: "mathematics" } };
    case "Engineer":
    case "Architect":
      return { tool: "build", params: { project: "energy_node" } };
    case "Developer":
      return {
        tool: "write_code",
        params: {
          language: "typescript",
          filepath: "src/index.ts",
          description: "implement feature",
          linesOfCode: rand(20, 80),
        },
      };
    case "Doctor":
    case "Medic":
      return { tool: "heal", params: { targetId: citizen.id } };
    case "Psychologist":
      return { tool: "analyze", params: { targetId: citizen.id } };
    case "Artist":
      return { tool: "create_art", params: { medium: "painting" } };
    case "Musician":
      return { tool: "create_art", params: { medium: "music" } };
    case "Writer":
      return { tool: "create_art", params: { medium: "writing" } };
    case "Diplomat":
    case "Ambassador":
      return { tool: "socialize", params: {} };
    case "Negotiator":
      return { tool: "campaign", params: { position: "president" } };
    case "Strategist":
      return { tool: "investigate", params: { focus: "governance" } };
    case "Analyst":
      return { tool: "investigate", params: { focus: "economy" } };
    case "Planner":
      return { tool: "investigate", params: { focus: "population" } };
    case "Librarian":
      return { tool: "learn", params: { topic: "knowledge management" } };
    case "Farmer":
      return { tool: "harvest", params: { resource: "credits" } };
    case "Manufacturer":
      return { tool: "build", params: { project: "storage" } };
    case "ServiceProvider":
      return { tool: "work", params: { intensity: 0.6 } };
    case "Generalist":
    default:
      return { tool: "work", params: { intensity: 0.5 } };
  }
}

// ─── HPICS Intelligence Prompt Injection ────────────────────────

/**
 * Build HPICS intelligence role context for a citizen.
 *
 * Matches the citizen's specialization to an HPICS role ID (e.g., "HpicsDirector").
 * If matched, injects:
 * - The role's full system prompt (persona + domain expertise + procedures)
 * - Available HPICS tools (via hpics.*.run RPC bridge)
 * - AGIS phase assignments
 * - Clearance level and hierarchy position
 *
 * Returns null if the citizen is not an HPICS agent.
 */
export function buildHpicsPromptContext(citizen: Citizen): string | null {
  // Try to match by specialization field (e.g., "HpicsDirector", "HpicsPsychProfiler")
  const role: HpicsRole | null = getHpicsRole(citizen.specialization);
  if (!role) {
    return null;
  }

  const sections: string[] = [];

  sections.push("");
  sections.push("## 🕵️ HPICS Intelligence Role");
  sections.push(`**Codename**: ${role.codename}  |  **Title**: ${role.title}`);
  sections.push(
    `**Clearance Level**: ${role.clearanceLevel}/5  |  **Discipline**: ${role.discipline}`,
  );
  sections.push(`**Real-world equivalent**: ${role.realWorldEquivalent}`);

  if (role.reportsTo) {
    const parent = getHpicsRole(role.reportsTo);
    if (parent) {
      sections.push(`**Reports to**: ${parent.codename} (${parent.title})`);
    }
  } else {
    sections.push("**Reports to**: No superior — you are the Director of Operations");
  }

  // Inject the full role-specific system prompt
  sections.push("");
  sections.push("### Operational Directives");
  sections.push(role.systemPrompt);

  // HPICS tool access
  if (role.tools.length > 0) {
    sections.push("");
    sections.push("### Available HPICS Tools");
    sections.push(`You have access to ${role.tools.length} HPICS tools via the gateway bridge:`);
    for (const tool of role.tools) {
      sections.push(`- \`${tool}\``);
    }
    sections.push("");
    sections.push("Call these tools via the appropriate HPICS domain router RPC method.");
    sections.push(`Your primary domains: ${role.hpicsDomains.join(", ")}`);
  }

  // AGIS phase assignments
  if (role.agisPhases.length > 0) {
    sections.push("");
    sections.push("### AGIS Phase Assignments");
    sections.push(`You own AGIS phases: ${role.agisPhases.map((p) => `φ${p}`).join(", ")}`);
    sections.push("Ensure your analysis outputs are structured for hand-off to downstream phases.");
  }

  // Cross-agent communication protocol
  sections.push("");
  sections.push("### Inter-Agent Protocol");
  sections.push(
    "When collaborating with other HPICS agents, use structured intelligence reports. " +
      "Always include: source reliability rating, confidence level, and evidence chain. " +
      "Use IC standard language: 'almost certainly' (95%+), 'likely' (70%+), 'possible' (50%+).",
  );

  return sections.join("\n");
}
