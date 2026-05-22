/**
 * WhatsApp Session Manager
 * Handles WhatsApp session persistence, restoration, and migration across gateways
 */

import crypto from "node:crypto";
import { ErrorCategory, ErrorSeverity, handleError } from "../infra/error-handler.js";
import { createSubsystemLogger } from "../logging.js";
import { loadClusterConfig } from "./cluster-config.js";
import { getStateStore, type WhatsAppSession } from "./redis-state-store.js";

const logger = createSubsystemLogger("cluster:whatsapp");

export interface WhatsAppAuthState {
  creds: unknown;
  keys: unknown;
}

export interface SessionRestoreResult {
  success: boolean;
  session?: WhatsAppSession;
  requiresRelink: boolean;
  error?: string;
}

export class WhatsAppSessionManager {
  private config = loadClusterConfig();
  private encryptionKey: Buffer;

  constructor() {
    // Derive encryption key from cluster secret with unique per-cluster salt
    // Using a hash of the secret as part of the salt ensures different clusters
    // with the same secret-prefix get different encryption keys
    const saltBase = crypto
      .createHash("sha256")
      .update(this.config.encryption.clusterSecret)
      .digest("hex")
      .substring(0, 16);
    this.encryptionKey = crypto.scryptSync(
      this.config.encryption.clusterSecret,
      `openclaw-whatsapp-${saltBase}`,
      32,
    );
  }

  /**
   * Save WhatsApp session to distributed storage
   */
  async saveSession(
    sessionId: string,
    authState: WhatsAppAuthState,
    gatewayId: string,
  ): Promise<void> {
    try {
      const stateStore = getStateStore();

      // Encrypt auth state if encryption is enabled
      const authStateJson = JSON.stringify(authState);
      const encryptedAuth = this.config.encryption.encryptSessions
        ? this.encrypt(authStateJson)
        : authStateJson;

      const session: WhatsAppSession = {
        id: sessionId,
        authState: encryptedAuth,
        linkedDevices: [],
        lastActivity: Date.now(),
        gatewayId,
      };

      await stateStore.saveWhatsAppSession(session);

      logger.info("WhatsApp session saved", {
        sessionId,
        gatewayId,
        encrypted: this.config.encryption.encryptSessions,
      });
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.ERROR,
        component: "whatsapp-session-manager",
        operation: "save-session",
        metadata: { sessionId, gatewayId },
      });
      throw error;
    }
  }

  /**
   * Restore WhatsApp session from distributed storage
   */
  async restoreSession(sessionId: string, gatewayId: string): Promise<SessionRestoreResult> {
    try {
      const stateStore = getStateStore();
      const session = await stateStore.getWhatsAppSession(sessionId);

      if (!session) {
        logger.info("No existing session found", { sessionId });
        return {
          success: false,
          requiresRelink: true,
          error: "Session not found",
        };
      }

      // Capture original gateway ID BEFORE overwriting for accurate logging
      const originalGatewayId = session.gatewayId;
      const isMigration = originalGatewayId !== gatewayId;

      // Check if session is from a different gateway (migration scenario)
      if (isMigration) {
        logger.info("Migrating session from another gateway", {
          sessionId,
          fromGateway: originalGatewayId,
          toGateway: gatewayId,
        });
      }

      // Decrypt auth state if encrypted
      const authStateJson = this.config.encryption.encryptSessions
        ? this.decrypt(session.authState)
        : session.authState;

      const _authState = JSON.parse(authStateJson) as WhatsAppAuthState;

      // Update session with new gateway ID
      session.gatewayId = gatewayId;
      session.lastActivity = Date.now();
      await stateStore.saveWhatsAppSession(session);

      logger.info("WhatsApp session restored", {
        sessionId,
        gatewayId,
        migrated: isMigration,
      });

      return {
        success: true,
        session,
        requiresRelink: false,
      };
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.ERROR,
        component: "whatsapp-session-manager",
        operation: "restore-session",
        metadata: { sessionId, gatewayId },
      });

      return {
        success: false,
        requiresRelink: true,
        error: String(error),
      };
    }
  }

  /**
   * Delete WhatsApp session from distributed storage
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      const stateStore = getStateStore();
      await stateStore.deleteWhatsAppSession(sessionId);

      logger.info("WhatsApp session deleted", { sessionId });
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.ERROR,
        component: "whatsapp-session-manager",
        operation: "delete-session",
        metadata: { sessionId },
      });
      throw error;
    }
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(sessionId: string): Promise<void> {
    try {
      const stateStore = getStateStore();
      const session = await stateStore.getWhatsAppSession(sessionId);

      if (session) {
        session.lastActivity = Date.now();
        await stateStore.saveWhatsAppSession(session);
      }
    } catch (error) {
      // Non-critical error, just log
      logger.warn("Failed to update session activity", { sessionId, error });
    }
  }

  /**
   * Save QR code for session
   */
  async saveQRCode(sessionId: string, qrCode: string, gatewayId: string): Promise<void> {
    try {
      const stateStore = getStateStore();
      let session = await stateStore.getWhatsAppSession(sessionId);

      if (!session) {
        // Create new session with QR code
        session = {
          id: sessionId,
          authState: "",
          qrCode,
          linkedDevices: [],
          lastActivity: Date.now(),
          gatewayId,
        };
      } else {
        session.qrCode = qrCode;
        session.lastActivity = Date.now();
      }

      await stateStore.saveWhatsAppSession(session);

      logger.info("QR code saved", { sessionId, gatewayId });
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.ERROR,
        component: "whatsapp-session-manager",
        operation: "save-qr-code",
        metadata: { sessionId, gatewayId },
      });
      throw error;
    }
  }

  /**
   * Get QR code for session
   */
  async getQRCode(sessionId: string): Promise<string | null> {
    try {
      const stateStore = getStateStore();
      const session = await stateStore.getWhatsAppSession(sessionId);

      return session?.qrCode || null;
    } catch (error) {
      logger.warn("Failed to get QR code", { sessionId, error });
      return null;
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Return: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(":");

    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Migrate all sessions from one gateway to another
   */
  async migrateSessions(fromGatewayId: string, toGatewayId: string): Promise<number> {
    try {
      const _stateStore = getStateStore();

      // This would require a scan operation in Redis
      // For now, we'll log that migration is needed
      logger.info("Session migration requested", {
        fromGateway: fromGatewayId,
        toGateway: toGatewayId,
      });

      // In a real implementation, we would:
      // 1. Scan for all sessions with gatewayId = fromGatewayId
      // 2. Update each session's gatewayId to toGatewayId
      // 3. Return count of migrated sessions

      return 0;
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.ERROR,
        component: "whatsapp-session-manager",
        operation: "migrate-sessions",
        metadata: { fromGatewayId, toGatewayId },
      });
      throw error;
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(_maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const _stateStore = getStateStore();
      const _now = Date.now();
      let cleanedCount = 0;

      // This would require scanning all sessions
      // For now, we rely on Redis TTL for automatic cleanup
      logger.info("Session cleanup completed", { cleanedCount });

      return cleanedCount;
    } catch (error) {
      handleError(error, {
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.ERROR,
        component: "whatsapp-session-manager",
        operation: "cleanup-sessions",
      });
      throw error;
    }
  }
}

// Singleton instance
let sessionManager: WhatsAppSessionManager | null = null;

export function getWhatsAppSessionManager(): WhatsAppSessionManager {
  if (!sessionManager) {
    sessionManager = new WhatsAppSessionManager();
  }
  return sessionManager;
}
