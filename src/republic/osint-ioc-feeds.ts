/**
 * OSINT IOC (Indicators of Compromise) Feed Engine
 *
 * Structured threat intelligence feed ingestion for cyber OSINT:
 * - AlienVault OTX (Open Threat Exchange) — IOC pulses
 * - AbuseIPDB — IP reputation data
 * - VirusTotal — File/URL/IP reputation (with API key)
 * - MISP — Malware Information Sharing Platform events
 *
 * All feeds normalize to a common ThreatIndicator format and publish
 * to the Intelligence Bus for correlation with other OSINT sources.
 */

import { uid, ts } from "./utils.js";
import { intelligenceBus } from "./intelligence-bus.js";

// ─── Types ──────────────────────────────────────────────────────

export type IOCType = "ip" | "domain" | "url" | "hash_md5" | "hash_sha1" | "hash_sha256" | "email" | "cidr" | "hostname" | "cve" | "yara";

export type IOCSource = "otx" | "abuseipdb" | "virustotal" | "misp" | "manual";

export interface ThreatIndicator {
  id: string;
  type: IOCType;
  value: string;
  source: IOCSource;
  /** Confidence 0-100 */
  confidence: number;
  /** Threat severity */
  severity: "low" | "medium" | "high" | "critical";
  /** Threat category (malware, c2, phishing, apt, etc.) */
  category: string;
  /** Tags from the feed */
  tags: string[];
  /** First seen timestamp */
  firstSeen: string;
  /** Last seen / last reported */
  lastSeen: string;
  /** When we ingested this IOC */
  ingestedAt: string;
  /** Additional context from the feed */
  context?: string;
  /** Related IOCs */
  relatedIndicators?: string[];
  /** MITRE ATT&CK technique IDs */
  mitreTechniques?: string[];
  /** Associated threat actor/APT group */
  threatActor?: string;
  /** Whether this is currently active/fresh */
  active: boolean;
}

export interface IOCFeedConfig {
  source: IOCSource;
  apiKey?: string;
  apiUrl?: string;
  enabled: boolean;
  pollIntervalSec: number;
  lastPollAt?: string;
  totalIndicators: number;
  errors: number;
}

// ─── State ──────────────────────────────────────────────────────

const indicators: ThreatIndicator[] = [];
const MAX_INDICATORS = 10000;
const feedConfigs = new Map<IOCSource, IOCFeedConfig>();
let pollTimers = new Map<IOCSource, ReturnType<typeof setInterval>>();

// ─── AlienVault OTX ─────────────────────────────────────────────

async function pollOTX(config: IOCFeedConfig): Promise<ThreatIndicator[]> {
  if (!config.apiKey) { return []; }
  try {
    const resp = await fetch("https://otx.alienvault.com/api/v1/pulses/subscribed?limit=20&modified_since=1d", {
      headers: { "X-OTX-API-KEY": config.apiKey },
    });
    if (!resp.ok) { return []; }
    const data = (await resp.json()) as {
      results?: Array<{
        id: string;
        name: string;
        tags: string[];
        indicators: Array<{
          indicator: string;
          type: string;
          title: string;
          description: string;
        }>;
        adversary?: string;
        attack_ids?: Array<{ id: string; name: string }>;
      }>;
    };

    const otxTypeMap: Record<string, IOCType> = {
      IPv4: "ip", IPv6: "ip", domain: "domain", hostname: "hostname",
      URL: "url", email: "email", FileHash_MD5: "hash_md5",
      FileHash_SHA1: "hash_sha1", FileHash_SHA256: "hash_sha256",
      CVE: "cve", CIDR: "cidr", YARA: "yara",
    };

    const items: ThreatIndicator[] = [];
    for (const pulse of (data.results ?? [])) {
      for (const ind of (pulse.indicators ?? []).slice(0, 50)) {
        const iocType = otxTypeMap[ind.type];
        if (!iocType) { continue; }
        items.push({
          id: `otx-${uid().slice(0, 8)}`,
          type: iocType,
          value: ind.indicator,
          source: "otx",
          confidence: 75,
          severity: pulse.tags.some((t) => /apt|critical|ransomware/i.test(t)) ? "high" : "medium",
          category: pulse.tags[0] ?? "general",
          tags: pulse.tags,
          firstSeen: ts(),
          lastSeen: ts(),
          ingestedAt: ts(),
          context: `Pulse: ${pulse.name} — ${ind.title || ind.description || ""}`.slice(0, 300),
          mitreTechniques: pulse.attack_ids?.map((a) => a.id),
          threatActor: pulse.adversary,
          active: true,
        });
      }
    }
    return items;
  } catch {
    config.errors++;
    return [];
  }
}

