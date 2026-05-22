/**
 * Chat Feature — Right Panel (Manus-style "Clawdbot's Computer")
 *
 * Slim orchestrator composing:
 *   - DesktopView     — noVNC iframe, intervention overlay
 *   - TerminalView    — terminal-style output display
 *   - FullscreenDesktop — fullscreen modal with macOS-style chrome
 *
 * Plus inline header, status bar, playback timeline, and step indicator.
 */

import {
  Monitor,
  Terminal,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Settings,
  Wrench,
  Brain,
  Maximize2,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRpc } from "@/lib/rpc";
import type { Message, ToolEvent } from "./chat.types";
import type { ChatState } from "./useChatState";
import { friendlyLabel } from "./chat.constants";
import { DesktopView } from "./DesktopView";
import { FullscreenDesktop } from "./FullscreenDesktop";
import { TerminalView } from "./TerminalView";

type Props = Pick<
  ChatState,
  | "rightTab"
  | "setRightTab"
  | "sessionFiles"
  | "sending"
  | "totalTokens"
  | "contextLog"
  | "artifactPreview"
  | "modelDropdownOpen"
  | "setModelDropdownOpen"
  | "activeModelId"
  | "modelDropdownRef"
  | "switchModel"
  | "memoryContext"
  | "memoryLoading"
  | "recallMemory"
  | "input"
  | "messages"
  | "toolEvents"
  | "desktopViewMode"
  | "setDesktopViewMode"
>;

// ── Extract current tool status from messages ────────────────────────────────

interface ToolStatus {
  tool: string;
  action: string;
}

function extractCurrentTool(
  messages: Message[],
  sending: boolean,
  toolEvents?: ToolEvent[],
): ToolStatus | null {
  if (!sending) {
    return null;
  }

  // ── Primary: use structured tool events ──
  if (toolEvents && toolEvents.length > 0) {
    const last = toolEvents[toolEvents.length - 1];
    if (last) {
      const displayName = last.toolName.replace(/_/g, " ");
      const action = friendlyLabel(last.toolName);
      return {
        tool: displayName,
        action:
          last.status === "start"
            ? action
            : last.status === "error"
              ? `Error: ${displayName}`
              : action,
      };
    }
  }

  // ── Fallback: regex extraction from messages ──
  const lastAssistant = messages.toReversed().find((m) => m.role === "assistant" && m.streaming);
  if (!lastAssistant) {
    return null;
  }

  const toolMatches = (lastAssistant.content ?? "").match(/🔧\s*(\S+)/g) ?? [];
  if (toolMatches.length === 0) {
    return { tool: "thinking", action: "Processing your request..." };
  }

  const lastTool = toolMatches[toolMatches.length - 1]?.replace(/^🔧\s*/, "").trim() ?? "tool";
  const displayName = lastTool.replace(/_/g, " ");
  const action = friendlyLabel(lastTool);

  return { tool: displayName, action };
}

// ── Sandbox status type ─────────────────────────────────────────────────────

interface SandboxStatus {
  containerRunning: boolean;
  containerReady: boolean;
  novncAvailable?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ChatRightPanel(props: Props) {
  const { sending, messages, contextLog, toolEvents, desktopViewMode, setDesktopViewMode } = props;

  // Sandbox health polling
  const { data: sandboxData } = useRpc<{ ok: boolean } & SandboxStatus>(
    "republic.sandbox.status",
    {},
    [],
    { refetchIntervalMs: 30_000 },
  );

  const sandboxReady = sandboxData?.containerReady ?? false;
  const sandboxRunning = sandboxData?.containerRunning ?? false;

  // Shared intervention state
  const [intervening, setIntervening] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Playback state — step through toolEvents timeline
  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null); // null = live/latest
  const [autoPlaying, setAutoPlaying] = useState(false);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSteps = toolEvents?.length ?? 0;
  // Effective index for display: null means "latest"
  const currentStep = playbackIndex ?? (totalSteps > 0 ? totalSteps - 1 : 0);

  const stepBack = useCallback(() => {
    if (totalSteps === 0) return;
    setPlaybackIndex((prev) => {
      const cur = prev ?? totalSteps - 1;
      return Math.max(0, cur - 1);
    });
    setAutoPlaying(false);
  }, [totalSteps]);

