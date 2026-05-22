/**
 * Republic Platform — Content Validator
 *
 * Universal validity guards for all content types produced by the orchestrator.
 * Prevents empty, truncated, or corrupted LLM output from being silently saved.
 *
 * Usage:
 *   assertContentValid(content, "code")      // throws on invalid
 *   assertContentValid(content, "file_map")  // throws on empty map
 *
 * Supported kinds:
 *   code       — TypeScript/JavaScript/Python/etc. source files
 *   json       — Structured JSON (must parse, must not be trivially empty)
 *   file_map   — { path: content } map from LLM (each value must be non-trivial code)
 *   plan       — { plan: [...] } from LLM (must have at least 1 item)
 *   text       — Prose/report/markdown (must be non-empty, non-whitespace)
 *   markdown   — Markdown document (min length, must contain meaningful content)
 *   svg        — SVG image (must have <svg ... </svg> tags)
 *   image_url  — HTTP or data: URL for a generated image
 *   audio_b64  — Base64-encoded audio (must be substantial length)
 *   shell      — Shell script (min length, has at least one command token)
 */

// ─── Content Kind ───────────────────────────────────────────────

export type ContentKind =
  | "code"
  | "json"
  | "file_map"
  | "plan"
  | "text"
  | "markdown"
  | "svg"
  | "image_url"
  | "audio_b64"
  | "shell";

/** Validation error thrown when content fails validity checks */
export class ContentValidationError extends Error {
  constructor(
    public readonly kind: ContentKind,
    public readonly reason: string,
    public readonly contentLength: number,
  ) {
    super(`[${kind}] Content validation failed: ${reason} (length: ${contentLength})`);
    this.name = "ContentValidationError";
  }
}

// ─── Minimum Length Thresholds ──────────────────────────────────

const MIN_LENGTHS: Record<ContentKind, number> = {
  code:      30,    // at least 30 chars — catches empty or one-liner stubs
  json:       2,    // minimum `{}` — but we check substance beyond that
  file_map:   2,    // the map itself; individual values validated separately
  plan:       2,    // the JSON; validated structurally
  text:      20,    // minimum paragraph
  markdown:  50,    // at least a meaningful sentence + formatting
  svg:       60,    // `<svg ...></svg>` with some content
  image_url: 10,    // URL must be non-trivially short
  audio_b64: 100,   // base64 audio — at minimum a few hundred bytes of actual data
  shell:     10,    // at least one command
};

// ─── Validators ─────────────────────────────────────────────────

/** Detect if a string is just a JSON wrapper with no real content */
function isEmptyJsonWrapper(s: string): boolean {
  const t = s.trim();
  return t === "{}" || t === "[]" || t === "{ }" || t === "[ ]";
}

/** Detect code that is suspiciously thin (just a function stub or comment) */
function isCodeStub(s: string): boolean {
  const t = s.trim();
  // Pure comment block
  if (t.startsWith("//") && !t.includes("\n")) { return true; }
  // Tiny stub: just `function foo() {}` or similar
  if (t.length < 30) { return true; }
  // JSON wrapper pretending to be code
  if (isEmptyJsonWrapper(t)) { return true; }
  // Just whitespace or empty
  if (!t || !/\S/.test(t)) { return true; }
  return false;
}

/** Validate a parsed file_map's individual file content */
function validateFileMapEntry(filePath: string, content: string): void {
  if (!filePath || filePath.startsWith("{")) {
    throw new ContentValidationError("file_map", `Invalid file path: "${filePath}"`, filePath.length);
  }
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "txt";
  const isCodeFile = ["ts","tsx","js","jsx","py","go","rs","java","cs","cpp","c","rb","php"].includes(ext);
  const minLen = isCodeFile ? 30 : 10;
  if (!content || content.trim().length < minLen) {
    throw new ContentValidationError(
      "file_map",
      `File "${filePath}" has insufficient content (${content?.length ?? 0} chars, min ${minLen})`,
      content?.length ?? 0,
    );
  }
  if (isCodeFile && isCodeStub(content)) {
    throw new ContentValidationError(
      "file_map",
      `File "${filePath}" appears to be an empty stub`,
      content.length,
    );
  }
}

