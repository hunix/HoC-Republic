/**
 * Genetics Enhanced — Info helper (avoids circular import from genetics-enhanced.ts)
 * Re-exports static metadata for the RPC layer.
 */

import type { NeuralGenome } from "./types.js";
import { BASE_MUTATION_RATE, adaptiveMutationRate, computeDiversity } from "./genetics-enhanced.js";

export { adaptiveMutationRate, computeDiversity };

export function getAdaptiveMutationInfo(pool: NeuralGenome[]) {
  const state = adaptiveMutationRate(pool);
  return {
    currentRate: state.currentRate,
    baseMutationRate: BASE_MUTATION_RATE,
    diversityScore: state.diversityScore,
    mode:
      state.diversityScore < 0.15
        ? "exploration-burst"
        : state.diversityScore > 0.6
          ? "exploitation-focus"
          : "balanced",
    lastComputedAt: state.lastComputedAt,
  };
}
