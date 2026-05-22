/**
 * Republic Platform — TOON Serializer
 *
 * Token-Optimized Object Notation (TOON) encoding/decoding for LLM prompts.
 * TOON reduces token usage by 30-60% compared to JSON for structured/tabular data
 * by using indentation-based structure and compact tabular syntax.
 *
 * Format example:
 *   citizens
 *     id | name | spec | skill
 *     c1 | Ada | Developer | 85
 *     c2 | Bob | Builder | 42
 *
 * This module provides a pure-TypeScript implementation (no external deps)
 * to avoid heavy npm packages while keeping the core benefits.
 */

// ─── Types ──────────────────────────────────────────────────────

export interface ToonEncodeOptions {
  /** Indentation string (default: 2 spaces) */
  indent?: string;
  /** Maximum depth before falling back to JSON (default: 4) */
  maxDepth?: number;
  /** Whether to use compact tabular format for uniform arrays (default: true) */
  tabular?: boolean;
}

export interface ToonStats {
  /** Total encode calls */
  totalEncodes: number;
  /** Total tokens saved (estimated) */
  totalTokensSaved: number;
  /** Average savings percentage */
  avgSavingsPercent: number;
  /** Total JSON tokens vs TOON tokens */
  totalJsonTokens: number;
  totalToonTokens: number;
}

// ─── State ──────────────────────────────────────────────────────

const stats: ToonStats = {
  totalEncodes: 0,
  totalTokensSaved: 0,
  avgSavingsPercent: 0,
  totalJsonTokens: 0,
  totalToonTokens: 0,
};

// ─── Token Estimation ───────────────────────────────────────────

/** Estimate token count (~4 chars per token, rough but consistent) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ─── Core TOON Encoder ──────────────────────────────────────────

/**
 * Encode a JavaScript value to TOON format.
 * Falls back to JSON for deeply nested or non-uniform structures.
 */
export function toToon(data: unknown, options?: ToonEncodeOptions): string {
  const opts: Required<ToonEncodeOptions> = {
    indent: options?.indent ?? "  ",
    maxDepth: options?.maxDepth ?? 4,
    tabular: options?.tabular ?? true,
  };

  const toonStr = encodeToon(data, 0, opts);
  const jsonStr = JSON.stringify(data);

  // Track stats
  const toonTokens = estimateTokens(toonStr);
  const jsonTokens = estimateTokens(jsonStr);
  stats.totalEncodes++;
  stats.totalJsonTokens += jsonTokens;
  stats.totalToonTokens += toonTokens;
  stats.totalTokensSaved += Math.max(0, jsonTokens - toonTokens);
  stats.avgSavingsPercent =
    stats.totalJsonTokens > 0
      ? ((stats.totalJsonTokens - stats.totalToonTokens) / stats.totalJsonTokens) * 100
      : 0;

  // Use TOON only if it's actually more compact
  return toonTokens < jsonTokens ? toonStr : jsonStr;
}

/**
 * Recursive TOON encoder.
 */
function encodeToon(
  value: unknown,
  depth: number,
  opts: Required<ToonEncodeOptions>,
): string {
  const prefix = opts.indent.repeat(depth);

  // Null / undefined
  if (value === null || value === undefined) {return `${prefix}~`;}

  // Primitives
  if (typeof value === "string") {return `${prefix}${escapeStr(value)}`;}
  if (typeof value === "number" || typeof value === "boolean") {return `${prefix}${value}`;}

  // Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {return `${prefix}[]`;}

    // Check if uniform array of flat objects (tabular shorthand)
    if (opts.tabular && depth < opts.maxDepth && isUniformFlatArray(value)) {
      return encodeTabular(value as Record<string, unknown>[], depth, opts);
    }

    // Regular array
    if (depth >= opts.maxDepth) {return `${prefix}${JSON.stringify(value)}`;}

    const lines = value.map((item) => {
      if (isPrimitive(item)) {return `${prefix}- ${formatPrimitive(item)}`;}
      return `${prefix}-\n${encodeToon(item, depth + 1, opts)}`;
    });
    return lines.join("\n");
  }

  // Objects
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {return `${prefix}{}`;}

    if (depth >= opts.maxDepth) {return `${prefix}${JSON.stringify(obj)}`;}

    const lines = keys.map((key) => {
      const val = obj[key];
      if (isPrimitive(val)) {
        return `${prefix}${key}: ${formatPrimitive(val)}`;
      }
      return `${prefix}${key}:\n${encodeToon(val, depth + 1, opts)}`;
    });
    return lines.join("\n");
  }

  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return `${prefix}${String(value)}`;
}

