/**
 * OSINT GEOINT — Geospatial Intelligence Data Pipeline
 *
 * Real-time tracking of military and strategic assets:
 * - ADS-B Exchange — Aircraft tracking (military flights, recon, tankers)
 * - AIS (Automatic Identification System) — Ship tracking (naval, cargo)
 *
 * Events auto-correlate with war-theater data and CII scoring.
 * Data published to Intelligence Bus for citizen analysis.
 */

import { uid, ts } from "./utils.js";
import { intelligenceBus } from "./intelligence-bus.js";

// ─── Types ──────────────────────────────────────────────────────

export interface TrackedAircraft {
  id: string;
  /** ICAO hex code */
  icao: string;
  /** Callsign */
  callsign: string;
  /** Aircraft type (e.g., "KC-135", "E-3", "F-35") */
  type?: string;
  /** Country of registration */
  country: string;
  /** Is this a military aircraft? */
  military: boolean;
  /** Current position */
  position: { lat: number; lon: number; alt: number };
  /** Speed in knots */
  speed: number;
  /** Heading in degrees */
  heading: number;
  /** Squawk code */
  squawk?: string;
  /** Whether this aircraft has been flagged as intel-relevant */
  flagged: boolean;
  /** Last seen timestamp */
  lastSeen: string;
  /** Track history */
  trackHistory: Array<{ lat: number; lon: number; alt: number; time: string }>;
}

export interface TrackedVessel {
  id: string;
  /** MMSI (Maritime Mobile Service Identity) */
  mmsi: string;
  /** Vessel name */
  name: string;
  /** Vessel type */
  type: string;
  /** Flag state */
  flag: string;
  /** Is this a naval/military vessel? */
  military: boolean;
  /** Current position */
  position: { lat: number; lon: number };
  /** Speed over ground in knots */
  speed: number;
  /** Course over ground in degrees */
  course: number;
  /** Destination */
  destination?: string;
  /** Status */
  navStatus: string;
  /** Intel relevance flag */
  flagged: boolean;
  /** Last seen */
  lastSeen: string;
  /** Track history */
  trackHistory: Array<{ lat: number; lon: number; time: string }>;
}

export interface GEOINTConfig {
  adsbApiKey?: string;
  adsbApiUrl?: string;
  aisApiKey?: string;
  aisApiUrl?: string;
  pollIntervalSec: number;
  enabled: boolean;
}

// ─── State ──────────────────────────────────────────────────────

const trackedAircraft: TrackedAircraft[] = [];
const trackedVessels: TrackedVessel[] = [];
const MAX_TRACKED = 500;
let geointConfig: GEOINTConfig = { pollIntervalSec: 120, enabled: false };
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ─── Military Aircraft Identification ───────────────────────────

const MILITARY_CALLSIGN_PREFIXES = [
  "RCH", "REACH", // USAF C-17/C-5 (logistics)
  "RRR", "REAPER", // USAF tankers
  "NATO", "AWACS", // NATO AWACS
  "FORTE", // RQ-4 Global Hawk
  "DUKE", // C-130 special ops
  "JAKE", "HOMER", // USAF reconnaissance
  "VIPER", "COBRA", // Fighter callsigns
  "RIVET", // RC-135 signals intel
  "LAGR", // KC-135 tankers
  "SAM", // Special Air Mission
  "CNV", // US Navy
  "NAVY", // General navy
  "TOPCAT", "IRON", "STEEL",
  "RAF", // Royal Air Force
  "RFR", // French Air Force
  "GAF", // German Air Force
  "IAF", // Israeli Air Force
  "TUAF", // Turkish Air Force
  "RSD", // Russian military
  "CFC", // Chinese military
];

const MILITARY_SQUAWKS = new Set(["7777", "7700", "7600", "7500", "1200", "0000"]);

function isMilitaryCallsign(callsign: string): boolean {
  const upper = callsign.toUpperCase().trim();
  return MILITARY_CALLSIGN_PREFIXES.some((p) => upper.startsWith(p));
}

const MILITARY_VESSEL_TYPES = [
  "warship", "destroyer", "frigate", "cruiser", "submarine",
  "aircraft carrier", "amphibious", "patrol", "corvette",
  "minesweeper", "supply ship", "tanker/fleet",
];