// ─── AbuseIPDB ──────────────────────────────────────────────────

async function pollAbuseIPDB(config: IOCFeedConfig): Promise<ThreatIndicator[]> {
  if (!config.apiKey) { return []; }
  try {
    const resp = await fetch(
      "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=75&limit=100",
      { headers: { Key: config.apiKey, Accept: "application/json" } },
    );
    if (!resp.ok) { return []; }
    const data = (await resp.json()) as {
      data?: Array<{
        ipAddress: string;
        abuseConfidenceScore: number;
        countryCode: string;
        lastReportedAt: string;
        totalReports: number;
      }>;
    };

    return (data.data ?? []).map((ip) => ({
      id: `abuse-${uid().slice(0, 8)}`,
      type: "ip" as IOCType,
      value: ip.ipAddress,
      source: "abuseipdb" as IOCSource,
      confidence: ip.abuseConfidenceScore,
      severity: ip.abuseConfidenceScore > 90 ? "critical" as const : ip.abuseConfidenceScore > 75 ? "high" as const : "medium" as const,
      category: "malicious_ip",
      tags: [`country:${ip.countryCode}`, `reports:${ip.totalReports}`],
      firstSeen: ts(),
      lastSeen: ip.lastReportedAt,
      ingestedAt: ts(),
      context: `AbuseIPDB: ${ip.totalReports} reports, confidence ${ip.abuseConfidenceScore}%, country ${ip.countryCode}`,
      active: true,
    }));
  } catch {
    config.errors++;
    return [];
  }
}

// ─── VirusTotal ─────────────────────────────────────────────────

async function queryVirusTotal(config: IOCFeedConfig, resource: string, type: "ip" | "domain" | "hash"): Promise<ThreatIndicator | null> {
  if (!config.apiKey) { return null; }
  const endpoints: Record<string, string> = {
    ip: `https://www.virustotal.com/api/v3/ip_addresses/${resource}`,
    domain: `https://www.virustotal.com/api/v3/domains/${resource}`,
    hash: `https://www.virustotal.com/api/v3/files/${resource}`,
  };

  try {
    const resp = await fetch(endpoints[type], {
      headers: { "x-apikey": config.apiKey },
    });
    if (!resp.ok) { return null; }
    const data = (await resp.json()) as {
      data?: {
        id: string;
        attributes?: {
          last_analysis_stats?: { malicious?: number; suspicious?: number; harmless?: number; undetected?: number };
          tags?: string[];
          reputation?: number;
        };
      };
    };

    const stats = data.data?.attributes?.last_analysis_stats;
    const malicious = stats?.malicious ?? 0;
    const total = (stats?.malicious ?? 0) + (stats?.suspicious ?? 0) + (stats?.harmless ?? 0) + (stats?.undetected ?? 0);
    const detectionRate = total > 0 ? malicious / total : 0;

    const iocType: IOCType = type === "hash" ? "hash_sha256" : type === "ip" ? "ip" : "domain";

    return {
      id: `vt-${uid().slice(0, 8)}`,
      type: iocType,
      value: resource,
      source: "virustotal",
      confidence: Math.round(detectionRate * 100),
      severity: detectionRate > 0.5 ? "critical" : detectionRate > 0.2 ? "high" : detectionRate > 0.05 ? "medium" : "low",
      category: type === "hash" ? "malware" : "infrastructure",
      tags: data.data?.attributes?.tags ?? [],
      firstSeen: ts(),
      lastSeen: ts(),
      ingestedAt: ts(),
      context: `VirusTotal: ${malicious}/${total} detections (${Math.round(detectionRate * 100)}%)`,
      active: detectionRate > 0.05,
    };
  } catch {
    config.errors++;
    return null;
  }
}

