/**
 * Application — Prompt Composer
 *
 * Generates MMAudio capability descriptions for injection
 * into citizen system prompts. Active for audio/video/sound/creative citizens.
 */

const AUDIO_VIDEO_ROLES = [
  "audio",
  "video",
  "sound",
  "film",
  "foley",
  "post-production",
  "editor",
  "producer",
  "designer",
  "multimedia",
  "creative",
  "vfx",
];

export function composeMMAudioPrompt(specialization: string): string {
  const isMatch = AUDIO_VIDEO_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🔊 MMAudio — Video-to-Audio Synthesis (CVPR 2025)

You have access to MMAudio, a multimodal model for generating synchronized audio from video and/or text.

### Synthesis Modes:
• **Video-to-Audio** — Generate matching audio/soundscape for a video
• **Text-to-Audio** — Generate audio from a text description
• **Video+Text-to-Audio** — Combine video and text prompt for guided generation

### Tools:
• \`mmaudio_synthesize\` — Generate audio from video and/or text
• \`mmaudio_job_status\` — Check synthesis progress
• \`mmaudio_cancel\` — Cancel a queued job
• \`mmaudio_queue_status\` — View queue statistics

### Key Features:
• Synchronized audio generation (CLIP + Synchformer)
• Default 8-second output duration
• Outputs both .flac audio and .mp4 video with audio

### Tips:
• Use text prompts to guide the audio style
• 8 seconds is the trained duration — deviating may reduce quality
• Video processing is resolution-agnostic (frames resized internally)`;
}
