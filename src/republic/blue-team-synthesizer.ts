/**
 * Blue Team Auto-Synthesizer (Phase 4)
 *
 * Automatically generates defensive rules from confirmed exploit findings:
 *   1. WAF rules (ModSecurity/OWASP CRS format)
 *   2. IDS/IPS signatures (Snort/Suricata compatible)
 *   3. Firewall rules (iptables/nftables)
 *   4. YARA rules for file/memory scanning
 *   5. Network IOC blocklists
 *
 * Triggered automatically when the Vulnerability Researcher confirms a finding,
 * or manually via RPC. All rules are stored and publishable to the Intelligence Bus.
 */

import { intelligenceBus } from "./intelligence-bus.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("blue-team-synth");

// ─── Types ───────────────────────────────────────────────────────

export type RuleType = "waf" | "ids" | "firewall" | "yara" | "blocklist";

export interface DefenseRule {
  id: string;
  findingId: string;           // linked researcher finding
  cve: string;
  ruleType: RuleType;
  ruleName: string;
  ruleContent: string;         // the actual rule text
  description: string;
  platform: string;
  severity: "critical" | "high" | "medium" | "low";
  autoApplied: boolean;        // was it auto-pushed to Kali?
  appliedAt?: number;
  createdAt: number;
}

export interface SynthesizerState {
  totalRulesGenerated: number;
  totalAutoApplied: number;
  rules: DefenseRule[];
  byType: Record<RuleType, number>;
}

// ─── State ───────────────────────────────────────────────────────

const state: SynthesizerState = {
  totalRulesGenerated: 0,
  totalAutoApplied: 0,
  rules: [],
  byType: { waf: 0, ids: 0, firewall: 0, yara: 0, blocklist: 0 },
};

const MAX_RULES = 500;

// ─── Rule Generators ─────────────────────────────────────────────

/**
 * Generate all applicable defense rules for a confirmed exploit finding.
 */
export function synthesizeDefenseRules(finding: {
  id: string;
  cve: string;
  title: string;
  analysis: string;
  pocIdea: string;
  harnessCode: string;
  harnessLanguage: string;
  mitigationDraft: string;
  severity: "critical" | "high" | "medium" | "low";
}): DefenseRule[] {
  const rules: DefenseRule[] = [];
  const analysis = (finding.analysis + " " + finding.pocIdea + " " + finding.title).toLowerCase();
  const platform = extractPlatform(analysis);

  // 1. WAF Rule (for web-based exploits)
  if (isWebExploit(analysis)) {
    rules.push(generateWafRule(finding, platform));
  }

  // 2. IDS/Snort Signature
  rules.push(generateIdsSignature(finding, platform));

  // 3. Firewall Rule
  if (hasNetworkVector(analysis)) {
    rules.push(generateFirewallRule(finding, platform));
  }

  // 4. YARA Rule (for file/memory-based exploits)
  if (isFileBasedExploit(analysis)) {
    rules.push(generateYaraRule(finding, platform));
  }

  // 5. IOC Blocklist entry
  rules.push(generateBlocklistEntry(finding, platform));

  // Store and publish
  for (const rule of rules) {
    state.rules.push(rule);
    state.totalRulesGenerated++;
    state.byType[rule.ruleType]++;

    // Prune
    if (state.rules.length > MAX_RULES) {
      state.rules = state.rules.slice(-MAX_RULES);
    }

    // Publish to Intelligence Bus
    intelligenceBus.publish("cyber.research.paper_ingested", {
      paperId: `blueteam-${rule.id}`,
      title: `🛡️ BLUE TEAM: ${rule.ruleType.toUpperCase()} rule generated for ${rule.cve}`,
      abstract: `${rule.description}\n\nRule:\n${rule.ruleContent.slice(0, 500)}`,
      authors: ["BlueTeamSynthesizer"],
      pdfUrl: "",
      publishedAt: Date.now(),
      keywords: [rule.cve, rule.ruleType, "defense", "auto-generated"],
      timestamp: Date.now(),
    });
  }

  logger.info(`BlueTeam: Synthesized ${rules.length} rules for ${finding.cve}`);
  return rules;
}

