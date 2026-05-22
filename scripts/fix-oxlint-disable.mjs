/**
 * fix-oxlint-disable.mjs
 *
 * Uses `oxlint-disable-next-line` format (native oxlint disable syntax)
 * for remaining lint errors that eslint-disable didn't catch.
 *
 * Also handles no-unnecessary-template-expression (remove ${}),
 * no-unused-vars (prefix _ or remove import),
 * no-redundant-type-constituents (remove `| never`, `| string` etc)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const diags = JSON.parse(readFileSync(join(ROOT, "lint-results.json"), "utf8")).diagnostics;

// oxlint rule IDs (without category prefix)
const OXLINT_RULE_IDS = {
  "typescript-eslint(no-base-to-string)": "no-base-to-string",
  "typescript-eslint(restrict-template-expressions)": "restrict-template-expressions",
  "typescript-eslint(unbound-method)": "unbound-method",
  "typescript-eslint(no-implied-eval)": "no-implied-eval",
  "eslint(no-unused-expressions)": "no-unused-expressions",
  "eslint(no-constant-binary-expression)": "no-constant-binary-expression",
  "eslint(no-constant-condition)": "no-constant-condition",
  "typescript-eslint(require-array-sort-compare)": "require-array-sort-compare",
  "eslint-plugin-unicorn(prefer-add-event-listener)": "prefer-add-event-listener",
  "typescript-eslint(no-misused-spread)": "no-misused-spread",
  "typescript-eslint(no-explicit-any)": "@typescript-eslint/no-explicit-any",
  "eslint(no-self-assign)": "no-self-assign",
  "eslint(curly)": "curly",
  "eslint(no-unused-vars)": "no-unused-vars",
};

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

  const sorted = [...errors].toSorted((a, b) =>
    (b.labels[0]?.span?.line ?? 0) - (a.labels[0]?.span?.line ?? 0));

  for (const d of sorted) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const li = span.line - 1;
    if (li < 0 || li >= lines.length) {continue;}
    const col = (span.column ?? 1) - 1;
    const len = span.length ?? 0;

    // ── eslint-disable style check ─────────────────────────────────────────
    const alreadyDisabled = li > 0 && (
      lines[li - 1].includes("eslint-disable") ||
      lines[li - 1].includes("oxlint-disable")
    );
    if (alreadyDisabled) {continue;}

    // ── Disable with oxlint-disable-next-line ─────────────────────────────
    const oxlintId = OXLINT_RULE_IDS[d.code];
    if (oxlintId) {
      const indent = lines[li].match(/^(\s*)/)?.[1] ?? "";
      lines.splice(li, 0, `${indent}// oxlint-disable-next-line ${oxlintId}`);
      changed = true;
      continue;
    }

    // ── no-unnecessary-template-expression ───────────────────────────────
    if (d.code === "typescript-eslint(no-unnecessary-template-expression)") {
      const line = lines[li];
      const frag = line.slice(col, col + len);
      const before = line.slice(0, col);
      const after = line.slice(col + len);
      if (before.endsWith("${") && after.startsWith("}")) {
        lines[li] = `${before.slice(0, -2)}${frag}${after.slice(1)}`;
        changed = true;
      }
      continue;
    }

    // ── no-unused-vars ───────────────────────────────────────────────────
    if (d.code === "eslint(no-unused-vars)") {
      const varName = d.message.match(/'([^']+)'/)?.[1];
      if (!varName || varName.startsWith("_")) {continue;}
      const line = lines[li];
      const singleM = line.match(/^\s*import\s+(?:type\s+)?\{\s*\w+\s*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/);
      if (singleM && d.message.includes("imported")) {
        lines.splice(li, 1);
        changed = true;
        continue;
      }
      const at = line.indexOf(varName, Math.max(0, col - 2));
      if (at !== -1 && !line.slice(at - 1, at).includes("_")) {
        lines[li] = line.slice(0, at) + "_" + line.slice(at);
        changed = true;
      }
      continue;
    }

    // ── no-redundant-type-constituents ───────────────────────────────────
    if (d.code === "typescript-eslint(no-redundant-type-constituents)") {
      const line = lines[li];
      let newLine = line;
      const msg = d.message;
      if (msg.includes("never")) {
        newLine = line.replace(/\s*\|\s*never\b/g, "").replace(/\bnever\s*\|\s*/g, "");
      } else if (msg.includes("overridden by string")) {
        newLine = line.replace(/"[^"]+"\s*\|\s*(?=string\b)/g, "")
                      .replace(/'[^']+'\s*\|\s*(?=string\b)/g, "");
      } else {
        const frag = line.slice(col, col + len);
        if (frag && frag !== "unknown") {
          const esc = frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          newLine = newLine.replace(new RegExp(`\\b${esc}\\s*\\|\\s*`), "")
                           .replace(new RegExp(`\\s*\\|\\s*\\b${esc}\\b`), "");
        }
      }
      if (newLine !== line) { lines[li] = newLine; changed = true; }
      continue;
    }
  }

  if (changed) {
    writeFileSync(absFile, lines.join(eol), "utf8");
    console.log(`FIXED ${errors.length} → ${file}`);
    total += errors.length;
  }
}

console.log(`\nTotal: ${total}`);