function isMilitaryVessel(type: string): boolean {
  const lower = type.toLowerCase();
  return MILITARY_VESSEL_TYPES.some((t) => lower.includes(t));
}

// ─── ADS-B Exchange Integration ─────────────────────────────────

async function pollADSB(): Promise<void> {
  if (!geointConfig.adsbApiKey) { return; }
  const url = geointConfig.adsbApiUrl ?? "https://adsbexchange.com/api/aircraft/json";

  try {
    const resp = await fetch(url, {
      headers: {
        "api-auth": geointConfig.adsbApiKey,
        Accept: "application/json",
      },
    });
    if (!resp.ok) { return; }
    const data = (await resp.json()) as {
      ac?: Array<{
        hex: string;
        flight?: string;
        t?: string;
        r?: string;
        lat?: number;
        lon?: number;
        alt_baro?: number;
        gs?: number;
        track?: number;
        squawk?: string;
        category?: string;
        mil?: number;
      }>;
    };

    for (const ac of (data.ac ?? []).slice(0, 200)) {
      if (!ac.lat || !ac.lon) { continue; }
      const callsign = (ac.flight ?? "").trim();
      const military = ac.mil === 1 || isMilitaryCallsign(callsign);
      const squawkAlert = ac.squawk ? MILITARY_SQUAWKS.has(ac.squawk) : false;

      const existing = trackedAircraft.find((a) => a.icao === ac.hex);
      if (existing) {
        existing.position = { lat: ac.lat, lon: ac.lon, alt: ac.alt_baro ?? 0 };
        existing.speed = ac.gs ?? 0;
        existing.heading = ac.track ?? 0;
        existing.squawk = ac.squawk;
        existing.lastSeen = ts();
        existing.trackHistory.push({ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro ?? 0, time: ts() });
        if (existing.trackHistory.length > 50) { existing.trackHistory.shift(); }
      } else {
        const aircraft: TrackedAircraft = {
          id: `ac-${uid().slice(0, 8)}`,
          icao: ac.hex,
          callsign,
          type: ac.t,
          country: ac.r ?? "unknown",
          military,
          position: { lat: ac.lat, lon: ac.lon, alt: ac.alt_baro ?? 0 },
          speed: ac.gs ?? 0,
          heading: ac.track ?? 0,
          squawk: ac.squawk,
          flagged: military || squawkAlert,
          lastSeen: ts(),
          trackHistory: [{ lat: ac.lat, lon: ac.lon, alt: ac.alt_baro ?? 0, time: ts() }],
        };
        trackedAircraft.push(aircraft);

        // Publish new military aircraft sighting
        if (military || squawkAlert) {
          intelligenceBus.publish("osint.military_aircraft", {
            icao: ac.hex,
            callsign,
            type: ac.t,
            country: ac.r,
            position: { lat: ac.lat, lon: ac.lon, alt: ac.alt_baro },
            squawk: ac.squawk,
            timestamp: Date.now(),
          });
        }
      }
    }

    // Cap tracked aircraft
    while (trackedAircraft.length > MAX_TRACKED) { trackedAircraft.shift(); }
  } catch {
    // Silent fail — network issues are expected
  }
}

// ─── AIS Ship Tracking ──────────────────────────────────────────

