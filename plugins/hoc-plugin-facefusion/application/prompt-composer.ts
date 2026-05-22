/**
 * Application — Prompt Composer
 *
 * Injects FaceFusion capabilities into citizen prompts.
 * Only meaningful content for creative/video specializations.
 */

import {
    ALL_PROCESSORS,
    PROCESSOR_DESCRIPTIONS,
    type FaceProcessor,
    type QueueStatus
} from "../domain/types.ts";

// ─── Specialization Relevance ───────────────────────────────────

const CREATIVE_SPECIALIZATIONS = new Set([
  "video-producer",
  "video-editor",
  "filmmaker",
  "animator",
  "vfx-artist",
  "graphic-designer",
  "designer",
  "content-creator",
  "photographer",
  "media-specialist",
  "creative-director",
  "artist",
]);

/**
 * Check whether a specialization should receive FaceFusion capabilities.
 * All citizens CAN use it, but only creative ones get proactive injection.
 */
export function isCreativeSpecialization(specialization: string): boolean {
  return CREATIVE_SPECIALIZATIONS.has(specialization);
}

// ─── Prompt Composition ─────────────────────────────────────────

/**
 * Compose the FaceFusion prompt section for a citizen.
 */
export function composeFaceFusionPrompt(specialization: string, queueStatus: QueueStatus): string {
  // Only inject for creative specializations (any citizen can still use tools explicitly)
  if (!isCreativeSpecialization(specialization)) {
    return "";
  }

  if (!queueStatus.installed) {
    return "";
  }

  const lines: string[] = [
    "## Face Manipulation & Video Production Tools",
    "You have access to FaceFusion, an industry-leading face manipulation platform running on local GPU hardware.",
    "",
  ];

  // Available processors
  lines.push("### Available Processors");
  for (const proc of ALL_PROCESSORS) {
    lines.push(`- **${formatProcessorName(proc)}**: ${PROCESSOR_DESCRIPTIONS[proc]}`);
  }
  lines.push("");

  // Queue status
  lines.push("### Current Queue Status");
  if (queueStatus.processingJobs > 0) {
    lines.push(`- 🔄 ${queueStatus.processingJobs} job(s) processing`);
  }
  if (queueStatus.queuedJobs > 0) {
    lines.push(`- ⏳ ${queueStatus.queuedJobs} job(s) queued`);
  }
  if (queueStatus.processingJobs === 0 && queueStatus.queuedJobs === 0) {
    lines.push("- ✅ Queue empty — jobs will start immediately");
  }
  lines.push(`- Max concurrent: ${queueStatus.maxConcurrent}`);
  lines.push("");

  // GPU info
  if (queueStatus.gpuStatus.available) {
    const gpu = queueStatus.gpuStatus;
    lines.push(`### GPU: ${gpu.utilizationPercent}% utilized, ${gpu.vramFreeMB}MB VRAM free`);
  } else {
    lines.push("### GPU: Not detected (CPU mode — slower processing)");
  }
  lines.push("");

  // Usage hints
  lines.push("### Usage");
  lines.push("Use `ff_swap_face`, `ff_enhance_face`, or `ff_enhance_video` tools to submit jobs.");
  lines.push("Jobs are queued and processed sequentially to prevent GPU overwhelm.");
  lines.push("Use `ff_job_status` to check progress and `ff_queue_status` for queue overview.");

  return lines.join("\n");
}

/**
 * Format a processor name for display.
 */
function formatProcessorName(proc: FaceProcessor): string {
  return proc
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
