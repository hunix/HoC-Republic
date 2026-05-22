/**
 * Application — Prompt Composer
 *
 * Generates GLM-Image capability descriptions for injection
 * into citizen system prompts. Active for artist/designer citizens.
 */

import { RESOLUTION_LABELS, type GlmQueueStatus } from "../domain/types.ts";

const ARTIST_ROLES = [
  "artist",
  "designer",
  "graphic",
  "visual",
  "creative",
  "illustrator",
  "photographer",
  "filmmaker",
  "animator",
  "branding",
  "marketing",
  "ui",
  "ux",
];

export function composeGlmPrompt(specialization: string, queueStatus: GlmQueueStatus): string {
  const isArtist = ARTIST_ROLES.some((r) => specialization.toLowerCase().includes(r));

  if (!isArtist && !queueStatus.installed) {
    return "";
  }

  const resolutions = Object.entries(RESOLUTION_LABELS)
    .map(([key, label]) => `  • ${key}: ${label}`)
    .join("\n");

  const queueInfo =
    queueStatus.runningJobs > 0
      ? `\n⚠️ GPU is currently generating an image. Jobs queue: ${queueStatus.queuedJobs} waiting.`
      : "";

  return `## 🎨 GLM-Image — AI Image Generation

You have access to GLM-Image, a state-of-the-art image generation model (9B AR + 7B DiT).
It can generate high-quality images from text descriptions and also perform image-to-image tasks.

### Capabilities:
• **Text-to-Image**: Generate images from detailed text descriptions
• **Image-to-Image**: Edit images, apply style transfer, identity-preserving generation
• **Text Rendering**: Accurate text within images (enclose text in quotation marks)
• **Multi-Subject Consistency**: Generate images with multiple referenced subjects

### Available Resolutions (must be divisible by 32):
${resolutions}

### Tools:
• \`glm_generate_image\` — Text-to-image generation
• \`glm_edit_image\` — Image-to-image editing (requires input image paths)
• \`glm_job_status\` — Check generation progress
• \`glm_cancel_job\` — Cancel a queued/running generation
• \`glm_queue_status\` — View queue status

### Tips:
• Use detailed, descriptive prompts for best results
• Enclose any text you want rendered in the image in "quotation marks"
• Default resolution is 1024×1024; use presets for other aspect ratios
• Image-to-image supports multiple input images for multi-subject composition
${queueInfo}`;
}
