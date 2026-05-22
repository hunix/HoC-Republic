/**
 * World Intelligence — Academic Security Paper Scraper
 *
 * Scrapes ArXiv for newly published papers in Cryptography and Security (cs.CR).
 * Acts as the proactive RAG feed for Vulnerability Researcher agents.
 *
 * Phase 1 Design: relies exclusively on the RSS atom abstracts — no PDF
 * download or full-text extraction. This keeps ingestion lightweight and safe.
 */

export interface AcademicPaper {
  id: string;
  title: string;
  /** Full abstract from the ArXiv atom feed — the sole content source in Phase 1 */
  abstract: string;
  authors: string[];
  publishedAt: number;
  url: string;
  pdfUrl: string;
  /** Which exploit-relevant keywords were found in the title/abstract */
  matchedKeywords: string[];
}

// Ordered list of high-signal exploit keywords used for triage filtering.
// Papers that match none of these are silently discarded.
export const EXPLOIT_KEYWORDS = [
  "exploit",
  "cve",
  "0-day",
  "zero-day",
  "vulnerability",
  "fuzz",
  "rce",
  "bypass",
  "buffer overflow",
  "heap",
  "sandbox escape",
  "privilege escalation",
  "memory corruption",
  "code injection",
  "shellcode",
  "malware",
  "ransomware",
  "attack vector",
  "threat model",
  "adversarial",
];

// Global in-memory cache of already parsed ArXiv IDs to prevent RAG duplication.
// Bounded at 10 000 entries — oldest IDs are evicted FIFO.
const arxivSeenState = new Set<string>();

// Backoff state for ArXiv API rate limiting
let _arxivConsecutiveFailures = 0;
let _arxivBackoffUntil = 0;

/**
 * Polls the ArXiv Export API for recent `cs.CR` submissions.
 * Returns only papers that have at least one `EXPLOIT_KEYWORDS` hit.
 * Previously-seen papers are skipped based on the in-memory cache.
 */
export async function pollArxivSecurityPapers(maxResults: number = 50): Promise<AcademicPaper[]> {
  // Exponential backoff: skip if we're still in a cooldown period
  if (Date.now() < _arxivBackoffUntil) {
    return [];
  }

  const url = `https://export.arxiv.org/api/query?search_query=cat:cs.CR&sortBy=submittedDate&sortOrder=desc&max_results=${maxResults}`;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "HoC-Intelligence/1.0 (cyber-research-monitor)" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      _arxivConsecutiveFailures++;
      // Only log the first 2 failures, then suppress until recovery
      if (_arxivConsecutiveFailures <= 2) {
        console.warn(`[ArXivScraper] HTTP ${response.status} — skipping this poll cycle.`);
      } else if (_arxivConsecutiveFailures === 3) {
        const backoffMin = Math.min(30, 5 * _arxivConsecutiveFailures);
        _arxivBackoffUntil = Date.now() + backoffMin * 60_000;
        console.warn(
          `[ArXivScraper] ${_arxivConsecutiveFailures} consecutive failures — backing off ${backoffMin}min`,
        );
      }
      return [];
    }

    const xml = await response.text();
    // Success: reset backoff state
    if (_arxivConsecutiveFailures > 0) {
      console.log(`[ArXivScraper] Recovered after ${_arxivConsecutiveFailures} failures`);
      _arxivConsecutiveFailures = 0;
      _arxivBackoffUntil = 0;
    }

    // Fast regex Atom entry extraction (no heavy XML parser dependency)
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const entries: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(xml)) !== null) {
      entries.push(m[1]);
    }

    const papers: AcademicPaper[] = [];

    for (const entry of entries) {
      const idMatch = /<id>(.*?)<\/id>/.exec(entry);
      const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry);
      const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry);
      const publishedMatch = /<published>(.*?)<\/published>/.exec(entry);

      if (!idMatch || !titleMatch || !summaryMatch || !publishedMatch) {
        continue;
      }

      const rawId = idMatch[1].trim();
      const idStr = rawId.split("/abs/").pop() ?? rawId;

      // Dedup — skip if we've seen this paper before
      if (arxivSeenState.has(idStr)) {
        continue;
      }

      // Extract authors
      const authorRegex = /<author>\s*<name>(.*?)<\/name>\s*<\/author>/g;
      const authors: string[] = [];
      let am: RegExpExecArray | null;
      while ((am = authorRegex.exec(entry)) !== null) {
        authors.push(am[1].trim());
      }

      const title = titleMatch[1].replace(/\n/g, " ").trim();
      const abstract = summaryMatch[1].replace(/\n/g, " ").trim();

      // Keyword triage — only keep papers that match at least one high-signal term
      const haystack = (title + " " + abstract).toLowerCase();
      const matchedKeywords = EXPLOIT_KEYWORDS.filter((kw) => haystack.includes(kw));
      if (matchedKeywords.length === 0) {
        continue;
      }

      const paper: AcademicPaper = {
        id: idStr,
        title,
        abstract,
        authors,
        publishedAt: new Date(publishedMatch[1].trim()).getTime(),
        url: rawId,
        pdfUrl: rawId.replace("/abs/", "/pdf/") + ".pdf",
        matchedKeywords,
      };

      papers.push(paper);
      arxivSeenState.add(idStr);

      // Evict oldest entry when the cache grows too large
      if (arxivSeenState.size > 10000) {
        const oldest = arxivSeenState.values().next().value;
        if (oldest !== undefined) {
          arxivSeenState.delete(oldest);
        }
      }
    }

    console.log(
      `[ArXivScraper] Ingested ${papers.length} new exploitation-relevant papers from ${entries.length} cs.CR entries.`,
    );
    return papers;
  } catch (err) {
    console.error("[ArXivScraper] Poll failed:", err);
    return [];
  }
}
