/**
 * Infrastructure — CSV Catalog Loader
 *
 * Fetches and parses THE_RESOURCES_TABLE.csv from the awesome-claude-code repo.
 * Falls back to a bundled snapshot if GitHub is unreachable.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AccResource, ResourceCategory, _ResourceSubCategory } from "../domain/types.ts";

// ─── Constants ──────────────────────────────────────────────────

const CSV_RAW_URL =
  "https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/main/THE_RESOURCES_TABLE.csv";

const SNAPSHOT_FILENAME = "catalog-snapshot.csv";

// ─── CSV Parsing ────────────────────────────────────────────────

/**
 * Parse a CSV line respecting quoted fields that may contain commas.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        // Escaped quote inside quoted field
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Map a CSV category string to our typed enum.
 */
function toCategory(raw: string): ResourceCategory {
  const map: Record<string, ResourceCategory> = {
    "Agent Skills": "Agent Skills",
    "Workflows & Knowledge Guides": "Workflows & Knowledge Guides",
    Tooling: "Tooling",
    "Status Lines": "Status Lines",
    Hooks: "Hooks",
    "Slash-Commands": "Slash-Commands",
    "CLAUDE.md Files": "CLAUDE.md Files",
    "Alternative Clients": "Alternative Clients",
    "Official Documentation": "Official Documentation",
  };
  return map[raw] ?? "unknown";
}

/**
 * Parse full CSV text into AccResource array.
 */
function parseCsv(csvText: string): AccResource[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }

  // Skip header row
  const resources: AccResource[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 14) {
      continue; // Malformed row
    }

    // CSV columns:
    // 0:ID, 1:Display Name, 2:Category, 3:Sub-Category, 4:Primary Link,
    // 5:Secondary Link, 6:Author Name, 7:Author Link, 8:Active,
    // 9:Date Added, 10:Last Modified, 11:Last Checked, 12:License,
    // 13:Description, 14:Removed, 15:Stale, 16:Repo Created,
    // 17:Latest Release, 18:Release Version, 19:Release Source

    const resource: AccResource = {
      id: fields[0],
      displayName: fields[1],
      category: toCategory(fields[2]),
      subCategory: (fields[3] || "General"),
      primaryLink: fields[4],
      secondaryLink: fields[5] || "",
      authorName: fields[6],
      authorLink: fields[7] || "",
      active: fields[8]?.toUpperCase() === "TRUE",
      description: fields[13] || "",
      license: fields[12] || "Unknown",
      releaseVersion: fields[18] || "",
      repoCreated: fields[16] || "",
      latestRelease: fields[17] || "",
    };

    resources.push(resource);
  }

  return resources;
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Load the catalog, trying GitHub first, then local snapshot.
 */
export function loadCatalog(dataDir: string): AccResource[] {
  // Try fetching from GitHub
  try {
    const csvText = fetchCsvSync(CSV_RAW_URL);
    if (csvText && csvText.includes("ID,Display Name")) {
      // Save as snapshot for offline use
      saveCatalogSnapshot(dataDir, csvText);
      return parseCsv(csvText);
    }
  } catch {
    // Fall through to snapshot
  }

  // Try local snapshot
  try {
    const snapshotPath = path.join(dataDir, SNAPSHOT_FILENAME);
    if (fs.existsSync(snapshotPath)) {
      const csvText = fs.readFileSync(snapshotPath, "utf-8");
      return parseCsv(csvText);
    }
  } catch {
    // No snapshot available
  }

  return [];
}

/**
 * Refresh catalog from GitHub.
 */
export function refreshCatalog(dataDir: string): { updated: boolean; count: number } {
  try {
    const csvText = fetchCsvSync(CSV_RAW_URL);
    if (csvText && csvText.includes("ID,Display Name")) {
      saveCatalogSnapshot(dataDir, csvText);
      const resources = parseCsv(csvText);
      return { updated: true, count: resources.length };
    }
  } catch {
    // No update available
  }
  return { updated: false, count: 0 };
}

/**
 * Get the source URL for attribution.
 */
export function getSourceUrl(): string {
  return CSV_RAW_URL;
}

// ─── Internals ──────────────────────────────────────────────────

function saveCatalogSnapshot(dataDir: string, csvText: string): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, SNAPSHOT_FILENAME), csvText, "utf-8");
  } catch {
    // Non-critical — continue without snapshot
  }
}

/**
 * Synchronous HTTP fetch for CSV content.
 * Uses Node.js child_process to keep the plugin sync-friendly
 * (matching the Superpowers pattern).
 */
function fetchCsvSync(url: string): string | null {
  try {
    // Use Node.js built-in fetch via child_process for sync operation
    const { execSync } = require("node:child_process");
    const result = execSync(
      `node -e "fetch('${url}').then(r=>r.text()).then(t=>process.stdout.write(t)).catch(()=>process.exit(1))"`,
      { timeout: 15000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return result as string;
  } catch {
    return null;
  }
}
