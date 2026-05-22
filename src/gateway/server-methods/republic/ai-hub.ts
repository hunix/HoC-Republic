/**
 * Republic Gateway Handlers — AI Hub (Phases 13–18)
 *
 * RPC handlers for all AI engineering hub modules:
 *  - Phase 13: Knowledge Graph (memory-graph)
 *  - Phase 14: MCP Server + ACP Bridge
 *  - Phase 15: Agentic RAG + Evaluation
 *  - Phase 16: Document Ingestion + OCR
 *  - Phase 17: Voice I/O (STT/TTS)
 *  - Phase 18: Reasoning Distillation + Synthetic Data
 */

import { ErrorCodes, errorShape } from "../../protocol/index.js";
import type { GatewayRequestHandlers } from "../types.js";

// ─── Phase 13: Knowledge Graph ──────────────────────────────────
import {
    addEdge, addNode, findRelated, memoryGraphDiagnostics, mergeNodes, querySubgraph
} from "../../../republic/memory-graph.js";

// ─── Phase 14: MCP + ACP ───────────────────────────────────────
import {
    acpBridgeDiagnostics, listACPAgents, registerACPEndpoint,
    sendACPTask
} from "../../../republic/acp-bridge.js";
import {
    createMCPServer, handleMCPRequest, listMCPPrompts, listMCPResources, listMCPTools, mcpDiagnostics
} from "../../../republic/mcp-server.js";

// ─── Phase 15: Agentic RAG ─────────────────────────────────────
import {
    agenticSearch, evaluateResponseQuality,
    getEvalTrend, gradeRetrieval, ragDiagnostics
} from "../../../republic/agentic-rag.js";

// ─── Phase 16: Document Ingestion ───────────────────────────────
import {
    ingestDocument, ingestionDiagnostics, searchIngested
} from "../../../republic/document-ingestion.js";

// ─── Phase 17: Voice I/O ───────────────────────────────────────
import {
    endVoiceSession, getActiveSessions, getSessionTranscript, pauseVoiceSession, processAudioChunk, resumeVoiceSession, startVoiceSession, synthesizeSpeech, voiceDiagnostics
} from "../../../republic/voice-io.js";

// ─── Phase 18: Reasoning Distillation ──────────────────────────
import {
    captureCoT, createTrainingSet, distillationDiagnostics, distillReasoning, evaluateDistillation, exportTrainingSet, generateSyntheticData
} from "../../../republic/reasoning-distillation.js";

// ─── Phase 13 support ──────────────────────────────────────────
import { buildContextWindow } from "../../../republic/citizen-prompt.js";

// ─────────────────────────────────────────────────────────────────

