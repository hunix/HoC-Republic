/**
 * Population View — Citizen Card Component
 * Extracted from population.ts for maintainability.
 * Contains: SPEC_COLORS, color/emoji helpers, renderCitizenCard, renderPagination
 */
import { html, nothing, type TemplateResult } from "lit";
import type { Activity } from "../republic-types.ts";
import type { CitizenSummary, PopulationProps } from "./population.ts";

// ─── Constants ────────────────────────────────────────────────────

export const SPEC_COLORS: Record<string, string> = {
  Scientist: "#818cf8",
  Researcher: "#a78bfa",
  Mathematician: "#c084fc",
  Engineer: "#38bdf8",
  Developer: "#22d3ee",
  Architect: "#2dd4bf",
  Doctor: "#f87171",
  Nurse: "#fb923c",
  Therapist: "#fbbf24",
  Teacher: "#a3e635",
  Professor: "#4ade80",
  Mentor: "#34d399",
  Soldier: "#f97316",
  Guard: "#ef4444",
  Strategist: "#e11d48",
  Trader: "#facc15",
  Banker: "#fbbf24",
  Economist: "#f59e0b",
  Artist: "#e879f9",
  Musician: "#d946ef",
  Writer: "#c084fc",
  Judge: "var(--muted)",
  Lawyer: "var(--muted)",
  Diplomat: "#60a5fa",
  Farmer: "#86efac",
  Manufacturer: "#67e8f9",
  ServiceProvider: "#fda4af",
  Generalist: "var(--muted)",
  Psychologist: "#f472b6",
  Planner: "#fb923c",
  Analyst: "#38bdf8",
  HardwareTechnician: "#94a3b8",
  SoundEngineer: "#818cf8",
  Animator: "#e879f9",
  GraphicDesigner: "#d946ef",
  VideoProducer: "#f97316",
  Cinematographer: "#fbbf24",
  DJ: "#c084fc",
  MusicProducer: "#a78bfa",
  Lyricist: "#f472b6",
  Composer: "#818cf8",
};

// ─── Color / Emoji Helpers ────────────────────────────────────────

export function activityColor(activity: Activity): string {
  const colors: Record<string, string> = {
    Working: "#10b981",
    Learning: "#6366f1",
    Socializing: "#f59e0b",
    Sleeping: "#64748b",
    Eating: "#f97316",
    Resting: "#8b5cf6",
    Traveling: "#06b6d4",
    Shopping: "#ec4899",
    Entertaining: "#14b8a6",
    Idle: "var(--muted)",
  };
  return colors[activity] || "var(--muted)";
}

export function activityEmoji(activity: Activity): string {
  const map: Record<Activity, string> = {
    Working: "💼",
    Learning: "📚",
    Socializing: "💬",
    Sleeping: "😴",
    Eating: "🍽️",
    Resting: "🧘",
    Traveling: "🚶",
    Shopping: "🛒",
    Entertaining: "🎭",
    Idle: "⏳",
  };
  return map[activity] || "⏳";
}

export function formatCredits(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return n.toFixed(0);
}

export function iqLabel(iq: number): { text: string; color: string } {
  if (iq >= 130) {
    return { text: "Genius", color: "#c084fc" };
  }
  if (iq >= 115) {
    return { text: "Gifted", color: "#818cf8" };
  }
  if (iq >= 100) {
    return { text: "Smart", color: "#22d3ee" };
  }
  if (iq >= 85) {
    return { text: "Average", color: "var(--muted)" };
  }
  return { text: "Developing", color: "#f59e0b" };
}

export function miniBar(value: number, color: string, maxVal = 100): TemplateResult {
  const pct = Math.round((Math.min(Math.max(value, 0), maxVal) / maxVal) * 100);
  return html`
    <div style="display:flex;align-items:center;gap:6px;min-width:80px">
      <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden">
        <div style="width:${pct}%;height:100%;border-radius:3px;background:${color};transition:width 0.4s ease"></div>
      </div>
      <span style="font-size:11px;color:var(--muted);min-width:28px;text-align:right">${pct}%</span>
    </div>
  `;
}

