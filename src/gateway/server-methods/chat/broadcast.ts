/**
 * Chat Handler — Broadcast Helpers
 *
 * Shared utilities for broadcasting chat events over WebSocket
 * and to node devices via nodeSendToSession.
 */

import type { GatewayRequestContext } from "../types.js";

type BroadcastContextSlice = Pick<
  GatewayRequestContext,
  "broadcast" | "nodeSendToSession" | "agentRunSeq"
>;

export function nextChatSeq(context: { agentRunSeq: Map<string, number> }, runId: string) {
  const next = (context.agentRunSeq.get(runId) ?? 0) + 1;
  context.agentRunSeq.set(runId, next);
  return next;
}

export function broadcastChatFinal(params: {
  context: BroadcastContextSlice;
  runId: string;
  sessionKey: string;
  message?: Record<string, unknown>;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "final" as const,
    message: params.message,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}

export function broadcastChatError(params: {
  context: BroadcastContextSlice;
  runId: string;
  sessionKey: string;
  errorMessage?: string;
}) {
  const seq = nextChatSeq({ agentRunSeq: params.context.agentRunSeq }, params.runId);
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq,
    state: "error" as const,
    errorMessage: params.errorMessage,
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}

/**
 * Broadcast a delta (intermediate) message — used by intercepts that
 * stream progress updates before the final response is ready.
 */
export function broadcastChatDelta(params: {
  context: BroadcastContextSlice;
  runId: string;
  sessionKey: string;
  text: string;
  stopReason?: string;
}) {
  const payload = {
    runId: params.runId,
    sessionKey: params.sessionKey,
    seq: 0,
    state: "delta" as const,
    message: {
      role: "assistant",
      content: [{ type: "text", text: params.text }],
      timestamp: Date.now(),
      stopReason: params.stopReason ?? "streaming",
      usage: { input: 0, output: 0, totalTokens: 0 },
    },
  };
  params.context.broadcast("chat", payload);
  params.context.nodeSendToSession(params.sessionKey, "chat", payload);
}
