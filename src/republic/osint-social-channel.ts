/**
 * Republic OSINT Social Channel — OAuth Social Media Intelligence
 *
 * Multi-platform social media OSINT engine with OAuth-based authentication.
 * Acts as both an OpenClaw Channel (bi-directional comms) and an OSINT data
 * source that feeds into the World Intelligence module.
 *
 * Supported platforms:
 * - Twitter/X (API v2 OAuth 2.0)
 * - Reddit (OAuth 2.0 App)
 * - Telegram (Bot API)
 * - YouTube (API Key / OAuth)
 *
 * Architecture:
 *   OAuth Config → Platform Adapter → Extract Intel → ingestSocialIntel() → WorldIntel
 *                                   → Intelligence Bus publish
 *
 * All credentials stored in config, never hardcoded.
 */

import { uid, ts } from "./utils.js";
import { intelligenceBus } from "./intelligence-bus.js";

// ─── Types ──────────────────────────────────────────────────────

export type SocialPlatform = "twitter" | "reddit" | "telegram" | "youtube" | "discord" | "mastodon";

export interface OAuthCredentials {
  platform: SocialPlatform;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  apiKey?: string; // For platforms that use API keys (YouTube, Telegram bot token)
  botToken?: string; // Telegram Bot API
  scope?: string[];
}

export interface SocialIntelItem {
  id: string;
  platform: SocialPlatform;
  /** Original content text */
  content: string;
  /** Extracted entities (countries, organizations, people) */
  entities: string[];
  /** Detected sentiment: -1.0 (hostile) to +1.0 (supportive) */
  sentiment: number;
  /** Relevance score 0-1 for intelligence value */
  relevanceScore: number;
  /** ISO country code if geo-located or country-relevant */
  country?: string;
  /** Original author/username */
  author: string;
  /** Hashtags, keywords */
  tags: string[];
  /** Engagement metrics */
  engagement: { likes: number; shares: number; replies: number; views: number };
  /** URL to original post */
  sourceUrl: string;
  /** When the original was posted */
  postedAt: string;
  /** When we ingested it */
  ingestedAt: string;
  /** Threat classification (mirrors WorldIntel categories) */
  threat?: {
    severity: "low" | "medium" | "high" | "critical";
    category: string;
  };
}

export interface SocialFeedConfig {
  id: string;
  platform: SocialPlatform;
  /** What to monitor: keywords, accounts, channels, subreddits */
  type: "keyword" | "account" | "channel" | "subreddit" | "hashtag";
  /** The target to monitor (e.g., "@CENTCOM", "r/worldnews", "#Ukraine") */
  target: string;
  /** Whether this feed is actively polling */
  active: boolean;
  /** Poll interval in seconds */
  pollIntervalSec: number;
  /** Last poll timestamp */
  lastPollAt?: string;
  /** Items collected since last reset */
  itemsCollected: number;
  /** Creation timestamp */
  createdAt: string;
}

export interface SocialChannelStatus {
  platforms: Array<{
    platform: SocialPlatform;
    authenticated: boolean;
    feedCount: number;
    totalItems: number;
    lastActivity?: string;
    rateLimitRemaining?: number;
  }>;
  totalFeeds: number;
  totalItemsIngested: number;
  activeFeeds: number;
}

// ─── State ──────────────────────────────────────────────────────

const credentials = new Map<SocialPlatform, OAuthCredentials>();
const feeds: SocialFeedConfig[] = [];
const ingestedItems: SocialIntelItem[] = [];
const MAX_INGESTED = 5000;
let pollTimers = new Map<string, ReturnType<typeof setInterval>>();

// ─── Threat Keywords (shared with WorldIntel) ───────────────────

