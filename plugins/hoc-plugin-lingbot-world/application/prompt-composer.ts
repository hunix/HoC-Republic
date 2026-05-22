/**
 * Application — Prompt Composer
 *
 * Generates LingBot-World capability descriptions for injection
 * into citizen system prompts. Active for creative/filmmaker citizens.
 */

import type { WorldResolution } from "../domain/types.ts";
import {
    DEFAULT_FRAME_NUM, FPS, MAX_FRAME_NUM, RESOLUTION_LABELS, SUPPORTED_RESOLUTIONS
} from "../domain/types.ts";
import { getQueueStatus } from "./simulation-scheduler.ts";

const CREATIVE_SPECIALIZATIONS = new Set([
  "filmmaker",
  "animator",
  "creative-director",
  "content-creator",
  "artist",
  "game-developer",
  "vr-developer",
  "visual-designer",
  "video-editor",
  "motion-designer",
]);

export function composeWorldPrompt(specialization?: string): string {
  if (!specialization) {
    return "";
  }
  if (!CREATIVE_SPECIALIZATIONS.has(specialization.toLowerCase())) {
    return "";
  }

  const q = getQueueStatus();

  const resolutionList = SUPPORTED_RESOLUTIONS.map(
    (r: WorldResolution) => `  • \`${r}\` — ${RESOLUTION_LABELS[r]}`,
  ).join("\n");

  const maxSeconds = Math.round(MAX_FRAME_NUM / FPS);
  const defaultSeconds = Math.round(DEFAULT_FRAME_NUM / FPS);

  const lines: string[] = [
    "## World Simulation Tools (LingBot-World)",
    "",
    "You have access to an AI world simulation engine that generates interactive videos from images.",
    "",
    "### Capabilities",
    "  • Image → Video generation with text prompts",
    "  • Camera path control (first-person navigation, fly-throughs)",
    "  • High-fidelity environments (realistic, sci-fi, cartoon, etc.)",
    `  • Up to ${maxSeconds} seconds at ${FPS} FPS (default: ${defaultSeconds} seconds)`,
    "",
    "### Resolutions",
    resolutionList,
    "",
    "### Key Tools",
    "  • `world_generate` — Generate world simulation video from image + prompt",
    "  • `world_generate_camera` — Generate with camera control (intrinsics + poses)",
    "  • `world_job_status` — Check generation progress",
    "  • `world_cancel_job` — Cancel a running generation",
    "",
    "### Usage",
    `  Running: ${q.running} | Completed: ${q.completed} | Failed: ${q.failed}`,
    "",
    "### Tips",
    "  • Provide a detailed cinematic prompt describing the scene, camera movement, and atmosphere",
    "  • Use 480p for faster generation, 720p for final quality",
    "  • Frame count must be 4n+1 (e.g., 161, 321, 481, 961)",
  ];

  return lines.join("\n");
}
