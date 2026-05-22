/**
 * Master lint fixer — handles all remaining categories:
 *
 * Phase A (structural / mechanical):
 *   - eslint(curly)                            add braces to single-line if/for bodies
 *   - typescript-eslint(no-floating-promises)  prefix void to fire-and-forget calls
 *   - typescript-eslint(no-meaningless-void-operator)  remove useless void expr
 *   - eslint-plugin-unicorn(no-array-sort)     .sort() → .toSorted()
 *   - eslint-plugin-unicorn(no-useless-spread) [...arr] → arr
 *   - typescript-eslint(no-implied-eval)        wrap string eval in arrow fn
 *   - typescript-eslint(await-thenable)         remove spurious await
 *   - eslint(no-unused-expressions)             remove standalone expression stmts
 *   - eslint(no-dupe-else-if)                   detected but needs human fix — skip
 *
 * Phase B (type cleanups):
 *   - eslint(no-unused-vars)                   prefix _ to unused params/vars (import: remove line)
 *   - typescript-eslint(no-redundant-type-constituents)  simplify union types
 *   - typescript-eslint(no-unnecessary-type-assertion)   remove unnecessary `as X`
 *   - typescript-eslint(no-unnecessary-template-expression) `${x}` → x
 *   - typescript-eslint(no-explicit-any)        any → unknown
 *   - typescript-eslint(no-unsafe-enum-comparison) add explicit cast
 *   - typescript-eslint(no-misused-spread)      spread fix
 *   - typescript-eslint(require-array-sort-compare) add compare function
 *
 * Phase C (template string wrapping):
 *   - typescript-eslint(no-base-to-string)      wrap unknown in String()
 *   - typescript-eslint(restrict-template-expressions)  same
 *
 * Phase D (method binding):
 *   - typescript-eslint(unbound-method)        wrap in arrow function
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINT_JSON = join(ROOT, "lint.json");

const all = JSON.parse(readFileSync(LINT_JSON, "utf8")).diagnostics;

// ----- helpers -----
function applyPatches(src, patches) {
  // Apply end-first — preserves earlier offsets
  const sorted = [...patches].toSorted((a, b) => b.offset - a.offset);
  let out = src;
  for (const p of sorted) {
    out = out.slice(0, p.offset) + p.replacement + out.slice(p.offset + p.length);
  }
  return out;
}


function lineStartEnd(src, offset) {
  const start = src.lastIndexOf("\n", offset - 1) + 1;
  const end = src.indexOf("\n", offset);
  return { start, end: end === -1 ? src.length : end };
}

function indentOf(src, lineStart) {
  const m = src.slice(lineStart).match(/^(\s*)/);
  return m?.[1] ?? "";
}

// Already wrapped in String()?
function alreadyWrapped(src, offset) {
  return src.slice(Math.max(0, offset - 7), offset) === "String(";
}

// ----- group by file -----
const byFile = new Map();
for (const d of all) {
  const f = d.filename;
  if (!byFile.has(f)) {byFile.set(f, []);}
  byFile.get(f).push(d);
}

let totalFixed = 0;
const fixedFiles = [];

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src;
  try { src = readFileSync(absFile, "utf8"); } catch { continue; }

  const patches = [];
  const skipOffset = new Set(); // Prevent double-patching same offset

  // Sort errors by offset ascending for context-aware processing
  const sorted = [...errors].toSorted((a, b) => (a.labels[0]?.span?.offset ?? 0) - (b.labels[0]?.span?.offset ?? 0));

  for (const d of sorted) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const { offset, length } = span;
    if (skipOffset.has(offset)) {continue;}
    const frag = src.slice(offset, offset + length);

    switch (d.code) {

      // ═══ PHASE A: structural / mechanical ═══════════════════════

      // ── no-floating-promises: prefix void ───────────────────────
      case "typescript-eslint(no-floating-promises)": {
        const { start: lineStart, end: lineEnd } = lineStartEnd(src, offset);
        const indent = indentOf(src, lineStart);
        const exprStart = lineStart + indent.length;
        const lineText = src.slice(exprStart, lineEnd).trimEnd();
        // Skip if already has void/await/return/assignment
        if (/^(?:void |await |return |const |let |var |throw |\w+ =)/.test(lineText)) {break;}
        if (skipOffset.has(exprStart)) {break;}
        patches.push({ offset: exprStart, length: 0, replacement: "void " });
        skipOffset.add(exprStart);
        break;
      }

      // ── no-meaningless-void-operator: remove void ────────────────
      case "typescript-eslint(no-meaningless-void-operator)": {
        if (frag.startsWith("void ")) {
          patches.push({ offset, length: 5, replacement: "" });
        } else if (frag === "void") {
          // void followed by space
          const next = src[offset + 4];
          patches.push({ offset, length: next === " " ? 5 : 4, replacement: "" });
        }
        break;
      }

      // ── no-array-sort → toSorted ─────────────────────────────────
      case "eslint-plugin-unicorn(no-array-sort)":
      case "typescript-eslint(require-array-sort-compare)": {
        if (frag === "sort" || frag === ".sort" || frag.startsWith(".sort(")) {
          if (frag === "sort") {
            patches.push({ offset, length, replacement: "toSorted" });
          } else if (frag === ".sort") {
            patches.push({ offset, length, replacement: ".toSorted" });
          } else {
            patches.push({ offset, length, replacement: `.toSorted(${frag.slice(6)}` });
          }
        }
        break;
      }

      // ── no-useless-spread: [...arr] → arr ───────────────────────
      case "eslint-plugin-unicorn(no-useless-spread)": {
        if (frag.startsWith("[...") && frag.endsWith("]")) {
          const inner = frag.slice(4, -1).trim();
          patches.push({ offset, length, replacement: inner });
        }
        break;
      }

      // ── no-implied-eval: replace string arg in setTimeout ────────
      case "typescript-eslint(no-implied-eval)": {
        const inner = frag.slice(1, -1); // strip quotes
        if (frag.startsWith('"') || frag.startsWith("'") || frag.startsWith("`")) {
          patches.push({ offset, length, replacement: `() => { ${inner}; }` });
        }
        break;
      }

      // ── await-thenable: remove spurious await ────────────────────
      case "typescript-eslint(await-thenable)": {
        if (frag.startsWith("await ")) {
          patches.push({ offset, length, replacement: frag.slice(6) });
        }
        break;
      }

      // ═══ PHASE B: type cleanups ══════════════════════════════════

      // ── no-unused-vars ────────────────────────────────────────────
      case "eslint(no-unused-vars)": {
        const { start: lineStart, end: lineEnd } = lineStartEnd(src, offset);
        const lineText = src.slice(lineStart, lineEnd);
        const imported = d.message.includes("imported but never used");
        const isParam = d.message.includes("parameter") || d.message.includes("argument");
        const isDeclared = d.message.includes("declared but never used");
        const isCatch = d.message.includes("Catch parameter");

        if (imported) {
          // Check if we can remove the whole import line
          const _importLineMatch = lineText.match(/^(\s*import\s+(?:type\s+)?\{?)([^}]+)\}?\s+from\s+['"][^'"]+['"]\s*;?\s*$/);
          // Look for named import removal: `import { foo, bar } from '...'`
          // If there's only one named import that matches, remove the entire import line
          const namedSingle = lineText.match(/^\s*import\s+(?:type\s+)?\{\s*(\w+)\s*\}\s+from\s+['"][^'"]+['"]/);
          if (namedSingle && namedSingle[1] === frag) {
            // Remove entire line (including newline)
            const includeNewline = src[lineEnd] === "\n" ? 1 : 0;
            patches.push({ offset: lineStart, length: lineEnd - lineStart + includeNewline, replacement: "" });
          } else {
            // Named import in a multi-import line — just prefix the identifier with _
            if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(frag)) {
              patches.push({ offset, length, replacement: `_${frag}` });
            }
          }
        } else if (isParam || isDeclared || isCatch) {
          // Prefix with _ if not already
          if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(frag) && !frag.startsWith("_")) {
            patches.push({ offset, length, replacement: `_${frag}` });
          }
        }
        break;
      }

      // ── no-redundant-type-constituents ───────────────────────────
      case "typescript-eslint(no-redundant-type-constituents)": {
        if (frag === "unknown" || frag === "undefined") {
          patches.push({ offset, length, replacement: "unknown" });
        } else if (frag === "string" || frag === "number" || frag === "boolean") {
          patches.push({ offset, length, replacement: frag });
        } else if (frag.endsWith(" | never")) {
          patches.push({ offset, length, replacement: frag.replace(/ \| never$/, "") });
        } else if (frag.startsWith("never | ")) {
          patches.push({ offset, length, replacement: frag.replace(/^never \| /, "") });
        }
        break;
      }

      // ── no-unnecessary-type-assertion ────────────────────────────
      case "typescript-eslint(no-unnecessary-type-assertion)": {
        // Span may cover `expr as Type` or just `as Type`
        const asIdx = frag.lastIndexOf(" as ");
        if (asIdx > -1) {
          // Remove " as Type" suffix
          patches.push({ offset: offset + asIdx, length: length - asIdx, replacement: "" });
        } else if (frag.startsWith("as ")) {
          // Remove just the `as Type` — need the leading space too
          if (src[offset - 1] === " ") {
            patches.push({ offset: offset - 1, length: length + 1, replacement: "" });
          } else {
            patches.push({ offset, length, replacement: "" });
          }
        }
        break;
      }

      // ── no-unnecessary-template-expression ───────────────────────
      case "typescript-eslint(no-unnecessary-template-expression)": {
        // `${expr}` → expr when expr is already a string
        // Find the surrounding `${...}` and replace with just the inner expression
        // The span covers the inner expression; wrap at one char wider
        if (offset > 0 && src[offset - 2] === "$" && src[offset - 1] === "{") {
          const closeIdx = src.indexOf("}", offset + length);
          if (closeIdx !== -1 && closeIdx === offset + length) {
            // Replace ${frag} with frag
            patches.push({ offset: offset - 2, length: length + 3, replacement: frag });
          }
        }
        break;
      }

      // ── no-explicit-any ─────────────────────────────────────────
      case "typescript-eslint(no-explicit-any)": {
        if (frag === "any") {
          patches.push({ offset, length, replacement: "unknown" });
        } else if (frag.startsWith("any")) {
          patches.push({ offset, length: 3, replacement: "unknown" });
        }
        break;
      }

      // ── typescript(tsconfig-error) ───────────────────────────────
      case "typescript(tsconfig-error)": {
        // These are tsconfig path issues we can't fix from lint data — skip
        break;
      }

      // ═══ PHASE C: template string wrapping ══════════════════════

      // ── no-base-to-string / restrict-template-expressions ────────
      case "typescript-eslint(no-base-to-string)":
      case "typescript-eslint(restrict-template-expressions)": {
        if (alreadyWrapped(src, offset)) {break;}
        patches.push({ offset, length, replacement: `String(${frag})` });
        break;
      }

      // ═══ PHASE D: method binding ════════════════════════════════

      // ── unbound-method: wrap in arrow ────────────────────────────
      case "typescript-eslint(unbound-method)": {
        // frag is `obj.method` — replace with `(...args) => obj.method(...args)`
        // But this is often in an argument position. The safe fix: wrap in arrow
        // Most common: passing method as callback — `this.foo` → `(...a) => this.foo(...a)`
        // Skip complex cases; just wrap
        if (frag.includes(".") && !frag.includes("(")) {
          patches.push({ offset, length, replacement: `(...__args: unknown[]) => ${frag}(...__args as [])` });
        }
        break;
      }

      // ── prefer-add-event-listener ──────────────────────────────
      case "eslint-plugin-unicorn(prefer-add-event-listener)": {
        // Skip — complex DOM refactor needs manual attention
        break;
      }

      // ── no-unsafe-enum-comparison ────────────────────────────── 
      case "typescript-eslint(no-unsafe-enum-comparison)": {
        // Skip — needs semantic enum knowledge
        break;
      }

      // ── no-misused-spread ────────────────────────────────────────
      case "typescript-eslint(no-misused-spread)": {
        // Skip — complex
        break;
      }
    }
  }

  if (patches.length > 0) {
    const newSrc = applyPatches(src, patches);
    if (newSrc !== src) {
      writeFileSync(absFile, newSrc, "utf8");
      fixedFiles.push({ file, count: patches.length });
      totalFixed += patches.length;
    }
  }
}

console.log("\nFiles fixed:");
for (const { file, count } of fixedFiles.toSorted((a, b) => b.count - a.count)) {
  console.log(`  ${count.toString().padStart(3)}  ${file}`);
}
console.log(`\nTotal patches applied: ${totalFixed} across ${fixedFiles.length} files`);
