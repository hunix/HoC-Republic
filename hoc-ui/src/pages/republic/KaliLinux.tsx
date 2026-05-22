/**
 * Kali Linux — Cybersecurity Command Center
 *
 * Full penetration testing control center with:
 * - Container lifecycle (start/stop/destroy) + resource metrics
 * - Chat interface to dedicated cybersecurity orchestrator
 * - Tool catalog with descriptions and usage
 * - Scan history and report viewer
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useRpc, rpc, mutateRpc } from "@/lib/rpc";
import {
  Shield,
  Play,
  Square,
  Send,
  RefreshCw,
  Clock,
  Cpu,
  Activity,
  MemoryStick,
  Target,
  Search,
  FileText,
  Terminal,
  Crosshair,
  Globe,
  Lock,
  Radar,
  Eye,
  Zap,
  Bug,
  Network,
  Key,
  Scan,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  Bot,
  User,
  Loader2,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  StatCard,
  Tabs,
  RpcStatus,
  EmptyState,
  ConfirmDialog,
  ProgressBar,
} from "@/components/ui";

// ─── Types ──────────────────────────────────────────────────────

interface KaliStatus {
  containerRunning: boolean;
  activeScans: number;
  completedScans: number;
  apiUrl?: string;
}

interface ScanResult {
  id: string;
  target: string;
  scanType: string;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: number;
  completedAt?: number;
  findings: Finding[];
  summary?: {
    riskLevel: string;
    totalFindings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    topRisks: string[];
    recommendations: string[];
  };
}

interface Finding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  remediation: string;
  cvss?: number;
  cve?: string;
  tool: string;
  phase: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolUsed?: string;
}

// ─── Tool Catalog Data ──────────────────────────────────────────

interface ToolDef {
  name: string;
  command: string;
  description: string;
  category: string;
  icon: React.ReactNode;
  usage: string;
  flags?: string[];
}

const TOOL_CATALOG: ToolDef[] = [
  // Phase 1: Reconnaissance
  { name: "Nmap Port Scanner", command: "nmap", description: "Network exploration and security auditing. TCP/UDP port scanning with service detection, OS fingerprinting, and NSE scripts.", category: "Reconnaissance", icon: <Radar size={16} />, usage: "nmap -sV -sC -p 1-1000 <target>", flags: ["-sS (SYN scan)", "-sV (version)", "-sC (scripts)", "-O (OS detect)", "-A (aggressive)"] },
  { name: "Masscan", command: "masscan", description: "TCP port scanner that can scan the entire internet in 5 minutes. 25 million packets per second.", category: "Reconnaissance", icon: <Zap size={16} />, usage: "masscan <target> -p1-65535 --rate=1000" },
  { name: "WHOIS", command: "whois", description: "Domain registration lookup — registrar, nameservers, creation date, expiry.", category: "Reconnaissance", icon: <Info size={16} />, usage: "whois <domain>" },
  { name: "DNSRecon", command: "dnsrecon", description: "DNS enumeration — zone transfers, brute-force subdomains, SRV records, reverse lookups.", category: "Reconnaissance", icon: <Globe size={16} />, usage: "dnsrecon -d <domain> -t std,brt" },
  { name: "Amass", command: "amass", description: "In-depth attack surface mapping and external asset discovery using OSINT.", category: "Reconnaissance", icon: <Network size={16} />, usage: "amass enum -d <domain>" },
  { name: "theHarvester", command: "theHarvester", description: "Gather emails, subdomains, hosts, URLs from public sources (Google, Bing, LinkedIn, Shodan).", category: "Reconnaissance", icon: <Search size={16} />, usage: "theHarvester -d <domain> -l 200 -b all" },
  { name: "SSLyze", command: "sslyze", description: "TLS/SSL configuration analyzer — cipher suites, certificate validity, protocol support, vulnerabilities.", category: "Reconnaissance", icon: <Lock size={16} />, usage: "sslyze --regular <host:port>" },
  { name: "testssl.sh", command: "testssl.sh", description: "Comprehensive TLS/SSL testing — checks for all known vulnerabilities (BEAST, POODLE, Heartbleed, etc.).", category: "Reconnaissance", icon: <Shield size={16} />, usage: "testssl.sh <host:port>" },

  // Phase 2: Web Application Testing
  { name: "Nikto", command: "nikto", description: "Web server scanner — checks for dangerous files, outdated software, misconfigurations, 6700+ checks.", category: "Web Testing", icon: <Bug size={16} />, usage: "nikto -h <url>", flags: ["-Tuning x6", "-Format htm", "-output report.html"] },
  { name: "Gobuster", command: "gobuster", description: "Directory/file brute forcing. Discovers hidden paths, files, and virtual hosts.", category: "Web Testing", icon: <Search size={16} />, usage: "gobuster dir -u <url> -w /usr/share/wordlists/dirb/common.txt", flags: ["-t 20 (threads)", "-x php,html,txt (extensions)", "-s 200,301 (status codes)"] },
  { name: "SQLMap", command: "sqlmap", description: "Automatic SQL injection detection and exploitation. Supports MySQL, PostgreSQL, Oracle, MSSQL, SQLite.", category: "Web Testing", icon: <Terminal size={16} />, usage: "sqlmap -u '<url>?id=1' --batch --level=2", flags: ["--dbs (databases)", "--tables", "--dump", "--os-shell"] },
  { name: "WPScan", command: "wpscan", description: "WordPress vulnerability scanner — plugins, themes, users, and core version checks.", category: "Web Testing", icon: <Globe size={16} />, usage: "wpscan --url <url> --enumerate vp,vt,u" },
  { name: "wafw00f", command: "wafw00f", description: "Web Application Firewall detection — identifies WAF vendor and type.", category: "Web Testing", icon: <Shield size={16} />, usage: "wafw00f <url>" },
  { name: "FFUF", command: "ffuf", description: "Fast web fuzzer written in Go. Directory, parameter, and virtual host fuzzing.", category: "Web Testing", icon: <Crosshair size={16} />, usage: "ffuf -u <url>/FUZZ -w wordlist.txt -mc 200,301" },
  { name: "WhatWeb", command: "whatweb", description: "Next generation web scanner. Identifies CMS, frameworks, blogs, analytics, JavaScript libraries.", category: "Web Testing", icon: <Eye size={16} />, usage: "whatweb -a 3 <url>" },

  // Phase 3: Exploitation
  { name: "Metasploit", command: "msfconsole", description: "The world's most used penetration testing framework. 2000+ exploits, 500+ payloads.", category: "Exploitation", icon: <Target size={16} />, usage: "msfconsole -x 'use exploit/...; set RHOSTS <target>; run'", flags: ["search <term>", "use <module>", "show options", "exploit"] },
  { name: "SearchSploit", command: "searchsploit", description: "Command-line search for Exploit-DB — offline archive of public exploits and PoCs.", category: "Exploitation", icon: <FileText size={16} />, usage: "searchsploit <service> [version]" },
  { name: "Hydra", command: "hydra", description: "Network logon cracker — brute force for SSH, FTP, HTTP, RDP, SMB, MySQL, and 50+ protocols.", category: "Exploitation", icon: <Key size={16} />, usage: "hydra -l admin -P wordlist.txt <target> ssh", flags: ["-t 4 (threads)", "-f (stop on first)", "-s <port>"] },
  { name: "John the Ripper", command: "john", description: "Password cracker — supports 200+ hash types including Unix, Windows, Kerberos, ZIP, PDF.", category: "Exploitation", icon: <Lock size={16} />, usage: "john --wordlist=rockyou.txt hashes.txt" },
  { name: "Hashcat", command: "hashcat", description: "Advanced GPU-based password recovery — world's fastest password cracker.", category: "Exploitation", icon: <Cpu size={16} />, usage: "hashcat -m 0 -a 0 hashes.txt wordlist.txt" },
  { name: "Nmap Vuln Scripts", command: "nmap --script vuln", description: "Run all NSE vulnerability detection scripts against a target.", category: "Exploitation", icon: <AlertTriangle size={16} />, usage: "nmap --script vuln -p 1-1000 <target>" },

  // Phase 4: Network
  { name: "Tcpdump", command: "tcpdump", description: "Command-line packet analyzer. Capture and filter network traffic.", category: "Network Analysis", icon: <Activity size={16} />, usage: "tcpdump -i any host <target> -c 100 -nn" },
  { name: "Tshark", command: "tshark", description: "Terminal-based Wireshark. Deep packet inspection with display filters.", category: "Network Analysis", icon: <Network size={16} />, usage: "tshark -i any -f 'host <target>' -c 100" },
  { name: "ARP-Scan", command: "arp-scan", description: "Layer 2 network scanner. Discover all hosts on a local network segment.", category: "Network Analysis", icon: <Scan size={16} />, usage: "arp-scan --localnet" },
  { name: "Hping3", command: "hping3", description: "TCP/IP packet assembler/analyzer. Firewall testing, port scanning, network testing.", category: "Network Analysis", icon: <Zap size={16} />, usage: "hping3 -S <target> -p 80 -c 5" },

  // Phase 5: Forensics & Compliance
  { name: "Lynis", command: "lynis", description: "Security auditing tool for Unix systems. CIS benchmark compliance checks.", category: "Compliance", icon: <CheckCircle2 size={16} />, usage: "lynis audit system --quick" },
  { name: "Binwalk", command: "binwalk", description: "Firmware analysis tool — extract embedded files, file system images, compressed data.", category: "Forensics", icon: <FileText size={16} />, usage: "binwalk <firmware.bin>" },
  { name: "ExifTool", command: "exiftool", description: "Read/write metadata in images, documents, and files. Detect EXIF GPS, camera data, timestamps.", category: "Forensics", icon: <Eye size={16} />, usage: "exiftool <file>" },
  { name: "Foremost", command: "foremost", description: "File carving tool — recover deleted files from disk images.", category: "Forensics", icon: <Search size={16} />, usage: "foremost -i image.dd -o output/" },
  { name: "Steghide", command: "steghide", description: "Steganography tool — hide and extract data in JPEG, BMP, WAV, AU files.", category: "Forensics", icon: <Lock size={16} />, usage: "steghide extract -sf image.jpg" },
  { name: "Enum4linux", command: "enum4linux", description: "Windows/Samba enumeration — users, shares, groups, password policies, OS info.", category: "Exploitation", icon: <Network size={16} />, usage: "enum4linux -a <target>" },

  // Phase 6: Web Scraping & Cloning
  { name: "HTTrack", command: "httrack", description: "Website mirroring — creates full offline copies with HTML, CSS, JS, images, fonts. Timestamped snapshots for forensic analysis.", category: "Web Scraping", icon: <Globe size={16} />, usage: "httrack \"https://target.com\" -O /evidence/web-clones/ -r3", flags: ["-r<N> (depth)", "-s0 (no robots.txt)", "--max-rate=500000", "-%e0 (no external)"] },
  { name: "Scrapy Crawler", command: "scrapy", description: "Structured web crawling — extracts URLs, forms, scripts, meta tags, inline JS, images without alt text. Outputs JSON.", category: "Web Scraping", icon: <Search size={16} />, usage: "scrapy crawl audit -a url=<target>" },
  { name: "LinkChecker", command: "linkchecker", description: "Detects broken links, expired content, redirects, and unmaintained pages across a website.", category: "Web Scraping", icon: <AlertTriangle size={16} />, usage: "linkchecker --no-robots --recursion-level=2 <url>" },
  { name: "JS Secret Scanner", command: "js-analysis", description: "Extracts and scans all JavaScript bundles for hardcoded API keys, tokens, passwords, eval() usage, and localStorage abuse.", category: "Web Scraping", icon: <Key size={16} />, usage: "Automated — runs during web scan or via chat: 'analyze js <target>'" },
  { name: "Frontend Security Audit", command: "frontend-audit", description: "Checks HTTP security headers (CSP, HSTS, X-Frame-Options), mixed content, exposed sensitive files (.env, .git), and broken links.", category: "Web Scraping", icon: <Shield size={16} />, usage: "Automated — runs during web scan or via chat: 'audit <target>'" },

  // Phase 7: Exploit DB & CVE Dictionary
  { name: "ExploitDB Sync", command: "sync-exploitdb", description: "Updates local ExploitDB archive and downloads NIST NVD CVE feeds (2020–current). Builds local searchable vulnerability index.", category: "Exploit DB", icon: <RefreshCw size={16} />, usage: "Via chat: 'sync exploitdb'" },
  { name: "CVE/Exploit Search", command: "exploitdb-search", description: "Searches local ExploitDB + NVD feeds for known vulnerabilities. Returns CVE IDs, CVSS scores, descriptions, and exploit paths.", category: "Exploit DB", icon: <FileText size={16} />, usage: "Via chat: 'searchcve apache 2.4' or 'search exploit openssl'" },
];

const TOOL_CATEGORIES = [...new Set(TOOL_CATALOG.map(t => t.category))];

// ─── Component ──────────────────────────────────────────────────

export function KaliLinuxPage() {
  // ALL hooks at top before any conditional returns
  const { data: statusData, loading, error, refetch: refetchStatus } =
    useRpc<{ ok: boolean } & KaliStatus>("republic.cyber.kali.status", {}, [], {
      refetchIntervalMs: 10_000,
    });

  const { data: scansData, refetch: refetchScans } =
    useRpc<{ ok: boolean; scans: ScanResult[] }>("republic.cyber.kali.scans", { limit: 20 }, [], {
      refetchIntervalMs: 15_000,
    });

  const [activeTab, setActiveTab] = useState("chat");
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "system", content: "🛡️ Kali Cybersecurity Orchestrator online. I am your autonomous penetration testing specialist.\n\nI can:\n• **Scan targets** — provide a hostname, IP, or URL\n• **Run specific tools** — nmap, sqlmap, nikto, hydra, etc.\n• **Clone websites** — full offline mirrors with httrack\n• **Crawl & analyze** — extract forms, scripts, meta tags with scrapy\n• **Frontend audit** — security headers, exposed files, broken links, JS secrets\n• **Search CVE/exploits** — `searchcve <term>` to search local ExploitDB + NVD\n• **Sync exploit DB** — `sync exploitdb` to update vulnerability feeds\n• **Generate reports** — full pentest reports with CVSS scores\n\nTell me what you need.", timestamp: Date.now() },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [toolFilter, setToolFilter] = useState("");
  const [selectedScan, setSelectedScan] = useState<ScanResult | null>(null);
  const [scanTarget, setScanTarget] = useState("");
  const [scanType, setScanType] = useState("smart");
  const [scanPorts, setScanPorts] = useState("1-1000");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoginUrl, setAuthLoginUrl] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleStart = useCallback(async () => {
    await mutateRpc("republic.cyber.kali.start", {});
    refetchStatus();
  }, [refetchStatus]);

  const handleStop = useCallback(async () => {
    await mutateRpc("republic.cyber.kali.stop", {});
    refetchStatus();
    setConfirmAction(null);
  }, [refetchStatus]);

  const handleScan = useCallback(async () => {
    if (!scanTarget.trim()) { return; }
    const isSmartScan = scanType === "smart";
    const hasAuth = authUsername.trim() && authPassword.trim();
    setChatMessages(prev => [...prev, {
      role: "user",
      content: `🎯 ${isSmartScan ? "Smart" : ""} Scan ${scanTarget} (${scanType}, ports: ${scanPorts})${hasAuth ? " [with auth]" : ""}`,
      timestamp: Date.now(),
    }]);
    setChatLoading(true);
    try {
      // If auth credentials provided, authenticate first
      if (hasAuth) {
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: `🔐 **Authenticating** to ${authLoginUrl || scanTarget}...\nUsing Playwright for browser-based login.`,
          timestamp: Date.now(),
          toolUsed: "playwright",
        }]);
        try {
          const authRes = await rpc("republic.cyber.kali.auth.login", {
            targetUrl: scanTarget,
            loginUrl: authLoginUrl || undefined,
            username: authUsername,
            password: authPassword,
          }) as { ok: boolean; success: boolean; authState: unknown; error?: string };
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: authRes.success
              ? `✅ **Authentication successful** — session captured. Proceeding with scan.`
              : `⚠️ **Authentication ${authRes.error || "may have failed"}** — proceeding without auth.`,
            timestamp: Date.now(),
            toolUsed: "kali-auth-agent",
          }]);
        } catch (authErr) {
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: `⚠️ Auth failed: ${authErr} — proceeding without auth.`,
            timestamp: Date.now(),
          }]);
        }
      }

      if (isSmartScan) {
        // Smart scan: fingerprint → plan → execute
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: `🧠 **Fingerprinting target...** Detecting stack, CMS, and technologies.`,
          timestamp: Date.now(),
          toolUsed: "planner",
        }]);
        const fpRes = await rpc("republic.cyber.kali.planner.fingerprint", {
          target: scanTarget,
        }) as { ok: boolean; fingerprint: { technologies: string[]; isSPA: boolean; cms?: string; isAPI: boolean; isEcommerce: boolean; hasAuth: boolean } };
        const fp = fpRes.fingerprint;
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: `📋 **Target Fingerprint:**\n• Technologies: ${fp.technologies.join(", ") || "Unknown"}\n• SPA: ${fp.isSPA ? "Yes" : "No"}\n• CMS: ${fp.cms || "None"}\n• API: ${fp.isAPI ? "Yes" : "No"}\n• E-commerce: ${fp.isEcommerce ? "Yes" : "No"}\n• Auth Required: ${fp.hasAuth ? "Yes" : "No"}\n\n🚀 **Building optimal scan plan...**`,
          timestamp: Date.now(),
          toolUsed: "planner",
        }]);

        const planRes = await rpc("republic.cyber.kali.planner.plan", {
          target: scanTarget,
          scanType: "full",
          ports: scanPorts,
        }) as { ok: boolean; plan: { id: string; pattern: string; tasks: Array<{ tool: string; status: string }> } };
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: `📊 **Scan Plan**: ${planRes.plan.pattern}\n• **${planRes.plan.tasks.length} tools** selected\n• Tools: ${planRes.plan.tasks.map(t => t.tool).join(" → ")}\n\n⚡ **Executing DAG...** Tasks run in dependency order with parallel batches.`,
          timestamp: Date.now(),
          toolUsed: "planner-dag",
        }]);
      } else {
        // Legacy scan
        const res = await rpc("republic.cyber.kali.scan", {
          target: scanTarget,
          scanType,
          ports: scanPorts,
        }) as { ok: boolean; scan?: ScanResult; message?: string };
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: res.scan
            ? `✅ Scan started: **${res.scan.id}**\n\nTarget: ${res.scan.target}\nType: ${res.scan.scanType}\nStatus: ${res.scan.status}\nFindings: ${res.scan.findings.length}`
            : `✅ ${res.message || "Scan submitted"}`,
          timestamp: Date.now(),
        }]);
      }
      refetchScans();
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: "assistant",
        content: `❌ Scan failed: ${err}`,
        timestamp: Date.now(),
      }]);
    }
    setChatLoading(false);
  }, [scanTarget, scanType, scanPorts, authUsername, authPassword, authLoginUrl, refetchScans]);

  const handleChat = useCallback(async () => {
    if (!chatInput.trim()) { return; }
    const message = chatInput.trim();
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: message, timestamp: Date.now() }]);
    setChatLoading(true);

    try {
      // Detect if this is a scan request
      const scanMatch = message.match(/(?:scan|pentest|assess|audit|test)\s+(\S+)/i);
      if (scanMatch) {
        const target = scanMatch[1];
        const res = await rpc("republic.cyber.kali.scan", {
          target,
          scanType: message.includes("quick") ? "quick" : message.includes("web") ? "web" : message.includes("recon") ? "recon" : "full",
        }) as { ok: boolean; scan?: ScanResult; message?: string };
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: `🔍 **Initiated scan on ${target}**\n\n${res.scan ? `Scan ID: \`${res.scan.id}\`\nFindings: ${res.scan.findings.length}` : res.message || "Scan started"}`,
          timestamp: Date.now(),
          toolUsed: "nmap + scanner suite",
        }]);
        refetchScans();
      } else if (/nmap|port.?scan/i.test(message)) {
        const target = message.match(/(?:nmap|scan)\s+(\S+)/i)?.[1] || "127.0.0.1";
        const res = await rpc("republic.cyber.kali.tool.portscan", { target }) as { ok: boolean; output: string; findings: Finding[] };
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: `📡 **Nmap Port Scan — ${target}**\n\n\`\`\`\n${(res.output || "").slice(0, 2000)}\n\`\`\`\n\n**Findings**: ${(res.findings ?? []).length} open ports detected`,
          timestamp: Date.now(),
          toolUsed: "nmap",
        }]);
      } else if (/nikto|web.?scan/i.test(message)) {
        const target = message.match(/(?:nikto|scan)\s+(\S+)/i)?.[1] || "";
        if (target) {
          const res = await rpc("republic.cyber.kali.tool.webscan", { target }) as { ok: boolean; output: string; findings: Finding[] };
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: `🌐 **Nikto Web Scan — ${target}**\n\n${(res.output || "").slice(0, 2000)}\n\n**Findings**: ${(res.findings ?? []).length}`,
            timestamp: Date.now(),
            toolUsed: "nikto",
          }]);
        }
      } else if (/ssl|tls|certificate/i.test(message)) {
        const target = message.match(/(?:ssl|tls|cert)\S*\s+(\S+)/i)?.[1] || "";
        if (target) {
          const res = await rpc("republic.cyber.kali.tool.sslaudit", { target }) as { ok: boolean; output: string; findings: Finding[] };
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: `🔒 **SSL/TLS Audit — ${target}**\n\n${(res.output || "").slice(0, 2000)}\n\n**Findings**: ${(res.findings ?? []).length}`,
            timestamp: Date.now(),
            toolUsed: "sslyze",
          }]);
        }
      } else if (/clone|mirror|httrack/i.test(message)) {
        const target = message.match(/(?:clone|mirror|httrack)\s+(\S+)/i)?.[1] || "";
        if (target) {
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: `🌐 **Cloning website ${target}...** This may take a few minutes.`,
            timestamp: Date.now(),
            toolUsed: "httrack",
          }]);
          const res = await rpc("republic.cyber.kali.tool.clone", { target, depth: 3 }) as { ok: boolean; output: string; findings: Finding[] };
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: `📦 **Website Clone Complete — ${target}**\n\n${(res.findings ?? []).map(f => f.description).join("\n")}\n\n\`\`\`\n${(res.output || "").slice(0, 1000)}\n\`\`\``,
            timestamp: Date.now(),
            toolUsed: "httrack",
          }]);
        }
      } else if (/crawl|scrapy|spider/i.test(message)) {
        const target = message.match(/(?:crawl|scrapy|spider)\s+(\S+)/i)?.[1] || "";
        if (target) {
          const res = await rpc("republic.cyber.kali.tool.crawl", { target }) as { ok: boolean; output: string; findings: Finding[] };
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: `🕷️ **Web Crawl Complete — ${target}**\n\n${(res.findings ?? []).map(f => f.description).join("\n")}`,
            timestamp: Date.now(),
            toolUsed: "scrapy",
          }]);
        }
      } else if (/searchcve|search.?exploit|cve.?search/i.test(message)) {
        const query = message.replace(/^.*?(?:searchcve|search.?exploit|cve.?search)\s*/i, "").trim();
        if (query) {
          const res = await rpc("republic.cyber.kali.exploitdb.search", { query }) as { ok: boolean; output: string; findings: Finding[] };
          const findings = res.findings ?? [];
          setChatMessages(prev => [...prev, {
            role: "assistant",
            content: `🔍 **Exploit/CVE Search: "${query}"**\n\n**${findings.length} results found**\n\n${findings.slice(0, 10).map(f => `• **${f.title}** ${f.cvss ? `(CVSS ${f.cvss})` : ""}\n  ${f.description}`).join("\n\n")}`,
            timestamp: Date.now(),
            toolUsed: "searchsploit + NVD",
          }]);
        }
      } else if (/sync.?exploit|update.?exploit|sync.?db/i.test(message)) {
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: "🔄 **Syncing ExploitDB + NVD CVE feeds...** This may take a few minutes.",
          timestamp: Date.now(),
        }]);
        const res = await rpc("republic.cyber.kali.exploitdb.sync", {}) as { ok: boolean; output: string };
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: `✅ **Exploit Database Synchronized**\n\n\`\`\`\n${(res.output || "").slice(-500)}\n\`\`\``,
          timestamp: Date.now(),
          toolUsed: "sync-exploitdb",
        }]);
      } else {
        // General exec in Kali container
        const res = await rpc("republic.cyber.kali.exec", { command: message, timeout: 60 }) as { ok: boolean; stdout: string; stderr?: string; exitCode: number };
        setChatMessages(prev => [...prev, {
          role: "assistant",
          content: res.ok
            ? `\`\`\`\n${(res.stdout || "No output").slice(0, 3000)}\n\`\`\`${res.stderr ? `\n\n⚠️ stderr: ${res.stderr.slice(0, 500)}` : ""}`
            : `❌ Command failed (exit ${res.exitCode}):\n\`\`\`\n${res.stderr || res.stdout || "Unknown error"}\n\`\`\``,
          timestamp: Date.now(),
          toolUsed: "kali_exec",
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: "assistant",
        content: `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      }]);
    }
    setChatLoading(false);
  }, [chatInput, refetchScans]);

  // Guard
  if (loading || error) {
    return <RpcStatus loading={loading} error={error} onRetry={refetchStatus} />;
  }

  const status = statusData as KaliStatus | undefined;
  const isRunning = status?.containerRunning ?? false;
  const scans = (scansData as { scans?: ScanResult[] })?.scans ?? [];

  const tabs = [
    { id: "chat", label: "🤖 Orchestrator" },
    { id: "scan", label: "🎯 Launch Scan" },
    { id: "tools", label: "🧰 Tool Arsenal" },
    { id: "history", label: "📊 Scan History" },
    { id: "report", label: "📋 Report Viewer" },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <PageHeader
        title="Kali Linux — Cybersecurity Command Center"
        description="Autonomous penetration testing, vulnerability assessment, and security auditing"
        icon={<Shield size={28} />}
        actions={
          <div className="flex items-center gap-2">
            {!isRunning ? (
              <Button variant="success" size="sm" onClick={handleStart}>
                <Play size={14} className="mr-1" /> Start Kali Container
              </Button>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmAction("stop")}>
                <Square size={14} className="mr-1" /> Stop
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => { refetchStatus(); refetchScans(); }} aria-label="Refresh">
              <RefreshCw size={14} />
            </Button>
          </div>
        }
      />

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <StatCard
          label="Container"
          value={isRunning ? "Running" : "Stopped"}
          icon={<Shield size={18} />}
        />
        <StatCard
          label="Active Scans"
          value={String(status?.activeScans ?? 0)}
          icon={<Radar size={18} />}
        />
        <StatCard
          label="Completed"
          value={String(status?.completedScans ?? 0)}
          icon={<CheckCircle2 size={18} />}
        />
        <StatCard
          label="CPU / Limit"
          value="4 cores"
          sub="Max 4.0 CPU"
          icon={<Cpu size={18} />}
        />
        <StatCard
          label="Memory"
          value="4 GB"
          sub="Max allocated"
          icon={<MemoryStick size={18} />}
        />
        <StatCard
          label="Tools"
          value={String(TOOL_CATALOG.length)}
          sub="Installed"
          icon={<Terminal size={18} />}
        />
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Chat Tab */}
      {activeTab === "chat" && (
        <ChatView
          messages={chatMessages}
          input={chatInput}
          loading={chatLoading}
          isRunning={isRunning}
          chatEndRef={chatEndRef}
          onInputChange={setChatInput}
          onSend={handleChat}
        />
      )}

      {/* Launch Scan Tab */}
      {activeTab === "scan" && (
        <ScanLauncherView
          target={scanTarget}
          scanType={scanType}
          ports={scanPorts}
          isRunning={isRunning}
          authUsername={authUsername}
          authPassword={authPassword}
          authLoginUrl={authLoginUrl}
          onTargetChange={setScanTarget}
          onTypeChange={setScanType}
          onPortsChange={setScanPorts}
          onAuthUsernameChange={setAuthUsername}
          onAuthPasswordChange={setAuthPassword}
          onAuthLoginUrlChange={setAuthLoginUrl}
          onLaunch={handleScan}
        />
      )}

      {/* Tool Arsenal Tab */}
      {activeTab === "tools" && (
        <ToolCatalogView
          filter={toolFilter}
          expandedTool={expandedTool}
          onFilterChange={setToolFilter}
          onToggleTool={setExpandedTool}
        />
      )}

      {/* Scan History Tab */}
      {activeTab === "history" && (
        <ScanHistoryView scans={scans} onSelect={(s) => { setSelectedScan(s); setActiveTab("report"); }} />
      )}

      {/* Report Viewer Tab */}
      {activeTab === "report" && (
        <ReportView scan={selectedScan} />
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmAction === "stop"}
        title="Stop Kali Container"
        message="This will stop the Kali Linux container. Active scans will be interrupted."
        onConfirm={handleStop}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

// ─── Chat View ──────────────────────────────────────────────────

function ChatView({
  messages, input, loading: chatLoading, isRunning, chatEndRef, onInputChange, onSend,
}: {
  messages: ChatMessage[];
  input: string;
  loading: boolean;
  isRunning: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (v: string) => void;
  onSend: () => void;
}) {
  if (!isRunning) {
    return (
      <EmptyState
        icon={<Shield size={40} />}
        title="Kali Container Not Running"
        description="Start the container to begin using the cybersecurity orchestrator."
      />
    );
  }

  return (
    <Card>
      {/* Messages */}
      <div className="h-[55vh] overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role !== "user" && (
              <div className="w-8 h-8 rounded-full bg-danger/20 flex items-center justify-center flex-shrink-0">
                <Bot size={16} className="text-danger" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-accent/20 text-text-primary"
                : msg.role === "system"
                  ? "bg-bg-secondary text-text-secondary border border-border"
                  : "bg-bg-card text-text-primary border border-border"
            }`}>
              <div className="whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{
                __html: formatMessage(msg.content),
              }} />
              {msg.toolUsed && (
                <div className="mt-2 text-xs text-text-muted flex items-center gap-1">
                  <Terminal size={10} /> Used: {msg.toolUsed}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                <User size={16} className="text-accent" />
              </div>
            )}
          </div>
        ))}
        {chatLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-danger/20 flex items-center justify-center">
              <Loader2 size={16} className="text-danger animate-spin" />
            </div>
            <div className="max-w-[80%] rounded-xl px-4 py-3 bg-bg-card border border-border">
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <Loader2 size={14} className="animate-spin" /> Executing...
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-3 border-t border-border">
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder="Ask anything: 'scan 192.168.1.1', 'nmap target.com', 'check SSL google.com'..."
          className="flex-1 bg-bg-input text-text-primary border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
          disabled={chatLoading}
        />
        <Button variant="primary" size="md" onClick={onSend} disabled={chatLoading || !input.trim()}>
          <Send size={16} />
        </Button>
      </div>
    </Card>
  );
}

