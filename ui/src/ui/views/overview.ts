import { html, nothing } from "lit";
import type { GatewayHelloOk } from "../gateway.ts";
import type { UiSettings } from "../storage.ts";
import { formatAgo, formatDurationMs } from "../format.ts";
import { formatNextRun } from "../presenter.ts";

interface ProviderHealthInfo {
  provider: string;
  healthScore: number;
  errorRate: number;
  avgLatencyMs: number;
  circuitState: string;
}

interface TierStatsInfo {
  tier: number;
  totalCalls: number;
  avgLatencyMs: number;
  errors: number;
}

interface SystemPulseData {
  providerHealth: ProviderHealthInfo[];
  tierStats: TierStatsInfo[];
  freeCallPct: number;
  totalProviders: number;
  healthyProviders: number;
  degradedMode: boolean;
}

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  systemPulse?: SystemPulseData | null;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
  onNavigate?: (tab: string) => void;
};

/* ── SVG icon helpers ───────────────────────────────────────────── */

const wifiIcon = html`
  <svg viewBox="0 0 24 24">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
    <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
    <circle cx="12" cy="20" r="1"></circle>
  </svg>
`;
const wifiOffIcon = html`
  <svg viewBox="0 0 24 24">
    <line x1="1" y1="1" x2="23" y2="23"></line>
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9"></path>
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
    <circle cx="12" cy="20" r="1"></circle>
  </svg>
`;
const chatIcon = html`
  <svg viewBox="0 0 24 24">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
`;
const nodesIcon = html`
  <svg viewBox="0 0 24 24">
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
    <line x1="6" y1="6" x2="6.01" y2="6"></line>
    <line x1="6" y1="18" x2="6.01" y2="18"></line>
  </svg>
`;
const settingsIcon = html`
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3"></circle>
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
    ></path>
  </svg>
`;
const fileIcon = html`
  <svg viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
  </svg>
`;
// oxlint-disable-next-line no-unused-vars
const arrowRightIcon = html`
  <svg viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
`;
const lightbulbIcon = html`
  <svg viewBox="0 0 24 24">
    <path d="M9 18h6"></path>
    <path d="M10 22h4"></path>
    <path
      d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"
    ></path>
  </svg>
`;

export function renderOverview(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | { uptimeMs?: number; policy?: { tickIntervalMs?: number }; version?: string }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationMs(snapshot.uptimeMs) : "n/a";
  const tick = snapshot?.policy?.tickIntervalMs ? `${snapshot.policy.tickIntervalMs}ms` : "n/a";
  const version = (snapshot as Record<string, unknown> | undefined)?.version as string | undefined;

  return html`
    <div class="view-enter">
      ${renderConnectionHero(props, uptime, version)}

      ${props.lastError ? renderErrorBanner(props) : nothing}

      <div class="stat-grid mt-4">
        ${renderMetricTiles(props, uptime, tick)}
      </div>

      ${props.connected && props.systemPulse ? renderSystemPulse(props.systemPulse) : nothing}

      ${renderQuickActions(props)}

      ${renderTipsCard(props)}

      ${renderAccessCard(props)}
    </div>
  `;
}

/* ── Connection Hero ────────────────────────────────────────────── */

function renderConnectionHero(props: OverviewProps, uptime: string, version: string | undefined) {
  const connected = props.connected;
  return html`
    <div class="connection-hero">
      <div class="connection-hero__indicator ${connected ? "connection-hero__indicator--ok" : "connection-hero__indicator--offline"}">
        ${connected ? wifiIcon : wifiOffIcon}
      </div>
      <div class="connection-hero__info">
        <div class="connection-hero__title">
          ${connected ? "Connected" : "Disconnected"}
        </div>
        <div class="connection-hero__meta">
          ${
            connected
              ? html`
                <span class="connection-hero__meta-item">
                  Uptime: <strong>${uptime}</strong>
                </span>
                ${
                  version
                    ? html`<span class="connection-hero__meta-item">Version: <strong>${version}</strong></span>`
                    : nothing
                }
                <span class="connection-hero__meta-item">
                  URL: <strong class="mono">${props.settings.gatewayUrl || "auto"}</strong>
                </span>
              `
              : html`
                  <span class="connection-hero__meta-item"> Configure connection below to get started </span>
                `
          }
        </div>
      </div>
      <div class="connection-hero__actions">
        <button type="button" class="btn primary" @click=${() => props.onConnect()}>
          ${connected ? "Reconnect" : "Connect"}
        </button>
        ${
          connected
            ? html`<button type="button" class="btn" @click=${() => props.onRefresh()}>Refresh</button>`
            : nothing
        }
      </div>
    </div>
  `;
}

