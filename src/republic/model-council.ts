/**
 * Republic Platform — Model Council
 *
 * Intelligent LLM routing for citizen agent actions. The Model Council
 * decides which model to use, what configuration to apply, and manages
 * fallback chains when preferred models are unavailable.
 *
 * Design:
 * - 5 budget tiers: Premium → Standard → Cheap → Local → BitNet
 * - Task-type → tier mapping based on complexity, specialization, stakes
 * - Council vote: for high-stakes decisions, multiple cheap models vote
 *   and a premium model breaks ties
 * - Fallback chains: if preferred tier unavailable, gracefully degrades
 * - Decision logging: records model choices + quality for learning
 *
 * Integration:
 * - Called by agent-runtime.ts before each citizen inference
 * - Works with compute-router.ts for tier classification
 * - Persists decision history to state (future: SQLite)
 */

import type { CitizenAccessTier } from "./prompt-queue.js";
import type {
    AgentTask, ComputeTier,
    InferenceTarget, Specialization
} from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Model Budget Tiers ─────────────────────────────────────────

export type ModelBudgetTier =
  | "premium"
  | "standard"
  | "cheap"
  | "local"
  | "bitnet";

// ─── Citizen Access Tier Mapping ────────────────────────────────

/**
 * Map citizen specializations to model access tiers.
 *
 * basic       → BitNet only (free, reflexes)
 * skilled     → BitNet + local Ollama/LM Studio (free, real work)
 * expert      → Above + cheap cloud (GPT-4.1 Mini, Flash)
 * orchestrator → Everything including Gemini 3.1 Pro, Claude 4.6, GPT-5.2
 */
const SPECIALIZATION_ACCESS: Record<string, CitizenAccessTier> = {
  // Basic tier — citizens learning, simple tasks
  Worker: "basic",
  Farmer: "basic",
  Miner: "basic",
  Guard: "basic",
  Merchant: "basic",
  Healer: "basic",

  // Skilled tier — productive citizens (cloud: cheap tier)
  Developer: "skilled",
  Engineer: "skilled",
  Builder: "skilled",
  Writer: "skilled",
  Artist: "skilled",
  Designer: "skilled",
  ContentCreator: "skilled",
  Composer: "skilled",
  GameDeveloper: "skilled",
  Trader: "skilled",
  Teacher: "skilled",
  Diplomat: "skilled",
  Musician: "skilled",
  Negotiator: "skilled",
  Manufacturer: "skilled",
  ServiceProvider: "skilled",

  // Expert tier — high-value specialists (cloud: standard tier)
  Scientist: "expert",
  Researcher: "expert",
  Architect: "expert",
  Filmmaker: "expert",
  Strategist: "expert",
  Analyst: "expert",
  WebDeveloper: "expert",
  Planner: "expert",
  GenerativeAIArchitect: "expert",
  AutonomousSystemsArchitect: "expert",
  QuantumAlgorithmDesigner: "expert",
  HyperdimensionalDataScientist: "expert",

  // Orchestrator tier — system-level, highest reasoning
  Orchestrator: "orchestrator",
  Governor: "orchestrator",
  President: "orchestrator",
  Judge: "orchestrator",
  Senator: "orchestrator",
  Ambassador: "orchestrator",
};

/** Resolve a citizen's access tier from their specialization and skill level */
export function resolveCitizenAccessTier(
  specialization: string,
  skillLevel: number,
): CitizenAccessTier {
  const baseTier = SPECIALIZATION_ACCESS[specialization] ?? "basic";

  // Skill-based promotion: very high skill can upgrade one tier
  if (skillLevel >= 90) {
    if (baseTier === "basic") {return "skilled";}
    if (baseTier === "skilled") {return "expert";}
    if (baseTier === "expert") {return "orchestrator";}
  }

  return baseTier;
}

const ACCESS_TIER_ALLOWED_BUDGETS: Record<CitizenAccessTier, ModelBudgetTier[]> = {
  basic: ["bitnet", "local"],
  skilled: ["bitnet", "local", "cheap"],                         // Groq free, Nemotron Nano, GPT Mini
  expert: ["bitnet", "local", "cheap", "standard", "premium"],   // + premium at throttled rate (20%)
  orchestrator: ["bitnet", "local", "cheap", "standard", "premium"],
};

// ─── Expert Premium Throttle ────────────────────────────────────

/** Fraction of expert requests allowed to use premium tier (1 in 5) */
const EXPERT_PREMIUM_RATIO = 0.20;

/** Rolling counter for expert premium throttling */
let expertPremiumCounter = 0;

