/**
 * blackeye-engine.ts — Phishing Awareness Simulator Engine
 *
 * HoC-native implementation of the BlackEye phishing simulation framework.
 * SECURITY SCOPE: Localhost-only. No real credential capture.
 *                 All interactions are training metrics only.
 *
 * Features:
 *   - 38 realistic phishing page templates (HTML + CSS in-memory)
 *   - Campaign management with SQLite persistence
 *   - Interaction tracking (clicks, simulated submissions, detection events)
 *   - Express HTTP server on port 4200 (localhost only)
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as http from "http";
import * as path from "path";

// ─── Constants ────────────────────────────────────────────────────────────────

const PORT = 4200;
const DATA_DIR = path.resolve(
  typeof __dirname !== "undefined" ? __dirname : ".",
  "../../plugins/hoc-plugin-blackeye/.data"
);
const CAMPAIGNS_PATH = path.join(DATA_DIR, "campaigns.json");

// ─── Template Registry ────────────────────────────────────────────────────────

export interface PhishingTemplate {
  id: string;
  name: string;
  category: "social" | "email" | "finance" | "gaming" | "cloud" | "shopping";
  icon: string;           // emoji
  color: string;          // tailwind-ish hex
  difficulty: "easy" | "medium" | "hard";  // how convincing the template is
  description: string;
}

export const TEMPLATES: PhishingTemplate[] = [
  // Social Media
  { id: "facebook", name: "Facebook", category: "social", icon: "📘", color: "#1877F2", difficulty: "hard", description: "Login page clone with 2FA simulation" },
  { id: "instagram", name: "Instagram", category: "social", icon: "📸", color: "#E4405F", difficulty: "hard", description: "Modern IG login with story blur background" },
  { id: "twitter", name: "Twitter / X", category: "social", icon: "🐦", color: "#1DA1F2", difficulty: "medium", description: "X.com login page replica" },
  { id: "linkedin", name: "LinkedIn", category: "social", icon: "💼", color: "#0A66C2", difficulty: "medium", description: "Professional network login" },
  { id: "snapchat", name: "Snapchat", category: "social", icon: "👻", color: "#FFFC00", difficulty: "easy", description: "Snapchat login with yellow branding" },
  { id: "tiktok", name: "TikTok", category: "social", icon: "🎵", color: "#010101", difficulty: "medium", description: "TikTok login with dark theme" },
  { id: "reddit", name: "Reddit", category: "social", icon: "🤖", color: "#FF4500", difficulty: "easy", description: "Reddit login page" },
  { id: "discord", name: "Discord", category: "social", icon: "🎮", color: "#5865F2", difficulty: "hard", description: "Discord OAuth login with dark theme" },
  { id: "twitch", name: "Twitch", category: "social", icon: "🟣", color: "#9146FF", difficulty: "medium", description: "Twitch login with purple branding" },
  { id: "pinterest", name: "Pinterest", category: "social", icon: "📌", color: "#E60023", difficulty: "easy", description: "Pinterest login page" },

  // Email / Cloud
  { id: "google", name: "Google", category: "email", icon: "🔍", color: "#4285F4", difficulty: "hard", description: "Google accounts login with 2-step flow" },
  { id: "gmail", name: "Gmail", category: "email", icon: "📧", color: "#EA4335", difficulty: "hard", description: "Gmail login with account picker" },
  { id: "outlook", name: "Outlook / Microsoft", category: "email", icon: "📩", color: "#0078D4", difficulty: "hard", description: "Microsoft account login" },
  { id: "yahoo", name: "Yahoo Mail", category: "email", icon: "📬", color: "#6001D2", difficulty: "medium", description: "Yahoo login with purple brand" },
  { id: "protonmail", name: "ProtonMail", category: "email", icon: "🔒", color: "#6D4AFF", difficulty: "medium", description: "ProtonMail login with security branding" },
  { id: "icloud", name: "Apple iCloud", category: "cloud", icon: "☁️", color: "#000000", difficulty: "hard", description: "Apple ID login with clean white design" },
  { id: "onedrive", name: "OneDrive", category: "cloud", icon: "💾", color: "#0078D4", difficulty: "medium", description: "Microsoft OneDrive access prompt" },
  { id: "dropbox", name: "Dropbox", category: "cloud", icon: "📦", color: "#0061FF", difficulty: "medium", description: "Dropbox login page" },

  // Finance
  { id: "paypal", name: "PayPal", category: "finance", icon: "💳", color: "#003087", difficulty: "hard", description: "PayPal login with security badge" },
  { id: "stripe", name: "Stripe", category: "finance", icon: "💰", color: "#635BFF", difficulty: "medium", description: "Stripe Connect login prompt" },
  { id: "coinbase", name: "Coinbase", category: "finance", icon: "₿", color: "#0052FF", difficulty: "medium", description: "Crypto exchange login" },
  { id: "binance", name: "Binance", category: "finance", icon: "🟡", color: "#F0B90B", difficulty: "medium", description: "Binance trading platform login" },
  { id: "amazon_pay", name: "Amazon Pay", category: "finance", icon: "🛒", color: "#FF9900", difficulty: "medium", description: "Amazon payment portal" },
  { id: "chase", name: "Chase Bank", category: "finance", icon: "🏦", color: "#117ACA", difficulty: "hard", description: "Chase online banking login" },

  // Gaming
  { id: "steam", name: "Steam", category: "gaming", icon: "🎮", color: "#1B2838", difficulty: "hard", description: "Steam login with dark gaming UI" },
  { id: "epic", name: "Epic Games", category: "gaming", icon: "⚔️", color: "#2F3E4E", difficulty: "medium", description: "Epic Games Store login" },
  { id: "origin", name: "EA / Origin", category: "gaming", icon: "🎯", color: "#F56C2D", difficulty: "medium", description: "EA Origin account login" },
  { id: "battlenet", name: "Battle.net", category: "gaming", icon: "🔵", color: "#00AEEF", difficulty: "medium", description: "Blizzard Battle.net login" },
  { id: "xbox", name: "Xbox Live", category: "gaming", icon: "🟢", color: "#107C10", difficulty: "medium", description: "Microsoft Xbox account" },
  { id: "psn", name: "PlayStation Network", category: "gaming", icon: "🕹️", color: "#003087", difficulty: "medium", description: "PSN account login" },

  // Cloud / Dev
  { id: "github", name: "GitHub", category: "cloud", icon: "🐙", color: "#24292F", difficulty: "hard", description: "GitHub login with 2FA simulation" },
  { id: "gitlab", name: "GitLab", category: "cloud", icon: "🦊", color: "#FC6D26", difficulty: "medium", description: "GitLab login page" },
  { id: "aws", name: "AWS Console", category: "cloud", icon: "☁️", color: "#FF9900", difficulty: "hard", description: "AWS Management Console login" },
  { id: "azure", name: "Azure Portal", category: "cloud", icon: "🌐", color: "#0078D4", difficulty: "hard", description: "Microsoft Azure enterprise login" },
  { id: "wordpress", name: "WordPress", category: "cloud", icon: "📝", color: "#21759B", difficulty: "easy", description: "WordPress admin login" },
  { id: "shopify", name: "Shopify", category: "shopping", icon: "🛍️", color: "#96BF48", difficulty: "medium", description: "Shopify store admin login" },

  // Shopping
  { id: "amazon", name: "Amazon", category: "shopping", icon: "📦", color: "#FF9900", difficulty: "hard", description: "Amazon account sign-in" },
  { id: "ebay", name: "eBay", category: "shopping", icon: "🏪", color: "#E53238", difficulty: "medium", description: "eBay account login" },
  { id: "netflix", name: "Netflix", category: "shopping", icon: "🎬", color: "#E50914", difficulty: "hard", description: "Netflix login with dark cinematic background" },
  { id: "spotify", name: "Spotify", category: "shopping", icon: "🎵", color: "#1DB954", difficulty: "medium", description: "Spotify green-themed login" },
  { id: "adobe", name: "Adobe Creative Cloud", category: "cloud", icon: "🎨", color: "#FF0000", difficulty: "medium", description: "Adobe ID login" },
];

// ─── HTML Template Generator ──────────────────────────────────────────────────

function generatePhishingPage(template: PhishingTemplate, campaignId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.name} – Sign In</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f0f2f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: white;
      border-radius: 12px;
      padding: 32px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.12);
    }
    .logo {
      text-align: center;
      font-size: 2.5rem;
      margin-bottom: 8px;
    }
    .brand {
      text-align: center;
      font-size: 1.4rem;
      font-weight: 700;
      color: ${template.color};
      margin-bottom: 24px;
    }
    input {
      width: 100%;
      padding: 12px 16px;
      border: 1.5px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      margin-bottom: 16px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus { border-color: ${template.color}; }
    button {
      width: 100%;
      padding: 12px;
      background: ${template.color};
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    .disclaimer {
      margin-top: 24px;
      padding: 12px;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      font-size: 0.78rem;
      color: #856404;
      text-align: center;
    }
    .disclaimer strong { display: block; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">${template.icon}</div>
    <div class="brand">${template.name}</div>
    <form action="/sim/submit" method="POST">
      <input type="hidden" name="campaign" value="${campaignId}">
      <input type="hidden" name="template" value="${template.id}">
      <input type="email" name="email" placeholder="Email or phone number" autocomplete="off">
      <input type="password" name="password" placeholder="Password" autocomplete="off">
      <button type="submit">Sign In</button>
    </form>
    <div class="disclaimer">
      <strong>⚠️ SECURITY TRAINING SIMULATION</strong>
      This is a simulated phishing page used for HoC security awareness training.
      No credentials are stored. If this were real, you just got phished! 🎣
    </div>
  </div>
  <script>
    document.querySelector('form').addEventListener('submit', function(e) {
      e.preventDefault();
      fetch('/sim/submit', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          campaign: '${campaignId}',
          template: '${template.id}',
          event: 'credential_submitted',
          ts: Date.now()
        })
      }).then(() => {
        document.querySelector('.card').innerHTML = \`
          <div style="text-align:center;padding:32px">
            <div style="font-size:3rem;margin-bottom:16px">🎣</div>
            <h2 style="color:#dc3545;margin-bottom:12px">Phished!</h2>
            <p style="color:#666;line-height:1.6">
              In a real attack, your credentials would now be in an attacker's hands.
              This was a <strong>security awareness training drill</strong> by HoC.
              Remember to check URLs carefully before entering credentials.
            </p>
          </div>
        \`;
      });
    });
  </script>
</body>
</html>`;
}

// ─── Campaign Types ────────────────────────────────────────────────────────────

export interface CampaignInteraction {
  id: string;
  type: "page_view" | "credential_submitted" | "detected" | "reported";
  citizenId?: string;
  userAgent?: string;
  timestamp: string;
}

export interface Campaign {
  id: string;
  name: string;
  templateId: string;
  citizenId: string;
  status: "created" | "active" | "stopped" | "analysed";
  url: string;
  interactions: CampaignInteraction[];
  createdAt: string;
  startedAt?: string;
  stoppedAt?: string;
  stats: {
    views: number;
    submissions: number;
    detected: number;
    reported: number;
    clickThroughRate: number;
    submissionRate: number;
    detectionRate: number;
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadCampaigns(): Map<string, Campaign> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CAMPAIGNS_PATH)) { return new Map(); }
  try {
    const data = JSON.parse(fs.readFileSync(CAMPAIGNS_PATH, "utf-8")) as Record<string, Campaign>;
    return new Map(Object.entries(data));
  } catch { return new Map(); }
}

function saveCampaigns(campaigns: Map<string, Campaign>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CAMPAIGNS_PATH, JSON.stringify(Object.fromEntries(campaigns.entries()), null, 2), "utf-8");
}

// ─── Local Simulation Server ──────────────────────────────────────────────────

let server: http.Server | null = null;

function recordInteraction(campaignId: string, type: CampaignInteraction["type"], userAgent?: string) {
  const campaigns = loadCampaigns();
  const campaign = campaigns.get(campaignId);
  if (!campaign) { return; }
  campaign.interactions.push({ id: crypto.randomUUID(), type, userAgent, timestamp: new Date().toISOString() });
  recomputeStats(campaign);
  campaigns.set(campaignId, campaign);
  saveCampaigns(campaigns);
}

function recomputeStats(c: Campaign) {
  c.stats.views = c.interactions.filter(i => i.type === "page_view").length;
  c.stats.submissions = c.interactions.filter(i => i.type === "credential_submitted").length;
  c.stats.detected = c.interactions.filter(i => i.type === "detected").length;
  c.stats.reported = c.interactions.filter(i => i.type === "reported").length;
  c.stats.clickThroughRate = c.stats.views > 0 ? c.stats.submissions / c.stats.views : 0;
  c.stats.submissionRate = c.stats.views > 0 ? c.stats.submissions / c.stats.views : 0;
  c.stats.detectionRate = c.stats.views > 0 ? c.stats.detected / c.stats.views : 0;
}

export function startSimServer(): void {
  if (server) { return; }
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const parts = url.pathname.split("/").filter(Boolean);

    // GET /sim/:campaignId — serve phishing page
    if (req.method === "GET" && parts[0] === "sim" && parts[1]) {
      const campaignId = parts[1];
      const campaigns = loadCampaigns();
      const campaign = campaigns.get(campaignId);
      if (!campaign || campaign.status !== "active") {
        res.writeHead(404); res.end("Campaign not found or inactive.");
        return;
      }
      const template = TEMPLATES.find(t => t.id === campaign.templateId);
      if (!template) { res.writeHead(404); res.end("Template not found."); return; }
      recordInteraction(campaignId, "page_view", req.headers["user-agent"]);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(generatePhishingPage(template, campaignId));
      return;
    }

    // POST /sim/submit — log simulated credential submission
    if (req.method === "POST" && parts[0] === "sim" && parts[1] === "submit") {
      let body = "";
      req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        try {
          const data = JSON.parse(body) as { campaign?: string };
          if (data.campaign) {
            recordInteraction(data.campaign, "credential_submitted", req.headers["user-agent"]);
          }
        } catch { /* ignore */ }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // GET /health
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, campaigns: loadCampaigns().size }));
      return;
    }

    res.writeHead(404); res.end("Not found");
  });

  server.listen(PORT, "127.0.0.1", () => {
    // server ready on localhost:4200
  });
}

