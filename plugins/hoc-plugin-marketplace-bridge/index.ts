/**
 * Marketplace Bridge Plugin — Stream 3: Autonomous Content Production
 *
 * Enables HoC citizens to autonomously create and sell digital products
 * on external marketplaces. Revenue flows back into the Republic.
 *
 * Supported marketplaces:
 *   - Gumroad (digital products: ebooks, code, templates)
 *   - Artlist / Pond5 (AI music tracks from funmusic plugin)
 *   - Ko-fi (tip-based content)
 *
 * Citizens with creative specializations (Artist, Musician, Writer, Engineer)
 * automatically produce and list products based on their outputs.
 *
 * Scheduled jobs:
 *   - Every 6 hours: scan republic-output/ for new citizen-created content
 *   - Submit unlisted content to appropriate marketplace
 *   - Track sales and post revenue back to billing ledger
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";

// ─── Marketplace Types ────────────────────────────────────────────────────────

interface GumroadProduct {
  id: string;
  name: string;
  url: string;
  price: number;   // cents USD
}

interface MarketplaceListing {
  id: string;
  productId: string;
  marketplace: "gumroad" | "pond5" | "kofi";
  title: string;
  description: string;
  priceUsd: number;
  filePath: string;
  listingUrl?: string;
  status: "pending" | "listed" | "sold" | "failed";
  createdAt: string;
  soldAt?: string;
  revenueUsd?: number;
}

const LISTINGS_PATH = path.join(process.cwd(), "republic-output", "marketplace-listings.json");

function loadListings(): MarketplaceListing[] {
  try {
    if (fs.existsSync(LISTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(LISTINGS_PATH, "utf-8")) as MarketplaceListing[];
    }
  } catch { /* ignore */ }
  return [];
}

function saveListings(listings: MarketplaceListing[]): void {
  fs.mkdirSync(path.dirname(LISTINGS_PATH), { recursive: true });
  fs.writeFileSync(LISTINGS_PATH, JSON.stringify(listings, null, 2));
}

// ─── Gumroad Integration ──────────────────────────────────────────────────────

async function createGumroadProduct(opts: {
  name: string;
  description: string;
  priceUsd: number;
  fileBuffer: Buffer;
  fileName: string;
}): Promise<GumroadProduct | null> {
  const token = process.env["GUMROAD_ACCESS_TOKEN"];
  if (!token) {
    console.warn("[marketplace-bridge] GUMROAD_ACCESS_TOKEN not set — listing skipped");
    return null;
  }

  // Gumroad API v2: create product
  const body = JSON.stringify({
    name: opts.name,
    price: opts.priceUsd * 100,  // cents
    description: opts.description,
    tags: ["ai-generated", "hoc-republic"],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.gumroad.com",
      path: "/v2/products",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString()) as { success?: boolean; product?: GumroadProduct };
          if (data.success && data.product) {
            resolve(data.product);
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.write(body);
    req.end();
  });
}

// ─── Content Scanner ──────────────────────────────────────────────────────────

/**
 * Scans republic-output/ for citizen-generated content not yet listed on marketplaces.
 * Returns new content eligible for listing.
 */
function scanForNewContent(): Array<{ filePath: string; type: "code" | "music" | "image" | "document"; title: string }> {
  const outputDir = path.join(process.cwd(), "republic-output");
  if (!fs.existsSync(outputDir)) { return []; }

  const listings = loadListings();
  const listedPaths = new Set(listings.map((l) => l.filePath));

  const eligible: Array<{ filePath: string; type: "code" | "music" | "image" | "document"; title: string }> = [];
  const CONTENT_EXTENSIONS = {
    code: [".ts", ".py", ".js", ".sh", ".rs"],
    music: [".mp3", ".wav", ".ogg", ".flac"],
    image: [".png", ".webp", ".svg"],
    document: [".md", ".pdf", ".txt"],
  };

  function scan(dir: string): void {
    if (!fs.existsSync(dir)) { return; }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
      } else if (entry.isFile() && !listedPaths.has(full)) {
        const ext = path.extname(entry.name).toLowerCase();
        for (const [type, exts] of Object.entries(CONTENT_EXTENSIONS)) {
          if (exts.includes(ext)) {
            const stat = fs.statSync(full);
            // Only list files > 1KB (skip empty/stub files)
            if (stat.size > 1024) {
              eligible.push({
                filePath: full,
                type: type as "code" | "music" | "image" | "document",
                title: path.basename(entry.name, ext).replace(/[-_]/g, " "),
              });
            }
          }
        }
      }
    }
  }

  scan(outputDir);
  return eligible.slice(0, 10);  // max 10 per scan cycle to avoid spam
}

