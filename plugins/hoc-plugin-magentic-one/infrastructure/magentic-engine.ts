/**
 * Infrastructure — Magentic-One Engine
 *
 * Manages Magentic-One lifecycle:
 *   1. Auto-detect Python 3.10+
 *   2. Install autogen-agentchat and autogen-ext packages
 *   3. Spawn Python subprocess for multi-agent task execution
 */

import { execFile, execSync, type ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import type { MagenticConfig, TaskRequest } from "../domain/types.ts";

// ─── Python Detection ───────────────────────────────────────────

export function detectPython(): string | null {
  const candidates = ["python3", "python", "py -3"];
  for (const cmd of candidates) {
    try {
      const ver = execSync(`${cmd} --version`, {
        timeout: 10_000,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (ver.includes("Python 3")) {
        return cmd.split(" ")[0];
      }
    } catch {
      /* skip */
    }
  }
  return null;
}

// ─── Dependency Management ──────────────────────────────────────

export function installDependencies(pythonPath: string): {
  installed: boolean;
  error?: string;
} {
  try {
    execSync(
      `${pythonPath} -m pip install autogen-agentchat autogen-ext[web-surfer,file-surfer,magentic-one]`,
      { timeout: 600_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return { installed: true };
  } catch (err: unknown) {
    const e = err as { message?: string };
    return { installed: false, error: `pip install failed: ${e.message ?? "unknown"}` };
  }
}

export function verifyInstallation(pythonPath: string): boolean {
  try {
    execSync(
      `${pythonPath} -c "from autogen_agentchat.teams import MagenticOneGroupChat; print('ok')"`,
      { timeout: 30_000, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return true;
  } catch {
    return false;
  }
}

// ─── Installation Status ────────────────────────────────────────

export interface MagenticInstallStatus {
  ready: boolean;
  pythonFound: boolean;
  pythonPath: string;
  depsInstalled: boolean;
  importVerified: boolean;
  errors: string[];
}

export function detectInstallation(_config: MagenticConfig): MagenticInstallStatus {
  const errors: string[] = [];

  const python = detectPython();
  if (!python) {
    errors.push("Python 3.10+ not found");
  }

  let depsInstalled = false;
  let importVerified = false;

  if (python) {
    // Check if already installed before attempting install
    importVerified = verifyInstallation(python);
    if (!importVerified) {
      const depResult = installDependencies(python);
      depsInstalled = depResult.installed;
      if (!depResult.installed && depResult.error) {
        errors.push(depResult.error);
      }
      if (depsInstalled) {
        importVerified = verifyInstallation(python);
      }
    } else {
      depsInstalled = true;
    }
  }

  return {
    ready: !!python && depsInstalled && importVerified,
    pythonFound: !!python,
    pythonPath: python ?? "python",
    depsInstalled,
    importVerified,
    errors,
  };
}

// ─── Task Execution ─────────────────────────────────────────────

export function executeTask(
  config: MagenticConfig,
  request: TaskRequest,
  onComplete?: (answer: string) => void,
  onError?: (err: string) => void,
): ChildProcess {
  fs.mkdirSync(config.outputDir, { recursive: true });

  const _agentsList = JSON.stringify(request.agents);

  const script = `
import asyncio, json, sys

async def main():
    from autogen_agentchat.teams import MagenticOneGroupChat
    from autogen_ext.teams.magentic_one import MagenticOne
    from autogen_agentchat.ui import Console

    m1 = MagenticOne(
        task="${request.task.replace(/"/g, '\\"').replace(/\n/g, "\\n")}",
    )
    result = await Console(m1.run_stream())
    answer = ""
    if hasattr(result, "messages") and result.messages:
        answer = result.messages[-1].content if hasattr(result.messages[-1], "content") else str(result.messages[-1])
    else:
        answer = str(result)
    print(json.dumps({"status": "complete", "answer": answer}))

asyncio.run(main())
`;

  const proc = execFile(
    config.pythonPath,
    ["-c", script],
    { timeout: config.timeoutMs, cwd: config.outputDir },
    (error, stdout, stderr) => {
      if (error) {
        onError?.(stderr || error.message);
        return;
      }
      try {
        const lines = stdout.trim().split("\n");
        const last = JSON.parse(lines[lines.length - 1] ?? "{}");
        if (last.status === "complete") {
          onComplete?.(last.answer ?? "");
        }
      } catch {
        onComplete?.(stdout);
      }
    },
  );

  return proc;
}
