/**
 * Voice Engine — Types
 *
 * Real-time voice I/O with VAD, Whisper STT, and streaming TTS.
 */

export type STTProvider = "whisper-local" | "whisper-api" | "assemblyai" | "groq-whisper";
export type TTSProvider = "chatterbox" | "bark" | "qwen3-tts" | "elevenlabs" | "openai-tts";
export type VADState = "silence" | "speech" | "speech_end";

export interface VoiceEngineConfig {
  sttProvider: STTProvider;
  ttsProvider: TTSProvider;
  /** Sample rate for audio input (default: 16000) */
  sampleRate: number;
  /** Language code (default: "en") */
  language: string;
  /** Voice ID for TTS */
  voiceId?: string;
  /** Whether to enable VAD */
  vadEnabled: boolean;
  /** VAD sensitivity threshold (0-1) */
  vadThreshold: number;
}

export interface STTResult {
  /** Transcribed text */
  text: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Processing time in ms */
  latencyMs: number;
  /** Whether this is a final result */
  isFinal: boolean;
  /** Language detected */
  language?: string;
  /** Segments with timestamps */
  segments?: Array<{ start: number; end: number; text: string }>;
}

export interface TTSResult {
  /** Base64-encoded audio (WAV/MP3) */
  audioBase64: string;
  /** Audio format */
  format: "wav" | "mp3" | "opus";
  /** Audio duration in ms */
  durationMs: number;
  /** Processing time in ms */
  latencyMs: number;
}

export interface VADEvent {
  state: VADState;
  /** Start time of speech segment (ms) */
  speechStartMs?: number;
  /** Duration of detected speech (ms) */
  speechDurationMs?: number;
  /** Energy level (0-1) */
  energy: number;
}

export interface VoiceEngineDiagnostics {
  sttProvider: STTProvider;
  ttsProvider: TTSProvider;
  totalSTTCalls: number;
  totalTTSCalls: number;
  avgSTTLatencyMs: number;
  avgTTSLatencyMs: number;
  vadEvents: number;
}
