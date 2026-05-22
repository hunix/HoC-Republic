/**
 * Chat Intercept — Autonomous Agent Loop
 *
 * Routes project/build/create intents to the sandbox agent loop
 * (Claude/GPT/Gemini + 14 sandbox tools) for autonomous execution.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import type { ChatSendFullParams } from "../../rpc-params.js";
import type { GatewayRequestContext, RespondFn } from "../../types.js";
import { resolveSessionAgentId } from "../../../../agents/agent-scope.js";
import { loadConfig } from "../../../../config/config.js";
import { updateSessionStore } from "../../../../config/sessions.js";
import { isContainerRunning, sandboxExec } from "../../../../republic/agent-sandbox.js";
import {
  runSandboxAgentLoop,
  isProjectBuildIntent,
} from "../../../../republic/sandbox-agent-loop.js";
import { resolveChatRunExpiresAtMs } from "../../../chat-abort.js";
import { stripEnvelopeFromMessages } from "../../../chat-sanitize.js";
import {
  loadSessionEntry,
  readSessionMessages,
  resolveSessionModelRef,
} from "../../../session-utils.js";
import { probeSandboxPreviewPort } from "../preview.js";
import { resolveTranscriptPath, ensureTranscriptFile } from "../transcript.js";

/**
 * Try to intercept a project/build/create request.
 * Returns `true` if the intercept handled the request (responded to RPC).
 */
