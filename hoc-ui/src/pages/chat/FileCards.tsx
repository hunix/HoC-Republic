/**
 * FileCards — Manus-style colorful file attachment cards
 *
 * Each file gets a vibrant color based on its type, with an icon and size label.
 * Grid layout: 2 columns, matching the Manus AI design.
 */

import {
  FileText,
  Image,
  Code,
  Archive,
  Film,
  Music,
  Presentation,
  FileDown,
  Grid3X3,
  Eye,
} from "lucide-react";
import { useState } from "react";
import type { SessionFile } from "./chat.types";
import { DocumentPreview } from "./DocumentPreview";
import { isPreviewable } from "./preview-utils";

// ── Color mapping ───────────────────────────────────────────────────────────

interface FileStyle {
  bg: string;
  icon: React.ReactNode;
  label: string;
}

function getFileStyle(name: string): FileStyle {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  // PDF
  if (ext === "pdf") {
    return {
      bg: "bg-gradient-to-br from-red-600 to-red-700",
      icon: <FileText size={20} className="text-white" />,
      label: "PDF",
    };
  }
  // Markdown / Text
  if (["md", "mdx", "txt", "rtf"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-indigo-600 to-purple-700",
      icon: <FileText size={20} className="text-white" />,
      label: ext === "md" || ext === "mdx" ? "Markdown" : "Text",
    };
  }
  // Documents
  if (["doc", "docx", "odt"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-blue-600 to-blue-700",
      icon: <FileText size={20} className="text-white" />,
      label: "Document",
    };
  }
  // Presentations
  if (["pptx", "ppt", "key"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-orange-500 to-orange-600",
      icon: <Presentation size={20} className="text-white" />,
      label: "Presentation",
    };
  }
  // Spreadsheets
  if (["xlsx", "xls", "csv"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-emerald-600 to-green-700",
      icon: <Grid3X3 size={20} className="text-white" />,
      label: "Spreadsheet",
    };
  }
  // Code
  if (
    [
      "js",
      "ts",
      "tsx",
      "jsx",
      "py",
      "go",
      "rs",
      "json",
      "yaml",
      "yml",
      "toml",
      "html",
      "css",
      "sh",
    ].includes(ext)
  ) {
    return {
      bg: "bg-gradient-to-br from-cyan-600 to-teal-700",
      icon: <Code size={20} className="text-white" />,
      label: ext.toUpperCase(),
    };
  }
  // Images
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-emerald-500 to-green-600",
      icon: <Image size={20} className="text-white" />,
      label: "Image",
    };
  }
  // Video
  if (["mp4", "webm", "avi", "mov", "mkv"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-violet-600 to-purple-700",
      icon: <Film size={20} className="text-white" />,
      label: "Video",
    };
  }
  // Audio
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-pink-500 to-rose-600",
      icon: <Music size={20} className="text-white" />,
      label: "Audio",
    };
  }
  // Archives
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext)) {
    return {
      bg: "bg-gradient-to-br from-amber-600 to-yellow-700",
      icon: <Archive size={20} className="text-white" />,
      label: "Archive",
    };
  }
  // Default
  return {
    bg: "bg-gradient-to-br from-gray-500 to-gray-600",
    icon: <FileDown size={20} className="text-white" />,
    label: ext.toUpperCase() || "File",
  };
}

// ── File Card ────────────────────────────────────────────────────────────────

function FileCard({ file }: { file: SessionFile }) {
  const style = getFileStyle(file.name);
  const canPreview = isPreviewable(file.name);
  const [showPreview, setShowPreview] = useState(false);

  return (
    <>
      <div
        className={`${style.bg} rounded-xl px-4 py-3 flex items-center gap-3 hover:opacity-90 transition-all hover:scale-[1.02] cursor-pointer no-underline group min-w-0 relative`}
      >
        <div className="shrink-0 w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center">
          {style.icon}
        </div>
        <a
          href={file.downloadUrl ?? "#"}
          download={file.name}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-w-0 no-underline"
        >
          <p className="text-[13px] font-medium text-white truncate">{file.name}</p>
          <p className="text-[11px] text-white/60">
            {style.label}
            {file.size ? ` · ${file.size}` : ""}
          </p>
        </a>
        {canPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowPreview(true);
            }}
            className="shrink-0 w-7 h-7 rounded-lg bg-white/15 hover:bg-white/30 flex items-center justify-center transition-colors"
            aria-label={`Preview ${file.name}`}
            title="Preview"
          >
            <Eye size={14} className="text-white" />
          </button>
        )}
      </div>
      {showPreview && <DocumentPreview file={file} onClose={() => setShowPreview(false)} />}
    </>
  );
}

// ── View All Files Card ──────────────────────────────────────────────────────

function ViewAllFilesCard({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl px-4 py-3 flex items-center gap-3 border border-border/60 hover:bg-bg-card-hover transition-all hover:border-border-hover cursor-pointer text-left bg-bg-card"
    >
      <div className="shrink-0 w-8 h-8 rounded-lg bg-bg-secondary flex items-center justify-center">
        <FileDown size={18} className="text-text-muted" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-text-primary">View all files in this task</p>
        <p className="text-[11px] text-text-muted">
          {count} file{count !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}

// ── FileCards Grid ───────────────────────────────────────────────────────────

interface FileCardsProps {
  files: SessionFile[];
  maxVisible?: number;
  onViewAll?: () => void;
}

export function FileCards({ files, maxVisible = 4, onViewAll }: FileCardsProps) {
  const [showAll, setShowAll] = useState(false);
  if (files.length === 0) {
    return null;
  }

  const displayed = showAll ? files : files.slice(0, maxVisible);
  const hasMore = files.length > maxVisible;

  return (
    <div className="my-3">
      <div className="grid grid-cols-2 gap-2">
        {displayed.map((f, i) => (
          <FileCard key={`${f.name}-${i}`} file={f} />
        ))}
        {hasMore && !showAll && (
          <ViewAllFilesCard count={files.length} onClick={onViewAll ?? (() => setShowAll(true))} />
        )}
      </div>
      {showAll && hasMore && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-2 text-[11px] text-text-muted hover:text-text-secondary transition-colors"
        >
          Show less
        </button>
      )}
    </div>
  );
}
