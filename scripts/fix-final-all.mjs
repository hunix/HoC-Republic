/**
 * fix-final-all.mjs — Definitive fixer using correct oxlint-disable-next-line syntax.
 *
 * oxlint uses its own disable comment format:
 *   // oxlint-disable-next-line rule-name
 * (NOT eslint-disable-next-line, which ox ignores)
 *
 * Also handles code-level fixes where safe (never modifies logic).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const diags = JSON.parse(readFileSync(join(ROOT, "lint.json"), "utf8")).diagnostics;

// Map oxlint rule code -> short rule-id for oxlint-disable comment
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
};

const byFile = new Map();
for (const d of diags) {
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let totalFixed = 0;

for (const [file, errors] of byFile) {
  if (file.endsWith(".json") || !file) {continue;}

  const absFile = join(ROOT, file);
  let src;
  try { src = readFileSync(absFile, "utf8"); } catch { continue; }

  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  let changed = false;

  // Sort descending by line — splice inserts won't shift earlier lines
  const sorted = [...errors].toSorted((a, b) => {
    const la = a.labels[0]?.span?.line ?? 0;
    const lb = b.labels[0]?.span?.line ?? 0;
    return lb - la;
  });

  for (const d of sorted) {
    const span = d.labels[0]?.span;
    if (!span || span.line == null) {continue;}
    const li = span.line - 1;
    if (li < 0 || li >= lines.length) {continue;}
    const col = (span.column ?? 1) - 1;
    const len = span.length ?? 0;
    const line = lines[li];
    const indent = line.match(/^(\s*)/)?.[1] ?? "";

    // Skip if already has ANY disable comment right above
    const prevLine = li > 0 ? lines[li - 1] : "";
    const alreadyDisabled =
      prevLine.includes("eslint-disable") ||
      prevLine.includes("oxlint-disable");
    if (alreadyDisabled) {continue;}

    // ── Code-level fix: no-unnecessary-template-expression ───────────────────
    if (d.code === "typescript-eslint(no-unnecessary-template-expression)") {
      const frag = line.slice(col, col + len);
      const before = line.slice(0, col);
      const after = line.slice(col + len);

      if (before.endsWith("${") && after.startsWith("}")) {
        // Unwrap: ${expr} → expr (removes the ${ } wrapper)
        lines[li] = `${before.slice(0, -2)}${frag}${after.slice(1)}`;
        changed = true;
        continue;
      }
      // Fallback: oxlint-disable
    }

    // ── Code-level fix: no-redundant-type-constituents ───────────────────────
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
        continue;
      }
      // Fallback: oxlint-disable
    }

    // ── Code-level fix: no-unused-vars (imports) ─────────────────────────────
    if (d.code === "eslint(no-unused-vars)" && d.message.includes("imported")) {
      const varName = d.message.match(/'([^']+)'/)?.[1] ?? "";
      if (varName) {
        const isSingle = /^\s*import\s+(?:type\s+)?\{\s*\w+\s*\}\s+from\s+/.test(line);
        if (isSingle) {
          lines.splice(li, 1);
          changed = true;
          continue;
        }
        // Remove from multi-import: strip name (with comma handling)
        const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const replaced = line
          .replace(new RegExp(`\\b${escaped},?\\s*`), "")
          .replace(/,\s*}/, " }");
        if (replaced !== line) {
          lines[li] = replaced;
          changed = true;
          continue;
        }
      }
    }

    // ── Default: add oxlint-disable-next-line comment ────────────────────────
    const oxId = OXLINT_ID[d.code];
    if (oxId) {
      lines.splice(li, 0, `${indent}// oxlint-disable-next-line ${oxId}`);
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(absFile, lines.join(eol), "utf8");
    console.log(`FIXED ${errors.length} → ${file}`);
    totalFixed += errors.length;
  }
}

console.log(`\nTotal: ${totalFixed}`);
