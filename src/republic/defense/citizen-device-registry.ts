/**
 * Citizen Device Registry
 *
 * Persistent device inventory for Republic citizens.
 * Tracks device specs, vulnerability posture, and remediation status.
 *
 * Data flow:
 *   HPICS device scans → registered here → correlated with citizen IDs
 *   → posture scores calculated → remediation tracked per CVE per device
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeviceRecord {
  id: string;
  citizenId: string;
  deviceName: string;
  deviceType: "phone" | "tablet" | "laptop" | "desktop" | "server" | "iot" | "unknown";
  osName: string;
  osVersion: string;
  manufacturer: string;
  model: string;
  installedApps: Array<{ name: string; version?: string }>;
  vulnerabilityCount: number;
  criticalCount: number;
  riskLevel: "critical" | "high" | "medium" | "low" | "secure";
  postureScore: number; // 0-100
  lastScanAt: number;
  lastScanResults: unknown;
  remediations: RemediationEntry[];
  registeredAt: number;
}

export interface RemediationEntry {
  cveId: string;
  status: "pending" | "applied" | "verified" | "failed";
  patch: string;
  appliedAt: number | null;
  verifiedAt: number | null;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

const deviceRegistry = new Map<string, DeviceRecord>();

/** Index: citizen ID → device IDs */
const citizenDeviceIndex = new Map<string, Set<string>>();

// ─── Device Management ───────────────────────────────────────────────────────

/**
 * Register or update a device from HPICS scan results.
 */
