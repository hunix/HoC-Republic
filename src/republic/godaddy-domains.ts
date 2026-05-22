/**
 * GoDaddy Domain Management Engine
 *
 * Full GoDaddy API v1 client for managing 150+ domain portfolio:
 *   - List all domains with status, expiry, nameservers
 *   - DNS record CRUD (A, AAAA, CNAME, MX, TXT, SRV, NS)
 *   - Auto-provision subdomains for HoC projects
 *   - Project binding: subdomain → sandbox preview / tunnel URL
 *
 * Auth: GODADDY_API_KEY + GODADDY_API_SECRET in .env
 * Base: https://api.godaddy.com (production)
 * Rate: 60 req/min per endpoint
 */

import { createSubsystemLogger } from "../logging/subsystem.js";

const logger = createSubsystemLogger("godaddy-domains");

// ─── Types ──────────────────────────────────────────────────────

export interface GoDaddyDomain {
  domain: string;
  domainId: number;
  status: "ACTIVE" | "PARKED" | "PENDING" | "EXPIRED" | "CANCELLED" | string;
  expires: string;
  expirationProtected: boolean;
  holdRegistrar: boolean;
  locked: boolean;
  privacy: boolean;
  renewAuto: boolean;
  renewable: boolean;
  transferProtected: boolean;
  createdAt: string;
  nameServers?: string[];
}

export interface DnsRecord {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "SRV" | "NS" | "CAA" | string;
  name: string;
  data: string;
  ttl: number;
  priority?: number;
  port?: number;
  weight?: number;
  protocol?: string;
  service?: string;
}

export interface ProjectBinding {
  id: string;
  domain: string;
  subdomain: string;
  fqdn: string;           // e.g. "addressbook.example.com"
  targetType: "a" | "cname";
  targetValue: string;     // IP address or hostname
  projectName: string;
  sandboxPort?: number;
  tunnelUrl?: string;
  createdAt: number;
  lastVerified?: number;
  verified: boolean;
}

// ─── State ──────────────────────────────────────────────────────

