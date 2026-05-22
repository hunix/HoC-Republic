import { readFileSync } from "node:fs";
import { join } from "node:path";
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const d = JSON.parse(readFileSync(join(ROOT,"lint.json"),"utf8")).diagnostics;
const byF = new Map();
for (const x of d) {
  if (!byF.has(x.filename)) {byF.set(x.filename, []);}
  const rule = x.code ? x.code.split("(")[1]?.replace(")","") ?? x.code : "unknown";
  byF.get(x.filename).push(`L${x.labels[0].span.line}:${rule}`);}
for (const [f, v] of [...byF.entries()].toSorted((a,b)=>b[1].length-a[1].length))
  {console.log(v.length, f, "->", v.join(" | "));}
