/**
 * Prompt Composer — CogVideoX
 */
export function composeCogVideoPrompt(specialization?: string): string {
  const lines = [
    "### 📹 CogVideoX — Consumer-GPU Video Generation",
    "CogVideoX (Zhipu AI) generates video on consumer GPUs as low as 8GB VRAM with INT8 quantization. " +
    "CogVideoX-2B runs on GTX 1080Ti, CogVideoX-5B on RTX 3060+. Good for draft clips and rapid iteration.",
    "", "**Tools**: `cogvideo_generate { prompt: \"...\", model: \"5B\", quantize: \"int8\" }`",
  ];
  if (specialization) {lines.push(`*Context*: ${specialization}`);}
  return lines.join("\n");
}
