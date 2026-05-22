/**
 * ClawRouter Controller
 *
 * State management and RPC calls for the ClawRouter configuration UI.
 */

import type { GatewayBrowserClient } from "../gateway.ts";
import type { ClawRouterModel, ClawRouterConfig, ClawRouterBalance } from "../views/clawrouter.ts";

// ─── State ──────────────────────────────────────────────────────

export interface ClawRouterState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  clawrouterLoading: boolean;
  clawrouterConfig: ClawRouterConfig | null;
  clawrouterModels: ClawRouterModel[];
  clawrouterBalance: ClawRouterBalance;
  clawrouterBalanceLoading: boolean;
  clawrouterHealthy: boolean | null;
  clawrouterStats: string | null;
  clawrouterSection: "status" | "models" | "config" | "wallet";
  clawrouterModelSort: "price" | "name" | "context";
  clawrouterModelSearch: string;
}

export const CLAWROUTER_STATE_DEFAULTS: Pick<
  ClawRouterState,
  | "clawrouterLoading"
  | "clawrouterConfig"
  | "clawrouterModels"
  | "clawrouterBalance"
  | "clawrouterBalanceLoading"
  | "clawrouterHealthy"
  | "clawrouterStats"
  | "clawrouterSection"
  | "clawrouterModelSort"
  | "clawrouterModelSearch"
> = {
  clawrouterLoading: false,
  clawrouterConfig: null,
  clawrouterModels: [],
  clawrouterBalance: null,
  clawrouterBalanceLoading: false,
  clawrouterHealthy: null,
  clawrouterStats: null,
  clawrouterSection: "status",
  clawrouterModelSort: "price",
  clawrouterModelSearch: "",
};

// ─── RPC Helpers ────────────────────────────────────────────────

async function crRpc<T>(state: ClawRouterState, method: string, params?: unknown): Promise<T | null> {
  if (!state.client || !state.connected) {return null;}
  try {
    return await state.client.request<T>(method, params);
  } catch {
    return null;
  }
}

// ─── Data Loading ───────────────────────────────────────────────

export async function loadClawRouterData(state: ClawRouterState): Promise<void> {
  if (!state.client || !state.connected || state.clawrouterLoading) {return;}
  state.clawrouterLoading = true;

  // Load config, models, and health in parallel
  const [configRes, modelsRes, healthRes, statsRes] = await Promise.all([
    crRpc<{ ok: boolean; config: ClawRouterConfig }>(state, "republic.clawrouter.config.get"),
    crRpc<{ ok: boolean; models: ClawRouterModel[] }>(state, "republic.clawrouter.models"),
    crRpc<{ ok: boolean; healthy: boolean }>(state, "republic.clawrouter.health"),
    crRpc<{ ok: boolean; stats: string }>(state, "republic.clawrouter.stats"),
  ]);

  if (configRes?.ok) {state.clawrouterConfig = configRes.config;}
  if (modelsRes?.ok) {state.clawrouterModels = modelsRes.models;}
  if (healthRes?.ok) {state.clawrouterHealthy = healthRes.healthy;}
  if (statsRes?.ok) {state.clawrouterStats = statsRes.stats;}

  state.clawrouterLoading = false;
}

export async function loadClawRouterBalance(state: ClawRouterState): Promise<void> {
  if (!state.client || !state.connected) {return;}
  state.clawrouterBalanceLoading = true;

  const res = await crRpc<{ ok: boolean; balance: ClawRouterBalance }>(
    state,
    "republic.clawrouter.balance",
  );
  if (res?.ok) {state.clawrouterBalance = res.balance;}

  state.clawrouterBalanceLoading = false;
}

// ─── Actions ────────────────────────────────────────────────────

export async function setClawRouterProfile(state: ClawRouterState, profile: string): Promise<void> {
  await crRpc(state, "republic.clawrouter.config.set", { routingProfile: profile });
  if (state.clawrouterConfig) {state.clawrouterConfig.routingProfile = profile;}
}

export async function startClawRouter(state: ClawRouterState): Promise<void> {
  await crRpc(state, "republic.clawrouter.start");
  await loadClawRouterData(state);
}

export async function stopClawRouter(state: ClawRouterState): Promise<void> {
  await crRpc(state, "republic.clawrouter.stop");
  await loadClawRouterData(state);
}

export async function setClawRouterCompression(state: ClawRouterState, enabled: boolean): Promise<void> {
  await crRpc(state, "republic.clawrouter.config.set", { compressionEnabled: enabled });
  if (state.clawrouterConfig) {state.clawrouterConfig.compressionEnabled = enabled;}
}

export async function setClawRouterCacheTTL(state: ClawRouterState, ttl: number): Promise<void> {
  await crRpc(state, "republic.clawrouter.config.set", { cacheTTLMs: ttl });
  if (state.clawrouterConfig) {state.clawrouterConfig.cacheTTLMs = ttl;}
}
