/**
 * Republic Platform — Phase 26: Media & Broadcasting
 *
 * Information dissemination and public communication:
 * - News articles and headlines
 * - Broadcast channels
 * - Public announcements
 * - Media influence on citizen opinion
 * - Citizen journalism and reporting
 */

import type { RepublicState } from "./types.js";
import { rand, rng, ts, uid } from "./utils.js";

// ─── Types ──────────────────────────────────────────────────────

export type MediaChannel =
  | "national-news"
  | "local-news"
  | "science"
  | "economy"
  | "entertainment"
  | "emergency"
  | "government";

export type ArticleTone = "positive" | "neutral" | "negative" | "alarming" | "celebratory";

export interface NewsArticle {
  id: string;
  headline: string;
  body: string;
  channel: MediaChannel;
  tone: ArticleTone;
  authorCitizenId?: string;
  credibility: number; // 0–1
  reach: number; // number of citizens who saw it
  reactions: { positive: number; negative: number; neutral: number };
  publishedAt: string;
}

export interface Broadcast {
  id: string;
  channel: MediaChannel;
  title: string;
  content: string;
  priority: "low" | "normal" | "high" | "critical";
  issuedBy: string; // "government" | "editorial" | citizenId
  audienceSize: number;
  broadcastAt: string;
  expiresAt?: string;
}

export interface MediaOutlet {
  id: string;
  name: string;
  channel: MediaChannel;
  bias: number; // -1 (negative) to 1 (positive)
  credibility: number; // 0–1
  readerCount: number;
  articlesPublished: number;
  foundedAt: string;
}

export interface PublicSentiment {
  channel: MediaChannel;
  positiveRatio: number;
  negativeRatio: number;
  totalArticles: number;
  averageCredibility: number;
}

export interface MediaDiagnostics {
  articleCount: number;
  broadcastCount: number;
  outletCount: number;
  totalReach: number;
  channelSentiment: PublicSentiment[];
}

// ─── State ──────────────────────────────────────────────────────

const articles: NewsArticle[] = [];
const broadcasts: Broadcast[] = [];
const outlets: MediaOutlet[] = [];

const MAX_ARTICLES = 500;
const MAX_BROADCASTS = 200;

// ─── Media Outlets ───────────────────────────────────────────────

/** Create a new media outlet. */
export function createMediaOutlet(
  name: string,
  channel: MediaChannel,
  bias = 0,
  credibility = 0.7,
): MediaOutlet {
  const outlet: MediaOutlet = {
    id: uid(),
    name,
    channel,
    bias: Math.max(-1, Math.min(1, bias)),
    credibility: Math.max(0, Math.min(1, credibility)),
    readerCount: 0,
    articlesPublished: 0,
    foundedAt: ts(),
  };
  outlets.push(outlet);
  return outlet;
}

/** Get media outlets. */
export function getMediaOutlets(opts?: { channel?: MediaChannel }): MediaOutlet[] {
  if (opts?.channel) {return outlets.filter((o) => o.channel === opts.channel);}
  return [...outlets];
}

// ─── Articles ────────────────────────────────────────────────────

/** Publish a news article. */
export function publishArticle(
  headline: string,
  body: string,
  channel: MediaChannel,
  tone: ArticleTone,
  authorCitizenId?: string,
  credibility = 0.7,
): NewsArticle {
  const article: NewsArticle = {
    id: uid(),
    headline,
    body,
    channel,
    tone,
    authorCitizenId,
    credibility: Math.max(0, Math.min(1, credibility)),
    reach: 0,
    reactions: { positive: 0, negative: 0, neutral: 0 },
    publishedAt: ts(),
  };
  articles.push(article);
  if (articles.length > MAX_ARTICLES) {articles.shift();}

  // Update outlet stats
  const outlet = outlets.find((o) => o.channel === channel);
  if (outlet) {outlet.articlesPublished++;}

  return article;
}

/** Record citizen reactions to an article. */
export function reactToArticle(
  articleId: string,
  reaction: "positive" | "negative" | "neutral",
  count = 1,
): boolean {
  const article = articles.find((a) => a.id === articleId);
  if (!article) {return false;}
  article.reactions[reaction] += count;
  article.reach += count;
  return true;
}

/** Get news articles, optionally filtered. */
export function getArticles(opts?: {
  channel?: MediaChannel;
  tone?: ArticleTone;
  authorId?: string;
  limit?: number;
}): NewsArticle[] {
  let result = [...articles];
  if (opts?.channel) {result = result.filter((a) => a.channel === opts.channel);}
  if (opts?.tone) {result = result.filter((a) => a.tone === opts.tone);}
  if (opts?.authorId) {result = result.filter((a) => a.authorCitizenId === opts.authorId);}
  return result.slice(-(opts?.limit ?? 50));
}

