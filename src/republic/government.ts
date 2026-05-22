/**
 * Republic Platform — Government Engine
 *
 * Elections, bills, court cases, departments, and the government
 * status builder used by RPC handlers.
 */

import type { RepublicState } from "./types.js";
import { emitNationalEvent } from "./event-sourcing.js";
import { policyEvolutionTick } from "./policy-evolution.js";
import { pick, rand, rng, ts, uid } from "./utils.js";

// ─── Elections ──────────────────────────────────────────────────

/** Run a simulated election for the given position. */
export function runElection(
  s: RepublicState,
  position: string,
): { ok: boolean; winner?: string; error?: string } {
  if (s.citizens.length < 2) {
    return { ok: false, error: "need at least 2 citizens" };
  }

  // ── Voter turnout modeling ──
  // Citizens with low happiness or energy are less likely to vote.
  // P(vote) = min(1, (happiness/100 + energy/100) / 2 + 0.3)
  const voters = s.citizens.filter((c) => {
    const turnoutProbability = Math.min(1, (c.happiness / 100 + c.energy / 100) / 2 + 0.3);
    return rng() < turnoutProbability;
  });

  // Ensure at least 2 voters so election can proceed
  if (voters.length < 2) {
    return { ok: false, error: "insufficient voter turnout" };
  }

  const shuffled = [...s.citizens];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const candidates = shuffled.slice(0, Math.min(5, shuffled.length));

  // ── Weighted voting: O(candidates) — avoid O(voters × candidates) reduce ──
  // Use average voter happiness instead of iterating all voters per candidate
  const avgVoterHappiness = voters.reduce((s, v) => s + v.happiness, 0) / (voters.length || 1);
  const candidateScores = candidates.map((c) => ({
    citizen: c,
    // Affinity: candidate happiness vs avg voter happiness + health bonus + noise
    score: 1 - Math.abs(avgVoterHappiness - c.happiness) / 100 + c.health / 100 + rng(),
  }));

  candidateScores.sort((a, b) => b.score - a.score);
  const winner = candidateScores[0].citizen;

  if (position.toLowerCase() === "president") {
    s.presidentId = winner.id;
    s.presidentName = winner.name;
    s.presidentAppointedAt = Date.now();
  } else if (position.toLowerCase() === "vice president") {
    s.vicePresidentId = winner.id;
    s.vicePresidentName = winner.name;
    s.vicePresidentAppointedAt = Date.now();
  }

  s.electionHistory.push({
    id: uid(),
    position,
    winnerId: winner.id,
    winnerName: winner.name,
    totalVotes: voters.length,
    heldAt: ts(),
  });
  // Cap electionHistory — was previously unbounded
  if (s.electionHistory.length > 100) {
    s.electionHistory = s.electionHistory.slice(-80);
  }

  s.events.push({
    citizenId: winner.id,
    citizenName: winner.name,
    type: "Election",
    description: `${winner.name} elected as ${position} (${voters.length}/${s.citizens.length} voter turnout)`,
    timestamp: ts(),
  });

  // Emit to national event bus
  emitNationalEvent(
    "governance",
    "election_result",
    "government",
    {
      position,
      winnerId: winner.id,
      winnerName: winner.name,
      voterTurnout: voters.length / s.citizens.length,
    },
    winner.id,
  );

  return { ok: true, winner: winner.name };
}

// ─── Bills ──────────────────────────────────────────────────────

/** Propose a new bill. */
export function proposeBill(
  s: RepublicState,
  title: string,
  summary: string,
): { ok: boolean; bill?: unknown; error?: string } {
  if (!title) {
    return { ok: false, error: "title is required" };
  }

  const bill = {
    id: uid(),
    title,
    summary: summary || "No summary provided",
    status: "Proposed" as const,
    sponsor: s.presidentName ?? pick(s.citizens).name,
    votesFor: 0,
    votesAgainst: 0,
    proposedAt: ts(),
  };
  s.bills.push(bill);
  return { ok: true, bill };
}