/** Check if base64 string looks valid (only base64 chars + padding) */
function isValidBase64(s: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s.trim());
}

// ─── Main Validator ─────────────────────────────────────────────

/**
 * Assert that content meets validity requirements for its kind.
 * Throws `ContentValidationError` if invalid.
 *
 * @param content - The string content to validate
 * @param kind    - What type of content this is
 */
export function assertContentValid(content: string | null | undefined, kind: ContentKind): void {
  // Guard against null/undefined
  if (content === null || content === undefined) {
    throw new ContentValidationError(kind, "Content is null or undefined", 0);
  }

  const trimmed = content.trim();
  const minLen = MIN_LENGTHS[kind];

  // Length check
  if (trimmed.length < minLen) {
    throw new ContentValidationError(
      kind,
      `Too short (${trimmed.length} chars, minimum ${minLen})`,
      trimmed.length,
    );
  }

  // Kind-specific checks
  switch (kind) {
    case "code": {
      if (isCodeStub(trimmed)) {
        throw new ContentValidationError(kind, "Content appears to be an empty stub or JSON wrapper", trimmed.length);
      }
      // Must contain at least one code token (keyword, operator, bracket)
      if (!/[(){}[\];=><]/.test(trimmed) && !/\b(def |function |class |import |export |const |let |var |return )\b/.test(trimmed)) {
        throw new ContentValidationError(kind, "Does not look like code (no recognizable tokens)", trimmed.length);
      }
      break;
    }

    case "json": {
      if (isEmptyJsonWrapper(trimmed)) {
        throw new ContentValidationError(kind, "JSON is an empty object/array with no data", trimmed.length);
      }
      try {
        JSON.parse(trimmed);
      } catch {
        // Try to find embedded JSON and parse that
        const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (!match) {
          throw new ContentValidationError(kind, "Not valid JSON", trimmed.length);
        }
        try {
          JSON.parse(match[0]);
        } catch {
          throw new ContentValidationError(kind, "Embedded JSON is also invalid", trimmed.length);
        }
      }
      break;
    }

    case "file_map": {
      // Parse and validate each entry
      let parsed: Record<string, unknown>;
      try {
        const raw = JSON.parse(trimmed);
        parsed = (raw.files as Record<string, unknown>) ?? raw;
      } catch {
        throw new ContentValidationError(kind, "Cannot parse file_map as JSON", trimmed.length);
      }
      const entries = Object.entries(parsed).filter(
        ([k, v]) => typeof v === "string" && !k.startsWith("{"),
      );
      if (entries.length === 0) {
        throw new ContentValidationError(kind, "file_map contains no valid file entries", trimmed.length);
      }
      for (const [path, content] of entries) {
        validateFileMapEntry(path, content as string);
      }
      break;
    }

    case "plan": {
      let parsed: { plan?: unknown[] };
      try {
        parsed = JSON.parse(trimmed) as { plan?: unknown[] };
      } catch {
        throw new ContentValidationError(kind, "Cannot parse plan as JSON", trimmed.length);
      }
      if (!Array.isArray(parsed.plan) || parsed.plan.length === 0) {
        throw new ContentValidationError(kind, "Plan array is missing or empty", trimmed.length);
      }
      break;
    }

    case "text":
    case "markdown": {
      // Must contain actual words (ASCII/unicode letters)
      if (!/\p{L}/u.test(trimmed)) {
        throw new ContentValidationError(kind, "Contains no readable text", trimmed.length);
      }
      // Must not be ALL whitespace / line breaks
      if (!/\S{3,}/.test(trimmed)) {
        throw new ContentValidationError(kind, "Contains only whitespace or very short tokens", trimmed.length);
      }
      break;
    }

    case "svg": {
      if (!/<svg[\s>]/i.test(trimmed)) {
        throw new ContentValidationError(kind, "Missing <svg> opening tag", trimmed.length);
      }
      if (!/<\/svg>/i.test(trimmed)) {
        throw new ContentValidationError(kind, "Missing </svg> closing tag", trimmed.length);
      }
      break;
    }

    case "image_url": {
      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("data:")) {
        throw new ContentValidationError(kind, "Image URL must start with http://, https://, or data:", trimmed.length);
      }
      break;
    }

    case "audio_b64": {
      if (!isValidBase64(trimmed)) {
        throw new ContentValidationError(kind, "Content is not valid base64", trimmed.length);
      }
      // 100 chars base64 ≈ 75 bytes — far too short for any real audio
      if (trimmed.length < 1000) {
        throw new ContentValidationError(kind, `Audio base64 too short (${trimmed.length} chars)`, trimmed.length);
      }
      break;
    }

    case "shell": {
      // Must look like a shell script — has a command token
      if (!/\b(echo|ls|cd|mkdir|rm|cp|mv|cat|curl|wget|git|npm|pnpm|pip|python|node|bash|sh)\b/.test(trimmed) &&
          !trimmed.includes("$") && !trimmed.includes("./") && !trimmed.includes("|")) {
        throw new ContentValidationError(kind, "Does not look like a shell script", trimmed.length);
      }
      break;
    }
  }
}

