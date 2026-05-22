/**
 * Republic Platform — Preview Engine
 *
 * Domain layer for three preview strategies:
 * 1. ESM CDN — In-browser Babel transpilation + esm.sh for npm packages
 * 2. Local Dev Server — Real Node.js via workspace-manager execInWorkspace
 * 3. WebContainer — StackBlitz WebContainer API for full Node.js in-browser
 *
 * Each strategy implements a common PreviewSession lifecycle:
 *   start → running → stop
 *
 * Sessions are managed server-side and exposed via republic.preview.* RPC
 * handlers in the gateway.
 */

import type { DevProject, ProjectFile } from "./dev-orchestration.js";
import { getState } from "./state.js";
import { ts, uid } from "./utils.js";
import {
    createWorkspace, execInWorkspace, getWorkspace, writeWorkspaceFile, type ShellResult
} from "./workspace-manager.js";

// ─── Types ──────────────────────────────────────────────────────

export type PreviewEngine = "esm" | "local" | "webcontainer";

export type PreviewSessionStatus =
  | "idle"
  | "preparing"
  | "installing"
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "error";

export interface PreviewSession {
  id: string;
  projectId: string;
  projectName: string;
  engine: PreviewEngine;
  status: PreviewSessionStatus;
  url: string | null;
  port: number | null;
  logs: string[];
  error: string | null;
  startedAt: string;
  stoppedAt: string | null;
  /** ESM-specific: the generated blob HTML (so the UI can create a blob URL) */
  generatedHtml: string | null;
  /** Local-specific: the workspace directory path */
  workspaceDir: string | null;
  /** Local-specific: process exit code if completed */
  exitCode: number | null;
  /** Dependencies resolved */
  resolvedDeps: Record<string, string>;
}

export interface PreviewDiagnostics {
  activeSessions: number;
  totalStarted: number;
  engines: {
    esm: { available: boolean; sessionsActive: number };
    local: { available: boolean; nodeVersion: string | null; sessionsActive: number };
    webcontainer: { available: boolean; sessionsActive: number };
  };
  timestamp: string;
}

// ─── Session Registry ───────────────────────────────────────────

const sessions = new Map<string, PreviewSession>();
let totalStarted = 0;
let cachedNodeVersion: string | null = null;

