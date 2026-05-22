/**
 * Chat Feature — Tool Call Cards
 *
 * Renders agent tool calls (🔧 web_scrape, sandbox_exec, etc.)
 * as compact, collapsible cards instead of raw text.
 *
 * Also detects sandbox file output patterns and renders download links.
 */

import {
  ChevronDown,
  ChevronRight,
  Download,
  Globe,
  Terminal,
  FileText,
  Package,
  Eye,
  Wrench,
  Check,
  X,
  Loader2,
  Zap,
  Monitor,
} from "lucide-react";
import React, { useState } from "react";

// ── Tool Card Types ───────────────────────────────────────────────────────────

interface ToolCall {
  icon: React.ReactNode;
  name: string;
  summary: string;
  output: string;
  status: "success" | "error" | "pending";
}

interface FileOutput {
  path: string;
  filename: string;
  size?: string;
  downloadUrl?: string;
}

// ── Detection Patterns ────────────────────────────────────────────────────────

const TOOL_PATTERNS: Array<{
  regex: RegExp;
  name: string;
  icon: React.ReactNode;
  summarize: (match: RegExpMatchArray) => string;
}> = [
  {
    regex: /🔧\s*web_scrape\s*🔍?\s*(https?:\/\/\S+)/,
    name: "Web Scrape",
    icon: <Globe size={12} />,
    summarize: (m) => {
      try {
        return new URL(m[1] ?? "").hostname;
      } catch {
        return m[1] ?? "URL";
      }
    },
  },
  {
    regex: /🔧\s*sandbox_exec\s+(.*)/,
    name: "Sandbox Exec",
    icon: <Terminal size={12} />,
    summarize: (m) => (m[1] ?? "").slice(0, 60),
  },
  {
    regex: /🔧\s*sandbox_write_file\s*→?\s*(\S+)\s*(?:\(([^)]+)\))?/,
    name: "Write File",
    icon: <FileText size={12} />,
    summarize: (m) => {
      const path = m[1] ?? "";
      const fname = path.split("/").pop() ?? path;
      return m[2] ? `${fname} (${m[2]})` : fname;
    },
  },
  {
    regex: /🔧\s*sandbox_install\s+(.*)/,
    name: "Install",
    icon: <Package size={12} />,
    summarize: (m) => (m[1] ?? "").slice(0, 60),
  },
  {
    regex: /🔧\s*start_preview\s*🖼️?\s*(.*)/,
    name: "Preview",
    icon: <Eye size={12} />,
    summarize: (m) => (m[1] ?? "").slice(0, 60),
  },
  {
    regex: /🔧\s*(\w+)\s*(.*)/,
    name: "Tool",
    icon: <Wrench size={12} />,
    summarize: (m) => m[1] ?? "unknown",
  },
];

const FILE_SIZE_PATTERN = /\((\d[\d.,]*\s*(?:bytes|KB|MB|GB))\)/i;

const FILE_DOWNLOAD_TAG = /<file_download\s+([^>]*?)\s*\/?>(?:[^<]*<\/file_download>)?/gi;

// Detect bare sandbox download URLs
const SANDBOX_URL_PATTERN = /(?:https?:\/\/(?:127\.0\.0\.1|localhost):8080\/)([\w.-]+\.\w{2,5})/g;

// ── Parse Content ─────────────────────────────────────────────────────────────

export interface ParsedContent {
  segments: Array<
    | { type: "text"; content: string }
    | { type: "tool"; tool: ToolCall }
    | { type: "file"; file: FileOutput }
    | { type: "status"; text: string; icon: "key" | "model" | "agent" | "info" }
    | { type: "screenshot"; b64: string; label: string }
  >;
}

/**
 * Parse assistant message content into structured segments:
 * - text blocks (rendered via markdown)
 * - tool call cards (collapsible)
 * - file output links (download)
 * - status badges (key loaded, model info, etc.)
 */
