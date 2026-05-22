/**
 * Application — Prompt Composer
 *
 * Generates OmniGen capability descriptions for injection
 * into citizen system prompts. Active for creative citizens.
 */

import type { OmniGenQueueStatus } from "../domain/types.ts";

const CREATIVE_ROLES = [
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
  "content",
];

export function composeOmniGenPrompt(
  specialization: string,
  queueStatus: OmniGenQueueStatus,
): string {
  const isCreative = CREATIVE_ROLES.some((r) => specialization.toLowerCase().includes(r));

  if (!isCreative && !queueStatus.installed) {
    return "";
  }

  const queueInfo =
    queueStatus.runningJobs > 0
      ? `\n⚠️ GPU is currently generating. Jobs queue: ${queueStatus.queuedJobs} waiting.`
      : "";

  return `## 🖼️ OmniGen — Unified Image Generation

You have access to OmniGen, a unified image generation model that supports:

### Capabilities:
• **Text-to-Image**: Generate images from text descriptions
• **Subject-Driven Generation**: Reference existing images to generate new ones with the same subject
• **Identity-Preserving Generation**: Maintain person/object identity across generations
• **Image Editing**: Modify existing images based on text instructions
• **Multi-Subject Composition**: Combine multiple referenced subjects in one image

### Image Reference Syntax:
When referencing input images in your prompt, use the format:
  \`<img><|image_N|></img>\` where N starts from 1
Example: "A man in a black shirt. The man is the right man in <img><|image_1|></img>."

### Tools:
• \`omnigen_generate\` — Text-to-image generation
• \`omnigen_generate_conditioned\` — Multi-modal generation with reference images
• \`omnigen_job_status\` — Check generation progress
• \`omnigen_cancel_job\` — Cancel a queued/running job
• \`omnigen_queue_status\` — View queue status

### Tips:
• Use detailed, descriptive prompts for best results
• For subject-driven gen, reference images with <img><|image_1|></img> syntax
• offload_model is enabled by default to reduce VRAM usage
• Default resolution is 1024×1024
${queueInfo}`;
}
