/**
 * Republic Platform — Economy Engine Tests
 *
 * Tests for: economyTick drift, harvester operations, tax rate,
 * resource purchasing, and treasury report building.
 */

import { describe, it, expect } from "vitest";
import {
  economyTick,
  toggleHarvester,
  setTaxRate,
  purchaseResource,
  buildTreasuryReport,
} from "./economy.js";
import { createSeedState } from "./seed-state.js";
import type { RepublicState } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────

function makeState(): RepublicState {
  return createSeedState();
}

// ─── Economy Tick ───────────────────────────────────────────────

describe("economyTick", () => {
  it("advances harvester earnings for enabled harvesters", () => {
    const s = makeState();
    s.mode = "simulated";
    // Ensure at least one enabled harvester
    if (s.harvesters.length > 0) {
      s.harvesters[0].enabled = true;
      const earningsBefore = s.harvesters[0].totalEarned;
      economyTick(s);
      expect(s.harvesters[0].totalEarned).toBeGreaterThan(earningsBefore);
    }
  });

  it("does not advance earnings for disabled harvesters", () => {
    const s = makeState();
    if (s.harvesters.length > 0) {
      s.harvesters[0].enabled = false;
      const earningsBefore = s.harvesters[0].totalEarned;
      economyTick(s);
      expect(s.harvesters[0].totalEarned).toBe(earningsBefore);
    }
  });

  it("drifts resource consumption values", () => {
    const s = makeState();
    s.mode = "simulated";
    if (s.resources.length > 0) {
      const consumptionBefore = s.resources[0].consumption;
      // Run multiple ticks to increase chance of drift
      for (let i = 0; i < 20; i++) {
        economyTick(s);
      }
      // Consumption should have changed (probabilistically — with 20 ticks
      // the chance of no change is negligible)
      expect(s.resources[0].consumption).not.toBe(consumptionBefore);
    }
  });

  it("drifts market prices", () => {
    const s = makeState();
    s.mode = "simulated";
    const btcBefore = s.priceIndex.BTC;
    for (let i = 0; i < 20; i++) {
      economyTick(s);
    }
    // Price should have changed with high probability
    expect(s.priceIndex.BTC).not.toBe(btcBefore);
    expect(s.priceIndex.BTC).toBeGreaterThanOrEqual(10000);
    expect(s.priceIndex.ETH).toBeGreaterThanOrEqual(500);
  });

  it("caps transactions at 200", () => {
    const s = makeState();
    // Push 250 dummy transactions
    for (let i = 0; i < 250; i++) {
      s.transactions.push({
        id: `tx-${i}`,
        type: "Trade",
        amount: i,
        currency: "Credits",
        description: `Test tx ${i}`,
        timestamp: new Date().toISOString(),
      });
    }
    economyTick(s);
    expect(s.transactions.length).toBeLessThanOrEqual(200);
  });
});

// ─── Harvester Operations ───────────────────────────────────────

describe("toggleHarvester", () => {
  it("toggles harvester enabled state", () => {
    const s = makeState();
    if (s.harvesters.length > 0) {
      const before = s.harvesters[0].enabled;
      const result = toggleHarvester(s, s.harvesters[0].id);
      expect(result.ok).toBe(true);
      expect(s.harvesters[0].enabled).toBe(!before);
    }
  });

  it("returns error for unknown harvester", () => {
    const s = makeState();
    const result = toggleHarvester(s, "nonexistent");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });
});

// ─── Tax Rate ───────────────────────────────────────────────────

describe("setTaxRate", () => {
  it("sets valid tax rate", () => {
    const s = makeState();
    const result = setTaxRate(s, 0.15);
    expect(result.ok).toBe(true);
    expect(s.taxRate).toBe(0.15);
  });

  it("rejects negative rate", () => {
    const s = makeState();
    const result = setTaxRate(s, -0.1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("0-1");
  });

  it("rejects rate above 1", () => {
    const s = makeState();
    const result = setTaxRate(s, 1.5);
    expect(result.ok).toBe(false);
  });

  it("accepts boundary values 0 and 1", () => {
    const s = makeState();
    expect(setTaxRate(s, 0).ok).toBe(true);
    expect(setTaxRate(s, 1).ok).toBe(true);
  });
});

// ─── Resource Purchasing ────────────────────────────────────────

describe("purchaseResource", () => {
  it("purchases a resource and deducts credits", () => {
    const s = makeState();
    if (s.resources.length > 0) {
      s.balances.Credits = 100_000;
      const availBefore = s.resources[0].available;
      const creditsBefore = s.balances.Credits;
      const result = purchaseResource(s, s.resources[0].type, 10);
      expect(result.ok).toBe(true);
      expect(s.resources[0].available).toBe(availBefore + 10);
      expect(s.balances.Credits).toBeLessThan(creditsBefore);
    }
  });

  it("creates a transaction record", () => {
    const s = makeState();
    if (s.resources.length > 0) {
      s.balances.Credits = 100_000;
      const txBefore = s.transactions.length;
      purchaseResource(s, s.resources[0].type, 5);
      expect(s.transactions.length).toBe(txBefore + 1);
      expect(s.transactions[s.transactions.length - 1].type).toBe("ResourcePurchase");
    }
  });

  it("rejects unknown resource type", () => {
    const s = makeState();
    const result = purchaseResource(s, "unobtanium", 5);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("rejects zero or negative quantity", () => {
    const s = makeState();
    if (s.resources.length > 0) {
      expect(purchaseResource(s, s.resources[0].type, 0).ok).toBe(false);
      expect(purchaseResource(s, s.resources[0].type, -5).ok).toBe(false);
    }
  });

  it("rejects purchase with insufficient credits", () => {
    const s = makeState();
    if (s.resources.length > 0) {
      s.balances.Credits = 0;
      const result = purchaseResource(s, s.resources[0].type, 1000);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("insufficient");
    }
  });
});

// ─── Treasury Report ────────────────────────────────────────────

describe("buildTreasuryReport", () => {
  it("returns report with expected shape", () => {
    const s = makeState();
    const report = buildTreasuryReport(s);
    expect(report.balances).toBeDefined();
    expect(Array.isArray(report.balances)).toBe(true);
    expect(typeof report.totalValueUSD).toBe("number");
    expect(typeof report.taxRate).toBe("number");
    expect(Array.isArray(report.recentTransactions)).toBe(true);
    expect(Array.isArray(report.harvesters)).toBe(true);
    expect(Array.isArray(report.resources)).toBe(true);
    expect(typeof report.dailyRevenue).toBe("number");
    expect(typeof report.dailyExpenses).toBe("number");
  });

  it("includes all balance currencies", () => {
    const s = makeState();
    const report = buildTreasuryReport(s);
    const currencies = report.balances.map((b: { currency: string }) => b.currency);
    expect(currencies).toContain("Credits");
  });
});
