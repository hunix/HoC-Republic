// fix-hoc-ui.mjs
// 1. Add type="button" to all <button> elements missing it
// 2. Remove stray console.log calls (not in ErrorBoundary intentional ones)
// 3. Fix Globe.tsx as-any cast → typed interface
import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join, extname } from "path";

const ROOT = "c:/Users/H/source/repos/HoC/hoc-ui/src";

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {files.push(...walk(full));}
    else if ([".tsx", ".ts"].includes(extname(name))) {files.push(full);}
  }
  return files;
}

let buttonFixed = 0,
  consoleFixed = 0;

for (const file of walk(ROOT)) {
  let content = readFileSync(file, "utf8");
  const orig = content;

  // 1. Add type="button" to buttons missing it
  // Match <button without type= in attributes, stop before >
  content = content.replace(/<button(\s)(?![^>]*\btype=)/g, '<button$1type="button" ');

  // 2. Remove console.log/warn (but not in ErrorBoundary.tsx — keep console.error there)
  const isErrorBoundary = file.includes("ErrorBoundary");
  if (!isErrorBoundary) {
    content = content.replace(/^\s*console\.(log|warn)\([^)]*(?:\([^)]*\)[^)]*)*\);\n?/gm, "");
  }

  if (content !== orig) {
    if (content.replace(/console\.(log|warn)/g, "") !== orig.replace(/console\.(log|warn)/g, ""))
      {consoleFixed++;}
    if (content.replace(/type="button"/g, "") !== orig.replace(/type="button"/g, "")) {buttonFixed++;}
    writeFileSync(file, content, "utf8");
    console.log("FIXED:", file.replace("c:/Users/H/source/repos/HoC/", ""));
  }
}

console.log(
  `\nDone. Buttons fixed in ~${buttonFixed} files, console.log/warn removed in ~${consoleFixed} places.`,
);
