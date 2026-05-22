/**
 * Research Engine — Republic Gateway RPC Handlers
 *
 * In-process research job queue with topic ingestion, simulated
 * async processing, and document storage per job.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

// ─── Types ─────────────────────────────────────────────────────────────────

interface ResearchJob {
  id: string;
  topic: string;
  status: "queued" | "running" | "done" | "error";
  result?: string;
  docs?: string[];
  docsFound?: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// ─── In-process state ──────────────────────────────────────────────────────

const jobs = new Map<string, ResearchJob>();

// ─── Research simulation ─────────────────────────────────────────────────────

const KNOWLEDGE_BANK: Record<string, string[]> = {
  ai: [
    "Large language models (LLMs) achieve emergent capabilities at scale through pretraining on diverse internet corpora.",
    "Constitutional AI is a safety technique developed by Anthropic that trains models to self-critique via a set of principles.",
    "Mixture-of-Experts (MoE) routing enables trillion-parameter models to run efficiently by activating only a subset of parameters per token.",
    "Retrieval-Augmented Generation (RAG) grounds LLM outputs in external knowledge bases, reducing hallucination significantly.",
  ],
  quantum: [
    "Quantum entanglement allows qubits to be correlated regardless of distance, enabling distributed quantum computing.",
    "Shor's algorithm factors large integers in polynomial time, threatening RSA encryption when fault-tolerant quantum computers arrive.",
    "Topological qubits may offer inherent error correction, which is why Microsoft has invested heavily in this approach.",
    "Quantum error correction requires hundreds of physical qubits per logical qubit, making scaling the central challenge.",
  ],
  economics: [
    "The Universal Basic Income pilot in Stockton, CA (SEED) showed increased employment and reduced mental health issues.",
    "Post-scarcity economics posits that automation may eventually make goods and services so cheap they are effectively free.",
    "Degrowth advocates argue that GDP growth is incompatible with ecological sustainability and propose steady-state economics.",
    "Digital currencies backed by central banks (CBDCs) are being piloted in over 130 countries as of 2024.",
  ],
  biology: [
    "CRISPR-Cas9 gene editing enables precise DNA modification with applications from curing genetic diseases to enhanced crops.",
    "Synthetic biology can reprogram cellular machinery to produce biofuels, medicines, and biodegradable plastics.",
    "Organoids — lab-grown mini organs — are revolutionizing drug testing by closely mimicking real human tissue.",
    "The gut microbiome contains ~40 trillion bacteria that influence immune response, mood, and metabolic health.",
  ],
  space: [
    "SpaceX Starship is the largest rocket ever built, designed to carry 100+ people to Mars in a single mission.",
    "The James Webb Space Telescope can image galaxies formed just 300 million years after the Big Bang.",
    "In-situ resource utilization (ISRU) on Mars involves making rocket fuel from CO2 and subsurface water ice.",
    "The Artemis program aims to return humans to the Moon by 2026 and establish a sustainable lunar presence.",
  ],
};

function getDocsForTopic(topic: string): string[] {
  const lower = topic.toLowerCase();
  for (const [key, docs] of Object.entries(KNOWLEDGE_BANK)) {
    if (lower.includes(key)) {
      return docs;
    }
  }
  // Generic synthesis
  return [
    `Research overview: "${topic}" is an active area of inquiry with significant ongoing work.`,
    `Analysis layer 1: Initial literature review suggests ${Math.floor(Math.random() * 300 + 50)} relevant publications.`,
    `Analysis layer 2: Cross-domain connections identified with AI, systems theory, and complexity science.`,
    `Synthesis: The core challenge in ${topic} relates to scalability, verification, and real-world deployment constraints.`,
    `Recommendation: Focus future research on practical implementations and empirical validation methodologies.`,
  ];
}

function startJobAsync(job: ResearchJob): void {
  job.status = "running";
  job.startedAt = Date.now();
  const delay = 3000 + Math.floor(Math.random() * 8000); // 3-11s
  setTimeout(() => {
    const existing = jobs.get(job.id);
    if (!existing) {
      return;
    }
    try {
      const docs = getDocsForTopic(job.topic);
      existing.status = "done";
      existing.docs = docs;
      existing.docsFound = docs.length;
      existing.completedAt = Date.now();
      existing.result = docs.join("\n\n---\n\n");
    } catch {
      existing.status = "error";
      existing.error = "Research pipeline encountered an error.";
    }
  }, delay);
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export const researchHandlers: Partial<GatewayRequestHandlers> = {
  "republic.research.monitor.list": ({ respond }) => {
    const list = [...jobs.values()].toSorted((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    respond(true, { ok: true, jobs: list, total: list.length }, undefined);
  },

  "republic.research.submit": ({ params, respond }) => {
    const p = params as { topic?: string } | undefined;
    if (!p?.topic) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "topic required"));
      return;
    }
    const id = `research-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const job: ResearchJob = {
      id,
      topic: p.topic,
      status: "queued",
    };
    jobs.set(id, job);
    // Start async processing
    setTimeout(() => {
      startJobAsync(job);
    }, 500);
    respond(true, { ok: true, id, status: "queued" }, undefined);
  },

  "republic.research.docs": ({ params, respond }) => {
    const p = params as { jobId?: string } | undefined;
    if (!p?.jobId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId required"));
      return;
    }
    const job = jobs.get(p.jobId);
    if (!job) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Job not found"));
      return;
    }
    respond(true, { ok: true, job: { ...job }, docs: job.docs ?? [] }, undefined);
  },

  "republic.research.job.get": ({ params, respond }) => {
    const p = params as { jobId?: string } | undefined;
    if (!p?.jobId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "jobId required"));
      return;
    }
    const job = jobs.get(p.jobId);
    if (!job) {
      respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, "Job not found"));
      return;
    }
    respond(true, { ok: true, job }, undefined);
  },

  "republic.research.job.cancel": ({ params, respond }) => {
    const p = params as { jobId?: string } | undefined;
    if (p?.jobId) {
      const job = jobs.get(p.jobId);
      if (job && job.status === "running") {
        job.status = "error";
        job.error = "Cancelled by user";
      }
    }
    respond(true, { ok: true, cancelled: true }, undefined);
  },

  "republic.research.findings": ({ respond }) => {
    const finished = [...jobs.values()].filter((j) => j.status === "done");
    const findings = finished.flatMap((j) =>
      (j.docs ?? []).map((doc, i) => ({
        id: `finding-${j.id}-${i}`,
        jobId: j.id,
        topic: j.topic,
        content: doc,
        ts: j.completedAt ?? Date.now(),
      })),
    );
    respond(true, { ok: true, findings, total: findings.length }, undefined);
  },

  "republic.research.projects": ({ respond }) => {
    // Aggregate jobs by topic prefix into projects
    const projectMap = new Map<
      string,
      { id: string; name: string; jobCount: number; completedJobs: number; lastActivity: number }
    >();
    for (const job of jobs.values()) {
      const projectKey = job.topic.split(" ").slice(0, 2).join(" ");
      const existing = projectMap.get(projectKey);
      if (existing) {
        existing.jobCount++;
        if (job.status === "done") {
          existing.completedJobs++;
        }
        existing.lastActivity = Math.max(existing.lastActivity, job.startedAt ?? 0);
      } else {
        projectMap.set(projectKey, {
          id: `proj-${projectKey.replace(/\s/g, "-")}`,
          name: projectKey,
          jobCount: 1,
          completedJobs: job.status === "done" ? 1 : 0,
          lastActivity: job.startedAt ?? Date.now(),
        });
      }
    }
    const projects = [...projectMap.values()];
    respond(true, { ok: true, projects, total: projects.length }, undefined);
  },
};