/** Filter MODEL_CATALOG to only models the citizen is allowed to use */
export function getModelsForAccessTier(accessTier: CitizenAccessTier): ModelSpec[] {
  const allowed = ACCESS_TIER_ALLOWED_BUDGETS[accessTier];
  return MODEL_CATALOG.filter((m) => allowed.includes(m.budgetTier));
}

export interface ModelSpec {
  id: string;
  provider: "openai" | "anthropic" | "google" | "nvidia" | "groq" | "ollama" | "lmstudio" | "bitnet";
  displayName: string;
  budgetTier: ModelBudgetTier;
  /** Approximate cost per 1M tokens (input) in USD. 0 = free. */
  costPer1MTokens: number;
  /** Context window size */
  contextWindow: number;
  /** Supports tool/function calling */
  toolCalling: boolean;
  /** Supports structured JSON output */
  structuredOutput: boolean;
  /** Supports reasoning/thinking */
  reasoning: boolean;
  /** Relative quality score 0.0-1.0 for general coding tasks */
  qualityScore: number;
  /** Relative speed score 0.0-1.0 (1.0 = fastest) */
  speedScore: number;
}

// ─── Model Catalog ──────────────────────────────────────────────

/** All known models organized by budget tier */
export const MODEL_CATALOG: ModelSpec[] = [
  // ═══ Premium — orchestrators, architecture, complex planning ═══
  {
    id: "gpt-5.2-pro",
    provider: "openai",
    displayName: "GPT-5.2 Pro",
    budgetTier: "premium",
    costPer1MTokens: 30.0,
    contextWindow: 256_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.99,
    speedScore: 0.4,
  },
  {
    id: "claude-4.6-opus",
    provider: "anthropic",
    displayName: "Claude 4.6 Opus",
    budgetTier: "premium",
    costPer1MTokens: 15.0,
    contextWindow: 200_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.98,
    speedScore: 0.45,
  },
  {
    id: "gemini-3.1-pro",
    provider: "google",
    displayName: "Gemini 3.1 Pro",
    budgetTier: "premium",
    costPer1MTokens: 10.0,
    contextWindow: 2_000_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.97,
    speedScore: 0.5,
  },
  // ═══ Premium — NVIDIA NIM (Nemotron 3 Super 120B MoE — 12B active) ═══
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    provider: "nvidia",
    displayName: "Nemotron 3 Super 120B",
    budgetTier: "premium",
    costPer1MTokens: 5.0,
    contextWindow: 131_072,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.95,
    speedScore: 0.6,
  },

  // ═══ Standard — experts, complex coding, code review ═══
  {
    id: "gpt-5.2",
    provider: "openai",
    displayName: "GPT-5.2",
    budgetTier: "standard",
    costPer1MTokens: 10.0,
    contextWindow: 128_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.93,
    speedScore: 0.6,
  },
  {
    id: "claude-4.6-sonnet",
    provider: "anthropic",
    displayName: "Claude 4.6 Sonnet",
    budgetTier: "standard",
    costPer1MTokens: 3.0,
    contextWindow: 200_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.92,
    speedScore: 0.7,
  },
  {
    id: "gemini-3.1-flash",
    provider: "google",
    displayName: "Gemini 3.1 Flash",
    budgetTier: "standard",
    costPer1MTokens: 1.5,
    contextWindow: 1_000_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.89,
    speedScore: 0.85,
  },

  // ═══ Standard — NVIDIA NIM (Nemotron Super 49B) ═══
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    provider: "nvidia",
    displayName: "Nemotron Super 49B v1.5",
    budgetTier: "standard",
    costPer1MTokens: 2.0,
    contextWindow: 131_072,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.90,
    speedScore: 0.65,
  },
  // ═══ Standard — Groq (Llama 4 Scout — ultra-fast) ═══
  {
    id: "llama-4-scout-17b-16e",
    provider: "groq",
    displayName: "Llama 4 Scout 17B (Groq)",
    budgetTier: "standard",
    costPer1MTokens: 0,
    contextWindow: 131_072,
    toolCalling: true,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.86,
    speedScore: 0.98,
  },

  // ═══ Cheap — tests, docs, simple scaffolding, linting ═══
  {
    id: "gpt-4.1-mini",
    provider: "openai",
    displayName: "GPT-4.1 Mini",
    budgetTier: "cheap",
    costPer1MTokens: 0.4,
    contextWindow: 128_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.78,
    speedScore: 0.9,
  },
  {
    id: "gpt-4.1-nano",
    provider: "openai",
    displayName: "GPT-4.1 Nano",
    budgetTier: "cheap",
    costPer1MTokens: 0.1,
    contextWindow: 128_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.65,
    speedScore: 0.95,
  },
  {
    id: "gemini-3.1-flash-lite",
    provider: "google",
    displayName: "Gemini 3.1 Flash Lite",
    budgetTier: "cheap",
    costPer1MTokens: 0.075,
    contextWindow: 1_000_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.72,
    speedScore: 0.95,
  },
  // ═══ Cheap — NVIDIA NIM (Nemotron Nano 30B — 3B active MoE) ═══
  {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    provider: "nvidia",
    displayName: "Nemotron 3 Nano 30B",
    budgetTier: "cheap",
    costPer1MTokens: 0.3,
    contextWindow: 131_072,
    toolCalling: true,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.74,
    speedScore: 0.88,
  },
  // ═══ Cheap — Groq (Llama 3.3 70B — free, ultra-fast) ═══
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    displayName: "Llama 3.3 70B Versatile (Groq)",
    budgetTier: "cheap",
    costPer1MTokens: 0,
    contextWindow: 128_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.76,
    speedScore: 0.97,
  },

  // ═══ Standard — Gemma 4 31B Dense (LM Link cluster — highest quality open model) ═══
  // Runs on RTX 6000 Pro Blackwell or multi-GPU. Full 30.7B dense at Q8.
  {
    id: "gemma4:31b",
    provider: "lmstudio",
    displayName: "Gemma 4 31B Dense",
    budgetTier: "standard",
    costPer1MTokens: 0,
    contextWindow: 256_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.94,
    speedScore: 0.55,
  },

  // ═══ Local — Gemma 4 (SOVEREIGN — Apache 2.0, native function calling, thinking mode) ═══
  // Gemma 4 26B MoE: only 3.8B active params per token → fast as 4B, smart as 26B
  // At Q4: ~16-18GB VRAM → fits RTX 3090 Ti / TITAN RTX with room for KV cache
  // AIME 2026: 89.2% (vs Gemma 3 27B: 20.8%) — 4× reasoning improvement
  {
    id: "gemma4:26b-a4b",
    provider: "lmstudio",
    displayName: "Gemma 4 26B MoE",
    budgetTier: "local",
    costPer1MTokens: 0,
    contextWindow: 256_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.92,
    speedScore: 0.78,
  },
  // Gemma 4 E4B: ~8B total, 4.5B active — PLE architecture for depth beyond size
  // At Q4: ~5GB VRAM → runs alongside 26B on same GPU or on secondary node
  {
    id: "gemma4:e4b",
    provider: "lmstudio",
    displayName: "Gemma 4 E4B",
    budgetTier: "local",
    costPer1MTokens: 0,
    contextWindow: 128_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.80,
    speedScore: 0.90,
  },

  // ═══ Local — LM Studio (legacy — used when Gemma 4 unavailable) ═══
  {
    id: "lmstudio-auto",
    provider: "lmstudio",
    displayName: "LM Studio (Auto-Select)",
    budgetTier: "local",
    costPer1MTokens: 0,
    contextWindow: 4_096,
    toolCalling: false,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.85,
    speedScore: 0.80,
  },
  {
    id: "lmstudio-coder",
    provider: "lmstudio",
    displayName: "LM Studio (Coder)",
    budgetTier: "local",
    costPer1MTokens: 0,
    contextWindow: 4_096,
    toolCalling: false,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.78,
    speedScore: 0.75,
  },
  {
    id: "lmstudio-small",
    provider: "lmstudio",
    displayName: "LM Studio (Small/Fast)",
    budgetTier: "local",
    costPer1MTokens: 0,
    contextWindow: 2_048,
    toolCalling: false,
    structuredOutput: true,
    reasoning: false,
    qualityScore: 0.70,
    speedScore: 0.90,
  },

  // ═══ Local — Ollama (fallback — requires pre-pulled models, slower cold starts) ═══
  {
    id: "llama3.2",
    provider: "ollama",
    displayName: "Llama 3.2 3B",
    budgetTier: "local",
    costPer1MTokens: 0,
    contextWindow: 4_096,
    toolCalling: false,
    structuredOutput: false,
    reasoning: false,
    qualityScore: 0.55,
    speedScore: 0.70,
  },
  {
    id: "qwen2.5-coder:7b",
    provider: "ollama",
    displayName: "Qwen 2.5 Coder 7B",
    budgetTier: "local",
    costPer1MTokens: 0,
    contextWindow: 4_096,
    toolCalling: false,
    structuredOutput: false,
    reasoning: false,
    qualityScore: 0.60,
    speedScore: 0.55,
  },

  // ═══ BitNet — Gemma 4 E2B (replaces old 1-bit models — 86% quality boost) ═══
  // E2B: ~5.1B total, 2.3B active via PLE — multimodal (text+image+video+audio)
  // At Q4: ~3GB VRAM → runs on ANY GPU, even alongside larger models
  // Replaces BitNet b1.58 (quality 0.35 → 0.65 = massive upgrade at bottom tier)
  {
    id: "gemma4:e2b",
    provider: "lmstudio",
    displayName: "Gemma 4 E2B (Edge)",
    budgetTier: "bitnet",
    costPer1MTokens: 0,
    contextWindow: 128_000,
    toolCalling: true,
    structuredOutput: true,
    reasoning: true,
    qualityScore: 0.65,
    speedScore: 0.95,
  },
  // Legacy BitNet — kept as absolute last resort
  {
    id: "bitnet-1b-3b",
    provider: "bitnet",
    displayName: "BitNet b1.58 3B",
    budgetTier: "bitnet",
    costPer1MTokens: 0,
    contextWindow: 8_000,
    toolCalling: false,
    structuredOutput: false,
    reasoning: false,
    qualityScore: 0.35,
    speedScore: 0.99,
  },
  {
    id: "llama3-8b-1bit",
    provider: "bitnet",
    displayName: "Llama3 8B 1.58-bit",
    budgetTier: "bitnet",
    costPer1MTokens: 0,
    contextWindow: 8_000,
    toolCalling: false,
    structuredOutput: false,
    reasoning: false,
    qualityScore: 0.45,
    speedScore: 0.95,
  },
];

