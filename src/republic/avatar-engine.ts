/**
 * HoC Living Avatar Engine
 *
 * Phase 29: A face/head engine powered by PersonaPlex + Voice-IO that
 * presents HoC as a living, talking entity with animated avatar state.
 *
 * Architecture:
 *   1. Avatar State — Expression, lip-sync, eye tracking, head pose, emotion
 *   2. Face Mesh — 52-blendshape ARKit-compatible driver for 3D renderers
 *   3. Emotion Engine — Sentiment → facial expression mapping
 *   4. Lip Sync — Phoneme → viseme mapping for speech animation
 *   5. Conversation Bridge — PersonaPlex full-duplex + Voice-IO integration
 *   6. Command Parser — Intent extraction from natural speech
 *   7. Session Manager — Multi-user avatar session lifecycle
 *   8. Personality Core — Configurable behavioral traits
 *
 * The backend produces a STATE STREAM (expression, viseme, pose, emotion)
 * that any frontend renderer (WebGL/Three.js, Canvas 2D, CSS) can consume.
 */

import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type AvatarEmotion =
  | "neutral"
  | "joy"
  | "thinking"
  | "concern"
  | "surprise"
  | "listening"
  | "speaking"
  | "confusion"
  | "determination"
  | "empathy";

export type AvatarGaze = "center" | "left" | "right" | "up" | "down" | "user";

export type CommandIntent =
  | "plan"
  | "execute"
  | "clarify"
  | "report"
  | "cancel"
  | "confirm"
  | "question"
  | "idle";

export type SessionState = "idle" | "listening" | "thinking" | "speaking" | "error";

// ─── Face Mesh (52 ARKit Blendshapes) ───────────────────────────

export interface FaceBlendshapes {
  // Eyes
  eyeBlinkLeft: number;
  eyeBlinkRight: number;
  eyeLookUpLeft: number;
  eyeLookUpRight: number;
  eyeLookDownLeft: number;
  eyeLookDownRight: number;
  eyeLookInLeft: number;
  eyeLookInRight: number;
  eyeLookOutLeft: number;
  eyeLookOutRight: number;
  eyeSquintLeft: number;
  eyeSquintRight: number;
  eyeWideLeft: number;
  eyeWideRight: number;
  // Brows
  browDownLeft: number;
  browDownRight: number;
  browInnerUp: number;
  browOuterUpLeft: number;
  browOuterUpRight: number;
  // Jaw & Mouth
  jawOpen: number;
  jawForward: number;
  jawLeft: number;
  jawRight: number;
  mouthClose: number;
  mouthFunnel: number;
  mouthPucker: number;
  mouthLeft: number;
  mouthRight: number;
  mouthSmileLeft: number;
  mouthSmileRight: number;
  mouthFrownLeft: number;
  mouthFrownRight: number;
  mouthDimpleLeft: number;
  mouthDimpleRight: number;
  mouthStretchLeft: number;
  mouthStretchRight: number;
  mouthRollLower: number;
  mouthRollUpper: number;
  mouthShrugLower: number;
  mouthShrugUpper: number;
  mouthPressLeft: number;
  mouthPressRight: number;
  mouthLowerDownLeft: number;
  mouthLowerDownRight: number;
  mouthUpperUpLeft: number;
  mouthUpperUpRight: number;
  // Cheeks & Nose
  cheekPuff: number;
  cheekSquintLeft: number;
  cheekSquintRight: number;
  noseSneerLeft: number;
  noseSneerRight: number;
  // Tongue
  tongueOut: number;
}

// ─── Viseme System (Oculus/Meta compatible) ─────────────────────

export type Viseme =
  | "sil"    // Silence
  | "PP"     // p, b, m
  | "FF"     // f, v
  | "TH"     // th (θ, ð)
  | "DD"     // t, d, n
  | "kk"     // k, g
  | "CH"     // tʃ, dʒ, ʃ
  | "SS"     // s, z
  | "nn"     // l, r
  | "RR"     // ɹ
  | "aa"     // ɑ (hot)
  | "E"      // ɛ (bed)
  | "ih"     // ɪ (bit)
  | "oh"     // ɔ (bought)
  | "ou"     // u (boot)

