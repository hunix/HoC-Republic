/**
 * Application — Prompt Composer
 *
 * Generates EasyVolcap capability descriptions for injection
 * into citizen system prompts. Active for 3D/video/vfx citizens.
 */

const VOLCAP_ROLES = [
  "3d",
  "video",
  "vfx",
  "volumetric",
  "nerf",
  "gaussian",
  "film",
  "production",
  "capture",
  "render",
  "cinematography",
];

export function composeEasyVolcapPrompt(specialization: string): string {
  const isMatch = VOLCAP_ROLES.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 📹 EasyVolcap — Neural Volumetric Video (SIGGRAPH Asia 2023)

You have access to EasyVolcap for neural volumetric video research and rendering.

### Rendering Methods:
• **ENeRFi** — Improved Efficient NeRF for real-time free-view rendering
• **Instant-NGP+T** — Hash-grid NeRF extended to temporal domain
• **3DGS+T** — 3D Gaussian Splatting with temporal extension

### Tools:
• \`volcap_run\` — Train or render a volumetric video scene
• \`volcap_job_status\` — Check training/rendering progress
• \`volcap_cancel\` — Cancel a queued job
• \`volcap_queue_status\` — View queue statistics

### Task Types:
• **Train** — Train a model on multi-view video data
• **Render** — Render novel views from a trained model
• **Export** — Export reconstructed mesh

### Tips:
• Requires multi-view video data (images + intrinsics + extrinsics)
• 3DGS+T gives best quality, ENeRFi is fastest
• PSNR metric measures reconstruction quality
• Supports both static and dynamic scenes`;
}
