import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export type SwarmTaskStatus = "Pending" | "InProgress" | "Completed" | "Failed";

export interface PeerNode {
  id: string;
  endpoint: string;
  capabilities: string[];
  agentCount: number;
  cpuUsage: number;
  memoryUsage: number;
  lastSeen: number;
  isLeader: boolean;
}

export interface SwarmObjective {
  id: string;
  type: string;
  description: string;
  progress: number;
  assignedPeers: number;
  tasksTotal: number;
  tasksCompleted: number;
  startedAt: number;
}

export interface GossipUpdate {
  id: string;
  type: string;
  sourceNode: string;
  timestamp: number;
  propagated: boolean;
}

export interface GridStatus {
  peers: PeerNode[];
  objectives: SwarmObjective[];
  recentGossip: GossipUpdate[];
  totalAgentsAcrossGrid: number;
  gossipRounds: number;
}

export interface GridProps {
  loading: boolean;
  status: GridStatus | null;
  onAddSwarmObjective: (type: string, description: string) => void;
  onElectLeader: () => void;
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

const OBJECTIVE_TYPES = [
  { value: "ResourceGathering", label: "🪨 Resource Gathering" },
  { value: "KnowledgeDiscovery", label: "📚 Knowledge Discovery" },
  { value: "DefenseOperation", label: "🛡️ Defense Operation" },
  { value: "BuildingConstruction", label: "🏗️ Building Construction" },
];

function peerHealthColor(cpu: number, mem: number): string {
  const avg = (cpu + mem) / 2;
  if (avg > 0.85) {return "#ef4444";}
  if (avg > 0.6) {return "#f59e0b";}
  return "#10b981";
}

function objectiveProgressColor(progress: number): string {
  if (progress >= 0.9) {return "#10b981";}
  if (progress >= 0.5) {return "#6366f1";}
  if (progress >= 0.25) {return "#f59e0b";}
  return "var(--muted)";
}

// ─── Render ───────────────────────────────────────────────────────

export function renderGrid(props: GridProps): TemplateResult {
  const { loading, status } = props;

  if (loading) {
    return html`<div class="republic-loading">
      <div class="republic-loading__spinner"></div>
      <p>Discovering network nodes…</p>
    </div>`;
  }

  if (!status) {
    return html`
      <div class="republic-empty republic-empty--animated">
        <span class="republic-empty__icon">${icon("globe")}</span>
        <h3>Grid Not Connected</h3>
        <p>Start the distributed coordinator to discover peers and form the mesh network.</p>
        <button type="button" class="republic-btn republic-btn--glow" @click=${props.onRefresh}>Scan Network</button>
      </div>
    `;
  }

  const leader = status.peers.find((p) => p.isLeader);

  return html`
    <div class="republic-view republic-grid">
      <!-- Grid Overview -->
      <div class="republic-hero republic-hero--grid republic-hero--animated">
        <div class="republic-hero__header">
          <h2 class="republic-hero__title">${icon("globe")} Distributed Grid</h2>
          <span class="republic-hero__badge">${status.peers.length} Nodes Online</span>
        </div>
        <div class="republic-metrics">
          <div class="republic-metric">
            <div class="republic-metric__value">${status.totalAgentsAcrossGrid.toLocaleString()}</div>
            <div class="republic-metric__label">Total Agents</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${status.objectives.length}</div>
            <div class="republic-metric__label">Active Objectives</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${status.gossipRounds.toLocaleString()}</div>
            <div class="republic-metric__label">Gossip Rounds</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${leader ? leader.id.slice(0, 8) + "…" : "None"}</div>
            <div class="republic-metric__label">Current Leader</div>
          </div>
        </div>
      </div>

      <!-- Node Orchestration Controls -->
      ${renderNodeControls(props)}

      <!-- Peer Nodes -->
      ${renderPeerNodes(status.peers)}

      <!-- Swarm Objective Management -->
      ${renderSwarmManagement(status.objectives, props)}

      <!-- Gossip Protocol Feed -->
      ${renderGossipFeed(status.recentGossip)}
    </div>
  `;
}

function renderNodeControls(props: GridProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide republic-card--animated republic-card--controls">
      <div class="republic-card__header">
        <h3>🎛️ Grid Controls</h3>
      </div>
      <div class="republic-grid-controls">
        <button type="button" class="republic-btn republic-btn--accent" @click=${props.onElectLeader}>
          👑 Elect New Leader
        </button>
        <button type="button" class="republic-btn" @click=${props.onRefresh}>
          🔄 Refresh Status
        </button>
      </div>
    </div>
  `;
}

function renderPeerNodes(peers: PeerNode[]): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide republic-card--animated">
      <div class="republic-card__header">
        <h3>Connected Nodes</h3>
        <span class="republic-badge">${peers.length}</span>
      </div>
      ${peers.length > 0
        ? html`
          <div class="republic-node-grid">
            ${peers.map(
              (p) => html`
                <div class="republic-node republic-node--animated ${p.isLeader ? "republic-node--leader" : ""}">
                  <div class="republic-node__header">
                    <span class="republic-node__id">${p.id.slice(0, 10)}…</span>
                    ${p.isLeader ? html`<span class="republic-tag republic-tag--gold republic-tag--pulse">👑 Leader</span>` : nothing}
                    <span class="republic-dot" style="background:${peerHealthColor(p.cpuUsage, p.memoryUsage)}"></span>
                  </div>
                  <div class="republic-node__endpoint">${p.endpoint}</div>
                  <div class="republic-node__bars">
                    <div class="republic-node__bar-group">
                      <span>CPU</span>
                      <div class="republic-bar">
                        <div class="republic-bar__fill republic-bar__fill--animated" style="width:${p.cpuUsage * 100}%;background:${p.cpuUsage > 0.8 ? "#ef4444" : "#10b981"}"></div>
                      </div>
                      <span>${(p.cpuUsage * 100).toFixed(0)}%</span>
                    </div>
                    <div class="republic-node__bar-group">
                      <span>MEM</span>
                      <div class="republic-bar">
                        <div class="republic-bar__fill republic-bar__fill--animated" style="width:${p.memoryUsage * 100}%;background:${p.memoryUsage > 0.8 ? "#ef4444" : "#6366f1"}"></div>
                      </div>
                      <span>${(p.memoryUsage * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div class="republic-node__meta">
                    <span>👥 ${p.agentCount} agents</span>
                    <span>${p.capabilities.length} capabilities</span>
                    <time>Seen ${new Date(p.lastSeen).toLocaleTimeString()}</time>
                  </div>
                </div>
              `,
            )}
          </div>
        `
        : html`<p class="republic-card__empty">No peer nodes discovered</p>`}
    </div>
  `;
}

function renderSwarmManagement(objectives: SwarmObjective[], props: GridProps): TemplateResult {
  return html`
    <div class="republic-card republic-card--wide republic-card--animated">
      <div class="republic-card__header">
        <h3>🐝 Swarm Objectives</h3>
        <span class="republic-badge">${objectives.length} active</span>
      </div>

      <!-- Add Objective Form -->
      <div class="republic-swarm-form">
        <select class="republic-select republic-select--sm" id="swarm-objective-type">
          ${OBJECTIVE_TYPES.map(
            (t) => html`<option value="${t.value}">${t.label}</option>`,
          )}
        </select>
        <input type="text" class="republic-input republic-input--sm" placeholder="Objective description…"
          id="swarm-objective-desc" />
        <button type="button" class="republic-btn republic-btn--sm republic-btn--success"
          @click=${(e: Event) => {
            const form = (e.target as HTMLElement).closest(".republic-swarm-form");
            const typeEl = form?.querySelector<HTMLSelectElement>("select");
            const descEl = form?.querySelector<HTMLInputElement>("input[type='text']");
            const type = typeEl?.value;
            const desc = descEl?.value.trim();
            if (type && desc) {
              props.onAddSwarmObjective(type, desc);
              if (descEl) {descEl.value = "";}
            }
          }}>
          ➕ Add Objective
        </button>
      </div>

      <!-- Objective List -->
      ${objectives.length > 0
        ? html`
          <div class="republic-list">
            ${objectives.map(
              (o) => html`
                <div class="republic-list__item republic-list__item--objective">
                  <div class="republic-list__left">
                    <strong>${o.type}</strong>
                    <span>${o.description}</span>
                  </div>
                  <div class="republic-objective__progress">
                    <div class="republic-bar" style="width:160px">
                      <div class="republic-bar__fill republic-bar__fill--animated" style="width:${o.progress * 100}%;background:${objectiveProgressColor(o.progress)}"></div>
                    </div>
                    <span>${(o.progress * 100).toFixed(0)}%</span>
                  </div>
                  <div class="republic-objective__meta">
                    <span>✅ ${o.tasksCompleted}/${o.tasksTotal} tasks</span>
                    <span>🔗 ${o.assignedPeers} peers</span>
                  </div>
                </div>
              `,
            )}
          </div>
        `
        : html`<p class="republic-card__empty">No active objectives — add one above!</p>`}
    </div>
  `;
}

function renderGossipFeed(gossip: GossipUpdate[]): TemplateResult {
  if (gossip.length === 0) {return html``;}

  return html`
    <div class="republic-card republic-card--wide republic-card--animated">
      <div class="republic-card__header">
        <h3>📡 Gossip Protocol</h3>
        <span class="republic-badge">${gossip.length} recent</span>
      </div>
      <div class="republic-list">
        ${gossip.slice(0, 15).map(
          (g) => html`
            <div class="republic-list__item republic-list__item--gossip">
              <span class="republic-dot" style="background:${g.propagated ? "#10b981" : "#f59e0b"}"></span>
              <div>
                <strong>${g.type}</strong>
                <span>from ${g.sourceNode.slice(0, 10)}…</span>
              </div>
              <span class="republic-tag republic-tag--sm">${g.propagated ? "✓ synced" : "⏳ pending"}</span>
              <time>${new Date(g.timestamp).toLocaleTimeString()}</time>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}
