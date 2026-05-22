/**
 * Tactical Globe — 3D World Intelligence Visualization
 *
 * Creates a globe.gl-based 3D earth with:
 * - Dark theme with cyan atmosphere glow
 * - Animated threat signal markers (color-coded by severity)
 * - Country CII heatmap (polygon coloring)
 * - Pulsing convergence rings
 * - Animated arc connections between correlated signals
 * - Auto-rotation with interactive drag/zoom
 */

import Globe, { type GlobeInstance } from "globe.gl";

// ─── Types ───────────────────────────────────────────────────────

export interface GlobeSignal {
  lat: number;
  lng: number;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  country: string;
  description: string;
  timestamp: number;
}

export interface GlobeCountry {
  code: string;
  name: string;
  ciiScore: number;
  trend: "rising" | "stable" | "falling";
}

export interface GlobeConvergence {
  country: string;
  lat: number;
  lng: number;
  signalCount: number;
  maxSeverity: "critical" | "high" | "medium" | "low" | "info";
  description: string;
}

// ─── Color Constants ─────────────────────────────────────────────

const SEV_COLORS: Record<string, string> = {
  critical: "#ff1744",
  high: "#ff6d00",
  medium: "#ffd600",
  low: "#00e676",
  info: "#40c4ff",
};

// oxlint-disable-next-line no-unused-vars
const SEV_GLOW: Record<string, string> = {
  critical: "rgba(255,23,68,0.6)",
  high: "rgba(255,109,0,0.4)",
  medium: "rgba(255,214,0,0.3)",
  low: "rgba(0,230,118,0.2)",
  info: "rgba(64,196,255,0.2)",
};

const SEV_SIZE: Record<string, number> = {
  critical: 1.2,
  high: 0.9,
  medium: 0.6,
  low: 0.4,
  info: 0.3,
};

// Country centroid lat/lng for plotting (ISO alpha-2 → [lat, lng])
const COUNTRY_CENTERS: Record<string, [number, number]> = {
  US: [39.8, -98.6],
  CN: [35.9, 104.2],
  RU: [61.5, 105.3],
  UA: [48.4, 31.2],
  TW: [23.7, 121.0],
  IR: [32.4, 53.7],
  KP: [40.3, 127.5],
  IL: [31.0, 34.9],
  SY: [34.8, 38.9],
  IQ: [33.2, 43.7],
  AF: [33.9, 67.7],
  PK: [30.4, 69.3],
  IN: [20.6, 79.0],
  TR: [38.9, 35.2],
  SA: [23.9, 45.1],
  YE: [15.6, 48.5],
  SD: [12.9, 30.2],
  NG: [9.1, 8.7],
  ET: [9.1, 40.5],
  CD: [4.0, 21.8],
  MM: [19.5, 96.0],
  VE: [6.4, -66.6],
  MX: [23.6, -102.6],
  EG: [26.8, 30.8],
  LY: [26.3, 17.2],
  JP: [36.2, 138.3],
  KR: [35.9, 127.8],
  DE: [51.2, 10.4],
  GB: [55.4, -3.4],
  FR: [46.6, 2.2],
  BR: [-14.2, -51.9],
  AU: [-25.3, 133.8],
  PH: [12.9, 121.8],
  TH: [15.9, 100.9],
  ID: [-0.8, 113.9],
  SO: [5.2, 46.2],
  ML: [17.6, -4.0],
  CF: [6.6, 20.9],
  HT: [19.1, -72.3],
  LB: [33.9, 35.9],
  PS: [31.9, 35.2],
  GE: [42.3, 43.4],
};

// ─── Globe Configuration ─────────────────────────────────────────

let globeInstance: GlobeInstance | null = null;
let animationFrame: number | null = null;
let currentSignals: GlobeSignal[] = [];
// oxlint-disable-next-line no-unused-vars
let currentConvergences: GlobeConvergence[] = [];
let pulseTick = 0;
let idleTimer: number | null = null;
// Stored so destroyGlobe() can removeEventListener (prevents listener leaks on remount)
let _pauseAutoRotate: (() => void) | null = null;
let _listenerContainer: HTMLElement | null = null;
let _resizeObserver: ResizeObserver | null = null;

/**
 * Create or re-use the tactical globe inside a container element.
 * Returns the globe.gl instance.
 */