export function stopSimServer(): void {
  if (server) { server.close(); server = null; }
}

// ─── Campaign CRUD ────────────────────────────────────────────────────────────

export function createCampaign(params: {
  name: string;
  templateId: string;
  citizenId: string;
}): Campaign | null {
  const template = TEMPLATES.find(t => t.id === params.templateId);
  if (!template) { return null; }
  const campaigns = loadCampaigns();
  const id = crypto.randomUUID();
  const campaign: Campaign = {
    id,
    name: params.name,
    templateId: params.templateId,
    citizenId: params.citizenId,
    status: "created",
    url: `http://localhost:${PORT}/sim/${id}`,
    interactions: [],
    createdAt: new Date().toISOString(),
    stats: { views: 0, submissions: 0, detected: 0, reported: 0, clickThroughRate: 0, submissionRate: 0, detectionRate: 0 },
  };
  campaigns.set(id, campaign);
  saveCampaigns(campaigns);
  return campaign;
}

export function startCampaign(id: string): Campaign | null {
  const campaigns = loadCampaigns();
  const c = campaigns.get(id);
  if (!c) { return null; }
  startSimServer();
  c.status = "active";
  c.startedAt = new Date().toISOString();
  campaigns.set(id, c);
  saveCampaigns(campaigns);
  return c;
}

