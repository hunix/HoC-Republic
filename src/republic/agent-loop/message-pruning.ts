/**
 * Message History Pruning — trims old tool results to prevent context overflow.
 *
 * Provider-specific pruning for Anthropic, Gemini, and OpenAI message formats.
 */

import type {
  AgentProvider,
  AnthropicMessage,
  OpenAiMessage,
  GeminiContent,
} from "../agent-providers/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { estimateArrayBytes } from "../byte-estimator.js";

const logger = createSubsystemLogger("sandbox-agent");

export function pruneMessageHistory(
  provider: AgentProvider,
  anthropicMessages: AnthropicMessage[],
  openaiMessages: OpenAiMessage[],
  geminiContents: GeminiContent[],
  approxBytes: number,
): void {
  // Skip pruning entirely if the incremental estimate is well under budget.
  // Only full-serialize once threshold is approached (saves O(n) work per iteration).
  if (approxBytes < 80_000) {
    return;
  }
  if (provider === "anthropic") {
    const msgSize = estimateArrayBytes(anthropicMessages);
    if (msgSize > 100_000 && anthropicMessages.length > 6) {
      const keepCount = 6;
      let pruned = 0;
      for (let m = 1; m < anthropicMessages.length - keepCount; m++) {
        const msg = anthropicMessages[m];
        if (Array.isArray(msg.content)) {
          for (let c = 0; c < msg.content.length; c++) {
            const block = msg.content[c] as unknown as Record<string, unknown>;
            if (
              block.type === "tool_result" &&
              typeof block.content === "string" &&
              (block.content as string).length > 200
            ) {
              block.content = (block.content as string).slice(0, 100) + "... [pruned]";
              pruned++;
            }
          }
        }
      }
      if (pruned > 0) {
        logger.info(`[AgentLoop] Pruned ${pruned} old Anthropic tool results`);
      }
    }
  } else if (provider === "gemini") {
    const msgSize = estimateArrayBytes(geminiContents);
    if (msgSize > 100_000 && geminiContents.length > 6) {
      let pruned = 0;
      for (let m = 1; m < geminiContents.length - 6; m++) {
        const entry = geminiContents[m];
        for (const part of entry.parts) {
          const p = part as Record<string, unknown>;
          if (
            p.functionResponse &&
            typeof (p.functionResponse as Record<string, unknown>).response === "object"
          ) {
            const resp = (p.functionResponse as Record<string, unknown>).response as Record<
              string,
              unknown
            >;
            const content = resp.content;
            if (typeof content === "string" && content.length > 200) {
              resp.content = content.slice(0, 100) + "... [pruned]";
              pruned++;
            }
          }
        }
      }
      if (pruned > 0) {
        logger.info(`[AgentLoop] Pruned ${pruned} old Gemini tool results`);
      }
    }
  } else {
    const msgSize = estimateArrayBytes(openaiMessages);
    if (msgSize > 100_000 && openaiMessages.length > 6) {
      let pruned = 0;
      for (let m = 1; m < openaiMessages.length - 6; m++) {
        const msg = openaiMessages[m] as Record<string, unknown>;
        if (
          msg.role === "tool" &&
          typeof msg.content === "string" &&
          (msg.content as string).length > 200
        ) {
          msg.content = (msg.content as string).slice(0, 100) + "... [pruned]";
          pruned++;
        }
      }
      if (pruned > 0) {
        logger.info(`[AgentLoop] Pruned ${pruned} old OpenAI tool results`);
      }
    }
  }
}