async function pollAIS(): Promise<void> {
  if (!geointConfig.aisApiKey) { return; }
  const url = geointConfig.aisApiUrl ?? "https://services.marinetraffic.com/api/exportvessels/v:8";

  try {
    const resp = await fetch(`${url}/${geointConfig.aisApiKey}/protocol:json/msgtype:simple`, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) { return; }
    const data = (await resp.json()) as Array<{
      MMSI: string;
      SHIPNAME: string;
      SHIPTYPE: string;
      FLAG: string;
      LAT: string;
      LON: string;
      SPEED: string;
      COURSE: string;
      DESTINATION: string;
      STATUS: string;
    }>;

    for (const v of (data ?? []).slice(0, 200)) {
      const lat = parseFloat(v.LAT);
      const lon = parseFloat(v.LON);
      if (isNaN(lat) || isNaN(lon)) { continue; }

      const military = isMilitaryVessel(v.SHIPTYPE);

      const existing = trackedVessels.find((ves) => ves.mmsi === v.MMSI);
      if (existing) {
        existing.position = { lat, lon };
        existing.speed = parseFloat(v.SPEED) || 0;
        existing.course = parseFloat(v.COURSE) || 0;
        existing.destination = v.DESTINATION;
        existing.navStatus = v.STATUS;
        existing.lastSeen = ts();
        existing.trackHistory.push({ lat, lon, time: ts() });
        if (existing.trackHistory.length > 50) { existing.trackHistory.shift(); }
      } else {
        const vessel: TrackedVessel = {
          id: `v-${uid().slice(0, 8)}`,
          mmsi: v.MMSI,
          name: v.SHIPNAME,
          type: v.SHIPTYPE,
          flag: v.FLAG,
          military,
          position: { lat, lon },
          speed: parseFloat(v.SPEED) || 0,
          course: parseFloat(v.COURSE) || 0,
          destination: v.DESTINATION,
          navStatus: v.STATUS,
          flagged: military,
          lastSeen: ts(),
          trackHistory: [{ lat, lon, time: ts() }],
        };
        trackedVessels.push(vessel);

        if (military) {
          intelligenceBus.publish("osint.naval_vessel", {
            mmsi: v.MMSI,
            name: v.SHIPNAME,
            type: v.SHIPTYPE,
            flag: v.FLAG,
            position: { lat, lon },
            destination: v.DESTINATION,
            timestamp: Date.now(),
          });
        }
      }
    }

    while (trackedVessels.length > MAX_TRACKED) { trackedVessels.shift(); }
  } catch {
    // Silent fail
  }
}

// ─── Poll Orchestration ─────────────────────────────────────────

async function pollCycle(): Promise<void> {
  await Promise.allSettled([pollADSB(), pollAIS()]);
}

// ─── Public API ─────────────────────────────────────────────────

/** Configure GEOINT feeds */
export function configureGEOINT(config: Partial<GEOINTConfig>): void {
  geointConfig = { ...geointConfig, ...config };
  if (geointConfig.enabled) {
    startGEOINTPolling();
  }
}

/** Start polling */
function startGEOINTPolling(): void {
  if (pollTimer) { return; }
  pollTimer = setInterval(
    () => void pollCycle(),
    (geointConfig.pollIntervalSec || 120) * 1000,
  );
  void pollCycle(); // Immediate first poll
}

/** Stop polling */
export function stopGEOINTPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Get military aircraft */
export function getMilitaryAircraft(limit = 50): TrackedAircraft[] {
  return trackedAircraft.filter((a) => a.military || a.flagged).slice(-limit);
}

/** Get all tracked aircraft */
export function getAllAircraft(limit = 100): TrackedAircraft[] {
  return trackedAircraft.slice(-limit);
}

/** Get military vessels */
export function getMilitaryVessels(limit = 50): TrackedVessel[] {
  return trackedVessels.filter((v) => v.military || v.flagged).slice(-limit);
}

/** Get all tracked vessels */
export function getAllVessels(limit = 100): TrackedVessel[] {
  return trackedVessels.slice(-limit);
}

/** Search aircraft by callsign/ICAO */
export function searchAircraft(query: string): TrackedAircraft[] {
  const lower = query.toLowerCase();
  return trackedAircraft.filter((a) =>
    a.callsign.toLowerCase().includes(lower) ||
    a.icao.toLowerCase().includes(lower) ||
    a.type?.toLowerCase().includes(lower),
  );
}

/** Search vessels by name/MMSI */
export function searchVessels(query: string): TrackedVessel[] {
  const lower = query.toLowerCase();
  return trackedVessels.filter((v) =>
    v.name.toLowerCase().includes(lower) ||
    v.mmsi.includes(query) ||
    v.flag.toLowerCase().includes(lower),
  );
}

/** Get GEOINT status */
export function getGEOINTStatus() {
  return {
    enabled: geointConfig.enabled,
    adsbConfigured: !!geointConfig.adsbApiKey,
    aisConfigured: !!geointConfig.aisApiKey,
    trackedAircraft: trackedAircraft.length,
    militaryAircraft: trackedAircraft.filter((a) => a.military).length,
    trackedVessels: trackedVessels.length,
    militaryVessels: trackedVessels.filter((v) => v.military).length,
    pollIntervalSec: geointConfig.pollIntervalSec,
  };
}
