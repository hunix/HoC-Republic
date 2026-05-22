/**
 * Chat Feature — Input Bar (Manus-style)
 *
 * Manus-inspired input bar:
 * - Left: + (attach), GitHub, Comment icons
 * - Center: text input "Send message to Clawdbot"
 * - Right: Microphone, Send (circular accent button)
 */

import {
  Send,
  Square,
  Plus,
  X,
  Image,
  FileText,
  Github,
  MessageSquare,
  Mic,
  MicOff,
  ChevronRight,
  Zap,
  FileSearch,
  Code,
  BarChart3,
  Pencil,
} from "lucide-react";
import React, { useCallback, useState, useRef, useEffect } from "react";
import type { ChatState } from "./useChatState";

/** Quick prompt templates */
const PROMPT_TEMPLATES = [
  {
    icon: Zap,
    label: "Research a topic",
    prompt: "Research the following topic in depth and give me a comprehensive summary: ",
  },
  {
    icon: FileSearch,
    label: "Analyze a document",
    prompt: "Analyze the attached document and provide key insights, themes, and a summary.",
  },
  { icon: Code, label: "Write code", prompt: "Write production-quality code for the following: " },
  {
    icon: BarChart3,
    label: "Create a report",
    prompt: "Create a detailed report with data analysis on: ",
  },
  {
    icon: Pencil,
    label: "Draft content",
    prompt: "Draft professional content for the following purpose: ",
  },
] as const;

type Props = Pick<
  ChatState,
  | "activeKey"
  | "activeSession"
  | "input"
  | "setInput"
  | "placeholder"
  | "sending"
  | "attachedFiles"
  | "inputRef"
  | "fileInputRef"
  | "handleSend"
  | "handleAbort"
  | "handleKeyDown"
  | "handleFileSelect"
  | "removeAttachment"
  | "activeModelId"
>;

/** Format file size */
function fmtSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1_048_576) {
    return `${(bytes / 1024).toFixed(0)}KB`;
  }
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}

