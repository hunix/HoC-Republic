/**
 * Verification Agent — Post-loop quality gate.
 *
 * After the agent loop completes, this module runs a lightweight verification
 * pass to ensure the output actually addresses the user's request.
 *
 * Three-layer verification:
 *   1. Artifact integrity — files exist, non-zero size, valid formats
 *   2. Preview health   — if a web app, HTTP 200 on localhost:8080
 *   3. LLM spot-check   — cheap model reviews output vs original prompt
 *
 * This is inspired by Manus AI's verification agent but adapted for HoC's
 * multi-provider architecture. Uses the cheapest available model (Gemini Flash
 * preferred) to keep cost near-zero.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { sandboxExec } from "./agent-sandbox.js";

const logger = createSubsystemLogger("verification-agent");

/** Verification result returned to the caller */
export interface VerificationResult {
  /** PASS = good, NEEDS_FIX = agent should retry, FAIL = give up */
  verdict: "PASS" | "NEEDS_FIX" | "FAIL";
  /** Human-readable summary of what was checked */
  summary: string;
  /** Specific issues found (empty on PASS) */
  issues: string[];
  /** Optional fix instructions for NEEDS_FIX verdict */
  fixInstructions?: string;
}

/** Options for the verification pass */
interface VerifyOpts {
  /** The original user prompt */
  userPrompt: string;
  /** The agent's final text response */
  agentResponse: string;
  /** Artifact files produced */
  artifactFiles: Array<{ name: string; size: string }>;
  /** Preview URL if any */
  previewUrl: string | null;
  /** Whether the sandbox container is available for checks */
  sandboxAvailable: boolean;
}

/**
 * Run the full verification pipeline.
 *
 * Layer 1: Artifact integrity (always runs)
 * Layer 2: Preview health check (if previewUrl set)
 * Layer 3: LLM spot-check (if an API key is available)
 */
export async function verifyAgentOutput(opts: VerifyOpts): Promise<VerificationResult> {
  const issues: string[] = [];

  // ── Layer 1: Artifact Integrity ──────────────────────────────
  if (opts.sandboxAvailable && opts.artifactFiles.length > 0) {
    for (const file of opts.artifactFiles) {
      try {
        const check = await sandboxExec(
          `test -f "/workspace/${file.name}" && stat -c %s "/workspace/${file.name}" 2>/dev/null || echo MISSING`,
          "/workspace",
          5,
        );
        if (check.stdout.trim() === "MISSING" || check.stdout.trim() === "0") {
          issues.push(`Artifact "${file.name}" is missing or empty`);
        }
      } catch {
        // Non-critical — skip if sandbox unreachable
      }
    }
  }

  // ── Layer 2: Preview Health Check ────────────────────────────
  if (opts.previewUrl && opts.sandboxAvailable) {
    try {
      const healthCheck = await sandboxExec(
        `curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/ 2>/dev/null || echo 000`,
        "/workspace",
        10,
      );
      const statusCode = parseInt(healthCheck.stdout.trim(), 10);
      if (statusCode !== 200 && statusCode !== 304) {
        issues.push(`Preview server returned HTTP ${statusCode} (expected 200)`);
      }
    } catch {
      // Non-critical
    }
  }

  // ── Layer 3: LLM Spot-Check (cheapest model) ────────────────
  const llmVerdict = await runLlmSpotCheck(opts.userPrompt, opts.agentResponse, opts.artifactFiles);
  if (llmVerdict) {
    if (llmVerdict.verdict === "NEEDS_FIX") {
      issues.push(...llmVerdict.issues);
    } else if (llmVerdict.verdict === "FAIL") {
      issues.push(...llmVerdict.issues);
      return {
        verdict: "FAIL",
        summary: `Verification FAILED: ${issues.join("; ")}`,
        issues,
      };
    }
  }

  // ── Final Verdict ───────────────────────────────────────────
  if (issues.length === 0) {
    return {
      verdict: "PASS",
      summary: "All verification checks passed.",
      issues: [],
    };
  }

  return {
    verdict: "NEEDS_FIX",
    summary: `Found ${issues.length} issue(s): ${issues.join("; ")}`,
    issues,
    fixInstructions: issues.join("\n- "),
  };
}

// ─── LLM Spot-Check (cheapest model) ──────────────────────────

async function runLlmSpotCheck(
  userPrompt: string,
  agentResponse: string,
  artifactFiles: Array<{ name: string; size: string }>,
): Promise<{ verdict: "PASS" | "NEEDS_FIX" | "FAIL"; issues: string[] } | null> {
  // Try Gemini Flash first (cheapest), then OpenAI mini, then skip
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey && !openaiKey) {
    logger.info("[verify] No LLM key available for spot-check, skipping");
    return null;
  }

  const artifactList =
    artifactFiles.map((f) => `  - ${f.name} (${f.size})`).join("\n") || "  (none)";
  const verifyPrompt = `You are a QA verification agent. Review whether the AI agent's output addresses the user's request.

USER REQUEST:
${userPrompt.slice(0, 2000)}

AGENT RESPONSE (summary):
${agentResponse.slice(0, 3000)}

ARTIFACTS PRODUCED:
${artifactList}

Rate the output:
- PASS: The request was fully addressed
- NEEDS_FIX: Mostly done but has specific gaps (list them)
- FAIL: The output is fundamentally wrong or incomplete

Respond with EXACTLY one line: VERDICT: PASS|NEEDS_FIX|FAIL
Then optionally list specific issues, one per line starting with "- "`;

  try {
    if (geminiKey) {
      return await spotCheckGemini(geminiKey, verifyPrompt);
    }
    if (openaiKey) {
      return await spotCheckOpenAi(openaiKey, verifyPrompt);
    }
  } catch (err) {
    logger.warn(
      `[verify] LLM spot-check failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  return null;
}

async function spotCheckGemini(
  apiKey: string,
  prompt: string,
): Promise<{ verdict: "PASS" | "NEEDS_FIX" | "FAIL"; issues: string[] }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw new Error(`Gemini verify failed: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return parseVerifyResponse(text);
}

async function spotCheckOpenAi(
  apiKey: string,
  prompt: string,
): Promise<{ verdict: "PASS" | "NEEDS_FIX" | "FAIL"; issues: string[] }> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 500,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw new Error(`OpenAI verify failed: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  return parseVerifyResponse(text);
}

function parseVerifyResponse(text: string): {
  verdict: "PASS" | "NEEDS_FIX" | "FAIL";
  issues: string[];
} {
  const lines = text.trim().split("\n");
  let verdict: "PASS" | "NEEDS_FIX" | "FAIL" = "PASS";

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.includes("VERDICT:")) {
      if (upper.includes("FAIL")) {
        verdict = "FAIL";
      } else if (upper.includes("NEEDS_FIX")) {
        verdict = "NEEDS_FIX";
      }
      break;
    }
  }

  const issues = lines
    .filter((l) => l.trim().startsWith("- "))
    .map((l) => l.trim().slice(2).trim())
    .filter((l) => l.length > 0);

  return { verdict, issues };
}
