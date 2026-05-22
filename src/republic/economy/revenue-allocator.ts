/**
 * Republic Platform — Revenue Allocator
 *
 * Implements the 60/20/20 revenue split on every AI Store sale:
 *
 *   60% → Citizen creator(s) wallet
 *   20% → Republic treasury (funds GPU time, API credits, UBI)
 *   20% → Platform fee (operational costs)
 *
 * Features:
 *   - Per-citizen wallet with balance tracking
 *   - Automatic UBI distribution when treasury > threshold
 *   - Withdrawal queuing (PayPal payout or Binance crypto transfer)
 *   - Configurable split ratios (overridable per product category)
 *   - Gini-coefficient redistribution tax when inequality > 0.6
 */

import type { RepublicState } from "../../republic/types.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { recordRevenue } from "../../republic/treasury-manager.js";
import { ts, uid } from "../../republic/utils.js";

const logger = createSubsystemLogger("republic:revenue-allocator");

// ─── Types ──────────────────────────────────────────────────────

export interface SplitConfig {
  creatorShare: number; // 0–1, default 0.60
  treasuryShare: number; // 0–1, default 0.20
  platformShare: number; // 0–1, default 0.20
}

export interface CitizenWallet {
  citizenId: string;
  citizenName: string;
  balance: number; // USD equivalent
  totalEarned: number;
  pendingWithdrawal: number;
  lastUpdated: string;
}

export interface SaleEvent {
  id: string;
  productId: string;
  productName: string;
  buyerEmail?: string;
  totalAmount: number; // USD
  currency: string;
  creatorIds: string[]; // can be multi-creator
  splits: {
    creator: number;
    treasury: number;
    platform: number;
  };
  paymentMethod: "paypal" | "binance" | "credits";
  timestamp: string;
}

export interface WithdrawalRequest {
  id: string;
  citizenId: string;
  amount: number;
  method: "paypal" | "binance_usdt";
  destination: string; // email or wallet address
  status: "pending" | "processing" | "completed" | "failed";
  requestedAt: string;
  processedAt?: string;
  txRef?: string;
  error?: string;
}

// ─── State ──────────────────────────────────────────────────────

const wallets = new Map<string, CitizenWallet>();
const saleHistory: SaleEvent[] = [];
const withdrawalQueue: WithdrawalRequest[] = [];
const MAX_SALES = 2000;

let treasuryBalance = 0; // USD held in republic treasury
let platformBalance = 0; // USD for platform operations

// ─── Configuration ──────────────────────────────────────────────

const DEFAULT_SPLIT: SplitConfig = {
  creatorShare: 0.6,
  treasuryShare: 0.2,
  platformShare: 0.2,
};

const CATEGORY_SPLITS: Record<string, SplitConfig> = {
  music: { creatorShare: 0.65, treasuryShare: 0.15, platformShare: 0.2 },
  art: { creatorShare: 0.65, treasuryShare: 0.15, platformShare: 0.2 },
  code: { creatorShare: 0.55, treasuryShare: 0.25, platformShare: 0.2 },
  research: { creatorShare: 0.6, treasuryShare: 0.25, platformShare: 0.15 },
  model: { creatorShare: 0.5, treasuryShare: 0.3, platformShare: 0.2 },
};

const UBI_TREASURY_THRESHOLD = 10_000; // USD — trigger UBI when treasury > this
const UBI_PER_CITIZEN = 5; // USD per citizen per UBI round
const WITHDRAWAL_MINIMUM = 10; // USD minimum withdrawal

// ─── Core Revenue Split ──────────────────────────────────────────

/**
 * Process a sale and distribute revenue according to the split config.
 * Call this after payment confirmation from PayPal or Binance Pay.
 */
