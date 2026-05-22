import { html, nothing, type TemplateResult } from "lit";
import { icon as _icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface Contract {
  id: string;
  type: string;
  partyNames: string[];
  terms: string;
  benefit: string;
  status: string;
  expiresAtTick: number;
  renewals: number;
}

export interface SocialNorm {
  id: string;
  name: string;
  description: string;
  strength: number;
  compliance: number;
  category: string;
}

export interface Treaty {
  id: string;
  title: string;
  signatoryNames: string[];
  articles: string[];
  status: string;
  enforcementMechanism: string;
}

export interface NormBreach {
  id: string;
  violatorName: string;
  description: string;
  consequence: string;
  reputationPenalty: number;
  timestamp: string;
}

export interface ProtocolDiagnostics {
  activeContracts: number;
  totalNorms: number;
  activeTreaties: number;
  totalBreaches: number;
  avgNormStrength: number;
  contractTypes: Record<string, number>;
}

export interface DiplomacyProps {
  loading: boolean;
  diagnostics: ProtocolDiagnostics | null;
  contracts: Contract[];
  norms: SocialNorm[];
  treaties: Treaty[];
  breaches: NormBreach[];
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const CONTRACT_EMOJI: Record<string, string> = {
  "trade-deal": "💱",
  "research-partnership": "🔬",
  "non-aggression": "🕊️",
  "knowledge-sharing": "📚",
  "mentorship-agreement": "👥",
  "resource-pooling": "🏗️",
  "creative-collaboration": "🎨",
};

const NORM_COLORS: Record<string, string> = {
  greeting: "#34d399",
  trade: "#f59e0b",
  conflict: "#ef4444",
  collaboration: "#818cf8",
  governance: "#06b6d4",
  creative: "#a855f7",
};

// ─── Render ───────────────────────────────────────────────────────

export function renderDiplomacy(props: DiplomacyProps): TemplateResult {
  const { loading, diagnostics } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading diplomacy data…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-diplomacy">
      ${diagnostics ? renderDiplomacyKPIs(diagnostics) : nothing}
      <div class="republic-grid republic-grid--2col">
        ${renderContractTable(props)}
        ${renderNormsList(props)}
      </div>
      <div class="republic-grid republic-grid--2col" style="margin-top:1rem">
        ${renderTreatyCards(props)}
        ${renderBreachFeed(props)}
      </div>
    </div>`;
}

// ─── KPIs ─────────────────────────────────────────────────────────

function renderDiplomacyKPIs(d: ProtocolDiagnostics): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.activeContracts}</div>
        <div class="republic-metric__label">Active Contracts</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.totalNorms}</div>
        <div class="republic-metric__label">Social Norms</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.activeTreaties}</div>
        <div class="republic-metric__label">Active Treaties</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.totalBreaches}</div>
        <div class="republic-metric__label">Total Breaches</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.avgNormStrength.toFixed(0)}</div>
        <div class="republic-metric__label">Avg Norm Strength</div>
      </div>
    </div>`;
}

// ─── Contract Table ───────────────────────────────────────────────

function renderContractTable(props: DiplomacyProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>📜 Active Contracts</h3>
        <span class="republic-badge">${props.contracts.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:400px;overflow-y:auto">
        ${
          props.contracts.length === 0
            ? html`
                <p class="republic-card__empty">No active contracts</p>
              `
            : props.contracts.map(
                (c) => html`
                <div class="republic-list__item" style="flex-direction:column;align-items:stretch">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="display:flex;align-items:center;gap:0.5rem">
                      <span>${CONTRACT_EMOJI[c.type] ?? "📝"}</span>
                      <strong style="font-size:0.9rem">${c.type.replace(/-/g, " ")}</strong>
                    </div>
                    <span class="republic-badge republic-badge--sm" style="background:${c.status === "active" ? "#34d399" : "#94a3b8"};color:white">${c.status}</span>
                  </div>
                  <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.25rem">
                    ${c.partyNames.join(" & ")}
                  </div>
                  <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem">
                    ${c.benefit} · ${c.renewals > 0 ? `${c.renewals} renewals` : "original"}
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Social Norms ─────────────────────────────────────────────────

function renderNormsList(props: DiplomacyProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>⚖️ Social Norms</h3>
        <span class="republic-badge">${props.norms.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:400px;overflow-y:auto">
        ${
          props.norms.length === 0
            ? html`
                <p class="republic-card__empty">No social norms emerged yet</p>
              `
            : props.norms.map(
                (n) => html`
                <div class="republic-list__item" style="flex-direction:column;align-items:stretch">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <strong>${n.name}</strong>
                    <span class="republic-badge republic-badge--sm" style="background:${NORM_COLORS[n.category] ?? "#818cf8"};color:white">${n.category}</span>
                  </div>
                  <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.25rem">${n.description}</div>
                  <div style="margin-top:0.5rem">
                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted)">
                      <span>Strength</span>
                      <span>${n.strength.toFixed(0)}/100</span>
                    </div>
                    <div class="republic-progress" style="height:6px">
                      <div class="republic-progress__bar" style="width:${n.strength}%;background:${n.strength > 60 ? "#34d399" : n.strength > 30 ? "#fbbf24" : "#ef4444"}"></div>
                    </div>
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Treaty Cards ─────────────────────────────────────────────────

function renderTreatyCards(props: DiplomacyProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>🏛️ Treaties</h3>
        <span class="republic-badge">${props.treaties.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:350px;overflow-y:auto">
        ${
          props.treaties.length === 0
            ? html`
                <p class="republic-card__empty">No treaties ratified yet</p>
              `
            : props.treaties.map(
                (t) => html`
                <div class="republic-list__item" style="flex-direction:column;align-items:stretch;border-left:3px solid #818cf8;padding-left:0.75rem">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <strong>${t.title}</strong>
                    <span class="republic-badge republic-badge--sm" style="background:${t.status === "active" ? "#34d399" : "#94a3b8"};color:white">${t.status}</span>
                  </div>
                  <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.25rem">
                    ${t.signatoryNames.slice(0, 3).join(", ")}${t.signatoryNames.length > 3 ? ` +${t.signatoryNames.length - 3} more` : ""}
                  </div>
                  <div style="margin-top:0.25rem;font-size:0.8rem;color:var(--text-muted)">
                    ${t.articles.length} articles · Enforced by: ${t.enforcementMechanism}
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}

// ─── Breach Feed ──────────────────────────────────────────────────

function renderBreachFeed(props: DiplomacyProps): TemplateResult {
  return html`
    <div class="republic-card">
      <div class="republic-card__header">
        <h3>⚠️ Recent Breaches</h3>
        <span class="republic-badge" style="background:#ef4444;color:white">${props.breaches.length}</span>
      </div>
      <div class="republic-card__body republic-list" style="max-height:350px;overflow-y:auto">
        ${
          props.breaches.length === 0
            ? html`
                <p class="republic-card__empty">No norm breaches recorded</p>
              `
            : props.breaches.map(
                (b) => html`
                <div class="republic-list__item">
                  <div>
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
                      <strong style="color:#ef4444">${b.violatorName}</strong>
                      <span style="font-size:0.75rem;color:var(--text-muted)">−${b.reputationPenalty.toFixed(1)} rep</span>
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-secondary)">${b.description}</div>
                    <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.15rem">
                      Consequence: ${b.consequence}
                    </div>
                  </div>
                </div>`,
              )
        }
      </div>
    </div>`;
}
