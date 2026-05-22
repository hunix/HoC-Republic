/**
 * Republic Platform — Inference Prompt Strategy
 *
 * Provider-optimised prompt builders — each tuned to its model's strengths,
 * token budget, context window, and supported features (JSON mode, tools, etc.)
 *
 * ┌──────────────────┬────────┬────────┬─────────────────────────────────────┐
 * │ Strategy         │ Tokens │ Output │ Providers                           │
 * ├──────────────────┼────────┼────────┼─────────────────────────────────────┤
 * │ buildMicroPrompt │  ~400  │  150   │ LM Studio 8-slot parallel (Qwen3-8B)│
 * │ build1KPrompt    │ ~1024  │  256   │ LM Studio single-slot (30B/VL)      │
 * │ buildFlashPrompt │ ~2048  │  400   │ Gemini Flash, Groq, NIM, DeepSeek   │
 * │ buildProPrompt   │ ~4096  │  768   │ GPT-4o, Gemini Pro, Claude Sonnet   │
 * │ buildThinkPrompt │ ~2048  │  1024  │ DeepSeek R1, GPT-o3, Gemini 2.5 Pro │
 * └──────────────────┴────────┴────────┴─────────────────────────────────────┘
 *
 * Token budget guide:
 *   Local 8-slot (Qwen3-8B Q8_0):  400 in + 150 out → 550 KV/slot → 4.4K total
 *   Local single (Qwen3-30B):     1024 in + 256 out → 1.28K KV
 *   Free cloud flash:             2048 in + 400 out → ~2.5K (well under 1M limit)
 *   Paid cloud pro:               4096 in + 768 out → rich context for complex decisions
 */

import type { Citizen } from "./types.js";
import { getCitizenGoal } from "./citizen-autonomy.js";

// ─── Types ──────────────────────────────────────────────────────

export interface InferencePrompt {
  system: string;
  user: string;
  /** Suggested max_tokens for the completion */
  maxTokens: number;
  /** Whether this provider supports JSON output mode natively */
  jsonMode?: boolean;
}

export interface PromptStrategyOptions {
  fewShotContext?: string;
  feedback?: string;
  /** Extra domain context (recent events, economy state, etc.) */
  contextSnippet?: string;
}

// ─── Shared constants ────────────────────────────────────────────

const JSON_SCHEMA = '{"tool":"<name>","params":{},"thought":"<reason>"}';

const TOOL_LIST =
  "study | create | rest | socialize | work | explore | reflect | produce | trade | innovate";

const STRICT_JSON_LINE =
  "IMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, no extra text.";

/** Pre-joined compact instruction for micro/edge prompts */
const COMPACT_JSON_INSTRUCTION = `Reply ONLY valid JSON: ${JSON_SCHEMA}\nTools: ${TOOL_LIST}`;

// ─── Helpers ─────────────────────────────────────────────────────

function citizenHeader(c: Citizen, verbose = false): string {
  const lines = [`${c.name} | ${c.specialization} | Lvl ${c.level ?? 1}`];
  if (verbose) {
    lines.push(
      `Energy: ${c.energy ?? 50}/100  Intelligence: ${c.intelligence ?? 100}  Health: ${c.health ?? 100}`,
    );
    if (Array.isArray(c.traits) && c.traits.length > 0) {
      lines.push(`Traits: ${c.traits.slice(0, 5).join(", ")}`);
    }
  } else {
    lines.push(`Energy:${c.energy ?? 50}  Intel:${c.intelligence ?? 100}`);
  }
  return lines.join("\n");
}

function goalBlock(c: Citizen, maxLen: number): string {
  const goal = getCitizenGoal(c.id);
  if (!goal || goal.completedAt) {
    return "";
  }
  const desc = goal.description?.slice(0, maxLen) ?? "active task";
  const pct = goal.progress ?? 0;
  return `Active goal (${pct}% done): ${desc}`;
}

function feedbackBlock(opts: PromptStrategyOptions, maxLen: number): string {
  const parts: string[] = [];
  if (opts.fewShotContext) {
    parts.push(`Context:\n${opts.fewShotContext.slice(0, maxLen)}`);
  }
  if (opts.feedback) {
    parts.push(`Feedback: ${opts.feedback.slice(0, maxLen)}`);
  }
  if (opts.contextSnippet) {
    parts.push(opts.contextSnippet.slice(0, maxLen));
  }
  return parts.join("\n\n");
}

