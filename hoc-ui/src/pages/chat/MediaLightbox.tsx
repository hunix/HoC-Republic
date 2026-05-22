/**
 * Chat Feature — Media Lightbox
 *
 * Fullscreen modal for image, video, and audio preview.
 * Supports Escape key close and download.
 * Extracted from ChatMessages.tsx per DDD component size limits.
 */

import { X, Download } from "lucide-react";
import { useEffect } from "react";

interface MediaLightboxProps {
  src: string;
  alt: string;
  mediaType: "image" | "video" | "audio";
  onClose: () => void;
}

export function MediaLightbox({ src, alt, mediaType, onClose }: MediaLightboxProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = src.split("/").pop() || "download";
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 animate-fade-in"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-[101] p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        aria-label="Close media"
      >
        <X size={20} />
      </button>
      {/* Download button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDownload();
        }}
        className="absolute top-4 right-16 z-[101] p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5"
        aria-label="Download media"
      >
        <Download size={16} />
        <span className="text-xs">Download</span>
      </button>
      {/* Media content */}
      {mediaType === "video" ? (
        <video
          src={src}
          controls
          autoPlay
          className="max-w-[90vw] max-h-[85vh] rounded-lg shadow-2xl bg-black"
          onClick={(e) => e.stopPropagation()}
          aria-label={alt || "Video preview"}
        />
      ) : mediaType === "audio" ? (
        <div
          className="bg-bg-card/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-text-primary font-medium text-center mb-4">{alt || "Audio"}</p>
          <audio
            src={src}
            controls
            autoPlay
            className="w-full"
            aria-label={alt || "Audio preview"}
          />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      )}
      {alt && mediaType !== "audio" && (
        <p className="absolute bottom-6 text-center text-sm text-white/70 bg-black/40 px-4 py-1 rounded-full">
          {alt}
        </p>
      )}
    </div>
  );
}
