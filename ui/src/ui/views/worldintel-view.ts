/**
 * Republic View — World Intelligence (3D Tactical Globe)
 *
 * Sci-fi tactical globe with floating HUD overlay panels:
 * - 3D globe (globe.gl) with animated threat markers
 * - HUD top-left: threat level + KPI badges
 * - HUD top-right: convergence alerts + brief
 * - HUD bottom: news ticker + CII mini-table
 * - HUD bottom-right: data freshness
 *
 * The globe fills the entire view area as a background.
 * All panels use glassmorphism-style semi-transparent dark panels.
 */

import { html, svg, nothing, type TemplateResult } from "lit";
import {
  createTacticalGlobe,
  updateGlobeSignals,
  updateGlobeConvergences,
  updateGlobeCII,
  focusCountry,
  resetView,
  getCountryCenter,
  destroyGlobe,
  type GlobeSignal,
  type GlobeCountry,
  type GlobeConvergence,
} from "./globe-tactical.js";

// ─── Types ───────────────────────────────────────────────────────

export type ThreatSeverity = "critical" | "high" | "medium" | "low" | "info";
export type DataSourceStatus = "fresh" | "stale" | "very_stale" | "no_data" | "error" | "disabled";

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  source: string;
  publishedAt: number;
  threat: {
    severity: ThreatSeverity;
    category: string;
    confidence: number;
    keywords: string[];
  } | null;
  country?: string;
  region?: string;
}

export interface IntelSignal {
  type: string;
  severity: ThreatSeverity;
  country: string;
  region?: string;
  lat?: number;
  lon?: number;
  description: string;
  source: string;
  timestamp: number;
}

export interface CountryProfile {
  code: string;
  name: string;
  ciiScore: number;
  components: {
    conflictSignals: number;
    protestSignals: number;
    economicStress: number;
    militaryActivity: number;
    cyberThreats: number;
    newsVolume: number;
  };
  floor: number;
  trend: "rising" | "stable" | "falling";
  lastUpdated: number;
}

export interface SignalConvergence {
  country: string;
  region?: string;
  signalTypes: string[];
  signalCount: number;
  maxSeverity: ThreatSeverity;
  description: string;
  detectedAt: number;
}

export interface DataFreshnessEntry {
  source: string;
  status: DataSourceStatus;
  lastUpdate: number;
  staleness: number;
}

export interface WorldBrief {
  summary: string;
  topStories: NewsItem[];
  threatLevel: ThreatSeverity;
  activeConvergences: SignalConvergence[];
  generatedAt: number;
}

export interface WorldIntelDashboard {
  running: boolean;
  accessLevel: string;
  brief: WorldBrief | null;
  ciiScores: CountryProfile[] | null;
  news: NewsItem[];
  convergences: SignalConvergence[] | null;
  freshness: DataFreshnessEntry[];
  signalCount: number;
  monitoredCountries: number;
}

export interface WarRiskEntry {
  country: string;
  countryName: string;
  score: number;
  confidence: number;
  escalating: boolean;
  summary: string;
  factors: {
    ciiBase: number;
    signalVelocity: number;
    convergenceCount: number;
    arsenalPosture: number;
    diplomaticBreakdown: number;
  };
  computedAt: number;
}

export interface ArsenalEntry {
  country: string;
  countryName: string;
  nuclearWarheads: number;
  activeMilitary: number;
  defenseBudgetBn: number;
  systems: {
    tanks: number;
    aircraftTotal: number;
    fighterJets: number;
    navalVessels: number;
    submarines: number;
    ballisticMissiles: number;
  };
  expenditureRank: number;
  isNuclear: boolean;
  dataYear: number;
}

export interface WarSignalEntry {
  country: string;
  countryName: string;
  activeFactors: string[];
  factorCount: number;
  riskLevel: "watch" | "warning" | "critical";
  firstDetectedAt: number;
  lastUpdatedAt: number;
}

export interface EscalationVelocityEntry {
  country: string;
  countryName: string;
  delta1h: number;
  delta6h: number;
  delta24h: number;
  direction: "accelerating" | "stable" | "de-escalating";
}

export interface AlertHistoryEntry {
  ruleId: string;
  ruleName: string;
  severity: ThreatSeverity;
  message: string;
  channels: string[];
  firedAt: number;
}

export interface AlertConfigData {
  channels: Array<{ type: string; enabled: boolean; target: string }>;
  minSeverity: ThreatSeverity;
  ciiThreshold: number;
  warRiskThreshold: number;
}

