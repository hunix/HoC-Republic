/**
 * Kali Security Scan Tools — Phases 1–5
 *
 * 22 tool implementations covering:
 *   Phase 1: Reconnaissance (8 tools)
 *   Phase 2: Web Application Testing (6 tools)
 *   Phase 3: Exploitation & Password (3 tools)
 *   Phase 4: Network Analysis (2 tools)
 *   Phase 5: Compliance & Forensics (3 tools)
 *
 * All tools follow the same pattern:
 *   construct command → kaliExec() → return PhaseResult
 */

import type { PhaseResult } from "./kali-types.js";
import {
  parseNmapFindings,
  parseHostDiscoveryFindings,
  parseSslFindings,
  parseNiktoFindings,
  parseGobusterFindings,
  parseSqlmapFindings,
  parseExploitDbFindings,
  parseNmapVulnFindings,
  parseLynisFindings,
  parseSmbFindings,
} from "./kali-parsers.js";
import { kaliExec } from "./kali-types.js";

// ─── Phase 1: Reconnaissance ────────────────────────────────────

export async function portScan(
  target: string,
  ports = "1-1000",
  options: Record<string, unknown> = {},
): Promise<PhaseResult> {
  const start = Date.now();
  const flags = options.udp ? "-sU" : "-sS";
  const version = options.version !== false ? "-sV" : "";
  const scripts = options.scripts !== false ? "-sC" : "";
  const cmd = `nmap ${flags} ${version} ${scripts} -p ${ports} --open -oN /reports/nmap_${Date.now()}.txt ${target} 2>&1`;
  const result = await kaliExec(cmd, 600);
  return {
    phase: "reconnaissance",
    tool: "nmap",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseNmapFindings(result.stdout, target),
  };
}

export async function hostDiscovery(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `nmap -sn ${target} 2>&1`;
  const result = await kaliExec(cmd, 120);
  return {
    phase: "reconnaissance",
    tool: "nmap-discovery",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseHostDiscoveryFindings(result.stdout),
  };
}

export async function dnsEnum(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `dnsrecon -d ${target} -t std,brt 2>&1 | head -200`;
  const result = await kaliExec(cmd, 120);
  return {
    phase: "reconnaissance",
    tool: "dnsrecon",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "DNS Enumeration Results",
        description: `DNS records discovered for ${target}`,
        evidence: result.stdout.slice(0, 2000),
        remediation:
          "Review DNS records for unnecessary exposure. Remove wildcard DNS if not needed.",
        tool: "dnsrecon",
        phase: "reconnaissance",
      },
    ],
  };
}

export async function subdomainEnum(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `theHarvester -d ${target} -l 200 -b all 2>&1 | tail -100`;
  const result = await kaliExec(cmd, 180);
  return {
    phase: "reconnaissance",
    tool: "theHarvester",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "OSINT Reconnaissance",
        description: `Subdomain and email enumeration for ${target}`,
        evidence: result.stdout.slice(0, 2000),
        remediation: "Minimize public exposure of subdomains and email addresses.",
        tool: "theHarvester",
        phase: "reconnaissance",
      },
    ],
  };
}

export async function whoisLookup(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `whois ${target} 2>&1`;
  const result = await kaliExec(cmd, 30);
  return {
    phase: "reconnaissance",
    tool: "whois",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "WHOIS Information",
        description: `Domain registration data for ${target}`,
        evidence: result.stdout.slice(0, 2000),
        remediation: "Enable WHOIS privacy protection if personal data is exposed.",
        tool: "whois",
        phase: "reconnaissance",
      },
    ],
  };
}

export async function serviceFingerprint(target: string, ports = "1-1000"): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `nmap -sV -sC --version-intensity 5 -p ${ports} ${target} -oN /reports/fingerprint_${Date.now()}.txt 2>&1`;
  const result = await kaliExec(cmd, 600);
  return {
    phase: "reconnaissance",
    tool: "nmap-fingerprint",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseNmapFindings(result.stdout, target),
  };
}

export async function osDetection(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `nmap -O --osscan-guess ${target} 2>&1`;
  const result = await kaliExec(cmd, 120);
  return {
    phase: "reconnaissance",
    tool: "nmap-os",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "OS Detection",
        description: `Operating system fingerprinting for ${target}`,
        evidence: result.stdout.slice(0, 2000),
        remediation: "Disable OS fingerprinting by configuring firewall to drop probes.",
        tool: "nmap -O",
        phase: "reconnaissance",
      },
    ],
  };
}

