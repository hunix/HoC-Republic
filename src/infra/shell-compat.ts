/**
 * Shell Compatibility Layer for Windows
 * Handles command execution with proper shell selection, argument quoting,
 * and environment variable normalization to prevent injection vulnerabilities
 */

import { spawn, type SpawnOptions } from "node:child_process";
import { ErrorCategory, ErrorSeverity, handleError } from "./error-handler.js";

export interface ShellCommand {
  /** The command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Shell to use (auto-detected if not specified) */
  shell?: "cmd" | "powershell" | "bash" | boolean;
}

export interface ShellResult {
  /** Exit code */
  code: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether the command timed out */
  timedOut: boolean;
}

/**
 * Detects the appropriate shell for a command on Windows
 */
export function detectWindowsShell(command: string): "cmd" | "powershell" {
  // PowerShell-specific commands and cmdlets
  const powershellIndicators = [
    "Get-",
    "Set-",
    "New-",
    "Remove-",
    "Invoke-",
    "Test-",
    "Start-",
    "Stop-",
    "Out-",
    "Write-",
    "Read-",
    "$_",
    "ForEach-Object",
    "Where-Object",
    "Select-Object",
  ];

  // Check if command contains PowerShell-specific syntax
  for (const indicator of powershellIndicators) {
    if (command.includes(indicator)) {
      return "powershell";
    }
  }

  // Check for PowerShell operators
  if (
    command.includes("-eq") ||
    command.includes("-ne") ||
    command.includes("-like") ||
    command.includes("-match")
  ) {
    return "powershell";
  }

  // Default to cmd.exe for compatibility
  return "cmd";
}

/**
 * Normalizes environment variables for Windows
 * Handles case-insensitivity issues like Path vs PATH
 */
export function normalizeWindowsEnvironment(
  env: Record<string, string> = {},
): Record<string, string> {
  const normalized: Record<string, string> = { ...process.env } as Record<string, string>;

  // Merge provided environment variables
  for (const [key, value] of Object.entries(env)) {
    normalized[key] = value;
  }

  // Handle Path/PATH normalization
  // Windows is case-insensitive but Node.js environment variables are case-sensitive
  const pathKeys = Object.keys(normalized).filter((k) => k.toLowerCase() === "path");
  
  if (pathKeys.length > 1) {
    // Multiple PATH variants exist, merge them
    const pathValues = pathKeys.map((k) => normalized[k]).filter(Boolean);
    const mergedPath = [...new Set(pathValues.join(";").split(";"))].join(";");
    
    // Remove all variants
    for (const key of pathKeys) {
      delete normalized[key];
    }
    
    // Set the standard Path variable (Windows convention)
    normalized.Path = mergedPath;
  }

  return normalized;
}

/**
 * Safely quotes a command argument for Windows cmd.exe
 */
