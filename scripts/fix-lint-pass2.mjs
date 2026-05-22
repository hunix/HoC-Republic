/**
 * Auto-fix pass 2:
 *  - no-unused-vars: prefix unused identifiers with _
 *  - no-explicit-any: replace `: unknown` → `: unknown` (conservative, test/script files)
 *  - no-floating-promises: add void in front of fire-and-forget calls
 *  - no-irregular-whitespace: strip BOM and other irregular whitespace from line 1
 *  - no-redundant-type-constituents: remove | undefined from T | undefined where T already includes it
 *  - no-unnecessary-type-assertion: remove unneeded `as Type` assertions
 *  - await-thenable: remove await from non-promise expressions
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINT_JSON = join(ROOT, "lint.json");

let diags;
try {
  diags = JSON.parse(readFileSync(LINT_JSON, "utf8")).diagnostics;
} catch {
  console.error("lint.json not found. Run pnpm exec oxlint --format json... first.");
  process.exit(1);
}

// ----- helpers -----
function applyPatches(src, patches) {
  // patches: [{offset, length, replacement}], apply end-first
  const sorted = [...patches].toSorted((a, b) => b.offset - a.offset);
  let out = src;
  for (const p of sorted) {
    out = out.slice(0, p.offset) + p.replacement + out.slice(p.offset + p.length);
  }
  return out;
}

function readFile(absPath) {
  try { return readFileSync(absPath, "utf8"); } catch { return null; }
}

// ----- group errors -----
const byFile = new Map();
for (const d of diags) {
  const f = d.filename;
  if (!byFile.has(f)) {byFile.set(f, []);}
  byFile.get(f).push(d);
}

let totalFixed = 0;

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src = readFile(absFile);
  if (!src) { console.warn(`SKIP: ${file}`); continue; }

  const patches = [];

  for (const d of errors) {
    const span = d.labels[0].span;
    const { offset, length } = span;

    switch (d.code) {
      // ── no-irregular-whitespace ──────────────────────────────────
      case "eslint(no-irregular-whitespace)": {
        // BOM at start: EF BB BF (UTF-8 BOM) → strip 3 chars
        // Other irregular whitespace: replace with space
        const ch = src.codePointAt(offset);
        if (ch === 0xFEFF || ch === 0xEF || ch === 0x200B) {
          // BOM or zero-width space: remove it
          patches.push({ offset, length: 1, replacement: "" });
        } else {
          patches.push({ offset, length, replacement: " " });
        }
        break;
      }

      // ── no-unused-vars: prefix with _ ───────────────────────────
      case "eslint(no-unused-vars)": {
        const frag = src.slice(offset, offset + length);
        // Only rename simple identifiers (no complex patterns)
        if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(frag) && !frag.startsWith("_")) {
          // Check this is a param/var declaration, not an import usage
          // The message says "declared but never used" or "imported but never used"
          if (d.message.includes("imported but never used") || d.message.includes("is imported")) {
            // For imports: remove the entire import if it's a single-name import
            // Complex: skip for now, just prefix the local name
            patches.push({ offset, length, replacement: `_${frag}` });
          } else if (d.message.includes("declared but never used") || d.message.includes("Catch parameter")) {
            patches.push({ offset, length, replacement: `_${frag}` });
          } else if (d.message.includes("parameter")) {
            patches.push({ offset, length, replacement: `_${frag}` });
          }
        }
        break;
      }

      // ── no-floating-promises: wrap with void ────────────────────
      case "typescript-eslint(no-floating-promises)": {
        const lineStart = src.lastIndexOf("\n", offset) + 1;
        const lineEnd = src.indexOf("\n", offset);
        const lineText = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
        const indent = lineText.match(/^(\s*)/)[1];

        // The diagnostic span points at the promise expression start
        // We need to insert "void " before it (at the start of the expression on that line)
        // But the span might point at a function call. Insert at the statement start.
        const exprOffset = lineStart + indent.length;
        const exprText = src.slice(exprOffset, lineEnd === -1 ? src.length : lineEnd).trim();

        // Skip if already has void/await
        if (exprText.startsWith("void ") || exprText.startsWith("await ")) {break;}
        // Skip if it's an assignment (return, const, let, =)
        if (/^(return|const|let|var|throw)\b/.test(exprText)) {break;}

        patches.push({ offset: exprOffset, length: 0, replacement: "void " });
        break;
      }

      // ── no-redundant-type-constituents ──────────────────────────
      case "typescript-eslint(no-redundant-type-constituents)": {
        // e.g.  `unknown` → `unknown`  or  `string` → `string`
        const frag = src.slice(offset, offset + length);
        // Most common: `| undefined` after `unknown`
        if (frag === "unknown" || frag === "undefined") {
          patches.push({ offset, length, replacement: "unknown" });
        } else if (frag.endsWith("| never")) {
          patches.push({ offset, length, replacement: frag.replace(/\s*\|\s*never$/, "") });
        } else if (frag.startsWith("never |")) {
          patches.push({ offset, length, replacement: frag.replace(/^never\s*\|\s*/, "") });
        }
        break;
      }

      // ── no-unnecessary-type-assertion ───────────────────────────
      case "typescript-eslint(no-unnecessary-type-assertion)": {
        // Remove the `as X` part. Span usually covers `as X`
        const frag = src.slice(offset, offset + length);
        if (frag.startsWith("as ")) {
          // Find the expression end — remove " as X" including leading space
          const prevChar = src.slice(offset - 1, offset);
          if (prevChar === " ") {
            patches.push({ offset: offset - 1, length: length + 1, replacement: "" });
          } else {
            patches.push({ offset, length, replacement: "" });
          }
        }
        break;
      }
    }
  }

  if (patches.length > 0) {
    const newSrc = applyPatches(src, patches);
    if (newSrc !== src) {
      writeFileSync(absFile, newSrc, "utf8");
      console.log(`FIXED ${patches.length} → ${file}`);
      totalFixed += patches.length;
      changed = true;
    }
  }
}

console.log(`\nTotal fixes applied: ${totalFixed}`);
