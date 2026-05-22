/**
 * Agent Store — global agent list, hydrated once on connect, updated via WS events.
 *
 * Usage:
 *   const agents = useAgentStore(s => s.agents);
 *   const { loading } = useAgentStore(s => ({ loading: s.loading }));
 */

import { create } from "zustand";

export interface Agent {
  id: string;
  name: string;
  role?: string;
  status?: string;
  model?: string;
  [key: string]: unknown;
}

interface AgentStore {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  // Actions
  setAgents: (agents: Agent[]) => void;
  upsertAgent: (agent: Agent) => void;
  removeAgent: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  loading: true,
  error: null,

  setAgents: (agents) => set({ agents, loading: false, error: null }),

  upsertAgent: (agent) =>
    set((s) => ({
      agents: s.agents.some((a) => a.id === agent.id)
        ? s.agents.map((a) => (a.id === agent.id ? { ...a, ...agent } : a))
        : [...s.agents, agent],
    })),

  removeAgent: (id) => set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