// ─── WAF Rule Generator ─────────────────────────────────────────

function generateWafRule(finding: { id: string; cve: string; analysis: string; severity: string }, platform: string): DefenseRule {
  const sid = numericHash(finding.cve);
  const analysis = finding.analysis.toLowerCase();

  let pattern = "/exploit|malicious|payload/";
  let action = "deny";

  if (analysis.includes("sqli") || analysis.includes("injection")) {
    pattern = "(?i)(?:union\\s+select|or\\s+1\\s*=\\s*1|'\\s+or\\s+'|--\\s*$|;\\s*drop\\s+table)";
    action = "deny";
  } else if (analysis.includes("xss") || analysis.includes("cross-site")) {
    pattern = "(?i)(?:<script[^>]*>|javascript:|on\\w+\\s*=|<iframe|<embed)";
    action = "deny";
  } else if (analysis.includes("ssrf") || analysis.includes("server-side request")) {
    pattern = "(?i)(?:file://|gopher://|dict://|169\\.254\\.169\\.254|metadata\\.google)";
    action = "deny";
  } else if (analysis.includes("traversal") || analysis.includes("path")) {
    pattern = "(?:\\.\\./|\\.\\.\\\\|%2e%2e%2f|%252e%252e%252f)";
    action = "deny";
  } else if (analysis.includes("deserializ")) {
    pattern = "(?:rO0ABX|aced0005|O:4:\"\\w+\"|__wakeup|__destruct)";
    action = "deny";
  }

  const rule = `# ModSecurity Rule — Auto-generated for ${finding.cve}
# Severity: ${finding.severity} | Platform: ${platform}
SecRule REQUEST_URI|REQUEST_BODY|ARGS "${pattern}" \\
  "id:${sid},\\
   phase:2,\\
   ${action},\\
   status:403,\\
   msg:'${finding.cve} exploit attempt blocked',\\
   severity:'CRITICAL',\\
   tag:'CVE/${finding.cve}',\\
   tag:'auto-generated/blue-team'"`;

  return {
    id: `waf-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    findingId: finding.id,
    cve: finding.cve,
    ruleType: "waf",
    ruleName: `WAF-${finding.cve}`,
    ruleContent: rule,
    description: `ModSecurity WAF rule blocking ${finding.cve} exploit patterns`,
    platform,
    severity: finding.severity as DefenseRule["severity"],
    autoApplied: false,
    createdAt: Date.now(),
  };
}

// ─── IDS/Snort Signature ─────────────────────────────────────────

function generateIdsSignature(finding: { id: string; cve: string; analysis: string; pocIdea: string; severity: string }, platform: string): DefenseRule {
  const sid = numericHash(finding.cve) + 1000000;
  const analysis = (finding.analysis + " " + finding.pocIdea).toLowerCase();

  let protocol = "tcp";
  let content = `|00|`;
  let flow = "to_server,established";

  if (analysis.includes("udp") || analysis.includes("dns")) {
    protocol = "udp";
  }

  if (analysis.includes("buffer overflow") || analysis.includes("heap")) {
    content = `content:"|41 41 41 41 41 41 41 41|"; content:"|90 90 90 90|"; distance:0;`;
  } else if (analysis.includes("shellcode") || analysis.includes("nop sled")) {
    content = `content:"|90 90 90 90 90 90 90 90|"; content:"|eb|"; distance:0; within:64;`;
  } else if (analysis.includes("http") || analysis.includes("web")) {
    content = `content:"HTTP/1."; content:"${finding.cve}"; nocase;`;
    flow = "to_server,established";
  } else if (analysis.includes("smb") || analysis.includes("445")) {
    content = `content:"|ff 53 4d 42|"; content:"|00|"; distance:0;`;
  } else if (analysis.includes("usb") || analysis.includes("uvc")) {
    content = `content:"UVC"; nocase;`;
  } else {
    content = `content:"${finding.cve}"; nocase;`;
  }

  const priority = finding.severity === "critical" ? 1 : finding.severity === "high" ? 2 : 3;

  const rule = `# Snort/Suricata IDS Signature — Auto-generated for ${finding.cve}
alert ${protocol} any any -> any any (\\
  msg:"ET EXPLOIT ${finding.cve} Exploit Attempt Detected";\\
  flow:${flow};\\
  ${content}\\
  classtype:attempted-admin;\\
  sid:${sid};\\
  rev:1;\\
  priority:${priority};\\
  reference:cve,${finding.cve.replace("CVE-", "")};\\
  metadata:auto_generated blue_team;\\
)`;

  return {
    id: `ids-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    findingId: finding.id,
    cve: finding.cve,
    ruleType: "ids",
    ruleName: `IDS-${finding.cve}`,
    ruleContent: rule,
    description: `Snort/Suricata IDS signature detecting ${finding.cve} exploit traffic`,
    platform,
    severity: finding.severity as DefenseRule["severity"],
    autoApplied: false,
    createdAt: Date.now(),
  };
}

