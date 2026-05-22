/**
 * Auto-Fix Loop — post-loop verification → fix → re-verify cycle.
 *
 * When the verification agent finds issues, this module runs additional
 * agent iterations to fix them, then re-verifies.
 * Also includes the anti-hallucination guard.
 */

import type {
  AgentProvider,
  AgentBroadcaster,
  LoopIteration,
  AnthropicMessage,
  OpenAiMessage,
  GeminiContent,
} from "../agent-providers/index.js";
import type { ToolInput } from "../sandbox-tool-defs.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import {
  getOpenAiCompatConfig,
  runAnthropicLoop,
  appendAnthropicTurn,
  runOpenAiLoop,
  appendOpenAiTurn,
  runGeminiLoop,
  appendGeminiTurn,
} from "../agent-providers/index.js";
import { isContainerRunning } from "../agent-sandbox.js";
import { collectArtifactManifest } from "./artifact-collector.js";
import { executeTool } from "./tool-executor.js";

const logger = createSubsystemLogger("sandbox-agent");

/** Max auto-fix iterations after verification finds issues */
const MAX_AUTOFIX_ITERATIONS = 2;

export interface AutoFixContext {
  provider: AgentProvider;
  modelId: string;
  broadcaster: AgentBroadcaster;
  systemPromptStr: string;
  effectiveTools: unknown[];
  anthropicMessages: AnthropicMessage[];
  openaiMessages: OpenAiMessage[];
  geminiContents: GeminiContent[];
  previewUrl: string | null;
  abortSignal?: AbortSignal;
  agentTimeoutMs: number;
  maxRetries: number;
}

export interface AutoFixResult {
  finalResponse: string;
  totalTokens: number;
  iterations: number;
  snapshotBase64: string | null;
  artifactFiles: Array<{ name: string; size: string }>;
}

/**
 * Run post-loop verification and auto-fix cycle.
 *
 * @returns Updated result fields after verification/fix attempts.
 */
