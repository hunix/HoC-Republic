/**
 * Republic Platform — Inter-Agent Communication Protocol
 *
 * Phase 38: FIPA ACL-inspired structured communication protocol.
 *
 * Enables citizens to communicate using structured performatives
 * (inform, request, propose, negotiate, delegate) rather than
 * plain text messages, enabling automated reasoning about
 * inter-agent collaboration.
 *
 * Research basis:
 * - FIPA ACL: 20+ performatives with ontologies
 * - Google Agent2Agent (A2A): peer negotiation without coordinators
 * - Anthropic MCP: standardized tool/context protocol
 * - McKinsey 2024: >45% multi-agent failures from lack of shared protocols
 *
 * Key capabilities:
 * 1. Structured performatives (inform, request, propose, etc.)
 * 2. Conversation threading with state machines
 * 3. Bilateral/multilateral negotiation engine
 * 4. Agent capability cards for discovery
 * 5. protocolTick() — tick loop integration
 */

import { ts, uid } from "./utils.js";

// ─── Performatives ──────────────────────────────────────────────

/** FIPA-inspired speech act types */
export type Performative =
  | "inform" // Share information
  | "request" // Ask another agent to do something
  | "propose" // Make a proposal (negotiation)
  | "accept" // Accept a proposal
  | "reject" // Reject a proposal
  | "counter" // Counter-proposal
  | "agree" // Agree to a request
  | "refuse" // Refuse a request
  | "delegate" // Delegate a task
  | "query" // Ask a factual question
  | "subscribe" // Subscribe to updates
  | "cancel" // Cancel a previous message
  | "cfp" // Call for proposals (auction-like)
  | "acknowledge"; // Acknowledge receipt

// ─── Protocol Message ───────────────────────────────────────────

export interface ProtocolMessage {
  id: string;
  /** Conversation this message belongs to */
  conversationId: string;
  /** FIPA-style performative */
  performative: Performative;
  /** Sender citizen ID */
  sender: string;
  /** Receiver citizen ID(s) */
  receivers: string[];
  /** Structured content */
  content: {
    /** Human-readable description */
    description: string;
    /** Ontology domain (e.g., "task", "trade", "knowledge") */
    ontology?: string;
    /** Machine-readable payload */
    payload?: Record<string, unknown>;
  };
  /** Reference to message being replied to */
  inReplyTo?: string;
  /** Deadline for response (tick number) */
  replyBy?: number;
  /** Priority */
  priority: "low" | "normal" | "high" | "urgent";
  /** Timestamp */
  timestamp: string;
  /** Tick when sent */
  tick: number;
}

// ─── Conversation Threading ─────────────────────────────────────

export type ConversationState =
  | "open"
  | "awaiting_response"
  | "negotiating"
  | "agreed"
  | "rejected"
  | "completed"
  | "expired"
  | "cancelled";

export interface Conversation {
  id: string;
  /** Conversation topic/purpose */
  topic: string;
  /** Participants */
  participants: string[];
  /** Current state */
  state: ConversationState;
  /** All messages in this conversation */
  messages: ProtocolMessage[];
  /** Who initiated */
  initiator: string;
  /** Ontology domain */
  ontology: string;
  /** When the conversation started */
  startedAt: string;
  /** When the conversation was last updated */
  updatedAt: string;
  /** Tick deadline (auto-expire) */
  expiresAtTick?: number;
}

// ─── Agent Capability Cards ─────────────────────────────────────

/**
 * An agent's capability card — enables service discovery.
 * Other agents can query available capabilities to find the right partner.
 */
export interface AgentCard {
  citizenId: string;
  name: string;
  specialization: string;
  /** Skills this agent offers */
  capabilities: string[];
  /** Domains of expertise */
  domains: string[];
  /** Availability (0.0 = fully busy, 1.0 = fully available) */
  availability: number;
  /** Success rate for tasks */
  reliability: number;
  /** Last updated */
  updatedAt: string;
}

// ─── Negotiation ────────────────────────────────────────────────

