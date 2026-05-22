/**
 * Republic Platform — Agent-to-Agent (A2A) Protocol Engine
 *
 * Phase AGI-11: Formalized Inter-Citizen Communication.
 *
 * Inspired by:
 *   - Google A2A Protocol (April 2025)
 *   - MIT Nanda Project — agent discovery & capability exchange
 *   - DARPA CREATE — composable agent architectures
 *
 * Features:
 *   1. Capability registry — each citizen advertises what they can do
 *   2. Capability discovery — find citizens who can help with a task
 *   3. Service request/response lifecycle
 *   4. Broadcast messaging for announcements
 *   5. Quality scoring and reputation tracking
 */

import type { Citizen, RepublicState } from "./types.js";
import { rng, uid } from "./utils.js";

// ─── Configuration ──────────────────────────────────────────────

const A2A_TICK_INTERVAL = 10;
const MAX_MESSAGES = 300;
const MAX_CAPABILITIES_PER_CITIZEN = 10;

// ─── Types ──────────────────────────────────────────────────────

export interface AgentCapability {
  name: string;
  domain: string;
  inputSchema: Record<string, string>;
  outputSchema: Record<string, string>;
  qualityScore: number;
}

export interface A2AMessage {
  id: string;
  from: string;
  to: string;
  type: "request" | "response" | "broadcast" | "capability_query";
  capability?: string;
  payload: unknown;
  priority: number;
  timestamp: number;
  status: "pending" | "delivered" | "completed" | "failed";
}

export interface ServiceRequest {
  id: string;
  requesterId: string;
  providerId: string;
  capability: string;
  payload: unknown;
  result?: unknown;
  quality: number;
  status: "pending" | "in_progress" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
}

export interface A2ADiagnostics {
  registeredCapabilities: number;
  totalMessages: number;
  pendingRequests: number;
  completedRequests: number;
  avgServiceQuality: number;
}

// ─── Transport Layer ────────────────────────────────────────────

/**
 * A2A Transport — abstract interface for cross-process/network messaging.
 *
 * Implementations can use HTTP, WebSocket, or any other transport.
 * The default in-memory message queue is the fallback when no transport is set.
 */
export interface A2ATransport {
  /** Send a message to a remote endpoint. Returns true if sent successfully. */
  send(endpoint: string, message: A2AMessage): Promise<boolean>;
  /** Start listening for incoming messages on a port. */
  listen(port: number, handler: (msg: A2AMessage) => void): Promise<void>;
  /** Stop listening. */
  close(): Promise<void>;
}

/**
 * HTTP-based A2A transport using `node:http`.
 *
 * Sends messages as POST requests with JSON body to remote endpoints.
 * Can optionally listen on a port for incoming messages.
 */
export class HttpA2ATransport implements A2ATransport {
  private server: import("node:http").Server | null = null;

  async send(endpoint: string, message: A2AMessage): Promise<boolean> {
    try {
      const { request } = await import("node:http");
      const url = new URL(endpoint);

      return new Promise((resolve) => {
        const req = request(
          {
            hostname: url.hostname,
            port: url.port || 80,
            path: url.pathname,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            timeout: 5_000,
          },
          (res) => {
            res.resume(); // Consume response
            resolve(res.statusCode === 200);
          },
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
        req.end(JSON.stringify(message));
      });
    } catch {
      return false;
    }
  }

  async listen(port: number, handler: (msg: A2AMessage) => void): Promise<void> {
    const { createServer } = await import("node:http");
    this.server = createServer((req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
      }
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf-8");
          const msg = JSON.parse(body) as A2AMessage;
          handler(msg);
          res.writeHead(200);
          res.end("ok");
        } catch {
          res.writeHead(400);
          res.end("invalid");
        }
      });
    });
    return new Promise<void>((resolve) => {
      this.server!.listen(port, () => resolve());
    });
  }

  async close(): Promise<void> {
    if (this.server) {
      return new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
        this.server = null;
      });
    }
  }
}

/** Map of remote citizen IDs to their transport endpoints */
const remoteNodeMap = new Map<string, { endpoint: string; transport: A2ATransport }>();

