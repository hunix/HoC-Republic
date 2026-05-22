/**
 * Chat Feature — Desktop View Sub-Component
 *
 * Renders the noVNC iframe for the sandbox desktop with:
 * - Loading/offline/error states
 * - Agent intervention overlay (OTP/Captcha)
 * - Intervention active banner
 *
 * Extracted from ChatRightPanel.tsx per DDD file limits (300L max for components).
 */

import { Monitor, Loader2, MousePointer, Hand } from "lucide-react";
import { useState, useCallback } from "react";

const NOVNC_URL =
  "/sandbox-novnc/vnc_lite.html?autoconnect=true&resize=remote&path=sandbox-novnc/websockify";

interface DesktopViewProps {
  isFullscreen: boolean;
  sandboxRunning: boolean;
  sandboxReady: boolean;
  sending: boolean;
  intervening: boolean;
  setIntervening: (v: boolean) => void;
}

export function DesktopView({
  isFullscreen,
  sandboxRunning,
  sandboxReady,
  sending,
  intervening,
  setIntervening,
}: DesktopViewProps) {
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);

  const effectiveIntervening = sending && intervening;

  const reloadIframe = useCallback(() => {
    setIframeKey((k) => k + 1);
    setIframeError(false);
    setIframeLoading(true);
  }, []);

  if (!sandboxRunning) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <Monitor size={isFullscreen ? 48 : 32} className="text-text-muted/30" />
        <p className={`${isFullscreen ? "text-sm" : "text-[11px]"} text-text-muted text-center`}>
          Sandbox container is offline.
        </p>
        <p className={`${isFullscreen ? "text-xs" : "text-[10px]"} text-text-muted/60 text-center`}>
          It will start automatically when needed.
        </p>
      </div>
    );
  }

  if (!sandboxReady) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
        <Loader2 size={isFullscreen ? 28 : 20} className="animate-spin text-accent" />
        <p className={`${isFullscreen ? "text-sm" : "text-[11px]"} text-text-muted text-center`}>
          Sandbox container starting…
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative min-h-0 flex flex-col">
      {/* noVNC iframe — always mounted, never unmounted */}
      {iframeLoading && !iframeError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-input">
          <div className="text-center">
            <Loader2 size={20} className="animate-spin text-accent mx-auto mb-1" />
            <p className="text-[10px] text-text-muted">Connecting to desktop…</p>
          </div>
        </div>
      )}
      {iframeError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg-input">
          <div className="text-center">
            <Monitor size={20} className="text-text-muted mx-auto mb-1" />
            <p className="text-[10px] text-text-muted mb-2">Desktop connection lost</p>
            <button
              type="button"
              onClick={reloadIframe}
              className="text-[10px] text-accent hover:underline"
            >
              Reconnect
            </button>
          </div>
        </div>
      )}
      <iframe
        key={iframeKey}
        src={NOVNC_URL}
        title="Agent Sandbox Desktop"
        className="flex-1 w-full border-0 bg-black"
        style={{
          minHeight: isFullscreen ? "calc(100vh - 120px)" : "300px",
          pointerEvents: sending && !effectiveIntervening ? "none" : "auto",
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
        onLoad={() => {
          setIframeLoading(false);
          setIframeError(false);
        }}
        onError={() => {
          setIframeLoading(false);
          setIframeError(true);
        }}
      />

      {/* Intervention overlay */}
      {sending && !effectiveIntervening && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent px-3 py-2.5 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span className="text-[10px] text-white/80 font-medium">Agent is working</span>
          </div>
          <button
            type="button"
            onClick={() => setIntervening(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 backdrop-blur-sm text-[10px] text-white font-medium transition-all border border-white/20"
          >
            <MousePointer size={10} />
            Intervene (OTP / Captcha)
          </button>
        </div>
      )}

      {/* Intervention active banner */}
      {sending && effectiveIntervening && (
        <div className="absolute top-0 left-0 right-0 bg-warning/90 px-3 py-2 flex items-center justify-between z-20">
          <div className="flex items-center gap-2">
            <Hand size={12} className="text-black" />
            <span className="text-[11px] text-black font-semibold">
              You have control — type OTP / solve captcha
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIntervening(false)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/20 hover:bg-black/30 text-[10px] text-black font-medium transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
