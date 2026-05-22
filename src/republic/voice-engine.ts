/**
 * Voice Engine — Barrel Re-export
 */
export type {
  STTProvider,
  TTSProvider,
  VADState,
  VoiceEngineConfig,
  STTResult,
  TTSResult,
  VADEvent,
  VoiceEngineDiagnostics,
} from "./voice-engine/types.js";

export { transcribe, getAvailableSTTProviders, getSTTStats } from "./voice-engine/stt.js";

export { synthesize, getAvailableTTSProviders, getTTSStats } from "./voice-engine/tts-stream.js";

export { VoiceActivityDetector } from "./voice-engine/vad.js";
