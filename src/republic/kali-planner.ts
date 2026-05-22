/**
 * Kali Planner Agent — Target fingerprinting and scan DAG generation
 *
 * Replaces the hardcoded scan pipeline with an intelligent planner that:
 * 1. Fingerprints the target (stack detection via HTTP headers + content)
 * 2. Selects the optimal scan pattern
 * 3. Builds a directed acyclic graph (DAG) of tool executions
 * 4. Supports mid-scan re-planning based on tool outputs
 */

import { getLogger } from "../logging.js";
import {
  matchScanPattern,
  getToolChain,
  buildToolCommand,
  getToolPrompt,
  type ScanPattern,
} from "./kali-rag-loader.js";
import { kaliExec, type Finding, type PhaseResult } from "./kali-agent-loop.js";

const logger = getLogger();

// ─── Types ──────────────────────────────────────────────────────

export interface TargetFingerprint {
  url: string;
  ip?: string;
  stack: string[];           // ["nginx", "react", "node.js"]
  cms?: string;              // "wordpress" | "drupal" | "joomla" | etc.
  isSPA: boolean;
  isAPI: boolean;
  isEcommerce: boolean;
  isNetwork: boolean;        // IP/CIDR (no HTTP)
  hasAuth: boolean;          // Has login form
  serverHeader?: string;
  poweredBy?: string;
  headers: Record<string, string>;
  technologies: string[];
}

export interface ScanTask {
  id: string;
  tool: string;
  mode?: string;
  target: string;
  command: string;
  depends: string[];         // task IDs this depends on
  status: "pending" | "running" | "done" | "skipped" | "failed";
  priority: number;          // lower = runs first
  timeout: number;
  result?: PhaseResult;
}

export interface ScanPlan {
  id: string;
  target: string;
  fingerprint: TargetFingerprint;
  pattern: string;           // e.g. "spa_react_vue"
  tasks: ScanTask[];
  authRequired: boolean;
  authState?: AuthState;
  createdAt: number;
}

export interface AuthState {
  cookies?: string;
  bearerToken?: string;
  localStorage?: Record<string, string>;
  sessionId?: string;
  method: "cookie" | "bearer" | "basic" | "none";
}

// ─── Target Fingerprinting ──────────────────────────────────────

export async function fingerprintTarget(target: string): Promise<TargetFingerprint> {
  const isNetworkTarget = /^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(target) || /^[a-fA-F0-9:]+$/.test(target);
  const url = target.startsWith("http") ? target : `https://${target}`;

  const fp: TargetFingerprint = {
    url,
    stack: [],
    isSPA: false,
    isAPI: false,
    isEcommerce: false,
    isNetwork: isNetworkTarget,
    hasAuth: false,
    headers: {},
    technologies: [],
  };

  if (isNetworkTarget) {
    fp.ip = target;
    return fp;
  }

  try {
    // 1. Grab HTTP headers
    const headersResult = await kaliExec(`curl -sIL "${url}" 2>/dev/null | head -50`, 15);
    const headerLines = headersResult.stdout.split("\n");
    for (const line of headerLines) {
      const [key, ...valParts] = line.split(":");
      if (key && valParts.length > 0) {
        fp.headers[key.trim().toLowerCase()] = valParts.join(":").trim();
      }
    }

    fp.serverHeader = fp.headers["server"];
    fp.poweredBy = fp.headers["x-powered-by"];

    if (fp.serverHeader) { fp.stack.push(fp.serverHeader.split("/")[0].toLowerCase()); }
    if (fp.poweredBy) { fp.stack.push(fp.poweredBy.toLowerCase()); }

    // 2. Grab page content for stack detection
    const bodyResult = await kaliExec(`curl -sL "${url}" 2>/dev/null | head -200`, 15);
    const body = bodyResult.stdout.toLowerCase();

    // SPA detection
    if (body.includes("__next") || body.includes("_next/static")) { fp.stack.push("next.js"); fp.isSPA = true; }
    if (body.includes("react") || body.includes("reactdom")) { fp.stack.push("react"); fp.isSPA = true; }
    if (body.includes("vue.js") || body.includes("vue.min.js") || body.includes("__vue__")) { fp.stack.push("vue"); fp.isSPA = true; }
    if (body.includes("angular") || body.includes("ng-app")) { fp.stack.push("angular"); fp.isSPA = true; }
    if (body.includes("svelte") || body.includes("__svelte")) { fp.stack.push("svelte"); fp.isSPA = true; }

    // CMS detection
    if (body.includes("wp-content") || body.includes("wordpress")) { fp.cms = "wordpress"; fp.stack.push("wordpress"); }
    if (body.includes("drupal") || body.includes("sites/default")) { fp.cms = "drupal"; fp.stack.push("drupal"); }
    if (body.includes("joomla")) { fp.cms = "joomla"; fp.stack.push("joomla"); }

    // E-commerce detection
    if (body.includes("shopify") || body.includes("add-to-cart") || body.includes("woocommerce") ||
        body.includes("magento") || body.includes("checkout")) {
      fp.isEcommerce = true;
      fp.stack.push("ecommerce");
    }

    // Auth detection
    if (body.includes('type="password"') || body.includes("login") || body.includes("signin") ||
        body.includes("sign-in") || body.includes("log-in")) {
      fp.hasAuth = true;
    }

    // API detection (no HTML, JSON response)
    const contentType = fp.headers["content-type"] || "";
    if (contentType.includes("application/json") && !body.includes("<html")) {
      fp.isAPI = true;
      fp.stack.push("api");
    }

    // Technology fingerprinting via headers
    if (fp.headers["x-aspnet-version"]) { fp.stack.push("asp.net"); }
    if (fp.headers["x-drupal-cache"]) { fp.cms = "drupal"; fp.stack.push("drupal"); }
    if (fp.headers["x-generator"]?.includes("WordPress")) { fp.cms = "wordpress"; }

    fp.technologies = [...new Set(fp.stack)];

  } catch (err) {
    logger.warn(`Fingerprinting failed for ${target}: ${err}`);
  }

  return fp;
}

