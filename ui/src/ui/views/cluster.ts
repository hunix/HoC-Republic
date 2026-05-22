/**
 * Cluster Management View
 *
 * Renders the comprehensive cluster management page: gateway cluster,
 * connected nodes, Docker containers, runtimes, and n8n workflows.
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  ClusterNode,
  DockerContainer,
  FederatedPeerInfo,
  FederationState,
  GatewayPeer,
  N8nStatus,
  RuntimeInfo,
} from "../controllers/cluster.ts";
import { icon } from "../icons.js";

export interface ClusterProps {
  loading: boolean;
  error: string | null;
  peers: GatewayPeer[];
  role: "leader" | "follower" | "standalone";
  nodes: ClusterNode[];
  dockerAvailable: boolean;
  containers: DockerContainer[];
  runtimes: RuntimeInfo[];
  n8n: N8nStatus | null;
  federation: FederationState;
  onRefresh: () => void;
  onStartContainer: (id: string) => void;
  onStopContainer: (id: string) => void;
  onRemoveContainer: (id: string) => void;
  onDeployPreset: (preset: string) => void;
  onToggleN8nWorkflow: (id: string, active: boolean) => void;
  onTriggerN8nWorkflow: (id: string) => void;
  onAddFederationPeer: (ip: string) => void;
  onRemoveFederationPeer: (ip: string) => void;
}

export function renderCluster(props: ClusterProps): TemplateResult {
  return html`
    <style>
      .republic-cluster-modern {
        padding: 2rem;
        font-family: 'Inter', 'Roboto', sans-serif;
        color: var(--text);
        background: radial-gradient(circle at top right, var(--accent-subtle), transparent),
                    var(--bg);
        min-height: 100vh;
      }
      .glass-hero {
        background: var(--card);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 2.5rem;
        margin-bottom: 2rem;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .glass-hero__title {
        font-size: 2.5rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        margin: 0 0 0.5rem 0;
        background: linear-gradient(135deg, #60a5fa, #a78bfa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .glass-hero__subtitle {
        color: var(--muted);
        font-size: 1.1rem;
        margin: 0;
        font-weight: 400;
      }
      .dyn-btn {
        background: rgba(99, 102, 241, 0.15);
        border: 1px solid rgba(99, 102, 241, 0.3);
        color: #818cf8;
        padding: 0.6rem 1.25rem;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .dyn-btn:hover {
        background: rgba(99, 102, 241, 0.25);
        transform: translateY(-2px);
        box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.4);
      }
      .glass-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
      }
      .glass-card {
        background: var(--card);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 12px;
        padding: 1.5rem;
        transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
      }
      .glass-card:hover {
        transform: translateY(-4px);
        border-color: rgba(255, 255, 255, 0.15);
        box-shadow: 0 12px 40px -10px rgba(0, 0, 0, 0.4);
      }
      .glass-card__header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
        padding-bottom: 1rem;
      }
      .glass-card__header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--text-strong);
      }
      .glass-card__header h3 svg, .glass-hero__title svg {
        width: 1.5rem;
        height: 1.5rem;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      .glass-hero__title svg {
        width: 2.5rem;
        height: 2.5rem;
        margin-right: 0.5rem;
        vertical-align: text-bottom;
      }
      .dyn-btn svg {
        width: 1.1rem;
        height: 1.1rem;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        fill: none;
      }
      .status-pill {
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .status-pill.live { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
      .status-pill.warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
      .status-pill.neutral { background: rgba(148, 163, 184, 0.15); color: var(--text); border: 1px solid rgba(148, 163, 184, 0.3); }
      
      .modern-table-container {
        overflow-x: auto;
      }
      .modern-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
      }
      .modern-table th {
        text-align: left;
        padding: 0.75rem 1rem;
        color: var(--muted);
        font-weight: 500;
        font-size: 0.85rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      }
      .modern-table td {
        padding: 1rem;
        background: var(--bg-hover);
        border-bottom: 1px solid rgba(148, 163, 184, 0.1);
        color: var(--text-strong);
        font-size: 0.9rem;
      }
      .modern-table tr:hover td {
        background: var(--bg-elevated);
      }
      .modern-table tr:first-child td:first-child { border-top-left-radius: 8px; }
      .modern-table tr:first-child td:last-child { border-top-right-radius: 8px; }
      .modern-table tr:last-child td:first-child { border-bottom-left-radius: 8px; border-bottom: none; }
      .modern-table tr:last-child td:last-child { border-bottom-right-radius: 8px; border-bottom: none; }

      .runtime-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 1rem;
      }
      .runtime-tile {
        background: var(--card);
        border: 1px solid rgba(148, 163, 184, 0.2);
        padding: 1.25rem;
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .runtime-tile__name { font-weight: 600; color: var(--text-strong); font-size: 1.1rem; }
      .runtime-tile__meta { color: var(--muted); font-size: 0.8rem; font-family: monospace; word-break: break-all; }
      
      .empty-state {
        color: var(--muted);
        font-style: italic;
        padding: 1rem 0;
        text-align: center;
      }
    </style>

    <div class="republic-cluster-modern">
      <!-- Glass Hero Header -->
      <div class="glass-hero">
        <div>
          <h2 class="glass-hero__title">${icon("globe")} Command Nexus</h2>
          <p class="glass-hero__subtitle">
            Orchestrating Gateway clusters, edge nodes, runtime APIs, and workflow automation.
          </p>
        </div>
        <button type="button" class="dyn-btn" @click=${props.onRefresh}>
          ${icon("activity")} Sync Cluster Data
        </button>
      </div>

      ${
        props.error
          ? html`<div style="background: rgba(239, 68, 68, 0.15); color: #fca5a5; padding: 1rem; border-radius: 8px; border: 1px solid rgba(239,68,68,0.3); margin-bottom: 2rem;">
            ⚠️ <strong>Error:</strong> ${props.error}
          </div>`
          : nothing
      }

      ${
        props.loading
          ? html`
              <div
                style="
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  min-height: 200px;
                  color: #818cf8;
                  font-size: 1.2rem;
                  font-weight: 500;
                "
              >
                <span class="pulse-loader" style="margin-right: 1rem">⚡</span> Interfacing with the hive mind...
              </div>
            `
          : html`
            <div class="glass-grid">
              ${renderGatewayCluster(props)}
              ${renderNodes(props)}
            </div>
            ${renderFederation(props)}
            ${renderDocker(props)}
            ${renderRuntimes(props)}
            ${renderN8n(props)}
          `
      }
    </div>
  `;
}

// ─── Gateway Cluster ───────────────────────────────────────────

function renderGatewayCluster(props: ClusterProps): TemplateResult {
  const roleClass =
    props.role === "leader" ? "live" : props.role === "follower" ? "neutral" : "warn";

  return html`
    <div class="glass-card">
      <div class="glass-card__header">
        <h3>${icon("radio")} Gateway Network</h3>
        <span class="status-pill ${roleClass}">
          ${props.role.toUpperCase()}
        </span>
      </div>
      ${
        props.peers.length === 0
          ? html`
              <div class="empty-state">Isolation Mode: Operating as standalone sovereign gateway.</div>
            `
          : html`
            <div class="modern-table-container">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Identity</th>
                    <th>Subnet</th>
                    <th>Role</th>
                    <th>Uptime</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.peers.map(
                    (p) => html`
                      <tr>
                        <td style="font-family: monospace; color:#93c5fd;">${p.id.slice(0, 8)}</td>
                        <td>${p.host}:${p.port}</td>
                        <td>
                          <span class="status-pill ${p.role === "leader" ? "live" : "neutral"}">
                            ${p.role}
                          </span>
                        </td>
                        <td style="color:var(--text)">${formatUptime(p.uptime)}</td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
      }
    </div>
  `;
}

// ─── Connected Nodes ───────────────────────────────────────────

function renderNodes(props: ClusterProps): TemplateResult {
  return html`
    <div class="glass-card">
      <div class="glass-card__header">
        <h3>${icon("monitor")} Edge Compute Nodes</h3>
        <span class="status-pill live">
          ${props.nodes.length} NODE${props.nodes.length !== 1 ? "S" : ""}
        </span>
      </div>
      ${
        props.nodes.length === 0
          ? html`
              <div class="empty-state">No remote compute nodes detected.</div>
            `
          : html`
            <div class="modern-table-container">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Designation</th>
                    <th>IPv4 / Subnet</th>
                    <th>Telemetry</th>
                    <th>Hardware</th>
                    <th>Capabilities</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.nodes.map(
                    (n) => html`
                      <tr>
                        <td>
                          <div style="font-weight: 600; color: var(--text-strong);">${n.name}</div>
                          <div style="font-size: 0.75rem; color: var(--muted); font-family: monospace;">${n.id}</div>
                        </td>
                        <td style="color:var(--muted)">${n.host}</td>
                        <td>
                          <span class="status-pill ${n.status === "online" ? "live" : n.status === "degraded" ? "warn" : "neutral"}">
                            ${n.status}
                          </span>
                        </td>
                        <td>
                          <div style="font-size: 0.85rem; color:var(--text);">CPU: <span style="color:var(--text-strong); font-weight: 500;">${n.cpuUsage != null ? `${n.cpuUsage}%` : "—"}</span></div>
                          <div style="font-size: 0.85rem; color:var(--text);">RAM: <span style="color:var(--text-strong); font-weight: 500;">${n.memoryUsageMB != null ? `${n.memoryUsageMB} MB` : "—"}</span></div>
                        </td>
                        <td>
                          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                            ${
                              n.gpuAvailable
                                ? html`
                                    <span class="status-pill live" style="font-size: 0.65rem">GPU ACCEL</span>
                                  `
                                : nothing
                            }
                            ${n.capabilities.map((cap) => html`<span class="status-pill neutral" style="font-size: 0.65rem;">${cap}</span>`)}
                          </div>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
      }
    </div>
  `;
}

// ─── Docker ────────────────────────────────────────────────────

function renderDocker(props: ClusterProps): TemplateResult {
  const presets = ["n8n", "ollama", "postgres", "redis", "qdrant"];

  return html`
    <div class="glass-card" style="margin-bottom: 2rem;">
      <div class="glass-card__header">
        <h3>${icon("folder")} Hosted Containers</h3>
        <span class="status-pill ${props.dockerAvailable ? "live" : "neutral"}">
          ${props.dockerAvailable ? "DAEMON CONNECTED" : "UNAVAILABLE"}
        </span>
      </div>

      ${
        props.dockerAvailable
          ? html`
            <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:1.5rem">
              ${presets.map(
                (p) => html`
                  <button type="button" class="dyn-btn" @click=${() => props.onDeployPreset(p)} style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">
                    + Deploy ${p}
                  </button>
                `,
              )}
            </div>
          `
          : nothing
      }

      ${
        props.containers.length === 0
          ? html`
              <div class="empty-state">No containers running on primary interface.</div>
            `
          : html`
            <div class="modern-table-container">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Designation</th>
                    <th>Image Source</th>
                    <th>State</th>
                    <th>Ports Binding</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.containers.map(
                    (c) => html`
                      <tr>
                        <td><strong style="color: var(--text-strong);">${c.name}</strong></td>
                        <td style="font-family: monospace; color: #a5b4fc; font-size: 0.8rem;">${c.image}</td>
                        <td>
                          <span class="status-pill ${c.status === "running" ? "live" : "warn"}">
                            ${c.status}
                          </span>
                        </td>
                        <td style="color:var(--muted)">${c.ports.join(", ") || "—"}</td>
                        <td style="display:flex;gap:0.5rem">
                          ${
                            c.status !== "running"
                              ? html`<button type="button" class="dyn-btn" style="color: #34d399; border-color: rgba(52,211,153,0.3); background: rgba(52,211,153,0.1);" @click=${() => props.onStartContainer(c.id)}>▶</button>`
                              : html`<button type="button" class="dyn-btn" style="color: #fbbf24; border-color: rgba(251,191,36,0.3); background: rgba(251,191,36,0.1);" @click=${() => props.onStopContainer(c.id)}>⏹</button>`
                          }
                          <button type="button" class="dyn-btn" style="color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.1);" @click=${() => {
                            if (window.confirm(`Remove container ${c.name}? This cannot be undone.`))
                              {props.onRemoveContainer(c.id);}
                          }}>✕</button>
                        </td>
                      </tr>
                    `,
                  )}
                </tbody>
              </table>
            </div>
          `
      }
    </div>
  `;
}

// ─── Runtimes ──────────────────────────────────────────────────

function renderRuntimes(props: ClusterProps): TemplateResult {
  return html`
    <div class="glass-card" style="margin-bottom: 2rem;">
      <div class="glass-card__header">
        <h3>${icon("cpu")} Background Cognitive APIs</h3>
      </div>
      ${
        props.runtimes.length === 0
          ? html`
              <div class="empty-state">No runtime environment detected on standard endpoints.</div>
            `
          : html`
            <div class="runtime-grid">
              ${props.runtimes.map(
                (r) => html`
                  <div class="runtime-tile">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <span class="runtime-tile__name">${r.name}</span>
                      <span class="status-pill ${r.status === "available" ? "live" : "neutral"}">${r.status}</span>
                    </div>
                    <div class="runtime-tile__meta">
                      ${r.type} ${r.version ? `v${r.version}` : ""}
                      ${r.endpoint ? html`<br /><span style="color:#818cf8;">${r.endpoint}</span>` : nothing}
                    </div>
                    ${
                      r.models?.length
                        ? html`<div style="font-size:0.8rem; color:var(--muted); margin-top:0.5rem;">${r.models.length} Cached Model${r.models.length !== 1 ? "s" : ""}</div>`
                        : nothing
                    }
                  </div>
                `,
              )}
            </div>
          `
      }
    </div>
  `;
}

// ─── n8n ───────────────────────────────────────────────────────

function renderN8n(props: ClusterProps): TemplateResult {
  const n8n = props.n8n;
  return html`
    <div class="glass-card" style="margin-bottom: 2rem;">
      <div class="glass-card__header">
        <h3>${icon("zap")} n8n Automation Engine</h3>
        ${
          n8n
            ? html`<span class="status-pill ${n8n.available ? "live" : "warn"}">
              ${n8n.available ? "CONNECTED" : "UNAVAILABLE"}
              ${n8n.version ? ` v${n8n.version}` : ""}
            </span>`
            : nothing
        }
      </div>

      ${
        !n8n || !n8n.available
          ? html`
              <div class="empty-state">
                n8n core is detached. Deploy via Container Orchestrator to mount workflow automation.
              </div>
            `
          : n8n.workflows.length === 0
            ? html`<div class="empty-state">
              No deployed workflows found. Initialize a new circuit in the
              <a href="${n8n.url || "#"}" target="_blank" rel="noopener" style="color: #60a5fa; text-decoration: none; font-weight: 500;">n8n UI ↗</a>.
            </div>`
            : html`
              <div class="modern-table-container">
                <table class="modern-table">
                  <thead>
                    <tr>
                      <th>Workflow Designation</th>
                      <th>State Trigger</th>
                      <th>Nodes</th>
                      <th>Last Modified</th>
                      <th>Execution</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${n8n.workflows.map(
                      (w) => html`
                        <tr>
                          <td><strong style="color: var(--text-strong);">${w.name}</strong></td>
                          <td>
                            <input
                              type="checkbox"
                              class="republic-toggle"
                              style="cursor: pointer; width: 1.25rem; height: 1.25rem; accent-color: #6366f1;"
                              .checked=${w.active}
                              @change=${() => props.onToggleN8nWorkflow(w.id, !w.active)}
                            />
                          </td>
                          <td style="color:var(--muted)">${w.nodes} Nodes</td>
                          <td style="color:var(--muted); font-size: 0.8rem;">${new Date(w.updatedAt).toLocaleDateString()}</td>
                          <td>
                            <button type="button"
                              class="dyn-btn"
                              style="color: #818cf8; border-color: rgba(129,140,248,0.3); background: rgba(129,140,248,0.1); font-size: 0.8rem; padding: 0.35rem 0.75rem;"
                              @click=${() => props.onTriggerN8nWorkflow(w.id)}
                              ?disabled=${!w.active}
                            >
                              ▶ Force Trigger
                            </button>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `
      }
    </div>
  `;
}

// ─── Helpers ───────────────────────────────────────────────────

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

// ─── Federation ────────────────────────────────────────────────

function renderFederation(props: ClusterProps): TemplateResult {
  const fed = props.federation;
  const hasPeers = fed.tailscalePeers.length > 0 || fed.peers.length > 0;

  return html`
    <style>
      .fed-add-row {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        margin-bottom: 1.5rem;
      }
      .fed-add-row input {
        flex: 1;
        padding: 0.6rem 1rem;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.3);
        background: var(--bg);
        color: var(--text-strong);
        font-family: monospace;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.2s;
      }
      .fed-add-row input:focus {
        border-color: #818cf8;
      }
      .fed-add-row input::placeholder { color: var(--muted); }
      .fed-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .fed-stat {
        background: var(--bg);
        border: 1px solid rgba(148, 163, 184, 0.15);
        border-radius: 10px;
        padding: 1rem;
        text-align: center;
      }
      .fed-stat__value {
        font-size: 1.8rem;
        font-weight: 800;
        background: linear-gradient(135deg, #60a5fa, #a78bfa);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .fed-stat__label { color: var(--muted); font-size: 0.8rem; margin-top: 0.25rem; }
    </style>

    <div class="glass-card" style="margin-bottom: 2rem;">
      <div class="glass-card__header">
        <h3>${icon("globe")} Republic Federation</h3>
        <span class="status-pill ${fed.enabled ? "live" : "warn"}">
          ${fed.enabled ? "ACTIVE" : "INACTIVE"}
        </span>
      </div>

      <!-- Add Peer Input -->
      <div class="fed-add-row">
        <input
          id="federation-peer-input"
          type="text"
          placeholder="Enter Tailscale IP (e.g. 100.68.218.68)"
          @keyup=${(e: KeyboardEvent) => {
            if (e.key === "Enter") {
              const input = e.target as HTMLInputElement;
              const ip = input.value.trim();
              if (ip) {
                props.onAddFederationPeer(ip);
                input.value = "";
              }
            }
          }}
        />
        <button type="button" class="dyn-btn" @click=${() => {
          const input = document.getElementById("federation-peer-input") as HTMLInputElement;
          const ip = input?.value?.trim();
          if (ip) {
            props.onAddFederationPeer(ip);
            input.value = "";
          }
        }}>
          + Add Peer
        </button>
      </div>

      ${
        hasPeers
          ? html`
            <!-- Stats -->
            <div class="fed-stats">
              <div class="fed-stat">
                <div class="fed-stat__value">${fed.peers.length}</div>
                <div class="fed-stat__label">Federated Gateways</div>
              </div>
              <div class="fed-stat">
                <div class="fed-stat__value">${fed.remoteCitizenCount}</div>
                <div class="fed-stat__label">Remote Citizens</div>
              </div>
              <div class="fed-stat">
                <div class="fed-stat__value">${fed.marketplaceListings}</div>
                <div class="fed-stat__label">Marketplace Listings</div>
              </div>
              <div class="fed-stat">
                <div class="fed-stat__value">${fed.events.length}</div>
                <div class="fed-stat__label">Federation Events</div>
              </div>
            </div>

            <!-- Peer Table -->
            <div class="modern-table-container">
              <table class="modern-table">
                <thead>
                  <tr>
                    <th>Gateway</th>
                    <th>Tailscale IP</th>
                    <th>Status</th>
                    <th>Citizens</th>
                    <th>Latency</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${(fed.peers.length > 0
                    ? fed.peers
                    : fed.tailscalePeers.map((ip: string) => ({
                        id: ip,
                        name: `Gateway @ ${ip}`,
                        host: ip,
                        port: 18789,
                        citizenCount: 0,
                        status: "offline" as const,
                        latencyMs: 0,
                        totalVramGB: 0,
                        totalRamGB: 0,
                        lastSyncAt: "",
                      }))
                  ).map(
                    (
                      p:
                        | FederatedPeerInfo
                        | {
                            id: string;
                            name: string;
                            host: string;
                            status: string;
                            citizenCount: number;
                            latencyMs: number;
                          },
                    ) => html`
                    <tr>
                      <td>
                        <div style="font-weight: 600; color: var(--text-strong);">${p.name}</div>
                        <div style="font-size: 0.75rem; color: var(--muted); font-family: monospace;">${p.id.slice(0, 12)}</div>
                      </td>
                      <td style="font-family: monospace; color:#93c5fd;">${p.host}</td>
                      <td>
                        <span class="status-pill ${p.status === "online" ? "live" : p.status === "syncing" ? "warn" : "neutral"}">
                          ${p.status}
                        </span>
                      </td>
                      <td style="color:var(--text)">${p.citizenCount}</td>
                      <td style="color:var(--muted)">${p.latencyMs > 0 ? `${p.latencyMs}ms` : "—"}</td>
                      <td>
                        <button type="button"
                          class="dyn-btn"
                          style="color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.1); font-size: 0.8rem; padding: 0.35rem 0.75rem;"
                          @click=${() => props.onRemoveFederationPeer(p.host)}
                        >
                          ✕ Remove
                        </button>
                      </td>
                    </tr>
                  `,
                  )}
                </tbody>
              </table>
            </div>

            <!-- Recent Events -->
            ${
              fed.events.length > 0
                ? html`
                  <div style="margin-top: 1.5rem;">
                    <h4 style="color: var(--text-strong); margin: 0 0 0.75rem 0; font-size: 1rem;">🌐 Recent Federation Events</h4>
                    <div style="max-height: 200px; overflow-y: auto;">
                      ${fed.events
                        .slice(-10)
                        .toReversed()
                        .map(
                          (ev: { type: string; description: string; timestamp: string }) => html`
                        <div style="padding: 0.5rem 0; border-bottom: 1px solid rgba(148,163,184,0.1); font-size: 0.85rem;">
                          <span style="color: var(--muted);">${new Date(ev.timestamp).toLocaleTimeString()}</span>
                          <span style="margin-left: 0.5rem; color: var(--text);">${ev.description}</span>
                        </div>
                      `,
                        )}
                    </div>
                  </div>
                `
                : nothing
            }
          `
          : html`
              <div class="empty-state">
                No federation peers configured. Enter a Tailscale IP above to connect to another gateway.
              </div>
            `
      }
    </div>
  `;
}