export function createTacticalGlobe(container: HTMLElement): GlobeInstance {
  // If the globe already exists and is attached to this container, return it
  if (globeInstance) {
    const existing = container.querySelector("canvas");
    if (existing) {
      return globeInstance;
    }
    destroyGlobe();
  }

  // Clear container
  while (container.firstChild) { container.removeChild(container.firstChild); }

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  const globe = new Globe(container)
    .width(width)
    .height(height)
    .backgroundColor("rgba(0,0,0,0)")
    .globeImageUrl("//unpkg.com/three-globe/example/img/earth-night.jpg")
    .bumpImageUrl("//unpkg.com/three-globe/example/img/earth-topology.png")
    .atmosphereColor("#00e5ff")
    .atmosphereAltitude(0.25)
    .showGraticules(true)
    // Point markers for signals
    .pointsData([])
    .pointLat("lat")
    .pointLng("lng")
    .pointColor("color")
    .pointAltitude("alt")
    .pointRadius("radius")
    .pointsMerge(false)
    // Rings for convergences
    .ringsData([])
    .ringLat("lat")
    .ringLng("lng")
    .ringColor("color")
    .ringMaxRadius("maxR")
    .ringPropagationSpeed("speed")
    .ringRepeatPeriod("period")
    // Arcs for signal connections
    .arcsData([])
    .arcStartLat("startLat")
    .arcStartLng("startLng")
    .arcEndLat("endLat")
    .arcEndLng("endLng")
    .arcColor("colors")
    .arcDashLength(0.4)
    .arcDashGap(0.2)
    .arcDashAnimateTime(1500)
    .arcStroke(0.5)
    // Labels for convergences
    .labelsData([])
    .labelLat("lat")
    .labelLng("lng")
    .labelText("text")
    .labelSize("size")
    .labelColor("color")
    .labelDotRadius(0)
    .labelAltitude(0.02);

  // Set initial point of view
  globe.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 0);

  // Auto-rotation + interactive controls
  const controls = globe.controls();
  if (controls) {
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableRotate = true;
    controls.zoomSpeed = 1.0;
    controls.rotateSpeed = 0.8;
    controls.minDistance = 150;
    controls.maxDistance = 600;

    // Pause auto-rotation when user interacts, resume after 5s idle
    const pauseAutoRotate = () => {
      controls.autoRotate = false;
      if (idleTimer) {clearTimeout(idleTimer);}
      idleTimer = window.setTimeout(() => {
        controls.autoRotate = true;
      }, 5000);
    };
    container.addEventListener("pointerdown", pauseAutoRotate);
    container.addEventListener("wheel", pauseAutoRotate, { passive: true });
    container.addEventListener("touchstart", pauseAutoRotate, { passive: true });
    // Store refs for cleanup in destroyGlobe()
    _pauseAutoRotate = pauseAutoRotate;
    _listenerContainer = container;
  }

  // Darken the scene for sci-fi look
  const scene = globe.scene();
  if (scene) {
    // Add ambient light for visibility
    // oxlint-disable-next-line no-unused-vars
    const THREE = (globe as unknown as { __threeObj?: { constructor: unknown } }).__threeObj?.constructor;
    if (scene.children) {
      for (const child of scene.children) {
        const c = child as unknown as { isDirectionalLight?: boolean; intensity?: number };
        if (c.isDirectionalLight) {
          c.intensity = 0.6;
        }
      }
    }
  }

  // Style graticules
  const globeMaterial = globe.globeMaterial();
  if (globeMaterial) {
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    (globeMaterial as any).bumpScale = 10;
  }

  globeInstance = globe;

  // Start pulse animation
  startPulseAnimation();

  // Handle resize
  const observer = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 0 && h > 0) {
      globe.width(w).height(h);
    }
  });
  observer.observe(container);
  _resizeObserver = observer;

  return globe;
}

/**
 * Update the globe with new intel signals.
 */
export function updateGlobeSignals(signals: GlobeSignal[]): void {
  currentSignals = signals;
  if (!globeInstance) {return;}

  // Convert signals to point markers
  const points = signals
    .filter((s) => s.lat !== 0 || s.lng !== 0)
    .map((s) => ({
      lat: s.lat,
      lng: s.lng,
      alt: SEV_SIZE[s.severity] * 0.02 + 0.005,
      radius: SEV_SIZE[s.severity],
      color: SEV_COLORS[s.severity],
      severity: s.severity,
      label: `${s.type.toUpperCase()}: ${s.description}`,
    }));

  globeInstance.pointsData(points);

  // Generate arcs between signals in the same country
  const byCountry = new Map<string, GlobeSignal[]>();
  for (const s of signals) {
    if (!byCountry.has(s.country)) {byCountry.set(s.country, []);}
    byCountry.get(s.country)!.push(s);
  }

  const arcs: Array<Record<string, unknown>> = [];
  for (const [, group] of byCountry) {
    if (group.length < 2) {continue;}
    // Connect first to last signal in each country
    const a = group[0];
    const b = group[group.length - 1];
    if (a.lat === b.lat && a.lng === b.lng) {continue;}
    arcs.push({
      startLat: a.lat,
      startLng: a.lng,
      endLat: b.lat,
      endLng: b.lng,
      colors: [SEV_COLORS[a.severity] + "cc", SEV_COLORS[b.severity] + "cc"],
    });
  }

  globeInstance.arcsData(arcs);
}

