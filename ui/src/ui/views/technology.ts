import { html, nothing, type TemplateResult } from "lit";
import { paginate, getPage, setPage, renderPaginationControls } from "./pagination.js";
import { icon } from "../icons.js";

// ─── Types ────────────────────────────────────────────────────────

export type CrystalType = "Master" | "Sapphire" | "Amethyst" | "Emerald" | "Quartz";

export interface DataCrystal {
  id: string;
  type: CrystalType;
  dimensions: number;
  storedKnowledge: number;
  frequency: number;
  createdAt: number;
}

export interface LibraryStats {
  scrolls: number;
  codices: number;
  akashicEntries: number;
  totalKnowledge: number;
}

export interface EnergyNode {
  id: string;
  capacity: number;
  output: number;
  efficiency: number;
}

export interface MLModel {
  name: string;
  type: string;
  accuracy: number;
  lastTrained: number;
  predictions: number;
  status: "ready" | "training" | "error";
}

export interface QuantumUniverse {
  id: string;
  state: "Superposition" | "Collapsed" | "Stable" | "Decaying";
  agents: number;
  entanglements: number;
  timelineCount: number;
  createdAt: number;
}

export interface TechStatus {
  crystals: DataCrystal[];
  library: LibraryStats;
  energyNodes: EnergyNode[];
  totalEnergyOutput: number;
  mlModels: MLModel[];
  universes: QuantumUniverse[];
}

