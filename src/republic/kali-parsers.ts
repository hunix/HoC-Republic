/**
 * Kali Finding Parsers
 *
 * Pure functions that parse tool output into structured Finding arrays.
 * No side effects, no I/O — the most testable module in the Kali stack.
 */

import type { Finding } from "./kali-types.js";

// ─── Nmap ───────────────────────────────────────────────────────

export function parseNmapFindings(output: string, target: string): Finding[] {
  const findings: Finding[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const portMatch = line.match(/^(\d+)\/(tcp|udp)\s+open\s+(.+)/);
    if (portMatch) {
      const [, port, proto, service] = portMatch;
      findings.push({
        severity: isHighRiskPort(Number(port)) ? "medium" : "info",
        title: `Open Port: ${port}/${proto} — ${service.trim()}`,
        description: `Port ${port}/${proto} is open on ${target} running ${service.trim()}`,
        evidence: line,
        remediation: `Review if port ${port} (${service.trim()}) needs to be publicly accessible. Close unnecessary ports.`,
        tool: "nmap",
        phase: "reconnaissance",
      });
    }
  }
  return findings;
}

export function parseHostDiscoveryFindings(output: string): Finding[] {
  const findings: Finding[] = [];
  const hostRegex = /Nmap scan report for\s+(\S+)/g;
  let match;
  while ((match = hostRegex.exec(output)) !== null) {
    findings.push({
      severity: "info",
      title: `Live Host: ${match[1]}`,
      description: `Host ${match[1]} is alive and responding to probes`,
      evidence: match[0],
      remediation: "Verify this host should be discoverable on the network.",
      tool: "nmap",
      phase: "reconnaissance",
    });
  }
  return findings;
}

export function parseNmapVulnFindings(output: string, target: string): Finding[] {
  const findings: Finding[] = [];
  const vulnBlocks = output.split(/(?=\|_)/);
  for (const block of vulnBlocks) {
    const cveMatch = block.match(/CVE-\d{4}-\d+/);
    if (cveMatch || /VULNERABLE/i.test(block)) {
      findings.push({
        severity: cveMatch ? "high" : "medium",
        title: `NSE Vulnerability: ${(cveMatch?.[0] || block.slice(0, 60)).trim()}`,
        description: `Nmap vulnerability script found issue on ${target}`,
        evidence: block.slice(0, 500),
        remediation:
          "Apply vendor patches. If no patch is available, implement compensating controls.",
        cve: cveMatch?.[0],
        tool: "nmap --script vuln",
        phase: "exploitation",
      });
    }
  }
  return findings;
}

// ─── SSL ────────────────────────────────────────────────────────

export function parseSslFindings(output: string, target: string): Finding[] {
  const findings: Finding[] = [];
  if (/SSLv2|SSLv3|TLSv1\.0|TLSv1\.1/i.test(output)) {
    findings.push({
      severity: "high",
      title: "Deprecated TLS/SSL Version Supported",
      description: `${target} supports deprecated SSL/TLS versions`,
      evidence: output.match(/.*(SSLv2|SSLv3|TLSv1\.0|TLSv1\.1).*/i)?.[0] || "",
      remediation: "Disable SSLv2, SSLv3, TLS 1.0, and TLS 1.1. Use TLS 1.2+ only.",
      cvss: 7.5,
      tool: "sslyze",
      phase: "reconnaissance",
    });
  }
  if (/expired|not yet valid/i.test(output)) {
    findings.push({
      severity: "high",
      title: "Invalid SSL Certificate",
      description: `SSL certificate for ${target} is expired or not yet valid`,
      evidence: output.match(/.*(?:expired|not yet valid).*/i)?.[0] || "",
      remediation: "Renew the SSL certificate immediately.",
      cvss: 6.5,
      tool: "sslyze",
      phase: "reconnaissance",
    });
  }
  if (/self.signed/i.test(output)) {
    findings.push({
      severity: "medium",
      title: "Self-Signed Certificate",
      description: `${target} uses a self-signed SSL certificate`,
      evidence: "Certificate is self-signed",
      remediation: "Replace with a certificate from a trusted Certificate Authority (CA).",
      cvss: 4.0,
      tool: "sslyze",
      phase: "reconnaissance",
    });
  }
  if (findings.length === 0) {
    findings.push({
      severity: "info",
      title: "SSL/TLS Configuration",
      description: `SSL/TLS audit results for ${target}`,
      evidence: output.slice(0, 1000),
      remediation: "Review cipher suite configuration and ensure forward secrecy is enabled.",
      tool: "sslyze",
      phase: "reconnaissance",
    });
  }
  return findings;
}

// ─── Web Testing ────────────────────────────────────────────────

export function parseNiktoFindings(output: string, target: string): Finding[] {
  const findings: Finding[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    if (line.includes("OSVDB-") || line.includes("+ /")) {
      const isHigh = /sql|inject|rce|remote code|command exec|directory travers|lfi|rfi/i.test(
        line,
      );
      const isMed = /xss|csrf|clickjack|header|cookie|session/i.test(line);
      findings.push({
        severity: isHigh ? "high" : isMed ? "medium" : "low",
        title: line.trim().slice(0, 100),
        description: `Nikto finding on ${target}: ${line.trim()}`,
        evidence: line,
        remediation: isHigh
          ? "Patch immediately — this could allow remote code execution."
          : "Review and apply appropriate security headers and configurations.",
        tool: "nikto",
        phase: "web-testing",
      });
    }
  }
  return findings;
}