/* ── Error Banner ───────────────────────────────────────────────── */

function renderErrorBanner(props: OverviewProps) {
  const authHint = resolveAuthHint(props);
  const insecureHint = resolveInsecureContextHint(props);
  return html`
    <div class="callout danger mt-3">
      <div>${props.lastError}</div>
      ${authHint ?? ""}
      ${insecureHint ?? ""}
    </div>
  `;
}

function resolveAuthHint(props: OverviewProps) {
  if (props.connected || !props.lastError) {return null;}
  const lower = props.lastError.toLowerCase();
  const authFailed = lower.includes("unauthorized") || lower.includes("connect failed");
  if (!authFailed) {return null;}
  const hasToken = Boolean(props.settings.token.trim());
  const hasPassword = Boolean(props.password.trim());
  if (!hasToken && !hasPassword) {
    return html`
      <div class="muted mt-2">
        This gateway requires auth. Add a token or password, then click Connect.
        <div class="mt-1">
          <span class="mono">hoc dashboard --no-open</span> → open the Control UI<br />
          <span class="mono">hoc doctor --generate-gateway-token</span> → set token
        </div>
        <div class="mt-1">
          <a
            class="session-link"
            href="https://docs.hoc.ai/web/dashboard"
            target="_blank"
            rel="noreferrer"
            >Docs: Control UI auth</a
          >
        </div>
      </div>
    `;
  }
  return html`
    <div class="muted mt-2">
      Auth failed. Update the token or password in the connection settings below, then click Connect.
      <div class="mt-1">
        <a
          class="session-link"
          href="https://docs.hoc.ai/web/dashboard"
          target="_blank"
          rel="noreferrer"
          >Docs: Control UI auth</a
        >
      </div>
    </div>
  `;
}

function resolveInsecureContextHint(props: OverviewProps) {
  if (props.connected || !props.lastError) {return null;}
  const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
  if (isSecureContext) {return null;}
  const lower = props.lastError.toLowerCase();
  if (!lower.includes("secure context") && !lower.includes("device identity required")) {return null;}
  return html`
    <div class="muted mt-2">
      This page is HTTP, so the browser blocks device identity. Use HTTPS (Tailscale Serve) or open
      <span class="mono">http://127.0.0.1:18789</span> on the gateway host.
      <div class="mt-1">
        If you must stay on HTTP, set
        <span class="mono">gateway.controlUi.allowInsecureAuth: true</span> (token-only).
      </div>
      <div class="mt-1">
        <a
          class="session-link"
          href="https://docs.hoc.ai/gateway/tailscale"
          target="_blank"
          rel="noreferrer"
          >Docs: Tailscale Serve</a
        >
        <span class="muted"> · </span>
        <a
          class="session-link"
          href="https://docs.hoc.ai/web/control-ui#insecure-http"
          target="_blank"
          rel="noreferrer"
          >Docs: Insecure HTTP</a
        >
      </div>
    </div>
  `;
}

/* ── Metric Tiles ───────────────────────────────────────────────── */

function renderMetricTiles(props: OverviewProps, uptime: string, tick: string) {
  const cronLabel = props.cronEnabled == null ? "n/a" : props.cronEnabled ? "Enabled" : "Disabled";
  return html`
    <div class="metric-tile metric-tile--accent">
      <div class="metric-tile__label">Status</div>
      <div class="metric-tile__value">${props.connected ? "Online" : "Offline"}</div>
      <div class="metric-tile__sub">Uptime ${uptime}</div>
    </div>
    <div class="metric-tile metric-tile--teal">
      <div class="metric-tile__label">Instances</div>
      <div class="metric-tile__value">${props.presenceCount}</div>
      <div class="metric-tile__sub">Live beacons</div>
    </div>
    <div class="metric-tile metric-tile--info">
      <div class="metric-tile__label">Sessions</div>
      <div class="metric-tile__value">${props.sessionsCount ?? "—"}</div>
      <div class="metric-tile__sub">Tracked keys</div>
    </div>
    <div class="metric-tile metric-tile--ok">
      <div class="metric-tile__label">Cron</div>
      <div class="metric-tile__value">${cronLabel}</div>
      <div class="metric-tile__sub">Next ${formatNextRun(props.cronNext)}</div>
    </div>
    <div class="metric-tile metric-tile--warn">
      <div class="metric-tile__label">Tick Interval</div>
      <div class="metric-tile__value">${tick}</div>
      <div class="metric-tile__sub">Gateway heartbeat</div>
    </div>
    <div class="metric-tile metric-tile--accent">
      <div class="metric-tile__label">Last Refresh</div>
      <div class="metric-tile__value" style="font-size: 16px;">
        ${props.lastChannelsRefresh ? formatAgo(props.lastChannelsRefresh) : "—"}
      </div>
      <div class="metric-tile__sub">Channels refresh</div>
    </div>
  `;
}

