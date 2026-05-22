/**
 * Sandbox Tool Definitions — devops tools
 */

export const DEVOPS_TOOLS = [
  {
    name: "claude_code",
    description: `Delegate a COMPLEX software development task to Claude Code CLI.
Claude Code is Anthropic's agentic coding assistant that can autonomously:
• Plan project architecture
• Create/edit multiple files simultaneously
• Install dependencies (npm, pip, apt)
• Build and test projects
• Debug and fix errors iteratively
• Set up dev servers and preview

Use this INSTEAD of manual sandbox_exec + sandbox_write_file when the task involves:
• Full-stack app development (React, Vue, Next.js, Express, Django, etc.)
• Complex refactoring across many files
• Implementing multi-component features
• Scaffolding and configuring projects
• Writing comprehensive test suites

For simple single-file operations, use sandbox_write_file instead.
For quick commands, use sandbox_exec instead.`,
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "Detailed task description for Claude Code. Be specific about requirements.",
        },
        cwd: {
          type: "string",
          description: "Working directory (default: /workspace)",
        },
        max_turns: {
          type: "number",
          description: "Max agentic turns — more turns = more thorough (default: 30, max: 50)",
        },
        effort: {
          type: "string",
          description: "Quality/effort level: low, medium, high, max (default: high)",
        },
        model: {
          type: "string",
          description: "Model to use (default: claude-sonnet-4-20250514)",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "claude_review",
    description: `Run Claude Code in review mode to QA code before delivery.
Analyzes code for: bugs, security vulnerabilities, performance issues, edge cases,
best practice violations, missing error handling, and opportunities for improvement.

Returns structured feedback with specific file/line references.

Use this:
• After completing a build to catch issues before delivery
• When refactoring to verify nothing broke
• For security audits of generated code
• To check code quality and standards compliance`,
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "File or directory to review (default: /workspace)",
        },
        focus: {
          type: "string",
          description: "Focus area: security, performance, bugs, testing, all (default: all)",
        },
      },
    },
  },
  {
    name: "supabase_project",
    description: `Manage a local Supabase project for full-stack development with PostgreSQL, Auth, Storage, Realtime, and Edge Functions.

Actions:
• "start" — Initialize and start a local Supabase project (creates supabase/ dir, starts Docker services)
• "stop" — Stop the local Supabase stack
• "status" — Get connection URLs, API keys, and service status
• "migration" — Create and apply a database migration (provide migration_name + migration_sql)
• "gen-types" — Generate TypeScript types from the current database schema
• "seed" — Write and apply seed data to the database
• "reset" — Reset the database, reapply all migrations and seed data

After starting, the following services are available:
• PostgreSQL database with RLS (Row Level Security)
• Authentication (email/password, OAuth, magic links)
• Storage (file upload/download with bucket policies)
• Realtime (WebSocket subscriptions for DB changes)
• Edge Functions (Deno-based serverless functions)
• Studio UI (database admin panel)

The frontend connects using SUPABASE_URL and SUPABASE_ANON_KEY environment variables.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action to perform: start, stop, status, migration, gen-types, seed, reset",
        },
        migration_name: {
          type: "string",
          description: "Name for the migration (required when action=migration)",
        },
        migration_sql: {
          type: "string",
          description: "SQL statements for the migration (required when action=migration)",
        },
        seed_sql: {
          type: "string",
          description: "SQL seed data statements (required when action=seed)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "deploy",
    description: `Deploy the project to a public URL.
Returns a live public URL that anyone can access.

Platforms:
• "tunnel" (default) — Free cloudflared tunnel, no auth needed
• "vercel" — Deploy to Vercel (requires VERCEL_TOKEN env var)
• "cloudflare" — Deploy to Cloudflare Pages (requires CLOUDFLARE_API_TOKEN)

Default uses a free Cloudflare tunnel — works instantly with zero config.`,
    input_schema: {
      type: "object" as const,
      properties: {
        platform: {
          type: "string",
          description: "Deploy platform: tunnel, vercel, cloudflare (default: tunnel)",
        },
        directory: {
          type: "string",
          description: "Build output directory to deploy (default: dist or build)",
        },
        project_name: { type: "string", description: "Project name for the deployment URL" },
      },
    },
  },
  {
    name: "deploy_public_url",
    description: `Deploy the sandbox preview to a public URL using Cloudflare Tunnel.
Returns a live https://xxx.trycloudflare.com URL accessible by anyone.
No account needed. Tunnel stays alive until stopped.

Perfect for sharing work-in-progress, demos, and client previews.`,
    input_schema: {
      type: "object" as const,
      properties: {
        port: {
          type: "number",
          description: "Local port to expose (default: 8080 for preview server)",
        },
        tunnel_name: {
          type: "string",
          description: "Name for this tunnel (e.g. 'my-app-preview')",
        },
      },
    },
  },
  {
    name: "deploy_public",
    description: `Expose a local port to the internet via Cloudflare Quick Tunnel. Returns a public *.trycloudflare.com URL.
Zero config, no account required. Previous tunnel is auto-killed on new deploy.`,
    input_schema: {
      type: "object" as const,
      properties: {
        port: { type: "number", description: "Local port to expose (default: 8080)" },
      },
      required: [],
    },
  },
  {
    name: "deploy_local",
    description: `Build and serve a production bundle locally.
Runs npm build, then serves the dist/ or build/ folder.

Returns the URL to access the production build.
Supports React, Next.js, and static sites.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
        build_command: {
          type: "string",
          description: "Custom build command (default: auto-detect)",
        },
        serve_port: { type: "number", description: "Port to serve on (default: 8080)" },
      },
    },
  },
  {
    name: "git_repo",
    description: `Initialize a Git repo and optionally push to GitHub.

Actions:
• "init" — Initialize git repo with .gitignore and initial commit
• "push" — Create GitHub repo and push code (requires GH_TOKEN env var)
• "commit" — Stage all changes and commit with a message

Returns the GitHub repo URL when pushed.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: init, push, commit (default: init)" },
        repo_name: { type: "string", description: "GitHub repo name (required for push)" },
        commit_message: {
          type: "string",
          description: "Commit message (default: 'Initial commit')",
        },
        private: { type: "boolean", description: "Make GitHub repo private (default: false)" },
      },
    },
  },
  {
    name: "git_github",
    description: `Full Git and GitHub operations.
Uses GH_TOKEN for authentication (already configured).
All git/gh commands run inside the sandbox container.

Actions:
• "clone" — Clone a repo (url required)
• "init" — Initialize a new repo + set remote
• "status" — Show git status
• "add" — Stage files (files: "." for all, or specific paths)
• "commit" — Commit with message
• "push" — Push to remote (branch optional)
• "pull" — Pull latest from remote
• "branch" — Create or switch branch
• "diff" — Show uncommitted changes
• "log" — Show recent commit log
• "pr-create" — Create a pull request (title, body, base branch)
• "pr-list" — List open pull requests
• "fork" — Fork a repo
• "sync" — Sync fork with upstream

OAuth tokens + git config persist across container restarts.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description:
            "Action: clone, init, status, add, commit, push, pull, branch, diff, log, pr-create, pr-list, fork, sync",
        },
        url: { type: "string", description: "Repository URL (for clone/fork)" },
        message: { type: "string", description: "Commit message (for commit)" },
        branch: { type: "string", description: "Branch name (for branch/push)" },
        files: { type: "string", description: "Files to stage (for add, default: '.')" },
        title: { type: "string", description: "PR title (for pr-create)" },
        body: { type: "string", description: "PR body (for pr-create)" },
        base: { type: "string", description: "Base branch (for pr-create, default: main)" },
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
      },
      required: ["action"],
    },
  },
  {
    name: "git_diff_review",
    description:
      "Analyze git diffs and generate structured reviews. Actions: diff, review (AI-powered), summary, pr_description, blame, log, conflicts.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: diff, review, summary, pr_description, blame, log, conflicts",
        },
        ref_a: { type: "string", description: "First ref (default: HEAD~1)" },
        ref_b: { type: "string", description: "Second ref (default: HEAD)" },
        path: { type: "string", description: "Scope to file/directory" },
        format: { type: "string", description: "Format: unified, stat, name-only" },
        max_commits: { type: "number", description: "Max commits for log (default: 20)" },
      },
      required: ["action"],
    },
  },
  {
    name: "run_tests",
    description: `Auto-detect and run test frameworks in a project. Detects: vitest, jest, pytest, mocha.
Returns pass/fail count, failure details, and coverage when available.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
        framework: {
          type: "string",
          description: "Force framework: vitest, jest, pytest, mocha (default: auto-detect)",
        },
        coverage: { type: "boolean", description: "Enable coverage reporting (default: false)" },
      },
      required: [],
    },
  },
  {
    name: "test_generate",
    description: `Generate unit tests for a source file using AI inference.
Reads the source file, analyzes exports/functions, and generates comprehensive tests.

Supported frameworks: vitest, jest, pytest, mocha
Generates tests for: exported functions, React components, API handlers, utility modules.

The AI analyzes function signatures, edge cases, and common patterns to produce
well-structured tests with proper mocking, assertions, and coverage.`,
    input_schema: {
      type: "object" as const,
      properties: {
        file_path: { type: "string", description: "Source file to generate tests for" },
        test_framework: {
          type: "string",
          description: "Test framework: vitest, jest, pytest, mocha (default: vitest)",
        },
        output_path: {
          type: "string",
          description: "Output test file path (auto-generated if not specified)",
        },
        coverage_target: {
          type: "string",
          description: "Coverage target: basic, thorough, exhaustive (default: thorough)",
        },
      },
      required: ["file_path"],
    },
  },
  {
    name: "scaffold_project",
    description: `Scaffold a complete full-stack project with a single tool call.
Creates a production-ready project structure with all dependencies pre-configured.

Stacks (choose one):
• "react-supabase" — Vite + React + TypeScript + Tailwind CSS + Supabase + React Router
• "nextjs-supabase" — Next.js App Router + TypeScript + Tailwind CSS + Supabase
• "react-pwa" — Vite + React + TypeScript + Tailwind CSS + PWA (manifest + service worker)
• "react-pwa-supabase" — All of the above combined: React PWA with Supabase backend
• "express-api" — Express + TypeScript + Prisma + PostgreSQL API server
• "static-site" — HTML + Tailwind CSS + Alpine.js static website

Each stack includes:
- All source files, config files, and dependency manifests
- Tailwind CSS with custom design tokens
- TypeScript strict mode configuration
- ESLint + Prettier configuration
- npm install runs automatically after scaffolding
- Dev server starts on port 8080 for immediate preview`,
    input_schema: {
      type: "object" as const,
      properties: {
        stack: {
          type: "string",
          description:
            "Stack to scaffold: react-supabase, nextjs-supabase, react-pwa, react-pwa-supabase, express-api, static-site",
        },
        project_name: {
          type: "string",
          description: "Project name (slug format, e.g., 'my-awesome-app')",
        },
        features: {
          type: "string",
          description:
            "Comma-separated features: auth, storage, realtime, edge-functions, dark-mode, i18n (default: auth)",
        },
      },
      required: ["stack", "project_name"],
    },
  },
  {
    name: "code_refactor",
    description: `AI-powered code refactoring operations.

Actions:
• "extract-component" — Extract JSX into a new React component
• "extract-function" — Extract code block into a named function
• "split-file" — Split a large file into multiple modules
• "rename-symbol" — Rename a function/variable/type across files
• "simplify" — Reduce complexity, remove dead code, improve readability
• "convert-types" — Convert JavaScript to TypeScript with proper types
• "optimize" — Performance optimizations (memoization, lazy loading, etc.)

Uses AI inference to understand the code semantics and produce clean refactored output.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Refactoring action (see list above)" },
        file_path: { type: "string", description: "Source file to refactor" },
        target: {
          type: "string",
          description: "Target selection — function name, line range, or component name",
        },
        new_name: { type: "string", description: "New name (for rename/extract operations)" },
      },
      required: ["action", "file_path"],
    },
  },
  {
    name: "type_generate",
    description: `Generate TypeScript types/interfaces from data samples.

Sources:
• "json" — Infer types from a JSON data sample
• "api" — Fetch an API endpoint and generate types from the response
• "schema" — Convert a JSON Schema to TypeScript interfaces
• "csv" — Infer column types from a CSV file

Generates clean, well-named interfaces with JSDoc comments.
Handles nested objects, arrays, optional fields, and union types.`,
    input_schema: {
      type: "object" as const,
      properties: {
        source: { type: "string", description: "Source type: json, api, schema, csv" },
        data: { type: "string", description: "JSON data string or file path" },
        api_url: { type: "string", description: "API URL to fetch (for api source)" },
        type_name: { type: "string", description: "Root type name (default: auto-generated)" },
        output_path: {
          type: "string",
          description: "Output file path (default: /workspace/types.ts)",
        },
      },
      required: ["source"],
    },
  },
  {
    name: "lint_fix",
    description: `Auto-lint and fix code using ESLint + Prettier. Installs if needed. Returns fixed file count and remaining issues.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
        fix: { type: "boolean", description: "Auto-fix issues (default: true)" },
      },
      required: [],
    },
  },
  {
    name: "self_correct",
    description: `Run automated self-correction loop: lint → test → screenshot → report. Automatically fixes issues found.
Use after building an app to verify and polish it.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
        max_rounds: { type: "number", description: "Max correction rounds (default: 3)" },
        url: { type: "string", description: "URL to screenshot (default: http://localhost:8080)" },
      },
      required: [],
    },
  },
  {
    name: "database_query",
    description: `Execute a SQL query directly against the local Supabase PostgreSQL database.
Use for quick data inspection, debugging, or ad-hoc queries without creating migrations.

Returns query results as formatted table.`,
    input_schema: {
      type: "object" as const,
      properties: {
        sql: { type: "string", description: "SQL query to execute" },
        format: { type: "string", description: "Output format: table, json, csv (default: table)" },
      },
      required: ["sql"],
    },
  },
  {
    name: "database",
    description: `Create and query SQLite databases in /workspace/. Use for full-stack apps with local data.

Actions:
• "create_db" — Create a new SQLite database
• "execute_sql" — Run SQL queries (SELECT, INSERT, CREATE TABLE, etc.)
• "schema" — Show all tables and their columns
• "seed" — Insert sample data from a JSON array
• "migrate" — Run a migration SQL file`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: create_db, execute_sql, schema, seed, migrate",
        },
        db_name: { type: "string", description: "Database filename (default: 'app.db')" },
        sql: { type: "string", description: "SQL query or migration script" },
        table: { type: "string", description: "Table name (for seed/schema)" },
        data: { type: "string", description: "JSON array of rows for seed action" },
      },
      required: ["action"],
    },
  },
  {
    name: "generate_asset",
    description: `Generate a visual asset (logo, icon, hero placeholder) for the project.
Creates professional SVG assets with gradients, typography, and brand colors.
For icons/logos: generates gradient SVG with initials. For other styles: creates styled placeholder.

The generated asset is saved to /workspace/public/ for use in the web app.
Note: This generates SVG graphics, not AI-generated photographic images.`,
    input_schema: {
      type: "object" as const,
      properties: {
        prompt: { type: "string", description: "Detailed description of the image to generate" },
        filename: { type: "string", description: "Output filename (default: generated-asset.png)" },
        width: { type: "number", description: "Image width (default: 512)" },
        height: { type: "number", description: "Image height (default: 512)" },
        style: {
          type: "string",
          description:
            "Style: icon, logo, hero, illustration, photo, avatar (default: illustration)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "lighthouse_audit",
    description: `Run a Lighthouse audit on the preview URL for performance, accessibility, SEO, and PWA scores.
Returns scores (0-100) for each category plus specific recommendations.

Use after building to verify quality before delivery.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to audit (default: http://localhost:8080)" },
        categories: {
          type: "string",
          description:
            "Categories: performance,accessibility,best-practices,seo,pwa (default: all)",
        },
      },
    },
  },
  {
    name: "api_test",
    description: `Test REST API endpoints systematically.
Sends HTTP requests and validates responses (status codes, body structure, headers).

Use to verify your API endpoints are working correctly before delivery.`,
    input_schema: {
      type: "object" as const,
      properties: {
        base_url: { type: "string", description: "Base URL (default: http://localhost:8080)" },
        endpoints: {
          type: "string",
          description:
            'JSON array of endpoints: [{"method":"GET","path":"/api/users","expected_status":200}]',
        },
      },
      required: ["endpoints"],
    },
  },
  {
    name: "send_email",
    description: `Send a notification (e.g., when a long-running build completes).
Saves the notification to /workspace/.notifications.jsonl and logs it.
The gateway orchestrator can pick up these notifications for delivery.`,
    input_schema: {
      type: "object" as const,
      properties: {
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body (supports HTML)" },
        to: { type: "string", description: "Recipient email (default: user's configured email)" },
      },
      required: ["subject", "body"],
    },
  },
  {
    name: "search_packages",
    description: `Search for packages on npm or PyPI to find the right library for a task.
Returns package name, description, version, and weekly downloads.

Use before installing to verify the correct package name.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (e.g., 'react date picker')" },
        registry: { type: "string", description: "Registry: npm, pypi (default: npm)" },
        limit: { type: "number", description: "Max results (default: 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "docker_compose",
    description: `Manage multi-container applications using Docker Compose.
Start, stop, and manage services like Redis, PostgreSQL, custom workers.

Actions:
• "up" — Start all services (or specific ones)
• "down" — Stop and remove all services
• "status" — Show running services
• "logs" — Show service logs
• "create" — Generate a docker-compose.yml from a template`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: up, down, status, logs, create" },
        services: {
          type: "string",
          description: "Specific services to target (space-separated, default: all)",
        },
        compose_yaml: {
          type: "string",
          description: "Docker Compose YAML content (for create action)",
        },
        follow: {
          type: "boolean",
          description: "Follow logs in real-time (for logs action, default: false)",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "container_manage",
    description: `Smart GPU container lifecycle management.
Auto-starts/stops specialized containers on demand to minimize resource usage.

Actions:
• "start" — Start a container (exec, comfyui, ml, kali, playwright)
• "stop" — Stop a container
• "status" — Check status of all containers
• "ensure" — Start only if not already running (idempotent)

Container types:
• "exec" — General sandbox (always running)
• "comfyui" — GPU image/video generation (starts on demand)
• "ml" — GPU machine learning (starts on demand)
• "kali" — Penetration testing (starts on demand)
• "playwright" — Browser automation (starts on demand)

GPU containers auto-stop after idle timeout to free VRAM.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: start, stop, status, ensure" },
        container_type: {
          type: "string",
          description: "Container: exec, comfyui, ml, kali, playwright",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "bundle_analyze",
    description: `Analyze JavaScript bundle size and find optimization opportunities.
Shows: total size, largest modules, tree-shaking opportunities, duplicate dependencies.

Use after building to verify your app loads fast.`,
    input_schema: {
      type: "object" as const,
      properties: {
        build_dir: { type: "string", description: "Build output directory (default: dist)" },
        detail: {
          type: "boolean",
          description: "Show detailed per-file breakdown (default: false)",
        },
      },
    },
  },
  {
    name: "diff_patch",
    description: `Generate or apply file diffs and patches.

Actions:
• "diff" — Show diff between two files or current changes
• "patch" — Apply a patch file
• "staged" — Show currently staged git changes`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: diff, patch, staged" },
        file_a: { type: "string", description: "First file path (for diff)" },
        file_b: { type: "string", description: "Second file path (for diff)" },
        patch_content: { type: "string", description: "Patch content to apply (for patch action)" },
      },
      required: ["action"],
    },
  },
  {
    name: "monitor_logs",
    description: `Monitor and analyze application logs in real-time.
Tails log output, detects errors, and provides summaries.

Use after starting a dev server to catch runtime errors and verify the app works.`,
    input_schema: {
      type: "object" as const,
      properties: {
        source: {
          type: "string",
          description: "Log source: dev-server, docker, file (default: dev-server)",
        },
        file_path: { type: "string", description: "Log file path (for file source)" },
        duration: { type: "number", description: "Seconds to monitor (default: 10)" },
        filter: { type: "string", description: "Filter pattern (e.g., 'error', 'warn')" },
      },
    },
  },
  {
    name: "seo_meta",
    description: `Generate SEO metadata, Open Graph images, sitemap.xml, and robots.txt.

Actions:
• "meta" — Generate meta tags for all pages
• "og-image" — Generate Open Graph social preview image
• "sitemap" — Generate sitemap.xml
• "robots" — Generate robots.txt
• "all" — Generate everything`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: meta, og-image, sitemap, robots, all" },
        site_url: { type: "string", description: "Production site URL (e.g., https://myapp.com)" },
        title: { type: "string", description: "Site title" },
        description: { type: "string", description: "Site description" },
        pages: { type: "string", description: "JSON array of page paths (for sitemap)" },
      },
      required: ["action"],
    },
  },
  {
    name: "security_scan",
    description: `Scan the project for security vulnerabilities and best practices.

Checks:
• npm/yarn audit for dependency vulnerabilities
• Hardcoded secrets/API keys in source
• Common security anti-patterns (eval, innerHTML, SQL injection)
• HTTPS enforcement, CORS settings, CSP headers
• Outdated dependencies`,
    input_schema: {
      type: "object" as const,
      properties: {
        scope: { type: "string", description: "Scope: deps, secrets, code, all (default: all)" },
        fix: {
          type: "boolean",
          description: "Auto-fix vulnerabilities where possible (default: false)",
        },
      },
    },
  },
  {
    name: "provision_n8n_workflow",
    description: `Provision an automated n8n workflow for the current sandbox environment.

Actions:
• web-scraper: Scrape a URL and post results to a webhook
• rss-monitor: Follow an RSS feed and filter by keyword
• api-research: Pipeline for executing and processing API calls
• data-pipeline: Process input data to output data
• email-sender: Send emails automatically
• scheduled-check: Cron-based regular HTTP checks
• webhook-relay: Receive and forward webhooks`,
    input_schema: {
      type: "object" as const,
      properties: {
        template_type: {
          type: "string",
          description:
            "Template type: web-scraper, rss-monitor, api-research, data-pipeline, email-sender, scheduled-check, webhook-relay",
        },
        params: {
          type: "string",
          description:
            'A JSON string of parameters for the workflow (e.g., {"url": "..."}, {"selector": "body"})',
        },
      },
      required: ["template_type"],
    },
  },
  {
    name: "env_manager",
    description: `Manage .env and .env.local files for the project.
Safely read, write, and update environment variables without exposing secrets in logs.

Actions:
• "set" — Set one or more environment variables (creates file if missing)
• "get" — Read the value of a specific variable
• "list" — List all variable names (values masked)
• "template" — Generate a .env.example template from current .env

For Supabase projects, auto-generates VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
from the running Supabase instance.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: set, get, list, template" },
        file: { type: "string", description: "Env file path (default: /workspace/.env.local)" },
        key: { type: "string", description: "Variable name (for set/get)" },
        value: { type: "string", description: "Variable value (for set)" },
        vars: {
          type: "string",
          description:
            'JSON object of key-value pairs for bulk set (e.g., {"VITE_API_URL": "http://localhost:3000"})',
        },
      },
      required: ["action"],
    },
  },
  {
    name: "pwa_setup",
    description: `Set up Progressive Web App (PWA) features for a Vite + React project.

Creates all PWA assets:
• manifest.json with app name, icons, colors, display mode
• Service worker with caching strategies (cache-first for assets, network-first for API)
• Offline fallback page
• PWA icon set (192x192 and 512x512) generated from project name
• Registers the service worker in index.html
• Adds meta tags for iOS/Android install prompts

After running this, the app can be installed as a native-like app on any device.`,
    input_schema: {
      type: "object" as const,
      properties: {
        app_name: { type: "string", description: "App display name" },
        short_name: { type: "string", description: "Short name for icon (max 12 chars)" },
        primary_color: { type: "string", description: "Theme color (hex, default: '#2563eb')" },
        background_color: {
          type: "string",
          description: "Background color (hex, default: '#ffffff')",
        },
        description: { type: "string", description: "App description for the manifest" },
        cache_strategy: {
          type: "string",
          description:
            "Caching strategy: cache-first, network-first, stale-while-revalidate (default: cache-first)",
        },
      },
      required: ["app_name"],
    },
  },
  {
    name: "css_audit",
    description: `Audit CSS/Tailwind usage in a project for quality issues.

Checks:
• Unused CSS classes (dead code)
• Duplicate declarations
• Inconsistent spacing/sizing values
• Color usage (inline hex vs design tokens)
• Specificity issues (deep nesting, !important abuse)
• Accessibility contrast ratios
• Performance (large selectors, excessive animations)

Returns a structured report with file locations and fix suggestions.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project root (default: /workspace)" },
        focus: {
          type: "string",
          description: "Focus area: all, colors, spacing, unused, accessibility (default: all)",
        },
      },
    },
  },
  {
    name: "figma_to_code",
    description: `Extract design tokens from a Figma file and generate code.

Modes:
• "tokens" — Extract colors, typography, spacing, shadows as CSS/Tailwind tokens
• "component" — Generate a React component from a Figma node description
• "theme" — Generate a full Tailwind theme config from Figma styles

Requires a Figma personal access token (FIGMA_TOKEN env var) for API access.
If no token, falls back to manual token input via description.`,
    input_schema: {
      type: "object" as const,
      properties: {
        figma_url: { type: "string", description: "Figma file or node URL" },
        mode: { type: "string", description: "Mode: tokens, component, theme (default: tokens)" },
        component_description: {
          type: "string",
          description: "Description of the component to generate (for component mode)",
        },
        output_format: {
          type: "string",
          description: "Output: css, tailwind, scss (default: tailwind)",
        },
      },
      required: ["figma_url"],
    },
  },
  {
    name: "figma_to_react",
    description: `Convert Figma designs to React + Tailwind components. Requires FIGMA_ACCESS_TOKEN env var.
Extracts nodes from Figma file → generates TSX + Tailwind CSS files.`,
    input_schema: {
      type: "object" as const,
      properties: {
        file_url: { type: "string", description: "Figma file URL" },
        node_ids: {
          type: "string",
          description: "Comma-separated node IDs to extract (default: all top-level frames)",
        },
        output_dir: {
          type: "string",
          description: "Output directory (default: /workspace/src/components)",
        },
      },
      required: ["file_url"],
    },
  },
  {
    name: "supabase_rls",
    description: `Generate Row Level Security (RLS) policies for Supabase tables.
Converts natural language rules into PostgreSQL RLS policy statements.

Examples of natural language input:
• "Users can only see their own profiles"
• "Admins can edit any row, regular users can only edit their own"
• "Public read access, authenticated write access"
• "Team members can view projects belonging to their team"

Generates: CREATE POLICY statements, enables RLS on the table,
and optionally runs the SQL against the connected Supabase instance.`,
    input_schema: {
      type: "object" as const,
      properties: {
        table_name: { type: "string", description: "Table to add RLS to" },
        rules: { type: "string", description: "Natural language description of access rules" },
        apply: {
          type: "boolean",
          description: "Execute the SQL immediately (default: false — just generate)",
        },
        schema: { type: "string", description: "Schema name (default: public)" },
      },
      required: ["table_name", "rules"],
    },
  },
  {
    name: "supabase_types",
    description: `Generate TypeScript types from a running Supabase database schema.
Uses 'supabase gen types typescript' or queries information_schema.

Outputs a clean types file with:
• Database type (Tables, Views, Functions)
• Row, Insert, Update types per table
• Enum types
• Relationship helper types

Requires Supabase CLI and a running local or remote Supabase instance.`,
    input_schema: {
      type: "object" as const,
      properties: {
        output_path: {
          type: "string",
          description: "Output file (default: /workspace/src/types/database.ts)",
        },
        project_id: {
          type: "string",
          description: "Supabase project ID (for remote gen — optional)",
        },
      },
    },
  },
  {
    name: "supabase_edge_fn",
    description: `Scaffold and deploy a Supabase Edge Function (Deno).

Actions:
• "create" — Scaffold a new edge function with boilerplate
• "deploy" — Deploy a function to the running Supabase instance
• "list" — List all edge functions
• "test" — Test-invoke a function locally
• "logs" — View function logs

Templates for create:
• "api" — REST API handler
• "webhook" — Webhook receiver
• "cron" — Scheduled function
• "auth-hook" — Auth event handler
• "stripe" — Stripe webhook handler`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Action: create, deploy, list, test, logs" },
        function_name: { type: "string", description: "Function name (slug format)" },
        template: {
          type: "string",
          description: "Template: api, webhook, cron, auth-hook, stripe (for create)",
        },
        body: { type: "string", description: "Request body JSON (for test)" },
      },
      required: ["action"],
    },
  },
  {
    name: "supabase_storage",
    description: `Manage files in Supabase Storage buckets.

Actions:
• "list-buckets" — List all storage buckets
• "create-bucket" — Create a new storage bucket
• "upload" — Upload a file to a bucket
• "download" — Download a file from a bucket
• "list" — List files in a bucket
• "delete" — Delete a file from a bucket
• "url" — Get a public/signed URL for a file

Requires Supabase running locally or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: list-buckets, create-bucket, upload, download, list, delete, url",
        },
        bucket: { type: "string", description: "Bucket name" },
        file_path: {
          type: "string",
          description: "Local file path (for upload) or remote path (for download/delete)",
        },
        remote_path: { type: "string", description: "Remote path in the bucket" },
        public: { type: "boolean", description: "Make bucket/file public (default: false)" },
      },
      required: ["action"],
    },
  },
  {
    name: "brand_save",
    description: `Save a company's brand identity for reuse in future document generation.
Stores colors, fonts, logo path, tagline, and other brand assets in a persistent registry.

After saving, any document generation (presentations, PDFs, websites) can use brand_load
to apply this company's branding automatically.

The branding data persists across container restarts (stored in /workspace/.brands/).`,
    input_schema: {
      type: "object" as const,
      properties: {
        company: { type: "string", description: "Company name (used as key)" },
        primary_color: {
          type: "string",
          description: "Primary brand color (hex, e.g., '#2563eb')",
        },
        secondary_color: { type: "string", description: "Secondary brand color (hex)" },
        accent_color: { type: "string", description: "Accent/highlight color (hex)" },
        background_color: {
          type: "string",
          description: "Background color (hex, default: '#ffffff')",
        },
        text_color: { type: "string", description: "Main text color (hex, default: '#1a1a1a')" },
        font_heading: {
          type: "string",
          description: "Heading font family (e.g., 'Inter', 'Poppins')",
        },
        font_body: {
          type: "string",
          description: "Body font family (e.g., 'Open Sans', 'Roboto')",
        },
        logo_url: { type: "string", description: "URL or path to company logo" },
        tagline: { type: "string", description: "Company tagline/slogan" },
        description: { type: "string", description: "Brief company description" },
        industry: { type: "string", description: "Company industry/sector" },
        website: { type: "string", description: "Company website URL" },
      },
      required: ["company", "primary_color"],
    },
  },
  {
    name: "brand_load",
    description: `Load a previously saved company brand identity from the persistent registry.
Returns all brand data (colors, fonts, logo, tagline, etc.) as JSON.

Use this BEFORE generating any branded document — apply the colors, fonts, and logo
from the returned branding data to ensure consistent brand identity across all outputs.

If the brand doesn't exist, returns null — you should then use web_scrape to extract
branding from the company's website and brand_save to persist it.`,
    input_schema: {
      type: "object" as const,
      properties: {
        company: { type: "string", description: "Company name to look up" },
      },
      required: ["company"],
    },
  },
  {
    name: "color_palette",
    description: `Generate a harmonious color palette from a seed color.
Uses HSL color math — no API key required.

Modes:
• "complementary" — seed + opposite hue
• "analogous" — seed + adjacent hues (±30°)
• "triadic" — 3 evenly spaced hues
• "split-complementary" — seed + two adjacent to complement
• "tetradic" — 4 evenly spaced hues
• "monochromatic" — same hue, varied lightness/saturation
• "from-image" — extract dominant colors from an image file

Returns hex codes, HSL values, and Tailwind-compatible CSS custom properties.`,
    input_schema: {
      type: "object" as const,
      properties: {
        seed_color: {
          type: "string",
          description: "Seed color in hex (e.g., '#2563eb') or CSS name",
        },
        mode: {
          type: "string",
          description:
            "Palette mode: complementary, analogous, triadic, split-complementary, tetradic, monochromatic, from-image (default: triadic)",
        },
        count: { type: "number", description: "Number of colors (default: 5, max: 12)" },
        image_path: { type: "string", description: "Path to image (for from-image mode)" },
      },
      required: ["seed_color"],
    },
  },
  {
    name: "font_pair",
    description: `Suggest Google Font pairings for a design project.
Returns heading + body font combinations with Google Fonts import URLs.

Styles:
• "modern" — clean sans-serif pairs (Inter + Roboto, Outfit + Source Sans)
• "classic" — serif + sans combos (Playfair Display + Lato, Merriweather + Open Sans)
• "bold" — high-impact display fonts (Bebas Neue + Montserrat, Oswald + Raleway)
• "elegant" — refined serif combos (Cormorant Garant + Nunito, Libre Baskerville + Poppins)
• "tech" — techy/monospace pairings (Space Grotesk + JetBrains Mono, IBM Plex Sans + IBM Plex Mono)
• "brand" — if a company name is given, suggests fonts that match its industry

Each suggestion includes the Google Fonts link tag and CSS declarations.`,
    input_schema: {
      type: "object" as const,
      properties: {
        style: {
          type: "string",
          description: "Style category: modern, classic, bold, elegant, tech, brand",
        },
        brand_name: {
          type: "string",
          description: "Company/brand name (for brand-matched suggestions)",
        },
      },
      required: ["style"],
    },
  },
  {
    name: "responsive_test",
    description: `Take screenshots of a running web app at multiple breakpoints using Playwright.
Captures the page at 5 standard widths and saves PNG files.

Breakpoints: 375px (mobile), 768px (tablet), 1024px (small desktop), 1440px (desktop), 1920px (widescreen)

Requires a dev server running in the sandbox (port 8080 by default).
Returns file paths to all screenshots.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to screenshot (default: http://localhost:8080)" },
        route: { type: "string", description: "Page route to test (e.g., '/login', '/dashboard')" },
        output_dir: {
          type: "string",
          description: "Output directory (default: /workspace/screenshots)",
        },
        wait_ms: { type: "number", description: "Wait time after page load in ms (default: 2000)" },
      },
    },
  },
  {
    name: "mcp_connect",
    description: `Connect to MCP (Model Context Protocol) servers for external data access.

Actions:
• "connect" — Connect to an MCP server by URL
• "list_tools" — List available tools from connected server
• "call_tool" — Call a tool on the MCP server
• "disconnect" — Disconnect from server

Supports: PostgreSQL, GitHub, Google Drive, Slack MCP servers.`,
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: connect, list_tools, call_tool, disconnect",
        },
        server_url: { type: "string", description: "MCP server URL (for connect)" },
        tool_name: { type: "string", description: "Tool name (for call_tool)" },
        tool_params: { type: "string", description: "JSON params for the tool call" },
      },
      required: ["action"],
    },
  },
  {
    name: "api_mock",
    description: `Generate a mock API server from an OpenAPI spec or JSON schema.
Runs Express on port 3001 with CORS enabled. Returns list of available endpoints.`,
    input_schema: {
      type: "object" as const,
      properties: {
        schema: { type: "string", description: "OpenAPI/JSON schema content or file path" },
        port: { type: "number", description: "Port to run mock server on (default: 3001)" },
        endpoints: {
          type: "string",
          description: "JSON array of endpoint definitions [{method, path, response}]",
        },
      },
      required: [],
    },
  },
  {
    name: "perf_audit",
    description: `Run Lighthouse performance audit on a running web app. Returns performance score, FCP, LCP, CLS, and recommendations.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to audit (default: http://localhost:8080)" },
        categories: {
          type: "string",
          description:
            "Comma-separated: performance,accessibility,best-practices,seo (default: all)",
        },
      },
      required: [],
    },
  },
  {
    name: "a11y_audit",
    description: `Run WCAG accessibility audit using axe-core. Returns violations with impact levels and fix suggestions.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to audit (default: http://localhost:8080)" },
      },
      required: [],
    },
  },
  {
    name: "seo_audit",
    description: `Run SEO analysis on a web page. Checks title, meta, headings, alt text, structured data, Open Graph, and more.`,
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to audit (default: http://localhost:8080)" },
      },
      required: [],
    },
  },
  {
    name: "i18n_setup",
    description: `Auto-internationalize a React app. Scans components for hardcoded strings, generates i18next config + translation JSON files.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
        languages: {
          type: "string",
          description: "Comma-separated language codes (default: en,ar,es,fr,de,zh,ja)",
        },
      },
      required: [],
    },
  },
  {
    name: "storybook_generate",
    description: `Generate Storybook stories for React components. Scans src/components/ and creates .stories.tsx files with variant examples.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
        components_dir: {
          type: "string",
          description: "Components directory (default: src/components)",
        },
      },
      required: [],
    },
  },
  {
    name: "env_sync",
    description:
      "Sync env vars between local, Docker, and cloud. Actions: pull, push, diff, template (.env.example), validate, merge.",
    input_schema: {
      type: "object" as const,
      properties: {
        action: {
          type: "string",
          description: "Action: pull, push, diff, template, validate, merge",
        },
        platform: { type: "string", description: "Platform: vercel, railway, fly, heroku, docker" },
        env_file: { type: "string", description: "Local .env path (default: /workspace/.env)" },
        project_name: { type: "string", description: "Remote project ID" },
        template_file: { type: "string", description: "Template .env for validate" },
        files: { type: "string", description: "Comma-separated .env files for merge" },
        environment: { type: "string", description: "Target: development, staging, production" },
      },
      required: ["action"],
    },
  },
  {
    name: "template_seed",
    description: `Seed a project from pre-built boilerplate templates.
Each template includes a complete, working app with all dependencies.

Templates:
• "saas-dashboard" — React + Supabase + Tailwind: auth, billing, dashboard, admin
• "ecommerce" — Next.js + Supabase + Stripe: products, cart, checkout, orders
• "landing-page" — React + Tailwind: hero, features, pricing, CTA, testimonials
• "portfolio" — React + Framer Motion: projects grid, about, contact, blog
• "blog-platform" — Next.js + Supabase: posts, categories, comments, SEO
• "mobile-pwa" — React + PWA + Supabase: offline-first, push notifications
• "admin-panel" — React + Supabase: CRUD, users, roles, audit logs
• "api-server" — Express + Supabase: REST API, auth middleware, rate limiting
• "chrome-extension" — React + Manifest V3: popup, content script, storage
• "ai-chat-app" — React + Supabase + OpenAI: chat UI, streaming, message history

After seeding, use scaffold_project + supabase_rls + supabase_types for full setup.`,
    input_schema: {
      type: "object" as const,
      properties: {
        template: { type: "string", description: "Template name (see list above)" },
        project_name: { type: "string", description: "Project name (default: my-app)" },
        output_dir: {
          type: "string",
          description: "Output directory (default: /workspace/<project_name>)",
        },
        supabase: {
          type: "boolean",
          description: "Initialize Supabase project (default: true if template uses Supabase)",
        },
      },
      required: ["template"],
    },
  },
  {
    name: "preview_app",
    description: `Start a development server and return the live preview URL.
Works with: React (Vite), Next.js, Express, static HTML.

Auto-detects the project type and runs the appropriate dev command.
The preview is accessible at http://localhost:8080 (mapped from sandbox port).

If a server is already running, returns the existing URL.`,
    input_schema: {
      type: "object" as const,
      properties: {
        project_dir: { type: "string", description: "Project directory (default: /workspace)" },
        port: { type: "number", description: "Port inside sandbox (default: 8080)" },
        build_first: {
          type: "boolean",
          description: "Run npm build before starting (default: false)",
        },
      },
    },
  },
];
