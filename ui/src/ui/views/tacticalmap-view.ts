/**
 * Republic View — Advanced Tactical Command Map
 *
 * EXACT same quality/style as worldintel-view.ts:
 * - Same globe.gl 3D earth (globe-tactical.ts)
 * - Same CSS variable system + wi-panel glassmorphism
 * - Same JetBrains Mono monospace aesthetic
 * - Extended with TACTICAL overlays:
 *     • Left: Layer toggles + Signal feed (clickable, severity-filtered)
 *     • Top-right: AI posture donut + KPI badges
 *     • Mid-right: Convergence alerts + Country intel detail
 *     • Bot-right: CII leaderboard
 *     • Bottom strip: Live news ticker + Threat matrix + Conflict zones
 *
 * Globe mounting uses same initTacticalGlobe() lifecycle pattern as worldintel.
 */

import { html, nothing, type TemplateResult } from "lit";
import type {
  WorldIntelDashboard,
  IntelSignal,
  // oxlint-disable-next-line no-unused-vars
  CountryProfile,
  // oxlint-disable-next-line no-unused-vars
  SignalConvergence,
  ThreatSeverity,
  WarRiskEntry,
  WarSignalEntry,
} from "./worldintel-view.js";
import {
  createTacticalGlobe,
  updateGlobeSignals,
  updateGlobeConvergences,
  updateGlobeCII,
  focusCountry,
  resetView,
  destroyGlobe,
  getCountryCenter,
  type GlobeSignal,
  type GlobeCountry,
  type GlobeConvergence,
} from "./globe-tactical.js";

// ─── Types ────────────────────────────────────────────────────────

export interface TacticalMapProps {
  loading: boolean;
  dashboard: WorldIntelDashboard | null;
  signals: IntelSignal[];
  selectedCountry: string | null;
  selectedSignalIdx: number | null;
  activeLayers: string[];
  warRisks?: WarRiskEntry[];
  warSignals?: WarSignalEntry[];
  onRefresh: () => void;
  onStartStop: (action: "start" | "stop") => void;
  onSelectCountry: (code: string | null) => void;
  onSelectSignal: (idx: number | null) => void;
  onLayerToggle: (layer: MapLayer) => void;
}

export type MapLayer =
  | "cii"
  | "warrisk"
  | "signals"
  | "nuclear"
  | "tradeRoutes"
  | "arsenal"
  | "convergence";

// ─── Constants ────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: "#ff1744",
  high: "#ff6d00",
  medium: "#ffd600",
  low: "#00e676",
  info: "#40c4ff",
};

// oxlint-disable-next-line no-unused-vars
const NUCLEAR_SITES: [number, number, string, string][] = [
  [55.7, 37.6, "Moscow", "warhead"],
  [39.0, 125.7, "Yongbyon", "reactor"],
  [31.7, 35.2, "Dimona", "reactor"],
  [29.6, 52.5, "Bushehr", "reactor"],
  [34.1, 73.6, "Kahuta", "warhead"],
  [38.4, -97.5, "US Heartland", "warhead"],
  [48.9, 2.3, "Paris", "warhead"],
  [39.9, 116.4, "Beijing", "warhead"],
  [22.5, 88.3, "Kolkata", "reactor"],
];

const MILITARY_HOTSPOTS: [number, number, string, number][] = [
  [48.4, 31.2, "Ukraine", 1.0],
  [32.1, 34.8, "Gaza", 1.0],
  [15.5, 43.5, "Yemen", 0.85],
  [36.2, 37.1, "Syria", 0.8],
  [13.5, 30.2, "Sudan", 0.75],
  [9.0, 7.5, "Nigeria", 0.6],
  [12.8, 45.1, "Somalia", 0.65],
  [33.8, 66.0, "Afghanistan", 0.7],
];

// ─── Module State ──────────────────────────────────────────────────

let activeLayers: Set<MapLayer> = new Set([
  "cii",
  "warrisk",
  "signals",
  "nuclear",
  "tradeRoutes",
  "convergence",
]);
let tmGlobeInit = false;
let tmSigHash = "";
let tmCIIHash = "";
let tmSevFilter: ThreatSeverity | "all" = "all";
let cssInjected = false;

export function toggleLayer(l: MapLayer): void {
  // oxlint-disable-next-line no-unused-expressions
  activeLayers.has(l) ? activeLayers.delete(l) : activeLayers.add(l);
}
export function hasLayer(l: MapLayer): boolean {
  return activeLayers.has(l);
}