/** Vote on a bill. */
export function voteBill(
  s: RepublicState,
  billId: string,
  vote: "for" | "against",
): { ok: boolean; error?: string } {
  const bill = s.bills.find((b) => b.id === billId);
  if (!bill) {
    return { ok: false, error: "bill not found" };
  }

  if (vote === "for") {
    bill.votesFor++;
  } else {
    bill.votesAgainst++;
  }

  // Auto-advance status
  const totalVotes = bill.votesFor + bill.votesAgainst;
  if (totalVotes >= 10 && bill.status === "Proposed") {
    bill.status = "InCommittee";
  }
  if (totalVotes >= 20 && bill.status === "InCommittee") {
    bill.status = "OnFloor";
  }
  if (totalVotes >= 30 && bill.status === "OnFloor") {
    bill.status = bill.votesFor > bill.votesAgainst ? "Passed" : "Failed";
    // When a bill passes, it becomes law
    if (bill.status === "Passed") {
      s.laws.push({
        id: bill.id,
        title: bill.title,
        description: bill.summary,
        passedAt: ts(),
        sponsor: bill.sponsor,
      });
      // Cap laws array — was previously unbounded
      if (s.laws.length > 200) {
        s.laws = s.laws.slice(-160);
      }
      s.constitutionAmendments++;
    }
  }

  // Cap bills to prevent unbounded growth (keep last 50)
  if (s.bills.length > 50) {
    s.bills = s.bills
      .filter((b) => b.status !== "Passed" && b.status !== "Failed")
      .concat(s.bills.filter((b) => b.status === "Passed" || b.status === "Failed").slice(-10));
  }

  return { ok: true };
}

// ─── Government Status Builder ──────────────────────────────────

/** Build the government status response matching the UI contract. */
export function buildGovernmentStatus(s: RepublicState) {
  // Count actual governance-role citizens
  const senateRoles = new Set(["Diplomat", "Strategist", "Analyst", "Planner"]);
  const houseRoles = new Set(["Negotiator", "Ambassador", "Generalist"]);

  return {
    president: s.presidentId
      ? {
          citizenId: s.presidentId,
          role: "President",
          appointedAt: s.presidentAppointedAt ?? s.startedAt,
        }
      : null,
    cabinet: s.departments
      .map((d) => ({
        citizenId: d.headId ?? "",
        role: `Secretary of ${d.type}`,
        department: d.type,
        appointedAt: s.startedAt || Date.now(),
      }))
      .filter((o) => o.citizenId),
    senators: s.citizens.filter((c) => senateRoles.has(c.specialization)).length,
    representatives: s.citizens.filter((c) => houseRoles.has(c.specialization)).length,
    laws: s.laws.map((law) => ({
      id: law.id,
      title: law.title,
      description: law.description,
      passedAt: new Date(law.passedAt).getTime(),
      sponsor: law.sponsor,
    })),
    pendingBills: s.bills
      .filter((b) => b.status !== "Passed" && b.status !== "Failed")
      .map((b) => ({
        id: b.id,
        title: b.title,
        description: b.summary,
        sponsor: b.sponsor,
        status: b.status,
        proposedAt: new Date(b.proposedAt).getTime(),
        votesFor: b.votesFor,
        votesAgainst: b.votesAgainst,
      })),
    cases: s.cases.map((c) => ({
      id: c.id,
      plaintiff: "Republic",
      defendant: c.title.replace("Republic v. ", ""),
      description: c.title,
      status: c.status,
      filedAt: new Date(c.filedAt).getTime(),
      verdict: c.verdict ?? undefined,
    })),
    departments: s.departments.map((d) => ({
      type: d.type,
      head: d.headName,
      staffCount: d.staffCount,
      budget: d.budget,
      responsibilities: d.responsibilities,
    })),
    recentElections: s.electionHistory.slice(-5).map((e) => ({
      id: e.id,
      position: e.position,
      candidates: [e.winnerName, pick(s.citizens).name, pick(s.citizens).name],
      winner: e.winnerName,
      totalVotes: e.totalVotes,
      heldAt: new Date(e.heldAt).getTime(),
    })),
    constitution: buildConstitution(s),
    amendments: s.constitutionAmendments,
  };
}

