/**
 * Republic Platform — Autonomous Economic Agency
 *
 * Phase 38: x402 / Virtuals / DAOs-inspired autonomous economy.
 *
 * Citizens can earn, spend, and trade autonomously. Internal
 * marketplace with service offerings, task bidding, revenue
 * sharing, and collective treasury management via DAO voting.
 *
 * Research basis:
 * - Coinbase x402 (2025): AI agents transacting crypto autonomously
 * - Virtuals Protocol: agents with wallets, tokens, objectives
 * - "Economies of Minds": self-resource allocation in agent systems
 * - DAOs: governance for autonomous economic actors
 *
 * Key capabilities:
 * 1. Internal marketplace (offer/purchase services)
 * 2. Task bidding and revenue earning
 * 3. Autonomous spending decisions
 * 4. Treasury DAO (collective expenditure voting)
 * 5. Revenue sharing among contributors
 * 6. economyAgencyTick() — tick loop integration
 */

import { ts, uid } from "./utils.js";

// ─── Marketplace ────────────────────────────────────────────────

export interface ServiceListing {
  id: string;
  /** Provider citizen ID */
  providerId: string;
  /** Service title */
  title: string;
  /** Description */
  description: string;
  /** Category */
  category: "computation" | "knowledge" | "creative" | "analysis" | "communication" | "labor";
  /** Price in credits */
  priceCredits: number;
  /** Average quality rating (0.0–5.0) */
  rating: number;
  /** Number of ratings */
  ratingCount: number;
  /** Whether this listing is active */
  active: boolean;
  /** Number of times purchased */
  salesCount: number;
  /** When listed */
  listedAt: string;
}

export interface ServicePurchase {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  priceCredits: number;
  status: "pending" | "in_progress" | "completed" | "disputed" | "refunded";
  rating?: number;
  tick: number;
  timestamp: string;
}

// ─── Task Bidding ───────────────────────────────────────────────

export interface TaskOffer {
  id: string;
  /** Who's offering the task */
  offeredBy: string;
  /** Task description */
  description: string;
  /** Budget in credits */
  budgetCredits: number;
  /** Required skills */
  requiredSkills: string[];
  /** Deadline in ticks */
  deadlineTick: number;
  /** Current bids */
  bids: TaskBid[];
  /** Status */
  status: "open" | "assigned" | "completed" | "expired";
  /** Assigned citizen */
  assignedTo?: string;
  /** Tick when created */
  createdAtTick: number;
  /** Timestamp */
  timestamp: string;
}

export interface TaskBid {
  citizenId: string;
  proposedCredits: number;
  pitch: string;
  timestamp: string;
}

// ─── Treasury DAO ───────────────────────────────────────────────

export interface TreasuryProposal {
  id: string;
  /** Proposer */
  proposerId: string;
  /** What the expenditure is for */
  description: string;
  /** Amount requested */
  amountCredits: number;
  /** Category */
  category: "infrastructure" | "research" | "education" | "defense" | "welfare" | "expansion";
  /** Votes */
  votes: Map<string, "for" | "against">;
  /** Status */
  status: "voting" | "approved" | "rejected" | "executed";
  /** Approval threshold (0.0–1.0) */
  threshold: number;
  /** Tick when created */
  createdAtTick: number;
  /** Expiry tick */
  expiryTick: number;
  /** Timestamp */
  timestamp: string;
}

// ─── Revenue Distribution ───────────────────────────────────────

export interface RevenueRecord {
  id: string;
  /** Source of revenue */
  source: string;
  /** Total amount */
  totalCredits: number;
  /** Distribution: citizenId → share */
  distribution: Map<string, number>;
  /** Tick */
  tick: number;
  /** Timestamp */
  timestamp: string;
}

// ─── State ──────────────────────────────────────────────────────

const listings = new Map<string, ServiceListing>();
const purchases: ServicePurchase[] = [];
const taskOffers = new Map<string, TaskOffer>();
const treasuryProposals = new Map<string, TreasuryProposal>();
const revenueHistory: RevenueRecord[] = [];

let treasuryBalance = 1000; // Starting treasury