export function ChatInputBar(props: Props) {
  const {
    activeKey,
    activeSession,
    input,
    setInput,
    sending,
    attachedFiles,
    inputRef,
    fileInputRef,
    handleSend,
    handleAbort,
    handleKeyDown,
    handleFileSelect,
    removeAttachment,
  } = props;

  const [dragOver, setDragOver] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);

  // ── Voice input via Web Speech API ──────────────────────────────
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggleVoice = useCallback(() => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof globalThis.SpeechRecognition })
        .SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof globalThis.SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return; // Browser doesn't support speech recognition
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          transcript += result[0].transcript;
        }
      }
      if (transcript) {
        setInput((prev: string) => {
          // Replace the last interim result or append
          const lastResult = event.results[event.results.length - 1];
          if (lastResult?.isFinal) {
            return prev + transcript + " ";
          }
          return prev;
        });
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, setInput]);

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Close templates on outside click
  useEffect(() => {
    if (!templatesOpen) return;
    const handler = (e: MouseEvent) => {
      if (templatesRef.current && !templatesRef.current.contains(e.target as Node)) {
        setTemplatesOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [templatesOpen]);

  // ── Drag & Drop ──────────────────────────────────────────────────
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const dt = new DataTransfer();
        Array.from(files).forEach((f) => dt.items.add(f));
        if (fileInputRef.current) {
          fileInputRef.current.files = dt.files;
          fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    },
    [fileInputRef],
  );

  // ── Paste Image ──────────────────────────────────────────────────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            if (fileInputRef.current) {
              fileInputRef.current.files = dt.files;
              fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }
          return;
        }
      }
    },
    [fileInputRef],
  );

  // Auto-resize textarea
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      const el = e.target;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
    },
    [setInput],
  );

  if (!activeKey) {
    return null;
  }

  return (
    <div
      className={`border-t border-border/30 glass-thin shrink-0 transition-colors ${dragOver ? "bg-accent/5 border-accent/40" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="px-4 pt-2">
          <div className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-accent/40 bg-accent/5">
            <Image size={16} className="text-accent" />
            <span className="text-xs text-accent font-medium">Drop files here to attach</span>
          </div>
        </div>
      )}

      {/* Attachment thumbnails */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {attachedFiles.map((f, i) => (
            <div key={i} className="relative group/att">
              {f.preview ? (
                <div className="w-14 h-14 rounded-lg overflow-hidden border border-border shadow-sm">
                  <img src={f.preview} alt={f.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-lg border border-border bg-bg-secondary flex flex-col items-center justify-center gap-0.5 shadow-sm">
                  <FileText size={14} className="text-text-muted" />
                  <span className="text-[7px] text-text-muted truncate max-w-[46px] text-center">
                    {f.name.split(".").pop()}
                  </span>
                </div>
              )}
              <span className="absolute top-0.5 left-0.5 text-[7px] px-1 py-0 rounded bg-bg-primary/80 text-text-muted">
                {fmtSize(f.size)}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity shadow-sm"
                aria-label={`Remove ${f.name}`}
              >
                <X size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row — Manus style */}
      <div className="px-4 py-3">
        <div
          className={`flex items-end gap-0 rounded-2xl border transition-colors ${
            dragOver ? "border-accent/40" : "border-border"
          } bg-bg-input overflow-hidden`}
        >
          {/* Textarea */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Send message to Clawdbot"
            disabled={sending}
            rows={1}
            className="flex-1 bg-transparent px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted outline-none resize-none disabled:opacity-50"
            style={{ minHeight: "44px", maxHeight: "140px" }}
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.md,.csv,.json,.py,.js,.ts,.tsx,.pptx,.docx,.xlsx,.zip,.mp3,.mp4,.wav"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Bottom icon row */}
        <div className="flex items-center justify-between mt-2">
          {/* Left icons */}
          <div className="flex items-center gap-1">
            {/* Attach */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Attach files"
              aria-label="Attach files"
              className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-card-hover transition-colors disabled:opacity-50"
            >
              <Plus size={18} />
            </button>

            {/* GitHub */}
            <button
              type="button"
              title="GitHub"
              aria-label="GitHub"
              className="p-2 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-card-hover transition-colors"
              onClick={() => window.open("https://github.com", "_blank")}
            >
              <Github size={18} />
            </button>

            {/* Templates */}
            <div className="relative" ref={templatesRef}>
              <button
                type="button"
                title="Templates"
                aria-label="Templates"
                onClick={() => setTemplatesOpen((v) => !v)}
                className={`p-2 rounded-lg transition-colors ${templatesOpen ? "text-accent bg-accent/10" : "text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"}`}
              >
                <MessageSquare size={18} />
              </button>
              {templatesOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-64 bg-bg-card border border-border rounded-xl shadow-xl overflow-hidden animate-fade-in z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-[11px] font-semibold text-text-primary">Quick Templates</p>
                  </div>
                  <div className="py-1">
                    {PROMPT_TEMPLATES.map((t) => (
                      <button
                        key={t.label}
                        type="button"
                        onClick={() => {
                          setInput(t.prompt);
                          setTemplatesOpen(false);
                          inputRef.current?.focus();
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-card-hover hover:text-text-primary transition-colors"
                      >
                        <t.icon size={14} className="text-text-muted shrink-0" />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right icons */}
          <div className="flex items-center gap-1">
            {/* Microphone — Web Speech API */}
            <button
              type="button"
              title={isListening ? "Stop listening" : "Voice input"}
              aria-label={isListening ? "Stop listening" : "Voice input"}
              onClick={toggleVoice}
              disabled={sending}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                isListening
                  ? "text-danger bg-danger/10 animate-pulse"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"
              }`}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            {/* Send / Abort — circular button */}
            {sending ? (
              <button
                type="button"
                onClick={() => void handleAbort()}
                className="w-9 h-9 rounded-full bg-danger/80 hover:bg-danger flex items-center justify-center transition-colors"
                aria-label="Stop"
              >
                <Square size={14} className="text-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim() && attachedFiles.length === 0}
                className="w-9 h-9 rounded-full bg-accent hover:bg-accent/90 disabled:bg-bg-secondary disabled:text-text-muted flex items-center justify-center transition-colors"
                aria-label="Send"
              >
                <Send
                  size={14}
                  className={
                    input.trim() || attachedFiles.length > 0 ? "text-white" : "text-text-muted"
                  }
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Channel cross-continuity hint */}
      {activeSession?.channel && activeSession.channel !== "internal" && (
        <div className="px-4 pb-2 flex items-center gap-1.5 text-[10px] text-text-muted">
          <ChevronRight size={10} />
          <span>
            Linked to <strong className="text-accent">{activeSession.channel}</strong> — replies go
            to both.
          </span>
        </div>
      )}
    </div>
  );
}
