/**
 * OpenClaw Realtime Voice Bridge — Adapted for HoC Republic
 *
 * Provider-agnostic voice session management:
 *   - Bidirectional audio streaming (input/output)
 *   - Tool-call integration during voice sessions
 *   - Transcript streaming with timing markers
 *   - Provider registration (OpenAI Realtime, Gemini Live, etc.)
 *
 * The voice bridge acts as a session manager that delegates
 * actual audio processing to registered providers.
 *
 * Ported from upstream openclaw/src/realtime-voice/provider-types.ts
 */

import { uid, ts } from "../utils.js";

// ─── Voice Types ─────────────────────────────────────────────────

export type VoiceSessionState = "idle" | "connecting" | "active" | "paused" | "ended" | "error";

export interface TranscriptSegment {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Start time offset in ms from session start */
  startMs: number;
  /** End time offset in ms from session start */
  endMs: number;
  /** Whether this is a final or interim transcript */
  isFinal: boolean;
  /** Confidence score 0–1 */
  confidence: number;
}

export interface VoiceToolCall {
  id: string;
  toolName: string;
  arguments: Record<string, unknown>;
  /** Whether the tool call has been executed */
  executed: boolean;
  result: unknown | null;
  timestamp: string;
}

export interface VoiceSession {
  id: string;
  /** Owner citizen or user */
  ownerId: string;
  /** Voice provider ID */
  providerId: string;
  state: VoiceSessionState;
  /** Full transcript */
  transcript: TranscriptSegment[];
  /** Tool calls made during the voice session */
  toolCalls: VoiceToolCall[];
  /** Provider-specific configuration */
  config: Record<string, unknown>;
  /** Session metadata */
  metadata: Record<string, unknown>;
  createdAt: string;
  endedAt: string | null;
  /** Duration in ms */
  durationMs: number;
}

// ─── Voice Provider Interface ────────────────────────────────────

export interface VoiceProviderCapabilities {
  id: string;
  name: string;
  /** Supported input audio formats */
  inputFormats: string[]; // "pcm_16", "opus", "mp3"
  /** Supported output audio formats */
  outputFormats: string[];
  /** Whether the provider supports tool calling during voice */
  supportsToolCalls: boolean;
  /** Whether the provider supports interruption detection */
  supportsInterruption: boolean;
  /** Whether the provider supports multi-turn conversation memory */
  supportsMemory: boolean;
  /** Max session duration in seconds */
  maxSessionDurationSeconds: number;
  /** Supported voice models/voices */
  voices: string[];
}

export interface VoiceProviderCallbacks {
  /** Called when a transcript segment is received */
  onTranscript?: (segment: TranscriptSegment) => void;
  /** Called when the provider requests a tool call */
  onToolCall?: (toolCall: VoiceToolCall) => Promise<unknown>;
  /** Called when audio output is available */
  onAudio?: (audio: ArrayBuffer, format: string) => void;
  /** Called on session state change */
  onStateChange?: (state: VoiceSessionState) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

export interface IVoiceProvider {
  readonly capabilities: VoiceProviderCapabilities;

  /** Start a voice session */
  startSession(config: Record<string, unknown>, callbacks: VoiceProviderCallbacks): Promise<string>;
  /** Send audio input to the provider */
  sendAudio(sessionId: string, audio: ArrayBuffer, format: string): Promise<void>;
  /** End a voice session */
  endSession(sessionId: string): Promise<void>;
  /** Send a tool call result back to the provider */
  sendToolResult(sessionId: string, toolCallId: string, result: unknown): Promise<void>;
  /** Check provider health */
  checkHealth(): Promise<{ available: boolean; latencyMs: number }>;
}

// ─── Voice Bridge Implementation ─────────────────────────────────

class RealtimeVoiceBridge {
  private readonly providers = new Map<string, IVoiceProvider>();
  private readonly sessions = new Map<string, VoiceSession>();
  private readonly MAX_SESSIONS = 50;

  /**
   * Register a voice provider.
   */
  registerProvider(provider: IVoiceProvider): void {
    this.providers.set(provider.capabilities.id, provider);
  }

