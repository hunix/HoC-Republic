import { useState, useRef, useEffect } from "react";
import { Maximize2, Minimize2, RefreshCw, ExternalLink, Monitor, Loader2, X, WifiOff } from "lucide-react";

interface SandboxPreviewCardProps {
  url: string;
  title?: string;
}

/**
 * Inline preview card that appears inside the chat thread when a sandbox task
 * produces a web output (preview URL). Shows a live iframe thumbnail with
 * maximize-to-fullscreen capability.
 */
export function SandboxPreviewCard({ url, title = "Sandbox Preview" }: SandboxPreviewCardProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [sandboxAlive, setSandboxAlive] = useState<boolean | null>(null); // null = probing
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Route through gateway proxy to avoid X-Frame-Options / CORS blocks
  let fixedUrl = url.replace(/\blocalhost\b/g, "127.0.0.1");
  if (fixedUrl.includes(":6080") || fixedUrl.includes(":6081")) {
    fixedUrl = fixedUrl.replace(/https?:\/\/127\.0\.0\.1:\d+\/?/, "/sandbox-novnc/");
    if (!fixedUrl.includes("path=")) {
      fixedUrl += fixedUrl.includes("?") ? "&path=sandbox-novnc/websockify" : "?path=sandbox-novnc/websockify";
    }
    if (!fixedUrl.includes("autoconnect=")) { fixedUrl += "&autoconnect=true"; }
    if (!fixedUrl.includes("resize=")) { fixedUrl += "&resize=remote"; }
  } else {
    fixedUrl = fixedUrl.replace(/https?:\/\/127\.0\.0\.1:\d+\/?/, "/sandbox/");
  }

  // ── Probe: verify that the sandbox is actually alive (not the SPA catch-all) ──
  // The gateway returns 502 when the sandbox container is down. The SPA catch-all
  // returns 200 with text/html and the React app — if we detect that, hide.
  useEffect(() => {
    let cancelled = false;
    setSandboxAlive(null);
    const probe = async () => {
      try {
        const resp = await fetch(fixedUrl, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });
        if (cancelled) { return; }
        // 502 / 503 = sandbox container is down
        if (!resp.ok) {
          setSandboxAlive(false);
          return;
        }
        // Check if the response is the SPA catch-all (React app's index.html)
        // Real sandbox content will be file listings, JSON, or non-SPA HTML
        const ct = resp.headers.get("content-type") ?? "";
        if (ct.includes("text/html")) {
          const body = await resp.text();
          // Detect the HoC React SPA by checking for its unique markers
          if (body.includes("__OPENCLAW_ASSISTANT_NAME__") || body.includes("House of Clawdbot") || body.includes("hoc-ui")) {
            setSandboxAlive(false); // This is the SPA, not real sandbox content
            return;
          }
        }
        setSandboxAlive(true);
      } catch {
        if (!cancelled) { setSandboxAlive(false); }
      }
    };
    void probe();
    return () => { cancelled = true; };
  }, [fixedUrl, reloadKey]);

  function reload() {
    setLoading(true);
    setError(false);
    setReloadKey((k) => k + 1);
  }

  useEffect(() => {
    if (fullscreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [fullscreen]);

  // ── Sandbox offline state ──
  if (sandboxAlive === null) {
    return (
      <div className="relative w-full mt-2 rounded-xl overflow-hidden border border-border/50 bg-bg-input shadow-lg">
        <div className="flex items-center justify-center gap-2 py-6">
          <Loader2 size={14} className="animate-spin text-accent" />
          <span className="text-[11px] text-text-muted">Checking sandbox…</span>
        </div>
      </div>
    );
  }

  if (sandboxAlive === false) {
    return (
      <div className="relative w-full mt-2 rounded-xl overflow-hidden border border-border/30 bg-bg-input/50 shadow-sm">
        <div className="flex items-center justify-between px-3 py-1.5 bg-bg-card/50 border-b border-border/30">
          <div className="flex items-center gap-2">
            <WifiOff size={11} className="text-text-muted" />
            <span className="text-[10px] text-text-muted font-mono">{title}</span>
          </div>
          <button
            type="button"
            onClick={reload}
            aria-label="Retry sandbox probe"
            className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-bg-input transition-colors"
          >
            <RefreshCw size={11} />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2 py-5">
          <Monitor size={14} className="text-text-muted/50" />
          <span className="text-[11px] text-text-muted">Sandbox container offline</span>
        </div>
      </div>
    );
  }

  const thumbnail = (
    <div className="relative group w-full mt-2 rounded-xl overflow-hidden border border-border/50 bg-bg-input shadow-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-bg-card border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-danger/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Monitor size={11} className="text-text-muted shrink-0" />
            <span className="text-[10px] text-text-muted font-mono truncate max-w-[180px]">{fixedUrl}</span>
          </div>
          {loading && !error && (
            <Loader2 size={10} className="animate-spin text-accent shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={reload}
            aria-label="Reload preview"
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-input transition-colors"
          >
            <RefreshCw size={11} />
          </button>
          <a
            href={fixedUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in new tab"
            className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-input transition-colors"
          >
            <ExternalLink size={11} />
          </a>
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            aria-label="Maximize preview"
            className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </div>

      {/* Thumbnail iframe */}
      <div className="relative w-full" style={{ height: "200px" }}>
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-input z-10">
            <div className="text-center">
              <Loader2 size={20} className="animate-spin text-accent mx-auto mb-1" />
              <p className="text-[10px] text-text-muted">Loading preview…</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-input z-10">
            <div className="text-center">
              <Monitor size={20} className="text-text-muted mx-auto mb-1" />
              <p className="text-[10px] text-text-muted mb-1">Preview unavailable</p>
              <button
                type="button"
                onClick={reload}
                className="text-[10px] text-accent hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={fixedUrl}
          title={title}
          className="w-full h-full border-none bg-white"
          style={{
            // Scale down to show as thumbnail but keep full layout
            transformOrigin: "top left",
            transform: "scale(0.6)",
            width: "167%",
            height: "167%",
          }}
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
        />
        {/* Click overlay to maximize */}
        <button
          type="button"
          aria-label="Click to expand preview"
          onClick={() => setFullscreen(true)}
          className="absolute inset-0 z-20 opacity-0 hover:opacity-100 flex items-center justify-center bg-black/30 transition-all cursor-zoom-in"
        >
          <div className="bg-bg-card/90 backdrop-blur rounded-xl px-3 py-2 flex items-center gap-2 shadow-lg border border-border">
            <Maximize2 size={14} className="text-accent" />
            <span className="text-xs text-text-primary font-medium">Expand</span>
          </div>
        </button>
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-bg-card/50 border-t border-border/30 flex items-center justify-between">
        <span className="text-[9px] text-text-muted font-mono">{title}</span>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[9px] text-success">Live</span>
        </div>
      </div>
    </div>
  );

  const fullscreenModal = fullscreen ? (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) { setFullscreen(false); } }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-danger/70" />
            <span className="w-3 h-3 rounded-full bg-warning/70" />
            <span className="w-3 h-3 rounded-full bg-success/70" />
          </div>
          <Monitor size={14} className="text-text-muted" />
          <span className="text-xs text-text-muted font-mono truncate max-w-sm">{fixedUrl}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reload}
            aria-label="Reload"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-input transition-colors"
          >
            <RefreshCw size={14} />
          </button>
          <a
            href={fixedUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open in new tab"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-input transition-colors"
          >
            <ExternalLink size={14} />
          </a>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Minimize"
            className="p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
          >
            <Minimize2 size={14} />
          </button>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Close"
            className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-primary z-10">
            <div className="text-center">
              <Loader2 size={32} className="animate-spin text-accent mx-auto mb-3" />
              <p className="text-sm text-text-muted">Loading preview…</p>
            </div>
          </div>
        )}
        <iframe
          key={`fs-${reloadKey}`}
          src={fixedUrl}
          title={`${title} (fullscreen)`}
          className="w-full h-full border-none bg-white"
          onLoad={() => { setLoading(false); setError(false); }}
          onError={() => { setLoading(false); setError(true); }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
          allowFullScreen
        />
      </div>
    </div>
  ) : null;

  return (
    <>
      {thumbnail}
      {fullscreenModal}
    </>
  );
}

/**
 * Extract sandbox preview URL from a message string.
 * The gateway injects [SANDBOX_PREVIEW:url] at the end of result messages
 * when the sandbox preview port is reachable.
 */
export function extractSandboxPreviewUrl(content: string): string | null {
  const match = /\[SANDBOX_PREVIEW:([^\]]+)\]/.exec(content);
  return match ? (match[1] ?? null) : null;
}

/**
 * Strip the [SANDBOX_PREVIEW:url] marker from display text.
 */
export function stripSandboxPreviewMarker(content: string): string {
  return content.replace(/\s*\[SANDBOX_PREVIEW:[^\]]+\]/g, "").trim();
}
