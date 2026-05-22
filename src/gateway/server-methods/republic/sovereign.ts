/**
 * Self-Sovereignty RPC Handlers
 *
 * Gateway handlers for Vision, Code Interpreter, Search+RAG,
 * Voice Engine, Knowledge Base, Proactive Engine, and Fine-Tune Pipeline.
 *
 * Method domain: republic.sovereign.*
 */

import type { GatewayRequestHandlers } from "../types.js";

export const sovereignHandlers: GatewayRequestHandlers = {
  // ─── Vision Engine ──────────────────────────────────────────────

  "republic.sovereign.vision.analyze": async ({ params, respond }) => {
    try {
      const { analyzeImage } = await import("../../../republic/vision-engine.js");
      const p = params as { image: string; action?: string; question?: string; provider?: string };
      const result = await analyzeImage({
        image: p.image,
        action: (p.action ??
          "describe") as import("../../../republic/vision-engine.js").VisionAction,
        question: p.question,
        provider: p.provider as
          | import("../../../republic/vision-engine.js").VisionProvider
          | undefined,
      });
      respond(true, { ok: true, result }, undefined);
    } catch (err: unknown) {
      respond(
        true,
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        undefined,
      );
    }
  },

  "republic.sovereign.vision.diagnostics": async ({ respond }) => {
    const { getVisionDiagnostics } = await import("../../../republic/vision-engine.js");
    respond(true, { ok: true, ...getVisionDiagnostics() }, undefined);
  },

  // ─── Knowledge Base ─────────────────────────────────────────────

  "republic.sovereign.knowledge.add": async ({ params, respond }) => {
    const { addKnowledge } = await import("../../../republic/knowledge-base.js");
    const p = params as { title: string; content: string; category?: string; tags?: string[] };
    const entry = addKnowledge({
      title: p.title,
      content: p.content,
      category: p.category as
        | import("../../../republic/knowledge-base.js").KnowledgeCategory
        | undefined,
      tags: p.tags,
    });
    respond(true, { ok: true, entry }, undefined);
  },

  "republic.sovereign.knowledge.query": async ({ params, respond }) => {
    const { queryKnowledge } = await import("../../../republic/knowledge-base.js");
    const p = params as { query: string; category?: string; topK?: number };
    const result = queryKnowledge({
      query: p.query,
      category: p.category as
        | import("../../../republic/knowledge-base.js").KnowledgeCategory
        | undefined,
      topK: p.topK,
    });
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.sovereign.knowledge.list": async ({ params, respond }) => {
    const { listKnowledge } = await import("../../../republic/knowledge-base.js");
    const p = params as { offset?: number; limit?: number; category?: string };
    const entries = listKnowledge(
      p.offset,
      p.limit,
      p.category as import("../../../republic/knowledge-base.js").KnowledgeCategory | undefined,
    );
    respond(true, { ok: true, entries }, undefined);
  },

  "republic.sovereign.knowledge.update": async ({ params, respond }) => {
    const { updateKnowledge } = await import("../../../republic/knowledge-base.js");
    const p = params as {
      id: string;
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
    };
    const entry = updateKnowledge(p.id, {
      title: p.title,
      content: p.content,
      category: p.category as
        | import("../../../republic/knowledge-base.js").KnowledgeCategory
        | undefined,
      tags: p.tags,
    });
    respond(true, { ok: true, entry }, undefined);
  },

  "republic.sovereign.knowledge.delete": async ({ params, respond }) => {
    const { deleteKnowledge } = await import("../../../republic/knowledge-base.js");
    const { id } = params as { id: string };
    respond(true, { ok: true, deleted: deleteKnowledge(id) }, undefined);
  },

  "republic.sovereign.knowledge.extract": async ({ params, respond }) => {
    const { extractKnowledge } = await import("../../../republic/knowledge-base.js");
    const { text } = params as { text: string };
    const result = extractKnowledge(text);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.sovereign.knowledge.diagnostics": async ({ respond }) => {
    const { getKnowledgeBaseDiagnostics } = await import("../../../republic/knowledge-base.js");
    respond(true, { ok: true, ...getKnowledgeBaseDiagnostics() }, undefined);
  },

  // ─── Proactive Engine ───────────────────────────────────────────

  "republic.sovereign.proactive.create": async ({ params, respond }) => {
    const { createTrigger } = await import("../../../republic/proactive-engine.js");
    const p = params as {
      name: string;
      source: string;
      condition: Record<string, unknown>;
      action: Record<string, unknown>;
      maxFires?: number;
      cooldownMs?: number;
    };
    const trigger = createTrigger(
      p.name,
      p.source as import("../../../republic/proactive-engine.js").TriggerSource,
      p.condition as unknown as import("../../../republic/proactive-engine.js").TriggerCondition,
      p.action as unknown as import("../../../republic/proactive-engine.js").TriggerAction,
      { maxFires: p.maxFires, cooldownMs: p.cooldownMs },
    );
    respond(true, { ok: true, trigger }, undefined);
  },

  "republic.sovereign.proactive.list": async ({ params, respond }) => {
    const { listTriggers } = await import("../../../republic/proactive-engine.js");
    const p = params as { source?: string };
    const triggers = listTriggers(
      p.source as import("../../../republic/proactive-engine.js").TriggerSource | undefined,
    );
    respond(true, { ok: true, triggers }, undefined);
  },

  "republic.sovereign.proactive.delete": async ({ params, respond }) => {
    const { deleteTrigger } = await import("../../../republic/proactive-engine.js");
    const { id } = params as { id: string };
    respond(true, { ok: true, deleted: deleteTrigger(id) }, undefined);
  },

  "republic.sovereign.proactive.diagnostics": async ({ respond }) => {
    const { getProactiveDiagnostics } = await import("../../../republic/proactive-engine.js");
    respond(true, { ok: true, ...getProactiveDiagnostics() }, undefined);
  },

  // ─── Fine-Tune Pipeline ─────────────────────────────────────────

  "republic.sovereign.finetune.create": async ({ params, respond }) => {
    const { createTrainingJob } = await import("../../../republic/finetune-pipeline.js");
    const p = params as {
      name: string;
      baseModel: string;
      dataset: { format: string; trainPath: string; source: string };
      method?: string;
    };
    const job = createTrainingJob(
      p.name,
      p.baseModel,
      p.dataset as import("../../../republic/finetune-pipeline.js").DatasetConfig,
      {
        method: p.method as
          | import("../../../republic/finetune-pipeline.js").TrainingMethod
          | undefined,
      },
    );
    respond(true, { ok: true, job }, undefined);
  },

  "republic.sovereign.finetune.list": async ({ params, respond }) => {
    const { listTrainingJobs } = await import("../../../republic/finetune-pipeline.js");
    const p = params as { status?: string };
    const jobs = listTrainingJobs(
      p.status as import("../../../republic/finetune-pipeline.js").TrainingStatus | undefined,
    );
    respond(true, { ok: true, jobs }, undefined);
  },

  "republic.sovereign.finetune.get": async ({ params, respond }) => {
    const { getTrainingJob } = await import("../../../republic/finetune-pipeline.js");
    const { id } = params as { id: string };
    const job = getTrainingJob(id);
    respond(true, { ok: true, job }, undefined);
  },

  "republic.sovereign.finetune.cancel": async ({ params, respond }) => {
    const { cancelTrainingJob } = await import("../../../republic/finetune-pipeline.js");
    const { id } = params as { id: string };
    respond(true, { ok: true, cancelled: cancelTrainingJob(id) }, undefined);
  },

  "republic.sovereign.finetune.diagnostics": async ({ respond }) => {
    const { getFineTuneDiagnostics } = await import("../../../republic/finetune-pipeline.js");
    respond(true, { ok: true, ...getFineTuneDiagnostics() }, undefined);
  },

  // ─── Voice Engine ───────────────────────────────────────────────

  "republic.sovereign.voice.transcribe": async ({ params, respond }) => {
    try {
      const { transcribe } = await import("../../../republic/voice-engine.js");
      const p = params as { audioBase64: string; provider?: string; language?: string };
      const result = await transcribe(
        p.audioBase64,
        p.provider as import("../../../republic/voice-engine.js").STTProvider | undefined,
        p.language,
      );
      respond(true, { ok: true, result }, undefined);
    } catch (err: unknown) {
      respond(
        true,
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        undefined,
      );
    }
  },

  "republic.sovereign.voice.synthesize": async ({ params, respond }) => {
    try {
      const { synthesize } = await import("../../../republic/voice-engine.js");
      const p = params as { text: string; provider?: string; voiceId?: string };
      const result = await synthesize(
        p.text,
        p.provider as import("../../../republic/voice-engine.js").TTSProvider | undefined,
        p.voiceId,
      );
      respond(true, { ok: true, result }, undefined);
    } catch (err: unknown) {
      respond(
        true,
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        undefined,
      );
    }
  },

  "republic.sovereign.voice.providers": async ({ respond }) => {
    const { getAvailableSTTProviders, getAvailableTTSProviders } =
      await import("../../../republic/voice-engine.js");
    respond(
      true,
      { ok: true, stt: getAvailableSTTProviders(), tts: getAvailableTTSProviders() },
      undefined,
    );
  },

  // ─── Search + RAG ───────────────────────────────────────────────

  "republic.sovereign.search.grounding": async ({ params, respond }) => {
    const { classifyGrounding } = await import("../../../republic/search-rag.js");
    const { query } = params as { query: string };
    respond(true, { ok: true, signals: classifyGrounding(query) }, undefined);
  },

  "republic.sovereign.search.diagnostics": async ({ respond }) => {
    const { getSearchRAGDiagnostics } = await import("../../../republic/search-rag.js");
    respond(true, { ok: true, ...getSearchRAGDiagnostics() }, undefined);
  },

  // ─── Code Interpreter ──────────────────────────────────────────

  "republic.sovereign.interpreter.diagnostics": async ({ respond }) => {
    const { getInterpreterDiagnostics } = await import("../../../republic/code-interpreter.js");
    respond(true, { ok: true, ...getInterpreterDiagnostics() }, undefined);
  },
};
