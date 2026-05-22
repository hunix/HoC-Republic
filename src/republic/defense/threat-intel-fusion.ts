/**
 * Threat Intelligence Fusion Center (TIFC)
 *
 * Continuous, automated aggregation of threat intelligence into a unified
 * threat picture with confidence scoring and automated escalation.
 *
 * Architecture:
 *   HPICS vulnerability feeds (NVD + CISA KEV)
 *     ↓ correlate against citizen device profiles
 *   Threat scoring model (CVSS × EPSS × exploitation × relevance)
 *     ↓ auto-escalate critical threats
 *   Citizen alert system via agent-messaging
 *     ↓ persist to sovereign memory
 *   Fusion analysis via graph-reasoning
 *
 * Key concepts:
 *   - ThreatScore: 0-100 composite risk score per CVE-citizen pair
 *   - ThreatFeed: periodic scan results from HPICS vulnerability-intelligence
 *   - FusionReport: cross-domain pattern analysis output
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThreatEntry {
  cveId: string;
  platform: string;
  cvssScore: number;
  epssScore: number;
  isExploitedInWild: boolean;
  severity: "critical" | "high" | "medium" | "low";
  attackVector: string;
  attackComplexity: string;
  description: string;
  affectedVersions: string[];
  exploitReferences: string[];
  discoveredAt: number;
  compositeScore: number; // 0-100 Republic Threat Score
}

export interface CitizenThreatProfile {
  citizenId: string;
  threatLevel: "critical" | "high" | "medium" | "low" | "none";
  activeThreats: ThreatEntry[];
  mitigatedThreats: number;
  lastScanAt: number;
  posture: number; // 0-100
}

export interface FusionReport {
  id: string;
  type: "pattern" | "correlation" | "anomaly" | "escalation";
  title: string;
  description: string;
  confidence: number;
  sources: string[];
  affectedCitizens: string[];
  recommendedActions: string[];
  timestamp: number;
}

// ─── In-Memory Threat Store ──────────────────────────────────────────────────

/** All known active threats indexed by CVE ID */
const threatStore = new Map<string, ThreatEntry>();

/** Per-citizen threat profiles */
const citizenProfiles = new Map<string, CitizenThreatProfile>();

/** Fusion reports */
const fusionReports: FusionReport[] = [];

/** Platforms of interest to the Republic */
const REPUBLIC_PLATFORMS = [
  "whatsapp", "telegram", "signal", "chrome", "firefox", "safari",
  "ios", "android", "macos", "windows", "linux", "instagram",
  "facebook", "linkedin",
];

// ─── Threat Scoring Model ────────────────────────────────────────────────────

/**
 * Calculate composite threat score (0-100).
 *
 * Formula:
 *   base = CVSS × 10 (0-100)
 *   epss_boost = EPSS × 20 (0-20 — probability of exploitation)
 *   wild_boost = exploited_in_wild ? 15 : 0
 *   complexity_mod = low_complexity ? 10 : high ? -5 : 0
 *   composite = clamp(base + epss_boost + wild_boost + complexity_mod, 0, 100)
 */
export function calculateThreatScore(entry: {
  cvssScore: number;
  epssScore: number;
  isExploitedInWild: boolean;
  attackComplexity: string;
}): number {
  const base = Math.min(entry.cvssScore * 10, 100);
  const epssBoost = entry.epssScore * 20;
  const wildBoost = entry.isExploitedInWild ? 15 : 0;
  const complexityMod =
    entry.attackComplexity === "LOW" ? 10 :
    entry.attackComplexity === "HIGH" ? -5 : 0;

  return Math.max(0, Math.min(100, base + epssBoost + wildBoost + complexityMod));
}

/**
 * Map composite score to severity level.
 */
function scoreToSeverity(score: number): ThreatEntry["severity"] {
  if (score >= 85) { return "critical"; }
  if (score >= 60) { return "high"; }
  if (score >= 35) { return "medium"; }
  return "low";
}

// ─── Threat Feed Ingestion ───────────────────────────────────────────────────

/**
 * Ingest vulnerability scan results from HPICS.
 * Called by the periodic cron or manually via RPC.
 */
export function ingestThreatFeed(vulns: Array<{
  cve_id?: string;
  cveId?: string;
  platform?: string;
  cvss_score?: number;
  cvssScore?: number;
  epss_score?: number;
  epssScore?: number;
  is_exploited_in_wild?: boolean;
  isExploitedInWild?: boolean;
  severity?: string;
  attack_vector?: string;
  attackVector?: string;
  attack_complexity?: string;
  attackComplexity?: string;
  description?: string;
  affected_versions?: string[];
  affectedVersions?: string[];
  exploit_references?: string[];
  exploitReferences?: string[];
}>): { ingested: number; critical: number; newThreats: string[] } {
  let critical = 0;
  const newThreats: string[] = [];

  for (const v of vulns) {
    const cveId = v.cve_id ?? v.cveId ?? `VULN-${Date.now()}`;
    const cvssScore = v.cvss_score ?? v.cvssScore ?? 0;
    const epssScore = v.epss_score ?? v.epssScore ?? 0;
    const isExploitedInWild = v.is_exploited_in_wild ?? v.isExploitedInWild ?? false;
    const attackComplexity = v.attack_complexity ?? v.attackComplexity ?? "UNKNOWN";

    const compositeScore = calculateThreatScore({
      cvssScore, epssScore, isExploitedInWild, attackComplexity,
    });

    const entry: ThreatEntry = {
      cveId,
      platform: v.platform ?? "unknown",
      cvssScore,
      epssScore,
      isExploitedInWild,
      severity: scoreToSeverity(compositeScore),
      attackVector: v.attack_vector ?? v.attackVector ?? "UNKNOWN",
      attackComplexity,
      description: v.description ?? "",
      affectedVersions: v.affected_versions ?? v.affectedVersions ?? [],
      exploitReferences: v.exploit_references ?? v.exploitReferences ?? [],
      discoveredAt: Date.now(),
      compositeScore,
    };

    if (!threatStore.has(cveId)) {
      newThreats.push(cveId);
    }
    threatStore.set(cveId, entry);

    if (entry.severity === "critical") {
      critical++;
    }
  }

  return { ingested: vulns.length, critical, newThreats };
}

