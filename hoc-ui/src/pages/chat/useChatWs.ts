/**
 * Chat Feature — WebSocket Event Hook
 *
 * Manages all real-time WebSocket event handlers for chat/agent events
 * and structured tool events (Manus-style step tracking).
 * Extracted from useChatState.ts per DDD file limits (400L max).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { onWsMessage, invalidateRpcCache } from "@/lib/rpc";
import type { Message, TranscriptMsg, ContextLogEntry, ToolEvent } from "./chat.types";
import { extractText } from "./markdown";

interface UseChatWsParams {
  activeKeyRef: React.MutableRefObject<string | null>;
  sendingRef: React.MutableRefObject<boolean>;
  sendingTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  refetchSessions: () => void;
}

export function useChatWs({
  activeKeyRef,
  sendingRef,
  sendingTimeoutRef,
  refetchSessions,
}: UseChatWsParams) {
  const [contextLog, setContextLog] = useState<ContextLogEntry[]>([]);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);

  // Expose setters for external reset (e.g., session switch)
  const resetToolState = useCallback(() => {
    setToolEvents([]);
    setContextLog([]);
  }, []);

  // ── Setters needed by parent hook ──────────────────────────────────────────
  const setSendingExternal = useRef<((v: boolean) => void) | null>(null);
  const setActiveRunIdExternal = useRef<((v: string | null) => void) | null>(null);
  const setMessagesExternal = useRef<React.Dispatch<React.SetStateAction<Message[]>> | null>(null);
  const setRightPanelOpenExternal = useRef<((v: boolean) => void) | null>(null);
  const setDesktopViewModeExternal = useRef<((v: "terminal" | "desktop") => void) | null>(null);

  const bindExternalSetters = useCallback(
    (setters: {
      setSending: (v: boolean) => void;
      setActiveRunId: (v: string | null) => void;
      setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
      setRightPanelOpen: (v: boolean) => void;
      setDesktopViewMode: (v: "terminal" | "desktop") => void;
    }) => {
      setSendingExternal.current = setters.setSending;
      setActiveRunIdExternal.current = setters.setActiveRunId;
      setMessagesExternal.current = setters.setMessages;
      setRightPanelOpenExternal.current = setters.setRightPanelOpen;
      setDesktopViewModeExternal.current = setters.setDesktopViewMode;
    },
    [],
  );

  // ── WebSocket chat events ─────────────────────────────────────────────────
  useEffect(() => {
    const off = onWsMessage((msg) => {
      if (msg.type !== "event") {
        return;
      }
      const event = msg.event as string;
      if (event !== "chat" && event !== "agent") {
        return;
      }

      const payload = msg.payload as Record<string, unknown> | undefined;
      if (!payload) {
        return;
      }

      const evtSessionKey = String(payload.sessionKey ?? "");
      if (evtSessionKey && evtSessionKey !== activeKeyRef.current) {
        return;
      }

      const runId = String(payload.runId ?? payload.id ?? "");

      // Track tool execution events in the context log
      if (runId) {
        const evtType = String(payload.state ?? "event");
        const logType: ContextLogEntry["type"] =
          evtType === "error" ? "status" : evtType.includes("tool") ? "tool" : "info";
        setContextLog((prev) => [
          ...prev.slice(-99),
          {
            id: `ctx-${Date.now()}`,
            ts: Date.now(),
            text: `[${evtType}] ${runId.slice(0, 40)}`,
            type: logType,
          },
        ]);
      }

      const state = String(payload.state ?? "");
      const msgObj = payload.message;
      const errorText = typeof payload.errorMessage === "string" ? payload.errorMessage : "";
      const legacyText = String(payload.text ?? payload.delta ?? "");
      const text = msgObj
        ? extractText(msgObj)
        : legacyText || (state === "error" ? `❌ ${errorText || "Unknown error"}` : "");
      const role = ((msgObj as TranscriptMsg | undefined)?.role ??
        payload.role ??
        "assistant") as Message["role"];

      const isIntermediateStart = runId.includes("-start-") && state === "final";
      const isDone =
        !isIntermediateStart &&
        (state === "final" || state === "aborted" || state === "error" || Boolean(payload.done));
      const isError = state === "error";

      setMessagesExternal.current?.((prev) => {
        const streamId = runId
          ? `stream-${runId.replace(/-start-|-progress-|-final-/g, "-")}`
          : `agent-response-${Date.now()}`;
        const existingIdx = prev.findIndex((m) => m.id === streamId);
        if (existingIdx >= 0) {
          return prev.map((m) => {
            if (m.id !== streamId) {
              return m;
            }
            const newContent =
              state === "final" && !isIntermediateStart && msgObj
                ? text
                : text
                  ? m.content && m.content !== text
                    ? m.content + "\n" + text
                    : text
                  : m.content;
            return {
              ...m,
              content: newContent,
              streaming: !isDone,
              error: isError || m.error,
            };
          });
        }
        if (!text && !isDone) {
          return prev;
        }
        return [
          ...prev,
          { id: streamId, role, content: text, ts: Date.now(), streaming: !isDone, error: isError },
        ];
      });

      if (isDone) {
        setSendingExternal.current?.(false);
        setActiveRunIdExternal.current?.(null);
        if (sendingTimeoutRef.current) {
          clearTimeout(sendingTimeoutRef.current);
          sendingTimeoutRef.current = null;
        }
        const msgUsage = (msgObj as Record<string, unknown> | undefined)?.usage as
          | Record<string, unknown>
          | undefined;
        const toks = Number(msgUsage?.totalTokens ?? msgUsage?.total_tokens ?? 0);
        if (toks > 0) {
          setTotalTokens((prev) => prev + toks);
        }
        invalidateRpcCache("sessions.list");
        void refetchSessions();
        setToolEvents([]);
      }
    });
    return off;
  }, [refetchSessions, activeKeyRef, sendingRef, sendingTimeoutRef]);

  // ── WebSocket agent.tool events (structured step tracking) ───────────────
  useEffect(() => {
    const off = onWsMessage((msg) => {
      if (msg.type !== "event") {
        return;
      }
      if ((msg.event as string) !== "agent.tool") {
        return;
      }
      const payload = msg.payload as (ToolEvent & { sessionKey?: string }) | undefined;
      if (!payload) {
        return;
      }
      if (payload.sessionKey && payload.sessionKey !== activeKeyRef.current) {
        return;
      }

      setToolEvents((prev) => {
        if (prev.length === 0 && payload.status === "start") {
          setRightPanelOpenExternal.current?.(true);
          setDesktopViewModeExternal.current?.("desktop");
        }
        if (payload.status === "start") {
          return [...prev, { ...payload }];
        }
        const idx = prev.findLastIndex(
          (e) => e.toolName === payload.toolName && e.status === "start",
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...payload };
          return updated;
        }
        return [...prev, { ...payload }];
      });

      if (payload.toolName !== "thinking") {
        const desc = payload.description ?? payload.toolName;
        const durationSuffix =
          payload.durationMs != null
            ? ` (${payload.durationMs > 1000 ? `${(payload.durationMs / 1000).toFixed(1)}s` : `${payload.durationMs}ms`})`
            : "";
        const logType: ContextLogEntry["type"] = payload.status === "error" ? "status" : "tool";
        const logText =
          payload.status === "start"
            ? `▶ ${desc}`
            : payload.status === "error"
              ? `✗ ${desc}${durationSuffix}`
              : `✓ ${desc}${durationSuffix}`;
        setContextLog((prev) => [
          ...prev.slice(-99),
          {
            id: `tool-${Date.now()}-${payload.stepIndex ?? 0}`,
            ts: Date.now(),
            text: logText,
            type: logType,
          },
        ]);
      }
    });
    return off;
  }, [activeKeyRef]);

  return {
    contextLog,
    toolEvents,
    totalTokens,
    resetToolState,
    bindExternalSetters,
  };
}
