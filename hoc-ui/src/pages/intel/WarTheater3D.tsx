/**
 * WarTheater3D — Cinematic 3D War Theater
 *
 * Full-screen WebGL globe (globe.gl) with:
 * - Military bases, carrier groups, and strike arcs
 * - Procedural audio engine (ambient drone, radar, SFX)
 * - Timeline replay with transport controls
 * - Cinematic overlays (scanlines, vignette, HUD)
 * - Camera presets and auto-orbit
 *
 * Route: /intel/war-theater-3d
 *
 * Performance fixed (2026-03):
 * - Tooltip: ref+DOM instead of setState → eliminates 60fps React re-renders from WebGL mousemove
 * - Particles: React.memo + reduced count (40→15) — not re-rendered by tooltip state changes
 * - Timeline RAF: state updated at 10fps max (150ms throttle) — globe data updated via ref path
 * - arcDashAnimateTime raised (2500→4000) to reduce GPU fragment shader work
 * - SFX effect depends on stable individual callbacks, not the unstable audio object reference
 */

import type { Object3D as ThreeObject3D } from "three";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Crosshair,
  Globe as GlobeIcon,
  Maximize,
  ChevronRight,
  ChevronLeft,
  Radio,
} from "lucide-react";
import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { useWarAudio } from "@/hooks/useWarAudio";
import { useRpc } from "@/lib/rpc";

// ─── Types ─────────────────────────────────────────────────────────

interface MilitaryBase {
  id: string;
  name: string;
  country: string;
  hostCountry: string;
  type: string;
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
}

interface WarRisk {
  country: string;
  countryName: string;
  score: number;
  escalating: boolean;
}

// ─── Globe Instance type ───────────────────────────────────────────

type GlobeInstance = {
  width: (n: number) => GlobeInstance;
  height: (n: number) => GlobeInstance;
  backgroundColor: (c: string) => GlobeInstance;
  globeTileEngineUrl: (fn: (x: number, y: number, z: number) => string) => GlobeInstance;
  // ── Legacy points layer (kept for fallback) ──
  pointsData: (d: unknown[]) => GlobeInstance;
  pointLat: (fn: (d: unknown) => number) => GlobeInstance;
  pointLng: (fn: (d: unknown) => number) => GlobeInstance;
  pointColor: (fn: (d: unknown) => string) => GlobeInstance;
  pointAltitude: (fn: (d: unknown) => number) => GlobeInstance;
  pointRadius: (fn: (d: unknown) => number) => GlobeInstance;
  pointLabel: (fn: (d: unknown) => string) => GlobeInstance;
  pointResolution: (n: number) => GlobeInstance;
  // ── Custom 3D objects layer ──
  objectsData: (d: unknown[]) => GlobeInstance;
  objectLat: (fn: (d: unknown) => number) => GlobeInstance;
  objectLng: (fn: (d: unknown) => number) => GlobeInstance;
  objectAltitude: (fn: (d: unknown) => number) => GlobeInstance;
  objectThreeObject: (fn: (d: unknown) => unknown) => GlobeInstance;
  objectLabel: (fn: (d: unknown) => string) => GlobeInstance;
  // ── Arcs ──
  arcsData: (d: unknown[]) => GlobeInstance;
  arcStartLat: (fn: (d: unknown) => number) => GlobeInstance;
  arcStartLng: (fn: (d: unknown) => number) => GlobeInstance;
  arcEndLat: (fn: (d: unknown) => number) => GlobeInstance;
  arcEndLng: (fn: (d: unknown) => number) => GlobeInstance;
  arcColor: (fn: (d: unknown) => string | string[]) => GlobeInstance;
  arcAltitude: (v: number | ((d: unknown) => number)) => GlobeInstance;
  arcStroke: (v: number | ((d: unknown) => number)) => GlobeInstance;
  arcDashLength: (v: number | ((d: unknown) => number)) => GlobeInstance;
  arcDashGap: (v: number | ((d: unknown) => number)) => GlobeInstance;
  arcDashAnimateTime: (v: number | ((d: unknown) => number)) => GlobeInstance;
  arcLabel: (fn: (d: unknown) => string) => GlobeInstance;
  // ── Rings ──
  ringsData: (d: unknown[]) => GlobeInstance;
  ringLat: (fn: (d: unknown) => number) => GlobeInstance;
  ringLng: (fn: (d: unknown) => number) => GlobeInstance;
  ringColor: (fn: (d: unknown) => string) => GlobeInstance;
  ringMaxRadius: (n: number) => GlobeInstance;
  ringPropagationSpeed: (n: number) => GlobeInstance;
  ringRepeatPeriod: (n: number) => GlobeInstance;
  // ── Globe visuals ──
  atmosphereColor: (c: string) => GlobeInstance;
  atmosphereAltitude: (n: number) => GlobeInstance;
  onPointHover: (fn: (d: unknown, prev: unknown, ev: MouseEvent) => void) => GlobeInstance;
  pointOfView: (pov: { lat: number; lng: number; altitude: number }, ms?: number) => GlobeInstance;
  scene: () => { children: unknown[]; add: (obj: unknown) => void };
  controls: () => {
    autoRotate: boolean;
    autoRotateSpeed: number;
    enableZoom: boolean;
    enableDamping: boolean;
    dampingFactor: number;
    dollyIn?: (n: number) => void;
    dollyOut?: (n: number) => void;
  };
};

// ─── Constants ─────────────────────────────────────────────────────

const BASE_COLORS: Record<string, string> = {
  air: "#EF4444",
  naval: "#3B82F6",
  army: "#22C55E",
  missile: "#6B7280",
  nuclear: "#A855F7",
  joint: "#F59E0B",
  cyber: "#8B5CF6",
  space: "#06B6D4",
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
  UA: "🇺🇦",
  IT: "🇮🇹",
  EG: "🇪🇬",
};

const TILE_URLS = {
  dark: (x: number, y: number, z: number) =>
    `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
  satellite: (x: number, y: number, z: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  terrain: (x: number, y: number, z: number) => `https://tile.opentopomap.org/${z}/${x}/${y}.png`,
};

const SPEED_OPTIONS = [1, 2, 4, 8, 16];

// ─── Three.js type (resolved via static import above) ────────────────────
type THREE_t = typeof import("three");

// ─── 3D Object Factories (Performance-Optimised) ───────────────────
// Lightweight models: MeshStandardMaterial (not Physical), no PointLights,
// shared geometry cache, max ~6 meshes per model, low polygon segments.
// Objects are small because globe.gl scales them relative to the globe.

// Geometry + material cache — created once per THREE import, shared by all models
let _geoCache: Record<string, unknown> | null = null;
let _matCache: Record<string, unknown> | null = null;

function getGeoCache(T: THREE_t) {
  if (_geoCache) { return _geoCache; }
  _geoCache = {
    // Shared primitives (low-poly)
    cone4:     new T.ConeGeometry(1, 1, 4),
    cone6:     new T.ConeGeometry(1, 1, 6),
    cyl4:      new T.CylinderGeometry(1, 1, 1, 4),
    cyl6:      new T.CylinderGeometry(1, 1, 1, 6),
    box:       new T.BoxGeometry(1, 1, 1),
    sphere4:   new T.SphereGeometry(1, 4, 3),
    sphere6:   new T.SphereGeometry(1, 6, 4),
    flatDisk:  new T.CylinderGeometry(1, 1, 0.1, 6),
  };
  return _geoCache;
}

