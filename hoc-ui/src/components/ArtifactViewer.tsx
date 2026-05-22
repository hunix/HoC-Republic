/**
 * ArtifactViewer — Persistent Artifact Preview Component
 *
 * Content-type-aware viewer that renders sandbox output after the container stops.
 * Shows: screenshots, download buttons, and type-specific viewers.
 *
 * States:
 *   1. Live — sandbox running, iframe active
 *   2. Snapshot — container stopped, screenshot available
 *   3. Empty — no artifact data
 */

import { useState } from "react";
import {
  FileDown,
  Image as ImageIcon,
  FileText,
  Video,
  Archive,
  Globe,
  Presentation,
  Maximize2,
  X,
  RefreshCw,
  Monitor,
} from "lucide-react";

export interface ArtifactData {
  type: string;
  files: Array<{ name: string; size: string }>;
  snapshotUrl: string | null;
  liveUrl: string | null;
}

/**
 * Extract artifact data from chat messages.
 * Parses [SANDBOX_ARTIFACT:type=...|files=...|snapshot=...] tags.
 */
export function extractArtifactData(messages: Array<{ role: string; content: string }>): ArtifactData | null {
  // Find the last assistant message with an artifact tag
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "assistant") {continue;}

    const artifactMatch = /\[SANDBOX_ARTIFACT:([^\]]+)\]/.exec(msg.content);
    if (!artifactMatch) {continue;}

    const raw = artifactMatch[1];
    const parts = raw.split("|");
    let type = "unknown";
    let filesStr = "";
    let snapshotUrl: string | null = null;

    for (const part of parts) {
      if (part.startsWith("type=")) {type = part.slice(5);}
      else if (part.startsWith("files=")) {filesStr = part.slice(6);}
      else if (part.startsWith("snapshot=")) {snapshotUrl = part.slice(9);}
    }

    // Parse files: "file1.pptx(45KB),file2.pdf(12KB)"
    const files = filesStr
      ? filesStr.split(",").map((f) => {
          const match = /^(.+?)\(([^)]+)\)$/.exec(f.trim());
          return match ? { name: match[1], size: match[2] } : { name: f.trim(), size: "" };
        }).filter((f) => f.name)
      : [];

    // Also extract live preview URL
    const previewMatch = /\[SANDBOX_PREVIEW:([^\]|]+)/.exec(msg.content);
    const liveUrl = previewMatch ? (previewMatch[1] ?? null) : null;

    return { type, files, snapshotUrl, liveUrl };
  }

  return null;
}

/**
 * Strip [SANDBOX_ARTIFACT:...] tags from display text.
 */
export function stripArtifactMarker(content: string): string {
  return content.replace(/\s*\[SANDBOX_ARTIFACT:[^\]]+\]/g, "").trim();
}

// ─── Type Icon Mapping ───────────────────────────────────────────

function typeIcon(type: string) {
  switch (type) {
    case "presentation": return <Presentation size={16} className="text-warning" />;
    case "document": return <FileText size={16} className="text-info" />;
    case "website": return <Globe size={16} className="text-accent" />;
    case "video": return <Video size={16} className="text-purple" />;
    case "image": return <ImageIcon size={16} className="text-success" />;
    case "archive": return <Archive size={16} className="text-text-secondary" />;
    default: return <Monitor size={16} className="text-text-muted" />;
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case "presentation": return "Presentation";
    case "document": return "Document";
    case "website": return "Web Preview";
    case "video": return "Video";
    case "image": return "Image";
    case "archive": return "Archive";
    default: return "Output";
  }
}

// ─── Component ───────────────────────────────────────────────────

interface ArtifactViewerProps {
  artifact: ArtifactData | null;
  sandboxLive: boolean;
}

