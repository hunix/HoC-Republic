/**
 * Prompt Composer — LTX-2
 */
export function composeLTXPrompt(specialization?: string): string {
  const lines = [
    "### 🎥 LTX-2 — Production-Ready 4K Video with Audio",
    "LTX-2 (Lightricks) generates production-quality video at native 4K/50fps with synchronized audio. " +
    "Optimized for NVIDIA GPUs with FP8/NVFP4 quantization for consumer hardware.",
    "",
    "**Tools**: `ltx_generate_video { prompt: \"...\", resolution: \"4K\", with_audio: true }` | `ltx_image_to_video { image_path: \"...\", prompt: \"...\" }`",
  ];
  if (specialization) {lines.push(`*Context*: ${specialization}`);}
  return lines.join("\n");
}
