/**
 * Chat Feature — Actions Hook
 *
 * Manages message sending, abort, memory recall/pin, model switching,
 * copy, delete, export, and keyboard shortcuts.
 * Extracted from useChatState.ts per DDD file limits (400L max).
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useToast } from "@/contexts/ToastContext";
import { rpc } from "@/lib/rpc";
import type { Message, AttachedFile, MemoryRecallResult, RightTab } from "./chat.types";
import { MODEL_OPTIONS } from "./chat.constants";
import { isCitizenKey, citizenIdFromKey, exportToPdf } from "./chat.helpers";
import { stripSystemXml } from "./useChatSessions";

interface UseChatActionsParams {
  activeKey: string | null;
  messages: Message[];
  sending: boolean;
  setSending: (v: boolean) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  input: string;
  setInput: (v: string) => void;
  attachedFiles: AttachedFile[];
  clearAttachedFiles: () => void;
  activeSession: { derivedTitle?: string; displayName?: string } | null;
  totalTokens: number;
  searchParams: URLSearchParams;
  setSearchParams: (params: Record<string, string>, opts?: { replace?: boolean }) => void;
  sendingRef: React.MutableRefObject<boolean>;
  sendingTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  resetToolState: () => void;
  refetchSessions: () => void;
  thinkModelId: string | null;
  execModelId: string | null;
  setLeftPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDesktopViewMode: React.Dispatch<React.SetStateAction<"terminal" | "desktop">>;
  newConversation: () => Promise<void>;
  resetHistoryTracker: () => void;
}

export function useChatActions(params: UseChatActionsParams) {
  const {
    activeKey,
    messages,
    sending,
    setSending,
    setMessages,
    input,
    setInput,
    attachedFiles,
    clearAttachedFiles,
    activeSession,
    totalTokens,
    searchParams,
    setSearchParams,
    sendingRef,
    sendingTimeoutRef,
    inputRef,
    resetToolState,
    refetchSessions,
    thinkModelId,
    execModelId,
    setLeftPanelOpen,
    setRightPanelOpen,
    setDesktopViewMode,
    newConversation,
    resetHistoryTracker,
  } = params;

  const { toast } = useToast();

  // ── Active run tracking ───────────────────────────────────────────────────
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // ── Memory recall/pin ─────────────────────────────────────────────────────
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [memoryContext, setMemoryContext] = useState<string>("");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [pinningMsgId, setPinningMsgId] = useState<string | null>(null);

  const recallGenRef = useRef(0);
  const recallMemory = useCallback(
    async (query: string) => {
      if (!query.trim() || !activeKey) {
        return;
      }
      const scope = isCitizenKey(activeKey)
        ? `citizen:${citizenIdFromKey(activeKey)}`
        : `agent:${activeKey.split(":")[1] ?? "main"}`;
      const gen = ++recallGenRef.current;
      setMemoryLoading(true);
      try {
        const res = await rpc<MemoryRecallResult>("memory.recall", {
          scope,
          query,
          maxTokens: 800,
        });
        if (gen === recallGenRef.current) {
          setMemoryContext(res?.text ?? "");
        }
      } catch {
        if (gen === recallGenRef.current) {
          setMemoryContext("");
        }
      }
      if (gen === recallGenRef.current) {
        setMemoryLoading(false);
      }
    },
    [activeKey],
  );

  useEffect(() => {
    if (memoryPanelOpen && input.trim()) {
      void recallMemory(input);
    }
    if (!memoryPanelOpen) {
      setMemoryContext("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoryPanelOpen]);

  const pinMemory = useCallback(
    async (content: string, msgId: string) => {
      if (!activeKey) {
        return;
      }
      const scope = isCitizenKey(activeKey)
        ? `citizen:${citizenIdFromKey(activeKey)}`
        : `agent:${activeKey.split(":")[1] ?? "main"}`;
      setPinningMsgId(msgId);
      try {
        await rpc("memory.store", {
          scope,
          content,
          memoryType: "anchor",
          importance: 0.9,
          sessionKey: activeKey,
        });
        toast({
          variant: "success",
          title: "Pinned to memory",
          message: "This will be recalled in future conversations.",
        });
      } catch (e) {
        toast({ variant: "error", title: "Pin failed", message: String(e) });
      }
      setPinningMsgId(null);
    },
    [activeKey, toast],
  );

  // ── Model selector ──────────────────────────────────────────────────────────
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [dualModelOpen, setDualModelOpen] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  const switchModel = useCallback(
    async (option: (typeof MODEL_OPTIONS)[number]) => {
      if (!activeKey) {
        return;
      }
      setModelDropdownOpen(false);
      if (option.id === "auto") {
        setActiveModelId(null);
        try {
          await rpc("models.switch", {
            sessionKey: activeKey,
            provider: "anthropic",
            modelId: "claude-opus-4-6",
          });
        } catch {
          /* best-effort */
        }
        return;
      }
      setActiveModelId(option.id);
      try {
        await rpc("models.switch", {
          sessionKey: activeKey,
          provider: option.provider,
          modelId: option.modelId,
        });
        toast({
          variant: "success",
          title: "Model switched",
          message: `Now using ${option.label}`,
        });
      } catch (e) {
        toast({ variant: "error", title: "Switch failed", message: String(e) });
      }
    },
    [activeKey, toast],
  );

  // Close model dropdown on outside click
  useEffect(() => {
    if (!modelDropdownOpen) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelDropdownOpen]);

  // ── Copy message ──────────────────────────────────────────────────────────
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyMessage = useCallback((msgId: string, content: string) => {
    void navigator.clipboard.writeText(content);
    setCopiedMsgId(msgId);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => {
      setCopiedMsgId((c) => (c === msgId ? null : c));
      copyTimerRef.current = null;
    }, 1500);
  }, []);

  // ── Delete message ────────────────────────────────────────────────────────
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<string | null>(null);

  const deleteMessage = useCallback(
    (msgId: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      setConfirmDeleteMsgId(null);
      toast({
        variant: "success",
        title: "Message removed",
        message: "Removed from view (transcript preserved)",
      });
    },
    [toast, setMessages],
  );

  // ── Export to PDF ──────────────────────────────────────────────────────────
  const handleExportPdf = useCallback(() => {
    const title = activeSession?.derivedTitle ?? activeSession?.displayName ?? "Chat Export";
    exportToPdf(messages, title, totalTokens);
  }, [messages, activeSession, totalTokens]);

  // ── Clear view ────────────────────────────────────────────────────────────
  const clearView = useCallback(() => {
    setMessages([]);
    resetHistoryTracker();
  }, [setMessages, resetHistoryTracker]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if ((!trimmed && attachedFiles.length === 0) || sending || !activeKey) {
      return;
    }

    const idempotencyKey = crypto.randomUUID();
    const cleanedMessage = stripSystemXml(trimmed);
    const displayContent =
      attachedFiles.length > 0
        ? `${cleanedMessage}${cleanedMessage ? "\n" : ""}📎 ${attachedFiles.map((f) => f.name).join(", ")}`
        : cleanedMessage;
    const userMsg: Message = {
      id: idempotencyKey,
      role: "user",
      content: displayContent,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    const filesToSend = [...attachedFiles];
    clearAttachedFiles();
    setSending(true);
    setActiveRunId(idempotencyKey);
    setRightPanelOpen(true);
    setDesktopViewMode("desktop");

    if (sendingTimeoutRef.current) {
      clearTimeout(sendingTimeoutRef.current);
    }
    sendingTimeoutRef.current = setTimeout(
      () => {
        if (sendingRef.current) {
          setSending(false);
          setActiveRunId(null);
          resetToolState();
        }
        sendingTimeoutRef.current = null;
      },
      5 * 60 * 1000,
    );

    if (!searchParams.get("session")) {
      setSearchParams({ session: activeKey }, { replace: true });
    }

    if (isCitizenKey(activeKey)) {
      try {
        const res = await rpc<{ reply?: string; citizenName?: string }>(
          "republic.citizen.command",
          { citizenId: citizenIdFromKey(activeKey), message: trimmed },
        );
        const reply = res?.reply ?? "…";
        setMessages((prev) => [
          ...prev,
          { id: `citizen-${idempotencyKey}`, role: "assistant", content: reply, ts: Date.now() },
        ]);
      } catch (e: unknown) {
        const errText = e instanceof Error ? e.message : String(e);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${idempotencyKey}`,
            role: "assistant",
            content: errText,
            ts: Date.now(),
            error: true,
          },
        ]);
        toast({ variant: "error", title: "Citizen error", message: errText });
      }
      setSending(false);
      setActiveRunId(null);
    } else {
      try {
        const sendParams: Record<string, unknown> = {
          message: trimmed || "(see attached files)",
          sessionKey: activeKey,
          idempotencyKey,
        };
        if (thinkModelId) {
          sendParams.thinkModelId = thinkModelId;
        }
        if (execModelId) {
          sendParams.execModelId = execModelId;
        }
        if (filesToSend.length > 0) {
          sendParams.attachments = filesToSend.map((f) => ({
            type: f.type.startsWith("image/") ? "image" : "file",
            mimeType: f.type,
            fileName: f.name,
            content: f.base64,
          }));
        }
        await rpc<{ sessionKey?: string; runId?: string }>("chat.send", sendParams);
      } catch (e: unknown) {
        const errText = e instanceof Error ? e.message : String(e);
        const isTimeout = errText.includes("RPC timeout");
        if (isTimeout) {
          setMessages((prev) => [
            ...prev,
            {
              id: `timeout-info-${Date.now()}`,
              role: "assistant",
              content:
                "⏳ The request is still processing in the background. Please wait — the response will appear when ready.",
              ts: Date.now(),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${idempotencyKey}`,
              role: "assistant",
              content: errText,
              ts: Date.now(),
              error: true,
            },
          ]);
          setSending(false);
          setActiveRunId(null);
          toast({ variant: "error", title: "Send failed", message: errText });
        }
      }
    }
  }, [
    input,
    sending,
    activeKey,
    toast,
    attachedFiles,
    searchParams,
    setSearchParams,
    thinkModelId,
    execModelId,
    setSending,
    setMessages,
    setInput,
    clearAttachedFiles,
    setRightPanelOpen,
    setDesktopViewMode,
    sendingRef,
    sendingTimeoutRef,
    resetToolState,
  ]);

  // ── Abort ─────────────────────────────────────────────────────────────────
  const handleAbort = useCallback(async () => {
    if (!activeRunId || !activeKey) {
      return;
    }
    try {
      await rpc("chat.abort", { sessionKey: activeKey, runId: activeRunId });
    } catch {
      /* best-effort */
    } finally {
      setSending(false);
      setActiveRunId(null);
      resetToolState();
    }
  }, [activeRunId, activeKey, setSending, resetToolState]);

  // ── Keyboard handlers ─────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
      if (e.key === "Escape" && sendingRef.current) {
        void handleAbort();
      }
    },
    [handleSend, handleAbort, sendingRef],
  );

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault();
        setLeftPanelOpen((v) => !v);
      }
      if (e.ctrlKey && e.key === "i") {
        e.preventDefault();
        setRightPanelOpen((v) => !v);
      }
      if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        void newConversation();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [newConversation, setLeftPanelOpen, setRightPanelOpen]);

  // ── Placeholder text ──────────────────────────────────────────────────────
  const placeholder = !activeKey
    ? "Select a conversation or start a new one…"
    : sending
      ? "Waiting for response… (Esc to abort)"
      : "Type a message… (Enter to send, Shift+Enter for newline)";

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  return {
    activeRunId,
    setActiveRunId,
    memoryPanelOpen,
    setMemoryPanelOpen,
    memoryContext,
    memoryLoading,
    pinningMsgId,
    recallMemory,
    pinMemory,
    modelDropdownOpen,
    setModelDropdownOpen,
    activeModelId,
    dualModelOpen,
    setDualModelOpen,
    modelDropdownRef,
    switchModel,
    copiedMsgId,
    confirmDeleteMsgId,
    setConfirmDeleteMsgId,
    deleteMessage,
    handleExportPdf,
    clearView,
    handleSend,
    handleAbort,
    handleKeyDown,
    copyMessage,
    placeholder,
  };
}
