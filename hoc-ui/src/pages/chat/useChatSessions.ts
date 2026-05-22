/**
 * Chat Feature — Session Management Hook
 *
 * Manages session list, citizen list, active session derivation,
 * session switching, creation, and deletion.
 * Extracted from useChatState.ts per DDD file limits (400L max).
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/contexts/ToastContext";
import { rpc, useRpc, mutateRpc, invalidateRpcCache } from "@/lib/rpc";
import type {
  SessionsListResult,
  AgentsListResult,
  CitizensListResult,
  Message,
  TranscriptMsg,
} from "./chat.types";
import { isCitizenKey, citizenIdFromKey } from "./chat.helpers";
import { extractText } from "./markdown";

/** Strip system-injected XML tags that the gateway appends for internal routing */
const SYSTEM_XML_RE =
  /<(?:republic_project_intake|system_intelligence|system_2_insight|companion_execution|sandbox_unavailable|republic_audit)[^>]*>[\s\S]*?<\/(?:republic_project_intake|system_intelligence|system_2_insight|companion_execution|sandbox_unavailable|republic_audit)>/gi;

export function stripSystemXml(text: string): string {
  return text.replace(SYSTEM_XML_RE, "").trim();
}

export function useChatSessions() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Data hooks ──────────────────────────────────────────────────────────────
  const { data: agentData } = useRpc<AgentsListResult>("agents.list", {});
  const [sessionSearch, setSessionSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: sessionsData,
    loading: sessionsLoading,
    refetch: refetchSessions,
  } = useRpc<SessionsListResult>(
    "sessions.list",
    {
      limit: 100,
      search: debouncedSearch || undefined,
      includeDerivedTitles: true,
      includeLastMessage: true,
    },
    [debouncedSearch],
    { staleTimeMs: 10_000 },
  );

  // ── Citizens data ───────────────────────────────────────────────────────────
  const [citizenSearch, setCitizenSearch] = useState("");
  const { data: citizensData } = useRpc<CitizensListResult>(
    "republic.citizen.list",
    { limit: 200, search: citizenSearch || undefined },
    [citizenSearch],
    { staleTimeMs: 30_000 },
  );
  const citizens = citizensData?.citizens ?? [];

  // ── Active session ──────────────────────────────────────────────────────────
  const sessionFromUrl = searchParams.get("session");
  const mainKey = agentData?.mainKey ?? null;

  const activeKey = useMemo(() => {
    if (sessionFromUrl) {
      return sessionFromUrl;
    }
    const sessions = sessionsData?.sessions ?? [];
    if (sessions.length > 0 && sessions[0]) {
      return sessions[0].key;
    }
    return mainKey;
  }, [sessionFromUrl, sessionsData, mainKey]);

  const activeSession = useMemo(
    () => (sessionsData?.sessions ?? []).find((s) => s.key === activeKey) ?? null,
    [sessionsData, activeKey],
  );

  const sessions = sessionsData?.sessions ?? [];

  // ── Search debounce ─────────────────────────────────────────────────────────
  const handleSearchChange = useCallback((val: string) => {
    setSessionSearch(val);
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
    }
    searchTimer.current = setTimeout(() => setDebouncedSearch(val), 300);
  }, []);

  // ── Switch session ──────────────────────────────────────────────────────────
  const switchSession = useCallback(
    (key: string) => {
      setSearchParams({ session: key });
    },
    [setSearchParams],
  );

  // ── New conversation ────────────────────────────────────────────────────────
  const newConversation = useCallback(async () => {
    const defaultAgentId = agentData?.defaultId ?? "main";
    const newKey = `agent:${defaultAgentId}:webchat:${Date.now()}`;
    switchSession(newKey);
  }, [agentData, switchSession]);

  // ── Delete session ────────────────────────────────────────────────────────
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  const deleteSession = useCallback(
    async (key: string) => {
      try {
        await mutateRpc("sessions.delete", { key });
        toast({ variant: "success", title: "Session deleted", message: "" });
        if (key === activeKey) {
          setSearchParams({});
        }
        invalidateRpcCache("sessions.list");
        void refetchSessions();
      } catch (e) {
        toast({ variant: "error", title: "Delete failed", message: String(e) });
      }
      setConfirmDeleteKey(null);
    },
    [activeKey, setSearchParams, refetchSessions, toast],
  );

  // ── Load history ─────────────────────────────────────────────────────────
  const historyLoadedForKey = useRef<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = useCallback(
    (currentKey: string, setMessages: React.Dispatch<React.SetStateAction<Message[]>>) => {
      if (!currentKey || historyLoadedForKey.current === currentKey) {
        return;
      }
      historyLoadedForKey.current = currentKey;
      const thisKey = currentKey;
      setHistoryLoading(true);
      setMessages([]);

      if (isCitizenKey(thisKey)) {
        rpc<{ history?: { role: string; content: string; ts: number }[]; citizenName?: string }>(
          "republic.citizen.history",
          { citizenId: citizenIdFromKey(thisKey) },
        )
          .then((res) => {
            if (historyLoadedForKey.current !== thisKey) {
              return;
            }
            const raw = res?.history ?? [];
            setMessages(
              raw.map((m, i) => ({
                id: `chist-${i}`,
                role: (m.role === "assistant" ? "assistant" : "user") as Message["role"],
                content: m.content,
                ts: m.ts ?? Date.now(),
              })),
            );
          })
          .catch(() => {})
          .finally(() => {
            if (historyLoadedForKey.current === thisKey) {
              setHistoryLoading(false);
            }
          });
      } else {
        rpc<{ messages?: TranscriptMsg[] }>("chat.history", {
          sessionKey: thisKey,
          limit: 200,
        })
          .then((res) => {
            if (historyLoadedForKey.current !== thisKey) {
              return;
            }
            const raw = res?.messages ?? [];
            const loaded: Message[] = raw
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m, i) => ({
                id: `hist-${i}`,
                role: (m.role === "assistant" ? "assistant" : "user") as Message["role"],
                content: stripSystemXml(extractText(m)),
                ts: m.timestamp ?? Date.now(),
              }));
            setMessages(loaded);
          })
          .catch(() => {})
          .finally(() => {
            if (historyLoadedForKey.current === thisKey) {
              setHistoryLoading(false);
            }
          });
      }
    },
    [],
  );

  // Reset history tracking on session switch
  const resetHistoryTracker = useCallback(() => {
    historyLoadedForKey.current = null;
  }, []);

  // Clean up search timer
  useEffect(() => {
    return () => {
      if (searchTimer.current) {
        clearTimeout(searchTimer.current);
      }
    };
  }, []);

  return {
    sessions,
    sessionsLoading,
    refetchSessions,
    citizens,
    citizenSearch,
    setCitizenSearch,
    activeKey,
    activeSession,
    sessionSearch,
    handleSearchChange,
    switchSession,
    newConversation,
    deleteSession,
    confirmDeleteKey,
    setConfirmDeleteKey,
    historyLoading,
    loadHistory,
    resetHistoryTracker,
    searchParams,
    setSearchParams,
    agentData,
  };
}
