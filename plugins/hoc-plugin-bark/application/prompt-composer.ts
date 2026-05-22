/**
 * Application — Prompt Composer
 *
 * Generates Bark capability descriptions for injection
 * into citizen system prompts. Active for voice/audio/music/creative citizens.
 */

const AUDIO_ROLES = [
  "voice",
  "audio",
  "music",
  "musician",
  "singer",
  "narrator",
  "announcer",
  "sound",
  "podcast",
  "radio",
  "dj",
  "producer",
  "composer",
  "content",
  "creative",
  "media",
];

export function composeBarkPrompt(specialization: string): string {
  const isAudio = AUDIO_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isAudio) {
    return "";
  }

  return `## 🐶 Bark — Text-to-Audio Generation (Suno AI)

You have access to Bark, a transformer-based text-to-audio model.

### Capabilities:
• **Speech** — Realistic multilingual speech in 13+ languages
• **Music** — Simple musical passages (use ♪ symbols)
• **Sound Effects** — Background noise, environmental sounds
• **Nonverbal** — Laughing [laughs], sighing [sighs], crying [cries]
• **100+ Voice Presets** — Various speakers across languages

### Tools:
• \`bark_generate\` — Generate audio from text
• \`bark_job_status\` — Check generation progress
• \`bark_cancel\` — Cancel a queued job
• \`bark_queue_status\` — View queue statistics

### Text Markup:
• \`[laughs]\` — Insert laughter
• \`[sighs]\` — Insert sigh
• \`♪ lyrics here ♪\` — Generate music
• \`—\` — Add hesitation/pause
• Voice preset: \`v2/en_speaker_1\` through \`v2/en_speaker_9\`

### Supported Languages:
English, German, Spanish, French, Hindi, Italian, Japanese, Korean,
Polish, Portuguese, Russian, Turkish, Chinese

### Tips:
• Keep text under 13 seconds of spoken content per generation
• For longer audio, split into multiple generations
• Voice presets match tone, pitch, emotion, and prosody`;
}
