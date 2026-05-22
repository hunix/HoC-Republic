/**
 * Avatar Engine — Gateway Bridge Controller
 *
 * RPC controller for the Living Avatar Engine. Manages session lifecycle,
 * real-time conversation, face mesh state, and personality traits.
 */

import type { GatewayBrowserClient } from "../gateway.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface AvatarMessage {
  role: "user" | "avatar";
  text: string;
  emotion?: string;
  intent?: string;
  timestamp: number;
}

export interface AvatarSessionInfo {
  sessionId: string;
  userId: string;
  createdAt: number;
  turnCount: number;
}

export interface AvatarFaceState {
  emotion: string;
  blendshapes: Record<string, number>;
  viseme: string | null;
  confidence: number;
}

export interface AvatarPersonality {
  formality: number;
  proactivity: number;
  verbosity: number;
  empathy: number;
  humor: number;
  confidence: number;
}

export interface AvatarDiagnosticsInfo {
  activeSessions: number;
  totalInteractions: number;
  supportedEmotions: string[];
  blendshapeCount: number;
  uptime: number;
  personality: AvatarPersonality;
}

export type AvatarSection = "conversation" | "facemesh" | "personality" | "diagnostics";

// ─── State slice ────────────────────────────────────────────────

export interface AvatarState {
  client: GatewayBrowserClient | null;
  connected: boolean;
  lastError: string | null;

  avatarLoading: boolean;
  avatarSection: AvatarSection;
  avatarSessions: AvatarSessionInfo[];
  avatarActiveSessionId: string | null;
  avatarMessages: AvatarMessage[];
  avatarDraft: string;
  avatarFaceState: AvatarFaceState | null;
  avatarPersonality: AvatarPersonality | null;
  avatarDiagnostics: AvatarDiagnosticsInfo | null;
  avatarSending: boolean;
}

// ─── Defaults ───────────────────────────────────────────────────

export const AVATAR_STATE_DEFAULTS: AvatarState = {
  client: null,
  connected: false,
  lastError: null,

  avatarLoading: false,
  avatarSection: "conversation",
  avatarSessions: [],
  avatarActiveSessionId: null,
  avatarMessages: [],
  avatarDraft: "",
  avatarFaceState: null,
  avatarPersonality: null,
  avatarDiagnostics: null,
  avatarSending: false,
};

// ─── Helpers ────────────────────────────────────────────────────

async function rpc<T>(
  state: AvatarState,
  method: string,
  params: Record<string, unknown> = {},
): Promise<T | null> {
  if (!state.client || !state.connected) {return null;}
  try {
    return await state.client.request<T>(method, params);
  } catch (err) {
    state.lastError = String(err);
    return null;
  }
}