function createSession(
  projectId: string,
  projectName: string,
  engine: PreviewEngine,
): PreviewSession {
  const session: PreviewSession = {
    id: `preview-${uid()}`,
    projectId,
    projectName,
    engine,
    status: "idle",
    url: null,
    port: null,
    logs: [],
    error: null,
    startedAt: ts(),
    stoppedAt: null,
    generatedHtml: null,
    workspaceDir: null,
    exitCode: null,
    resolvedDeps: {},
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(sessionId: string): PreviewSession | undefined {
  return sessions.get(sessionId);
}

export function getActiveSessions(): PreviewSession[] {
  return [...sessions.values()].filter(
    (s) => s.status === "running" || s.status === "starting" || s.status === "installing",
  );
}

export function getAllSessions(): PreviewSession[] {
  return [...sessions.values()];
}

// ─── Shared Helpers ─────────────────────────────────────────────

function findProject(projectId: string): DevProject | null {
  const s = getState();
  return s.devProjects.find((p) => p.id === projectId) ?? null;
}

function log(session: PreviewSession, msg: string): void {
  session.logs.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

function isReactFile(path: string): boolean {
  return /\.(tsx|jsx)$/i.test(path);
}

function isCssFile(path: string): boolean {
  return /\.(css|scss|less)$/i.test(path);
}

function isCodeFile(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path);
}

function isConfigFile(path: string): boolean {
  return /\.(json|toml|yaml|yml|env|lock|gitignore|dockerignore|md)$/i.test(path) ||
    /^(Dockerfile|\.env|\.gitignore)/.test(path.split("/").pop() ?? "");
}

function hasReactFiles(files: ProjectFile[]): boolean {
  return files.some(
    (f) =>
      isReactFile(f.path) ||
      f.content.includes("import React") ||
      f.content.includes("from 'react'") ||
      f.content.includes('from "react"'),
  );
}

/** Extract npm package names from import statements */
function extractDependencies(files: ProjectFile[]): string[] {
  const deps = new Set<string>();
  const importRe = /(?:import|from)\s+['"]([^./][^'"]*)['"]/g;
  const requireRe = /require\s*\(\s*['"]([^./][^'"]*)['"]\s*\)/g;

  for (const f of files) {
    if (!isCodeFile(f.path)) {continue;}
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(f.content)) !== null) {
      const pkg = m[1].startsWith("@")
        ? m[1].split("/").slice(0, 2).join("/")
        : m[1].split("/")[0];
      deps.add(pkg);
    }
    while ((m = requireRe.exec(f.content)) !== null) {
      const pkg = m[1].startsWith("@")
        ? m[1].split("/").slice(0, 2).join("/")
        : m[1].split("/")[0];
      deps.add(pkg);
    }
  }

  // Remove Node.js built-ins
  const builtins = new Set([
    "fs", "path", "os", "http", "https", "url", "util", "stream",
    "crypto", "events", "child_process", "cluster", "dgram", "dns",
    "net", "readline", "repl", "tls", "zlib", "assert", "buffer",
    "console", "constants", "domain", "module", "process", "punycode",
    "querystring", "string_decoder", "sys", "timers", "tty", "v8", "vm",
    "worker_threads", "perf_hooks",
    "node:fs", "node:path", "node:os", "node:http", "node:https",
    "node:url", "node:util", "node:stream", "node:crypto", "node:events",
    "node:child_process",
  ]);
  for (const b of builtins) {deps.delete(b);}

  return [...deps];
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY 1: ESM CDN Preview
// ═══════════════════════════════════════════════════════════════

/**
 * Generate mock Supabase client for preview sandboxes.
 */
function generateMockSupabase(): string {
  return `
window.__SUPABASE_MOCK__ = true;
const mockUser = { id: 'preview-user', email: 'preview@republic.dev', user_metadata: { full_name: 'Preview User' } };
const mockSession = { user: mockUser, access_token: 'preview-token' };
const mockData = new Map();
window.createClient = function(url, key) {
  return {
    auth: {
      getUser: async () => ({ data: { user: mockUser }, error: null }),
      getSession: async () => ({ data: { session: mockSession }, error: null }),
      signInWithPassword: async () => ({ data: { user: mockUser, session: mockSession }, error: null }),
      signUp: async () => ({ data: { user: mockUser, session: mockSession }, error: null }),
      signOut: async () => {},
      onAuthStateChange: (cb) => { cb('SIGNED_IN', mockSession); return { data: { subscription: { unsubscribe: () => {} } } }; },
    },
    from: (table) => ({
      select: async () => ({ data: mockData.get(table) || [], error: null }),
      insert: async (row) => { const d = mockData.get(table) || []; d.push({...row, id: crypto.randomUUID()}); mockData.set(table, d); return { data: row, error: null }; },
      update: (row) => ({ eq: async () => ({ data: row, error: null }) }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'preview/file.png' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22100%22%20height=%22100%22%3E%3Crect%20fill=%22%23818cf8%22%20width=%22100%22%20height=%22100%22%20rx=%2210%22/%3E%3C/svg%3E' } }),
      }),
    },
  };
};`;
}

/**
 * Build ESM import map JSON for the project's npm dependencies.
 * Uses esm.sh CDN to resolve bare npm imports in-browser.
 */
function buildEsmImportMap(deps: string[]): Record<string, string> {
  const map: Record<string, string> = {};

  // Always include React ecosystem
  map["react"] = "https://esm.sh/react@18?dev";
  map["react-dom"] = "https://esm.sh/react-dom@18?dev";
  map["react-dom/client"] = "https://esm.sh/react-dom@18/client?dev";
  map["react/jsx-runtime"] = "https://esm.sh/react@18/jsx-runtime?dev";

  // Common packages that need special handling
  const specialMappings: Record<string, string> = {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2",
    "lucide-react": "https://esm.sh/lucide-react@latest?external=react",
    "react-router-dom": "https://esm.sh/react-router-dom@6?external=react,react-dom",
    "react-router": "https://esm.sh/react-router@6?external=react",
    "framer-motion": "https://esm.sh/framer-motion@11?external=react,react-dom",
    "@tanstack/react-query": "https://esm.sh/@tanstack/react-query@5?external=react",
    "zustand": "https://esm.sh/zustand@4?external=react",
    "axios": "https://esm.sh/axios@1",
    "date-fns": "https://esm.sh/date-fns@3",
    "clsx": "https://esm.sh/clsx@2",
    "tailwind-merge": "https://esm.sh/tailwind-merge@2",
    "zod": "https://esm.sh/zod@3",
    "sonner": "https://esm.sh/sonner@1?external=react,react-dom",
  };

  for (const dep of deps) {
    if (map[dep]) {continue;} // already mapped
    if (specialMappings[dep]) {
      map[dep] = specialMappings[dep];
    } else {
      // Generic CDN mapping — external react for React-related packages
      const isReactRelated = dep.includes("react") || dep.startsWith("@radix-ui/");
      map[dep] = isReactRelated
        ? `https://esm.sh/${dep}?external=react,react-dom`
        : `https://esm.sh/${dep}`;
    }
  }

  return map;
}

/**
 * Generate a full React SPA preview HTML using ESM CDN imports.
 * This is the core of the ESM preview strategy.
 */
function generateEsmPreviewHtml(
  files: ProjectFile[],
  projectName: string,
  deps: string[],
): string {
  // Collect CSS
  const cssFiles = files.filter((f) => isCssFile(f.path));
  const cssContent = cssFiles.map((f) => `/* ${f.path} */\n${f.content}`).join("\n\n");

  // Build ESM import map
  const importMap = buildEsmImportMap(deps);

  // Collect code files (skip configs)
  const codeFiles = files.filter(
    (f) => (isReactFile(f.path) || isCodeFile(f.path)) && !isConfigFile(f.path),
  );

  // Build virtual module registry
  const moduleRegistry: Record<string, string> = {};
  for (const f of codeFiles) {
    const moduleName = f.path
      .replace(/^src\//, "")
      .replace(/\.(tsx?|jsx?)$/, "")
      .replace(/\//g, "/");
    moduleRegistry[moduleName] = f.content;
  }

  // Find entry point
  const entryOrder = [
    "app/page", "App", "index", "main",
    "app/layout", "src/App", "src/index",
  ];
  let entryModule = "";
  for (const entry of entryOrder) {
    if (moduleRegistry[entry]) { entryModule = entry; break; }
  }
  if (!entryModule) {
    const reactFile = codeFiles.find((f) => isReactFile(f.path));
    if (reactFile) {
      entryModule = reactFile.path.replace(/^src\//, "").replace(/\.(tsx?|jsx?)$/, "");
    }
  }

  const moduleMapJson = JSON.stringify(moduleRegistry)
    .replace(/<\/script>/g, "<\\/script>")
    .replace(/</g, "\\u003c");

  const importMapJson = JSON.stringify({ imports: importMap }, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} — ESM Preview</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <script type="importmap">${importMapJson}</script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #0d1117; color: #e6edf3;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    a { color: #818cf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    button { cursor: pointer; font-family: inherit; }
    input, textarea, select { font-family: inherit; }
    :root {
      --primary: #818cf8; --primary-hover: #6366f1;
      --success: #34d399; --warning: #fbbf24; --danger: #f87171;
      --bg: #0d1117; --bg-card: rgba(255,255,255,0.05);
      --border: rgba(255,255,255,0.08);
      --text: #e6edf3; --text-muted: #8b949e;
    }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <div id="portal-root"></div>
  <script>${generateMockSupabase()}</script>
  <script>
    // Virtual Module System with ESM CDN fallback
    const __modules__ = ${moduleMapJson};
    const __cache__ = {};

    function __require__(name) {
      if (name === 'react' || name === 'React') return window.React;
      if (name === 'react-dom' || name === 'react-dom/client') return window.ReactDOM;
      if (name === '@supabase/supabase-js') return { createClient: window.createClient };

      const normalized = name
        .replace(/^\\.\\//g, '')
        .replace(/^\\.\\.\\//g, '')
        .replace(/\\.(tsx?|jsx?)$/g, '')
        .replace(/^@\\//g, '');

      if (__cache__[normalized]) return __cache__[normalized];

      const source = __modules__[normalized] ||
        __modules__['components/' + normalized] ||
        __modules__['lib/' + normalized] ||
        __modules__['hooks/' + normalized] ||
        __modules__['app/' + normalized];

      if (!source) {
        console.warn('[ESM Preview] Module not found locally:', name, '→', normalized);
        return {};
      }

      __cache__[normalized] = {};
      try {
        const transpiled = Babel.transform(source, {
          presets: ['react', 'typescript'],
          filename: normalized + '.tsx',
        }).code;
        const fn = new Function('exports', 'require', 'React', 'ReactDOM', transpiled);
        const exports = {};
        fn(exports, __require__, React, ReactDOM);
        __cache__[normalized] = exports;
      } catch(e) {
        console.error('[ESM Preview] Transpile error in', normalized, e);
      }
      return __cache__[normalized];
    }
  </script>
  <script type="text/babel" data-presets="react,typescript">
    try {
      const entry = __require__('${entryModule}');
      const App = entry.default || entry.App || entry.Page || entry.Home ||
        Object.values(entry).find(v => typeof v === 'function') ||
        (() => React.createElement('div', {style:{padding:'40px',textAlign:'center'}},
          React.createElement('h1', {style:{background:'linear-gradient(135deg,#818cf8,#34d399)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',fontSize:'32px',marginBottom:'12px'}}, '${projectName}'),
          React.createElement('p', {style:{color:'#8b949e'}}, 'ESM Preview — ${Object.keys(moduleRegistry).length} modules, ${deps.length} CDN dependencies'),
        ));
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(React.createElement(App));
      console.log('[ESM Preview] ✅ App mounted — ${deps.length} CDN packages available');
    } catch(e) {
      console.error('[ESM Preview] Boot error:', e);
      document.getElementById('root').innerHTML =
        '<div style="padding:40px;text-align:center;color:#f87171">' +
        '<h2>Preview Error</h2><pre style="margin-top:12px;text-align:left;background:rgba(255,255,255,0.05);padding:16px;border-radius:8px;overflow:auto">' +
        e.stack + '</pre></div>';
    }
  </script>
</body>
</html>`;
}

/**
 * Generate static HTML preview for non-React projects.
 */
function generateStaticPreviewHtml(files: ProjectFile[], projectName: string): string {
  const cssContent = files
    .filter((f) => isCssFile(f.path))
    .map((f) => `/* ${f.path} */\n${f.content}`)
    .join("\n\n");
  const jsContent = files
    .filter((f) => isCodeFile(f.path) && !isConfigFile(f.path))
    .map((f) => `// ${f.path}\n${f.content.replace(/<\/script>/g, "<\\/script>")}`)
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName} — Static Preview</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', system-ui, sans-serif; background: #0d1117; color: #e6edf3; min-height: 100vh; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="app">
    <div style="max-width:720px;margin:0 auto;padding:40px">
      <h1 style="font-size:28px;margin-bottom:12px;background:linear-gradient(135deg,#818cf8,#34d399);-webkit-background-clip:text;-webkit-text-fill-color:transparent">${projectName}</h1>
      <p style="color:#8b949e;margin-bottom:24px">Static preview — ${files.filter((f) => !isConfigFile(f.path)).length} source files loaded</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">
        ${files
          .filter((f) => !isConfigFile(f.path))
          .map(
            (f) =>
              `<div style="background:rgba(255,255,255,0.05);border-radius:8px;padding:14px;border:1px solid rgba(255,255,255,0.06)"><code style="font-size:12px;color:#818cf8">📄 ${f.path}</code><div style="font-size:11px;color:#8b949e;margin-top:4px">${f.linesOfCode} lines</div></div>`,
          )
          .join("\n        ")}
      </div>
    </div>
  </div>
  <script>
    try { ${jsContent} } catch(e) { console.error('Preview script error:', e); }
  </script>
</body>
</html>`;
}

/**
 * Start an ESM CDN preview session.
 * Generates the preview HTML server-side and returns it for the UI to display in a blob URL iframe.
 */
export async function startEsmPreview(projectId: string): Promise<PreviewSession> {
  const project = findProject(projectId);
  if (!project) {throw new Error(`Project not found: ${projectId}`);}

  // Stop any existing session for this project+engine
  for (const s of sessions.values()) {
    if (s.projectId === projectId && s.engine === "esm" && s.status === "running") {
      s.status = "stopped";
      s.stoppedAt = ts();
    }
  }

  const session = createSession(projectId, project.name, "esm");
  totalStarted++;

  session.status = "preparing";
  log(session, `📦 Preparing ESM CDN preview for "${project.name}"`);

  try {
    // Extract dependencies from source files
    const deps = extractDependencies(project.files);
    session.resolvedDeps = buildEsmImportMap(deps);
    log(session, `📡 Resolved ${deps.length} npm packages via esm.sh CDN`);

    // Generate preview HTML
    const html = hasReactFiles(project.files)
      ? generateEsmPreviewHtml(project.files, project.name, deps)
      : generateStaticPreviewHtml(project.files, project.name);

    session.generatedHtml = html;
    session.status = "running";
    session.url = `blob://esm-preview-${session.id}`;
    log(session, `✅ ESM preview ready — ${project.files.length} files, ${deps.length} CDN deps`);
  } catch (err) {
    session.status = "error";
    session.error = String(err);
    log(session, `❌ ESM preview error: ${String(err)}`);
  }

  return session;
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY 2: Local Dev Server
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a minimal package.json for a project.
 */
function generatePackageJson(project: DevProject, deps: string[]): string {
  const pkgDeps: Record<string, string> = {};
  for (const dep of deps) {
    pkgDeps[dep] = "latest";
  }
  // Ensure React ecosystem is present
  pkgDeps["react"] = "^18.0.0";
  pkgDeps["react-dom"] = "^18.0.0";

  const devDeps: Record<string, string> = {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
  };

  return JSON.stringify(
    {
      name: project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vite --host --port 0",
        build: "vite build",
        preview: "vite preview",
      },
      dependencies: pkgDeps,
      devDependencies: devDeps,
    },
    null,
    2,
  );
}

/**
 * Generate a vite.config.ts for the project.
 */
function generateViteConfig(): string {
  return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 0, // auto-assign port
  },
});
`;
}

/**
 * Generate index.html for Vite-based project.
 */
function generateViteIndexHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>`;
}

/**
 * Generate a main.tsx entry point if one doesn't exist.
 */
function generateMainTsx(): string {
  return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><App /></React.StrictMode>);
`;
}

/**
 * Start a local dev server using workspace-manager.
 * Writes files to disk, runs npm install, starts vite dev server.
 */
export async function startLocalPreview(projectId: string): Promise<PreviewSession> {
  const project = findProject(projectId);
  if (!project) {throw new Error(`Project not found: ${projectId}`);}

  // Stop existing sessions
  for (const s of sessions.values()) {
    if (s.projectId === projectId && s.engine === "local" && s.status === "running") {
      s.status = "stopped";
      s.stoppedAt = ts();
    }
  }

  const session = createSession(projectId, project.name, "local");
  totalStarted++;

  session.status = "preparing";
  log(session, `📁 Setting up local workspace for "${project.name}"`);

  try {
    // Ensure workspace exists
    let ws = getWorkspace(projectId);
    if (!ws) {
      ws = await createWorkspace({
        name: project.name,
        description: `Local dev server workspace for ${project.name}`,
        initGit: false,
      });
    }
    session.workspaceDir = ws.rootDir;

    // Extract dependencies
    const deps = extractDependencies(project.files);
    session.resolvedDeps = Object.fromEntries(deps.map((d) => [d, "latest"]));

    // Write project files to workspace
    log(session, `📝 Writing ${project.files.length} source files...`);
    for (const file of project.files) {
      await writeWorkspaceFile({
        projectId: ws.id,
        relativePath: file.path,
        content: file.content,
        language: file.language,
        citizenId: "preview-engine",
      });
    }

    // Write package.json
    await writeWorkspaceFile({
      projectId: ws.id,
      relativePath: "package.json",
      content: generatePackageJson(project, deps),
      language: "json",
      citizenId: "preview-engine",
    });

    // Write vite config
    await writeWorkspaceFile({
      projectId: ws.id,
      relativePath: "vite.config.ts",
      content: generateViteConfig(),
      language: "typescript",
      citizenId: "preview-engine",
    });

    // Write index.html
    await writeWorkspaceFile({
      projectId: ws.id,
      relativePath: "index.html",
      content: generateViteIndexHtml(project.name),
      language: "html",
      citizenId: "preview-engine",
    });

    // Write main.tsx if no entry exists
    const hasMain = project.files.some((f) =>
      /^src\/(main|index)\.(tsx?|jsx?)$/.test(f.path),
    );
    if (!hasMain) {
      await writeWorkspaceFile({
        projectId: ws.id,
        relativePath: "src/main.tsx",
        content: generateMainTsx(),
        language: "typescript",
        citizenId: "preview-engine",
      });
    }

    // npm install
    session.status = "installing";
    log(session, `📦 Installing ${deps.length + 2} dependencies...`);

    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const installResult: ShellResult = await execInWorkspace(
      ws.id,
      npmCmd,
      ["install", "--legacy-peer-deps"],
      { timeout: 120_000 },
    );

    if (installResult.exitCode !== 0) {
      log(session, `⚠️ npm install warnings: ${installResult.stderr.slice(0, 500)}`);
    } else {
      log(session, `✅ Dependencies installed in ${installResult.durationMs}ms`);
    }

    // Start dev server
    session.status = "starting";
    log(session, `🚀 Starting Vite dev server...`);

    const devResult: ShellResult = await execInWorkspace(
      ws.id,
      npmCmd,
      ["run", "dev"],
      { timeout: 30_000 },
    );

    // Parse port from Vite output
    const portMatch = devResult.stdout.match(/localhost:(\d+)/);
    const port = portMatch ? parseInt(portMatch[1], 10) : 5173;

    session.port = port;
    session.url = `http://localhost:${port}`;
    session.status = "running";
    session.exitCode = devResult.exitCode;

    log(session, `✅ Dev server running at http://localhost:${port}`);
    if (devResult.stdout) {
      log(session, devResult.stdout.slice(0, 1000));
    }
  } catch (err) {
    session.status = "error";
    session.error = String(err);
    log(session, `❌ Local preview error: ${String(err)}`);
  }

  return session;
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY 3: WebContainer Preview
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a WebContainer file-system tree from project files.
 * This is the format required by @webcontainer/api mount().
 */
function buildWebContainerTree(
  project: DevProject,
  deps: string[],
): Record<string, unknown> {
  const tree: Record<string, unknown> = {};

  // Add project files
  for (const file of project.files) {
    const parts = file.path.split("/");
    let current = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!current[dir]) {
        current[dir] = { directory: {} };
      }
      current = (current[dir] as Record<string, unknown>).directory as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = {
      file: { contents: file.content },
    };
  }

  // Add package.json at root
  tree["package.json"] = {
    file: { contents: generatePackageJson(project, deps) },
  };

  // Add vite.config.ts
  tree["vite.config.ts"] = {
    file: { contents: generateViteConfig() },
  };

  // Add index.html
  tree["index.html"] = {
    file: { contents: generateViteIndexHtml(project.name) },
  };

  // Add main.tsx if missing
  const hasMain = project.files.some((f) =>
    /^src\/(main|index)\.(tsx?|jsx?)$/.test(f.path),
  );
  if (!hasMain) {
    if (!tree["src"]) {tree["src"] = { directory: {} };}
    const srcDir = (tree["src"] as Record<string, unknown>).directory as Record<string, unknown>;
    srcDir["main.tsx"] = {
      file: { contents: generateMainTsx() },
    };
  }

  return tree;
}

