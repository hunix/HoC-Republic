/**
 * Republic Platform — Citizen Identity Descriptions
 *
 * Extracted from citizen-prompt.ts (Phase 2: Split God Modules).
 *
 * Converts citizen appearance and voice profile objects into
 * natural-language descriptions for LLM prompt injection.
 */

import type { CitizenAppearance, VoiceProfile } from "./citizen-identity.js";
import type { Citizen } from "./types.js";
import { generateAppearance } from "./citizen-identity.js";

// ─── Identity Description Helpers ───────────────────────────────

/** Produce a human-readable description of a citizen's appearance. */
export function describeAppearance(app: CitizenAppearance): string {
  const parts: string[] = [];
  parts.push(
    `You have a ${app.faceShape} face with ${app.eyeShape} ${nameColor(app.eyeColor)} eyes.`,
  );
  parts.push(`Skin tone: ${nameColor(app.skinTone)}.`);
  const hairDesc =
    app.hairStyle === "bald"
      ? "You are bald."
      : `Your hair is ${app.hairStyle.replace(/_/g, " ")}, ${nameColor(app.hairColor)}.`;
  parts.push(hairDesc);
  if (app.facialHair && app.facialHair !== "none") {
    parts.push(`Facial hair: ${app.facialHair}.`);
  }
  parts.push(`Build: ${app.build}, ${app.height}cm tall.`);
  if (app.distinguishingFeatures.length > 0) {
    parts.push(`Distinguishing features: ${app.distinguishingFeatures.join(", ")}.`);
  }
  return parts.join(" ");
}

/** Produce a human-readable description of a citizen's voice. */
export function describeVoice(voice: VoiceProfile): string {
  const parts: string[] = [];
  parts.push(
    `Your voice is ${voice.timbre} with a ${voice.cadence} cadence and ${voice.accent.replace(/_/g, " ")} accent.`,
  );
  parts.push(
    `Pitch: ${voice.pitch}Hz. Speech rate: ${voice.speechRate} wpm. Volume tendency: ${(voice.volumeTendency * 100).toFixed(0)}%.`,
  );
  if (voice.catchPhrases.length > 0) {
    parts.push(`You often say: ${voice.catchPhrases.map((p) => `"${p}"`).join(", ")}.`);
  }
  return parts.join(" ");
}

/** Produce a short visual tag for identifying a nearby citizen. */
export function briefAppearanceTag(c: Citizen): string {
  const app = c.appearance ?? generateAppearance(c.id);
  const hairPart =
    app.hairStyle === "bald"
      ? "bald"
      : `${app.hairStyle.replace(/_/g, " ")} ${nameColor(app.hairColor)} hair`;
  return `${app.faceShape} face, ${nameColor(app.eyeColor)} eyes, ${hairPart}`;
}

/** Convert hex color to a human-readable name (best-effort). */
export function nameColor(hex: string): string {
  if (!hex.startsWith("#")) {
    return hex;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Skin tones
  if (r > 180 && g > 140 && b > 100 && r > g && g > b) {
    return "warm tan";
  }
  if (r > 160 && g > 100 && r > g * 1.2) {
    return "bronze";
  }
  if (r > 100 && g > 60 && r > g * 1.3 && b < 80) {
    return "deep brown";
  }
  if (r < 80 && g < 50) {
    return "dark";
  }
  // Eye colors
  if (b > r && b > g && b > 150) {
    return "blue";
  }
  if (g > r && g > b && g > 120) {
    return "green";
  }
  if (r > 120 && g > 80 && b < 80) {
    return "amber";
  }
  if (r > 80 && g > 60 && b < 60 && r < 130) {
    return "brown";
  }
  if (r > 60 && g < 80 && b < 60) {
    return "dark brown";
  }
  // Hair colors
  if (r > 200 && g > 180 && b > 100 && g < 220) {
    return "golden blonde";
  }
  if (r > 180 && g > 100 && b < 80) {
    return "auburn";
  }
  if (r > 60 && g > 30 && b < 50 && r < 120) {
    return "chestnut";
  }
  if (r < 50 && g < 50 && b < 50) {
    return "jet black";
  }
  if (r > 180 && g > 180 && b > 180) {
    return "silver";
  }
  if (r > 150 && g < 80 && b < 80) {
    return "fiery red";
  }
  return "distinctive";
}
