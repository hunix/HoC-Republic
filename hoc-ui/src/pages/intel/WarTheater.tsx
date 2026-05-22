import {
  Crosshair,
  MapPin,
  Anchor,
  AlertTriangle,
  Target,
  Eye,
  EyeOff,
  ChevronRight,
  Shield,
  Bomb,
  Globe,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { PageHeader, Card, Badge, StatCard, Button, RpcStatus, Tabs } from "@/components/ui";
import { useRpc } from "@/lib/rpc";
import "leaflet/dist/leaflet.css";

// ─── Types ────────────────────────────────────────────────────────

interface MilitaryBase {
  id: string;
  name: string;
  country: string;
  hostCountry: string;
  type: "air" | "naval" | "army" | "missile" | "nuclear" | "joint" | "cyber" | "space";
  lat: number;
  lng: number;
  status: string;
  capabilities: string[];
  personnel?: number;
}

interface CarrierGroup {
  id: string;
  name: string;
  hullNumber: string;
  country: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  status: string;
  homePort: string;
  battleGroup: string[];
  aircraftComplement: string[];
}

interface StrikeEvent {
  id: string;
  type: string;
  originCoords: [number, number];
  targetCoords: [number, number];
  targetDescription: string;
  weapon?: string;
  platform?: string;
  timestamp: number;
  country: string;
  targetCountry: string;
  narrative?: string;
  verified: boolean;
}

interface TheaterConfig {
  center: [number, number];
  zoom: number;
  name: string;
  description: string;
  countries: string[];
}

interface WarRisk {
  country: string;
  countryName: string;
  score: number;
  escalating: boolean;
}

interface CIIScore {
  code: string;
  name: string;
  ciiScore: number;
  trend: string;
}

// ─── Base Type Config ─────────────────────────────────────────────

const BASE_TYPE_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  air: { color: "#EF4444", icon: "✈️", label: "Air Base" },
  naval: { color: "#3B82F6", icon: "⚓", label: "Naval Base" },
  army: { color: "#22C55E", icon: "🏗️", label: "Army Base" },
  missile: { color: "#6B7280", icon: "🚀", label: "Missile Site" },
  nuclear: { color: "#000000", icon: "☢️", label: "Nuclear Facility" },
  joint: { color: "#F59E0B", icon: "⭐", label: "Joint Base" },
  cyber: { color: "#8B5CF6", icon: "🖥️", label: "Cyber Command" },
  space: { color: "#06B6D4", icon: "🛰️", label: "Space Force" },
};

const FLAG_MAP: Record<string, string> = {
  US: "🇺🇸",
  RU: "🇷🇺",
  CN: "🇨🇳",
  GB: "🇬🇧",
  FR: "🇫🇷",
  IN: "🇮🇳",
  IL: "🇮🇱",
  IR: "🇮🇷",
  KP: "🇰🇵",
  PK: "🇵🇰",
  SA: "🇸🇦",
  TR: "🇹🇷",
  DE: "🇩🇪",
  JP: "🇯🇵",
  KR: "🇰🇷",
  AU: "🇦🇺",
  NO: "🇳🇴",
  EG: "🇪🇬",
  UA: "🇺🇦",
  IT: "🇮🇹",
  GR: "🇬🇷",
  PL: "🇵🇱",
  ES: "🇪🇸",
  QA: "🇶🇦",
  BH: "🇧🇭",
  KW: "🇰🇼",
  AE: "🇦🇪",
  DJ: "🇩🇯",
};

// ─── Map Component (Leaflet) ──────────────────────────────────────

