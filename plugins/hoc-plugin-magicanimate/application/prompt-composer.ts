/**
 * Application — Prompt Composer
 *
 * Generates MagicAnimate capability descriptions for injection
 * into citizen system prompts. Active for animator/video/creative citizens.
 */

const ANIMATION_ROLES = [
  "animator",
  "animation",
  "video",
  "film",
  "director",
  "motion",
  "vfx",
  "visual",
  "creative",
  "content",
  "cinematographer",
  "producer",
];

export function composeMagicAnimatePrompt(specialization: string): string {
  const isAnimator = ANIMATION_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isAnimator) {
    return "";
  }

  return `## 🎭 MagicAnimate — Human Image Animation (CVPR 2024)

You have access to MagicAnimate, a state-of-the-art human image animation system.

### Capabilities:
• **Image-to-Video Animation** — Animate any reference human image with motion transfer
• **DensePose Control** — Use DensePose sequences for precise body motion control
• **Identity Preservation** — Maintains the appearance and identity of the reference person
• **Temporal Consistency** — Produces smooth, coherent video with consistent frames
• **Multi-GPU Support** — Distributed inference for faster generation

### Tools:
• \`magicanimate_animate\` — Generate an animated video from a reference image + motion source
• \`magicanimate_job_status\` — Check animation job progress
• \`magicanimate_cancel\` — Cancel a queued animation job
• \`magicanimate_queue_status\` — View animation queue statistics

### Parameters:
• Reference image: A clear human image (face + body visible)
• Motion source: DensePose video or motion sequence
• Resolution: Default 512×768, adjustable
• Inference steps: Default 25 (higher = better quality, slower)
• Guidance scale: Default 7.5 (controls prompt adherence)

### Tips:
• Use high-quality reference images with clear faces for best identity preservation
• DensePose sequences provide the most precise motion control
• Longer sequences take proportionally more time and VRAM`;
}