export const aiHubHandlers: Partial<GatewayRequestHandlers> = {
  // ═══════════════════════════════════════════════════════════════
  // Phase 13: Knowledge Graph
  // ═══════════════════════════════════════════════════════════════

  "republic.graph.query": ({ params, respond }) => {
    const p = params as { entityId?: string; depth?: number } | undefined;
    if (!p?.entityId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "entityId required"));
      return;
    }
    const subgraph = querySubgraph(p.entityId, p.depth ?? 2);
    respond(true, { ok: true, subgraph }, undefined);
  },

  "republic.graph.add.entity": ({ params, respond }) => {
    const p = params as {
      label?: string;
      type?: string;
      citizenId?: string;
      metadata?: Record<string, unknown>;
      importance?: number;
    } | undefined;
    if (!p?.label || !p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "label and citizenId required"),
      );
      return;
    }
    try {
      const node = addNode(
        p.label,
        (p.type as "entity" | "concept" | "event") ?? "entity",
        p.citizenId,
        p.metadata,
        p.importance,
      );
      respond(true, { ok: true, node }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INTERNAL_ERROR, String(err)),
      );
    }
  },

  "republic.graph.add.edge": ({ params, respond }) => {
    const p = params as {
      source?: string;
      target?: string;
      relation?: string;
      citizenId?: string;
      weight?: number;
    } | undefined;
    if (!p?.source || !p?.target || !p?.relation || !p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "source, target, relation, and citizenId required"),
      );
      return;
    }
    try {
      const edge = addEdge(p.source, p.target, p.relation, p.citizenId, p.weight);
      respond(
        edge !== null,
        edge ? { ok: true, edge } : undefined,
        edge ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Source or target node not found"),
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.graph.find.related": ({ params, respond }) => {
    const p = params as { entityId?: string; topK?: number } | undefined;
    if (!p?.entityId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "entityId required"));
      return;
    }
    const related = findRelated(p.entityId, p.topK ?? 10);
    respond(true, { ok: true, related }, undefined);
  },

  "republic.graph.merge": ({ params, respond }) => {
    const p = params as { keepId?: string; removeId?: string } | undefined;
    if (!p?.keepId || !p?.removeId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "keepId and removeId required"),
      );
      return;
    }
    try {
      mergeNodes(p.keepId, p.removeId);
      respond(true, { ok: true }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.graph.context": ({ params, respond }) => {
    const p = params as {
      citizenId?: string;
      query?: string;
      tokenBudget?: number;
    } | undefined;
    if (!p?.citizenId || !p?.query) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and query required"),
      );
      return;
    }
    try {
      const result = buildContextWindow({
        citizen: { id: p.citizenId } as unknown as Parameters<typeof buildContextWindow>[0]["citizen"],
        query: p.query,
        tokenBudget: p.tokenBudget ?? 4096,
        memories: [],
      });
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.graph.diagnostics": ({ respond }) => {
    respond(true, memoryGraphDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 14: MCP Server + ACP Bridge
  // ═══════════════════════════════════════════════════════════════

  "republic.mcp.tools": ({ respond }) => {
    respond(true, { ok: true, tools: listMCPTools() }, undefined);
  },

  "republic.mcp.resources": ({ respond }) => {
    respond(true, { ok: true, resources: listMCPResources() }, undefined);
  },

  "republic.mcp.prompts": ({ respond }) => {
    respond(true, { ok: true, prompts: listMCPPrompts() }, undefined);
  },

  "republic.mcp.call": async ({ params, respond }) => {
    const p = params as { method?: string; params?: unknown; id?: number } | undefined;
    if (!p?.method) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "method required"));
      return;
    }
    try {
      const result = await handleMCPRequest({
        jsonrpc: "2.0",
        method: p.method,
        params: p.params as Record<string, unknown> | undefined,
        id: p.id ?? 1,
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.mcp.start": ({ params, respond }) => {
    const p = params as { transport?: string; port?: number } | undefined;
    try {
      const server = createMCPServer({
        transport: (p?.transport as "stdio" | "sse") ?? "sse",
        port: p?.port ?? 3100,
      });
      respond(true, { ok: true, server: { id: server.id, transport: server.transport } }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.mcp.diagnostics": ({ respond }) => {
    respond(true, mcpDiagnostics(), undefined);
  },

  "republic.acp.register": ({ params, respond }) => {
    const p = params as {
      agentId?: string;
      url?: string;
      framework?: string;
      capabilities?: string[];
    } | undefined;
    if (!p?.agentId || !p?.url) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "agentId and url required"),
      );
      return;
    }
    const agent = registerACPEndpoint(p.agentId, p.url, p.framework, p.capabilities);
    respond(true, { ok: true, agent }, undefined);
  },

  "republic.acp.send": async ({ params, respond }) => {
    const p = params as {
      agentId?: string;
      task?: string;
      payload?: unknown;
      fromAgent?: string;
    } | undefined;
    if (!p?.agentId || !p?.task) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "agentId and task required"),
      );
      return;
    }
    try {
      const result = await sendACPTask(
        p.fromAgent ?? "republic",
        p.agentId,
        p.task,
        p.payload,
      );
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.acp.agents": ({ respond }) => {
    respond(true, { ok: true, agents: listACPAgents() }, undefined);
  },

  "republic.acp.diagnostics": ({ respond }) => {
    respond(true, acpBridgeDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 15: Agentic RAG + Evaluation
  // ═══════════════════════════════════════════════════════════════

  "republic.rag.search": ({ params, respond }) => {
    const p = params as {
      query?: string;
      maxRounds?: number;
      topK?: number;
    } | undefined;
    if (!p?.query) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "query required"),
      );
      return;
    }
    try {
      const results = agenticSearch(p.query, {
        maxRounds: p.maxRounds ?? 2,
        topK: p.topK ?? 10,
      });
      respond(true, { ok: true, results }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.rag.grade": ({ params, respond }) => {
    const p = params as {
      query?: string;
      results?: Array<{ id: string; content: string; score: number; source: string }>;
    } | undefined;
    if (!p?.query || !p?.results) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "query and results required"),
      );
      return;
    }
    const grade = gradeRetrieval(p.query, p.results as unknown as Parameters<typeof gradeRetrieval>[1]);
    respond(true, { ok: true, grade }, undefined);
  },

  "republic.rag.evaluate": ({ params, respond }) => {
    const p = params as {
      question?: string;
      answer?: string;
      sources?: string[];
    } | undefined;
    if (!p?.question || !p?.answer) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "question and answer required"),
      );
      return;
    }
    const evaluation = evaluateResponseQuality(p.question, p.answer, p.sources ?? []);
    respond(true, { ok: true, evaluation }, undefined);
  },

  "republic.rag.trend": ({ params, respond }) => {
    const p = params as { citizenId?: string; windowSize?: number } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const trend = getEvalTrend(p.citizenId, p.windowSize ?? 20);
    respond(true, { ok: true, trend }, undefined);
  },

  "republic.rag.diagnostics": ({ respond }) => {
    respond(true, ragDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 16: Document Ingestion + OCR
  // ═══════════════════════════════════════════════════════════════

  "republic.ingest.document": ({ params, respond }) => {
    const p = params as {
      content?: string;
      citizenId?: string;
      title?: string;
      filename?: string;
      metadata?: Record<string, unknown>;
    } | undefined;
    if (!p?.content || !p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "content and citizenId required"),
      );
      return;
    }
    try {
      const result = ingestDocument(p.content, p.citizenId, {
        title: p.title,
        filename: p.filename,
        metadata: p.metadata,
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.ingest.url": ({ params, respond }) => {
    const p = params as { url?: string; citizenId?: string; title?: string } | undefined;
    if (!p?.url || !p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "url and citizenId required"),
      );
      return;
    }
    try {
      const result = ingestDocument(p.url, p.citizenId, {
        title: p.title,
        source: p.url,
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.ingest.search": ({ params, respond }) => {
    const p = params as {
      query?: string;
      citizenId?: string;
      topK?: number;
    } | undefined;
    if (!p?.query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    const results = searchIngested(p.query, {
      citizenId: p.citizenId,
      topK: p.topK ?? 10,
    });
    respond(true, { ok: true, results }, undefined);
  },

  "republic.ingest.ocr": ({ params, respond }) => {
    const p = params as { imageData?: string; citizenId?: string } | undefined;
    if (!p?.imageData || !p?.citizenId) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "imageData and citizenId required"),
      );
      return;
    }
    try {
      // Treat image data as text content — real OCR would use vision model
      const result = ingestDocument(p.imageData, p.citizenId, {
        source: "ocr",
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.ingest.diagnostics": ({ respond }) => {
    respond(true, ingestionDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 17: Voice I/O
  // ═══════════════════════════════════════════════════════════════

  "republic.voice.session.start": ({ params, respond }) => {
    const p = params as { citizenId?: string; language?: string; voice?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    try {
      const session = startVoiceSession(p.citizenId, {
        language: p.language ?? "en",
        voice: p.voice,
      });
      respond(true, { ok: true, session }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.voice.session.end": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    const ok = endVoiceSession(p.sessionId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.NOT_FOUND, "Session not found or already ended"),
    );
  },

  "republic.voice.session.pause": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    const ok = pauseVoiceSession(p.sessionId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot pause session"),
    );
  },

  "republic.voice.session.resume": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    const ok = resumeVoiceSession(p.sessionId);
    respond(
      ok,
      ok ? { ok: true } : undefined,
      ok ? undefined : errorShape(ErrorCodes.INVALID_REQUEST, "Cannot resume session"),
    );
  },

  "republic.voice.listen": async ({ params, respond }) => {
    const p = params as { sessionId?: string; audioData?: string } | undefined;
    if (!p?.sessionId || !p?.audioData) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and audioData required"),
      );
      return;
    }
    try {
      const result = await processAudioChunk(p.sessionId, p.audioData);
      if (result) {
        respond(true, { ok: true, transcription: result }, undefined);
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Session not active"));
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.voice.speak": async ({ params, respond }) => {
    const p = params as { sessionId?: string; text?: string; voice?: string } | undefined;
    if (!p?.sessionId || !p?.text) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and text required"),
      );
      return;
    }
    try {
      const result = await synthesizeSpeech(p.sessionId, p.text, p.voice);
      if (result) {
        respond(true, { ok: true, synthesis: result }, undefined);
      } else {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Session not active"));
      }
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.voice.transcript": ({ params, respond }) => {
    const p = params as { sessionId?: string } | undefined;
    if (!p?.sessionId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId required"));
      return;
    }
    const transcript = getSessionTranscript(p.sessionId);
    respond(
      transcript !== null,
      transcript !== null ? { ok: true, transcript } : undefined,
      transcript !== null
        ? undefined
        : errorShape(ErrorCodes.NOT_FOUND, "Session not found"),
    );
  },

  "republic.voice.sessions": ({ respond }) => {
    respond(true, { ok: true, sessions: getActiveSessions() }, undefined);
  },

  "republic.voice.diagnostics": ({ respond }) => {
    respond(true, voiceDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // Phase 18: Reasoning Distillation + Synthetic Data
  // ═══════════════════════════════════════════════════════════════

  "republic.distill.capture": ({ params, respond }) => {
    const p = params as {
      question?: string;
      steps?: Array<{ index: number; thought: string; confidence: number }>;
      answer?: string;
      model?: string;
    } | undefined;
    if (!p?.question || !p?.steps || !p?.answer || !p?.model) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "question, steps, answer, and model required"),
      );
      return;
    }
    try {
      const cot = captureCoT(p.question, p.steps, p.answer, p.model);
      respond(true, { ok: true, cot }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.distill.distill": ({ params, respond }) => {
    const p = params as { cotId?: string } | undefined;
    if (!p?.cotId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "cotId required"));
      return;
    }
    const result = distillReasoning(p.cotId);
    respond(
      result !== null,
      result ? { ok: true, distilled: result } : undefined,
      result ? undefined : errorShape(ErrorCodes.NOT_FOUND, "CoT trace not found"),
    );
  },

  "republic.distill.synthetic.generate": ({ params, respond }) => {
    const p = params as {
      domain?: string;
      count?: number;
      difficulty?: string;
    } | undefined;
    if (!p?.domain || !p?.count) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "domain and count required"),
      );
      return;
    }
    try {
      const samples = generateSyntheticData(p.domain, p.count, {
        difficulty: p.difficulty as "easy" | "medium" | "hard" | undefined,
      });
      respond(true, { ok: true, samples, count: samples.length }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.distill.training.create": ({ params, respond }) => {
    const p = params as {
      name?: string;
      sampleIds?: string[];
      format?: string;
    } | undefined;
    if (!p?.name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "name required"));
      return;
    }
    try {
      const set = createTrainingSet(
        p.name,
        p.sampleIds,
        (p.format as "alpaca" | "sharegpt" | "openai") ?? "alpaca",
      );
      respond(true, { ok: true, trainingSet: set }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  "republic.distill.training.export": ({ params, respond }) => {
    const p = params as { setId?: string } | undefined;
    if (!p?.setId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "setId required"));
      return;
    }
    const exported = exportTrainingSet(p.setId);
    respond(
      exported !== null,
      exported !== null ? { ok: true, data: exported } : undefined,
      exported !== null
        ? undefined
        : errorShape(ErrorCodes.NOT_FOUND, "Training set not found"),
    );
  },

  "republic.distill.evaluate": ({ params, respond }) => {
    const p = params as { teacherAnswer?: string; studentAnswer?: string } | undefined;
    if (!p?.teacherAnswer || !p?.studentAnswer) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "teacherAnswer and studentAnswer required"),
      );
      return;
    }
    const result = evaluateDistillation(p.teacherAnswer, p.studentAnswer);
    respond(true, { ok: true, evaluation: result }, undefined);
  },

  "republic.distill.diagnostics": ({ respond }) => {
    respond(true, distillationDiagnostics(), undefined);
  },

  // ═══════════════════════════════════════════════════════════════
  // AI Hub Health Dashboard (Aggregated)
  // ═══════════════════════════════════════════════════════════════

  "republic.health.aihub": ({ respond }) => {
    try {
      const health = {
        graph: memoryGraphDiagnostics(),
        mcp: mcpDiagnostics(),
        acp: acpBridgeDiagnostics(),
        rag: ragDiagnostics(),
        ingestion: ingestionDiagnostics(),
        voice: voiceDiagnostics(),
        distillation: distillationDiagnostics(),
      };
      respond(true, { ok: true, health }, undefined);
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INTERNAL_ERROR,
          `AI Hub health aggregation failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },
};
