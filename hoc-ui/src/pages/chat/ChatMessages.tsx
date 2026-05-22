/**
 * Chat Feature — Messages Area (Manus-style)
 *
 * Thin composition root that delegates to:
 *   - MediaLightbox.tsx       — fullscreen media preview
 *   - SuggestedFollowups.tsx  — post-completion follow-up suggestions
 *   - StarRating.tsx          — task quality rating (persisted to memory)
 *   - MessageRow.tsx          — individual message rendering (memoized)
 */

import {
  Bot,
  Sparkles,
  Plus,
  ChevronLeft,
  MessageSquare,
  Loader2,
  Search,
  X,
  Download,
  CheckCircle,
} from "lucide-react";
import React, { useState, useCallback, useMemo, useEffect } from "react";
import { Button } from "@/components/ui";
import type { Message, SessionFile } from "./chat.types";
import type { ChatState } from "./useChatState";
import { SUGGESTIONS } from "./chat.constants";
import { FileCards } from "./FileCards";
import { MediaLightbox } from "./MediaLightbox";
import { MessageRow } from "./MessageRow";
import { StarRating } from "./StarRating";
import { SuggestedFollowups } from "./SuggestedFollowups";

type Props = Pick<
  ChatState,
  | "activeKey"
  | "messages"
  | "historyLoading"
  | "sending"
  | "copiedMsgId"
  | "pinningMsgId"
  | "endRef"
  | "inputRef"
  | "newConversation"
  | "setLeftPanelOpen"
  | "setInput"
  | "copyMessage"
  | "pinMemory"
  | "setConfirmDeleteMsgId"
> & {
  sessionFiles: SessionFile[];
  onViewAllFiles?: () => void;
};

