/**
 * Chat Page — Orchestrator (Manus-style)
 *
 * Thin composition layer that wires the sub-modules together.
 * All state lives in `useChatState`, all UI in the sub-components.
 *
 * Layout: [LeftSidebar] [ChatPanel + StepTracker] [RightPanel]
 */

import { Bot, Loader2, Brain, FolderOpen } from "lucide-react";
import React, { useRef, useState, useEffect } from "react";
import { SandboxPreviewCard } from "@/components/SandboxPreviewCard";
import { Badge } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { SessionFile } from "./chat/chat.types";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatInputBar } from "./chat/ChatInputBar";
import { ChatLeftSidebar } from "./chat/ChatLeftSidebar";
import { ChatMessages } from "./chat/ChatMessages";
import { ChatRightPanel } from "./chat/ChatRightPanel";
import { StepTracker } from "./chat/StepTracker";
import { useChatState } from "./chat/useChatState";

// ── Page Component ──────────────────────────────────────────────────────────

export function ChatPage() {
  const chat = useChatState();
  const touchStartX = useRef<number | null>(null);

  // Only show the sandbox preview iframe when the sandbox web server is actually
  // reachable. Without this gate the iframe loads `/sandbox/` which 502s when
  // nothing is listening, and the Vite SPA catch-all serves the HoC UI itself
  // inside the iframe — creating the "nested HoC / Not Found" appearance.
  const [sandboxReachable, setSandboxReachable] = useState(false);
  useEffect(() => {
    if (!chat.sending) {
      // Schedule the state update for the next microtask to avoid
      // synchronous setState within the effect body.
      const id = setTimeout(() => setSandboxReachable(false), 0);
      return () => clearTimeout(id);
    }
    const ac = new AbortController();
    const probe = async () => {
      try {
        const resp = await fetch("/sandbox/", {
          method: "HEAD",
          signal: ac.signal,
        });
        if (ac.signal.aborted) {
          return;
        }
        if (!resp.ok) {
          setSandboxReachable(false);
          return;
        }
        // HEAD can't check body — if we get 200, assume sandbox is alive.
        // The SandboxPreviewCard has its own deeper probe for SPA detection.
        setSandboxReachable(true);
      } catch {
        if (!ac.signal.aborted) {
          setSandboxReachable(false);
        }
      }
    };
    // Probe immediately, then every 5s while sending
    void probe();
    const iv = setInterval(() => {
      void probe();
    }, 5000);
    return () => {
      ac.abort();
      clearInterval(iv);
    };
  }, [chat.sending]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) {
      return;
    }
    const endX = e.changedTouches[0].clientX;
    const diff = endX - touchStartX.current;

    if (diff > 75) {
      if (!chat.leftPanelOpen) {
        chat.setLeftPanelOpen(true);
      } else if (chat.rightPanelOpen) {
        chat.setRightPanelOpen(false);
      }
    } else if (diff < -75) {
      if (chat.leftPanelOpen) {
        chat.setLeftPanelOpen(false);
      } else if (!chat.rightPanelOpen) {
        chat.setRightPanelOpen(true);
      }
    }
    touchStartX.current = null;
  };

  return (
    <div
      className="animate-slide-up flex h-[calc(100vh-6rem)] gap-2 overflow-hidden touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* ── Left Sidebar ─────────────────────────────────────────────────── */}
      <ChatLeftSidebar
        leftPanelOpen={chat.leftPanelOpen}
        setLeftPanelOpen={chat.setLeftPanelOpen}
        sessions={chat.sessions}
        sessionsLoading={chat.sessionsLoading}
        citizens={chat.citizens}
        activeKey={chat.activeKey}
        sidebarTab={chat.sidebarTab}
        setSidebarTab={chat.setSidebarTab}
        sessionSearch={chat.sessionSearch}
        citizenSearch={chat.citizenSearch}
        setCitizenSearch={chat.setCitizenSearch}
        switchSession={chat.switchSession}
        newConversation={chat.newConversation}
        handleSearchChange={chat.handleSearchChange}
        setConfirmDeleteKey={chat.setConfirmDeleteKey}
        refetchSessions={chat.refetchSessions}
      />

      {/* ── Chat panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col glass-regular glass-specular rounded-2xl overflow-hidden min-w-0">
        <ChatHeader
          activeKey={chat.activeKey}
          activeSession={chat.activeSession}
          citizens={chat.citizens}
          modelDropdownOpen={chat.modelDropdownOpen}
          setModelDropdownOpen={chat.setModelDropdownOpen}
          activeModelId={chat.activeModelId}
          modelDropdownRef={chat.modelDropdownRef}
          switchModel={chat.switchModel}
          memoryPanelOpen={chat.memoryPanelOpen}
          setMemoryPanelOpen={chat.setMemoryPanelOpen}
          filesPanelOpen={chat.filesPanelOpen}
          setFilesPanelOpen={chat.setFilesPanelOpen}
          sessionFiles={chat.sessionFiles}
          totalTokens={chat.totalTokens}
          handleExportPdf={chat.handleExportPdf}
          clearView={chat.clearView}
          leftPanelOpen={chat.leftPanelOpen}
          setLeftPanelOpen={chat.setLeftPanelOpen}
          rightPanelOpen={chat.rightPanelOpen}
          setRightPanelOpen={chat.setRightPanelOpen}
          dualModelOpen={chat.dualModelOpen}
          setDualModelOpen={chat.setDualModelOpen}
          thinkModelId={chat.thinkModelId}
          execModelId={chat.execModelId}
          setThinkModel={chat.setThinkModel}
          setExecModel={chat.setExecModel}
        />

        {/* Inline memory panel */}
        {chat.memoryPanelOpen && chat.activeKey && (
          <div className="border-b border-border/30 px-5 py-3 glass-thin">
            <div className="flex items-center gap-2 mb-2">
              <Brain size={12} className="text-accent" />
              <span className="text-[11px] font-semibold text-text-primary">
                Recalled Memory Context
              </span>
              {chat.memoryLoading && <Loader2 size={10} className="animate-spin text-text-muted" />}
              <button
                type="button"
                onClick={() =>
                  void chat.recallMemory(
                    chat.input ||
                      chat.messages[chat.messages.length - 1]?.content ||
                      "recent context",
                  )
                }
                className="ml-auto text-[10px] text-accent hover:underline"
              >
                Refresh
              </button>
            </div>
            {chat.memoryContext ? (
              <div className="text-[11px] text-text-secondary whitespace-pre-wrap max-h-32 overflow-y-auto leading-relaxed rounded-lg bg-bg-card p-2 border border-border">
                {chat.memoryContext}
              </div>
            ) : (
              <p className="text-[11px] text-text-muted italic">
                {chat.memoryLoading
                  ? "Searching memory…"
                  : "No memories recalled yet — type a message to search."}
              </p>
            )}
          </div>
        )}

        {/* Messages area */}
        <ChatMessages
          activeKey={chat.activeKey}
          messages={chat.messages}
          historyLoading={chat.historyLoading}
          sending={chat.sending}
          copiedMsgId={chat.copiedMsgId}
          pinningMsgId={chat.pinningMsgId}
          endRef={chat.endRef}
          inputRef={chat.inputRef}
          newConversation={chat.newConversation}
          setLeftPanelOpen={chat.setLeftPanelOpen}
          setInput={chat.setInput}
          copyMessage={chat.copyMessage}
          pinMemory={chat.pinMemory}
          setConfirmDeleteMsgId={chat.setConfirmDeleteMsgId}
          sessionFiles={chat.sessionFiles}
          onViewAllFiles={() => chat.setFilesPanelOpen(true)}
        />

        {/* Inline files panel */}
        {chat.filesPanelOpen && <InlineFilesPanel files={chat.sessionFiles} />}

        {/* Live sandbox preview (visible only when sandbox web server is reachable) */}
        {chat.sending && sandboxReachable && (
          <div className="border-t border-border shrink-0 px-4 pb-2">
            <SandboxPreviewCard url="/sandbox/" title="Live Agent Desktop" />
          </div>
        )}

        {/* Step tracker (Manus-style) */}
        <StepTracker messages={chat.messages} sending={chat.sending} toolEvents={chat.toolEvents} />

        {/* Input bar */}
        <ChatInputBar
          activeKey={chat.activeKey}
          activeSession={chat.activeSession}
          input={chat.input}
          setInput={chat.setInput}
          placeholder={chat.placeholder}
          sending={chat.sending}
          attachedFiles={chat.attachedFiles}
          inputRef={chat.inputRef}
          fileInputRef={chat.fileInputRef}
          handleSend={chat.handleSend}
          handleAbort={chat.handleAbort}
          handleKeyDown={chat.handleKeyDown}
          handleFileSelect={chat.handleFileSelect}
          removeAttachment={chat.removeAttachment}
          activeModelId={chat.activeModelId}
        />
      </div>

      {/* ── Right Panel ──────────────────────────────────────────────────── */}
      {chat.rightPanelOpen && (
        <ChatRightPanel
          rightTab={chat.rightTab}
          setRightTab={chat.setRightTab}
          sessionFiles={chat.sessionFiles}
          sending={chat.sending}
          totalTokens={chat.totalTokens}
          contextLog={chat.contextLog}
          artifactPreview={chat.artifactPreview}
          modelDropdownOpen={chat.modelDropdownOpen}
          setModelDropdownOpen={chat.setModelDropdownOpen}
          activeModelId={chat.activeModelId}
          modelDropdownRef={chat.modelDropdownRef}
          switchModel={chat.switchModel}
          memoryContext={chat.memoryContext}
          memoryLoading={chat.memoryLoading}
          recallMemory={chat.recallMemory}
          input={chat.input}
          messages={chat.messages}
          toolEvents={chat.toolEvents}
          desktopViewMode={chat.desktopViewMode}
          setDesktopViewMode={chat.setDesktopViewMode}
        />
      )}

      {/* ── Confirm dialogs ─────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!chat.confirmDeleteKey}
        title="Delete session?"
        message="This will permanently delete this conversation's history."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (chat.confirmDeleteKey) {
            void chat.deleteSession(chat.confirmDeleteKey);
          }
        }}
        onCancel={() => chat.setConfirmDeleteKey(null)}
      />
      <ConfirmDialog
        open={!!chat.confirmDeleteMsgId}
        title="Delete message?"
        message="This removes the message from view. The original transcript is preserved."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (chat.confirmDeleteMsgId) {
            chat.deleteMessage(chat.confirmDeleteMsgId);
          }
        }}
        onCancel={() => chat.setConfirmDeleteMsgId(null)}
      />
    </div>
  );
}

// ── Inline Files Panel (small helper, kept here) ──────────────────────────────

function InlineFilesPanel({ files }: { files: SessionFile[] }) {
  return (
    <div className="border-t border-border/30 p-4 shrink-0 max-h-48 overflow-y-auto glass-thin">
      <div className="flex items-center gap-2 mb-2">
        <FolderOpen size={12} className="text-accent" />
        <span className="text-[11px] font-semibold text-text-primary">Session Files</span>
        {files.length > 0 && (
          <Badge variant="neutral" className="!text-[8px] !py-0">
            {files.length}
          </Badge>
        )}
      </div>
      {files.length === 0 ? (
        <p className="text-[11px] text-text-muted py-2">
          No files detected in this conversation yet. Files created by the agent will appear here
          automatically.
        </p>
      ) : (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-card transition-colors"
            >
              <Bot size={12} className="text-text-muted shrink-0" />
              <span className="text-[11px] text-text-secondary truncate flex-1">{f.name}</span>
              {f.size && <span className="text-[9px] text-text-muted">{f.size}</span>}
              {f.downloadUrl && (
                <a
                  href={f.downloadUrl}
                  download={f.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent/15 text-[9px] text-accent hover:bg-accent/25 transition-colors border border-accent/30 no-underline"
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Download
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
