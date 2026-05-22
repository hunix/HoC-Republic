/**
 * Centralized error handling utility for OpenClaw
 * Provides standardized error logging, categorization, and handling
 */

import { getLogger } from "../logging/logger.js";

const logger = getLogger();

export enum ErrorSeverity {
  /** Recoverable errors that don't affect core functionality */
  WARNING = "warning",
  /** Errors that affect functionality but allow continued operation */
  ERROR = "error",
  /** Critical errors that require immediate attention or shutdown */
  FATAL = "fatal",
}

export enum ErrorCategory {
  /** Network and communication errors */
  NETWORK = "network",
  /** File system and I/O errors */
  FILESYSTEM = "filesystem",
  /** Windows-specific errors */
  WINDOWS = "windows",
  /** Command execution errors */
  COMMAND = "command",
  /** Browser automation errors */
  BROWSER = "browser",
  /** Gateway communication errors */
  GATEWAY = "gateway",
  /** Configuration and initialization errors */
  CONFIG = "config",
  /** Resource management errors (memory, handles, etc.) */
  RESOURCE = "resource",
  /** General/uncategorized errors */
  GENERAL = "general",
  /** System-level errors (cluster, process management, etc.) */
  SYSTEM = "system",
}

export interface ErrorContext {
  /** Error category for classification */
  category?: ErrorCategory;
  /** Error severity level */
  severity?: ErrorSeverity;
  /** Component or module where error occurred */
  component?: string;
  /** Operation being performed when error occurred */
  operation?: string;
  /** Additional context data */
  metadata?: Record<string, unknown>;
  /** Extra context for debugging (alias for metadata in intelligence modules) */
  context?: Record<string, unknown>;
  /** Whether to suppress console output */
  silent?: boolean;
  /** Whether this is a fatal error */
  fatal?: boolean;
}

export interface HandledError {
  /** Original error object */
  error: Error;
  /** Error context */
  context: ErrorContext;
  /** Timestamp when error was handled */
  timestamp: Date;
  /** Unique error ID for tracking */
  id: string;
}

/**
 * Handles an error with proper logging and context
 * Use this instead of empty catch blocks or console.log
 */
export function handleError(error: unknown, context: ErrorContext = {}): HandledError {
  const err = normalizeError(error);
  const severity = context.severity ?? ErrorSeverity.ERROR;
  const category = context.category ?? ErrorCategory.GENERAL;

  const handledError: HandledError = {
    error: err,
    context: {
      ...context,
      severity,
      category,
    },
    timestamp: new Date(),
    id: generateErrorId(),
  };

  if (!context.silent) {
    logError(handledError);
  }

  return handledError;
}

/**
 * Handles an error that can be safely ignored
 * Logs at debug level for troubleshooting but doesn't raise alarms
 */
export function handleIgnoredError(
  error: unknown,
  reason: string,
  context: ErrorContext = {},
): void {
  const err = normalizeError(error);
  logger.debug(`Ignored error (${reason}): ${err.message}`, {
    error: err,
    reason,
    ...context.metadata,
  });
}

/**
 * Handles a fatal error that requires immediate attention
 * Logs at error level and may trigger shutdown procedures
 */
export function handleFatalError(error: unknown, context: ErrorContext = {}): never {
  const handledError = handleError(error, {
    ...context,
    severity: ErrorSeverity.FATAL,
  });

  logger.error(`FATAL ERROR [${handledError.id}]: ${handledError.error.message}`, {
    error: handledError.error,
    context: handledError.context,
  });

  // In production, this might trigger graceful shutdown
  // For now, we throw to maintain current behavior
  throw handledError.error;
}

/**
 * Wraps an async function with error handling
 * Useful for event handlers and callbacks
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: ErrorContext = {},
): T {
  return (async (...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error, context);
      throw error;
    }
  }) as T;
}

/**
 * Safely executes a function and returns result or undefined on error
 * Useful for optional operations that shouldn't break the flow
 */
export async function trySafe<T>(
  fn: () => Promise<T>,
  context: ErrorContext = {},
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, {
      ...context,
      severity: ErrorSeverity.WARNING,
    });
    return undefined;
  }
}