/**
 * Start a WebContainer preview session.
 * The actual WebContainer API runs in the browser — this method prepares the
 * file-system tree and boot instructions that the UI will use to initialize
 * the WebContainer runtime.
 */
export async function startWebContainerPreview(
  projectId: string,
): Promise<PreviewSession> {
  const project = findProject(projectId);
  if (!project) {throw new Error(`Project not found: ${projectId}`);}

  // Stop existing sessions
  for (const s of sessions.values()) {
    if (s.projectId === projectId && s.engine === "webcontainer" && s.status === "running") {
      s.status = "stopped";
      s.stoppedAt = ts();
    }
  }

  const session = createSession(projectId, project.name, "webcontainer");
  totalStarted++;

  session.status = "preparing";
  log(session, `🐳 Preparing WebContainer for "${project.name}"`);

  try {
    const deps = extractDependencies(project.files);
    session.resolvedDeps = Object.fromEntries(deps.map((d) => [d, "latest"]));

    // Build file-system tree for WebContainer mount
    const fsTree = buildWebContainerTree(project, deps);

    // Serialize the tree as the "generatedHtml" field for transport to UI
    // The UI will parse this and use WebContainer.mount(tree)
    session.generatedHtml = JSON.stringify({
      type: "webcontainer-boot",
      projectName: project.name,
      fileTree: fsTree,
      installCommand: "npm install --legacy-peer-deps",
      startCommand: "npm run dev",
      totalFiles: project.files.length,
      totalDeps: deps.length,
    });

    session.status = "running";
    session.url = "webcontainer://pending";
    log(session, `✅ WebContainer prepared — ${project.files.length} files, ${deps.length} deps`);
    log(session, `📡 Awaiting browser-side boot...`);
  } catch (err) {
    session.status = "error";
    session.error = String(err);
    log(session, `❌ WebContainer preparation error: ${String(err)}`);
  }

  return session;
}

