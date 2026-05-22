import { LitElement, html, css, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

// ─── Types (mirrored from hardware-manager.ts for UI) ─────────────
interface HardwareGpuDevice {
  index: number;
  name: string;
  driver: string | null;
  vramGB: number;
  vramUsedGB: number;
  utilizationPct: number;
  temperatureC: number;
  computeAvailable: boolean;
}

interface ResourceAllocation {
  id: string;
  featureId: string;
  profile: {
    name: string;
    category: string;
    ramGB: number;
    vramGB: number;
    cpuFraction: number;
    priority: string;
    preemptible: boolean;
  };
  status: "queued" | "granted" | "denied" | "evicted" | "released";
  statusAt: number;
  reservedRamGB: number;
  reservedVramGB: number;
  reservedCpuFraction: number;
  queuePosition?: number;
  reason?: string;
}

interface HardwareSnapshot {
  surveyedAt: number;
  capacity: {
    ramTotalGB: number;
    ramFreeGB: number;
    vramTotalGB: number;
    cpuCores: number;
    gpus: HardwareGpuDevice[];
  };
  allocated: { ramGB: number; vramGB: number; cpuFraction: number };
  available: { ramGB: number; vramGB: number; cpuFraction: number };
  allocations: ResourceAllocation[];
  queueDepth: number;
  pressure: "low" | "moderate" | "high" | "critical";
}

@customElement("hoc-resource-manager")
export class ResourceManagerView extends LitElement {
  @state() private snapshot: HardwareSnapshot | null = null;
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private surveying = false;
  @state() private releasingId: string | null = null;

  private _pollTimer: ReturnType<typeof setInterval> | null = null;

  connectedCallback() {
    super.connectedCallback();
    this._poll();
    this._pollTimer = setInterval(() => this._poll(), 5000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  private async _rpc<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const resp = await fetch("/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await resp.json()) as {
      result?: { ok: boolean; [k: string]: unknown };
      error?: { message: string };
    };
    if (json.error) {
      throw new Error(json.error.message);
    }
    return json.result as T;
  }

  private async _poll() {
    try {
      const result = await this._rpc<{ ok: boolean; snapshot: HardwareSnapshot }>(
        "republic.hardware.resource.snapshot",
      );
      this.snapshot = result.snapshot;
      this.error = null;
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }

  private async _forceSurvey() {
    this.surveying = true;
    try {
      await this._rpc("republic.hardware.resource.survey");
      await this._poll();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.surveying = false;
    }
  }

  private async _release(featureId: string) {
    this.releasingId = featureId;
    try {
      await this._rpc("republic.hardware.resource.release", { featureId });
      await this._poll();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.releasingId = null;
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private _pressureColor(p: HardwareSnapshot["pressure"]) {
    return (
      { low: "#10b981", moderate: "#f59e0b", high: "#ef4444", critical: "#dc2626" }[p] ?? "#94a3b8"
    );
  }

  private _statusColor(s: ResourceAllocation["status"]) {
    return (
      {
        granted: "#10b981",
        queued: "#f59e0b",
        denied: "#ef4444",
        evicted: "#a855f7",
        released: "#64748b",
      }[s] ?? "#94a3b8"
    );
  }

  private _categoryIcon(c: string) {
    return { llm: "🧠", plugin: "🔌", agent: "🤖", infra: "⚙️", other: "📦" }[c] ?? "📦";
  }

  private _gauge(value: number, max: number, color: string, label: string) {
    if (max <= 0) {
      return nothing;
    }
    const pct = Math.min(100, (value / max) * 100);
    return html`
      <div class="gauge-wrap">
        <div class="gauge-label">
          <span>${label}</span>
          <span>${value.toFixed(1)} / ${max.toFixed(1)} GB</span>
        </div>
        <div class="gauge-track">
          <div class="gauge-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="gauge-pct" style="color:${color}">${pct.toFixed(0)}%</div>
      </div>
    `;
  }

  private _cpuGauge(fraction: number) {
    const pct = Math.min(100, fraction * 100);
    const color = pct > 70 ? "#ef4444" : pct > 40 ? "#f59e0b" : "#10b981";
    return html`
      <div class="gauge-wrap">
        <div class="gauge-label"><span>CPU Allocated</span><span>${pct.toFixed(0)}% of cores</span></div>
        <div class="gauge-track">
          <div class="gauge-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="gauge-pct" style="color:${color}">${pct.toFixed(0)}%</div>
      </div>
    `;
  }

  private _timeAgo(ms: number) {
    const s = Math.floor((Date.now() - ms) / 1000);
    if (s < 60) { return `${s}s ago`; }
    if (s < 3600) { return `${Math.floor(s / 60)}m ago`; }
    return `${Math.floor(s / 3600)}h ago`;
  }

  // ─── Render ─────────────────────────────────────────────────────

  render() {
    if (this.loading) {
      return html`
        <div class="loading-state">
          <div class="spinner"></div>
          <span>Probing hardware…</span>
        </div>
      `;
    }

    const snap = this.snapshot;

    return html`
      <div class="container">

        <!-- Header -->
        <div class="header">
          <div>
            <h1>⚡ Hardware Resource Manager</h1>
            <p>Live hardware survey · admission control · lifecycle management</p>
          </div>
          <div class="header-actions">
            ${
              snap
                ? html`
              <span class="surveyed-at">Last survey: ${this._timeAgo(snap.surveyedAt)}</span>
            `
                : nothing
            }
            <button type="button" class="btn-primary" @click=${this._forceSurvey} ?disabled=${this.surveying}>
              ${this.surveying ? "🔍 Surveying…" : "🔍 Re-Survey Hardware"}
            </button>
          </div>
        </div>

        ${
          this.error
            ? html`
          <div class="error-banner">⚠️ ${this.error}</div>
        `
            : nothing
        }

        ${
          snap
            ? this._renderSnapshot(snap)
            : html`
                <div class="empty-state">
                  <div class="empty-icon">📡</div>
                  <h2>No hardware data available</h2>
                  <p>Click Re-Survey Hardware to probe the system.</p>
                </div>
              `
        }
      </div>
    `;
  }

  private _renderSnapshot(snap: HardwareSnapshot) {
    const pressureColor = this._pressureColor(snap.pressure);
    const hasVram = snap.capacity.vramTotalGB > 0;

    return html`
      <!-- Pressure Banner -->
      <div class="pressure-banner" style="border-color:${pressureColor};background:${pressureColor}18">
        <div class="pressure-dot" style="background:${pressureColor}"></div>
        <span style="color:${pressureColor};font-weight:700;text-transform:uppercase;letter-spacing:0.08em">
          ${snap.pressure} pressure
        </span>
        ${
          snap.queueDepth > 0
            ? html`
          <span class="queue-badge">⏳ ${snap.queueDepth} queued</span>
        `
            : nothing
        }
      </div>

      <!-- Capacity Cards -->
      <div class="section-title">System Capacity</div>
      <div class="capacity-grid">

        <!-- CPU -->
        <div class="card">
          <div class="card-title">🖥️ CPU</div>
          <div class="big-number">${snap.capacity.cpuCores}</div>
          <div class="big-label">logical cores</div>
          ${this._cpuGauge(snap.allocated.cpuFraction)}
        </div>

        <!-- RAM -->
        <div class="card">
          <div class="card-title">💾 System RAM</div>
          <div class="big-number">${snap.capacity.ramTotalGB.toFixed(1)}<span class="unit">GB</span></div>
          <div class="big-label">${snap.capacity.ramFreeGB.toFixed(1)} GB free (OS reported)</div>
          ${this._gauge(snap.allocated.ramGB, snap.capacity.ramTotalGB, "#6366f1", "Allocated")}
          ${this._gauge(snap.available.ramGB, snap.capacity.ramTotalGB, "#10b981", "Available")}
        </div>

        <!-- VRAM / GPU -->
        ${
          hasVram
            ? html`
          <div class="card">
            <div class="card-title">🎮 GPU / VRAM</div>
            ${snap.capacity.gpus.map(
              (gpu) => html`
              <div class="gpu-row">
                <span class="gpu-name">${gpu.name}</span>
                <span class="gpu-stat">${gpu.vramGB}GB · ${gpu.utilizationPct}% util · ${gpu.temperatureC}°C</span>
              </div>
            `,
            )}
            ${this._gauge(snap.allocated.vramGB, snap.capacity.vramTotalGB, "#a855f7", "Allocated VRAM")}
            ${this._gauge(snap.available.vramGB, snap.capacity.vramTotalGB, "#10b981", "Available VRAM")}
          </div>
        `
            : html`
                <div class="card card-muted">
                  <div class="card-title">🎮 GPU / VRAM</div>
                  <div class="empty-gpu">No GPU detected — CPU-only mode</div>
                </div>
              `
        }
      </div>

      <!-- Active Allocations -->
      <div class="section-title">
        Active Allocations
        <span class="section-count">${snap.allocations.length}</span>
      </div>

      ${
        snap.allocations.length === 0
          ? html`
              <div class="empty-allocations">
                <span>✅ No active resource allocations</span>
              </div>
            `
          : html`
        <div class="alloc-table">
          <div class="alloc-header">
            <span>Feature</span>
            <span>Category</span>
            <span>RAM</span>
            <span>VRAM</span>
            <span>CPU</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          ${snap.allocations.map((a) => this._renderAlloc(a))}
        </div>
      `
      }
    `;
  }

  private _renderAlloc(a: ResourceAllocation) {
    const statusColor = this._statusColor(a.status);
    const icon = this._categoryIcon(a.profile.category);
    const isReleasing = this.releasingId === a.featureId;

    return html`
      <div class="alloc-row">
        <span class="alloc-name">
          ${icon} <strong>${a.profile.name}</strong>
          <small class="feature-id">${a.featureId}</small>
        </span>
        <span class="alloc-cat">${a.profile.category}</span>
        <span class="alloc-metric">
          ${a.status === "granted" ? `${a.reservedRamGB.toFixed(1)} GB` : `${a.profile.ramGB} GB`}
        </span>
        <span class="alloc-metric">
          ${
            a.profile.vramGB > 0
              ? a.status === "granted"
                ? `${a.reservedVramGB.toFixed(1)} GB`
                : `${a.profile.vramGB} GB`
              : "—"
          }
        </span>
        <span class="alloc-metric">${(a.profile.cpuFraction * 100).toFixed(0)}%</span>
        <span class="alloc-priority priority-${a.profile.priority}">${a.profile.priority}</span>
        <span>
          <span class="status-badge" style="background:${statusColor}22;color:${statusColor}">
            ${a.status === "queued" && a.queuePosition ? `⏳ #${a.queuePosition}` : `● ${a.status}`}
          </span>
          ${a.reason ? html`<div class="alloc-reason">${a.reason}</div>` : nothing}
        </span>
        <span>
          ${
            a.profile.preemptible && a.status === "granted"
              ? html`
            <button type="button" class="btn-release" ?disabled=${isReleasing} @click=${() => this._release(a.featureId)}>
              ${isReleasing ? "…" : "Release"}
            </button>
          `
              : nothing
          }
        </span>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      font-family: var(--font-body, system-ui, sans-serif);
      color: var(--text, #e2e8f0);
      animation: fade-in 0.3s ease-out;
    }
    @keyframes fade-in {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    .container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border, rgba(255, 255, 255, 0.1));
      flex-wrap: wrap;
      gap: 12px;
    }
    .header h1 {
      margin: 0;
      font-size: 26px;
      background: linear-gradient(90deg, #6366f1, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header p {
      margin: 6px 0 0;
      color: var(--muted, #94a3b8);
      font-size: 13px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .surveyed-at {
      font-size: 12px;
      color: var(--muted, #64748b);
    }

    /* Pressure banner */
    .pressure-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      border-radius: 10px;
      border: 1px solid;
      margin-bottom: 20px;
      font-size: 14px;
    }
    .pressure-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .queue-badge {
      margin-left: auto;
      padding: 2px 10px;
      border-radius: 20px;
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      font-size: 12px;
      font-weight: 600;
    }

    /* Section titles */
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted, #64748b);
      margin: 24px 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-count {
      background: var(--border, rgba(255, 255, 255, 0.08));
      color: var(--text, #e2e8f0);
      padding: 1px 8px;
      border-radius: 20px;
      font-size: 11px;
    }

    /* Capacity grid */
    .capacity-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-bottom: 8px;
    }
    .card {
      background: var(--card, rgba(30, 41, 59, 0.5));
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: 12px;
      padding: 20px;
      transition:
        transform 0.2s,
        box-shadow 0.2s;
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    .card-muted {
      opacity: 0.6;
    }
    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--muted, #94a3b8);
      margin-bottom: 10px;
    }
    .big-number {
      font-size: 36px;
      font-weight: 700;
      color: var(--text-strong, #f8fafc);
      line-height: 1;
    }
    .big-number .unit {
      font-size: 18px;
      color: var(--muted, #94a3b8);
      margin-left: 4px;
    }
    .big-label {
      font-size: 12px;
      color: var(--muted, #64748b);
      margin-bottom: 14px;
    }

    /* Gauges */
    .gauge-wrap {
      margin-top: 10px;
    }
    .gauge-label {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--muted, #64748b);
      margin-bottom: 4px;
    }
    .gauge-track {
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 3px;
      overflow: hidden;
    }
    .gauge-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease;
    }
    .gauge-pct {
      font-size: 10px;
      text-align: right;
      margin-top: 2px;
      font-weight: 600;
    }

    /* GPU rows */
    .gpu-row {
      margin-bottom: 8px;
    }
    .gpu-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-strong, #f8fafc);
      display: block;
    }
    .gpu-stat {
      font-size: 11px;
      color: var(--muted, #64748b);
    }
    .empty-gpu {
      font-size: 13px;
      color: var(--muted, #64748b);
      padding: 12px 0;
    }

    /* Allocation table */
    .alloc-table {
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: 12px;
      overflow: hidden;
    }
    .alloc-header {
      display: grid;
      grid-template-columns: 2fr 1fr 80px 80px 60px 100px 140px 80px;
      gap: 8px;
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.03);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted, #64748b);
    }
    .alloc-row {
      display: grid;
      grid-template-columns: 2fr 1fr 80px 80px 60px 100px 140px 80px;
      gap: 8px;
      padding: 12px 16px;
      align-items: start;
      border-top: 1px solid var(--border, rgba(255, 255, 255, 0.05));
      transition: background 0.15s;
    }
    .alloc-row:hover {
      background: rgba(255, 255, 255, 0.03);
    }
    .alloc-name {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
    }
    .feature-id {
      font-size: 10px;
      color: var(--muted, #64748b);
      font-family: monospace;
    }
    .alloc-cat {
      font-size: 12px;
      color: var(--muted, #94a3b8);
      text-transform: capitalize;
    }
    .alloc-metric {
      font-size: 13px;
      font-family: monospace;
    }
    .alloc-priority {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 20px;
      width: fit-content;
    }
    .priority-critical {
      background: rgba(220, 38, 38, 0.15);
      color: #ef4444;
    }
    .priority-system {
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
    }
    .priority-plugin {
      background: rgba(168, 85, 247, 0.15);
      color: #a855f7;
    }
    .priority-citizen {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
    }
    .priority-background {
      background: rgba(100, 116, 139, 0.15);
      color: #64748b;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
    }
    .alloc-reason {
      font-size: 10px;
      color: var(--muted, #64748b);
      margin-top: 3px;
    }

    /* Buttons */
    button {
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      color: white;
    }
    .btn-primary:hover:not(:disabled) {
      opacity: 0.85;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn-release {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      padding: 4px 10px;
      font-size: 11px;
    }
    .btn-release:hover:not(:disabled) {
      background: rgba(239, 68, 68, 0.3);
    }
    .btn-release:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* States */
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 80px 24px;
      color: var(--muted, #94a3b8);
    }
    .spinner {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
    .error-banner {
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171;
      font-size: 13px;
    }
    .empty-state {
      text-align: center;
      padding: 60px 24px;
      color: var(--muted, #94a3b8);
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .empty-allocations {
      padding: 20px 16px;
      border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
      border-radius: 10px;
      color: var(--muted, #94a3b8);
      font-size: 13px;
    }
  `;
}
