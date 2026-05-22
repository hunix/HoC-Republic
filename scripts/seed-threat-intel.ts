/**
 * Threat Intel Seeder
 *
 * One-shot seeder that populates the threat-intel SQLite store with real,
 * current cybersecurity intelligence from multiple authoritative sources:
 *
 *   1. ArXiv cs.CR       — latest academic exploitation research (abstracts)
 *   2. CISA KEV          — CISA's Known Exploited Vulnerabilities catalog
 *   3. NVD/CVE API       — NIST National Vulnerability Database (CRITICAL CVEs)
 *   4. Exploit-DB RSS    — latest public exploits
 *   5. PacketStorm RSS   — security advisories & PoC code
 *   6. Metasploit        — module index from rapid7/metasploit-framework
 *   7. MITRE ATT&CK      — full tactic/technique knowledge base
 *
 * Run:
 *   node --loader ts-node/esm scripts/seed-threat-intel.mjs
 *   OR: pnpm tsx scripts/seed-threat-intel.ts
 */

import Database from "better-sqlite3";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// ─── DB Setup ────────────────────────────────────────────────────

const DATA_DIR = "./data";
if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR, { recursive: true }); }

const db = new Database(path.join(DATA_DIR, "threat-intel.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS intel_papers (
    id        TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    abstract  TEXT NOT NULL,
    pdf_url   TEXT DEFAULT '',
    timestamp INTEGER NOT NULL,
    keywords  TEXT DEFAULT '',
    source    TEXT DEFAULT 'unknown',
    severity  TEXT DEFAULT 'medium'
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS intel_papers_fts
    USING fts5(title, abstract, keywords, content='intel_papers', content_rowid='rowid');
`);

// Add source/severity columns if they don't exist yet (idempotent migration)
try { db.exec("ALTER TABLE intel_papers ADD COLUMN source TEXT DEFAULT 'unknown'"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE intel_papers ADD COLUMN severity TEXT DEFAULT 'medium'"); } catch { /* already exists */ }

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO intel_papers (id, title, abstract, pdf_url, timestamp, keywords, source, severity)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function store(rec: {
  id: string; title: string; abstract: string;
  pdfUrl?: string; timestamp?: number; keywords?: string;
  source?: string; severity?: string;
}) {
  try {
    insertStmt.run(
      rec.id,
      rec.title.slice(0, 1024),
      rec.abstract.slice(0, 8192),
      rec.pdfUrl ?? "",
      rec.timestamp ?? Date.now(),
      rec.keywords ?? "",
      rec.source ?? "unknown",
      rec.severity ?? "medium",
    );
  } catch { /* ignore duplicates */ }
}

// ─── Helpers ─────────────────────────────────────────────────────

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "HoC-ThreatIntel-Seeder/1.0", "Accept": "*/*" },
  });
  if (!res.ok) { throw new Error(`HTTP ${res.status} for ${url}`); }
  return res.text();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "HoC-ThreatIntel-Seeder/1.0", "Accept": "application/json" },
  });
  if (!res.ok) { throw new Error(`HTTP ${res.status} for ${url}`); }
  return res.json() as Promise<T>;
}

function extractRssItems(xml: string): Array<{ title: string; description: string; link: string; pubDate?: string }> {
  const items: Array<{ title: string; description: string; link: string; pubDate?: string }> = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const body = m[1];
    const title       = (/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/.exec(body) ?? /<title>([\s\S]*?)<\/title>/.exec(body))?.[1]?.trim() ?? "";
    const description = (/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/.exec(body) ?? /<description>([\s\S]*?)<\/description>/.exec(body))?.[1]?.trim() ?? "";
    const link        = /<link>([\s\S]*?)<\/link>/.exec(body)?.[1]?.trim() ?? "";
    const pubDate     = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(body)?.[1]?.trim();
    if (title) { items.push({ title, description, link, pubDate }); }
  }
  return items;
}

// ─── Source 1: ArXiv cs.CR ───────────────────────────────────────

async function seedArxiv() {
  console.log("📄 [1/7] ArXiv cs.CR — fetching 200 latest papers...");
  const url = "https://export.arxiv.org/api/query?search_query=cat:cs.CR&sortBy=submittedDate&sortOrder=desc&max_results=200";
  const xml = await getText(url);
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let count = 0, m: RegExpExecArray | null;
  while ((m = entryRegex.exec(xml)) !== null) {
    const entry = m[1];
    const rawId     = /<id>(.*?)<\/id>/.exec(entry)?.[1]?.trim() ?? "";
    const title     = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1]?.replace(/\n/g, " ").trim() ?? "";
    const abstract  = /<summary>([\s\S]*?)<\/summary>/.exec(entry)?.[1]?.replace(/\n/g, " ").trim() ?? "";
    const published = /<published>(.*?)<\/published>/.exec(entry)?.[1]?.trim() ?? "";
    if (!rawId || !title) { continue; }
    const id = rawId.split("/abs/").pop() ?? rawId;
    const authorRegex = /<author>\s*<name>(.*?)<\/name>\s*<\/author>/g;
    const authors: string[] = [];
    let am: RegExpExecArray | null;
    while ((am = authorRegex.exec(entry)) !== null) { authors.push(am[1].trim()); }
    store({
      id: `arxiv:${id}`,
      title,
      abstract,
      pdfUrl: rawId.replace("/abs/", "/pdf/") + ".pdf",
      timestamp: published ? new Date(published).getTime() : Date.now(),
      keywords: authors.slice(0, 5).join(", "),
      source: "arxiv-cs.CR",
      severity: "medium",
    });
    count++;
  }
  console.log(`   ✓ ${count} ArXiv papers seeded`);
}

// ─── Source 2: CISA Known Exploited Vulnerabilities ──────────────

interface CisaKev {
  vulnerabilities: Array<{
    cveID: string; vendorProject: string; product: string;
    vulnerabilityName: string; dateAdded: string;
    shortDescription: string; requiredAction: string;
    dueDate: string; knownRansomwareCampaignUse?: string;
  }>;
}

async function seedCisaKev() {
  console.log("🛡️  [2/7] CISA KEV — Known Exploited Vulnerabilities catalog...");
  const data = await getJson<CisaKev>(
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
  );
  let count = 0;
  for (const vuln of data.vulnerabilities) {
    const ransomware = vuln.knownRansomwareCampaignUse === "Known" ? " [RANSOMWARE]" : "";
    store({
      id: `cisa-kev:${vuln.cveID}`,
      title: `[CISA KEV] ${vuln.cveID}: ${vuln.vulnerabilityName}${ransomware}`,
      abstract: `${vuln.shortDescription} Affected: ${vuln.vendorProject} ${vuln.product}. Required action: ${vuln.requiredAction}. Due: ${vuln.dueDate}.`,
      pdfUrl: `https://nvd.nist.gov/vuln/detail/${vuln.cveID}`,
      timestamp: new Date(vuln.dateAdded).getTime(),
      keywords: `CVE, CISA, exploit, ${vuln.vendorProject}, ${vuln.product}, known exploited`,
      source: "cisa-kev",
      severity: "critical",
    });
    count++;
  }
  console.log(`   ✓ ${count} CISA KEV entries seeded`);
}

