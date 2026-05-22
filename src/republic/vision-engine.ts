/**
 * Vision Engine — Barrel Re-export
 */
export type {
  VisionAction,
  VisionRequest,
  VisionResponse,
  VisionProvider,
  VisionProviderConfig,
  VisionDiagnostics,
} from "./vision-engine/types.js";

export {
  analyzeImage,
  describeImage,
  ocrImage,
  analyzeChart,
  analyzeScreenshot,
  askAboutImage,
  getVisionDiagnostics,
  isVisionAvailable,
} from "./vision-engine/core.js";

export {
  isVisionProviderAvailable,
  getAvailableVisionProviders,
  getProviderConfig,
} from "./vision-engine/providers.js";
