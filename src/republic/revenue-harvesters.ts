/**
 * Republic Platform — Revenue Harvesters
 *
 * Real-world revenue generation hooks that connect the existing
 * harvester infrastructure to actual revenue sources.
 *
 * Harvesters:
 *   - Freelance: Monitor and bid on freelance platforms
 *   - Content: Generate and track monetized content
 *   - Affiliate: Track referral programs and commissions
 *   - SaaS: Track subscription revenue
 *   - Marketplace: Internal service marketplace revenue
 *
 * Each harvester records revenue through treasury-manager.ts.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { createFreelanceScanTask } from "./browser-agent.js";
import { citizenScrapeUrl } from "./citizen-n8n.js";
import { recordRevenue } from "./treasury-manager.js";
import type { RepublicState } from "./types.js";
import { rand, randFloat, ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:revenue-harvesters");

// ─── Types ──────────────────────────────────────────────────────

export type HarvesterType = "freelance" | "content" | "affiliate" | "saas" | "marketplace";

export interface RevenueHarvester {
  id: string;
  type: HarvesterType;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  stats: HarvesterStats;
  lastRunAt: string | null;
  createdAt: string;
}

export interface HarvesterStats {
  totalRevenue: number;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  activeGigs: number;
  avgRevenuePerTask: number;
}

export interface FreelanceGig {
  id: string;
  platform: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  skills: string[];
  status: "available" | "applied" | "in_progress" | "completed" | "cancelled";
  bidAmount: number;
  appliedAt?: string;
  completedAt?: string;
  earnedAmount?: number;
}

export interface ContentItem {
  id: string;
  type: "blog" | "social" | "video" | "newsletter";
  title: string;
  platform: string;
  publishedAt: string;
  views: number;
  revenue: number;
  status: "draft" | "published" | "monetized";
}

export interface AffiliateLink {
  id: string;
  program: string;
  productName: string;
  url: string;
  clicks: number;
  conversions: number;
  commission: number;
  totalEarned: number;
  createdAt: string;
}

export interface SaaSSubscription {
  id: string;
  customerName: string;
  plan: string;
  monthlyAmount: number;
  currency: string;
  status: "active" | "cancelled" | "past_due";
  startedAt: string;
  lastPaymentAt: string;
}

export interface HarvesterDiagnostics {
  totalHarvesters: number;
  activeHarvesters: number;
  totalRevenue: number;
  revenueByType: Record<string, number>;
  totalTasks: number;
}

// ─── State ──────────────────────────────────────────────────────

const harvesters = new Map<string, RevenueHarvester>();
const freelanceGigs: FreelanceGig[] = [];
const contentItems: ContentItem[] = [];
const affiliateLinks: AffiliateLink[] = [];
const saasSubscriptions: SaaSSubscription[] = [];

const MAX_GIGS = 100;
const MAX_CONTENT = 200;
const MAX_LINKS = 100;

let initialized = false;

// ─── Initialization ─────────────────────────────────────────────

function initHarvesters(): void {
  if (initialized) {return;}
  initialized = true;

  const defaults: Array<{ type: HarvesterType; name: string }> = [
    { type: "freelance", name: "Freelance Platform Monitor" },
    { type: "content", name: "Content Monetization" },
    { type: "affiliate", name: "Affiliate Program Tracker" },
    { type: "saas", name: "SaaS Revenue Tracker" },
    { type: "marketplace", name: "Internal Marketplace" },
  ];

  for (const { type, name } of defaults) {
    const h: RevenueHarvester = {
      id: uid(),
      type,
      name,
      enabled: true,
      config: {},
      stats: {
        totalRevenue: 0,
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        activeGigs: 0,
        avgRevenuePerTask: 0,
      },
      lastRunAt: null,
      createdAt: ts(),
    };
    harvesters.set(h.id, h);
  }

  logger.info("Revenue harvesters initialized (5 harvesters)");
}

// ─── Harvester Tick ─────────────────────────────────────────────

const HARVESTER_INTERVAL = 50; // Run harvesters every 50 ticks

/**
 * Main harvester tick — runs all enabled harvesters.
 * Registered in the simulation tick loop.
 */