// ─── Scan Launcher ──────────────────────────────────────────────

function ScanLauncherView({
  target, scanType, ports, isRunning,
  authUsername, authPassword, authLoginUrl,
  onTargetChange, onTypeChange, onPortsChange,
  onAuthUsernameChange, onAuthPasswordChange, onAuthLoginUrlChange,
  onLaunch,
}: {
  target: string;
  scanType: string;
  ports: string;
  isRunning: boolean;
  authUsername: string;
  authPassword: string;
  authLoginUrl: string;
  onTargetChange: (v: string) => void;
  onTypeChange: (v: string) => void;
  onPortsChange: (v: string) => void;
  onAuthUsernameChange: (v: string) => void;
  onAuthPasswordChange: (v: string) => void;
  onAuthLoginUrlChange: (v: string) => void;
  onLaunch: () => void;
}) {
  if (!isRunning) {
    return (
      <EmptyState
        icon={<Target size={40} />}
        title="Container Not Running"
        description="Start the Kali container before launching a scan."
      />
    );
  }

  const scanTypes = [
    { id: "smart", label: "⚡ Smart Scan (AI Planner)", desc: "Auto-fingerprints target, selects optimal tools, builds DAG — recommended" },
    { id: "quick", label: "Quick Scan", desc: "Port scan + basic recon (2-5 min)" },
    { id: "recon", label: "Recon Only", desc: "DNS, WHOIS, OSINT, port scan (5-10 min)" },
    { id: "web", label: "Web App Test", desc: "Nikto, SQLMap, Gobuster, WAF (10-20 min)" },
    { id: "network", label: "Network Scan", desc: "Traceroute, packet capture, ARP (5-10 min)" },
    { id: "compliance", label: "Compliance", desc: "Lynis CIS audit (5-10 min)" },
    { id: "full", label: "Full Pentest", desc: "All phases — recon through exploitation (30-60 min)" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Card>
          <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
            <Target size={18} /> Target Configuration
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-text-secondary text-sm mb-1">Target (hostname, IP, or URL)</label>
              <input
                type="text"
                value={target}
                onChange={(e) => onTargetChange(e.target.value)}
                placeholder="e.g. 192.168.1.0/24, example.com, http://target.com"
                className="w-full bg-bg-input text-text-primary border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-text-secondary text-sm mb-1">Port Range</label>
              <input
                type="text"
                value={ports}
                onChange={(e) => onPortsChange(e.target.value)}
                placeholder="e.g. 1-1000, 80,443,8080, 1-65535"
                className="w-full bg-bg-input text-text-primary border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            <Button variant="primary" size="lg" onClick={onLaunch} disabled={!target.trim()}>
              <Crosshair size={16} className="mr-2" /> Launch Scan
            </Button>
          </div>
        </Card>

        {/* Auth Credentials */}
        <Card>
          <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
            <Lock size={18} /> Authentication (Optional)
          </h3>
          <p className="text-xs text-text-muted mb-3">
            Provide credentials for authenticated scanning. Playwright will log in, capture session cookies/tokens, and distribute to all tools.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-text-muted text-xs mb-1">Username / Email</label>
                <input
                  type="text"
                  value={authUsername}
                  onChange={(e) => onAuthUsernameChange(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full bg-bg-input text-text-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-text-muted text-xs mb-1">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => onAuthPasswordChange(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-bg-input text-text-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
                />
              </div>
            </div>
            <div>
              <label className="block text-text-muted text-xs mb-1">Login URL (auto-detected if blank)</label>
              <input
                type="text"
                value={authLoginUrl}
                onChange={(e) => onAuthLoginUrlChange(e.target.value)}
                placeholder="https://example.com/login"
                className="w-full bg-bg-input text-text-primary border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            </div>
            {authUsername && authPassword && (
              <Badge variant="success">Auth enabled — Playwright will handle login</Badge>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-text-heading font-semibold mb-4 flex items-center gap-2">
          <Scan size={18} /> Scan Type
        </h3>
        <div className="space-y-2">
          {scanTypes.map((st) => (
            <button
              key={st.id}
              onClick={() => onTypeChange(st.id)}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                scanType === st.id
                  ? "border-accent bg-accent/10 text-text-primary"
                  : "border-border bg-bg-secondary text-text-secondary hover:border-border-hover"
              }`}
            >
              <div className="font-medium text-sm">{st.label}</div>
              <div className="text-xs text-text-muted mt-0.5">{st.desc}</div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Tool Catalog ───────────────────────────────────────────────

function ToolCatalogView({
  filter, expandedTool, onFilterChange, onToggleTool,
}: {
  filter: string;
  expandedTool: string | null;
  onFilterChange: (v: string) => void;
  onToggleTool: (name: string | null) => void;
}) {
  const filtered = TOOL_CATALOG.filter(t =>
    !filter || t.name.toLowerCase().includes(filter.toLowerCase()) ||
    t.command.toLowerCase().includes(filter.toLowerCase()) ||
    t.category.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Search tools... (nmap, sqlmap, nikto, hydra...)"
            className="w-full bg-bg-input text-text-primary border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-accent"
          />
        </div>
        <Badge variant="info">{filtered.length} tools</Badge>
      </div>

      {TOOL_CATEGORIES.map(cat => {
        const catTools = filtered.filter(t => t.category === cat);
        if (catTools.length === 0) { return null; }
        return (
          <Card key={cat}>
            <h3 className="text-text-heading font-semibold mb-3 flex items-center gap-2">
              {cat === "Reconnaissance" && <Radar size={16} />}
              {cat === "Web Testing" && <Globe size={16} />}
              {cat === "Exploitation" && <Target size={16} />}
              {cat === "Network Analysis" && <Network size={16} />}
              {cat === "Compliance" && <CheckCircle2 size={16} />}
              {cat === "Forensics" && <Search size={16} />}
              {cat === "Web Scraping" && <Globe size={16} />}
              {cat === "Exploit DB" && <FileText size={16} />}
              {cat} ({catTools.length})
            </h3>
            <div className="space-y-1">
              {catTools.map(tool => (
                <div key={tool.name} className="border border-border/30 rounded-lg overflow-hidden">
                  <button
                    onClick={() => onToggleTool(expandedTool === tool.name ? null : tool.name)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-bg-secondary/50 transition-colors text-left"
                  >
                    <div className="text-accent">{tool.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary text-sm">{tool.name}</span>
                        <Badge variant="neutral">{tool.command}</Badge>
                      </div>
                      <div className="text-xs text-text-muted mt-0.5 truncate">{tool.description}</div>
                    </div>
                    {expandedTool === tool.name ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {expandedTool === tool.name && (
                    <div className="px-4 py-3 bg-bg-secondary/30 border-t border-border/30 space-y-2">
                      <div>
                        <span className="text-xs text-text-muted block mb-1">Usage:</span>
                        <code className="text-xs bg-black/30 text-green-400 px-3 py-1.5 rounded block font-mono">
                          {tool.usage}
                        </code>
                      </div>
                      {tool.flags && (
                        <div>
                          <span className="text-xs text-text-muted block mb-1">Common flags:</span>
                          <div className="flex flex-wrap gap-1">
                            {tool.flags.map(f => (
                              <Badge key={f} variant="neutral">{f}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-xs text-text-secondary">{tool.description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Scan History ───────────────────────────────────────────────

function ScanHistoryView({ scans, onSelect }: { scans: ScanResult[]; onSelect: (s: ScanResult) => void }) {
  if (scans.length === 0) {
    return (
      <EmptyState
        icon={<Clock size={40} />}
        title="No Scan History"
        description="Complete a scan to see results here."
      />
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-muted border-b border-border">
              <th className="text-left py-2 px-3">Target</th>
              <th className="text-left py-2 px-3">Type</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Risk</th>
              <th className="text-left py-2 px-3">Findings</th>
              <th className="text-left py-2 px-3">Date</th>
              <th className="text-left py-2 px-3"></th>
            </tr>
          </thead>
          <tbody>
            {scans.map(scan => (
              <tr key={scan.id} className="border-b border-border/30 hover:bg-bg-secondary/50 cursor-pointer" onClick={() => onSelect(scan)}>
                <td className="py-2 px-3 text-text-primary font-mono text-xs">{scan.target}</td>
                <td className="py-2 px-3"><Badge variant="info">{scan.scanType}</Badge></td>
                <td className="py-2 px-3">
                  <Badge variant={scan.status === "completed" ? "success" : scan.status === "running" ? "warning" : "danger"}>
                    {scan.status}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  {scan.summary && (
                    <Badge variant={
                      scan.summary.riskLevel === "CRITICAL" ? "danger" :
                      scan.summary.riskLevel === "HIGH" ? "warning" :
                      scan.summary.riskLevel === "MEDIUM" ? "info" : "success"
                    }>
                      {scan.summary.riskLevel}
                    </Badge>
                  )}
                </td>
                <td className="py-2 px-3 text-text-secondary">{scan.findings.length}</td>
                <td className="py-2 px-3 text-text-muted text-xs">{new Date(scan.startedAt).toLocaleString()}</td>
                <td className="py-2 px-3">
                  <Button variant="ghost" size="sm" aria-label="View report">
                    <FileText size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Report Viewer ──────────────────────────────────────────────

function ReportView({ scan }: { scan: ScanResult | null }) {
  if (!scan) {
    return (
      <EmptyState
        icon={<FileText size={40} />}
        title="No Report Selected"
        description="Select a scan from the History tab to view its report."
      />
    );
  }

  const s = scan.summary;

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-text-heading font-semibold flex items-center gap-2">
            <FileText size={18} /> Penetration Test Report
          </h3>
          {s && (
            <Badge variant={s.riskLevel === "CRITICAL" ? "danger" : s.riskLevel === "HIGH" ? "warning" : "info"}>
              Risk: {s.riskLevel}
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-text-muted">Target:</span> <span className="text-text-primary font-mono">{scan.target}</span></div>
          <div><span className="text-text-muted">Type:</span> <span className="text-text-primary">{scan.scanType}</span></div>
          <div><span className="text-text-muted">Status:</span> <Badge variant={scan.status === "completed" ? "success" : "warning"}>{scan.status}</Badge></div>
          <div><span className="text-text-muted">Duration:</span> <span className="text-text-primary">{scan.completedAt ? `${((scan.completedAt - scan.startedAt) / 1000 / 60).toFixed(1)} min` : "—"}</span></div>
        </div>
      </Card>

      {/* Severity Breakdown */}
      {s && (
        <Card>
          <h4 className="text-text-heading font-medium mb-3">Finding Severity Distribution</h4>
          <div className="grid grid-cols-5 gap-3">
            {[
              { label: "Critical", count: s.critical, color: "bg-red-500" },
              { label: "High", count: s.high, color: "bg-orange-500" },
              { label: "Medium", count: s.medium, color: "bg-yellow-500" },
              { label: "Low", count: s.low, color: "bg-green-500" },
              { label: "Info", count: s.info, color: "bg-blue-500" },
            ].map(sev => (
              <div key={sev.label} className="text-center">
                <div className={`text-2xl font-bold ${sev.count > 0 && sev.label === "Critical" ? "text-danger" : sev.count > 0 && sev.label === "High" ? "text-warning" : "text-text-primary"}`}>
                  {sev.count}
                </div>
                <div className="text-xs text-text-muted mt-1">{sev.label}</div>
                <ProgressBar
                  value={sev.count}
                  max={Math.max(s.totalFindings, 1)}
                  size="sm"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Findings List */}
      <Card>
        <h4 className="text-text-heading font-medium mb-3">Detailed Findings ({scan.findings.length})</h4>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {scan.findings.map((f, i) => (
            <div key={i} className="p-3 border border-border/30 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span>{f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : f.severity === "medium" ? "🟡" : f.severity === "low" ? "🟢" : "🔵"}</span>
                <span className="text-sm font-medium text-text-primary">{f.title}</span>
                <Badge variant={f.severity === "critical" ? "danger" : f.severity === "high" ? "warning" : "neutral"}>
                  {f.severity.toUpperCase()}{f.cvss ? ` (${f.cvss})` : ""}
                </Badge>
                {f.cve && <Badge variant="purple">{f.cve}</Badge>}
              </div>
              <p className="text-xs text-text-secondary mb-1">{f.description}</p>
              {f.evidence && (
                <div className="text-xs bg-black/20 text-text-muted px-2 py-1 rounded font-mono mb-1 truncate">
                  {f.evidence.slice(0, 200)}
                </div>
              )}
              <div className="text-xs text-success mt-1">
                <strong>Remediation:</strong> {f.remediation}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Remediation Plan */}
      {s && s.recommendations.length > 0 && (
        <Card>
          <h4 className="text-text-heading font-medium mb-3">Remediation Plan</h4>
          <ol className="space-y-2 list-decimal list-inside">
            {s.recommendations.map((r, i) => (
              <li key={i} className="text-sm text-text-secondary">{r}</li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

function formatMessage(content: string): string {
  return content
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="bg-black/30 px-1 py-0.5 rounded text-green-400 text-xs">$1</code>')
    .replace(/```\n?([\s\S]*?)```/g, '<pre class="bg-black/40 p-2 rounded text-xs font-mono mt-1 overflow-x-auto text-green-400">$1</pre>')
    .replace(/\n/g, "<br/>");
}
