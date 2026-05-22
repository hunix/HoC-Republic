// resolve-conflicts-union.mjs
// Resolves git conflict markers by UNIONING both sides (keeps unique lines from both).
// This is correct when both sides add new content (new routes, imports, etc.)
// oxlint-disable-next-line no-unused-vars
import { readFileSync, writeFileSync } from "fs";

function resolveConflictsUnion(content) {
  const lines = content.split("\n");
  const result = [];
  let inConflict = false;
  let headLines = [];
  let otherLines = [];
  let inHead = true;
  let changed = false;

  for (const line of lines) {
    if (line.startsWith("<<<<<<<")) {
      inConflict = true;
      inHead = true;
      headLines = [];
      otherLines = [];
      changed = true;
      continue;
    }
    if (inConflict && line.startsWith("=======")) {
      inHead = false;
      continue;
    }
    if (inConflict && line.startsWith(">>>>>>>")) {
      inConflict = false;
      // Union: add head lines, then add other lines that aren't already in head
      for (const l of headLines) {
        result.push(l);
      }
      for (const l of otherLines) {
        if (!headLines.some((h) => h.trim() === l.trim() && l.trim() !== "")) {
          result.push(l);
        }
      }
      continue;
    }
    if (inConflict) {
      if (inHead) {
        headLines.push(line);
      } else {
        otherLines.push(line);
      }
    } else {
      result.push(line);
    }
  }
  return { result: result.join("\n"), changed };
}

const files = [
  "c:/Users/H/source/repos/HoC/hoc-ui/src/App.tsx",
  "c:/Users/H/source/repos/HoC/hoc-ui/src/pages/Sessions.tsx",
  "c:/Users/H/source/repos/HoC/hoc-ui/src/pages/republic/Simulation.tsx",
  "c:/Users/H/source/repos/HoC/hoc-ui/src/lib/navigation.ts",
  "c:/Users/H/source/repos/HoC/hoc-ui/src/lib/rpc.ts",
];

// Restore originals from git first
import { execSync } from "child_process";
try {
  execSync("git show HEAD:hoc-ui/src/App.tsx > /dev/null 2>&1 || exit 0", {
    cwd: "c:/Users/H/source/repos/HoC",
    shell: true,
  });
} catch {}

// Read the git-committed (conflicted) versions from the object store
const relPaths = files.map((f) => f.replace("c:/Users/H/source/repos/HoC/", ""));
for (let i = 0; i < files.length; i++) {
  let original;
  try {
    original = execSync(`git show HEAD:"${relPaths[i]}"`, {
      cwd: "c:/Users/H/source/repos/HoC",
      maxBuffer: 10 * 1024 * 1024,
    }).toString();
  } catch {
    console.log("SKIP (not in git HEAD):", relPaths[i]);
    continue;
  }
  const { result, changed } = resolveConflictsUnion(original);
  writeFileSync(files[i], result, "utf8");
  console.log(changed ? "RESOLVED:" : "CLEAN:", relPaths[i]);
}
console.log("Done.");
