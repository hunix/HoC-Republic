/**
 * Agent Loop Helpers — utility functions for tool summaries, CodeAct extraction,
 * browser observation, and auto-RAG ingestion.
 */

import type { AgentBroadcaster } from "../agent-providers/index.js";
import type { ToolInput } from "../sandbox-tool-defs.js";
import type { ToolInput as ModularToolInput } from "../sandbox-tools/index.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { sandboxExec } from "../agent-sandbox.js";
import { allSummaries } from "./tool-executor.js";
import { executeTool } from "./tool-executor.js";

const logger = createSubsystemLogger("sandbox-agent");

// ─── Tool Summary Formatting ────────────────────────────────────

export function formatToolSummary(name: string, input: ToolInput): string {
  // ── Try modular summary map first ──
  const summaryFn = allSummaries[name];
  if (summaryFn) {
    return summaryFn(input as ModularToolInput);
  }

  // All tool summaries should be in modular allSummaries map.
  // Generic fallback for any tool not yet registered.
  const inputStr = Object.entries(input as Record<string, unknown>)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 40) : String(v)}`)
    .join(", ");
  return `🔧 ${name}(${inputStr})`;
}

// ─── CodeAct Python Block Extraction ────────────────────────────

const PYTHON_FENCE_RE = /```python\n([\s\S]*?)```/g;

/**
 * Extract Python code blocks from markdown-fenced text.
 * Only returns blocks with actual executable content (>10 chars).
 * Ignores blocks that look like documentation/examples.
 */
export function extractPythonBlocks(text: string): string[] {
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  // Reset regex lastIndex for safety
  PYTHON_FENCE_RE.lastIndex = 0;
  while ((match = PYTHON_FENCE_RE.exec(text)) !== null) {
    const code = match[1]?.trim();
    if (!code || code.length < 10) {
      continue;
    }
    // Skip documentation-style blocks (no actual statements)
    if (code.startsWith("#") && !code.includes("\n")) {
      continue;
    }
    blocks.push(code);
  }
  return blocks;
}

// ─── Auto-RAG Ingestion ─────────────────────────────────────────

const AUTO_RAG_TOOLS = new Set([
  "template_seed",
  "scaffold_project",
  "git_github",
  "sandbox_write_file",
]);

export function autoRagIngest(toolName: string, input: Record<string, unknown>): void {
  if (!AUTO_RAG_TOOLS.has(toolName)) {
    return;
  }
  try {
    const ragPath =
      toolName === "sandbox_write_file" ? String(input.path ?? "/workspace") : "/workspace";
    void executeTool("rag_knowledge", {
      action: "ingest",
      path: ragPath,
    } as unknown as ToolInput)
      .then(() => logger.info(`[AutoRAG] Ingested ${ragPath} after ${toolName}`))
      .catch((e: unknown) =>
        logger.warn(`[AutoRAG] Ingest failed: ${e instanceof Error ? e.message : String(e)}`),
      );
  } catch {
    /* non-critical */
  }
}

// ─── Browser Observation ────────────────────────────────────────

const BROWSER_TOOLS = new Set([
  "browser_interact",
  "browser_navigate",
  "browser_click",
  "browser_screenshot",
  "browser_type",
  "browser_scroll",
]);

/**
 * Enhanced browser observation after every browser action.
 * Captures:
 *   1. Page title for high-level context
 *   2. Screenshot saved to /workspace/.browser-obs.png
 *   3. Lightweight accessibility tree snapshot — interactive elements
 *      with their roles, names, and states for precise LLM action planning
 *
 * The a11y tree is truncated to ~3000 chars to avoid context bloat.
 */
export async function maybeBrowserObserve(
  toolName: string,
  broadcaster: AgentBroadcaster,
): Promise<string | null> {
  if (!BROWSER_TOOLS.has(toolName)) {
    return null;
  }

  // Python script that captures screenshot + lightweight a11y tree snapshot
  const observeScript = `
import json, sys
try:
    from playwright.sync_api import sync_playwright
    p = sync_playwright().start()
    b = p.chromium.connect_over_cdp('http://localhost:9222')
    page = b.contexts[0].pages[0]
    page.screenshot(path='/workspace/.browser-obs.png')
    title = page.title()
    url = page.url

    # Capture lightweight accessibility tree snapshot
    a11y_tree = []
    try:
        snapshot = page.accessibility.snapshot()
        if snapshot:
            def walk(node, depth=0):
                if depth > 4 or len(a11y_tree) > 60:
                    return
                role = node.get('role', '')
                name = (node.get('name', '') or '').strip()[:80]
                # Only include interactive/meaningful elements
                if role in ('button', 'link', 'textbox', 'combobox', 'checkbox',
                            'radio', 'tab', 'menuitem', 'heading', 'img', 'navigation',
                            'dialog', 'alert', 'listitem', 'searchbox', 'slider'):
                    prefix = '  ' * depth
                    state = ''
                    if node.get('disabled'): state += ' [disabled]'
                    if node.get('checked'): state += ' [checked]'
                    if node.get('selected'): state += ' [selected]'
                    if node.get('expanded') is not None:
                        state += ' [expanded]' if node.get('expanded') else ' [collapsed]'
                    value = ''
                    if node.get('value'):
                        value = f' value="{str(node["value"])[:40]}"'
                    a11y_tree.append(f'{prefix}[{role}] "{name}"{value}{state}')
                for child in node.get('children', []):
                    walk(child, depth + 1)
            walk(snapshot)
    except Exception:
        a11y_tree.append('(a11y snapshot unavailable)')

    result = {
        'title': title,
        'url': url,
        'a11y_tree': a11y_tree[:60]
    }
    print(json.dumps(result))
    p.stop()
except Exception as e:
    print(json.dumps({'error': str(e)}))
`.trim();

  try {
    const obsResult = await sandboxExec(
      `python3 -c ${JSON.stringify(observeScript)} 2>/dev/null`,
      "/workspace",
      15,
    );

    if (obsResult.exitCode !== 0 || !obsResult.stdout.trim()) {
      return null;
    }

    const parsed = JSON.parse(obsResult.stdout.trim()) as {
      title?: string;
      url?: string;
      a11y_tree?: string[];
      error?: string;
    };

    if (parsed.error) {
      return null;
    }

    const title = parsed.title ?? "(untitled)";
    const url = parsed.url ?? "";
    const a11yTree = (parsed.a11y_tree ?? []).join("\n");
    const truncatedTree = a11yTree.length > 3000 ? a11yTree.slice(0, 3000) + "\n..." : a11yTree;

    broadcaster.send(`\n👁️ Browser observation: "${title}"\n`);

    let observation = `Browser page: "${title}" — URL: ${url}\nScreenshot: /workspace/.browser-obs.png`;
    if (truncatedTree) {
      observation += `\n\nAccessibility Tree (interactive elements):\n${truncatedTree}`;
    }

    return observation;
  } catch {
    // Non-critical — never block the agent loop
  }
  return null;
}