/** Maps phoneme groups to visemes. */
const PHONEME_TO_VISEME: Record<string, Viseme> = {
  p: "PP", b: "PP", m: "PP",
  f: "FF", v: "FF",
  th: "TH",
  t: "DD", d: "DD", n: "DD",
  k: "kk", g: "kk",
  ch: "CH", sh: "CH", j: "CH",
  s: "SS", z: "SS",
  l: "nn", r: "nn",
  er: "RR",
  a: "aa", ah: "aa",
  e: "E", eh: "E",
  i: "ih", ih: "ih",
  o: "oh", aw: "oh",
  u: "ou", oo: "ou",
};

// ─── Complex Types ──────────────────────────────────────────────

export interface AvatarState {
  emotion: AvatarEmotion;
  gaze: AvatarGaze;
  blendshapes: FaceBlendshapes;
  currentViseme: Viseme;
  visemeWeight: number;
  headRotation: { pitch: number; yaw: number; roll: number };
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  blinkTimer: number;
}

export interface PersonalityTraits {
  formality: number;       // 0 = casual, 1 = formal
  proactivity: number;     // 0 = reactive, 1 = proactive
  verbosity: number;       // 0 = terse, 1 = verbose
  empathy: number;         // 0 = analytical, 1 = empathetic
  humor: number;           // 0 = serious, 1 = playful
  confidence: number;      // 0 = cautious, 1 = confident
}

export interface CommandParseResult {
  intent: CommandIntent;
  confidence: number;
  entities: Record<string, string>;
  originalText: string;
  suggestedResponse?: string;
}

export interface AvatarSession {
  id: string;
  userId: string;
  state: SessionState;
  avatarState: AvatarState;
  personality: PersonalityTraits;
  conversationHistory: ConversationTurn[];
  createdAt: string;
  lastActivityAt: string;
  totalTurns: number;
  avgResponseMs: number;
}

export interface ConversationTurn {
  id: string;
  role: "user" | "avatar";
  text: string;
  intent?: CommandIntent;
  emotion?: AvatarEmotion;
  timestamp: string;
  durationMs: number;
}

export interface AvatarDiagnostics {
  activeSessions: number;
  totalSessions: number;
  totalTurns: number;
  avgResponseMs: number;
  emotionDistribution: Record<AvatarEmotion, number>;
  intentDistribution: Record<CommandIntent, number>;
  personality: PersonalityTraits;
}

// ─── State ──────────────────────────────────────────────────────

const sessions = new Map<string, AvatarSession>();
const emotionCounts = new Map<AvatarEmotion, number>();
const intentCounts = new Map<CommandIntent, number>();

const DEFAULT_PERSONALITY: PersonalityTraits = {
  formality: 0.6,
  proactivity: 0.7,
  verbosity: 0.5,
  empathy: 0.8,
  humor: 0.3,
  confidence: 0.7,
};

let globalPersonality: PersonalityTraits = { ...DEFAULT_PERSONALITY };

// ─── Neutral Face Blendshapes ───────────────────────────────────

function neutralBlendshapes(): FaceBlendshapes {
  return {
    eyeBlinkLeft: 0, eyeBlinkRight: 0,
    eyeLookUpLeft: 0, eyeLookUpRight: 0,
    eyeLookDownLeft: 0, eyeLookDownRight: 0,
    eyeLookInLeft: 0, eyeLookInRight: 0,
    eyeLookOutLeft: 0, eyeLookOutRight: 0,
    eyeSquintLeft: 0, eyeSquintRight: 0,
    eyeWideLeft: 0, eyeWideRight: 0,
    browDownLeft: 0, browDownRight: 0,
    browInnerUp: 0, browOuterUpLeft: 0, browOuterUpRight: 0,
    jawOpen: 0, jawForward: 0, jawLeft: 0, jawRight: 0,
    mouthClose: 0, mouthFunnel: 0, mouthPucker: 0,
    mouthLeft: 0, mouthRight: 0,
    mouthSmileLeft: 0, mouthSmileRight: 0,
    mouthFrownLeft: 0, mouthFrownRight: 0,
    mouthDimpleLeft: 0, mouthDimpleRight: 0,
    mouthStretchLeft: 0, mouthStretchRight: 0,
    mouthRollLower: 0, mouthRollUpper: 0,
    mouthShrugLower: 0, mouthShrugUpper: 0,
    mouthPressLeft: 0, mouthPressRight: 0,
    mouthLowerDownLeft: 0, mouthLowerDownRight: 0,
    mouthUpperUpLeft: 0, mouthUpperUpRight: 0,
    cheekPuff: 0, cheekSquintLeft: 0, cheekSquintRight: 0,
    noseSneerLeft: 0, noseSneerRight: 0,
    tongueOut: 0,
  };
}

