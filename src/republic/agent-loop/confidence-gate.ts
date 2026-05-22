/**
 * Confidence Gate — Self-Assessment Before Final Delivery
 *
 * Before delivering a final answer, the agent evaluates its own confidence
 * across multiple dimensions. If confidence is too low, it triggers
 * additional verification or qualification of the output.
 *
 * Dimensions assessed:
 *   1. Completeness — did the agent address all parts of the request?
 *   2. Verification — was the output tested/validated?
 *   3. Error exposure — were there unresolved errors?
 *   4. Tool coverage — were the right tools used?
 *   5. Iteration efficiency — did the agent use its budget well?
 *
 * Actions based on confidence:
 *   - HIGH (≥80%):  Deliver as-is
 *   - MEDIUM (50-80%): Add qualification disclaimers
 *   - LOW (<50%):  Trigger one more verification iteration
 *
 * No competing system does structured self-confidence assessment before delivery.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ConfidenceAssessment {
  /** Overall confidence (0.0-1.0) */
  overall: number;
  /** Per-dimension breakdown */
  dimensions: {
    completeness: number;
    verification: number;
    errorFreedom: number;
    toolCoverage: number;
    efficiency: number;
  };
  /** Human-readable tier */
  tier: "high" | "medium" | "low";
  /** Action to take */
  action: "deliver" | "qualify" | "verify";
  /** Qualification text if action is "qualify" */
  qualification?: string;
  /** Verification prompt if action is "verify" */
  verificationPrompt?: string;
}

// ─── Weights ────────────────────────────────────────────────────

const WEIGHTS = {
  completeness: 0.3,
  verification: 0.25,
  errorFreedom: 0.2,
  toolCoverage: 0.15,
  efficiency: 0.1,
};

// ─── Assessment ─────────────────────────────────────────────────

/**
 * Assess the agent's confidence in its output before delivery.
 */
