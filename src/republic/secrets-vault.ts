/**
 * Republic Platform — Secrets Vault
 *
 * Encrypted credential storage for API keys, tokens, and secrets
 * that the Republic discovers or that the user provides.
 *
 * Uses Node.js crypto with AES-256-GCM encryption.
 * Master key sourced from env var REPUBLIC_MASTER_KEY or generated on first use.
 *
 * Access control:
 *   - Only tier-3 tool invocations can read secrets
 *   - All reads are audit-logged
 *   - Secret names are visible; values are encrypted at rest
 */

import * as crypto from "node:crypto";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:secrets-vault");

// ─── Types ──────────────────────────────────────────────────────

export type SecretCategory =
  | "payment"    // PayPal, Stripe, etc.
  | "exchange"   // Binance, Coinbase, etc.
  | "cloud"      // AWS, GCP, Azure
  | "email"      // Gmail, SMTP
  | "platform"   // GitHub, Vercel, Netlify
  | "api"        // Generic API keys
  | "other";

export interface SecretEntry {
  id: string;
  name: string;
  category: SecretCategory;
  encryptedValue: string; // AES-256-GCM encrypted
  iv: string;             // Initialization vector
  tag: string;            // Auth tag
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string | null;
  accessCount: number;
  createdBy: string;      // "user" | citizenId
  description: string;
}

export interface SecretAuditEntry {
  secretId: string;
  secretName: string;
  action: "read" | "write" | "delete" | "rotate";
  performedBy: string;
  timestamp: string;
}

export interface VaultDiagnostics {
  totalSecrets: number;
  secretsByCategory: Record<string, number>;
  auditLogSize: number;
  vaultInitialized: boolean;
}

// ─── State ──────────────────────────────────────────────────────

const secrets = new Map<string, SecretEntry>();
const auditLog: SecretAuditEntry[] = [];
const MAX_AUDIT_LOG = 500;

let masterKey: Buffer | null = null;
let vaultInitialized = false;

// ─── Encryption ─────────────────────────────────────────────────

function getMasterKey(): Buffer {
  if (masterKey) {return masterKey;}

  const envKey = process.env.REPUBLIC_MASTER_KEY;
  if (envKey) {
    // Use provided key (32 bytes for AES-256)
    masterKey = crypto.createHash("sha256").update(envKey).digest();
  } else {
    // Generate ephemeral key (resets on restart)
    masterKey = crypto.randomBytes(32);
    logger.warn("No REPUBLIC_MASTER_KEY set — using ephemeral key (secrets lost on restart)");
  }

  vaultInitialized = true;
  return masterKey;
}

function encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

function decrypt(encrypted: string, ivHex: string, tagHex: string): string {
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

// ─── Secret Management ──────────────────────────────────────────

/**
 * Store a secret in the vault.
 */
export function storeSecret(
  name: string,
  value: string,
  category: SecretCategory,
  description: string,
  createdBy = "user",
): SecretEntry {
  const { encrypted, iv, tag } = encrypt(value);

  const existing = findSecretByName(name);
  if (existing) {
    // Update existing secret
    existing.encryptedValue = encrypted;
    existing.iv = iv;
    existing.tag = tag;
    existing.updatedAt = ts();
    existing.description = description;

    logAudit(existing.id, name, "write", createdBy);
    logger.info(`Secret updated: ${name} [${category}]`);
    return existing;
  }

  const entry: SecretEntry = {
    id: uid(),
    name,
    category,
    encryptedValue: encrypted,
    iv,
    tag,
    createdAt: ts(),
    updatedAt: ts(),
    lastAccessedAt: null,
    accessCount: 0,
    createdBy,
    description,
  };

  secrets.set(entry.id, entry);
  logAudit(entry.id, name, "write", createdBy);
  logger.info(`Secret stored: ${name} [${category}]`);

  return entry;
}

/**
 * Retrieve a secret value (decrypted).
 * Only call from tier-3 approved tool invocations.
 */
export function getSecret(name: string, accessedBy = "system"): string | null {
  const entry = findSecretByName(name);
  if (!entry) {return null;}

  try {
    const value = decrypt(entry.encryptedValue, entry.iv, entry.tag);
    entry.lastAccessedAt = ts();
    entry.accessCount++;
    logAudit(entry.id, name, "read", accessedBy);
    return value;
  } catch (err) {
    logger.error(`Failed to decrypt secret: ${name}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Delete a secret from the vault.
 */
export function deleteSecret(name: string, deletedBy = "user"): boolean {
  const entry = findSecretByName(name);
  if (!entry) {return false;}

  secrets.delete(entry.id);
  logAudit(entry.id, name, "delete", deletedBy);
  logger.info(`Secret deleted: ${name}`);
  return true;
}

/**
 * Rotate a secret (update its value in-place).
 */
export function rotateSecret(
  name: string,
  newValue: string,
  rotatedBy = "system",
): boolean {
  const entry = findSecretByName(name);
  if (!entry) {return false;}

  const { encrypted, iv, tag } = encrypt(newValue);
  entry.encryptedValue = encrypted;
  entry.iv = iv;
  entry.tag = tag;
  entry.updatedAt = ts();

  logAudit(entry.id, name, "rotate", rotatedBy);
  logger.info(`Secret rotated: ${name}`);
  return true;
}

/**
 * Check if a secret exists (without reading the value).
 */
export function hasSecret(name: string): boolean {
  return findSecretByName(name) !== null;
}

/**
 * List all secret names and metadata (no values).
 */
export function listSecrets(): Array<{
  id: string;
  name: string;
  category: SecretCategory;
  description: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
}> {
  return Array.from(secrets.values()).map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    accessCount: s.accessCount,
  }));
}

/**
 * Get secrets for a specific category.
 */
export function getSecretsForCategory(category: SecretCategory): string[] {
  return Array.from(secrets.values())
    .filter((s) => s.category === category)
    .map((s) => s.name);
}

// ─── Helpers ────────────────────────────────────────────────────

function findSecretByName(name: string): SecretEntry | null {
  for (const entry of secrets.values()) {
    if (entry.name === name) {return entry;}
  }
  return null;
}

function logAudit(
  secretId: string,
  secretName: string,
  action: SecretAuditEntry["action"],
  performedBy: string,
): void {
  auditLog.push({
    secretId,
    secretName,
    action,
    performedBy,
    timestamp: ts(),
  });

  if (auditLog.length > MAX_AUDIT_LOG) {
    auditLog.splice(0, auditLog.length - MAX_AUDIT_LOG);
  }
}

// ─── Query & Diagnostics ────────────────────────────────────────

export function getAuditLog(limit = 50): SecretAuditEntry[] {
  return auditLog.slice(-limit);
}

export function getVaultDiagnostics(): VaultDiagnostics {
  const byCategory: Record<string, number> = {};
  for (const s of secrets.values()) {
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
  }

  return {
    totalSecrets: secrets.size,
    secretsByCategory: byCategory,
    auditLogSize: auditLog.length,
    vaultInitialized,
  };
}
