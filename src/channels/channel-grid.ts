/**
 * Channel Grid — UI metadata for the channel selection grid
 *
 * Provides the data model and registry for the redesigned channel grid.
 * The grid groups channels by category and provides rich UI metadata
 * (icons, colors, status indicators) for each channel tile.
 *
 * Used by:
 * - Control UI channel selection page
 * - Chrome Extension channel status panel
 * - TUI channel list
 */

import {
    CHAT_CHANNEL_ORDER, getChatChannelMeta, type ChatChannelId
} from "./registry.js";

// ─── Types ──────────────────────────────────────────────────────

export type ChannelCategory =
  | "messaging"
  | "voice-video"
  | "email"
  | "enterprise"
  | "social";

export interface ChannelGridTile {
  /** Channel ID */
  id: ChatChannelId;
  /** Display label */
  label: string;
  /** Short description */
  blurb: string;
  /** Category for grouping in the grid */
  category: ChannelCategory;
  /** SF Symbols icon name */
  icon: string;
  /** Brand color (hex) */
  color: string;
  /** Whether the channel is generally available */
  status: "available" | "beta" | "coming-soon";
  /** Setup complexity 1-3 */
  setupDifficulty: 1 | 2 | 3;
  /** Whether this channel supports QR code pairing */
  supportsQrPairing: boolean;
  /** External docs URL path */
  docsPath: string;
}

// ─── Channel Grid Registry ──────────────────────────────────────

const CHANNEL_GRID: Record<ChatChannelId, ChannelGridTile> = {
  telegram: {
    id: "telegram",
    label: "Telegram",
    blurb: "Fast & easy — @BotFather setup",
    category: "messaging",
    icon: "paperplane",
    color: "#0088cc",
    status: "available",
    setupDifficulty: 1,
    supportsQrPairing: false,
    docsPath: "/channels/telegram",
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp",
    blurb: "QR code pairing — your number",
    category: "messaging",
    icon: "message",
    color: "#25D366",
    status: "available",
    setupDifficulty: 2,
    supportsQrPairing: true,
    docsPath: "/channels/whatsapp",
  },
  discord: {
    id: "discord",
    label: "Discord",
    blurb: "Bot API — servers & DMs",
    category: "social",
    icon: "bubble.left.and.bubble.right",
    color: "#5865F2",
    status: "available",
    setupDifficulty: 2,
    supportsQrPairing: false,
    docsPath: "/channels/discord",
  },
  googlechat: {
    id: "googlechat",
    label: "Google Chat",
    blurb: "Workspace Chat app",
    category: "enterprise",
    icon: "message.badge",
    color: "#00AC47",
    status: "available",
    setupDifficulty: 2,
    supportsQrPairing: false,
    docsPath: "/channels/googlechat",
  },
  slack: {
    id: "slack",
    label: "Slack",
    blurb: "Socket Mode — channels & DMs",
    category: "enterprise",
    icon: "number",
    color: "#4A154B",
    status: "available",
    setupDifficulty: 2,
    supportsQrPairing: false,
    docsPath: "/channels/slack",
  },
  signal: {
    id: "signal",
    label: "Signal",
    blurb: "signal-cli linked device",
    category: "messaging",
    icon: "antenna.radiowaves.left.and.right",
    color: "#3A76F0",
    status: "available",
    setupDifficulty: 3,
    supportsQrPairing: false,
    docsPath: "/channels/signal",
  },
  imessage: {
    id: "imessage",
    label: "iMessage",
    blurb: "macOS only — work in progress",
    category: "messaging",
    icon: "message.fill",
    color: "#34C759",
    status: "beta",
    setupDifficulty: 3,
    supportsQrPairing: false,
    docsPath: "/channels/imessage",
  },
  msteams: {
    id: "msteams",
    label: "MS Teams",
    blurb: "Azure Bot Framework",
    category: "enterprise",
    icon: "person.3",
    color: "#6264A7",
    status: "available",
    setupDifficulty: 3,
    supportsQrPairing: false,
    docsPath: "/channels/msteams",
  },
  sms: {
    id: "sms",
    label: "SMS",
    blurb: "Twilio / Vonage gateway",
    category: "messaging",
    icon: "phone.bubble",
    color: "#F22F46",
    status: "beta",
    setupDifficulty: 2,
    supportsQrPairing: false,
    docsPath: "/channels/sms",
  },
  email: {
    id: "email",
    label: "Email",
    blurb: "IMAP, Graph, or Gmail",
    category: "email",
    icon: "envelope",
    color: "#EA4335",
    status: "beta",
    setupDifficulty: 2,
    supportsQrPairing: false,
    docsPath: "/channels/email",
  },
  googlemeet: {
    id: "googlemeet",
    label: "Google Meet",
    blurb: "Auto-join & transcribe",
    category: "voice-video",
    icon: "video",
    color: "#00897B",
    status: "coming-soon",
    setupDifficulty: 3,
    supportsQrPairing: false,
    docsPath: "/channels/googlemeet",
  },
};

