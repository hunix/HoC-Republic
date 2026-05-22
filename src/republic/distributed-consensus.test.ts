/**
 * Republic Platform — Distributed Consensus Tests
 *
 * Tests for: VectorClock, GCounter, LWWRegister, ORSet
 * Focus on CRDT commutativity, idempotency, and merge semantics.
 */

import { describe, it, expect } from "vitest";
import {
  VectorClock,
  GCounter,
  LWWRegister,
  ORSet,
} from "./distributed-consensus.js";

// ─── VectorClock ────────────────────────────────────────────────

describe("VectorClock", () => {
  it("initializes empty", () => {
    const vc = new VectorClock();
    expect(vc.toJSON()).toEqual({});
  });

  it("initializes from record", () => {
    const vc = new VectorClock({ A: 3, B: 1 });
    const json = vc.toJSON();
    expect(json.A).toBe(3);
    expect(json.B).toBe(1);
  });

  it("increment advances a single node's clock", () => {
    const vc = new VectorClock();
    vc.increment("A");
    vc.increment("A");
    vc.increment("B");
    expect(vc.toJSON()).toEqual({ A: 2, B: 1 });
  });

  it("merge is commutative", () => {
    const a = new VectorClock({ A: 3, B: 1 });
    const b = new VectorClock({ A: 1, B: 5, C: 2 });

    const ab = VectorClock.fromJSON(a.toJSON());
    ab.merge(b);

    const ba = VectorClock.fromJSON(b.toJSON());
    ba.merge(a);

    expect(ab.toJSON()).toEqual(ba.toJSON());
  });

  it("merge is idempotent", () => {
    const a = new VectorClock({ A: 3, B: 1 });
    const b = VectorClock.fromJSON(a.toJSON());

    a.merge(b);
    const afterFirst = a.toJSON();
    a.merge(b);
    expect(a.toJSON()).toEqual(afterFirst);
  });

  it("merge takes max of each entry", () => {
    const a = new VectorClock({ X: 5, Y: 2 });
    const b = new VectorClock({ X: 3, Y: 7, Z: 1 });
    a.merge(b);
    expect(a.toJSON()).toEqual({ X: 5, Y: 7, Z: 1 });
  });

  it("happensBefore detects causal ordering", () => {
    const a = new VectorClock({ A: 1, B: 0 });
    const b = new VectorClock({ A: 1, B: 1 });
    expect(a.happensBefore(b)).toBe(true);
    expect(b.happensBefore(a)).toBe(false);
  });

  it("isConcurrentWith detects concurrent events", () => {
    const a = new VectorClock({ A: 2, B: 1 });
    const b = new VectorClock({ A: 1, B: 2 });
    expect(a.isConcurrentWith(b)).toBe(true);
  });

  it("identical clocks are not concurrent", () => {
    const a = new VectorClock({ A: 1, B: 1 });
    const b = new VectorClock({ A: 1, B: 1 });
    // Neither happens-before the other AND they're equal
    // But by the definition: happensBefore requires at least one strictly less
    expect(a.happensBefore(b)).toBe(false);
    expect(b.happensBefore(a)).toBe(false);
  });

  it("fromJSON round-trips correctly", () => {
    const original = new VectorClock({ A: 5, B: 3, C: 1 });
    const json = original.toJSON();
    const restored = VectorClock.fromJSON(json);
    expect(restored.toJSON()).toEqual(json);
  });
});

// ─── GCounter ───────────────────────────────────────────────────

describe("GCounter", () => {
  it("starts at zero", () => {
    const gc = new GCounter();
    expect(gc.value).toBe(0);
  });

  it("increments are monotonic", () => {
    const gc = new GCounter();
    gc.increment("A", 3);
    gc.increment("B", 2);
    gc.increment("A", 1);
    expect(gc.value).toBe(6);
  });

  it("merge is commutative", () => {
    const a = new GCounter({ A: 5, B: 3 });
    const b = new GCounter({ A: 2, B: 7, C: 1 });

    const ab = GCounter.fromJSON(a.toJSON());
    ab.merge(b);
    const ba = GCounter.fromJSON(b.toJSON());
    ba.merge(a);

    expect(ab.value).toBe(ba.value);
    expect(ab.toJSON()).toEqual(ba.toJSON());
  });

  it("merge is idempotent", () => {
    const a = new GCounter({ A: 5 });
    const b = GCounter.fromJSON(a.toJSON());
    a.merge(b);
    const after = a.value;
    a.merge(b);
    expect(a.value).toBe(after);
  });

  it("merge takes max per node", () => {
    const a = new GCounter({ A: 3 });
    const b = new GCounter({ A: 7 });
    a.merge(b);
    expect(a.value).toBe(7);
  });

  it("fromJSON round-trips", () => {
    const gc = new GCounter({ X: 10, Y: 20 });
    const json = gc.toJSON();
    const restored = GCounter.fromJSON(json);
    expect(restored.value).toBe(30);
  });
});

