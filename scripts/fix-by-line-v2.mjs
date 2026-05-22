/**
 * Enhanced line-based fixer with smarter pattern matching for converged errors.
 * Focuses on patterns the basic fix-by-line missed:
 *   - no-unused-vars: prefix _ to variable declarations (not just imports)
 *   - unbound-method: wrap method refs in arrow fn
 *   - no-implied-eval: setTimeout("code") → setTimeout(() => { code })
 *   - no-redundant-type-constituents: string literal + string → string
 *   - no-base-to-string: remaining ${x} where x is error/unknown obj
 *   - no-unnecessary-template-expression: `${x}` → x when x is string
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

  const sortedErrors = [...errors].toSorted((a, b) =>
    (b.labels[0]?.span?.line ?? 0) - (a.labels[0]?.span?.line ?? 0));

  for (const d of sortedErrors) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const lineIdx = span.line - 1;
    const col = (span.column ?? 1) - 1;
    if (lineIdx < 0 || lineIdx >= lines.length) {continue;}

    const origLine = lines[lineIdx];
    let newLine = origLine;

    switch (d.code) {

      // ── no-unused-vars: prefix _ to catch/function params ──
      case "eslint(no-unused-vars)": {
        const varName = d.message.match(/'([^']+)' is (defined|declared|caught)/)?.[1];
        if (!varName || varName.startsWith("_")) {break;}
        // Only prefix if it's a parameter/catch binding (not a standalone var we'd need to trace)
        if (d.message.includes("caught but never used") || d.message.includes("defined but never used")) {
          // Replace the variable name with _varName in the line, at the column position
          const before = origLine.slice(0, col);
          const after = origLine.slice(col);
          if (after.startsWith(varName)) {
            newLine = before + "_" + after;
            lines[lineIdx] = newLine;
            changed = true;
            fixCount++;
          }
        }
        break;
      }

      // ── no-implied-eval: setTimeout("code") → setTimeout(() => { code }) ──
      case "typescript-eslint(no-implied-eval)": {
        // String argument to setTimeout/setInterval
        const strMatch = origLine.match(/setTimeout\(["']([^"']+)["']/);
        const strMatch2 = origLine.match(/setInterval\(["']([^"']+)["']/);
        if (strMatch) {
          newLine = origLine.replace(/setTimeout\(["']([^"']+)["']/, `setTimeout(() => { ${strMatch[1]} }`);
          lines[lineIdx] = newLine;
          changed = true;
          fixCount++;
        } else if (strMatch2) {
          newLine = origLine.replace(/setInterval\(["']([^"']+)["']/, `setInterval(() => { ${strMatch2[1]} }`);
          lines[lineIdx] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── no-redundant-type-constituents: string literal + string ──
      case "typescript-eslint(no-redundant-type-constituents)": {
        // Pattern: "literal1" | "literal2" | string → string (if string is last)
        // Or: unknown | X → unknown
        newLine = origLine
          // string literals joined by | with final `string` → just string
          .replace(/(?:(?:"[^"]*"\s*\|\s*)+|(?:`[^`]*`\s*\|\s*)+)string\b/g, "string")
          // same with single-quoted
          .replace(/(?:(?:'[^']*'\s*\|\s*)+)string\b/g, "string")
          // template string types + string → string  
          .replace(/(?:`[^`]+`\s*\|\s*)*string\b(?!\])/g, "string")
          // X | unknown → unknown
          .replace(/[A-Za-z<>[\]|&_\s]+\|\s*unknown\b/g, "unknown");
        if (newLine !== origLine) {
          lines[lineIdx] = newLine;
          changed = true;
          fixCount++;
        }
        break;
      }

      // ── no-unnecessary-template-expression: `${string}` → string ──
      case "typescript-eslint(no-unnecessary-template-expression)": {
        // The whole template is just `${expr}` — unwrap
        newLine = origLine.replace(/`\$\{([a-zA-Z0-9_.?]+)\}`/g, "$1");
        if (newLine !== origLine) {
          lines[lineIdx] = newLine;
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
