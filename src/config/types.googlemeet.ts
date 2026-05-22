import type { DmPolicy, GroupPolicy } from "./types.base.js";
import type { ChannelHeartbeatVisibilityConfig } from "./types.channels.js";

/** Google Meet channel configuration. */
export type GoogleMeetConfig = {
  /** If false, do not start the Google Meet provider. Default: true. */
  enabled?: boolean;
  /** Optional provider capability tags used for agent/runtime guidance. */
  capabilities?: string[];

  // ─── Google Cloud / OAuth Settings ──────────────────
  /** Path to Google service account credentials JSON file. */
  credentialsPath?: string;
  /** Google Cloud project ID. */
  projectId?: string;
  /** OAuth2 client ID (for user-delegated access). */
  clientId?: string;
  /** OAuth2 client secret. */
  clientSecret?: string;
  /** OAuth2 refresh token (for automated meeting join). */
  refreshToken?: string;

  // ─── Meeting Behavior ───────────────────────────────
  /** Auto-join meetings when invited. Default: false. */
  autoJoin?: boolean;
  /** Auto-join meetings matching this calendar pattern (regex). */
  autoJoinPattern?: string;
  /** Google Calendar ID to watch for upcoming meetings. Default: "primary". */
  calendarId?: string;
  /** Minutes before meeting start to join. Default: 1. */
  joinBeforeMinutes?: number;
  /** Auto-leave when all other participants leave. Default: true. */
  autoLeave?: boolean;
  /** Max meeting duration in minutes before auto-leave. Default: 480 (8 hours). */
  maxDurationMinutes?: number;

  // ─── Audio/Video ────────────────────────────────────
  /** Enable microphone on join. Default: false. */
  micEnabled?: boolean;
  /** Enable camera on join. Default: false. */
  cameraEnabled?: boolean;
  /** Enable speech-to-text transcription. Default: true. */
  transcription?: boolean;
  /** Transcription language. Default: "en-US". */
  transcriptionLanguage?: string;

  // ─── Chat ───────────────────────────────────────────
  /** Monitor and respond to in-meeting chat. Default: true. */
  monitorChat?: boolean;
  /** Respond with agent output via in-meeting chat. Default: true. */
  respondInChat?: boolean;
  /** Respond with agent output via TTS audio. Default: false. */
  respondWithAudio?: boolean;

  // ─── Access Control ─────────────────────────────────
  /** Direct message access policy. */
  dmPolicy?: DmPolicy;
  /** Group policy for meeting contexts. */
  groupPolicy?: GroupPolicy;
  /** Allowlist for meeting organizers (email addresses). */
  allowFrom?: string[];

  /** Heartbeat visibility settings for this channel. */
  heartbeat?: ChannelHeartbeatVisibilityConfig;
};