function getMatCache(T: THREE_t) {
  if (_matCache) { return _matCache; }
  const std = (hex: number, emHex = 0x000000, emI = 0.4) =>
    new T.MeshStandardMaterial({ color: hex, emissive: emHex, emissiveIntensity: emI, metalness: 0.5, roughness: 0.4 });
  _matCache = {
    dark:    std(0x1a2530, 0x001122, 0.3),
    metal:   std(0x555566, 0x111122, 0.3),
    white:   std(0xcccccc, 0x444444, 0.2),
    exhaust: new T.MeshStandardMaterial({ color: 0xff5500, emissive: 0xff3300, emissiveIntensity: 2.5, transparent: true, opacity: 0.8 }),
    flame:   new T.MeshStandardMaterial({ color: 0xffffaa, emissive: 0xffff66, emissiveIntensity: 3.0, transparent: true, opacity: 0.55 }),
    canopy:  new T.MeshStandardMaterial({ color: 0x88ccff, emissive: 0x3388cc, emissiveIntensity: 0.6, transparent: true, opacity: 0.5 }),
    green:   std(0x22aa44, 0x118822, 0.6),
    radar:   new T.MeshStandardMaterial({ color: 0x88aacc, emissive: 0x3388ff, emissiveIntensity: 0.8, metalness: 0.8, roughness: 0.15 }),
    concrete: std(0x555555, 0x111111, 0.15),
  };
  return _matCache;
}

/** Shared material with custom color (nation-coloured) */
function natMat(T: THREE_t, hex: number) {
  return new T.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.4 });
}
/** Base-colored material */
function baseMat(T: THREE_t, colorHex: number) {
  return new T.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.5 });
}

/** Ballistic missile — 5 meshes: body, warhead, 2 fins (flat box), exhaust plume */
function makeMissile(T: THREE_t, hexColor = 0xcccccc): ThreeObject3D {
  const G = getGeoCache(T) as Record<string, import("three").BufferGeometry>;
  const M = getMatCache(T) as Record<string, import("three").Material>;
  const group = new T.Group();
  const bMat = natMat(T, hexColor);

  // Body (cylinder)
  const body = new T.Mesh(G.cyl6, bMat);
  body.scale.set(0.04, 0.45, 0.04);
  group.add(body);

  // Warhead (cone)
  const wh = new T.Mesh(G.cone6, bMat);
  wh.scale.set(0.04, 0.15, 0.04);
  wh.position.y = 0.3;
  group.add(wh);

  // 2 fins (flat boxes, crossed)
  for (let i = 0; i < 2; i++) {
    const fin = new T.Mesh(G.box, bMat);
    fin.scale.set(0.002, 0.12, 0.1);
    fin.position.y = -0.18;
    fin.rotation.y = (i * Math.PI) / 2;
    group.add(fin);
  }

  // Exhaust plume
  const plume = new T.Mesh(G.cone6, M.exhaust as import("three").Material);
  plume.scale.set(0.035, 0.12, 0.035);
  plume.position.y = -0.28;
  plume.rotation.z = Math.PI;
  group.add(plume);

  group.scale.setScalar(0.9);
  return group;
}

/** Aircraft carrier — 6 meshes: hull, bow, deck, island, mast, stripe */
function makeCarrier(T: THREE_t): ThreeObject3D {
  const G = getGeoCache(T) as Record<string, import("three").BufferGeometry>;
  const M = getMatCache(T) as Record<string, import("three").Material>;
  const group = new T.Group();

  // Hull
  const hull = new T.Mesh(G.box, M.dark as import("three").Material);
  hull.scale.set(0.8, 0.07, 0.2);
  group.add(hull);

  // Bow taper
  const bow = new T.Mesh(G.cone4, M.dark as import("three").Material);
  bow.scale.set(0.1, 0.18, 0.1);
  bow.rotation.z = Math.PI / 2;
  bow.position.set(0.48, 0, 0);
  group.add(bow);

  // Flight deck (wider, flat)
  const deck = new T.Mesh(G.box, M.metal as import("three").Material);
  deck.scale.set(0.82, 0.015, 0.26);
  deck.position.y = 0.045;
  group.add(deck);

  // Island superstructure
  const island = new T.Mesh(G.box, M.dark as import("three").Material);
  island.scale.set(0.1, 0.1, 0.06);
  island.position.set(0.15, 0.1, 0.1);
  group.add(island);

  // Mast
  const mast = new T.Mesh(G.cyl4, M.metal as import("three").Material);
  mast.scale.set(0.005, 0.14, 0.005);
  mast.position.set(0.15, 0.22, 0.1);
  group.add(mast);

  // Deck centerline stripe
  const stripe = new T.Mesh(G.box, M.white as import("three").Material);
  stripe.scale.set(0.7, 0.016, 0.008);
  stripe.position.y = 0.055;
  group.add(stripe);

  group.scale.setScalar(1.0);
  return group;
}

/** Fighter jet — 6 meshes: fuselage, nose, canopy, 2 wings (box), exhaust */
function makeFighterJet(T: THREE_t, hexColor = 0x334455): ThreeObject3D {
  const G = getGeoCache(T) as Record<string, import("three").BufferGeometry>;
  const M = getMatCache(T) as Record<string, import("three").Material>;
  const group = new T.Group();
  const jMat = natMat(T, hexColor);

  // Fuselage
  const fus = new T.Mesh(G.cyl6, jMat);
  fus.scale.set(0.03, 0.45, 0.03);
  fus.rotation.x = Math.PI / 2;
  group.add(fus);

  // Nose cone
  const nose = new T.Mesh(G.cone6, jMat);
  nose.scale.set(0.03, 0.14, 0.03);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 0.32;
  group.add(nose);

  // Canopy
  const canopy = new T.Mesh(G.sphere4, M.canopy as import("three").Material);
  canopy.scale.set(0.025, 0.02, 0.045);
  canopy.position.set(0, 0.028, 0.12);
  group.add(canopy);

  // Delta wings (2 flat boxes)
  for (const side of [-1, 1]) {
    const wing = new T.Mesh(G.box, jMat);
    wing.scale.set(side * 0.28, 0.005, 0.14);
    wing.position.set(side * 0.14, -0.003, -0.02);
    group.add(wing);
  }

  // Afterburner exhaust
  const flame = new T.Mesh(G.cone6, M.exhaust as import("three").Material);
  flame.scale.set(0.018, 0.1, 0.018);
  flame.rotation.x = Math.PI / 2;
  flame.position.z = -0.28;
  group.add(flame);

  group.scale.setScalar(1.1);
  return group;
}