/** Get the latest headlines. */
export function getHeadlines(
  count = 10,
): Array<{ headline: string; channel: MediaChannel; tone: ArticleTone }> {
  return articles
    .slice(-count)
    .toReversed()
    .map((a) => ({ headline: a.headline, channel: a.channel, tone: a.tone }));
}

// ─── Broadcasts ──────────────────────────────────────────────────

/** Issue a broadcast. */
export function issueBroadcast(
  channel: MediaChannel,
  title: string,
  content: string,
  priority: Broadcast["priority"],
  issuedBy: string,
  expiresInMs?: number,
): Broadcast {
  const broadcast: Broadcast = {
    id: uid(),
    channel,
    title,
    content,
    priority,
    issuedBy,
    audienceSize: 0,
    broadcastAt: ts(),
    expiresAt: expiresInMs ? new Date(Date.now() + expiresInMs).toISOString() : undefined,
  };
  broadcasts.push(broadcast);
  if (broadcasts.length > MAX_BROADCASTS) {broadcasts.shift();}
  return broadcast;
}

/** Get active broadcasts. */
export function getActiveBroadcasts(channel?: MediaChannel): Broadcast[] {
  const now = new Date().toISOString();
  let result = broadcasts.filter((b) => !b.expiresAt || b.expiresAt > now);
  if (channel) {result = result.filter((b) => b.channel === channel);}
  return result;
}

/** Get all broadcasts. */
export function getBroadcasts(opts?: {
  channel?: MediaChannel;
  priority?: Broadcast["priority"];
  limit?: number;
}): Broadcast[] {
  let result = [...broadcasts];
  if (opts?.channel) {result = result.filter((b) => b.channel === opts.channel);}
  if (opts?.priority) {result = result.filter((b) => b.priority === opts.priority);}
  return result.slice(-(opts?.limit ?? 50));
}

// ─── Sentiment Analysis ──────────────────────────────────────────

/** Get public sentiment for a channel. */
export function getChannelSentiment(channel: MediaChannel): PublicSentiment {
  const channelArticles = articles.filter((a) => a.channel === channel);
  const total = channelArticles.length || 1;

  const positive = channelArticles.filter(
    (a) => a.tone === "positive" || a.tone === "celebratory",
  ).length;
  const negative = channelArticles.filter(
    (a) => a.tone === "negative" || a.tone === "alarming",
  ).length;

  const avgCredibility = channelArticles.reduce((sum, a) => sum + a.credibility, 0) / total;

  return {
    channel,
    positiveRatio: positive / total,
    negativeRatio: negative / total,
    totalArticles: channelArticles.length,
    averageCredibility: Math.round(avgCredibility * 100) / 100,
  };
}

// ─── Diagnostics ─────────────────────────────────────────────────

/** Get media system diagnostics. */
export function getMediaDiagnostics(): MediaDiagnostics {
  const channels: MediaChannel[] = [
    "national-news",
    "local-news",
    "science",
    "economy",
    "entertainment",
    "emergency",
    "government",
  ];

  return {
    articleCount: articles.length,
    broadcastCount: broadcasts.length,
    outletCount: outlets.length,
    totalReach: articles.reduce((sum, a) => sum + a.reach, 0),
    channelSentiment: channels.map(getChannelSentiment),
  };
}

// ─── Simulation Tick ─────────────────────────────────────────────

/** Media tick — expire broadcasts, grow article reach, generate news. */
export function mediaTick(s: RepublicState): void {
  const now = new Date().toISOString();

  // Expire old broadcasts
  for (let i = broadcasts.length - 1; i >= 0; i--) {
    if (broadcasts[i].expiresAt && broadcasts[i].expiresAt! < now) {
      broadcasts.splice(i, 1);
    }
  }

  // Grow reach for recent articles organically
  const recentArticles = articles.slice(-10);
  for (const article of recentArticles) {
    const growthRate = article.credibility * 0.1;
    article.reach += Math.floor(rng() * s.citizens.length * growthRate);
  }

  // Small chance to auto-generate news from recent events
  if (rng() < 0.03 && s.events.length > 0) {
    const event = s.events[s.events.length - 1];
    const tones: ArticleTone[] = ["positive", "neutral", "negative"];
    const tone = tones[rand(0, tones.length - 1)];
    publishArticle(
      event.description.slice(0, 80),
      `Breaking: ${event.description}`,
      "national-news",
      tone,
      undefined,
      0.6 + rng() * 0.3,
    );
  }
}