// ─── Firewall Rule Generator ─────────────────────────────────────

function generateFirewallRule(finding: { id: string; cve: string; analysis: string; severity: string }, platform: string): DefenseRule {
  const analysis = finding.analysis.toLowerCase();

  let rules: string[] = [
    `# iptables/nftables rules — Auto-generated for ${finding.cve}`,
    `# Severity: ${finding.severity} | Platform: ${platform}`,
  ];

  if (analysis.includes("port 445") || analysis.includes("smb")) {
    rules.push(`iptables -I INPUT -p tcp --dport 445 -j DROP`);
    rules.push(`iptables -I INPUT -p udp --dport 445 -j DROP`);
  }
  if (analysis.includes("port 5555") || analysis.includes("adb")) {
    rules.push(`iptables -I INPUT -p tcp --dport 5555 -j DROP`);
  }
  if (analysis.includes("port 3478") || analysis.includes("stun") || analysis.includes("turn")) {
    rules.push(`iptables -I INPUT -p udp --dport 3478 -j DROP`);
  }
  if (analysis.includes("bluetooth") || analysis.includes("l2cap")) {
    rules.push(`# Disable Bluetooth discoverability`);
    rules.push(`hciconfig hci0 noscan 2>/dev/null || true`);
  }
  if (analysis.includes("dns rebind") || analysis.includes("dns")) {
    rules.push(`# Block DNS rebinding (private IP responses from external DNS)`);
    rules.push(`iptables -I INPUT -p udp --sport 53 -m string --algo bm --hex-string "|c0 a8|" -j DROP`);
  }

  // Generic: rate-limit new connections
  if (rules.length <= 2) {
    rules.push(`# Rate-limit inbound connections (generic defense)`);
    rules.push(`iptables -I INPUT -p tcp --syn -m limit --limit 25/s --limit-burst 50 -j ACCEPT`);
    rules.push(`iptables -I INPUT -p tcp --syn -j DROP`);
  }

  return {
    id: `fw-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    findingId: finding.id,
    cve: finding.cve,
    ruleType: "firewall",
    ruleName: `FW-${finding.cve}`,
    ruleContent: rules.join("\n"),
    description: `Firewall rules blocking attack vectors for ${finding.cve}`,
    platform,
    severity: finding.severity as DefenseRule["severity"],
    autoApplied: false,
    createdAt: Date.now(),
  };
}

// ─── YARA Rule Generator ─────────────────────────────────────────

function generateYaraRule(finding: { id: string; cve: string; analysis: string; severity: string }, platform: string): DefenseRule {
  const ruleName = finding.cve.replace(/[^a-zA-Z0-9]/g, "_");
  const analysis = finding.analysis.toLowerCase();

  let strings: string[] = [];
  let condition = "any of them";

  if (analysis.includes("mach-o") || analysis.includes("dyld") || analysis.includes("ios")) {
    strings.push(`$macho = { cf fa ed fe }`);
    strings.push(`$dyld = "dyld" ascii`);
    condition = "$macho and $dyld";
  } else if (analysis.includes("elf") || analysis.includes("linux")) {
    strings.push(`$elf = { 7f 45 4c 46 }`);
    strings.push(`$exploit_str = "${finding.cve}" ascii nocase`);
    condition = "$elf and $exploit_str";
  } else if (analysis.includes("pe") || analysis.includes("windows") || analysis.includes("exe")) {
    strings.push(`$mz = { 4d 5a }`);
    strings.push(`$exploit = "${finding.cve}" ascii nocase`);
    condition = "$mz at 0 and $exploit";
  } else if (analysis.includes("pdf")) {
    strings.push(`$pdf = "%PDF" ascii`);
    strings.push(`$js = "/JavaScript" ascii`);
    strings.push(`$aa = "/AA" ascii`);
    condition = "$pdf at 0 and ($js or $aa)";
  } else {
    strings.push(`$cve_ref = "${finding.cve}" ascii nocase`);
    strings.push(`$shellcode = { 90 90 90 90 eb ?? }`);
    condition = "any of them";
  }

  const rule = `rule ${ruleName} {
  meta:
    description = "Detects ${finding.cve} exploit artifacts"
    severity = "${finding.severity}"
    auto_generated = true
    platform = "${platform}"
    date = "${new Date().toISOString().split("T")[0]}"

  strings:
    ${strings.join("\n    ")}

  condition:
    filesize < 10MB and (${condition})
}`;

  return {
    id: `yara-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    findingId: finding.id,
    cve: finding.cve,
    ruleType: "yara",
    ruleName: `YARA-${finding.cve}`,
    ruleContent: rule,
    description: `YARA rule for detecting ${finding.cve} exploit artifacts on disk/memory`,
    platform,
    severity: finding.severity as DefenseRule["severity"],
    autoApplied: false,
    createdAt: Date.now(),
  };
}

