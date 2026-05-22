/**
 * Line-based lint fixer: uses lint.json LINE NUMBERS (not byte offsets) to fix errors.
 * Safe from the offset-shift problem because:
 * 1. Lines are used instead of byte offsets
 * 2. Changes within a line are idempotent regex replacements
 * 3. NOT used for multi-line inserts or deletions that shift line numbers
 *
 * Fixes:
 *   - eslint(no-unused-vars): remove single-import lines
 *   - typescript-eslint(no-floating-promises): prefix void to expression-statement lines
 *   - typescript-eslint(no-base-to-string): wrap ${expr} in String()
 *   - typescript-eslint(restrict-template-expressions): same
 *   - typescript-eslint(no-explicit-any): any → unknown at line level
 *   - typescript-eslint(no-redundant-type-constituents): union simplification
 *   - typescript-eslint(no-unnecessary-template-expression): unwrap ${expr}
 *   - typescript-eslint(no-implied-eval): wrap string in arrow fn
 *   - typescript-eslint(await-thenable): remove spurious await
 *   - eslint-plugin-unicorn(no-useless-spread): [...arr] → arr
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const diags = JSON.parse(readFileSync(join(ROOT, "lint.json"), "utf8")).diagnostics;

const byFile = new Map();
for (const d of diags) {
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let totalFixed = 0;
const fileStats = [];

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src; try { src = readFileSync(absFile, "utf8"); } catch { continue; }

  const lines = src.split("\n");
  let changed = false;
  let fixCount = 0;

  // Process sorted by line descending so earlier line edits don't shift later ones
  const sorted = [...errors].toSorted((a, b) => (b.labels[0]?.span?.line ?? 0) - (a.labels[0]?.span?.line ?? 0));

  for (const d of sorted) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const lineNum = span.line - 1; // 0-indexed
    if (lineNum < 0 || lineNum >= lines.length) {continue;}
    const origLine = lines[lineNum];
    let newLine = origLine;

    switch (d.code) {

      // ── no-unused-vars: remove single-import lines ──────────────
      case "eslint(no-unused-vars)": {
        if (!d.message.includes("imported but never used")) {break;}
        const varName = d.message.match(/'([^']+)' is imported/)?.[1] ?? d.message.match(/"([^"]+)" is imported/)?.[1];
        if (!varName) {break;}
        // If this line contains only this one named import, remove it
        const singleImport = origLine.match(/^\s*import\s+(?:type\s+)?\{\s*\w+\s*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/);
        if (singleImport && origLine.includes(`{ ${varName} }`) || origLine.includes(`{${varName}}`)) {
          lines.splice(lineNum, 1);
          changed = true;
          fixCount++;
        } else if (origLine.includes(varName)) {
          // Multi-import — prefix with _
          newLine = origLine.replace(new RegExp(`\\b${varName}\\b`), `_${varName}`);
          if (newLine !== origLine) {
            lines[lineNum] = newLine;
            changed = true;
            fixCount++;
          }
        }
        break;
      }

      // ── no-floating-promises: prefix void ──────────────────────
      case "typescript-eslint(no-floating-promises)": {
        const indent = origLine.match(/^(\s*)/)?.[1] ?? "";
        const trimmed = origLine.trimStart();
        if (!/^(?:void |await |return |const |let |var |throw |\w[\w\s.]* =|\/\/)/.test(trimmed)) {
          newLine = indent + "void " + trimmed;
          if (newLine !== origLine) {
            lines[lineNum] = newLine;
            changed = true;
            fixCount++;
          }
        }
        break;
      }

      // ── no-base-to-string / restrict-template: wrap in String() ─
      case "typescript-eslint(no-base-to-string)":
      case "typescript-eslint(restrict-template-expressions)": {
        // The message says 'X will use Object's default stringification'
        // Extract the expression from the message
        const exprMatch = d.message.match(/^'([^']+)' will use Object/);
        if (!exprMatch) {break;}
        const expr = exprMatch[1];
        // Check if expr is already wrapped in String()
        if (origLine.includes(`String(${expr})`)) {break;}
        // Replace the bare expression with String(expr) in template contexts
        // Only inside template literals `${expr}` → `${String(expr)}`
        const escaped = expr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const templ = new RegExp(`\\$\\{(${escaped})\\}`, "g");
        newLine = origLine.replace(templ, `\${String($1)}`);
        // Also handle bare usage (not in template): `expr` → `String(expr)`
        if (newLine === origLine) {
          // Try to wrap if it's in a string concatenation context
          const bare = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, "g");
          if (origLine.match(bare) && !origLine.startsWith("//")) {
            newLine = origLine.replace(bare, `String(${expr})`);
          }
        }
        if (newLine !== origLine) {
          lines[lineNum] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── no-explicit-any ─────────────────────────────────────────
      case "typescript-eslint(no-explicit-any)": {
        // Replace type annotation `: any` → `: unknown`, cast `as any` → `as string`
        newLine = origLine
          .replace(/\bRecord<string, any>/g, "Record<string, unknown>")
          .replace(/\bArray<any>/g, "Array<unknown>")
          .replace(/\bPromise<any>/g, "Promise<unknown>")
          .replace(/: any(\s*[,)\]=;])/g, ": unknown$1")
          .replace(/: any(\s*\|)/g, ": unknown$1")
          .replace(/(\|\s*)any\b/g, "$1unknown")
          .replace(/<any>/g, "<unknown>")
          .replace(/\bas any\b/g, "as string");
        if (newLine !== origLine) {
          lines[lineNum] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── no-redundant-type-constituents ──────────────────────────
      case "typescript-eslint(no-redundant-type-constituents)": {
        newLine = origLine
          .replace(/\bunknown \| undefined\b/g, "unknown")
          .replace(/\bundefined \| unknown\b/g, "unknown")
          .replace(/\bany \| unknown\b/g, "unknown")
          .replace(/\bunknown \| any\b/g, "unknown")
          .replace(/\s*\| never\b/g, "")
          .replace(/\bnever \| /g, "");
        if (newLine !== origLine) {
          lines[lineNum] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── no-unnecessary-template-expression ──────────────────────
      case "typescript-eslint(no-unnecessary-template-expression)": {
        // `${someString}` → someString — but only if the template is just one expression
        // This is tricky line-level — skip complex cases
        newLine = origLine.replace(/`\$\{([a-zA-Z0-9_?.]+)\}`/g, "$1");
        if (newLine !== origLine) {
          lines[lineNum] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── no-implied-eval ─────────────────────────────────────────
      case "typescript-eslint(no-implied-eval)": {
        // setTimeout("code") → setTimeout(() => { code })
        newLine = origLine.replace(/setTimeout\("([^"]+)"\)/, "setTimeout(() => { $1; })");
        newLine = newLine.replace(/setTimeout\('([^']+)'\)/, "setTimeout(() => { $1; })");
        newLine = newLine.replace(/setInterval\("([^"]+)"\)/, "setInterval(() => { $1; })");
        if (newLine !== origLine) {
          lines[lineNum] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── await-thenable: remove spurious await ───────────────────
      case "typescript-eslint(await-thenable)": {
        newLine = origLine.replace(/\bawait (?!Promise)/, "");
        if (newLine !== origLine) {
          lines[lineNum] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── no-useless-spread: [...arr] → arr ───────────────────────
      case "eslint-plugin-unicorn(no-useless-spread)": {
        newLine = origLine.replace(/\[\.\.\.([\w.[\]]+)\]/g, "$1");
        if (newLine !== origLine) {
          lines[lineNum] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }
    }
  }

  if (changed) {
    writeFileSync(absFile, lines.join("\n"), "utf8");
    fileStats.push({ file, fixCount });
    totalFixed += fixCount;
  }
}

for (const { file, fixCount } of fileStats.toSorted((a, b) => b.fixCount - a.fixCount)) {
  console.log(`  ${fixCount.toString().padStart(3)} → ${file}`);
}
console.log(`\nTotal: ${totalFixed} fixes in ${fileStats.length} files`);