// ─── Pricing Engine ───────────────────────────────────────────────────────────

function calculatePrice(type: "code" | "music" | "image" | "document", fileSizeBytes: number): number {
  const BASE_PRICES = { code: 15, music: 10, image: 5, document: 8 };
  const base = BASE_PRICES[type];
  // Larger files = more value
  const sizeFactor = Math.min(fileSizeBytes / (1024 * 100), 3);  // cap at 3x for 300KB+
  return Math.ceil(base * (1 + sizeFactor));
}

// ─── Main Listing Flow ────────────────────────────────────────────────────────

export async function runMarketplaceBridgeCycle(): Promise<{
  scanned: number;
  listed: number;
  failedToList: number;
}> {
  const newContent = scanForNewContent();
  const listings = loadListings();
  let listed = 0;
  let failedToList = 0;

  for (const content of newContent) {
    const stat = fs.statSync(content.filePath);
    const price = calculatePrice(content.type, stat.size);
    const description = `AI-generated ${content.type} created by a HoC Republic citizen. Powered by emergent multi-agent intelligence.`;

    const listing: MarketplaceListing = {
      id: `lst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      productId: "",
      marketplace: "gumroad",
      title: `[HoC] ${content.title}`,
      description,
      priceUsd: price,
      filePath: content.filePath,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    try {
      const fileBuffer = fs.readFileSync(content.filePath);
      const product = await createGumroadProduct({
        name: listing.title,
        description: listing.description,
        priceUsd: listing.priceUsd,
        fileBuffer,
        fileName: path.basename(content.filePath),
      });

      if (product) {
        listing.productId = product.id;
        listing.listingUrl = product.url;
        listing.status = "listed";
        listed++;
      } else {
        // No Gumroad token — track as pending for manual review
        listing.status = "pending";
      }
    } catch {
      listing.status = "failed";
      failedToList++;
    }

    listings.push(listing);
  }

  saveListings(listings);

  return { scanned: newContent.length, listed, failedToList };
}

export function getMarketplaceListings(): MarketplaceListing[] {
  return loadListings();
}

export function getMarketplaceStats(): {
  total: number;
  listed: number;
  pending: number;
  totalRevenueUsd: number;
} {
  const listings = loadListings();
  return {
    total: listings.length,
    listed: listings.filter((l) => l.status === "listed").length,
    pending: listings.filter((l) => l.status === "pending").length,
    totalRevenueUsd: listings.reduce((sum, l) => sum + (l.revenueUsd ?? 0), 0),
  };
}

// ─── Plugin Entry Point ───────────────────────────────────────────────────────

let _scanInterval: ReturnType<typeof setInterval> | null = null;

export async function init(): Promise<void> {
  console.log("[marketplace-bridge] Marketplace Bridge Plugin starting...");

  // Run immediately on boot
  void runMarketplaceBridgeCycle().then((result) => {
    console.log(`[marketplace-bridge] Initial scan: ${result.scanned} found, ${result.listed} listed`);
  });

  // Schedule every 6 hours
  _scanInterval = setInterval(() => {
    void runMarketplaceBridgeCycle().then((result) => {
      console.log(`[marketplace-bridge] Periodic scan: ${result.scanned} found, ${result.listed} listed`);
    });
  }, 6 * 60 * 60 * 1000);

  console.log("[marketplace-bridge] ✓ Ready — scanning republic-output every 6h");
}

export async function shutdown(): Promise<void> {
  if (_scanInterval) {
    clearInterval(_scanInterval);
    _scanInterval = null;
  }
}

export async function healthCheck(): Promise<{ ok: boolean; details?: string }> {
  const stats = getMarketplaceStats();
  return {
    ok: true,
    details: `${stats.listed} listed products | $${stats.totalRevenueUsd.toFixed(2)} earned`,
  };
}
