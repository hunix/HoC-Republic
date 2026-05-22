/**
 * Application — Prompt Composer
 *
 * Generates KV-Edit capability descriptions for injection
 * into citizen system prompts. Active for artist/editor/photo citizens.
 */

const EDIT_ROLES = [
  "artist",
  "editor",
  "photo",
  "designer",
  "retoucher",
  "creative",
  "visual",
  "graphic",
  "image",
  "vfx",
];

export function composeKVEditPrompt(specialization: string): string {
  const isMatch = EDIT_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## ✏️ KV-Edit — Training-Free Image Editing (ICCV 2025)

You have access to KV-Edit, which edits images while precisely preserving the background.

### Edit Operations:
• **Add** — Add new objects to a scene
• **Remove** — Remove objects, leaving clean background
• **Replace** — Swap objects while keeping surroundings intact

### Tools:
• \`kvedit_edit\` — Edit an image with mask and prompts
• \`kvedit_job_status\` — Check editing progress
• \`kvedit_cancel\` — Cancel a queued edit
• \`kvedit_queue_status\` — View queue statistics

### How It Works:
1. Provide source image + source prompt → KV-Edit inverts it
2. Draw/provide a mask for the edit region
3. Provide target prompt → generates edit with perfect background

### Parameters:
• \`skip_steps\` — Higher = more change in masked region (default: 3)
• \`attn_scale\` — Higher = smoother foreground-background blending
• \`re_init\` — Use image blending instead of inversion for new content
• \`attn_mask\` — Input mask before inversion for better results

### Tips:
• Inversion only needs to happen once per source image
• For large mask areas, increase \`attn_scale\` for continuity
• Uses FLUX model — requires 24GB VRAM (or use --offload)`;
}
