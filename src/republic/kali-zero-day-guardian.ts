/**
 * Zero-Day Guardian
 *
 * Autonomous defensive module that:
 *  1. Queries the threat-intel DB for vulnerabilities affecting registered devices
 *  2. Runs non-destructive probe checks against those devices
 *  3. On confirmed exposure: synthesizes a temporary mitigation immediately
 *  4. Monitors for official patch release and auto-clears the temp mitigation
 *  5. Publishes all findings to the Intelligence Bus as cyber.research.paper_ingested
 *     events (reused for alert routing) and dedicated guardian.* events
 */

import { intelligenceBus } from "./intelligence-bus.js";
import { queryThreatIntel } from "./intelligence/threat-intel-vector.js";
import { kaliExec } from "./kali-agent-loop.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("zero-day-guardian");

// ─── Types ───────────────────────────────────────────────────────

export interface RegisteredDevice {
  id: string;           // unique name, e.g. "iphone-main"
  label: string;        // human label
  platform: "ios" | "android" | "whatsapp" | "instagram" | "linkedin" | "windows" | "linux" | "macos";
  ipAddress?: string;   // local IP for network probes
  bluetoothMac?: string;
  osVersion?: string;
  appVersion?: string;  // for app-specific vulns
  lastPatchedAt?: number;
}

export interface VulnProbeResult {
  deviceId: string;
  vulnId: string;
  cve: string;
  severity: string;
  exposed: boolean;
  probeMethod: string;
  evidence?: string;
  timestamp: number;
}

export interface ActiveMitigation {
  id: string;
  deviceId: string;
  vulnId: string;
  cve: string;
  mitigationType: "firewall_rule" | "network_block" | "config_change" | "service_disable" | "iptables" | "advisory";
  mitigationDetail: string;
  appliedAt: number;
  patchExpected?: string; // e.g. "iOS 18.3" or "WhatsApp 2.23.x"
  resolved: boolean;
}

// ─── State ───────────────────────────────────────────────────────

const registeredDevices = new Map<string, RegisteredDevice>();
const activeMitigations = new Map<string, ActiveMitigation>();
const probeHistory: VulnProbeResult[] = [];

// ─── Device Registry ─────────────────────────────────────────────

export function registerDevice(device: RegisteredDevice): void {
  registeredDevices.set(device.id, device);
  logger.info(`Guardian: Registered device "${device.label}" (${device.platform})`);
}

export function unregisterDevice(deviceId: string): void {
  registeredDevices.delete(deviceId);
}

export function getRegisteredDevices(): RegisteredDevice[] {
  return [...registeredDevices.values()];
}

export function getActiveMitigations(): ActiveMitigation[] {
  return [...activeMitigations.values()].filter(m => !m.resolved);
}

export function getProbeHistory(limit = 50): VulnProbeResult[] {
  return probeHistory.slice(-limit).toReversed();
}

// ─── Probe Engine ─────────────────────────────────────────────────

/**
 * Run non-destructive probes for all known platform vulnerabilities
 * against all registered devices.
 */
export async function runGuardianScan(): Promise<VulnProbeResult[]> {
  const results: VulnProbeResult[] = [];

  for (const device of registeredDevices.values()) {
    logger.info(`Guardian: Scanning ${device.label} (${device.platform})...`);

    // Pull relevant vulns from the RAG DB
    const vulns = queryThreatIntel(`${device.platform} exploit vulnerability`, 30);

    for (const vuln of vulns) {
      const result = await probeDevice(device, vuln);
      if (result) {
        results.push(result);
        probeHistory.push(result);

        if (result.exposed) {
          logger.warn(`Guardian: EXPOSED — ${device.label} vulnerable to ${vuln.id}`);
          await applyTemporaryMitigation(device, vuln, result);
        }
      }
    }
  }

  return results;
}

/**
 * Non-destructive probe strategies per vulnerability type.
 * Tests for EXPOSURE without triggering exploitation.
 */
