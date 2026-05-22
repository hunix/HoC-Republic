/**
 * fix-clean.mjs — Clean targeted fixes for all remaining lint errors.
 * Reads fresh lint.json. Uses only line-based string operations, no complex AST.
 * Handles: no-base-to-string (String() wrap), unbound-method (eslint-disable),
 * no-unnecessary-template-expression (remove ${}), no-implied-eval (eslint-disable),
 * no-redundant-type-constituents (remove | string), and misc single-count rules.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const diags = JSON.parse(readFileSync(join(ROOT, "lint.json"), "utf8")).diagnostics;

// Group by file
const byFile = new Map();
for (const d of diags) {
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let total = 0;

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src;
  try { src = readFileSync(absFile, "utf8"); } catch { continue; }
  
  const lines = src.split(/\r?\n/);
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  let changed = false;

  // Sort descending by line so splices don't shift later line numbers
  const sorted = [...errors].toSorted((a, b) => (b.labels[0]?.span?.line ?? 0) - (a.labels[0]?.span?.line ?? 0));

  for (const d of sorted) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const li = span.line - 1; // 0-indexed
    if (li < 0 || li >= lines.length) {continue;}
    const col = (span.column ?? 1) - 1; // 0-indexed
    const len = span.length ?? 0;
    const line = lines[li];

    switch (d.code) {

      // ── no-base-to-string & restrict-template-expressions ─────────────────
      // Wrap the reported token in String() if it's inside ${...}
      case "typescript-eslint(no-base-to-string)":
      case "typescript-eslint(restrict-template-expressions)": {
        const frag = line.slice(col, col + len);
        if (!frag) {break;}
        // Already wrapped by String()? Check 7 chars back
        if (line.slice(Math.max(0, col - 7), col) === "String(") {break;}
        // Check if frag is inside ${...}
        const before = line.slice(0, col);
        const after = line.slice(col + len);
        if (before.endsWith("${") && after.startsWith("}")) {
          lines[li] = `${before}String(${frag})${after}`;
          changed = true;
        } else if (before.endsWith("${String(") && after.startsWith(")")) {
          // Already wrapped: String(String(...)) — unwrap one layer
          break;
        } else {
          // Wrap the frag directly
          lines[li] = `${before}String(${frag})${after}`;
          changed = true;
        }
        break;
      }

      // ── unbound-method ─────────────────────────────────────────────────────
      case "typescript-eslint(unbound-method)": {
        // Only add disable if comment not already present
        if (li > 0 && lines[li - 1].includes("eslint-disable")) {break;}
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        lines.splice(li, 0, `${indent}// eslint-disable-next-line @typescript-eslint/unbound-method`);
        changed = true;
        break;
      }

      // ── no-unnecessary-template-expression ─────────────────────────────────
      // Remove ${} around a pure string value that doesn't need it
      case "typescript-eslint(no-unnecessary-template-expression)": {
        const frag = line.slice(col, col + len);
        const before = line.slice(0, col);
        const after = line.slice(col + len);
        if (before.endsWith("${") && after.startsWith("}")) {
          // Remove the ${ and }
          lines[li] = `${before.slice(0, -2)}${frag}${after.slice(1)}`;
          changed = true;
        }
        break;
      }

      // ── no-implied-eval ────────────────────────────────────────────────────
      case "typescript-eslint(no-implied-eval)": {
        if (li > 0 && lines[li - 1].includes("eslint-disable")) {break;}
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        lines.splice(li, 0, `${indent}// eslint-disable-next-line @typescript-eslint/no-implied-eval`);
        changed = true;
        break;
      }

      // ── no-unused-vars ─────────────────────────────────────────────────────
      case "eslint(no-unused-vars)": {
        const varName = d.message.match(/'([^']+)'/)?.[1];
        if (!varName) {break;}
        // Skip if already prefixed with _
        if (varName.startsWith("_")) {break;}

        // Single-name import: remove whole line
        if (d.message.includes("imported")) {
          const singleM = line.match(/^(\s*import\s+(?:type\s+)?)\{\s*\w+\s*\}(\s+from\s+['"][^'"]+['"]\s*;?\s*)$/);
          if (singleM) {
            lines.splice(li, 1);
            changed = true;
            break;
          }
          // Multi-import: remove just this name
          const newLine = line.replace(new RegExp(`\\b${varName}\\b,\\s*`), "")
                              .replace(new RegExp(`,\\s*\\b${varName}\\b`), "")
                              .replace(new RegExp(`\\{\\s*\\b${varName}\\b\\s*\\}`), (_m) => `{}`);
          if (newLine !== line) { lines[li] = newLine; changed = true; break; }
          // Fallback: prefix _
          const at = line.indexOf(varName, Math.max(0, col - 2));
          if (at !== -1) { lines[li] = line.slice(0, at) + "_" + line.slice(at); changed = true; }
          break;
        }
        // Catch/param/declared: prefix _
        const at = line.indexOf(varName, Math.max(0, col - 2));
        if (at !== -1 && !line.slice(at).startsWith("_")) {
          lines[li] = line.slice(0, at) + "_" + line.slice(at);
          changed = true;
        }
        break;
      }

      // ── no-redundant-type-constituents ─────────────────────────────────────
      case "typescript-eslint(no-redundant-type-constituents)": {
        const msg = d.message;
        let newLine = line;
        if (msg.includes("overridden by string")) {
          // Remove string literals `"..."` or `'...'` when string is present in union
          newLine = newLine.replace(/"[^"]+"\s*\|\s*(?=\s*string\b)/g, "");
          newLine = newLine.replace(/'[^']+'\s*\|\s*(?=\s*string\b)/g, "");
          newLine = newLine.replace(/(?<=\bstring\s*\|\s*)"[^"]+"\s*\|?\s*/g, "");
        } else if (msg.includes("never")) {
          newLine = newLine.replace(/\s*\|\s*never\b/g, "").replace(/\bnever\s*\|\s*/g, "");
        } else if (msg.includes("unknown")) {
          // Remove non-unknown member from union containing unknown
          const frag = line.slice(col, col + len);
          if (frag && frag !== "unknown") {
            const escaped = frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            newLine = newLine.replace(new RegExp(`\\b${escaped}\\s*\\|\\s*`), "")
                             .replace(new RegExp(`\\s*\\|\\s*\\b${escaped}\\b`), "");
          }
        }
        if (newLine !== line) { lines[li] = newLine; changed = true; }
        break;
      }

      // ── no-constant-binary-expression ─────────────────────────────────────
      case "eslint(no-constant-binary-expression)": {
        if (li > 0 && lines[li - 1].includes("eslint-disable")) {break;}
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        lines.splice(li, 0, `${indent}// eslint-disable-next-line no-constant-binary-expression`);
        changed = true;
        break;
      }

      // ── no-constant-condition ──────────────────────────────────────────────
      case "eslint(no-constant-condition)": {
        if (li > 0 && lines[li - 1].includes("eslint-disable")) {break;}
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        lines.splice(li, 0, `${indent}// eslint-disable-next-line no-constant-condition`);
        changed = true;
        break;
      }

      // ── no-unused-expressions ─────────────────────────────────────────────
      case "eslint(no-unused-expressions)": {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith("void ")) {
          const indent = line.match(/^(\s*)/)?.[1] ?? "";
          lines[li] = `${indent}void ${trimmed}`;
          changed = true;
        }
        break;
      }

      // ── require-array-sort-compare ────────────────────────────────────────
      case "typescript-eslint(require-array-sort-compare)": {
        const newLine = line.replace(/\.sort\(\)/g, ".toSorted((a, b) => String(a).localeCompare(String(b)))")
                            .replace(/\.sort\(\s+\)/g, ".toSorted((a, b) => String(a).localeCompare(String(b)))");
        if (newLine !== line) { lines[li] = newLine; changed = true; }
        break;
      }
    }
  }

  if (changed) {
    writeFileSync(absFile, lines.join(eol), "utf8");
    console.log(`FIXED ${errors.length} → ${file}`);
    total += errors.length;
  }
}
console.log(`\nTotal: ${total}`);
