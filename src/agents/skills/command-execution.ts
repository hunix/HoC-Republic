import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Hard blocklist of dangerous command patterns.
 * These commands MUST NEVER be executed autonomously by agents.
 * Each entry is tested case-insensitively against the full command string.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  // ─── Gateway / Service management (CRITICAL: caused self-destruct cascade) ───
  /\bopenclaw\s+(gateway|doctor|install|uninstall|service)/i,
  /\bsc\s+(delete|create|stop|start|config)\b/i,
  /\bnet\s+(stop|start)\b/i,
  /\bnssm\b/i,
  /\bschtasks\s+\/(create|delete|end|run)\b/i,
  /\bNew-Service\b/i,
  /\bRemove-Service\b/i,
  /\bStop-Service\b/i,
  /\bRestart-Service\b/i,
  /\bSet-Service\b/i,

  // ─── System shutdown / reboot ───
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bRestart-Computer\b/i,
  /\bStop-Computer\b/i,
  /\binit\s+[06]\b/i,

  // ─── Disk / data destruction ───
  /\brm\s+-rf\s+[\/\\]/i,
  /\bformat\s+[a-zA-Z]:/i,
  /\bdiskpart\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,

  // ─── Registry / system config ───
  /\breg\s+(delete|add)\b/i,
  /\bREG\s+DELETE\b/i,
  /\bbcdedit\b/i,

  // ─── Process killing (could kill the gateway) ───
  /\btaskkill\s+.*\bnode\b/i,
  /\bkill\s+-9\b/i,
  /\bpkill\s+(node|openclaw)/i,

  // ─── npm global / system-wide installs ───
  /\bnpm\s+(i|install)\s+-g\b/i,
  /\bpip\s+install\b.*--system/i,
];

export const commandTools = [
  {
    name: "run_command",
    description:
      "Execute a shell command (Timeout: 10s). Service management, gateway commands, and destructive operations are blocked.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
      },
      required: ["command"],
    },
  },
];

export const commandHandlers = {
  run_command: async (args: { command: string }) => {
    // Safety gate: check against dangerous command patterns
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(args.command)) {
        const msg =
          `[BLOCKED] Command rejected by safety policy: "${args.command}" matches blocked pattern ${pattern}. ` +
          `Service management, gateway operations, and destructive commands cannot be run autonomously.`;
        console.warn(`[SystemOperator] ${msg}`);
        return msg;
      }
    }

    try {
      console.log(`[SystemOperator] Executing: ${args.command}`);

      const { stdout, stderr } = await execAsync(args.command, { timeout: 10000 });
      let output = stdout;
      if (stderr) {
        output += `\n[STDERR]: ${stderr}`;
      }
      return output || "[No Output]";
    } catch (error: any) {
      if (error.killed) {
        return "Error: Command timed out after 10s.";
      }
      return `Error executing command: ${error.message}`;
    }
  },
};
