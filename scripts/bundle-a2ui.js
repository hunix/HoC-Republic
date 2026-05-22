
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

// Helper to get root dir
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const HASH_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/.bundle.hash");
const OUTPUT_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/a2ui.bundle.js");
const A2UI_RENDERER_DIR = path.join(ROOT_DIR, "vendor/a2ui/renderers/lit");
const A2UI_APP_DIR = path.join(ROOT_DIR, "apps/shared/OpenClawKit/Tools/CanvasA2UI");

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function computeHash(inputPaths) {
  const hash = createHash("sha256");
  const files = [];

  async function walk(entryPath) {
    const st = await fs.stat(entryPath);
    if (st.isDirectory()) {
      const entries = await fs.readdir(entryPath);
      for (const entry of entries) {
        await walk(path.join(entryPath, entry));
      }
    } else {
      files.push(entryPath);
    }
  }

  for (const input of inputPaths) {
    if (await exists(input)) {
        await walk(input);
    }
  }

  files.sort((a, b) => path.normalize(a).localeCompare(path.normalize(b)));

  for (const filePath of files) {
    const rel = path.relative(ROOT_DIR, filePath).split(path.sep).join("/");
    hash.update(rel);
    hash.update("\0");
    const content = await fs.readFile(filePath);
    hash.update(content);
    hash.update("\0");
  }

  return hash.digest("hex");
}

async function main() {
  // Docker/CI check
  if (!(await exists(A2UI_RENDERER_DIR)) || !(await exists(A2UI_APP_DIR))) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    return;
  }

  const inputPaths = [
    path.join(ROOT_DIR, "package.json"),
    path.join(ROOT_DIR, "pnpm-lock.yaml"),
    A2UI_RENDERER_DIR,
    A2UI_APP_DIR,
  ];

  console.log("Checking A2UI bundle freshness...");
  const currentHash = await computeHash(inputPaths);
  
  if (await exists(HASH_FILE) && await exists(OUTPUT_FILE)) {
    const previousHash = (await fs.readFile(HASH_FILE, "utf8")).trim();
    if (previousHash === currentHash) {
      console.log("A2UI bundle up to date; skipping.");
      return;
    }
  }

  console.log("Bundling A2UI...");
  
  // Run tsc/tsgo
  const tsconfig = path.join(A2UI_RENDERER_DIR, "tsconfig.json");
  try {
      await execFileAsync("npx", ["tsgo", "-p", tsconfig], { shell: true, stdio: 'inherit' });
  // eslint-disable-next-line no-unused-vars
  } catch (_e) {
      await execFileAsync("npx", ["tsgo", "-p", tsconfig], { shell: true, stdio: 'inherit' });
  }

  // Run rolldown
  const rolldownConfig = path.join(A2UI_APP_DIR, "rolldown.config.mjs");
  const rolldownBin = path.join(ROOT_DIR, "node_modules", ".bin", "rolldown.cmd");
  const rolldown = (await exists(rolldownBin)) ? rolldownBin : "rolldown";
  
  await execFileAsync(rolldown, ["-c", rolldownConfig], { shell: true, stdio: 'inherit' });

  await fs.writeFile(HASH_FILE, currentHash);
  console.log("A2UI bundle created.");
}

main().catch((err) => {
  console.error("A2UI bundling failed:", err);
  process.exit(1);
});
