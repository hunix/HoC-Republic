/**
 * Extended Tools — SSH, DNS, QR, Workflows, Calendar, SMS, OAuth, ML Serve, Screen Record, Diagrams, Env Sync
 * Handles: ssh_remote, dns_manage, qr_code, workflow_chain, calendar_manage, sms_send,
 *          oauth_flow, model_serve, screen_record, diagram_generate, env_sync
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createExtendedToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    // ─── SSH Remote ──────────────────────────────────────────────
    ssh_remote: async (input: ToolInput) => {
      const action = (input.action as string) || "exec";
      const host = (input.host as string) || "";
      if (!host) {
        return "Error: host is required";
      }
      const user = (input.user as string) || "root";
      const keyPath = (input.key_path as string) || "";
      const password = (input.password as string) || "";
      const sshPort = (input.port as number) || 22;
      const command = (input.command as string) || "";
      const localPath = (input.local_path as string) || "";
      const remotePath = (input.remote_path as string) || "";

      const keyFlag = keyPath ? `-i '${keyPath}'` : "";
      const sshOpts = `-o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${sshPort} ${keyFlag}`;

      // If password-based, use sshpass
      const sshCmd = password ? `sshpass -p '${password}' ssh ${sshOpts}` : `ssh ${sshOpts}`;
      const scpCmd = password
        ? `sshpass -p '${password}' scp ${sshOpts.replace(`-p ${sshPort}`, `-P ${sshPort}`)}`
        : `scp ${sshOpts.replace(`-p ${sshPort}`, `-P ${sshPort}`)}`;

      switch (action) {
        case "exec": {
          if (!command) {
            return "Error: command required for exec";
          }
          const r = await sandboxExec(
            `${sshCmd} ${user}@${host} '${command.replace(/'/g, "'\\''")}'  2>&1`,
            "/workspace",
            60,
          );
          return `🖥️ SSH ${user}@${host}:${sshPort}\n\`\`\`\n$ ${command}\n${r.stdout.slice(0, 8000)}\n\`\`\`${r.exitCode !== 0 ? `\n\n⚠️ Exit code: ${r.exitCode}` : ""}`;
        }
        case "upload": {
          if (!localPath || !remotePath) {
            return "Error: local_path and remote_path required";
          }
          const r = await sandboxExec(
            `${scpCmd} -r '${localPath}' ${user}@${host}:'${remotePath}' 2>&1`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `📤 Uploaded: ${localPath} → ${user}@${host}:${remotePath}`
            : `⚠️ Upload failed: ${r.stdout.slice(0, 500)}`;
        }
        case "download": {
          if (!remotePath) {
            return "Error: remote_path required";
          }
          const localDest = localPath || `/workspace/${remotePath.split("/").pop()}`;
          const r = await sandboxExec(
            `${scpCmd} -r ${user}@${host}:'${remotePath}' '${localDest}' 2>&1`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `📥 Downloaded: ${user}@${host}:${remotePath} → ${localDest}`
            : `⚠️ Download failed: ${r.stdout.slice(0, 500)}`;
        }
        case "tunnel": {
          const localPort = (input.tunnel_local as number) || 8080;
          const remotePort = (input.tunnel_remote as number) || 80;
          await sandboxExec(
            `${sshCmd} -fNL ${localPort}:localhost:${remotePort} ${user}@${host} 2>&1`,
            "/workspace",
            10,
          );
          return `🔗 SSH Tunnel: localhost:${localPort} → ${host}:${remotePort}`;
        }
        case "info": {
          const cmds = [
            "uname -a",
            "uptime",
            "free -h | head -3",
            "df -h / | tail -1",
            "nproc",
            "cat /etc/os-release 2>/dev/null | head -3",
          ];
          const r = await sandboxExec(
            `${sshCmd} ${user}@${host} '${cmds.join(" && echo --- && ")}' 2>&1`,
            "/workspace",
            30,
          );
          return `📊 Remote System Info: ${user}@${host}\n\n\`\`\`\n${r.stdout.slice(0, 5000)}\n\`\`\``;
        }
        case "deploy": {
          if (!localPath) {
            return "Error: local_path required for deploy";
          }
          const dest = remotePath || "/var/www/app";
          const upload = await sandboxExec(
            `${scpCmd} -r '${localPath}' ${user}@${host}:'${dest}' 2>&1`,
            "/workspace",
            120,
          );
          if (upload.exitCode !== 0) {
            return `⚠️ Upload failed: ${upload.stdout.slice(0, 500)}`;
          }
          let result = `📤 Deployed to ${user}@${host}:${dest}`;
          if (command) {
            const exec = await sandboxExec(
              `${sshCmd} ${user}@${host} 'cd ${dest} && ${command.replace(/'/g, "'\\''")}'  2>&1`,
              "/workspace",
              120,
            );
            result += `\n\n🚀 Post-deploy:\n\`\`\`\n${exec.stdout.slice(0, 3000)}\n\`\`\``;
          }
          return result;
        }
        default:
          return `Unknown action: ${action}. Use: exec, upload, download, tunnel, info, deploy`;
      }
    },

    // ─── DNS Management ──────────────────────────────────────────
    dns_manage: async (input: ToolInput) => {
      const action = (input.action as string) || "lookup";
      const domain = (input.domain as string) || "";
      if (!domain) {
        return "Error: domain is required";
      }
      const recordType = ((input.record_type as string) || "A").toUpperCase();
      const recordValue = (input.record_value as string) || "";
      const recordName = (input.record_name as string) || "@";
      const ttl = (input.ttl as number) || 300;
      const zoneId = (input.zone_id as string) || "";
      const recordId = (input.record_id as string) || "";
      const proxied = input.proxied === true;
      const apiToken = (input.api_token as string) || "";

      switch (action) {
        case "lookup": {
          const r = await sandboxExec(
            `dig +short ${domain} ${recordType} 2>&1; echo "---"; dig +short ${domain} MX 2>&1; echo "---"; dig +short ${domain} NS 2>&1; echo "---"; dig +short ${domain} TXT 2>&1`,
            "/workspace",
            15,
          );
          const parts = r.stdout.split("---");
          return `🌐 DNS Lookup: ${domain}\n\n**${recordType}**: ${(parts[0] || "").trim() || "none"}\n**MX**: ${(parts[1] || "").trim() || "none"}\n**NS**: ${(parts[2] || "").trim() || "none"}\n**TXT**: ${(parts[3] || "").trim() || "none"}`;
        }
        case "propagation": {
          const servers = ["8.8.8.8", "1.1.1.1", "208.67.222.222", "9.9.9.9"];
          let result = `🌍 DNS Propagation: ${domain} (${recordType})\n\n`;
          for (const ns of servers) {
            const r = await sandboxExec(
              `dig @${ns} +short ${domain} ${recordType} 2>&1`,
              "/workspace",
              10,
            );
            result += `  ${ns}: ${r.stdout.trim() || "no record"}\n`;
          }
          return result;
        }
        case "list":
        case "create":
        case "update":
        case "delete": {
          if (!apiToken) {
            return `Error: api_token required for Cloudflare ${action}. Use secret_vault to store it.`;
          }
          if (!zoneId && action !== "list") {
            return "Error: zone_id required";
          }
          const cfBase = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
          const authHeader = `-H 'Authorization: Bearer ${apiToken}' -H 'Content-Type: application/json'`;

          if (action === "list") {
            const _zId = zoneId || "(lookup)";
            let listUrl = cfBase;
            if (!zoneId) {
              // Lookup zone ID by domain
              const z = await sandboxExec(
                `curl -sL ${authHeader} 'https://api.cloudflare.com/client/v4/zones?name=${domain}' -m 10`,
                "/workspace",
                15,
              );
              try {
                const data = JSON.parse(z.stdout);
                const zone = data?.result?.[0];
                if (!zone) {
                  return `No Cloudflare zone found for: ${domain}`;
                }
                listUrl = `https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`;
              } catch {
                return `Failed to lookup zone: ${z.stdout.slice(0, 500)}`;
              }
            }
            const r = await sandboxExec(
              `curl -sL ${authHeader} '${listUrl}?per_page=50' -m 10`,
              "/workspace",
              15,
            );
            try {
              const data = JSON.parse(r.stdout);
              const records = data?.result || [];
              const rows = (
                records as Array<{
                  type: string;
                  name: string;
                  content: string;
                  ttl: number;
                  proxied: boolean;
                  id: string;
                }>
              )
                .map(
                  (rec) =>
                    `  ${rec.type.padEnd(6)} ${rec.name.padEnd(30)} → ${rec.content}  TTL:${rec.ttl}  ${rec.proxied ? "🟠 proxied" : ""}  ID:${rec.id}`,
                )
                .join("\n");
              return `📋 DNS Records for ${domain} (${records.length}):\n\n${rows || "  (none)"}`;
            } catch {
              return `Response: ${r.stdout.slice(0, 1000)}`;
            }
          }
          if (action === "create") {
            if (!recordValue) {
              return "Error: record_value required";
            }
            const payload = JSON.stringify({
              type: recordType,
              name: recordName === "@" ? domain : `${recordName}.${domain}`,
              content: recordValue,
              ttl,
              proxied,
            });
            await sandboxWriteFile("/tmp/_dns_payload.json", payload);
            const r = await sandboxExec(
              `curl -sL -X POST ${authHeader} -d @/tmp/_dns_payload.json '${cfBase}' -m 10`,
              "/workspace",
              15,
            );
            return r.stdout.includes('"success":true')
              ? `✅ Created: ${recordType} ${recordName}.${domain} → ${recordValue}`
              : `⚠️ ${r.stdout.slice(0, 500)}`;
          }
          if (action === "update") {
            if (!recordId) {
              return "Error: record_id required for update";
            }
            const payload = JSON.stringify({
              type: recordType,
              name: recordName === "@" ? domain : `${recordName}.${domain}`,
              content: recordValue,
              ttl,
              proxied,
            });
            await sandboxWriteFile("/tmp/_dns_payload.json", payload);
            const r = await sandboxExec(
              `curl -sL -X PUT ${authHeader} -d @/tmp/_dns_payload.json '${cfBase}/${recordId}' -m 10`,
              "/workspace",
              15,
            );
            return r.stdout.includes('"success":true')
              ? `✅ Updated record ${recordId}`
              : `⚠️ ${r.stdout.slice(0, 500)}`;
          }
          if (action === "delete") {
            if (!recordId) {
              return "Error: record_id required for delete";
            }
            const r = await sandboxExec(
              `curl -sL -X DELETE ${authHeader} '${cfBase}/${recordId}' -m 10`,
              "/workspace",
              15,
            );
            return r.stdout.includes('"success":true')
              ? `🗑️ Deleted record: ${recordId}`
              : `⚠️ ${r.stdout.slice(0, 500)}`;
          }
          return "Unexpected state";
        }
        default:
          return `Unknown action: ${action}. Use: lookup, list, create, update, delete, propagation`;
      }
    },

    // ─── QR Code ─────────────────────────────────────────────────
    qr_code: async (input: ToolInput) => {
      const action = (input.action as string) || "generate";
      const data = (input.data as string) || "";
      const outPath = (input.output_path as string) || `/workspace/qr_${Date.now()}.png`;
      const imgPath = (input.image_path as string) || "";
      const size = (input.size as number) || 400;
      const _fmt = (input.format as string) || "png";

      // Ensure qrcode library
      const check = await sandboxExec(
        "python3 -c 'import qrcode; print(\"ok\")' 2>/dev/null",
        "/workspace",
        5,
      );
      if (check.exitCode !== 0) {
        await sandboxExec("pip install qrcode[pil] pyzbar 2>&1 | tail -3", "/workspace", 20);
      }

      switch (action) {
        case "generate": {
          if (!data) {
            return "Error: data required (URL, text, etc.)";
          }
          const pyScript = `import qrcode
qr = qrcode.QRCode(version=1, box_size=max(1, ${size}//37), border=4)
qr.add_data("""${data.replace(/"""/g, '\\"\\"\\"')}""")
qr.make(fit=True)
img = qr.make_image(fill_color="black", back_color="white")
img.save("${outPath}")
print(f"✅ QR code saved: ${outPath} ({${size}}px)")
print(f"Data: ${data.slice(0, 100)}")`;
          await sandboxWriteFile("/tmp/_qr.py", pyScript);
          const r = await sandboxExec("python3 /tmp/_qr.py 2>&1", "/workspace", 15);
          return r.stdout.trim() || `Error: ${r.stderr.slice(0, 500)}`;
        }
        case "read": {
          if (!imgPath) {
            return "Error: image_path required to read QR";
          }
          const pyScript = `from PIL import Image
try:
    from pyzbar.pyzbar import decode
    img = Image.open("${imgPath}")
    results = decode(img)
    if not results:
        print("❌ No QR/barcode found in image")
    else:
        for i, r in enumerate(results):
            print(f"🔍 Code {i+1}: {r.type}")
            print(f"   Data: {r.data.decode('utf-8', errors='replace')}")
            print(f"   Position: {r.rect}")
except ImportError:
    print("⚠️ pyzbar not available. Install: apt-get install libzbar0 && pip install pyzbar")`;
          await sandboxWriteFile("/tmp/_qr_read.py", pyScript);
          const r = await sandboxExec("python3 /tmp/_qr_read.py 2>&1", "/workspace", 15);
          return r.stdout.trim();
        }
        case "wifi": {
          const ssid = (input.ssid as string) || "";
          const wifiPass = (input.wifi_password as string) || "";
          const security = (input.wifi_security as string) || "WPA";
          if (!ssid) {
            return "Error: ssid required for WiFi QR";
          }
          const wifiData = `WIFI:T:${security};S:${ssid};P:${wifiPass};;`;
          const pyScript = `import qrcode
qr = qrcode.make("${wifiData}")
qr.save("${outPath}")
print(f"📶 WiFi QR saved: ${outPath}")
print(f"SSID: ${ssid} | Security: ${security}")`;
          await sandboxWriteFile("/tmp/_qr_wifi.py", pyScript);
          const r = await sandboxExec("python3 /tmp/_qr_wifi.py 2>&1", "/workspace", 10);
          return r.stdout.trim();
        }
        case "vcard": {
          const vcName = (input.vcard_name as string) || "";
          const vcPhone = (input.vcard_phone as string) || "";
          const vcEmail = (input.vcard_email as string) || "";
          if (!vcName) {
            return "Error: vcard_name required";
          }
          const vcard = `BEGIN:VCARD\\nVERSION:3.0\\nFN:${vcName}\\n${vcPhone ? `TEL:${vcPhone}\\n` : ""}${vcEmail ? `EMAIL:${vcEmail}\\n` : ""}END:VCARD`;
          const pyScript = `import qrcode
qr = qrcode.make("${vcard}")
qr.save("${outPath}")
print(f"👤 vCard QR saved: ${outPath}")
print(f"Name: ${vcName}")`;
          await sandboxWriteFile("/tmp/_qr_vc.py", pyScript);
          const r = await sandboxExec("python3 /tmp/_qr_vc.py 2>&1", "/workspace", 10);
          return r.stdout.trim();
        }
        case "batch": {
          if (!data) {
            return "Error: data required (JSON array of strings or newline-separated)";
          }
          const pyScript = `import qrcode, json, os
items = []
try:
    items = json.loads("""${data.replace(/"""/g, '\\"\\"\\"')}""")
except:
    items = """${data.replace(/"""/g, '\\"\\"\\"')}""".strip().split("\\n")
out_dir = os.path.dirname("${outPath}") or "/workspace"
for i, item in enumerate(items[:50]):
    qr = qrcode.make(str(item))
    path = os.path.join(out_dir, f"qr_{i:03d}.png")
    qr.save(path)
print(f"✅ Generated {len(items)} QR codes in {out_dir}/")`;
          await sandboxWriteFile("/tmp/_qr_batch.py", pyScript);
          const r = await sandboxExec("python3 /tmp/_qr_batch.py 2>&1", "/workspace", 30);
          return r.stdout.trim();
        }
        default:
          return `Unknown action: ${action}. Use: generate, read, wifi, vcard, batch`;
      }
    },

    // ─── Workflow Chain ──────────────────────────────────────────
    workflow_chain: async (input: ToolInput) => {
      const stepsJson = (input.steps as string) || "[]";
      const stopOnError = input.stop_on_error !== false;

      let steps: Array<{ tool: string; params: Record<string, unknown>; name?: string }>;
      try {
        steps = JSON.parse(stepsJson);
      } catch {
        return "Error: steps must be a valid JSON array of [{tool, params, name?}]";
      }

      if (!steps.length) {
        return "Error: workflow has no steps";
      }

      // Get all tool handlers for dispatch
      const allHandlers = ctx.getAllHandlers ? ctx.getAllHandlers() : {};
      const results: string[] = [];
      let hasError = false;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const stepName = step.name || `Step ${i}`;

        // Substitute {{step_N}} references in params
        const resolvedParams = { ...step.params };
        for (const [key, val] of Object.entries(resolvedParams)) {
          if (typeof val === "string") {
            let resolved = val;
            for (let j = 0; j < i; j++) {
              resolved = resolved.replace(`{{step_${j}}}`, results[j]?.slice(0, 2000) || "");
            }
            resolvedParams[key] = resolved;
          }
        }

        const handler = allHandlers[step.tool];
        if (!handler) {
          const errMsg = `❌ ${stepName}: Unknown tool "${step.tool}"`;
          results.push(errMsg);
          if (stopOnError) {
            hasError = true;
            break;
          }
          continue;
        }

        try {
          const result = await handler(resolvedParams as ToolInput);
          const resultStr = typeof result === "string" ? result : JSON.stringify(result);
          results.push(resultStr);
        } catch (err) {
          const errMsg = `❌ ${stepName}: ${(err as Error).message}`;
          results.push(errMsg);
          if (stopOnError) {
            hasError = true;
            break;
          }
        }
      }

      let output = `⛓️ Workflow: ${steps.length} steps${hasError ? " (stopped on error)" : ""}\n\n`;
      for (let i = 0; i < results.length; i++) {
        const stepName = steps[i].name || steps[i].tool;
        output += `### ${i + 1}. ${stepName}\n${results[i].slice(0, 3000)}\n\n`;
      }
      return output;
    },

    // ─── Calendar ────────────────────────────────────────────────
    calendar_manage: async (input: ToolInput) => {
      const action = (input.action as string) || "list";
      const calFile = "/workspace/.hoc-calendar.json";

      // Load calendar
      const loadCal = await sandboxExec(
        `cat '${calFile}' 2>/dev/null || echo '[]'`,
        "/workspace",
        3,
      );
      let events: Array<{
        id: string;
        title: string;
        start: string;
        end: string;
        description: string;
      }>;
      try {
        events = JSON.parse(loadCal.stdout.trim());
      } catch {
        events = [];
      }

      const saveCal = async () => {
        await sandboxWriteFile(calFile, JSON.stringify(events, null, 2));
      };

      switch (action) {
        case "create": {
          const title = (input.title as string) || "Untitled";
          const start = (input.start_time as string) || new Date().toISOString();
          const dur = (input.duration_minutes as number) || 60;
          const end =
            (input.end_time as string) ||
            new Date(new Date(start).getTime() + dur * 60000).toISOString();
          const desc = (input.description as string) || "";
          const event = { id: `evt_${Date.now()}`, title, start, end, description: desc };
          events.push(event);
          await saveCal();
          return `📅 Created: **${title}**\n  Start: ${start}\n  End: ${end}\n  ID: ${event.id}`;
        }
        case "list": {
          const daysAhead = (input.days_ahead as number) || 7;
          const now = new Date();
          const cutoff = new Date(now.getTime() + daysAhead * 86400000);
          const upcoming = events
            .filter((e) => new Date(e.start) >= now && new Date(e.start) <= cutoff)
            .toSorted((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
          if (!upcoming.length) {
            return `📅 No events in the next ${daysAhead} days`;
          }
          const rows = upcoming
            .map(
              (e) =>
                `  📌 **${e.title}** — ${e.start} → ${e.end}${e.description ? `\n     ${e.description}` : ""}\n     ID: ${e.id}`,
            )
            .join("\n\n");
          return `📅 Upcoming Events (${upcoming.length}):\n\n${rows}`;
        }
        case "today": {
          const today = new Date().toISOString().split("T")[0];
          const todayEvents = events.filter((e) => e.start.startsWith(today || ""));
          if (!todayEvents.length) {
            return "📅 No events today";
          }
          return `📅 Today's Schedule:\n\n${todayEvents.map((e) => `  ${e.start.split("T")[1]?.slice(0, 5) || ""} — **${e.title}**`).join("\n")}`;
        }
        case "delete": {
          const eventId = (input.event_id as string) || "";
          if (!eventId) {
            return "Error: event_id required";
          }
          const before = events.length;
          events = events.filter((e) => e.id !== eventId);
          if (events.length === before) {
            return `Event not found: ${eventId}`;
          }
          await saveCal();
          return `🗑️ Deleted event: ${eventId}`;
        }
        case "remind": {
          const title = (input.title as string) || "Reminder";
          const startTime = (input.start_time as string) || "";
          if (!startTime) {
            return "Error: start_time required for reminder";
          }
          const event = {
            id: `rem_${Date.now()}`,
            title: `⏰ ${title}`,
            start: startTime,
            end: startTime,
            description: "Reminder",
          };
          events.push(event);
          await saveCal();
          return `⏰ Reminder set: **${title}** at ${startTime}\n  ID: ${event.id}`;
        }
        case "free_slots": {
          const daysAhead = (input.days_ahead as number) || 1;
          const dur = (input.duration_minutes as number) || 60;
          // Simple free slot finder (9am-5pm)
          const slots: string[] = [];
          for (let d = 0; d < daysAhead; d++) {
            const date = new Date(Date.now() + d * 86400000);
            const dateStr = date.toISOString().split("T")[0] || "";
            for (let h = 9; h <= 17 - dur / 60; h++) {
              const slotStart = `${dateStr}T${h.toString().padStart(2, "0")}:00:00`;
              const slotEnd = `${dateStr}T${(h + dur / 60).toString().padStart(2, "0")}:00:00`;
              const conflict = events.some((e) => e.start < slotEnd && e.end > slotStart);
              if (!conflict) {
                slots.push(`  ✅ ${slotStart.slice(0, 16)} — ${slotEnd.slice(11, 16)}`);
              }
            }
          }
          return `📅 Free Slots (${dur}min blocks):\n\n${slots.join("\n") || "  No free slots found"}`;
        }
        default:
          return `Unknown action: ${action}. Use: list, create, delete, today, remind, free_slots`;
      }
    },

    // ─── SMS via Twilio ──────────────────────────────────────────
    sms_send: async (input: ToolInput) => {
      const to = (input.to as string) || "";
      const message = (input.message as string) || "";
      const from = (input.from as string) || "";
      if (!to || !message) {
        return "Error: to and message are required";
      }

      const sid = process.env.TWILIO_SID || "";
      const token = process.env.TWILIO_TOKEN || "";
      const fromNum = from || process.env.TWILIO_FROM || "";
      if (!sid || !token) {
        return "⚠️ Twilio not configured. Set TWILIO_SID, TWILIO_TOKEN, and TWILIO_FROM environment variables.\n\nUse secret_vault to store them securely.";
      }
      if (!fromNum) {
        return "Error: from number required (set TWILIO_FROM env var)";
      }

      const payload = `To=${encodeURIComponent(to)}&From=${encodeURIComponent(fromNum)}&Body=${encodeURIComponent(message.slice(0, 1600))}`;
      await sandboxWriteFile("/tmp/_sms_payload.txt", payload);
      const r = await sandboxExec(
        `curl -sL -X POST -u '${sid}:${token}' -d @/tmp/_sms_payload.txt 'https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json' -m 15`,
        "/workspace",
        20,
      );
      await sandboxExec("rm -f /tmp/_sms_payload.txt", "/workspace", 3);

      if (r.stdout.includes('"sid"')) {
        try {
          const data = JSON.parse(r.stdout);
          return `📱 SMS sent!\n  To: ${to}\n  From: ${fromNum}\n  Status: ${data.status}\n  SID: ${data.sid}`;
        } catch {
          /* fall through */
        }
      }
      return `⚠️ SMS response: ${r.stdout.slice(0, 500)}`;
    },

    // ─── OAuth 2.0 ───────────────────────────────────────────────
    oauth_flow: async (input: ToolInput) => {
      const action = (input.action as string) || "client_credentials";
      const tokenUrl = (input.token_url as string) || "";
      const clientId = (input.client_id as string) || "";
      const clientSecret = (input.client_secret as string) || "";
      const scopes = (input.scopes as string) || "";

      switch (action) {
        case "client_credentials": {
          if (!tokenUrl || !clientId || !clientSecret) {
            return "Error: token_url, client_id, client_secret required";
          }
          const payload = `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}${scopes ? `&scope=${encodeURIComponent(scopes)}` : ""}`;
          await sandboxWriteFile("/tmp/_oauth.txt", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d @/tmp/_oauth.txt '${tokenUrl}' -m 15`,
            "/workspace",
            20,
          );
          await sandboxExec("rm -f /tmp/_oauth.txt", "/workspace", 3);
          try {
            const data = JSON.parse(r.stdout);
            return `🔑 OAuth Token:\n  Type: ${data.token_type || "bearer"}\n  Expires: ${data.expires_in || "N/A"}s\n  Scope: ${data.scope || scopes || "N/A"}\n\n\`\`\`\n${data.access_token?.slice(0, 50)}...\n\`\`\``;
          } catch {
            return `Response: ${r.stdout.slice(0, 1000)}`;
          }
        }
        case "refresh": {
          const refreshToken = (input.refresh_token as string) || "";
          if (!tokenUrl || !refreshToken) {
            return "Error: token_url and refresh_token required";
          }
          const payload = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}${clientId ? `&client_id=${encodeURIComponent(clientId)}` : ""}${clientSecret ? `&client_secret=${encodeURIComponent(clientSecret)}` : ""}`;
          await sandboxWriteFile("/tmp/_oauth.txt", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d @/tmp/_oauth.txt '${tokenUrl}' -m 15`,
            "/workspace",
            20,
          );
          await sandboxExec("rm -f /tmp/_oauth.txt", "/workspace", 3);
          try {
            const data = JSON.parse(r.stdout);
            return `🔄 Refreshed Token:\n  Expires: ${data.expires_in}s\n  Access: ${data.access_token?.slice(0, 50)}...`;
          } catch {
            return `Response: ${r.stdout.slice(0, 1000)}`;
          }
        }
        case "token_exchange": {
          const authCode = (input.auth_code as string) || "";
          const redirectUri = (input.redirect_uri as string) || "";
          if (!tokenUrl || !authCode || !clientId) {
            return "Error: token_url, auth_code, client_id required";
          }
          const payload = `grant_type=authorization_code&code=${encodeURIComponent(authCode)}&client_id=${encodeURIComponent(clientId)}${clientSecret ? `&client_secret=${encodeURIComponent(clientSecret)}` : ""}${redirectUri ? `&redirect_uri=${encodeURIComponent(redirectUri)}` : ""}`;
          await sandboxWriteFile("/tmp/_oauth.txt", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d @/tmp/_oauth.txt '${tokenUrl}' -m 15`,
            "/workspace",
            20,
          );
          await sandboxExec("rm -f /tmp/_oauth.txt", "/workspace", 3);
          try {
            const data = JSON.parse(r.stdout);
            return `🔑 Token Exchange:\n  Access: ${data.access_token?.slice(0, 50)}...\n  Refresh: ${data.refresh_token ? "present" : "none"}\n  Expires: ${data.expires_in}s`;
          } catch {
            return `Response: ${r.stdout.slice(0, 1000)}`;
          }
        }
        case "device_code": {
          const deviceUrl = (input.device_code_url as string) || "";
          if (!deviceUrl || !clientId) {
            return "Error: device_code_url and client_id required";
          }
          const payload = `client_id=${encodeURIComponent(clientId)}${scopes ? `&scope=${encodeURIComponent(scopes)}` : ""}`;
          await sandboxWriteFile("/tmp/_oauth.txt", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d @/tmp/_oauth.txt '${deviceUrl}' -m 15`,
            "/workspace",
            20,
          );
          await sandboxExec("rm -f /tmp/_oauth.txt", "/workspace", 3);
          try {
            const data = JSON.parse(r.stdout);
            return `📱 Device Authorization:\n  User code: **${data.user_code}**\n  Verify URL: ${data.verification_uri}\n  Expires: ${data.expires_in}s\n  Interval: ${data.interval}s\n\n  Device code: ${data.device_code?.slice(0, 30)}...`;
          } catch {
            return `Response: ${r.stdout.slice(0, 1000)}`;
          }
        }
        case "introspect": {
          const token = (input.auth_token as string) || "";
          if (!tokenUrl || !token) {
            return "Error: token_url and auth_token required";
          }
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/x-www-form-urlencoded' -d 'token=${token}${clientId ? `&client_id=${clientId}` : ""}${clientSecret ? `&client_secret=${clientSecret}` : ""}' '${tokenUrl}' -m 15`,
            "/workspace",
            20,
          );
          return `🔍 Token Introspection:\n\n\`\`\`json\n${r.stdout.slice(0, 3000)}\n\`\`\``;
        }
        default:
          return `Unknown action: ${action}. Use: client_credentials, device_code, refresh, introspect, token_exchange`;
      }
    },

    // ─── Model Serve ─────────────────────────────────────────────
    model_serve: async (input: ToolInput) => {
      const action = (input.action as string) || "list";
      const modelName = (input.model as string) || "";
      const runtime = (input.runtime as string) || "ollama";
      const _port = (input.port as number) || 8000;
      const inputData = (input.input as string) || "";

      switch (action) {
        case "list": {
          const ollamaList = await sandboxExec(
            "curl -s http://host.docker.internal:11434/api/tags 2>/dev/null || echo '{}'",
            "/workspace",
            10,
          );
          try {
            const data = JSON.parse(ollamaList.stdout);
            const models = data.models || [];
            if (!models.length) {
              return "📦 No models currently loaded. Use model_serve start to deploy.";
            }
            return `📦 Running Models:\n\n${(models as Array<{ name: string; size: number }>).map((m) => `  🤖 ${m.name} (${(m.size / 1e9).toFixed(1)}GB)`).join("\n")}`;
          } catch {
            return "📦 Ollama not reachable. Check if running.";
          }
        }
        case "start": {
          if (!modelName) {
            return "Error: model required";
          }
          if (runtime === "ollama") {
            const r = await sandboxExec(
              `curl -s -X POST http://host.docker.internal:11434/api/pull -d '{"name":"${modelName}"}' 2>&1`,
              "/workspace",
              300,
            );
            return `🚀 Model pull: ${modelName} (Ollama)\n\n${r.stdout.includes("success") ? "✅ Ready" : r.stdout.slice(0, 1000)}`;
          }
          return `⚠️ Runtime ${runtime} requires Docker container setup. Use container_manage tool.`;
        }
        case "stop": {
          if (!modelName) {
            return "Error: model required";
          }
          const r = await sandboxExec(
            `curl -s -X DELETE http://host.docker.internal:11434/api/delete -d '{"name":"${modelName}"}' 2>&1`,
            "/workspace",
            30,
          );
          return `🛑 Stopped: ${modelName}\n${r.stdout.slice(0, 300)}`;
        }
        case "status": {
          const r = await sandboxExec(
            "curl -s http://host.docker.internal:11434/api/ps 2>/dev/null || echo '{}'",
            "/workspace",
            10,
          );
          return `📊 Model Status:\n\n\`\`\`json\n${r.stdout.slice(0, 3000)}\n\`\`\``;
        }
        case "predict": {
          if (!modelName || !inputData) {
            return "Error: model and input required";
          }
          const payload = JSON.stringify({ model: modelName, prompt: inputData, stream: false });
          await sandboxWriteFile("/tmp/_model_predict.json", payload);
          const r = await sandboxExec(
            `curl -s -X POST http://host.docker.internal:11434/api/generate -d @/tmp/_model_predict.json -m 120 2>&1`,
            "/workspace",
            130,
          );
          try {
            const data = JSON.parse(r.stdout);
            return `🤖 ${modelName}:\n\n${data.response?.slice(0, 8000) || r.stdout.slice(0, 3000)}`;
          } catch {
            return `Response: ${r.stdout.slice(0, 3000)}`;
          }
        }
        default:
          return `Unknown action: ${action}. Use: start, stop, status, predict, list`;
      }
    },

    // ─── Screen Record ───────────────────────────────────────────
    screen_record: async (input: ToolInput) => {
      const action = (input.action as string) || "screenshot_sequence";
      const url = (input.url as string) || "";
      const outPath = (input.output_path as string) || `/workspace/recording_${Date.now()}.mp4`;
      const duration = (input.duration as number) || 10;
      const width = (input.width as number) || 1280;
      const height = (input.height as number) || 720;
      const fps = (input.fps as number) || 15;

      switch (action) {
        case "screenshot_sequence": {
          if (!url) {
            return "Error: url required";
          }
          const _stepsJson = (input.steps as string) || "[]";
          // Use Chromium headless for screenshots
          const pyScript = `import subprocess, time, os
out_dir = os.path.dirname("${outPath}") or "/workspace"
os.makedirs(out_dir, exist_ok=True)
# Take screenshots using chromium headless
for i in range(${Math.min(duration, 20)}):
    out_file = os.path.join(out_dir, f"screen_{i:03d}.png")
    subprocess.run(["chromium-browser", "--headless", "--disable-gpu",
        f"--window-size=${width},${height}", f"--screenshot={out_file}", "${url}"],
        capture_output=True, timeout=15)
    time.sleep(1)
    print(f"📸 Frame {i+1}")
# Compile to GIF if ffmpeg available
gif_out = "${outPath}".replace(".mp4", ".gif")
subprocess.run(["ffmpeg", "-y", "-framerate", "2", "-i", os.path.join(out_dir, "screen_%03d.png"),
    "-vf", f"scale=${width}:-1", gif_out], capture_output=True)
print(f"\\n✅ Saved: {gif_out}")`;
          await sandboxWriteFile("/tmp/_screen_rec.py", pyScript);
          const r = await sandboxExec("python3 /tmp/_screen_rec.py 2>&1", "/workspace", 120);
          return r.stdout.trim() || `Error: ${r.stderr.slice(0, 500)}`;
        }
        case "gif": {
          if (!url) {
            return "Error: url required";
          }
          // Single-shot screenshot to GIF-like
          const gifOut = outPath.replace(/\.[^.]+$/, ".png");
          const r = await sandboxExec(
            `chromium-browser --headless --disable-gpu --window-size=${width},${height} --screenshot='${gifOut}' '${url}' 2>&1`,
            "/workspace",
            30,
          );
          return r.exitCode === 0 ? `🎬 Screenshot: ${gifOut}` : `⚠️ ${r.stdout.slice(0, 500)}`;
        }
        case "start": {
          if (!url) {
            return "Error: url required to start recording";
          }
          // Use Xvfb + ffmpeg for screen recording
          await sandboxExec(`Xvfb :99 -screen 0 ${width}x${height}x24 &`, "/workspace", 3);
          await sandboxExec(
            `DISPLAY=:99 ffmpeg -y -f x11grab -video_size ${width}x${height} -framerate ${fps} -i :99 -t ${duration} '${outPath}' &`,
            "/workspace",
            3,
          );
          await sandboxExec(
            `DISPLAY=:99 chromium-browser --no-sandbox --disable-gpu '${url}' &`,
            "/workspace",
            5,
          );
          return `🎥 Recording started: ${url} → ${outPath} (${duration}s, ${fps}fps)`;
        }
        case "stop": {
          await sandboxExec("pkill -f ffmpeg; pkill -f chromium; pkill -f Xvfb", "/workspace", 5);
          return `🛑 Recording stopped. Output: ${outPath}`;
        }
        default:
          return `Unknown action: ${action}. Use: start, stop, screenshot_sequence, gif`;
      }
    },

    // ─── Diagram Generate ────────────────────────────────────────
    diagram_generate: async (input: ToolInput) => {
      const source = (input.source as string) || "";
      if (!source) {
        return "Error: source (diagram code) required";
      }
      const fmt = (input.format as string) || "mermaid";
      const outPath = (input.output_path as string) || `/workspace/diagram_${Date.now()}.png`;
      const outFmt = (input.output_format as string) || "png";
      const theme = (input.theme as string) || "default";

      // Write source to temp file
      await sandboxWriteFile("/tmp/_diagram_src.txt", source);

      switch (fmt) {
        case "mermaid": {
          // Check for mmdc (mermaid CLI)
          const checkMmdc = await sandboxExec(
            "which mmdc 2>/dev/null || which npx 2>/dev/null",
            "/workspace",
            5,
          );
          if (checkMmdc.stdout.includes("mmdc")) {
            const r = await sandboxExec(
              `mmdc -i /tmp/_diagram_src.txt -o '${outPath}' -t ${theme} -b transparent 2>&1`,
              "/workspace",
              30,
            );
            return r.exitCode === 0
              ? `📊 Mermaid diagram: ${outPath}`
              : `⚠️ ${r.stdout.slice(0, 500)}`;
          }
          // Fallback: npx
          const r = await sandboxExec(
            `npx -y @mermaid-js/mermaid-cli mmdc -i /tmp/_diagram_src.txt -o '${outPath}' -t ${theme} 2>&1`,
            "/workspace",
            60,
          );
          return r.exitCode === 0
            ? `📊 Mermaid diagram: ${outPath}`
            : `⚠️ ${r.stdout.slice(0, 500)}\n\nSource saved to /tmp/_diagram_src.txt`;
        }
        case "dot":
        case "graphviz": {
          const r = await sandboxExec(
            `dot -T${outFmt} /tmp/_diagram_src.txt -o '${outPath}' 2>&1`,
            "/workspace",
            15,
          );
          return r.exitCode === 0
            ? `📊 Graphviz diagram: ${outPath}`
            : `⚠️ Install graphviz: apt-get install graphviz\n${r.stdout.slice(0, 500)}`;
        }
        case "plantuml": {
          const r = await sandboxExec(
            `plantuml -t${outFmt} /tmp/_diagram_src.txt -o $(dirname '${outPath}') 2>&1`,
            "/workspace",
            30,
          );
          return r.exitCode === 0
            ? `📊 PlantUML diagram: ${outPath}`
            : `⚠️ Install plantuml: apt-get install plantuml\n${r.stdout.slice(0, 500)}`;
        }
        case "d2": {
          const r = await sandboxExec(
            `d2 /tmp/_diagram_src.txt '${outPath}' --theme=0 2>&1`,
            "/workspace",
            30,
          );
          return r.exitCode === 0
            ? `📊 D2 diagram: ${outPath}`
            : `⚠️ Install d2: curl -fsSL https://d2lang.com/install.sh | sh\n${r.stdout.slice(0, 500)}`;
        }
        default:
          return `Unknown format: ${fmt}. Use: mermaid, plantuml, d2, dot`;
      }
    },

    // ─── Env Sync ────────────────────────────────────────────────
    env_sync: async (input: ToolInput) => {
      const action = (input.action as string) || "template";
      const envFile = (input.env_file as string) || "/workspace/.env";
      const platformName = (input.platform as string) || "";
      const projName = (input.project_name as string) || "";
      const templateFile = (input.template_file as string) || "";
      const mergeFiles = (input.files as string) || "";
      // const env = (input.environment as string) || "production";

      switch (action) {
        case "template": {
          // Generate .env.example from current .env
          const r = await sandboxExec(`cat '${envFile}' 2>/dev/null`, "/workspace", 5);
          if (!r.stdout.trim()) {
            return `⚠️ No .env file found at ${envFile}`;
          }
          const lines = r.stdout
            .split("\n")
            .map((l) => {
              if (l.startsWith("#") || !l.includes("=")) {
                return l;
              }
              const [k] = l.split("=");
              return `${k}=`;
            })
            .join("\n");
          const outPath = envFile.replace(".env", ".env.example");
          await sandboxWriteFile(outPath, lines);
          return `📝 Generated template: ${outPath}\n\n\`\`\`\n${lines.slice(0, 3000)}\n\`\`\``;
        }
        case "validate": {
          if (!templateFile) {
            return "Error: template_file required (the .env.example to validate against)";
          }
          const envR = await sandboxExec(`cat '${envFile}' 2>/dev/null`, "/workspace", 5);
          const tplR = await sandboxExec(`cat '${templateFile}' 2>/dev/null`, "/workspace", 5);
          if (!envR.stdout.trim()) {
            return `Missing: ${envFile}`;
          }
          const envKeys = new Set(
            envR.stdout
              .split("\n")
              .filter((l) => l.includes("=") && !l.startsWith("#"))
              .map((l) => l.split("=")[0]?.trim()),
          );
          const tplKeys = tplR.stdout
            .split("\n")
            .filter((l) => l.includes("=") && !l.startsWith("#"))
            .map((l) => l.split("=")[0]?.trim());
          const missing = tplKeys.filter((k) => k && !envKeys.has(k));
          const extra = [...envKeys].filter((k) => !tplKeys.includes(k ?? ""));
          let result = `✅ Env Validation: ${envFile} vs ${templateFile}\n\n`;
          if (missing.length) {
            result += `❌ Missing (${missing.length}):\n${missing.map((k) => `  - ${k}`).join("\n")}\n\n`;
          }
          if (extra.length) {
            result += `ℹ️ Extra (${extra.length}):\n${extra.map((k) => `  - ${k}`).join("\n")}\n\n`;
          }
          if (!missing.length && !extra.length) {
            result += "✅ All keys match!";
          }
          return result;
        }
        case "diff": {
          if (!platformName) {
            return "Error: platform required for diff";
          }
          return `⚠️ Cloud diff requires platform CLI (vercel, railway, fly). Run manually:\n  ${platformName} env pull --env=production > /tmp/remote.env\n  diff ${envFile} /tmp/remote.env`;
        }
        case "pull": {
          if (!platformName) {
            return "Error: platform required";
          }
          const cmdMap: Record<string, string> = {
            vercel: `vercel env pull ${envFile} ${projName ? `--project=${projName}` : ""}`,
            railway: `railway variables --json > /tmp/_vars.json && python3 -c "import json; d=json.load(open('/tmp/_vars.json')); f=open('${envFile}','w'); [f.write(f'{k}={v}\\n') for k,v in d.items()]"`,
            fly: `fly secrets list --json ${projName ? `--app=${projName}` : ""} | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'{s["Name"]}=') for s in d]" > ${envFile}`,
            heroku: `heroku config --json ${projName ? `--app=${projName}` : ""} | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f'{k}={v}') for k,v in d.items()]" > ${envFile}`,
          };
          const cmd = cmdMap[platformName];
          if (!cmd) {
            return `Unknown platform: ${platformName}. Use: vercel, railway, fly, heroku`;
          }
          const r = await sandboxExec(`${cmd} 2>&1`, "/workspace", 30);
          return r.exitCode === 0
            ? `📥 Pulled env vars → ${envFile}`
            : `⚠️ ${r.stdout.slice(0, 500)}`;
        }
        case "push": {
          if (!platformName) {
            return "Error: platform required";
          }
          return `⚠️ Push is destructive. Run manually:\n  ${platformName === "vercel" ? `vercel env add < ${envFile}` : `${platformName} variables set $(cat ${envFile} | xargs)`}`;
        }
        case "merge": {
          if (!mergeFiles) {
            return "Error: files required (comma-separated .env files)";
          }
          const fileList = mergeFiles.split(",").map((f) => f.trim());
          const merged: Record<string, string> = {};
          for (const f of fileList) {
            const r = await sandboxExec(`cat '${f}' 2>/dev/null`, "/workspace", 5);
            for (const line of r.stdout.split("\n")) {
              if (line.includes("=") && !line.startsWith("#")) {
                const eqIdx = line.indexOf("=");
                const k = line.slice(0, eqIdx).trim();
                const v = line.slice(eqIdx + 1).trim();
                if (k) {
                  merged[k] = v;
                }
              }
            }
          }
          const content = Object.entries(merged)
            .toSorted(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join("\n");
          await sandboxWriteFile(envFile, content);
          return `✅ Merged ${fileList.length} files → ${envFile} (${Object.keys(merged).length} vars)`;
        }
        default:
          return `Unknown action: ${action}. Use: pull, push, diff, template, validate, merge`;
      }
    },
  };
}

