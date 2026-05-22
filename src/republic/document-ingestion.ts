/**
 * Republic Platform — Document Ingestion & Multimodal Processing
 *
 * Phase 16: Pluggable document ingestion pipeline with format detection,
 * text extraction, chunking, embedding-ready output, and search indexing.
 *
 * Supports: Plain text, Markdown, JSON, HTML, CSV, and URL content.
 * Extensible via registerExtractor() for PDF, audio, video, images.
 *
 * Research basis:
 * - RAG pipeline best practices (semantic chunking)
 * - LlamaIndex-style document transformations
 * - Multimodal AI pipelines (audio → text, image → text)
 *
 * Key capabilities:
 * 1. ingestDocument() — format detection + extraction + chunking
 * 2. searchIngested() — search across all ingested documents
 * 3. registerExtractor() — add custom format handlers
 * 4. getIngestedDocument() — retrieve stored document by ID
 */

import { ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type DocumentFormat =
  | "text" | "markdown" | "json" | "html" | "csv"
  | "pdf" | "audio" | "video" | "image" | "url" | "unknown";

export interface DocumentChunk {
  id: string;
  documentId: string;
  content: string;
  index: number;
  metadata: Record<string, unknown>;
  tokenEstimate: number;
}

export interface IngestedDocument {
  id: string;
  title: string;
  format: DocumentFormat;
  source: string;
  citizenId: string;
  chunks: DocumentChunk[];
  totalChunks: number;
  totalTokens: number;
  extractedAt: string;
  metadata: Record<string, unknown>;
}

export interface IngestionResult {
  documentId: string;
  title: string;
  format: DocumentFormat;
  chunksCreated: number;
  totalTokens: number;
  durationMs: number;
  warnings: string[];
}

export interface IngestionSearchResult {
  documentId: string;
  chunkId: string;
  content: string;
  score: number;
  documentTitle: string;
  chunkIndex: number;
}

export interface IngestionDiagnostics {
  totalDocuments: number;
  totalChunks: number;
  totalTokens: number;
  formatBreakdown: Record<string, number>;
  avgChunksPerDoc: number;
}

// ─── State ──────────────────────────────────────────────────────

const documents = new Map<string, IngestedDocument>();
const MAX_DOCUMENTS = 2000;
const DEFAULT_CHUNK_SIZE = 512;  // tokens
const CHUNK_OVERLAP = 64;        // tokens overlap between chunks

// ─── Custom Extractors ──────────────────────────────────────────

type ExtractorFn = (content: string, metadata?: Record<string, unknown>) => {
  text: string;
  metadata?: Record<string, unknown>;
};
const extractors = new Map<DocumentFormat, ExtractorFn>();

/**
 * Register a custom extractor for a document format.
 */
export function registerExtractor(format: DocumentFormat, extractor: ExtractorFn): void {
  extractors.set(format, extractor);
}

// ─── Format Detection ───────────────────────────────────────────

/**
 * Detect document format from content and optional filename.
 */
export function detectFormat(content: string, filename?: string): DocumentFormat {
  const ext = filename?.split(".").pop()?.toLowerCase();

  // Extension-based detection
  const extMap: Record<string, DocumentFormat> = {
    md: "markdown", markdown: "markdown",
    json: "json", jsonl: "json",
    html: "html", htm: "html",
    csv: "csv", tsv: "csv",
    pdf: "pdf",
    txt: "text",
    mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio",
    mp4: "video", avi: "video", mkv: "video", webm: "video", mov: "video",
    png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image",
  };

  if (ext && extMap[ext]) {return extMap[ext];}

  // Content-based detection
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {return "json";}
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {return "html";}
  if (trimmed.startsWith("# ") || /^#{1,6}\s/m.test(trimmed)) {return "markdown";}
  if (/^https?:\/\//.test(trimmed) && !trimmed.includes("\n")) {return "url";}
  if (/^[\w"]+[,\t][\w"]+/m.test(trimmed)) {return "csv";}

  return "text";
}

// ─── Text Extraction ────────────────────────────────────────────

/**
 * Extract text from document content based on format.
 */
function extractText(content: string, format: DocumentFormat): {
  text: string;
  metadata: Record<string, unknown>;
} {
  // Check for custom extractor
  const customExtractor = extractors.get(format);
  if (customExtractor) {
    const result = customExtractor(content);
    return { text: result.text, metadata: result.metadata ?? {} };
  }

  switch (format) {
    case "html": {
      // Strip HTML tags, decode entities
      const stripped = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { text: stripped, metadata: { originalFormat: "html" } };
    }

    case "json": {
      try {
        const parsed = JSON.parse(content);
        const text = typeof parsed === "string"
          ? parsed
          : JSON.stringify(parsed, null, 2);
        return { text, metadata: { originalFormat: "json", keys: Object.keys(parsed) } };
      } catch {
        return { text: content, metadata: { originalFormat: "json", parseError: true } };
      }
    }

    case "csv": {
      // Convert CSV to readable text
      const lines = content.split("\n").filter(l => l.trim());
      const headers = lines[0]?.split(/[,\t]/).map(h => h.trim().replace(/^"|"$/g, ""));
      const rows = lines.slice(1).map(l => l.split(/[,\t]/).map(c => c.trim().replace(/^"|"$/g, "")));
      const text = rows.map(row =>
        row.map((cell, i) => `${headers?.[i] ?? `col${i}`}: ${cell}`).join(", ")
      ).join("\n");
      return { text, metadata: { originalFormat: "csv", headers, rowCount: rows.length } };
    }

    case "markdown": {
      // Strip markdown formatting but preserve structure
      const stripped = content
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/```[\s\S]*?```/g, "[code block]")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .trim();
      return { text: stripped, metadata: { originalFormat: "markdown" } };
    }

    default:
      return { text: content, metadata: { originalFormat: format } };
  }
}

// ─── Chunking ───────────────────────────────────────────────────

/**
 * Split text into semantic chunks with token-budget constraints.
 * Uses paragraph boundaries when possible, falls back to sentence splitting.
 */
export function chunkText(
  text: string,
  documentId: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP,
): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  const charSize = chunkSize * 4; // ~4 chars per token
  const charOverlap = overlap * 4;

  // Split by paragraphs first
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > charSize && currentChunk.length > 0) {
      // Emit current chunk
      chunks.push({
        id: `chunk-${uid().slice(0, 8)}`,
        documentId,
        content: currentChunk.trim(),
        index: chunkIndex,
        metadata: {},
        tokenEstimate: Math.ceil(currentChunk.length / 4),
      });
      chunkIndex++;

      // Keep overlap from end of current chunk
      const overlapText = currentChunk.slice(-charOverlap);
      currentChunk = overlapText + "\n\n" + para;
    } else {
      currentChunk += (currentChunk.length > 0 ? "\n\n" : "") + para;
    }
  }

  // Emit remaining content
  if (currentChunk.trim().length > 0) {
    chunks.push({
      id: `chunk-${uid().slice(0, 8)}`,
      documentId,
      content: currentChunk.trim(),
      index: chunkIndex,
      metadata: {},
      tokenEstimate: Math.ceil(currentChunk.length / 4),
    });
  }

  return chunks;
}

