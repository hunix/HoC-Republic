/**
 * Chat Handlers — Barrel
 *
 * Thin orchestrator that imports from:
 *   - chat/transcript.ts        — transcript persistence
 *   - chat/broadcast.ts         — WebSocket broadcast helpers
 *   - chat/preview.ts           — sandbox preview port probe
 *   - chat/types.ts             — shared types
 *   - chat/intercepts/*.ts      — 5 intercept pipelines
 *
 * This file delegates to submodules — never add business logic here.
 */

import { randomUUID } from "node:crypto";
import type { MsgContext } from "../../auto-reply/templating.js";
import type {
  ChatHistoryParams,
  ChatAbortParams,
  ChatSendFullParams,
  ChatInjectParams,
} from "./rpc-params.js";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { resolveThinkingDefault } from "../../agents/model-selection.js";
import { resolveAgentTimeoutMs } from "../../agents/timeout.js";
import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { createReplyDispatcher } from "../../auto-reply/reply/reply-dispatcher.js";
import { createReplyPrefixOptions } from "../../channels/reply-prefix.js";
import { loadConfig } from "../../config/config.js";
import { resolveSendPolicy } from "../../sessions/send-policy.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import {
  abortChatRunById,
  abortChatRunsForSessionKey,
  isChatStopCommandText,
  resolveChatRunExpiresAtMs,
} from "../chat-abort.js";
import { parseMessageWithAttachments, type ChatImageContent } from "../chat-attachments.js";
import { stripEnvelopeFromMessages } from "../chat-sanitize.js";
import { GATEWAY_CLIENT_CAPS, hasGatewayClientCap } from "../protocol/client-info.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChatAbortParams,
  validateChatHistoryParams,
  validateChatInjectParams,
  validateChatSendParams,
} from "../protocol/index.js";
import { getMaxChatHistoryMessagesBytes } from "../server-constants.js";
import {
  capArrayByJsonBytes,
  loadSessionEntry,
  readSessionMessages,
  resolveSessionModelRef,
} from "../session-utils.js";
import { formatForLog } from "../ws-log.js";
import { injectTimestamp, timestampOptsFromConfig } from "./agent-timestamp.js";
// ── Submodule imports ──────────────────────────────────────────────
import { broadcastChatFinal, broadcastChatError } from "./chat/broadcast.js";
import { tryAgentLoopIntercept } from "./chat/intercepts/agent-loop-intercept.js";
import { augmentWithIntelligence } from "./chat/intercepts/intelligence-intercept.js";
import { tryKaliIntercept } from "./chat/intercepts/kali-intercept.js";
import { augmentWithRepublicIntake } from "./chat/intercepts/republic-intake-intercept.js";
import { tryResearchIntercept } from "./chat/intercepts/research-intercept.js";
import { trySandboxIntercept } from "./chat/intercepts/sandbox-intercept.js";
import { appendAssistantTranscriptMessage } from "./chat/transcript.js";

// ── Re-exports for external consumers ──────────────────────────────
export type { TranscriptAppendResult } from "./chat/types.js";
export {
  resolveTranscriptPath,
  ensureTranscriptFile,
  appendAssistantTranscriptMessage,
} from "./chat/transcript.js";
export { broadcastChatFinal, broadcastChatError, broadcastChatDelta } from "./chat/broadcast.js";
export { probeSandboxPreviewPort } from "./chat/preview.js";

