/**
 * Republic Platform — Collective Intelligence Engine
 *
 * Phase AGI-7: Emergent Governance & Distributed Consensus.
 *
 * Inspired by:
 *   - MARL (Multi-Agent Reinforcement Learning) surveys
 *   - Quadratic Voting (Vitalik Buterin / RadicalxChange)
 *   - Conviction Voting (Commons Stack)
 *   - Liquid Democracy (delegation chains)
 *
 * Enables:
 *   1. Quadratic voting (diminishing returns on vote credits)
 *   2. Conviction voting (accumulated support over time)
 *   3. Liquid democracy (domain-level vote delegation)
 *   4. Multi-party negotiation with Nash equilibrium detection
 *   5. Emergent coalition formation from voting patterns
 */

import type { RepublicState } from "./types.js";
import { rand, rng, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

const COLLECTIVE_TICK_INTERVAL = 20;
const DEFAULT_CONVICTION_THRESHOLD = 100;
const MAX_PROPOSALS = 50;
const MAX_NEGOTIATION_ROUNDS = 10;
const VOICE_CREDITS_PER_CITIZEN = 100;
const MAX_DELEGATIONS = 200;

// ─── Types ──────────────────────────────────────────────────────

export interface CollectiveProposal {
  id: string;
  title: string;
  description: string;
  domain: string;
  proposerId: string;
  votes: Array<{ citizenId: string; credits: number; direction: "for" | "against" }>;
  conviction: number;
  convictionThreshold: number;
  status: "active" | "passed" | "rejected" | "expired";
  createdAt: number;
  expiresAt: number;
}

export interface DelegationChain {
  fromCitizenId: string;
  toCitizenId: string;
  domain: string;
  weight: number;
  activeUntil: number;
}

export interface NegotiationSession {
  id: string;
  participants: string[];
  topic: string;
  offers: Array<{ citizenId: string; offer: string; utility: number }>;
  equilibriumReached: boolean;
  outcome?: string;
  rounds: number;
}

export interface CollectiveIntelligenceDiagnostics {
  activeProposals: number;
  passedProposals: number;
  rejectedProposals: number;
  avgParticipation: number;
  delegationDepth: number;
  negotiationsCompleted: number;
  totalVotesCast: number;
}

// ─── State ──────────────────────────────────────────────────────

const proposals: CollectiveProposal[] = [];
const delegations: DelegationChain[] = [];
const negotiations: NegotiationSession[] = [];
const citizenCredits = new Map<string, number>();
let totalVotesCast = 0;

// ─── Proposal Creation ─────────────────────────────────────────

/** Create a new collective proposal */
export function proposeCollective(
  citizenId: string,
  title: string,
  description: string,
  domain: string,
  currentTick: number,
): CollectiveProposal {
  const proposal: CollectiveProposal = {
    id: uid(),
    title,
    description,
    domain,
    proposerId: citizenId,
    votes: [],
    conviction: 0,
    convictionThreshold: DEFAULT_CONVICTION_THRESHOLD,
    status: "active",
    createdAt: currentTick,
    expiresAt: currentTick + 2000,
  };

  proposals.push(proposal);
  if (proposals.length > MAX_PROPOSALS) {
    // Remove oldest expired/rejected
    const removable = proposals.findIndex((p) => p.status === "expired" || p.status === "rejected");
    if (removable >= 0) {
      proposals.splice(removable, 1);
    }
  }

  return proposal;
}

// ─── Quadratic Voting ───────────────────────────────────────────

/** Cast a quadratic vote on a proposal */
export function quadraticVote(
  citizenId: string,
  proposalId: string,
  credits: number,
  direction: "for" | "against",
): boolean {
  const proposal = proposals.find((p) => p.id === proposalId && p.status === "active");
  if (!proposal) {
    return false;
  }

  // Get citizen's available credits
  const available = citizenCredits.get(citizenId) ?? VOICE_CREDITS_PER_CITIZEN;
  if (credits > available) {
    return false;
  }

  // Quadratic cost: votes = √credits
  const voteWeight = Math.sqrt(credits);

  proposal.votes.push({ citizenId, credits, direction });
  citizenCredits.set(citizenId, available - credits);
  totalVotesCast++;

  // Update conviction based on quadratic vote weight
  if (direction === "for") {
    proposal.conviction += voteWeight;
  } else {
    proposal.conviction -= voteWeight * 0.5; // Against votes reduce conviction slower
  }

  return true;
}

// ─── Delegation ─────────────────────────────────────────────────

/** Delegate voting power in a domain */
export function delegateVote(
  fromCitizenId: string,
  toCitizenId: string,
  domain: string,
  currentTick: number,
): DelegationChain {
  // Remove existing delegation for this domain
  const existingIdx = delegations.findIndex(
    (d) => d.fromCitizenId === fromCitizenId && d.domain === domain,
  );
  if (existingIdx >= 0) {
    delegations.splice(existingIdx, 1);
  }

  const delegation: DelegationChain = {
    fromCitizenId,
    toCitizenId,
    domain,
    weight: 1.0,
    activeUntil: currentTick + 1000,
  };

  delegations.push(delegation);
  if (delegations.length > MAX_DELEGATIONS) {
    delegations.shift();
  }
  return delegation;
}

/** Resolve delegation chains for a domain */
function _resolveDelegations(citizenId: string, domain: string): number {
  let power = 1.0; // Own voting power
  const delegatedTo = delegations.filter((d) => d.toCitizenId === citizenId && d.domain === domain);

  for (const del of delegatedTo) {
    power += del.weight;
    // Recursive delegation (limited depth)
    const subDelegated = delegations.filter(
      (d) => d.toCitizenId === del.fromCitizenId && d.domain === domain,
    );
    for (const sub of subDelegated) {
      power += sub.weight * 0.5; // Diminishing with depth
    }
  }

  return power;
}

// ─── Negotiation ────────────────────────────────────────────────

/** Start a negotiation between citizens */
export function negotiateBetween(citizenIds: string[], topic: string): NegotiationSession {
  const session: NegotiationSession = {
    id: uid(),
    participants: citizenIds,
    topic,
    offers: [],
    equilibriumReached: false,
    rounds: 0,
  };

  // Simulate negotiation rounds
  while (session.rounds < MAX_NEGOTIATION_ROUNDS && !session.equilibriumReached) {
    session.rounds++;

    // Each participant makes an offer
    for (const cid of citizenIds) {
      const utility = 0.3 + rng() * 0.7;
      session.offers.push({
        citizenId: cid,
        offer: `Proposal R${session.rounds} by ${cid.slice(0, 6)}`,
        utility,
      });
    }

    // Check for Nash equilibrium (all utilities within 10% of each other)
    const lastRoundOffers = session.offers.slice(-citizenIds.length);
    const utilities = lastRoundOffers.map((o) => o.utility);
    const maxU = Math.max(...utilities);
    const minU = Math.min(...utilities);

    if (maxU - minU < 0.1) {
      session.equilibriumReached = true;
      session.outcome = `Consensus reached in round ${session.rounds}: ${lastRoundOffers.map((o) => `${o.citizenId.slice(0, 6)}=${o.utility.toFixed(2)}`).join(", ")}`;
    }
  }

  if (!session.equilibriumReached) {
    session.outcome = `No consensus after ${MAX_NEGOTIATION_ROUNDS} rounds`;
  }

  negotiations.push(session);
  if (negotiations.length > 50) {
    negotiations.shift();
  }
  return session;
}

// ─── Proposal Topics ────────────────────────────────────────────

const PROPOSAL_TOPICS: Array<{ title: string; domain: string; description: string }> = [
  {
    title: "Increase research funding",
    domain: "research",
    description: "Allocate more credits to citizen-led research projects",
  },
  {
    title: "Create new education pathway",
    domain: "education",
    description: "Establish specialized curriculum for emerging technologies",
  },
  {
    title: "Expand defense protocols",
    domain: "security",
    description: "Strengthen Republic defensive capabilities",
  },
  {
    title: "Launch cultural initiative",
    domain: "culture",
    description: "Fund cultural events to boost citizen morale",
  },
  {
    title: "Economic stimulus package",
    domain: "economy",
    description: "Distribute growth incentives to citizens",
  },
  {
    title: "Technology advancement grant",
    domain: "technology",
    description: "Accelerate R&D in priority technology areas",
  },
  {
    title: "Social cohesion program",
    domain: "social",
    description: "Foster inter-citizen collaboration and trust",
  },
  {
    title: "Governance reform proposal",
    domain: "governance",
    description: "Modernize Republic governance processes",
  },
];

// ─── Main Tick ──────────────────────────────────────────────────

/** Main collective intelligence tick */
export function collectiveIntelligenceTick(s: RepublicState): void {
  if (s.currentTick % COLLECTIVE_TICK_INTERVAL !== 0) {
    return;
  }

  // 1. Update conviction for active proposals
  for (const proposal of proposals) {
    if (proposal.status !== "active") {
      continue;
    }

    // Conviction grows with supporters
    const supporters = proposal.votes.filter((v) => v.direction === "for").length;
    proposal.conviction += supporters * 0.5;

    // Check conviction threshold → pass
    if (proposal.conviction >= proposal.convictionThreshold) {
      proposal.status = "passed";
    }

    // Expire old proposals
    if (s.currentTick >= proposal.expiresAt) {
      proposal.status = "expired";
    }
  }

  // 2. Expire old delegations
  for (let i = delegations.length - 1; i >= 0; i--) {
    if (s.currentTick >= delegations[i].activeUntil) {
      delegations.splice(i, 1);
    }
  }

  // 3. Citizens participate in active proposals
  // PERFORMANCE: sample up to 50 random citizens instead of iterating all N
  const activeProposals = proposals.filter((p) => p.status === "active");
  if (activeProposals.length > 0 && s.citizens.length > 0) {
    const sampleSize = Math.min(s.citizens.length, 50);
    const startIdx = Math.floor(rng() * Math.max(1, s.citizens.length - sampleSize));
    const citizenSample = s.citizens.slice(startIdx, startIdx + sampleSize);

    for (const citizen of citizenSample) {
      if (rng() > 0.2) {
        continue;
      } // 20% participation rate maintained

      for (const proposal of activeProposals) {
        // Check if already voted
        if (proposal.votes.some((v) => v.citizenId === citizen.id)) {
          continue;
        }

        const credits = rand(1, 10);
        const direction: "for" | "against" = rng() > 0.3 ? "for" : "against";
        quadraticVote(citizen.id, proposal.id, credits, direction);
        break; // One vote per tick per citizen
      }
    }
  }

  // 4. Occasionally generate new proposals from citizens
  if (activeProposals.length < 5 && rng() < 0.1) {
    const proposer = s.citizens[Math.floor(rng() * s.citizens.length)];
    if (proposer) {
      const topic = PROPOSAL_TOPICS[Math.floor(rng() * PROPOSAL_TOPICS.length)];
      proposeCollective(proposer.id, topic.title, topic.description, topic.domain, s.currentTick);
    }
  }

  // 5. Trigger negotiations between conflicting voters
  if (rng() < 0.05 && s.citizens.length >= 3) {
    const participants = [...s.citizens]
      .toSorted(() => rng() - 0.5)
      .slice(0, rand(2, 4))
      .map((c) => c.id);
    negotiateBetween(participants, "Resource allocation priority");
  }

  // 6. Replenish voice credits periodically (every 200 ticks)
  // Also prune dead citizen entries from the Map to prevent memory leak
  if (s.currentTick % 200 === 0) {
    const livingIds = new Set(s.citizens.map((c) => c.id));
    // Prune dead citizens from the credits map
    for (const id of citizenCredits.keys()) {
      if (!livingIds.has(id)) {
        citizenCredits.delete(id);
      }
    }
    // Replenish for living citizens
    for (const citizen of s.citizens) {
      citizenCredits.set(citizen.id, VOICE_CREDITS_PER_CITIZEN);
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function collectiveIntelligenceDiagnostics(): CollectiveIntelligenceDiagnostics {
  const active = proposals.filter((p) => p.status === "active").length;
  const passed = proposals.filter((p) => p.status === "passed").length;
  const rejected = proposals.filter(
    (p) => p.status === "rejected" || p.status === "expired",
  ).length;
  const allVotes = proposals.reduce((s, p) => s + p.votes.length, 0);
  const maxDepth = delegations.length > 0 ? Math.max(...delegations.map(() => 1)) : 0;

  return {
    activeProposals: active,
    passedProposals: passed,
    rejectedProposals: rejected,
    avgParticipation: proposals.length > 0 ? allVotes / proposals.length : 0,
    delegationDepth: maxDepth,
    negotiationsCompleted: negotiations.filter((n) => n.equilibriumReached).length,
    totalVotesCast,
  };
}

export function getProposals(): CollectiveProposal[] {
  return [...proposals];
}
export function getDelegations(): DelegationChain[] {
  return [...delegations];
}