// ─── Ingestion Pipeline ─────────────────────────────────────────

/**
 * Ingest a document: detect format → extract text → chunk → index.
 */
export function ingestDocument(
  content: string,
  citizenId: string,
  opts?: {
    title?: string;
    source?: string;
    filename?: string;
    chunkSize?: number;
    metadata?: Record<string, unknown>;
  },
): IngestionResult {
  const startMs = Date.now();
  const warnings: string[] = [];

  const format = detectFormat(content, opts?.filename);
  const { text, metadata: extractMeta } = extractText(content, format);

  if (text.trim().length === 0) {
    warnings.push("No text extracted from document");
  }

  const docId = `doc-${uid().slice(0, 8)}`;
  const title = opts?.title ?? opts?.filename ?? `Document ${documents.size + 1}`;
  const chunks = chunkText(text, docId, opts?.chunkSize);
  const totalTokens = chunks.reduce((s, c) => s + c.tokenEstimate, 0);

  const doc: IngestedDocument = {
    id: docId,
    title,
    format,
    source: opts?.source ?? "direct",
    citizenId,
    chunks,
    totalChunks: chunks.length,
    totalTokens,
    extractedAt: ts(),
    metadata: { ...extractMeta, ...opts?.metadata },
  };

  documents.set(docId, doc);

  // Evict oldest if over limit
  if (documents.size > MAX_DOCUMENTS) {
    const oldestKey = documents.keys().next().value;
    if (oldestKey) {documents.delete(oldestKey);}
  }

  return {
    documentId: docId,
    title,
    format,
    chunksCreated: chunks.length,
    totalTokens,
    durationMs: Date.now() - startMs,
    warnings,
  };
}

