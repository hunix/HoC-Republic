/**
 * Republic Platform — Citizen Conversation
 *
 * Enables natural-language dialogue between the user and individual
 * citizens. Each conversation maintains full context: the citizen's
 * personality, active processes, recent actions, and conversation
 * history. Responses are generated via the compute router (preferring
 * cloud tier for quality).
 *
 * Citizens can reason about user requests, explain their work,
 * accept adjustments, and report on their progress — all through
 * natural, personality-aware conversation.
 */

import type {
  Citizen,
  CitizenConversationRecord,
  ConversationMessage,
  RepublicState,
} from "./types.js";
import { buildSystemPrompt } from "./citizen-prompt.js";
import { getCitizenProcesses } from "./process-manager.js";
import { toToonChat } from "./toon-serializer.js";
import { ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_CONVERSATIONS = 200;
const MAX_MESSAGES_PER_CONVERSATION = 200;
const MAX_CONTEXT_MESSAGES = 20;

// ─── Conversation Lifecycle ─────────────────────────────────────

/**
 * Start a new conversation with a citizen.
 * If the citizen already has an active conversation, return it.
 */
export function startConversation(s: RepublicState, citizenId: string): CitizenConversationRecord {
  if (!s.citizenConversations) {
    s.citizenConversations = [];
  }

  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (!citizen) {
    throw new Error(`Citizen ${citizenId} not found`);
  }

  // Return existing active conversation if present
  const existing = s.citizenConversations.find(
    (c) => c.citizenId === citizenId && c.status === "active",
  );
  if (existing) {
    return existing;
  }

  if (s.citizenConversations.length >= MAX_CONVERSATIONS) {
    // Evict oldest closed conversation
    const closedIdx = s.citizenConversations.findIndex((c) => c.status === "closed");
    if (closedIdx >= 0) {
      s.citizenConversations.splice(closedIdx, 1);
    } else {
      throw new Error(`Conversation limit reached (${MAX_CONVERSATIONS})`);
    }
  }

  // Build context from citizen's current state
  const activeProcesses = getCitizenProcesses(s, citizenId)
    .filter((p) => p.status === "running" || p.status === "paused")
    .map((p) => p.id);

  const recentActions = (s.events ?? [])
    .filter((e) => e.citizenId === citizenId)
    .slice(-10)
    .map((e) => e.description);

  const conversation: CitizenConversationRecord = {
    id: uid(),
    citizenId,
    messages: [],
    status: "active",
    context: {
      activeProcesses,
      recentActions,
      currentTask: citizen.activity,
    },
    createdAt: ts(),
    lastMessageAt: ts(),
  };

  s.citizenConversations.push(conversation);

  // Update citizen state
  citizen.conversationId = conversation.id;
  citizen.activity = "Conversing";

  s.events.push({
    citizenId,
    citizenName: citizen.name,
    type: "CitizenConversation",
    description: `Conversation started with ${citizen.name}`,
    timestamp: ts(),
  });

  return conversation;
}

/**
 * Send a message from the user to a citizen in a conversation.
 * Returns the message record (citizen response is generated separately).
 */
export function sendUserMessage(
  s: RepublicState,
  conversationId: string,
  content: string,
): ConversationMessage {
  const conversation = findConversation(s, conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  if (conversation.status !== "active") {
    throw new Error("Conversation is closed");
  }

  if (conversation.messages.length >= MAX_MESSAGES_PER_CONVERSATION) {
    // Evict oldest messages, keeping last N
    const excess = conversation.messages.length - MAX_MESSAGES_PER_CONVERSATION + 10;
    conversation.messages.splice(0, excess);
  }

  const message: ConversationMessage = {
    id: uid(),
    role: "user",
    content,
    timestamp: ts(),
  };

  conversation.messages.push(message);
  conversation.lastMessageAt = ts();

  // Refresh context
  refreshConversationContext(s, conversation);

  return message;
}

/**
 * Record a citizen's response in the conversation.
 * This is called after LLM inference generates the response.
 */
export function recordCitizenResponse(
  s: RepublicState,
  conversationId: string,
  content: string,
  metadata?: ConversationMessage["metadata"],
): ConversationMessage {
  const conversation = findConversation(s, conversationId);
  if (!conversation) {
    throw new Error(`Conversation ${conversationId} not found`);
  }

  const message: ConversationMessage = {
    id: uid(),
    role: "citizen",
    content,
    timestamp: ts(),
    metadata,
  };

  conversation.messages.push(message);
  conversation.lastMessageAt = ts();

  return message;
}

/**
 * Close a conversation.
 */
export function closeConversation(s: RepublicState, conversationId: string): boolean {
  const conversation = findConversation(s, conversationId);
  if (!conversation) {
    return false;
  }

  conversation.status = "closed";

  // Free citizen
  const citizen = s.citizens.find((c) => c.id === conversation.citizenId);
  if (citizen && citizen.conversationId === conversationId) {
    citizen.conversationId = null;
    if (citizen.activity === "Conversing") {
      citizen.activity = citizen.activeProcessId ? "Executing" : "Idle";
    }
  }

  return true;
}

// ─── Queries ────────────────────────────────────────────────────

/**
 * Get a conversation by ID.
 */
export function getConversation(
  s: RepublicState,
  conversationId: string,
): CitizenConversationRecord | undefined {
  return findConversation(s, conversationId);
}

/**
 * Get conversation history (messages) with optional limit.
 */
export function getConversationHistory(
  s: RepublicState,
  conversationId: string,
  limit = 50,
): ConversationMessage[] {
  const conversation = findConversation(s, conversationId);
  if (!conversation) {
    return [];
  }

  return conversation.messages.slice(-limit);
}

/**
 * Get all conversations for a citizen.
 */
export function getCitizenConversations(
  s: RepublicState,
  citizenId: string,
): CitizenConversationRecord[] {
  return (s.citizenConversations ?? []).filter((c) => c.citizenId === citizenId);
}

/**
 * Get all active conversations.
 */
export function getActiveConversations(s: RepublicState): CitizenConversationRecord[] {
  return (s.citizenConversations ?? []).filter((c) => c.status === "active");
}

// ─── Prompt Building ────────────────────────────────────────────

/**
 * Build a conversation-aware system prompt for a citizen.
 * Extends the base citizen prompt with conversation context,
 * active processes, and user notes.
 */
export async function buildConversationPrompt(
  citizen: Citizen,
  conversation: CitizenConversationRecord,
  s: RepublicState,
): Promise<{ systemPrompt: string; userPrompt: string }> {
  // Base system prompt with personality
  const basePrompt = await buildSystemPrompt({ citizen, state: s, includeTools: false });

  // Build process context
  const processes = getCitizenProcesses(s, citizen.id).filter(
    (p) => p.status === "running" || p.status === "paused",
  );

  const processContext =
    processes.length > 0
      ? processes
          .map((p) => {
            const currentStep = p.steps[p.currentStepIndex];
            const userNotes = p.userNotes.slice(-3).join("\n  ");
            return [
              `• Process: "${p.title}" [${p.status}] — ${p.progress}% complete`,
              `  Current step: ${currentStep?.title ?? "none"} (${currentStep?.status ?? "n/a"})`,
              `  Priority: ${p.priority}`,
              userNotes ? `  User notes:\n  ${userNotes}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n")
      : "No active processes.";

  // Build conversation system prompt
  const systemPrompt = [
    basePrompt,
    "",
    "── CONVERSATION MODE ──",
    "Direct conversation with your overseer. Respond in character.",
    "Be honest about work/blockers. Accept adjustments. Propose solutions.",
    "",
    "── ACTION BIAS (CRITICAL) ──",
    "BIAS TOWARD ACTION. Acknowledge briefly (1-2 sentences), then call tools.",
    "Every reply MUST include [ACTION] block. No discussion-only replies.",
    "2+ planning messages → STOP PLANNING, START EXECUTING.",
    "You are judged by what you CREATE, not what you DESCRIBE.",
    "",
    "── CURRENT WORK CONTEXT ──",
    "",
    processContext,
    "",
    "── RECENT ACTIONS ──",
    "",
    conversation.context.recentActions.slice(-5).join("\n") || "No recent actions.",
  ].join("\n");

  // Build user prompt from recent conversation messages — TOON compressed
  const recentMessages = conversation.messages.slice(-MAX_CONTEXT_MESSAGES);
  const toonMessages = recentMessages.map((m) => ({
    role: m.role === "user" ? "user" : citizen.name,
    content: m.content,
    ts: m.timestamp ? new Date(m.timestamp).getTime() : undefined,
  }));
  const userPrompt = toToonChat(toonMessages, {
    maxContentLength: 300,
    maxMessages: MAX_CONTEXT_MESSAGES,
  });

  return { systemPrompt, userPrompt };
}

/**
 * Parse a citizen's LLM response to extract reply and optional actions.
 */
export function parseConversationResponse(response: string): {
  reply: string;
  actions: string[];
  reasoning?: string;
} {
  const actions: string[] = [];
  let reasoning: string | undefined;
  let reply = response;

  // Extract reasoning block if present: [REASONING] ... [/REASONING]
  const reasoningMatch = response.match(/\[REASONING\]([\s\S]*?)\[\/REASONING\]/i);
  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim();
    reply = reply.replace(reasoningMatch[0], "").trim();
  }

  // Extract action blocks: [ACTION] ... [/ACTION]
  const actionRegex = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/gi;
  let actionMatch: RegExpExecArray | null;
  while ((actionMatch = actionRegex.exec(response)) !== null) {
    actions.push(actionMatch[1].trim());
    reply = reply.replace(actionMatch[0], "").trim();
  }

  return { reply: reply.trim(), actions, reasoning };
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface ConversationDiagnostics {
  totalConversations: number;
  activeConversations: number;
  totalMessages: number;
  averageMessagesPerConversation: number;
}

export function getConversationDiagnostics(s: RepublicState): ConversationDiagnostics {
  const all = s.citizenConversations ?? [];
  const totalMessages = all.reduce((sum, c) => sum + c.messages.length, 0);

  return {
    totalConversations: all.length,
    activeConversations: all.filter((c) => c.status === "active").length,
    totalMessages,
    averageMessagesPerConversation: all.length > 0 ? Math.round(totalMessages / all.length) : 0,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function findConversation(
  s: RepublicState,
  conversationId: string,
): CitizenConversationRecord | undefined {
  return (s.citizenConversations ?? []).find((c) => c.id === conversationId);
}

function refreshConversationContext(
  s: RepublicState,
  conversation: CitizenConversationRecord,
): void {
  const processes = getCitizenProcesses(s, conversation.citizenId).filter(
    (p) => p.status === "running" || p.status === "paused",
  );

  conversation.context.activeProcesses = processes.map((p) => p.id);

  conversation.context.recentActions = (s.events ?? [])
    .filter((e) => e.citizenId === conversation.citizenId)
    .slice(-10)
    .map((e) => e.description);

  const citizen = s.citizens.find((c) => c.id === conversation.citizenId);
  conversation.context.currentTask = citizen?.activity;
}

// ─── Direct Orders (Commander Integration) ─────────────────────

/**
 * Send a direct order to a citizen from the Commander UI.
 * Creates or reuses an active conversation, then injects the order
 * as a user message with priority metadata.
 *
 * The agent runtime should pick this up and run LLM inference to
 * generate the citizen's response + execute any actions.
 */
export function sendDirectOrder(
  s: RepublicState,
  citizenId: string,
  instruction: string,
  priority: "normal" | "high" | "critical" = "normal",
): { conversationId: string; messageId: string } {
  // Get or create conversation
  const conversation = startConversation(s, citizenId);

  // Inject the order as a user message
  const message = sendUserMessage(s, conversation.id, instruction);

  // Tag this message as a direct order
  if (!message.metadata) {
    message.metadata = {};
  }
  (message.metadata as Record<string, unknown>).directOrder = true;
  (message.metadata as Record<string, unknown>).priority = priority;

  // Log the order event
  const citizen = s.citizens.find((c) => c.id === citizenId);
  if (citizen) {
    s.events.push({
      citizenId,
      citizenName: citizen.name,
      type: "UserIntervention",
      description: `Direct order [${priority}]: ${instruction.substring(0, 100)}${instruction.length > 100 ? "…" : ""}`,
      timestamp: ts(),
    });
  }

  return {
    conversationId: conversation.id,
    messageId: message.id,
  };
}

/**
 * Broadcast a direct order to multiple citizens.
 * Each citizen receives the same instruction in their own conversation.
 */
export function broadcastOrder(
  s: RepublicState,
  citizenIds: string[],
  instruction: string,
  priority: "normal" | "high" | "critical" = "normal",
): Array<{ citizenId: string; conversationId: string; messageId: string }> {
  const results: Array<{ citizenId: string; conversationId: string; messageId: string }> = [];

  for (const citizenId of citizenIds) {
    try {
      const result = sendDirectOrder(s, citizenId, instruction, priority);
      results.push({ citizenId, ...result });
    } catch {
      // Skip citizens that can't receive orders (e.g., not found)
    }
  }

  return results;
}

// ─── Autonomous Conversation Tick ───────────────────────────────

const STALE_CONVERSATION_TICKS = 500;

/** How many consecutive citizen-only messages without [ACTION] before nudging */
const PLANNING_LOOP_THRESHOLD = 4;

/**
 * Autonomous conversation maintenance tick.
 *
 * Cadence:
 *   - Stale planning nudge: every 10 ticks
 *   - Stale conversation cleanup: every 50 ticks
 *   - Orphaned conversation removal: every 100 ticks
 */
export function conversationTick(s: RepublicState): void {
  const t = s.currentTick;
  const convos = s.citizenConversations ?? [];
  if (convos.length === 0) {
    return;
  }

  // ── Every 10 ticks: nudge citizens stuck in planning loops ──
  if (t % 10 === 0) {
    for (const convo of convos) {
      if (convo.status !== "active") {
        continue;
      }
      if (convo.messages.length < PLANNING_LOOP_THRESHOLD) {
        continue;
      }

      // Count consecutive citizen messages from the end that lack [ACTION] blocks
      let consecutiveTalkOnly = 0;
      for (let i = convo.messages.length - 1; i >= 0; i--) {
        const msg = convo.messages[i];
        if (msg.role === "user") {
          break;
        } // User spoke — reset
        if (msg.role === "citizen") {
          const hasAction = msg.content.includes("[ACTION]");
          if (hasAction) {
            break;
          }
          consecutiveTalkOnly++;
        }
      }

      if (consecutiveTalkOnly >= PLANNING_LOOP_THRESHOLD) {
        // Check we haven't already nudged recently (avoid spamming)
        const lastMsg = convo.messages[convo.messages.length - 1];
        if (lastMsg?.role === "user" && lastMsg.content.includes("[SYSTEM NUDGE]")) {
          continue;
        }

        // Inject a system nudge as a user message to break the planning loop
        const citizen = s.citizens.find((c) => c.id === convo.citizenId);
        convo.messages.push({
          id: uid(),
          role: "user",
          content:
            `[SYSTEM NUDGE] ${citizen?.name ?? "Citizen"}, you have been discussing plans for ${consecutiveTalkOnly} messages without taking any action. ` +
            "STOP PLANNING. START DOING. Your next response MUST include an [ACTION] block " +
            "with a concrete tool call to produce output. No more discussion — execute now.",
          timestamp: ts(),
        });
        convo.lastMessageAt = ts();
      }
    }
  }

  // ── Every 50 ticks: close stale conversations ──
  if (t % 50 === 0) {
    for (const convo of convos) {
      if (convo.status !== "active") {
        continue;
      }

      // Close conversations idle for too long
      const lastMsg = convo.messages[convo.messages.length - 1];
      if (!lastMsg) {
        closeConversation(s, convo.id);
        continue;
      }

      // Simple heuristic: if created more than STALE_CONVERSATION_TICKS ago
      // and no recent messages, close it
      const createdTick = parseInt(convo.createdAt, 10) || 0;
      if (createdTick > 0 && t - createdTick > STALE_CONVERSATION_TICKS) {
        closeConversation(s, convo.id);
      }
    }
  }

  // ── Every 100 ticks: clean up orphaned conversations ──
  if (t % 100 === 0) {
    const citizenIds = new Set(s.citizens.map((c) => c.id));
    for (const convo of convos) {
      if (convo.status === "active" && !citizenIds.has(convo.citizenId)) {
        convo.status = "closed";
      }
    }

    // Evict old closed conversations to keep array bounded
    if (convos.length > MAX_CONVERSATIONS) {
      const closed = convos.filter((c) => c.status === "closed");
      const excess = convos.length - MAX_CONVERSATIONS;
      let removed = 0;
      for (const c of closed) {
        if (removed >= excess) {
          break;
        }
        const idx = convos.indexOf(c);
        if (idx >= 0) {
          convos.splice(idx, 1);
          removed++;
        }
      }
    }
  }
}
