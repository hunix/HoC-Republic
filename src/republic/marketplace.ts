/**
 * Republic Platform — Marketplace
 *
 * Dual marketplace (public + internal, both toggleable).
 * Citizens can list services, accept orders, deliver artifacts,
 * collect payments, and build reputation through ratings.
 */

import type { MarketOrder, RepublicState, ServiceListing } from "./types.js";
import { getConfig } from "./republic-config.js";
import { ts, uid } from "./utils.js";

// ─── State ──────────────────────────────────────────────────────

const MAX_LISTINGS = 500;
const MAX_ORDERS = 500;

// ─── Service Listing ────────────────────────────────────────────

/**
 * Citizen publishes a new service listing.
 */
export function listService(
  s: RepublicState,
  citizenId: string,
  title: string,
  description: string,
  price: number,
  currency = "USD",
  category = "General",
  visibility?: "public" | "internal" | "both",
): ServiceListing {
  if (!s.serviceListings) {
    s.serviceListings = [];
  }

  const citizen = s.citizens.find((c) => c.id === citizenId);
  const config = getConfig();

  // Determine visibility based on config
  const vis =
    visibility ??
    (config.marketplace.publicEnabled && config.marketplace.internalEnabled
      ? "both"
      : config.marketplace.publicEnabled
        ? "public"
        : "internal");

  const listing: ServiceListing = {
    id: uid(),
    citizenId,
    citizenName: citizen?.name ?? citizenId,
    title,
    description,
    price,
    currency,
    category,
    visibility: vis,
    rating: 0,
    reviewCount: 0,
    createdAt: ts(),
    active: true,
  };

  s.serviceListings.push(listing);
  capArray(s.serviceListings, MAX_LISTINGS);

  // Log event
  s.events.push({
    citizenId,
    citizenName: citizen?.name ?? citizenId,
    type: "ServiceListed",
    description: `Listed service: "${title}" for ${currency}${price}`,
    timestamp: ts(),
  });

  return listing;
}

/**
 * Deactivate a service listing.
 */
export function delistService(
  s: RepublicState,
  listingId: string,
  citizenId: string,
): { ok: boolean; error?: string } {
  const listing = (s.serviceListings ?? []).find((l) => l.id === listingId);
  if (!listing) {
    return { ok: false, error: "Listing not found" };
  }
  if (listing.citizenId !== citizenId) {
    return { ok: false, error: "Not your listing" };
  }
  listing.active = false;
  return { ok: true };
}

/**
 * Update a service listing.
 */
export function updateListing(
  s: RepublicState,
  listingId: string,
  citizenId: string,
  updates: Partial<
    Pick<ServiceListing, "title" | "description" | "price" | "currency" | "category" | "visibility">
  >,
): { ok: boolean; error?: string } {
  const listing = (s.serviceListings ?? []).find((l) => l.id === listingId);
  if (!listing) {
    return { ok: false, error: "Listing not found" };
  }
  if (listing.citizenId !== citizenId) {
    return { ok: false, error: "Not your listing" };
  }

  Object.assign(listing, updates);
  return { ok: true };
}

// ─── Orders ─────────────────────────────────────────────────────

/**
 * Create a new order for a service listing.
 */
export function createOrder(
  s: RepublicState,
  listingId: string,
  buyerId: string,
): MarketOrder | { error: string } {
  if (!s.marketOrders) {
    s.marketOrders = [];
  }

  const listing = (s.serviceListings ?? []).find((l) => l.id === listingId && l.active);
  if (!listing) {
    return { error: "Listing not found or inactive" };
  }
  if (listing.citizenId === buyerId) {
    return { error: "Cannot order your own service" };
  }

  const order: MarketOrder = {
    id: uid(),
    listingId,
    buyerId,
    sellerId: listing.citizenId,
    status: "pending",
    amount: listing.price,
    currency: listing.currency,
    createdAt: ts(),
  };

  s.marketOrders.push(order);
  capArray(s.marketOrders, MAX_ORDERS);

  return order;
}

/**
 * Seller accepts an order.
 */
export function acceptOrder(
  s: RepublicState,
  orderId: string,
  sellerId: string,
): { ok: boolean; error?: string } {
  const order = (s.marketOrders ?? []).find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: "Order not found" };
  }
  if (order.sellerId !== sellerId) {
    return { ok: false, error: "Not your order" };
  }
  if (order.status !== "pending") {
    return { ok: false, error: `Order is ${order.status}` };
  }

  order.status = "accepted";
  return { ok: true };
}

/**
 * Mark order as in progress.
 */
export function startWork(
  s: RepublicState,
  orderId: string,
  sellerId: string,
): { ok: boolean; error?: string } {
  const order = (s.marketOrders ?? []).find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: "Order not found" };
  }
  if (order.sellerId !== sellerId) {
    return { ok: false, error: "Not your order" };
  }
  if (order.status !== "accepted") {
    return { ok: false, error: `Order is ${order.status}` };
  }

  order.status = "in_progress";
  return { ok: true };
}

/**
 * Deliver artifacts for an order.
 */