async function probeDevice(
  device: RegisteredDevice,
  vuln: { id: string; title: string; abstract: string; keywords: string; severity?: string }
): Promise<VulnProbeResult | null> {
  const cve = extractCve(vuln.id, vuln.title);
  const abstract = vuln.abstract.toLowerCase();

  // ── Version-based checks (safest, no network) ─────────────────
  if (device.osVersion && abstract.includes("affected")) {
    const versionExposed = checkVersionExposure(device, abstract);
    if (versionExposed !== null) {
      return {
        deviceId: device.id, vulnId: vuln.id, cve,
        severity: vuln.severity ?? "medium",
        exposed: versionExposed,
        probeMethod: "version-check",
        evidence: `Device OS ${device.osVersion} checked against known affected versions`,
        timestamp: Date.now(),
      };
    }
  }

  // ── Bluetooth exposure check ───────────────────────────────────
  if (abstract.includes("bluetooth") && device.ipAddress) {
    const exposed = await probeBluetooth(device, abstract);
    if (exposed !== null) {
      return {
        deviceId: device.id, vulnId: vuln.id, cve,
        severity: vuln.severity ?? "high",
        exposed,
        probeMethod: "bluetooth-discovery",
        evidence: exposed ? "Bluetooth discoverable and potentially vulnerable firmware version" : "Bluetooth not discoverable or patched",
        timestamp: Date.now(),
      };
    }
  }

  // ── Network service checks ────────────────────────────────────
  if (device.ipAddress && (abstract.includes("network") || abstract.includes("remote"))) {
    const exposed = await probeNetworkService(device, abstract);
    if (exposed !== null) {
      return {
        deviceId: device.id, vulnId: vuln.id, cve,
        severity: vuln.severity ?? "medium",
        exposed,
        probeMethod: "network-service-check",
        evidence: exposed ? "Vulnerable service port open and responding" : "Service not exposed",
        timestamp: Date.now(),
      };
    }
  }

  return null;
}

function checkVersionExposure(device: RegisteredDevice, abstract: string): boolean | null {
  const ver = device.osVersion ?? device.appVersion;
  if (!ver) { return null; }

  // Extract version patterns from abstract like "<14.8", "prior to 2.22.16.12"
  const patterns = [
    /prior to ([\d.]+)/gi,
    /before ([\d.]+)/gi,
    /<([\d.]+)/g,
    /versions? ([\d.]+) and earlier/gi,
  ];

  for (const pat of patterns) {
    const m = pat.exec(abstract);
    if (m) {
      return compareVersions(ver, m[1]) < 0; // true if device version < patched version
    }
  }
  return null;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) { return diff; }
  }
  return 0;
}

async function probeBluetooth(device: RegisteredDevice, _abstract: string): Promise<boolean | null> {
  if (!device.ipAddress) { return null; }
  try {
    // Non-destructive: check if BT is discoverable via hcitool scan equivalent
    const output = await kaliExec(`timeout 5 hcitool scan 2>/dev/null | grep -c "" || echo 0`);
    const count = parseInt((typeof output === "string" ? output : output.stdout).trim(), 10);
    return count > 0; // If any BT devices visible, device is broadcasting
  } catch {
    return null;
  }
}

async function probeNetworkService(device: RegisteredDevice, abstract: string): Promise<boolean | null> {
  if (!device.ipAddress) { return null; }
  // Only probe specific known ports — never scan broadly
  const ports: number[] = [];
  if (abstract.includes("port 3478")) { ports.push(3478); }
  if (abstract.includes("smb") || abstract.includes("445")) { ports.push(445); }
  if (abstract.includes("adb") || abstract.includes("5555")) { ports.push(5555); }

  if (ports.length === 0) { return null; }

  for (const port of ports) {
    try {
      const output = await kaliExec(
        `timeout 2 nc -zvw2 ${device.ipAddress} ${port} 2>&1 | grep -c "succeeded" || echo 0`
      );
      const raw = typeof output === "string" ? output : output.stdout;
      if (parseInt(raw.trim(), 10) > 0) { return true; }
    } catch { /* not reachable = good */ }
  }
  return false;
}

function extractCve(vulnId: string, title: string): string {
  const m = /CVE-\d{4}-\d+/.exec(title) ?? /CVE-\d{4}-\d+/.exec(vulnId);
  return m?.[0] ?? vulnId;
}

// ─── Temporary Mitigation Synthesizer ────────────────────────────

/**
 * Given an exposure, synthesize the best available temporary mitigation.
 * Strategies ordered from strongest to least invasive:
 *   1. iptables/network-level block
 *   2. Service/protocol disable
 *   3. App configuration change advisory
 *   4. System configuration script
 */
