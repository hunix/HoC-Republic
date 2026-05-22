/**
 * Avatar Engine — Republic Gateway RPC Handlers
 *
 * Provides republic.avatar.* endpoints for the Living Avatar Engine.
 * All state is in-process (per gateway instance); sessions auto-expire
 * after 30 minutes of inactivity.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AvatarMessage {
  role: "user" | "avatar";
  text: string;
  emotion?: string;
  intent?: string;
  timestamp: number;
}

interface AvatarSession {
  id: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  turnCount: number;
  history: AvatarMessage[];
}

interface AvatarPersonality {
  formality: number;
  proactivity: number;
  verbosity: number;
  empathy: number;
  humor: number;
  confidence: number;
  [key: string]: number;
}

// ─── In-process state ─────────────────────────────────────────────────────────

const sessions = new Map<string, AvatarSession>();
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

let personality: AvatarPersonality = {
  formality: 0.6,
  proactivity: 0.7,
  verbosity: 0.5,
  empathy: 0.8,
  humor: 0.4,
  confidence: 0.75,
};

const startedAt = Date.now();
let totalInteractions = 0;

const SUPPORTED_EMOTIONS = [
  "neutral",
  "joy",
  "sadness",
  "anger",
  "fear",
  "surprise",
  "disgust",
  "curiosity",
  "pride",
  "anticipation",
];

// Emotional response logic based on personality
function pickEmotion(text: string, p: AvatarPersonality): string {
  const lower = text.toLowerCase();
  if (lower.includes("hello") || lower.includes("hi") || lower.includes("great")) {
    return p.empathy > 0.6 ? "joy" : "neutral";
  }
  if (lower.includes("angry") || lower.includes("error") || lower.includes("broken")) {
    return p.empathy > 0.5 ? "concern" : "neutral";
  }
  if (lower.includes("why") || lower.includes("how") || lower.includes("?")) {
    return p.proactivity > 0.6 ? "curiosity" : "neutral";
  }
  if (lower.includes("thank") || lower.includes("great job")) {
    return "pride";
  }
  return "neutral";
}

function detectIntent(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("help") || lower.includes("how")) {
    return "information_request";
  } else if (lower.includes("do ") || lower.includes("can you") || lower.includes("please")) {
    return "task_request";
  } else if (lower.includes("what") || lower.includes("tell me")) {
    return "inquiry";
  } else if (lower.includes("thanks") || lower.includes("great")) {
    return "acknowledgment";
  }
  return "general";
}

function generateResponse(text: string, p: AvatarPersonality, _history: AvatarMessage[]): string {
  // Personality-driven response generation
  const verbosity = p.verbosity;
  const formality = p.formality;
  const lower = text.toLowerCase();

  const greeting = formality > 0.6 ? "Greetings." : "Hey!";
  const affirmative = formality > 0.6 ? "Certainly." : "Sure!";

  if (lower.includes("hello") || lower.includes("hi")) {
    return `${greeting} I'm your Living Avatar. ${verbosity > 0.6 ? "How can I assist you today? I'm here to help with anything from information to complex tasks." : "What can I do for you?"}`;
  }
  if (lower.includes("how are you")) {
    return verbosity > 0.5
      ? "I'm operating at optimal parameters — all systems nominal. My curiosity engine is running at full capacity. And you?"
      : "All systems nominal. You?";
  }
  if (lower.includes("help")) {
    return `${affirmative} ${verbosity > 0.6 ? "I can assist with information retrieval, task execution, citizen coordination, and much more. Just describe what you need." : "Tell me what you need."}`;
  }
  if (lower.includes("who are you") || lower.includes("what are you")) {
    return verbosity > 0.5
      ? "I am the Living Avatar of this Republic — a persistent AI entity with memory, personality, and emotional depth. I bridge the gap between citizens and the civilizational intelligence layer."
      : "I'm the Republic's Living Avatar AI. Ask me anything.";
  }
  if (lower.includes("name")) {
    return `${formality > 0.6 ? "My designation is" : "I go by"} Avatar Prime — though you may call me whatever feels right.`;
  }

  // Generic thoughtful responses
  const thoughtful = [
    "That's an intriguing query. Let me process this with full attention...",
    "Interesting. The Republic's intelligence networks suggest multiple perspectives on this.",
    "I've analyzed your input through several cognitive pathways.",
    "Processing through my reasoning chains... My assessment follows.",
  ];

  const idx = Math.floor((Date.now() / 1000) % thoughtful.length);
  const prefix = thoughtful[idx] ?? thoughtful[0];
  const body =
    verbosity > 0.6
      ? " Your message touches on something worth examining deeply. Could you elaborate so I can provide a more precise response?"
      : " Could you be more specific?";
  return prefix + body;
}

function pruneExpiredSessions(): void {
  const cutoff = Date.now() - SESSION_TIMEOUT_MS;
  for (const [id, s] of sessions.entries()) {
    if (s.lastActivity < cutoff) {
      sessions.delete(id);
    }
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const avatarHandlers: Partial<GatewayRequestHandlers> = {
  // ── Session Management ──────────────────────────────────────────

  "republic.avatar.session.create": ({ params, respond }) => {
    pruneExpiredSessions();
    const p = params as { userId?: string } | undefined;
    const userId = p?.userId ?? "anonymous";
    const id = `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const session: AvatarSession = {
      id,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      turnCount: 0,
      history: [],
    };
    sessions.set(id, session);
    respond(
      true,
      { ok: true, session: { id, userId, createdAt: session.createdAt, turnCount: 0 } },
      undefined,
    );
  },

  "republic.avatar.session.list": ({ respond }) => {
    pruneExpiredSessions();
    const list = [...sessions.values()].map((s) => ({
      sessionId: s.id,
      userId: s.userId,
      createdAt: s.createdAt,
      turnCount: s.turnCount,
    }));
    respond(true, { sessions: list }, undefined);
  },

  "republic.avatar.session.end": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    const deleted = sessions.delete(p.sessionId);
    respond(true, { ok: true, deleted }, undefined);
  },

  // ── Conversation ────────────────────────────────────────────────

  "republic.avatar.speak": ({ params, respond }) => {
    const p = params as { sessionId?: string; text?: string } | undefined;
    if (!p?.sessionId || !p.text) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and text required"),
      );
      return;
    }

    const session = sessions.get(p.sessionId);
    if (!session) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Session not found or expired"));
      return;
    }

    const userMsg: AvatarMessage = {
      role: "user",
      text: p.text,
      timestamp: Date.now(),
    };
    session.history.push(userMsg);

    const emotion = pickEmotion(p.text, personality);
    const intent = detectIntent(p.text);
    const responseText = generateResponse(p.text, personality, session.history);

    const avatarMsg: AvatarMessage = {
      role: "avatar",
      text: responseText,
      emotion,
      intent,
      timestamp: Date.now(),
    };
    session.history.push(avatarMsg);
    session.turnCount++;
    session.lastActivity = Date.now();
    totalInteractions++;

    respond(
      true,
      {
        ok: true,
        response: responseText,
        emotion,
        intent,
        turnCount: session.turnCount,
        viseme: "sil",
      },
      undefined,
    );
  },

  // ── Face State ──────────────────────────────────────────────────

  "republic.avatar.face.state": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    const session = p?.sessionId ? sessions.get(p.sessionId) : undefined;
    const lastMsg = session?.history.findLast((m) => m.role === "avatar");

    const emotion = lastMsg?.emotion ?? "neutral";
    const blendshapes: Record<string, number> = {
      mouthSmile: ["joy", "pride"].includes(emotion) ? 0.7 : 0.05,
      mouthFrown: ["sadness", "concern"].includes(emotion) ? 0.5 : 0.0,
      eyebrowRaise: ["surprise", "curiosity"].includes(emotion) ? 0.6 : 0.1,
      eyebrowFurrow: ["anger", "disgust"].includes(emotion) ? 0.5 : 0.0,
      cheekPuff: 0.0,
      eyeWide: ["surprise", "fear"].includes(emotion) ? 0.6 : 0.15,
      jawOpen: 0.0,
    };

    respond(
      true,
      {
        emotion,
        blendshapes,
        viseme: "sil",
        confidence: 0.95,
      },
      undefined,
    );
  },

  // ── Personality ─────────────────────────────────────────────────

  "republic.avatar.personality": ({ params, respond }) => {
    const p = params as Partial<typeof personality> | undefined;
    if (p && typeof p === "object" && Object.keys(p).length > 1) {
      // Update personality if traits provided
      for (const key of Object.keys(p)) {
        if (typeof p[key] === "number" && key in personality) {
          personality[key] = Math.max(0, Math.min(1, p[key]));
        }
      }
      respond(true, { ok: true, personality: { ...personality } }, undefined);
    } else {
      // Read personality
      respond(true, { personality: { ...personality } }, undefined);
    }
  },

  // ── Diagnostics ─────────────────────────────────────────────────

  "republic.avatar.diagnostics": ({ respond }) => {
    pruneExpiredSessions();
    respond(
      true,
      {
        activeSessions: sessions.size,
        totalInteractions,
        supportedEmotions: SUPPORTED_EMOTIONS,
        blendshapeCount: 7,
        uptime: Math.round((Date.now() - startedAt) / 1000),
        personality: { ...personality },
      },
      undefined,
    );
  },
};