export async function runAutoFixLoop(
  ctx: AutoFixContext,
  userMessage: string,
  finalResponse: string,
  totalTokens: number,
  iterations: number,
  snapshotBase64: string | null,
  artifactFiles: Array<{ name: string; size: string }>,
): Promise<AutoFixResult> {
  let autofixAttempts = 0;

  if (finalResponse.trim().length > 50 && iterations > 1) {
    try {
      const { verifyAgentOutput } = await import("../verification-agent.js");
      const verification = await verifyAgentOutput({
        userPrompt: userMessage,
        agentResponse: finalResponse,
        artifactFiles,
        previewUrl: ctx.previewUrl,
        sandboxAvailable: isContainerRunning(),
      });
      if (verification.verdict === "PASS") {
        logger.info(`[verify] ✅ PASS — ${verification.summary}`);
        ctx.broadcaster.send(`\n✅ **Verification passed** — output quality confirmed.\n`);
      } else if (verification.verdict === "NEEDS_FIX" && autofixAttempts < MAX_AUTOFIX_ITERATIONS) {
        // ── Auto-Fix Loop: send fix instructions back to the agent ──
        autofixAttempts++;
        logger.warn(`[verify] ⚠️ NEEDS_FIX — attempting auto-fix (attempt ${autofixAttempts})`);
        ctx.broadcaster.send(
          `\n🔧 **Auto-fix** (attempt ${autofixAttempts}/${MAX_AUTOFIX_ITERATIONS}): ${verification.issues.join(", ")}\n`,
        );
        const fixPrompt = `[AUTO-FIX] The verification agent found these issues:\n${verification.issues.map((iss) => `- ${iss}`).join("\n")}\n\nPlease fix these issues now. Be thorough.`;
        if (ctx.provider === "gemini") {
          ctx.geminiContents.push({ role: "user", parts: [{ text: fixPrompt }] });
        } else if (ctx.provider === "anthropic") {
          ctx.anthropicMessages.push({ role: "user", content: fixPrompt });
        } else {
          ctx.openaiMessages.push({ role: "user", content: fixPrompt });
        }
        // Run up to 5 more iterations for the fix
        const typedFixTools = ctx.effectiveTools as typeof import("../sandbox-tool-defs.js").TOOLS;
        for (let fixIter = 0; fixIter < 5 && !ctx.abortSignal?.aborted; fixIter++) {
          iterations++;
          ctx.broadcaster.send(`\n⏱️ _Auto-fix iteration ${fixIter + 1}_\n`);
          let fixIteration: LoopIteration | null = null;
          if (ctx.provider === "anthropic") {
            fixIteration = await runAnthropicLoop(
              ctx.anthropicMessages,
              ctx.modelId,
              ctx.broadcaster,
              ctx.maxRetries,
              typedFixTools,
              ctx.systemPromptStr,
              ctx.agentTimeoutMs,
              ctx.abortSignal,
            );
          } else if (ctx.provider === "gemini") {
            fixIteration = await runGeminiLoop(
              ctx.geminiContents,
              ctx.modelId,
              ctx.broadcaster,
              ctx.maxRetries,
              typedFixTools,
              ctx.systemPromptStr,
              ctx.agentTimeoutMs,
              ctx.abortSignal,
            );
          } else {
            const compatConfig = getOpenAiCompatConfig(ctx.provider!, ctx.modelId);
            fixIteration = await runOpenAiLoop(
              ctx.openaiMessages,
              ctx.modelId,
              ctx.broadcaster,
              ctx.maxRetries,
              compatConfig ?? undefined,
              typedFixTools,
              ctx.agentTimeoutMs,
              ctx.abortSignal,
            );
          }
          if (!fixIteration) {
            break;
          }
          totalTokens += fixIteration.inputTokens + fixIteration.outputTokens;
          for (const text of fixIteration.textBlocks) {
            if (text) {
              ctx.broadcaster.send(text);
              finalResponse += text + "\n";
            }
          }
          if (fixIteration.toolCalls.length === 0) {
            break;
          } // Model is done fixing
          // Execute fix tools in parallel
          const fixToolResults = await Promise.all(
            fixIteration.toolCalls.map(async (tc) => {
              try {
                const content = await executeTool(tc.name, tc.input as ToolInput);
                return { id: tc.id, name: tc.name, content, isError: false };
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                return { id: tc.id, name: tc.name, content: `Error: ${errMsg}`, isError: true };
              }
            }),
          );
          if (ctx.provider === "anthropic") {
            appendAnthropicTurn(ctx.anthropicMessages, fixIteration, fixToolResults);
          } else if (ctx.provider === "gemini") {
            appendGeminiTurn(ctx.geminiContents, fixIteration, fixToolResults);
          } else {
            appendOpenAiTurn(ctx.openaiMessages, fixIteration, fixToolResults);
          }
        }
        // Re-verify after fix
        try {
          const reManifest = await collectArtifactManifest(ctx.previewUrl);
          const reVerify = await verifyAgentOutput({
            userPrompt: userMessage,
            agentResponse: finalResponse,
            artifactFiles:
              reManifest.artifactFiles.length > 0 ? reManifest.artifactFiles : artifactFiles,
            previewUrl: ctx.previewUrl,
            sandboxAvailable: isContainerRunning(),
          });
          if (reVerify.verdict === "PASS") {
            ctx.broadcaster.send(`\n✅ **Auto-fix succeeded** — verification passed.\n`);
          } else {
            ctx.broadcaster.send(`\n⚠️ **Auto-fix incomplete**: ${reVerify.issues.join(", ")}\n`);
            finalResponse += `\n\n> ⚠️ **Auto-verification notes**: ${reVerify.issues.join("; ")}`;
          }
          // Update artifact manifest with latest
          if (reManifest.snapshotBase64) {
            snapshotBase64 = reManifest.snapshotBase64;
          }
          if (reManifest.artifactFiles.length > 0) {
            artifactFiles.splice(0, artifactFiles.length, ...reManifest.artifactFiles);
          }
        } catch {
          /* non-critical */
        }
      } else if (verification.verdict === "NEEDS_FIX") {
        ctx.broadcaster.send(
          `\n⚠️ **Verification found issues**: ${verification.issues.join(", ")}\n`,
        );
        finalResponse += `\n\n> ⚠️ **Auto-verification notes**: ${verification.issues.join("; ")}`;
      } else {
        logger.error(`[verify] ❌ FAIL — ${verification.summary}`);
        ctx.broadcaster.send(`\n❌ **Verification failed**: ${verification.summary}\n`);
      }
    } catch (verifyErr) {
      // Verification is non-critical — never block delivery
      logger.warn(
        `[verify] Verification error (non-blocking): ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
      );
    }
  }

  return { finalResponse, totalTokens, iterations, snapshotBase64, artifactFiles };
}

// ─── Anti-Hallucination Guard ───────────────────────────────────

/**
 * If the agent claims to have created files but none exist, flag it.
 */
export function checkHallucination(
  finalResponse: string,
  artifactFiles: Array<{ name: string; size: string }>,
  broadcaster: AgentBroadcaster,
): string {
  if (artifactFiles.length === 0 && isContainerRunning() && finalResponse.length > 100) {
    const claimsCreation =
      /(?:created|generated|wrote|saved|produced)\s+(?:the|a|your)\s+(?:file|document|presentation|report|app)/i.test(
        finalResponse,
      );
    if (claimsCreation) {
      broadcaster.send(
        `\n⚠️ **Warning**: Agent claims to have created files but no artifacts were found in /workspace.\n`,
      );
      return `${finalResponse}\n\n> ⚠️ **Note**: No artifact files were detected in the workspace despite the agent's claims. The output may need verification.`;
    }
  }
  return finalResponse;
}
