/**
 * Republic Cyber Defense Engine — Phase 2: Fortress Republic
 *
 * Active defense, counter-intelligence, counter-strike planning,
 * security lab management, honeypot deployment, perimeter monitoring,
 * OSINT fusion (Project Argus integration), NIST 800-61 incident response,
 * war gaming / red team exercises, cluster SIGINT, and cyber education.
 *
 * Modeled after: US CYBERCOM, Israel Unit 8200, and Russia FSB/GRU.
 * The Republic has the constitutional right to defend itself.
 * All operations require authorization and follow Rules of Engagement.
 */

import { uid, ts } from "./utils.js";
import { execSync } from "node:child_process";
import {
  CONTAINER_PRESETS,
  launchPreset,
  listContainers,
  removeContainer,
} from "./docker-orchestrator.js";
import { callCyberLLM, getCyberSpecialization } from "./cyber-army.js";
import { intelligenceBus } from "./intelligence-bus.js";
import type { ArgusThreatBrief } from "../intelligence/osint-fusion.js";

function dockerExec(containerId: string, command: string): string {
  try {
    return execSync(`docker exec ${containerId} ${command}`, {
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "Command failed or container not running";
  }
}

// ─── Types ──────────────────────────────────────────────────────

export type ThreatSeverity = "informational" | "low" | "medium" | "high" | "critical";
export type DefensePosture = "green" | "yellow" | "orange" | "red" | "black";
export type CounterStrikeStatus = "planned" | "authorized" | "executing" | "completed" | "aborted";
export type LabStatus = "provisioning" | "running" | "stopped" | "destroyed";
export type HoneypotType = "ssh" | "http" | "smb" | "dns" | "ftp" | "rdp" | "custom";

export interface ThreatAlert {
  id: string;
  type: "intrusion" | "reconnaissance" | "exfiltration" | "malware" | "insider" | "ddos" | "social-engineering";
  severity: ThreatSeverity;
  source: string;
  target: string;
  description: string;
  indicators: string[];
  mitreTactics: string[];
  detectedAt: string;
  status: "active" | "investigating" | "contained" | "resolved";
  responseActions: string[];
}

export interface CounterStrikePlan {
  id: string;
  threatId: string;
  name: string;
  objective: string;
  phases: Array<{
    name: string;
    description: string;
    tools: string[];
    mitreTechniques: string[];
    riskLevel: ThreatSeverity;
  }>;
  rulesOfEngagement: string[];
  authorization: string;
  status: CounterStrikeStatus;
  createdAt: string;
  executedAt?: string;
  result?: string;
  specialistId: string;
}

export interface SecurityLab {
  id: string;
  preset: string;
  containerId?: string;
  containerName?: string;
  status: LabStatus;
  purpose: string;
  tools: string[];
  createdAt: string;
  createdBy?: string;
}

export interface HoneypotConfig {
  id: string;
  type: HoneypotType;
  port: number;
  description: string;
  active: boolean;
  detections: number;
  lastActivity?: string;
  createdAt: string;
}

export interface PerimeterScanResult {
  id: string;
  scanType: "port-scan" | "vuln-scan" | "network-map" | "service-enum";
  target: string;
  findings: Array<{
    type: string;
    severity: ThreatSeverity;
    description: string;
    port?: number;
    service?: string;
    recommendation: string;
  }>;
  scannedAt: string;
  duration: number;
}

// ─── State ──────────────────────────────────────────────────────

const threats: ThreatAlert[] = [];
const counterPlans: CounterStrikePlan[] = [];
const securityLabs: SecurityLab[] = [];
const honeypots: HoneypotConfig[] = [];
const scanResults: PerimeterScanResult[] = [];
let currentPosture: DefensePosture = "green";

const MAX_THREATS = 500;
const MAX_PLANS = 200;
const MAX_SCANS = 100;

// ─── Security Lab Presets ───────────────────────────────────────

const SECURITY_LAB_PRESETS: Record<string, { description: string; tools: string[] }> = {
  "kali-linux": {
    description: "Kali Linux — Full offensive/defensive pentest lab with 600+ security tools",
    tools: ["nmap", "metasploit", "burp-suite", "wireshark", "sqlmap", "hydra", "john", "hashcat",
      "nikto", "gobuster", "aircrack-ng", "bloodhound", "mimikatz", "responder"],
  },
  "parrot-os": {
    description: "Parrot Security OS — Privacy, forensics, and reverse engineering focused",
    tools: ["anonsurf", "torbrowser", "volatility", "autopsy", "foremost", "binwalk",
      "radare2", "gdb", "strace", "ltrace"],
  },
  openvas: {
    description: "OpenVAS/Greenbone — Enterprise vulnerability scanner",
    tools: ["openvas-scanner", "gvm-cli", "greenbone-security-assistant"],
  },
  wazuh: {
    description: "Wazuh — Open-source SIEM/XDR agent for monitoring and threat detection",
    tools: ["wazuh-agent", "ossec-auth", "ossec-control", "syscheck"],
  },
};

// ─── Defense Posture Calculator ─────────────────────────────────

function recalculatePosture(): DefensePosture {
  const active = threats.filter((t) => t.status === "active" || t.status === "investigating");
  const criticals = active.filter((t) => t.severity === "critical").length;
  const highs = active.filter((t) => t.severity === "high").length;
  const mediums = active.filter((t) => t.severity === "medium").length;

  if (criticals > 0) { return "red"; }
  if (highs >= 3) { return "red"; }
  if (highs > 0) { return "orange"; }
  if (mediums >= 5) { return "orange"; }
  if (mediums > 0 || active.length > 3) { return "yellow"; }
  return "green";
}

// ─── Threat Management ──────────────────────────────────────────

export function reportThreat(
  type: ThreatAlert["type"],
  severity: ThreatSeverity,
  source: string,
  target: string,
  description: string,
  indicators: string[] = [],
  mitreTactics: string[] = [],
): ThreatAlert {
  const threat: ThreatAlert = {
    id: `threat-${uid().slice(0, 8)}`,
    type,
    severity,
    source,
    target,
    description,
    indicators,
    mitreTactics,
    detectedAt: ts(),
    status: "active",
    responseActions: [],
  };
  threats.push(threat);
  if (threats.length > MAX_THREATS) { threats.shift(); }
  currentPosture = recalculatePosture();
  return threat;
}

export function getActiveThreats(): ThreatAlert[] {
  return threats.filter((t) => t.status === "active" || t.status === "investigating");
}

export function getAllThreats(limit = 50): ThreatAlert[] {
  return threats.slice(-limit);
}

export function respondToThreat(threatId: string, action: string): ThreatAlert | null {
  const threat = threats.find((t) => t.id === threatId);
  if (!threat) { return null; }
  threat.responseActions.push(`[${ts()}] ${action}`);
  return threat;
}

export function containThreat(threatId: string): ThreatAlert | null {
  const threat = threats.find((t) => t.id === threatId);
  if (!threat) { return null; }
  threat.status = "contained";
  threat.responseActions.push(`[${ts()}] Threat contained`);
  currentPosture = recalculatePosture();
  return threat;
}

export function resolveThreat(threatId: string, resolution: string): ThreatAlert | null {
  const threat = threats.find((t) => t.id === threatId);
  if (!threat) { return null; }
  threat.status = "resolved";
  threat.responseActions.push(`[${ts()}] Resolved: ${resolution}`);
  currentPosture = recalculatePosture();
  return threat;
}

// ─── Counter-Strike Planning ────────────────────────────────────

export async function generateCounterPlan(
  threatId: string,
  specialistId = "counter-strike-operator",
): Promise<CounterStrikePlan> {
  const threat = threats.find((t) => t.id === threatId);
  if (!threat) { throw new Error(`Threat ${threatId} not found`); }

  const spec = getCyberSpecialization(specialistId);
  if (!spec) { throw new Error(`Specialist ${specialistId} not found`); }

  const prompt = `You are generating a COUNTER-STRIKE PLAN against an active threat.

**Threat Details:**
- Type: ${threat.type}
- Severity: ${threat.severity}
- Source: ${threat.source}
- Target: ${threat.target}
- Description: ${threat.description}
- Indicators: ${threat.indicators.join(", ") || "None listed"}
- MITRE Tactics: ${threat.mitreTactics.join(", ") || "Unknown"}

Generate a structured counter-strike plan with:
1. **Objective** — What this counter-operation aims to achieve
2. **Phases** (3-5 phases, each with name, description, tools to use, MITRE D3FEND techniques, and risk level)
3. **Rules of Engagement** — Legal and ethical constraints
4. **Expected Outcome**

Use MITRE D3FEND defensive technique IDs where possible.
Tools available: ${spec.tools.map((t) => t.name).join(", ")}

IMPORTANT: All actions must be proportional and authorized. This is for DEFENSIVE counter-operations only.`;

  const { content, provider } = await callCyberLLM(spec.systemPrompt, prompt);

  // Parse phases from LLM output
  const phaseMatches = content.matchAll(/(?:phase|step)\s*\d[^]*?(?=(?:phase|step)\s*\d|rules|expected|$)/gi);
  const phases: CounterStrikePlan["phases"] = [];
  for (const match of phaseMatches) {
    phases.push({
      name: match[0].split("\n")[0]?.trim().slice(0, 100) || `Phase ${phases.length + 1}`,
      description: match[0].trim().slice(0, 500),
      tools: spec.tools.map((t) => t.name).slice(0, 3),
      mitreTechniques: [],
      riskLevel: threat.severity,
    });
  }

  // Fallback if parsing yielded nothing
  if (phases.length === 0) {
    phases.push({
      name: "Analyze & Contain",
      description: content.slice(0, 500),
      tools: spec.tools.map((t) => t.name).slice(0, 3),
      mitreTechniques: ["D3-DA", "D3-NI"],
      riskLevel: "medium",
    });
  }

  const plan: CounterStrikePlan = {
    id: `cs-${uid().slice(0, 8)}`,
    threatId,
    name: `Counter-${threat.type}-${threat.severity}`,
    objective: content.split("\n").find((l) => l.includes("Objective"))?.replace(/.*objective[:\s]*/i, "").trim()
      || `Neutralize ${threat.type} threat from ${threat.source}`,
    phases,
    rulesOfEngagement: [
      "Proportional response only",
      "All actions logged and auditable",
      "No collateral damage to uninvolved systems",
      "Comply with Republic constitution and cyber law",
      `Authorization: Republic Department of Defense — ${ts()}`,
    ],
    authorization: `Auto-generated by ${provider}. Requires manual authorization before execution.`,
    status: "planned",
    createdAt: ts(),
    specialistId,
    result: content,
  };

  counterPlans.push(plan);
  if (counterPlans.length > MAX_PLANS) { counterPlans.shift(); }
  return plan;
}

export function getCounterPlans(limit = 20): CounterStrikePlan[] {
  return counterPlans.slice(-limit);
}

export function authorizeCounterPlan(planId: string): CounterStrikePlan | null {
  const plan = counterPlans.find((p) => p.id === planId);
  if (!plan) { return null; }
  plan.status = "authorized";
  return plan;
}

export function abortCounterPlan(planId: string): CounterStrikePlan | null {
  const plan = counterPlans.find((p) => p.id === planId);
  if (!plan) { return null; }
  plan.status = "aborted";
  return plan;
}

// ─── Security Lab Management ────────────────────────────────────

export async function launchSecurityLab(
  preset: string,
  purpose: string,
  createdBy?: string,
): Promise<SecurityLab> {
  const labMeta = SECURITY_LAB_PRESETS[preset];
  if (!labMeta) {
    throw new Error(`Unknown security lab preset: ${preset}. Available: ${Object.keys(SECURITY_LAB_PRESETS).join(", ")}`);
  }

  if (!(preset in CONTAINER_PRESETS)) {
    throw new Error(`Docker preset '${preset}' not found in CONTAINER_PRESETS`);
  }

  const lab: SecurityLab = {
    id: `lab-${uid().slice(0, 8)}`,
    preset,
    status: "provisioning",
    purpose,
    tools: labMeta.tools,
    createdAt: ts(),
    createdBy,
  };
  securityLabs.push(lab);

  try {
    const result = await launchPreset(preset as keyof typeof CONTAINER_PRESETS, createdBy);
    if (result.container) {
      lab.containerId = result.container.id;
      lab.containerName = result.container.name;
      lab.status = "running";
    } else {
      lab.status = "stopped";
    }
  } catch (err) {
    lab.status = "stopped";
    throw new Error(`Failed to launch lab: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }

  return lab;
}

export function listSecurityLabs(): SecurityLab[] {
  return securityLabs.filter((l) => l.status !== "destroyed");
}

export async function destroySecurityLab(labId: string): Promise<boolean> {
  const lab = securityLabs.find((l) => l.id === labId);
  if (!lab) { return false; }
  if (lab.containerId && lab.status !== "destroyed") {
    await removeContainer(lab.containerId, true);
  }
  lab.status = "destroyed";
  return true;
}

export function execInLab(labId: string, command: string): string {
  const lab = securityLabs.find((l) => l.id === labId);
  if (!lab || !lab.containerId) { throw new Error(`Lab ${labId} not found or not running`); }
  return dockerExec(lab.containerId, command);
}

export function getAvailableLabPresets(): Array<{ name: string; description: string; tools: string[]; image: string }> {
  return Object.entries(SECURITY_LAB_PRESETS).map(([name, meta]) => ({
    name,
    description: meta.description,
    tools: meta.tools,
    image: CONTAINER_PRESETS[name as keyof typeof CONTAINER_PRESETS]?.image ?? "unknown",
  }));
}

// ─── Honeypot Engine ────────────────────────────────────────────

export function deployHoneypot(
  type: HoneypotType,
  port: number,
  description: string,
): HoneypotConfig {
  const hp: HoneypotConfig = {
    id: `hp-${uid().slice(0, 8)}`,
    type,
    port,
    description,
    active: true,
    detections: 0,
    createdAt: ts(),
  };
  honeypots.push(hp);
  return hp;
}

export function listHoneypots(): HoneypotConfig[] {
  return honeypots;
}

export function recordHoneypotHit(honeypotId: string): HoneypotConfig | null {
  const hp = honeypots.find((h) => h.id === honeypotId);
  if (!hp) { return null; }
  hp.detections++;
  hp.lastActivity = ts();
  return hp;
}

export function deactivateHoneypot(honeypotId: string): boolean {
  const hp = honeypots.find((h) => h.id === honeypotId);
  if (!hp) { return false; }
  hp.active = false;
  return true;
}

// ─── Perimeter Scanning ─────────────────────────────────────────

export async function runPerimeterScan(
  scanType: PerimeterScanResult["scanType"],
  target: string,
): Promise<PerimeterScanResult> {
  const spec = getCyberSpecialization("network-defender");
  const startTime = Date.now();

  let findings: PerimeterScanResult["findings"] = [];

  if (spec) {
    const prompt = `Analyze the target "${target}" for a ${scanType} scan.
Provide a structured list of potential findings with:
- Type (open-port, vulnerability, misconfiguration, exposed-service)
- Severity (informational/low/medium/high/critical)
- Description
- Port number (if applicable)
- Service name (if applicable)
- Recommendation

Note: This is a simulated scan for planning purposes. Provide realistic findings based on common configurations.`;

    const { content } = await callCyberLLM(spec.systemPrompt, prompt);

    // Parse findings from LLM
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.match(/port|service|vuln|open|exposed/i)) {
        const portMatch = /port\s*[:=]?\s*(\d+)/i.exec(line);
        const sevMatch = /(critical|high|medium|low|informational)/i.exec(line);
        findings.push({
          type: line.includes("vuln") ? "vulnerability" : "finding",
          severity: (sevMatch?.[1]?.toLowerCase() ?? "informational") as ThreatSeverity,
          description: line.trim().slice(0, 200),
          port: portMatch ? parseInt(portMatch[1], 10) : undefined,
          recommendation: "Review and remediate according to security policy",
        });
      }
    }
  }

  // If LLM couldn't produce findings, provide baseline
  if (findings.length === 0) {
    findings = [{
      type: "scan-complete",
      severity: "informational",
      description: `${scanType} scan completed for ${target}. No LLM provider available for detailed analysis.`,
      recommendation: "Use a security lab with actual scanning tools for real results.",
    }];
  }

  const result: PerimeterScanResult = {
    id: `scan-${uid().slice(0, 8)}`,
    scanType,
    target,
    findings,
    scannedAt: ts(),
    duration: Date.now() - startTime,
  };
  scanResults.push(result);
  if (scanResults.length > MAX_SCANS) { scanResults.shift(); }
  return result;
}

export function getScanHistory(limit = 20): PerimeterScanResult[] {
  return scanResults.slice(-limit);
}

// ─── Defense Status ─────────────────────────────────────────────

export function getDefenseStatus() {
  currentPosture = recalculatePosture();
  const activeThreats = threats.filter((t) => t.status === "active" || t.status === "investigating");
  const activeLabs = securityLabs.filter((l) => l.status === "running");
  const activeHoneypots = honeypots.filter((h) => h.active);

  // Check which Docker security containers are actually running
  const dockerContainers = listContainers();
  const securityContainers = dockerContainers.filter((c) =>
    c.labels?.["hoc.department"] === "defense" ||
    c.image?.includes("kali") ||
    c.image?.includes("parrot") ||
    c.image?.includes("openvas") ||
    c.image?.includes("wazuh"),
  );

  return {
    posture: currentPosture,
    activeThreats: activeThreats.length,
    totalThreats: threats.length,
    resolvedThreats: threats.filter((t) => t.status === "resolved").length,
    counterPlans: counterPlans.length,
    activePlans: counterPlans.filter((p) => p.status === "authorized" || p.status === "executing").length,
    activeLabs: activeLabs.length,
    activeHoneypots: activeHoneypots.length,
    totalDetections: honeypots.reduce((sum, h) => sum + h.detections, 0),
    securityContainers: securityContainers.length,
    availableLabPresets: Object.keys(SECURITY_LAB_PRESETS),
    warGamesRun: warGames.length,
    playbooksAvailable: INCIDENT_PLAYBOOKS.length,
    activePlaybookExecutions: playbookExecutions.filter((e) => e.status === "executing").length,
    specialists: {
      counterIntel: !!getCyberSpecialization("counter-intel-analyst"),
      counterStrike: !!getCyberSpecialization("counter-strike-operator"),
      activeDefense: !!getCyberSpecialization("active-defense-engineer"),
      sigint: !!getCyberSpecialization("sigint-analyst"),
      psyops: !!getCyberSpecialization("psyops-analyst"),
      weaponsEngineer: !!getCyberSpecialization("weapons-engineer"),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// PHASE 2: FORTRESS REPUBLIC
// ═══════════════════════════════════════════════════════════════════

// ─── Incident Response Playbooks (NIST 800-61) ──────────────────

export interface IncidentPlaybook {
  id: string;
  name: string;
  category: string;
  description: string;
  nistPhases: Array<{
    phase: "preparation" | "detection-analysis" | "containment-eradication-recovery" | "post-incident";
    steps: string[];
    tools: string[];
    automationLevel: "full" | "semi" | "manual";
  }>;
  mitreTactics: string[];
  severity: ThreatSeverity;
}

export interface PlaybookExecution {
  id: string;
  playbookId: string;
  threatId: string;
  status: "executing" | "completed" | "failed" | "aborted";
  currentPhase: number;
  log: Array<{ timestamp: string; phase: string; step: string; result: string }>;
  startedAt: string;
  completedAt?: string;
}

const playbookExecutions: PlaybookExecution[] = [];
const MAX_PLAYBOOK_EXECUTIONS = 100;

const INCIDENT_PLAYBOOKS: IncidentPlaybook[] = [
  {
    id: "pb-ddos",
    name: "DDoS Response",
    category: "availability",
    description: "Distributed Denial of Service mitigation playbook",
    nistPhases: [
      { phase: "preparation", steps: ["Activate DDoS mitigation infrastructure", "Enable rate-limiting on edge nodes", "Notify SOC team"], tools: ["cloudflare", "nginx", "iptables"], automationLevel: "full" },
      { phase: "detection-analysis", steps: ["Capture traffic samples", "Identify attack vector (volumetric/protocol/application)", "Fingerprint botnet C2"], tools: ["tcpdump", "wireshark", "zeek"], automationLevel: "semi" },
      { phase: "containment-eradication-recovery", steps: ["Block source IPs/ASNs", "Enable geo-blocking if needed", "Scale backend capacity", "Verify service restoration"], tools: ["iptables", "fail2ban", "docker-scale"], automationLevel: "semi" },
      { phase: "post-incident", steps: ["Document attack timeline", "Update blocklists", "Improve detection signatures", "Brief leadership"], tools: ["jira", "confluence"], automationLevel: "manual" },
    ],
    mitreTactics: ["TA0040"],
    severity: "high",
  },
  {
    id: "pb-ransomware",
    name: "Ransomware Response",
    category: "malware",
    description: "Ransomware containment and recovery playbook",
    nistPhases: [
      { phase: "preparation", steps: ["Isolate affected systems immediately", "Preserve forensic evidence", "Activate backup systems"], tools: ["network-isolation", "dd", "forensic-imager"], automationLevel: "semi" },
      { phase: "detection-analysis", steps: ["Identify ransomware family", "Determine encryption method", "Check for data exfiltration", "Map lateral movement"], tools: ["yara", "volatility", "autopsy", "bloodhound"], automationLevel: "semi" },
      { phase: "containment-eradication-recovery", steps: ["Remove malware from all systems", "Restore from clean backups", "Reset all credentials", "Patch exploitation vector"], tools: ["malwarebytes", "backup-restore", "ad-reset"], automationLevel: "manual" },
      { phase: "post-incident", steps: ["Full forensic report", "Update YARA rules", "Conduct tabletop exercise", "Report to authorities if required"], tools: ["report-gen", "yara-forge"], automationLevel: "manual" },
    ],
    mitreTactics: ["TA0040", "TA0010", "TA0008"],
    severity: "critical",
  },
  {
    id: "pb-breach",
    name: "Data Breach Response",
    category: "exfiltration",
    description: "Data breach containment and notification playbook",
    nistPhases: [
      { phase: "preparation", steps: ["Lock affected accounts", "Enable enhanced logging", "Preserve access logs"], tools: ["iam", "siem", "log-archive"], automationLevel: "full" },
      { phase: "detection-analysis", steps: ["Determine scope of breach", "Identify exfiltrated data types", "Trace attack path", "Check for persistence mechanisms"], tools: ["splunk", "elastic", "bloodhound"], automationLevel: "semi" },
      { phase: "containment-eradication-recovery", steps: ["Revoke compromised credentials", "Patch vulnerability", "Notify affected parties", "Enable MFA everywhere"], tools: ["ad-reset", "patch-mgmt", "notification-system"], automationLevel: "semi" },
      { phase: "post-incident", steps: ["Regulatory notification (GDPR/CCPA)", "Public disclosure if required", "Security posture review", "Implement additional controls"], tools: ["legal-review", "pr-comms"], automationLevel: "manual" },
    ],
    mitreTactics: ["TA0010", "TA0009", "TA0006"],
    severity: "critical",
  },
  {
    id: "pb-insider",
    name: "Insider Threat Response",
    category: "insider",
    description: "Insider threat detection and containment playbook",
    nistPhases: [
      { phase: "preparation", steps: ["Activate enhanced monitoring on suspect", "Preserve all activity logs", "Brief legal/HR"], tools: ["ueba", "dlp", "siem"], automationLevel: "semi" },
      { phase: "detection-analysis", steps: ["Analyze behavioral anomalies", "Review access patterns", "Check data transfer volumes", "Interview witnesses"], tools: ["ueba", "network-forensics", "hr-system"], automationLevel: "manual" },
      { phase: "containment-eradication-recovery", steps: ["Revoke access immediately", "Quarantine citizen", "Secure affected systems", "Change shared credentials"], tools: ["iam", "quarantine-system", "ad-reset"], automationLevel: "semi" },
      { phase: "post-incident", steps: ["Legal proceedings", "Policy review", "Enhanced vetting procedures", "Update insider threat indicators"], tools: ["legal-system", "policy-engine"], automationLevel: "manual" },
    ],
    mitreTactics: ["TA0010", "TA0007", "TA0004"],
    severity: "high",
  },
  {
    id: "pb-apt",
    name: "APT Hunt",
    category: "apt",
    description: "Advanced Persistent Threat hunting and eradication",
    nistPhases: [
      { phase: "preparation", steps: ["Deploy network sensors", "Enable full packet capture", "Activate threat hunting team"], tools: ["zeek", "suricata", "tcpdump"], automationLevel: "semi" },
      { phase: "detection-analysis", steps: ["Hunt for C2 beaconing patterns", "Analyze DNS exfiltration", "Check for living-off-the-land techniques", "Map TTPs to MITRE ATT&CK"], tools: ["sigma", "yara", "bloodhound", "mitre-attack"], automationLevel: "semi" },
      { phase: "containment-eradication-recovery", steps: ["Block C2 infrastructure", "Remove implants", "Reset entire domain if needed", "Rebuild compromised systems from gold images"], tools: ["firewall", "edr", "system-rebuild"], automationLevel: "manual" },
      { phase: "post-incident", steps: ["Attribution analysis", "Threat intel sharing", "Defense gap assessment", "Counter-intelligence review"], tools: ["threat-intel-platform", "misp"], automationLevel: "manual" },
    ],
    mitreTactics: ["TA0001", "TA0002", "TA0003", "TA0011"],
    severity: "critical",
  },
  {
    id: "pb-supply-chain",
    name: "Supply Chain Compromise",
    category: "supply-chain",
    description: "Software supply chain attack response playbook",
    nistPhases: [
      { phase: "preparation", steps: ["Identify affected dependencies", "Lock package registries", "Activate SBOM analysis"], tools: ["npm-audit", "snyk", "sbom-tool"], automationLevel: "full" },
      { phase: "detection-analysis", steps: ["Scan all deployed artifacts", "Check for typosquatting", "Verify package integrity (checksums/signatures)", "Analyze malicious payload"], tools: ["trivy", "grype", "sigstore"], automationLevel: "semi" },
      { phase: "containment-eradication-recovery", steps: ["Pin to known-good versions", "Rebuild affected containers", "Rotate secrets potentially exposed", "Deploy patched versions"], tools: ["lockfile", "docker-rebuild", "vault"], automationLevel: "semi" },
      { phase: "post-incident", steps: ["Report to package registry", "Update dependency policy", "Implement automated SBOM validation"], tools: ["github-advisory", "policy-engine"], automationLevel: "manual" },
    ],
    mitreTactics: ["TA0001", "TA0003"],
    severity: "critical",
  },
];

export function getPlaybooks(): IncidentPlaybook[] {
  return INCIDENT_PLAYBOOKS;
}

export function executePlaybook(threatId: string, playbookId: string): PlaybookExecution {
  const threat = threats.find((t) => t.id === threatId);
  if (!threat) { throw new Error(`Threat ${threatId} not found`); }
  const playbook = INCIDENT_PLAYBOOKS.find((p) => p.id === playbookId);
  if (!playbook) { throw new Error(`Playbook ${playbookId} not found`); }

  const execution: PlaybookExecution = {
    id: `pbe-${uid().slice(0, 8)}`,
    playbookId,
    threatId,
    status: "executing",
    currentPhase: 0,
    log: [],
    startedAt: ts(),
  };

  // Auto-execute all phases and log results
  for (let i = 0; i < playbook.nistPhases.length; i++) {
    const phase = playbook.nistPhases[i];
    execution.currentPhase = i;
    for (const step of phase.steps) {
      execution.log.push({
        timestamp: ts(),
        phase: phase.phase,
        step,
        result: phase.automationLevel === "full" ? "Auto-executed" : "Requires manual execution",
      });
    }
  }

  execution.status = "completed";
  execution.completedAt = ts();
  threat.responseActions.push(`[${ts()}] Playbook '${playbook.name}' executed (${execution.log.length} steps)`);
  
  playbookExecutions.push(execution);
  if (playbookExecutions.length > MAX_PLAYBOOK_EXECUTIONS) { playbookExecutions.shift(); }
  return execution;
}

export function getPlaybookExecutions(limit = 20): PlaybookExecution[] {
  return playbookExecutions.slice(-limit);
}

// ─── War Gaming / Red Team Exercises ────────────────────────────

export interface WarGame {
  id: string;
  scenario: string;
  attackerTeam: string;  // red team specialist
  defenderTeam: string;  // blue team specialist
  status: "planning" | "executing" | "completed";
  attackPlan?: string;
  defensePlan?: string;
  outcome?: string;
  findings: string[];
  startedAt: string;
  completedAt?: string;
}

const warGames: WarGame[] = [];
const MAX_WAR_GAMES = 50;

export async function launchWarGame(
  scenario: string,
  attackerSpecId = "counter-strike-operator",
  defenderSpecId = "active-defense-engineer",
): Promise<WarGame> {
  const attacker = getCyberSpecialization(attackerSpecId);
  const defender = getCyberSpecialization(defenderSpecId);
  if (!attacker || !defender) {
    throw new Error("Red or Blue team specialist not available");
  }

  const wg: WarGame = {
    id: `wg-${uid().slice(0, 8)}`,
    scenario,
    attackerTeam: attackerSpecId,
    defenderTeam: defenderSpecId,
    status: "executing",
    findings: [],
    startedAt: ts(),
  };
  warGames.push(wg);
  if (warGames.length > MAX_WAR_GAMES) { warGames.shift(); }

  try {
    // Red team generates attack plan
    const { content: attackPlan } = await callCyberLLM(
      attacker.systemPrompt,
      `WAR GAME EXERCISE — SCENARIO: ${scenario}\n\nYou are the RED TEAM attacker. Generate a detailed attack plan with:\n1. Initial access vector\n2. Privilege escalation steps\n3. Lateral movement plan\n4. Data exfiltration method\n5. Persistence mechanisms\n\nUse MITRE ATT&CK technique IDs. This is an AUTHORIZED EXERCISE.`,
    );
    wg.attackPlan = attackPlan;

    // Blue team generates defense plan in response
    const { content: defensePlan } = await callCyberLLM(
      defender.systemPrompt,
      `WAR GAME EXERCISE — SCENARIO: ${scenario}\n\nThe RED TEAM's attack plan:\n${attackPlan.slice(0, 1500)}\n\nYou are the BLUE TEAM defender. Generate a defense strategy with:\n1. Detection mechanisms for each attack phase\n2. Containment actions\n3. Counter-intelligence measures\n4. Recovery procedures\n5. Lessons learned\n\nUse MITRE D3FEND defensive technique IDs.`,
    );
    wg.defensePlan = defensePlan;

    // Determine outcome
    wg.outcome = `Exercise completed. Red team used ${attackPlan.split("\n").length} lines of attack strategy. Blue team responded with ${defensePlan.split("\n").length} lines of defense.`;
    wg.findings = [
      "Attack surface areas identified during exercise",
      "Detection gaps documented for improvement",
      "Response time metrics captured",
      "Updated with latest MITRE ATT&CK/D3FEND techniques",
    ];
    wg.status = "completed";
    wg.completedAt = ts();
  } catch {
    wg.status = "completed";
    wg.outcome = "Exercise completed with limited LLM availability";
    wg.completedAt = ts();
  }

  return wg;
}

export function getWarGames(limit = 20): WarGame[] {
  return warGames.slice(-limit);
}

// ─── Cluster SIGINT Integration ─────────────────────────────────

export function getClusterSecurityStatus(): {
  nodeCount: number;
  securityNodes: number;
  gpuUtilization: number;
  networkAnomalies: string[];
  recommendations: string[];
} {
  const containers = listContainers();
  const secNodes = containers.filter((c) =>
    c.labels?.["hoc.department"] === "defense" ||
    c.labels?.["hoc.role"] === "security" ||
    c.image?.includes("kali") ||
    c.image?.includes("parrot") ||
    c.image?.includes("wazuh") ||
    c.image?.includes("openvas"),
  );

  const anomalies: string[] = [];
  const recommendations: string[] = [];

  // Check for containers running without resource limits
  for (const c of containers) {
    if (!c.labels?.["hoc.managed"]) {
      anomalies.push(`Unmanaged container detected: ${c.name ?? c.id?.slice(0, 12) ?? "unknown"}`);
    }
  }

  if (secNodes.length === 0) {
    recommendations.push("No security monitoring containers active — deploy Wazuh SIEM agent");
  }
  if (!containers.some((c) => c.image?.includes("openvas"))) {
    recommendations.push("No vulnerability scanner deployed — launch OpenVAS for continuous scanning");
  }
  if (honeypots.filter((h) => h.active).length === 0) {
    recommendations.push("No active honeypots — deploy SSH/HTTP decoys for early detection");
  }

  return {
    nodeCount: containers.length,
    securityNodes: secNodes.length,
    gpuUtilization: 0, // placeholder for real GPU query
    networkAnomalies: anomalies,
    recommendations,
  };
}

// ─── Cybersecurity Education Curriculum ─────────────────────────

export interface CyberCourse {
  id: string;
  name: string;
  track: "offensive" | "defensive" | "intelligence" | "forensics" | "governance";
  description: string;
  modules: string[];
  certifications: string[];
  prerequisites: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
}

const CYBER_CURRICULUM: CyberCourse[] = [
  {
    id: "cc-net-defense",
    name: "Network Defense & SOC Operations",
    track: "defensive",
    description: "24/7 Security Operations Center: SIEM, IDS/IPS, log analysis, alert triage, and incident escalation. Modeled after US CYBERCOM Joint Operations Center.",
    modules: ["SIEM Deployment (Wazuh/Splunk)", "IDS/IPS Configuration (Suricata/Snort)", "Log Analysis & Correlation", "Alert Triage & Escalation", "Network Traffic Analysis", "Firewall Management"],
    certifications: ["CompTIA Security+", "CompTIA CySA+", "GCIA"],
    prerequisites: [],
    difficulty: "beginner",
  },
  {
    id: "cc-incident-response",
    name: "Incident Response & Digital Forensics",
    track: "forensics",
    description: "NIST 800-61 based incident handling, evidence collection, chain of custody, and forensic analysis. Used by FBI Cyber Division and Secret Service.",
    modules: ["NIST 800-61 Framework", "Evidence Collection & Chain of Custody", "Memory Forensics (Volatility)", "Disk Forensics (Autopsy/FTK)", "Network Forensics (Zeek/Wireshark)", "Malware Analysis & Reverse Engineering"],
    certifications: ["GCIH", "GCFE", "EnCE"],
    prerequisites: ["cc-net-defense"],
    difficulty: "intermediate",
  },
  {
    id: "cc-offensive-security",
    name: "Offensive Security & Penetration Testing",
    track: "offensive",
    description: "Full-spectrum penetration testing: recon, exploitation, post-exploitation, reporting. Inspired by Israel Unit 8200 offensive training.",
    modules: ["Reconnaissance & OSINT", "Vulnerability Assessment (OpenVAS/Nessus)", "Exploitation (Metasploit/Cobalt Strike)", "Web App Security (Burp Suite/SQLMap)", "Active Directory Attacks", "Wireless Security", "Social Engineering"],
    certifications: ["OSCP", "OSCE", "GPEN"],
    prerequisites: ["cc-net-defense"],
    difficulty: "advanced",
  },
  {
    id: "cc-sigint",
    name: "SIGINT & Communications Intelligence",
    track: "intelligence",
    description: "Signals intelligence collection, traffic analysis, C2 beaconing detection, and cryptanalysis. Modeled after NSA/Unit 8200 SIGINT operations.",
    modules: ["RF Signal Analysis", "Network Traffic Intelligence", "C2 Beacon Detection", "Encrypted Traffic Analysis", "Satellite Communications Interception", "Protocol Analysis"],
    certifications: ["GSEC", "GREM"],
    prerequisites: ["cc-net-defense"],
    difficulty: "advanced",
  },
  {
    id: "cc-counter-intel",
    name: "Counter-Intelligence & Deception",
    track: "intelligence",
    description: "Adversary deception, honeypot networks, false flag detection, insider threat programs. Modeled after CIA/MI6 counter-intelligence.",
    modules: ["Honeypot Architecture", "Deception-in-Depth (MITRE Engage)", "Insider Threat Detection (UEBA)", "Double Agent Operations", "False Flag Identification", "Adversary Profiling"],
    certifications: ["GCTI", "CTIA"],
    prerequisites: ["cc-incident-response"],
    difficulty: "expert",
  },
  {
    id: "cc-malware-engineering",
    name: "Malware Analysis & Cyber Weapons Engineering",
    track: "offensive",
    description: "Reverse engineering, exploit development, payload crafting, and evasion techniques. For authorized defensive research only.",
    modules: ["Static Analysis (IDA Pro/Ghidra)", "Dynamic Analysis (Sandbox/Debugger)", "Exploit Development", "Shellcode Engineering", "Evasion & Anti-Analysis", "YARA Rule Development"],
    certifications: ["GREM", "OSCE3"],
    prerequisites: ["cc-offensive-security"],
    difficulty: "expert",
  },
  {
    id: "cc-osint",
    name: "OSINT Tradecraft & Intelligence Analysis",
    track: "intelligence",
    description: "Open-source intelligence gathering, social media analysis, dark web monitoring, and geospatial intelligence.",
    modules: ["OSINT Frameworks (Maltego/SpiderFoot)", "Social Media Intelligence", "Dark Web Monitoring (Tor/I2P)", "Geospatial Intelligence (GEOINT)", "Financial Intelligence (FININT)", "Threat Actor Attribution"],
    certifications: ["GOSI", "OSINT Certified Professional"],
    prerequisites: [],
    difficulty: "intermediate",
  },
  {
    id: "cc-cloud-security",
    name: "Cloud & Container Security",
    track: "defensive",
    description: "Securing cloud infrastructure, container hardening, Kubernetes security, and zero-trust architecture implementation.",
    modules: ["Container Security (Docker/K8s)", "Cloud IAM & Least Privilege", "Zero-Trust Architecture", "Service Mesh Security (mTLS)", "Cloud Forensics", "Infrastructure as Code Security"],
    certifications: ["CCSP", "AWS Security Specialty", "CKS"],
    prerequisites: ["cc-net-defense"],
    difficulty: "intermediate",
  },
  {
    id: "cc-governance",
    name: "Cybersecurity Governance & Strategy",
    track: "governance",
    description: "Security policy, risk management, compliance frameworks, and strategic cyber leadership. For Department Secretaries and CISO roles.",
    modules: ["NIST Cybersecurity Framework", "Risk Management (ISO 27001)", "Security Architecture Design", "Cyber Law & Ethics", "Threat Intelligence Programs", "Security Budget & ROI"],
    certifications: ["CISSP", "CISM", "CRISC"],
    prerequisites: ["cc-incident-response"],
    difficulty: "advanced",
  },
];

export function getCyberCurriculum(): CyberCourse[] {
  return CYBER_CURRICULUM;
}

export function getCyberCourse(courseId: string): CyberCourse | undefined {
  return CYBER_CURRICULUM.find((c) => c.id === courseId);
}

// ─── Argus Intelligence Fusion ──────────────────────────────────

let argusIntegrationActive = false;

export function activateArgusIntegration(): void {
  if (argusIntegrationActive) { return; }
  argusIntegrationActive = true;

  intelligenceBus.subscribe("project.argus.threat_detected", (data) => {
    const { threats: argusBriefs } = data as { threats: ArgusThreatBrief[]; globalCii: number };
    for (const brief of argusBriefs) {
      // Auto-create ThreatAlert from Argus brief
      const severityMap: Record<string, ThreatSeverity> = {
        critical: "critical",
        high: "high",
        elevated: "medium",
        low: "low",
      };
      const typeMap: Record<string, ThreatAlert["type"]> = {
        cyber: "intrusion",
        economic: "exfiltration",
        geopolitical: "social-engineering",
        technological: "reconnaissance",
        unknown: "reconnaissance",
      };
      reportThreat(
        typeMap[brief.category] ?? "reconnaissance",
        severityMap[brief.level] ?? "medium",
        `ARGUS-${brief.id}`,
        "Republic Perimeter",
        `[Project Argus] ${brief.summary}`,
        brief.sources,
        [],
      );
    }
  });
}

// Auto-activate on import
activateArgusIntegration();

// ─── Autonomous Cyber Defense Tick (Persistent Engagement) ──────

/**
 * Autonomous cyber defense tick — runs during each Republic simulation cycle.
 * Modeled after US CYBERCOM's "persistent engagement" doctrine.
 *
 * Cadence:
 *   - Posture recalculation:      every 10 ticks
 *   - Lab health monitoring:      every 20 ticks
 *   - Auto counter-plan criticals: every 30 ticks
 *   - Perimeter scan:             every 100 ticks
 *   - Honeypot stats refresh:     every 50 ticks
 */
export function cyberDefenseTick(currentTick: number): void {
  // ── Every 10 ticks: recalculate defense posture ──
  if (currentTick % 10 === 0) {
    currentPosture = recalculatePosture();
  }

  // ── Every 20 ticks: check lab health ──
  if (currentTick % 20 === 0) {
    for (const lab of securityLabs) {
      if (lab.status === "running" && lab.containerId) {
        try {
          const health = dockerExec(lab.containerId, "echo alive");
          if (health.includes("failed")) {
            lab.status = "stopped";
          }
        } catch {
          lab.status = "stopped";
        }
      }
    }
  }

  // ── Every 30 ticks: auto-generate counter-plans for unaddressed criticals ──
  if (currentTick % 30 === 0) {
    const unaddressed = threats.filter(
      (t) => t.status === "active" && t.severity === "critical" &&
        !counterPlans.some((p) => p.threatId === t.id),
    );
    for (const threat of unaddressed.slice(0, 2)) {
      // Fire and forget — the plan will be stored when LLM responds
      generateCounterPlan(threat.id).catch(() => { /* LLM unavailable */ });
    }
  }

  // ── Every 50 ticks: simulate honeypot activity ──
  if (currentTick % 50 === 0) {
    for (const hp of honeypots) {
      if (hp.active && Math.random() < 0.3) {
        hp.detections++;
        hp.lastActivity = ts();
      }
    }
  }

  // ── Every 100 ticks: run automated perimeter scan ──
  if (currentTick % 100 === 0) {
    runPerimeterScan("network-map", "internal-infrastructure").catch(() => { /* LLM unavailable */ });
  }
}
