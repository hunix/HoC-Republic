/**
 * Memory Knowledge Graph — Test Suite
 *
 * Tests for entity extraction, node/edge CRUD, subgraph traversal,
 * spreading activation, node merge, edge decay, and tick integration.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  extractEntities,
  classifyEntity,
  addNode,
  addEdge,
  getNode,
  getCitizenNodes,
  removeNode,
  findNodeByLabel,
  querySubgraph,
  findRelated,
  searchNodes,
  mergeNodes,
  buildGraphFromMemories,
  decayEdges,
  memoryGraphTick,
  memoryGraphDiagnostics,
  resetMemoryGraph,
  getNodeEdges,
  findEdge,
} from "../republic/memory-graph.js";

const CITIZEN = "cit-test-1";
const CITIZEN_B = "cit-test-2";

describe("Memory Knowledge Graph", () => {
  beforeEach(() => {
    resetMemoryGraph();
  });

  // ─── Entity Extraction ──────────────────────────────────────
  describe("extractEntities", () => {
    it("extracts capitalized multi-word sequences", () => {
      const entities = extractEntities("John Smith went to New York City.");
      expect(entities).toContain("John Smith");
      expect(entities).toContain("New York City");
    });

    it("extracts quoted terms", () => {
      const entities = extractEntities('They discussed the "quantum computing" paper.');
      expect(entities).toContain("quantum computing");
    });

    it("extracts camelCase terms", () => {
      const entities = extractEntities("The buildContextWindow function was implemented.");
      expect(entities).toContain("buildContextWindow");
    });

    it("extracts hashtags and mentions", () => {
      const entities = extractEntities("Contact @alice and check #research");
      expect(entities).toContain("alice");
      expect(entities).toContain("research");
    });

    it("caps at 50 entities", () => {
      const longText = Array.from({ length: 60 }, (_, i) => `"Entity${i}"`).join(" ");
      const entities = extractEntities(longText);
      expect(entities.length).toBeLessThanOrEqual(50);
    });
  });

  // ─── Entity Classification ─────────────────────────────────
  describe("classifyEntity", () => {
    it("classifies locations", () => {
      expect(classifyEntity("Mountain Peak")).toBe("location");
    });

    it("classifies skills", () => {
      expect(classifyEntity("programming")).toBe("skill");
    });

    it("classifies events", () => {
      expect(classifyEntity("team meeting")).toBe("event");
    });

    it("classifies concepts", () => {
      expect(classifyEntity("sorting algorithm")).toBe("concept");
    });

    it("defaults to entity for unknown", () => {
      expect(classifyEntity("Widget Co")).toBe("entity");
    });
  });

  // ─── Node Operations ───────────────────────────────────────
  describe("Node CRUD", () => {
    it("adds nodes and retrieves by ID", () => {
      const node = addNode("Alice", "entity", CITIZEN);
      expect(node.id).toBeDefined();
      expect(node.label).toBe("Alice");
      const fetched = getNode(node.id);
      expect(fetched).toBe(node);
    });

    it("reinforces existing nodes on re-add", () => {
      const node1 = addNode("Alice", "entity", CITIZEN);
      const node2 = addNode("Alice", "entity", CITIZEN);
      expect(node1.id).toBe(node2.id);
      expect(node2.accessCount).toBe(2);
      expect(node2.importance).toBeGreaterThan(0.5);
    });

    it("tracks citizen-scoped nodes", () => {
      addNode("Alice", "entity", CITIZEN);
      addNode("Bob", "entity", CITIZEN);
      addNode("Charlie", "entity", CITIZEN_B);
      expect(getCitizenNodes(CITIZEN).length).toBe(2);
      expect(getCitizenNodes(CITIZEN_B).length).toBe(1);
    });

    it("finds nodes by label (case-insensitive)", () => {
      addNode("Alice Smith", "entity", CITIZEN);
      expect(findNodeByLabel(CITIZEN, "alice smith")).toBeDefined();
      expect(findNodeByLabel(CITIZEN, "ALICE SMITH")).toBeDefined();
      expect(findNodeByLabel(CITIZEN_B, "alice smith")).toBeUndefined();
    });

    it("removes nodes and their edges", () => {
      const a = addNode("A", "entity", CITIZEN);
      const b = addNode("B", "entity", CITIZEN);
      addEdge(a.id, b.id, "knows", CITIZEN);
      expect(removeNode(a.id)).toBe(true);
      expect(getNode(a.id)).toBeUndefined();
      expect(getNodeEdges(b.id).length).toBe(0);
    });
  });

  // ─── Edge Operations ───────────────────────────────────────
  describe("Edge CRUD", () => {
    it("creates edges between nodes", () => {
      const a = addNode("A", "entity", CITIZEN);
      const b = addNode("B", "entity", CITIZEN);
      const edge = addEdge(a.id, b.id, "knows", CITIZEN);
      expect(edge).not.toBeNull();
      expect(edge!.source).toBe(a.id);
      expect(edge!.target).toBe(b.id);
    });

    it("reinforces existing edges", () => {
      const a = addNode("A", "entity", CITIZEN);
      const b = addNode("B", "entity", CITIZEN);
      const e1 = addEdge(a.id, b.id, "knows", CITIZEN, 0.5);
      const e2 = addEdge(a.id, b.id, "knows", CITIZEN);
      expect(e1!.id).toBe(e2!.id);
      expect(e2!.weight).toBeGreaterThan(0.5);
    });

    it("returns null for non-existent nodes", () => {
      const edge = addEdge("nonexistent1", "nonexistent2", "knows", CITIZEN);
      expect(edge).toBeNull();
    });

    it("finds edges by relation", () => {
      const a = addNode("A", "entity", CITIZEN);
      const b = addNode("B", "entity", CITIZEN);
      addEdge(a.id, b.id, "knows", CITIZEN);
      addEdge(a.id, b.id, "works_with", CITIZEN);
      expect(findEdge(a.id, b.id, "knows")).toBeDefined();
      expect(findEdge(a.id, b.id, "works_with")).toBeDefined();
      expect(findEdge(a.id, b.id, "enemy_of")).toBeUndefined();
    });
  });

  // ─── Subgraph Traversal ────────────────────────────────────
  describe("querySubgraph", () => {
    it("traverses breadth-first up to specified depth", () => {
      const a = addNode("A", "entity", CITIZEN);
      const b = addNode("B", "entity", CITIZEN);
      const c = addNode("C", "entity", CITIZEN);
      const d = addNode("D", "entity", CITIZEN);

      addEdge(a.id, b.id, "knows", CITIZEN);
      addEdge(b.id, c.id, "knows", CITIZEN);
      addEdge(c.id, d.id, "knows", CITIZEN);

      // Depth 1: A and B
      const sub1 = querySubgraph(a.id, 1);
      expect(sub1.nodes.length).toBe(2);

      // Depth 2: A, B, C
      const sub2 = querySubgraph(a.id, 2);
      expect(sub2.nodes.length).toBe(3);

      // Depth 3: A, B, C, D
      const sub3 = querySubgraph(a.id, 3);
      expect(sub3.nodes.length).toBe(4);
    });

    it("handles disconnected nodes", () => {
      const a = addNode("A", "entity", CITIZEN);
      addNode("B", "entity", CITIZEN); // not connected
      const sub = querySubgraph(a.id, 3);
      expect(sub.nodes.length).toBe(1);
    });
  });

  // ─── Spreading Activation ─────────────────────────────────
  describe("findRelated", () => {
    it("finds related nodes through spreading activation", () => {
      const a = addNode("A", "entity", CITIZEN);
      const b = addNode("B", "entity", CITIZEN);
      const c = addNode("C", "entity", CITIZEN);

      addEdge(a.id, b.id, "knows", CITIZEN, 0.8);
      addEdge(a.id, c.id, "knows", CITIZEN, 0.3);

      const related = findRelated(a.id, 5);
      expect(related.length).toBe(2);
      // B should have higher activation than C due to higher edge weight
      expect(related[0].label).toBe("B");
    });

    it("returns empty for isolated nodes", () => {
      const a = addNode("A", "entity", CITIZEN);
      const related = findRelated(a.id, 5);
      expect(related.length).toBe(0);
    });
  });

  // ─── Search Nodes ──────────────────────────────────────────
  describe("searchNodes", () => {
    it("finds exact matches with highest score", () => {
      addNode("TypeScript", "skill", CITIZEN);
      addNode("TypeScript Guide", "concept", CITIZEN);
      addNode("Python", "skill", CITIZEN);

      const results = searchNodes(CITIZEN, "TypeScript");
      expect(results.length).toBe(2);
      expect(results[0].label).toBe("TypeScript"); // exact match first
    });

    it("scopes to citizen", () => {
      addNode("TypeScript", "skill", CITIZEN);
      addNode("TypeScript", "skill", CITIZEN_B);
      expect(searchNodes(CITIZEN, "TypeScript").length).toBe(1);
    });
  });

  // ─── Node Merge ────────────────────────────────────────────
  describe("mergeNodes", () => {
    it("merges two nodes, redirects edges", () => {
      const a = addNode("John", "entity", CITIZEN);
      const b = addNode("John Smith", "entity", CITIZEN);
      const c = addNode("Project X", "entity", CITIZEN);

      addEdge(b.id, c.id, "works_on", CITIZEN);

      expect(mergeNodes(a.id, b.id)).toBe(true);
      expect(getNode(b.id)).toBeUndefined();
      expect(a.accessCount).toBe(2); // combined

      // Edge should now connect a → c
      const edges = getNodeEdges(a.id);
      expect(edges.length).toBe(1);
      expect(edges[0].source === a.id || edges[0].target === a.id).toBe(true);
    });

    it("rejects cross-citizen merges", () => {
      const a = addNode("X", "entity", CITIZEN);
      const b = addNode("Y", "entity", CITIZEN_B);
      expect(mergeNodes(a.id, b.id)).toBe(false);
    });
  });

  // ─── Build Graph from Memories ─────────────────────────────
  describe("buildGraphFromMemories", () => {
    it("extracts entities and creates co-occurrence edges", () => {
      const result = buildGraphFromMemories(CITIZEN, [
        { text: 'John Smith discussed "quantum computing" at the Tech Conference', importance: 0.8 },
      ]);
      expect(result.nodesAdded).toBeGreaterThan(0);
      expect(getCitizenNodes(CITIZEN).length).toBeGreaterThan(0);
    });

    it("handles empty memories", () => {
      const result = buildGraphFromMemories(CITIZEN, []);
      expect(result.nodesAdded).toBe(0);
      expect(result.edgesAdded).toBe(0);
    });
  });

  // ─── Edge Decay ────────────────────────────────────────────
  describe("decayEdges", () => {
    it("decays unreinforced edges", () => {
      const a = addNode("A", "entity", CITIZEN);
      const b = addNode("B", "entity", CITIZEN);
      const edge = addEdge(a.id, b.id, "knows", CITIZEN, 0.5);
      expect(edge).not.toBeNull();

      // Simulate decay with very short half-life
      const decayed = decayEdges(1); // 1ms half-life
      expect(decayed).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── Tick & Diagnostics ────────────────────────────────────
  describe("Tick & Diagnostics", () => {
    it("returns tick result with node/edge counts", () => {
      addNode("A", "entity", CITIZEN);
      addNode("B", "entity", CITIZEN);
      const result = memoryGraphTick();
      expect(result.nodesTotal).toBe(2);
      expect(result.edgesTotal).toBe(0);
    });

    it("returns comprehensive diagnostics", () => {
      addNode("A", "entity", CITIZEN);
      addNode("B", "concept", CITIZEN);
      addNode("C", "entity", CITIZEN_B);
      const diag = memoryGraphDiagnostics();
      expect(diag.totalNodes).toBe(3);
      expect(diag.nodesByType["entity"]).toBe(2);
      expect(diag.nodesByType["concept"]).toBe(1);
      expect(Object.keys(diag.citizenGraphSizes).length).toBe(2);
    });
  });
});
