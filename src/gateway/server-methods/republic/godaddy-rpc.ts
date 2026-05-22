/**
 * GoDaddy Domain Management — RPC Handlers
 *
 * Exposes the GoDaddy domain engine via gateway RPC endpoints:
 *   - republic.domains.list        — list all domains
 *   - republic.domains.get         — get domain detail
 *   - republic.domains.available   — list active/hostable domains
 *   - republic.domains.stats       — portfolio statistics
 *   - republic.domains.dns.list    — list DNS records
 *   - republic.domains.dns.add     — add DNS records
 *   - republic.domains.dns.set     — set specific record
 *   - republic.domains.dns.delete  — delete record
 *   - republic.domains.assign      — assign subdomain → target
 *   - republic.domains.remove      — remove subdomain
 *   - republic.domains.project.bind   — bind project to subdomain
 *   - republic.domains.project.unbind — remove project binding
 *   - republic.domains.project.list   — list project bindings
 *   - republic.domains.project.verify — verify binding resolves
 */

import type { GatewayRequestHandlers } from "../types.js";

export const godaddyHandlers: GatewayRequestHandlers = {
  // ─── Domain Portfolio ───────────────────────────────────────────

  "republic.domains.list": async ({ params, respond }) => {
    const { forceRefresh } = params as { forceRefresh?: boolean };
    const { listDomains } = await import("../../../republic/godaddy-domains.js");
    const domains = await listDomains(forceRefresh);
    respond(true, {
      ok: true,
      total: domains.length,
      domains: domains.map(d => ({
        domain: d.domain,
        status: d.status,
        expires: d.expires,
        privacy: d.privacy,
        renewAuto: d.renewAuto,
        locked: d.locked,
        nameServers: d.nameServers,
      })),
    }, undefined);
  },

  "republic.domains.get": async ({ params, respond }) => {
    const { domain } = params as { domain?: string };
    if (!domain) { throw new Error("domain required"); }
    const { getDomain } = await import("../../../republic/godaddy-domains.js");
    const detail = await getDomain(domain);
    respond(true, { ok: true, domain: detail }, undefined);
  },

  "republic.domains.available": async ({ respond }) => {
    const { getAvailableDomains } = await import("../../../republic/godaddy-domains.js");
    const domains = await getAvailableDomains();
    respond(true, {
      ok: true,
      total: domains.length,
      domains: domains.map(d => ({ domain: d.domain, expires: d.expires })),
    }, undefined);
  },

  "republic.domains.stats": async ({ respond }) => {
    const { getDomainStats } = await import("../../../republic/godaddy-domains.js");
    const stats = getDomainStats();
    respond(true, { ok: true, ...stats }, undefined);
  },

  // ─── DNS Records ────────────────────────────────────────────────

  "republic.domains.dns.list": async ({ params, respond }) => {
    const { domain, type, name } = params as { domain?: string; type?: string; name?: string };
    if (!domain) { throw new Error("domain required"); }
    const { getDnsRecords } = await import("../../../republic/godaddy-domains.js");
    const records = await getDnsRecords(domain, type, name);
    respond(true, { ok: true, total: records.length, records }, undefined);
  },

  "republic.domains.dns.add": async ({ params, respond }) => {
    const { domain, records } = params as { domain?: string; records?: unknown[] };
    if (!domain) { throw new Error("domain required"); }
    if (!records || !Array.isArray(records) || records.length === 0) {
      throw new Error("records array required (e.g. [{type:'A', name:'app', data:'1.2.3.4', ttl:600}])");
    }
    const { addDnsRecords } = await import("../../../republic/godaddy-domains.js");
    await addDnsRecords(domain, records as Parameters<typeof addDnsRecords>[1]);
    respond(true, { ok: true, added: records.length }, undefined);
  },

  "republic.domains.dns.set": async ({ params, respond }) => {
    const { domain, type, name, data, ttl, priority } = params as {
      domain?: string; type?: string; name?: string; data?: string; ttl?: number; priority?: number;
    };
    if (!domain || !type || !name || !data) {
      throw new Error("domain, type, name, and data required");
    }
    const { setDnsRecord } = await import("../../../republic/godaddy-domains.js");
    await setDnsRecord(domain, type, name, [{ data, ttl: ttl ?? 600, priority }]);
    respond(true, { ok: true, set: `${type} ${name}.${domain} → ${data}` }, undefined);
  },

  "republic.domains.dns.delete": async ({ params, respond }) => {
    const { domain, type, name } = params as { domain?: string; type?: string; name?: string };
    if (!domain || !type || !name) {
      throw new Error("domain, type, and name required");
    }
    const { deleteDnsRecord } = await import("../../../republic/godaddy-domains.js");
    await deleteDnsRecord(domain, type, name);
    respond(true, { ok: true, deleted: `${type} ${name}.${domain}` }, undefined);
  },

  // ─── Subdomain Assignment ─────────────────────────────────────

  "republic.domains.assign": async ({ params, respond }) => {
    const { domain, subdomain, target, ttl } = params as {
      domain?: string; subdomain?: string; target?: string; ttl?: number;
    };
    if (!domain || !subdomain || !target) {
      throw new Error("domain, subdomain, and target required (target is IP or hostname)");
    }
    const { assignSubdomain } = await import("../../../republic/godaddy-domains.js");
    const result = await assignSubdomain(domain, subdomain, target, ttl);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.domains.remove": async ({ params, respond }) => {
    const { domain, subdomain } = params as { domain?: string; subdomain?: string };
    if (!domain || !subdomain) {
      throw new Error("domain and subdomain required");
    }
    const { removeSubdomain } = await import("../../../republic/godaddy-domains.js");
    await removeSubdomain(domain, subdomain);
    respond(true, { ok: true, removed: `${subdomain}.${domain}` }, undefined);
  },

  // ─── Project Bindings ─────────────────────────────────────────

  "republic.domains.project.bind": async ({ params, respond }) => {
    const { domain, subdomain, projectName, target, sandboxPort, tunnelUrl } = params as {
      domain?: string; subdomain?: string; projectName?: string; target?: string;
      sandboxPort?: number; tunnelUrl?: string;
    };
    if (!domain || !subdomain || !projectName || !target) {
      throw new Error("domain, subdomain, projectName, and target required");
    }
    const { bindProject } = await import("../../../republic/godaddy-domains.js");
    const binding = await bindProject({ domain, subdomain, projectName, target, sandboxPort, tunnelUrl });
    respond(true, { ok: true, binding }, undefined);
  },

  "republic.domains.project.unbind": async ({ params, respond }) => {
    const { bindingId } = params as { bindingId?: string };
    if (!bindingId) { throw new Error("bindingId required"); }
    const { unbindProject } = await import("../../../republic/godaddy-domains.js");
    const removed = await unbindProject(bindingId);
    respond(true, { ok: true, removed }, undefined);
  },

  "republic.domains.project.list": async ({ respond }) => {
    const { listProjectBindings } = await import("../../../republic/godaddy-domains.js");
    const bindings = listProjectBindings();
    respond(true, { ok: true, total: bindings.length, bindings }, undefined);
  },

  "republic.domains.project.verify": async ({ params, respond }) => {
    const { bindingId } = params as { bindingId?: string };
    if (!bindingId) { throw new Error("bindingId required"); }
    const { verifyBinding } = await import("../../../republic/godaddy-domains.js");
    const verified = await verifyBinding(bindingId);
    respond(true, { ok: true, verified }, undefined);
  },
};