/**
 * Safely executes a synchronous function and returns result or undefined on error
 */
export function trySafeSync<T>(fn: () => T, context: ErrorContext = {}): T | undefined {
  try {
    return fn();
  } catch (error) {
    handleError(error, {
      ...context,
      severity: ErrorSeverity.WARNING,
    });
    return undefined;
  }
}

// Helper functions

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error(String(error));
}

function generateErrorId(): string {
  return `ERR-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function logError(handledError: HandledError): void {
  const { error, context } = handledError;
  const prefix = context.component ? `[${context.component}]` : "";
  const operation = context.operation ? ` during ${context.operation}` : "";

  const message = `${prefix} ${context.category}/${context.severity}${operation}: ${error.message}`;

  const logData = {
    errorId: handledError.id,
    category: context.category,
    severity: context.severity,
    component: context.component,
    operation: context.operation,
    stack: error.stack,
    ...context.metadata,
  };

  switch (context.severity) {
    case ErrorSeverity.FATAL:
      logger.error(message, logData);
      break;
    case ErrorSeverity.ERROR:
      logger.error(message, logData);
      break;
    case ErrorSeverity.WARNING:
      logger.warn(message, logData);
      break;
    default:
      logger.error(message, logData);
  }
}

/**
 * Type guard to check if an error is a specific type
 */
export function isErrorType<T extends Error>(
  error: unknown,
  errorClass: new (...args: unknown[]) => T,
): error is T {
  return error instanceof errorClass;
}

/**
 * Checks if an error indicates a specific condition
 */
export function isErrorWithCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

/**
 * Checks if an error is a network-related error
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const networkCodes = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"];
  if ("code" in error && typeof error.code === "string") {
    return networkCodes.includes(error.code);
  }

  return /network|connection|timeout/i.test(error.message);
}

/**
 * Checks if an error is a file system error
 */
export function isFileSystemError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const fsCodes = ["ENOENT", "EACCES", "EPERM", "EEXIST", "EISDIR", "ENOTDIR"];
  if ("code" in error && typeof error.code === "string") {
    return fsCodes.includes(error.code);
  }

  return false;
}

/**
 * Checks if an error is transient (safe to retry) vs permanent.
 *
 * Transient errors include:
 * - Network errors (ECONNREFUSED, ETIMEDOUT, ECONNRESET, ENETUNREACH, EHOSTUNREACH)
 * - DNS resolution failures (ENOTFOUND)
 * - Rate limits (HTTP 429 or "rate limit" in message)
 * - Temporary I/O errors (EAGAIN, EBUSY, ENOLCK)
 * - Service unavailable (HTTP 502, 503, 504)
 *
 * Permanent errors (returns false):
 * - Authentication failures (401, 403)
 * - Bad requests (400)
 * - File not found (ENOENT)
 * - Permission denied (EACCES, EPERM)
 * - Programming errors (TypeError, RangeError, SyntaxError)
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Programming errors are never transient
  if (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof SyntaxError
  ) {
    return false;
  }

  // Check error code for transient OS-level errors
  const transientCodes = [
    "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENETUNREACH",
    "EHOSTUNREACH", "ENOTFOUND", "EADDRNOTAVAIL", "EADDRINUSE",
    "EAGAIN", "EBUSY", "ENOLCK", "EPIPE", "EAI_AGAIN",
  ];
  if ("code" in error && typeof error.code === "string") {
    if (transientCodes.includes(error.code)) {
      return true;
    }
  }

  // Check HTTP status codes embedded in error
  if ("statusCode" in error && typeof error.statusCode === "number") {
    const sc = error.statusCode;
    return sc === 429 || sc === 502 || sc === 503 || sc === 504;
  }
  if ("status" in error && typeof error.status === "number") {
    const sc = error.status;
    return sc === 429 || sc === 502 || sc === 503 || sc === 504;
  }

  // Check message patterns
  const msg = error.message.toLowerCase();
  return /timeout|timed out|rate.?limit|too many requests|temporarily|unavailable|network|econnrefused|econnreset|retry/i.test(msg);
}
