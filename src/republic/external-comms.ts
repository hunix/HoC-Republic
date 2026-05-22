/**
 * Republic Platform — External Communication & Delivery
 *
 * Provides outbound communication capabilities:
 * - Email sending via configurable providers (SMTP/Resend/SendGrid)
 * - Webhook dispatch for event-driven integrations
 * - In-app notification center
 * - Scheduled delivery pipeline for reports, invoices, and artifacts
 *
 * Leverages republic-config.ts for email provider configuration.
 */

import { getConfig } from "./republic-config.js";
import type {
    AppNotification,
    EmailRecord,
    RepublicState,
    ScheduledDelivery,
    WebhookConfig
} from "./types.js";
import { ts, uid } from "./utils.js";

// ─── Constants ──────────────────────────────────────────────────

const MAX_EMAIL_LOG = 500;
const MAX_NOTIFICATIONS = 1000;
const MAX_DELIVERY_QUEUE = 200;
const MAX_WEBHOOK_FAILURES = 10;

// ─── Email ──────────────────────────────────────────────────────

/**
 * Send an email via the configured provider.
 * Falls back to logging if no provider is configured.
 */
export async function sendEmail(
  s: RepublicState,
  to: string,
  subject: string,
  body: string,
  from?: string,
): Promise<EmailRecord> {
  if (!s.emailLog) {
    s.emailLog = [];
  }

  const config = getConfig();
  const senderAddress = from ?? `republic@${config.email?.domain ?? "hoc.local"}`;

  const record: EmailRecord = {
    id: uid(),
    to,
    from: senderAddress,
    subject,
    body,
    status: "queued",
  };

  // Attempt real send based on configured provider
  const provider = config.email?.provider;

  if (provider === "resend") {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          Authorization: `Bearer ${String((config as Record<string, unknown>)["resendApiKey"] ?? "")}`,
        },
        body: JSON.stringify({ from: senderAddress, to, subject, html: body }),
      });

      if (res.ok) {
        record.status = "sent";
        record.sentAt = ts();
      } else {
        record.status = "failed";
        record.error = `Resend API error: ${res.status}`;
      }
    } catch (err) {
      record.status = "failed";
      record.error = String(err);
    }
  } else if (provider === "sendgrid") {
    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // eslint-disable-next-line @typescript-eslint/no-base-to-string
          Authorization: `Bearer ${String((config as Record<string, unknown>)["sendgridApiKey"] ?? "")}`,
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: senderAddress },
          subject,
          content: [{ type: "text/html", value: body }],
        }),
      });

      if (res.ok || res.status === 202) {
        record.status = "sent";
        record.sentAt = ts();
      } else {
        record.status = "failed";
        record.error = `SendGrid API error: ${res.status}`;
      }
    } catch (err) {
      record.status = "failed";
      record.error = String(err);
    }
  } else {
    // No provider or SMTP — log as simulated
    record.status = "sent";
    record.sentAt = ts();
    record.error =
      provider === "smtp"
        ? "SMTP not implemented — logged locally"
        : "No email provider configured — logged locally";
  }

  s.emailLog.push(record);

  // Cap log
  if (s.emailLog.length > MAX_EMAIL_LOG) {
    s.emailLog.splice(0, s.emailLog.length - MAX_EMAIL_LOG);
  }

  // Emit event
  s.events.push({
    citizenId: "system",
    citizenName: "System",
    type: "EmailSent",
    description: `Email to ${to}: ${subject}`,
    timestamp: ts(),
  });

  return record;
}

/**
 * Send bulk emails.
 */
export async function sendBulkEmail(
  s: RepublicState,
  recipients: string[],
  subject: string,
  body: string,
): Promise<EmailRecord[]> {
  const results: EmailRecord[] = [];
  for (const to of recipients) {
    const result = await sendEmail(s, to, subject, body);
    results.push(result);
  }
  return results;
}

/**
 * Get email history with optional filters.
 */
export function getEmailHistory(
  s: RepublicState,
  limit = 50,
  statusFilter?: EmailRecord["status"],
): EmailRecord[] {
  if (!s.emailLog) {
    return [];
  }

  let log = s.emailLog;
  if (statusFilter) {
    log = log.filter((e) => e.status === statusFilter);
  }

  return log.slice(-limit);
}

// ─── Webhooks ───────────────────────────────────────────────────