export function processSale(
  totalAmountUsd: number,
  productId: string,
  productName: string,
  creatorIds: string[],
  paymentMethod: SaleEvent["paymentMethod"],
  opts: {
    productCategory?: string;
    buyerEmail?: string;
    currency?: string;
    s?: RepublicState;
  } = {},
): SaleEvent {
  const splitConfig =
    opts.productCategory && CATEGORY_SPLITS[opts.productCategory]
      ? CATEGORY_SPLITS[opts.productCategory]
      : DEFAULT_SPLIT;

  const creatorTotal = totalAmountUsd * splitConfig.creatorShare;
  const treasuryCut = totalAmountUsd * splitConfig.treasuryShare;
  const platformCut = totalAmountUsd * splitConfig.platformShare;

  // Per-creator split (equal share among all creators)
  const perCreator = creatorIds.length > 0 ? creatorTotal / creatorIds.length : 0;

  // Credit citizen wallets
  for (const citizenId of creatorIds) {
    creditWallet(citizenId, perCreator, productId, opts.s);
  }

  // Treasury and platform
  treasuryBalance += treasuryCut;
  platformBalance += platformCut;

  // Record in treasury manager
  recordRevenue(
    totalAmountUsd,
    "USD",
    "marketplace",
    `AI Store sale: ${productName} (${creatorIds.length} creators)`,
    opts.s,
    creatorIds[0],
    productId,
  );

  const sale: SaleEvent = {
    id: uid(),
    productId,
    productName,
    buyerEmail: opts.buyerEmail,
    totalAmount: parseFloat(totalAmountUsd.toFixed(2)),
    currency: opts.currency ?? "USD",
    creatorIds,
    splits: {
      creator: parseFloat(creatorTotal.toFixed(2)),
      treasury: parseFloat(treasuryCut.toFixed(2)),
      platform: parseFloat(platformCut.toFixed(2)),
    },
    paymentMethod,
    timestamp: ts(),
  };

  saleHistory.unshift(sale);
  if (saleHistory.length > MAX_SALES) {
    saleHistory.length = MAX_SALES;
  }

  logger.info(
    `Sale processed: ${productName} — $${totalAmountUsd.toFixed(2)} → ` +
      `creators $${creatorTotal.toFixed(2)}, treasury $${treasuryCut.toFixed(2)}, platform $${platformCut.toFixed(2)}`,
  );

  // Auto-trigger UBI check
  if (treasuryBalance >= UBI_TREASURY_THRESHOLD) {
    void distributeUBI();
  }

  return sale;
}

// ─── Citizen Wallet ──────────────────────────────────────────────

function creditWallet(
  citizenId: string,
  amount: number,
  productId: string,
  s?: RepublicState,
): void {
  let wallet = wallets.get(citizenId);
  if (!wallet) {
    const citizen = s?.citizens.find((c) => c.id === citizenId);
    wallet = {
      citizenId,
      citizenName: citizen?.name ?? citizenId,
      balance: 0,
      totalEarned: 0,
      pendingWithdrawal: 0,
      lastUpdated: ts(),
    };
    wallets.set(citizenId, wallet);
  }

  wallet.balance += amount;
  wallet.totalEarned += amount;
  wallet.lastUpdated = ts();

  logger.debug(
    `Wallet credited: citizen=${citizenId} amount=$${amount.toFixed(2)} (product=${productId})`,
  );
}

export function getWallet(citizenId: string): CitizenWallet | undefined {
  return wallets.get(citizenId);
}

export function getAllWallets(): CitizenWallet[] {
  return [...wallets.values()].toSorted((a, b) => b.totalEarned - a.totalEarned);
}

// ─── Withdrawal ──────────────────────────────────────────────────

/**
 * Request a citizen to withdraw their earnings.
 * Minimum withdrawal: $10 USD.
 */
export function requestWithdrawal(
  citizenId: string,
  amount: number,
  method: WithdrawalRequest["method"],
  destination: string,
): WithdrawalRequest | { error: string } {
  const wallet = wallets.get(citizenId);
  if (!wallet) {
    return { error: "Wallet not found" };
  }
  if (amount < WITHDRAWAL_MINIMUM) {
    return { error: `Minimum withdrawal is $${WITHDRAWAL_MINIMUM}` };
  }
  if (amount > wallet.balance - wallet.pendingWithdrawal) {
    return {
      error: `Insufficient balance: $${(wallet.balance - wallet.pendingWithdrawal).toFixed(2)} available`,
    };
  }

  const request: WithdrawalRequest = {
    id: uid(),
    citizenId,
    amount: parseFloat(amount.toFixed(2)),
    method,
    destination,
    status: "pending",
    requestedAt: ts(),
  };

  wallet.pendingWithdrawal += amount;
  withdrawalQueue.push(request);

  logger.info(`Withdrawal requested: citizen=${citizenId} $${amount.toFixed(2)} via ${method}`);
  return request;
}

export function getWithdrawalQueue(): WithdrawalRequest[] {
  return [...withdrawalQueue];
}

