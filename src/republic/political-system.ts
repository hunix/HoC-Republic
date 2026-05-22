/**
 * Republic Platform — Political System
 *
 * Political parties, elections, factions, public opinion,
 * and policy effects on the simulation.
 */

import type { RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type Ideology = "progressive" | "conservative" | "technocrat" | "libertarian" | "communitarian";

interface PoliticalParty {
  id: string;
  name: string;
  ideology: Ideology;
  founderId: string;
  memberIds: string[];
  popularity: number;
  policies: string[];
  foundedAt: string;
}

interface Election {
  id: string;
  type: "council" | "governor" | "policy-referendum";
  candidates: { citizenId: string; citizenName: string; partyId: string | null; votes: number }[];
  status: "campaigning" | "voting" | "concluded";
  winnerId: string | null;
  startedAt: string;
  concludedAt: string | null;
}

interface Faction {
  id: string;
  name: string;
  cause: string;
  influence: number;
  memberIds: string[];
  foundedAt: string;
}

interface PublicOpinion {
  topic: string;
  support: number;
  opposition: number;
  undecided: number; // percentages
}

// ─── State ──────────────────────────────────────────────────────

const parties: PoliticalParty[] = [];
const elections: Election[] = [];
const factions: Faction[] = [];
const opinions: PublicOpinion[] = [];
const MAX_PARTIES = 8;
const MAX_ELECTIONS = 20;
const MAX_FACTIONS = 15;

// ─── Party Formation ────────────────────────────────────────────

function autoFormParties(s: RepublicState): void {
  if (parties.length >= MAX_PARTIES || s.currentTick % 200 !== 0) {
    return;
  }
  if (s.citizens.length < 10) {
    return;
  }

  const founder = pick(s.citizens.filter((c) => c.skillCount >= 3 && c.energy > 30));
  if (!founder) {
    return;
  }
  if (parties.some((p) => p.memberIds.includes(founder.id))) {
    return;
  }

  const ideologies: Ideology[] = [
    "progressive",
    "conservative",
    "technocrat",
    "libertarian",
    "communitarian",
  ];
  const ideology = pick(ideologies.filter((i) => !parties.some((p) => p.ideology === i)));
  if (!ideology) {
    return;
  }

  const names: Record<Ideology, string[]> = {
    progressive: ["Future Forward", "Innovation Party", "New Horizon"],
    conservative: ["Stability Coalition", "Heritage Party", "Tradition First"],
    technocrat: ["Rational Order", "Data-Driven Alliance", "Logic Party"],
    libertarian: ["Freedom League", "Individual Rights Party", "Open Republic"],
    communitarian: ["Common Good Party", "Unity Alliance", "People's Front"],
  };

  const party: PoliticalParty = {
    id: uid(),
    name: pick(names[ideology]),
    ideology,
    founderId: founder.id,
    memberIds: [founder.id],
    popularity: randFloat(10, 30),
    policies: [],
    foundedAt: ts(),
  };

  // Recruit initial members
  const recruits = s.citizens.filter((c) => c.id !== founder.id && rng() < 0.2).slice(0, 5);
  for (const r of recruits) {
    party.memberIds.push(r.id);
  }

  parties.push(party);

  s.events.push({
    citizenId: founder.id,
    citizenName: founder.name,
    type: "Governance",
    description: `🗳️ ${founder.name} founded "${party.name}" (${ideology})`,
    timestamp: ts(),
  });
}

// ─── Elections ──────────────────────────────────────────────────

function triggerElection(s: RepublicState): void {
  if (s.currentTick % 500 !== 0 || parties.length < 2) {
    return;
  }

  const candidates = parties.slice(0, 4).map((p) => {
    const leader = s.citizens.find((c) => c.id === p.founderId);
    return {
      citizenId: p.founderId,
      citizenName: leader?.name ?? "Unknown",
      partyId: p.id,
      votes: 0,
    };
  });

  const election: Election = {
    id: uid(),
    type: pick(["council", "governor", "policy-referendum"]),
    candidates,
    status: "voting",
    startedAt: ts(),
    winnerId: null,
    concludedAt: null,
  };

  // Simulate voting
  for (const _citizen of s.citizens) {
    const candidate = pick(candidates);
    candidate.votes++;
  }

  // Determine winner
  candidates.sort((a, b) => b.votes - a.votes);
  election.winnerId = candidates[0].citizenId;
  election.status = "concluded";
  election.concludedAt = ts();

  elections.push(election);
  if (elections.length > MAX_ELECTIONS) {
    elections.splice(0, elections.length - MAX_ELECTIONS);
  }

  // Update party popularity
  for (const candidate of candidates) {
    const party = parties.find((p) => p.id === candidate.partyId);
    if (party) {
      party.popularity = (candidate.votes / s.citizens.length) * 100;
    }
  }

  const winner = s.citizens.find((c) => c.id === election.winnerId);
  const winnerParty = parties.find((p) => p.id === candidates[0].partyId);
  s.events.push({
    citizenId: election.winnerId ?? "",
    citizenName: winner?.name ?? "?",
    type: "Governance",
    description: `🏆 ${winner?.name} (${winnerParty?.name}) won the ${election.type} election with ${candidates[0].votes} votes!`,
    timestamp: ts(),
  });
}

// ─── Factions ───────────────────────────────────────────────────

function autoFormFactions(s: RepublicState): void {
  if (rng() > 0.01 || factions.length >= MAX_FACTIONS) {
    return;
  }

  const causes = [
    "Universal Basic Income",
    "Open Source Everything",
    "Environmental Protection",
    "Education Reform",
    "Military Expansion",
    "Trade Deregulation",
    "Cultural Preservation",
    "AI Rights",
    "Space Exploration",
    "Healthcare for All",
  ];

  const cause = pick(causes.filter((c) => !factions.some((f) => f.cause === c)));
  if (!cause) {
    return;
  }

  const members = s.citizens.filter((_) => rng() < 0.15).slice(0, 8);
  if (members.length < 3) {
    return;
  }

  factions.push({
    id: uid(),
    name: `${cause} Movement`,
    cause,
    influence: randFloat(5, 25),
    memberIds: members.map((m) => m.id),
    foundedAt: ts(),
  });

  s.events.push({
    citizenId: members[0].id,
    citizenName: members[0].name,
    type: "Governance",
    description: `📢 New faction formed: "${cause} Movement" (${members.length} members)`,
    timestamp: ts(),
  });
}

// ─── Public Opinion ─────────────────────────────────────────────

function updatePublicOpinion(s: RepublicState): void {
  if (s.currentTick % 50 !== 0) {
    return;
  }

  opinions.length = 0;
  const topics = [
    "Republic Economy",
    "Innovation Pace",
    "Social Equality",
    "Education Quality",
    "Governance",
  ];

  for (const topic of topics) {
    const support = randFloat(30, 80);
    const opposition = randFloat(10, 100 - support);
    opinions.push({ topic, support, opposition, undecided: 100 - support - opposition });
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

export function politicalTick(s: RepublicState): void {
  autoFormParties(s);
  triggerElection(s);
  autoFormFactions(s);
  updatePublicOpinion(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getParties(): PoliticalParty[] {
  return [...parties];
}
export function getElections(): Election[] {
  return [...elections];
}
export function getFactions(): Faction[] {
  return [...factions];
}
export function getPublicOpinion(): PublicOpinion[] {
  return [...opinions];
}

export function getPoliticalDiagnostics(): {
  partyCount: number;
  factionCount: number;
  electionsHeld: number;
  partyBreakdown: { name: string; ideology: string; members: number; popularity: number }[];
} {
  return {
    partyCount: parties.length,
    factionCount: factions.length,
    electionsHeld: elections.length,
    partyBreakdown: parties.map((p) => ({
      name: p.name,
      ideology: p.ideology,
      members: p.memberIds.length,
      popularity: p.popularity,
    })),
  };
}
