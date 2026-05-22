import { html, nothing, type TemplateResult } from "lit";
import type {
  Specialization,
  Activity,
  LifecycleEventType,
  CitizenSummary as BaseCitizenSummary,
  PopulationStats,
  PopulationEvent,
} from "../republic-types.ts";
import { renderCitizenAvatar, type AvatarAppearance } from "./citizen-avatar.ts";
import {
  SPEC_COLORS,
  activityColor,
  activityEmoji,
  formatCredits,
  iqLabel,
  // oxlint-disable-next-line no-unused-vars
  miniBar,
  // oxlint-disable-next-line no-unused-vars
  citizenInitials,
  // oxlint-disable-next-line no-unused-vars
  citizenHue,
  // oxlint-disable-next-line no-unused-vars
  healthBorderColor,
  renderCitizenCard,
  renderPagination,
} from "./citizen-card.ts";

// ─── Types ────────────────────────────────────────────────────────

// Re-export canonical types
export type { Specialization, Activity, PopulationStats, PopulationEvent };
export type LifecycleEvent = LifecycleEventType;

// Extend CitizenSummary with avatar/voice fields used by the population view
export interface CitizenSummary extends BaseCitizenSummary {
  // Phase 55: Avatar & Voice
  appearance?: AvatarAppearance;
  voiceProfile?: {
    pitch: number;
    timbre: string;
    speechRate: number;
    accent: string;
    cadence: string;
    catchPhrases: string[];
    volumeTendency: number;
  };
}