export async function tryAgentLoopIntercept(params: {
  p: ChatSendFullParams;
  parsedMessage: string;
  context: GatewayRequestContext;
  respond: RespondFn;
}): Promise<boolean> {
  const { p, parsedMessage, context, respond } = params;

  try {
    if (
      /^(run |exec |execute |bash |python3? |node |npm |pip |apt |sh )/.test(
        parsedMessage.trim().toLowerCase(),
      ) ||
      !isProjectBuildIntent(parsedMessage) ||
      !isContainerRunning()
    ) {
      return false;
    }

    context.logGateway.info(
      `[AgentLoop] Routing to autonomous agent loop: ${parsedMessage.slice(0, 80)}`,
    );
    const runId = p.idempotencyKey;
    const abortController = new AbortController();
    const interceptNow = Date.now();
    context.chatAbortControllers.set(runId, {
      controller: abortController,
      sessionId: runId,
      sessionKey: p.sessionKey,
      startedAtMs: interceptNow,
      expiresAtMs: resolveChatRunExpiresAtMs({ now: interceptNow, timeoutMs: 120_000 }),
    });

    // Persist user message to transcript
    const { entry: agentEntry, storePath: agentStorePath } = loadSessionEntry(p.sessionKey);

    // Ensure session entry exists
    if (!agentEntry && agentStorePath) {
      const sessionId = randomUUID();
      await updateSessionStore(agentStorePath, (store) => {
        const k = p.sessionKey;
        if (!store[k]) {
          store[k] = {
            sessionId,
            updatedAt: Date.now(),
            systemSent: false,
            abortedLastRun: false,
            lastChannel: "webchat",
          };
        }
      });
    }
    const { entry: agentEntryFinal, storePath: agentStorePathFinal } = loadSessionEntry(
      p.sessionKey,
    );

    // Read model selection from session store
    const cfg = loadConfig();
    const agentId = resolveSessionAgentId({ sessionKey: p.sessionKey, config: cfg });
    const resolvedModel = resolveSessionModelRef(cfg, agentEntryFinal, agentId);
    let modelOverride =
      resolvedModel.provider && resolvedModel.model
        ? { provider: resolvedModel.provider, modelId: resolvedModel.model }
        : undefined;
    if (!modelOverride && p.model) {
      const slash = p.model.indexOf("/");
      if (slash > 0) {
        modelOverride = {
          provider: p.model.slice(0, slash),
          modelId: p.model.slice(slash + 1),
        };
      }
    }

    // Auto-generate smart session title
    if (agentStorePathFinal && agentEntryFinal && !agentEntryFinal.label) {
      const raw = parsedMessage.trim();
      const title =
        raw.length <= 52
          ? raw
          : (() => {
              const cut = raw.slice(0, 52);
              const lastSpace = cut.lastIndexOf(" ");
              return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut) + "…";
            })();
      await updateSessionStore(agentStorePathFinal, (store) => {
        const k = p.sessionKey;
        const entry = store[k];
        if (entry && !entry.label) {
          entry.label = title;
        }
      });
    }

    // Write user message to transcript
    const agentTxPath = resolveTranscriptPath({
      sessionId: agentEntryFinal?.sessionId ?? runId,
      storePath: agentStorePathFinal,
      sessionFile: agentEntryFinal?.sessionFile,
    });
    if (agentTxPath) {
      ensureTranscriptFile({
        transcriptPath: agentTxPath,
        sessionId: agentEntryFinal?.sessionId ?? runId,
      });
      const userEntry = JSON.stringify({
        type: "message",
        id: randomUUID().slice(0, 8),
        timestamp: new Date().toISOString(),
        message: {
          role: "user",
          content: [{ type: "text", text: parsedMessage }],
          timestamp: Date.now(),
        },
      });
      fs.appendFileSync(agentTxPath, userEntry + "\n");
    }

    // Execute agent loop in background
    void (async () => {
      const startPayload = {
        runId: `agent-start-${runId}`,
        sessionKey: p.sessionKey,
        seq: 0,
        state: "delta" as const,
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "🤖 **Autonomous Agent** starting...\n_Selecting best available LLM provider + 14 sandbox tools_",
            },
          ],
          timestamp: Date.now(),
          stopReason: "injected",
          usage: { input: 0, output: 0, totalTokens: 0 },
        },
      };
      context.broadcast("chat", startPayload);
      context.nodeSendToSession(p.sessionKey, "chat", startPayload);

      try {
        const rawMessages =
          agentEntryFinal?.sessionId && agentStorePathFinal
            ? readSessionMessages(
                agentEntryFinal.sessionId,
                agentStorePathFinal,
                agentEntryFinal.sessionFile,
              )
            : [];

        const history = (stripEnvelopeFromMessages(rawMessages) as Array<Record<string, unknown>>)
          .slice(-20)
          .filter((m: Record<string, unknown>) => m.role === "user" || m.role === "assistant")
          .map((m: Record<string, unknown>) => {
            let textContent = "";
            if (typeof m.content === "string") {
              textContent = m.content;
            } else if (Array.isArray(m.content)) {
              textContent = m.content
                .map((c: unknown) =>
                  typeof c === "string" ? c : String((c as Record<string, unknown>).text || ""),
                )
                .join("");
            }
            return { role: m.role as "user" | "assistant", content: textContent };
          })
          .filter((m: { role: "user" | "assistant"; content: string }) => m.content.trim() !== "");

        const agentResult = await runSandboxAgentLoop(
          parsedMessage,
          {
            send: (text: string) => {
              const progressPayload = {
                runId: `agent-progress-${runId}-${Date.now()}`,
                sessionKey: p.sessionKey,
                seq: 0,
                state: "delta" as const,
                message: {
                  role: "assistant",
                  content: [{ type: "text", text }],
                  timestamp: Date.now(),
                  stopReason: "streaming",
                  usage: { input: 0, output: 0, totalTokens: 0 },
                },
              };
              context.broadcast("chat", progressPayload);
              context.nodeSendToSession(p.sessionKey, "chat", progressPayload);
            },
            toolEvent: (evt) => {
              context.broadcast("agent.tool", {
                sessionKey: p.sessionKey,
                runId,
                ...evt,
              });
            },
          },
          {
            modelOverride,
            thinkModelId: p.thinkModelId,
            execModelId: p.execModelId,
            history,
            abortSignal: abortController.signal,
          },
        );

        // Build final response text
        let resultText = agentResult.response || "Agent completed.";
        resultText += `\n\n_${agentResult.iterations} iterations • ${agentResult.totalTokens} tokens_`;

        // List workspace output files
        try {
          const lsResult = await sandboxExec(
            "find /workspace -maxdepth 2 -type f \\( -name '*.pptx' -o -name '*.docx' -o -name '*.xlsx' -o -name '*.pdf' -o -name '*.csv' -o -name '*.zip' -o -name '*.png' -o -name '*.jpg' -o -name '*.mp4' -o -name '*.mp3' -o -name '*.html' \\) ! -name '.*' -printf '%P\\t%s\\n' 2>/dev/null | head -20",
            "/workspace",
            10,
          );
          if (lsResult.exitCode === 0 && lsResult.stdout.trim()) {
            const fileLines = lsResult.stdout.trim().split("\n").filter(Boolean);
            if (fileLines.length > 0) {
              resultText += "\n\n📁 **Session Files**\n";
              for (const line of fileLines) {
                const [fname, fsize] = line.split("\t");
                if (!fname) {
                  continue;
                }
                const sizeStr = fsize
                  ? Number(fsize) > 1_000_000
                    ? `${(Number(fsize) / 1_000_000).toFixed(1)} MB`
                    : `${Math.ceil(Number(fsize) / 1000)} KB`
                  : "";
                const downloadUrl = `/sandbox-files/${fname}`;
                resultText += `- [📥 ${fname}](${downloadUrl})${sizeStr ? ` (${sizeStr})` : ""}\n`;
                resultText += `<file_download url="${downloadUrl}" filename="${fname}" ${sizeStr ? `size="${sizeStr}" ` : ""}/>\n`;
              }
            }
          }
        } catch {
          /* non-critical */
        }

        // Probe for preview
        const previewUrl = agentResult.previewUrl || (await probeSandboxPreviewPort());
        if (previewUrl) {
          resultText += ` [SANDBOX_PREVIEW:${previewUrl}]`;
        }

        // Emit artifact manifest
        if (agentResult.artifactType && agentResult.artifactType !== "unknown") {
          const filesList = (agentResult.artifactFiles ?? [])
            .map((f: { name: string; size: string }) => `${f.name}(${f.size})`)
            .join(",");
          const snap = agentResult.snapshotBase64
            ? `|snapshot=data:image/png;base64,${agentResult.snapshotBase64}`
            : "";

          if (!resultText.trim()) {
            resultText = `I have generated the requested ${agentResult.artifactType}. See the Preview panel for details.`;
          }
          resultText += ` [SANDBOX_ARTIFACT:type=${agentResult.artifactType}|files=${filesList}${snap}]`;
        }

        const finalPayload = {
          runId: `agent-final-${runId}`,
          sessionKey: p.sessionKey,
          seq: 1,
          state: "final" as const,
          message: {
            role: "assistant",
            content: [{ type: "text", text: resultText }],
            timestamp: Date.now(),
            stopReason: "injected",
            usage: {
              input: 0,
              output: agentResult.totalTokens,
              totalTokens: agentResult.totalTokens,
            },
          },
        };
        context.broadcast("chat", finalPayload);
        context.nodeSendToSession(p.sessionKey, "chat", finalPayload);

        // Persist to transcript
        if (agentTxPath) {
          const asstEntry = JSON.stringify({
            type: "message",
            id: randomUUID().slice(0, 8),
            timestamp: new Date().toISOString(),
            message: {
              role: "assistant",
              content: [{ type: "text", text: resultText }],
              timestamp: Date.now(),
              stopReason: "injected",
              usage: {
                input: 0,
                output: agentResult.totalTokens,
                totalTokens: agentResult.totalTokens,
              },
            },
          });
          fs.appendFileSync(agentTxPath, asstEntry + "\n");
        }
      } catch (agentErr) {
        const errText = `❌ Agent loop error: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`;
        const errPayload = {
          runId: `agent-error-${runId}`,
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
        context.broadcast("chat", errPayload);
        context.nodeSendToSession(p.sessionKey, "chat", errPayload);
      }
    })().finally(() => {
      context.chatAbortControllers.delete(runId);
    });

    respond(true, { ok: true, streaming: true, runId });
    return true;
  } catch (agentLoopErr) {
    context.logGateway.warn(
      `[AgentLoop] Error: ${agentLoopErr instanceof Error ? agentLoopErr.message : String(agentLoopErr)}`,
    );
  }
  return false;
}
