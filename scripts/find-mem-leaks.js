/**
 * Memory Leak Detector — Enhanced Edition
 *
 * Scans TypeScript/JavaScript source files for common memory leak patterns:
 *   1. Unbounded collections (Map, Set, Array, Record) that grow but never clear
 *   2. Event listener accumulation (addEventListener without removeEventListener)
 *   3. Timer leaks (setInterval without clearInterval)
 *   4. Closure captures in long-lived callbacks
 *   5. Missing stream/handle cleanup
 *
 * Usage: node scripts/find-mem-leaks.js [--fix] [--verbose]
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");

const SEVERITY = { HIGH: "🔴", MEDIUM: "🟡", LOW: "🟢" };

function scanDir(dir, ext = [".ts", ".js"]) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (
      e.isDirectory() &&
      !full.includes("node_modules") &&
      !full.includes("dist") &&
      !full.includes(".git")
    ) {
      results = results.concat(scanDir(full, ext));
    } else if (e.isFile() && ext.includes(path.extname(full))) {
      results.push(full);
    }
  }
  return results;
}

/** Detection rules — each returns an array of findings */
const RULES = [
  // Rule 1: Unbounded collections
  {
    name: "Unbounded collection",
    severity: SEVERITY.HIGH,
    detect(content, _file) {
      const findings = [];
      const mapRegex = /const\s+(\w+)\s*:\s*Map<.*?>\s*=\s*new\s*Map\(\)/g;
      const setRegex = /const\s+(\w+)\s*:\s*Set<.*?>\s*=\s*new\s*Set\(\)/g;
      const arrayRegex = /const\s+(\w+)\s*(?::\s*.*?\[\])?\s*=\s*\[\]/g;
      const recordRegex = /const\s+(\w+)\s*:\s*Record<.*?>\s*=\s*\{\}/g;

      let match;
      [mapRegex, setRegex, arrayRegex, recordRegex].forEach((r) => {
        while ((match = r.exec(content)) !== null) {
          if (!content.substring(Math.max(0, match.index - 50), match.index).includes("export")) {
            const name = match[1];
            const hasAdd =
              content.includes(`${name}.set(`) ||
              content.includes(`${name}.push(`) ||
              content.includes(`${name}.add(`) ||
              new RegExp(`${name}\\[.*?\\]\\s*=`).test(content);
            if (hasAdd) {
              const hasClear =
                content.includes(`${name}.clear()`) ||
                content.includes(`${name}.delete(`) ||
                content.includes(`${name}.pop()`) ||
                content.includes(`${name}.shift()`) ||
                content.includes(`${name}.splice(`) ||
                content.includes(`${name}.length = 0`) ||
                content.includes(`${name} = []`) ||
                content.includes(`${name} = new Map`) ||
                content.includes(`${name} = new Set`);
              if (!hasClear) {
                const line = content.substring(0, match.index).split("\n").length;
                findings.push({
                  message: `Unbounded collection '${name}' grows but never clears`,
                  line,
                  fix: `Add periodic cleanup: ${name}.clear() or use a ring buffer (slice to max size after push)`,
                });
              }
            }
          }
        }
      });
      return findings;
    },
  },

  // Rule 2: Event listener accumulation
  {
    name: "Event listener leak",
    severity: SEVERITY.MEDIUM,
    detect(content, _file) {
      const findings = [];
      const addRe = /\.addEventListener\(\s*['"](\w+)['"]/g;
      const removeRe = /\.removeEventListener\(\s*['"](\w+)['"]/g;

      const added = new Set();
      const removed = new Set();

      let m;
      while ((m = addRe.exec(content)) !== null) {
        added.add(m[1]);
      }
      while ((m = removeRe.exec(content)) !== null) {
        removed.add(m[1]);
      }

      for (const evt of added) {
        if (!removed.has(evt)) {
          findings.push({
            message: `addEventListener('${String(evt)}') witString(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(hou)t matching removeEventListener`,
            fix: `Store the handler reference and call removeEventListener('${String(evt)}', hanString(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(Str)ing(dle)r) in cleanup/disconnectedCallback`,
          });
        }
      }
      return findings;
    },
  },

  // Rule 3: Timer leaks (setInterval without clearInterval)
  {
    name: "Timer leak",
    severity: SEVERITY.HIGH,
    detect(content, _file) {
      const findings = [];
      const intervalCount = (content.match(/setInterval\(/g) || []).length;
      const clearCount = (content.match(/clearInterval\(/g) || []).length;

      if (intervalCount > clearCount) {
        findings.push({
          message: `${intervalCount} setInterval() calls but only ${clearCount} clearInterval() — ${intervalCount - clearCount} potential timer leak(s)`,
          fix: "Store interval IDs and clear them in cleanup (disconnectedCallback, process exit handler, or AbortController)",
        });
      }

      const timeoutCount = (content.match(/setTimeout\(/g) || []).length;
      const clearTimeoutCount = (content.match(/clearTimeout\(/g) || []).length;
      // Only flag if there are significantly more setTimeout than clearTimeout
      if (timeoutCount > clearTimeoutCount + 3) {
        findings.push({
          message: `${timeoutCount} setTimeout() calls but only ${clearTimeoutCount} clearTimeout() — some may leak if component unmounts`,
          fix: "Consider using AbortSignal.timeout() or store timeout IDs for cleanup",
        });
      }
      return findings;
    },
  },

  // Rule 4: Stream/handle leaks
  {
    name: "Stream handle leak",
    severity: SEVERITY.MEDIUM,
    detect(content, _file) {
      const findings = [];

      // createReadStream/createWriteStream without .close() or pipeline()
      const createStreamCount = (content.match(/create(Read|Write)Stream\(/g) || []).length;
      const closeCount = (content.match(/\.(close|destroy|end)\(\)/g) || []).length;
      const pipelineCount = (content.match(/pipeline\(/g) || []).length;

      if (createStreamCount > 0 && closeCount === 0 && pipelineCount === 0) {
        findings.push({
          message: `${createStreamCount} stream(s) created without explicit close/destroy/pipeline`,
          fix: "Use stream.pipeline() or manually call stream.destroy() in error/finally handlers",
        });
      }
      return findings;
    },
  },

  // Rule 5: Large object retained in closures
  {
    name: "Closure retention",
    severity: SEVERITY.LOW,
    detect(content, _file) {
      const findings = [];
      // Detect patterns like: const bigData = ...; ... setInterval(() => { ... bigData ... })
      const bigDataPattern =
        /const\s+(\w+)\s*=\s*(?:Buffer\.alloc|new\s+(?:Uint8Array|Float32Array|ArrayBuffer))\(/g;
      let m;
      while ((m = bigDataPattern.exec(content)) !== null) {
        const varName = m[1];
        const afterDecl = content.substring(m.index);
        if (
          /setInterval|setTimeout|\.on\(|\.addEventListener\(/.test(afterDecl) &&
          afterDecl.includes(varName)
        ) {
          const line = content.substring(0, m.index).split("\n").length;
          findings.push({
            message: `Large buffer '${varName}' potentially captured in long-lived callback`,
            line,
            fix: `Consider using WeakRef or copy only needed data into the callback closure`,
          });
        }
      }
      return findings;
    },
  },
];

// ─── Main ────────────────────────────────────────────────────────────

const srcDir = path.join(__dirname, "..", "src");
const uiDir = path.join(__dirname, "..", "ui", "src");
const files = [...scanDir(srcDir), ...(fs.existsSync(uiDir) ? scanDir(uiDir) : [])];

console.log(`\n🔍 Enhanced Memory Leak Detector`);
console.log(`   Scanning ${files.length} files across src/ and ui/src/\n`);

let totalFindings = 0;
const summary = { high: 0, medium: 0, low: 0 };

for (const file of files) {
  if (file.includes(".test.") || file.includes(".spec.")) {continue;}
  const content = fs.readFileSync(file, "utf8");
  const relPath = path.relative(process.cwd(), file);

  for (const rule of RULES) {
    const findings = rule.detect(content, file);
    for (const f of findings) {
      totalFindings++;
      if (rule.severity === SEVERITY.HIGH) {summary.high++;}
      else if (rule.severity === SEVERITY.MEDIUM) {summary.medium++;}
      else {summary.low++;}

      console.log(`${rule.severity} [${rule.name}] ${relPath}${f.line ? `:${f.line}` : ""}`);
      console.log(`  → ${f.message}`);
      if (verbose && f.fix) {
        console.log(`  💡 Fix: ${f.fix}`);
      }
      console.log();
    }
  }
}

console.log(`\n${"═".repeat(60)}`);
console.log(`Total findings: ${totalFindings}`);
console.log(
  `  ${SEVERITY.HIGH} High: ${summary.high}  ${SEVERITY.MEDIUM} Medium: ${summary.medium}  ${SEVERITY.LOW} Low: ${summary.low}`,
);
console.log(`\nRun with --verbose for remediation suggestions`);
console.log(`${"═".repeat(60)}\n`);