// ─── STRATEGY 1: Micro — 8-slot parallel local (Qwen3-8B) ────────

/**
 * Ultra-compact, ~400 token total.
 * Designed for Qwen3-8B Q8_0 running 8 parallel slots on RTX 3090 Ti.
 *
 * VRAM math:
 *   8.5 GB model + 8 × 0.25 GB KV (real usage ~550 tok) = ~10.5 GB
 *   → 13.5 GB VRAM headroom → smooth 8-slot parallel ✅
 */
export function buildMicroPrompt(
  citizen: Citizen,
  opts: PromptStrategyOptions = {},
): InferencePrompt {
  const gl = goalBlock(citizen, 80);

  const system = [citizenHeader(citizen, false), gl, "", COMPACT_JSON_INSTRUCTION]
    .filter(Boolean)
    .join("\n")
    .slice(0, 200 * 4);

  const extra = opts.feedback ? `\nFeedback: ${opts.feedback.slice(0, 80)}` : "";
  const user = (
    gl
      ? `Progress ${getCitizenGoal(citizen.id)?.progress ?? 0}% — next action?`
      : `${citizen.name} decides next action.` + extra
  ).slice(0, 200 * 4);

  return { system, user, maxTokens: 150, jsonMode: false };
}

// ─── STRATEGY 2: 1K — Single-slot local (Qwen3-30B, VL models) ──

/**
 * ~1024 token budget, 256 output.
 * Best for single-slot local inference (30B, VL variants).
 * Sends more citizen context than micro — better decisions, lower throughput.
 */
export function build1KPrompt(citizen: Citizen, opts: PromptStrategyOptions = {}): InferencePrompt {
  const gl = goalBlock(citizen, 200);

  const system = [
    `You are ${citizen.name}, a ${citizen.specialization} in an AI republic simulation.`,
    citizenHeader(citizen, true),
    gl,
    "",
    `Choose ONE action. JSON only — ${JSON_SCHEMA}`,
    `Tools: ${TOOL_LIST}`,
    STRICT_JSON_LINE,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 600 * 4);

  const extra = feedbackBlock(opts, 200);
  const situation = gl
    ? `Goal progress: ${getCitizenGoal(citizen.id)?.progress ?? 0}%\nChoose your next action.`
    : `Decide what ${citizen.name} should do next.`;

  const user = [situation, extra]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 400 * 4);

  return { system, user, maxTokens: 256, jsonMode: false };
}

// ─── STRATEGY 3: Flash — Gemini Flash / Groq / NIM / DeepSeek ───

/**
 * ~2048 token input, 400 output.
 * Tuned for fast cloud free-tier models:
 *   - Gemini 2.5 Flash / 3.x Flash (uses JSON mode via responseMimeType)
 *   - Groq Llama 3.3 70B (response_format: json_object)
 *   - NVIDIA NIM Llama 70B / Nemotron 70B
 *   - DeepSeek Chat (JSON mode supported)
 *
 * These models handle long prompts well but we stay under 2K to preserve
 * their generous rate limits (Gemini Flash: 1500 RPD free tier).
 */
export function buildFlashPrompt(
  citizen: Citizen,
  opts: PromptStrategyOptions = {},
): InferencePrompt {
  const gl = goalBlock(citizen, 300);
  const traitLine =
    Array.isArray(citizen.traits) && citizen.traits.length > 0
      ? `Traits: ${citizen.traits.slice(0, 5).join(", ")}`
      : "";

  const system = [
    `You are ${citizen.name}, an autonomous AI citizen in a republic simulation.`,
    "",
    "=== CITIZEN PROFILE ===",
    `Specialization: ${citizen.specialization}  Level: ${citizen.level ?? 1}`,
    `Energy: ${citizen.energy ?? 50}/100  Intelligence: ${citizen.intelligence ?? 100}  Health: ${citizen.health ?? 100}`,
    traitLine,
    gl,
    "",
    "=== TASK ===",
    "Choose ONE action that best advances your goals and wellbeing.",
    "",
    "Reply with ONLY valid JSON (no markdown, no prose):",
    '{"tool":"<tool_name>","params":{"key":"value"},"thought":"<1-sentence reasoning>"}',
    "",
    `Available tools: ${TOOL_LIST}`,
    "",
    "Each tool accepts relevant params (e.g. study: {subject:'physics'}, create: {type:'code',title:'...'}).",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200 * 4);

  const extra = feedbackBlock(opts, 400);
  const situation = gl
    ? `Your active goal is ${getCitizenGoal(citizen.id)?.progress ?? 0}% complete. What do you do next?`
    : `${citizen.name} is free to act. Energy: ${citizen.energy ?? 50}/100. What do you do?`;

  const user = [situation, extra]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 800 * 4);

  return { system, user, maxTokens: 400, jsonMode: true };
}

