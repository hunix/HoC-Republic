import { html, nothing, type TemplateResult } from "lit";
import { icon } from "../icons.js";
import { getPluginPanel } from "./plugin-detail-panels.js";

// ─── Types ────────────────────────────────────────────────────────

export interface PluginCapabilities {
  inference?: boolean;
  tools?: string[];
  providers?: string[];
  hooks?: string[];
  gateway?: string[];
  ui?: string[];
}

export interface PluginRequirements {
  binaries?: string[];
  env?: string[];
  minMemoryMb?: number;
}

export type PluginStatus = "discovered" | "loaded" | "initializing" | "ready" | "error" | "stopped";

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  status: PluginStatus;
  error: string | null;
  loadedAt: number;
  capabilities: PluginCapabilities;
  requirements: PluginRequirements;
  bootPriority: number;
  sourceRepo: string | null;
}

export interface PluginDiagnostics {
  totalPlugins: number;
  ready: number;
  errored: number;
  stopped: number;
  pluginsDir: string;
  pluginIds: string[];
}

export interface PluginsProps {
  loading: boolean;
  plugins: PluginInfo[];
  diagnostics: PluginDiagnostics | null;
  pluginsDir: string | null;
  expandedId: string | null;
  filterCategory: string | null;
  searchQuery: string;
  activatingId: string | null;
  onRefresh: () => void;
  onExpand: (id: string | null) => void;
  onFilterCategory: (cat: string | null) => void;
  onSearch: (q: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onScan: () => void;
  onInvokeTool: (pluginId: string, toolName: string, params: Record<string, unknown>) => void;
  onCallGateway: (method: string, params: Record<string, unknown>) => void;
}

// ─── Constants ────────────────────────────────────────────────────

const STATUS_COLORS: Record<PluginStatus, string> = {
  discovered: "#8b5cf6",
  ready: "#34d399",
  loaded: "#60a5fa",
  initializing: "#fbbf24",
  error: "#ef4444",
  stopped: "#6b7280",
};

const STATUS_LABELS: Record<PluginStatus, string> = {
  discovered: "Discovered",
  ready: "Active",
  loaded: "Loaded",
  initializing: "Activating…",
  error: "Error",
  stopped: "Stopped",
};

const CATEGORY_MAP: Record<string, string> = {
  // Creative / Media
  "hoc-plugin-facefusion": "Creative",
  "hoc-plugin-deepfacelab": "Creative",
  "hoc-plugin-magicanimate": "Creative",
  "hoc-plugin-storydiffusion": "Creative",
  "hoc-plugin-stableavatar": "Creative",
  "hoc-plugin-deforum": "Creative",
  "hoc-plugin-omnigen": "Creative",
  "hoc-plugin-glm-image": "Creative",
  "hoc-plugin-switti": "Creative",
  "hoc-plugin-kv-edit": "Creative",
  "hoc-plugin-sparc3d": "Creative",
  // Audio / Voice
  "hoc-plugin-chatterbox": "Audio",
  "hoc-plugin-bark": "Audio",
  "hoc-plugin-mmaudio": "Audio",
  "hoc-plugin-qwen3-tts": "Audio",
  "hoc-plugin-funmusic": "Audio",
  // AI / Agentic
  "hoc-plugin-autogpt": "Agentic",
  "hoc-plugin-openmanus-rl": "Agentic",
  "hoc-plugin-magentic-one": "Agentic",
  "hoc-plugin-dgm": "Agentic",
  "hoc-plugin-a2a": "Agentic",
  "hoc-plugin-ai-scientist": "Agentic",
  "hoc-plugin-awesome-claude-code": "Agentic",
  // Platform / Builder
  "hoc-plugin-open-lovable": "Builder",
  "hoc-plugin-ui-ux-pro-max": "Builder",
  "hoc-plugin-lingbot-world": "Builder",
  // Superpowers
  "hoc-plugin-superpowers": "Core",
};

const CATEGORY_EMOJI: Record<string, string> = {
  Creative: "🎨",
  Audio: "🎵",
  Agentic: "🤖",
  Builder: "🏗️",
  Core: "⚡",
  Other: "🔌",
};

const CATEGORY_COLORS: Record<string, string> = {
  Creative: "#a855f7",
  Audio: "#06b6d4",
  Agentic: "#f97316",
  Builder: "#10b981",
  Core: "#6366f1",
  Other: "#6b7280",
};

function getCategory(id: string): string {
  return CATEGORY_MAP[id] ?? "Other";
}

// ─── Render ───────────────────────────────────────────────────────

export function renderPlugins(props: PluginsProps): TemplateResult {
  const { loading } = props;

  if (loading) {
    return html`
      <div class="republic-loading">
        <div class="republic-loading__spinner"></div>
        <p>Loading plugins…</p>
      </div>
    `;
  }

  const filteredPlugins = filterPlugins(props);

  return html`
    <div class="republic-view republic-plugins">
      ${renderPluginKPIs(props)}
      ${renderToolbar(props)}
      ${renderPluginGrid(filteredPlugins, props)}
    </div>`;
}

// ─── KPIs ─────────────────────────────────────────────────────────

function renderPluginKPIs(props: PluginsProps): TemplateResult {
  const total = props.plugins.length;
  const active = props.plugins.filter((p) => p.status === "ready" || p.status === "loaded").length;
  const discovered = props.plugins.filter((p) => p.status === "discovered").length;
  const errored = props.plugins.filter((p) => p.status === "error").length;
  const totalTools = props.plugins.reduce((sum, p) => sum + (p.capabilities.tools?.length ?? 0), 0);
  const totalGateway = props.plugins.reduce(
    (sum, p) => sum + (p.capabilities.gateway?.length ?? 0),
    0,
  );

  return html`
    <div class="republic-metrics republic-metrics--grid">
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${total}</div>
        <div class="republic-metric__label">Total Plugins</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value" style="color:#34d399">${active}</div>
        <div class="republic-metric__label">Active</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value" style="color:#8b5cf6">${discovered}</div>
        <div class="republic-metric__label">Available</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value" style="color:${errored > 0 ? "#ef4444" : "#34d399"}">${errored}</div>
        <div class="republic-metric__label">Errors</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${totalTools}</div>
        <div class="republic-metric__label">Tools Registered</div>
      </div>
      <div class="republic-metric republic-metric--card">
        <div class="republic-metric__value">${totalGateway}</div>
        <div class="republic-metric__label">Gateway RPCs</div>
      </div>
    </div>`;
}

// ─── Toolbar ──────────────────────────────────────────────────────

function renderToolbar(props: PluginsProps): TemplateResult {
  const categories = [...new Set(props.plugins.map((p) => getCategory(p.id)))].toSorted();

  return html`
    <div class="republic-card" style="margin-bottom:1rem">
      <div class="republic-card__body" style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
        <input
          type="search"
          placeholder="Search plugins…"
          .value=${props.searchQuery}
          @input=${(e: Event) => props.onSearch((e.target as HTMLInputElement).value)}
          style="flex:1;min-width:200px;padding:0.5rem 0.75rem;border:1px solid var(--border-color,#333);border-radius:6px;background:var(--bg-secondary,#1a1a2e);color:var(--text-primary,#fff);font-size:0.85rem"
        />
        <button type="button"
          class="republic-btn republic-btn--sm"
          @click=${() => props.onScan()}
          title="Scan for new plugins"
          style="border-color:#8b5cf6"
        >🔍 Scan</button>
        <button type="button"
          class="republic-btn republic-btn--sm ${props.filterCategory === null ? "republic-btn--active" : ""}"
          @click=${() => props.onFilterCategory(null)}
        >All</button>
        ${categories.map(
          (cat) => html`
            <button type="button"
              class="republic-btn republic-btn--sm ${props.filterCategory === cat ? "republic-btn--active" : ""}"
              style="border-color:${CATEGORY_COLORS[cat] ?? "#6b7280"}"
              @click=${() => props.onFilterCategory(cat)}
            >${CATEGORY_EMOJI[cat] ?? "🔌"} ${cat}</button>
          `,
        )}
      </div>
    </div>`;
}

// ─── Plugin Grid ──────────────────────────────────────────────────

function filterPlugins(props: PluginsProps): PluginInfo[] {
  let list = props.plugins ?? [];
  if (props.filterCategory) {
    list = list.filter((p) => getCategory(p.id) === props.filterCategory);
  }
  const searchQuery = props.searchQuery ?? "";
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }
  return list;
}

