/**
 * Gateway Store — global gateway connection state
 */

import { create } from "zustand";

export interface GatewayState {
  connected: boolean;
  agentMode: boolean;
  url: string;
  version: string;
  uptime: string;
  nodeCount: number;
  agentCount: number;
  pluginCount: number;
  citizenCount: number;
  sessionCount: number;
  error: string | null;

  // Actions
  setConnected: (connected: boolean) => void;
  setStatus: (status: Partial<GatewayState>) => void;
  setError: (error: string | null) => void;
}

export const useGatewayStore = create<GatewayState>((set) => ({
  connected: false,
  agentMode: false,
  url: "",
  version: "",
  uptime: "",
  nodeCount: 0,
  agentCount: 0,
  pluginCount: 0,
  citizenCount: 0,
  sessionCount: 0,
  error: null,

  setConnected: (connected) => set({ connected }),
  setStatus: (status) => set(status),
  setError: (error) => set({ error }),
}));