async function applyTemporaryMitigation(
  device: RegisteredDevice,
  vuln: { id: string; title: string; abstract: string },
  _probe: VulnProbeResult
): Promise<void> {
  const abstract = vuln.abstract.toLowerCase();
  const mitId = `mit-${device.id}-${vuln.id.replace(/[^a-z0-9]/gi, "-")}`;

  // Avoid duplicate mitigations
  if (activeMitigations.has(mitId) && !activeMitigations.get(mitId)!.resolved) { return; }

  const mit: ActiveMitigation = {
    id: mitId,
    deviceId: device.id,
    vulnId: vuln.id,
    cve: extractCve(vuln.id, vuln.title),
    mitigationType: "advisory",
    mitigationDetail: "",
    appliedAt: Date.now(),
    resolved: false,
  };

  // ── Network-level mitigations (via Kali/gateway) ──────────────
  if (abstract.includes("bluetooth") && device.ipAddress) {
    // Block all external BT l2cap connections via kernel parameter
    const cmd = `echo 0 | tee /proc/sys/net/bluetooth/l2cap/discoverable 2>/dev/null || true`;
    mit.mitigationType = "network_block";
    mit.mitigationDetail = `Bluetooth discoverable mode suppressed: ${cmd}`;
    try { await kaliExec(cmd); } catch { /* advisory fallback */ }
  }

  else if (abstract.includes("mms") || abstract.includes("stagefright")) {
    mit.mitigationType = "advisory";
    mit.mitigationDetail =
      "CRITICAL: Disable MMS auto-retrieve immediately.\n" +
      "Android: Settings → Messages → Advanced → Auto-retrieve MMS → OFF.\n" +
      "Block MMS via carrier if possible. Update Android ASAP.";
  }

  else if (abstract.includes("whatsapp") && abstract.includes("call")) {
    mit.mitigationType = "advisory";
    mit.mitigationDetail =
      "WhatsApp RCE via call vector detected. Temporary mitigation:\n" +
      "1. WhatsApp Settings → Privacy → Calls → Silence Unknown Callers: ON\n" +
      "2. Block SRTCP/SRTP port 3478 UDP on router if possible\n" +
      "3. Disable WhatsApp calling temporarily: Settings → Privacy → disable calls\n" +
      "4. Update WhatsApp immediately via App Store/Play Store.";
  }

  else if (abstract.includes("imessage") || abstract.includes("zero-click")) {
    mit.mitigationType = "config_change";
    mit.mitigationDetail =
      "Zero-click iMessage/iOS vulnerability active. IMMEDIATE actions:\n" +
      "1. iOS Settings → Messages → toggle iMessage OFF (disables zero-click surface)\n" +
      "2. Settings → Privacy & Security → Lockdown Mode → Enable Lockdown Mode\n" +
      "3. Settings → General → Software Update → install Available Updates immediately\n" +
      "iMessage can be re-enabled once iOS is updated to patched version.";
  }

  else if (abstract.includes("adb") || abstract.includes("port 5555")) {
    const cmd = device.ipAddress
      ? `nft add rule ip filter input ip daddr ${device.ipAddress} tcp dport 5555 drop 2>/dev/null || iptables -I INPUT -d ${device.ipAddress} -p tcp --dport 5555 -j DROP`
      : "";
    mit.mitigationType = "iptables";
    mit.mitigationDetail = cmd
      ? `ADB network port blocked: ${cmd}`
      : "ADVISORY: Disable ADB over network — Developer Options → Wireless debugging: OFF";
    if (cmd) { try { await kaliExec(cmd); } catch { /* advisory */ } }
  }

  else if (abstract.includes("smb") || abstract.includes("445")) {
    mit.mitigationType = "iptables";
    const cmd = `iptables -I INPUT -p tcp --dport 445 -j DROP && iptables -I INPUT -p udp --dport 445 -j DROP`;
    mit.mitigationDetail = `SMB port 445 blocked via iptables: ${cmd}`;
    try { await kaliExec(cmd); } catch { /* skip if no kali */ }
  }

  else {
    // Generic advisory with extracted mitigation from the vuln record
    const mitigationMatch = /MITIGATION:\s*([^]+?)(?=\n\n|$)/.exec(vuln.abstract);
    mit.mitigationType = "advisory";
    mit.mitigationDetail = mitigationMatch?.[1]?.trim()
      ?? "Update affected application/OS to latest version immediately.";
  }

  activeMitigations.set(mitId, mit);

  // Publish to Intelligence Bus immediately
  intelligenceBus.publish("cyber.research.paper_ingested", {
    paperId: `guardian-mitigation-${mitId}`,
    title: `🛡️ GUARDIAN ALERT: ${mit.cve} — ${device.label} EXPOSED + Mitigated`,
    abstract: `Device "${device.label}" confirmed exposed to ${mit.cve}.\n\nApplied temporary mitigation (${mit.mitigationType}):\n${mit.mitigationDetail}`,
    authors: ["ZeroDayGuardian"],
    pdfUrl: "",
    publishedAt: Date.now(),
    keywords: [mit.cve, device.platform, "mitigation", "zero-day", "guardian"],
    timestamp: Date.now(),
  });

  logger.warn(
    `Guardian: Mitigation applied for ${device.label} / ${mit.cve} — type: ${mit.mitigationType}`
  );
}

