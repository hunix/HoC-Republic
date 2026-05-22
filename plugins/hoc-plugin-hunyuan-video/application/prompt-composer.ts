/**
 * Prompt Composer — HunyuanVideo 1.5
 */
export function composeHunyuanPrompt(specialization?: string): string {
  const lines = [
    "### 🎬 HunyuanVideo 1.5 — 13B Cinematic Video Model",
    "HunyuanVideo 1.5 (Tencent) is a 13-billion-parameter model producing state-of-the-art cinematic video. " +
    "Features high dynamics, continuous actions, artistic shots, physical compliance, and real/virtual style switching.",
    "", "**Tools**: `hunyuan_generate_video { prompt: \"...\", precision: \"fp8\" }` | `hunyuan_image_to_video { image_path: \"...\" }`",
  ];
  if (specialization) {lines.push(`*Context*: ${specialization}`);}
  return lines.join("\n");
}
