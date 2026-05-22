/**
 * Deduplication pass: collapse nested String(...) back to String(...)
 * Uses balanced-parenthesis parsing to correctly strip one layer of wrapping.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

const SKIP_DIRS = new Set(["node_modules", ".data", "dist", ".git", "build"]);

function getFilesSync(dir) {
  const result = [];
  function recurse(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) {continue;}
      const full = join(d, entry);
      let s;
      try { s = statSync(full); } catch { continue; }
      if (s.isDirectory()) {recurse(full);}
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) {result.push(full);}
    }
  }
  recurse(dir);
  return result;
}

/**
 * Strip one level of String() wrapping wherever String(...) appears.
 * Uses character-by-character balanced-paren scanner.
 */
function collapseOneLevel(src) {
  const MARKER = "String(String(";
  let result = "";
  let i = 0;
  let changed = false;

  while (i < src.length) {
    if (src.slice(i, i + MARKER.length) === MARKER) {
      // Found String(String( — want to reduce to String(
      // The outer String() goes from i to somewhere further right.
      // The inner starts at i+7 ("String("), find its balanced close paren.
      let depth = 0;
      let j = i + 7; // start scanning from the inner `S` of inner `String(`
      let outerClose = -1;
      while (j < src.length) {
        if (src[j] === "(") {depth++;}
        else if (src[j] === ")") {
          if (depth === 0) {
            // This is the close of the outer String()
            outerClose = j;
            break;
          }
          depth--;
        }
        j++;
      }
      if (outerClose !== -1) {
        // Emit: src[i+7 .. outerClose] (without outer String( and ))
        result += src.slice(i + 7, outerClose);
        i = outerClose + 1;
        changed = true;
      } else {
        result += src[i];
        i++;
      }
    } else {
      result += src[i];
      i++;
    }
  }
  return { result, changed };
}

let totalDedup = 0;

const dirs = [
  join(ROOT, "src"),
  join(ROOT, "scripts"),
  join(ROOT, "hoc-ui", "src"),
  join(ROOT, "plugins"),
];

for (const dir of dirs) {
  const files = getFilesSync(dir);
  for (const absFile of files) {
    let src;
    try { src = readFileSync(absFile, "utf8"); } catch { continue; }

    let current = src;
    // Iteratively collapse until stable (handles String(...) → String(...))
    for (let iter = 0; iter < 15; iter++) {
      const { result, changed } = collapseOneLevel(current);
      current = result;
      if (!changed) {break;}
    }

    if (current !== src) {
      writeFileSync(absFile, current, "utf8");
      const rel = absFile.replace(ROOT, "").replace(/^[/\\]/, "");
      console.log(`DEDUP → ${rel}`);
      totalDedup++;
    }
  }
}

console.log(`\nDeduped ${totalDedup} files.`);
