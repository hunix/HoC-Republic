/**
 * Cloud Inference — Response Parsing
 *
 * Shared JSON action response parser used by all provider adapters.
 * Handles markdown code blocks, Gemma 4 thinking tokens, and
 * multiple field name conventions (tool/action, params/parameters).
 */

// ─── Parse Action JSON ─────────────────────────────────────────

/**
 * Parse a JSON action response from an LLM.
 * Handles various response formats (with/without markdown code blocks).
 */
export function parseActionJSON(text: string): { tool: string; params: Record<string, unknown> } {
  // Strip Gemma 4 thinking mode tokens: <|think|>...<think> or <thinking>...</thinking>
  let cleaned = text.trim();
  cleaned = cleaned.replace(/<\|think\|>[\s\S]*?<think>/g, "").trim();
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();

  // Strip markdown code blocks if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const tool = (parsed.tool as string) || (parsed.action as string) || "work";
    const params =
      (parsed.params as Record<string, unknown>) ||
      (parsed.parameters as Record<string, unknown>) ||
      {};

    return { tool, params };
  } catch {
    // If parsing fails, default to a work action
    return { tool: "work", params: { intensity: 0.5 } };
  }
}