export interface WorldIntelProps {
  loading: boolean;
  dashboard: WorldIntelDashboard | null;
  signals: IntelSignal[];
  severityFilter: ThreatSeverity | null;
  countryFilter: string | null;
  newsExpanded: boolean;
  selectedCountry: string | null;
  // v2
  warRisks: WarRiskEntry[];
  arsenal: ArsenalEntry[];
  warSignals: WarSignalEntry[];
  velocities: EscalationVelocityEntry[];
  alertConfig: AlertConfigData | null;
  alertHistory: AlertHistoryEntry[];
  onRefresh: () => void;
  onStartStop: (action: "start" | "stop") => void;
  onFilterSeverity: (s: ThreatSeverity | null) => void;
  onFilterCountry: (c: string | null) => void;
  onToggleNews: () => void;
  onSelectCountry: (code: string | null) => void;
  onSaveAlertConfig: (cfg: Partial<AlertConfigData>) => void;
  onTestAlert: (channel: string) => void;
}

// ─── Helpers  ────────────────────────────────────────────────────

function sevColor(s: ThreatSeverity): string {
  const map: Record<ThreatSeverity, string> = {
    critical: "#ff1744",
    high: "#ff6d00",
    medium: "#ffd600",
    low: "#00e676",
    info: "#40c4ff",
  };
  return map[s];
}

