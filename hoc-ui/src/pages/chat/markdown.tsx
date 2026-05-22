/**
 * Chat Feature — Markdown Renderer
 *
 * Enhanced dependency-free markdown renderer for chat messages.
 * Supports: code blocks with copy + language label, tables, horizontal rules,
 * checkboxes, strikethrough, image embeds, blockquotes, headers, lists,
 * inline code, bold, italic, links (markdown + bare URLs).
 *
 * Heavy lifting is delegated to:
 *   - syntax-highlight.tsx  (CodeBlock, highlightCode, keyword sets)
 *   - markdown-table.tsx    (MarkdownTable component)
 */

import { ExternalLink } from "lucide-react";
import React from "react";
import type { TranscriptMsg, ContentBlock } from "./chat.types";
import { MarkdownTable } from "./markdown-table";
import { CodeBlock } from "./syntax-highlight";

// ── Text Extraction ────────────────────────────────────────────────────────────

export function extractText(message: unknown): string {
  if (!message) {
    return "";
  }
  if (typeof message === "string") {
    return message;
  }
  const m = message as TranscriptMsg;
  if (typeof m.content === "string") {
    return m.content;
  }
  if (Array.isArray(m.content)) {
    return (m.content as ContentBlock[])
      .filter((c) => !c.type || c.type === "text")
      .map((c) => c.text ?? "")
      .join("");
  }
  return "";
}

// ── Relative Time ─────────────────────────────────────────────────────────────

export function relativeTime(ts?: number | null): string {
  if (!ts) {
    return "";
  }
  const diff = Date.now() - ts;
  if (diff < 60_000) {
    return "just now";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)}m ago`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)}h ago`;
  }
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ── Inline Renderer ───────────────────────────────────────────────────────────

export function renderInline(text: string, baseKey: number): React.ReactNode[] {
  // Strip any residual <file_download ... /> or <file_download ...>text</file_download> XML tags
  // Also handle LLM-hallucinated camelCase variants like </fileDownload>
  const cleaned = text
    .replace(/<\/?file_download[^>]*\/?>/gi, "")
    .replace(/<\/?fileDownload[^>]*\/?>/gi, "")
    .trim();
  if (!cleaned) {
    return [];
  }

  const parts: React.ReactNode[] = [];
  let remaining = cleaned;
  let key = baseKey * 1000;

  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf("**");
    const backtickIdx = remaining.indexOf("`");
    const strikeIdx = remaining.indexOf("~~");
    const italicIdx = remaining.indexOf("_");
    const mdLinkIdx = remaining.search(/\[[^\]]+\]\(https?:\/\//);
    const urlIdx = remaining.search(/https?:\/\/[^\s)<>]+/);

    const candidates = [
      boldIdx >= 0 ? boldIdx : Infinity,
      backtickIdx >= 0 ? backtickIdx : Infinity,
      strikeIdx >= 0 ? strikeIdx : Infinity,
      italicIdx >= 0 ? italicIdx : Infinity,
      mdLinkIdx >= 0 ? mdLinkIdx : Infinity,
      urlIdx >= 0 ? urlIdx : Infinity,
    ];
    const next = Math.min(...candidates);

    if (!isFinite(next)) {
      parts.push(remaining);
      break;
    }

    if (next > 0) {
      parts.push(remaining.slice(0, next));
    }

    // ── Markdown link [text](url) ──────────────────────────────────
    if (next === mdLinkIdx && mdLinkIdx >= 0) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(remaining.slice(next));
      if (linkMatch) {
        const linkText = linkMatch[1] ?? "";
        const linkUrl = linkMatch[2] ?? "";
        let href = linkUrl.replace(
          /https?:\/\/(?:127\.0\.0\.1|localhost):8080\//,
          "/sandbox-files/",
        );
        href = href.replace(/\/sandbox-files\/workspace\//, "/sandbox-files/");
        parts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-accent underline decoration-accent/30 hover:decoration-accent transition-colors"
          >
            {linkText}
            <ExternalLink size={9} className="opacity-50" />
          </a>,
        );
        remaining = remaining.slice(next + linkMatch[0].length);
        continue;
      }
    }

    // ── Bare URL ───────────────────────────────────────────────────
    if (next === urlIdx && urlIdx >= 0 && (mdLinkIdx < 0 || urlIdx < mdLinkIdx)) {
      const urlMatch = /^https?:\/\/[^\s)<>]+/.exec(remaining.slice(next));
      if (urlMatch) {
        const rawUrl = urlMatch[0];
        const isSandbox = /https?:\/\/(?:127\.0\.0\.1|localhost):8080\//.test(rawUrl);
        let href = isSandbox
          ? rawUrl.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):8080\//, "/sandbox-files/")
          : rawUrl;
        if (isSandbox) {
          href = href.replace(/\/sandbox-files\/workspace\//, "/sandbox-files/");
        }
        const label = isSandbox
          ? rawUrl.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):8080\/(?:workspace\/)?/, "")
          : rawUrl.length > 50
            ? rawUrl.slice(0, 47) + "…"
            : rawUrl;
        parts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-0.5 underline transition-colors ${
              isSandbox
                ? "text-accent font-medium decoration-accent/30 hover:decoration-accent"
                : "text-text-muted decoration-text-muted/30 hover:text-text-secondary"
            }`}
          >
            {isSandbox ? `📥 ${label}` : label}
            <ExternalLink size={8} className="opacity-40" />
          </a>,
        );
        remaining = remaining.slice(next + rawUrl.length);
        continue;
      }
    }

    // ── Strikethrough ~~text~~ ───────────────────────────────────
    if (next === strikeIdx && strikeIdx >= 0) {
      const end = remaining.indexOf("~~", strikeIdx + 2);
      if (end === -1) {
        parts.push(remaining);
        break;
      }
      parts.push(
        <del key={key++} className="opacity-60">
          {remaining.slice(strikeIdx + 2, end)}
        </del>,
      );
      remaining = remaining.slice(end + 2);
      continue;
    }

    if (next === boldIdx) {
      const end = remaining.indexOf("**", boldIdx + 2);
      if (end === -1) {
        parts.push(remaining);
        break;
      }
      parts.push(
        <strong key={key++} className="font-semibold text-text-primary">
          {remaining.slice(boldIdx + 2, end)}
        </strong>,
      );
      remaining = remaining.slice(end + 2);
    } else if (next === backtickIdx) {
      const end = remaining.indexOf("`", backtickIdx + 1);
      if (end === -1) {
        parts.push(remaining);
        break;
      }
      parts.push(
        <code
          key={key++}
          className="bg-bg-secondary/80 border border-border/30 px-1.5 py-0.5 rounded text-[11px] font-mono text-accent/90"
        >
          {remaining.slice(backtickIdx + 1, end)}
        </code>,
      );
      remaining = remaining.slice(end + 1);
    } else {
      const end = remaining.indexOf("_", italicIdx + 1);
      if (end === -1) {
        parts.push(remaining);
        break;
      }
      parts.push(
        <em key={key++} className="italic text-text-secondary/80">
          {remaining.slice(italicIdx + 1, end)}
        </em>,
      );
      remaining = remaining.slice(end + 1);
    }
  }
  return parts;
}