export interface NegotiationState {
  conversationId: string;
  /** What is being negotiated */
  subject: string;
  /** Current offer on the table */
  currentOffer?: Record<string, unknown>;
  /** Number of rounds so far */
  rounds: number;
  /** Max rounds before auto-reject */
  maxRounds: number;
  /** Whether agreement was reached */
  outcome?: "agreed" | "rejected" | "expired";
}

// ─── State ──────────────────────────────────────────────────────

const conversations = new Map<string, Conversation>();
const agentCards = new Map<string, AgentCard>();
const pendingMessages: ProtocolMessage[] = [];
const MAX_CONVERSATIONS = 2000;
const MAX_PENDING = 5000;
const CONVERSATION_EXPIRY_TICKS = 200;

// ─── Message Sending ────────────────────────────────────────────

/**
 * Send a structured protocol message between citizens.
 * Automatically manages conversation threading.
 */
export function sendProtocolMessage(
  sender: string,
  receivers: string[],
  performative: Performative,
  content: ProtocolMessage["content"],
  opts?: {
    conversationId?: string;
    inReplyTo?: string;
    replyBy?: number;
    priority?: ProtocolMessage["priority"];
    currentTick?: number;
  },
): ProtocolMessage {
  const currentTick = opts?.currentTick ?? 0;

  // Find or create conversation
  let convId = opts?.conversationId;
  if (!convId) {
    convId = uid();
    const conv: Conversation = {
      id: convId,
      topic: content.description.slice(0, 100),
      participants: [sender, ...receivers],
      state: "open",
      messages: [],
      initiator: sender,
      ontology: content.ontology ?? "general",
      startedAt: ts(),
      updatedAt: ts(),
      expiresAtTick: currentTick + CONVERSATION_EXPIRY_TICKS,
    };
    conversations.set(convId, conv);
  }

  const msg: ProtocolMessage = {
    id: uid(),
    conversationId: convId,
    performative,
    sender,
    receivers,
    content,
    inReplyTo: opts?.inReplyTo,
    replyBy: opts?.replyBy,
    priority: opts?.priority ?? "normal",
    timestamp: ts(),
    tick: currentTick,
  };

  // Add to conversation
  const conv = conversations.get(convId);
  if (conv) {
    conv.messages.push(msg);
    conv.updatedAt = ts();
    updateConversationState(conv, msg);
  }

  // Add to pending queue for receiver processing
  pendingMessages.push(msg);

  return msg;
}

/**
 * Update conversation state based on the latest message.
 */
function updateConversationState(conv: Conversation, msg: ProtocolMessage): void {
  switch (msg.performative) {
    case "request":
    case "query":
    case "cfp":
      conv.state = "awaiting_response";
      break;
    case "propose":
    case "counter":
      conv.state = "negotiating";
      break;
    case "accept":
    case "agree":
      conv.state = "agreed";
      break;
    case "reject":
    case "refuse":
      conv.state = "rejected";
      break;
    case "cancel":
      conv.state = "cancelled";
      break;
    case "acknowledge":
      if (conv.state === "agreed") {
        conv.state = "completed";
      }
      break;
    default:
      // inform, subscribe, delegate keep state as-is
      break;
  }
}

// ─── Message Retrieval ──────────────────────────────────────────

/** Get pending messages for a citizen */
export function getPendingMessages(citizenId: string): ProtocolMessage[] {
  return pendingMessages.filter((m) => m.receivers.includes(citizenId));
}

/** Consume (acknowledge) pending messages for a citizen */
export function consumePendingMessages(citizenId: string): ProtocolMessage[] {
  const mine: ProtocolMessage[] = [];
  const remaining: ProtocolMessage[] = [];

  for (const msg of pendingMessages) {
    if (msg.receivers.includes(citizenId)) {
      mine.push(msg);
    } else {
      remaining.push(msg);
    }
  }

  pendingMessages.length = 0;
  pendingMessages.push(...remaining);

  return mine;
}