/**
 * Ingest from a URL (fetches and ingests content).
 */
export async function ingestURL(
  url: string,
  citizenId: string,
  opts?: { title?: string },
): Promise<IngestionResult> {
  try {
    const http = url.startsWith("https") ? await import("node:https") : await import("node:http");

    const content = await new Promise<string>((resolve, reject) => {
      const req = http.get(url, { timeout: 15000 }, (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    });

    return ingestDocument(content, citizenId, {
      title: opts?.title ?? url.split("/").pop() ?? url,
      source: url,
      metadata: { url },
    });
  } catch (err: unknown) {
    return {
      documentId: "",
      title: url,
      format: "unknown",
      chunksCreated: 0,
      totalTokens: 0,
      durationMs: 0,
      warnings: [`Failed to fetch URL: ${err instanceof Error ? err.message : "unknown error"}`],
    };
  }
}

// ─── Search ─────────────────────────────────────────────────────

/**
 * Search across all ingested documents.
 * Uses term-overlap scoring (lightweight but effective).
 */
export function searchIngested(
  query: string,
  opts?: { citizenId?: string; topK?: number; format?: DocumentFormat },
): IngestionSearchResult[] {
  const topK = opts?.topK ?? 10;
  const queryTerms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2);
  const results: IngestionSearchResult[] = [];

  for (const doc of documents.values()) {
    if (opts?.citizenId && doc.citizenId !== opts.citizenId) {continue;}
    if (opts?.format && doc.format !== opts.format) {continue;}

    for (const chunk of doc.chunks) {
      const lower = chunk.content.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (lower.includes(term)) {score += 1 / queryTerms.length;}
      }

      if (score > 0) {
        results.push({
          documentId: doc.id,
          chunkId: chunk.id,
          content: chunk.content.slice(0, 500),
          score,
          documentTitle: doc.title,
          chunkIndex: chunk.index,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// ─── Document Access ────────────────────────────────────────────

export function getIngestedDocument(docId: string): IngestedDocument | undefined {
  return documents.get(docId);
}

export function listIngestedDocuments(citizenId?: string): IngestedDocument[] {
  let docs = [...documents.values()];
  if (citizenId) {docs = docs.filter(d => d.citizenId === citizenId);}
  return docs;
}

export function deleteIngestedDocument(docId: string): boolean {
  return documents.delete(docId);
}

// ─── Diagnostics ────────────────────────────────────────────────

export function ingestionDiagnostics(): IngestionDiagnostics {
  const allDocs = [...documents.values()];
  const formatBreakdown: Record<string, number> = {};
  let totalChunks = 0;
  let totalTokens = 0;

  for (const doc of allDocs) {
    formatBreakdown[doc.format] = (formatBreakdown[doc.format] ?? 0) + 1;
    totalChunks += doc.totalChunks;
    totalTokens += doc.totalTokens;
  }

  return {
    totalDocuments: allDocs.length,
    totalChunks,
    totalTokens,
    formatBreakdown,
    avgChunksPerDoc: allDocs.length > 0 ? totalChunks / allDocs.length : 0,
  };
}

// ─── State Reset (Testing) ──────────────────────────────────────

export function resetIngestionState(): void {
  documents.clear();
  extractors.clear();
}