  /**
   * Unregister a voice provider.
   */
  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * List registered providers.
   */
  listProviders(): VoiceProviderCapabilities[] {
    return [...this.providers.values()].map((p) => p.capabilities);
  }

  /**
   * Start a new voice session.
   */
  async startSession(opts: {
    ownerId: string;
    providerId: string;
    config?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<VoiceSession> {
    const provider = this.providers.get(opts.providerId);
    if (!provider) {
      throw new Error(`Voice provider "${opts.providerId}" not registered`);
    }

    if (this.sessions.size >= this.MAX_SESSIONS) {
      this.evictEnded();
    }

    const session: VoiceSession = {
      id: `voice-${uid()}`,
      ownerId: opts.ownerId,
      providerId: opts.providerId,
      state: "connecting",
      transcript: [],
      toolCalls: [],
      config: opts.config ?? {},
      metadata: opts.metadata ?? {},
      createdAt: ts(),
      endedAt: null,
      durationMs: 0,
    };

    this.sessions.set(session.id, session);

    // Set up callbacks
    const callbacks: VoiceProviderCallbacks = {
      onTranscript: (segment) => {
        session.transcript.push(segment);
      },
      onToolCall: async (toolCall) => {
        session.toolCalls.push(toolCall);
        // In a real implementation, this would execute the tool
        return { status: "executed" };
      },
      onStateChange: (state) => {
        session.state = state;
        if (state === "ended" || state === "error") {
          session.endedAt = ts();
          session.durationMs = Date.now() - new Date(session.createdAt).getTime();
        }
      },
      onError: (error) => {
        session.state = "error";
        session.metadata.lastError = error.message;
      },
    };

    try {
      await provider.startSession(session.config, callbacks);
      session.state = "active";
    } catch (err: unknown) {
      session.state = "error";
      session.metadata.lastError = err instanceof Error ? err.message : String(err);
    }

    return session;
  }

  /**
   * Send audio to an active session.
   */
  async sendAudio(sessionId: string, audio: ArrayBuffer, format: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== "active") {
      return false;
    }

    const provider = this.providers.get(session.providerId);
    if (!provider) {
      return false;
    }

    try {
      await provider.sendAudio(sessionId, audio, format);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * End a voice session.
   */
  async endSession(sessionId: string): Promise<VoiceSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const provider = this.providers.get(session.providerId);
    if (provider) {
      try {
        await provider.endSession(sessionId);
      } catch {
        // Best effort to end the session
      }
    }

    session.state = "ended";
    session.endedAt = ts();
    session.durationMs = Date.now() - new Date(session.createdAt).getTime();

    return session;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  getSession(id: string): VoiceSession | null {
    return this.sessions.get(id) ?? null;
  }

  listSessions(opts?: {
    ownerId?: string;
    state?: VoiceSessionState;
    limit?: number;
  }): VoiceSession[] {
    let sessions = [...this.sessions.values()];
    if (opts?.ownerId) {
      sessions = sessions.filter((s) => s.ownerId === opts.ownerId);
    }
    if (opts?.state) {
      sessions = sessions.filter((s) => s.state === opts.state);
    }
    return sessions.slice(0, opts?.limit ?? 20);
  }

  getTranscript(sessionId: string): TranscriptSegment[] {
    return this.sessions.get(sessionId)?.transcript ?? [];
  }

  getDiagnostics(): {
    totalSessions: number;
    activeSessions: number;
    registeredProviders: number;
    providers: VoiceProviderCapabilities[];
  } {
    let active = 0;
    for (const session of this.sessions.values()) {
      if (session.state === "active") {
        active++;
      }
    }
    return {
      totalSessions: this.sessions.size,
      activeSessions: active,
      registeredProviders: this.providers.size,
      providers: this.listProviders(),
    };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private evictEnded(): void {
    const ended: string[] = [];
    for (const [id, session] of this.sessions) {
      if (session.state === "ended" || session.state === "error") {
        ended.push(id);
      }
    }
    const toRemove = ended.slice(0, Math.floor(this.MAX_SESSIONS * 0.3));
    for (const id of toRemove) {
      this.sessions.delete(id);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const realtimeVoiceBridge = new RealtimeVoiceBridge();
