/**
 * Republic Platform — World Engine
 *
 * Living environment: weather, day/night cycle, seasons, natural events,
 * and environmental effects on citizen behavior.
 */

import type { RepublicState } from "./types.js";
import { pick, rng, ts } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type Weather = "sunny" | "cloudy" | "rainy" | "stormy" | "snowy" | "foggy" | "windy" | "heatwave";
type TimeOfDay = "dawn" | "morning" | "afternoon" | "evening" | "night";
type Season = "spring" | "summer" | "autumn" | "winter";

interface WorldState {
  weather: Weather;
  timeOfDay: TimeOfDay;
  season: Season;
  temperature: number; // -10 to 45 Celsius
  weatherDuration: number; // ticks remaining for current weather
  dayTick: number; // 0-99 within day cycle
}

interface NaturalEvent {
  name: string;
  description: string;
  type: "festival" | "disaster" | "discovery" | "celestial" | "migration";
  happinessEffect: number;
  energyEffect: number;
  creditEffect: number;
  tick: number;
}

// ─── State ──────────────────────────────────────────────────────

const worldState: WorldState = {
  weather: "sunny",
  timeOfDay: "morning",
  season: "spring",
  temperature: 22,
  weatherDuration: 20,
  dayTick: 25,
};

const eventHistory: NaturalEvent[] = [];
const MAX_EVENTS = 100;

const DAY_LENGTH = 100; // ticks per day
const SEASON_LENGTH = 500; // ticks per season

// ─── Weather System ─────────────────────────────────────────────

const SEASON_WEATHER: Record<
  Season,
  { weights: Record<Weather, number>; tempRange: [number, number] }
> = {
  spring: {
    weights: {
      sunny: 30,
      cloudy: 25,
      rainy: 20,
      stormy: 5,
      snowy: 0,
      foggy: 10,
      windy: 8,
      heatwave: 2,
    },
    tempRange: [8, 25],
  },
  summer: {
    weights: {
      sunny: 40,
      cloudy: 15,
      rainy: 10,
      stormy: 8,
      snowy: 0,
      foggy: 2,
      windy: 5,
      heatwave: 20,
    },
    tempRange: [20, 40],
  },
  autumn: {
    weights: {
      sunny: 20,
      cloudy: 30,
      rainy: 20,
      stormy: 10,
      snowy: 2,
      foggy: 12,
      windy: 6,
      heatwave: 0,
    },
    tempRange: [5, 22],
  },
  winter: {
    weights: {
      sunny: 10,
      cloudy: 20,
      rainy: 10,
      stormy: 5,
      snowy: 30,
      foggy: 15,
      windy: 8,
      heatwave: 0,
    },
    tempRange: [-10, 10],
  },
};