// ─── Citizen Threat Correlation ──────────────────────────────────────────────

/**
 * Correlate threats against a citizen's device/platform profile.
 * In a real scenario this would look up the citizen's device registry.
 * For now, matches by platform keywords in citizen specialization/tools.
 */
export function correlateCitizenThreats(
  citizenId: string,
  citizenPlatforms: string[],
): CitizenThreatProfile {
  const platforms = new Set(citizenPlatforms.map(p => p.toLowerCase()));
  const activeThreats: ThreatEntry[] = [];

  for (const threat of threatStore.values()) {
    if (platforms.has(threat.platform.toLowerCase())) {
      activeThreats.push(threat);
    }
  }

  // Sort by composite score descending
  activeThreats.sort((a, b) => b.compositeScore - a.compositeScore);

  const maxScore = activeThreats.length > 0 ? activeThreats[0]!.compositeScore : 0;
  const profile: CitizenThreatProfile = {
    citizenId,
    threatLevel: activeThreats.length === 0 ? "none" : scoreToSeverity(maxScore),
    activeThreats: activeThreats.slice(0, 20), // Top 20
    mitigatedThreats: 0,
    lastScanAt: Date.now(),
    posture: Math.max(0, 100 - maxScore),
  };

  citizenProfiles.set(citizenId, profile);
  return profile;
}

// ─── Fusion Analysis ─────────────────────────────────────────────────────────

/**
 * Generate a fusion report correlating multiple intelligence sources.
 */
export function generateFusionReport(params: {
  type: FusionReport["type"];
  title: string;
  description: string;
  confidence: number;
  sources: string[];
  affectedCitizens: string[];
  recommendedActions: string[];
}): FusionReport {
  const report: FusionReport = {
    id: `FR-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    timestamp: Date.now(),
  };

  fusionReports.push(report);
  // Keep last 200 reports
  if (fusionReports.length > 200) {
    fusionReports.splice(0, fusionReports.length - 200);
  }

  return report;
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

/**
 * Get overall Republic threat posture.
 */
export function getRepublicThreatPosture(): {
  threatLevel: string;
  totalThreats: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  exploitedInWild: number;
  citizensAtRisk: number;
  totalCitizensProfiled: number;
  recentFusionReports: FusionReport[];
  platformBreakdown: Record<string, number>;
} {
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let exploitedInWild = 0;
  const platformBreakdown: Record<string, number> = {};

  for (const t of threatStore.values()) {
    if (t.severity === "critical") { criticalCount++; }
    else if (t.severity === "high") { highCount++; }
    else if (t.severity === "medium") { mediumCount++; }
    else { lowCount++; }
    if (t.isExploitedInWild) { exploitedInWild++; }
    platformBreakdown[t.platform] = (platformBreakdown[t.platform] ?? 0) + 1;
  }

  let citizensAtRisk = 0;
  for (const p of citizenProfiles.values()) {
    if (p.threatLevel !== "none" && p.threatLevel !== "low") {
      citizensAtRisk++;
    }
  }

  const overallLevel =
    criticalCount > 0 ? "critical" :
    highCount > 0 ? "high" :
    mediumCount > 0 ? "medium" : "low";

  return {
    threatLevel: overallLevel,
    totalThreats: threatStore.size,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    exploitedInWild,
    citizensAtRisk,
    totalCitizensProfiled: citizenProfiles.size,
    recentFusionReports: fusionReports.slice(-10),
    platformBreakdown,
  };
}

/**
 * Get all active threats, optionally filtered.
 */
export function getActiveThreats(filter?: {
  platform?: string;
  severity?: string;
  limit?: number;
}): ThreatEntry[] {
  let threats = [...threatStore.values()];

  if (filter?.platform) {
    threats = threats.filter(t => t.platform.toLowerCase() === filter.platform!.toLowerCase());
  }
  if (filter?.severity) {
    threats = threats.filter(t => t.severity === filter.severity);
  }

  threats.sort((a, b) => b.compositeScore - a.compositeScore);
  return threats.slice(0, filter?.limit ?? 50);
}

/**
 * Get a citizen's threat profile.
 */
export function getCitizenThreatProfile(citizenId: string): CitizenThreatProfile | null {
  return citizenProfiles.get(citizenId) ?? null;
}

/**
 * Get fusion reports.
 */
export function getFusionReports(limit = 20): FusionReport[] {
  return fusionReports.slice(-limit);
}

/** Get Republic platforms of interest. */
export function getRepublicPlatforms(): string[] {
  return [...REPUBLIC_PLATFORMS];
}
