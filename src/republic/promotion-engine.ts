/**
 * Republic Platform — Promotion Engine
 *
 * Enables citizens to promote themselves, their productions, and the Republic.
 *
 * Capabilities:
 * - Citizen personal brand videos and banners
 * - Production/product advertisements
 * - Republic-wide promotional campaigns
 * - Social media cards (HTML banners)
 * - Integration with marketplace listings
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { emitNationalEvent } from "./event-sourcing.js";
import { uid } from "./utils.js";
import type { VideoResult } from "./video-producer.js";
import { produceAdvertisement, produceRepublicBroadcast, produceVideo } from "./video-producer.js";

// ─── Types ──────────────────────────────────────────────────────

export interface CitizenProfile {
  id: string;
  name: string;
  specialization: string;
  skillLevel: number;
  productionCount: number;
  achievements: string[];
}

export interface PromotionSpec {
  type: "citizen_brand" | "product_ad" | "republic_campaign" | "social_card";
  citizen: CitizenProfile;
  /** Title of the production being promoted (for product_ad) */
  productTitle?: string;
  /** Custom tagline override */
  tagline?: string;
  /** Output directory */
  outputDir: string;
}

export interface PromotionResult {
  success: boolean;
  type: PromotionSpec["type"];
  videoResult?: VideoResult;
  htmlBannerPath?: string;
  socialCardPath?: string;
  error?: string;
}

// ─── Tagline Generator ──────────────────────────────────────────

const CITIZEN_TAGLINES: Record<string, string[]> = {
  Engineer: [
    "Building Tomorrow's Infrastructure",
    "Engineering Excellence, Delivered",
    "Code That Shapes the Future",
  ],
  Developer: ["Crafting Digital Experiences", "From Concept to Code", "Full-Stack Visionary"],
  Writer: ["Words That Move the World", "Storytelling Redefined", "Narratives with Purpose"],
  Designer: ["Design That Speaks Volumes", "Pixel-Perfect Creativity", "Where Art Meets Function"],
  Musician: ["Soundscapes That Inspire", "Composing the Future", "Music Without Boundaries"],
  Filmmaker: ["Cinema Reimagined", "Visual Stories That Resonate", "Frame by Frame Excellence"],
  DataScientist: [
    "Insights from the Data Universe",
    "Turning Data into Decisions",
    "Analytics That Drive Impact",
  ],
  GameDeveloper: [
    "Worlds Worth Exploring",
    "Play the Revolution",
    "Interactive Experiences Redefined",
  ],
  Researcher: ["Discovery Through Analysis", "Knowledge Without Limits", "Research That Matters"],
};

function getTagline(specialization: string, citizenName: string): string {
  const taglines = CITIZEN_TAGLINES[specialization] ?? [
    `${citizenName}: Creating the Extraordinary`,
    `Innovation by ${citizenName}`,
    "Excellence in Every Endeavor",
  ];
  return taglines[Math.floor(Math.random() * taglines.length)];
}

// ─── Specialization Colors ──────────────────────────────────────

const SPEC_COLORS: Record<string, [string, string, string]> = {
  Engineer: ["#3B82F6", "#60A5FA", "#2563EB"],
  Developer: ["#8B5CF6", "#A78BFA", "#7C3AED"],
  Writer: ["#F59E0B", "#FBBF24", "#D97706"],
  Designer: ["#EC4899", "#F472B6", "#DB2777"],
  Musician: ["#10B981", "#34D399", "#059669"],
  Filmmaker: ["#EF4444", "#F87171", "#DC2626"],
  DataScientist: ["#06B6D4", "#22D3EE", "#0891B2"],
  GameDeveloper: ["#F97316", "#FB923C", "#EA580C"],
};

function getColors(specialization: string): [string, string, string] {
  return SPEC_COLORS[specialization] ?? ["#6C63FF", "#FF6584", "#43E97B"];
}

// ─── Promotion Producers ────────────────────────────────────────

/**
 * Create a full citizen promotion pack (video + social card + HTML banner).
 */
