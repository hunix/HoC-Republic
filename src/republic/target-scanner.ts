/**
 * target-scanner.ts — Security Audit Engine
 *
 * Runs a multi-phase security audit against a provided URL or IP address:
 *
 *   Phase 1: Target resolution  — parse host/IP, DNS lookup, WHOIS-lite
 *   Phase 2: Port scan          — top 20+ common TCP ports via net.Socket
 *   Phase 3: HTTP/HTTPS probe   — headers, redirects, status, timing
 *   Phase 4: SSL/TLS analysis   — cert validity, expiry, cipher, SANs
 *   Phase 5: Tech fingerprint   — detect server, framework, CDN, WAF from headers/body
 *   Phase 6: Security headers   — CSP, HSTS, X-Frame, X-Content-Type, etc.
 *
 * Each phase runs in parallel within its group. Results are persisted as JSON
 * and can be polled via scan.status / scan.results.
 */

import * as crypto from "crypto";
import * as dns from "dns";
import * as dnsP from "dns/promises";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as path from "path";
import * as tls from "tls";

// ─── Storage ──────────────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(
  typeof __dirname !== "undefined" ? __dirname : ".",
  "../../plugins/.scan-data"
);
const INDEX_PATH = path.join(DATA_DIR, "scans.json");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PortResult {
  port: number;
  service: string;
  open: boolean;
  banner?: string;
  latencyMs?: number;
}

export interface SslResult {
  valid: boolean;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  expired?: boolean;
  selfSigned?: boolean;
  sans?: string[];
  protocol?: string;
  cipher?: string;
}

export interface HttpResult {
  statusCode?: number;
  statusText?: string;
  latencyMs?: number;
  redirects?: string[];
  headers?: Record<string, string>;
  serverBanner?: string;
  contentType?: string;
  bodyPreview?: string;
}

export interface HeaderSecurityResult {
  name: string;
  present: boolean;
  value?: string;
  severity: "info" | "low" | "medium" | "high";
  description: string;
}

export interface TechFingerprint {
  server?: string;
  framework?: string;
  language?: string;
  cdn?: string;
  waf?: string;
  cms?: string;
  detected: string[];
}

export interface DnsResult {
  hostname: string;
  addresses: string[];
  ipv6?: string[];
  mx?: string[];
  txt?: string[];
  cname?: string;
}

export interface ScanResult {
  id: string;
  target: string;
  host: string;
  protocol: "http" | "https" | "unknown";
  port: number;
  status: "queued" | "running" | "done" | "error";
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;

  // Phase results
  dns?: DnsResult;
  ports?: PortResult[];
  http?: HttpResult;
  ssl?: SslResult;
  securityHeaders?: HeaderSecurityResult[];
  tech?: TechFingerprint;

  // Summary
  summary?: {
    openPorts: number;
    riskScore: number;        // 0–100 (higher = more risk)
    riskLevel: "info" | "low" | "medium" | "high" | "critical";
    findings: string[];
    recommendations: string[];
  };
}

// ─── Common port catalog ──────────────────────────────────────────────────────

const TOP_PORTS: Array<{ port: number; service: string }> = [
  { port: 21, service: "FTP" },
  { port: 22, service: "SSH" },
  { port: 23, service: "Telnet" },
  { port: 25, service: "SMTP" },
  { port: 53, service: "DNS" },
  { port: 80, service: "HTTP" },
  { port: 110, service: "POP3" },
  { port: 143, service: "IMAP" },
  { port: 443, service: "HTTPS" },
  { port: 445, service: "SMB" },
  { port: 465, service: "SMTPS" },
  { port: 587, service: "SMTP-Submission" },
  { port: 993, service: "IMAPS" },
  { port: 995, service: "POP3S" },
  { port: 1433, service: "MSSQL" },
  { port: 3000, service: "Dev-HTTP" },
  { port: 3306, service: "MySQL" },
  { port: 3389, service: "RDP" },
  { port: 5432, service: "PostgreSQL" },
  { port: 5900, service: "VNC" },
  { port: 6379, service: "Redis" },
  { port: 8080, service: "Alt-HTTP" },
  { port: 8443, service: "Alt-HTTPS" },
  { port: 8888, service: "Jupyter" },
  { port: 27017, service: "MongoDB" },
];