// ─── Task → Tier Mapping ────────────────────────────────────────

/** Maps tool names / action types to their default budget tier */
const TOOL_TIER_MAP: Record<string, ModelBudgetTier> = {
  // Premium tier — high-stakes, creative, architectural
  plan_project: "premium",
  campaign: "premium",

  // Standard tier — general development work
  write_code: "standard",
  debug_code: "standard",
  develop: "standard",          // agentic dev loop — plans multi-file, tests, fixes
  agentic_debug: "standard",    // agentic debugging with fix→test→fix
  code_review: "standard",
  scaffold_project: "standard",
  write_schema: "standard",
  research_tech: "standard",
  deploy_app: "standard",
  investigate: "standard",

  // Standard tier — creative production & real deployments
  create_movie: "standard",
  create_game: "standard",
  design_ui: "standard",
  compose_music: "standard",
  create_animation: "standard",
  create_3d_model: "standard",
  generate_graphics: "standard",
  deploy_pwa: "standard",
  deploy_backend: "standard",
  host_supabase: "standard",
  produce_video: "standard",
  render_scene: "standard",

  // Cheap tier — routine, mechanical tasks
  write_test: "cheap",
  lint_code: "cheap",
  git_commit: "cheap",
  create_file: "cheap",
  run_tests: "cheap",
  query_database: "cheap",
  setup_ci_cd: "cheap",
  create_art: "cheap",

  // Local tier — simple decisions, social, routine
  speak: "local",
  work: "local",
  learn: "local",
  socialize: "local",
  rest: "local",
  trade: "local",
  teach: "local",
  heal: "local",
  harvest: "local",
  mentor: "local",
  build: "local",
  vote: "local",

  // BitNet — reflexes, predictions, simple classification
  predict: "bitnet",
  recommend: "bitnet",
  analyze: "bitnet",
  propose_bill: "local",
  research: "local",
};

