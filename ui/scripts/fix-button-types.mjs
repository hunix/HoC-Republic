// fix-button-types.mjs
// Adds type="button" to all <button> elements that are missing it across the UI views

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const UI_DIR = "c:/Users/H/source/repos/HoC/ui/src/ui";

function walkTs(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkTs(full));
    } else if (extname(entry) === ".ts" && !entry.endsWith(".test.ts")) {
      results.push(full);
    }
  }
  return results;
}

let fixed = 0;
const files = walkTs(UI_DIR);
for (const file of files) {
  const original = readFileSync(file, "utf8");
  let content = original;

  // 1. <button> with no attributes
  content = content.replace(/<button>/g, '<button type="button">');

  // 2. <button followed by whitespace + attrs but no type=
  // Handles: <button class=, <button @click=, <button ?disabled=, <button aria-, <button id=, <button style=
  content = content.replace(
    /<button\b(?!\s+type=)(?=\s+(?:class|@click|\?disabled|aria-|id=|@keydown|style=|\bform))/g,
    '<button type="button"',
  );

  if (content !== original) {
    writeFileSync(file, content, "utf8");
    fixed++;
    console.log("Fixed:", file.replace("c:/Users/H/source/repos/HoC/ui/src/ui/", ""));
  }
}
console.log(`\nDone - fixed ${fixed} files`);
