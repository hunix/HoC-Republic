/**
 * Chat Feature — State Hook (Barrel)
 *
 * Thin composition root that wires together 4 focused sub-hooks:
 *   - useChatSessions  — session lifecycle, citizens, history loading
 *   - useChatWs        — WebSocket event handlers (chat + tool events)
 *   - useChatFiles     — file attachments, session files, artifact preview
 *   - useChatActions   — send, abort, memory, model, copy, delete, shortcuts
 *
 * The return type (`ChatState`) is the contract that all Chat UI components
 * consume. No component should import sub-hooks directly.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Message, RightTab } from "./chat.types";
import { useChatActions } from "./useChatActions";
import { useChatFiles } from "./useChatFiles";
import { useChatSessions } from "./useChatSessions";
import { useChatWs } from "./useChatWs";

export function useChatState() {
  // ── Core message state ────────────────────────────────────────────────────
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Refs for values needed inside WS closures (avoids stale captures)
  const activeKeyRef = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const sendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Three-panel layout state ────────────────────────────────────────────────
  const [sidebarTab, setSidebarTab] = useState<"sessions" | "citizens">("sessions");
  const [leftPanelOpen, setLeftPanelOpen] = useState(() => {
    try {
      return localStorage.getItem("hoc-chat-left-panel") !== "closed";
    } catch {
      return true;
    }
  });
  const [rightPanelOpen, setRightPanelOpen] = useState(() => {
    try {
      return localStorage.getItem("hoc-chat-right-panel") !== "closed";
    } catch {
      return true;
    }
  });
  const [rightTab, setRightTab] = useState<RightTab>("context");
  const [desktopViewMode, setDesktopViewMode] = useState<"terminal" | "desktop">("desktop");

  // Persist panel state
  useEffect(() => {
    try {
      localStorage.setItem("hoc-chat-left-panel", leftPanelOpen ? "open" : "closed");
    } catch {
      /* */
    }
  }, [leftPanelOpen]);
  useEffect(() => {
    try {
      localStorage.setItem("hoc-chat-right-panel", rightPanelOpen ? "open" : "closed");
    } catch {
      /* */
    }
  }, [rightPanelOpen]);

  // ── Dual-model (Think/Exec) state ──────────────────────────────────────────
  const [thinkModelId, setThinkModelId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hoc-think-model") || null;
    } catch {
      return null;
    }
  });
  const [execModelId, setExecModelId] = useState<string | null>(() => {
    try {
      return localStorage.getItem("hoc-exec-model") || null;
    } catch {
      return null;
    }
  });

  const setThinkModel = useCallback((id: string | null) => {
    setThinkModelId(id);
    try {
      if (id) {
        localStorage.setItem("hoc-think-model", id);
      } else {
        localStorage.removeItem("hoc-think-model");
      }
    } catch {
      /* */
    }
  }, []);
  const setExecModel = useCallback((id: string | null) => {
    setExecModelId(id);
    try {
      if (id) {
        localStorage.setItem("hoc-exec-model", id);
      } else {
        localStorage.removeItem("hoc-exec-model");
      }
    } catch {
      /* */
    }
  }, []);

  // ── Compose sub-hooks ─────────────────────────────────────────────────────
  const sessionsHook = useChatSessions();
  const { activeKey, refetchSessions } = sessionsHook;

  const wsHook = useChatWs({
    activeKeyRef,
    sendingRef,
    sendingTimeoutRef,
    refetchSessions,
  });

  // Bind external setters so WS hook can update parent state
  useEffect(() => {
    wsHook.bindExternalSetters({
      setSending,
      setActiveRunId: (v) => actionsHook.setActiveRunId(v),
      setMessages,
      setRightPanelOpen,
      setDesktopViewMode,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filesHook = useChatFiles(messages);

  const actionsHook = useChatActions({
    activeKey,
    messages,
    sending,
    setSending,
    setMessages,
    input,
    setInput,
    attachedFiles: filesHook.attachedFiles,
    clearAttachedFiles: filesHook.clearAttachedFiles,
    activeSession: sessionsHook.activeSession,
    totalTokens: wsHook.totalTokens,
    searchParams: sessionsHook.searchParams,
    setSearchParams: sessionsHook.setSearchParams,
    sendingRef,
    sendingTimeoutRef,
    inputRef,
    resetToolState: wsHook.resetToolState,
    refetchSessions,
    thinkModelId,
    execModelId,
    setLeftPanelOpen,
    setRightPanelOpen,
    setDesktopViewMode,
    newConversation: sessionsHook.newConversation,
    resetHistoryTracker: sessionsHook.resetHistoryTracker,
  });

  // ── Keep refs in sync ─────────────────────────────────────────────────────
  useEffect(() => {
    activeKeyRef.current = activeKey;
  }, [activeKey]);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  // ── Session switch side-effects ───────────────────────────────────────────
  const originalSwitchSession = sessionsHook.switchSession;
  const switchSession = useCallback(
    (key: string) => {
      originalSwitchSession(key);
      setMessages([]);
      wsHook.resetToolState();
      sessionsHook.resetHistoryTracker();
    },
    [originalSwitchSession, wsHook, sessionsHook],
  );

  // ── Load history when activeKey changes ─────────────────────────────────────
  useEffect(() => {
    if (activeKey) {
      sessionsHook.loadHistory(activeKey, setMessages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // ── New conversation side-effects ────────────────────────────────────────
  const newConversation = useCallback(async () => {
    await sessionsHook.newConversation();
    inputRef.current?.focus();
  }, [sessionsHook, inputRef]);

  // ── Delete session side-effects ─────────────────────────────────────────
  const deleteSession = useCallback(
    async (key: string) => {
      await sessionsHook.deleteSession(key);
      if (key === activeKey) {
        setMessages([]);
        sessionsHook.resetHistoryTracker();
      }
    },
    [sessionsHook, activeKey],
  );

  // ── Clean up timers on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (sendingTimeoutRef.current) {
        clearTimeout(sendingTimeoutRef.current);
      }
    };
  }, []);

  return {
    // Data
    sessions: sessionsHook.sessions,
    sessionsLoading: sessionsHook.sessionsLoading,
    citizens: sessionsHook.citizens,
    activeKey,
    activeSession: sessionsHook.activeSession,
    messages,
    sessionFiles: filesHook.sessionFiles,
    artifactPreview: filesHook.artifactPreview,
    totalTokens: wsHook.totalTokens,
    contextLog: wsHook.contextLog,
    toolEvents: wsHook.toolEvents,

    // Input state
    input,
    setInput,
    placeholder: actionsHook.placeholder,
    sending,
    historyLoading: sessionsHook.historyLoading,
    attachedFiles: filesHook.attachedFiles,

    // Panel state
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    rightTab,
    setRightTab,
    desktopViewMode,
    setDesktopViewMode,
    sidebarTab,
    setSidebarTab,
    sessionSearch: sessionsHook.sessionSearch,
    citizenSearch: sessionsHook.citizenSearch,
    setCitizenSearch: sessionsHook.setCitizenSearch,
    memoryPanelOpen: actionsHook.memoryPanelOpen,
    setMemoryPanelOpen: actionsHook.setMemoryPanelOpen,
    memoryContext: actionsHook.memoryContext,
    memoryLoading: actionsHook.memoryLoading,
    filesPanelOpen: filesHook.filesPanelOpen,
    setFilesPanelOpen: filesHook.setFilesPanelOpen,
    modelDropdownOpen: actionsHook.modelDropdownOpen,
    setModelDropdownOpen: actionsHook.setModelDropdownOpen,
    activeModelId: actionsHook.activeModelId,
    dualModelOpen: actionsHook.dualModelOpen,
    setDualModelOpen: actionsHook.setDualModelOpen,
    thinkModelId,
    execModelId,
    setThinkModel,
    setExecModel,
    copiedMsgId: actionsHook.copiedMsgId,
    pinningMsgId: actionsHook.pinningMsgId,
    confirmDeleteKey: sessionsHook.confirmDeleteKey,
    setConfirmDeleteKey: sessionsHook.setConfirmDeleteKey,
    confirmDeleteMsgId: actionsHook.confirmDeleteMsgId,
    setConfirmDeleteMsgId: actionsHook.setConfirmDeleteMsgId,

    // Refs
    endRef,
    inputRef,
    fileInputRef: filesHook.fileInputRef,
    modelDropdownRef: actionsHook.modelDropdownRef,

    // Callbacks
    switchSession,
    newConversation,
    handleSend: actionsHook.handleSend,
    handleAbort: actionsHook.handleAbort,
    handleKeyDown: actionsHook.handleKeyDown,
    handleSearchChange: sessionsHook.handleSearchChange,
    handleFileSelect: filesHook.handleFileSelect,
    removeAttachment: filesHook.removeAttachment,
    switchModel: actionsHook.switchModel,
    recallMemory: actionsHook.recallMemory,
    pinMemory: actionsHook.pinMemory,
    deleteSession,
    deleteMessage: actionsHook.deleteMessage,
    handleExportPdf: actionsHook.handleExportPdf,
    clearView: actionsHook.clearView,
    copyMessage: actionsHook.copyMessage,
    refetchSessions,
  };
}

export type ChatState = ReturnType<typeof useChatState>;