/* ── Quick Actions ──────────────────────────────────────────────── */

function renderQuickActions(props: OverviewProps) {
  const nav = props.onNavigate;
  if (!nav) {return nothing;}
  return html`
    <section class="mt-4">
      <div class="section-divider">Quick Actions</div>
      <div class="quick-actions mt-2">
        <button type="button" class="quick-action" @click=${() => nav("chat")}>
          <span class="quick-action__icon">${chatIcon}</span>
          <span class="quick-action__label">Open Chat</span>
        </button>
        <button type="button" class="quick-action" @click=${() => nav("nodes")}>
          <span class="quick-action__icon">${nodesIcon}</span>
          <span class="quick-action__label">View Nodes</span>
        </button>
        <button type="button" class="quick-action" @click=${() => nav("config")}>
          <span class="quick-action__icon">${settingsIcon}</span>
          <span class="quick-action__label">Configure</span>
        </button>
        <button type="button" class="quick-action" @click=${() => nav("logs")}>
          <span class="quick-action__icon">${fileIcon}</span>
          <span class="quick-action__label">View Logs</span>
        </button>
      </div>
    </section>
  `;
}

/* ── Contextual Tips ────────────────────────────────────────────── */

function renderTipsCard(props: OverviewProps) {
  const tips: Array<{ text: ReturnType<typeof html> }> = [];

  if (!props.connected) {
    tips.push({
      text: html`
        <strong>Not connected</strong> — Enter your gateway URL and click Connect to get started.
      `,
    });
  }

  if (props.presenceCount === 0 && props.connected) {
    tips.push({
      text: html`
        <strong>No instances</strong> — Run <span class="mono">hoc pair</span> on a device to connect a
        node.
      `,
    });
  }

  if (props.connected && props.cronEnabled === false) {
    tips.push({
      text: html`
        <strong>Cron disabled</strong> — Enable scheduled jobs in Config → Cron to automate recurring tasks.
      `,
    });
  }

  if (props.connected) {
    tips.push({
      text: html`
        Use <strong>Channels</strong> to link WhatsApp, Telegram, Discord, Signal, or iMessage.
      `,
    });
    tips.push({
      text: html`
        Prefer <strong>Tailscale Serve</strong> to keep the gateway on loopback with tailnet auth.
      `,
    });
  }

  if (tips.length === 0) {return nothing;}

  return html`
    <section class="tips-card mt-4">
      <div class="tips-card__title">Tips & Next Steps</div>
      <div class="tips-list">
        ${tips.map(
          (tip) => html`
            <div class="tip-item">
              <span class="tip-item__icon">${lightbulbIcon}</span>
              <div class="tip-item__text">${tip.text}</div>
            </div>
          `,
        )}
      </div>
    </section>
  `;
}

/* ── Gateway Access Card (connection settings) ──────────────────── */

function renderAccessCard(props: OverviewProps) {
  return html`
    <section class="card mt-4">
      <div class="card-title">Connection Settings</div>
      <div class="card-sub">Gateway URL, authentication, and session configuration.</div>
      <div class="form-grid mt-4">
        <label class="field">
          <span>WebSocket URL</span>
          <input
            .value=${props.settings.gatewayUrl}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onSettingsChange({ ...props.settings, gatewayUrl: v });
            }}
            placeholder="ws://100.x.y.z:18789"
          />
        </label>
        <label class="field">
          <span>Gateway Token</span>
          <input
            .value=${props.settings.token}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onSettingsChange({ ...props.settings, token: v });
            }}
            placeholder="HOC_GATEWAY_TOKEN"
          />
        </label>
        <label class="field">
          <span>Password (not stored)</span>
          <input
            type="password"
            .value=${props.password}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onPasswordChange(v);
            }}
            placeholder="system or shared password"
          />
        </label>
        <label class="field">
          <span>Default Session Key</span>
          <input
            .value=${props.settings.sessionKey}
            @input=${(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              props.onSessionKeyChange(v);
            }}
          />
        </label>
      </div>
      <div class="row mt-3 gap-2 items-center">
        <button type="button" class="btn primary" @click=${() => props.onConnect()}>Connect</button>
        <button type="button" class="btn" @click=${() => props.onRefresh()}>Refresh</button>
        <span class="muted">Click Connect to apply changes.</span>
      </div>
    </section>
  `;
}

/* ── System Pulse ───────────────────────────────────────────────── */

