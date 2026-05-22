import type L from "leaflet";
import React from "react";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { rpc } from "@/lib/rpc";

// ─── Types ────────────────────────────────────────────────────────────────────
interface NewsItem {
  id: string;
  headline: string;
  source: string;
  region: string;
  ts: number;
  hot?: boolean;
}
interface CryptoItem {
  symbol: string;
  name: string;
  price: number;
  change: number;
}
interface MarketItem {
  symbol: string;
  price: number;
  change: number;
}
interface FireRow {
  region: string;
  fires: number;
  high: number;
  fwi: number;
}

// ─── Static seed data (updates via useEffect intervals) ──────────────────────
const SEED_NEWS: NewsItem[] = [
  {
    id: "n1",
    headline: "Iran launches drone swarm toward Israeli targets in latest escalation",
    source: "AP",
    region: "Middle East",
    ts: Date.now() - 180000,
    hot: true,
  },
  {
    id: "n2",
    headline: "US Military deploys additional carrier groups to Persian Gulf",
    source: "Reuters",
    region: "US",
    ts: Date.now() - 420000,
    hot: true,
  },
  {
    id: "n3",
    headline: "NATO activates Article 4 consultations over Baltic incidents",
    source: "BBC",
    region: "Europe",
    ts: Date.now() - 900000,
  },
  {
    id: "n4",
    headline: "China conducts largest military exercises near Taiwan in three years",
    source: "FT",
    region: "Asia-Pacific",
    ts: Date.now() - 1800000,
  },
  {
    id: "n5",
    headline: "Sudan conflict displaces additional 2.1M civilians this month",
    source: "UNHCR",
    region: "Africa",
    ts: Date.now() - 2700000,
  },
  {
    id: "n6",
    headline: "Federal Reserve holds rates amid inflation data uncertainty",
    source: "Bloomberg",
    region: "US",
    ts: Date.now() - 3600000,
  },
  {
    id: "n7",
    headline: "Russia strikes Ukrainian power infrastructure across 4 regions",
    source: "Reuters",
    region: "Europe",
    ts: Date.now() - 4500000,
  },
  {
    id: "n8",
    headline: "Saudi Arabia cuts oil output by additional 500k barrels per day",
    source: "OPEC",
    region: "Middle East",
    ts: Date.now() - 5400000,
  },
];

const SEED_CRYPTO: CryptoItem[] = [
  { symbol: "BTC", name: "Bitcoin", price: 66819, change: 1.82 },
  { symbol: "ETH", name: "Ethereum", price: 3908, change: 0.94 },
  { symbol: "SOL", name: "Solana", price: 84.57, change: 3.96 },
];

const SEED_MARKETS: MarketItem[] = [
  { symbol: "AAPL", price: 204.18, change: -1.22 },
  { symbol: "MSFT", price: 392.74, change: -1.36 },
  { symbol: "NVDA", price: 177.19, change: -4.1 },
];

const SEED_FIRES: FireRow[] = [
  { region: "Iran", fires: 439, high: 76, fwi: 4.8 },
  { region: "Saudi Arabia", fires: 335, high: 61, fwi: 3.5 },
  { region: "Russia", fires: 49, high: 6, fwi: 2.39 },
  { region: "Ukraine", fires: 26, high: 0, fwi: 1.33 },
  { region: "Turkey", fires: 19, high: 3, fwi: 0.75 },
];

const MAP_LAYERS = [
  { id: "iranAttacks", label: "Iran Attacks", color: "#ff4444", enabled: true },
  { id: "hotspots", label: "Intel Hotspots", color: "#ff8c00", enabled: true },
  { id: "conflicts", label: "Conflict Zones", color: "#ff6b6b", enabled: true },
  { id: "bases", label: "Military Bases", color: "#4fc3f7", enabled: true },
  { id: "nuclear", label: "Nuclear Sites", color: "#b2ff59", enabled: true },
  { id: "gamma", label: "Gamma Irradiators", color: "#e040fb", enabled: false },
  { id: "spaceports", label: "Spaceports", color: "#80cbc4", enabled: false },
  { id: "cables", label: "Undersea Cables", color: "#29b6f6", enabled: false },
  { id: "pipelines", label: "Pipelines", color: "#ffa726", enabled: false },
  { id: "datacenters", label: "AI Data Centers", color: "#26c6da", enabled: false },
];

