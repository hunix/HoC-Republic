import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

type DreamType =
  | "counterfactual"
  | "aspirational"
  | "nightmare"
  | "precognitive"
  | "surreal"
  | "memory-replay";

export interface Dream {
  id: string;
  citizenId: string;
  citizenName: string;
  type: DreamType;
  narrative: string;
  insight: string | null;
  emotionalImpact: number;
  vividness: number;
  shared: boolean;
}

export interface DreamDiagnostics {
  totalDreams: number;
  sharedDreams: number;
  dreamersTracked: number;
  typeBreakdown: Record<string, number>;
  avgVividness: number;
  nightmareRate: number;
}

export interface DreamsProps {
  loading: boolean;
  diagnostics: DreamDiagnostics | null;
  sharedDreams: Dream[];
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const DREAM_EMOJI: Record<DreamType, string> = {
  counterfactual: "🔀",
  aspirational: "✨",
  nightmare: "😱",
  precognitive: "🔮",
  surreal: "🌀",
  "memory-replay": "📼",
};

const DREAM_COLORS: Record<DreamType, string> = {
  counterfactual: "#6366f1",
  aspirational: "#34d399",
  nightmare: "#ef4444",
  precognitive: "#a855f7",
  surreal: "#06b6d4",
  "memory-replay": "#f59e0b",
};

// ─── Render ───────────────────────────────────────────────────────

export function renderDreams(props: DreamsProps): TemplateResult {
  const { loading, diagnostics } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading dream data…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-dreams">
      ${diagnostics ? renderDreamKPIs(diagnostics) : nothing}
      <div class="republic-grid republic-grid--2col">
        ${diagnostics ? renderDreamTypes(diagnostics) : nothing}
        ${renderNightmareGauge(diagnostics)}
      </div>
      ${renderSharedDreamBoard(props)}
    </div>`;
}

// ─── KPIs ─────────────────────────────────────────────────────────

function renderDreamKPIs(d: DreamDiagnostics): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.totalDreams}</div>
        <div class="republic-metric__label">Total Dreams</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.sharedDreams}</div>
        <div class="republic-metric__label">Shared Dreams</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.dreamersTracked}</div>
        <div class="republic-metric__label">Active Dreamers</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${(d.avgVividness * 100).toFixed(0)}%</div>
        <div class="republic-metric__label">Avg Vividness</div>
      </div>
    </div>`;
}

// ─── Dream Type Distribution ──────────────────────────────────────

function renderDreamTypes(d: DreamDiagnostics): TemplateResult {
  const entries = Object.entries(d.typeBreakdown).toSorted((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>${icon("brain")} Dream Types</h3>
      </div>
      <div class="republic-card__body">
        ${
          entries.length === 0
            ? html`
                <p class="republic-card__empty">No dreams yet</p>
              `
            : entries.map(
                ([type, count]) => html`
                <div style="margin-bottom:0.75rem">
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;font-size:0.85rem">
                    <span>${DREAM_EMOJI[type as DreamType] ?? "💭"} ${type.replace(/-/g, " ")}</span>
                    <span style="color:var(--text-secondary)">${count} (${((count / total) * 100).toFixed(0)}%)</span>
                  </div>
                  <div class="republic-progress">
                    <div class="republic-progress__bar" style="width:${(count / total) * 100}%;background:${DREAM_COLORS[type as DreamType] ?? "#818cf8"}"></div>
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Nightmare Gauge ──────────────────────────────────────────────

function renderNightmareGauge(d: DreamDiagnostics | null): TemplateResult {
  const rate = d?.nightmareRate ?? 0;
  const color = rate < 0.15 ? "#34d399" : rate < 0.3 ? "#fbbf24" : "#ef4444";
  const label = rate < 0.15 ? "Peaceful" : rate < 0.3 ? "Moderate Anxiety" : "High Stress";
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>😱 Nightmare Index</h3>
        <span class="republic-badge" style="background:${color};color:white">${label}</span>
      </div>
      <div class="republic-card__body" style="text-align:center;padding:1rem 0">
        <div style="font-size:3rem;font-weight:800;color:${color}">${(rate * 100).toFixed(0)}%</div>
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.5rem">
          ${rate < 0.15 ? "Citizens are sleeping peacefully" : rate < 0.3 ? "Some citizens experience anxiety dreams" : "Many citizens are having nightmares — check stress levels"}
        </div>
        <div class="republic-progress" style="margin-top:1rem;height:8px">
          <div class="republic-progress__bar" style="width:${rate * 100}%;background:${color}"></div>
        </div>
      </div>
    </div>`;
}

// ─── Shared Dream Board ───────────────────────────────────────────

function renderSharedDreamBoard(props: DreamsProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide" style="margin-top:1rem">
      <div class="republic-card__header">
        <h3>💭 Shared Dream Board</h3>
        <span class="republic-badge">${props.sharedDreams.length}</span>
      </div>
      <div class="republic-card__body">
        ${
          props.sharedDreams.length === 0
            ? html`
                <p class="republic-card__empty">No dreams have been shared yet</p>
              `
            : html`
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
              ${props.sharedDreams.slice(0, 12).map(
                (d) => html`
                  <div class="republic-card" style="border-left:3px solid ${DREAM_COLORS[d.type] ?? "#818cf8"};margin:0">
                    <div style="padding:0.75rem">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                        <strong>${DREAM_EMOJI[d.type]} ${d.citizenName}</strong>
                        <span class="republic-badge republic-badge--sm">${d.type}</span>
                      </div>
                      <p style="font-size:0.85rem;color:var(--text-secondary);margin:0">${d.narrative.slice(0, 150)}${d.narrative.length > 150 ? "…" : ""}</p>
                      ${
                        d.insight
                          ? html`<div style="margin-top:0.5rem;padding:0.5rem;background:var(--bg-secondary);border-radius:6px;font-size:0.8rem;font-style:italic">
                            💡 ${d.insight}
                          </div>`
                          : nothing
                      }
                      <div style="display:flex;gap:0.75rem;margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted)">
                        <span>Vividness: ${(d.vividness * 100).toFixed(0)}%</span>
                        <span>Impact: ${d.emotionalImpact >= 0 ? "+" : ""}${(d.emotionalImpact * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>`,
              )}
            </div>`
        }
      </div>
    </div>`;
}
