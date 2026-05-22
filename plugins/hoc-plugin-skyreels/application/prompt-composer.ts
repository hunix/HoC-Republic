/**
 * Prompt Composer — SkyReels V2
 */
export function composeSkyReelsPrompt(specialization?: string): string {
  const lines = [
    "### 🎬 SkyReels V2 — Infinite-Length Film Generation",
    "SkyReels V2 (SkyworkAI) generates films of unlimited length using AutoRegressive Diffusion-Forcing. " +
    "Features camera director control (shot types, angles, movements), multi-scene continuity, and seamless transitions.",
    "",
    "**Tools**:",
    "- `skyreels_generate_scene { prompt: \"...\", shot_type: \"wide\", camera_movement: \"dolly\" }` — single scene",
    "- `skyreels_generate_continuous { scenes: [\"...\", \"...\"], transition_type: \"seamless\" }` — multi-scene film",
    "- `skyreels_extend_video { video_path: \"...\", prompt: \"...\" }` — extend existing video",
  ];
  if (specialization) {lines.push(`*Context*: ${specialization}`);}
  return lines.join("\n");
}
