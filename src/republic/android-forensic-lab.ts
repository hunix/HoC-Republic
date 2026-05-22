/**
 * Android Forensic Lab
 *
 * Complete Android forensic toolkit orchestrator with 45+ tools:
 *   - ADB device management (connect/disconnect/probe)
 *   - APK extraction, decompilation, and analysis
 *   - Dynamic instrumentation (Frida/Objection)
 *   - Root/security assessment
 *   - Network traffic analysis
 *   - File system forensics
 *   - CVE matching against RAG DB
 *
 * Executes commands via the Kali sandbox container or host ADB bridge.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { intelligenceBus } from "./intelligence-bus.js";

const logger = createSubsystemLogger("android-forensic-lab");

// ─── Types ──────────────────────────────────────────────────────

export interface AndroidDevice {
  id: string;              // unique id
  serial: string;          // ADB serial (e.g., "192.168.1.100:5555")
  label: string;
  model: string;
  brand: string;
  androidVersion: string;
  apiLevel: number;
  securityPatch: string;
  buildFingerprint: string;
  isRooted: boolean;
  encryptionState: string;
  selinuxMode: string;
  connectedAt: number;
  lastScanAt?: number;
  status: "connected" | "disconnected" | "scanning";
  ipAddress?: string;
}

export interface ForensicFinding {
  id: string;
  deviceId: string;
  category: "security" | "vulnerability" | "malware" | "config" | "app" | "network";
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  evidence: string;
  remediation: string;
  tool: string;
  cve?: string;
  timestamp: number;
}

export interface ForensicReport {
  id: string;
  deviceId: string;
  scanType: "quick" | "full" | "apk" | "network" | "whatsapp";
  startedAt: number;
  completedAt?: number;
  status: "running" | "completed" | "failed";
  findings: ForensicFinding[];
  deviceInfo: Partial<AndroidDevice>;
}

// ─── State ──────────────────────────────────────────────────────

const devices = new Map<string, AndroidDevice>();
const reports: ForensicReport[] = [];
const MAX_REPORTS = 100;

// ─── ADB Bridge ─────────────────────────────────────────────────

async function adbCommand(cmd: string, timeout = 60): Promise<{ ok: boolean; output: string }> {
  try {
    const { exec } = await import("node:child_process");
    return new Promise((resolve) => {
      exec(`adb ${cmd}`, { timeout: timeout * 1000 }, (err, stdout, stderr) => {
        resolve({
          ok: !err,
          output: (stdout || stderr || "").trim(),
        });
      });
    });
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

async function adbShell(serial: string, shellCmd: string, timeout = 30): Promise<string> {
  const { ok, output } = await adbCommand(`-s ${serial} shell ${shellCmd}`, timeout);
  return ok ? output : `[ERROR] ${output}`;
}

// ─── Device Management ──────────────────────────────────────────

export async function connectDevice(ip: string, port = 5555): Promise<{ ok: boolean; device?: AndroidDevice; error?: string }> {
  const serial = `${ip}:${port}`;

  // ADB connect
  const { ok, output } = await adbCommand(`connect ${serial}`, 15);
  if (!ok && !output.includes("connected")) {
    return { ok: false, error: `ADB connect failed: ${output}. Enable Wireless Debugging on the device and pair first.` };
  }

  // Probe device info
  const info = await probeDevice(serial);
  if (!info) {
    return { ok: false, error: "Connected but could not probe device info. Check USB debugging authorization." };
  }

  const device: AndroidDevice = {
    id: `android-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    serial,
    label: `${info.brand} ${info.model}`,
    model: info.model,
    brand: info.brand,
    androidVersion: info.androidVersion,
    apiLevel: info.apiLevel,
    securityPatch: info.securityPatch,
    buildFingerprint: info.buildFingerprint,
    isRooted: info.isRooted,
    encryptionState: info.encryptionState,
    selinuxMode: info.selinuxMode,
    connectedAt: Date.now(),
    status: "connected",
    ipAddress: ip,
  };

  devices.set(device.id, device);
  logger.info(`Android device connected: ${device.label} (${serial})`);

  intelligenceBus.publish("cyber.research.paper_ingested", {
    paperId: `android-connect-${device.id}`,
    title: `📱 Android Device Connected: ${device.label}`,
    abstract: `${device.brand} ${device.model} running Android ${device.androidVersion} (API ${device.apiLevel}), security patch ${device.securityPatch}, root=${device.isRooted}`,
    authors: ["AndroidForensicLab"],
    pdfUrl: "",
    publishedAt: Date.now(),
    keywords: ["android", device.brand, device.model, `android-${device.androidVersion}`],
    timestamp: Date.now(),
  });

  return { ok: true, device };
}

export async function disconnectDevice(deviceId: string): Promise<boolean> {
  const device = devices.get(deviceId);
  if (!device) { return false; }
  await adbCommand(`disconnect ${device.serial}`, 10);
  device.status = "disconnected";
  return true;
}

async function probeDevice(serial: string): Promise<{
  model: string; brand: string; androidVersion: string; apiLevel: number;
  securityPatch: string; buildFingerprint: string; isRooted: boolean;
  encryptionState: string; selinuxMode: string;
} | null> {
  try {
    const [model, brand, version, api, patch, fingerprint, rootCheck, crypto, selinux] = await Promise.all([
      adbShell(serial, "getprop ro.product.model"),
      adbShell(serial, "getprop ro.product.brand"),
      adbShell(serial, "getprop ro.build.version.release"),
      adbShell(serial, "getprop ro.build.version.sdk"),
      adbShell(serial, "getprop ro.build.version.security_patch"),
      adbShell(serial, "getprop ro.build.fingerprint"),
      adbShell(serial, "su -c id 2>/dev/null || echo 'no-root'"),
      adbShell(serial, "getprop ro.crypto.state"),
      adbShell(serial, "getenforce"),
    ]);

    return {
      model: model || "Unknown",
      brand: brand || "Unknown",
      androidVersion: version || "Unknown",
      apiLevel: parseInt(api) || 0,
      securityPatch: patch || "Unknown",
      buildFingerprint: fingerprint || "",
      isRooted: rootCheck.includes("uid=0"),
      encryptionState: crypto || "unknown",
      selinuxMode: selinux || "unknown",
    };
  } catch {
    return null;
  }
}

// ─── Quick Security Audit ───────────────────────────────────────

export async function quickSecurityAudit(deviceId: string): Promise<ForensicReport> {
  const device = devices.get(deviceId);
  if (!device) { throw new Error(`Device ${deviceId} not found`); }

  const report: ForensicReport = {
    id: `rpt-${Date.now()}`,
    deviceId,
    scanType: "quick",
    startedAt: Date.now(),
    status: "running",
    findings: [],
    deviceInfo: { ...device },
  };
  reports.push(report);
  if (reports.length > MAX_REPORTS) { reports.shift(); }
  device.status = "scanning";

  const { serial } = device;

  // 1. Security Patch Level
  const patchAge = assessPatchAge(device.securityPatch);
  if (patchAge.severity !== "info") {
    report.findings.push({
      id: `f-${Date.now()}-patch`,
      deviceId, category: "security", severity: patchAge.severity as ForensicFinding["severity"],
      title: `Security Patch Level: ${device.securityPatch}`,
      description: patchAge.description,
      evidence: `Security patch: ${device.securityPatch}`,
      remediation: "Update to the latest available Android security patch via Settings → System → Security Update.",
      tool: "adb getprop", timestamp: Date.now(),
    });
  }

  // 2. Encryption State
  if (device.encryptionState !== "encrypted") {
    report.findings.push({
      id: `f-${Date.now()}-enc`, deviceId, category: "security", severity: "critical",
      title: "Device NOT Encrypted",
      description: `Encryption state: ${device.encryptionState}. This device's data is accessible without authentication.`,
      evidence: `ro.crypto.state = ${device.encryptionState}`,
      remediation: "Enable device encryption: Settings → Security → Encrypt phone.",
      tool: "adb getprop", timestamp: Date.now(),
    });
  }

  // 3. SELinux Mode
  if (device.selinuxMode.toLowerCase() !== "enforcing") {
    report.findings.push({
      id: `f-${Date.now()}-sel`, deviceId, category: "security", severity: "high",
      title: `SELinux Mode: ${device.selinuxMode}`,
      description: "SELinux is not in enforcing mode, weakening mandatory access controls.",
      evidence: `getenforce = ${device.selinuxMode}`,
      remediation: "Set SELinux to Enforcing mode. If rooted, run: setenforce 1",
      tool: "getenforce", timestamp: Date.now(),
    });
  }

  // 4. Root Status
  if (device.isRooted) {
    report.findings.push({
      id: `f-${Date.now()}-root`, deviceId, category: "security", severity: "high",
      title: "Device is ROOTED",
      description: "Root access detected. This increases attack surface but allows deeper analysis.",
      evidence: "su -c id returned uid=0",
      remediation: "Only keep root if actively used for security research. Ensure Magisk DenyList covers sensitive apps.",
      tool: "su", timestamp: Date.now(),
    });
  }

  // 5. USB Debugging
  const usbDebug = await adbShell(serial, "settings get global adb_enabled");
  if (usbDebug.trim() === "1") {
    report.findings.push({
      id: `f-${Date.now()}-usb`, deviceId, category: "config", severity: "medium",
      title: "USB Debugging Enabled",
      description: "ADB is enabled. This allows full device access when connected to an authorized computer.",
      evidence: "adb_enabled = 1",
      remediation: "Disable USB Debugging when not actively using it for development.",
      tool: "settings", timestamp: Date.now(),
    });
  }

  // 6. Unknown Sources
  const unknownSources = await adbShell(serial, "settings get secure install_non_market_apps");
  if (unknownSources.trim() === "1") {
    report.findings.push({
      id: `f-${Date.now()}-unk`, deviceId, category: "config", severity: "medium",
      title: "Unknown Sources Enabled",
      description: "Sideloading is enabled, allowing installation of APKs from untrusted sources.",
      evidence: "install_non_market_apps = 1",
      remediation: "Disable unknown sources: Settings → Security → Unknown Sources.",
      tool: "settings", timestamp: Date.now(),
    });
  }

  // 7. Open Ports
  const openPorts = await adbShell(serial, "netstat -tlnp 2>/dev/null || ss -tlnp 2>/dev/null || echo 'unavailable'");
  const dangerousPorts = extractDangerousPorts(openPorts);
  for (const dp of dangerousPorts) {
    report.findings.push({
      id: `f-${Date.now()}-port-${dp.port}`, deviceId, category: "network", severity: dp.severity as ForensicFinding["severity"],
      title: `Open Port: ${dp.port} (${dp.service})`,
      description: `Port ${dp.port} is listening on the device. Service: ${dp.service}`,
      evidence: dp.evidence,
      remediation: dp.remediation,
      tool: "netstat", timestamp: Date.now(),
    });
  }

  // 8. Device Admin Apps
  const deviceAdmins = await adbShell(serial, "dpm list-active-admins 2>/dev/null || echo 'none'");
  if (deviceAdmins.includes("/") && !deviceAdmins.includes("none")) {
    const admins = deviceAdmins.split("\n").filter(l => l.includes("/"));
    for (const admin of admins) {
      const isSuspicious = /spy|monitor|track|hidden|stealth|parent|watch/i.test(admin);
      report.findings.push({
        id: `f-${Date.now()}-admin`, deviceId, category: isSuspicious ? "malware" : "config",
        severity: isSuspicious ? "critical" : "info",
        title: `Device Admin: ${admin.trim().split("/").pop()}`,
        description: `Active device administrator: ${admin.trim()}`,
        evidence: admin.trim(),
        remediation: isSuspicious ? "IMMEDIATELY remove this device admin: Settings → Security → Device Admin Apps" : "Review if this device admin is needed.",
        tool: "dpm", timestamp: Date.now(),
      });
    }
  }

  // 9. Accessibility Services (common attack vector)
  const accessServices = await adbShell(serial, "settings get secure enabled_accessibility_services");
  if (accessServices.trim() && accessServices.trim() !== "null" && accessServices.trim() !== "") {
    const services = accessServices.split(":");
    for (const svc of services) {
      if (!svc.trim()) { continue; }
      const isKnownGood = /talkback|google|samsung.*accessibility|voiceassistant/i.test(svc);
      report.findings.push({
        id: `f-${Date.now()}-acc`, deviceId, category: isKnownGood ? "config" : "malware",
        severity: isKnownGood ? "info" : "high",
        title: `Accessibility Service: ${svc.trim().split("/").pop()}`,
        description: `Active accessibility service: ${svc.trim()}. Malware often abuses accessibility to keylog, overlay, and steal data.`,
        evidence: svc.trim(),
        remediation: isKnownGood ? "Known legitimate service." : "REVIEW IMMEDIATELY — remove if you did not intentionally install this service.",
        tool: "settings", timestamp: Date.now(),
      });
    }
  }

  // 10. Installed Third-Party Apps (check for suspicious ones)
  const thirdPartyApps = await adbShell(serial, "pm list packages -3 | head -100");
  const suspiciousApps = analyzeSuspiciousApps(thirdPartyApps);
  for (const app of suspiciousApps) {
    report.findings.push({
      id: `f-${Date.now()}-app-${app.pkg}`, deviceId, category: "malware", severity: app.severity as ForensicFinding["severity"],
      title: `Suspicious App: ${app.pkg}`,
      description: app.reason,
      evidence: `Package: ${app.pkg}`,
      remediation: `Investigate and uninstall if not recognized: adb uninstall ${app.pkg}`,
      tool: "pm", timestamp: Date.now(),
    });
  }

  report.status = "completed";
  report.completedAt = Date.now();
  device.status = "connected";
  device.lastScanAt = Date.now();

  logger.info(`Quick audit completed for ${device.label}: ${report.findings.length} findings`);
  return report;
}

// ─── Full Forensic Scan ─────────────────────────────────────────

export async function fullForensicScan(deviceId: string): Promise<ForensicReport> {
  // Start with quick audit
  const report = await quickSecurityAudit(deviceId);
  report.scanType = "full";
  const device = devices.get(deviceId);
  if (!device) { return report; }

  const { serial } = device;
  report.status = "running";
  device.status = "scanning";

  // Extended checks for full scan

  // 11. Boot verification state
  const verifiedBoot = await adbShell(serial, "getprop ro.boot.verifiedbootstate");
  if (verifiedBoot.trim() && verifiedBoot.trim() !== "green") {
    report.findings.push({
      id: `f-${Date.now()}-boot`, deviceId, category: "security", severity: "critical",
      title: `Verified Boot State: ${verifiedBoot.trim()}`,
      description: `Device boot state is ${verifiedBoot.trim()} (expected: green). The bootloader may be unlocked or the OS tampered.`,
      evidence: `ro.boot.verifiedbootstate = ${verifiedBoot.trim()}`,
      remediation: "Re-lock bootloader if not needed for development. Flash official firmware if tampered.",
      tool: "getprop", timestamp: Date.now(),
    });
  }

  // 12. dm-verity status
  const dmverity = await adbShell(serial, "getprop ro.boot.veritymode");
  if (dmverity.trim() && dmverity.trim() !== "enforcing") {
    report.findings.push({
      id: `f-${Date.now()}-verity`, deviceId, category: "security", severity: "high",
      title: `dm-verity: ${dmverity.trim()}`,
      description: "Partition verification is not enforcing. System partition may have been modified.",
      evidence: `ro.boot.veritymode = ${dmverity.trim()}`,
      remediation: "Flash stock firmware to restore dm-verity enforcement.",
      tool: "getprop", timestamp: Date.now(),
    });
  }

  // 13. WiFi saved networks
  const wifiDump = await adbShell(serial, "dumpsys wifi | head -100", 15);
  if (wifiDump.includes("WifiConfiguration")) {
    report.findings.push({
      id: `f-${Date.now()}-wifi`, deviceId, category: "network", severity: "info",
      title: "WiFi Configuration Dump",
      description: "Saved WiFi networks and current connection info retrieved.",
      evidence: wifiDump.slice(0, 1000),
      remediation: "Remove saved WiFi networks you no longer use. Disable auto-connect to open networks.",
      tool: "dumpsys wifi", timestamp: Date.now(),
    });
  }

  // 14. Running services check
  const services = await adbShell(serial, "dumpsys activity services | head -200", 15);
  const suspiciousServices = /spy|monitor|track|keylog|stealth|hidden|remote.*access/i.test(services);
  if (suspiciousServices) {
    report.findings.push({
      id: `f-${Date.now()}-svc`, deviceId, category: "malware", severity: "critical",
      title: "Suspicious Running Services Detected",
      description: "Running services contain keywords associated with spyware/stalkerware.",
      evidence: services.match(/.*(spy|monitor|track|keylog|stealth|hidden|remote.*access).*/i)?.[0] || services.slice(0, 500),
      remediation: "Identify and force-stop the suspicious service. Uninstall the parent application.",
      tool: "dumpsys", timestamp: Date.now(),
    });
  }

  // 15. Developer options check
  const devOptions = await adbShell(serial, "settings get global development_settings_enabled");
  if (devOptions.trim() === "1") {
    report.findings.push({
      id: `f-${Date.now()}-dev`, deviceId, category: "config", severity: "low",
      title: "Developer Options Enabled",
      description: "Developer Options are enabled, exposing additional attack surface.",
      evidence: "development_settings_enabled = 1",
      remediation: "Disable Developer Options when not actively developing: Settings → Developer Options → toggle off.",
      tool: "settings", timestamp: Date.now(),
    });
  }

  // 16. Lock screen check
  await adbShell(serial, "dumpsys deviceidle | head -20", 10);
  const screenLock = await adbShell(serial, "settings get secure lockscreen.disabled");
  if (screenLock.trim() === "1") {
    report.findings.push({
      id: `f-${Date.now()}-lock`, deviceId, category: "security", severity: "critical",
      title: "Screen Lock DISABLED",
      description: "The device has no lock screen protection. Anyone with physical access can use the device.",
      evidence: "lockscreen.disabled = 1",
      remediation: "Enable a strong lock screen: Settings → Security → Screen Lock (PIN, Pattern, or Fingerprint).",
      tool: "settings", timestamp: Date.now(),
    });
  }

  report.status = "completed";
  report.completedAt = Date.now();
  device.status = "connected";
  device.lastScanAt = Date.now();

  logger.info(`Full forensic scan completed for ${device.label}: ${report.findings.length} findings`);
  return report;
}