// ─── Security header definitions ──────────────────────────────────────────────

const SECURITY_HEADERS: Array<{
  header: string;
  name: string;
  severity: "info" | "low" | "medium" | "high";
  description: string;
}> = [
  { header: "strict-transport-security", name: "HSTS", severity: "high", description: "Forces browsers to use HTTPS for future visits" },
  { header: "content-security-policy", name: "CSP", severity: "high", description: "Controls resources the browser can load — prevents XSS" },
  { header: "x-frame-options", name: "X-Frame-Options", severity: "medium", description: "Prevents clickjacking by disallowing iframe embedding" },
  { header: "x-content-type-options", name: "X-Content-Type-Options", severity: "medium", description: "Prevents MIME-sniffing attacks" },
  { header: "referrer-policy", name: "Referrer-Policy", severity: "low", description: "Controls how much referrer info is sent" },
  { header: "permissions-policy", name: "Permissions-Policy", severity: "low", description: "Restricts access to browser features (camera, mic, etc.)" },
  { header: "cross-origin-embedder-policy", name: "COEP", severity: "info", description: "Prevents loading cross-origin resources without explicit permission" },
  { header: "cross-origin-opener-policy", name: "COOP", severity: "info", description: "Isolates browsing context against cross-origin attacks" },
];

// ─── Phase helpers ────────────────────────────────────────────────────────────

function parseTarget(raw: string): { host: string; port: number; protocol: "http" | "https" | "unknown"; url: string } {
  let url = raw.trim();
  // bare IP or hostname — add https://
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    const u = new URL(url);
    const protocol = u.protocol === "http:" ? "http" : "https";
    const port = u.port ? parseInt(u.port, 10) : (protocol === "https" ? 443 : 80);
    return { host: u.hostname, port, protocol, url: u.href };
  } catch {
    return { host: raw, port: 443, protocol: "unknown", url: raw };
  }
}

async function probeTcpPort(host: string, port: number, timeoutMs = 2000): Promise<{ open: boolean; latencyMs: number }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) { return; }
      settled = true;
      socket.destroy();
      resolve({ open, latencyMs: Date.now() - start });
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function scanPorts(host: string): Promise<PortResult[]> {
  const results = await Promise.all(
    TOP_PORTS.map(async ({ port, service }) => {
      const { open, latencyMs } = await probeTcpPort(host, port);
      return { port, service, open, latencyMs };
    })
  );
  return results;
}

async function probeDns(host: string): Promise<DnsResult> {
  const result: DnsResult = { hostname: host, addresses: [] };
  try {
    const v4 = await dnsP.resolve4(host).catch(() => [] as string[]);
    const v6 = await dnsP.resolve6(host).catch(() => [] as string[]);
    const mx = await dnsP.resolveMx(host).catch(() => [] as dns.MxRecord[]);
    const txt = await dnsP.resolveTxt(host).catch(() => [] as string[][]);
    const cname = await dnsP.resolveCname(host).catch(() => [] as string[]);
    result.addresses = v4;
    result.ipv6 = v6;
    result.mx = mx.map(r => `${r.priority} ${r.exchange}`);
    result.txt = txt.map(r => r.join(" "));
    result.cname = cname[0];
  } catch { /* may fail for bare IPs */ }
  return result;
}

