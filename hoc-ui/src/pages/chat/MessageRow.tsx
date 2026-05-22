/**
 * Chat Feature — Message Row (Memoized)
 *
 * Individual message bubble with avatar, content, reactions, actions.
 * Reactions are persisted to memory.store for feedback-driven learning.
 * Extracted from ChatMessages.tsx per DDD component size limits.
 */

import {
  Bot,
  User,
  Loader2,
  Copy,
  Check,
  Pin,
  Trash2,
  Cpu,
  Zap,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import React from "react";
import {
  SandboxPreviewCard,
  extractSandboxPreviewUrl,
  stripSandboxPreviewMarker,
} from "@/components/SandboxPreviewCard";
import { parseAssistantContent, RenderParsedSegments } from "@/components/ToolCallCards";
import { Badge } from "@/components/ui";
import type { Message } from "./chat.types";
import { renderMarkdown } from "./markdown";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Extract iteration count from streaming message content */
export function extractIterationCount(content: string): number {
  const matches = content.match(/⏱️\s*_Iteration\s+(\d+)_/g);
  if (!matches || matches.length === 0) {
    return 0;
  }
  const lastMatch = matches[matches.length - 1] ?? "";
  const numMatch = /(\d+)/.exec(lastMatch);
  return numMatch ? parseInt(numMatch[1] ?? "0", 10) : 0;
}

/** Extract tool count from streaming message content */
export function extractToolCount(content: string): number {
  return (content.match(/🔧\s/g) ?? []).length;
}

// ── Component ───────────────────────────────────────────────────────────────

export interface MessageRowProps {
  msg: Message;
  isSearchMatch: boolean;
  reaction: "up" | "down" | undefined;
  toggleReaction: (msgId: string, type: "up" | "down") => void;
  copyMessage: (msgId: string, content: string) => void;
  pinMemory: (content: string, msgId: string) => void;
  setConfirmDeleteMsgId: (msgId: string) => void;
  copiedMsgId: string | null;
  pinningMsgId: string | null;
}

export const MessageRow = React.memo(
  ({
    msg,
    isSearchMatch,
    reaction,
    toggleReaction,
    copyMessage,
    pinMemory,
    setConfirmDeleteMsgId,
    copiedMsgId,
    pinningMsgId,
  }: MessageRowProps) => {
    const safeContent = msg.content ?? "";
    const previewUrl = msg.role === "assistant" ? extractSandboxPreviewUrl(safeContent) : null;
    const displayContent = previewUrl ? stripSandboxPreviewMarker(safeContent) : safeContent;

    return (
      <div
        className={`flex gap-3 group animate-fade-in ${msg.role === "user" ? "flex-row-reverse" : ""} ${isSearchMatch ? "ring-1 ring-accent/40 rounded-2xl p-1" : ""}`}
      >
        {/* Avatar */}
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-1 ${
            msg.role === "user"
              ? "bg-gradient-to-br from-accent to-accent/70"
              : msg.error
                ? "bg-danger/20 border border-danger/30"
                : msg.streaming
                  ? "bg-gradient-to-br from-purple/30 to-accent/30 animate-pulse"
                  : "bg-gradient-to-br from-purple/20 to-purple/10 border border-purple/20"
          }`}
        >
          {msg.role === "user" ? (
            <User size={12} className="text-white" />
          ) : (
            <Bot size={12} className={msg.error ? "text-danger" : "text-purple"} />
          )}
        </div>

        {/* Message content */}
        <div className={`flex-1 min-w-0 ${msg.role === "user" ? "flex justify-end" : ""}`}>
          <div
            data-msg-bubble
            className={`rounded-2xl text-[13px] leading-relaxed cursor-default ${
              msg.role === "user"
                ? "max-w-[75%] bg-gradient-to-br from-accent to-accent/90 text-white rounded-tr-sm px-4 py-2.5 shadow-sm shadow-accent/20"
                : msg.error
                  ? "max-w-full bg-danger/5 border border-danger/20 rounded-tl-sm px-4 py-3 text-text-secondary"
                  : `max-w-full rounded-tl-sm px-1 py-2 text-text-secondary`
            }`}
          >
            {/* Message body */}
            {msg.role === "user" ? (
              <span className="whitespace-pre-wrap">{displayContent}</span>
            ) : (
              (() => {
                const hasToolCalls =
                  /🔧\s/.test(displayContent) ||
                  /^🔑\s/m.test(displayContent) ||
                  /^📋\s/m.test(displayContent) ||
                  /^🤖\s/m.test(displayContent);
                if (hasToolCalls) {
                  const parsed = parseAssistantContent(displayContent);
                  return (
                    <RenderParsedSegments
                      segments={parsed.segments}
                      renderText={(t) => <div>{renderMarkdown(t)}</div>}
                    />
                  );
                }
                return <div>{renderMarkdown(displayContent)}</div>;
              })()
            )}

            {/* Streaming cursor */}
            {msg.streaming && (
              <span className="inline-flex items-center gap-1 mt-1">
                <span className="w-1 h-3.5 bg-accent rounded-full animate-pulse" />
              </span>
            )}

            {/* Footer: timestamp + reactions + actions */}
            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-border/10">
              <span
                className={`text-[9px] ${msg.role === "user" ? "text-white/50" : "text-text-muted/60"}`}
              >
                {new Date(msg.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              {typeof msg.tokens === "number" && msg.tokens > 0 && (
                <Badge variant="neutral" className="!text-[8px] !py-0 !px-1">
                  {msg.tokens >= 1000 ? `${(msg.tokens / 1000).toFixed(1)}K` : msg.tokens} tok
                </Badge>
              )}

              {/* Streaming progress */}
              {msg.streaming &&
                (() => {
                  const iterCount = extractIterationCount(safeContent);
                  const toolCount = extractToolCount(safeContent);
                  return (
                    <div className="flex items-center gap-1.5 ml-auto">
                      {iterCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[8px] text-accent/70">
                          <Cpu size={8} /> Iter {iterCount}
                        </span>
                      )}
                      {toolCount > 0 && (
                        <span className="flex items-center gap-0.5 text-[8px] text-purple/70">
                          <Zap size={8} /> {toolCount} tools
                        </span>
                      )}
                    </div>
                  );
                })()}

              {/* Reactions (assistant only) */}
              {!msg.streaming && msg.role === "assistant" && !msg.error && (
                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    type="button"
                    onClick={() => toggleReaction(msg.id, "up")}
                    aria-label="Thumbs up"
                    className={`p-0.5 rounded transition-colors ${
                      reaction === "up"
                        ? "text-success bg-success/10"
                        : "text-text-muted/40 hover:text-success opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <ThumbsUp size={9} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleReaction(msg.id, "down")}
                    aria-label="Thumbs down"
                    className={`p-0.5 rounded transition-colors ${
                      reaction === "down"
                        ? "text-danger bg-danger/10"
                        : "text-text-muted/40 hover:text-danger opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <ThumbsDown size={9} />
                  </button>
                </div>
              )}

              {/* Message actions */}
              {!msg.streaming && (
                <div className="flex items-center gap-1.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => copyMessage(msg.id, safeContent)}
                    title="Copy to clipboard"
                    aria-label="Copy message to clipboard"
                    className={`text-[9px] flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-bg-secondary/50 transition-all ${
                      msg.role === "user"
                        ? "text-white/60 hover:text-white"
                        : "text-text-muted hover:text-accent"
                    }`}
                  >
                    {copiedMsgId === msg.id ? (
                      <Check size={8} className="text-success" />
                    ) : (
                      <Copy size={8} />
                    )}
                    {copiedMsgId === msg.id ? "Copied" : "Copy"}
                  </button>
                  {msg.role === "assistant" && !msg.error && (
                    <button
                      type="button"
                      onClick={() => void pinMemory(safeContent, msg.id)}
                      disabled={pinningMsgId === msg.id}
                      title="Pin to memory"
                      aria-label="Pin message to memory"
                      className="text-[9px] flex items-center gap-0.5 px-1 py-0.5 rounded text-text-muted hover:text-accent hover:bg-bg-secondary/50 transition-all"
                    >
                      {pinningMsgId === msg.id ? (
                        <Loader2 size={8} className="animate-spin" />
                      ) : (
                        <Pin size={8} />
                      )}
                      Pin
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteMsgId(msg.id)}
                    title="Delete message"
                    aria-label="Delete message"
                    className={`text-[9px] flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-bg-secondary/50 transition-all ${
                      msg.role === "user"
                        ? "text-white/60 hover:text-white"
                        : "text-text-muted hover:text-danger"
                    }`}
                  >
                    <Trash2 size={8} /> Del
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Sandbox live preview card */}
          {previewUrl && !msg.streaming && (
            <SandboxPreviewCard url={previewUrl} title="Sandbox Preview" />
          )}
        </div>
      </div>
    );
  },
);
