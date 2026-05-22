/**
 * Platform Tools — Cloud storage, email, agent memory, containers, PWA, i18n, deploy
 * Handles: cloud_storage, email, agent_memory, container_manage, pwa_setup, i18n_setup,
 *          preview_app, deploy_local, deploy_public, template_seed, python_exec, database
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createPlatformToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    cloud_storage: async (input: ToolInput) => {
      const csAction = (input.action as string) || "status";
      const provider = (input.provider as string) || "";
      const remotePath = (input.remote_path as string) || "";
      const localPath = (input.local_path as string) || "/workspace";
      const providerMap: Record<string, string> = { onedrive: "onedrive", gdrive: "drive", googledrive: "drive", dropbox: "dropbox" };

      switch (csAction) {
        case "status": {
          const r = await sandboxExec("rclone listremotes 2>&1", "/workspace", 5);
          return !r.stdout.trim() ? `📂 No cloud storage configured. Use action="auth" and provider="onedrive|gdrive|dropbox".` : `📂 Configured Remotes:\n${r.stdout}`;
        }
        case "auth": {
          if (!provider) { return "Error: provider required. Use: onedrive, gdrive, dropbox"; }
          const rcloneType = providerMap[provider] || provider;
          const remoteName = `hoc-${provider}`;
          await sandboxExec(`rclone config create '${remoteName}' '${rcloneType}' 2>&1 || echo 'CONFIG_CREATED'`, "/workspace", 15);
          return `🔑 Cloud Storage Auth: ${provider}\n\nRemote "${remoteName}" configured.\nTo complete OAuth: run \`rclone authorize "${rcloneType}"\` on your local machine.`;
        }
        case "list": {
          if (!provider) { return "Error: provider required"; }
          const rPath = remotePath ? `hoc-${provider}:${remotePath}` : `hoc-${provider}:`;
          const r = await sandboxExec(`rclone lsf '${rPath}' --max-depth 1 2>&1`, "/workspace", 30);
          return r.exitCode === 0 ? `📂 ${provider}:${remotePath || "/"}\n\n${r.stdout.slice(0, 3000) || "(empty)"}` : `❌ ${r.stderr.slice(0, 300)}`;
        }
        case "download": {
          if (!provider || !remotePath) { return "Error: provider and remote_path required"; }
          const r = await sandboxExec(`rclone copy 'hoc-${provider}:${remotePath}' '${localPath}/' --progress 2>&1`, "/workspace", 120);
          return r.exitCode === 0 ? `✅ Downloaded: ${remotePath} → ${localPath}` : `❌ Download failed: ${r.stderr.slice(0, 300)}`;
        }
        case "upload": {
          if (!provider) { return "Error: provider required"; }
          const dest = remotePath || "/";
          const r = await sandboxExec(`rclone copy '${localPath}' 'hoc-${provider}:${dest}' --progress 2>&1`, "/workspace", 120);
          return r.exitCode === 0 ? `✅ Uploaded: ${localPath} → ${provider}:${dest}` : `❌ Upload failed: ${r.stderr.slice(0, 300)}`;
        }
        case "sync": {
          if (!provider) { return "Error: provider required"; }
          const dest = remotePath || "/";
          const r = await sandboxExec(`rclone sync '${localPath}' 'hoc-${provider}:${dest}' --progress 2>&1`, "/workspace", 300);
          return r.exitCode === 0 ? `🔄 Synced: ${localPath} ↔ ${provider}:${dest}` : `❌ Sync failed: ${r.stderr.slice(0, 300)}`;
        }
        default:
          return `Unknown cloud_storage action: ${csAction}. Use: auth, list, download, upload, sync, status`;
      }
    },

    email: async (input: ToolInput) => {
      const emailAction = (input.action as string) || "read";
      switch (emailAction) {
        case "auth": {
          const host = (input.smtp_host as string) || "";
          const port = (input.smtp_port as number) || 587;
          const user = (input.smtp_user as string) || "";
          const pass = (input.smtp_pass as string) || "";
          if (!host || !user || !pass) { return "Error: smtp_host, smtp_user, smtp_pass required"; }
          await sandboxExec(`mkdir -p /root/.config/hoc-email && cat > /root/.config/hoc-email/smtp.conf << 'SMTPEOF'\nSMTP_HOST=${host}\nSMTP_PORT=${port}\nSMTP_USER=${user}\nSMTP_PASS=${pass}\nSMTPEOF`, "/workspace", 5);
          return `✅ SMTP configured: ${user}@${host}:${port}`;
        }
        case "send": {
          const to = (input.to as string) || "";
          const subj = (input.subject as string) || "(No Subject)";
          const body = (input.body as string) || "";
          if (!to) { return "Error: 'to' is required"; }
          const configResult = await sandboxExec("cat /root/.config/hoc-email/smtp.conf 2>/dev/null", "/workspace", 3);
          if (!configResult.stdout.includes("SMTP_HOST")) { return `⚠️ Email not configured. Use action="auth" first.`; }
          const pyScript = `\nimport smtplib, os\nfrom email.mime.text import MIMEText\nfrom email.mime.multipart import MIMEMultipart\nconfig = {}\nfor line in open('/root/.config/hoc-email/smtp.conf'):\n    if '=' in line:\n        k, v = line.strip().split('=', 1)\n        config[k] = v\nmsg = MIMEMultipart()\nmsg['From'] = config['SMTP_USER']\nmsg['To'] = '${to}'\nmsg['Subject'] = '${subj.replace(/'/g, "\\'")}'\nmsg.attach(MIMEText('''${body.replace(/'/g, "\\'")}''', 'html' if '<' in '''${body}''' else 'plain'))\nserver = smtplib.SMTP(config['SMTP_HOST'], int(config['SMTP_PORT']))\nserver.starttls()\nserver.login(config['SMTP_USER'], config['SMTP_PASS'])\nserver.send_message(msg)\nserver.quit()\nprint('OK')\n`;
          await sandboxWriteFile("/tmp/send_email.py", pyScript);
          const r = await sandboxExec("python3 /tmp/send_email.py 2>&1", "/workspace", 30);
          return r.exitCode === 0 && r.stdout.includes("OK") ? `✉️ Email sent!\nTo: ${to}\nSubject: ${subj}` : `❌ Failed: ${r.stdout.slice(0, 300)}`;
        }
        case "read": {
          const emailCount = (input.count as number) || 10;
          const emailFolder = (input.folder as string) || "INBOX";
          const configResult = await sandboxExec("cat /root/.config/hoc-email/smtp.conf 2>/dev/null", "/workspace", 3);
          if (!configResult.stdout.includes("SMTP_HOST")) { return `⚠️ Email not configured. Use action="auth" first.`; }
          const pyRead = `\nimport imaplib, email, email.header\nconfig = {}\nfor line in open('/root/.config/hoc-email/smtp.conf'):\n    if '=' in line: k, v = line.strip().split('=', 1); config[k] = v\nimap_host = config['SMTP_HOST'].replace('smtp.', 'imap.')\nmail = imaplib.IMAP4_SSL(imap_host)\nmail.login(config['SMTP_USER'], config['SMTP_PASS'])\nmail.select('${emailFolder}')\n_, ids = mail.search(None, 'ALL')\nmsg_ids = ids[0].split()[-${emailCount}:]\nfor mid in reversed(msg_ids):\n    _, data = mail.fetch(mid, '(RFC822)')\n    msg = email.message_from_bytes(data[0][1])\n    subj = email.header.decode_header(msg['Subject'])[0][0]\n    if isinstance(subj, bytes): subj = subj.decode('utf-8', errors='replace')\n    print(f"📧 {subj}\\n   From: {msg['From']}\\n   Date: {msg['Date']}\\n")\nmail.logout()\n`;
          await sandboxWriteFile("/tmp/read_email.py", pyRead);
          const r = await sandboxExec("python3 /tmp/read_email.py 2>&1", "/workspace", 30);
          return r.exitCode === 0 ? `📬 Recent Emails (${emailFolder}):\n\n${r.stdout.slice(0, 3000)}` : `❌ Read failed: ${r.stderr.slice(0, 300)}`;
        }
        default:
          return `Unknown email action: ${emailAction}. Use: auth, send, read, search`;
      }
    },

    agent_memory: async (input: ToolInput) => {
      const memAction = (input.action as string) || "load";
      const memKey = (input.key as string) || "";
      const memValue = (input.value as string) || "";
      const memFile = "/workspace/.hoc-agent-memory.json";
      switch (memAction) {
        case "load": {
          const r = await sandboxExec(`cat '${memFile}' 2>/dev/null || echo '{}'`, "/workspace", 3);
          return `🧠 Agent Memory:\n\`\`\`json\n${(r.stdout.trim() || "{}").slice(0, 4000)}\n\`\`\``;
        }
        case "save": {
          if (!memKey) { return "Error: key is required"; }
          const r = await sandboxExec(`cat '${memFile}' 2>/dev/null || echo '{}'`, "/workspace", 3);
          const script = `\nimport json\ntry: data = json.loads('''${(r.stdout.trim() || "{}").replace(/'/g, "\\'")}''')\nexcept: data = {}\ndata['${memKey.replace(/'/g, "\\'")}'] = '''${memValue.replace(/'/g, "\\'")}'''\ntry: data['${memKey.replace(/'/g, "\\'")}'] = json.loads(data['${memKey.replace(/'/g, "\\'")}'])\nexcept: pass\njson.dump(data, open('${memFile}', 'w'), indent=2)\nprint('OK')`;
          await sandboxWriteFile("/tmp/mem_save.py", script);
          const w = await sandboxExec("python3 /tmp/mem_save.py 2>&1", "/workspace", 5);
          return w.stdout.includes("OK") ? `🧠 Saved: \`${memKey}\` = ${memValue.slice(0, 200)}` : `❌ ${w.stderr.slice(0, 300)}`;
        }
        case "delete": {
          if (!memKey) { return "Error: key is required"; }
          const script = `import json\ntry: data = json.loads(open('${memFile}').read())\nexcept: data = {}\ndata.pop('${memKey.replace(/'/g, "\\'")}', None)\njson.dump(data, open('${memFile}', 'w'), indent=2)\nprint('OK')`;
          await sandboxWriteFile("/tmp/mem_del.py", script);
          await sandboxExec("python3 /tmp/mem_del.py 2>&1", "/workspace", 5);
          return `🧠 Deleted: \`${memKey}\``;
        }
        case "clear": {
          await sandboxExec(`echo '{}' > '${memFile}'`, "/workspace", 3);
          return "🧠 Memory cleared.";
        }
        default:
          return `Unknown memory action: ${memAction}. Use: save, load, delete, clear`;
      }
    },

    container_manage: async (input: ToolInput) => {
      const cmAction = (input.action as string) || "status";
      const cmType = (input.container_type as string) || "";
      // Container info with discovery patterns — the orchestrator names
      // containers as hoc-<preset>-<uid>, so we use docker ps --filter
      // to find them by label or name prefix instead of hardcoded names.
      const containerDefs: Record<string, { namePrefix: string; filterLabel: string; image: string; gpu: boolean; port: number }> = {
        exec: { namePrefix: "hoc-agent-sandbox", filterLabel: "hoc.service=sandbox", image: "hoc/agent-sandbox:latest", gpu: false, port: 3100 },
        comfyui: { namePrefix: "hoc-comfyui", filterLabel: "hoc.service=comfyui", image: "yanwk/comfyui-boot:cu128-megapak", gpu: true, port: 8188 },
        wan2gp: { namePrefix: "hoc-wan2gp", filterLabel: "hoc.service=wan2gp", image: "hoc/wan2gp:latest", gpu: true, port: 7860 },
        ml: { namePrefix: "hoc-ml", filterLabel: "hoc.service=ml", image: "hoc/comfyui-sandbox:latest", gpu: true, port: 3103 },
        kali: { namePrefix: "hoc-kali", filterLabel: "hoc.service=kali", image: "kalilinux/kali-rolling", gpu: false, port: 3104 },
        playwright: { namePrefix: "hoc-playwright", filterLabel: "hoc.service=sandbox-playwright", image: "hoc/playwright-sandbox:latest", gpu: false, port: 3101 },
        dev: { namePrefix: "hoc-dev", filterLabel: "hoc.service=sandbox-dev", image: "hoc/dev-sandbox:latest", gpu: false, port: 3105 },
      };

      /** Find a running container by label OR name prefix */
      async function findContainer(type: string): Promise<string | null> {
        const def = containerDefs[type];
        if (!def) { return null; }
        // First try by label
        let r = await sandboxExec(
          `docker ps --filter "label=${def.filterLabel}" --filter "status=running" --format "{{.Names}}" 2>/dev/null | head -1`,
          "/workspace", 5,
        );
        if (r.stdout.trim()) { return r.stdout.trim(); }
        // Fallback: find by name prefix
        r = await sandboxExec(
          `docker ps --filter "name=${def.namePrefix}" --filter "status=running" --format "{{.Names}}" 2>/dev/null | head -1`,
          "/workspace", 5,
        );
        return r.stdout.trim() || null;
      }

      switch (cmAction) {
        case "status": {
          const statuses: string[] = [];
          for (const [type, def] of Object.entries(containerDefs)) {
            const name = await findContainer(type);
            if (name) {
              statuses.push(`🟢 **${type}** (${name}) — running${def.gpu ? " [GPU]" : ""}`);
            } else {
              // Check for stopped containers
              const r = await sandboxExec(
                `docker ps -a --filter "name=${def.namePrefix}" --format "{{.Names}}\t{{.Status}}" 2>/dev/null | head -1`,
                "/workspace", 5,
              );
              if (r.stdout.trim()) {
                const [cName, cStatus] = r.stdout.trim().split("\t");
                const icon = (cStatus ?? "").includes("Exited") ? "🔴" : "🟡";
                statuses.push(`${icon} **${type}** (${cName}) — ${cStatus}${def.gpu ? " [GPU]" : ""}`);
              } else {
                statuses.push(`⚫ **${type}** — not found${def.gpu ? " [GPU]" : ""}`);
              }
            }
          }
          return `🐳 Container Status\n\n${statuses.join("\n")}`;
        }
        case "start": case "ensure": {
          if (!cmType || !containerDefs[cmType]) { return `Error: container_type required. Use: ${Object.keys(containerDefs).join(", ")}`; }
          const def = containerDefs[cmType];
          // Check if already running
          const existing = await findContainer(cmType);
          if (existing) {
            return `✅ Container **${cmType}** already running: ${existing}\nAPI: http://localhost:${def.port}${def.gpu ? "\nGPU: NVIDIA passthrough" : ""}`;
          }
          // Try via gateway RPC
          const rpcMethod = cmType === "comfyui" ? "republic.comfyui.launch" : "republic.docker.start";
          const rpcParams = cmType === "comfyui"
            ? "{}"
            : `{"containerName":"${def.namePrefix}","image":"${def.image}"${def.gpu ? ',"gpu":true' : ""}}`;
          const startResult = await sandboxExec(`curl -sL -X POST -H 'Content-Type: application/json' -d '{"method":"${rpcMethod}","params":${rpcParams}}' 'http://host.docker.internal:3000/rpc' -m 60`, "/workspace", 65);
          const launched = await findContainer(cmType);
          if (launched || startResult.stdout.includes('"ok":true') || startResult.stdout.includes("running")) {
            return `✅ Container **${cmType}** started: ${launched ?? def.namePrefix}\nAPI: http://localhost:${def.port}${def.gpu ? "\nGPU: NVIDIA passthrough" : ""}`;
          }
          // Direct docker fallback
          const gpuFlag = def.gpu ? "--gpus all" : "";
          // WanGP needs volume mounts for model cache (10-50GB) and outputs
          const extraFlags = cmType === "wan2gp"
            ? "-v wan2gp-models:/home/user/.cache -v wan2gp-outputs:/workspace/outputs --label hoc.service=wan2gp"
            : `--label hoc.service=${cmType}`;
          const dockerResult = await sandboxExec(`docker start $(docker ps -a --filter "name=${def.namePrefix}" --format "{{.Names}}" | head -1) 2>/dev/null || docker run -d --name ${def.namePrefix} ${gpuFlag} ${extraFlags} -p ${def.port}:${def.port} ${def.image} 2>&1`, "/workspace", 30);
          return dockerResult.exitCode === 0 ? `✅ Container **${cmType}** started` : `❌ Failed: ${dockerResult.stderr.slice(0, 300)}`;
        }
        case "stop": {
          if (!cmType || !containerDefs[cmType]) { return `Error: container_type required. Use: ${Object.keys(containerDefs).join(", ")}`; }
          const name = await findContainer(cmType);
          if (!name) { return `⚠️ No running container found for **${cmType}**`; }
          await sandboxExec(`docker stop ${name} 2>/dev/null`, "/workspace", 15);
          return `⏹️ Container **${cmType}** (${name}) stopped`;
        }
        default:
          return `Unknown action: ${cmAction}. Use: start, stop, status, ensure`;
      }
    },

    preview_app: async (input: ToolInput) => {
      const projDir = (input.project_dir as string) || "/workspace";
      const port = (input.port as number) || 8080;
      const buildFirst = input.build_first ?? false;
      await sandboxExec(`fuser -k ${port}/tcp 2>/dev/null || true`, projDir, 5);
      if (buildFirst) {
        const buildResult = await sandboxExec("npm run build 2>&1", projDir, 120);
        if (buildResult.exitCode !== 0) { return `❌ Build failed:\n${buildResult.stderr.slice(0, 500)}`; }
      }
      const pkgCheck = await sandboxExec("cat package.json 2>/dev/null", projDir, 3);
      let startCmd: string;
      if (pkgCheck.stdout.includes('"next"')) { startCmd = `PORT=${port} npx next dev -p ${port}`; }
      else if (pkgCheck.stdout.includes('"vite"')) { startCmd = `npx vite --port ${port} --host 0.0.0.0`; }
      else { startCmd = `npx serve -s . -p ${port}`; }
      await sandboxExec(`nohup bash -c '${startCmd}' > /tmp/preview.log 2>&1 &`, projDir, 3);
      await sandboxExec("sleep 2", projDir, 5);
      return `🌐 Preview Running!\n\nURL: http://localhost:${port}\nProject: ${projDir}\nCommand: \`${startCmd}\``;
    },

    deploy_local: async (input: ToolInput) => {
      const projDir = (input.project_dir as string) || "/workspace";
      const buildCmd = (input.build_command as string) || "npm run build";
      const port = (input.serve_port as number) || 8080;
      await sandboxExec(`fuser -k ${port}/tcp 2>/dev/null || true`, projDir, 5);
      const buildResult = await sandboxExec(`${buildCmd} 2>&1`, projDir, 180);
      if (buildResult.exitCode !== 0) { return `❌ Build failed:\n${buildResult.stderr.slice(0, 800)}`; }
      const distCheck = await sandboxExec(`ls -d dist build out .next/standalone 2>/dev/null | head -1`, projDir, 3);
      const distDir = distCheck.stdout.trim() || "dist";
      await sandboxExec(`nohup npx serve -s ${distDir} -p ${port} > /tmp/deploy.log 2>&1 &`, projDir, 3);
      await sandboxExec("sleep 2", projDir, 5);
      return `🚀 Production Build Deployed!\n\nURL: http://localhost:${port}\nBuild: \`${buildCmd}\`\nServing: ${projDir}/${distDir}`;
    },

    deploy_public: async (input: ToolInput) => {
      const dpPort = (input.port as number) || 8080;
      await sandboxExec("pkill -f cloudflared 2>/dev/null || true", "/workspace", 3);
      const dpRes = await sandboxExec(`cloudflared tunnel --url http://localhost:${dpPort} 2>&1 &\nsleep 5\ngrep -oP 'https://[a-z0-9-]+\\.trycloudflare\\.com' /proc/$(pgrep -f cloudflared | head -1)/fd/2 2>/dev/null || echo "Tunnel starting..."`, "/workspace", 15);
      return `🌐 Public Deploy:\n${dpRes.stdout || `Tunnel started on port ${dpPort}`}`;
    },

    python_exec: async (input: ToolInput) => {
      const pyScript = (input.script as string) || "";
      if (!pyScript) { return "Error: script is required"; }
      const pyTimeout = Math.min((input.timeout_seconds as number) || 60, 300);
      const pyFile = `/tmp/agent_script_${Date.now()}.py`;
      await sandboxWriteFile(pyFile, pyScript);
      const pyRes = await sandboxExec(`python3 '${pyFile}' 2>&1`, "/workspace", pyTimeout);
      return `🐍 Python Output:\n${(pyRes.stdout + "\n" + pyRes.stderr).trim().slice(0, 10000)}`;
    },

    database: async (input: ToolInput) => {
      const dbAction = (input.action as string) || "";
      const dbName = (input.db_name as string) || "app.db";
      const dbPath = `/workspace/${dbName}`;
      const dbSql = (input.sql as string) || "";
      const dbTable = (input.table as string) || "";
      const dbData = (input.data as string) || "[]";
      switch (dbAction) {
        case "create_db": {
          await sandboxExec(`sqlite3 '${dbPath}' '.databases'`, "/workspace", 5);
          return `✅ Database created: ${dbPath}`;
        }
        case "execute_sql": {
          if (!dbSql) { return "Error: sql required"; }
          const sqlRes = await sandboxExec(`sqlite3 -header -column '${dbPath}' "${dbSql.replace(/"/g, '\\"')}"`, "/workspace", 30);
          return `📊 SQL Result:\n${sqlRes.stdout || "(no output)"}\n${sqlRes.stderr || ""}`.trim();
        }
        case "schema": {
          const schemaRes = await sandboxExec(`sqlite3 '${dbPath}' '.schema'`, "/workspace", 10);
          return `📋 Schema:\n${schemaRes.stdout || "(empty database)"}`;
        }
        case "seed": {
          if (!dbTable) { return "Error: table required"; }
          const seedScript = `\nimport sqlite3, json\nconn = sqlite3.connect("${dbPath}")\nrows = json.loads('''${dbData}''')\nif rows:\n    cols = list(rows[0].keys())\n    placeholders = ",".join(["?"] * len(cols))\n    conn.executemany(f"INSERT INTO ${dbTable} ({','.join(cols)}) VALUES ({placeholders})", [tuple(r[c] for c in cols) for r in rows])\n    conn.commit()\n    print(f"✅ Seeded {len(rows)} rows into ${dbTable}")\nconn.close()`;
          const seedRes = await sandboxExec(`python3 -c ${JSON.stringify(seedScript)}`, "/workspace", 15);
          return seedRes.stdout || seedRes.stderr || "Seed complete";
        }
        case "migrate": {
          if (!dbSql) { return "Error: sql required"; }
          const migrateFile = `/tmp/migrate_${Date.now()}.sql`;
          await sandboxWriteFile(migrateFile, dbSql);
          const migRes = await sandboxExec(`sqlite3 '${dbPath}' < '${migrateFile}'`, "/workspace", 15);
          return `✅ Migration applied.\n${migRes.stderr || ""}`.trim();
        }
        default:
          return `Unknown database action: ${dbAction}. Use: create_db, execute_sql, schema, seed, migrate`;
      }
    },

    i18n_setup: async (input: ToolInput) => {
      const i18nDir = (input.project_dir as string) || "/workspace";
      const i18nLangs = (input.languages as string) || "en,ar,es,fr,de,zh,ja";
      await sandboxExec(`cd '${i18nDir}' && npm install i18next react-i18next i18next-browser-languagedetector 2>/dev/null`, i18nDir, 20);
      const i18nConfig = `import i18n from 'i18next';\nimport { initReactI18next } from 'react-i18next';\nimport LanguageDetector from 'i18next-browser-languagedetector';\n\nconst resources = {\n${i18nLangs.split(",").map(l => `  ${l.trim()}: { translation: require('./locales/${l.trim()}.json') }`).join(",\n")}\n};\n\ni18n.use(LanguageDetector).use(initReactI18next).init({\n  resources,\n  fallbackLng: 'en',\n  interpolation: { escapeValue: false },\n});\n\nexport default i18n;\n`;
      await sandboxWriteFile(`${i18nDir}/src/i18n.ts`, i18nConfig);
      await sandboxExec(`mkdir -p '${i18nDir}/src/locales'`, i18nDir, 3);
      for (const lang of i18nLangs.split(",")) {
        await sandboxWriteFile(`${i18nDir}/src/locales/${lang.trim()}.json`, JSON.stringify({ welcome: lang.trim() === "en" ? "Welcome" : `[${lang.trim()}] Welcome`, app_name: "My App" }, null, 2));
      }
      return `🌐 i18n Setup Complete!\n- Config: src/i18n.ts\n- Locales: ${i18nLangs.split(",").map(l => `src/locales/${l.trim()}.json`).join(", ")}\n- Add \`import './i18n'\` to main.tsx`;
    },

    browser_request_user_control: async (input: ToolInput) => {
      const url = (input.url as string) || "";
      const reason = (input.reason as string) || "Authentication required";
      const serviceName = (input.service_name as string) || "the website";

      // Try to pause the collaborative session
      try {
        const { pauseForUser } = await import("../browser-collab.js");
        pauseForUser(reason);
      } catch {
        // No active session — still show the card
      }

      const novncUrl = "http://localhost:6080/vnc.html";

      // Return a formatted card that the chat UI renders as interactive
      return [
        `<user_control_request>`,
        `<title>🖥️ Agent Needs Your Help</title>`,
        `<service>${serviceName}</service>`,
        `<url>${url}</url>`,
        `<reason>${reason}</reason>`,
        `<novnc_url>${novncUrl}</novnc_url>`,
        `<instructions>`,
        `1. Click "Open Browser" below to access the live browser view`,
        `2. Complete the authentication (login, OTP, CAPTCHA, etc.)`,
        `3. Once authenticated, click "Resume Agent" to hand control back`,
        ``,
        `Your session cookies will be automatically saved for future use.`,
        `</instructions>`,
        `</user_control_request>`,
        ``,
        `**I need your help!** I've hit a ${reason.toLowerCase()} on **${serviceName}** (${url}).`,
        ``,
        `👉 [Open Browser](${novncUrl}) to authenticate manually.`,
        ``,
        `After you're done, tell me to resume and I'll continue with your authenticated session.`,
      ].join("\n");
    },
  };
}

export const platformToolsSummary: ToolSummaryMap = {
  cloud_storage: (input) => `📂 Cloud: ${input.action ?? "status"} ${input.provider ?? ""}`,
  email: (input) => `📧 Email: ${input.action ?? "read"}`,
  agent_memory: (input) => `🧠 Memory: ${input.action ?? "load"}`,
  container_manage: (input) => `🐳 Container: ${input.action ?? "status"} ${input.container_type ?? ""}`,
  preview_app: (input) => `🌐 Preview: ${input.project_dir ?? "/workspace"}`,
  deploy_local: (input) => `🚀 Deploy: ${input.project_dir ?? "/workspace"}`,
  deploy_public: (input) => `🌐 Public tunnel: port ${input.port ?? 8080}`,
  python_exec: () => `🐍 Python script`,
  database: (input) => `🗃️ DB: ${input.action ?? ""} ${input.db_name ?? "app.db"}`,
  i18n_setup: (input) => `🌐 i18n: ${input.languages ?? "en,ar,..."}`,
  browser_request_user_control: (input) => `🖥️ Requesting user control: ${input.service_name ?? input.url ?? "browser"}`,
};
