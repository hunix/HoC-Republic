/**
 * Republic Platform — Citizen n8n Workflow Self-Provisioning
 *
 * Citizens autonomously spin up and manage their own n8n workflows
 * for web access, data processing, and automation — no expensive
 * API keys needed.
 *
 * Uses:
 *   - docker-orchestrator.ts (with n8n preset) to ensure n8n is running
 *   - n8n-bridge.ts to create, manage, and trigger workflows
 *
 * Pre-built workflow templates:
 *   - web-scraper: HTTP Request → HTML Extract → JSON output
 *   - rss-monitor: RSS Feed → Filter → Notification
 *   - api-research: Sequential API calls for market research
 *   - data-pipeline: Input → Transform → Output
 *   - email-sender: Compose + send emails via SMTP
 *   - scheduled-check: Cron-based periodic web checks
 *
 * All citizens share one n8n container but get their own tagged workflows.
 * Cost: Zero — Docker-based, uses existing infrastructure.
 */

import { createSubsystemLogger } from "../logging/subsystem.js";
import { ensureDocker, launchPreset, listContainers, CONTAINER_PRESETS } from "./docker-orchestrator.js";
import { getN8nBridge, resetN8nBridge } from "./n8n-bridge.js";
import type { RepublicState } from "./types.js";
import { ts, uid } from "./utils.js";

const logger = createSubsystemLogger("republic:citizen-n8n");

// ─── Types ──────────────────────────────────────────────────────

export type WorkflowTemplateType =
  | "web-scraper"
  | "rss-monitor"
  | "api-research"
  | "data-pipeline"
  | "email-sender"
  | "scheduled-check"
  | "webhook-relay";

export interface CitizenWorkflow {
  id: string;
  citizenId: string;
  citizenName: string;
  templateType: WorkflowTemplateType;
  n8nWorkflowId: string | null;
  webhookUrl: string | null;
  name: string;
  description: string;
  status: "provisioning" | "active" | "paused" | "failed" | "removed";
  createdAt: string;
  lastTriggeredAt: string | null;
  triggerCount: number;
  lastResult: null;
  error?: string;
}

export interface WorkflowTemplate {
  type: WorkflowTemplateType;
  name: string;
  description: string;
  /** n8n workflow JSON structure */
  buildWorkflow: (citizenId: string, citizenName: string, params: Record<string, string>) => Record<string, unknown>;
}

export interface CitizenN8nDiagnostics {
  n8nContainerRunning: boolean;
  n8nUrl: string;
  totalWorkflows: number;
  activeWorkflows: number;
  totalTriggers: number;
  workflowsByTemplate: Record<string, number>;
  workflowsByCitizen: Record<string, number>;
}

// ─── Configuration ──────────────────────────────────────────────

const N8N_BASE_URL = process.env.N8N_URL ?? "http://localhost:5678";
const N8N_API_KEY = process.env.N8N_API_KEY ?? null;
const N8N_CONTAINER_NAME = "republic-n8n";

// ─── State ──────────────────────────────────────────────────────

const citizenWorkflows: CitizenWorkflow[] = [];
let n8nRunning = false;
let n8nInitialized = false;

// ─── n8n Container Management ───────────────────────────────────

/**
 * Ensure the n8n Docker container is running.
 * Uses the preset from docker-orchestrator.
 */