/** Military base — 4-6 meshes depending on type */
function makeBase(T: THREE_t, typeKey: string): ThreeObject3D {
  const G = getGeoCache(T) as Record<string, import("three").BufferGeometry>;
  const M = getMatCache(T) as Record<string, import("three").Material>;
  const group = new T.Group();
  const colorHex = parseInt((BASE_COLORS[typeKey] ?? "#F59E0B").replace("#", ""), 16);
  const bMat = baseMat(T, colorHex);

  // Hexagonal platform
  const platform = new T.Mesh(G.flatDisk, bMat);
  platform.scale.set(0.15, 1, 0.15);
  group.add(platform);

  if (typeKey === "nuclear") {
    const dome = new T.Mesh(G.sphere6, bMat);
    dome.scale.set(0.06, 0.06, 0.06);
    dome.position.y = 0.04;
    group.add(dome);
    for (const x of [-0.08, 0.08]) {
      const tower = new T.Mesh(G.cyl6, M.concrete as import("three").Material);
      tower.scale.set(0.035, 0.16, 0.035);
      tower.position.set(x, 0.1, 0.03);
      group.add(tower);
    }
  } else if (typeKey === "naval") {
    const pier = new T.Mesh(G.box, M.concrete as import("three").Material);
    pier.scale.set(0.22, 0.02, 0.04);
    pier.position.y = 0.02;
    group.add(pier);
    const ctrl = new T.Mesh(G.box, bMat);
    ctrl.scale.set(0.06, 0.07, 0.05);
    ctrl.position.set(-0.06, 0.055, 0);
    group.add(ctrl);
  } else if (typeKey === "air") {
    const runway = new T.Mesh(G.box, M.concrete as import("three").Material);
    runway.scale.set(0.3, 0.015, 0.05);
    runway.position.y = 0.02;
    group.add(runway);
    const tower = new T.Mesh(G.cyl4, bMat);
    tower.scale.set(0.015, 0.14, 0.015);
    tower.position.set(0, 0.09, 0.05);
    group.add(tower);
    const hangar = new T.Mesh(G.box, bMat);
    hangar.scale.set(0.07, 0.05, 0.08);
    hangar.position.set(0.06, 0.04, 0.06);
    group.add(hangar);
  } else if (typeKey === "missile") {
    for (const [x, z] of [[0, 0], [-0.06, 0.05], [0.06, 0.05]] as [number, number][]) {
      const silo = new T.Mesh(G.cyl4, M.concrete as import("three").Material);
      silo.scale.set(0.03, 0.03, 0.03);
      silo.position.set(x, 0.025, z);
      group.add(silo);
    }
    const tel = new T.Mesh(G.box, bMat);
    tel.scale.set(0.1, 0.025, 0.03);
    tel.position.set(0, 0.025, -0.06);
    group.add(tel);
  } else if (typeKey === "cyber") {
    const dc = new T.Mesh(G.box, bMat);
    dc.scale.set(0.14, 0.06, 0.1);
    dc.position.y = 0.04;
    group.add(dc);
    const dish = new T.Mesh(G.sphere4, M.radar as import("three").Material);
    dish.scale.set(0.03, 0.03, 0.03);
    dish.position.set(0.06, 0.1, 0);
    group.add(dish);
  } else if (typeKey === "space") {
    const pad = new T.Mesh(G.flatDisk, M.concrete as import("three").Material);
    pad.scale.set(0.06, 1, 0.06);
    pad.position.y = 0.02;
    group.add(pad);
    const rocket = new T.Mesh(G.cyl4, bMat);
    rocket.scale.set(0.012, 0.14, 0.012);
    rocket.position.y = 0.1;
    group.add(rocket);
    const noseCone = new T.Mesh(G.cone4, bMat);
    noseCone.scale.set(0.012, 0.04, 0.012);
    noseCone.position.y = 0.19;
    group.add(noseCone);
  } else {
    const main = new T.Mesh(G.box, bMat);
    main.scale.set(0.09, 0.06, 0.08);
    main.position.y = 0.04;
    group.add(main);
    const antenna = new T.Mesh(G.cyl4, bMat);
    antenna.scale.set(0.004, 0.12, 0.004);
    antenna.position.set(0.04, 0.1, 0);
    group.add(antenna);
  }

  group.scale.setScalar(0.8);
  return group;
}

/** Submarine — 4 meshes: hull, bow, conning tower, propeller hub */
function makeSubmarine(T: THREE_t, hexColor = 0x1a2a3a): ThreeObject3D {
  const G = getGeoCache(T) as Record<string, import("three").BufferGeometry>;
  const group = new T.Group();
  const hMat = natMat(T, hexColor);

  // Hull
  const hull = new T.Mesh(G.cyl6, hMat);
  hull.scale.set(0.04, 0.45, 0.04);
  hull.rotation.z = Math.PI / 2;
  group.add(hull);

  // Bow
  const bow = new T.Mesh(G.sphere4, hMat);
  bow.scale.set(0.04, 0.04, 0.04);
  bow.position.x = 0.22;
  group.add(bow);

  // Conning tower (sail)
  const sail = new T.Mesh(G.box, hMat);
  sail.scale.set(0.07, 0.06, 0.02);
  sail.position.set(0.04, 0.04, 0);
  group.add(sail);

  // Stern taper
  const stern = new T.Mesh(G.cone4, hMat);
  stern.scale.set(0.04, 0.08, 0.04);
  stern.rotation.z = -Math.PI / 2;
  stern.position.x = -0.26;
  group.add(stern);

  group.scale.setScalar(0.9);
  return group;
}

/** SAM Battery — 4 meshes: platform, turntable, tubes (box), radar */
function makeSAMBattery(T: THREE_t, hexColor = 0x556633): ThreeObject3D {
  const G = getGeoCache(T) as Record<string, import("three").BufferGeometry>;
  const M = getMatCache(T) as Record<string, import("three").Material>;
  const group = new T.Group();
  const bMat = natMat(T, hexColor);

  // Platform
  const base = new T.Mesh(G.box, bMat);
  base.scale.set(0.14, 0.02, 0.1);
  base.position.y = 0.01;
  group.add(base);

  // Tubes (angled box)
  const tubes = new T.Mesh(G.box, M.metal as import("three").Material);
  tubes.scale.set(0.05, 0.1, 0.04);
  tubes.position.set(0, 0.06, 0);
  tubes.rotation.z = 0.4;
  group.add(tubes);

  // Radar dish
  const radar = new T.Mesh(G.sphere4, M.radar as import("three").Material);
  radar.scale.set(0.03, 0.03, 0.03);
  radar.position.set(0.05, 0.08, 0);
  group.add(radar);

  // Radar mast
  const mast = new T.Mesh(G.cyl4, M.metal as import("three").Material);
  mast.scale.set(0.005, 0.07, 0.005);
  mast.position.set(0.05, 0.04, 0);
  group.add(mast);

  group.scale.setScalar(0.8);
  return group;
}

