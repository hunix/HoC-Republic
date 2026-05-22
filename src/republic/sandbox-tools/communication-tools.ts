/**
 * Communication Tools — Agent coordination, memory, and task delegation
 * Handles: delegate_task, deploy_public_url, memory_query, request_clarification,
 *          start_preview, create_skill
 */

import type { ToolInput, ToolHandlerMap, ToolSummaryMap, SandboxContext } from "./types.js";

export function createCommunicationToolsHandlers(ctx: SandboxContext): ToolHandlerMap {
  const { sandboxExec, sandboxWriteFile } = ctx;

  return {
    delegate_task: async (input: ToolInput) => {
      const { project_name = "project", plan: planJson = "{}" } = input;
      try {
        const { parseDelegationPlan, executeDelegationPlan } = await import("../sub-agent-delegation.js");
        const plan = parseDelegationPlan(planJson, project_name);
        const progressLog: string[] = [];
        const results = await executeDelegationPlan(plan, (msg: string) => {
          progressLog.push(msg);
        });
        const successCount = results.filter((r: { success: boolean }) => r.success).length;
        return [
          `Delegation complete: ${successCount}/${results.length} tasks succeeded`,
          ...progressLog,
          "",
          "--- Results ---",
          ...results.map((r: { success: boolean; id: string; sandboxType: string; output: string; error?: string }) =>
            `[${r.success ? "✅" : "❌"}] ${r.id} (${r.sandboxType}): ${r.success ? r.output.slice(0, 200) : r.error?.slice(0, 200)}`
          ),
        ].join("\n");
      } catch (e) {
        return `Delegation error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    deploy_public_url: async (input: ToolInput) => {
      const { port = 8080, tunnel_name = "sandbox-preview" } = input;
      try {
        const { startTunnel } = await import("../deploy-tunnel.js");
        const publicUrl = await startTunnel(tunnel_name, port);
        if (publicUrl) {
          return `🌐 Public URL deployed: ${publicUrl}\nShared port: ${port}\nTunnel: ${tunnel_name}\nAnyone can access this URL. Stop with: stop the tunnel "${tunnel_name}"`;
        }
        return `Failed to start tunnel. Install cloudflared: npm install -g cloudflared`;
      } catch (e) {
        return `Deploy error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    memory_query: async (input: ToolInput) => {
      const { citizen_id, activity = "software development", topic } = input;
      try {
        const { queryRelevantMemories } = await import("../memory.js");
        const cid = citizen_id || "agent";
        const context = {
          currentActivity: activity,
          topic: topic || undefined,
        };
        const memories = queryRelevantMemories(cid, context);
        return memories || "No relevant memories found for this context.";
      } catch (e) {
        return `Memory query error: ${e instanceof Error ? e.message : String(e)}`;
      }
    },

    request_clarification: async (input: ToolInput) => {
      const {
        title: wizTitle = "Clarification Needed",
        description: wizDesc = "Please select an option",
        options: optionsJson = "[]",
        step: wizStep = 1,
        total_steps: wizTotalSteps = 1,
        allow_multiple: wizMulti = false,
      } = input;
      return [
        `<wizard_card title="${wizTitle}" step="${wizStep}" totalSteps="${wizTotalSteps}" allowMultiple="${wizMulti}">`,
        `<description>${wizDesc}</description>`,
        `<options>${optionsJson}</options>`,
        `</wizard_card>`,
        "",
        "⏳ Waiting for your selection above before proceeding...",
      ].join("\n");
    },

    start_preview: async (input: ToolInput) => {
      const { message = "Preview ready" } = input;
      try {
        const snapScript = [
          "from playwright.sync_api import sync_playwright",
          "import sys",
          "with sync_playwright() as p:",
          "    browser = p.chromium.launch(headless=True)",
          '    page = browser.new_page(viewport={"width": 1280, "height": 720})',
          '    page.goto("http://localhost:8080", timeout=15000)',
          '    page.wait_for_load_state("networkidle", timeout=10000)',
          '    page.screenshot(path="/workspace/.preview-snapshot.png")',
          "    browser.close()",
        ].join("\n");
        await sandboxExec(
          `python3 -c "${snapScript.replace(/"/g, '\\"')}"`,
          "/workspace",
          30,
        );
      } catch {
        // Non-critical — snapshot capture is best-effort
      }
      return `PREVIEW_READY|${message}`;
    },

    create_skill: async (input: ToolInput) => {
      const { name = "skill", description = "", language = "python", code = "" } = input;
      const ext = language === "python" ? ".py" : language === "node" ? ".js" : ".sh";
      const skillDir = "/workspace/.skills";
      await sandboxExec(`mkdir -p ${skillDir}`, "/workspace", 5);
      const skillPath = `${skillDir}/${name}${ext}`;
      const header = language === "python"
        ? `#!/usr/bin/env python3\n# Skill: ${name}\n# ${description}\n\n`
        : language === "node"
          ? `#!/usr/bin/env node\n// Skill: ${name}\n// ${description}\n\n`
          : `#!/bin/bash\n# Skill: ${name}\n# ${description}\n\n`;
      await sandboxWriteFile(skillPath, header + code);
      await sandboxExec(`chmod +x ${skillPath}`, "/workspace", 5);
      return `Skill created: ${skillPath}\nRun with: ${language === "python" ? "python3" : language === "node" ? "node" : "bash"} ${skillPath}`;
    },
  };
}

export const communicationToolsSummary: ToolSummaryMap = {
  delegate_task: (input) => `🤖 Delegate: ${input.project_name ?? "project"}`,
  deploy_public_url: (input) => `🌐 Tunnel: port ${input.port ?? 8080}`,
  memory_query: (input) => `🧠 Memory: ${input.topic ?? input.activity ?? "query"}`,
  request_clarification: (input) => `❓ ${input.title ?? "Clarification"}`,
  start_preview: (input) => `🖼️ ${input.message ?? ""}`,
  create_skill: (input) => `💡 ${input.name ?? "skill"}`,
};
