/**
 * Tests — Vector DB Orchestration Engine (Phase 28)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  registerProvider,
  unregisterProvider,
  listProviders,
  isProviderRegistered,
  createCluster,
  getCluster,
  _listClusters,
  listClustersByProvider,
  stopCluster,
  startCluster,
  deleteCluster,
  healthCheckCluster,
  createCollection,
  getCollection,
  listCollections,
  findCollectionByName,
  dropCollection,
  describeCollection,
  insertDocuments,
  deleteDocument,
  upsertDocuments,
  getDocumentCount,
  queryCollection,
  routeQuery,
  vectordbDiagnostics,
  resetVectorDB,
} from "./vectordb-engine.js";

beforeEach(() => {
  resetVectorDB();
});

// ─── Provider Registry ──────────────────────────────────────────

describe("Provider registry", () => {
  it("should register providers", () => {
    expect(registerProvider("lancedb")).toBe(true);
    expect(registerProvider("chromadb")).toBe(true);
    expect(listProviders()).toContain("lancedb");
    expect(listProviders()).toContain("chromadb");
  });

  it("should reject duplicate registration", () => {
    registerProvider("lancedb");
    expect(registerProvider("lancedb")).toBe(false);
  });

  it("should unregister providers", () => {
    registerProvider("lancedb");
    expect(unregisterProvider("lancedb")).toBe(true);
    expect(isProviderRegistered("lancedb")).toBe(false);
  });
});

// ─── Cluster Manager ────────────────────────────────────────────

describe("Cluster manager", () => {
  it("should create a LanceDB cluster", () => {
    const c = createCluster({
      type: "lancedb",
      name: "local-vectors",
      mode: "embedded",
      connection: { path: "./data/vectors" },
    });
    expect(c.provider).toBe("lancedb");
    expect(c.mode).toBe("embedded");
    expect(c.status).toBe("running");
  });

  it("should create a ChromaDB cluster", () => {
    const c = createCluster({
      type: "chromadb",
      name: "remote-vectors",
      mode: "standalone",
      connection: { host: "chroma.mycompany.com", port: 8000 },
    });
    expect(c.provider).toBe("chromadb");
    expect(c.mode).toBe("standalone");
  });

  it("should list clusters by provider", () => {
    createCluster({ type: "lancedb", name: "l1", mode: "embedded", connection: {} });
    createCluster({ type: "chromadb", name: "c1", mode: "standalone", connection: {} });
    createCluster({ type: "lancedb", name: "l2", mode: "embedded", connection: {} });
    expect(listClustersByProvider("lancedb")).toHaveLength(2);
    expect(listClustersByProvider("chromadb")).toHaveLength(1);
  });

  it("should stop and start clusters", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    expect(stopCluster(c.id)).toBe(true);
    expect(getCluster(c.id)!.status).toBe("stopped");
    expect(startCluster(c.id)).toBe(true);
    expect(getCluster(c.id)!.status).toBe("running");
  });

  it("should delete cluster and its collections", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    createCollection({ clusterId: c.id, name: "docs" });
    expect(deleteCluster(c.id)).toBe(true);
    expect(getCluster(c.id)).toBeUndefined();
    expect(listCollections(c.id)).toHaveLength(0);
  });

  it("should health-check a cluster", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const health = healthCheckCluster(c.id);
    expect(health!.status).toBe("healthy");
    expect(health!.checks.connectivity).toBe(true);
  });
});

// ─── Collection CRUD ────────────────────────────────────────────

describe("Collection CRUD", () => {
  it("should create a collection", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "embeddings", embeddingDim: 384 });
    expect(col).toBeTruthy();
    expect(col!.name).toBe("embeddings");
    expect(col!.embeddingDim).toBe(384);
  });

  it("should reject duplicate collection names", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    createCollection({ clusterId: c.id, name: "docs" });
    expect(createCollection({ clusterId: c.id, name: "docs" })).toBeNull();
  });

  it("should describe a collection", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs" })!;
    const desc = describeCollection(col.id);
    expect(desc!.collection.name).toBe("docs");
    expect(desc!.indexStatus).toBe("built");
  });

  it("should drop a collection", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs" })!;
    expect(dropCollection(col.id)).toBe(true);
    expect(getCollection(col.id)).toBeUndefined();
  });

  it("should find collection by name", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    createCollection({ clusterId: c.id, name: "my-vectors" });
    const found = findCollectionByName(c.id, "my-vectors");
    expect(found).toBeTruthy();
    expect(found!.name).toBe("my-vectors");
  });
});

// ─── Document Operations ────────────────────────────────────────

describe("Document operations", () => {
  it("should insert and count documents", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs", embeddingDim: 3 })!;

    const docs = insertDocuments(col.id, [
      { vector: [1, 0, 0], content: "hello world", metadata: { lang: "en" } },
      { vector: [0, 1, 0], content: "bonjour monde", metadata: { lang: "fr" } },
    ]);

    expect(docs).toHaveLength(2);
    expect(getDocumentCount(col.id)).toBe(2);
  });

  it("should reject wrong dimension vectors", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs", embeddingDim: 3 })!;

    const docs = insertDocuments(col.id, [
      { vector: [1, 0], content: "wrong dim" },
    ]);
    expect(docs).toHaveLength(0);
  });

  it("should delete documents", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs", embeddingDim: 3 })!;
    const [doc] = insertDocuments(col.id, [{ vector: [1, 0, 0], content: "test" }]);
    expect(deleteDocument(col.id, doc.id)).toBe(true);
    expect(getDocumentCount(col.id)).toBe(0);
  });

  it("should upsert documents", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs", embeddingDim: 3 })!;
    insertDocuments(col.id, [{ vector: [1, 0, 0], content: "existing" }]);

    const result = upsertDocuments(col.id, [
      { vector: [0, 1, 0], content: "existing" },
      { vector: [0, 0, 1], content: "new doc" },
    ]);

    expect(result.updated).toBe(1);
    expect(result.inserted).toBe(1);
  });
});

// ─── Vector Query ───────────────────────────────────────────────

describe("Vector query", () => {
  it("should perform cosine similarity search", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs", embeddingDim: 3 })!;

    insertDocuments(col.id, [
      { vector: [1, 0, 0], content: "apple" },
      { vector: [0, 1, 0], content: "banana" },
      { vector: [0.9, 0.1, 0], content: "similar to apple" },
    ]);

    const result = queryCollection({
      collectionId: col.id,
      vector: [1, 0, 0],
      topK: 2,
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0].content).toBe("apple");
    expect(result.results[0].score).toBe(1);
    expect(result.results[1].content).toBe("similar to apple");
  });

  it("should filter by metadata", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs", embeddingDim: 3 })!;

    insertDocuments(col.id, [
      { vector: [1, 0, 0], content: "english doc", metadata: { lang: "en" } },
      { vector: [0, 1, 0], content: "french doc", metadata: { lang: "fr" } },
    ]);

    const result = queryCollection({
      collectionId: col.id,
      vector: [0.5, 0.5, 0],
      topK: 10,
      filter: { lang: "fr" },
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toBe("french doc");
  });

  it("should apply minScore threshold", () => {
    const c = createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    const col = createCollection({ clusterId: c.id, name: "docs", embeddingDim: 3 })!;

    insertDocuments(col.id, [
      { vector: [1, 0, 0], content: "close" },
      { vector: [0, 0, 1], content: "far" },
    ]);

    const result = queryCollection({
      collectionId: col.id,
      vector: [1, 0, 0],
      topK: 10,
      minScore: 0.5,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toBe("close");
  });
});

// ─── Query Router ───────────────────────────────────────────────

describe("Query router", () => {
  it("should route to best cluster by latency", () => {
    const c1 = createCluster({ type: "lancedb", name: "fast", mode: "embedded", connection: {} });
    const c2 = createCluster({ type: "chromadb", name: "slow", mode: "standalone", connection: {} });

    const col1 = createCollection({ clusterId: c1.id, name: "shared", embeddingDim: 3 })!;
    createCollection({ clusterId: c2.id, name: "shared", embeddingDim: 3 });

    insertDocuments(col1.id, [{ vector: [1, 0, 0], content: "from fast cluster" }]);

    const result = routeQuery("shared", { vector: [1, 0, 0], topK: 5 });
    expect(result).toBeTruthy();
  });

  it("should return null for unknown collection name", () => {
    expect(routeQuery("nonexistent", { vector: [1, 0, 0], topK: 5 })).toBeNull();
  });
});

// ─── Diagnostics ────────────────────────────────────────────────

describe("Diagnostics", () => {
  it("should provide comprehensive diagnostics", () => {
    createCluster({ type: "lancedb", name: "test", mode: "embedded", connection: {} });
    registerProvider("chromadb");

    const diag = vectordbDiagnostics();
    expect(diag.providers.find((p) => p.type === "lancedb")!.registered).toBe(true);
    expect(diag.providers.find((p) => p.type === "chromadb")!.registered).toBe(true);
    expect(diag.clusters).toHaveLength(1);
  });
});
