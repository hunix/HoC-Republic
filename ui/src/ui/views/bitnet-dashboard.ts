import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LocalInstance, DownloadedBitnetModel } from "../republic-types.js";

/** Recommended 1-bit models for HoC citizens — verified HuggingFace repos with GGUF files */
const BITNET_CATALOG = [
  {
    repo: "microsoft/bitnet-b1.58-2B-4T-gguf",
    name: "BitNet 2B 4T (Official)",
    params: "2B",
    desc: "Microsoft's official 1-bit model — best starting point",
  },
  {
    repo: "QuantFactory/bitnet_b1_58-3B-GGUF",
    name: "BitNet b1.58 3B",
    params: "3B",
    desc: "Balanced speed + quality for citizen decisions",
  },
  {
    repo: "RichardErkhov/1bitLLM_-_bitnet_b1_58-large-gguf",
    name: "BitNet b1.58 Large",
    params: "700M",
    desc: "Smallest footprint — good for bulk citizen agents",
  },
];

@customElement("hoc-bitnet-dashboard")
export class BitnetDashboard extends LitElement {
  @property({ type: Array }) instances: LocalInstance[] = [];
  @property({ type: Array }) downloadedModels: DownloadedBitnetModel[] = [];
  @property() onDownload?: (repo: string) => Promise<void> | void;
  @property() onStart?: (id: string, model: string) => Promise<void> | void;
  @property() onStop?: (id: string, model: string) => Promise<void> | void;
  @property() onStartNode?: (modelPath: string) => Promise<void> | void;

  /** Track download status per repo */
  @state() private downloadStatus: Map<string, "idle" | "downloading" | "complete" | "error"> =
    new Map();
  @state() private downloadError: Map<string, string> = new Map();

  /** Track loading/error for start/stop actions per instance */
  @state() private actionLoading: Map<string, "starting" | "stopping"> = new Map();
  @state() private actionError: Map<string, string> = new Map();

  private _statusBadge(status: string) {
    const colors: Record<string, { cls: string; label: string }> = {
      online: { cls: "badge-online", label: "● ONLINE" },
      offline: { cls: "badge-offline", label: "○ OFFLINE" },
      warming: { cls: "badge-warming", label: "◌ WARMING" },
    };
    const c = colors[status] ?? colors.offline;
    return html`<span class="badge ${c.cls}">${c.label}</span>`;
  }

  private async _handleStart(instanceId: string, model: string) {
    this.actionLoading = new Map(this.actionLoading).set(instanceId, "starting");
    this.actionError = new Map(this.actionError);
    this.actionError.delete(instanceId);
    try {
      await this.onStart?.(instanceId, model);
    } catch (err) {
      this.actionError = new Map(this.actionError).set(instanceId, String(err));
    } finally {
      this.actionLoading = new Map(this.actionLoading);
      this.actionLoading.delete(instanceId);
    }
  }

  private async _handleStop(instanceId: string, model: string) {
    this.actionLoading = new Map(this.actionLoading).set(instanceId, "stopping");
    this.actionError = new Map(this.actionError);
    this.actionError.delete(instanceId);
    try {
      await this.onStop?.(instanceId, model);
    } catch (err) {
      this.actionError = new Map(this.actionError).set(instanceId, String(err));
    } finally {
      this.actionLoading = new Map(this.actionLoading);
      this.actionLoading.delete(instanceId);
    }
  }

  /** Check if a model repo has already been downloaded */
  private _isDownloaded(repo: string): DownloadedBitnetModel | undefined {
    return this.downloadedModels.find(
      (dm) =>
        repo.toLowerCase().includes(dm.repo.toLowerCase()) ||
        dm.repo.toLowerCase().includes(repo.split("/").pop()?.toLowerCase() ?? ""),
    );
  }

