/**
 * Kali Semantic Search — Crawled Data → Vector DB → Intelligent Retrieval
 *
 * After httrack/scrapy/frontend-audit tools crawl a target website, this module:
 * 1. Ingests all crawled HTML pages into document-ingestion pipeline
 * 2. Tags chunks with target, scan_id, URL, and content-type metadata
 * 3. Provides semantic search over crawled content
 * 4. Analyzes content for security patterns (secrets, PII, endpoints)
 *
 * Uses the existing document-ingestion.ts pipeline (chunking + TF-IDF search)
 * and sqlite-vec vector store when available for embedding-based similarity.
 */

import { getLogger } from "../logging.js";
import {
  ingestDocument,
  searchIngested,
  listIngestedDocuments,
  type IngestionResult,
  type IngestionSearchResult,
} from "./document-ingestion.js";

const logger = getLogger();

// ─── Types ──────────────────────────────────────────────────────

export interface CrawlIngestResult {
  scanId: string;
  target: string;
  pagesIngested: number;
  totalChunks: number;
  totalTokens: number;
  errors: string[];
  durationMs: number;
}

export interface SecurityFinding {
  type: "secret" | "pii" | "endpoint" | "debug" | "admin" | "framework" | "misconfiguration";
  severity: "critical" | "high" | "medium" | "low" | "info";
  content: string;
  source: string;
  line?: number;
  context: string;
}

export interface SemanticSearchResult {
  query: string;
  scope: string;
  results: Array<{
    content: string;
    source: string;
    similarity: number;
    metadata: Record<string, unknown>;
  }>;
  totalResults: number;
}

