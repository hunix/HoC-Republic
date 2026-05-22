/**
 * World Intelligence — Semantic Threat-Intel Vector Ingestor
 *
 * Local memory representation for saving Declassified Research / CVE Papers
 * to the SQLite Vector stores so the Autonomous Vulnerability Researcher
 * can query them using RAG.
 */

import Database from "better-sqlite3";

export interface ThreatIntelRecord {
  id: string; // the arxiv ID or internal ID
  title: string;
  abstract: string;
  pdfUrl?: string; // used later for full-text pulling
  timestamp: number;
  keywords: string;
}

// In phase 1, we just create a local SQLite table. 
// Standard Republic Vector Storage mappings can be layered over this, but indexing 
// abstracts raw allows standard keyword FTS extraction as a baseline.
const db = new Database("./data/threat-intel.sqlite");

db.exec(`
  CREATE TABLE IF NOT EXISTS intel_papers (
    id TEXT PRIMARY KEY,
    title TEXT,
    abstract TEXT,
    pdf_url TEXT,
    timestamp INTEGER,
    keywords TEXT
  );
  
  CREATE VIRTUAL TABLE IF NOT EXISTS intel_papers_fts USING fts5(
    title, abstract, keywords, content='intel_papers', content_rowid='rowid'
  );
`);

/**
 * Persists an academic paper into the RAG memory for future autonomous agents.
 */
export function storeThreatIntel(record: ThreatIntelRecord): void {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO intel_papers (id, title, abstract, pdf_url, timestamp, keywords)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const ftsStmt = db.prepare(`
    INSERT INTO intel_papers_fts (rowid, title, abstract, keywords)
    VALUES (last_insert_rowid(), ?, ?, ?)
  `);

  const transact = db.transaction(() => {
    insertStmt.run(
      record.id,
      record.title,
      record.abstract,
      record.pdfUrl || "",
      record.timestamp,
      record.keywords
    );
    ftsStmt.run(record.title, record.abstract, record.keywords);
  });
  
  try {
    transact();
  } catch (err) {
    console.error(`[ThreatIntelDB] Error storing paper ${record.id}:`, err);
  }
}

/**
  // Vulnerability Researcher queries this to find papers about a particular attack method.
 */
export function queryThreatIntel(query: string, limit: number = 20): ThreatIntelRecord[] {
  // Use SQLite full text search to pull relevant concepts
  const safeQuery = query.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).join(" OR ");
  if (!safeQuery) { return []; }

  const searchStmt = db.prepare(`
    SELECT i.id, i.title, i.abstract, i.pdf_url as pdfUrl, i.timestamp, i.keywords
    FROM intel_papers i
    JOIN intel_papers_fts f ON i.rowid = f.rowid
    WHERE intel_papers_fts MATCH ?
    ORDER BY f.rank
    LIMIT ?
  `);

  return searchStmt.all(safeQuery, limit) as ThreatIntelRecord[];
}
