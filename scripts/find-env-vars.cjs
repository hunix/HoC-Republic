const fs = require("fs");
const path = require("path");

const results = new Set();
const ignoreDirs = new Set(["node_modules", "dist", "build", ".git"]);

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    if (ignoreDirs.has(f)) {continue;}
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith(".ts") || full.endsWith(".js") || full.endsWith(".tsx")) {
      const content = fs.readFileSync(full, "utf8");
      const matches = content.match(/process\.env\.([A-Z0-9_]+)/g);
      if (matches) {
        matches.forEach((m) => results.add(m.replace("process.env.", "")));
      }
    }
  }
}
try {
  walk("c:\\\\Users\\\\HK\\\\sources\\\\repos\\\\HoC\\\\src");
  walk("c:\\\\Users\\\\HK\\\\sources\\\\repos\\\\HoC\\\\hoc-ui\\\\src");
  // eslint-disable-next-line @typescript-eslint/require-array-sort-compare
  console.log(JSON.stringify(Array.from(results).toSorted(), null, 2));
} catch (e) {
  console.error(e);
}