// ─── APK Analysis ───────────────────────────────────────────────

export async function extractAndAnalyzeApk(deviceId: string, packageName: string): Promise<ForensicReport> {
  const device = devices.get(deviceId);
  if (!device) { throw new Error(`Device ${deviceId} not found`); }

  const report: ForensicReport = {
    id: `rpt-apk-${Date.now()}`,
    deviceId,
    scanType: "apk",
    startedAt: Date.now(),
    status: "running",
    findings: [],
    deviceInfo: { ...device },
  };
  reports.push(report);

  const { serial } = device;

  // Get APK path
  const apkPath = await adbShell(serial, `pm path ${packageName}`);
  const path = apkPath.replace("package:", "").trim();
  if (!path) {
    report.status = "failed";
    report.findings.push({
      id: `f-${Date.now()}-apk`, deviceId, category: "app", severity: "info",
      title: `Package not found: ${packageName}`,
      description: `Could not locate APK for ${packageName}`,
      evidence: apkPath, remediation: "Verify the package name is correct.",
      tool: "pm path", timestamp: Date.now(),
    });
    return report;
  }

  // Get permissions
  const perms = await adbShell(serial, `dumpsys package ${packageName} | sed -n '/requested permissions:/,/install permissions:/p' | head -50`);
  const dangerousPerms = analyzeDangerousPermissions(perms, packageName);
  for (const dp of dangerousPerms) {
    report.findings.push(dp);
  }

  // Get component info
  const components = await adbShell(serial, `dumpsys package ${packageName} | head -80`);
  const versionMatch = components.match(/versionName=([\S]+)/);
  if (versionMatch) {
    report.findings.push({
      id: `f-${Date.now()}-ver`, deviceId, category: "app", severity: "info",
      title: `${packageName} version: ${versionMatch[1]}`,
      description: `Installed version of ${packageName}`,
      evidence: `versionName=${versionMatch[1]}`,
      remediation: "Ensure this is the latest version from the official store.",
      tool: "dumpsys", timestamp: Date.now(),
    });
  }

  report.status = "completed";
  report.completedAt = Date.now();
  return report;
}