// ─── Scan Plan Generation ───────────────────────────────────────

export function buildScanPlan(
  target: string,
  fingerprint: TargetFingerprint,
  requestedType?: string,
  ports?: string,
  auth?: AuthState,
): ScanPlan {
  // Determine pattern — user override or auto-detect
  let patternId: string;
  if (requestedType && ["quick", "full", "web", "recon", "network", "compliance"].includes(requestedType)) {
    // Map simple scan types to patterns
    switch (requestedType) {
      case "quick": patternId = "network_infra"; break;
      case "web": patternId = fingerprint.cms === "wordpress" ? "wordpress" : "spa_react_vue"; break;
      case "recon": patternId = "network_infra"; break;
      case "network": patternId = "network_infra"; break;
      case "full": patternId = "full_pentest"; break;
      default: patternId = "full_pentest";
    }
  } else {
    patternId = matchScanPattern({
      hasWordPress: fingerprint.cms === "wordpress",
      isSPA: fingerprint.isSPA,
      isAPI: fingerprint.isAPI,
      isNetwork: fingerprint.isNetwork,
      isEcommerce: fingerprint.isEcommerce,
    });
  }

  const toolChain = getToolChain(patternId);
  const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // Build tasks from tool chain
  const tasks: ScanTask[] = [];
  let priority = 0;

  // Group tools by phase for dependency resolution
  const reconTools = toolChain.filter(t => {
    const prompt = getToolPrompt(t.tool);
    return prompt?.cat === "recon";
  });
  const webTools = toolChain.filter(t => {
    const prompt = getToolPrompt(t.tool);
    return prompt?.cat === "web";
  });
  const scrapingTools = toolChain.filter(t => {
    const prompt = getToolPrompt(t.tool);
    return prompt?.cat === "scraping";
  });
  const exploitTools = toolChain.filter(t => {
    const prompt = getToolPrompt(t.tool);
    return prompt?.cat === "exploit" || prompt?.cat === "exploit-db";
  });
  const networkTools = toolChain.filter(t => {
    const prompt = getToolPrompt(t.tool);
    return prompt?.cat === "network";
  });
  const complianceTools = toolChain.filter(t => {
    const prompt = getToolPrompt(t.tool);
    return prompt?.cat === "compliance";
  });

  // Phase 1: Recon (no dependencies)
  for (const t of reconTools) {
    const prompt = getToolPrompt(t.tool);
    const cmd = buildToolCommand(t.tool, target, {
      ports,
      mode: t.mode,
      auth: auth?.cookies || auth?.bearerToken,
    });
    if (cmd) {
      tasks.push({
        id: `${planId}_${t.tool}`,
        tool: t.tool,
        mode: t.mode,
        target,
        command: cmd,
        depends: [],
        status: "pending",
        priority: priority++,
        timeout: prompt?.timeout || 120,
      });
    }
  }

  // Phase 2: Web testing (depends on recon completing)
  const reconIds = tasks.map(t => t.id);
  for (const t of webTools) {
    const prompt = getToolPrompt(t.tool);
    const cmd = buildToolCommand(t.tool, target, {
      ports,
      mode: t.mode,
      auth: auth?.cookies || auth?.bearerToken,
    });
    if (cmd) {
      tasks.push({
        id: `${planId}_${t.tool}`,
        tool: t.tool,
        mode: t.mode,
        target,
        command: cmd,
        depends: reconIds.slice(0, 1), // Depends on first recon (nmap)
        status: "pending",
        priority: priority++,
        timeout: prompt?.timeout || 300,
      });
    }
  }

  // Phase 2b: Scraping (depends on web phase starting)
  const webIds = tasks.filter(t => webTools.some(w => t.tool === w.tool)).map(t => t.id);
  for (const t of scrapingTools) {
    const prompt = getToolPrompt(t.tool);
    const cmd = buildToolCommand(t.tool, target, {
      ports,
      mode: t.mode,
      auth: auth?.cookies || auth?.bearerToken,
    });
    if (cmd) {
      tasks.push({
        id: `${planId}_${t.tool}`,
        tool: t.tool,
        mode: t.mode,
        target,
        command: cmd,
        depends: webIds.slice(0, 1), // Can start after first web tool
        status: "pending",
        priority: priority++,
        timeout: prompt?.timeout || 300,
      });
    }
  }

  // Phase 3: Exploitation (depends on web + recon)
  for (const t of exploitTools) {
    const prompt = getToolPrompt(t.tool);
    const cmd = buildToolCommand(t.tool, target, {
      ports,
      mode: t.mode,
      auth: auth?.cookies || auth?.bearerToken,
    });
    if (cmd) {
      tasks.push({
        id: `${planId}_${t.tool}`,
        tool: t.tool,
        mode: t.mode,
        target,
        command: cmd,
        depends: [...reconIds.slice(0, 1), ...webIds.slice(0, 1)].filter(Boolean),
        status: "pending",
        priority: priority++,
        timeout: prompt?.timeout || 300,
      });
    }
  }

  // Phase 4: Network (can run in parallel with web)
  for (const t of networkTools) {
    const prompt = getToolPrompt(t.tool);
    const cmd = buildToolCommand(t.tool, target, { ports, mode: t.mode });
    if (cmd) {
      tasks.push({
        id: `${planId}_${t.tool}`,
        tool: t.tool,
        mode: t.mode,
        target,
        command: cmd,
        depends: reconIds.slice(0, 1),
        status: "pending",
        priority: priority++,
        timeout: prompt?.timeout || 60,
      });
    }
  }

  // Phase 5: Compliance (independent)
  for (const t of complianceTools) {
    const prompt = getToolPrompt(t.tool);
    const cmd = buildToolCommand(t.tool, target, { mode: t.mode });
    if (cmd) {
      tasks.push({
        id: `${planId}_${t.tool}`,
        tool: t.tool,
        mode: t.mode,
        target,
        command: cmd,
        depends: [],
        status: "pending",
        priority: priority++,
        timeout: prompt?.timeout || 300,
      });
    }
  }

  logger.info(`[${planId}] Built plan with ${tasks.length} tasks using pattern "${patternId}" for target "${target}" (stack: ${fingerprint.technologies.join(", ")})`);

  return {
    id: planId,
    target,
    fingerprint,
    pattern: patternId,
    tasks,
    authRequired: fingerprint.hasAuth,
    authState: auth,
    createdAt: Date.now(),
  };
}

