/**
 * Tool Executor — dispatches tool calls to the appropriate handler.
 *
 * Handles:
 *   - Native Anthropic Computer Use tools (bash, computer, str_replace_editor)
 *   - Knowledge Graph tools (knowledge_graph_query, knowledge_store)
 *   - Modular handler map (O(1) lookup from sandbox-tools/)
 *   - Legacy switch fallback
 */

import type { ToolInput } from "../sandbox-tool-defs.js";
import type { SandboxContext, ToolInput as ModularToolInput } from "../sandbox-tools/index.js";
import { key } from "../agent-providers/index.js";
import {
  sandboxExec,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  isContainerRunning,
} from "../agent-sandbox.js";
import { createAllHandlers, allSummaries } from "../sandbox-tools/index.js";
import { ensureWarmPoolSweep, touchContainer } from "../sandbox-warm-pool.js";

// ─── Handler Map ────────────────────────────────────────────────

// Lazy-initialized handler map (created once, then O(1) dispatch)
let _handlerMap: (ReturnType<typeof createAllHandlers> & Record<string, unknown>) | null = null;

export async function getHandlerMap() {
  if (!_handlerMap) {
    const ctx: SandboxContext = {
      sandboxExec,
      sandboxWriteFile,
      sandboxReadFile,
      sandboxListFiles,
      key,
      ensureWarmPoolSweep,
      touchContainer,
      // Lazy-ref: populated after createAllHandlers returns
      getAllHandlers: () => _handlerMap!,
    };
    _handlerMap = createAllHandlers(ctx);
  }
  return _handlerMap;
}

// Re-export allSummaries so the orchestrator can access it
export { allSummaries };

// Shared sandbox API base URL — matches the port published in agent-sandbox.ts
const SANDBOX_API_BASE = `http://127.0.0.1:${process.env.SANDBOX_API_PORT ?? "3100"}`;

// ─── Main Tool Executor ─────────────────────────────────────────

export async function executeTool(toolName: string, input: ToolInput): Promise<string> {
  // ── Native Anthropic Computer Use Handlers ──
  if (toolName === "bash") {
    const bashInput = input as Record<string, string>;
    // Verify sandbox is reachable before proxying
    if (!isContainerRunning()) {
      return "⚠️ Sandbox container is not running. Ask the user to start it from the Agent Desktop page, then retry.";
    }
    const res = await sandboxExec(bashInput.command || 'echo "ready"', "/workspace", 60);
    return res.exitCode === 0 ? res.stdout || "Success" : `Error ${res.exitCode}: ${res.stderr}`;
  }
  if (toolName === "computer") {
    const action = (input as Record<string, unknown>).action;
    // Guard: tell the user explicitly if the sandbox is down instead of silent ECONNREFUSED
    if (!isContainerRunning()) {
      return "⚠️ Sandbox container is not running. The GUI desktop is unavailable. Ask the user to start the sandbox from the Agent Desktop page, then retry.";
    }
    try {
      const res = await fetch(`${SANDBOX_API_BASE}/computer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return `Error: Sandbox API returned HTTP ${res.status}: ${errText.slice(0, 200)}`;
      }
      const data = (await res.json()) as { ok: boolean; error?: string; screenshot_b64?: string };
      if (!data.ok) {
        return `Error: ${data.error || "Unknown computer tool error"}`;
      }
      // Return base64 screenshot so the chat UI can render it inline
      if (data.screenshot_b64) {
        return `PREVIEW_READY|${data.screenshot_b64}`;
      }
      return `Success: Action '${String(action)}' completed.`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        return "⚠️ Cannot connect to sandbox API on port 3100. The container may have just started — wait 5 seconds and retry.";
      }
      return `Error proxying to computer: ${msg}`;
    }
  }
  if (toolName === "str_replace_editor") {
    const edInput = input as Record<string, string>;
    if (edInput.command === "view") {
      return (await sandboxReadFile(edInput.path)) || "Error: file not found";
    }
    if (edInput.command === "create") {
      await sandboxWriteFile(edInput.path, edInput.file_text || "");
      return "Success: File created.";
    }
    // Use a temp Python script to avoid shell injection via inline code
    const pyScript = [
      "import sys, json",
      "args = json.loads(sys.stdin.read())",
      "c = open(args['path'], 'r').read()",
      "if args['old'] not in c:",
      "    print('Error: old_str not found in file'); sys.exit(1)",
      "c = c.replace(args['old'], args['new'], 1)",
      "open(args['path'], 'w').write(c)",
      "print('Edited.')",
    ].join("\n");
    const stdinPayload = JSON.stringify({
      path: edInput.path,
      old: edInput.old_str || "",
      new: edInput.new_str || "",
    });
    await sandboxWriteFile("/tmp/.str_replace_script.py", pyScript);
    await sandboxWriteFile("/tmp/.str_replace_input.json", stdinPayload);
    const res = await sandboxExec(
      "python3 /tmp/.str_replace_script.py < /tmp/.str_replace_input.json",
      "/workspace",
      10,
    );
    return res.exitCode === 0 ? res.stdout || "Edited." : `Error: ${res.stderr}`;
  }
  // ── Knowledge Graph Tools (in-process, no sandbox needed) ──
  if (toolName === "knowledge_graph_query") {
    const { queryAgentKnowledge } = await import("../sandbox-knowledge-bridge.js");
    const query = ((input as Record<string, unknown>).query as string) || "";
    const depth = ((input as Record<string, unknown>).depth as number) || 2;
    if (!query) {
      return "Error: query parameter is required";
    }
    const result = await queryAgentKnowledge(query, depth);
    return (
      `🧠 Knowledge Graph Query: "${query}"\n\n${result.summary}\n\n` +
      (result.memoryGraph.nodes.length > 0
        ? `**Entities (${result.memoryGraph.nodes.length}):**\n${result.memoryGraph.nodes.map((n) => `  • ${n.label} (${n.type}, importance: ${(n.importance * 100).toFixed(0)}%)`).join("\n")}\n\n`
        : "") +
      (result.mem0Facts.length > 0
        ? `**Facts (${result.mem0Facts.length}):**\n${result.mem0Facts.map((f) => `  • ${f.memory} [${f.categories.join(", ")}] (score: ${(f.score * 100).toFixed(0)}%)`).join("\n")}`
        : "")
    );
  }
  if (toolName === "knowledge_store") {
    const { storeAgentKnowledge } = await import("../sandbox-knowledge-bridge.js");
    const label = ((input as Record<string, unknown>).label as string) || "";
    const type = (((input as Record<string, unknown>).type as string) || "concept") as
      | "entity"
      | "concept"
      | "event"
      | "skill";
    const importance = ((input as Record<string, unknown>).importance as number) || 0.7;
    const relatedTo = ((input as Record<string, unknown>).related_to as string) || undefined;
    if (!label) {
      return "Error: label parameter is required";
    }
    const result = storeAgentKnowledge(label, type, importance, relatedTo);
    return result.stored
      ? `🧠 Stored: "${label}" (${type}, importance: ${(importance * 100).toFixed(0)}%)${relatedTo ? ` → linked to "${relatedTo}"` : ""}`
      : "Error: Failed to store knowledge";
  }

  // ── Try modular handler map first (O(1) lookup) ──
  const handlers = await getHandlerMap();
  const handler = handlers[toolName];
  if (handler) {
    return handler(input as ModularToolInput);
  }

  // ── Fallback: legacy switch (for handlers not yet migrated) ──
  switch (toolName) {
    default:
      return `Error: Tool '${toolName}' not implemented in new modular handler architecture nor in legacy switch.`;
  }
}
