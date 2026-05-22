/**
 * Voice Activity Detection — Unit Tests
 *
 * Tests the energy-based VAD state machine with synthetic audio frames.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VoiceActivityDetector } from "./vad.js";

/** Create a synthetic audio frame with the given amplitude */
function makeFrame(amplitude: number, size = 320): Float32Array {
  const frame = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    frame[i] = amplitude * Math.sin((2 * Math.PI * i * 440) / 16000);
  }
  return frame;
}

/** Create a silent frame */
function silentFrame(size = 320): Float32Array {
  return new Float32Array(size);
}

describe("VoiceActivityDetector", () => {
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    vad = new VoiceActivityDetector({
      energyThreshold: 0.02,
      minSpeechFrames: 3,
      silenceFrames: 5,
    });
  });

  it("starts in silence state", () => {
    expect(vad.getState()).toBe("silence");
  });

  it("detects speech after minSpeechFrames of loud audio", () => {
    // Feed loud frames
    for (let i = 0; i < 2; i++) {
      const event = vad.processFrame(makeFrame(0.5));
      expect(event.state).toBe("silence"); // not enough frames yet
    }
    const speechEvent = vad.processFrame(makeFrame(0.5));
    expect(speechEvent.state).toBe("speech");
    expect(vad.getState()).toBe("speech");
  });

  it("stays silent for quiet audio", () => {
    for (let i = 0; i < 20; i++) {
      const event = vad.processFrame(silentFrame());
      expect(event.state).toBe("silence");
    }
  });

  it("detects speech_end after silence in speech state", () => {
    // Enter speech state
    for (let i = 0; i < 3; i++) {
      vad.processFrame(makeFrame(0.5));
    }
    expect(vad.getState()).toBe("speech");

    // Feed silent frames to trigger speech_end
    let endDetected = false;
    for (let i = 0; i < 20; i++) {
      const event = vad.processFrame(silentFrame());
      if (event.state === "speech_end") {
        endDetected = true;
        expect(event.speechDurationMs).toBeGreaterThan(0);
        break;
      }
    }
    expect(endDetected).toBe(true);
  });

  it("reports energy in every event", () => {
    const event = vad.processFrame(makeFrame(0.3));
    expect(event.energy).toBeGreaterThan(0);
  });

  it("counts total speech events", () => {
    expect(vad.getTotalEvents()).toBe(0);

    // Trigger speech start
    for (let i = 0; i < 3; i++) {
      vad.processFrame(makeFrame(0.5));
    }
    expect(vad.getTotalEvents()).toBe(1);

    // Trigger speech end
    for (let i = 0; i < 10; i++) {
      vad.processFrame(silentFrame());
    }
    expect(vad.getTotalEvents()).toBe(2);
  });

  it("resets state cleanly", () => {
    for (let i = 0; i < 3; i++) {
      vad.processFrame(makeFrame(0.5));
    }
    expect(vad.getState()).toBe("speech");

    vad.reset();
    expect(vad.getState()).toBe("silence");
  });

  it("processes a chunk of audio", () => {
    const chunk = new Float32Array(320 * 5); // 5 frames
    // Fill with loud audio
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] = 0.5 * Math.sin((2 * Math.PI * i * 440) / 16000);
    }
    const events = vad.processChunk(chunk);
    expect(events.length).toBe(5);
  });

  it("works with Int16Array input", () => {
    const frame = new Int16Array(320);
    for (let i = 0; i < 320; i++) {
      frame[i] = Math.floor(0.5 * 32768 * Math.sin((2 * Math.PI * i * 440) / 16000));
    }
    const event = vad.processFrame(frame);
    expect(event.energy).toBeGreaterThan(0);
  });
});
