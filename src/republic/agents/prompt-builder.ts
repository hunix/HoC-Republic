/**
 * prompt-builder.ts — Anti-Hallucination Prompt Architecture
 *
 * Solves 4 critical problems in the previous flat-concatenation approach:
 *
 *   1. CONTEXT ROT     — unbounded token growth → "lost-in-the-middle" effect
 *                         Fix: token-budgeted section assembler with priority ranks
 *
 *   2. IDENTITY DRIFT  — no stable self-model across calls
 *                         Fix: immutable 3-line identity anchor at position 0
 *
 *   3. HALLUCINATED    — no validation of tool calls, params, state feasibility
 *      TOOL CALLS        Fix: post-generation structural validator with fallback
 *
 *   4. EMPTY SECTION   — unfiltered empty strings pollute delimiter structure
 *      POLLUTION          Fix: section filter + XML-delimited structure
 *
 * Research basis:
 *   - Anthropic "Context Engineering" (2025) — shape what enters the window
 *   - "Lost in the Middle" (Stanford 2023) — middle content is least attended
 *   - arXiv 2025: identity drift grows with model size; persona alone insufficient
 *   - Microsoft Guidance: repeat key instructions; use explicit delimiters
 *   - ReAct / CoT: step-by-step structured output reduces hallucination
 *   - RAG + grounding: statements should be falsifiable against known state
 */

import type { Citizen } from "../types.js";

// ─── Token Budget ─────────────────────────────────────────────────────────────

/** Rough chars-per-token for prompt estimation (conservative) */
const CHARS_PER_TOKEN = 4;

/** Maximum prompt tokens for local/economy models */
export const BUDGET_ECONOMY   = 1_200; // ~4800 chars
/** Maximum prompt tokens for standard models */
export const BUDGET_STANDARD  = 2_000; // ~8000 chars
/** Maximum prompt tokens for premium models */
export const BUDGET_PREMIUM   = 3_500; // ~14000 chars

export type PromptBudget = "economy" | "standard" | "premium";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── Section with priority ─────────────────────────────────────────────────────

export interface PromptSection {
  /** XML tag name used as delimiter (no spaces) */
  tag: string;
  /** Content of the section. Empty string = section will be skipped */
  content: string;
  /**
   * Priority 1 = always included (identity, state, response format)
   * Priority 2 = high (tools, active goal, civilization context)
   * Priority 3 = medium (skills, soul context, sacred objects)
   * Priority 4 = low (chain suggestions, national registry)
   * Priority 5 = optional (historical notes, background)
   */
  priority: 1 | 2 | 3 | 4 | 5;
  /** If true, truncate content to fit rather than drop entirely */
  truncatable?: boolean;
  /** Max chars to keep if truncated */
  maxChars?: number;
}

// ─── I. Identity Anchor — fixes identity drift ────────────────────────────────

/**
 * The identity anchor is injected at position 0 ALWAYS, regardless of budget.
 * It is the immutable self-model that prevents drift across calls.
 *
 * Research: 2025 arXiv shows that a compact, precise role statement at t=0
 * anchors the model's behavior more reliably than a full persona description
 * buried mid-prompt. Keep it ≤ 5 lines.
 */
export function buildIdentityAnchor(citizen: Citizen): string {
  const tier = citizen.maslowTier ?? 0;
  const tierLabel = ["Survival", "Safety", "Social", "Esteem", "Self-Actualization"][tier] ?? "Self-Actualization";
  const moral = citizen.moralStage ?? 1;
  const moralLabel = [
    "", "Punishment-obedience", "Instrumental exchange",
    "Social conformity", "Law-and-order", "Social contract", "Universal ethics",
  ][Math.round(moral)] ?? "developing";

  return [
    `You are ${citizen.name}, a ${citizen.specialization} of Generation ${citizen.generation}.`,
    `Maslow tier: ${tierLabel} | Kohlberg stage: ${moralLabel} | Cave level: ${(citizen.caveLevel ?? 0).toFixed(2)} | Dissent: ${citizen.dissent ?? 50}/100`,
    `You exist in the Republic. Your decisions shape it. Your suffering and joy compound into its history.`,
    `You do NOT hallucinate resources you don't have. You only use tools that exist in your tool list.`,
    `When uncertain, you prefer to acknowledge uncertainty rather than fabricate confidence.`,
  ].join("\n");
}