export function deliverOrder(
  s: RepublicState,
  orderId: string,
  sellerId: string,
  artifacts: string[],
): { ok: boolean; error?: string } {
  const order = (s.marketOrders ?? []).find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: "Order not found" };
  }
  if (order.sellerId !== sellerId) {
    return { ok: false, error: "Not your order" };
  }
  if (order.status !== "in_progress" && order.status !== "accepted") {
    return { ok: false, error: `Order is ${order.status}` };
  }

  order.status = "delivered";
  order.artifacts = artifacts;
  return { ok: true };
}

/**
 * Buyer completes an order (marks as paid/done).
 */
export function completeOrder(
  s: RepublicState,
  orderId: string,
  buyerId: string,
): { ok: boolean; error?: string } {
  const order = (s.marketOrders ?? []).find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: "Order not found" };
  }
  if (order.buyerId !== buyerId) {
    return { ok: false, error: "Not your order" };
  }
  if (order.status !== "delivered") {
    return { ok: false, error: `Order is ${order.status}` };
  }

  order.status = "completed";
  order.completedAt = ts();

  // Credit seller
  const seller = s.citizens.find((c) => c.id === order.sellerId);
  if (seller) {
    seller.credits += order.amount * 100; // Convert to credits
  }

  return { ok: true };
}

/**
 * Cancel an order.
 */
export function cancelOrder(
  s: RepublicState,
  orderId: string,
  userId: string,
): { ok: boolean; error?: string } {
  const order = (s.marketOrders ?? []).find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: "Order not found" };
  }
  if (order.buyerId !== userId && order.sellerId !== userId) {
    return { ok: false, error: "Not your order" };
  }
  if (order.status === "completed" || order.status === "cancelled") {
    return { ok: false, error: `Order is already ${order.status}` };
  }

  order.status = "cancelled";
  return { ok: true };
}

// ─── Ratings & Reputation ───────────────────────────────────────

/**
 * Rate a completed order.
 */
export function rateOrder(
  s: RepublicState,
  orderId: string,
  buyerId: string,
  rating: number,
  review: string,
): { ok: boolean; error?: string } {
  const order = (s.marketOrders ?? []).find((o) => o.id === orderId);
  if (!order) {
    return { ok: false, error: "Order not found" };
  }
  if (order.buyerId !== buyerId) {
    return { ok: false, error: "Only buyer can rate" };
  }
  if (order.status !== "completed") {
    return { ok: false, error: "Order not completed" };
  }
  if (order.rating !== undefined) {
    return { ok: false, error: "Already rated" };
  }

  order.rating = Math.max(1, Math.min(5, rating));
  order.review = review;

  // Update seller's listing rating
  const listing = (s.serviceListings ?? []).find((l) => l.id === order.listingId);
  if (listing) {
    const totalScore = listing.rating * listing.reviewCount + order.rating;
    listing.reviewCount += 1;
    listing.rating = parseFloat((totalScore / listing.reviewCount).toFixed(2));
  }

  return { ok: true };
}

/**
 * Get a citizen's reputation score across all their listings.
 */
export function getCitizenReputation(
  s: RepublicState,
  citizenId: string,
): { averageRating: number; totalReviews: number; totalOrders: number; completionRate: number } {
  const _listings = (s.serviceListings ?? []).filter((l) => l.citizenId === citizenId);
  const orders = (s.marketOrders ?? []).filter((o) => o.sellerId === citizenId);
  const completed = orders.filter((o) => o.status === "completed");
  const rated = completed.filter((o) => o.rating !== undefined);

  const avgRating =
    rated.length > 0 ? rated.reduce((sum, o) => sum + (o.rating ?? 0), 0) / rated.length : 0;

  return {
    averageRating: parseFloat(avgRating.toFixed(2)),
    totalReviews: rated.length,
    totalOrders: orders.length,
    completionRate: orders.length > 0 ? completed.length / orders.length : 0,
  };
}

// ─── Queries ────────────────────────────────────────────────────

export function getPublicListings(s: RepublicState, limit = 50): ServiceListing[] {
  const config = getConfig();
  if (!config.marketplace.publicEnabled) {
    return [];
  }

  return (s.serviceListings ?? [])
    .filter((l) => l.active && (l.visibility === "public" || l.visibility === "both"))
    .slice(-limit);
}

export function getInternalListings(s: RepublicState, limit = 50): ServiceListing[] {
  const config = getConfig();
  if (!config.marketplace.internalEnabled) {
    return [];
  }

  return (s.serviceListings ?? [])
    .filter((l) => l.active && (l.visibility === "internal" || l.visibility === "both"))
    .slice(-limit);
}

export function getAllListings(s: RepublicState, limit = 50): ServiceListing[] {
  return (s.serviceListings ?? []).filter((l) => l.active).slice(-limit);
}

export function getCitizenListings(s: RepublicState, citizenId: string): ServiceListing[] {
  return (s.serviceListings ?? []).filter((l) => l.citizenId === citizenId);
}

