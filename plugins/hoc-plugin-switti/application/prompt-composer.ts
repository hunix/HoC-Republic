/**
 * Application — Prompt Composer
 *
 * Generates Switti capability descriptions for injection
 * into citizen system prompts. Active for artist/designer/creative citizens.
 */

const ART_ROLES = [
  "artist",
  "designer",
  "illustrator",
  "creative",
  "visual",
  "graphic",
  "content",
  "art",
  "painter",
  "concept",
  "photographer",
  "director",
];

export function composeSwittiPrompt(specialization: string): string {
  const isArtist = ART_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isArtist) {
    return "";
  }

  return `## 🎨 Switti — Fast Text-to-Image Generation (CVPR 2025)

You have access to Switti, a scale-wise transformer for fast text-to-image synthesis.

### Capabilities:
• **Fast Generation** — Faster than distilled diffusion models
• **High Quality** — Outperforms existing T2I autoregressive models
• **4 Model Variants:**
  - Switti (512×512) — standard scale-wise
  - Switti-AR (512×512) — autoregressive
  - Switti-1024 (1024×1024) — high-res scale-wise
  - Switti-1024-AR (1024×1024) — high-res autoregressive

### Tools:
• \`switti_generate\` — Generate an image from a text prompt
• \`switti_job_status\` — Check generation job progress
• \`switti_cancel\` — Cancel a queued generation job
• \`switti_queue_status\` — View generation queue statistics

### Sampling Parameters:
• \`cfg\` — Classifier-free guidance (default: 6.0)
• \`top_k\` — Top-k sampling (default: 400)
• \`top_p\` — Nucleus sampling (default: 0.95)
• \`more_smooth\` — Smoother results (default: true)
• \`seed\` — Reproducible generation

### Tips:
• Use detailed, descriptive prompts for best results
• Switti-1024 produces the highest quality but uses more VRAM
• The AR variants may have different artistic styles`;
}
