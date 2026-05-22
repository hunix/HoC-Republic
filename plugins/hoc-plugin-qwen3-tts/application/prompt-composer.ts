/**
 * Application — Prompt Composer
 *
 * Generates Qwen3-TTS capability descriptions for injection
 * into citizen system prompts. Only for creative specializations.
 */

import type { TtsLanguage, TtsMode } from "../domain/types.ts";
import {
    MODE_DESCRIPTIONS, PRESET_SPEAKERS, SUPPORTED_LANGUAGES, TTS_MODES
} from "../domain/types.ts";
import { getQueueStatus } from "./synthesis-scheduler.ts";

const CREATIVE_SPECIALIZATIONS = new Set([
  "artist",
  "filmmaker",
  "animator",
  "content-creator",
  "video-editor",
  "vfx-artist",
  "cinematographer",
  "creative-director",
  "media-producer",
  "designer",
  "musician",
  "composer",
  "narrator",
  "voice-actor",
  "podcaster",
  "audio-engineer",
  "sound-designer",
]);

export function composeTtsPrompt(specialization?: string): string {
  if (!specialization) {
    return "";
  }
  if (!CREATIVE_SPECIALIZATIONS.has(specialization.toLowerCase())) {
    return "";
  }

  const queue = getQueueStatus();

  const modeList = TTS_MODES.map((m: TtsMode) => `  • \`${m}\` — ${MODE_DESCRIPTIONS[m]}`).join(
    "\n",
  );

  const speakerList = PRESET_SPEAKERS.map(
    (s) => `  • **${s.name}** (${s.gender}, ${s.nativeLanguage}) — ${s.description}`,
  ).join("\n");

  const langList = SUPPORTED_LANGUAGES.filter((l: TtsLanguage) => l !== "Auto").join(", ");

  const lines: string[] = [
    "## AI Voice Synthesis Tools (Qwen3-TTS)",
    "",
    "You have access to Qwen3-TTS — a state-of-the-art text-to-speech system with voice design and cloning.",
    "",
    "### Synthesis Modes",
    modeList,
    "",
    "### Preset Speakers",
    speakerList,
    "",
    "### Supported Languages",
    `  ${langList}`,
    "",
    "### Key Tools",
    "  • `tts_speak` — Synthesize speech using a preset speaker (with optional emotion/style instruct)",
    "  • `tts_design_voice` — Describe a voice in natural language and the model creates it",
    "  • `tts_clone_voice` — Clone a voice from a reference audio clip + transcript",
    "",
    "### Queue Status",
    `  Active: ${queue.running} | Completed: ${queue.completed} | Failed: ${queue.failed}`,
    "",
    "### Tips",
    "  • Use `instruct` to control emotion: 'angry', 'whispering', 'excited', 'sad'",
    "  • Voice Design accepts rich descriptions: 'Female, 25, warm alto, slightly breathy, calm'",
    "  • Each speaker works in all 10 languages, but quality is best in their native language",
  ];

  return lines.join("\n");
}
