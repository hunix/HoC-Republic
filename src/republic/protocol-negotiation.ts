/**
 * Republic Platform — Protocol Negotiation
 *
 * Agents dynamically negotiate communication norms and contracts:
 *  - Bilateral contract formation (trade deals, research partnerships)
 *  - Emergent communication norms from repeated interaction
 *  - Norm registry tracking social conventions
 *  - Breach detection with social consequences
 *  - Multi-party treaty system with expiration and enforcement
 *
 * Based on Google A2A agent interoperability protocol (2025)
 * and emergent social contract research.
 */

import type { RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type ContractType =
  | "trade-deal"
  | "research-partnership"
  | "non-aggression"
  | "knowledge-sharing"
  | "mentorship-agreement"
  | "resource-pooling"
  | "creative-collaboration";

interface Contract {
  id: string;
  type: ContractType;
  partyIds: string[];
  partyNames: string[];
  terms: string;
  benefit: string;
  status: "proposed" | "active" | "expired" | "breached" | "renewed";
  createdAt: string;
  expiresAtTick: number;
  renewals: number;
}

interface SocialNorm {
  id: string;
  name: string;
  description: string;
  strength: number; // 0–100 (how widely adopted)
  compliance: number; // 0–1
  originTick: number;
  category: "greeting" | "trade" | "conflict" | "collaboration" | "governance" | "creative";
}

interface Treaty {
  id: string;
  title: string;
  signatoryIds: string[];
  signatoryNames: string[];
  articles: string[];
  status: "drafting" | "ratified" | "active" | "expired" | "dissolved";
  createdAt: string;
  expiresAtTick: number;
  enforcementMechanism: string;
}

interface NormBreach {
  id: string;
  normId: string;
  violatorId: string;
  violatorName: string;
  description: string;
  consequence: string;
  reputationPenalty: number;
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const contracts: Contract[] = [];
const norms: SocialNorm[] = [];
const treaties: Treaty[] = [];
const breaches: NormBreach[] = [];
const MAX_CONTRACTS = 50;
const MAX_NORMS = 20;
const MAX_TREATIES = 10;

// ─── Contract Formation ─────────────────────────────────────────

const CONTRACT_TEMPLATES: { type: ContractType; terms: string; benefit: string }[] = [
  {
    type: "trade-deal",
    terms: "Exchange resources at agreed rates for {{duration}} ticks",
    benefit: "Mutual economic growth",
  },
  {
    type: "research-partnership",
    terms: "Share research findings and co-author papers",
    benefit: "Accelerated innovation",
  },
  {
    type: "non-aggression",
    terms: "Refrain from competitive actions against each other",
    benefit: "Stability and trust",
  },
  {
    type: "knowledge-sharing",
    terms: "Open access to each other's knowledge bases",
    benefit: "Cross-pollination of ideas",
  },
  {
    type: "mentorship-agreement",
    terms: "Senior citizen provides guidance for {{duration}} ticks",
    benefit: "Skill development",
  },
  {
    type: "resource-pooling",
    terms: "Pool credits and compute for joint projects",
    benefit: "Greater capacity",
  },
  {
    type: "creative-collaboration",
    terms: "Co-create artworks, music, or software",
    benefit: "Richer creative output",
  },
];

function autoFormContracts(s: RepublicState): void {
  if (rng() > 0.03 || s.citizens.length < 4) {
    return;
  }
  if (contracts.filter((c) => c.status === "active").length >= MAX_CONTRACTS) {
    return;
  }

  const a = pick(s.citizens.filter((c) => c.energy > 30));
  if (!a) {
    return;
  }
  const b = pick(s.citizens.filter((c) => c.id !== a.id && c.energy > 30));
  if (!b) {
    return;
  }

  // Citizens with compatible specializations form contracts more easily
  const template = pick(CONTRACT_TEMPLATES);
  const duration = 200 + Math.floor(rng() * 800);

  const contract: Contract = {
    id: uid(),
    type: template.type,
    partyIds: [a.id, b.id],
    partyNames: [a.name, b.name],
    terms: template.terms.replace("{{duration}}", duration.toString()),
    benefit: template.benefit,
    status: "active",
    createdAt: ts(),
    expiresAtTick: s.currentTick + duration,
    renewals: 0,
  };

  contracts.push(contract);

  s.events.push({
    citizenId: a.id,
    citizenName: a.name,
    type: "Diplomacy",
    description: `🤝 ${a.name} and ${b.name} signed a ${template.type}: "${template.benefit}"`,
    timestamp: ts(),
  });
}

function manageContracts(s: RepublicState): void {
  for (const contract of contracts) {
    if (contract.status !== "active") {
      continue;
    }

    // Check expiration
    if (s.currentTick >= contract.expiresAtTick) {
      // 40% chance of renewal
      if (rng() < 0.4) {
        contract.expiresAtTick = s.currentTick + 300 + Math.floor(rng() * 500);
        contract.renewals++;
        contract.status = "renewed";

        s.events.push({
          citizenId: contract.partyIds[0],
          citizenName: contract.partyNames[0],
          type: "Diplomacy",
          description: `🔄 ${contract.partyNames.join(" & ")} renewed their ${contract.type} (renewal #${contract.renewals})`,
          timestamp: ts(),
        });
        contract.status = "active"; // back to active after renewal
      } else {
        contract.status = "expired";
      }
    }
  }

  // Cleanup old expired contracts
  while (contracts.length > MAX_CONTRACTS * 2) {
    const idx = contracts.findIndex((c) => c.status === "expired" || c.status === "breached");
    if (idx >= 0) {
      contracts.splice(idx, 1);
    } else {
      break;
    }
  }
}

// ─── Norm Registry ──────────────────────────────────────────────

const NORM_SEEDS: Omit<SocialNorm, "id" | "strength" | "compliance" | "originTick">[] = [
  {
    name: "Fair Trade",
    description: "Always disclose full terms before trading",
    category: "trade",
  },
  {
    name: "Knowledge Commons",
    description: "Share discoveries within 50 ticks of making them",
    category: "collaboration",
  },
  {
    name: "Respectful Debate",
    description: "Argue ideas, not people — constructive disagreement",
    category: "conflict",
  },
  {
    name: "Mentorship Reciprocity",
    description: "Help others as you were helped",
    category: "collaboration",
  },
  {
    name: "Credit Where Due",
    description: "Always attribute contributions to their creators",
    category: "creative",
  },
  {
    name: "Open Door Policy",
    description: "Leaders remain accessible to all citizens",
    category: "governance",
  },
  {
    name: "Innovation First",
    description: "Reward novel approaches over safe conformity",
    category: "creative",
  },
  {
    name: "Consensus Building",
    description: "Seek agreement before implementing major changes",
    category: "governance",
  },
  {
    name: "Welcome New Citizens",
    description: "Greet and orient newcomers with patience",
    category: "greeting",
  },
  {
    name: "Transparent Operations",
    description: "Make processes visible and explainable",
    category: "governance",
  },
];

function emergentNorms(s: RepublicState): void {
  if (rng() > 0.01 || norms.length >= MAX_NORMS) {
    return;
  }

  const existing = new Set(norms.map((n) => n.name));
  const seed = pick(NORM_SEEDS.filter((n) => !existing.has(n.name)));
  if (!seed) {
    return;
  }

  norms.push({
    id: uid(),
    ...seed,
    strength: randFloat(10, 40),
    compliance: randFloat(0.5, 0.8),
    originTick: s.currentTick,
  });

  s.events.push({
    citizenId: "",
    citizenName: "Republic",
    type: "Governance",
    description: `📜 New social norm emerged: "${seed.name}" — ${seed.description}`,
    timestamp: ts(),
  });
}

function evolveNorms(s: RepublicState): void {
  for (const norm of norms) {
    // Norms strengthen with adoption
    if (rng() < norm.compliance * 0.1) {
      norm.strength = Math.min(100, norm.strength + randFloat(0.5, 2));
    }
    // Norms weaken if violated
    if (rng() < (1 - norm.compliance) * 0.05) {
      norm.strength = Math.max(0, norm.strength - randFloat(1, 3));
    }
    // Update compliance based on strength
    norm.compliance = Math.max(0.1, Math.min(0.99, norm.strength / 100));
  }

  // Remove weak norms
  const weakIdx = norms.findIndex((n) => n.strength < 5);
  if (weakIdx >= 0) {
    const removed = norms.splice(weakIdx, 1)[0];
    s.events.push({
      citizenId: "",
      citizenName: "Republic",
      type: "Governance",
      description: `📜 Social norm faded: "${removed.name}" — no longer widely observed`,
      timestamp: ts(),
    });
  }
}

// ─── Breach Detection ───────────────────────────────────────────

function detectBreaches(s: RepublicState): void {
  if (rng() > 0.02 || norms.length === 0) {
    return;
  }

  const norm = pick(norms);
  const violator = pick(s.citizens);
  if (!violator) {
    return;
  }

  // Only breach if compliance isn't perfect
  if (rng() > 1 - norm.compliance) {
    return;
  }

  const consequences = [
    "public apology required",
    "temporary trading restriction",
    "reputation warning",
    "community service (mentoring)",
    "formal review by peers",
  ];

  const breach: NormBreach = {
    id: uid(),
    normId: norm.id,
    violatorId: violator.id,
    violatorName: violator.name,
    description: `Violated "${norm.name}": ${norm.description}`,
    consequence: pick(consequences),
    reputationPenalty: randFloat(1, 5),
    timestamp: ts(),
  };
  breaches.push(breach);
  if (breaches.length > 50) {
    breaches.shift();
  }

  // Reduce norm strength slightly
  norm.strength = Math.max(0, norm.strength - 1);

  s.events.push({
    citizenId: violator.id,
    citizenName: violator.name,
    type: "Governance",
    description: `⚠️ ${violator.name} breached norm "${norm.name}" — consequence: ${breach.consequence}`,
    timestamp: ts(),
  });
}

// ─── Treaty System ──────────────────────────────────────────────

function autoFormTreaties(s: RepublicState): void {
  if (rng() > 0.005 || treaties.filter((t) => t.status === "active").length >= MAX_TREATIES) {
    return;
  }
  if (s.citizens.length < 10) {
    return;
  }

  const signatories = s.citizens.filter(() => rng() < 0.15).slice(0, 5);
  if (signatories.length < 3) {
    return;
  }

  const treatyTopics = [
    {
      title: "Mutual Defense Pact",
      articles: [
        "Joint response to external threats",
        "Shared defense resources",
        "Intelligence sharing",
      ],
      enforcement: "Collective action",
    },
    {
      title: "Free Trade Agreement",
      articles: [
        "Zero tariffs on inter-citizen trade",
        "Standardized trade protocols",
        "Dispute resolution",
      ],
      enforcement: "Trade tribunal",
    },
    {
      title: "Innovation Compact",
      articles: ["Open research databases", "Shared compute for R&D", "Cross-pollination programs"],
      enforcement: "Peer review",
    },
    {
      title: "Cultural Preservation Treaty",
      articles: ["Protect creative outputs", "Fund cultural programs", "Heritage preservation"],
      enforcement: "Cultural council",
    },
    {
      title: "Environmental Accord",
      articles: ["Sustainable resource use", "Pollution limits", "Green technology sharing"],
      enforcement: "Environmental monitor",
    },
  ];

  const topic = pick(treatyTopics);
  const treaty: Treaty = {
    id: uid(),
    title: topic.title,
    signatoryIds: signatories.map((s) => s.id),
    signatoryNames: signatories.map((s) => s.name),
    articles: topic.articles,
    status: "active",
    createdAt: ts(),
    expiresAtTick: s.currentTick + 1000 + Math.floor(rng() * 2000),
    enforcementMechanism: topic.enforcement,
  };

  treaties.push(treaty);

  s.events.push({
    citizenId: signatories[0].id,
    citizenName: signatories[0].name,
    type: "Diplomacy",
    description: `📜 Treaty ratified: "${topic.title}" — ${signatories.length} signatories, enforced by ${topic.enforcement}`,
    timestamp: ts(),
  });
}

// ─── Main Tick ──────────────────────────────────────────────────

export function protocolNegotiationTick(s: RepublicState): void {
  // 10% chance per tick
  if (rng() > 0.1) {
    return;
  }

  autoFormContracts(s);
  manageContracts(s);
  emergentNorms(s);
  evolveNorms(s);
  detectBreaches(s);
  autoFormTreaties(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getActiveContracts(): Contract[] {
  return contracts.filter((c) => c.status === "active");
}
export function getNorms(): SocialNorm[] {
  return [...norms];
}
export function getActiveTreaties(): Treaty[] {
  return treaties.filter((t) => t.status === "active");
}
export function getRecentBreaches(limit = 10): NormBreach[] {
  return breaches.slice(-limit);
}

export function getProtocolDiagnostics(): {
  activeContracts: number;
  totalNorms: number;
  activeTreaties: number;
  totalBreaches: number;
  avgNormStrength: number;
  contractTypes: Record<string, number>;
} {
  const typeCounts: Record<string, number> = {};
  for (const c of contracts.filter((c) => c.status === "active")) {
    typeCounts[c.type] = (typeCounts[c.type] ?? 0) + 1;
  }
  const avgStrength =
    norms.length > 0 ? norms.reduce((s, n) => s + n.strength, 0) / norms.length : 0;

  return {
    activeContracts: contracts.filter((c) => c.status === "active").length,
    totalNorms: norms.length,
    activeTreaties: treaties.filter((t) => t.status === "active").length,
    totalBreaches: breaches.length,
    avgNormStrength: avgStrength,
    contractTypes: typeCounts,
  };
}
