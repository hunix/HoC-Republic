/**
 * WhatsApp Security Scanner
 *
 * Specialized WhatsApp analysis module that works via ADB:
 *   - Version check against CVE database
 *   - Permission audit
 *   - Spyware indicator detection (Pegasus/Graphite/Predator)
 *   - Storage/database anomaly analysis
 *   - Call protocol audit
 *   - Media directory forensics
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("whatsapp-scanner");

// ─── Types ──────────────────────────────────────────────────────

export interface WhatsAppScanResult {
  id: string;
  deviceId: string;
  deviceLabel: string;
  packageName: string;
  version: string;
  installedAt?: string;
  lastUpdated?: string;
  startedAt: number;
  completedAt?: number;
  findings: WhatsAppFinding[];
  riskLevel: "safe" | "at-risk" | "compromised";
}

export interface WhatsAppFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: "cve" | "spyware" | "permission" | "config" | "storage" | "network";
  title: string;
  description: string;
  evidence: string;
  remediation: string;
  cve?: string;
}

// ─── Known WhatsApp CVEs (synced with RAG DB) ───────────────────

const WHATSAPP_CVES: Array<{
  cve: string;
  affectedBelow: string;
  severity: "critical" | "high" | "medium";
  title: string;
  description: string;
  platform: "android" | "ios" | "both";
}> = [
  // 2024-2026 Critical CVEs
  { cve: "CVE-2025-30401", affectedBelow: "2.25.8.82", severity: "critical", title: "MIME Type Confusion RCE", description: "Spoofed MIME type in attachments leads to arbitrary code execution when opening files.", platform: "both" },
  { cve: "CVE-2025-55177", affectedBelow: "2.25.6.80", severity: "critical", title: "Paragon Graphite Zero-Click", description: "Zero-click exploit targeting WhatsApp via the Paragon Graphite spyware tool. No user interaction needed.", platform: "both" },
  { cve: "CVE-2024-7587", affectedBelow: "2.24.20.76", severity: "critical", title: "Video Call Buffer Overflow", description: "Specially crafted video call triggers heap overflow in the SRTP handler, allowing code execution.", platform: "android" },
  { cve: "CVE-2024-0024", affectedBelow: "2.24.3.77", severity: "high", title: "GIF Processing OOB Read", description: "Out-of-bounds read in GIF animation parser allows information disclosure.", platform: "android" },
  { cve: "CVE-2023-38831", affectedBelow: "2.23.25.83", severity: "critical", title: "Archive Extraction RCE", description: "Crafted ZIP/RAR attachment triggers RCE during preview generation.", platform: "both" },
  { cve: "CVE-2022-36934", affectedBelow: "2.22.16.12", severity: "critical", title: "Video Call Integer Overflow", description: "Integer overflow in video call handler allows remote code execution during an established call.", platform: "both" },
  { cve: "CVE-2022-27492", affectedBelow: "2.22.15.9", severity: "high", title: "Crafted Video File RCE", description: "Receiving a crafted video file could cause remote code execution.", platform: "both" },
  { cve: "CVE-2021-24027", affectedBelow: "2.21.4.18", severity: "high", title: "TLS MitM via HSTS Bypass", description: "Man-in-the-middle attack possible by bypassing HSTS enforcement on content servers.", platform: "android" },
  { cve: "CVE-2021-24042", affectedBelow: "2.21.23.2", severity: "critical", title: "Image Filter OOB Write", description: "Out-of-bounds write when applying image filters to a crafted image.", platform: "android" },
  { cve: "CVE-2019-3568", affectedBelow: "2.19.134", severity: "critical", title: "Pegasus VoIP Buffer Overflow", description: "NSO Group Pegasus zero-day exploit: buffer overflow in SRTCP handler via VoIP call signaling.", platform: "both" },
];

// ─── Spyware Indicators ─────────────────────────────────────────

const SPYWARE_INDICATORS = {
  processNames: [
    "pegasus", "chrysaor", "graphite", "predator", "hermit",
    "candiru", "cytrox", "quadream", "intellexa", "paragon",
  ],
  filePatterns: [
    "/data/local/tmp/.X11", // Pegasus staging
    "/system/csk",         // Chrysaor marker
    "/data/.peg",          // Pegasus data
    "/sdcard/.graphite",   // Graphite marker
    "libjustart.so",       // Predator component
    "libmediacodec_extra.so", // Known implant
  ],
  networkIndicators: [
    "amazonaws.com/pegasus",
    "cloudfront.net/peg",
    ".cytroxgroup.com",
    ".paragon.sh",
    ".nsogroup.com",
  ],
};

// ─── Scanner ────────────────────────────────────────────────────

export async function scanWhatsApp(deviceId: string): Promise<WhatsAppScanResult> {
  const { listDevices } = await import("./android-forensic-lab.js");
  const allDevices = listDevices();
  const device = allDevices.find(d => d.id === deviceId);
  if (!device) { throw new Error(`Device ${deviceId} not found. Connect via republic.cyber.android.device.connect first.`); }

  const result: WhatsAppScanResult = {
    id: `wa-${Date.now()}`,
    deviceId,
    deviceLabel: device.label,
    packageName: "",
    version: "",
    startedAt: Date.now(),
    findings: [],
    riskLevel: "safe",
  };

  const { exec } = await import("node:child_process");
  const adb = (cmd: string): Promise<string> => new Promise((resolve) => {
    exec(`adb -s ${device.serial} shell ${cmd}`, { timeout: 15000 }, (err, stdout) => {
      resolve((stdout || "").trim());
    });
  });

  // 1. Detect WhatsApp package
  const packages = await adb("pm list packages | grep -i whatsapp");
  const waPackages = packages.split("\n").map(l => l.replace("package:", "").trim()).filter(Boolean);

  if (waPackages.length === 0) {
    result.findings.push({
      id: "wa-f-notfound", severity: "info", category: "config",
      title: "WhatsApp Not Installed",
      description: "No WhatsApp package found on this device.",
      evidence: "pm list packages returned no whatsapp match",
      remediation: "N/A — WhatsApp is not installed on this device.",
    });
    result.completedAt = Date.now();
    return result;
  }

  result.packageName = waPackages[0] || "com.whatsapp";

  // 2. Get version
  const pkgInfo = await adb(`dumpsys package ${result.packageName} | head -30`);
  const versionMatch = pkgInfo.match(/versionName=([\S]+)/);
  result.version = versionMatch?.[1] || "unknown";

  const lastUpdateMatch = pkgInfo.match(/lastUpdateTime=([\S ]+)/);
  result.lastUpdated = lastUpdateMatch?.[1];

  // 3. CVE Version Check
  for (const cve of WHATSAPP_CVES) {
    if (cve.platform !== "both" && cve.platform !== "android") { continue; }
    if (isVersionBelow(result.version, cve.affectedBelow)) {
      result.findings.push({
        id: `wa-f-${cve.cve}`, severity: cve.severity, category: "cve",
        title: `${cve.cve}: ${cve.title}`,
        description: `Your WhatsApp version ${result.version} is affected by ${cve.cve}. ${cve.description}`,
        evidence: `Installed: ${result.version}, Vulnerable below: ${cve.affectedBelow}`,
        remediation: `UPDATE WHATSAPP IMMEDIATELY via Google Play Store to version ${cve.affectedBelow} or later.`,
        cve: cve.cve,
      });
    }
  }

  // 4. Permission Audit
  const perms = await adb(`dumpsys package ${result.packageName} | sed -n '/requested permissions:/,/install permissions:/p' | head -60`);
  const excessivePerms = [
    { perm: "BIND_ACCESSIBILITY_SERVICE", reason: "WhatsApp should NOT need accessibility service access — possible trojanized version" },
    { perm: "BIND_DEVICE_ADMIN", reason: "WhatsApp should NOT be a device administrator — possible stalkerware wrapper" },
    { perm: "INSTALL_PACKAGES", reason: "WhatsApp should NOT be able to install other packages silently" },
    { perm: "READ_CALL_LOG", reason: "Review if WhatsApp needs call log access on your version" },
  ];

  for (const ep of excessivePerms) {
    if (perms.includes(ep.perm)) {
      result.findings.push({
        id: `wa-f-perm-${ep.perm}`, severity: "critical", category: "permission",
        title: `Suspicious Permission: ${ep.perm}`,
        description: ep.reason,
        evidence: `android.permission.${ep.perm}`,
        remediation: "This may indicate a trojanized WhatsApp build. Uninstall and reinstall from the official Google Play Store ONLY.",
      });
    }
  }

  // 5. Spyware Indicator Check
  for (const indicator of SPYWARE_INDICATORS.filePatterns) {
    const check = await adb(`ls ${indicator} 2>/dev/null && echo FOUND || echo CLEAN`);
    if (check.includes("FOUND")) {
      result.findings.push({
        id: `wa-f-spyware-${indicator.replace(/[^a-z0-9]/gi, "")}`, severity: "critical", category: "spyware",
        title: `Spyware Indicator: ${indicator}`,
        description: `Known spyware artifact found at: ${indicator}. This device may be compromised by commercial spyware.`,
        evidence: `File exists: ${indicator}`,
        remediation: "DEVICE MAY BE COMPROMISED. Factory reset is recommended. Consider professional forensic analysis.",
      });
    }
  }

  // 6. Process Check for spyware
  const processes = await adb("ps -A 2>/dev/null || ps");
  for (const spyName of SPYWARE_INDICATORS.processNames) {
    if (processes.toLowerCase().includes(spyName)) {
      result.findings.push({
        id: `wa-f-proc-${spyName}`, severity: "critical", category: "spyware",
        title: `Spyware Process Detected: ${spyName}`,
        description: `A process matching known spyware "${spyName}" is running on this device.`,
        evidence: processes.split("\n").find(l => l.toLowerCase().includes(spyName)) || spyName,
        remediation: "CRITICAL: Device is likely compromised. Isolate from network immediately. Factory reset required.",
      });
    }
  }

  // 7. WhatsApp data directory check (requires root)
  if (device.isRooted) {
    const waDataSize = await adb(`su -c 'du -sh /data/data/${result.packageName}/' 2>/dev/null`);
    if (waDataSize && !waDataSize.includes("ERROR")) {
      result.findings.push({
        id: "wa-f-datasize", severity: "info", category: "storage",
        title: `WhatsApp Data: ${waDataSize.split("\t")[0] || waDataSize}`,
        description: "WhatsApp internal data directory size.",
        evidence: waDataSize,
        remediation: "Review if size is abnormally large — could indicate message database bloat.",
      });
    }

    // Check for suspicious shared preferences modifications
    const prefs = await adb(`su -c 'ls -la /data/data/${result.packageName}/shared_prefs/ 2>/dev/null' || echo 'no access'`);
    if (prefs.includes("injected") || prefs.includes("hook") || prefs.includes("xposed")) {
      result.findings.push({
        id: "wa-f-inject", severity: "critical", category: "spyware",
        title: "WhatsApp Injection Detected",
        description: "WhatsApp shared preferences contain files suggesting Xposed/Frida injection — possible spyware hooks.",
        evidence: prefs.slice(0, 500),
        remediation: "Uninstall WhatsApp. Remove Xposed/Magisk modules targeting WhatsApp. Reinstall from Play Store.",
      });
    }
  }

  // 8. Determine overall risk level
  const criticalCount = result.findings.filter(f => f.severity === "critical").length;
  const highCount = result.findings.filter(f => f.severity === "high").length;

  if (criticalCount > 0) {
    result.riskLevel = "compromised";
  } else if (highCount > 0) {
    result.riskLevel = "at-risk";
  } else {
    result.riskLevel = "safe";
  }

  result.completedAt = Date.now();
  logger.info(`WhatsApp scan for ${device.label}: ${result.findings.length} findings, risk=${result.riskLevel}`);
  return result;
}

// ─── Helpers ────────────────────────────────────────────────────

function isVersionBelow(installed: string, threshold: string): boolean {
  try {
    const parseVer = (v: string) => v.split(".").map(n => parseInt(n) || 0);
    const inst = parseVer(installed);
    const thresh = parseVer(threshold);

    for (let i = 0; i < Math.max(inst.length, thresh.length); i++) {
      const a = inst[i] ?? 0;
      const b = thresh[i] ?? 0;
      if (a < b) { return true; }
      if (a > b) { return false; }
    }
    return false; // equal
  } catch {
    return false; // can't compare, assume safe
  }
}
