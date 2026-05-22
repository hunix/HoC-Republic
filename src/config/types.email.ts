import type { DmPolicy } from "./types.base.js";
import type { ChannelHeartbeatVisibilityConfig } from "./types.channels.js";

/** Email channel configuration. */
export type EmailConfig = {
  /** If false, do not start the Email provider. Default: true. */
  enabled?: boolean;
  /** Optional provider capability tags used for agent/runtime guidance. */
  capabilities?: string[];

  /**
   * Email provider to use.
   * - "imap": Standard IMAP/SMTP
   * - "graph": Microsoft Graph API (Office 365)
   * - "gmail": Google Gmail API
   */
  provider?: "imap" | "graph" | "gmail";

  // ─── IMAP/SMTP Settings ─────────────────────────────
  /** IMAP server hostname. */
  imapHost?: string;
  /** IMAP server port. Default: 993. */
  imapPort?: number;
  /** SMTP server hostname. */
  smtpHost?: string;
  /** SMTP server port. Default: 587. */
  smtpPort?: number;
  /** Email username/address. */
  username?: string;
  /** Email password or app-specific password. */
  password?: string;
  /** Use TLS for IMAP/SMTP. Default: true. */
  tls?: boolean;

  // ─── Microsoft Graph Settings ───────────────────────
  /** Azure AD Application (client) ID. */
  clientId?: string;
  /** Azure AD Client Secret. */
  clientSecret?: string;
  /** Azure AD Tenant ID. */
  tenantId?: string;
  /** Microsoft user email (for delegated access). */
  userEmail?: string;

  // ─── Gmail Settings ─────────────────────────────────
  /** Path to Google service account credentials JSON file. */
  credentialsPath?: string;
  /** Gmail address to impersonate (for domain-wide delegation). */
  delegatedUser?: string;

  // ─── Common Settings ────────────────────────────────
  /** Sender "From" display name. */
  fromName?: string;
  /** Sender "From" email address. */
  fromAddress?: string;
  /** IMAP folder to watch for inbound messages. Default: "INBOX". */
  inboxFolder?: string;
  /** Poll interval in seconds for checking new mail. Default: 30. */
  pollIntervalSeconds?: number;

  /** Direct message access policy (default: pairing). */
  dmPolicy?: DmPolicy;
  /** Allowlist for inbound senders (email addresses). */
  allowFrom?: string[];

  /** Max email body length before truncation. Default: 50000. */
  maxBodyLength?: number;
  /** Strip HTML from inbound emails. Default: true. */
  stripHtml?: boolean;
  /** Include attachments as media. Default: true. */
  processAttachments?: boolean;
  /** Max attachment size in MB. Default: 25. */
  maxAttachmentMb?: number;

  /** Heartbeat visibility settings for this channel. */
  heartbeat?: ChannelHeartbeatVisibilityConfig;
};
