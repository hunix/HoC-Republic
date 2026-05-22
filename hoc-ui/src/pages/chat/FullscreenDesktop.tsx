/**
 * Chat Feature — Fullscreen Desktop Modal
 *
 * Renders the fullscreen overlay for the sandbox desktop with:
 * - macOS-style traffic lights header
 * - Status bar showing current tool
 * - Full-height noVNC desktop via DesktopView
 * - Intervention controls
 * - Escape key to exit
 *
 * Extracted from ChatRightPanel.tsx per DDD file limits (300L max for components).
 */

import { Monitor, X, Brain, Settings, MousePointer, Hand } from "lucide-react";
import { useEffect } from "react";
import { DesktopView } from "./DesktopView";

interface ToolStatus {
  tool: string;
  action: string;
}

interface FullscreenDesktopProps {
  sending: boolean;
  sandboxRunning: boolean;
  sandboxReady: boolean;
  toolStatus: ToolStatus | null;
  intervening: boolean;
  setIntervening: (v: boolean) => void;
  onClose: () => void;
}

export function FullscreenDesktop({
  sending,
  sandboxRunning,
  sandboxReady,
  toolStatus,
  intervening,
  setIntervening,
  onClose,
}: FullscreenDesktopProps) {
  const effectiveIntervening = sending && intervening;

  // Lock body scroll + Escape key to exit
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/95 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Fullscreen Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-danger/70" />
            <span className="w-3 h-3 rounded-full bg-warning/70" />
            <span className="w-3 h-3 rounded-full bg-success/70" />
          </div>
          <Monitor size={14} className="text-text-muted" />
          <span className="text-xs text-text-primary font-semibold">Clawdbot's Desktop</span>
          {sending && (
            <>
              <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-[10px] text-success font-medium">Live</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sending && !effectiveIntervening && (
            <button
              type="button"
              onClick={() => setIntervening(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-warning/20 hover:bg-warning/30 text-[11px] text-warning font-medium transition-colors border border-warning/30"
            >
              <MousePointer size={11} />
              Intervene
            </button>
          )}
          {sending && effectiveIntervening && (
            <button
              type="button"
              onClick={() => setIntervening(false)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-success/20 hover:bg-success/30 text-[11px] text-success font-medium transition-colors border border-success/30"
            >
              <Hand size={11} />
              Done Intervening
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Exit fullscreen"
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Fullscreen status */}
      {(sending || toolStatus) && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50 bg-bg-input/50 shrink-0">
          {toolStatus?.tool === "thinking" ? (
            <Brain size={12} className="text-accent animate-pulse shrink-0" />
          ) : (
            <Settings
              size={12}
              className="text-text-muted animate-spin shrink-0"
              style={{ animationDuration: "3s" }}
            />
          )}
          <span className="text-xs text-text-secondary truncate">
            {toolStatus?.tool === "thinking"
              ? "Clawdbot is thinking…"
              : toolStatus
                ? `Clawdbot is using ${toolStatus.tool}`
                : "Clawdbot is thinking…"}
          </span>
          {toolStatus?.action && toolStatus.tool !== "thinking" && (
            <>
              <span className="text-xs text-text-muted/50">·</span>
              <span className="text-xs text-text-muted truncate">{toolStatus.action}</span>
            </>
          )}
        </div>
      )}

      {/* Fullscreen content */}
      <div className="flex-1 overflow-hidden relative">
        <DesktopView
          isFullscreen
          sandboxRunning={sandboxRunning}
          sandboxReady={sandboxReady}
          sending={sending}
          intervening={intervening}
          setIntervening={setIntervening}
        />
      </div>
    </div>
  );
}