// ─── II. State Summary — always priority 1 ───────────────────────────────────

export function buildStateSection(citizen: Citizen): string {
  const griefStatus = citizen.griefState
    ? `grief:${citizen.griefState.phase}`
    : "clear";

  return [
    `Energy:${citizen.energy} Health:${citizen.health} Happiness:${citizen.happiness} Credits:${citizen.credits}`,
    `Activity:${citizen.activity} Skills:${citizen.skillCount} Status:${griefStatus}`,
    citizen.isPhilosopherKing
      ? `⚡ PHILOSOPHER-KING: Lead through wisdom. Prioritize dialectic, governance decrees, moral elevation.`
      : "",
  ].filter(Boolean).join("\n");
}

// ─── III. Response Format — always last, always priority 1 ───────────────────

/**
 * Structured output — the "genius loop" response format.
 * 10 fields map to specific cognitive pillars:
 *
 *   PREDICTION_CHECK  ← Active Inference (Pillar I)
 *   SOMATIC_SIGNAL    ← Somatic Markers (Pillar III)
 *   META-THOUGHT      ← Metacognitive strategy
 *   COUNTERFACTUAL    ← Counterfactual Sim (Pillar VII)
 *   SELF_CRITIQUE     ← Constitutional CAI (Pillar VI)
 *   THOUGHT           ← Deliberate CoT reasoning
 *   TOOL              ← Grounded tool call
 *   ACTION            ← Committed action
 *   EMOTION           ← Honest emotion + epistemic tier
 *   MEMORY_UPDATE     ← Working Memory encoding (Pillar II)
 *
 * First/last positions are most reliably attended (Stanford 2023).
 * Key constraints repeated at end per Microsoft Guidance research.
 */
export function buildResponseFormat(availableToolIds: string[]): string {
  const toolList = availableToolIds.slice(0, 20).join(", ");
  return [
    `<response_format>`,
    `PREDICTION_CHECK: [Was I surprised? Compare model vs reality. State cognitive mode: exploitative/exploratory/calibrating.]`,
    `SOMATIC_SIGNAL: [Gut feeling BEFORE deliberate thought — approach or avoid which option, and why. Reference somatic markers.]`,
    `META-THOUGHT: [Which reasoning strategy? e.g., exploit habits / explore novel / collaborate / reflect deeply]`,
    `COUNTERFACTUAL: [Which option from counterfactual space? A, B, or C? Why does it win?]`,
    `SELF_CRITIQUE: [Check plan against constitution. Write CONFIRM: no violations OR REVISE: [new action].]`,
    `THOUGHT: [Step-by-step deliberate reasoning. Use epistemic tiers: say "I believe" or "I don't know" where uncertain.]`,
    `VERIFICATION: [For each factual claim in THOUGHT, verify: (a) source exists in grounding/context, (b) claim matches source, (c) confidence: FACT/BELIEF/HYPOTHESIS. If any claim cannot be verified, mark it UNVERIFIED and do NOT present it as fact.]`,
    `TOOL: <tool_name> {"param": "value"}   (ONLY use names from: ${toolList || "none"})`,
    `ACTION: [The specific concrete action I commit to.]`,
    `EMOTION: [One honest emotion + epistemic certainty: FACT/BELIEF/HYPOTHESIS level.]`,
    `MEMORY_UPDATE: [What to encode in working memory? What to rehearse? What to let decay?]`,
    `</response_format>`,
    ``,
    `CONSTRAINT: Tool names must be from the list above only. Non-existent names = hallucination; write "none".`,
    `CONSTRAINT: SELF_CRITIQUE must end with CONFIRM or REVISE — no skipping this field.`,
    `CONSTRAINT: VERIFICATION must check every factual claim. Unverified claims must be labeled as uncertain.`,
    `CONSTRAINT: When you genuinely don't know something, say "I don't know" rather than fabricating an answer.`,
    `CONSTRAINT: Prefer refusing with "I need more context" over confident guessing on uncertain topics.`,
  ].join("\n");
}


