/**
 * Column-based template-literal fixer.
 * Uses span.line and span.column from oxlint JSON to find the EXACT ${...}
 * interpolation in a template literal and wrap it with String().
 *
 * For rules:
 *   typescript-eslint(restrict-template-expressions)
 *   typescript-eslint(no-base-to-string)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const diags = JSON.parse(readFileSync(join(ROOT, "lint.json"), "utf8")).diagnostics;

const TARGETS = new Set([
  "typescript-eslint(restrict-template-expressions)",
  "typescript-eslint(no-base-to-string)",
]);

const filtered = diags.filter(d => TARGETS.has(d.code));

const byFile = new Map();
for (const d of filtered) {
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let totalFixed = 0;

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src; try { src = readFileSync(absFile, "utf8"); } catch { continue; }

  const lines = src.split("\n");
  let changed = false;
  let fixCount = 0;

  // Sort descending by line so line deletions/edits don't corrupt earlier offsets
  const sortedErrors = [...errors].toSorted((a, b) => (b.labels[0]?.span?.line ?? 0) - (a.labels[0]?.span?.line ?? 0));

  for (const d of sortedErrors) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const lineIdx = span.line - 1; // 0-indexed
    const col = span.column - 1;  // 0-indexed column
    if (lineIdx < 0 || lineIdx >= lines.length) {continue;}

    const line = lines[lineIdx];

    // Strategy 1: no-base-to-string gives the expression in the message
    const exprFromMsg = d.message.match(/^'([^']+)' will use Object's default/)?.[1];
    if (exprFromMsg) {
      const inTemplate = `\${${exprFromMsg}}`;
      if (line.includes(inTemplate)) {
        lines[lineIdx] = line.replaceAll(inTemplate, `\${String(${exprFromMsg})}`);
        if (lines[lineIdx] !== line) { changed = true; fixCount++; continue; }
      }
    }

    // Strategy 2: restrict-template-expressions — use column to find ${...}
    // The column points to the START of the interpolation expression (after ${)
    // Walk backward from col to find ${, forward to find matching }
    if (col >= 2 && line[col - 1] === "{" && line[col - 2] === "$") {
      // col is start of expression inside ${ }
      let depth = 0;
      let i = col;
      while (i < line.length) {
        if (line[i] === "{") {depth++;}
        else if (line[i] === "}") {
          if (depth === 0) {break;}
          depth--;
        }
        if (line[i] === "}" && depth === -1) {break;}
        i++;
      }
      // Actually: simple scan without depth for first matching }
      let j = col;
      let d2 = 0;
      while (j < line.length) {
        if (line[j] === "{") {d2++;}
        else if (line[j] === "}") {
          if (d2 === 0) {break;}
          d2--;
        }
        j++;
      }
      if (j < line.length && line[j] === "}") {
        const inner = line.slice(col, j);
        // Skip if already String( or simple string literal
        if (!inner.startsWith("String(") && !/"[^"]*"/.test(inner) && !/'[^']*'/.test(inner) && inner !== "null" && inner !== "undefined") {
          const before = line.slice(0, col - 2);     // up to ${
          const after = line.slice(j + 1);            // after }
          lines[lineIdx] = before + `\${String(${inner})}` + after;
          changed = true;
          fixCount++;
        }
      }
    } else {
      // Strategy 3: scan the line for ALL ${...} patterns and wrap unknown ones
      // using the column as a hint (col is near the interpolation)
      const templateRe = /\$\{([^}]+)\}/g;
      let match;
      let newLine = line;
      while ((match = templateRe.exec(line)) !== null) {
        const innerExpr = match[1];
        if (innerExpr.startsWith("String(")) {continue;}
        if (/^["'`]/.test(innerExpr)) {continue;} // Already a string literal
        if (/^\d+$/.test(innerExpr)) {continue;} // Number literal
        // Check if this interpolation is near the error column
        const midpoint = match.index + match[0].length / 2;
        if (Math.abs(midpoint - col) < line.length * 0.3) {
          newLine = newLine.replace(match[0], `\${String(${innerExpr})}`);
          changed = true;
          fixCount++;
        }
      }
      if (newLine !== line) {lines[lineIdx] = newLine;}
    }
  }

  if (changed) {
    writeFileSync(absFile, lines.join("\n"), "utf8");
    console.log(`  ${fixCount.toString().padStart(3)} → ${file}`);
    totalFixed += fixCount;
  }
}

console.log(`\nTotal: ${totalFixed} template-literal fixes`);