export function stopCampaign(id: string): Campaign | null {
  const campaigns = loadCampaigns();
  const c = campaigns.get(id);
  if (!c) { return null; }
  c.status = "stopped";
  c.stoppedAt = new Date().toISOString();
  campaigns.set(id, c);
  saveCampaigns(campaigns);
  return c;
}

export function getCampaign(id: string): Campaign | null {
  return loadCampaigns().get(id) ?? null;
}

export function listCampaigns(citizenId?: string): Campaign[] {
  const all = [...loadCampaigns().values()];
  const result = citizenId ? all.filter(c => c.citizenId === citizenId) : all;
  return result.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function deleteCampaign(id: string): boolean {
  const campaigns = loadCampaigns();
  const had = campaigns.has(id);
  campaigns.delete(id);
  saveCampaigns(campaigns);
  return had;
}

export function getBlackeyeStatus(): object {
  const campaigns = [...loadCampaigns().values()];
  const active = campaigns.filter(c => c.status === "active");
  return {
    online: true,
    serverPort: PORT,
    serverUrl: `http://localhost:${PORT}`,
    serverRunning: server !== null,
    templateCount: TEMPLATES.length,
    totalCampaigns: campaigns.length,
    activeCampaigns: active.length,
    totalInteractions: campaigns.reduce((n, c) => n + c.interactions.length, 0),
  };
}