export function registerDevice(params: {
  citizenId: string;
  deviceName?: string;
  deviceType?: DeviceRecord["deviceType"];
  osName: string;
  osVersion?: string;
  manufacturer?: string;
  model?: string;
  installedApps?: Array<{ name: string; version?: string }>;
  scanResults?: unknown;
  vulnerabilityCount?: number;
  criticalCount?: number;
  riskLevel?: string;
}): DeviceRecord {
  // Find existing device by citizen + OS + model, or create new
  const existingId = findExistingDevice(params.citizenId, params.osName, params.model ?? "");

  const id = existingId ?? `DEV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const vulnCount = params.vulnerabilityCount ?? 0;
  const critCount = params.criticalCount ?? 0;

  const riskLevel = (params.riskLevel as DeviceRecord["riskLevel"]) ??
    (critCount > 0 ? "critical" : vulnCount > 5 ? "high" : vulnCount > 2 ? "medium" : vulnCount > 0 ? "low" : "secure");

  const postureScore = calculatePosture(vulnCount, critCount);

  const existing = existingId ? deviceRegistry.get(existingId) : undefined;

  const device: DeviceRecord = {
    id,
    citizenId: params.citizenId,
    deviceName: params.deviceName ?? `${params.osName} ${params.model ?? "Device"}`,
    deviceType: params.deviceType ?? guessDeviceType(params.osName),
    osName: params.osName,
    osVersion: params.osVersion ?? "unknown",
    manufacturer: params.manufacturer ?? "unknown",
    model: params.model ?? "unknown",
    installedApps: params.installedApps ?? [],
    vulnerabilityCount: vulnCount,
    criticalCount: critCount,
    riskLevel,
    postureScore,
    lastScanAt: Date.now(),
    lastScanResults: params.scanResults,
    remediations: existing?.remediations ?? [],
    registeredAt: existing?.registeredAt ?? Date.now(),
  };

  deviceRegistry.set(id, device);

  // Update citizen index
  if (!citizenDeviceIndex.has(params.citizenId)) {
    citizenDeviceIndex.set(params.citizenId, new Set());
  }
  citizenDeviceIndex.get(params.citizenId)!.add(id);

  return device;
}

/**
 * Find existing device by citizen + OS + model.
 */
function findExistingDevice(citizenId: string, osName: string, model: string): string | null {
  const deviceIds = citizenDeviceIndex.get(citizenId);
  if (!deviceIds) { return null; }

  for (const devId of deviceIds) {
    const dev = deviceRegistry.get(devId);
    if (dev && dev.osName === osName && dev.model === model) {
      return devId;
    }
  }
  return null;
}

function guessDeviceType(osName: string): DeviceRecord["deviceType"] {
  const os = osName.toLowerCase();
  if (os.includes("ios") || os.includes("android")) { return "phone"; }
  if (os.includes("ipados")) { return "tablet"; }
  if (os.includes("macos") || os.includes("windows") || os.includes("linux")) { return "laptop"; }
  return "unknown";
}

function calculatePosture(vulnCount: number, criticalCount: number): number {
  // Start at 100, deduct for vulnerabilities
  let score = 100;
  score -= criticalCount * 20; // -20 per critical
  score -= Math.min(vulnCount - criticalCount, 10) * 5; // -5 per non-critical, max 10
  return Math.max(0, Math.min(100, score));
}

// ─── Remediation Tracking ────────────────────────────────────────────────────

export function addRemediation(deviceId: string, cveId: string, patch: string): boolean {
  const device = deviceRegistry.get(deviceId);
  if (!device) { return false; }

  // Check if already exists
  const existing = device.remediations.find(r => r.cveId === cveId);
  if (existing) {
    existing.patch = patch;
    existing.status = "pending";
    return true;
  }

  device.remediations.push({
    cveId,
    status: "pending",
    patch,
    appliedAt: null,
    verifiedAt: null,
  });
  return true;
}

export function markRemediationApplied(deviceId: string, cveId: string): boolean {
  const device = deviceRegistry.get(deviceId);
  if (!device) { return false; }
  const rem = device.remediations.find(r => r.cveId === cveId);
  if (!rem) { return false; }
  rem.status = "applied";
  rem.appliedAt = Date.now();
  return true;
}

export function markRemediationVerified(deviceId: string, cveId: string): boolean {
  const device = deviceRegistry.get(deviceId);
  if (!device) { return false; }
  const rem = device.remediations.find(r => r.cveId === cveId);
  if (!rem) { return false; }
  rem.status = "verified";
  rem.verifiedAt = Date.now();
  return true;
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export function getDevice(deviceId: string): DeviceRecord | null {
  return deviceRegistry.get(deviceId) ?? null;
}

export function getCitizenDevices(citizenId: string): DeviceRecord[] {
  const ids = citizenDeviceIndex.get(citizenId);
  if (!ids) { return []; }
  return [...ids].map(id => deviceRegistry.get(id)).filter(Boolean) as DeviceRecord[];
}

export function listDevices(filter?: {
  riskLevel?: string;
  deviceType?: string;
  limit?: number;
}): DeviceRecord[] {
  let devices = [...deviceRegistry.values()];
  if (filter?.riskLevel) { devices = devices.filter(d => d.riskLevel === filter.riskLevel); }
  if (filter?.deviceType) { devices = devices.filter(d => d.deviceType === filter.deviceType); }
  devices.sort((a, b) => a.postureScore - b.postureScore); // Worst posture first
  return devices.slice(0, filter?.limit ?? 50);
}

export function getFleetOverview(): {
  totalDevices: number;
  byType: Record<string, number>;
  byRisk: Record<string, number>;
  avgPosture: number;
  citizensWithDevices: number;
  totalVulnerabilities: number;
  totalCritical: number;
  remediationStats: { pending: number; applied: number; verified: number; failed: number };
} {
  const byType: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  let totalPosture = 0;
  let totalVulns = 0;
  let totalCritical = 0;
  const remStats = { pending: 0, applied: 0, verified: 0, failed: 0 };

  for (const d of deviceRegistry.values()) {
    byType[d.deviceType] = (byType[d.deviceType] ?? 0) + 1;
    byRisk[d.riskLevel] = (byRisk[d.riskLevel] ?? 0) + 1;
    totalPosture += d.postureScore;
    totalVulns += d.vulnerabilityCount;
    totalCritical += d.criticalCount;
    for (const r of d.remediations) {
      remStats[r.status]++;
    }
  }

  return {
    totalDevices: deviceRegistry.size,
    byType,
    byRisk,
    avgPosture: deviceRegistry.size > 0 ? totalPosture / deviceRegistry.size : 100,
    citizensWithDevices: citizenDeviceIndex.size,
    totalVulnerabilities: totalVulns,
    totalCritical,
    remediationStats: remStats,
  };
}
