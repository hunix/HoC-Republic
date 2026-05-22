/**
 * Kali Linux Cybersecurity Agent Loop
 *
 * Autonomous penetration testing orchestrator that runs inside the Kali Linux
 * sandbox container. Uses Claude to plan and execute security assessments
 * following OWASP/PTES methodology.
 *
 * Architecture: Gateway → kali-agent-loop → Kali container API (port 3104)
 *
 * 30 specialized security tools across 7 phases:
 *   Phase 1: Reconnaissance (8 tools)
 *   Phase 2: Web Application Testing (6 tools)
 *   Phase 3: Exploitation & Password (5 tools)
 *   Phase 4: Network Analysis (4 tools)
 *   Phase 5: Compliance & Forensics (4 tools)
 *   Phase 6: Web Scraping & Cloning (4 tools)
 *   Phase 7: Exploit DB & CVE Dictionary (3 tools)
 *   Utility: exec, report, evidence (3 tools)
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { listContainers } from "./docker-orchestrator.js";
import { generateReport } from "./kali-report.js";
import {
  portScan,
  hostDiscovery,
  dnsEnum,
  subdomainEnum,
  whoisLookup,
  serviceFingerprint,
  osDetection,
  sslAudit,
  webScan,
  dirBrute,
  sqlInject,
  wafDetect,
  cmsScan,
  apiFuzz,
  exploitSearch,
  bruteForce,
  vulnScan,
  packetCapture,
  traceRoute,
  complianceAudit,
  fileForensics,
  smbEnum,
} from "./kali-tools.js";
// ── Modular Imports ──────────────────────────────────────────────
import {
  type KaliScanRequest,
  type KaliScanResult,
  type PhaseResult,
  type Finding,
  type ExecutiveSummary,
  activeScans,
  completedScans,
  kaliExec,
  ensureKaliRunning,
} from "./kali-types.js";
import {
  websiteClone,
  webCrawl,
  frontendAudit,
  jsAnalysis,
  syncExploitDb,
  cveEnrich,
  exploitDictSearch,
} from "./kali-web-tools.js";

const logger = createSubsystemLogger("kali-agent-loop");

// ─── Scan Orchestrator ──────────────────────────────────────────

export async function runScan(request: KaliScanRequest): Promise<KaliScanResult> {
  const scanId = `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { target, scanType = "full", ports = "1-1000" } = request;

  const scan: KaliScanResult = {
    id: scanId,
    target,
    scanType,
    status: "running",
    startedAt: Date.now(),
    phases: [],
    findings: [],
  };

  activeScans.set(scanId, scan);
  logger.info(`[${scanId}] Starting ${scanType} scan on ${target}`);

  try {
    // Ensure Kali container is running
    const running = await ensureKaliRunning();
    if (!running) {
      scan.status = "failed";
      scan.findings.push({
        severity: "critical",
        title: "Scan Failed — Container Not Available",
        description: "Could not start the Kali sandbox container",
        evidence: "ensureKaliRunning() returned false",
        remediation: "Check Docker is running and the hoc/kali-sandbox:latest image is built.",
        tool: "system",
        phase: "setup",
      });
      return scan;
    }

    // Phase 1: Reconnaissance
    if (["full", "recon", "quick"].includes(scanType)) {
      logger.info(`[${scanId}] Phase 1: Reconnaissance`);

      const recon = await portScan(target, ports);
      scan.phases.push(recon);
      scan.findings.push(...recon.findings);

      if (scanType !== "quick") {
        const [dns, whois_, os, ssl] = await Promise.all([
          dnsEnum(target),
          whoisLookup(target),
          osDetection(target),
          sslAudit(target),
        ]);
        scan.phases.push(dns, whois_, os, ssl);
        scan.findings.push(...dns.findings, ...whois_.findings, ...os.findings, ...ssl.findings);
      }
    }

    // Phase 2: Web Application Testing
    if (["full", "web"].includes(scanType)) {
      logger.info(`[${scanId}] Phase 2: Web Application Testing`);

      const [web, waf, dirs, cms] = await Promise.all([
        webScan(target),
        wafDetect(target),
        dirBrute(target),
        cmsScan(target),
      ]);
      scan.phases.push(web, waf, dirs, cms);
      scan.findings.push(...web.findings, ...waf.findings, ...dirs.findings, ...cms.findings);

      // SQL injection test (sequential — can be aggressive)
      const sqli = await sqlInject(target);
      scan.phases.push(sqli);
      scan.findings.push(...sqli.findings);

      // Phase 2b: Web Scraping & Frontend Audit
      logger.info(`[${scanId}] Phase 2b: Web Scraping & Frontend Audit`);

      const [clone, audit, jsAudit] = await Promise.all([
        websiteClone(target, 2),
        frontendAudit(target),
        jsAnalysis(target),
      ]);
      scan.phases.push(clone, audit, jsAudit);
      scan.findings.push(...clone.findings, ...audit.findings, ...jsAudit.findings);

      // Structured crawl (sequential — can be resource-heavy)
      const crawl = await webCrawl(target);
      scan.phases.push(crawl);
      scan.findings.push(...crawl.findings);
    }

    // Phase 3: Exploitation checks
    if (["full"].includes(scanType)) {
      logger.info(`[${scanId}] Phase 3: Vulnerability & Exploit Check`);

      const vuln = await vulnScan(target, ports);
      scan.phases.push(vuln);
      scan.findings.push(...vuln.findings);

      // Search for exploits based on discovered services
      const services = scan.findings
        .filter((f) => f.title.startsWith("Open Port"))
        .map((f) => f.title.split("—")[1]?.trim().split(/\s/)[0] || "")
        .filter(Boolean);

      for (const svc of [...new Set(services)].slice(0, 5)) {
        const exp = await exploitSearch(target, svc);
        scan.phases.push(exp);
        scan.findings.push(...exp.findings);
      }
    }

    // Phase 4: Network Analysis
    if (["full", "network"].includes(scanType)) {
      logger.info(`[${scanId}] Phase 4: Network Analysis`);
      const route = await traceRoute(target);
      scan.phases.push(route);
      scan.findings.push(...route.findings);
    }

    // Phase 5: Compliance (local system only)
    if (["full", "compliance"].includes(scanType)) {
      logger.info(`[${scanId}] Phase 5: Compliance Audit`);
      const compliance = await complianceAudit();
      scan.phases.push(compliance);
      scan.findings.push(...compliance.findings);
    }

    // Post-scan: Enrich findings with CVE data
    logger.info(`[${scanId}] Enriching findings with CVE data...`);
    scan.findings = await cveEnrich(scan.findings);

    // Generate report
    scan.status = "completed";
    scan.completedAt = Date.now();
    const report = generateReport(scan);
    const reportName = `pentest_${target.replace(/[^a-zA-Z0-9]/g, "_")}_${scanId}.md`;
    await kaliExec(`cat > /reports/${reportName} << 'RPTEOF'\n${report}\nRPTEOF`, 10);
    scan.reportPath = `/reports/${reportName}`;

    logger.info(
      `[${scanId}] Scan completed — ${scan.findings.length} findings (${scan.summary?.riskLevel})`,
    );
  } catch (err) {
    scan.status = "failed";
    logger.error(`[${scanId}] Scan failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    activeScans.delete(scanId);
    completedScans.unshift(scan);
    if (completedScans.length > 50) {
      completedScans.pop();
    }
  }

  return scan;
}

// ─── Public API ─────────────────────────────────────────────────

export function getKaliStatus(): {
  containerRunning: boolean;
  activeScans: number;
  completedScans: number;
} {
  return {
    containerRunning: listContainers().some(
      (c) => c.status === "running" && (c.name.includes("kali") || c.image.includes("kali")),
    ),
    activeScans: activeScans.size,
    completedScans: completedScans.length,
  };
}

export function getActiveScan(scanId: string): KaliScanResult | undefined {
  return activeScans.get(scanId);
}

export function getCompletedScans(limit = 20): KaliScanResult[] {
  return completedScans.slice(0, limit);
}

export function getScanResult(scanId: string): KaliScanResult | undefined {
  return activeScans.get(scanId) || completedScans.find((s) => s.id === scanId);
}

export function cancelScan(scanId: string): boolean {
  const scan = activeScans.get(scanId);
  if (!scan) {
    return false;
  }
  scan.status = "cancelled";
  activeScans.delete(scanId);
  completedScans.unshift(scan);
  return true;
}

// ─── Re-exports for downstream consumers ────────────────────────

export type { KaliScanRequest, KaliScanResult, PhaseResult, Finding, ExecutiveSummary };

export {
  // Types module
  kaliExec,
  // Phase 1-5 tools
  portScan,
  hostDiscovery,
  dnsEnum,
  subdomainEnum,
  whoisLookup,
  serviceFingerprint,
  osDetection,
  sslAudit,
  webScan,
  dirBrute,
  sqlInject,
  wafDetect,
  cmsScan,
  apiFuzz,
  exploitSearch,
  bruteForce,
  vulnScan,
  packetCapture,
  traceRoute,
  complianceAudit,
  fileForensics,
  smbEnum,
  // Web scraping & Exploit DB
  websiteClone,
  webCrawl,
  frontendAudit,
  jsAnalysis,
  syncExploitDb,
  exploitDictSearch,
  // Report
  generateReport,
};
