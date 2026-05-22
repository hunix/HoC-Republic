/**
 * Fix no-base-to-string in tool execute callbacks by adding a type cast
 * at the start of each `execute: (s, citizen, params) => {` callback:
 *   const p = params as Record<string, string | number | boolean | undefined>;
 *
 * Then replaces `params.xxx` with `p.xxx` throughout the callback body.
 * This fixes the root type issue without wrapping each access in String().
 *
 * Targets all files in src/republic/tools/ and any other file with this pattern.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const _TP = "ToolParams";
const TYPE_CAST = `const p = params as Record<string, string | number | boolean | undefined>;\n`;

const TOOL_DIRS = [
  join(ROOT, "src", "republic", "tools"),
];

// Also fix specific non-tool files that have the same issue
const EXTRA_FILES = [
  join(ROOT, "src", "republic", "deep-research-orchestrator.ts"),
  join(ROOT, "src", "republic", "specialist-citizens.ts"),
  join(ROOT, "src", "republic", "cognitive-core.ts"),
  join(ROOT, "src", "gateway", "server-methods", "republic", "world-intel.ts"),
  join(ROOT, "src", "gateway", "server-methods", "republic", "compute.ts"),
  join(ROOT, "src", "gateway", "server-methods", "republic", "media-studio.ts"),
  join(ROOT, "src", "gateway", "server-methods", "republic", "deep-research.ts"),
  join(ROOT, "src", "gateway", "server-methods", "agents.ts"),
];

function getFilesSync(dir) {
  const result = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return result; }
  for (const entry of entries) {
    const full = join(dir, entry);
    let s;
    try { s = statSync(full); } catch { continue; }
    if (s.isDirectory()) {result.push(...getFilesSync(full));}
    else if (/\.(ts|tsx)$/.test(entry)) {result.push(full);}
  }
  return result;
}

const allFiles = [...TOOL_DIRS.flatMap(getFilesSync), ...EXTRA_FILES];

let totalFixed = 0;

for (const absFile of allFiles) {
  let src;
  try { src = readFileSync(absFile, "utf8"); } catch { continue; }

  // Pattern: `execute: (s, citizen, params) => {`
  // Add type cast at start of callback body and replace params. with p.
  const EXEC_RE = /execute:\s*\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(params)\s*\)\s*=>\s*\{/g;

  let newSrc = src;
  let _match;
  let fixCount = 0;

  // Find all execute callbacks and insert the type cast
  const matches = [...src.matchAll(EXEC_RE)];
  if (matches.length === 0) {continue;}

  // Process in reverse order to preserve offsets
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const bodyStart = m.index + m[0].length;

    // Find the proper indentation of the callback body
    const lineStart = newSrc.lastIndexOf("\n", bodyStart) + 1;
    const indentMatch = newSrc.slice(lineStart).match(/^(\s*)/);
    const indent = (indentMatch?.[1] ?? "") + "  ";

    // Insert type cast after the opening brace
    // Check if type cast already exists
    const nextChunk = new Set(newSrc.slice(bodyStart, bodyStart + 100));
    if (nextChunk.has("const p = params as") || nextChunk.has("const _p =")) {
      continue;
    }

    const _newline = newSrc[bodyStart] === "\n" ? "\n" : "";
    const insertion = `\n${indent}${TYPE_CAST.trim()}`;

    newSrc = newSrc.slice(0, bodyStart) + insertion + newSrc.slice(bodyStart);
    fixCount++;
  }

  // Now replace `params.` with `p.` throughout the file (but not `params` alone as an identifier)
  if (fixCount > 0) {
    newSrc = newSrc.replace(/\bparams\./g, "p.");
    writeFileSync(absFile, newSrc, "utf8");
    console.log(`FIXED (${fixCount} callbacks) → ${absFile.replace(ROOT, "")}`);
    totalFixed += fixCount;
  }
}

console.log(`\nTotal callbacks typed: ${totalFixed}`);
