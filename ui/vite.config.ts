import type { Plugin } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const republicOutputDir = path.join(repoRoot, "republic-output");

function normalizeBase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "/";
  }
  if (trimmed === "./") {
    return "./";
  }
  if (trimmed.endsWith("/")) {
    return trimmed;
  }
  return `${trimmed}/`;
}

// ─── MIME types for republic-output files ────────────────────────

const MIME_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css",
  js: "application/javascript",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  mp4: "video/mp4",
  webm: "video/webm",
  avi: "video/x-msvideo",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown",
  pdf: "application/pdf",
  yaml: "text/yaml",
  yml: "text/yaml",
  csv: "text/csv",
  xml: "application/xml",
  toml: "text/plain",
  ts: "text/plain",
  py: "text/plain",
  rs: "text/plain",
  go: "text/plain",
  gltf: "model/gltf+json",
  glb: "model/gltf-binary",
  obj: "text/plain",
  stl: "model/stl",
  gguf: "application/octet-stream",
  safetensors: "application/octet-stream",
  onnx: "application/octet-stream",
};

function getMime(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

// ─── Vite plugin to serve /republic-output/* ─────────────────────

function republicOutputPlugin(): Plugin {
  return {
    name: "republic-output-static",
    configureServer(server) {
      server.middlewares.use("/republic-output", (req, res, next) => {
        // req.url is relative to /republic-output, e.g. "/art/abc.png"
        const rawPath = req.url ?? "/";
        // Decode and sanitize
        let decoded: string;
        try {
          decoded = decodeURIComponent(rawPath);
        } catch {
          decoded = rawPath;
        }
        // Security: reject path traversal
        const resolved = path.resolve(republicOutputDir, "." + decoded);
        if (!resolved.startsWith(republicOutputDir + path.sep) && resolved !== republicOutputDir) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        if (!fs.existsSync(resolved)) {
          next(); // 404 will be handled by Vite
          return;
        }
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          // List directory as JSON
          const entries = fs.readdirSync(resolved);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(entries));
          return;
        }
        const mime = getMime(resolved);
        res.writeHead(200, {
          "Content-Type": mime,
          "Content-Length": stat.size,
          "Cache-Control": "no-cache",
          "Accept-Ranges": "bytes",
          "Access-Control-Allow-Origin": "*",
        });
        fs.createReadStream(resolved).pipe(res);
      });
    },
  };
}

export default defineConfig(() => {
  const envBase = process.env.OPENCLAW_CONTROL_UI_BASE_PATH?.trim();
  const base = envBase ? normalizeBase(envBase) : "./";
  return {
    base,
    plugins: [republicOutputPlugin()],
    publicDir: path.resolve(here, "public"),
    optimizeDeps: {
      include: ["lit/directives/repeat.js"],
    },
    build: {
      outDir: path.resolve(here, "../dist/legacy-ui"),
      emptyOutDir: true,
      sourcemap: true,
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes("node_modules")) {
              if (id.includes("lit") || id.includes("@lit")) {
                return "vendor-lit";
              }
              return "vendor";
            }
            if (id.includes("/views/dev-studio")) {
              return "views-studio";
            }
            if (id.includes("/views/")) {
              return "views";
            }
            if (id.includes("/controllers/")) {
              return "controllers";
            }
          },
        },
      },
    },
    server: {
      host: true,
      port: 5173,
      strictPort: true,
    },
  };
});
