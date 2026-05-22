/**
 * Auto-fix no-base-to-string and restrict-template-expressions errors.
 * Wraps bare template-string interpolations of unknown-typed values with String().
 *
 * Pattern: ${params["key"] ?? "default"} → ${String(params["key"] ?? "default")}
 * Pattern: ${params.key ?? "default"} → ${String(params.key ?? "default")}
 * Pattern: ${someVar} where someVar is typed unknown → ${String(someVar)}
 *
 * This reads oxlint JSON output and applies targeted fixes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINT_JSON = join(ROOT, "lint.json");

let diags;
try {
  diags = JSON.parse(readFileSync(LINT_JSON, "utf8")).diagnostics;
} catch {
  console.error("Run: pnpm exec oxlint --type-aware --ignore-path .oxlintignore --format json > lint.json first");
  process.exit(1);
}

const TARGET_RULES = new Set([
  "typescript-eslint(no-base-to-string)",
  "typescript-eslint(restrict-template-expressions)",
  "typescript-eslint(no-unnecessary-template-expression)",
]);

// Group by file
const byFile = new Map();
for (const d of diags) {
  if (!TARGET_RULES.has(d.code)) { continue; }
  const file = d.filename;
  if (!byFile.has(file)) { byFile.set(file, []); }
  byFile.get(file).push({
    line: d.labels[0].span.line,      // 1-indexed
    col: d.labels[0].span.column,     // 1-indexed
    len: d.labels[0].span.length,
    offset: d.labels[0].span.offset,  // byte offset in source
    message: d.message,
  });
}

let totalFixed = 0;
let totalSkipped = 0;

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src;
  try {
    src = readFileSync(absFile, "utf8");
  } catch {
    console.warn(`SKIP (not found): ${file}`);
    continue;
  }

  // Sort errors by offset descending so we patch end-first (preserves earlier offsets)
  const sorted = [...errors].toSorted((a, b) => b.offset - a.offset);

  let changed = false;
  let newSrc = src;

  for (const err of sorted) {
    // The span points at the expression inside ${}
    // We need to wrap whatever is at that offset with String()
    const start = err.offset;
    const end = start + err.len;
    const fragment = newSrc.slice(start, end);

    // Skip if already wrapped in String()
    if (newSrc.slice(start - 7, start) === "String(") {
      totalSkipped++;
      continue;
    }

    // Skip no-unnecessary-template-expression — those need different handling
    if (err.message.includes("unnecessary template")) {
      totalSkipped++;
      continue;
    }

    // Wrap in String()
    newSrc = newSrc.slice(0, start) + `String(${fragment})` + newSrc.slice(end);
    changed = true;
    totalFixed++;
  }

  if (changed) {
    writeFileSync(absFile, newSrc, "utf8");
    console.log(`FIXED ${errors.length} → ${file}`);
  }
}

console.log(`\nDone. Fixed: ${totalFixed}, Skipped: ${totalSkipped}`);
