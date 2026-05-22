/**
 * Chat Intercept — Deep Research Orchestrator
 *
 * Routes research/document requests to the multi-source web research
 * pipeline (research → document generation → download).
 */

import type { ChatSendFullParams } from "../../rpc-params.js";
import type { GatewayRequestContext, RespondFn } from "../../types.js";
import { classifyDeepResearchIntent } from "../../../../republic/research-intent.js";
import { resolveChatRunExpiresAtMs } from "../../../chat-abort.js";

/**
 * Try to intercept a deep research request.
 * Returns `true` if the intercept handled the request (responded to RPC).
 */
export async function tryResearchIntercept(params: {
  p: ChatSendFullParams;
  parsedMessage: string;
  context: GatewayRequestContext;
  respond: RespondFn;
}): Promise<boolean> {
  const { p, parsedMessage, context, respond } = params;

  try {
    const researchIntent = classifyDeepResearchIntent(parsedMessage);
    if (!researchIntent.isDeepResearch) {
      return false;
    }

    context.logGateway.info(
      `[DeepResearch] Routing: query="${researchIntent.query.slice(0, 80)}" format=${researchIntent.format} depth=${researchIntent.depth} (${researchIntent.reason})`,
    );
    const runId = p.idempotencyKey;
    const abortController = new AbortController();
    const interceptNow = Date.now();
    context.chatAbortControllers.set(runId, {
      controller: abortController,
      sessionId: runId,
      sessionKey: p.sessionKey,
      startedAtMs: interceptNow,
      expiresAtMs: resolveChatRunExpiresAtMs({ now: interceptNow, timeoutMs: 600_000 }),
    });

    void (async () => {
      try {
        // Broadcast "research starting" indicator
        context.broadcast("chat", {
          runId: `research-start-${runId}`,
          sessionKey: p.sessionKey,
          seq: 0,
          state: "delta" as const,
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: `📚 **Deep Research** starting...\n_Query: ${researchIntent.query.slice(0, 100)}_\n_Format: ${researchIntent.format.toUpperCase()} | Depth: ${researchIntent.depth}_`,
              },
            ],
            timestamp: Date.now(),
            stopReason: "injected",
            usage: { input: 0, output: 0, totalTokens: 0 },
          },
        });

        // Submit research job
        const { startResearchJob, getResearchJob } =
          await import("../../../../republic/deep-research-orchestrator.js");
        const job = startResearchJob({
          query: researchIntent.query,
          format: researchIntent.format,
          depth: researchIntent.depth,
        });

        // Poll for progress
        let lastPhase = "queued";
        const maxPolls = 300;
        let polls = 0;
        while (polls++ < maxPolls) {
          if (abortController.signal.aborted) {
            break;
          }
          await new Promise((r) => setTimeout(r, 2000));

          const current = getResearchJob(job.id);
          if (!current) {
            break;
          }

          if (current.status !== lastPhase) {
            // Emit phase transition
            context.broadcast("agent.tool", {
              sessionKey: p.sessionKey,
              runId,
              tool: `research_${current.status}`,
              state: current.status === "done" || current.status === "failed" ? "done" : "start",
              label: `Research phase: ${current.status}`,
              ts: Date.now(),
            });
          }
          lastPhase = current.status;

          // Stream progress as delta messages
          const latestLog = current.log.slice(-1)[0];
          if (latestLog) {
            context.broadcast("chat", {
              runId: `research-progress-${runId}-${polls}`,
              sessionKey: p.sessionKey,
              seq: 0,
              state: "delta" as const,
              message: {
                role: "assistant",
                content: [{ type: "text", text: `📚 ${latestLog}` }],
                timestamp: Date.now(),
                stopReason: "streaming",
                usage: { input: 0, output: 0, totalTokens: 0 },
              },
            });
          }

          if (current.status === "done" || current.status === "failed") {
            break;
          }
        }

        // Get final result
        const finalJob = getResearchJob(job.id);
        if (!finalJob || finalJob.status === "failed") {
          throw new Error(finalJob?.error ?? "Research job failed");
        }

        // Build final response
        let resultText = `## 📚 Deep Research Complete\n\n`;
        resultText += `**Query:** ${researchIntent.query}\n`;
        resultText += `**Format:** ${researchIntent.format.toUpperCase()} | **Depth:** ${researchIntent.depth}\n\n`;

        if (finalJob.plan) {
          resultText += `### ${finalJob.plan.title}\n\n`;
          resultText += `${finalJob.plan.executiveSummary}\n\n`;
        }

        if (finalJob.result) {
          resultText += `### Output\n`;
          resultText += `- 📥 [Download ${researchIntent.format.toUpperCase()} (${finalJob.result.sizeKb} KB)](${finalJob.result.downloadUrl})\n`;
          resultText += `<file_download url="${finalJob.result.downloadUrl}" filename="research.${researchIntent.format}" size="${finalJob.result.sizeKb} KB" />\n`;
          if (finalJob.result.markdownPath) {
            resultText += `- 📄 [View Markdown](/sandbox-files/${finalJob.result.markdownPath})\n`;
          }
        }

        resultText += `\n_Sources: ${finalJob.progress.extractedSources} | Sections: ${finalJob.progress.sectionsWritten} | Job: ${finalJob.id}_`;

        const researchFinalPayload = {
          runId: `research-final-${runId}`,
          sessionKey: p.sessionKey,
          seq: 1,
          state: "final" as const,
          message: {
            role: "assistant",
            content: [{ type: "text", text: resultText }],
            timestamp: Date.now(),
            stopReason: "injected",
            usage: { input: 0, output: 0, totalTokens: 0 },
          },
        };
        context.broadcast("chat", researchFinalPayload);
        context.nodeSendToSession(p.sessionKey, "chat", researchFinalPayload);
      } catch (researchErr) {
        const errText = `❌ **Deep Research failed:** ${researchErr instanceof Error ? researchErr.message : String(researchErr)}`;
        const researchErrPayload = {
          runId: `research-error-${runId}`,
          sessionKey: p.sessionKey,
          seq: 1,
          state: "final" as const,
          message: {
            role: "assistant",
            content: [{ type: "text", text: errText }],
            timestamp: Date.now(),
            stopReason: "injected",
            usage: { input: 0, output: 0, totalTokens: 0 },
          },
        };
        context.broadcast("chat", researchErrPayload);
        context.nodeSendToSession(p.sessionKey, "chat", researchErrPayload);
      }
    })().finally(() => {
      context.chatAbortControllers.delete(runId);
    });

    respond(true, { ok: true, streaming: true, runId });
    return true;
  } catch (researchIntakeErr) {
    context.logGateway.warn(
      `[DeepResearch] Error: ${researchIntakeErr instanceof Error ? researchIntakeErr.message : String(researchIntakeErr)}`,
    );
  }
  return false;
}
