/**
 * Preview utility — Determines if a file can be previewed inline.
 * Separated from DocumentPreview.tsx to satisfy Vite Fast Refresh
 * (components-only export requirement).
 */

const PREVIEWABLE_EXTS = new Set([
  "pdf",
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "bmp",
  // Video
  "mp4",
  "webm",
  // Audio
  "mp3",
  "wav",
  "ogg",
  // Text
  "txt",
  "md",
  "csv",
  "json",
]);

/** Check if a filename is previewable inline */
export function isPreviewable(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return PREVIEWABLE_EXTS.has(ext);
}

/** Get the preview category for a given extension */
export function getPreviewCategory(
  name: string,
): "pdf" | "html" | "image" | "video" | "audio" | "text" | "none" {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") {
    return "pdf";
  }
  if (["html", "htm"].includes(ext)) {
    return "html";
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"].includes(ext)) {
    return "image";
  }
  if (["mp4", "webm"].includes(ext)) {
    return "video";
  }
  if (["mp3", "wav", "ogg"].includes(ext)) {
    return "audio";
  }
  if (["txt", "md", "csv", "json"].includes(ext)) {
    return "text";
  }
  return "none";
}