// ═══════════════════════════════════════════════════════════════
// Session Lifecycle
// ═══════════════════════════════════════════════════════════════

/**
 * Stop a preview session.
 */
export function stopPreview(sessionId: string): PreviewSession | null {
  const session = sessions.get(sessionId);
  if (!session) {return null;}

  session.status = "stopped";
  session.stoppedAt = ts();
  session.url = null;
  log(session, `🛑 Preview session stopped`);

  return session;
}

/**
 * Get sessions for a specific project.
 */
export function getProjectSessions(projectId: string): PreviewSession[] {
  return [...sessions.values()].filter((s) => s.projectId === projectId);
}

/**
 * Get preview engine diagnostics.
 */
export async function getPreviewDiagnostics(): Promise<PreviewDiagnostics> {
  // Check Node.js availability for local strategy
  if (cachedNodeVersion === null) {
    try {
      const { execFile: execFileCb } = await import("node:child_process");
      const { promisify: promisifyCb } = await import("node:util");
      const execAsync = promisifyCb(execFileCb);
      const result = await execAsync("node", ["--version"]);
      cachedNodeVersion = result.stdout.toString().trim();
    } catch {
      cachedNodeVersion = "";
    }
  }

  const all = [...sessions.values()];
  const active = all.filter(
    (s) => s.status === "running" || s.status === "starting" || s.status === "installing",
  );

  return {
    activeSessions: active.length,
    totalStarted,
    engines: {
      esm: {
        available: true, // Always available — runs in-browser
        sessionsActive: active.filter((s) => s.engine === "esm").length,
      },
      local: {
        available: !!cachedNodeVersion,
        nodeVersion: cachedNodeVersion || null,
        sessionsActive: active.filter((s) => s.engine === "local").length,
      },
      webcontainer: {
        available: true, // Availability determined client-side via cross-origin isolation check
        sessionsActive: active.filter((s) => s.engine === "webcontainer").length,
      },
    },
    timestamp: ts(),
  };
}

/**
 * Start a preview using the specified engine.
 */
export async function startPreview(
  projectId: string,
  engine: PreviewEngine,
): Promise<PreviewSession> {
  switch (engine) {
    case "esm":
      return startEsmPreview(projectId);
    case "local":
      return startLocalPreview(projectId);
    case "webcontainer":
      return startWebContainerPreview(projectId);
    default:
      throw new Error(`Unknown preview engine: ${String(engine)}`);
  }
}
