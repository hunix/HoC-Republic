/**
 * Voice I/O + Reasoning Distillation — Combined Test Suite
 *
 * Phase 17: Voice sessions, STT/TTS, transcription, synthesis
 * Phase 18: CoT capture, distillation, synthetic data, training sets
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  startVoiceSession,
  endVoiceSession,
  pauseVoiceSession,
  resumeVoiceSession,
  getVoiceSession,
  processAudioChunk,
  synthesizeSpeech,
  getSessionTranscript,
  listCitizenSessions,
  getActiveSessions,
  registerSTTProvider,
  registerTTSProvider,
  voiceDiagnostics,
  resetVoiceState,
} from "../republic/voice-io.js";
import {
  captureCoT,
  getCoT,
  distillReasoning,
  getDistilled,
  generateSyntheticData,
  createTrainingSet,
  exportTrainingSet,
  _getTrainingSet,
  evaluateDistillation,
  distillationDiagnostics,
  resetDistillationState,
} from "../republic/reasoning-distillation.js";

// ─── Phase 17: Voice I/O ────────────────────────────────────────

describe("Voice I/O", () => {
  beforeEach(() => {
    resetVoiceState();
    // Register lightweight mock handlers so tests never hit the dynamic
    // import("./inference-gateway.js") which hangs under full-suite load.
    registerSTTProvider(async (audio, _config) => ({
      id: `tx-mock-${Date.now()}`,
      sessionId: "",
      text: typeof audio === "string" ? audio : `[Audio ${audio.length} bytes]`,
      confidence: 0.92,
      durationMs: typeof audio === "string" ? audio.length * 50 : audio.length,
      timestamp: new Date().toISOString(),
      isFinal: true,
    }));
    registerTTSProvider(async (text, _config) => ({
      id: `sy-mock-${Date.now()}`,
      sessionId: "",
      text,
      voiceId: "mock",
      durationMs: text.length * 60,
      timestamp: new Date().toISOString(),
      audioData: Buffer.from(`tts-mock:${text.slice(0, 50)}`).toString("base64"),
    }));
  });

  describe("Session lifecycle", () => {
    it("starts a session", () => {
      const session = startVoiceSession("cit-1");
      expect(session.id).toBeDefined();
      expect(session.status).toBe("active");
      expect(session.citizenId).toBe("cit-1");
    });

    it("ends a session", () => {
      const session = startVoiceSession("cit-1");
      const ended = endVoiceSession(session.id);
      expect(ended).toBe(true);
      expect(getVoiceSession(session.id)?.status).toBe("ended");
    });

    it("pauses and resumes", () => {
      const session = startVoiceSession("cit-1");
      expect(pauseVoiceSession(session.id)).toBe(true);
      expect(getVoiceSession(session.id)?.status).toBe("paused");
      expect(resumeVoiceSession(session.id)).toBe(true);
      expect(getVoiceSession(session.id)?.status).toBe("active");
    });

    it("cannot pause ended session", () => {
      const session = startVoiceSession("cit-1");
      endVoiceSession(session.id);
      expect(pauseVoiceSession(session.id)).toBe(false);
    });
  });

  describe("STT Processing", () => {
    it("transcribes audio (mock)", async () => {
      const session = startVoiceSession("cit-1");
      const result = await processAudioChunk(session.id, "Hello world");
      expect(result).not.toBeNull();
      expect(result!.text).toBe("Hello world");
      expect(result!.confidence).toBeGreaterThan(0.8);
    });

    it("works with Uint8Array input", async () => {
      const session = startVoiceSession("cit-1");
      const audio = new Uint8Array([1, 2, 3, 4, 5]);
      const result = await processAudioChunk(session.id, audio);
      expect(result).not.toBeNull();
      expect(result!.text).toContain("5 bytes");
    });

    it("returns null for inactive session", async () => {
      const session = startVoiceSession("cit-1");
      endVoiceSession(session.id);
      const result = await processAudioChunk(session.id, "test");
      expect(result).toBeNull();
    });

    it("uses custom STT provider", async () => {
      registerSTTProvider(async (_audio) => ({
        id: "custom-tx",
        sessionId: "",
        text: "Custom trans_cription",
        confidence: 0.99,
        durationMs: 100,
        timestamp: new Date().toISOString(),
        isFinal: true,
      }));
      const session = startVoiceSession("cit-1");
      const result = await processAudioChunk(session.id, "test");
      expect(result!.text).toBe("Custom trans_cription");
    });
  });

  describe("TTS Synthesis", () => {
    it("synthesizes speech (mock)", async () => {
      const session = startVoiceSession("cit-1");
      const result = await synthesizeSpeech(session.id, "Hello world");
      expect(result).not.toBeNull();
      expect(result!.text).toBe("Hello world");
      expect(result!.audioData).toBeDefined();
    });

    it("returns null for inactive session", async () => {
      const session = startVoiceSession("cit-1");
      endVoiceSession(session.id);
      const result = await synthesizeSpeech(session.id, "test");
      expect(result).toBeNull();
    });
  });

  describe("Session queries", () => {
    it("gets transcript", async () => {
      const session = startVoiceSession("cit-1");
      await processAudioChunk(session.id, "Hello");
      await processAudioChunk(session.id, "World");
      const transcript = getSessionTranscript(session.id);
      expect(transcript).toContain("Hello");
      expect(transcript).toContain("World");
    });

    it("lists citizen sessions", () => {
      startVoiceSession("cit-1");
      startVoiceSession("cit-1");
      startVoiceSession("cit-2");
      expect(listCitizenSessions("cit-1").length).toBe(2);
    });

    it("gets active sessions", () => {
      startVoiceSession("cit-1");
      const s2 = startVoiceSession("cit-2");
      endVoiceSession(s2.id);
      expect(getActiveSessions().length).toBe(1);
    });
  });

  describe("Diagnostics", () => {
    it("returns diagnostics", async () => {
      const session = startVoiceSession("cit-1");
      await processAudioChunk(session.id, "test");
      const diag = voiceDiagnostics();
      expect(diag.totalSessions).toBe(1);
      expect(diag.totalTranscriptions).toBe(1);
      expect(diag.avgTranscriptionConfidence).toBeGreaterThan(0.8);
    });
  });
});

// ─── Phase 18: Reasoning Distillation ────────────────────────────

describe("Reasoning Distillation", () => {
  beforeEach(() => {
    resetDistillationState();
  });

  describe("CoT capture", () => {
    it("captures chain of thought", () => {
      const cot = captureCoT(
        "What is TypeScript?",
        [
          { index: 0, thought: "TypeScript is a programming language", confidence: 0.9 },
          { index: 1, thought: "It adds types to JavaScript", confidence: 0.85 },
        ],
        "TypeScript is a typed superset of JavaScript",
        "gpt-4",
      );
      expect(cot.id).toBeDefined();
      expect(cot.steps.length).toBe(2);
      expect(cot.model).toBe("gpt-4");
    });

    it("retrieves captured CoT", () => {
      const cot = captureCoT("q", [{ index: 0, thought: "t", confidence: 0.8 }], "a", "model");
      expect(getCoT(cot.id)).toBeDefined();
    });
  });

  describe("Distillation", () => {
    it("distills a CoT trace", () => {
      const cot = captureCoT(
        "Explain recursion",
        [
          { index: 0, thought: "Recursion is a function calling itself", confidence: 0.9 },
          { index: 1, thought: "It needs a base case to terminate", confidence: 0.8 },
          { index: 2, thought: "Each call adds to the call stack", confidence: 0.75 },
          { index: 3, thought: "This is the conclusion about recursion", confidence: 0.85 },
        ],
        "Recursion is a self-referential function call pattern",
        "teacher-model",
      );

      const distilled = distillReasoning(cot.id);
      expect(distilled).not.toBeNull();
      expect(distilled!.compressionRatio).toBeGreaterThan(0);
      expect(distilled!.compressedReasoning.length).toBeGreaterThan(0);
      expect(distilled!.qualityScore).toBeGreaterThan(0);
    });

    it("returns null for missing CoT", () => {
      expect(distillReasoning("non-existent")).toBeNull();
    });

    it("retrieves distilled trace", () => {
      const cot = captureCoT("q", [{ index: 0, thought: "t", confidence: 0.9 }], "a", "m");
      const distilled = distillReasoning(cot.id);
      expect(getDistilled(distilled!.id)).toBeDefined();
    });
  });

  describe("Synthetic data generation", () => {
    it("generates samples for a domain", () => {
      const samples = generateSyntheticData("coding", 5);
      expect(samples.length).toBe(5);
      expect(samples[0].category).toBe("coding");
      expect(samples[0].difficulty).toBe("medium");
    });

    it("supports custom difficulty", () => {
      const samples = generateSyntheticData("research", 3, { difficulty: "hard" });
      expect(samples.every(s => s.difficulty === "hard")).toBe(true);
    });

    it("caps at 100 samples per call", () => {
      const samples = generateSyntheticData("coding", 200);
      expect(samples.length).toBe(100);
    });
  });

  describe("Training set export", () => {
    it("creates and exports Alpaca format", () => {
      generateSyntheticData("coding", 3);
      const set = createTrainingSet("test-set", undefined, "alpaca");
      expect(set.samples.length).toBe(3);

      const exported = exportTrainingSet(set.id);
      expect(exported).not.toBeNull();
      const parsed = JSON.parse(exported!);
      expect(parsed[0].instruction).toBeDefined();
      expect(parsed[0].input).toBeDefined();
      expect(parsed[0].output).toBeDefined();
    });

    it("exports ShareGPT format", () => {
      generateSyntheticData("coding", 2);
      const set = createTrainingSet("sharegpt-set", undefined, "sharegpt");
      const exported = exportTrainingSet(set.id);
      const parsed = JSON.parse(exported!);
      expect(parsed[0].conversations).toBeDefined();
      expect(parsed[0].conversations[0].from).toBe("human");
    });

    it("exports OpenAI format", () => {
      generateSyntheticData("coding", 2);
      const set = createTrainingSet("openai-set", undefined, "openai");
      const exported = exportTrainingSet(set.id);
      const parsed = JSON.parse(exported!);
      expect(parsed[0].messages).toBeDefined();
      expect(parsed[0].messages[0].role).toBe("system");
    });

    it("returns null for missing set", () => {
      expect(exportTrainingSet("non-existent")).toBeNull();
    });
  });

  describe("Distillation evaluation", () => {
    it("evaluates similar answers", () => {
      const result = evaluateDistillation(
        "TypeScript adds static typing to JavaScript, enabling better tooling and error detection",
        "TypeScript provides static typing for JavaScript with improved error detection",
      );
      expect(result.similarity).toBeGreaterThan(0.3);
    });

    it("detects low similarity", () => {
      const result = evaluateDistillation(
        "Recursion is a self-referential function calling pattern",
        "The weather today is sunny and warm with occasional clouds",
      );
      expect(result.similarity).toBeLessThan(0.3);
      expect(result.feedback.some(f => f.includes("Low similarity"))).toBe(true);
    });
  });

  describe("Diagnostics", () => {
    it("returns comprehensive diagnostics", () => {
      captureCoT("q", [{ index: 0, thought: "t", confidence: 0.8 }], "a", "m");
      generateSyntheticData("coding", 5);

      const diag = distillationDiagnostics();
      expect(diag.totalTraces).toBe(1);
      expect(diag.totalSyntheticSamples).toBe(5);
    });
  });
});
