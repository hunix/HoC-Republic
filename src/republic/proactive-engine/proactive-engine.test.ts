/**
 * Proactive Engine — Unit Tests
 *
 * Tests trigger CRUD, event evaluation, condition matching,
 * cooldown, max fires, and diagnostics.
 */

import { describe, it, expect, beforeEach } from "vitest";
import type { TriggerCondition, TriggerAction, ProactiveEvent } from "./types.js";
import {
  createTrigger,
  getTrigger,
  listTriggers,
  deleteTrigger,
  setTriggerStatus,
  evaluateEvent,
  onTriggerFire,
  getProactiveDiagnostics,
  resetProactiveEngine,
} from "./core.js";

const NOOP_ACTION: TriggerAction = { type: "notify", message: "test" };

describe("Proactive Engine", () => {
  beforeEach(() => {
    resetProactiveEngine();
  });

  // ─── Trigger CRUD ──────────────────────────────────────────────

  describe("Trigger CRUD", () => {
    it("creates a trigger with defaults", () => {
      const trigger = createTrigger(
        "Test Trigger",
        "system",
        { type: "system", event: "cpu.high", threshold: 90 },
        NOOP_ACTION,
      );
      expect(trigger.id).toMatch(/^trigger-/);
      expect(trigger.status).toBe("active");
      expect(trigger.fireCount).toBe(0);
      expect(trigger.cooldownMs).toBe(60_000);
    });

    it("retrieves a trigger by ID", () => {
      const t = createTrigger("T", "cron", { type: "cron" }, NOOP_ACTION);
      expect(getTrigger(t.id)).not.toBeNull();
      expect(getTrigger("nonexistent")).toBeNull();
    });

    it("lists triggers by source", () => {
      createTrigger("A", "system", { type: "system", event: "e" }, NOOP_ACTION);
      createTrigger("B", "cron", { type: "cron" }, NOOP_ACTION);
      createTrigger("C", "system", { type: "system", event: "f" }, NOOP_ACTION);

      const systemTriggers = listTriggers("system");
      expect(systemTriggers.length).toBe(2);
      expect(systemTriggers.every((t) => t.source === "system")).toBe(true);
    });

    it("deletes a trigger", () => {
      const t = createTrigger("D", "cron", { type: "cron" }, NOOP_ACTION);
      expect(deleteTrigger(t.id)).toBe(true);
      expect(getTrigger(t.id)).toBeNull();
    });

    it("updates trigger status", () => {
      const t = createTrigger("S", "system", { type: "system", event: "x" }, NOOP_ACTION);
      expect(setTriggerStatus(t.id, "paused")).toBe(true);
      expect(getTrigger(t.id)!.status).toBe("paused");
    });
  });

  // ─── Event Evaluation ──────────────────────────────────────────

  describe("Event Evaluation", () => {
    it("fires a system trigger when condition matches", async () => {
      createTrigger(
        "CPU Alert",
        "system",
        { type: "system", event: "cpu.high", threshold: 90 },
        NOOP_ACTION,
      );

      const event: ProactiveEvent = {
        source: "system",
        data: { event: "cpu.high", value: 95 },
        timestamp: Date.now(),
      };

      const fired = await evaluateEvent(event);
      expect(fired.length).toBe(1);
      expect(fired[0].name).toBe("CPU Alert");
      expect(fired[0].fireCount).toBe(1);
    });

    it("does not fire when threshold not met", async () => {
      createTrigger(
        "CPU Alert",
        "system",
        { type: "system", event: "cpu.high", threshold: 90 },
        NOOP_ACTION,
      );

      const event: ProactiveEvent = {
        source: "system",
        data: { event: "cpu.high", value: 50 },
        timestamp: Date.now(),
      };

      const fired = await evaluateEvent(event);
      expect(fired.length).toBe(0);
    });

    it("does not fire paused triggers", async () => {
      const t = createTrigger("Paused", "system", { type: "system", event: "test" }, NOOP_ACTION);
      setTriggerStatus(t.id, "paused");

      const fired = await evaluateEvent({
        source: "system",
        data: { event: "test" },
        timestamp: Date.now(),
      });
      expect(fired.length).toBe(0);
    });

    it("respects maxFires limit", async () => {
      createTrigger("Once", "cron", { type: "cron" }, NOOP_ACTION, { maxFires: 1, cooldownMs: 0 });

      const event: ProactiveEvent = {
        source: "cron",
        data: {},
        timestamp: Date.now(),
      };

      const fired1 = await evaluateEvent(event);
      expect(fired1.length).toBe(1);

      const fired2 = await evaluateEvent(event);
      expect(fired2.length).toBe(0); // maxFires reached
    });

    it("fires email trigger with pattern matching", async () => {
      const condition: TriggerCondition = {
        type: "email",
        fromPattern: "@important\\.com$",
        subjectPattern: "urgent",
        bodyKeywords: ["deadline"],
      };
      createTrigger("Email Alert", "email", condition, NOOP_ACTION);

      const event: ProactiveEvent = {
        source: "email",
        data: {
          from: "boss@important.com",
          subject: "Urgent: Action needed",
          body: "Please review before the deadline",
        },
        timestamp: Date.now(),
      };

      const fired = await evaluateEvent(event);
      expect(fired.length).toBe(1);
    });

    it("fires webhook trigger with path matching", async () => {
      const condition: TriggerCondition = {
        type: "webhook",
        path: "/api/deploy",
        method: "POST",
      };
      createTrigger("Deploy Hook", "webhook", condition, NOOP_ACTION);

      const fired = await evaluateEvent({
        source: "webhook",
        data: { path: "/api/deploy", method: "POST" },
        timestamp: Date.now(),
      });
      expect(fired.length).toBe(1);
    });
  });

  // ─── Handler Notification ──────────────────────────────────────

  describe("Handler notifications", () => {
    it("calls registered handlers when trigger fires", async () => {
      let handlerCalled = false;
      onTriggerFire(async () => {
        handlerCalled = true;
      });

      createTrigger("H", "cron", { type: "cron" }, NOOP_ACTION, { cooldownMs: 0 });
      await evaluateEvent({ source: "cron", data: {}, timestamp: Date.now() });
      expect(handlerCalled).toBe(true);
    });
  });

  // ─── Diagnostics ──────────────────────────────────────────────

  describe("Diagnostics", () => {
    it("returns accurate diagnostics", () => {
      createTrigger("A", "system", { type: "system", event: "x" }, NOOP_ACTION);
      createTrigger("B", "cron", { type: "cron" }, NOOP_ACTION);

      const diag = getProactiveDiagnostics();
      expect(diag.totalTriggers).toBe(2);
      expect(diag.activeTriggers).toBe(2);
      expect(diag.triggersBySource["system"]).toBe(1);
      expect(diag.triggersBySource["cron"]).toBe(1);
    });
  });
});
