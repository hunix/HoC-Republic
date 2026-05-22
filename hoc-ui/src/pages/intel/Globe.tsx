import { Globe as GlobeIcon, RefreshCw, Layers, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
/**
 * Globe.tsx — Full 3D Interactive WebGL Globe
 *
 * Uses globe.gl (Three.js-powered) for:
 * - Real CartoDB dark map tiles on the globe surface
 * - All military/intel markers synced with TacticalMap
 * - Animated missile arcs (cruise / ballistic / drone)
 * - Full mouse + touch controls: rotate, zoom, pinch, scroll
 * - Street-level zoom capability via tile resolution
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useRpc } from "@/lib/rpc";

// ─── Shared data (mirrors TacticalMap) ────────────────────────────────────────

const CONFLICT_POINTS = [
  { lat: 32.0, lng: 34.8, label: "🔴 Israel/Gaza", color: "#ff4444", ring: true },
  { lat: 33.5, lng: 36.2, label: "🔴 Syria", color: "#ff4444", ring: false },
  { lat: 15.6, lng: 32.5, label: "🔴 Sudan", color: "#ff4444", ring: true },
  { lat: 51.5, lng: 31.0, label: "🔴 Ukraine", color: "#ff4444", ring: true },
  { lat: 12.8, lng: 45.0, label: "🟠 Yemen", color: "#ff8c00", ring: false },
  { lat: 13.5, lng: 2.1, label: "🟠 Sahel", color: "#ff8c00", ring: false },
  { lat: 23.1, lng: 121.2, label: "🟡 Taiwan Strait", color: "#fbbf24", ring: false },
  { lat: 48.0, lng: 37.8, label: "🔴 Donbas", color: "#ff4444", ring: true },
];

const NUCLEAR_POINTS = [
  { lat: 29.6, lng: 52.5, label: "☢ Bushehr (IR)", color: "#b2ff59" },
  { lat: 33.7, lng: 51.4, label: "☢ Fordow (IR)", color: "#b2ff59" },
  { lat: 32.0, lng: 34.8, label: "☢ Dimona (IL)", color: "#b2ff59" },
  { lat: 39.0, lng: 125.7, label: "☢ Yongbyon (NK)", color: "#b2ff59" },
  { lat: 34.1, lng: 73.6, label: "☢ Kahuta (PK)", color: "#b2ff59" },
];

const MILITARY_ASSETS = [
  { lat: 36.5, lng: 25.0, label: "⛵ USS Gerald Ford", color: "#4fc3f7", size: 1.2 },
  { lat: 13.5, lng: 52.0, label: "⛵ HMS Queen Elizabeth", color: "#4fc3f7", size: 1.2 },
  { lat: 25.0, lng: 60.5, label: "🚢 USS Arleigh Burke", color: "#38bdf8", size: 0.8 },
  { lat: 23.0, lng: 120.0, label: "🚢 PLA Type 055", color: "#ef4444", size: 0.8 },
  { lat: 32.5, lng: 35.5, label: "✈ IDF F-35I", color: "#4ade80", size: 0.7 },
  { lat: 25.5, lng: 51.0, label: "✈ USAF F-22", color: "#4fc3f7", size: 0.7 },
  { lat: 23.5, lng: 118.0, label: "✈ PLA J-20", color: "#ef4444", size: 0.7 },
  { lat: 44.0, lng: 42.0, label: "🚀 S-400 Battery", color: "#ef4444", size: 0.9 },
  { lat: 31.5, lng: 34.5, label: "🔱 Iron Dome", color: "#4ade80", size: 0.9 },
  { lat: 35.5, lng: 51.0, label: "🚀 Shaheen IRBM", color: "#ff6b00", size: 0.9 },
];

const HOC_POINTS = [
  { lat: 40.7, lng: -74.0, label: "Node α — Gateway", color: "#06b6d4" },
  { lat: 51.5, lng: -0.1, label: "Node β — London", color: "#06b6d4" },
  { lat: 35.7, lng: 139.7, label: "Aria-7", color: "#38bdf8" },
  { lat: 1.3, lng: 103.8, label: "Nova-12", color: "#38bdf8" },
  { lat: 48.9, lng: 2.3, label: "⚠ Anomaly — Paris", color: "#f87171" },
  { lat: 55.7, lng: 37.6, label: "⚠ Hostile — Moscow", color: "#f87171" },
  { lat: -33.9, lng: 151.2, label: "Comm Relay Sydney", color: "#34d399" },
  { lat: 28.6, lng: 77.2, label: "Node γ — Delhi", color: "#06b6d4" },
];

const MISSILE_ARCS = [
  {
    startLat: 29.5,
    startLng: 52.0,
    endLat: 32.0,
    endLng: 34.8,
    color: "#ff2222",
    label: "Cruise → IL",
  },
  {
    startLat: 39.0,
    startLng: 125.7,
    endLat: 35.7,
    endLng: 139.7,
    color: "#ff8c00",
    label: "DPRK Ballistic → JP",
  },
  {
    startLat: 15.2,
    startLng: 44.2,
    endLat: 24.7,
    endLng: 46.7,
    color: "#fbbf24",
    label: "Houthi Drone → SA",
  },
  {
    startLat: 55.5,
    startLng: 37.0,
    endLat: 50.4,
    endLng: 30.5,
    color: "#ff2222",
    label: "Kalibr → Kyiv",
  },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const STYLE_ID = "globe3d-styles";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .globe3d-root {
      position: relative; width: 100%; height: 100vh;
      background: #000913; overflow: hidden; display: flex; flex-direction: column;
      font-family: 'JetBrains Mono', 'Courier New', monospace;
    }
    .globe3d-topbar {
      position: absolute; top: 0; left: 0; right: 0; z-index: 100;
      display: flex; align-items: center; gap: 10px;
      padding: 8px 16px; background: rgba(0,8,20,0.82);
      border-bottom: 1px solid rgba(56,189,248,0.12); backdrop-filter: blur(8px);
      font-size: 11px; color: #94a3b8;
    }
    .globe3d-container { flex: 1; width: 100%; }
    .globe3d-tooltip {
      position: absolute; z-index: 200; pointer-events: none;
      background: rgba(0,8,20,0.92); border: 1px solid rgba(56,189,248,0.3);
      border-radius: 6px; padding: 7px 11px; font-size: 11px; color: #e2e8f0;
      backdrop-filter: blur(8px); transition: opacity 0.15s;
      white-space: nowrap; max-width: 240px;
    }
    .globe3d-panel {
      position: absolute; right: 12px; top: 56px; z-index: 100;
      background: rgba(0,8,20,0.88); border: 1px solid rgba(56,189,248,0.15);
      border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 5px;
      backdrop-filter: blur(8px);
    }
    .globe3d-btn {
      width: 32px; height: 32px; border-radius: 6px; cursor: pointer;
      background: rgba(56,189,248,0.07); border: 1px solid rgba(56,189,248,0.18);
      color: #38bdf8; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .globe3d-btn:hover { background: rgba(56,189,248,0.18); border-color: #38bdf8; }
    .globe3d-legend {
      position: absolute; left: 12px; bottom: 16px; z-index: 100;
      background: rgba(0,8,20,0.88); border: 1px solid rgba(56,189,248,0.15);
      border-radius: 8px; padding: 10px 14px; font-size: 10px; color: #64748b;
      backdrop-filter: blur(8px);
    }
    .globe3d-stat {
      position: absolute; left: 12px; top: 56px; z-index: 100;
      background: rgba(0,8,20,0.88); border: 1px solid rgba(56,189,248,0.15);
      border-radius: 8px; padding: 10px 14px; font-size: 10px; color: #94a3b8;
      backdrop-filter: blur(8px); display: flex; flex-direction: column; gap: 5px;
    }
    .globe3d-live { animation: gbeat 2s ease-in-out infinite; }
    @keyframes gbeat { 0%,100%{opacity:1} 50%{opacity:0.4} }
  `;
  document.head.appendChild(el);
}

// ─── Globe Instance type ─────────────────────────────────────────────────────
// Defined at module scope so globeRef can be typed correctly across all useEffects.
type GlobeInstance = {
  width: (n: number) => GlobeInstance;
  height: (n: number) => GlobeInstance;
  backgroundColor: (c: string) => GlobeInstance;
  globeTileEngineUrl: (fn: (x: number, y: number, z: number) => string) => GlobeInstance;
  pointsData: (d: unknown[]) => GlobeInstance;
  pointLat: (fn: (d: unknown) => number) => GlobeInstance;
  pointLng: (fn: (d: unknown) => number) => GlobeInstance;
  pointColor: (fn: (d: unknown) => string) => GlobeInstance;
  pointAltitude: (fn: (d: unknown) => number) => GlobeInstance;
  pointRadius: (fn: (d: unknown) => number) => GlobeInstance;
  pointLabel: (fn: (d: unknown) => string) => GlobeInstance;
  pointResolution: (n: number) => GlobeInstance;
  arcsData: (d: unknown[]) => GlobeInstance;
  arcStartLat: (fn: (d: unknown) => number) => GlobeInstance;
  arcStartLng: (fn: (d: unknown) => number) => GlobeInstance;
  arcEndLat: (fn: (d: unknown) => number) => GlobeInstance;
  arcEndLng: (fn: (d: unknown) => number) => GlobeInstance;
  arcColor: (fn: (d: unknown) => string) => GlobeInstance;
  arcAltitude: (v: number | ((d: unknown) => number)) => GlobeInstance;
  arcStroke: (v: number | ((d: unknown) => number)) => GlobeInstance;
  arcDashLength: (n: number) => GlobeInstance;
  arcDashGap: (n: number) => GlobeInstance;
  arcDashAnimateTime: (n: number) => GlobeInstance;
  ringsData: (d: unknown[]) => GlobeInstance;
  ringLat: (fn: (d: unknown) => number) => GlobeInstance;
  ringLng: (fn: (d: unknown) => number) => GlobeInstance;
  ringColor: (fn: (d: unknown) => string) => GlobeInstance;
  ringMaxRadius: (n: number) => GlobeInstance;
  ringPropagationSpeed: (n: number) => GlobeInstance;
  ringRepeatPeriod: (n: number) => GlobeInstance;
  atmosphereColor: (c: string) => GlobeInstance;
  atmosphereAltitude: (n: number) => GlobeInstance;
  onPointHover: (fn: (d: unknown, ev: MouseEvent) => void) => GlobeInstance;
  pointOfView: (pov: { lat: number; lng: number; altitude: number }, ms: number) => GlobeInstance;
  scene: () => { remove: (o: unknown) => void };
  controls: () => {
    autoRotate: boolean;
    autoRotateSpeed: number;
    enableZoom: boolean;
    dollyIn?: (n: number) => void;
    dollyOut?: (n: number) => void;
  };
};

// ─── Globe component ──────────────────────────────────────────────────────────

interface TooltipState {
  x: number;
  y: number;
  label: string;
  visible: boolean;
}

export function GlobePage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({ x: 0, y: 0, label: "", visible: false });
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<"dark" | "satellite" | "topo">("dark");
  const [tick, setTick] = useState(0);

  const { data: intelData } = useRpc<{
    events?: { lat: number; lng: number; label: string; type: string }[];
  }>("republic.intelligence.events", {});

  useEffect(() => {
    injectStyles();
  }, []);

  // tick for live arc animation progress
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 50);
    return () => clearInterval(id);
  }, []);

  const getTileUrl = useCallback((l: typeof layer) => {
    if (l === "satellite") {
      return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    }
    if (l === "topo") {
      return "https://tile.opentopomap.org/{z}/{x}/{y}.png";
    }
    return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  }, []);

  // Build all points
  const allPoints = [
    ...CONFLICT_POINTS.map((p) => ({ ...p, group: "conflict", size: 0.6 })),
    ...NUCLEAR_POINTS.map((p) => ({ ...p, group: "nuclear", size: 0.5 })),
    ...MILITARY_ASSETS.map((p) => ({ ...p, group: "asset", ring: false })),
    ...HOC_POINTS.map((p) => ({ ...p, group: "hoc", size: 0.5, ring: false })),
    ...(intelData?.events
      ?.filter((e) => e?.lat && e?.lng)
      .map((e) => ({
        lat: e.lat,
        lng: e.lng,
        label: e.label ?? "Event",
        color: "#fbbf24",
        group: "live",
        size: 0.5,
        ring: false,
      })) ?? []),
  ];

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    let mounted = true;

    // Dynamically import globe.gl
    import("globe.gl")
      .then((mod) => {
        if (!mounted || !containerRef.current) {
          return;
        }
        const Globe = (mod as { default: unknown }).default as new (
          el: HTMLElement,
        ) => GlobeInstance;

        // Use actual rendered size — read after layout tick to avoid 0×0
        const container = containerRef.current!;
        const w = container.offsetWidth || window.innerWidth;
        const h = container.offsetHeight || window.innerHeight - 100;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const globe = new Globe(container)
          .width(w)
          .height(h)
          .backgroundColor("rgba(0,0,0,0)")
          .atmosphereColor("#1a6bde")
          .atmosphereAltitude(0.18);

        // Resize observer — keeps globe canvas in sync with container
        const ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            globe.width(entry.contentRect.width).height(entry.contentRect.height);
          }
        });
        ro.observe(container);

        // Set tile URL for map layer
        const tileUrl = getTileUrl(layer);
        globe.globeTileEngineUrl(
          layer === "dark"
            ? (x: number, y: number, z: number) =>
                `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
            : (x: number, y: number, z: number) => {
                if (layer === "satellite") {
                  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
                }
                return `https://tile.opentopomap.org/${z}/${x}/${y}.png`;
              },
        );
        void tileUrl; // used above

        // Points
        globe
          .pointsData(allPoints)
          .pointLat((d: unknown) => (d as (typeof allPoints)[0]).lat)
          .pointLng((d: unknown) => (d as (typeof allPoints)[0]).lng)
          .pointColor((d: unknown) => (d as (typeof allPoints)[0]).color)
          .pointAltitude((d: unknown) => {
            const pt = d as (typeof allPoints)[0];
            return pt.group === "conflict" ? 0.02 : 0.01;
          })
          .pointRadius((d: unknown) => (d as { size?: number }).size ?? 0.5)
          .pointLabel((d: unknown) => (d as (typeof allPoints)[0]).label)
          .pointResolution(12);

        // Missile arcs
        globe
          .arcsData(MISSILE_ARCS)
          .arcStartLat((d: unknown) => (d as (typeof MISSILE_ARCS)[0]).startLat)
          .arcStartLng((d: unknown) => (d as (typeof MISSILE_ARCS)[0]).startLng)
          .arcEndLat((d: unknown) => (d as (typeof MISSILE_ARCS)[0]).endLat)
          .arcEndLng((d: unknown) => (d as (typeof MISSILE_ARCS)[0]).endLng)
          .arcColor((d: unknown) => (d as (typeof MISSILE_ARCS)[0]).color)
          .arcAltitude(0.35)
          .arcStroke(0.5)
          .arcDashLength(0.3)
          .arcDashGap(0.15)
          .arcDashAnimateTime(2000);

        // Pulse rings for active conflict zones
        const rings = CONFLICT_POINTS.filter((p) => p.ring).map((p) => ({
          lat: p.lat,
          lng: p.lng,
          color: p.color,
        }));
        globe
          .ringsData(rings)
          .ringLat((d: unknown) => (d as { lat: number }).lat)
          .ringLng((d: unknown) => (d as { lng: number }).lng)
          .ringColor((d: unknown) => (d as { color: string }).color)
          .ringMaxRadius(3.5)
          .ringPropagationSpeed(1.5)
          .ringRepeatPeriod(800);

        // Auto-rotate
        const controls = globe.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.4;
        controls.enableZoom = true;

        // Hover tooltip
        globe.onPointHover((d: unknown, ev: MouseEvent) => {
          if (d) {
            setTooltip({
              x: ev.clientX + 12,
              y: ev.clientY - 10,
              label: (d as { label?: string }).label ?? "",
              visible: true,
            });
          } else {
            setTooltip((t) => ({ ...t, visible: false }));
          }
        });

        globeRef.current = globe;
        setReady(true);
      })
      .catch(() => {
        /* globe.gl not available */
      });

    return () => {
      mounted = false;
    };
  }, []); // eslint-disable-line

  // Update tile layer
  useEffect(() => {
    if (!globeRef.current) {
      return;
    }
    const g = globeRef.current;
    const tileUrl = getTileUrl(layer);
    void tileUrl; // keep both paths
    g.globeTileEngineUrl(
      layer === "dark"
        ? (x: number, y: number, z: number) =>
            `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`
        : layer === "satellite"
          ? (x: number, y: number, z: number) =>
              `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
          : (x: number, y: number, z: number) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
    );
  }, [layer, getTileUrl]);

  // Stop/resume auto-rotate
  const toggleRotate = useCallback(() => {
    if (!globeRef.current) {
      return;
    }
    const c = globeRef.current.controls();
    c.autoRotate = !c.autoRotate;
  }, []);

  const zoomTo = useCallback((lat: number, lng: number, alt = 1.5) => {
    globeRef.current?.pointOfView({ lat, lng, altitude: alt }, 1000);
  }, []);

  void tick; // tick used to keep component fresh

  return (
    <div className="globe3d-root">
      {/* ── Injected CSS: all globe3d-* classes were undefined, causing 0px globe container ── */}
      <style>{`
        .globe3d-root {
          position: relative; width: 100%; height: 100vh;
          background: #020c1a; overflow: hidden;
          font-family: 'JetBrains Mono', monospace, sans-serif;
        }
        .globe3d-topbar {
          position: absolute; top: 0; left: 0; right: 0; z-index: 20;
          display: flex; align-items: center; gap: 10px;
          padding: 6px 14px; background: rgba(2,12,26,0.92);
          border-bottom: 1px solid rgba(56,189,248,0.15);
          font-size: 10px; color: #4a6a8a; backdrop-filter: blur(4px);
        }
        .globe3d-container {
          position: absolute; inset: 0; width: 100%; height: 100%;
          overflow: hidden;
        }
        .globe3d-panel {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          z-index: 20; display: flex; flex-direction: column; gap: 4px;
          background: rgba(2,12,26,0.85); border: 1px solid rgba(56,189,248,0.15);
          border-radius: 8px; padding: 8px 6px; backdrop-filter: blur(6px);
        }
        .globe3d-btn {
          width: 30px; height: 30px; border-radius: 6px;
          background: rgba(56,189,248,0.06); border: 1px solid rgba(56,189,248,0.15);
          color: #38bdf8; cursor: pointer; display: flex;
          align-items: center; justify-content: center;
        }
        .globe3d-btn:hover { background: rgba(56,189,248,0.15); }
        .globe3d-stat {
          position: absolute; left: 12px; top: 60px; z-index: 20;
          background: rgba(2,12,26,0.85); border: 1px solid rgba(56,189,248,0.12);
          border-radius: 8px; padding: 10px 12px; min-width: 130px;
          backdrop-filter: blur(6px); color: #4a6a8a; font-size: 9px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .globe3d-legend {
          position: absolute; left: 12px; bottom: 20px; z-index: 20;
          background: rgba(2,12,26,0.85); border: 1px solid rgba(56,189,248,0.12);
          border-radius: 8px; padding: 10px 12px;
          backdrop-filter: blur(6px);
        }
        .globe3d-tooltip {
          position: absolute; z-index: 30; pointer-events: none;
          background: rgba(2,12,26,0.95); border: 1px solid rgba(56,189,248,0.3);
          color: #e2e8f0; font-size: 11px; padding: 4px 8px; border-radius: 6px;
          white-space: nowrap; transform: translate(-50%, -130%);
        }
        .globe3d-live { animation: globe3d-blink 1.5s ease-in-out infinite; }
        @keyframes globe3d-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Top bar */}
      <div className="globe3d-topbar">
        <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: 13 }}>◈ GLOBE</span>
        <span style={{ color: "#1a4a6a" }}>|</span>
        <span>3D Intelligence View</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 12 }}>
          {[
            { id: "dark" as const, label: "Dark" },
            { id: "satellite" as const, label: "Satellite" },
            { id: "topo" as const, label: "Terrain" },
          ].map((l) => (
            <button
              type="button"
              key={l.id}
              onClick={() => setLayer(l.id)}
              style={{
                padding: "2px 9px",
                borderRadius: 4,
                fontSize: 9,
                cursor: "pointer",
                background: layer === l.id ? "rgba(56,189,248,0.2)" : "transparent",
                border: `1px solid ${layer === l.id ? "#38bdf8" : "rgba(56,189,248,0.15)"}`,
                color: layer === l.id ? "#38bdf8" : "#64748b",
              }}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span className="globe3d-live" style={{ fontSize: 9, color: "#34d399" }}>
            ● LIVE
          </span>
          <span style={{ fontSize: 9, color: "#4a6a8a" }}>
            {allPoints.length} ENTITIES · {MISSILE_ARCS.length} ARCS
          </span>
          {!ready && <span style={{ fontSize: 9, color: "#fbbf24" }}>Loading 3D engine…</span>}
        </div>
      </div>

      {/* Globe container */}
      <div ref={containerRef} className="globe3d-container" style={{ paddingTop: 42 }} />

      {/* Tooltip */}
      {tooltip.visible && (
        <div className="globe3d-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.label}
        </div>
      )}

      {/* Control panel */}
      <div className="globe3d-panel">
        <button
          type="button"
          className="globe3d-btn"
          title="Zoom in"
          onClick={() => {
            const g = globeRef.current;
            if (g) {
              const c = g.controls();
              c.dollyIn?.(1.25);
            }
          }}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="globe3d-btn"
          title="Zoom out"
          onClick={() => {
            const g = globeRef.current;
            if (g) {
              const c = g.controls();
              c.dollyOut?.(1.25);
            }
          }}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className="globe3d-btn"
          title="Toggle auto-rotate"
          onClick={toggleRotate}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className="globe3d-btn"
          title="Cycle layer"
          onClick={() =>
            setLayer((l) => (l === "dark" ? "satellite" : l === "satellite" ? "topo" : "dark"))
          }
        >
          <Layers size={14} />
        </button>
        <button
          type="button"
          className="globe3d-btn"
          title="Refresh"
          onClick={() => window.location.reload()}
        >
          <RefreshCw size={14} />
        </button>
        <div
          style={{ width: "100%", height: 1, background: "rgba(56,189,248,0.1)", margin: "2px 0" }}
        />
        <GlobeIcon size={14} style={{ color: "#4a6a8a", margin: "0 auto" }} />
      </div>

      {/* Stats panel */}
      <div className="globe3d-stat">
        <div style={{ fontSize: 8, color: "#4a6a8a", letterSpacing: 1, marginBottom: 3 }}>
          QUICK LINKS
        </div>
        {[
          { label: "Ukraine", lat: 50, lng: 31 },
          { label: "Middle East", lat: 31, lng: 36 },
          { label: "Taiwan Strait", lat: 24, lng: 121 },
          { label: "NE Asia", lat: 38, lng: 128 },
        ].map((r) => (
          <button
            type="button"
            key={r.label}
            onClick={() => zoomTo(r.lat, r.lng, 1.2)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#64748b",
              fontSize: 9,
              textAlign: "left",
              padding: "1px 0",
              fontFamily: "inherit",
            }}
          >
            → {r.label}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="globe3d-legend">
        <div style={{ fontSize: 8, color: "#4a6a8a", letterSpacing: 1, marginBottom: 5 }}>
          LEGEND
        </div>
        {[
          ["#ff4444", "Conflict Zone"],
          ["#b2ff59", "Nuclear Site"],
          ["#ffd700", "Military Asset"],
          ["#06b6d4", "HoC Node"],
          ["#38bdf8", "HoC Agent"],
          ["#f87171", "Threat"],
          ["#ff2222", "Missile Arc"],
        ].map(([color, label]) => (
          <div
            key={label}
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}
          >
            <div
              style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }}
            />
            <span style={{ fontSize: 9, color: "#64748b" }}>{label}</span>
          </div>
        ))}
        <div
          style={{
            marginTop: 5,
            fontSize: 8,
            color: "#334155",
            borderTop: "1px solid #0f1a2a",
            paddingTop: 5,
          }}
        >
          Drag to rotate · Scroll to zoom
          <br />
          Pinch on touch devices
        </div>
      </div>
    </div>
  );
}
