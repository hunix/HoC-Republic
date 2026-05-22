import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export interface ScheduledEvent {
  id: string;
  type: string;
  agentId: string;
  scheduledAt: number;
  description: string;
}

export interface SimulationStats {
  running: boolean;
  tickRate: number;
  currentTick: number;
  totalEventsProcessed: number;
  activeAgents: number;
  hibernatedAgents: number;
  memoryUsageMB: number;
  uptime: number;
  eventsPerSecond: number;
}

export interface SimulationProps {
  loading: boolean;
  stats: SimulationStats | null;
  eventQueue: ScheduledEvent[];
  mode: "simulated" | "real";
  confirmingRealMode?: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onSetTickRate: (rate: number) => void;
  onSetMode: (mode: "simulated" | "real") => void;
  onConfirmRealMode?: () => void;
  onCancelRealMode?: () => void;
  onRefresh: () => void;
}

// ─── Render ───────────────────────────────────────────────────────

export function renderSimulation(props: SimulationProps): TemplateResult {
  const { loading, stats, eventQueue } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading simulation status…</p>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-simulation">
      <!-- Mode Toggle -->
      ${renderModeToggle(props)}

      <!-- Control Panel -->
      <div class="republic-hero republic-hero--sim">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">${icon("play")} Simulation Engine</h2>
          ${
            stats
              ? html`<span class="republic-hero__badge ${stats.running ? "republic-hero__badge--live" : ""}">
                ${stats.running ? "● RUNNING" : "○ STOPPED"}
              </span>`
              : nothing
          }
        </div>

        <div class="republic-sim-controls">
          <button type="button" class="republic-btn republic-btn--success" @click=${props.onStart} ?disabled=${stats?.running}>
            ▶ Start
          </button>
          <button type="button" class="republic-btn republic-btn--warning" @click=${props.onPause} ?disabled=${!stats?.running}>
            ⏸ Pause
          </button>
          <button type="button" class="republic-btn republic-btn--danger" @click=${props.onStop} ?disabled=${!stats?.running}>
            ⏹ Stop
          </button>
          <div class="republic-sim-speed">
            <label for="sim-tick-rate">Speed:</label>
            <select id="sim-tick-rate" class="republic-select republic-select--sm"
              @change=${(e: Event) => props.onSetTickRate(Number((e.target as HTMLSelectElement).value))}>
              <option value="1"  ?selected=${stats?.tickRate === 1}>1x</option>
              <option value="2"  ?selected=${stats?.tickRate === 2}>2x</option>
              <option value="5"  ?selected=${stats?.tickRate === 5}>5x</option>
              <option value="10" ?selected=${stats?.tickRate === 10}>10x</option>
              <option value="50" ?selected=${stats?.tickRate === 50}>50x</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Stats Grid -->
      ${stats ? renderSimStats(stats) : nothing}

      <!-- Event Queue -->
      ${renderEventQueue(eventQueue)}
    </div>
  `;
}

function renderModeToggle(props: SimulationProps): TemplateResult {
  const isReal = props.mode === "real";
  return html`
    <div class="republic-card republic-card--wide" style="margin-bottom:1rem">
      <div class="republic-card__header">
        <h3>${icon("settings")} Operation Mode</h3>
        <span class="republic-hero__badge ${isReal ? "republic-hero__badge--live" : ""}" style="font-size:0.85rem">
          ${isReal ? "🔴 REAL" : "🔵 SIMULATED"}
        </span>
      </div>
      <div style="display:flex;align-items:center;gap:1rem;padding:0.5rem 0">
        <button type="button"
          class="republic-btn ${!isReal ? "republic-btn--primary" : ""}"
          aria-pressed=${!isReal}
          @click=${() => props.onSetMode("simulated")}
          ?disabled=${!isReal}>
          🔵 Simulated
        </button>
        <button type="button"
          class="republic-btn ${isReal ? "republic-btn--danger" : ""}"
          aria-pressed=${isReal}
          @click=${() => props.onConfirmRealMode?.()}
          ?disabled=${isReal}>
          🔴 Real
        </button>
        <span style="color:var(--text-secondary);font-size:0.85rem;margin-left:auto">
          ${
            isReal
              ? "Citizens execute real tasks on physical hardware and external APIs."
              : "Citizens run in a safe simulation environment with no real side-effects."
          }
        </span>
      </div>
      ${
        props.confirmingRealMode
          ? html`
        <div class="callout callout--danger" style="margin-top:0.75rem;display:flex;flex-direction:column;gap:0.5rem">
          <strong>⚠️ Switch to REAL mode?</strong>
          <p style="margin:0;font-size:0.875rem">Citizens will execute real tasks on physical hardware and external APIs. This cannot be easily undone.</p>
          <div class="row" style="gap:8px;margin-top:4px">
            <button type="button" class="republic-btn republic-btn--danger"
              @click=${() => {
                props.onSetMode("real");
                props.onCancelRealMode?.();
              }}>
              Yes, switch to REAL
            </button>
            <button type="button" class="republic-btn" @click=${() => props.onCancelRealMode?.()}>Cancel</button>
          </div>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

function renderSimStats(s: SimulationStats): TemplateResult {
  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${s.currentTick.toLocaleString()}</div>
        <div class="republic-metric__label">Current Tick</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${s.totalEventsProcessed.toLocaleString()}</div>
        <div class="republic-metric__label">Events Processed</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${s.eventsPerSecond.toFixed(1)}</div>
        <div class="republic-metric__label">Events/sec</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${s.activeAgents.toLocaleString()}</div>
        <div class="republic-metric__label">Active Agents</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${s.hibernatedAgents.toLocaleString()}</div>
        <div class="republic-metric__label">Hibernated</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${s.memoryUsageMB.toFixed(0)} MB</div>
        <div class="republic-metric__label">Memory Usage</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${formatUptime(s.uptime)}</div>
        <div class="republic-metric__label">Uptime</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${s.tickRate}x</div>
        <div class="republic-metric__label">Speed</div>
      </div>
    </div>
  `;
}

function renderEventQueue(events: ScheduledEvent[]): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide">
      <div class="republic-card__header">
        <h3>Event Queue</h3>
        <span class="republic-badge">${events.length} pending</span>
      </div>
      ${
        events.length > 0
          ? html`
          <div class="republic-list">
            ${events.slice(0, 25).map(
              (ev) => html`
                <div class="republic-list__item">
                  <span class="republic-dot" style="background:#6366f1"></span>
                  <div>
                    <strong>${ev.type}</strong>
                    <span>${ev.description}</span>
                  </div>
                  <time>${new Date(ev.scheduledAt).toLocaleString()}</time>
                </div>
              `,
            )}
          </div>
        `
          : html`
              <p class="republic-card__empty">Event queue is empty</p>
            `
      }
    </div>
  `;
}

function formatUptime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  if (seconds < 86400) {
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  }
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