function renderSystemPulse(pulse: SystemPulseData) {
  const tierNames = ["Tier 0 (Rules)", "Tier 1 (Local)", "Tier 2 (Cluster)", "Tier 3 (Cloud)"];
  const tierColors = ["#94a3b8", "#10b981", "#6366f1", "#f59e0b"];
  const totalCalls = pulse.tierStats.reduce((s, t) => s + t.totalCalls, 0);

  function healthColor(score: number): string {
    if (score >= 80) {
      return "#10b981";
    }
    if (score >= 50) {
      return "#f59e0b";
    }
    return "#ef4444";
  }

  function circuitIcon(state: string): string {
    if (state === "CLOSED") {
      return "🟢";
    }
    if (state === "HALF_OPEN") {
      return "🟡";
    }
    return "🔴";
  }

  return html`
    <section class="card mt-4">
      <div class="card-title" style="display:flex;align-items:center;gap:8px">
        ⚡ System Pulse
        ${
          pulse.degradedMode
            ? html`
                <span
                  style="
                    font-size: 12px;
                    padding: 2px 10px;
                    border-radius: 8px;
                    background: #ef444433;
                    color: #ef4444;
                    font-weight: 600;
                  "
                  >⚠ DEGRADED MODE</span
                >
              `
            : html`<span style="font-size:12px;padding:2px 10px;border-radius:8px;background:#10b98133;color:#10b981;font-weight:600">${pulse.healthyProviders}/${pulse.totalProviders} healthy</span>`
        }
      </div>

      <!-- KPI Row -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:14px 0">
        <div class="metric-tile metric-tile--ok">
          <div class="metric-tile__label">Free Calls</div>
          <div class="metric-tile__value">${pulse.freeCallPct}%</div>
          <div class="metric-tile__sub">Tier 0–2</div>
        </div>
        <div class="metric-tile metric-tile--accent">
          <div class="metric-tile__label">Total Calls</div>
          <div class="metric-tile__value">${totalCalls.toLocaleString()}</div>
          <div class="metric-tile__sub">All tiers</div>
        </div>
        <div class="metric-tile metric-tile--teal">
          <div class="metric-tile__label">Providers</div>
          <div class="metric-tile__value">${pulse.healthyProviders}/${pulse.totalProviders}</div>
          <div class="metric-tile__sub">Healthy</div>
        </div>
      </div>

      <!-- Tier Distribution -->
      ${
        totalCalls > 0
          ? html`
        <div style="margin-bottom:16px">
          <div class="section-divider" style="margin-bottom:10px">Inference Tier Distribution</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${pulse.tierStats.map((t, i) => {
              const pct = totalCalls > 0 ? Math.round((t.totalCalls / totalCalls) * 100) : 0;
              return html`
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="width:120px;font-size:12px;text-align:right;color:var(--muted)">${tierNames[i]}</span>
                  <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.06);overflow:hidden">
                    <div style="width:${pct}%;height:100%;border-radius:4px;background:${tierColors[i]};transition:width 0.3s"></div>
                  </div>
                  <span style="font-size:11px;color:var(--muted);min-width:60px;text-align:right">${t.totalCalls} (${pct}%)</span>
                </div>
              `;
            })}
          </div>
        </div>
      `
          : nothing
      }

      <!-- Provider Health Cards -->
      ${
        pulse.providerHealth.length > 0
          ? html`
        <div class="section-divider" style="margin-bottom:10px">Provider Health</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">
          ${pulse.providerHealth.map(
            (p) => html`
              <div style="padding:12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;
                          background:rgba(255,255,255,0.03)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                  <span style="font-size:13px;font-weight:600;color:var(--text-strong)">
                    ${circuitIcon(p.circuitState)} ${p.provider}
                  </span>
                  <span style="font-size:18px;font-weight:700;color:${healthColor(p.healthScore)}">
                    ${p.healthScore}
                  </span>
                </div>
                <div style="height:4px;border-radius:2px;background:rgba(255,255,255,0.06);overflow:hidden;margin-bottom:8px">
                  <div style="width:${p.healthScore}%;height:100%;border-radius:2px;background:${healthColor(p.healthScore)}"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted)">
                  <span>Err ${p.errorRate}%</span>
                  <span>${p.avgLatencyMs}ms</span>
                  <span>${p.circuitState}</span>
                </div>
              </div>
            `,
          )}
        </div>
      `
          : html`
              <div style="text-align: center; padding: 16px; opacity: 0.5; font-size: 13px">
                No compute providers registered yet. Start local LLMs or connect cloud providers.
              </div>
            `
      }
    </section>
  `;
}
