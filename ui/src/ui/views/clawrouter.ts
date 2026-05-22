import { html, nothing } from "lit";

// ─── Types ──────────────────────────────────────────────────────

export type ClawRouterModel = {
  id: string;
  name: string;
  provider: string;
  inputPrice: number;
  outputPrice: number;
  contextWindow: number;
  maxOutput: number;
  reasoning: boolean;
  vision: boolean;
  agentic: boolean;
};

export type ClawRouterConfig = {
  proxyPort: number;
  routingProfile: string;
  compressionEnabled: boolean;
  compressionThresholdKB: number;
  cacheTTLMs: number;
  cacheMaxEntries: number;
  walletAddress: string | null;
  version: string;
  running: boolean;
};

export type ClawRouterBalance = {
  balanceUSD: string;
  isLow: boolean;
  isEmpty: boolean;
  walletAddress: string;
} | null;

export type ClawRouterProps = {
  loading: boolean;
  config: ClawRouterConfig | null;
  models: ClawRouterModel[];
  balance: ClawRouterBalance;
  balanceLoading: boolean;
  healthy: boolean | null;
  stats: string | null;
  activeSection: "status" | "models" | "config" | "wallet";
  modelSort: "price" | "name" | "context";
  modelSearch: string;
  onSectionChange: (s: "status" | "models" | "config" | "wallet") => void;
  onProfileChange: (p: string) => void;
  onCompressionToggle: (v: boolean) => void;
  onCacheTTLChange: (v: number) => void;
  onRefresh: () => void;
  onRefreshBalance: () => void;
  onModelSort: (s: "price" | "name" | "context") => void;
  onModelSearch: (q: string) => void;
  onStart: () => void;
  onStop: () => void;
};

// ─── Helpers ────────────────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p === 0) {return "Free";}
  if (p < 1) {return `$${p.toFixed(2)}`;}
  return `$${p.toFixed(2)}`;
}

function fmtCtx(n: number): string {
  if (n >= 1_000_000) {return `${(n / 1_000_000).toFixed(1)}M`;}
  if (n >= 1_000) {return `${Math.round(n / 1_000)}K`;}
  return String(n);
}

const PROFILES = [
  { key: "auto", label: "Auto", desc: "Smart routing — balanced cost & quality", icon: "⚡" },
  { key: "eco", label: "Eco", desc: "Cost-optimized — cheapest capable model", icon: "🌱" },
  { key: "premium", label: "Premium", desc: "Best quality — top-tier models only", icon: "💎" },
  { key: "free", label: "Free", desc: "NVIDIA GPT-OSS 120B only — $0.00", icon: "🆓" },
];

const NAV_ITEMS: Array<{ key: ClawRouterProps["activeSection"]; label: string; icon: string }> = [
  { key: "status", label: "Status", icon: "📊" },
  { key: "models", label: "Models", icon: "🤖" },
  { key: "config", label: "Settings", icon: "⚙️" },
  { key: "wallet", label: "Wallet", icon: "💰" },
];

// ─── Render ─────────────────────────────────────────────────────

export function renderClawRouter(p: ClawRouterProps) {
  return html`
    <div class="cr-dashboard">
      <!-- Top status bar -->
      ${renderStatusBar(p)}

      <!-- Section nav -->
      <nav class="cr-nav">
        ${NAV_ITEMS.map((item) => html`
          <button type="button"
            class="cr-nav__item ${p.activeSection === item.key ? "active" : ""}"
            @click=${() => p.onSectionChange(item.key)}
          >
            <span class="cr-nav__icon">${item.icon}</span>
            <span class="cr-nav__label">${item.label}</span>
          </button>
        `)}
      </nav>

      <!-- Content -->
      <div class="cr-content">
        ${p.loading
          ? html`<div class="cr-loading"><div class="cr-spinner"></div><span>Loading ClawRouter…</span></div>`
          : p.activeSection === "status" ? renderStatusSection(p)
          : p.activeSection === "models" ? renderModelsSection(p)
          : p.activeSection === "config" ? renderConfigSection(p)
          : p.activeSection === "wallet" ? renderWalletSection(p)
          : nothing
        }
      </div>
    </div>
  `;
}

// ─── Status Bar ─────────────────────────────────────────────────

function renderStatusBar(p: ClawRouterProps) {
  const c = p.config;
  const running = c?.running ?? false;
  return html`
    <div class="cr-status-bar">
      <div class="cr-status-bar__left">
        <span class="cr-status-pill ${running ? "cr-status-pill--ok" : "cr-status-pill--off"}">
          ${running ? "● Running" : "○ Stopped"}
        </span>
        ${c ? html`
          <span class="cr-status-meta">v${c.version}</span>
          <span class="cr-status-meta">Port ${c.proxyPort}</span>
          <span class="cr-status-meta cr-status-meta--profile">${c.routingProfile}</span>
        ` : nothing}
      </div>
      <div class="cr-status-bar__right" style="display:flex;gap:8px">
        <button type="button" class="cr-btn cr-btn--sm ${running ? 'cr-btn--danger' : 'cr-btn--primary'}"
          @click=${running ? p.onStop : p.onStart}
          style="border-radius:20px;padding:6px 16px;white-space:nowrap;font-weight:600">
          ${running ? "⏹ Stop" : "▶ Start"}
        </button>
        <button type="button" class="cr-btn cr-btn--sm" @click=${p.onRefresh}>↻ Refresh</button>
      </div>
    </div>
  `;
}