const INTEL_KEYWORDS: Record<string, { severity: "low" | "medium" | "high" | "critical"; category: string }> = {
  // Military / Conflict
  "airstrike": { severity: "high", category: "military" },
  "missile launch": { severity: "critical", category: "military" },
  "troop deployment": { severity: "high", category: "military" },
  "invasion": { severity: "critical", category: "military" },
  "ceasefire": { severity: "medium", category: "diplomacy" },
  "military buildup": { severity: "high", category: "military" },
  "nuclear": { severity: "critical", category: "wmd" },
  "sanctions": { severity: "medium", category: "economic" },
  "blockade": { severity: "high", category: "military" },
  "drone strike": { severity: "high", category: "military" },
  "bombing": { severity: "high", category: "military" },
  "war crimes": { severity: "critical", category: "humanitarian" },
  "chemical weapons": { severity: "critical", category: "wmd" },
  "escalation": { severity: "high", category: "military" },
  "mobilization": { severity: "high", category: "military" },
  // Cyber
  "data breach": { severity: "high", category: "cyber" },
  "ransomware": { severity: "high", category: "cyber" },
  "zero-day": { severity: "critical", category: "cyber" },
  "apt": { severity: "high", category: "cyber" },
  "ddos": { severity: "medium", category: "cyber" },
  "critical vulnerability": { severity: "critical", category: "cyber" },
  "exploit": { severity: "high", category: "cyber" },
  // Political / Social
  "coup": { severity: "critical", category: "political" },
  "protests": { severity: "medium", category: "social" },
  "martial law": { severity: "critical", category: "political" },
  "assassination": { severity: "critical", category: "political" },
  "election interference": { severity: "high", category: "political" },
  "disinformation": { severity: "medium", category: "infowar" },
  "propaganda": { severity: "medium", category: "infowar" },
  // Economic
  "currency collapse": { severity: "high", category: "economic" },
  "bank run": { severity: "high", category: "economic" },
  "embargo": { severity: "medium", category: "economic" },
  "trade war": { severity: "medium", category: "economic" },
  // Terrorism
  "terrorist attack": { severity: "critical", category: "terrorism" },
  "ied": { severity: "high", category: "terrorism" },
  "hostage": { severity: "high", category: "terrorism" },
  "suicide bomber": { severity: "critical", category: "terrorism" },
};

const COUNTRY_KEYWORDS: Record<string, string> = {
  ukraine: "UA", russia: "RU", china: "CN", taiwan: "TW", iran: "IR",
  israel: "IL", gaza: "PS", syria: "SY", yemen: "YE", "north korea": "KP",
  "south korea": "KR", turkey: "TR", iraq: "IQ", afghanistan: "AF",
  pakistan: "PK", india: "IN", myanmar: "MM", sudan: "SD", somalia: "SO",
  lebanon: "LB", venezuela: "VE", cuba: "CU", libya: "LY", ethiopia: "ET",
  "saudi arabia": "SA", egypt: "EG", jordan: "JO", nato: "NATO",
  pentagon: "US", kremlin: "RU", beijing: "CN", tehran: "IR", pyongyang: "KP",
};

// ─── Content Analysis ───────────────────────────────────────────

function classifyContent(text: string): SocialIntelItem["threat"] | undefined {
  const lower = text.toLowerCase();
  for (const [keyword, classification] of Object.entries(INTEL_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return classification;
    }
  }
  return undefined;
}

function extractCountry(text: string): string | undefined {
  const lower = text.toLowerCase();
  for (const [keyword, code] of Object.entries(COUNTRY_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return code;
    }
  }
  return undefined;
}

function computeSentiment(text: string): number {
  const lower = text.toLowerCase();
  const positiveWords = ["peace", "ceasefire", "agreement", "diplomatic", "aid", "rescue", "support", "victory"];
  const negativeWords = ["attack", "killed", "destroyed", "threat", "war", "crisis", "explosion", "death", "bomb"];
  let score = 0;
  for (const w of positiveWords) { if (lower.includes(w)) { score += 0.15; } }
  for (const w of negativeWords) { if (lower.includes(w)) { score -= 0.15; } }
  return Math.max(-1, Math.min(1, score));
}

