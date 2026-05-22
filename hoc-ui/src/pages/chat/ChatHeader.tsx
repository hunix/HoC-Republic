/**
 * Chat Feature — Chat Header (Manus-style)
 *
 * Minimal header with:
 * - Centered model selector dropdown "Model Name ⌄"
 * - Right side: minimal action icons (collaborate, share, settings)
 */

import {
  ChevronDown,
  X,
  Brain,
  Zap,
  Share2,
  Pin,
  MoreHorizontal,
  PanelLeftClose,
  PanelRightClose,
  FileDown,
  FolderOpen,
  RefreshCw,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui";
import type { ChatState } from "./useChatState";
import { MODEL_OPTIONS } from "./chat.constants";

type Props = Pick<
  ChatState,
  | "activeKey"
  | "activeSession"
  | "citizens"
  | "modelDropdownOpen"
  | "setModelDropdownOpen"
  | "activeModelId"
  | "modelDropdownRef"
  | "switchModel"
  | "memoryPanelOpen"
  | "setMemoryPanelOpen"
  | "filesPanelOpen"
  | "setFilesPanelOpen"
  | "sessionFiles"
  | "totalTokens"
  | "handleExportPdf"
  | "clearView"
  | "leftPanelOpen"
  | "setLeftPanelOpen"
  | "rightPanelOpen"
  | "setRightPanelOpen"
  | "dualModelOpen"
  | "setDualModelOpen"
  | "thinkModelId"
  | "execModelId"
  | "setThinkModel"
  | "setExecModel"
>;

export function ChatHeader(props: Props) {
  const {
    activeKey,
    modelDropdownOpen,
    setModelDropdownOpen,
    activeModelId,
    modelDropdownRef,
    switchModel,
    handleExportPdf,
    clearView,
    leftPanelOpen,
    setLeftPanelOpen,
    rightPanelOpen,
    setRightPanelOpen,
    dualModelOpen,
    setDualModelOpen,
    thinkModelId,
    execModelId,
    setThinkModel,
    setExecModel,
    sessionFiles,
    totalTokens,
    setFilesPanelOpen,
    memoryPanelOpen,
    setMemoryPanelOpen,
  } = props;

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close more-menu on outside click
  useEffect(() => {
    if (!moreMenuOpen) {
      return;
    }
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreMenuOpen]);

  const currentModelLabel = activeModelId
    ? (MODEL_OPTIONS.find((o) => o.id === activeModelId)?.label ?? "Custom")
    : "Auto (Best Available)";

  return (
    <div className="px-4 py-2.5 border-b border-border/30 glass-thin glass-specular flex items-center justify-between shrink-0">
      {/* Left: sidebar toggle */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={() => setLeftPanelOpen((v) => !v)}
          title="Toggle sidebar (Ctrl+B)"
          aria-label="Toggle sidebar"
          className={`p-1.5 rounded-lg transition-colors ${leftPanelOpen ? "text-accent bg-accent/10" : "text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"}`}
        >
          <PanelLeftClose size={14} />
        </button>
      </div>

      {/* Center: Model selector */}
      <div className="relative flex-1 flex justify-center" ref={modelDropdownRef}>
        <button
          type="button"
          onClick={() => (activeKey ? setModelDropdownOpen((v) => !v) : undefined)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[13px] font-medium transition-colors ${
            modelDropdownOpen ? "text-accent" : "text-text-primary hover:text-accent"
          }`}
        >
          <span>{currentModelLabel}</span>
          <ChevronDown size={12} className="text-text-muted" />
        </button>

        {modelDropdownOpen && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-72 glass-regular glass-specular rounded-xl shadow-lg overflow-hidden liquid-bounce">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Select Model
              </p>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {MODEL_OPTIONS.map((opt) => {
                const isActive = opt.id === "auto" ? !activeModelId : activeModelId === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => void switchModel(opt)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors text-[12px] ${
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-bg-card-hover"
                    }`}
                  >
                    <span className="text-sm">{opt.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium truncate">{opt.label}</p>
                        {opt.maxTokens && opt.maxTokens !== "—" && (
                          <span className="text-[8px] px-1 rounded bg-bg-secondary text-text-muted font-mono shrink-0">
                            {opt.maxTokens}
                          </span>
                        )}
                      </div>
                      {opt.provider && <p className="text-[9px] text-text-muted">{opt.provider}</p>}
                    </div>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right: action icons */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Pin / Bookmark */}
        {activeKey && (
          <button
            type="button"
            onClick={() => setMemoryPanelOpen((v) => !v)}
            title="Memory recall"
            aria-label="Memory recall"
            className={`p-1.5 rounded-lg transition-colors ${
              memoryPanelOpen
                ? "text-accent bg-accent/10"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"
            }`}
          >
            <Pin size={14} />
          </button>
        )}

        {/* Share / Export */}
        {activeKey && (
          <button
            type="button"
            onClick={handleExportPdf}
            title="Share / Export"
            aria-label="Export chat"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-card-hover transition-colors"
          >
            <Share2 size={14} />
          </button>
        )}

        {/* Right panel toggle */}
        <button
          type="button"
          onClick={() => setRightPanelOpen((v) => !v)}
          title="Toggle computer panel (Ctrl+I)"
          aria-label="Toggle computer panel"
          className={`p-1.5 rounded-lg transition-colors ${rightPanelOpen ? "text-accent bg-accent/10" : "text-text-muted hover:text-text-secondary hover:bg-bg-card-hover"}`}
        >
          <PanelRightClose size={14} />
        </button>

        {/* More menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            title="More options"
            aria-label="More options"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-secondary hover:bg-bg-card-hover transition-colors"
          >
            <MoreHorizontal size={14} />
          </button>

          {moreMenuOpen && (
            <div
              ref={moreMenuRef}
              className="absolute right-0 top-full mt-1 z-50 w-56 glass-regular glass-specular rounded-xl shadow-lg overflow-hidden liquid-bounce"
            >
              {/* Files */}
              <button
                type="button"
                onClick={() => {
                  setFilesPanelOpen((v) => !v);
                  setMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-card-hover transition-colors"
              >
                <FolderOpen size={13} className="text-text-muted" />
                <span>Session Files</span>
                {sessionFiles.length > 0 && (
                  <Badge variant="neutral" className="!text-[8px] !py-0 ml-auto">
                    {sessionFiles.length}
                  </Badge>
                )}
              </button>

              {/* Think/Exec */}
              <button
                type="button"
                onClick={() => {
                  setDualModelOpen((v) => !v);
                  setMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-card-hover transition-colors"
              >
                <Brain size={13} className="text-text-muted" />
                <span>Think/Exec Models</span>
                {(thinkModelId || execModelId) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-purple ml-auto shrink-0" />
                )}
              </button>

              {/* Token count */}
              {totalTokens > 0 && (
                <div className="flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-muted">
                  <Zap size={13} className="text-warning" />
                  <span>{totalTokens.toLocaleString()} tokens</span>
                </div>
              )}

              <div className="border-t border-border" />

              {/* Export */}
              <button
                type="button"
                onClick={() => {
                  handleExportPdf();
                  setMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-card-hover transition-colors"
              >
                <FileDown size={13} className="text-text-muted" />
                <span>Export to PDF</span>
              </button>

              {/* Clear */}
              <button
                type="button"
                onClick={() => {
                  clearView();
                  setMoreMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-card-hover transition-colors"
              >
                <RefreshCw size={13} className="text-text-muted" />
                <span>Clear view</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Dual-Model Panel (overlay) ──────────────────────────── */}
      {dualModelOpen && (
        <div className="absolute right-16 top-14 z-50 w-80 glass-regular glass-specular rounded-xl shadow-lg liquid-bounce">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Brain size={12} className="text-purple" />
              <Zap size={12} className="text-warning" />
              <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
                Dual-Model Routing
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDualModelOpen(false)}
              className="p-0.5 rounded hover:bg-bg-secondary text-text-muted"
              aria-label="Close"
            >
              <X size={10} />
            </button>
          </div>
          <div className="p-3 space-y-3">
            <div>
              <p className="text-[9px] font-semibold text-purple mb-1 flex items-center gap-1">
                <Brain size={10} /> THINK — Planning & Reasoning
              </p>
              <select
                value={thinkModelId ?? ""}
                onChange={(e) => setThinkModel(e.target.value || null)}
                className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-[10px] text-text-primary focus:border-purple focus:outline-none"
              >
                <option value="">Default (same as selected)</option>
                {MODEL_OPTIONS.filter((o) => o.id !== "auto").map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.icon} {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-[9px] font-semibold text-warning mb-1 flex items-center gap-1">
                <Zap size={10} /> EXEC — Building & Coding
              </p>
              <select
                value={execModelId ?? ""}
                onChange={(e) => setExecModel(e.target.value || null)}
                className="w-full bg-bg-input border border-border rounded-lg px-2 py-1.5 text-[10px] text-text-primary focus:border-warning focus:outline-none"
              >
                <option value="">Default (same as selected)</option>
                {MODEL_OPTIONS.filter((o) => o.id !== "auto").map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.icon} {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="pt-2 border-t border-border/30 space-y-1">
              <p className="text-[8px] text-text-muted leading-relaxed">
                <strong>Auto-routed:</strong> First iteration uses THINK model for planning,
                subsequent iterations use EXEC model for building.
              </p>
              {(thinkModelId || execModelId) && (
                <button
                  type="button"
                  onClick={() => {
                    setThinkModel(null);
                    setExecModel(null);
                  }}
                  className="text-[9px] text-danger hover:text-danger/80 transition-colors"
                >
                  Reset to single model
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
