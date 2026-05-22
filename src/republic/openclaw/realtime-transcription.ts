/**
 * OpenClaw Realtime Transcription — Adapted for HoC Republic
 *
 * Provider registry for real-time speech-to-text with streaming support.
 * Manages transcription sessions that convert audio input into text
 * with timing markers and confidence scores.
 *
 * Supports multiple backends:
 *   - Whisper (local via Docker)
 *   - Google Speech-to-Text
 *   - Azure Cognitive Services
 *   - Deepgram
 *
 * Ported from upstream openclaw realtime transcription patterns.
 */

import { uid, ts } from "../utils.js";

// ─── Types ───────────────────────────────────────────────────────

export type TranscriptionState = "idle" | "listening" | "processing" | "paused" | "stopped";

export interface TranscriptionWord {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface TranscriptionResult {
  id: string;
  sessionId: string;
  text: string;
  words: TranscriptionWord[];
  language: string;
  isFinal: boolean;
  confidence: number;
  timestamp: string;
}

export interface TranscriptionSession {
  id: string;
  ownerId: string;
  providerId: string;
  state: TranscriptionState;
  /** Accumulated transcription results */
  results: TranscriptionResult[];
  /** Full assembled text */
  fullText: string;
  /** Audio format being transcribed */
  audioFormat: string;
  /** Detected language */
  detectedLanguage: string | null;
  config: Record<string, unknown>;
  createdAt: string;
  stoppedAt: string | null;
  durationMs: number;
}

// ─── Provider Interface ──────────────────────────────────────────

export interface TranscriptionProviderCapabilities {
  id: string;
  name: string;
  supportedFormats: string[]; // "pcm_16", "opus", "mp3", "wav"
  supportedLanguages: string[]; // "en", "es", "fr", etc.
  supportsStreaming: boolean;
  supportsWordTimestamps: boolean;
  supportsLanguageDetection: boolean;
  maxAudioDurationSeconds: number;
}

export interface TranscriptionProviderCallbacks {
  onPartialResult?: (result: TranscriptionResult) => void;
  onFinalResult?: (result: TranscriptionResult) => void;
  onError?: (error: Error) => void;
}

export interface ITranscriptionProvider {
  readonly capabilities: TranscriptionProviderCapabilities;

  startSession(
    config: Record<string, unknown>,
    callbacks: TranscriptionProviderCallbacks,
  ): Promise<string>;
  sendAudio(sessionId: string, audio: ArrayBuffer): Promise<void>;
  stopSession(sessionId: string): Promise<TranscriptionResult[]>;
  checkHealth(): Promise<{ available: boolean }>;
}

// ─── Registry Implementation ─────────────────────────────────────

class RealtimeTranscriptionRegistry {
  private readonly providers = new Map<string, ITranscriptionProvider>();
  private readonly sessions = new Map<string, TranscriptionSession>();
  private readonly MAX_SESSIONS = 50;

  /**
   * Register a transcription provider.
   */
  registerProvider(provider: ITranscriptionProvider): void {
    this.providers.set(provider.capabilities.id, provider);
  }

  /**
   * Unregister a provider.
   */
  unregisterProvider(providerId: string): void {
    this.providers.delete(providerId);
  }

  /**
   * List registered providers.
   */
  listProviders(): TranscriptionProviderCapabilities[] {
    return [...this.providers.values()].map((p) => p.capabilities);
  }

  /**
   * Start a transcription session.
   */
  async startSession(opts: {
    ownerId: string;
    providerId: string;
    audioFormat?: string;
    config?: Record<string, unknown>;
  }): Promise<TranscriptionSession> {
    const provider = this.providers.get(opts.providerId);
    if (!provider) {
      throw new Error(`Transcription provider "${opts.providerId}" not registered`);
    }

    if (this.sessions.size >= this.MAX_SESSIONS) {
      this.evictStopped();
    }

    const session: TranscriptionSession = {
      id: `txn-${uid()}`,
      ownerId: opts.ownerId,
      providerId: opts.providerId,
      state: "idle",
      results: [],
      fullText: "",
      audioFormat: opts.audioFormat ?? "pcm_16",
      detectedLanguage: null,
      config: opts.config ?? {},
      createdAt: ts(),
      stoppedAt: null,
      durationMs: 0,
    };

    this.sessions.set(session.id, session);

    const callbacks: TranscriptionProviderCallbacks = {
      onPartialResult: (result) => {
        // Update with partial (interim) results
        session.results.push(result);
        if (result.language && !session.detectedLanguage) {
          session.detectedLanguage = result.language;
        }
      },
      onFinalResult: (result) => {
        session.results.push(result);
        session.fullText += (session.fullText ? " " : "") + result.text;
        if (result.language) {
          session.detectedLanguage = result.language;
        }
      },
      onError: (error) => {
        session.state = "stopped";
        session.config.lastError = error.message;
      },
    };

    try {
      await provider.startSession(session.config, callbacks);
      session.state = "listening";
    } catch (err: unknown) {
      session.state = "stopped";
      session.config.lastError = err instanceof Error ? err.message : String(err);
    }

    return session;
  }

  /**
   * Send audio data to an active session.
   */
  async sendAudio(sessionId: string, audio: ArrayBuffer): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== "listening") {
      return false;
    }

    const provider = this.providers.get(session.providerId);
    if (!provider) {
      return false;
    }

    try {
      session.state = "processing";
      await provider.sendAudio(sessionId, audio);
      session.state = "listening";
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop a transcription session.
   */
  async stopSession(sessionId: string): Promise<TranscriptionSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const provider = this.providers.get(session.providerId);
    if (provider) {
      try {
        const finalResults = await provider.stopSession(sessionId);
        for (const result of finalResults) {
          session.results.push(result);
          if (result.isFinal) {
            session.fullText += (session.fullText ? " " : "") + result.text;
          }
        }
      } catch {
        // Best effort
      }
    }

    session.state = "stopped";
    session.stoppedAt = ts();
    session.durationMs = Date.now() - new Date(session.createdAt).getTime();

    return session;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  getSession(id: string): TranscriptionSession | null {
    return this.sessions.get(id) ?? null;
  }

  listSessions(opts?: { ownerId?: string; limit?: number }): TranscriptionSession[] {
    let sessions = [...this.sessions.values()];
    if (opts?.ownerId) {
      sessions = sessions.filter((s) => s.ownerId === opts.ownerId);
    }
    return sessions.slice(0, opts?.limit ?? 20);
  }

  getDiagnostics(): {
    totalSessions: number;
    activeSessions: number;
    registeredProviders: number;
  } {
    let active = 0;
    for (const session of this.sessions.values()) {
      if (session.state === "listening" || session.state === "processing") {
        active++;
      }
    }
    return {
      totalSessions: this.sessions.size,
      activeSessions: active,
      registeredProviders: this.providers.size,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────

  private evictStopped(): void {
    const stopped: string[] = [];
    for (const [id, session] of this.sessions) {
      if (session.state === "stopped") {
        stopped.push(id);
      }
    }
    for (const id of stopped.slice(0, Math.floor(this.MAX_SESSIONS * 0.3))) {
      this.sessions.delete(id);
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const realtimeTranscription = new RealtimeTranscriptionRegistry();