function extractEntities(text: string): string[] {
  const entities: string[] = [];
  // Extract @mentions
  const mentions = text.match(/@[\w]+/g);
  if (mentions) { entities.push(...mentions); }
  // Extract #hashtags
  const hashtags = text.match(/#[\w]+/g);
  if (hashtags) { entities.push(...hashtags); }
  // Extract country references
  for (const keyword of Object.keys(COUNTRY_KEYWORDS)) {
    if (text.toLowerCase().includes(keyword)) {
      entities.push(keyword);
    }
  }
  return [...new Set(entities)].slice(0, 15);
}

function computeRelevance(text: string, threat?: SocialIntelItem["threat"]): number {
  let score = 0.1; // baseline
  if (threat) {
    switch (threat.severity) {
      case "critical": score += 0.5; break;
      case "high": score += 0.35; break;
      case "medium": score += 0.2; break;
      case "low": score += 0.1; break;
    }
  }
  // More entities = more relevant
  const entityCount = extractEntities(text).length;
  score += Math.min(0.3, entityCount * 0.05);
  return Math.min(1, score);
}

// ─── Platform Adapters ──────────────────────────────────────────

/**
 * Generic social media item from any platform.
 * Each platform adapter normalizes its data to this shape.
 */
interface RawSocialPost {
  id: string;
  text: string;
  author: string;
  url: string;
  postedAt: string;
  likes: number;
  shares: number;
  replies: number;
  views: number;
  tags: string[];
}

/**
 * Twitter/X API v2 adapter.
 * Uses OAuth 2.0 Bearer token for search/stream endpoints.
 */
async function pollTwitter(creds: OAuthCredentials, feed: SocialFeedConfig): Promise<RawSocialPost[]> {
  if (!creds.accessToken && !creds.apiKey) { return []; }
  const token = creds.accessToken ?? creds.apiKey;
  const query = feed.type === "keyword" || feed.type === "hashtag"
    ? encodeURIComponent(feed.target)
    : `from:${feed.target.replace("@", "")}`;

  try {
    const resp = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=20&tweet.fields=public_metrics,created_at,author_id`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!resp.ok) { return []; }
    const data = (await resp.json()) as {
      data?: Array<{
        id: string;
        text: string;
        author_id: string;
        created_at: string;
        public_metrics?: { like_count: number; retweet_count: number; reply_count: number; impression_count: number };
      }>;
    };
    return (data.data ?? []).map((t) => ({
      id: `tw-${t.id}`,
      text: t.text,
      author: t.author_id,
      url: `https://x.com/i/status/${t.id}`,
      postedAt: t.created_at,
      likes: t.public_metrics?.like_count ?? 0,
      shares: t.public_metrics?.retweet_count ?? 0,
      replies: t.public_metrics?.reply_count ?? 0,
      views: t.public_metrics?.impression_count ?? 0,
      tags: (t.text.match(/#[\w]+/g) ?? []),
    }));
  } catch {
    return [];
  }
}

/**
 * Reddit API adapter.
 * Uses OAuth 2.0 for subreddit monitoring.
 */
async function pollReddit(creds: OAuthCredentials, feed: SocialFeedConfig): Promise<RawSocialPost[]> {
  if (!creds.accessToken && !creds.clientId) { return []; }
  const sub = feed.target.replace("r/", "").replace("/", "");
  const headers: Record<string, string> = { "User-Agent": "HoC-OSINT/1.0" };
  if (creds.accessToken) {
    headers["Authorization"] = `Bearer ${creds.accessToken}`;
  }

  try {
    const url = creds.accessToken
      ? `https://oauth.reddit.com/r/${sub}/new.json?limit=25`
      : `https://www.reddit.com/r/${sub}/new.json?limit=25`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) { return []; }
    const data = (await resp.json()) as {
      data?: {
        children?: Array<{
          data: {
            id: string; title: string; selftext: string; author: string;
            permalink: string; created_utc: number; score: number;
            num_comments: number; ups: number;
          };
        }>;
      };
    };
    return (data.data?.children ?? []).map((c) => ({
      id: `rd-${c.data.id}`,
      text: `${c.data.title}\n${c.data.selftext}`.slice(0, 2000),
      author: c.data.author,
      url: `https://reddit.com${c.data.permalink}`,
      postedAt: new Date(c.data.created_utc * 1000).toISOString(),
      likes: c.data.ups,
      shares: 0,
      replies: c.data.num_comments,
      views: 0,
      tags: [],
    }));
  } catch {
    return [];
  }
}

/**
 * Telegram Bot API adapter.
 * Monitors public channels via getUpdates or channel forwarding.
 */