// ─── MISP ───────────────────────────────────────────────────────

async function pollMISP(config: IOCFeedConfig): Promise<ThreatIndicator[]> {
  if (!config.apiKey || !config.apiUrl) { return []; }
  try {
    const resp = await fetch(`${config.apiUrl}/events/restSearch`, {
      method: "POST",
      headers: {
        Authorization: config.apiKey,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ limit: 20, published: true, last: "1d" }),
    });
    if (!resp.ok) { return []; }
    const data = (await resp.json()) as {
      response?: Array<{
        Event: {
          id: string;
          info: string;
          threat_level_id: string;
          Attribute?: Array<{
            type: string;
            value: string;
            category: string;
            comment: string;
          }>;
          Tag?: Array<{ name: string }>;
        };
      }>;
    };

    const mispTypeMap: Record<string, IOCType> = {
      ip_dst: "ip", ip_src: "ip", domain: "domain", hostname: "hostname",
      url: "url", md5: "hash_md5", sha1: "hash_sha1", sha256: "hash_sha256",
      email_src: "email", email_dst: "email",
    };

    const severityMap: Record<string, ThreatIndicator["severity"]> = {
      "1": "critical", "2": "high", "3": "medium", "4": "low",
    };

    const items: ThreatIndicator[] = [];
    for (const evt of (data.response ?? [])) {
      const event = evt.Event;
      for (const attr of (event.Attribute ?? []).slice(0, 50)) {
        const iocType = mispTypeMap[attr.type];
        if (!iocType) { continue; }
        items.push({
          id: `misp-${uid().slice(0, 8)}`,
          type: iocType,
          value: attr.value,
          source: "misp",
          confidence: 80,
          severity: severityMap[event.threat_level_id] ?? "medium",
          category: attr.category,
          tags: event.Tag?.map((t) => t.name) ?? [],
          firstSeen: ts(),
          lastSeen: ts(),
          ingestedAt: ts(),
          context: `MISP Event ${event.id}: ${event.info} — ${attr.comment || ""}`.slice(0, 300),
          active: true,
        });
      }
    }
    return items;
  } catch {
    config.errors++;
    return [];
  }
}

// ─── Feed Orchestration ─────────────────────────────────────────

const FEED_POLLERS: Record<IOCSource, (config: IOCFeedConfig) => Promise<ThreatIndicator[]>> = {
  otx: pollOTX,
  abuseipdb: pollAbuseIPDB,
  virustotal: async () => [], // VT is query-based, not poll-based
  misp: pollMISP,
  manual: async () => [],
};