function renderPluginGrid(plugins: PluginInfo[], props: PluginsProps): TemplateResult {
  if (plugins.length === 0) {
    return html`
      <div class="republic-card">
        <div class="republic-card__body">
          <p class="republic-card__empty">No plugins match your filter</p>
        </div>
      </div>
    `;
  }

  return html`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:1rem">
      ${plugins.map((p) => renderPluginCard(p, props))}
    </div>`;
}

function renderPluginCard(plugin: PluginInfo, props: PluginsProps): TemplateResult {
  const cat = getCategory(plugin.id);
  const catColor = CATEGORY_COLORS[cat] ?? "#6b7280";
  const expanded = props.expandedId === plugin.id;
  const isActivating = props.activatingId === plugin.id;
  const canActivate =
    plugin.status === "discovered" || plugin.status === "stopped" || plugin.status === "error";
  const canDeactivate = plugin.status === "ready" || plugin.status === "loaded";

  return html`
    <div class="republic-card" style="border-left:3px solid ${catColor};cursor:pointer;transition:all 0.2s"
         role="button"
         tabindex="0"
         aria-expanded=${expanded}
         aria-label="${plugin.name} plugin card"
         @click=${() => props.onExpand(expanded ? null : plugin.id)}
         @keydown=${(e: KeyboardEvent) => {
           if (e.key === "Enter" || e.key === " ") {
             e.preventDefault();
             props.onExpand(expanded ? null : plugin.id);
           }
         }}>
      <div style="padding:1rem">
        <!-- Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem">
          <div>
            <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem">
              <span style="font-size:1.1rem">${CATEGORY_EMOJI[cat] ?? "🔌"}</span>
              <strong style="font-size:0.95rem">${plugin.name}</strong>
            </div>
            <span style="font-size:0.75rem;color:var(--text-muted)">${plugin.id} v${plugin.version}</span>
          </div>
          <span class="republic-badge" style="background:${STATUS_COLORS[plugin.status]};color:white;font-size:0.7rem;padding:0.15rem 0.5rem">
            ${STATUS_LABELS[plugin.status]}
          </span>
        </div>

        <!-- Description -->
        <p style="font-size:0.82rem;color:var(--text-secondary);margin:0.5rem 0;line-height:1.4">
          ${plugin.description || "No description available"}
        </p>

        <!-- Capability chips -->
        <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.5rem">
          ${
            plugin.capabilities.inference
              ? html`
                  <span class="republic-badge republic-badge--sm" style="background: #6366f120; color: #818cf8"
                    >🧠 Inference</span
                  >
                `
              : nothing
          }
          ${(plugin.capabilities.tools?.length ?? 0) > 0 ? html`<span class="republic-badge republic-badge--sm" style="background:#34d39920;color:#34d399">🔧 ${plugin.capabilities.tools?.length ?? 0} Tools</span>` : nothing}
          ${(plugin.capabilities.gateway?.length ?? 0) > 0 ? html`<span class="republic-badge republic-badge--sm" style="background:#f9731620;color:#f97316">⚡ ${plugin.capabilities.gateway?.length ?? 0} RPCs</span>` : nothing}
          ${(plugin.capabilities.providers?.length ?? 0) > 0 ? html`<span class="republic-badge republic-badge--sm" style="background:#06b6d420;color:#06b6d4">☁️ ${plugin.capabilities.providers?.length ?? 0} Providers</span>` : nothing}
          ${(plugin.capabilities.hooks?.length ?? 0) > 0 ? html`<span class="republic-badge republic-badge--sm" style="background:#a855f720;color:#a855f7">${icon("link")} ${plugin.capabilities.hooks?.length ?? 0} Hooks</span>` : nothing}
          <span class="republic-badge republic-badge--sm" style="background:${catColor}20;color:${catColor}">${cat}</span>
        </div>

        <!-- Activate / Deactivate controls -->
        <div style="margin-top:0.75rem;display:flex;gap:0.5rem;align-items:center" @click=${(e: Event) => e.stopPropagation()}>
          ${
            isActivating
              ? html`
                  <button
                    type="button"
                    class="republic-btn republic-btn--sm"
                    disabled
                    style="background: #fbbf2440; border-color: #fbbf24; color: #fbbf24; cursor: wait"
                  >
                    ⏳ Activating…
                  </button>
                `
              : canActivate
                ? html`<button type="button" class="republic-btn republic-btn--sm"
                      style="background:#34d39920;border-color:#34d399;color:#34d399"
                      @click=${() => props.onActivate(plugin.id)}>
                      ▶ Activate
                    </button>`
                : canDeactivate
                  ? html`<button type="button" class="republic-btn republic-btn--sm"
                        style="background:#ef444420;border-color:#ef4444;color:#ef4444"
                        @click=${() => props.onDeactivate(plugin.id)}>
                        ⏹ Deactivate
                      </button>`
                  : nothing
          }
        </div>

        <!-- Error display -->
        ${
          plugin.error
            ? html`<div style="margin-top:0.5rem;padding:0.5rem;background:#ef444420;border-radius:6px;font-size:0.8rem;color:#ef4444">
              ⚠️ ${plugin.error}
            </div>`
            : nothing
        }

        <!-- Expanded details -->
        ${expanded ? renderPluginDetails(plugin, props) : nothing}
      </div>
    </div>`;
}