// ── Handlers ─────────────────────────────────────────────────────
export const chatHandlers: GatewayRequestHandlers = {
  "chat.history": async ({ params, respond, context }) => {
    if (!validateChatHistoryParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.history params: ${formatValidationErrors(validateChatHistoryParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, limit } = params as ChatHistoryParams;
    const { cfg, storePath, entry } = loadSessionEntry(sessionKey);
    const sessionId = entry?.sessionId;
    const rawMessages =
      sessionId && storePath ? readSessionMessages(sessionId, storePath, entry?.sessionFile) : [];
    const hardMax = 1000;
    const defaultLimit = 200;
    const requested = typeof limit === "number" ? limit : defaultLimit;
    const max = Math.min(hardMax, requested);
    const sliced = rawMessages.length > max ? rawMessages.slice(-max) : rawMessages;
    const sanitized = stripEnvelopeFromMessages(sliced);
    const capped = capArrayByJsonBytes(sanitized, getMaxChatHistoryMessagesBytes()).items;
    let thinkingLevel = entry?.thinkingLevel;
    if (!thinkingLevel) {
      const configured = cfg.agents?.defaults?.thinkingDefault;
      if (configured) {
        thinkingLevel = configured;
      } else {
        const sessionAgentId = resolveSessionAgentId({ sessionKey, config: cfg });
        const { provider, model } = resolveSessionModelRef(cfg, entry, sessionAgentId);
        const catalog = await context.loadGatewayModelCatalog();
        thinkingLevel = resolveThinkingDefault({
          cfg,
          provider,
          model,
          catalog,
        });
      }
    }
    const verboseLevel = entry?.verboseLevel ?? cfg.agents?.defaults?.verboseDefault;
    respond(true, {
      sessionKey,
      sessionId,
      messages: capped,
      thinkingLevel,
      verboseLevel,
    });
  },

  "chat.abort": ({ params, respond, context }) => {
    if (!validateChatAbortParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.abort params: ${formatValidationErrors(validateChatAbortParams.errors)}`,
        ),
      );
      return;
    }
    const { sessionKey, runId } = params as ChatAbortParams;
    const ops = {
      chatAbortControllers: context.chatAbortControllers,
      chatRunBuffers: context.chatRunBuffers,
      chatDeltaSentAt: context.chatDeltaSentAt,
      chatAbortedRuns: context.chatAbortedRuns,
      removeChatRun: context.removeChatRun,
      agentRunSeq: context.agentRunSeq,
      broadcast: context.broadcast,
      nodeSendToSession: context.nodeSendToSession,
    };

    if (!runId) {
      const res = abortChatRunsForSessionKey(ops, { sessionKey, stopReason: "rpc" });
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const active = context.chatAbortControllers.get(runId);
    if (!active) {
      respond(true, { ok: true, aborted: false, runIds: [] });
      return;
    }
    if (active.sessionKey !== sessionKey) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "runId does not match sessionKey"),
      );
      return;
    }

    const res = abortChatRunById(ops, { runId, sessionKey, stopReason: "rpc" });
    respond(true, {
      ok: true,
      aborted: res.aborted,
      runIds: res.aborted ? [runId] : [],
    });
  },

  "chat.send": async ({ params, respond, context, client }) => {
    if (!validateChatSendParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.send params: ${formatValidationErrors(validateChatSendParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as ChatSendFullParams;

    // Auto-subscribe node clients (ESP32/M5Stick) to the session
    if ((client?.connect as { role?: string } | undefined)?.role === "node" && client?.connId) {
      const node = context.nodeRegistry.listConnected().find((n) => n.connId === client.connId);
      if (node) {
        context.nodeSubscribe(node.nodeId, p.sessionKey);
      }
    }

    const stopCommand = isChatStopCommandText(p.message);
    const normalizedAttachments =
      p.attachments
        ?.map((a) => ({
          type: typeof a?.type === "string" ? a.type : undefined,
          mimeType: typeof a?.mimeType === "string" ? a.mimeType : undefined,
          fileName: typeof a?.fileName === "string" ? a.fileName : undefined,
          content:
            typeof a?.content === "string"
              ? a.content
              : ArrayBuffer.isView(a?.content)
                ? Buffer.from(
                    a.content.buffer,
                    a.content.byteOffset,
                    a.content.byteLength,
                  ).toString("base64")
                : undefined,
        }))
        .filter((a) => a.content) ?? [];
    const rawMessage = p.message.trim();
    if (!rawMessage && normalizedAttachments.length === 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "message or attachment required"),
      );
      return;
    }
    let parsedMessage = p.message;
    let parsedImages: ChatImageContent[] = [];
    if (normalizedAttachments.length > 0) {
      try {
        const parsed = await parseMessageWithAttachments(p.message, normalizedAttachments, {
          maxBytes: 5_000_000,
          log: context.logGateway,
        });
        parsedMessage = parsed.message;
        parsedImages = parsed.images;
      } catch (err) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(err)));
        return;
      }
    }

    // ── Intelligence Augmentation (Quantum Bridge + News) ──
    parsedMessage = await augmentWithIntelligence({
      parsedMessage,
      context,
      clientId: client?.connect?.client?.id ?? "unknown",
    });

    // ── Intercept Chain (short-circuits if handled) ──────────

    // 1. Sandbox direct execution
    const sandboxResult = await trySandboxIntercept({ p, parsedMessage, context, respond });
    if (sandboxResult.handled) return;
    if (sandboxResult.augmentedMessage) parsedMessage = sandboxResult.augmentedMessage;

    // 2. Kali security scanner
    if (await tryKaliIntercept({ p, parsedMessage, context, respond })) return;

    // 3. Deep research orchestrator
    if (await tryResearchIntercept({ p, parsedMessage, context, respond })) return;

    // 4. Autonomous agent loop
    if (await tryAgentLoopIntercept({ p, parsedMessage, context, respond })) return;

    // 5. Republic project intake (fire-and-forget, never intercepts)
    parsedMessage = augmentWithRepublicIntake({
      parsedMessage,
      sessionKey: p.sessionKey,
      context,
      clientId: client?.connect?.client?.id ?? "anonymous",
    });

    // ── Standard LLM Dispatch ──────────────────────────────
    const { cfg, entry: rawEntry } = loadSessionEntry(p.sessionKey);

    // Apply in-memory model override
    const { getSessionModelOverride } = await import("./models.js");
    const modelOverride = p.model ? undefined : getSessionModelOverride(p.sessionKey);
    const entry = rawEntry ?? ({} as import("../../config/sessions.js").SessionEntry);
    if (p.model) {
      const slash = p.model.indexOf("/");
      if (slash > 0) {
        (entry as Record<string, unknown>).providerOverride = p.model.slice(0, slash);
        (entry as Record<string, unknown>).modelOverride = p.model.slice(slash + 1);
      } else {
        (entry as Record<string, unknown>).modelOverride = p.model;
      }
    } else if (modelOverride) {
      (entry as Record<string, unknown>).providerOverride = modelOverride.provider;
      (entry as Record<string, unknown>).modelOverride = modelOverride.modelId;
    }
    const timeoutMs = resolveAgentTimeoutMs({ cfg, overrideMs: p.timeoutMs });
    const now = Date.now();
    const clientRunId = p.idempotencyKey;

    const sendPolicy = resolveSendPolicy({
      cfg,
      entry,
      sessionKey: p.sessionKey,
      channel: entry?.channel,
      chatType: entry?.chatType,
    });
    if (sendPolicy === "deny") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "send blocked by session policy"),
      );
      return;
    }

    if (stopCommand) {
      const res = abortChatRunsForSessionKey(
        {
          chatAbortControllers: context.chatAbortControllers,
          chatRunBuffers: context.chatRunBuffers,
          chatDeltaSentAt: context.chatDeltaSentAt,
          chatAbortedRuns: context.chatAbortedRuns,
          removeChatRun: context.removeChatRun,
          agentRunSeq: context.agentRunSeq,
          broadcast: context.broadcast,
          nodeSendToSession: context.nodeSendToSession,
        },
        { sessionKey: p.sessionKey, stopReason: "stop" },
      );
      respond(true, { ok: true, aborted: res.aborted, runIds: res.runIds });
      return;
    }

    const cached = context.dedupe.get(`chat:${clientRunId}`);
    if (cached) {
      respond(cached.ok, cached.payload, cached.error, { cached: true });
      return;
    }

    const activeExisting = context.chatAbortControllers.get(clientRunId);
    if (activeExisting) {
      respond(true, { runId: clientRunId, status: "in_flight" as const }, undefined, {
        cached: true,
        runId: clientRunId,
      });
      return;
    }

    try {
      const abortController = new AbortController();
      context.chatAbortControllers.set(clientRunId, {
        controller: abortController,
        sessionId: entry?.sessionId ?? clientRunId,
        sessionKey: p.sessionKey,
        startedAtMs: now,
        expiresAtMs: resolveChatRunExpiresAtMs({ now, timeoutMs }),
      });
      const ackPayload = { runId: clientRunId, status: "started" as const };
      respond(true, ackPayload, undefined, { runId: clientRunId });

      const trimmedMessage = parsedMessage.trim();
      const injectThinking = Boolean(
        p.thinking && trimmedMessage && !trimmedMessage.startsWith("/"),
      );
      const commandBody = injectThinking ? `/think ${p.thinking} ${parsedMessage}` : parsedMessage;
      const clientInfo = client?.connect?.client;
      const stampedMessage = injectTimestamp(parsedMessage, timestampOptsFromConfig(cfg));

      const ctx: MsgContext = {
        Body: parsedMessage,
        BodyForAgent: stampedMessage,
        BodyForCommands: commandBody,
        RawBody: parsedMessage,
        CommandBody: commandBody,
        SessionKey: p.sessionKey,
        Provider: INTERNAL_MESSAGE_CHANNEL,
        Surface: INTERNAL_MESSAGE_CHANNEL,
        OriginatingChannel: INTERNAL_MESSAGE_CHANNEL,
        ChatType: "direct",
        CommandAuthorized: true,
        MessageSid: clientRunId,
        SenderId: clientInfo?.id,
        SenderName: clientInfo?.displayName,
        SenderUsername: clientInfo?.displayName,
        GatewayClientScopes: client?.connect?.scopes,
      };

      const agentId = resolveSessionAgentId({ sessionKey: p.sessionKey, config: cfg });
      const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
        cfg,
        agentId,
        channel: INTERNAL_MESSAGE_CHANNEL,
      });
      const finalReplyParts: string[] = [];
      const dispatcher = createReplyDispatcher({
        ...prefixOptions,
        onError: (err) => {
          context.logGateway.warn(`webchat dispatch failed: ${formatForLog(err)}`);
        },
        deliver: async (payload, info) => {
          if (info.kind !== "final") return;
          const text = payload.text?.trim() ?? "";
          if (!text) return;
          finalReplyParts.push(text);
        },
      });

      let agentRunStarted = false;
      void dispatchInboundMessage({
        ctx,
        cfg,
        dispatcher,
        replyOptions: {
          runId: clientRunId,
          abortSignal: abortController.signal,
          images: parsedImages.length > 0 ? parsedImages : undefined,
          disableBlockStreaming: true,
          onAgentRunStart: (runId) => {
            agentRunStarted = true;
            context.addChatRun(runId, { sessionKey: p.sessionKey, clientRunId });
            const connId = typeof client?.connId === "string" ? client.connId : undefined;
            const wantsToolEvents = hasGatewayClientCap(
              client?.connect?.caps,
              GATEWAY_CLIENT_CAPS.TOOL_EVENTS,
            );
            if (connId && wantsToolEvents) {
              context.registerToolEventRecipient(runId, connId);
            }
          },
          onModelSelected,
        },
      })
        .then(() => {
          if (!agentRunStarted) {
            const combinedReply = finalReplyParts
              .map((part) => part.trim())
              .filter(Boolean)
              .join("\n\n")
              .trim();
            let message: Record<string, unknown> | undefined;
            if (combinedReply) {
              const { storePath: latestStorePath, entry: latestEntry } = loadSessionEntry(
                p.sessionKey,
              );
              const sessionId = latestEntry?.sessionId ?? entry?.sessionId ?? clientRunId;
              const appended = appendAssistantTranscriptMessage({
                message: combinedReply,
                sessionId,
                storePath: latestStorePath,
                sessionFile: latestEntry?.sessionFile,
                createIfMissing: true,
              });
              if (appended.ok) {
                message = appended.message;
              } else {
                context.logGateway.warn(
                  `webchat transcript append failed: ${appended.error ?? "unknown error"}`,
                );
                const now = Date.now();
                message = {
                  role: "assistant",
                  content: [{ type: "text", text: combinedReply }],
                  timestamp: now,
                  stopReason: "injected",
                  usage: { input: 0, output: 0, totalTokens: 0 },
                };
              }
            }
            broadcastChatFinal({
              context,
              runId: clientRunId,
              sessionKey: p.sessionKey,
              message,
            });
          }
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: true,
            payload: { runId: clientRunId, status: "ok" as const },
          });
        })
        .catch((err) => {
          const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
          context.dedupe.set(`chat:${clientRunId}`, {
            ts: Date.now(),
            ok: false,
            payload: {
              runId: clientRunId,
              status: "error" as const,
              summary: String(err),
            },
            error,
          });
          broadcastChatError({
            context,
            runId: clientRunId,
            sessionKey: p.sessionKey,
            errorMessage: String(err),
          });
        })
        .finally(() => {
          context.chatAbortControllers.delete(clientRunId);
        });
    } catch (err) {
      const error = errorShape(ErrorCodes.UNAVAILABLE, String(err));
      const payload = {
        runId: clientRunId,
        status: "error" as const,
        summary: String(err),
      };
      context.dedupe.set(`chat:${clientRunId}`, {
        ts: Date.now(),
        ok: false,
        payload,
        error,
      });
      respond(false, payload, error, {
        runId: clientRunId,
        error: formatForLog(err),
      });
    }
  },

  "chat.inject": async ({ params, respond, context }) => {
    if (!validateChatInjectParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.inject params: ${formatValidationErrors(validateChatInjectParams.errors)}`,
        ),
      );
      return;
    }
    const p = params as ChatInjectParams;
    const { storePath, entry } = loadSessionEntry(p.sessionKey);
    const sessionId = entry?.sessionId;
    if (!sessionId || !storePath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "session not found"));
      return;
    }

    const { default: path } = await import("node:path");
    const { default: fs } = await import("node:fs");
    const transcriptPath = entry?.sessionFile
      ? entry.sessionFile
      : path.join(path.dirname(storePath), `${sessionId}.jsonl`);

    if (!fs.existsSync(transcriptPath)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "transcript file not found"),
      );
      return;
    }

    const now = Date.now();
    const messageId = randomUUID().slice(0, 8);
    const labelPrefix = p.label ? `[${p.label}]\n\n` : "";
    const messageBody: Record<string, unknown> = {
      role: "assistant",
      content: [{ type: "text", text: `${labelPrefix}${p.message}` }],
      timestamp: now,
      stopReason: "injected",
      usage: { input: 0, output: 0, totalTokens: 0 },
    };
    const transcriptEntry = {
      type: "message",
      id: messageId,
      timestamp: new Date(now).toISOString(),
      message: messageBody,
    };

    try {
      fs.appendFileSync(transcriptPath, `${JSON.stringify(transcriptEntry)}\n`, "utf-8");
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `failed to write transcript: ${errMessage}`),
      );
      return;
    }

    const chatPayload = {
      runId: `inject-${messageId}`,
      sessionKey: p.sessionKey,
      seq: 0,
      state: "final" as const,
      message: transcriptEntry.message,
    };
    context.broadcast("chat", chatPayload);
    context.nodeSendToSession(p.sessionKey, "chat", chatPayload);

    respond(true, { ok: true, messageId });
  },
};
