/**
 * Docker Terminal — PowerShell Window Spawner
 *
 * Opens a standalone PowerShell window for Docker operations, giving
 * the user real-time visibility into long-running commands like image
 * pulls (~15GB for ComfyUI), container creation, and live log tailing.
 *
 * Windows-only: uses `start powershell` to spawn a detached window.
 * On non-Windows platforms, falls back to logging a message.
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("docker-terminal");

export interface TerminalResult {
  ok: boolean;
  pid?: number;
  error?: string;
}

/**
 * Open a Docker command in a standalone PowerShell window.
 *
 * The window stays open after the command completes (via `-NoExit`)
 * so the user can review output. Uses color formatting for visibility.
 *
 * @param dockerArgs - The Docker CLI arguments (e.g. ["pull", "nginx:latest"])
 * @param title     - Window title (shown in the PowerShell title bar)
 */
export function openDockerTerminal(
  dockerArgs: string[],
  title?: string,
): TerminalResult {
  const os = platform();

  if (os !== "win32") {
    logger.warn("Docker terminal is only supported on Windows; command will run in background");
    return { ok: false, error: "Docker terminal requires Windows (PowerShell)" };
  }

  const windowTitle = title ?? `HoC Docker — ${dockerArgs.slice(0, 3).join(" ")}`;
  const dockerCmd = `docker ${dockerArgs.join(" ")}`;

  // Build a PowerShell script that:
  // 1. Sets the window title
  // 2. Shows a header with the command being run
  // 3. Runs the docker command with live output
  // 4. Shows completion status
  // 5. Stays open for review
  const psScript = [
    `$Host.UI.RawUI.WindowTitle = '${windowTitle.replace(/'/g, "''")}'`,
    `Write-Host ''`,
    `Write-Host '  ╔══════════════════════════════════════════════════════╗' -ForegroundColor Cyan`,
    `Write-Host '  ║  HoC Docker Terminal                                ║' -ForegroundColor Cyan`,
    `Write-Host '  ╚══════════════════════════════════════════════════════╝' -ForegroundColor Cyan`,
    `Write-Host ''`,
    `Write-Host '  Command: ${dockerCmd.replace(/'/g, "''")}' -ForegroundColor Yellow`,
    `Write-Host '  Started: ' -NoNewline; Write-Host (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -ForegroundColor Green`,
    `Write-Host ''`,
    `Write-Host '  ─────────────────────────────────────────────────────' -ForegroundColor DarkGray`,
    `Write-Host ''`,
    // Run the actual docker command
    `$sw = [System.Diagnostics.Stopwatch]::StartNew()`,
    `& cmd /c '${dockerCmd.replace(/'/g, "''")}'`,
    `$exitCode = $LASTEXITCODE`,
    `$sw.Stop()`,
    `Write-Host ''`,
    `Write-Host '  ─────────────────────────────────────────────────────' -ForegroundColor DarkGray`,
    `Write-Host ''`,
    `if ($exitCode -eq 0) {`,
    `  Write-Host '  ✅ Command completed successfully' -ForegroundColor Green`,
    `} else {`,
    `  Write-Host "  ❌ Command failed with exit code $exitCode" -ForegroundColor Red`,
    `}`,
    `$elapsed = $sw.Elapsed.ToString('mm\\:ss')`,
    `Write-Host "  Duration: $elapsed" -ForegroundColor DarkGray`,
    `Write-Host ''`,
    `Write-Host '  Press any key to close this window...' -ForegroundColor DarkGray`,
    `$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')`,
  ].join("; ");

  try {
    const child = spawn("powershell", [
      "-NoProfile",
      "-Command",
      `Start-Process powershell -ArgumentList '-NoProfile','-NoExit','-Command','${psScript.replace(/'/g, "''")}'`,
    ], {
      detached: true,
      stdio: "ignore",
      shell: false,
    });

    child.unref();

    logger.info(`Opened Docker terminal: ${dockerCmd} (PID: ${child.pid})`);
    return { ok: true, pid: child.pid };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`Failed to open Docker terminal: ${errMsg}`);
    return { ok: false, error: errMsg };
  }
}

/**
 * Convenience: Open a "docker pull" in a PowerShell window.
 */
export function openPullTerminal(image: string): TerminalResult {
  return openDockerTerminal(["pull", image], `HoC — Pulling ${image}`);
}

/**
 * Convenience: Open "docker logs -f" (live tail) in a PowerShell window.
 */
export function openLogsTerminal(containerName: string): TerminalResult {
  return openDockerTerminal(
    ["logs", "-f", "--tail", "200", containerName],
    `HoC — Logs: ${containerName}`,
  );
}

/**
 * Convenience: Open an interactive shell in a container.
 */
export function openShellTerminal(containerName: string, shell = "bash"): TerminalResult {
  return openDockerTerminal(
    ["exec", "-it", containerName, shell],
    `HoC — Shell: ${containerName}`,
  );
}
