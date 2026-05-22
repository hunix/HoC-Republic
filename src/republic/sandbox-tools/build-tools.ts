/**
 * Build Tools — Project scaffolding, testing, deployment, git, search, screenshots
 * Handles: scaffold_project, run_tests, screenshot, deploy, git_repo, generate_asset,
 *          lighthouse_audit, search_packages, pwa_setup, preview_app, template_seed
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createBuildToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    scaffold_project: async (input: ToolInput) => {
      const stack = (input.stack as string) || "react-supabase";
      const projectName = (input.project_name as string) || "my-app";
      const features = (input.features as string) || "auth";
      const projectDir = `/workspace/${projectName}`;
      const featureList = features.split(",").map(f => f.trim());
      const wantsAuth = featureList.includes("auth");
      const wantsSupabase = stack.includes("supabase");
      const wantsPwa = stack.includes("pwa");

      if (stack.startsWith("react") || stack.startsWith("nextjs")) {
        const framework = stack.startsWith("nextjs") ? "next" : "vite";
        if (framework === "vite") {
          await sandboxExec(`npx -y create-vite@latest ${projectName} --template react-ts`, "/workspace", 120);
          await sandboxExec("npm install", projectDir, 180);
          await sandboxExec("npm install -D tailwindcss @tailwindcss/vite", projectDir, 60);
        } else {
          await sandboxExec(`npx -y create-next-app@latest ${projectName} --ts --tailwind --eslint --app --src-dir --import-alias '@/*' --use-npm`, "/workspace", 120);
          // Override default port 3000 → 8080 (the only mapped sandbox port)
          await sandboxExec(`echo 'PORT=8080' >> ${projectDir}/.env.local`, "/workspace", 3);
        }
        if (wantsSupabase) {
          await sandboxExec("npm install @supabase/supabase-js @supabase/auth-helpers-react", projectDir, 60);
          await sandboxExec("mkdir -p src/lib", projectDir, 5);
          await sandboxWriteFile(`${projectDir}/src/lib/supabase.ts`,
            `import { createClient } from '@supabase/supabase-js';\n\nconst supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';\nconst supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';\n\nexport const supabase = createClient(supabaseUrl, supabaseAnonKey);\n`);
        }
        if (!stack.startsWith("nextjs")) { await sandboxExec("npm install react-router-dom", projectDir, 30); }
        if (wantsPwa) { await sandboxWriteFile(`${projectDir}/PWA_SETUP.md`, `# PWA Setup\n\nRun the \`pwa_setup\` tool to add PWA features.`); }
        if (wantsAuth && wantsSupabase) {
          await sandboxExec("mkdir -p src/hooks", projectDir, 5);
          await sandboxWriteFile(`${projectDir}/src/hooks/useAuth.ts`,
            `import { useEffect, useState } from 'react';\nimport { supabase } from '../lib/supabase';\nimport type { User } from '@supabase/supabase-js';\n\nexport function useAuth() {\n  const [user, setUser] = useState<User | null>(null);\n  const [loading, setLoading] = useState(true);\n  useEffect(() => {\n    supabase.auth.getSession().then(({ data: { session } }) => { setUser(session?.user ?? null); setLoading(false); });\n    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); });\n    return () => subscription.unsubscribe();\n  }, []);\n  return { user, loading };\n}\n`);
        }
        if (wantsSupabase) { await sandboxWriteFile(`${projectDir}/.env.local`, `VITE_SUPABASE_URL=http://localhost:54321\nVITE_SUPABASE_ANON_KEY=your-anon-key-here\n`); }
        if (framework === "vite") {
          await sandboxWriteFile(`${projectDir}/vite.config.ts`,
            `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n  server: { host: '0.0.0.0', port: 8080 },\n  resolve: { alias: { '@': '/src' } },\n});\n`);
        }
        return `✅ Scaffolded **${stack}** project: ${projectDir}\n\nStack: ${framework === "vite" ? "Vite" : "Next.js"} + React + TypeScript + Tailwind CSS${wantsSupabase ? " + Supabase" : ""}${wantsPwa ? " + PWA" : ""}${wantsAuth ? " + Auth" : ""}\n\nNext: cd ${projectDir} && npm run dev`;
      }
      if (stack === "express-api") {
        await sandboxExec(`mkdir -p ${projectDir}/src`, "/workspace", 5);
        await sandboxWriteFile(`${projectDir}/package.json`, JSON.stringify({ name: projectName, version: "1.0.0", type: "module", scripts: { dev: "tsx watch src/index.ts", build: "tsc", start: "node dist/index.js" }, dependencies: { express: "^4.21.0", cors: "^2.8.5", dotenv: "^16.4.0" }, devDependencies: { typescript: "^5.7.0", tsx: "^4.19.0", "@types/express": "^5.0.0", "@types/cors": "^2.8.17" } }, null, 2));
        await sandboxWriteFile(`${projectDir}/src/index.ts`, `import express from 'express';\nimport cors from 'cors';\nimport 'dotenv/config';\n\nconst app = express();\napp.use(cors());\napp.use(express.json());\n\napp.get('/api/health', (_req, res) => { res.json({ ok: true, timestamp: new Date().toISOString() }); });\n\nconst port = process.env.PORT || 8080;\napp.listen(port, () => console.log(\`API running on port \${port}\`));\n`);
        await sandboxExec("npm install", projectDir, 120);
        return `✅ Scaffolded **express-api** project: ${projectDir}\n\nRun: cd ${projectDir} && npm run dev`;
      }
      if (stack === "static-site") {
        await sandboxExec(`mkdir -p ${projectDir}`, "/workspace", 5);
        await sandboxWriteFile(`${projectDir}/index.html`, `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${projectName}</title>\n<script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-900 text-white min-h-screen flex items-center justify-center"><div class="text-center"><h1 class="text-5xl font-bold mb-4">${projectName}</h1></div></body></html>`);
        return `✅ Scaffolded **static-site**: ${projectDir}/index.html`;
      }
      return `Unknown stack: ${stack}. Use: react-supabase, nextjs-supabase, express-api, static-site`;
    },

    run_tests: async (input: ToolInput) => {
      const fw = input.framework as string;
      const testPath = (input.path as string) || "";
      const cov = input.coverage ? "--coverage" : "";
      const dir = "/workspace";
      let cmd: string;
      if (fw) {
        switch (fw) {
          case "vitest": cmd = `npx vitest run ${testPath} ${cov} --reporter=json 2>&1`; break;
          case "jest": cmd = `npx jest ${testPath} ${cov} --json --no-colors 2>&1`; break;
          case "pytest": cmd = `python3 -m pytest ${testPath} ${cov ? "--cov" : ""} -v --tb=short 2>&1`; break;
          case "mocha": cmd = `npx mocha ${testPath} --reporter json 2>&1`; break;
          default: cmd = `npx vitest run ${testPath} ${cov} 2>&1`; break;
        }
      } else {
        const detect = await sandboxExec(`cd ${dir} && (grep -q vitest package.json 2>/dev/null && echo vitest) || (grep -q jest package.json 2>/dev/null && echo jest) || ([ -f pytest.ini ] || [ -f setup.py ] && echo pytest) || echo vitest`, dir, 5);
        const detected = detect.stdout.trim() || "vitest";
        switch (detected) {
          case "vitest": cmd = `npx vitest run ${testPath} ${cov} 2>&1`; break;
          case "jest": cmd = `npx jest ${testPath} ${cov} --no-colors 2>&1`; break;
          case "pytest": cmd = `python3 -m pytest ${testPath} -v --tb=short 2>&1`; break;
          default: cmd = `npx vitest run ${testPath} ${cov} 2>&1`; break;
        }
      }
      const result = await sandboxExec(`cd ${dir} && ${cmd}`, dir, 120);
      return `🧪 Test Results:\n\n${result.stdout.slice(0, 5000)}${result.stderr ? `\n\nErrors:\n${result.stderr.slice(0, 2000)}` : ""}`;
    },

    screenshot: async (input: ToolInput) => {
      const targetUrl = (input.url as string) || "http://localhost:8080";
      const outFile = `/workspace/${(input.filename as string) || "screenshot.png"}`;
      const vpWidth = (input.width as number) || 1280;
      const vpHeight = (input.height as number) || 720;
      const fullPage = input.full_page ? "true" : "false";
      const script = `\nconst { chromium } = require('playwright');\n(async () => {\n  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });\n  const page = await browser.newPage({ viewport: { width: ${vpWidth}, height: ${vpHeight} } });\n  await page.goto('${targetUrl}', { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});\n  await page.waitForTimeout(2000);\n  await page.screenshot({ path: '${outFile}', fullPage: ${fullPage} });\n  await browser.close();\n  console.log('Screenshot saved to ${outFile}');\n})();`;
      await sandboxExec(`cat > /tmp/_screenshot.cjs << 'SSEOF'\n${script}\nSSEOF`, "/workspace", 5);
      const result = await sandboxExec(`node /tmp/_screenshot.cjs 2>&1`, "/workspace", 30);
      return result.exitCode !== 0
        ? `Screenshot failed: ${result.stderr || result.stdout}`
        : `📸 Screenshot saved: ${outFile}\nURL: ${targetUrl}\nViewport: ${vpWidth}x${vpHeight}${input.full_page ? " (full page)" : ""}`;
    },

    deploy: async (input: ToolInput) => {
      const plat = (input.platform as string) || "tunnel";
      const dir = (input.directory as string) || "dist";
      const projName = (input.project_name as string) || `project-${Date.now()}`;
      await sandboxExec(`[ -d /workspace/${dir} ] || (cd /workspace && npm run build 2>&1)`, "/workspace", 120);

      switch (plat) {
        case "vercel": {
          const result = await sandboxExec(`cd /workspace && npx -y vercel deploy ./${dir} --yes --prod 2>&1`, "/workspace", 120);
          const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.vercel\.app/);
          return urlMatch ? `🚀 Deployed to Vercel: ${urlMatch[0]}` : `Vercel deploy output:\n${result.stdout.slice(0, 3000)}`;
        }
        case "cloudflare": {
          const result = await sandboxExec(`cd /workspace && npx -y wrangler pages deploy ./${dir} --project-name ${projName} 2>&1`, "/workspace", 120);
          const urlMatch = result.stdout.match(/https:\/\/[^\s]+\.pages\.dev/);
          return urlMatch ? `🚀 Deployed to Cloudflare: ${urlMatch[0]}` : `Cloudflare deploy output:\n${result.stdout.slice(0, 3000)}`;
        }
        default: {
          await sandboxExec(`(lsof -i :8080 | grep -q LISTEN) || (cd /workspace && npx -y serve ./${dir} -l 8080 &) && sleep 2`, "/workspace", 15);
          const result = await sandboxExec(`npx -y cloudflared-bin tunnel --url http://localhost:8080 2>&1 &\nsleep 5\ncurl -s http://localhost:8080 > /dev/null && echo 'Server OK' || echo 'Server not ready'`, "/workspace", 30);
          const logResult = await sandboxExec(`cat /tmp/_tunnel.log 2>/dev/null || echo ''`, "/workspace", 5);
          const tunnelUrl = (logResult.stdout + result.stdout).match(/https:\/\/[^\s]+\.trycloudflare\.com/);
          return tunnelUrl ? `🚀 Deployed via tunnel: ${tunnelUrl[0]}` : `🖥️ Preview running at http://localhost:8080`;
        }
      }
    },

    git_repo: async (input: ToolInput) => {
      const gitAction = (input.action as string) || "init";
      const repoName = input.repo_name as string;
      const commitMsg = (input.commit_message as string) || "Initial commit";
      const isPrivate = input.private ? "--private" : "--public";
      switch (gitAction) {
        case "init": {
          const gitignore = `node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n.DS_Store\ncoverage/\n.next/`;
          await sandboxExec(`cd /workspace && cat > .gitignore << 'GIEOF'\n${gitignore}\nGIEOF`, "/workspace", 5);
          const result = await sandboxExec(`cd /workspace && git init && git add -A && git commit -m "${commitMsg}" 2>&1`, "/workspace", 15);
          return `📦 Git repo initialized.\n${result.stdout.slice(0, 1000)}`;
        }
        case "commit": {
          const result = await sandboxExec(`cd /workspace && git add -A && git commit -m "${commitMsg}" 2>&1`, "/workspace", 15);
          return `✅ Committed: ${commitMsg}\n${result.stdout.slice(0, 1000)}`;
        }
        case "push": {
          if (!repoName) { return "Error: repo_name is required for push"; }
          await sandboxExec(`cd /workspace && (git rev-parse --is-inside-work-tree 2>/dev/null || (git init && git add -A && git commit -m "${commitMsg}"))`, "/workspace", 15);
          const result = await sandboxExec(`cd /workspace && gh repo create ${repoName} ${isPrivate} --source . --push 2>&1`, "/workspace", 30);
          const urlMatch = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
          return urlMatch ? `🐙 GitHub repo created: ${urlMatch[0]}` : `GitHub push output:\n${result.stdout.slice(0, 2000)}`;
        }
        default:
          return `Unknown git action: ${gitAction}. Valid: init, push, commit`;
      }
    },

    generate_asset: async (input: ToolInput) => {
      const assetPrompt = input.prompt as string;
      if (!assetPrompt) { return "Error: prompt is required"; }
      const assetFile = (input.filename as string) || "generated-asset.png";
      const assetStyle = (input.style as string) || "illustration";
      const assetW = (input.width as number) || 512;
      const assetH = (input.height as number) || 512;
      await sandboxExec(`mkdir -p /workspace/public`, "/workspace", 5);
      if (assetStyle === "icon" || assetStyle === "logo") {
        const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const initials = assetPrompt.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() || "").join("");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${assetW}" height="${assetH}" viewBox="0 0 ${assetW} ${assetH}">\n  <defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${color}"/><stop offset="100%" stop-color="${color}88"/></linearGradient></defs>\n  <rect width="${assetW}" height="${assetH}" rx="${Math.min(assetW, assetH) * 0.2}" fill="url(#g)"/>\n  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Inter,system-ui,sans-serif" font-weight="700" font-size="${Math.min(assetW, assetH) * 0.35}" fill="white">${initials}</text>\n</svg>`;
        await sandboxExec(`cat > '/workspace/public/${assetFile.replace(".png", ".svg")}' << 'SVGEOF'\n${svg}\nSVGEOF`, "/workspace", 5);
        const converted = await sandboxExec(`which convert && convert '/workspace/public/${assetFile.replace(".png", ".svg")}' '/workspace/public/${assetFile}' 2>&1 || echo "SVG only"`, "/workspace", 10);
        return `🎨 Asset generated: /workspace/public/${assetFile.replace(".png", ".svg")}\nStyle: ${assetStyle} | Size: ${assetW}x${assetH}${converted.stdout.includes("SVG only") ? "" : `\nAlso saved as PNG: /workspace/public/${assetFile}`}`;
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${assetW}" height="${assetH}">\n  <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#312e81"/></linearGradient></defs>\n  <rect width="100%" height="100%" fill="url(#bg)"/>\n  <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="24" fill="#a5b4fc">${assetStyle.toUpperCase()}</text>\n  <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="14" fill="#818cf8">${assetPrompt.slice(0, 40)}</text>\n</svg>`;
      await sandboxExec(`cat > '/workspace/public/${assetFile.replace(".png", ".svg")}' << 'SVGEOF'\n${svg}\nSVGEOF`, "/workspace", 5);
      return `🎨 Placeholder asset generated: /workspace/public/${assetFile.replace(".png", ".svg")}\nStyle: ${assetStyle} | Size: ${assetW}x${assetH}`;
    },

    lighthouse_audit: async (input: ToolInput) => {
      const auditUrl = (input.url as string) || "http://localhost:8080";
      const cats = (input.categories as string) || "performance,accessibility,best-practices,seo";
      await sandboxExec(`which lighthouse || npm install -g lighthouse 2>&1`, "/workspace", 30);
      const result = await sandboxExec(`lighthouse '${auditUrl}' --output json --chrome-flags="--headless --no-sandbox --disable-gpu" --only-categories=${cats} --quiet 2>&1 | tail -c 50000`, "/workspace", 120);
      try {
        const report = JSON.parse(result.stdout);
        const scores = Object.entries(report.categories || {}).map(([key, cat]: [string, unknown]) => `${key}: ${Math.round(((cat as { score: number }).score || 0) * 100)}/100`).join("\n");
        const opportunities = (report.audits || {}) as Record<string, { score: number; title: string }>;
        const fails = Object.values(opportunities).filter(a => a.score !== undefined && a.score < 0.9).slice(0, 10).map(a => `⚠️ ${a.title}`).join("\n");
        return `🔍 Lighthouse Audit: ${auditUrl}\n\n📊 Scores:\n${scores}\n\n${fails ? `\n⚠️ Recommendations:\n${fails}` : "✅ All audits passing!"}`;
      } catch {
        return `Lighthouse output:\n${result.stdout.slice(0, 3000)}`;
      }
    },

    search_packages: async (input: ToolInput) => {
      const searchQuery = input.query as string;
      if (!searchQuery) { return "Error: search query is required"; }
      const reg = (input.registry as string) || "npm";
      const maxResults = (input.limit as number) || 5;
      if (reg === "npm") {
        const result = await sandboxExec(`npm search '${searchQuery}' --json 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));d.slice(0,${maxResults}).forEach(p=>console.log(p.name+'@'+p.version+' - '+(p.description||'no description')));" 2>&1 || curl -s 'https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchQuery)}&size=${maxResults}' | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));(d.objects||[]).forEach(o=>console.log(o.package.name+'@'+o.package.version+' - '+(o.package.description||'')));" 2>&1`, "/workspace", 20);
        return `📦 npm search: "${searchQuery}"\n\n${result.stdout || "No results found"}`;
      } else if (reg === "pypi") {
        const result = await sandboxExec(`curl -s 'https://pypi.org/pypi/${encodeURIComponent(searchQuery)}/json' | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));if(d.info) console.log(d.info.name+'=='+d.info.version+' - '+(d.info.summary||''));else console.log('Not found');" 2>&1`, "/workspace", 15);
        return `🐍 PyPI search: "${searchQuery}"\n\n${result.stdout || "Package not found"}`;
      }
      return `Unknown registry: ${reg}. Valid: npm, pypi`;
    },

    send_email: async (input: ToolInput) => {
      const emailSubject = input.subject as string;
      const emailBody = input.body as string;
      if (!emailSubject || !emailBody) { return "Error: subject and body are required"; }
      const emailTo = (input.to as string) || "user";
      const notif = JSON.stringify({ subject: emailSubject, body: emailBody, to: emailTo, ts: Date.now() });
      await sandboxExec(`echo '${notif.replace(/'/g, "'\\''")}' >> /workspace/.notifications.jsonl`, "/workspace", 5);
      return `📧 Notification saved: "${emailSubject}"\nTo: ${emailTo}\nBody preview: ${emailBody.slice(0, 200)}`;
    },

    database_query: async (input: ToolInput) => {
      const sqlQuery = input.sql as string;
      if (!sqlQuery) { return "Error: sql query is required"; }
      const fmt = (input.format as string) || "table";
      const psqlFormat = fmt === "json" ? "-t -A" : (fmt === "csv" ? "--csv" : "");
      const result = await sandboxExec(`psql "$SUPABASE_DB_URL" ${psqlFormat} -c '${sqlQuery.replace(/'/g, "'\\''")}' 2>&1`, "/workspace", 30);
      return result.exitCode !== 0 ? `SQL Error:\n${result.stderr || result.stdout}` : `📊 Query Results:\n\n${result.stdout.slice(0, 5000)}`;
    },

    api_test: async (input: ToolInput) => {
      const baseUrl = (input.base_url as string) || "http://localhost:8080";
      const endpointsStr = input.endpoints as string;
      if (!endpointsStr) { return "Error: endpoints JSON array is required"; }
      let endpoints: Array<{ method?: string; path: string; expected_status?: number; body?: string }>;
      try { endpoints = JSON.parse(endpointsStr); } catch { return "Error: endpoints must be a valid JSON array"; }
      const results: string[] = [];
      for (const ep of endpoints) {
        const method = (ep.method || "GET").toUpperCase();
        const fullUrl = `${baseUrl}${ep.path}`;
        const expectedStatus = ep.expected_status || 200;
        const bodyFlag = ep.body ? `-d '${ep.body}' -H 'Content-Type: application/json'` : "";
        const result = await sandboxExec(`curl -s -o /tmp/_api_resp -w "%{http_code}" -X ${method} ${bodyFlag} '${fullUrl}' 2>&1`, "/workspace", 15);
        const statusCode = parseInt(result.stdout.trim(), 10);
        const respBody = await sandboxExec(`cat /tmp/_api_resp | head -c 500`, "/workspace", 5);
        const pass = statusCode === expectedStatus ? "✅" : "❌";
        results.push(`${pass} ${method} ${ep.path} → ${statusCode} (expected ${expectedStatus})\n   ${respBody.stdout.slice(0, 200)}`);
      }
      return `🧪 API Test Results:\n\n${results.join("\n\n")}`;
    },
  };
}

export const buildToolsSummary: ToolSummaryMap = {
  scaffold_project: (input) => `🏗️ Scaffold: ${input.stack ?? "react-supabase"} (${input.project_name ?? "my-app"})`,
  run_tests: (input) => `🧪 Tests: ${input.framework ?? "auto"} ${input.path ?? ""}`,
  screenshot: (input) => `📸 Screenshot: ${input.url ?? "localhost:8080"}`,
  deploy: (input) => `🚀 Deploy: ${input.platform ?? "tunnel"}`,
  git_repo: (input) => `📦 Git: ${input.action ?? "init"}`,
  generate_asset: (input) => `🎨 Asset: ${input.style ?? "illustration"}`,
  lighthouse_audit: (input) => `🔍 Lighthouse: ${input.url ?? "localhost:8080"}`,
  search_packages: (input) => `📦 Search: ${input.query ?? "?"} (${input.registry ?? "npm"})`,
  send_email: (input) => `📧 ${input.subject ?? "notification"}`,
  database_query: () => `📊 SQL Query`,
  api_test: () => `🧪 API Test`,
};
