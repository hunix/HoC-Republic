/**
 * Fine-Tune Pipeline — Dataset Builder
 *
 * Converts various data sources into training-ready dataset formats:
 * - Chat logs → ShareGPT conversations
 * - Documents → Alpaca instruction pairs
 * - Q&A pairs → Direct training samples
 */

import type { DatasetEntry, DatasetFormat } from "./types.js";

// ─── Conversation → ShareGPT ─────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

/** Convert chat history into ShareGPT format for SFT training */
export function chatToShareGPT(conversations: ConversationTurn[][]): DatasetEntry[] {
  return conversations.map((turns) => ({
    conversations: turns
      .map((t) => ({
        from:
          t.role === "user"
            ? ("human" as const)
            : t.role === "assistant"
              ? ("gpt" as const)
              : ("system" as const),
        value: t.content.trim(),
      }))
      .filter((t) => t.value.length > 0),
  }));
}

// ─── Documents → Alpaca ──────────────────────────────────────────

/** Convert a document into instruction-output pairs via chunking */
export function documentToAlpaca(document: string, chunkSize = 1000): DatasetEntry[] {
  const paragraphs = document.split(/\n{2,}/).filter((p) => p.trim().length > 50);
  const entries: DatasetEntry[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length < 50 || trimmed.length > chunkSize * 2) {
      continue;
    }

    // Generate instruction from the first sentence
    const firstSentence = trimmed.match(/^[^.!?]+[.!?]/)?.[0] ?? trimmed.slice(0, 80);

    entries.push({
      instruction: `Explain the following: ${firstSentence}`,
      input: "",
      output: trimmed,
    });
  }

  return entries;
}

// ─── Q&A Pairs ───────────────────────────────────────────────────

/** Convert Q&A pairs into Alpaca format */
export function qaPairsToAlpaca(
  pairs: Array<{ question: string; answer: string; context?: string }>,
): DatasetEntry[] {
  return pairs.map(({ question, answer, context }) => ({
    instruction: question,
    input: context ?? "",
    output: answer,
  }));
}

// ─── Format Conversion ──────────────────────────────────────────

/** Convert between dataset formats */
export function convertFormat(
  entries: DatasetEntry[],
  from: DatasetFormat,
  to: DatasetFormat,
): DatasetEntry[] {
  if (from === to) {
    return entries;
  }

  if (from === "sharegpt" && to === "alpaca") {
    return entries.map((e) => {
      const turns = e.conversations ?? [];
      const userTurn = turns.find((t) => t.from === "human");
      const assistantTurn = turns.find((t) => t.from === "gpt");
      return {
        instruction: userTurn?.value ?? "",
        input: "",
        output: assistantTurn?.value ?? "",
      };
    });
  }

  if (from === "alpaca" && to === "sharegpt") {
    return entries.map((e) => ({
      conversations: [
        ...(e.input ? [{ from: "system" as const, value: e.input }] : []),
        { from: "human" as const, value: e.instruction ?? "" },
        { from: "gpt" as const, value: e.output ?? "" },
      ],
    }));
  }

  return entries;
}

// ─── Validation ──────────────────────────────────────────────────

export interface DatasetStats {
  totalSamples: number;
  avgTokenEstimate: number;
  minLength: number;
  maxLength: number;
  emptyOutputs: number;
  format: DatasetFormat;
}

/** Validate and compute stats for a dataset */
export function validateDataset(entries: DatasetEntry[], format: DatasetFormat): DatasetStats {
  let totalChars = 0;
  let minLen = Infinity;
  let maxLen = 0;
  let emptyOutputs = 0;

  for (const entry of entries) {
    let len: number;

    if (format === "sharegpt") {
      const text = (entry.conversations ?? []).map((c) => c.value).join(" ");
      len = text.length;
      if ((entry.conversations ?? []).length < 2) {
        emptyOutputs++;
      }
    } else {
      const text = `${entry.instruction ?? ""} ${entry.input ?? ""} ${entry.output ?? ""}`;
      len = text.length;
      if (!entry.output?.trim()) {
        emptyOutputs++;
      }
    }

    totalChars += len;
    minLen = Math.min(minLen, len);
    maxLen = Math.max(maxLen, len);
  }

  return {
    totalSamples: entries.length,
    avgTokenEstimate: entries.length > 0 ? Math.round(totalChars / entries.length / 4) : 0,
    minLength: entries.length > 0 ? minLen : 0,
    maxLength: maxLen,
    emptyOutputs,
    format,
  };
}

/** Serialize dataset to JSONL for LlamaFactory */
export function toJSONL(entries: DatasetEntry[]): string {
  return entries.map((e) => JSON.stringify(e)).join("\n");
}