export interface ContentAnalysisResult {
  target: string;
  scanId: string;
  findings: SecurityFinding[];
  summary: {
    totalPages: number;
    totalFindings: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
}

// ─── Security Pattern Detectors ─────────────────────────────────

const SECURITY_PATTERNS: Array<{
  type: SecurityFinding["type"];
  severity: SecurityFinding["severity"];
  pattern: RegExp;
  label: string;
}> = [
  // Secrets & Credentials
  { type: "secret", severity: "critical", pattern: /(?:api[_-]?key|apikey|api_secret)\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?/gi, label: "API Key exposed" },
  { type: "secret", severity: "critical", pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/gi, label: "Hardcoded password" },
  { type: "secret", severity: "critical", pattern: /(?:aws_access_key_id|aws_secret_access_key)\s*[:=]\s*["']?[A-Z0-9/+=]{20,}["']?/gi, label: "AWS credential exposed" },
  { type: "secret", severity: "high", pattern: /(?:bearer|token|jwt)\s+[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/gi, label: "JWT token in content" },
  { type: "secret", severity: "high", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, label: "Private key exposed" },
  { type: "secret", severity: "medium", pattern: /(?:connection[_-]?string|database[_-]?url)\s*[:=]\s*["'][^"']+["']/gi, label: "Database connection string" },

  // PII
  { type: "pii", severity: "high", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi, label: "Email addresses" },
  { type: "pii", severity: "medium", pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, label: "Phone numbers" },
  { type: "pii", severity: "high", pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, label: "SSN-like pattern" },

  // API Endpoints
  { type: "endpoint", severity: "info", pattern: /(?:\/api\/v[0-9]+\/[a-z_/-]+|\/graphql|\/rest\/[a-z_/-]+)/gi, label: "API endpoint" },
  { type: "endpoint", severity: "medium", pattern: /(?:\/admin|\/wp-admin|\/panel|\/dashboard|\/console|\/phpmy)/gi, label: "Admin panel path" },
  { type: "endpoint", severity: "low", pattern: /(?:\/\.env|\/\.git|\/\.svn|\/\.htaccess|\/web\.config)/gi, label: "Sensitive file path" },

  // Debug / Development
  { type: "debug", severity: "medium", pattern: /(?:console\.log|debugger|TODO:.*password|FIXME:.*secret)/gi, label: "Debug artifact" },
  { type: "debug", severity: "high", pattern: /(?:stack\s*trace|traceback|exception\s*in|error\s*at\s+)/gi, label: "Error disclosure" },
  { type: "debug", severity: "medium", pattern: /(?:source[_-]?map[_-]?url|\.map["']?\s*\))/gi, label: "Source map exposed" },

  // Framework fingerprints
  { type: "framework", severity: "info", pattern: /(?:x-powered-by|server:\s*(?:apache|nginx|iis|express))/gi, label: "Server framework" },
  { type: "framework", severity: "info", pattern: /(?:wp-content|wp-includes|joomla|drupal|laravel)/gi, label: "CMS fingerprint" },

  // Misconfiguration
  { type: "misconfiguration", severity: "high", pattern: /(?:access-control-allow-origin:\s*\*)/gi, label: "CORS wildcard" },
  { type: "misconfiguration", severity: "medium", pattern: /(?:x-frame-options|content-security-policy|strict-transport-security)/gi, label: "Security header" },
];

// ─── Crawl Ingestion ────────────────────────────────────────────

/**
 * Ingest crawled web pages from a Kali scan into the document store.
 * Called after httrack/scrapy complete with an array of page contents.
 */
export function ingestCrawledPages(
  pages: Array<{ url: string; content: string; statusCode?: number }>,
  target: string,
  scanId: string,
): CrawlIngestResult {
  const startMs = Date.now();
  const errors: string[] = [];
  let totalChunks = 0;
  let totalTokens = 0;
  let pagesIngested = 0;

  for (const page of pages) {
    try {
      // Skip non-HTML or empty pages
      if (!page.content || page.content.trim().length < 50) {
        continue;
      }

      const result: IngestionResult = ingestDocument(page.content, `kali-${scanId}`, {
        title: page.url,
        source: page.url,
        filename: page.url.endsWith(".html") || page.url.endsWith(".htm") ? page.url : undefined,
        metadata: {
          kaliSource: "crawl",
          target,
          scanId,
          url: page.url,
          statusCode: page.statusCode ?? 200,
          crawledAt: new Date().toISOString(),
        },
      });

      totalChunks += result.chunksCreated;
      totalTokens += result.totalTokens;
      pagesIngested++;

      if (result.warnings.length > 0) {
        errors.push(...result.warnings.map(w => `${page.url}: ${w}`));
      }
    } catch (err) {
      errors.push(`${page.url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  logger.info(`[KaliSemantic] Ingested ${pagesIngested}/${pages.length} pages for ${target} (scan ${scanId}): ${totalChunks} chunks, ~${totalTokens} tokens`);

  return {
    scanId,
    target,
    pagesIngested,
    totalChunks,
    totalTokens,
    errors,
    durationMs: Date.now() - startMs,
  };
}

/**
 * Ingest raw file content from a crawl directory (httrack output).
 * The content is a concatenation of all files with URL delimiters.
 */
export function ingestCrawlOutput(
  rawOutput: string,
  target: string,
  scanId: string,
): CrawlIngestResult {
  // Parse URL-delimited output: lines starting with "URL:" mark page boundaries
  const pages: Array<{ url: string; content: string }> = [];
  const sections = rawOutput.split(/^(?:URL|Page|File):\s*/m);

  for (const section of sections) {
    if (!section.trim()) { continue; }
    const firstNewline = section.indexOf("\n");
    if (firstNewline === -1) { continue; }
    const url = section.slice(0, firstNewline).trim();
    const content = section.slice(firstNewline + 1).trim();
    if (url && content.length > 50) {
      pages.push({ url, content });
    }
  }

  // If no URL-delimited sections, treat the whole output as a single document
  if (pages.length === 0 && rawOutput.length > 100) {
    pages.push({ url: target, content: rawOutput });
  }

  return ingestCrawledPages(pages, target, scanId);
}

// ─── Semantic Search ────────────────────────────────────────────

/**
 * Search crawled content with relevance scoring.
 * Supports scoping to a specific target/scan.
 */
export function searchCrawledContent(
  query: string,
  opts: { target?: string; scanId?: string; topK?: number } = {},
): SemanticSearchResult {
  const citizenFilter = opts.scanId ? `kali-${opts.scanId}` : undefined;
  const results: IngestionSearchResult[] = searchIngested(query, {
    citizenId: citizenFilter,
    topK: opts.topK ?? 10,
    format: "html",
  });

  // Also search non-HTML formats (markdown extracts, JSON APIs, etc.)
  const textResults = searchIngested(query, {
    citizenId: citizenFilter,
    topK: opts.topK ?? 5,
  });

  // Merge and deduplicate
  const seen = new Set<string>();
  const merged = [...results, ...textResults].filter(r => {
    if (seen.has(r.chunkId)) { return false; }
    seen.add(r.chunkId);
    return true;
  });

  // Sort by score
  merged.sort((a, b) => b.score - a.score);
  const topResults = merged.slice(0, opts.topK ?? 10);

  return {
    query,
    scope: opts.target ?? "all",
    results: topResults.map(r => ({
      content: r.content,
      source: r.documentTitle,
      similarity: r.score,
      metadata: { chunkIndex: r.chunkIndex, documentId: r.documentId },
    })),
    totalResults: merged.length,
  };
}

/**
 * Find pages with similar content (template detection, duplicates).
 */
export function findSimilarPages(
  url: string,
  opts: { scanId?: string; topK?: number } = {},
): SemanticSearchResult {
  // Get the content of the source page
  const citizenFilter = opts.scanId ? `kali-${opts.scanId}` : undefined;
  const docs = listIngestedDocuments(citizenFilter);
  const sourcePage = docs.find(d => d.metadata?.url === url);

  if (!sourcePage || !sourcePage.chunks[0]) {
    return { query: url, scope: "similar", results: [], totalResults: 0 };
  }

  // Use the first chunk as the query
  return searchCrawledContent(sourcePage.chunks[0].content.slice(0, 200), opts);
}

// ─── Content Analysis (Security Patterns) ───────────────────────

/**
 * Analyze all crawled content for a scan/target for security patterns.
 */
export function analyzeContent(
  target: string,
  scanId: string,
  focus: "secrets" | "pii" | "endpoints" | "debug" | "all" = "all",
): ContentAnalysisResult {
  const citizenId = `kali-${scanId}`;
  const docs = listIngestedDocuments(citizenId);
  const findings: SecurityFinding[] = [];

  const typeFilter: SecurityFinding["type"][] = focus === "all"
    ? ["secret", "pii", "endpoint", "debug", "admin", "framework", "misconfiguration"]
    : focus === "secrets" ? ["secret"]
    : focus === "pii" ? ["pii"]
    : focus === "endpoints" ? ["endpoint", "admin"]
    : ["debug", "framework", "misconfiguration"];

  for (const doc of docs) {
    for (const chunk of doc.chunks) {
      for (const pattern of SECURITY_PATTERNS) {
        if (!typeFilter.includes(pattern.type)) { continue; }

        const matches = chunk.content.matchAll(pattern.pattern);
        for (const match of matches) {
          // Avoid duplicate findings
          const content = match[0].slice(0, 200);
          if (findings.some(f => f.content === content && f.source === (doc.metadata?.url as string ?? doc.title))) {
            continue;
          }

          findings.push({
            type: pattern.type,
            severity: pattern.severity,
            content,
            source: (doc.metadata?.url as string) ?? doc.title,
            context: chunk.content.slice(
              Math.max(0, (match.index ?? 0) - 50),
              Math.min(chunk.content.length, (match.index ?? 0) + content.length + 50),
            ),
            label: pattern.label,
          } as SecurityFinding & { label: string });
        }
      }
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const counts = {
    criticalCount: findings.filter(f => f.severity === "critical").length,
    highCount: findings.filter(f => f.severity === "high").length,
    mediumCount: findings.filter(f => f.severity === "medium").length,
    lowCount: findings.filter(f => f.severity === "low").length,
  };

  logger.info(`[KaliSemantic] Content analysis for ${target}: ${findings.length} findings (${counts.criticalCount} critical, ${counts.highCount} high)`);

  return {
    target,
    scanId,
    findings,
    summary: {
      totalPages: docs.length,
      totalFindings: findings.length,
      ...counts,
    },
  };
}

// ─── Tool Prompt Context Builder ────────────────────────────────

/**
 * Build RAG context from crawled content for a specific tool execution.
 * The orchestrator uses this to inject relevant context into tool prompts.
 */
export function buildToolContext(
  tool: string,
  target: string,
  scanId: string,
): string {
  // Search for content relevant to the tool's purpose
  const toolQueries: Record<string, string> = {
    sqlmap: "form action input select database sql query parameter",
    nikto: "server header CGI script admin login panel",
    gobuster: "directory link href path admin api endpoint",
    wpscan: "WordPress plugin theme wp-content wp-includes version",
    hydra: "login form username password authentication",
    sslyze: "certificate SSL TLS HTTPS cipher protocol",
    "js-analysis": "script src javascript function API fetch axios",
    "frontend-audit": "meta viewport responsive design CSS framework accessibility",
  };

  const query = toolQueries[tool] ?? `${tool} security scan vulnerability`;
  const results = searchCrawledContent(query, { scanId, topK: 5 });

  if (results.results.length === 0) {
    return `No crawled content available for ${target}. The tool will rely on live scanning.`;
  }

  const context = results.results
    .map((r, i) => `[${i + 1}] ${r.source}\n${r.content.slice(0, 300)}`)
    .join("\n\n");

  return `CRAWLED CONTENT CONTEXT for ${tool} on ${target}:\n${context}\n\nUse this context to guide your scan parameters and focus areas.`;
}
