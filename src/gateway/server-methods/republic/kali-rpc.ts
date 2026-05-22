/**
 * republic.cyber.kali.*
 *
 * RPC handlers for the Kali Linux cybersecurity sandbox.
 * Controls the container lifecycle and orchestrates penetration tests.
 */

import type { GatewayRequestHandlers } from "../types.js";
import { ErrorCodes, errorShape } from "../../protocol/index.js";

export const kaliHandlers: GatewayRequestHandlers = {

  // ─── Container Lifecycle ──────────────────────────────────────

  "republic.cyber.kali.status": async ({ respond }) => {
    const { getKaliStatus } = await import("../../../republic/kali-agent-loop.js");
    const { isSandboxTypeRunning, getSandboxApiUrl } = await import("../../../republic/multi-sandbox.js");
    respond(true, {
      ok: true,
      ...getKaliStatus(),
      apiUrl: getSandboxApiUrl("kali"),
      containerRunning: isSandboxTypeRunning("kali"),
    }, undefined);
  },

  "republic.cyber.kali.start": async ({ respond }) => {
    const { startSpecializedSandbox } = await import("../../../republic/multi-sandbox.js");
    const started = await startSpecializedSandbox("kali");
    respond(true, { ok: started }, undefined);
  },

  "republic.cyber.kali.stop": async ({ respond }) => {
    const { stopSpecializedSandbox } = await import("../../../republic/multi-sandbox.js");
    const stopped = await stopSpecializedSandbox("kali");
    respond(true, { ok: stopped }, undefined);
  },

  // ─── Scan Operations ──────────────────────────────────────────

  "republic.cyber.kali.scan": async ({ params, respond }) => {
    const { target, scanType, ports, scope, options } = params as {
      target?: string;
      scanType?: string;
      ports?: string;
      scope?: string[];
      options?: Record<string, unknown>;
    };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target is required"));
      return;
    }
    const { runScan } = await import("../../../republic/kali-agent-loop.js");
    // Run scan asynchronously — return the scan ID immediately
    const scanPromise = runScan({
      target,
      scanType: (scanType as "full" | "recon" | "web" | "network" | "compliance" | "quick") || "full",
      ports,
      scope,
      options,
    });

    // Wait briefly for immediate failures, then return scan ID
    const result = await Promise.race([
      scanPromise,
      new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
    ]);

    if (result) {
      respond(true, { ok: true, scan: result }, undefined);
    } else {
      respond(true, { ok: true, message: "Scan started", target, scanType: scanType || "full" }, undefined);
    }
  },

  "republic.cyber.kali.scan.status": async ({ params, respond }) => {
    const { scanId } = (params ?? {}) as { scanId?: string };
    const { getScanResult, getCompletedScans } = await import("../../../republic/kali-agent-loop.js");
    if (scanId) {
      const scan = getScanResult(scanId);
      respond(true, { ok: !!scan, scan }, undefined);
    } else {
      const scans = getCompletedScans(1);
      respond(true, { ok: true, scan: scans[0] ?? null }, undefined);
    }
  },

  "republic.cyber.kali.scan.cancel": async ({ params, respond }) => {
    const { scanId } = params as { scanId: string };
    if (!scanId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scanId required"));
      return;
    }
    const { cancelScan } = await import("../../../republic/kali-agent-loop.js");
    respond(true, { ok: cancelScan(scanId) }, undefined);
  },

  "republic.cyber.kali.scans": async ({ params, respond }) => {
    const { limit = 20 } = (params ?? {}) as { limit?: number };
    const { getCompletedScans } = await import("../../../republic/kali-agent-loop.js");
    respond(true, { ok: true, scans: getCompletedScans(limit) }, undefined);
  },

  "republic.cyber.kali.report": async ({ params, respond }) => {
    const { scanId } = params as { scanId: string };
    if (!scanId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "scanId required"));
      return;
    }
    const { getScanResult, generateReport } = await import("../../../republic/kali-agent-loop.js");
    const scan = getScanResult(scanId);
    if (!scan) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Scan not found"));
      return;
    }
    const report = generateReport(scan);
    respond(true, { ok: true, report, summary: scan.summary }, undefined);
  },

  // ─── Direct Execution ─────────────────────────────────────────

  "republic.cyber.kali.exec": async ({ params, respond }) => {
    const { command, timeout = 300 } = params as { command?: string; timeout?: number };
    if (!command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "command required"));
      return;
    }
    const { kaliExec } = await import("../../../republic/kali-agent-loop.js");
    const result = await kaliExec(command, timeout);
    respond(true, { ...result }, undefined);
  },

  // ─── Individual Tool Endpoints ────────────────────────────────

  "republic.cyber.kali.tool.portscan": async ({ params, respond }) => {
    const { target, ports = "1-1000", options = {} } = params as { target?: string; ports?: string; options?: Record<string, unknown> };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { portScan } = await import("../../../republic/kali-agent-loop.js");
    const result = await portScan(target, ports, options);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.tool.webscan": async ({ params, respond }) => {
    const { target } = params as { target?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { webScan } = await import("../../../republic/kali-agent-loop.js");
    const result = await webScan(target);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.tool.sqli": async ({ params, respond }) => {
    const { target } = params as { target?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { sqlInject } = await import("../../../republic/kali-agent-loop.js");
    const result = await sqlInject(target);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.tool.vulnscan": async ({ params, respond }) => {
    const { target, ports = "1-1000" } = params as { target?: string; ports?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { vulnScan } = await import("../../../republic/kali-agent-loop.js");
    const result = await vulnScan(target, ports);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.tool.sslaudit": async ({ params, respond }) => {
    const { target } = params as { target?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { sslAudit } = await import("../../../republic/kali-agent-loop.js");
    const result = await sslAudit(target);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.tool.bruteforce": async ({ params, respond }) => {
    const { target, service, port } = params as { target?: string; service?: string; port?: number };
    if (!target || !service || !port) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target, service, port required"));
      return;
    }
    const { bruteForce } = await import("../../../republic/kali-agent-loop.js");
    const result = await bruteForce(target, service, port);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.tool.compliance": async ({ respond }) => {
    const { complianceAudit } = await import("../../../republic/kali-agent-loop.js");
    const result = await complianceAudit();
    respond(true, { ok: true, ...result }, undefined);
  },

  // ─── Web Scraping & Cloning ──────────────────────────────────

  "republic.cyber.kali.tool.clone": async ({ params, respond }) => {
    const { target, depth = 3 } = params as { target?: string; depth?: number };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { websiteClone } = await import("../../../republic/kali-agent-loop.js");
    const result = await websiteClone(target, depth);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.tool.crawl": async ({ params, respond }) => {
    const { target } = params as { target?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { webCrawl } = await import("../../../republic/kali-agent-loop.js");
    const result = await webCrawl(target);
    respond(true, { ok: true, ...result }, undefined);
  },

  // ─── Exploit DB & CVE Dictionary ─────────────────────────────

  "republic.cyber.kali.exploitdb.sync": async ({ respond }) => {
    const { syncExploitDb } = await import("../../../republic/kali-agent-loop.js");
    const result = await syncExploitDb();
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.exploitdb.search": async ({ params, respond }) => {
    const { query, maxResults = 20 } = params as { query?: string; maxResults?: number };
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    const { exploitDictSearch } = await import("../../../republic/kali-agent-loop.js");
    const result = await exploitDictSearch(query, maxResults);
    respond(true, { ok: true, ...result }, undefined);
  },

  // ─── Planner Agent ───────────────────────────────────────────

  "republic.cyber.kali.planner.fingerprint": async ({ params, respond }) => {
    const { target } = params as { target?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { fingerprintTarget } = await import("../../../republic/kali-planner.js");
    const fp = await fingerprintTarget(target);
    respond(true, { ok: true, fingerprint: fp }, undefined);
  },

  "republic.cyber.kali.planner.plan": async ({ params, respond }) => {
    const { target, scanType, ports } = params as { target?: string; scanType?: string; ports?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { fingerprintTarget, buildScanPlan } = await import("../../../republic/kali-planner.js");
    const fp = await fingerprintTarget(target);
    const plan = buildScanPlan(target, fp, scanType, ports);
    respond(true, { ok: true, plan }, undefined);
  },

  "republic.cyber.kali.planner.execute": async ({ params, respond }) => {
    const { target, scanType, ports } = params as { target?: string; scanType?: string; ports?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { fingerprintTarget, buildScanPlan, executePlan } = await import("../../../republic/kali-planner.js");
    const fp = await fingerprintTarget(target);
    const plan = buildScanPlan(target, fp, scanType, ports);
    const result = await executePlan(plan);
    respond(true, { ok: true, plan, ...result }, undefined);
  },

  "republic.cyber.kali.planner.patterns": async ({ respond }) => {
    const { getAllPatterns } = await import("../../../republic/kali-rag-loader.js");
    respond(true, { ok: true, patterns: getAllPatterns() }, undefined);
  },

  // ─── Auth Agent ──────────────────────────────────────────────

  "republic.cyber.kali.auth.login": async ({ params, respond }) => {
    const req = params as {
      targetUrl?: string; loginUrl?: string; username?: string; password?: string;
      usernameSelector?: string; passwordSelector?: string; submitSelector?: string;
      waitForCaptcha?: boolean; waitForOtp?: boolean;
    };
    if (!req.targetUrl || !req.username || !req.password) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "targetUrl, username, password required"));
      return;
    }
    const { authenticatedLogin } = await import("../../../republic/kali-auth-agent.js");
    const result = await authenticatedLogin(req as Parameters<typeof authenticatedLogin>[0]);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.kali.auth.pending": async ({ respond }) => {
    const { getPendingAuthSessions } = await import("../../../republic/kali-auth-agent.js");
    respond(true, { ok: true, sessions: getPendingAuthSessions() }, undefined);
  },

  "republic.cyber.kali.auth.provide": async ({ params, respond }) => {
    const { sessionId, input } = params as { sessionId?: string; input?: string };
    if (!sessionId || !input) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "sessionId and input required"));
      return;
    }
    const { provideHumanInput } = await import("../../../republic/kali-auth-agent.js");
    const accepted = provideHumanInput(sessionId, input);
    respond(true, { ok: true, accepted }, undefined);
  },

  // ─── RAG / Tool Knowledge ────────────────────────────────────

  "republic.cyber.kali.rag.tools": async ({ respond }) => {
    const { getAllToolNames, getCategories } = await import("../../../republic/kali-rag-loader.js");
    respond(true, { ok: true, tools: getAllToolNames(), categories: getCategories() }, undefined);
  },

  // ─── Task Supervisor ──────────────────────────────────────────

  "republic.cyber.kali.tasks.active": async ({ respond }) => {
    const { getActiveTasks, formatTaskStatus } = await import("../../../republic/task-supervisor.js");
    const tasks = getActiveTasks().map(t => ({
      id: t.id,
      tool: t.tool,
      target: t.target,
      status: t.status,
      estimatedTimeout: t.estimatedTimeout,
      elapsed: Math.round((Date.now() - t.startedAt) / 1000),
      outputBytes: t.outputBytes,
      extensions: t.extensions,
      display: formatTaskStatus(t),
    }));
    respond(true, { ok: true, tasks }, undefined);
  },

  "republic.cyber.kali.tasks.extend": async ({ params, respond }) => {
    const { taskId, seconds } = params as { taskId?: string; seconds?: number };
    if (!taskId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId required"));
      return;
    }
    const { extendTask } = await import("../../../republic/task-supervisor.js");
    const ok = extendTask(taskId, seconds ?? 120);
    respond(true, { ok }, undefined);
  },

  "republic.cyber.kali.tasks.cancel": async ({ params, respond }) => {
    const { taskId } = params as { taskId?: string };
    if (!taskId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId required"));
      return;
    }
    const { cancelTask } = await import("../../../republic/task-supervisor.js");
    const ok = cancelTask(taskId);
    respond(true, { ok }, undefined);
  },

  // ─── Semantic Search ──────────────────────────────────────────

  "republic.cyber.kali.semantic.search": async ({ params, respond }) => {
    const { query, target, scanId, topK } = params as {
      query?: string; target?: string; scanId?: string; topK?: number;
    };
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    const { searchCrawledContent } = await import("../../../republic/kali-semantic-search.js");
    const results = searchCrawledContent(query, { target, scanId, topK });
    respond(true, { ok: true, ...results }, undefined);
  },

  "republic.cyber.kali.semantic.analyze": async ({ params, respond }) => {
    const { target, scanId, focus } = params as {
      target?: string; scanId?: string; focus?: "secrets" | "pii" | "endpoints" | "debug" | "all";
    };
    if (!target || !scanId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target and scanId required"));
      return;
    }
    const { analyzeContent } = await import("../../../republic/kali-semantic-search.js");
    const analysis = analyzeContent(target, scanId, focus);
    respond(true, { ok: true, ...analysis }, undefined);
  },

  "republic.cyber.kali.semantic.ingest": async ({ params, respond }) => {
    const { rawOutput, target, scanId } = params as {
      rawOutput?: string; target?: string; scanId?: string;
    };
    if (!rawOutput || !target || !scanId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "rawOutput, target, scanId required"));
      return;
    }
    const { ingestCrawlOutput } = await import("../../../republic/kali-semantic-search.js");
    const result = ingestCrawlOutput(rawOutput, target, scanId);
    respond(true, { ok: true, ...result }, undefined);
  },

  // ─── Network Device Discovery ──────────────────────────────────
  "republic.cyber.kali.network.devices": async ({ respond }) => {
    // Return discovered device inventory
    // TODO: Wire to persistent device store once discovery integration is complete
    respond(true, {
      ok: true,
      devices: [],
      segments: [
        { name: "Local LAN",    cidr: "192.168.1.0/24", type: "local",     deviceCount: 0, status: "unknown" as const },
        { name: "TailScale",    cidr: "100.64.0.0/10",  type: "tailscale", deviceCount: 0, status: "unknown" as const },
        { name: "Docker Bridge", cidr: "172.17.0.0/16", type: "vpn",       deviceCount: 0, status: "unknown" as const },
      ],
    }, undefined);
  },

  "republic.cyber.kali.network.discover": async ({ params, respond }) => {
    const { target, deep } = params as { target?: string; deep?: boolean };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required (IP or CIDR range)"));
      return;
    }
    // Kick off nmap discovery via Kali container
    // This will be wired to docker exec nmap -sV -O --script=default <target>
    respond(true, {
      ok: true,
      status: "scan_queued",
      target,
      deep: deep ?? false,
      message: `Discovery scan queued for ${target}`,
    }, undefined);
  },

  // ─── Metasploit Framework ──────────────────────────────────────
  "republic.cyber.kali.msf.search": async ({ params, respond }) => {
    const { query } = params as { query?: string };
    if (!query) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "query required"));
      return;
    }
    const { msfSearch } = await import("../../../republic/kali-metasploit.js");
    const result = await msfSearch(query);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.msf.exploit": async ({ params, respond }) => {
    const { module, payload, options } = params as { module?: string; payload?: string; options?: Record<string, string> };
    if (!module || !options) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "module and options required"));
      return;
    }
    const { msfExploit } = await import("../../../republic/kali-metasploit.js");
    const result = await msfExploit(module, payload || "", options);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.msf.venom": async ({ params, respond }) => {
    const { payload, format, lhost, lport } = params as { payload?: string; format?: string; lhost?: string; lport?: string };
    if (!payload || !format || !lhost || !lport) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "payload, format, lhost, lport required"));
      return;
    }
    const { msfVenom } = await import("../../../republic/kali-metasploit.js");
    const result = await msfVenom(payload, format, lhost, lport);
    respond(true, { ...result }, undefined);
  },

  // ─── Nuclei Mass Scanner ───────────────────────────────────────
  "republic.cyber.kali.nuclei.scan": async ({ params, respond }) => {
    const { target, tags, severity, customTemplate } = params as { target?: string; tags?: string; severity?: string; customTemplate?: string };
    if (!target) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target required"));
      return;
    }
    const { nucleiScan } = await import("../../../republic/kali-nuclei.js");
    const result = await nucleiScan(target, tags, severity, customTemplate);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.nuclei.author": async ({ params, respond }) => {
    const { id, yamlContent } = params as { id?: string; yamlContent?: string };
    if (!id || !yamlContent) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id and yamlContent required"));
      return;
    }
    const { nucleiAuthorTemplate } = await import("../../../republic/kali-nuclei.js");
    const result = await nucleiAuthorTemplate(id, yamlContent);
    respond(true, { ...result }, undefined);
  },

  // ─── Active Directory Exploitation (Impacket) ──────────────────
  "republic.cyber.kali.ad.kerberoast": async ({ params, respond }) => {
    const { domain, username, password, targetDc } = params as { domain?: string; username?: string; password?: string; targetDc?: string };
    if (!domain || !username || !password || !targetDc) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "domain, username, password, targetDc required"));
      return;
    }
    const { impacketKerberoast } = await import("../../../republic/kali-ad-attacks.js");
    const result = await impacketKerberoast(domain, username, password, targetDc);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.ad.secretsdump": async ({ params, respond }) => {
    const { target, domain, username, password } = params as { target?: string; domain?: string; username?: string; password?: string };
    if (!target || !domain || !username || !password) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target, domain, username, password required"));
      return;
    }
    const { impacketSecretsDump } = await import("../../../republic/kali-ad-attacks.js");
    const result = await impacketSecretsDump(target, domain, username, password);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.ad.smbexec": async ({ params, respond }) => {
    const { target, domain, username, password, command } = params as { target?: string; domain?: string; username?: string; password?: string; command?: string };
    if (!target || !domain || !username || !password || !command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target, domain, username, password, command required"));
      return;
    }
    const { impacketSmbExec } = await import("../../../republic/kali-ad-attacks.js");
    const result = await impacketSmbExec(target, domain, username, password, command);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.ad.bloodhound": async ({ params, respond }) => {
    const { domain, username, password, targetDc } = params as { domain?: string; username?: string; password?: string; targetDc?: string };
    if (!domain || !username || !password || !targetDc) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "domain, username, password, targetDc required"));
      return;
    }
    const { adBloodhoundIngest } = await import("../../../republic/kali-ad-attacks.js");
    const result = await adBloodhoundIngest(domain, username, password, targetDc);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.ad.netexec": async ({ params, respond }) => {
    const { target, protocol, username, password, extras } = params as { target?: string; protocol?: string; username?: string; password?: string; extras?: string };
    if (!target || !protocol || !username || !password) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "target, protocol, username, password required"));
      return;
    }
    const { adNetExecSpray } = await import("../../../republic/kali-ad-attacks.js");
    const result = await adNetExecSpray(target, protocol, username, password, extras);
    respond(true, { ...result }, undefined);
  },

  // ─── Reverse Engineering (Radare2) ─────────────────────────────
  "republic.cyber.kali.r2.analyze": async ({ params, respond }) => {
    const { binaryPath, r2Command } = params as { binaryPath?: string; r2Command?: string };
    if (!binaryPath || !r2Command) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "binaryPath, r2Command required"));
      return;
    }
    const { r2Analyze } = await import("../../../republic/kali-r2.js");
    const result = await r2Analyze(binaryPath, r2Command);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.r2.checksec": async ({ params, respond }) => {
    const { binaryPath, mode } = params as { binaryPath?: string; mode?: "I" | "l" | "s" | "iz" | "i" };
    if (!binaryPath) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "binaryPath required"));
      return;
    }
    const { r2Checksec } = await import("../../../republic/kali-r2.js");
    const result = await r2Checksec(binaryPath, mode);
    respond(true, { ...result }, undefined);
  },

  // ─── Command & Control (Sliver) ────────────────────────────────
  "republic.cyber.kali.c2.sliver.start": async ({ respond }) => {
    const { sliverStartDaemon } = await import("../../../republic/kali-c2.js");
    const result = await sliverStartDaemon();
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.c2.sliver.generate": async ({ params, respond }) => {
    const { os, arch, lhost, lport, format } = params as { os?: string; arch?: string; lhost?: string; lport?: string; format?: string };
    if (!os || !arch || !lhost || !lport) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "os, arch, lhost, lport required"));
      return;
    }
    const { sliverGenerateImplant } = await import("../../../republic/kali-c2.js");
    const result = await sliverGenerateImplant(os, arch, lhost, lport, format);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.c2.sliver.sessions": async ({ respond }) => {
    const { sliverListSessions } = await import("../../../republic/kali-c2.js");
    const result = await sliverListSessions();
    respond(true, { ...result }, undefined);
  },

  // ─── Web Application Exploitation (SQLMap & BeEF) ──────────────
  "republic.cyber.kali.web.sqlmap": async ({ params, respond }) => {
    const { url, extraFlags } = params as { url?: string; extraFlags?: string };
    if (!url) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "url required"));
      return;
    }
    const { sqlmapAutomate } = await import("../../../republic/kali-web-exploits.js");
    const result = await sqlmapAutomate(url, extraFlags);
    respond(true, { ...result }, undefined);
  },

  "republic.cyber.kali.web.beef": async ({ respond }) => {
    const { beefStart } = await import("../../../republic/kali-web-exploits.js");
    const result = await beefStart();
    respond(true, { ...result }, undefined);
  },

  // ─── Auto-Mitigation Engine (Firewall & WAF Generation) ────────
  "republic.cyber.kali.mitigation.generate": async ({ params, respond }) => {
    const { type, payload, maliciousIp } = params as { type?: string; payload?: string; maliciousIp?: string };
    if (!type || !payload) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "type and payload required"));
      return;
    }
    
    // Lazy load the mitigation generator
    const { generateIptablesRules, generateWafRules, generateSnortSignature } = await import("../../../republic/kali-mitigation.js");
    
    let result;
    if (type === "iptables") {
      result = await generateIptablesRules(payload, maliciousIp);
    } else if (type === "waf") {
      result = await generateWafRules(payload);
    } else {
      result = await generateSnortSignature(payload);
    }
    
    respond(true, { ...result }, undefined);
  },

  // ─── Zero-Day Guardian ─────────────────────────────────────────

  "republic.cyber.kali.guardian.status": async ({ respond }) => {
    const { getGuardianStatus } = await import("../../../republic/kali-zero-day-guardian.js");
    respond(true, { ok: true, ...getGuardianStatus() }, undefined);
  },

  "republic.cyber.kali.guardian.devices.list": async ({ respond }) => {
    const { getRegisteredDevices } = await import("../../../republic/kali-zero-day-guardian.js");
    respond(true, { ok: true, devices: getRegisteredDevices() }, undefined);
  },

  "republic.cyber.kali.guardian.device.register": async ({ params, respond }) => {
    const p = params as { id: string; label: string; platform: string; ipAddress?: string; osVersion?: string; appVersion?: string };
    if (!p.id || !p.label || !p.platform) { throw new Error("id, label, platform required"); }
    const { registerDevice } = await import("../../../republic/kali-zero-day-guardian.js");
    registerDevice({
      id: p.id, label: p.label,
      platform: p.platform as never,
      ipAddress: p.ipAddress,
      osVersion: p.osVersion,
      appVersion: p.appVersion,
    });
    respond(true, { ok: true, message: `Device "${p.label}" registered for guardian monitoring` }, undefined);
  },

  "republic.cyber.kali.guardian.device.remove": async ({ params, respond }) => {
    const { deviceId } = params as { deviceId: string };
    if (!deviceId) { throw new Error("deviceId required"); }
    const { unregisterDevice } = await import("../../../republic/kali-zero-day-guardian.js");
    unregisterDevice(deviceId);
    respond(true, { ok: true }, undefined);
  },

  "republic.cyber.kali.guardian.scan": async ({ respond }) => {
    const { runGuardianScan } = await import("../../../republic/kali-zero-day-guardian.js");
    const results = await runGuardianScan();
    const exposed = results.filter(r => r.exposed);
    respond(true, { ok: true, total: results.length, exposed: exposed.length, results }, undefined);
  },

  "republic.cyber.kali.guardian.mitigations": async ({ respond }) => {
    const { getActiveMitigations } = await import("../../../republic/kali-zero-day-guardian.js");
    respond(true, { ok: true, mitigations: getActiveMitigations() }, undefined);
  },

  "republic.cyber.kali.guardian.patch.check": async ({ respond }) => {
    const { checkPatchStatus } = await import("../../../republic/kali-zero-day-guardian.js");
    const results = await checkPatchStatus();
    respond(true, { ok: true, results }, undefined);
  },

  "republic.cyber.kali.guardian.probes": async ({ respond }) => {
    const { getProbeHistory } = await import("../../../republic/kali-zero-day-guardian.js");
    respond(true, { ok: true, probes: getProbeHistory(100) }, undefined);
  },

  "republic.cyber.kali.guardian.vulns.search": async ({ params, respond }) => {
    const { query = "", platform = "", limit = 20 } = params as { query?: string; platform?: string; limit?: number };
    const { queryThreatIntel } = await import("../../../republic/intelligence/threat-intel-vector.js");
    const q = [platform, query].filter(Boolean).join(" ") || "exploit vulnerability";
    const results = queryThreatIntel(q, limit);
    respond(true, { ok: true, total: results.length, results }, undefined);
  },

  // ─── Vulnerability Researcher ──────────────────────────────────

  "republic.cyber.kali.researcher.status": async ({ respond }) => {
    const { getResearcherStatus } = await import("../../../republic/agents/vulnerability-researcher.js");
    respond(true, { ok: true, ...getResearcherStatus() }, undefined);
  },

  "republic.cyber.kali.researcher.start": async ({ respond }) => {
    const { startResearcherLoop } = await import("../../../republic/agents/vulnerability-researcher.js");
    startResearcherLoop();
    respond(true, { ok: true, message: "Vulnerability Researcher loop started" }, undefined);
  },

  "republic.cyber.kali.researcher.stop": async ({ respond }) => {
    const { stopResearcherLoop } = await import("../../../republic/agents/vulnerability-researcher.js");
    stopResearcherLoop();
    respond(true, { ok: true, message: "Vulnerability Researcher loop stopped" }, undefined);
  },

  "republic.cyber.kali.researcher.cycle": async ({ params, respond }) => {
    const { batchSize = 5 } = params as { batchSize?: number };
    const { runResearchCycle } = await import("../../../republic/agents/vulnerability-researcher.js");
    const findings = await runResearchCycle(batchSize);
    respond(true, {
      ok: true,
      total: findings.length,
      findings: findings.map(f => ({ id: f.id, cve: f.cve, severity: f.severity, confidence: f.confidence, status: f.status })),
    }, undefined);
  },

  "republic.cyber.kali.researcher.findings": async ({ params, respond }) => {
    const { limit = 50, status } = params as { limit?: number; status?: string };
    const mod = await import("../../../republic/agents/vulnerability-researcher.js");
    const findings = status
      ? mod.getFindingsByStatus(status as "pending" | "confirmed" | "testing" | "false_positive" | "mitigated")
      : mod.getFindings(limit);
    respond(true, { ok: true, total: findings.length, findings }, undefined);
  },

  "republic.cyber.kali.researcher.finding": async ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { throw new Error("id required"); }
    const { getFinding } = await import("../../../republic/agents/vulnerability-researcher.js");
    const finding = getFinding(id);
    if (!finding) { throw new Error(`Finding ${id} not found`); }
    respond(true, { ok: true, finding }, undefined);
  },

  "republic.cyber.kali.researcher.test": async ({ params, respond }) => {
    const { findingId } = params as { findingId: string };
    if (!findingId) { throw new Error("findingId required"); }
    const { testFindingInSandbox } = await import("../../../republic/agents/vulnerability-researcher.js");
    const result = await testFindingInSandbox(findingId);
    respond(true, { ok: true, ...result }, undefined);
  },

  // ─── Blue Team Synthesizer ────────────────────────────────────

  "republic.cyber.kali.blueteam.status": async ({ respond }) => {
    const { getSynthesizerStatus } = await import("../../../republic/blue-team-synthesizer.js");
    respond(true, { ok: true, ...getSynthesizerStatus() }, undefined);
  },

  "republic.cyber.kali.blueteam.rules": async ({ params, respond }) => {
    const { type, cve, limit = 50 } = params as { type?: string; cve?: string; limit?: number };
    const { getRules } = await import("../../../republic/blue-team-synthesizer.js");
    const rules = getRules({ type: type as "waf" | "ids" | "firewall" | "yara" | "blocklist" | undefined, cve, limit });
    respond(true, { ok: true, total: rules.length, rules }, undefined);
  },

  "republic.cyber.kali.blueteam.rule": async ({ params, respond }) => {
    const { id } = params as { id: string };
    if (!id) { throw new Error("id required"); }
    const { getRule } = await import("../../../republic/blue-team-synthesizer.js");
    const rule = getRule(id);
    if (!rule) { throw new Error(`Rule ${id} not found`); }
    respond(true, { ok: true, rule }, undefined);
  },

  "republic.cyber.kali.blueteam.synthesize": async ({ params, respond }) => {
    const { findingId } = params as { findingId: string };
    if (!findingId) { throw new Error("findingId required"); }
    const { getFinding } = await import("../../../republic/agents/vulnerability-researcher.js");
    const finding = getFinding(findingId);
    if (!finding) { throw new Error(`Finding ${findingId} not found`); }
    const { synthesizeDefenseRules } = await import("../../../republic/blue-team-synthesizer.js");
    const rules = synthesizeDefenseRules(finding);
    respond(true, { ok: true, total: rules.length, rules: rules.map(r => ({ id: r.id, ruleType: r.ruleType, cve: r.cve, ruleName: r.ruleName })) }, undefined);
  },

  "republic.cyber.kali.blueteam.apply": async ({ params, respond }) => {
    const { ruleId } = params as { ruleId: string };
    if (!ruleId) { throw new Error("ruleId required"); }
    const { applyRuleToSandbox } = await import("../../../republic/blue-team-synthesizer.js");
    const result = await applyRuleToSandbox(ruleId);
    respond(true, { ok: true, ...result }, undefined);
  },

  // ─── Android Forensic Lab ────────────────────────────────────

  "republic.cyber.android.status": async ({ respond }) => {
    const { getLabStatus } = await import("../../../republic/android-forensic-lab.js");
    respond(true, { ok: true, ...getLabStatus() }, undefined);
  },

  "republic.cyber.android.devices.list": async ({ respond }) => {
    const { listDevices } = await import("../../../republic/android-forensic-lab.js");
    respond(true, { ok: true, devices: listDevices() }, undefined);
  },

  "republic.cyber.android.device.connect": async ({ params, respond }) => {
    const { ip, port } = params as { ip?: string; port?: number };
    if (!ip) { throw new Error("ip is required (e.g. 192.168.1.100)"); }
    const { connectDevice } = await import("../../../republic/android-forensic-lab.js");
    const result = await connectDevice(ip, port);
    if (!result.ok) { throw new Error(result.error); }
    respond(true, { ok: true, device: result.device }, undefined);
  },

  "republic.cyber.android.device.disconnect": async ({ params, respond }) => {
    const { deviceId } = params as { deviceId?: string };
    if (!deviceId) { throw new Error("deviceId required"); }
    const { disconnectDevice } = await import("../../../republic/android-forensic-lab.js");
    const ok = await disconnectDevice(deviceId);
    respond(true, { ok }, undefined);
  },

  "republic.cyber.android.device.info": async ({ params, respond }) => {
    const { deviceId } = params as { deviceId?: string };
    if (!deviceId) { throw new Error("deviceId required"); }
    const { getDevice } = await import("../../../republic/android-forensic-lab.js");
    const device = getDevice(deviceId);
    if (!device) { throw new Error(`Device ${deviceId} not found`); }
    respond(true, { ok: true, device }, undefined);
  },

  "republic.cyber.android.scan.quick": async ({ params, respond }) => {
    const { deviceId } = params as { deviceId?: string };
    if (!deviceId) { throw new Error("deviceId required"); }
    const { quickSecurityAudit } = await import("../../../republic/android-forensic-lab.js");
    const report = await quickSecurityAudit(deviceId);
    respond(true, { ok: true, report }, undefined);
  },

  "republic.cyber.android.scan.full": async ({ params, respond }) => {
    const { deviceId } = params as { deviceId?: string };
    if (!deviceId) { throw new Error("deviceId required"); }
    const { fullForensicScan } = await import("../../../republic/android-forensic-lab.js");
    const report = await fullForensicScan(deviceId);
    respond(true, { ok: true, report }, undefined);
  },

  "republic.cyber.android.apk.analyze": async ({ params, respond }) => {
    const { deviceId, packageName } = params as { deviceId?: string; packageName?: string };
    if (!deviceId || !packageName) { throw new Error("deviceId and packageName required"); }
    const { extractAndAnalyzeApk } = await import("../../../republic/android-forensic-lab.js");
    const report = await extractAndAnalyzeApk(deviceId, packageName);
    respond(true, { ok: true, report }, undefined);
  },

  "republic.cyber.android.reports.list": async ({ params, respond }) => {
    const { deviceId, limit } = params as { deviceId?: string; limit?: number };
    const { listReports } = await import("../../../republic/android-forensic-lab.js");
    respond(true, { ok: true, reports: listReports({ deviceId, limit }) }, undefined);
  },

  "republic.cyber.android.report.get": async ({ params, respond }) => {
    const { reportId } = params as { reportId?: string };
    if (!reportId) { throw new Error("reportId required"); }
    const { getReport } = await import("../../../republic/android-forensic-lab.js");
    const report = getReport(reportId);
    if (!report) { throw new Error(`Report ${reportId} not found`); }
    respond(true, { ok: true, report }, undefined);
  },

  // ─── WhatsApp Scanner ────────────────────────────────────────

  "republic.cyber.whatsapp.scan": async ({ params, respond }) => {
    const { deviceId } = params as { deviceId?: string };
    if (!deviceId) { throw new Error("deviceId required. Connect an Android device first."); }
    const { scanWhatsApp } = await import("../../../republic/whatsapp-scanner.js");
    const result = await scanWhatsApp(deviceId);
    respond(true, { ok: true, ...result }, undefined);
  },

  "republic.cyber.whatsapp.cves": async ({ respond }) => {
    respond(true, {
      ok: true,
      cves: [
        { cve: "CVE-2025-30401", severity: "critical", title: "MIME Type Confusion RCE", affectedBelow: "2.25.8.82" },
        { cve: "CVE-2025-55177", severity: "critical", title: "Paragon Graphite Zero-Click", affectedBelow: "2.25.6.80" },
        { cve: "CVE-2024-7587", severity: "critical", title: "Video Call Buffer Overflow", affectedBelow: "2.24.20.76" },
        { cve: "CVE-2024-0024", severity: "high", title: "GIF Processing OOB Read", affectedBelow: "2.24.3.77" },
        { cve: "CVE-2023-38831", severity: "critical", title: "Archive Extraction RCE", affectedBelow: "2.23.25.83" },
        { cve: "CVE-2022-36934", severity: "critical", title: "Video Call Integer Overflow", affectedBelow: "2.22.16.12" },
        { cve: "CVE-2022-27492", severity: "high", title: "Crafted Video File RCE", affectedBelow: "2.22.15.9" },
        { cve: "CVE-2021-24042", severity: "critical", title: "Image Filter OOB Write", affectedBelow: "2.21.23.2" },
        { cve: "CVE-2019-3568", severity: "critical", title: "Pegasus VoIP Buffer Overflow", affectedBelow: "2.19.134" },
      ],
    }, undefined);
  },

  "republic.cyber.whatsapp.spyware.indicators": async ({ respond }) => {
    respond(true, {
      ok: true,
      indicators: {
        processNames: ["pegasus", "chrysaor", "graphite", "predator", "hermit", "candiru", "cytrox", "quadream", "intellexa", "paragon"],
        filePatterns: ["/data/local/tmp/.X11", "/system/csk", "/data/.peg", "/sdcard/.graphite", "libjustart.so", "libmediacodec_extra.so"],
        description: "These indicators are checked during a WhatsApp scan to detect commercial/state-sponsored spyware.",
      },
    }, undefined);
  },

  // ─── Flipper Zero Orchestrator ───────────────────────────────

  "republic.cyber.flipper.status": async ({ respond }) => {
    const { getFlipperStatus } = await import("../../../republic/flipper-zero-orchestrator.js");
    respond(true, { ok: true, ...getFlipperStatus() }, undefined);
  },

  "republic.cyber.flipper.connect": async ({ params, respond }) => {
    const { port } = params as { port?: string };
    const { connectFlipper } = await import("../../../republic/flipper-zero-orchestrator.js");
    const status = await connectFlipper(port);
    respond(true, { ok: true, ...status }, undefined);
  },

  "republic.cyber.flipper.disconnect": async ({ respond }) => {
    const { disconnectFlipper } = await import("../../../republic/flipper-zero-orchestrator.js");
    disconnectFlipper();
    respond(true, { ok: true }, undefined);
  },

  "republic.cyber.flipper.command": async ({ params, respond }) => {
    const { command } = params as { command?: string };
    if (!command) { throw new Error("command required (e.g. 'info', 'storage list /ext')"); }
    const { executeCommand } = await import("../../../republic/flipper-zero-orchestrator.js");
    const result = await executeCommand(command);
    const { ok: cmdOk, ...rest } = result;
    respond(true, { ok: cmdOk, ...rest }, undefined);
  },

  "republic.cyber.flipper.subghz.read": async ({ params, respond }) => {
    const { frequency, duration } = params as { frequency?: number; duration?: number };
    const { subGhzRead } = await import("../../../republic/flipper-zero-orchestrator.js");
    const signals = await subGhzRead(frequency, duration);
    respond(true, { ok: true, signals }, undefined);
  },

  "republic.cyber.flipper.subghz.transmit": async ({ params, respond }) => {
    const { filePath, repeat } = params as { filePath?: string; repeat?: number };
    if (!filePath) { throw new Error("filePath required (path on Flipper SD)"); }
    const { subGhzTransmit } = await import("../../../republic/flipper-zero-orchestrator.js");
    const result = await subGhzTransmit(filePath, repeat);
    const { ok: txOk, ...txRest } = result;
    respond(true, { ok: txOk, ...txRest }, undefined);
  },

  "republic.cyber.flipper.nfc.read": async ({ respond }) => {
    const { nfcRead } = await import("../../../republic/flipper-zero-orchestrator.js");
    const card = await nfcRead();
    respond(true, { ok: !!card, card }, undefined);
  },

  "republic.cyber.flipper.nfc.emulate": async ({ params, respond }) => {
    const { filePath } = params as { filePath?: string };
    if (!filePath) { throw new Error("filePath required"); }
    const { nfcEmulate } = await import("../../../republic/flipper-zero-orchestrator.js");
    const result = await nfcEmulate(filePath);
    const { ok: emOk, ...emRest } = result;
    respond(true, { ok: emOk, ...emRest }, undefined);
  },

  "republic.cyber.flipper.ir.send": async ({ params, respond }) => {
    const { protocol, address, command } = params as { protocol?: string; address?: string; command?: string };
    if (!protocol || !address || !command) { throw new Error("protocol, address, and command required"); }
    const { irSend } = await import("../../../republic/flipper-zero-orchestrator.js");
    const result = await irSend(protocol, address, command);
    const { ok: irOk, ...irRest } = result;
    respond(true, { ok: irOk, ...irRest }, undefined);
  },

  "republic.cyber.flipper.badusb.deploy": async ({ params, respond }) => {
    const { scriptPath } = params as { scriptPath?: string };
    if (!scriptPath) { throw new Error("scriptPath required"); }
    const { badUsbDeploy } = await import("../../../republic/flipper-zero-orchestrator.js");
    const result = await badUsbDeploy(scriptPath);
    const { ok: buOk, ...buRest } = result;
    respond(true, { ok: buOk, ...buRest }, undefined);
  },

  "republic.cyber.flipper.gpio.control": async ({ params, respond }) => {
    const { pin, action, value } = params as { pin?: string; action?: "read" | "set"; value?: number };
    if (!pin) { throw new Error("pin required"); }
    if (action === "set") {
      const { gpioSet } = await import("../../../republic/flipper-zero-orchestrator.js");
      const result = await gpioSet(pin, (value ?? 0) as 0 | 1);
      const { ok: setOk, ...setRest } = result;
      respond(true, { ok: setOk, ...setRest }, undefined);
    } else {
      const { gpioRead } = await import("../../../republic/flipper-zero-orchestrator.js");
      const result = await gpioRead(pin);
      respond(true, { ok: true, ...result }, undefined);
    }
  },

  "republic.cyber.flipper.cli.reference": async ({ respond }) => {
    const { getCliReference } = await import("../../../republic/flipper-zero-orchestrator.js");
    respond(true, { ok: true, commands: getCliReference() }, undefined);
  },

  "republic.cyber.flipper.history": async ({ params, respond }) => {
    const { limit } = params as { limit?: number };
    const { getCommandHistory } = await import("../../../republic/flipper-zero-orchestrator.js");
    respond(true, { ok: true, history: getCommandHistory(limit) }, undefined);
  },
};
