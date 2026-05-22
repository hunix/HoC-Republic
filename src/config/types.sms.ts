import type { DmPolicy, GroupPolicy } from "./types.base.js";
import type { ChannelHeartbeatVisibilityConfig } from "./types.channels.js";

/** SMS channel configuration. */
export type SMSConfig = {
  /** If false, do not start the SMS provider. Default: true. */
  enabled?: boolean;
  /** Optional provider capability tags used for agent/runtime guidance. */
  capabilities?: string[];

  /**
   * SMS provider to use.
   * - "twilio": Twilio Programmable SMS
   * - "vonage": Vonage (Nexmo) SMS API
   * - "companion": Windows Companion (local phone via USB/BT)
   */
  provider?: "twilio" | "vonage" | "companion";

  /** Twilio Account SID. */
  accountSid?: string;
  /** Twilio Auth Token. */
  authToken?: string;
  /** Twilio phone number (E.164 format, e.g., +15105551234). */
  phoneNumber?: string;
  /** Twilio Messaging Service SID (optional, for Messaging Service). */
  messagingServiceSid?: string;

  /** Vonage API Key. */
  apiKey?: string;
  /** Vonage API Secret. */
  apiSecret?: string;
  /** Vonage virtual number (E.164 format). */
  from?: string;

  /** Webhook URL for inbound SMS (auto-configured for Twilio/Vonage). */
  webhookUrl?: string;
  /** Webhook port for inbound messages. Default: 3980. */
  webhookPort?: number;

  /** Direct message access policy (default: pairing). */
  dmPolicy?: DmPolicy;
  /** Allowlist for  senders (E.164 phone numbers). */
  allowFrom?: string[];
  /** Group policy (SMS doesn't support groups natively). */
  groupPolicy?: GroupPolicy;

  /** Max message length before splitting. Default: 1600 (GSM-7). */
  maxMessageLength?: number;
  /** Include sender name prefix in group-forwarded messages. */
  showSenderName?: boolean;

  /** Heartbeat visibility settings for this channel. */
  heartbeat?: ChannelHeartbeatVisibilityConfig;
};