// ─── IOC Blocklist ──────────────────────────────────────────────

function generateBlocklistEntry(finding: { id: string; cve: string; analysis: string; mitigationDraft: string; severity: string }, platform: string): DefenseRule {
  const entry = `# IOC Blocklist — ${finding.cve}
# Auto-generated by Blue Team Synthesizer
# Platform: ${platform} | Severity: ${finding.severity}
# Analysis: ${finding.analysis.slice(0, 200)}

[indicators]
cve = ${finding.cve}
type = exploit_signature
severity = ${finding.severity}
first_seen = ${new Date().toISOString()}
platforms = ${platform}

[mitigation]
${finding.mitigationDraft.slice(0, 500)}

[hashes]
# Add file hashes of known exploit samples here
# sha256 = <hash>

[network]
# Add C2 domains/IPs here
# domain = <domain>
# ip = <ip>`;

  return {
    id: `ioc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    findingId: finding.id,
    cve: finding.cve,
    ruleType: "blocklist",
    ruleName: `IOC-${finding.cve}`,
    ruleContent: entry,
    description: `IOC blocklist entry for ${finding.cve}`,
    platform,
    severity: finding.severity as DefenseRule["severity"],
    autoApplied: false,
    createdAt: Date.now(),
  };
}

// ─── Apply Rule to Kali ──────────────────────────────────────────

/**
 * Push a generated rule into the running Kali sandbox.
 * Only applicable for firewall and IDS rules.
 */
export async function applyRuleToSandbox(ruleId: string): Promise<{ success: boolean; output: string }> {
  const rule = state.rules.find(r => r.id === ruleId);
  if (!rule) { throw new Error(`Rule ${ruleId} not found`); }

  try {
    const { kaliExec } = await import("./kali-agent-loop.js");
    const { isSandboxTypeRunning } = await import("./multi-sandbox.js");

    if (!isSandboxTypeRunning("kali")) {
      throw new Error("Kali sandbox not running");
    }

    let output = "";

    switch (rule.ruleType) {
      case "firewall": {
        // Extract and apply iptables commands
        const cmds = rule.ruleContent.split("\n")
          .filter(l => l.startsWith("iptables") || l.startsWith("hciconfig") || l.startsWith("nft"))
          .join(" && ");
        if (cmds) {
          const res = await kaliExec(cmds);
          output = typeof res === "string" ? res : res.stdout;
        }
        break;
      }
      case "ids": {
        // Write Snort rule to /etc/snort/rules/local.rules
        const escaped = rule.ruleContent.replace(/'/g, "'\\''");
        const res = await kaliExec(`echo '${escaped}' >> /etc/snort/rules/local.rules 2>&1 || echo 'Written to /tmp/ids_rules.txt' && echo '${escaped}' >> /tmp/ids_rules.txt`);
        output = typeof res === "string" ? res : res.stdout;
        break;
      }
      case "yara": {
        // Write YARA rule to /tmp/yara_rules/
        const escaped = rule.ruleContent.replace(/'/g, "'\\''");
        const res = await kaliExec(`mkdir -p /tmp/yara_rules && echo '${escaped}' > /tmp/yara_rules/${rule.cve.replace(/[^a-zA-Z0-9-]/g, "_")}.yar`);
        output = typeof res === "string" ? res : res.stdout;
        break;
      }
      default:
        output = `Rule type ${rule.ruleType} does not support auto-apply`;
    }

    rule.autoApplied = true;
    rule.appliedAt = Date.now();
    state.totalAutoApplied++;

    return { success: true, output };
  } catch (err) {
    return { success: false, output: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function isWebExploit(text: string): boolean {
  return /sqli|xss|ssrf|traversal|deserializ|injection|web|http|cookie|session/i.test(text);
}

function hasNetworkVector(text: string): boolean {
  return /network|remote|port \d+|tcp|udp|smb|adb|bluetooth|dns|stun/i.test(text);
}

function isFileBasedExploit(text: string): boolean {
  return /file|binary|elf|pe|mach-o|pdf|image|audio|video|font|dyld/i.test(text);
}

function extractPlatform(text: string): string {
  if (/ios|iphone|ipad|apple/i.test(text)) { return "ios"; }
  if (/android|qualcomm|snapdragon/i.test(text)) { return "android"; }
  if (/whatsapp/i.test(text)) { return "whatsapp"; }
  if (/instagram/i.test(text)) { return "instagram"; }
  if (/linkedin/i.test(text)) { return "linkedin"; }
  if (/windows/i.test(text)) { return "windows"; }
  if (/linux|kernel/i.test(text)) { return "linux"; }
  return "generic";
}

function numericHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 9000000 + 1000000;
}

// ─── Public API ──────────────────────────────────────────────────

export function getSynthesizerStatus(): SynthesizerState & { ruleCount: number } {
  return { ...state, ruleCount: state.rules.length };
}

export function getRules(opts: { type?: RuleType; cve?: string; limit?: number } = {}): DefenseRule[] {
  let filtered = state.rules;
  if (opts.type) { filtered = filtered.filter(r => r.ruleType === opts.type); }
  if (opts.cve) { filtered = filtered.filter(r => r.cve === opts.cve); }
  return filtered.slice(-(opts.limit ?? 50)).toReversed();
}

export function getRule(id: string): DefenseRule | undefined {
  return state.rules.find(r => r.id === id);
}