/** Register a remote node so messages can be routed to it */
export function registerRemoteNode(
  citizenId: string,
  endpoint: string,
  transport?: A2ATransport,
): void {
  remoteNodeMap.set(citizenId, {
    endpoint,
    transport: transport ?? new HttpA2ATransport(),
  });
}

/** Unregister a remote node */
export function unregisterRemoteNode(citizenId: string): void {
  remoteNodeMap.delete(citizenId);
}

/** Check if a citizen is on a remote node */
export function isRemoteCitizen(citizenId: string): boolean {
  return remoteNodeMap.has(citizenId);
}

// ─── State ──────────────────────────────────────────────────────

const capabilityRegistry = new Map<string, AgentCapability[]>();
const messageQueue: A2AMessage[] = [];
const serviceRequests: ServiceRequest[] = [];
const citizenReputation = new Map<string, number>();

// ─── Capability Registration ────────────────────────────────────

/** Register capabilities from a citizen's skills */
function registerCapabilities(citizen: Citizen): void {
  const capabilities: AgentCapability[] = [];

  for (const skill of citizen.skills.slice(0, MAX_CAPABILITIES_PER_CITIZEN)) {
    capabilities.push({
      name: skill,
      domain: citizen.specialization ?? "general",
      inputSchema: { task: "string", context: "string" },
      outputSchema: { result: "string", quality: "number" },
      qualityScore: Math.min(1, (citizen.xp ?? 0) / 100 + 0.3),
    });
  }

  // Add professional certifications as capabilities
  if (citizen.professionalProfile) {
    for (const cert of citizen.professionalProfile.certifications.slice(0, 3)) {
      capabilities.push({
        name: `certified_${cert.domainPath}`,
        domain: cert.domainPath,
        inputSchema: { specializedTask: "string" },
        outputSchema: { expertResult: "string", confidence: "number" },
        qualityScore:
          cert.level === "fellowship"
            ? 0.95
            : cert.level === "doctorate"
              ? 0.9
              : cert.level === "master"
                ? 0.75
                : 0.5,
      });
    }
  }

  capabilityRegistry.set(citizen.id, capabilities);
}

// ─── Discovery ──────────────────────────────────────────────────

/** Discover citizens with a specific capability */
export function discoverCapabilities(
  domain: string,
): Array<{ citizenId: string; capability: AgentCapability }> {
  const results: Array<{ citizenId: string; capability: AgentCapability }> = [];
  for (const [citizenId, capabilities] of capabilityRegistry) {
    for (const cap of capabilities) {
      if (cap.domain === domain || cap.name.includes(domain)) {
        results.push({ citizenId, capability: cap });
      }
    }
  }
  return results.toSorted((a, b) => b.capability.qualityScore - a.capability.qualityScore);
}

// ─── Messaging ──────────────────────────────────────────────────

/** Send an A2A message (routes through transport if recipient is remote) */
export function sendMessage(
  from: string,
  to: string,
  type: A2AMessage["type"],
  payload: unknown,
  capability?: string,
  priority: number = 5,
): A2AMessage {
  const msg: A2AMessage = {
    id: uid(),
    from,
    to,
    type,
    capability,
    payload,
    priority,
    timestamp: Date.now(),
    status: "pending",
  };

  // Route through transport if recipient is on a remote node
  const remote = remoteNodeMap.get(to);
  if (remote) {
    remote.transport.send(remote.endpoint, msg).then((ok) => {
      msg.status = ok ? "delivered" : "failed";
    }).catch(() => {
      msg.status = "failed";
    });
  }

  messageQueue.push(msg);
  if (messageQueue.length > MAX_MESSAGES) {
    messageQueue.shift();
  }
  return msg;
}

/** Request a service from another citizen */
export function requestService(
  requesterId: string,
  providerId: string,
  capability: string,
  payload: unknown,
  tick: number,
): ServiceRequest {
  const request: ServiceRequest = {
    id: uid(),
    requesterId,
    providerId,
    capability,
    payload,
    quality: 0,
    status: "pending",
    createdAt: tick,
  };
  serviceRequests.push(request);

  // Send A2A message
  sendMessage(requesterId, providerId, "request", { requestId: request.id, capability, payload });
  return request;
}

