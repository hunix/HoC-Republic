/**
 * Sandbox Core Tools — Basic sandbox operations
 * Handles: sandbox_exec, sandbox_write_file, sandbox_read_file, sandbox_list_files, sandbox_install
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createSandboxCoreHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile, sandboxReadFile, sandboxListFiles } = ctx;

  return {
    sandbox_exec: async (input: ToolInput) => {
      const { command = "echo 'no command'", cwd = "/workspace", timeout = 60 } = input;
      const isInstallCmd = /\b(npm install|yarn add|pip install|apt-get install|cargo install|pnpm install)\b/.test(command);
      const maxTimeout = isInstallCmd ? 600 : 300;
      const result = await sandboxExec(command, cwd, Math.min(timeout, maxTimeout));
      const out = [`Exit code: ${result.exitCode} (${result.durationMs}ms)`];
      if (result.stdout.trim()) { out.push(`stdout:\n${result.stdout.slice(0, 8000)}`); }
      if (result.stderr.trim()) { out.push(`stderr:\n${result.stderr.slice(0, 4000)}`); }
      return out.join("\n");
    },

    sandbox_write_file: async (input: ToolInput) => {
      const { path = "/workspace/file.txt", content = "" } = input;
      const parentDir = path.substring(0, path.lastIndexOf("/"));
      if (parentDir && parentDir !== "/workspace") {
        await sandboxExec(`mkdir -p ${parentDir}`, "/workspace", 5);
      }
      const ok = await sandboxWriteFile(path, content);
      return ok ? `File written: ${path} (${content.length} bytes)` : `Failed to write: ${path}`;
    },

    sandbox_read_file: async (input: ToolInput) => {
      const { path = "/workspace" } = input;
      const content = await sandboxReadFile(path);
      return content !== null ? content.slice(0, 16000) : `File not found: ${path}`;
    },

    sandbox_list_files: async (input: ToolInput) => {
      const { path = "/workspace" } = input;
      const entries = await sandboxListFiles(path);
      return entries
        .map((e) => `${e.type === "directory" ? "📁" : "📄"} ${e.name} (${e.size}B)`)
        .join("\n") || "Empty directory";
    },

    sandbox_install: async (input: ToolInput) => {
      const { manager = "pip", packages = "" } = input;
      let cmd: string;
      switch (manager) {
        case "pip":
          cmd = `pip install --quiet ${packages}`;
          break;
        case "npm":
          cmd = `cd /workspace && npm install ${packages}`;
          break;
        case "apt":
          cmd = `apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ${packages}`;
          break;
        case "cargo":
          cmd = `cargo install ${packages}`;
          break;
        default:
          return `Unknown package manager: ${manager}`;
      }
      const result = await sandboxExec(cmd, "/workspace", 180);
      return `Install ${result.exitCode === 0 ? "✅ succeeded" : "❌ failed"} (${result.durationMs}ms)\n${result.stdout.slice(-2000)}${result.stderr ? "\n" + result.stderr.slice(-1000) : ""}`;
    },
  };
}

export const sandboxCoreSummary: ToolSummaryMap = {
  sandbox_exec: (input) => `\`${(input.command ?? "").slice(0, 120)}\``,
  sandbox_write_file: (input) => `→ \`${input.path ?? ""}\` (${(input.content ?? "").length} bytes)`,
  sandbox_read_file: (input) => `← \`${input.path ?? ""}\``,
  sandbox_list_files: (input) => `📁 \`${input.path ?? "/workspace"}\``,
  sandbox_install: (input) => `${input.manager ?? "pip"} install ${input.packages ?? ""}`,
};