export function parseAssistantContent(raw: string): ParsedContent {
  const segments: ParsedContent["segments"] = [];
  const lines = raw.split("\n");
  let textBuffer: string[] = [];
  let toolOutputBuffer: string[] = [];
  let currentTool: Omit<ToolCall, "output"> | null = null;
  let inJsonBlock = false;

  const flushText = () => {
    if (textBuffer.length > 0) {
      const text = textBuffer.join("\n").trim();
      if (text) {
        segments.push({ type: "text", content: text });
      }
      textBuffer = [];
    }
  };

  const flushTool = () => {
    if (currentTool) {
      const output = toolOutputBuffer.join("\n").trim();
      // Detect PREVIEW_READY before flushing — intercept the screenshot line
      const screenshotIdx = toolOutputBuffer.findIndex((l) => l.startsWith("PREVIEW_READY|"));
      if (screenshotIdx !== -1) {
        const b64Line = toolOutputBuffer[screenshotIdx] ?? "";
        const b64 = b64Line.slice("PREVIEW_READY|".length);
        const remainingOutput = toolOutputBuffer
          .filter((_, i) => i !== screenshotIdx)
          .join("\n")
          .trim();
        segments.push({ type: "tool", tool: { ...currentTool, output: remainingOutput } });
        segments.push({ type: "screenshot", b64, label: `${currentTool.name} — desktop snapshot` });
        currentTool = null;
        toolOutputBuffer = [];
        inJsonBlock = false;
        return;
      }
      segments.push({
        type: "tool",
        tool: { ...currentTool, output },
      });
      currentTool = null;
      toolOutputBuffer = [];
      inJsonBlock = false;
    }
  };

  for (const line of lines) {
    // ── Detect <file_download> XML tags ──────────────────────────────
    FILE_DOWNLOAD_TAG.lastIndex = 0;
    const fdTagMatch = FILE_DOWNLOAD_TAG.exec(line);
    if (fdTagMatch) {
      flushTool();
      flushText();
      const attrs = fdTagMatch[1] ?? "";
      const attrMap: Record<string, string> = {};
      for (const am of attrs.matchAll(/([\w-]+)=["']([^"']*)["']/g)) {
        attrMap[am[1] ?? ""] = am[2] ?? "";
      }
      const url = attrMap.url ?? attrMap.href ?? "";
      const filename = attrMap.filename ?? attrMap.name ?? url.split("/").pop() ?? "file";
      const size = attrMap.size;
      if (url) {
        const downloadUrl = url
          .replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\//, "/sandbox-files/")
          .replace(/\/sandbox-files\/workspace\//, "/sandbox-files/");
        segments.push({
          type: "file",
          file: { path: url, filename, size, downloadUrl },
        });
      }
      const remainder = line.replace(FILE_DOWNLOAD_TAG, "").trim();
      if (remainder) {
        textBuffer.push(remainder);
      }
      continue;
    }

    // Detect status lines (🔑, 📋, 🤖) — compact meta info
    if (/^🔑\s/.test(line)) {
      flushTool();
      flushText();
      segments.push({ type: "status", text: line.replace(/^🔑\s*/, ""), icon: "key" });
      continue;
    }
    if (/^📋\s/.test(line)) {
      flushTool();
      flushText();
      segments.push({ type: "status", text: line.replace(/^📋\s*/, ""), icon: "model" });
      continue;
    }
    if (/^🤖\s/.test(line)) {
      flushTool();
      flushText();
      segments.push({ type: "status", text: line.replace(/^🤖\s*/, ""), icon: "agent" });
      continue;
    }

    // Detect tool call lines
    if (/^🔧\s/.test(line)) {
      flushTool();
      flushText();

      let matched = false;
      for (const tp of TOOL_PATTERNS) {
        const m = tp.regex.exec(line);
        if (m) {
          const isError = /\berror\b/i.test(line);
          currentTool = {
            icon: tp.icon,
            name: tp.name === "Tool" ? (m[1] ?? "Tool") : tp.name,
            summary: tp.summarize(m),
            status: isError ? "error" : "success",
          };
          matched = true;
          break;
        }
      }
      if (!matched) {
        currentTool = {
          icon: <Wrench size={12} />,
          name: "Tool",
          summary: line.replace(/^🔧\s*/, "").slice(0, 60),
          status: "success",
        };
      }
      continue;
    }

    // If we're in a tool call, collect output lines (including 📎 prefixed)
    if (currentTool) {
      // Strip the 📎 prefix the backend now uses for compact output
      const cleanLine = line.replace(/^📎\s*/, "");

      if (cleanLine.trim() === "{" || cleanLine.trim().startsWith("{")) {
        inJsonBlock = true;
      }
      if (inJsonBlock && (cleanLine.trim() === "}" || cleanLine.trim().endsWith("}"))) {
        toolOutputBuffer.push(cleanLine);
        continue;
      }

      if (/^(Exit code:|Install ✅|Install ❌|🖼️ Preview|File written:)/.test(cleanLine.trim())) {
        const isSuccess = /✅|Exit code: 0/.test(cleanLine);
        const isError = /❌|Exit code: [^0]/.test(cleanLine);
        if (isSuccess) {
          currentTool.status = "success";
        }
        if (isError) {
          currentTool.status = "error";
        }
        toolOutputBuffer.push(cleanLine);
        flushTool();
        continue;
      }

      if (
        /^\.\.\. \(\d+ chars total\)$/.test(cleanLine.trim()) ||
        /… \(\d+ chars\)$/.test(cleanLine.trim())
      ) {
        toolOutputBuffer.push(cleanLine);
        flushTool();
        continue;
      }

      if (cleanLine.trim() === "" && toolOutputBuffer.length > 0 && !inJsonBlock) {
        flushTool();
        continue;
      }

      toolOutputBuffer.push(cleanLine);
      continue;
    }

    // Handle standalone 📎 lines (tool output without a preceding 🔧 header)
    if (/^📎\s/.test(line)) {
      // Just strip the prefix and add as text — it's compact output
      textBuffer.push(line.replace(/^📎\s*/, ""));
      continue;
    }

    // Detect file output patterns in regular text
    const fileMatch = /(?:saved to|File written):\s*(\S+)/.exec(line);
    if (fileMatch) {
      const filePath = fileMatch[1] ?? "";
      const filename = filePath.split("/").pop() ?? filePath;
      const sizeMatch = FILE_SIZE_PATTERN.exec(line);
      const isWorkspaceFile = filePath.startsWith("/workspace/");

      flushText();
      segments.push({
        type: "file",
        file: {
          path: filePath,
          filename,
          size: sizeMatch?.[1],
          downloadUrl: isWorkspaceFile ? `/sandbox-files/${filename}` : undefined,
        },
      });
      continue;
    }

    // ── Detect bare sandbox download URLs in regular text ────────────
    SANDBOX_URL_PATTERN.lastIndex = 0;
    const sandboxUrlMatch = SANDBOX_URL_PATTERN.exec(line);
    if (sandboxUrlMatch) {
      const fname = sandboxUrlMatch[1] ?? "file";
      flushText();
      segments.push({
        type: "file",
        file: {
          path: sandboxUrlMatch[0] ?? "",
          filename: fname,
          downloadUrl: `/sandbox-files/${fname}`,
        },
      });
      const rest = line.replace(SANDBOX_URL_PATTERN, "").trim();
      if (rest) {
        textBuffer.push(rest);
      }
      continue;
    }

    // ── Detect PREVIEW_READY|<b64> lines from computer tool (outside of tool context) ──
    if (line.startsWith("PREVIEW_READY|")) {
      flushTool();
      flushText();
      const b64 = line.slice("PREVIEW_READY|".length);
      segments.push({ type: "screenshot", b64, label: "Desktop snapshot" });
      continue;
    }

    textBuffer.push(line);
  }

  flushTool();
  flushText();

  return { segments };
}

// ── Tool Call Card Component ──────────────────────────────────────────────────

function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const hasOutput = tool.output.length > 0;

  return (
    <div className="my-0.5 rounded-md border border-border/40 bg-bg-secondary/30 overflow-hidden">
      <button
        type="button"
        onClick={() => hasOutput && setExpanded(!expanded)}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-left transition-colors ${
          hasOutput ? "hover:bg-bg-card cursor-pointer" : "cursor-default"
        }`}
      >
        <span className="text-text-muted shrink-0">{tool.icon}</span>
        <span className="font-medium text-text-secondary">{tool.name}</span>
        {tool.summary && (
          <>
            <span className="text-text-muted">→</span>
            <span className="text-text-muted truncate flex-1 font-mono text-[9px]">
              {tool.summary}
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-0.5 shrink-0">
          {tool.status === "success" && <Check size={8} className="text-success" />}
          {tool.status === "error" && <X size={8} className="text-danger" />}
          {tool.status === "pending" && <Loader2 size={8} className="text-accent animate-spin" />}
          {hasOutput &&
            (expanded ? (
              <ChevronDown size={8} className="text-text-muted" />
            ) : (
              <ChevronRight size={8} className="text-text-muted" />
            ))}
        </span>
      </button>
      {expanded && hasOutput && (
        <div className="border-t border-border/20 px-2 py-1.5 max-h-40 overflow-y-auto">
          <pre className="text-[9px] font-mono text-text-muted whitespace-pre-wrap break-all leading-snug">
            {tool.output.length > 1500
              ? tool.output.slice(0, 1500) + "\n… (truncated)"
              : tool.output}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Inline Screenshot Card (computer use desktop snapshots) ──────────────────

function ScreenshotCard({ b64, label }: { b64: string; label: string }) {
  const [expanded, setExpanded] = useState(false);
  const src = `data:image/png;base64,${b64}`;
  return (
    <div className="my-1 rounded-lg border border-purple/20 bg-purple/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] text-left hover:bg-bg-card transition-colors cursor-pointer"
      >
        <Monitor size={10} className="text-purple shrink-0" />
        <span className="font-medium text-purple/90">Screenshot</span>
        <span className="text-text-muted truncate flex-1 font-mono text-[9px]">{label}</span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown size={8} className="text-text-muted" />
          ) : (
            <ChevronRight size={8} className="text-text-muted" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-purple/10 p-1.5">
          <img
            src={src}
            alt={label}
            className="w-full rounded-md object-contain max-h-64 border border-border/30"
          />
        </div>
      )}
    </div>
  );
}

// ── Grouped Tool Calls ────────────────────────────────────────────────────────

function ToolCallGroup({ tools }: { tools: ToolCall[] }) {
  const [expanded, setExpanded] = useState(false);
  const errorCount = tools.filter((t) => t.status === "error").length;
  const successCount = tools.filter((t) => t.status === "success").length;

  // If 2 or fewer tools, just show them inline
  if (tools.length <= 2) {
    return (
      <>
        {tools.map((t, i) => (
          <ToolCallCard key={i} tool={t} />
        ))}
      </>
    );
  }

  return (
    <div className="my-1 rounded-lg border border-border/30 bg-bg-secondary/20 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[10px] text-left hover:bg-bg-card transition-colors cursor-pointer"
      >
        <Zap size={10} className="text-accent shrink-0" />
        <span className="font-medium text-text-secondary">{tools.length} tools executed</span>
        <span className="flex items-center gap-1 text-[9px] text-text-muted">
          {successCount > 0 && (
            <span className="flex items-center gap-0.5">
              <Check size={7} className="text-success" />
              {successCount}
            </span>
          )}
          {errorCount > 0 && (
            <span className="flex items-center gap-0.5">
              <X size={7} className="text-danger" />
              {errorCount}
            </span>
          )}
        </span>
        <span className="ml-auto">
          {expanded ? (
            <ChevronDown size={9} className="text-text-muted" />
          ) : (
            <ChevronRight size={9} className="text-text-muted" />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-border/20 px-1.5 py-1 space-y-0.5">
          {tools.map((t, i) => (
            <ToolCallCard key={i} tool={t} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── File Output Card ──────────────────────────────────────────────────────────

function FileOutputCard({ file }: { file: FileOutput }) {
  const ext = (file.filename.split(".").pop() ?? "").toLowerCase();
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
  const isVideo = ["mp4", "webm", "avi", "mov", "mkv"].includes(ext);
  const isAudio = ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext);
  const previewUrl = file.downloadUrl;

  return (
    <div className="my-1 rounded-lg border border-accent/20 bg-accent/5 overflow-hidden">
      {/* Inline media preview */}
      {previewUrl && isImage && (
        <div className="bg-bg-primary/40 border-b border-accent/10">
          <img
            src={previewUrl}
            alt={file.filename}
            className="w-full max-h-64 object-contain"
            loading="lazy"
          />
        </div>
      )}
      {previewUrl && isVideo && (
        <div className="bg-black border-b border-accent/10">
          <video
            src={previewUrl}
            controls
            preload="metadata"
            className="w-full max-h-64"
            aria-label={`Video: ${file.filename}`}
          />
        </div>
      )}
      {previewUrl && isAudio && (
        <div className="px-3 py-2 border-b border-accent/10 bg-bg-secondary/20">
          <audio
            src={previewUrl}
            controls
            preload="metadata"
            className="w-full"
            aria-label={`Audio: ${file.filename}`}
          />
        </div>
      )}
      {/* File info + download button */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <FileText size={14} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-text-primary truncate">{file.filename}</p>
          {file.size && <p className="text-[9px] text-text-muted">{file.size}</p>}
        </div>
        {file.downloadUrl && (
          <a
            href={file.downloadUrl}
            download={file.filename}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent text-white text-[9px] font-medium hover:bg-accent/80 transition-colors shrink-0"
          >
            <Download size={8} />
            DL
          </a>
        )}
      </div>
    </div>
  );
}

// ── Status Badge ──────────────────────────────────────────────────────────────

function StatusBadge({ text, icon }: { text: string; icon: string }) {
  const iconEl = icon === "key" ? "🔑" : icon === "model" ? "📋" : icon === "agent" ? "🤖" : "ℹ️";
  return (
    <div className="flex items-center gap-1 text-[9px] text-text-muted/70 py-0">
      <span className="text-[8px]">{iconEl}</span>
      <span className="truncate italic">{text}</span>
    </div>
  );
}

// ── Render Parsed Content ─────────────────────────────────────────────────────

export function RenderParsedSegments({
  segments,
  renderText,
}: {
  segments: ParsedContent["segments"];
  renderText: (text: string) => React.ReactNode;
}) {
  // Group consecutive tool segments for collapsible display
  const grouped: Array<
    | { type: "text"; content: string }
    | { type: "toolGroup"; tools: ToolCall[] }
    | { type: "file"; file: FileOutput }
    | { type: "status"; text: string; icon: string }
    | { type: "screenshot"; b64: string; label: string }
  > = [];

  let pendingTools: ToolCall[] = [];

  const flushTools = () => {
    if (pendingTools.length > 0) {
      grouped.push({ type: "toolGroup", tools: [...pendingTools] });
      pendingTools = [];
    }
  };

  for (const seg of segments) {
    if (seg.type === "tool") {
      pendingTools.push(seg.tool);
    } else {
      flushTools();
      if (seg.type === "text") {
        grouped.push({ type: "text", content: seg.content });
      } else if (seg.type === "file") {
        grouped.push({ type: "file", file: seg.file });
      } else if (seg.type === "status") {
        grouped.push({ type: "status", text: seg.text, icon: seg.icon });
      } else if (seg.type === "screenshot") {
        grouped.push({ type: "screenshot", b64: seg.b64, label: seg.label });
      }
    }
  }
  flushTools();

  return (
    <>
      {grouped.map((seg, i) => {
        switch (seg.type) {
          case "text":
            return <div key={i}>{renderText(seg.content)}</div>;
          case "toolGroup":
            return <ToolCallGroup key={i} tools={seg.tools} />;
          case "file":
            return <FileOutputCard key={i} file={seg.file} />;
          case "status":
            return <StatusBadge key={i} text={seg.text} icon={seg.icon} />;
          case "screenshot":
            return <ScreenshotCard key={i} b64={seg.b64} label={seg.label} />;
          default:
            return null;
        }
      })}
    </>
  );
}