function probeHttp(url: string, protocol: "http" | "https"): Promise<HttpResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const redirects: string[] = [];
    const mod = protocol === "https" ? https : http;

    const doReq = (reqUrl: string, hops = 0): void => {
      if (hops > 5) { resolve({ redirects, latencyMs: Date.now() - start }); return; }
      try {
        const req = (mod as typeof https).get(reqUrl, { timeout: 10000, rejectUnauthorized: false }, (res) => {
          const latencyMs = Date.now() - start;
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            headers[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
          }
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            redirects.push(res.headers.location);
            doReq(res.headers.location, hops + 1);
            return;
          }
          // Read first 500 bytes of body for tech detection
          let body = "";
          res.on("data", (chunk: Buffer) => { if (body.length < 500) { body += chunk.toString("utf-8", 0, 500 - body.length); } });
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode,
              statusText: res.statusMessage,
              latencyMs,
              redirects: redirects.length > 0 ? redirects : undefined,
              headers,
              serverBanner: headers["server"],
              contentType: headers["content-type"],
              bodyPreview: body.slice(0, 200),
            });
          });
          res.on("error", () => resolve({ statusCode: res.statusCode, latencyMs, redirects }));
        });
        req.on("error", () => resolve({ latencyMs: Date.now() - start, redirects }));
        req.on("timeout", () => { req.destroy(); resolve({ latencyMs: Date.now() - start, redirects }); });
      } catch { resolve({ latencyMs: Date.now() - start, redirects }); }
    };
    doReq(url);
  });
}

function probeSsl(host: string, port: number): Promise<SslResult> {
  return new Promise((resolve) => {
    try {
      const socket = tls.connect(port, host, { servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
        try {
          const cert = socket.getPeerCertificate(true);
          const proto = socket.getProtocol() ?? undefined;
          const cipher = socket.getCipher()?.name ?? undefined;
          if (!cert || !cert.subject) {
            socket.destroy();
            resolve({ valid: false });
            return;
          }
          const validFrom = new Date(cert.valid_from);
          const validTo = new Date(cert.valid_to);
          const now = new Date();
          const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / 86_400_000);
          const expired = daysRemaining < 0;
          const selfSigned = cert.issuer?.CN === cert.subject?.CN;
          const sans: string[] = cert.subjectaltname
            ? cert.subjectaltname.split(", ").map(s => s.replace(/^DNS:/, ""))
            : [];
          socket.destroy();
          resolve({
            valid: !expired && socket.authorized !== false,
            subject: cert.subject?.CN,
            issuer: cert.issuer?.O ?? cert.issuer?.CN,
            validFrom: validFrom.toISOString(),
            validTo: validTo.toISOString(),
            daysRemaining,
            expired,
            selfSigned,
            sans,
            protocol: proto,
            cipher,
          });
        } catch { socket.destroy(); resolve({ valid: false }); }
      });
      socket.on("error", () => resolve({ valid: false }));
      socket.on("timeout", () => { socket.destroy(); resolve({ valid: false }); });
    } catch { resolve({ valid: false }); }
  });
}

function analyzeSecurityHeaders(headers: Record<string, string>): HeaderSecurityResult[] {
  return SECURITY_HEADERS.map(({ header, name, severity, description }) => ({
    name,
    present: header in headers,
    value: headers[header],
    severity,
    description,
  }));
}

