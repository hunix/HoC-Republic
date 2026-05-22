/**
 * Integration Tools — External service bridges, RAG, git+GitHub, templates,
 *                     document generation, MCP protocol
 * Handles: web_app_bridge, rag_knowledge, git_github, template_seed,
 *          document_generate, mcp_connect
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createIntegrationToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;
  const { ensureWarmPoolSweep, touchContainer, key } = ctx;

  return {
    web_app_bridge: async (input: ToolInput) => {
      const wabAction = (input.action as string) || "status";
      const wabService = (input.service as string) || "";
      const wabPrompt = (input.prompt as string) || "";
      const wabWait = Math.min((input.wait_seconds as number) || 60, 300);
      const serviceUrls: Record<string, string> = {
        chatgpt: "https://chatgpt.com",
        gemini: "https://gemini.google.com",
        claude: "https://claude.ai",
        lovable: "https://lovable.dev",
        v0: "https://v0.dev",
        bolt: "https://bolt.new",
        huggingface: "https://huggingface.co",
        colab: "https://colab.research.google.com",
      };
      ensureWarmPoolSweep();
      touchContainer("playwright");
      const cookieDir = `/root/.config/playwright-sessions/${wabService}`;

      switch (wabAction) {
        case "status": {
          const r = await sandboxExec(
            "ls -d /root/.config/playwright-sessions/*/ 2>/dev/null | while read d; do basename \"$d\"; done || echo 'NONE'",
            "/workspace",
            5,
          );
          return r.stdout.includes("NONE")
            ? `🌐 No sessions. Use action="login" service="chatgpt" to start.\nSupported: ${Object.keys(serviceUrls).join(", ")}`
            : `🌐 Sessions:\n${r.stdout
                .split("\n")
                .filter(Boolean)
                .map((s) => `✅ ${s}`)
                .join("\n")}`;
        }
        case "login": {
          if (!wabService || !serviceUrls[wabService]) {
            return `Error: Unknown service. Supported: ${Object.keys(serviceUrls).join(", ")}`;
          }
          await sandboxExec(`mkdir -p '${cookieDir}'`, "/workspace", 3);
          return `🔑 Login: ${wabService}\n\nOpen via noVNC: http://localhost:6081\nURL: ${serviceUrls[wabService]}\nSession persists in: ${cookieDir}`;
        }
        case "chat": {
          if (!wabService || !wabPrompt) {
            return "Error: service and prompt required";
          }
          const inputSels: Record<string, string> = {
            chatgpt: "#prompt-textarea",
            gemini: ".ql-editor, [contenteditable='true']",
            claude: "[contenteditable='true'], .ProseMirror",
          };
          const respSels: Record<string, string> = {
            chatgpt: "[data-message-author-role='assistant'] .markdown",
            gemini: ".response-content",
            claude: ".font-claude-message",
          };
          const iSel = inputSels[wabService] || "textarea, [contenteditable='true']";
          const rSel = respSels[wabService] || ".response, .message";
          const py = `\nimport asyncio\nfrom playwright.async_api import async_playwright\nasync def main():\n    async with async_playwright() as p:\n        ctx = await p.chromium.launch_persistent_context('${cookieDir}', headless=True, args=['--disable-blink-features=AutomationControlled'], viewport={'width': 1280, 'height': 800})\n        page = ctx.pages[0] if ctx.pages else await ctx.new_page()\n        await page.goto('${serviceUrls[wabService] || ""}', wait_until='networkidle', timeout=30000)\n        await asyncio.sleep(3)\n        inp = await page.query_selector('${iSel.replace(/'/g, "\\'")}')\n        if not inp: print('ERROR: Input not found'); await ctx.close(); return\n        await inp.click()\n        await page.keyboard.type("""${wabPrompt.replace(/"/g, '\\"').slice(0, 2000)}""", delay=10)\n        await asyncio.sleep(0.5)\n        await page.keyboard.press('Enter')\n        for i in range(${Math.floor(wabWait / 5)}): await asyncio.sleep(5); s = await page.query_selector('.result-streaming, .is-streaming'); \n         if not s: break\n        resps = await page.query_selector_all('${rSel.replace(/'/g, "\\'")}')\n        if resps: print('RESP:' + await resps[-1].inner_text())\n        else: print('RESP:' + (await page.inner_text('main'))[:4000])\n        await ctx.close()\nasyncio.run(main())\n`;
          await sandboxWriteFile("/tmp/pw_chat.py", py);
          const r = await sandboxExec("python3 /tmp/pw_chat.py 2>&1", "/workspace", wabWait + 30);
          const match = r.stdout.match(/RESP:([\s\S]*)/);
          return match
            ? `🤖 ${wabService}:\n\n${match[1].trim().slice(0, 6000)}`
            : `⚠️ ${r.stdout.includes("ERROR:") ? r.stdout.split("ERROR:")[1]?.trim() || "Session expired" : r.stdout.slice(0, 500)}`;
        }
        default:
          return `Unknown web_app_bridge action: ${wabAction}. Use: login, chat, status`;
      }
    },

    rag_knowledge: async (input: ToolInput) => {
      const ragAction = (input.action as string) || "list";
      const ragPath = (input.path as string) || "";
      const ragQuery = (input.query as string) || "";
      const ragCollection = (input.collection as string) || "default";
      const ragTopK = Math.min((input.top_k as number) || 5, 20);

      // Ensure chromadb is installed
      await sandboxExec(
        "python3 -c 'import chromadb' 2>/dev/null || pip3 install -q chromadb 2>/dev/null",
        "/workspace",
        60,
      );

      switch (ragAction) {
        case "ingest": {
          if (!ragPath) {
            return "Error: path required";
          }
          const script = `\nimport chromadb, os, hashlib\nclient = chromadb.PersistentClient(path="/workspace/.chromadb")\ncol = client.get_or_create_collection("${ragCollection}")\npath = "${ragPath}"\ndocs, ids = [], []\nif os.path.isdir(path):\n    for root, _, files in os.walk(path):\n        for f in files:\n            if f.endswith(('.txt','.md','.py','.ts','.tsx','.js','.json')):\n                fp = os.path.join(root, f)\n                try: docs.append(open(fp).read()[:8000]); ids.append(hashlib.md5(fp.encode()).hexdigest())\n                except: pass\nelse:\n    docs.append(open(path).read()[:8000]); ids.append(hashlib.md5(path.encode()).hexdigest())\nif docs: col.upsert(documents=docs, ids=ids); print(f"✅ Ingested {len(docs)} documents")\nelse: print("⚠️ No documents found")\n`;
          const r = await sandboxExec(`python3 -c ${JSON.stringify(script)}`, "/workspace", 120);
          return r.stdout || r.stderr || "Ingest complete";
        }
        case "query": {
          if (!ragQuery) {
            return "Error: query required";
          }
          const script = `\nimport chromadb, json\nclient = chromadb.PersistentClient(path="/workspace/.chromadb")\ncol = client.get_or_create_collection("${ragCollection}")\nresults = col.query(query_texts=["${ragQuery.replace(/"/g, '\\"')}"], n_results=${ragTopK})\nfor i, doc in enumerate(results['documents'][0]):\n    dist = results['distances'][0][i] if results.get('distances') else 0\n    print(f"--- Result {i+1} (distance: {dist:.3f}) ---")\n    print(doc[:500])\n    print()\n`;
          const r = await sandboxExec(`python3 -c ${JSON.stringify(script)}`, "/workspace", 30);
          return r.stdout || r.stderr || "No results";
        }
        case "list": {
          const r = await sandboxExec(
            `python3 -c "import chromadb; c=chromadb.PersistentClient(path='/workspace/.chromadb'); cols=c.list_collections(); [print(f'{col.name}: {col.count()} docs') for col in cols] if cols else print('No collections')"`,
            "/workspace",
            10,
          );
          return `📚 RAG:\n${r.stdout || "No collections"}`;
        }
        case "clear": {
          await sandboxExec("rm -rf /workspace/.chromadb", "/workspace", 5);
          return "🗑️ All RAG collections cleared.";
        }
        default:
          return `Unknown rag_knowledge action: ${ragAction}. Use: ingest, query, list, clear`;
      }
    },

    git_github: async (input: ToolInput) => {
      const gitAction = (input.action as string) || "status";
      const projDir = (input.project_dir as string) || "/workspace";
      const ghToken = key("GH_TOKEN") || key("GITHUB_TOKEN");
      if (ghToken) {
        await sandboxExec(
          `git config --global credential.helper '!f() { echo "protocol=https"; echo "host=github.com"; echo "username=x-access-token"; echo "password=${ghToken}"; }; f'`,
          projDir,
          5,
        );
      }
      await sandboxExec(
        `git config --global user.email 2>/dev/null || git config --global user.email "hoc-agent@localhost"`,
        projDir,
        3,
      );
      await sandboxExec(
        `git config --global user.name 2>/dev/null || git config --global user.name "HoC Agent"`,
        projDir,
        3,
      );

      switch (gitAction) {
        case "clone": {
          const url = (input.url as string) || "";
          if (!url) {
            return "Error: url required";
          }
          const r = await sandboxExec(`git clone '${url}' 2>&1`, projDir, 120);
          return r.exitCode === 0 ? `✅ Cloned: ${url}` : `❌ ${r.stderr.slice(0, 500)}`;
        }
        case "init": {
          await sandboxExec("git init 2>&1", projDir, 5);
          const url = (input.url as string) || "";
          if (url) {
            await sandboxExec(
              `git remote add origin '${url}' 2>&1 || git remote set-url origin '${url}' 2>&1`,
              projDir,
              5,
            );
          }
          return `✅ Git initialized${url ? `: ${url}` : ""}`;
        }
        case "status": {
          const r = await sandboxExec("git status 2>&1", projDir, 5);
          return r.stdout || r.stderr;
        }
        case "commit": {
          const msg = (input.message as string) || "Update";
          const r = await sandboxExec(
            `git add -A && git commit -m '${msg.replace(/'/g, "\\'")}' 2>&1`,
            projDir,
            10,
          );
          return r.exitCode === 0 ? `✅ Committed: ${msg}` : `❌ ${r.stderr.slice(0, 300)}`;
        }
        case "push": {
          const b = (input.branch as string) || "";
          const r = await sandboxExec(
            b ? `git push origin ${b} 2>&1` : "git push 2>&1",
            projDir,
            30,
          );
          return r.exitCode === 0 ? `✅ Pushed` : `❌ ${r.stderr.slice(0, 500)}`;
        }
        case "pull": {
          const r = await sandboxExec("git pull 2>&1", projDir, 30);
          return r.exitCode === 0 ? `✅ Pulled` : `❌ ${r.stderr.slice(0, 300)}`;
        }
        case "branch": {
          const b = (input.branch as string) || "";
          if (!b) {
            const r = await sandboxExec("git branch -a 2>&1", projDir, 5);
            return r.stdout;
          }
          const r = await sandboxExec(
            `git checkout -b '${b}' 2>&1 || git checkout '${b}' 2>&1`,
            projDir,
            5,
          );
          return r.exitCode === 0 ? `✅ Branch: ${b}` : `❌ ${r.stderr.slice(0, 300)}`;
        }
        case "diff": {
          const r = await sandboxExec(
            "git diff --stat 2>&1 && git diff 2>&1 | head -200",
            projDir,
            10,
          );
          return r.stdout.slice(0, 2000) || "No changes";
        }
        case "log": {
          const r = await sandboxExec("git log --oneline -20 2>&1", projDir, 5);
          return r.stdout;
        }
        case "pr-create": {
          if (!ghToken) {
            return "Error: GH_TOKEN required";
          }
          const t = (input.title as string) || "Update";
          const r = await sandboxExec(
            `GH_TOKEN='${ghToken}' gh pr create --title '${t.replace(/'/g, "\\'")}' --body '' --base main 2>&1`,
            projDir,
            30,
          );
          return r.exitCode === 0 ? `✅ PR created:\n${r.stdout}` : `❌ ${r.stderr.slice(0, 500)}`;
        }
        default:
          return `Unknown git action: ${gitAction}. Use: clone, init, status, commit, push, pull, branch, diff, log, pr-create`;
      }
    },

    document_generate: async (input: ToolInput) => {
      const fmt = (input.format as string) || "pdf";
      const content = (input.content as string) || "";
      const title = (input.title as string) || "Document";
      const filename = (input.filename as string) || `doc-${Date.now()}`;
      if (!content) {
        return "Error: content required";
      }
      await sandboxExec("mkdir -p /workspace/output", "/workspace", 3);
      if (fmt === "pdf") {
        const ts = Date.now();
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:system-ui;max-width:800px;margin:40px auto;padding:20px;line-height:1.6;color:#333}h1{color:#1a1a2e;border-bottom:2px solid #6366f1}</style></head><body><h1>${title}</h1>${content.replace(/\n/g, "<br>")}</body></html>`;
        await sandboxWriteFile(`/tmp/doc_${ts}.html`, html);
        const r = await sandboxExec(
          `node -e "const{chromium}=require('playwright');(async()=>{const b=await chromium.launch({args:['--no-sandbox']});const p=await b.newPage();await p.setContent(require('fs').readFileSync('/tmp/doc_${ts}.html','utf8'));await p.pdf({path:'/workspace/output/${filename}.pdf',format:'A4',margin:{top:'40px',bottom:'40px',left:'40px',right:'40px'}});await b.close();console.log('OK')})()"`,
          "/workspace",
          30,
        );
        return `📄 PDF: /workspace/output/${filename}.pdf\n${r.stdout}`;
      } else if (fmt === "docx") {
        const py = `from docx import Document\ndoc = Document()\ndoc.add_heading("${title.replace(/"/g, '\\"')}", 0)\nfor line in """${content.replace(/"/g, '\\"').replace(/\n/g, "\\n")}""".split("\\n"):\n    line = line.strip()\n    if line.startswith("## "): doc.add_heading(line[3:], level=2)\n    elif line.startswith("- "): doc.add_paragraph(line[2:], style='List Bullet')\n    elif line: doc.add_paragraph(line)\ndoc.save("/workspace/output/${filename}.docx")\nprint("OK")`;
        const r = await sandboxExec(`python3 -c ${JSON.stringify(py)}`, "/workspace", 15);
        return `📝 DOCX: /workspace/output/${filename}.docx\n${r.stdout}`;
      }
      return `Unknown format: ${fmt}. Use: pdf, docx`;
    },

    mcp_connect: async (input: ToolInput) => {
      const action = (input.action as string) || "list_tools";
      const url = (input.server_url as string) || "";
      const tool = (input.tool_name as string) || "";
      const toolParams = (input.tool_params as string) || "{}";

      switch (action) {
        case "connect": {
          if (!url) {
            return "Error: server_url required";
          }
          // Register MCP server with the gateway
          const payload = JSON.stringify({ method: "republic.mcp.connect", params: { url } });
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d '${payload.replace(/'/g, "'\\''")}' 'http://host.docker.internal:3000/rpc' -m 30`,
            "/workspace",
            35,
          );
          const resp = (() => {
            try {
              return JSON.parse(r.stdout);
            } catch {
              return {};
            }
          })();
          return resp?.result?.ok
            ? `🔌 MCP Connected: ${url}\nTools: ${(resp.result.tools || []).join(", ") || "(query with list_tools)"}`
            : `🔌 MCP server: ${url}\n\nUse via gateway or pass server_url to list_tools/call_tool.\n\nPrebuilt MCP servers (install via npm):\n- @modelcontextprotocol/server-postgres\n- @modelcontextprotocol/server-github\n- @modelcontextprotocol/server-gdrive\n- @modelcontextprotocol/server-brave-search\n- @modelcontextprotocol/server-puppeteer`;
        }
        case "list_tools": {
          if (!url) {
            return `Error: server_url required. Known MCP servers:\n- stdio: npx -y @modelcontextprotocol/server-github\n- http: https://mcp.linear.app/sse`;
          }
          const payload = JSON.stringify({ method: "republic.mcp.list_tools", params: { url } });
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d '${payload.replace(/'/g, "'\\''")}' 'http://host.docker.internal:3000/rpc' -m 30`,
            "/workspace",
            35,
          );
          const resp = (() => {
            try {
              return JSON.parse(r.stdout);
            } catch {
              return {};
            }
          })();
          return resp?.result?.tools
            ? `📋 MCP Tools @ ${url}:\n${resp.result.tools.map((t: { name: string; description?: string }) => `- ${t.name}: ${t.description || ""}`).join("\n")}`
            : `MCP list_tools: ${r.stdout.slice(0, 500)}`;
        }
        case "call_tool": {
          if (!tool) {
            return "Error: tool_name required";
          }
          if (!url) {
            return "Error: server_url required";
          }
          let params: unknown = {};
          try {
            params = JSON.parse(toolParams);
          } catch {
            params = { input: toolParams };
          }
          const payload = JSON.stringify({
            method: "republic.mcp.call_tool",
            params: { url, tool_name: tool, tool_params: params },
          });
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d '${payload.replace(/'/g, "'\\''")}' 'http://host.docker.internal:3000/rpc' -m 60`,
            "/workspace",
            65,
          );
          const resp = (() => {
            try {
              return JSON.parse(r.stdout);
            } catch {
              return {};
            }
          })();
          return resp?.result
            ? `🔧 MCP Tool Result (${tool}):\n\n${JSON.stringify(resp.result, null, 2).slice(0, 4000)}`
            : `MCP call failed: ${r.stdout.slice(0, 500)}`;
        }
        case "disconnect":
          return "🔌 MCP session closed.";
        default:
          return `Unknown mcp_connect action: ${action}. Use: connect, list_tools, call_tool, disconnect`;
      }
    },

    template_seed: async (input: ToolInput) => {
      const tmpl = (input.template as string) || "";
      if (!tmpl) {
        return "Error: template required. Options: saas-dashboard, landing-page, admin-panel, 3d-game, ecommerce, blog-platform";
      }
      const projectName = (input.project_name as string) || "my-app";
      const outDir = `/workspace/${projectName}`;
      await sandboxExec(`mkdir -p ${outDir}/src`, "/workspace", 5);
      const pkgJson = {
        name: projectName,
        private: true,
        version: "0.1.0",
        type: "module",
        scripts: { dev: "vite --port 8080 --host 0.0.0.0", build: "tsc && vite build" },
        dependencies: {
          react: "latest",
          "react-dom": "latest",
          "react-router-dom": "latest",
          "lucide-react": "latest",
        },
        devDependencies: {
          vite: "latest",
          "@vitejs/plugin-react": "latest",
          tailwindcss: "latest",
          typescript: "latest",
          "@types/react": "latest",
          "@types/react-dom": "latest",
        },
      };
      await sandboxWriteFile(`${outDir}/package.json`, JSON.stringify(pkgJson, null, 2));
      await sandboxWriteFile(
        `${outDir}/index.html`,
        `<!DOCTYPE html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${projectName}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>`,
      );
      await sandboxWriteFile(
        `${outDir}/src/main.tsx`,
        `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);`,
      );
      await sandboxWriteFile(
        `${outDir}/src/index.css`,
        `@tailwind base;\n@tailwind components;\n@tailwind utilities;\nbody { @apply bg-gray-950 text-white antialiased; }\n`,
      );
      await sandboxWriteFile(
        `${outDir}/src/App.tsx`,
        `export default function App() {\n  return <div className="min-h-screen bg-gray-950 text-white p-6"><h1 className="text-3xl font-bold">${projectName}</h1><p className="text-gray-400 mt-2">Template: ${tmpl}</p></div>;\n}\n`,
      );
      await sandboxWriteFile(
        `${outDir}/vite.config.ts`,
        `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: 8080 } });\n`,
      );
      const installResult = await sandboxExec("npm install 2>&1", outDir, 120);
      return `🏗️ Template "${tmpl}" seeded: ${outDir}\nDeps: ${installResult.exitCode === 0 ? "✅" : "⚠️ npm install"}\n\nNext: \`preview_app\` → start dev server`;
    },
  };
}

export const integrationToolsSummary: ToolSummaryMap = {
  web_app_bridge: (input) => `🌐 Bridge: ${input.action ?? "status"} ${input.service ?? ""}`,
  rag_knowledge: (input) => `📚 RAG: ${input.action ?? "list"}`,
  git_github: (input) => `📦 Git: ${input.action ?? "status"}`,
  document_generate: (input) => `📄 DocGen: ${input.format ?? "pdf"}`,
  mcp_connect: (input) => `🔌 MCP: ${input.action ?? "list_tools"}`,
  template_seed: (input) => `🏗️ Template: ${input.template ?? "?"}`,
};
