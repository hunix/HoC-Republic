/**
 * Search + RAG — Citation Tracker
 *
 * Maps answer segments to their source URLs for inline citation rendering.
 * Produces [1], [2], etc. markers and a reference list.
 */

import type { Citation, SearchResult } from "./types.js";

/**
 * Build citations from search results used in the answer.
 * Returns a sorted, deduplicated list of citations.
 */
export function buildCitations(sources: SearchResult[], maxCitations = 10): Citation[] {
  const seen = new Set<string>();
  const citations: Citation[] = [];

  for (const source of sources) {
    if (seen.has(source.url) || citations.length >= maxCitations) {
      continue;
    }
    seen.add(source.url);

    citations.push({
      index: citations.length + 1,
      url: source.url,
      title: source.title || new URL(source.url).hostname,
      excerpt: source.snippet?.slice(0, 200) ?? "",
    });
  }

  return citations;
}

/**
 * Format citations as a markdown reference section.
 */
export function formatCitationsMarkdown(citations: Citation[]): string {
  if (citations.length === 0) {
    return "";
  }

  const lines = citations.map(
    (c) => `[${c.index}] [${c.title}](${c.url})${c.excerpt ? ` — ${c.excerpt}` : ""}`,
  );

  return `\n\n---\n**Sources:**\n${lines.join("\n")}`;
}

/**
 * Insert citation markers into answer text based on which sources
 * contributed to each paragraph.
 */
export function insertCitationMarkers(
  answer: string,
  sources: SearchResult[],
  citations: Citation[],
): string {
  if (citations.length === 0) {
    return answer;
  }

  // For each paragraph, find which sources are most relevant
  const paragraphs = answer.split("\n\n");
  const annotated = paragraphs.map((para) => {
    const relevantCitations = findRelevantCitations(para, sources, citations);
    if (relevantCitations.length === 0) {
      return para;
    }

    const markers = relevantCitations.map((c) => `[${c.index}]`).join("");
    // Add markers at the end of the paragraph
    return `${para} ${markers}`;
  });

  return annotated.join("\n\n");
}

/**
 * Find which citations are relevant to a given text segment.
 * Uses keyword overlap as a lightweight relevance signal.
 */
function findRelevantCitations(
  text: string,
  sources: SearchResult[],
  citations: Citation[],
): Citation[] {
  const textWords = new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
  if (textWords.size === 0) {
    return [];
  }

  const scores: Array<{ citation: Citation; score: number }> = [];

  for (const citation of citations) {
    const source = sources.find((s) => s.url === citation.url);
    if (!source) {
      continue;
    }

    const sourceWords = new Set(
      `${source.title} ${source.snippet} ${source.content ?? ""}`
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3),
    );

    // Jaccard-like overlap
    let overlap = 0;
    for (const word of textWords) {
      if (sourceWords.has(word)) {
        overlap++;
      }
    }

    const score = overlap / textWords.size;
    if (score > 0.15) {
      scores.push({ citation, score });
    }
  }

  return scores
    .toSorted((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.citation);
}
