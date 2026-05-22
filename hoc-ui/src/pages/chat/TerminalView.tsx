/**
 * Chat Feature — Terminal View Sub-Component
 *
 * Renders the terminal-style output from the latest assistant message
 * with file header detection and auto-scroll to bottom.
 *
 * Extracted from ChatRightPanel.tsx per DDD file limits (300L max for components).
 */

import { Monitor, Loader2, FileText } from "lucide-react";
import { useRef, useEffect, useMemo } from "react";
import type { Message } from "./chat.types";

interface TerminalViewProps {
  messages: Message[];
  sending: boolean;
}

/** Extract terminal-like output from the latest assistant message */
function extractTerminalOutput(messages: Message[]): string {
  const lastAssistant = messages.toReversed().find((m) => m.role === "assistant");
  if (!lastAssistant) {
    return "";
  }
  const lines = (lastAssistant.content ?? "").split("\n");
  const tail = lines.slice(-30);
  return tail.join("\n");
}

export function TerminalView({ messages, sending }: TerminalViewProps) {
  const terminalOutput = useMemo(() => extractTerminalOutput(messages), [messages]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sending && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalOutput, sending]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {terminalOutput ? (
        <div className="flex-1 p-3 overflow-y-auto">
          {/* File name header (if detected) */}
          {(() => {
            const fileMatch =
              /(?:Writing|Creating|Editing)\s+(?:file:?\s*)?([^\s]+\.\w{2,5})/i.exec(
                terminalOutput,
              );
            if (fileMatch?.[1]) {
              return (
                <div className="flex items-center gap-2 mb-2 px-2 py-1 rounded-lg bg-bg-secondary border border-border/50">
                  <FileText size={11} className="text-text-muted shrink-0" />
                  <span className="text-[10px] text-text-muted font-mono truncate">
                    {fileMatch[1]}
                  </span>
                </div>
              );
            }
            return null;
          })()}

          {/* Terminal content */}
          <pre className="text-[11px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed break-words">
            {terminalOutput}
          </pre>
          <div ref={terminalEndRef} />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <Monitor size={32} className="text-text-muted/30" />
          <p className="text-[11px] text-text-muted text-center">
            {sending
              ? "Waiting for output..."
              : "Start a task to see Clawdbot's computer activity here."}
          </p>
          {sending && <Loader2 size={16} className="animate-spin text-accent" />}
        </div>
      )}
    </div>
  );
}
