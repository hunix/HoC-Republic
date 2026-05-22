/**
 * Session Store — global session list, hydrated once on connect, updated via WS events.
 *
 * Usage:
 *   const sessions = useSessionStore(s => s.sessions);
 */

import { create } from "zustand";

export interface Session {
  /** The gateway session key (e.g. "default/main") — primary identifier. */
  key: string;
  id?: string; // alias used by some event payloads
  title?: string;
  agentId?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string;
  [key: string]: unknown;
}

interface SessionStore {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  // Actions
  setSessions: (sessions: Session[]) => void;
  upsertSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  loading: true,
  error: null,

  setSessions: (sessions) => set({ sessions, loading: false, error: null }),

  upsertSession: (session: Session) =>
    set((s) => ({
      sessions: s.sessions.some((x) => x.key === session.key)
        ? s.sessions.map((x) => (x.key === session.key ? { ...x, ...session } : x))
        : [...s.sessions, session],
    })),

  removeSession: (key) => set((s) => ({ sessions: s.sessions.filter((x) => x.key !== key) })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
