import { html, nothing, type TemplateResult } from "lit";
import type { ExecutionHistoryEntry, ExecutionDiagnostics } from "../republic-types.ts";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

/** Available actions that can be executed from the Execution page */
export interface AvailableAction {
  name: string;
  label: string;
  description: string;
  category: "simulation" | "workforce" | "economy" | "governance";
}

export interface CitizenActionsProps {
  loading: boolean;
  history: ExecutionHistoryEntry[];
  diagnostics: ExecutionDiagnostics | null;
  simulationMode: "simulated" | "real";
  onRefresh: () => void;
  onExecuteAction: (action: string, params?: Record<string, unknown>) => void;
  onSetMode: (mode: "simulated" | "real") => void;
}

// ─── Available Actions Catalog ────────────────────────────────────

const AVAILABLE_ACTIONS: AvailableAction[] = [
  { name: "spawn_citizen", label: "Spawn Citizen", description: "Create a new citizen and add to the republic", category: "simulation" },
  { name: "run_tick", label: "Run Tick", description: "Manually advance the simulation by one tick", category: "simulation" },
  { name: "hold_election", label: "Hold Election", description: "Trigger a new government election cycle", category: "governance" },
  { name: "adjust_tax", label: "Adjust Tax Rate", description: "Modify the republic's tax rate", category: "economy" },
  { name: "train_model", label: "Train ML Model", description: "Start training a machine learning model", category: "workforce" },
  { name: "start_simulation", label: "Start Simulation", description: "Start the simulation engine loop", category: "simulation" },
  { name: "pause_simulation", label: "Pause Simulation", description: "Pause the simulation engine", category: "simulation" },
  { name: "stop_simulation", label: "Stop Simulation", description: "Stop the simulation engine loop", category: "simulation" },
];

// ─── Main Render ──────────────────────────────────────────────────

export function renderCitizenActions(props: CitizenActionsProps): TemplateResult {
  const { loading, history, diagnostics } = props;

  if (loading && history.length === 0) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading execution history…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-execution">
      <!-- Hero -->
      <div class="republic-hero republic-hero--exec">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">${icon("zap")} Execution Monitor</h2>
          <div class="republic-hero__actions">
            <span class="republic-badge ${props.simulationMode === "real" ? "republic-badge--success" : "republic-badge--info"}">
              Mode: ${props.simulationMode}
            </span>
            <button type="button" class="republic-btn republic-btn--sm"
              @click=${() => props.onSetMode(props.simulationMode === "real" ? "simulated" : "real")}>
              Switch to ${props.simulationMode === "real" ? "Simulated" : "Real"}
            </button>
            <button type="button" class="republic-btn republic-btn--sm" @click=${props.onRefresh}>↻ Refresh</button>
          </div>
        </div>
      </div>

      <!-- Diagnostics -->
      ${diagnostics ? renderDiagnostics(diagnostics) : nothing}

      <!-- Quick Actions -->
      ${renderActionPanel(props)}

      <!-- History -->
      ${renderHistory(history)}
    </div>
  `;
}

// ─── Action Panel ─────────────────────────────────────────────────

function renderActionPanel(props: CitizenActionsProps): TemplateResult {
  const categories = [...new Set(AVAILABLE_ACTIONS.map(a => a.category))];

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>${icon("zap")} Quick Actions</h3>
        <span class="republic-badge">${AVAILABLE_ACTIONS.length} available</span>
      </div>
      <div class="republic-action-grid">
        ${categories.map(cat => html`
          <div class="republic-action-group">
            <h4 class="republic-action-group__title">${cat.charAt(0).toUpperCase() + cat.slice(1)}</h4>
            <div class="republic-action-group__actions">
              ${AVAILABLE_ACTIONS.filter(a => a.category === cat).map(action => html`
                <button type="button" class="republic-action-btn"
                  title=${action.description}
                  @click=${() => props.onExecuteAction(action.name)}>
                  <span class="republic-action-btn__name">${action.label}</span>
                  <span class="republic-action-btn__desc">${action.description}</span>
                </button>
              `)}
            </div>
          </div>
        `)}
      </div>
    </div>
  `;
}

// ─── Diagnostics ──────────────────────────────────────────────────

function renderDiagnostics(d: ExecutionDiagnostics): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.totalExecutions.toLocaleString()}</div>
        <div class="republic-metric__label">Total Executions</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value republic-text--${d.successRate >= 0.8 ? "success" : d.successRate >= 0.5 ? "warning" : "danger"}">${(d.successRate * 100).toFixed(1)}%</div>
        <div class="republic-metric__label">Success Rate</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.avgDuration.toFixed(0)}ms</div>
        <div class="republic-metric__label">Avg Duration</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${d.activeProviders.length}</div>
        <div class="republic-metric__label">Active Providers</div>
      </div>
    </div>

    ${
      d.activeProviders.length > 0
        ? html`<div class="republic-card republic-card--wide">
          <div class="republic-card__header"><h3>Active Providers</h3></div>
          <div class="republic-tag-list">
            ${d.activeProviders.map((p) => html`<span class="republic-badge republic-badge--info">${p}</span>`)}
          </div>
        </div>`
        : nothing
    }
  `;
}

// ─── History ──────────────────────────────────────────────────────

function renderHistory(history: ExecutionHistoryEntry[]): TemplateResult {
  if (history.length === 0) {
    return html`
      <div class="republic-card republic-card--wide">
        <div class="republic-card__header"><h3>Execution History</h3></div>
        <p class="republic-card__empty">No execution history yet. Run an action to see results here.</p>
      </div>
    `;
  }

  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>Execution History</h3>
        <span class="republic-badge">${history.length} entries</span>
      </div>
      <div class="republic-table-wrap">
        <table class="republic-table">
          <thead>
            <tr><th>Type</th><th>Status</th><th>Citizen</th><th>Duration</th><th>Started</th><th>Output</th></tr>
          </thead>
          <tbody>
            ${history.slice(0, 100).map(
              (entry) => html`<tr class="republic-table__row">
                <td><code>${entry.type}</code></td>
                <td>
                  <span class="republic-badge ${entry.success ? "republic-badge--success" : "republic-badge--danger"}">
                    ${entry.success ? "✓ Pass" : "✗ Fail"}
                  </span>
                </td>
                <td>${entry.citizenId?.slice(0, 8) ?? "—"}</td>
                <td>${entry.duration.toFixed(0)}ms</td>
                <td>${new Date(entry.startedAt).toLocaleString()}</td>
                <td class="republic-table__output">${entry.output ? html`<code title=${entry.output}>${entry.output.slice(0, 60)}${entry.output.length > 60 ? "…" : ""}</code>` : "—"}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
