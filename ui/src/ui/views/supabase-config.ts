/**
 * Supabase Command Center — Configuration & Status Page
 *
 * A Lit Web Component that provides:
 *  - Real-time connection status
 *  - Credential entry / env pre-fill
 *  - Connect / disconnect / test controls
 *  - Command activity log
 *  - Copy-ready SQL schema
 */

import { LitElement, html, css, type PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StatusData {
  connected: boolean;
  instanceId: string | null;
  lastHeartbeat: number | null;
  commandsProcessed: number;
  connectedAt: number | null;
  error: string | null;
}

interface ActivityEntry {
  ts: number;
  commandId: string;
  method: string;
  status: "ok" | "error";
  duration_ms: number;
}

interface GatewayClient {
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

// ─── Schema SQL ───────────────────────────────────────────────────────────────

const SCHEMA_SQL = `-- Run this in Supabase SQL Editor (database.new)
create table if not exists hoc_instances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'offline',
  last_heartbeat timestamptz,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create table if not exists hoc_commands (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references hoc_instances(id),
  method text not null,
  params jsonb default '{}',
  status text not null default 'pending',
  claimed_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists hoc_command_results (
  id uuid primary key default gen_random_uuid(),
  command_id uuid references hoc_commands(id),
  payload jsonb,
  error text,
  duration_ms int,
  created_at timestamptz default now()
);

-- Enable Realtime
alter publication supabase_realtime add table hoc_commands;`;

// ─── Element ─────────────────────────────────────────────────────────────────

@customElement("hoc-supabase-config")
export class HocSupabaseConfig extends LitElement {
  @state() private _status: StatusData = {
    connected: false,
    instanceId: null,
    lastHeartbeat: null,
    commandsProcessed: 0,
    connectedAt: null,
    error: null,
  };
  @state() private _activity: ActivityEntry[] = [];
  @state() private _urlInput = "";
  @state() private _keyInput = "";
  @state() private _instanceIdInput = "";
  @state() private _secretInput = "";
  @state() private _testMsg = "";
  @state() private _testOk = true;
  @state() private _loading = false;

  /** Gateway client injected by the parent Lit app */
  client: GatewayClient | null = null;

  private _refreshTimer: ReturnType<typeof setInterval> | null = null;
  private _testMsgTimer: ReturnType<typeof setTimeout> | null = null;

  static override styles = css`
    :host {
      display: block;
      max-width: 900px;
      margin: 0 auto;
      padding: 24px 20px 60px;
      font-family: var(--font-ui, system-ui, sans-serif);
      color: var(--color-text, #e2e8f0);
    }
    h1 {
      font-size: 1.6rem;
      font-weight: 700;
      margin: 0 0 6px;
      background: linear-gradient(135deg, #3ecf8e 0%, #38bdf8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      color: var(--color-muted, #94a3b8);
      font-size: 0.9rem;
      margin-bottom: 28px;
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 20px;
      border-radius: 10px;
      margin-bottom: 24px;
      background: var(--color-surface, #1e293b);
      border: 1px solid var(--color-border, #334155);
      transition: border-color 0.3s;
    }
    .banner.connected {
      border-color: #3ecf8e;
    }
    .banner.error {
      border-color: #f87171;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot.online {
      background: #3ecf8e;
      box-shadow: 0 0 8px #3ecf8e88;
      animation: pulse 2s infinite;
    }
    .dot.offline {
      background: #475569;
    }
    .dot.error {
      background: #f87171;
      box-shadow: 0 0 8px #f8717188;
    }
    @keyframes pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.4;
      }
    }
    .banner-info {
      flex: 1;
      min-width: 0;
    }
    .banner-info strong {
      display: block;
      font-size: 1rem;
    }
    .banner-meta {
      font-size: 0.78rem;
      color: var(--color-muted, #94a3b8);
      margin-top: 4px;
    }
    .banner-meta span {
      margin-right: 14px;
    }
    .banner-actions {
      display: flex;
      gap: 8px;
    }
    .section {
      background: var(--color-surface, #1e293b);
      border: 1px solid var(--color-border, #334155);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .section h2 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 16px;
    }
    .field {
      margin-bottom: 14px;
    }
    .field label {
      display: block;
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-muted, #94a3b8);
      margin-bottom: 5px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .field input {
      width: 100%;
      box-sizing: border-box;
      padding: 9px 12px;
      border-radius: 7px;
      border: 1px solid var(--color-border, #334155);
      background: var(--color-bg, #0f172a);
      color: var(--color-text, #e2e8f0);
      font-size: 0.9rem;
      outline: none;
      transition: border-color 0.2s;
    }
    .field input:focus {
      border-color: #3ecf8e;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
    }
    .hint {
      font-size: 0.72rem;
      color: var(--color-muted, #94a3b8);
      margin-top: 4px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 7px;
      border: none;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition:
        opacity 0.15s,
        transform 0.1s;
    }
    .btn:active {
      transform: scale(0.97);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .btn-primary {
      background: #3ecf8e;
      color: #0f172a;
    }
    .btn-primary:hover:not(:disabled) {
      opacity: 0.85;
    }
    .btn-danger {
      background: #f87171;
      color: #0f172a;
    }
    .btn-danger:hover:not(:disabled) {
      opacity: 0.85;
    }
    .btn-secondary {
      background: var(--color-border, #334155);
      color: var(--color-text, #e2e8f0);
    }
    .btn-secondary:hover:not(:disabled) {
      opacity: 0.8;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.8rem;
    }
    .btn-row {
      display: flex;
      gap: 10px;
      margin-top: 18px;
      flex-wrap: wrap;
    }
    .test-msg {
      margin-top: 12px;
      padding: 10px 14px;
      border-radius: 7px;
      font-size: 0.85rem;
    }
    .test-msg.ok {
      background: #0d2b1f;
      color: #3ecf8e;
      border: 1px solid #3ecf8e44;
    }
    .test-msg.err {
      background: #2b0d0d;
      color: #f87171;
      border: 1px solid #f8717144;
    }
    ul.log {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    ul.log li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid var(--color-border, #334155);
      font-size: 0.82rem;
    }
    ul.log li:last-child {
      border-bottom: none;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .badge-ok {
      background: #0d2b1f;
      color: #3ecf8e;
    }
    .badge-err {
      background: #2b0d0d;
      color: #f87171;
    }
    .method {
      font-family: monospace;
      color: #7dd3fc;
      flex: 1;
    }
    .meta {
      color: var(--color-muted, #94a3b8);
    }
    .empty {
      color: var(--color-muted, #94a3b8);
      text-align: center;
      padding: 20px 0;
      font-size: 0.85rem;
    }
    .schema-block {
      background: #0a0f1a;
      border: 1px solid var(--color-border, #334155);
      border-radius: 8px;
      padding: 14px;
      font-family: monospace;
      font-size: 0.75rem;
      color: #7dd3fc;
      overflow-x: auto;
      white-space: pre;
      line-height: 1.5;
    }
    .copy-btn {
      float: right;
      padding: 4px 10px;
      font-size: 0.72rem;
      border-radius: 5px;
      border: 1px solid var(--color-border, #334155);
      background: transparent;
      color: var(--color-muted, #94a3b8);
      cursor: pointer;
    }
    .copy-btn:hover {
      background: var(--color-border, #334155);
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    void this._loadStatus();
    this._refreshTimer = setInterval(() => void this._loadStatus(), 15_000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
    if (this._testMsgTimer) {
      clearTimeout(this._testMsgTimer);
    }
  }

  override updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has("client" as never) && this.client) {
      void this._loadStatus();
      void this._prefillEnv();
    }
  }

  private async _request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.client) {
      throw new Error("No gateway client");
    }
    return this.client.request(method, params ?? {});
  }

  private async _loadStatus() {
    try {
      const res = (await this._request("supabase.status")) as {
        ok: boolean;
        status: StatusData;
        activity: ActivityEntry[];
      };
      this._status = res.status ?? this._status;
      this._activity = res.activity ?? [];
    } catch {
      // silently ignore if not connected yet
    }
  }

  private async _prefillEnv() {
    try {
      const res = (await this._request("config.env.get")) as { env?: Record<string, string> };
      const env = res.env ?? {};
      if (env.SUPABASE_URL && !this._urlInput) {
        this._urlInput = env.SUPABASE_URL;
      }
      if (env.HOC_INSTANCE_ID && !this._instanceIdInput) {
        this._instanceIdInput = env.HOC_INSTANCE_ID;
      }
    } catch {
      /* ignore */
    }
  }

  private _showTestMsg(ok: boolean, msg: string) {
    this._testOk = ok;
    this._testMsg = msg;
    if (this._testMsgTimer) {
      clearTimeout(this._testMsgTimer);
    }
    this._testMsgTimer = setTimeout(() => {
      this._testMsg = "";
    }, 6000);
  }

  private async _connect() {
    if (!this._urlInput || !this._keyInput) {
      this._showTestMsg(false, "Supabase URL and Service Key are required");
      return;
    }
    this._loading = true;
    try {
      // Persist env
      const envPatch: Record<string, string> = {
        SUPABASE_URL: this._urlInput,
        SUPABASE_SERVICE_KEY: this._keyInput,
      };
      if (this._instanceIdInput) {
        envPatch.HOC_INSTANCE_ID = this._instanceIdInput;
      }
      if (this._secretInput) {
        envPatch.HOC_REGISTER_SECRET = this._secretInput;
      }
      await this._request("config.env.set", { env: envPatch }).catch(() => {});

      const res = (await this._request("supabase.connect", {
        supabaseUrl: this._urlInput,
        supabaseKey: this._keyInput,
        instanceId: this._instanceIdInput || undefined,
        registerSecret: this._secretInput || undefined,
      })) as { ok: boolean };
      this._showTestMsg(
        res.ok,
        res.ok ? "✅ Connecting… status will update shortly" : "❌ Failed to start connector",
      );
      setTimeout(() => void this._loadStatus(), 3000);
    } catch (err) {
      this._showTestMsg(false, `❌ ${String(err)}`);
    } finally {
      this._loading = false;
    }
  }

  private async _disconnect() {
    try {
      await this._request("supabase.disconnect");
      void this._loadStatus();
      this._showTestMsg(true, "✅ Disconnected");
    } catch (err) {
      this._showTestMsg(false, `❌ ${String(err)}`);
    }
  }

  private async _test() {
    try {
      const res = (await this._request("supabase.test")) as {
        ok: boolean;
        connected: boolean;
        latencyMs: number;
      };
      this._showTestMsg(
        res.ok,
        res.ok ? `✅ Connected — last heartbeat ${res.latencyMs}ms ago` : "❌ Not connected",
      );
    } catch (err) {
      this._showTestMsg(false, `❌ ${String(err)}`);
    }
  }

  private async _saveEnv() {
    if (!this._urlInput && !this._keyInput) {
      this._showTestMsg(false, "Nothing to save");
      return;
    }
    const envPatch: Record<string, string> = {};
    if (this._urlInput) {
      envPatch.SUPABASE_URL = this._urlInput;
    }
    if (this._keyInput) {
      envPatch.SUPABASE_SERVICE_KEY = this._keyInput;
    }
    if (this._instanceIdInput) {
      envPatch.HOC_INSTANCE_ID = this._instanceIdInput;
    }
    if (this._secretInput) {
      envPatch.HOC_REGISTER_SECRET = this._secretInput;
    }
    try {
      await this._request("config.env.set", { env: envPatch });
      this._showTestMsg(true, "✅ Saved — restart gateway to apply");
    } catch {
      this._showTestMsg(false, "❌ Save failed");
    }
  }

  private async _copySql() {
    await navigator.clipboard.writeText(SCHEMA_SQL);
    this._showTestMsg(true, "✅ SQL copied to clipboard");
  }

  private _fmtDate(ts: number) {
    return new Date(ts).toLocaleTimeString();
  }

  override render() {
    const s = this._status;
    const isConnected = s.connected;
    const dotClass = s.error && !isConnected ? "error" : isConnected ? "online" : "offline";
    const bannerClass = s.error && !isConnected ? "error" : isConnected ? "connected" : "";

    return html`
      <h1>⚡ Supabase Command Center</h1>
      <p class="subtitle">Connect this HoC gateway outbound to a Supabase-backed Command Center PWA. No inbound ports or static IP required.</p>

      <!-- Status Banner -->
      <div class="banner ${bannerClass}">
        <div class="dot ${dotClass}"></div>
        <div class="banner-info">
          <strong>${isConnected ? "Connected" : s.error ? "Error" : "Disconnected"}</strong>
          <div class="banner-meta">
            ${s.instanceId ? html`<span>Instance: <b>${s.instanceId}</b></span>` : ""}
            ${s.commandsProcessed ? html`<span>Commands: <b>${s.commandsProcessed}</b></span>` : ""}
            ${s.connectedAt ? html`<span>Since: <b>${this._fmtDate(s.connectedAt)}</b></span>` : ""}
            ${s.lastHeartbeat ? html`<span>Heartbeat: <b>${this._fmtDate(s.lastHeartbeat)}</b></span>` : ""}
            ${s.error ? html`<span style="color:#f87171">${s.error}</span>` : ""}
          </div>
        </div>
        <div class="banner-actions">
          ${
            isConnected
              ? html`
                <button class="btn btn-sm btn-danger" @click=${() => void this._disconnect()}>Disconnect</button>
                <button class="btn btn-sm btn-secondary" @click=${() => void this._test()}>Test</button>`
              : html`<button class="btn btn-sm btn-primary" @click=${() => void this._connect()}>Connect</button>`
          }
        </div>
      </div>

      <!-- Credentials -->
      <div class="section">
        <h2>🔑 Credentials</h2>
        <div class="field">
          <label>Supabase Project URL</label>
          <input type="url" placeholder="https://xxxx.supabase.co" .value=${this._urlInput}
            @input=${(e: InputEvent) => {
              this._urlInput = (e.target as HTMLInputElement).value;
            }}
          />
          <div class="hint">Project Settings → API → Project URL</div>
        </div>
        <div class="field">
          <label>Service Role Key</label>
          <input type="password" placeholder="eyJ…" .value=${this._keyInput}
            @input=${(e: InputEvent) => {
              this._keyInput = (e.target as HTMLInputElement).value;
            }}
          />
          <div class="hint">Project Settings → API → service_role key (keep secret)</div>
        </div>
        <div class="form-row">
          <div class="field">
            <label>Instance ID <span style="font-weight:400;color:#3ecf8e">(auto-assigned)</span></label>
            <input type="text" placeholder="Auto-assigned on first connect" .value=${this._instanceIdInput}
              @input=${(e: InputEvent) => {
                this._instanceIdInput = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
          <div class="field">
            <label>Register Secret</label>
            <input type="password" placeholder="HOC_REGISTER_SECRET" .value=${this._secretInput}
              @input=${(e: InputEvent) => {
                this._secretInput = (e.target as HTMLInputElement).value;
              }}
            />
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" ?disabled=${this._loading} @click=${() => void this._connect()}>
            ${this._loading ? "Connecting…" : "💾 Save & Connect"}
          </button>
          <button class="btn btn-secondary" @click=${() => void this._saveEnv()}>Save to .env only</button>
        </div>
        ${this._testMsg ? html`<div class="test-msg ${this._testOk ? "ok" : "err"}">${this._testMsg}</div>` : ""}
      </div>

      <!-- Activity Log -->
      <div class="section">
        <h2>📜 Recent Commands</h2>
        ${
          this._activity.length === 0
            ? html`
                <div class="empty">No commands received yet</div>
              `
            : html`<ul class="log">
              ${this._activity
                .toReversed()
                .slice(0, 20)
                .map(
                  (a) => html`
                <li>
                  <span class="badge ${a.status === "ok" ? "badge-ok" : "badge-err"}">${a.status.toUpperCase()}</span>
                  <span class="method">${a.method}</span>
                  <span class="meta">${a.duration_ms}ms</span>
                  <span class="meta">${this._fmtDate(a.ts)}</span>
                </li>`,
                )}
            </ul>`
        }
      </div>

      <!-- Schema -->
      <div class="section">
        <h2>🗄️ Supabase Schema Setup</h2>
        <p class="hint" style="margin:0 0 12px">Run this SQL in the Supabase SQL Editor to create required tables and enable Realtime.</p>
        <button class="copy-btn" @click=${() => void this._copySql()}>Copy SQL</button>
        <div class="schema-block">${SCHEMA_SQL}</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hoc-supabase-config": HocSupabaseConfig;
  }
}

// Allow imperative mount call from app-render.ts for legacy path
export function renderSupabaseConfigPage(root: HTMLElement, client?: GatewayClient): void {
  root.innerHTML = "<hoc-supabase-config></hoc-supabase-config>";
  const el = root.querySelector("hoc-supabase-config");
  if (el && client) {
    el.client = client;
  }
}