/**
 * Register a new outbound webhook.
 */
export function registerWebhook(
  s: RepublicState,
  name: string,
  url: string,
  events: string[],
  secret?: string,
): WebhookConfig {
  if (!s.webhooks) {
    s.webhooks = [];
  }

  const webhook: WebhookConfig = {
    id: uid(),
    name,
    url,
    events,
    secret,
    active: true,
    createdAt: ts(),
    failCount: 0,
  };

  s.webhooks.push(webhook);

  return webhook;
}

/**
 * Fire a webhook with the given event and payload.
 * Sends to all registered webhooks that subscribe to this event.
 */
export async function fireWebhook(
  s: RepublicState,
  event: string,
  payload: Record<string, unknown>,
): Promise<Array<{ webhookId: string; success: boolean; error?: string }>> {
  if (!s.webhooks) {
    return [];
  }

  const results: Array<{ webhookId: string; success: boolean; error?: string }> = [];

  for (const wh of s.webhooks) {
    if (!wh.active || !wh.events.includes(event)) {
      continue;
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (wh.secret) {
        // Simple HMAC-like signature header
        headers["X-Webhook-Secret"] = wh.secret;
      }

      const res = await fetch(wh.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event,
          payload,
          timestamp: ts(),
          webhookId: wh.id,
        }),
      });

      if (res.ok) {
        wh.lastFiredAt = ts();
        wh.failCount = 0;
        results.push({ webhookId: wh.id, success: true });
      } else {
        wh.failCount++;
        results.push({
          webhookId: wh.id,
          success: false,
          error: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      wh.failCount++;
      results.push({
        webhookId: wh.id,
        success: false,
        error: String(err),
      });
    }

    // Auto-disable after too many failures
    if (wh.failCount >= MAX_WEBHOOK_FAILURES) {
      wh.active = false;
    }
  }

  s.events.push({
    citizenId: "system",
    citizenName: "System",
    type: "WebhookFired",
    description: `Webhook event: ${event} — ${results.length} endpoints`,
    timestamp: ts(),
  });

  return results;
}

/**
 * List all registered webhooks.
 */
export function listWebhooks(s: RepublicState): WebhookConfig[] {
  return s.webhooks ?? [];
}

/**
 * Remove a webhook by ID.
 */
export function removeWebhook(s: RepublicState, webhookId: string): boolean {
  if (!s.webhooks) {
    return false;
  }

  const idx = s.webhooks.findIndex((w) => w.id === webhookId);
  if (idx < 0) {
    return false;
  }

  s.webhooks.splice(idx, 1);
  return true;
}

// ─── Notifications ──────────────────────────────────────────────

/**
 * Queue an in-app notification.
 */
export function queueNotification(
  s: RepublicState,
  type: AppNotification["type"],
  title: string,
  message: string,
  citizenId?: string,
  actionUrl?: string,
): AppNotification {
  if (!s.notifications) {
    s.notifications = [];
  }

  const notification: AppNotification = {
    id: uid(),
    type,
    title,
    message,
    citizenId,
    read: false,
    createdAt: ts(),
    actionUrl,
  };

  s.notifications.push(notification);

  // Cap
  if (s.notifications.length > MAX_NOTIFICATIONS) {
    s.notifications.splice(0, s.notifications.length - MAX_NOTIFICATIONS);
  }

  return notification;
}

/**
 * Get notifications with filters.
 */
export function getNotifications(
  s: RepublicState,
  limit = 50,
  unreadOnly = false,
  citizenId?: string,
): AppNotification[] {
  if (!s.notifications) {
    return [];
  }

  let notes = s.notifications;
  if (unreadOnly) {
    notes = notes.filter((n) => !n.read);
  }
  if (citizenId) {
    notes = notes.filter((n) => n.citizenId === citizenId || !n.citizenId);
  }

  return notes.slice(-limit);
}

/**
 * Mark a notification as read.
 */
export function markNotificationRead(s: RepublicState, notificationId: string): boolean {
  if (!s.notifications) {
    return false;
  }

  const note = s.notifications.find((n) => n.id === notificationId);
  if (!note || note.read) {
    return false;
  }

  note.read = true;
  note.readAt = ts();
  return true;
}

// ─── Delivery Pipeline ──────────────────────────────────────────

/**
 * Schedule a deliverable (report, invoice, artifact, etc.).
 */