// ─── Infer Kind from File Extension ─────────────────────────────

/** Infer the content kind from a file extension for per-file validation */
export function kindFromExtension(filePath: string): ContentKind {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": case "tsx": case "js": case "jsx":
    case "py": case "go": case "rs": case "java":
    case "cs": case "cpp": case "c": case "rb": case "php":
      return "code";
    case "json":
      return "json";
    case "md": case "mdx":
      return "markdown";
    case "svg":
      return "svg";
    case "sh": case "bash": case "zsh":
      return "shell";
    default:
      return "text";
  }
}

// ─── Snapshot / Rollback Helpers ────────────────────────────────

export interface FileSnapshot {
  relativePath: string;
  originalContent: string | null; // null = file did not exist
}

/**
 * Capture original content of files before overwriting them.
 * Use restoreSnapshots() to roll back on failure.
 */
export async function captureFileSnapshots(
  projectId: string,
  filePaths: string[],
  readFile: (projectId: string, relativePath: string) => Promise<string>,
): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];
  for (const relativePath of filePaths) {
    try {
      const originalContent = await readFile(projectId, relativePath);
      snapshots.push({ relativePath, originalContent });
    } catch {
      // File didn't exist — snapshot as null so we know to delete on rollback
      snapshots.push({ relativePath, originalContent: null });
    }
  }
  return snapshots;
}

/**
 * Restore files from snapshots, undoing any partial writes.
 * Files that didn't exist before are deleted.
 */
export async function restoreSnapshots(
  projectId: string,
  snapshots: FileSnapshot[],
  writeFile: (opts: { projectId: string; relativePath: string; content: string; language: string; citizenId: string }) => Promise<unknown>,
  deleteFile: (projectId: string, relativePath: string) => Promise<void>,
  citizenId: string,
): Promise<void> {
  for (const { relativePath, originalContent } of snapshots) {
    try {
      if (originalContent === null) {
        // File was created during the failed write — delete it
        await deleteFile(projectId, relativePath).catch(() => {});
      } else {
        // File existed — restore original content
        await writeFile({
          projectId,
          relativePath,
          content: originalContent,
          language: kindFromExtension(relativePath),
          citizenId,
        });
      }
    } catch {
      // Best-effort rollback; log but don't throw
      console.warn(`[ContentValidator] Rollback failed for ${relativePath}`);
    }
  }
}