function TheaterMap({
  bases,
  carriers,
  strikes,
  layers,
  flyTarget,
  ciiScores,
  warRisks,
  onFlyTo,
}: {
  bases: MilitaryBase[];
  carriers: CarrierGroup[];
  strikes: StrikeEvent[];
  ciiScores: CIIScore[];
  warRisks: WarRisk[];
  layers: Record<string, boolean>;
  onFlyTo: (lat: number, lng: number, zoom: number) => void;
  flyTarget: { lat: number; lng: number; zoom: number } | null;
}) {
  void ciiScores;
  void warRisks;
  void onFlyTo; // reserved for future map layers
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const carriersLayerRef = useRef<L.LayerGroup | null>(null);
  const strikesLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) {
      return;
    }

    import("leaflet").then((L) => {
      const map = L.map(mapRef.current!, {
        center: [25, 45],
        zoom: 3,
        zoomControl: false,
        attributionControl: false,
      });

      // Dark military theme tiles
      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        maxZoom: 18,
        subdomains: "abcd",
      }).addTo(map);

      // Zoom control in bottom-right
      L.control.zoom({ position: "bottomright" }).addTo(map);

      mapInstance.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      carriersLayerRef.current = L.layerGroup().addTo(map);
      strikesLayerRef.current = L.layerGroup().addTo(map);

      // Force Leaflet to recalculate size after React has finished layout
      setTimeout(() => map.invalidateSize(), 50);
      const ro = new ResizeObserver(() => mapInstance.current?.invalidateSize());
      if (mapRef.current) {
        ro.observe(mapRef.current);
      }
      // Store ro reference for cleanup
      (mapInstance.current as unknown as Record<string, unknown>).__ro = ro;
    });

    return () => {
      if (mapInstance.current) {
        // Disconnect observer before removing map to prevent calls on a dead instance
        const ro = (mapInstance.current as unknown as Record<string, unknown>).__ro as
          | ResizeObserver
          | undefined;
        ro?.disconnect();
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // Fly to target
  useEffect(() => {
    if (flyTarget && mapInstance.current) {
      mapInstance.current.flyTo([flyTarget.lat, flyTarget.lng], flyTarget.zoom, {
        duration: 1.5,
      });
    }
  }, [flyTarget]);

  // Update base markers
  useEffect(() => {
    if (!markersRef.current) {
      return;
    }

    import("leaflet").then((L) => {
      markersRef.current!.clearLayers();

      if (!layers.bases) {
        return;
      }

      for (const base of bases) {
        const cfg = BASE_TYPE_CONFIG[base.type] ?? BASE_TYPE_CONFIG.joint;
        const icon = L.divIcon({
          className: "war-marker",
          html: `<div style="background:${cfg.color};width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.6);box-shadow:0 0 8px ${cfg.color}80;cursor:pointer;" title="${base.name}"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const marker = L.marker([base.lat, base.lng], { icon });
        // Use tooltip (not popup) — bindPopup causes full DOM reflow on every hover
        marker.bindTooltip(
          `<div style="min-width:180px;font-family:system-ui;padding:2px 0">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
              <span>${cfg.icon}</span>
              <strong style="color:#fff;font-size:12px;">${base.name}</strong>
            </div>
            <div style="color:#94a3b8;font-size:10px;margin-bottom:4px;">${base.country}${base.country !== base.hostCountry ? ` → ${base.hostCountry}` : ""}</div>
            <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:3px;">
              <span style="background:${cfg.color}33;color:${cfg.color};padding:1px 5px;border-radius:3px;font-size:9px;">${cfg.label}</span>
              <span style="background:#1e293b;color:#94a3b8;padding:1px 5px;border-radius:3px;font-size:9px;">${base.status}</span>
            </div>
            ${base.personnel ? `<div style="color:#94a3b8;font-size:9px;">${base.personnel.toLocaleString()} personnel</div>` : ""}
            <div style="color:#64748b;font-size:9px;margin-top:2px;">${base.capabilities.slice(0, 4).join(" · ")}</div>
          </div>`,
          { className: "war-popup", sticky: true, direction: "top" },
        );
        marker.addTo(markersRef.current!);
      }
    });
  }, [bases, layers.bases]);

  // Update carrier markers
  useEffect(() => {
    if (!carriersLayerRef.current) {
      return;
    }

    import("leaflet").then((L) => {
      carriersLayerRef.current!.clearLayers();

      if (!layers.carriers) {
        return;
      }

      for (const carrier of carriers) {
        const isDeployed = carrier.status === "deployed";
        // Remove animation:pulse from divIcon — causes continuous layout recalculation on all markers
        const icon = L.divIcon({
          className: "carrier-marker",
          html: `
            <div style="position:relative;cursor:pointer;" title="${carrier.name}">
              <div style="background:${isDeployed ? "#3B82F6" : "#475569"};width:20px;height:20px;border-radius:4px;border:2px solid rgba(255,255,255,0.8);display:flex;align-items:center;justify-content:center;font-size:12px;box-shadow:0 0 12px ${isDeployed ? "#3B82F6" : "#475569"}80;">
                ⚓
              </div>
              ${isDeployed ? `<div style="position:absolute;top:-2px;right:-2px;width:6px;height:6px;background:#22C55E;border-radius:50%;"></div>` : ""}
            </div>
          `,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });

        const marker = L.marker([carrier.lat, carrier.lng], { icon });
        // Use tooltip instead of popup — avoids full DOM reflow on hover
        marker.bindTooltip(
          `<div style="min-width:200px;font-family:system-ui;padding:2px 0;">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
              <span style="font-size:15px;">🚢</span>
              <div>
                <strong style="color:#fff;font-size:12px;">${carrier.name}</strong>
                <div style="color:#64748b;font-size:9px;">${carrier.hullNumber}</div>
              </div>
            </div>
            <div style="color:#94a3b8;font-size:10px;margin-bottom:4px;">${carrier.country} · ${carrier.homePort}</div>
            <div style="display:flex;gap:3px;margin-bottom:4px;">
              <span style="background:${isDeployed ? "#22C55E33" : "#47556933"};color:${isDeployed ? "#22C55E" : "#94a3b8"};padding:1px 5px;border-radius:3px;font-size:9px;">${carrier.status}</span>
              ${carrier.speed > 0 ? `<span style="background:#1e293b;color:#94a3b8;padding:1px 5px;border-radius:3px;font-size:9px;">${carrier.speed}kt · ${carrier.heading}°</span>` : ""}
            </div>
            <div style="color:#64748b;font-size:9px;">Battle group: ${carrier.battleGroup.slice(0, 3).join(", ")}</div>
          </div>`,
          { className: "war-popup", sticky: true, direction: "top" },
        );
        marker.addTo(carriersLayerRef.current!);
      }
    });
  }, [carriers, layers.carriers]);

  // Update strike lines
  useEffect(() => {
    if (!strikesLayerRef.current) {
      return;
    }

    import("leaflet").then((L) => {
      strikesLayerRef.current!.clearLayers();

      if (!layers.strikes) {
        return;
      }

      for (const strike of strikes) {
        // Draw trajectory line
        const line = L.polyline([strike.originCoords, strike.targetCoords], {
          color: "#EF4444",
          weight: 2,
          opacity: 0.7,
          dashArray: "8, 4",
        });
        line.addTo(strikesLayerRef.current!);

        // Target marker — no animation:pulse (causes continuous layout recalc freezing hover events)
        const targetIcon = L.divIcon({
          className: "strike-target",
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#EF444480;border:2px solid #EF4444;cursor:pointer;" title="${strike.targetDescription}"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const targetMarker = L.marker(strike.targetCoords, { icon: targetIcon });
        // Use tooltip — lighter than popup, no layout reflow
        targetMarker.bindTooltip(
          `<div style="min-width:180px;font-family:system-ui;padding:2px 0;">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
              <span>💥</span>
              <strong style="color:#EF4444;font-size:11px;">${strike.type.toUpperCase()}</strong>
            </div>
            <div style="color:#fff;font-size:11px;margin-bottom:3px;">${strike.targetDescription}</div>
            <div style="color:#94a3b8;font-size:9px;">${strike.country} → ${strike.targetCountry}</div>
            ${strike.weapon ? `<div style="color:#64748b;font-size:9px;margin-top:2px;">${strike.weapon}${strike.platform ? ` (${strike.platform})` : ""}</div>` : ""}
          </div>`,
          { className: "war-popup", sticky: true, direction: "top" },
        );
        targetMarker.addTo(strikesLayerRef.current!);
      }
    });
  }, [strikes, layers.strikes]);

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-border"
      style={{ height: "calc(100vh - 280px)", minHeight: "500px" }}
    >
      <div ref={mapRef} className="w-full h-full" />

      {/* Custom CSS for Leaflet dark theme */}
      <style>{`
        .war-popup .leaflet-popup-content-wrapper {
          background: #0f172a !important;
          border: 1px solid #334155 !important;
          border-radius: 8px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
        }
        .war-popup .leaflet-popup-tip {
          background: #0f172a !important;
          border: 1px solid #334155 !important;
        }
        .war-popup .leaflet-popup-content {
          margin: 8px 12px !important;
          color: #e2e8f0 !important;
        }
        .leaflet-control-zoom a {
          background: #1e293b !important;
          color: #e2e8f0 !important;
          border-color: #334155 !important;
        }
        .leaflet-control-zoom a:hover {
          background: #334155 !important;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.3); }
        }
        .war-marker, .carrier-marker, .strike-target {
          background: transparent !important;
          border: none !important;
        }
      `}</style>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────

export function WarTheaterPage() {
  const [activeTab, setActiveTab] = useState("map");
  const [selectedTheater, setSelectedTheater] = useState<TheaterConfig | null>(null);
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(
    null,
  );
  const [layers, setLayers] = useState({
    bases: true,
    carriers: true,
    strikes: true,
    cii: false,
  });
  const [baseFilter, setBaseFilter] = useState<string>("all");

  // ── RPC Data ──
  const {
    data: basesData,
    loading: basesLoading,
    error: basesError,
    refetch: refetchBases,
  } = useRpc<{
    bases: MilitaryBase[];
    total: number;
  }>("republic.wartheater.bases", {});

  const { data: carriersData, loading: carriersLoading } = useRpc<{
    carriers: CarrierGroup[];
    deployed: number;
  }>("republic.wartheater.carriers", {});

  const { data: strikesData } = useRpc<{
    strikes: StrikeEvent[];
  }>("republic.wartheater.strikes", { limit: 50 });

  const { data: overviewData } = useRpc<{
    stats: {
      totalBases: number;
      totalCarriers: number;
      deployedCarriers: number;
      totalStrikes: number;
    };
    ciiScores: CIIScore[];
    warRisks: WarRisk[];
    warSignals: unknown[];
  }>("republic.wartheater.overview", {});

  const { data: theatersData } = useRpc<{
    theaters: TheaterConfig[];
  }>("republic.wartheater.theaters", {});

  // ── Derived ──
  const bases = useMemo(() => {
    const all = basesData?.bases ?? [];
    if (baseFilter === "all") {
      return all;
    }
    return all.filter((b) => b.type === baseFilter);
  }, [basesData, baseFilter]);

  const carriers = carriersData?.carriers ?? [];
  const strikes = strikesData?.strikes ?? [];
  const theaters = theatersData?.theaters ?? [];
  const stats = overviewData?.stats;
  const ciiScores = overviewData?.ciiScores ?? [];
  const warRisks = overviewData?.warRisks ?? [];

  const toggleLayer = useCallback((layer: string) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer as keyof typeof prev] }));
  }, []);

  const handleFlyTo = useCallback((lat: number, lng: number, zoom: number) => {
    setFlyTarget({ lat, lng, zoom });
  }, []);

  const loading = basesLoading || carriersLoading;

  return (
    <div className="p-6 space-y-4 animate-fade-in">
      <RpcStatus loading={loading} error={basesError} onRetry={refetchBases} />

      <PageHeader
        title="War Theater"
        description="Global military intelligence — bases, carriers, strike events & geopolitical risk"
        icon={<Crosshair size={28} />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={<Globe size={14} />}
              onClick={() => setFlyTarget({ lat: 25, lng: 45, zoom: 3 })}
            >
              Global View
            </Button>
          </div>
        }
      />

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard
          label="Military Bases"
          value={stats?.totalBases ?? "—"}
          icon={<MapPin size={16} />}
        />
        <StatCard
          label="Carrier Groups"
          value={stats?.totalCarriers ?? "—"}
          sub={`${stats?.deployedCarriers ?? 0} deployed`}
          icon={<Anchor size={16} />}
        />
        <StatCard
          label="Strike Events"
          value={stats?.totalStrikes ?? "—"}
          icon={<Target size={16} />}
        />
        <StatCard
          label="War Signals"
          value={overviewData?.warSignals?.length ?? "—"}
          icon={<AlertTriangle size={16} />}
        />
        <StatCard
          label="Avg. CII"
          value={
            ciiScores.length > 0
              ? Math.round(ciiScores.reduce((s, c) => s + c.ciiScore, 0) / ciiScores.length)
              : "—"
          }
          icon={<Shield size={16} />}
        />
      </div>

      {/* Layer Controls & Theater Selector */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Layer toggles */}
        <div className="flex gap-1.5">
          {[
            { key: "bases", label: "Bases", icon: <MapPin size={12} /> },
            { key: "carriers", label: "Carriers", icon: <Anchor size={12} /> },
            { key: "strikes", label: "Strikes", icon: <Target size={12} /> },
          ].map((l) => (
            <Button
              key={l.key}
              variant={layers[l.key as keyof typeof layers] ? "primary" : "ghost"}
              size="sm"
              icon={layers[l.key as keyof typeof layers] ? <Eye size={12} /> : <EyeOff size={12} />}
              onClick={() => toggleLayer(l.key)}
            >
              {l.icon} {l.label}
            </Button>
          ))}
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Base type filter */}
        <select
          className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent"
          value={baseFilter}
          onChange={(e) => setBaseFilter(e.target.value)}
        >
          <option value="all">All Base Types</option>
          {Object.entries(BASE_TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.icon} {cfg.label}
            </option>
          ))}
        </select>

        <div className="h-6 w-px bg-border" />

        {/* Theater presets */}
        <div className="flex gap-1.5">
          {theaters.map((t) => (
            <Button
              key={t.name}
              variant={selectedTheater?.name === t.name ? "primary" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedTheater(t);
                setFlyTarget({ lat: t.center[0], lng: t.center[1], zoom: t.zoom });
              }}
            >
              {t.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <Tabs
        tabs={[
          { id: "map", label: "Theater Map" },
          { id: "intel", label: "Intel Feed" },
          { id: "legend", label: "Legend" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "map" && (
        <div className="flex gap-4">
          {/* Map */}
          <div className="flex-1">
            <TheaterMap
              bases={bases}
              carriers={carriers}
              strikes={strikes}
              ciiScores={ciiScores}
              warRisks={warRisks}
              layers={layers}
              onFlyTo={handleFlyTo}
              flyTarget={flyTarget}
            />
          </div>

          {/* Right Sidebar — War Risks */}
          <div className="w-64 space-y-3 flex-shrink-0 hidden xl:block">
            <Card className="p-3">
              <h3 className="text-xs font-semibold text-text-heading mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-danger" /> War Risk Index
              </h3>
              <div className="space-y-2">
                {warRisks.slice(0, 8).map((r) => (
                  <button
                    type="button"
                    key={r.country}
                    className="w-full flex items-center gap-2 hover:bg-bg-secondary rounded px-2 py-1 transition-colors cursor-pointer text-left"
                    onClick={() => {
                      const base = (basesData?.bases ?? []).find(
                        (b) => b.country === r.country || b.hostCountry === r.country,
                      );
                      if (base) {
                        setFlyTarget({ lat: base.lat, lng: base.lng, zoom: 6 });
                      }
                    }}
                  >
                    <span className="text-xs">{FLAG_MAP[r.country] ?? "🏳️"}</span>
                    <span className="text-xs text-text-primary flex-1 truncate">
                      {r.countryName}
                    </span>
                    <Badge
                      variant={r.score >= 70 ? "danger" : r.score >= 40 ? "warning" : "neutral"}
                    >
                      {r.score}
                    </Badge>
                    {r.escalating && <span className="text-[10px]">⚡</span>}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-3">
              <h3 className="text-xs font-semibold text-text-heading mb-2 flex items-center gap-1.5">
                <Anchor size={12} className="text-info" /> Deployed Carriers
              </h3>
              <div className="space-y-2">
                {carriers
                  .filter((c) => c.status === "deployed")
                  .map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="w-full flex items-center gap-2 hover:bg-bg-secondary rounded px-2 py-1 transition-colors cursor-pointer text-left"
                      onClick={() => setFlyTarget({ lat: c.lat, lng: c.lng, zoom: 6 })}
                    >
                      <span className="text-xs">{FLAG_MAP[c.country] ?? "🏳️"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-text-primary truncate">{c.name}</div>
                        <div className="text-[10px] text-text-muted">{c.hullNumber}</div>
                      </div>
                      <ChevronRight size={10} className="text-text-muted" />
                    </button>
                  ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "intel" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CII Scores */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Shield size={14} /> Country Instability Index (CII)
            </h3>
            <div className="space-y-2">
              {ciiScores.map((c) => (
                <div key={c.code} className="flex items-center gap-3">
                  <span className="text-sm w-6">{FLAG_MAP[c.code] ?? "🏳️"}</span>
                  <span className="text-xs text-text-primary flex-1">{c.name}</span>
                  <div className="w-24 h-2 bg-bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${c.ciiScore}%`,
                        background:
                          c.ciiScore >= 70 ? "#EF4444" : c.ciiScore >= 40 ? "#F59E0B" : "#22C55E",
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-text-muted w-8 text-right">
                    {c.ciiScore}
                  </span>
                  <Badge
                    variant={
                      c.trend === "rising"
                        ? "danger"
                        : c.trend === "falling"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {c.trend}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent Strikes */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-text-heading mb-3 flex items-center gap-2">
              <Bomb size={14} /> Recent Strike Events
            </h3>
            {strikes.length === 0 ? (
              <p className="text-xs text-text-muted">
                No strike events recorded yet. Use the Strike Simulator to create simulations.
              </p>
            ) : (
              <div className="space-y-2">
                {strikes.slice(0, 10).map((s) => (
                  <div key={s.id} className="flex items-start gap-2 p-2 rounded bg-bg-secondary">
                    <span className="text-xs mt-0.5">💥</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-primary">{s.targetDescription}</div>
                      <div className="text-[10px] text-text-muted">
                        {FLAG_MAP[s.country] ?? ""} → {FLAG_MAP[s.targetCountry] ?? ""} · {s.type}{" "}
                        {s.weapon ? `· ${s.weapon}` : ""}
                      </div>
                    </div>
                    <Badge variant={s.verified ? "success" : "neutral"}>
                      {s.verified ? "verified" : "unverified"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "legend" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Base Types */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-text-heading mb-3">Base Types</h3>
            <div className="space-y-2">
              {Object.entries(BASE_TYPE_CONFIG).map(([type, cfg]) => (
                <div key={type} className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full border border-white/20"
                    style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}60` }}
                  />
                  <span className="text-xs">{cfg.icon}</span>
                  <span className="text-xs text-text-primary">{cfg.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Carrier Status */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-text-heading mb-3">Carrier Status</h3>
            <div className="space-y-2">
              {[
                { status: "deployed", color: "#22C55E", desc: "Active deployment" },
                { status: "port", color: "#475569", desc: "In home port" },
                { status: "transit", color: "#F59E0B", desc: "In transit" },
                { status: "exercise", color: "#3B82F6", desc: "Training exercise" },
              ].map((s) => (
                <div key={s.status} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded" style={{ background: s.color }} />
                  <span className="text-xs text-text-primary capitalize">{s.status}</span>
                  <span className="text-xs text-text-muted">— {s.desc}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* CII Risk Levels */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-text-heading mb-3">CII Risk Levels</h3>
            <div className="space-y-2">
              {[
                { range: "0–30", color: "#22C55E", label: "Stable" },
                { range: "31–50", color: "#F59E0B", label: "Elevated" },
                { range: "51–70", color: "#EF4444", label: "High" },
                { range: "71–100", color: "#991B1B", label: "Critical" },
              ].map((l) => (
                <div key={l.range} className="flex items-center gap-3">
                  <div className="w-8 h-3 rounded" style={{ background: l.color }} />
                  <span className="text-xs text-text-primary">{l.range}</span>
                  <span className="text-xs text-text-muted">{l.label}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Strike Events */}
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-text-heading mb-3">Strike Indicators</h3>
            <div className="space-y-2">
              {[
                { icon: "💥", label: "Strike target", desc: "Impact location" },
                { icon: "- -", label: "Dashed line", desc: "Strike trajectory" },
                { icon: "🔴", label: "Red circle", desc: "Active conflict zone" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <span className="text-xs w-5 text-center">{s.icon}</span>
                  <span className="text-xs text-text-primary">{s.label}</span>
                  <span className="text-xs text-text-muted">— {s.desc}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