  private async _doDownload(repo: string) {
    if (this.downloadStatus.get(repo) === "downloading") {
      return;
    }
    this.downloadStatus = new Map(this.downloadStatus).set(repo, "downloading");
    this.downloadError = new Map(this.downloadError);
    this.downloadError.delete(repo);
    try {
      // Actually await the server response instead of faking with a timeout
      await this.onDownload?.(repo);
      this.downloadStatus = new Map(this.downloadStatus).set(repo, "complete");
    } catch (err) {
      this.downloadStatus = new Map(this.downloadStatus).set(repo, "error");
      this.downloadError = new Map(this.downloadError).set(repo, String(err));
    }
  }

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
      background: linear-gradient(90deg, var(--ok, #10b981), var(--ok-muted, #34d399));
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
    .card-wide {
      grid-column: 1 / -1;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: var(--radius-full, 12px);
      font-size: 12px;
      font-weight: 600;
      gap: 4px;
      transition: all 0.3s ease;
    }
    .badge-online {
      background: var(--ok-subtle);
      color: var(--ok);
    }
    .badge-offline {
      background: var(--danger-subtle);
      color: var(--danger);
    }
    .badge-warming {
      background: var(--warn-subtle);
      color: var(--warn);
    }
    .error-msg {
      margin-top: 8px;
      padding: 6px 10px;
      background: var(--danger-subtle);
      border: 1px solid var(--danger-muted);
      border-radius: var(--radius-sm, 6px);
      font-size: 12px;
      color: var(--danger);
    }
    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
    .loading-text {
      animation: pulse 1.5s infinite;
      font-weight: 600;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .badge-sm {
      font-size: 11px;
      padding: 2px 6px;
    }
    ul.model-list {
      list-style: none;
      padding: 0;
      margin: 16px 0 0 0;
    }
    ul.model-list li {
      padding: 8px 12px;
      background: var(--bg-muted, rgba(0, 0, 0, 0.2));
      border-radius: 6px;
      margin-bottom: 8px;
      font-family: monospace;
      color: var(--text, #e2e8f0);
    }
    .action-bar {
      margin-bottom: 24px;
      display: flex;
      gap: 12px;
      padding: 16px;
      background: var(--card, rgba(30, 41, 59, 0.5));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.05));
      border-radius: 12px;
    }
    input[type="text"] {
      flex: 1;
      background: var(--bg-muted, rgba(0, 0, 0, 0.3));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text, #f8fafc);
      font-family: monospace;
      font-size: 14px;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #34d399;
    }
    button {
      background: #10b981;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.2s;
    }
    button:hover {
      background: #059669;
    }
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }
    .btn-stop {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
    }
    .btn-stop:hover {
      background: rgba(239, 68, 68, 0.4);
    }
    .btn-start {
      background: rgba(52, 211, 153, 0.2);
      color: #10b981;
    }
    .btn-start:hover {
      background: rgba(52, 211, 153, 0.4);
    }
    .model-actions {
      display: flex;
      gap: 8px;
    }
    .catalog-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .catalog-item {
      background: var(--bg-muted, rgba(0, 0, 0, 0.15));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: 10px;
      padding: 16px;
    }
    .catalog-name {
      font-weight: 700;
      font-size: 15px;
      color: var(--text-strong, #f8fafc);
    }
    .catalog-params {
      font-size: 12px;
      color: #34d399;
      font-weight: 600;
      margin-left: 6px;
    }
    .catalog-desc {
      font-size: 13px;
      color: var(--muted, #94a3b8);
      margin: 6px 0 12px 0;
    }
    .catalog-repo {
      font-size: 11px;
      color: var(--muted, #71717a);
      font-family: monospace;
      word-break: break-all;
    }
  `;

  render() {
    const bitnets = (this.instances ?? []).filter((i) => i.type === "bitnet");

    return html`
      <div class="header">
        <h1>⚡ BitNet 1-bit Architecture</h1>
        <p>Ultra-efficient 1.58-bit quantized models running natively on edge clusters.</p>
      </div>

      <div class="action-bar">
        <input type="text" id="bitnet-repo" placeholder="Enter HuggingFace Repository (e.g. HF1BitLLM/Llama3-8B-1.58-100B-tokens-GGUF)" />
        <button type="button" @click=${this.handleDownload}>⬇ Download 1-Bit Model</button>
      </div>

      <!-- Model Catalog -->
      <div class="card card-wide" style="margin-bottom:24px">
        <h3 style="margin:0 0 4px 0;color:var(--text-strong,#f8fafc)">📚 Recommended BitNet Models</h3>
        <p style="margin:0 0 8px 0;font-size:13px;color:var(--muted,#94a3b8)">One-click download from HuggingFace — all models use 1.58-bit quantization for ultra-fast CPU inference.</p>
        <div class="catalog-grid">
          ${BITNET_CATALOG.map(
            (m) => html`
            <div class="catalog-item">
              <div>
                <span class="catalog-name">${m.name}</span>
                <span class="catalog-params">${m.params}</span>
              </div>
              <div class="catalog-desc">${m.desc}</div>
              <div class="catalog-repo">${m.repo}</div>
              ${(() => {
                const downloaded = this._isDownloaded(m.repo);
                const status =
                  this.downloadStatus.get(m.repo) ?? (downloaded ? "complete" : "idle");
                const error = this.downloadError.get(m.repo);
                if (status === "downloading") {
                  return html`
                    <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px">
                      <span style="animation: pulse 1.5s infinite; color: #a855f7; font-weight: 600"
                        >⏳ Downloading via HTTP...</span
                      >
                      <div
                        style="
                          flex: 1;
                          height: 4px;
                          background: rgba(0, 0, 0, 0.3);
                          border-radius: 4px;
                          overflow: hidden;
                        "
                      >
                        <div
                          style="
                            width: 60%;
                            height: 100%;
                            background: linear-gradient(90deg, #a855f7, #7c3aed);
                            border-radius: 4px;
                            animation: pulse 1.5s infinite;
                          "
                        ></div>
                      </div>
                    </div>
                  `;
                }
                if (status === "complete" || downloaded) {
                  return html`
                    <div style="margin-top: 10px">
                      <div style="color: #22c55e; font-weight: 600">✅ Downloaded — ready to use</div>
                      ${
                        downloaded
                          ? html`
                        <button type="button" class="btn-sm" style="margin-top:8px;background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;cursor:pointer"
                          @click=${() => this.onStartNode?.(downloaded.path)}>🚀 Start Node</button>
                      `
                          : nothing
                      }
                    </div>
                  `;
                }
                if (status === "error") {
                  return html`<div style="margin-top:10px">
                    <div style="color:#f87171;font-weight:600">❌ Download failed</div>
                    ${error ? html`<div style="font-size:11px;color:var(--muted,#94a3b8);margin-top:4px">${error}</div>` : nothing}
                    <button type="button" class="btn-sm" style="margin-top:6px" @click=${() => this._doDownload(m.repo)}>🔄 Retry</button>
                  </div>`;
                }
                return html`<button type="button" class="btn-sm" style="margin-top:10px" @click=${() => this._doDownload(m.repo)}>⬇ Download</button>`;
              })()}
            </div>
          `,
          )}
        </div>
      </div>

      ${
        bitnets.length === 0
          ? html`
              <div class="card" style="text-align: center; padding: 40px">
                <div style="font-size: 48px; opacity: 0.5; margin-bottom: 16px">⚡</div>
                <h2 style="color: var(--text-strong, #f8fafc); margin: 0 0 8px 0">No BitNet Nodes Detected</h2>
                <p style="color: var(--muted, #94a3b8); margin: 0">
                  Download a model above or agents will automatically spawn BitNet nodes when tasks require
                  ultra-lightweight inference.
                </p>
              </div>
            `
          : html`
        <div class="grid">
          ${bitnets.map((b) => {
            const isLoading = this.actionLoading.has(b.id);
            const loadingAction = this.actionLoading.get(b.id);
            const error = this.actionError.get(b.id);
            return html`
            <div class="card">
              <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
                <h3 style="margin:0;color:var(--text-strong,#f8fafc);display:flex;align-items:center;gap:8px">
                  ⚡ ${b.url}
                </h3>
                ${this._statusBadge(b.status)}
              </div>
              <p style="margin:0;font-size:13px;color:var(--muted,#94a3b8)">
                Last seen: ${this.formatDate(new Date(b.lastSeen).toISOString())}
                ${b.pid ? html` · PID ${b.pid}` : nothing}
              </p>
              ${error ? html`<div class="error-msg">❌ ${error}</div>` : nothing}
              ${isLoading ? html`<div class="loading-text" style="margin-top:8px;color:#a855f7">${loadingAction === "starting" ? "🚀 Starting..." : "⏹ Stopping..."}</div>` : nothing}
              <ul class="model-list">
                ${b.models.map(
                  (m) => html`
                  <li style="display:flex;justify-content:space-between;align-items:center">
                    <span>🧠 ${m}</span>
                    <div class="model-actions">
                      <button type="button" class="btn-start btn-sm" ?disabled=${isLoading} @click=${() => this._handleStart(b.id, m)}>${isLoading && loadingAction === "starting" ? "⏳" : "▶"} Start</button>
                      <button type="button" class="btn-stop btn-sm" ?disabled=${isLoading} @click=${() => this._handleStop(b.id, m)}>${isLoading && loadingAction === "stopping" ? "⏳" : "⏹"} Stop</button>
                    </div>
                  </li>
                `,
                )}
                ${
                  b.models.length === 0
                    ? html`
                        <li style="color: var(--muted, #94a3b8); font-style: italic">No models loaded</li>
                      `
                    : ""
                }
              </ul>
            </div>
          `;
          })}
        </div>
      `
      }
    `;
  }

  private handleDownload() {
    const input = this.shadowRoot?.querySelector("#bitnet-repo") as HTMLInputElement;
    if (input && input.value.trim() && this.onDownload) {
      this.onDownload(input.value.trim());
      input.value = "";
    }
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
