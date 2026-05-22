import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface ReasoningChain {
  id: string;
  citizenId: string;
  citizenName: string;
  taskDescription: string;
  complexity: "trivial" | "moderate" | "complex" | "critical";
  depth: number;
  steps: string[];
  outcome: string;
  success: boolean;
  cached: boolean;
  budgetUsed: number;
  timestamp: string;
}

export interface ReasoningDiagnostics {
  totalChains: number;
  avgDepth: number;
  successRate: number;
  overthinkRate: number;
  cachedPatterns: number;
  complexityBreakdown: Record<string, number>;
  citizenBudgets: { citizenId: string; citizenName: string; budget: number; used: number }[];
}

export interface ReasoningProps {
  loading: boolean;
  diagnostics: ReasoningDiagnostics | null;
  recentChains: ReasoningChain[];
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, string> = {
  trivial: "#34d399",
  moderate: "#fbbf24",
  complex: "#f97316",
  critical: "#ef4444",
};

const COMPLEXITY_EMOJI: Record<string, string> = {
  trivial: "⚡",
  moderate: "🤔",
  complex: "🧩",
  critical: "🔥",
};

// ─── Render ───────────────────────────────────────────────────────

export function renderReasoning(props: ReasoningProps): TemplateResult {
  const { loading, diagnostics } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading reasoning data…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-reasoning">
      ${diagnostics ? renderReasoningKPIs(diagnostics) : nothing}
      <div class="republic-grid republic-grid--2col">
        ${diagnostics ? renderComplexityBreakdown(diagnostics) : nothing}
        ${diagnostics ? renderCitizenBudgets(diagnostics) : nothing}
      </div>
      ${renderRecentChains(props)}
    </div>`;
}

// ─── KPIs ─────────────────────────────────────────────────────────

function renderReasoningKPIs(d: ReasoningDiagnostics): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.totalChains}</div>
        <div class="republic-metric__label">Total Chains</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.avgDepth.toFixed(1)}</div>
        <div class="republic-metric__label">Avg Depth</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${(d.successRate * 100).toFixed(0)}%</div>
        <div class="republic-metric__label">Success Rate</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value" style="color:${d.overthinkRate > 0.15 ? "#f59e0b" : "#34d399"}">${(d.overthinkRate * 100).toFixed(0)}%</div>
        <div class="republic-metric__label">Overthink Rate</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.cachedPatterns}</div>
        <div class="republic-metric__label">Cached Patterns</div>
      </div>
    </div>`;
}

// ─── Complexity Breakdown ─────────────────────────────────────────

function renderComplexityBreakdown(d: ReasoningDiagnostics): TemplateResult {
  const entries = Object.entries(d.complexityBreakdown).toSorted(
    (a, b) =>
      ["trivial", "moderate", "complex", "critical"].indexOf(a[0]) -
      ["trivial", "moderate", "complex", "critical"].indexOf(b[0]),
  );
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>${icon("cpu")} Complexity Distribution</h3>
      </div>
      <div class="republic-card__body">
        ${entries.map(
          ([level, count]) => html`
            <div style="margin-bottom:0.75rem">
              <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;font-size:0.85rem">
                <span>${COMPLEXITY_EMOJI[level] ?? "●"} ${level}</span>
                <span style="color:var(--text-secondary)">${count} (${((count / total) * 100).toFixed(0)}%)</span>
              </div>
              <div class="republic-progress">
                <div class="republic-progress__bar" style="width:${(count / total) * 100}%;background:${COMPLEXITY_COLORS[level] ?? "#818cf8"}"></div>
              </div>
            </div>`,
        )}
        ${
          entries.length === 0
            ? html`
                <p class="republic-card__empty">No reasoning chains yet</p>
              `
            : nothing
        }
      </div>
    </div>`;
}

// ─── Citizen Budgets ──────────────────────────────────────────────

function renderCitizenBudgets(d: ReasoningDiagnostics): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>${icon("users")} Cognitive Budgets</h3>
        <span class="republic-badge">${d.citizenBudgets.length} citizens</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:350px;overflow-y:auto">
        ${
          d.citizenBudgets.length === 0
            ? html`
                <p class="republic-card__empty">No budget data yet</p>
              `
            : d.citizenBudgets.slice(0, 15).map(
                (b) => html`
                <div class="republic-list__item">
                  <div style="flex:1">
                    <div style="display:flex;justify-content:space-between;font-size:0.85rem">
                      <strong>${b.citizenName}</strong>
                      <span>${b.used}/${b.budget} units</span>
                    </div>
                    <div class="republic-progress" style="height:6px;margin-top:0.25rem">
                      <div class="republic-progress__bar" style="width:${(b.used / b.budget) * 100}%;background:${b.used / b.budget > 0.8 ? "#ef4444" : b.used / b.budget > 0.5 ? "#fbbf24" : "#34d399"}"></div>
                    </div>
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Recent Chains ────────────────────────────────────────────────

function renderRecentChains(props: ReasoningProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide" style="margin-top:1rem">
      <div class="republic-card__header">
        <h3>🧠 Recent Reasoning Chains</h3>
        <span class="republic-badge">${props.recentChains.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:500px;overflow-y:auto">
        ${
          props.recentChains.length === 0
            ? html`
                <p class="republic-card__empty">No reasoning chains recorded yet</p>
              `
            : props.recentChains.slice(0, 15).map(
                (c) => html`
                <div class="republic-list__item" style="flex-direction:column;align-items:stretch">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="display:flex;align-items:center;gap:0.5rem">
                      <span>${COMPLEXITY_EMOJI[c.complexity] ?? "●"}</span>
                      <strong>${c.citizenName}</strong>
                      <span class="republic-badge republic-badge--sm" style="background:${COMPLEXITY_COLORS[c.complexity]};color:white">${c.complexity}</span>
                      ${
                        c.cached
                          ? html`
                              <span class="republic-badge republic-badge--sm" style="background: #06b6d4; color: white"
                                >cached</span
                              >
                            `
                          : nothing
                      }
                    </div>
                    <span class="republic-badge" style="background:${c.success ? "#34d399" : "#ef4444"};color:white">
                      ${c.success ? "✓" : "✗"}
                    </span>
                  </div>
                  <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.25rem">
                    ${c.taskDescription.slice(0, 120)}
                  </div>
                  <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap">
                    ${c.steps.map(
                      (step, i) => html`
                        <span style="font-size:0.75rem;padding:0.15rem 0.5rem;background:var(--bg-secondary);border-radius:12px">
                          ${i + 1}. ${step.slice(0, 30)}${step.length > 30 ? "…" : ""}
                        </span>`,
                    )}
                  </div>
                  <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">
                    Depth: ${c.depth} · Budget: ${c.budgetUsed} units
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}