async function pollTelegram(creds: OAuthCredentials, feed: SocialFeedConfig): Promise<RawSocialPost[]> {
  const token = creds.botToken ?? creds.apiKey;
  if (!token) { return []; }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=25&timeout=1`);
    if (!resp.ok) { return []; }
    const data = (await resp.json()) as {
      ok: boolean;
      result?: Array<{
        update_id: number;
        channel_post?: {
          message_id: number;
          chat: { id: number; title: string };
          text?: string;
          date: number;
        };
        message?: {
          message_id: number;
          from?: { username: string };
          text?: string;
          date: number;
        };
      }>;
    };
    return (data.result ?? [])
      .filter((u) => u.channel_post?.text || u.message?.text)
      .map((u) => {
        const post = u.channel_post ?? u.message;
        return {
          id: `tg-${u.update_id}`,
          text: (post as { text?: string })?.text ?? "",
          author: u.channel_post?.chat?.title ?? (u.message?.from?.username ?? "unknown"),
          url: `https://t.me/${feed.target}`,
          postedAt: new Date(((post as { date?: number })?.date ?? 0) * 1000).toISOString(),
          likes: 0,
          shares: 0,
          replies: 0,
          views: 0,
          tags: [],
        };
      });
  } catch {
    return [];
  }
}

/**
 * YouTube Data API v3 adapter.
 * Monitors channels/search for intelligence-relevant video content.
 */
async function pollYouTube(creds: OAuthCredentials, feed: SocialFeedConfig): Promise<RawSocialPost[]> {
  const key = creds.apiKey ?? creds.accessToken;
  if (!key) { return []; }

  try {
    const q = encodeURIComponent(feed.target);
    const resp = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${q}&key=${key}&order=date`,
    );
    if (!resp.ok) { return []; }
    const data = (await resp.json()) as {
      items?: Array<{
        id: { videoId: string };
        snippet: { title: string; channelTitle: string; publishedAt: string; description: string };
      }>;
    };
    return (data.items ?? []).map((v) => ({
      id: `yt-${v.id.videoId}`,
      text: `${v.snippet.title}\n${v.snippet.description}`.slice(0, 2000),
      author: v.snippet.channelTitle,
      url: `https://youtube.com/watch?v=${v.id.videoId}`,
      postedAt: v.snippet.publishedAt,
      likes: 0, shares: 0, replies: 0, views: 0,
      tags: [],
    }));
  } catch {
    return [];
  }
}

// ─── Platform Router ────────────────────────────────────────────

const PLATFORM_POLLERS: Record<SocialPlatform, (creds: OAuthCredentials, feed: SocialFeedConfig) => Promise<RawSocialPost[]>> = {
  twitter: pollTwitter,
  reddit: pollReddit,
  telegram: pollTelegram,
  youtube: pollYouTube,
  discord: async () => [], // Placeholder — requires gateway integration
  mastodon: async () => [], // Placeholder — ActivityPub adapter
};

// ─── Core Engine ────────────────────────────────────────────────

/**
 * Process raw posts from any platform into SocialIntelItems.
 */
function processRawPosts(posts: RawSocialPost[], platform: SocialPlatform): SocialIntelItem[] {
  const items: SocialIntelItem[] = [];
  const existingIds = new Set(ingestedItems.map((i) => i.id));

  for (const post of posts) {
    if (existingIds.has(post.id)) { continue; } // Dedup
    if (!post.text || post.text.length < 10) { continue; }

    const threat = classifyContent(post.text);
    const country = extractCountry(post.text);
    const sentiment = computeSentiment(post.text);
    const entities = extractEntities(post.text);
    const relevance = computeRelevance(post.text, threat);

    // Only ingest items with some intelligence relevance
    if (relevance < 0.15 && !threat) { continue; }

    items.push({
      id: post.id,
      platform,
      content: post.text.slice(0, 2000),
      entities,
      sentiment,
      relevanceScore: relevance,
      country,
      author: post.author,
      tags: post.tags,
      engagement: {
        likes: post.likes,
        shares: post.shares,
        replies: post.replies,
        views: post.views,
      },
      sourceUrl: post.url,
      postedAt: post.postedAt,
      ingestedAt: ts(),
      threat,
    });
  }
  return items;
}

