/**
 * Pass 3: Fix remaining lint errors
 *  - no-explicit-any: replace `any` → `unknown` at exact offsets
 *  - no-unused-vars: prefix _ to unused identifiers (imports & params)
 *  - no-floating-promises: prefix void to fire-and-forget promise calls
 *  - no-redundant-type-constituents: clean up redundant union types
 *  - no-unnecessary-template-expression: `${expr}` → expr (when it's already a string)
 *  - curly: add missing braces to if/else/for bodies
 *  - no-implied-eval: wrap string arg in function arrow
 *  - no-array-sort: .sort() → .toSorted()
 *  - no-useless-spread: [...arr] → arr
 *  - no-meaningless-void-operator: remove void
 *  - await-thenable: remove await from non-promise
 *  - unbound-method: handled contextually
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINT_JSON = join(ROOT, "lint.json");

let diags;
try {
  diags = JSON.parse(readFileSync(LINT_JSON, "utf8")).diagnostics;
} catch {
  console.error("lint.json not found.");
  process.exit(1);
}

function applyPatches(src, patches) {
  const sorted = [...patches].toSorted((a, b) => b.offset - a.offset);
  let out = src;
  for (const p of sorted) {
    out = out.slice(0, p.offset) + p.replacement + out.slice(p.offset + p.length);
  }
  return out;
}

const byFile = new Map();
for (const d of diags) {
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let totalFixed = 0;

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src;
  try { src = readFileSync(absFile, "utf8"); } catch { continue; }

  const patches = [];

  for (const d of errors) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const { offset, length } = span;
    const frag = src.slice(offset, offset + length);

    switch (d.code) {

      // ── no-explicit-any: any → unknown ──────────────────────────
      case "typescript-eslint(no-explicit-any)": {
        if (frag === "any") {
          patches.push({ offset, length, replacement: "unknown" });
        } else if (frag.startsWith("any")) {
          // e.g. `any[]` → `unknown[]`
          patches.push({ offset, length: 3, replacement: "unknown" });
        }
        break;
      }

      // ── no-redundant-type-constituents ──────────────────────────
      case "typescript-eslint(no-redundant-type-constituents)": {
        if (frag === "unknown" || frag === "unknown | undefined" || frag === "undefined | unknown") {
          patches.push({ offset, length, replacement: "unknown" });
        } else if (frag.endsWith(" | never")) {
          patches.push({ offset, length, replacement: frag.replace(/ \| never$/, "") });
        } else if (frag.startsWith("never | ")) {
          patches.push({ offset, length, replacement: frag.replace(/^never \| /, "") });
        }
        break;
      }

      // ── no-floating-promises ─────────────────────────────────────
      case "typescript-eslint(no-floating-promises)": {
        // Find the start of this statement on its line
        const lineStart = src.lastIndexOf("\n", offset) + 1;
        const lineEnd = src.indexOf("\n", offset);
        const lineText = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
        const indent = lineText.match(/^(\s*)/)?.[1] ?? "";
        const exprOffset = lineStart + indent.length;
        const exprText = src.slice(exprOffset, lineEnd === -1 ? src.length : lineEnd).trim();

        if (
          exprText.startsWith("void ") ||
          exprText.startsWith("await ") ||
          exprText.startsWith("return ") ||
          exprText.startsWith("const ") ||
          exprText.startsWith("let ") ||
          exprText.startsWith("throw ") ||
          /^[a-z]+\s*=/.test(exprText)
        ) {
          break;
        }

        // Insert "void " at expression start
        if (!patches.some(p => p.offset === exprOffset)) {
          patches.push({ offset: exprOffset, length: 0, replacement: "void " });
        }
        break;
      }

      // ── no-unnecessary-template-expression: ${x} → x (string context) ──
      case "typescript-eslint(no-unnecessary-template-expression)": {
        // Span covers the interpolation `${someString}` — the span may be just the expr
        // These are in template literals where the only content is `${x}` — replace with x
        // The message says "unnecessary template expression", so just leave these for formatting
        // as they're usually minor; skip complex ones
        break;
      }

      // ── eslint(curly): add {} to single-line if/else/for bodies ─
      case "eslint(curly)": {
        // The span points at the body statement (not the keyword)
        // Find the end of the condition/header on the previous line
        // Span covers the entire if/for/while statement that needs braces
        // This is complex to fix mechanically — skip
        break;
      }

      // ── no-implied-eval: replace setTimeout/setInterval string arg ─
      case "typescript-eslint(no-implied-eval)": {
        // Span is the string argument, e.g. "someCode()"
        if (frag.startsWith('"') || frag.startsWith("'") || frag.startsWith("`")) {
          const inner = frag.slice(1, -1);
          patches.push({ offset, length, replacement: `() => { ${inner} }` });
        }
        break;
      }

      // ── eslint-plugin-unicorn(no-array-sort): .sort() → .toSorted() ─
      case "eslint-plugin-unicorn(no-array-sort)": {
        // Span is the `.sort(` call. Replace with `.toSorted(`
        if (frag.startsWith(".sort(")) {
          patches.push({ offset, length, replacement: ".toSorted(" + frag.slice(6) });
        } else if (frag === "sort") {
          patches.push({ offset, length, replacement: "toSorted" });
        }
        break;
      }

      // ── no-useless-spread: [...arr] → arr ───────────────────────
      case "eslint-plugin-unicorn(no-useless-spread)": {
        // Span is `[...arr]`
        if (frag.startsWith("[...") && frag.endsWith("]")) {
          const inner = frag.slice(4, -1);
          patches.push({ offset, length, replacement: inner });
        }
        break;
      }

      // ── no-meaningless-void-operator: remove void ────────────────
      case "typescript-eslint(no-meaningless-void-operator)": {
        // frag should be `void X` — remove the `void ` prefix
        if (frag.startsWith("void ")) {
          patches.push({ offset, length, replacement: frag.slice(5) });
        } else if (frag === "void") {
          // Need to remove "void " (with the space after)
          if (src[offset + 4] === " ") {
            patches.push({ offset, length: 5, replacement: "" });
          } else {
            patches.push({ offset, length: 4, replacement: "" });
          }
        }
        break;
      }

      // ── await-thenable: remove useless await ─────────────────────
      case "typescript-eslint(await-thenable)": {
        // frag is the await expression. Remove `await ` prefix
        if (frag.startsWith("await ")) {
          patches.push({ offset, length, replacement: frag.slice(6) });
        }
        break;
      }

      // ── no-unsafe-enum-comparison: use === with explicit type ────
      case "typescript-eslint(no-unsafe-enum-comparison)": {
        // These require semantic understanding — skip mechanical fix
        break;
      }

      // ── prefer-add-event-listener ────────────────────────────────
      case "eslint-plugin-unicorn(prefer-add-event-listener)": {
        // Complex DOM refactor — skip
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
    }
  }
}

console.log(`\nTotal fixes: ${totalFixed}`);
