---
name: use-claude-code
description: Use Claude Code CLI as a sub-agent for complex software development and code review. Available as sandbox tools (claude_code, claude_review) and gateway RPCs (republic.claude.*).
---

# Claude Code CLI — HoC Integration

## Overview

Claude Code CLI is installed in the agent sandbox container and available as two tools in the sandbox agent loop:

| Tool | Purpose | When to Use |
|---|---|---|
| `claude_code` | Complex software development | Full-stack apps, multi-file features, scaffolding, refactoring |
| `claude_review` | QA code review | Post-build quality check, security audit, bug detection |

## How It Works

When the orchestrator (sandbox agent loop) encounters a complex coding task, it delegates to Claude Code CLI running inside the Docker container. Claude Code autonomously plans, writes code, installs dependencies, builds, tests, and fixes errors — then returns the result.

```
Chat → Sandbox Agent Loop (Sonnet) → claude_code tool
                                       ↓
                               Claude Code CLI (in container)
                                       ↓
                               Plans → Creates files → Installs deps → Builds → Tests → Fix errors
                                       ↓
                               Returns structured JSON result
```

## Sandbox Agent Loop (Automatic)

The orchestrator automatically decides when to use `claude_code` vs manual tools:

- **Simple tasks** → `sandbox_exec` + `sandbox_write_file` (faster, cheaper)
- **Complex tasks** → `claude_code` (full-stack builds, multi-file features)
- **QA review** → `claude_review` (post-build quality check)

## CLI Reference

### Non-Interactive Mode (used by sandbox)

```bash
# Basic delegation (inside container)
claude -p "Create a React app with auth" \
  --dangerously-skip-permissions \
  --output-format json \
  --max-turns 30 \
  --effort high \
  --model claude-sonnet-4-20250514 \
  --no-session-persistence
```

### Key Flags

| Flag | Description | Default |
|---|---|---|
| `-p` / `--print` | Non-interactive mode (exits after response) | Required |
| `--dangerously-skip-permissions` | Skip all permission prompts | Required for automation |
| `--output-format json` | Structured JSON output with cost/usage | Recommended |
| `--max-turns N` | Max agentic iterations | 30 (max: 50) |
| `--effort` | Quality level: `low`, `medium`, `high`, `max` | `high` |
| `--model` | Model to use | `claude-sonnet-4-20250514` |
| `--max-budget-usd N` | Cost cap per task | No limit |
| `--no-session-persistence` | Don't save session state | Recommended |
| `--system-prompt "..."` | Custom system prompt | Uses CLAUDE.md |
| `--tools "Bash,Edit,Read"` | Restrict available tools | All tools |

### Authentication

Claude Code uses `ANTHROPIC_API_KEY` environment variable — automatically injected into the sandbox container from the gateway's env. No interactive login needed.

## Gateway RPCs (for Citizens)

Citizens can use Claude Code via gateway RPCs:

```typescript
// Check if Claude Code is available
await rpc("republic.claude.status", {});
// → { available: true, version: "1.x.x" }

// Delegate a coding task
await rpc("republic.claude.task", {
  task: "Create a REST API with Express and Prisma",
  cwd: "/workspace/api",
  maxTurns: 30,
  effort: "high",
});

// Review code quality
await rpc("republic.claude.review", {
  filePath: "src/",
  context: "Focus on security and error handling",
});
```

## CLAUDE.md — Project Memory

A `CLAUDE.md` file is placed in `/workspace/` by the sandbox. It tells Claude Code about:
- The sandbox environment (Ubuntu, Node.js 22, Python 3, Playwright)
- Project conventions (TypeScript, React, Tailwind, Vite)
- Preview server config (port 8080, bind to 0.0.0.0)
- Quality standards (strict mode, proper typing, error handling)

You can also place a project-specific `CLAUDE.md` in subdirectories.

## Cost Awareness

Claude Code tasks use API credits. Typical costs:
- Simple scaffolding: $0.05 - $0.20
- Full-stack app build: $0.50 - $2.00
- Comprehensive review: $0.20 - $0.50

Use `--max-budget-usd` to cap costs per task.

## Sandbox Environment

The agent sandbox container includes:
- **OS**: Ubuntu 22.04
- **Node.js**: 22.x (npm, pnpm)
- **Python**: 3.x (pip, venv)
- **Claude Code**: Latest (`@anthropic-ai/claude-code`)
- **Build Tools**: build-essential, git, curl, wget
- **Browser**: Chromium via Playwright (headless)
- **Preview**: Port 8080 mapped to host
