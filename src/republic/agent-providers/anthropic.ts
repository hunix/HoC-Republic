/**
 * Anthropic Provider Adapter — Claude API integration.
 *
 * Handles the Anthropic Messages API with native tool_use, computer_use,
 * bash, and text_editor tool types. Includes retry logic with exponential backoff.
 *
 * Prompt caching: system prompt and tool definitions are marked with
 * cache_control: { type: "ephemeral" } so repeated turns within a session
 * hit Anthropic's server-side cache (~90% cost reduction on input tokens).
 */

import type {
  AgentBroadcaster,
  LoopIteration,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicResponse,
} from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { key } from "./config.js";

const logger = createSubsystemLogger("agent-anthropic");

/** Run a single Anthropic API call with tools and return parsed result */
export async function runAnthropicLoop(
  messages: AnthropicMessage[],
  modelId: string,
  broadcaster: AgentBroadcaster,
  maxRetries: number,
  tools: Array<{ name: string; description: string; input_schema: object }>,
  systemPrompt: string,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<LoopIteration | null> {
  const apiKey = key("ANTHROPIC_API_KEY");
  // ── Build tools array with cache_control on the last element ──
  // Anthropic caches everything UP TO AND INCLUDING the block with cache_control.
  // By marking the last tool, the entire tools array + system prompt are cached.
  const allTools: Array<Record<string, unknown>> = [
    ...tools,
    {
      type: "computer_20241022",
      name: "computer",
      display_width_px: 1024,
      display_height_px: 768,
      display_number: 99,
    },
    { type: "bash_20241022", name: "bash" },
    {
      type: "text_editor_20241022",
      name: "str_replace_editor",
      // Cache breakpoint: everything from system prompt through all tools is cached
      cache_control: { type: "ephemeral" },
    },
  ];

  const requestBody = {
    model: modelId,
    max_tokens: 8192,
    // Structured system blocks with cache_control for prompt caching
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: allTools,
    messages,
  };

  let response: Response | null = null;
  let lastApiError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          // Required for computer_20241022, bash_20241022, text_editor_20241022, AND prompt caching
          "anthropic-beta": "computer-use-2024-10-22,prompt-caching-2024-07-31",
        },
        body: JSON.stringify(requestBody),
        signal: abortSignal
          ? AbortSignal.any([abortSignal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) {
        break;
      }
      const status = response.status;
      const errBody = await response.text().catch(() => "");
      lastApiError = `HTTP ${status}: ${errBody.slice(0, 500)}`;
      if ((status === 429 || status === 529 || status >= 500) && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        broadcaster.send(
          `\n⏳ API ${status === 429 ? "rate limited" : "overloaded"}, retrying in ${backoffMs / 1000}s...\n`,
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      broadcaster.send(
        `\n⚠️ Anthropic API Error ${status}:\n\`\`\`\n${errBody.slice(0, 500)}\n\`\`\`\n`,
      );
      response = null;
      break;
    } catch (fetchErr) {
      lastApiError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        broadcaster.send(`\n⏳ Network error, retrying in ${backoffMs / 1000}s...\n`);
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      response = null;
    }
  }

  if (!response) {
    logger.error(`[AgentLoop/Anthropic] All retries failed: ${lastApiError}`);
    return null;
  }

  const data = (await response.json()) as AnthropicResponse;
  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "");
  const toolCalls = data.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({
      id: b.id ?? "",
      name: b.name ?? "",
      input: (b.input ?? {}) as Record<string, unknown>,
    }));

  // Log cache hit metrics for observability
  const cacheRead = (data.usage as Record<string, number>)?.cache_read_input_tokens ?? 0;
  const cacheCreation = (data.usage as Record<string, number>)?.cache_creation_input_tokens ?? 0;
  if (cacheRead > 0 || cacheCreation > 0) {
    logger.info(
      `[cache] read=${cacheRead} created=${cacheCreation} input=${data.usage?.input_tokens ?? 0}`,
    );
  }

  return {
    textBlocks,
    toolCalls,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
    done: data.stop_reason !== "tool_use" || toolCalls.length === 0,
  };
}

/** Append Anthropic-format turn to message history */
export function appendAnthropicTurn(
  messages: AnthropicMessage[],
  iteration: LoopIteration,
  toolResults: Array<{ id: string; content: string; isError: boolean }>,
): void {
  // Reconstruct the raw content blocks (assistant)
  const assistantBlocks: AnthropicContentBlock[] = [
    ...iteration.textBlocks.map((t) => ({ type: "text" as const, text: t })),
    ...iteration.toolCalls.map((tc) => ({
      type: "tool_use" as const,
      id: tc.id,
      name: tc.name,
      input: tc.input,
    })),
  ];
  messages.push({ role: "assistant", content: assistantBlocks });
  messages.push({
    role: "user",
    content: toolResults.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.id,
      content: r.content,
      is_error: r.isError,
    })),
  });
}
