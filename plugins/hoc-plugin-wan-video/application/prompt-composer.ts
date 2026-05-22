/**
 * Application — Prompt Composer
 *
 * Constructs cinematic prompts for Wan 2.2 video generation,
 * injecting style tokens, camera motion directives, and quality boosters.
 */

export function composeWanPrompt(specialization?: string): string {
  const lines: string[] = [];
  lines.push("### 🎬 Wan 2.2 — Cinematic AI Video Generation");
  lines.push(
    "Wan 2.2 (Alibaba MoE architecture) generates cinematic-quality video from text prompts. " +
    "Features include cinematic lighting, controlled color grading, realistic camera motion, " +
    "and strong prompt alignment. Supports text-to-video and image-to-video at up to 720p."
  );
  lines.push("");
  lines.push("**Prompt tips for best results:**");
  lines.push("- Be specific about lighting: 'golden hour lighting', 'neon-lit cyberpunk street'");
  lines.push("- Specify camera motion: 'slow dolly forward', 'aerial tracking shot'");
  lines.push("- Include style: 'cinematic color grading', 'film grain', 'anamorphic lens'");
  lines.push("");
  lines.push("**Tools**: `wan_generate_video { prompt: \"...\", style: \"cinematic\", camera_motion: \"dolly\" }` | `wan_image_to_video { image_path: \"...\", prompt: \"...\" }`");
  if (specialization) {
    lines.push(`\n*Specialization context*: ${specialization}`);
  }
  return lines.join("\n");
}
