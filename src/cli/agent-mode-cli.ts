/**
 * Agent Mode CLI — Lightweight Manus-like chat gateway.
 *
 * Boots the gateway with only the agentic subsystems enabled:
 * chat, sandbox, tool calling, memory, LLM providers, skills.
 *
 * Republic simulation, channels, federation, and cluster services
 * are all skipped for a fast, focused boot.
 */

import type { Command } from "commander";
import { addGatewayRunCommand } from "./gateway-cli/run.js";

export function registerAgentModeCli(program: Command): void {
  const agentCmd = program
    .command("agent-mode")
    .description(
      "Start a lightweight agent gateway — chat-centric, Manus-like experience with full tool-calling",
    );

  const runCmd = agentCmd
    .command("run")
    .description("Start the agent gateway (chat + sandbox + tools only)");

  // Reuse all gateway run options (port, bind, auth, force, etc.)
  addGatewayRunCommand(runCmd);

  // Wrap the original action so we inject agent-mode env vars BEFORE
  // the gateway starts.
  const originalAction = (runCmd as unknown as { _actionHandler?: Function })._actionHandler;
  if (originalAction) {
    (runCmd as unknown as { _actionHandler: Function })._actionHandler = function (
      this: unknown,
      ...actionArgs: unknown[]
    ) {
      // ── Inject agent-mode environment variables ──────────────────
      process.env.HOC_AGENT_MODE = "1";
      process.env.OPENCLAW_SKIP_CHANNELS = "1";
      process.env.OPENCLAW_SKIP_GMAIL_WATCHER = "1";

      // Print agent mode banner
      const banner = [
        "",
        "  ┌─────────────────────────────────────────┐",
        "  │         🤖  HoC Agent Mode  🤖          │",
        "  │  Lightweight chat gateway — all tools    │",
        "  │  No Republic · No channels · Fast boot   │",
        "  └─────────────────────────────────────────┘",
        "",
      ];
      for (const line of banner) {
        process.stdout.write(`${line}\n`);
      }

      return (originalAction as Function).apply(this, actionArgs);
    };
  }
}