// ─── Source 3: NVD — CRITICAL CVEs (last 120 days) ───────────────

interface NvdResponse {
  vulnerabilities?: Array<{
    cve: {
      id: string; published: string; descriptions: Array<{ lang: string; value: string }>;
      metrics?: { cvssMetricV31?: Array<{ cvssData: { baseScore: number; baseSeverity: string; vectorString: string } }> };
      references?: Array<{ url: string }>;
    };
  }>;
}

async function seedNvd() {
  console.log("🔴 [3/7] NVD — CRITICAL CVEs (last 120 days)...");
  const endDate   = new Date().toISOString().split(".")[0] + ".000";
  const startDate = new Date(Date.now() - 120 * 86400 * 1000).toISOString().split(".")[0] + ".000";
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=CRITICAL&pubStartDate=${startDate}&pubEndDate=${endDate}&resultsPerPage=200`;
  const data = await getJson<NvdResponse>(url);
  let count = 0;
  for (const item of data.vulnerabilities ?? []) {
    const cve = item.cve;
    const desc = cve.descriptions.find(d => d.lang === "en")?.value ?? "";
    const cvss = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
    const score = cvss?.baseScore ?? 0;
    const vector = cvss?.vectorString ?? "";
    store({
      id: `nvd:${cve.id}`,
      title: `[CVE CRITICAL ${score}] ${cve.id}`,
      abstract: `${desc} CVSS Score: ${score}. Vector: ${vector}.`,
      pdfUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      timestamp: new Date(cve.published).getTime(),
      keywords: `CVE, critical, ${cve.id}, CVSS ${score}, vulnerability, exploit`,
      source: "nvd-critical",
      severity: "critical",
    });
    count++;
  }
  console.log(`   ✓ ${count} critical CVEs seeded`);
}

// ─── Source 4: Exploit-DB RSS ────────────────────────────────────

async function seedExploitDb() {
  console.log("💣 [4/7] Exploit-DB — latest public exploits...");
  const xml = await getText("https://www.exploit-db.com/rss.xml");
  const items = extractRssItems(xml);
  let count = 0;
  for (const item of items) {
    const id = item.link.split("/").filter(Boolean).pop() ?? `edb-${Date.now()}-${count}`;
    store({
      id: `edb:${id}`,
      title: `[Exploit-DB] ${item.title}`,
      abstract: item.description.replace(/<[^>]+>/g, "").trim() || item.title,
      pdfUrl: item.link,
      timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      keywords: "exploit, public exploit, proof of concept, PoC, exploit-db",
      source: "exploit-db",
      severity: "high",
    });
    count++;
  }
  console.log(`   ✓ ${count} Exploit-DB entries seeded`);
}

// ─── Source 5: PacketStorm Security RSS ──────────────────────────

async function seedPacketStorm() {
  console.log("📡 [5/7] PacketStorm Security — advisories & PoC...");
  const xml = await getText("https://packetstormsecurity.com/feeds/news.xml");
  const items = extractRssItems(xml);
  let count = 0;
  for (const item of items) {
    const slug = item.link.replace(/\/$/, "").split("/").pop() ?? `ps-${count}`;
    store({
      id: `packetstorm:${slug}`,
      title: `[PacketStorm] ${item.title}`,
      abstract: item.description.replace(/<[^>]+>/g, "").trim() || item.title,
      pdfUrl: item.link,
      timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      keywords: "advisory, PoC, exploit, security, packetstorm",
      source: "packetstorm",
      severity: "high",
    });
    count++;
  }
  console.log(`   ✓ ${count} PacketStorm entries seeded`);
}

// ─── Source 6: Metasploit Module Index ───────────────────────────

interface MsfModule {
  name: string; title: string; description: string;
  module_type: string; rank?: string; platform?: string[];
  targets?: string[];
}

async function seedMetasploit() {
  console.log("🎯 [6/7] Metasploit — module knowledge base...");
  // Use the public Metasploit data API (aggregated)
  const url = "https://raw.githubusercontent.com/rapid7/metasploit-framework/master/db/modules_metadata_base.json";
  const raw = await getText(url);
  const modules: Record<string, MsfModule> = JSON.parse(raw);
  let count = 0;
  for (const [modPath, mod] of Object.entries(modules)) {
    if (mod.module_type !== "exploit" && mod.module_type !== "auxiliary") { continue; }
    const platforms = (mod.platform ?? []).join(", ");
    const targets   = (mod.targets ?? []).slice(0, 5).join(", ");
    store({
      id: `msf:${modPath.replace(/\//g, ":")}`,
      title: `[Metasploit ${mod.module_type.toUpperCase()}] ${mod.title || mod.name}`,
      abstract: `${mod.description} Platforms: ${platforms}. Targets: ${targets}. Module: ${modPath}`,
      pdfUrl: `https://github.com/rapid7/metasploit-framework/blob/master/modules/${modPath}.rb`,
      timestamp: Date.now(),
      keywords: `metasploit, exploit, ${mod.module_type}, ${platforms}, framework, PoC, ${mod.rank ?? "normal"}`,
      source: "metasploit",
      severity: mod.rank === "excellent" || mod.rank === "great" ? "critical" : "high",
    });
    count++;
    if (count >= 2000) { break; } // top 2000 exploit/auxiliary modules
  }
  console.log(`   ✓ ${count} Metasploit modules seeded`);
}