export function citizenInitials(name: string, id: string): string {
  const n = name ?? id.slice(0, 8);
  return (
    n
      .split(/\s+/)
      .map((w: string) => w[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "?"
  );
}

export function citizenHue(id: string): number {
  return Math.abs([...id].reduce((a, ch) => a + ch.charCodeAt(0), 0)) % 360;
}

export function healthBorderColor(health: number): string {
  if (health > 70) {
    return "rgba(16,185,129,0.6)";
  }
  if (health > 40) {
    return "rgba(245,158,11,0.6)";
  }
  return "rgba(239,68,68,0.6)";
}

// ─── Citizen Card ─────────────────────────────────────────────────

export function renderCitizenCard(c: CitizenSummary, props: PopulationProps): TemplateResult {
  const specColor = SPEC_COLORS[c.specialization] ?? "#6366f1";
  const iq = c.intelligence ?? 100;
  const iqInfo = iqLabel(iq);
  const hue = citizenHue(c.id);
  const initials = citizenInitials(c.name ?? "", c.id);

  return html`
    <div
      @click=${() => props.onSelectCitizen(c)}
      @mouseenter=${(e: Event) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = `0 8px 24px rgba(0,0,0,0.25)`;
        el.style.borderColor = `${specColor}55`;
      }}
      @mouseleave=${(e: Event) => {
        const el = e.currentTarget as HTMLElement;
        el.style.transform = "";
        el.style.boxShadow = "";
        el.style.borderColor = "rgba(255,255,255,0.1)";
      }}
      style="
        background:rgba(255,255,255,0.03);
        border:1px solid rgba(255,255,255,0.1);
        border-radius:12px;padding:14px;cursor:pointer;
        transition:all 0.2s ease;
      "
    >
      <!-- Header Row -->
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <!-- Initials Avatar -->
        <div style="
          width:38px;height:38px;border-radius:50%;flex-shrink:0;
          background:linear-gradient(135deg, hsl(${hue},65%,45%), hsl(${(hue + 40) % 360},55%,35%));
          display:flex;align-items:center;justify-content:center;
          font-size:14px;font-weight:600;color:#fff;letter-spacing:0.5px;
          border:2px solid ${healthBorderColor(c.health)};
        ">${initials}</div>

        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--text-strong);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
            ${c.name ?? c.id.slice(0, 8)}
          </div>
          <div style="display:flex;align-items:center;gap:4px;margin-top:2px">
            <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${specColor}18;color:${specColor};font-weight:500">
              ${c.specialization}
            </span>
            <span style="font-size:10px;color:var(--muted)">Gen ${c.generation}</span>
          </div>
        </div>

        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;display:flex;align-items:center;gap:3px;color:${activityColor(c.activity)}">
            ${activityEmoji(c.activity)} ${c.activity}
          </div>
        </div>
      </div>

      <!-- Stats Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:8px">
        <div>
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">❤️ Health</div>
          ${miniBar(c.health, c.health > 70 ? "#10b981" : c.health > 40 ? "#f59e0b" : "#ef4444")}
        </div>
        <div>
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">⚡ Energy</div>
          ${miniBar(c.energy, c.energy > 60 ? "#6366f1" : c.energy > 30 ? "#f59e0b" : "#ef4444")}
        </div>
        <div>
          <div style="font-size:9px;color:var(--muted);margin-bottom:2px">😊 Happy</div>
          ${miniBar(c.happiness, c.happiness > 70 ? "#fbbf24" : c.happiness > 40 ? "#f59e0b" : "#ef4444")}
        </div>
      </div>

      <!-- IQ + Credits footer -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">
        <span style="font-size:11px;color:${iqInfo.color}">IQ ${Number(iq).toFixed(0)} <span style="font-size:10px">${iqInfo.text}</span></span>
        <span style="font-size:11px;color:var(--muted)">¢${formatCredits(c.credits)}</span>
        <span style="font-size:10px;color:var(--muted)">Age ${c.age.toFixed(1)}</span>
      </div>

      <!-- Current Task -->
      ${
        c.currentTask
          ? html`
        <div style="margin-top:6px;padding:4px 8px;background:rgba(99,102,241,0.06);border-radius:6px;border-left:2px solid #818cf8">
          <div style="font-size:10px;color:#818cf8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">⚙️ ${c.currentTask}</div>
        </div>
      `
          : nothing
      }
    </div>
  `;
}

// ─── Pagination ───────────────────────────────────────────────────

export function renderPagination(
  page: number,
  totalPages: number,
  onPageChange: (page: number) => void,
): TemplateResult {
  const pages: number[] = [];
  const range = 2;
  for (let i = 0; i < totalPages; i++) {
    if (i === 0 || i === totalPages - 1 || (i >= page - range && i <= page + range)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== -1) {
      pages.push(-1);
    }
  }

  return html`
    <div style="display:flex;align-items:center;justify-content:center;gap:4px;padding:16px 0">
      <button type="button"
        @click=${() => page > 0 && onPageChange(page - 1)}
        ?disabled=${page === 0}
        style="
          padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);
          background:transparent;color:${page === 0 ? "rgba(255,255,255,0.2)" : "var(--text-strong)"};
          cursor:${page === 0 ? "default" : "pointer"};font-size:12px
        "
      >← Prev</button>

      ${pages.map((p) =>
        p === -1
          ? html`
              <span style="color: var(--muted); font-size: 12px; padding: 0 4px">…</span>
            `
          : html`
          <button type="button"
            @click=${() => onPageChange(p)}
            style="
              width:32px;height:32px;border-radius:6px;border:1px solid ${p === page ? "#818cf8" : "rgba(255,255,255,0.1)"};
              background:${p === page ? "rgba(99,102,241,0.2)" : "transparent"};
              color:${p === page ? "#818cf8" : "var(--text-strong)"};
              cursor:pointer;font-size:12px;font-weight:${p === page ? "600" : "400"}
            "
          >${p + 1}</button>
        `,
      )}

      <button type="button"
        @click=${() => page < totalPages - 1 && onPageChange(page + 1)}
        ?disabled=${page >= totalPages - 1}
        style="
          padding:6px 12px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);
          background:transparent;color:${page >= totalPages - 1 ? "rgba(255,255,255,0.2)" : "var(--text-strong)"};
          cursor:${page >= totalPages - 1 ? "default" : "pointer"};font-size:12px
        "
      >Next →</button>
    </div>
  `;
}
