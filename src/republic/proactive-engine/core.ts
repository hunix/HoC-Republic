/**
 * Proactive Engine — Core Event Evaluator
 *
 * Manages triggers and evaluates incoming events against them.
 * When a trigger condition matches, fires the associated action.
 */

import type {
  Trigger,
  TriggerCondition,
  TriggerAction,
  TriggerSource,
  TriggerStatus,
  ProactiveEvent,
  ProactiveDiagnostics,
} from "./types.js";

// ─── State ───────────────────────────────────────────────────────

const triggers = new Map<string, Trigger>();
let idCounter = 0;
const MAX_TRIGGERS = 500;
const actionHandlers: Array<(trigger: Trigger, event: ProactiveEvent) => Promise<void>> = [];

function genId(): string {
  return `trigger-${Date.now().toString(36)}-${(++idCounter).toString(36)}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─── Trigger CRUD ────────────────────────────────────────────────

/** Create a new trigger */
export function createTrigger(
  name: string,
  source: TriggerSource,
  condition: TriggerCondition,
  action: TriggerAction,
  opts?: { maxFires?: number; cooldownMs?: number; expiresAt?: string },
): Trigger {
  if (triggers.size >= MAX_TRIGGERS) {
    throw new Error(`Max triggers (${MAX_TRIGGERS}) reached`);
  }

  const trigger: Trigger = {
    id: genId(),
    name,
    source,
    condition,
    action,
    status: "active",
    fireCount: 0,
    maxFires: opts?.maxFires ?? 0,
    cooldownMs: opts?.cooldownMs ?? 60_000,
    createdAt: now(),
    expiresAt: opts?.expiresAt,
  };

  triggers.set(trigger.id, trigger);
  return trigger;
}

/** Get trigger by ID */
export function getTrigger(id: string): Trigger | null {
  return triggers.get(id) ?? null;
}

/** List all triggers */
export function listTriggers(source?: TriggerSource): Trigger[] {
  let all = [...triggers.values()];
  if (source) {
    all = all.filter((t) => t.source === source);
  }
  return all.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Update trigger status */
export function setTriggerStatus(id: string, status: TriggerStatus): boolean {
  const trigger = triggers.get(id);
  if (!trigger) {
    return false;
  }
  trigger.status = status;
  return true;
}

/** Delete a trigger */
export function deleteTrigger(id: string): boolean {
  return triggers.delete(id);
}

// ─── Action Handler Registration ─────────────────────────────────

/** Register a handler that fires when any trigger matches */
export function onTriggerFire(
  handler: (trigger: Trigger, event: ProactiveEvent) => Promise<void>,
): void {
  actionHandlers.push(handler);
}

// ─── Event Evaluation ────────────────────────────────────────────

/**
 * Evaluate an incoming event against all active triggers.
 * Returns the list of triggers that fired.
 */
export async function evaluateEvent(event: ProactiveEvent): Promise<Trigger[]> {
  const fired: Trigger[] = [];
  const nowTs = Date.now();

  for (const trigger of triggers.values()) {
    if (trigger.status !== "active") {
      continue;
    }
    if (trigger.source !== event.source) {
      continue;
    }

    // Check expiry
    if (trigger.expiresAt && new Date(trigger.expiresAt).getTime() < nowTs) {
      trigger.status = "expired";
      continue;
    }

    // Check max fires
    if (trigger.maxFires > 0 && trigger.fireCount >= trigger.maxFires) {
      trigger.status = "expired";
      continue;
    }

    // Check cooldown
    if (trigger.lastFiredAt) {
      const elapsed = nowTs - new Date(trigger.lastFiredAt).getTime();
      if (elapsed < trigger.cooldownMs) {
        continue;
      }
    }

    // Evaluate condition
    if (!matchesCondition(trigger.condition, event)) {
      continue;
    }

    // Fire!
    trigger.fireCount++;
    trigger.lastFiredAt = now();
    trigger.status =
      trigger.maxFires > 0 && trigger.fireCount >= trigger.maxFires ? "expired" : "active";
    fired.push(trigger);

    // Notify handlers
    for (const handler of actionHandlers) {
      try {
        await handler(trigger, event);
      } catch (err) {
        console.warn(`[proactive] Handler error for trigger ${trigger.id}:`, err);
      }
    }
  }

  return fired;
}

// ─── Condition Matching ──────────────────────────────────────────

function matchesCondition(condition: TriggerCondition, event: ProactiveEvent): boolean {
  const data = event.data;

  switch (condition.type) {
    case "email": {
      const from = String(data.from ?? "");
      const subject = String(data.subject ?? "");
      const body = String(data.body ?? "");

      if (condition.fromPattern && !matchPattern(from, condition.fromPattern)) {
        return false;
      }
      if (condition.subjectPattern && !matchPattern(subject, condition.subjectPattern)) {
        return false;
      }
      if (condition.bodyKeywords?.length) {
        const bodyLower = body.toLowerCase();
        if (!condition.bodyKeywords.some((kw) => bodyLower.includes(kw.toLowerCase()))) {
          return false;
        }
      }
      return true;
    }

    case "calendar": {
      const titleMatch = condition.titlePattern
        ? matchPattern(String(data.title ?? ""), condition.titlePattern)
        : true;
      return titleMatch;
    }

    case "cron":
      // Cron evaluation is done externally — if the event arrives, it matched
      return true;

    case "webhook": {
      const path = String(data.path ?? "");
      const method = String(data.method ?? "POST");
      if (condition.path !== path) {
        return false;
      }
      if (condition.method && condition.method !== method) {
        return false;
      }
      return true;
    }

    case "system": {
      const eventName = String(data.event ?? "");
      if (condition.event !== eventName) {
        return false;
      }
      if (condition.threshold !== undefined) {
        const value = Number(data.value ?? 0);
        if (value < condition.threshold) {
          return false;
        }
      }
      return true;
    }

    case "file_watch": {
      const eventType = String(data.event ?? "") as "create" | "modify" | "delete";
      const filePath = String(data.path ?? "");
      if (!condition.events.includes(eventType)) {
        return false;
      }
      if (!filePath.startsWith(condition.path)) {
        return false;
      }
      return true;
    }

    default:
      return false;
  }
}

function matchPattern(text: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return text.toLowerCase().includes(pattern.toLowerCase());
  }
}

// ─── Diagnostics ─────────────────────────────────────────────────

export function getProactiveDiagnostics(): ProactiveDiagnostics {
  const all = [...triggers.values()];
  const bySource: Record<string, number> = {};
  let totalFires = 0;

  for (const t of all) {
    bySource[t.source] = (bySource[t.source] ?? 0) + 1;
    totalFires += t.fireCount;
  }

  return {
    totalTriggers: all.length,
    activeTriggers: all.filter((t) => t.status === "active").length,
    totalFires,
    triggersBySource: bySource,
  };
}

/** Reset all triggers (testing) */
export function resetProactiveEngine(): void {
  triggers.clear();
  actionHandlers.length = 0;
  idCounter = 0;
}
