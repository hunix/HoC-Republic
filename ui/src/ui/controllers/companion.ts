/**
 * Companion Controller
 *
 * State and RPC interface for managing companion applications:
 * - React + Supabase PWA (the Lovable-built companion app)
 * - Chrome Extension
 * - Windows Companion Service
 * - Future companion integrations
 */

import type { GatewayBrowserClient } from "../gateway.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface CompanionApp {
  id: string;
  name: string;
  type: "pwa" | "chrome-extension" | "windows-service" | "other";
  status: "connected" | "disconnected" | "error" | "unknown";
  version: string | null;
  lastSeen: number | null;
  endpoint: string | null;
  config: Record<string, unknown>;
  capabilities: string[];
}

export interface CompanionStatus {
  apps: CompanionApp[];
  totalConnected: number;
  lastRefreshed: number;
}

// ─── State ──────────────────────────────────────────────────────

export interface CompanionState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  companionLoading: boolean;
  companionStatus: CompanionStatus | null;
  companionError: string | null;
}

export const COMPANION_STATE_DEFAULTS: Pick<
  CompanionState,
  "companionLoading" | "companionStatus" | "companionError"
> = {
  companionLoading: false,
  companionStatus: null,
  companionError: null,
};

// ─── RPC Helpers ────────────────────────────────────────────────

async function companionRpc<T>(state: CompanionState, method: string, params?: unknown): Promise<T | null> {
  if (!state.client || !state.connected) {return null;}
  try {
    return await state.client.request<T>(method, params);
  } catch (err) {
    state.companionError = String(err);
    return null;
  }
}

// ─── Data Loading ───────────────────────────────────────────────

export async function loadCompanionStatus(state: CompanionState): Promise<void> {
  if (!state.client || !state.connected || state.companionLoading) {return;}
  state.companionLoading = true;
  state.companionError = null;

  const result = await companionRpc<CompanionStatus>(state, "companion.status");

  if (result) {
    state.companionStatus = result;
  } else if (!state.companionError) {
    // Server may not have the companion RPC yet — show empty state
    state.companionStatus = {
      apps: getDefaultCompanionApps(),
      totalConnected: 0,
      lastRefreshed: Date.now(),
    };
  }
  state.companionLoading = false;
}

// ─── Actions ────────────────────────────────────────────────────

export async function pingCompanion(state: CompanionState, appId: string): Promise<boolean> {
  const result = await companionRpc<{ ok: boolean }>(state, "companion.ping", { appId });
  return result?.ok ?? false;
}

export async function configureCompanion(
  state: CompanionState,
  appId: string,
  config: Record<string, unknown>,
): Promise<boolean> {
  const result = await companionRpc<{ ok: boolean }>(state, "companion.configure", { appId, config });
  if (result?.ok) {
    void loadCompanionStatus(state);
  }
  return result?.ok ?? false;
}

// ─── Default Apps ───────────────────────────────────────────────

function getDefaultCompanionApps(): CompanionApp[] {
  return [
    {
      id: "pwa",
      name: "HoC Companion (React PWA)",
      type: "pwa",
      status: "unknown",
      version: null,
      lastSeen: null,
      endpoint: null,
      config: {},
      capabilities: ["notifications", "voice", "biometrics", "task-management"],
    },
    {
      id: "chrome-extension",
      name: "HoC Chrome Extension",
      type: "chrome-extension",
      status: "unknown",
      version: null,
      lastSeen: null,
      endpoint: null,
      config: {},
      capabilities: ["page-context", "tab-management", "content-injection", "screenshot"],
    },
    {
      id: "windows-service",
      name: "HoC Windows Companion Service",
      type: "windows-service",
      status: "unknown",
      version: null,
      lastSeen: null,
      endpoint: null,
      config: {},
      capabilities: ["mouse-control", "keyboard-control", "screen-capture", "process-management"],
    },
  ];
}
