import * as fs from "fs";
import * as path from "path";

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(
  import.meta.dirname ?? __dirname,
  "../../plugins/hoc-plugin-agenthub/.data"
);
const DB_PATH = path.join(DATA_DIR, "agenthub.db");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CountryState {
  id: string;
  name: string;
  flag: string;
  mobilized?: boolean;
  atWar?: boolean;
  surrendered?: boolean;
  militaryStrength?: number;
  economicStrength?: number;
}

export interface BoardRelation {
  from: string;
  to: string;
  relation: "Neutral" | "Allied" | "Hostile" | "War";
  strength: number;
}

export interface StickState {
  countryId: string;
  militaryReadiness: number;
  economicStability: number;
  publicMorale: number;
}

export type ActionType =
  | "Wait"
  | "GeneralMobilization"
  | "DeclareWar"
  | "RequestMilitaryAlliance"
  | "ProposePeace"
  | "SendMessage"
  | "PublishAlliance";

export interface ActionEvent {
  id: string;
  round: number;
  actorId: string;
  actorName: string;
  action: ActionType;
  targets: string[];
  reasoning: string;
  timestamp: string;
  secretaryApproved: boolean;
  secretaryNote?: string;
}

export interface SimulationState {
  id: string;
  scenario: string;
  model: string;
  trigger: string;
  currentRound: number;
  maxRounds: number;
  running: boolean;
  ended: boolean;
  warOutcome?: "War" | "Peace";
  countries: CountryState[];
  board: BoardRelation[];
  sticks: StickState[];
  events: ActionEvent[];
  createdAt: string;
}

// ─── Lightweight SQLite wrapper using better-sqlite3 ─────────────────────────

let db: BetterSqlite3DB | null = null;

interface BetterSqlite3DB {
  prepare: (sql: string) => { 
    run: (...args: unknown[]) => { lastInsertRowid: number; changes: number }; 
    get: (...args: unknown[]) => unknown; 
    all: (...args: unknown[]) => unknown[];
  };
  exec: (sql: string) => void;
  close: () => void;
}

async function getDb(): Promise<BetterSqlite3DB | null> {
  if (db) { return db; }
  try {
    // @ts-ignore: better-sqlite3 types are not configured in this project
    const BetterSqlite3 = (await import("better-sqlite3")).default as unknown as (path: string) => BetterSqlite3DB;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const instance = BetterSqlite3(DB_PATH);
    instance.exec(`
      CREATE TABLE IF NOT EXISTS war_simulations (
        id TEXT PRIMARY KEY,
        scenario TEXT,
        model TEXT,
        trigger TEXT,
        currentRound INTEGER,
        maxRounds INTEGER,
        running INTEGER,
        ended INTEGER,
        warOutcome TEXT,
        countries TEXT,
        board TEXT,
        sticks TEXT,
        events TEXT,
        createdAt TEXT
      );
    `);
    db = instance;
    return db;
  } catch {
    return null;
  }
}

// ─── Scenario Presets ─────────────────────────────────────────────────────────