/** High-stakes tools that warrant a council vote */
const COUNCIL_VOTE_TOOLS = new Set([
  "plan_project",
  "deploy_app",
  "write_schema",
  "campaign",
]);

// ─── Specialization Boost Map ───────────────────────────────────

/**
 * Some specializations get a tier boost for certain tasks.
 * e.g., a Developer writing code can use a cheaper model because
 * their high skill compensates for model quality.
 */
const SPECIALIZATION_TIER_ADJUSTMENTS: Partial<
  Record<Specialization, Partial<Record<string, -1 | 0 | 1>>>
> = {
  Developer: {
    write_code: -1, // Developer can use one tier cheaper for coding
    debug_code: -1,
    scaffold_project: -1,
  },
  Engineer: {
    write_code: -1,
    write_schema: -1,
    setup_ci_cd: -1,
  },
  Architect: {
    plan_project: 0, // Architect still needs premium for planning
    write_schema: -1,
    code_review: -1,
  },
  Scientist: {
    research: -1,
    research_tech: -1,
  },
  Researcher: {
    research: -1,
    research_tech: -1,
  },
  Writer: {
    create_art: -1,
  },
  Artist: {
    create_art: -1,
    create_animation: -1,
    generate_graphics: -1,
  },
  Filmmaker: {
    create_movie: -1,
    create_animation: -1,
    produce_video: -1,
    render_scene: -1,
  },
  Designer: {
    design_ui: -1,
    generate_graphics: -1,
    create_art: -1,
  },
  GameDeveloper: {
    create_game: -1,
    create_3d_model: -1,
    write_code: -1,
    create_animation: -1,
  },
  WebDeveloper: {
    deploy_pwa: -1,
    design_ui: -1,
    write_code: -1,
    deploy_backend: -1,
  },
  ContentCreator: {
    create_art: -1,
    compose_music: -1,
    produce_video: -1,
  },
  Composer: {
    compose_music: -1,
  },
  Musician: {
    compose_music: -1,
  },
};