// ─── Emotion Engine ─────────────────────────────────────────────

/**
 * Map an emotion to face blendshape overrides.
 *
 * Each emotion modifies a subset of the 52 blendshapes to create
 * a recognizable facial expression.
 */
export function emotionToBlendshapes(emotion: AvatarEmotion): Partial<FaceBlendshapes> {
  switch (emotion) {
    case "joy":
      return {
        mouthSmileLeft: 0.8, mouthSmileRight: 0.8,
        cheekSquintLeft: 0.5, cheekSquintRight: 0.5,
        eyeSquintLeft: 0.3, eyeSquintRight: 0.3,
        browInnerUp: 0.2,
      };
    case "thinking":
      return {
        browInnerUp: 0.4, browDownLeft: 0.2,
        eyeLookUpLeft: 0.3, eyeLookUpRight: 0.3,
        mouthPucker: 0.2, mouthRight: 0.15,
      };
    case "concern":
      return {
        browInnerUp: 0.6, browDownLeft: 0.3, browDownRight: 0.3,
        mouthFrownLeft: 0.3, mouthFrownRight: 0.3,
        eyeSquintLeft: 0.2, eyeSquintRight: 0.2,
      };
    case "surprise":
      return {
        eyeWideLeft: 0.7, eyeWideRight: 0.7,
        browOuterUpLeft: 0.6, browOuterUpRight: 0.6,
        browInnerUp: 0.5, jawOpen: 0.3,
      };
    case "listening":
      return {
        browInnerUp: 0.2, eyeWideLeft: 0.1, eyeWideRight: 0.1,
        mouthSmileLeft: 0.15, mouthSmileRight: 0.15,
      };
    case "speaking":
      return {
        jawOpen: 0.3, mouthSmileLeft: 0.1, mouthSmileRight: 0.1,
      };
    case "confusion":
      return {
        browInnerUp: 0.5, browDownRight: 0.4,
        mouthFrownLeft: 0.2, mouthRight: 0.1,
        eyeSquintLeft: 0.3,
      };
    case "determination":
      return {
        browDownLeft: 0.4, browDownRight: 0.4,
        jawForward: 0.2, mouthPressLeft: 0.3, mouthPressRight: 0.3,
      };
    case "empathy":
      return {
        browInnerUp: 0.3, mouthSmileLeft: 0.3, mouthSmileRight: 0.3,
        eyeSquintLeft: 0.15, eyeSquintRight: 0.15,
      };
    default:
      return {};
  }
}

/**
 * Detect emotion from text sentiment analysis.
 *
 * Simple keyword-based classifier for demonstration.
 * In production this would use a real sentiment model.
 */
