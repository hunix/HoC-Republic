/**
 * Chat Feature — Helpers
 *
 * Pure utility functions shared across chat UI components.
 * No React hooks, no state — just data transforms.
 */

import { MessageSquare, Phone, Globe, Hash } from "lucide-react";
import React from "react";
import type { Session, Message } from "./chat.types";

// ── Channel helpers ─────────────────────────────────────────────────────────

export function channelIcon(channel: string | undefined, kind: string | undefined) {
  if (!channel) {
    return React.createElement(MessageSquare, { size: 12 });
  }
  if (channel === "whatsapp") {
    return React.createElement(Phone, { size: 12 });
  }
  if (channel === "internal" || channel === "webchat") {
    return React.createElement(Globe, { size: 12 });
  }
  if (kind === "group") {
    return React.createElement(Hash, { size: 12 });
  }
  return React.createElement(MessageSquare, { size: 12 });
}

export function sessionLabel(s: Session): string {
  if (s.derivedTitle) {
    return s.derivedTitle;
  }
  if (s.displayName) {
    return s.displayName;
  }
  if (s.label) {
    return s.label;
  }
  // Fall back to the last message preview (already loaded via includeLastMessage: true)
  const lastMsg = (s as Record<string, unknown>).lastMessage as string | undefined;
  if (lastMsg) {
    const clean = lastMsg.replace(/^(user|assistant):\s*/i, "").trim();
    if (clean.length > 0) {
      return clean.length > 50 ? clean.slice(0, 48) + "…" : clean;
    }
  }
  // Last resort: cleaned-up key
  const keyPart = s.key.split(":").pop() ?? s.key;
  return keyPart.length > 20 ? keyPart.slice(0, 18) + "…" : keyPart;
}

export function channelBadge(s: Session): React.ReactNode {
  const ch = s.channel ?? (s.key.includes(":whatsapp:") ? "whatsapp" : undefined);
  if (!ch || ch === "internal") {
    return null;
  }
  const color =
    ch === "whatsapp"
      ? "bg-green-500/20 text-green-400 border-green-500/30"
      : "bg-blue-500/20 text-blue-400 border-blue-500/30";
  return React.createElement(
    "span",
    { className: `text-[9px] px-1 py-0.5 rounded border font-mono ${color}` },
    ch,
  );
}

// ── Citizen key helpers ─────────────────────────────────────────────────────

export function isCitizenKey(key: string | null | undefined): boolean {
  return Boolean(key?.startsWith("citizen:"));
}

export function citizenIdFromKey(key: string): string {
  return key.replace(/^citizen:/, "");
}

// ── PDF export ──────────────────────────────────────────────────────────────

export function exportToPdf(messages: Message[], title: string, totalTokens: number): void {
  const html = [
    `<!DOCTYPE html><html><head><title>${title}</title>`,
    `<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:40px 20px;color:#1a1a2e;background:#fff}`,
    `.msg{margin:16px 0;padding:12px 16px;border-radius:12px;line-height:1.6;font-size:14px}`,
    `.user{background:#eff3ff;border-left:3px solid #6366f1;margin-left:40px}`,
    `.assistant{background:#f8f9fa;border-left:3px solid #22c55e;margin-right:40px}`,
    `.role{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;color:#666}`,
    `.ts{font-size:10px;color:#999;margin-top:4px}`,
    `h1{font-size:20px;border-bottom:2px solid #eee;padding-bottom:12px}`,
    `.meta{font-size:11px;color:#888;margin-bottom:24px}`,
    `pre{background:#1a1a2e;color:#e2e8f0;padding:12px;border-radius:8px;overflow-x:auto;font-size:12px}`,
    `@media print{body{padding:20px}}</style></head><body>`,
    `<h1>${title}</h1>`,
    `<div class="meta">${new Date().toLocaleString()} · ${messages.length} messages · ${totalTokens.toLocaleString()} tokens</div>`,
  ];
  for (const msg of messages) {
    const cls = msg.role === "user" ? "user" : "assistant";
    const role = msg.role === "user" ? "You" : "Assistant";
    const content = (msg.content ?? "")
      .replace(/🔧\s*\w+[^\n]*/g, "")
      .replace(/🔑[^\n]*/g, "")
      .replace(/📋[^\n]*/g, "")
      .replace(/🤖[^\n]*/g, "")
      .replace(/📎[^\n]*/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!content) {
      continue;
    }
    const escaped = content.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    html.push(
      `<div class="msg ${cls}"><div class="role">${role}</div>${escaped}<div class="ts">${new Date(msg.ts).toLocaleTimeString()}</div></div>`,
    );
  }
  html.push(`</body></html>`);
  const blob = new Blob([html.join("")], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    setTimeout(() => w.print(), 500);
  }
  // Revoke after 60s — enough time for the browser to consume the blob
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
