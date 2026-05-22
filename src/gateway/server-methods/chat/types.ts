/**
 * Chat Handler — Shared Types
 */

export type TranscriptAppendResult = {
  ok: boolean;
  messageId?: string;
  message?: Record<string, unknown>;
  error?: string;
};

/** Standard usage shape for injected (non-LLM) messages */
export const ZERO_USAGE = { input: 0, output: 0, totalTokens: 0 } as const;

/** Build a standard injected assistant message body */
export function buildInjectedMessage(text: string, extraUsage?: Record<string, unknown>) {
  return {
    role: "assistant" as const,
    content: [{ type: "text", text }],
    timestamp: Date.now(),
    stopReason: "injected",
    usage: extraUsage ?? { ...ZERO_USAGE },
  };
}