// ─── LWWRegister ────────────────────────────────────────────────

describe("LWWRegister", () => {
  it("stores initial value", () => {
    const reg = new LWWRegister("hello", 100, "nodeA");
    expect(reg.value).toBe("hello");
    expect(reg.timestamp).toBe(100);
  });

  it("set succeeds with newer timestamp", () => {
    const reg = new LWWRegister("old", 100, "nodeA");
    const updated = reg.set("new", 200, "nodeA");
    expect(updated).toBe(true);
    expect(reg.value).toBe("new");
  });

  it("set fails with older timestamp", () => {
    const reg = new LWWRegister("current", 200, "nodeA");
    const updated = reg.set("old", 100, "nodeA");
    expect(updated).toBe(false);
    expect(reg.value).toBe("current");
  });

  it("set uses node ID for tie-breaking", () => {
    const reg = new LWWRegister("A-value", 100, "nodeA");
    // Same timestamp but higher nodeId wins
    const updated = reg.set("B-value", 100, "nodeB");
    expect(updated).toBe(true);
    expect(reg.value).toBe("B-value");
  });

  it("merge picks newer value", () => {
    const a = new LWWRegister("old", 100, "nodeA");
    const b = new LWWRegister("new", 200, "nodeB");
    a.merge(b);
    expect(a.value).toBe("new");
  });

  it("toJSON serializes correctly", () => {
    const reg = new LWWRegister(42, 500, "nodeX");
    const json = reg.toJSON();
    expect(json.value).toBe(42);
    expect(json.timestamp).toBe(500);
    expect(json.nodeId).toBe("nodeX");
  });
});

// ─── ORSet ──────────────────────────────────────────────────────

describe("ORSet", () => {
  it("starts empty", () => {
    const set = new ORSet<string>();
    expect(set.size).toBe(0);
    expect(set.values).toEqual([]);
  });

  it("add inserts and returns a tag", () => {
    const set = new ORSet<string>();
    const tag = set.add("apple");
    expect(tag).toBeTruthy();
    expect(set.values).toContain("apple");
    expect(set.size).toBe(1);
  });

  it("add allows duplicates (with unique tags)", () => {
    const set = new ORSet<string>();
    const tag1 = set.add("apple");
    const tag2 = set.add("apple");
    expect(tag1).not.toBe(tag2);
    expect(set.size).toBe(2);
  });

  it("remove by tag removes specific entry", () => {
    const set = new ORSet<string>();
    const tag1 = set.add("apple");
    set.add("banana");
    const removed = set.remove(tag1);
    expect(removed).toBe(true);
    expect(set.values).not.toContain("apple");
    expect(set.values).toContain("banana");
  });

  it("remove returns false for unknown tag", () => {
    const set = new ORSet<string>();
    expect(set.remove("nonexistent")).toBe(false);
  });

  it("removeByValue removes all entries with value", () => {
    const set = new ORSet<string>();
    set.add("apple");
    set.add("apple");
    set.add("banana");
    const count = set.removeByValue("apple");
    expect(count).toBe(2);
    expect(set.size).toBe(1);
    expect(set.values).toEqual(["banana"]);
  });

  it("merge combines entries from both sets", () => {
    const a = new ORSet<string>();
    a.add("apple");
    const b = new ORSet<string>();
    b.add("banana");

    a.merge(b);
    expect(a.values).toContain("apple");
    expect(a.values).toContain("banana");
  });

  it("merge respects observed removals", () => {
    const a = new ORSet<string>();
    const tag = a.add("apple");
    a.add("banana");

    // Clone before removal
    const b = new ORSet<string>();
    b.merge(a);

    // Remove in a
    a.remove(tag);

    // Re-merge — b's apple should be removed because a observed the removal
    b.merge(a);
    expect(b.values).not.toContain("apple");
    expect(b.values).toContain("banana");
  });
});
