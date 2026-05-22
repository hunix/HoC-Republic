/**
 * Sandbox Tool Definitions — sandbox-core tools
 */

export const SANDBOX_CORE_TOOLS = [
  {
    name: "sandbox_exec",
    description: `Execute any shell command in the Ubuntu sandbox container. You have FULL root access.

CAPABILITIES — use this for:
• ANY Linux/Ubuntu command (ls, find, grep, sed, awk, curl, wget, tar, zip, chmod, chown, etc.)
• Git operations (git clone, git init, git add, git commit, git push, git diff, git log, etc.)
• Docker operations (docker build, docker run, docker-compose up, etc.)
• Compilers & interpreters (gcc, g++, javac, python3, node, ruby, php, go, rustc, etc.)
• Package managers (pip, npm, yarn, pnpm, apt-get, cargo, gem, etc.)
• Databases (sqlite3, psql, mysql, redis-cli, mongosh, etc.)
• Network tools (curl, wget, nc, nmap, dig, ping, traceroute, ssh, etc.)
• File processing (jq, yq, xmllint, csvkit, pandoc, ffmpeg, imagemagick, etc.)
• Process management (ps, kill, top, htop, nohup, screen, tmux, etc.)
• Web servers (python3 -m http.server, nginx, apache, caddy, etc.)
• Build tools (make, cmake, gradle, maven, webpack, vite, esbuild, etc.)
• Testing frameworks (pytest, jest, mocha, vitest, playwright, etc.)

IMPORTANT: For long-running commands (servers), use '&' to background them or use 'nohup'.
Working directory defaults to /workspace. Set timeout for long operations.`,
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description:
            "Shell command to execute. Can be complex pipes, redirects, multi-line scripts via bash -c '...'",
        },
        cwd: {
          type: "string",
          description: "Working directory (default: /workspace)",
        },
        timeout: {
          type: "number",
          description: "Timeout in seconds (default: 60, max: 300). Use 300 for builds/installs.",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "sandbox_write_file",
    description: `Write a file to the sandbox filesystem with full content. Creates parent directories automatically.

Use for: source code, config files, HTML/CSS/JS, scripts, Dockerfiles, docker-compose.yml,
.env files, requirements.txt, package.json, Makefiles, documentation, data files, etc.

Always use absolute paths starting with /workspace/.
For binary files (images, fonts), download them with sandbox_exec + curl/wget instead.`,
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute path (e.g., /workspace/src/app.py, /workspace/docker-compose.yml)",
        },
        content: {
          type: "string",
          description: "Full file contents to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "sandbox_read_file",
    description:
      "Read a file from the sandbox filesystem. Returns the file contents (up to 16KB) or null if not found. Use for inspecting generated code, logs, build output, config files, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description:
            "Absolute path to read (e.g., /workspace/package.json, /workspace/error.log)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "sandbox_list_files",
    description:
      "List files and directories in the sandbox. Returns name, type (file/dir), and size. Use to understand project structure, verify file creation, check build output.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (default: /workspace)",
        },
      },
    },
  },
  {
    name: "sandbox_install",
    description: `Install packages in the sandbox. Handles pip, npm, apt-get, and cargo automatically.

COMMON INSTALLS:
• pip: flask, django, fastapi, scrapling, beautifulsoup4, python-pptx, pandas, matplotlib, pillow, requests, selenium, python-docx, openpyxl, reportlab
• npm: express, next, react, vue, vite, tailwindcss, typescript, prisma, sqlite3, puppeteer, sharp
• apt: wget, curl, httrack, git, build-essential, ffmpeg, imagemagick, chromium-browser, libreoffice, pandoc, texlive, nginx, postgresql, redis, jq, unzip, p7zip-full
• cargo: (if Rust is needed, install via 'apt' first with 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y')`,
    input_schema: {
      type: "object" as const,
      properties: {
        manager: {
          type: "string",
          enum: ["pip", "npm", "apt", "cargo"],
          description: "Package manager to use",
        },
        packages: {
          type: "string",
          description: "Space-separated package names",
        },
      },
      required: ["manager", "packages"],
    },
  },
];