function freshColor(s: DataSourceStatus): string {
  const map: Record<DataSourceStatus, string> = {
    fresh: "#00e676",
    stale: "#ffd600",
    very_stale: "#ff6d00",
    no_data: "#666",
    error: "#ff1744",
    disabled: "#444",
  };
  return map[s];
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) {
    return "now";
  }
  if (m < 60) {
    return `${m}m`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h`;
  }
  return `${Math.floor(h / 24)}d`;
}

function trendArrow(t: "rising" | "stable" | "falling"): string {
  return t === "rising" ? "\u25B2" : t === "falling" ? "\u25BC" : "\u25CF";
}

function ciiColor(score: number): string {
  if (score >= 60) {
    return "#ff1744";
  }
  if (score >= 35) {
    return "#ff6d00";
  }
  if (score >= 15) {
    return "#ffd600";
  }
  return "#00e676";
}

function riskColor(score: number): string {
  if (score >= 80) {
    return "#ff1744";
  }
  if (score >= 60) {
    return "#ff6d00";
  }
  if (score >= 35) {
    return "#ffd600";
  }
  if (score >= 15) {
    return "#69f0ae";
  }
  return "#40c4ff";
}

function warRiskGradient(score: number): string {
  const c = riskColor(score);
  return `linear-gradient(90deg, ${c}33 0%, ${c}99 ${score}%, transparent ${score}%)`;
}

function signalLevelColor(level: "watch" | "warning" | "critical"): string {
  return level === "critical" ? "#ff1744" : level === "warning" ? "#ff6d00" : "#ffd600";
}

let globeInitialized = false;
let lastSignalHash = "";
let lastCIIHash = "";

/**
 * Initialize or update the globe after the view has rendered.
 * Called from the lifecycle hook in the app.
 */
export function initGlobe(container: HTMLElement | null, props: WorldIntelProps): void {
  if (!container) {
    return;
  }

  // Always create and show the globe regardless of running state
  // (show empty globe with atmosphere even when monitoring is stopped)
  if (!globeInitialized) {
    createTacticalGlobe(container);
    globeInitialized = true;
  }

  const d = props.dashboard;
  if (!d || !d.running) {
    // Globe visible but empty — don't load signal/CII data when not running
    return;
  }

  // Update signals
  const sigHash = JSON.stringify(props.signals.length);
  if (sigHash !== lastSignalHash) {
    lastSignalHash = sigHash;
    const globeSignals: GlobeSignal[] = props.signals
      .filter((s) => (s.lat && s.lon) || getCountryCenter(s.country))
      .map((s) => {
        const center = getCountryCenter(s.country);
        return {
          lat: s.lat ?? center?.[0] ?? 0,
          lng: s.lon ?? center?.[1] ?? 0,
          type: s.type,
          severity: s.severity,
          country: s.country,
          description: s.description,
          timestamp: s.timestamp,
        };
      });
    updateGlobeSignals(globeSignals);
  }

  // Update convergences
  if (d.convergences && d.convergences.length > 0) {
    const convs: GlobeConvergence[] = d.convergences
      .filter((c) => getCountryCenter(c.country))
      .map((c) => {
        const center = getCountryCenter(c.country)!;
        return {
          country: c.country,
          lat: center[0],
          lng: center[1],
          signalCount: c.signalCount,
          maxSeverity: c.maxSeverity,
          description: c.description,
        };
      });
    updateGlobeConvergences(convs);
  }

  // Update CII
  if (d.ciiScores) {
    const ciiHash = d.ciiScores.length.toString();
    if (ciiHash !== lastCIIHash) {
      lastCIIHash = ciiHash;
      const cii: GlobeCountry[] = d.ciiScores.map((c) => ({
        code: c.code,
        name: c.name,
        ciiScore: c.ciiScore,
        trend: c.trend,
      }));
      updateGlobeCII(cii);
    }
  }
}

// ─── Theme State ─────────────────────────────────────────────────
let wiTheme: "dark" | "light" = "dark";

function setWiTheme(t: "dark" | "light") {
  wiTheme = t;
  const root = document.querySelector<HTMLElement>(".wi-globe-wrapper");
  if (root) {
    root.dataset.theme = t;
  }
}

function toggleWiTheme() {
  setWiTheme(wiTheme === "dark" ? "light" : "dark");
}

// ─── CSS (injected once) ─────────────────────────────────────────

let cssInjected = false;

/** Call when navigating away from the worldintel tab to cleanly destroy the globe. */
export function cleanupWorldIntel(): void {
  if (globeInitialized) {
    destroyGlobe();
    globeInitialized = false;
    lastSignalHash = "";
    lastCIIHash = "";
  }
}

function injectCSS(): void {
  if (cssInjected) {
    return;
  }
  cssInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    /* ── Dual-Theme Variable System ── */
    .wi-globe-wrapper {
      --wi-bg: #050a12;
      --wi-panel-bg: rgba(8,14,28,0.85);
      --wi-panel-border: rgba(0,229,255,0.15);
      --wi-text: #e0e6ed;
      --wi-muted: #4a5568;
      --wi-accent: #00e5ff;
      --wi-subtext: #8a99ab;
      --wi-row-hover: rgba(0,229,255,0.05);
      --wi-row-border: rgba(255,255,255,0.04);
      --wi-kpi-bg: rgba(0,229,255,0.05);
      --wi-kpi-border: rgba(0,229,255,0.08);
    }
    .wi-globe-wrapper[data-theme="light"] {
      --wi-bg: #e8f0fa;
      --wi-panel-bg: rgba(255,255,255,0.92);
      --wi-panel-border: rgba(37,99,235,0.18);
      --wi-text: #1e293b;
      --wi-muted: #64748b;
      --wi-accent: #2563eb;
      --wi-subtext: #475569;
      --wi-row-hover: rgba(37,99,235,0.05);
      --wi-row-border: rgba(0,0,0,0.06);
      --wi-kpi-bg: rgba(37,99,235,0.05);
      --wi-kpi-border: rgba(37,99,235,0.10);
    }

    .wi-globe-wrapper {
      position: relative;
      width: 100%;
      height: calc(100vh - 60px);
      min-height: 600px;
      overflow: hidden;
      background: var(--wi-bg);
      border-radius: 12px;
      transition: background 0.3s;
    }
    .wi-globe-container {
      position: absolute;
      inset: 0;
      z-index: 1;
      touch-action: none;
    }
    .wi-globe-container canvas {
      display: block;
      cursor: grab;
    }
    .wi-globe-container canvas:active {
      cursor: grabbing;
    }

    /* HUD overlay panels */
    .wi-hud {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: none;
      display: grid;
      grid-template-columns: 340px 1fr 300px;
      grid-template-rows: auto 1fr auto;
      gap: 12px;
      padding: 16px;
    }
    /* HUD is non-interactive by default so globe below receives drag/zoom/rotate events.
       Individual panels, buttons and inputs re-enable pointer events explicitly. */
    .wi-hud { pointer-events: none; }
    .wi-hud .wi-panel,
    .wi-hud .wi-status-bar,
    .wi-hud button,
    .wi-hud .wi-btn,
    .wi-hud a,
    .wi-hud select,
    .wi-hud input { pointer-events: auto; }

    .wi-panel {
      background: var(--wi-panel-bg);
      border: 1px solid var(--wi-panel-border);
      border-radius: 10px;
      padding: 12px;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--wi-text);
      font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.78rem;
      line-height: 1.4;
      max-height: fit-content;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      transition: background 0.3s, border-color 0.3s, color 0.3s;
    }
    .wi-panel--scrollable {
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(0,229,255,0.2) transparent;
    }
    .wi-panel::-webkit-scrollbar { width: 4px; }
    .wi-panel::-webkit-scrollbar-thumb { background: rgba(0,229,255,0.3); border-radius: 2px; }

    .wi-panel-title {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: var(--wi-accent);
      margin-bottom: 8px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .wi-panel-title::before {
      content: '';
      width: 6px;
      height: 6px;
      background: var(--wi-accent);
      border-radius: 50%;
      box-shadow: 0 0 6px var(--wi-accent);
    }

    /* KPI badges */
    .wi-kpis {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    .wi-kpi {
      padding: 6px 8px;
      border-radius: 6px;
      background: var(--wi-kpi-bg);
      border: 1px solid var(--wi-kpi-border);
      text-align: center;
    }
    .wi-kpi__value {
      font-size: 1.1rem;
      font-weight: 800;
      line-height: 1.2;
    }
    .wi-kpi__label {
      font-size: 0.55rem;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #6b7b8d;
      margin-top: 2px;
    }

    /* Threat level indicator */
    .wi-threat {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .wi-threat__dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      animation: wi-pulse 2s infinite;
    }
    @keyframes wi-pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 4px currentColor; }
      50% { opacity: 0.5; box-shadow: 0 0 12px currentColor; }
    }

    /* News items */
    .wi-news-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }
    .wi-news-item:last-child { border-bottom: none; }
    .wi-news-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .wi-news-title {
      color: #c8d0da;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      font-size: 0.72rem;
    }
    .wi-news-title:hover { color: #00e5ff; }
    .wi-news-meta {
      font-size: 0.6rem;
      color: #4a5568;
      flex-shrink: 0;
    }

    /* CII mini-table */
    .wi-cii-row {
      display: grid;
      grid-template-columns: 28px 1fr 60px 30px;
      gap: 4px;
      align-items: center;
      padding: 3px 0;
      border-bottom: 1px solid var(--wi-row-border);
      font-size: 0.72rem;
      cursor: pointer;
    }
    .wi-cii-row:hover { background: var(--wi-row-hover); border-radius: 4px; }
    .wi-cii-bar {
      height: 4px;
      border-radius: 2px;
      background: rgba(255,255,255,0.06);
      overflow: hidden;
    }
    .wi-cii-bar__fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.5s;
    }

    /* Convergence alerts */
    .wi-conv {
      padding: 6px 8px;
      border-radius: 6px;
      margin-bottom: 6px;
      border-left: 2px solid;
    }

    /* Control buttons */
    .wi-btn {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid var(--wi-panel-border);
      background: rgba(0,229,255,0.08);
      color: var(--wi-accent);
      font-size: 0.65rem;
      font-family: inherit;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: all 0.2s;
    }
    .wi-btn:hover {
      background: rgba(0,229,255,0.2);
      box-shadow: 0 0 12px rgba(0,229,255,0.15);
    }
    .wi-btn--danger {
      border-color: rgba(255,23,68,0.3);
      background: rgba(255,23,68,0.08);
      color: #ff1744;
    }
    .wi-btn--danger:hover {
      background: rgba(255,23,68,0.2);
      box-shadow: 0 0 12px rgba(255,23,68,0.15);
    }
    .wi-btn--theme {
      font-size: 0.8rem;
      padding: 4px 8px;
    }

    /* Freshness dots */
    .wi-fresh-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 2px 0;
    }
    .wi-fresh-dot {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Escalation velocity sparklines */
    .wi-esc-row {
      display: flex; align-items: center; gap: 6px;
      padding: 3px 0;
      border-bottom: 1px solid var(--wi-row-border);
      font-size: 0.68rem;
      cursor: pointer;
    }
    .wi-esc-row:hover { background: var(--wi-row-hover); border-radius: 4px; }
    .wi-esc-spark { display: flex; align-items: flex-end; gap: 1px; height: 16px; }
    .wi-esc-bar { width: 4px; border-radius: 1px; transition: height 0.4s; }

    /* Scanline overlay for extra sci-fi effect */
    .wi-scanline {
      position: absolute;
      inset: 0;
      z-index: 5;
      pointer-events: none;
      background: repeating-linear-gradient(
        0deg,
        transparent,
        transparent 2px,
        rgba(0, 229, 255, 0.015) 2px,
        rgba(0, 229, 255, 0.015) 4px
      );
    }

    /* Status bar at top */
    .wi-status-bar {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      border-radius: 8px;
      background: var(--wi-panel-bg);
      border: 1px solid var(--wi-panel-border);
      backdrop-filter: blur(12px);
      font-family: 'JetBrains Mono', monospace;
    }
    .wi-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
    }
    .wi-status-dot--live {
      background: #00e676;
      box-shadow: 0 0 6px #00e676;
      animation: wi-pulse 2s infinite;
    }
    .wi-status-dot--off {
      background: #ff6d00;
      box-shadow: 0 0 4px #ff6d00;
    }
  `;
  document.head.appendChild(style);
}