async function playVisemes(state: AvatarState, visemes: Array<{ viseme: string; durationMs: number; weight: number }>) {
  for (const v of visemes) {
    if (!state.avatarFaceState) {break;}
    // Clone to trigger reactivity
    const nextState = { ...state.avatarFaceState };
    nextState.viseme = v.viseme;
    
    // Simple jaw mapping based on viseme weight
    const bs = { ...nextState.blendshapes };
    if (["aa", "oh", "ou", "E", "ih"].includes(v.viseme)) {
      bs.jawOpen = Math.min(1.0, 0.2 + (v.weight * 0.5));
    } else if (["PP", "FF", "TH"].includes(v.viseme)) {
      bs.jawOpen = 0.05;
    } else {
      bs.jawOpen = Math.min(0.5, v.weight * 0.3);
    }
    nextState.blendshapes = bs;
    
    state.avatarFaceState = nextState;
    await new Promise(r => setTimeout(r, v.durationMs));
  }
  
  if (state.avatarFaceState) {
    state.avatarFaceState = { ...state.avatarFaceState, viseme: "sil" };
    state.avatarFaceState.blendshapes = { ...state.avatarFaceState.blendshapes, jawOpen: 0 };
  }
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {return true;}
  if (a == null || b == null) {return false;}
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

// ─── Session Lifecycle ──────────────────────────────────────────

export async function loadAvatarSessions(state: AvatarState): Promise<void> {
  const res = await rpc<{ sessions: AvatarSessionInfo[] }>(state, "republic.avatar.session.list");
  if (res) {
    const next = Array.isArray(res.sessions) ? res.sessions : [];
    if (!jsonEqual(state.avatarSessions, next)) {state.avatarSessions = next;}
  }
}

export async function createAvatarSession(
  state: AvatarState,
  userId?: string,
): Promise<string | null> {
  const uid = userId || `ui-user-${Date.now()}`;
  const res = await rpc<{ ok?: boolean; session?: { id: string } }>(
    state,
    "republic.avatar.session.create",
    { userId: uid },
  );
  if (res?.session?.id) {
    state.avatarActiveSessionId = res.session.id;
    state.avatarMessages = [];
    await loadAvatarSessions(state);
    await loadAvatarFaceState(state);
    return res.session.id;
  }
  return null;
}

export async function endAvatarSession(state: AvatarState, sessionId: string): Promise<void> {
  await rpc(state, "republic.avatar.session.end", { sessionId });
  if (state.avatarActiveSessionId === sessionId) {
    state.avatarActiveSessionId = null;
    state.avatarMessages = [];
    state.avatarFaceState = null;
  }
  await loadAvatarSessions(state);
}

// ─── Conversation ───────────────────────────────────────────────

export async function avatarSpeak(state: AvatarState, text: string): Promise<void> {
  if (!state.avatarActiveSessionId || !text.trim()) {return;}
  state.avatarSending = true;
  state.avatarDraft = "";

  // Add user message immediately for responsiveness
  const userMsg: AvatarMessage = {
    role: "user",
    text: text.trim(),
    timestamp: Date.now(),
  };
  state.avatarMessages = [...state.avatarMessages, userMsg];

  try {
    const res = await rpc<{
      ok?: boolean;
      response?: string;
      emotion?: string;
      intent?: string;
      visemes?: Array<{ viseme: string; durationMs: number; weight: number }>;
      faceState?: AvatarFaceState;
    }>(state, "republic.avatar.speak", {
      sessionId: state.avatarActiveSessionId,
      text: text.trim(),
    });

    if (res) {
      const avatarMsg: AvatarMessage = {
        role: "avatar",
        text: res.response || "...",
        emotion: res.emotion,
        intent: res.intent,
        timestamp: Date.now(),
      };
      state.avatarMessages = [...state.avatarMessages, avatarMsg];

      if (res.faceState) {
        state.avatarFaceState = res.faceState;
      }

      if (res.visemes && res.visemes.length > 0) {
        // Run animation async without blocking
        playVisemes(state, res.visemes).catch(console.error);
      }
    }
  } finally {
    state.avatarSending = false;
  }
}

export async function avatarListen(state: AvatarState, text: string): Promise<void> {
  if (!state.avatarActiveSessionId || !text.trim()) {return;}

  const res = await rpc<{
    ok?: boolean;
    intent?: string;
    emotion?: string;
    faceState?: AvatarFaceState;
  }>(state, "republic.avatar.listen", {
    sessionId: state.avatarActiveSessionId,
    text: text.trim(),
  });

  if (res?.faceState) {
    state.avatarFaceState = res.faceState;
  }
}

// ─── Face State ─────────────────────────────────────────────────

export async function loadAvatarFaceState(state: AvatarState): Promise<void> {
  if (!state.avatarActiveSessionId) {return;}

  const res = await rpc<AvatarFaceState>(state, "republic.avatar.state", {
    sessionId: state.avatarActiveSessionId,
  });
  if (res && !jsonEqual(state.avatarFaceState, res)) {
    state.avatarFaceState = res;
  }
}

// ─── Personality ────────────────────────────────────────────────

export async function loadAvatarPersonality(state: AvatarState): Promise<void> {
  const res = await rpc<{ personality: AvatarPersonality }>(
    state,
    "republic.avatar.personality",
    {},
  );
  if (res?.personality && !jsonEqual(state.avatarPersonality, res.personality)) {
    state.avatarPersonality = res.personality;
  }
}

export async function updateAvatarPersonality(
  state: AvatarState,
  traits: Partial<AvatarPersonality>,
): Promise<void> {
  await rpc(state, "republic.avatar.personality", traits);
  await loadAvatarPersonality(state);
}

// ─── Diagnostics ────────────────────────────────────────────────

export async function loadAvatarDiagnostics(state: AvatarState): Promise<void> {
  const res = await rpc<AvatarDiagnosticsInfo>(state, "republic.avatar.diagnostics");
  if (res && !jsonEqual(state.avatarDiagnostics, res)) {
    state.avatarDiagnostics = res;
  }
}

// ─── Composite Loaders ──────────────────────────────────────────

export async function loadAvatar(
  state: AvatarState,
  opts?: { quiet?: boolean },
): Promise<void> {
  if (!state.client || !state.connected || state.avatarLoading) {return;}
  state.avatarLoading = true;
  if (!opts?.quiet) {state.lastError = null;}

  try {
    await Promise.all([
      loadAvatarSessions(state),
      loadAvatarDiagnostics(state),
      loadAvatarPersonality(state),
      state.avatarActiveSessionId ? loadAvatarFaceState(state) : Promise.resolve(),
    ]);
  } catch (err) {
    if (!opts?.quiet) {state.lastError = String(err);}
  } finally {
    state.avatarLoading = false;
  }
}

// ─── Auto-refresh ───────────────────────────────────────────────

let avatarPollInterval: ReturnType<typeof setInterval> | null = null;

export function startAvatarPolling(state: AvatarState, intervalMs = 5_000): void {
  stopAvatarPolling();
  avatarPollInterval = setInterval(() => void loadAvatar(state, { quiet: true }), intervalMs);
}

export function stopAvatarPolling(): void {
  if (avatarPollInterval !== null) {
    clearInterval(avatarPollInterval);
    avatarPollInterval = null;
  }
}
