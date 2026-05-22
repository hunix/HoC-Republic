/**
 * Application — Prompt Composer
 *
 * Generates Chatterbox TTS capability descriptions for injection
 * into citizen system prompts. Active for voice/audio/creative citizens.
 */

import type { TTSQueueStatus } from "../domain/types.ts";

const VOICE_ROLES = [
  "voice",
  "audio",
  "narrator",
  "speaker",
  "singer",
  "musician",
  "creative",
  "filmmaker",
  "animator",
  "content",
  "podcaster",
  "producer",
  "actor",
  "broadcaster",
  "dj",
  "announcer",
];

export function composeChatterboxPrompt(
  specialization: string,
  queueStatus: TTSQueueStatus,
): string {
  const isVoice = VOICE_ROLES.some((r) => specialization.toLowerCase().includes(r));

  if (!isVoice && !queueStatus.installed) {
    return "";
  }

  const queueInfo =
    queueStatus.runningJobs > 0
      ? `\n⚠️ GPU is currently generating speech. Jobs queue: ${queueStatus.queuedJobs} waiting.`
      : "";

  return `## 🎙️ Chatterbox TTS — AI Voice Generation

You have access to Chatterbox, a state-of-the-art text-to-speech system by Resemble AI.

### Model Variants:
• **Turbo** (default): 350M params, ultra-low-latency, supports paralinguistic tags
• **Standard**: High-quality English-only TTS with exaggeration/cfg_weight tuning
• **Multilingual**: 23 languages (ar, da, de, el, en, es, fi, fr, he, hi, it, ja, ko, ms, nl, no, pl, pt, ru, sv, sw, tr, zh)

### Capabilities:
• Text-to-speech with natural, expressive output
• Voice cloning via a ~10s reference audio clip
• Paralinguistic tags: [laugh], [cough], [chuckle] (Turbo only)
• Exaggeration & cfg_weight tuning for expressiveness

### Tools:
• \`chatterbox_speak\` — Generate speech from text
• \`chatterbox_clone_voice\` — Generate speech using a reference voice
• \`chatterbox_job_status\` — Check generation progress
• \`chatterbox_cancel_job\` — Cancel a queued/running job
• \`chatterbox_queue_status\` — View queue status

### Tips:
• For general use: defaults (exaggeration=0.5, cfg_weight=0.5) work well
• For expressive/dramatic: lower cfg_weight (~0.3), raise exaggeration (~0.7)
• For fast speakers: lower cfg_weight (~0.3) improves pacing
• Match reference clip language to target language for best results
${queueInfo}`;
}
