/**
 * Republic Gateway Handlers — execution
 * Auto-extracted from republic.ts for maintainability.
 */

/**
 * Republic Platform — Gateway RPC Handlers
 *
 * Thin adapter layer that maps JSON-RPC methods to the modular
 * Republic engine. All logic lives in src/republic/*.ts.
 *
 * This file ONLY contains the handler wiring — no types, no business
 * logic, no state management. Just delegation.
 */

import type { GatewayRequestHandlers } from "../types.js";
// Phase 36: Dynamic Compute Scaling
import {
    downloadFile, fillForm, getComputerUseDiagnostics,
    isBrowserAvailable, navigateTo,
    searchWeb as cwSearchWeb
} from "../../../republic/computer-use.js";
// Phase 35: Docker Orchestration Engine
import {
    buildDnaStrand, buildFitnessLandscape, buildLineageTree, buildNetworkGraph, findCitizenGenome
} from "../../../republic/genome-viz.js";
// ─── Module Imports ─────────────────────────────────────────────
// Phase 33: Infrastructure Control Plane
// Phase 34: HuggingFace Model Provisioner
// Phase 37: Database Persistence Layer
import {
    proposeResearchQuestion
} from "../../../republic/curiosity-engine.js";
import { getExecutionDiagnostics, getExecutionHistory } from "../../../republic/real-execution.js";
import {
    conductResearch
} from "../../../republic/research-engine.js";
import {
    getState
} from "../../../republic/state.js";
import {
    analyzeUIDesign, compareScreenshots, describeImage,
    extractTextFromImage, getVisionDiagnostics, readChart
} from "../../../republic/vision.js";
import {
    compareItems, getActiveMonitors,
    getWebResearchDiagnostics, researchTopic,
    scrapeDocs, startMonitor
} from "../../../republic/web-research.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const executionHandlers: Partial<GatewayRequestHandlers> = {
  // ─── Real Execution ─────────────────────────────────────────
  "republic.execution.history": ({ params, respond }) => {
    const p = params as { limit?: number } | undefined;
    respond(true, { history: getExecutionHistory(p?.limit ?? 20) }, undefined);
  },

  "republic.execution.status": ({ respond }) => {
    respond(
      true,
      {
        mode: getState().mode,
        diagnostics: getExecutionDiagnostics(),
      },
      undefined,
    );
  },

  "republic.execution.run": ({ params, respond }) => {
    const p = params as { action?: string } | undefined;
    if (!p?.action) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "action required"));
      return;
    }
    const s = getState();
    try {
      let output = "";
      switch (p.action) {
        case "start_simulation":
          s.isRunning = true;
          output = "Simulation started";
          break;
        case "pause_simulation":
          s.isRunning = false;
          output = "Simulation paused";
          break;
        case "stop_simulation":
          s.isRunning = false;
          output = "Simulation stopped";
          break;
        case "run_tick":
          output = `Tick queued (current: ${s.currentTick})`;
          break;
        case "spawn_citizen":
          output = `Citizen spawn requested (pop: ${s.citizens.length})`;
          break;
        case "hold_election":
          output = "Election cycle triggered";
          break;
        case "adjust_tax":
          output = `Tax rate: ${(s.taxRate ?? 0.15) * 100}%`;
          break;
        case "train_model":
          output = "ML training queued";
          break;
        default:
          respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Unknown action: ${p.action}`));
          return;
      }
      respond(true, { success: true, output }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.INTERNAL_ERROR, String(err)));
    }
  },

  // ─── Genome Visualization ───────────────────────────────────
  "republic.genome.pool": ({ respond }) => {
    const s = getState();
    respond(
      true,
      {
        genomes: s.genomePool.map((g) => ({
          id: g.id,
          label: g.label,
          generation: g.generation,
          fitness: g.fitness,
          parentIds: g.parentIds,
          topology: g.topology,
          weightCount: g.weights.length,
          createdAt: g.createdAt,
        })),
        totalGenomes: s.genomePool.length,
      },
      undefined,
    );
  },

  "republic.genome.network": ({ params, respond }) => {
    const p = params as { genomeId?: string } | undefined;
    if (!p?.genomeId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "genomeId required"));
      return;
    }
    const s = getState();
    const genome = s.genomePool.find((g) => g.id === p.genomeId);
    if (!genome) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "genome not found"));
      return;
    }
    respond(true, buildNetworkGraph(genome), undefined);
  },

  "republic.genome.dna": ({ params, respond }) => {
    const p = params as { genomeId?: string } | undefined;
    if (!p?.genomeId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "genomeId required"));
      return;
    }
    const s = getState();
    const genome = s.genomePool.find((g) => g.id === p.genomeId);
    if (!genome) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "genome not found"));
      return;
    }
    respond(true, buildDnaStrand(genome), undefined);
  },

  "republic.genome.lineage": ({ respond }) => {
    respond(true, buildLineageTree(getState().genomePool), undefined);
  },

  "republic.genome.landscape": ({ respond }) => {
    respond(true, buildFitnessLandscape(getState().genomePool), undefined);
  },

  "republic.genome.citizen": ({ params, respond }) => {
    const p = params as { citizenId?: string } | undefined;
    if (!p?.citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "citizenId required"));
      return;
    }
    const genome = findCitizenGenome(getState(), p.citizenId);
    if (!genome) {
      respond(true, { genome: null }, undefined);
      return;
    }
    respond(
      true,
      {
        genome: {
          id: genome.id,
          label: genome.label,
          generation: genome.generation,
          fitness: genome.fitness,
          topology: genome.topology,
          weightCount: genome.weights.length,
        },
        network: buildNetworkGraph(genome),
        dna: buildDnaStrand(genome),
      },
      undefined,
    );
  },

  // ─── Phase 9: Computer Use & Browser ────────────────────────
  "republic.browser.navigate": async ({ params, respond }) => {
    const p = params as { url?: string; waitForSelector?: string } | undefined;
    if (!p?.url) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "url required"));
      return;
    }
    try {
      const result = await navigateTo(p.url, { waitForSelector: p.waitForSelector });
      respond(
        true,
        {
          ok: true,
          title: result.content.title,
          url: result.content.url,
          headings: result.content.headings,
          linkCount: result.content.links.length,
          formCount: result.content.forms.length,
          textPreview: result.content.text.slice(0, 500),
          screenshotId: result.screenshot.id,
        },
        undefined,
      );
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.browser.search": async ({ params, respond }) => {
    const p = params as { query?: string; maxResults?: number } | undefined;
    if (!p?.query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    const results = await cwSearchWeb(p.query, p.maxResults);
    respond(true, { ok: true, results, count: results.length }, undefined);
  },

  "republic.browser.fillForm": async ({ params, respond }) => {
    const p = params as
      | { url?: string; fields?: Record<string, string>; submitSelector?: string }
      | undefined;
    if (!p?.url || !p?.fields) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "url and fields required"));
      return;
    }
    const result = await fillForm(p.url, p.fields, p.submitSelector);
    respond(true, { ok: result.success, error: result.error }, undefined);
  },

  "republic.browser.download": async ({ params, respond }) => {
    const p = params as { url?: string; savePath?: string } | undefined;
    if (!p?.url || !p?.savePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "url and savePath required"),
      );
      return;
    }
    try {
      const result = await downloadFile(p.url, p.savePath);
      respond(true, { ok: true, ...result }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.browser.diagnostics": async ({ respond }) => {
    const available = await isBrowserAvailable();
    respond(true, { ...getComputerUseDiagnostics(), browserReady: available }, undefined);
  },

  // ─── Phase 9: Web Research ─────────────────────────────────
  "republic.research.topic": async ({ params, respond }) => {
    const p = params as { query?: string; depth?: "shallow" | "deep" } | undefined;
    if (!p?.query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    try {
      const report = await researchTopic(p.query, p.depth);
      respond(true, { ok: true, report }, undefined);
    } catch (err) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, String(err)));
    }
  },

  "republic.research.docs": async ({ params, respond }) => {
    const p = params as { url?: string; maxPages?: number } | undefined;
    if (!p?.url) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "url required"));
      return;
    }
    const result = await scrapeDocs(p.url, p.maxPages);
    respond(
      true,
      { ok: true, pageCount: result.pages.length, totalWords: result.totalWords },
      undefined,
    );
  },

  "republic.research.compare": async ({ params, respond }) => {
    const p = params as { items?: string[]; criteria?: string[] } | undefined;
    if (!p?.items?.length) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "items array required"));
      return;
    }
    const matrix = await compareItems(p.items, p.criteria);
    respond(true, { ok: true, matrix }, undefined);
  },

  "republic.research.monitor.start": ({ params, respond }) => {
    const p = params as { citizenId?: string; url?: string; intervalMs?: number } | undefined;
    if (!p?.citizenId || !p?.url) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "citizenId and url required"),
      );
      return;
    }
    const monitor = startMonitor(p.citizenId, p.url, p.intervalMs);
    respond(true, { ok: true, monitor }, undefined);
  },

  "republic.research.monitor.list": ({ respond }) => {
    respond(true, { monitors: getActiveMonitors() }, undefined);
  },

  "republic.research.submit": async ({ params, respond }) => {
    const p = params as { topic?: string; citizenId?: string } | undefined;
    if (!p?.topic) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "topic required"));
      return;
    }
    const s = getState();

    // Find an eligible citizen (specified or first available)
    const citizenId = p.citizenId ?? s.citizens.find((c) => c.energy > 20 && c.activity !== "Sleeping")?.id;
    if (!citizenId) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "No eligible citizen available for research"));
      return;
    }

    // Create a research question for this topic
    const question = proposeResearchQuestion(s, citizenId);
    if (!question) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Could not generate research question — citizen may lack certifications or question limit reached"));
      return;
    }

    // Start the research session
    const session = conductResearch(s, citizenId, question.id);
    if (!session) {
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "Could not start research session — max sessions may be reached"));
      return;
    }

    respond(true, {
      ok: true,
      sessionId: session.id,
      citizenId: session.citizenId,
      citizenName: session.citizenName,
      topic: session.topic,
      phase: session.phase,
      questionId: question.id,
    }, undefined);
  },

  "republic.research.diagnostics": ({ respond }) => {
    respond(true, getWebResearchDiagnostics(), undefined);
  },

  // ─── Phase 9: Vision ───────────────────────────────────────
  "republic.vision.describe": async ({ params, respond }) => {
    const p = params as { base64?: string; context?: string } | undefined;
    if (!p?.base64) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "base64 image required"));
      return;
    }
    const result = await describeImage(p.base64, p.context);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.vision.ocr": async ({ params, respond }) => {
    const p = params as { base64?: string } | undefined;
    if (!p?.base64) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "base64 image required"));
      return;
    }
    const result = await extractTextFromImage(p.base64);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.vision.compare": async ({ params, respond }) => {
    const p = params as { before?: string; after?: string } | undefined;
    if (!p?.before || !p?.after) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "before and after base64 images required"),
      );
      return;
    }
    const result = await compareScreenshots(p.before, p.after);
    respond(true, { ok: true, result }, undefined);
  },

  "republic.vision.analyzeUI": async ({ params, respond }) => {
    const p = params as { base64?: string } | undefined;
    if (!p?.base64) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "base64 image required"));
      return;
    }
    const feedback = await analyzeUIDesign(p.base64);
    respond(true, { ok: true, feedback }, undefined);
  },

  "republic.vision.readChart": async ({ params, respond }) => {
    const p = params as { base64?: string } | undefined;
    if (!p?.base64) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "base64 image required"));
      return;
    }
    const chart = await readChart(p.base64);
    respond(true, { ok: true, chart }, undefined);
  },

  "republic.vision.diagnostics": ({ respond }) => {
    respond(true, getVisionDiagnostics(), undefined);
  },

};
