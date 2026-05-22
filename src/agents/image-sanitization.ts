import type { OpenClawConfig } from "../config/config.js";

export type ImageSanitizationLimits = {
  maxDimensionPx?: number;
  maxBytes?: number;
};

export const DEFAULT_IMAGE_MAX_DIMENSION_PX = 1200;
export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function resolveImageSanitizationLimits(cfg?: OpenClawConfig): ImageSanitizationLimits {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const configured = (cfg?.agents?.defaults as any)?.imageMaxDimensionPx;
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return {};
  }
  return { maxDimensionPx: Math.max(1, Math.floor(configured)) };
}
