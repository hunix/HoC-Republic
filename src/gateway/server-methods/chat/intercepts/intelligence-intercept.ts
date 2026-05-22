/**
 * Chat Intercept — Quantum Bridge + Fact-Checked Intelligence
 *
 * Augments chat messages with System-2 insights from the Quantum Bridge
 * and trusted source context for news/intelligence queries.
 */

import type { GatewayRequestContext } from "../../types.js";

/**
 * Augment the message with Quantum Bridge insights and news intelligence.
 * Returns the (potentially augmented) message. Never blocks the pipeline.
 */
export async function augmentWithIntelligence(params: {
  parsedMessage: string;
  context: GatewayRequestContext;
  clientId: string;
}): Promise<string> {
  let { parsedMessage } = params;
  const { context, clientId } = params;

  // -- Quantum Bridge Integration --
  if (context.quantumBridge) {
    try {
      const decision = await context.quantumBridge.processRequest(parsedMessage, clientId);

      if (decision && decision.confidence > 0.6) {
        const planSummary =
          decision.hypothesis.plan?.steps
            .map((s) => `- ${s.action}: ${s.expectedOutcome}`)
            .join("\n") || "No complex plan.";
        parsedMessage += `\n\n<system_2_insight>\nInterpretation: ${decision.hypothesis.interpretation}\nConfidence: ${decision.confidence.toFixed(2)}\nSuggested Plan:\n${planSummary}\n</system_2_insight>`;

        // Execute companion tools directly if this is a task_execution decision
        const { executeCompanionPlan } =
          await import("../../../../intelligence/quantum-executor.js");
        const execResults = await executeCompanionPlan(decision, parsedMessage);
        if (execResults.length > 0) {
          const summary = execResults
            .map((r) =>
              r.success
                ? `✅ ${r.tool}: executed successfully`
                : `❌ ${r.tool}: ${r.error ?? "failed"}`,
            )
            .join("\n");
          context.logGateway.info(`companion execution: ${summary}`);
          parsedMessage += `\n\n<companion_execution>\n${summary}\n</companion_execution>`;
        }
      }
    } catch (err) {
      context.logGateway.warn(`quantum bridge error: ${String(err)}`);
    }
  }

  // -- Fact-Checked Intelligence Integration --
  const isNewsQuery =
    /\b(news|latest|happening|world|intelligence|report|update|conflict|war|election)\b/i.test(
      parsedMessage,
    );
  if (isNewsQuery) {
    try {
      const { getTrustedSources } = await import("../../../../intelligence/source-registry.js");
      const sources = getTrustedSources(0.7)
        .slice(0, 10)
        .map(
          (s) =>
            `- ${s.id} (Trust Score: ${(s.trustScore * 100).toFixed(0)}%, Bias: ${s.tendency})`,
        )
        .join("\n");
      parsedMessage += `\n\n<system_intelligence>\nUSER QUERY IMPLIES CURRENT EVENTS/NEWS.\nAs an AI of the Republic, you must provide highly fact-checked, bias-aware responses based on our Trust Score engine.\nTop trusted sources to favor in your analysis:\n${sources}\nIf you search the web, prioritize these sources.\n</system_intelligence>`;
    } catch (err) {
      context.logGateway.warn(`source-registry error: ${String(err)}`);
    }
  }

  return parsedMessage;
}
