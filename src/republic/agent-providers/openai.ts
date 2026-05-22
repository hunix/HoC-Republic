/**
 * OpenAI Provider Adapter — OpenAI-compatible API integration.
 *
 * Handles the OpenAI Chat Completions API with function calling.
 * Used by all OpenAI-compatible providers: OpenAI, DeepSeek, Groq,
 * NVIDIA NIM, OpenRouter, LM Studio, and Ollama.
 *
 * Prompt caching: OpenAI automatically caches identical message prefixes
 * (system prompt + tools) at no extra cost. We ensure the system message
 * is always the first message and tools are in a stable order so the
 * prefix remains identical across turns within a session.
 */

import type {
  AgentBroadcaster,
  LoopIteration,
  OpenAiMessage,
  OpenAiCompatConfig,
} from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { key } from "./config.js";

const logger = createSubsystemLogger("agent-openai");

// ─── Tool Format Conversion ────────────────────────────────────

/** Convert Anthropic-style TOOLS to OpenAI function-calling format */
export function buildOpenAiTools(
  tools: Array<{ name: string; description: string; input_schema: object }>,
): object[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// ─── API Loop ──────────────────────────────────────────────────

/** Run a single OpenAI-compatible API call with tools and return parsed result */
export async function runOpenAiLoop(
  messages: OpenAiMessage[],
  modelId: string,
  broadcaster: AgentBroadcaster,
  maxRetries: number,
  config?: OpenAiCompatConfig,
  tools: Array<{ name: string; description: string; input_schema: object }> = [],
  timeoutMs: number = 120_000,
  abortSignal?: AbortSignal,
): Promise<LoopIteration | null> {
  // Use provided config or default to OpenAI
  const baseUrl = config?.baseUrl || "https://api.openai.com/v1";
  const apiKey = config?.apiKey || key("OPENAI_API_KEY");
  const providerName = config?.label || "OpenAI";
  const maxTokens = config?.maxTokens || 8192;
  const extraHeaders = config?.extraHeaders || {};

  const requestBody: Record<string, unknown> = {
    model: config?.modelId || modelId,
    messages,
    tools: buildOpenAiTools(tools),
    tool_choice: "auto",
    max_completion_tokens: maxTokens,
  };

  let response: Response | null = null;
  let lastApiError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
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
      if ((status === 429 || status >= 500) && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        broadcaster.send(
          `\n⏳ ${providerName} ${status === 429 ? "rate limited" : "overloaded"}, retrying in ${backoffMs / 1000}s...\n`,
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      broadcaster.send(
        `\n⚠️ ${providerName} API Error ${status}:\n\`\`\`\n${errBody.slice(0, 500)}\n\`\`\`\n`,
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
    logger.error(`[AgentLoop/${providerName}] All retries failed: ${lastApiError}`);
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const msg = data.choices?.[0]?.message;
  const _finishReason = data.choices?.[0]?.finish_reason;
  const textBlocks = msg?.content ? [msg.content] : [];
  const toolCalls = (msg?.tool_calls ?? []).map((tc) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    return { id: tc.id, name: tc.function.name, input };
  });

  return {
    textBlocks,
    toolCalls,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    done: toolCalls.length === 0,
  };
}

// ─── History Append ────────────────────────────────────────────

/** Append OpenAI-format turn to message history */
export function appendOpenAiTurn(
  messages: OpenAiMessage[],
  iteration: LoopIteration,
  toolResults: Array<{ id: string; content: string; isError: boolean }>,
): void {
  messages.push({
    role: "assistant",
    content: iteration.textBlocks.join("\n") || null,
    tool_calls: iteration.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: JSON.stringify(tc.input) },
    })),
  });
  for (const r of toolResults) {
    messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
  }
}