export async function sslAudit(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `sslyze --regular ${target} 2>&1 | head -300`;
  const result = await kaliExec(cmd, 120);
  return {
    phase: "reconnaissance",
    tool: "sslyze",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseSslFindings(result.stdout, target),
  };
}

// ─── Phase 2: Web Application Testing ───────────────────────────

export async function webScan(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `http://${target}`;
  const cmd = `nikto -h ${url} -o /reports/nikto_${Date.now()}.txt -Format txt -Tuning x6 2>&1 | tail -200`;
  const result = await kaliExec(cmd, 300);
  return {
    phase: "web-testing",
    tool: "nikto",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseNiktoFindings(result.stdout, target),
  };
}

export async function dirBrute(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `http://${target}`;
  const cmd = `gobuster dir -u ${url} -w /usr/share/wordlists/dirb/common.txt -t 20 --no-error -q 2>&1 | head -100`;
  const result = await kaliExec(cmd, 300);
  return {
    phase: "web-testing",
    tool: "gobuster",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseGobusterFindings(result.stdout, target),
  };
}

export async function sqlInject(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `http://${target}`;
  const cmd = `sqlmap -u "${url}" --batch --level=2 --risk=1 --crawl=2 --output-dir=/reports/sqlmap_${Date.now()} 2>&1 | tail -100`;
  const result = await kaliExec(cmd, 300);
  return {
    phase: "web-testing",
    tool: "sqlmap",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseSqlmapFindings(result.stdout, target),
  };
}

export async function wafDetect(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `http://${target}`;
  const cmd = `wafw00f ${url} 2>&1`;
  const result = await kaliExec(cmd, 60);
  return {
    phase: "web-testing",
    tool: "wafw00f",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "WAF Detection",
        description: `Web Application Firewall detection for ${target}`,
        evidence: result.stdout.slice(0, 1000),
        remediation: result.stdout.includes("No WAF")
          ? "Consider deploying a WAF for web application protection."
          : "WAF detected — ensure it is properly configured.",
        tool: "wafw00f",
        phase: "web-testing",
      },
    ],
  };
}

export async function cmsScan(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `http://${target}`;
  // First detect CMS, then scan appropriately
  const detectCmd = `whatweb ${url} 2>&1`;
  const detect = await kaliExec(detectCmd, 30);
  const isWordpress = detect.stdout.toLowerCase().includes("wordpress");

  let scanCmd: string;
  if (isWordpress) {
    scanCmd = `wpscan --url ${url} --enumerate vp,vt,u --no-banner 2>&1 | tail -200`;
  } else {
    scanCmd = `whatweb -a 3 ${url} 2>&1`;
  }
  const result = await kaliExec(scanCmd, 180);
  return {
    phase: "web-testing",
    tool: isWordpress ? "wpscan" : "whatweb",
    command: scanCmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: isWordpress ? "medium" : "info",
        title: `CMS Analysis (${isWordpress ? "WordPress" : "General"})`,
        description: `CMS fingerprinting and vulnerability check for ${target}`,
        evidence: result.stdout.slice(0, 2000),
        remediation: isWordpress
          ? "Keep WordPress, themes, and plugins up to date. Disable XML-RPC if not needed."
          : "Keep web framework and dependencies updated.",
        tool: isWordpress ? "wpscan" : "whatweb",
        phase: "web-testing",
      },
    ],
  };
}

export async function apiFuzz(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const url = target.startsWith("http") ? target : `http://${target}`;
  const cmd = `ffuf -u ${url}/FUZZ -w /usr/share/wordlists/dirb/common.txt -mc 200,301,302,401,403 -t 20 -s 2>&1 | head -50`;
  const result = await kaliExec(cmd, 120);
  return {
    phase: "web-testing",
    tool: "ffuf",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "API/Path Fuzzing",
        description: `Endpoint discovery for ${target}`,
        evidence: result.stdout.slice(0, 2000),
        remediation:
          "Ensure all discovered endpoints require proper authentication and authorization.",
        tool: "ffuf",
        phase: "web-testing",
      },
    ],
  };
}

// ─── Phase 3: Exploitation & Password ───────────────────────────

export async function exploitSearch(target: string, service: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `searchsploit ${service} --json 2>&1 | head -5000`;
  const result = await kaliExec(cmd, 30);
  return {
    phase: "exploitation",
    tool: "searchsploit",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseExploitDbFindings(result.stdout, service),
  };
}