/** Get a conversation by ID */
export function getConversationById(conversationId: string): Conversation | undefined {
  return conversations.get(conversationId);
}

/** Get all conversations a citizen is involved in */
export function getCitizenConversations(citizenId: string): Conversation[] {
  const result: Conversation[] = [];
  for (const conv of conversations.values()) {
    if (conv.participants.includes(citizenId)) {
      result.push(conv);
    }
  }
  return result;
}

/** Get active conversations (not expired/completed/cancelled) */
export function getActiveConversations(citizenId: string): Conversation[] {
  return getCitizenConversations(citizenId).filter(
    (c) => c.state !== "completed" && c.state !== "expired" && c.state !== "cancelled",
  );
}

// ─── Negotiation Engine ─────────────────────────────────────────

const negotiations = new Map<string, NegotiationState>();

/**
 * Initiate a negotiation between two or more citizens.
 *
 * Creates a conversation with a cfp (call for proposals) performative
 * and sets up negotiation tracking.
 */
export function initiateNegotiation(
  initiator: string,
  participants: string[],
  subject: string,
  initialOffer: Record<string, unknown>,
  opts?: { maxRounds?: number; currentTick?: number },
): { conversationId: string; message: ProtocolMessage } {
  const msg = sendProtocolMessage(
    initiator,
    participants,
    "cfp",
    {
      description: `Negotiation: ${subject}`,
      ontology: "negotiation",
      payload: initialOffer,
    },
    {
      currentTick: opts?.currentTick,
      priority: "high",
    },
  );

  const negState: NegotiationState = {
    conversationId: msg.conversationId,
    subject,
    currentOffer: initialOffer,
    rounds: 1,
    maxRounds: opts?.maxRounds ?? 5,
  };

  negotiations.set(msg.conversationId, negState);

  return { conversationId: msg.conversationId, message: msg };
}

/**
 * Respond to a negotiation with a counter-proposal, acceptance, or rejection.
 */
export function respondToNegotiation(
  conversationId: string,
  responderId: string,
  action: "accept" | "reject" | "counter",
  counterOffer?: Record<string, unknown>,
  currentTick?: number,
): { success: boolean; outcome?: NegotiationState["outcome"]; error?: string } {
  const neg = negotiations.get(conversationId);
  if (!neg) {
    return { success: false, error: "Negotiation not found" };
  }
  if (neg.outcome) {
    return { success: false, error: `Negotiation already concluded: ${neg.outcome}` };
  }

  const conv = conversations.get(conversationId);
  if (!conv) {
    return { success: false, error: "Conversation not found" };
  }

  const otherParticipants = conv.participants.filter((p) => p !== responderId);

  if (action === "accept") {
    neg.outcome = "agreed";
    sendProtocolMessage(
      responderId,
      otherParticipants,
      "accept",
      {
        description: `Accepted negotiation: ${neg.subject}`,
        ontology: "negotiation",
        payload: neg.currentOffer,
      },
      { conversationId, currentTick },
    );

    return { success: true, outcome: "agreed" };
  }

  if (action === "reject") {
    neg.outcome = "rejected";
    sendProtocolMessage(
      responderId,
      otherParticipants,
      "reject",
      {
        description: `Rejected negotiation: ${neg.subject}`,
        ontology: "negotiation",
      },
      { conversationId, currentTick },
    );

    return { success: true, outcome: "rejected" };
  }

  // Counter-proposal
  neg.rounds++;
  if (neg.rounds > neg.maxRounds) {
    neg.outcome = "expired";
    sendProtocolMessage(
      responderId,
      otherParticipants,
      "reject",
      {
        description: `Negotiation expired after ${neg.maxRounds} rounds: ${neg.subject}`,
        ontology: "negotiation",
      },
      { conversationId, currentTick },
    );

    return { success: true, outcome: "expired" };
  }

  neg.currentOffer = counterOffer ?? neg.currentOffer;
  sendProtocolMessage(
    responderId,
    otherParticipants,
    "counter",
    {
      description: `Counter-proposal round ${neg.rounds}: ${neg.subject}`,
      ontology: "negotiation",
      payload: counterOffer,
    },
    { conversationId, currentTick },
  );

  return { success: true };
}

