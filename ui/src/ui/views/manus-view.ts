import { html, nothing, type TemplateResult } from "lit";

// ─── Types ────────────────────────────────────────────────────────

type TrainingMethod = "sft" | "grpo" | "ppo" | "dpo";
type RolloutStrategy = "react" | "tree-of-thoughts" | "graph-of-thoughts" | "mcts" | "dfsdt";
type RewardType = "format" | "outcome" | "combined";
type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type BenchmarkTask = "gaia" | "agentbench" | "webshop" | "osworld" | "alfworld";

export interface ManusTrainingJob {
  id: string;
  citizenId: string;
  citizenName: string;
  config: {
    method: TrainingMethod;
    baseModel: string;
    rolloutStrategy: RolloutStrategy;
    rewardType: RewardType;
    learningRate: number;
    batchSize: number;
    numEpochs: number;
    maxSteps: number;
    evaluationBenchmarks: BenchmarkTask[];
  };
  status: JobStatus;
  currentStep: number;
  totalSteps: number;
  currentLoss: number;
  currentReward: number;
  outputModelPath?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ManusEvalJob {
  id: string;
  modelPath: string;
  benchmarks: BenchmarkTask[];
  status: JobStatus;
  results: {
    benchmark: BenchmarkTask;
    score: number;
    passRate: number;
    totalTasks: number;
    completedTasks: number;
    averageSteps: number;
  }[];
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ManusQueueStatus {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
}

export interface ManusProps {
  loading: boolean;
  trainingJobs: ManusTrainingJob[];
  evalJobs: ManusEvalJob[];
  queueStatus: ManusQueueStatus | null;
  onRefresh: () => void;
  onStartTraining: (config: Record<string, unknown>) => void;
  onStartEval: (config: Record<string, unknown>) => void;
  onCancelJob: (jobId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: "#94a3b8",
  running: "#3b82f6",
  completed: "#22c55e",
  failed: "#ef4444",
  cancelled: "#6b7280",
};

const STATUS_ICONS: Record<JobStatus, string> = {
  queued: "⏳",
  running: "⚡",
  completed: "✅",
  failed: "❌",
  cancelled: "⛔",
};

const METHOD_LABELS: Record<TrainingMethod, { label: string; color: string; desc: string }> = {
  sft: { label: "SFT", color: "#3b82f6", desc: "Supervised Fine-Tuning" },
  grpo: { label: "GRPO", color: "#8b5cf6", desc: "Group Relative Policy Optimization" },
  ppo: { label: "PPO", color: "#f59e0b", desc: "Proximal Policy Optimization" },
  dpo: { label: "DPO", color: "#10b981", desc: "Direct Preference Optimization" },
};

const ROLLOUT_LABELS: Record<RolloutStrategy, string> = {
  react: "ReAct",
  "tree-of-thoughts": "Tree of Thoughts",
  "graph-of-thoughts": "Graph of Thoughts",
  mcts: "Monte Carlo Tree Search",
  dfsdt: "DFS Decision Tree",
};

// ─── Helpers ──────────────────────────────────────────────────────

function formatElapsed(startMs: number, endMs?: number): string {
  const elapsed = (endMs ?? Date.now()) - startMs;
  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) {return `${secs}s`;}
  if (secs < 3600) {return `${Math.floor(secs / 60)}m ${secs % 60}s`;}
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

// ─── Module-level form state ──────────────────────────────────────

let _trainMethod: TrainingMethod = "grpo";
let _trainModel = "Qwen/Qwen2.5-7B-Instruct";
let _trainRollout: RolloutStrategy = "react";
let _trainReward: RewardType = "outcome";
let _trainLr = "1e-5";
let _trainBatch = "4";
let _trainEpochs = "3";
let _trainBenchmarks: BenchmarkTask[] = ["webshop"];
let _showTrainForm = false;
let _showEvalForm = false;
let _evalModelPath = "";
let _evalBenchmarks: BenchmarkTask[] = ["gaia", "webshop"];
let _expandedJobId: string | null = null;

// ─── Main Render ──────────────────────────────────────────────────

export function renderManus(props: ManusProps): TemplateResult {
  const { loading, trainingJobs, evalJobs, queueStatus, onRefresh } = props;

  if (loading && trainingJobs.length === 0 && evalJobs.length === 0) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <span>Loading OpenManus-RL…</span>
      </div>
    `;
  }

  return html`
    <div class="republic-view">
      ${renderHero(trainingJobs, evalJobs, queueStatus, onRefresh, loading)}
      ${renderActionBar(props)}
      ${_showTrainForm ? renderTrainingForm(props) : nothing}
      ${_showEvalForm ? renderEvalForm(props) : nothing}
      ${renderJobQueue(trainingJobs, props)}
      ${renderEvalResults(evalJobs)}
    </div>
  `;
}

// ─── Hero Section ─────────────────────────────────────────────────

function renderHero(
  jobs: ManusTrainingJob[],
  evals: ManusEvalJob[],
  queue: ManusQueueStatus | null,
  onRefresh: () => void,
  loading: boolean,
): TemplateResult {
  const running = jobs.filter((j) => j.status === "running").length;
  const completed = jobs.filter((j) => j.status === "completed").length;
  const avgReward =
    jobs.filter((j) => j.currentReward > 0).length > 0
      ? (
          jobs.filter((j) => j.currentReward > 0).reduce((s, j) => s + j.currentReward, 0) /
          jobs.filter((j) => j.currentReward > 0).length
        ).toFixed(3)
      : "—";
  const totalEvals = evals.length;

  return html`
    <div class="republic-hero">
      <div class="republic-hero__header">
        <h2 class="republic-hero__title">
          <span style="font-size:1.4rem">🤖</span> OpenManus-RL
        </h2>
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${
            running > 0
              ? html`<span class="republic-hero__badge republic-hero__badge--live">⚡ ${running} Running</span>`
              : nothing
          }
          <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm" @click=${onRefresh} ?disabled=${loading}>
            ${loading ? "⏳" : "↻"} Refresh
          </button>
        </div>
      </div>
      <div class="republic-metrics">
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${formatNumber(jobs.length + evals.length)}</div>
          <div class="republic-metric__label">Total Jobs</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value republic-metric__value--blue">${running}</div>
          <div class="republic-metric__label">Training</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value republic-metric__value--green">${completed}</div>
          <div class="republic-metric__label">Completed</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${avgReward}</div>
          <div class="republic-metric__label">Avg Reward</div>
        </div>
        <div class="republic-metric republic-metric--card">
          <div class="republic-metric__value">${totalEvals}</div>
          <div class="republic-metric__label">Evaluations</div>
        </div>
        ${
          queue
            ? html`
              <div class="republic-metric republic-metric--card">
                <div class="republic-metric__value">${queue.queued}</div>
                <div class="republic-metric__label">In Queue</div>
              </div>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ─── Action Bar ───────────────────────────────────────────────────

// oxlint-disable-next-line no-unused-vars
function renderActionBar(props: ManusProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--compact republic-card--wide"
         style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
      <button type="button" class="republic-btn ${_showTrainForm ? "" : "republic-btn--secondary"} republic-btn--sm"
              style="border-radius:20px;${_showTrainForm ? "background:linear-gradient(135deg,#8b5cf6,#6366f1);box-shadow:0 2px 12px #8b5cf633" : ""}"
              @click=${() => {
                _showTrainForm = !_showTrainForm;
                _showEvalForm = false;
              }}>
        🧪 New Training Job
      </button>
      <button type="button" class="republic-btn ${_showEvalForm ? "" : "republic-btn--secondary"} republic-btn--sm"
              style="border-radius:20px;${_showEvalForm ? "background:linear-gradient(135deg,#3b82f6,#2563eb);box-shadow:0 2px 12px #3b82f633" : ""}"
              @click=${() => {
                _showEvalForm = !_showEvalForm;
                _showTrainForm = false;
              }}>
        📊 New Evaluation
      </button>
      <div style="flex:1"></div>
      <span style="font-size:0.75rem;color:var(--muted)">
        RL-based LLM agent tuning • SFT / GRPO / PPO / DPO
      </span>
    </div>
  `;
}

// ─── Training Form ────────────────────────────────────────────────

function renderTrainingForm(props: ManusProps): TemplateResult {
  const allBenchmarks: BenchmarkTask[] = ["gaia", "agentbench", "webshop", "osworld", "alfworld"];

  return html`
    <div class="republic-card republic-card--wide"
         style="border:1px solid #8b5cf633;background:linear-gradient(135deg, rgba(139,92,246,0.05), rgba(99,102,241,0.03))">
      <div class="republic-card__header">
        <h4>🧪 Configure Training Job</h4>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:12px;margin-bottom:16px">
        <!-- Method -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Training Method</label>
          <select class="republic-input" style="padding:8px 10px"
                  @change=${(e: Event) => {
                    _trainMethod = (e.target as HTMLSelectElement).value as TrainingMethod;
                  }}>
            ${(Object.keys(METHOD_LABELS) as TrainingMethod[]).map(
              (m) => html`
              <option value=${m} ?selected=${m === _trainMethod}>
                ${METHOD_LABELS[m].label} — ${METHOD_LABELS[m].desc}
              </option>
            `,
            )}
          </select>
        </div>

        <!-- Base Model -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Base Model</label>
          <input class="republic-input" type="text" .value=${_trainModel}
                 placeholder="HuggingFace model ID"
                 @input=${(e: Event) => {
                   _trainModel = (e.target as HTMLInputElement).value;
                 }} />
        </div>

        <!-- Rollout Strategy -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Rollout Strategy</label>
          <select class="republic-input" style="padding:8px 10px"
                  @change=${(e: Event) => {
                    _trainRollout = (e.target as HTMLSelectElement).value as RolloutStrategy;
                  }}>
            ${(Object.keys(ROLLOUT_LABELS) as RolloutStrategy[]).map(
              (r) => html`
              <option value=${r} ?selected=${r === _trainRollout}>${ROLLOUT_LABELS[r]}</option>
            `,
            )}
          </select>
        </div>

        <!-- Reward Type -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Reward Type</label>
          <select class="republic-input" style="padding:8px 10px"
                  @change=${(e: Event) => {
                    _trainReward = (e.target as HTMLSelectElement).value as RewardType;
                  }}>
            <option value="format" ?selected=${_trainReward === "format"}>Format</option>
            <option value="outcome" ?selected=${_trainReward === "outcome"}>Outcome</option>
            <option value="combined" ?selected=${_trainReward === "combined"}>Combined</option>
          </select>
        </div>

        <!-- Learning Rate -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Learning Rate</label>
          <input class="republic-input" type="text" .value=${_trainLr}
                 @input=${(e: Event) => {
                   _trainLr = (e.target as HTMLInputElement).value;
                 }} />
        </div>

        <!-- Batch Size -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Batch Size</label>
          <input class="republic-input" type="number" .value=${_trainBatch}
                 @input=${(e: Event) => {
                   _trainBatch = (e.target as HTMLInputElement).value;
                 }} />
        </div>

        <!-- Epochs -->
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Epochs</label>
          <input class="republic-input" type="number" .value=${_trainEpochs}
                 @input=${(e: Event) => {
                   _trainEpochs = (e.target as HTMLInputElement).value;
                 }} />
        </div>
      </div>

      <!-- Benchmarks -->
      <div style="margin-bottom:16px">
        <label style="font-size:0.75rem;color:var(--muted);font-weight:600;display:block;margin-bottom:6px">
          Evaluation Benchmarks
        </label>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${allBenchmarks.map((b) => {
            const active = _trainBenchmarks.includes(b);
            return html`
              <button type="button" class="republic-btn republic-btn--sm ${active ? "" : "republic-btn--secondary"}"
                      style="border-radius:16px;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;
                             ${active ? "background:linear-gradient(135deg,#8b5cf6,#6366f1)" : ""}"
                      @click=${() => {
                        if (active) {
                          _trainBenchmarks = _trainBenchmarks.filter((x) => x !== b);
                        } else {
                          _trainBenchmarks = [..._trainBenchmarks, b];
                        }
                      }}>
                ${b}
              </button>
            `;
          })}
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm"
                @click=${() => {
                  _showTrainForm = false;
                }}>Cancel</button>
        <button type="button" class="republic-btn republic-btn--sm"
                style="background:linear-gradient(135deg,#8b5cf6,#6366f1)"
                @click=${() => {
                  props.onStartTraining({
                    method: _trainMethod,
                    baseModel: _trainModel,
                    rolloutStrategy: _trainRollout,
                    rewardType: _trainReward,
                    learningRate: parseFloat(_trainLr) || 1e-5,
                    batchSize: parseInt(_trainBatch) || 4,
                    numEpochs: parseInt(_trainEpochs) || 3,
                    benchmarks: _trainBenchmarks,
                  });
                  _showTrainForm = false;
                }}>
          🚀 Start Training
        </button>
      </div>
    </div>
  `;
}

// ─── Evaluation Form ──────────────────────────────────────────────

function renderEvalForm(props: ManusProps): TemplateResult {
  const allBenchmarks: BenchmarkTask[] = ["gaia", "agentbench", "webshop", "osworld", "alfworld"];

  return html`
    <div class="republic-card republic-card--wide"
         style="border:1px solid #3b82f633;background:linear-gradient(135deg, rgba(59,130,246,0.05), rgba(37,99,235,0.03))">
      <div class="republic-card__header">
        <h4>📊 Configure Evaluation</h4>
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:16px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600">Model Path</label>
          <input class="republic-input" type="text" .value=${_evalModelPath}
                 placeholder="Path to trained model (e.g., output/grpo-qwen-7b)"
                 @input=${(e: Event) => {
                   _evalModelPath = (e.target as HTMLInputElement).value;
                 }}
                 style="width:100%" />
        </div>

        <div>
          <label style="font-size:0.75rem;color:var(--muted);font-weight:600;display:block;margin-bottom:6px">
            Benchmarks
          </label>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${allBenchmarks.map((b) => {
              const active = _evalBenchmarks.includes(b);
              return html`
                <button type="button" class="republic-btn republic-btn--sm ${active ? "" : "republic-btn--secondary"}"
                        style="border-radius:16px;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;
                               ${active ? "background:linear-gradient(135deg,#3b82f6,#2563eb)" : ""}"
                        @click=${() => {
                          if (active) {
                            _evalBenchmarks = _evalBenchmarks.filter((x) => x !== b);
                          } else {
                            _evalBenchmarks = [..._evalBenchmarks, b];
                          }
                        }}>
                  ${b}
                </button>
              `;
            })}
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm"
                @click=${() => {
                  _showEvalForm = false;
                }}>Cancel</button>
        <button type="button" class="republic-btn republic-btn--sm"
                style="background:linear-gradient(135deg,#3b82f6,#2563eb)"
                ?disabled=${!_evalModelPath}
                @click=${() => {
                  props.onStartEval({
                    modelPath: _evalModelPath,
                    benchmarks: _evalBenchmarks,
                  });
                  _showEvalForm = false;
                }}>
          📊 Run Evaluation
        </button>
      </div>
    </div>
  `;
}

// ─── Job Queue ────────────────────────────────────────────────────

function renderJobQueue(jobs: ManusTrainingJob[], props: ManusProps): TemplateResult {
  if (jobs.length === 0) {
    return html`
      <div class="republic-empty">
        <div class="republic-empty__icon">🤖</div>
        <h3>No Training Jobs</h3>
        <p>
          Start a new training job to begin RL-based agent tuning. Choose from SFT, GRPO, PPO, or DPO
          methods.
        </p>
      </div>
    `;
  }

  const sorted = [...jobs].toSorted((a, b) => b.createdAt - a.createdAt);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h4>⚡ Training Jobs</h4>
        <span class="republic-tag">${jobs.length} total</span>
      </div>
      <div class="republic-cards republic-cards--two">
        ${sorted.map((job) => renderJobCard(job, props))}
      </div>
    </div>
  `;
}

function renderJobCard(job: ManusTrainingJob, props: ManusProps): TemplateResult {
  const methodInfo = METHOD_LABELS[job.config.method];
  const progress = job.totalSteps > 0 ? Math.round((job.currentStep / job.totalSteps) * 100) : 0;
  const isActive = job.status === "running" || job.status === "queued";
  const expanded = _expandedJobId === job.id;

  return html`
    <div class="republic-card republic-card--compact"
         style="border-left:3px solid ${methodInfo.color};overflow:hidden;cursor:pointer;transition:box-shadow 0.2s"
         @click=${() => {
           _expandedJobId = expanded ? null : job.id;
         }}
         @mouseenter=${(e: Event) => {
           (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 30px ${methodInfo.color}15`;
         }}
         @mouseleave=${(e: Event) => {
           (e.currentTarget as HTMLElement).style.boxShadow = "";
         }}>
      <!-- Header -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="republic-tag" style="background:${methodInfo.color}22;color:${methodInfo.color};font-weight:700">
            ${methodInfo.label}
          </span>
          <span class="republic-tag republic-tag--sm" style="background:${STATUS_COLORS[job.status]}22;color:${STATUS_COLORS[job.status]}">
            ${STATUS_ICONS[job.status]} ${job.status}
          </span>
          ${
            expanded
              ? html`
                  <span style="font-size: 0.6rem; color: var(--muted); text-transform: uppercase; letter-spacing: 1px"
                    >▼ Details</span
                  >
                `
              : nothing
          }
        </div>
        ${
          isActive
            ? html`
              <button type="button" class="republic-btn republic-btn--secondary republic-btn--sm"
                      style="font-size:0.7rem;padding:2px 8px"
                      @click=${(e: Event) => {
                        e.stopPropagation();
                        props.onCancelJob(job.id);
                      }}>
                ⛔ Cancel
              </button>
            `
            : nothing
        }
      </div>

      <!-- Model info -->
      <div style="font-size:0.82rem;font-weight:600;color:var(--text-strong);margin-bottom:4px;
                  overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
           title=${job.config.baseModel}>
        ${job.config.baseModel}
      </div>
      <div style="font-size:0.72rem;color:var(--muted);margin-bottom:8px">
        ${ROLLOUT_LABELS[job.config.rolloutStrategy]} • ${job.config.rewardType} reward •
        lr=${job.config.learningRate} • batch=${job.config.batchSize}
      </div>

      <!-- Progress bar -->
      ${
        job.status === "running"
          ? html`
            <div style="margin-bottom:8px">
              <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--muted);margin-bottom:4px">
                <span>Step ${formatNumber(job.currentStep)} / ${formatNumber(job.totalSteps)}</span>
                <span>${progress}%</span>
              </div>
              <div style="height:6px;background:var(--border, #222);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,${methodInfo.color},${methodInfo.color}cc);
                            border-radius:3px;transition:width 0.5s ease"></div>
              </div>
            </div>
          `
          : nothing
      }

      <!-- Metrics -->
      <div style="display:flex;gap:12px;font-size:0.75rem">
        ${
          job.currentLoss > 0
            ? html`
              <div>
                <span style="color:var(--muted)">Loss:</span>
                <span style="color:#ef4444;font-weight:600">${job.currentLoss.toFixed(4)}</span>
              </div>
            `
            : nothing
        }
        ${
          job.currentReward > 0
            ? html`
              <div>
                <span style="color:var(--muted)">Reward:</span>
                <span style="color:#22c55e;font-weight:600">${job.currentReward.toFixed(4)}</span>
              </div>
            `
            : nothing
        }
        <div style="margin-left:auto;color:var(--muted)">
          🕐 ${formatElapsed(job.createdAt, job.completedAt)}
        </div>
      </div>

      <!-- Citizen -->
      <div style="font-size:0.7rem;color:var(--muted);margin-top:6px">
        Started by <strong>${job.citizenName}</strong>
      </div>

      <!-- Error -->
      ${
        job.error
          ? html`
            <div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:#ef444420;
                        color:#ef4444;font-size:0.72rem;font-family:monospace">
              ${job.error}
            </div>
          `
          : nothing
      }

      <!-- Output -->
      ${
        job.outputModelPath
          ? html`
            <div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:#22c55e15;
                        color:#22c55e;font-size:0.72rem">
              📦 Output: <code>${job.outputModelPath}</code>
            </div>
          `
          : nothing
      }

      <!-- Expanded Detail -->
      ${
        expanded
          ? html`
            <div style="margin-top:12px;border-top:1px solid var(--border, #222);padding-top:12px"
                 @click=${(e: Event) => e.stopPropagation()}>

              <!-- Full training config -->
              <div style="font-size:0.72rem;color:var(--muted);font-weight:600;margin-bottom:8px">Training Configuration</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.75rem;margin-bottom:12px;
                          background:var(--card-bg, #1a1a2e);padding:10px;border-radius:8px;border:1px solid var(--border, #222)">
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Method</span>
                  <span style="color:${methodInfo.color};font-weight:600">${methodInfo.label}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Base Model</span>
                  <span style="color:var(--text-strong);font-weight:600;font-size:0.7rem">${job.config.baseModel}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Rollout</span>
                  <span style="color:var(--text-strong)">${ROLLOUT_LABELS[job.config.rolloutStrategy]}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Reward Type</span>
                  <span style="color:var(--text-strong);text-transform:capitalize">${job.config.rewardType}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Learning Rate</span>
                  <code style="color:#f59e0b">${job.config.learningRate}</code>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Batch Size</span>
                  <code style="color:#f59e0b">${job.config.batchSize}</code>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Total Steps</span>
                  <span style="color:var(--text-strong)">${formatNumber(job.totalSteps)}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span style="color:var(--muted)">Benchmarks</span>
                  <span style="color:var(--text-strong);text-transform:uppercase;font-size:0.68rem">
                    ${job.config.evaluationBenchmarks.join(", ")}
                  </span>
                </div>
              </div>

              <!-- Detailed metrics -->
              <div style="font-size:0.72rem;color:var(--muted);font-weight:600;margin-bottom:8px">Training Metrics</div>
              <div style="display:flex;gap:12px;margin-bottom:12px">
                <div style="flex:1;background:var(--card-bg, #1a1a2e);padding:10px;border-radius:8px;border:1px solid var(--border, #222);text-align:center">
                  <div style="font-size:1.3rem;font-weight:800;color:#ef4444">${job.currentLoss > 0 ? job.currentLoss.toFixed(6) : "—"}</div>
                  <div style="font-size:0.68rem;color:var(--muted);margin-top:2px">Current Loss</div>
                </div>
                <div style="flex:1;background:var(--card-bg, #1a1a2e);padding:10px;border-radius:8px;border:1px solid var(--border, #222);text-align:center">
                  <div style="font-size:1.3rem;font-weight:800;color:#22c55e">${job.currentReward > 0 ? job.currentReward.toFixed(6) : "—"}</div>
                  <div style="font-size:0.68rem;color:var(--muted);margin-top:2px">Current Reward</div>
                </div>
                <div style="flex:1;background:var(--card-bg, #1a1a2e);padding:10px;border-radius:8px;border:1px solid var(--border, #222);text-align:center">
                  <div style="font-size:1.3rem;font-weight:800;color:${methodInfo.color}">${progress}%</div>
                  <div style="font-size:0.68rem;color:var(--muted);margin-top:2px">Progress</div>
                </div>
              </div>

              <!-- Job metadata -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:0.72rem">
                <div style="display:flex;justify-content:space-between;color:var(--muted)">
                  <span>Job ID</span>
                  <code style="color:${methodInfo.color}">${job.id.slice(0, 16)}…</code>
                </div>
                <div style="display:flex;justify-content:space-between;color:var(--muted)">
                  <span>Citizen ID</span>
                  <code>${job.citizenId.slice(0, 12)}…</code>
                </div>
                <div style="display:flex;justify-content:space-between;color:var(--muted)">
                  <span>Duration</span>
                  <span>${formatElapsed(job.createdAt, job.completedAt)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;color:var(--muted)">
                  <span>Step</span>
                  <span>${formatNumber(job.currentStep)} / ${formatNumber(job.totalSteps)}</span>
                </div>
              </div>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

// ─── Evaluation Results ───────────────────────────────────────────

function renderEvalResults(evals: ManusEvalJob[]): TemplateResult {
  if (evals.length === 0) {return html``;}

  const sorted = [...evals].toSorted((a, b) => b.createdAt - a.createdAt);

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h4>📊 Evaluation Results</h4>
        <span class="republic-tag">${evals.length} evaluations</span>
      </div>
      ${sorted.map(
        (ev) => html`
        <div style="margin-bottom:16px;padding:12px;border-radius:8px;background:var(--card-bg, #1a1a2e);
                    border:1px solid var(--border, #222)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div>
              <span style="font-size:0.82rem;font-weight:600;color:var(--text-strong)">${ev.modelPath}</span>
              <span class="republic-tag republic-tag--sm" style="margin-left:8px;background:${STATUS_COLORS[ev.status]}22;color:${STATUS_COLORS[ev.status]}">
                ${STATUS_ICONS[ev.status]} ${ev.status}
              </span>
            </div>
            <span style="font-size:0.72rem;color:var(--muted)">🕐 ${formatElapsed(ev.createdAt, ev.completedAt)}</span>
          </div>
          ${
            ev.results.length > 0
              ? html`
                <div class="republic-table-wrap">
                  <table class="republic-table">
                    <thead>
                      <tr>
                        <th>Benchmark</th>
                        <th>Score</th>
                        <th>Pass Rate</th>
                        <th>Tasks</th>
                        <th>Avg Steps</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${ev.results.map(
                        (r) => html`
                          <tr class="republic-table__row">
                            <td><span class="republic-tag republic-tag--sm" style="text-transform:uppercase">${r.benchmark}</span></td>
                            <td style="font-weight:700;color:${r.score > 0.7 ? "#22c55e" : r.score > 0.4 ? "#f59e0b" : "#ef4444"}">
                              ${(r.score * 100).toFixed(1)}%
                            </td>
                            <td>${(r.passRate * 100).toFixed(1)}%</td>
                            <td>${r.completedTasks}/${r.totalTasks}</td>
                            <td>${r.averageSteps.toFixed(1)}</td>
                          </tr>
                        `,
                      )}
                    </tbody>
                  </table>
                </div>
              `
              : html`
                  <div style="font-size: 0.75rem; color: var(--muted)">No results yet</div>
                `
          }
          ${
            ev.error
              ? html`<div style="margin-top:8px;padding:6px 10px;border-radius:6px;background:#ef444420;color:#ef4444;font-size:0.72rem">${ev.error}</div>`
              : nothing
          }
        </div>
      `,
      )}
    </div>
  `;
}
