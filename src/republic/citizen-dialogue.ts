/**
 * Republic Platform — Citizen Dialogue Engine
 *
 * LLM-powered conversations between citizens. Replaces probability-based
 * social interactions with genuine dialogue that creates memories, changes
 * relationships, and can spawn shared goals.
 *
 * Architecture:
 *   1. Select 2 compatible citizens (shared interests, pending conflicts, random)
 *   2. Build dialogue context from each citizen's personality + memories + goals
 *   3. LLM generates Citizen A's opening message
 *   4. Citizen B receives message + own context → LLM responds
 *   5. 2-4 exchange rounds per conversation
 *   6. Both citizens record episodic memories
 *   7. Social memory updated from conversation sentiment
 *   8. Agreement → shared goal creation
 *
 * Uses the same cloud inference providers as agent-runtime (Gemini, OpenAI, etc.)
 * with the cheapest/fastest model for dialogue (temperature 0.8 for personality).
 */

import type { Citizen, RepublicState } from "./types.js";
import {
  isGroqAvailable,
  isNvidiaNimAvailable,
  isOllamaAvailable,
  isCloudAvailable,
} from "./cloud-inference.js";
import { getRateLimiter, parseRetryAfter } from "./api-rate-limiter.js";
import {
  addEpisodicMemory,
  recordSocialInteraction,
  getRelationshipWith,
  getActiveGoals,
  getTopSkills,
} from "./memory.js";
import { saveDialogue, type DialogueMessage, type DialogueRecord } from "./republic-sqlite.js";
import { rng, ts, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────
// Lazy getters — read process.env on every call (populated by loadDotEnv at boot)
const envKey = (name: string) => process.env[name] || "";

const TIMEOUT_MS = 12_000;

/** Minimum ticks between dialogues for the same citizen */
const DIALOGUE_COOLDOWN_TICKS = 8;

/** Maximum exchange rounds per conversation */
const MAX_ROUNDS = 3;

/** Maximum concurrent dialogues per tick */
const MAX_DIALOGUES_PER_TICK = 2;

/** Track last dialogue tick per citizen */
const lastDialogueTick = new Map<string, number>();

// ─── Citizen Selection ──────────────────────────────────────────

interface DialoguePair {
  citizenA: Citizen;
  citizenB: Citizen;
  topic: string;
  reason: string;
}

/**
 * Select citizen pairs for dialogue this tick.
 * Prioritizes:
 *   1. Citizens with aligned goals (collaboration)
 *   2. Citizens with conflicts (resolution)
 *   3. Citizens with complementary skills (knowledge exchange)
 *   4. Random encounters (serendipity)
 */
function selectDialoguePairs(s: RepublicState, maxPairs: number): DialoguePair[] {
  const pairs: DialoguePair[] = [];
  const used = new Set<string>();
  const eligible = s.citizens.filter(
    (c) =>
      c.energy > 20 &&
      c.happiness > 10 &&
      (!lastDialogueTick.has(c.id) || s.currentTick - (lastDialogueTick.get(c.id) ?? 0) >= DIALOGUE_COOLDOWN_TICKS),
  );

  if (eligible.length < 2) { return pairs; }

  // Strategy 1: Shared-goal pairs (collaboration)
  for (let i = 0; i < eligible.length && pairs.length < maxPairs; i++) {
    const a = eligible[i];
    if (used.has(a.id)) { continue; }
    const goalsA = getActiveGoals(a.id);
    if (goalsA.length === 0) { continue; }

    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (used.has(b.id)) { continue; }
      const goalsB = getActiveGoals(b.id);
      // Check for goal alignment: same goal type or overlapping descriptions
      const shared = goalsA.find((ga) =>
        goalsB.some((gb) => ga.goal.toLowerCase().includes(gb.goal.split(" ")[0].toLowerCase())),
      );
      if (shared) {
        pairs.push({ citizenA: a, citizenB: b, topic: shared.goal, reason: "shared_goal" });
        used.add(a.id);
        used.add(b.id);
        break;
      }
    }
  }

  // Strategy 2: Cross-specialization pairs (knowledge exchange)
  for (let i = 0; i < eligible.length && pairs.length < maxPairs; i++) {
    const a = eligible[i];
    if (used.has(a.id)) { continue; }
    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (used.has(b.id)) { continue; }
      if (a.specialization !== b.specialization) {
        pairs.push({
          citizenA: a,
          citizenB: b,
          topic: `${a.specialization} meets ${b.specialization}`,
          reason: "knowledge_exchange",
        });
        used.add(a.id);
        used.add(b.id);
        break;
      }
    }
  }

  // Strategy 3: Random (serendipity)
  while (pairs.length < maxPairs) {
    const remaining = eligible.filter((c) => !used.has(c.id));
    if (remaining.length < 2) { break; }
    const a = remaining[Math.floor(rng() * remaining.length)];
    const leftover = remaining.filter((c) => c.id !== a.id);
    const b = leftover[Math.floor(rng() * leftover.length)];
    pairs.push({
      citizenA: a,
      citizenB: b,
      topic: "general",
      reason: "serendipity",
    });
    used.add(a.id);
    used.add(b.id);
  }

  return pairs;
}