let domainCache: GoDaddyDomain[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min cache

const projectBindings: ProjectBinding[] = [];
let bindingIdCounter = 0;

// ─── API Client ─────────────────────────────────────────────────

function getCredentials(): { key: string; secret: string } {
  const key = process.env.GODADDY_API_KEY || "";
  const secret = process.env.GODADDY_API_SECRET || "";
  if (!key || !secret) {
    throw new Error("GoDaddy API credentials not configured. Set GODADDY_API_KEY and GODADDY_API_SECRET in .env");
  }
  return { key, secret };
}

function getBaseUrl(): string {
  return process.env.GODADDY_API_URL || "https://api.godaddy.com";
}

async function gdFetch<T>(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const { key, secret } = getCredentials();
  const url = `${getBaseUrl()}${path}`;

  const headers: Record<string, string> = {
    "Authorization": `sso-key ${key}:${secret}`,
    "Accept": "application/json",
  };
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  const resp = await fetch(url, {
    method,
    headers,
    ...(body && method !== "GET" ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    const errorBody = await resp.text().catch(() => "");
    throw new Error(`GoDaddy API ${method} ${path} → ${resp.status}: ${errorBody}`);
  }

  // DELETE and some PUTs return 204 No Content
  if (resp.status === 204 || resp.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return resp.json() as Promise<T>;
}

// ─── Domain Operations ──────────────────────────────────────────

/**
 * List all domains in the account.
 * Results are cached for 5 minutes.
 */
export async function listDomains(forceRefresh = false): Promise<GoDaddyDomain[]> {
  if (!forceRefresh && domainCache.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return domainCache;
  }

  logger.info("Fetching domain portfolio from GoDaddy...");

  // GoDaddy paginates with limit/marker, fetch all
  const allDomains: GoDaddyDomain[] = [];
  let marker: string | undefined;
  const limit = 100;

  do {
    const params = new URLSearchParams({ limit: String(limit) });
    if (marker) { params.set("marker", marker); }

    const batch = await gdFetch<GoDaddyDomain[]>(`/v1/domains?${params}`);
    allDomains.push(...batch);

    // If we got a full page, there might be more
    marker = batch.length === limit ? batch[batch.length - 1].domain : undefined;
  } while (marker);

  domainCache = allDomains;
  cacheTimestamp = Date.now();
  logger.info(`Fetched ${allDomains.length} domains from GoDaddy`);
  return allDomains;
}

/**
 * Get details for a specific domain.
 */
export async function getDomain(domain: string): Promise<GoDaddyDomain> {
  return gdFetch<GoDaddyDomain>(`/v1/domains/${encodeURIComponent(domain)}`);
}

/**
 * Get active domains suitable for project hosting.
 */
export async function getAvailableDomains(): Promise<GoDaddyDomain[]> {
  const domains = await listDomains();
  return domains.filter(d => d.status === "ACTIVE");
}

// ─── DNS Operations ─────────────────────────────────────────────

/**
 * List all DNS records for a domain.
 * Optionally filter by type and/or name.
 */
export async function getDnsRecords(
  domain: string,
  type?: string,
  name?: string,
): Promise<DnsRecord[]> {
  let path = `/v1/domains/${encodeURIComponent(domain)}/records`;
  if (type) {
    path += `/${encodeURIComponent(type)}`;
    if (name) {
      path += `/${encodeURIComponent(name)}`;
    }
  }
  return gdFetch<DnsRecord[]>(path);
}

/**
 * Add DNS records to a domain (non-destructive — appends).
 */
export async function addDnsRecords(
  domain: string,
  records: DnsRecord[],
): Promise<void> {
  logger.info(`Adding ${records.length} DNS record(s) to ${domain}`);
  await gdFetch(`/v1/domains/${encodeURIComponent(domain)}/records`, "PATCH", records);
}

/**
 * Replace all DNS records of a specific type and name.
 */
export async function setDnsRecord(
  domain: string,
  type: string,
  name: string,
  records: Array<{ data: string; ttl?: number; priority?: number }>,
): Promise<void> {
  const path = `/v1/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(type)}/${encodeURIComponent(name)}`;
  logger.info(`Setting ${type} record "${name}" on ${domain} → ${records.map(r => r.data).join(", ")}`);
  await gdFetch(path, "PUT", records);
}

/**
 * Delete all DNS records of a specific type and name.
 * GoDaddy doesn't have a native DELETE for records — we replace with empty.
 * Workaround: read all records, filter out the target, replace all.
 */
export async function deleteDnsRecord(
  domain: string,
  type: string,
  name: string,
): Promise<void> {
  logger.info(`Deleting ${type} record "${name}" from ${domain}`);
  const allRecords = await getDnsRecords(domain);
  const filtered = allRecords.filter(r =>
    !(r.type.toUpperCase() === type.toUpperCase() && r.name === name)
  );
  // Replace the entire record set minus the deleted one
  await gdFetch(`/v1/domains/${encodeURIComponent(domain)}/records`, "PUT", filtered);
}

// ─── Subdomain Assignment ───────────────────────────────────────

/**
 * Assign a subdomain to a target (IP or hostname).
 * Creates A record for IPs, CNAME for hostnames.
 */
export async function assignSubdomain(
  domain: string,
  subdomain: string,
  target: string,
  ttl = 600,
): Promise<{ fqdn: string; type: string }> {
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(target);
  const type = isIp ? "A" : "CNAME";

  await setDnsRecord(domain, type, subdomain, [{ data: target, ttl }]);

  const fqdn = `${subdomain}.${domain}`;
  logger.info(`Assigned ${fqdn} → ${target} (${type})`);

  return { fqdn, type };
}

/**
 * Remove a subdomain assignment.
 */
export async function removeSubdomain(
  domain: string,
  subdomain: string,
): Promise<void> {
  // Try deleting both A and CNAME (one will fail silently)
  try { await deleteDnsRecord(domain, "A", subdomain); } catch { /* ok */ }
  try { await deleteDnsRecord(domain, "CNAME", subdomain); } catch { /* ok */ }
  logger.info(`Removed subdomain ${subdomain}.${domain}`);
}

// ─── Project Bindings ───────────────────────────────────────────

/**
 * Bind a HoC project to a subdomain.
 * Creates DNS record and stores the binding for tracking.
 */
export async function bindProject(opts: {
  domain: string;
  subdomain: string;
  projectName: string;
  target: string;
  sandboxPort?: number;
  tunnelUrl?: string;
}): Promise<ProjectBinding> {
  const { domain, subdomain, projectName, target, sandboxPort, tunnelUrl } = opts;

  // Create the DNS record
  const { fqdn, type } = await assignSubdomain(domain, subdomain, target);

  // Store the binding
  const binding: ProjectBinding = {
    id: `pb-${++bindingIdCounter}`,
    domain,
    subdomain,
    fqdn,
    targetType: type === "A" ? "a" : "cname",
    targetValue: target,
    projectName,
    sandboxPort,
    tunnelUrl,
    createdAt: Date.now(),
    verified: false,
  };
  projectBindings.push(binding);

  logger.info(`Bound project "${projectName}" → ${fqdn}`);
  return binding;
}

/**
 * Remove a project binding and its DNS record.
 */
export async function unbindProject(bindingId: string): Promise<boolean> {
  const idx = projectBindings.findIndex(b => b.id === bindingId);
  if (idx < 0) { return false; }

  const binding = projectBindings[idx];
  await removeSubdomain(binding.domain, binding.subdomain);
  projectBindings.splice(idx, 1);

  logger.info(`Unbound project "${binding.projectName}" from ${binding.fqdn}`);
  return true;
}

/**
 * List all project bindings.
 */
export function listProjectBindings(): ProjectBinding[] {
  return [...projectBindings];
}

/**
 * Verify a project binding resolves correctly.
 */
export async function verifyBinding(bindingId: string): Promise<boolean> {
  const binding = projectBindings.find(b => b.id === bindingId);
  if (!binding) { return false; }

  try {
    const records = await getDnsRecords(binding.domain, binding.targetType.toUpperCase(), binding.subdomain);
    const found = records.some(r => r.data === binding.targetValue);
    binding.verified = found;
    binding.lastVerified = Date.now();
    return found;
  } catch {
    binding.verified = false;
    binding.lastVerified = Date.now();
    return false;
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getDomainStats(): {
  totalDomains: number;
  activeDomains: number;
  parkedDomains: number;
  expiredDomains: number;
  projectBindings: number;
  cacheAge: number;
} {
  return {
    totalDomains: domainCache.length,
    activeDomains: domainCache.filter(d => d.status === "ACTIVE").length,
    parkedDomains: domainCache.filter(d => d.status === "PARKED").length,
    expiredDomains: domainCache.filter(d => d.status === "EXPIRED").length,
    projectBindings: projectBindings.length,
    cacheAge: cacheTimestamp ? Date.now() - cacheTimestamp : -1,
  };
}
