/**
 * Application — Prompt Composer
 *
 * Generates DeepFaceLab capability descriptions for injection
 * into citizen system prompts. Only injected for citizens with
 * creative / video-production specializations.
 */

import type { DflPipelineStage } from "../domain/types.ts";
import { PIPELINE_STAGES, SORT_METHODS, STAGE_DESCRIPTIONS } from "../domain/types.ts";
import { getQueueStatus } from "./pipeline-orchestrator.ts";

const CREATIVE_SPECIALIZATIONS = new Set([
  "artist",
  "filmmaker",
  "animator",
  "content-creator",
  "video-editor",
  "vfx-artist",
  "cinematographer",
  "creative-director",
  "media-producer",
  "designer",
]);

/**
 * Build a DeepFaceLab capability prompt fragment for creative citizens.
 */
export function composeDflPrompt(specialization?: string): string {
  if (!specialization) {
    return "";
  }
  if (!CREATIVE_SPECIALIZATIONS.has(specialization.toLowerCase())) {
    return "";
  }

  const queue = getQueueStatus();

  const stageList = PIPELINE_STAGES.map(
    (s: DflPipelineStage) => `  • ${s} — ${STAGE_DESCRIPTIONS[s]}`,
  ).join("\n");

  const sortList = SORT_METHODS.slice(0, 8).join(", ") + ", …";

  const lines: string[] = [
    "## Deepfake Pipeline Tools (DeepFaceLab)",
    "",
    "You have access to DeepFaceLab — the industry-leading deepfake pipeline.",
    "Use the DFL tools to run **multi-stage face-swap pipelines** on local GPU hardware.",
    "",
    "### Pipeline Stages",
    stageList,
    "",
    "### Available Sort Methods",
    sortList,
    "",
    "### Key Tools",
    "  • `dfl_create_pipeline` — Create a full face-swap pipeline from source + target videos",
    "  • `dfl_start_pipeline` — Start processing (runs all stages automatically)",
    "  • `dfl_pipeline_status` — Check progress and current stage",
    "  • `dfl_extract_faces` — Run face extraction independently",
    "  • `dfl_train_model` — Start or resume model training",
    "  • `dfl_merge_faces` — Apply trained model to target frames",
    "",
    "### Current Queue Status",
    `  Active: ${queue.running} | Completed: ${queue.completed} | Failed: ${queue.failed}`,
    "",
    "### Usage Tips",
    "  • Training is the longest stage — typically 50k–200k iterations",
    "  • Use higher image sizes (512+) for better quality but slower training",
    "  • The `whole_face` face type gives the most natural results",
    "  • Sort by `hist` to remove duplicate/low-quality faces before training",
  ];

  return lines.join("\n");
}