// ─── DAG Executor ───────────────────────────────────────────────

/**
 * Execute a scan plan DAG, respecting dependencies and parallelism.
 * Returns accumulated findings.
 */
export async function executePlan(
  plan: ScanPlan,
  onProgress?: (task: ScanTask) => void,
): Promise<{ findings: Finding[]; phases: PhaseResult[] }> {
  const findings: Finding[] = [];
  const phases: PhaseResult[] = [];
  const completed = new Set<string>();

  // Sort by priority
  const sorted = [...plan.tasks].toSorted((a, b) => a.priority - b.priority);

  // Execute in waves — tasks whose dependencies are all met
  while (sorted.some(t => t.status === "pending")) {
    // Find tasks ready to run (all deps completed)
    const ready = sorted.filter(
      t => t.status === "pending" && t.depends.every(d => completed.has(d)),
    );

    if (ready.length === 0) {
      logger.warn(`[${plan.id}] No ready tasks but pending tasks remain — possible circular dependency`);
      break;
    }

    // Run ready tasks in parallel (max 3 concurrent)
    const batch = ready.slice(0, 3);
    logger.info(`[${plan.id}] Executing batch: ${batch.map(t => t.tool).join(", ")}`);

    const results = await Promise.allSettled(
      batch.map(async (task) => {
        task.status = "running";
        onProgress?.(task);

        const start = Date.now();
        try {
          const result = await kaliExec(task.command, task.timeout);
          const phase: PhaseResult = {
            phase: task.tool,
            tool: task.tool,
            command: task.command,
            output: result.stdout,
            exitCode: result.exitCode,
            duration: Date.now() - start,
            findings: [], // Will be populated by parsers
          };
          task.result = phase;
          task.status = "done";
          completed.add(task.id);
          return phase;
        } catch (err) {
          task.status = "failed";
          completed.add(task.id); // Mark completed even on failure to unblock dependents
          logger.error(`[${plan.id}] Task ${task.tool} failed: ${err}`);
          return {
            phase: task.tool,
            tool: task.tool,
            command: task.command,
            output: `Error: ${err}`,
            exitCode: 1,
            duration: Date.now() - start,
            findings: [{
              severity: "info" as const,
              title: `Tool Failed: ${task.tool}`,
              description: `${task.tool} failed: ${err instanceof Error ? err.message : String(err)}`,
              evidence: String(err),
              remediation: "Check tool installation and target accessibility.",
              tool: task.tool,
              phase: task.tool,
            }],
          };
        }
      }),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        phases.push(result.value);
        findings.push(...result.value.findings);
      }
    }
  }

  logger.info(`[${plan.id}] Plan complete — ${findings.length} findings from ${phases.length} phases`);
  return { findings, phases };
}

// ─── Exports ────────────────────────────────────────────────────

export { type ScanPattern };
