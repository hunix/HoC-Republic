/**
 * Automation Tools — HTTP, scheduling, notifications, spreadsheets, audio, secrets
 * Handles: http_request, cron_schedule, notification_send, spreadsheet, audio_process, secret_vault
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createAutomationToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    // ─── P0: Raw HTTP Client ──────────────────────────────────────
    http_request: async (input: ToolInput) => {
      const url = (input.url as string) || "";
      if (!url) {
        return "Error: url is required";
      }

      const method = ((input.method as string) || "GET").toUpperCase();
      const rawHeaders = (input.headers as string) || "{}";
      const body = (input.body as string) || "";
      const contentType = (input.content_type as string) || "json";
      const authType = (input.auth_type as string) || "";
      const authToken = (input.auth_token as string) || "";
      const timeout = Math.min((input.timeout_seconds as number) || 30, 120);
      const followRedirects = input.follow_redirects !== false;
      const saveTo = (input.save_to as string) || "";

      // Build curl command with proper flags
      const curlParts = [
        "curl",
        "-sS",
        "-w",
        "'\\n---HTTP_STATUS:%{http_code}---\\n---CONTENT_TYPE:%{content_type}---'",
      ];
      curlParts.push(`-X ${method}`);
      curlParts.push(`--max-time ${timeout}`);
      if (!followRedirects) {
        curlParts.push("--max-redirs 0");
      } else {
        curlParts.push("-L");
      }

      // Content-Type mapping
      const ctMap: Record<string, string> = {
        json: "application/json",
        form: "application/x-www-form-urlencoded",
        text: "text/plain",
        xml: "application/xml",
        multipart: "multipart/form-data",
      };
      if (body) {
        curlParts.push(`-H 'Content-Type: ${ctMap[contentType] || contentType}'`);
        // Write body to temp file to avoid shell escaping issues
        await sandboxWriteFile("/tmp/_http_body.txt", body);
        curlParts.push("-d @/tmp/_http_body.txt");
      }

      // Auth
      if (authType && authToken) {
        switch (authType.toLowerCase()) {
          case "bearer":
            curlParts.push(`-H 'Authorization: Bearer ${authToken}'`);
            break;
          case "basic":
            curlParts.push(`-u '${authToken}'`);
            break;
          case "api-key":
          case "apikey":
            curlParts.push(`-H 'X-API-Key: ${authToken}'`);
            break;
        }
      }

      // Custom headers
      try {
        const parsed = JSON.parse(rawHeaders) as Record<string, string>;
        for (const [k, v] of Object.entries(parsed)) {
          curlParts.push(`-H '${k}: ${v}'`);
        }
      } catch {
        /* invalid JSON — skip custom headers */
      }

      if (saveTo) {
        curlParts.push(`-o '${saveTo}'`);
      }

      curlParts.push(`'${url}'`);

      const result = await sandboxExec(curlParts.join(" ") + " 2>&1", "/workspace", timeout + 5);
      const output = result.stdout;

      // Parse status code from -w output
      const statusMatch = output.match(/---HTTP_STATUS:(\d+)---/);
      const ctMatch = output.match(/---CONTENT_TYPE:([^-]*)---/);
      const status = statusMatch ? parseInt(statusMatch[1]) : 0;
      const respCt = ctMatch ? ctMatch[1].trim() : "";
      const bodyContent = output
        .replace(/\n---HTTP_STATUS:\d+---\n---CONTENT_TYPE:[^-]*---\s*$/, "")
        .trim();

      // Try JSON formatting
      let formattedBody = bodyContent;
      if (respCt.includes("json") || bodyContent.startsWith("{") || bodyContent.startsWith("[")) {
        try {
          formattedBody =
            "```json\n" + JSON.stringify(JSON.parse(bodyContent), null, 2).slice(0, 8000) + "\n```";
        } catch {
          /* not JSON */
        }
      }

      const statusEmoji = status >= 200 && status < 300 ? "✅" : status >= 400 ? "❌" : "⚠️";
      let response = `${statusEmoji} **${method} ${url}**\n\n**Status**: ${status}`;
      if (respCt) {
        response += `\n**Content-Type**: ${respCt}`;
      }
      if (saveTo) {
        response += `\n\n📁 Response saved to: ${saveTo}`;
      } else {
        response += `\n\n**Response Body**:\n${formattedBody.slice(0, 10000)}`;
      }
      return response;
    },

    // ─── P0: Scheduled Task Management ────────────────────────────
    cron_schedule: async (input: ToolInput) => {
      const action = (input.action as string) || "list";
      const taskName = (input.task_name as string) || "";
      const schedule = (input.schedule as string) || "";
      const command = (input.command as string) || "";
      const rpcMethod = (input.rpc_method as string) || "";
      const rpcParams = (input.rpc_params as string) || "{}";
      const taskId = (input.task_id as string) || "";

      // Use gateway's cron RPC for persistent, restart-safe scheduling
      const gatewayRpc = async (method: string, params: Record<string, unknown> = {}) => {
        const payload = JSON.stringify({ method, params });
        await sandboxWriteFile("/tmp/_cron_rpc.json", payload);
        const r = await sandboxExec(
          `curl -sL -X POST -H 'Content-Type: application/json' -d @/tmp/_cron_rpc.json 'http://host.docker.internal:3000/rpc' -m 15`,
          "/workspace",
          20,
        );
        return r.stdout;
      };

      switch (action) {
        case "list": {
          const result = await gatewayRpc("cron.list");
          try {
            const data = JSON.parse(result);
            if (!data.items?.length) {
              return "📋 No scheduled tasks found.";
            }
            const rows = (
              data.items as Array<{
                id: string;
                name: string;
                schedule: string;
                enabled: boolean;
                lastRun?: string;
              }>
            )
              .map(
                (t) =>
                  `${t.enabled ? "🟢" : "🔴"} **${t.name}** | \`${t.schedule}\` | ID: \`${t.id}\`${t.lastRun ? ` | Last: ${t.lastRun}` : ""}`,
              )
              .join("\n");
            return `📋 **Scheduled Tasks** (${data.items.length})\n\n${rows}`;
          } catch {
            return `📋 Cron tasks:\n${result.slice(0, 3000)}`;
          }
        }
        case "create": {
          if (!taskName) {
            return "Error: task_name required";
          }
          if (!schedule) {
            return "Error: schedule required (cron expression or human-readable)";
          }
          if (!command && !rpcMethod) {
            return "Error: command or rpc_method required";
          }

          // Convert human-readable to cron if needed
          let cronExpr = schedule;
          const hrMap: Record<string, string> = {
            "every minute": "* * * * *",
            "every 5 minutes": "*/5 * * * *",
            "every 10 minutes": "*/10 * * * *",
            "every 15 minutes": "*/15 * * * *",
            "every 30 minutes": "*/30 * * * *",
            "every hour": "0 * * * *",
            hourly: "0 * * * *",
            "every 6 hours": "0 */6 * * *",
            "every 12 hours": "0 */12 * * *",
            daily: "0 0 * * *",
            weekly: "0 0 * * 0",
            monthly: "0 0 1 * *",
          };
          const lowSched = schedule.toLowerCase().trim();
          if (hrMap[lowSched]) {
            cronExpr = hrMap[lowSched];
          }
          // "daily at HH:MM" pattern
          const atMatch = lowSched.match(/daily at (\d{1,2}):(\d{2})/);
          if (atMatch) {
            cronExpr = `${atMatch[2]} ${atMatch[1]} * * *`;
          }

          const params: Record<string, unknown> = {
            name: taskName,
            schedule: cronExpr,
            enabled: true,
          };
          if (rpcMethod) {
            params.action = "rpc";
            params.rpcMethod = rpcMethod;
            try {
              params.rpcParams = JSON.parse(rpcParams);
            } catch {
              params.rpcParams = {};
            }
          } else {
            params.action = "sandbox_exec";
            params.command = command;
          }

          const result = await gatewayRpc("cron.update", params);
          return `✅ Task scheduled!\n\n**Name**: ${taskName}\n**Schedule**: \`${cronExpr}\` (${schedule})\n**Action**: ${rpcMethod || command}\n\n${result.includes('"ok":true') ? "Saved to gateway cron." : `Response: ${result.slice(0, 500)}`}`;
        }
        case "delete": {
          if (!taskId && !taskName) {
            return "Error: task_id or task_name required";
          }
          const result = await gatewayRpc("cron.remove", { id: taskId || taskName });
          return `🗑️ Task ${taskId || taskName} deleted.\n${result.slice(0, 300)}`;
        }
        case "pause": {
          if (!taskId && !taskName) {
            return "Error: task_id or task_name required";
          }
          const result = await gatewayRpc("cron.update", {
            id: taskId || taskName,
            enabled: false,
          });
          return `⏸️ Task paused: ${taskId || taskName}\n${result.slice(0, 300)}`;
        }
        case "resume": {
          if (!taskId && !taskName) {
            return "Error: task_id or task_name required";
          }
          const result = await gatewayRpc("cron.update", { id: taskId || taskName, enabled: true });
          return `▶️ Task resumed: ${taskId || taskName}\n${result.slice(0, 300)}`;
        }
        case "run_once": {
          if (!command && !rpcMethod) {
            return "Error: command or rpc_method required";
          }
          if (rpcMethod) {
            let params = {};
            try {
              params = JSON.parse(rpcParams);
            } catch {
              /* empty */
            }
            const result = await gatewayRpc(rpcMethod, params);
            return `⚡ One-shot RPC: ${rpcMethod}\n\n${result.slice(0, 5000)}`;
          }
          const result = await sandboxExec(command, "/workspace", 120);
          return `⚡ One-shot command executed:\n\`\`\`\n${result.stdout.slice(0, 5000)}\n\`\`\``;
        }
        case "history": {
          const result = await gatewayRpc("cron.list");
          try {
            const data = JSON.parse(result);
            const task = (
              data.items as Array<{
                id: string;
                name: string;
                lastRun?: string;
                lastResult?: string;
              }>
            )?.find(
              (t: { id: string; name: string }) =>
                t.id === taskId || t.name === taskId || t.name === taskName,
            );
            if (!task) {
              return `No task found with ID/name: ${taskId || taskName}`;
            }
            return `📊 Task History: **${task.name}**\n\nLast run: ${task.lastRun ?? "never"}\nLast result: ${task.lastResult ?? "N/A"}`;
          } catch {
            return `History: ${result.slice(0, 2000)}`;
          }
        }
        default:
          return `Unknown cron action: ${action}. Use: create, list, delete, pause, resume, run_once, history`;
      }
    },

    // ─── P0: Multi-Channel Notifications ──────────────────────────
    notification_send: async (input: ToolInput) => {
      const channel = (input.channel as string) || "";
      const message = (input.message as string) || "";
      if (!channel) {
        return "Error: channel is required";
      }
      if (!message) {
        return "Error: message is required";
      }

      const title = (input.title as string) || "";
      const webhookUrl = (input.webhook_url as string) || "";
      const chatId = (input.chat_id as string) || "";
      const priority = (input.priority as string) || "normal";
      const imageUrl = (input.image_url as string) || "";

      switch (channel) {
        case "telegram": {
          const token = process.env.TELEGRAM_BOT_TOKEN || "";
          const cid = chatId || process.env.TELEGRAM_CHAT_ID || "";
          if (!token || !cid) {
            return `⚠️ Telegram not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.\n\nOr provide chat_id parameter.`;
          }
          const text = title ? `*${title}*\n\n${message}` : message;
          const payload = JSON.stringify({ chat_id: cid, text, parse_mode: "Markdown" });
          await sandboxWriteFile("/tmp/_tg_msg.json", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d @/tmp/_tg_msg.json 'https://api.telegram.org/bot${token}/sendMessage' -m 10`,
            "/workspace",
            15,
          );
          if (imageUrl) {
            const imgPayload = JSON.stringify({ chat_id: cid, photo: imageUrl });
            await sandboxWriteFile("/tmp/_tg_img.json", imgPayload);
            await sandboxExec(
              `curl -sL -X POST -H 'Content-Type: application/json' -d @/tmp/_tg_img.json 'https://api.telegram.org/bot${token}/sendPhoto' -m 10`,
              "/workspace",
              15,
            );
          }
          return r.stdout.includes('"ok":true')
            ? `✅ Sent to Telegram (chat ${cid})`
            : `⚠️ Telegram response: ${r.stdout.slice(0, 500)}`;
        }
        case "discord": {
          if (!webhookUrl) {
            return "Error: webhook_url required for Discord";
          }
          const payload = JSON.stringify({
            content: message.slice(0, 2000),
            embeds: title
              ? [
                  {
                    title,
                    description: message.slice(0, 4096),
                    color:
                      priority === "urgent" ? 0xff0000 : priority === "high" ? 0xffa500 : 0x3498db,
                    ...(imageUrl ? { image: { url: imageUrl } } : {}),
                  },
                ]
              : [],
          });
          await sandboxWriteFile("/tmp/_dc_msg.json", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d @/tmp/_dc_msg.json '${webhookUrl}' -m 10`,
            "/workspace",
            15,
          );
          return r.stdout.trim() === "" || r.stdout.includes('"id"')
            ? "✅ Sent to Discord"
            : `⚠️ Discord response: ${r.stdout.slice(0, 500)}`;
        }
        case "slack": {
          if (!webhookUrl) {
            return "Error: webhook_url required for Slack";
          }
          const blocks = [
            ...(title ? [{ type: "header", text: { type: "plain_text", text: title } }] : []),
            { type: "section", text: { type: "mrkdwn", text: message.slice(0, 3000) } },
            ...(imageUrl
              ? [{ type: "image", image_url: imageUrl, alt_text: title || "image" }]
              : []),
          ];
          const payload = JSON.stringify({ blocks });
          await sandboxWriteFile("/tmp/_sl_msg.json", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d @/tmp/_sl_msg.json '${webhookUrl}' -m 10`,
            "/workspace",
            15,
          );
          return r.stdout.trim() === "ok"
            ? "✅ Sent to Slack"
            : `⚠️ Slack response: ${r.stdout.slice(0, 500)}`;
        }
        case "webhook": {
          if (!webhookUrl) {
            return "Error: webhook_url required";
          }
          const payload = JSON.stringify({
            title,
            message,
            priority,
            timestamp: new Date().toISOString(),
            image_url: imageUrl || undefined,
          });
          await sandboxWriteFile("/tmp/_wh_msg.json", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d @/tmp/_wh_msg.json '${webhookUrl}' -m 15`,
            "/workspace",
            20,
          );
          return `✅ Webhook POST to ${webhookUrl}\n\nResponse: ${r.stdout.slice(0, 1000)}`;
        }
        case "ntfy": {
          const ntfyUrl = webhookUrl || "https://ntfy.sh/hoc-agent";
          const prioMap: Record<string, string> = { low: "2", normal: "3", high: "4", urgent: "5" };
          const headers = [`-H 'Priority: ${prioMap[priority] || "3"}'`];
          if (title) {
            headers.push(`-H 'Title: ${title}'`);
          }
          if (imageUrl) {
            headers.push(`-H 'Attach: ${imageUrl}'`);
          }
          const r = await sandboxExec(
            `curl -sL -X POST ${headers.join(" ")} -d '${message.replace(/'/g, "'\\''")}' '${ntfyUrl}' -m 10`,
            "/workspace",
            15,
          );
          return r.stdout.includes('"id"')
            ? `✅ Pushed to ntfy (${ntfyUrl})`
            : `⚠️ ntfy response: ${r.stdout.slice(0, 500)}`;
        }
        case "desktop": {
          // Send via gateway RPC which has access to Windows APIs
          const payload = JSON.stringify({
            method: "system.notify",
            params: { title: title || "HoC Agent", message, priority },
          });
          await sandboxWriteFile("/tmp/_desk_msg.json", payload);
          const r = await sandboxExec(
            `curl -sL -X POST -H 'Content-Type: application/json' -d @/tmp/_desk_msg.json 'http://host.docker.internal:3000/rpc' -m 5`,
            "/workspace",
            10,
          );
          return `🖥️ Desktop notification sent: ${title || "(untitled)"}\n${r.stdout.includes('"ok"') ? "✅ Displayed" : `Response: ${r.stdout.slice(0, 300)}`}`;
        }
        default:
          return `Unknown channel: ${channel}. Use: telegram, discord, slack, webhook, ntfy, desktop`;
      }
    },

    // ─── P1: Spreadsheet/CSV Processing ───────────────────────────
    spreadsheet: async (input: ToolInput) => {
      const action = (input.action as string) || "read";
      const filePath = (input.file_path as string) || "";
      const query = (input.query as string) || "";
      const columns = (input.columns as string) || "";
      const outputPath = (input.output_path as string) || "";
      const outputFmt = (input.output_format as string) || "csv";
      const chartType = (input.chart_type as string) || "bar";
      const xCol = (input.x_col as string) || "";
      const yCol = (input.y_col as string) || "";
      const sheetName = (input.sheet_name as string) || "";
      const headN = (input.head as number) || 20;

      // Ensure pandas is available
      const checkPandas = await sandboxExec(
        "python3 -c 'import pandas; print(pandas.__version__)' 2>/dev/null",
        "/workspace",
        5,
      );
      if (checkPandas.exitCode !== 0) {
        await sandboxExec(
          "pip install pandas openpyxl matplotlib 2>&1 | tail -3",
          "/workspace",
          30,
        );
      }

      // Build Python script per action
      let pyScript = `import pandas as pd\nimport json, sys\n`;

      // Load data helper
      const loadSnippet = filePath
        ? (() => {
            const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
            if (ext === "csv" || ext === "tsv") {
              return `df = pd.read_csv("${filePath}"${ext === "tsv" ? ', sep="\\t"' : ""})`;
            }
            if (ext === "xlsx" || ext === "xls") {
              return `df = pd.read_excel("${filePath}"${sheetName ? `, sheet_name="${sheetName}"` : ""})`;
            }
            if (ext === "json") {
              return `df = pd.read_json("${filePath}")`;
            }
            if (ext === "parquet") {
              return `df = pd.read_parquet("${filePath}")`;
            }
            return `df = pd.read_csv("${filePath}")`; // default CSV
          })()
        : 'print("Error: file_path required"); sys.exit(1)';

      switch (action) {
        case "read":
          pyScript += `${loadSnippet}\nprint(f"Shape: {df.shape[0]} rows × {df.shape[1]} columns")\nprint(f"\\nColumns: {list(df.columns)}")\nprint(f"\\nData Types:\\n{df.dtypes}")\nprint(f"\\nFirst ${headN} rows:\\n{df.head(${headN}).to_string()}")\nprint(f"\\nNull counts:\\n{df.isnull().sum()[df.isnull().sum() > 0]}")`;
          break;
        case "query":
          if (!query) {
            return "Error: query required for query action";
          }
          pyScript += `${loadSnippet}\nresult = df.query("${query.replace(/"/g, '\\"')}")\nprint(f"Matched {len(result)} rows\\n")\nprint(result.head(${headN}).to_string())`;
          break;
        case "stats":
          pyScript += `${loadSnippet}\nprint("Descriptive Statistics:\\n")\nprint(df.describe(include='all').to_string())\nnumeric = df.select_dtypes(include='number')\nif len(numeric.columns) > 1:\n    print("\\n\\nCorrelation Matrix:\\n")\n    print(numeric.corr().round(3).to_string())`;
          break;
        case "transform":
          pyScript += `${loadSnippet}\n`;
          if (input.transform_ops) {
            pyScript += `ops = json.loads('${(input.transform_ops as string).replace(/'/g, "\\'")}')\nfor op in ops:\n    if op.get("op") == "dropna": df = df.dropna()\n    elif op.get("op") == "fillna": df = df.fillna(op.get("value", 0))\n    elif op.get("op") == "rename": df = df.rename(columns=op.get("columns", {}))\n    elif op.get("op") == "sort": df = df.sort_values(op.get("by", df.columns[0]), ascending=op.get("asc", True))\n    elif op.get("op") == "groupby": df = df.groupby(op.get("by")).agg(op.get("agg", "sum")).reset_index()\n`;
          }
          pyScript += `print(f"Transformed: {df.shape[0]} rows × {df.shape[1]} columns\\n")\nprint(df.head(${headN}).to_string())`;
          break;
        case "chart": {
          if (!filePath) {
            return "Error: file_path required for chart";
          }
          const out = outputPath || `/workspace/chart_${Date.now()}.png`;
          pyScript += `import matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\n${loadSnippet}\n`;
          if (chartType === "pie") {
            pyScript += `df["${xCol || "value"}"].value_counts().head(10).plot(kind="pie", autopct="%1.1f%%")\n`;
          } else if (chartType === "heatmap") {
            pyScript += `import seaborn as sns\nsns.heatmap(df.select_dtypes(include='number').corr(), annot=True, cmap='coolwarm')\n`;
          } else {
            pyScript += `df${columns ? `[${JSON.stringify(columns.split(",").map((c) => c.trim()))}]` : ""}.plot(kind="${chartType}"${xCol ? `, x="${xCol}"` : ""}${yCol ? `, y="${yCol}"` : ""}, figsize=(10, 6))\n`;
          }
          pyScript += `plt.tight_layout()\nplt.savefig("${out}", dpi=150)\nprint(f"📊 Chart saved: ${out}")`;
          break;
        }
        case "export": {
          if (!filePath) {
            return "Error: file_path required for export";
          }
          const out = outputPath || `/workspace/export_${Date.now()}.${outputFmt}`;
          pyScript += `${loadSnippet}\n`;
          if (columns) {
            pyScript += `df = df[${JSON.stringify(columns.split(",").map((c) => c.trim()))}]\n`;
          }
          const exportMap: Record<string, string> = {
            csv: `df.to_csv("${out}", index=False)`,
            xlsx: `df.to_excel("${out}", index=False)`,
            json: `df.to_json("${out}", orient="records", indent=2)`,
            parquet: `df.to_parquet("${out}", index=False)`,
          };
          pyScript += `${exportMap[outputFmt] || exportMap.csv}\nprint(f"✅ Exported {len(df)} rows to ${out}")`;
          break;
        }
        case "sql":
          if (!query) {
            return "Error: query (SQL) required for sql action";
          }
          pyScript += `${loadSnippet}\ntry:\n    from pandasql import sqldf\nexcept ImportError:\n    import subprocess\n    subprocess.run(["pip", "install", "pandasql"], capture_output=True)\n    from pandasql import sqldf\nresult = sqldf("${query.replace(/"/g, '\\"')}", {"df": df})\nprint(f"SQL returned {len(result)} rows\\n")\nprint(result.head(${headN}).to_string())`;
          break;
        default:
          return `Unknown spreadsheet action: ${action}. Use: read, query, stats, transform, chart, export, sql`;
      }

      await sandboxWriteFile("/tmp/_spreadsheet.py", pyScript);
      const result = await sandboxExec("python3 /tmp/_spreadsheet.py 2>&1", "/workspace", 120);
      return `📊 Spreadsheet (${action}):\n\n${result.stdout.slice(0, 10000)}${result.exitCode !== 0 ? `\n\n⚠️ Error: ${result.stderr.slice(0, 500)}` : ""}`;
    },

    // ─── P1: Audio Processing ─────────────────────────────────────
    audio_process: async (input: ToolInput) => {
      const action = (input.action as string) || "info";
      const inputPath = (input.input_path as string) || "";
      const outputPath = (input.output_path as string) || "";
      const fmt = (input.format as string) || "";
      const startTime = (input.start_time as string) || "0";
      const duration = (input.duration as unknown as string) || "";
      const files = (input.files as string) || "";
      const effect = (input.effect as string) || "";
      const effectVal = (input.effect_value as string) || "";
      const br = (input.bitrate as string) || "";
      const sr = (input.sample_rate as number) || 0;

      // Verify ffmpeg
      const ffCheck = await sandboxExec(
        "which ffmpeg 2>/dev/null || echo 'MISSING'",
        "/workspace",
        5,
      );
      if (ffCheck.stdout.includes("MISSING")) {
        return '❌ ffmpeg not found. Install with: `sandbox_exec command="apt-get install -y ffmpeg"`';
      }

      if (!inputPath && !["merge", "mix"].includes(action)) {
        return "Error: input_path is required";
      }

      const brFlag = br ? `-b:a ${br}` : "";
      const srFlag = sr ? `-ar ${sr}` : "";

      switch (action) {
        case "info": {
          const r = await sandboxExec(
            `ffprobe -v quiet -print_format json -show_streams -show_format '${inputPath}' 2>&1`,
            "/workspace",
            15,
          );
          try {
            const info = JSON.parse(r.stdout);
            const f = info.format || {};
            const audioStream = (info.streams || []).find(
              (s: { codec_type: string }) => s.codec_type === "audio",
            );
            return `🎵 Audio Info: ${inputPath}\n\n- Duration: ${f.duration ? `${parseFloat(f.duration).toFixed(1)}s` : "N/A"}\n- Size: ${f.size ? `${(f.size / 1048576).toFixed(1)}MB` : "N/A"}\n- Bitrate: ${f.bit_rate ? `${Math.round(f.bit_rate / 1000)}kbps` : "N/A"}\n- Codec: ${audioStream?.codec_name ?? "N/A"}\n- Sample Rate: ${audioStream?.sample_rate ?? "N/A"}Hz\n- Channels: ${audioStream?.channels ?? "N/A"}`;
          } catch {
            return `Audio info:\n${r.stdout.slice(0, 2000)}`;
          }
        }
        case "trim": {
          const out = outputPath || inputPath.replace(/\.([^.]+)$/, `_trim.$1`);
          const durFlag = duration ? `-t ${duration}` : "";
          const r = await sandboxExec(
            `ffmpeg -i '${inputPath}' -ss ${startTime} ${durFlag} -c copy '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            60,
          );
          return r.exitCode === 0
            ? `✂️ Trimmed: ${out}\nFrom: ${startTime}${duration ? `, Duration: ${duration}` : ""}`
            : `Trim failed: ${r.stdout.slice(0, 500)}`;
        }
        case "convert": {
          const outFmt = fmt || "mp3";
          const out = outputPath || inputPath.replace(/\.[^.]+$/, `.${outFmt}`);
          const r = await sandboxExec(
            `ffmpeg -i '${inputPath}' ${brFlag} ${srFlag} '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `🔄 Converted: ${out} (${outFmt})`
            : `Convert failed: ${r.stdout.slice(0, 500)}`;
        }
        case "merge": {
          if (!files) {
            return "Error: files (comma-separated paths) required for merge";
          }
          const out = outputPath || `/workspace/merged_${Date.now()}.mp3`;
          const fileList = files.split(",").map((f) => f.trim());
          const listContent = fileList.map((f) => `file '${f}'`).join("\n");
          await sandboxWriteFile("/tmp/_audio_concat.txt", listContent);
          const r = await sandboxExec(
            `ffmpeg -f concat -safe 0 -i /tmp/_audio_concat.txt -c copy '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `📎 Merged ${fileList.length} files → ${out}`
            : `Merge failed: ${r.stdout.slice(0, 500)}`;
        }
        case "normalize": {
          const out = outputPath || inputPath.replace(/\.([^.]+)$/, `_normalized.$1`);
          // Two-pass loudnorm
          const r = await sandboxExec(
            `ffmpeg -i '${inputPath}' -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary '${out}' -y 2>&1 | tail -10`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `🔊 Normalized: ${out}`
            : `Normalize failed: ${r.stdout.slice(0, 500)}`;
        }
        case "extract": {
          const out = outputPath || inputPath.replace(/\.[^.]+$/, ".mp3");
          const r = await sandboxExec(
            `ffmpeg -i '${inputPath}' -vn -acodec libmp3lame ${brFlag || "-b:a 192k"} '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `🎵 Audio extracted: ${out}`
            : `Extract failed: ${r.stdout.slice(0, 500)}`;
        }
        case "split": {
          if (!duration) {
            return "Error: duration (segment length) required for split";
          }
          const outDir = outputPath || `/workspace/audio_segments_${Date.now()}`;
          await sandboxExec(`mkdir -p '${outDir}'`, "/workspace", 5);
          const ext = inputPath.split(".").pop() || "mp3";
          const r = await sandboxExec(
            `ffmpeg -i '${inputPath}' -f segment -segment_time ${duration} -c copy '${outDir}/segment_%03d.${ext}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          const count = await sandboxExec(`ls '${outDir}' | wc -l`, "/workspace", 5);
          return r.exitCode === 0
            ? `✂️ Split into ${count.stdout.trim()} segments → ${outDir}/`
            : `Split failed: ${r.stdout.slice(0, 500)}`;
        }
        case "mix": {
          if (!files) {
            return "Error: files (2 comma-separated paths) required for mix";
          }
          const fileList = files.split(",").map((f) => f.trim());
          if (fileList.length < 2) {
            return "Error: need at least 2 files for mix";
          }
          const out = outputPath || `/workspace/mixed_${Date.now()}.mp3`;
          const r = await sandboxExec(
            `ffmpeg -i '${fileList[0]}' -i '${fileList[1]}' -filter_complex amix=inputs=2:duration=longest '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          return r.exitCode === 0 ? `🎛️ Mixed: ${out}` : `Mix failed: ${r.stdout.slice(0, 500)}`;
        }
        case "effects": {
          if (!effect) {
            return "Error: effect required (fade_in, fade_out, speed, reverse, echo, bass_boost)";
          }
          const out = outputPath || inputPath.replace(/\.([^.]+)$/, `_fx.$1`);
          const fxMap: Record<string, string> = {
            fade_in: `-af "afade=t=in:d=${effectVal || "3"}"`,
            fade_out: `-af "afade=t=out:st=0:d=${effectVal || "3"}"`,
            speed: `-af "atempo=${effectVal || "1.5"}"`,
            reverse: `-af areverse`,
            echo: `-af "aecho=0.8:0.88:60:0.4"`,
            bass_boost: `-af "bass=g=${effectVal || "10"}"`,
          };
          const fx = fxMap[effect];
          if (!fx) {
            return `Unknown effect: ${effect}. Use: fade_in, fade_out, speed, reverse, echo, bass_boost`;
          }
          const r = await sandboxExec(
            `ffmpeg -i '${inputPath}' ${fx} '${out}' -y 2>&1 | tail -5`,
            "/workspace",
            120,
          );
          return r.exitCode === 0
            ? `✨ Effect applied (${effect}): ${out}`
            : `Effect failed: ${r.stdout.slice(0, 500)}`;
        }
        case "transcribe": {
          // Try Whisper via Python
          const r = await sandboxExec(
            `python3 -c "import whisper; model = whisper.load_model('base'); result = model.transcribe('${inputPath}'); print(result['text'])" 2>&1`,
            "/workspace",
            300,
          );
          if (r.exitCode === 0 && r.stdout.trim()) {
            return `📝 Transcription:\n\n${r.stdout.slice(0, 10000)}`;
          }
          return `⚠️ Whisper not available. Install: pip install openai-whisper\n\nAttempt output: ${r.stdout.slice(0, 500)}`;
        }
        default:
          return `Unknown audio action: ${action}. Use: info, trim, convert, merge, normalize, extract, split, mix, effects, transcribe`;
      }
    },

    // ─── P1: Secret/Credential Vault ──────────────────────────────
    secret_vault: async (input: ToolInput) => {
      const action = (input.action as string) || "list";
      const key = (input.key as string) || "";
      const value = (input.value as string) || "";
      const scope = (input.scope as string) || "project";
      const envFile = (input.env_file as string) || "/workspace/.env";
      const selectedKeys = (input.keys as string) || "";

      // Vault is stored as an encrypted JSON file in the sandbox volume
      const vaultPath =
        scope === "global" ? "/workspace/.hoc-secrets-global.enc" : "/workspace/.hoc-secrets.enc";
      const vaultKey = "HoC_SecretVault_2026"; // Symmetric key for AES — not truly secure but prevents casual exposure

      // Python-based encrypted vault operations
      const vaultScript = (op: string, opKey: string, opValue: string) => `
import json, base64, hashlib, os, sys
from cryptlib import fernet  # type: ignore

# Fallback: simple XOR if cryptography not installed
try:
    from cryptography.fernet import Fernet
    vault_key = base64.urlsafe_b64encode(hashlib.sha256(b"${vaultKey}").digest())
    cipher = Fernet(vault_key)
    def encrypt(data): return cipher.encrypt(data.encode()).decode()
    def decrypt(data): return cipher.decrypt(data.encode()).decode()
except ImportError:
    # Simple base64 fallback (better than plaintext)
    def encrypt(data): return base64.b64encode(data.encode()).decode()
    def decrypt(data): return base64.b64decode(data.encode()).decode()

vault_path = "${vaultPath}"

# Load vault
try:
    with open(vault_path, "r") as f:
        vault = json.loads(decrypt(f.read().strip()))
except (FileNotFoundError, Exception):
    vault = {}

op = "${op}"
key = "${opKey}"
value = """${opValue}"""

if op == "store":
    vault[key] = value
    print(f"✅ Stored: {key} ({scope} scope)")
elif op == "retrieve":
    if key in vault:
        print(vault[key])
    else:
        print(f"❌ Key not found: {key}")
        sys.exit(1)
elif op == "list":
    if not vault:
        print("📋 Vault is empty")
    else:
        for k in sorted(vault.keys()):
            print(f"  🔑 {k} ({len(vault[k])} chars)")
elif op == "delete":
    if key in vault:
        del vault[key]
        print(f"🗑️ Deleted: {key}")
    else:
        print(f"Key not found: {key}")
elif op == "rotate":
    if key in vault:
        vault[key] = value
        print(f"🔄 Rotated: {key}")
    else:
        print(f"Key not found: {key}")

# Save vault
with open(vault_path, "w") as f:
    f.write(encrypt(json.dumps(vault)))
`;

      switch (action) {
        case "store": {
          if (!key || !value) {
            return "Error: key and value required";
          }
          await sandboxWriteFile(
            "/tmp/_vault_op.py",
            vaultScript("store", key, value.replace(/"""/g, '\\"""')),
          );
          const r = await sandboxExec("python3 /tmp/_vault_op.py 2>&1", "/workspace", 10);
          // Clean up the script to not leave the value on disk
          await sandboxExec("rm -f /tmp/_vault_op.py", "/workspace", 3);
          return r.stdout.trim() || "Stored";
        }
        case "retrieve": {
          if (!key) {
            return "Error: key required";
          }
          await sandboxWriteFile("/tmp/_vault_op.py", vaultScript("retrieve", key, ""));
          const r = await sandboxExec("python3 /tmp/_vault_op.py 2>&1", "/workspace", 10);
          await sandboxExec("rm -f /tmp/_vault_op.py", "/workspace", 3);
          return r.exitCode === 0 ? `🔓 ${key} = ${r.stdout.trim()}` : `❌ ${r.stdout.trim()}`;
        }
        case "list": {
          await sandboxWriteFile("/tmp/_vault_op.py", vaultScript("list", "", ""));
          const r = await sandboxExec("python3 /tmp/_vault_op.py 2>&1", "/workspace", 10);
          await sandboxExec("rm -f /tmp/_vault_op.py", "/workspace", 3);
          return `🔐 Secret Vault (${scope}):\n\n${r.stdout.trim()}`;
        }
        case "delete": {
          if (!key) {
            return "Error: key required";
          }
          await sandboxWriteFile("/tmp/_vault_op.py", vaultScript("delete", key, ""));
          const r = await sandboxExec("python3 /tmp/_vault_op.py 2>&1", "/workspace", 10);
          await sandboxExec("rm -f /tmp/_vault_op.py", "/workspace", 3);
          return r.stdout.trim();
        }
        case "rotate": {
          if (!key || !value) {
            return "Error: key and value required";
          }
          await sandboxWriteFile(
            "/tmp/_vault_op.py",
            vaultScript("rotate", key, value.replace(/"""/g, '\\"""')),
          );
          const r = await sandboxExec("python3 /tmp/_vault_op.py 2>&1", "/workspace", 10);
          await sandboxExec("rm -f /tmp/_vault_op.py", "/workspace", 3);
          return r.stdout.trim();
        }
        case "inject": {
          // Read vault and write selected keys to .env
          await sandboxWriteFile(
            "/tmp/_vault_inject.py",
            `
import json, base64, hashlib, os
try:
    from cryptography.fernet import Fernet
    vault_key = base64.urlsafe_b64encode(hashlib.sha256(b"${vaultKey}").digest())
    cipher = Fernet(vault_key)
    decrypt = lambda d: cipher.decrypt(d.encode()).decode()
except ImportError:
    decrypt = lambda d: base64.b64decode(d.encode()).decode()

try:
    with open("${vaultPath}", "r") as f:
        vault = json.loads(decrypt(f.read().strip()))
except:
    print("❌ Vault is empty or not found")
    exit(1)

selected = "${selectedKeys}".split(",") if "${selectedKeys}" else list(vault.keys())
selected = [k.strip() for k in selected if k.strip()]

env_path = "${envFile}"
existing = {}
try:
    with open(env_path, "r") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                existing[k] = v
except FileNotFoundError:
    pass

injected = 0
for k in selected:
    if k in vault:
        existing[k] = vault[k]
        injected += 1

with open(env_path, "w") as f:
    for k, v in sorted(existing.items()):
        f.write(f"{k}={v}\\n")

print(f"✅ Injected {injected} secrets into {env_path}")
for k in selected:
    if k in vault:
        print(f"  🔑 {k}")
`,
          );
          const r = await sandboxExec("python3 /tmp/_vault_inject.py 2>&1", "/workspace", 10);
          await sandboxExec("rm -f /tmp/_vault_inject.py", "/workspace", 3);
          return r.stdout.trim();
        }
        default:
          return `Unknown vault action: ${action}. Use: store, retrieve, list, delete, inject, rotate`;
      }
    },
  };
}

export const automationToolsSummary: ToolSummaryMap = {
  http_request: (input) =>
    `🌐 ${(input.method as string)?.toUpperCase() ?? "GET"} ${input.url ?? ""}`,
  cron_schedule: (input) =>
    `⏰ Cron: ${input.action ?? "list"}${input.task_name ? ` "${input.task_name}"` : ""}`,
  notification_send: (input) =>
    `📢 Notify: ${input.channel ?? "?"} — ${((input.message as string) ?? "").slice(0, 40)}`,
  spreadsheet: (input) => `📊 Sheet: ${input.action ?? "read"} ${input.file_path ?? ""}`,
  audio_process: (input) => `🎵 Audio: ${input.action ?? "info"} ${input.input_path ?? ""}`,
  secret_vault: (input) => `🔐 Vault: ${input.action ?? "list"}${input.key ? ` ${input.key}` : ""}`,
};