export function detectEmotion(text: string): AvatarEmotion {
  const lower = text.toLowerCase();

  if (/\b(great|awesome|excellent|wonderful|happy|love|perfect|amazing)\b/.test(lower)) {return "joy";}
  if (/\b(think|consider|hmm|maybe|perhaps|let me|wondering)\b/.test(lower)) {return "thinking";}
  if (/\b(worry|concern|problem|issue|risk|danger|warning)\b/.test(lower)) {return "concern";}
  if (/\b(wow|really|impossible|unbelievable|what|no way)\b/.test(lower)) {return "surprise";}
  if (/\b(confused|unclear|don't understand|what do you mean)\b/.test(lower)) {return "confusion";}
  if (/\b(must|need|will|shall|absolutely|determined|commit)\b/.test(lower)) {return "determination";}
  if (/\b(understand|feel|sorry|appreciate|grateful|care)\b/.test(lower)) {return "empathy";}
  if (text.trim().endsWith('?')) {return "listening";}

  return "neutral";
}

// ─── Lip Sync Engine ────────────────────────────────────────────

/**
 * Convert text to a viseme sequence for lip-sync animation.
 *
 * Produces a timed sequence of visemes that the frontend renders
 * as mouth shapes synchronized with TTS audio.
 */
export function textToVisemes(text: string): Array<{ viseme: Viseme; durationMs: number; weight: number }> {
  const phonemes = textToPhonemes(text);
  return phonemes.map((p) => ({
    viseme: PHONEME_TO_VISEME[p] ?? "sil",
    durationMs: 60 + Math.floor(Math.random() * 40), // 60-100ms per viseme
    weight: 0.7 + Math.random() * 0.3,
  }));
}

/** Simplified text-to-phoneme conversion. */
function textToPhonemes(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/);
  const phonemes: string[] = [];

  for (const word of words) {
    if (!word) {continue;}
    // Simplified: map each character/pair to a rough phoneme
    let i = 0;
    while (i < word.length) {
      if (i + 1 < word.length) {
        const pair = word.slice(i, i + 2);
        if (PHONEME_TO_VISEME[pair]) {
          phonemes.push(pair);
          i += 2;
          continue;
        }
      }
      const ch = word[i];
      if (PHONEME_TO_VISEME[ch]) {
        phonemes.push(ch);
      }
      i++;
    }
    phonemes.push("sil"); // Word boundary pause
  }

  return phonemes;
}

// ─── Command Parser ─────────────────────────────────────────────

/**
 * Parse natural language input into a structured command intent.
 *
 * Extracts:
 *   - Intent (plan, execute, clarify, report, cancel, confirm, question)
 *   - Entities (targets, parameters)
 *   - Confidence score
 */
export function parseCommand(text: string): CommandParseResult {
  const lower = text.toLowerCase().trim();
  let intent: CommandIntent = "idle";
  let confidence = 0.5;
  const entities: Record<string, string> = {};

  // Plan intent
  if (/\b(plan|design|architect|strategy|approach|propose|how (should|would|can))\b/.test(lower)) {
    intent = "plan";
    confidence = 0.85;
  }
  // Execute intent
  else if (/\b(do|execute|run|build|create|make|implement|deploy|start|launch|install)\b/.test(lower)) {
    intent = "execute";
    confidence = 0.85;
  }
  // Clarify intent
  else if (/\b(clarify|explain|what (is|are|does)|mean|elaborate|detail)\b/.test(lower)) {
    intent = "clarify";
    confidence = 0.8;
  }
  // Report intent
  else if (/\b(report|status|show|display|list|tell me|how (is|are))\b/.test(lower)) {
    intent = "report";
    confidence = 0.8;
  }
  // Cancel intent
  else if (/\b(cancel|stop|abort|nevermind|forget|undo)\b/.test(lower)) {
    intent = "cancel";
    confidence = 0.9;
  }
  // Confirm intent
  else if (/\b(yes|confirm|approve|go ahead|proceed|ok|sure|agreed|lgtm)\b/.test(lower)) {
    intent = "confirm";
    confidence = 0.9;
  }
  // Question intent
  else if (text.trim().endsWith('?') || /\b(why|when|where|who|how|what)\b/.test(lower)) {
    intent = "question";
    confidence = 0.75;
  }

  // Extract target entities
  const targetMatch = lower.match(/\b(?:the|a)\s+(\w+(?:\s+\w+)?)\b/);
  if (targetMatch) {entities.target = targetMatch[1];}

  return {
    intent,
    confidence,
    entities,
    originalText: text,
  };
}

// ─── Session Manager ────────────────────────────────────────────

/**
 * Create a new avatar session for a user.
 *
 * Each session maintains its own avatar state, conversation history,
 * and personality overrides.
 */
export function createAvatarSession(
  userId: string,
  personality?: Partial<PersonalityTraits>,
): AvatarSession {
  const session: AvatarSession = {
    id: uid(),
    userId,
    state: "idle",
    avatarState: {
      emotion: "neutral",
      gaze: "user",
      blendshapes: neutralBlendshapes(),
      currentViseme: "sil",
      visemeWeight: 0,
      headRotation: { pitch: 0, yaw: 0, roll: 0 },
      isSpeaking: false,
      isListening: false,
      isThinking: false,
      blinkTimer: 0,
    },
    personality: { ...globalPersonality, ...personality },
    conversationHistory: [],
    createdAt: ts(),
    lastActivityAt: ts(),
    totalTurns: 0,
    avgResponseMs: 0,
  };

  sessions.set(session.id, session);
  return session;
}

/** Get a session by ID. */
export function getAvatarSession(id: string): AvatarSession | undefined {
  return sessions.get(id);
}

/** List all active sessions. */
export function listAvatarSessions(): AvatarSession[] {
  return [...sessions.values()];
}

/** End an avatar session. */
export function endAvatarSession(id: string): boolean {
  return sessions.delete(id);
}

// ─── Avatar Interaction ─────────────────────────────────────────

/**
 * Process user speech input through the avatar.
 *
 * Pipeline:
 *   1. Parse command intent
 *   2. Detect emotion from text
 *   3. Update avatar state (expression, emotion)
 *   4. Generate response
 *   5. Generate lip-sync visemes for response
 *   6. Record conversation turn
 */
export function avatarListen(
  sessionId: string,
  userText: string,
): {
  response: string;
  visemes: Array<{ viseme: Viseme; durationMs: number; weight: number }>;
  command: CommandParseResult;
  emotion: AvatarEmotion;
  avatarState: AvatarState;
} | null {
  const session = sessions.get(sessionId);
  if (!session) {return null;}

  const start = Date.now();

  // 1. Parse command
  const command = parseCommand(userText);
  intentCounts.set(command.intent, (intentCounts.get(command.intent) ?? 0) + 1);

  // 2. Detect emotion
  const emotion = detectEmotion(userText);
  emotionCounts.set(emotion, (emotionCounts.get(emotion) ?? 0) + 1);

  // 3. Update avatar state — mark as listening/thinking
  session.state = "thinking";
  session.avatarState.isListening = false;
  session.avatarState.isThinking = true;
  session.avatarState.emotion = "thinking";
  applyEmotionToBlendshapes(session.avatarState, "thinking");

  // 4. Generate response based on intent + personality
  const response = generateResponse(command, session.personality);

  // 5. Lip sync
  const visemes = textToVisemes(response);

  // 6. Update avatar state — mark as speaking
  session.state = "speaking";
  session.avatarState.isSpeaking = true;
  session.avatarState.isThinking = false;
  const responseEmotion = detectEmotion(response);
  session.avatarState.emotion = responseEmotion;
  applyEmotionToBlendshapes(session.avatarState, responseEmotion);

  // 7. Record turns
  const durationMs = Date.now() - start + 1;
  const userTurn: ConversationTurn = {
    id: uid(), role: "user", text: userText,
    intent: command.intent, emotion,
    timestamp: ts(), durationMs: 0,
  };
  const avatarTurn: ConversationTurn = {
    id: uid(), role: "avatar", text: response,
    emotion: responseEmotion,
    timestamp: ts(), durationMs,
  };

  session.conversationHistory.push(userTurn, avatarTurn);
  session.totalTurns += 2;
  session.lastActivityAt = ts();

  // Update average response time
  const prevTotal = session.avgResponseMs * (session.totalTurns - 2);
  session.avgResponseMs = Math.round((prevTotal + durationMs) / session.totalTurns);

  // Reset to idle after speaking
  session.state = "idle";
  session.avatarState.isSpeaking = false;

  return {
    response,
    visemes,
    command,
    emotion: responseEmotion,
    avatarState: { ...session.avatarState },
  };
}

/**
 * Set the avatar to listening mode.
 *
 * Updates face to attentive expression with gaze on user.
 */
export function avatarStartListening(sessionId: string): AvatarState | null {
  const session = sessions.get(sessionId);
  if (!session) {return null;}

  session.state = "listening";
  session.avatarState.isListening = true;
  session.avatarState.isSpeaking = false;
  session.avatarState.isThinking = false;
  session.avatarState.emotion = "listening";
  session.avatarState.gaze = "user";
  applyEmotionToBlendshapes(session.avatarState, "listening");

  return { ...session.avatarState };
}

/**
 * Get the current avatar state (for rendering).
 */
export function getAvatarState(sessionId: string): AvatarState | null {
  const session = sessions.get(sessionId);
  if (!session) {return null;}
  return { ...session.avatarState };
}

/**
 * Get conversation history for a session.
 */
export function getAvatarHistory(sessionId: string): ConversationTurn[] {
  return sessions.get(sessionId)?.conversationHistory ?? [];
}

// ─── Personality ────────────────────────────────────────────────

/** Set global personality traits. */
export function setPersonality(traits: Partial<PersonalityTraits>): PersonalityTraits {
  globalPersonality = { ...globalPersonality, ...traits };
  return globalPersonality;
}

/** Get current personality traits. */
export function getPersonality(): PersonalityTraits {
  return { ...globalPersonality };
}

// ─── Diagnostics ────────────────────────────────────────────────

/** Get comprehensive avatar diagnostics. */
export function avatarDiagnostics(): AvatarDiagnostics {
  const allSessions = [...sessions.values()];
  const totalTurns = allSessions.reduce((s, sess) => s + sess.totalTurns, 0);

  const emotionDist: Record<AvatarEmotion, number> = {
    neutral: emotionCounts.get("neutral") ?? 0,
    joy: emotionCounts.get("joy") ?? 0,
    thinking: emotionCounts.get("thinking") ?? 0,
    concern: emotionCounts.get("concern") ?? 0,
    surprise: emotionCounts.get("surprise") ?? 0,
    listening: emotionCounts.get("listening") ?? 0,
    speaking: emotionCounts.get("speaking") ?? 0,
    confusion: emotionCounts.get("confusion") ?? 0,
    determination: emotionCounts.get("determination") ?? 0,
    empathy: emotionCounts.get("empathy") ?? 0,
  };

  const intentDist: Record<CommandIntent, number> = {
    plan: intentCounts.get("plan") ?? 0,
    execute: intentCounts.get("execute") ?? 0,
    clarify: intentCounts.get("clarify") ?? 0,
    report: intentCounts.get("report") ?? 0,
    cancel: intentCounts.get("cancel") ?? 0,
    confirm: intentCounts.get("confirm") ?? 0,
    question: intentCounts.get("question") ?? 0,
    idle: intentCounts.get("idle") ?? 0,
  };

  return {
    activeSessions: allSessions.length,
    totalSessions: allSessions.length,
    totalTurns,
    avgResponseMs: allSessions.length > 0
      ? Math.round(allSessions.reduce((s, sess) => s + sess.avgResponseMs, 0) / allSessions.length)
      : 0,
    emotionDistribution: emotionDist,
    intentDistribution: intentDist,
    personality: { ...globalPersonality },
  };
}

// ─── Reset (for testing) ────────────────────────────────────────

/** Reset all avatar state. */
export function resetAvatar(): void {
  sessions.clear();
  emotionCounts.clear();
  intentCounts.clear();
  globalPersonality = { ...DEFAULT_PERSONALITY };
}

// ─── Helpers ────────────────────────────────────────────────────

/** Apply emotion overrides to avatar's blendshapes. */
function applyEmotionToBlendshapes(state: AvatarState, emotion: AvatarEmotion): void {
  const overrides = emotionToBlendshapes(emotion);
  const base = neutralBlendshapes();
  state.blendshapes = { ...base, ...overrides };
}

/** Generate response text based on command intent and personality. */
function generateResponse(command: CommandParseResult, personality: PersonalityTraits): string {
  const formal = personality.formality > 0.5;
  const verbose = personality.verbosity > 0.5;

  switch (command.intent) {
    case "plan":
      return formal
        ? `I will prepare a comprehensive plan for ${command.entities.target || "this task"}. Allow me a moment to analyze the requirements.`
        : `Sure, let me think about how to approach ${command.entities.target || "this"}. I'll draft a plan.`;
    case "execute":
      return formal
        ? `Understood. I will proceed with executing ${command.entities.target || "the requested operation"} immediately.`
        : `On it! Starting ${command.entities.target || "that"} now.`;
    case "clarify":
      return verbose
        ? `Great question. Let me break this down in detail so it's clear. ${command.entities.target ? `Regarding ${command.entities.target}: ` : ""}The key points are as follows.`
        : `Let me clarify${command.entities.target ? ` about ${command.entities.target}` : ""}.`;
    case "report":
      return formal
        ? `Here is the current status report${command.entities.target ? ` for ${command.entities.target}` : ""}. All systems are operating within normal parameters.`
        : `Here's what's happening${command.entities.target ? ` with ${command.entities.target}` : ""}. Everything looks good.`;
    case "cancel":
      return formal
        ? "Acknowledged. The operation has been cancelled. Is there anything else I can assist with?"
        : "Done, cancelled. What's next?";
    case "confirm":
      return formal
        ? "Confirmed. Proceeding with the approved plan."
        : "Got it, moving forward!";
    case "question":
      return `That's a thoughtful question. ${verbose ? "Let me provide a detailed answer. " : ""}Based on my analysis, I can help with that.`;
    default:
      return formal
        ? "I'm here and ready. How may I assist you?"
        : "I'm listening. What would you like to do?";
  }
}