export interface PopulationProps {
  loading: boolean;
  stats: PopulationStats | null;
  citizens: CitizenSummary[];
  searchQuery: string;
  selectedSpecialization: string | null;
  page: number;
  selectedCitizen: CitizenSummary | null;
  onSearchChange: (query: string) => void;
  onSpecializationFilter: (spec: string | null) => void;
  onPageChange: (page: number) => void;
  onSelectCitizen: (citizen: CitizenSummary | null) => void;
  onViewMemory: (citizenId: string) => void;
  onRefresh: () => void;
  populationTab: string;
  onPopTabChange: (tab: string) => void;
  // Citizen chat
  chatHistory: Record<string, Array<{ role: string; content: string; ts: number }>>;
  chatSending: boolean;
  chatError: string | null;
  onSendMessage: (citizenId: string, message: string) => void;
  onClearChat: (citizenId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────

// Module-level debounce timer — avoids window global pollution
let _popSearchTimer: ReturnType<typeof setTimeout> | null = null;

export { SPEC_COLORS };

const POP_TABS = ["Overview", "Citizens", "Demographics", "Events"];

// ─── Main Render ──────────────────────────────────────────────────

export function renderPopulation(props: PopulationProps): TemplateResult {
  const { loading, stats, citizens, selectedCitizen } = props;

  // If a citizen is selected show their detail page
  if (selectedCitizen) {
    return renderCitizenDetailPage(selectedCitizen, props);
  }

  return html`
    <div class="republic-view republic-population" style="max-width:1200px;margin:0 auto;padding:0 8px">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
        <h2 style="margin:0;font-size:22px;color:var(--text-strong);display:flex;align-items:center;gap:8px">
          👥 Population
          ${stats ? html`<span style="font-size:14px;font-weight:400;color:var(--muted)">${stats.total} citizens</span>` : nothing}
        </h2>
        <button type="button" @click=${props.onRefresh} style="
          padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
          background:rgba(255,255,255,0.04);color:var(--text-strong);cursor:pointer;
          font-size:12px;display:flex;align-items:center;gap:4px;transition:all 0.2s
        ">
          🔄 Refresh
        </button>
      </div>

      <!-- Tab Bar -->
      <div style="display:flex;gap:4px;margin-bottom:20px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:2px">
        ${POP_TABS.map(
          (t) => html`
          <button type="button"
            @click=${() => props.onPopTabChange(t)}
            style="
              padding:8px 16px;border:none;cursor:pointer;font-size:13px;font-weight:500;
              border-radius:8px 8px 0 0;transition:all 0.2s;
              background:${props.populationTab === t ? "rgba(99,102,241,0.15)" : "transparent"};
              color:${props.populationTab === t ? "#818cf8" : "var(--muted)"};
              border-bottom:2px solid ${props.populationTab === t ? "#818cf8" : "transparent"};
            "
          >${t}</button>
        `,
        )}
      </div>

      <!-- Tab Content -->
      ${
        loading && citizens.length === 0 && !stats
          ? html`
              <div style="text-align: center; padding: 60px 20px; color: var(--muted)">
                <div style="font-size: 32px; margin-bottom: 12px; animation: pulse 1.5s infinite">⏳</div>
                <p style="margin: 0">Loading population data…</p>
              </div>
            `
          : renderTabContent(props)
      }
    </div>
  `;
}

function renderTabContent(props: PopulationProps): TemplateResult {
  switch (props.populationTab) {
    case "Citizens":
      return renderCitizensTab(props);
    case "Demographics":
      return renderDemographicsTab(props);
    case "Events":
      return renderEventsTab(props);
    default:
      return renderOverviewTab(props);
  }
}

// ─── Overview Tab ─────────────────────────────────────────────────

function renderOverviewTab(props: PopulationProps): TemplateResult {
  const { stats, citizens } = props;
  if (!stats) {
    return html`
      <div style="color: var(--muted); text-align: center; padding: 40px">
        No population data available. Start the simulation to populate the Republic.
      </div>
    `;
  }

  const avgIQ =
    citizens.length > 0
      ? citizens.reduce((s, c) => s + (c.intelligence ?? 100), 0) / citizens.length
      : 0;

  return html`
    <!-- Key Metrics -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px">
      ${renderMetricCard("👥", "Total", String(stats.total), "#818cf8")}
      ${renderMetricCard("⚡", "Active", String(stats.active), "#10b981")}
      ${renderMetricCard("😴", "Sleeping", String(stats.hibernated), "#64748b")}
      ${renderMetricCard("❤️", "Avg Health", `${Math.round(stats.avgHealth)}%`, stats.avgHealth > 70 ? "#10b981" : "#f59e0b")}
      ${renderMetricCard("😊", "Avg Happy", `${Math.round(stats.avgHappiness)}%`, stats.avgHappiness > 70 ? "#fbbf24" : "#f59e0b")}
      ${renderMetricCard("🧠", "Avg IQ", avgIQ > 0 ? String(Math.round(avgIQ)) : "—", "#c084fc")}
      ${renderMetricCard("💰", "Avg Credits", formatCredits(stats.avgCredits), "#facc15")}
      ${renderMetricCard("🧬", "Generations", String(Object.keys(stats.generationDistribution).length), "#22d3ee")}
    </div>

    <!-- Activity Distribution -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px">
        <h3 style="margin:0 0 12px;font-size:14px;color:var(--text-strong)">Activity Distribution</h3>
        ${Object.entries(stats.activityDistribution)
          .toSorted((a, b) => b[1] - a[1])
          .map(([act, count]) => {
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return html`
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:12px;min-width:100px;color:${activityColor(act as Activity)}">${activityEmoji(act as Activity)} ${act}</span>
              <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.06);overflow:hidden">
                <div style="width:${pct}%;height:100%;border-radius:4px;background:${activityColor(act as Activity)};transition:width 0.3s"></div>
              </div>
              <span style="font-size:11px;color:var(--muted);min-width:40px;text-align:right">${count}</span>
            </div>
          `;
          })}
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px">
        <h3 style="margin:0 0 12px;font-size:14px;color:var(--text-strong)">Top Specializations</h3>
        ${Object.entries(stats.specializationDistribution)
          .toSorted((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([spec, count]) => {
            const color = SPEC_COLORS[spec] ?? "#6366f1";
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return html`
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
              <span style="font-size:12px;min-width:110px;color:${color}">${spec}</span>
              <div style="flex:1;height:8px;border-radius:4px;background:rgba(255,255,255,0.06);overflow:hidden">
                <div style="width:${pct}%;height:100%;border-radius:4px;background:${color};transition:width 0.3s"></div>
              </div>
              <span style="font-size:11px;color:var(--muted);min-width:40px;text-align:right">${count}</span>
            </div>
          `;
          })}
      </div>
    </div>

    <!-- Recent Events Preview -->
    ${
      stats.recentEvents && stats.recentEvents.length > 0
        ? html`
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px">
        <h3 style="margin:0 0 12px;font-size:14px;color:var(--text-strong)">Recent Events</h3>
        ${stats.recentEvents.slice(0, 5).map(
          (ev) => html`
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="font-size:11px;color:var(--muted);min-width:70px">${new Date(ev.timestamp).toLocaleTimeString()}</span>
            <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(99,102,241,0.1);color:#818cf8">${ev.type}</span>
            <span style="font-size:12px;color:var(--text-strong);flex:1">${ev.description}</span>
          </div>
        `,
        )}
        ${
          stats.recentEvents.length > 5
            ? html`
          <button type="button" @click=${() => props.onPopTabChange("Events")} style="
            margin-top:8px;padding:4px 12px;border:1px solid rgba(99,102,241,0.3);
            background:transparent;color:#818cf8;border-radius:6px;cursor:pointer;font-size:11px
          ">View All Events →</button>
        `
            : nothing
        }
      </div>
    `
        : nothing
    }
  `;
}

function renderMetricCard(
  emoji: string,
  label: string,
  value: string,
  color: string,
): TemplateResult {
  return html`
    <div style="
      background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);
      border-radius:12px;padding:14px;text-align:center;
      transition:all 0.2s;
    ">
      <div style="font-size:20px;margin-bottom:4px">${emoji}</div>
      <div style="font-size:20px;font-weight:700;color:${color};margin-bottom:2px">${value}</div>
      <div style="font-size:11px;color:var(--muted)">${label}</div>
    </div>
  `;
}

// ─── Citizens Tab ─────────────────────────────────────────────────

function renderCitizensTab(props: PopulationProps): TemplateResult {
  const { stats, citizens, searchQuery, selectedSpecialization, page, loading } = props;
  const totalPages = stats ? Math.max(1, Math.ceil((stats.totalFiltered ?? stats.total) / 25)) : 1;

  return html`
    <!-- Search + Filter Bar -->
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <div style="flex:1;min-width:200px;position:relative">
        <input
          type="text"
          placeholder="Search citizens…"
          .value=${searchQuery}
          @input=${(e: Event) => {
            const v = (e.target as HTMLInputElement).value;
            props.onSearchChange(v);
            // Debounced search (module-level timer — no window global)
            if (_popSearchTimer !== null) {
              clearTimeout(_popSearchTimer);
            }
            _popSearchTimer = setTimeout(() => {
              _popSearchTimer = null;
              props.onRefresh();
            }, 400);
          }}
          style="
            width:100%;padding:8px 12px 8px 32px;border-radius:8px;
            border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);
            color:var(--text-strong);font-size:13px;outline:none;box-sizing:border-box;
          "
        />
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;color:var(--muted)">🔍</span>
      </div>

      <select
        @change=${(e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          props.onSpecializationFilter(v || null);
          props.onRefresh();
        }}
        style="
          padding:8px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
          background:rgba(255,255,255,0.04);color:var(--text-strong);font-size:13px;cursor:pointer
        "
      >
        <option value="" ?selected=${!selectedSpecialization}>All Specializations</option>
        ${Object.keys(SPEC_COLORS).map(
          (s) => html`
          <option value=${s} ?selected=${selectedSpecialization === s}>${s}</option>
        `,
        )}
      </select>

      ${
        loading
          ? html`
              <span style="font-size: 12px; color: var(--muted); animation: pulse 1.5s infinite">Loading…</span>
            `
          : nothing
      }
    </div>

    <!-- Citizen Grid -->
    ${
      citizens.length === 0
        ? html`
            <div style="text-align: center; padding: 60px 20px; color: var(--muted)">
              <div style="font-size: 48px; margin-bottom: 12px">👥</div>
              <h3 style="margin: 0 0 8px; color: var(--muted)">No citizens found</h3>
              <p style="margin: 0">Start the simulation to populate the Republic.</p>
            </div>
          `
        : html`
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:20px">
          ${citizens.map((c) => renderCitizenCard(c, props))}
        </div>
      `
    }

    <!-- Pagination -->
    ${totalPages > 1 ? renderPagination(page, totalPages, props.onPageChange) : nothing}
  `;
}

// ─── Demographics Tab ─────────────────────────────────────────────

function renderDemographicsTab(props: PopulationProps): TemplateResult {
  const { stats } = props;
  if (!stats) {
    return html`
      <div style="color: var(--muted); text-align: center; padding: 40px">
        No demographic data available.
      </div>
    `;
  }

  return html`
    <!-- Generation Distribution -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:16px">
      <h3 style="margin:0 0 14px;font-size:14px;color:var(--text-strong)">🧬 Generation Distribution</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${Object.entries(stats.generationDistribution)
          .toSorted((a, b) => Number(a[0]) - Number(b[0]))
          .map(([gen, count]) => {
            const palette = [
              "#818cf8",
              "#22d3ee",
              "#10b981",
              "#f59e0b",
              "#ef4444",
              "#e879f9",
              "#f97316",
              "#a3e635",
            ];
            const color = palette[Number(gen) % palette.length];
            return html`
            <div style="
              background:${color}15;border:1px solid ${color}30;border-radius:8px;
              padding:10px 16px;text-align:center;min-width:70px
            ">
              <div style="font-size:16px;font-weight:700;color:${color}">${count}</div>
              <div style="font-size:10px;color:var(--muted)">Gen ${gen}</div>
            </div>
          `;
          })}
      </div>
    </div>

    <!-- Full Specialization Breakdown -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:16px">
      <h3 style="margin:0 0 14px;font-size:14px;color:var(--text-strong)">🎯 Specialization Breakdown</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
        ${Object.entries(stats.specializationDistribution)
          .toSorted((a, b) => b[1] - a[1])
          .map(([spec, count]) => {
            const color = SPEC_COLORS[spec] ?? "#6366f1";
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return html`
            <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(255,255,255,0.02);border-radius:6px">
              <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
              <span style="font-size:12px;color:var(--text-strong);flex:1">${spec}</span>
              <span style="font-size:12px;font-weight:600;color:${color}">${count}</span>
              <span style="font-size:10px;color:var(--muted)">${pct}%</span>
            </div>
          `;
          })}
      </div>
    </div>

    <!-- Activity Breakdown -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px">
      <h3 style="margin:0 0 14px;font-size:14px;color:var(--text-strong)">📊 Activity Breakdown</h3>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
        ${Object.entries(stats.activityDistribution)
          .toSorted((a, b) => b[1] - a[1])
          .map(([act, count]) => {
            const color = activityColor(act as Activity);
            const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
            return html`
            <div style="
              background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);
              border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:8px
            ">
              <span style="font-size:18px">${activityEmoji(act as Activity)}</span>
              <div style="flex:1">
                <div style="font-size:12px;color:${color};font-weight:500">${act}</div>
                <div style="font-size:10px;color:var(--muted)">${count} citizens · ${pct}%</div>
              </div>
            </div>
          `;
          })}
      </div>
    </div>
  `;
}

