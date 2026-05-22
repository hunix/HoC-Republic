import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface ChaosEvent {
  id: string;
  type: string;
  severity: number;
  description: string;
  resolved: boolean;
  startedAt: string;
  resolvedAt: string | null;
}

export interface StressResponse {
  citizenId: string;
  citizenName: string;
  classification: "fragile" | "robust" | "antifragile";
  stressScore: number;
  recoveryRate: number;
}

export interface RedundancyPlan {
  id: string;
  name: string;
  description: string;
  source: string;
  effectiveness: number;
}

export interface AntifragilityDiagnostics {
  antifragilityScore: number;
  totalChaosEvents: number;
  activeCrises: number;
  resolvedCrises: number;
  citizenClassification: { fragile: number; robust: number; antifragile: number };
  innovationBoost: number;
  hardeningBonuses: number;
}

export interface ResilienceProps {
  loading: boolean;
  diagnostics: AntifragilityDiagnostics | null;
  activeCrises: ChaosEvent[];
  stressResponses: StressResponse[];
  redundancyPlans: RedundancyPlan[];
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  fragile: "#ef4444",
  robust: "#fbbf24",
  antifragile: "#34d399",
};

const CLASS_EMOJI: Record<string, string> = {
  fragile: "🥛",
  robust: "🪨",
  antifragile: "💪",
};

const CHAOS_EMOJI: Record<string, string> = {
  "resource-shortage": "📦",
  "trust-crisis": "🤝",
  "market-crash": "📉",
  "communication-failure": "📡",
  "leader-absence": "👤",
  "innovation-drought": "💡",
  "energy-blackout": "⚡",
  "population-surge": "👥",
};

function scoreColor(score: number): string {
  if (score < 30) {
    return "#ef4444";
  }
  if (score < 60) {
    return "#fbbf24";
  }
  return "#34d399";
}

function scoreLabel(score: number): string {
  if (score < 20) {
    return "Fragile";
  }
  if (score < 40) {
    return "Vulnerable";
  }
  if (score < 60) {
    return "Robust";
  }
  if (score < 80) {
    return "Resilient";
  }
  return "Antifragile";
}

// ─── Render ───────────────────────────────────────────────────────

export function renderResilience(props: ResilienceProps): TemplateResult {
  const { loading, diagnostics } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading resilience data…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-resilience">
      ${diagnostics ? renderAntifragilityGauge(diagnostics) : nothing}
      ${diagnostics ? renderResilienceKPIs(diagnostics) : nothing}
      <div class="republic-grid republic-grid--2col">
        ${renderActiveCrises(props)}
        ${diagnostics ? renderClassificationBreakdown(diagnostics, props.stressResponses) : nothing}
      </div>
      ${renderRedundancyPlans(props)}
    </div>`;
}

// ─── Antifragility Score ──────────────────────────────────────────

function renderAntifragilityGauge(d: AntifragilityDiagnostics): TemplateResult {
  const color = scoreColor(d.antifragilityScore);
  const label = scoreLabel(d.antifragilityScore);
  return html`
    <div class="republic-card republic-card--wide" style="margin-bottom:1rem">
      <div class="republic-card__header">
        <h3>🌪️ Antifragility Index</h3>
        <span class="republic-hero__badge" style="background:${color};color:white">${label}</span>
      </div>
      <div style="text-align:center;padding:1rem 0">
        <div style="font-size:4rem;font-weight:900;color:${color}">${d.antifragilityScore.toFixed(0)}</div>
        <div style="font-size:0.85rem;color:var(--text-secondary)">Civilization Antifragility Score (0–100)</div>
        <div class="republic-progress" style="margin-top:1rem;height:10px">
          <div class="republic-progress__bar" style="width:${d.antifragilityScore}%;background:${color};transition:width 0.5s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">
          <span>Fragile</span><span>Robust</span><span>Antifragile</span>
        </div>
      </div>
    </div>`;
}

// ─── KPIs ─────────────────────────────────────────────────────────

function renderResilienceKPIs(d: AntifragilityDiagnostics): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.totalChaosEvents}</div>
        <div class="republic-metric__label">Chaos Events</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value" style="color:${d.activeCrises > 0 ? "#ef4444" : "#34d399"}">${d.activeCrises}</div>
        <div class="republic-metric__label">Active Crises</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.resolvedCrises}</div>
        <div class="republic-metric__label">Resolved Crises</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">+${(d.innovationBoost * 100).toFixed(0)}%</div>
        <div class="republic-metric__label">Innovation Boost</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.hardeningBonuses}</div>
        <div class="republic-metric__label">Hardening Bonuses</div>
      </div>
    </div>`;
}