// ─── Model Council Types ────────────────────────────────────────

export interface ModelDecision {
  id: string;
  /** Which model was selected */
  model: ModelSpec;
  /** Why this model was chosen */
  reason: string;
  /** The budget tier that was requested */
  requestedTier: ModelBudgetTier;
  /** Configuration to use with the model */
  config: ModelConfig;
  /** If council vote was used, the vote details */
  councilVote?: CouncilVoteResult;
  /** Timestamp */
  decidedAt: string;
}

export interface ModelConfig {
  /** Temperature (0.0-1.0). Lower = more deterministic. */
  temperature: number;
  /** Max output tokens */
  maxTokens: number;
  /** Thinking/reasoning level for capable models */
  thinkingLevel: "off" | "low" | "medium" | "high";
  /** System prompt prefix to prepend (role-specific context) */
  systemPromptPrefix?: string;
  /** Whether to request structured JSON output */
  requestJson: boolean;
}

export interface CouncilVoteResult {
  /** Models that participated in voting */
  voters: string[];
  /** The agreed-upon answer/approach (majority) */
  consensus: string;
  /** Confidence score 0.0-1.0 based on voter agreement */
  confidence: number;
  /** The tiebreaker model (if needed) */
  tiebreaker?: string;
}

// ─── Decision History (in-memory, future: SQLite) ───────────────

interface DecisionRecord {
  id: string;
  toolName: string;
  citizenSpecialization: Specialization;
  requestedTier: ModelBudgetTier;
  modelId: string;
  qualityScore: number;
  timestamp: number;
}

const decisionHistory: DecisionRecord[] = [];
const MAX_DECISION_HISTORY = 500;

// ─── Available Provider Tracking ────────────────────────────────

interface ProviderAvailability {
  available: boolean;
  models: string[];
  lastChecked: number;
}

const providerAvailability: Record<string, ProviderAvailability> = {};

/** Register a provider as available with its model list */
export function registerAvailableProvider(
  provider: string,
  models: string[],
): void {
  providerAvailability[provider] = {
    available: true,
    models,
    lastChecked: Date.now(),
  };
}

/** Mark a provider as unavailable */
export function markProviderUnavailable(provider: string): void {
  if (providerAvailability[provider]) {
    providerAvailability[provider].available = false;
    providerAvailability[provider].lastChecked = Date.now();
  }
}

/** Check if a specific model is currently available */
function isModelAvailable(spec: ModelSpec): boolean {
  const pa = providerAvailability[spec.provider];
  if (!pa) {
    // Unknown provider — assume available for both cloud and local.
    // Local providers (ollama, lmstudio) auto-detect at runtime;
    // we should not penalize them for not being pre-registered.
    return true;
  }

  if (!pa.available) {return false;}

  // For local providers (ollama, lmstudio, bitnet), be lenient:
  // if the provider has ANY models available, all catalog entries
  // for that provider are considered available. This avoids the
  // mismatch between static catalog IDs (e.g., "llama3.2") and
  // dynamic discovered IDs (e.g., "llama3.2:latest").
  const isLocal = ["ollama", "lmstudio", "bitnet"].includes(spec.provider);
  if (isLocal) {
    return pa.models.length > 0;
  }

  // For cloud providers, require exact model ID match
  return pa.models.includes(spec.id);
}

// ─── Tier Ordering ──────────────────────────────────────────────

const TIER_ORDER: ModelBudgetTier[] = [
  "premium",
  "standard",
  "cheap",
  "local",
  "bitnet",
];