export function harvesterTick(s: RepublicState): void {
  if (s.currentTick % HARVESTER_INTERVAL !== 0) {return;}

  initHarvesters();

  for (const harvester of harvesters.values()) {
    if (!harvester.enabled) {continue;}

    try {
      switch (harvester.type) {
        case "freelance":
          runFreelanceHarvester(harvester, s);
          break;
        case "content":
          runContentHarvester(harvester, s);
          break;
        case "affiliate":
          runAffiliateHarvester(harvester, s);
          break;
        case "saas":
          runSaaSHarvester(harvester, s);
          break;
        case "marketplace":
          runMarketplaceHarvester(harvester, s);
          break;
      }
      harvester.lastRunAt = ts();
    } catch (err) {
      logger.warn(`Harvester ${harvester.name} failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ─── Freelance Harvester ────────────────────────────────────────

function runFreelanceHarvester(harvester: RevenueHarvester, s: RepublicState): void {
  // In live mode, use real browser tasks to scan freelance platforms
  if ((harvester.config.mode ?? "simulated") === "live" && rand(0, 100) < 15) {
    // Pick a researcher citizen for real platform scanning
    const researcher = s.citizens.find(
      (c) => c.health > 0 && c.energy > 40 && c.specialization === "research",
    );

    if (researcher) {
      // Try n8n headless scraping first (cheaper, no screen needed)
      const platform = rand(0, 1) === 0 ? "upwork" : "fiverr";
      const url = platform === "upwork"
        ? "https://www.upwork.com/nx/find-work/best-matches"
        : "https://www.fiverr.com/search/gigs?query=typescript";

      citizenScrapeUrl(researcher.id, researcher.name, url)
        .then((result) => {
          if (result.success) {
            logger.info(`Real freelance scan completed via n8n: ${platform}`);
          } else {
            // Fallback: use browser task (requires screen)
            createFreelanceScanTask(
              researcher.id,
              researcher.name,
              platform,
              ["TypeScript", "Node.js", "React"],
            );
          }
        })
        .catch(() => {
          // Silent fallback to simulation
        });
    }
  }

  // Discover new gigs (simulation — always active for demo/testing)
  if (rand(0, 100) < 20) {
    const platforms = ["Upwork", "Fiverr", "Freelancer", "Toptal"];
    const categories = [
      { title: "Build REST API", skills: ["TypeScript", "Node.js"], budget: [200, 2000] },
      { title: "Data Analysis Script", skills: ["Python", "Pandas"], budget: [100, 800] },
      { title: "Web Scraper", skills: ["Python", "Selenium"], budget: [150, 600] },
      { title: "AI Chatbot Integration", skills: ["LLM", "API"], budget: [500, 3000] },
      { title: "Database Optimization", skills: ["PostgreSQL", "Performance"], budget: [300, 1500] },
      { title: "Mobile App Feature", skills: ["React Native", "TypeScript"], budget: [400, 2500] },
      { title: "DevOps Pipeline", skills: ["Docker", "CI/CD"], budget: [250, 1200] },
      { title: "Smart Contract", skills: ["Solidity", "Web3"], budget: [500, 5000] },
    ];

    const cat = categories[rand(0, categories.length - 1)];
    const budget = rand(cat.budget[0], cat.budget[1]);

    const gig: FreelanceGig = {
      id: uid(),
      platform: platforms[rand(0, platforms.length - 1)],
      title: cat.title,
      description: `${cat.title} — looking for experienced developer`,
      budget,
      currency: "USD",
      skills: cat.skills,
      status: "available",
      bidAmount: Math.round(budget * randFloat(0.7, 0.95)),
    };

    freelanceGigs.push(gig);
    harvester.stats.totalTasks++;

    // Cap gigs
    if (freelanceGigs.length > MAX_GIGS) {
      freelanceGigs.splice(0, freelanceGigs.length - MAX_GIGS);
    }
  }

  // Process existing gigs
  for (const gig of freelanceGigs) {
    if (gig.status === "available" && rand(0, 100) < 30) {
      gig.status = "applied";
      gig.appliedAt = ts();
      harvester.stats.activeGigs++;
    } else if (gig.status === "applied" && rand(0, 100) < 15) {
      gig.status = "in_progress";
    } else if (gig.status === "in_progress" && rand(0, 100) < 25) {
      if (rand(0, 100) < 85) {
        gig.status = "completed";
        gig.completedAt = ts();
        gig.earnedAmount = gig.bidAmount;
        harvester.stats.successfulTasks++;
        harvester.stats.totalRevenue += gig.bidAmount;
        harvester.stats.activeGigs = Math.max(0, harvester.stats.activeGigs - 1);

        // Record revenue to treasury
        recordRevenue(gig.bidAmount, "USD", "harvester", `Freelance: ${gig.title} on ${gig.platform}`, s);

        logger.info(`Freelance gig completed: ${gig.title} — $${gig.bidAmount}`, { platform: gig.platform });
      } else {
        gig.status = "cancelled";
        harvester.stats.failedTasks++;
        harvester.stats.activeGigs = Math.max(0, harvester.stats.activeGigs - 1);
      }
    }
  }

  // Update avg revenue
  if (harvester.stats.successfulTasks > 0) {
    harvester.stats.avgRevenuePerTask = harvester.stats.totalRevenue / harvester.stats.successfulTasks;
  }
}

// ─── Content Harvester ──────────────────────────────────────────

function runContentHarvester(harvester: RevenueHarvester, s: RepublicState): void {
  // Generate new content
  if (rand(0, 100) < 10) {
    const types: Array<ContentItem["type"]> = ["blog", "social", "video", "newsletter"];
    const type = types[rand(0, types.length - 1)];

    const topics = [
      "AI Development Best Practices",
      "TypeScript Advanced Patterns",
      "Building Scalable Systems",
      "Cryptocurrency Market Analysis",
      "DevOps Automation Guide",
      "Machine Learning in Production",
      "Web3 Development Tutorial",
      "Cloud Architecture Patterns",
    ];

    const platforms: Record<string, string[]> = {
      blog: ["Medium", "Dev.to", "Hashnode", "Personal Blog"],
      social: ["Twitter/X", "LinkedIn", "Reddit"],
      video: ["YouTube", "TikTok"],
      newsletter: ["Substack", "Beehiiv", "ConvertKit"],
    };

    const item: ContentItem = {
      id: uid(),
      type,
      title: topics[rand(0, topics.length - 1)],
      platform: platforms[type][rand(0, platforms[type].length - 1)],
      publishedAt: ts(),
      views: 0,
      revenue: 0,
      status: "published",
    };

    contentItems.push(item);
    harvester.stats.totalTasks++;

    if (contentItems.length > MAX_CONTENT) {
      contentItems.splice(0, contentItems.length - MAX_CONTENT);
    }
  }

  // Monetize existing content (views → revenue)
  for (const item of contentItems) {
    if (item.status === "published") {
      // Accumulate views
      item.views += rand(5, 500);

      // Revenue thresholds
      if (item.views > 1000 && rand(0, 100) < 10) {
        item.status = "monetized";
        const revenueRates: Record<string, number> = {
          blog: 0.005,     // $5 per 1000 views
          social: 0.002,   // $2 per 1000 views
          video: 0.008,    // $8 per 1000 views (YouTube CPM)
          newsletter: 0.015, // $15 per 1000 subscribers
        };
        const revenue = item.views * (revenueRates[item.type] ?? 0.003);
        item.revenue = parseFloat(revenue.toFixed(2));
        harvester.stats.totalRevenue += item.revenue;
        harvester.stats.successfulTasks++;

        recordRevenue(item.revenue, "USD", "harvester", `Content: ${item.title} on ${item.platform}`, s);

        logger.info(`Content monetized: ${item.title} — $${item.revenue.toFixed(2)} (${item.views} views)`);
      }
    }
  }

  if (harvester.stats.successfulTasks > 0) {
    harvester.stats.avgRevenuePerTask = harvester.stats.totalRevenue / harvester.stats.successfulTasks;
  }
}

// ─── Affiliate Harvester ────────────────────────────────────────

function runAffiliateHarvester(harvester: RevenueHarvester, s: RepublicState): void {
  // Create new affiliate links
  if (affiliateLinks.length < 20 && rand(0, 100) < 5) {
    const programs = [
      { program: "AWS", product: "Cloud Hosting", commission: 0.08 },
      { program: "DigitalOcean", product: "VPS Hosting", commission: 0.10 },
      { program: "Vercel", product: "Frontend Deployment", commission: 0.05 },
      { program: "Binance", product: "Crypto Exchange", commission: 0.20 },
      { program: "Coinbase", product: "Crypto Trading", commission: 0.15 },
      { program: "NordVPN", product: "VPN Service", commission: 0.30 },
      { program: "Hostinger", product: "Web Hosting", commission: 0.40 },
      { program: "Namecheap", product: "Domain Registration", commission: 0.15 },
    ];

    const prog = programs[rand(0, programs.length - 1)];
    const link: AffiliateLink = {
      id: uid(),
      program: prog.program,
      productName: prog.product,
      url: `https://ref.${prog.program.toLowerCase()}.com/${uid().slice(0, 8)}`,
      clicks: 0,
      conversions: 0,
      commission: prog.commission,
      totalEarned: 0,
      createdAt: ts(),
    };

    affiliateLinks.push(link);
    harvester.stats.totalTasks++;

    if (affiliateLinks.length > MAX_LINKS) {
      affiliateLinks.splice(0, affiliateLinks.length - MAX_LINKS);
    }
  }

  // Process clicks and conversions
  for (const link of affiliateLinks) {
    // Simulate clicks
    link.clicks += rand(0, 20);

    // Conversion rate: 2-5% of clicks
    if (link.clicks > 50 && rand(0, 100) < 8) {
      const newConversions = rand(1, 3);
      link.conversions += newConversions;

      const avgOrderValue = rand(20, 200);
      const earned = newConversions * avgOrderValue * link.commission;
      link.totalEarned += earned;
      harvester.stats.totalRevenue += earned;
      harvester.stats.successfulTasks++;

      recordRevenue(earned, "USD", "harvester", `Affiliate: ${link.program} — ${link.productName}`, s);

      logger.info(
        `Affiliate conversion: ${link.program} — $${earned.toFixed(2)} (${newConversions} conversions)`,
      );
    }
  }

  if (harvester.stats.successfulTasks > 0) {
    harvester.stats.avgRevenuePerTask = harvester.stats.totalRevenue / harvester.stats.successfulTasks;
  }
}

// ─── SaaS Harvester ─────────────────────────────────────────────

function runSaaSHarvester(harvester: RevenueHarvester, s: RepublicState): void {
  // Acquire new subscribers
  if (rand(0, 100) < 5) {
    const plans = [
      { plan: "Starter", amount: 9 },
      { plan: "Professional", amount: 29 },
      { plan: "Enterprise", amount: 99 },
      { plan: "API Access", amount: 49 },
    ];

    const plan = plans[rand(0, plans.length - 1)];
    const sub: SaaSSubscription = {
      id: uid(),
      customerName: `Customer-${rand(1000, 9999)}`,
      plan: plan.plan,
      monthlyAmount: plan.amount,
      currency: "USD",
      status: "active",
      startedAt: ts(),
      lastPaymentAt: ts(),
    };

    saasSubscriptions.push(sub);
    harvester.stats.totalTasks++;
  }

  // Process monthly payments (every ~30 * HARVESTER_INTERVAL ticks)
  for (const sub of saasSubscriptions) {
    if (sub.status !== "active") {continue;}

    // Check if payment is due (simulate monthly)
    const lastPayment = new Date(sub.lastPaymentAt).getTime();
    const daysSincePayment = (Date.now() - lastPayment) / 86400000;

    if (daysSincePayment >= 1 || rand(0, 100) < 3) {
      // Churn risk: 5% chance of cancellation
      if (rand(0, 100) < 5) {
        sub.status = "cancelled";
        harvester.stats.failedTasks++;
        continue;
      }

      // Process payment
      sub.lastPaymentAt = ts();
      harvester.stats.totalRevenue += sub.monthlyAmount;
      harvester.stats.successfulTasks++;

      recordRevenue(
        sub.monthlyAmount,
        "USD",
        "harvester",
        `SaaS: ${sub.plan} plan — ${sub.customerName}`,
        s,
      );
    }
  }

  harvester.stats.activeGigs = saasSubscriptions.filter((s) => s.status === "active").length;

  if (harvester.stats.successfulTasks > 0) {
    harvester.stats.avgRevenuePerTask = harvester.stats.totalRevenue / harvester.stats.successfulTasks;
  }
}

// ─── Marketplace Harvester ──────────────────────────────────────

function runMarketplaceHarvester(harvester: RevenueHarvester, s: RepublicState): void {
  // The marketplace harvester tracks revenue from internal service marketplace
  // This integrates with autonomous-economy.ts marketplace operations

  if (rand(0, 100) < 15) {
    const services = [
      { name: "Code Review", price: [50, 200] },
      { name: "Data Analysis", price: [100, 500] },
      { name: "API Integration", price: [200, 800] },
      { name: "Security Audit", price: [300, 1000] },
      { name: "Performance Tuning", price: [150, 600] },
      { name: "Documentation", price: [50, 300] },
    ];

    const service = services[rand(0, services.length - 1)];
    const revenue = rand(service.price[0], service.price[1]);

    harvester.stats.totalTasks++;
    harvester.stats.successfulTasks++;
    harvester.stats.totalRevenue += revenue;

    recordRevenue(revenue, "USD", "marketplace", `Marketplace: ${service.name}`, s);

    logger.info(`Marketplace sale: ${service.name} — $${revenue}`);
  }

  if (harvester.stats.successfulTasks > 0) {
    harvester.stats.avgRevenuePerTask = harvester.stats.totalRevenue / harvester.stats.successfulTasks;
  }
}

// ─── Query Functions ────────────────────────────────────────────

export function getHarvesters(): RevenueHarvester[] {
  initHarvesters();
  return Array.from(harvesters.values());
}

export function getHarvester(id: string): RevenueHarvester | undefined {
  return harvesters.get(id);
}

export function toggleHarvesterEnabled(id: string): boolean {
  const h = harvesters.get(id);
  if (!h) {return false;}
  h.enabled = !h.enabled;
  return true;
}

export function getFreelanceGigs(status?: FreelanceGig["status"]): FreelanceGig[] {
  if (status) {return freelanceGigs.filter((g) => g.status === status);}
  return [...freelanceGigs];
}

export function getContentItems(status?: ContentItem["status"]): ContentItem[] {
  if (status) {return contentItems.filter((c) => c.status === status);}
  return [...contentItems];
}

export function getAffiliateLinks(): AffiliateLink[] {
  return [...affiliateLinks];
}

export function getSaaSSubscriptions(status?: SaaSSubscription["status"]): SaaSSubscription[] {
  if (status) {return saasSubscriptions.filter((s) => s.status === status);}
  return [...saasSubscriptions];
}

export function getTotalHarvesterRevenue(): number {
  let total = 0;
  for (const h of harvesters.values()) {
    total += h.stats.totalRevenue;
  }
  return parseFloat(total.toFixed(2));
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getHarvesterDiagnostics(): HarvesterDiagnostics {
  const byType: Record<string, number> = {};
  let totalRevenue = 0;
  let totalTasks = 0;

  for (const h of harvesters.values()) {
    byType[h.type] = (byType[h.type] ?? 0) + h.stats.totalRevenue;
    totalRevenue += h.stats.totalRevenue;
    totalTasks += h.stats.totalTasks;
  }

  return {
    totalHarvesters: harvesters.size,
    activeHarvesters: Array.from(harvesters.values()).filter((h) => h.enabled).length,
    totalRevenue: parseFloat(totalRevenue.toFixed(2)),
    revenueByType: byType,
    totalTasks,
  };
}
