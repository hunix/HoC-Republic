import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const diags = JSON.parse(readFileSync(join(ROOT, "lint.json"), "utf8")).diagnostics;

function applyPatches(src, patches) {
  const sorted = [...patches].toSorted((a, b) => b.offset - a.offset);
  let out = src;
  for (const p of sorted) { out = out.slice(0, p.offset) + p.replacement + out.slice(p.offset + p.length); }
  return out;
}

const byFile = new Map();
for (const d of diags) {
  if (!byFile.has(d.filename)) {byFile.set(d.filename, []);}
  byFile.get(d.filename).push(d);
}

let total = 0;
for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let src; try { src = readFileSync(absFile, "utf8"); } catch { continue; }
  const patches = [];

  for (const d of errors) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const { offset, length } = span;
    const frag = src.slice(offset, offset + length);

    if (d.code === "typescript-eslint(no-unnecessary-type-assertion)") {
      // Span covers the entire `expr as Type` expression
      // Find the ` as X` suffix and remove it
      // The fix: remove everything after the last ` as ` in the fragment
      const asIdx = frag.lastIndexOf(" as ");
      if (asIdx > -1) {
        patches.push({ offset: offset + asIdx, length: length - asIdx, replacement: "" });
      }
    }
    if (d.code === "typescript-eslint(no-meaningless-void-operator)") {
      // frag is `void someExpr` — remove the `void ` prefix
      if (frag.startsWith("void ")) {
        patches.push({ offset, length: 5, replacement: "" });
      }
    }
    if (d.code === "typescript-eslint(no-redundant-type-constituents)") {
      // unknown → unknown, X → X
      if (frag === "unknown" || frag === "undefined") {patches.push({ offset, length, replacement: "unknown" });}
      else if (frag.endsWith(" | never")) {patches.push({ offset, length, replacement: frag.replace(/ \| never$/, "") });}
      else if (frag.startsWith("never | ")) {patches.push({ offset, length, replacement: frag.replace(/^never \| /, "") });}
    }
    if (d.code === "typescript-eslint(no-floating-promises)") {
      const lineStart = src.lastIndexOf("\n", offset) + 1;
      const lineEnd = src.indexOf("\n", offset);
      const lineText = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
      const indent = lineText.match(/^(\s*)/)?.[1] ?? "";
      const exprOffset = lineStart + indent.length;
      const exprText = src.slice(exprOffset, lineEnd === -1 ? src.length : lineEnd).trim();
      if (!exprText.startsWith("void ") && !exprText.startsWith("await ") && !exprText.startsWith("return ") && !exprText.startsWith("const ") && !exprText.startsWith("let ") && !/^[a-z]+ =/.test(exprText)) {
        if (!patches.some(p => p.offset === exprOffset)) {
          patches.push({ offset: exprOffset, length: 0, replacement: "void " });
        }
      }
    }
  }

  if (patches.length > 0) {
    const newSrc = applyPatches(src, patches);
    if (newSrc !== src) {
      writeFileSync(absFile, newSrc, "utf8");
      console.log(`FIXED ${patches.length} → ${file}`);
      total += patches.length;
    }
  }
}
console.log(`\nTotal: ${total}`);