const MAX_LISTINGS = 500;
const MAX_PURCHASES = 1000;
const MAX_TASKS = 200;
const MAX_PROPOSALS = 100;
const MAX_REVENUE_HISTORY = 200;
const PROPOSAL_DURATION_TICKS = 50;
const TREASURY_CHECK_INTERVAL = 25;

// ─── Marketplace Operations ─────────────────────────────────────

/** Create a service listing */
export function createServiceListing(
  providerId: string,
  title: string,
  description: string,
  category: ServiceListing["category"],
  priceCredits: number,
): ServiceListing {
  const listing: ServiceListing = {
    id: `svc-${uid().slice(0, 8)}`,
    providerId,
    title,
    description,
    category,
    priceCredits,
    rating: 0,
    ratingCount: 0,
    active: true,
    salesCount: 0,
    listedAt: ts(),
  };

  listings.set(listing.id, listing);

  // Trim
  if (listings.size > MAX_LISTINGS) {
    const inactive = [...listings.entries()]
      .filter(([, l]) => !l.active)
      .toSorted((a, b) => a[1].salesCount - b[1].salesCount);
    for (const [id] of inactive.slice(0, inactive.length - MAX_LISTINGS + listings.size)) {
      listings.delete(id);
    }
  }

  return listing;
}

/** Purchase a service */
export function purchaseService(
  listingId: string,
  buyerId: string,
  currentTick: number,
): { success: boolean; purchase?: ServicePurchase; error?: string } {
  const listing = listings.get(listingId);
  if (!listing) {
    return { success: false, error: "Listing not found" };
  }
  if (!listing.active) {
    return { success: false, error: "Listing is inactive" };
  }
  if (listing.providerId === buyerId) {
    return { success: false, error: "Cannot buy own service" };
  }

  const purchase: ServicePurchase = {
    id: `pur-${uid().slice(0, 8)}`,
    listingId,
    buyerId,
    sellerId: listing.providerId,
    priceCredits: listing.priceCredits,
    status: "pending",
    tick: currentTick,
    timestamp: ts(),
  };

  purchases.push(purchase);
  listing.salesCount++;

  while (purchases.length > MAX_PURCHASES) {
    purchases.shift();
  }

  return { success: true, purchase };
}

/** Rate a completed purchase */
export function rateService(purchaseId: string, rating: number): boolean {
  const purchase = purchases.find((p) => p.id === purchaseId);
  if (!purchase || purchase.status !== "completed") {
    return false;
  }

  purchase.rating = Math.max(0, Math.min(5, rating));

  // Update listing average rating
  const listing = listings.get(purchase.listingId);
  if (listing) {
    const totalRating = listing.rating * listing.ratingCount + rating;
    listing.ratingCount++;
    listing.rating = totalRating / listing.ratingCount;
  }

  return true;
}

/** Search marketplace listings */
export function searchListings(opts?: {
  category?: ServiceListing["category"];
  maxPrice?: number;
  minRating?: number;
}): ServiceListing[] {
  let results = [...listings.values()].filter((l) => l.active);

  if (opts?.category) {
    results = results.filter((l) => l.category === opts.category);
  }
  if (opts?.maxPrice) {
    results = results.filter((l) => l.priceCredits <= opts.maxPrice!);
  }
  if (opts?.minRating) {
    results = results.filter((l) => l.rating >= opts.minRating! || l.ratingCount === 0);
  }

  return results.toSorted((a, b) => b.rating - a.rating);
}

// ─── Task Bidding ───────────────────────────────────────────────

/** Create a task offer */
export function createTaskOffer(
  offeredBy: string,
  description: string,
  budgetCredits: number,
  requiredSkills: string[],
  deadlineTick: number,
  currentTick: number,
): TaskOffer {
  const task: TaskOffer = {
    id: `task-${uid().slice(0, 8)}`,
    offeredBy,
    description,
    budgetCredits,
    requiredSkills,
    deadlineTick,
    bids: [],
    status: "open",
    createdAtTick: currentTick,
    timestamp: ts(),
  };

  taskOffers.set(task.id, task);

  // Trim
  if (taskOffers.size > MAX_TASKS) {
    const expired = [...taskOffers.entries()]
      .filter(([, t]) => t.status === "expired" || t.status === "completed")
      .toSorted((a, b) => a[1].createdAtTick - b[1].createdAtTick);
    for (const [id] of expired.slice(0, expired.length - MAX_TASKS + taskOffers.size)) {
      taskOffers.delete(id);
    }
  }

  return task;
}

