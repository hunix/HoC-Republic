/**
 * World Intelligence — Alert Dispatcher v2
 *
 * Monitors WorldIntel state after each poll cycle and fires alerts
 * to configured channels when threat conditions are met.
 *
 * Channels: System Chat (WebSocket push), WhatsApp, Telegram (Bot API), Email (Resend/SMTP/SendGrid)
 * Deduplication: per-rule cooldown (no re-alert within cooldownMs)
 */

import { sendMessageWhatsApp } from "../web/outbound.js";
import { sendEmail } from "./external-comms.js";
import { getState } from "./state.js";
import {
  type AlertRule,
  type ThreatSeverity,
  type WorldIntelSnapshot,
  getSnapshot,
} from "./world-intelligence.js";

// ─── Alert Config (persisted in memory; loaded from gateway config on start) ─

export interface AlertChannel {
  type: "system_chat" | "whatsapp" | "telegram" | "email";
  enabled: boolean;
  target: string; // phone number / chat ID / email address / unused for system_chat
}

export interface AlertConfig {
  channels: AlertChannel[];
  /** Minimum severity to alert on (default: high) */
  minSeverity: ThreatSeverity;
  /** CII threshold — alert when any monitored country crosses this (default: 75) */
  ciiThreshold: number;
  /** War risk threshold — alert when any country crosses this (default: 80) */
  warRiskThreshold: number;
}

export interface FiredAlert {
  ruleId: string;
  ruleName: string;
  severity: ThreatSeverity;
  message: string;
  channels: string[];
  firedAt: number;
}

// ─── Module State ────────────────────────────────────────────────

let alertConfig: AlertConfig = {
  channels: [{ type: "system_chat", enabled: true, target: "" }],
  minSeverity: "high",
  ciiThreshold: 75,
  warRiskThreshold: 80,
};

const alertHistory: FiredAlert[] = [];
let checkTimer: ReturnType<typeof setInterval> | null = null;

/** Callback registered by the gateway to broadcast to WebSocket clients */
let _systemChatBroadcast: ((message: string) => void) | null = null;

// ─── Alert Rules ─────────────────────────────────────────────────

