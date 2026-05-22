/**
 * Kali Linux Reverse Engineering Bridge (Radare2)
 *
 * Allows the orchestrator/LLM to run deep static analysis and disassembly
 * against binaries inside the Kali container using radare2 (r2) and rabin2.
 */

import { kaliExec } from "./kali-agent-loop.js";

export interface R2Result {
  ok: boolean;
  output: string;
  exitCode: number;
}

function sanitizePath(str: string): string {
  // Only allow alphanumeric, dashes, dots, underscores, and slashes for file paths
  return str.replace(/[^a-zA-Z0-9_\-./]/g, "");
}

function sanitizeCommand(str: string): string {
  // Safe r2 commands (e.g. "aaa", "pdf @ main", "is", "iS")
  return str.replace(/['";&$|><`\\]/g, "").trim();
}

/**
 * Runs radare2 (r2) static analysis against a binary.
 * @param binaryPath Absolute path to the binary in the Kali container.
 * @param r2Command The r2 commands to execute (e.g., 'aaa; afl; pdf @ main')
 */
export async function r2Analyze(
  binaryPath: string,
  r2Command: string
): Promise<R2Result> {
  const safePath = sanitizePath(binaryPath);
  const safeCmd = sanitizeCommand(r2Command);

  // Use radare2 in quiet batch mode: -q -c "commands" <file>
  // 'aaa' is typically the first command to analyze everything
  const cmd = `r2 -q -c '${safeCmd}' ${safePath}`;
  const result = await kaliExec(cmd, 120);

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}

/**
 * Runs rabin2 to extract binary headers, sections, imports, and security mitigations (checksec).
 * @param binaryPath Absolute path to the binary.
 * @param mode The rabin2 mode: "I" (info), "l" (linked libs), "s" (symbols), "iz" (strings)
 */
export async function r2Checksec(
  binaryPath: string,
  mode: "I" | "l" | "s" | "iz" | "i" = "I"
): Promise<R2Result> {
  const safePath = sanitizePath(binaryPath);
  
  // -I = Binary info (arch, bits, os, strip, nx, pie, relro, canary)
  // -jq = output as JSON
  const cmd = `rabin2 -${mode} -jq ${safePath}`;
  const result = await kaliExec(cmd, 60);

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}