// ─── Grid API ───────────────────────────────────────────────────

/** Get all channels as grid tiles, ordered by CHAT_CHANNEL_ORDER */
export function getChannelGrid(): ChannelGridTile[] {
  return CHAT_CHANNEL_ORDER.map((id) => CHANNEL_GRID[id]);
}

/** Get a single channel's grid tile */
export function getChannelGridTile(id: ChatChannelId): ChannelGridTile {
  return CHANNEL_GRID[id];
}

/** Get channels grouped by category */
export function getChannelGridByCategory(): Record<ChannelCategory, ChannelGridTile[]> {
  const result: Record<ChannelCategory, ChannelGridTile[]> = {
    messaging: [],
    "voice-video": [],
    email: [],
    enterprise: [],
    social: [],
  };

  for (const tile of getChannelGrid()) {
    result[tile.category].push(tile);
  }

  return result;
}

/** Get channels that support QR code pairing */
export function getQrPairingChannels(): ChannelGridTile[] {
  return getChannelGrid().filter((t) => t.supportsQrPairing);
}

/** Get channel category metadata for UI headers */
export function getChannelCategories(): Array<{
  id: ChannelCategory;
  label: string;
  icon: string;
}> {
  return [
    { id: "messaging", label: "Messaging", icon: "message" },
    { id: "enterprise", label: "Enterprise", icon: "building.2" },
    { id: "social", label: "Social", icon: "person.2" },
    { id: "email", label: "Email", icon: "envelope" },
    { id: "voice-video", label: "Voice & Video", icon: "video" },
  ];
}

/** Get grid summary for a channels.status response */
export function getChannelGridSummary(): {
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels: Record<string, string>;
  channelSystemImages: Record<string, string>;
  channelMeta: Array<{
    id: string;
    label: string;
    detailLabel: string;
    systemImage?: string;
  }>;
} {
  const order: string[] = [];
  const labels: Record<string, string> = {};
  const detailLabels: Record<string, string> = {};
  const systemImages: Record<string, string> = {};
  const meta: Array<{
    id: string;
    label: string;
    detailLabel: string;
    systemImage?: string;
  }> = [];

  for (const id of CHAT_CHANNEL_ORDER) {
    const channel = getChatChannelMeta(id);
    order.push(id);
    labels[id] = channel.label;
    detailLabels[id] = channel.detailLabel ?? channel.label;
    if (channel.systemImage) {
      systemImages[id] = channel.systemImage;
    }
    meta.push({
      id,
      label: channel.label,
      detailLabel: channel.detailLabel ?? channel.label,
      systemImage: channel.systemImage,
    });
  }

  return { channelOrder: order, channelLabels: labels, channelDetailLabels: detailLabels, channelSystemImages: systemImages, channelMeta: meta };
}