export function parseGobusterFindings(output: string, target: string): Finding[] {
  const findings: Finding[] = [];
  const lines = output.split("\n").filter((l) => l.includes("(Status:") || l.match(/^\//));
  for (const line of lines) {
    const sensitive =
      /admin|backup|config|\.env|\.git|debug|phpinfo|wp-|phpmyadmin|shell|upload|api.*key|token|secret/i.test(
        line,
      );
    findings.push({
      severity: sensitive ? "medium" : "info",
      title: `Discovered Path: ${line.trim().slice(0, 80)}`,
      description: `Directory brute-force found: ${line.trim()} on ${target}`,
      evidence: line,
      remediation: sensitive
        ? "Restrict access to sensitive paths. Remove backup files and admin panels from production."
        : "Verify this path should be publicly accessible.",
      tool: "gobuster",
      phase: "web-testing",
    });
  }
  return findings;
}

export function parseSqlmapFindings(output: string, target: string): Finding[] {
  if (/is vulnerable|injectable/i.test(output)) {
    return [
      {
        severity: "critical",
        title: "SQL Injection Vulnerability",
        description: `SQL injection found on ${target}`,
        evidence: output.slice(0, 2000),
        remediation:
          "Use parameterized queries/prepared statements. Implement input validation. Deploy a WAF.",
        cvss: 9.8,
        cve: "CWE-89",
        tool: "sqlmap",
        phase: "web-testing",
      },
    ];
  }
  return [
    {
      severity: "info",
      title: "No SQL Injection Found",
      description: `sqlmap did not find injectable parameters on ${target}`,
      evidence: "No injection points detected",
      remediation: "Continue using parameterized queries as a best practice.",
      tool: "sqlmap",
      phase: "web-testing",
    },
  ];
}

// ─── Exploit DB ─────────────────────────────────────────────────

export function parseExploitDbFindings(output: string, service: string): Finding[] {
  const findings: Finding[] = [];
  try {
    const data = JSON.parse(output);
    const exploits = (data.RESULTS_EXPLOIT || []).slice(0, 10);
    for (const exp of exploits) {
      findings.push({
        severity: "high",
        title: `Known Exploit: ${exp.Title || "Unknown"}`,
        description: `ExploitDB match for ${service}: ${exp.Title}`,
        evidence: `EDB-ID: ${exp["EDB-ID"] || "?"} | Path: ${exp.Path || "?"}`,
        remediation:
          "Patch the affected service to the latest version. Monitor for exploitation attempts.",
        tool: "searchsploit",
        phase: "exploitation",
      });
    }
  } catch {
    // Parse non-JSON output
    const lines = output.split("\n").filter((l) => l.includes("|"));
    for (const line of lines.slice(0, 10)) {
      findings.push({
        severity: "medium",
        title: `Potential Exploit: ${line.trim().slice(0, 80)}`,
        description: `ExploitDB match for ${service}`,
        evidence: line,
        remediation: "Verify if the installed version is affected and patch accordingly.",
        tool: "searchsploit",
        phase: "exploitation",
      });
    }
  }
  return findings;
}

// ─── Compliance ─────────────────────────────────────────────────

export function parseLynisFindings(output: string): Finding[] {
  const findings: Finding[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    if (line.includes("[WARNING]")) {
      findings.push({
        severity: "medium",
        title: `Compliance Warning: ${line
          .replace(/.*\[WARNING\]\s*/, "")
          .trim()
          .slice(0, 80)}`,
        description: line.trim(),
        evidence: line,
        remediation: "Address the hardening recommendation per CIS benchmark guidelines.",
        tool: "lynis",
        phase: "compliance",
      });
    }
  }
  // Extract hardening index
  const indexMatch = output.match(/Hardening index\s*:\s*(\d+)/);
  if (indexMatch) {
    const score = Number(indexMatch[1]);
    findings.push({
      severity: score < 50 ? "high" : score < 70 ? "medium" : "low",
      title: `System Hardening Score: ${score}/100`,
      description: `Lynis system hardening index is ${score}/100`,
      evidence: `Hardening index: ${score}`,
      remediation:
        score < 70
          ? "Implement CIS benchmark recommendations to improve hardening score."
          : "System is reasonably hardened. Continue monitoring.",
      tool: "lynis",
      phase: "compliance",
    });
  }
  return findings;
}

// ─── SMB ────────────────────────────────────────────────────────

export function parseSmbFindings(output: string, target: string): Finding[] {
  const findings: Finding[] = [];
  if (/null session/i.test(output)) {
    findings.push({
      severity: "high",
      title: "SMB Null Session Allowed",
      description: `${target} allows null session SMB connections`,
      evidence: output.match(/.*null session.*/i)?.[0] || "",
      remediation: "Disable null session enumeration. Restrict anonymous access to SMB shares.",
      cvss: 7.5,
      tool: "enum4linux",
      phase: "exploitation",
    });
  }
  if (/share enumeration/i.test(output)) {
    findings.push({
      severity: "medium",
      title: "SMB Shares Enumerated",
      description: `Accessible SMB shares found on ${target}`,
      evidence: output.match(/[\s\S]*share enumeration[\s\S]{0,500}/i)?.[0] || "",
      remediation: "Review share permissions. Remove unnecessary shares and restrict access.",
      tool: "enum4linux",
      phase: "exploitation",
    });
  }
  return findings;
}

// ─── Helpers ────────────────────────────────────────────────────

export function isHighRiskPort(port: number): boolean {
  const highRisk = [
    21, 22, 23, 25, 110, 135, 139, 445, 1433, 1521, 3306, 3389, 5432, 5900, 6379, 27017,
  ];
  return highRisk.includes(port);
}