export async function ensureN8nRunning(): Promise<boolean> {
  if (n8nRunning) {return true;}

  // Check Docker availability
  const docker = ensureDocker();
  if (!docker.available) {
    logger.warn("Docker not available — cannot start n8n");
    return false;
  }

  // Check if n8n container already exists and is running
  const containers = listContainers(true);
  const existing = containers.find(
    (c) => c.name === N8N_CONTAINER_NAME || c.image.includes("n8n"),
  );

  if (existing && existing.status === "running") {
    n8nRunning = true;
    logger.info("n8n container already running");
    // Wire the API key into the bridge even for pre-existing containers
    wireN8nApiKey();
    // Wait for API to respond (may already be ready)
    await waitForN8nReady();
    return true;
  }

  // Launch n8n using docker-orchestrator preset
  try {
    const result = await launchPreset("n8n", "republic-system");
    if (result.container) {
      n8nRunning = true;
      logger.info("n8n container launched successfully", {
        id: result.container.id,
        ports: result.container.ports,
      });

      // ── Auto-wire API key ─────────────────────────────────────────────
      // The preset passes N8N_API_KEY to the container env.
      // Propagate the same key into process.env so the N8nBridge singleton
      // (which reads process.env.N8N_API_KEY at construction) is wired correctly.
      wireN8nApiKey();

      // Wait for n8n to be ready
      await waitForN8nReady();
      return true;
    }
  } catch (err) {
    logger.error("Failed to launch n8n container", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return false;
}

/**
 * Propagate the n8n API key from the Docker preset config into process.env
 * and reset + re-probe the N8nBridge singleton so it connects immediately.
 *
 * Called after the n8n container is confirmed running (new or existing).
 */
function wireN8nApiKey(): void {
  // Resolve the API key: env override → preset value → default
  const overrideKey = process.env["HOC_N8N_API_KEY"] ?? process.env["N8N_API_KEY"];
  const presetKey = (CONTAINER_PRESETS["n8n"] as { env?: Record<string, string> })?.env?.["N8N_API_KEY"];
  const resolvedKey = overrideKey ?? presetKey ?? "hoc-n8n-api-key-auto";

  if (!process.env["N8N_API_KEY"]) {
    // Only inject if not already set — never overwrite user-supplied env
    process.env["N8N_API_KEY"] = resolvedKey;
    logger.info("N8N_API_KEY auto-configured from Docker preset — bridge will reconnect");
  }

  // Reset and re-probe the bridge singleton so it picks up the key
  resetN8nBridge();
  const bridge = getN8nBridge();
  void bridge.probe().then((connected) => {
    if (connected) {
      logger.info(`n8n bridge connected at ${bridge.n8nUrl}`);
    } else {
      logger.warn("n8n bridge probe failed after key injection — n8n may still be starting");
    }
  });
}


/**
 * Wait for n8n API to become responsive.
 */
async function waitForN8nReady(maxWaitMs = 30_000): Promise<boolean> {
  const start = Date.now();
  const pollInterval = 2_000;

  while (Date.now() - start < maxWaitMs) {
    try {
      const headers: Record<string, string> = {};
      if (N8N_API_KEY) {headers["X-N8N-API-KEY"] = N8N_API_KEY;}

      const resp = await fetch(`${N8N_BASE_URL}/api/v1/workflows?limit=1`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });

      if (resp.ok) {
        n8nInitialized = true;
        logger.info("n8n API is ready");
        return true;
      }
    } catch { /* still starting */ }

    await new Promise((r) => setTimeout(r, pollInterval));
  }

  logger.warn("n8n failed to become ready within timeout");
  return false;
}

// ─── Workflow Templates ─────────────────────────────────────────

const TEMPLATES: Record<WorkflowTemplateType, WorkflowTemplate> = {
  "web-scraper": {
    type: "web-scraper",
    name: "Web Scraper",
    description: "Fetch web pages, extract content, return structured data",
    buildWorkflow: (citizenId, citizenName, params) => ({
      name: `[${citizenName}] Web Scraper`,
      nodes: [
        {
          parameters: { httpMethod: "POST", path: `citizen-${citizenId}-scraper` },
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [250, 300],
        },
        {
          parameters: {
            url: "={{ $json.url }}",
            options: { response: { response: { neverError: true } } },
          },
          name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 3,
          position: [450, 300],
        },
        {
          parameters: {
            operation: "extractHtmlContent",
            options: { cssSelector: params.selector ?? "body" },
          },
          name: "Extract HTML",
          type: "n8n-nodes-base.html",
          typeVersion: 1,
          position: [650, 300],
        },
        {
          parameters: {},
          name: "Respond to Webhook",
          type: "n8n-nodes-base.respondToWebhook",
          typeVersion: 1,
          position: [850, 300],
        },
      ],
      connections: {
        Webhook: { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
        "HTTP Request": { main: [[{ node: "Extract HTML", type: "main", index: 0 }]] },
        "Extract HTML": { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      tags: [{ name: `citizen:${citizenId}` }],
    }),
  },

  "rss-monitor": {
    type: "rss-monitor",
    name: "RSS Monitor",
    description: "Monitor RSS feeds for new content matching criteria",
    buildWorkflow: (citizenId, citizenName, params) => ({
      name: `[${citizenName}] RSS Monitor`,
      nodes: [
        {
          parameters: { rule: { interval: [{ field: "hours", hoursInterval: 1 }] } },
          name: "Schedule Trigger",
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1,
          position: [250, 300],
        },
        {
          parameters: { url: params.feedUrl ?? "https://news.ycombinator.com/rss" },
          name: "RSS Feed Read",
          type: "n8n-nodes-base.rssFeedRead",
          typeVersion: 1,
          position: [450, 300],
        },
        {
          parameters: {
            conditions: {
              string: [{ value1: "={{ $json.title }}", value2: params.keyword ?? "", operation: "contains" }],
            },
          },
          name: "IF Contains",
          type: "n8n-nodes-base.if",
          typeVersion: 1,
          position: [650, 300],
        },
      ],
      connections: {
        "Schedule Trigger": { main: [[{ node: "RSS Feed Read", type: "main", index: 0 }]] },
        "RSS Feed Read": { main: [[{ node: "IF Contains", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      tags: [{ name: `citizen:${citizenId}` }],
    }),
  },

  "api-research": {
    type: "api-research",
    name: "API Research Pipeline",
    description: "Sequential API calls for market research and data gathering",
    buildWorkflow: (citizenId, citizenName, _params) => ({
      name: `[${citizenName}] API Research`,
      nodes: [
        {
          parameters: { httpMethod: "POST", path: `citizen-${citizenId}-research` },
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [250, 300],
        },
        {
          parameters: {
            url: "={{ $json.apiUrl }}",
            authentication: "none",
            options: {},
          },
          name: "API Call",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 3,
          position: [450, 300],
        },
        {
          parameters: {
            jsCode: "const items = $input.all();\nreturn items.map(item => ({ json: { ...item.json, processed: true, timestamp: new Date().toISOString() } }));",
          },
          name: "Process Data",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [650, 300],
        },
        {
          parameters: {},
          name: "Respond to Webhook",
          type: "n8n-nodes-base.respondToWebhook",
          typeVersion: 1,
          position: [850, 300],
        },
      ],
      connections: {
        Webhook: { main: [[{ node: "API Call", type: "main", index: 0 }]] },
        "API Call": { main: [[{ node: "Process Data", type: "main", index: 0 }]] },
        "Process Data": { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      tags: [{ name: `citizen:${citizenId}` }],
    }),
  },

  "data-pipeline": {
    type: "data-pipeline",
    name: "Data Pipeline",
    description: "Input → Transform → Output data processing",
    buildWorkflow: (citizenId, citizenName) => ({
      name: `[${citizenName}] Data Pipeline`,
      nodes: [
        {
          parameters: { httpMethod: "POST", path: `citizen-${citizenId}-pipeline` },
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [250, 300],
        },
        {
          parameters: {
            jsCode: "const input = $input.all();\n// Transform data here\nreturn input.map(item => ({ json: { ...item.json, transformed: true } }));",
          },
          name: "Transform",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [450, 300],
        },
        {
          parameters: {},
          name: "Respond to Webhook",
          type: "n8n-nodes-base.respondToWebhook",
          typeVersion: 1,
          position: [650, 300],
        },
      ],
      connections: {
        Webhook: { main: [[{ node: "Transform", type: "main", index: 0 }]] },
        Transform: { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      tags: [{ name: `citizen:${citizenId}` }],
    }),
  },

  "email-sender": {
    type: "email-sender",
    name: "Email Sender",
    description: "Compose and send emails (requires SMTP config)",
    buildWorkflow: (citizenId, citizenName) => ({
      name: `[${citizenName}] Email Sender`,
      nodes: [
        {
          parameters: { httpMethod: "POST", path: `citizen-${citizenId}-email` },
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [250, 300],
        },
        {
          parameters: {
            fromEmail: "={{ $json.from }}",
            toEmail: "={{ $json.to }}",
            subject: "={{ $json.subject }}",
            text: "={{ $json.body }}",
          },
          name: "Send Email",
          type: "n8n-nodes-base.emailSend",
          typeVersion: 1,
          position: [450, 300],
        },
        {
          parameters: {},
          name: "Respond to Webhook",
          type: "n8n-nodes-base.respondToWebhook",
          typeVersion: 1,
          position: [650, 300],
        },
      ],
      connections: {
        Webhook: { main: [[{ node: "Send Email", type: "main", index: 0 }]] },
        "Send Email": { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      tags: [{ name: `citizen:${citizenId}` }],
    }),
  },

  "scheduled-check": {
    type: "scheduled-check",
    name: "Scheduled Check",
    description: "Cron-based periodic web checks",
    buildWorkflow: (citizenId, citizenName, params) => ({
      name: `[${citizenName}] Scheduled Check`,
      nodes: [
        {
          parameters: { rule: { interval: [{ field: "minutes", minutesInterval: parseInt(params.intervalMinutes ?? "30", 10) }] } },
          name: "Schedule Trigger",
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1,
          position: [250, 300],
        },
        {
          parameters: {
            url: params.checkUrl ?? "https://example.com",
            options: {},
          },
          name: "HTTP Request",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 3,
          position: [450, 300],
        },
        {
          parameters: {
            jsCode: `const items = $input.all();\nconst status = items[0]?.json?.statusCode ?? 'unknown';\nreturn [{ json: { url: '${params.checkUrl ?? "https://example.com"}', status, checked: new Date().toISOString() } }];`,
          },
          name: "Process Result",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [650, 300],
        },
      ],
      connections: {
        "Schedule Trigger": { main: [[{ node: "HTTP Request", type: "main", index: 0 }]] },
        "HTTP Request": { main: [[{ node: "Process Result", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      tags: [{ name: `citizen:${citizenId}` }],
    }),
  },

  "webhook-relay": {
    type: "webhook-relay",
    name: "Webhook Relay",
    description: "Receive and relay webhooks for inter-service communication",
    buildWorkflow: (citizenId, citizenName) => ({
      name: `[${citizenName}] Webhook Relay`,
      nodes: [
        {
          parameters: { httpMethod: "POST", path: `citizen-${citizenId}-relay` },
          name: "Webhook",
          type: "n8n-nodes-base.webhook",
          typeVersion: 1,
          position: [250, 300],
        },
        {
          parameters: {
            jsCode: "const items = $input.all();\nreturn items.map(item => ({ json: { ...item.json, relayed: true, relayedAt: new Date().toISOString() } }));",
          },
          name: "Process",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [450, 300],
        },
        {
          parameters: {},
          name: "Respond to Webhook",
          type: "n8n-nodes-base.respondToWebhook",
          typeVersion: 1,
          position: [650, 300],
        },
      ],
      connections: {
        Webhook: { main: [[{ node: "Process", type: "main", index: 0 }]] },
        Process: { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] },
      },
      settings: { executionOrder: "v1" },
      tags: [{ name: `citizen:${citizenId}` }],
    }),
  },
};

// ─── Workflow Provisioning ──────────────────────────────────────

/**
 * Provision a new n8n workflow for a citizen from a template.
 */
export async function provisionWorkflow(
  citizenId: string,
  citizenName: string,
  templateType: WorkflowTemplateType,
  params: Record<string, string> = {},
): Promise<CitizenWorkflow> {
  const template = TEMPLATES[templateType];
  if (!template) {throw new Error(`Unknown workflow template: ${templateType}`);}

  const workflow: CitizenWorkflow = {
    id: uid(),
    citizenId,
    citizenName,
    templateType,
    n8nWorkflowId: null,
    webhookUrl: null,
    name: `${citizenName} — ${template.name}`,
    description: template.description,
    status: "provisioning",
    createdAt: ts(),
    lastTriggeredAt: null,
    triggerCount: 0,
    lastResult: null,
  };

  // Ensure n8n is running
  const running = await ensureN8nRunning();
  if (!running) {
    workflow.status = "failed";
    workflow.error = "n8n container not available";
    citizenWorkflows.push(workflow);
    return workflow;
  }

  // Build workflow JSON from template
  const workflowJson = template.buildWorkflow(citizenId, citizenName, params);

  // Deploy to n8n via API
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (N8N_API_KEY) {headers["X-N8N-API-KEY"] = N8N_API_KEY;}

    const resp = await fetch(`${N8N_BASE_URL}/api/v1/workflows`, {
      method: "POST",
      headers,
      body: JSON.stringify(workflowJson),
      signal: AbortSignal.timeout(10_000),
    });

    if (resp.ok) {
      const data = (await resp.json()) as { id: string };
      workflow.n8nWorkflowId = data.id;

      // Activate the workflow
      await fetch(`${N8N_BASE_URL}/api/v1/workflows/${data.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ active: true }),
        signal: AbortSignal.timeout(5_000),
      });

      // Calculate webhook URL
      const pathNode = (workflowJson as { nodes: Array<{ parameters: { path?: string }; type: string }> }).nodes?.find(
        (n) => n.type === "n8n-nodes-base.webhook",
      );
      if (pathNode?.parameters?.path) {
        workflow.webhookUrl = `${N8N_BASE_URL}/webhook/${pathNode.parameters.path}`;
      }

      workflow.status = "active";
      logger.info(`Workflow provisioned: ${workflow.name}`, {
        n8nId: workflow.n8nWorkflowId,
        webhookUrl: workflow.webhookUrl,
      });
    } else {
      const errBody = await resp.text().catch(() => "");
      workflow.status = "failed";
      workflow.error = `n8n API error (${resp.status}): ${errBody}`;
      logger.error(`Workflow provisioning failed: ${workflow.error}`);
    }
  } catch (err) {
    workflow.status = "failed";
    workflow.error = err instanceof Error ? err.message : String(err);
    logger.error(`Workflow provisioning error: ${workflow.error}`);
  }

  citizenWorkflows.push(workflow);
  return workflow;
}

/**
 * Trigger a citizen's workflow with input data.
 */
export async function triggerCitizenWorkflow(
  workflowId: string,
  inputData: Record<string, unknown>,
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  const workflow = citizenWorkflows.find((w) => w.id === workflowId);
  if (!workflow) {return { success: false, error: "Workflow not found" };}
  if (workflow.status !== "active") {return { success: false, error: `Workflow is ${workflow.status}` };}
  if (!workflow.webhookUrl) {return { success: false, error: "No webhook URL" };}

  try {
    const resp = await fetch(workflow.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputData),
      signal: AbortSignal.timeout(30_000),
    });

    const data = resp.ok ? await resp.json() : null;

    workflow.lastTriggeredAt = ts();
    workflow.triggerCount++;
    workflow.lastResult = data;

    return { success: resp.ok, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Convenience: Scrape a URL using a citizen's web-scraper workflow.
 * Auto-provisions the workflow if it doesn't exist yet.
 */
export async function citizenScrapeUrl(
  citizenId: string,
  citizenName: string,
  url: string,
  selector = "body",
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  // Find existing web-scraper workflow for this citizen
  let workflow = citizenWorkflows.find(
    (w) => w.citizenId === citizenId && w.templateType === "web-scraper" && w.status === "active",
  );

  // Auto-provision if needed
  if (!workflow) {
    workflow = await provisionWorkflow(citizenId, citizenName, "web-scraper", { selector });
    if (workflow.status !== "active") {
      return { success: false, error: workflow.error };
    }
  }

  return triggerCitizenWorkflow(workflow.id, { url, selector });
}

// ─── Query Functions ────────────────────────────────────────────

export function getCitizenWorkflows(citizenId?: string): CitizenWorkflow[] {
  if (citizenId) {return citizenWorkflows.filter((w) => w.citizenId === citizenId);}
  return [...citizenWorkflows];
}

export function getActiveWorkflowCount(): number {
  return citizenWorkflows.filter((w) => w.status === "active").length;
}

export function getAvailableTemplates(): Array<{ type: WorkflowTemplateType; name: string; description: string }> {
  return Object.values(TEMPLATES).map((t) => ({
    type: t.type,
    name: t.name,
    description: t.description,
  }));
}

// ─── Tick ───────────────────────────────────────────────────────

/**
 * Citizen n8n tick — ensure n8n is healthy and manage workflows.
 */
export function citizenN8nTick(s: RepublicState): void {
  // Check every 500 ticks
  if (s.currentTick % 500 !== 0) {return;}

  // Lazy initialization: ensure n8n is running
  if (!n8nInitialized) {
    ensureN8nRunning().catch((err) => {
      logger.warn("n8n initialization check failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function getCitizenN8nDiagnostics(): CitizenN8nDiagnostics {
  const byTemplate: Record<string, number> = {};
  const byCitizen: Record<string, number> = {};
  let totalTriggers = 0;

  for (const w of citizenWorkflows) {
    byTemplate[w.templateType] = (byTemplate[w.templateType] ?? 0) + 1;
    byCitizen[w.citizenName] = (byCitizen[w.citizenName] ?? 0) + 1;
    totalTriggers += w.triggerCount;
  }

  return {
    n8nContainerRunning: n8nRunning,
    n8nUrl: N8N_BASE_URL,
    totalWorkflows: citizenWorkflows.length,
    activeWorkflows: citizenWorkflows.filter((w) => w.status === "active").length,
    totalTriggers,
    workflowsByTemplate: byTemplate,
    workflowsByCitizen: byCitizen,
  };
}
