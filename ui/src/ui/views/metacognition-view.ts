import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface MetacognitionDiagnostics {
  totalReflections: number;
  avgConfidence: number;
  avgReasoningScore: number;
  citizensMonitored: number;
  topStrategies: { strategy: string; count: number }[];
}

export interface IntrospectionEntry {
  id: string;
  citizenId: string;
  citizenName: string;
  type: "reflection" | "insight" | "doubt" | "epiphany" | "calibration";
  content: string;
  cognitiveLoad: number;
  confidence: number;
  timestamp: string;
}

interface CognitiveLoad {
  citizenId: string;
  currentLoad: number;
  maxCapacity: number;
  fatigue: number;
  decisionsThisTick: number;
}

export interface CitizenMetacognition {
  calibrationScore: number;
  cognitiveLoad?: CognitiveLoad;
  topUncertainties: { topic: string; certainty: number }[];
  recentReflections: IntrospectionEntry[];
}

export interface MetacognitionProps {
  loading: boolean;
  diagnostics: MetacognitionDiagnostics | null;
  recentJournals: IntrospectionEntry[];
  selectedCitizenId: string | null;
  citizenDetail: CitizenMetacognition | null;
  onSelectCitizen: (id: string | null) => void;
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

function pctBar(value: number, color: string, label?: string): TemplateResult {
  return html`
    <div class="republic-progress">
      <div class="republic-progress__bar" style="width:${Math.round(value * 100)}%;background:${color}"></div>
      ${label ? html`<span class="republic-progress__label">${label}</span>` : nothing}
    </div>`;
}

const TYPE_EMOJI: Record<string, string> = {
  reflection: "🪞",
  insight: "💡",
  doubt: "🤔",
  epiphany: "✨",
  calibration: "📊",
};

const STRATEGY_COLORS: Record<string, string> = {
  "peer-review": "#818cf8",
  "consult-knowledge-graph": "#34d399",
  "request-mentorship": "#f59e0b",
  "pause-and-reflect": "#f472b6",
  "decompose-problem": "#06b6d4",
  "seek-second-opinion": "#a78bfa",
};

// ─── Render ───────────────────────────────────────────────────────

export function renderMetacognition(props: MetacognitionProps): TemplateResult {
  const { loading, diagnostics } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading metacognition data…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-metacognition">
      ${diagnostics ? renderKPIs(diagnostics) : nothing}
      <div class="republic-grid republic-grid--2col">
        ${diagnostics ? renderStrategyDistribution(diagnostics) : nothing}
        ${renderJournalFeed(props)}
      </div>
      ${props.citizenDetail ? renderCitizenCognitive(props) : nothing}
    </div>`;
}

// ─── KPI Cards ────────────────────────────────────────────────────

function renderKPIs(d: MetacognitionDiagnostics): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${(d.avgConfidence * 100).toFixed(0)}%</div>
        <div class="republic-metric__label">Avg Confidence</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${(d.avgReasoningScore * 100).toFixed(0)}%</div>
        <div class="republic-metric__label">Reasoning Quality</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.citizensMonitored}</div>
        <div class="republic-metric__label">Citizens Monitored</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.totalReflections}</div>
        <div class="republic-metric__label">Total Reflections</div>
      </div>
    </div>`;
}

// ─── Strategy Distribution ────────────────────────────────────────

function renderStrategyDistribution(d: MetacognitionDiagnostics): TemplateResult {
  const total = d.topStrategies.reduce((s, e) => s + e.count, 0) || 1;
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>${icon("brain")} Strategy Distribution</h3>
      </div>
      <div class="republic-card__body">
        ${
          d.topStrategies.length === 0
            ? html`
                <p class="republic-card__empty">No strategies used yet</p>
              `
            : d.topStrategies.map(
                (s) => html`
                <div style="margin-bottom:0.75rem">
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;font-size:0.85rem">
                    <span>${s.strategy.replace(/-/g, " ")}</span>
                    <span style="color:var(--text-secondary)">${s.count}×</span>
                  </div>
                  ${pctBar(s.count / total, STRATEGY_COLORS[s.strategy] ?? "#6366f1")}
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Journal Feed ─────────────────────────────────────────────────

function renderJournalFeed(props: MetacognitionProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>${icon("book")} Introspection Feed</h3>
        <span class="republic-badge">${props.recentJournals.length} entries</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:400px;overflow-y:auto">
        ${
          props.recentJournals.length === 0
            ? html`
                <p class="republic-card__empty">No journal entries yet</p>
              `
            : props.recentJournals.slice(0, 20).map(
                (j) => html`
                <div class="republic-list__item" style="cursor:pointer"
                     @click=${() => props.onSelectCitizen(j.citizenId)}>
                  <div>
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
                      <span>${TYPE_EMOJI[j.type] ?? "📝"}</span>
                      <strong>${j.citizenName}</strong>
                      <span class="republic-badge republic-badge--sm">${j.type}</span>
                    </div>
                    <p style="font-size:0.85rem;color:var(--text-secondary);margin:0">${j.content.slice(0, 120)}${j.content.length > 120 ? "…" : ""}</p>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">
                      Load: ${j.cognitiveLoad}% · Conf: ${(j.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Citizen Cognitive Panel ──────────────────────────────────────

function renderCitizenCognitive(props: MetacognitionProps): TemplateResult {
  const { citizenDetail: d } = props;
  if (!d) {return html``;}

  return html`
    <div class="republic-card republic-card--wide" style="margin-top:1rem">
      <div class="republic-card__header">
        <h3>🪞 Citizen Cognitive Profile</h3>
        <button type="button" class="republic-btn republic-btn--sm" @click=${() => props.onSelectCitizen(null)}>✕ Close</button>
      </div>
      <div class="republic-card__body">
        <div class="republic-metrics republic-metrics--grid">
          <div class="republic-metric republic-metric--card">
            <div class="republic-metric__value">${(d.calibrationScore * 100).toFixed(0)}%</div>
            <div class="republic-metric__label">Calibration</div>
          </div>
          <div class="republic-metric republic-metric--card">
            <div class="republic-metric__value">${d.cognitiveLoad?.fatigue ? (d.cognitiveLoad.fatigue * 100).toFixed(0) + "%" : "N/A"}</div>
            <div class="republic-metric__label">Fatigue</div>
          </div>
          <div class="republic-metric republic-metric--card">
            <div class="republic-metric__value">${d.cognitiveLoad?.currentLoad ?? "N/A"}</div>
            <div class="republic-metric__label">Cognitive Load</div>
          </div>
        </div>

        ${
          d.topUncertainties.length > 0
            ? html`
            <h4 style="margin:1rem 0 0.5rem">Top Uncertainties</h4>
            ${d.topUncertainties.map(
              (u) => html`
                <div style="margin-bottom:0.5rem">
                  <div style="display:flex;justify-content:space-between;font-size:0.85rem">
                    <span>${u.topic}</span>
                    <span>${(u.certainty * 100).toFixed(0)}% certain</span>
                  </div>
                  ${pctBar(u.certainty, u.certainty > 0.5 ? "#34d399" : "#f59e0b")}
                </div>`,
            )}`
            : nothing
        }

        ${
          d.recentReflections.length > 0
            ? html`
            <h4 style="margin:1rem 0 0.5rem">Recent Reflections</h4>
            ${d.recentReflections.map(
              (r) => html`
                <div class="republic-list__item">
                  <span>${TYPE_EMOJI[r.type] ?? "📝"}</span>
                  <p style="font-size:0.85rem;margin:0">${r.content.slice(0, 200)}</p>
                </div>`,
            )}`
            : nothing
        }
      </div>
    </div>`;
}
