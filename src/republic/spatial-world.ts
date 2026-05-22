/**
 * Republic Platform — Spatial & Environment Simulation
 *
 * Phase 38: Smallville + Civic Digital Twin spatial layer.
 *
 * Gives citizens a spatial world with locations, movement, distances,
 * and environmental effects. Citizens occupy positions and their
 * interactions are influenced by proximity.
 *
 * Research basis:
 * - Stanford Smallville (2023): agents with spatial environments
 * - Civic Digital Twins (arXiv 2024): urban environments for governance
 * - AgentSociety: realistic societal environments
 *
 * Key capabilities:
 * 1. Grid/graph world map with typed locations
 * 2. Citizen positions and movement
 * 3. Proximity-based interaction probability
 * 4. Environmental state (resource nodes, hazards)
 * 5. Spatial event propagation
 * 6. spatialTick() — tick loop integration
 */

import { rand, ts, uid } from "./utils.js";

// ─── Location Types ─────────────────────────────────────────────

export type LocationType =
  | "residential"
  | "commercial"
  | "industrial"
  | "civic"
  | "recreational"
  | "educational"
  | "natural"
  | "infrastructure";

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  x: number;
  y: number;
  /** Capacity: max citizens at this location */
  capacity: number;
  /** Citizens currently here */
  occupants: string[];
  /** Resource output per tick */
  resourceOutput: number;
  /** Health of this location (0.0–1.0) */
  health: number;
  /** Environmental hazard level (0.0–1.0) */
  hazardLevel: number;
  /** Amenities/features */
  features: string[];
  /** Whether location is operational */
  operational: boolean;
}

export interface CitizenPosition {
  citizenId: string;
  locationId: string;
  x: number;
  y: number;
  /** Where they want to go next */
  destinationId?: string;
  /** Current activity at this location */
  activity: string;
  /** Ticks spent at current location */
  ticksAtLocation: number;
}

// ─── Environmental Events ───────────────────────────────────────

