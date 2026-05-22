import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

export default defineConfig([
  {
    entry: "src/index.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external: ["@mariozechner/pi-coding-agent", "pdfkit", "officegen"],
  },
  {
    entry: "src/entry.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external: ["@mariozechner/pi-coding-agent", "pdfkit", "officegen"],
  },
  {
    entry: "src/plugin-sdk/index.ts",
    outDir: "dist/plugin-sdk",
    env,
    fixedExtension: false,
    platform: "node",
    external: ["@mariozechner/pi-coding-agent", "pdfkit", "officegen"],
  },
  {
    entry: "src/extensionAPI.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external: ["@mariozechner/pi-coding-agent", "pdfkit", "officegen"],
  },
  {
    entry: "src/republic/plugin-worker-host.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external: ["@mariozechner/pi-coding-agent", "pdfkit", "officegen"],
  },
  {
    // Worker thread entry: compiled to dist/citizen-tick-worker.js
    // Required by ParallelTickPool (parallel-tick-pool.ts) which spawns
    // Node.js Worker threads pointing to this path at runtime.
    entry: "src/republic/workers/citizen-tick-worker.ts",
    env,
    fixedExtension: false,
    platform: "node",
    external: ["@mariozechner/pi-coding-agent", "pdfkit", "officegen"],
  },
]);
