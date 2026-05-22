/**
 * Tests — PersonaPlex Voice Persona Engine (Phase 26)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  connect,
  disconnect,
  resetState,
  getConnectionState,
  getServerStatus,
  healthCheck,
  configurePersonaPlex,
  getPersonaPlexConfig,
  createPersona,
  getPersona,
  listPersonas,
  updatePersona,
  deletePersona,
  setActivePersona,
  getActivePersona,
  startConversation,
  sendAudioChunk,
  sendTextMessage,
  pauseConversation,
  resumeConversation,
  endConversation,
  getConversation,
  listConversations,
  getTranscript,
  createPersonaPlexSTTHandler,
  createPersonaPlexTTSHandler,
  personaplexDiagnostics,
} from "./personaplex-engine.js";

beforeEach(() => {
  resetState();
});

// ─── Connection Manager ─────────────────────────────────────────

describe("PersonaPlex connection", () => {
  it("should start disconnected", () => {
    expect(getConnectionState()).toBe("disconnected");
    expect(getServerStatus().connected).toBe(false);
  });

  it("should connect to PersonaPlex server", () => {
    const status = connect();
    expect(status.connected).toBe(true);
    expect(status.modelLoaded).toBe(true);
    expect(status.gpuInfo).toBeTruthy();
    expect(getConnectionState()).toBe("connected");
  });

  it("should disconnect cleanly", () => {
    connect();
    disconnect();
    expect(getConnectionState()).toBe("disconnected");
    expect(getServerStatus().connected).toBe(false);
  });

  it("should provide health check", () => {
    connect();
    const health = healthCheck();
    expect(health.healthy).toBe(true);
    expect(health.latencyMs).toBeGreaterThan(0);
  });

  it("should report unhealthy when disconnected", () => {
    const health = healthCheck();
    expect(health.healthy).toBe(false);
  });

  it("should configure PersonaPlex", () => {
    configurePersonaPlex({ host: "gpu-server", port: 9000 });
    const cfg = getPersonaPlexConfig();
    expect(cfg.host).toBe("gpu-server");
    expect(cfg.port).toBe(9000);
    expect(cfg.modelId).toBe("nvidia/personaplex-7b-v1");
  });
});

// ─── Persona Management ─────────────────────────────────────────

describe("Persona management", () => {
  it("should create a persona with dual conditioning", () => {
    const persona = createPersona({
      name: "HoC Assistant",
      voicePrompt: "/voices/warm-female.wav",
      textPrompt: "You are a helpful AI assistant for the HoC platform. Be warm, professional, and concise.",
      style: "professional",
      language: "en",
    });
    expect(persona.id).toMatch(/^persona-/);
    expect(persona.name).toBe("HoC Assistant");
    expect(persona.voicePrompt).toBe("/voices/warm-female.wav");
    expect(persona.style).toBe("professional");
    expect(persona.voiceCharacteristics.pitch).toBe("medium");
  });

  it("should list and retrieve personas", () => {
    createPersona({ name: "Persona A", voicePrompt: "a.wav", textPrompt: "Persona A" });
    createPersona({ name: "Persona B", voicePrompt: "b.wav", textPrompt: "Persona B" });
    expect(listPersonas()).toHaveLength(2);
  });

  it("should update a persona", () => {
    const p = createPersona({ name: "Test", voicePrompt: "v.wav", textPrompt: "test" });
    const updated = updatePersona(p.id, { name: "Updated Test", style: "empathetic" });
    expect(updated?.name).toBe("Updated Test");
    expect(updated?.style).toBe("empathetic");
  });

  it("should delete a persona", () => {
    const p = createPersona({ name: "Deleteme", voicePrompt: "v.wav", textPrompt: "delete" });
    expect(deletePersona(p.id)).toBe(true);
    expect(getPersona(p.id)).toBeUndefined();
  });

  it("should set and get active persona", () => {
    const p = createPersona({ name: "Active", voicePrompt: "v.wav", textPrompt: "active" });
    expect(getActivePersona()).toBeNull();
    setActivePersona(p.id);
    expect(getActivePersona()?.name).toBe("Active");
  });
});

// ─── Full-Duplex Conversation ───────────────────────────────────

describe("Full-duplex conversation", () => {
  it("should start a conversation with active persona", () => {
    connect();
    const p = createPersona({ name: "ChatBot", voicePrompt: "v.wav", textPrompt: "chat" });
    setActivePersona(p.id);
    const conv = startConversation();
    expect(conv.status).toBe("active");
    expect(conv.personaId).toBe(p.id);
    expect(conv.personaName).toBe("ChatBot");
  });

  it("should throw without connection", () => {
    const p = createPersona({ name: "NoConnect", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    expect(() => startConversation()).toThrow("PersonaPlex not connected");
  });

  it("should throw without active persona", () => {
    connect();
    expect(() => startConversation()).toThrow("No persona specified");
  });

  it("should send audio chunks and get responses", () => {
    connect();
    const p = createPersona({ name: "Voice", voicePrompt: "v.wav", textPrompt: "respond naturally" });
    setActivePersona(p.id);
    const conv = startConversation();

    const response = sendAudioChunk(conv.id, {
      data: "x".repeat(600), // Must be >= 500 to avoid backchannel path
      sampleRate: 16000,
      channels: 1,
      format: "pcm",
      isFinal: false,
    });

    expect(response).toBeTruthy();
    // Full response path (data >= 500) includes persona name in brackets
    expect(response!.text).toContain("[Voice:");
    expect(response!.latencyMs).toBeGreaterThanOrEqual(0);
    expect(response!.turnId).toMatch(/^turn-/);
  });

  it("should send text messages", () => {
    connect();
    const p = createPersona({ name: "TextBot", voicePrompt: "v.wav", textPrompt: "be helpful" });
    setActivePersona(p.id);
    const conv = startConversation();

    const response = sendTextMessage(conv.id, "Hello, how are you?");
    expect(response).toBeTruthy();
    expect(response!.text).toContain("TextBot");
    expect(response!.text).toContain("Hello");
  });

  it("should pause and resume conversations", () => {
    connect();
    const p = createPersona({ name: "PauseBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    const conv = startConversation();

    expect(pauseConversation(conv.id)).toBe(true);
    expect(getConversation(conv.id)?.status).toBe("paused");

    expect(resumeConversation(conv.id)).toBe(true);
    expect(getConversation(conv.id)?.status).toBe("active");
  });

  it("should end a conversation and archive it", () => {
    connect();
    const p = createPersona({ name: "EndBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    const conv = startConversation();
    sendTextMessage(conv.id, "goodbye");

    const ended = endConversation(conv.id);
    expect(ended?.status).toBe("ended");
    expect(ended?.endedAt).toBeTruthy();
    expect(ended?.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("should list and filter conversations", () => {
    connect();
    const p = createPersona({ name: "ListBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    const c1 = startConversation();
    startConversation();
    endConversation(c1.id);

    expect(listConversations()).toHaveLength(2);
    expect(listConversations({ status: "active" })).toHaveLength(1);
    expect(listConversations({ status: "ended" })).toHaveLength(1);
  });

  it("should generate transcripts", () => {
    connect();
    const p = createPersona({ name: "TranscriptBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    const conv = startConversation();
    sendTextMessage(conv.id, "What is HoC?");
    const transcript = getTranscript(conv.id);
    expect(transcript).toContain("[user]");
    expect(transcript).toContain("[persona]");
    expect(transcript).toContain("What is HoC?");
  });

  it("should track latency stats", () => {
    connect();
    const p = createPersona({ name: "LatencyBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    const conv = startConversation();
    sendTextMessage(conv.id, "test 1");
    sendTextMessage(conv.id, "test 2");
    sendTextMessage(conv.id, "test 3");

    const session = getConversation(conv.id)!;
    expect(session.latencyStats.min).toBeGreaterThanOrEqual(0);
    expect(session.latencyStats.max).toBeGreaterThanOrEqual(session.latencyStats.min);
    expect(session.latencyStats.avg).toBeGreaterThanOrEqual(0);
  });
});

// ─── Voice-IO Bridge ────────────────────────────────────────────

describe("Voice-IO bridge", () => {
  it("should create STT handler compatible with voice-io", async () => {
    connect();
    const p = createPersona({ name: "STTBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    startConversation();

    const sttHandler = createPersonaPlexSTTHandler();
    const result = await sttHandler("test-audio-data", { language: "en", sampleRate: 16000 });
    expect(result.text).toBeTruthy();
    expect(result.confidence).toBeGreaterThan(0);
  });

  it("should create TTS handler compatible with voice-io", async () => {
    const p = createPersona({ name: "TTSBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);

    const ttsHandler = createPersonaPlexTTSHandler();
    const result = await ttsHandler("Hello world!", { language: "en" });
    expect(result.audio).toContain("TTSBot");
    expect(result.durationMs).toBeGreaterThan(0);
  });
});

// ─── Diagnostics ────────────────────────────────────────────────

describe("PersonaPlex diagnostics", () => {
  it("should report comprehensive diagnostics", () => {
    connect();
    const p = createPersona({ name: "DiagBot", voicePrompt: "v.wav", textPrompt: "test" });
    setActivePersona(p.id);
    const conv = startConversation();
    sendTextMessage(conv.id, "test");

    const diag = personaplexDiagnostics();
    expect(diag.server.connected).toBe(true);
    expect(diag.connectionState).toBe("connected");
    expect(diag.totalPersonas).toBe(1);
    expect(diag.activePersona).toBe(p.id);
    expect(diag.activeConversations).toBe(1);
    expect(diag.totalTurns).toBeGreaterThan(0);
  });
});