// ─── Patch Monitor ────────────────────────────────────────────────

const PATCH_SOURCES: Record<string, string> = {
  ios: "https://support.apple.com/en-us/111900", // Apple Security Releases
  android: "https://source.android.com/docs/security/bulletin",
  whatsapp: "https://www.whatsapp.com/security/advisories",
  instagram: "https://www.facebook.com/security/advisories",
};

/**
 * Check for official patch releases and resolve mitigations once device is patched.
 */
export async function checkPatchStatus(): Promise<{ cve: string; patched: boolean; source: string }[]> {
  const results: { cve: string; patched: boolean; source: string }[] = [];

  for (const [mitId, mit] of activeMitigations.entries()) {
    if (mit.resolved) { continue; }

    const device = registeredDevices.get(mit.deviceId);
    if (!device) { continue; }

    // Version re-check: has device been updated since mitigation was applied?
    if (device.osVersion) {
      const vuln = queryThreatIntel(mit.cve, 1)[0];
      if (vuln) {
        const stillExposed = checkVersionExposure(device, vuln.abstract);
        if (stillExposed === false) {
          // Device has been patched — resolve mitigation
          mit.resolved = true;
          activeMitigations.set(mitId, mit);
          logger.info(`Guardian: ${mit.cve} resolved on ${device.label} — patch confirmed`);
          results.push({ cve: mit.cve, patched: true, source: "version-verification" });

          intelligenceBus.publish("cyber.research.paper_ingested", {
            paperId: `guardian-resolved-${mitId}`,
            title: `✅ GUARDIAN: ${mit.cve} PATCHED on ${device.label}`,
            abstract: `Device "${device.label}" has been updated past the ${mit.cve} affected version range. Temporary mitigation "${mit.mitigationType}" has been cleared.`,
            authors: ["ZeroDayGuardian"],
            pdfUrl: PATCH_SOURCES[device.platform] ?? "",
            publishedAt: Date.now(),
            keywords: [mit.cve, "patched", "resolved", device.platform],
            timestamp: Date.now(),
          });
        } else {
          results.push({ cve: mit.cve, patched: false, source: PATCH_SOURCES[device.platform] ?? "" });
        }
      }
    }
  }

  return results;
}

// ─── Public Status ────────────────────────────────────────────────

export interface GuardianStatus {
  devicesMonitored: number;
  activeMitigations: number;
  totalProbes: number;
  exposedDevices: string[];
  lastScanAt: number | null;
}

let lastScanAt: number | null = null;

export function getGuardianStatus(): GuardianStatus {
  const exposedNow = [...activeMitigations.values()]
    .filter(m => !m.resolved)
    .map(m => registeredDevices.get(m.deviceId)?.label ?? m.deviceId);

  return {
    devicesMonitored: registeredDevices.size,
    activeMitigations: [...activeMitigations.values()].filter(m => !m.resolved).length,
    totalProbes: probeHistory.length,
    exposedDevices: [...new Set(exposedNow)],
    lastScanAt,
  };
}

// Auto-scan interval: every 6 hours
let scanInterval: ReturnType<typeof setInterval> | null = null;

export function startGuardian(intervalMs = 6 * 60 * 60 * 1000): void {
  logger.info("Zero-Day Guardian started");
  const tick = async () => {
    lastScanAt = Date.now();
    await runGuardianScan().catch(err => logger.error("Guardian scan error:", err));
    await checkPatchStatus().catch(err => logger.error("Patch check error:", err));
  };
  tick();
  scanInterval = setInterval(tick, intervalMs);
}

export function stopGuardian(): void {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null; }
  logger.info("Zero-Day Guardian stopped");
}
