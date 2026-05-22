import { html, nothing, type TemplateResult } from "lit";
import { icon as _icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface PlotThread {
  id: string;
  title: string;
  type: string;
  tension: number;
  stage: "setup" | "rising" | "climax" | "falling" | "resolution";
  events: string[];
  resolved: boolean;
}

export interface StoryArc {
  citizenId: string;
  citizenName: string;
  arcType: string;
  characterArc: string;
  chapter: number;
  keyMoments: string[];
}

export interface NarrativeDiagnostics {
  activeThreads: number;
  resolvedThreads: number;
  dramaticTension: number;
  tensionTrend: string;
  trackedArcs: number;
  threadBreakdown: { type: string; count: number }[];
}

export interface NarrativeProps {
  loading: boolean;
  diagnostics: NarrativeDiagnostics | null;
  activeThreads: PlotThread[];
  characterArcs: StoryArc[];
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  setup: "#94a3b8",
  rising: "#fbbf24",
  climax: "#ef4444",
  falling: "#818cf8",
  resolution: "#34d399",
};

const STAGE_EMOJI: Record<string, string> = {
  setup: "📋",
  rising: "📈",
  climax: "⚡",
  falling: "📉",
  resolution: "✅",
};

const TYPE_EMOJI: Record<string, string> = {
  rivalry: "⚔️",
  alliance: "🤝",
  discovery: "🔍",
  crisis: "🚨",
  romance: "💕",
  mystery: "🔮",
  revolution: "✊",
};

const ARC_EMOJI: Record<string, string> = {
  "heros-journey": "🦸",
  "rags-to-riches": "💰",
  tragedy: "😢",
  comedy: "😄",
  rebirth: "🌅",
  quest: "🧭",
  "voyage-and-return": "🚀",
};

function tensionColor(level: number): string {
  if (level < 25) {
    return "#34d399";
  }
  if (level < 50) {
    return "#fbbf24";
  }
  if (level < 75) {
    return "#f97316";
  }
  return "#ef4444";
}

// ─── Render ───────────────────────────────────────────────────────

export function renderNarrative(props: NarrativeProps): TemplateResult {
  const { loading, diagnostics } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading narrative data…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-narrative">
      ${diagnostics ? renderTensionGauge(diagnostics) : nothing}
      ${diagnostics ? renderNarrativeKPIs(diagnostics) : nothing}
      <div class="republic-grid republic-grid--2col">
        ${renderPlotThreads(props)}
        ${renderCharacterArcs(props)}
      </div>
      ${diagnostics ? renderThreadBreakdown(diagnostics) : nothing}
    </div>`;
}

// ─── Tension Gauge ────────────────────────────────────────────────

function renderTensionGauge(d: NarrativeDiagnostics): TemplateResult {
  const color = tensionColor(d.dramaticTension);
  const trendIcon = d.tensionTrend === "rising" ? "📈" : d.tensionTrend === "falling" ? "📉" : "➡️";
  return html`
    <div class="republic-card republic-card--wide" style="margin-bottom:1rem">
      <div class="republic-card__header">
        <h3>🎭 Dramatic Tension</h3>
        <span class="republic-hero__badge" style="background:${color};color:white">
          ${trendIcon} ${d.dramaticTension.toFixed(0)}% — ${d.tensionTrend}
        </span>
      </div>
      <div style="padding:0.5rem 0">
        <div class="republic-progress" style="height:12px">
          <div class="republic-progress__bar" style="width:${d.dramaticTension}%;background:${color};transition:width 0.5s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">
          <span>Calm</span><span>Tense</span><span>Crisis</span>
        </div>
      </div>
    </div>`;
}

// ─── KPIs ─────────────────────────────────────────────────────────

function renderNarrativeKPIs(d: NarrativeDiagnostics): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.activeThreads}</div>
        <div class="republic-metric__label">Active Plots</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.resolvedThreads}</div>
        <div class="republic-metric__label">Resolved Plots</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.trackedArcs}</div>
        <div class="republic-metric__label">Character Arcs</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.threadBreakdown.length}</div>
        <div class="republic-metric__label">Thread Types</div>
      </div>
    </div>`;
}

// ─── Plot Threads ─────────────────────────────────────────────────

function renderPlotThreads(props: NarrativeProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>📖 Active Plot Threads</h3>
        <span class="republic-badge">${props.activeThreads.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:450px;overflow-y:auto">
        ${
          props.activeThreads.length === 0
            ? html`
                <p class="republic-card__empty">No active plot threads</p>
              `
            : props.activeThreads.map(
                (t) => html`
                <div class="republic-list__item" style="flex-direction:column;align-items:stretch">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="display:flex;align-items:center;gap:0.5rem">
                      <span>${TYPE_EMOJI[t.type] ?? "📎"}</span>
                      <strong style="font-size:0.9rem">${t.title}</strong>
                    </div>
                    <span class="republic-badge" style="background:${STAGE_COLORS[t.stage] ?? "#6366f1"};color:white">
                      ${STAGE_EMOJI[t.stage] ?? "●"} ${t.stage}
                    </span>
                  </div>
                  <div style="margin-top:0.5rem">
                    <div class="republic-progress" style="height:6px">
                      <div class="republic-progress__bar" style="width:${t.tension}%;background:${tensionColor(t.tension)}"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">
                      <span>${t.type}</span>
                      <span>Tension: ${t.tension.toFixed(0)}%</span>
                    </div>
                  </div>
                  ${
                    t.events.length > 0
                      ? html`<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;font-style:italic">
                        ${t.events[t.events.length - 1]}
                      </div>`
                      : nothing
                  }
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Character Arcs ───────────────────────────────────────────────

function renderCharacterArcs(props: NarrativeProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>🎭 Character Arcs</h3>
        <span class="republic-badge">${props.characterArcs.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:450px;overflow-y:auto">
        ${
          props.characterArcs.length === 0
            ? html`
                <p class="republic-card__empty">No character arcs tracked yet</p>
              `
            : props.characterArcs.slice(0, 20).map(
                (a) => html`
                <div class="republic-list__item">
                  <span style="font-size:1.2rem">${ARC_EMOJI[a.arcType] ?? "📚"}</span>
                  <div style="flex:1">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                      <strong>${a.citizenName}</strong>
                      <span class="republic-badge republic-badge--sm">${a.characterArc}</span>
                    </div>
                    <div style="font-size:0.8rem;color:var(--text-secondary)">
                      ${a.arcType.replace(/-/g, " ")} · Chapter ${a.chapter}/7
                    </div>
                    <div class="republic-progress" style="height:4px;margin-top:0.25rem">
                      <div class="republic-progress__bar" style="width:${(a.chapter / 7) * 100}%;background:#818cf8"></div>
                    </div>
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Thread Breakdown ─────────────────────────────────────────────

function renderThreadBreakdown(d: NarrativeDiagnostics): TemplateResult {
  if (d.threadBreakdown.length === 0) {
    return html``;
  }
  const total = d.threadBreakdown.reduce((s, e) => s + e.count, 0) || 1;
  return html`
    <div class="republic-card republic-card--wide" style="margin-top:1rem">
      <div class="republic-card__header">
        <h3>📊 Thread Types</h3>
      </div>
      <div class="republic-card__body">
        <div style="display:flex;gap:1rem;flex-wrap:wrap">
          ${d.threadBreakdown.map(
            (b) => html`
              <div style="text-align:center;min-width:80px">
                <div style="font-size:1.5rem">${TYPE_EMOJI[b.type] ?? "📎"}</div>
                <div style="font-size:1.2rem;font-weight:700">${b.count}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary)">${b.type}</div>
                <div class="republic-progress" style="height:4px;margin-top:0.25rem">
                  <div class="republic-progress__bar" style="width:${(b.count / total) * 100}%;background:#818cf8"></div>
                </div>
              </div>`,
          )}
        </div>
      </div>
    </div>`;
}