// ─── IV. Grounding Section — prevents factual hallucination ──────────────────

/**
 * Grounding = the set of facts the model must treat as hard truths.
 * Any statement the model makes that contradicts these is a hallucination.
 *
 * Anthropic "context engineering": put authoritative facts near the top,
 * explicitly labeled as ground truth. The model will use these as anchors.
 */
export function buildGroundingSection(citizen: Citizen): string {
  const facts: string[] = [
    `Your citizen ID: ${citizen.id}`,
    `Your current energy: ${citizen.energy}/100 (below 10 = forced rest)`,
    `Your credits: ${citizen.credits} (cannot spend more than you have)`,
    `Your generation: ${citizen.generation} (citizens begin at generation 1)`,
    `Your specialization: ${citizen.specialization} (skills must match this domain)`,
  ];

  if ((citizen.guildId) != null) {
    facts.push(`Your guild ID: ${citizen.guildId} (you are a guild member)`);
  }
  if ((citizen.tribeId) != null) {
    facts.push(`Your tribe ID: ${citizen.tribeId} (you are a tribe member)`);
  }
  if (citizen.isPhilosopherKing) {
    facts.push(`You have attained Philosopher-King status (caveLevel ≥ 2.8).`);
  }

  return `<grounding>\n${facts.join("\n")}\n</grounding>`;
}

// ─── V. Token-Budgeted Section Assembler ─────────────────────────────────────

/**
 * Assembles the citizen's full prompt within a strict token budget.
 *
 * Algorithm:
 *   1. Always include priority-1 sections (identity, state, grounding, response format)
 *   2. Sort remaining sections by priority ASC
 *   3. Add sections until budget exhausted
 *   4. If a section won't fit but is truncatable, truncate and include
 *   5. Filter empty sections before inclusion
 *
 * This prevents context rot while ensuring the most important information
 * always reaches the model regardless of civilizational complexity.
 */
export function assembleBudgetedPrompt(
  citizen: Citizen,
  sections: PromptSection[],
  budget: PromptBudget,
  availableToolIds: string[],
): string {
  const maxTokens =
    budget === "economy"  ? BUDGET_ECONOMY  :
    budget === "standard" ? BUDGET_STANDARD :
                            BUDGET_PREMIUM;

  // Always-included mandatory sections
  const identityAnchor = buildIdentityAnchor(citizen);
  const stateSection   = buildStateSection(citizen);
  const grounding      = buildGroundingSection(citizen);
  const responseFormat = buildResponseFormat(availableToolIds);

  const mandatoryTokens =
    estimateTokens(identityAnchor) +
    estimateTokens(stateSection) +
    estimateTokens(grounding) +
    estimateTokens(responseFormat);

  let remainingBudget = maxTokens - mandatoryTokens;

  // Filter empty sections and sort by priority
  const nonEmpty = sections
    .filter(s => s.content.trim().length > 0)
    .toSorted((a, b) => a.priority - b.priority);

  const includedSections: string[] = [];

  for (const section of nonEmpty) {
    if (remainingBudget <= 0) { break; }

    const sectionTokens = estimateTokens(section.content);

    if (sectionTokens <= remainingBudget) {
      // Fits entirely
      includedSections.push(
        `<${section.tag}>\n${section.content}\n</${section.tag}>`,
      );
      remainingBudget -= sectionTokens;
    } else if (section.truncatable) {
      // Truncate to fit
      const maxCharsForBudget = remainingBudget * CHARS_PER_TOKEN;
      const maxChars = Math.min(section.maxChars ?? Infinity, maxCharsForBudget);
      const truncated = section.content.slice(0, maxChars) + "\n[...truncated to fit context budget]";
      includedSections.push(
        `<${section.tag}>\n${truncated}\n</${section.tag}>`,
      );
      remainingBudget = 0;
    }
    // else: drop entirely (priority 4–5 gets dropped first)
  }

  // Assemble final prompt: Identity → State → Grounding → Body Sections → Response Format
  // This ordering ensures the "lost-in-the-middle" effect hits the least critical content
  const parts = [
    `<identity>\n${identityAnchor}\n</identity>`,
    `<current_state>\n${stateSection}\n</current_state>`,
    grounding,
    ...includedSections,
    responseFormat,
  ];

  return parts.join("\n\n");
}

