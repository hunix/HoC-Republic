/**
 * Sandbox Tool Definitions — extended tools
 */

export const EXTENDED_TOOLS = [
  {
    name: "delegate_task",
    description: `Break a complex project into sub-tasks and delegate to specialized sandboxes.
Each sub-task runs in the most appropriate container:
• exec: General coding, file ops, app building
• playwright: Browser automation, web scraping, form filling
• comfyui: GPU-powered image/video generation via ComfyUI
• ml: Machine learning, model training, inference

Provide a JSON plan with sub-tasks, their commands, and dependencies.
Independent tasks run in PARALLEL for maximum efficiency.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_name: {
          type: "string",
          description: "Name of the project being built",
        },
        plan: {
          type: "string",
          description: `JSON plan: {"subTasks": [{"id": "t1", "title": "...", "description": "...", "commands": ["cmd1", "cmd2"], "dependsOn": ["t0"]}]}`,
        },
      },
      required: ["project_name", "plan"],
    },
  },
  {
    name: "memory_query",
    description: `Query the citizen's 6-type memory system (episodic, semantic, procedural, working, social, collective).
Returns relevant memories for the current context, including past experiences, learned facts, skills, goals, relationships, and shared knowledge.
Use this to recall past work, check what skills are available, or understand the citizen's history.`,
    input_schema: {
      type: "object" as const,
      properties: {
        citizen_id: {
          type: "string",
          description: "Citizen ID whose memory to query (default: current agent's citizen)",
        },
        activity: {
          type: "string",
          description: "Current activity context for memory retrieval",
        },
        topic: {
          type: "string",
          description: "Specific topic to fetch memories about",
        },
      },
    },
  },
  {
    name: "agent_memory",
    description: `Persistent memory that survives across conversations and container restarts.
Stored in /workspace/.hoc-agent-memory.json (Docker volume = permanent).

Actions:
• "save" — Save key-value pairs to memory (project state, preferences, summaries)
• "load" — Load all memory (auto-called at loop start)
• "append" — Append to an existing key (e.g., conversation log)
• "delete" — Delete a key
• "clear" — Clear all memory

The orchestrator auto-loads memory at the start of each conversation.
Use this to remember: projects built, user preferences, code patterns, active repos.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: save, load, append, delete, clear" },
        key: {
          type: "string",
          description: "Memory key (e.g., 'active_project', 'user_preferences')",
        },
        value: { type: "string", description: "Value to save (JSON string for complex data)" },
      },
      required: ["action"],
    },
  },
  {
    name: "knowledge_graph_query",
    description: `Search the agent's semantic knowledge graph for relevant entities, facts, and relationships
accumulated from previous sessions and interactions.

Use this tool when you need to:
• Recall information from a previous conversation or task
• Find relationships between concepts, tools, or projects
• Check if you already know something before researching
• Retrieve context about a domain, technology, or pattern

The knowledge graph combines:
- Memory Graph: entity nodes and relationship edges (spatial/semantic)
- Mem0 Facts: atomic, deduplicated factual statements
- Republic Knowledge: cross-domain concept nodes

Returns matching entities, facts, and a natural language summary.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Natural language query to search the knowledge graph (e.g., 'React project setup', 'database schema patterns')",
        },
        depth: {
          type: "number",
          description: "How many relationship hops to traverse (default: 2, max: 4)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "knowledge_store",
    description: `Explicitly store an important piece of knowledge in the semantic graph for future recall.

Use this tool when you discover something important that should be remembered:
• A project architecture insight ("This repo uses a monorepo with pnpm workspaces")
• A debugging finding ("Port 3100 is reserved for the sandbox API")
• A user preference ("User prefers TypeScript over JavaScript")
• A tool/technology relationship ("This project uses Vite + React + Tailwind")
• A domain concept ("The economy system uses double-entry accounting")

Stored knowledge persists across sessions and is automatically recalled when relevant.`,
    input_schema: {
      type: "object" as const,
      properties: {
        label: {
          type: "string",
          description: "The knowledge to store (short, descriptive label)",
        },
        type: {
          type: "string",
          description:
            "Type of knowledge: 'entity' (person/place/thing), 'concept' (idea/pattern), 'event' (action/occurrence), 'skill' (tool/technology)",
        },
        importance: {
          type: "number",
          description: "Importance score 0.0-1.0 (default: 0.7). Higher = recalled more often",
        },
        related_to: {
          type: "string",
          description: "Optional: existing concept/entity to link this knowledge to",
        },
      },
      required: ["label"],
    },
  },
  {
    name: "web_app_bridge",
    description: `Automate web apps with your unlimited subscriptions via Playwright.
Uses a dedicated Playwright sandbox (8 CPUs / 8GB RAM) with persistent browser sessions.
Cookies/logins persist across container restarts in /root/.config/.

Supported services:
• "chatgpt" — ChatGPT Pro (unlimited GPT-4.5/o3/o4-mini)
• "gemini" — Google Gemini Pro (unlimited Gemini Ultra)
• "claude" — Claude web (unlimited Claude 3.5/4)
• "lovable" — Lovable AI (build full-stack apps from prompts)
• "manus" — Manus AI (complex research & task execution)
• "heygen" — HeyGen (AI avatar video generation)
• "synthesia" — Synthesia (professional AI videos)
• "huggingface" — HuggingFace (model inference, Spaces)
• "copilot-github" — GitHub Copilot
• "copilot-ms" — Microsoft Copilot
• "google-ai" — Google AI Ultra
• "colab" — Google Colab (free GPU compute)
• "v0" — Vercel v0 (UI component generation)
• "bolt" — Bolt.new (full-stack app generation)

Actions:
• "login" — Open login page (complete via noVNC at localhost:6081)
• "chat" — Send prompt to LLM web app, extract response
• "generate" — Submit generation task, wait for result, download output
• "extract" — Extract content from current page
• "screenshot" — Take screenshot
• "download" — Download files from web app to /workspace
• "status" — Check which services have active sessions

First use: call action="login" service="chatgpt" → log in via noVNC → cookies saved forever.
After that: action="chat" service="chatgpt" prompt="..." works automatically.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: login, chat, generate, extract, screenshot, download, status",
        },
        service: { type: "string", description: "Service name (see supported list above)" },
        prompt: { type: "string", description: "Prompt or task description (for chat/generate)" },
        output_path: {
          type: "string",
          description: "Where to save downloaded files (default: /workspace)",
        },
        wait_seconds: {
          type: "number",
          description: "Max seconds to wait for response (default: 60, max: 300)",
        },
        selector: {
          type: "string",
          description: "CSS selector for extract action (default: auto-detect)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "rag_knowledge",
    description: `RAG (Retrieval-Augmented Generation) using ChromaDB vector database.
Ingest documents, codebases, PDFs → semantic search across your knowledge base.
Data persists in /workspace/.chromadb/ across sessions.

Actions:
• "ingest" — Index a file or directory (PDF, .txt, .md, .ts, .py, etc.)
• "query" — Semantic search across ingested knowledge
• "list" — List all collections and document counts
• "clear" — Delete all collections`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: ingest, query, list, clear" },
        path: { type: "string", description: "File or directory path to ingest" },
        query: { type: "string", description: "Search query for semantic search" },
        collection: { type: "string", description: "Collection name (default: 'default')" },
        top_k: { type: "number", description: "Number of results to return (default: 5)" },
      },
      required: ["action"],
    },
  },
  {
    name: "python_exec",
    description: `Execute Python scripts in the sandbox. Pre-installed: pandas, numpy, matplotlib, scikit-learn, pillow, seaborn, chromadb.
Returns stdout + list of generated files. Use for data analysis, ML, chart generation, file processing.`,
    input_schema: {
      type: "object" as const,
      properties: {
        script: { type: "string", description: "Python script source code to execute" },
        timeout_seconds: {
          type: "number",
          description: "Max execution time (default: 60, max: 300)",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "kali_exec",
    description: `Execute ANY command inside the Kali Linux container — a full Debian-based OS with 600+ pre-installed tools.
Kali is NOT just a pentest OS. It is a complete power-user Linux environment.

First: container_manage(action="start", container_type="kali") to start the container.
Then: kali_exec(command="...") to run ANYTHING inside it.

═══ FULL CAPABILITY MAP ═══

[ NETWORK ANALYSIS & SCANNING ]
nmap, masscan, netdiscover, zmap, unicornscan, arp-scan, fping, hping3
wireshark, tcpdump, tshark, ettercap, dsniff, arp-spoof, bettercap, mitmproxy
netcat (nc), socat, ncat, telnet, ss, iptables, scapy (python)

[ WEB APPLICATION ANALYSIS ]
nukto, sqlmap, gobuster, feroxbuster, dirbuster, wfuzz, ffuf, arjun
burpsuite-community, zaproxy (owasp zap), whatweb, wafw00f, xsstrike
cutycapt, httrack, wget, curl, httpie, wpscan (WordPress), droopescan
cmseek, joomscan, ghost-phisher, beef-xss, dalfox, subjack, corscanner

[ PASSWORD ATTACKS & CRACKING ]
john (john the ripper), hashcat, hydra, medusa, ncrack, patator, thc-pptp-bruter
crunch, cewl, cupp, rsmangler, wordhound, kwprocessor, maskprocessor
rainbow tables: rainbowcrack, rtgen, rtsort, rcrack
ogc, onesixtyone, enum4linux, smbmap, smbclient

[ EXPLOITATION FRAMEWORKS ]
metasploit-framework (msfconsole, msfvenom, msfdb), exploitdb + searchsploit
armitage, beef-xss, social-engineer-toolkit (SET), empire
exploit packs: cobaltstrike-compatible, faraday, dradis
pwn tools via python: pip install pwntools

[ SNIFFING & SPOOFING ]
wireshark, tcpdump, tshark, arpspoof, ettercap, bettercap, p0f
driftnet, urlsnarf, dnsspoof, webspy, sslstrip, mitmf
responder, inveigh, impacket suite (ntlmrelayx, secretsdump, psexec)

[ WIRELESS ATTACKS ]
aircrack-ng, airodump-ng, aireplay-ng, airbase-ng, airmon-ng
reaver, bully, pixiewps, wifite, kismet, horst, linssid
hostapd-wpe, freeradius-wpe, evil twin setups, cowpatty
bluetooth: bluez, btscanner, spooftooth, blueranger, bluemaho, crackle

[ DIGITAL FORENSICS ]
autopsy, sleuth kit (TSK), foremost, photorec, bulk-extractor, scalpel
volatility3 (memory forensics), lime (linux memory extractor), rekall
magic rescue, testdisk, dcfldd, dc3dd, guymager (disk imaging)
exiftool, mat2, metatext, metadata stripper, pdfinfo
pdf-parser, peepdf, pdftk, qpdf, pdfrw

[ REVERSE ENGINEERING ]
ghidra (NSA decompiler), radare2 + cutter (GUI), rizin, binary ninja compat
gdb + peda/pwndbg/gef, pwndbg, edb-debugger, strace, ltrace
objdump, readelf, nm, strings, file, ldd, xxd, hexdump, binwalk
ida-free (install manually), retdec, apktool (android APK), jadx
dex2jar, jad, procyon, cfr, fernflower
mono (C# .NET), ilspy compat, dotpeek compat

[ BINARY EXPLOITATION & EXPLOIT DEV ]
pwntools (pip), ROPgadget, ropper, one_gadget, checksec, patchelf
libseccomp, seccomp-tools, heap-exploitation-tools, pwninit
format string tools, ROP chain builders, shellcode runners

[ MALWARE ANALYSIS & SANDBOXING ]
clamav, yara, yarGen, maltrail, rkhunter, chkrootkit
ssdeep (fuzzy hashing), pe-file analysis: pefile (python), pescanner
strings, floss, capa (fire eye), retdec (file decompiler)
dynamic analysis: strace, ltrace, auditd, sysdig
peass-ng (privesc enumeration), linux-exploit-suggester

[ OSINT & RECONAISSANCE ]
recon-ng, theharvester, maltego CE, spiderfoot, amass, subfinder
sublist3r, dnsrecon, dnsenum, fierce, dnsmap, dmitry, osrframework
shodan-cli (pip install shodan), censys-cli, zoomeye
instagram/twitter/linkedin OSINT: sherlock, social-analyzer, maigret
geolocation: maxminddb, geoip2

[ EXPLOIT DB & VULNERABILITY RESEARCH ]
searchsploit (exploitdb local), apt-get install exploitdb
cve-search, vulners-scanner, nuclei (install from github)
openvas/gvm (install with gvm-setup), nessus (install manually)

[ CRYPTOGRAPHY & STEGANOGRAPHY ]
openssl, gpg, age, bcrypt, scrypt, argon2
steghide, stegcracker, steganalysis, stegoVeritas, zsteg, outguess
jpseek, camouflage, snow, openstego, stegsolve (java)
hashid, hash-identifier, haiti, findmyhash
cyberchef (local web app), rsatool, factordb-lookup

[ SDR & RADIO / HARDWARE HACKING ]
gnuradio, gqrx, rtl-sdr, hackrf tools, urh (universal radio hacker)
sigdigger, inspectrum, baudline, sox, multimon-ng (decode radio)
arduino-cli, avrdude, flashrom, binwalk (firmware extraction)
openocd, jtag tools, i2c-tools, spitools

[ CTF TOOLING ]
pwntools (pip), z3 (SAT solver), angr (symbolic execution)
smali/baksmali, apktool, jadx, jd-gui (java decompiler)
docker-ctf, pwndbg, GEF, peda, one_gadget
RSA tools: rsatool, factor, msieve, yafu, RsaCtfTool
cyberchef, featherduster (crypto analysis), xortool, sbox analyzer
git-dumper, dirsearch, arjun (parameter discovery)

[ VULNERABILITY SCANNING ]
nmap --script vuln, openvas, nuclei, nikto, wapiti, arachni
wordpress: wpscan, Joomla: joomscan, drupal: droopescan
ssl/tls: testssl.sh, sslscan, sslyze, nmap ssl-*
smb: enum4linux, smbmap, crackmapexec, impacket
ldap: ldapdomaindump, windapsearch

[ SOCIAL ENGINEERING ]
social-engineer-toolkit (SET), gophish (install from github)
beef-xss, msfvenom payload generation, ghost-phisher
ngrok/cloudflared (for callback URLs)

[ LINUX SYSTEM & DEV TOOLS ]
Python 3, Ruby, Perl, Go, Rust, C/C++ (gcc/g++/make/cmake)
git, curl, wget, jq, yq, xmllint, csvkit, pandoc
docker (inside Kali), tmux, screen, vim, nano, emacs
systemd, cron, at, nohup, screen multiplexers
All standard Debian/Ubuntu CLI utilities

[ DATABASES ]
sqlite3, mysql-client, psql (postgresql-client), redis-cli
mongoclient, cassandra-driver

[ LANGUAGES & RUNTIMES ]
python3 + pip (all security libs), ruby + gem, perl + CPAN
node.js + npm (install via nvm), go (install via apt), rust
php-cli, java/JRE (openjdk), .NET/mono, lua, bash/zsh/fish

WORKFLOW:
1. container_manage(action="start", container_type="kali")
2. kali_exec(command="apt-get update && apt-get install -y <tool>")
3. kali_exec(command="<any command>")

PRO TIPS:
- Long-running tasks: kali_exec(command="nohup tool ... > /root/out.log 2>&1 &", timeout=10)
- Then: kali_exec(command="cat /root/out.log") to read output
- Files persist in /root inside the container between calls
- Install Python tools: kali_exec(command="pip3 install pwntools shodan impacket")
- Share files with host sandbox: use docker cp if needed via sandbox_exec`,
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description:
            "Any shell command to run inside Kali Linux. Full root access, full network, 600+ security tools available.",
        },
        cwd: { type: "string", description: "Working directory inside Kali (default: /root)" },
        timeout: {
          type: "number",
          description:
            "Timeout in seconds (default: 60, max: 300). Use nohup + 10s timeout for long-running daemons.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "screenshot",
    description: `Capture a screenshot of a running web app or URL via Playwright.
Returns base64 PNG image and saves to /workspace/screenshots/.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to capture (default: http://localhost:8080)" },
        filename: {
          type: "string",
          description: "Output filename (default: screenshot-{timestamp}.png)",
        },
        full_page: {
          type: "boolean",
          description: "Capture full scrollable page (default: false)",
        },
        width: { type: "number", description: "Viewport width (default: 1280)" },
        height: { type: "number", description: "Viewport height (default: 720)" },
      },
      required: [],
    },
  },
  {
    name: "visual_diff",
    description: `Compare two screenshots pixel-by-pixel using pixelmatch. Returns diff percentage and highlighted diff image.`,
    input_schema: {
      type: "object" as const,
      properties: {
        image_a: { type: "string", description: "Path to first image" },
        image_b: { type: "string", description: "Path to second image" },
        output: {
          type: "string",
          description: "Output diff image path (default: /workspace/screenshots/diff.png)",
        },
        threshold: { type: "number", description: "Matching threshold 0-1 (default: 0.1)" },
      },
      required: ["image_a", "image_b"],
    },
  },
  {
    name: "screen_record",
    description:
      "Record screen/browser to GIF or video. Actions: start, stop, screenshot_sequence, gif. Uses ffmpeg + xvfb or Chromium headless.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: start, stop, screenshot_sequence, gif" },
        url: { type: "string", description: "URL to record" },
        output_path: { type: "string", description: "Output file" },
        duration: { type: "number", description: "Duration seconds (default: 10)" },
        width: { type: "number", description: "Width (default: 1280)" },
        height: { type: "number", description: "Height (default: 720)" },
        fps: { type: "number", description: "FPS (default: 15)" },
        steps: { type: "string", description: "JSON actions for screenshot_sequence" },
      },
      required: ["action"],
    },
  },
  {
    name: "cron_schedule",
    description: `Schedule recurring or one-time tasks for autonomous execution.
Uses the gateway's built-in cron system to persist schedules across restarts.

Actions:
• "create" — Schedule a new recurring task (cron expression + command/RPC)
• "list" — Show all scheduled tasks
• "delete" — Remove a scheduled task by ID
• "pause" — Temporarily disable a task
• "resume" — Re-enable a paused task
• "run_once" — Execute a task immediately (one-shot, no schedule)
• "history" — Show recent execution history for a task

Schedule format: standard cron ("*/5 * * * *" = every 5 min) or human-readable ("every 30 minutes", "daily at 09:00").`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: create, list, delete, pause, resume, run_once, history",
        },
        task_name: { type: "string", description: "Human-readable name for the task" },
        schedule: { type: "string", description: "Cron expression or human-readable schedule" },
        command: { type: "string", description: "Shell command to run in sandbox (for create)" },
        rpc_method: {
          type: "string",
          description: "Gateway RPC method to call instead of shell command",
        },
        rpc_params: { type: "string", description: "JSON params for the RPC call" },
        task_id: { type: "string", description: "Task ID (for delete/pause/resume/history)" },
      },
      required: ["action"],
    },
  },
  {
    name: "notification_send",
    description: `Send notifications through multiple channels. Use to alert on task completion, failures, or important events.

Channels:
• "telegram" — Send via Telegram bot (uses configured bot token)
• "discord" — Send via Discord webhook
• "slack" — Send via Slack webhook
• "webhook" — POST to any URL
• "desktop" — Show system desktop notification (Windows toast)
• "ntfy" — Push via ntfy.sh (self-hosted or public)

Supports markdown formatting where the channel allows it.`,
    input_schema: {
      type: "object" as const,
      properties: {
        channel: {
          type: "string",
          description: "Channel: telegram, discord, slack, webhook, desktop, ntfy",
        },
        message: { type: "string", description: "Notification message (markdown supported)" },
        title: { type: "string", description: "Notification title/subject (optional)" },
        webhook_url: {
          type: "string",
          description: "Webhook URL (for discord, slack, webhook, ntfy channels)",
        },
        chat_id: { type: "string", description: "Telegram chat ID (for telegram channel)" },
        priority: {
          type: "string",
          description: "Priority: low, normal, high, urgent (default: normal)",
        },
        image_url: { type: "string", description: "Optional image URL to embed" },
      },
      required: ["channel", "message"],
    },
  },
  {
    name: "spreadsheet",
    description: `Process and analyze tabular data (CSV, Excel, TSV, JSON arrays).
Powered by pandas in the sandbox — handles millions of rows.

Actions:
• "read" — Load and preview data (first/last N rows, dtypes, shape)
• "query" — Filter/sort with pandas query syntax (e.g. "age > 30 and city == 'NYC'")
• "stats" — Descriptive statistics (mean, median, std, min, max, correlations)
• "transform" — Apply transformations (rename columns, drop nulls, merge, groupby, pivot)
• "chart" — Generate charts (bar, line, scatter, pie, histogram, heatmap)
• "export" — Export to CSV, XLSX, JSON, or Parquet
• "sql" — Query data using SQL syntax (via pandasql)`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: read, query, stats, transform, chart, export, sql",
        },
        file_path: { type: "string", description: "Path to input file (CSV, XLSX, TSV, JSON)" },
        query: { type: "string", description: "Pandas query string or SQL query" },
        columns: { type: "string", description: "Comma-separated column names to select" },
        transform_ops: {
          type: "string",
          description: "JSON array of transform operations [{op, params}]",
        },
        chart_type: {
          type: "string",
          description: "Chart type: bar, line, scatter, pie, histogram, heatmap (default: bar)",
        },
        x_col: { type: "string", description: "X-axis column for charts" },
        y_col: { type: "string", description: "Y-axis column for charts" },
        output_path: { type: "string", description: "Output file path for export/chart" },
        output_format: {
          type: "string",
          description: "Export format: csv, xlsx, json, parquet (default: csv)",
        },
        sheet_name: {
          type: "string",
          description: "Sheet name for Excel files (default: first sheet)",
        },
        head: { type: "number", description: "Number of rows to preview (default: 20)" },
      },
      required: ["action"],
    },
  },
  {
    name: "secret_vault",
    description: `Securely store and retrieve API keys, tokens, and credentials.
Encrypted at rest — never exposed in logs or chat history.

Actions:
• "store" — Save a secret (encrypted, scoped to project/global)
• "retrieve" — Get a secret value by key
• "list" — List stored secret keys (values never shown)
• "delete" — Remove a secret
• "inject" — Write secrets as environment variables into sandbox .env
• "rotate" — Update a secret value (preserves key)

Secrets can be scoped per-project or global. Use inject to make them available as env vars.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: store, retrieve, list, delete, inject, rotate",
        },
        key: {
          type: "string",
          description: "Secret key name (e.g. 'OPENAI_API_KEY', 'GITHUB_TOKEN')",
        },
        value: { type: "string", description: "Secret value (for store/rotate — never logged)" },
        scope: { type: "string", description: "Scope: project, global (default: project)" },
        env_file: {
          type: "string",
          description: "Path to .env file (for inject action, default: /workspace/.env)",
        },
        keys: {
          type: "string",
          description: "Comma-separated key names (for inject — specific keys only)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "pdf_extract",
    description:
      "Extract structured data from PDFs. Actions: text (all text w/page numbers), tables (CSV/JSON), images, metadata, ocr (scanned PDFs), pages (specific range), search, split, merge.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: text, tables, images, metadata, ocr, pages, search, split, merge",
        },
        file_path: { type: "string", description: "Path to PDF" },
        output_path: { type: "string", description: "Output directory" },
        page_range: { type: "string", description: "Page range: '1-5', '1,3,5', 'all'" },
        query: { type: "string", description: "Search text" },
        files: { type: "string", description: "Comma-separated PDFs for merge" },
        output_format: { type: "string", description: "Format: csv, json, markdown" },
      },
      required: ["action"],
    },
  },
  {
    name: "file_search",
    description:
      "Search for files and content across the workspace. Actions: content (ripgrep), name (glob), recent (by mtime), large (by size), duplicates (by hash), type (by extension), replace (search-replace), stats (workspace statistics).",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: content, name, recent, large, duplicates, type, replace, stats",
        },
        pattern: {
          type: "string",
          description: "Search pattern (regex for content, glob for name)",
        },
        directory: { type: "string", description: "Directory to search (default: /workspace)" },
        include: { type: "string", description: "Include glob (e.g. '*.ts')" },
        exclude: { type: "string", description: "Exclude patterns (e.g. 'node_modules,dist')" },
        case_sensitive: { type: "boolean", description: "Case-sensitive (default: false)" },
        context_lines: { type: "number", description: "Context lines (default: 2)" },
        max_results: { type: "number", description: "Max results (default: 50)" },
        replacement: { type: "string", description: "Replacement string (for replace)" },
        dry_run: { type: "boolean", description: "Preview replace only (default: true)" },
      },
      required: ["action"],
    },
  },
  {
    name: "vector_store",
    description:
      "Manage vector embeddings for semantic search and RAG. Uses ChromaDB/FAISS. Actions: create, add, query (semantic search), list, delete, stats, ingest (bulk files).",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: create, add, query, list, delete, stats, ingest",
        },
        collection_name: { type: "string", description: "Collection name" },
        documents: { type: "string", description: "JSON array of documents or plain text" },
        query: { type: "string", description: "Semantic search query" },
        top_k: { type: "number", description: "Results count (default: 5)" },
        directory: { type: "string", description: "Ingest directory" },
        include: { type: "string", description: "File patterns for ingest" },
      },
      required: ["action"],
    },
  },
  {
    name: "translate",
    description:
      "Translate text between 100+ languages. Auto-detects source language. Supports text, files, JSON locale bundles, and SRT subtitles.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Text to translate" },
        target_lang: {
          type: "string",
          description: "Target language (e.g. 'es', 'Spanish', 'ar', 'zh-CN')",
        },
        source_lang: { type: "string", description: "Source language (default: auto-detect)" },
        file_path: { type: "string", description: "Translate file content" },
        output_path: { type: "string", description: "Save to file" },
        mode: { type: "string", description: "Mode: text, json_keys, srt, html (default: text)" },
      },
      required: ["target_lang"],
    },
  },
  {
    name: "ssh_remote",
    description:
      "Connect to and manage remote servers via SSH. Actions: exec, upload (SCP), download, tunnel (port-forwarding), info (system stats), deploy.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: exec, upload, download, tunnel, info, deploy",
        },
        host: { type: "string", description: "Remote host" },
        user: { type: "string", description: "SSH user (default: root)" },
        key_path: { type: "string", description: "SSH private key path" },
        password: { type: "string", description: "SSH password (prefer key)" },
        port: { type: "number", description: "SSH port (default: 22)" },
        command: { type: "string", description: "Command to execute" },
        local_path: { type: "string", description: "Local path" },
        remote_path: { type: "string", description: "Remote path" },
        tunnel_local: { type: "number", description: "Local tunnel port" },
        tunnel_remote: { type: "number", description: "Remote tunnel port" },
      },
      required: ["action", "host"],
    },
  },
  {
    name: "dns_manage",
    description:
      "Manage DNS records. Supports lookups and Cloudflare API. Actions: lookup, list, create, update, delete, propagation.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: lookup, list, create, update, delete, propagation",
        },
        domain: { type: "string", description: "Domain name" },
        record_type: { type: "string", description: "Type: A, AAAA, CNAME, MX, TXT, NS" },
        record_value: { type: "string", description: "Record value" },
        record_name: { type: "string", description: "Subdomain name" },
        ttl: { type: "number", description: "TTL seconds (default: 300)" },
        zone_id: { type: "string", description: "Cloudflare zone ID" },
        record_id: { type: "string", description: "Record ID for update/delete" },
        proxied: { type: "boolean", description: "Cloudflare proxy (default: false)" },
        api_token: { type: "string", description: "Cloudflare API token" },
      },
      required: ["action", "domain"],
    },
  },
  {
    name: "qr_code",
    description:
      "Generate and read QR codes. Actions: generate, read, wifi (auto-connect QR), vcard (contact QR), batch.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: generate, read, wifi, vcard, batch" },
        data: { type: "string", description: "Data to encode" },
        output_path: { type: "string", description: "Output path" },
        image_path: { type: "string", description: "Image to read QR from" },
        size: { type: "number", description: "QR size px (default: 400)" },
        format: { type: "string", description: "Format: png, svg" },
        ssid: { type: "string", description: "WiFi SSID" },
        wifi_password: { type: "string", description: "WiFi password" },
        wifi_security: { type: "string", description: "Security: WPA, WEP, nopass" },
        vcard_name: { type: "string", description: "Contact name" },
        vcard_phone: { type: "string", description: "Phone" },
        vcard_email: { type: "string", description: "Email" },
      },
      required: ["action"],
    },
  },
  {
    name: "workflow_chain",
    description:
      "Chain multiple tools into a sequential workflow. Each step references previous outputs via {{step_N}} syntax. Input: JSON array of steps [{tool, params, name?}].",
    input_schema: {
      type: "object" as const,
      properties: {
        steps: { type: "string", description: "JSON array of [{tool, params, name?}]" },
        stop_on_error: { type: "boolean", description: "Stop on first error (default: true)" },
        parallel: { type: "boolean", description: "Parallel execution (default: false)" },
      },
      required: ["steps"],
    },
  },
  {
    name: "calendar_manage",
    description:
      "Manage calendar events for scheduling. Actions: list, create, delete, today, remind, free_slots. Uses a local JSON calendar or Google Calendar API.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: list, create, delete, today, remind, free_slots",
        },
        title: { type: "string", description: "Event title" },
        start_time: { type: "string", description: "Start (ISO or 'tomorrow 2pm')" },
        end_time: { type: "string", description: "End time" },
        description: { type: "string", description: "Event description" },
        event_id: { type: "string", description: "Event ID for delete" },
        days_ahead: { type: "number", description: "Days to look ahead (default: 7)" },
        duration_minutes: { type: "number", description: "Duration minutes (default: 60)" },
      },
      required: ["action"],
    },
  },
  {
    name: "sms_send",
    description:
      "Send SMS messages via Twilio API. Requires TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM env vars (or use secret_vault to inject).",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient phone (E.164: +1234567890)" },
        message: { type: "string", description: "SMS text (max 1600 chars)" },
        from: { type: "string", description: "Sender phone (default: TWILIO_FROM)" },
      },
      required: ["to", "message"],
    },
  },
  {
    name: "oauth_flow",
    description:
      "Handle OAuth 2.0 flows. Actions: client_credentials, device_code, refresh, introspect, token_exchange.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description:
            "Action: client_credentials, device_code, refresh, introspect, token_exchange",
        },
        token_url: { type: "string", description: "Token endpoint URL" },
        client_id: { type: "string", description: "Client ID" },
        client_secret: { type: "string", description: "Client secret" },
        scopes: { type: "string", description: "Space-separated scopes" },
        refresh_token: { type: "string", description: "Refresh token" },
        auth_code: { type: "string", description: "Authorization code" },
        redirect_uri: { type: "string", description: "Redirect URI" },
        device_code_url: { type: "string", description: "Device auth endpoint" },
      },
      required: ["action"],
    },
  },
  {
    name: "model_serve",
    description:
      "Deploy and manage ML model inference endpoints. Actions: start, stop, status, predict, list. Supports vLLM, Ollama, ONNX, Transformers.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: start, stop, status, predict, list" },
        model: { type: "string", description: "Model name/path" },
        runtime: {
          type: "string",
          description: "Runtime: vllm, ollama, onnx, transformers (default: ollama)",
        },
        port: { type: "number", description: "Serve port (default: 8000)" },
        input: { type: "string", description: "Prediction input" },
        gpu: { type: "boolean", description: "Use GPU (default: true)" },
      },
      required: ["action"],
    },
  },
  {
    name: "diagram_generate",
    description:
      "Generate diagrams from text. Formats: mermaid, plantuml, d2, dot (Graphviz). Outputs PNG, SVG, or PDF.",
    input_schema: {
      type: "object" as const,
      properties: {
        source: { type: "string", description: "Diagram source code" },
        format: {
          type: "string",
          description: "Input format: mermaid, plantuml, d2, dot (default: mermaid)",
        },
        output_path: {
          type: "string",
          description: "Output file (default: /workspace/diagram.png)",
        },
        output_format: { type: "string", description: "Output: png, svg, pdf (default: png)" },
        theme: { type: "string", description: "Theme: default, dark, forest, neutral" },
      },
      required: ["source"],
    },
  },
  {
    name: "cloud_storage",
    description: `Access OneDrive, Google Drive, and Dropbox via rclone with OAuth.
OAuth tokens persist in /root/.config/rclone/ (survives container restarts).

Actions:
• "auth" — Start OAuth authorization flow (returns URL to authorize)
• "list" — List files/folders in a remote path
• "download" — Download file to /workspace
• "upload" — Upload file from /workspace to remote
• "sync" — Sync a local dir with remote dir
• "status" — Show configured remotes and their status

Providers: "onedrive", "gdrive" (Google Drive), "dropbox"

First use: call with action="auth" + provider. Follow the URL to authorize.
After that, all operations work automatically.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: auth, list, download, upload, sync, status",
        },
        provider: { type: "string", description: "Provider: onedrive, gdrive, dropbox" },
        remote_path: { type: "string", description: "Remote path (e.g., 'Documents/project')" },
        local_path: { type: "string", description: "Local path (default: /workspace)" },
      },
      required: ["action"],
    },
  },
  {
    name: "email",
    description: `Send, read, and search emails via OAuth or SMTP.
Supports Gmail and Outlook. OAuth tokens persist across restarts.

Actions:
• "auth" — Set up email credentials (OAuth device flow or SMTP)
• "send" — Send an email (to, subject, body, attachments)
• "read" — Read recent emails (count, folder)
• "search" — Search emails by query

For Gmail: uses OAuth device flow (no app password needed)
For Outlook: uses OAuth device flow
For SMTP: provide host, port, username, password

Attachments: provide absolute paths in the sandbox filesystem.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: auth, send, read, search" },
        provider: { type: "string", description: "Provider: gmail, outlook, smtp" },
        to: { type: "string", description: "Recipient email(s), comma-separated" },
        subject: { type: "string", description: "Email subject" },
        body: { type: "string", description: "Email body (text or HTML)" },
        attachments: { type: "string", description: "Comma-separated file paths for attachments" },
        count: { type: "number", description: "Number of emails to read (default: 10)" },
        query: { type: "string", description: "Search query for email search" },
        folder: { type: "string", description: "Email folder (default: INBOX)" },
        // SMTP config
        smtp_host: { type: "string", description: "SMTP server host" },
        smtp_port: { type: "number", description: "SMTP port (default: 587)" },
        smtp_user: { type: "string", description: "SMTP username" },
        smtp_pass: { type: "string", description: "SMTP password" },
      },
      required: ["action"],
    },
  },
];