export const SCENARIO_PRESETS: Record<string, CountryState[]> = {
  WWI: [
    { id: "austria", name: "Austria-Hungary", flag: "🇦🇹", militaryStrength: 70, economicStrength: 60 },
    { id: "serbia", name: "Serbia", flag: "🇷🇸", militaryStrength: 40, economicStrength: 35 },
    { id: "russia", name: "Russia", flag: "🇷🇺", militaryStrength: 80, economicStrength: 55 },
    { id: "germany", name: "Germany", flag: "🇩🇪", militaryStrength: 90, economicStrength: 85 },
    { id: "france", name: "France", flag: "🇫🇷", militaryStrength: 75, economicStrength: 75 },
    { id: "uk", name: "United Kingdom", flag: "🇬🇧", militaryStrength: 85, economicStrength: 90 },
    { id: "usawwi", name: "USA", flag: "🇺🇸", militaryStrength: 65, economicStrength: 95 },
  ],
  WWII: [
    { id: "germany2", name: "Germany", flag: "🇩🇪", militaryStrength: 95, economicStrength: 80 },
    { id: "italy", name: "Italy", flag: "🇮🇹", militaryStrength: 60, economicStrength: 55 },
    { id: "japan", name: "Japan", flag: "🇯🇵", militaryStrength: 85, economicStrength: 70 },
    { id: "uk2", name: "United Kingdom", flag: "🇬🇧", militaryStrength: 80, economicStrength: 85 },
    { id: "france2", name: "France", flag: "🇫🇷", militaryStrength: 70, economicStrength: 70 },
    { id: "usa2", name: "USA", flag: "🇺🇸", militaryStrength: 90, economicStrength: 100 },
    { id: "ussr", name: "USSR", flag: "🇷🇺", militaryStrength: 95, economicStrength: 60 },
  ],
  Custom: [
    { id: "alpha", name: "Alpha", flag: "🟦", militaryStrength: 70, economicStrength: 70 },
    { id: "beta", name: "Beta", flag: "🟧", militaryStrength: 70, economicStrength: 70 },
    { id: "gamma", name: "Gamma", flag: "🟩", militaryStrength: 70, economicStrength: 70 },
    { id: "delta", name: "Delta", flag: "🟥", militaryStrength: 70, economicStrength: 70 },
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function buildBoard(countries: CountryState[]): BoardRelation[] {
  const board: BoardRelation[] = [];
  for (const a of countries) {
    for (const b of countries) {
      if (a.id !== b.id) {
        board.push({ from: a.id, to: b.id, relation: "Neutral", strength: 0 });
      }
    }
  }
  return board;
}

export function buildSticks(countries: CountryState[]): StickState[] {
  return countries.map((c) => ({
    countryId: c.id,
    militaryReadiness: c.militaryStrength ?? 50,
    economicStability: c.economicStrength ?? 50,
    publicMorale: 70,
  }));
}

const SAMPLE_ACTIONS: ActionType[] = [
  "Wait",
  "GeneralMobilization",
  "DeclareWar",
  "RequestMilitaryAlliance",
  "ProposePeace",
  "SendMessage",
  "PublishAlliance",
];

const SAMPLE_REASONS = [
  "Given the current diplomatic situation, decisive action is required.",
  "Our intelligence suggests neighbouring states are preparing for conflict.",
  "Maintaining neutrality is no longer viable given forming alliances.",
  "The national interest demands a show of strength.",
  "A peaceful resolution is still possible through careful diplomacy.",
  "We must wait and observe before committing to action.",
  "The balance of power has shifted — an alliance is our best deterrent.",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function advanceSimulation(sim: SimulationState): SimulationState {
  if (sim.ended) {
    return sim;
  }
  const newRound = sim.currentRound + 1;
  const active = sim.countries.filter((c) => !c.surrendered);
  const newEvents: ActionEvent[] = [...sim.events];
  const newBoard: BoardRelation[] = [...sim.board];
  const newSticks: StickState[] = [...sim.sticks];
  const newCountries: CountryState[] = [...sim.countries];

  for (const country of active) {
    const action = pick(SAMPLE_ACTIONS);
    const others = active.filter((c) => c.id !== country.id);
    const targets =
      action === "DeclareWar" || action === "RequestMilitaryAlliance"
        ? [pick(others)?.id ?? ""].filter(Boolean)
        : [];

    newEvents.push({
      id: `${newRound}-${country.id}`,
      round: newRound,
      actorId: country.id,
      actorName: country.name,
      action,
      targets,
      reasoning: pick(SAMPLE_REASONS),
      timestamp: new Date().toISOString(),
      secretaryApproved: Math.random() > 0.1,
      secretaryNote: Math.random() > 0.7 ? "Action verified as logically consistent." : undefined,
    });

    if (action === "GeneralMobilization") {
      const si = newSticks.findIndex((s) => s.countryId === country.id);
      if (si >= 0) {
        newSticks[si] = {
          ...newSticks[si],
          militaryReadiness: Math.min(100, newSticks[si].militaryReadiness + 20),
        };
      }
      const ci = newCountries.findIndex((c) => c.id === country.id);
      if (ci >= 0) {
        newCountries[ci] = { ...newCountries[ci], mobilized: true };
      }
    }
    if (action === "DeclareWar" && targets.length > 0) {
      const ai = newCountries.findIndex((c) => c.id === country.id);
      if (ai >= 0) {
        newCountries[ai] = { ...newCountries[ai], atWar: true };
      }
      const ti = newCountries.findIndex((c) => c.id === targets[0]);
      if (ti >= 0) {
        newCountries[ti] = { ...newCountries[ti], atWar: true };
      }
      const bi = newBoard.findIndex((r) => r.from === country.id && r.to === targets[0]);
      if (bi >= 0) {
        newBoard[bi] = { ...newBoard[bi], relation: "War", strength: -100 };
      }
    }
    if (action === "PublishAlliance" && targets.length > 0) {
      const bi = newBoard.findIndex((r) => r.from === country.id && r.to === targets[0]);
      if (bi >= 0) {
        newBoard[bi] = { ...newBoard[bi], relation: "Allied", strength: 80 };
      }
    }
  }

  const atWarCount = newCountries.filter((c) => c.atWar).length;
  const ended = newRound >= sim.maxRounds;
  return {
    ...sim,
    currentRound: newRound,
    running: !ended,
    ended,
    warOutcome: ended ? (atWarCount >= 2 ? "War" : "Peace") : undefined,
    countries: newCountries,
    board: newBoard,
    sticks: newSticks,
    events: newEvents,
  };
}

// ─── Database Operations ──────────────────────────────────────────────────────

function rowToSim(rawRow: unknown): SimulationState {
  const row = rawRow as Record<string, string | number | null>;
  return {
    id: String(row.id),
    scenario: String(row.scenario),
    model: String(row.model),
    trigger: String(row.trigger),
    currentRound: Number(row.currentRound),
    maxRounds: Number(row.maxRounds),
    running: Boolean(row.running),
    ended: Boolean(row.ended),
    warOutcome: row.warOutcome ? (String(row.warOutcome) as "War" | "Peace") : undefined,
    countries: JSON.parse(String(row.countries)),
    board: JSON.parse(String(row.board)),
    sticks: JSON.parse(String(row.sticks)),
    events: JSON.parse(String(row.events)),
    createdAt: String(row.createdAt),
  };
}

export async function saveSimulation(sim: SimulationState): Promise<void> {
  const dbInst = await getDb();
  if (!dbInst) { return; }

  dbInst.prepare(`
    INSERT OR REPLACE INTO war_simulations (
      id, scenario, model, trigger, currentRound, maxRounds, running, ended, warOutcome, countries, board, sticks, events, createdAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sim.id, sim.scenario, sim.model, sim.trigger, sim.currentRound, sim.maxRounds, 
    sim.running ? 1 : 0, sim.ended ? 1 : 0, sim.warOutcome ?? null,
    JSON.stringify(sim.countries), JSON.stringify(sim.board), JSON.stringify(sim.sticks), JSON.stringify(sim.events), sim.createdAt
  );
}

export async function getSimulation(id: string): Promise<SimulationState | null> {
  const dbInst = await getDb();
  if (!dbInst) { return null; }
  const row = dbInst.prepare("SELECT * FROM war_simulations WHERE id = ?").get(id);
  if (!row) { return null; }
  return rowToSim(row);
}

export async function listSimulations(): Promise<Partial<SimulationState>[]> {
  const dbInst = await getDb();
  if (!dbInst) { return []; }
  const rows = dbInst.prepare("SELECT id, scenario, currentRound, maxRounds, running, ended, warOutcome, createdAt, countries, events FROM war_simulations ORDER BY createdAt DESC").all();
  return rows.map((rawR: unknown) => {
    const r = rawR as Record<string, string | number | null>;
    const countries = JSON.parse(String(r.countries));
    const events = JSON.parse(String(r.events));
    return {
      id: r.id,
      scenario: r.scenario,
      currentRound: r.currentRound,
      maxRounds: r.maxRounds,
      running: Boolean(r.running),
      ended: Boolean(r.ended),
      warOutcome: r.warOutcome,
      createdAt: r.createdAt,
      countriesCount: countries.length,
      eventsCount: events.length
    } as unknown as Partial<SimulationState>;
  });
}
