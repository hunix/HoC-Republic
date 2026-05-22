/**
 * Cloud Inference — Provider Adapters (Barrel)
 *
 * Re-exports all provider adapter functions from:
 *   - adapters-cloud.ts — rate-limited cloud providers (Groq, NIM, DeepSeek, OpenRouter)
 *   - adapters-local.ts — cluster-aware local providers (Ollama, LM Studio, Gemma 4)
 */

export {
  groqInference,
  nvidiaNimInference,
  deepSeekInference,
  openRouterInference,
} from "./adapters-cloud.js";
export { ollamaInference, lmStudioInference, gemma4Inference } from "./adapters-local.js";
