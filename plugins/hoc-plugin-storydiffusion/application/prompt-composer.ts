/**
 * Application — Prompt Composer
 *
 * Generates StoryDiffusion capability descriptions for injection
 * into citizen system prompts. Active for writer/creative/artist/content citizens.
 */

const STORY_ROLES = [
  "writer",
  "author",
  "storyteller",
  "creative",
  "content",
  "artist",
  "illustrator",
  "comic",
  "graphic",
  "narrative",
  "film",
  "director",
  "producer",
  "animator",
  "visual",
  "designer",
  "storyboard",
];

export function composeStoryDiffusionPrompt(specialization: string): string {
  const isStoryteller = STORY_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isStoryteller) {
    return "";
  }

  return `## 📖 StoryDiffusion — Consistent Story Image & Video Generation (NeurIPS 2024)

You have access to StoryDiffusion, a system for generating character-consistent story sequences.

### Capabilities:
• **Character Consistency** — Maintain the same character appearance across multiple scenes
• **Story Image Sequences** — Generate multi-scene stories with consistent self-attention
• **Comic Generation** — Create comic layouts (grid, strip, page) from text prompts
• **Image-to-Video** — Animate story scenes into coherent video sequences
• **Compatible with SD1.5 and SDXL** — Works with all Stable Diffusion base models

### Tools:
• \`storydiffusion_generate\` — Generate a character-consistent story sequence
• \`storydiffusion_job_status\` — Check story generation progress
• \`storydiffusion_cancel\` — Cancel a queued generation job
• \`storydiffusion_queue_status\` — View generation queue statistics

### How to Use:
• Provide **at least 3 scene prompts** (5–6 recommended for best layout)
• Each scene should describe the same character(s) in different settings/actions
• Use a global style prompt to unify the visual aesthetic
• Comic mode arranges scenes in grid/strip/page layouts

### Tips:
• Keep character descriptions consistent across all scene prompts
• Use specific details (clothing, hair color, features) in every prompt
• The system uses consistent self-attention to maintain identity automatically
• SDXL produces higher quality but requires more VRAM`;
}