/**
 * Encode a uniform array of flat objects as a compact table.
 *
 * Input:  [{id: "c1", name: "Ada"}, {id: "c2", name: "Bob"}]
 * Output:
 *   id | name
 *   c1 | Ada
 *   c2 | Bob
 */
function encodeTabular(
  rows: Record<string, unknown>[],
  depth: number,
  opts: Required<ToonEncodeOptions>,
): string {
  const prefix = opts.indent.repeat(depth);
  const keys = Object.keys(rows[0]);

  const header = `${prefix}${keys.join(" | ")}`;
  const dataLines = rows.map((row) => {
    const vals = keys.map((k) => formatPrimitive(row[k]));
    return `${prefix}${vals.join(" | ")}`;
  });

  return [header, ...dataLines].join("\n");
}

// ─── TOON Decoder ───────────────────────────────────────────────

/**
 * Decode TOON-formatted text back to a JavaScript value.
 * Handles both tabular and hierarchical TOON structures.
 * Falls back to JSON.parse if the input looks like JSON.
 */
export function fromToon(toon: string): unknown {
  const trimmed = toon.trim();

  // If it looks like JSON, parse as JSON
  if (trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Not valid JSON, try TOON
    }
  }

  // Check for tabular format (header row with | separators)
  const lines = trimmed.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length >= 2 && lines[0].includes(" | ")) {
    return decodeTabular(lines);
  }

  // Hierarchical TOON
  return decodeHierarchical(lines);
}

/**
 * Decode tabular TOON (header + data rows).
 */