  const stepForward = useCallback(() => {
    if (totalSteps === 0) return;
    setPlaybackIndex((prev) => {
      const cur = prev ?? totalSteps - 1;
      const next = cur + 1;
      if (next >= totalSteps) {
        return null; // back to live
      }
      return next;
    });
  }, [totalSteps]);

  const toggleAutoPlay = useCallback(() => {
    setAutoPlaying((v) => !v);
  }, []);

  // Auto-play interval
  useEffect(() => {
    if (autoPlaying && totalSteps > 0) {
      autoPlayRef.current = setInterval(() => {
        setPlaybackIndex((prev) => {
          const cur = prev ?? 0;
          const next = cur + 1;
          if (next >= totalSteps) {
            setAutoPlaying(false);
            return null; // reached end, go live
          }
          return next;
        });
      }, 1000);
    }
    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [autoPlaying, totalSteps]);

  // Reset playback when new events arrive during live
  useEffect(() => {
    if (sending && playbackIndex === null) {
      // stay at live
    }
  }, [sending, playbackIndex, totalSteps]);

  const toolStatus = useMemo(
    () => extractCurrentTool(messages, sending, toolEvents),
    [messages, sending, toolEvents],
  );

  // Compute tool progress for the timeline bar
  const toolProgress = useMemo(() => {
    if (!toolEvents || toolEvents.length === 0) {
      return sending ? 50 : 100;
    }
    const total = toolEvents.length;
    const done = toolEvents.filter((e) => e.status === "done" || e.status === "error").length;
    if (!sending && done === total) {
      return 100;
    }
    return Math.max(10, Math.round((done / Math.max(total, 1)) * 100));
  }, [toolEvents, sending]);

  return (
    <>
      <aside className="w-80 shrink-0 flex flex-col glass-regular glass-specular rounded-2xl overflow-hidden liquid-morph liquid-bounce">
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
          <h3 className="text-[13px] font-semibold text-text-primary">Clawdbot's Computer</h3>
          <div className="flex items-center gap-1">
            {/* Desktop / Terminal toggle */}
            <button
              type="button"
              onClick={() => setDesktopViewMode("desktop")}
              title="Desktop view (noVNC)"
              aria-label="Desktop view"
              className={`p-1 rounded-md transition-colors ${
                desktopViewMode === "desktop"
                  ? "text-accent bg-accent/10"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"
              }`}
            >
              <Monitor size={14} />
            </button>
            <button
              type="button"
              onClick={() => setDesktopViewMode("terminal")}
              title="Terminal view"
              aria-label="Terminal view"
              className={`p-1 rounded-md transition-colors ${
                desktopViewMode === "terminal"
                  ? "text-accent bg-accent/10"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"
              }`}
            >
              <Terminal size={14} />
            </button>
            {/* Fullscreen (only in desktop mode) */}
            {desktopViewMode === "desktop" && sandboxReady && (
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                title="Fullscreen desktop"
                aria-label="Fullscreen desktop"
                className="p-1 rounded-md transition-colors text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"
              >
                <Maximize2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ── Status Bar ───────────────────────────────────────────── */}
        {(sending || toolStatus) && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/50 bg-bg-input/50">
            {toolStatus?.tool === "thinking" ? (
              <Brain size={11} className="text-accent animate-pulse shrink-0" />
            ) : (
              <Settings
                size={11}
                className="text-text-muted animate-spin shrink-0"
                style={{ animationDuration: "3s" }}
              />
            )}
            <span className="text-[11px] text-text-secondary truncate">
              {toolStatus?.tool === "thinking"
                ? "Clawdbot is thinking…"
                : toolStatus
                  ? `Clawdbot is using ${toolStatus.tool}`
                  : "Clawdbot is thinking…"}
            </span>
            {toolStatus?.action && toolStatus.tool !== "thinking" && (
              <>
                <span className="text-[11px] text-text-muted/50">·</span>
                <span className="text-[11px] text-text-muted truncate">{toolStatus.action}</span>
              </>
            )}
          </div>
        )}

        {/* ── Content Area ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
          {desktopViewMode === "desktop" ? (
            <DesktopView
              isFullscreen={false}
              sandboxRunning={sandboxRunning}
              sandboxReady={sandboxReady}
              sending={sending}
              intervening={intervening}
              setIntervening={setIntervening}
            />
          ) : (
            <TerminalView messages={messages} sending={sending} />
          )}
        </div>

        {/* ── Playback Timeline ────────────────────────────────────────── */}
        <div className="border-t border-border px-3 py-2 shrink-0">
          <div className="flex items-center gap-2">
            {/* Step Back */}
            <button
              type="button"
              disabled={totalSteps === 0}
              onClick={stepBack}
              className={`p-0.5 transition-colors ${totalSteps === 0 ? "text-text-muted/40 cursor-not-allowed" : "text-text-muted hover:text-text-primary"}`}
              aria-label="Previous step"
            >
              <SkipBack size={14} />
            </button>

            {/* Play / Pause */}
            <button
              type="button"
              disabled={totalSteps === 0}
              onClick={toggleAutoPlay}
              className={`p-0.5 transition-colors ${totalSteps === 0 ? "text-text-muted/40 cursor-not-allowed" : autoPlaying ? "text-accent" : "text-text-muted hover:text-text-primary"}`}
              aria-label={autoPlaying ? "Pause playback" : "Play"}
            >
              {autoPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>

            {/* Step Forward */}
            <button
              type="button"
              disabled={totalSteps === 0}
              onClick={stepForward}
              className={`p-0.5 transition-colors ${totalSteps === 0 ? "text-text-muted/40 cursor-not-allowed" : "text-text-muted hover:text-text-primary"}`}
              aria-label="Next step"
            >
              <SkipForward size={14} />
            </button>

            {/* Timeline slider */}
            <div className="flex-1 relative h-1.5 rounded-full bg-bg-secondary overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${toolProgress}%` }}
              />
              {/* Playback position indicator */}
              {totalSteps > 0 && playbackIndex !== null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-accent shadow-sm transition-all duration-300"
                  style={{
                    left: `${(currentStep / Math.max(totalSteps - 1, 1)) * 100}%`,
                    marginLeft: "-5px",
                  }}
                />
              )}
            </div>

            {/* Step counter */}
            {totalSteps > 0 && (
              <span className="text-[9px] text-text-muted font-mono shrink-0 tabular-nums">
                {currentStep + 1}/{totalSteps}
              </span>
            )}

            {/* Live indicator */}
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${sending ? "bg-success animate-pulse" : playbackIndex !== null ? "bg-accent" : "bg-text-muted/30"}`}
              />
              <span
                className={`text-[10px] font-medium ${sending ? "text-success" : playbackIndex !== null ? "text-accent" : "text-text-muted"}`}
              >
                {sending ? "live" : playbackIndex !== null ? `step ${currentStep + 1}` : "idle"}
              </span>
            </div>
          </div>

          {/* Current step detail (when in playback mode) */}
          {playbackIndex !== null && toolEvents && toolEvents[currentStep] && (
            <div className="flex items-center gap-2 mt-1.5 px-1">
              <Settings size={10} className="text-text-muted shrink-0" />
              <span className="text-[10px] text-text-secondary truncate">
                {friendlyLabel(toolEvents[currentStep].toolName)}
              </span>
              <span
                className={`text-[9px] font-medium shrink-0 ${toolEvents[currentStep].status === "done" ? "text-success" : toolEvents[currentStep].status === "error" ? "text-danger" : "text-accent"}`}
              >
                {toolEvents[currentStep].status}
              </span>
            </div>
          )}
        </div>

        {/* ── Bottom Step Indicator ────────────────────────────────── */}
        {contextLog.length > 0 && (
          <div className="border-t border-border/50 px-4 py-2 flex items-center gap-2 shrink-0">
            <Wrench size={12} className="text-text-muted shrink-0" />
            <span className="text-[11px] text-text-secondary truncate flex-1">
              {contextLog[contextLog.length - 1]?.text ?? "Processing..."}
            </span>
            {toolEvents && toolEvents.length > 0 && (
              <span className="text-[10px] text-text-muted font-mono shrink-0">
                {toolEvents.filter((e) => e.status === "done").length}/{toolEvents.length}
              </span>
            )}
          </div>
        )}
      </aside>

      {/* Fullscreen overlay */}
      {fullscreen && (
        <FullscreenDesktop
          sending={sending}
          sandboxRunning={sandboxRunning}
          sandboxReady={sandboxReady}
          toolStatus={toolStatus}
          intervening={intervening}
          setIntervening={setIntervening}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
}
