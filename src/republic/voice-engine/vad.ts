/**
 * Voice Engine — Voice Activity Detection (VAD)
 *
 * Lightweight energy-based VAD for detecting speech boundaries
 * in streaming audio. Used to trigger STT only when speech is detected.
 *
 * Uses zero-crossing rate + RMS energy — no ML model needed, instant.
 */

import type { VADEvent, VADState } from "./types.js";

// ─── VAD Config ──────────────────────────────────────────────────

interface VADConfig {
  /** Energy threshold to consider speech (0-1) */
  energyThreshold: number;
  /** Minimum speech duration in frames to trigger speech_start */
  minSpeechFrames: number;
  /** Number of silent frames before declaring speech_end */
  silenceFrames: number;
  /** Frame size in samples (default: 320 = 20ms at 16kHz) */
  frameSize: number;
}

const DEFAULT_CONFIG: VADConfig = {
  energyThreshold: 0.02,
  minSpeechFrames: 3,
  silenceFrames: 15,
  frameSize: 320,
};

// ─── VAD State Machine ───────────────────────────────────────────

export class VoiceActivityDetector {
  private config: VADConfig;
  private state: VADState = "silence";
  private speechFrameCount = 0;
  private silenceFrameCount = 0;
  private speechStartFrame = 0;
  private frameIndex = 0;
  private totalEvents = 0;

  constructor(config?: Partial<VADConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Process a single audio frame (PCM 16-bit LE samples) */
  processFrame(frame: Int16Array | Float32Array): VADEvent {
    this.frameIndex++;
    const energy = computeRMSEnergy(frame);
    const isSpeech = energy > this.config.energyThreshold;

    let event: VADEvent;

    switch (this.state) {
      case "silence":
        if (isSpeech) {
          this.speechFrameCount++;
          if (this.speechFrameCount >= this.config.minSpeechFrames) {
            this.state = "speech";
            this.speechStartFrame = this.frameIndex - this.config.minSpeechFrames;
            this.silenceFrameCount = 0;
            this.totalEvents++;
            event = {
              state: "speech",
              speechStartMs: this.speechStartFrame * 20, // 20ms per frame
              energy,
            };
            break;
          }
        } else {
          this.speechFrameCount = 0;
        }
        event = { state: "silence", energy };
        break;

      case "speech":
        if (!isSpeech) {
          this.silenceFrameCount++;
          if (this.silenceFrameCount >= this.config.silenceFrames) {
            this.state = "speech_end";
            const durationMs = (this.frameIndex - this.speechStartFrame) * 20;
            this.totalEvents++;
            event = {
              state: "speech_end",
              speechStartMs: this.speechStartFrame * 20,
              speechDurationMs: durationMs,
              energy,
            };
            // Reset to silence
            this.state = "silence";
            this.speechFrameCount = 0;
            this.silenceFrameCount = 0;
            break;
          }
        } else {
          this.silenceFrameCount = 0;
        }
        event = {
          state: "speech",
          speechStartMs: this.speechStartFrame * 20,
          energy,
        };
        break;

      case "speech_end":
        // Transitional — immediately go to silence
        this.state = "silence";
        this.speechFrameCount = 0;
        this.silenceFrameCount = 0;
        event = { state: "silence", energy };
        break;

      default:
        event = { state: "silence", energy };
    }

    return event;
  }

  /** Process a chunk of audio and return all events */
  processChunk(audio: Int16Array | Float32Array): VADEvent[] {
    const events: VADEvent[] = [];
    const frameSize = this.config.frameSize;

    for (let i = 0; i + frameSize <= audio.length; i += frameSize) {
      const frame = audio.slice(i, i + frameSize);
      events.push(this.processFrame(frame));
    }

    return events;
  }

  /** Get current VAD state */
  getState(): VADState {
    return this.state;
  }

  /** Get total speech events detected */
  getTotalEvents(): number {
    return this.totalEvents;
  }

  /** Reset VAD state */
  reset(): void {
    this.state = "silence";
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.speechStartFrame = 0;
    this.frameIndex = 0;
  }
}

// ─── Utilities ───────────────────────────────────────────────────

/** Compute RMS energy of an audio frame */
function computeRMSEnergy(frame: Int16Array | Float32Array): number {
  let sumSquares = 0;
  const isInt16 = frame instanceof Int16Array;

  for (let i = 0; i < frame.length; i++) {
    const sample = isInt16 ? frame[i] / 32768 : frame[i]; // Normalize to [-1, 1]
    sumSquares += sample * sample;
  }

  return Math.sqrt(sumSquares / frame.length);
}
