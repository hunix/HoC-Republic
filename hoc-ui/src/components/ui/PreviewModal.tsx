import { X, ExternalLink, RefreshCw, Lock, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./index";

interface PreviewModalProps {
  url: string;
  title: string;
  onClose: () => void;
}

export function PreviewModal({ url, title, onClose }: PreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Immediately reset to loading state (deferred so no sync setState in effect)
    const t1 = setTimeout(() => {
      if (!cancelled) {
        setLoading(true);
      }
    }, 0);
    const t2 = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [url]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-8 animate-fade-in">
      <div
        className={`bg-bg-card border border-border shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${
          expanded ? "fixed inset-4 rounded-xl" : "w-full max-w-5xl h-[80vh] rounded-2xl"
        }`}
      >
        {/* Fake Browser Chrome */}
        <div className="flex items-center gap-3 px-4 py-3 bg-bg-secondary border-b border-border select-none">
          <div className="flex gap-1.5 opacity-80">
            <div
              className="w-3 h-3 rounded-full bg-danger/80"
              onClick={onClose}
              style={{ cursor: "pointer" }}
            />
            <div className="w-3 h-3 rounded-full bg-warning/80" />
            <div
              className="w-3 h-3 rounded-full bg-success/80"
              onClick={() => setExpanded(!expanded)}
              style={{ cursor: "pointer" }}
            />
          </div>

          <div className="flex gap-2 ml-4">
            <button
type="button"               className="p-1 text-text-muted hover:text-text-primary transition-colors"
              onClick={() => setLoading(true)}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-2 bg-black/40 border border-border/50 rounded-md px-4 py-1.5 text-xs text-text-muted w-2/3 max-w-md overflow-hidden">
              <Lock size={12} className="text-success/70 flex-shrink-0" />
              <span className="truncate">{url}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              onClick={() => setExpanded(!expanded)}
            />
            <Button variant="ghost" size="sm" icon={<X size={16} />} onClick={onClose} />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 relative bg-black/90 flex flex-col items-center justify-center p-8 text-center pattern-grid-lg">
          {loading ? (
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-accent animate-spin" />
              <p className="text-text-muted font-mono text-sm">
                Connecting to Virtual Sandbox Network...
              </p>
            </div>
          ) : (
            <div className="max-w-md space-y-6 animate-slide-up">
              <div className="w-16 h-16 mx-auto bg-accent/20 border border-accent/40 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(var(--color-accent),0.3)]">
                <ExternalLink className="text-accent" size={28} />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-text-heading">{title}</h2>
                <p className="text-success font-mono text-xs px-3 py-1 bg-success/10 border border-success/20 rounded-full inline-block">
                  Connected to {url}
                </p>
              </div>

              <p className="text-sm text-text-secondary leading-relaxed bg-bg-card/50 p-4 rounded-xl border border-border/50">
                This application is currently running within the autonomous Republic simulation
                environment. It is isolated in the virtual network namespace and accessible by the
                citizen agents.
              </p>

              <div className="pt-4 flex justify-center">
                <Button variant="outline" onClick={onClose}>
                  Return to UI
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