// ─── Source 7: MITRE ATT&CK Enterprise ──────────────────────────

interface AttackObject {
  type: string; id: string;
  name?: string; description?: string;
  "external_references"?: Array<{ source_name: string; external_id?: string; url?: string }>;
  "kill_chain_phases"?: Array<{ phase_name: string }>;
  "x_mitre_platforms"?: string[];
  "x_mitre_detection"?: string;
}

interface AttackBundle {
  objects: AttackObject[];
}

async function seedMitreAttack() {
  console.log("🧠 [7/7] MITRE ATT&CK Enterprise — full technique knowledge base...");
  const url = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json";
  const raw  = await getText(url);
  const bundle: AttackBundle = JSON.parse(raw);
  let count = 0;
  for (const obj of bundle.objects) {
    if (obj.type !== "attack-pattern" || !obj.name || !obj.description) { continue; }
    const extRef  = obj.external_references?.find(r => r.source_name === "mitre-attack");
    const attackId = extRef?.external_id ?? obj.id;
    const url_ref  = extRef?.url ?? "";
    const tactics   = (obj.kill_chain_phases ?? []).map(k => k.phase_name).join(", ");
    const platforms  = (obj["x_mitre_platforms"] ?? []).join(", ");
    const detection  = obj["x_mitre_detection"] ?? "";
    store({
      id: `mitre:${attackId}`,
      title: `[ATT&CK ${attackId}] ${obj.name}`,
      abstract: `${obj.description.slice(0, 3000)} Tactics: ${tactics}. Platforms: ${platforms}. Detection: ${detection.slice(0, 500)}`,
      pdfUrl: url_ref,
      timestamp: Date.now(),
      keywords: `MITRE ATT&CK, ${obj.name}, ${tactics}, ${platforms}, TTP, adversary technique, threat model`,
      source: "mitre-attack",
      severity: "high",
    });
    count++;
  }
  console.log(`   ✓ ${count} MITRE ATT&CK techniques seeded`);
}