/**
 * Execute a poll cycle for a specific feed.
 */
async function pollFeed(feed: SocialFeedConfig): Promise<number> {
  const creds = credentials.get(feed.platform);
  if (!creds || !feed.active) { return 0; }

  const poller = PLATFORM_POLLERS[feed.platform];
  if (!poller) { return 0; }

  try {
    const rawPosts = await poller(creds, feed);
    const items = processRawPosts(rawPosts, feed.platform);

    if (items.length > 0) {
      // Store locally
      ingestedItems.push(...items);
      while (ingestedItems.length > MAX_INGESTED) { ingestedItems.shift(); }

      feed.itemsCollected += items.length;
      feed.lastPollAt = ts();

      // Publish to intelligence bus
      for (const item of items) {
        intelligenceBus.publish("osint.social_intel", {
          platform: item.platform,
          country: item.country,
          threat: item.threat,
          sentiment: item.sentiment,
          relevance: item.relevanceScore,
          content: item.content.slice(0, 300),
          author: item.author,
          timestamp: Date.now(),
        });
      }

      // Publish high-severity items as alerts
      const criticals = items.filter((i) => i.threat?.severity === "critical" || i.threat?.severity === "high");
      for (const alert of criticals) {
        intelligenceBus.publish("osint.social_alert", {
          platform: alert.platform,
          severity: alert.threat!.severity,
          category: alert.threat!.category,
          country: alert.country,
          content: alert.content.slice(0, 500),
          source: alert.sourceUrl,
          timestamp: Date.now(),
        });
      }
    }

    return items.length;
  } catch {
    return 0;
  }
}

// ─── Public API ─────────────────────────────────────────────────

/** Configure OAuth credentials for a platform */
export function configurePlatform(creds: OAuthCredentials): void {
  credentials.set(creds.platform, creds);
}

/** Get configured platforms */
export function getConfiguredPlatforms(): SocialPlatform[] {
  return [...credentials.keys()];
}

/** Add a monitoring feed */
export function addFeed(config: Omit<SocialFeedConfig, "id" | "createdAt" | "itemsCollected">): SocialFeedConfig {
  const feed: SocialFeedConfig = {
    ...config,
    id: `sf-${uid().slice(0, 8)}`,
    createdAt: ts(),
    itemsCollected: 0,
  };
  feeds.push(feed);

  // Start polling if active
  if (feed.active) {
    startFeedPolling(feed);
  }

  return feed;
}

/** Start polling for a feed */
function startFeedPolling(feed: SocialFeedConfig): void {
  if (pollTimers.has(feed.id)) { return; }
  const interval = setInterval(
    () => void pollFeed(feed),
    (feed.pollIntervalSec || 300) * 1000,
  );
  pollTimers.set(feed.id, interval);

  // Immediate first poll
  void pollFeed(feed);
}

/** Stop polling for a feed */
function stopFeedPolling(feedId: string): void {
  const timer = pollTimers.get(feedId);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(feedId);
  }
}

/** Toggle feed active state */
export function toggleFeed(feedId: string, active: boolean): boolean {
  const feed = feeds.find((f) => f.id === feedId);
  if (!feed) { return false; }
  feed.active = active;
  if (active) {
    startFeedPolling(feed);
  } else {
    stopFeedPolling(feedId);
  }
  return true;
}

/** Remove a feed */
export function removeFeed(feedId: string): boolean {
  const idx = feeds.findIndex((f) => f.id === feedId);
  if (idx < 0) { return false; }
  stopFeedPolling(feedId);
  feeds.splice(idx, 1);
  return true;
}

/** Get all feeds */
export function getFeeds(): SocialFeedConfig[] {
  return [...feeds];
}

/** Get ingested items with optional filters */
export function getIngestedItems(opts: {
  platform?: SocialPlatform;
  country?: string;
  minRelevance?: number;
  severity?: string;
  limit?: number;
} = {}): SocialIntelItem[] {
  let items = [...ingestedItems];
  if (opts.platform) { items = items.filter((i) => i.platform === opts.platform); }
  if (opts.country) { items = items.filter((i) => i.country === opts.country); }
  if (opts.minRelevance) { items = items.filter((i) => i.relevanceScore >= opts.minRelevance!); }
  if (opts.severity) { items = items.filter((i) => i.threat?.severity === opts.severity); }
  return items.slice(-(opts.limit ?? 50));
}

