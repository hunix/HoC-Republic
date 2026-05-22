/**
 * republic.finetune.* — LLM Fine-Tuning RPC handlers
 *
 * Delegates to LlamaFactory (tools/llamafactory/) for LoRA, QLoRA, DPO, PPO
 * training of 100+ supported models. Citizens use these RPCs to fine-tune
 * models, track training jobs, and deploy LoRA adapters.
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { GatewayRequestHandlers } from "../types.js";

/* ── Paths & Constants ─────────────────────────────────────────────────── */

const TOOLS_ROOT = path.resolve(process.cwd(), "tools", "llamafactory");
const CONFIGS_DIR = path.join(TOOLS_ROOT, "configs", "hoc");
const SAVES_DIR = path.join(TOOLS_ROOT, "saves");
const CLI_BIN = "llamafactory-cli";

/* ── Job Tracker (in-memory) ───────────────────────────────────────────── */

interface FineTuneJob {
  id: string;
  model: string;
  method: string;
  dataset: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  outputDir: string;
  logs: string[];
  error?: string;
  pid?: number;
}

const jobs = new Map<string, FineTuneJob>();
let jobCounter = 0;

/* ── Helpers ───────────────────────────────────────────────────────────── */

function nextJobId(): string {
  return `ft-${Date.now()}-${++jobCounter}`;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeYamlConfig(jobId: string, params: Record<string, unknown>): Promise<string> {
  await ensureDir(CONFIGS_DIR);
  const configPath = path.join(CONFIGS_DIR, `${jobId}.yaml`);

  const model = String(params.model ?? "Qwen/Qwen3-4B-Instruct");
  const method = String(params.method ?? "lora");
  const dataset = String(params.dataset ?? "alpaca_en");
  const template = String(params.template ?? "qwen3");
  const epochs = Number(params.epochs ?? 3);
  const lr = Number(params.learningRate ?? 1e-4);
  const loraRank = Number(params.loraRank ?? 8);
  const batchSize = Number(params.batchSize ?? 2);
  const cutoffLen = Number(params.cutoffLen ?? 2048);
  const outputDir = path.join(SAVES_DIR, jobId);

  const lines = [
    `### model`,
    `model_name_or_path: ${model}`,
    `trust_remote_code: true`,
    ``,
    `### method`,
    `stage: sft`,
    `do_train: true`,
    `finetuning_type: ${method}`,
    ...(method === "lora" || method === "qlora"
      ? [`lora_rank: ${loraRank}`, `lora_alpha: ${loraRank * 2}`]
      : []),
    ...(method === "qlora" ? [`quantization_bit: 4`] : []),
    ``,
    `### dataset`,
    `dataset: ${dataset}`,
    `template: ${template}`,
    `cutoff_len: ${cutoffLen}`,
    ``,
    `### output`,
    `output_dir: ${outputDir}`,
    `logging_steps: 10`,
    `save_steps: 500`,
    ``,
    `### train`,
    `per_device_train_batch_size: ${batchSize}`,
    `gradient_accumulation_steps: 4`,
    `learning_rate: ${lr}`,
    `num_train_epochs: ${epochs}`,
    `bf16: true`,
  ];

  await fs.writeFile(configPath, lines.join("\n"), "utf-8");
  return configPath;
}

async function listSavedModels(): Promise<Array<{ id: string; path: string; sizeBytes: number }>> {
  try {
    const entries = await fs.readdir(SAVES_DIR, { withFileTypes: true });
    const models: Array<{ id: string; path: string; sizeBytes: number }> = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const modelPath = path.join(SAVES_DIR, entry.name);
        let sizeBytes = 0;
        try {
          const files = await fs.readdir(modelPath);
          for (const f of files) {
            const stat = await fs.stat(path.join(modelPath, f));
            sizeBytes += stat.size;
          }
        } catch { /* empty dir is fine */ }
        models.push({ id: entry.name, path: modelPath, sizeBytes });
      }
    }
    return models;
  } catch {
    return [];
  }
}

/* ── Handlers ──────────────────────────────────────────────────────────── */

