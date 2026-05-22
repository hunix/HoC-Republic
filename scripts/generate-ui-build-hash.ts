/**
 * generate-ui-build-hash.ts
 *
 * Computes a SHA-256 hash of all hoc-ui/src/** source files and writes it
 * to dist/control-ui/.build-hash.  Called at the end of `ui:build` so the
 * gateway can detect when the built UI is stale vs the current source.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uiSrcDir = path.join(rootDir, "hoc-ui", "src");
const outDir = path.join(rootDir, "dist", "control-ui");
const hashFile = path.join(outDir, ".build-hash");

/** Recursively collect file paths matching given extensions. */
function collectFiles(dir: string, exts: Set<string>): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) { return results; }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") { continue; }
      results.push(...collectFiles(full, exts));
    } else if (exts.has(path.extname(entry.name).toLowerCase())) {
      results.push(full);
    }
  }
  return results;
}

const SRC_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".html", ".json", ".svg"]);

const files = collectFiles(uiSrcDir, SRC_EXTENSIONS).toSorted();

const hasher = crypto.createHash("sha256");
for (const f of files) {
  // Include relative path so renames change the hash too
  hasher.update(path.relative(uiSrcDir, f));
  hasher.update(fs.readFileSync(f));
}
const hash = hasher.digest("hex").slice(0, 16); // 16-char hex (64-bit)

fs.mkdirSync(outDir, { recursive: true });
const info = {
  hash,
  builtAt: new Date().toISOString(),
  fileCount: files.length,
};
fs.writeFileSync(hashFile, JSON.stringify(info, null, 2) + "\n");

console.log(`✔ UI build hash: ${hash}  (${files.length} source files)`);