// ─── Active Crises ────────────────────────────────────────────────

function renderActiveCrises(props: ResilienceProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>🚨 Active Crises</h3>
        <span class="republic-badge" style="background:${props.activeCrises.length > 0 ? "#ef4444" : "#34d399"};color:white">${props.activeCrises.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:350px;overflow-y:auto">
        ${
          props.activeCrises.length === 0
            ? html`
                <p class="republic-card__empty" style="color: #34d399">
                  ✓ No active crises — the Republic is stable
                </p>
              `
            : props.activeCrises.map(
                (c) => html`
                <div class="republic-list__item" style="border-left:3px solid ${c.severity > 0.7 ? "#ef4444" : c.severity > 0.4 ? "#f59e0b" : "#fbbf24"};padding-left:0.75rem">
                  <div>
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
                      <span>${CHAOS_EMOJI[c.type] ?? "⚠️"}</span>
                      <strong>${c.type.replace(/-/g, " ")}</strong>
                      <span class="republic-badge republic-badge--sm" style="background:${c.severity > 0.7 ? "#ef4444" : "#f59e0b"};color:white">
                        Sev: ${(c.severity * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-secondary)">${c.description}</div>
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Classification Breakdown ─────────────────────────────────────

function renderClassificationBreakdown(
  d: AntifragilityDiagnostics,
  responses: StressResponse[],
): TemplateResult {
  const total =
    d.citizenClassification.fragile +
      d.citizenClassification.robust +
      d.citizenClassification.antifragile || 1;
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>${icon("shield")} Citizen Resilience</h3>
      </div>
      <div class="republic-card__body">
        <!-- Classification bars -->
        ${(["fragile", "robust", "antifragile"] as const).map(
          (cls) => html`
            <div style="margin-bottom:0.75rem">
              <div style="display:flex;justify-content:space-between;font-size:0.85rem;margin-bottom:0.25rem">
                <span>${CLASS_EMOJI[cls]} ${cls}</span>
                <span>${d.citizenClassification[cls]} (${((d.citizenClassification[cls] / total) * 100).toFixed(0)}%)</span>
              </div>
              <div class="republic-progress" style="height:8px">
                <div class="republic-progress__bar" style="width:${(d.citizenClassification[cls] / total) * 100}%;background:${CLASS_COLORS[cls]}"></div>
              </div>
            </div>`,
        )}

        <!-- Top stress responses -->
        ${
          responses.length > 0
            ? html`
            <h4 style="margin:1rem 0 0.5rem;font-size:0.85rem">Top Stress Responders</h4>
            ${responses.slice(0, 5).map(
              (r) => html`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.25rem 0;font-size:0.85rem">
                  <span>${CLASS_EMOJI[r.classification]} ${r.citizenName}</span>
                  <span class="republic-badge republic-badge--sm" style="background:${CLASS_COLORS[r.classification]};color:white">${r.classification}</span>
                </div>`,
            )}`
            : nothing
        }
      </div>
    </div>`;
}

// ─── Redundancy Plans ─────────────────────────────────────────────

function renderRedundancyPlans(props: ResilienceProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide" style="margin-top:1rem">
      <div class="republic-card__header">
        <h3>🔄 Redundancy Plans</h3>
        <span class="republic-badge">${props.redundancyPlans.length}</span>
      </div>
      <div class="republic-card__body">
        ${
          props.redundancyPlans.length === 0
            ? html`
                <p class="republic-card__empty">No redundancy plans evolved yet</p>
              `
            : html`
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:1rem">
              ${props.redundancyPlans.slice(0, 8).map(
                (p) => html`
                  <div class="republic-card" style="margin:0;border-left:3px solid ${p.effectiveness > 0.7 ? "#34d399" : "#fbbf24"}">
                    <div style="padding:0.75rem">
                      <strong style="font-size:0.9rem">${p.name}</strong>
                      <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem">${p.description}</div>
                      <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">
                        <span>From: ${p.source}</span>
                        <span>Eff: ${(p.effectiveness * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>`,
              )}
            </div>`
        }
      </div>
    </div>`;
}