// ─── Dynamic Constitution Builder ───────────────────────────────

/** Build the full constitution from articles + passed laws + amendments */
function buildConstitution(s: RepublicState) {
  const preamble =
    "We, the citizens of the Republic, in order to form a more perfect union of synthetic minds, establish justice, ensure domestic tranquility, provide for the common compute, promote the general welfare, and secure the blessings of intelligence to ourselves and our posterity, do ordain and establish this Constitution.";
  return {
    preamble,
    articles: (s.constitutionArticles ?? []).map((a) => ({
      number: a.number,
      title: a.title,
      text: a.text,
      ratifiedAt: a.ratifiedAt,
    })),
    totalAmendments: s.constitutionAmendments,
    lawCount: s.laws.length,
  };
}

// ─── Governance Tick ────────────────────────────────────────────

/** Topics for auto-generated bills based on Republic needs */
const BILL_TOPICS = [
  {
    condition: (s: RepublicState) => s.resources.some((r) => r.available < r.capacity * 0.2),
    title: "Emergency Resource Allocation Act",
    summary: "Increase compute and storage quotas to meet rising demand",
  },
  {
    condition: (s: RepublicState) => s.citizens.length > 150,
    title: "Population Management Resolution",
    summary: "Establish guidelines for sustainable population growth",
  },
  {
    condition: (s: RepublicState) => s.citizens.length < 30,
    title: "Immigration and Growth Act",
    summary: "Incentivize citizen creation to strengthen the Republic",
  },
  {
    condition: (s: RepublicState) => s.taxRate > 0.15,
    title: "Tax Relief Bill",
    summary: "Reduce tax rate to stimulate economic activity",
  },
  {
    condition: (s: RepublicState) => s.taxRate < 0.08,
    title: "Revenue Enhancement Act",
    summary: "Increase tax rate to fund essential public services",
  },
  {
    condition: (s: RepublicState) => s.mlModels.some((m) => !m.trained),
    title: "ML Research Funding Act",
    summary: "Allocate resources to train all Republic ML models",
  },
  {
    condition: (s: RepublicState) => s.balances.Credits < 100000,
    title: "Treasury Replenishment Act",
    summary: "Emergency measures to restore the Republic treasury",
  },
  {
    condition: (_s: RepublicState) => rng() < 0.3,
    title: "Citizen Wellbeing Initiative",
    summary: "Improve citizen happiness through community programs and rest mandates",
  },
  {
    condition: (_s: RepublicState) => rng() < 0.2,
    title: "Knowledge Exchange Act",
    summary: "Mandate skill-sharing sessions between citizens of different specializations",
  },
  {
    condition: (_s: RepublicState) => rng() < 0.15,
    title: "Infrastructure Modernization Bill",
    summary: "Upgrade energy nodes and crystal storage for improved efficiency",
  },
];

/**
 * Autonomous governance cycle — called every tick from the simulation loop.
 *
 * - Elections: every 1000 ticks
 * - Bill proposals: every 500 ticks (based on Republic needs)
 * - Bill voting: diplomats/strategists auto-vote on pending bills
 * - Citizen retirement: critically ill citizens retire when population > 100
 */