const ALERT_RULES: AlertRule[] = [
  {
    id: "cii_critical",
    name: "Country CII Critical",
    severity: "critical",
    cooldownMs: 60 * 60_000, // 1h
    lastFiredAt: 0,
    condition: (snap) => [...snap.ciiScores.values()].some((c) => c.ciiScore >= 85),
    message: (snap) => {
      const hot = [...snap.ciiScores.values()]
        .filter((c) => c.ciiScore >= 85)
        .toSorted((a, b) => b.ciiScore - a.ciiScore);
      return `🚨 CRITICAL INSTABILITY: ${hot.map((c) => `${c.name} (CII ${c.ciiScore})`).join(", ")}`;
    },
  },
  {
    id: "war_risk_critical",
    name: "War Risk Critical",
    severity: "critical",
    cooldownMs: 60 * 60_000,
    lastFiredAt: 0,
    condition: (snap) => [...snap.warRisks.values()].some((r) => r.score >= 85),
    message: (snap) => {
      const hot = [...snap.warRisks.values()]
        .filter((r) => r.score >= 85)
        .toSorted((a, b) => b.score - a.score);
      return `⚔️ WAR RISK CRITICAL: ${hot.map((r) => `${r.countryName} ${r.score}%`).join(", ")}`;
    },
  },
  {
    id: "war_signal_critical",
    name: "War Signal Critical Confluence",
    severity: "critical",
    cooldownMs: 2 * 60 * 60_000, // 2h
    lastFiredAt: 0,
    condition: (snap) => snap.warSignals.some((w) => w.riskLevel === "critical"),
    message: (snap) => {
      const crit = snap.warSignals.filter((w) => w.riskLevel === "critical");
      return `🔴 WAR SIGNAL CONFLUENCE: ${crit.map((w) => `${w.countryName} (${w.activeFactors.join("+")}`).join(", ")}`;
    },
  },
  {
    id: "global_threat_critical",
    name: "Global Threat Level Critical",
    severity: "critical",
    cooldownMs: 2 * 60 * 60_000,
    lastFiredAt: 0,
    condition: (snap) => snap.globalThreatLevel === "critical",
    message: (_snap) =>
      `🌐 GLOBAL THREAT LEVEL: CRITICAL — Multiple simultaneous crisis signals detected`,
  },
  {
    id: "convergence_multi",
    name: "Multi-Country Signal Convergence",
    severity: "high",
    cooldownMs: 3 * 60 * 60_000,
    lastFiredAt: 0,
    condition: (snap) => snap.convergences.length >= 3,
    message: (snap) =>
      `⚠️ SIGNAL CONVERGENCE in ${snap.convergences.length} countries: ${snap.convergences
        .slice(0, 3)
        .map((c) => c.country)
        .join(", ")}`,
  },
  {
    id: "nuclear_state_cii",
    name: "Nuclear State High Instability",
    severity: "high",
    cooldownMs: 4 * 60 * 60_000,
    lastFiredAt: 0,
    condition: (snap) => {
      const nuclear = ["US", "RU", "CN", "GB", "FR", "IN", "PK", "IL", "KP"];
      return nuclear.some((code) => (snap.ciiScores.get(code)?.ciiScore ?? 0) >= 65);
    },
    message: (snap) => {
      const nuclear = ["US", "RU", "CN", "GB", "FR", "IN", "PK", "IL", "KP"];
      const hot = nuclear
        .map((code) => snap.ciiScores.get(code))
        .filter((c): c is NonNullable<typeof c> => !!c && c.ciiScore >= 65)
        .toSorted((a, b) => b.ciiScore - a.ciiScore);
      return `☢️ NUCLEAR STATE INSTABILITY: ${hot.map((c) => `${c.name} CII ${c.ciiScore}`).join(", ")}`;
    },
  },
];

// ─── Severity ranking ────────────────────────────────────────────

const SEVERITY_RANKS: Record<ThreatSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

// ─── Channel Dispatch ────────────────────────────────────────────

async function dispatchAlert(rule: AlertRule, message: string): Promise<void> {
  const now = Date.now();
  const enabledChannels = alertConfig.channels.filter((c) => c.enabled);
  const minRank = SEVERITY_RANKS[alertConfig.minSeverity];
  const ruleRank = SEVERITY_RANKS[rule.severity];
  if (ruleRank < minRank) {
    return;
  }

  const firedChannels: string[] = [];

  for (const channel of enabledChannels) {
    try {
      switch (channel.type) {
        case "system_chat":
          if (_systemChatBroadcast) {
            _systemChatBroadcast(`[WorldIntel Alert] ${message}`);
            firedChannels.push("system_chat");
          }
          break;

        case "whatsapp":
          if (channel.target) {
            await sendMessageWhatsApp(channel.target, `[HoC WorldIntel]\n${message}`, {
              verbose: false,
            });
            firedChannels.push(`whatsapp:${channel.target}`);
          }
          break;

        case "telegram": {
          // Telegram Bot API — send message via HTTP POST
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (channel.target && botToken) {
            const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
            const res = await fetch(telegramUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: channel.target,
                text: `\u26a0\ufe0f *HoC WorldIntel Alert*\n\n${message}`,
                parse_mode: "Markdown",
                disable_web_page_preview: true,
              }),
            });
            if (res.ok) {
              firedChannels.push(`telegram:${channel.target}`);
            } else {
              console.warn(`[WorldIntel] Telegram send failed: ${res.status}`);
            }
          } else if (channel.target && !botToken) {
            process.stderr.write(`[WorldIntel] TELEGRAM_BOT_TOKEN not set — skipping Telegram dispatch\n`);
          }
          break;
        }

        case "email": {
          // Email dispatch via configured provider (Resend/SMTP/SendGrid)
          if (channel.target) {
            const s = getState();
            const subject = `[HoC WorldIntel] ${rule.severity.toUpperCase()} Alert: ${rule.name}`;
            const htmlBody = `<div style="font-family:system-ui;max-width:600px">
              <h2 style="color:#e74c3c">\u26a0\ufe0f WorldIntel Alert</h2>
              <p><strong>Severity:</strong> ${rule.severity.toUpperCase()}</p>
              <p><strong>Rule:</strong> ${rule.name}</p>
              <hr/>
              <p>${message.replace(/\n/g, "<br/>")}</p>
              <hr/>
              <p style="color:#888;font-size:12px">HoC Republic Intelligence System</p>
            </div>`;
            await sendEmail(s, channel.target, subject, htmlBody);
            firedChannels.push(`email:${channel.target}`);
          }
          break;
        }
      }
    } catch (err) {
      console.warn(`[WorldIntel] Alert dispatch to ${channel.type} failed: ${String(err)}`);
    }
  }

  // Record in history
  const alert: FiredAlert = {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    message,
    channels: firedChannels,
    firedAt: now,
  };
  alertHistory.unshift(alert);
  if (alertHistory.length > 200) {
    alertHistory.length = 200;
  }

  process.stderr.write(`[WorldIntel] Alert fired: ${rule.name} — ${message}\n`);
}

