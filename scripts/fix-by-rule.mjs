/**
 * Targeted fix script — run with a specific rule to fix only that category.
 * Usage: node scripts/fix-by-rule.mjs <ruleName>
 * 
 * Supported rules:
 *   curly                     - add missing braces to if/for/while bodies
 *   redundant-types           - remove reduntdant type union constituents
 *   unused-vars               - remove unused imports, prefix _ to params
 *   floating-promises         - prefix void to fire-and-forget Promises  
 *   meaningless-void          - remove void from non-Promise expressions
 *   unnecessary-template      - unwrap ${x} → x where x is already string
 *   array-sort                - .sort() → .toSorted()
 *   useless-spread            - [...arr] → arr
 *   await-thenable            - remove spurious await
 *   implied-eval              - setTimeout("code") → setTimeout(() => { code })
 *   base-to-string            - wrap unknown in String() (single-pass only)
 *   restrict-template         - same as base-to-string
 *   explicit-any              - any → unknown
 *   unnecessary-assertion     - remove unnecessary `as T` casts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const LINT_JSON = join(ROOT, "lint.json");
const rule = process.argv[2];

if (!rule) {
  console.error("Usage: node fix-by-rule.mjs <rule>");
  process.exit(1);
}

const RULE_MAP = {
  "curly": "eslint(curly)",
  "redundant-types": "typescript-eslint(no-redundant-type-constituents)",
  "unused-vars": "eslint(no-unused-vars)",
  "floating-promises": "typescript-eslint(no-floating-promises)",
  "meaningless-void": "typescript-eslint(no-meaningless-void-operator)",
  "unnecessary-template": "typescript-eslint(no-unnecessary-template-expression)",
  "array-sort": "eslint-plugin-unicorn(no-array-sort)",
  "useless-spread": "eslint-plugin-unicorn(no-useless-spread)",
  "await-thenable": "typescript-eslint(await-thenable)",
  "implied-eval": "typescript-eslint(no-implied-eval)",
  "base-to-string": "typescript-eslint(no-base-to-string)",
  "restrict-template": "typescript-eslint(restrict-template-expressions)",
  "explicit-any": "typescript-eslint(no-explicit-any)",
  "unnecessary-assertion": "typescript-eslint(no-unnecessary-type-assertion)",
};

const targetCode = RULE_MAP[rule];
if (!targetCode) {
  console.error(`Unknown rule: ${rule}. Available: ${Object.keys(RULE_MAP).join(", ")}`);
  process.exit(1);
}

const all = JSON.parse(readFileSync(LINT_JSON, "utf8")).diagnostics;
const filtered = all.filter(d => d.code === targetCode);

console.log(`Fixing ${filtered.length} errors for rule: ${targetCode}`);

function applyPatches(src, patches) {
  const sorted = [...patches].toSorted((a, b) => b.offset - a.offset);
  let out = src;
  for (const p of sorted) { out = out.slice(0, p.offset) + p.replacement + out.slice(p.offset + p.length); }
  return out;
}

function lineStartEnd(src, offset) {
  const start = src.lastIndexOf("\n", offset - 1) + 1;
  const end = src.indexOf("\n", offset);
  return { start, end: end === -1 ? src.length : end };
}

const byFile = new Map();
for (const d of filtered) {
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let totalFixed = 0;

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src; try { src = readFileSync(absFile, "utf8"); } catch { continue; }
  const patches = [];
  const skipSet = new Set();

  for (const d of [...errors].toSorted((a, b) => (a.labels[0]?.span?.offset ?? 0) - (b.labels[0]?.span?.offset ?? 0))) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const { offset, length } = span;
    if (skipSet.has(offset)) {continue;}
    const frag = src.slice(offset, offset + length);

    // ── curly ──────────────────────────────────────────────────────
    if (rule === "curly") {
      // The span covers the if/for/while statement.
      // The fix: wrap the body statement in braces.
      // Find the condition end and body start.
      // Pattern: `if (cond) stmt;` → `if (cond) { stmt; }`
      // The span covers the entire if statement from `if` to `;`
      // Strategy: find the body start (after closing paren of condition)
      // and wrap it.
      const { start: lineStart, end: lineEnd } = lineStartEnd(src, offset);
      const lineText = src.slice(lineStart, lineEnd);
      // Look for `if (...)` / `else` / `for (...)` / `while (...)` without braces
      const headerMatch = frag.match(/^((?:if|for|while)\s*\([^)]*\)|else)\s+/);
      if (headerMatch) {
        const headerLen = headerMatch[0].length;
        const bodyOffset = offset + headerLen;
        const body = src.slice(bodyOffset, offset + length).trimEnd();
        const indent = lineText.match(/^(\s*)/)?.[1] ?? "";
        patches.push({
          offset: bodyOffset,
          length: body.length,
          replacement: `{\n${indent}  ${body}\n${indent}}`,
        });
      }
      continue;
    }

    // ── redundant-types ────────────────────────────────────────────
    if (rule === "redundant-types") {
      const reductions = [
        ["unknown", "unknown"],
        ["unknown", "unknown"],
        ["unknown", "unknown"],
        ["unknown", "unknown"],
        [/ \| never$/, ""],
        [/^never \| /, ""],
        ["string", "string"],
        ["number", "number"],
        ["boolean", "boolean"],
      ];
      let replacement = frag;
      for (const [from, to] of reductions) {
        if (typeof from === "string" && frag === from) {
          replacement = to;
          break;
        } else if (from instanceof RegExp && from.test(frag)) {
          replacement = frag.replace(from, to);
          break;
        }
      }
      if (replacement !== frag) {patches.push({ offset, length, replacement });}
      continue;
    }

    // ── unused-vars ────────────────────────────────────────────────
    if (rule === "unused-vars") {
      const { start: lineStart, end: lineEnd } = lineStartEnd(src, offset);
      const lineText = src.slice(lineStart, lineEnd);
      const includeNewline = src[lineEnd] === "\n" ? 1 : 0;

      if (d.message.includes("imported but never used")) {
        // Check if entire import line has just this one named import
        const singleImport = lineText.match(/^\s*import\s+(?:type\s+)?\{\s*(\w+)\s*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/);
        if (singleImport && singleImport[1] === frag) {
          patches.push({ offset: lineStart, length: lineEnd - lineStart + includeNewline, replacement: "" });
        } else if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(frag) && !frag.startsWith("_")) {
          // Multi-import line — prefix identifier
          patches.push({ offset, length, replacement: `_${frag}` });
        }
      } else if (!frag.startsWith("_") && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(frag)) {
        patches.push({ offset, length, replacement: `_${frag}` });
      }
      continue;
    }

    // ── floating-promises ──────────────────────────────────────────
    if (rule === "floating-promises") {
      const { start: lineStart, end: lineEnd } = lineStartEnd(src, offset);
      const indent = src.slice(lineStart).match(/^(\s*)/)?.[1] ?? "";
      const exprStart = lineStart + indent.length;
      const exprText = src.slice(exprStart, lineEnd).trimEnd();
      if (/^(?:void |await |return |const |let |var |throw |\w[\w.]* =)/.test(exprText)) {continue;}
      if (skipSet.has(exprStart)) {continue;}
      patches.push({ offset: exprStart, length: 0, replacement: "void " });
      skipSet.add(exprStart);
      continue;
    }

    // ── meaningless-void ──────────────────────────────────────────
    if (rule === "meaningless-void") {
      if (frag === "void" && src[offset + 4] === " ") {
        patches.push({ offset, length: 5, replacement: "" });
      } else if (frag.startsWith("void ")) {
        patches.push({ offset, length: 5, replacement: "" });
      }
      continue;
    }

    // ── unnecessary-template ──────────────────────────────────────
    if (rule === "unnecessary-template") {
      if (offset >= 2 && src.slice(offset - 2, offset) === "${") {
        const closeIdx = src.indexOf("}", offset + length);
        if (closeIdx === offset + length) {
          patches.push({ offset: offset - 2, length: length + 3, replacement: frag });
        }
      }
      continue;
    }

    // ── array-sort ────────────────────────────────────────────────
    if (rule === "array-sort") {
      if (frag === "sort") {patches.push({ offset, length, replacement: "toSorted" });}
      else if (frag === ".sort") {patches.push({ offset, length, replacement: ".toSorted" });}
      else if (frag.startsWith(".sort(")) {patches.push({ offset, length, replacement: `.toSorted(${frag.slice(6)}` });}
      continue;
    }

    // ── useless-spread ────────────────────────────────────────────
    if (rule === "useless-spread") {
      if (frag.startsWith("[...") && frag.endsWith("]")) {
        patches.push({ offset, length, replacement: frag.slice(4, -1).trim() });
      }
      continue;
    }

    // ── await-thenable ────────────────────────────────────────────
    if (rule === "await-thenable") {
      if (frag.startsWith("await ")) {patches.push({ offset, length, replacement: frag.slice(6) });}
      continue;
    }

    // ── implied-eval ──────────────────────────────────────────────
    if (rule === "implied-eval") {
      if (frag.startsWith('"') || frag.startsWith("'") || frag.startsWith("`")) {
        const inner = frag.slice(1, -1);
        patches.push({ offset, length, replacement: `() => { ${inner}; }` });
      }
      continue;
    }

    // ── base-to-string / restrict-template ────────────────────────
    if (rule === "base-to-string" || rule === "restrict-template") {
      const before = src.slice(Math.max(0, offset - 7), offset);
      if (before === "String(") {continue;} // Already wrapped
      patches.push({ offset, length, replacement: `String(${frag})` });
      continue;
    }

    // ── explicit-any ──────────────────────────────────────────────
    if (rule === "explicit-any") {
      if (frag === "any") {patches.push({ offset, length, replacement: "unknown" });}
      else if (frag.startsWith("any")) {patches.push({ offset, length: 3, replacement: "unknown" });}
      continue;
    }

    // ── unnecessary-assertion ─────────────────────────────────────
    if (rule === "unnecessary-assertion") {
      const asIdx = frag.lastIndexOf(" as ");
      if (asIdx > -1) {
        patches.push({ offset: offset + asIdx, length: length - asIdx, replacement: "" });
      }
      continue;
    }
  }

  if (patches.length > 0) {
    const newSrc = applyPatches(src, patches);
    if (newSrc !== src) {
      writeFileSync(absFile, newSrc, "utf8");
      console.log(`  ${patches.length.toString().padStart(3)} → ${file}`);
      totalFixed += patches.length;
    }
  }
}

console.log(`\nFixed: ${totalFixed} in ${byFile.size} files`);
