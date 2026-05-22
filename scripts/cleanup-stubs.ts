/**
 * cleanup-stubs.ts — Remove stub/placeholder production files from republic-output
 *
 * Usage:
 *   npx tsx scripts/cleanup-stubs.ts --dry-run   # preview what would be deleted
 *   npx tsx scripts/cleanup-stubs.ts --confirm    # actually delete
 */

import * as fs from "node:fs";
import * as path from "node:path";

const BASE_DIR = path.join(process.cwd(), "republic-output");

const MIN_SIZE: Record<string, number> = {
  video:       500 * 1024,
  music:       100 * 1024,
  podcasts:    100 * 1024,
  games:        50 * 1024,
  websites:     10 * 1024,
  code:          1 * 1024,
  art:           5 * 1024,
  designs:       5 * 1024,
  "3d-models":  10 * 1024,
  "ml-models":  10 * 1024,
  datasets:     10 * 1024,
};
const DEFAULT_MIN = 512;

const confirm = process.argv.includes("--confirm");
const dryRun = !confirm;

if (dryRun) {
  console.log("🔍 DRY RUN — no files will be deleted. Pass --confirm to delete.\n");
}

let totalFiles = 0;
let totalDirs = 0;
let totalBytes = 0;

if (!fs.existsSync(BASE_DIR)) {
  console.log(`❌ ${BASE_DIR} does not exist.`);
  process.exit(1);
}

const categories = fs.readdirSync(BASE_DIR, { withFileTypes: true });

for (const catEntry of categories) {
  if (!catEntry.isDirectory()) {continue;}
  const cat = catEntry.name;
  const catDir = path.join(BASE_DIR, cat);
  const minBytes = MIN_SIZE[cat] ?? DEFAULT_MIN;
  const entries = fs.readdirSync(catDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(catDir, entry.name);

    if (entry.isFile()) {
      const stat = fs.statSync(fullPath);
      if (stat.size < minBytes) {
        totalFiles++;
        totalBytes += stat.size;
        console.log(`  🗑️  ${cat}/${entry.name} (${stat.size}B)`);
        if (confirm) {
          fs.unlinkSync(fullPath);
        }
      }
    } else if (entry.isDirectory()) {
      // Calculate total dir size
      let dirSize = 0;
      const walk = (dir: string) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const fp = path.join(dir, f.name);
          if (f.isFile()) {
            dirSize += fs.statSync(fp).size;
          } else if (f.isDirectory()) {
            walk(fp);
          }
        }
      };
      walk(fullPath);

      if (dirSize < minBytes) {
        totalDirs++;
        totalBytes += dirSize;
        console.log(`  🗑️  ${cat}/${entry.name}/ (${dirSize}B total)`);
        if (confirm) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      }
    }
  }
}

console.log(`\n${"─".repeat(50)}`);
console.log(`${dryRun ? "Would delete" : "Deleted"}:`);
console.log(`  Files: ${totalFiles}`);
console.log(`  Directories: ${totalDirs}`);
console.log(`  Total size: ${(totalBytes / 1024).toFixed(1)}KB`);

if (dryRun) {
  console.log(`\nRun with --confirm to delete these files.`);
}