/** Check if message contains task completion markers */
function isTaskCompleted(msg: Message): boolean {
  const c = msg.content ?? "";
  return (
    !msg.streaming &&
    !msg.error &&
    msg.role === "assistant" &&
    (c.includes("✅") || c.includes("Task completed") || c.includes("✓"))
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export function ChatMessages(props: Props) {
  const {
    activeKey,
    messages,
    historyLoading,
    sending,
    copiedMsgId,
    pinningMsgId,
    endRef,
    inputRef,
    newConversation,
    setLeftPanelOpen,
    setInput,
    copyMessage,
    pinMemory,
    setConfirmDeleteMsgId,
    sessionFiles,
    onViewAllFiles,
  } = props;

  // ── Local state
  const [reactions, setReactions] = useState<Record<string, "up" | "down">>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState<{
    src: string;
    alt: string;
    mediaType: "image" | "video" | "audio";
  } | null>(null);

  // ── Keyboard shortcut: Ctrl+F → search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f" && activeKey) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeKey]);

  const toggleReaction = useCallback((msgId: string, type: "up" | "down") => {
    setReactions((prev) => {
      const current = prev[msgId];
      if (current === type) {
        const next = { ...prev };
        delete next[msgId];
        return next;
      }
      return { ...prev, [msgId]: type };
    });
  }, []);

  // ── Search matching
  const searchLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
  const matchingIds = useMemo(() => {
    if (!searchLower) {
      return new Set<string>();
    }
    return new Set(
      messages
        .filter((m) => (m.content ?? "").toLowerCase().includes(searchLower))
        .map((m) => m.id),
    );
  }, [messages, searchLower]);

  // ── Image + Video click handler
  const handleMediaClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-msg-bubble]")) {
      if (target.tagName === "IMG") {
        const img = target as HTMLImageElement;
        setLightboxSrc({ src: img.src, alt: img.alt || "", mediaType: "image" });
      } else if (target.tagName === "VIDEO") {
        const video = target as HTMLVideoElement;
        setLightboxSrc({
          src: video.src,
          alt: video.getAttribute("aria-label") || "",
          mediaType: "video",
        });
      } else if (target.tagName === "AUDIO") {
        const audio = target as HTMLAudioElement;
        setLightboxSrc({
          src: audio.src,
          alt: audio.getAttribute("aria-label") || "",
          mediaType: "audio",
        });
      }
    }
  }, []);

  // ── Export As Markdown
  const exportAsMarkdown = useCallback(() => {
    const md = messages
      .map((m) => {
        const ts = new Date(m.ts).toLocaleString();
        return `### ${m.role === "user" ? "You" : "Assistant"} (${ts})\n\n${m.content ?? ""}\n`;
      })
      .join("\n---\n\n");
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-export-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages]);

  // ── Smart Scrolling
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) {
      return;
    }
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 100);
  }, []);

  useEffect(() => {
    if (isAtBottom && endRef.current) {
      endRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isAtBottom, endRef]);

  // ── Find the last completed assistant message for follow-ups
  const lastAssistant = messages.length > 0 ? messages[messages.length - 1] : null;
  const showFollowups =
    activeKey && !sending && lastAssistant?.role === "assistant" && !lastAssistant.streaming;
  const showCompletion = lastAssistant && isTaskCompleted(lastAssistant);

  return (
    <div
      className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0"
      onClick={handleMediaClick}
      onScroll={handleScroll}
      ref={scrollRef}
    >
      {/* Lightbox */}
      {lightboxSrc && (
        <MediaLightbox
          src={lightboxSrc.src}
          alt={lightboxSrc.alt}
          mediaType={lightboxSrc.mediaType}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* Search bar */}
      {searchOpen && (
        <div className="sticky top-0 z-20 flex items-center gap-2 mb-2 px-3 py-2 glass-thin glass-specular rounded-xl shadow-sm liquid-bounce">
          <Search size={12} className="text-text-muted shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in chat…"
            className="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
            autoFocus
          />
          {searchQuery && (
            <span className="text-[9px] text-text-muted shrink-0">{matchingIds.size} found</span>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            className="p-0.5 rounded hover:bg-bg-secondary text-text-muted"
            aria-label="Close search"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* Export button */}
      {activeKey && !sending && messages.length > 2 && !searchOpen && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={exportAsMarkdown}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] text-text-muted hover:text-accent hover:bg-bg-card-hover transition-colors"
            title="Export as Markdown"
          >
            <Download size={9} /> Export .md
          </button>
        </div>
      )}

      {/* Empty state — no session selected */}
      {!activeKey && (
        <div className="h-full flex flex-col items-center justify-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-purple/20 flex items-center justify-center">
            <Sparkles size={32} className="text-accent" />
          </div>
          <div>
            <p className="text-base font-semibold text-text-primary mb-1">Start a conversation</p>
            <p className="text-sm text-text-muted max-w-xs">
              Select an existing task from the sidebar or click <strong>+</strong> to create a new
              one.
            </p>
          </div>
          <Button size="sm" onClick={() => void newConversation()}>
            <Plus size={12} /> New
          </Button>
          <button
            type="button"
            onClick={() => setLeftPanelOpen(false)}
            className="p-1 rounded-lg hover:bg-bg-card-hover text-text-muted hover:text-accent transition-colors"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      )}

      {/* Loading history */}
      {activeKey && historyLoading && (
        <div className="h-full flex items-center justify-center gap-2 text-text-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Loading history…</span>
        </div>
      )}

      {/* Empty conversation */}
      {activeKey && !historyLoading && messages.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-bg-card-hover flex items-center justify-center">
            <MessageSquare size={20} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">No messages yet — say something!</p>
        </div>
      )}

      {/* Messages */}
      {messages.map((msg) => (
        <MessageRow
          key={msg.id}
          msg={msg}
          isSearchMatch={searchQuery ? matchingIds.has(msg.id) : false}
          reaction={reactions[msg.id]}
          toggleReaction={toggleReaction}
          copyMessage={copyMessage}
          pinMemory={pinMemory}
          setConfirmDeleteMsgId={setConfirmDeleteMsgId}
          copiedMsgId={copiedMsgId}
          pinningMsgId={pinningMsgId}
        />
      ))}

      {/* Typing indicator */}
      {sending && messages[messages.length - 1]?.role === "user" && (
        <div className="flex gap-3 animate-fade-in">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple/30 to-accent/30 flex items-center justify-center animate-pulse">
            <Bot size={12} className="text-purple" />
          </div>
          <div className="glass-thin glass-specular rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm shadow-accent/5">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-0.5">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
              <span className="text-xs text-text-secondary">Agent thinking…</span>
            </div>
          </div>
        </div>
      )}

      {/* File cards (Manus-style) — shown after the last assistant message */}
      {sessionFiles.length > 0 && showFollowups && (
        <FileCards files={sessionFiles} maxVisible={3} onViewAll={onViewAllFiles} />
      )}

      {/* Task completed + star rating */}
      {showCompletion && (
        <div className="flex items-center justify-between py-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-success" />
            <span className="text-[13px] font-medium text-success">Task completed</span>
          </div>
          <StarRating taskContext={(lastAssistant?.content ?? "").slice(0, 200)} />
        </div>
      )}

      {/* Suggested follow-ups (Manus-style) */}
      {showFollowups && !sending && (
        <SuggestedFollowups
          onSelect={(text) => {
            setInput(text);
            inputRef.current?.focus();
          }}
        />
      )}

      {/* Auto-suggestions (initial) */}
      {activeKey && !sending && messages.length === 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setInput(s);
                inputRef.current?.focus();
              }}
              className="px-3 py-1.5 rounded-xl bg-bg-card border border-border/60 text-[11px] text-text-secondary hover:bg-accent/10 hover:text-accent hover:border-accent/30 hover:shadow-sm transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