// ─── Runner ─────────────────────────────────────────────────────

async function run() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║  HoC Threat Intelligence — Multi-Source Seeder v1.0  ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const results: { source: string; status: string }[] = [];

  const sources = [
    { name: "ArXiv cs.CR",     fn: seedArxiv },
    { name: "CISA KEV",        fn: seedCisaKev },
    { name: "NVD Critical",    fn: seedNvd },
    { name: "Exploit-DB",      fn: seedExploitDb },
    { name: "PacketStorm",     fn: seedPacketStorm },
    { name: "Metasploit",      fn: seedMetasploit },
    { name: "MITRE ATT&CK",   fn: seedMitreAttack },
  ];

  for (const src of sources) {
    try {
      await src.fn();
      results.push({ source: src.name, status: "✓ OK" });
    } catch (err) {
      console.error(`   ✗ ${src.name} failed:`, err instanceof Error ? err.message : err);
      results.push({ source: src.name, status: `✗ ${err instanceof Error ? err.message : "error"}` });
    }
    // Polite delay between sources to avoid rate-limiting
    await new Promise(r => setTimeout(r, 800));
  }

  // Rebuild FTS index
  console.log("\n🔄 Rebuilding FTS index...");
  try {
    db.exec("INSERT INTO intel_papers_fts(intel_papers_fts) VALUES('rebuild')");
    console.log("   ✓ FTS index rebuilt");
  } catch { /* may already be populated */ }

  // Final stats
  const total = (db.prepare("SELECT COUNT(*) as n FROM intel_papers").get() as { n: number }).n;
  console.log(`\n╔═══════════════════════════════════════════╗`);
  console.log(`║  Seeding Complete — ${String(total).padEnd(6)} records total  ║`);
  console.log(`╚═══════════════════════════════════════════╝`);
  console.log("\nSource breakdown:");
  for (const r of results) {
    console.log(`  ${r.status.padEnd(6)} ${r.source}`);
  }

  // Per-source count
  const bySource = db.prepare("SELECT source, COUNT(*) as n FROM intel_papers GROUP BY source ORDER BY n DESC").all() as { source: string; n: number }[];
  console.log("\nRecords by source:");
  for (const row of bySource) {
    console.log(`  ${String(row.n).padStart(5)}  ${row.source}`);
  }

  db.close();
  console.log("\n✅ Threat-intel DB ready at ./data/threat-intel.sqlite\n");
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
