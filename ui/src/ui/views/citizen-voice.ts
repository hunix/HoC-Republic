/**
 * Citizen Voice — Browser SpeechSynthesis Engine
 *
 * Maps VoiceProfile to browser SpeechSynthesis for zero-cost TTS:
 * - pitch, rate, volume mapped from voice profile
 * - Voice selection by timbre/accent matching
 * - Lip-sync events via SpeechSynthesis boundary events
 * - Per-citizen voice queue with mute support
 */

import type { Viseme } from "./citizen-avatar.ts";

// ─── Types ──────────────────────────────────────────────────────

export interface VoiceProfile {
  pitch: number; // Hz (80-300) → mapped to 0-2 for SpeechSynthesis
  timbre: string; // warm/bright/husky/clear/deep/silvery
  speechRate: number; // WPM (100-200) → mapped to 0.5-2 for SpeechSynthesis
  accent: string; // neutral/warm_southern/crisp_northern/etc
  cadence: string; // steady/animated/measured/rapid/melodic/staccato
  catchPhrases: string[]; // Signature phrases
  volumeTendency: number; // 0.0-1.0
}

export interface SpeechRequest {
  citizenId: string;
  citizenName: string;
  text: string;
  voiceProfile: VoiceProfile;
  onVisemeChange?: (viseme: Viseme) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

// ─── State ──────────────────────────────────────────────────────

const mutedCitizens = new Set<string>();
const speechQueue: SpeechRequest[] = [];
let currentSpeech: SpeechSynthesisUtterance | null = null;
let isSpeaking = false;
let cachedVoices: SpeechSynthesisVoice[] = [];

// ─── Voice Selection ────────────────────────────────────────────

/** Load available voices (async — browsers populate lazily) */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      cachedVoices = voices;
      resolve(voices);
      return;
    }
    speechSynthesis.onvoiceschanged = () => {
      cachedVoices = speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
  });
}

/**
 * Select the best matching voice from available browser voices
 * based on timbre and accent preferences.
 */
function selectVoice(profile: VoiceProfile): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) {
    cachedVoices = speechSynthesis.getVoices();
  }
  if (cachedVoices.length === 0) {return null;}

  // Accent → language mapping
  const accentLangMap: Record<string, string[]> = {
    neutral: ["en-US", "en"],
    warm_southern: ["en-US", "en-AU"],
    crisp_northern: ["en-GB", "en"],
    melodic_coastal: ["en-AU", "en-NZ"],
    brisk_metropolitan: ["en-US", "en-GB"],
    soft_rural: ["en-IE", "en-GB"],
    resonant_highland: ["en-GB", "en-US"],
  };

  const preferredLangs = accentLangMap[profile.accent] ?? ["en-US", "en"];

  // Timbre → voice name preferences (heuristic based on common browser voices)
  const deepVoicePatterns = ["daniel", "david", "alex", "fred", "google uk english male"];
  const brightVoicePatterns = ["samantha", "victoria", "karen", "google uk english female", "zira"];
  const warmVoicePatterns = ["allison", "moira", "fiona", "google us english"];

  let voicePatterns: string[] = [];
  switch (profile.timbre) {
    case "deep":
    case "husky":
      voicePatterns = deepVoicePatterns;
      break;
    case "bright":
    case "clear":
    case "silvery":
      voicePatterns = brightVoicePatterns;
      break;
    case "warm":
    default:
      voicePatterns = warmVoicePatterns;
      break;
  }

  // Try to match voice by pattern + language
  for (const pattern of voicePatterns) {
    for (const lang of preferredLangs) {
      const match = cachedVoices.find(
        (v) => v.name.toLowerCase().includes(pattern) && v.lang.startsWith(lang.split("-")[0]),
      );
      if (match) {return match;}
    }
  }

  // Fallback: any voice matching preferred language
  for (const lang of preferredLangs) {
    const match = cachedVoices.find((v) => v.lang.startsWith(lang.split("-")[0]));
    if (match) {return match;}
  }

  // Last resort: first available voice
  return cachedVoices[0] ?? null;
}

// ─── Pitch / Rate Mapping ───────────────────────────────────────