// ─── Request Processing ─────────────────────────────────────────

/** Process pending service requests */
function processRequests(s: RepublicState): void {
  for (const request of serviceRequests) {
    if (request.status !== "pending") {
      continue;
    }

    const provider = s.citizens.find((c) => c.id === request.providerId);
    if (!provider) {
      request.status = "failed";
      continue;
    }

    // Check if provider has the capability
    const caps = capabilityRegistry.get(provider.id) ?? [];
    const matchedCap = caps.find(
      (c) => c.name === request.capability || c.name.includes(request.capability),
    );

    if (!matchedCap) {
      request.status = "failed";
      continue;
    }

    // Simulate service execution
    request.status = "in_progress";

    // Quality = provider's capability score + some noise
    request.quality = Math.max(0, Math.min(1, matchedCap.qualityScore + (rng() - 0.5) * 0.2));

    // Complete the request
    request.status = "completed";
    request.completedAt = s.currentTick;
    request.result = { success: true, quality: request.quality };

    // Send response message
    sendMessage(provider.id, request.requesterId, "response", request.result, request.capability);

    // Update reputation
    const currentRep = citizenReputation.get(provider.id) ?? 0.5;
    citizenReputation.set(provider.id, currentRep * 0.9 + request.quality * 0.1);

    // XP reward for provider
    if (provider.xp !== undefined) {
      provider.xp += Math.floor(request.quality * 3);
    }
  }

  // Cleanup old completed requests
  if (serviceRequests.length > 200) {
    const completed = serviceRequests.filter(
      (r) => r.status === "completed" || r.status === "failed",
    );
    if (completed.length > 100) {
      serviceRequests.splice(
        0,
        serviceRequests.findIndex((r) => r.status === "pending"),
      );
    }
  }
}

// ─── Message Processing ─────────────────────────────────────────

function processMessages(): void {
  for (const msg of messageQueue) {
    if (msg.status === "pending") {
      msg.status = "delivered";
    }
  }
}

// ─── Main Tick ──────────────────────────────────────────────────

/** Main A2A protocol tick */
export function a2aProtocolTick(s: RepublicState): void {
  if (s.currentTick % A2A_TICK_INTERVAL !== 0) {
    return;
  }

  // 1. Update capability registry
  for (const citizen of s.citizens) {
    registerCapabilities(citizen);
  }

  // 2. Process messages
  processMessages();

  // 3. Process service requests
  processRequests(s);

  // 4. Citizens discover and request services
  for (const citizen of s.citizens) {
    if (rng() > 0.1) {
      continue;
    } // 10% chance per citizen

    // Find capability needed based on citizen gaps
    const domains = ["technology", "research", "education", "economy"];
    const neededDomain = domains[Math.floor(rng() * domains.length)];

    const providers = discoverCapabilities(neededDomain);
    if (providers.length > 0) {
      const provider = providers[0]; // Best quality provider
      if (provider.citizenId !== citizen.id) {
        requestService(
          citizen.id,
          provider.citizenId,
          provider.capability.name,
          { task: `Help with ${neededDomain}` },
          s.currentTick,
        );
      }
    }
  }
}

// ─── Diagnostics ────────────────────────────────────────────────

export function a2aDiagnostics(): A2ADiagnostics {
  let capCount = 0;
  for (const caps of capabilityRegistry.values()) {
    capCount += caps.length;
  }
  const completed = serviceRequests.filter((r) => r.status === "completed");
  const avgQuality =
    completed.length > 0 ? completed.reduce((s, r) => s + r.quality, 0) / completed.length : 0;

  return {
    registeredCapabilities: capCount,
    totalMessages: messageQueue.length,
    pendingRequests: serviceRequests.filter((r) => r.status === "pending").length,
    completedRequests: completed.length,
    avgServiceQuality: avgQuality,
  };
}

export function getReputation(citizenId: string): number {
  return citizenReputation.get(citizenId) ?? 0.5;
}