/** Submit a bid on a task */
export function submitBid(
  taskId: string,
  citizenId: string,
  proposedCredits: number,
  pitch: string,
): { success: boolean; error?: string } {
  const task = taskOffers.get(taskId);
  if (!task) {
    return { success: false, error: "Task not found" };
  }
  if (task.status !== "open") {
    return { success: false, error: "Task is not open for bids" };
  }
  if (task.offeredBy === citizenId) {
    return { success: false, error: "Cannot bid on own task" };
  }

  task.bids.push({
    citizenId,
    proposedCredits,
    pitch,
    timestamp: ts(),
  });

  return { success: true };
}

/** Accept a bid and assign the task */
export function acceptBid(taskId: string, citizenId: string): { success: boolean; error?: string } {
  const task = taskOffers.get(taskId);
  if (!task) {
    return { success: false, error: "Task not found" };
  }
  if (task.status !== "open") {
    return { success: false, error: "Task is not open" };
  }

  const bid = task.bids.find((b) => b.citizenId === citizenId);
  if (!bid) {
    return { success: false, error: "Bid not found" };
  }

  task.status = "assigned";
  task.assignedTo = citizenId;
  return { success: true };
}

// ─── Treasury DAO ───────────────────────────────────────────────

/** Get treasury balance */
export function getTreasuryBalance(): number {
  return treasuryBalance;
}

/** Add credits to treasury */
export function addToTreasury(amount: number, _source: string): void {
  treasuryBalance += amount;
}

/** Create a treasury expenditure proposal */
export function createTreasuryProposal(
  proposerId: string,
  description: string,
  amountCredits: number,
  category: TreasuryProposal["category"],
  currentTick: number,
): TreasuryProposal {
  const proposal: TreasuryProposal = {
    id: `tprop-${uid().slice(0, 8)}`,
    proposerId,
    description,
    amountCredits,
    category,
    votes: new Map(),
    status: "voting",
    threshold: 0.5,
    createdAtTick: currentTick,
    expiryTick: currentTick + PROPOSAL_DURATION_TICKS,
    timestamp: ts(),
  };

  treasuryProposals.set(proposal.id, proposal);

  if (treasuryProposals.size > MAX_PROPOSALS) {
    const old = [...treasuryProposals.entries()]
      .filter(([, p]) => p.status !== "voting")
      .toSorted((a, b) => a[1].createdAtTick - b[1].createdAtTick);
    for (const [id] of old.slice(0, old.length - MAX_PROPOSALS + treasuryProposals.size)) {
      treasuryProposals.delete(id);
    }
  }

  return proposal;
}

/** Vote on a treasury proposal */
export function voteOnTreasuryProposal(
  proposalId: string,
  citizenId: string,
  vote: "for" | "against",
): { success: boolean; error?: string } {
  const proposal = treasuryProposals.get(proposalId);
  if (!proposal) {
    return { success: false, error: "Proposal not found" };
  }
  if (proposal.status !== "voting") {
    return { success: false, error: "Voting closed" };
  }

  proposal.votes.set(citizenId, vote);
  return { success: true };
}

/** Tally treasury proposal votes */
function tallyTreasuryProposal(proposal: TreasuryProposal): void {
  let forVotes = 0;
  let againstVotes = 0;

  for (const vote of proposal.votes.values()) {
    if (vote === "for") {
      forVotes++;
    } else {
      againstVotes++;
    }
  }

  const total = forVotes + againstVotes;
  if (total === 0) {
    proposal.status = "rejected";
    return;
  }

  if (forVotes / total >= proposal.threshold) {
    if (treasuryBalance >= proposal.amountCredits) {
      treasuryBalance -= proposal.amountCredits;
      proposal.status = "approved";
    } else {
      proposal.status = "rejected"; // Insufficient funds
    }
  } else {
    proposal.status = "rejected";
  }
}

