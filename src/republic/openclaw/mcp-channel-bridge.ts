/**
 * OpenClaw MCP Channel Bridge — Adapted for HoC Republic
 *
 * Bidirectional MCP (Model Context Protocol) bridge:
 *   - Connects to external MCP servers for tool integration
 *   - Exposes HoC tools as MCP resources to external consumers
 *   - Manages conversation-scoped event queues
 *   - Supports cursor-based pagination for event retrieval
 *   - Handles Claude permission protocol (approve/deny tool calls)
 *
 * Ported from upstream openclaw/src/mcp/channel-bridge.ts
 */

import { uid, ts } from "../utils.js";

// ─── MCP Types ───────────────────────────────────────────────────

export type MCPMessageRole = "user" | "assistant" | "system" | "tool";

export interface MCPMessage {
  id: string;
  role: MCPMessageRole;
  content: string;
  /** Tool name if role === "tool" */
  toolName?: string;
  /** Tool call ID for response linking */
  toolCallId?: string;
  timestamp: string;
}

export interface MCPConversation {
  id: string;
  name: string;
  /** Owning citizen or system component */
  ownerId: string;
  /** Connected MCP server URI */
  serverUri: string;
  messages: MCPMessage[];
  /** Event queue for async events from the MCP server */
  eventQueue: MCPEvent[];
  /** Conversation metadata */
  metadata: Record<string, unknown>;
  /** Whether the conversation is active */
  active: boolean;
  createdAt: string;
  lastActivityAt: string;
}

export interface MCPEvent {
  id: string;
  type: "tool_call" | "tool_result" | "approval_request" | "approval_response" | "system" | "error";
  conversationId: string;
  data: Record<string, unknown>;
  /** Cursor for pagination */
  cursor: string;
  processed: boolean;
  timestamp: string;
}

export interface MCPToolCallRequest {
  conversationId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  /** Whether this requires user approval */
  requiresApproval: boolean;
}

export interface MCPApprovalRequest {
  id: string;
  conversationId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "denied";
  respondedAt: string | null;
}

// ─── MCP Server Connection ──────────────────────────────────────

export interface MCPServerConfig {
  uri: string;
  name: string;
  /** Transport type */
  transport: "stdio" | "sse" | "websocket";
  /** Authentication token */
  authToken?: string;
  /** Available tools on this server */
  tools: string[];
  /** Connection timeout ms */
  timeoutMs?: number;
}

// ─── Bridge Implementation ───────────────────────────────────────

class MCPChannelBridge {
  private readonly conversations = new Map<string, MCPConversation>();
  private readonly approvals = new Map<string, MCPApprovalRequest>();
  private readonly servers = new Map<string, MCPServerConfig>();
  private readonly MAX_CONVERSATIONS = 200;
  private readonly MAX_EVENTS_PER_CONVERSATION = 500;
  private cursorCounter = 0;

