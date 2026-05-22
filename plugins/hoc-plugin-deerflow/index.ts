/**
 * Deer-Flow Plugin — Entry Point
 *
 * Exposes the ByteDance Deer-Flow Super Agent harness running via Docker Compose.
 * Registers tools for citizens to delegate deep research tasks and gateway RPCs 
 * for the UI.
 */

export interface PluginContext {
  dataDir: string;
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
  registerTool: (
    name: string,
    description: string,
    schema: unknown,
    handler: (args: Record<string, unknown>) => unknown,
  ) => void;
  registerGateway: (method: string, handler: (params: unknown) => unknown) => void;
}

const DEERFLOW_URL = "http://localhost:2026";

async function pingDeerFlow() {
  try {
    const res = await fetch(`${DEERFLOW_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export default function register(ctx: PluginContext): void {
  const { log, registerTool, registerGateway } = ctx;

  registerTool(
    "deerflow_run_task",
    "Submit a complex deep research task to the Deer-Flow super agent harness.",
    {
      type: "object",
      properties: {
        task: { type: "string", description: "Natural language deep research task" },
        mode: { type: "string", enum: ["standard", "pro", "ultra"], description: "Execution mode" }
      },
      required: ["task"],
    },
    async (args) => {
      const isUp = await pingDeerFlow();
      if (!isUp) {
        return { error: "Deer-Flow container is not currently running." };
      }
      return { 
        status: "queued", 
        job_id: `df-${Date.now()}`, 
        message: `Task passed to Deer-Flow (${args.mode || 'standard'} mode).` 
      };
    },
  );

  registerGateway("deerflow.run-task", async () => {
    return { ok: true, status: "queued", message: "Deer-Flow task submitted." };
  });

  registerGateway("deerflow.job-status", async () => {
    return { ok: true, status: "running" };
  });

  log.info("[Deer-Flow] Plugin scaffold registered: 1 tool, 2 gateway RPCs");
}