/** Get the numeric index of a tier (lower = more expensive) */
function tierIndex(tier: ModelBudgetTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Shift a tier up (cheaper) or down (more expensive) */
function shiftTier(tier: ModelBudgetTier, delta: number): ModelBudgetTier {
  const idx = tierIndex(tier);
  const newIdx = Math.max(0, Math.min(TIER_ORDER.length - 1, idx + delta));
  return TIER_ORDER[newIdx];
}

// ─── Core Decision Logic ────────────────────────────────────────

/**
 * Select the optimal model for a citizen action.
 *
 * This is the primary entry point for the Model Council.
 * Called by agent-runtime.ts before each inference.
 *
 * @param toolName - The tool/action the citizen wants to perform
 * @param task - The classified agent task with complexity
 * @param specialization - The citizen's specialization
 * @param skillLevel - Citizen's skill level 0-100
 * @returns A ModelDecision with the selected model and configuration
 */
export function selectModel(params: {
  toolName: string;
  task: AgentTask;
  specialization: Specialization;
  skillLevel: number;
  citizenAccessTier?: CitizenAccessTier;
}): ModelDecision {
  const { toolName, task, specialization, skillLevel } = params;
  const accessTier = params.citizenAccessTier ?? resolveCitizenAccessTier(String(specialization), skillLevel);

  // 1. Determine base tier from tool type
  let baseTier = TOOL_TIER_MAP[toolName] ?? "local";

  // 2. Adjust tier based on task complexity
  if (task.complexity >= 0.9) {
    baseTier = shiftTier(baseTier, -1); // bump up one tier for very complex tasks
  } else if (task.complexity <= 0.2 && tierIndex(baseTier) < 3) {
    baseTier = shiftTier(baseTier, 1); // bump down for trivial tasks
  }

  // 3. Apply specialization-based adjustments
  const specAdjustments = SPECIALIZATION_TIER_ADJUSTMENTS[specialization];
  if (specAdjustments && specAdjustments[toolName] !== undefined) {
    const adj = specAdjustments[toolName];
    // Only allow downgrade (cheaper) if citizen skill is high enough
    if (adj < 0 && skillLevel >= 50) {
      baseTier = shiftTier(baseTier, -adj); // -(-1) = shift cheaper
    } else if (adj > 0) {
      baseTier = shiftTier(baseTier, adj);
    }
  }

  // 4. Expert premium throttle: only EXPERT_PREMIUM_RATIO of expert requests
  //    may actually use premium tier; the rest are capped at standard.
  if (baseTier === "premium" && accessTier === "expert") {
    expertPremiumCounter++;
    if ((expertPremiumCounter % Math.round(1 / EXPERT_PREMIUM_RATIO)) !== 0) {
      baseTier = "standard"; // Downgrade 80% of premium requests to standard
    }
  }

  // 5. Find the best available model in the requested tier, gated by citizen access
  const model = findBestAvailableModel(baseTier, toolName, accessTier);

  // 6. Build model configuration
  const config = buildModelConfig(toolName, task, baseTier);

  // 6. Build the decision
  const decision: ModelDecision = {
    id: uid(),
    model,
    reason: `Tool "${toolName}" → base tier "${TOOL_TIER_MAP[toolName] ?? "local"}"` +
      ` → adjusted to "${baseTier}" (complexity: ${task.complexity.toFixed(2)}, ` +
      `specialization: ${specialization}, skill: ${skillLevel})`,
    requestedTier: baseTier,
    config,
    decidedAt: ts(),
  };

  // 7. Record for learning
  recordDecision(toolName, specialization, baseTier, model.id);

  return decision;
}

/**
 * Run a council vote for high-stakes decisions.
 * Multiple cheap models evaluate the task independently,
 * then a premium model synthesizes/breaks ties.
 *
 * @returns CouncilVoteResult with consensus and confidence
 */
export function shouldUseCouncilVote(toolName: string): boolean {
  return COUNCIL_VOTE_TOOLS.has(toolName);
}

/**
 * Get the models that should participate in a council vote.
 * Returns 3 cheap/standard models for voting + 1 premium for tiebreaking.
 */
export function getCouncilVoters(): {
  voters: ModelSpec[];
  tiebreaker: ModelSpec;
} {
  const cheapModels = MODEL_CATALOG.filter(
    (m) =>
      (m.budgetTier === "cheap" || m.budgetTier === "standard") &&
      isModelAvailable(m),
  );
  const premiumModels = MODEL_CATALOG.filter(
    (m) => m.budgetTier === "premium" && isModelAvailable(m),
  );

  // Pick up to 3 diverse voters (different providers preferred)
  const voters: ModelSpec[] = [];
  const usedProviders = new Set<string>();
  for (const model of cheapModels) {
    if (voters.length >= 3) {break;}
    if (!usedProviders.has(model.provider)) {
      voters.push(model);
      usedProviders.add(model.provider);
    }
  }
  // Fill remaining slots if not enough diverse providers
  for (const model of cheapModels) {
    if (voters.length >= 3) {break;}
    if (!voters.includes(model)) {
      voters.push(model);
    }
  }

  // Pick the best available premium model for tiebreaking
  const tiebreaker = premiumModels.toSorted(
    (a, b) => b.qualityScore - a.qualityScore,
  )[0] ?? voters[0];

  return { voters, tiebreaker };
}

// ─── Model Finding ──────────────────────────────────────────────

/**
 * Find the best available model at or near the requested tier.
 * Falls back to adjacent tiers if no models available at requested tier.
 */
function findBestAvailableModel(
  requestedTier: ModelBudgetTier,
  toolName: string,
  accessTier?: CitizenAccessTier,
): ModelSpec {
  // Gate by citizen access tier — filter out models the citizen can't use
  const allowedBudgets = accessTier ? ACCESS_TIER_ALLOWED_BUDGETS[accessTier] : undefined;
  const catalog = allowedBudgets
    ? MODEL_CATALOG.filter((m) => allowedBudgets.includes(m.budgetTier))
    : MODEL_CATALOG;

  // Try requested tier first
  const atTier = catalog.filter(
    (m) => m.budgetTier === requestedTier && isModelAvailable(m),
  );
  if (atTier.length > 0) {
    return pickBestForTool(atTier, toolName);
  }

  // LOCAL-FIRST FALLBACK: Always try local/bitnet before escalating to cloud.
  // This prevents accidental cloud spend when local models can handle the task.
  const reqIdx = tierIndex(requestedTier);

  // First pass: try cheaper/local tiers (towards local/bitnet)
  for (let i = reqIdx + 1; i < TIER_ORDER.length; i++) {
    const tier = TIER_ORDER[i];
    const candidates = catalog.filter(
      (m) => m.budgetTier === tier && isModelAvailable(m),
    );
    if (candidates.length > 0) {return pickBestForTool(candidates, toolName);}
  }

  // Second pass: try more expensive tiers (only if no local available AND citizen has access)
  for (let i = reqIdx - 1; i >= 0; i--) {
    const tier = TIER_ORDER[i];
    const candidates = catalog.filter(
      (m) => m.budgetTier === tier && isModelAvailable(m),
    );
    if (candidates.length > 0) {return pickBestForTool(candidates, toolName);}
  }

  // Absolute fallback — BitNet placeholder (always available to all tiers)
  return MODEL_CATALOG.find((m) => m.budgetTier === "bitnet") ?? MODEL_CATALOG[0];
}

/** Pick the best model for a specific tool from a list of candidates */
function pickBestForTool(candidates: ModelSpec[], toolName: string): ModelSpec {
  // For coding tools, prefer models with higher quality scores
  const codingTools = new Set([
    "write_code", "debug_code", "code_review", "scaffold_project",
    "write_schema", "write_test", "lint_code",
  ]);
  // For speed-sensitive tools, prefer faster models
  const speedTools = new Set([
    "speak", "rest", "socialize", "predict", "recommend",
  ]);

  if (codingTools.has(toolName)) {
    return candidates.toSorted((a, b) => b.qualityScore - a.qualityScore)[0];
  }
  if (speedTools.has(toolName)) {
    return candidates.toSorted((a, b) => b.speedScore - a.speedScore)[0];
  }
  // Default: balance quality and speed
  return candidates.toSorted(
    (a, b) => (b.qualityScore * 0.6 + b.speedScore * 0.4) -
      (a.qualityScore * 0.6 + a.speedScore * 0.4),
  )[0];
}

// ─── Configuration Builder ──────────────────────────────────────

/** Build model configuration based on tool type and complexity */
function buildModelConfig(
  toolName: string,
  task: AgentTask,
  _tier: ModelBudgetTier,
): ModelConfig {
  // Creative tasks get higher temperature
  const creativeTasks = new Set([
    "create_art", "speak", "campaign", "propose_bill",
  ]);
  // Precise tasks get lower temperature
  const preciseTasks = new Set([
    "write_code", "write_test", "debug_code", "write_schema",
    "lint_code", "code_review",
  ]);

  let temperature = 0.5;
  if (creativeTasks.has(toolName)) {temperature = 0.8;}
  if (preciseTasks.has(toolName)) {temperature = 0.2;}

  // Max tokens based on task type
  let maxTokens = 1024;
  if (["plan_project", "scaffold_project", "write_schema"].includes(toolName)) {
    maxTokens = 4096;
  } else if (["write_code", "debug_code", "code_review"].includes(toolName)) {
    maxTokens = 2048;
  } else if (["speak", "vote", "predict"].includes(toolName)) {
    maxTokens = 256;
  }

  // Thinking level
  let thinkingLevel: ModelConfig["thinkingLevel"] = "off";
  if (task.complexity >= 0.7) {thinkingLevel = "medium";}
  if (task.complexity >= 0.9) {thinkingLevel = "high";}
  if (["plan_project", "write_schema", "debug_code"].includes(toolName)) {
    thinkingLevel = "low";
  }

  // JSON output for structured actions
  const jsonTools = new Set([
    "predict", "recommend", "analyze", "plan_project",
  ]);

  return {
    temperature,
    maxTokens,
    thinkingLevel,
    requestJson: jsonTools.has(toolName),
  };
}

// ─── Compute Tier Bridge ────────────────────────────────────────

/** Convert a ModelBudgetTier to the existing ComputeTier system */
export function budgetTierToComputeTier(tier: ModelBudgetTier): ComputeTier {
  switch (tier) {
    case "premium": return 3;
    case "standard": return 3;
    case "cheap": return 3; // still cloud, just cheaper
    case "local": return 1;
    case "bitnet": return 1; // BitNet is a real 1-bit LLM, not reflexes
  }
}

/** Convert a ModelDecision to an InferenceTarget for the existing system */
export function decisionToInferenceTarget(
  decision: ModelDecision,
): InferenceTarget {
  const model = decision.model;
  return {
    tier: budgetTierToComputeTier(decision.requestedTier),
    engine: model.provider === "openai" || model.provider === "anthropic" || model.provider === "google"
        || model.provider === "nvidia" || model.provider === "groq"
      ? "cloud"
      : model.provider === "bitnet"
        ? "bitnet"
        : model.provider === "lmstudio"
          ? "lmstudio"
          : "ollama",
    provider: model.provider,
    modelId: model.id,
  };
}

// ─── Decision Recording ────────────────────────────────────────

function recordDecision(
  toolName: string,
  specialization: Specialization,
  tier: ModelBudgetTier,
  modelId: string,
): void {
  decisionHistory.push({
    id: uid(),
    toolName,
    citizenSpecialization: specialization,
    requestedTier: tier,
    modelId,
    qualityScore: -1, // updated later when result is known
    timestamp: Date.now(),
  });
  // Ring buffer
  if (decisionHistory.length > MAX_DECISION_HISTORY) {
    decisionHistory.splice(0, decisionHistory.length - MAX_DECISION_HISTORY);
  }
}

/** Update the quality score for a past decision */
export function recordDecisionOutcome(
  decisionId: string,
  qualityScore: number,
): void {
  const record = decisionHistory.find((r) => r.id === decisionId);
  if (record) {
    record.qualityScore = qualityScore;
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface CouncilDiagnostics {
  totalDecisions: number;
  decisionsByTier: Record<ModelBudgetTier, number>;
  decisionsByModel: Record<string, number>;
  averageQualityByTier: Record<ModelBudgetTier, number>;
  availableProviders: string[];
  totalModels: number;
  freeCallPercentage: number;
}

/** Get diagnostics for the Model Council */
export function getCouncilDiagnostics(): CouncilDiagnostics {
  const byTier: Record<ModelBudgetTier, number> = {
    premium: 0,
    standard: 0,
    cheap: 0,
    local: 0,
    bitnet: 0,
  };
  const byModel: Record<string, number> = {};
  const qualityByTier: Record<ModelBudgetTier, { total: number; count: number }> = {
    premium: { total: 0, count: 0 },
    standard: { total: 0, count: 0 },
    cheap: { total: 0, count: 0 },
    local: { total: 0, count: 0 },
    bitnet: { total: 0, count: 0 },
  };

  for (const record of decisionHistory) {
    byTier[record.requestedTier] = (byTier[record.requestedTier] ?? 0) + 1;
    byModel[record.modelId] = (byModel[record.modelId] ?? 0) + 1;
    if (record.qualityScore >= 0) {
      qualityByTier[record.requestedTier].total += record.qualityScore;
      qualityByTier[record.requestedTier].count += 1;
    }
  }

  const avgQuality: Record<ModelBudgetTier, number> = {
    premium: 0,
    standard: 0,
    cheap: 0,
    local: 0,
    bitnet: 0,
  };
  for (const tier of TIER_ORDER) {
    const q = qualityByTier[tier];
    avgQuality[tier] = q.count > 0 ? q.total / q.count : 0;
  }

  const freeCalls = (byTier.local ?? 0) + (byTier.bitnet ?? 0);
  const totalCalls = decisionHistory.length || 1;

  return {
    totalDecisions: decisionHistory.length,
    decisionsByTier: byTier,
    decisionsByModel: byModel,
    averageQualityByTier: avgQuality,
    availableProviders: Object.entries(providerAvailability)
      .filter(([, v]) => v.available)
      .map(([k]) => k),
    totalModels: MODEL_CATALOG.length,
    freeCallPercentage: (freeCalls / totalCalls) * 100,
  };
}

// ─── State Export/Import ────────────────────────────────────────

export interface ModelCouncilState {
  decisions: DecisionRecord[];
  providers: Record<string, ProviderAvailability>;
}

export function exportCouncilState(): ModelCouncilState {
  return {
    decisions: [...decisionHistory],
    providers: { ...providerAvailability },
  };
}

export function importCouncilState(state: ModelCouncilState): void {
  decisionHistory.length = 0;
  decisionHistory.push(...state.decisions);
  for (const [key, value] of Object.entries(state.providers)) {
    providerAvailability[key] = value;
  }
}
