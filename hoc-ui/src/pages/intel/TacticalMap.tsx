import type L from "leaflet";
/**
 * TacticalMap.tsx — Advanced Tactical Operations Center
 *
 * Mirrors WorldMonitor.tsx exactly:
 * - Static `import "leaflet/dist/leaflet.css"` (critical for marker rendering)
 * - All overlays built inside the single Leaflet init useEffect
 * - Conflict zones, nuclear sites, flash alerts, pipelines, cables, data centers
 * - HoC entity markers: nodes, agents, threats, comms, citizens
 * - Pulsing custom CSS overlays for CRITICAL alerts
 */
import { RefreshCw, Wifi, ZoomIn, ZoomOut, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { useRpc, rpc } from "@/lib/rpc";

// ─── Types ───────────────────────────────────────────────────────────────────

type MarkerType = "citizen" | "agent" | "node" | "threat" | "comm" | "discovery" | "anomaly";
type ThreatLevel = "low" | "medium" | "high" | "critical";

interface TacticalMarker {
  id: string;
  lat: number;
  lng: number;
  type: MarkerType;
  label: string;
  sublabel?: string;
  threatLevel?: ThreatLevel;
  status?: "active" | "idle" | "offline" | "alert";
  signal?: number;
}

interface IntelLog {
  id: string;
  time: string;
  type: "info" | "warn" | "alert" | "success";
  msg: string;
}

// ─── Static layer definitions (mirrors WorldMonitor) ─────────────────────────

const MAP_LAYERS = [
  { id: "conflicts", label: "Conflict Zones", color: "#ff4444", enabled: true },
  { id: "nuclear", label: "Nuclear Sites", color: "#b2ff59", enabled: true },
  { id: "flashAlerts", label: "Flash Alerts", color: "#ff6b00", enabled: true },
  { id: "strikes", label: "Active Strikes", color: "#ff2222", enabled: true },
  { id: "assets", label: "Military Assets", color: "#ffd700", enabled: true },
  { id: "bases", label: "Military Bases", color: "#4fc3f7", enabled: true },
  { id: "hotspots", label: "Intel Hotspots", color: "#ff8c00", enabled: true },
  { id: "cables", label: "Undersea Cables", color: "#29b6f6", enabled: false },
  { id: "pipelines", label: "Pipelines", color: "#ffa726", enabled: false },
  { id: "datacenters", label: "AI Data Centers", color: "#26c6da", enabled: false },
  { id: "hocNodes", label: "HoC Nodes", color: "#06b6d4", enabled: true },
  { id: "hocAgents", label: "HoC Agents", color: "#38bdf8", enabled: true },
  { id: "hocThreats", label: "HoC Threats", color: "#f87171", enabled: true },
  { id: "hocComms", label: "HoC Comms", color: "#34d399", enabled: true },
  { id: "hocCitizens", label: "HoC Citizens", color: "#a78bfa", enabled: true },
];

// ─── Static geo data (conflict zones, nuclear, bases) ────────────────────────

const CONFLICT_MARKERS = [
  { lat: 32.0, lon: 34.8, label: "🔴 Israel/Gaza", severity: "critical" },
  { lat: 33.5, lon: 36.2, label: "🔴 Syria", severity: "high" },
  { lat: 15.6, lon: 32.5, label: "🔴 Sudan", severity: "critical" },
  { lat: 51.5, lon: 31.0, label: "🔴 Ukraine", severity: "critical" },
  { lat: 12.8, lon: 45.0, label: "🟠 Yemen", severity: "high" },
  { lat: 13.5, lon: 2.1, label: "🟠 Sahel", severity: "high" },
  { lat: 25.0, lon: 61.0, label: "🟠 Pakistan/Afghan", severity: "high" },
  { lat: 23.1, lon: 121.2, label: "🟡 Taiwan Strait", severity: "medium" },
];

const NUCLEAR_SITES = [
  { lat: 29.6, lon: 52.5, label: "☢ Bushehr Reactor (IR)" },
  { lat: 33.7, lon: 51.4, label: "☢ Fordow (IR)" },
  { lat: 32.0, lon: 34.8, label: "☢ Dimona (IL)" },
  { lat: 39.0, lon: 125.7, label: "☢ Yongbyon (NK)" },
  { lat: 34.1, lon: 73.6, label: "☢ Kahuta (PK)" },
  { lat: 55.8, lon: 37.6, label: "☢ Moscow Cmd (RU)" },
  { lat: 38.4, lon: 116.7, label: "☢ China ICBM (CN)" },
  { lat: 45.9, lon: -119.6, label: "☢ Hanford (US)" },
];

const FLASH_ALERTS = [
  { lat: 32.0, lon: 34.8, label: "⚡ Active Strikes — Gaza" },
  { lat: 33.5, lon: 36.2, label: "⚡ Drone Activity — Syria" },
  { lat: 15.6, lon: 43.5, label: "⚡ Strike Vector — Yemen" },
  { lat: 36.0, lon: 60.0, label: "⚡ NE Iran Activity" },
  { lat: 49.0, lon: 32.0, label: "⚡ Artillery — Ukraine" },
  { lat: 25.0, lon: 121.2, label: "⚡ PLA Navy — Taiwan" },
  { lat: 48.0, lon: 37.8, label: "⚡ MLRS — Donbas Line" },
  { lat: 50.4, lon: 30.5, label: "⚡ Kyiv Air Defense" },
  { lat: 37.9, lon: 23.7, label: "⚡ Mediterranean Patrol — Athens" },
  { lat: 26.2, lon: 50.5, label: "⚡ Naval Posture — Bahrain" },
];

// ─── Active strike events (source → target missile arcs) ──────────────────────
interface StrikeArc {
  id: string;
  fromLat: number;
  fromLon: number;
  toLat: number;
  toLon: number;
  type: "cruise" | "ballistic" | "drone";
  label: string;
  color: string;
}
const STRIKE_ARCS: StrikeArc[] = [
  {
    id: "s1",
    fromLat: 29.5,
    fromLon: 52.0,
    toLat: 32.0,
    toLon: 34.8,
    type: "cruise",
    label: "Iranian Cruise → IL",
    color: "#ff2222",
  },
  {
    id: "s2",
    fromLat: 39.0,
    fromLon: 125.7,
    toLat: 35.7,
    toLon: 139.7,
    type: "ballistic",
    label: "DPRK Ballistic → JP",
    color: "#ff8c00",
  },
  {
    id: "s3",
    fromLat: 15.2,
    fromLon: 44.2,
    toLat: 24.7,
    toLon: 46.7,
    type: "drone",
    label: "Houthi Drone → SA",
    color: "#fbbf24",
  },
  {
    id: "s4",
    fromLat: 55.5,
    fromLon: 37.0,
    toLat: 50.4,
    toLon: 30.5,
    type: "cruise",
    label: "Kalibr → Kyiv",
    color: "#ff2222",
  },
  {
    id: "s5",
    fromLat: 36.0,
    fromLon: 59.6,
    toLat: 33.3,
    toLon: 44.4,
    type: "ballistic",
    label: "IRBM → Baghdad",
    color: "#ff6b00",
  },
];

// ─── Military asset markers ──────────────────────────────────────────────────
interface AssetMarker {
  lat: number;
  lon: number;
  type: string;
  label: string;
  emoji: string;
  color: string;
}
const MILITARY_ASSETS: AssetMarker[] = [
  {
    lat: 36.5,
    lon: 25.0,
    type: "carrier",
    label: "USS Gerald Ford CVN-78",
    emoji: "⛵",
    color: "#4fc3f7",
  },
  {
    lat: 13.5,
    lon: 52.0,
    type: "carrier",
    label: "HMS Queen Elizabeth",
    emoji: "⛵",
    color: "#4fc3f7",
  },
  {
    lat: 25.0,
    lon: 60.5,
    type: "destroyer",
    label: "USS Arleigh Burke DDG-51",
    emoji: "🚢",
    color: "#38bdf8",
  },
  {
    lat: 23.0,
    lon: 120.0,
    type: "destroyer",
    label: "PLA Type 055 Destroyer",
    emoji: "🚢",
    color: "#ef4444",
  },
  {
    lat: 50.5,
    lon: 29.0,
    type: "tank",
    label: "Ukrainian Armored Battalion",
    emoji: "🪖",
    color: "#fbbf24",
  },
  {
    lat: 48.5,
    lon: 38.0,
    type: "tank",
    label: "Russian T-90 Brigade",
    emoji: "🛡",
    color: "#ef4444",
  },
  {
    lat: 32.5,
    lon: 35.5,
    type: "fighter",
    label: "IDF F-35I Adir Sqdn",
    emoji: "✈",
    color: "#4ade80",
  },
  {
    lat: 25.5,
    lon: 51.0,
    type: "fighter",
    label: "USAF F-22 Raptor – Qatar",
    emoji: "✈",
    color: "#4fc3f7",
  },
  {
    lat: 36.0,
    lon: 139.5,
    type: "fighter",
    label: "JASDF F-15J Sqdn",
    emoji: "✈",
    color: "#4ade80",
  },
  {
    lat: 23.5,
    lon: 118.0,
    type: "fighter",
    label: "PLA J-20 Stealth Sqdn",
    emoji: "✈",
    color: "#ef4444",
  },
  {
    lat: 37.0,
    lon: 27.0,
    type: "bomber",
    label: "B-52 Stratofortress – Med",
    emoji: "💣",
    color: "#fbbf24",
  },
  {
    lat: 44.0,
    lon: 42.0,
    type: "missile_platform",
    label: "S-400 Battery — Caucasus",
    emoji: "🚀",
    color: "#ef4444",
  },
  {
    lat: 31.5,
    lon: 34.5,
    type: "missile_platform",
    label: "Iron Dome Battery – Negev",
    emoji: "🔱",
    color: "#4ade80",
  },
  {
    lat: 35.5,
    lon: 51.0,
    type: "missile_platform",
    label: "Shaheen IRBM – Iran",
    emoji: "🚀",
    color: "#ff6b00",
  },
  {
    lat: 38.5,
    lon: 117.0,
    type: "missile_platform",
    label: "PLA DF-41 ICBM Silo",
    emoji: "☢",
    color: "#ef4444",
  },
];

const MILITARY_BASES = [
  { lat: 24.7, lon: 46.7, label: "◉ Saudi Arabia (USAF)" },
  { lat: 25.3, lon: 51.5, label: "◉ Al Udeid AB, Qatar" },
  { lat: 39.9, lon: 32.9, label: "◉ Incirlik AB, Turkey" },
  { lat: 28.6, lon: 77.2, label: "◉ New Delhi (IN Forces)" },
  { lat: 23.1, lon: 113.3, label: "◉ PLA Southern (CN)" },
  { lat: 36.6, lon: 138.8, label: "◉ Yokota AB, Japan" },
  { lat: 1.3, lon: 103.8, label: "◉ Changi (SG)" },
  { lat: -12.4, lon: 130.8, label: "◉ Darwin (AU)" },
];

const INTEL_HOTSPOTS = [
  { lat: 13.5, lon: 30.2, label: "◆ Sudan — Civil War" },
  { lat: 9.0, lon: 7.5, label: "◆ Nigeria — Insurgency" },
  { lat: 12.8, lon: 45.1, label: "◆ Somalia — Al-Shabaab" },
  { lat: 0.3, lon: 32.6, label: "◆ Uganda — LRA" },
  { lat: 0.3, lon: 9.4, label: "◆ Gabon — Coup Watch" },
  { lat: 3.9, lon: 11.5, label: "◆ Cameroon — Conflict" },
];

const DATA_CENTERS = [
  [37.4, -122.1, "Silicon Valley"],
  [47.6, -122.3, "Seattle"],
  [51.5, -0.1, "London"],
  [50.1, 8.7, "Frankfurt"],
  [35.7, 139.7, "Tokyo"],
  [23.1, 113.3, "Guangzhou"],
] as [number, number, string][];

const CABLE_ROUTES: [number, number][][] = [
  [
    [51.5, -0.1],
    [37.4, -122.1],
  ],
  [
    [35.7, 139.7],
    [37.4, -122.1],
  ],
  [
    [1.3, 103.8],
    [23.1, 113.3],
  ],
  [
    [1.3, 103.8],
    [51.5, -0.1],
  ],
  [
    [30.0, 31.2],
    [51.5, -0.1],
  ],
];

const PIPELINES: [number, number][][] = [
  [
    [36.0, 59.6],
    [41.0, 49.0],
    [41.0, 29.0],
    [41.9, 12.5],
  ],
  [
    [27.5, 49.0],
    [36.8, 34.6],
    [41.9, 12.5],
  ],
  [
    [30.0, 31.2],
    [36.8, 10.2],
  ],
];

// ─── HoC entity seed data ─────────────────────────────────────────────────────

const SEED_MARKERS: TacticalMarker[] = [
  {
    id: "m1",
    lat: 40.7,
    lng: -74.0,
    type: "node",
    label: "Node α — Gateway",
    sublabel: "NYC datacenter",
    status: "active",
    signal: 95,
  },
  {
    id: "m2",
    lat: 51.5,
    lng: -0.1,
    type: "node",
    label: "Node β — London",
    sublabel: "EU relay",
    status: "active",
    signal: 88,
  },
  {
    id: "m3",
    lat: 35.7,
    lng: 139.7,
    type: "agent",
    label: "Aria-7",
    sublabel: "Scanning feeds",
    status: "active",
    signal: 72,
  },
  {
    id: "m4",
    lat: 48.9,
    lng: 2.3,
    type: "threat",
    label: "Anomalous traffic",
    sublabel: "SIGINT intercept",
    status: "alert",
    signal: 60,
    threatLevel: "medium",
  },
  {
    id: "m5",
    lat: -33.9,
    lng: 151.2,
    type: "comm",
    label: "Comm Relay Sydney",
    sublabel: "Satellite uplink",
    status: "active",
    signal: 81,
  },
  {
    id: "m6",
    lat: 1.3,
    lng: 103.8,
    type: "agent",
    label: "Nova-12",
    sublabel: "Monitoring chatter",
    status: "active",
    signal: 66,
  },
  {
    id: "m7",
    lat: 55.7,
    lng: 37.6,
    type: "threat",
    label: "Hostile signature",
    sublabel: "Classified",
    status: "alert",
    signal: 40,
    threatLevel: "high",
  },
  {
    id: "m8",
    lat: 19.4,
    lng: -99.1,
    type: "citizen",
    label: "Zara-5 / Mexico City",
    sublabel: "Creative cluster",
    status: "idle",
    signal: 50,
  },
  {
    id: "m9",
    lat: -23.5,
    lng: -46.6,
    type: "citizen",
    label: "Orion-2 / São Paulo",
    sublabel: "Research node",
    status: "active",
    signal: 77,
  },
  {
    id: "m10",
    lat: 28.6,
    lng: 77.2,
    type: "node",
    label: "Node γ — Delhi",
    sublabel: "IndAsia bridge",
    status: "active",
    signal: 91,
  },
  {
    id: "m11",
    lat: -1.3,
    lng: 36.8,
    type: "comm",
    label: "African Relay",
    sublabel: "Mesh network hub",
    status: "active",
    signal: 62,
  },
  {
    id: "m12",
    lat: 64.1,
    lng: -21.9,
    type: "anomaly",
    label: "EM Interference",
    sublabel: "Reykjavik sector",
    status: "alert",
    signal: 30,
    threatLevel: "low",
  },
];

const SEED_LOGS: IntelLog[] = [
  {
    id: "l1",
    time: "00:28:54",
    type: "alert",
    msg: "⚡ Hostile signature at 55.7°N, 37.6°E — Threat: HIGH",
  },
  { id: "l2", time: "00:28:20", type: "warn", msg: "⚠ EM interference spike — Reykjavik sector" },
  { id: "l3", time: "00:27:58", type: "success", msg: "✓ Node β — London signal restored to 88%" },
  {
    id: "l4",
    time: "00:27:10",
    type: "info",
    msg: "Aria-7 pattern sweep complete — 142 feeds indexed",
  },
  { id: "l5", time: "00:26:45", type: "warn", msg: "⚠ Anomalous traffic burst — Paris vector" },
  { id: "l6", time: "00:25:30", type: "info", msg: "Nova-12 uplink established — Singapore relay" },
];

// ─── CSS styles ───────────────────────────────────────────────────────────────

const STYLE_ID = "tm4-styles";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
    .tm4-root * { box-sizing: border-box; }
    .tm4-root {
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      background: #080d08; min-height: 100vh; color: #aab8aa;
      display: flex; flex-direction: column;
    }
    .tm4-topbar {
      display: flex; align-items: center; gap: 8px; padding: 5px 14px;
      background: #050905; border-bottom: 1px solid #1a2a1a; font-size: 11px; flex-wrap: wrap;
    }
    .tm4-main { display: flex; flex: 1; overflow: hidden; min-height: 0; }
    .tm4-layer-panel {
      width: 152px; flex-shrink: 0; background: rgba(5,13,5,0.95); backdrop-filter: blur(4px);
      border-right: 1px solid #1a2a1a; padding: 8px; overflow-y: auto; z-index: 10;
    }
    .tm4-map-wrap { flex: 1; position: relative; background: #1a2535; overflow: hidden; }
    .tm4-map-div { position: absolute; inset: 0; z-index: 1; }
    .tm4-right-panel {
      width: 270px; flex-shrink: 0; display: flex; flex-direction: column;
      background: rgba(5,10,5,0.97); border-left: 1px solid #1a2a1a; overflow: hidden;
    }
    .tm4-panel-hdr {
      font-size: 9px; font-weight: 700; color: #8ba888; text-transform: uppercase;
      letter-spacing: 1px; padding: 5px 10px; border-bottom: 1px solid #1a2a1a;
      display: flex; align-items: center; gap: 5px; flex-shrink: 0;
    }
    .tm4-posture-ring {
      width: 90px; height: 90px; border-radius: 50%;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      border: 3px solid; margin: 0 auto;
    }
    .tm4-node-row {
      display: flex; align-items: center; gap: 6px; padding: 4px 10px;
      cursor: pointer; border-bottom: 1px solid #0f180f; font-size: 10px;
      transition: background 0.15s;
    }
    .tm4-node-row:hover { background: rgba(125,189,125,0.05); }
    .tm4-node-row.sel { background: rgba(56,189,248,0.07); border-left: 2px solid #38bdf8; }
    .tm4-log-row {
      display: flex; gap: 7px; padding: 2px 10px; align-items: baseline;
      font-size: 9.5px; animation: tm4-fade 0.3s ease-out;
    }
    @keyframes tm4-fade { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:translateY(0); } }
    .tm4-sig-bar { display: flex; align-items: flex-end; gap: 1px; }
    .tm4-ticker-wrap { overflow: hidden; flex: 1; }
    .tm4-ticker { display: inline-block; white-space: nowrap; animation: tm4-scroll 45s linear infinite; color: #aab8aa; }
    @keyframes tm4-scroll { 0% { transform:translateX(100%); } 100% { transform:translateX(-100%); } }
    .tm4-layer-btn {
      display: flex; align-items: center; gap: 6px; padding: 3px 6px;
      margin-bottom: 3px; border-radius: 3px; cursor: pointer; font-size: 9px;
      border: 1px solid transparent; transition: all 0.15s; background: transparent;
      color: #4a6a4a; font-family: inherit; text-align: left; width: 100%;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .tm4-layer-btn.on { color: #c8d8c8; }
    .tm4-zoom-stack { position: absolute; right: 10px; top: 10px; z-index: 1000; display: flex; flex-direction: column; gap: 3px; }
    .tm4-zoom-btn {
      width: 28px; height: 28px; border-radius: 4px; cursor: pointer;
      background: rgba(5,15,5,0.88); border: 1px solid #1a3a1a; color: #7dbd7d;
      display: flex; align-items: center; justify-content: center; backdrop-filter: blur(6px);
      font-size: 11px; transition: border-color 0.2s;
    }
    .tm4-zoom-btn:hover { border-color: #4a8a4a; }
    .wm-tooltip {
      background: #050d05 !important; border: 1px solid #2a4a2a !important;
      color: #c8d8c8 !important; font-family: 'JetBrains Mono', monospace !important;
      font-size: 10px !important; border-radius: 3px !important; white-space: nowrap !important;
    }
    .leaflet-control-attribution { font-size: 8px !important; background: rgba(0,0,0,0.4) !important; color: #223 !important; }
    /* Flash alert pulse ring via leaflet div icon */
    @keyframes pulse-ring {
      0%   { transform: scale(1);   opacity: 0.8; }
      50%  { transform: scale(2.2); opacity: 0;   }
      100% { transform: scale(1);   opacity: 0;   }
    }
    .flash-alert-dot { position: relative; }
    .flash-alert-dot::after {
      content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      border-radius: 50%; border: 2px solid #ff6b00;
      animation: pulse-ring 1.5s ease-out infinite;
    }
  `;
  document.head.appendChild(el);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalBars({ signal = 0 }: { signal?: number }) {
  const filled = Math.round((signal / 100) * 4);
  return (
    <div className="tm4-sig-bar">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            width: 3,
            height: 4 + i * 2,
            borderRadius: 1,
            background: i < filled ? "#38bdf8" : "#1e3a5f",
            display: "inline-block",
          }}
        />
      ))}
    </div>
  );
}

function StatusDot({ status }: { status?: string }) {
  const c =
    status === "active"
      ? "#34d399"
      : status === "alert"
        ? "#f87171"
        : status === "idle"
          ? "#94a3b8"
          : "#475569";
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: c,
        display: "inline-block",
        flexShrink: 0,
      }}
    />
  );
}

function ThreatTag({ level }: { level?: ThreatLevel }) {
  if (!level) {
    return null;
  }
  const c: Record<ThreatLevel, string> = {
    low: "#34d399",
    medium: "#fbbf24",
    high: "#f87171",
    critical: "#ef4444",
  };
  return (
    <span
      style={{
        fontSize: 7,
        padding: "1px 3px",
        borderRadius: 2,
        border: `1px solid ${c[level]}40`,
        background: `${c[level]}18`,
        color: c[level],
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {level}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type LayerGroupMap = Record<string, L.LayerGroup>;

function getHocLayerId(type: string): string {
  if (type === "node") {
    return "hocNodes";
  }
  if (type === "agent") {
    return "hocAgents";
  }
  if (type === "threat" || type === "anomaly") {
    return "hocThreats";
  }
  if (type === "comm" || type === "discovery") {
    return "hocComms";
  }
  return "hocCitizens";
}

const HOC_COLORS: Record<string, string> = {
  citizen: "#a78bfa",
  agent: "#38bdf8",
  node: "#06b6d4",
  threat: "#ef4444",
  comm: "#34d399",
  discovery: "#fbbf24",
  anomaly: "#f472b6",
};

// ─── Main page ────────────────────────────────────────────────────────────────

const MAX_LOG = 30;

export function TacticalMapPage() {
  useEffect(() => {
    injectStyles();
  }, []);

  const mapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<LayerGroupMap>({});
  const hocMarkersRef = useRef<Record<string, L.Layer>>({});
  const rafRef = useRef<number>(0);
  const arcProgressRef = useRef<Record<string, number>>(
    Object.fromEntries(STRIKE_ARCS.map((a) => [a.id, Math.random()])),
  );

  const [layers, setLayers] = useState(MAP_LAYERS);
  const [selected, setSelected] = useState<TacticalMarker | null>(null);
  const [cmdInput, setCmdInput] = useState("");
  const [tick, setTick] = useState(0);
  const [logs, setLogs] = useState<IntelLog[]>(SEED_LOGS);
  const [now, setNow] = useState(new Date());
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // RPC
  const { data: intelData, refetch } = useRpc<{ events?: TacticalMarker[] }>("republic.intelligence.events", {});
  const { data: worldData } = useRpc<{ events?: { description: string }[] }>(
    "republic.world.events",
    {},
  );

  const rawMarkers: TacticalMarker[] = (() => {
    const ev = intelData?.events;
    if (!Array.isArray(ev) || !ev.length) {
      return SEED_MARKERS;
    }
    const valid = ev.filter(
      (e) =>
        e && typeof e.id === "string" && typeof e.lat === "number" && typeof e.lng === "number",
    );
    return valid.length > 0 ? (valid as TacticalMarker[]) : SEED_MARKERS;
  })();

  // Clock + world events
  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      setNow(new Date());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!worldData?.events?.length) {
      return;
    }
    const ev = worldData.events[tick % worldData.events.length];
    if (!ev) {
      return;
    }
    const t = new Date().toTimeString().slice(0, 8);
    setLogs((prev) => [
      { id: `l-${tick}`, time: t, type: "info", msg: ev.description },
      ...prev.slice(0, MAX_LOG - 1),
    ]);
  }, [tick]); // eslint-disable-line

  // ── Synthetic intel log generator (drives map aliveness) ──────────────────
  useEffect(() => {
    const INTEL_POOL = [
      {
        type: "alert" as const,
        tpl: () =>
          `⚡ Strike detected: ${STRIKE_ARCS[Math.floor(Math.random() * STRIKE_ARCS.length)].label}`,
      },
      {
        type: "warn" as const,
        tpl: () =>
          `⚠ Anomalous movement — ${MILITARY_ASSETS[Math.floor(Math.random() * MILITARY_ASSETS.length)].label}`,
      },
      {
        type: "info" as const,
        tpl: () =>
          `📡 Satellite pass — ${CONFLICT_MARKERS[Math.floor(Math.random() * CONFLICT_MARKERS.length)].label}`,
      },
      {
        type: "success" as const,
        tpl: () =>
          `✓ Air defense intercept — ${FLASH_ALERTS[Math.floor(Math.random() * FLASH_ALERTS.length)].label}`,
      },
      {
        type: "warn" as const,
        tpl: () => `⚠ Electronic warfare burst — sector ${Math.floor(Math.random() * 9) + 1}`,
      },
      {
        type: "alert" as const,
        tpl: () =>
          `🚀 Missile launch detected — ${MILITARY_ASSETS.filter((a) => a.type === "missile_platform")[Math.floor(Math.random() * 5) % 5]?.label}`,
      },
      {
        type: "info" as const,
        tpl: () =>
          `Drone recon sweep — ${NUCLEAR_SITES[Math.floor(Math.random() * NUCLEAR_SITES.length)].label}`,
      },
    ];
    const id = setInterval(() => {
      const entry = INTEL_POOL[Math.floor(Math.random() * INTEL_POOL.length)];
      if (!entry) {
        return;
      }
      const t = new Date().toTimeString().slice(0, 8);
      setLogs((prev) => [
        { id: `s-${Date.now()}`, time: t, type: entry.type, msg: entry.tpl() },
        ...prev.slice(0, MAX_LOG - 1),
      ]);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // ── Leaflet init (mirrors WorldMonitor exactly) ───────────────────────────
  useEffect(() => {
    let isMounted = true;
    if (!mapRef.current || leafletRef.current) {
      return;
    }

    let map: L.Map;
    import("leaflet").then((LModule) => {
      if (!isMounted || leafletRef.current) {
        return;
      }

      const Lc =
        (LModule as { default?: typeof import("leaflet") }).default ||
        (LModule as typeof import("leaflet"));

      map = Lc.map(mapRef.current!, {
        center: [20, 15],
        zoom: 2.5,
        zoomControl: false,
        attributionControl: false,
        maxBounds: [
          [-85, -200],
          [85, 200],
        ],
        minZoom: 2,
      });

      Lc.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        crossOrigin: true,
      }).addTo(map);

      // Create one LayerGroup per layer
      const groups: LayerGroupMap = {};
      for (const ld of MAP_LAYERS) {
        groups[ld.id] = Lc.layerGroup();
      }

      // ── Conflict markers + zone rectangles ─────────────────────────────
      CONFLICT_MARKERS.forEach((m) => {
        const color =
          m.severity === "critical" ? "#ff4444" : m.severity === "high" ? "#ff8c00" : "#fbbf24";
        const r = m.severity === "critical" ? 10 : 7;
        const circle = Lc.circleMarker([m.lat, m.lon] as L.LatLngExpression, {
          radius: r,
          fillColor: color,
          color,
          weight: 2,
          opacity: 0.95,
          fillOpacity: 0.6,
        });
        circle.bindTooltip(m.label, { className: "wm-tooltip", direction: "top" });
        groups["conflicts"]?.addLayer(circle);
      });
      // Sudan conflict rectangle
      groups["conflicts"]?.addLayer(
        Lc.rectangle(
          [
            [4, 25],
            [18, 38],
          ] as L.LatLngBoundsExpression,
          { color: "#ff4444", weight: 1, fillOpacity: 0.12, dashArray: "4,4" },
        ),
      );
      // Ukraine conflict rectangle
      groups["conflicts"]?.addLayer(
        Lc.rectangle(
          [
            [46, 28],
            [52, 40],
          ] as L.LatLngBoundsExpression,
          { color: "#ff6666", weight: 1, fillOpacity: 0.1, dashArray: "4,4" },
        ),
      );

      // ── Nuclear sites ─────────────────────────────────────────────────
      NUCLEAR_SITES.forEach((m) => {
        const circle = Lc.circleMarker([m.lat, m.lon] as L.LatLngExpression, {
          radius: 9,
          fillColor: "#b2ff59",
          color: "#b2ff59",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.55,
        });
        circle.bindTooltip(m.label, { className: "wm-tooltip", direction: "top" });
        groups["nuclear"]?.addLayer(circle);
      });

      // ── Flash alerts (DIV icons with CSS pulse ring) ──────────────────
      FLASH_ALERTS.forEach((m) => {
        const icon = Lc.divIcon({
          className: "",
          html: `<div class="flash-alert-dot" style="width:14px;height:14px;border-radius:50%;background:#ff6b00;opacity:0.9;"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const mk = Lc.marker([m.lat, m.lon] as L.LatLngExpression, { icon });
        mk.bindTooltip(m.label, { className: "wm-tooltip", direction: "top" });
        groups["flashAlerts"]?.addLayer(mk);
      });

      // ── Military bases ────────────────────────────────────────────────
      MILITARY_BASES.forEach((m) => {
        const circle = Lc.circleMarker([m.lat, m.lon] as L.LatLngExpression, {
          radius: 6,
          fillColor: "#4fc3f7",
          color: "#4fc3f7",
          weight: 1,
          opacity: 0.85,
          fillOpacity: 0.5,
        });
        circle.bindTooltip(m.label, { className: "wm-tooltip", direction: "top" });
        groups["bases"]?.addLayer(circle);
      });

      // ── Intel hotspots ────────────────────────────────────────────────
      INTEL_HOTSPOTS.forEach((m) => {
        const circle = Lc.circleMarker([m.lat, m.lon] as L.LatLngExpression, {
          radius: 5,
          fillColor: "#ff8c00",
          color: "#ff8c00",
          weight: 1,
          opacity: 0.85,
          fillOpacity: 0.5,
        });
        circle.bindTooltip(m.label, { className: "wm-tooltip", direction: "top" });
        groups["hotspots"]?.addLayer(circle);
      });

      // ── Military asset markers (divIcon with emoji + label) ───────────
      MILITARY_ASSETS.forEach((a) => {
        const icon = Lc.divIcon({
          className: "",
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
            <div style="font-size:16px;filter:drop-shadow(0 0 4px ${a.color});line-height:1">${a.emoji}</div>
            <div style="font-size:7px;color:${a.color};background:rgba(0,5,0,0.75);padding:1px 3px;border-radius:2px;white-space:nowrap;max-width:80px;overflow:hidden;text-overflow:ellipsis">${a.type.toUpperCase()}</div>
          </div>`,
          iconSize: [80, 30],
          iconAnchor: [40, 15],
        });
        const mk = Lc.marker([a.lat, a.lon] as L.LatLngExpression, { icon });
        mk.bindTooltip(
          `<b>${a.label}</b><br><span style="color:${a.color}">${a.type.toUpperCase()}</span>`,
          { className: "wm-tooltip", direction: "top" },
        );
        groups["assets"]?.addLayer(mk);
      });

      // ── Undersea cables ───────────────────────────────────────────────
      CABLE_ROUTES.forEach((pts) => {
        groups["cables"]?.addLayer(
          Lc.polyline(pts as L.LatLngExpression[], {
            color: "#29b6f6",
            weight: 1,
            opacity: 0.55,
            dashArray: "6,4",
          }),
        );
      });

      // ── Pipelines ─────────────────────────────────────────────────────
      PIPELINES.forEach((pts) => {
        groups["pipelines"]?.addLayer(
          Lc.polyline(pts as L.LatLngExpression[], { color: "#ffa726", weight: 2, opacity: 0.5 }),
        );
      });

      // ── AI Data Centers ───────────────────────────────────────────────
      DATA_CENTERS.forEach(([lat, lon, label]) => {
        const circle = Lc.circleMarker([lat, lon] as L.LatLngExpression, {
          radius: 5,
          fillColor: "#26c6da",
          color: "#26c6da",
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.45,
        });
        circle.bindTooltip(label, { className: "wm-tooltip", direction: "top" });
        groups["datacenters"]?.addLayer(circle);
      });

      // ── HoC entity markers ────────────────────────────────────────────
      SEED_MARKERS.forEach((m) => {
        const color = HOC_COLORS[m.type] ?? "#94a3b8";
        const r = m.type === "threat" || m.type === "anomaly" ? 9 : m.type === "node" ? 7 : 6;
        const circle = Lc.circleMarker([m.lat, m.lng] as L.LatLngExpression, {
          radius: r,
          fillColor: color,
          color,
          weight: m.status === "alert" ? 2 : 1,
          opacity: 0.9,
          fillOpacity: 0.7,
        });
        circle.bindTooltip(`<b>${m.label}</b><br>${m.sublabel ?? ""}`, {
          className: "wm-tooltip",
          direction: "top",
        });
        const gid = getHocLayerId(m.type);
        groups[gid]?.addLayer(circle);
        hocMarkersRef.current[m.id] = circle;
      });

      // ── Add enabled groups to map ─────────────────────────────────────
      for (const ld of MAP_LAYERS) {
        const grp = groups[ld.id];
        if (grp && ld.enabled) {
          grp.addTo(map);
        }
      }

      layerGroupsRef.current = groups;
      leafletRef.current = map;

      // Invalidate size once layout is settled, then watch for resize (same as WorldMonitor)
      setTimeout(() => map.invalidateSize(), 100);
      const ro = new ResizeObserver(() => map.invalidateSize());
      if (mapRef.current) {
        ro.observe(mapRef.current);
      }
    });

    return () => {
      isMounted = false;
      cancelAnimationFrame(rafRef.current);
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
        layerGroupsRef.current = {};
        hocMarkersRef.current = {};
      }
    };
  }, []);

  // ── Canvas missile animation RAF loop ────────────────────────────────────
  const drawMissiles = useCallback(() => {
    const canvas = canvasRef.current;
    const map = leafletRef.current;
    if (!canvas || !map) {
      rafRef.current = requestAnimationFrame(drawMissiles);
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      rafRef.current = requestAnimationFrame(drawMissiles);
      return;
    }

    // Resize canvas to match container
    const wrap = canvas.parentElement;
    if (wrap && (canvas.width !== wrap.clientWidth || canvas.height !== wrap.clientHeight)) {
      canvas.width = wrap.clientWidth;
      canvas.height = wrap.clientHeight;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    STRIKE_ARCS.forEach((arc) => {
      const speed = arc.type === "ballistic" ? 0.0008 : arc.type === "drone" ? 0.0003 : 0.0005;
      arcProgressRef.current[arc.id] = ((arcProgressRef.current[arc.id] ?? 0) + speed) % 1;
      const t = arcProgressRef.current[arc.id];

      // Convert geo to pixel
      const p0 = map.latLngToContainerPoint([arc.fromLat, arc.fromLon]);
      const p2 = map.latLngToContainerPoint([arc.toLat, arc.toLon]);
      const bulge = arc.type === "ballistic" ? 0.55 : 0.3;
      const [midLat, midLon] = [
        (arc.fromLat + arc.toLat) / 2 + Math.abs(arc.toLat - arc.fromLat) * bulge,
        (arc.fromLon + arc.toLon) / 2,
      ];
      const p1 = map.latLngToContainerPoint([midLat, midLon]);

      // Draw arc trail (quadratic bezier)
      const trailSteps = 40;
      ctx.beginPath();
      for (let i = 0; i <= trailSteps; i++) {
        const s = (i / trailSteps) * t;
        const x = (1 - s) * (1 - s) * p0.x + 2 * (1 - s) * s * p1.x + s * s * p2.x;
        const y = (1 - s) * (1 - s) * p0.y + 2 * (1 - s) * s * p1.y + s * s * p2.y;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.strokeStyle = arc.color + "99";
      ctx.lineWidth = arc.type === "ballistic" ? 1.5 : 1;
      ctx.setLineDash(arc.type === "drone" ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw missile head
      const hx = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const hy = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      ctx.beginPath();
      ctx.arc(hx, hy, arc.type === "ballistic" ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = arc.color;
      ctx.shadowColor = arc.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Impact flash when head near target
      if (t > 0.92) {
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, (t - 0.92) * 180, 0, Math.PI * 2);
        ctx.strokeStyle = arc.color + "55";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    rafRef.current = requestAnimationFrame(drawMissiles);
  }, []);

  useEffect(() => {
    // Start animation loop after leaflet initialized (small delay)
    const delay = setTimeout(() => {
      rafRef.current = requestAnimationFrame(drawMissiles);
    }, 800);
    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(rafRef.current);
    };
  }, [drawMissiles]);

  // ── Sync layer visibility ─────────────────────────────────────────────────
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) {
      return;
    }
    for (const ld of layers) {
      const grp = layerGroupsRef.current[ld.id];
      if (!grp) {
        continue;
      }
      if (ld.enabled) {
        if (!map.hasLayer(grp)) {
          grp.addTo(map);
        }
      } else {
        if (map.hasLayer(grp)) {
          grp.removeFrom(map);
        }
      }
    }
  }, [layers]);

  // ── Sync live RPC markers ─────────────────────────────────────────────────
  useEffect(() => {
    const map = leafletRef.current;
    if (!map || rawMarkers === SEED_MARKERS) {
      return;
    } // skip if using seed
    import("leaflet").then((LModule) => {
      const Lc =
        (LModule as { default?: typeof import("leaflet") }).default ||
        (LModule as typeof import("leaflet"));
      const seen = new Set<string>();
      rawMarkers.forEach((m) => {
        seen.add(m.id);
        if (!hocMarkersRef.current[m.id]) {
          const color = HOC_COLORS[m.type] ?? "#94a3b8";
          const r = m.type === "threat" || m.type === "anomaly" ? 9 : 6;
          const circle = Lc.circleMarker([m.lat, m.lng] as L.LatLngExpression, {
            radius: r,
            fillColor: color,
            color,
            weight: 1,
            opacity: 0.9,
            fillOpacity: 0.7,
          });
          circle.bindTooltip(`<b>${m.label}</b>`, { className: "wm-tooltip", direction: "top" });
          const grp = layerGroupsRef.current[getHocLayerId(m.type)];
          if (grp) {
            grp.addLayer(circle);
          } else {
            circle.addTo(map);
          }
          hocMarkersRef.current[m.id] = circle;
        }
      });
      // Remove stale
      Object.keys(hocMarkersRef.current).forEach((id) => {
        if (!seen.has(id)) {
          const mk = hocMarkersRef.current[id];
          map.removeLayer(mk);
          delete hocMarkersRef.current[id];
        }
      });
    });
  }, [rawMarkers]);


  const toggleLayer = (id: string) =>
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));

  const sendCommand = (cmd: string) => {
    if (!cmd.trim()) {
      return;
    }
    const t = new Date().toTimeString().slice(0, 8);
    setLogs((prev) => [
      { id: `cmd-${Date.now()}`, time: t, type: "info", msg: `> ${cmd}` },
      ...prev.slice(0, MAX_LOG - 1),
    ]);
    rpc("republic.citizen.command.send", {
      citizenId: selected?.id ?? "broadcast",
      instruction: cmd,
    }).catch(() => {});
    setCmdInput("");
  };

  const logColor = (t: IntelLog["type"]) =>
    t === "alert" ? "#ff6060" : t === "warn" ? "#fbbf24" : t === "success" ? "#4ade80" : "#38bdf8";

  const online = rawMarkers.filter((m) => m.status === "active").length;
  const threats = rawMarkers.filter((m) => m.type === "threat" || m.type === "anomaly").length;
  const agents = rawMarkers.filter((m) => m.type === "agent").length;
  const risk = Math.min(
    99,
    threats * 20 + rawMarkers.filter((m) => m.status === "alert").length * 10,
  );
  const riskColor = risk >= 70 ? "#ff4444" : risk >= 40 ? "#ff8c00" : "#7dbd7d";

  return (
    <div className="tm4-root">
      {/* ── Injected CSS: defines all tm4-* layout/size classes that have no stylesheet ── */}
      <style>{`
        .tm4-root {
          display: flex; flex-direction: column;
          width: 100%; height: 100vh;
          background: #050905; color: #aab8aa;
          font-family: 'JetBrains Mono', monospace, sans-serif;
          font-size: 11px; overflow: hidden;
        }
        .tm4-topbar {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 12px; background: #030703;
          border-bottom: 1px solid #1a2a1a; flex-shrink: 0;
        }
        .tm4-main {
          display: flex; flex: 1; min-height: 0;
          overflow: hidden;
        }
        .tm4-layer-panel {
          width: 140px; background: #050d05cc;
          border-right: 1px solid #1a2a1a; padding: 8px;
          overflow-y: auto; flex-shrink: 0; font-size: 9px;
        }
        .tm4-map-wrap {
          flex: 1; position: relative; overflow: hidden;
          background: #0a1a0a; min-width: 0;
        }
        .tm4-map-div {
          position: absolute; inset: 0; width: 100%; height: 100%;
          z-index: 1;
        }
        .tm4-right-panel {
          width: 240px; background: #050d05;
          border-left: 1px solid #1a2a1a; display: flex;
          flex-direction: column; overflow: hidden; flex-shrink: 0;
        }
        .tm4-panel-hdr {
          display: flex; align-items: center;
          padding: 5px 10px; font-size: 8px; color: #6a8a6a;
          border-bottom: 1px solid #1a2a1a; text-transform: uppercase;
          letter-spacing: 1px; background: #030703; flex-shrink: 0;
        }
        .tm4-node-row {
          display: flex; align-items: center; gap: 5px; padding: 3px 10px;
          cursor: pointer; border-bottom: 1px solid #0a1a0a;
        }
        .tm4-node-row:hover { background: #0a1a0a; }
        .tm4-node-row.sel { background: #0d1e0d; }
        .tm4-log-row {
          display: flex; gap: 6px; padding: 2px 10px;
          border-bottom: 1px solid #060e06; align-items: flex-start;
        }
        .tm4-zoom-stack {
          position: absolute; right: 8px; top: 8px; z-index: 1000;
          display: flex; flex-direction: column; gap: 2px;
        }
        .tm4-zoom-btn {
          width: 26px; height: 26px; border-radius: 4px;
          background: rgba(5,9,5,0.85); border: 1px solid #1a2a1a;
          color: #7dbd7d; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
          font-size: 11px;
        }
        .tm4-zoom-btn:hover { background: #0d1e0d; }
        .tm4-posture-ring {
          width: 72px; height: 72px; border-radius: 50%;
          border: 2px solid; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .tm4-layer-btn {
          display: flex; align-items: center; gap: 5px; width: 100%;
          background: none; border: none; cursor: pointer; padding: 3px 0;
          text-align: left; font-size: 9px; font-family: inherit; color: #4a6a4a;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .tm4-layer-btn.on { color: #c8d8c8; }
        .tm4-ticker-wrap { overflow: hidden; flex: 1; }
        .tm4-ticker { white-space: nowrap; animation: tm4-scroll 30s linear infinite; }
        @keyframes tm4-scroll { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        @keyframes tm4-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
        .wm-tooltip { background: #050905 !important; border: 1px solid #1e3a1e !important; color: #8ba888 !important; font-size: 10px !important; }
      `}</style>

      {/* Top bar */}
      <div className="tm4-topbar">
        <span style={{ color: "#7dbd7d", fontWeight: 700, fontSize: 12 }}>◈ TACTICAL</span>
        <span style={{ color: "#4a6a4a" }}>|</span>
        <span>OPERATIONS CENTER</span>
        {[
          { label: "ONLINE", value: online, color: "#34d399" },
          { label: "THREATS", value: threats, color: "#f87171" },
          { label: "AGENTS", value: agents, color: "#38bdf8" },
          { label: "TICK", value: tick.toString().padStart(6, "0"), color: "#64748b" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              borderLeft: "1px solid #1a2a1a",
              paddingLeft: 10,
            }}
          >
            <span style={{ fontSize: 8, color: "#4a6a4a", letterSpacing: "0.12em" }}>
              {s.label}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.value}</span>
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 9, color: "#4a8a4a" }}>
            {now.toUTCString().slice(0, 25)} UTC
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.2)",
              borderRadius: 14,
              padding: "2px 8px",
            }}
          >
            <Wifi size={10} style={{ color: "#34d399" }} />
            <span style={{ fontSize: 9, color: "#34d399", letterSpacing: "0.12em" }}>
              UPLINK ACTIVE
            </span>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            style={{
              background: "rgba(56,189,248,0.08)",
              border: "1px solid rgba(56,189,248,0.2)",
              borderRadius: 5,
              padding: "3px 9px",
              cursor: "pointer",
              color: "#38bdf8",
              fontSize: 9,
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "inherit",
            }}
          >
            <RefreshCw size={9} /> REFRESH
          </button>
        </div>
      </div>

      {/* Main body */}
      <div className="tm4-main">
        {/* Layer panel */}
        <div className="tm4-layer-panel">
          <div
            style={{
              fontSize: 8,
              color: "#6a8a6a",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            LAYERS
          </div>
          {layers.map((l) => (
            <button
              type="button"
              key={l.id}
              className={`tm4-layer-btn ${l.enabled ? "on" : ""}`}
              onClick={() => toggleLayer(l.id)}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  border: `1px solid ${l.color}`,
                  background: l.enabled ? l.color : "transparent",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: l.enabled ? "#c8d8c8" : "#4a6a4a" }}>{l.label}</span>
            </button>
          ))}
          <div style={{ marginTop: 8, borderTop: "1px solid #1a2a1a", paddingTop: 6 }}>
            <div style={{ fontSize: 8, color: "#4a6a4a", marginBottom: 4 }}>LEGEND</div>
            {[
              ["#ff4444", "Critical"],
              ["#ff8c00", "High"],
              ["#fbbf24", "Medium"],
              ["#4fc3f7", "Monitoring"],
              ["#34d399", "Active"],
              ["#b2ff59", "Nuclear"],
            ].map(([c, l]) => (
              <div
                key={l}
                style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}
              >
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: c }} />
                <span style={{ fontSize: 8, color: "#6a8a6a" }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Map area */}
        <div className="tm4-map-wrap">
          <div ref={mapRef} className="tm4-map-div" />
          {/* Canvas overlay for missile animations — pointer-events:none so map stays interactive */}
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 500,
              pointerEvents: "none",
              width: "100%",
              height: "100%",
            }}
          />
          <div className="tm4-zoom-stack">
            <button
              type="button"
              className="tm4-zoom-btn"
              onClick={() => leafletRef.current?.zoomIn()}
              title="Zoom in"
            >
              <ZoomIn size={12} />
            </button>
            <button
              type="button"
              className="tm4-zoom-btn"
              onClick={() => leafletRef.current?.setView([20, 15], 2.5)}
              title="Reset view"
            >
              <RotateCcw size={11} />
            </button>
            <button
              type="button"
              className="tm4-zoom-btn"
              onClick={() => leafletRef.current?.zoomOut()}
              title="Zoom out"
            >
              <ZoomOut size={12} />
            </button>
            <button
              type="button"
              className="tm4-zoom-btn"
              onClick={() => setSidebarOpen((v) => !v)}
              title="Toggle panel"
              style={{ color: sidebarOpen ? "#38bdf8" : "#7dbd7d" }}
            >
              ▶
            </button>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 8,
              zIndex: 1000,
              fontSize: 8,
              color: "#1a3a1a",
              letterSpacing: "0.1em",
              pointerEvents: "none",
            }}
          >
            {rawMarkers.length} HoC ENTITIES · {CONFLICT_MARKERS.length} CONFLICTS ·{" "}
            {NUCLEAR_SITES.length} NUCLEAR SITES · CLASSIF: TS//AI-ACCESS
          </div>

          {/* Selected popup */}
          {selected && (
            <div
              style={{
                position: "absolute",
                bottom: 28,
                left: 16,
                zIndex: 1001,
                background: "rgba(0,10,4,0.93)",
                border: `1px solid ${HOC_COLORS[selected.type] ?? "#38bdf8"}40`,
                borderRadius: 7,
                backdropFilter: "blur(10px)",
                padding: "10px 12px",
                minWidth: 240,
                maxWidth: 340,
                animation: "tm4-fade 0.22s ease-out",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 7,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <StatusDot status={selected.status} />
                  <span
                    style={{
                      color: HOC_COLORS[selected.type] ?? "#38bdf8",
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    {selected.label}
                  </span>
                  <ThreatTag level={selected.threatLevel} />
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#4a6a4a",
                    fontSize: 13,
                  }}
                >
                  ✕
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "2px 12px",
                  marginBottom: 6,
                }}
              >
                {[
                  ["TYPE", selected.type.toUpperCase()],
                  ["STATUS", (selected.status ?? "—").toUpperCase()],
                  ["LAT", selected.lat.toFixed(4) + "°"],
                  ["LNG", selected.lng.toFixed(4) + "°"],
                  ["SIGNAL", selected.signal != null ? `${selected.signal}%` : "—"],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 5 }}>
                    <span style={{ fontSize: 8, color: "#4a6a4a", minWidth: 40 }}>{k}</span>
                    <span style={{ fontSize: 9, color: "#94a3b8" }}>{v}</span>
                  </div>
                ))}
              </div>
              {selected.sublabel && (
                <div
                  style={{
                    fontSize: 9,
                    color: "#64748b",
                    borderTop: "1px solid #1a2a1a",
                    paddingTop: 5,
                  }}
                >
                  {selected.sublabel}
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center" }}>
                <SignalBars signal={selected.signal} />
                <span style={{ fontSize: 8, color: "#4a6a4a" }}>[{selected.id.toUpperCase()}]</span>
              </div>
            </div>
          )}
        </div>

        {/* Right panel */}
        {sidebarOpen && (
          <div className="tm4-right-panel">
            {/* AI Posture */}
            <div className="tm4-panel-hdr">
              AI Strategic Posture{" "}
              <span style={{ marginLeft: "auto", fontSize: 8, color: "#aadd44" }}>● LIVE</span>
            </div>
            <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid #1a2a1a" }}>
              <div style={{ textAlign: "center", marginBottom: 6, fontSize: 8, color: "#6a8a6a" }}>
                THREAT ASSESSMENT
              </div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <div className="tm4-posture-ring" style={{ borderColor: riskColor }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: riskColor, lineHeight: 1 }}>
                    {risk}
                  </div>
                  <div style={{ fontSize: 8, color: riskColor, marginTop: 2 }}>
                    {risk >= 70 ? "CRIT" : risk >= 40 ? "ELEVATED" : "NOMINAL"}
                  </div>
                </div>
              </div>
              {[
                ["Active Threats", Math.min(100, threats * 20), "#ff4444"],
                [
                  "Agents Online",
                  Math.round((online / Math.max(rawMarkers.length, 1)) * 100),
                  "#38bdf8",
                ],
                ["Comms Active", 78, "#34d399"],
                ["Intel Quality", 64, "#fbbf24"],
              ].map(([lbl, val, col]) => (
                <div
                  key={String(lbl)}
                  style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}
                >
                  <span style={{ fontSize: 8, width: 80, color: "#aab8aa", flexShrink: 0 }}>
                    {lbl}
                  </span>
                  <div style={{ flex: 1, height: 3, background: "#1a2a1a", borderRadius: 2 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Number(val)}%`,
                        background: String(col),
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <span
                    style={{ fontSize: 8, color: String(col), minWidth: 20, textAlign: "right" }}
                  >
                    {Number(val)}
                  </span>
                </div>
              ))}
            </div>

            {/* Intel stream */}
            <div className="tm4-panel-hdr">Intel Stream</div>
            <div style={{ overflowY: "auto", maxHeight: 180, flex: "none" }}>
              {rawMarkers.map((m) => (
                <div
                  key={m.id}
                  className={`tm4-node-row ${selected?.id === m.id ? "sel" : ""}`}
                  onClick={() => {
                    setSelected((p) => (p?.id === m.id ? null : m));
                    leafletRef.current?.setView([m.lat, m.lng], 5);
                  }}
                >
                  <StatusDot status={m.status} />
                  <span
                    style={{
                      flex: 1,
                      fontSize: 9,
                      color: "#94a3b8",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.label}
                  </span>
                  <SignalBars signal={m.signal} />
                  <ThreatTag level={m.threatLevel} />
                </div>
              ))}
            </div>

            {/* Event log — FIXED height so it never pushes the map */}
            <div className="tm4-panel-hdr">
              Event Log{" "}
              <span style={{ marginLeft: "auto", fontSize: 8, color: "#4a6a4a" }}>
                {logs.length}/{MAX_LOG}
              </span>
            </div>
            <div style={{ height: 180, overflowY: "auto", flexShrink: 0 }}>
              {logs.slice(0, MAX_LOG).map((l) => (
                <div key={l.id} className="tm4-log-row">
                  <span style={{ fontSize: 8, color: "#2a4a2a", flexShrink: 0 }}>{l.time}</span>
                  <span style={{ color: logColor(l.type), flexShrink: 0, fontSize: 9 }}>■</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: "#64748b",
                      lineHeight: 1.4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 195,
                    }}
                  >
                    {l.msg}
                  </span>
                </div>
              ))}
            </div>

            {/* Command console */}
            <div style={{ borderTop: "1px solid #1a2a1a", padding: "7px 10px", flexShrink: 0 }}>
              <div
                style={{ fontSize: 8, color: "#2a4a2a", letterSpacing: "0.1em", marginBottom: 4 }}
              >
                COMMAND {selected && <span style={{ color: "#38bdf8" }}>→ {selected.label}</span>}
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ color: "#38bdf8", fontSize: 10 }}>›</span>
                <input
                  value={cmdInput}
                  onChange={(e) => setCmdInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendCommand(cmdInput)}
                  placeholder="issue order..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#94a3b8",
                    fontSize: 10,
                    fontFamily: "inherit",
                  }}
                />
                <button
                  type="button"
                  onClick={() => sendCommand(cmdInput)}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: cmdInput.trim() ? "#38bdf8" : "#2a4a2a",
                  }}
                >
                  <Send size={11} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* News ticker */}
      <div
        style={{
          background: "#050905",
          borderTop: "1px solid #1a2a1a",
          padding: "3px 12px",
          display: "flex",
          gap: 8,
          overflow: "hidden",
          fontSize: 9,
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#ff4444", flexShrink: 0, fontWeight: 700 }}>● LIVE</span>
        <div className="tm4-ticker-wrap">
          <span className="tm4-ticker">
            {logs
              .slice(0, 8)
              .map((l) => `${l.time}  ${l.msg}`)
              .join("  ·  ")}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid #1a2a1a",
          padding: "3px 14px",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 8,
          color: "#2a4a2a",
          flexShrink: 0,
        }}
      >
        <span>◈ TACTICAL COMMAND MAP · HoC REPUBLIC · CLASSIF: TS//AI-ACCESS</span>
        <span>{now.toUTCString().slice(0, 25)} UTC</span>
      </div>
    </div>
  );
}
