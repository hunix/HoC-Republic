/**
 * Sandbox Knowledge Bridge — Semantic Memory for Chat Orchestrators
 *
 * Wires the dormant knowledge graph infrastructure (memory-graph.ts,
 * cognee-bridge.ts, mem0-memory.ts) into the sandbox agent loop so that
 * every chat session benefits from accumulated semantic knowledge.
 *
 * Three integration points:
 *   1. AUTO-RECALL: Before the first LLM turn, retrieve relevant
 *      knowledge graph context + Mem0 facts and inject into the
 *      system prompt as a "SEMANTIC MEMORY" block.
 *   2. AUTO-CAPTURE: After the loop completes, extract entities and
 *      facts from the conversation for future recall.
 *   3. GRAPH QUERY TOOL: Expose a `knowledge_graph_query` tool that
 *      the LLM can call mid-loop to search accumulated knowledge.
 *
 * Scoping:
 *   - Uses a reserved citizenId scope: `__agent__` for chat-originated
 *     knowledge (separate from per-citizen graphs).
 *   - Session-aware: contextId links facts to originating sessions.
 *
 * Design:
 *   - All operations are fire-and-forget safe (never block or throw).
 *   - Recall adds ≤2000 chars to the system prompt (budget-capped).
 *   - Capture runs asynchronously after the result is returned.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import {
  findNodes as findKgNodes,
  findBridgeNodes,
  findClusters,
  getKnowledgeGraphDiagnostics,
} from "./knowledge-graph.js";
import {
  mem0Add,
  mem0BuildContext,
  mem0Search,
  mem0Stats,
  type Mem0Message,
} from "./mem0-memory.js";
import {
  addNode,
  addEdge,
  buildGraphFromMemories,
  extractEntities,
  classifyEntity,
  findRelated,
  searchNodes,
  querySubgraph,
  memoryGraphDiagnostics,
  type MemoryNode,
} from "./memory-graph.js";

const logger = createSubsystemLogger("sandbox:knowledge-bridge");

/** Reserved citizenId scope for chat/agent interactions */
const AGENT_SCOPE = "__agent__";

/** Max characters to inject into the system prompt */
const MAX_RECALL_CHARS = 2000;

/** Minimum prompt length to trigger recall (skip trivial "hi" messages) */
const MIN_PROMPT_LENGTH = 15;

// ─── Statistics ─────────────────────────────────────────────────

const stats = {
  recallsPerformed: 0,
  capturesPerformed: 0,
  entitiesExtracted: 0,
  factsDistilled: 0,
  graphNodesCreated: 0,
  graphEdgesCreated: 0,
  toolQueriesServed: 0,
  lastRecallAt: "",
  lastCaptureAt: "",
};

export function getKnowledgeBridgeStats() {
  return {
    ...stats,
    memoryGraph: memoryGraphDiagnostics(),
    mem0: mem0Stats(),
    knowledgeGraph: getKnowledgeGraphDiagnostics(),
  };
}

// ─── AUTO-RECALL: Pre-Loop Context Injection ────────────────────

/**
 * Build a semantic memory context block for injection into the
 * agent's system prompt. Queries both the memory graph (entity
 * relationships) and Mem0 (atomic facts) using the user's prompt
 * as a semantic query.
 *
 * Returns an empty string if no relevant knowledge is found,
 * keeping the prompt lean.
 */