// ── Block Renderer ────────────────────────────────────────────────────────────

export function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let inFence = false;
  let fenceLang = "";
  let fenceLines: string[] = [];
  let tableBuffer: string[][] = [];
  let inTable = false;

  const flushFence = (key: number) => {
    nodes.push(<CodeBlock key={key} code={fenceLines.join("\n")} language={fenceLang} />);
    fenceLines = [];
    fenceLang = "";
  };

  const flushTable = (key: number) => {
    if (tableBuffer.length >= 2) {
      nodes.push(<MarkdownTable key={key} rows={tableBuffer} />);
    }
    tableBuffer = [];
    inTable = false;
  };

  lines.forEach((line, i) => {
    // ── Fenced code blocks ──────────────────────────────────────
    if (line.startsWith("```")) {
      if (inTable) {
        flushTable(i);
      }
      if (inFence) {
        flushFence(i);
        inFence = false;
      } else {
        inFence = true;
        fenceLang = line.slice(3).trim();
      }
      return;
    }
    if (inFence) {
      fenceLines.push(line);
      return;
    }

    // ── Table rows (pipe-delimited) ─────────────────────────────
    if (/^\|.+\|$/.test(line.trim())) {
      const cells = line.trim().slice(1, -1).split("|");
      if (!inTable) {
        inTable = true;
      }
      tableBuffer.push(cells);
      return;
    } else if (inTable) {
      flushTable(i);
    }

    // ── Horizontal rule ─────────────────────────────────────────
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      nodes.push(<hr key={i} className="my-3 border-border/30" />);
      return;
    }

    // ── Headers ─────────────────────────────────────────────────
    if (line.startsWith("#### ")) {
      nodes.push(
        <h4 key={i} className="font-semibold text-[12px] mt-2 mb-0.5 text-text-primary">
          {renderInline(line.slice(5), i)}
        </h4>,
      );
    } else if (line.startsWith("### ")) {
      nodes.push(
        <h3 key={i} className="font-semibold text-[13px] mt-2 mb-1 text-text-primary">
          {renderInline(line.slice(4), i)}
        </h3>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2 key={i} className="font-semibold text-sm mt-3 mb-1 text-text-heading">
          {renderInline(line.slice(3), i)}
        </h2>,
      );
    } else if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={i} className="font-bold text-base mt-3 mb-2 text-text-heading">
          {renderInline(line.slice(2), i)}
        </h1>,
      );
    }

    // ── Blockquotes ─────────────────────────────────────────────
    else if (line.startsWith("> ")) {
      nodes.push(
        <blockquote
          key={i}
          className="border-l-2 border-accent/40 pl-3 italic text-text-muted my-1.5"
        >
          {renderInline(line.slice(2), i)}
        </blockquote>,
      );
    }

    // ── Checkbox lists ──────────────────────────────────────────
    else if (/^[-*] \[[ xX]\] /.test(line)) {
      const checked = /^[-*] \[[xX]\]/.test(line);
      const content = line.replace(/^[-*] \[[ xX]\] /, "");
      nodes.push(
        <li key={i} className="ml-4 flex items-start gap-1.5 my-0.5">
          <span
            className={`mt-0.5 w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] shrink-0 ${
              checked ? "bg-success/20 border-success text-success" : "border-border"
            }`}
          >
            {checked ? "✓" : ""}
          </span>
          <span className={checked ? "line-through text-text-muted" : ""}>
            {renderInline(content, i)}
          </span>
        </li>,
      );
    }

    // ── Unordered lists ─────────────────────────────────────────
    else if (/^[-*] /.test(line)) {
      nodes.push(
        <li key={i} className="ml-4 flex items-start gap-1.5 my-0.5">
          <span className="text-accent/60 mt-1 text-[8px]">●</span>
          <span>{renderInline(line.slice(2), i)}</span>
        </li>,
      );
    }

    // ── Ordered lists ───────────────────────────────────────────
    else if (/^\d+\. /.test(line)) {
      const match = line.match(/^(\d+)\. (.*)$/);
      if (match) {
        nodes.push(
          <li key={i} className="ml-4 flex items-start gap-1.5 my-0.5">
            <span className="text-accent/60 font-mono text-[10px] mt-0.5 min-w-[16px] text-right shrink-0">
              {match[1]}.
            </span>
            <span>{renderInline(match[2] ?? "", i)}</span>
          </li>,
        );
      }
    }

    // ── Image embeds ────────────────────────────────────────────
    else if (/^!\[([^\]]*)\]\(([^)]+)\)/.test(line)) {
      const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)/.exec(line);
      if (imgMatch) {
        const alt = imgMatch[1] ?? "";
        const rawSrc = imgMatch[2] ?? "";
        let src = rawSrc.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):8080\//, "/sandbox-files/");
        src = src.replace(/\/sandbox-files\/workspace\//, "/sandbox-files/");
        const isVideo = /\.(mp4|webm|avi|mov|mkv)$/i.test(src);
        const isAudio = /\.(mp3|wav|ogg|flac|aac)$/i.test(src);

        if (isVideo) {
          nodes.push(
            <div
              key={i}
              className="my-2 rounded-lg overflow-hidden border border-border/30 max-w-lg"
            >
              <video
                src={src}
                controls
                preload="metadata"
                className="w-full max-h-80 bg-black"
                aria-label={alt || "Generated video"}
              />
              {alt && (
                <p className="text-[9px] text-text-muted px-2 py-1 bg-bg-secondary/40 text-center">
                  {alt}
                </p>
              )}
            </div>,
          );
        } else if (isAudio) {
          nodes.push(
            <div
              key={i}
              className="my-2 rounded-lg overflow-hidden border border-border/30 max-w-md p-2 bg-bg-secondary/30"
            >
              <audio
                src={src}
                controls
                preload="metadata"
                className="w-full"
                aria-label={alt || "Generated audio"}
              />
              {alt && <p className="text-[9px] text-text-muted text-center mt-1">{alt}</p>}
            </div>,
          );
        } else {
          nodes.push(
            <div
              key={i}
              className="my-2 rounded-lg overflow-hidden border border-border/30 max-w-md"
            >
              <img src={src} alt={alt} className="w-full object-contain max-h-64" loading="lazy" />
              {alt && (
                <p className="text-[9px] text-text-muted px-2 py-1 bg-bg-secondary/40 text-center">
                  {alt}
                </p>
              )}
            </div>,
          );
        }
      }
    }

    // ── Empty lines ─────────────────────────────────────────────
    else if (line.trim() === "") {
      nodes.push(<div key={i} className="h-1" />);
    }

    // ── Regular paragraphs ──────────────────────────────────────
    else {
      nodes.push(
        <p key={i} className="leading-relaxed">
          {renderInline(line, i)}
        </p>,
      );
    }
  });

  if (inFence) {
    flushFence(lines.length);
  }
  if (inTable) {
    flushTable(lines.length);
  }
  return nodes;
}
