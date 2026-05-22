/**
 * Application — Prompt Composer
 *
 * Generates Deforum capability descriptions for injection
 * into citizen system prompts. Active for animator/artist/video citizens.
 */

const ANIMATION_ROLES = [
  "animator",
  "artist",
  "video",
  "motion",
  "vfx",
  "creative",
  "film",
  "director",
  "visual",
  "designer",
  "multimedia",
];

export function composeDeforumPrompt(specialization: string): string {
  const isMatch = ANIMATION_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🎬 Deforum — Animated Stable Diffusion

You have access to Deforum for generating AI-powered animations from text prompts.

### Animation Modes:
• **2D** — Pan, zoom, and rotate animations
• **3D** — Depth-aware 3D camera movement
• **Interpolation** — Smooth transitions between prompts
• **RANSAC** — Optical flow-based animation

### Tools:
• \`deforum_animate\` — Generate an animation from text prompts
• \`deforum_job_status\` — Check animation progress
• \`deforum_cancel\` — Cancel a queued animation
• \`deforum_queue_status\` — View queue statistics

### Key Features:
• Keyframe scheduling for angle, zoom, and translation
• CLIP guidance for style consistency
• Color palette conditioning
• Negative prompts for quality control

### Tips:
• Use keyframe schedules like "0:(1.0), 60:(1.5)" for gradual zoom
• 2D mode is fastest, 3D mode gives depth parallax
• Higher CFG scale = stronger prompt adherence
• 15 FPS is standard, increase for smoother motion`;
}