export function quoteCmdArgument(arg: string): string {
  // If argument doesn't contain special characters, return as-is
  if (!/[ \t\n\r"^&|<>%]/.test(arg)) {
    return arg;
  }

  // Escape special cmd.exe characters
  let quoted = arg.replace(/"/g, '""'); // Escape quotes
  quoted = quoted.replace(/\^/g, "^^"); // Escape caret
  quoted = quoted.replace(/%/g, "%%"); // Escape percent
  
  return `"${quoted}"`;
}

/**
 * Safely quotes a command argument for PowerShell
 */
export function quotePowerShellArgument(arg: string): string {
  // If argument doesn't contain special characters, return as-is
  if (!/[ \t\n\r"'`$@&|<>(){}[\];,]/.test(arg)) {
    return arg;
  }

  // Escape PowerShell special characters
  let quoted = arg.replace(/`/g, "``"); // Escape backtick
  quoted = quoted.replace(/"/g, '`"'); // Escape quotes
  quoted = quoted.replace(/\$/g, "`$"); // Escape dollar sign
  
  return `"${quoted}"`;
}

/**
 * Safely quotes a command argument based on the shell
 */
export function quoteArgument(arg: string, shell: "cmd" | "powershell" | "bash"): string {
  switch (shell) {
    case "cmd":
      return quoteCmdArgument(arg);
    case "powershell":
      return quotePowerShellArgument(arg);
    case "bash":
      // For bash, use single quotes and escape single quotes
      if (!/[ \t\n\r"'$`\\|&;<>(){}[\]*?~]/.test(arg)) {
        return arg;
      }
      return `'${arg.replace(/'/g, "'\\''")}'`;
    default:
      return arg;
  }
}

/**
 * Executes a shell command with proper Windows compatibility
 */
export async function executeShellCommand(command: ShellCommand): Promise<ShellResult> {
  const isWindows = process.platform === "win32";
  
  let shell: string | boolean;
  let shellArgs: string[] = [];
  let finalCommand: string;

  if (isWindows) {
    // Detect or use specified shell
    const shellType = typeof command.shell === "string" 
      ? command.shell 
      : detectWindowsShell(command.command);

    if (shellType === "powershell") {
      shell = "powershell.exe";
      shellArgs = [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-Command",
      ];
      
      // Build PowerShell command
      if (command.args && command.args.length > 0) {
        const quotedArgs = command.args.map((arg) => quotePowerShellArgument(arg));
        finalCommand = `${command.command} ${quotedArgs.join(" ")}`;
      } else {
        finalCommand = command.command;
      }
    } else {
      // Use cmd.exe
      shell = "cmd.exe";
      shellArgs = ["/d", "/s", "/c"];
      
      // Build cmd.exe command
      if (command.args && command.args.length > 0) {
        const quotedArgs = command.args.map((arg) => quoteCmdArgument(arg));
        finalCommand = `${command.command} ${quotedArgs.join(" ")}`;
      } else {
        finalCommand = command.command;
      }
    }
  } else {
    // Unix-like systems
    shell = "/bin/bash";
    shellArgs = ["-c"];
    
    if (command.args && command.args.length > 0) {
      const quotedArgs = command.args.map((arg) => quoteArgument(arg, "bash"));
      finalCommand = `${command.command} ${quotedArgs.join(" ")}`;
    } else {
      finalCommand = command.command;
    }
  }

  // Normalize environment variables
  const env = isWindows
    ? normalizeWindowsEnvironment(command.env)
    : { ...process.env, ...command.env };

  // Prepare spawn options
  const spawnOptions: SpawnOptions = {
    cwd: command.cwd,
    env: env as NodeJS.ProcessEnv,
    windowsHide: true,
  };

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timeoutHandle: NodeJS.Timeout | null = null;

    try {
      const child = spawn(shell, [...shellArgs, finalCommand], spawnOptions);

      if (command.timeout) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
          
          // Force kill after 5 seconds
          setTimeout(() => {
            if (!child.killed) {
              child.kill("SIGKILL");
            }
          }, 5000);
        }, command.timeout);
      }

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        
        handleError(error, {
          category: ErrorCategory.COMMAND,
          component: "ShellCompat",
          operation: "executeShellCommand",
          metadata: { command: command.command },
        });

        resolve({
          code: 1,
          stdout,
          stderr: stderr + error.message,
          timedOut,
        });
      });

      child.on("close", (code) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        resolve({
          code: code ?? 1,
          stdout,
          stderr,
          timedOut,
        });
      });
    } catch (error) {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      handleError(error, {
        category: ErrorCategory.COMMAND,
        component: "ShellCompat",
        operation: "executeShellCommand",
        severity: ErrorSeverity.ERROR,
        metadata: { command: command.command },
      });

      resolve({
        code: 1,
        stdout,
        stderr: stderr + String(error),
        timedOut,
      });
    }
  });
}

/**
 * Validates a command to prevent injection attacks
 */
export function validateCommand(command: string): {
  valid: boolean;
  reason?: string;
} {
  // Check for obvious injection attempts
  const dangerousPatterns = [
    /;\s*rm\s+-rf/i, // rm -rf injection
    /;\s*del\s+\/[sf]/i, // Windows delete injection
    /\|\s*curl\s+.*\|\s*sh/i, // Pipe to shell injection
    /\|\s*wget\s+.*\|\s*sh/i, // Wget to shell injection
    /&&\s*format\s+[a-z]:/i, // Format drive injection
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return {
        valid: false,
        reason: "Command contains potentially dangerous pattern",
      };
    }
  }

  return { valid: true };
}

/**
 * Prepends a directory to the PATH environment variable safely
 * Handles Windows case-insensitivity issues
 */
export function prependToPath(
  directory: string,
  env: Record<string, string> = {},
): Record<string, string> {
  const normalized = normalizeWindowsEnvironment(env);
  const pathKey = process.platform === "win32" ? "Path" : "PATH";
  const currentPath = normalized[pathKey] || "";
  const separator = process.platform === "win32" ? ";" : ":";
  
  // Check if directory is already in PATH
  const pathEntries = currentPath.split(separator);
  const normalizedDir = directory.toLowerCase();
  const alreadyInPath = pathEntries.some(
    (entry) => entry.toLowerCase() === normalizedDir,
  );

  if (!alreadyInPath) {
    normalized[pathKey] = `${directory}${separator}${currentPath}`;
  }

  return normalized;
}