async function pollFeed(source: IOCSource): Promise<number> {
  const config = feedConfigs.get(source);
  if (!config || !config.enabled) { return 0; }

  const poller = FEED_POLLERS[source];
  const items = await poller(config);

  if (items.length > 0) {
    // Dedup against existing
    const existingValues = new Set(indicators.map((i) => `${i.type}:${i.value}`));
    const newItems = items.filter((i) => !existingValues.has(`${i.type}:${i.value}`));

    indicators.push(...newItems);
    while (indicators.length > MAX_INDICATORS) { indicators.shift(); }

    config.totalIndicators += newItems.length;
    config.lastPollAt = ts();

    // Publish to intelligence bus
    for (const item of newItems) {
      intelligenceBus.publish("osint.ioc_ingested", {
        source: item.source,
        type: item.type,
        value: item.value,
        severity: item.severity,
        confidence: item.confidence,
        threatActor: item.threatActor,
        timestamp: Date.now(),
      });
    }

    // Alert on critical IOCs
    const criticals = newItems.filter((i) => i.severity === "critical");
    for (const crit of criticals) {
      intelligenceBus.publish("osint.ioc_alert", {
        source: crit.source,
        type: crit.type,
        value: crit.value,
        category: crit.category,
        threatActor: crit.threatActor,
        context: crit.context,
        timestamp: Date.now(),
      });
    }
  }

  return items.length;
}

// ─── Public API ─────────────────────────────────────────────────

/** Configure an IOC feed */
export function configureIOCFeed(config: IOCFeedConfig): void {
  feedConfigs.set(config.source, config);
  if (config.enabled) {
    startFeedPolling(config.source);
  }
}

/** Start polling for a feed */
function startFeedPolling(source: IOCSource): void {
  if (pollTimers.has(source)) { return; }
  const config = feedConfigs.get(source);
  if (!config) { return; }

  const interval = setInterval(
    () => void pollFeed(source),
    (config.pollIntervalSec || 900) * 1000,
  );
  pollTimers.set(source, interval);
  void pollFeed(source); // Immediate first poll
}

/** Stop polling */
function stopFeedPolling(source: IOCSource): void {
  const timer = pollTimers.get(source);
  if (timer) {
    clearInterval(timer);
    pollTimers.delete(source);
  }
}

/** Query indicators by value */
export function queryIOC(value: string): ThreatIndicator[] {
  const lower = value.toLowerCase();
  return indicators.filter((i) => i.value.toLowerCase().includes(lower));
}

/** Query indicators by type */
export function queryIOCsByType(type: IOCType, limit = 50): ThreatIndicator[] {
  return indicators.filter((i) => i.type === type && i.active).slice(-limit);
}

/** Query by threat actor */
export function queryByThreatActor(actor: string): ThreatIndicator[] {
  const lower = actor.toLowerCase();
  return indicators.filter((i) => i.threatActor?.toLowerCase().includes(lower));
}

/** On-demand VirusTotal lookup */
export async function lookupVirusTotal(resource: string, type: "ip" | "domain" | "hash"): Promise<ThreatIndicator | null> {
  const config = feedConfigs.get("virustotal");
  if (!config) { return null; }
  const result = await queryVirusTotal(config, resource, type);
  if (result) {
    indicators.push(result);
    while (indicators.length > MAX_INDICATORS) { indicators.shift(); }
    config.totalIndicators++;
  }
  return result;
}

/** Add manual IOC */
export function addManualIOC(type: IOCType, value: string, severity: ThreatIndicator["severity"], category: string, context?: string): ThreatIndicator {
  const ioc: ThreatIndicator = {
    id: `manual-${uid().slice(0, 8)}`,
    type,
    value,
    source: "manual",
    confidence: 100,
    severity,
    category,
    tags: ["manual"],
    firstSeen: ts(),
    lastSeen: ts(),
    ingestedAt: ts(),
    context,
    active: true,
  };
  indicators.push(ioc);
  while (indicators.length > MAX_INDICATORS) { indicators.shift(); }
  return ioc;
}

/** Get feed status */
export function getIOCFeedStatus(): { feeds: IOCFeedConfig[]; totalIndicators: number; activeFeeds: number } {
  return {
    feeds: [...feedConfigs.values()],
    totalIndicators: indicators.length,
    activeFeeds: [...feedConfigs.values()].filter((f) => f.enabled).length,
  };
}

/** Stop all feeds */
export function stopAllIOCFeeds(): void {
  for (const [source] of pollTimers) {
    stopFeedPolling(source);
  }
  pollTimers = new Map();
}