function fingerprint(httpResult: HttpResult): TechFingerprint {
  const headers = httpResult.headers ?? {};
  const server = headers["server"] ?? "";
  const powered = headers["x-powered-by"] ?? "";
  const body = httpResult.bodyPreview ?? "";
  const detected: string[] = [];

  const result: TechFingerprint = { detected };

  // Server
  if (/nginx/i.test(server)) { result.server = "Nginx"; detected.push("Nginx"); }
  else if (/apache/i.test(server)) { result.server = "Apache"; detected.push("Apache"); }
  else if (/cloudflare/i.test(server)) { result.server = "Cloudflare"; detected.push("Cloudflare"); result.cdn = "Cloudflare"; }
  else if (/iis/i.test(server)) { result.server = "IIS"; detected.push("Microsoft IIS"); }
  else if (/litespeed/i.test(server)) { result.server = "LiteSpeed"; detected.push("LiteSpeed"); }
  else if (server) { result.server = server.split("/")[0]; }

  // Framework / language
  if (/php/i.test(powered)) { result.language = "PHP"; detected.push("PHP"); }
  else if (/express/i.test(powered) || /node/i.test(powered)) { result.framework = "Node.js/Express"; detected.push("Node.js"); }
  else if (/asp\.net/i.test(powered)) { result.framework = "ASP.NET"; detected.push("ASP.NET"); }

  // CDN
  if (headers["cf-ray"]) { result.cdn = "Cloudflare"; detected.push("Cloudflare CDN"); }
  else if (headers["x-amz-cf-id"] || headers["x-amz-request-id"]) { result.cdn = "AWS CloudFront"; detected.push("AWS CloudFront"); }
  else if (headers["x-fastly-id"] || headers["via"]?.includes("varnish")) { result.cdn = "Fastly"; detected.push("Fastly"); }
  else if (headers["x-cache"]?.includes("Akamai")) { result.cdn = "Akamai"; detected.push("Akamai CDN"); }

  // WAF
  if (headers["x-sucuri-id"]) { result.waf = "Sucuri"; detected.push("Sucuri WAF"); }
  else if (headers["x-firewall-protection"]) { result.waf = "Generic WAF"; detected.push("WAF detected"); }

  // CMS
  if (/wp-content|wordpress/i.test(body) || headers["x-pingback"]) { result.cms = "WordPress"; detected.push("WordPress"); }
  else if (/shopify/i.test(body) || headers["x-shopify-stage"]) { result.cms = "Shopify"; detected.push("Shopify"); }
  else if (/drupal/i.test(body)) { result.cms = "Drupal"; detected.push("Drupal"); }
  else if (/joomla/i.test(body)) { result.cms = "Joomla"; detected.push("Joomla"); }

  // Interesting headers
  if (headers["x-generator"]) { detected.push(`Generator: ${headers["x-generator"]}`); }
  if (!headers["server"]) { detected.push("Server header hidden (good)"); }

  return result;
}

function computeSummary(scan: Partial<ScanResult>): ScanResult["summary"] {
  const findings: string[] = [];
  const recommendations: string[] = [];
  let riskScore = 0;

  // Port findings
  const openPorts = scan.ports?.filter(p => p.open) ?? [];
  const dangerousPorts = openPorts.filter(p => [21, 23, 445, 3389, 5900, 27017, 6379].includes(p.port));
  for (const p of dangerousPorts) {
    findings.push(`⚠️ Dangerous port open: ${p.port} (${p.service})`);
    recommendations.push(`Close or firewall port ${p.port} (${p.service}) if not required`);
    riskScore += 15;
  }
  if (openPorts.length > 5) { findings.push(`${openPorts.length} open ports detected`); riskScore += 5; }

  // SSL findings
  if (scan.ssl) {
    if (scan.ssl.expired) { findings.push("🔴 SSL certificate EXPIRED"); recommendations.push("Renew SSL certificate immediately"); riskScore += 30; }
    else if (scan.ssl.daysRemaining !== undefined && scan.ssl.daysRemaining < 30) { findings.push(`⚠️ SSL cert expires in ${scan.ssl.daysRemaining} days`); recommendations.push("Renew SSL certificate soon"); riskScore += 10; }
    if (scan.ssl.selfSigned) { findings.push("⚠️ Self-signed certificate"); recommendations.push("Replace with a CA-signed certificate"); riskScore += 15; }
    if (!scan.ssl.valid) { findings.push("🔴 Invalid SSL certificate"); riskScore += 25; }
    if (scan.ssl.protocol === "TLSv1" || scan.ssl.protocol === "TLSv1.1") { findings.push(`⚠️ Deprecated TLS version: ${scan.ssl.protocol}`); recommendations.push("Upgrade to TLS 1.2+"); riskScore += 10; }
  }

  // Security header findings
  const missing = scan.securityHeaders?.filter(h => !h.present && (h.severity === "high" || h.severity === "medium")) ?? [];
  for (const h of missing) {
    findings.push(`Missing ${h.severity === "high" ? "🔴" : "⚠️"} security header: ${h.name}`);
    recommendations.push(`Add ${h.name} header: ${h.description}`);
    riskScore += h.severity === "high" ? 15 : 8;
  }

  // HTTP findings
  if (scan.http?.serverBanner) { findings.push(`Server info disclosed: ${scan.http.serverBanner}`); recommendations.push("Hide server version banner"); riskScore += 5; }

  riskScore = Math.min(100, riskScore);
  const riskLevel = riskScore >= 70 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 30 ? "medium" : riskScore >= 10 ? "low" : "info";

  return { openPorts: openPorts.length, riskScore, riskLevel, findings, recommendations };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

function loadScans(): Map<string, ScanResult> {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_PATH)) { return new Map(); }
  try {
    const data = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8")) as Record<string, ScanResult>;
    return new Map(Object.entries(data));
  } catch { return new Map(); }
}

