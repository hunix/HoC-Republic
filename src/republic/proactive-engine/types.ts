/**
 * Proactive Engine — Types
 *
 * Event-driven triggers that fire agent actions automatically.
 */

// ─── Trigger ─────────────────────────────────────────────────────

export type TriggerSource = "email" | "calendar" | "cron" | "webhook" | "system" | "file_watch";
export type TriggerStatus = "active" | "paused" | "fired" | "error" | "expired";

export interface Trigger {
  id: string;
  /** Human-readable name */
  name: string;
  /** Event source type */
  source: TriggerSource;
  /** Condition to evaluate (source-specific) */
  condition: TriggerCondition;
  /** Action to execute when triggered */
  action: TriggerAction;
  /** Current status */
  status: TriggerStatus;
  /** How many times this has fired */
  fireCount: number;
  /** Maximum fires (0 = unlimited) */
  maxFires: number;
  /** Cooldown between fires in ms */
  cooldownMs: number;
  /** Last triggered timestamp */
  lastFiredAt?: string;
  /** Created timestamp */
  createdAt: string;
  /** Expiry timestamp (optional) */
  expiresAt?: string;
}

// ─── Conditions ──────────────────────────────────────────────────

export type TriggerCondition =
  | EmailCondition
  | CalendarCondition
  | CronCondition
  | WebhookCondition
  | SystemCondition
  | FileWatchCondition;

export interface EmailCondition {
  type: "email";
  /** Match sender email/name pattern */
  fromPattern?: string;
  /** Match subject pattern */
  subjectPattern?: string;
  /** Match body contains keyword */
  bodyKeywords?: string[];
}

export interface CalendarCondition {
  type: "calendar";
  /** Minutes before event to trigger */
  minutesBefore: number;
  /** Match event title pattern */
  titlePattern?: string;
}

export interface CronCondition {
  type: "cron";
  /** Cron expression */
  expression: string;
}

export interface WebhookCondition {
  type: "webhook";
  /** Expected webhook path */
  path: string;
  /** Expected method */
  method?: string;
}

export interface SystemCondition {
  type: "system";
  /** System event name */
  event: string;
  /** Threshold value (e.g., CPU > 80%) */
  threshold?: number;
}

export interface FileWatchCondition {
  type: "file_watch";
  /** Path to watch */
  path: string;
  /** Events to watch for */
  events: Array<"create" | "modify" | "delete">;
}

// ─── Actions ─────────────────────────────────────────────────────

export interface TriggerAction {
  /** Action type */
  type: "agent_task" | "notification" | "rpc_call" | "webhook_post";
  /** Agent task prompt (for agent_task) */
  prompt?: string;
  /** RPC method to call */
  rpcMethod?: string;
  /** RPC params */
  rpcParams?: Record<string, unknown>;
  /** Notification message */
  message?: string;
  /** Webhook URL to POST to */
  webhookUrl?: string;
}

// ─── Events ──────────────────────────────────────────────────────

export interface ProactiveEvent {
  source: TriggerSource;
  data: Record<string, unknown>;
  timestamp: string;
}

// ─── Diagnostics ─────────────────────────────────────────────────

export interface ProactiveDiagnostics {
  totalTriggers: number;
  activeTriggers: number;
  totalFires: number;
  triggersBySource: Record<string, number>;
}
