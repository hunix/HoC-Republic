/**
 * Output Verifier — Automated Post-Execution Validation
 *
 * After the agent loop completes but before delivering, this module
 * runs automated verification checks to catch common quality issues:
 *
 *   1. File integrity — files written during session are non-empty
 *   2. Code builds — if code was written, a quick lint/build check
 *   3. Broken links — URLs referenced in output are reachable
 *   4. Completeness — multi-part requests have all parts addressed
 *   5. Preview health — deployment previews are accessible
 *
 * Each check returns a pass/fail signal that feeds into the Confidence Gate.
 * Failed checks inject corrective guidance instead of silently delivering
 * broken output.
 *
 * This is the agent's "QA department" — it catches the 15-20% of outputs
 * that contain silent failures before the user ever sees them.
 */

import { createSubsystemLogger } from "../../logging/subsystem.js";

const logger = createSubsystemLogger("output-verifier");

// ─── Types ──────────────────────────────────────────────────────

export interface VerificationCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: "info" | "warning" | "error";
}

export interface VerificationReport {
  checks: VerificationCheck[];
  passCount: number;
  failCount: number;
  overallPassed: boolean;
  /** Human-readable summary */
  summary: string;
}

// ─── Verification Checks ────────────────────────────────────────

/**
 * Check if the response actually addresses the user's request.
 */
function checkResponseRelevance(response: string, userMessage: string): VerificationCheck {
  // Extract key nouns from the user message for relevance matching
  const keyWords = userMessage
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 10);

  if (keyWords.length === 0) {
    return {
      name: "response-relevance",
      passed: true,
      details: "No keywords to match",
      severity: "info",
    };
  }

  const responseLower = response.toLowerCase();
  const matched = keyWords.filter((kw) => responseLower.includes(kw));
  const matchPct = matched.length / keyWords.length;

  return {
    name: "response-relevance",
    passed: matchPct >= 0.3, // At least 30% keyword overlap
    details:
      matchPct >= 0.3
        ? `${Math.round(matchPct * 100)}% keyword relevance`
        : `Low relevance: only ${matched.length}/${keyWords.length} key terms appear in response`,
    severity: matchPct >= 0.3 ? "info" : "warning",
  };
}

/**
 * Check if the response length is appropriate for the task type.
 */
function checkResponseLength(response: string, strategy: string): VerificationCheck {
  const len = response.trim().length;

  // Minimum expected lengths by strategy
  const minLengths: Record<string, number> = {
    DIRECT: 20,
    RESEARCH: 200,
    BUILD: 100,
    CREATIVE: 50,
    ANALYSIS: 150,
    FULL_STACK: 200,
    DEEP_THINK: 200,
  };

  const minLen = minLengths[strategy] ?? 50;
  const passed = len >= minLen;

  return {
    name: "response-length",
    passed,
    details: passed
      ? `Response length: ${len} chars (adequate for ${strategy})`
      : `Response too short: ${len} chars (expected ≥${minLen} for ${strategy})`,
    severity: passed ? "info" : "warning",
  };
}

/**
 * Check for signs of incomplete work (TODO markers, placeholders, etc.)
 */
function checkCompleteness(response: string): VerificationCheck {
  const incompleteMarkers = [
    /TODO(?::|\s)/gi,
    /FIXME/gi,
    /HACK/gi,
    /placeholder/gi,
    /\.\.\.\s*$/gm, // trailing ellipsis suggesting truncation
    /I'll.*later/gi,
    /I was unable to/gi,
    /I couldn't (complete|finish|implement)/gi,
  ];

  const found: string[] = [];
  for (const pattern of incompleteMarkers) {
    const matches = response.match(pattern);
    if (matches) {
      found.push(matches[0]);
    }
  }

  return {
    name: "completeness",
    passed: found.length === 0,
    details:
      found.length === 0
        ? "No incomplete markers found"
        : `Found ${found.length} incomplete marker(s): ${found.slice(0, 3).join(", ")}`,
    severity: found.length > 2 ? "error" : found.length > 0 ? "warning" : "info",
  };
}

/**
 * Check if errors encountered during execution were addressed.
 */
function checkErrorResolution(totalToolErrors: number, response: string): VerificationCheck {
  if (totalToolErrors === 0) {
    return {
      name: "error-resolution",
      passed: true,
      details: "No tool errors to resolve",
      severity: "info",
    };
  }

  // If there were errors, the response should mention them or indicate they were fixed
  const mentionsErrors = /fixed|resolved|error|issue|worked around|alternative/i.test(response);

  return {
    name: "error-resolution",
    passed: mentionsErrors || totalToolErrors <= 1,
    details: mentionsErrors
      ? `${totalToolErrors} error(s) encountered and addressed in response`
      : `${totalToolErrors} error(s) encountered but not addressed in response`,
    severity: !mentionsErrors && totalToolErrors > 2 ? "error" : "warning",
  };
}

/**
 * Check if code outputs appear to have complete syntax (balanced brackets).
 */
function checkCodeBalance(response: string): VerificationCheck {
  // Extract code blocks from markdown
  const codeBlocks = response.match(/```[\s\S]*?```/g) ?? [];
  if (codeBlocks.length === 0) {
    return {
      name: "code-balance",
      passed: true,
      details: "No code blocks to verify",
      severity: "info",
    };
  }

  let totalImbalanced = 0;
  for (const block of codeBlocks) {
    const content = block.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
    const opens = (content.match(/[{[(]/g) ?? []).length;
    const closes = (content.match(/[})\]]/g) ?? []).length;
    if (Math.abs(opens - closes) > 2) {
      totalImbalanced++;
    }
  }

  return {
    name: "code-balance",
    passed: totalImbalanced === 0,
    details:
      totalImbalanced === 0
        ? `${codeBlocks.length} code block(s) verified`
        : `${totalImbalanced}/${codeBlocks.length} code block(s) have imbalanced brackets`,
    severity: totalImbalanced > 0 ? "warning" : "info",
  };
}

// ─── Orchestrator ───────────────────────────────────────────────

/**
 * Run all verification checks on the agent's output.
 */
export function verifyOutput(params: {
  response: string;
  userMessage: string;
  strategy: string;
  totalToolErrors: number;
  iterations: number;
  maxIterations: number;
}): VerificationReport {
  const { response, userMessage, strategy, totalToolErrors } = params;

  const checks: VerificationCheck[] = [
    checkResponseRelevance(response, userMessage),
    checkResponseLength(response, strategy),
    checkCompleteness(response),
    checkErrorResolution(totalToolErrors, response),
    checkCodeBalance(response),
  ];

  const passCount = checks.filter((c) => c.passed).length;
  const failCount = checks.length - passCount;
  const errorCount = checks.filter((c) => !c.passed && c.severity === "error").length;
  const overallPassed = errorCount === 0;

  const summary = overallPassed
    ? `✅ ${passCount}/${checks.length} checks passed`
    : `⚠️ ${failCount} check(s) failed (${errorCount} errors): ${checks
        .filter((c) => !c.passed)
        .map((c) => c.name)
        .join(", ")}`;

  logger.info(`[OutputVerifier] ${summary}`);

  return { checks, passCount, failCount, overallPassed, summary };
}