// ─── Agent Cards (Capability Discovery) ─────────────────────────

/** Register or update an agent's capability card */
export function registerAgentCard(card: AgentCard): void {
  agentCards.set(card.citizenId, { ...card, updatedAt: ts() });
}

/** Get an agent's capability card */
export function getAgentCard(citizenId: string): AgentCard | undefined {
  return agentCards.get(citizenId);
}

/** Find agents by capability */
export function findAgentsByCapability(
  capability: string,
  opts?: { minReliability?: number; minAvailability?: number },
): AgentCard[] {
  const results: AgentCard[] = [];
  const capLower = capability.toLowerCase();

  for (const card of agentCards.values()) {
    if (card.capabilities.some((c) => c.toLowerCase().includes(capLower))) {
      if (opts?.minReliability && card.reliability < opts.minReliability) {
        continue;
      }
      if (opts?.minAvailability && card.availability < opts.minAvailability) {
        continue;
      }
      results.push(card);
    }
  }

  return results.toSorted((a, b) => b.reliability - a.reliability);
}

/** Find agents by domain */
export function findAgentsByDomain(domain: string): AgentCard[] {
  const domainLower = domain.toLowerCase();
  const results: AgentCard[] = [];

  for (const card of agentCards.values()) {
    if (card.domains.some((d) => d.toLowerCase().includes(domainLower))) {
      results.push(card);
    }
  }

  return results.toSorted((a, b) => b.reliability - a.reliability);
}

// ─── Tick Integration ───────────────────────────────────────────

export interface ProtocolTickResult {
  expiredConversations: number;
  pendingMessages: number;
  activeNegotiations: number;
}

/**
 * Per-tick maintenance for the agent protocol system.
 *
 * - Expires old conversations
 * - Trims pending message queue
 * - Expires stale negotiations
 */
export function protocolTick(currentTick: number): ProtocolTickResult {
  let expired = 0;

  // Expire old conversations
  for (const [convId, conv] of conversations) {
    if (conv.expiresAtTick && currentTick > conv.expiresAtTick && conv.state !== "completed") {
      conv.state = "expired";
      expired++;

      // Expire associated negotiation
      const neg = negotiations.get(convId);
      if (neg && !neg.outcome) {
        neg.outcome = "expired";
      }
    }
  }

  // Trim conversation store
  if (conversations.size > MAX_CONVERSATIONS) {
    const sorted = [...conversations.entries()].toSorted((a, b) => {
      const scoreA = a[1].state === "completed" || a[1].state === "expired" ? 0 : 1;
      const scoreB = b[1].state === "completed" || b[1].state === "expired" ? 0 : 1;
      return scoreA - scoreB;
    });

    const toRemove = sorted.slice(0, sorted.length - MAX_CONVERSATIONS);
    for (const [id] of toRemove) {
      conversations.delete(id);
      negotiations.delete(id);
    }
  }

  // Trim pending messages
  while (pendingMessages.length > MAX_PENDING) {
    pendingMessages.shift();
  }

  const activeNegs = [...negotiations.values()].filter((n) => !n.outcome).length;

  return {
    expiredConversations: expired,
    pendingMessages: pendingMessages.length,
    activeNegotiations: activeNegs,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function protocolDiagnostics() {
  const stateDistribution: Record<string, number> = {};
  for (const conv of conversations.values()) {
    stateDistribution[conv.state] = (stateDistribution[conv.state] ?? 0) + 1;
  }

  return {
    totalConversations: conversations.size,
    stateDistribution,
    pendingMessages: pendingMessages.length,
    registeredAgents: agentCards.size,
    activeNegotiations: [...negotiations.values()].filter((n) => !n.outcome).length,
  };
}

/** Reset all protocol state (for testing) */
export function resetProtocolState(): void {
  conversations.clear();
  agentCards.clear();
  pendingMessages.length = 0;
  negotiations.clear();
}