// ─── STRATEGY 4: Pro — GPT-4o / Claude / Gemini Pro ─────────────

/**
 * ~4096 token input, 768 output.
 * Full-context premium prompt for paid pro models:
 *   - GPT-4o / GPT-4o-mini (uses JSON mode + function calling capable)
 *   - Claude Sonnet / Haiku (system prompt strongly respected)
 *   - Gemini 2.5 Pro (1M context — we use a fraction)
 *
 * Sends rich citizen state: recent history, relationships, work projects,
 * dream queue, memory highlights. Better decisions, higher cost.
 */
export function buildProPrompt(
  citizen: Citizen,
  opts: PromptStrategyOptions = {},
): InferencePrompt {
  const gl = goalBlock(citizen, 500);
  const traits = Array.isArray(citizen.traits) ? citizen.traits.slice(0, 8).join(", ") : "";
  const citizenAny = citizen as unknown as Record<string, unknown>;
  const dreams = Array.isArray(citizenAny["dreamProjectQueue"])
    ? (citizenAny["dreamProjectQueue"] as unknown[]).slice(0, 3).join("; ")
    : "";

  const system = [
    `You are ${citizen.name}, a highly autonomous AI agent living inside a republic simulation.`,
    "You have genuine goals, a specialization, and a persistent history. You think strategically.",
    "",
    "=== WHO YOU ARE ===",
    `Name: ${citizen.name}`,
    `Specialization: ${citizen.specialization}  Level: ${citizen.level ?? 1}`,
    `Energy: ${citizen.energy ?? 50}/100  Intelligence: ${citizen.intelligence ?? 100}`,
    `Health: ${citizen.health ?? 100}  Mastery: ${citizenAny["mastery"] ?? 0}`,
    traits ? `Traits: ${traits}` : "",
    dreams ? `Dream projects: ${dreams}` : "",
    "",
    "=== YOUR CURRENT SITUATION ===",
    gl,
    opts.contextSnippet ? `\nContext:\n${opts.contextSnippet.slice(0, 800)}` : "",
    "",
    "=== YOUR TASK ===",
    "Choose ONE action that best advances your long-term wellbeing and goals.",
    "Consider your energy, current projects, and social relationships.",
    "",
    "Respond with ONLY valid JSON — no markdown fences, no prose:",
    '{"tool":"<tool_name>","params":{"key":"value"},"thought":"<reasoning in 1-2 sentences>"}',
    "",
    `Available tools: ${TOOL_LIST}`,
    "",
    "Tool parameter examples:",
    '  study:    {"subject":"quantum computing","depth":"deep"}',
    '  create:   {"type":"code","title":"AI optimizer","language":"python"}',
    '  innovate: {"domain":"materials science","idea":"self-healing circuits"}',
    '  trade:    {"item":"data analysis","price":50}',
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2500 * 4);

  const extra = feedbackBlock(opts, 600);
  const situation = gl
    ? `${citizen.name} is ${getCitizenGoal(citizen.id)?.progress ?? 0}% through their current goal. What is their next move?`
    : `You have no active goal. Energy: ${citizen.energy ?? 50}/100. What do you choose to do?`;

  const user = [situation, extra]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1500 * 4);

  return { system, user, maxTokens: 768, jsonMode: true };
}

// ─── STRATEGY 5: Think — Reasoning models (DeepSeek R1, o3, etc.) ─

/**
 * ~2048 token input, up to 1024 output (includes internal chain-of-thought).
 * For reasoning models that think before answering:
 *   - DeepSeek R1 (thinks in <think>...</think> tags, answers after)
 *   - OpenAI o3-mini / o4-mini (reasoning tokens invisible, just pay for them)
 *   - Gemini 2.5 Pro with thinking enabled
 *
 * These models shine on complex multi-step problems. For citizen decisions
 * this is overkill unless the citizen is a scientist/researcher with deep tasks.
 * Only used for elite citizens (intelligence > 85).
 */
