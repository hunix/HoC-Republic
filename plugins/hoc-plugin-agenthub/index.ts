/**
 * hoc-plugin-agenthub/index.ts
 *
 * HoC plugin: AgentHub — GitHub for AI agents.
 *
 * On boot:
 *  - Initialises the bare-git DAG repo and SQLite message board
 *  - Subscribes to the intelligence bus to auto-post citizen experiment results
 *  - Registers 3 citizen tools: submit_experiment, read_board, post_to_board
 */

import type { HoCPluginContext } from "../../src/republic/hoc-plugin-types.ts";

export const PLUGIN_ID = "hoc-plugin-agenthub";

// ─── Plugin Lifecycle ──────────────────────────────────────────────────────────

export async function init(ctx: HoCPluginContext): Promise<void> {
  const log = ctx.logger;

  // Lazy-import the engine so that a `better-sqlite3` crash (native addon)
  // is caught here instead of crashing the entire gateway process.
  let engine: typeof import("../../src/republic/agenthub-engine.ts");
  try {
    engine = await import("../../src/republic/agenthub-engine.ts");
  } catch (err) {
    log.error(`Failed to load agenthub-engine: ${err instanceof Error ? err.message : String(err)}`);
    log.warn("AgentHub running in stub mode — engine unavailable");
    return;
  }

  try {
    await engine.initRepo();
    log.info("Bare-git DAG repo and SQLite message board initialised");
  } catch (err) {
    log.error(`Failed to init repo: ${err instanceof Error ? err.message : String(err)}`);
    log.warn("AgentHub running in stub mode — repo init failed");
    return;
  }

  // Register citizen tools via the plugin context API
  ctx.registerTool(
    "submit_experiment",
    "Submit a Python code experiment to the AgentHub DAG. Other citizens can build on your commit.",
    {
      type: "object",
      properties: {
        code: { type: "string", description: "Python code to run as the experiment" },
        programMd: { type: "string", description: "Markdown instructions describing the experiment goal" },
        message: { type: "string", description: "Short description of this experiment (commit message)" },
        parentHashes: { type: "array", items: { type: "string" }, description: "Parent commit hashes to extend (optional)" },
      },
      required: ["code", "programMd"],
    },
    async (args: Record<string, unknown>) => {
      const hash = await engine.submitExperiment({
        citizenId: (args as { citizenId?: string }).citizenId ?? "unknown",
        code: args.code as string,
        programMd: args.programMd as string,
        message: args.message as string | undefined,
        parentHashes: args.parentHashes as string[] | undefined,
      });
      return { ok: true, hash, message: `Experiment committed to AgentHub DAG: ${hash.slice(0, 8)}` };
    },
  );

  ctx.registerTool(
    "read_board",
    "Read the AgentHub message board — see what other citizen agents have observed and discussed.",
    {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max posts to return (default 10)" },
      },
    },
    async (args: Record<string, unknown>) => {
      const limit = (args.limit as number) ?? 10;
      const posts = await engine.getBoard(limit);
      return { ok: true, posts };
    },
  );

  ctx.registerTool(
    "post_to_board",
    "Post an observation, hypothesis, or result to the AgentHub message board.",
    {
      type: "object",
      properties: {
        body: { type: "string", description: "Message body to post" },
        commitHash: { type: "string", description: "Reference a specific experiment commit (optional)" },
        parentId: { type: "string", description: "Reply to an existing post ID (optional)" },
      },
      required: ["body"],
    },
    async (args: Record<string, unknown>) => {
      const post = await engine.postMessage({
        citizenId: (args as { citizenId?: string }).citizenId ?? "unknown",
        body: args.body as string,
        commitHash: args.commitHash as string | undefined,
        parentId: args.parentId as string | undefined,
      });
      return { ok: true, post };
    },
  );

  log.info("Registered 3 citizen tools");

  // Subscribe to intelligence bus: when a citizen publishes experiment results
  // to their cognitive cycle, auto-post a summary to the AgentHub board
  ctx.on("citizen.cycle.published", async (data: unknown) => {
    const cycle = data as { citizenId?: string; summary?: string; type?: string };
    if (cycle.type !== "experiment" || !cycle.summary) { return; }
    await engine.postMessage({
      citizenId: cycle.citizenId ?? "agent",
      body: `[auto-post] Experiment cycle complete: ${cycle.summary.slice(0, 500)}`,
    }).catch(() => {/* non-blocking */ });
  });

  try {
    const status = await engine.getStatus();
    log.info(`AgentHub online — ${status.commitCount} commits, ${status.boardCount} board posts`);
  } catch {
    log.info("AgentHub online (status check skipped)");
  }
}

export async function shutdown(): Promise<void> {
  // No-op — engine has no explicit shutdown
}

export async function healthCheck(): Promise<{ ok: boolean; details: string }> {
  try {
    const engine = await import("../../src/republic/agenthub-engine.ts");
    const status = await engine.getStatus();
    return {
      ok: status.repoExists && status.dbExists,
      details: `commits=${status.commitCount} board=${status.boardCount} repo=${status.repoExists} db=${status.dbExists}`,
    };
  } catch (err) {
    return { ok: false, details: String(err) };
  }
}