export const finetuneHandlers: GatewayRequestHandlers = {

  /**
   * Start a fine-tuning job.
   * Params: { model, method, dataset, template, epochs, learningRate, loraRank, batchSize, cutoffLen }
   */
  "republic.finetune.start": async ({ params, respond }) => {
    const raw = params as Record<string, unknown>;
    const model = String(raw.model ?? "Qwen/Qwen3-4B-Instruct");
    const method = String(raw.method ?? "lora");
    const dataset = String(raw.dataset ?? "alpaca_en");

    const jobId = nextJobId();
    const outputDir = path.join(SAVES_DIR, jobId);

    const job: FineTuneJob = {
      id: jobId,
      model,
      method,
      dataset,
      status: "queued",
      startedAt: new Date().toISOString(),
      outputDir,
      logs: [],
    };
    jobs.set(jobId, job);

    try {
      const configPath = await writeYamlConfig(jobId, raw);
      job.status = "running";

      // Spawn LlamaFactory CLI in the background
      const child = spawn(CLI_BIN, ["train", configPath], {
        cwd: TOOLS_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      job.pid = child.pid;

      child.stdout?.on("data", (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) {
          job.logs.push(line);
          // Keep only last 200 log lines
          if (job.logs.length > 200) { job.logs.splice(0, job.logs.length - 200); }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) { job.logs.push(`[stderr] ${line}`); }
      });

      child.on("close", (code) => {
        job.completedAt = new Date().toISOString();
        if (code === 0) {
          job.status = "completed";
        } else {
          job.status = "failed";
          job.error = `Process exited with code ${code}`;
        }
      });

      child.on("error", (err) => {
        job.status = "failed";
        job.error = String(err);
        job.completedAt = new Date().toISOString();
      });

      respond(true, {
        ok: true,
        jobId,
        model,
        method,
        dataset,
        configPath,
        message: `Fine-tuning job ${jobId} started`,
      }, undefined);
    } catch (err) {
      job.status = "failed";
      job.error = String(err);
      respond(false, undefined, { code: "FINETUNE_ERROR", message: String(err) });
    }
  },

  /**
   * Get status of a fine-tuning job.
   * Params: { jobId }
   */
  "republic.finetune.status": async ({ params, respond }) => {
    const { jobId } = params as { jobId?: string };
    if (!jobId || !jobs.has(jobId)) {
      respond(false, undefined, { code: "FINETUNE_ERROR", message: `Job not found: ${jobId}` });
      return;
    }
    const job = jobs.get(jobId)!;
    respond(true, {
      ok: true,
      id: job.id,
      model: job.model,
      method: job.method,
      dataset: job.dataset,
      status: job.status,
      startedAt: job.startedAt,
      completedAt: job.completedAt ?? null,
      outputDir: job.outputDir,
      error: job.error ?? null,
      recentLogs: job.logs.slice(-20),
    }, undefined);
  },

  /**
   * List all fine-tuning jobs.
   */
  "republic.finetune.jobs": async ({ respond }) => {
    const all = Array.from(jobs.values()).map((j) => ({
      id: j.id,
      model: j.model,
      method: j.method,
      dataset: j.dataset,
      status: j.status,
      startedAt: j.startedAt,
      completedAt: j.completedAt ?? null,
    }));
    respond(true, { ok: true, jobs: all, total: all.length }, undefined);
  },

  /**
   * List available fine-tuned models (saved adapters).
   */
  "republic.finetune.models": async ({ respond }) => {
    try {
      const models = await listSavedModels();
      respond(true, { ok: true, models, total: models.length }, undefined);
    } catch (err) {
      respond(false, undefined, { code: "FINETUNE_ERROR", message: String(err) });
    }
  },

  /**
   * Export (merge LoRA adapter into base model).
   * Params: { jobId }
   */
  "republic.finetune.export": async ({ params, respond }) => {
    const { jobId } = params as { jobId?: string };
    if (!jobId || !jobs.has(jobId)) {
      respond(false, undefined, { code: "FINETUNE_ERROR", message: `Job not found: ${jobId}` });
      return;
    }
    const job = jobs.get(jobId)!;
    if (job.status !== "completed") {
      respond(false, undefined, { code: "FINETUNE_ERROR", message: `Job ${jobId} is not completed (status: ${job.status})` });
      return;
    }

    const exportDir = path.join(SAVES_DIR, `${jobId}-merged`);
    const exportConfig = path.join(CONFIGS_DIR, `${jobId}-export.yaml`);

    try {
      const lines = [
        `### model`,
        `model_name_or_path: ${job.model}`,
        `adapter_name_or_path: ${job.outputDir}`,
        `trust_remote_code: true`,
        `finetuning_type: ${job.method}`,
        ``,
        `### export`,
        `export_dir: ${exportDir}`,
        `export_size: 2`,
        `export_device: auto`,
        `export_legacy_format: false`,
      ];
      await ensureDir(path.dirname(exportConfig));
      await fs.writeFile(exportConfig, lines.join("\n"), "utf-8");

      const child = spawn(CLI_BIN, ["export", exportConfig], {
        cwd: TOOLS_ROOT,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });

      child.on("close", (code) => {
        if (code === 0) {
          job.logs.push(`[export] Merged to ${exportDir}`);
        } else {
          job.logs.push(`[export] Failed with code ${code}`);
        }
      });

      respond(true, {
        ok: true,
        jobId,
        exportDir,
        message: `Export started for job ${jobId}`,
      }, undefined);
    } catch (err) {
      respond(false, undefined, { code: "FINETUNE_ERROR", message: String(err) });
    }
  },
};
