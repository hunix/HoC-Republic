/**
 * DocumentPreview — Inline document preview modal for chat FileCards
 *
 * Supports:
 * - PDF: Native browser <iframe> viewer
 * - HTML: Sandboxed <iframe>
 * - Images: Direct <img> with zoom controls
 * - Video: Native <video> player
 * - Audio: Native <audio> player
 * - Text: Fetched and displayed as monospace
 * - Others: Shows download-only message
 */

import { X, ExternalLink, Download, ZoomIn, ZoomOut, Volume2, Film } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { getPreviewCategory } from "./preview-utils";

interface DocumentPreviewProps {
  file: {
    name: string;
    downloadUrl?: string;
    size?: string;
  };
  onClose: () => void;
}

export function DocumentPreview({ file, onClose }: DocumentPreviewProps) {
  const previewType = getPreviewCategory(file.name);
  const [zoom, setZoom] = useState(100);
  const [textContent, setTextContent] = useState<string | null>(null);

  const url = file.downloadUrl ?? "#";

  // Escape key closes the preview
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Fetch text files for inline display
  useEffect(() => {
    if (previewType !== "text" || url === "#") {
      return;
    }
    let cancelled = false;
    fetch(url)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) {
          setTextContent(text);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextContent("Failed to load file content.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [previewType, url]);

  // Auto-scroll text to top
  const textRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (textContent && textRef.current) {
      textRef.current.scrollTop = 0;
    }
  }, [textContent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      {/* Backdrop click closes */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative w-[90vw] max-w-4xl h-[80vh] flex flex-col glass-regular rounded-2xl overflow-hidden shadow-2xl border border-border/50">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {previewType === "video" && <Film size={14} className="text-purple shrink-0" />}
            {previewType === "audio" && <Volume2 size={14} className="text-accent shrink-0" />}
            <span className="text-[13px] font-semibold text-text-primary truncate">
              {file.name}
            </span>
            {file.size && (
              <span className="text-[11px] text-text-muted shrink-0">({file.size})</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {previewType === "image" && (
              <>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(25, z - 25))}
                  className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                  aria-label="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className="text-[10px] text-text-muted font-mono w-8 text-center">
                  {zoom}%
                </span>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(400, z + 25))}
                  className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
                  aria-label="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <div className="w-px h-4 bg-border mx-1" />
              </>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
              aria-label="Open in new tab"
            >
              <ExternalLink size={14} />
            </a>
            <a
              href={url}
              download={file.name}
              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-card-hover transition-colors"
              aria-label="Download file"
            >
              <Download size={14} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-bg transition-colors ml-1"
              aria-label="Close preview"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto bg-bg-secondary">
          {previewType === "pdf" && (
            <iframe
              src={url}
              title={`PDF preview: ${file.name}`}
              className="w-full h-full border-0"
            />
          )}
          {previewType === "html" && (
            <iframe
              src={url}
              title={`HTML preview: ${file.name}`}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-scripts allow-same-origin"
            />
          )}
          {previewType === "image" && (
            <div className="flex items-center justify-center min-h-full p-4">
              <img
                src={url}
                alt={file.name}
                className="rounded-lg shadow-lg transition-transform duration-200"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center" }}
              />
            </div>
          )}
          {previewType === "video" && (
            <div className="flex items-center justify-center h-full bg-black p-4">
              <video
                src={url}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-lg shadow-lg"
                aria-label={file.name}
              />
            </div>
          )}
          {previewType === "audio" && (
            <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-accent/20 to-purple/20 flex items-center justify-center">
                <Volume2 size={40} className="text-accent" />
              </div>
              <p className="text-[14px] font-medium text-text-primary">{file.name}</p>
              <audio
                src={url}
                controls
                autoPlay
                className="w-full max-w-md"
                aria-label={file.name}
              />
            </div>
          )}
          {previewType === "text" && (
            <div className="h-full p-4 overflow-auto">
              {textContent === null ? (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[12px] text-text-muted animate-pulse">Loading…</span>
                </div>
              ) : (
                <pre
                  ref={textRef}
                  className="text-[12px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed break-words"
                >
                  {textContent}
                </pre>
              )}
            </div>
          )}
          {previewType === "none" && (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <Download size={40} className="text-text-muted/40" />
              <p className="text-[13px] text-text-secondary text-center">
                Preview is not available for this file type.
              </p>
              <a
                href={url}
                download={file.name}
                className="px-4 py-2 rounded-lg bg-accent text-white text-[13px] font-medium hover:bg-accent/90 transition-colors no-underline"
              >
                Download {file.name}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