// ─── Main Render ────────────────────────────────────────────────

export function renderWorldIntel(props: WorldIntelProps): TemplateResult {
  injectCSS();

  if (props.loading && !props.dashboard) {
    return html`
      <div
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          height: 60vh;
          color: #00e5ff;
          font-family: monospace;
        "
      >
        <div style="text-align: center">
          <div style="font-size: 2rem; margin-bottom: 12px; animation: wi-pulse 1.5s infinite">
            \u{1F30D}
          </div>
          <div style="text-transform: uppercase; letter-spacing: 3px; font-size: 0.75rem">
            Initializing World Intelligence...
          </div>
        </div>
      </div>
    `;
  }

  const d = props.dashboard;
  if (!d) {
    return html`
      <div style="display:flex;align-items:center;justify-content:center;height:60vh;color:#6b7b8d;font-family:monospace">
        <div style="text-align:center">
          <div style="font-size:3rem;margin-bottom:12px">\u{1F30D}</div>
          <div style="font-size:1rem;font-weight:600;color:#c8d0da;margin-bottom:8px">World Intelligence Offline</div>
          <div style="font-size:0.75rem;margin-bottom:16px">Start the module to begin monitoring global events.</div>
          <button type="button" class="wi-btn" @click=${props.onRefresh}>Initialize</button>
        </div>
      </div>`;
  }

  const threatLevel = d.brief?.threatLevel ?? "info";
  const convergenceCount = d.convergences?.length ?? 0;
  const criticalSignals = props.warSignals.filter(
    (w) => w.riskLevel === "critical" || w.riskLevel === "warning",
  );
  const topRisks = props.warRisks.toSorted((a, b) => b.score - a.score).slice(0, 8);

  return html`
    <div class="wi-globe-wrapper" data-theme="${wiTheme}">
      <!-- 3D Globe Canvas -->
      <div class="wi-globe-container" id="wi-globe-mount"></div>

      <!-- Scanline overlay -->
      <div class="wi-scanline"></div>

      <!-- WAR SIGNAL CRITICAL BANNER (full width, shown when any warning/critical) -->
      ${
        criticalSignals.length > 0
          ? html`
        <div style="
          position:absolute;top:52px;left:0;right:0;z-index:50;
          background:linear-gradient(90deg, #ff1744cc, #ff6d00cc);
          padding:6px 16px;display:flex;align-items:center;gap:12px;
          animation:wi-pulse 1.5s infinite;border-bottom:1px solid #ff174499;
        ">
          <span style="font-size:1rem">⚔️</span>
          <span style="font-size:0.7rem;font-weight:700;color:#fff;letter-spacing:2px">WAR SIGNAL CONFLUENCE DETECTED</span>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${criticalSignals.map(
              (w) => html`
              <span style="font-size:0.6rem;padding:2px 8px;border-radius:4px;background:rgba(0,0,0,0.4);color:#fff;border:1px solid ${signalLevelColor(w.riskLevel)}">
                ${w.countryName} — ${w.activeFactors.join(" + ")}
              </span>
            `,
            )}
          </div>
        </div>
      `
          : nothing
      }

      <!-- HUD Overlay -->
      <div class="wi-hud">

        <!-- STATUS BAR (top, full width) -->
        <div class="wi-status-bar">
          <div style="display:flex;align-items:center;gap:12px">
            <span class="wi-status-dot ${d.running ? "wi-status-dot--live" : "wi-status-dot--off"}"></span>
            <span style="font-size:0.7rem;font-weight:600;color:${d.running ? "#00e676" : "#ff6d00"}">${d.running ? "ONLINE" : "OFFLINE"}</span>
            <span style="font-size:0.6rem;color:#4a5568">WORLD INTELLIGENCE TACTICAL DISPLAY v2</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            <span style="font-size:0.6rem;color:var(--wi-muted)">ACCESS: ${d.accessLevel.toUpperCase()}</span>
            <button type="button" class="wi-btn wi-btn--theme" @click=${() => toggleWiTheme()} title="Toggle theme">${wiTheme === "dark" ? "☀️" : "🌙"}</button>
            <button type="button" class="wi-btn" @click=${props.onRefresh}>REFRESH</button>
            ${
              d.running
                ? html`<button type="button" class="wi-btn wi-btn--danger" @click=${() => props.onStartStop("stop")}>STOP</button>`
                : html`<button type="button" class="wi-btn" @click=${() => props.onStartStop("start")}>START</button>`
            }
            <button type="button" class="wi-btn" @click=${() => resetView()}>RESET VIEW</button>
          </div>
        </div>

        <!-- LEFT PANEL: KPIs + Brief + Convergences -->
        <div style="display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 160px);overflow:auto">
          <!-- Threat Level + KPIs -->
          <div class="wi-panel">
            <div class="wi-panel-title">Threat Assessment</div>
            <div class="wi-threat" style="background:${sevColor(threatLevel)}15;border:1px solid ${sevColor(threatLevel)}30">
              <div class="wi-threat__dot" style="background:${sevColor(threatLevel)};color:${sevColor(threatLevel)}"></div>
              <span style="font-weight:700;font-size:0.85rem;color:${sevColor(threatLevel)}">${threatLevel.toUpperCase()}</span>
              <span style="margin-left:auto;font-size:0.5rem;color:#4a5568">${new Date().toUTCString().slice(17, 25)} UTC</span>
            </div>

            <!-- Threat Radar Mini-Display -->
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
              <svg width="70" height="70" viewBox="-35 -35 70 70" style="flex-shrink:0">
                <circle r="34" fill="none" stroke="rgba(0,229,255,0.05)" stroke-width="0.5"/>
                <circle r="25" fill="none" stroke="rgba(0,229,255,0.07)" stroke-width="0.5"/>
                <circle r="16" fill="none" stroke="rgba(0,229,255,0.10)" stroke-width="0.5"/>
                <circle r="8" fill="none" stroke="rgba(0,229,255,0.14)" stroke-width="0.5"/>
                <circle r="2" fill="rgba(0,229,255,0.3)"/>
                <!-- Cross hairs -->
                <line x1="-35" y1="0" x2="35" y2="0" stroke="rgba(0,229,255,0.08)" stroke-width="0.4"/>
                <line x1="0" y1="-35" x2="0" y2="35" stroke="rgba(0,229,255,0.08)" stroke-width="0.4"/>
                <!-- Sweep arm -->
                <line x1="0" y1="0" x2="0" y2="-34" stroke="${sevColor(threatLevel)}" stroke-width="0.8" opacity="0.6"
                  style="transform-origin:0 0;animation:wi-pulse 4s linear infinite;transform:rotate(0deg)"/>
                <!-- Threat dots by severity -->
                ${
                  threatLevel === "critical" || threatLevel === "high"
                    ? svg`
                  <circle cx="18" cy="-12" r="2" fill="#ff1744" opacity="0.9" style="animation:wi-pulse 1.2s infinite"/>
                  <circle cx="-22" cy="8" r="1.5" fill="#ff6d00" opacity="0.7"/>
                  <circle cx="5" cy="26" r="1.5" fill="#ff6d00" opacity="0.6"/>
                `
                    : svg`
                  <circle cx="14" cy="-18" r="1.5" fill="#ffd600" opacity="0.7"/>
                  <circle cx="-20" cy="10" r="1" fill="#00e676" opacity="0.5"/>
                `
                }
              </svg>
              <div style="flex:1">
                <div style="font-size:0.55rem;color:#4a5568;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">Intelligence Score</div>
                ${["Conflict", "Cyber", "Econ", "Protest", "Military"].map((label, li) => {
                  const scores = [
                    d.ciiScores?.reduce((a, c) => a + (c.components?.conflictSignals ?? 0), 0) ?? 0,
                    d.ciiScores?.reduce((a, c) => a + (c.components?.cyberThreats ?? 0), 0) ?? 0,
                    d.ciiScores?.reduce((a, c) => a + (c.components?.economicStress ?? 0), 0) ?? 0,
                    d.ciiScores?.reduce((a, c) => a + (c.components?.protestSignals ?? 0), 0) ?? 0,
                    d.ciiScores?.reduce((a, c) => a + (c.components?.militaryActivity ?? 0), 0) ??
                      0,
                  ];
                  const pct = Math.min(100, (scores[li] ?? 0) * 5);
                  const cols = ["#ff1744", "#ff6d00", "#ffd600", "#40c4ff", "#00e676"];
                  return html`
                  <div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">
                    <span style="width:40px;font-size:0.5rem;color:#6b7b8d">${label}</span>
                    <div class="wi-cii-bar" style="flex:1;height:3px">
                      <div class="wi-cii-bar__fill" style="width:${pct}%;background:${cols[li]}"></div>
                    </div>
                    <span style="font-size:0.5rem;color:${cols[li]};width:18px;text-align:right">${scores[li]}</span>
                  </div>`;
                })}
              </div>
            </div>

            <div class="wi-kpis">
              <div class="wi-kpi">
                <div class="wi-kpi__value" style="color:#40c4ff">${d.signalCount}</div>
                <div class="wi-kpi__label">Signals</div>
              </div>
              <div class="wi-kpi">
                <div class="wi-kpi__value" style="color:#00e676">${d.monitoredCountries}</div>
                <div class="wi-kpi__label">Countries</div>
              </div>
              <div class="wi-kpi">
                <div class="wi-kpi__value" style="color:#ffd600">${d.news.length}</div>
                <div class="wi-kpi__label">News</div>
              </div>
              <div class="wi-kpi">
                <div class="wi-kpi__value" style="color:${convergenceCount > 0 ? "#ff6d00" : "#00e676"}">${convergenceCount}</div>
                <div class="wi-kpi__label">Convergences</div>
              </div>
              <div class="wi-kpi">
                <div class="wi-kpi__value" style="color:${props.warSignals.length > 0 ? "#ff1744" : "#00e676"}">${props.warSignals.length}</div>
                <div class="wi-kpi__label">War Signals</div>
              </div>
              <div class="wi-kpi">
                <div class="wi-kpi__value" style="color:${props.warRisks.filter((r) => r.score >= 70).length > 0 ? "#ff1744" : "#ffd600"}">${props.warRisks.filter((r) => r.score >= 70).length}</div>
                <div class="wi-kpi__label">Critical Risk</div>
              </div>
            </div>
          </div>

          <!-- World Brief -->
          ${
            d.brief
              ? html`
          <div class="wi-panel wi-panel--scrollable" style="max-height:200px">
            <div class="wi-panel-title">World Brief</div>
            ${d.brief.topStories.slice(0, 5).map(
              (s) => html`
              <div class="wi-news-item">
                <div class="wi-news-dot" style="background:${s.threat ? sevColor(s.threat.severity) : "#4a5568"}"></div>
                <a href="${s.link}" target="_blank" rel="noopener" class="wi-news-title">${s.title}</a>
                <span class="wi-news-meta">${s.source}</span>
              </div>`,
            )}
          </div>`
              : nothing
          }

          <!-- Convergence Alerts -->
          ${
            d.convergences && d.convergences.length > 0
              ? html`
          <div class="wi-panel wi-panel--scrollable" style="max-height:180px">
            <div class="wi-panel-title">Signal Convergences (${d.convergences.length})</div>
            ${d.convergences.slice(0, 4).map(
              (c) => html`
              <div class="wi-conv" style="border-color:${sevColor(c.maxSeverity)};background:${sevColor(c.maxSeverity)}10"
                @click=${() => {
                  props.onSelectCountry(c.country);
                  focusCountry(c.country);
                }}>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                  <span style="font-weight:700;color:${sevColor(c.maxSeverity)}">${c.country}</span>
                  <span style="font-size:0.6rem;color:#4a5568">${timeAgo(c.detectedAt)}</span>
                </div>
                <div style="font-size:0.68rem;color:#8a99ab">${c.description}</div>
                <div style="display:flex;gap:4px;margin-top:3px;flex-wrap:wrap">
                  ${c.signalTypes.map((t) => html`<span style="font-size:0.55rem;padding:1px 5px;border-radius:3px;background:rgba(0,229,255,0.1);color:#00e5ff">${t}</span>`)}
                </div>
              </div>`,
            )}
          </div>`
              : nothing
          }

          <!-- Alert History -->
          ${
            props.alertHistory.length > 0
              ? html`
          <div class="wi-panel wi-panel--scrollable" style="max-height:180px">
            <div class="wi-panel-title">🔔 Alert History (${props.alertHistory.length})</div>
            ${props.alertHistory.slice(0, 6).map(
              (a) => html`
              <div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid #1a2030">
                <span style="color:${sevColor(a.severity)};font-size:0.9rem">●</span>
                <div style="flex:1;min-width:0">
                  <div style="font-size:0.65rem;color:#c8d0da;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.message}</div>
                  <div style="font-size:0.55rem;color:#4a5568">${timeAgo(a.firedAt)} · ${a.channels.join(", ")}</div>
                </div>
              </div>
            `,
            )}
          </div>`
              : nothing
          }
        </div>

        <!-- CENTER: empty (globe shows through) -->
        <div></div>

        <!-- RIGHT PANEL: War Risk Table + Arsenal + CII + Live Feed -->
        <div style="display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 160px);overflow:auto">

          <!-- War Risk Ranking -->
          ${
            topRisks.length > 0
              ? html`
          <div class="wi-panel wi-panel--scrollable" style="max-height:280px">
            <div class="wi-panel-title">⚔️ War Risk Assessment (ML)</div>
            ${topRisks.map(
              (r) => html`
              <div class="wi-cii-row" @click=${() => {
                props.onSelectCountry(r.country);
                focusCountry(r.country);
              }}
                style="cursor:pointer;padding:4px 0;border-bottom:1px solid #0d1117">
                <span style="font-weight:700;color:#6b7b8d;font-size:0.7rem;min-width:24px">${r.country}</span>
                <div style="flex:1;position:relative;height:16px;background:#0d1117;border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${r.score}%;background:${warRiskGradient(r.score)};border-radius:3px;transition:width .5s ease"></div>
                </div>
                <span style="font-weight:700;color:${riskColor(r.score)};font-size:0.75rem;min-width:28px;text-align:right">${r.score}%</span>
                ${
                  r.escalating
                    ? html`
                        <span style="font-size: 0.7rem; color: #ff1744" title="Escalating">▲</span>
                      `
                    : nothing
                }
              </div>
            `,
            )}
          </div>`
              : nothing
          }

          <!-- Arsenal Summary (top nuclear/conventional powers) -->
          ${
            props.arsenal.length > 0
              ? html`
          <div class="wi-panel wi-panel--scrollable" style="max-height:220px">
            <div class="wi-panel-title">🏭 Global Arsenal Profiles (SIPRI 2024)</div>
            <div style="overflow-x:auto">
              <table style="width:100%;border-collapse:collapse;font-size:0.62rem">
                <thead>
                  <tr style="color:#4a5568;border-bottom:1px solid #1a2030">
                    <th style="text-align:left;padding:2px 4px">Country</th>
                    <th style="text-align:right;padding:2px 4px">☢️</th>
                    <th style="text-align:right;padding:2px 4px">Personnel</th>
                    <th style="text-align:right;padding:2px 4px">Budget$B</th>
                    <th style="text-align:right;padding:2px 4px">Tanks</th>
                    <th style="text-align:right;padding:2px 4px">Aircraft</th>
                  </tr>
                </thead>
                <tbody>
                  ${props.arsenal.slice(0, 10).map(
                    (a) => html`
                    <tr style="border-bottom:1px solid #0d1117;color:${a.isNuclear ? "#ff6d00" : "#c8d0da"}">
                      <td style="padding:2px 4px;font-weight:600">${a.countryName} ${a.isNuclear ? "☢️" : ""}</td>
                      <td style="text-align:right;padding:2px 4px">${a.nuclearWarheads > 0 ? a.nuclearWarheads.toLocaleString() : "—"}</td>
                      <td style="text-align:right;padding:2px 4px">${(a.activeMilitary / 1000).toFixed(0)}K</td>
                      <td style="text-align:right;padding:2px 4px">\$${a.defenseBudgetBn}B</td>
                      <td style="text-align:right;padding:2px 4px">${a.systems.tanks.toLocaleString()}</td>
                      <td style="text-align:right;padding:2px 4px">${a.systems.aircraftTotal.toLocaleString()}</td>
                    </tr>
                  `,
                  )}
                </tbody>
              </table>
            </div>
          </div>`
              : nothing
          }

          <!-- CII Table -->
          ${
            d.ciiScores && d.ciiScores.length > 0
              ? html`
          <div class="wi-panel wi-panel--scrollable" style="max-height:260px">
            <div class="wi-panel-title">Country Instability Index</div>
            ${d.ciiScores.slice(0, 18).map(
              (c) => html`
              <div class="wi-cii-row" @click=${() => {
                props.onSelectCountry(c.code);
                focusCountry(c.code);
              }}>
                <span style="font-weight:700;color:#6b7b8d;font-size:0.65rem;min-width:24px">${c.code}</span>
                <div class="wi-cii-bar">
                  <div class="wi-cii-bar__fill" style="width:${Math.min(100, c.ciiScore)}%;background:${ciiColor(c.ciiScore)}"></div>
                </div>
                <span style="font-weight:700;color:${ciiColor(c.ciiScore)}">${c.ciiScore}</span>
                <span style="font-size:0.65rem;color:${c.trend === "rising" ? "#ff6d00" : c.trend === "falling" ? "#00e676" : "#4a5568"}">${trendArrow(c.trend)}</span>
              </div>`,
            )}
          </div>`
              : nothing
          }

          <!-- Live Intel Feed -->
          <div class="wi-panel wi-panel--scrollable" style="max-height:200px">
            <div class="wi-panel-title">Live Intel Feed</div>
            ${d.news.slice(0, props.newsExpanded ? 50 : 10).map(
              (n) => html`
              <div class="wi-news-item">
                <div class="wi-news-dot" style="background:${n.threat ? sevColor(n.threat.severity) : "#333"}"></div>
                ${n.country ? html`<span style="font-size:0.55rem;padding:0 3px;color:#00e5ff;font-weight:600">${n.country}</span>` : nothing}
                <a href="${n.link}" target="_blank" rel="noopener" class="wi-news-title">${n.title}</a>
                <span class="wi-news-meta">${timeAgo(n.publishedAt)}</span>
              </div>`,
            )}
            ${
              d.news.length > 10
                ? html`
              <div style="text-align:center;margin-top:4px">
                <button type="button" class="wi-btn" @click=${props.onToggleNews}>${props.newsExpanded ? "COLLAPSE" : `SHOW ALL ${d.news.length}`}</button>
              </div>`
                : nothing
            }
          </div>

          <!-- Data Freshness -->
          ${
            d.freshness.length > 0
              ? html`
          <div class="wi-panel">
            <div class="wi-panel-title">Data Sources</div>
            ${d.freshness.slice(0, 8).map(
              (e) => html`
              <div class="wi-fresh-item">
                <div class="wi-fresh-dot" style="background:${freshColor(e.status)}"></div>
                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.68rem">${e.source}</span>
                <span style="font-size:0.58rem;color:#4a5568">${e.staleness < 1 ? "live" : `${e.staleness}m`}</span>
              </div>`,
            )}
          </div>`
              : nothing
          }
        </div>

        <!-- BOTTOM: empty row (globe visible) -->

      </div>
    </div>`;
}