export interface SpatialEvent {
  id: string;
  type: "weather" | "resource_discovery" | "hazard" | "infrastructure" | "festival";
  locationId: string;
  description: string;
  /** Effect radius (in grid units) */
  radius: number;
  /** Duration in ticks */
  durationTicks: number;
  /** Remaining ticks */
  remainingTicks: number;
  /** Effect on citizen happiness/energy */
  happinessEffect: number;
  energyEffect: number;
  /** Tick when started */
  startedAtTick: number;
  /** Timestamp */
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const locations = new Map<string, Location>();
const citizenPositions = new Map<string, CitizenPosition>();
const spatialEvents: SpatialEvent[] = [];

const WORLD_SIZE = 50; // 50x50 grid
const MAX_EVENTS = 100;
const MOVEMENT_SPEED = 3; // grid units per tick
const INTERACTION_RADIUS = 5;
const EVENT_SPAWN_CHANCE = 0.02; // per tick

// ─── World Initialization ───────────────────────────────────────

/** Create the default world map */
export function initializeWorld(): void {
  if (locations.size > 0) {
    return; // Already initialized
  }

  const defaultLocations: Array<Omit<Location, "occupants">> = [
    // Civic buildings
    {
      id: "town-hall",
      name: "Town Hall",
      type: "civic",
      x: 25,
      y: 25,
      capacity: 50,
      resourceOutput: 0,
      health: 1,
      hazardLevel: 0,
      features: ["governance", "voting", "announcements"],
      operational: true,
    },
    {
      id: "courthouse",
      name: "Courthouse",
      type: "civic",
      x: 27,
      y: 25,
      capacity: 30,
      resourceOutput: 0,
      health: 1,
      hazardLevel: 0,
      features: ["trials", "law"],
      operational: true,
    },

    // Commercial
    {
      id: "market",
      name: "Central Market",
      type: "commercial",
      x: 23,
      y: 23,
      capacity: 80,
      resourceOutput: 5,
      health: 1,
      hazardLevel: 0,
      features: ["trading", "shopping", "social"],
      operational: true,
    },
    {
      id: "bank",
      name: "Republic Bank",
      type: "commercial",
      x: 24,
      y: 22,
      capacity: 20,
      resourceOutput: 2,
      health: 1,
      hazardLevel: 0,
      features: ["finance", "credits"],
      operational: true,
    },

    // Industrial
    {
      id: "factory",
      name: "Production Factory",
      type: "industrial",
      x: 15,
      y: 10,
      capacity: 40,
      resourceOutput: 15,
      health: 0.9,
      hazardLevel: 0.1,
      features: ["manufacturing", "production"],
      operational: true,
    },
    {
      id: "datacenter",
      name: "Data Center",
      type: "industrial",
      x: 16,
      y: 12,
      capacity: 15,
      resourceOutput: 10,
      health: 0.95,
      hazardLevel: 0.05,
      features: ["compute", "storage", "ai"],
      operational: true,
    },

    // Residential
    {
      id: "housing-north",
      name: "North Housing",
      type: "residential",
      x: 20,
      y: 35,
      capacity: 60,
      resourceOutput: 0,
      health: 1,
      hazardLevel: 0,
      features: ["rest", "sleep", "home"],
      operational: true,
    },
    {
      id: "housing-south",
      name: "South Housing",
      type: "residential",
      x: 30,
      y: 15,
      capacity: 60,
      resourceOutput: 0,
      health: 1,
      hazardLevel: 0,
      features: ["rest", "sleep", "home"],
      operational: true,
    },

    // Educational
    {
      id: "academy",
      name: "Republic Academy",
      type: "educational",
      x: 30,
      y: 30,
      capacity: 40,
      resourceOutput: 0,
      health: 1,
      hazardLevel: 0,
      features: ["learning", "training", "research"],
      operational: true,
    },
    {
      id: "library",
      name: "Grand Library",
      type: "educational",
      x: 32,
      y: 30,
      capacity: 25,
      resourceOutput: 0,
      health: 1,
      hazardLevel: 0,
      features: ["knowledge", "study", "archives"],
      operational: true,
    },

    // Recreational
    {
      id: "park",
      name: "Central Park",
      type: "recreational",
      x: 25,
      y: 30,
      capacity: 100,
      resourceOutput: 1,
      health: 1,
      hazardLevel: 0,
      features: ["relaxation", "social", "nature"],
      operational: true,
    },
    {
      id: "arena",
      name: "Competition Arena",
      type: "recreational",
      x: 35,
      y: 20,
      capacity: 200,
      resourceOutput: 0,
      health: 1,
      hazardLevel: 0,
      features: ["competition", "entertainment", "events"],
      operational: true,
    },

    // Natural
    {
      id: "forest",
      name: "Eastern Forest",
      type: "natural",
      x: 45,
      y: 25,
      capacity: 30,
      resourceOutput: 3,
      health: 1,
      hazardLevel: 0.15,
      features: ["exploration", "resources", "nature"],
      operational: true,
    },
    {
      id: "mines",
      name: "Western Mines",
      type: "natural",
      x: 5,
      y: 25,
      capacity: 20,
      resourceOutput: 20,
      health: 0.8,
      hazardLevel: 0.3,
      features: ["mining", "resources", "danger"],
      operational: true,
    },

    // Infrastructure
    {
      id: "power-plant",
      name: "Power Plant",
      type: "infrastructure",
      x: 10,
      y: 40,
      capacity: 10,
      resourceOutput: 30,
      health: 0.9,
      hazardLevel: 0.2,
      features: ["energy", "power"],
      operational: true,
    },
    {
      id: "comms-tower",
      name: "Communications Tower",
      type: "infrastructure",
      x: 40,
      y: 40,
      capacity: 5,
      resourceOutput: 0,
      health: 0.95,
      hazardLevel: 0.05,
      features: ["communication", "broadcast"],
      operational: true,
    },
  ];

  for (const loc of defaultLocations) {
    locations.set(loc.id, { ...loc, occupants: [] });
  }
}

// ─── Citizen Position Management ────────────────────────────────

/** Place a citizen at a location */
export function placeCitizen(citizenId: string, locationId: string): boolean {
  const location = locations.get(locationId);
  if (!location || !location.operational) {
    return false;
  }
  if (location.occupants.length >= location.capacity) {
    return false;
  }

  // Remove from previous location
  const prev = citizenPositions.get(citizenId);
  if (prev) {
    const prevLoc = locations.get(prev.locationId);
    if (prevLoc) {
      prevLoc.occupants = prevLoc.occupants.filter((id) => id !== citizenId);
    }
  }

  // Add to new location
  location.occupants.push(citizenId);
  citizenPositions.set(citizenId, {
    citizenId,
    locationId,
    x: location.x,
    y: location.y,
    activity: "idle",
    ticksAtLocation: 0,
  });

  return true;
}

/** Set a citizen's destination for movement */
export function setCitizenDestination(citizenId: string, destinationId: string): boolean {
  const pos = citizenPositions.get(citizenId);
  const dest = locations.get(destinationId);
  if (!pos || !dest) {
    return false;
  }
  pos.destinationId = destinationId;
  return true;
}

/** Get a citizen's current position */
export function getCitizenPosition(citizenId: string): CitizenPosition | undefined {
  return citizenPositions.get(citizenId);
}

/** Get all citizens at a location */
export function getCitizensAtLocation(locationId: string): string[] {
  return locations.get(locationId)?.occupants ?? [];
}

/** Get citizens within interaction radius of a citizen */
export function getNearbyCtizens(citizenId: string): string[] {
  const pos = citizenPositions.get(citizenId);
  if (!pos) {
    return [];
  }

  const nearby: string[] = [];
  for (const [otherId, otherPos] of citizenPositions) {
    if (otherId === citizenId) {
      continue;
    }
    const dist = Math.sqrt((pos.x - otherPos.x) ** 2 + (pos.y - otherPos.y) ** 2);
    if (dist <= INTERACTION_RADIUS) {
      nearby.push(otherId);
    }
  }

  return nearby;
}

/** Calculate distance between two citizens */
export function getDistance(citizenAId: string, citizenBId: string): number {
  const a = citizenPositions.get(citizenAId);
  const b = citizenPositions.get(citizenBId);
  if (!a || !b) {
    return Infinity;
  }
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// ─── Location Management ────────────────────────────────────────

/** Get a location by ID */
export function getLocation(locationId: string): Location | undefined {
  return locations.get(locationId);
}

/** Get all locations */
export function getAllLocations(): Location[] {
  return [...locations.values()];
}

/** Get locations by type */
export function getLocationsByType(type: LocationType): Location[] {
  return [...locations.values()].filter((l) => l.type === type);
}

/** Add a new location to the world */
export function addLocation(location: Omit<Location, "occupants">): Location {
  const full: Location = { ...location, occupants: [] };
  locations.set(location.id, full);
  return full;
}

// ─── Spatial Events ─────────────────────────────────────────────

/** Create a spatial event */
export function createSpatialEvent(
  type: SpatialEvent["type"],
  locationId: string,
  description: string,
  durationTicks: number,
  effects: { happinessEffect?: number; energyEffect?: number; radius?: number },
  currentTick: number,
): SpatialEvent {
  const event: SpatialEvent = {
    id: `sev-${uid().slice(0, 8)}`,
    type,
    locationId,
    description,
    radius: effects.radius ?? 5,
    durationTicks,
    remainingTicks: durationTicks,
    happinessEffect: effects.happinessEffect ?? 0,
    energyEffect: effects.energyEffect ?? 0,
    startedAtTick: currentTick,
    timestamp: ts(),
  };

  spatialEvents.push(event);
  while (spatialEvents.length > MAX_EVENTS) {
    spatialEvents.shift();
  }

  return event;
}

/** Get events affecting a location */
export function getEventsAtLocation(locationId: string): SpatialEvent[] {
  const loc = locations.get(locationId);
  if (!loc) {
    return [];
  }

  return spatialEvents.filter((e) => {
    if (e.remainingTicks <= 0) {
      return false;
    }
    const eventLoc = locations.get(e.locationId);
    if (!eventLoc) {
      return false;
    }
    const dist = Math.sqrt((loc.x - eventLoc.x) ** 2 + (loc.y - eventLoc.y) ** 2);
    return dist <= e.radius;
  });
}

// ─── Movement Processing ────────────────────────────────────────

/** Process citizen movement toward their destinations */
function processMovement(): void {
  for (const pos of citizenPositions.values()) {
    if (!pos.destinationId) {
      pos.ticksAtLocation++;
      continue;
    }

    const dest = locations.get(pos.destinationId);
    if (!dest) {
      pos.destinationId = undefined;
      continue;
    }

    // Check if capacity allows
    if (dest.occupants.length >= dest.capacity && pos.locationId !== pos.destinationId) {
      pos.destinationId = undefined; // Cancel: full
      continue;
    }

    // Move toward destination
    const dx = dest.x - pos.x;
    const dy = dest.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= MOVEMENT_SPEED) {
      // Arrived
      const prevLoc = locations.get(pos.locationId);
      if (prevLoc) {
        prevLoc.occupants = prevLoc.occupants.filter((id) => id !== pos.citizenId);
      }

      pos.locationId = pos.destinationId;
      pos.x = dest.x;
      pos.y = dest.y;
      pos.destinationId = undefined;
      pos.ticksAtLocation = 0;

      dest.occupants.push(pos.citizenId);
    } else {
      // Move toward
      pos.x += Math.round((dx / dist) * MOVEMENT_SPEED);
      pos.y += Math.round((dy / dist) * MOVEMENT_SPEED);
      // Clamp to world
      pos.x = Math.max(0, Math.min(WORLD_SIZE, pos.x));
      pos.y = Math.max(0, Math.min(WORLD_SIZE, pos.y));
    }
  }
}

/** Process event ticks and random event spawning */
function processEvents(currentTick: number): void {
  // Decrement remaining ticks
  for (const event of spatialEvents) {
    if (event.remainingTicks > 0) {
      event.remainingTicks--;
    }
  }

  // Random event spawning
  if (rand(0, 99) < EVENT_SPAWN_CHANCE * 100 && locations.size > 0) {
    const allLocs = [...locations.values()];
    const randomLoc = allLocs[rand(0, allLocs.length - 1)];

    const eventTypes: Array<{
      type: SpatialEvent["type"];
      desc: string;
      duration: number;
      happiness: number;
      energy: number;
    }> = [
      {
        type: "weather",
        desc: "Clear skies boost morale",
        duration: rand(10, 30),
        happiness: 2,
        energy: 1,
      },
      {
        type: "weather",
        desc: "Storm reduces productivity",
        duration: rand(5, 15),
        happiness: -1,
        energy: -2,
      },
      {
        type: "resource_discovery",
        desc: "Resource vein discovered",
        duration: rand(20, 50),
        happiness: 3,
        energy: 0,
      },
      {
        type: "festival",
        desc: "Spontaneous celebration",
        duration: rand(5, 15),
        happiness: 5,
        energy: -1,
      },
      {
        type: "hazard",
        desc: "Infrastructure damage detected",
        duration: rand(10, 25),
        happiness: -2,
        energy: -1,
      },
    ];

    const selected = eventTypes[rand(0, eventTypes.length - 1)];
    createSpatialEvent(
      selected.type,
      randomLoc.id,
      `${selected.desc} at ${randomLoc.name}`,
      selected.duration,
      { happinessEffect: selected.happiness, energyEffect: selected.energy },
      currentTick,
    );
  }
}

/** Process resource output from locations */
function processResources(): number {
  let totalOutput = 0;
  for (const loc of locations.values()) {
    if (loc.operational && loc.occupants.length > 0) {
      totalOutput += loc.resourceOutput;
    }
  }
  return totalOutput;
}

// ─── Tick Integration ───────────────────────────────────────────

export interface SpatialTickResult {
  totalLocations: number;
  citizensPlaced: number;
  activeEvents: number;
  resourceOutput: number;
}

/**
 * Per-tick maintenance for the spatial world.
 *
 * - Process citizen movement
 * - Tick events
 * - Generate random events
 * - Collect resource output
 */
export function spatialTick(currentTick: number): SpatialTickResult {
  // Initialize world on first tick
  initializeWorld();

  processMovement();
  processEvents(currentTick);
  const resourceOutput = processResources();

  return {
    totalLocations: locations.size,
    citizensPlaced: citizenPositions.size,
    activeEvents: spatialEvents.filter((e) => e.remainingTicks > 0).length,
    resourceOutput,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function spatialDiagnostics() {
  const typeDistribution: Record<string, number> = {};
  for (const loc of locations.values()) {
    typeDistribution[loc.type] = (typeDistribution[loc.type] ?? 0) + 1;
  }

  return {
    worldSize: WORLD_SIZE,
    totalLocations: locations.size,
    typeDistribution,
    citizensPlaced: citizenPositions.size,
    activeEvents: spatialEvents.filter((e) => e.remainingTicks > 0).length,
    totalResourceOutput: processResources(),
  };
}

/** Reset spatial state (for testing) */
export function resetSpatialState(): void {
  locations.clear();
  citizenPositions.clear();
  spatialEvents.length = 0;
}