// ─── Revenue Distribution ───────────────────────────────────────

/**
 * Distribute revenue among contributing citizens.
 *
 * Contributors receive shares based on their contribution weight.
 */
export function distributeRevenue(
  source: string,
  totalCredits: number,
  contributions: Map<string, number>, // citizenId → weight
  currentTick: number,
): RevenueRecord {
  const totalWeight = [...contributions.values()].reduce((sum, w) => sum + w, 0);

  const distribution = new Map<string, number>();
  if (totalWeight > 0) {
    for (const [citizenId, weight] of contributions) {
      distribution.set(citizenId, Math.floor((weight / totalWeight) * totalCredits));
    }
  }

  // Treasury gets the remainder
  const distributed = [...distribution.values()].reduce((sum, v) => sum + v, 0);
  const remainder = totalCredits - distributed;
  if (remainder > 0) {
    treasuryBalance += remainder;
  }

  const record: RevenueRecord = {
    id: `rev-${uid().slice(0, 8)}`,
    source,
    totalCredits,
    distribution,
    tick: currentTick,
    timestamp: ts(),
  };

  revenueHistory.push(record);
  while (revenueHistory.length > MAX_REVENUE_HISTORY) {
    revenueHistory.shift();
  }

  return record;
}

// ─── Tick Integration ───────────────────────────────────────────

export interface EconomyAgencyTickResult {
  activeListings: number;
  openTasks: number;
  treasuryBalance: number;
  proposalsResolved: number;
  tasksExpired: number;
}

/**
 * Per-tick maintenance for autonomous economy.
 *
 * - Expire old task offers
 * - Tally treasury proposals
 * - Auto-complete pending purchases
 */
export function economyAgencyTick(currentTick: number): EconomyAgencyTickResult {
  let proposalsResolved = 0;
  let tasksExpired = 0;

  if (currentTick <= 0 || currentTick % TREASURY_CHECK_INTERVAL !== 0) {
    return {
      activeListings: [...listings.values()].filter((l) => l.active).length,
      openTasks: [...taskOffers.values()].filter((t) => t.status === "open").length,
      treasuryBalance,
      proposalsResolved,
      tasksExpired,
    };
  }

  // Tally expired treasury proposals
  for (const proposal of treasuryProposals.values()) {
    if (proposal.status === "voting" && currentTick >= proposal.expiryTick) {
      tallyTreasuryProposal(proposal);
      proposalsResolved++;
    }
  }

  // Expire overdue task offers
  for (const task of taskOffers.values()) {
    if (task.status === "open" && currentTick >= task.deadlineTick) {
      task.status = "expired";
      tasksExpired++;
    }
  }

  // Auto-complete old pending purchases (simulated fulfillment)
  for (const purchase of purchases) {
    if (purchase.status === "pending" && currentTick - purchase.tick > 10) {
      purchase.status = "completed";
    }
  }

  return {
    activeListings: [...listings.values()].filter((l) => l.active).length,
    openTasks: [...taskOffers.values()].filter((t) => t.status === "open").length,
    treasuryBalance,
    proposalsResolved,
    tasksExpired,
  };
}

// ─── Diagnostics ────────────────────────────────────────────────

export function economyAgencyDiagnostics() {
  return {
    activeListings: [...listings.values()].filter((l) => l.active).length,
    totalSales: purchases.length,
    openTasks: [...taskOffers.values()].filter((t) => t.status === "open").length,
    treasuryBalance,
    activeProposals: [...treasuryProposals.values()].filter((p) => p.status === "voting").length,
    revenueDistributions: revenueHistory.length,
  };
}

/** Reset economy agency state (for testing) */
export function resetEconomyAgencyState(): void {
  listings.clear();
  purchases.length = 0;
  taskOffers.clear();
  treasuryProposals.clear();
  revenueHistory.length = 0;
  treasuryBalance = 1000;
}