export async function bruteForce(
  target: string,
  service: string,
  port: number,
): Promise<PhaseResult> {
  const start = Date.now();
  // Use a small wordlist for safety — only test default/common credentials
  const cmd = `hydra -L /usr/share/wordlists/metasploit/default_users_for_services_unhash.txt -P /usr/share/wordlists/metasploit/default_pass_for_services_unhash.txt -t 4 -f ${target} ${service} -s ${port} 2>&1 | tail -30`;
  const result = await kaliExec(cmd, 300);
  const found = result.stdout.includes("[" + port + "]");
  return {
    phase: "exploitation",
    tool: "hydra",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: found
      ? [
          {
            severity: "critical",
            title: `Default Credentials Found — ${service}:${port}`,
            description: `Brute force attack discovered valid default credentials for ${service} on ${target}:${port}`,
            evidence: result.stdout.slice(0, 1000),
            remediation:
              "Immediately change default credentials. Implement account lockout policies. Use strong, unique passwords.",
            cvss: 9.8,
            tool: "hydra",
            phase: "exploitation",
          },
        ]
      : [
          {
            severity: "info",
            title: `No Default Credentials — ${service}:${port}`,
            description: `Brute force test against common defaults found no valid credentials`,
            evidence: "No valid credentials found in default wordlist",
            remediation: "Continue monitoring for unauthorized access attempts.",
            tool: "hydra",
            phase: "exploitation",
          },
        ],
  };
}

export async function vulnScan(target: string, ports = "1-1000"): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `nmap --script vuln -p ${ports} ${target} -oN /reports/vuln_${Date.now()}.txt 2>&1`;
  const result = await kaliExec(cmd, 600);
  return {
    phase: "exploitation",
    tool: "nmap-vuln",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseNmapVulnFindings(result.stdout, target),
  };
}

// ─── Phase 4: Network Analysis ──────────────────────────────────

export async function packetCapture(target: string, duration = 10): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `timeout ${duration} tcpdump -i any host ${target} -c 100 -nn 2>&1 | tail -50`;
  const result = await kaliExec(cmd, duration + 10);
  return {
    phase: "network",
    tool: "tcpdump",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "Network Traffic Capture",
        description: `Captured packets to/from ${target}`,
        evidence: result.stdout.slice(0, 2000),
        remediation:
          "Review traffic for unencrypted protocols and unexpected communication patterns.",
        tool: "tcpdump",
        phase: "network",
      },
    ],
  };
}

export async function traceRoute(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `traceroute -n -w 2 -m 20 ${target} 2>&1`;
  const result = await kaliExec(cmd, 60);
  return {
    phase: "network",
    tool: "traceroute",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "Network Path Analysis",
        description: `Route trace to ${target}`,
        evidence: result.stdout.slice(0, 1000),
        remediation: "Verify network segmentation and routing paths.",
        tool: "traceroute",
        phase: "network",
      },
    ],
  };
}

// ─── Phase 5: Compliance & Forensics ────────────────────────────

export async function complianceAudit(): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `lynis audit system --no-colors --quick 2>&1 | tail -200`;
  const result = await kaliExec(cmd, 300);
  return {
    phase: "compliance",
    tool: "lynis",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseLynisFindings(result.stdout),
  };
}

export async function fileForensics(filePath: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `echo "=== BINWALK ===" && binwalk ${filePath} 2>&1 && echo "\\n=== EXIFTOOL ===" && exiftool ${filePath} 2>&1 && echo "\\n=== FILE ===" && file ${filePath} 2>&1`;
  const result = await kaliExec(cmd, 60);
  return {
    phase: "forensics",
    tool: "binwalk+exiftool",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: [
      {
        severity: "info",
        title: "File Forensics Analysis",
        description: `Binary and metadata analysis of ${filePath}`,
        evidence: result.stdout.slice(0, 2000),
        remediation: "Review embedded data and metadata for sensitive information leaks.",
        tool: "binwalk+exiftool",
        phase: "forensics",
      },
    ],
  };
}

export async function smbEnum(target: string): Promise<PhaseResult> {
  const start = Date.now();
  const cmd = `enum4linux -a ${target} 2>&1 | head -200`;
  const result = await kaliExec(cmd, 120);
  return {
    phase: "exploitation",
    tool: "enum4linux",
    command: cmd,
    output: result.stdout,
    exitCode: result.exitCode,
    duration: Date.now() - start,
    findings: parseSmbFindings(result.stdout, target),
  };
}