export function assessConfidence(params: {
  /** Final response text */
  response: string;
  /** Original user message */
  userMessage: string;
  /** Total iterations used */
  iterations: number;
  /** Max iterations available */
  maxIterations: number;
  /** Total tool errors encountered */
  totalToolErrors: number;
  /** Tools used during the session */
  toolsUsed: string[];
  /** Strategy type */
  strategy: string;
  /** Whether a preview URL was produced (for BUILD tasks) */
  hasPreview: boolean;
  /** Artifact files produced */
  artifactCount: number;
}): ConfidenceAssessment {
  const {
    response,
    userMessage,
    iterations,
    maxIterations,
    totalToolErrors,
    toolsUsed,
    strategy,
    hasPreview,
    artifactCount,
  } = params;

  // ── 1. Completeness ────────────────────────────────────────
  let completeness = 0.5; // baseline

  // Long responses generally indicate thoroughness
  if (response.length > 2000) {
    completeness += 0.2;
  } else if (response.length > 500) {
    completeness += 0.1;
  } else if (response.length < 100) {
    completeness -= 0.3;
  }

  // Build tasks: having a preview is strong signal
  if (strategy === "BUILD" || strategy === "FULL_STACK") {
    if (hasPreview) {
      completeness += 0.2;
    }
    if (artifactCount > 0) {
      completeness += 0.1;
    }
  }

  // Research tasks: having citations/links is good
  if (strategy === "RESEARCH") {
    const hasUrls = /https?:\/\//.test(response);
    if (hasUrls) {
      completeness += 0.1;
    }
    const hasSections = (response.match(/^#+\s/gm) || []).length;
    if (hasSections >= 2) {
      completeness += 0.1;
    }
  }

  completeness = clamp(completeness);

  // ── 2. Verification ────────────────────────────────────────
  let verification = 0.3; // baseline (no explicit verification)

  const uniqueTools = new Set(toolsUsed);
  // Build tasks: running tests or verifying code is strong signal
  if (uniqueTools.has("bash_exec") || uniqueTools.has("execute_command")) {
    verification += 0.2;
  }
  if (hasPreview) {
    verification += 0.3;
  }
  if (artifactCount > 0) {
    verification += 0.1;
  }
  // Research: reading/verifying sources
  if (uniqueTools.has("read_url") || uniqueTools.has("web_search")) {
    verification += 0.1;
  }

  verification = clamp(verification);

  // ── 3. Error Freedom ───────────────────────────────────────
  let errorFreedom = 1.0;
  if (totalToolErrors > 0) {
    errorFreedom -= 0.15 * Math.min(totalToolErrors, 5);
  }
  // Check if the response mentions errors/caveats
  const errorMentions = (response.match(/error|failed|couldn't|unable|issue/gi) || []).length;
  if (errorMentions > 3) {
    errorFreedom -= 0.1;
  }
  errorFreedom = clamp(errorFreedom);

  // ── 4. Tool Coverage ───────────────────────────────────────
  let toolCoverage = 0.5;

  // Strategy-specific tool expectations
  const expectedTools: Record<string, string[]> = {
    RESEARCH: ["web_search", "read_url"],
    BUILD: ["write_file", "bash_exec"],
    FULL_STACK: ["write_file", "bash_exec", "create_file"],
    ANALYSIS: ["bash_exec", "write_file"],
    CREATIVE: ["create_document"],
    DIRECT: [],
    DEEP_THINK: [],
  };

  const expected = expectedTools[strategy] ?? [];
  if (expected.length > 0) {
    const covered = expected.filter((t) => uniqueTools.has(t)).length;
    toolCoverage = covered / expected.length;
  } else {
    toolCoverage = uniqueTools.size > 0 ? 0.8 : 0.5;
  }

  toolCoverage = clamp(toolCoverage);

  // ── 5. Efficiency ──────────────────────────────────────────
  let efficiency = 0.5;
  const budgetUsed = iterations / maxIterations;
  // Using 30-70% of budget is ideal
  if (budgetUsed >= 0.3 && budgetUsed <= 0.7) {
    efficiency = 0.9;
  } else if (budgetUsed < 0.3) {
    efficiency = 0.6;
  } // surprisingly fast — might have skipped steps
  else if (budgetUsed > 0.9) {
    efficiency = 0.3;
  } // ran out of budget — probably struggled
  efficiency = clamp(efficiency);

  // ── Weighted combination ───────────────────────────────────
  const overall =
    completeness * WEIGHTS.completeness +
    verification * WEIGHTS.verification +
    errorFreedom * WEIGHTS.errorFreedom +
    toolCoverage * WEIGHTS.toolCoverage +
    efficiency * WEIGHTS.efficiency;

  const dimensions = {
    completeness,
    verification,
    errorFreedom,
    toolCoverage,
    efficiency,
  };

  // ── Tier + Action ──────────────────────────────────────────
  let tier: "high" | "medium" | "low";
  let action: "deliver" | "qualify" | "verify";
  let qualification: string | undefined;
  let verificationPrompt: string | undefined;

  if (overall >= 0.8) {
    tier = "high";
    action = "deliver";
  } else if (overall >= 0.5) {
    tier = "medium";
    action = "qualify";

    // Build qualification text based on weakest dimensions
    const weakest = Object.entries(dimensions)
      .toSorted(([, a], [, b]) => a - b)
      .slice(0, 2);

    const qualParts: string[] = [];
    for (const [dim, score] of weakest) {
      if (score < 0.5) {
        const dimLabels: Record<string, string> = {
          completeness: "some aspects of the request may not be fully addressed",
          verification: "the output has not been fully tested or verified",
          errorFreedom: "there were some errors encountered during execution",
          toolCoverage: "not all expected operations were performed",
          efficiency: "the task used most of the available budget",
        };
        qualParts.push(dimLabels[dim] ?? `${dim} was low`);
      }
    }
    qualification =
      qualParts.length > 0
        ? `Note: ${qualParts.join("; ")}. Please review the output carefully.`
        : undefined;
  } else {
    tier = "low";
    action = "verify";
    verificationPrompt = buildVerificationPrompt(dimensions, userMessage);
  }

  return {
    overall: Math.round(overall * 100) / 100,
    dimensions,
    tier,
    action,
    qualification,
    verificationPrompt,
  };
}

// ─── Helpers ────────────────────────────────────────────────────

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function buildVerificationPrompt(
  dimensions: ConfidenceAssessment["dimensions"],
  userMessage: string,
): string {
  const weakAreas: string[] = [];
  if (dimensions.completeness < 0.5) {
    weakAreas.push("completeness");
  }
  if (dimensions.verification < 0.4) {
    weakAreas.push("verification");
  }
  if (dimensions.errorFreedom < 0.5) {
    weakAreas.push("unresolved errors");
  }

  return [
    `[VERIFICATION REQUIRED — Low confidence detected]`,
    ``,
    `Before delivering your final answer, perform a quick verification:`,
    weakAreas.includes("completeness")
      ? `1. Re-read the original request and confirm you've addressed ALL parts: "${userMessage.slice(0, 200)}"`
      : "",
    weakAreas.includes("verification")
      ? `2. Run a test or validation command to verify your output works correctly.`
      : "",
    weakAreas.includes("unresolved errors")
      ? `3. Review any errors encountered and ensure they were resolved or accounted for.`
      : "",
    ``,
    `After verification, provide your final answer with any necessary caveats.`,
  ]
    .filter(Boolean)
    .join("\n");
}
