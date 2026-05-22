/**
 * Gemini Provider Adapter — Google Gemini API integration.
 *
 * Handles the Gemini generateContent API with function calling.
 * Preserves raw model parts (including thought_signature) for proper
 * history replay with thinking-enabled models.
 *
 * Context caching: Gemini auto-caches system_instruction and tools
 * when the same content is sent across successive requests to the
 * same model within a session (implicit prefix caching, GA since 2025).
 */

import type { AgentBroadcaster, LoopIteration, GeminiPart, GeminiContent } from "./types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { key } from "./config.js";

const logger = createSubsystemLogger("agent-gemini");

// ─── Tool Format Conversion ────────────────────────────────────

/** Convert Anthropic-style TOOLS to Gemini function declarations */
export function buildGeminiTools(
  tools: Array<{ name: string; description: string; input_schema: object }>,
): object {
  return {
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  };
}

// ─── API Loop ──────────────────────────────────────────────────

/** Run a single Gemini API call with tools and return parsed result */
export async function runGeminiLoop(
  contents: GeminiContent[],
  modelId: string,
  broadcaster: AgentBroadcaster,
  maxRetries: number,
  tools: Array<{ name: string; description: string; input_schema: object }>,
  systemPrompt: string,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<LoopIteration | null> {
  const apiKey = key("GEMINI_API_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const requestBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    tools: [buildGeminiTools(tools)],
    generationConfig: { maxOutputTokens: 65536, temperature: 0.7 },
  };

  let response: Response | null = null;
  let lastApiError = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      if ((status === 429 || status === 503 || status >= 500) && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        broadcaster.send(
          `\n⏳ Gemini ${status === 429 ? "rate limited" : "overloaded"}, retrying in ${backoffMs / 1000}s...\n`,
        );
        await new Promise((r) => setTimeout(r, backoffMs));
        continue;
      }
      broadcaster.send(
        `\n⚠️ Gemini API Error ${status}:\n\`\`\`\n${errBody.slice(0, 500)}\n\`\`\`\n`,
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
    logger.error(`[AgentLoop/Gemini] All retries failed: ${lastApiError}`);
    return null;
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: GeminiPart[] };
      finishReason?: string;
    }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const _finishReason = data.candidates?.[0]?.finishReason;
  const textBlocks = parts.filter((p) => p.text).map((p) => p.text ?? "");
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, idx) => ({
      id: `gemini-fc-${idx}`,
      name: p.functionCall!.name,
      input: p.functionCall!.args,
    }));

  return {
    textBlocks,
    toolCalls,
    // Preserve raw parts so appendGeminiTurn can replay them verbatim with thought_signature intact
    rawModelParts: parts,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    done: toolCalls.length === 0,
  };
}

// ─── History Append ────────────────────────────────────────────

/** Append Gemini-format turn to message history */
export function appendGeminiTurn(
  contents: GeminiContent[],
  iteration: LoopIteration,
  toolResults: Array<{ id: string; name: string; content: string; isError: boolean }>,
): void {
  // Use raw model parts if available — they carry thought_signature on functionCall parts,
  // which Gemini requires when replaying history for thinking-enabled models.
  // Fallback to reconstructed parts for providers that don't set rawModelParts.
  const modelParts: GeminiPart[] = (iteration.rawModelParts as GeminiPart[] | undefined) ?? [
    ...iteration.textBlocks.map((t) => ({ text: t })),
    ...iteration.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.input } })),
  ];
  contents.push({ role: "model", parts: modelParts });
  // Append all tool results as a single "user" turn (Gemini requirement)
  contents.push({
    role: "user",
    parts: toolResults.map((r) => ({
      functionResponse: {
        name: r.name,
        response: { content: r.isError ? `Error: ${r.content}` : r.content },
      },
    })),
  });
}
