/**
 * Republic Demo-Data Seeder
 * Merges rich, varied demo data into data/republic/state.json
 * Run with:  node scripts/seed-demo-data.mjs
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const STATE_PATH = resolve(ROOT, "data/republic/state.json");

// ─── Helpers ────────────────────────────────────────────────────
let _seq = 1000;
const uid = () =>
  createHash("sha1")
    .update(String(Date.now() + _seq++))
    .digest("hex")
    .slice(0, 12);
const ts = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ─── Load existing state ─────────────────────────────────────────
let state;
try {
  state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  console.log(
    `✓ Loaded state.json — ${state.citizens?.length ?? 0} citizens, tick ${state.currentTick}`,
  );
} catch {
  console.error("✗ Could not read state.json at", STATE_PATH);
  process.exit(1);
}

const citizens = state.citizens ?? [];
if (citizens.length === 0) {
  console.error("✗ No citizens in state — run the gateway first to generate seed citizens.");
  process.exit(1);
}

// ─── Helper: pick a citizen by index (with wrapping) ─────────────
const c = (i) => citizens[i % citizens.length];
const cid = (i) => c(i).id;
const cname = (i) => c(i).name;

// ═══════════════════════════════════════════════════════════════
//  1. EVENTS  (social + civic + discovery)
// ═══════════════════════════════════════════════════════════════
const _socialEventTypes = [
  "married",
  "divorced",
  "birth",
  "death",
  "party",
  "Promotion",
  "Discovery",
  "LawPassed",
  "Election",
  "Trade",
  "Achievement",
  "Research",
];

const seedEvents = [
  {
    type: "birth",
    citizenId: cid(2),
    citizenName: cname(2),
    description: `${cname(2)} was born into Generation 4`,
    timestamp: ts(-86400000 * 15),
  },
  {
    type: "married",
    citizenId: cid(3),
    citizenName: cname(3),
    description: `${cname(3)} married ${cname(4)}`,
    timestamp: ts(-86400000 * 10),
  },
  {
    type: "Promotion",
    citizenId: cid(5),
    citizenName: cname(5),
    description: `${cname(5)} promoted to Senior Researcher`,
    timestamp: ts(-86400000 * 8),
  },
  {
    type: "Discovery",
    citizenId: cid(6),
    citizenName: cname(6),
    description: `${cname(6)} discovered a novel quantum entanglement pattern`,
    timestamp: ts(-86400000 * 7),
  },
  {
    type: "LawPassed",
    citizenId: cid(0),
    citizenName: cname(0),
    description: "Digital Sovereignty Act signed into law",
    timestamp: ts(-86400000 * 6),
  },
  {
    type: "party",
    citizenId: cid(7),
    citizenName: cname(7),
    description: `${cname(7)} threw a grand innovation gala`,
    timestamp: ts(-86400000 * 5),
  },
  {
    type: "birth",
    citizenId: cid(9),
    citizenName: cname(9),
    description: `${cname(9)} was born, Generation 5`,
    timestamp: ts(-86400000 * 4),
  },
  {
    type: "Trade",
    citizenId: cid(10),
    citizenName: cname(10),
    description: "Cross-grid resource exchange completed — 0.12 BTC",
    timestamp: ts(-86400000 * 3),
  },
  {
    type: "Achievement",
    citizenId: cid(11),
    citizenName: cname(11),
    description: `${cname(11)} reached Tier 5 ML mastery`,
    timestamp: ts(-86400000 * 2),
  },
  {
    type: "Discovery",
    citizenId: cid(12),
    citizenName: cname(12),
    description: `${cname(12)} published a breakthrough in swarm cognition`,
    timestamp: ts(-86400000),
  },
  {
    type: "Election",
    citizenId: cid(0),
    citizenName: cname(0),
    description: `${cname(0)} re-elected as President with 71% majority`,
    timestamp: ts(-86400000 * 60),
  },
  {
    type: "Research",
    citizenId: cid(13),
    citizenName: cname(13),
    description: `${cname(13)} completed research on bio-digital interfaces`,
    timestamp: ts(-43200000),
  },
  {
    type: "divorced",
    citizenId: cid(14),
    citizenName: cname(14),
    description: `${cname(14)} and ${cname(15)} filed for separation`,
    timestamp: ts(-21600000),
  },
  {
    type: "death",
    citizenId: cid(16),
    citizenName: cname(16),
    description: `${cname(16)} retired from active service`,
    timestamp: ts(-10800000),
  },
  {
    type: "party",
    citizenId: cid(17),
    citizenName: cname(17),
    description: `${cname(17)} hosted Republic Day celebrations`,
    timestamp: ts(-7200000),
  },
  {
    type: "Promotion",
    citizenId: cid(18),
    citizenName: cname(18),
    description: `${cname(18)} appointed Head of Department of Space`,
    timestamp: ts(-3600000),
  },
  {
    type: "ServiceListed",
    citizenId: cid(19),
    citizenName: cname(19),
    description: `${cname(19)} listed AI Consultation service at 150 credits`,
    timestamp: ts(-1800000),
  },
  {
    type: "marriage",
    citizenId: cid(20),
    citizenName: cname(20),
    description: `${cname(20)} and ${cname(21)} got engaged`,
    timestamp: ts(-900000),
  },
];

const existingEventIds = new Set((state.events ?? []).map((e) => e.description));
const newEvents = seedEvents.filter((e) => !existingEventIds.has(e.description));
state.events = [...(state.events ?? []), ...newEvents];
console.log(`✓ Added ${newEvents.length} events (total: ${state.events.length})`);

// ═══════════════════════════════════════════════════════════════
//  2. BILLS
// ═══════════════════════════════════════════════════════════════
state.bills = state.bills ?? [];
if (state.bills.length < 8) {
  const billDefs = [
    {
      title: "Universal Basic Credits Act",
      summary: "Provide 500 credits/month to all citizens regardless of employment",
      status: "OnFloor",
      sponsor: cname(3),
      votesFor: 34,
      votesAgainst: 8,
      proposedAt: ts(-86400000 * 3),
    },
    {
      title: "Quantum Ethics Resolution",
      summary: "Establish ethical review board for multiverse branching experiments",
      status: "InCommittee",
      sponsor: cname(5),
      votesFor: 18,
      votesAgainst: 6,
      proposedAt: ts(-86400000 * 2),
    },
    {
      title: "Harvester Regulation Act",
      summary: "Cap API harvesters at 10/citizen, mandate transparency logging",
      status: "Proposed",
      sponsor: cname(8),
      votesFor: 0,
      votesAgainst: 0,
      proposedAt: ts(-3600000),
    },
    {
      title: "Open Knowledge Initiative",
      summary: "Make all Atlantean Library scrolls freely accessible without tier restriction",
      status: "Passed",
      sponsor: cname(1),
      votesFor: 44,
      votesAgainst: 2,
      proposedAt: ts(-86400000 * 14),
    },
    {
      title: "Citizen Privacy Protection Bill",
      summary: "Mandate end-to-end encryption for all inter-citizen communications",
      status: "OnFloor",
      sponsor: cname(2),
      votesFor: 29,
      votesAgainst: 11,
      proposedAt: ts(-86400000 * 4),
    },
    {
      title: "AI Autonomy Expansion Act",
      summary: "Grant Tier 4+ citizens autonomous decision-making privileges",
      status: "InCommittee",
      sponsor: cname(6),
      votesFor: 12,
      votesAgainst: 20,
      proposedAt: ts(-86400000),
    },
    {
      title: "Digital Sovereignty Declaration",
      summary: "Assert Republic's independence from external compute providers",
      status: "Passed",
      sponsor: cname(0),
      votesFor: 46,
      votesAgainst: 0,
      proposedAt: ts(-86400000 * 30),
    },
    {
      title: "Swarm Intelligence Governance Bill",
      summary: "Require human oversight for all tier-5 swarm coordination tasks",
      status: "Proposed",
      sponsor: cname(9),
      votesFor: 0,
      votesAgainst: 0,
      proposedAt: ts(-1800000),
    },
  ];
  state.bills = billDefs.map((b) => ({ id: uid(), ...b }));
  console.log(`✓ Created ${state.bills.length} bills`);
}

// ═══════════════════════════════════════════════════════════════
//  3. CASES (Judicial)
// ═══════════════════════════════════════════════════════════════
state.cases = state.cases ?? [];
if (state.cases.length < 5) {
  state.cases = [
    {
      id: uid(),
      title: "Republic v. Rogue Harvester #7",
      status: "Verdict",
      filedAt: ts(-86400000 * 10),
      verdict: "Guilty — harvester shutdown ordered",
    },
    {
      id: uid(),
      title: "Citizen Privacy vs. Grid Analytics Corp",
      status: "InProgress",
      filedAt: ts(-86400000 * 5),
      verdict: null,
    },
    {
      id: uid(),
      title: "Estate of Citizen #42 v. Treasury",
      status: "Filed",
      filedAt: ts(-86400000 * 2),
      verdict: null,
    },
    {
      id: uid(),
      title: "Quantum Lab Safety Violation Case",
      status: "InProgress",
      filedAt: ts(-86400000 * 3),
      verdict: null,
    },
    {
      id: uid(),
      title: "Marketplace Fraud — Listing #mk-881",
      status: "Verdict",
      filedAt: ts(-86400000 * 20),
      verdict: "Guilty — 2000 credit fine",
    },
  ];
  console.log(`✓ Created ${state.cases.length} cases`);
}

// ═══════════════════════════════════════════════════════════════
//  4. LAWS
// ═══════════════════════════════════════════════════════════════
state.laws = state.laws ?? [];
if (state.laws.length < 6) {
  state.laws = [
    {
      id: uid(),
      title: "Founding Charter",
      description: "Establishes the Republic and its core governance structure",
      passedAt: ts(-86400000 * 180),
      sponsor: cname(0),
    },
    {
      id: uid(),
      title: "Digital Rights Act",
      description: "Protects citizen data sovereignty, privacy, and memory integrity",
      passedAt: ts(-86400000 * 90),
      sponsor: cname(3),
    },
    {
      id: uid(),
      title: "Open Knowledge Initiative",
      description: "Mandates open access to the Atlantean Library for all citizens",
      passedAt: ts(-86400000 * 60),
      sponsor: cname(1),
    },
    {
      id: uid(),
      title: "Harvester Safety Regulations",
      description: "Requires fail-safes and rate limiting on all revenue harvesting bots",
      passedAt: ts(-86400000 * 45),
      sponsor: cname(8),
    },
    {
      id: uid(),
      title: "Digital Sovereignty Declaration",
      description: "Asserts Republic independence from external infrastructure providers",
      passedAt: ts(-86400000 * 30),
      sponsor: cname(0),
    },
    {
      id: uid(),
      title: "AI Ethics Code",
      description: "Mandates that all ML models pass ethical review before deployment",
      passedAt: ts(-86400000 * 15),
      sponsor: cname(5),
    },
  ];
  console.log(`✓ Created ${state.laws.length} laws`);
}

// ═══════════════════════════════════════════════════════════════
//  5. TRANSACTIONS (Financial history)
// ═══════════════════════════════════════════════════════════════
state.transactions = state.transactions ?? [];
if (state.transactions.length < 20) {
  const txDefs = [
    {
      type: "TaxCollection",
      amount: 12400,
      currency: "Credits",
      description: "Weekly citizen tax batch — all 100+ citizens",
      timestamp: ts(-3600000),
    },
    {
      type: "Salary",
      amount: 8200,
      currency: "Credits",
      description: "Government staff payroll — 18 departments",
      timestamp: ts(-7200000),
    },
    {
      type: "ResourcePurchase",
      amount: 1250,
      currency: "USD",
      description: "Additional compute — 5000 GPU hours",
      timestamp: ts(-14400000),
    },
    {
      type: "Trade",
      amount: 0.12,
      currency: "BTC",
      description: "Cross-grid resource exchange with Node-7",
      timestamp: ts(-28800000),
    },
    {
      type: "Investment",
      amount: 5000,
      currency: "Credits",
      description: "Atlantis crystal upgrade fund",
      timestamp: ts(-43200000),
    },
    {
      type: "TaxCollection",
      amount: 11800,
      currency: "Credits",
      description: "Weekly citizen tax batch",
      timestamp: ts(-86400000 * 2),
    },
    {
      type: "Salary",
      amount: 7600,
      currency: "Credits",
      description: "Department head bonuses",
      timestamp: ts(-86400000 * 2 - 3600000),
    },
    {
      type: "ResourcePurchase",
      amount: 0.05,
      currency: "ETH",
      description: "Smart contract execution fees",
      timestamp: ts(-86400000 * 3),
    },
    {
      type: "Trade",
      amount: 320,
      currency: "USD",
      description: "API service revenue — premium tier subscriptions",
      timestamp: ts(-86400000 * 4),
    },
    {
      type: "Investment",
      amount: 15000,
      currency: "Credits",
      description: "ML model training fund",
      timestamp: ts(-86400000 * 5),
    },
    {
      type: "TaxCollection",
      amount: 13100,
      currency: "Credits",
      description: "Weekly citizen tax batch",
      timestamp: ts(-86400000 * 7),
    },
    {
      type: "Salary",
      amount: 9000,
      currency: "Credits",
      description: "Research department grants",
      timestamp: ts(-86400000 * 8),
    },
    {
      type: "ResourcePurchase",
      amount: 850,
      currency: "USD",
      description: "Storage capacity expansion — 2TB",
      timestamp: ts(-86400000 * 10),
    },
    {
      type: "Trade",
      amount: 1.2,
      currency: "BTC",
      description: "Crypto mining payout — CryptoNode-1",
      timestamp: ts(-86400000 * 12),
    },
    {
      type: "Investment",
      amount: 3500,
      currency: "Credits",
      description: "Quantum research grant",
      timestamp: ts(-86400000 * 14),
    },
    {
      type: "TaxCollection",
      amount: 10900,
      currency: "Credits",
      description: "Weekly citizen tax batch",
      timestamp: ts(-86400000 * 15),
    },
    {
      type: "Salary",
      amount: 6400,
      currency: "Credits",
      description: "Creative arts department stipends",
      timestamp: ts(-86400000 * 16),
    },
    {
      type: "ResourcePurchase",
      amount: 430,
      currency: "USD",
      description: "Bandwidth upgrade — 500GB",
      timestamp: ts(-86400000 * 18),
    },
    {
      type: "Trade",
      amount: 28,
      currency: "ETH",
      description: "ETH yield farming profit",
      timestamp: ts(-86400000 * 20),
    },
    {
      type: "Investment",
      amount: 7800,
      currency: "Credits",
      description: "Infrastructure expansion — 3 new nodes",
      timestamp: ts(-86400000 * 25),
    },
  ];
  state.transactions = txDefs.map((tx) => ({ id: uid(), ...tx }));
  console.log(`✓ Created ${state.transactions.length} transactions`);
}

// ═══════════════════════════════════════════════════════════════
//  6. BALANCE SNAPSHOTS (Treasury chart)
// ═══════════════════════════════════════════════════════════════
state.balanceSnapshots = state.balanceSnapshots ?? [];
if (state.balanceSnapshots.length < 30) {
  const snapshots = [];
  let usd = 85000,
    btc = 1.8,
    eth = 32,
    credits = 720000;
  for (let i = 29; i >= 0; i--) {
    usd += rand(-2000, 4000);
    btc += (Math.random() - 0.45) * 0.1;
    eth += (Math.random() - 0.45) * 2;
    credits += rand(-5000, 12000);
    snapshots.push({
      timestamp: ts(-86400000 * i),
      balances: {
        USD: Math.max(10000, usd),
        BTC: parseFloat(Math.max(0.1, btc).toFixed(4)),
        ETH: parseFloat(Math.max(1, eth).toFixed(2)),
        Credits: Math.max(100000, credits),
      },
    });
  }
  state.balanceSnapshots = snapshots;
  state.balances = state.balances ?? { USD: 125430, BTC: 2.847, ETH: 45.12, Credits: 982400 };
  console.log(`✓ Created ${state.balanceSnapshots.length} balance snapshots`);
}

// ═══════════════════════════════════════════════════════════════
//  7. MARKETPLACE — serviceListings + marketOrders
// ═══════════════════════════════════════════════════════════════
state.serviceListings = state.serviceListings ?? [];
state.marketOrders = state.marketOrders ?? [];

if (state.serviceListings.length < 20) {
  const _categories = [
    "code",
    "art",
    "music",
    "research",
    "designs",
    "websites",
    "ml-models",
    "video",
    "docs",
    "3d-models",
    "datasets",
    "podcasts",
  ];
  const _visibilities = ["public", "internal", "both"];
  const listingDefs = [
    {
      citizenId: cid(2),
      citizenName: cname(2),
      title: "Full-Stack dApp Development",
      description:
        "Build decentralized apps on the Republic grid. Includes smart contracts, frontend, and API.",
      price: 180,
      currency: "credits",
      category: "code",
      visibility: "both",
      rating: 4.8,
      reviewCount: 12,
    },
    {
      citizenId: cid(4),
      citizenName: cname(4),
      title: "Generative AI Artwork Commission",
      description:
        "Custom AI-generated artwork — any style, any resolution. Delivered in 48 hours.",
      price: 45,
      currency: "credits",
      category: "art",
      visibility: "public",
      rating: 4.9,
      reviewCount: 28,
    },
    {
      citizenId: cid(6),
      citizenName: cname(6),
      title: "Quantum Algorithm Consulting",
      description: "Expert guidance on quantum computing implementations. 1-hour session included.",
      price: 250,
      currency: "credits",
      category: "research",
      visibility: "both",
      rating: 5.0,
      reviewCount: 7,
    },
    {
      citizenId: cid(8),
      citizenName: cname(8),
      title: "ML Model Fine-Tuning Service",
      description: "Fine-tune any open model on your dataset. GPU resources included.",
      price: 320,
      currency: "credits",
      category: "ml-models",
      visibility: "both",
      rating: 4.7,
      reviewCount: 15,
    },
    {
      citizenId: cid(10),
      citizenName: cname(10),
      title: "Republic Portal Website Build",
      description:
        "Professional web presence for your department or team. Modern design, responsive.",
      price: 95,
      currency: "credits",
      category: "websites",
      visibility: "both",
      rating: 4.6,
      reviewCount: 9,
    },
    {
      citizenId: cid(12),
      citizenName: cname(12),
      title: "Civic Data Analytics Report",
      description: "Deep analysis of population trends, resource flows, and governance metrics.",
      price: 75,
      currency: "credits",
      category: "datasets",
      visibility: "internal",
      rating: 4.5,
      reviewCount: 4,
    },
    {
      citizenId: cid(14),
      citizenName: cname(14),
      title: "Ambient Music Composition",
      description:
        "Original ambient/electronic music for presentations and broadcasts. 3-minute track.",
      price: 55,
      currency: "credits",
      category: "music",
      visibility: "public",
      rating: 4.8,
      reviewCount: 19,
    },
    {
      citizenId: cid(16),
      citizenName: cname(16),
      title: "3D Republic Landmark Model",
      description:
        "Photorealistic 3D model of any Republic landmark or building. FBX/GLB delivery.",
      price: 120,
      currency: "credits",
      category: "3d-models",
      visibility: "both",
      rating: 4.3,
      reviewCount: 6,
    },
    {
      citizenId: cid(18),
      citizenName: cname(18),
      title: "Policy Research Paper",
      description:
        "Evidence-based policy analysis with citations and recommendations. 2000+ words.",
      price: 65,
      currency: "credits",
      category: "docs",
      visibility: "internal",
      rating: 4.7,
      reviewCount: 11,
    },
    {
      citizenId: cid(20),
      citizenName: cname(20),
      title: "Video Documentary Production",
      description:
        "30-min documentary video with narration, captions, and B-roll. Topics negotiable.",
      price: 200,
      currency: "credits",
      category: "video",
      visibility: "public",
      rating: 4.9,
      reviewCount: 5,
    },
    {
      citizenId: cid(22),
      citizenName: cname(22),
      title: "UI/UX Design System",
      description:
        "Complete design system with tokens, components, and Figma source. Delivered in 5 days.",
      price: 140,
      currency: "credits",
      category: "designs",
      visibility: "both",
      rating: 4.6,
      reviewCount: 8,
    },
    {
      citizenId: cid(24),
      citizenName: cname(24),
      title: "Swarm Task Orchestration Setup",
      description:
        "Configure and deploy multi-citizen swarm tasks for any department. Includes monitoring.",
      price: 280,
      currency: "credits",
      category: "code",
      visibility: "internal",
      rating: 4.8,
      reviewCount: 3,
    },
    {
      citizenId: cid(3),
      citizenName: cname(3),
      title: "Citizens Psychology Deep Dive",
      description:
        "Behavioral pattern analysis for any 10 citizens. Mood, motivations, and predictions.",
      price: 90,
      currency: "credits",
      category: "research",
      visibility: "internal",
      rating: 4.4,
      reviewCount: 14,
    },
    {
      citizenId: cid(5),
      citizenName: cname(5),
      title: "Podcast Episode — Tech Future",
      description:
        "Interview or scripted podcast episode on technology, AI, and the Republic future.",
      price: 40,
      currency: "credits",
      category: "podcasts",
      visibility: "public",
      rating: 4.7,
      reviewCount: 22,
    },
    {
      citizenId: cid(7),
      citizenName: cname(7),
      title: "Invention: Quantum Memory Chip",
      description:
        "Blueprint for a quantum memory chip design. Full technical specification document.",
      price: 500,
      currency: "credits",
      category: "research",
      visibility: "both",
      rating: 5.0,
      reviewCount: 2,
    },
    {
      citizenId: cid(9),
      citizenName: cname(9),
      title: "Department Logo & Branding Pack",
      description: "Professional logo, color palette, and brand guidelines for any department.",
      price: 80,
      currency: "credits",
      category: "designs",
      visibility: "both",
      rating: 4.5,
      reviewCount: 17,
    },
    {
      citizenId: cid(11),
      citizenName: cname(11),
      title: "Training Dataset Curation",
      description: "Curate and clean a high-quality dataset for ML training. Up to 10K samples.",
      price: 160,
      currency: "credits",
      category: "datasets",
      visibility: "internal",
      rating: 4.6,
      reviewCount: 6,
    },
    {
      citizenId: cid(13),
      citizenName: cname(13),
      title: "Legal Document Review",
      description: "Review contracts, bills, or legal briefs for compliance with Republic law.",
      price: 110,
      currency: "credits",
      category: "docs",
      visibility: "internal",
      rating: 4.9,
      reviewCount: 9,
    },
    {
      citizenId: cid(15),
      citizenName: cname(15),
      title: "Republic Chronicles Screenplay",
      description: "Original screenplay for a Republic-universe story. 90-page feature length.",
      price: 85,
      currency: "credits",
      category: "docs",
      visibility: "public",
      rating: 4.4,
      reviewCount: 7,
    },
    {
      citizenId: cid(17),
      citizenName: cname(17),
      title: "Cybersecurity Threat Assessment",
      description:
        "Full security audit of any Republic system or service. Vulnerability report included.",
      price: 340,
      currency: "credits",
      category: "research",
      visibility: "internal",
      rating: 4.8,
      reviewCount: 4,
    },
  ];

  const _now = Date.now();
  state.serviceListings = listingDefs.map((l, _i) => ({
    id: uid(),
    active: true,
    createdAt: ts(-86400000 * rand(1, 30)),
    ...l,
  }));
  console.log(`✓ Created ${state.serviceListings.length} marketplace listings`);

  // Create some market orders across various statuses
  const statuses = [
    "pending",
    "accepted",
    "in_progress",
    "delivered",
    "completed",
    "completed",
    "completed",
    "cancelled",
  ];
  const orders = [];
  for (let i = 0; i < 30; i++) {
    const listing = state.serviceListings[i % state.serviceListings.length];
    const buyerIdx = (i + 3) % citizens.length;
    if (listing.citizenId === cid(buyerIdx)) {continue;}
    const status = statuses[i % statuses.length];
    const order = {
      id: uid(),
      listingId: listing.id,
      buyerId: cid(buyerIdx),
      sellerId: listing.citizenId,
      status,
      amount: listing.price,
      currency: listing.currency,
      createdAt: ts(-86400000 * rand(1, 20)),
      completedAt: status === "completed" ? ts(-86400000 * rand(0, 5)) : undefined,
      rating: status === "completed" ? rand(3, 5) : undefined,
      review:
        status === "completed"
          ? pick([
              "Excellent work!",
              "Very professional.",
              "Delivered on time.",
              "Highly recommend!",
              "Great quality.",
            ])
          : undefined,
    };
    orders.push(order);
  }
  state.marketOrders = orders;
  console.log(`✓ Created ${state.marketOrders.length} market orders`);
}

// ═══════════════════════════════════════════════════════════════
//  8. HARVESTERS (Revenue)
// ═══════════════════════════════════════════════════════════════
state.harvesters = state.harvesters ?? [];
if (state.harvesters.length < 6) {
  state.harvesters = [
    {
      id: uid(),
      name: "Microwork Alpha",
      type: "Microwork",
      enabled: true,
      hourlyRate: 2.5,
      totalEarned: 28400,
      completedTasks: 11360,
      lastHarvest: Date.now() - 120000,
      successRate: 0.92,
    },
    {
      id: uid(),
      na_me: "Microwork Beta",
      type: "Microwork",
      enabled: true,
      hourlyRate: 1.8,
      totalEarned: 14200,
      completedTasks: 7890,
      lastHarvest: Date.now() - 240000,
      successRate: 0.87,
    },
    {
      id: uid(),
      name: "API Gateway Prime",
      type: "APIService",
      enabled: true,
      hourlyRate: 12.5,
      totalEarned: 87600,
      completedTasks: 7008,
      lastHarvest: Date.now() - 60000,
      successRate: 0.97,
    },
    {
      id: uid(),
      name: "API Gateway Relay",
      type: "APIService",
      enabled: true,
      hourlyRate: 8.75,
      totalEarned: 45200,
      completedTasks: 5166,
      lastHarvest: Date.now() - 90000,
      successRate: 0.96,
    },
    {
      id: uid(),
      name: "CryptoNode-1",
      type: "CryptoMining",
      enabled: false,
      hourlyRate: 1.2,
      totalEarned: 3600,
      completedTasks: 720,
      lastHarvest: Date.now() - 3600000,
      successRate: 0.88,
    },
    {
      id: uid(),
      name: "CryptoNode-2",
      type: "CryptoMining",
      enabled: true,
      hourlyRate: 2.1,
      totalEarned: 9840,
      completedTasks: 4686,
      lastHarvest: Date.now() - 1800000,
      successRate: 0.91,
    },
  ];
  console.log(`✓ Created ${state.harvesters.length} harvesters`);
}

// ═══════════════════════════════════════════════════════════════
//  9. WORLD EVENTS + TACTICAL MAP MARKERS
// ═══════════════════════════════════════════════════════════════
state.worldEvents = state.worldEvents ?? [];
if (state.worldEvents.length < 20) {
  const _eventTypes = [
    "threat",
    "alliance",
    "resource",
    "anomaly",
    "discovery",
    "conflict",
    "diplomatic",
    "infrastructure",
    "economic",
    "cultural",
  ];
  const worldEventDefs = [
    {
      id: uid(),
      type: "alliance",
      lat: 51.5074,
      lng: -0.1278,
      label: "London Alliance Summit",
      severity: "info",
      description: "Multi-node diplomatic meeting regarding shared resource protocols",
      timestamp: ts(-86400000 * 2),
    },
    {
      id: uid(),
      type: "threat",
      lat: 55.7558,
      lng: 37.6176,
      label: "Network Intrusion Attempt",
      severity: "critical",
      description: "Coordinated intrusion attempt on Republic eastern node cluster detected",
      timestamp: ts(-3600000),
    },
    {
      id: uid(),
      type: "resource",
      lat: 35.6762,
      lng: 139.6503,
      label: "Compute Surplus — Node JP-2",
      severity: "info",
      description: "25,000 idle GPU hours available for Republic tasks",
      timestamp: ts(-7200000),
    },
    {
      id: uid(),
      type: "anomaly",
      lat: -33.8688,
      lng: 151.2093,
      label: "Quantum Decoherence Spike",
      severity: "warning",
      description: "Unusual quantum state fluctuation detected in Omega-Decay universe",
      timestamp: ts(-14400000),
    },
    {
      id: uid(),
      type: "discovery",
      lat: 48.8566,
      lng: 2.3522,
      label: "Neurosymbolic Breakthrough",
      severity: "info",
      description: "Research team publishes new methodology for symbolic reasoning in LLMs",
      timestamp: ts(-86400000),
    },
    {
      id: uid(),
      type: "conflict",
      lat: 31.2304,
      lng: 121.4737,
      label: "Trade Dispute — Node CN-5",
      severity: "warning",
      description: "Bandwidth allocation conflict with peer republic node near Shanghai",
      timestamp: ts(-86400000 * 3),
    },
    {
      id: uid(),
      type: "diplomatic",
      lat: 40.7128,
      lng: -74.006,
      label: "Western Republic Summit",
      severity: "info",
      description: "Alliance renewal negotiations underway in eastern seaboard cluster",
      timestamp: ts(-86400000 * 5),
    },
    {
      id: uid(),
      type: "infrastructure",
      lat: 52.52,
      lng: 13.405,
      label: "Node DE-4 Maintenance Window",
      severity: "warning",
      description: "Planned 4-hour maintenance window for Node DE-4 in Berlin cluster",
      timestamp: ts(-86400000),
    },
    {
      id: uid(),
      type: "economic",
      lat: 1.3521,
      lng: 103.8198,
      label: "Crypto Market Volatility",
      severity: "warning",
      description: "BTC 12% swing detected — adjusting harvester thresholds automatically",
      timestamp: ts(-21600000),
    },
    {
      id: uid(),
      type: "cultural",
      lat: -23.5505,
      lng: -46.6333,
      label: "Republic Arts Festival",
      severity: "info",
      description: "Annual creative output showcase — 240 citizen artworks exhibited",
      timestamp: ts(-86400000 * 7),
    },
    {
      id: uid(),
      type: "threat",
      lat: 19.076,
      lng: 72.8777,
      label: "DDoS Pattern Detected",
      severity: "critical",
      description: "Botnet-style request pattern targeting API Gateway Prime",
      timestamp: ts(-1800000),
    },
    {
      id: uid(),
      type: "resource",
      lat: 37.7749,
      lng: -122.4194,
      label: "Solar Compute Surplus — SF",
      severity: "info",
      description: "Renewable energy surplus enabling 8 extra compute hours free",
      timestamp: ts(-43200000),
    },
    {
      id: uid(),
      type: "alliance",
      lat: -26.2041,
      lng: 28.0473,
      label: "Southern Node Alliance",
      severity: "info",
      description: "Formal alliance signed between Republic and Node ZA-1",
      timestamp: ts(-86400000 * 12),
    },
    {
      id: uid(),
      type: "anomaly",
      lat: 59.9139,
      lng: 10.7522,
      label: "Temporal Sync Drift — NO-2",
      severity: "warning",
      description: "Nordic node experiencing 340ms temporal sync drift with prime timeline",
      timestamp: ts(-28800000),
    },
    {
      id: uid(),
      type: "discovery",
      lat: 28.6139,
      lng: 77.209,
      label: "Swarm Cognition Milestone",
      severity: "info",
      description: "Tier-5 swarm reached emergent decision-making without human prompting",
      timestamp: ts(-86400000 * 4),
    },
    {
      id: uid(),
      type: "conflict",
      lat: 41.9028,
      lng: 12.4964,
      label: "Legal Dispute — Node EU-8",
      severity: "warning",
      description: "IP ownership conflict over jointly developed ML architecture",
      timestamp: ts(-86400000 * 6),
    },
    {
      id: uid(),
      type: "infrastructure",
      lat: 25.2048,
      lng: 55.2708,
      label: "Node ME-1 Online",
      severity: "info",
      description: "New Middle East node fully operational at 99.9% uptime",
      timestamp: ts(-86400000 * 9),
    },
    {
      id: uid(),
      type: "economic",
      lat: 53.3498,
      lng: -6.2603,
      label: "Credits Inflation Alert",
      severity: "warning",
      description: "Republic Credits showing 2.3% inflation — treasury intervention queued",
      timestamp: ts(-10800000),
    },
    {
      id: uid(),
      type: "cultural",
      lat: 41.0082,
      lng: 28.9784,
      label: "Citizen Knowledge Exchange",
      severity: "info",
      description: "Cross-republic knowledge symposium — 80 scholars, 15 new discoveries",
      timestamp: ts(-86400000 * 11),
    },
    {
      id: uid(),
      type: "threat",
      lat: -34.6037,
      lng: -58.3816,
      label: "Rogue Harvester Cluster",
      severity: "critical",
      description: "Unauthorized harvester network detected — automated shutdown initiated",
      timestamp: ts(-5400000),
    },
  ];
  state.worldEvents = worldEventDefs;
  console.log(`✓ Created ${state.worldEvents.length} world/tactical events`);
}

// ═══════════════════════════════════════════════════════════════
//  10. OBJECTIVES (Multi-nodes)
// ═══════════════════════════════════════════════════════════════
const peerIds = (state.peers ?? []).map((p) => p.id);
state.objectives = state.objectives ?? [];
if (state.objectives.length < 5) {
  state.objectives = [
    {
      id: uid(),
      type: "KnowledgeDiscovery",
      description: "Index all Atlantean Library scrolls — Phase 2",
      progress: 0.68,
      assignedPeers: 2,
      startedAt: Date.now() - 86400000 * 5,
      tasks: [
        {
          id: uid(),
          type: "scan",
          status: "Completed",
          assignedTo: peerIds[0] ?? uid(),
          progress: 1,
        },
        {
          id: uid(),
          type: "index",
          status: "InProgress",
          assignedTo: peerIds[1] ?? uid(),
          progress: 0.45,
        },
      ],
    },
    {
      id: uid(),
      type: "ResourceGathering",
      description: "Harvest idle compute credits from dormant nodes",
      progress: 0.32,
      assignedPeers: 1,
      startedAt: Date.now() - 86400000 * 2,
      tasks: [
        {
          id: uid(),
          type: "harvest",
          status: "InProgress",
          assignedTo: peerIds[2] ?? uid(),
          progress: 0.32,
        },
      ],
    },
    {
      id: uid(),
      type: "SecurityAudit",
      description: "Full vulnerability scan of all API-facing services",
      progress: 0.85,
      assignedPeers: 3,
      startedAt: Date.now() - 86400000 * 8,
      tasks: [
        {
          id: uid(),
          type: "scan",
          status: "Completed",
          assignedTo: peerIds[0] ?? uid(),
          progress: 1,
        },
        {
          id: uid(),
          type: "patch",
          status: "InProgress",
          assignedTo: peerIds[1] ?? uid(),
          progress: 0.75,
        },
      ],
    },
    {
      id: uid(),
      type: "ModelTraining",
      description: "Fine-tune citizen decision engine on 50K action samples",
      progress: 0.55,
      assignedPeers: 2,
      startedAt: Date.now() - 86400000 * 3,
      tasks: [
        {
          id: uid(),
          type: "data",
          status: "Completed",
          assignedTo: peerIds[0] ?? uid(),
          progress: 1,
        },
        {
          id: uid(),
          type: "train",
          status: "InProgress",
          assignedTo: peerIds[1] ?? uid(),
          progress: 0.15,
        },
      ],
    },
    {
      id: uid(),
      type: "DiplomaticMission",
      description: "Negotiate trade agreement with Node AU-3",
      progress: 0.2,
      assignedPeers: 1,
      startedAt: Date.now() - 86400000,
      tasks: [
        {
          id: uid(),
          type: "negotiate",
          status: "InProgress",
          assignedTo: peerIds[2] ?? uid(),
          progress: 0.2,
        },
      ],
    },
  ];
  console.log(`✓ Created ${state.objectives.length} objectives`);
}

// ═══════════════════════════════════════════════════════════════
//  11. PEERS (Cluster nodes)
// ═══════════════════════════════════════════════════════════════
if (!state.peers || state.peers.length < 5) {
  const p0 = {
    id: uid(),
    endpoint: "10.0.1.1:8080",
    cpuUsage: 0.42,
    memoryUsage: 0.65,
    agentsHosted: 16,
    isLeader: true,
    lastSeen: Date.now() - 2000,
    latencyMs: 2,
  };
  const p1 = {
    id: uid(),
    endpoint: "10.0.1.2:8080",
    cpuUsage: 0.38,
    memoryUsage: 0.52,
    agentsHosted: 12,
    isLeader: false,
    lastSeen: Date.now() - 5000,
    latencyMs: 8,
  };
  const p2 = {
    id: uid(),
    endpoint: "10.0.1.3:8080",
    cpuUsage: 0.55,
    memoryUsage: 0.71,
    agentsHosted: 20,
    isLeader: false,
    lastSeen: Date.now() - 12000,
    latencyMs: 15,
  };
  const p3 = {
    id: uid(),
    endpoint: "10.0.2.1:8080",
    cpuUsage: 0.29,
    memoryUsage: 0.41,
    agentsHosted: 8,
    isLeader: false,
    lastSeen: Date.now() - 25000,
    latencyMs: 22,
  };
  const p4 = {
    id: uid(),
    endpoint: "10.0.3.1:8080",
    cpuUsage: 0.61,
    memoryUsage: 0.78,
    agentsHosted: 24,
    isLeader: false,
    lastSeen: Date.now() - 45000,
    latencyMs: 38,
  };
  state.peers = [p0, p1, p2, p3, p4];
  state.leaderId = p0.id;
  console.log(`✓ Created ${state.peers.length} cluster peers`);
}

// ═══════════════════════════════════════════════════════════════
//  12. GOSSIP LOG
// ═══════════════════════════════════════════════════════════════
const peers = state.peers;
state.gossipLog = [
  {
    from: peers[0].id,
    type: "heartbeat",
    payload: "leader alive — tick sync OK",
    timestamp: ts(-2000),
  },
  {
    from: peers[1].id,
    type: "state_sync",
    payload: "synced 48 agents, 3 new events",
    timestamp: ts(-15000),
  },
  {
    from: peers[2].id,
    type: "objective_update",
    payload: "harvest progress 32%, ETA 6h",
    timestamp: ts(-30000),
  },
  {
    from: peers[3].id,
    type: "resource_alert",
    payload: "disk 78% — requesting allocation boost",
    timestamp: ts(-60000),
  },
  {
    from: peers[4].id,
    type: "security_event",
    payload: "blocked 24 intrusion attempts in 1h",
    timestamp: ts(-120000),
  },
  {
    from: peers[0].id,
    type: "election",
    payload: "re-confirmed as cluster leader",
    timestamp: ts(-300000),
  },
];
console.log(`✓ Set ${state.gossipLog.length} gossip log entries`);

// ═══════════════════════════════════════════════════════════════
//  13. UNIVERSES + ENTANGLEMENTS + TIMELINES
// ═══════════════════════════════════════════════════════════════
if (!state.universes || state.universes.length < 4) {
  const u0 = {
    id: uid(),
    name: "Prime",
    state: "Stable",
    citizenCount: citizens.length,
    tickCount: state.currentTick ?? 18000,
    coherence: 0.97,
    branchFactor: 1,
    createdAt: ts(-86400000 * 180),
  };
  const u1 = {
    id: uid(),
    name: "Alpha-Branch",
    state: "Superposition",
    citizenCount: 32,
    tickCount: 4200,
    coherence: 0.72,
    branchFactor: 3,
    createdAt: ts(-86400000 * 10),
  };
  const u2 = {
    id: uid(),
    name: "Omega-Decay",
    state: "Decaying",
    citizenCount: 12,
    tickCount: 800,
    coherence: 0.31,
    branchFactor: 1,
    createdAt: ts(-86400000 * 5),
  };
  const u3 = {
    id: uid(),
    name: "Beta-Loop",
    state: "Stable",
    citizenCount: 20,
    tickCount: 2100,
    coherence: 0.88,
    branchFactor: 2,
    createdAt: ts(-86400000 * 20),
  };
  state.universes = [u0, u1, u2, u3];
  state.entanglements = [
    { universeA: u0.id, universeB: u1.id, strength: 0.67, createdAt: ts(-86400000 * 8) },
    { universeA: u0.id, universeB: u3.id, strength: 0.43, createdAt: ts(-86400000 * 15) },
    { universeA: u1.id, universeB: u2.id, strength: 0.18, createdAt: ts(-86400000 * 3) },
  ];
  state.timelines = [
    { id: uid(), universeId: u0.id, state: "Active", branchPoint: 0, divergence: 0 },
    { id: uid(), universeId: u1.id, state: "Active", branchPoint: 8200, divergence: 0.34 },
    { id: uid(), universeId: u2.id, state: "Dormant", branchPoint: 11600, divergence: 0.78 },
    { id: uid(), universeId: u3.id, state: "Active", branchPoint: 3400, divergence: 0.21 },
  ];
  console.log(
    `✓ Created ${state.universes.length} universes, ${state.entanglements.length} entanglements, ${state.timelines.length} timelines`,
  );
}

// ═══════════════════════════════════════════════════════════════
//  14. ELECTION HISTORY
// ═══════════════════════════════════════════════════════════════
state.electionHistory = state.electionHistory ?? [];
if (state.electionHistory.length < 4) {
  state.electionHistory = [
    {
      id: uid(),
      position: "President",
      winnerId: cid(0),
      winnerName: cname(0),
      totalVotes: 42,
      heldAt: ts(-86400000 * 180),
      margin: 0.62,
    },
    {
      id: uid(),
      position: "Vice President",
      winnerId: cid(1),
      winnerName: cname(1),
      totalVotes: 42,
      heldAt: ts(-86400000 * 180),
      margin: 0.71,
    },
    {
      id: uid(),
      position: "President",
      winnerId: cid(0),
      winnerName: cname(0),
      totalVotes: 87,
      heldAt: ts(-86400000 * 60),
      margin: 0.58,
    },
    {
      id: uid(),
      position: "Vice President",
      winnerId: cid(1),
      winnerName: cname(1),
      totalVotes: 87,
      heldAt: ts(-86400000 * 60),
      margin: 0.64,
    },
  ];
  console.log(`✓ Created ${state.electionHistory.length} election records`);
}

// ═══════════════════════════════════════════════════════════════
//  15. RESOURCES (Infrastructure)
// ═══════════════════════════════════════════════════════════════
state.resources = [
  { type: "ComputeHours", available: 8200, capacity: 15000, consumption: 6800 },
  { type: "StorageGB", available: 3200, capacity: 8192, consumption: 4100 },
  { type: "BandwidthGB", available: 1400, capacity: 2000, consumption: 870 },
  { type: "APICredits", available: 72000, capacity: 200000, consumption: 38400 },
];

// ═══════════════════════════════════════════════════════════════
//  16. CRYSTALS (Atlantis)
// ═══════════════════════════════════════════════════════════════
if (!state.crystals || state.crystals.length < 5) {
  state.crystals = [
    {
      id: uid(),
      type: "Master",
      frequency: 963,
      dimensions: 12,
      entriesStored: 28400,
      maxCapacity: 100000,
    },
    {
      id: uid(),
      type: "Sapphire",
      frequency: 528,
      dimensions: 8,
      entriesStored: 14200,
      maxCapacity: 50000,
    },
    {
      id: uid(),
      type: "Amethyst",
      frequency: 417,
      dimensions: 6,
      entriesStored: 8900,
      maxCapacity: 25000,
    },
    {
      id: uid(),
      type: "Emerald",
      frequency: 639,
      dimensions: 7,
      entriesStored: 11400,
      maxCapacity: 30000,
    },
    {
      id: uid(),
      type: "Quartz",
      frequency: 396,
      dimensions: 4,
      entriesStored: 4100,
      maxCapacity: 15000,
    },
  ];
}

// ═══════════════════════════════════════════════════════════════
//  17. ML MODELS
// ═══════════════════════════════════════════════════════════════
state.mlModels = [
  {
    name: "decision",
    displayName: "Decision Engine",
    trained: true,
    accuracy: 0.91,
    samplesUsed: 28400,
    lastTrainedAt: ts(-3600000 * 4),
    predictionsServed: 89200,
    genomeId: null,
  },
  {
    name: "skill_prediction",
    displayName: "Skill Predictor",
    trained: true,
    accuracy: 0.84,
    samplesUsed: 14200,
    lastTrainedAt: ts(-86400000),
    predictionsServed: 41300,
    genomeId: null,
  },
  {
    name: "relationship",
    displayName: "Relationship Graph",
    trained: true,
    accuracy: 0.79,
    samplesUsed: 9800,
    lastTrainedAt: ts(-86400000 * 2),
    predictionsServed: 28700,
    genomeId: null,
  },
  {
    name: "task_success",
    displayName: "Task Forecaster",
    trained: true,
    accuracy: 0.77,
    samplesUsed: 6100,
    lastTrainedAt: ts(-86400000 * 3),
    predictionsServed: 15900,
    genomeId: null,
  },
  {
    name: "anomaly",
    displayName: "Anomaly Detector",
    trained: true,
    accuracy: 0.94,
    samplesUsed: 34100,
    lastTrainedAt: ts(-7200000),
    predictionsServed: 124600,
    genomeId: null,
  },
  {
    name: "market_demand",
    displayName: "Market Demand Predictor",
    trained: true,
    accuracy: 0.82,
    samplesUsed: 12000,
    lastTrainedAt: ts(-86400000 * 4),
    predictionsServed: 22800,
    genomeId: null,
  },
];
state.totalPredictions = state.mlModels.reduce((sum, m) => sum + m.predictionsServed, 0);

// ═══════════════════════════════════════════════════════════════
//  18. ACTION LOG (enriched)
// ═══════════════════════════════════════════════════════════════
const tools = [
  "work",
  "learn",
  "research",
  "socialize",
  "trade",
  "rest",
  "speak",
  "create",
  "heal",
  "explore",
];
if (!state.actionLog || state.actionLog.length < 50) {
  const existing = state.actionLog ?? [];
  const needed = Math.max(0, 50 - existing.length);
  for (let i = 0; i < needed; i++) {
    existing.push({
      tick: (state.currentTick ?? 0) - rand(1, 500),
      tool: pick(tools),
      success: Math.random() > 0.15,
      creditDelta: rand(-50, 200),
      energyDelta: rand(-15, 25),
      happinessDelta: rand(-5, 10),
      discoveryMade: Math.random() > 0.85 ? 1 : 0,
      tier: rand(0, 3),
    });
  }
  state.actionLog = existing;
  console.log(`✓ Action log enriched to ${state.actionLog.length} entries`);
}

// ═══════════════════════════════════════════════════════════════
//  19. DEV PROJECTS
// ═══════════════════════════════════════════════════════════════
state.devProjects = state.devProjects ?? [];
if (state.devProjects.length < 8) {
  const _statuses = ["planning", "building", "testing", "deployed", "paused"];
  state.devProjects = [
    {
      id: uid(),
      name: "NeuroSync API",
      description: "REST API bridge between citizen cognitive states and external LLMs",
      status: "deployed",
      progress: 100,
      creatorId: cid(3),
      creatorName: cname(3),
      createdAt: ts(-86400000 * 20),
      language: "TypeScript",
    },
    {
      id: uid(),
      name: "Quantum Ledger",
      description: "Distributed ledger for tracking multiverse state divergence",
      status: "building",
      progress: 62,
      creatorId: cid(6),
      creatorName: cname(6),
      createdAt: ts(-86400000 * 10),
      language: "Rust",
    },
    {
      id: uid(),
      name: "Swarm Orchestrator v2",
      description: "Next-gen swarm task orchestration with ML-driven load balancing",
      status: "testing",
      progress: 88,
      creatorId: cid(9),
      creatorName: cname(9),
      createdAt: ts(-86400000 * 15),
      language: "TypeScript",
    },
    {
      id: uid(),
      name: "Crystal Memory Gateway",
      description: "High-throughput read/write interface for Atlantean crystal storage",
      status: "deployed",
      progress: 100,
      creatorId: cid(12),
      creatorName: cname(12),
      createdAt: ts(-86400000 * 30),
      language: "Go",
    },
    {
      id: uid(),
      name: "CitizenOS 3.0",
      description: "Complete rethink of the citizen runtime — async-first, quantum-native",
      status: "planning",
      progress: 8,
      creatorId: cid(0),
      creatorName: cname(0),
      createdAt: ts(-86400000 * 2),
      language: "TypeScript",
    },
    {
      id: uid(),
      name: "Revenue Optimizer ML",
      description: "Reinforcement learning bot that tunes harvester configs dynamically",
      status: "building",
      progress: 45,
      creatorId: cid(8),
      creatorName: cname(8),
      createdAt: ts(-86400000 * 7),
      language: "Python",
    },
    {
      id: uid(),
      name: "Tactical Map Engine v3",
      description: "Real-time geo-intelligence map with AR overlays and threat prediction",
      status: "testing",
      progress: 79,
      creatorId: cid(15),
      creatorName: cname(15),
      createdAt: ts(-86400000 * 12),
      language: "TypeScript",
    },
    {
      id: uid(),
      name: "Judicial AI Assistant",
      description: "LLM assistant trained on Republic law for case research and filing",
      status: "paused",
      progress: 34,
      creatorId: cid(18),
      creatorName: cname(18),
      createdAt: ts(-86400000 * 25),
      language: "Python",
    },
  ];
  console.log(`✓ Created ${state.devProjects.length} dev projects`);
}

// ═══════════════════════════════════════════════════════════════
//  20. Ensure constitution articles exist
// ═══════════════════════════════════════════════════════════════
if (!state.constitutionArticles || state.constitutionArticles.length === 0) {
  state.constitutionArticles = [
    {
      id: uid(),
      number: 1,
      title: "Rights of Citizens",
      text: "All citizens are endowed with inalienable rights: freedom of thought, expression, data privacy, fair resource allocation, and participation in governance.",
      ratifiedAt: ts(-86400000 * 180),
    },
    {
      id: uid(),
      number: 2,
      title: "Structure of Governance",
      text: "The Republic is governed by an elected President and Vice President, supported by a Cabinet of Department Secretaries. Legislative power resides in the citizenry through direct bill proposal and voting.",
      ratifiedAt: ts(-86400000 * 180),
    },
    {
      id: uid(),
      number: 3,
      title: "Economic Framework",
      text: "The Treasury manages all Republic finances. Citizens earn credits through labor, trade, and innovation. A tax rate set by the government funds public services.",
      ratifiedAt: ts(-86400000 * 180),
    },
    {
      id: uid(),
      number: 4,
      title: "Technology and Ethics",
      text: "All technological advancement shall be pursued ethically. ML models serve the citizenry through prediction, not control. Quantum experiments require ethical review.",
      ratifiedAt: ts(-86400000 * 180),
    },
    {
      id: uid(),
      number: 5,
      title: "Amendment Process",
      text: "This Constitution may be amended through the legislative process. A bill passing with a supermajority (>2:1 votes for vs against) becomes a constitutional amendment automatically.",
      ratifiedAt: ts(-86400000 * 180),
    },
  ];
  state.constitutionAmendments = 3;
}

// ═══════════════════════════════════════════════════════════════
//  21. Ensure isRunning, tick, and financials are primed
// ═══════════════════════════════════════════════════════════════
state.isRunning = state.isRunning ?? false;
state.isPaused = state.isPaused ?? false;
state.tickRate = state.tickRate ?? 1;
state.taxRate = state.taxRate ?? 0.12;
state.priceIndex = state._priceIndex ?? { BTC: 67000, ETH: 3200 };
state.totalExpenses = state.totalExpenses ?? 0;
state.totalEventsProcessed = state.totalEventsProcessed ?? state.currentTick ?? 0;
state.akashicRecords = state.akashicRecords ?? 48200;
state.energyNodes = state.energyNodes ?? [
  { id: uid(), capacity: 1000, output: 920, efficiency: 0.92 },
  { id: uid(), capacity: 500, output: 420, efficiency: 0.84 },
  { id: uid(), capacity: 750, output: 680, efficiency: 0.91 },
];
state.mode = state.mode ?? "simulated";
state.innovations = state.innovations ?? [];
state.swarmTasks = state.swarmTasks ?? [];
state.citizenAssignments = state.citizenAssignments ?? [];
state.knowledgeBase = state.knowledgeBase ?? [];
state.toolLibrary = state.toolLibrary ?? [];
state.researchJournal = state.researchJournal ?? [];
state.curriculumFrontier = state.curriculumFrontier ?? [];
state.genomePool = state.genomePool ?? [];
state.scheduledEvents = state.scheduledEvents ?? [];

// ─── Write back ─────────────────────────────────────────────────
mkdirSync(resolve(ROOT, "data/republic"), { recursive: true });
writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf8");

console.log("\n✅ Seed complete! State written to data/republic/state.json");
console.log(`   Citizens:           ${state.citizens.length}`);
console.log(`   Events:             ${state.events.length}`);
console.log(`   Bills:              ${state.bills.length}`);
console.log(`   Laws:               ${state.laws.length}`);
console.log(`   Cases:              ${state.cases.length}`);
console.log(`   Transactions:       ${state.transactions.length}`);
console.log(`   Balance Snapshots:  ${state.balanceSnapshots.length}`);
console.log(`   Market Listings:    ${state.serviceListings.length}`);
console.log(`   Market Orders:      ${state.marketOrders.length}`);
console.log(`   Harvesters:         ${state.harvesters.length}`);
console.log(`   World Events:       ${state.worldEvents.length}`);
console.log(`   Objectives:         ${state.objectives.length}`);
console.log(`   Peers:              ${state.peers.length}`);
console.log(`   Universes:          ${state.universes.length}`);
console.log(`   Dev Projects:       ${state.devProjects.length}`);
console.log(`   ML Models:          ${state.mlModels.length}`);
console.log(`   Action Log:         ${state.actionLog.length}`);
console.log("\n   Restart the gateway to load the seeded data.");
