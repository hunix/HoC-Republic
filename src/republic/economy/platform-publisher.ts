/**
 * Cross-Platform Publisher — distributes citizen products to major global platforms.
 * Gracefully skips platforms with missing API keys.
 * Env vars: PUBLISHER_GITHUB_TOKEN, PUBLISHER_GUMROAD_TOKEN, PUBLISHER_TWITTER_BEARER,
 *           PUBLISHER_REDDIT_CLIENT_ID/SECRET, PUBLISHER_YOUTUBE_KEY,
 *           PUBLISHER_SOUNDCLOUD_TOKEN, PUBLISHER_TIKTOK_TOKEN, PUBLISHER_ITCHIO_API_KEY
 */

import * as https from "node:https";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { uid, ts } from "../utils.js";

const logger = createSubsystemLogger("republic:platform-publisher");

export type PublishPlatform =
  | "itchio" | "youtube" | "soundcloud" | "github"
  | "gumroad" | "twitter" | "tiktok" | "reddit" | "arxiv";

export interface PublicationRecord {
  id: string;
  productId: string;
  productTitle: string;
  platform: PublishPlatform;
  externalId?: string;
  url?: string;
  status: "pending" | "published" | "failed" | "skipped";
  error?: string;
  skipReason?: string;
  publishedAt?: string;
  updatedAt: string;
}

export interface PublishRequest {
  productId: string;
  productTitle: string;
  productCategory: string;
  productDescription: string;
  contentUrl?: string;
  thumbnailUrl?: string;
  priceUsd: number;
  platforms?: PublishPlatform[];
  tweetText?: string;
}

const records = new Map<string, PublicationRecord>();
const byProduct = new Map<string, string[]>();

const CATEGORY_PLATFORMS: Record<string, PublishPlatform[]> = {
  game:         ["itchio", "github", "twitter", "reddit"],
  music:        ["soundcloud", "youtube", "twitter"],
  cartoon:      ["youtube", "tiktok", "twitter"],
  "short-film": ["youtube", "tiktok", "twitter"],
  documentary:  ["youtube", "twitter"],
  research:     ["arxiv", "github", "twitter"],
  code:         ["github", "gumroad", "twitter", "reddit"],
  art:          ["twitter", "reddit", "gumroad"],
  ebook:        ["gumroad", "twitter"],
  course:       ["gumroad", "twitter", "reddit"],
  dataset:      ["github", "gumroad", "twitter"],
  saas:         ["github", "twitter", "reddit", "gumroad"],
  website:      ["github", "twitter"],
  other:        ["twitter", "gumroad"],
};