/** Get channel status */
export function getStatus(): SocialChannelStatus {
  const platformStats = new Map<SocialPlatform, { feedCount: number; totalItems: number; lastActivity?: string }>();

  for (const feed of feeds) {
    const stat = platformStats.get(feed.platform) ?? { feedCount: 0, totalItems: 0 };
    stat.feedCount++;
    stat.totalItems += feed.itemsCollected;
    if (feed.lastPollAt && (!stat.lastActivity || feed.lastPollAt > stat.lastActivity)) {
      stat.lastActivity = feed.lastPollAt;
    }
    platformStats.set(feed.platform, stat);
  }

  return {
    platforms: [...platformStats.entries()].map(([platform, stat]) => ({
      platform,
      authenticated: credentials.has(platform),
      feedCount: stat.feedCount,
      totalItems: stat.totalItems,
      lastActivity: stat.lastActivity,
    })),
    totalFeeds: feeds.length,
    totalItemsIngested: ingestedItems.length,
    activeFeeds: feeds.filter((f) => f.active).length,
  };
}

/** Stop all polling (for shutdown) */
export function stopAllFeeds(): void {
  for (const [id] of pollTimers) {
    stopFeedPolling(id);
  }
  pollTimers = new Map();
}

// ─── Default Intelligence Feeds ─────────────────────────────────

/** Pre-configured OSINT feeds for key intelligence sources */
export const DEFAULT_INTEL_FEEDS: Array<Omit<SocialFeedConfig, "id" | "createdAt" | "itemsCollected">> = [
  // Twitter/X OSINT sources
  { platform: "twitter", type: "account", target: "@ABORINTELL", active: false, pollIntervalSec: 300 },
  { platform: "twitter", type: "account", target: "@IntelCrab", active: false, pollIntervalSec: 300 },
  { platform: "twitter", type: "account", target: "@Nrg8000", active: false, pollIntervalSec: 300 },
  { platform: "twitter", type: "account", target: "@TheStudyofWar", active: false, pollIntervalSec: 300 },
  { platform: "twitter", type: "hashtag", target: "#OSINT", active: false, pollIntervalSec: 600 },
  { platform: "twitter", type: "hashtag", target: "#UkraineWar", active: false, pollIntervalSec: 300 },
  { platform: "twitter", type: "hashtag", target: "#MiddleEast", active: false, pollIntervalSec: 600 },

  // Reddit intelligence subreddits
  { platform: "reddit", type: "subreddit", target: "r/worldnews", active: false, pollIntervalSec: 300 },
  { platform: "reddit", type: "subreddit", target: "r/geopolitics", active: false, pollIntervalSec: 600 },
  { platform: "reddit", type: "subreddit", target: "r/CredibleDefense", active: false, pollIntervalSec: 600 },
  { platform: "reddit", type: "subreddit", target: "r/netsec", active: false, pollIntervalSec: 600 },
  { platform: "reddit", type: "subreddit", target: "r/OSINT", active: false, pollIntervalSec: 900 },
  { platform: "reddit", type: "subreddit", target: "r/CombatFootage", active: false, pollIntervalSec: 600 },

  // YouTube intelligence channels
  { platform: "youtube", type: "keyword", target: "military analysis", active: false, pollIntervalSec: 1800 },
  { platform: "youtube", type: "keyword", target: "geopolitics briefing", active: false, pollIntervalSec: 1800 },

  // Telegram channels (require Bot API token)
  { platform: "telegram", type: "channel", target: "intelopenai", active: false, pollIntervalSec: 300 },
];

/** Initialize default feeds (call after platform credentials are configured) */
export function initializeDefaultFeeds(): void {
  for (const feedCfg of DEFAULT_INTEL_FEEDS) {
    // Only add feeds for configured platforms
    if (credentials.has(feedCfg.platform)) {
      const existing = feeds.find((f) => f.platform === feedCfg.platform && f.target === feedCfg.target);
      if (!existing) {
        addFeed({ ...feedCfg, active: true });
      }
    }
  }
}
