/**
 * Enhanced Node Host Runner
 * Integrates with the Windows Companion Service for privileged operations
 * Delegates Windows-specific commands to the C# companion when available
 */

import { getCompanionBridge, isCompanionAvailable } from "../infra/companion-bridge.js";
import { ErrorCategory, ErrorSeverity, handleError } from "../infra/error-handler.js";
import { executeShellCommand, validateCommand } from "../infra/shell-compat.js";
import { logger } from "../logger.js";

export interface EnhancedRunOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  useCompanion?: boolean;
}

export interface EnhancedRunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  usedCompanion: boolean;
}

/**
 * Determines if a command should be delegated to the companion service
 */
function shouldUseCompanion(command: string): boolean {
  // Commands that benefit from companion service
  const companionCommands = [
    "reg", // Registry operations
    "sc", // Service control
    "wmic", // WMI queries
    "powershell", // PowerShell execution
    "netsh", // Network configuration
    "bcdedit", // Boot configuration
  ];

  const commandLower = command.toLowerCase();
  return companionCommands.some((cmd) => commandLower.startsWith(cmd));
}

/**
 * Enhanced command execution with companion service integration
 */
export async function executeEnhancedCommand(
  options: EnhancedRunOptions,
): Promise<EnhancedRunResult> {
  // Validate command for security
  const validation = validateCommand(options.command);
  if (!validation.valid) {
    throw new Error(`Command validation failed: ${validation.reason}`);
  }

  const useCompanion =
    options.useCompanion !== false &&
    process.platform === "win32" &&
    shouldUseCompanion(options.command);

  if (useCompanion) {
    try {
      const available = await isCompanionAvailable();
      if (available) {
        return await executeViaCompanion(options);
      } else {
        logger.warn("Companion service not available, falling back to standard execution");
      }
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.WINDOWS,
        component: "EnhancedRunner",
        operation: "executeViaCompanion",
        severity: ErrorSeverity.WARNING,
      });
      logger.warn("Failed to use companion service, falling back to standard execution");
    }
  }

  // Fall back to standard shell execution
  return await executeViaShell(options);
}

/**
 * Execute command via the companion service
 */
async function executeViaCompanion(
  options: EnhancedRunOptions,
): Promise<EnhancedRunResult> {
  const bridge = getCompanionBridge();

  try {
    const result = await bridge.executeCommand(options.command, options.args);

    return {
      code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: false,
      usedCompanion: true,
    };
  } catch (error) {
    handleError(error, {
      category: ErrorCategory.WINDOWS,
      component: "EnhancedRunner",
      operation: "executeViaCompanion",
    });
    throw error;
  }
}

/**
 * Execute command via standard shell
 */
async function executeViaShell(options: EnhancedRunOptions): Promise<EnhancedRunResult> {
  const result = await executeShellCommand({
    command: options.command,
    args: options.args,
    cwd: options.cwd,
    env: options.env,
    timeout: options.timeout,
  });

  return {
    ...result,
    usedCompanion: false,
  };
}

/**
 * Enhanced mouse control with companion service
 */
export async function enhancedMouseMove(x: number, y: number): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Enhanced mouse control is only available on Windows");
  }

  const available = await isCompanionAvailable();
  if (!available) {
    throw new Error("Companion service is not available");
  }

  const bridge = getCompanionBridge();
  await bridge.moveMouse(x, y);
}

/**
 * Enhanced mouse click with companion service
 */
export async function enhancedMouseClick(
  button: "left" | "right" | "middle" = "left",
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Enhanced mouse control is only available on Windows");
  }

  const available = await isCompanionAvailable();
  if (!available) {
    throw new Error("Companion service is not available");
  }

  const bridge = getCompanionBridge();
  await bridge.clickMouse(button);
}

/**
 * Enhanced keyboard typing with companion service
 */
export async function enhancedKeyboardType(text: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Enhanced keyboard control is only available on Windows");
  }

  const available = await isCompanionAvailable();
  if (!available) {
    throw new Error("Companion service is not available");
  }

  const bridge = getCompanionBridge();
  await bridge.typeText(text);
}

/**
 * Enhanced UI automation - find element
 */
export async function enhancedUIFind(selector: string): Promise<{
  found: boolean;
  name?: string;
  className?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}> {
  if (process.platform !== "win32") {
    throw new Error("UI Automation is only available on Windows");
  }

  const available = await isCompanionAvailable();
  if (!available) {
    throw new Error("Companion service is not available");
  }

  const bridge = getCompanionBridge();
  return await bridge.findUIElement(selector);
}

/**
 * Enhanced UI automation - click element
 */
export async function enhancedUIClick(selector: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("UI Automation is only available on Windows");
  }

  const available = await isCompanionAvailable();
  if (!available) {
    throw new Error("Companion service is not available");
  }

  const bridge = getCompanionBridge();
  await bridge.clickUIElement(selector);
}

/**
 * Enhanced UI automation - read element text
 */
export async function enhancedUIRead(selector: string): Promise<string> {
  if (process.platform !== "win32") {
    throw new Error("UI Automation is only available on Windows");
  }

  const available = await isCompanionAvailable();
  if (!available) {
    throw new Error("Companion service is not available");
  }

  const bridge = getCompanionBridge();
  return await bridge.readUIElement(selector);
}

/**
 * Query system information using WMI
 */
export async function querySystemInfo(
  query: string,
): Promise<Array<Record<string, unknown>>> {
  if (process.platform !== "win32") {
    throw new Error("WMI queries are only available on Windows");
  }

  const available = await isCompanionAvailable();
  if (!available) {
    throw new Error("Companion service is not available");
  }

  const bridge = getCompanionBridge();
  return await bridge.queryWMI(query);
}