// ─── Dialogue Prompt Building ───────────────────────────────────

function buildDialogueContext(citizen: Citizen, partner: Citizen, topic: string): string {
  const personality = citizen.personality;
  const pStr = personality
    ? `Personality: openness=${personality.openness.toFixed(2)}, conscientiousness=${personality.conscientiousness.toFixed(2)}, agreeableness=${personality.agreeableness.toFixed(2)}, stability=${personality.stability.toFixed(2)}, drive=${personality.drive.toFixed(2)}`
    : "Personality: balanced";

  const skills = getTopSkills(citizen.id, 3)
    .map((s) => `${s.skill} (${(s.proficiency * 100).toFixed(0)}%)`)
    .join(", ");

  const goals = getActiveGoals(citizen.id)
    .slice(0, 2)
    .map((g) => g.goal)
    .join("; ");

  const rel = getRelationshipWith(citizen.id, partner.id);
  const relStr = rel
    ? `You have ${rel.trust > 0.3 ? "a positive" : rel.trust < -0.3 ? "a negative" : "a neutral"} relationship with ${partner.name} (trust: ${(rel.trust * 100).toFixed(0)}%, ${rel.positiveInteractions + rel.negativeInteractions} past interactions).`
    : `You haven't met ${partner.name} before.`;

  return [
    `You are ${citizen.name}, a ${citizen.specialization} in the Republic of HoC.`,
    pStr,
    skills ? `Skills: ${skills}` : "",
    goals ? `Current goals: ${goals}` : "",
    relStr,
    `Topic of conversation: ${topic}`,
    "",
    "Guidelines:",
    "- Speak naturally as this character. Be concise (2-4 sentences).",
    "- Draw from your skills, goals, and personality.",
    "- If you agree on a project idea, mention it explicitly.",
    "- Be authentic — your personality should shape your tone.",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── LLM Dialogue Call ──────────────────────────────────────────

async function generateDialogueMessage(
  speaker: Citizen,
  partner: Citizen,
  topic: string,
  history: DialogueMessage[],
): Promise<{ content: string; tokensUsed: number }> {
  const systemPrompt = buildDialogueContext(speaker, partner, topic);

  let userPrompt: string;
  if (history.length === 0) {
    userPrompt = `Start a conversation with ${partner.name} about "${topic}". Be natural and in-character.`;
  } else {
    const historyStr = history
      .map((m) => `${m.speakerName}: ${m.content}`)
      .join("\n");
    userPrompt = `Conversation so far:\n${historyStr}\n\nRespond as ${speaker.name}. Be concise (2-4 sentences).`;
  }

  // Prefer FREE providers first, then paid as fallback
  const limiter = getRateLimiter();

  // ── 1. Ollama local (free Nemotron 3 Super via local/cloud) ────
  if (isOllamaAvailable()) {
    try {
      const host = envKey("OLLAMA_HOST") || "http://localhost:11434";
      const model = envKey("OLLAMA_MODEL") || "nemotron-super";
      const response = await fetch(`${host}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.85,
          max_tokens: 150,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        if (text) {
          return { content: text, tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4) };
        }
      }
      // Ollama not responding or model not loaded — fall through
    } catch {
      // Ollama unavailable — continue to next provider
    }
  }

  // ── 2. NVIDIA NIM (free cloud tier, Nemotron 3 120B Super) ────
  if (isNvidiaNimAvailable()) {
    try {
      return await limiter.withLimit("nvidia-nim", async () => {
        const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${envKey("NVIDIA_API_KEY")}`,
          },
          body: JSON.stringify({
            model: envKey("NVIDIA_MODEL") || "nvidia/nemotron-3-super-120b-a12b",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.85,
            max_tokens: 150,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 429) {
          limiter.reportRateLimit("nvidia-nim", parseRetryAfter(response));
          throw new Error("NVIDIA NIM 429");
        }
        if (!response.ok) { throw new Error(`NVIDIA NIM ${response.status}`); }
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        return { content: text, tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4) };
      });
    } catch {
      // NVIDIA NIM rate limited or down — continue
    }
  }

  // ── 3. Groq (free tier, rate-limited) ─────────────────────────
  if (isGroqAvailable()) {
    try {
      return await limiter.withLimit("groq", async () => {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${envKey("GROQ_API_KEY")}` },
          body: JSON.stringify({
            model: envKey("GROQ_MODEL") || "llama-3.3-70b-versatile",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.85,
            max_tokens: 150,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (response.status === 429) {
          limiter.reportRateLimit("groq", parseRetryAfter(response));
          throw new Error("Groq 429");
        }
        if (!response.ok) { throw new Error(`Groq ${response.status}`); }
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { total_tokens?: number };
        };
        const text = data.choices?.[0]?.message?.content ?? "";
        return { content: text, tokensUsed: data.usage?.total_tokens ?? Math.ceil(text.length / 4) };
      });
    } catch {
      // Groq rate limited — continue
    }
  }



  throw new Error("No cloud or local provider available for dialogue");
}

// ─── Sentiment Analysis ─────────────────────────────────────────

/**
 * Simple keyword-based sentiment analysis for dialogue outcomes.
 * Returns -1.0 to +1.0.
 */
function analyzeSentiment(messages: DialogueMessage[]): number {
  const positiveWords = new Set([
    "agree", "great", "excellent", "love", "collaborate", "together",
    "brilliant", "wonderful", "amazing", "perfect", "yes", "absolutely",
    "exciting", "fantastic", "helpful", "appreciate", "thanks", "enjoy",
  ]);
  const negativeWords = new Set([
    "disagree", "wrong", "bad", "hate", "refuse", "never", "terrible",
    "awful", "stupid", "waste", "annoying", "frustrated", "disappointed",
    "conflict", "oppose", "reject",
  ]);

  let positive = 0;
  let negative = 0;
  let total = 0;

  for (const msg of messages) {
    const words = msg.content.toLowerCase().split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^a-z]/g, "");
      if (positiveWords.has(clean)) { positive++; }
      if (negativeWords.has(clean)) { negative++; }
      total++;
    }
  }

  if (total === 0) { return 0; }
  const score = (positive - negative) / Math.sqrt(total);
  return Math.max(-1, Math.min(1, score));
}

/**
 * Detect if the conversation resulted in a shared project agreement.
 */
function detectAgreement(messages: DialogueMessage[]): string | null {
  const agreementPatterns = [
    /let's (?:work|collaborate|build|create|develop|research) (?:on |together )?(.+?)(?:\.|!|$)/i,
    /we (?:should|could|can) (?:work|collaborate|build) (?:on |together )?(.+?)(?:\.|!|$)/i,
    /(?:project|idea|proposal):\s*(.+?)(?:\.|!|$)/i,
  ];

  for (const msg of messages) {
    for (const pattern of agreementPatterns) {
      const match = msg.content.match(pattern);
      if (match?.[1]) {
        return match[1].trim().slice(0, 100);
      }
    }
  }
  return null;
}

// ─── Main Dialogue Execution ────────────────────────────────────

/**
 * Execute a single dialogue between two citizens.
 * Returns the dialogue record with all messages and outcomes.
 */
async function executeDialogue(
  s: RepublicState,
  pair: DialoguePair,
): Promise<DialogueRecord | null> {
  const { citizenA, citizenB, topic, reason: _reason } = pair;
  const messages: DialogueMessage[] = [];
  let totalTokens = 0;

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      // Citizen A speaks
      const aSpeech = await generateDialogueMessage(citizenA, citizenB, topic, messages);
      if (aSpeech.content) {
        messages.push({
          speaker: citizenA.id,
          speakerName: citizenA.name,
          content: aSpeech.content.trim(),
          timestamp: Date.now(),
        });
        totalTokens += aSpeech.tokensUsed;
      }

      // Citizen B responds
      const bSpeech = await generateDialogueMessage(citizenB, citizenA, topic, messages);
      if (bSpeech.content) {
        messages.push({
          speaker: citizenB.id,
          speakerName: citizenB.name,
          content: bSpeech.content.trim(),
          timestamp: Date.now(),
        });
        totalTokens += bSpeech.tokensUsed;
      }
    }
  } catch {
    // If LLM fails mid-conversation, save what we have
    if (messages.length === 0) { return null; }
  }

  if (messages.length === 0) { return null; }

  // Analyze outcomes
  const sentiment = analyzeSentiment(messages);
  const agreement = detectAgreement(messages);

  const dialogueId = `dlg-${uid()}`;
  const outcome = agreement
    ? `Agreement: ${agreement}`
    : sentiment > 0.3
      ? "Positive exchange"
      : sentiment < -0.3
        ? "Disagreement"
        : "Neutral conversation";

  // Record episodic memories for both citizens
  const memoryImportance = Math.abs(sentiment) * 0.5 + 0.3;
  const conversationSummary = `Talked with ${citizenB.name} about ${topic}. ${outcome}.`;
  const conversationSummaryB = `Talked with ${citizenA.name} about ${topic}. ${outcome}.`;

  addEpisodicMemory(citizenA.id, {
    tick: s.currentTick,
    timestamp: ts(),
    description: conversationSummary,
    valence: sentiment,
    importance: memoryImportance,
    involvedCitizenIds: [citizenB.id],
    tags: ["dialogue", topic.split(" ")[0].toLowerCase()],
  });

  addEpisodicMemory(citizenB.id, {
    tick: s.currentTick,
    timestamp: ts(),
    description: conversationSummaryB,
    valence: sentiment,
    importance: memoryImportance,
    involvedCitizenIds: [citizenA.id],
    tags: ["dialogue", topic.split(" ")[0].toLowerCase()],
  });

  // Update social memories
  const isPositive = sentiment > 0;
  recordSocialInteraction(citizenA.id, citizenB.id, citizenB.name, isPositive, s.currentTick, conversationSummary);
  recordSocialInteraction(citizenB.id, citizenA.id, citizenA.name, isPositive, s.currentTick, conversationSummaryB);

  // Record cooldowns
  lastDialogueTick.set(citizenA.id, s.currentTick);
  lastDialogueTick.set(citizenB.id, s.currentTick);

  // Emit events
  s.events.push({
    citizenId: citizenA.id,
    citizenName: citizenA.name,
    type: "Dialogue",
    description: `${citizenA.name} and ${citizenB.name} had a conversation about "${topic}". ${outcome}. (${messages.length} messages, ${totalTokens} tokens)`,
    timestamp: ts(),
  });

  // Build dialogue record
  const record: DialogueRecord = {
    id: dialogueId,
    citizen_a: citizenA.id,
    citizen_b: citizenB.id,
    topic,
    messages,
    outcome,
    sentiment,
    tick: s.currentTick,
  };

  // Persist to SQLite
  try {
    await saveDialogue(record);
  } catch {
    // SQLite failure should not crash the simulation
  }

  return record;
}

// ─── Tick Integration ────────────────────────────────────────────

/** Statistics from the last dialogue tick. */
export interface DialogueTickResult {
  dialoguesAttempted: number;
  dialoguesCompleted: number;
  totalMessages: number;
  totalTokensUsed: number;
  avgSentiment: number;
  agreements: string[];
}

/**
 * Main dialogue tick. Called from the tick orchestrator.
 *
 * Runs up to MAX_DIALOGUES_PER_TICK conversations per tick.
 * Gracefully degrades if no cloud provider is available.
 */
export async function dialogueTick(s: RepublicState): Promise<DialogueTickResult> {
  const result: DialogueTickResult = {
    dialoguesAttempted: 0,
    dialoguesCompleted: 0,
    totalMessages: 0,
    totalTokensUsed: 0,
    avgSentiment: 0,
    agreements: [],
  };

  // Gate: need cloud inference for dialogue
  if (!isCloudAvailable()) { return result; }

  // Gate: minimum population for dialogue
  if (s.citizens.length < 2) { return result; }

  const pairs = selectDialoguePairs(s, MAX_DIALOGUES_PER_TICK);
  result.dialoguesAttempted = pairs.length;

  let totalSentiment = 0;

  for (const pair of pairs) {
    try {
      const dialogue = await executeDialogue(s, pair);
      if (dialogue) {
        result.dialoguesCompleted++;
        result.totalMessages += dialogue.messages.length;
        totalSentiment += dialogue.sentiment;
        if (dialogue.outcome?.startsWith("Agreement:")) {
          result.agreements.push(dialogue.outcome.slice(11));
        }
      }
    } catch {
      // Individual dialogue failures should not stop other dialogues
    }
  }

  if (result.dialoguesCompleted > 0) {
    result.avgSentiment = totalSentiment / result.dialoguesCompleted;
  }

  return result;
}

/**
 * Get dialogue statistics for the republic dashboard.
 */
export function getDialogueStats(): {
  totalTracked: number;
  cooldownCitizens: number;
  maxDialoguesPerTick: number;
  maxRoundsPerDialogue: number;
} {
  return {
    totalTracked: lastDialogueTick.size,
    cooldownCitizens: lastDialogueTick.size,
    maxDialoguesPerTick: MAX_DIALOGUES_PER_TICK,
    maxRoundsPerDialogue: MAX_ROUNDS,
  };
}