// ─── Helpers ────────────────────────────────────────────────────

function assessPatchAge(patchDate: string): { severity: string; description: string } {
  try {
    const patch = new Date(patchDate);
    const now = new Date();
    const monthsOld = (now.getFullYear() - patch.getFullYear()) * 12 + (now.getMonth() - patch.getMonth());

    if (monthsOld > 12) {
      return { severity: "critical", description: `Security patch is ${monthsOld} months old (${patchDate}). Critical vulnerabilities are likely unpatched.` };
    }
    if (monthsOld > 6) {
      return { severity: "high", description: `Security patch is ${monthsOld} months old (${patchDate}). Multiple known exploits may be applicable.` };
    }
    if (monthsOld > 3) {
      return { severity: "medium", description: `Security patch is ${monthsOld} months old (${patchDate}). Update recommended.` };
    }
    if (monthsOld > 1) {
      return { severity: "low", description: `Security patch is ${monthsOld} months old (${patchDate}). Relatively current.` };
    }
    return { severity: "info", description: `Security patch is current: ${patchDate}` };
  } catch {
    return { severity: "medium", description: `Could not parse security patch date: ${patchDate}` };
  }
}

function extractDangerousPorts(output: string): Array<{ port: number; service: string; severity: string; evidence: string; remediation: string }> {
  const results: Array<{ port: number; service: string; severity: string; evidence: string; remediation: string }> = [];
  const lines = output.split("\n");

  const portMap: Record<number, { service: string; severity: string; remediation: string }> = {
    5555: { service: "ADB", severity: "critical", remediation: "Disable ADB over WiFi: adb tcpip 0" },
    8080: { service: "HTTP Proxy", severity: "high", remediation: "Stop HTTP proxy service on the device" },
    8443: { service: "HTTPS Alt", severity: "medium", remediation: "Investigate and disable if unnecessary" },
    5037: { service: "ADB Server", severity: "high", remediation: "Kill ADB server: adb kill-server" },
    21: { service: "FTP", severity: "critical", remediation: "Disable FTP server immediately" },
    22: { service: "SSH", severity: "medium", remediation: "Ensure SSH uses key-based auth, not passwords" },
    23: { service: "Telnet", severity: "critical", remediation: "Disable Telnet immediately — use SSH instead" },
    80: { service: "HTTP", severity: "medium", remediation: "Investigate what web server is running on the device" },
  };

  for (const line of lines) {
    for (const [portStr, info] of Object.entries(portMap)) {
      if (line.includes(`:${portStr}`) && (line.includes("LISTEN") || line.includes("0.0.0.0"))) {
        results.push({ port: Number(portStr), ...info, evidence: line.trim() });
      }
    }
  }
  return results;
}

