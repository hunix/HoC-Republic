/**
 * Security Intent Classification — Route detection for the Kali agent loop.
 *
 * Determines whether a user message should be handled by the Kali
 * cybersecurity orchestrator (pentest, vulnerability scanning, etc.)
 * vs the general-purpose Sandbox Agent Loop.
 *
 * Priority: This runs BEFORE isProjectBuildIntent in the chat.ts waterfall.
 */

export interface SecurityIntentResult {
  isSecurityTask: boolean;
  /** Extracted URL or IP target. null if not found. */
  target: string | null;
  /** Recommended scan type */
  scanType: "full" | "recon" | "web" | "network" | "compliance" | "quick";
  /** Why it was/wasn't classified as a security task */
  reason: string;
}

// ─── Strong security keywords (any match = security intent) ─────

const SECURITY_VERBS: string[] = [
  "pentest",
  "pen test",
  "penetration test",
  "vulnerability scan",
  "vuln scan",
  "security scan",
  "security audit",
  "security assessment",
  "port scan",
  "nmap",
  "scan for vulnerabilities",
  "scan for exploits",
  "find vulnerabilities",
  "check for vulnerabilities",
  "exploit",
  "brute force",
  "sql injection",
  "sqli",
  "xss",
  "cross-site scripting",
  "owasp",
  "ptes",
  "nuclei scan",
  "nikto",
  "sqlmap",
  "dirbuster",
  "dir brute",
  "waf detect",
  "ssl audit",
  "certificate audit",
  "compliance audit",
  "cve search",
  "zero-day",
  "0day",
  "metasploit",
  "kali",
  "hack this",
  "hack into",
  "attack surface",
  "threat assessment",
  "red team",
  "recon on",
  "reconnaissance on",
  "fingerprint",
  "subdomain enum",
  "dns enum",
  "whois lookup",
  "service fingerprint",
  "web application test",
  "web app security",
  "api security",
  "fuzz",
  "fuzzing",
];

// ─── Compound detection (security noun + action verb) ───────────

const SECURITY_NOUNS: string[] = [
  "vulnerability",
  "vulnerabilities",
  "exploit",
  "exploits",
  "security",
  "cyber",
  "cybersecurity",
  "penetration",
  "pentest",
  "firewall",
  "intrusion",
  "malware",
  "ransomware",
  "phishing",
  "ssl",
  "tls",
  "certificate",
  "cipher",
  "encryption",
  "port",
  "ports",
  "cve",
  "cwe",
  "owasp",
  "waf",
  "ids",
  "ips",
];

const SECURITY_ACTION_VERBS =
  /\b(scan|test|audit|check|assess|analyze|probe|enumerate|discover|detect|find|hunt|inspect|evaluate|review)\b/i;

// ─── URL / IP extraction ────────────────────────────────────────

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/i;
const IP_PATTERN = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\/\d{1,2})?\b/;
const DOMAIN_PATTERN = /\b([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z]{2,})+)\b/i;

function extractTarget(message: string): string | null {
  // Try URL first
  const urlMatch = URL_PATTERN.exec(message);
  if (urlMatch) {
    return urlMatch[0].replace(/[.,;:!?)]+$/, ""); // strip trailing punctuation
  }

  // Try IP address
  const ipMatch = IP_PATTERN.exec(message);
  if (ipMatch) {
    return ipMatch[0];
  }

  // Try bare domain (but not common English words that look like domains)
  const domainMatch = DOMAIN_PATTERN.exec(message);
  if (domainMatch) {
    const domain = domainMatch[0];
    // Filter common false positives
    const falsePositives = ["e.g", "i.e", "etc.com", "a.m", "p.m"];
    if (!falsePositives.includes(domain.toLowerCase()) && domain.includes(".")) {
      return domain;
    }
  }

  return null;
}

// ─── Scan type inference ────────────────────────────────────────

function inferScanType(message: string): SecurityIntentResult["scanType"] {
  const lower = message.toLowerCase();

  if (/\b(port\s*scan|nmap|host\s*discovery|recon|reconnaissance)\b/.test(lower)) {
    return "recon";
  }
  if (/\b(web\s*(app|application)?|owasp|sqli|xss|nikto|dirbuster|waf|api\s*fuzz)\b/.test(lower)) {
    return "web";
  }
  if (/\b(network|packet|traceroute|sniff|capture|tcp|udp)\b/.test(lower)) {
    return "network";
  }
  if (/\b(compliance|pci|hipaa|gdpr|soc2|forensics)\b/.test(lower)) {
    return "compliance";
  }
  if (/\b(quick|fast|brief|light)\b/.test(lower)) {
    return "quick";
  }

  return "full";
}

// ─── Main Classifier ────────────────────────────────────────────

/**
 * Classify whether a chat message is a cybersecurity task that should
 * be routed to the Kali agent loop.
 */
export function classifySecurityIntent(message: string): SecurityIntentResult {
  const lower = message.toLowerCase().trim();
  const notSecurity: SecurityIntentResult = {
    isSecurityTask: false,
    target: null,
    scanType: "full",
    reason: "Not a security task",
  };

  // Too short to be a real security request
  if (lower.length < 10) {
    return notSecurity;
  }

  // ── Strong verb match ──────────────────────────────────────────
  for (const verb of SECURITY_VERBS) {
    if (lower.includes(verb)) {
      return {
        isSecurityTask: true,
        target: extractTarget(message),
        scanType: inferScanType(message),
        reason: `Matched security keyword: "${verb}"`,
      };
    }
  }

  // ── Compound match: security noun + action verb ────────────────
  const hasSecurityNoun = SECURITY_NOUNS.some((n) => lower.includes(n));
  const hasActionVerb = SECURITY_ACTION_VERBS.test(lower);
  if (hasSecurityNoun && hasActionVerb) {
    return {
      isSecurityTask: true,
      target: extractTarget(message),
      scanType: inferScanType(message),
      reason: "Matched security noun + action verb compound",
    };
  }

  // ── URL/IP + security context ──────────────────────────────────
  // If the user provides a target AND uses security-adjacent language
  const target = extractTarget(message);
  if (target && hasSecurityNoun) {
    return {
      isSecurityTask: true,
      target,
      scanType: inferScanType(message),
      reason: "Target URL/IP provided with security noun",
    };
  }

  return notSecurity;
}