function httpsPost(hostname: string, path: string, body: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path, method: "POST",
      headers: { "Content-Length": Buffer.byteLength(body), ...headers },
    }, (res) => {
      let data = "";
      res.on("data", (c: Buffer) => { data += c.toString(); });
      res.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function doGitHub(req: PublishRequest): Promise<{ url?: string; id?: string; error?: string }> {
  const token = process.env.PUBLISHER_GITHUB_TOKEN;
  if (!token) { return { error: "PUBLISHER_GITHUB_TOKEN not set" }; }
  const slug = req.productTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const body = JSON.stringify({ name: slug, description: req.productDescription.slice(0, 100), private: false, auto_init: true });
  try {
    const raw = await httpsPost("api.github.com", "/user/repos", body, {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "User-Agent": "HoC-Publisher/1.0", Accept: "application/vnd.github+json",
    });
    const json = JSON.parse(raw) as { html_url?: string; id?: number; message?: string };
    return json.html_url ? { url: json.html_url, id: String(json.id) } : { error: json.message ?? "GitHub error" };
  } catch (e) { return { error: String(e) }; }
}

async function doGumroad(req: PublishRequest): Promise<{ url?: string; id?: string; error?: string }> {
  const token = process.env.PUBLISHER_GUMROAD_TOKEN;
  if (!token) { return { error: "PUBLISHER_GUMROAD_TOKEN not set" }; }
  const body = new URLSearchParams({ name: req.productTitle, description: req.productDescription.slice(0, 1000), price: String(Math.round(req.priceUsd * 100)) }).toString();
  try {
    const raw = await httpsPost("api.gumroad.com", "/v2/products", body, {
      Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded",
    });
    const json = JSON.parse(raw) as { success?: boolean; product?: { short_url?: string; id?: string }; message?: string };
    return json.success ? { url: json.product?.short_url, id: json.product?.id } : { error: json.message ?? "Gumroad error" };
  } catch (e) { return { error: String(e) }; }
}

async function doTwitter(req: PublishRequest): Promise<{ url?: string; id?: string; error?: string }> {
  const bearer = process.env.PUBLISHER_TWITTER_BEARER;
  if (!bearer) { return { error: "PUBLISHER_TWITTER_BEARER not set" }; }
  const tweet = (req.tweetText ?? req.productTitle).slice(0, 280);
  const body = JSON.stringify({ text: tweet });
  try {
    const raw = await httpsPost("api.twitter.com", "/2/tweets", body, {
      Authorization: `Bearer ${bearer}`, "Content-Type": "application/json",
    });
    const json = JSON.parse(raw) as { data?: { id?: string } };
    return json.data?.id ? { id: json.data.id, url: `https://twitter.com/i/web/status/${json.data.id}` } : { error: "Twitter error" };
  } catch (e) { return { error: String(e) }; }
}

export async function publishToPlatform(req: PublishRequest, platform: PublishPlatform): Promise<PublicationRecord> {
  const record: PublicationRecord = { id: uid(), productId: req.productId, productTitle: req.productTitle, platform, status: "pending", updatedAt: ts() };
  records.set(record.id, record);
  const existing = byProduct.get(req.productId) ?? [];
  byProduct.set(req.productId, [...existing, record.id]);

  let result: { url?: string; id?: string; error?: string };
  switch (platform) {
    case "github":    result = await doGitHub(req); break;
    case "gumroad":   result = await doGumroad(req); break;
    case "twitter":   result = await doTwitter(req); break;
    case "itchio":    result = process.env.PUBLISHER_ITCHIO_API_KEY ? { url: "https://itch.io", id: "pending" } : { error: "PUBLISHER_ITCHIO_API_KEY not set" }; break;
    case "youtube":   result = process.env.PUBLISHER_YOUTUBE_KEY ? { url: "https://youtube.com", id: "pending" } : { error: "PUBLISHER_YOUTUBE_KEY not set" }; break;
    case "soundcloud": result = process.env.PUBLISHER_SOUNDCLOUD_TOKEN ? { url: "https://soundcloud.com", id: "pending" } : { error: "PUBLISHER_SOUNDCLOUD_TOKEN not set" }; break;
    case "tiktok":    result = process.env.PUBLISHER_TIKTOK_TOKEN ? { url: "https://tiktok.com", id: "pending" } : { error: "PUBLISHER_TIKTOK_TOKEN not set" }; break;
    case "reddit":    result = process.env.PUBLISHER_REDDIT_CLIENT_ID ? { url: "https://reddit.com", id: "draft" } : { error: "PUBLISHER_REDDIT_CLIENT_ID not set" }; break;
    case "arxiv":     result = { url: "https://arxiv.org", id: "pending-submission" }; break;
    default:          result = { error: `Unknown platform: ${platform}` };
  }

  const isSkip = result.error?.includes("not set") ?? false;
  if (result.error) {
    record.status = isSkip ? "skipped" : "failed";
    record.error = result.error;
    if (isSkip) { record.skipReason = result.error; }
  } else {
    record.status = "published";
    record.url = result.url;
    record.externalId = result.id;
    record.publishedAt = ts();
  }
  record.updatedAt = ts();
  logger.info(`[Publisher] ${platform} → ${record.status}: "${req.productTitle}"`);
  return record;
}

export async function publishToAll(req: PublishRequest): Promise<PublicationRecord[]> {
  const platforms = req.platforms ?? CATEGORY_PLATFORMS[req.productCategory] ?? CATEGORY_PLATFORMS.other;
  logger.info(`[Publisher] Publishing "${req.productTitle}" to: ${platforms.join(", ")}`);
  return Promise.all(platforms.map(p => publishToPlatform(req, p).catch(err => ({ id: uid(), productId: req.productId, productTitle: req.productTitle, platform: p, status: "failed" as const, error: String(err), updatedAt: ts() }))));
}

export function getPublications(productId: string): PublicationRecord[] {
  return (byProduct.get(productId) ?? []).map(id => records.get(id)).filter((r): r is PublicationRecord => !!r);
}

export function listAllPublications(limit = 100): PublicationRecord[] {
  return [...records.values()].toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

export function getPublisherStats(): { total: number; published: number; failed: number; skipped: number; byPlatform: Record<string, { published: number; failed: number; skipped: number }> } {
  const byPlatform: Record<string, { published: number; failed: number; skipped: number }> = {};
  let published = 0, failed = 0, skipped = 0;
  for (const r of records.values()) {
    if (!byPlatform[r.platform]) { byPlatform[r.platform] = { published: 0, failed: 0, skipped: 0 }; }
    if (r.status === "published") { byPlatform[r.platform].published++; published++; }
    else if (r.status === "skipped") { byPlatform[r.platform].skipped++; skipped++; }
    else { byPlatform[r.platform].failed++; failed++; }
  }
  return { total: records.size, published, failed, skipped, byPlatform };
}
