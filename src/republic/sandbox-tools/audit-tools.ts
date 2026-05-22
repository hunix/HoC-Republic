/**
 * Audit Tools — Performance, accessibility, SEO, visual diff, lint,
 *               storybook, figma, API mock, PWA setup
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createAuditToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    perf_audit: async (input: ToolInput) => {
      const perfUrl = (input.url as string) || "http://localhost:8080";
      const pyCategories = "import json,sys;d=json.load(sys.stdin);[print(f'{k}: {int(v[\"score\"]*100)}/100') for k,v in d.get('categories',{}).items()]";
      const r = await sandboxExec(`lighthouse '${perfUrl}' --output=json --chrome-flags="--headless --no-sandbox" --only-categories=performance,accessibility,best-practices,seo 2>/dev/null | python3 -c '${pyCategories}'`, "/workspace", 60);
      return `⚡ Performance Audit:\n${r.stdout || r.stderr || "Lighthouse failed"}`;
    },

    a11y_audit: async (input: ToolInput) => {
      const url = (input.url as string) || "http://localhost:8080";
      const r = await sandboxExec(`axe '${url}' --stdout 2>/dev/null | head -80`, "/workspace", 30);
      return `♿ Accessibility Audit:\n${r.stdout || r.stderr || "axe-core failed"}`;
    },

    seo_audit: async (input: ToolInput) => {
      const url = (input.url as string) || "http://localhost:8080";
      const script = `const{chromium}=require('playwright');(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const p=await b.newPage();await p.goto('${url}',{waitUntil:'domcontentloaded',timeout:10000}).catch(()=>{});const t=await p.title();const m=await p.$$eval('meta[name="description"]',e=>e.map(x=>x.getAttribute('content')));const h=await p.$$eval('h1',e=>e.length);console.log('Title:',t||'MISSING');console.log('Description:',m[0]||'MISSING');console.log('H1 count:',h);await b.close()})()`;
      const r = await sandboxExec(`node -e "${script.replace(/"/g, '\\"')}" 2>&1`, "/workspace", 20);
      return `🔍 SEO Audit:\n${r.stdout || r.stderr}`;
    },

    visual_diff: async (input: ToolInput) => {
      const a = (input.image_a as string) || "";
      const b = (input.image_b as string) || "";
      const out = (input.output as string) || "/workspace/screenshots/diff.png";
      if (!a || !b) { return "Error: image_a and image_b required"; }
      const r = await sandboxExec(`python3 -c "from PIL import Image;a=Image.open('${a}').convert('RGB');b=Image.open('${b}').convert('RGB');b=b.resize(a.size) if a.size!=b.size else b;d=Image.new('RGB',a.size);t,c=a.size[0]*a.size[1],0\nfor x in range(a.size[0]):\n for y in range(a.size[1]):\n  pa,pb=a.getpixel((x,y)),b.getpixel((x,y));dd=sum(abs(aa-bb) for aa,bb in zip(pa,pb))\n  if dd>30: c+=1;d.putpixel((x,y),(255,0,0))\n  else: d.putpixel((x,y),tuple(cc//3 for cc in pa))\nd.save('${out}');print(f'{(c/t)*100:.1f}% changed')" 2>&1`, "/workspace", 30);
      return `🔍 Visual Diff: ${r.stdout || r.stderr}\nSaved: ${out}`;
    },

    lint_fix: async (input: ToolInput) => {
      const dir = (input.project_dir as string) || "/workspace";
      const fix = input.fix !== false;
      await sandboxExec(`cd '${dir}' && npm list eslint 2>/dev/null || npm install -D eslint prettier 2>/dev/null`, dir, 30);
      const cmd = fix
        ? `cd '${dir}' && npx eslint src/ --fix --ext .ts,.tsx,.js,.jsx 2>&1 | tail -30`
        : `cd '${dir}' && npx eslint src/ --ext .ts,.tsx,.js,.jsx 2>&1 | tail -30`;
      const r = await sandboxExec(cmd, dir, 60);
      return `🧹 Lint ${fix ? "& Fix" : "Check"}:\n${r.stdout || r.stderr || "✅ No issues"}`;
    },

    storybook_generate: async (input: ToolInput) => {
      const dir = (input.project_dir as string) || "/workspace";
      const comp = (input.components_dir as string) || "src/components";
      const r = await sandboxExec(`cd '${dir}' && find ${comp} -name '*.tsx' -not -name '*.stories.*' -not -name '*.test.*' 2>/dev/null`, dir, 5);
      const files = (r.stdout || "").trim().split("\n").filter(Boolean);
      if (!files.length) { return "No components found in " + comp; }
      let generated = 0;
      for (const file of files.slice(0, 20)) {
        const name = file.split("/").pop()?.replace(".tsx", "") || "Comp";
        await sandboxWriteFile(`${dir}/${file.replace(".tsx", ".stories.tsx")}`,
          `import type { Meta, StoryObj } from '@storybook/react';\nimport { ${name} } from './${name}';\nconst meta: Meta<typeof ${name}> = { title: 'Components/${name}', component: ${name}, tags: ['autodocs'] };\nexport default meta;\ntype Story = StoryObj<typeof ${name}>;\nexport const Default: Story = {};\n`);
        generated++;
      }
      return `📖 Storybook: ${generated} stories generated\nRun: npx storybook dev -p 6006`;
    },

    figma_to_react: async (input: ToolInput) => {
      const url = (input.file_url as string) || "";
      if (!url) { return "Error: file_url required"; }
      const token = process.env.FIGMA_ACCESS_TOKEN || "";
      if (!token) { return "Error: FIGMA_ACCESS_TOKEN not set"; }
      const fileId = url.match(/file\/([a-zA-Z0-9]+)/)?.[1] || "";
      if (!fileId) { return "Error: Could not extract file ID"; }
      const pyFigma = "import json,sys;d=json.load(sys.stdin);print('File:',d.get('name','?'));print('Pages:',len(d.get('document',{}).get('children',[])))";
      const r = await sandboxExec(`curl -sH 'X-Figma-Token: ${token}' 'https://api.figma.com/v1/files/${fileId}' | python3 -c '${pyFigma}'`, "/workspace", 15);
      return `🎨 Figma Import:\n${r.stdout || r.stderr}`;
    },

    api_mock: async (input: ToolInput) => {
      const port = (input.port as number) || 3001;
      const endpoints = (input.endpoints as string) || '[{"method":"GET","path":"/api/health","response":{"status":"ok"}}]';
      await sandboxWriteFile("/workspace/mock-server.js", `const e=require('express'),c=require('cors'),a=e();a.use(c());a.use(e.json());${endpoints}.forEach(ep=>{a[ep.method.toLowerCase()](ep.path,(q,r)=>r.json(ep.response));console.log(ep.method+' '+ep.path)});a.listen(${port},()=>console.log('Mock on port ${port}'))`);
      await sandboxExec(`cd /workspace && npm list express 2>/dev/null || npm install express cors 2>/dev/null`, "/workspace", 20);
      await sandboxExec("pkill -f mock-server.js 2>/dev/null || true", "/workspace", 3);
      const r = await sandboxExec(`cd /workspace && node mock-server.js &\nsleep 2\necho "started"`, "/workspace", 10);
      return `🔌 Mock API on port ${port}\n${r.stdout}`;
    },

    pwa_setup: async (input: ToolInput) => {
      const dir = (input.project_dir as string) || "/workspace";
      const name = (input.app_name as string) || "My App";
      const color = (input.theme_color as string) || "#6366f1";
      await sandboxExec(`mkdir -p ${dir}/public`, dir, 3);
      await sandboxWriteFile(`${dir}/public/manifest.json`, JSON.stringify({ name, short_name: name.slice(0, 12), start_url: "/", display: "standalone", background_color: "#0a0a1b", theme_color: color, icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] }, null, 2));
      await sandboxWriteFile(`${dir}/public/sw.js`, `const C='app-v1';self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['/'])))});self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).catch(()=>new Response('Offline',{status:503}))))})`);
      return `📱 PWA Setup!\n- Manifest: public/manifest.json\n- SW: public/sw.js\n\nAdd to index.html:\n\`<link rel="manifest" href="/manifest.json">\`\n\`<script>navigator.serviceWorker?.register('/sw.js')</script>\``;
    },
  };
}

export const auditToolsSummary: ToolSummaryMap = {
  perf_audit: (input) => `⚡ Perf: ${input.url ?? "localhost:8080"}`,
  a11y_audit: (input) => `♿ A11y: ${input.url ?? "localhost:8080"}`,
  seo_audit: (input) => `🔍 SEO: ${input.url ?? "localhost:8080"}`,
  visual_diff: () => `🔍 Visual Diff`,
  lint_fix: () => `🧹 Lint Fix`,
  storybook_generate: () => `📖 Storybook`,
  figma_to_react: () => `🎨 Figma→React`,
  api_mock: (input) => `🔌 Mock: port ${input.port ?? 3001}`,
  pwa_setup: (input) => `📱 PWA: ${input.app_name ?? "My App"}`,
};