// ─── Alert Check Cycle ───────────────────────────────────────────

export async function checkAlertRules(): Promise<void> {
  if (!alertConfig.channels.some((c) => c.enabled)) {
    return;
  }

  const snap: WorldIntelSnapshot = getSnapshot();
  const now = Date.now();

  for (const rule of ALERT_RULES) {
    try {
      if (now - rule.lastFiredAt < rule.cooldownMs) {
        continue;
      }
      if (!rule.condition(snap)) {
        continue;
      }

      rule.lastFiredAt = now;
      const message = rule.message(snap);
      await dispatchAlert(rule, message);
    } catch (err) {
      console.warn(`[WorldIntel] Alert rule '${rule.name}' check failed: ${String(err)}`);
    }
  }
}

// ─── Alert Config Management ─────────────────────────────────────

export function getAlertConfig(): AlertConfig {
  return { ...alertConfig };
}

export function setAlertConfig(config: Partial<AlertConfig>): void {
  alertConfig = { ...alertConfig, ...config };
}

export function getAlertHistory(): FiredAlert[] {
  return [...alertHistory];
}

export function clearAlertHistory(): void {
  alertHistory.length = 0;
}

/** Register a system-chat broadcast callback (called by gateway on startup) */
export function registerSystemChatBroadcast(fn: (message: string) => void): void {
  _systemChatBroadcast = fn;
}

/** Fire a test alert on a specific channel */
export async function fireTestAlert(channelType: string): Promise<void> {
  const testRule: AlertRule = {
    id: "test",
    name: "Test Alert",
    severity: "high",
    cooldownMs: 0,
    lastFiredAt: 0,
    condition: () => true,
    message: () => "🧪 Test alert from HoC World Intelligence — channels are working correctly.",
  };
  // Override channels to only fire on the requested one
  const original = alertConfig.channels;
  alertConfig.channels = original.map((c) => ({
    ...c,
    enabled: c.type === channelType,
  }));
  try {
    await dispatchAlert(testRule, testRule.message(getSnapshot()));
  } finally {
    alertConfig.channels = original;
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────

export function startAlertChecker(): void {
  if (checkTimer) {
    return;
  }
  // Check after every RSS poll cycle + once at start
  checkAlertRules().catch(() => {});
  checkTimer = setInterval(() => {
    checkAlertRules().catch(() => {});
  }, 5 * 60_000); // Every 5 minutes (aligned with RSS polls)
}

export function stopAlertChecker(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