export const extendedToolsSummary: ToolSummaryMap = {
  ssh_remote: (input) => `🖥️ SSH: ${input.action ?? "exec"} ${input.host ?? ""}`,
  dns_manage: (input) => `🌐 DNS: ${input.action ?? "lookup"} ${input.domain ?? ""}`,
  qr_code: (input) =>
    `📱 QR: ${input.action ?? "generate"} ${((input.data as string) ?? "").slice(0, 30)}`,
  workflow_chain: (input) => `⛓️ Workflow: ${input.steps ? "chain" : "empty"}`,
  calendar_manage: (input) => `📅 Calendar: ${input.action ?? "list"}`,
  sms_send: (input) => `📱 SMS → ${input.to ?? "?"}`,
  oauth_flow: (input) => `🔑 OAuth: ${input.action ?? "client_credentials"}`,
  model_serve: (input) => `🤖 Model: ${input.action ?? "list"} ${input.model ?? ""}`,
  screen_record: (input) => `🎬 Record: ${input.action ?? "screenshot"} ${input.url ?? ""}`,
  diagram_generate: (input) =>
    `📊 Diagram: ${input.format ?? "mermaid"} → ${input.output_path ?? ""}`,
  env_sync: (input) => `🔄 Env: ${input.action ?? "template"} ${input.platform ?? ""}`,
};
