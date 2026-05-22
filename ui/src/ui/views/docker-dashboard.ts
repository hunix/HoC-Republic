import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface DockerDiagnostics {
  available: boolean;
  error?: string;
  budget: {
    maxCpuCores: number;
    maxMemoryGB: number;
    maxContainers: number;
    allocatedCpuCores: number;
    allocatedMemoryGB: number;
    activeContainers: number;
  };
  managedContainers: {
    name: string;
    image: string;
    status: string;
  }[];
  allContainers?: ContainerInfo[];
  presets: string[];
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string[];
  createdAt: string;
}

@customElement("hoc-docker-dashboard")
export class DockerDashboard extends LitElement {
  @property({ type: Object }) diagnostics: DockerDiagnostics | null = null;
  @property({ type: Array }) containers: ContainerInfo[] = [];
  @property() onContainerStart?: (id: string) => void;
  @property() onContainerStop?: (id: string) => void;
  @property() onContainerRestart?: (id: string) => void;
  @property() onContainerRemove?: (id: string) => void;
  @property() onPresetLaunch?: (preset: string) => void;
  @state() loading = false;

  static styles = css`
    :host {
      display: block;
      padding: 24px;
      color: var(--text, #e2e8f0);
      font-family: var(--font-body, system-ui, sans-serif);
      animation: fade-in 0.4s ease-out;
    }
    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      background: linear-gradient(90deg, var(--info, #60a5fa), var(--accent, #3b82f6));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header p {
      margin: 8px 0 0 0;
      color: var(--muted, #94a3b8);
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 32px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg, 12px);
      padding: 20px;
      transition:
        transform 0.2s,
        box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-md);
      border-color: var(--border-strong);
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text, #cbd5e1);
      margin: 0 0 16px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .metric {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .metric-val {
      font-size: 32px;
      font-weight: 700;
      color: var(--text-strong, #f8fafc);
    }
    .metric-label {
      font-size: 12px;
      color: var(--muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .progress-bar {
      height: 6px;
      background: var(--bg-muted, rgba(255, 255, 255, 0.1));
      border-radius: 3px;
      overflow: hidden;
      margin-top: 12px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--info, #3b82f6), var(--accent, #60a5fa));
      border-radius: 3px;
      transition: width 0.5s ease;
    }
    .progress-fill.warning {
      background: linear-gradient(90deg, var(--warn, #f59e0b), var(--warn-muted, #fbbf24));
    }
    .progress-fill.danger {
      background: linear-gradient(90deg, var(--danger, #ef4444), var(--danger-muted, #f87171));
    }
    .table-container {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg, 12px);
      overflow: hidden;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th,
    td {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.05));
    }
    th {
      font-size: 13px;
      font-weight: 600;
      color: var(--muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: var(--bg-muted, rgba(0, 0, 0, 0.2));
    }
    td {
      font-size: 14px;
      color: var(--text, #e2e8f0);
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover td {
      background: var(--card-highlight, rgba(255, 255, 255, 0.02));
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: var(--radius-full, 12px);
      font-size: 12px;
      font-weight: 600;
      background: var(--secondary);
      color: var(--muted);
    }
    .badge.running {
      background: var(--ok-subtle);
      color: var(--ok);
    }
    .badge.exited {
      background: var(--danger-subtle);
      color: var(--danger);
    }
    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--muted, #94a3b8);
    }
    .actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .btn {
      border: none;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .btn-success {
      background: var(--ok-subtle);
      color: var(--ok);
    }
    .btn-success:hover {
      background: var(--ok-muted, rgba(34, 197, 94, 0.3));
    }
    .btn-warning {
      background: var(--warn-subtle);
      color: var(--warn);
    }
    .btn-warning:hover {
      background: var(--warn-muted, rgba(245, 158, 11, 0.3));
    }
    .btn-danger {
      background: var(--danger-subtle);
      color: var(--danger);
    }
    .btn-danger:hover {
      background: var(--danger-muted, rgba(239, 68, 68, 0.3));
    }
    .btn-primary {
      background: var(--accent-subtle);
      color: var(--accent);
    }
    .btn-primary:hover {
      background: var(--accent-subtle, rgba(59, 130, 246, 0.3));
    }
    .presets-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .preset-btn {
      background: var(--bg-muted);
      border: 1px solid var(--border);
      border-radius: var(--radius-md, 8px);
      padding: 12px;
      text-align: center;
      cursor: pointer;
      transition:
        background 0.2s,
        border-color 0.2s;
      color: var(--text);
      font-size: 13px;
      font-weight: 600;
    }
    .preset-btn:hover {
      background: var(--accent-subtle);
      border-color: var(--border-strong);
    }
    .preset-emoji {
      font-size: 24px;
      display: block;
      margin-bottom: 6px;
    }
  `;

  private readonly PRESET_META: Record<string, { emoji: string; label: string }> = {
    redis: { emoji: "⚡", label: "Redis" },
    postgres: { emoji: "🗄️", label: "PostgreSQL" },
    mongodb: { emoji: "🍃", label: "MongoDB" },
    chromadb: { emoji: "🧬", label: "ChromaDB" },
    minio: { emoji: "📦", label: "MinIO" },
    n8n: { emoji: "🔄", label: "n8n" },
    ubuntu: { emoji: "🐧", label: "Ubuntu" },
  };