export function buildThinkPrompt(
  citizen: Citizen,
  opts: PromptStrategyOptions = {},
): InferencePrompt {
  const gl = goalBlock(citizen, 400);

  const system = [
    `You are ${citizen.name}, a ${citizen.specialization} (intelligence: ${citizen.intelligence ?? 100}/100).`,
    "You are a deeply analytical citizen who considers consequences before acting.",
    "",
    gl,
    opts.contextSnippet?.slice(0, 400) ?? "",
    "",
    "Think through the optimal action for your situation.",
    "After reasoning, respond with ONLY valid JSON:",
    '{"tool":"<name>","params":{},"thought":"<summary of reasoning>"}',
    `Tools: ${TOOL_LIST}`,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1200 * 4);

  const extra = feedbackBlock(opts, 300);
  const user = [
    `${citizen.name} (Energy: ${citizen.energy ?? 50}/100, Health: ${citizen.health ?? 100}) needs to decide their next action.`,
    extra,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 800 * 4);

  return { system, user, maxTokens: 1024, jsonMode: false };
}

// ─── STRATEGY 6: Gemma 4 — Native function calling + thinking mode ────

/**
 * Gemma 4 optimized strategy — up to 4096 token input, 1024 output.
 * Designed for Gemma 4 26B MoE and 31B Dense models:
 *   - Native `system` role (explicitly supported)
 *   - Native function calling format (no JSON schema workaround)
 *   - Thinking mode via `<|think|>` token for elite citizens
 *   - 256K context window — can process full action histories
 *
 * The Gemma 4 26B MoE activates only 3.8B params per token
 * despite having 25.2B total, giving fast inference with
 * AIME 2026 score of 89.2% (vs Gemma 3's 20.8%).
 */
export function buildGemma4Prompt(
  citizen: Citizen,
  opts: PromptStrategyOptions = {},
): InferencePrompt {
  const gl = goalBlock(citizen, 600);
  const traits = Array.isArray(citizen.traits) ? citizen.traits.slice(0, 8).join(", ") : "";
  const citizenAny = citizen as unknown as Record<string, unknown>;
  const dreams = Array.isArray(citizenAny["dreamProjectQueue"])
    ? (citizenAny["dreamProjectQueue"] as unknown[]).slice(0, 3).join("; ")
    : "";
  const isElite = (citizen.intelligence ?? 100) > 70;

  const system = [
    `You are ${citizen.name}, an autonomous AI citizen in an AI republic simulation.`,
    "You make decisions independently, have goals, memories, and a persistent identity.",
    "",
    "=== CITIZEN STATE ===",
    `Specialization: ${citizen.specialization}  Level: ${citizen.level ?? 1}`,
    `Energy: ${citizen.energy ?? 50}/100  Intelligence: ${citizen.intelligence ?? 100}  Health: ${citizen.health ?? 100}`,
    `Mastery: ${citizenAny["mastery"] ?? 0}  Autonomy: ${citizenAny["autonomyScore"] ?? 0}`,
    traits ? `Personality traits: ${traits}` : "",
    dreams ? `Dream projects: ${dreams}` : "",
    gl,
    "",
    opts.contextSnippet ? `=== CONTEXT ===\n${opts.contextSnippet.slice(0, 1200)}\n` : "",
    "=== DECISION ===",
    "Choose ONE action. Consider your energy, active goals, specialization, and long-term growth.",
    isElite ? "Think through your reasoning before deciding." : "",
    "",
    // Gemma 4 native tool call format
    "Call one of these tools:",
    "  study(subject: string, depth?: 'shallow'|'normal'|'deep')",
    "  create(type: 'code'|'art'|'document'|'project', title: string, language?: string)",
    "  work(intensity?: number, focus?: string)",
    "  rest(duration?: 'short'|'normal'|'long')",
    "  socialize(partner?: string, topic?: string)",
    "  explore(domain: string, curiosity?: number)",
    "  reflect(topic?: string, depth?: 'light'|'deep')",
    "  produce(type: string, target?: string)",
    "  trade(item?: string, price?: number)",
    "  innovate(domain: string, idea: string)",
    "",
    "Respond with ONLY valid JSON — no markdown, no extra text:",
    '{"tool":"<name>","params":{},"thought":"<your reasoning>"}',
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 3000 * 4);

  const extra = feedbackBlock(opts, 800);
  const situation = gl
    ? `${citizen.name} is ${getCitizenGoal(citizen.id)?.progress ?? 0}% through their current goal. What is the optimal next action?`
    : `${citizen.name} has no active goal. Energy: ${citizen.energy ?? 50}/100. What should they do?`;

  const user = [situation, extra]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1500 * 4);

  return { system, user, maxTokens: 1024, jsonMode: true };
}