function generateWeather(): void {
  if (worldState.weatherDuration > 0) {
    worldState.weatherDuration--;
    return;
  }

  const seasonData = SEASON_WEATHER[worldState.season];
  const entries = Object.entries(seasonData.weights) as [Weather, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;

  for (const [weather, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      worldState.weather = weather;
      break;
    }
  }

  worldState.weatherDuration = Math.floor(5 + rng() * 30);
  const [min, max] = seasonData.tempRange;
  worldState.temperature = Math.floor(min + rng() * (max - min));
}

// ─── Day/Night Cycle ────────────────────────────────────────────

function updateTimeOfDay(tick: number): void {
  worldState.dayTick = tick % DAY_LENGTH;
  const pct = worldState.dayTick / DAY_LENGTH;

  if (pct < 0.1) {
    worldState.timeOfDay = "dawn";
  } else if (pct < 0.35) {
    worldState.timeOfDay = "morning";
  } else if (pct < 0.55) {
    worldState.timeOfDay = "afternoon";
  } else if (pct < 0.75) {
    worldState.timeOfDay = "evening";
  } else {
    worldState.timeOfDay = "night";
  }
}

// ─── Seasons ────────────────────────────────────────────────────

function updateSeason(tick: number): void {
  const seasonIndex = Math.floor((tick % (SEASON_LENGTH * 4)) / SEASON_LENGTH);
  const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
  const newSeason = seasons[seasonIndex];
  if (newSeason !== worldState.season) {
    worldState.season = newSeason;
  }
}

// ─── Environmental Effects ──────────────────────────────────────

function applyEnvironmentalEffects(s: RepublicState): void {
  for (const citizen of s.citizens) {
    // Weather effects
    switch (worldState.weather) {
      case "sunny":
        citizen.happiness = Math.min(100, citizen.happiness + 0.1);
        break;
      case "rainy":
        citizen.happiness = Math.max(0, citizen.happiness - 0.05);
        break;
      case "stormy":
        citizen.energy = Math.max(5, citizen.energy - 0.2);
        citizen.happiness = Math.max(0, citizen.happiness - 0.1);
        break;
      case "heatwave":
        citizen.energy = Math.max(5, citizen.energy - 0.3);
        break;
      case "snowy":
        citizen.happiness = Math.min(100, citizen.happiness + 0.05);
        break;
    }

    // Time-of-day effects
    if (worldState.timeOfDay === "night" && citizen.activity !== "Sleeping") {
      citizen.energy = Math.max(5, citizen.energy - 0.1);
    }
    if (worldState.timeOfDay === "morning") {
      citizen.energy = Math.min(100, citizen.energy + 0.05);
    }

    // Season effects
    if (worldState.season === "spring") {
      citizen.happiness = Math.min(100, citizen.happiness + 0.02);
    }
    if (worldState.season === "winter") {
      citizen.energy = Math.max(5, citizen.energy - 0.03);
    }
  }
}

// ─── Natural Events ─────────────────────────────────────────────

const POSSIBLE_EVENTS: Omit<NaturalEvent, "tick">[] = [
  {
    name: "Meteor Shower",
    description: "A spectacular meteor shower lights up the sky",
    type: "celestial",
    happinessEffect: 5,
    energyEffect: 0,
    creditEffect: 0,
  },
  {
    name: "Solar Eclipse",
    description: "The sun is briefly obscured, filling citizens with awe",
    type: "celestial",
    happinessEffect: 3,
    energyEffect: 0,
    creditEffect: 0,
  },
  {
    name: "Resource Discovery",
    description: "A new resource deposit has been found!",
    type: "discovery",
    happinessEffect: 4,
    energyEffect: 0,
    creditEffect: 20,
  },
  {
    name: "Flash Flood",
    description: "Heavy rains caused localized flooding",
    type: "disaster",
    happinessEffect: -5,
    energyEffect: -10,
    creditEffect: -5,
  },
  {
    name: "Power Surge",
    description: "An electromagnetic surge affected systems",
    type: "disaster",
    happinessEffect: -3,
    energyEffect: -5,
    creditEffect: 0,
  },
  {
    name: "Harvest Festival",
    description: "The community celebrates an abundant harvest",
    type: "festival",
    happinessEffect: 8,
    energyEffect: 5,
    creditEffect: 10,
  },
  {
    name: "Knowledge Migration",
    description: "Scholars from distant lands share wisdom",
    type: "migration",
    happinessEffect: 3,
    energyEffect: 0,
    creditEffect: 0,
  },
  {
    name: "Aurora Event",
    description: "Stunning auroras illuminate the sky for days",
    type: "celestial",
    happinessEffect: 6,
    energyEffect: 0,
    creditEffect: 0,
  },
  {
    name: "Tech Breakthrough",
    description: "A spontaneous technological insight spread across the republic",
    type: "discovery",
    happinessEffect: 5,
    energyEffect: 0,
    creditEffect: 15,
  },
];

function triggerNaturalEvents(s: RepublicState): void {
  if (rng() > 0.02) {
    return;
  } // 2% per tick ≈ every 50 ticks

  const event = pick(POSSIBLE_EVENTS);
  const full: NaturalEvent = { ...event, tick: s.currentTick };
  eventHistory.push(full);
  if (eventHistory.length > MAX_EVENTS) {
    eventHistory.splice(0, eventHistory.length - MAX_EVENTS);
  }

  // Apply effects
  for (const citizen of s.citizens) {
    citizen.happiness = Math.max(0, Math.min(100, citizen.happiness + event.happinessEffect * 0.3));
    citizen.energy = Math.max(5, Math.min(100, citizen.energy + event.energyEffect * 0.3));
    citizen.credits = Math.max(0, citizen.credits + event.creditEffect);
  }

  const emoji =
    event.type === "festival"
      ? "🎊"
      : event.type === "disaster"
        ? "⚠️"
        : event.type === "celestial"
          ? "🌟"
          : event.type === "discovery"
            ? "🔍"
            : "🦅";
  s.events.push({
    citizenId: s.citizens[0]?.id ?? "",
    citizenName: "World",
    type: event.type === "disaster" ? "Other" : "PartyHosted",
    description: `${emoji} ${event.name}: ${event.description}`,
    timestamp: ts(),
  });
}

// ─── Main Tick ──────────────────────────────────────────────────

export function worldEngineTick(s: RepublicState): void {
  updateTimeOfDay(s.currentTick);
  updateSeason(s.currentTick);
  generateWeather();
  applyEnvironmentalEffects(s);
  triggerNaturalEvents(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getWorldState(): WorldState {
  return { ...worldState };
}
export function getRecentNaturalEvents(limit = 10): NaturalEvent[] {
  return eventHistory.slice(-limit);
}

export function getWorldDiagnostics(): {
  weather: Weather;
  timeOfDay: TimeOfDay;
  season: Season;
  temperature: number;
  recentEvents: number;
  currentEra: string;
} {
  return {
    weather: worldState.weather,
    timeOfDay: worldState.timeOfDay,
    season: worldState.season,
    temperature: worldState.temperature,
    recentEvents: eventHistory.length,
    currentEra: `${worldState.season} cycle`,
  };
}
