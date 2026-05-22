/**
 * Quantum State Sync — Phase 23 Tests
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  entangle, decohere, propagateState, collapseState,
  teleportState, createSwarm, swarmBroadcast, getPairState,
  listEntangledPairs, quantumSyncDiagnostics, resetQuantumSyncState,
} from "./quantum-state-sync.js";

describe("Phase 23: Quantum-Entangled State Replication", () => {
  beforeEach(() => resetQuantumSyncState());

  describe("entangle", () => {
    it("should create an entangled pair", () => {
      const pair = entangle("node-1", "node-2", "config");
      expect(pair.status).toBe("entangled");
      expect(pair.coherenceScore).toBe(1.0);
      expect(pair.instanceA).toBe("node-1");
      expect(pair.instanceB).toBe("node-2");
    });

    it("should initialize with state", () => {
      const pair = entangle("node-1", "node-2", "config", { key: "value" });
      const state = getPairState(pair.id, "node-1");
      expect(state).toBeTruthy();
      expect(state!.data["key"]).toBe("value");
    });
  });

  describe("propagateState", () => {
    it("should propagate state between entangled pairs", () => {
      const pair = entangle("node-1", "node-2", "config");
      const result = propagateState(pair.id, "node-1", { counter: 42 });
      expect(result.success).toBe(true);
      expect(result.stateVersion).toBeGreaterThan(1);

      const peerState = getPairState(pair.id, "node-2");
      expect(peerState!.data["counter"]).toBe(42);
    });

    it("should fail on decoherent pair", () => {
      const pair = entangle("node-1", "node-2", "config");
      decohere(pair.id);
      const result = propagateState(pair.id, "node-1", { x: 1 });
      expect(result.success).toBe(false);
    });
  });

  describe("decohere", () => {
    it("should break entanglement", () => {
      const pair = entangle("node-1", "node-2", "config");
      expect(decohere(pair.id)).toBe(true);
      const pairs = listEntangledPairs();
      expect(pairs[0].status).toBe("decoherent");
    });
  });

  describe("collapseState", () => {
    it("should resolve state conflicts", () => {
      const pair = entangle("a", "b", "data", { shared: "original" });
      propagateState(pair.id, "a", { shared: "modified-a" });

      const result = collapseState(pair.id, "latest-wins");
      expect(result).toBeTruthy();
      expect(result!.conflictsResolved).toBeGreaterThanOrEqual(0);
      expect(result!.resolvedState.data).toBeTruthy();
    });

    it("should support merge strategy", () => {
      const pair = entangle("a", "b", "data");
      propagateState(pair.id, "a", { keyA: 1 });
      propagateState(pair.id, "b", { keyB: 2 });

      const result = collapseState(pair.id, "merge");
      expect(result).toBeTruthy();
    });
  });

  describe("teleportState", () => {
    it("should teleport state to target", () => {
      const result = teleportState("source", "target", { data: "payload" });
      expect(result.success).toBe(true);
      expect(result.verificationHash).toBeTruthy();
      expect(result.stateSize).toBeGreaterThan(0);
    });
  });

  describe("swarm", () => {
    it("should create a swarm with leader and followers", () => {
      const swarm = createSwarm("swarm-1", "leader", ["f-1", "f-2"]);
      expect(swarm.nodes.length).toBe(3);
      expect(swarm.leader).toBe("leader");
      expect(swarm.consensusReached).toBe(true);
    });

    it("should broadcast state to all nodes", () => {
      createSwarm("swarm-1", "leader", ["f-1", "f-2"]);
      const result = swarmBroadcast("swarm-1", { version: 2 });
      expect(result.success).toBe(true);
      expect(result.nodesUpdated).toBe(3);
    });

    it("should fail broadcast for non-existent swarm", () => {
      const result = swarmBroadcast("nonexistent", {});
      expect(result.success).toBe(false);
    });
  });

  describe("diagnostics", () => {
    it("should track quantum operations", () => {
      entangle("a", "b", "ch");
      teleportState("x", "y", { foo: "bar" });
      const diag = quantumSyncDiagnostics();
      expect(diag.totalPairs).toBe(1);
      expect(diag.totalTeleports).toBe(1);
    });
  });
});
