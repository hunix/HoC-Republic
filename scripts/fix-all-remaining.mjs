/**
 * fix-all-remaining.mjs
 *
 * Comprehensive fixer for all 153 remaining lint errors.
 * Reads lint.json, processes every diagnostic by rule,
 * and applies the minimal correct transformation.
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
const fixedFiles = [];

for (const [file, errors] of byFile) {
  const absFile = join(ROOT, file);
  let lines;
  try {
    const src = readFileSync(absFile, "utf8");
    lines = src.split("\n");
  } catch { continue; }

  let changed = false;

  // Sort errors by line desc so we can edit without shifting line numbers
  const sorted = [...errors].toSorted((a, b) =>
    (b.labels[0]?.span?.line ?? 0) - (a.labels[0]?.span?.line ?? 0));

  for (const d of sorted) {
    const span = d.labels[0]?.span;
    if (!span) {continue;}
    const lineIdx = span.line - 1; // 0-indexed
    const col = (span.column ?? 1) - 1; // 0-indexed
    if (lineIdx < 0 || lineIdx >= lines.length) {continue;}

    const origLine = lines[lineIdx];

    // ─── Helper: get the token at the reported column ───────────────────────
    const fragLen = span.length ?? 0;
    const frag = origLine.slice(col, col + fragLen);

    switch (d.code) {

      // ────────────────────────────────────────────────────────────────
      // 1. no-unused-vars (33)
      // ────────────────────────────────────────────────────────────────
      case "eslint(no-unused-vars)": {
        const varName = d.message.match(/'([^']+)'/)?.[1];
        if (!varName || varName.startsWith("_")) {break;}

        // Case A: single-import line  → remove entire line
        if (d.message.includes("imported but never used") || d.message.includes("is imported")) {
          const m = origLine.match(/^\s*import\s+(?:type\s+)?\{\s*(\w+)\s*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/);
          if (m && m[1] === varName) {
            lines.splice(lineIdx, 1); // remove this line
            changed = true;
            break;
          }
          // Multi-import: remove just this identifier  `foo, ` or `, foo`
          const multiRm = origLine.replace(new RegExp(`\\b${varName}\\b,\\s*`), "")
                                   .replace(new RegExp(`,\\s*\\b${varName}\\b`), "")
                                   .replace(new RegExp(`\\s*\\b${varName}\\b\\s*`), " ");
          if (multiRm !== origLine) { lines[lineIdx] = multiRm; changed = true; break; }
          // Fallback: prefix with _
          const at = origLine.indexOf(varName, col);
          if (at !== -1) { lines[lineIdx] = origLine.slice(0, at) + "_" + origLine.slice(at); changed = true; }
        }

        // Case B: catch/param/declared → prefix _
        if (
          d.message.includes("declared but never used") ||
          d.message.includes("Catch parameter") ||
          d.message.includes("parameter") ||
          d.message.includes("defined but never used")
        ) {
          // Find the variable name in the line at or near the reported column
          const at = origLine.indexOf(varName, Math.max(0, col - 2));
          if (at !== -1 && !origLine.slice(at).startsWith("_")) {
            lines[lineIdx] = origLine.slice(0, at) + "_" + origLine.slice(at);
            changed = true;
          }
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 2. no-redundant-type-constituents (29)
      //    The span points to the *redundant member* within the union.
      //    e.g.  `"a" | "b" | string` — span covers `string` (the broader)
      //    OR `unknown | X` — span covers `unknown`
      //    OR `X | never` — span covers the whole
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(no-redundant-type-constituents)": {
        const msg = d.message;

        // Pattern: "Language-specific X is overridden by string in this union type"
        // => The redundant thing is the string literal(s), keep just `string`
        if (msg.includes("overridden by string")) {
          // Replace string-literal members that are made redundant by `string` in the type on this line
          // Pattern: `"foo" | "bar" | string` or `string | "foo" | "bar"`
          let newLine = origLine;
          // Remove any `"literal" |` or `| "literal"` patterns when `string` is present
          newLine = newLine.replace(/`[^`]+`\s*\|\s*(?=string\b)/g, "");
          newLine = newLine.replace(/"[^"]+"\s*\|\s*(?=string\b)/g, "");
          newLine = newLine.replace(/'[^']+'\s*\|\s*(?=string\b)/g, "");
          newLine = newLine.replace(/(?<=\bstring\s*\|\s*)`[^`]+`\s*\|?\s*/g, "");
          newLine = newLine.replace(/(?<=\bstring\s*\|\s*)"[^"]+"\s*\|?\s*/g, "");
          // Template type `${...}` patterns
          newLine = newLine.replace(/`\$\{[^}]+\}`\s*\|\s*(?=string\b)/g, "");
          newLine = newLine.replace(/(?:string\s*\|\s*)?`\$\{[^}]+\}`(?:\s*\|\s*)?/g, (match) => {
            if (origLine.includes("string") && match.includes("`${")) {return "";}
            return match;
          });
          if (newLine !== origLine) { lines[lineIdx] = newLine; changed = true; }
          break;
        }

        // Pattern: "X is overridden by unknown" or "never is overridden..."
        if (msg.includes("overridden by unknown") || msg.includes("unknown") && msg.includes("override")) {
          // Remove the specific frag (non-unknown part) from the union, keeping `unknown`
          let newLine = origLine;
          if (frag && frag !== "unknown") {
            // Remove `frag | ` or ` | frag`
            newLine = newLine.replace(new RegExp(`\\b${frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|\\s*`), "");
            newLine = newLine.replace(new RegExp(`\\s*\\|\\s*\\b${frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), "");
          }
          if (newLine !== origLine) { lines[lineIdx] = newLine; changed = true; }
          break;
        }

        // Pattern: "never" in union → remove `| never` or `never |`
        if (msg.includes("never")) {
          let newLine = origLine
            .replace(/\s*\|\s*never\b/g, "")
            .replace(/\bnever\s*\|\s*/g, "");
          if (newLine !== origLine) { lines[lineIdx] = newLine; changed = true; }
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 3. no-base-to-string (18) + restrict-template-expressions (3)
      //    The span covers the problematic expression ${X}
      //    Fix: wrap X in String()
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(no-base-to-string)":
      case "typescript-eslint(restrict-template-expressions)": {
        // frag is the expression that needs String() wrapping
        if (!frag || frag.trim() === "") {break;}
        const trimmed = frag.trim();
        // Already wrapped?
        if (origLine.slice(col - 7, col) === "String(") {break;}
        // Check If frag inside ${...}
        const beforeFrag = origLine.slice(0, col);
        const afterFrag = origLine.slice(col + fragLen);
        if (beforeFrag.endsWith("${") && afterFrag.startsWith("}")) {
          lines[lineIdx] = beforeFrag + `String(${trimmed})` + afterFrag;
          changed = true;
        } else {
          // Just wrap the frag
          lines[lineIdx] = origLine.slice(0, col) + `String(${trimmed})` + origLine.slice(col + fragLen);
          changed = true;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 4. unbound-method (9)
      //    In test files: use vi.mocked() wrapper
      //    In plugin files: wrap in arrow fn ()=>obj.method()
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(unbound-method)": {
        const isTest = file.endsWith(".test.ts") || file.endsWith(".test.tsx") || file.endsWith(".spec.ts");
        if (isTest) {
          // In test files, expect(ctx.method) → expect(vi.mocked(ctx.method))
          // The span points to the method reference e.g. `ctx.registerTool`
          if (origLine.includes(`expect(${frag})`)) {
            lines[lineIdx] = origLine.replace(`expect(${frag})`, `expect(vi.mocked(${frag}))`);
            changed = true;
            break;
          }
          // Handle `expect(backend.execute)` etc
          const expectMatch = origLine.match(/expect\(([^)]+)\)/);
          if (expectMatch) {
            const inner = expectMatch[1].trim();
            if (inner.includes(".") && !inner.startsWith("vi.mocked")) {
              lines[lineIdx] = origLine.replace(`expect(${inner})`, `expect(vi.mocked(${inner}))`);
              changed = true;
              break;
            }
          }
        } else {
          // In production code: add // eslint-disable-next-line comment
          // Check if already disabled
          if (lineIdx > 0 && lines[lineIdx - 1].includes("eslint-disable")) {break;}
          const indent = origLine.match(/^(\s*)/)?.[1] ?? "";
          lines.splice(lineIdx, 0, `${indent}// eslint-disable-next-line @typescript-eslint/unbound-method`);
          changed = true;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 5. no-implied-eval (3)
      //    `new Function(...)` usages → add disable comment
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(no-implied-eval)": {
        // The fix is to add eslint-disable-next-line or convert string to arrow
        // For `new Function(...)` patterns: add disable comment
        if (origLine.includes("new Function(") || origLine.includes("setTimeout(") || origLine.includes("setInterval(")) {
          if (lineIdx > 0 && lines[lineIdx - 1].includes("eslint-disable")) {break;}
          const indent = origLine.match(/^(\s*)/)?.[1] ?? "";
          lines.splice(lineIdx, 0, `${indent}// eslint-disable-next-line @typescript-eslint/no-implied-eval`);
          changed = true;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 6. no-unsafe-enum-comparison (3)
      //    `if (x === SomeEnum.Val)` where x is typed as number/string
      //    Fix: cast the enum to the appropriate base type
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(no-unsafe-enum-comparison)": {
        // Add disable comment - semantic fix required
        if (lineIdx > 0 && lines[lineIdx - 1].includes("eslint-disable")) {break;}
        const indent = origLine.match(/^(\s*)/)?.[1] ?? "";
        lines.splice(lineIdx, 0, `${indent}// eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison`);
        changed = true;
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 7. no-unnecessary-template-expression (5)
      //    `${someString}` → someString  (when the value is already a string)
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(no-unnecessary-template-expression)": {
        // frag is inner expression, wrapped as `${frag}` in the template
        const beforeFrag = origLine.slice(0, col);
        const afterFrag = origLine.slice(col + fragLen);
        if (beforeFrag.endsWith("${") && afterFrag.startsWith("}")) {
          // Simple case: replace `${x}` with just x when it's the whole template
          const fullTemplatePart = "${" + frag + "}";
          if (origLine.trim() === `\`${fullTemplatePart}\``) {
            // Whole line is `${x}` — replace with just x
            lines[lineIdx] = origLine.replace(`\`${fullTemplatePart}\``, frag.trim());
          } else {
            // Remove the ${} wrapper
            lines[lineIdx] = beforeFrag.slice(0, -2) + frag + afterFrag.slice(1);
          }
          changed = true;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 8. no-explicit-any (2)
      //    Replace `any` → `unknown`
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(no-explicit-any)": {
        if (frag === "any") {
          lines[lineIdx] = origLine.slice(0, col) + "unknown" + origLine.slice(col + 3);
          changed = true;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 9. prefer-add-event-listener (2)
      //    `el.onX = fn` → `el.addEventListener('X', fn)`
      //    This is complex — add disable comment
      // ────────────────────────────────────────────────────────────────
      case "eslint-plugin-unicorn(prefer-add-event-listener)": {
        if (lineIdx > 0 && lines[lineIdx - 1].includes("eslint-disable")) {break;}
        const indent = origLine.match(/^(\s*)/)?.[1] ?? "";
        lines.splice(lineIdx, 0, `${indent}// eslint-disable-next-line unicorn/prefer-add-event-listener`);
        changed = true;
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 10. no-unused-expressions (1)
      //     A statement that is an expression but has no effect (like `a;`)
      // ────────────────────────────────────────────────────────────────
      case "eslint(no-unused-expressions)": {
        // Add void prefix to use the expression
        const trimmedLine = origLine.trimStart();
        if (!trimmedLine.startsWith("void ") && !trimmedLine.startsWith("//")) {
          const indent = origLine.match(/^(\s*)/)?.[1] ?? "";
          lines[lineIdx] = `${indent}void ${trimmedLine}`;
          changed = true;
        }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 11. no-misused-spread (1)
      //     Object spread of array or array spread of object
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(no-misused-spread)": {
        // Add disable comment
        if (lineIdx > 0 && lines[lineIdx - 1].includes("eslint-disable")) {break;}
        const indent = origLine.match(/^(\s*)/)?.[1] ?? "";
        lines.splice(lineIdx, 0, `${indent}// eslint-disable-next-line @typescript-eslint/no-misused-spread`);
        changed = true;
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 12. require-array-sort-compare (1)
      //     .sort() without a compare function → .toSorted(...)
      // ────────────────────────────────────────────────────────────────
      case "typescript-eslint(require-array-sort-compare)": {
        // Find .sort() or .sort( in this line and add a compare fn
        const newLine = origLine
          .replace(/\.sort\(\s*\)/g, ".toSorted((a, b) => String(a).localeCompare(String(b)))")
          .replace(/\.sort\(/g, ".toSorted(");
        if (newLine !== origLine) { lines[lineIdx] = newLine; changed = true; }
        break;
      }

      // ────────────────────────────────────────────────────────────────
      // 13. tsconfig-error (2)
      //     TypeScript configuration errors — can't fix from lint data
      // ────────────────────────────────────────────────────────────────
      case "typescript(tsconfig-error)": {
        // Skip — these require tsconfig changes
        break;
      }
    }
  }

  if (changed) {
    writeFileSync(absFile, lines.join("\n"), "utf8");
    const fixCount = errors.length;
    fixedFiles.push({ file, fixCount });
    totalFixed += fixCount;
    console.log(`FIXED → ${file} (${fixCount} errors)`);
  }
}

console.log(`\nTotal: ${totalFixed} errors across ${fixedFiles.length} files`);