// ─── Cinematic Demo Strike Data ────────────────────────────────────
// Pre-seeded realistic strike arcs for demo mode — covers all arc types
// (ballistic, airstrike, drone, cyber, cruise) so all colors animate.
const now = Date.now();
const h = 3_600_000;
const DEMO_STRIKES: StrikeEvent[] = [
  {
    id: "d1",
    type: "ballistic",
    originCoords: [35.7, 51.4],
    targetCoords: [31.8, 35.0],
    targetDescription: "Tel Aviv air defense",
    weapon: "Shahab-3",
    platform: "IRGC",
    timestamp: now - 22 * h,
    country: "IR",
    targetCountry: "IL",
    verified: true,
  },
  {
    id: "d2",
    type: "airstrike",
    originCoords: [31.5, 34.5],
    targetCoords: [33.5, 36.3],
    targetDescription: "Damascus command center",
    weapon: "F-35I",
    platform: "IAF",
    timestamp: now - 21 * h,
    country: "IL",
    targetCountry: "SY",
    verified: true,
  },
  {
    id: "d3",
    type: "ballistic",
    originCoords: [15.4, 44.2],
    targetCoords: [24.7, 46.7],
    targetDescription: "Riyadh Aramco complex",
    weapon: "Badr-1",
    platform: "Houthi",
    timestamp: now - 20 * h,
    country: "YE",
    targetCountry: "SA",
    verified: true,
  },
  {
    id: "d4",
    type: "drone",
    originCoords: [56.0, 37.6],
    targetCoords: [50.4, 30.5],
    targetDescription: "Kyiv power grid",
    weapon: "Shahed-136",
    platform: "RU",
    timestamp: now - 19 * h,
    country: "RU",
    targetCountry: "UA",
    verified: true,
  },
  {
    id: "d5",
    type: "airstrike",
    originCoords: [48.8, 38.5],
    targetCoords: [50.4, 30.5],
    targetDescription: "Kharkiv industrial zone",
    weapon: "Kh-101",
    platform: "Tu-160",
    timestamp: now - 18 * h,
    country: "RU",
    targetCountry: "UA",
    verified: false,
  },
  {
    id: "d6",
    type: "cyber",
    originCoords: [39.9, 116.4],
    targetCoords: [37.6, -122.4],
    targetDescription: "US Pacific Fleet HQ SCADA",
    weapon: "APT41",
    platform: "PLA",
    timestamp: now - 17 * h,
    country: "CN",
    targetCountry: "US",
    verified: false,
  },
  {
    id: "d7",
    type: "ballistic",
    originCoords: [39.0, 125.8],
    targetCoords: [37.5, 127.0],
    targetDescription: "Seoul air base",
    weapon: "Hwasong-15",
    platform: "KPA",
    timestamp: now - 16 * h,
    country: "KP",
    targetCountry: "KR",
    verified: true,
  },
  {
    id: "d8",
    type: "drone",
    originCoords: [35.7, 51.4],
    targetCoords: [26.5, 50.6],
    targetDescription: "Bahrain naval base",
    weapon: "Arash-2",
    platform: "IRGC",
    timestamp: now - 15 * h,
    country: "IR",
    targetCountry: "BH",
    verified: true,
  },
  {
    id: "d9",
    type: "airstrike",
    originCoords: [38.7, -77.0],
    targetCoords: [33.9, 44.3],
    targetDescription: "Baghdad command post",
    weapon: "JASSM-ER",
    platform: "B-52H",
    timestamp: now - 14 * h,
    country: "US",
    targetCountry: "IQ",
    verified: true,
  },
  {
    id: "d10",
    type: "ballistic",
    originCoords: [55.8, 37.6],
    targetCoords: [52.2, 21.0],
    targetDescription: "Warsaw NATO depot",
    weapon: "Iskander-M",
    platform: "RU",
    timestamp: now - 13 * h,
    country: "RU",
    targetCountry: "PL",
    verified: false,
  },
  {
    id: "d11",
    type: "cyber",
    originCoords: [55.8, 37.6],
    targetCoords: [48.8, 2.3],
    targetDescription: "Paris financial network",
    weapon: "Sandworm",
    platform: "GRU",
    timestamp: now - 12 * h,
    country: "RU",
    targetCountry: "FR",
    verified: false,
  },
  {
    id: "d12",
    type: "airstrike",
    originCoords: [35.2, 33.4],
    targetCoords: [33.5, 36.3],
    targetDescription: "Homs munitions depot",
    weapon: "F-16",
    platform: "IDF",
    timestamp: now - 11 * h,
    country: "IL",
    targetCountry: "SY",
    verified: true,
  },
  {
    id: "d13",
    type: "drone",
    originCoords: [39.9, 116.4],
    targetCoords: [35.7, 139.7],
    targetDescription: "Tokyo drone interdiction",
    weapon: "GB-5",
    platform: "PLAAF",
    timestamp: now - 10 * h,
    country: "CN",
    targetCountry: "JP",
    verified: false,
  },
  {
    id: "d14",
    type: "ballistic",
    originCoords: [35.7, 51.4],
    targetCoords: [24.5, 54.4],
    targetDescription: "Abu Dhabi oil terminal",
    weapon: "Zolfaghar",
    platform: "IRGC",
    timestamp: now - 9 * h,
    country: "IR",
    targetCountry: "AE",
    verified: true,
  },
  {
    id: "d15",
    type: "airstrike",
    originCoords: [38.7, -77.0],
    targetCoords: [24.9, 67.0],
    targetDescription: "Karachi port strike",
    weapon: "Tomahawk",
    platform: "USS",
    timestamp: now - 8 * h,
    country: "US",
    targetCountry: "PK",
    verified: false,
  },
  {
    id: "d16",
    type: "drone",
    originCoords: [56.0, 37.6],
    targetCoords: [54.3, 18.6],
    targetDescription: "Gdansk port drones",
    weapon: "Lancet-3",
    platform: "RU",
    timestamp: now - 7 * h,
    country: "RU",
    targetCountry: "PL",
    verified: false,
  },
  {
    id: "d17",
    type: "cyber",
    originCoords: [35.7, 51.4],
    targetCoords: [29.4, 47.9],
    targetDescription: "Kuwait grid intrusion",
    weapon: "Triton",
    platform: "MOIS",
    timestamp: now - 6 * h,
    country: "IR",
    targetCountry: "KW",
    verified: false,
  },
  {
    id: "d18",
    type: "ballistic",
    originCoords: [39.0, 125.8],
    targetCoords: [35.2, 136.9],
    targetDescription: "Nagoya defense plant",
    weapon: "Hwasong-12",
    platform: "KPA",
    timestamp: now - 5 * h,
    country: "KP",
    targetCountry: "JP",
    verified: true,
  },
  {
    id: "d19",
    type: "airstrike",
    originCoords: [50.4, 30.5],
    targetCoords: [55.8, 37.6],
    targetDescription: "Moscow drone swarm",
    weapon: "UJ-22",
    platform: "UAF",
    timestamp: now - 3 * h,
    country: "UA",
    targetCountry: "RU",
    verified: true,
  },
  {
    id: "d20",
    type: "drone",
    originCoords: [15.4, 44.2],
    targetCoords: [15.3, 38.9],
    targetDescription: "Asmara intercept",
    weapon: "Qasif-2",
    platform: "Houthi",
    timestamp: now - 1 * h,
    country: "YE",
    targetCountry: "ER",
    verified: false,
  },
];

// ─── Inject CSS ────────────────────────────────────────────────────

const STYLE_ID = "wt3d-styles";
function injectStyles() {
  if (document.getElementById(STYLE_ID)) { return; }
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = `
    .wt3d-root {
      position: relative; width: 100%; height: 100vh;
      background: #000913; overflow: hidden;
      font-family: 'JetBrains Mono', 'Inter', 'Courier New', monospace;
      user-select: none;
    }
    .wt3d-globe { position: absolute; inset: 0; }

    /* ── Cinematic Overlays ── */
    .wt3d-scanlines {
      position: absolute; inset: 0; pointer-events: none; z-index: 5;
      background: repeating-linear-gradient(
        0deg,
        rgba(0,255,100,0.012) 0px,
        rgba(0,255,100,0.012) 1px,
        transparent 1px,
        transparent 3px
      );
      mix-blend-mode: overlay;
    }
    .wt3d-vignette {
      position: absolute; inset: 0; pointer-events: none; z-index: 5;
      background: radial-gradient(
        ellipse at center,
        transparent 50%,
        rgba(0,0,0,0.6) 100%
      );
    }
    .wt3d-grid-overlay {
      position: absolute; inset: 0; pointer-events: none; z-index: 4;
      background:
        linear-gradient(rgba(56,189,248,0.018) 1px, transparent 1px),
        linear-gradient(90deg, rgba(56,189,248,0.018) 1px, transparent 1px);
      background-size: 60px 60px;
    }

    /* ── HUD Elements ── */
    .wt3d-hud {
      position: absolute; z-index: 10;
      background: rgba(0,8,20,0.85);
      border: 1px solid rgba(56,189,248,0.15);
      border-radius: 8px; backdrop-filter: blur(8px);
      color: #94a3b8; font-size: 10px;
    }
    .wt3d-topbar {
      position: absolute; top: 0; left: 0; right: 0; z-index: 20;
      display: flex; align-items: center; gap: 10px;
      padding: 8px 16px; background: rgba(0,8,20,0.92);
      border-bottom: 1px solid rgba(56,189,248,0.12);
      backdrop-filter: blur(12px);
    }
    .wt3d-btn {
      width: 30px; height: 30px; border-radius: 6px; cursor: pointer;
      background: rgba(56,189,248,0.06); border: 1px solid rgba(56,189,248,0.18);
      color: #38bdf8; display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0;
    }
    .wt3d-btn:hover { background: rgba(56,189,248,0.18); border-color: #38bdf8; }
    .wt3d-btn.active { background: rgba(56,189,248,0.25); border-color: #38bdf8; }

    /* ── Timeline ── */
    .wt3d-timeline {
      position: absolute; bottom: 0; left: 0; right: 0; z-index: 20;
      padding: 8px 16px 12px;
      background: linear-gradient(0deg, rgba(0,8,20,0.95) 0%, rgba(0,8,20,0.7) 100%);
      border-top: 1px solid rgba(56,189,248,0.1);
      backdrop-filter: blur(12px);
    }
    .wt3d-slider {
      -webkit-appearance: none; width: 100%; height: 4px;
      background: rgba(56,189,248,0.15); border-radius: 2px;
      outline: none; cursor: pointer;
    }
    .wt3d-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 14px; height: 14px;
      border-radius: 50%; background: #38bdf8;
      border: 2px solid #0f172a; cursor: pointer;
      box-shadow: 0 0 8px rgba(56,189,248,0.5);
    }
    .wt3d-slider::-moz-range-thumb {
      width: 14px; height: 14px; border-radius: 50%; background: #38bdf8;
      border: 2px solid #0f172a; cursor: pointer;
    }
    .wt3d-volume-slider {
      -webkit-appearance: none; width: 80px; height: 3px;
      background: rgba(56,189,248,0.2); border-radius: 2px;
      outline: none; cursor: pointer;
    }
    .wt3d-volume-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 10px; height: 10px;
      border-radius: 50%; background: #38bdf8; cursor: pointer;
    }
    .wt3d-volume-slider::-moz-range-thumb {
      width: 10px; height: 10px; border-radius: 50%;
      background: #38bdf8; cursor: pointer;
    }

    /* ── HUD-level blink only (NOT wt3d-particle — removed full 60fps CSS animation) ── */
    .wt3d-live { animation: wt3d-blink 2s ease-in-out infinite; }
    @keyframes wt3d-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .wt3d-fade-in { animation: wt3d-fadein 0.6s ease-out; }
    @keyframes wt3d-fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }

    /* ── Tooltip ── */
    .wt3d-tooltip {
      position: absolute; z-index: 30; pointer-events: none;
      background: rgba(0,8,20,0.95); border: 1px solid rgba(56,189,248,0.3);
      color: #e2e8f0; font-size: 11px; padding: 6px 10px; border-radius: 6px;
      white-space: nowrap; max-width: 300px; backdrop-filter: blur(8px);
      opacity: 0; transition: opacity 0.1s;
    }
    .wt3d-tooltip.visible { opacity: 1; }

    /* ── Static particles (no animation — pure cosmetic dots) ── */
    .wt3d-particle {
      position: absolute; border-radius: 50%; pointer-events: none;
      /* No animation — CSS animation + WebGL causes compositor overload */
    }
  `;
  document.head.appendChild(el);
}