/**
 * Update the globe with convergence data (pulsing rings).
 */
export function updateGlobeConvergences(convergences: GlobeConvergence[]): void {
  currentConvergences = convergences;
  if (!globeInstance) {return;}

  const rings = convergences.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    maxR: 3 + c.signalCount * 0.5,
    speed: c.maxSeverity === "critical" ? 4 : 2,
    period: c.maxSeverity === "critical" ? 800 : 1500,
    color: () => SEV_COLORS[c.maxSeverity] + "88",
  }));

  const labels = convergences.map((c) => ({
    lat: c.lat,
    lng: c.lng,
    text: `${c.country} [${c.signalCount}]`,
    size: 0.8,
    color: () => SEV_COLORS[c.maxSeverity],
  }));

  globeInstance.ringsData(rings);
  globeInstance.labelsData(labels);
}

/**
 * Update globe with country CII scores.
 * Uses HTML overlay pins at country centers.
 */
export function updateGlobeCII(countries: GlobeCountry[]): void {
  if (!globeInstance) {return;}

  // Add CII markers as additional small points with labels
  const ciiPoints = countries
    .filter((c) => COUNTRY_CENTERS[c.code])
    .map((c) => {
      const [lat, lng] = COUNTRY_CENTERS[c.code];
      const color =
        c.ciiScore >= 60
          ? "#ff1744"
          : c.ciiScore >= 35
            ? "#ff6d00"
            : c.ciiScore >= 15
              ? "#ffd600"
              : "#00e676";
      return {
        lat,
        lng,
        alt: 0.001,
        radius: 0.15 + (c.ciiScore / 100) * 0.6,
        color: color + "88",
        label: `${c.name}: CII ${c.ciiScore}`,
      };
    });

  // Merge with signal points
  const signalPoints = currentSignals
    .filter((s) => s.lat !== 0 || s.lng !== 0)
    .map((s) => ({
      lat: s.lat,
      lng: s.lng,
      alt: SEV_SIZE[s.severity] * 0.02 + 0.005,
      radius: SEV_SIZE[s.severity],
      color: SEV_COLORS[s.severity],
      severity: s.severity,
      label: `${s.type.toUpperCase()}: ${s.description}`,
    }));

  globeInstance.pointsData([...signalPoints, ...ciiPoints]);
}

/**
 * Animate pulsing effect for critical/high severity points.
 */
function startPulseAnimation(): void {
  if (animationFrame) {cancelAnimationFrame(animationFrame);}

  function tick() {
    pulseTick = (pulseTick + 1) % 120;
    animationFrame = requestAnimationFrame(tick);
  }
  tick();
}

/**
 * Get the country center coordinates for a country code.
 */
export function getCountryCenter(code: string): [number, number] | null {
  return COUNTRY_CENTERS[code] ?? null;
}

/**
 * Fly the globe to focus on a specific country.
 */
export function focusCountry(code: string): void {
  if (!globeInstance) {return;}
  const center = COUNTRY_CENTERS[code];
  if (!center) {return;}
  globeInstance.pointOfView({ lat: center[0], lng: center[1], altitude: 1.5 }, 1000);
}

/**
 * Reset the globe view to the default.
 */
export function resetView(): void {
  if (!globeInstance) {return;}
  globeInstance.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 1000);
}

/**
 * Destroy the globe instance and clean up resources.
 */
export function destroyGlobe(): void {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  // Remove container event listeners — prevents memory leaks on remount
  if (_listenerContainer && _pauseAutoRotate) {
    _listenerContainer.removeEventListener("pointerdown", _pauseAutoRotate);
    _listenerContainer.removeEventListener("wheel", _pauseAutoRotate);
    _listenerContainer.removeEventListener("touchstart", _pauseAutoRotate);
  }
  _pauseAutoRotate = null;
  _listenerContainer = null;
  // Disconnect the ResizeObserver
  _resizeObserver?.disconnect();
  _resizeObserver = null;
  if (globeInstance) {
    globeInstance._destructor?.();
    globeInstance = null;
  }
  currentSignals = [];
  currentConvergences = [];
}

/**
 * Check if globe is already initialized.
 */
export function isGlobeReady(): boolean {
  return globeInstance !== null;
}