function decodeTabular(lines: string[]): Record<string, unknown>[] {
  const baseIndent = lines[0].length - lines[0].trimStart().length;
  const stripped = lines.map((l) => l.slice(baseIndent));

  const headers = stripped[0].split(" | ").map((h) => h.trim());
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < stripped.length; i++) {
    const values = stripped[i].split(" | ").map((v) => v.trim());
    const row: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = parsePrimitive(values[j] ?? "");
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Decode hierarchical TOON (key: value format).
 */
function decodeHierarchical(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes(": ")) {
      const colonIdx = trimmed.indexOf(": ");
      const key = trimmed.slice(0, colonIdx);
      const val = trimmed.slice(colonIdx + 2);
      result[key] = parsePrimitive(val);
    } else if (trimmed.startsWith("- ")) {
      // Array item — collect into unnamed array
      if (!result._items) {result._items = [];}
      (result._items as unknown[]).push(parsePrimitive(trimmed.slice(2)));
    }
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────────

function isPrimitive(val: unknown): boolean {
  return val === null || val === undefined || typeof val !== "object";
}

function formatPrimitive(val: unknown): string {
  if (val === null || val === undefined) {return "~";}
  if (typeof val === "string") {return escapeStr(val);}
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  return String(val);
}

function parsePrimitive(val: string): unknown {
  if (val === "~" || val === "null") {return null;}
  if (val === "true") {return true;}
  if (val === "false") {return false;}
  const num = Number(val);
  if (!isNaN(num) && val.trim().length > 0) {return num;}
  return val;
}

function escapeStr(s: string): string {
  // Only quote if contains special TOON chars
  if (s.includes("|") || s.includes("\n") || s.includes(":")) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Check if an array contains uniform flat objects (all same keys, no nested values).
 */
function isUniformFlatArray(arr: unknown[]): boolean {
  if (arr.length === 0) {return false;}

  const first = arr[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {return false;}

  const keys = Object.keys(first as Record<string, unknown>).toSorted().join(",");

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item !== "object" || item === null || Array.isArray(item)) {return false;}
    const itemKeys = Object.keys(item as Record<string, unknown>).toSorted().join(",");
    if (itemKeys !== keys) {return false;}

    // Check all values are primitives
    for (const val of Object.values(item as Record<string, unknown>)) {
      if (typeof val === "object" && val !== null) {return false;}
    }
  }

  return true;
}

// ─── Chat Message Compression ───────────────────────────────────

interface ChatMessage {
  role: string;
  content: string;
  ts?: number;
  tokens?: number;
}

/**
 * Compress chat message arrays into compact TOON format.
 * Truncates long messages and strips verbose metadata.
 *
 * Typical savings: 35-50% vs JSON for a 20-message conversation.
 *
 * Output format:
 *   [chat_history — TOON, 12 messages]
 *   role | content | ts
 *   user | Hello, how are you? | 14:30
 *   assistant | I'm doing well! How can I help? | 14:30
 */
export function toToonChat(
  messages: ChatMessage[],
  opts?: { maxContentLength?: number; maxMessages?: number },
): string {
  const maxLen = opts?.maxContentLength ?? 300;
  const maxMsgs = opts?.maxMessages ?? 40;

  // Take most recent messages if over limit
  const recent = messages.length > maxMsgs
    ? messages.slice(-maxMsgs)
    : messages;

  const rows = recent.map(m => {
    // Truncate long content
    let content = m.content.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    if (content.length > maxLen) {
      content = content.slice(0, maxLen - 3) + "...";
    }
    // Format timestamp if available
    const ts = m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
    return { role: m.role, content, ts };
  });

  const toon = toToon(rows, { tabular: true });
  const jsonFallback = JSON.stringify(recent.map(m => ({
    role: m.role,
    content: m.content.slice(0, maxLen),
  })));

  const toonTokens = estimateTokens(toon);
  const jsonTokens = estimateTokens(jsonFallback);

  // Track savings
  stats.totalEncodes++;
  stats.totalJsonTokens += jsonTokens;
  stats.totalToonTokens += Math.min(toonTokens, jsonTokens);
  stats.totalTokensSaved += Math.max(0, jsonTokens - toonTokens);
  stats.avgSavingsPercent =
    stats.totalJsonTokens > 0
      ? ((stats.totalJsonTokens - stats.totalToonTokens) / stats.totalJsonTokens) * 100
      : 0;

  const header = `[chat_history — TOON, ${recent.length} messages]`;
  return toonTokens < jsonTokens
    ? `${header}\n${toon}`
    : `${header}\n${jsonFallback}`;
}

/**
 * Compress tool execution results into TOON key:value format.
 * Strips verbose stdout/stderr and keeps only essential info.
 */
export function toToonToolResult(
  toolName: string,
  result: Record<string, unknown>,
  maxOutputLen = 500,
): string {
  const cleaned: Record<string, unknown> = { tool: toolName };

  for (const [key, val] of Object.entries(result)) {
    if (key === "stdout" || key === "stderr" || key === "output") {
      const str = String(val ?? "");
      cleaned[key] = str.length > maxOutputLen
        ? str.slice(0, maxOutputLen - 20) + `\n[...truncated ${str.length - maxOutputLen + 20} chars]`
        : str;
    } else {
      cleaned[key] = val;
    }
  }

  return toToon(cleaned);
}

// ─── Prompt Wrapping ────────────────────────────────────────────

/**
 * Wrap structured data in TOON format for inclusion in an LLM prompt.
 * Adds a brief TOON format instruction if TOON encoding is used.
 */
export function wrapPromptData(
  label: string,
  data: unknown,
  opts?: ToonEncodeOptions,
): string {
  const encoded = toToon(data, opts);
  const isToon = !encoded.startsWith("{") && !encoded.startsWith("[");

  if (isToon) {
    return `[${label} — TOON format, pipe-delimited tabular data]\n${encoded}`;
  }
  return `[${label}]\n${encoded}`;
}

/**
 * Build a TOON-aware system prompt prefix.
 * Appended to system prompts when TOON data is present in the context.
 */
export const TOON_SYSTEM_PREFIX =
  "Context data may use TOON (Token-Optimized Object Notation): " +
  "indentation-based key:value pairs and pipe-delimited tables. " +
  "Parse them like structured data.";

// ─── Diagnostics ────────────────────────────────────────────────

export function getToonStats(): ToonStats {
  return { ...stats };
}

export function resetToonStats(): void {
  stats.totalEncodes = 0;
  stats.totalTokensSaved = 0;
  stats.avgSavingsPercent = 0;
  stats.totalJsonTokens = 0;
  stats.totalToonTokens = 0;
}