/** Map Hz pitch (80-300) to SpeechSynthesis pitch (0-2, default 1) */
function mapPitch(hz: number): number {
  // 80 Hz → 0.5 (low), 190 Hz → 1.0 (normal), 300 Hz → 2.0 (high)
  return Math.max(0.1, Math.min(2.0, ((hz - 80) / 220) * 1.5 + 0.5));
}

/** Map WPM (100-200) to SpeechSynthesis rate (0.5-2, default 1) */
function mapRate(wpm: number): number {
  // 100 WPM → 0.7, 150 WPM → 1.0, 200 WPM → 1.5
  return Math.max(0.5, Math.min(2.0, wpm / 150));
}

// ─── Viseme Estimation ──────────────────────────────────────────

/** Rough text-to-viseme mapping for lip-sync animation */
function estimateViseme(char: string): Viseme {
  const c = char.toLowerCase();
  if ("aàáâã".includes(c)) {return "A";}
  if ("eèéêë".includes(c)) {return "E";}
  if ("iìíîï".includes(c)) {return "I";}
  if ("oòóôõ".includes(c)) {return "O";}
  if ("uùúûü".includes(c)) {return "U";}
  return "rest";
}

// ─── Public API ─────────────────────────────────────────────────

/** Speak text as a citizen with their voice profile */
export function speak(request: SpeechRequest): void {
  if (mutedCitizens.has(request.citizenId)) {return;}

  speechQueue.push(request);
  if (!isSpeaking) {
    processQueue();
  }
}

/** Stop all speech immediately */
export function stopAll(): void {
  speechSynthesis.cancel();
  speechQueue.length = 0;
  isSpeaking = false;
  currentSpeech = null;
}

/** Stop speech for a specific citizen */
export function stopCitizen(citizenId: string): void {
  // Remove from queue
  const idx = speechQueue.findIndex((s) => s.citizenId === citizenId);
  if (idx !== -1) {
    speechQueue.splice(idx, 1);
  }
  // Cancel current if it's this citizen
  if (currentSpeech && speechQueue[0]?.citizenId === citizenId) {
    speechSynthesis.cancel();
  }
}

/** Mute/unmute a citizen */
export function toggleMute(citizenId: string): boolean {
  if (mutedCitizens.has(citizenId)) {
    mutedCitizens.delete(citizenId);
    return false;
  } else {
    mutedCitizens.add(citizenId);
    stopCitizen(citizenId);
    return true;
  }
}

/** Check if a citizen is muted */
export function isMuted(citizenId: string): boolean {
  return mutedCitizens.has(citizenId);
}

/** Check if any speech is active */
export function isAnySpeaking(): boolean {
  return isSpeaking;
}

// ─── Queue Processor ────────────────────────────────────────────

function processQueue(): void {
  if (speechQueue.length === 0) {
    isSpeaking = false;
    return;
  }

  const request = speechQueue.shift()!;
  isSpeaking = true;

  const utterance = new SpeechSynthesisUtterance(request.text);
  const voice = selectVoice(request.voiceProfile);
  if (voice) {
    utterance.voice = voice;
  }

  utterance.pitch = mapPitch(request.voiceProfile.pitch);
  utterance.rate = mapRate(request.voiceProfile.speechRate);
  utterance.volume = Math.max(0.1, Math.min(1.0, request.voiceProfile.volumeTendency));

  // Lip-sync: drive viseme changes from boundary events
  let _charIndex = 0;
  utterance.onboundary = (event) => {
    if (event.name === "word" && request.onVisemeChange) {
      // Get the first vowel in the word for viseme
      const word = request.text.substring(event.charIndex, event.charIndex + event.charLength);
      for (const char of word) {
        const v = estimateViseme(char);
        if (v !== "rest") {
          request.onVisemeChange(v);
          return;
        }
      }
      request.onVisemeChange("rest");
    }
    _charIndex = event.charIndex;
  };

  utterance.onstart = () => {
    request.onStart?.();
  };

  utterance.onend = () => {
    request.onVisemeChange?.("rest");
    request.onEnd?.();
    currentSpeech = null;
    processQueue();
  };

  // oxlint-disable-next-line prefer-add-event-listener
  utterance.onerror = () => {
    request.onVisemeChange?.("rest");
    request.onEnd?.();
    currentSpeech = null;
    processQueue();
  };

  currentSpeech = utterance;
  speechSynthesis.speak(utterance);
}
