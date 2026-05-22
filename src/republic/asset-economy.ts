/**
 * Republic Platform — Asset Economy
 *
 * IP ownership, royalties, trading, and economic indicators.
 * Complements existing marketplace.ts (services) with asset-based economy.
 */

import type { Citizen, RepublicState } from "./types.js";
import { pick, randFloat, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

type AssetType =
  | "music"
  | "artwork"
  | "software"
  | "paper"
  | "design"
  | "invention"
  | "book"
  | "film";

interface Asset {
  id: string;
  type: AssetType;
  title: string;
  creatorId: string;
  creatorName: string;
  ownerId: string;
  quality: number;
  basePrice: number;
  createdAt: string;
  saleCount: number;
  royaltyRate: number;
}

interface Trade {
  buyerId: string;
  sellerId: string;
  assetId: string;
  price: number;
  tick: number;
}

// ─── State ──────────────────────────────────────────────────────

const assets = new Map<string, Asset>();
const trades: Trade[] = [];
const MAX_ASSETS = 1000;
const MAX_TRADES = 500;

// ─── Asset Registry ─────────────────────────────────────────────

export function registerAsset(
  creator: Citizen,
  type: AssetType,
  title: string,
  quality: number,
): Asset {
  const asset: Asset = {
    id: uid(),
    type,
    title,
    creatorId: creator.id,
    creatorName: creator.name,
    ownerId: creator.id,
    quality: Math.max(0, Math.min(1, quality)),
    basePrice: Math.floor(quality * 100 + 10),
    createdAt: ts(),
    saleCount: 0,
    royaltyRate: 0.1,
  };
  assets.set(asset.id, asset);
  if (assets.size > MAX_ASSETS) {
    const oldest = [...assets.values()].toSorted((a, b) => a.saleCount - b.saleCount);
    for (const a of oldest.slice(0, assets.size - MAX_ASSETS)) {
      assets.delete(a.id);
    }
  }
  return asset;
}

function executeTrade(
  buyer: Citizen,
  sellerId: string,
  asset: Asset,
  price: number,
  s: RepublicState,
): void {
  if (buyer.credits < price) {
    return;
  }
  buyer.credits -= price;
  const seller = s.citizens.find((c) => c.id === sellerId);
  if (seller) {
    const royalty = Math.floor(price * asset.royaltyRate);
    seller.credits += price - royalty;
    const creator = s.citizens.find((c) => c.id === asset.creatorId);
    if (creator && creator.id !== sellerId) {
      creator.credits += royalty;
    }
  }
  asset.ownerId = buyer.id;
  asset.saleCount++;
  trades.push({ buyerId: buyer.id, sellerId, assetId: asset.id, price, tick: s.currentTick });
  if (trades.length > MAX_TRADES) {
    trades.splice(0, trades.length - MAX_TRADES);
  }
  s.events.push({
    citizenId: buyer.id,
    citizenName: buyer.name,
    type: "Other",
    description: `💰 ${buyer.name} bought "${asset.title}" for ${price} credits`,
    timestamp: ts(),
  });
}

// ─── Auto Activity ──────────────────────────────────────────────

function autoCreateAssets(s: RepublicState): void {
  if (rng() > 0.06) {
    return;
  }
  const creators = s.citizens.filter((c) => c.activity === "Creating" && c.energy > 20);
  if (creators.length === 0) {
    return;
  }
  const creator = pick(creators);
  const types: AssetType[] = ["music", "artwork", "software", "paper", "design", "book"];
  const type = pick(types);
  const quality = Math.min(1, randFloat(0.3, 0.8) + creator.skillCount * 0.05);
  registerAsset(creator, type, `${type} by ${creator.name}`, quality);
}

function autoTrade(s: RepublicState): void {
  if (rng() > 0.05) {
    return;
  }
  const forSale = [...assets.values()].filter((a) => {
    const owner = s.citizens.find((c) => c.id === a.ownerId);
    return owner && owner.credits < 50;
  });
  if (forSale.length === 0) {
    return;
  }
  const asset = pick(forSale);
  const buyers = s.citizens.filter(
    (c) => c.credits > asset.basePrice * 1.2 && c.id !== asset.ownerId,
  );
  if (buyers.length === 0) {
    return;
  }
  const buyer = pick(buyers);
  executeTrade(buyer, asset.ownerId, asset, Math.floor(asset.basePrice * randFloat(0.8, 1.5)), s);
}

// ─── Economic Indicators ────────────────────────────────────────

function calcGini(s: RepublicState): number {
  const creds = s.citizens.map((c) => c.credits).toSorted((a, b) => a - b);
  const n = creds.length;
  if (n === 0) {
    return 0;
  }
  let sumDiffs = 0,
    total = 0;
  for (let i = 0; i < n; i++) {
    total += creds[i];
    for (let j = 0; j < n; j++) {
      sumDiffs += Math.abs(creds[i] - creds[j]);
    }
  }
  return total > 0 ? sumDiffs / (2 * n * total) : 0;
}

// ─── Main Tick ──────────────────────────────────────────────────

export function assetEconomyTick(s: RepublicState): void {
  autoCreateAssets(s);
  autoTrade(s);
}

// ─── Query API ──────────────────────────────────────────────────

export function getEconomicIndicators(s: RepublicState): {
  gdp: number;
  transactionVolume: number;
  avgPrice: number;
  giniCoefficient: number;
  totalAssets: number;
} {
  const recent = trades.filter((t) => t.tick > s.currentTick - 100);
  const gdp = recent.reduce((sum, t) => sum + t.price, 0);
  return {
    gdp,
    transactionVolume: recent.length,
    avgPrice: recent.length > 0 ? gdp / recent.length : 0,
    giniCoefficient: calcGini(s),
    totalAssets: assets.size,
  };
}

export function getCitizenAssets(citizenId: string): Asset[] {
  return [...assets.values()].filter((a) => a.ownerId === citizenId);
}
