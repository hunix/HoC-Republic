/**
 * Application — Prompt Composer
 *
 * Generates Sparc3D capability descriptions for injection
 * into citizen system prompts. Active for 3D/architect/designer citizens.
 */

const ROLES_3D = [
  "3d",
  "architect",
  "modeler",
  "sculptor",
  "designer",
  "cad",
  "game",
  "environment",
  "asset",
  "vfx",
  "creative",
];

export function composeSparc3DPrompt(specialization: string): string {
  const isMatch = ROLES_3D.some((r) => specialization.toLowerCase().includes(r));
  if (!isMatch) {
    return "";
  }

  return `## 🧊 Sparc3D — High-Resolution 3D Shape Modeling

You have access to Sparc3D, a state-of-the-art 3D generation framework using sparse representations.

### Generation Modes:
• **Image-to-3D** — Generate 3D meshes from a single image
• **Reconstruction** — Convert raw meshes to watertight meshes via Sparcubes

### Tools:
• \`sparc3d_generate\` — Generate a 3D mesh from image or reconstruct from mesh
• \`sparc3d_job_status\` — Check generation progress
• \`sparc3d_cancel\` — Cancel a queued job
• \`sparc3d_queue_status\` — View queue statistics

### Key Features:
• 1024³ voxel resolution for fine-grained detail
• Sparconv-VAE — near-lossless 3D reconstruction
• Supports open surfaces, disconnected components, intricate geometry
• Output formats: OBJ, GLB, PLY, STL

### Tips:
• Higher resolution = better detail but longer generation time
• Image-to-3D works best with clear, well-lit object photos
• Output meshes are watertight and print-ready`;
}