  render() {
    if (!this.diagnostics) {
      return html`
        <div class="header">
          <h1>🐳 Docker Cluster</h1>
          <p>Active container budgets & edge sandbox deployments for the Republic cluster.</p>
        </div>
        <div class="grid">
          <div class="card">
            <h3 class="card-title">⚡ Status</h3>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px">
              <span
                style="
                  width: 10px;
                  height: 10px;
                  border-radius: 50%;
                  background: #fbbf24;
                  animation: pulse 2s infinite;
                "
              ></span>
              <span style="color: #fbbf24; font-weight: 600">Connecting...</span>
            </div>
            <p style="margin: 0; font-size: 13px; color: var(--muted, #94a3b8)">
              Attempting to reach the Docker Engine. Please ensure Docker Desktop or Engine is running.
            </p>
          </div>
          <div class="card">
            <h3 class="card-title">🚀 Quick Setup</h3>
            <ol
              style="
                margin: 0;
                padding-left: 20px;
                color: var(--muted, #94a3b8);
                font-size: 13px;
                line-height: 1.8;
              "
            >
              <li>
                Install <span style="color: #60a5fa">Docker Desktop</span> (or Docker Engine on Linux)
              </li>
              <li>Start Docker Desktop — wait for engine to initialize</li>
              <li>Return here — auto-detection will connect</li>
            </ol>
          </div>
          <div class="card">
            <h3 class="card-title">🔧 What Docker Enables</h3>
            <ul
              style="
                margin: 0;
                padding-left: 16px;
                color: var(--muted, #94a3b8);
                font-size: 13px;
                line-height: 1.8;
              "
            >
              <li>
                📦 <strong style="color: var(--text, #e2e8f0)">Isolated Execution</strong> — Secure
                sandboxes for citizen code
              </li>
              <li>
                🗄️ <strong style="color: var(--text, #e2e8f0)">Database Containers</strong> — PostgreSQL,
                Redis for projects
              </li>
              <li>
                🌐 <strong style="color: var(--text, #e2e8f0)">Web Previews</strong> — Deploy citizen
                websites locally
              </li>
              <li>
                🔬 <strong style="color: var(--text, #e2e8f0)">ML Workloads</strong> — GPU containers for
                training
              </li>
              <li>
                🛡️ <strong style="color: var(--text, #e2e8f0)">Resource Budgets</strong> — CPU, memory,
                container limits
              </li>
            </ul>
          </div>
          <div class="card">
            <h3 class="card-title">📋 Available Presets</h3>
            <ul
              style="
                margin: 0;
                padding-left: 16px;
                color: var(--muted, #94a3b8);
                font-size: 13px;
                line-height: 1.8;
              "
            >
              <li>
                🖥️ <strong style="color: var(--text, #e2e8f0)">dev-sandbox</strong> — Node.js + Python dev
                environment
              </li>
              <li>
                🗄️ <strong style="color: var(--text, #e2e8f0)">postgres-15</strong> — PostgreSQL database
              </li>
              <li>
                ⚡ <strong style="color: var(--text, #e2e8f0)">redis-stack</strong> — Redis key-value store
              </li>
              <li>
                🌐 <strong style="color: var(--text, #e2e8f0)">nginx-proxy</strong> — Web server & reverse
                proxy
              </li>
              <li>
                🧪 <strong style="color: var(--text, #e2e8f0)">jupyter-lab</strong> — Data science notebook
              </li>
            </ul>
          </div>
        </div>
      `;
    }

    if (!this.diagnostics.available) {
      return html`
        <div class="header">
          <h1>🐳 Docker Cluster</h1>
          <p>Active container budgets & edge sandbox deployments for the Republic cluster.</p>
        </div>
        <div class="grid">
          <div class="card">
            <h3 class="card-title">⚡ Status</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <span style="width:10px;height:10px;border-radius:50%;background:#f87171"></span>
              <span style="color:#f87171;font-weight:600">Engine Offline</span>
            </div>
            <p style="margin:0;font-size:13px;color:var(--muted,#94a3b8)">${this.diagnostics.error || "Docker Engine is not running. Please start Docker Desktop."}</p>
          </div>
          <div class="card">
            <h3 class="card-title">🔧 What Docker Enables</h3>
            <ul style="margin:0;padding-left:16px;color:var(--muted,#94a3b8);font-size:13px;line-height:1.8">
              <li>📦 <strong style="color:var(--text,#e2e8f0)">Isolated Execution</strong> — Secure sandboxes for citizen code</li>
              <li>🗄️ <strong style="color:var(--text,#e2e8f0)">Database Containers</strong> — PostgreSQL, Redis for projects</li>
              <li>🌐 <strong style="color:var(--text,#e2e8f0)">Web Previews</strong> — Deploy citizen websites locally</li>
              <li>🛡️ <strong style="color:var(--text,#e2e8f0)">Resource Budgets</strong> — CPU, memory, container limits</li>
            </ul>
          </div>
        </div>
      `;
    }

    const { budget } = this.diagnostics;
    const cpuPct =
      budget.maxCpuCores > 0 ? (budget.allocatedCpuCores / budget.maxCpuCores) * 100 : 0;
    const memPct =
      budget.maxMemoryGB > 0 ? (budget.allocatedMemoryGB / budget.maxMemoryGB) * 100 : 0;
    const cntPct =
      budget.maxContainers > 0 ? (budget.activeContainers / budget.maxContainers) * 100 : 0;

    return html`
      <div class="header">
        <h1>🐳 Docker Cluster</h1>
        <p>Active container budgets & edge sandbox deployments for the Republic cluster.</p>
      </div>

      <div class="grid">
        <div class="card">
          <h3 class="card-title">🖥️ CPU Core Quota</h3>
          <div class="metric">
            <span class="metric-val">${budget.allocatedCpuCores} <small style="font-size:16px;color:var(--muted,#94a3b8)">/ ${budget.maxCpuCores}</small></span>
            <span class="metric-label">Cores Allocated</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${cpuPct > 80 ? "danger" : cpuPct > 60 ? "warning" : ""}" style="width:${cpuPct}%"></div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">💾 Memory Quota</h3>
          <div class="metric">
            <span class="metric-val">${budget.allocatedMemoryGB.toFixed(1)} <small style="font-size:16px;color:var(--muted,#94a3b8)">/ ${budget.maxMemoryGB} GB</small></span>
            <span class="metric-label">RAM Allocated</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${memPct > 80 ? "danger" : memPct > 60 ? "warning" : ""}" style="width:${memPct}%"></div>
          </div>
        </div>

        <div class="card">
          <h3 class="card-title">📦 Active Containers</h3>
          <div class="metric">
            <span class="metric-val">${budget.activeContainers} <small style="font-size:16px;color:var(--muted,#94a3b8)">/ ${budget.maxContainers}</small></span>
            <span class="metric-label">Container Limit</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${cntPct > 80 ? "danger" : cntPct > 60 ? "warning" : ""}" style="width:${cntPct}%"></div>
          </div>
        </div>
      </div>

      <!-- Preset Launcher -->
      ${
        this.diagnostics.presets.length > 0
          ? html`
        <div class="card" style="margin-bottom:24px">
          <h3 class="card-title">🚀 Quick Launch Presets</h3>
          <div class="presets-grid">
            ${this.diagnostics.presets.map((p) => {
              const meta = this.PRESET_META[p] ?? { emoji: "📦", label: p };
              return html`
                <div class="preset-btn" @click=${() => this.onPresetLaunch?.(p)}>
                  <span class="preset-emoji">${meta.emoji}</span>
                  ${meta.label}
                </div>
              `;
            })}
          </div>
        </div>
      `
          : nothing
      }

      <!-- Container Table -->
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Name</th>
              <th>Image</th>
              <th>Ports</th>
              <th>Uptime</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.containers.map(
              (c) => html`
              <tr>
                <td><span class="badge ${c.status}">${c.status.toUpperCase()}</span></td>
                <td style="font-family:monospace">${c.name}</td>
                <td style="color:var(--muted,#94a3b8)">${c.image.split(":")[0]}<span style="opacity:0.5">:${c.image.split(":")[1] || "latest"}</span></td>
                <td>${c.ports.join(", ") || "—"}</td>
                <td style="color:var(--muted,#94a3b8)">${this.formatDate(c.createdAt)}</td>
                <td>
                  <div class="actions">
                    ${
                      c.status === "running"
                        ? html`
                      <button type="button" class="btn btn-warning" @click=${() => this.onContainerStop?.(c.id)}>⏹ Stop</button>
                      <button type="button" class="btn btn-primary" @click=${() => this.onContainerRestart?.(c.id)}>🔄 Restart</button>
                    `
                        : html`
                      <button type="button" class="btn btn-success" @click=${() => this.onContainerStart?.(c.id)}>▶ Start</button>
                    `
                    }
                    <button type="button" class="btn btn-danger" @click=${() => this.onContainerRemove?.(c.id)}>🗑</button>
                  </div>
                </td>
              </tr>
            `,
            )}
            ${
              this.containers.length === 0
                ? html`
                    <tr>
                      <td colspan="6" style="text-align: center; padding: 32px; color: var(--muted, #94a3b8)">
                        No containers running...<br />
                        <small>Use the preset launcher above or let agents create containers on demand.</small>
                      </td>
                    </tr>
                  `
                : nothing
            }
          </tbody>
        </table>
      </div>
    `;
  }

  private formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr);
      const seconds = Math.floor((new Date().getTime() - d.getTime()) / 1000);
      if (seconds < 60) {
        return `${seconds}s ago`;
      }
      if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ago`;
      }
      if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)}h ago`;
      }
      return `${Math.floor(seconds / 86400)}d ago`;
    } catch {
      return dateStr;
    }
  }
}