  /**
   * Register an MCP server configuration.
   */
  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.uri, config);
  }

  /**
   * Unregister an MCP server.
   */
  unregisterServer(uri: string): void {
    this.servers.delete(uri);
  }

  /**
   * List registered servers.
   */
  listServers(): MCPServerConfig[] {
    return [...this.servers.values()];
  }

  /**
   * Create a new MCP conversation.
   */
  createConversation(opts: {
    name: string;
    ownerId: string;
    serverUri: string;
    metadata?: Record<string, unknown>;
  }): MCPConversation {
    if (this.conversations.size >= this.MAX_CONVERSATIONS) {
      this.evictInactive();
    }

    const conversation: MCPConversation = {
      id: `mcp-${uid()}`,
      name: opts.name,
      ownerId: opts.ownerId,
      serverUri: opts.serverUri,
      messages: [],
      eventQueue: [],
      metadata: opts.metadata ?? {},
      active: true,
      createdAt: ts(),
      lastActivityAt: ts(),
    };

    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  /**
   * Add a message to a conversation.
   */
  addMessage(
    conversationId: string,
    message: Omit<MCPMessage, "id" | "timestamp">,
  ): MCPMessage | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return null;
    }

    const msg: MCPMessage = {
      ...message,
      id: `msg-${uid()}`,
      timestamp: ts(),
    };

    conversation.messages.push(msg);
    conversation.lastActivityAt = ts();

    // Trim old messages if too many
    if (conversation.messages.length > 500) {
      conversation.messages = conversation.messages.slice(-400);
    }

    return msg;
  }

  /**
   * Push an event into a conversation's queue.
   */
  pushEvent(
    conversationId: string,
    type: MCPEvent["type"],
    data: Record<string, unknown>,
  ): MCPEvent | null {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return null;
    }

    const event: MCPEvent = {
      id: `evt-${uid()}`,
      type,
      conversationId,
      data,
      cursor: `cur_${++this.cursorCounter > Number.MAX_SAFE_INTEGER ? (this.cursorCounter = 1) : this.cursorCounter}`,
      processed: false,
      timestamp: ts(),
    };

    conversation.eventQueue.push(event);
    conversation.lastActivityAt = ts();

    // Trim event queue
    if (conversation.eventQueue.length > this.MAX_EVENTS_PER_CONVERSATION) {
      conversation.eventQueue = conversation.eventQueue.slice(-400);
    }

    return event;
  }

  /**
   * Poll events from a conversation using cursor-based pagination.
   */
  pollEvents(
    conversationId: string,
    opts?: {
      afterCursor?: string;
      limit?: number;
      markProcessed?: boolean;
    },
  ): MCPEvent[] {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      return [];
    }

    let events = conversation.eventQueue;

    // Filter by cursor
    if (opts?.afterCursor) {
      const cursorNum = parseInt(opts.afterCursor.replace("cur_", ""), 10);
      events = events.filter((e) => {
        const eventCursorNum = parseInt(e.cursor.replace("cur_", ""), 10);
        return eventCursorNum > cursorNum;
      });
    }

    // Filter unprocessed only
    events = events.filter((e) => !e.processed);

    // Apply limit
    const limit = opts?.limit ?? 50;
    events = events.slice(0, limit);

    // Mark as processed if requested
    if (opts?.markProcessed) {
      for (const event of events) {
        event.processed = true;
      }
    }

    return events;
  }

  /**
   * Submit a tool call request (may require approval).
   */
  submitToolCall(request: MCPToolCallRequest): MCPApprovalRequest | MCPEvent {
    if (request.requiresApproval) {
      // Create an approval request
      const approval: MCPApprovalRequest = {
        id: `approval-${uid()}`,
        conversationId: request.conversationId,
        toolName: request.toolName,
        arguments: request.arguments,
        reason: `Tool "${request.toolName}" requires user approval`,
        status: "pending",
        respondedAt: null,
      };
      this.approvals.set(approval.id, approval);

      // Push approval event
      this.pushEvent(request.conversationId, "approval_request", {
        approvalId: approval.id,
        toolName: request.toolName,
        arguments: request.arguments,
      });

      return approval;
    }

    // Direct tool call — push event immediately
    const event = this.pushEvent(request.conversationId, "tool_call", {
      toolName: request.toolName,
      arguments: request.arguments,
    });

    return event!;
  }

  /**
   * Respond to an approval request.
   */
  respondToApproval(approvalId: string, approved: boolean): MCPApprovalRequest | null {
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.status !== "pending") {
      return null;
    }

    approval.status = approved ? "approved" : "denied";
    approval.respondedAt = ts();

    // Push response event
    this.pushEvent(approval.conversationId, "approval_response", {
      approvalId,
      approved,
      toolName: approval.toolName,
    });

    return approval;
  }

  /**
   * Get pending approvals.
   */
  getPendingApprovals(conversationId?: string): MCPApprovalRequest[] {
    const approvals = [...this.approvals.values()].filter((a) => a.status === "pending");
    if (conversationId) {
      return approvals.filter((a) => a.conversationId === conversationId);
    }
    return approvals;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  getConversation(id: string): MCPConversation | null {
    return this.conversations.get(id) ?? null;
  }

  listConversations(opts?: {
    ownerId?: string;
    active?: boolean;
    limit?: number;
  }): MCPConversation[] {
    let convos = [...this.conversations.values()];
    if (opts?.ownerId) {
      convos = convos.filter((c) => c.ownerId === opts.ownerId);
    }
    if (opts?.active !== undefined) {
      convos = convos.filter((c) => c.active === opts.active);
    }
    return convos.slice(0, opts?.limit ?? 50);
  }

  closeConversation(id: string): boolean {
    const conversation = this.conversations.get(id);
    if (!conversation) {
      return false;
    }
    conversation.active = false;
    return true;
  }

  getDiagnostics(): {
    totalConversations: number;
    activeConversations: number;
    registeredServers: number;
    pendingApprovals: number;
    totalEvents: number;
  } {
    let activeCount = 0;
    let totalEvents = 0;
    for (const convo of this.conversations.values()) {
      if (convo.active) {
        activeCount++;
      }
      totalEvents += convo.eventQueue.length;
    }
    return {
      totalConversations: this.conversations.size,
      activeConversations: activeCount,
      registeredServers: this.servers.size,
      pendingApprovals: this.getPendingApprovals().length,
      totalEvents,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private evictInactive(): void {
    const inactive: string[] = [];
    for (const [id, convo] of this.conversations) {
      if (!convo.active) {
        inactive.push(id);
      }
    }
    const toRemove = inactive.slice(0, Math.floor(this.MAX_CONVERSATIONS * 0.2));
    const removedIds = new Set(toRemove);
    for (const id of toRemove) {
      this.conversations.delete(id);
    }

    // Clean up approvals for evicted conversations + resolved approvals older than 1h
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    for (const [id, approval] of this.approvals) {
      if (removedIds.has(approval.conversationId)) {
        this.approvals.delete(id);
      } else if (
        approval.status !== "pending" &&
        approval.respondedAt &&
        approval.respondedAt < oneHourAgo
      ) {
        this.approvals.delete(id);
      }
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const mcpChannelBridge = new MCPChannelBridge();