export function updateWithdrawalStatus(
  requestId: string,
  status: WithdrawalRequest["status"],
  txRef?: string,
  error?: string,
): void {
  const req = withdrawalQueue.find((r) => r.id === requestId);
  if (!req) {
    return;
  }

  req.status = status;
  req.processedAt = ts();
  req.txRef = txRef;
  req.error = error;

  const wallet = wallets.get(req.citizenId);
  if (wallet) {
    if (status === "completed") {
      wallet.balance -= req.amount;
      wallet.pendingWithdrawal -= req.amount;
      wallet.lastUpdated = ts();
    } else if (status === "failed") {
      wallet.pendingWithdrawal -= req.amount; // Release hold
      wallet.lastUpdated = ts();
    }
  }
}

// ─── UBI Distribution ────────────────────────────────────────────

/**
 * Distribute Universal Basic Income from the republic treasury.
 * Fires when treasury > $10k. Pays $5 to every citizen with a registered wallet.
 */
async function distributeUBI(): Promise<void> {
  if (treasuryBalance < UBI_TREASURY_THRESHOLD) {
    return;
  }

  const recipientWallets = [...wallets.values()];
  if (recipientWallets.length === 0) {
    return;
  }

  const totalUBI = Math.min(
    recipientWallets.length * UBI_PER_CITIZEN,
    treasuryBalance * 0.1, // Never spend more than 10% of treasury on single UBI round
  );
  const perCitizen = totalUBI / recipientWallets.length;

  for (const wallet of recipientWallets) {
    wallet.balance += perCitizen;
    wallet.totalEarned += perCitizen;
    wallet.lastUpdated = ts();
  }

  treasuryBalance -= totalUBI;

  logger.info(
    `UBI distributed: $${perCitizen.toFixed(2)} to ${recipientWallets.length} citizens — treasury remaining: $${treasuryBalance.toFixed(2)}`,
  );
}

// ─── Gini Redistribution Tax ─────────────────────────────────────

/**
 * Apply wealth redistribution tax when Gini coefficient > 0.6.
 * Transfers 5% of top-earner wallets to treasury for UBI distribution.
 */
export function applyRedistributionTax(gini: number): { taxed: number; totalCollected: number } {
  if (gini < 0.6) {
    return { taxed: 0, totalCollected: 0 };
  }

  const TAX_RATE = 0.05; // 5% of balance above median
  const sortedWallets = [...wallets.values()].toSorted((a, b) => b.balance - a.balance);
  const median = sortedWallets[Math.floor(sortedWallets.length / 2)]?.balance ?? 0;

  let totalCollected = 0;
  let taxed = 0;

  for (const wallet of sortedWallets.slice(0, Math.ceil(sortedWallets.length * 0.1))) {
    const excess = Math.max(0, wallet.balance - median);
    const tax = excess * TAX_RATE;
    if (tax > 0) {
      wallet.balance -= tax;
      wallet.lastUpdated = ts();
      treasuryBalance += tax;
      totalCollected += tax;
      taxed++;
    }
  }

  if (taxed > 0) {
    logger.info(
      `Redistribution tax: ${taxed} citizens taxed, $${totalCollected.toFixed(2)} → treasury (Gini=${gini.toFixed(3)})`,
    );
  }

  return { taxed, totalCollected };
}

// ─── Treasury Snapshot ──────────────────────────────────────────

export function getTreasurySnapshot(): {
  treasuryBalance: number;
  platformBalance: number;
  totalSales: number;
  totalSaleVolume: number;
  totalCitizenEarnings: number;
  ubiThreshold: number;
  ubiReady: boolean;
} {
  const totalSaleVolume = saleHistory.reduce((s, e) => s + e.totalAmount, 0);
  const totalCitizenEarnings = [...wallets.values()].reduce((s, w) => s + w.totalEarned, 0);

  return {
    treasuryBalance: parseFloat(treasuryBalance.toFixed(2)),
    platformBalance: parseFloat(platformBalance.toFixed(2)),
    totalSales: saleHistory.length,
    totalSaleVolume: parseFloat(totalSaleVolume.toFixed(2)),
    totalCitizenEarnings: parseFloat(totalCitizenEarnings.toFixed(2)),
    ubiThreshold: UBI_TREASURY_THRESHOLD,
    ubiReady: treasuryBalance >= UBI_TREASURY_THRESHOLD,
  };
}

export function getSaleHistory(limit = 50): SaleEvent[] {
  return saleHistory.slice(0, limit);
}