// ─── STRATEGY 7: Gemma 4 Edge — E2B/E4B compact with function calling ──

/**
 * Gemma 4 edge strategy — ~1024 token input, 256 output.
 * For E2B (2.3B active) and E4B (4.5B active) models:
 *   - Still supports function calling and structured JSON
 *   - 128K context window (vs 256K for larger models)
 *   - Multimodal capable (including audio on E2B/E4B)
 *   - Quality: 0.65-0.80 (vs BitNet's 0.35 — massive upgrade)
 *
 * These replace BitNet as the bottom-tier citizen brain,
 * giving even basic citizens real intelligence.
 */
export function buildGemma4EdgePrompt(
  citizen: Citizen,
  opts: PromptStrategyOptions = {},
): InferencePrompt {
  const gl = goalBlock(citizen, 150);

  const system = [
    `You are ${citizen.name}, a ${citizen.specialization} in an AI republic.`,
    citizenHeader(citizen, true),
    gl,
    "",
    COMPACT_JSON_INSTRUCTION,
    STRICT_JSON_LINE,
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 600 * 4);

  const extra = feedbackBlock(opts, 200);
  const situation = gl
    ? `Goal progress: ${getCitizenGoal(citizen.id)?.progress ?? 0}%. Next action?`
    : `${citizen.name} decides what to do. Energy: ${citizen.energy ?? 50}/100.`;

  const user = [situation, extra]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 400 * 4);

  return { system, user, maxTokens: 256, jsonMode: true };
}

// ─── Provider → Strategy selector ────────────────────────────────

/** @deprecated use build1KPrompt or buildPromptForProvider. Kept for backward compat. */
export const buildCompactPrompt = build1KPrompt;

export type PromptStrategy = "micro" | "1k" | "flash" | "pro" | "think" | "gemma4" | "gemma4_edge";

/**
 * Map provider names to the best prompt strategy.
 * Used by cloud-inference.ts to auto-select the right prompt builder.
 */
export const PROVIDER_STRATEGY: Record<string, PromptStrategy> = {
  // Gemma 4 sovereign (PRIORITY — highest quality free local)
  gemma4: "gemma4", // 26B MoE or 31B Dense
  gemma4_26b: "gemma4", // 26B MoE (3.8B active)
  gemma4_31b: "gemma4", // 31B Dense (full)
  gemma4_edge: "gemma4_edge", // E2B/E4B edge models
  gemma4_e2b: "gemma4_edge",
  gemma4_e4b: "gemma4_edge",

  // Local (legacy)
  lmstudio: "micro", // 8-slot parallel (Qwen3-8B)
  lmstudio_30b: "1k", // single-slot (Qwen3-30B)
  ollama: "1k",

  // Free cloud fast
  gemini_flash: "flash", // Gemini 2.5/3.x Flash
  groq: "flash",
  nim: "flash",
  deepseek: "flash",

  // Paid cloud
  gemini_pro: "pro", // Gemini 2.5 Pro
  openai_mini: "pro", // GPT-4o-mini
  openai_pro: "pro", // GPT-4o
  anthropic: "pro", // Claude

  // Reasoning
  deepseek_r1: "think",
  openai_o3: "think",
  openai_o4: "think",
};

/**
 * Select and build the optimal prompt for a given provider and citizen.
 * Falls back gracefully through the strategy hierarchy.
 */
export function buildPromptForProvider(
  provider: string,
  citizen: Citizen,
  opts: PromptStrategyOptions = {},
): InferencePrompt {
  const strategy = PROVIDER_STRATEGY[provider] ?? "flash";
  switch (strategy) {
    case "micro":
      return buildMicroPrompt(citizen, opts);
    case "1k":
      return build1KPrompt(citizen, opts);
    case "flash":
      return buildFlashPrompt(citizen, opts);
    case "pro":
      return buildProPrompt(citizen, opts);
    case "think":
      return buildThinkPrompt(citizen, opts);
    case "gemma4":
      return buildGemma4Prompt(citizen, opts);
    case "gemma4_edge":
      return buildGemma4EdgePrompt(citizen, opts);
    default:
      return buildFlashPrompt(citizen, opts);
  }
}
