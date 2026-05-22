/**
 * Chat Intercept — Sandbox Direct Execution
 *
 * Detects direct command execution requests (ls, python3, bash, etc.)
 * and executes them in the sandbox container, bypassing the LLM agent.
 */

import { randomUUID } from "node:crypto";
import type { ChatSendFullParams } from "../../rpc-params.js";
import type { GatewayRequestContext, RespondFn } from "../../types.js";
import { updateSessionStore } from "../../../../config/sessions.js";
import { sandboxExec, isContainerRunning } from "../../../../republic/agent-sandbox.js";
import { classifySandboxIntent } from "../../../../republic/sandbox-intake.js";
import { resolveChatRunExpiresAtMs } from "../../../chat-abort.js";
import { loadSessionEntry } from "../../../session-utils.js";
import { probeSandboxPreviewPort } from "../preview.js";
import { appendAssistantTranscriptMessage, appendUserTranscriptMessage } from "../transcript.js";

/**
 * Try to intercept a sandbox direct-execution command.
 * Returns `true` if the intercept handled the request (responded to RPC).
 * Returns `false` if the chat pipeline should continue normally.
 */
export async function trySandboxIntercept(params: {
  p: ChatSendFullParams;
  parsedMessage: string;
  context: GatewayRequestContext;
  respond: RespondFn;
}): Promise<{ handled: boolean; augmentedMessage?: string }> {
  const { p, parsedMessage, context, respond } = params;

  try {
    const sandboxIntent = classifySandboxIntent(parsedMessage);
    if (sandboxIntent.isSandboxTask && isContainerRunning()) {
      context.logGateway.info(
        `[SandboxIntercept] Routing to sandbox: ${sandboxIntent.command.slice(0, 80)} (${sandboxIntent.language}, reason: ${sandboxIntent.reason})`,
      );
      const runId = p.idempotencyKey;
      const abortController = new AbortController();
      const interceptNow = Date.now();
      context.chatAbortControllers.set(runId, {
        controller: abortController,
        sessionId: runId,
        sessionKey: p.sessionKey,
        startedAtMs: interceptNow,
        expiresAtMs: resolveChatRunExpiresAtMs({
          now: interceptNow,
          timeoutMs: (sandboxIntent.timeout ?? 60) * 1000,
        }),
      });

      // Execute in background — respond to RPC immediately
      void (async () => {
        const runningMsg = [
          `🔧 **Running in sandbox** \`${sandboxIntent.command.slice(0, 100)}${sandboxIntent.command.length > 100 ? "…" : ""}\``,
          `_Language: ${sandboxIntent.language} | Timeout: ${sandboxIntent.timeout}s_`,
        ].join("\n");
        const runningPayload = {
          runId: `sandbox-start-${runId}`,
          sessionKey: p.sessionKey,
          seq: 0,
          state: "delta" as const,
          message: {
            role: "assistant",
            content: [{ type: "text", text: runningMsg }],
            timestamp: Date.now(),
            stopReason: "injected",
            usage: { input: 0, output: 0, totalTokens: 0 },
          },
        };
        context.broadcast("chat", runningPayload);
        context.nodeSendToSession(p.sessionKey, "chat", runningPayload);

        try {
          const execPromise = sandboxExec(
            sandboxIntent.command,
            sandboxIntent.cwd,
            sandboxIntent.timeout,
          );
          const result = await Promise.race([
            execPromise,
            new Promise<never>((_, reject) => {
              if (abortController.signal.aborted) {
                reject(new Error("Aborted by user"));
                return;
              }
              abortController.signal.addEventListener("abort", () =>
                reject(new Error("Aborted by user")),
              );
            }),
          ]);

          const exitIcon = result.exitCode === 0 ? "✅" : "❌";
          const parts: string[] = [
            `${exitIcon} **Exit code: ${result.exitCode}** _(${result.durationMs}ms)_`,
          ];
          if (result.stdout.trim()) {
            parts.push(`\n**stdout:**\n\`\`\`\n${result.stdout.trim()}\n\`\`\``);
          }
          if (result.stderr.trim()) {
            parts.push(`\n**stderr:**\n\`\`\`\n${result.stderr.trim()}\n\`\`\``);
          }
          if (!result.stdout.trim() && !result.stderr.trim()) {
            parts.push("\n_(no output)_");
          }
          const resultText = parts.join("\n");

          // Sandbox preview detection
          let resultTextWithPreview = resultText;
          try {
            const previewUrl = await probeSandboxPreviewPort();
            if (previewUrl) {
              resultTextWithPreview = `${resultText} [SANDBOX_PREVIEW:${previewUrl}]`;
            }
          } catch {
            // port probe failed — no preview card
          }

          // Ensure session entry exists
          const { storePath: sp, entry: se } = loadSessionEntry(p.sessionKey);
          if (!se && sp) {
            try {
              const sessionId = randomUUID();
              await updateSessionStore(sp, (store: Record<string, unknown>) => {
                const key = p.sessionKey;
                if (!store[key]) {
                  store[key] = {
                    sessionId,
                    updatedAt: Date.now(),
                    systemSent: false,
                    abortedLastRun: false,
                    lastChannel: "webchat",
                  };
                }
              });
            } catch {
              /* best-effort session creation */
            }
          }
          const { entry: seUpdated, storePath: spUpdated } = loadSessionEntry(p.sessionKey);

          // Persist user message
          appendUserTranscriptMessage({
            message: parsedMessage,
            sessionId: seUpdated?.sessionId ?? runId,
            storePath: spUpdated,
            sessionFile: seUpdated?.sessionFile,
          });

          // Persist assistant result
          appendAssistantTranscriptMessage({
            message: resultText,
            sessionId: seUpdated?.sessionId ?? runId,
            storePath: spUpdated,
            sessionFile: seUpdated?.sessionFile,
            createIfMissing: true,
          });

          const resId = randomUUID().slice(0, 8);
          const resultPayload = {
            runId: `sandbox-${resId}`,
            sessionKey: p.sessionKey,
            seq: 1,
            state: "final" as const,
            message: {
              role: "assistant" as const,
              content: [{ type: "text", text: resultTextWithPreview }],
              timestamp: Date.now(),
              stopReason: "injected",
              usage: { input: 0, output: 0, totalTokens: 0 },
            },
          };
          context.broadcast("chat", resultPayload);
          context.nodeSendToSession(p.sessionKey, "chat", resultPayload);
        } catch (execErr) {
          const errText = `❌ **Sandbox execution failed:** ${execErr instanceof Error ? execErr.message : String(execErr)}`;
          const errPayload = {
            runId: `sandbox-err-${runId}`,
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
      return { handled: true };
    } else if (sandboxIntent.isSandboxTask && !isContainerRunning()) {
      const aug =
        parsedMessage +
        `\n\n<sandbox_unavailable>\nThe user requested a sandbox command but the container is not running.\nCommand would have been: ${sandboxIntent.command}\nTell the user to start the sandbox container via the Agent Desktop, then retry.\n</sandbox_unavailable>`;
      return { handled: false, augmentedMessage: aug };
    }
  } catch (sandboxIntakeErr) {
    context.logGateway.warn(
      `[SandboxIntercept] Error: ${sandboxIntakeErr instanceof Error ? sandboxIntakeErr.message : String(sandboxIntakeErr)}`,
    );
  }
  return { handled: false };
}
