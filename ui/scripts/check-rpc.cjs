const fs = require("fs");
const path = require("path");

function walk(dir, exts) {
  const results = [];
  for (const n of fs.readdirSync(dir)) {
    const full = path.join(dir, n);
    const s = fs.statSync(full);
    if (s.isDirectory() && n !== "node_modules") {results.push(...walk(full, exts));}
    else if (exts.some((e) => n.endsWith(e))) {results.push(full);}
  }
  return results;
}

const uiFiles = walk("hoc-ui/src", [".tsx", ".ts"]);
const uiMethods = new Set();
for (const f of uiFiles) {
  const c = fs.readFileSync(f, "utf8");
  const re = /(?:useRpc|rpc|mutateRpc)\s*(?:<[^>]*>)?\s*\(\s*['"]([a-z][a-z0-9._]+)['"]/g;
  let m;
  while ((m = re.exec(c)) !== null) {uiMethods.add(m[1]);}
}

const smContent = fs.readFileSync("src/gateway/server-methods.ts", "utf8");
const serverMethods = new Set();
const caseRe = /case\s+['"]([a-z][a-z0-9._]+)['"]/g;
let cm;
while ((cm = caseRe.exec(smContent)) !== null) {serverMethods.add(cm[1]);}

const missing = [];
for (const m of uiMethods) {
  if (!serverMethods.has(m) && m.length > 3) {missing.push(m);}
}
console.log("UI methods not found in server-methods.ts:");
missing.toSorted().forEach((m) => console.log(" MISSING:", m));
console.log("\nTotal UI methods:", uiMethods.size, "Server case entries:", serverMethods.size);
