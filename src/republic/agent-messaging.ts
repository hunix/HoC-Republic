/**
 * Republic Platform — Inter-Agent Messaging Bus
 *
 * Structured message passing between citizen agents for collaboration,
 * task delegation, information sharing, and debate orchestration.
 *
 * Message types:
 * - request: Ask another agent to do something
 * - response: Reply to a request
 * - inform: Share knowledge/facts with peers
 * - delegate: Assign a task to a specialist
 *
 * Design:
 * - Per-citizen inbox (ring buffer, max 20 pending messages)
 * - Messages have TTL and are auto-expired
 * - Urgency levels affect processing priority
 * - Integrated into citizen system prompt (pending messages injected as context)
 */

import { uid, ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export interface AgentMessage {
  id: string;
  from: string;           // citizenId
  fromName: string;       // citizen name for readable context
  to: string;             // citizenId or "*" for broadcast
  type: "request" | "response" | "inform" | "delegate";
  topic: string;          // e.g. "need_research_on_quantum"
  payload: string;        // text content of the message
  urgency: "low" | "medium" | "high";
  createdAt: string;
  expiresAt: number;      // timestamp for TTL cleanup
  status: "pending" | "read" | "responded" | "expired";
  responseRef?: string;   // ID of message this responds to
}

// ─── Configuration ──────────────────────────────────────────────

const MAX_INBOX_SIZE = 20;
const DEFAULT_TTL_MS = 5 * 60_000;  // 5 minutes
const HIGH_URGENCY_TTL_MS = 15 * 60_000; // 15 minutes for urgent
const MAX_GLOBAL_MESSAGES = 5000;

// ─── State ──────────────────────────────────────────────────────

/** Per-citizen inbox */
const inboxes = new Map<string, AgentMessage[]>();

/** Global message log for analytics */
const messageLog: AgentMessage[] = [];

/** Broadcast messages (topic → messages) */
const broadcasts: AgentMessage[] = [];

// ─── Public API ─────────────────────────────────────────────────

/**
 * Send a message from one citizen to another (or broadcast).
 */
export function sendMessage(
  from: string,
  fromName: string,
  to: string,
  type: AgentMessage["type"],
  topic: string,
  payload: string,
  urgency: AgentMessage["urgency"] = "medium",
): AgentMessage {
  const ttl = urgency === "high" ? HIGH_URGENCY_TTL_MS : DEFAULT_TTL_MS;

  const msg: AgentMessage = {
    id: uid(),
    from,
    fromName,
    to,
    type,
    topic,
    payload: payload.slice(0, 500), // cap payload size
    urgency,
    createdAt: ts(),
    expiresAt: Date.now() + ttl,
    status: "pending",
  };

  // Broadcast handling
  if (to === "*") {
    broadcasts.push(msg);
    if (broadcasts.length > 100) {
      broadcasts.splice(0, broadcasts.length - 100);
    }
  } else {
    // Direct message → inbox
    const inbox = getOrCreateInbox(to);
    inbox.push(msg);

    // Ring buffer: keep most recent + high urgency
    if (inbox.length > MAX_INBOX_SIZE) {
      // Keep high urgency, then most recent
      const high = inbox.filter(m => m.urgency === "high" && m.status === "pending");
      const rest = inbox.filter(m => m.urgency !== "high" || m.status !== "pending")
        .slice(-MAX_INBOX_SIZE + high.length);
      const replacement = [...high, ...rest].slice(-MAX_INBOX_SIZE);
      inboxes.set(to, replacement);
    }
  }

  // Global log
  messageLog.push(msg);
  if (messageLog.length > MAX_GLOBAL_MESSAGES) {
    messageLog.splice(0, messageLog.length - MAX_GLOBAL_MESSAGES);
  }

  return msg;
}

/**
 * Get pending messages for a citizen.
 * Automatically expires stale messages.
 */
export function getMessages(
  citizenId: string,
  limit = 10,
): AgentMessage[] {
  const inbox = inboxes.get(citizenId);
  if (!inbox) { return []; }

  const now = Date.now();

  // Expire old messages
  for (const msg of inbox) {
    if (msg.status === "pending" && now > msg.expiresAt) {
      msg.status = "expired";
    }
  }

  // Return pending messages, sorted by urgency (high first)
  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return inbox
    .filter(m => m.status === "pending")
    .toSorted((a, b) => (urgencyOrder[a.urgency] ?? 1) - (urgencyOrder[b.urgency] ?? 1))
    .slice(0, limit);
}

/**
 * Get recent broadcast messages.
 */
export function getBroadcasts(limit = 5): AgentMessage[] {
  const now = Date.now();
  return broadcasts
    .filter(m => now < m.expiresAt)
    .slice(-limit);
}

/**
 * Mark a message as read.
 */
export function markAsRead(messageId: string): boolean {
  for (const inbox of inboxes.values()) {
    const msg = inbox.find(m => m.id === messageId);
    if (msg) {
      msg.status = "read";
      return true;
    }
  }
  return false;
}

/**
 * Respond to a message. Creates a response message back to the sender.
 */
export function respondToMessage(
  messageId: string,
  responderName: string,
  responsePayload: string,
): AgentMessage | null {
  // Find the original message
  let original: AgentMessage | undefined;
  for (const inbox of inboxes.values()) {
    original = inbox.find(m => m.id === messageId);
    if (original) { break; }
  }
  if (!original) { return null; }

  original.status = "responded";

  // Send reply
  const reply = sendMessage(
    original.to,
    responderName,
    original.from,
    "response",
    original.topic,
    responsePayload,
    original.urgency,
  );
  reply.responseRef = messageId;

  return reply;
}

/**
 * Build a prompt context section from pending messages.
 * Injected into citizen system prompt.
 */
export function buildMessageContext(citizenId: string): string {
  const pending = getMessages(citizenId, 5);
  const recent = getBroadcasts(3);

  if (pending.length === 0 && recent.length === 0) {
    return "";
  }

  const parts: string[] = ["## Messages from Other Citizens"];

  if (pending.length > 0) {
    parts.push("");
    for (const msg of pending) {
      const urgencyTag = msg.urgency === "high" ? "🔴 URGENT" : msg.urgency === "medium" ? "🟡" : "🟢";
      parts.push(`${urgencyTag} [${msg.type.toUpperCase()}] From ${msg.fromName}: ${msg.topic}`);
      parts.push(`  "${msg.payload.slice(0, 200)}"`);
    }
  }

  if (recent.length > 0) {
    parts.push("");
    parts.push("### Republic Broadcasts");
    for (const msg of recent) {
      parts.push(`📢 ${msg.fromName}: ${msg.payload.slice(0, 150)}`);
    }
  }

  parts.push("");
  parts.push("You may respond to messages by choosing relevant actions, or continue with your own goals.");

  return parts.join("\n");
}

/**
 * Cleanup expired messages from all inboxes.
 * Called periodically from the tick loop.
 */
export function cleanupExpiredMessages(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [citizenId, inbox] of inboxes) {
    const before = inbox.length;
    const filtered = inbox.filter(m => m.status !== "expired" && (m.status !== "pending" || now < m.expiresAt));
    if (filtered.length < before) {
      inboxes.set(citizenId, filtered);
      cleaned += before - filtered.length;
    }
  }

  // Cleanup broadcasts
  const broadcastsBefore = broadcasts.length;
  const activeBroadcasts = broadcasts.filter(m => now < m.expiresAt);
  broadcasts.length = 0;
  broadcasts.push(...activeBroadcasts);
  cleaned += broadcastsBefore - activeBroadcasts.length;

  return cleaned;
}

/**
 * Diagnostics for the messaging system.
 */
export function messagingDiagnostics() {
  let totalPending = 0;
  let totalInboxes = 0;

  for (const inbox of inboxes.values()) {
    totalInboxes++;
    totalPending += inbox.filter(m => m.status === "pending").length;
  }

  return {
    totalInboxes,
    totalPending,
    activeBroadcasts: broadcasts.filter(m => Date.now() < m.expiresAt).length,
    totalMessagesEver: messageLog.length,
    messagesByType: {
      request: messageLog.filter(m => m.type === "request").length,
      response: messageLog.filter(m => m.type === "response").length,
      inform: messageLog.filter(m => m.type === "inform").length,
      delegate: messageLog.filter(m => m.type === "delegate").length,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function getOrCreateInbox(citizenId: string): AgentMessage[] {
  let inbox = inboxes.get(citizenId);
  if (!inbox) {
    inbox = [];
    inboxes.set(citizenId, inbox);
  }
  return inbox;
}