// ─── Particle Field ────────────────────────────────────────────────
// Reduced from 40 to 15 particles; static dots only (no CPU animation).
// Seeded at module load (not inside render) to satisfy purity rules.

const PARTICLES = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  left: (i * 7.3 + 3) % 100, // deterministic spread
  top: (i * 13.7 + 11) % 100,
  size: 1 + (i % 3) * 0.8,
  color: i % 3 === 0 ? "rgba(56,189,248,0.25)" : "rgba(100,116,139,0.15)",
}));

const ParticleField = memo(function ParticleField() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="wt3d-particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.color,
          }}
        />
      ))}
    </div>
  );
});

// ─── Audio Panel ───────────────────────────────────────────────────

function AudioPanel({
  audio,
  expanded,
  onToggle,
}: {
  audio: ReturnType<typeof useWarAudio>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="wt3d-hud" style={{ right: 12, top: 56 }}>
      <button
        type="button"
        className="wt3d-btn"
        style={{ width: expanded ? "100%" : 30, borderRadius: expanded ? "8px 8px 0 0" : 8 }}
        onClick={() => {
          audio.unlock();
          onToggle();
        }}
        title="Audio Controls"
      >
        {audio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      {expanded && (
        <div
          className="wt3d-fade-in"
          style={{
            padding: "8px 10px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            minWidth: 160,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "#64748b", width: 50 }}>Master</span>
            <input
              type="range"
              className="wt3d-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={audio.masterVolume}
              onChange={(e) => audio.setMasterVolume(Number(e.target.value))}
            />
            <span style={{ fontSize: 9, color: "#4a6a8a", width: 24 }}>
              {Math.round(audio.masterVolume * 100)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "#64748b", width: 50 }}>Ambient</span>
            <input
              type="range"
              className="wt3d-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={audio.ambientVolume}
              onChange={(e) => audio.setAmbientVolume(Number(e.target.value))}
            />
            <span style={{ fontSize: 9, color: "#4a6a8a", width: 24 }}>
              {Math.round(audio.ambientVolume * 100)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 9, color: "#64748b", width: 50 }}>SFX</span>
            <input
              type="range"
              className="wt3d-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={audio.sfxVolume}
              onChange={(e) => audio.setSfxVolume(Number(e.target.value))}
            />
            <span style={{ fontSize: 9, color: "#4a6a8a", width: 24 }}>
              {Math.round(audio.sfxVolume * 100)}
            </span>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
            <button
              type="button"
              className="wt3d-btn"
              style={{ width: 24, height: 24 }}
              onClick={audio.toggleMute}
              title="Mute"
            >
              {audio.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
            </button>
            <button
              type="button"
              className="wt3d-btn"
              style={{ width: 24, height: 24 }}
              onClick={audio.playRadarPing}
              title="Test Ping"
            >
              <Radio size={10} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Timeline Bar ──────────────────────────────────────────────────

function TimelineBar({
  playing,
  onPlayPause,
  position,
  onSeek,
  speed,
  onSpeedChange,
  currentTime,
  duration,
}: {
  playing: boolean;
  onPlayPause: () => void;
  position: number; // 0–1
  onSeek: (pos: number) => void;
  speed: number;
  onSpeedChange: (s: number) => void;
  currentTime: string;
  duration: string;
}) {
  return (
    <div className="wt3d-timeline">
      {/* Slider */}
      <input
        type="range"
        className="wt3d-slider"
        min={0}
        max={1}
        step={0.001}
        value={position}
        onChange={(e) => onSeek(Number(e.target.value))}
        style={{ marginBottom: 6 }}
      />
      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Transport */}
        <button
          type="button"
          className="wt3d-btn"
          style={{ width: 26, height: 26 }}
          onClick={() => onSeek(Math.max(0, position - 0.05))}
          title="Skip Back"
        >
          <SkipBack size={12} />
        </button>
        <button
          type="button"
          className="wt3d-btn"
          style={{ width: 32, height: 32 }}
          onClick={onPlayPause}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          type="button"
          className="wt3d-btn"
          style={{ width: 26, height: 26 }}
          onClick={() => onSeek(Math.min(1, position + 0.05))}
          title="Skip Forward"
        >
          <SkipForward size={12} />
        </button>

        {/* Time display */}
        <span
          style={{
            fontSize: 10,
            color: "#38bdf8",
            fontFamily: "monospace",
            letterSpacing: 1,
            minWidth: 110,
          }}
        >
          {currentTime} / {duration}
        </span>

        <div style={{ flex: 1 }} />

        {/* Speed */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 9, color: "#4a6a8a" }}>Speed:</span>
          {SPEED_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`wt3d-btn ${speed === s ? "active" : ""}`}
              style={{ width: 24, height: 22, fontSize: 9 }}
              onClick={() => onSpeedChange(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ───────────────────────────────────────────

export function WarTheater3DPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  // State
  const [ready, setReady] = useState(false);
  const [layer, setLayer] = useState<"dark" | "satellite" | "terrain">("dark");
  const [autoRotate, setAutoRotate] = useState(true);
  const [audioExpanded, setAudioExpanded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // Timeline state
  const [playing, setPlaying] = useState(false);
  const [timePosition, setTimePosition] = useState(0); // 0–1
  const [speed, setSpeed] = useState(1);
  const animFrameRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const lastStateUpdateRef = useRef<number>(0); // throttle setState calls
  const timePositionRef = useRef(0); // authoritative position — updated every frame
  const shouldStopRef = useRef(false);

  // Timer cleanup tracking
  const explosionTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Audio
  const audio = useWarAudio();

  // ── RPC Data ──
  const { data: basesData } = useRpc<{ bases: MilitaryBase[] }>("republic.wartheater.bases", {});
  const { data: carriersData } = useRpc<{ carriers: CarrierGroup[] }>(
    "republic.wartheater.carriers",
    {},
  );
  const { data: strikesData } = useRpc<{ strikes: StrikeEvent[] }>("republic.wartheater.strikes", {
    limit: 100,
  });
  const { data: overviewData } = useRpc<{
    stats: {
      totalBases: number;
      totalCarriers: number;
      deployedCarriers: number;
      totalStrikes: number;
    };
    warRisks: WarRisk[];
    warSignals: unknown[];
  }>("republic.wartheater.overview", {});
  const { data: theatersData } = useRpc<{ theaters: TheaterConfig[] }>(
    "republic.wartheater.theaters",
    {},
  );

  const bases = basesData?.bases ?? [];
  const carriers = carriersData?.carriers ?? [];
  // In demo mode, use pre-seeded cinematic strike data so arcs/rings/audio animate immediately.
  const strikes = demoMode ? DEMO_STRIKES : (strikesData?.strikes ?? []);
  const theaters = theatersData?.theaters ?? [];
  const stats = overviewData?.stats;
  const warRisks = overviewData?.warRisks ?? [];

  // ── Derived points and arcs ──
  const allPoints = useMemo(() => {
    const pts: Array<{
      lat: number;
      lng: number;
      color: string;
      radius: number;
      alt: number;
      label: string;
      group: string;
      baseType: string; // base.type — drives 3D model factory dispatch
      country: string; // ISO country code — drives nation-color coding
    }> = [];

    for (const b of bases) {
      const color = BASE_COLORS[b.type] ?? "#F59E0B";
      pts.push({
        lat: b.lat,
        lng: b.lng,
        color,
        radius: b.personnel ? Math.min(0.4 + (b.personnel / 80000) * 0.5, 0.9) : 0.4,
        alt: 0.01,
        label: `${FLAG_MAP[b.country] ?? ""} ${b.name} (${b.type})`,
        group: "base",
        baseType: b.type,
        country: b.country,
      });
    }

    for (const c of carriers) {
      const isDeployed = c.status === "deployed";
      pts.push({
        lat: c.lat,
        lng: c.lng,
        color: isDeployed ? "#38BDF8" : "#475569",
        radius: 0.5,
        alt: isDeployed ? 0.02 : 0.01,
        label: `${FLAG_MAP[c.country] ?? ""} ${c.name} (${c.hullNumber}) — ${c.status}`,
        group: "carrier",
        baseType: "naval",
        country: c.country,
      });
    }

    return pts;
  }, [bases, carriers]);

  // Sorted strikes — expensive sort done once, not inside the filtered memo
  const sortedStrikes = useMemo(
    () => [...strikes].toSorted((a, b) => a.timestamp - b.timestamp),
    [strikes],
  );

  // Timeline-filtered arcs — capped at 30 for GPU performance
  const visibleArcs = useMemo(() => {
    if (sortedStrikes.length === 0) { return []; }
    if (!playing && timePosition === 0) {
      return sortedStrikes.length > 30 ? sortedStrikes.slice(-30) : sortedStrikes;
    }
    const minTs = sortedStrikes[0]?.timestamp ?? 0;
    const maxTs = sortedStrikes[sortedStrikes.length - 1]?.timestamp ?? Date.now();
    const range = maxTs - minTs || 1;
    const cutoff = minTs + range * timePosition;
    const filtered = sortedStrikes.filter((s) => s.timestamp <= cutoff);
    return filtered.length > 30 ? filtered.slice(-30) : filtered;
  }, [sortedStrikes, timePosition, playing]);

  // Rings at conflict zones — cap at 15 (rings are GPU-heavy with propagation)
  const ringData = useMemo(() => {
    const rings = visibleArcs.map((s) => ({
      lat: s.targetCoords[0],
      lng: s.targetCoords[1],
      color: "#EF4444",
    }));
    return rings.length > 15 ? rings.slice(-15) : rings;
  }, [visibleArcs]);

  // ── 3D Objects layer — replace primitive dots with cinematic military models ──
  // Also injects styles on first mount.
  const threeRef = useRef<THREE_t | null>(null);
  useEffect(() => {
    injectStyles();
  }, []);
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready || allPoints.length === 0) { return; }

    const buildObjects = (T: THREE_t) => {
      // Clear primitive points layer
      g.pointsData([]);

      // Country color hex map for jets/missiles by nation
      const nationColor: Record<string, number> = {
        US: 0x1a3a6a,
        RU: 0x8b1a1a,
        CN: 0xcc2200,
        GB: 0x003399,
        FR: 0x0033aa,
        IL: 0x2255cc,
        IR: 0x226622,
        KP: 0x991111,
        PK: 0x226644,
        SA: 0x228822,
        TR: 0xaa3311,
        DE: 0x334455,
        JP: 0xcc2233,
        KR: 0x002244,
        AU: 0x003366,
        UA: 0x224499,
      };

      // Add enhanced lighting to scene (once)
      const scene = g.scene();
      if (scene && !(scene as unknown as Record<string, boolean>).__hocLit) {
        (scene as unknown as Record<string, boolean>).__hocLit = true;
        const hemi = new T.HemisphereLight(0x4488cc, 0x222244, 0.6);
        scene.add(hemi as unknown as Parameters<typeof scene.add>[0]);
        const amb = new T.AmbientLight(0x334466, 0.4);
        scene.add(amb as unknown as Parameters<typeof scene.add>[0]);
      }

      // Cap at 40 objects for GPU performance
      const capped = allPoints.length > 40 ? allPoints.slice(0, 40) : allPoints;
      const objectData = capped.map((pt) => {
        const natHex = nationColor[pt.country as string] ?? 0x445566;
        // Each point gets a pre-built Three.js group from a factory
        let obj: ThreeObject3D;
        if (pt.group === "carrier") {
          obj = makeCarrier(T);
        } else if (pt.baseType === "air") {
          obj = makeFighterJet(T, natHex);
        } else if (pt.baseType === "naval") {
          obj = makeSubmarine(T, natHex);
        } else if (pt.baseType === "missile" || pt.baseType === "nuclear") {
          obj = makeMissile(T, natHex);
        } else if (pt.baseType === "army") {
          obj = makeSAMBattery(T, natHex);
        } else {
          obj = makeBase(T, pt.baseType ?? "joint");
        }
        return { ...pt, _threeObj: obj };
      });

      type ObjPt = (typeof objectData)[0];
      g.objectsData(objectData)
        .objectLat((d: unknown) => (d as ObjPt).lat)
        .objectLng((d: unknown) => (d as ObjPt).lng)
        .objectAltitude((d: unknown) => (d as ObjPt).alt)
        .objectThreeObject((d: unknown) => (d as ObjPt)._threeObj)
        .objectLabel((d: unknown) => (d as ObjPt).label);
    };

    if (threeRef.current) {
      buildObjects(threeRef.current);
    } else {
      import("three")
        .then((T) => {
          threeRef.current = T;
          buildObjects(T);
        })
        .catch(console.error);
    }
  }, [allPoints, ready]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) { return; }
    let mounted = true;

    import("globe.gl")
      .then((mod) => {
        if (!mounted || !el) { return; }
        const Globe = (mod as { default: unknown }).default as new (
          container: HTMLElement,
        ) => GlobeInstance;

        const w = el.offsetWidth || window.innerWidth;
        const h = el.offsetHeight || window.innerHeight;

        const globe = new Globe(el)
          .width(w)
          .height(h)
          .backgroundColor("rgba(0,0,0,0)")
          .atmosphereColor("#1a4a7a")
          .atmosphereAltitude(0.2)
          .globeTileEngineUrl(TILE_URLS.dark);

        // Orbit controls
        const controls = globe.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.3;
        controls.enableZoom = true;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;

        // Initial camera
        globe.pointOfView({ lat: 30, lng: 40, altitude: 2.2 }, 0);

        // Resize observer — throttled to avoid calling width/height every frame
        const ro = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) { globe.width(entry.contentRect.width).height(entry.contentRect.height); }
        });
        ro.observe(el);
        roRef.current = ro;

        // Tooltip is rendered natively by globe.gl via the pointLabel accessor.
        // Do NOT add onPointHover — it forces Three.js raycasting on every mousemove
        // event across ALL point geometries, which freezes the page with 200+ points.
        // globe.gl's built-in pointLabel tooltip uses its own efficient hover path.

        globeRef.current = globe;
        setReady(true);
      })
      .catch(console.error);

    return () => {
      mounted = false;

      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }

      const timersToCancel = explosionTimersRef.current;
      for (const t of timersToCancel) { clearTimeout(t); }
      timersToCancel.clear();

      const globe = globeRef.current;
      if (globe) {
        try {
          globe.pointsData([]).arcsData([]).ringsData([]);

          const scene = globe.scene();
          if (scene && Array.isArray(scene.children)) {
            const disposeObj = (obj: unknown) => {
              const o = obj as {
                geometry?: { dispose?: () => void };
                material?:
                  | { dispose?: () => void; map?: { dispose?: () => void } }
                  | Array<{ dispose?: () => void; map?: { dispose?: () => void } }>;
                children?: unknown[];
              };
              o.geometry?.dispose?.();
              if (Array.isArray(o.material)) {
                for (const m of o.material) {
                  m.map?.dispose?.();
                  m.dispose?.();
                }
              } else if (o.material) {
                o.material.map?.dispose?.();
                o.material.dispose?.();
              }
              if (Array.isArray(o.children)) {
                for (const child of o.children) { disposeObj(child); }
              }
            };
            for (const child of scene.children) { disposeObj(child); }
          }

          const renderer = (
            globe as unknown as {
              renderer?: () => {
                dispose?: () => void;
                forceContextLoss?: () => void;
                domElement?: HTMLElement;
              };
            }
          ).renderer?.();
          if (renderer) {
            renderer.dispose?.();
            renderer.forceContextLoss?.();
            renderer.domElement?.remove();
          }
        } catch {
          // Best-effort cleanup
        }
        globeRef.current = null;
      }

      if (el) { el.innerHTML = ""; }
    };
  }, []); // globe.gl init — exhaustive deps intentionally omitted (single-init pattern)

  // ── pointsData REMOVED — objectsData already renders 3D models at the same coordinates.
  // Having both active caused double-rendering: sphere geometry + full 3D models = 2× GPU cost.
  // Labels are handled by objectLabel() on the objectsData layer.

  // ── Update arcs ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) { return; }

    g.arcsData(visibleArcs)
      .arcStartLat((d: unknown) => (d as StrikeEvent).originCoords[0])
      .arcStartLng((d: unknown) => (d as StrikeEvent).originCoords[1])
      .arcEndLat((d: unknown) => (d as StrikeEvent).targetCoords[0])
      .arcEndLng((d: unknown) => (d as StrikeEvent).targetCoords[1])
      .arcColor((d: unknown) => {
        const t = (d as StrikeEvent).type;
        if (t === "ballistic" || t === "missile") { return ["#EF4444", "#FF6B6B"]; }
        if (t === "airstrike") { return ["#F59E0B", "#FCD34D"]; }
        if (t === "drone") { return ["#8B5CF6", "#C084FC"]; }
        if (t === "cyber") { return ["#06B6D4", "#67E8F9"]; }
        return ["#EF4444", "#F87171"];
      })
      .arcAltitude((d: unknown) => {
        const t = (d as StrikeEvent).type;
        return t === "ballistic" ? 0.6 : t === "airstrike" ? 0.35 : 0.2;
      })
      .arcStroke(0.6)
      .arcDashLength(0.4)
      .arcDashGap(0.15)
      // Raised from 2500→4000ms: slower dash animation = fewer GPU fragment shader recalcs
      .arcDashAnimateTime(4000)
      .arcLabel((d: unknown) => {
        const s = d as StrikeEvent;
        return `${FLAG_MAP[s.country] ?? ""} → ${FLAG_MAP[s.targetCountry] ?? ""}: ${s.targetDescription}`;
      });
  }, [visibleArcs, ready]);

  // ── Update rings ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) { return; }

    g.ringsData(ringData)
      .ringLat((d: unknown) => (d as { lat: number }).lat)
      .ringLng((d: unknown) => (d as { lng: number }).lng)
      .ringColor(() => "rgba(239,68,68,0.6)")
      .ringMaxRadius(3)
      .ringPropagationSpeed(2)
      // Raised from 1000→1800ms: slower ring expansion = less GPU work per frame
      .ringRepeatPeriod(1800);
  }, [ringData, ready]);

  // ── Update tile layer ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !ready) { return; }
    g.globeTileEngineUrl(TILE_URLS[layer]);
  }, [layer, ready]);

  // ── Auto-rotate toggle ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g) { return; }
    const c = g.controls();
    c.autoRotate = autoRotate;
  }, [autoRotate]);

  // ── Timeline animation loop ──
  // CRITICAL FIX: setState throttled to max ~10fps (150ms intervals).
  // timePositionRef is the authoritative value updated every RAF frame.
  // React state (timePosition) is synced at 150ms intervals only,
  // which drives the useMemo for visibleArcs — not the globe render itself.
  useEffect(() => {
    if (!playing) { return; }
    shouldStopRef.current = false;

    const animate = (time: number) => {
      if (shouldStopRef.current) {
        setPlaying(false);
        return;
      }
      if (lastFrameRef.current === 0) { lastFrameRef.current = time; }
      const delta = (time - lastFrameRef.current) / 1000;
      lastFrameRef.current = time;

      const next = Math.min(1, timePositionRef.current + (delta * speed) / 120);
      timePositionRef.current = next;

      // Throttle React state updates to ~10fps so useMemo doesn't run at 60fps
      if (time - lastStateUpdateRef.current > 150) {
        lastStateUpdateRef.current = time;
        setTimePosition(next);
        if (next >= 1) {
          shouldStopRef.current = true;
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    lastFrameRef.current = 0;
    lastStateUpdateRef.current = 0;
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      shouldStopRef.current = false;
    };
  }, [playing, speed]);

  // ── Fire SFX when new arcs appear ──
  // CRITICAL FIX: depends on stable individual callbacks, NOT the `audio` object.
  // The `audio` object reference changes each render, causing this effect to re-run
  // constantly and creating duplicate radar interval listeners.
  const lastArcCountRef = useRef(0);
  useEffect(() => {
    if (visibleArcs.length > lastArcCountRef.current && audio.unlocked) {
      audio.playMissileLaunch();
      const timer = setTimeout(() => {
        audio.playExplosion();
        explosionTimersRef.current.delete(timer);
      }, 1500);
      explosionTimersRef.current.add(timer);
    }
    lastArcCountRef.current = visibleArcs.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleArcs.length, audio.unlocked, audio.playMissileLaunch, audio.playExplosion]);

  // ── Camera helpers ──
  const flyTo = useCallback(
    (lat: number, lng: number, alt = 1.5) => {
      globeRef.current?.pointOfView({ lat, lng, altitude: alt }, 1500);
      audio.unlock();
      audio.playSonarSweep();
    },
    [audio],
  );

  const formatTime = useCallback((pos: number) => {
    const totalMinutes = Math.floor(pos * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }, []);

  // ── Render ──
  return (
    <div className="wt3d-root" onClick={() => audio.unlock()}>
      {/* Globe Container */}
      <div ref={containerRef} className="wt3d-globe" />

      {/* Cinematic Overlays */}
      <div className="wt3d-scanlines" />
      <div className="wt3d-vignette" />
      <div className="wt3d-grid-overlay" />
      <ParticleField />

      {/* ── Top Bar ── */}
      <div className="wt3d-topbar">
        <Crosshair size={16} style={{ color: "#EF4444" }} />
        <span style={{ color: "#EF4444", fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>
          3D WAR THEATER
        </span>
        <span style={{ color: "#1a4a6a" }}>│</span>
        <span style={{ fontSize: 10, color: "#4a6a8a" }}>Cinematic Intelligence View</span>

        {/* Layer switcher */}
        <div style={{ display: "flex", gap: 4, marginLeft: 16 }}>
          {(["dark", "satellite", "terrain"] as const).map((l) => (
            <button
              key={l}
              type="button"
              className={`wt3d-btn ${layer === l ? "active" : ""}`}
              style={{ width: "auto", padding: "0 8px", height: 24, fontSize: 9 }}
              onClick={() => setLayer(l)}
            >
              {l === "dark" ? "Dark" : l === "satellite" ? "Satellite" : "Terrain"}
            </button>
          ))}
        </div>

        {/* Demo Mode toggle — loads 20 pre-seeded cinematic strike arcs */}
        <button
          type="button"
          className={`wt3d-btn ${demoMode ? "active" : ""}`}
          style={{
            width: "auto",
            padding: "0 10px",
            height: 24,
            fontSize: 9,
            marginLeft: 8,
            color: demoMode ? "#22C55E" : "#EF4444",
            borderColor: demoMode ? "#22C55E" : "#EF444466",
            background: demoMode ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.08)",
          }}
          onClick={() => {
            const next = !demoMode;
            setDemoMode(next);
            if (next) {
              // Auto-reset position and play to show cinematic arcs
              setTimePosition(0);
              timePositionRef.current = 0;
              setPlaying(true);
            } else {
              setPlaying(false);
            }
          }}
        >
          {demoMode ? "◉ DEMO ON" : "▶ DEMO"}
        </button>

        <div style={{ flex: 1 }} />

        {/* Stats */}
        <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#4a6a8a" }}>
          <span>🏗️ {stats?.totalBases ?? "—"} BASES</span>
          <span>⚓ {stats?.totalCarriers ?? "—"} CARRIERS</span>
          <span>💥 {visibleArcs.length} STRIKES</span>
          <span>⚠ {warRisks.length} RISKS</span>
        </div>
        <span className="wt3d-live" style={{ fontSize: 9, color: "#22C55E", marginLeft: 8 }}>
          ● LIVE
        </span>
        {!ready && <span style={{ fontSize: 9, color: "#fbbf24" }}>Loading 3D engine…</span>}
      </div>

      {/* ── Right Control Panel ── */}
      <div
        className="wt3d-hud"
        style={{
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          padding: "6px 4px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <button
          type="button"
          className="wt3d-btn"
          title="Zoom In"
          onClick={() => globeRef.current?.controls().dollyIn?.(1.3)}
        >
          <ZoomIn size={14} />
        </button>
        <button
          type="button"
          className="wt3d-btn"
          title="Zoom Out"
          onClick={() => globeRef.current?.controls().dollyOut?.(1.3)}
        >
          <ZoomOut size={14} />
        </button>
        <button
          type="button"
          className={`wt3d-btn ${autoRotate ? "active" : ""}`}
          title="Auto-Rotate"
          onClick={() => setAutoRotate((r) => !r)}
        >
          <RotateCcw size={14} />
        </button>
        <button
          type="button"
          className="wt3d-btn"
          title="Cycle Layer"
          onClick={() =>
            setLayer((l) => (l === "dark" ? "satellite" : l === "satellite" ? "terrain" : "dark"))
          }
        >
          <Layers size={14} />
        </button>
        <button
          type="button"
          className="wt3d-btn"
          title="Reset View"
          onClick={() => flyTo(30, 40, 2.2)}
        >
          <Maximize size={14} />
        </button>
        <div
          style={{ width: "100%", height: 1, background: "rgba(56,189,248,0.1)", margin: "2px 0" }}
        />
        <GlobeIcon size={14} style={{ color: "#4a6a8a", margin: "0 auto" }} />
      </div>

      {/* ── Audio Panel ── */}
      <AudioPanel
        audio={audio}
        expanded={audioExpanded}
        onToggle={() => setAudioExpanded((e) => !e)}
      />

      {/* ── Left Sidebar — Theaters & War Risks ── */}
      <div
        className="wt3d-hud wt3d-fade-in"
        style={{
          left: sidebarOpen ? 12 : -220,
          top: 56,
          width: 200,
          padding: "10px 12px",
          transition: "left 0.3s ease",
          maxHeight: "calc(100vh - 160px)",
          overflowY: "auto",
        }}
      >
        {/* Toggle button */}
        <button
          type="button"
          className="wt3d-btn"
          style={{
            position: "absolute",
            right: -32,
            top: 8,
            width: 24,
            height: 24,
          }}
          onClick={() => setSidebarOpen((s) => !s)}
        >
          {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
        </button>

        {/* Theater Quick Links */}
        <div
          style={{
            fontSize: 8,
            color: "#4a6a8a",
            letterSpacing: 1,
            marginBottom: 6,
            textTransform: "uppercase",
          }}
        >
          Theaters
        </div>
        {theaters.map((t) => (
          <button
            key={t.name}
            type="button"
            style={{
              display: "block",
              width: "100%",
              background: "none",
              border: "none",
              color: "#64748b",
              fontSize: 10,
              textAlign: "left",
              padding: "3px 0",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.target as HTMLElement).style.color = "#38bdf8";
            }}
            onMouseLeave={(e) => {
              (e.target as HTMLElement).style.color = "#64748b";
            }}
            onClick={() => flyTo(t.center[0], t.center[1], 1.5)}
          >
            → {t.name}
          </button>
        ))}

        <div
          style={{ width: "100%", height: 1, background: "rgba(56,189,248,0.1)", margin: "8px 0" }}
        />

        {/* War Risks */}
        <div
          style={{
            fontSize: 8,
            color: "#4a6a8a",
            letterSpacing: 1,
            marginBottom: 6,
            textTransform: "uppercase",
          }}
        >
          War Risk Index
        </div>
        {warRisks.slice(0, 8).map((r) => (
          <button
            key={r.country}
            type="button"
            style={{
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: 6,
              background: "none",
              border: "none",
              color: "#94a3b8",
              fontSize: 10,
              padding: "2px 0",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
            onClick={() => {
              const base = bases.find(
                (b) => b.country === r.country || b.hostCountry === r.country,
              );
              if (base) { flyTo(base.lat, base.lng, 1.8); }
            }}
          >
            <span>{FLAG_MAP[r.country] ?? "🏳️"}</span>
            <span
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {r.countryName}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: r.score >= 70 ? "#EF4444" : r.score >= 40 ? "#F59E0B" : "#22C55E",
              }}
            >
              {r.score}
            </span>
            {r.escalating && <span style={{ fontSize: 8 }}>⚡</span>}
          </button>
        ))}

        <div
          style={{ width: "100%", height: 1, background: "rgba(56,189,248,0.1)", margin: "8px 0" }}
        />

        {/* Legend */}
        <div
          style={{
            fontSize: 8,
            color: "#4a6a8a",
            letterSpacing: 1,
            marginBottom: 6,
            textTransform: "uppercase",
          }}
        >
          Legend
        </div>
        {Object.entries(BASE_COLORS).map(([type, color]) => (
          <div
            key={type}
            style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 4px ${color}60`,
              }}
            />
            <span style={{ fontSize: 9, color: "#64748b", textTransform: "capitalize" }}>
              {type} Base
            </span>
          </div>
        ))}
        <div
          style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, marginTop: 4 }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#38BDF8" }} />
          <span style={{ fontSize: 9, color: "#64748b" }}>Carrier (deployed)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          <div
            style={{
              width: 20,
              height: 2,
              borderRadius: 1,
              background: "linear-gradient(90deg, #EF4444, #F87171)",
            }}
          />
          <span style={{ fontSize: 9, color: "#64748b" }}>Missile Arc</span>
        </div>
      </div>

      {/* Tooltip rendered natively by globe.gl via pointLabel — no custom DOM element needed */}

      {/* ── Timeline Bar ── */}
      <TimelineBar
        playing={playing}
        onPlayPause={() => {
          setPlaying((p) => !p);
          audio.unlock();
        }}
        position={timePosition}
        onSeek={(pos) => {
          setTimePosition(pos);
          timePositionRef.current = pos;
        }}
        speed={speed}
        onSpeedChange={setSpeed}
        currentTime={formatTime(timePosition)}
        duration="24:00"
      />
    </div>
  );
}
