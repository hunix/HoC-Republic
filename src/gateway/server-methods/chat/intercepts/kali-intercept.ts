/**
 * Chat Intercept — Kali Security Scanner
 *
 * Routes pentest/scan/audit requests to the Kali cybersecurity orchestrator
 * with auto-container-start and structured tool-event broadcasting.
 */

import type { ChatSendFullParams } from "../../rpc-params.js";
import type { GatewayRequestContext, RespondFn } from "../../types.js";
import { classifySecurityIntent } from "../../../../republic/security-intent.js";
import { resolveChatRunExpiresAtMs } from "../../../chat-abort.js";

/**
 * Try to intercept a security/pentest request.
 * Returns `true` if the intercept handled the request (responded to RPC).
 */
export async function tryKaliIntercept(params: {
  p: ChatSendFullParams;
  parsedMessage: string;
  context: GatewayRequestContext;
  respond: RespondFn;
}): Promise<boolean> {
  const { p, parsedMessage, context, respond } = params;

  try {
    const securityIntent = classifySecurityIntent(parsedMessage);
    if (!securityIntent.isSecurityTask) {
      return false;
    }

    context.logGateway.info(
      `[KaliIntercept] Routing to Kali: target=${securityIntent.target} scanType=${securityIntent.scanType} (${securityIntent.reason})`,
    );
    const runId = p.idempotencyKey;
    const abortController = new AbortController();
    const interceptNow = Date.now();
    context.chatAbortControllers.set(runId, {
      controller: abortController,
      sessionId: runId,
      sessionKey: p.sessionKey,
      startedAtMs: interceptNow,
      expiresAtMs: resolveChatRunExpiresAtMs({ now: interceptNow, timeoutMs: 300_000 }),
    });

    void (async () => {
      // Broadcast "kali starting" indicator
      context.broadcast("chat", {
        runId: `kali-start-${runId}`,
        sessionKey: p.sessionKey,
        seq: 0,
        state: "delta" as const,
        message: {
          role: "assistant",
          content: [
            {
              type: "text",
              text: `🔒 **Kali Security Scan** starting...\n_Target: ${securityIntent.target ?? "(auto-detect)"} | Type: ${securityIntent.scanType}_`,
            },
          ],
          timestamp: Date.now(),
          stopReason: "injected",
          usage: { input: 0, output: 0, totalTokens: 0 },
        },
      });

      // Emit structured tool event: container check
      context.broadcast("agent.tool", {
        sessionKey: p.sessionKey,
        runId,
        tool: "kali_container",
        state: "start",
        label: "Checking Kali container...",
        ts: Date.now(),
      });

      try {
        const { isSandboxTypeRunning, startSpecializedSandbox } =
          await import("../../../../republic/multi-sandbox.js");

        // Auto-start Kali container if not running
        if (!isSandboxTypeRunning("kali")) {
          context.broadcast("agent.tool", {
            sessionKey: p.sessionKey,
            runId,
            tool: "kali_container",
            state: "start",
            label: "Starting Kali container...",
            ts: Date.now(),
          });
          const started = await startSpecializedSandbox("kali");
          if (!started) {
            throw new Error(
              "Kali container failed to start. Make sure Docker is running and hoc/kali-sandbox:latest is built.",
            );
          }
          const { waitForSandboxHealthy } = await import("../../../../republic/multi-sandbox.js");
          await waitForSandboxHealthy("kali", 30_000);
        }

        context.broadcast("agent.tool", {
          sessionKey: p.sessionKey,
          runId,
          tool: "kali_container",
          state: "done",
          label: "Kali container ready",
          ts: Date.now(),
        });

        // Emit tool event: scan starting
        context.broadcast("agent.tool", {
          sessionKey: p.sessionKey,
          runId,
          tool: "kali_scan",
          state: "start",
          label: `Running ${securityIntent.scanType} scan on ${securityIntent.target ?? "target"}...`,
          ts: Date.now(),
        });

        const { runScan, generateReport } = await import("../../../../republic/kali-agent-loop.js");
        const scanResult = await runScan({
          target: securityIntent.target ?? "127.0.0.1",
          scanType: securityIntent.scanType,
        });

        context.broadcast("agent.tool", {
          sessionKey: p.sessionKey,
          runId,
          tool: "kali_scan",
          state: "done",
          label: `Scan complete — ${scanResult.findings.length} findings`,
          ts: Date.now(),
        });

        // Generate report
        context.broadcast("agent.tool", {
          sessionKey: p.sessionKey,
          runId,
          tool: "kali_report",
          state: "start",
          label: "Generating security report...",
          ts: Date.now(),
        });
        const report = generateReport(scanResult);
        context.broadcast("agent.tool", {
          sessionKey: p.sessionKey,
          runId,
          tool: "kali_report",
          state: "done",
          label: "Report generated",
          ts: Date.now(),
        });

        // Build final response
        const riskLevel = scanResult.summary?.riskLevel ?? "unknown";
        const findingsCount = scanResult.findings.length;
        const phasesCount = scanResult.phases.length;
        let resultText =
          `## 🔒 Security Scan Results — ${securityIntent.target}\n\n` +
          `**Risk Level:** ${riskLevel} | **Findings:** ${findingsCount} | **Phases:** ${phasesCount}\n\n`;

        if (scanResult.summary) {
          const sumParts: string[] = [];
          if (scanResult.summary.topRisks.length > 0) {
            sumParts.push(`**Top Risks:** ${scanResult.summary.topRisks.join("; ")}`);
          }
          if (scanResult.summary.recommendations.length > 0) {
            sumParts.push(`**Recommendations:** ${scanResult.summary.recommendations.join("; ")}`);
          }
          resultText += `### Executive Summary\n${sumParts.join("\n") || "Scan completed."}\n\n`;
        }

        if (findingsCount > 0) {
          resultText += `### Key Findings\n`;
          for (const finding of scanResult.findings.slice(0, 10)) {
            const icon =
              finding.severity === "critical"
                ? "🔴"
                : finding.severity === "high"
                  ? "🟠"
                  : finding.severity === "medium"
                    ? "🟡"
                    : "🟢";
            resultText += `${icon} **${finding.title}** (${finding.severity})\n`;
            if (finding.description) {
              resultText += `  ${finding.description.slice(0, 200)}\n`;
            }
          }
          if (findingsCount > 10) {
            resultText += `\n_...and ${findingsCount - 10} more findings_\n`;
          }
        }

        resultText += `\n\n<details>\n<summary>Full Report</summary>\n\n${report}\n</details>`;
        resultText += `\n\n_Scan ID: ${scanResult.id} | Duration: ${scanResult.completedAt ? Math.round((scanResult.completedAt - scanResult.startedAt) / 1000) : "??"}s_`;

        const kaliFinalPayload = {
          runId: `kali-final-${runId}`,
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
        context.broadcast("chat", kaliFinalPayload);
        context.nodeSendToSession(p.sessionKey, "chat", kaliFinalPayload);
      } catch (kaliErr) {
        const errText = `❌ **Kali scan failed:** ${kaliErr instanceof Error ? kaliErr.message : String(kaliErr)}\n\n_Falling back to general assistant._`;
        const kaliErrPayload = {
          runId: `kali-error-${runId}`,
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
        context.broadcast("chat", kaliErrPayload);
        context.nodeSendToSession(p.sessionKey, "chat", kaliErrPayload);
      }
    })().finally(() => {
      context.chatAbortControllers.delete(runId);
    });

    respond(true, { ok: true, streaming: true, runId });
    return true;
  } catch (kaliIntakeErr) {
    context.logGateway.warn(
      `[KaliIntercept] Error: ${kaliIntakeErr instanceof Error ? kaliIntakeErr.message : String(kaliIntakeErr)}`,
    );
  }
  return false;
}