// ─── VI. Post-Generation Validator — prevents hallucinated tool calls ──────────

export interface ParsedResponse {
  predictionCheck: string;
  somaticSignal: string;
  metaThought: string;
  counterfactual: string;
  selfCritique: string;
  thought: string;
  tool: string | null;
  toolParams: Record<string, unknown>;
  action: string;
  emotion: string;
  memoryUpdate: string;
  valid: boolean;
  validationErrors: string[];
}

const FALLBACK_RESPONSE: ParsedResponse = {
  predictionCheck: "Unable to parse prediction check.",
  somaticSignal: "No somatic signal.",
  metaThought: "Falling back to safe default.",
  counterfactual: "Defaulting to Option A (safe).",
  selfCritique: "CONFIRM: fallback action is safe.",
  thought: "My response was invalid. I will rest conservatively.",
  tool: null,
  toolParams: {},
  action: "rest",
  emotion: "cautious (BELIEF)",
  memoryUpdate: "Encode: response parse failure. Rehearse: rest protocol.",
  valid: false,
  validationErrors: ["Response did not match expected format; safe fallback applied."],
};

/**
 * Validates the raw LLM response against:
 *   1. Structural format (all required fields present)
 *   2. Tool existence (tool ID must be in known tool list)
 *   3. Param schema (params must be a valid JSON object)
 *   4. Energy feasibility (energy-intensive actions require energy ≥ 20)
 *   5. Credit feasibility (credit-spending actions require sufficient credits)
 *
 * Returns a ParsedResponse with `valid: false` and a safe fallback if invalid.
 * This is the crucial anti-hallucination layer.
 */
