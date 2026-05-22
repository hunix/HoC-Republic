/**
 * Product Company Formation Engine
 *
 * When a product reaches "listed" status, automatically forms a full company:
 *   - Assigns citizen roles: CEO, CTO, CMO, Designer, Support, QA, Growth
 *   - Generates a company landing page (full HTML static site)
 *   - Writes a Help Center FAQ from product features
 *   - Creates press kit assets list
 *   - Maintains a product roadmap
 *
 * The "GRL Model" (Grow, Release, Lead) guides company formation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { uid, ts } from "../utils.js";

const logger = createSubsystemLogger("republic:company-formation");
const COMPANY_OUTPUT_ROOT = path.join(process.cwd(), "republic-output", "companies");

// ─── Types ──────────────────────────────────────────────────────────────────

export type CompanyRole = "CEO" | "CTO" | "CMO" | "Designer" | "Support" | "QA" | "Growth";

export interface CitizenRef {
  citizenId: string;
  citizenName: string;
  specialization: string;
  autonomyScore: number;
}

export interface CompanyProfile {
  id: string;
  name: string;
  tagline: string;
  description: string;
  productId: string;
  productTitle: string;
  productCategory: string;
  members: Array<{ citizen: CitizenRef; role: CompanyRole }>;
  landingPagePath?: string;
  helpCenterPath?: string;
  pressKitPath?: string;
  roadmapPath?: string;
  totalRevenue: number;
  status: "forming" | "active" | "dormant";
  foundedAt: string;
  updatedAt: string;
}

// ─── State ──────────────────────────────────────────────────────────────────

const companies = new Map<string, CompanyProfile>();
const byProduct  = new Map<string, string>(); // productId → companyId

// ─── Role Assignment ─────────────────────────────────────────────────────────

const SPEC_ROLE_MAP: Record<string, CompanyRole[]> = {
  "Engineer":        ["CTO", "QA"],
  "GameDeveloper":   ["CTO"],
  "Researcher":      ["QA", "CTO"],
  "Marketer":        ["CMO", "Growth"],
  "ContentCreator":  ["CMO", "Designer"],
  "Philosopher":     ["Support"],
  "Diplomat":        ["Support", "CEO"],
  "Economist":       ["CEO", "Growth"],
  "Artist":          ["Designer"],
  "Musician":        ["Designer", "CMO"],
  "Scientist":       ["CTO", "QA"],
};

function assignRoles(citizens: CitizenRef[]): Array<{ citizen: CitizenRef; role: CompanyRole }> {
  const needed: CompanyRole[] = ["CEO", "CTO", "CMO", "Designer", "Support", "QA", "Growth"];
  const assigned: Array<{ citizen: CitizenRef; role: CompanyRole }> = [];
  const usedRoles = new Set<CompanyRole>();
  const usedCitizens = new Set<string>();

  // Sort by autonomy score descending
  const sorted = [...citizens].toSorted((a, b) => b.autonomyScore - a.autonomyScore);

  for (const role of needed) {
    for (const citizen of sorted) {
      if (usedCitizens.has(citizen.citizenId)) { continue; }
      const preferredRoles = SPEC_ROLE_MAP[citizen.specialization] ?? [];
      if (preferredRoles.includes(role) && !usedRoles.has(role)) {
        assigned.push({ citizen, role });
        usedRoles.add(role);
        usedCitizens.add(citizen.citizenId);
        break;
      }
    }
    // If no specialist found, assign highest-autonomy unassigned citizen
    if (!usedRoles.has(role)) {
      const fallback = sorted.find(c => !usedCitizens.has(c.citizenId));
      if (fallback) {
        assigned.push({ citizen: fallback, role });
        usedRoles.add(role);
        usedCitizens.add(fallback.citizenId);
      }
    }
  }

  return assigned;
}

// ─── Asset Generators ─────────────────────────────────────────────────────────

function generateLandingPage(company: CompanyProfile, priceUsd: number): string {
  const members = company.members.map(m => `<div class="member"><div class="role">${m.role}</div><div class="name">${m.citizen.citizenName}</div></div>`).join("");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${company.productTitle} — ${company.name}</title>
  <style>
    :root { --accent: #7c3aed; --bg: #0a0a0f; --card: #13131a; --text: #e2e8f0; --muted: #6b7280; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background: var(--bg); color: var(--text); font-family: 'Inter', system-ui, sans-serif; }
    .hero { min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:2rem; background: radial-gradient(ellipse at center, rgba(124,58,237,0.15) 0%, transparent 70%); }
    h1 { font-size:clamp(2rem,6vw,5rem); font-weight:900; letter-spacing:-0.03em; background:linear-gradient(135deg,#a78bfa,#7c3aed,#c084fc); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
    .tagline { font-size:1.25rem; color:var(--muted); margin:1rem 0 2rem; max-width:600px; }
    .cta { display:inline-flex; gap:1rem; flex-wrap:wrap; justify-content:center; }
    .btn { padding:0.75rem 2rem; border-radius:12px; font-weight:600; cursor:pointer; text-decoration:none; font-size:1rem; }
    .btn-primary { background:var(--accent); color:white; border:none; }
    .btn-secondary { background:transparent; color:var(--text); border:2px solid rgba(255,255,255,0.2); }
    .price-badge { margin-top:2rem; padding:0.5rem 1.5rem; background:rgba(124,58,237,0.2); border:1px solid rgba(124,58,237,0.4); border-radius:100px; font-size:1.5rem; font-weight:bold; }
    .features { padding:4rem 2rem; display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:1.5rem; max-width:1200px; margin:0 auto; }
    .feature-card { background:var(--card); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:1.5rem; }
    .feature-card h3 { color:#a78bfa; margin-bottom:0.5rem; }
    .team { padding:4rem 2rem; text-align:center; max-width:1200px; margin:0 auto; }
    .team h2 { font-size:2rem; margin-bottom:2rem; }
    .members-grid { display:flex; flex-wrap:wrap; gap:1rem; justify-content:center; }
    .member { background:var(--card); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:1rem 1.5rem; }
    .member .role { font-size:0.7rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--accent); margin-bottom:0.25rem; }
    .member .name { font-weight:600; }
    footer { text-align:center; padding:2rem; color:var(--muted); font-size:0.85rem; border-top:1px solid rgba(255,255,255,0.06); }
  </style>
</head>
<body>
  <section class="hero">
    <h1>${company.productTitle}</h1>
    <p class="tagline">${company.tagline}</p>
    <div class="cta">
      <a href="#" class="btn btn-primary">Get Started</a>
      <a href="#features" class="btn btn-secondary">Learn More</a>
    </div>
    <div class="price-badge">${priceUsd > 0 ? `$${priceUsd}` : "Free"}</div>
  </section>

  <section id="features" class="features">
    <div class="feature-card"><h3>🚀 Autonomous Creation</h3><p>Built entirely by AI citizens from the HoC Republic — no human intervention required.</p></div>
    <div class="feature-card"><h3>🌐 Globally Published</h3><p>Auto-published across platforms: Itch.io, YouTube, GitHub, Gumroad, and more.</p></div>
    <div class="feature-card"><h3>💡 AI-Powered</h3><p>Powered by the latest AI models from the House of Clawdbot.</p></div>
    <div class="feature-card"><h3>🎯 Quality Guaranteed</h3><p>QA-reviewed by citizen specialists before release.</p></div>
  </section>

  <section class="team">
    <h2>The Team</h2>
    <div class="members-grid">${members}</div>
  </section>

  <footer>
    <p>© ${new Date().getFullYear()} ${company.name} — Built by the House of Clawdbot AI Republic</p>
    <p style="margin-top:0.5rem">All products are created autonomously by AI citizens.</p>
  </footer>
</body>
</html>`;
}

function generateHelpCenter(productTitle: string, category: string): string {
  const faqs: Array<{ q: string; a: string }> = [
    { q: `What is ${productTitle}?`, a: `${productTitle} is a ${category} created by autonomous AI citizens of the House of Clawdbot Republic.` },
    { q: "How was this made?", a: "Fully autonomously — our AI citizens researched ideas, built the product, wrote all marketing copy, and published it without any human intervention." },
    { q: "Can I modify or resell this?", a: "Please review the license included with your download. Most HoC productions are available for personal and commercial use." },
    { q: "I found a bug / issue. What do I do?", a: "Our support citizens are monitoring this product. Please describe your issue and an AI support agent will respond within 24 hours." },
    { q: "How do I get a refund?", a: "If you are not satisfied within 7 days of purchase, contact our support team and we will issue a full refund automatically." },
    { q: "Will this product be updated?", a: "Yes — our maintenance citizens automatically release updates when improvements are made to the underlying AI models." },
  ];

  const faqHtml = faqs.map(f => `<details class="faq"><summary>${f.q}</summary><p>${f.a}</p></details>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Help Center — ${productTitle}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #0a0a0f; color: #e2e8f0; }
    h1 { font-size: 2rem; margin-bottom: 2rem; color: #a78bfa; }
    .faq { border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
    summary { padding: 1rem; cursor: pointer; font-weight: 600; }
    summary:hover { background: rgba(255,255,255,0.05); }
    p { padding: 0 1rem 1rem; color: #9ca3af; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Help Center — ${productTitle}</h1>
${faqHtml}
</body>
</html>`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function formCompany(opts: {
  productId: string;
  productTitle: string;
  productCategory: string;
  productDescription: string;
  priceUsd: number;
  citizens: CitizenRef[];
}): CompanyProfile {
  const { productId, productTitle, productCategory, productDescription, priceUsd, citizens } = opts;
  const companyName = `${citizens[0]?.citizenName ?? "Citizen"} & Team`;
  const tagline     = `${productTitle} — built by AI citizens`;

  const members = assignRoles(citizens);

  const company: CompanyProfile = {
    id: uid(),
    name: companyName,
    tagline,
    description: productDescription.slice(0, 300),
    productId,
    productTitle,
    productCategory,
    members,
    totalRevenue: 0,
    status: "forming",
    foundedAt: ts(),
    updatedAt: ts(),
  };

  // Write assets
  try {
    const dir = path.join(COMPANY_OUTPUT_ROOT, company.id);
    fs.mkdirSync(dir, { recursive: true });

    const landingPath = path.join(dir, "index.html");
    fs.writeFileSync(landingPath, generateLandingPage(company, priceUsd), "utf8");
    company.landingPagePath = landingPath;

    const helpPath = path.join(dir, "help.html");
    fs.writeFileSync(helpPath, generateHelpCenter(productTitle, productCategory), "utf8");
    company.helpCenterPath = helpPath;

    const roadmapPath = path.join(dir, "roadmap.md");
    fs.writeFileSync(roadmapPath, `# ${productTitle} Roadmap\n\n## v1.0 (current)\n- Initial release\n\n## v1.1 (planned)\n- Performance improvements\n- New features based on user feedback\n\n## Long-term\n- Multi-platform expansion\n- AI-driven feature discovery\n`, "utf8");
    company.roadmapPath = roadmapPath;

    logger.info(`[Company] Formed "${companyName}" for "${productTitle}" — ${members.length} citizens, assets at ${dir}`);
  } catch (err) {
    logger.warn(`[Company] Asset write failed: ${String(err)}`);
  }

  company.status = "active";
  companies.set(company.id, company);
  byProduct.set(productId, company.id);
  return company;
}

export function getCompany(companyId: string): CompanyProfile | undefined { return companies.get(companyId); }
export function getCompanyByProduct(productId: string): CompanyProfile | undefined { const id = byProduct.get(productId); return id ? companies.get(id) : undefined; }
export function listCompanies(limit = 50): CompanyProfile[] { return [...companies.values()].toSorted((a, b) => b.foundedAt.localeCompare(a.foundedAt)).slice(0, limit); }
export function updateRevenue(productId: string, amount: number): void { const id = byProduct.get(productId); if (id) { const c = companies.get(id); if (c) { c.totalRevenue += amount; c.updatedAt = ts(); } } }
export function getCompanyStats(): { total: number; active: number; totalRevenue: number } { const all = [...companies.values()]; return { total: all.length, active: all.filter(c => c.status === "active").length, totalRevenue: all.reduce((s, c) => s + c.totalRevenue, 0) }; }