// ─── Globe Lifecycle ───────────────────────────────────────────────

export function initTacticalMapGlobe(container: HTMLElement | null, props: TacticalMapProps): void {
  if (!container) {return;}
  if (!tmGlobeInit) {
    createTacticalGlobe(container);
    tmGlobeInit = true;
  }
  const d = props.dashboard;
  if (!d) {return;}

  const sigHash = props.signals.length + "";
  if (sigHash !== tmSigHash) {
    tmSigHash = sigHash;
    const gs: GlobeSignal[] = props.signals
      .filter((s) => (s.lat && s.lon) || getCountryCenter(s.country))
      .map((s) => {
        const c = getCountryCenter(s.country);
        return {
          lat: s.lat ?? c?.[0] ?? 0,
          lng: s.lon ?? c?.[1] ?? 0,
          type: s.type,
          severity: s.severity,
          country: s.country,
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          // oxlint-disable-next-line @typescript-eslint/no-explicit-any
          description: (s as any).description ?? (s as any).summary ?? "",
          timestamp: s.timestamp,
        };
      });
    updateGlobeSignals(gs);
  }

  if (d.convergences?.length) {
    const convs: GlobeConvergence[] = d.convergences
      .filter((c) => getCountryCenter(c.country))
      .map((c) => {
        const ctr = getCountryCenter(c.country)!;
        return {
          country: c.country,
          lat: ctr[0],
          lng: ctr[1],
          signalCount: c.signalCount,
          maxSeverity: c.maxSeverity,
          description: c.description,
        };
      });
    updateGlobeConvergences(convs);
  }

  if (d.ciiScores) {
    const h = d.ciiScores.length + "";
    if (h !== tmCIIHash) {
      tmCIIHash = h;
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

export function cleanupTacticalMap(): void {
  if (tmGlobeInit) {
    destroyGlobe();
    tmGlobeInit = false;
    tmSigHash = "";
    tmCIIHash = "";
  }
}

// ─── CSS ──────────────────────────────────────────────────────────

function injectCSS(): void {
  if (cssInjected) {return;}
  cssInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    /* === Tactical Map — matched to worldintel quality === */
    .tm2-root {
      --tm2-bg: #050a12;
      --tm2-panel: rgba(8,14,28,0.87);
      --tm2-border: rgba(0,229,255,0.15);
      --tm2-text: #e0e6ed;
      --tm2-muted: #4a5568;
      --tm2-accent: #00e5ff;
      --tm2-sub: #8a99ab;
      --tm2-row: rgba(255,255,255,0.04);
      --tm2-hover: rgba(0,229,255,0.05);
      --tm2-kpi-bg: rgba(0,229,255,0.05);
      --tm2-kpi-border: rgba(0,229,255,0.09);
      position:relative; width:100%;
      height:calc(100vh - 60px); min-height:600px;
      overflow:hidden; background:var(--tm2-bg);
      border-radius:12px;
      font-family:'JetBrains Mono','Fira Code','Cascadia Code',monospace;
    }

    /* Globe full-screen */
    .tm2-globe {
      position:absolute; inset:0; z-index:1; touch-action:none;
      border-radius:12px; overflow:hidden;
    }
    .tm2-globe canvas { display:block; cursor:grab; }
    .tm2-globe canvas:active { cursor:grabbing; }

    /* Scanline */
    .tm2-scanline {
      position:absolute; inset:0; z-index:5; pointer-events:none;
      background:repeating-linear-gradient(0deg,transparent,transparent 2px,
        rgba(0,229,255,0.012) 2px,rgba(0,229,255,0.012) 4px);
    }

    /* HUD overlay — 3 cols, 3 rows */
    .tm2-hud {
      position:absolute; inset:0; z-index:10;
      pointer-events:none;
      display:grid;
      grid-template-columns:280px 1fr 300px;
      grid-template-rows:48px 1fr auto;
      gap:10px; padding:10px;
      box-sizing:border-box;
    }
    .tm2-hud .tm2-panel,
    .tm2-hud button,
    .tm2-hud a,
    .tm2-hud input,
    .tm2-hud select { pointer-events:auto; }

    /* Status bar — full top row */
    .tm2-statusbar {
      grid-column:1/-1; grid-row:1;
      display:flex; align-items:center; gap:10px;
      padding:0 14px;
      background:var(--tm2-panel); border:1px solid var(--tm2-border);
      border-radius:8px; backdrop-filter:blur(14px);
      font-size:0.68rem; color:var(--tm2-text);
    }

    /* Left column */
    .tm2-left {
      grid-column:1; grid-row:2;
      display:flex; flex-direction:column; gap:8px;
      overflow:hidden;
    }

    /* Right column */
    .tm2-right {
      grid-column:3; grid-row:2;
      display:flex; flex-direction:column; gap:8px;
      overflow:hidden;
    }

    /* Bottom row — full width */
    .tm2-bottom {
      grid-column:1/-1; grid-row:3;
      display:flex; gap:8px; max-height:200px;
    }

    /* Panel card — exact match to wi-panel */
    .tm2-panel {
      background:var(--tm2-panel);
      border:1px solid var(--tm2-border);
      border-radius:10px; padding:12px;
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
      color:var(--tm2-text); font-size:0.72rem;
      line-height:1.4; overflow:hidden;
      box-shadow:0 4px 24px rgba(0,0,0,0.18);
    }
    .tm2-panel--scroll {
      overflow-y:auto; flex:1; min-height:0;
      scrollbar-width:thin;
      scrollbar-color:rgba(0,229,255,0.2) transparent;
    }
    .tm2-panel--scroll::-webkit-scrollbar { width:3px; }
    .tm2-panel--scroll::-webkit-scrollbar-thumb { background:rgba(0,229,255,0.25); border-radius:2px; }

    /* Panel title — exact match to wi-panel-title */
    .tm2-title {
      font-size:0.6rem; text-transform:uppercase;
      letter-spacing:2px; color:var(--tm2-accent);
      margin-bottom:8px; font-weight:700;
      display:flex; align-items:center; gap:6px;
    }
    .tm2-title::before {
      content:''; width:6px; height:6px; border-radius:50%;
      background:var(--tm2-accent); box-shadow:0 0 6px var(--tm2-accent);
      flex-shrink:0;
    }

    /* Live dot */
    .tm2-live { width:8px; height:8px; border-radius:50%; }
    .tm2-live--on { background:#00e676; box-shadow:0 0 7px #00e676; animation:tm2-pulse 2s infinite; }
    .tm2-live--off { background:#ff6d00; box-shadow:0 0 5px #ff6d00; }
    @keyframes tm2-pulse {
      0%,100%{opacity:1;box-shadow:0 0 4px currentColor;}
      50%{opacity:0.4;box-shadow:0 0 14px currentColor;}
    }

    /* Threat badge */
    .tm2-threat-badge {
      padding:3px 10px; border-radius:5px;
      font-size:0.58rem; font-weight:800;
      text-transform:uppercase; letter-spacing:1.5px;
    }

    /* Layer pills */
    .tm2-layers { display:flex; flex-direction:column; gap:4px; }
    .tm2-layer-pill {
      display:flex; align-items:center; gap:7px;
      padding:5px 8px; border-radius:5px;
      border:1px solid var(--tm2-border);
      background:transparent; color:var(--tm2-muted);
      font-family:inherit; font-size:0.62rem;
      cursor:pointer; text-align:left;
      transition:all 0.18s;
    }
    .tm2-layer-pill.on { color:var(--tm2-text); background:rgba(0,229,255,0.06); border-color:rgba(0,229,255,0.25); }
    .tm2-layer-pill-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }

    /* Buttons */
    .tm2-btn {
      padding:4px 10px; border-radius:6px; font-family:inherit;
      font-size:0.6rem; cursor:pointer;
      text-transform:uppercase; letter-spacing:1px;
      border:1px solid var(--tm2-border);
      background:rgba(0,229,255,0.07); color:var(--tm2-accent);
      transition:all 0.2s;
    }
    .tm2-btn:hover { background:rgba(0,229,255,0.18); box-shadow:0 0 10px rgba(0,229,255,0.12); }
    .tm2-btn-sm { font-size:0.52rem; padding:2px 8px; }

    /* Signal rows */
    .tm2-sig-row {
      display:flex; align-items:flex-start; gap:8px;
      padding:5px 3px; border-bottom:1px solid var(--tm2-row);
      cursor:pointer; border-radius:4px;
    }
    .tm2-sig-row:hover, .tm2-sig-row.active { background:var(--tm2-hover); }
    .tm2-sig-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; margin-top:3px; }
    .tm2-sig-country { font-size:0.62rem; font-weight:700; color:var(--tm2-accent); }
    .tm2-sig-type { font-size:0.58rem; color:var(--tm2-sub); text-transform:uppercase; }
    .tm2-sig-desc { font-size:0.65rem; color:var(--tm2-text); margin-top:1px; line-height:1.35; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .tm2-sig-time { font-size:0.54rem; color:var(--tm2-muted); margin-top:2px; }

    /* CII rows */
    .tm2-cii-row {
      display:grid; grid-template-columns:30px 1fr 48px 18px;
      align-items:center; gap:5px;
      padding:4px 0; border-bottom:1px solid var(--tm2-row);
      cursor:pointer; font-size:0.7rem; border-radius:3px;
    }
    .tm2-cii-row:hover { background:var(--tm2-hover); }
    .tm2-cii-bar { height:4px; border-radius:2px; background:rgba(255,255,255,0.05); overflow:hidden; }
    .tm2-cii-fill { height:100%; border-radius:2px; }

    /* KPI cards */
    .tm2-kpis { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .tm2-kpi {
      padding:7px 9px; border-radius:7px; text-align:center;
      background:var(--tm2-kpi-bg); border:1px solid var(--tm2-kpi-border);
    }
    .tm2-kpi-val { font-size:1.2rem; font-weight:900; line-height:1.2; }
    .tm2-kpi-lbl { font-size:0.48rem; text-transform:uppercase; letter-spacing:1.5px; color:var(--tm2-muted); margin-top:2px; }

    /* Convergence card */
    .tm2-conv {
      padding:7px 9px; border-radius:7px;
      border-left:3px solid; margin-bottom:6px;
      background:rgba(255,109,0,0.06); cursor:pointer;
      transition:background 0.15s;
    }
    .tm2-conv:hover { background:rgba(255,109,0,0.1); }
    .tm2-conv-country { font-weight:700; font-size:0.68rem; margin-bottom:2px; }
    .tm2-conv-desc { font-size:0.6rem; color:var(--tm2-sub); line-height:1.35; }

    /* Hotspot bars */
    .tm2-hs-row {
      display:flex; align-items:center; gap:7px;
      padding:4px 0; border-bottom:1px solid var(--tm2-row); font-size:0.65rem;
    }
    .tm2-hs-bar { flex:1; height:5px; border-radius:3px; background:rgba(255,255,255,0.05); overflow:hidden; }
    .tm2-hs-fill { height:100%; border-radius:3px; }

    /* Threat matrix */
    .tm2-matrix { display:grid; grid-template-columns:repeat(5,1fr); gap:2px; }
    .tm2-cell {
      aspect-ratio:1; border-radius:3px; display:flex;
      align-items:center; justify-content:center;
      font-size:0.4rem; font-weight:700;
    }

    /* News */
    .tm2-news-item {
      display:flex; align-items:center; gap:6px;
      padding:4px 0; border-bottom:1px solid var(--tm2-row);
      font-size:0.65rem;
    }
    .tm2-news-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }
    .tm2-news-title {
      color:#c8d0da; text-decoration:none; white-space:nowrap;
      overflow:hidden; text-overflow:ellipsis; flex:1;
    }
    .tm2-news-title:hover { color:var(--tm2-accent); }
    .tm2-news-src { font-size:0.54rem; color:var(--tm2-muted); flex-shrink:0; }

    /* Sev filter */
    .tm2-sev-row { display:flex; gap:3px; margin-bottom:8px; flex-wrap:wrap; }
    .tm2-sev-btn {
      padding:2px 7px; border-radius:4px; font-family:inherit;
      font-size:0.5rem; cursor:pointer; border:1px solid transparent;
      background:transparent; color:var(--tm2-muted); transition:all 0.15s;
      text-transform:uppercase;
    }

    /* Zoom buttons */
    .tm2-zoom {
      position:absolute; right:316px; top:66px;
      z-index:20; display:flex; flex-direction:column;
      gap:4px; pointer-events:auto;
    }
    .tm2-zoom-btn {
      width:32px; height:32px; border-radius:7px;
      border:1px solid var(--tm2-border); background:var(--tm2-panel);
      color:var(--tm2-accent); font-size:1.1rem; cursor:pointer;
      backdrop-filter:blur(10px);
      display:flex; align-items:center; justify-content:center;
      transition:all 0.2s;
    }
    .tm2-zoom-btn:hover { background:rgba(0,229,255,0.15); }

    /* Divider */
    .tm2-hr { height:1px; background:var(--tm2-border); margin:8px 0; }
  `;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────

function sc(s: string): string {
  return SEV_COLOR[s] ?? "#40c4ff";
}

function ciiColor(n: number): string {
  return n >= 60 ? "#ff1744" : n >= 35 ? "#ff6d00" : n >= 15 ? "#ffd600" : "#00e676";
}

function ago(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000);
  if (m < 1) {return "just now";}
  if (m < 60) {return `${m}m ago`;}
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

// ─── Sub-renderers ────────────────────────────────────────────────

function renderStatusbar(props: TacticalMapProps, d: WorldIntelDashboard): TemplateResult {
  const tl = d.brief?.threatLevel ?? "info";
  const tlBg: Record<string, string> = {
    critical: "rgba(255,23,68,0.14)",
    high: "rgba(255,109,0,0.12)",
    medium: "rgba(255,214,0,0.10)",
    low: "rgba(0,230,118,0.09)",
    info: "rgba(64,196,255,0.09)",
  };
  return html`
    <div class="tm2-statusbar">
      <div class=${`tm2-live tm2-live--${d.running ? "on" : "off"}`}></div>
      <span style="font-weight:700;font-size:0.68rem;text-transform:uppercase;letter-spacing:2px">
        Tactical Command Map
      </span>
      <div style="width:1px;height:20px;background:var(--tm2-border);margin:0 4px"></div>
      <span class="tm2-threat-badge" style="color:${sc(tl)};background:${tlBg[tl]};border:1px solid ${sc(tl)}40">
        ⬡ ${tl.toUpperCase()} THREAT
      </span>
      <div style="flex:1"></div>
      <span style="font-size:0.58rem;color:var(--tm2-muted)">Signals <b style="color:#e0e6ed">${props.signals.length}</b></span>
      <span style="font-size:0.58rem;color:var(--tm2-muted)">Convergences <b style="color:#ff6d00">${d.convergences?.length ?? 0}</b></span>
      <span style="font-size:0.58rem;color:var(--tm2-muted)">Countries <b style="color:#00e5ff">${d.ciiScores?.length ?? 0}</b></span>
      <div style="width:1px;height:20px;background:var(--tm2-border);margin:0 4px"></div>
      <button type="button" class="tm2-btn tm2-btn-sm" @click=${props.onRefresh}>↻ Refresh</button>
      <button type="button" class="tm2-btn tm2-btn-sm" @click=${resetView}>⊙ Reset</button>
    </div>
  `;
}

function renderLeft(props: TacticalMapProps, signals: IntelSignal[]): TemplateResult {
  const SEV_ORDER = ["critical", "high", "medium", "low", "info"];
  const layerDefs: [MapLayer, string, string][] = [
    ["signals", "Signal Markers", "#40c4ff"],
    ["cii", "CII Heatmap", "#ffd600"],
    ["convergence", "Convergence Rings", "#ff6d00"],
    ["warrisk", "Conflict Zones", "#ff1744"],
    ["nuclear", "Nuclear Sites", "#ff6d00"],
    ["tradeRoutes", "Trade Routes", "#00e676"],
  ];

  const displayed = (
    tmSevFilter === "all" ? signals : signals.filter((s) => s.severity === tmSevFilter)
  )
    .toSorted(
      (a, b) =>
        SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || b.timestamp - a.timestamp,
    )
    .slice(0, 50);

  return html`
    <!-- Layers -->
    <div class="tm2-panel">
      <div class="tm2-title">Layers</div>
      <div class="tm2-layers">
        ${layerDefs.map(
          ([layer, label, col]) => html`
          <button type="button" class=${`tm2-layer-pill ${hasLayer(layer) ? "on" : ""}`}
            @click=${() => props.onLayerToggle(layer)}>
            <div class="tm2-layer-pill-dot" style="background:${hasLayer(layer) ? col : "rgba(255,255,255,0.15)"}"></div>
            ${label}
          </button>
        `,
        )}
      </div>
    </div>

    <!-- Signal Feed -->
    <div class="tm2-panel" style="flex-shrink:0">
      <div class="tm2-title">Intel Signal Feed</div>
      <div class="tm2-sev-row">
        ${(["all", "critical", "high", "medium", "low", "info"] as const).map(
          (sev) => html`
          <button type="button" class="tm2-sev-btn"
            style=${
              tmSevFilter === sev
                ? `color:${sev === "all" ? "#e0e6ed" : sc(sev)};border-color:${sev === "all" ? "rgba(255,255,255,0.2)" : sc(sev) + "40"};background:${sev === "all" ? "rgba(255,255,255,0.05)" : sc(sev) + "14"}`
                : ""
            }
            @click=${() => {
              tmSevFilter = sev;
            }}>
            ${sev === "all" ? "All" : sev}
          </button>
        `,
        )}
      </div>
    </div>

    <div class="tm2-panel tm2-panel--scroll">
      ${
        displayed.length === 0
          ? html`
              <div style="color: var(--tm2-muted); text-align: center; padding: 16px 0; font-size: 0.65rem">
                No signals
              </div>
            `
          // oxlint-disable-next-line no-unused-vars
          : displayed.map((s, i) => {
              const sel = props.selectedSignalIdx === signals.indexOf(s);
              return html`
            <div class=${`tm2-sig-row${sel ? " active" : ""}`}
              @click=${() => {
                const idx = signals.indexOf(s);
                props.onSelectSignal(sel ? null : idx);
                props.onSelectCountry(s.country);
                focusCountry(s.country);
              }}>
              <div class="tm2-sig-dot" style="background:${sc(s.severity)};box-shadow:0 0 5px ${sc(s.severity)}80"></div>
              <div style="min-width:0;flex:1">
                <div style="display:flex;align-items:center;gap:5px">
                  <span class="tm2-sig-country">${s.country}</span>
                  <span class="tm2-sig-type">${s.type.replace(/_/g, " ")}</span>
                </div>
                // oxlint-disable-next-line @typescript-eslint/no-explicit-any
                <div class="tm2-sig-desc">${(s as unknown as { description?: string; summary?: string }).description ?? (s as unknown as { description?: string; summary?: string }).summary ?? "—"}</div>
                <div class="tm2-sig-time">${sc(s.severity) ? "" : ""}${s.severity.toUpperCase()} · ${ago(s.timestamp)}</div>
              </div>
            </div>
          `;
            })
      }
    </div>
  `;
}

function renderRight(props: TacticalMapProps, d: WorldIntelDashboard): TemplateResult {
  const tl = d.brief?.threatLevel ?? "info";
  const critCount = props.signals.filter((s) => s.severity === "critical").length;
  const highCount = props.signals.filter((s) => s.severity === "high").length;
  const convs = d.convergences ?? [];
  const topCII = (d.ciiScores ?? []).toSorted((a, b) => b.ciiScore - a.ciiScore).slice(0, 12);
  const code = props.selectedCountry;
  const profile = code
    ? (topCII.find((c) => c.code === code) ?? d.ciiScores?.find((c) => c.code === code))
    : null;
  const ctrSigs = code ? props.signals.filter((s) => s.country === code) : [];

  return html`
    <!-- KPI cards -->
    <div class="tm2-panel" style="flex-shrink:0">
      <div class="tm2-title">AI Strategic Posture</div>
      <div class="tm2-kpis" style="margin-bottom:10px">
        <div class="tm2-kpi">
          <div class="tm2-kpi-val" style="color:${sc(tl)}">${critCount}</div>
          <div class="tm2-kpi-lbl">Critical</div>
        </div>
        <div class="tm2-kpi">
          <div class="tm2-kpi-val" style="color:#ff6d00">${highCount}</div>
          <div class="tm2-kpi-lbl">High</div>
        </div>
        <div class="tm2-kpi">
          <div class="tm2-kpi-val" style="color:#ffd600">${convs.length}</div>
          <div class="tm2-kpi-lbl">Convergences</div>
        </div>
        <div class="tm2-kpi">
          <div class="tm2-kpi-val" style="color:#00e5ff">${d.ciiScores?.length ?? 0}</div>
          <div class="tm2-kpi-lbl">Countries</div>
        </div>
      </div>
      ${
        d.brief?.summary
          ? html`
        <div class="tm2-hr"></div>
        <div style="font-size:0.62rem;color:var(--tm2-sub);line-height:1.45">${d.brief.summary.slice(0, 200)}${d.brief.summary.length > 200 ? "…" : ""}</div>
      `
          : nothing
      }
    </div>

    <!-- Convergence alerts -->
    ${
      convs.length > 0
        ? html`
      <div class="tm2-panel" style="flex-shrink:0">
        <div class="tm2-title">Convergence Alerts</div>
        ${convs.slice(0, 4).map(
          (c) => html`
          <div class="tm2-conv" style="border-color:${sc(c.maxSeverity)}"
            @click=${() => {
              props.onSelectCountry(c.country);
              focusCountry(c.country);
            }}>
            <div class="tm2-conv-country" style="color:${sc(c.maxSeverity)}">
              ${c.country} — ${c.signalCount} signals
            </div>
            <div class="tm2-conv-desc">${c.description}</div>
          </div>
        `,
        )}
      </div>
    `
        : nothing
    }

    <!-- Country detail or CII leaderboard -->
    <div class="tm2-panel tm2-panel--scroll">
      ${
        code && profile
          ? html`
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="tm2-title" style="margin-bottom:0">Country Intel · ${code}</div>
          <button type="button" class="tm2-btn tm2-btn-sm" @click=${() => props.onSelectCountry(null)}>✕</button>
        </div>
        <div style="display:flex;gap:6px;margin-bottom:10px">
          <span style="font-size:1.5rem;font-weight:900;color:#e0e6ed">${code}</span>
          <div style="display:flex;flex-direction:column;gap:3px;justify-content:center">
            <div style="font-size:0.6rem;color:${ciiColor(profile.ciiScore)};font-weight:700">CII ${profile.ciiScore}</div>
            <div style="font-size:0.55rem;color:var(--tm2-muted)">${ctrSigs.length} active signals</div>
          </div>
        </div>
        <div class="tm2-cii-bar" style="margin-bottom:10px;height:6px">
          <div class="tm2-cii-fill" style="width:${profile.ciiScore}%;background:${ciiColor(profile.ciiScore)}"></div>
        </div>
        ${ctrSigs.slice(0, 8).map(
          (s) => html`
          <div class="tm2-sig-row">
            <div class="tm2-sig-dot" style="background:${sc(s.severity)}"></div>
            <div>
              <div style="display:flex;gap:5px">
                <span class="tm2-sig-type">${s.type.replace(/_/g, " ")}</span>
              </div>
              // oxlint-disable-next-line @typescript-eslint/no-explicit-any
              <div class="tm2-sig-desc">${(s as unknown as { description?: string; summary?: string }).description ?? (s as unknown as { description?: string; summary?: string }).summary ?? "—"}</div>
              <div class="tm2-sig-time">${s.severity.toUpperCase()} · ${ago(s.timestamp)}</div>
            </div>
          </div>
        `,
        )}
      `
          : html`
        <div class="tm2-title">CII Leaderboard</div>
        ${topCII.map(
          (c) => html`
          <div class="tm2-cii-row"
            @click=${() => {
              props.onSelectCountry(c.code);
              focusCountry(c.code);
            }}>
            <span style="font-weight:700;color:${ciiColor(c.ciiScore)}">${c.code}</span>
            <div class="tm2-cii-bar">
              <div class="tm2-cii-fill" style="width:${c.ciiScore}%;background:${ciiColor(c.ciiScore)}"></div>
            </div>
            <span style="text-align:right;color:${ciiColor(c.ciiScore)};font-weight:700">${c.ciiScore}</span>
            <span style="font-size:0.55rem;color:var(--tm2-muted)">${c.trend === "rising" ? "↑" : c.trend === "falling" ? "↓" : "→"}</span>
          </div>
        `,
        )}
      `
      }
    </div>
  `;
}

function renderBottom(props: TacticalMapProps, d: WorldIntelDashboard): TemplateResult {
  const domains = ["Cyber", "Military", "Political", "Economic", "Nuclear"];
  const sevs = ["critical", "high", "medium", "low", "info"];
  const sigMap: Record<string, string> = {};
  for (const s of props.signals) {
    const dom = domains.find((d2) => s.type.toLowerCase().includes(d2.toLowerCase())) ?? "Military";
    const cur = sigMap[dom];
    if (!cur || sevs.indexOf(s.severity) < sevs.indexOf(cur)) {sigMap[dom] = s.severity;}
  }

  const topNews = (d.news ?? []).slice(0, 8);

  return html`
    <!-- Threat Matrix -->
    <div class="tm2-panel" style="flex:1;min-width:180px;overflow:hidden">
      <div class="tm2-title">Threat Matrix</div>
      <div style="display:grid;grid-template-columns:60px 1fr;gap:4px">
        <div></div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:2px;font-size:0.42rem;color:var(--tm2-muted);text-align:center;padding-bottom:3px">
          ${sevs.map((s) => html`<span style="color:${sc(s)}">${s.slice(0, 3)}</span>`)}
        </div>
        ${domains.map((dom) => {
          const domSev = sigMap[dom];
          return html`
            <span style="font-size:0.54rem;text-transform:uppercase;color:var(--tm2-sub);align-self:center">${dom}</span>
            <div class="tm2-matrix">
              ${sevs.map((sev) => {
                const active = domSev && sevs.indexOf(domSev) <= sevs.indexOf(sev);
                return html`
                  <div class="tm2-cell"
                    style="background:${active ? sc(domSev ?? sev) + "22" : "rgba(255,255,255,0.03)"};border:1px solid ${active ? sc(domSev ?? sev) + "45" : "transparent"}">
                    ${active ? html`<span style="color:${sc(domSev ?? sev)}">●</span>` : nothing}
                  </div>
                `;
              })}
            </div>
          `;
        })}
      </div>
    </div>

    <!-- Conflict Zones -->
    <div class="tm2-panel" style="flex:0.9;min-width:160px;overflow-y:auto">
      <div class="tm2-title">Conflict Zones</div>
      ${MILITARY_HOTSPOTS.toSorted((a, b) => b[3] - a[3]).map(
        ([, , label, intensity]) => html`
        <div class="tm2-hs-row" @click=${() => focusCountry(label)}>
          <span style="min-width:80px;font-size:0.63rem;color:#e0e6ed">${label}</span>
          <div class="tm2-hs-bar">
            <div class="tm2-hs-fill" style="width:${(intensity * 100).toFixed(0)}%;background:linear-gradient(90deg,#ff6d00,#ff1744)"></div>
          </div>
          <span style="font-size:0.55rem;min-width:28px;text-align:right;color:${intensity > 0.85 ? "#ff1744" : "#ff6d00"}">${(intensity * 100).toFixed(0)}%</span>
        </div>
      `,
      )}
    </div>

    <!-- Live News -->
    <div class="tm2-panel" style="flex:1.4;min-width:0;overflow-y:auto">
      <div class="tm2-title">Live Intel News</div>
      ${
        topNews.length === 0
          ? html`
              <div style="color: var(--tm2-muted); font-size: 0.65rem">No news data</div>
            `
          : topNews.map(
              (n) => html`
          <div class="tm2-news-item">
            <div class="tm2-news-dot" style="background:${sc(n.threat?.severity ?? "info")}"></div>
            <a class="tm2-news-title" href=${n.link} target="_blank" rel="noopener">${n.title}</a>
            <span class="tm2-news-src">${n.source ?? ""}</span>
          </div>
        `,
            )
      }
    </div>
  `;
}

// ─── Main Render ──────────────────────────────────────────────────

export function renderTacticalMap(props: TacticalMapProps): TemplateResult {
  injectCSS();
  activeLayers = new Set(props.activeLayers as MapLayer[]);

  if (props.loading && !props.dashboard) {
    return html`
      <div class="tm2-root" style="display: flex; align-items: center; justify-content: center">
        <div
          style="text-align: center; color: #00e5ff; font-family: &quot;JetBrains Mono&quot;, monospace"
        >
          <div style="font-size: 2.5rem; margin-bottom: 16px; animation: tm2-pulse 1.5s infinite">🌐</div>
          <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 3px">
            Loading Tactical Command Map…
          </div>
        </div>
      </div>
    `;
  }

  const d = props.dashboard;
  if (!d) {
    return html`
      <div class="tm2-root" style="display:flex;align-items:center;justify-content:center">
        <div style="text-align:center;font-family:'JetBrains Mono',monospace">
          <div style="font-size:3rem;margin-bottom:12px">🌍</div>
          <div style="font-size:1rem;font-weight:700;color:#c8d0da;margin-bottom:8px">Tactical Map Offline</div>
          <div style="font-size:0.72rem;color:#4a5568;margin-bottom:20px">Start World Intelligence to activate tactical analysis.</div>
          <button type="button" class="tm2-btn" @click=${props.onRefresh}>⚡ Initialize</button>
        </div>
      </div>
    `;
  }

  return html`
    <div class="tm2-root">
      <!-- Globe -->
      <div class="tm2-globe" id="tm2-globe-mount"></div>

      <!-- Scanline -->
      <div class="tm2-scanline"></div>

      <!-- Zoom buttons -->
      <div class="tm2-zoom">
        <button type="button" class="tm2-zoom-btn" title="Reset View" @click=${resetView}>⊙</button>
      </div>

      <!-- HUD -->
      <div class="tm2-hud">
        ${renderStatusbar(props, d)}

        <div class="tm2-left">${renderLeft(props, props.signals)}</div>

        <!-- Centre transparent — globe receives events -->
        <div style="grid-column:2;grid-row:2;pointer-events:none"></div>

        <div class="tm2-right">${renderRight(props, d)}</div>

        <div class="tm2-bottom">${renderBottom(props, d)}</div>
      </div>
    </div>
  `;
}