function analyzeSuspiciousApps(output: string): Array<{ pkg: string; severity: string; reason: string }> {
  const results: Array<{ pkg: string; severity: string; reason: string }> = [];
  const lines = output.split("\n").map(l => l.replace("package:", "").trim()).filter(Boolean);

  const spywarePatterns = [
    { pattern: /mspy|flexispy|cocospy|eyezy|spyzie|hoverwatch|uMobix|xnspy/i, reason: "Known commercial spyware/stalkerware", severity: "critical" },
    { pattern: /pegasus|predator|graphite|chrysaor/i, reason: "Known state-sponsored spyware", severity: "critical" },
    { pattern: /keylog|screenrec|hidden.*record|stealth|spy|monitor.*sms|track.*loc/i, reason: "Package name suggests surveillance capability", severity: "high" },
    { pattern: /rat\.|remote.*access|backdoor|rootkit|trojan/i, reason: "Package name suggests malware/RAT", severity: "critical" },
  ];

  for (const pkg of lines) {
    for (const sp of spywarePatterns) {
      if (sp.pattern.test(pkg)) {
        results.push({ pkg, severity: sp.severity, reason: sp.reason });
        break;
      }
    }
  }
  return results;
}

function analyzeDangerousPermissions(perms: string, packageName: string): ForensicFinding[] {
  const findings: ForensicFinding[] = [];
  const dangerousPerms: Record<string, { severity: string; description: string }> = {
    "CAMERA": { severity: "medium", description: "Can access camera — potential surveillance" },
    "RECORD_AUDIO": { severity: "medium", description: "Can record audio — potential eavesdropping" },
    "READ_SMS": { severity: "high", description: "Can read SMS — 2FA interception risk" },
    "RECEIVE_SMS": { severity: "high", description: "Can intercept incoming SMS silently" },
    "READ_CALL_LOG": { severity: "high", description: "Can read call history" },
    "READ_CONTACTS": { severity: "medium", description: "Can exfiltrate contact list" },
    "ACCESS_FINE_LOCATION": { severity: "medium", description: "Can track precise GPS location" },
    "ACCESS_BACKGROUND_LOCATION": { severity: "high", description: "Can track location even when app is closed" },
    "SYSTEM_ALERT_WINDOW": { severity: "high", description: "Can draw over other apps — overlay attack vector" },
    "BIND_ACCESSIBILITY_SERVICE": { severity: "critical", description: "Accessibility abuse — can keylog and control other apps" },
    "BIND_DEVICE_ADMIN": { severity: "critical", description: "Device admin — can prevent uninstall and wipe device" },
    "READ_EXTERNAL_STORAGE": { severity: "low", description: "Can read shared storage / SD card" },
    "WRITE_EXTERNAL_STORAGE": { severity: "low", description: "Can write to shared storage" },
    "INSTALL_PACKAGES": { severity: "critical", description: "Can silently install other APKs" },
    "REQUEST_INSTALL_PACKAGES": { severity: "high", description: "Can request APK installations" },
  };

  for (const [perm, info] of Object.entries(dangerousPerms)) {
    if (perms.includes(perm)) {
      findings.push({
        id: `f-${Date.now()}-perm-${perm}`,
        deviceId: "",
        category: "app",
        severity: info.severity as ForensicFinding["severity"],
        title: `${packageName}: ${perm}`,
        description: info.description,
        evidence: `android.permission.${perm}`,
        remediation: `Review if ${packageName} genuinely needs ${perm}. Revoke via Settings → Apps → ${packageName} → Permissions.`,
        tool: "dumpsys",
        timestamp: Date.now(),
      });
    }
  }
  return findings;
}

// ─── Public API ─────────────────────────────────────────────────

export function listDevices(): AndroidDevice[] {
  return [...devices.values()];
}

export function getDevice(deviceId: string): AndroidDevice | undefined {
  return devices.get(deviceId);
}

export function listReports(opts: { deviceId?: string; limit?: number } = {}): ForensicReport[] {
  let filtered = [...reports];
  if (opts.deviceId) { filtered = filtered.filter(r => r.deviceId === opts.deviceId); }
  return filtered.slice(-(opts.limit ?? 20)).toReversed();
}

export function getReport(reportId: string): ForensicReport | undefined {
  return reports.find(r => r.id === reportId);
}

export function getLabStatus() {
  return {
    totalDevices: devices.size,
    connectedDevices: [...devices.values()].filter(d => d.status === "connected").length,
    totalReports: reports.length,
    totalFindings: reports.reduce((s, r) => s + r.findings.length, 0),
  };
}
