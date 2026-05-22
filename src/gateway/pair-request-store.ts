/**
 * Pair Request Store (Gateway Side)
 *
 * Manages pending, approved, and rejected node pairing requests.
 * Used by the gateway to display incoming requests in its UI
 * and to approve/reject them, generating tokens for approved nodes.
 */

import crypto from "node:crypto";
import { createSubsystemLogger } from "../logging.js";

const logger = createSubsystemLogger("gateway:pair-store");

// ─── Types ───────────────────────────────────────────────────────

export interface PairRequestEntry {
  nodeId: string;
  displayName: string;
  capabilities: {
    gpus: Array<{ name: string; vramGb: number }>;
    cpuCores: number;
    cpuModel: string;
    ramGb: number;
    platform: string;
    tags: string[];
  };
  callbackUrl: string;
  challenge?: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  approvedAt?: string;
  rejectedAt?: string;
  /** IP address the request came from */
  remoteIp?: string;
}

// ─── Store ───────────────────────────────────────────────────────

/** In-memory store of pair requests. Keyed by nodeId. */
const requests = new Map<string, PairRequestEntry>();

/**
 * Add a new pair request from a node.
 */
export function addPairRequest(entry: Omit<PairRequestEntry, "status">): PairRequestEntry {
  const existing = requests.get(entry.nodeId);

  // If already approved, return existing
  if (existing?.status === "approved") {
    logger.info("Node already paired, returning existing approval", { nodeId: entry.nodeId });
    return existing;
  }

  const request: PairRequestEntry = {
    ...entry,
    status: "pending",
  };

  requests.set(entry.nodeId, request);
  logger.info("New pair request received", {
    nodeId: entry.nodeId,
    displayName: entry.displayName,
    gpus: entry.capabilities.gpus.length,
    ramGb: entry.capabilities.ramGb,
  });

  return request;
}

/**
 * List all pair requests, optionally filtered by status.
 */
export function listPairRequests(
  statusFilter?: "pending" | "approved" | "rejected",
): PairRequestEntry[] {
  const all = Array.from(requests.values());
  if (!statusFilter) {
    return all;
  }
  return all.filter((r) => r.status === statusFilter);
}

/**
 * Get a specific pair request.
 */
export function getPairRequest(nodeId: string): PairRequestEntry | undefined {
  return requests.get(nodeId);
}

/**
 * Approve a pair request and generate a token.
 * Optionally sends the token to the node's callback URL.
 */
export async function approvePairRequest(
  nodeId: string,
  gatewayUrl: string,
): Promise<{ ok: boolean; token?: string; error?: string }> {
  const request = requests.get(nodeId);
  if (!request) {
    return { ok: false, error: "Pair request not found" };
  }

  if (request.status === "approved") {
    return { ok: false, error: "Already approved" };
  }

  // Generate a scoped auth token
  const token = generateNodeAuthToken(nodeId);

  request.status = "approved";
  request.approvedAt = new Date().toISOString();

  logger.info("Pair request approved, sending token to node", {
    nodeId,
    callbackUrl: request.callbackUrl,
  });

  // Send the token to the node's callback URL
  try {
    const response = await fetch(request.callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId,
        token,
        gatewayUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error("Failed to deliver token to node", {
        nodeId,
        status: response.status,
        body: text,
      });
      return { ok: false, error: `Node callback failed: ${response.status}` };
    }

    logger.info("Token delivered to node successfully", { nodeId });
    return { ok: true, token };
  } catch (err) {
    logger.error("Failed to reach node callback", { nodeId, error: String(err) });
    return {
      ok: false,
      token,
      error: `Failed to reach node: ${String(err)}. Token generated: ${token}`,
    };
  }
}

/**
 * Reject a pair request.
 */
export function rejectPairRequest(nodeId: string): boolean {
  const request = requests.get(nodeId);
  if (!request) {
    return false;
  }

  request.status = "rejected";
  request.rejectedAt = new Date().toISOString();

  logger.info("Pair request rejected", { nodeId });
  return true;
}

/**
 * Remove a pair request (cleanup).
 */
export function removePairRequest(nodeId: string): boolean {
  return requests.delete(nodeId);
}

// ─── Token Generation ───────────────────────────────────────────

function generateNodeAuthToken(nodeId: string): string {
  const payload = {
    type: "node",
    nodeId,
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json).toString("base64url");
  const secret =
    process.env.OPENCLAW_CLUSTER_SECRET ??
    process.env.OPENCLAW_GATEWAY_TOKEN ??
    "hoc_default_cluster_secret_for_auto_discovery";
  const hmac = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `hoc_node_${b64}.${hmac}`;
}
