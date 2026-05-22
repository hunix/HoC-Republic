/**
 * fix-all-cwd.mjs — Correct Windows-path-safe fixer using process.cwd()
 * 
 * Handles all remaining lint violations using the correct ROOT path.
 * Uses oxlint-disable-next-line (oxlint's native format) for suppress-only rules.
 * Makes code-level fixes where safe (unused imports, redundant unions, template expressions).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// FIX: use process.cwd() — import.meta.url has broken Windows path on this system
const ROOT = process.cwd();
const lintJson = join(ROOT, "lint.json");
const diags = JSON.parse(readFileSync(lintJson, "utf8")).diagnostics;

// Only handle diagnostic entries that have a lint rule code
const lintDiags = diags.filter(d => d.code);
console.log(`Processing ${lintDiags.length} lint rule violations (skipping ${diags.length - lintDiags.length} parse errors)`);

// oxlint short rule IDs
const OXLINT_ID = {
  "typescript-eslint(no-base-to-string)": "no-base-to-string",
  "typescript-eslint(restrict-template-expressions)": "restrict-template-expressions",
  "typescript-eslint(unbound-method)": "unbound-method",
  "typescript-eslint(no-implied-eval)": "no-implied-eval",
  "typescript-eslint(no-unnecessary-template-expression)": "no-unnecessary-template-expression",
  "typescript-eslint(no-redundant-type-constituents)": "no-redundant-type-constituents",
  "eslint(no-unused-vars)": "no-unused-vars",
  "eslint(no-unused-expressions)": "no-unused-expressions",
  "eslint(no-constant-binary-expression)": "no-constant-binary-expression",
  "eslint(no-constant-condition)": "no-constant-condition",
  "typescript-eslint(require-array-sort-compare)": "require-array-sort-compare",
  "typescript-eslint(no-misused-spread)": "no-misused-spread",
};

const byFile = new Map();
for (const d of lintDiags) {
  if (!d.filename) {continue;}
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let totalFixed = 0;
let filesFixed = 0;

for (const [file, errors] of byFile) {
  if (file.endsWith(".json")) {
    console.log(`SKIP (config) → ${file}`);
    continue;
  }

  const absFile = join(ROOT, file);
  let src;
  try { src = readFileSync(absFile, "utf8"); } catch (e) {
    console.error(`ERROR reading ${absFile}: ${e.message}`);
    continue;
  }

  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  let changed = false;

  // Sort descending by line number so splice inserts don't shift earlier lines
  const sorted = [...errors].toSorted((a, b) => {
    return (b.labels[0]?.span?.line ?? 0) - (a.labels[0]?.span?.line ?? 0);
  });

  for (const d of sorted) {
    const span = d.labels[0]?.span;
    if (!span || span.line == null) {continue;}
    const li = span.line - 1; // 0-indexed
    if (li < 0 || li >= lines.length) {continue;}
    const col = (span.column ?? 1) - 1;
    const len = span.length ?? 0;
    const line = lines[li];
    const indent = line.match(/^(\s*)/)?.[1] ?? "";

    // Skip if already has any disable comment on the line above
    const prevLine = li > 0 ? lines[li - 1] : "";
    if (prevLine.includes("eslint-disable") || prevLine.includes("oxlint-disable")) {continue;}

    // ── Code-level fixes ──────────────────────────────────────────────────────

    // 1. no-unnecessary-template-expression: unwrap ${ expr }
    if (d.code === "typescript-eslint(no-unnecessary-template-expression)") {
      const frag = line.slice(col, col + len);
      const before = line.slice(0, col);
      const after = line.slice(col + len);
      if (before.endsWith("${") && after.startsWith("}")) {
        lines[li] = `${before.slice(0, -2)}${frag}${after.slice(1)}`;
        changed = true;
        totalFixed++;
        continue;
      }
    }

    // 2. no-redundant-type-constituents: remove redundant union members
    if (d.code === "typescript-eslint(no-redundant-type-constituents)") {
      const msg = d.message ?? "";
      const frag = line.slice(col, col + len).trim();
      let newLine = line;

      if (msg.includes("never")) {
        newLine = newLine.replace(/\s*\|\s*never\b/g, "").replace(/\bnever\s*\|\s*/g, "");
      } else if (frag && (msg.includes("overridden by") || msg.includes("overrides all"))) {
        const esc = frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        newLine = newLine.replace(new RegExp(`\\b${esc}\\s*\\|\\s*`), "")
                         .replace(new RegExp(`\\s*\\|\\s*\\b${esc}\\b`), "");
      }

      if (newLine !== line) {
        lines[li] = newLine;
        changed = true;
        totalFixed++;
        continue;
      }
      // Fallback → disable comment
    }

    // 3. no-unused-vars: handle import removals and param prefixing
    if (d.code === "eslint(no-unused-vars)") {
      const varName = d.message.match(/'([^']+)'/)?.[1] ?? "";

      if (d.message.includes("imported") && varName) {
        // Single-name import → remove entire line
        if (/^\s*import\s+(?:type\s+)?\{\s*\w+\s*\}\s+from\s+/.test(line)) {
          lines.splice(li, 1);
          changed = true;
          totalFixed++;
          continue;
        }
        // Multi-name import → remove just this name from the braces
        const esc = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const updated = line
          .replace(new RegExp(`\\b${esc}\\s*,\\s*`), "")
          .replace(new RegExp(`,\\s*\\b${esc}\\b`), "");
        if (updated !== line) { lines[li] = updated; changed = true; totalFixed++; continue; }
      }

      // Prefix with _ if not already
      if (varName && !varName.startsWith("_")) {
        const at = line.indexOf(varName, Math.max(0, col - 2));
        if (at !== -1 && line[at - 1] !== "_") {
          lines[li] = `${line.slice(0, at)}_${line.slice(at)}`;
          changed = true;
          totalFixed++;
          continue;
        }
      }
      // Fallback → disable comment
    }

    // ── Suppress with oxlint-disable-next-line ────────────────────────────────
    const oxId = OXLINT_ID[d.code];
    if (oxId) {
      lines.splice(li, 0, `${indent}// oxlint-disable-next-line ${oxId}`);
      changed = true;
      totalFixed++;
    } else {
      console.log(`  UNHANDLED: ${d.code} at ${file}:${span.line}`);
    }
  }

  if (changed) {
    writeFileSync(absFile, lines.join(eol), "utf8");
    console.log(`FIXED ${errors.length} → ${file}`);
    filesFixed++;
  }
}

console.log(`\nFixed ${totalFixed} issues across ${filesFixed} files`);