export interface TechnologyProps {
  loading: boolean;
  status: TechStatus | null;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onTrainModel: (model: string) => void;
  onCreateUniverse: (name: string) => void;
  onBranchUniverse: (id: string) => void;
  onCollapseUniverse: (id: string) => void;
  onRefresh: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────

function crystalColor(type: CrystalType): string {
  const colors: Record<CrystalType, string> = {
    Master: "#f59e0b",
    Sapphire: "#3b82f6",
    Amethyst: "#8b5cf6",
    Emerald: "#10b981",
    Quartz: "var(--muted)",
  };
  return colors[type];
}

function crystalEmoji(type: CrystalType): string {
  const map: Record<CrystalType, string> = {
    Master: "💎", Sapphire: "🔷", Amethyst: "🔮", Emerald: "🟢", Quartz: "⬜",
  };
  return map[type];
}

function universeStateColor(state: string): string {
  const colors: Record<string, string> = {
    Superposition: "#8b5cf6",
    Collapsed: "#6366f1",
    Stable: "#10b981",
    Decaying: "#ef4444",
  };
  return colors[state] || "var(--muted)";
}

function universeStateIcon(state: string): string {
  const icons: Record<string, string> = {
    Superposition: "🌀",
    Collapsed: "💫",
    Stable: "🟢",
    Decaying: "🔴",
  };
  return icons[state] || "⚛️";
}

function accuracyGrade(accuracy: number): { grade: string; color: string } {
  if (accuracy >= 0.95) {return { grade: "A+", color: "#10b981" };}
  if (accuracy >= 0.9) {return { grade: "A", color: "#10b981" };}
  if (accuracy >= 0.8) {return { grade: "B", color: "#6366f1" };}
  if (accuracy >= 0.7) {return { grade: "C", color: "#f59e0b" };}
  return { grade: "D", color: "#ef4444" };
}

// ─── Render ───────────────────────────────────────────────────────

const TECH_SECTIONS = ["atlantis", "ml", "quantum"] as const;

export function renderTechnology(props: TechnologyProps): TemplateResult {
  const { loading, status } = props;

  if (loading) {
    return html`<div class="republic-loading">
      <div class="republic-loading__spinner"></div>
      <p>Loading technology systems…</p>
    </div>`;
  }

  if (!status) {
    return html`
      <div class="republic-empty republic-empty--animated">
        <span class="republic-empty__icon">${icon("cpu")}</span>
        <h3>Technology Systems Offline</h3>
        <p>Initialize the Atlantis systems, ML.NET models, and Quantum multiverse to begin.</p>
        <button type="button" class="republic-btn republic-btn--glow" @click=${props.onRefresh}>Check Status</button>
      </div>
    `;
  }

  return html`
    <div class="republic-view republic-technology">
      <!-- Section Tabs -->
      <div class="republic-tabs republic-tabs--animated">
        ${TECH_SECTIONS.map(
          (s) => html`
            <button type="button"
              class="republic-tabs__tab ${props.activeSection === s ? "republic-tabs__tab--active" : ""}"
              @click=${() => props.onSectionChange(s)}>
              ${s === "atlantis" ? "🏛️ Atlantis" : s === "ml" ? "🧠 ML.NET" : "⚛️ Quantum"}
            </button>
          `,
        )}
      </div>

      <div class="republic-section republic-section--fade">
        ${props.activeSection === "atlantis" ? renderAtlantis(status) : nothing}
        ${props.activeSection === "ml" ? renderML(status, props) : nothing}
        ${props.activeSection === "quantum" ? renderQuantum(status, props) : nothing}
      </div>
    </div>
  `;
}

function renderAtlantis(tech: TechStatus): TemplateResult {
  const pagedCrystals = paginate(tech.crystals, getPage("tech-crystals"), 20);
  const pagedNodes = paginate(tech.energyNodes, getPage("tech-energy"), 20);

  return html`
    <div class="republic-cards">
      <!-- Data Crystals -->
      <div class="republic-card republic-card--wide republic-card--animated">
        <div class="republic-card__header">
          <h3>💎 Data Crystal Network</h3>
          <span class="republic-badge">${tech.crystals.length} crystals</span>
        </div>
        ${tech.crystals.length > 0
          ? html`
            <div class="republic-crystal-grid">
              ${pagedCrystals.items.map(
                (c) => html`
                  <div class="republic-crystal republic-crystal--animated" style="border-color:${crystalColor(c.type)}">
                    <div class="republic-crystal__icon">${crystalEmoji(c.type)}</div>
                    <div class="republic-crystal__type" style="color:${crystalColor(c.type)}">${c.type}</div>
                    <div class="republic-crystal__stats">
                      <span>${c.dimensions}D</span>
                      <span>${c.storedKnowledge} items</span>
                      <span>${c.frequency.toFixed(1)} Hz</span>
                    </div>
                  </div>
                `,
              )}
            </div>
            ${renderPaginationControls(pagedCrystals.page, pagedCrystals.totalPages, (p) => setPage("tech-crystals", p))}
          `
          : html`<p class="republic-card__empty">No data crystals manifested yet</p>`}
      </div>

      <!-- Great Library -->
      <div class="republic-card republic-card--animated">
        <div class="republic-card__header"><h3>📜 Great Library</h3></div>
        <div class="republic-metrics republic-metrics--compact">
          <div class="republic-metric">
            <div class="republic-metric__value">${tech.library.scrolls.toLocaleString()}</div>
            <div class="republic-metric__label">Scrolls</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${tech.library.codices.toLocaleString()}</div>
            <div class="republic-metric__label">Codices</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${tech.library.akashicEntries.toLocaleString()}</div>
            <div class="republic-metric__label">Akashic Records</div>
          </div>
        </div>
      </div>

      <!-- Energy Grid -->
      <div class="republic-card republic-card--animated">
        <div class="republic-card__header">
          <h3>⚡ Energy Grid</h3>
          <span class="republic-badge">${tech.totalEnergyOutput.toFixed(0)} kW</span>
        </div>
        ${tech.energyNodes.length > 0
          ? html`
            <div class="republic-list">
              ${pagedNodes.items.map(
                (n) => html`
                  <div class="republic-list__item">
                    <span>Node ${n.id.slice(0, 8)}</span>
                    <div class="republic-bar" style="width:120px">
                      <div class="republic-bar__fill" style="width:${n.efficiency * 100}%;background:#10b981"></div>
                    </div>
                    <span>${n.output.toFixed(1)} kW</span>
                  </div>
                `,
              )}
            </div>
            ${renderPaginationControls(pagedNodes.page, pagedNodes.totalPages, (p) => setPage("tech-energy", p))}
          `
          : html`<p class="republic-card__empty">No energy nodes online</p>`}
      </div>
    </div>
  `;
}

function renderML(tech: TechStatus, props: TechnologyProps): TemplateResult {
  const trainingCount = tech.mlModels.filter((m) => m.status === "training").length;
  const avgAccuracy =
    tech.mlModels.length > 0
      ? tech.mlModels.reduce((sum, m) => sum + m.accuracy, 0) / tech.mlModels.length
      : 0;

  const pagedModels = paginate(tech.mlModels, getPage("tech-ml"), 12);

  return html`
    <div class="republic-cards">
      <!-- ML Overview Card -->
      <div class="republic-card republic-card--wide republic-card--animated">
        <div class="republic-card__header">
          <h3>🧠 ML.NET Intelligence</h3>
          <div class="republic-card__header-actions">
            ${trainingCount > 0
              ? html`<span class="republic-tag republic-tag--yellow republic-tag--pulse">${trainingCount} training</span>`
              : nothing}
            <button type="button" class="republic-btn republic-btn--sm republic-btn--accent"
              @click=${() => tech.mlModels.forEach((m) => { if (m.status !== "training") {props.onTrainModel(m.name);} })}
              ?disabled=${trainingCount === tech.mlModels.length}>
              🔄 Retrain All
            </button>
          </div>
        </div>
        <div class="republic-metrics republic-metrics--compact">
          <div class="republic-metric">
            <div class="republic-metric__value">${tech.mlModels.length}</div>
            <div class="republic-metric__label">Models</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${(avgAccuracy * 100).toFixed(1)}%</div>
            <div class="republic-metric__label">Avg Accuracy</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${tech.mlModels.reduce((s, m) => s + m.predictions, 0).toLocaleString()}</div>
            <div class="republic-metric__label">Total Predictions</div>
          </div>
        </div>
      </div>

      <!-- Individual Model Cards -->
      ${pagedModels.items.map(
        (m) => {
          const grade = accuracyGrade(m.accuracy);
          return html`
            <div class="republic-card republic-card--animated ${m.status === "training" ? "republic-card--pulse" : ""}">
              <div class="republic-card__header">
                <h4>${m.name}</h4>
                <span class="republic-tag republic-tag--${m.status === "ready" ? "green" : m.status === "training" ? "yellow" : "red"}">
                  ${m.status}
                </span>
              </div>
              <div class="republic-metrics republic-metrics--compact">
                <div class="republic-metric">
                  <div class="republic-metric__value" style="color:${grade.color}">${grade.grade}</div>
                  <div class="republic-metric__label">${(m.accuracy * 100).toFixed(1)}%</div>
                </div>
                <div class="republic-metric">
                  <div class="republic-metric__value">${m.predictions.toLocaleString()}</div>
                  <div class="republic-metric__label">Predictions</div>
                </div>
              </div>
              <div class="republic-card__actions">
                <button type="button" class="republic-btn republic-btn--sm" @click=${() => props.onTrainModel(m.name)}
                  ?disabled=${m.status === "training"}>
                  ${m.status === "training" ? "⏳ Training…" : "🏋️ Train Model"}
                </button>
                <time>Last: ${new Date(m.lastTrained).toLocaleDateString()}</time>
              </div>
            </div>
          `;
        },
      )}
      ${renderPaginationControls(pagedModels.page, pagedModels.totalPages, (p) => setPage("tech-ml", p), { totalItems: pagedModels.totalItems })}
    </div>
  `;
}

function renderQuantum(tech: TechStatus, props: TechnologyProps): TemplateResult {
  const totalAgents = tech.universes.reduce((s, u) => s + u.agents, 0);
  const totalEntanglements = tech.universes.reduce((s, u) => s + u.entanglements, 0);

  const pagedUniverses = paginate(tech.universes, getPage("tech-quantum"), 12);

  return html`
    <div class="republic-cards">
      <!-- Quantum Overview -->
      <div class="republic-card republic-card--wide republic-card--animated">
        <div class="republic-card__header">
          <h3>⚛️ Quantum Multiverse</h3>
          <span class="republic-badge">${tech.universes.length} universes</span>
        </div>
        <div class="republic-metrics republic-metrics--compact">
          <div class="republic-metric">
            <div class="republic-metric__value">${totalAgents.toLocaleString()}</div>
            <div class="republic-metric__label">Total Agents</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${totalEntanglements.toLocaleString()}</div>
            <div class="republic-metric__label">Entanglements</div>
          </div>
          <div class="republic-metric">
            <div class="republic-metric__value">${tech.universes.reduce((s, u) => s + u.timelineCount, 0)}</div>
            <div class="republic-metric__label">Timelines</div>
          </div>
        </div>

        <!-- Create Universe -->
        <div class="republic-quantum-actions">
          <div class="republic-inline-form">
            <input type="text" class="republic-input republic-input--sm" placeholder="New universe name…"
              id="quantum-new-universe-name" />
            <button type="button" class="republic-btn republic-btn--sm republic-btn--success"
              @click=${(e: Event) => {
                const form = (e.target as HTMLElement).closest(".republic-inline-form");
                const inp = form?.querySelector<HTMLInputElement>("input[type='text']");
                const val = inp?.value.trim();
                if (val) { props.onCreateUniverse(val); if (inp) {inp.value = "";} }
              }}>
              ✨ Create Universe
            </button>
          </div>
        </div>
      </div>

      <!-- Universe Cards -->
      ${tech.universes.length > 0
        ? html`
          <div class="republic-universe-grid">
            ${pagedUniverses.items.map(
              (u) => html`
                <div class="republic-universe republic-universe--animated">
                  <div class="republic-universe__header">
                    <span class="republic-universe__state-icon">${universeStateIcon(u.state)}</span>
                    <div class="republic-universe__state" style="color:${universeStateColor(u.state)}">
                      ${u.state}
                    </div>
                  </div>
                  <div class="republic-universe__id">${u.id.slice(0, 12)}…</div>
                  <div class="republic-universe__stats">
                    <span>👥 ${u.agents}</span>
                    <span>🔗 ${u.entanglements}</span>
                    <span>📊 ${u.timelineCount} timelines</span>
                  </div>
                  <div class="republic-universe__actions">
                    <button type="button" class="republic-btn republic-btn--xs republic-btn--accent"
                      @click=${() => props.onBranchUniverse(u.id)}
                      ?disabled=${u.state === "Collapsed" || u.state === "Decaying"}
                      title="Create a branching timeline from this universe">
                      🌿 Branch
                    </button>
                    <button type="button" class="republic-btn republic-btn--xs republic-btn--warning"
                      @click=${() => props.onCollapseUniverse(u.id)}
                      ?disabled=${u.state === "Collapsed"}
                      title="Collapse the wave function of this universe">
                      💥 Collapse
                    </button>
                  </div>
                  <time class="republic-universe__created">Created ${new Date(u.createdAt).toLocaleDateString()}</time>
                </div>
              `,
            )}
          </div>
          ${renderPaginationControls(pagedUniverses.page, pagedUniverses.totalPages, (p) => setPage("tech-quantum", p), { totalItems: pagedUniverses.totalItems })}
        `
        : html`<p class="republic-card__empty">No universes spawned yet — create one above!</p>`}
    </div>
  `;
}
