/**
 * Tests — HoC Living Avatar Engine (Phase 29)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  emotionToBlendshapes,
  detectEmotion,
  textToVisemes,
  parseCommand,
  createAvatarSession,
  getAvatarSession,
  listAvatarSessions,
  endAvatarSession,
  avatarListen,
  avatarStartListening,
  getAvatarState,
  getAvatarHistory,
  setPersonality,
  getPersonality,
  avatarDiagnostics,
  resetAvatar,
} from "./avatar-engine.js";

beforeEach(() => {
  resetAvatar();
});

// ─── Emotion Engine ─────────────────────────────────────────────

describe("Emotion engine", () => {
  it("should map joy to smile blendshapes", () => {
    const bs = emotionToBlendshapes("joy");
    expect(bs.mouthSmileLeft).toBeGreaterThan(0.5);
    expect(bs.mouthSmileRight).toBeGreaterThan(0.5);
    expect(bs.cheekSquintLeft).toBeGreaterThan(0);
  });

  it("should map thinking to brow and eye blendshapes", () => {
    const bs = emotionToBlendshapes("thinking");
    expect(bs.browInnerUp).toBeGreaterThan(0);
    expect(bs.eyeLookUpLeft).toBeGreaterThan(0);
  });

  it("should return empty overrides for neutral", () => {
    const bs = emotionToBlendshapes("neutral");
    expect(Object.keys(bs)).toHaveLength(0);
  });

  it("should detect joy from positive text", () => {
    expect(detectEmotion("This is awesome!")).toBe("joy");
    expect(detectEmotion("I love this")).toBe("joy");
  });

  it("should detect thinking from reflective text", () => {
    expect(detectEmotion("Let me think about this")).toBe("thinking");
    expect(detectEmotion("Maybe we should consider")).toBe("thinking");
  });

  it("should detect concern from negative text", () => {
    expect(detectEmotion("There's a problem with this")).toBe("concern");
    expect(detectEmotion("I'm worried about the risk")).toBe("concern");
  });

  it("should detect questions as listening", () => {
    expect(detectEmotion("How does this work?")).toBe("listening");
  });

  it("should default to neutral", () => {
    expect(detectEmotion("hello")).toBe("neutral");
  });
});

// ─── Lip Sync ───────────────────────────────────────────────────

describe("Lip sync", () => {
  it("should generate viseme sequence from text", () => {
    const visemes = textToVisemes("hello world");
    expect(visemes.length).toBeGreaterThan(0);
    expect(visemes[0]).toHaveProperty("viseme");
    expect(visemes[0]).toHaveProperty("durationMs");
    expect(visemes[0]).toHaveProperty("weight");
  });

  it("should include silence between words", () => {
    const visemes = textToVisemes("hi there");
    const silences = visemes.filter((v) => v.viseme === "sil");
    expect(silences.length).toBeGreaterThan(0);
  });
});

// ─── Command Parser ─────────────────────────────────────────────

describe("Command parser", () => {
  it("should detect plan intent", () => {
    const result = parseCommand("Plan the deployment strategy");
    expect(result.intent).toBe("plan");
    expect(result.confidence).toBeGreaterThan(0.7);
  });

  it("should detect execute intent", () => {
    const result = parseCommand("Build the new feature");
    expect(result.intent).toBe("execute");
  });

  it("should detect cancel intent", () => {
    const result = parseCommand("Cancel the operation");
    expect(result.intent).toBe("cancel");
    expect(result.confidence).toBe(0.9);
  });

  it("should detect confirm intent", () => {
    const result = parseCommand("Yes, go ahead");
    expect(result.intent).toBe("confirm");
  });

  it("should detect question intent", () => {
    const result = parseCommand("Why did this happen?");
    expect(result.intent).toBe("question");
  });

  it("should extract entities", () => {
    const result = parseCommand("Build the authentication module");
    expect(result.entities).toHaveProperty("target");
  });
});

// ─── Session Manager ────────────────────────────────────────────

describe("Session manager", () => {
  it("should create and retrieve sessions", () => {
    const session = createAvatarSession("user-1");
    expect(session.userId).toBe("user-1");
    expect(session.state).toBe("idle");
    expect(getAvatarSession(session.id)).toBeTruthy();
  });

  it("should list all sessions", () => {
    createAvatarSession("user-1");
    createAvatarSession("user-2");
    expect(listAvatarSessions()).toHaveLength(2);
  });

  it("should end sessions", () => {
    const session = createAvatarSession("user-1");
    expect(endAvatarSession(session.id)).toBe(true);
    expect(getAvatarSession(session.id)).toBeUndefined();
  });

  it("should apply custom personality", () => {
    const session = createAvatarSession("user-1", { humor: 0.9, formality: 0.1 });
    expect(session.personality.humor).toBe(0.9);
    expect(session.personality.formality).toBe(0.1);
  });
});

// ─── Avatar Interaction ─────────────────────────────────────────

describe("Avatar interaction", () => {
  it("should process user speech and return response", () => {
    const session = createAvatarSession("user-1");
    const result = avatarListen(session.id, "Plan the database migration");

    expect(result).toBeTruthy();
    expect(result!.response.length).toBeGreaterThan(0);
    expect(result!.command.intent).toBe("plan");
    expect(result!.visemes.length).toBeGreaterThan(0);
  });

  it("should track conversation history", () => {
    const session = createAvatarSession("user-1");
    avatarListen(session.id, "Hello");
    avatarListen(session.id, "How are you?");

    const history = getAvatarHistory(session.id);
    expect(history).toHaveLength(4); // 2 user + 2 avatar turns
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("avatar");
  });

  it("should switch to listening mode", () => {
    const session = createAvatarSession("user-1");
    const state = avatarStartListening(session.id);
    expect(state).toBeTruthy();
    expect(state!.isListening).toBe(true);
    expect(state!.emotion).toBe("listening");
  });

  it("should get current avatar state", () => {
    const session = createAvatarSession("user-1");
    const state = getAvatarState(session.id);
    expect(state).toBeTruthy();
    expect(state!.emotion).toBe("neutral");
    expect(state!.gaze).toBe("user");
  });
});

// ─── Personality ────────────────────────────────────────────────

describe("Personality", () => {
  it("should get/set personality traits", () => {
    setPersonality({ humor: 1, formality: 0 });
    const p = getPersonality();
    expect(p.humor).toBe(1);
    expect(p.formality).toBe(0);
  });
});

// ─── Diagnostics ────────────────────────────────────────────────

describe("Diagnostics", () => {
  it("should provide comprehensive diagnostics", () => {
    const session = createAvatarSession("user-1");
    avatarListen(session.id, "Build something awesome");

    const diag = avatarDiagnostics();
    expect(diag.activeSessions).toBe(1);
    expect(diag.totalTurns).toBeGreaterThan(0);
    expect(diag.emotionDistribution).toBeTruthy();
    expect(diag.intentDistribution).toBeTruthy();
  });
});