export async function recallKnowledge(userPrompt: string): Promise<string> {
  if (userPrompt.length < MIN_PROMPT_LENGTH) {
    return "";
  }

  const parts: string[] = [];

  try {
    // ── Mem0 Facts: semantic recall ──
    const factContext = await mem0BuildContext(AGENT_SCOPE, userPrompt, 8);
    if (factContext) {
      parts.push(factContext);
    }

    // ── Memory Graph: entity search + spreading activation ──
    const graphNodes = searchNodes(AGENT_SCOPE, userPrompt, 5);
    if (graphNodes.length > 0) {
      const relatedEntities: MemoryNode[] = [];
      for (const node of graphNodes.slice(0, 3)) {
        const related = findRelated(node.id, 5);
        relatedEntities.push(...related);
      }

      if (relatedEntities.length > 0) {
        // Deduplicate by ID
        const unique = [...new Map(relatedEntities.map((n) => [n.id, n])).values()];
        const lines = unique.slice(0, 8).map((n) => {
          const imp = (n.importance * 100).toFixed(0);
          return `  • ${n.label} (${n.type}, relevance: ${imp}%)`;
        });
        parts.push(`KNOWLEDGE GRAPH (${unique.length} related entities):\n${lines.join("\n")}`);
      }
    }

    // ── Knowledge Graph (republic-level): find relevant concepts ──
    // Search by keywords extracted from the prompt
    const promptEntities = extractEntities(userPrompt);
    if (promptEntities.length > 0) {
      const kgNodes: Array<{ label: string; type: string; domain: string }> = [];
      for (const entity of promptEntities.slice(0, 5)) {
        const found = findKgNodes({ label: entity, minStrength: 0.3 });
        for (const n of found.slice(0, 3)) {
          kgNodes.push({ label: n.label, type: n.type, domain: n.domain });
        }
      }

      if (kgNodes.length > 0) {
        const uniqueKg = [...new Map(kgNodes.map((n) => [`${n.label}:${n.type}`, n])).values()];
        const lines = uniqueKg.slice(0, 6).map((n) => `  • ${n.label} (${n.type} in ${n.domain})`);
        parts.push(`REPUBLIC KNOWLEDGE (${uniqueKg.length} concepts):\n${lines.join("\n")}`);
      }
    }

    if (parts.length === 0) {
      return "";
    }

    // Assemble with budget cap
    let block = `\n## Semantic Memory (auto-recalled)\n${parts.join("\n\n")}`;
    if (block.length > MAX_RECALL_CHARS) {
      block = block.slice(0, MAX_RECALL_CHARS) + "\n  … [truncated]";
    }

    stats.recallsPerformed++;
    stats.lastRecallAt = new Date().toISOString();

    logger.info("knowledge-bridge: recall completed", {
      promptLen: userPrompt.length,
      contextLen: block.length,
      parts: parts.length,
    });

    return block;
  } catch (err) {
    // Never block the agent loop — fire-and-forget safe
    logger.warn("knowledge-bridge: recall failed (non-blocking)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "";
  }
}

// ─── AUTO-CAPTURE: Post-Loop Knowledge Extraction ───────────────

/**
 * After the agent loop completes, extract entities and facts from
 * the full conversation for future recall.
 *
 * This runs asynchronously and never blocks the response delivery.
 *
 * Captures:
 *   1. Entities mentioned in the user prompt and final response
 *   2. Tool names used during the session (as skill entities)
 *   3. Key facts distilled via Mem0's extraction pipeline
 *   4. Co-occurrence edges between entities found in the same context
 */
export async function captureKnowledge(
  userPrompt: string,
  agentResponse: string,
  toolsUsed: string[],
  metadata?: {
    iterations?: number;
    provider?: string;
    success?: boolean;
    sessionId?: string;
  },
): Promise<void> {
  if (userPrompt.length < MIN_PROMPT_LENGTH && agentResponse.length < 50) {
    return;
  }

  try {
    // ── Phase 1: Entity Extraction + Graph Building ──
    const conversationText = [
      `User requested: ${userPrompt}`,
      `Agent completed: ${agentResponse.slice(0, 2000)}`, // cap to avoid huge texts
    ].join("\n");

    const graphResult = buildGraphFromMemories(AGENT_SCOPE, [
      { text: conversationText, importance: 0.6 },
    ]);
    stats.graphNodesCreated += graphResult.nodesAdded;
    stats.graphEdgesCreated += graphResult.edgesAdded;

    // ── Phase 2: Tool Usage → Skill Nodes ──
    const uniqueTools = [...new Set(toolsUsed)];
    if (uniqueTools.length > 0) {
      // Create a task node for this interaction
      const taskLabel = userPrompt
        .slice(0, 80)
        .replace(/[\n\r]/g, " ")
        .trim();
      const taskNode = addNode(
        taskLabel,
        "event",
        AGENT_SCOPE,
        {
          type: "agent_task",
          tools: uniqueTools.join(","),
          success: metadata?.success ?? true,
          sessionId: metadata?.sessionId,
        },
        0.6,
      );

      // Link tools as skill nodes
      for (const tool of uniqueTools.slice(0, 15)) {
        const toolNode = addNode(
          tool,
          "skill",
          AGENT_SCOPE,
          {
            source: "tool_usage",
          },
          0.5,
        );
        addEdge(taskNode.id, toolNode.id, "used_tool", AGENT_SCOPE, 0.5);
      }

      // Link provider as an entity
      if (metadata?.provider) {
        const providerNode = addNode(
          metadata.provider,
          "entity",
          AGENT_SCOPE,
          {
            source: "llm_provider",
          },
          0.4,
        );
        addEdge(taskNode.id, providerNode.id, "powered_by", AGENT_SCOPE, 0.3);
      }
    }

    // ── Phase 3: Mem0 Fact Distillation ──
    const messages: Mem0Message[] = [
      { role: "user", content: userPrompt },
      { role: "assistant", content: agentResponse.slice(0, 3000) },
    ];

    const mem0Result = await mem0Add(
      AGENT_SCOPE,
      "Agent",
      messages,
      "This is the autonomous sandbox agent that executes user tasks via tool-calling.",
    );

    stats.factsDistilled += mem0Result.added;
    stats.capturesPerformed++;
    stats.lastCaptureAt = new Date().toISOString();

    // ── Phase 4: Cross-link prompt entities with response entities ──
    const promptEntities = extractEntities(userPrompt);
    const responseEntities = extractEntities(agentResponse.slice(0, 2000));
    stats.entitiesExtracted += promptEntities.length + responseEntities.length;

    // Create cross-domain edges between prompt concepts and response concepts
    for (const pe of promptEntities.slice(0, 5)) {
      const peNode = addNode(pe, classifyEntity(pe), AGENT_SCOPE, {
        source: "user_prompt",
      });
      for (const re of responseEntities.slice(0, 5)) {
        const reNode = addNode(re, classifyEntity(re), AGENT_SCOPE, {
          source: "agent_response",
        });
        addEdge(peNode.id, reNode.id, "co_occurs_with", AGENT_SCOPE, 0.4);
      }
    }

    logger.info("knowledge-bridge: capture completed", {
      graphNodes: graphResult.nodesAdded,
      graphEdges: graphResult.edgesAdded,
      mem0Added: mem0Result.added,
      toolsCaptured: uniqueTools.length,
      promptEntities: promptEntities.length,
      responseEntities: responseEntities.length,
    });
  } catch (err) {
    // Fire-and-forget — never crash the response delivery
    logger.warn("knowledge-bridge: capture failed (non-blocking)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── TOOL: Knowledge Graph Query (mid-loop callable) ────────────

/**
 * Query the knowledge graph from within the agent loop.
 * This can be registered as a tool so the LLM can search
 * accumulated knowledge during execution.
 */
export async function queryAgentKnowledge(
  query: string,
  depth: number = 2,
): Promise<{
  memoryGraph: { nodes: Array<{ label: string; type: string; importance: number }>; edges: number };
  mem0Facts: Array<{ memory: string; score: number; categories: string[] }>;
  summary: string;
}> {
  stats.toolQueriesServed++;

  // Memory graph search
  const graphNodes = searchNodes(AGENT_SCOPE, query, 10);
  let graphEdgeCount = 0;
  const graphResult: Array<{ label: string; type: string; importance: number }> = [];

  if (graphNodes.length > 0) {
    const subgraph = querySubgraph(graphNodes[0].id, depth);
    graphEdgeCount = subgraph.edges.length;
    for (const n of subgraph.nodes.slice(0, 15)) {
      graphResult.push({ label: n.label, type: n.type, importance: n.importance });
    }
  }

  // Mem0 semantic search
  const mem0Results = await mem0Search(AGENT_SCOPE, query, 10, 0.1);
  const facts = mem0Results.map((r) => ({
    memory: r.fact.memory,
    score: r.score,
    categories: r.fact.categories as string[],
  }));

  // Build a natural language summary
  const summaryParts: string[] = [];
  if (graphResult.length > 0) {
    const entityList = graphResult
      .slice(0, 5)
      .map((n) => n.label)
      .join(", ");
    summaryParts.push(`Found ${graphResult.length} related entities: ${entityList}`);
  }
  if (facts.length > 0) {
    const topFacts = facts
      .slice(0, 3)
      .map((f) => f.memory)
      .join("; ");
    summaryParts.push(`Top facts: ${topFacts}`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push("No relevant knowledge found for this query.");
  }

  return {
    memoryGraph: { nodes: graphResult, edges: graphEdgeCount },
    mem0Facts: facts,
    summary: summaryParts.join(". "),
  };
}

// ─── TOOL: Store Knowledge (mid-loop callable) ──────────────────

/**
 * Allow the LLM to explicitly store a piece of knowledge during
 * execution. This gives the agent a way to "remember" important
 * findings for future sessions.
 */
export function storeAgentKnowledge(
  label: string,
  type: "entity" | "concept" | "event" | "skill",
  importance: number = 0.7,
  relatedTo?: string,
): { stored: boolean; nodeId: string } {
  const node = addNode(
    label,
    type,
    AGENT_SCOPE,
    {
      source: "agent_explicit",
      storedAt: new Date().toISOString(),
    },
    importance,
  );

  // If relatedTo is provided, search for it and create an edge
  if (relatedTo) {
    const relatedNodes = searchNodes(AGENT_SCOPE, relatedTo, 1);
    if (relatedNodes.length > 0) {
      addEdge(node.id, relatedNodes[0].id, "related_to", AGENT_SCOPE, 0.6);
    }
  }

  stats.graphNodesCreated++;
  return { stored: true, nodeId: node.id };
}

// ─── Diagnostics ────────────────────────────────────────────────

/**
 * Get a full diagnostic snapshot of the agent's knowledge state.
 * Used by the dashboard and health checks.
 */
export function getAgentKnowledgeDiagnostics() {
  const graphDiag = memoryGraphDiagnostics();
  const agentGraph = graphDiag.citizenGraphSizes[AGENT_SCOPE] ?? { nodes: 0, edges: 0 };
  const mem0 = mem0Stats();
  const agentFacts = mem0.factsPerCitizen[AGENT_SCOPE] ?? 0;
  const kgDiag = getKnowledgeGraphDiagnostics();
  const bridges = findBridgeNodes();
  const clusters = findClusters();

  return {
    scope: AGENT_SCOPE,
    memoryGraph: {
      agentNodes: agentGraph.nodes,
      agentEdges: agentGraph.edges,
      totalNodes: graphDiag.totalNodes,
      totalEdges: graphDiag.totalEdges,
      nodesByType: graphDiag.nodesByType,
    },
    mem0: {
      agentFacts,
      totalFacts: mem0.totalFacts,
      totalCitizens: mem0.totalCitizens,
    },
    knowledgeGraph: {
      nodeCount: kgDiag.nodeCount,
      edgeCount: kgDiag.edgeCount,
      insightCount: kgDiag.insightCount,
      bridgeNodes: bridges.length,
      clusterCount: clusters.size,
    },
    stats,
  };
}
