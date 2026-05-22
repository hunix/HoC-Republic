/**
 * Chat Feature — Syntax Highlighting
 *
 * Lightweight dependency-free code highlighter supporting
 * JavaScript/TypeScript, Python, Rust, JSON, and generic code.
 * Extracted from markdown.tsx per DDD rules (static data must be in separate files).
 */

import { Copy, Check } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";

// ── Keyword Sets (static data — separate from logic per DDD) ────────────────

export const KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "class",
  "extends",
  "new",
  "this",
  "import",
  "export",
  "from",
  "default",
  "try",
  "catch",
  "throw",
  "async",
  "await",
  "yield",
  "typeof",
  "instanceof",
  "switch",
  "case",
  "break",
  "continue",
  "do",
  "in",
  "of",
  "with",
  "void",
  "delete",
  "true",
  "false",
  "null",
  "undefined",
  "NaN",
  "Infinity",
  "def",
  "print",
  "self",
  "elif",
  "lambda",
  "None",
  "True",
  "False",
  "raise",
  "except",
  "finally",
  "pass",
  "global",
  "nonlocal",
  "assert",
  "is",
  "not",
  "and",
  "or",
  "as",
  "interface",
  "type",
  "enum",
  "implements",
  "abstract",
  "readonly",
  "private",
  "public",
  "protected",
  "static",
  "super",
  "package",
  "struct",
  "fn",
  "pub",
  "mod",
  "use",
  "impl",
  "trait",
  "where",
  "mut",
  "ref",
  "match",
  "loop",
  "move",
  "crate",
  "extern",
]);

export const TYPE_KEYWORDS = new Set([
  "string",
  "number",
  "boolean",
  "any",
  "void",
  "never",
  "unknown",
  "object",
  "int",
  "float",
  "double",
  "char",
  "long",
  "short",
  "byte",
  "bool",
  "str",
  "dict",
  "list",
  "tuple",
  "set",
  "i32",
  "i64",
  "u32",
  "u64",
  "f32",
  "f64",
  "String",
  "Array",
  "Object",
  "Map",
  "Set",
  "Promise",
  "React",
  "Record",
]);

// ── Highlight Helpers ───────────────────────────────────────────────────────

export function highlightNumbers(text: string): React.ReactNode {
  const parts = text.split(/(\b\d+\.?\d*\b)/);
  if (parts.length <= 1) {
    return text;
  }
  return parts.map((p, i) =>
    /^\d/.test(p) ? (
      <span key={i} className="text-warning">
        {p}
      </span>
    ) : (
      p
    ),
  );
}

export function highlightJsonLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const strRegex = /"(?:[^"\\]|\\.)*"/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let k = 0;
  while ((match = strRegex.exec(line)) !== null) {
    if (match.index > lastIdx) {
      const between = line.slice(lastIdx, match.index);
      parts.push(<span key={k++}>{highlightNumbers(between)}</span>);
    }
    const next = line[match.index + match[0].length];
    const isKey = next === ":";
    parts.push(
      <span key={k++} className={isKey ? "text-accent" : "text-success"}>
        {match[0]}
      </span>,
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < line.length) {
    parts.push(<span key={k++}>{highlightNumbers(line.slice(lastIdx))}</span>);
  }
  return parts;
}

export function tokenizeLine(line: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokenRe =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b([a-zA-Z_]\w*)\b|(\b\d+\.?\d*\b)|([^\s\w]+|\s+)/g;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = tokenRe.exec(line)) !== null) {
    const token = m[0];
    if (m[1]) {
      parts.push(
        <span key={k++} className="text-success">
          {token}
        </span>,
      );
    } else if (m[2]) {
      if (KEYWORDS.has(token)) {
        parts.push(
          <span key={k++} className="text-purple font-medium">
            {token}
          </span>,
        );
      } else if (TYPE_KEYWORDS.has(token)) {
        parts.push(
          <span key={k++} className="text-info">
            {token}
          </span>,
        );
      } else {
        parts.push(<span key={k++}>{token}</span>);
      }
    } else if (m[3]) {
      parts.push(
        <span key={k++} className="text-warning">
          {token}
        </span>,
      );
    } else {
      parts.push(<span key={k++}>{token}</span>);
    }
  }
  return parts;
}

export function highlightCode(code: string, lang: string): React.ReactNode[] {
  const isComment = (l: string) =>
    l.trimStart().startsWith("//") ||
    l.trimStart().startsWith("#") ||
    l.trimStart().startsWith("--");

  if (lang === "json") {
    return code.split("\n").map((line, i) => (
      <span key={i}>
        {i > 0 && "\n"}
        {highlightJsonLine(line)}
      </span>
    ));
  }

  return code.split("\n").map((line, i) => {
    if (isComment(line)) {
      return (
        <span key={i}>
          {i > 0 && "\n"}
          <span className="text-text-muted/60 italic">{line}</span>
        </span>
      );
    }
    return (
      <span key={i}>
        {i > 0 && "\n"}
        {tokenizeLine(line)}
      </span>
    );
  });
}

// ── Code Block Component ────────────────────────────────────────────────────

export function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayLang = language || "text";

  useEffect(
    () => () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const highlighted = highlightCode(code, displayLang);

  return (
    <div className="group/code relative my-2 rounded-lg overflow-hidden border border-border/40">
      <div className="flex items-center justify-between px-3 py-1 bg-bg-secondary/80 border-b border-border/30">
        <span className="text-[9px] font-mono text-text-muted uppercase tracking-wider">
          {displayLang}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 text-[9px] text-text-muted hover:text-accent transition-colors"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check size={9} className="text-success" /> Copied
            </>
          ) : (
            <>
              <Copy size={9} /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="bg-bg-primary/60 p-3 overflow-x-auto text-[11px] font-mono leading-relaxed text-text-secondary">
        <code>{highlighted}</code>
      </pre>
    </div>
  );
}