// ─── Plugin Detail Panel ──────────────────────────────────────────

function renderPluginDetails(plugin: PluginInfo, props: PluginsProps): TemplateResult {
  return html`
    <div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border-color,#333)"
         @click=${(e: Event) => e.stopPropagation()}>

      <!-- Source repo -->
      ${
        plugin.sourceRepo
          ? html`<div style="margin-bottom:0.5rem;font-size:0.82rem">
            📦 <a href="${plugin.sourceRepo}" target="_blank" rel="noopener" style="color:#60a5fa">${plugin.sourceRepo}</a>
          </div>`
          : nothing
      }

      <!-- Boot priority -->
      <div style="margin-bottom:0.5rem;font-size:0.82rem;color:var(--text-secondary)">
        🔢 Boot Priority: <strong>${plugin.bootPriority}</strong>
        ${plugin.bootPriority <= 30 ? " (Infrastructure)" : plugin.bootPriority <= 60 ? " (Inference)" : " (Tools)"}
      </div>

      <!-- Loaded at -->
      <div style="margin-bottom:0.5rem;font-size:0.82rem;color:var(--text-secondary)">
        🕐 Loaded: ${plugin.loadedAt > 0 ? new Date(plugin.loadedAt).toLocaleTimeString() : "Not loaded"}
      </div>

      <!-- Requirements -->
      ${renderRequirements(plugin.requirements)}

      <!-- Detailed capabilities -->
      ${renderDetailedCapabilities(plugin)}

      <!-- Interactive Plugin Panel -->
      ${renderInteractivePanel(plugin, props)}
    </div>`;
}