// ─── Events Tab ───────────────────────────────────────────────────

function renderEventsTab(props: PopulationProps): TemplateResult {
  const events = props.stats?.recentEvents ?? [];
  if (events.length === 0) {
    return html`
      <div style="text-align: center; padding: 60px 20px; color: var(--muted)">
        <div style="font-size: 48px; margin-bottom: 12px">📜</div>
        <h3 style="margin: 0 0 8px; color: var(--muted)">No events yet</h3>
        <p style="margin: 0">Events will appear as the simulation runs.</p>
      </div>
    `;
  }

  const eventColors: Record<string, string> = {
    Birth: "#10b981",
    Death: "#ef4444",
    Promotion: "#818cf8",
    Graduation: "#22d3ee",
    Achievement: "#fbbf24",
    Marriage: "#e879f9",
    Illness: "#f97316",
    Recovery: "#4ade80",
    Conflict: "#f87171",
    Collaboration: "#38bdf8",
  };

  return html`
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px">
      <h3 style="margin:0 0 14px;font-size:14px;color:var(--text-strong)">📜 Timeline (${events.length} events)</h3>
      <div style="display:flex;flex-direction:column;gap:2px">
        ${events.map((ev) => {
          const color = eventColors[ev.type] ?? "#818cf8";
          return html`
            <div style="
              display:flex;align-items:center;gap:10px;padding:8px 12px;
              border-radius:6px;transition:background 0.15s;
            "
              @mouseenter=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)")}
              @mouseleave=${(e: Event) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
              <span style="font-size:11px;color:var(--muted);min-width:90px">${new Date(ev.timestamp).toLocaleString()}</span>
              <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${color}15;color:${color};font-weight:500;min-width:80px;text-align:center">${ev.type}</span>
              <span style="font-size:12px;color:var(--text-strong);flex:1">${ev.description}</span>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

// ─── Citizen Detail Page ──────────────────────────────────────────

function renderCitizenDetailPage(citizen: CitizenSummary, props: PopulationProps): TemplateResult {
  const specColor = SPEC_COLORS[citizen.specialization] ?? "#6366f1";
  const iq = citizen.intelligence ?? 100;
  const iqInfo = iqLabel(iq);
  const mastery = Math.round((citizen.masteryLevel ?? 0) * 100);
  const autonomy = Math.round((citizen.autonomyScore ?? 0) * 100);

  return html`
    <div class="republic-view" style="max-width:900px;margin:0 auto;padding:0 8px">
      <!-- Back Button -->
      <button type="button"
        @click=${() => props.onSelectCitizen(null)}
        style="
          padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
          background:rgba(255,255,255,0.04);color:var(--text-strong);cursor:pointer;
          font-size:12px;margin-bottom:16px;display:flex;align-items:center;gap:4px
        "
      >← Back to Population</button>

      <!-- Citizen Header with Avatar -->
      <div style="
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
        border-radius:16px;padding:24px;margin-bottom:16px;
        display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap
      ">
        <!-- Full Avatar -->
        <div style="flex-shrink:0">
          ${renderCitizenAvatar({
            citizenId: citizen.id,
            citizenName: citizen.name ?? citizen.id.slice(0, 8),
            appearance: citizen.appearance ?? null,
            activity: citizen.activity,
            health: citizen.health,
            energy: citizen.energy,
            happiness: citizen.happiness,
            size: "lg",
          })}
        </div>

        <!-- Info -->
        <div style="flex:1;min-width:250px">
          <h2 style="margin:0 0 8px;font-size:22px;color:var(--text-strong)">${citizen.name ?? citizen.id.slice(0, 8)}</h2>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
            <span style="font-size:12px;padding:3px 10px;border-radius:6px;background:${specColor}22;color:${specColor};font-weight:500">${citizen.specialization}</span>
            <span style="font-size:12px;color:var(--muted)">Generation ${citizen.generation}</span>
            <span style="font-size:12px;color:var(--muted)">Age ${citizen.age.toFixed(1)}</span>
            <span style="font-size:12px;color:var(--muted)">Family ${citizen.familySize}</span>
          </div>

          <!-- Activity -->
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px">
            <span style="font-size:14px">${activityEmoji(citizen.activity)}</span>
            <span style="font-size:13px;color:${activityColor(citizen.activity)};font-weight:500">${citizen.activity}</span>
            ${
              citizen.currentTask
                ? html`
              <span style="font-size:12px;color:var(--muted);margin-left:8px">— ${citizen.currentTask}</span>
            `
                : nothing
            }
          </div>

          <!-- Credits -->
          <div style="font-size:13px;color:var(--text-strong)">Total AI Credits: <strong style="color:#facc15">${formatCredits(citizen.credits)}</strong></div>
        </div>
      </div>

      <!-- Vital Stats -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        ${renderStatPanel("❤️ Health", citizen.health, citizen.health > 70 ? "#10b981" : citizen.health > 40 ? "#f59e0b" : "#ef4444")}
        ${renderStatPanel("⚡ Energy", citizen.energy, citizen.energy > 60 ? "#6366f1" : citizen.energy > 30 ? "#f59e0b" : "#ef4444")}
        ${renderStatPanel("😊 Happiness", citizen.happiness, citizen.happiness > 70 ? "#fbbf24" : citizen.happiness > 40 ? "#f59e0b" : "#ef4444")}
      </div>

      <!-- Intelligence & Development -->
      <div style="
        background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
        border-radius:12px;padding:16px;margin-bottom:16px;
      ">
        <h3 style="margin:0 0 14px;font-size:14px;color:var(--text-strong)">🧠 Intelligence & Development</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">
          <div style="text-align:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px">
            <div style="font-size:24px;font-weight:700;color:${iqInfo.color}">${Math.round(iq)}</div>
            <div style="font-size:10px;color:${iqInfo.color};margin-bottom:2px">${iqInfo.text}</div>
            <div style="font-size:10px;color:var(--muted)">IQ Score</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px">
            <div style="font-size:24px;font-weight:700;color:#22d3ee">${mastery}%</div>
            <div style="font-size:10px;color:var(--muted)">Mastery Level</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px">
            <div style="font-size:24px;font-weight:700;color:#a78bfa">${autonomy}%</div>
            <div style="font-size:10px;color:var(--muted)">Autonomy Score</div>
          </div>
          <div style="text-align:center;padding:12px;background:rgba(255,255,255,0.02);border-radius:8px">
            <div style="font-size:24px;font-weight:700;color:#f59e0b">${(citizen.learningRate ?? 1).toFixed(1)}×</div>
            <div style="font-size:10px;color:var(--muted)">Learning Rate</div>
          </div>
        </div>
      </div>

      <!-- Skills -->
      ${
        citizen.skills && citizen.skills.length > 0
          ? html`
        <div style="
          background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
          border-radius:12px;padding:16px;margin-bottom:16px;
        ">
          <h3 style="margin:0 0 12px;font-size:14px;color:var(--text-strong)">🛠️ Skills (${citizen.skills.length})</h3>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${citizen.skills.map(
              (s) => html`
              <span style="
                font-size:11px;padding:4px 10px;border-radius:6px;
                background:rgba(99,102,241,0.08);color:#818cf8;
                border:1px solid rgba(99,102,241,0.15);
              ">${s}</span>
            `,
            )}
          </div>
        </div>
      `
          : nothing
      }

      <!-- Voice Profile -->
      ${
        citizen.voiceProfile
          ? html`
        <div style="
          background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
          border-radius:12px;padding:16px;margin-bottom:16px;
        ">
          <h3 style="margin:0 0 12px;font-size:14px;color:var(--text-strong)">🎙️ Voice Profile</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px">
            <div style="font-size:12px;color:var(--muted)">Pitch: <strong style="color:var(--text-strong)">${citizen.voiceProfile.pitch.toFixed(1)}</strong></div>
            <div style="font-size:12px;color:var(--muted)">Timbre: <strong style="color:var(--text-strong)">${citizen.voiceProfile.timbre}</strong></div>
            <div style="font-size:12px;color:var(--muted)">Rate: <strong style="color:var(--text-strong)">${citizen.voiceProfile.speechRate.toFixed(1)}</strong></div>
            <div style="font-size:12px;color:var(--muted)">Accent: <strong style="color:var(--text-strong)">${citizen.voiceProfile.accent}</strong></div>
            <div style="font-size:12px;color:var(--muted)">Cadence: <strong style="color:var(--text-strong)">${citizen.voiceProfile.cadence}</strong></div>
          </div>
          ${
            citizen.voiceProfile.catchPhrases && citizen.voiceProfile.catchPhrases.length > 0
              ? html`
            <div style="font-size:11px;color:var(--muted);margin-top:6px">
              <strong>Catch phrases:</strong>
              ${citizen.voiceProfile.catchPhrases.map(
                (p) => html`
                <span style="margin-left:6px;font-style:italic;color:var(--text-strong)">"${p}"</span>
              `,
              )}
            </div>
          `
              : nothing
          }
        </div>
      `
          : nothing
      }

      <!-- Actions -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px">
        <button type="button"
          @click=${() => props.onViewMemory(citizen.id)}
          style="
            padding:8px 16px;border-radius:8px;border:1px solid rgba(99,102,241,0.3);
            background:rgba(99,102,241,0.1);color:#818cf8;cursor:pointer;
            font-size:12px;font-weight:500;transition:all 0.2s
          "
        >🧠 View Memory</button>
        <button type="button"
          @click=${() => props.onClearChat(citizen.id)}
          style="
            padding:8px 16px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04);color:var(--muted);cursor:pointer;
            font-size:12px;transition:all 0.2s
          "
        >🗑 Clear Chat</button>
      </div>

      <!-- Citizen Chat Panel -->
      ${renderCitizenChat(citizen.id, props)}
    </div>
  `;
}

function renderStatPanel(label: string, value: number, color: string): TemplateResult {
  const pct = Math.round(Math.min(Math.max(value, 0), 100));
  return html`
    <div style="
      background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
      border-radius:12px;padding:14px;text-align:center;
    ">
      <div style="font-size:28px;font-weight:700;color:${color};margin-bottom:4px">${pct}%</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px">${label}</div>
      <div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden">
        <div style="width:${pct}%;height:100%;border-radius:3px;background:${color};transition:width 0.4s ease"></div>
      </div>
    </div>
  `;
}

// ─── Citizen Chat Panel ───────────────────────────────────────────

function renderCitizenChat(citizenId: string, props: PopulationProps): TemplateResult {
  const history = props.chatHistory[citizenId] ?? [];

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const input = e.target as HTMLTextAreaElement;
      const msg = input.value.trim();
      if (msg) {
        props.onSendMessage(citizenId, msg);
        input.value = "";
      }
    }
  }

  function handleSend(container: HTMLElement) {
    const input = container.querySelector<HTMLTextAreaElement>(".citizen-chat-input");
    if (!input) {
      return;
    }
    const msg = input.value.trim();
    if (msg) {
      props.onSendMessage(citizenId, msg);
      input.value = "";
    }
  }

  return html`
    <div style="
      background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);
      border-radius:16px;padding:16px;
    ">
      <h3 style="margin:0 0 12px;font-size:14px;color:var(--text-strong);display:flex;align-items:center;gap:6px">
        💬 Chat with Agent
        ${
          props.chatSending
            ? html`
                <span style="font-size: 10px; color: var(--muted); animation: pulse 1.2s infinite">Sending…</span>
              `
            : nothing
        }
      </h3>

      <!-- Message history -->
      <div style="
        min-height:100px;max-height:320px;overflow-y:auto;
        display:flex;flex-direction:column;gap:6px;margin-bottom:12px;
        scrollbar-width:thin;scrollbar-color:rgba(99,102,241,0.3) transparent;
      ">
        ${
          history.length === 0
            ? html`
          <div style="text-align:center;padding:24px 0;color:var(--muted);font-size:12px">
            <div style="font-size:28px;margin-bottom:6px">🤖</div>
            Say something to ${citizenId.slice(0, 8)}…
          </div>
        `
            : history.map((msg) => {
                const isUser = msg.role === "user";
                const isErr = msg.role === "error";
                const bg = isUser
                  ? "rgba(99,102,241,0.1)"
                  : isErr
                    ? "rgba(239,68,68,0.1)"
                    : "rgba(0,229,255,0.07)";
                const color = isUser ? "#818cf8" : isErr ? "#f87171" : "#22d3ee";
                const align = isUser ? "flex-end" : "flex-start";
                return html`
            <div style="display:flex;justify-content:${align}">
              <div style="
                max-width:80%;padding:8px 12px;border-radius:10px;
                background:${bg};border:1px solid ${color}22;
                font-size:12px;line-height:1.5;color:var(--text-strong);
                word-break:break-word;
              ">
                ${isUser ? nothing : html`<div style="font-size:10px;color:${color};margin-bottom:4px;font-weight:600">${msg.role === "assistant" ? "🤖 Agent" : "⚠️ Error"}</div>`}
                ${msg.content}
                <div style="font-size:10px;color:var(--muted);margin-top:4px;text-align:right">
                  ${new Date(msg.ts).toLocaleTimeString()}
                </div>
              </div>
            </div>
          `;
              })
        }
      </div>

      ${
        props.chatError
          ? html`
        <div style="font-size:11px;color:#f87171;margin-bottom:8px;padding:6px 10px;background:rgba(239,68,68,0.08);border-radius:6px">
          ⚠️ ${props.chatError}
        </div>
      `
          : nothing
      }

      <!-- Input row -->
      <div style="display:flex;gap:8px;align-items:flex-end" @click=${(e: Event) => {
        const btn = (e.target as HTMLElement).closest("[data-action='send']");
        if (btn) {
          handleSend(btn.closest("div[style]") as HTMLElement);
        }
      }}>
        <textarea
          class="citizen-chat-input"
          placeholder="Type a message… (Enter to send)"
          rows="2"
          ?disabled=${props.chatSending}
          @keydown=${handleKeydown}
          style="
            flex:1;padding:8px 12px;border-radius:8px;
            border:1px solid rgba(255,255,255,0.1);
            background:rgba(255,255,255,0.04);
            color:var(--text-strong);font-size:12px;resize:none;outline:none;
            font-family:inherit;transition:border-color 0.2s;
          "
        ></textarea>
        <button
          data-action="send"
          ?disabled=${props.chatSending}
          style="
            height:52px;padding:0 16px;border-radius:8px;
            border:1px solid rgba(99,102,241,0.4);
            background:rgba(99,102,241,0.15);color:#818cf8;
            cursor:pointer;font-size:12px;font-weight:600;
            white-space:nowrap;transition:all 0.2s;
            opacity:${props.chatSending ? "0.5" : "1"};
          "
        >➤ Send</button>
      </div>
    </div>
  `;
}