// ─── Status Section ─────────────────────────────────────────────

function renderStatusSection(p: ClawRouterProps) {
  const c = p.config;
  return html`
    <div class="cr-section">
      <h3 class="cr-section__title">System Status</h3>

      <div class="cr-cards">
        <div class="cr-card">
          <div class="cr-card__icon">🔌</div>
          <div class="cr-card__body">
            <div class="cr-card__label">Proxy</div>
            <div class="cr-card__value">${c?.running ? `http://127.0.0.1:${c.proxyPort}` : "Not running"}</div>
          </div>
        </div>

        <div class="cr-card">
          <div class="cr-card__icon">🧠</div>
          <div class="cr-card__body">
            <div class="cr-card__label">Routing Profile</div>
            <div class="cr-card__value">${c?.routingProfile ?? "—"}</div>
          </div>
        </div>

        <div class="cr-card">
          <div class="cr-card__icon">🏥</div>
          <div class="cr-card__body">
            <div class="cr-card__label">Health</div>
            <div class="cr-card__value">${p.healthy === null ? "Checking…" : p.healthy ? "✅ Healthy" : "❌ Unhealthy"}</div>
          </div>
        </div>

        <div class="cr-card">
          <div class="cr-card__icon">📦</div>
          <div class="cr-card__body">
            <div class="cr-card__label">Models Available</div>
            <div class="cr-card__value">${p.models.length}</div>
          </div>
        </div>
      </div>

      ${p.stats ? html`
        <div class="cr-stats-block">
          <h4>Cost Savings</h4>
          <pre class="cr-stats-pre">${p.stats}</pre>
        </div>
      ` : nothing}
    </div>
  `;
}

// ─── Models Section ─────────────────────────────────────────────

function renderModelsSection(p: ClawRouterProps) {
  let models = [...p.models];

  // Filter
  if (p.modelSearch) {
    const q = p.modelSearch.toLowerCase();
    models = models.filter((m) =>
      m.id.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q)
    );
  }

  // Sort
  if (p.modelSort === "price") {
    models.sort((a, b) => a.inputPrice - b.inputPrice || a.outputPrice - b.outputPrice);
  } else if (p.modelSort === "name") {
    models.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    models.sort((a, b) => b.contextWindow - a.contextWindow);
  }

  return html`
    <div class="cr-section">
      <div class="cr-section__header">
        <h3 class="cr-section__title">Model Catalog</h3>
        <span class="cr-section__count">${models.length} models</span>
      </div>

      <div class="cr-model-controls">
        <input
          type="text"
          class="cr-search"
          placeholder="Search models…"
          .value=${p.modelSearch}
          @input=${(e: Event) => p.onModelSearch((e.target as HTMLInputElement).value)}
        />
        <div class="cr-sort-btns">
          ${(["price", "name", "context"] as const).map((s) => html`
            <button type="button"
              class="cr-btn cr-btn--xs ${p.modelSort === s ? "cr-btn--active" : ""}"
              @click=${() => p.onModelSort(s)}
            >${s === "price" ? "💰 Price" : s === "name" ? "🔤 Name" : "📏 Context"}</button>
          `)}
        </div>
      </div>

      <div class="cr-model-table-wrap">
        <table class="cr-model-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th>Input</th>
              <th>Output</th>
              <th>Context</th>
              <th>Max Out</th>
              <th>Features</th>
            </tr>
          </thead>
          <tbody>
            ${models.map((m) => html`
              <tr class="${m.inputPrice === 0 ? "cr-row--free" : ""}">
                <td>
                  <div class="cr-model-name">${m.name}</div>
                  <div class="cr-model-id">${m.id}</div>
                </td>
                <td><span class="cr-provider-badge">${m.provider}</span></td>
                <td class="cr-price">${fmtPrice(m.inputPrice)}</td>
                <td class="cr-price">${fmtPrice(m.outputPrice)}</td>
                <td>${fmtCtx(m.contextWindow)}</td>
                <td>${fmtCtx(m.maxOutput)}</td>
                <td>
                  ${m.reasoning ? html`<span class="cr-feat cr-feat--reason" title="Reasoning">🧠</span>` : nothing}
                  ${m.vision ? html`<span class="cr-feat cr-feat--vision" title="Vision">👁</span>` : nothing}
                  ${m.agentic ? html`<span class="cr-feat cr-feat--agent" title="Agentic">🤖</span>` : nothing}
                </td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ─── Config Section ─────────────────────────────────────────────

function renderConfigSection(p: ClawRouterProps) {
  const c = p.config;
  return html`
    <div class="cr-section">
      <h3 class="cr-section__title">Routing Profile</h3>
      <div class="cr-profile-cards">
        ${PROFILES.map((prof) => html`
          <button type="button"
            class="cr-profile-card ${c?.routingProfile === prof.key ? "cr-profile-card--active" : ""}"
            @click=${() => p.onProfileChange(prof.key)}
          >
            <span class="cr-profile-card__icon">${prof.icon}</span>
            <div class="cr-profile-card__text">
              <div class="cr-profile-card__name">${prof.label}</div>
              <div class="cr-profile-card__desc">${prof.desc}</div>
            </div>
            ${c?.routingProfile === prof.key ? html`<span class="cr-profile-card__check">✓</span>` : nothing}
          </button>
        `)}
      </div>

      <h3 class="cr-section__title" style="margin-top:24px">Advanced Settings</h3>
      <div class="cr-settings-grid">
        <label class="cr-setting">
          <span class="cr-setting__label">Context Compression</span>
          <span class="cr-setting__desc">Reduce token usage by 15-40%</span>
          <div class="cr-toggle-wrap">
            <input
              type="checkbox"
              class="cr-toggle"
              .checked=${c?.compressionEnabled ?? true}
              @change=${(e: Event) => p.onCompressionToggle((e.target as HTMLInputElement).checked)}
            />
            <span class="cr-toggle-label">${c?.compressionEnabled ? "On" : "Off"}</span>
          </div>
        </label>

        <label class="cr-setting">
          <span class="cr-setting__label">Cache TTL</span>
          <span class="cr-setting__desc">How long to cache identical responses</span>
          <select class="cr-select" @change=${(e: Event) => p.onCacheTTLChange(Number((e.target as HTMLSelectElement).value))}>
            <option value="60000" ?selected=${c?.cacheTTLMs === 60000}>1 minute</option>
            <option value="300000" ?selected=${c?.cacheTTLMs === 300000}>5 minutes</option>
            <option value="600000" ?selected=${c?.cacheTTLMs === 600000 || !c}>10 minutes (default)</option>
            <option value="1800000" ?selected=${c?.cacheTTLMs === 1800000}>30 minutes</option>
            <option value="3600000" ?selected=${c?.cacheTTLMs === 3600000}>1 hour</option>
          </select>
        </label>

        <div class="cr-setting cr-setting--info">
          <span class="cr-setting__label">Proxy Port</span>
          <span class="cr-setting__desc">Set via BLOCKRUN_PROXY_PORT env var</span>
          <code class="cr-code">${c?.proxyPort ?? 8402}</code>
        </div>
      </div>
    </div>
  `;
}

// ─── Wallet Section ─────────────────────────────────────────────

function renderWalletSection(p: ClawRouterProps) {
  const c = p.config;
  const b = p.balance;

  return html`
    <div class="cr-section">
      <h3 class="cr-section__title">USDC Wallet</h3>

      <div class="cr-wallet-card">
        <div class="cr-wallet-card__header">
          <span class="cr-wallet-card__label">Balance</span>
          <button type="button" class="cr-btn cr-btn--sm" @click=${p.onRefreshBalance}>
            ${p.balanceLoading ? "Checking…" : "↻ Check"}
          </button>
        </div>
        <div class="cr-wallet-card__balance ${b?.isLow ? "cr-wallet-card__balance--low" : ""}">
          ${b ? b.balanceUSD : p.balanceLoading ? "…" : "—"}
        </div>
        ${b?.isLow ? html`<div class="cr-wallet-card__warn">⚠ Low balance — fund to continue using paid models</div>` : nothing}
        ${b?.isEmpty ? html`<div class="cr-wallet-card__warn cr-wallet-card__warn--empty">💸 Empty — only free models available</div>` : nothing}
      </div>

      <div class="cr-wallet-info">
        <div class="cr-wallet-row">
          <span class="cr-wallet-row__label">Wallet Address</span>
          <code class="cr-code cr-code--addr">${c?.walletAddress ?? "Not generated"}</code>
        </div>
        <div class="cr-wallet-row">
          <span class="cr-wallet-row__label">Network</span>
          <span>Base (L2)</span>
        </div>
        <div class="cr-wallet-row">
          <span class="cr-wallet-row__label">Currency</span>
          <span>USDC</span>
        </div>
      </div>

      <div class="cr-wallet-funding">
        <h4>How to Fund</h4>
        <ol class="cr-wallet-steps">
          <li>Copy your wallet address above</li>
          <li>Send USDC on <strong>Base</strong> network to that address</li>
          <li>Even $1 is enough for hundreds of requests</li>
          <li>Free models (NVIDIA GPT-OSS 120B) work without funding</li>
        </ol>
      </div>
    </div>
  `;
}