function renderInteractivePanel(plugin: PluginInfo, props: PluginsProps): TemplateResult {
  const panel = getPluginPanel(plugin.id, {
    onInvokeTool: props.onInvokeTool,
    onCallGateway: props.onCallGateway,
  });
  if (!panel) {
    return html``;
  }
  return panel;
}

function renderRequirements(req: PluginRequirements): TemplateResult {
  const hasBins = (req.binaries?.length ?? 0) > 0;
  const hasEnv = (req.env?.length ?? 0) > 0;
  const hasMem = req.minMemoryMb != null;

  if (!hasBins && !hasEnv && !hasMem) {
    return html``;
  }

  return html`
    <div style="margin-bottom:0.5rem">
      <div style="font-size:0.82rem;font-weight:600;margin-bottom:0.25rem;color:var(--text-secondary)">Requirements</div>
      ${hasBins ? html`<div style="font-size:0.78rem;color:var(--text-muted)">Binaries: ${req.binaries!.join(", ")}</div>` : nothing}
      ${hasEnv ? html`<div style="font-size:0.78rem;color:var(--text-muted)">Env vars: ${req.env!.join(", ")}</div>` : nothing}
      ${hasMem ? html`<div style="font-size:0.78rem;color:var(--text-muted)">Min memory: ${req.minMemoryMb} MB</div>` : nothing}
    </div>`;
}

function renderDetailedCapabilities(plugin: PluginInfo): TemplateResult {
  const cap = plugin.capabilities;
  const hasTools = (cap.tools?.length ?? 0) > 0;
  const hasGateway = (cap.gateway?.length ?? 0) > 0;
  const hasProviders = (cap.providers?.length ?? 0) > 0;

  if (!hasTools && !hasGateway && !hasProviders) {
    return html``;
  }

  return html`
    <div>
      <div style="font-size:0.82rem;font-weight:600;margin-bottom:0.4rem;color:var(--text-secondary)">Capabilities</div>
      ${
        hasTools
          ? html`<div style="margin-bottom:0.4rem">
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.2rem">Tools:</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.25rem">
              ${cap.tools!.map(
                (t) =>
                  html`<code style="font-size:0.72rem;padding:0.1rem 0.4rem;background:var(--bg-secondary,#1a1a2e);border-radius:3px;color:#34d399">${t}</code>`,
              )}
            </div>
          </div>`
          : nothing
      }
      ${
        hasGateway
          ? html`<div style="margin-bottom:0.4rem">
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.2rem">Gateway RPCs:</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.25rem">
              ${cap.gateway!.map(
                (g) =>
                  html`<code style="font-size:0.72rem;padding:0.1rem 0.4rem;background:var(--bg-secondary,#1a1a2e);border-radius:3px;color:#f97316">${g}</code>`,
              )}
            </div>
          </div>`
          : nothing
      }
      ${
        hasProviders
          ? html`<div style="margin-bottom:0.4rem">
            <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.2rem">Providers:</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.25rem">
              ${cap.providers!.map(
                (pr) =>
                  html`<code style="font-size:0.72rem;padding:0.1rem 0.4rem;background:var(--bg-secondary,#1a1a2e);border-radius:3px;color:#06b6d4">${pr}</code>`,
              )}
            </div>
          </div>`
          : nothing
      }
    </div>`;
}