// Map marker data
const MAP_MARKERS = [
  { lat: 32.0, lon: 34.8, type: "conflict", label: "Israel/Gaza", severity: "critical" },
  { lat: 33.5, lon: 36.2, type: "conflict", label: "Syria", severity: "high" },
  { lat: 24.7, lon: 46.7, type: "base", label: "Saudi Arabia", severity: "monitor" },
  { lat: 35.7, lon: 51.4, type: "nuclear", label: "Tehran", severity: "high" },
  { lat: 30.0, lon: 31.2, type: "monitor", label: "Egypt", severity: "monitor" },
  { lat: 15.6, lon: 32.5, type: "conflict", label: "Sudan", severity: "critical" },
  { lat: 51.5, lon: 31.0, type: "conflict", label: "Ukraine", severity: "critical" },
  { lat: 25.3, lon: 51.5, type: "base", label: "Qatar", severity: "monitor" },
  { lat: 23.6, lon: 58.6, type: "monitor", label: "Oman", severity: "monitor" },
  { lat: 12.8, lon: 45.0, type: "conflict", label: "Yemen", severity: "high" },
  { lat: 39.9, lon: 32.9, type: "base", label: "Turkey", severity: "monitor" },
  { lat: 3.9, lon: 11.5, type: "monitor", label: "Cameroon", severity: "monitor" },
  { lat: 55.8, lon: 37.6, type: "nuclear", label: "Moscow", severity: "high" },
  { lat: 28.6, lon: 77.2, type: "base", label: "India", severity: "monitor" },
  { lat: 23.1, lon: 113.3, type: "base", label: "China", severity: "high" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60000) {
    return `${Math.round(d / 1000)}s`;
  }
  if (d < 3600000) {
    return `${Math.round(d / 60000)}m`;
  }
  return `${Math.round(d / 3600000)}h`;
}
function pct(v: number, pos = true): string {
  return `${pos && v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function WmPanel({
  title,
  count,
  live,
  children,
}: {
  title: string;
  count?: number;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#0d1117",
        border: "1px solid #1e2a1e",
        borderRadius: 4,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          background: "#0a0f0a",
          borderBottom: "1px solid #1e2a1e",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "#8ba888",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          {title}
        </span>
        {count !== undefined && (
          <span
            style={{
              fontSize: 9,
              background: "#1e3a1e",
              color: "#7dbd7d",
              borderRadius: 10,
              padding: "1px 5px",
            }}
          >
            {count} NEW
          </span>
        )}
        {live && (
          <span
            style={{
              fontSize: 9,
              background: "#1e2a0a",
              color: "#aadd44",
              borderRadius: 10,
              padding: "1px 5px",
            }}
          >
            ● LIVE
          </span>
        )}
      </div>
      <div style={{ padding: 8, fontSize: 11, color: "#aab8aa" }}>{children}</div>
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div style={{ borderBottom: "1px solid #1a2a1a", padding: "5px 0", cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
        {item.hot && (
          <span
            style={{
              fontSize: 8,
              background: "#3a1010",
              color: "#ff6b6b",
              borderRadius: 3,
              padding: "1px 4px",
            }}
          >
            HOT
          </span>
        )}
        <span style={{ fontSize: 9, color: "#6a8a6a" }}>{item.source}</span>
        <span style={{ fontSize: 9, color: "#4a6a4a", marginLeft: "auto" }}>{ago(item.ts)}</span>
      </div>
      <p style={{ margin: 0, lineHeight: 1.4, color: "#c8d8c8", fontSize: 11 }}>{item.headline}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
// Layer group refs: one Leaflet LayerGroup per layer ID
type LayerGroupMap = Record<string, L.LayerGroup>;

export function WorldMonitorPage() {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const layerGroupsRef = useRef<LayerGroupMap>({});
  const [layers, setLayers] = useState(MAP_LAYERS);
  const [timeRange, setTimeRange] = useState("7d");
  const [news, setNews] = useState<NewsItem[]>(SEED_NEWS);
  const [crypto, setCrypto] = useState<CryptoItem[]>(SEED_CRYPTO);
  const [markets] = useState<MarketItem[]>(SEED_MARKETS);

  // Fetch real news from world-intel backend
  useEffect(() => {
    rpc<{ news?: Array<Record<string, unknown>> }>("republic.worldintel.news", { limit: 20 })
      .then((r) => {
        if (r?.news && r.news.length > 0) {
          setNews(
            r.news.map((n, i) => ({
              id: (n.id as string) ?? `n${i}`,
              headline: (n.headline as string) ?? (n.title as string) ?? "—",
              source: (n.source as string) ?? "Intel",
              region: (n.region as string) ?? (n.country as string) ?? "Global",
              ts: (n.ts as number) ?? (n.timestamp as number) ?? Date.now(),
              hot: (n.severity as string) === "critical" || (n.severity as string) === "high",
            })),
          );
        }
      })
      .catch(() => {}); // keep seed data on failure
  }, []);
  const [time, setTime] = useState(new Date());
  const [riskScore] = useState(56);

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Simulate crypto price drift
  useEffect(() => {
    const t = setInterval(() => {
      setCrypto((prev) =>
        prev.map((c) => ({ ...c, price: c.price * (1 + (Math.random() - 0.5) * 0.001) })),
      );
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // Leaflet map init — build one LayerGroup per defined layer
  useEffect(() => {
    let isMounted = true;
    if (!mapRef.current || leafletRef.current) {
      return;
    }
    let map: L.Map;
    import("leaflet").then((LModule) => {
      if (!isMounted || leafletRef.current) {return;}

      const L = LModule.default || LModule;
      map = L.map(mapRef.current!, {
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

      // Dark tile layer
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
        subdomains: "abcd",
        crossOrigin: true,
      }).addTo(map);

      // ── Create one LayerGroup per layer ID ──────────────────────
      const groups: LayerGroupMap = {};
      for (const layerDef of MAP_LAYERS) {
        groups[layerDef.id] = L.layerGroup();
      }

      // Helper: get the group id for a marker type
      const typeToGroupId = (type: string): string => {
        if (type === "conflict") {return "conflicts";}
        if (type === "base") {return "bases";}
        if (type === "nuclear") {return "nuclear";}
        return "hotspots"; // monitor → hotspots
      };

      // Populate groups from MAP_MARKERS
      MAP_MARKERS.forEach((m) => {
        const color =
          m.severity === "critical" ? "#ff4444" : m.severity === "high" ? "#ff8c00" : "#4fc3f7";
        const r = m.type === "nuclear" ? 8 : m.type === "base" ? 6 : 7;
        const circle = L.circleMarker([m.lat, m.lon], {
          radius: r,
          fillColor: color,
          color,
          weight: 1,
          opacity: 0.9,
          fillOpacity: 0.6,
        });
        circle.bindTooltip(m.label, { className: "wm-tooltip", direction: "top" });
        const gid = typeToGroupId(m.type);
        groups[gid]?.addLayer(circle);
      });

      // Iran Attacks group — special markers near Iran theater
      const iranAttacks: [number, number, string][] = [
        [32.0, 34.8, "Israel/Gaza Strike"],
        [33.5, 36.2, "Syria Strike"],
        [15.6, 43.5, "Yemen Strike"],
        [36.0, 60.0, "NE Iran"],
      ];
      iranAttacks.forEach(([lat, lon, label]) => {
        const m = L.circleMarker([lat, lon], {
          radius: 7,
          fillColor: "#ff4444",
          color: "#ff4444",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.5,
        });
        m.bindTooltip(label, { direction: "top" });
        groups["iranAttacks"]?.addLayer(m);
      });

      // Conflict zones (rectangles) — added to conflicts group
      groups["conflicts"]?.addLayer(
        L.rectangle(
          [
            [4, 25],
            [18, 38],
          ],
          { color: "#ff4444", weight: 1, fillOpacity: 0.15, dashArray: "4,4" },
        ),
      );
      groups["conflicts"]?.addLayer(
        L.rectangle(
          [
            [46, 28],
            [52, 40],
          ],
          { color: "#ff6666", weight: 1, fillOpacity: 0.1, dashArray: "4,4" },
        ),
      );

      // Nuclear sites group — additional sites
      const nuclearSites: [number, number, string][] = [
        [29.6, 52.5, "Bushehr Reactor"],
        [31.7, 35.2, "Dimona"],
        [39.0, 125.7, "Yongbyon"],
        [34.1, 73.6, "Kahuta"],
      ];
      nuclearSites.forEach(([lat, lon, label]) => {
        const m = L.circleMarker([lat, lon], {
          radius: 8,
          fillColor: "#b2ff59",
          color: "#b2ff59",
          weight: 2,
          opacity: 1,
          fillOpacity: 0.5,
        });
        m.bindTooltip(label, { direction: "top" });
        groups["nuclear"]?.addLayer(m);
      });

      // AI Data Centers group
      const dataCenters: [number, number, string][] = [
        [37.4, -122.1, "Silicon Valley"],
        [47.6, -122.3, "Seattle"],
        [51.5, -0.1, "London"],
        [50.1, 8.7, "Frankfurt"],
        [35.7, 139.7, "Tokyo"],
        [23.1, 113.3, "Guangzhou"],
      ];
      dataCenters.forEach(([lat, lon, label]) => {
        const m = L.circleMarker([lat, lon], {
          radius: 5,
          fillColor: "#26c6da",
          color: "#26c6da",
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.45,
        });
        m.bindTooltip(label, { direction: "top" });
        groups["datacenters"]?.addLayer(m);
      });

      // Undersea cables (polylines)
      const cableRoutes: [number, number][][] = [
        [
          [51.5, -0.1],
          [37.4, -122.1],
        ], // Trans-Atlantic
        [
          [35.7, 139.7],
          [37.4, -122.1],
        ], // Trans-Pacific
        [
          [1.3, 103.8],
          [23.1, 113.3],
        ], // Intra-Asia
        [
          [1.3, 103.8],
          [51.5, -0.1],
        ], // Europe-Asia
      ];
      cableRoutes.forEach((pts) => {
        groups["cables"]?.addLayer(
          L.polyline(pts as L.LatLngExpression[], {
            color: "#29b6f6",
            weight: 1,
            opacity: 0.6,
            dashArray: "6,4",
          }),
        );
      });

      // Pipelines
      const pipelines: [number, number][][] = [
        [
          [36.0, 59.6],
          [41.0, 49.0],
          [41.0, 29.0],
          [41.9, 12.5],
        ], // Central Asia → Europe
        [
          [27.5, 49.0],
          [36.8, 34.6],
          [41.9, 12.5],
        ], // Gulf → Turkey → Italy
        [
          [30.0, 31.2],
          [36.8, 10.2],
        ], // Eastern Mediterranean
      ];
      pipelines.forEach((pts) => {
        groups["pipelines"]?.addLayer(
          L.polyline(pts as L.LatLngExpression[], { color: "#ffa726", weight: 2, opacity: 0.5 }),
        );
      });

      // Military bases (subset of bases group already populated above)
      // Intel hotspots — additional watchlist points
      const hotspots: [number, number, string][] = [
        [13.5, 30.2, "Sudan Conflict"],
        [9.0, 7.5, "Nigeria"],
        [12.8, 45.1, "Somalia"],
        [0.3, 32.6, "Uganda"],
      ];
      hotspots.forEach(([lat, lon, label]) => {
        const m = L.circleMarker([lat, lon], {
          radius: 5,
          fillColor: "#ff8c00",
          color: "#ff8c00",
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0.5,
        });
        m.bindTooltip(label, { direction: "top" });
        groups["hotspots"]?.addLayer(m);
      });

      // ── Add groups to map based on initial enabled state ─────────
      for (const layerDef of MAP_LAYERS) {
        const grp = groups[layerDef.id];
        if (!grp) {continue;}
        if (layerDef.enabled) {
          grp.addTo(map);
        }
      }

      layerGroupsRef.current = groups;
      leafletRef.current = map;

      // Make map responsive to container size changes
      const observer = new ResizeObserver(() => map.invalidateSize());
      if (mapRef.current) {observer.observe(mapRef.current);}
    });

    return () => {
      isMounted = false;
      if (leafletRef.current) {
        leafletRef.current.remove();
        leafletRef.current = null;
        layerGroupsRef.current = {};
      }
    };
  }, []);

  // Sync Leaflet layer visibility whenever the layers state changes
  useEffect(() => {
    const map = leafletRef.current;
    if (!map) {return;}
    for (const layerDef of layers) {
      const grp = layerGroupsRef.current[layerDef.id];
      if (!grp) {continue;}
      if (layerDef.enabled) {
        if (!map.hasLayer(grp)) {grp.addTo(map);}
      } else {
        if (map.hasLayer(grp)) {grp.removeFrom(map);}
      }
    }
  }, [layers]);

  const toggleLayer = (id: string) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)));
  };

  const styles = {
    page: {
      background: "#080d08",
      minHeight: "100vh",
      fontFamily: "'JetBrains Mono',monospace,sans-serif",
      color: "#aab8aa",
    } as React.CSSProperties,
    topBar: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 12px",
      background: "#050905",
      borderBottom: "1px solid #1a2a1a",
      fontSize: 11,
    } as React.CSSProperties,
    mapSection: { position: "relative" as const, height: 380, display: "flex" },
    layerPanel: {
      width: 160,
      background: "#050d05cc",
      backdropFilter: "blur(4px)",
      border: "1px solid #1e3a1e",
      borderRadius: 4,
      margin: 8,
      padding: 8,
      zIndex: 10,
      overflowY: "auto" as const,
      flexShrink: 0,
    } as React.CSSProperties,
    ticker: {
      background: "#050905",
      borderTop: "1px solid #1a2a1a",
      padding: "4px 12px",
      display: "flex",
      gap: 12,
      overflowX: "hidden" as const,
      whiteSpace: "nowrap" as const,
      fontSize: 10,
    } as React.CSSProperties,
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: 6,
      padding: 8,
    } as React.CSSProperties,
    grid3: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 6,
      padding: "0 8px 6px",
    } as React.CSSProperties,
    grid6: {
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 6,
      padding: "0 8px 6px",
    } as React.CSSProperties,
  };

  const timeFilters = ["1h", "6h", "24h", "48h", "7d", "ALL"];

  return (
    <div style={styles.page}>
      {/* Top Bar */}
      <div style={styles.topBar}>
        <span style={{ color: "#7dbd7d", fontWeight: 700, fontSize: 12 }}>🌍 WORLD</span>
        <span style={{ color: "#4a6a4a" }}>|</span>
        <span style={{ color: "#aab8aa" }}>MONITOR</span>
        <span style={{ color: "#4a6a4a", fontSize: 9 }}>v2.3.39</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span
            style={{
              color: "#ff6b6b",
              fontSize: 9,
              background: "#2a0a0a",
              padding: "2px 6px",
              borderRadius: 3,
            }}
          >
            ● DEFCON 4
          </span>
          <span style={{ color: "#4a8a4a", fontSize: 10 }}>
            {time.toUTCString().slice(0, 25)} UTC
          </span>
          <a
            href="https://worldmonitor.app"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#7dbd7d",
              fontSize: 9,
              border: "1px solid #2a4a2a",
              padding: "2px 8px",
              borderRadius: 3,
              textDecoration: "none",
            }}
          >
            Open Full App ↗
          </a>
        </div>
      </div>

      {/* Map Section */}
      <div style={styles.mapSection}>
        {/* Layer Panel */}
        <div style={styles.layerPanel}>
          <div
            style={{
              fontSize: 9,
              color: "#6a8a6a",
              marginBottom: 6,
              textTransform: "uppercase",
              letterSpacing: 1,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>LAYERS</span>
            <span>?</span>
          </div>
          {layers.map((l) => (
            <label
              key={l.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                cursor: "pointer",
                marginBottom: 4,
                fontSize: 10,
              }}
            >
              <div
                onClick={() => toggleLayer(l.id)}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  border: `1px solid ${l.color}`,
                  background: l.enabled ? l.color : "transparent",
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: l.enabled ? "#c8d8c8" : "#4a6a4a",
                  textTransform: "uppercase",
                  fontSize: 9,
                  letterSpacing: 0.5,
                }}
              >
                {l.label}
              </span>
            </label>
          ))}
          <div style={{ marginTop: 8, borderTop: "1px solid #1a2a1a", paddingTop: 6 }}>
            <div style={{ fontSize: 8, color: "#4a6a4a", marginBottom: 4 }}>LEGEND</div>
            {[
              ["#ff4444", "High Alert"],
              ["#ff8c00", "Elevated"],
              ["#4fc3f7", "Monitoring"],
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

        {/* Map Wrapper */}
        <div style={{ flex: 1, height: "100%", position: "relative", background: "#1a2535" }}>
          {/* Actual empty div for Leaflet to control */}
          <div
            ref={mapRef}
            style={{ width: "100%", height: "100%", position: "absolute", inset: 0, zIndex: 1 }}
          />

          {/* Time filters overlay */}
          <div
            style={{ position: "absolute", top: 8, left: 8, zIndex: 1000, display: "flex", gap: 2 }}
          >
            {timeFilters.map((t) => (
              <button
type="button"                 key={t}
                onClick={() => setTimeRange(t)}
                style={{
                  background: timeRange === t ? "#2a4a2a" : "#05090580",
                  border: `1px solid ${timeRange === t ? "#4a8a4a" : "#1a2a1a"}`,
                  color: timeRange === t ? "#7dbd7d" : "#6a8a6a",
                  fontSize: 9,
                  padding: "2px 6px",
                  borderRadius: 3,
                  cursor: "pointer",
                  pointerEvents: "auto",
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {/* Zoom buttons */}
          <div
            style={{
              position: "absolute",
              right: 8,
              top: 8,
              zIndex: 1000,
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {["+", "-"].map((b) => (
              <button
type="button"                 key={b}
                onClick={() =>
                  b === "+" ? leafletRef.current?.zoomIn() : leafletRef.current?.zoomOut()
                }
                style={{
                  background: "#0a0f0a90",
                  border: "1px solid #1a2a1a",
                  color: "#7dbd7d",
                  width: 24,
                  height: 24,
                  borderRadius: 3,
                  cursor: "pointer",
                  fontSize: 14,
                  pointerEvents: "auto",
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Right side panels */}
        <div
          style={{
            width: 280,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: 8,
            flexShrink: 0,
          }}
        >
          <WmPanel title="AI Strategic Posture" live>
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: "#6a8a6a", marginBottom: 4 }}>IRAN THEATER</div>
              <div style={{ fontSize: 10, color: "#ff8c00" }}>CRIT</div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", margin: "8px 0" }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: "50%",
                  border: "3px solid #ff8c00",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: "#ff8c00" }}>{riskScore}</div>
                <div style={{ fontSize: 8, color: "#ff8c00" }}>ELEVATED</div>
              </div>
            </div>
            <div style={{ fontSize: 9, color: "#6a8a6a", textAlign: "center" }}>
              Strategic Risk Overview
            </div>
          </WmPanel>
          <WmPanel title="AI Insights" live>
            <p style={{ margin: 0, fontSize: 10, lineHeight: 1.5, color: "#aab8aa" }}>
              Iran's Supreme Leader Khamenei killed in Saturday airstrikes. Iran's supreme leader
              Ali Khamenei was killed in Saturday airstrikes, according to Iranian International.
              The death of Iran's top leader represents a major geopolitical shift...
            </p>
            <div style={{ marginTop: 6, borderTop: "1px solid #1a2a1a", paddingTop: 4 }}>
              <div style={{ fontSize: 9, color: "#6a8a6a", marginBottom: 3 }}>
                COUNTRY INSTABILITY
              </div>
              {[
                ["Iran", 71, "#ff4444"],
                ["Lebanon", 60, "#ff8c00"],
              ].map(([c, v, col]) => (
                <div
                  key={c as string}
                  style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}
                >
                  <span style={{ fontSize: 9, width: 50, color: "#aab8aa" }}>{c as string}</span>
                  <div style={{ flex: 1, height: 3, background: "#1a2a1a", borderRadius: 2 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${v}%`,
                        background: col as string,
                        borderRadius: 2,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 9, color: col as string }}>{v}</span>
                </div>
              ))}
            </div>
          </WmPanel>
        </div>
      </div>

      {/* News Ticker */}
      <div style={styles.ticker}>
        <span style={{ color: "#ff4444", flexShrink: 0 }}>● LIVE</span>
        <span style={{ animation: "none", color: "#aab8aa" }}>
          {news
            .slice(0, 4)
            .map((n) => `${n.source.toUpperCase()}: ${n.headline}  ·  `)
            .join("")}
        </span>
      </div>

      {/* Dashboard: Row 1 - 4 cols */}
      <div style={styles.grid}>
        <WmPanel title="Live News" count={6} live>
          {news.slice(0, 4).map((n) => (
            <NewsCard key={n.id} item={n} />
          ))}
        </WmPanel>
        <WmPanel title="Intel Feed" count={6}>
          {[
            {
              source: "WARI-TV",
              label: "Military Activity",
              txt: "US and Israel at War with Iran [Simulated]",
              t: Date.now() - 1200000,
            },
            {
              source: "AL ARABIYA",
              label: "Cyber Threats",
              txt: "Pakistan bombs targets in Afghan...",
              t: Date.now() - 1800000,
            },
          ].map((i, idx) => (
            <div key={idx} style={{ borderBottom: "1px solid #1a2a1a", padding: "4px 0" }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 2 }}>
                <span
                  style={{
                    fontSize: 8,
                    background: "#1a2a0a",
                    color: "#aadd44",
                    borderRadius: 2,
                    padding: "1px 3px",
                  }}
                >
                  {i.label}
                </span>
                <span style={{ fontSize: 8, color: "#4a6a4a", marginLeft: "auto" }}>
                  {ago(i.t)}
                </span>
              </div>
              <div style={{ fontSize: 9, color: "#6a8a6a", marginBottom: 1 }}>{i.source}</div>
              <p style={{ margin: 0, fontSize: 10, color: "#c8d8c8", lineHeight: 1.4 }}>{i.txt}</p>
            </div>
          ))}
        </WmPanel>
        <WmPanel title="World News" count={3} live>
          {[
            {
              src: "AP NEWS",
              headline: "Iran's supreme leader has been killed during major attack, Trump says",
              t: Date.now() - 600000,
            },
            {
              src: "CNN",
              headline: "Congress to vote on Trump's war powers in aftermath of Iran strikes",
              t: Date.now() - 1500000,
            },
          ].map((n, i) => (
            <div key={i} style={{ borderBottom: "1px solid #1a2a1a", padding: "4px 0" }}>
              <span style={{ fontSize: 8, color: "#6a8a6a" }}>
                {n.src} · {ago(n.t)}
              </span>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#c8d8c8", lineHeight: 1.4 }}>
                {n.headline}
              </p>
            </div>
          ))}
        </WmPanel>
        <WmPanel title="United States" count={3} live>
          {[
            "Congress to vote on Trump's war powers in aftermath of Iran strikes — CNN",
            "Iran's Ayatollah Khamenei is killed in Israeli strike, ending 36-year rule",
            "Trump signs emergency defense authorization EO",
          ].map((h, i) => (
            <div
              key={i}
              style={{
                borderBottom: "1px solid #1a2a1a",
                padding: "4px 0",
                fontSize: 10,
                color: "#c8d8c8",
                lineHeight: 1.4,
              }}
            >
              {h}
            </div>
          ))}
        </WmPanel>
      </div>

      {/* Row 2 - 6 cols regional */}
      <div style={styles.grid6}>
        {[
          {
            title: "EUROPE",
            items: [
              "West turns even more obvious situation with attack on Ukraine — tass.com",
              "What will war on Iran mean for Israel?",
            ],
          },
          {
            title: "MIDDLE EAST",
            items: [
              "Guardian: US-Israel war on Iran: Donald Trump says Iran's supreme leader is dead",
              "Australia: cabinet's national security committee to meet as US and Israel strike Iran",
            ],
          },
          {
            title: "AFRICA",
            items: [
              "Maryland Bats Explode in 21–9 Series-Clinching Rout of Wagner — Maryland Athletics",
              "Dustbin of history — Son of Iran's late shah reacts to Khamenei's 'death'",
            ],
          },
          {
            title: "LATIN AMERICA",
            items: [
              "La Jolla Fata: Uribe inicia el cierre de campaña de Paloma Valencia",
              "La previa de las consultas presidenciales de marzo",
            ],
          },
          {
            title: "ASIA-PACIFIC",
            items: [
              "Guardian Australia news live: cabinet's national security committee to meet as US and Israel strike Iran",
              "Things to do in Nice, France: Where to eat, shop and wander around the beach",
            ],
          },
          {
            title: "GOVERNMENT",
            items: [
              "State Dept: Worldwide Caution — Travel (.gov)",
              "AI Kid of India: urges young people to embrace technology",
            ],
          },
        ].map(({ title, items }) => (
          <WmPanel key={title} title={title} count={(title.length % 15) + 3}>
            {items.map((h, i) => (
              <div
                key={i}
                style={{
                  borderBottom: "1px solid #1a2a1a",
                  padding: "3px 0",
                  fontSize: 10,
                  color: "#c8d8c8",
                  lineHeight: 1.4,
                }}
              >
                {h}
              </div>
            ))}
          </WmPanel>
        ))}
      </div>

      {/* Row 3 - Markets + Crypto + Fires + Heatmap */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 6,
          padding: "0 8px 6px",
        }}
      >
        <WmPanel title="Markets">
          {markets.map((m) => (
            <div
              key={m.symbol}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "3px 0",
                borderBottom: "1px solid #1a2a1a",
              }}
            >
              <span style={{ fontSize: 10, color: "#aab8aa", fontWeight: 600 }}>{m.symbol}</span>
              <span style={{ fontSize: 10, color: "#c8d8c8" }}>${m.price.toFixed(2)}</span>
              <span style={{ fontSize: 9, color: m.change > 0 ? "#7dbd7d" : "#ff6b6b" }}>
                {pct(m.change)}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 4, fontSize: 9, color: "#4a6a4a" }}>Fed Funds Rate: stable</div>
        </WmPanel>

        <WmPanel title="Crypto">
          {crypto.map((c) => (
            <div
              key={c.symbol}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "3px 0",
                borderBottom: "1px solid #1a2a1a",
              }}
            >
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: "#c8d8c8" }}>{c.symbol}</div>
                <div style={{ fontSize: 8, color: "#6a8a6a" }}>{c.name}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#c8d8c8" }}>
                  ${c.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div style={{ fontSize: 9, color: c.change > 0 ? "#7dbd7d" : "#ff6b6b" }}>
                  {pct(c.change)}
                </div>
              </div>
            </div>
          ))}
        </WmPanel>

        <WmPanel title="Fires">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["REGION", "FIRES", "HIGH", "FWI"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontSize: 8,
                      color: "#6a8a6a",
                      textAlign: h === "REGION" ? "left" : "right",
                      paddingBottom: 3,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SEED_FIRES.map((f) => (
                <tr key={f.region}>
                  <td style={{ fontSize: 9, color: "#aab8aa" }}>{f.region}</td>
                  <td style={{ fontSize: 9, color: "#ff8c00", textAlign: "right" }}>{f.fires}</td>
                  <td style={{ fontSize: 9, color: "#ff6b6b", textAlign: "right" }}>{f.high}</td>
                  <td style={{ fontSize: 9, color: "#4fc3f7", textAlign: "right" }}>{f.fwi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WmPanel>

        <WmPanel title="Sector Heatmap">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {[
              ["Tech", "-1.60%", "#ff6b6b"],
              ["Finance", "-2.94%", "#ff6b6b"],
              ["Energy", "+1.38%", "#7dbd7d"],
              ["Health", "+3.99%", "#7dbd7d"],
              ["Consumer", "-0.14%", "#ff6b6b"],
              ["Industrial", "+0.25%", "#7dbd7d"],
              ["Staples", "+1.22%", "#7dbd7d"],
              ["Utilities", "+1.17%", "#7dbd7d"],
              ["Materials", "+0.75%", "#7dbd7d"],
              ["Real Est.", "-0.14%", "#ff6b6b"],
            ].map(([sec, val, col]) => (
              <div
                key={sec}
                style={{
                  background: col === "#7dbd7d" ? "#0a1a0a" : "#1a0a0a",
                  borderRadius: 3,
                  padding: "3px 5px",
                }}
              >
                <div style={{ fontSize: 8, color: "#6a8a6a" }}>{sec}</div>
                <div style={{ fontSize: 9, color: col, fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>
        </WmPanel>
      </div>

      {/* Row 4 - more panels */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr",
          gap: 6,
          padding: "0 8px 8px",
        }}
      >
        <WmPanel title="Supply Chain">
          <div style={{ fontSize: 9, color: "#6a8a6a", marginBottom: 4 }}>
            Checkpoints · Shipping · Minerals
          </div>
          {[
            {
              name: "Strait of Hormuz",
              status: "98/100",
              color: "#ff8c00",
              detail: "AIS congestion detected",
            },
            { name: "Suez Canal", status: "0/186", color: "#7dbd7d", detail: "6 warnings(c)" },
          ].map((s) => (
            <div key={s.name} style={{ borderBottom: "1px solid #1a2a1a", padding: "4px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9, color: "#aab8aa" }}>{s.name}</span>
                <span style={{ fontSize: 8, color: s.color }}>{s.status}</span>
              </div>
              <div style={{ fontSize: 8, color: "#4a6a4a" }}>{s.detail}</div>
            </div>
          ))}
        </WmPanel>

        <WmPanel title="Economic Indicators">
          <div style={{ fontSize: 9, color: "#aab8aa", marginBottom: 4 }}>
            Fed Total Assets: 661,458
          </div>
          <div style={{ fontSize: 9, color: "#7dbd7d", marginBottom: 4 }}>+480,258 ↑</div>
          <div style={{ fontSize: 8, color: "#6a8a6a" }}>Fed Funds Rate: 5.25–5.50%</div>
          <div style={{ marginTop: 6, borderTop: "1px solid #1a2a1a", paddingTop: 4 }}>
            <div style={{ fontSize: 8, color: "#6a8a6a" }}>Trade Policy</div>
            <div style={{ fontSize: 9, color: "#aab8aa", marginTop: 3 }}>
              India war targets: High
            </div>
            <div style={{ fontSize: 9, color: "#aab8aa" }}>Average tariff rate: 18.2%</div>
          </div>
        </WmPanel>

        <WmPanel title="UNHCR Displacement">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
            {[
              ["30.5M", "Refugees"],
              ["8.4M", "Asylum"],
              ["63.9M", "IDP"],
              ["107.2M", "Total"],
            ].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#ff8c00" }}>{v}</div>
                <div style={{ fontSize: 8, color: "#6a8a6a" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 8, color: "#6a8a6a" }}>
            {[
              ["Ukraine", "+0.3°C", "-2.5mm", "MODERATE"],
              ["South Asia", "+0.2°C", "-0.8mm", "MODERATE"],
              ["California", "", "", ""],
            ].map(([r, t, p, s], i) => (
              <div key={i} style={{ padding: "2px 0", color: "#aab8aa" }}>
                {r} {t} {p}{" "}
                <span style={{ color: s === "MODERATE" ? "#ff8c00" : "#aab8aa" }}>{s}</span>
              </div>
            ))}
          </div>
        </WmPanel>

        <WmPanel title="Security Advisories">
          <div style={{ display: "flex", justifyContent: "space-around", marginBottom: 8 }}>
            {[
              ["2", "DO NOT TRAVEL", "#ff4444"],
              ["3", "RECONSIDER", "#ff8c00"],
              ["6", "EXERCISE CAUTION", "#ffd700"],
            ].map(([n, l, c]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c as string }}>{n}</div>
                <div style={{ fontSize: 7, color: c as string, maxWidth: 50, lineHeight: 1.2 }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{ fontSize: 8, color: "#4a6a4a", borderTop: "1px solid #1a2a1a", paddingTop: 4 }}
          >
            No active sirens — all clear
          </div>
        </WmPanel>

        <WmPanel title="AI/ML" count={1} live>
          {[
            { src: "AI NEWS", txt: "Our agreement with the Department of War — OpenAI" },
            {
              src: "AI NEWS",
              txt: "What Trump's Anthropic AI blacklist means for the Pentagon and U.S. companies — Axios",
            },
          ].map((n, i) => (
            <div key={i} style={{ borderBottom: "1px solid #1a2a1a", padding: "3px 0" }}>
              <span style={{ fontSize: 8, color: "#6a8a6a" }}>{n.src}</span>
              <p style={{ margin: "2px 0 0", fontSize: 10, color: "#c8d8c8", lineHeight: 1.4 }}>
                {n.txt}
              </p>
            </div>
          ))}
        </WmPanel>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid #1a2a1a",
          padding: "4px 12px",
          display: "flex",
          justifyContent: "space-between",
          fontSize: 9,
          color: "#4a6a4a",
        }}
      >
        <span>● WORLD MONITOR · AI-Powered Global Intelligence Dashboard</span>
        <a
          href="https://github.com/koala73/worldmonitor"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#6a8a6a" }}
        >
          GitHub ↗
        </a>
      </div>

      <style>{`
        .wm-tooltip { background:#0d1117 !important; border:1px solid #2a4a2a !important; color:#7dbd7d !important; font-size:10px !important; }
        .wm-tooltip::before { display:none !important; }
      `}</style>
    </div>
  );
}