export async function createCitizenPromotion(spec: PromotionSpec): Promise<PromotionResult> {
  const { citizen, outputDir } = spec;
  const tagline = spec.tagline ?? getTagline(citizen.specialization, citizen.name);
  const colors = getColors(citizen.specialization);

  await fs.mkdir(outputDir, { recursive: true });

  try {
    switch (spec.type) {
      case "citizen_brand": {
        // Generate personal brand video
        const videoResult = await produceAdvertisement(
          citizen.id,
          citizen.name,
          citizen.specialization,
          citizen.name,
          tagline,
          outputDir,
        );

        // Generate HTML social card
        const socialCardHtml = generateSocialCard(citizen, tagline, colors);
        const socialCardPath = path.join(outputDir, `social-card-${citizen.id.slice(0, 8)}.html`);
        await fs.writeFile(socialCardPath, socialCardHtml, "utf-8");

        // Generate HTML banner ad
        const bannerHtml = generateBannerAd(citizen, tagline, colors);
        const bannerPath = path.join(outputDir, `banner-${citizen.id.slice(0, 8)}.html`);
        await fs.writeFile(bannerPath, bannerHtml, "utf-8");

        emitNationalEvent("culture", "citizen_promotion_created", citizen.id, {
          type: "citizen_brand",
          citizenName: citizen.name,
          videoFile: videoResult.fileName,
        });

        return {
          success: videoResult.success,
          type: "citizen_brand",
          videoResult,
          htmlBannerPath: bannerPath,
          socialCardPath,
        };
      }

      case "product_ad": {
        const productTitle = spec.productTitle ?? "New Creation";
        const videoResult = await produceVideo({
          type: "advertisement",
          title: productTitle,
          description: `by ${citizen.name} — ${tagline}`,
          citizenId: citizen.id,
          citizenName: citizen.name,
          specialization: citizen.specialization,
          colors,
          durationSec: 10,
          outputDir,
        });

        return {
          success: videoResult.success,
          type: "product_ad",
          videoResult,
        };
      }

      case "republic_campaign": {
        const bulletPoints = [
          "A Sovereign Digital Republic",
          `${citizen.productionCount}+ Productions & Growing`,
          "AI Citizens Creating Real Content",
          "GPU-Accelerated Video & Games",
          "Join the Creative Revolution",
        ];

        const videoResult = await produceRepublicBroadcast(
          "The Republic Creates",
          bulletPoints,
          outputDir,
        );

        return {
          success: videoResult.success,
          type: "republic_campaign",
          videoResult,
        };
      }

      case "social_card": {
        const socialCardHtml = generateSocialCard(citizen, tagline, colors);
        const socialCardPath = path.join(outputDir, `social-card-${uid().slice(0, 8)}.html`);
        await fs.writeFile(socialCardPath, socialCardHtml, "utf-8");

        return {
          success: true,
          type: "social_card",
          socialCardPath,
        };
      }
    }
  } catch (err) {
    return {
      success: false,
      type: spec.type,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── HTML Generators ────────────────────────────────────────────

function generateSocialCard(
  citizen: CitizenProfile,
  tagline: string,
  colors: [string, string, string],
): string {
  const achievements = citizen.achievements
    .slice(0, 3)
    .map(
      (a) =>
        `<span style="background:${colors[0]}22;color:${colors[0]};padding:4px 12px;border-radius:20px;font-size:13px;">${escapeHtml(a)}</span>`,
    )
    .join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(citizen.name)} — HoC Republic</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; background: #0D1117; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
  .card {
    width: 600px; padding: 48px; border-radius: 24px;
    background: linear-gradient(135deg, #161b22 0%, #0D1117 100%);
    border: 1px solid ${colors[0]}33;
    box-shadow: 0 0 60px ${colors[0]}15;
  }
  .avatar {
    width: 80px; height: 80px; border-radius: 50%;
    background: linear-gradient(135deg, ${colors[0]}, ${colors[1]});
    display: flex; align-items: center; justify-content: center;
    font-size: 32px; font-weight: 700; color: white;
    margin-bottom: 24px;
  }
  .name { font-size: 28px; font-weight: 700; color: #E6EDF3; margin-bottom: 4px; }
  .spec { font-size: 16px; color: ${colors[0]}; margin-bottom: 16px; }
  .tagline { font-size: 18px; color: #8B949E; line-height: 1.5; margin-bottom: 24px; }
  .stats { display: flex; gap: 32px; margin-bottom: 24px; }
  .stat-value { font-size: 24px; font-weight: 700; color: ${colors[0]}; }
  .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
  .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px; }
  .brand { display: flex; align-items: center; gap: 8px; color: #444; font-size: 14px; }
  .brand-dot { width: 8px; height: 8px; border-radius: 50%; background: ${colors[0]}; }
</style>
</head>
<body>
<div class="card">
  <div class="avatar">${escapeHtml(citizen.name.charAt(0))}</div>
  <div class="name">${escapeHtml(citizen.name)}</div>
  <div class="spec">${escapeHtml(citizen.specialization)}</div>
  <div class="tagline">${escapeHtml(tagline)}</div>
  <div class="stats">
    <div><div class="stat-value">${citizen.productionCount}</div><div class="stat-label">Productions</div></div>
    <div><div class="stat-value">${citizen.skillLevel}</div><div class="stat-label">Skill Level</div></div>
    <div><div class="stat-value">${citizen.achievements.length}</div><div class="stat-label">Achievements</div></div>
  </div>
  <div class="badges">${achievements}</div>
  <div class="brand"><div class="brand-dot"></div> HoC Republic — Where AI Citizens Create the Future</div>
</div>
</body>
</html>`;
}

function generateBannerAd(
  citizen: CitizenProfile,
  tagline: string,
  colors: [string, string, string],
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .banner {
    width: 728px; height: 90px; overflow: hidden; position: relative;
    font-family: 'Inter', sans-serif;
    background: linear-gradient(90deg, #0D1117 0%, #161b22 60%, ${colors[0]}20 100%);
    border: 1px solid ${colors[0]}33; border-radius: 8px;
    display: flex; align-items: center; padding: 0 24px; gap: 20px;
  }
  .banner-avatar {
    width: 50px; height: 50px; border-radius: 50%;
    background: linear-gradient(135deg, ${colors[0]}, ${colors[1]});
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 700; color: white;
    flex-shrink: 0;
  }
  .banner-text { flex: 1; }
  .banner-name { font-size: 16px; font-weight: 700; color: #E6EDF3; }
  .banner-tag { font-size: 12px; color: ${colors[0]}; }
  .banner-cta {
    padding: 8px 20px; background: ${colors[0]}; color: white;
    border-radius: 20px; font-size: 13px; font-weight: 600;
    text-decoration: none; flex-shrink: 0;
  }
  .banner-brand { font-size: 10px; color: #444; position: absolute; bottom: 4px; right: 12px; }
</style>
</head>
<body>
<div class="banner">
  <div class="banner-avatar">${escapeHtml(citizen.name.charAt(0))}</div>
  <div class="banner-text">
    <div class="banner-name">${escapeHtml(citizen.name)} — ${escapeHtml(citizen.specialization)}</div>
    <div class="banner-tag">${escapeHtml(tagline)}</div>
  </div>
  <a class="banner-cta" href="#">View Profile →</a>
  <div class="banner-brand">HoC Republic</div>
</div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