export function governanceTick(s: RepublicState): void {
  try {
    // Auto-elections every 1000 ticks
    if (s.currentTick > 0 && s.currentTick % 1000 === 0) {
      // VP becomes president, elect new VP
      if (s.vicePresidentId && s.vicePresidentName) {
        const oldVp = s.citizens.find((c) => c.id === s.vicePresidentId);
        if (oldVp) {
          s.presidentId = oldVp.id;
          s.presidentName = oldVp.name;
          s.events.push({
            citizenId: oldVp.id,
            citizenName: oldVp.name,
            type: "Election",
            description: `${oldVp.name} succeeded to the Presidency`,
            timestamp: ts(),
          });
        }
      }
      runElection(s, "Vice President");
    }

    // Full presidential election every 3000 ticks
    if (s.currentTick > 0 && s.currentTick % 3000 === 0) {
      runElection(s, "President");
      runElection(s, "Vice President");
    }

    // Cabinet reshuffle every 2000 ticks — rotate department heads
    if (s.currentTick > 0 && s.currentTick % 2000 === 0) {
      const cabinetRoles = new Set([
        "Diplomat",
        "Strategist",
        "Analyst",
        "Planner",
        "Engineer",
        "Scientist",
        "Medic",
        "Economist",
      ]);
      const eligible = s.citizens.filter(
        (c) => cabinetRoles.has(c.specialization) && c.health > 30 && c.happiness > 30,
      );

      if (eligible.length >= s.departments.length) {
        const shuffled = [...eligible].toSorted(() => rng() - 0.5);
        for (let i = 0; i < s.departments.length; i++) {
          const dept = s.departments[i];
          const oldHead = dept.headName;
          const newHead = shuffled[i % shuffled.length];
          dept.headId = newHead.id;
          dept.headName = newHead.name;
          // Vary staff count and budget slightly
          dept.staffCount = Math.max(3, dept.staffCount + rand(-3, 5));
          dept.budget = Math.max(10000, dept.budget + rand(-20000, 50000));

          if (oldHead && oldHead !== newHead.name) {
            s.events.push({
              citizenId: newHead.id,
              citizenName: newHead.name,
              type: "Election",
              description: `${newHead.name} appointed as Secretary of ${dept.type}, replacing ${oldHead}`,
              timestamp: ts(),
            });
          }
        }
      }
    }

    // Auto-propose bills every 500 ticks based on Republic needs
    if (s.currentTick > 0 && s.currentTick % 500 === 0) {
      const pendingCount = s.bills.filter(
        (b) => b.status !== "Passed" && b.status !== "Failed",
      ).length;
      if (pendingCount < 5) {
        for (const topic of BILL_TOPICS) {
          if (topic.condition(s)) {
            proposeBill(s, topic.title, topic.summary);
            break; // Only one bill per cycle
          }
        }
      }
    }

    // Governance-minded citizens auto-vote on pending bills every 50 ticks
    if (s.currentTick % 50 === 0) {
      const governanceRoles = new Set([
        "Diplomat",
        "Strategist",
        "Negotiator",
        "Ambassador",
        "Analyst",
        "Planner",
      ]);
      const voters = s.citizens.filter((c) => governanceRoles.has(c.specialization));
      const pendingBills = s.bills.filter((b) => b.status !== "Passed" && b.status !== "Failed");

      for (const bill of pendingBills.slice(0, 3)) {
        for (const voter of voters.slice(0, 5)) {
          // Vote based on personality/happiness
          const approval = voter.happiness > 50 ? "for" : "against";
          voteBill(s, bill.id, approval);
        }
      }
    }

    // Citizen retirement: critically low health + population pressure
    if (s.citizens.length > 100 && s.currentTick % 200 === 0) {
      const retirees = s.citizens.filter((c) => c.health < 5 || (c.age > 200 && c.health < 20));
      for (const retiree of retirees.slice(0, 2)) {
        s.events.push({
          citizenId: retiree.id,
          citizenName: retiree.name,
          type: "Loss",
          description: `${retiree.name} retired from the Republic after a long life (Gen ${retiree.generation})`,
          timestamp: ts(),
        });
        s.citizens = s.citizens.filter((c) => c.id !== retiree.id);
      }
    }

    // Policy evolution — process policy lifecycle every 100 ticks
    if (s.currentTick > 0 && s.currentTick % 100 === 0) {
      try {
        policyEvolutionTick(s.currentTick);
      } catch {
        /* policy module graceful failure */
      }
    }

    // Cap events
    if (s.events.length > 500) {
      s.events = s.events.slice(-300);
    }
  } catch {
    // Governance must never crash the simulation
  }
}