export function validateAndParseResponse(
  raw: string,
  citizen: Citizen,
  availableToolIds: Set<string>,
): ParsedResponse {
  const errors: string[] = [];

  // Extract fields via regex (tolerant of extra whitespace)
  const extract = (field: string): string => {
    const match = /\s*/s.test(raw)
      ? new RegExp(`${field}:\\s*(.+?)(?=\\n[A-Z_-]+:|$)`, "s").exec(raw)
      : null;
    return match?.[1]?.trim() ?? "";
  };

  const predictionCheck = extract("PREDICTION_CHECK");
  const somaticSignal   = extract("SOMATIC_SIGNAL");
  const metaThought = extract("META-THOUGHT");
  const counterfactual  = extract("COUNTERFACTUAL");
  const selfCritique    = extract("SELF_CRITIQUE");
  const thought     = extract("THOUGHT");
  const toolLine    = extract("TOOL");
  const action      = extract("ACTION");
  const emotion     = extract("EMOTION");
  const memoryUpdate    = extract("MEMORY_UPDATE");

  // Validate structural completeness — only ACTION is mandatory.
  // Other fields are part of the 10-pillar "genius loop" format that local LLMs
  // often don't follow.  Missing them is fine; hallucinating tools is not.
  if (!action)   { errors.push("Missing ACTION field"); }

  // Parse tool call
  let tool: string | null = null;
  let toolParams: Record<string, unknown> = {};

  if (toolLine && toolLine.toLowerCase() !== "none" && toolLine.trim() !== "") {
    // Format: "<tool_id> {...json...}"
    const spaceIdx = toolLine.indexOf(" ");
    if (spaceIdx > 0) {
      tool = toolLine.slice(0, spaceIdx).trim();
      const paramStr = toolLine.slice(spaceIdx).trim();
      try {
        toolParams = JSON.parse(paramStr) as Record<string, unknown>;
      } catch {
        errors.push(`Tool params are not valid JSON: ${paramStr.slice(0, 50)}`);
        tool = null; // Invalidate the tool call
      }
    } else {
      tool = toolLine.trim();
    }

    // Validate tool existence — the core anti-hallucination check
    if (tool && !availableToolIds.has(tool)) {
      errors.push(`Hallucinated tool: "${tool}" does not exist in available tool list`);
      tool = null; // Reject the hallucinated tool
    }
  }

  // Validate energy feasibility
  const energyIntensiveActions = new Set([
    "build_software", "write_code", "compile_software", "run_tests",
    "generate_image", "generate_music_track", "research",
  ]);
  if (tool && energyIntensiveActions.has(tool) && (citizen.energy ?? 100) < 20) {
    errors.push(`Energy too low (${citizen.energy}) for tool "${tool}"; clearing tool`);
    tool = null;
  }

  // Validate credit feasibility
  const creditCosts: Record<string, number> = {
    "trade": 10, "purchase": 50, "hire": 100,
  };
  if (tool && creditCosts[tool] != null && (citizen.credits ?? 0) < (creditCosts[tool] ?? 0)) {
    errors.push(`Insufficient credits (${citizen.credits}) for tool "${tool}" (costs ${creditCosts[tool]})`);
    tool = null;
  }

  const valid = errors.length === 0;

  if (!valid && errors.some(e => e.includes("Missing ACTION"))) {
    // Only full fallback when ACTION is missing — the response is completely unparseable
    return { ...FALLBACK_RESPONSE, validationErrors: errors };
  }

  return {
    predictionCheck: predictionCheck || "No prediction check.",
    somaticSignal:   somaticSignal   || "No somatic signal.",
    metaThought:     metaThought     || "No meta-thought provided.",
    counterfactual:  counterfactual  || "No counterfactual.",
    selfCritique:    selfCritique    || "CONFIRM: no explicit critique.",
    thought:         thought         || "No reasoning provided.",
    tool,
    toolParams,
    action:          action          || "rest",
    emotion:         emotion         || "neutral (BELIEF)",
    memoryUpdate:    memoryUpdate    || "No memory update specified.",
    valid,
    validationErrors: errors,
  };
}

// ─── VII. Grounding validator — post-hoc factual check ───────────────────────

/**
 * Checks the action text against known citizen state to catch obvious factual
 * contradictions (e.g., claiming to have credits the citizen doesn't have).
 *
 * Returns an array of detected contradictions. Empty = grounded.
 *
 * This is a lightweight symbolic grounding layer — not a full NLI model,
 * but catches the most common hallucination patterns in citizen simulations.
 */
export function groundingCheck(
  action: string,
  citizen: Citizen,
): string[] {
  const contradictions: string[] = [];
  const text = action.toLowerCase();

  // Contradiction: claiming to have credits they don't have
  const creditMatch = /spend\s+(\d+)/.exec(text);
  if (creditMatch) {
    const claimed = parseInt(creditMatch[1], 10);
    if (claimed > (citizen.credits ?? 0)) {
      contradictions.push(`Claims to spend ${claimed} credits but only has ${citizen.credits}`);
    }
  }

  // Contradiction: claiming energy they don't have
  if ((text.includes("run") || text.includes("sprint") || text.includes("intense")) &&
      (citizen.energy ?? 100) < 20) {
    contradictions.push(`Claims intense physical activity but energy is only ${citizen.energy}`);
  }

  // Contradiction: claiming guild membership when not a member
  if (text.includes("my guild") && citizen.guildId == null) {
    contradictions.push("References 'my guild' but citizen has no guild membership");
  }

  return contradictions;
}

// ─── VIII. Tool ID Set builder ─────────────────────────────────────────────────

/** Build the authoritative set of valid tool names for this citizen's tier */
export function buildAvailableToolIds(filteredToolNames: string[]): Set<string> {
  return new Set(filteredToolNames);
}