function saveScans(scans: Map<string, ScanResult>): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(Object.fromEntries(scans.entries()), null, 2), "utf-8");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Kick off a new scan — returns immediately, runs async. */
export function startScan(raw: string): ScanResult {
  const scans = loadScans();
  const { host, port, protocol, url } = parseTarget(raw);
  const id = crypto.randomUUID();
  const scan: ScanResult = {
    id,
    target: raw,
    host,
    protocol,
    port,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  scans.set(id, scan);
  saveScans(scans);

  // Run async
  void runScan(id, host, port, protocol, url);
  return scan;
}

async function runScan(id: string, host: string, port: number, protocol: "http" | "https" | "unknown", url: string): Promise<void> {
  const scans = loadScans();
  const scan = scans.get(id);
  if (!scan) { return; }

  try {
    // Phases 1 & 2 in parallel (fast)
    const [dnsResult, portsResult] = await Promise.all([
      probeDns(host),
      scanPorts(host),
    ]);
    scan.dns = dnsResult;
    scan.ports = portsResult;
    scans.set(id, scan);
    saveScans(scans);

    // Phases 3 & 4 in parallel (network-heavy)
    const proto = protocol === "unknown" ? "https" : protocol;
    const [httpResult, sslResult] = await Promise.all([
      probeHttp(url, proto),
      proto === "https" ? probeSsl(host, port) : Promise.resolve<SslResult>({ valid: false }),
    ]);
    scan.http = httpResult;
    if (proto === "https") { scan.ssl = sslResult; }

    // Phase 5 & 6 (synchronous, based on HTTP result)
    if (httpResult.headers) {
      scan.securityHeaders = analyzeSecurityHeaders(httpResult.headers);
    }
    scan.tech = fingerprint(httpResult);

    // Summary
    scan.summary = computeSummary(scan);
    scan.status = "done";
    scan.completedAt = new Date().toISOString();
    scan.durationMs = new Date(scan.completedAt).getTime() - new Date(scan.startedAt).getTime();
  } catch (err) {
    scan.status = "error";
    scan.error = err instanceof Error ? err.message : String(err);
    scan.completedAt = new Date().toISOString();
  }

  scans.set(id, scan);
  saveScans(scans);
}

export function getScan(id: string): ScanResult | null {
  return loadScans().get(id) ?? null;
}

export function listScans(limit = 50): ScanResult[] {
  const all = [...loadScans().values()];
  return all.toSorted((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);
}

export function deleteScan(id: string): boolean {
  const scans = loadScans();
  const had = scans.has(id);
  scans.delete(id);
  saveScans(scans);
  return had;
}