export function ArtifactViewer({ artifact, sandboxLive }: ArtifactViewerProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [showSnapshot, setShowSnapshot] = useState(true);

  // State 1: Sandbox is live — show iframe
  if (sandboxLive) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-[11px] font-semibold text-text-primary">Agent Sandbox</span>
          <span className="text-[9px] text-text-muted">Live</span>
        </div>
        <iframe
          src="/sandbox-novnc/vnc_lite.html?autoconnect=true&resize=remote&path=sandbox-novnc/websockify"
          title="Agent Sandbox Desktop"
          className="flex-1 w-full border-0 bg-black min-h-[300px]"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
        />
      </div>
    );
  }

  // State 3: No artifact data — empty state
  if (!artifact || artifact.type === "unknown") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
        <Monitor size={32} className="text-text-muted/30" />
        <p className="text-[11px] text-text-muted text-center">
          No preview available. Start a sandbox task to see results here.
        </p>
      </div>
    );
  }

  // State 2: Container stopped, artifact data available
  const fixedLiveUrl = artifact.liveUrl
    ?.replace(/\blocalhost\b/g, "127.0.0.1")
    .replace(/https?:\/\/127\.0\.0\.1:8080\/?/, "/sandbox/");

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
          {typeIcon(artifact.type)}
          <span className="text-[11px] font-semibold text-text-primary">
            {typeLabel(artifact.type)}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {artifact.snapshotUrl && (
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                aria-label="Expand preview"
                className="p-1 rounded-md text-text-muted hover:text-accent hover:bg-accent/10 transition-colors"
              >
                <Maximize2 size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Snapshot preview */}
        {artifact.snapshotUrl && showSnapshot ? (
          <div className="relative flex-1 min-h-[200px] bg-bg-input overflow-hidden">
            <img
              src={artifact.snapshotUrl}
              alt={`${typeLabel(artifact.type)} preview`}
              className="w-full h-full object-contain"
              onError={() => setShowSnapshot(false)}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
              <p className="text-[9px] text-white/80">
                Preview captured at task completion
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-bg-input min-h-[120px]">
            <div className="text-center p-4">
              {typeIcon(artifact.type)}
              <p className="text-[10px] text-text-muted mt-2">
                Container stopped — download files below
              </p>
            </div>
          </div>
        )}

        {/* File list with download buttons */}
        {artifact.files.length > 0 && (
          <div className="border-t border-border p-2 space-y-1 shrink-0 max-h-[200px] overflow-y-auto">
            <p className="text-[9px] text-text-muted uppercase tracking-wider px-1 font-medium">
              Output Files
            </p>
            {artifact.files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-card-hover transition-colors"
              >
                <FileDown size={11} className="text-text-muted shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-text-secondary truncate">{f.name}</p>
                  {f.size && <p className="text-[8px] text-text-muted">{f.size}</p>}
                </div>
                <a
                  href={`/sandbox/${f.name}`}
                  download={f.name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-accent/15 text-[8px] text-accent hover:bg-accent/25 transition-colors border border-accent/30 no-underline shrink-0"
                >
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  DL
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Try reconnect hint */}
        {fixedLiveUrl && (
          <div className="border-t border-border px-3 py-1.5 shrink-0">
            <button
              type="button"
              onClick={() => window.open(fixedLiveUrl, "_blank")}
              className="flex items-center gap-1.5 text-[9px] text-text-muted hover:text-accent transition-colors"
            >
              <RefreshCw size={9} />
              Try opening live preview
            </button>
          </div>
        )}
      </div>

      {/* Fullscreen modal */}
      {fullscreen && artifact.snapshotUrl && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-black/90 backdrop-blur-sm animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) {setFullscreen(false);} }}
        >
          <div className="flex items-center justify-between px-4 py-2 bg-bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              {typeIcon(artifact.type)}
              <span className="text-sm text-text-primary font-medium">{typeLabel(artifact.type)}</span>
              {artifact.files.length > 0 && (
                <span className="text-xs text-text-muted">
                  {artifact.files.map((f) => f.name).join(", ")}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              aria-label="Close"
              className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img
              src={artifact.snapshotUrl}
              alt={`${typeLabel(artifact.type)} preview (fullscreen)`}
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  );
}
