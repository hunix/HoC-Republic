/**
 * Credentials Vault — Encrypt/Decrypt sensitive data at rest
 *
 * Uses AES-256-GCM with PBKDF2-derived keys for encrypting credentials.
 * Provides encryption, decryption, and migration utilities.
 */

import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

// ─── Configuration ──────────────────────────────────────────────

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST = "sha512";
const ENCRYPTED_HEADER = "OCVAULT1"; // Magic header to identify encrypted files

// ─── Key Derivation ─────────────────────────────────────────────

/**
 * Derive an encryption key from a passphrase using PBKDF2.
 *
 * When no passphrase is provided, generates a machine-specific key
 * from hostname + user info (deterministic but not portable).
 */
export function deriveKey(passphrase?: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const effectiveSalt = salt ?? randomBytes(SALT_LENGTH);

  const effectivePassphrase =
    passphrase ??
    createHash("sha256")
      .update(`${process.env.COMPUTERNAME ?? "host"}:${process.env.USERNAME ?? "user"}:openclaw`)
      .digest("hex");

  const key = pbkdf2Sync(effectivePassphrase, effectiveSalt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  return { key, salt: effectiveSalt };
}

// ─── Encryption / Decryption ────────────────────────────────────

/**
 * Encrypt a plaintext buffer.
 *
 * Output format: HEADER(8) + SALT(32) + IV(16) + AUTH_TAG(16) + CIPHERTEXT(...)
 */
export function encrypt(plaintext: Buffer, passphrase?: string): Buffer {
  const { key, salt } = deriveKey(passphrase);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    Buffer.from(ENCRYPTED_HEADER, "utf8"),
    salt,
    iv,
    authTag,
    encrypted,
  ]);
}

/**
 * Decrypt a ciphertext buffer.
 *
 * Returns null if decryption fails (wrong key or corrupted data).
 */
export function decrypt(ciphertext: Buffer, passphrase?: string): Buffer | null {
  try {
    const headerSize = Buffer.byteLength(ENCRYPTED_HEADER, "utf8");
    const header = ciphertext.subarray(0, headerSize).toString("utf8");
    if (header !== ENCRYPTED_HEADER) {
      return null; // Not an encrypted file
    }

    let offset = headerSize;
    const salt = ciphertext.subarray(offset, offset + SALT_LENGTH);
    offset += SALT_LENGTH;
    const iv = ciphertext.subarray(offset, offset + IV_LENGTH);
    offset += IV_LENGTH;
    const authTag = ciphertext.subarray(offset, offset + AUTH_TAG_LENGTH);
    offset += AUTH_TAG_LENGTH;
    const encrypted = ciphertext.subarray(offset);

    const { key } = deriveKey(passphrase, salt);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted;
  } catch {
    return null; // Decryption failed
  }
}

// ─── File Operations ────────────────────────────────────────────

/**
 * Check if a file is encrypted (has our magic header).
 */
export function isEncrypted(filePath: string): boolean {
  if (!existsSync(filePath)) {return false;}
  try {
    const header = Buffer.alloc(Buffer.byteLength(ENCRYPTED_HEADER, "utf8"));
    const fd = readFileSync(filePath);
    fd.copy(header, 0, 0, header.length);
    return header.toString("utf8") === ENCRYPTED_HEADER;
  } catch {
    return false;
  }
}

/**
 * Encrypt a file in-place.
 * Creates a .bak backup before encrypting.
 */
export function encryptFile(filePath: string, passphrase?: string): { ok: boolean; error?: string } {
  try {
    if (!existsSync(filePath)) {
      return { ok: false, error: "file not found" };
    }
    if (isEncrypted(filePath)) {
      return { ok: false, error: "file already encrypted" };
    }

    const plaintext = readFileSync(filePath);

    // Backup original
    const backupPath = `${filePath}.bak`;
    renameSync(filePath, backupPath);

    // Write encrypted version
    const encrypted = encrypt(plaintext, passphrase);
    writeFileSync(filePath, encrypted);

    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "encryption failed" };
  }
}

/**
 * Decrypt a file in-place.
 */
export function decryptFile(filePath: string, passphrase?: string): { ok: boolean; error?: string } {
  try {
    if (!existsSync(filePath)) {
      return { ok: false, error: "file not found" };
    }
    if (!isEncrypted(filePath)) {
      return { ok: false, error: "file not encrypted" };
    }

    const ciphertext = readFileSync(filePath);
    const decrypted = decrypt(ciphertext, passphrase);
    if (!decrypted) {
      return { ok: false, error: "decryption failed — wrong passphrase or corrupted data" };
    }

    writeFileSync(filePath, decrypted);
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "decryption failed" };
  }
}

/**
 * Migrate unencrypted credential files to encrypted.
 * Scans a list of paths, encrypts any that aren't already encrypted.
 */
export function migrateUnencrypted(
  paths: string[],
  passphrase?: string,
): { migrated: string[]; skipped: string[]; errors: Array<{ path: string; error: string }> } {
  const migrated: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  for (const p of paths) {
    if (!existsSync(p)) {
      skipped.push(p);
      continue;
    }
    if (isEncrypted(p)) {
      skipped.push(p);
      continue;
    }

    const result = encryptFile(p, passphrase);
    if (result.ok) {
      migrated.push(p);
    } else {
      errors.push({ path: p, error: result.error ?? "unknown" });
    }
  }

  return { migrated, skipped, errors };
}

/**
 * Verify a file can be decrypted (without modifying it).
 */
export function verifyDecryptable(filePath: string, passphrase?: string): boolean {
  if (!existsSync(filePath) || !isEncrypted(filePath)) {return false;}
  const ciphertext = readFileSync(filePath);
  return decrypt(ciphertext, passphrase) !== null;
}