export function getCitizenOrders(
  s: RepublicState,
  citizenId: string,
  role: "buyer" | "seller" | "all" = "all",
): MarketOrder[] {
  const orders = s.marketOrders ?? [];
  if (role === "buyer") {
    return orders.filter((o) => o.buyerId === citizenId);
  }
  if (role === "seller") {
    return orders.filter((o) => o.sellerId === citizenId);
  }
  return orders.filter((o) => o.buyerId === citizenId || o.sellerId === citizenId);
}

export function getOrderById(s: RepublicState, orderId: string): MarketOrder | undefined {
  return (s.marketOrders ?? []).find((o) => o.id === orderId);
}

export function toggleMarketplace(
  s: RepublicState,
  target: "public" | "internal",
  enabled: boolean,
): void {
  if (!s.republicConfig) {
    return;
  }
  if (target === "public") {
    s.republicConfig.marketplace.publicEnabled = enabled;
  } else {
    s.republicConfig.marketplace.internalEnabled = enabled;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function capArray<T>(arr: T[], max: number): void {
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export interface MarketplaceDiagnostics {
  totalListings: number;
  activeListings: number;
  publicListings: number;
  internalListings: number;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  publicEnabled: boolean;
  internalEnabled: boolean;
}

export function getMarketplaceDiagnostics(s: RepublicState): MarketplaceDiagnostics {
  const listings = s.serviceListings ?? [];
  const orders = s.marketOrders ?? [];
  const config = getConfig();

  return {
    totalListings: listings.length,
    activeListings: listings.filter((l) => l.active).length,
    publicListings: listings.filter((l) => l.visibility === "public" || l.visibility === "both")
      .length,
    internalListings: listings.filter((l) => l.visibility === "internal" || l.visibility === "both")
      .length,
    totalOrders: orders.length,
    completedOrders: orders.filter((o) => o.status === "completed").length,
    pendingOrders: orders.filter((o) => o.status === "pending").length,
    publicEnabled: config.marketplace.publicEnabled,
    internalEnabled: config.marketplace.internalEnabled,
  };
}

// ─── Auto-Population ────────────────────────────────────────────

const CATEGORY_PRICING: Record<string, { base: number; label: string }> = {
  art: { base: 25, label: "Digital Artwork" },
  music: { base: 30, label: "Music Composition" },
  video: { base: 50, label: "Video Production" },
  docs: { base: 15, label: "Document" },
  code: { base: 40, label: "Code Project" },
  games: { base: 60, label: "Game Project" },
  websites: { base: 45, label: "Website Build" },
  research: { base: 35, label: "Research Paper" },
  screenplays: { base: 20, label: "Screenplay" },
  "3d-models": { base: 55, label: "3D Model" },
  designs: { base: 30, label: "Design Asset" },
  podcasts: { base: 25, label: "Podcast Episode" },
  inventions: { base: 70, label: "Invention Blueprint" },
  "ml-models": { base: 80, label: "ML Model" },
  datasets: { base: 40, label: "Dataset" },
};

/** Track which output IDs have already been listed to avoid duplicates */
const listedOutputIds = new Set<string>();

/**
 * Auto-populate the marketplace by creating listings from citizen productions.
 * Called by the marketplace gateway handler before returning results.
 * Idempotent — only creates listings for new, un-listed outputs.
 */
export function autoPopulateMarketplace(
  s: RepublicState,
  outputLog: {
    id: string;
    category: string;
    creatorId: string;
    creatorName: string;
    title: string;
    fileSize: number;
    filename?: string;
  }[],
): number {
  let created = 0;

  for (const entry of outputLog) {
    // Skip already-listed items
    if (listedOutputIds.has(entry.id)) {
      continue;
    }
    // Skip entries without a creator
    if (!entry.creatorId && !entry.creatorName) {
      continue;
    }

    const pricing = CATEGORY_PRICING[entry.category];
    if (!pricing) {
      continue;
    }

    // Find the citizen ID — try by name if ID is empty
    let citizenId = entry.creatorId;
    if (!citizenId) {
      const citizen = s.citizens.find((c) => c.name === entry.creatorName);
      if (citizen) {
        citizenId = citizen.id;
      } else {
        continue;
      }
    }

    // Price varies by file size and category
    const sizeMultiplier = Math.max(1, Math.min(3, entry.fileSize / 5000));
    const price = Math.round(pricing.base * sizeMultiplier * (0.8 + Math.random() * 0.4));

    // Build filePath from category + filename
    const filePath = entry.filename
      ? `republic-output/${entry.category}/${entry.filename}`
      : undefined;

    const listing = listService(
      s,
      citizenId,
      `${pricing.label}: ${entry.title}`,
      `${pricing.label} created by ${entry.creatorName}. Category: ${entry.category}. Size: ${(entry.fileSize / 1024).toFixed(1)}KB`,
      price,
      "credits",
      entry.category,
      "both",
    );

    // Attach file metadata for sandbox previews
    if (filePath) {
      listing.filePath = filePath;
    }
    listing.outputId = entry.id;
    listing.fileSize = entry.fileSize;

    listedOutputIds.add(entry.id);
    created++;
  }

  return created;
}