export function scheduleDelivery(
  s: RepublicState,
  type: ScheduledDelivery["type"],
  payload: Record<string, unknown>,
  scheduledAt?: string,
  recipientEmail?: string,
  webhookId?: string,
): ScheduledDelivery {
  if (!s.deliveryQueue) {
    s.deliveryQueue = [];
  }

  const delivery: ScheduledDelivery = {
    id: uid(),
    type,
    recipientEmail,
    webhookId,
    payload,
    scheduledAt: scheduledAt ?? ts(),
    status: "pending",
  };

  s.deliveryQueue.push(delivery);

  // Cap
  if (s.deliveryQueue.length > MAX_DELIVERY_QUEUE) {
    // Remove oldest executed
    const executedIdx = s.deliveryQueue.findIndex((d) => d.status !== "pending");
    if (executedIdx >= 0) {
      s.deliveryQueue.splice(executedIdx, 1);
    }
  }

  s.events.push({
    citizenId: "system",
    citizenName: "System",
    type: "DeliveryScheduled",
    description: `Scheduled ${type} delivery${recipientEmail ? ` to ${recipientEmail}` : ""}`,
    timestamp: ts(),
  });

  return delivery;
}

/**
 * Get pending deliveries.
 */
export function getDeliveryQueue(
  s: RepublicState,
  statusFilter?: ScheduledDelivery["status"],
): ScheduledDelivery[] {
  if (!s.deliveryQueue) {
    return [];
  }

  if (statusFilter) {
    return s.deliveryQueue.filter((d) => d.status === statusFilter);
  }

  return [...s.deliveryQueue];
}

/**
 * Execute a pending delivery.
 */
export async function executeDelivery(
  s: RepublicState,
  deliveryId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!s.deliveryQueue) {
    return { ok: false, error: "No delivery queue" };
  }

  const delivery = s.deliveryQueue.find((d) => d.id === deliveryId);
  if (!delivery) {
    return { ok: false, error: "Delivery not found" };
  }

  if (delivery.status !== "pending") {
    return { ok: false, error: `Delivery already ${delivery.status}` };
  }

  try {
    // Execute based on delivery type
    if (delivery.type === "email" && delivery.recipientEmail) {
      await sendEmail(
        s,
        delivery.recipientEmail,
        (delivery.payload["subject"] as string) ?? "Republic Delivery",
        (delivery.payload["body"] as string) ?? JSON.stringify(delivery.payload),
      );
    } else if (delivery.type === "webhook" && delivery.webhookId) {
      await fireWebhook(s, "delivery", delivery.payload);
    }
    // For report/invoice/artifact — just mark as executed (consumer reads payload)

    delivery.status = "executed";
    delivery.executedAt = ts();
    return { ok: true };
  } catch (err) {
    delivery.status = "failed";
    delivery.error = String(err);
    return { ok: false, error: String(err) };
  }
}

/**
 * Cancel a pending delivery.
 */
export function cancelDelivery(s: RepublicState, deliveryId: string): boolean {
  if (!s.deliveryQueue) {
    return false;
  }

  const delivery = s.deliveryQueue.find((d) => d.id === deliveryId);
  if (!delivery || delivery.status !== "pending") {
    return false;
  }

  delivery.status = "cancelled";
  return true;
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface ExternalCommsDiagnostics {
  totalEmailsSent: number;
  totalEmailsFailed: number;
  totalWebhooks: number;
  activeWebhooks: number;
  totalNotifications: number;
  unreadNotifications: number;
  pendingDeliveries: number;
  executedDeliveries: number;
}

export function getExternalCommsDiagnostics(s: RepublicState): ExternalCommsDiagnostics {
  const emails = s.emailLog ?? [];
  const webhooks = s.webhooks ?? [];
  const notifications = s.notifications ?? [];
  const deliveries = s.deliveryQueue ?? [];

  return {
    totalEmailsSent: emails.filter((e) => e.status === "sent").length,
    totalEmailsFailed: emails.filter((e) => e.status === "failed").length,
    totalWebhooks: webhooks.length,
    activeWebhooks: webhooks.filter((w) => w.active).length,
    totalNotifications: notifications.length,
    unreadNotifications: notifications.filter((n) => !n.read).length,
    pendingDeliveries: deliveries.filter((d) => d.status === "pending").length,
    executedDeliveries: deliveries.filter((d) => d.status === "executed").length,
  };
}
