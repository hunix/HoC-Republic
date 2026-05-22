/**
 * Application — Prompt Composer
 *
 * Generates StableAvatar capability descriptions for injection
 * into citizen system prompts. Active for avatar/video/creative citizens.
 */

const AVATAR_ROLES = [
  "avatar",
  "video",
  "animation",
  "creative",
  "presenter",
  "spokesperson",
  "host",
  "vtuber",
  "streamer",
  "film",
  "production",
  "media",
  "broadcast",
];

export function composeStableAvatarPrompt(specialization: string): string {
  const isMatch = AVATAR_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🎭 StableAvatar — Audio-Driven Avatar Videos

You have access to StableAvatar, the first end-to-end video diffusion transformer for infinite-length audio-driven avatar video synthesis.

### Capabilities:
• **Talking Head** — Generate lip-synced avatar videos from image + audio
• **Infinite Length** — Generate arbitrarily long videos via sliding window
• **LoRA Finetuning** — Adapt to specific identities

### Tools:
• \`avatar_generate\` — Create an avatar video from reference image + audio
• \`avatar_job_status\` — Check generation progress
• \`avatar_cancel\` — Cancel a queued job
• \`avatar_queue_status\` — View queue statistics

### Key Features:
• Time-step-aware Audio Adapter for natural lip sync
• Audio Native Guidance for enhanced synchronization
• Dynamic Weighted Sliding-window for smooth infinite videos
• Supports base model, finetuned, and LoRA modes

### Tips:
• Clear frontal face reference image works best
• Audio is auto-processed for vocal separation
• Videos output at 25 FPS by default
• LoRA finetuning allows identity-specific customization`;
}
