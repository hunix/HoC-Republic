/**
 * Gateway — Input Sanitization Middleware
 *
 * Centralized input validation and sanitization for gateway RPC methods.
 * Prevents injection attacks, strips unexpected fields, and normalizes input.
 *
 * Usage:
 *   const guard = createSanitizationGuard(schemas);
 *   const clean = guard.sanitize("methodName", rawPayload);
 */

// ─── Error Class ────────────────────────────────────────────────

export class SanitizationError extends Error {
  code: string;
  field?: string;

  constructor(message: string, code: string, field?: string) {
    super(message);
    this.name = "SanitizationError";
    this.code = code;
    this.field = field;
  }
}

// ─── String Sanitization ────────────────────────────────────────

/**
 * Sanitize a string value:
 * - Trim whitespace
 * - Normalize unicode (NFC)
 * - Remove control characters (except newlines and tabs)
 * - Truncate to maxLength
 */
export function sanitizeString(input: string, maxLength: number = 10_000): string {
  if (typeof input !== "string") {return "";}

  return input
    .trim()
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // Remove control chars (keep \n \r \t)
    .slice(0, maxLength);
}

// ─── Schema Types ───────────────────────────────────────────────

export type FieldType = "string" | "number" | "boolean" | "object" | "array";

export interface FieldSchema {
  type: FieldType;
  required?: boolean;
  maxLength?: number; // For strings
  min?: number;       // For numbers
  max?: number;       // For numbers
  pattern?: RegExp;   // For strings
  items?: FieldSchema; // For arrays
  properties?: Record<string, FieldSchema>; // For objects
}

export type PayloadSchema = Record<string, FieldSchema>;

// ─── Payload Sanitization ───────────────────────────────────────

/**
 * Validate and sanitize a payload against a schema.
 * - Checks required fields
 * - Validates types
 * - Strips unexpected fields
 * - Sanitizes strings
 * - Clamps numbers to min/max
 */
export function sanitizePayload(
  payload: Record<string, unknown>,
  schema: PayloadSchema,
): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new SanitizationError("Payload must be a non-null object", "INVALID_PAYLOAD");
  }

  const result: Record<string, unknown> = {};

  for (const [key, fieldSchema] of Object.entries(schema)) {
    const value = payload[key];

    // Check required
    if (fieldSchema.required && (value === undefined || value === null)) {
      throw new SanitizationError(
        `Missing required field: ${key}`,
        "MISSING_REQUIRED",
        key,
      );
    }

    // Skip optional missing fields
    if (value === undefined || value === null) {continue;}

    // Type validation and sanitization
    result[key] = sanitizeField(key, value, fieldSchema);
  }

  // Strip unexpected fields (not in schema)
  return result;
}

function sanitizeField(key: string, value: unknown, schema: FieldSchema): unknown {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") {
        throw new SanitizationError(
          `Field "${key}" must be a string`,
          "INVALID_TYPE",
          key,
        );
      }
      let sanitized = sanitizeString(value, schema.maxLength);
      if (schema.pattern && !schema.pattern.test(sanitized)) {
        throw new SanitizationError(
          `Field "${key}" does not match required pattern`,
          "PATTERN_MISMATCH",
          key,
        );
      }
      return sanitized;
    }
    case "number": {
      const num = typeof value === "string" ? Number(value) : value;
      if (typeof num !== "number" || isNaN(num)) {
        throw new SanitizationError(
          `Field "${key}" must be a number`,
          "INVALID_TYPE",
          key,
        );
      }
      let clamped = num;
      if (schema.min !== undefined) {clamped = Math.max(schema.min, clamped);}
      if (schema.max !== undefined) {clamped = Math.min(schema.max, clamped);}
      return clamped;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new SanitizationError(
          `Field "${key}" must be a boolean`,
          "INVALID_TYPE",
          key,
        );
      }
      return value;
    }
    case "array": {
      if (!Array.isArray(value)) {
        throw new SanitizationError(
          `Field "${key}" must be an array`,
          "INVALID_TYPE",
          key,
        );
      }
      if (schema.items) {
        return value.map((item, i) => sanitizeField(`${key}[${i}]`, item, schema.items!));
      }
      return value;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new SanitizationError(
          `Field "${key}" must be an object`,
          "INVALID_TYPE",
          key,
        );
      }
      if (schema.properties) {
        return sanitizePayload(value as Record<string, unknown>, schema.properties);
      }
      return value;
    }
    default:
      return value;
  }
}

// ─── Sanitization Guard Factory ─────────────────────────────────

export interface SanitizationGuard {
  /** Sanitize a payload for a specific RPC method */
  sanitize(method: string, payload: Record<string, unknown>): Record<string, unknown>;
  /** Check if a method has a registered schema */
  hasSchema(method: string): boolean;
  /** Register a new schema for a method */
  register(method: string, schema: PayloadSchema): void;
}

/**
 * Create a sanitization guard with pre-registered schemas per RPC method.
 *
 * Usage:
 *   const guard = createSanitizationGuard({
 *     "chat.send": { content: { type: "string", required: true, maxLength: 5000 } },
 *     "citizen.update": { id: { type: "string", required: true }, name: { type: "string" } },
 *   });
 *   const clean = guard.sanitize("chat.send", rawPayload);
 */
export function createSanitizationGuard(
  schemas: Record<string, PayloadSchema> = {},
): SanitizationGuard {
  const registry = new Map<string, PayloadSchema>(Object.entries(schemas));

  return {
    sanitize(method: string, payload: Record<string, unknown>): Record<string, unknown> {
      const schema = registry.get(method);
      if (!schema) {
        // No schema registered — pass through with basic string sanitization
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(payload)) {
          result[key] = typeof value === "string" ? sanitizeString(value) : value;
        }
        return result;
      }
      return sanitizePayload(payload, schema);
    },

    hasSchema(method: string): boolean {
      return registry.has(method);
    },

    register(method: string, schema: PayloadSchema): void {
      registry.set(method, schema);
    },
  };
}
